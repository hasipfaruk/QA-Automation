import { loadDotEnv, readConfig } from './config/env.js';
import { openDatabase } from './db/index.js';
import { createApp } from './app.js';
import { startWorker } from './workers/scan.worker.js';
import { seedDemoUsers, DEMO_USERS } from './services/seed.service.js';

loadDotEnv();
const config = readConfig();
const db = openDatabase(config.dbFile);

if (config.production && config.allowPrivateUrls) {
  console.warn('WARNING: ALLOW_PRIVATE_URLS is enabled in production. Users can scan your internal network.');
}

if (config.seedDemoUsers) {
  if (config.production) console.warn('WARNING: SEED_DEMO_USERS is enabled in production. Disable it on public servers.');
  const created = await seedDemoUsers(db);
  if (created.length) console.log(`Created ${created.length} demo account(s).`);
  console.log('Demo accounts (local evaluation only):');
  for (const u of DEMO_USERS) console.log(`  ${u.role.padEnd(5)} ${u.email.padEnd(20)} ${u.password}`);
}

let server;
let worker;

if (config.role === 'web' || config.role === 'all') {
  const app = createApp({ db, config });
  server = app.listen(config.port, config.host, () => {
    console.log(`Proofline running at ${config.appUrl} (role: ${config.role})`);
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
