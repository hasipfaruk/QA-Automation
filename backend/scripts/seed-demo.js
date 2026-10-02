// Create the demo accounts for local evaluation.
//   npm run seed
import { loadDotEnv, readConfig } from '../src/config/env.js';
import { openDatabase } from '../src/db/index.js';
import { seedDemoUsers, DEMO_USERS } from '../src/services/seed.service.js';

loadDotEnv();
const config = readConfig();
if (config.production && !process.argv.includes('--force')) {
  console.error('Refusing to create demo accounts in production. Pass --force if you really want this.');
  process.exit(1);
}
const db = openDatabase(config.dbFile);
const created = await seedDemoUsers(db);
db.close();

console.log(created.length ? `Created ${created.length} demo account(s).` : 'Demo accounts already exist.');
for (const u of DEMO_USERS) console.log(`  ${u.role.padEnd(5)} ${u.plan.padEnd(10)} ${u.email.padEnd(20)} ${u.password}`);
