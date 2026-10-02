import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from 'playwright';
import { startEgressProxy } from '../backend/scanner/net/egress-proxy.js';

test('egress proxy blocks redirects and subresources to disallowed hosts', { timeout: 60000 }, async () => {
  let secretHits = 0;
  let port;
  const site = http.createServer((req, res) => {
    if (req.url === '/go') {
      res.writeHead(302, { location: `http://127.0.0.1:${port}/secret` });
      return res.end();
    }
    if (req.url === '/secret') {
      secretHits++;
      return res.end('SECRET');
    }
    res.end(`<h1>hello</h1><img src="http://127.0.0.1:${port}/secret">`);
  });
  await new Promise((resolve) => site.listen(0, resolve));
  port = site.address().port;

  // Policy for the test: the hostname "localhost" is allowed, the raw IP 127.0.0.1 is not.
  const proxy = await startEgressProxy({ allow: ({ hostname }) => hostname === 'localhost' });
  const browser = await chromium.launch({ channel: 'chromium', proxy: { server: proxy.url, bypass: '<-loopback>' } });
  try {
    const page = await browser.newPage();
    const ok = await page.goto(`http://localhost:${port}/`);
    assert.equal(ok.status(), 200);
    assert.equal(await page.textContent('h1'), 'hello');

    const redirected = await page.goto(`http://localhost:${port}/go`);
    assert.equal(redirected.status(), 403);

    const direct = await page.goto(`http://127.0.0.1:${port}/secret`);
    assert.equal(direct.status(), 403);

    assert.equal(secretHits, 0, 'the blocked endpoint must never be reached');
    assert.ok(proxy.blockedCount() >= 3);
  } finally {
    await browser.close();
    await proxy.close();
    site.close();
  }
});
