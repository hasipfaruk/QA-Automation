import { get, del } from '../../core/api.js';
import { html, mount, $, $$, formData } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { renderShell, toast, busy } from '../../core/layout.js';
import { pager, bindPager } from '../../core/format.js';
import { scanTable } from '../../components/scan-table.js';

const STATUSES = [['queued', 'Queued'], ['running', 'Running'], ['done', 'Completed'], ['failed', 'Failed']];

export async function render({ session, main }) {
  renderShell({ session, active: 'admin-scans', title: 'Scans', description: 'Scanning activity across all customers.' });
  const params = new URLSearchParams(window.location.search);
  const filters = { q: params.get('q') || '', status: params.get('status') || '' };

  async function load(page = 1) {
    const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, limit: 20 });
    const res = await get(`/admin/scans?${qs}`);
    mount(main, html`
      <form id="filters" class="filters" role="search">
        <input class="input" name="q" type="search" placeholder="Search by website or customer email" value="${filters.q}" aria-label="Search scans">
        <select class="select" name="status" aria-label="Status"><option value="">All statuses</option>${STATUSES.map(([v, l]) => html`<option value="${v}" ${v === filters.status ? 'selected' : ''}>${l}</option>`)}</select>
        <button class="btn btn--primary" type="submit">${icon('search')} Apply</button>
      </form>
      ${scanTable(res.data, {
        showOwner: true,
        empty: { title: 'No matching scans', text: 'Try a different search or status.' },
        hrefFor: (s) => s.reportUrl || `/app/admin/users/${s.userId}`,
        actions: (s) => html`
          ${s.reportUrl ? html`<a class="btn btn--sm btn--ghost" href="${s.reportUrl}" target="_blank" rel="noopener">Report</a>` : ''}
          ${s.status === 'running' ? '' : html`<button class="btn btn--sm btn--danger" data-delete="${s.id}" type="button">Delete</button>`}`,
      })}
      ${pager(res.page, res.pages, res.total, 'scans')}`);

    $('#filters').addEventListener('submit', (e) => {
      e.preventDefault();
      Object.assign(filters, formData(e.target));
      const next = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
      window.history.replaceState(null, '', `/app/admin/scans${next.toString() ? `?${next}` : ''}`);
      load(1);
    });
    $$('[data-delete]').forEach((b) => b.addEventListener('click', () => {
      if (!window.confirm('Delete this scan and its report for the customer? This cannot be undone.')) return;
      busy(b, async () => { await del(`/admin/scans/${b.dataset.delete}`); toast('Scan deleted.', 'success'); await load(page); });
    }));
    bindPager(main, load);
  }
  await load(1);
}
