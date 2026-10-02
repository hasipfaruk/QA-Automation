import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAuth, HttpError, safeNextPath } from './auth.js';
import { createScanService } from './scans.js';
import { createBilling } from './billing.js';
import { hashPassword, verifyPassword, randomToken, sha256, rateLimiter, validateEmail, validatePassword } from './security.js';
import * as views from './views/pages.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_DIR = path.join(ROOT, 'docs');
const STATIC_DIR = path.join(ROOT, 'server', 'public');

const send = (res, page, status = 200) => res.status(status).type('html').send(String(page));

/** The marketing page in docs/ is shared with GitHub Pages; point its buttons at the app instead. */
function loadLanding() {
  let page = fs.readFileSync(path.join(SITE_DIR, 'index.html'), 'utf8');
  const swaps = [
    ['<a href="https://github.com/hasipfaruk/QA-Automation" class="btn btn--soft btn--sm">GitHub</a>', '<a href="/login" class="btn btn--soft btn--sm">Log in</a>'],
    ['<a href="#get-started" class="btn btn--dark btn--sm">Get started</a>', '<a href="/signup" class="btn btn--dark btn--sm">Get started</a>'],
    ['<a href="#get-started" class="btn btn--dark">Run your first scan</a>', '<a href="/signup" class="btn btn--dark">Run your first scan</a>'],
    ['<a href="https://github.com/hasipfaruk/QA-Automation" class="btn btn--dark">Get started on GitHub</a>', '<a href="/signup" class="btn btn--dark">Create a free account</a>'],
    ['<a href="#faq">FAQ</a>\n      </nav>', '<a href="/pricing">Pricing</a>\n        <a href="#faq">FAQ</a>\n      </nav>'],
  ];
  for (const [from, to] of swaps) page = page.replace(from, to);
  return page;
}

