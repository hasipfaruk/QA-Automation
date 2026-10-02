import { get, del } from '../../core/api.js';
import { html, mount, $, $$, formData } from '../../core/html.js';
import { renderShell, toast, busy } from '../../core/layout.js';
import { num, hostOf, scoreRing, statusPill, severityDots, timeAgo, pager, bindPager } from '../../core/format.js';

const STATUSES = ['queued', 'running', 'done', 'failed'];

export async function render({ session, main }) {
  renderShell({ session, active: 'admin-scans', title: 'All scans' });
  const params = new URLSearchParams(window.location.search);
  const filters = { q: params.get('q') || '', status: params.get('status') || '' };

  async function load(page = 1) {
    const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, limit: 25 });
    const res = await get(`/admin/scans?${qs}`);
    mount(main, html`
      <div class="page-head"><div><h1>All scans</h1><p class="muted">${num(res.total)} scan${res.total === 1 ? '' : 's'} across all customers</p></div></div>
      <form id="filters" class="filters card">
        <input name="q" type="search" placeholder="Search URL or customer email" value="${filters.q}" aria-label="Search">
        <select name="status" aria-label="Status"><option value="">All statuses</option>${STATUSES.map((s) => html`<option value="${s}" ${s === filters.status ? 'selected' : ''}>${s}</option>`)}</select>
        <button class="btn btn--dark" type="submit">Filter</button>
      </form>
      ${res.data.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th>Site</th><th>Customer</th><th>Status</th><th>Score</th><th>Issues</th><th>Source</th><th>Started</th><th></th></tr></thead>
        <tbody>${res.data.map((s) => html`<tr>
          <td><span class="table__main">${hostOf(s.url)}</span><span class="table__sub">${s.url}</span>${s.error ? html`<span class="table__sub sev-critical">${s.error}</span>` : ''}</td>
          <td><a class="link small" href="/app/admin/users/${s.userId}">${s.userEmail}</a></td>
          <td>${statusPill(s.status)}</td><td>${scoreRing(s.score)}</td><td>${severityDots(s.summary?.bySeverity)}</td>
          <td class="muted small">${s.source}</td><td class="nowrap muted">${timeAgo(s.createdAt)}</td>
          <td class="table__action nowrap">
            ${s.reportUrl ? html`<a class="link" href="${s.reportUrl}" target="_blank" rel="noopener">Report</a>` : ''}
            ${s.status === 'running' ? '' : html`<button class="btn btn--ghost btn--sm" data-delete="${s.id}" type="button">Delete</button>`}
          </td>
        </tr>`)}</tbody></table></div>` : html`<div class="empty-state"><p>No scans match these filters.</p></div>`}
      ${pager(res.page, res.pages)}`);

    $('#filters').addEventListener('submit', (e) => {
      e.preventDefault();
      Object.assign(filters, formData(e.target));
      const next = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
      window.history.replaceState(null, '', `/app/admin/scans${next.toString() ? `?${next}` : ''}`);
      load(1);
    });
    $$('[data-delete]').forEach((b) => b.addEventListener('click', () => {
      if (!window.confirm('Delete this scan and its report for the customer?')) return;
      busy(b, async () => { await del(`/admin/scans/${b.dataset.delete}`); toast('Scan deleted.', 'success'); await load(page); });
    }));
    bindPager(main, load);
  }
  await load(1);
}
