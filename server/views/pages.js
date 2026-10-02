import { html, timeAgo, hostOf, SEVERITIES } from './html.js';
import { appLayout, authLayout, publicLayout, csrfField } from './layout.js';
import { PLANS, planFeatures, planFor } from '../plans.js';

const VIEWPORT_LABELS = { desktop: 'Desktop 1440px', laptop: 'Laptop 1280px', tablet: 'Tablet 768px', mobile: 'Mobile 390px' };
const STATUS_LABELS = { queued: 'Queued', running: 'Running', done: 'Done', failed: 'Failed' };

const FLOW_EXAMPLE = `[
  {
    "name": "Search works",
    "steps": [
      { "goto": "/" },
      { "fill": "input[type=search]", "value": "shoes" },
      { "press": "Enter" },
      { "expectVisible": ".results" }
    ]
  }
]`;

const LOGIN_EXAMPLE = `{
  "loginUrl": "/login",
  "steps": [
    { "fill": "#email", "value": "qa@yourcompany.com" },
    { "fill": "#password", "value": "test-account-password" },
    { "click": "button[type=submit]" },
    { "expectUrl": "/dashboard" }
  ]
}`;

const scoreClass = (score) => (score == null ? '' : score >= 90 ? 'score--a' : score >= 75 ? 'score--b' : score >= 60 ? 'score--c' : 'score--f');
const statusPill = (status) => html`<span class="status status--${status}">${STATUS_LABELS[status] || status}</span>`;
const lockTag = (planName) => html`<span class="tag tag--lavender">${planName}</span>`;

function scoreRing(score, size = 'sm') {
  if (score == null) return html`<span class="ring ring--${size} ring--empty">-</span>`;
  return html`<span class="ring ring--${size} ${scoreClass(score)}" style="--p:${score}"><span>${score}</span></span>`;
}

function usageMeter(usage) {
  const pct = Math.min(100, Math.round((usage.used / usage.limit) * 100));
  return html`
    <div class="card usage">
      <div class="usage__head">
        <span class="eyebrow">This month</span>
        <a href="/app/billing" class="link">${usage.plan.name} plan</a>
      </div>
      <p class="usage__num"><b>${usage.used}</b> <span class="muted">of ${usage.limit.toLocaleString('en-US')} scans used</span></p>
      <div class="meter" role="progressbar" aria-valuenow="${usage.used}" aria-valuemin="0" aria-valuemax="${usage.limit}"><i style="width:${pct}%"></i></div>
      ${usage.remaining === 0 ? html`<p class="usage__warn">Limit reached. <a href="/app/billing">Upgrade</a> to keep scanning.</p>` : ''}
    </div>`;
}

function scanRows(scans) {
  if (!scans.length) {
    return html`<div class="empty-state"><p>No scans yet. Paste a URL above to run your first one.</p></div>`;
  }
  return html`
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Site</th><th>Status</th><th>Score</th><th>Issues</th><th>Started</th><th></th></tr></thead>
        <tbody>
          ${scans.map((s) => {
            const summary = s.summary ? JSON.parse(s.summary) : null;
            return html`<tr>
              <td><a href="/app/scans/${s.id}" class="table__main">${hostOf(s.url)}</a><span class="table__sub">${s.url}</span></td>
              <td>${statusPill(s.status)}</td>
              <td>${scoreRing(s.score)}</td>
              <td>${summary ? html`<span class="sev-counts">${SEVERITIES.filter((k) => summary.bySeverity[k]).map((k) => html`<span class="dot dot--${k}" title="${k}"></span>${summary.bySeverity[k]} `)}</span>` : html`<span class="muted">-</span>`}</td>
              <td class="muted nowrap">${timeAgo(s.created_at)}</td>
              <td class="table__action"><a href="/app/scans/${s.id}" class="link">Open</a></td>
            </tr>`;
          })}
        </tbody>
      </table>
    </div>`;
}