function securityHeaders(config) {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
  ].join('; ');
  return (req, res, next) => {
    res.set({
      'Content-Security-Policy': csp,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    if (config.secureCookies) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}

export function createApp({ db, config }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  const auth = createAuth({ db, config });
  const scans = createScanService({ db, config });
  const billing = createBilling({ db, config });
  const landing = loadLanding();
  const authLimit = rateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
  const apiLimit = rateLimiter({ windowMs: 60 * 1000, max: 120 });

  const q = {
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    createUser: db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?) RETURNING *'),
    setPassword: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
    deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
    userScanIds: db.prepare('SELECT id FROM scans WHERE user_id = ?'),
    tokens: db.prepare('SELECT id, name, prefix, created_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC'),
    createToken: db.prepare('INSERT INTO api_tokens (user_id, name, token_hash, prefix) VALUES (?, ?, ?, ?)'),
    deleteToken: db.prepare('DELETE FROM api_tokens WHERE id = ? AND user_id = ?'),
    tokenCount: db.prepare('SELECT COUNT(*) AS n FROM api_tokens WHERE user_id = ?'),
  };

  // ---------------------------------------------------------------- reports (sandboxed)
  // Reports are served from unguessable links and sandboxed so their scripts cannot touch the app session.
  app.get('/r/:token', (req, res) => res.redirect(`/r/${encodeURIComponent(req.params.token)}/report.html`));
  app.get('/r/:token/{*file}', (req, res, next) => {
    const scan = scans.byReportToken(req.params.token);
    if (!scan || scan.status !== 'done') throw new HttpError(404, 'This report does not exist or has expired.');
    const file = [].concat(req.params.file).join('/');
    res.set({
      'Content-Security-Policy': `sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads; default-src 'none'; img-src 'self' ${config.appUrl} data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'`,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex',
      'Cache-Control': 'private, max-age=300',
    });
    if (file.endsWith('.md')) res.type('text/markdown; charset=utf-8');
    res.sendFile(file, { root: scans.reportDir(scan), dotfiles: 'deny' }, (err) => {
      if (err) next(err.status === 404 || err.code === 'ENOENT' ? new HttpError(404, 'File not found.') : err);
    });
  });

  app.use(securityHeaders(config));

  // ---------------------------------------------------------------- Stripe webhook (raw body, before parsers)
  app.post('/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    const result = await billing.handleWebhook(req.body, req.get('stripe-signature'));
    res.json({ received: true, ...result });
  });

  app.use('/assets', express.static(path.join(SITE_DIR, 'assets'), { maxAge: '7d' }));
  app.use('/static', express.static(STATIC_DIR, { maxAge: config.production ? '1d' : 0 }));
  app.get('/healthz', (req, res) => res.json({ ok: true }));

  // ---------------------------------------------------------------- REST API
  const api = express.Router();
  api.use(express.json({ limit: '200kb' }));
  api.use((req, res, next) => {
    const limit = apiLimit(req.get('authorization') || req.ip);
    if (!limit.allowed) {
      res.set('Retry-After', String(limit.retryAfterSec));
      throw new HttpError(429, 'Too many requests. Slow down and try again shortly.');
    }
    next();
  });
  api.use(auth.requireApiToken);
  api.get('/me', (req, res) => {
    const u = scans.usage(req.user);
    res.json({ email: req.user.email, plan: u.plan.id, usage: { used: u.used, limit: u.limit, remaining: u.remaining } });
  });
  api.get('/scans', (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    res.json({ data: scans.list(req.user, { limit, offset }).map(scans.serialize), total: scans.count(req.user) });
  });
  api.post('/scans', async (req, res) => {
    const scan = await scans.create(req.user, req.body || {}, 'api');
    res.status(201).json(scans.serialize(scan));
  });
  api.get('/scans/:id', (req, res) => res.json(scans.serialize(scans.getOrThrow(req.user, req.params.id))));
  api.post('/scans/:id/rerun', async (req, res) => res.status(201).json(scans.serialize(await scans.rerun(req.user, req.params.id, 'api'))));
  api.delete('/scans/:id', (req, res) => {
    scans.remove(req.user, req.params.id);
    res.status(204).end();
  });
  api.use((req, res) => { throw new HttpError(404, 'Unknown API endpoint.'); });
  api.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Internal server error.' : err.message });
  });
  app.use('/api/v1', api);

  // ---------------------------------------------------------------- web app
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));
  app.use(auth.loadSession);

  app.get('/', (req, res) => {
    const page = req.user
      ? landing.replace('<a href="/login" class="btn btn--soft btn--sm">Log in</a>', '<a href="/app" class="btn btn--soft btn--sm">Dashboard</a>')
      : landing;
    res.type('html').send(page);
  });
  app.get('/pricing', (req, res) => send(res, views.pricingPage({ user: req.user })));

  const limitAuth = (req) => {
    const r = authLimit(`${req.ip}|${String(req.body?.email || '').toLowerCase()}`);
    if (!r.allowed) throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil(r.retryAfterSec / 60)} minutes.`);
  };

  app.get('/signup', (req, res) => (req.user ? res.redirect('/app') : send(res, views.signupPage({ signupsOpen: config.signupsOpen }))));
  app.post('/signup', async (req, res) => {
    if (!config.signupsOpen) throw new HttpError(403, 'Sign ups are closed.');
    limitAuth(req);
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim().slice(0, 80);
    const values = { email, name };
    const fail = (error) => send(res, views.signupPage({ values, error, signupsOpen: true }), 422);
    if (!validateEmail(email)) return fail('Enter a valid email address.');
    const pwError = validatePassword(req.body.password);
    if (pwError) return fail(pwError);
    if (q.userByEmail.get(email)) return fail('An account with this email already exists. Log in instead.');
    const user = q.createUser.get(email, name, await hashPassword(req.body.password));
    auth.startSession(res, user.id);
    res.redirect('/app');
  });

  app.get('/login', (req, res) => (req.user ? res.redirect('/app') : send(res, views.loginPage({ next: req.query.next }))));
  app.post('/login', async (req, res) => {
    limitAuth(req);
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = q.userByEmail.get(email);
    // Always run a hash comparison so response time does not reveal which emails exist.
    const ok = await verifyPassword(String(req.body.password || ''), user?.password_hash || 'scrypt$16384$8$1$AAAA$AAAA');
    if (!user || !ok) return send(res, views.loginPage({ values: { email }, error: 'Email or password is incorrect.', next: req.body.next }), 401);
    auth.startSession(res, user.id);
    res.redirect(safeNextPath(req.body.next));
  });

  app.post('/logout', auth.verifyCsrf, (req, res) => {
    auth.endSession(req, res);
    res.redirect('/');
  });

  // Everything below requires a signed-in user and a CSRF token on POST.
  const appRoutes = express.Router();
  appRoutes.use(auth.requireUser);
  appRoutes.use((req, res, next) => (req.method === 'POST' ? auth.verifyCsrf(req, res, next) : next()));

  const ctx = (req) => ({ user: req.user, csrfToken: req.csrfToken });
  const noticeFrom = (req) => {
    const map = {
      'checkout-success': { type: 'success', text: 'Thanks! Your plan is being activated. It can take a few seconds to update.' },
      'checkout-cancelled': { type: 'info', text: 'Checkout was cancelled. Your plan has not changed.' },
      'password-updated': { type: 'success', text: 'Password updated. Other devices have been signed out.' },
      'plan-switched': { type: 'success', text: 'Plan switched.' },
      'scan-deleted': { type: 'success', text: 'Scan deleted.' },
    };
    const key = req.query.notice || (req.query.checkout ? `checkout-${req.query.checkout}` : null);
    return map[key] || null;
  };

  function renderDashboard(req, res, { formValues, formError, status = 200 } = {}) {
    send(res, views.dashboardPage({
      ...ctx(req),
      usage: scans.usage(req.user),
      scans: scans.list(req.user, { limit: 8 }),
      aiAvailable: config.aiAvailable,
      formValues,
      formError,
      notice: noticeFrom(req),
    }), status);
  }

  appRoutes.get('/', (req, res) => renderDashboard(req, res));

  appRoutes.get('/scans', (req, res) => {
    const perPage = 25;
    const total = scans.count(req.user);
    const pages = Math.max(1, Math.ceil(total / perPage));
    const page = Math.min(pages, Math.max(1, Number(req.query.page) || 1));
    send(res, views.scansPage({ ...ctx(req), scans: scans.list(req.user, { limit: perPage, offset: (page - 1) * perPage }), page, pages }));
  });

  appRoutes.post('/scans', async (req, res) => {
    const b = req.body;
    const viewports = [].concat(b.viewports || []);
    const input = {
      url: b.url,
      viewports,
      maxPages: b.maxPages,
      checkExternalLinks: b.checkExternalLinks === 'true',
      ai: b.ai === 'true',
      visual: b.visual,
      flows: b.flows?.trim() || undefined,
      login: b.login?.trim() || undefined,
    };
    try {
      const scan = await scans.create(req.user, input, 'web');
      res.redirect(`/app/scans/${scan.id}`);
    } catch (err) {
      if (!(err instanceof HttpError) || err.status >= 500) throw err;
      renderDashboard(req, res, { formValues: { ...input, open: true }, formError: err.message, status: err.status });
    }
  });

  appRoutes.get('/scans/:id', (req, res) => {
    const scan = scans.getOrThrow(req.user, req.params.id);
    send(res, views.scanPage({ ...ctx(req), scan, view: scans.serialize(scan), notice: noticeFrom(req) }));
  });
  appRoutes.get('/scans/:id/status.json', (req, res) => {
    const s = scans.serialize(scans.getOrThrow(req.user, req.params.id));
    res.json({ status: s.status, progress: s.progress });
  });
  appRoutes.post('/scans/:id/rerun', async (req, res) => {
    const scan = await scans.rerun(req.user, req.params.id, 'web');
    res.redirect(`/app/scans/${scan.id}`);
  });
  appRoutes.post('/scans/:id/delete', (req, res) => {
    scans.remove(req.user, req.params.id);
    res.redirect('/app/scans?notice=scan-deleted');
  });

  const renderApiKeys = (req, res, newToken) => send(res, views.apiKeysPage({ ...ctx(req), tokens: q.tokens.all(req.user.id), newToken, appUrl: config.appUrl }));
  appRoutes.get('/api-keys', (req, res) => renderApiKeys(req, res));
  appRoutes.post('/api-keys', (req, res) => {
    if (q.tokenCount.get(req.user.id).n >= 20) throw new HttpError(422, 'You can have at most 20 API tokens. Revoke one first.');
    const name = String(req.body.name || 'API token').trim().slice(0, 60) || 'API token';
    const token = `qa_${randomToken(30)}`;
    q.createToken.run(req.user.id, name, sha256(token), token.slice(0, 10));
    renderApiKeys(req, res, token);
  });
  appRoutes.post('/api-keys/:id/delete', (req, res) => {
    q.deleteToken.run(Number(req.params.id), req.user.id);
    res.redirect('/app/api-keys');
  });

  appRoutes.get('/billing', (req, res) => send(res, views.billingPage({
    ...ctx(req),
    usage: scans.usage(req.user),
    billingEnabled: billing.enabled,
    devPlanSwitch: config.devPlanSwitch,
    notice: noticeFrom(req),
  })));
  appRoutes.post('/billing/checkout', async (req, res) => res.redirect(303, await billing.checkoutUrl(req.user, String(req.body.plan))));
  appRoutes.post('/billing/portal', async (req, res) => res.redirect(303, await billing.portalUrl(req.user)));
  appRoutes.post('/billing/dev-switch', (req, res) => {
    billing.devSwitch(req.user, String(req.body.plan));
    res.redirect('/app/billing?notice=plan-switched');
  });

  appRoutes.get('/settings', (req, res) => send(res, views.settingsPage({ ...ctx(req), notice: noticeFrom(req) })));
  appRoutes.post('/settings/password', async (req, res) => {
    const fail = (passwordError) => send(res, views.settingsPage({ ...ctx(req), passwordError }), 422);
    if (!(await verifyPassword(String(req.body.current || ''), req.user.password_hash))) return fail('Current password is incorrect.');
    const pwError = validatePassword(req.body.password);
    if (pwError) return fail(pwError);
    q.setPassword.run(await hashPassword(req.body.password), req.user.id);
    auth.endOtherSessions(req);
    res.redirect('/app/settings?notice=password-updated');
  });
  appRoutes.post('/settings/delete', (req, res) => {
    if (String(req.body.confirm || '').trim().toLowerCase() !== req.user.email.toLowerCase()) {
      return send(res, views.settingsPage({ ...ctx(req), deleteError: 'The email you typed does not match your account.' }), 422);
    }
    if (req.user.subscription_status && ['active', 'trialing', 'past_due'].includes(req.user.subscription_status)) {
      return send(res, views.settingsPage({ ...ctx(req), deleteError: 'Cancel your paid plan in Billing before deleting your account.' }), 422);
    }
    const ids = q.userScanIds.all(req.user.id).map((r) => r.id);
    auth.endSession(req, res);
    q.deleteUser.run(req.user.id);
    for (const id of ids) fs.rmSync(path.join(config.reportsDir, id), { recursive: true, force: true });
    fs.rmSync(path.join(config.baselinesDir, String(req.user.id)), { recursive: true, force: true });
    res.redirect('/');
  });

  app.use('/app', appRoutes);

  // ---------------------------------------------------------------- errors
  app.use((req, res) => { throw new HttpError(404, 'The page you are looking for does not exist.'); });
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    if (res.headersSent) return next(err);
    const message = status >= 500 ? 'An unexpected error happened. Please try again.' : err.message;
    if (req.accepts(['html', 'json']) === 'json') return res.status(status).json({ error: message });
    send(res, views.errorPage({ user: req.user, status, message }), status);
  });

  return app;
}
