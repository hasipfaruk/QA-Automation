import path from 'node:path';
import express from 'express';

/**
 * Serves the static frontend from frontend/public. Page routes return HTML shells;
 * all data is loaded by the browser through the JSON API.
 */
export function frontendRoutes({ config, auth }) {
  const router = express.Router();
  const { publicDir } = config;
  const assetOptions = { maxAge: config.production ? '1d' : 0, index: false, fallthrough: false };

  router.use('/css', express.static(path.join(publicDir, 'css'), assetOptions));
  router.use('/js', express.static(path.join(publicDir, 'js'), assetOptions));
  router.use('/images', express.static(path.join(publicDir, 'images'), assetOptions));
  router.get('/favicon.svg', (req, res) => res.sendFile('favicon.svg', { root: publicDir, maxAge: assetOptions.maxAge }));

  const page = (file) => (req, res) => res.sendFile(file, { root: publicDir, headers: { 'Cache-Control': 'no-cache' } });
  const home = (user) => (user.role === 'admin' ? '/app/admin' : '/app');
  const redirectSignedIn = (req, res, next) => (req.user ? res.redirect(home(req.user)) : next());
  // The customer workspace is not used by administrators, except for their own settings.
  const customerOnly = (req, res, next) => (req.user.role === 'admin' && req.path !== '/app/settings' ? res.redirect('/app/admin') : next());

  router.get('/', page('index.html'));
  router.get('/pricing', page('app.html'));
  router.get(['/login', '/signup'], redirectSignedIn, page('auth.html'));
  router.get(['/app/admin', '/app/admin/{*rest}'], auth.pageGuard({ admin: true }), page('app.html'));
  router.get(['/app', '/app/{*rest}'], auth.pageGuard(), customerOnly, page('app.html'));

  return router;
}
