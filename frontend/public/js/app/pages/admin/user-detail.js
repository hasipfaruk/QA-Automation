import { get, patch, post, del } from '../../core/api.js';
import { html, mount, $, formData } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { renderShell, toast, busy } from '../../core/layout.js';
import { num, dateTime, dateOnly, timeAgo, planBadge, roleBadge, userStatusBadge, capitalize } from '../../core/format.js';
import { scanTable } from '../../components/scan-table.js';

const option = (value, label, current) => html`<option value="${value}" ${value === current ? 'selected' : ''}>${label}</option>`;
const initials = (u) => (u.name || u.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');

export async function render({ session, params, main }) {
  renderShell({ session, active: 'admin-users', title: 'Customer', description: '' });
  const id = params[0];
  const isSelf = String(session.user.id) === String(id);

  async function load() {
    const d = await get(`/admin/users/${id}`);
    const u = d.user;
    document.title = `${u.email} | Proofline`;
    $('.topbar__title').innerHTML = String(html`<h1>${u.name || u.email}</h1><p class="muted small">${u.role === 'admin' ? 'Administrator account' : 'Customer account'}</p>`);

    mount(main, html`
      <a href="/app/admin/users" class="back-link">${icon('arrowLeft')} All customers</a>
      <section class="panel" style="margin-bottom:20px">
        <div class="panel__body profile">
          <span class="avatar" aria-hidden="true">${initials(u)}</span>
          <div>
            <h2>${u.name || 'Unnamed account'}</h2>
            <p class="muted">${u.email}</p>
            <div class="row" style="margin-top:8px">${planBadge(u.plan)} ${roleBadge(u.role)} ${userStatusBadge(u.status)}</div>
          </div>
        </div>
      </section>

      <div class="grid-2">
        <form id="edit-form" class="panel">
          <div class="panel__head"><div><h2>Access and plan</h2><p class="muted small">Plans set here are not billed. Paid subscriptions update automatically.</p></div></div>
          <div class="panel__body form-section__fields">
            <label class="field"><span class="field__label">Plan</span><select class="select" name="plan">${['trial', 'pro', 'business', 'enterprise'].map((p) => option(p, capitalize(p), u.plan))}</select></label>
            <label class="field"><span class="field__label">Role</span><select class="select" name="role" ${isSelf ? 'disabled' : ''}>${option('user', 'Customer', u.role)}${option('admin', 'Administrator', u.role)}</select></label>
            <label class="field"><span class="field__label">Status</span><select class="select" name="status" ${isSelf ? 'disabled' : ''}>${option('active', 'Active', u.status)}${option('suspended', 'Suspended (cannot sign in or use the API)', u.status)}</select>
              ${isSelf ? html`<span class="field__hint">You cannot change your own role or status.</span>` : ''}</label>
          </div>
          <div class="panel__foot"><button class="btn btn--primary" type="submit">Save changes</button></div>
        </form>

        <section class="panel">
          <div class="panel__head"><h2>Account details</h2></div>
          <div class="panel__body">
            <dl class="facts">
              <dt>Joined</dt><dd>${dateTime(u.createdAt)}</dd>
              <dt>Last sign-in</dt><dd>${timeAgo(u.lastLoginAt)}</dd>
              <dt>Scan usage</dt><dd>${num(d.usage.used)} of ${num(d.usage.limit)}${d.plan.trialEndsAt ? ` (trial ${d.usage.trialExpired ? 'ended' : `ends ${dateOnly(d.plan.trialEndsAt)}`})` : ' this month'}</dd>
              <dt>Active sessions</dt><dd>${num(d.activeSessions)}</dd>
              <dt>API tokens</dt><dd>${d.tokens.length ? d.tokens.map((t) => t.name).join(', ') : 'None'}</dd>
              <dt>Subscription</dt><dd>${d.stripe.status ? capitalize(d.stripe.status) : 'None'}</dd>
              <dt>Billing customer</dt><dd class="mono small">${d.stripe.customerId || '-'}</dd>
            </dl>
          </div>
          <div class="panel__foot">
            <button class="btn btn--sm" id="sign-out" type="button">${icon('logout')} End all sessions</button>
            ${isSelf ? '' : html`<button class="btn btn--sm btn--danger" id="delete-user" type="button">${icon('trash')} Delete account</button>`}
          </div>
        </section>
      </div>

      <div class="section-title"><h2>Recent scans</h2><a href="/app/admin/scans?q=${encodeURIComponent(u.email)}">View all</a></div>
      ${scanTable(d.recentScans, { empty: { title: 'No scans', text: 'This customer has not run any scans yet.' }, hrefFor: (s) => s.reportUrl || '#' })}`);

    $('#edit-form').addEventListener('submit', (e) => {
      e.preventDefault();
      busy(e.target.querySelector('button[type=submit]'), async () => {
        const res = await patch(`/admin/users/${id}`, formData(e.target));
        toast(Object.keys(res.changes).length ? 'Account updated.' : 'No changes to save.', 'success');
        await load();
      }, 'Saving...');
    });
    const signOut = $('#sign-out');
    signOut.addEventListener('click', () => busy(signOut, async () => {
      await post(`/admin/users/${id}/sign-out`);
      toast('All sessions for this account were ended.', 'success');
      await load();
    }));
    const remove = $('#delete-user');
    remove?.addEventListener('click', () => {
      const typed = window.prompt(`This permanently deletes ${u.email} with all scans and reports. Type the email address to confirm.`);
      if (typed?.trim().toLowerCase() !== u.email.toLowerCase()) return;
      busy(remove, async () => { await del(`/admin/users/${id}`); window.location.href = '/app/admin/users?notice=deleted'; });
    });
  }
  await load();
}
