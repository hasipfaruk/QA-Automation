// Starts a tiny local website full of deliberate bugs and runs the QA bot against it.
//   npm run demo
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { runQA } from '../src/runner.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'site');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(root, p === '/' ? 'index.html' : p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('Not found');
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

await new Promise((r) => server.listen(4321, r));
const url = 'http://localhost:4321/';
console.log(`Demo site running at ${url}`);

const cfg = loadConfig({
  config: path.join(path.dirname(root), 'qa.demo.json'),
  overrides: { url, open: process.argv.includes('--open'), ai: { enabled: process.argv.includes('--ai') } },
});
try {
  await runQA(cfg);
} finally {
  server.close();
}
