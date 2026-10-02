import { get } from '../core/api.js';
import { html, mount } from '../core/html.js';
import { renderPublicShell } from '../core/layout.js';
import { planCards } from '../components/plan-cards.js';

export async function render({ session, config, main }) {
  renderPublicShell({ session, title: 'Pricing' });
  const { data: plans } = await get('/plans');
  const signedIn = Boolean(session.user);

  const action = (p) => {
    if (p.id === 'enterprise') return html`<a class="btn btn--soft" href="mailto:${config.salesEmail}?subject=QA%20Automation%20Enterprise">Contact sales</a>`;
    if (signedIn) return html`<a class="btn ${p.id === 'pro' ? 'btn--dark' : 'btn--soft'}" href="/app/billing">${p.id === 'trial' ? 'Go to dashboard' : `Choose ${p.name}`}</a>`;
    return html`<a class="btn ${p.id === 'pro' ? 'btn--dark' : 'btn--soft'}" href="/signup">${p.id === 'trial' ? 'Start free trial' : `Start with ${p.name}`}</a>`;
  };

  mount(main, html`
    <div class="pricing-head">
      <span class="eyebrow">Pricing</span>
      <h1>Plans for teams that ship with confidence</h1>
      <p class="muted">Start with a 14-day trial. Upgrade for more pages, devices, user flows and AI review.</p>
    </div>
    ${planCards(plans, { current: session.user?.plan, action })}
    <p class="muted small pricing-note">Prices in USD, billed monthly. Taxes may apply. Enterprise plans include custom limits, onboarding and invoicing.</p>`);
}
