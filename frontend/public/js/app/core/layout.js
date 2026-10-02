import { html, mount, $ } from './html.js';
import { post } from './api.js';
import { icon, LOGO_MARK } from './icons.js';

const CUSTOMER_NAV = [
  { section: 'Workspace' },
  { key: 'overview', href: '/app', label: 'Overview', icon: 'overview' },
  { key: 'new-scan', href: '/app/scans/new', label: 'New scan', icon: 'plus' },
  { key: 'scans', href: '/app/scans', label: 'Scans', icon: 'scans' },
  { section: 'Developers' },
  { key: 'api', href: '/app/api', label: 'API and CI', icon: 'key' },
  { section: 'Account' },
  { key: 'billing', href: '/app/billing', label: 'Plan and billing', icon: 'card' },
  { key: 'settings', href: '/app/settings', label: 'Settings', icon: 'settings' },
];

const ADMIN_NAV = [
  { section: 'Administration' },
  { key: 'admin-overview', href: '/app/admin', label: 'Overview', icon: 'overview' },
  { key: 'admin-users', href: '/app/admin/users', label: 'Customers', icon: 'users' },
  { key: 'admin-scans', href: '/app/admin/scans', label: 'Scans', icon: 'activity' },
  { key: 'admin-audit', href: '/app/admin/audit', label: 'Audit log', icon: 'shield' },
  { section: 'Account' },
  { key: 'settings', href: '/app/settings', label: 'Settings', icon: 'settings' },
];

const brand = html`<a href="/" class="logo sidebar__logo" aria-label="Proofline home">${LOGO_MARK}<span>Proofline</span></a>`;

const initials = (user) => (user.name || user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');

function planCard(session) {
  const { user, plan } = session;
  if (user.role === 'admin') {
    return html`<div class="sidebar__plan"><span class="badge badge--accent">${icon('shield', 'icon icon--xs')} Administrator</span><span class="faint small">Full platform access</span></div>`;
  }
  if (plan.id === 'trial') {
    const days = Math.max(0, Math.ceil((Date.parse(plan.trialEndsAt) - Date.now()) / 864e5));
    return html`<div class="sidebar__plan">
      <span class="sidebar__plan-text"><b>Free trial</b><span class="faint small">${days ? `${days} day${days === 1 ? '' : 's'} left` : 'Trial ended'}</span></span>
      <a href="/app/billing" class="btn btn--primary btn--sm btn--block">Upgrade plan</a>
    </div>`;
  }
  return html`<div class="sidebar__plan sidebar__plan--row"><span class="sidebar__plan-text"><span class="faint small">Current plan</span><b>${plan.name}</b></span><a href="/app/billing" class="btn btn--sm">Manage</a></div>`;
}

function navItems(items, active) {
  return items.map((item) => (item.section
    ? html`<span class="sidebar__section">${item.section}</span>`
    : html`<a href="${item.href}" class="sidebar__link ${item.key === active ? 'is-active' : ''}" ${item.key === active ? html`aria-current="page"` : ''}>${icon(item.icon)}<span>${item.label}</span></a>`));
}

/**
 * Render the signed-in application shell.
 * @param {{ session: object, active: string, title: string, description?: string }} options
 */
export function renderShell({ session, active, title, description }) {
  document.title = `${title} | Proofline`;
  const { user } = session;
  const isAdmin = user.role === 'admin';

  mount($('#sidebar'), html`
    <div class="sidebar__top">${brand}<button class="icon-btn sidebar__close" type="button" data-sidebar-close aria-label="Close menu">${icon('close')}</button></div>
    <nav class="sidebar__nav" aria-label="${isAdmin ? 'Administration' : 'Workspace'}">${navItems(isAdmin ? ADMIN_NAV : CUSTOMER_NAV, active)}</nav>
    <div class="sidebar__bottom">
      ${planCard(session)}
      <div class="sidebar__user">
        <span class="avatar" aria-hidden="true">${initials(user)}</span>
        <span class="sidebar__user-text"><b>${user.name || 'Account'}</b><span class="faint small" title="${user.email}">${user.email}</span></span>
        <button class="icon-btn" type="button" id="logout" aria-label="Sign out" title="Sign out">${icon('logout')}</button>
      </div>
    </div>`);

  mount($('#topbar'), html`
    <button class="icon-btn topbar__menu" type="button" data-sidebar-open aria-label="Open menu">${icon('menu')}</button>
    <div class="topbar__title"><h1>${title}</h1>${description ? html`<p class="muted small">${description}</p>` : ''}</div>
    <div class="topbar__actions" id="topbar-actions">${isAdmin ? '' : active === 'new-scan' ? '' : html`<a href="/app/scans/new" class="btn btn--primary btn--sm">${icon('plus')} New scan</a>`}</div>`);

  const shell = $('.shell');
  shell.classList.remove('shell--public');
  const setOpen = (open) => shell.classList.toggle('is-sidebar-open', open);
  document.querySelectorAll('[data-sidebar-open]').forEach((b) => b.addEventListener('click', () => setOpen(true)));
  document.querySelectorAll('[data-sidebar-close], .shell__scrim').forEach((b) => b.addEventListener('click', () => setOpen(false)));
  $('#logout').addEventListener('click', async () => {
    const res = await post('/auth/logout');
    window.location.href = res?.redirect || '/';
  });
}

/** Replace the action buttons in the top bar for the current page. */
export function setActions(template) {
  mount($('#topbar-actions'), template);
}

/** Header for public pages (pricing) shown without the sidebar. */
export function renderPublicShell({ session, title }) {
  document.title = `${title} | Proofline`;
  $('.shell').classList.add('shell--public');
  mount($('#topbar'), html`
    <div class="public-bar">
      ${brand}
      <nav class="public-bar__links" aria-label="Main"><a href="/#product">Product</a><a href="/#developers">Developers</a><a href="/pricing" aria-current="page">Pricing</a></nav>
      <div class="public-bar__actions">
        ${session.user
          ? html`<a href="${session.user.role === 'admin' ? '/app/admin' : '/app'}" class="btn btn--primary btn--sm">Open dashboard</a>`
          : html`<a href="/login" class="btn btn--ghost btn--sm">Sign in</a><a href="/signup" class="btn btn--primary btn--sm">Start free trial</a>`}
      </div>
    </div>`);
}

export function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
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
export async function busy(button, action, busyLabel = 'Working...') {
  const label = button.innerHTML;
  button.disabled = true;
  button.textContent = busyLabel;
  try {
    return await action();
  } catch (err) {
    toast(err.message, 'error');
    return undefined;
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.innerHTML = label;
    }
  }
}

export function errorState(main, err) {
  mount(main, html`<div class="empty"><div class="empty__icon">${icon('alert')}</div><h3>Something went wrong</h3><p class="muted">${err.message}</p><a class="btn" href="">Reload page</a></div>`);
}
