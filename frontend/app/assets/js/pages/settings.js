import { post, patch, del } from '../core/api.js';
import { html, mount, $, formData } from '../core/html.js';
import { renderShell, toast, busy } from '../core/shell.js';
import { dateOnly } from '../core/format.js';

export async function render({ session, main }) {
  renderShell({ session, active: 'settings', title: 'Settings' });
  const { user } = session;

  mount(main, html`
    <div class="page-head"><div><h1>Settings</h1><p class="muted">${user.email} | member since ${dateOnly(user.createdAt)}</p></div></div>
    <div class="grid-2">
      <div class="stack">
        <form id="profile-form" class="card form-stack">
          <h2 class="card-title">Profile</h2>
          <label class="field"><span>Full name</span><input name="name" type="text" maxlength="80" value="${user.name || ''}" autocomplete="name"></label>
          <label class="field"><span>Email</span><input type="email" value="${user.email}" disabled></label>
          <button class="btn btn--dark" type="submit">Save profile</button>
        </form>
        <form id="password-form" class="card form-stack">
          <h2 class="card-title">Change password</h2>
          <label class="field"><span>Current password</span><input type="password" name="current" autocomplete="current-password" required></label>
          <label class="field"><span>New password</span><input type="password" name="password" autocomplete="new-password" minlength="10" required></label>
          <button class="btn btn--dark" type="submit">Update password</button>
          <p class="muted small">Other devices are signed out after a password change.</p>
        </form>
      </div>
      <form id="delete-form" class="card form-stack danger">
        <h2 class="card-title">Delete account</h2>
        <p class="muted small">Permanently deletes your account, scans, reports and API tokens. Cancel any subscription in Billing first.</p>
        <label class="field"><span>Type your email to confirm</span><input type="email" name="confirm" autocomplete="off" required></label>
        <button class="btn btn--danger" type="submit">Delete my account</button>
      </form>
    </div>`);

  $('#profile-form').addEventListener('submit', (e) => {
    e.preventDefault();
    busy(e.target.querySelector('button'), async () => {
      await patch('/account', { name: formData(e.target).name });
      toast('Profile saved.', 'success');
    });
  });
  $('#password-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const d = formData(e.target);
    busy(e.target.querySelector('button'), async () => {
      await post('/account/password', { current: d.current, password: d.password });
      e.target.reset();
      toast('Password updated. Other devices have been signed out.', 'success');
    });
  });
  $('#delete-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!window.confirm('This permanently deletes your account and all data. Continue?')) return;
    busy(e.target.querySelector('button'), async () => {
      const res = await del('/account', { confirm: formData(e.target).confirm });
      window.location.href = res?.redirect || '/';
    });
  });
}
