import { get, post, del } from '../core/api.js';
import { html, mount, $ } from '../core/html.js';
import { icon } from '../core/icons.js';
import { renderShell, setActions, toast, busy } from '../core/layout.js';
import { hostOf, scoreRing, statusPill, timeAgo, plural, duration, capitalize, sevLabel, SEVERITIES } from '../core/format.js';

const DEVICE_NAMES = { desktop: 'Desktop', laptop: 'Laptop', tablet: 'Tablet', mobile: 'Mobile' };

function progressView(scan) {
  const { done, total } = scan.progress;
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return html`<div class="panel progress-panel">
    <div class="row">${statusPill(scan.status)}<span class="muted">${scan.status === 'queued' ? 'Waiting for an available scanner' : `Tested ${done} of up to ${total} page views (${pct}%)`}</span></div>
    <div class="meter meter--lg"><i style="width:${scan.status === 'queued' ? 2 : pct}%"></i></div>
    <p class="faint small">You can leave this page. The scan keeps running and the results appear in your scan history.</p>
  </div>`;
}

function resultView(scan) {
  const s = scan.summary;
  return html`
    <section class="panel">
      <div class="summary">
        ${scoreRing(s.score, 'lg')}
        <div>
          <span class="faint small">Quality score</span>
          <p class="summary__grade">${s.grade}</p>
          <div class="summary__meta">
            <span>${plural(s.totalIssues, 'issue')}</span>
            <span>${plural(s.pagesTested, 'page')} tested</span>
            <span>${scan.options.viewports.map((v) => DEVICE_NAMES[v]).join(', ')}</span>
            ${s.flowsTotal ? html`<span>User flows ${s.flowsPassed}/${s.flowsTotal} passed</span>` : ''}
            <span>Completed in ${duration(s.durationSec)}</span>
          </div>
        </div>
      </div>
      <div class="sev-grid">${SEVERITIES.map((k) => html`<div><span><i class="dot dot--${k}"></i>${k}</span><b class="text-${k}">${s.bySeverity[k] || 0}</b></div>`)}</div>
    </section>

    <div class="section-title"><h2>Fix these first</h2><span class="faint small">Ordered by severity and number of affected pages</span></div>
    ${s.topFixes.length
      ? html`<section class="panel"><ol class="fix-list">${s.topFixes.map((f) => html`<li>
          <div>${sevLabel(f.severity)}</div>
          <div><h4>${f.title}</h4><span class="faint small">${capitalize(f.category)} | ${plural(f.count, 'occurrence')} on ${plural(f.pages, 'page')}</span><p>${f.fix}</p></div>
        </li>`)}</ol></section>`
      : html`<div class="empty"><div class="empty__icon">${icon('check')}</div><h3>No issues found</h3><p class="muted">Every check passed on the pages tested.</p></div>`}
    ${scan.reportUrl ? '' : html`<p class="faint small" style="margin-top:16px">The full report has expired under your plan's retention period. Run the scan again for a new report.</p>`}`;
}

export async function render({ session, params, main }) {
  renderShell({ session, active: 'scans', title: 'Scan', description: '' });
  const id = params[0];
  let timer;

  async function load() {
    const scan = await get(`/scans/${encodeURIComponent(id)}`);
    const running = scan.status === 'queued' || scan.status === 'running';
    document.title = `${hostOf(scan.url)} | Proofline`;
    $('.topbar__title').innerHTML = String(html`<h1>${hostOf(scan.url)}</h1><p class="muted small">${scan.url} | started ${timeAgo(scan.createdAt)}</p>`);

    setActions(html`
      ${scan.reportUrl ? html`
        <button class="btn btn--sm" type="button" id="copy-link">${icon('copy')} Copy link</button>
        <a class="btn btn--sm" href="${scan.markdownUrl}" download="proofline-${scan.id}.md">${icon('download')} Markdown</a>
        <a class="btn btn--primary btn--sm" href="${scan.reportUrl}" target="_blank" rel="noopener">Open full report ${icon('external')}</a>` : ''}
      ${running ? '' : html`<button class="btn btn--sm" type="button" id="rerun">${icon('refresh')} Run again</button>
        <button class="icon-btn" type="button" id="delete" aria-label="Delete scan" title="Delete scan">${icon('trash')}</button>`}`);

    mount(main, html`
      <a href="/app/scans" class="back-link">${icon('arrowLeft')} All scans</a>
      ${running ? progressView(scan) : scan.status === 'failed'
        ? html`<div class="alert alert--danger">${icon('alert')}<div><b>This scan could not finish.</b> ${scan.error || 'An unknown error occurred.'} Check that the website is reachable and try again.</div></div>`
        : resultView(scan)}`);

    $('#copy-link')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(scan.reportUrl); toast('Report link copied. Anyone with the link can view it.', 'success'); } catch { toast('Could not copy the link.', 'error'); }
    });
    const rerun = $('#rerun');
    rerun?.addEventListener('click', () => busy(rerun, async () => {
      const next = await post(`/scans/${scan.id}/rerun`);
      window.location.href = `/app/scans/${next.id}`;
    }, 'Starting...'));
    const remove = $('#delete');
    remove?.addEventListener('click', () => {
      if (!window.confirm('Delete this scan and its report? This cannot be undone.')) return;
      busy(remove, async () => { await del(`/scans/${scan.id}`); window.location.href = '/app/scans?notice=deleted'; });
    });

    clearTimeout(timer);
    if (running) timer = setTimeout(() => load().catch(() => { timer = setTimeout(load, 4000); }), 2000);
  }
  await load();
}