export function newScanForm({ csrfToken, user, aiAvailable, values = {}, error }) {
  const plan = planFor(user);
  const chosen = new Set(values.viewports || ['desktop', 'mobile']);
  return html`
    <form method="post" action="/app/scans" class="card scan-form" id="new-scan">
      ${csrfField(csrfToken)}
      <label for="url" class="scan-form__label">Website URL</label>
      <div class="scan-form__row">
        <input id="url" name="url" type="text" inputmode="url" autocomplete="url" placeholder="https://your-site.com" value="${values.url || ''}" required>
        <button class="btn btn--dark" type="submit">Start scan</button>
      </div>
      ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}

      <details class="options" ${values.open ? 'open' : ''}>
        <summary>Scan options</summary>
        <div class="options__grid">
          <fieldset>
            <legend>Devices</legend>
            ${Object.entries(VIEWPORT_LABELS).map(([id, label]) => {
              const allowed = plan.viewports.includes(id);
              return html`<label class="check ${allowed ? '' : 'is-locked'}">
                <input type="checkbox" name="viewports" value="${id}" ${chosen.has(id) && allowed ? 'checked' : ''} ${allowed ? '' : 'disabled'}>
                ${label} ${allowed ? '' : lockTag('Pro')}
              </label>`;
            })}
          </fieldset>
          <fieldset>
            <legend>Crawl</legend>
            <label class="field">
              <span>Max pages <span class="muted">(plan limit ${plan.maxPages})</span></span>
              <input type="number" name="maxPages" min="1" max="${plan.maxPages}" value="${values.maxPages || Math.min(10, plan.maxPages)}">
            </label>
            <label class="check"><input type="checkbox" name="checkExternalLinks" value="true" ${values.checkExternalLinks === false ? '' : 'checked'}> Check external links</label>
          </fieldset>
          <fieldset>
            <legend>Extras</legend>
            <label class="check ${plan.ai && aiAvailable ? '' : 'is-locked'}">
              <input type="checkbox" name="ai" value="true" ${values.ai ? 'checked' : ''} ${plan.ai && aiAvailable ? '' : 'disabled'}>
              AI design review ${plan.ai ? (aiAvailable ? '' : html`<span class="muted">(not configured)</span>`) : lockTag('Pro')}
            </label>
            <label class="field">
              <span>Visual regression ${plan.visual ? '' : lockTag('Pro')}</span>
              <select name="visual" ${plan.visual ? '' : 'disabled'}>
                <option value="off">Off</option>
                <option value="compare" ${values.visual === 'compare' ? 'selected' : ''}>Compare with baseline</option>
                <option value="update" ${values.visual === 'update' ? 'selected' : ''}>Save as new baseline</option>
              </select>
            </label>
          </fieldset>
        </div>
        <div class="options__advanced ${plan.flows ? '' : 'is-locked'}">
          <label class="field">
            <span>User flows (JSON) ${plan.flows ? '' : lockTag('Pro')}</span>
            <textarea name="flows" rows="6" spellcheck="false" placeholder="${FLOW_EXAMPLE}" ${plan.flows ? '' : 'disabled'}>${values.flows || ''}</textarea>
          </label>
          <label class="field">
            <span>Login steps (JSON) ${plan.flows ? '' : lockTag('Pro')} <span class="muted">Use a dedicated test account.</span></span>
            <textarea name="login" rows="6" spellcheck="false" placeholder="${LOGIN_EXAMPLE}" ${plan.flows ? '' : 'disabled'}>${values.login || ''}</textarea>
          </label>
          <p class="muted small">Step actions: goto, click, fill, type, select, check, uncheck, hover, press, wait, expectText, expectNoText, expectVisible, expectUrl.</p>
        </div>
      </details>
    </form>`;
}

export function dashboardPage({ user, csrfToken, usage, scans, aiAvailable, formValues, formError, notice }) {
  return appLayout({
    title: 'Dashboard', user, csrfToken, active: 'dashboard', notice,
    body: html`
      <div class="page-head">
        <div>
          <h1>Run a scan</h1>
          <p class="muted">Paste any public URL. Every page is tested in a real browser and you get a fix list with screenshots.</p>
        </div>
      </div>
      <div class="grid-main">
        ${newScanForm({ csrfToken, user, aiAvailable, values: formValues, error: formError })}
        ${usageMeter(usage)}
      </div>
      <div class="section-head-row">
        <h2>Recent scans</h2>
        ${scans.length ? html`<a href="/app/scans" class="link">View all</a>` : ''}
      </div>
      ${scanRows(scans)}`,
  });
}

