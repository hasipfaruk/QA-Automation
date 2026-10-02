import { get } from '../core/api.js';
import { html, mount } from '../core/html.js';
import { renderPublicShell } from '../core/layout.js';
import { planCards } from '../components/plan-cards.js';

export async function render({ session, config, main }) {
  renderPublicShell({ session, title: 'Pricing' });
  const { data: plans } = await get('/plans');
  const user = session.user;

  const action = (p) => {
    if (p.id === 'enterprise') return html`<a class="btn" href="mailto:${config.salesEmail}?subject=Proofline%20Enterprise">Contact sales</a>`;
    if (user) return html`<a class="btn ${p.id === 'pro' ? 'btn--primary' : ''}" href="${user.role === 'admin' ? '/app/admin' : '/app/billing'}">${p.id === 'trial' ? 'Open dashboard' : `Choose ${p.name}`}</a>`;
    return html`<a class="btn ${p.id === 'pro' ? 'btn--primary' : ''}" href="/signup">${p.id === 'trial' ? 'Start free trial' : 'Start with a free trial'}</a>`;
  };

  mount(main, html`
    <div class="pricing-head">
      <span class="badge badge--accent">Pricing</span>
      <h1>Plans that scale with your releases</h1>
      <p class="muted">Every plan starts with a 14-day free trial. Upgrade for more pages, every device profile, user flows and AI design review.</p>
    </div>
    ${planCards(plans, { current: user?.role === 'admin' ? null : user?.plan, action })}
    <p class="pricing-note faint small">Prices in USD, billed monthly. Taxes may apply. Enterprise includes custom limits, onboarding and invoicing.</p>`);
}
