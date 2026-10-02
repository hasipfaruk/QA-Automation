import { get, post } from '../core/api.js';
import { html, mount, $, formData } from '../core/html.js';
import { icon } from '../core/icons.js';
import { renderShell } from '../core/layout.js';
import { num } from '../core/format.js';
import { scanForm } from '../components/scan-form.js';

const asList = (v) => [].concat(v || []);

export async function render({ session, config, main }) {
  renderShell({ session, active: 'new-scan', title: 'New scan', description: 'Choose what to test and how.' });
  const usage = await get('/usage');

  const blocked = usage.trialExpired || usage.remaining === 0;
  mount(main, html`
    ${blocked ? html`<div class="alert alert--danger">${icon('alert')}<div><b>${usage.trialExpired ? 'Your trial has ended.' : 'You have used all scans for this period.'}</b> Upgrade your plan to start new scans. <a href="/app/billing">View plans</a></div></div>`
      : html`<div class="alert alert--info">${icon('activity')}<div>${num(usage.remaining)} of ${num(usage.limit)} scans remaining on the ${usage.plan.name} plan.</div></div>`}
    ${scanForm({ limits: usage.plan.limits, aiAvailable: config.aiAvailable })}`);

  const form = $('#scan-form');
  const error = $('#scan-error');
  const preset = new URLSearchParams(window.location.search).get('url');
  if (preset) $('#url').value = preset;
  $('#url').focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const d = formData(form);
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    button.textContent = 'Starting scan...';
    try {
      const scan = await post('/scans', {
        url: d.url,
        viewports: asList(d.viewports),
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
      error.scrollIntoView({ behavior: 'smooth', block: 'center' });
      button.disabled = false;
      button.innerHTML = String(html`${icon('check')} Start scan`);
    }
  });
}