export function scansPage({ user, csrfToken, scans, page, pages }) {
  return appLayout({
    title: 'Scans', user, csrfToken, active: 'scans',
    body: html`
      <div class="page-head">
        <div><h1>Scan history</h1><p class="muted">Every scan you have run, newest first.</p></div>
        <a href="/app#new-scan" class="btn btn--dark">New scan</a>
      </div>
      ${scanRows(scans)}
      ${pages > 1 ? html`<nav class="pager" aria-label="Pages">
        ${page > 1 ? html`<a class="btn btn--soft btn--sm" href="/app/scans?page=${page - 1}">Previous</a>` : ''}
        <span class="muted">Page ${page} of ${pages}</span>
        ${page < pages ? html`<a class="btn btn--soft btn--sm" href="/app/scans?page=${page + 1}">Next</a>` : ''}
      </nav>` : ''}`,
  });
}

export function scanPage({ user, csrfToken, scan, view, notice }) {
  const s = view.summary;
  const running = scan.status === 'queued' || scan.status === 'running';
  const pct = view.progress.total ? Math.min(100, Math.round((view.progress.done / view.progress.total) * 100)) : 0;
  const shareUrl = view.reportUrl;

  let body;
  if (running) {
    body = html`
      <div class="card progress-card" data-poll="/app/scans/${scan.id}/status.json">
        <div class="progress-card__head">
          ${statusPill(scan.status)}
          <span class="muted" data-progress-text>${scan.status === 'queued' ? 'Waiting for a free scanner...' : `Tested ${view.progress.done} of up to ${view.progress.total} page views`}</span>
        </div>
        <div class="meter meter--lg"><i data-progress-bar style="width:${pct}%"></i></div>
        <p class="muted small">You can leave this page. The scan keeps running and appears in your history when it is done.</p>
      </div>`;
  } else if (scan.status === 'failed') {
    body = html`
      <div class="alert alert--error"><b>The scan could not finish.</b> ${scan.error || 'Unknown error.'}</div>
      <form method="post" action="/app/scans/${scan.id}/rerun">${csrfField(csrfToken)}<button class="btn btn--dark">Try again</button></form>`;
  } else {
    body = html`
      <div class="result-grid">
        <div class="card score-card">
          ${scoreRing(s.score, 'lg')}
          <div>
            <span class="eyebrow">Quality score</span>
            <p class="score-card__grade">${s.grade}</p>
            <p class="muted">${s.totalIssues} issues on ${s.pagesTested} page${s.pagesTested === 1 ? '' : 's'}, ${s.durationSec}s</p>
          </div>
        </div>
        ${SEVERITIES.map((k) => html`<div class="card stat"><span class="eyebrow">${k}</span><b class="sev-${k}">${s.bySeverity[k] || 0}</b></div>`)}
        ${s.flowsTotal ? html`<div class="card stat"><span class="eyebrow">User flows</span><b class="${s.flowsPassed === s.flowsTotal ? '' : 'sev-critical'}">${s.flowsPassed}/${s.flowsTotal}</b></div>` : ''}
      </div>

      <div class="actions-row">
        ${view.reportUrl
          ? html`<a class="btn btn--dark" href="${view.reportUrl}" target="_blank" rel="noopener">Open full report</a>
                 <a class="btn btn--soft" href="${view.markdownUrl}" download="qa-report-${scan.id}.md">Download Markdown</a>
                 <button class="btn btn--soft" type="button" data-copy="${shareUrl}">Copy share link</button>`
          : html`<span class="muted">The full report has expired. Run the scan again to get a new one.</span>`}
        <form method="post" action="/app/scans/${scan.id}/rerun">${csrfField(csrfToken)}<button class="btn btn--soft" type="submit">Run again</button></form>
      </div>

      <h2 class="section-title">Fix these first</h2>
      ${s.topFixes.length ? html`<ol class="fixes">
        ${s.topFixes.map((f) => html`<li class="fix fix--${f.severity}">
          <div class="fix__head"><span class="sev-pill sev-pill--${f.severity}">${f.severity}</span><b>${f.title}</b><span class="muted small">${f.count} occurrence${f.count === 1 ? '' : 's'} on ${f.pages} page${f.pages === 1 ? '' : 's'}</span></div>
          <p class="fix__how">${f.fix}</p>
        </li>`)}
      </ol>` : html`<div class="empty-state"><p>No issues found. Nice work.</p></div>`}`;
  }

  return appLayout({
    title: hostOf(scan.url), user, csrfToken, active: 'scans', notice,
    body: html`
      <div class="page-head">
        <div>
          <a href="/app/scans" class="link small">All scans</a>
          <h1 class="break">${hostOf(scan.url)}</h1>
          <p class="muted break">${scan.url} | ${view.options.viewports.join(', ')} | up to ${view.options.maxPages} pages | started ${timeAgo(scan.created_at)}</p>
        </div>
        ${running ? '' : html`<form method="post" action="/app/scans/${scan.id}/delete" data-confirm="Delete this scan and its report?">${csrfField(csrfToken)}<button class="btn btn--ghost btn--sm" type="submit">Delete</button></form>`}
      </div>
      ${body}`,
  });
}

