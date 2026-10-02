import { get, post, del } from '../core/api.js';
import { html, mount, $ } from '../core/html.js';
import { renderShell, toast, busy } from '../core/shell.js';
import { hostOf, scoreRing, statusPill, timeAgo, plural, SEVERITIES } from '../core/format.js';

function progressView(scan) {
  const { done, total } = scan.progress;
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return html`<div class="card progress-card">
    <div class="progress-card__head">${statusPill(scan.status)}
      <span class="muted">${scan.status === 'queued' ? 'Waiting for a free scanner...' : `Tested ${done} of up to ${total} page views`}</span></div>
    <div class="meter meter--lg"><i style="width:${pct}%"></i></div>
    <p class="muted small">You can leave this page. The scan keeps running and appears in your history when it is done.</p>
  </div>`;
}

function resultView(scan) {
  const s = scan.summary;
  return html`
    <div class="result-grid">
      <div class="card score-card">${scoreRing(s.score, 'lg')}
        <div><span class="eyebrow">Quality score</span><p class="score-card__grade">${s.grade}</p>
          <p class="muted">${plural(s.totalIssues, 'issue')} on ${plural(s.pagesTested, 'page')}, ${s.durationSec}s</p></div>
      </div>
      ${SEVERITIES.map((k) => html`<div class="card stat"><span class="eyebrow">${k}</span><b class="sev-${k}">${s.bySeverity[k] || 0}</b></div>`)}
      ${s.flowsTotal ? html`<div class="card stat"><span class="eyebrow">User flows</span><b class="${s.flowsPassed === s.flowsTotal ? '' : 'sev-critical'}">${s.flowsPassed}/${s.flowsTotal}</b></div>` : ''}
    </div>
    <div class="actions-row">
      ${scan.reportUrl
        ? html`<a class="btn btn--dark" href="${scan.reportUrl}" target="_blank" rel="noopener">Open full report</a>
               <a class="btn btn--soft" href="${scan.markdownUrl}" download="qa-report-${scan.id}.md">Download Markdown</a>
               <button class="btn btn--soft" type="button" id="copy-link">Copy share link</button>`
        : html`<span class="muted">The full report has expired. Run the scan again to get a new one.</span>`}
      <button class="btn btn--soft" type="button" id="rerun">Run again</button>
    </div>
    <h2 class="section-title">Fix these first</h2>
    ${s.topFixes.length ? html`<ol class="fixes">${s.topFixes.map((f) => html`<li class="fix fix--${f.severity}">
      <div class="fix__head"><span class="sev-pill sev-pill--${f.severity}">${f.severity}</span><b>${f.title}</b>
        <span class="muted small">${plural(f.count, 'occurrence')} on ${plural(f.pages, 'page')}</span></div>
      <p class="fix__how">${f.fix}</p></li>`)}</ol>` : html`<div class="empty-state"><p>No issues found. Nice work.</p></div>`}`;
}

export async function render({ session, params, main }) {
  renderShell({ session, active: 'scans', title: 'Scan' });
  const id = params[0];
  let timer;

  async function load() {
    const scan = await get(`/scans/${encodeURIComponent(id)}`);
    const running = scan.status === 'queued' || scan.status === 'running';
    document.title = `${hostOf(scan.url)} | QA Automation`;
    mount(main, html`
      <div class="page-head">
        <div>
          <a href="/app/scans" class="link small">All scans</a>
          <h1 class="break">${hostOf(scan.url)}</h1>
          <p class="muted break">${scan.url} | ${scan.options.viewports.join(', ')} | up to ${scan.options.maxPages} pages | started ${timeAgo(scan.createdAt)}</p>
        </div>
        ${running ? '' : html`<button class="btn btn--ghost btn--sm" id="delete" type="button">Delete</button>`}
      </div>
      ${running ? progressView(scan) : scan.status === 'failed'
        ? html`<div class="alert alert--error"><b>The scan could not finish.</b> ${scan.error || 'Unknown error.'}</div><button class="btn btn--dark" id="rerun" type="button">Try again</button>`
        : resultView(scan)}`);

    $('#copy-link')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(scan.reportUrl); toast('Share link copied.', 'success'); } catch { toast('Could not copy the link.', 'error'); }
    });
    const rerun = $('#rerun');
    rerun?.addEventListener('click', () => busy(rerun, async () => {
      const next = await post(`/scans/${scan.id}/rerun`);
      window.location.href = `/app/scans/${next.id}`;
    }));
    const remove = $('#delete');
    remove?.addEventListener('click', () => {
      if (!window.confirm('Delete this scan and its report?')) return;
      busy(remove, async () => { await del(`/scans/${scan.id}`); window.location.href = '/app/scans?notice=deleted'; });
    });

    clearTimeout(timer);
    if (running) timer = setTimeout(() => load().catch(() => { timer = setTimeout(load, 4000); }), 2000);
  }
  await load();
}
