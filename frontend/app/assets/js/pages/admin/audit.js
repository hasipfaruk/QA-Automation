import { get } from '../../core/api.js';
import { html, mount, $, formData } from '../../core/html.js';
import { renderShell } from '../../core/shell.js';
import { num, dateTime, pager, bindPager } from '../../core/format.js';

const ACTIONS = [
  ['', 'All actions'],
  ['user.', 'User activity'],
  ['user.login_failed', 'Failed logins'],
  ['admin.', 'Admin actions'],
  ['billing.', 'Billing'],
  ['token.', 'API tokens'],
];

const tone = (action) => (/failed|blocked|deleted|suspend/.test(action) ? 'danger' : action.startsWith('admin.') ? 'dark' : 'neutral');

function describe(details) {
  if (!details) return '';
  if (details.changes) return Object.entries(details.changes).map(([k, v]) => `${k}: ${v.from} -> ${v.to}`).join(', ');
  return Object.entries(details).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ');
}

export async function render({ session, main }) {
  renderShell({ session, active: 'admin-audit', title: 'Audit log' });
  const filters = { action: '', q: '' };

  async function load(page = 1) {
    const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, limit: 50 });
    const res = await get(`/admin/audit?${qs}`);
    mount(main, html`
      <div class="page-head"><div><h1>Audit log</h1><p class="muted">${num(res.total)} recorded event${res.total === 1 ? '' : 's'}. Entries cannot be edited or deleted.</p></div></div>
      <form id="filters" class="filters card">
        <select name="action" aria-label="Action">${ACTIONS.map(([v, l]) => html`<option value="${v}" ${v === filters.action ? 'selected' : ''}>${l}</option>`)}</select>
        <input name="q" type="search" placeholder="Actor email or target id" value="${filters.q}" aria-label="Search">
        <button class="btn btn--dark" type="submit">Filter</button>
      </form>
      ${res.data.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th>Time</th><th>Action</th><th>Actor</th><th>Target</th><th>Details</th><th>IP</th></tr></thead>
        <tbody>${res.data.map((e) => html`<tr>
          <td class="nowrap muted small">${dateTime(e.createdAt)}</td>
          <td><span class="badge badge--${tone(e.action)}">${e.action}</span></td>
          <td class="small">${e.actorEmail || 'system'}</td>
          <td class="small">${e.targetType ? html`${e.targetType === 'user' && e.targetId ? html`<a class="link" href="/app/admin/users/${e.targetId}">user ${e.targetId}</a>` : `${e.targetType} ${e.targetId || ''}`}` : '-'}</td>
          <td class="small muted">${describe(e.details)}</td>
          <td class="small muted nowrap">${e.ip || '-'}</td>
        </tr>`)}</tbody></table></div>` : html`<div class="empty-state"><p>No events match these filters.</p></div>`}
      ${pager(res.page, res.pages)}`);

    $('#filters').addEventListener('submit', (e) => {
      e.preventDefault();
      Object.assign(filters, formData(e.target));
      load(1);
    });
    bindPager(main, load);
  }
  await load(1);
}