export function apiKeysPage({ user, csrfToken, tokens, newToken, appUrl }) {
  const tokenForDocs = newToken || 'YOUR_API_TOKEN';
  return appLayout({
    title: 'API', user, csrfToken, active: 'api',
    body: html`
      <div class="page-head">
        <div><h1>API and CI</h1><p class="muted">Start scans from scripts, CI pipelines or any programming language with an HTTP client.</p></div>
      </div>

      ${newToken ? html`<div class="alert alert--success">
        <b>Your new API token.</b> Copy it now. For your security it will not be shown again.
        <div class="token-box"><code>${newToken}</code><button class="btn btn--soft btn--sm" type="button" data-copy="${newToken}">Copy</button></div>
      </div>` : ''}

      <div class="grid-2">
        <div class="card">
          <h2 class="card-title">API tokens</h2>
          ${tokens.length ? html`<ul class="token-list">
            ${tokens.map((t) => html`<li>
              <div><b>${t.name}</b><span class="muted small"><code>${t.prefix}...</code> created ${timeAgo(t.created_at)}${t.last_used_at ? html`, last used ${timeAgo(t.last_used_at)}` : ', never used'}</span></div>
              <form method="post" action="/app/api-keys/${t.id}/delete" data-confirm="Revoke this token? Anything using it will stop working.">${csrfField(csrfToken)}<button class="btn btn--ghost btn--sm">Revoke</button></form>
            </li>`)}
          </ul>` : html`<p class="muted">No tokens yet.</p>`}
          <form method="post" action="/app/api-keys" class="inline-form">
            ${csrfField(csrfToken)}
            <input name="name" type="text" placeholder="Token name, e.g. GitHub Actions" maxlength="60" required>
            <button class="btn btn--dark" type="submit">Create token</button>
          </form>
        </div>

        <div class="card docs">
          <h2 class="card-title">Quick start</h2>
          <p class="muted small">1. Start a scan</p>
          <pre><code>curl -X POST ${appUrl}/api/v1/scans \\
  -H "Authorization: Bearer ${tokenForDocs}" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://your-site.com", "viewports": ["desktop", "mobile"]}'</code></pre>
          <p class="muted small">2. Check the result (repeat until status is "done")</p>
          <pre><code>curl ${appUrl}/api/v1/scans/SCAN_ID \\
  -H "Authorization: Bearer ${tokenForDocs}"</code></pre>
          <p class="muted small">Endpoints</p>
          <ul class="endpoints">
            <li><code>GET /api/v1/me</code> plan and usage</li>
            <li><code>POST /api/v1/scans</code> start a scan: url, viewports, maxPages, checkExternalLinks, ai, visual, flows, login</li>
            <li><code>GET /api/v1/scans</code> list scans</li>
            <li><code>GET /api/v1/scans/:id</code> status, score, summary, reportUrl</li>
            <li><code>POST /api/v1/scans/:id/rerun</code> run the same scan again</li>
            <li><code>DELETE /api/v1/scans/:id</code> delete a scan</li>
          </ul>
        </div>
      </div>

      <div class="card docs">
        <h2 class="card-title">GitHub Actions</h2>
        <p class="muted small">Save the token as a repository secret named QA_TOKEN. This job fails when the scan finds critical issues.</p>
        <pre><code>- name: QA scan
  env:
    QA_TOKEN: \${{ secrets.QA_TOKEN }}
  run: |
    ID=$(curl -s -X POST ${appUrl}/api/v1/scans -H "Authorization: Bearer $QA_TOKEN" \\
      -H "Content-Type: application/json" -d '{"url":"https://staging.your-site.com"}' | jq -r .id)
    while :; do
      RES=$(curl -s ${appUrl}/api/v1/scans/$ID -H "Authorization: Bearer $QA_TOKEN")
      STATUS=$(echo "$RES" | jq -r .status)
      [ "$STATUS" = "done" ] || [ "$STATUS" = "failed" ] &amp;&amp; break
      sleep 10
    done
    echo "$RES" | jq '{score, reportUrl, critical: .summary.bySeverity.critical}'
    [ "$(echo "$RES" | jq .summary.bySeverity.critical)" = "0" ]</code></pre>
      </div>`,
  });
}

