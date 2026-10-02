import { loadDotEnv, readConfig } from './config.js';
import { openDatabase } from './db.js';
import { createApp } from './app.js';
import { startWorker } from './worker.js';

loadDotEnv();
const config = readConfig();
const db = openDatabase(config.dbFile);

if (config.production && config.allowPrivateUrls) {
  console.warn('WARNING: ALLOW_PRIVATE_URLS is enabled in production. Users can scan your internal network.');
}

let server;
let worker;

if (config.role === 'web' || config.role === 'all') {
  const app = createApp({ db, config });
  server = app.listen(config.port, config.host, () => {
    console.log(`QA Automation web app running at ${config.appUrl} (role: ${config.role})`);
  });
}

if (config.role === 'worker' || config.role === 'all') {
  worker = await startWorker({ db, config });
  console.log(`Scan worker started (concurrency ${config.workerConcurrency})`);
}

async function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server?.close();
  await worker?.stop();
  db.close();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
