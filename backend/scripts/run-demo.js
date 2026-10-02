// Starts a tiny local website full of deliberate bugs and runs the QA bot against it.
//   npm run demo   (add -- --open to open the report)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/scanner/config.js';
import { runQA } from '../src/scanner/runner.js';
import { startDemoServer } from '../tests/fixtures/demo-server.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures');
const site = await startDemoServer(4321);
console.log(`Demo site running at ${site.url}`);

const cfg = loadConfig({
  config: path.join(fixturesDir, 'qa.demo.json'),
  overrides: { url: site.url, open: process.argv.includes('--open'), ai: { enabled: process.argv.includes('--ai') } },
});
try {
  await runQA(cfg);
} finally {
  await site.close();
}
