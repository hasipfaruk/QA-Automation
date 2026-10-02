import path from 'node:path';
import express from 'express';
import { createAuth, HttpError } from './auth.js';
import { createAudit } from './audit.js';
import { createScanService } from './scans.js';
import { createBilling } from './billing.js';
import { createAdminService } from './admin.js';
import { sessionRoutes } from './routes/session.routes.js';
import { accountRoutes } from './routes/account.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { publicApiRoutes } from './routes/public-api.routes.js';

const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function securityHeaders(config) {
  return (req, res, next) => {
    res.set({
      'Content-Security-Policy': APP_CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Cross-Origin-Opener-Policy': 'same-origin',
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
  const audit = createAudit({ db });
  const scans = createScanService({ db, config });
  const billing = createBilling({ db, config, audit });
  const admin = createAdminService({ db, config, scans, auth });
  const site = path.join(config.frontendDir, 'site');
  const appDir = path.join(config.frontendDir, 'app');

  // ---------------------------------------------------------------- reports (sandboxed, capability links)
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

  // ---------------------------------------------------------------- Stripe webhook (raw body for signature check)
  app.post('/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    const result = await billing.handleWebhook(req.body, req.get('stripe-signature'));
    res.json({ received: true, ...result });
  });

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  // ---------------------------------------------------------------- public REST API (API tokens)
  app.use('/api/v1', publicApiRoutes({ auth, scans }));

  // ---------------------------------------------------------------- session API used by the frontend
  const api = express.Router();
  api.use(express.json({ limit: '200kb' }));
  api.use(auth.loadSession);
  api.use(auth.protectApi);
  api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  api.use(sessionRoutes({ db, config, auth, audit }));
  api.use('/admin', adminRoutes({ auth, audit, scans, admin }));
  api.use(accountRoutes({ db, config, auth, audit, scans, billing }));
  app.use('/api', api);
  app.use('/api', (req, res) => { throw new HttpError(404, 'Unknown API endpoint.'); });

  // ---------------------------------------------------------------- frontend (static files)
  const staticOpts = { maxAge: config.production ? '1d' : 0, index: false };
  app.use('/assets', express.static(path.join(site, 'assets'), staticOpts));
  app.use('/app-assets', express.static(path.join(appDir, 'assets'), staticOpts));

  const page = (file) => (req, res) => res.sendFile(file, { root: config.frontendDir, headers: { 'Cache-Control': 'no-cache' } });
  app.use(auth.loadSession);
  app.get('/', page('site/index.html'));
  app.get('/pricing', page('app/index.html'));
  app.get(['/login', '/signup'], (req, res, next) => (req.user ? res.redirect('/app') : next()), page('app/auth.html'));
  app.get(['/app/admin', '/app/admin/{*rest}'], auth.pageGuard({ admin: true }), page('app/index.html'));
  app.get(['/app', '/app/{*rest}'], auth.pageGuard(), page('app/index.html'));

  // ---------------------------------------------------------------- errors
  app.use((req, res) => { throw new HttpError(404, 'The page you are looking for does not exist.'); });
  app.use((err, req, res, next) => {
    let status = err.status || err.statusCode || 500;
    if (err.type === 'entity.parse.failed') status = 400;
    if (status >= 500) console.error(err);
    if (res.headersSent) return next(err);
    const message = status >= 500 ? 'An unexpected error happened. Please try again.' : (err.type === 'entity.parse.failed' ? 'Request body is not valid JSON.' : err.message);
    if (req.path.startsWith('/api/') || req.path.startsWith('/stripe/') || req.accepts(['html', 'json']) === 'json') {
      return res.status(status).json({ error: message });
    }
    res.status(status).sendFile('app/error.html', { root: config.frontendDir });
  });

  return app;
}
