import { get, post, del } from '../core/api.js';
import { html, mount, $, $$ } from '../core/html.js';
import { renderShell, toast, busy } from '../core/shell.js';
import { timeAgo } from '../core/format.js';

function docs(origin, token) {
  const t = token || 'YOUR_API_TOKEN';
  return html`
    <div class="card docs">
      <h2 class="card-title">Quick start</h2>
      <p class="muted small">1. Start a scan</p>
      <pre><code>curl -X POST ${origin}/api/v1/scans \\
  -H "Authorization: Bearer ${t}" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://your-site.com", "viewports": ["desktop", "mobile"]}'</code></pre>
      <p class="muted small">2. Check the result until status is "done"</p>
      <pre><code>curl ${origin}/api/v1/scans/SCAN_ID \\
  -H "Authorization: Bearer ${t}"</code></pre>
      <p class="muted small">Endpoints</p>
      <ul class="endpoints">
        <li><code>GET /api/v1/me</code> plan and usage</li>
        <li><code>POST /api/v1/scans</code> start a scan: url, viewports, maxPages, checkExternalLinks, ai, visual, flows, login</li>
        <li><code>GET /api/v1/scans</code> list scans</li>
        <li><code>GET /api/v1/scans/:id</code> status, score, summary, reportUrl</li>
        <li><code>POST /api/v1/scans/:id/rerun</code> run the same scan again</li>
        <li><code>DELETE /api/v1/scans/:id</code> delete a scan</li>
      </ul>
    </div>`;
}

function ciExample(origin) {
  return html`<div class="card docs">
    <h2 class="card-title">CI pipeline example</h2>
    <p class="muted small">Save the token as a secret named QA_TOKEN. The job fails when the scan finds critical issues.</p>
    <pre><code>ID=$(curl -s -X POST ${origin}/api/v1/scans -H "Authorization: Bearer $QA_TOKEN" \\
  -H "Content-Type: application/json" -d '{"url":"https://staging.your-site.com"}' | jq -r .id)
while :; do
  RES=$(curl -s ${origin}/api/v1/scans/$ID -H "Authorization: Bearer $QA_TOKEN")
  STATUS=$(echo "$RES" | jq -r .status)
  [ "$STATUS" = "done" ] || [ "$STATUS" = "failed" ] &amp;&amp; break
  sleep 10
done
echo "$RES" | jq '{score, reportUrl, critical: .summary.bySeverity.critical}'
[ "$(echo "$RES" | jq .summary.bySeverity.critical)" = "0" ]</code></pre>
  </div>`;
}

export async function render({ session, main }) {
  renderShell({ session, active: 'api', title: 'API' });
  const origin = window.location.origin;
  let newToken = null;

  async function load() {
    const { data: tokens } = await get('/tokens');
    mount(main, html`
      <div class="page-head"><div><h1>API and CI</h1>
        <p class="muted">Start scans from scripts, CI pipelines or any programming language with an HTTP client.</p></div></div>
      ${newToken ? html`<div class="alert alert--success"><b>Your new API token.</b> Copy it now; it will not be shown again.
        <div class="token-box"><code>${newToken}</code><button class="btn btn--soft btn--sm" type="button" id="copy-token">Copy</button></div></div>` : ''}
      <div class="grid-2">
        <div class="card">
          <h2 class="card-title">API tokens</h2>
          ${tokens.length ? html`<ul class="token-list">${tokens.map((t) => html`<li>
            <div><b>${t.name}</b><span class="muted small"><code>${t.prefix}...</code> created ${timeAgo(t.createdAt)}, ${t.lastUsedAt ? `last used ${timeAgo(t.lastUsedAt)}` : 'never used'}</span></div>
            <button class="btn btn--ghost btn--sm" data-revoke="${t.id}" type="button">Revoke</button></li>`)}</ul>` : html`<p class="muted">No tokens yet.</p>`}
          <form id="token-form" class="inline-form">
            <input name="name" type="text" placeholder="Token name, e.g. CI pipeline" maxlength="60" required aria-label="Token name">
            <button class="btn btn--dark" type="submit">Create token</button>
          </form>
        </div>
        ${docs(origin, newToken)}
      </div>
      ${ciExample(origin)}`);

    $('#copy-token')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(newToken); toast('Token copied.', 'success'); } catch { toast('Copy failed. Select the token and copy it manually.', 'error'); }
    });
    $('#token-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = e.target.elements.name;
      busy(e.target.querySelector('button'), async () => {
        const res = await post('/tokens', { name: input.value });
        newToken = res.token;
        await load();
      });
    });
    $$('[data-revoke]').forEach((b) => b.addEventListener('click', () => {
      if (!window.confirm('Revoke this token? Anything using it will stop working.')) return;
      busy(b, async () => { await del(`/tokens/${b.dataset.revoke}`); newToken = null; await load(); toast('Token revoked.', 'success'); });
    }));
  }
  await load();
}
