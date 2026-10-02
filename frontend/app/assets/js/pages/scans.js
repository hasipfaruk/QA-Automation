import { get } from '../core/api.js';
import { html, mount } from '../core/html.js';
import { renderShell, flashFromQuery } from '../core/shell.js';
import { pager, bindPager } from '../core/format.js';
import { scanTable } from './components.js';

export async function render({ session, main }) {
  renderShell({ session, active: 'scans', title: 'Scans' });
  flashFromQuery({ deleted: { type: 'success', text: 'Scan deleted.' } });

  async function load(page) {
    const res = await get(`/scans?page=${page}&limit=25`);
    mount(main, html`
      <div class="page-head">
        <div><h1>Scan history</h1><p class="muted">${res.total} scan${res.total === 1 ? '' : 's'}, newest first.</p></div>
        <a href="/app" class="btn btn--dark">New scan</a>
      </div>
      ${scanTable(res.data, { emptyText: 'No scans yet.' })}
      ${pager(res.page, res.pages)}`);
    bindPager(main, load);
  }
  await load(1);
}
