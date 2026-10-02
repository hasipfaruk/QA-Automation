import { get, post, del } from '../core/api.js';
import { html, mount, $, $$ } from '../core/html.js';
import { icon } from '../core/icons.js';
import { renderShell, toast, busy } from '../core/layout.js';
import { timeAgo, dateOnly } from '../core/format.js';

function examples(origin, token) {
  const t = token || '$PROOFLINE_TOKEN';
  return {
    curl: `# Start a scan
curl -X POST ${origin}/api/v1/scans \\
  -H "Authorization: Bearer ${t}" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://staging.example.com", "viewports": ["desktop", "mobile"]}'

# Check the result (repeat until status is "done")
curl ${origin}/api/v1/scans/SCAN_ID \\
  -H "Authorization: Bearer ${t}"`,
    actions: `- name: Proofline scan
  env:
    PROOFLINE_TOKEN: \${{ secrets.PROOFLINE_TOKEN }}
  run: |
    ID=$(curl -s -X POST ${origin}/api/v1/scans \\
      -H "Authorization: Bearer $PROOFLINE_TOKEN" -H "Content-Type: application/json" \\
      -d '{"url":"https://staging.example.com"}' | jq -r .id)
    until [[ "$(curl -s ${origin}/api/v1/scans/$ID -H "Authorization: Bearer $PROOFLINE_TOKEN" | jq -r .status)" =~ done|failed ]]; do sleep 10; done
    RES=$(curl -s ${origin}/api/v1/scans/$ID -H "Authorization: Bearer $PROOFLINE_TOKEN")
    echo "$RES" | jq '{score, reportUrl}'
    test "$(echo "$RES" | jq .summary.bySeverity.critical)" = "0"`,
    node: `const res = await fetch('${origin}/api/v1/scans', {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${process.env.PROOFLINE_TOKEN}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ url: 'https://staging.example.com', maxPages: 20 }),
});
const scan = await res.json();
console.log(scan.id, scan.status);`,
  };
}

const TABS = [['curl', 'cURL'], ['actions', 'GitHub Actions'], ['node', 'Node.js']];

export async function render({ session, main }) {
  renderShell({ session, active: 'api', title: 'API and CI', description: 'Start scans from pipelines, scripts and any programming language.' });
  const origin = window.location.origin;
  let newToken = null;
  let tab = 'curl';

  async function load() {
    const { data: tokens } = await get('/tokens');
    const code = examples(origin, newToken);
    mount(main, html`
      ${newToken ? html`<div class="alert alert--success">${icon('check')}<div><b>Token created.</b> Copy it now. For your security it will not be shown again.
        <div class="token-reveal"><code>${newToken}</code><button class="btn btn--sm" type="button" id="copy-token">${icon('copy')} Copy</button></div></div></div>` : ''}

      <section class="panel">
        <div class="panel__head"><div><h2>API tokens</h2><p class="muted small">Tokens act on behalf of your account. Store them as secrets and revoke any you no longer use.</p></div></div>
        <div class="panel__body">
          <form id="token-form" class="inline-form">
            <label class="sr-only" for="token-name">Token name</label>
            <input class="input" id="token-name" name="name" type="text" placeholder="Token name, for example: Production pipeline" maxlength="60" required>
            <button class="btn btn--primary" type="submit">${icon('plus')} Create token</button>
          </form>
        </div>
        ${tokens.length ? html`<div class="table-wrap" style="border:0;border-top:1px solid var(--border);border-radius:0 0 var(--radius-lg) var(--radius-lg)"><table class="table">
          <thead><tr><th>Name</th><th>Token</th><th>Created</th><th>Last used</th><th class="table__actions"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>${tokens.map((t) => html`<tr>
            <td class="table__primary">${t.name}</td>
            <td><code class="muted">${t.prefix}...</code></td>
            <td class="muted small nowrap">${dateOnly(t.createdAt)}</td>
            <td class="muted small nowrap">${t.lastUsedAt ? timeAgo(t.lastUsedAt) : 'Never'}</td>
            <td class="table__actions"><button class="btn btn--sm btn--danger" type="button" data-revoke="${t.id}">Revoke</button></td>
          </tr>`)}</tbody></table></div>` : ''}
      </section>

      <div class="section-title"><h2>Integration examples</h2><span class="faint small">Replace the URL with the site you want to test</span></div>
      <section class="panel">
        <div class="panel__body">
          <div class="tabs" role="tablist">${TABS.map(([id, label]) => html`<button type="button" role="tab" data-tab="${id}" class="${id === tab ? 'is-active' : ''}" aria-selected="${id === tab}">${label}</button>`)}</div>
          <pre class="code"><code>${code[tab]}</code></pre>
          <p class="faint small" style="margin-top:12px">Responses are JSON. A scan has a status of queued, running, done or failed, plus score, summary and report links when done.</p>
        </div>
      </section>`);

    $('#copy-token')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(newToken); toast('Token copied.', 'success'); } catch { toast('Copy failed. Select the token and copy it manually.', 'error'); }
    });
    $('#token-form').addEventListener('submit', (e) => {
      e.preventDefault();
      busy(e.target.querySelector('button'), async () => {
        const res = await post('/tokens', { name: $('#token-name').value });
        newToken = res.token;
        await load();
      }, 'Creating...');
    });
    $$('[data-revoke]').forEach((b) => b.addEventListener('click', () => {
      if (!window.confirm('Revoke this token? Anything using it will stop working immediately.')) return;
      busy(b, async () => { await del(`/tokens/${b.dataset.revoke}`); newToken = null; await load(); toast('Token revoked.', 'success'); });
    }));
    $$('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; load(); }));
  }
  await load();
}
