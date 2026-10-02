import { get, post } from '../core/api.js';
import { html, mount, $, $$ } from '../core/html.js';
import { icon } from '../core/icons.js';
import { renderShell, flashFromQuery, busy, toast } from '../core/layout.js';
import { num, dateOnly, capitalize } from '../core/format.js';
import { planCards } from '../components/plan-cards.js';

export async function render({ session, main }) {
  renderShell({ session, active: 'billing', title: 'Plan and billing', description: 'Your subscription, usage and available plans.' });
  const params = new URLSearchParams(window.location.search);
  if (params.get('checkout') === 'success') toast('Payment received. Your plan will update in a few seconds.', 'success');
  if (params.get('checkout') === 'cancelled') toast('Checkout cancelled. Your plan has not changed.', 'info');
  flashFromQuery({ switched: { type: 'success', text: 'Plan updated.' } });

  const [billing, { data: plans }] = await Promise.all([get('/billing'), get('/plans')]);
  const u = billing.usage;
  const current = u.plan.id;
  const pct = u.limit ? Math.min(100, Math.round((u.used / u.limit) * 100)) : 0;
  const status = billing.subscriptionStatus && billing.subscriptionStatus !== 'dev' ? capitalize(billing.subscriptionStatus.replace('_', ' ')) : null;

  const action = (p) => {
    if (p.id === current) return html`<span class="btn is-disabled">Current plan</span>`;
    if (billing.devPlanSwitch) return html`<button class="btn" data-switch="${p.id}" type="button">Switch (development)</button>`;
    if (p.id === 'enterprise') return html`<a class="btn" href="mailto:${billing.salesEmail}?subject=Proofline%20Enterprise">Contact sales</a>`;
    if (!p.selfServe) return html`<span class="btn is-disabled">Not available</span>`;
    if (!billing.billingEnabled) return html`<span class="btn is-disabled">Billing unavailable</span>`;
    return html`<button class="btn ${p.id === 'pro' ? 'btn--primary' : ''}" data-checkout="${p.id}" type="button">Upgrade to ${p.name}</button>`;
  };

  mount(main, html`
    ${billing.devPlanSwitch ? html`<div class="alert alert--warning">${icon('alert')}<div><b>Development mode.</b> Online payments are not configured, so plans can be switched freely to evaluate features.</div></div>` : ''}

    <section class="panel">
      <div class="usage-panel">
        <div>
          <span class="faint small">Current plan</span>
          <h2 style="font-size:22px;margin-top:4px">${u.plan.name} ${status ? html`<span class="badge" style="vertical-align:middle;margin-left:6px">${status}</span>` : ''}</h2>
          <div class="usage-panel__nums"><b>${num(u.used)}</b><span class="muted">of ${num(u.limit)} scans used ${u.plan.id === 'trial' ? 'in your trial' : 'this month'}</span></div>
          <div class="meter meter--lg"><i style="width:${pct}%"></i></div>
          <p class="faint small" style="margin-top:10px">${u.plan.id === 'trial'
            ? (u.trialExpired ? 'Your trial has ended. Choose a plan to continue.' : `Trial ends ${dateOnly(u.plan.trialEndsAt)}.`)
            : 'Usage resets on the first day of each month (UTC).'}</p>
        </div>
        ${billing.hasBillingAccount && billing.billingEnabled ? html`<button class="btn" id="portal" type="button">${icon('card')} Manage billing</button>` : ''}
      </div>
    </section>

    <div class="section-title"><h2>Plans</h2><span class="faint small">Prices in USD, billed monthly</span></div>
    ${planCards(plans, { current, action })}`);

  $$('[data-checkout]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    const { url } = await post('/billing/checkout', { plan: b.dataset.checkout });
    window.location.href = url;
  }, 'Redirecting...')));
  $$('[data-switch]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    await post('/billing/dev-switch', { plan: b.dataset.switch });
    window.location.href = '/app/billing?notice=switched';
  })));
  const portal = $('#portal');
  portal?.addEventListener('click', () => busy(portal, async () => {
    const { url } = await post('/billing/portal');
    window.location.href = url;
  }, 'Redirecting...'));
}
