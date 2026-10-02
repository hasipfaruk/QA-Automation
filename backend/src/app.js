import express from 'express';
import { createAuth } from './middleware/auth.js';
import { securityHeaders } from './middleware/security-headers.js';
import { notFound, errorHandler } from './middleware/error-handler.js';
import { createAudit } from './services/audit.service.js';
import { createScanService } from './services/scan.service.js';
import { createBilling } from './services/billing.service.js';
import { createAdminService } from './services/admin.service.js';
import { sessionRoutes } from './routes/session.routes.js';
import { accountRoutes } from './routes/account.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { publicApiRoutes } from './routes/public-api.routes.js';
import { reportRoutes } from './routes/reports.routes.js';
import { webhookRoutes } from './routes/webhooks.routes.js';
import { frontendRoutes } from './routes/frontend.routes.js';

/**
 * Assemble the Express application.
 *
 *   /r/:token/*      sandboxed scan reports (capability links)
 *   /stripe/*        payment webhooks
 *   /api/v1/*        public REST API (API tokens)
 *   /api/*           session API used by the frontend
 *   everything else  static frontend
 */
export function createApp({ db, config }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  const auth = createAuth({ db, config });
  const audit = createAudit({ db });
  const scans = createScanService({ db, config });
  const billing = createBilling({ db, config, audit });
  const admin = createAdminService({ db, config, scans, auth });

  // Reports carry their own sandbox policy, so they are mounted before the global headers.
  app.use('/r', reportRoutes({ config, scans }));
  app.use(securityHeaders(config));
  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.use('/stripe', webhookRoutes({ billing }));
  app.use('/api/v1', publicApiRoutes({ auth, scans }));

  const api = express.Router();
  api.use(express.json({ limit: '200kb' }));
  api.use(auth.loadSession);
  api.use(auth.protectApi);
  api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  api.use(sessionRoutes({ db, config, auth, audit }));
  api.use('/admin', adminRoutes({ auth, audit, scans, admin }));
  api.use(accountRoutes({ db, config, auth, audit, scans, billing }));
  app.use('/api', api);
  app.use('/api', notFound());

  app.use(auth.loadSession);
  app.use(frontendRoutes({ config, auth }));

  app.use(notFound());
  app.use(errorHandler(config));
  return app;
}
