import { loadSession, get } from './core/api.js';
import { html, mount, $ } from './core/html.js';
import { errorState } from './core/layout.js';

// path pattern -> page module. Admin pages are also protected by the server and the API.
const ROUTES = [
  [/^\/pricing\/?$/, () => import('./pages/pricing.js'), { public: true }],
  [/^\/app\/?$/, () => import('./pages/dashboard.js')],
  [/^\/app\/scans\/?$/, () => import('./pages/scans.js')],
  [/^\/app\/scans\/([\w-]+)\/?$/, () => import('./pages/scan-detail.js')],
  [/^\/app\/api\/?$/, () => import('./pages/api-keys.js')],
  [/^\/app\/billing\/?$/, () => import('./pages/billing.js')],
  [/^\/app\/settings\/?$/, () => import('./pages/settings.js')],
  [/^\/app\/admin\/?$/, () => import('./pages/admin/overview.js'), { admin: true }],
  [/^\/app\/admin\/users\/?$/, () => import('./pages/admin/users.js'), { admin: true }],
  [/^\/app\/admin\/users\/(\d+)\/?$/, () => import('./pages/admin/user-detail.js'), { admin: true }],
  [/^\/app\/admin\/scans\/?$/, () => import('./pages/admin/scans.js'), { admin: true }],
  [/^\/app\/admin\/audit\/?$/, () => import('./pages/admin/audit-log.js'), { admin: true }],
];

async function start() {
  const main = $('#main');
  const path = window.location.pathname;
  const match = ROUTES.map(([re, load, opts = {}]) => ({ m: re.exec(path), load, opts })).find((r) => r.m);

  try {
    const [session, config] = await Promise.all([loadSession(), get('/config')]);
    if (!match) {
      mount(main, html`<div class="empty-state"><p>Page not found.</p><a class="btn btn--dark" href="/app">Go to dashboard</a></div>`);
      return;
    }
    if (!match.opts.public && !session.user) {
      window.location.href = `/login?next=${encodeURIComponent(path)}`;
      return;
    }
    if (match.opts.admin && session.user.role !== 'admin') {
      window.location.href = '/app';
      return;
    }
    const page = await match.load();
    await page.render({ session, config, params: match.m.slice(1), main });
  } catch (err) {
    console.error(err);
    errorState(main, err);
  }
}

start();
