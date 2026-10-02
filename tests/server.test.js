import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Stripe from 'stripe';
import { readConfig } from '../backend/src/config.js';
import { openDatabase } from '../backend/src/db.js';
import { createApp } from '../backend/src/app.js';
import { startWorker } from '../backend/src/worker.js';
import { createScanService } from '../backend/src/scans.js';
import { seedDemoUsers, DEMO_USERS } from '../backend/src/seed.js';
import { startDemoServer } from '../demo/server.js';

const WEBHOOK_SECRET = 'whsec_test_secret';
const PASSWORD = 'long-enough-password';
let dataDir, db, config, server, worker, demo, base;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-test-'));
  config = readConfig({
    NODE_ENV: 'test',
    DATA_DIR: dataDir,
    ALLOW_PRIVATE_URLS: 'true', // the demo site runs on 127.0.0.1
    STRIPE_SECRET_KEY: 'sk_test_dummy',
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    STRIPE_PRICE_PRO: 'price_pro_test',
    STRIPE_PRICE_BUSINESS: 'price_business_test',
    WORKER_CONCURRENCY: '1',
  });
  db = openDatabase(config.dbFile);
  await seedDemoUsers(db);
  const app = createApp({ db, config });
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  config.appUrl = base;
  worker = await startWorker({ db, config, log: () => {} });
  demo = await startDemoServer(0);
});

