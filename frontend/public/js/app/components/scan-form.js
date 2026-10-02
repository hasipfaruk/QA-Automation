import { html } from '../core/html.js';
import { icon } from '../core/icons.js';

export const DEVICES = [
  { id: 'desktop', label: 'Desktop', detail: '1440 x 900' },
  { id: 'laptop', label: 'Laptop', detail: '1280 x 720' },
  { id: 'tablet', label: 'Tablet', detail: '768 x 1024, touch' },
  { id: 'mobile', label: 'Mobile', detail: '390 x 844, touch' },
];

export const FLOW_EXAMPLE = `[
  {
    "name": "Search returns results",
    "steps": [
      { "goto": "/" },
      { "fill": "input[type=search]", "value": "shoes" },
      { "press": "Enter" },
      { "expectVisible": ".results" }
    ]
  }
]`;

export const LOGIN_EXAMPLE = `{
  "loginUrl": "/login",
  "steps": [
    { "fill": "#email", "value": "qa@yourcompany.com" },
    { "fill": "#password", "value": "test-account-password" },
    { "click": "button[type=submit]" },
    { "expectUrl": "/dashboard" }
  ]
}`;

const locked = html`<span class="lock">${icon('lock', 'icon icon--xs')} Pro</span>`;

function section(title, text, fields) {
  return html`<div class="form-section">
    <div class="form-section__intro"><h3>${title}</h3><p>${text}</p></div>
    <div class="form-section__fields">${fields}</div>
  </div>`;
}

/** Full new-scan form. Options outside the customer's plan are visible but locked. */
export function scanForm({ limits, aiAvailable }) {
  return html`
    <form id="scan-form" class="panel" novalidate>
      <div class="panel__body">
        <div id="scan-error" class="form-error" role="alert" hidden></div>

        ${section('Website', 'The page to start from. Proofline follows links on the same domain.', html`
          <label class="field"><span class="field__label">URL</span>
            <input class="input" id="url" name="url" type="text" inputmode="url" autocomplete="url" placeholder="https://www.example.com" required></label>`)}

        ${section('Devices', 'Every page is tested on each selected device profile.', html`
          <div class="option-grid">
            ${DEVICES.map((d) => {
              const allowed = limits.viewports.includes(d.id);
              const checked = allowed && (d.id === 'desktop' || d.id === 'mobile');
              return html`<label class="option ${allowed ? '' : 'is-locked'}">
                <input type="checkbox" name="viewports" value="${d.id}" ${checked ? 'checked' : ''} ${allowed ? '' : 'disabled'}>
                <span class="option__text"><b>${d.label}</b><span>${d.detail}</span></span>${allowed ? '' : locked}
              </label>`;
            })}
          </div>`)}

        ${section('Crawl', 'Limit how much of the site is tested in this scan.', html`
          <label class="field"><span class="field__label">Maximum pages</span>
            <input class="input" type="number" name="maxPages" min="1" max="${limits.maxPages}" value="${Math.min(10, limits.maxPages)}">
            <span class="field__hint">Your plan allows up to ${limits.maxPages} pages per scan.</span></label>
          <label class="check"><input type="checkbox" name="checkExternalLinks" value="true" checked> Check links to other websites</label>`)}

        ${section('Advanced checks', 'Extra analysis included with paid plans.', html`
          <label class="option ${limits.ai && aiAvailable ? '' : 'is-locked'}">
            <input type="checkbox" name="ai" value="true" ${limits.ai && aiAvailable ? '' : 'disabled'}>
            <span class="option__text"><b>AI design review</b><span>${limits.ai && !aiAvailable ? 'Currently unavailable' : 'Reviews screenshots for visual and usability problems'}</span></span>${limits.ai ? '' : locked}
          </label>
          <label class="field"><span class="field__label">Visual regression ${limits.visual ? '' : locked}</span>
            <select class="select" name="visual" ${limits.visual ? '' : 'disabled'}>
              <option value="off">Off</option>
              <option value="compare">Compare with the saved baseline</option>
              <option value="update">Save this scan as the new baseline</option>
            </select></label>`)}

        ${section('User flows', 'Scripted journeys run in a real browser, with a screenshot at every step.', html`
          <label class="field"><span class="field__label">Flows (JSON) ${limits.flows ? '' : locked}</span>
            <textarea class="textarea" name="flows" rows="8" spellcheck="false" placeholder="${FLOW_EXAMPLE}" ${limits.flows ? '' : 'disabled'}></textarea></label>
          <label class="field"><span class="field__label">Login steps (JSON) ${limits.flows ? '' : locked}</span>
            <textarea class="textarea" name="login" rows="8" spellcheck="false" placeholder="${LOGIN_EXAMPLE}" ${limits.flows ? '' : 'disabled'}></textarea>
            <span class="field__hint">Use a dedicated test account. Typed values are stored securely and never shown again.</span></label>`)}
      </div>
      <div class="panel__foot">
        <a href="/app/scans" class="btn">Cancel</a>
        <button class="btn btn--primary" type="submit">${icon('check')} Start scan</button>
      </div>
    </form>`;
}