function planCards({ user, csrfToken, billingEnabled, devPlanSwitch, current, publicView = false }) {
  return html`<div class="plans">
    ${Object.values(PLANS).map((p) => {
      const isCurrent = current === p.id;
      let action;
      if (!user) action = html`<a class="btn ${p.id === 'pro' ? 'btn--dark' : 'btn--soft'}" href="/signup">${p.price ? 'Start with Free' : 'Create free account'}</a>`;
      else if (isCurrent) action = html`<span class="btn btn--soft is-disabled">Current plan</span>`;
      else if (publicView) action = html`<a class="btn btn--soft" href="/app/billing">Change in Billing</a>`;
      else if (devPlanSwitch) {
        action = html`<form method="post" action="/app/billing/dev-switch">${csrfField(csrfToken)}<input type="hidden" name="plan" value="${p.id}"><button class="btn btn--soft" type="submit">Switch (dev mode)</button></form>`;
      } else if (p.id === 'free') action = html`<span class="muted small">Cancel your plan in Manage billing</span>`;
      else if (billingEnabled) {
        action = html`<form method="post" action="/app/billing/checkout">${csrfField(csrfToken)}<input type="hidden" name="plan" value="${p.id}"><button class="btn btn--dark" type="submit">Upgrade to ${p.name}</button></form>`;
      } else action = html`<span class="muted small">Billing is not configured yet</span>`;
      return html`<div class="plan ${p.id === 'pro' ? 'plan--featured' : ''} ${isCurrent ? 'plan--current' : ''}">
        ${p.id === 'pro' ? html`<span class="tag tag--peach plan__badge">Most popular</span>` : ''}
        <h3>${p.name}</h3>
        <p class="plan__price"><b>$${p.price}</b><span class="muted">/month</span></p>
        <p class="muted small">${p.blurb}</p>
        <ul class="plan__features">${planFeatures(p).map((f) => html`<li>${f}</li>`)}</ul>
        ${action}
      </div>`;
    })}
  </div>`;
}

export function billingPage({ user, csrfToken, usage, billingEnabled, devPlanSwitch, notice }) {
  return appLayout({
    title: 'Billing', user, csrfToken, active: 'billing', notice,
    body: html`
      <div class="page-head">
        <div><h1>Plan and billing</h1><p class="muted">You are on the <b>${usage.plan.name}</b> plan${user.subscription_status && user.subscription_status !== 'dev' ? html` (${user.subscription_status})` : ''}. ${usage.used} of ${usage.limit} scans used this month.</p></div>
        ${user.stripe_customer_id && billingEnabled ? html`<form method="post" action="/app/billing/portal">${csrfField(csrfToken)}<button class="btn btn--soft">Manage billing</button></form>` : ''}
      </div>
      ${devPlanSwitch ? html`<div class="alert alert--info">Development mode: Stripe is not configured, so you can switch plans freely to try every feature.</div>` : ''}
      ${planCards({ user, csrfToken, billingEnabled, devPlanSwitch, current: user.plan })}`,
  });
}

