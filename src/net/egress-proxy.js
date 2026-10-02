// A small HTTP/HTTPS forward proxy that only lets the browser reach public internet addresses.
//
// The hosted service scans URLs submitted by users. Without this, a user could point a scan at
// http://localhost, a cloud metadata endpoint (169.254.169.254) or another machine on the private
// network. Every request the browser makes, including redirects, subresources and websockets,
// goes through this proxy. Hostnames are resolved here and the connection is made to the resolved
// IP, so DNS rebinding cannot swap in a private address after the check.

import http from 'node:http';
import net from 'node:net';
import dns from 'node:dns/promises';

const blocked = new net.BlockList();
// IPv4 ranges that are not publicly routable
for (const [addr, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(addr, prefix, 'ipv4');
// IPv6 loopback, unspecified, unique-local, link-local, multicast, documentation
blocked.addAddress('::1', 'ipv6');
blocked.addAddress('::', 'ipv6');
for (const [addr, prefix] of [['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32], ['64:ff9b::', 96]]) {
  blocked.addSubnet(addr, prefix, 'ipv6');
}

/** True when the IP address is publicly routable. */
export function isPublicAddress(address) {
  const family = net.isIP(address);
  if (!family) return false;
  // IPv4-mapped IPv6 (::ffff:10.0.0.1) must be checked as IPv4
  const mapped = family === 6 && /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return !blocked.check(mapped[1], 'ipv4');
  return !blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

/**
 * Resolve a hostname and return an address the caller may connect to, or null when blocked.
 * Every resolved address must be allowed, so a hostname cannot mix public and private records.
 */
export async function resolveAllowed(hostname, allow = ({ address }) => isPublicAddress(address)) {
  const host = hostname.replace(/^\[|\]$/g, '');
  let records;
  if (net.isIP(host)) records = [{ address: host, family: net.isIP(host) }];
  else {
    try {
      records = await dns.lookup(host, { all: true, verbatim: true });
    } catch {
      return null;
    }
  }
  if (!records.length) return null;
  for (const r of records) if (!allow({ hostname: host, address: r.address })) return null;
  return records[0].address;
}

/** Returns an async (url) => boolean check using the same rules as the proxy. */
export function createUrlGuard(allow) {
  return async (rawUrl) => {
    let u;
    try { u = new URL(rawUrl); } catch { return false; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return (await resolveAllowed(u.hostname, allow)) !== null;
  };
}

/**
 * Start the proxy on a random local port.
 * @param {object} [opts]
 * @param {(target: {hostname: string, address: string}) => boolean} [opts.allow] custom policy (tests)
 * @returns {Promise<{ url: string, close: () => Promise<void>, blockedCount: () => number }>}
 */
export async function startEgressProxy({ allow } = {}) {
  let blockedRequests = 0;
  // CONNECT tunnels are detached from the HTTP server, so track them to close them on shutdown.
  const tunnels = new Set();
  const policy = allow || (({ address }) => isPublicAddress(address));

  const deny = (res, reason) => {
    blockedRequests++;
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end(`Blocked by QA Automation network policy: ${reason}`);
  };

  // Plain HTTP: the browser sends the absolute URL in the request line
  const server = http.createServer(async (req, res) => {
    let target;
    try { target = new URL(req.url); } catch { return deny(res, 'invalid URL'); }
    if (target.protocol !== 'http:') return deny(res, 'unsupported protocol');
    const address = await resolveAllowed(target.hostname, policy);
    if (!address) return deny(res, `${target.hostname} is not a public address`);

    const headers = { ...req.headers };
    delete headers['proxy-connection'];
    delete headers['proxy-authorization'];
    const upstream = http.request({
      host: address,
      port: target.port || 80,
      method: req.method,
      path: target.pathname + target.search,
      headers,
    }, (up) => {
      res.writeHead(up.statusCode, up.headers);
      up.pipe(res);
    });
    upstream.setTimeout(30000, () => upstream.destroy(new Error('upstream timeout')));
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(upstream);
  });

  // HTTPS and websockets: CONNECT host:port, then a raw TCP tunnel
  server.on('connect', async (req, clientSocket, head) => {
    tunnels.add(clientSocket);
    clientSocket.on('close', () => tunnels.delete(clientSocket));
    clientSocket.on('error', () => {});
    const m = /^\[?([^\]]+?)\]?:(\d+)$/.exec(req.url || '');
    if (!m) { clientSocket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
    const [, hostname, port] = m;
    const address = await resolveAllowed(hostname, policy);
    if (!address) {
      blockedRequests++;
      clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const upstream = net.connect(Number(port), address, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.setTimeout(60000, () => upstream.destroy());
    upstream.on('error', () => clientSocket.destroy());
    clientSocket.on('close', () => upstream.destroy());
  });

  server.on('clientError', (err, socket) => socket.destroy());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}`,
    blockedCount: () => blockedRequests,
    close: () => new Promise((resolve) => {
      for (const socket of tunnels) socket.destroy();
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}
