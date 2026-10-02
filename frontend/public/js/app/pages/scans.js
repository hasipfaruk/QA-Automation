import { get } from '../core/api.js';
import { html, mount } from '../core/html.js';
import { renderShell, flashFromQuery } from '../core/layout.js';
import { pager, bindPager } from '../core/format.js';
import { scanTable } from '../components/scan-table.js';

export async function render({ session, main }) {
  renderShell({ session, active: 'scans', title: 'Scans', description: 'Every scan in your workspace, newest first.' });
  flashFromQuery({ deleted: { type: 'success', text: 'Scan deleted.' } });

  async function load(page) {
    const res = await get(`/scans?page=${page}&limit=20`);
    mount(main, html`
      ${scanTable(res.data, { empty: { title: 'No scans yet', text: 'Your scan history will appear here.', action: { href: '/app/scans/new', label: 'Create a scan' } } })}
      ${pager(res.page, res.pages, res.total, 'scans')}`);
    bindPager(main, load);
  }
  await load(1);
}
