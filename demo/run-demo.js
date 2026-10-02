// Starts a tiny local website full of deliberate bugs and runs the QA bot against it.
//   npm run demo
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { runQA } from '../src/runner.js';
import { startDemoServer } from './server.js';

const demoDir = path.dirname(fileURLToPath(import.meta.url));
const site = await startDemoServer(4321);
console.log(`Demo site running at ${site.url}`);

const cfg = loadConfig({
  config: path.join(demoDir, 'qa.demo.json'),
  overrides: { url: site.url, open: process.argv.includes('--open'), ai: { enabled: process.argv.includes('--ai') } },
});
try {
  await runQA(cfg);
} finally {
  await site.close();
}
