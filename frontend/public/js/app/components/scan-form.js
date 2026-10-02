import { html } from '../core/html.js';

export const VIEWPORT_LABELS = { desktop: 'Desktop 1440px', laptop: 'Laptop 1280px', tablet: 'Tablet 768px', mobile: 'Mobile 390px' };

export const FLOW_EXAMPLE = `[
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

export const LOGIN_EXAMPLE = `{
  "loginUrl": "/login",
  "steps": [
    { "fill": "#email", "value": "qa@yourcompany.com" },
    { "fill": "#password", "value": "test-account-password" },
    { "click": "button[type=submit]" },
    { "expectUrl": "/dashboard" }
  ]
}`;

const lockTag = (label = 'Pro') => html`<span class="tag tag--lavender">${label}</span>`;

/** New scan form. Options the plan does not include are shown but disabled. */
export function scanForm({ plan, aiAvailable }) {
  const limits = plan.limits;
  return html`
    <form class="card scan-form" id="scan-form" novalidate>
      <label for="url" class="scan-form__label">Website URL</label>
      <div class="scan-form__row">
        <input id="url" name="url" type="text" inputmode="url" autocomplete="url" placeholder="https://your-site.com" required>
        <button class="btn btn--dark" type="submit">Start scan</button>
      </div>
      <p id="scan-error" class="form-error" role="alert" hidden></p>

      <details class="options">
        <summary>Scan options</summary>
        <div class="options__grid">
          <fieldset>
            <legend>Devices</legend>
            ${Object.entries(VIEWPORT_LABELS).map(([id, label]) => {
              const allowed = limits.viewports.includes(id);
              const checked = allowed && (id === 'desktop' || id === 'mobile');
              return html`<label class="check ${allowed ? '' : 'is-locked'}">
                <input type="checkbox" name="viewports" value="${id}" ${checked ? 'checked' : ''} ${allowed ? '' : 'disabled'}> ${label} ${allowed ? '' : lockTag()}
              </label>`;
            })}
          </fieldset>
          <fieldset>
            <legend>Crawl</legend>
            <label class="field"><span>Max pages <span class="muted">(limit ${limits.maxPages})</span></span>
              <input type="number" name="maxPages" min="1" max="${limits.maxPages}" value="${Math.min(10, limits.maxPages)}"></label>
            <label class="check"><input type="checkbox" name="checkExternalLinks" value="true" checked> Check external links</label>
          </fieldset>
          <fieldset>
            <legend>Extras</legend>
            <label class="check ${limits.ai && aiAvailable ? '' : 'is-locked'}">
              <input type="checkbox" name="ai" value="true" ${limits.ai && aiAvailable ? '' : 'disabled'}>
              AI design review ${limits.ai ? (aiAvailable ? '' : html`<span class="muted small">(not configured)</span>`) : lockTag()}
            </label>
            <label class="field"><span>Visual regression ${limits.visual ? '' : lockTag()}</span>
              <select name="visual" ${limits.visual ? '' : 'disabled'}>
                <option value="off">Off</option>
                <option value="compare">Compare with baseline</option>
                <option value="update">Save as new baseline</option>
              </select>
            </label>
          </fieldset>
        </div>
        <div class="options__advanced">
          <label class="field"><span>User flows (JSON) ${limits.flows ? '' : lockTag()}</span>
            <textarea name="flows" rows="7" spellcheck="false" placeholder="${FLOW_EXAMPLE}" ${limits.flows ? '' : 'disabled'}></textarea></label>
          <label class="field"><span>Login steps (JSON) ${limits.flows ? '' : lockTag()} <span class="muted small">Use a dedicated test account.</span></span>
            <textarea name="login" rows="7" spellcheck="false" placeholder="${LOGIN_EXAMPLE}" ${limits.flows ? '' : 'disabled'}></textarea></label>
          <p class="muted small">Step actions: goto, click, fill, type, select, check, uncheck, hover, press, wait, expectText, expectNoText, expectVisible, expectUrl.</p>
        </div>
      </details>
    </form>`;
}
