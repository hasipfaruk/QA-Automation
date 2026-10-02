import { get } from '../../core/api.js';
import { html, mount, $, formData } from '../../core/html.js';
import { renderShell, flashFromQuery } from '../../core/shell.js';
import { num, timeAgo, dateOnly, planBadge, roleBadge, userStatusBadge, pager, bindPager } from '../../core/format.js';

const option = (value, label, current) => html`<option value="${value}" ${value === current ? 'selected' : ''}>${label}</option>`;

export async function render({ session, main }) {
  renderShell({ session, active: 'admin-users', title: 'Users' });
  flashFromQuery({ deleted: { type: 'success', text: 'User deleted.' } });
  const params = new URLSearchParams(window.location.search);
  const filters = { q: params.get('q') || '', plan: params.get('plan') || '', role: params.get('role') || '', status: params.get('status') || '' };

  async function load(page = 1) {
    const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, limit: 25 });
    const res = await get(`/admin/users?${qs}`);
    mount(main, html`
      <div class="page-head"><div><h1>Users</h1><p class="muted">${num(res.total)} account${res.total === 1 ? '' : 's'}</p></div></div>
      <form id="filters" class="filters card">
        <input name="q" type="search" placeholder="Search email or name" value="${filters.q}" aria-label="Search">
        <select name="plan" aria-label="Plan">${option('', 'All plans', filters.plan)}${['trial', 'pro', 'business', 'enterprise'].map((p) => option(p, p, filters.plan))}</select>
        <select name="role" aria-label="Role">${option('', 'All roles', filters.role)}${option('user', 'user', filters.role)}${option('admin', 'admin', filters.role)}</select>
        <select name="status" aria-label="Status">${option('', 'All statuses', filters.status)}${option('active', 'active', filters.status)}${option('suspended', 'suspended', filters.status)}</select>
        <button class="btn btn--dark" type="submit">Filter</button>
      </form>
      ${res.data.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th>User</th><th>Plan</th><th>Role</th><th>Status</th><th>Scans</th><th>Joined</th><th>Last login</th></tr></thead>
        <tbody>${res.data.map((u) => html`<tr>
          <td><a class="table__main" href="/app/admin/users/${u.id}">${u.email}</a><span class="table__sub">${u.name || '-'}</span></td>
          <td>${planBadge(u.plan)}</td><td>${roleBadge(u.role)}</td><td>${userStatusBadge(u.status)}</td>
          <td>${num(u.scanCount)}</td><td class="nowrap muted">${dateOnly(u.createdAt)}</td><td class="nowrap muted">${timeAgo(u.lastLoginAt)}</td>
        </tr>`)}</tbody></table></div>` : html`<div class="empty-state"><p>No users match these filters.</p></div>`}
      ${pager(res.page, res.pages)}`);

    $('#filters').addEventListener('submit', (e) => {
      e.preventDefault();
      Object.assign(filters, formData(e.target));
      const next = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
      window.history.replaceState(null, '', `/app/admin/users${next.toString() ? `?${next}` : ''}`);
      load(1);
    });
    bindPager(main, load);
  }
  await load(1);
}
