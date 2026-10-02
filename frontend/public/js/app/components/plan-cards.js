import { html } from '../core/html.js';
import { icon } from '../core/icons.js';
import { money } from '../core/format.js';

/** Plan comparison cards. action(plan) returns the call-to-action for each card. */
export function planCards(plans, { current, action }) {
  return html`<div class="plans">
    ${plans.map((p) => html`<article class="plan ${p.id === 'pro' ? 'plan--featured' : ''} ${current === p.id ? 'plan--current' : ''}">
      <div class="plan__name"><span>${p.name}</span>
        ${current === p.id ? html`<span class="badge badge--success">Current</span>` : p.id === 'pro' ? html`<span class="badge badge--accent">Most popular</span>` : ''}</div>
      <div class="plan__price"><b>${money(p.price)}</b>${p.price === null ? '' : html`<span class="muted small">${p.id === 'trial' ? 'for 14 days' : 'per month'}</span>`}</div>
      <p class="plan__blurb">${p.blurb}</p>
      ${action(p)}
      <ul class="plan__features">${p.features.map((f) => html`<li>${icon('check')}<span>${f}</span></li>`)}</ul>
    </article>`)}
  </div>`;
}
