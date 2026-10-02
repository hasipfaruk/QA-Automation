import { get, post } from '../core/api.js';
import { html, mount, $, $$ } from '../core/html.js';
import { renderShell, flashFromQuery, busy, toast } from '../core/shell.js';
import { num, dateOnly } from '../core/format.js';
import { planCards } from './components.js';

export async function render({ session, main }) {
  renderShell({ session, active: 'billing', title: 'Billing' });
  const params = new URLSearchParams(window.location.search);
  if (params.get('checkout') === 'success') toast('Thanks! Your plan is being activated. It can take a few seconds to update.', 'success');
  if (params.get('checkout') === 'cancelled') toast('Checkout was cancelled. Your plan has not changed.', 'info');
  flashFromQuery({ switched: { type: 'success', text: 'Plan updated.' } });

  const [billing, { data: plans }] = await Promise.all([get('/billing'), get('/plans')]);
  const current = billing.usage.plan.id;

  const action = (p) => {
    if (p.id === current) return html`<span class="btn btn--soft is-disabled">Current plan</span>`;
    if (billing.devPlanSwitch) return html`<button class="btn btn--soft" data-switch="${p.id}" type="button">Switch (development)</button>`;
    if (p.id === 'enterprise') return html`<a class="btn btn--soft" href="mailto:${billing.salesEmail}?subject=QA%20Automation%20Enterprise">Contact sales</a>`;
    if (!p.selfServe) return html`<span class="muted small">Not available for purchase</span>`;
    if (!billing.billingEnabled) return html`<span class="muted small">Online billing is not configured</span>`;
    return html`<button class="btn btn--dark" data-checkout="${p.id}" type="button">Upgrade to ${p.name}</button>`;
  };

  const u = billing.usage;
  mount(main, html`
    <div class="page-head">
      <div><h1>Plan and billing</h1>
        <p class="muted">You are on the <b>${u.plan.name}</b> plan${billing.subscriptionStatus && billing.subscriptionStatus !== 'dev' ? ` (${billing.subscriptionStatus})` : ''}.
          ${num(u.used)} of ${num(u.limit)} scans used${u.plan.id === 'trial' ? ` during your trial, which ${u.trialExpired ? 'has ended' : `ends ${dateOnly(u.plan.trialEndsAt)}`}` : ' this month'}.</p></div>
      ${billing.hasBillingAccount && billing.billingEnabled ? html`<button class="btn btn--soft" id="portal" type="button">Manage billing</button>` : ''}
    </div>
    ${billing.devPlanSwitch ? html`<div class="alert alert--info">Development mode: online billing is not configured, so plans can be switched freely to evaluate every feature.</div>` : ''}
    ${planCards(plans, { current, action })}`);

  $$('[data-checkout]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    const { url } = await post('/billing/checkout', { plan: b.dataset.checkout });
    window.location.href = url;
  })));
  $$('[data-switch]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    await post('/billing/dev-switch', { plan: b.dataset.switch });
    window.location.href = '/app/billing?notice=switched';
  })));
  const portal = $('#portal');
  portal?.addEventListener('click', () => busy(portal, async () => {
    const { url } = await post('/billing/portal');
    window.location.href = url;
  }));
}
