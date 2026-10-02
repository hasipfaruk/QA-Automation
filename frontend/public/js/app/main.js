import { loadSession, get } from './core/api.js';
import { html, mount, $ } from './core/html.js';
import { errorState } from './core/layout.js';

// URL pattern -> page module. Order matters: /app/scans/new must come before /app/scans/:id.
// Access is also enforced by the server and the API; this only decides what to render.
const ROUTES = [
  { re: /^\/pricing\/?$/, load: () => import('./pages/pricing.js'), access: 'public' },
  { re: /^\/app\/?$/, load: () => import('./pages/dashboard.js'), access: 'customer' },
  { re: /^\/app\/scans\/new\/?$/, load: () => import('./pages/new-scan.js'), access: 'customer' },
  { re: /^\/app\/scans\/?$/, load: () => import('./pages/scans.js'), access: 'customer' },
  { re: /^\/app\/scans\/([\w-]+)\/?$/, load: () => import('./pages/scan-detail.js'), access: 'customer' },
  { re: /^\/app\/api\/?$/, load: () => import('./pages/api-keys.js'), access: 'customer' },
  { re: /^\/app\/billing\/?$/, load: () => import('./pages/billing.js'), access: 'customer' },
  { re: /^\/app\/settings\/?$/, load: () => import('./pages/settings.js'), access: 'any' },
  { re: /^\/app\/admin\/?$/, load: () => import('./pages/admin/overview.js'), access: 'admin' },
  { re: /^\/app\/admin\/users\/?$/, load: () => import('./pages/admin/users.js'), access: 'admin' },
  { re: /^\/app\/admin\/users\/(\d+)\/?$/, load: () => import('./pages/admin/user-detail.js'), access: 'admin' },
  { re: /^\/app\/admin\/scans\/?$/, load: () => import('./pages/admin/scans.js'), access: 'admin' },
  { re: /^\/app\/admin\/audit\/?$/, load: () => import('./pages/admin/audit-log.js'), access: 'admin' },
];

/** Where a signed-in user belongs when they open a page that is not for their role. */
function redirectFor(route, user) {
  if (route.access === 'public' || route.access === 'any') return null;
  if (!user) return `/login?next=${encodeURIComponent(window.location.pathname)}`;
  if (route.access === 'admin' && user.role !== 'admin') return '/app';
  if (route.access === 'customer' && user.role === 'admin') return '/app/admin';
  return null;
}

async function start() {
  const main = $('#main');
  const path = window.location.pathname;
  const route = ROUTES.find((r) => r.re.test(path));

  try {
    const [session, config] = await Promise.all([loadSession(), get('/config')]);
    if (!route) {
      mount(main, html`<div class="empty"><h3>Page not found</h3><p class="muted">This page does not exist.</p><a class="btn btn--primary" href="/app">Go to dashboard</a></div>`);
      return;
    }
    const target = redirectFor(route, session.user);
    if (target) {
      window.location.replace(target);
      return;
    }
    const page = await route.load();
    await page.render({ session, config, params: route.re.exec(path).slice(1), main });
  } catch (err) {
    console.error(err);
    errorState(main, err);
  }
}

start();
