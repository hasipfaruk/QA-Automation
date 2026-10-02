import { html } from '../core/html.js';
import { money } from '../core/format.js';

/** Plan cards. action(plan) returns the button/link for each card. */
export function planCards(plans, { current, action }) {
  return html`<div class="plans">
    ${plans.map((p) => html`<div class="plan ${p.id === 'pro' ? 'plan--featured' : ''} ${current === p.id ? 'plan--current' : ''}">
      ${p.id === 'pro' ? html`<span class="tag tag--peach plan__badge">Most popular</span>` : ''}
      <h3>${p.name}</h3>
      <p class="plan__price"><b>${money(p.price)}</b>${p.price !== null ? html`<span class="muted">${p.id === 'trial' ? ' for 14 days' : '/month'}</span>` : ''}</p>
      <p class="muted small">${p.blurb}</p>
      <ul class="plan__features">${p.features.map((f) => html`<li>${f}</li>`)}</ul>
      ${action(p)}
    </div>`)}
  </div>`;
}
