import { hashPassword } from './security.js';

// Accounts for local evaluation. Never enable SEED_DEMO_USERS on a public server.
export const DEMO_USERS = [
  { email: 'admin@example.com', password: 'Admin-demo-2026!', name: 'Demo Admin', role: 'admin', plan: 'enterprise' },
  { email: 'demo@example.com', password: 'Demo-user-2026!', name: 'Demo User', role: 'user', plan: 'pro' },
  { email: 'trial@example.com', password: 'Trial-user-2026!', name: 'Trial User', role: 'user', plan: 'trial' },
];

/** Create the demo accounts that do not exist yet. Returns the accounts that were created. */
export async function seedDemoUsers(db) {
  const exists = db.prepare('SELECT 1 FROM users WHERE email = ?');
  const insert = db.prepare('INSERT INTO users (email, name, password_hash, role, plan) VALUES (?, ?, ?, ?, ?)');
  const created = [];
  for (const u of DEMO_USERS) {
    if (exists.get(u.email)) continue;
    insert.run(u.email, u.name, await hashPassword(u.password), u.role, u.plan);
    created.push(u);
  }
  return created;
}

/** Create an administrator or promote an existing account. */
export async function upsertAdmin(db, { email, password, name = 'Administrator' }) {
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (existing) {
    db.prepare("UPDATE users SET role = 'admin', status = 'active' WHERE id = ?").run(existing.id);
    if (password) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(password), existing.id);
    return { email, created: false };
  }
  db.prepare("INSERT INTO users (email, name, password_hash, role, plan) VALUES (?, ?, ?, 'admin', 'enterprise')")
    .run(email, name, await hashPassword(password));
  return { email, created: true };
}