after(async () => {
  await worker?.stop();
  server?.close();
  await demo?.close();
  db?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/** API client that keeps the session cookie and CSRF token like the frontend does. */
function client() {
  let cookie = '';
  let csrf = '';
  const raw = async (pathname, { method = 'GET', body, headers = {}, form } = {}) => {
    const res = await fetch(base + pathname, {
      method,
      redirect: 'manual',
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        ...(csrf && method !== 'GET' ? { 'x-csrf-token': csrf } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : form ? new URLSearchParams(form).toString() : undefined,
    });
    for (const c of res.headers.getSetCookie?.() || []) if (c.startsWith('qa_session=')) cookie = c.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, location: res.headers.get('location'), headers: res.headers, text, json };
  };
  const refresh = async () => { csrf = (await raw('/api/session')).json?.csrfToken || ''; };
  return {
    raw,
    refresh,
    clearCsrf: () => { csrf = ''; },
    get: (p) => raw(p),
    post: (p, body = {}) => raw(p, { method: 'POST', body }),
    patch: (p, body = {}) => raw(p, { method: 'PATCH', body }),
    del: (p, body) => raw(p, { method: 'DELETE', body }),
  };
}

const uniqueEmail = () => `user${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`;

async function signUp(c, email = uniqueEmail()) {
  const res = await c.post('/api/auth/signup', { name: 'Test', email, password: PASSWORD });
  assert.equal(res.status, 201, res.text);
  await c.refresh();
  return email;
}

async function logIn(c, email, password) {
  const res = await c.post('/api/auth/login', { email, password });
  if (res.status === 200) await c.refresh();
  return res;
}

const demoAccount = (role) => DEMO_USERS.find((u) => u.role === role);
const userByEmail = (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email);

test('public pages and assets are served', async () => {
  const c = client();
  for (const p of ['/', '/pricing', '/login', '/signup', '/healthz', '/api/plans', '/api/config', '/app-assets/js/main.js', '/assets/css/style.css']) {
    assert.equal((await c.get(p)).status, 200, p);
  }
  const landing = await c.get('/');
  assert.match(landing.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await c.get('/no-such-page')).status, 404);
});

test('app pages redirect to login when signed out', async () => {
  const c = client();
  const res = await c.get('/app/billing');
  assert.equal(res.status, 302);
  assert.match(res.location, /^\/login\?next=/);
  assert.equal((await c.get('/api/usage')).status, 401);
});

test('sign up, log out and log in through the API', async () => {
  const c = client();
  const email = await signUp(c);
  assert.equal((await c.get('/api/session')).json.user.email, email);
  assert.equal(userByEmail(email).plan, 'trial');

  const dup = await client().post('/api/auth/signup', { email, password: PASSWORD });
  assert.equal(dup.status, 409);

  await c.post('/api/auth/logout');
  assert.equal((await c.get('/api/session')).json.user, null);

  assert.equal((await logIn(c, email, 'not-the-password')).status, 401);
  const ok = await logIn(c, email, PASSWORD);
  assert.equal(ok.status, 200);
  assert.equal(ok.json.redirect, '/app');
});

test('state-changing calls need JSON and a CSRF token', async () => {
  const c = client();
  await signUp(c);
  c.clearCsrf();
  assert.equal((await c.post('/api/tokens', { name: 'x' })).status, 403, 'missing CSRF header');
  await c.refresh();
  assert.equal((await c.raw('/api/tokens', { method: 'POST', form: { name: 'x' } })).status, 415, 'form posts are rejected');
  assert.equal((await c.post('/api/tokens', { name: 'x' })).status, 201);
});

test('trial limits and trial expiry are enforced', async () => {
  const c = client();
  const email = await signUp(c);
  const tooMany = await c.post('/api/scans', { url: demo.url, maxPages: 20 });
  assert.equal(tooMany.status, 402);
  assert.match(tooMany.json.error, /up to 5 pages/);

  db.prepare('UPDATE users SET created_at = ? WHERE email = ?').run(new Date(Date.now() - 30 * 864e5).toISOString(), email);
  const expired = await c.post('/api/scans', { url: demo.url });
  assert.equal(expired.status, 402);
  assert.match(expired.json.error, /trial has ended/);
});

test('a scan runs end to end and its report is sandboxed', { timeout: 240000 }, async () => {
  const c = client();
  await logIn(c, demoAccount('user').email, demoAccount('user').password);
  const created = await c.post('/api/scans', {
    url: demo.url, maxPages: 2, viewports: ['desktop'], checkExternalLinks: false,
    login: JSON.stringify({ loginUrl: '/contact.html', steps: [{ fill: '#email', value: 'secret-password-123' }] }),
  });
  assert.equal(created.status, 201, created.text);
  assert.equal(JSON.stringify(created.json.options).includes('secret-password-123'), false, 'login values are redacted');

  let scan;
  for (let i = 0; i < 200; i++) {
    scan = (await c.get(`/api/scans/${created.json.id}`)).json;
    if (scan.status === 'done' || scan.status === 'failed') break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.equal(scan.status, 'done', scan.error);
  assert.ok(scan.summary.score >= 0);

  const report = await fetch(scan.reportUrl);
  assert.equal(report.status, 200);
  assert.match(report.headers.get('content-security-policy'), /^sandbox allow-scripts/);
  assert.notEqual((await fetch(scan.reportUrl.replace('report.html', '..%2F..%2Fapp.db'))).status, 200);
  assert.equal((await fetch(`${base}/r/not-a-real-token/report.html`)).status, 404);
});

test('REST API with tokens and per-user isolation', async () => {
  const c = client();
  const email = await signUp(c);
  const token = (await c.post('/api/tokens', { name: 'CI' })).json.token;
  const api = (p, opts = {}) => fetch(base + p, { ...opts, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } });

  const me = await (await api('/api/v1/me')).json();
  assert.equal(me.email, email);
  assert.equal(me.plan, 'trial');
  assert.equal((await api('/api/v1/scans', { method: 'POST', body: JSON.stringify({ url: demo.url, viewports: ['tablet'] }) })).status, 402);
  const created = await api('/api/v1/scans', { method: 'POST', body: JSON.stringify({ url: demo.url, viewports: ['desktop'], maxPages: 1 }) });
  assert.equal(created.status, 201);
  const { id } = await created.json();

  const other = client();
  await signUp(other);
  assert.equal((await other.get(`/api/scans/${id}`)).status, 404, 'users must not see each other\'s scans');
  assert.equal((await fetch(`${base}/api/v1/me`, { headers: { authorization: 'Bearer qa_wrong' } })).status, 401);
});

test('Stripe webhooks update the plan', async () => {
  const c = client();
  const email = await signUp(c);
  db.prepare('UPDATE users SET stripe_customer_id = ? WHERE email = ?').run('cus_test_1', email);

  const stripe = new Stripe('sk_test_dummy');
  const send = (event, secret = WEBHOOK_SECRET) => {
    const payload = JSON.stringify(event);
    return fetch(`${base}/stripe/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload, secret }) },
      body: payload,
    });
  };
  const subEvent = (id, type, status) => ({
    id, type, object: 'event',
    data: { object: { id: 'sub_1', object: 'subscription', customer: 'cus_test_1', status, items: { data: [{ price: { id: 'price_pro_test' } }] } } },
  });

  assert.equal((await send(subEvent('evt_1', 'customer.subscription.updated', 'active'), 'whsec_wrong')).status, 400);
  assert.equal(userByEmail(email).plan, 'trial');
  assert.equal((await send(subEvent('evt_2', 'customer.subscription.updated', 'active'))).status, 200);
  assert.equal(userByEmail(email).plan, 'pro');
  assert.equal((await (await send(subEvent('evt_2', 'customer.subscription.updated', 'active'))).json()).duplicate, true);
  await send(subEvent('evt_3', 'customer.subscription.deleted', 'canceled'));
  assert.equal(userByEmail(email).plan, 'trial');
});

test('private addresses are rejected when ALLOW_PRIVATE_URLS is off', async () => {
  const strict = createScanService({ db, config: { ...config, allowPrivateUrls: false } });
  const user = userByEmail(demoAccount('user').email);
  for (const url of ['http://127.0.0.1:8080', 'http://localhost', 'http://169.254.169.254/latest/meta-data', 'http://192.168.0.1']) {
    await assert.rejects(strict.create(user, { url }), (err) => err.status === 422 && /private/.test(err.message), url);
  }
});

test('admin API is restricted to administrators', async () => {
  const c = client();
  await logIn(c, demoAccount('user').email, demoAccount('user').password);
  assert.equal((await c.get('/api/admin/stats')).status, 403);
  assert.equal((await c.get('/app/admin')).status, 302);
  assert.equal((await client().get('/api/admin/users')).status, 401);
});

test('administrators manage users and every action is audited', async () => {
  const admin = client();
  await logIn(admin, demoAccount('admin').email, demoAccount('admin').password);
  const stats = (await admin.get('/api/admin/stats')).json;
  assert.ok(stats.users.total >= 3);
  assert.equal(stats.scans.daily.length, 14);

  const customer = client();
  const email = await signUp(customer);
  const token = (await customer.post('/api/tokens', { name: 'CI' })).json.token;
  const { id } = userByEmail(email);

  const found = (await admin.get(`/api/admin/users?q=${encodeURIComponent(email)}`)).json;
  assert.equal(found.total, 1);

  const updated = await admin.patch(`/api/admin/users/${id}`, { plan: 'business', status: 'suspended' });
  assert.equal(updated.status, 200, updated.text);
  assert.deepEqual(updated.json.changes.status, { from: 'active', to: 'suspended' });

  // suspension ends sessions, blocks login and API tokens
  assert.equal((await customer.get('/api/session')).json.user, null);
  assert.equal((await logIn(customer, email, PASSWORD)).status, 403);
  assert.equal((await fetch(`${base}/api/v1/me`, { headers: { authorization: `Bearer ${token}` } })).status, 403);

  const self = userByEmail(demoAccount('admin').email);
  assert.equal((await admin.patch(`/api/admin/users/${self.id}`, { role: 'user' })).status, 422, 'admins cannot demote themselves');
  assert.equal((await admin.patch(`/api/admin/users/${id}`, { plan: 'gold' })).status, 422);

  const audit = (await admin.get('/api/admin/audit?action=admin.')).json;
  assert.ok(audit.data.some((e) => e.action === 'admin.user_updated' && e.targetId === String(id)));
  const failed = (await admin.get('/api/admin/audit?action=user.login_blocked')).json;
  assert.ok(failed.total >= 1);

  assert.equal((await admin.del(`/api/admin/users/${id}`)).status, 204);
  assert.equal(userByEmail(email), undefined);
  const scans = (await admin.get('/api/admin/scans')).json;
  assert.ok(Array.isArray(scans.data));
});

test('customers can delete their own account', async () => {
  const c = client();
  const email = await signUp(c);
  assert.equal((await c.del('/api/account', { confirm: 'someone@else.com' })).status, 422);
  assert.equal((await c.del('/api/account', { confirm: email })).status, 200);
  assert.equal(userByEmail(email), undefined);
});
