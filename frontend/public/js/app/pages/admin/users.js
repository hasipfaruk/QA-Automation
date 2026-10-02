import { get } from '../../core/api.js';
import { html, mount, $, formData } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { renderShell, flashFromQuery } from '../../core/layout.js';
import { num, timeAgo, dateOnly, planBadge, roleBadge, userStatusBadge, pager, bindPager } from '../../core/format.js';

const option = (value, label, current) => html`<option value="${value}" ${value === current ? 'selected' : ''}>${label}</option>`;

export async function render({ session, main }) {
  renderShell({ session, active: 'admin-users', title: 'Customers', description: 'Every account on the platform.' });
  flashFromQuery({ deleted: { type: 'success', text: 'Account deleted.' } });
  const params = new URLSearchParams(window.location.search);
  const filters = { q: params.get('q') || '', plan: params.get('plan') || '', role: params.get('role') || '', status: params.get('status') || '' };

  async function load(page = 1) {
    const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, limit: 20 });
    const res = await get(`/admin/users?${qs}`);
    mount(main, html`
      <form id="filters" class="filters" role="search">
        <input class="input" name="q" type="search" placeholder="Search by name or email" value="${filters.q}" aria-label="Search customers">
        <select class="select" name="plan" aria-label="Plan">${option('', 'All plans', filters.plan)}${['trial', 'pro', 'business', 'enterprise'].map((p) => option(p, p[0].toUpperCase() + p.slice(1), filters.plan))}</select>
        <select class="select" name="role" aria-label="Role">${option('', 'All roles', filters.role)}${option('user', 'Customers', filters.role)}${option('admin', 'Administrators', filters.role)}</select>
        <select class="select" name="status" aria-label="Status">${option('', 'All statuses', filters.status)}${option('active', 'Active', filters.status)}${option('suspended', 'Suspended', filters.status)}</select>
        <button class="btn btn--primary" type="submit">${icon('search')} Apply</button>
      </form>
      ${res.data.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th>Account</th><th>Plan</th><th>Role</th><th>Status</th><th>Scans</th><th>Joined</th><th>Last sign-in</th></tr></thead>
        <tbody>${res.data.map((u) => html`<tr>
          <td><a class="table__primary" href="/app/admin/users/${u.id}">${u.name || u.email}</a><span class="table__secondary">${u.email}</span></td>
          <td>${planBadge(u.plan)}</td><td>${roleBadge(u.role)}</td><td>${userStatusBadge(u.status)}</td>
          <td>${num(u.scanCount)}</td><td class="nowrap muted small">${dateOnly(u.createdAt)}</td><td class="nowrap muted small">${timeAgo(u.lastLoginAt)}</td>
        </tr>`)}</tbody></table></div>`
        : html`<div class="empty"><div class="empty__icon">${icon('users')}</div><h3>No matching accounts</h3><p class="muted">Try a different search or clear the filters.</p></div>`}
      ${pager(res.page, res.pages, res.total, 'accounts')}`);

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
