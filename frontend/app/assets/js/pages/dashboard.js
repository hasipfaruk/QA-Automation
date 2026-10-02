import { get, post } from '../core/api.js';
import { html, mount, $, formData } from '../core/html.js';
import { renderShell, flashFromQuery } from '../core/shell.js';
import { num, dateOnly } from '../core/format.js';
import { scanForm, scanTable } from './components.js';

function trialBanner(usage) {
  if (usage.plan.id !== 'trial') return '';
  if (usage.trialExpired) {
    return html`<div class="alert alert--error"><b>Your trial has ended.</b> Choose a plan to keep scanning. <a class="link" href="/app/billing">View plans</a></div>`;
  }
  const days = Math.max(0, Math.ceil((Date.parse(usage.plan.trialEndsAt) - Date.now()) / 864e5));
  return html`<div class="alert alert--info">Trial: ${days} day${days === 1 ? '' : 's'} left (ends ${dateOnly(usage.plan.trialEndsAt)}). <a class="link" href="/app/billing">Upgrade</a> for more pages, devices, user flows and AI review.</div>`;
}

function usageCard(usage) {
  const pct = usage.limit ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
  return html`<div class="card usage">
    <div class="usage__head"><span class="eyebrow">${usage.plan.id === 'trial' ? 'Trial usage' : 'This month'}</span><a href="/app/billing" class="link">${usage.plan.name} plan</a></div>
    <p class="usage__num"><b>${num(usage.used)}</b> <span class="muted">of ${num(usage.limit)} scans used</span></p>
    <div class="meter" role="progressbar" aria-valuenow="${usage.used}" aria-valuemin="0" aria-valuemax="${usage.limit}"><i style="width:${pct}%"></i></div>
    ${usage.remaining === 0 ? html`<p class="usage__warn">Limit reached. <a href="/app/billing">Upgrade</a> to keep scanning.</p>` : ''}
  </div>`;
}

const parseList = (v) => [].concat(v || []);

export async function render({ session, config, main }) {
  renderShell({ session, active: 'dashboard', title: 'Dashboard' });
  flashFromQuery({ welcome: { type: 'success', text: 'Welcome! Run your first scan below.' } });
  const [usage, recent] = await Promise.all([get('/usage'), get('/scans?limit=8')]);

  mount(main, html`
    <div class="page-head"><div>
      <h1>Run a scan</h1>
      <p class="muted">Paste a public URL. Every page is tested in a real browser and you get a prioritised fix list with screenshots.</p>
    </div></div>
    ${trialBanner(usage)}
    <div class="grid-main">
      ${scanForm({ plan: usage.plan, aiAvailable: config.aiAvailable })}
      ${usageCard(usage)}
    </div>
    <div class="section-head-row"><h2>Recent scans</h2>${recent.total ? html`<a href="/app/scans" class="link">View all</a>` : ''}</div>
    ${scanTable(recent.data, { emptyText: 'No scans yet. Paste a URL above to run your first one.' })}`);

  const form = $('#scan-form');
  const error = $('#scan-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const d = formData(form);
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    button.textContent = 'Starting...';
    try {
      const scan = await post('/scans', {
        url: d.url,
        viewports: parseList(d.viewports),
        maxPages: d.maxPages ? Number(d.maxPages) : undefined,
        checkExternalLinks: d.checkExternalLinks === 'true',
        ai: d.ai === 'true',
        visual: d.visual || 'off',
        flows: d.flows?.trim() || undefined,
        login: d.login?.trim() || undefined,
      });
      window.location.href = `/app/scans/${scan.id}`;
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      if (err.status === 422 && /JSON|Flow|Login|step/i.test(err.message)) form.querySelector('details').open = true;
      button.disabled = false;
      button.textContent = 'Start scan';
    }
  });
}
