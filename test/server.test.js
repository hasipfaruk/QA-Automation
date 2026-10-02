import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Stripe from 'stripe';
import { readConfig } from '../server/config.js';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';
import { startWorker } from '../server/worker.js';
import { createScanService } from '../server/scans.js';
import { startDemoServer } from '../demo/server.js';

const WEBHOOK_SECRET = 'whsec_test_secret';
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

/** Minimal browser: keeps the session cookie and never follows redirects. */
function browser() {
  let cookie = '';
  const request = async (pathname, { method = 'GET', form, json, headers = {} } = {}) => {
    const res = await fetch(base + pathname, {
      method,
      redirect: 'manual',
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        ...(json ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: form ? new URLSearchParams(form).toString() : json ? JSON.stringify(json) : undefined,
    });
    const set = res.headers.getSetCookie?.() || [];
    for (const c of set) if (c.startsWith('qa_session=')) cookie = c.split(';')[0];
    const text = await res.text();
    return { status: res.status, location: res.headers.get('location'), headers: res.headers, text };
  };
  const csrf = async () => /name="_csrf" value="([^"]+)"/.exec((await request('/app')).text)?.[1];
  return { request, csrf };
}

async function signUp(b, email = `user${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`) {
  const res = await b.request('/signup', { method: 'POST', form: { name: 'Test', email, password: 'long-enough-password' } });
  assert.equal(res.status, 302);
  assert.equal(res.location, '/app');
  return email;
}

const userByEmail = (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email);

