import { get, patch, post, del } from '../../core/api.js';
import { html, mount, $, formData } from '../../core/html.js';
import { renderShell, toast, busy } from '../../core/layout.js';
import { num, dateTime, dateOnly, timeAgo, planBadge, roleBadge, userStatusBadge } from '../../core/format.js';
import { scanTable } from '../../components/scan-table.js';

const option = (value, current) => html`<option value="${value}" ${value === current ? 'selected' : ''}>${value}</option>`;

export async function render({ session, params, main }) {
  renderShell({ session, active: 'admin-users', title: 'User' });
  const id = params[0];
  const isSelf = String(session.user.id) === String(id);

  async function load() {
    const d = await get(`/admin/users/${id}`);
    const u = d.user;
    document.title = `${u.email} | QA Automation`;
    mount(main, html`
      <div class="page-head">
        <div><a href="/app/admin/users" class="link small">All users</a>
          <h1 class="break">${u.email}</h1>
          <p class="muted">${u.name || 'No name'} | joined ${dateOnly(u.createdAt)} | last login ${timeAgo(u.lastLoginAt)}</p>
          <p class="badges">${planBadge(u.plan)} ${roleBadge(u.role)} ${userStatusBadge(u.status)}</p>
        </div>
      </div>

      <div class="grid-2">
        <form id="edit-form" class="card form-stack">
          <h2 class="card-title">Account</h2>
          <label class="field"><span>Plan</span><select name="plan">${['trial', 'pro', 'business', 'enterprise'].map((p) => option(p, u.plan))}</select></label>
          <label class="field"><span>Role</span><select name="role" ${isSelf ? 'disabled' : ''}>${['user', 'admin'].map((r) => option(r, u.role))}</select></label>
          <label class="field"><span>Status</span><select name="status" ${isSelf ? 'disabled' : ''}>${['active', 'suspended'].map((s) => option(s, u.status))}</select></label>
          ${isSelf ? html`<p class="muted small">You cannot change your own role or status.</p>` : ''}
          <button class="btn btn--dark" type="submit">Save changes</button>
          <p class="muted small">Plans set here are not billed. Paid subscriptions are managed by the payment provider.</p>
        </form>

        <div class="card">
          <h2 class="card-title">Usage and billing</h2>
          <dl class="facts">
            <dt>Scans used</dt><dd>${num(d.usage.used)} of ${num(d.usage.limit)}${d.plan.trialEndsAt ? ` (trial ${d.usage.trialExpired ? 'ended' : `ends ${dateOnly(d.plan.trialEndsAt)}`})` : ''}</dd>
            <dt>Active sessions</dt><dd>${num(d.activeSessions)}</dd>
            <dt>API tokens</dt><dd>${d.tokens.length ? d.tokens.map((t) => html`<span class="token-pill" title="created ${dateTime(t.createdAt)}">${t.name} <code>${t.prefix}...</code></span>`) : 'None'}</dd>
            <dt>Billing customer ID</dt><dd>${d.stripe.customerId || '-'}</dd>
            <dt>Subscription</dt><dd>${d.stripe.status || '-'}</dd>
          </dl>
          <div class="actions-row">
            <button class="btn btn--soft btn--sm" id="sign-out" type="button">Sign out everywhere</button>
            ${isSelf ? '' : html`<button class="btn btn--danger btn--sm" id="delete-user" type="button">Delete user</button>`}
          </div>
        </div>
      </div>

      <div class="section-head-row"><h2>Recent scans</h2><a class="link" href="/app/admin/scans?q=${encodeURIComponent(u.email)}">All scans by this user</a></div>
      ${scanTable(d.recentScans, { emptyText: 'This user has not run any scans.', hrefFor: (s) => s.reportUrl || '#' })}`);

    $('#edit-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const body = formData(e.target);
      busy(e.target.querySelector('button[type=submit]'), async () => {
        const res = await patch(`/admin/users/${id}`, body);
        toast(Object.keys(res.changes).length ? 'User updated.' : 'No changes.', 'success');
        await load();
      });
    });
    const signOut = $('#sign-out');
    signOut.addEventListener('click', () => busy(signOut, async () => {
      await post(`/admin/users/${id}/sign-out`);
      toast('All sessions for this user were ended.', 'success');
      await load();
    }));
    const remove = $('#delete-user');
    remove?.addEventListener('click', () => {
      const typed = window.prompt(`This permanently deletes ${u.email} and all their data. Type the email to confirm.`);
      if (typed?.trim().toLowerCase() !== u.email.toLowerCase()) return;
      busy(remove, async () => { await del(`/admin/users/${id}`); window.location.href = '/app/admin/users?notice=deleted'; });
    });
  }
  await load();
}
