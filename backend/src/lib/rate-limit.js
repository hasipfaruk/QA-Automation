/**
 * Fixed-window rate limiter kept in memory. Suitable for a single web process;
 * use a shared store such as Redis when running several web servers.
 *
 * @returns {(key: string) => { allowed: boolean, retryAfterSec: number }}
 */
export function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();

  return (key) => {
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    return { allowed: entry.count <= max, retryAfterSec: Math.ceil((entry.reset - now) / 1000) };
  };
}
