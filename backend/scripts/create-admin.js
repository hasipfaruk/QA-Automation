// Create an administrator account or promote an existing user.
//   npm run create-admin -- --email you@company.com [--password "..."] [--name "Jane Doe"]
// When --password is omitted a strong random password is generated and printed once.
import { parseArgs } from 'node:util';
import { loadDotEnv, readConfig } from '../src/config.js';
import { openDatabase } from '../src/db.js';
import { upsertAdmin } from '../src/seed.js';
import { randomToken, validateEmail, validatePassword } from '../src/security.js';

const { values } = parseArgs({ options: { email: { type: 'string' }, password: { type: 'string' }, name: { type: 'string' } } });

loadDotEnv();
const email = String(values.email || '').trim().toLowerCase();
if (!validateEmail(email)) {
  console.error('Usage: npm run create-admin -- --email you@company.com [--password "..."] [--name "Jane Doe"]');
  process.exit(1);
}
const generated = !values.password;
const password = values.password || randomToken(18);
const pwError = validatePassword(password);
if (pwError) {
  console.error(pwError);
  process.exit(1);
}

const db = openDatabase(readConfig().dbFile);
const result = await upsertAdmin(db, { email, password, name: values.name || 'Administrator' });
db.close();

console.log(result.created ? `Created administrator ${email}` : `Promoted ${email} to administrator`);
if (generated) console.log(`Password: ${password}\nStore it in your password manager; it will not be shown again.`);
