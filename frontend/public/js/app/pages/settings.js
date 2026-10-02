import { post, patch, del } from '../core/api.js';
import { html, mount, $, formData } from '../core/html.js';
import { renderShell, toast, busy } from '../core/layout.js';
import { dateOnly } from '../core/format.js';

export async function render({ session, main }) {
  renderShell({ session, active: 'settings', title: 'Settings', description: 'Manage your profile and security.' });
  const { user } = session;
  const isAdmin = user.role === 'admin';

  mount(main, html`
    <div class="stack">
      <form id="profile-form" class="panel">
        <div class="panel__head"><div><h2>Profile</h2><p class="muted small">Member since ${dateOnly(user.createdAt)}</p></div></div>
        <div class="panel__body form-section__fields">
          <label class="field"><span class="field__label">Full name</span><input class="input" name="name" type="text" maxlength="80" value="${user.name || ''}" autocomplete="name"></label>
          <label class="field"><span class="field__label">Email</span><input class="input" type="email" value="${user.email}" disabled><span class="field__hint">Contact support to change the email address on your account.</span></label>
        </div>
        <div class="panel__foot"><button class="btn btn--primary" type="submit">Save changes</button></div>
      </form>

      <form id="password-form" class="panel">
        <div class="panel__head"><div><h2>Password</h2><p class="muted small">After changing your password, all other devices are signed out.</p></div></div>
        <div class="panel__body grid-2">
          <label class="field"><span class="field__label">Current password</span><input class="input" type="password" name="current" autocomplete="current-password" required></label>
          <label class="field"><span class="field__label">New password</span><input class="input" type="password" name="password" autocomplete="new-password" minlength="10" required><span class="field__hint">At least 10 characters.</span></label>
        </div>
        <div class="panel__foot"><button class="btn btn--primary" type="submit">Update password</button></div>
      </form>

      ${isAdmin ? '' : html`<form id="delete-form" class="panel panel--danger">
        <div class="panel__head"><div><h2>Delete account</h2><p class="muted small">Permanently deletes your account, scans, reports and API tokens. Cancel any active subscription first.</p></div></div>
        <div class="panel__body"><label class="field"><span class="field__label">Type your email address to confirm</span><input class="input" type="email" name="confirm" autocomplete="off" placeholder="${user.email}" required></label></div>
        <div class="panel__foot"><button class="btn btn--danger" type="submit">Delete account</button></div>
      </form>`}
    </div>`);

  $('#profile-form').addEventListener('submit', (e) => {
    e.preventDefault();
    busy(e.target.querySelector('button'), async () => {
      await patch('/account', { name: formData(e.target).name });
      toast('Profile saved.', 'success');
    }, 'Saving...');
  });
  $('#password-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const d = formData(e.target);
    busy(e.target.querySelector('button'), async () => {
      await post('/account/password', { current: d.current, password: d.password });
      e.target.reset();
      toast('Password updated. Other devices have been signed out.', 'success');
    }, 'Updating...');
  });
  $('#delete-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!window.confirm('This permanently deletes your account and all of its data. Continue?')) return;
    busy(e.target.querySelector('button'), async () => {
      const res = await del('/account', { confirm: formData(e.target).confirm });
      window.location.href = res?.redirect || '/';
    }, 'Deleting...');
  });
}