export function pricingPage({ user }) {
  return publicLayout({
    title: 'Pricing', user,
    body: html`
      <div class="pricing-head">
        <span class="eyebrow">Pricing</span>
        <h1>Simple plans that grow with your product</h1>
        <p class="muted">Start free. Upgrade when you need more pages, devices, user flows or AI review.</p>
      </div>
      ${planCards({ user, current: user?.plan, publicView: true })}`,
  });
}

export function settingsPage({ user, csrfToken, notice, passwordError, deleteError }) {
  return appLayout({
    title: 'Settings', user, csrfToken, active: 'settings', notice,
    body: html`
      <div class="page-head"><div><h1>Settings</h1><p class="muted">${user.email}</p></div></div>
      <div class="grid-2">
        <form method="post" action="/app/settings/password" class="card form-stack">
          ${csrfField(csrfToken)}
          <h2 class="card-title">Change password</h2>
          ${passwordError ? html`<p class="form-error" role="alert">${passwordError}</p>` : ''}
          <label class="field"><span>Current password</span><input type="password" name="current" autocomplete="current-password" required></label>
          <label class="field"><span>New password</span><input type="password" name="password" autocomplete="new-password" minlength="10" required></label>
          <button class="btn btn--dark" type="submit">Update password</button>
          <p class="muted small">Other devices are signed out after a password change.</p>
        </form>
        <form method="post" action="/app/settings/delete" class="card form-stack danger" data-confirm="This permanently deletes your account, scans and reports. Continue?">
          ${csrfField(csrfToken)}
          <h2 class="card-title">Delete account</h2>
          ${deleteError ? html`<p class="form-error" role="alert">${deleteError}</p>` : ''}
          <p class="muted small">Deletes your account, all scans, reports and API tokens. Cancel any paid plan in Billing first.</p>
          <label class="field"><span>Type your email to confirm</span><input type="email" name="confirm" autocomplete="off" required></label>
          <button class="btn btn--danger" type="submit">Delete my account</button>
        </form>
      </div>`,
  });
}

export function signupPage({ values = {}, error, signupsOpen }) {
  return authLayout({
    title: 'Create account',
    body: html`
      <h1>Create your account</h1>
      <p class="muted">Free plan, no card needed.</p>
      ${!signupsOpen ? html`<div class="alert alert--info">New sign ups are currently closed.</div>` : html`
      <form method="post" action="/signup" class="form-stack">
        ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
        <label class="field"><span>Name</span><input name="name" type="text" autocomplete="name" maxlength="80" value="${values.name || ''}"></label>
        <label class="field"><span>Work email</span><input name="email" type="email" autocomplete="email" required value="${values.email || ''}"></label>
        <label class="field"><span>Password <span class="muted">(10+ characters)</span></span><input name="password" type="password" autocomplete="new-password" minlength="10" required></label>
        <button class="btn btn--dark btn--block" type="submit">Create account</button>
      </form>`}
      <p class="auth__switch">Already have an account? <a href="/login">Log in</a></p>`,
  });
}

export function loginPage({ values = {}, error, next }) {
  return authLayout({
    title: 'Log in',
    body: html`
      <h1>Welcome back</h1>
      <p class="muted">Log in to run scans and see your reports.</p>
      <form method="post" action="/login" class="form-stack">
        ${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
        <input type="hidden" name="next" value="${next || ''}">
        <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required value="${values.email || ''}"></label>
        <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
        <button class="btn btn--dark btn--block" type="submit">Log in</button>
      </form>
      <p class="auth__switch">New here? <a href="/signup">Create a free account</a></p>`,
  });
}

export function errorPage({ user, status, message }) {
  return publicLayout({
    title: `Error ${status}`, user,
    body: html`<div class="error-page"><span class="eyebrow">Error ${status}</span><h1>${status === 404 ? 'Page not found' : 'Something went wrong'}</h1><p class="muted">${message}</p><a class="btn btn--dark" href="${user ? '/app' : '/'}">Go back</a></div>`,
  });
}
