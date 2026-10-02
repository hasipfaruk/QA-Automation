import { get, post } from './core/api.js';
import { html, mount, $, formData } from './core/html.js';

const root = $('#auth-root');
const isSignup = window.location.pathname.startsWith('/signup');
const next = new URLSearchParams(window.location.search).get('next') || '';

const passwordInput = (autocomplete) => html`
  <div class="password-field">
    <input class="input" id="password" name="password" type="password" autocomplete="${autocomplete}" required ${isSignup ? 'minlength="10"' : ''}>
    <button type="button" data-toggle-password aria-label="Show password">Show</button>
  </div>`;

function signupView(open) {
  document.title = 'Create your account | Proofline';
  if (!open) {
    return html`<h1>Sign-ups are paused</h1>
      <p class="auth__sub">New accounts are not available right now. Contact sales to get access.</p>
      <p class="auth__switch">Already have an account? <a href="/login">Sign in</a></p>`;
  }
  return html`
    <h1>Create your account</h1>
    <p class="auth__sub">Start your 14-day free trial. No credit card required.</p>
    <form id="auth-form" class="auth__form" novalidate>
      <div id="form-error" class="form-error" role="alert" hidden></div>
      <label class="field"><span class="field__label">Full name</span><input class="input" name="name" type="text" autocomplete="name" maxlength="80" placeholder="Jane Cooper"></label>
      <label class="field"><span class="field__label">Work email</span><input class="input" name="email" type="email" autocomplete="email" required placeholder="jane@company.com"></label>
      <div class="field">
        <label class="field__label" for="password">Password</label>
        ${passwordInput('new-password')}
        <div class="strength" id="strength" data-level="0" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <span class="field__hint">At least 10 characters. Use a mix of words, numbers and symbols.</span>
      </div>
      <button class="btn btn--primary btn--lg btn--block" type="submit">Create account</button>
      <p class="auth__legal">By creating an account you agree to the Terms of Service and Privacy Policy.</p>
    </form>
    <p class="auth__switch">Already have an account? <a href="/login">Sign in</a></p>`;
}

function loginView() {
  document.title = 'Sign in | Proofline';
  return html`
    <h1>Welcome back</h1>
    <p class="auth__sub">Sign in to your Proofline workspace.</p>
    <form id="auth-form" class="auth__form" novalidate>
      <div id="form-error" class="form-error" role="alert" hidden></div>
      <label class="field"><span class="field__label">Email</span><input class="input" name="email" type="email" autocomplete="email" required placeholder="you@company.com"></label>
      <div class="field">
        <label class="field__label" for="password">Password</label>
        ${passwordInput('current-password')}
      </div>
      <button class="btn btn--primary btn--lg btn--block" type="submit">Sign in</button>
    </form>
    <p class="auth__switch">New to Proofline? <a href="/signup">Start a free trial</a></p>`;
}

function scorePassword(value) {
  if (!value) return 0;
  let score = value.length >= 10 ? 1 : 0;
  if (value.length >= 14) score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score++;
  return Math.max(1, Math.min(4, score));
}

function showError(message) {
  const el = $('#form-error');
  el.textContent = message;
  el.hidden = !message;
}

async function start() {
  let config = { signupsOpen: true };
  try { config = await get('/config'); } catch { /* keep defaults */ }
  mount(root, isSignup ? signupView(config.signupsOpen) : loginView());

  const form = $('#auth-form');
  if (!form) return;
  form.querySelector(isSignup ? 'input[name=name]' : 'input[type=email]')?.focus();

  const pw = $('#password');
  $('[data-toggle-password]').addEventListener('click', (e) => {
    const visible = pw.type === 'text';
    pw.type = visible ? 'password' : 'text';
    e.currentTarget.textContent = visible ? 'Show' : 'Hide';
    e.currentTarget.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
  });
  const strength = $('#strength');
  if (strength) pw.addEventListener('input', () => { strength.dataset.level = String(scorePassword(pw.value)); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const data = formData(form);
    if (!data.email || !data.password) return showError('Enter your email and password.');
    if (isSignup && data.password.length < 10) return showError('Password must be at least 10 characters.');
    const button = form.querySelector('button[type=submit]');
    const label = button.textContent;
    button.disabled = true;
    button.textContent = isSignup ? 'Creating account...' : 'Signing in...';
    try {
      const res = isSignup
        ? await post('/auth/signup', { name: data.name, email: data.email, password: data.password })
        : await post('/auth/login', { email: data.email, password: data.password, next });
      window.location.href = res.redirect || '/app';
    } catch (err) {
      showError(err.message);
      button.disabled = false;
      button.textContent = label;
    }
  });
}

start();
