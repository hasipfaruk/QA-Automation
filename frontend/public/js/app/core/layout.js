import { html, mount, $ } from './html.js';
import { post } from './api.js';

export const logo = html`<a href="/" class="logo" aria-label="QA Automation home">
  <svg class="logo__mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="2" width="28" height="28" rx="9"/><path class="logo__check" d="M9.5 16.5l4.5 4.5 8.5-9.5"/></svg>
  <span>QA Automation</span>
</a>`;

const USER_NAV = [
  ['dashboard', '/app', 'Dashboard'],
  ['scans', '/app/scans', 'Scans'],
  ['api', '/app/api', 'API'],
  ['billing', '/app/billing', 'Billing'],
  ['settings', '/app/settings', 'Settings'],
];

const ADMIN_NAV = [
  ['admin-overview', '/app/admin', 'Overview'],
  ['admin-users', '/app/admin/users', 'Users'],
  ['admin-scans', '/app/admin/scans', 'Scans'],
  ['admin-audit', '/app/admin/audit', 'Audit log'],
];

const navLink = ([key, href, label], active) => html`<a href="${href}" class="${key === active ? 'is-active' : ''}" ${key === active ? html`aria-current="page"` : ''}>${label}</a>`;

/** Render the signed-in top bar. */
export function renderShell({ session, active, title }) {
  document.title = `${title} | QA Automation`;
  const { user, plan } = session;
  const isAdminArea = active.startsWith('admin');
  mount($('#shell'), html`
    <header class="topbar ${isAdminArea ? 'topbar--admin' : ''}">
      <div class="wrap topbar__inner">
        ${logo}
        <nav class="topnav" aria-label="Main">
          ${USER_NAV.map((item) => navLink(item, active))}
          ${user.role === 'admin' ? html`<a href="/app/admin" class="topnav__admin ${isAdminArea ? 'is-active' : ''}">Admin</a>` : ''}
        </nav>
        <div class="topbar__user">
          <span class="plan-chip">${plan.name}</span>
          <span class="muted user-email" title="${user.email}">${user.email}</span>
          <button class="btn btn--soft btn--sm" type="button" id="logout">Log out</button>
        </div>
      </div>
      ${isAdminArea ? html`<div class="subnav"><div class="wrap subnav__inner"><span class="subnav__label">Administration</span>${ADMIN_NAV.map((item) => navLink(item, active))}</div></div>` : ''}
    </header>`);
  $('#logout').addEventListener('click', async () => {
    const res = await post('/auth/logout');
    window.location.href = res?.redirect || '/';
  });
}

/** Top bar for public pages such as pricing. */
export function renderPublicShell({ session, title }) {
  document.title = `${title} | QA Automation`;
  mount($('#shell'), html`
    <header class="topbar">
      <div class="wrap topbar__inner">
        ${logo}
        <nav class="topnav" aria-label="Main">
          <a href="/#features">Features</a>
          <a href="/pricing" class="is-active" aria-current="page">Pricing</a>
          <a href="/#faq">FAQ</a>
        </nav>
        <div class="topbar__user">
          ${session.user
            ? html`<a href="/app" class="btn btn--dark btn--sm">Dashboard</a>`
            : html`<a href="/login" class="btn btn--soft btn--sm">Log in</a><a href="/signup" class="btn btn--dark btn--sm">Start trial</a>`}
        </div>
      </div>
    </header>`);
}

export function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = message;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('is-leaving'), 3800);
  setTimeout(() => el.remove(), 4300);
}

/** Show a one-off message passed as ?notice=... after a redirect. */
export function flashFromQuery(messages) {
  const params = new URLSearchParams(window.location.search);
  const key = params.get('notice');
  if (key && messages[key]) {
    toast(messages[key].text, messages[key].type);
    params.delete('notice');
    const qs = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
  }
}

/** Disable a button while an async action runs and report errors as toasts. */
export async function busy(button, action) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Working...';
  try {
    return await action();
  } catch (err) {
    toast(err.message, 'error');
    return undefined;
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

export function errorState(main, err) {
  mount(main, html`<div class="empty-state"><p><b>Something went wrong.</b> ${err.message}</p><p><a class="link" href="">Reload the page</a></p></div>`);
}