test('public pages render', async () => {
  const b = browser();
  for (const p of ['/', '/pricing', '/login', '/signup', '/healthz']) {
    const res = await b.request(p);
    assert.equal(res.status, 200, p);
  }
  const landing = await b.request('/');
  assert.match(landing.text, /href="\/signup"/);
  assert.match(landing.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});

test('app pages require login', async () => {
  const res = await browser().request('/app/billing');
  assert.equal(res.status, 302);
  assert.match(res.location, /^\/login\?next=/);
});

test('sign up, log out and log in', async () => {
  const b = browser();
  const email = await signUp(b);
  const dup = await browser().request('/signup', { method: 'POST', form: { email, password: 'long-enough-password' } });
  assert.equal(dup.status, 422);
  assert.match(dup.text, /already exists/);

  await b.request('/logout', { method: 'POST', form: { _csrf: await b.csrf() } });
  assert.equal((await b.request('/app')).status, 302);

  const wrong = await b.request('/login', { method: 'POST', form: { email, password: 'not-the-password' } });
  assert.equal(wrong.status, 401);
  const ok = await b.request('/login', { method: 'POST', form: { email, password: 'long-enough-password', next: '/app/scans' } });
  assert.equal(ok.location, '/app/scans');
});

test('form posts without a CSRF token are rejected', async () => {
  const b = browser();
  await signUp(b);
  const res = await b.request('/app/api-keys', { method: 'POST', form: { name: 'x' } });
  assert.equal(res.status, 403);
});

test('free plan limits are enforced on the dashboard', async () => {
  const b = browser();
  await signUp(b);
  const res = await b.request('/app/scans', { method: 'POST', form: { _csrf: await b.csrf(), url: demo.url, maxPages: '20' } });
  assert.equal(res.status, 402);
  assert.match(res.text, /up to 5 pages/);
});

test('a scan runs end to end and its report is sandboxed', { timeout: 240000 }, async () => {
  const b = browser();
  await signUp(b);
  const created = await b.request('/app/scans', {
    method: 'POST',
    form: { _csrf: await b.csrf(), url: demo.url, maxPages: '2', viewports: 'desktop', checkExternalLinks: 'false' },
  });
  assert.equal(created.status, 302);
  const scanPath = created.location;

  let status;
  for (let i = 0; i < 200; i++) {
    status = JSON.parse((await b.request(`${scanPath}/status.json`)).text);
    if (status.status === 'done' || status.status === 'failed') break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.equal(status.status, 'done');

  const page = await b.request(scanPath);
  assert.match(page.text, /Quality score/);
  const reportUrl = /href="([^"]+\/r\/[^"]+\/report\.html)"/.exec(page.text)[1];
  const report = await fetch(reportUrl);
  assert.equal(report.status, 200);
  assert.match(report.headers.get('content-security-policy'), /^sandbox allow-scripts/);
  assert.match(await report.text(), /QA Report/);

  const traversal = await fetch(reportUrl.replace('report.html', '..%2F..%2Fapp.db'));
  assert.notEqual(traversal.status, 200);
  const missing = await fetch(`${base}/r/not-a-real-token/report.html`);
  assert.equal(missing.status, 404);
});

test('REST API with tokens', async () => {
  const b = browser();
  const email = await signUp(b);
  const created = await b.request('/app/api-keys', { method: 'POST', form: { _csrf: await b.csrf(), name: 'CI' } });
  const token = /<code>(qa_[^<]+)<\/code>/.exec(created.text)[1];
  const api = (p, opts = {}) => fetch(base + p, { ...opts, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } });

  const me = await (await api('/api/v1/me')).json();
  assert.equal(me.email, email);
  assert.equal(me.plan, 'free');

  const denied = await api('/api/v1/scans', { method: 'POST', body: JSON.stringify({ url: demo.url, viewports: ['tablet'] }) });
  assert.equal(denied.status, 402);

  const scan = await api('/api/v1/scans', { method: 'POST', body: JSON.stringify({ url: demo.url, viewports: ['desktop'], maxPages: 1 }) });
  assert.equal(scan.status, 201);
  const body = await scan.json();
  assert.equal(body.status, 'queued');

  const other = browser();
  await signUp(other);
  const otherToken = /<code>(qa_[^<]+)<\/code>/.exec((await other.request('/app/api-keys', { method: 'POST', form: { _csrf: await other.csrf(), name: 'x' } })).text)[1];
  const peek = await fetch(`${base}/api/v1/scans/${body.id}`, { headers: { authorization: `Bearer ${otherToken}` } });
  assert.equal(peek.status, 404, 'users must not see each other\'s scans');

  assert.equal((await fetch(`${base}/api/v1/me`, { headers: { authorization: 'Bearer qa_wrong' } })).status, 401);
});

test('Stripe webhooks update the plan', async () => {
  const b = browser();
  const email = await signUp(b);
  const user = userByEmail(email);
  db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run('cus_test_1', user.id);

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
  assert.equal(userByEmail(email).plan, 'free');

  assert.equal((await send(subEvent('evt_2', 'customer.subscription.updated', 'active'))).status, 200);
  assert.equal(userByEmail(email).plan, 'pro');

  const dup = await (await send(subEvent('evt_2', 'customer.subscription.updated', 'active'))).json();
  assert.equal(dup.duplicate, true);

  await send(subEvent('evt_3', 'customer.subscription.deleted', 'canceled'));
  assert.equal(userByEmail(email).plan, 'free');
});

test('private addresses are rejected when ALLOW_PRIVATE_URLS is off', async () => {
  const strict = createScanService({ db, config: { ...config, allowPrivateUrls: false } });
  const b = browser();
  const user = userByEmail(await signUp(b));
  for (const url of ['http://127.0.0.1:8080', 'http://localhost', 'http://169.254.169.254/latest/meta-data', 'http://192.168.0.1']) {
    await assert.rejects(strict.create(user, { url }), (err) => err.status === 422 && /private/.test(err.message), url);
  }
});

test('deleting an account removes its data', async () => {
  const b = browser();
  const email = await signUp(b);
  const wrong = await b.request('/app/settings/delete', { method: 'POST', form: { _csrf: await b.csrf(), confirm: 'someone@else.com' } });
  assert.equal(wrong.status, 422);
  const res = await b.request('/app/settings/delete', { method: 'POST', form: { _csrf: await b.csrf(), confirm: email } });
  assert.equal(res.status, 302);
  assert.equal(userByEmail(email), undefined);
});
