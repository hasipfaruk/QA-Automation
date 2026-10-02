import { html } from './html.js';

const FONTS = 'https://fonts.googleapis.com/css2?family=Fragment+Mono&family=Stack+Sans+Headline:wght@400;500&family=Stack+Sans+Text:wght@300;400;500&display=swap';

export const logo = (label = true) => html`
  <a href="/" class="logo" aria-label="QA Automation home">
    <svg class="logo__mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="9"/>
      <path class="logo__check" d="M9.5 16.5l4.5 4.5 8.5-9.5"/>
    </svg>
    ${label ? html`<span>QA Automation</span>` : ''}
  </a>`;

function head(title) {
  return html`
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | QA Automation</title>
  <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${FONTS}" rel="stylesheet">
  <link rel="stylesheet" href="/static/app.css">
  <script src="/static/app.js" defer></script>`;
}

export const csrfField = (token) => html`<input type="hidden" name="_csrf" value="${token}">`;

const NAV = [
  ['dashboard', '/app', 'Dashboard'],
  ['scans', '/app/scans', 'Scans'],
  ['api', '/app/api-keys', 'API'],
  ['billing', '/app/billing', 'Billing'],
  ['settings', '/app/settings', 'Settings'],
];

/** Signed-in application shell. */
export function appLayout({ title, user, csrfToken, active, body, notice }) {
  return html`<!doctype html>
<html lang="en">
<head>${head(title)}</head>
<body class="app">
  <header class="topbar">
    <div class="wrap topbar__inner">
      ${logo()}
      <nav class="topnav" aria-label="App">
        ${NAV.map(([key, href, label]) => html`<a href="${href}" class="${key === active ? 'is-active' : ''}" ${key === active ? html`aria-current="page"` : ''}>${label}</a>`)}
      </nav>
      <div class="topbar__user">
        <span class="plan-chip">${user.plan}</span>
        <span class="muted user-email">${user.email}</span>
        <form method="post" action="/logout">${csrfField(csrfToken)}<button class="btn btn--soft btn--sm" type="submit">Log out</button></form>
      </div>
    </div>
  </header>
  <main class="wrap page">
    ${notice ? html`<div class="alert alert--${notice.type || 'info'}" role="status">${notice.text}</div>` : ''}
    ${body}
  </main>
</body>
</html>`;
}

/** Centered card for login and sign up. */
export function authLayout({ title, body }) {
  return html`<!doctype html>
<html lang="en">
<head>${head(title)}</head>
<body class="auth">
  <div class="auth__glow" aria-hidden="true"></div>
  <main class="auth__card">
    <div class="auth__logo">${logo()}</div>
    ${body}
  </main>
</body>
</html>`;
}

/** Public pages such as pricing and error pages. */
export function publicLayout({ title, user, body }) {
  return html`<!doctype html>
<html lang="en">
<head>${head(title)}</head>
<body class="public">
  <header class="topbar topbar--public">
    <div class="wrap topbar__inner">
      ${logo()}
      <nav class="topnav" aria-label="Main">
        <a href="/#features">Features</a>
        <a href="/pricing">Pricing</a>
        <a href="/#faq">FAQ</a>
      </nav>
      <div class="topbar__user">
        ${user
          ? html`<a href="/app" class="btn btn--dark btn--sm">Dashboard</a>`
          : html`<a href="/login" class="btn btn--soft btn--sm">Log in</a><a href="/signup" class="btn btn--dark btn--sm">Get started</a>`}
      </div>
    </div>
  </header>
  <main class="wrap page page--public">${body}</main>
</body>
</html>`;
}
