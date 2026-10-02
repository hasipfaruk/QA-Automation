import { get, post } from './core/api.js';
import { html, mount, $, formData } from './core/html.js';

const root = $('#auth-root');
const isSignup = window.location.pathname.startsWith('/signup');
const next = new URLSearchParams(window.location.search).get('next') || '';

function showError(message) {
  const el = $('#form-error');
  el.textContent = message;
  el.hidden = !message;
}

function signupView(open) {
  document.title = 'Start your trial | QA Automation';
  if (!open) {
    return html`<h1>Sign ups are closed</h1><p class="muted">New accounts are not available right now.</p>
      <p class="auth__switch">Already have an account? <a href="/login">Log in</a></p>`;
  }
  return html`
    <h1>Start your free trial</h1>
    <p class="muted">14 days, no card required. Upgrade any time.</p>
    <form id="auth-form" class="form-stack" novalidate>
      <p id="form-error" class="form-error" role="alert" hidden></p>
      <label class="field"><span>Full name</span><input name="name" type="text" autocomplete="name" maxlength="80"></label>
      <label class="field"><span>Work email</span><input name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>Password <span class="muted">(at least 10 characters)</span></span><input name="password" type="password" autocomplete="new-password" minlength="10" required></label>
      <button class="btn btn--dark btn--block" type="submit">Create account</button>
      <p class="muted small">By creating an account you agree to the terms of service and privacy policy.</p>
    </form>
    <p class="auth__switch">Already have an account? <a href="/login">Log in</a></p>`;
}

function loginView() {
  document.title = 'Log in | QA Automation';
  return html`
    <h1>Welcome back</h1>
    <p class="muted">Log in to run scans and view your reports.</p>
    <form id="auth-form" class="form-stack" novalidate>
      <p id="form-error" class="form-error" role="alert" hidden></p>
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn btn--dark btn--block" type="submit">Log in</button>
    </form>
    <p class="auth__switch">New to QA Automation? <a href="/signup">Start a free trial</a></p>`;
}

async function start() {
  let config = { signupsOpen: true };
  try { config = await get('/config'); } catch { /* keep defaults */ }
  mount(root, isSignup ? signupView(config.signupsOpen) : loginView());
  const form = $('#auth-form');
  if (!form) return;
  form.querySelector('input[type=email]')?.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const data = formData(form);
    if (!data.email || !data.password) return showError('Enter your email and password.');
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      const res = isSignup
        ? await post('/auth/signup', { name: data.name, email: data.email, password: data.password })
        : await post('/auth/login', { email: data.email, password: data.password, next });
      window.location.href = res.redirect || '/app';
    } catch (err) {
      showError(err.message);
      button.disabled = false;
    }
  });
}

start();
