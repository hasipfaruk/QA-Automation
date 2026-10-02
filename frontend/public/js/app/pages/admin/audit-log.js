import { get } from '../../core/api.js';
import { html, mount, $, formData } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { renderShell } from '../../core/layout.js';
import { dateTime, pager, bindPager } from '../../core/format.js';

const ACTIONS = [
  ['', 'All events'],
  ['user.', 'Account activity'],
  ['user.login_failed', 'Failed sign-ins'],
  ['user.login_blocked', 'Blocked sign-ins'],
  ['admin.', 'Administrator actions'],
  ['billing.', 'Billing'],
  ['token.', 'API tokens'],
];

const LABELS = {
  'user.signup': 'Account created',
  'user.login': 'Signed in',
  'user.logout': 'Signed out',
  'user.login_failed': 'Failed sign-in',
  'user.login_blocked': 'Blocked sign-in',
  'user.password_changed': 'Password changed',
  'user.deleted_self': 'Account deleted by owner',
  'token.created': 'API token created',
  'token.revoked': 'API token revoked',
  'billing.plan_changed': 'Plan changed by billing',
  'billing.dev_plan_switch': 'Plan switched (development)',
  'admin.user_updated': 'Account updated by admin',
  'admin.user_signed_out': 'Sessions ended by admin',
  'admin.user_deleted': 'Account deleted by admin',
  'admin.scan_deleted': 'Scan deleted by admin',
};

const tone = (action) => (/failed|blocked|deleted/.test(action) ? 'danger' : action.startsWith('admin.') ? 'accent' : action.startsWith('billing.') ? 'info' : '');

function describe(details) {
  if (!details) return '';
  if (details.changes) return Object.entries(details.changes).map(([k, v]) => `${k}: ${v.from} to ${v.to}`).join(', ');
  return Object.entries(details).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ');
}

export async function render({ session, main }) {
  renderShell({ session, active: 'admin-audit', title: 'Audit log', description: 'Security and administrative events. Entries cannot be edited or deleted.' });
  const filters = { action: '', q: '' };

  async function load(page = 1) {
    const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, limit: 50 });
    const res = await get(`/admin/audit?${qs}`);
    mount(main, html`
      <form id="filters" class="filters" role="search">
        <select class="select" name="action" aria-label="Event type">${ACTIONS.map(([v, l]) => html`<option value="${v}" ${v === filters.action ? 'selected' : ''}>${l}</option>`)}</select>
        <input class="input" name="q" type="search" placeholder="Search by actor email or target id" value="${filters.q}" aria-label="Search events">
        <button class="btn btn--primary" type="submit">${icon('search')} Apply</button>
      </form>
      ${res.data.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th>Event</th><th>Actor</th><th>Target</th><th>Details</th><th>IP address</th><th>Time</th></tr></thead>
        <tbody>${res.data.map((e) => html`<tr>
          <td><span class="badge ${tone(e.action) ? `badge--${tone(e.action)}` : ''}">${LABELS[e.action] || e.action}</span></td>
          <td class="small">${e.actorEmail || 'System'}</td>
          <td class="small">${e.targetType === 'user' && e.targetId ? html`<a class="link" href="/app/admin/users/${e.targetId}">Account ${e.targetId}</a>` : e.targetType ? `${e.targetType} ${e.targetId || ''}` : '-'}</td>
          <td class="small muted">${describe(e.details)}</td>
          <td class="small muted mono nowrap">${e.ip || '-'}</td>
          <td class="small muted nowrap">${dateTime(e.createdAt)}</td>
        </tr>`)}</tbody></table></div>`
        : html`<div class="empty"><div class="empty__icon">${icon('shield')}</div><h3>No matching events</h3><p class="muted">Try a different event type or search.</p></div>`}
      ${pager(res.page, res.pages, res.total, 'events')}`);

    $('#filters').addEventListener('submit', (e) => {
      e.preventDefault();
      Object.assign(filters, formData(e.target));
      load(1);
    });
    bindPager(main, load);
  }
  await load(1);
}
