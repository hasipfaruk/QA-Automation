import { get } from '../../core/api.js';
import { html, mount } from '../../core/html.js';
import { renderShell } from '../../core/layout.js';
import { num, money, timeAgo, hostOf, planBadge } from '../../core/format.js';

const PLAN_ORDER = ['trial', 'pro', 'business', 'enterprise'];

function kpi(label, value, hint, tone = '') {
  return html`<div class="card kpi ${tone}"><span class="eyebrow">${label}</span><b>${value}</b>${hint ? html`<span class="muted small">${hint}</span>` : ''}</div>`;
}

function dailyChart(series) {
  const max = Math.max(1, ...series.map((d) => d.scans));
  return html`<div class="chart" role="img" aria-label="Scans per day for the last 14 days">
    ${series.map((d) => html`<div class="chart__col" title="${d.day}: ${d.scans} scans">
      <span class="chart__val">${d.scans || ''}</span>
      <i style="height:${Math.round((d.scans / max) * 100)}%"></i>
      <span class="chart__label">${d.day.slice(5)}</span>
    </div>`)}
  </div>`;
}

function planBars(byPlan, total) {
  return html`<div class="bars">${PLAN_ORDER.map((p) => {
    const n = byPlan[p] || 0;
    return html`<div class="bars__row"><span>${planBadge(p)}</span><div class="bar"><i style="width:${total ? Math.round((n / total) * 100) : 0}%"></i></div><b>${n}</b></div>`;
  })}</div>`;
}

export async function render({ session, main }) {
  renderShell({ session, active: 'admin-overview', title: 'Admin overview' });
  const s = await get('/admin/stats');

  mount(main, html`
    <div class="page-head"><div><h1>Platform overview</h1><p class="muted">Live numbers across all customers.</p></div></div>
    <div class="kpis">
      ${kpi('Customers', num(s.users.total), `${num(s.users.new7d)} new in the last 7 days`)}
      ${kpi('Estimated MRR', money(s.revenue.estimatedMrr), `${num(s.revenue.payingCustomers)} paying accounts`)}
      ${kpi('Scans today', num(s.scans.today), `${num(s.scans.last30d)} in the last 30 days`)}
      ${kpi('Queue', `${num(s.scans.running)} / ${num(s.scans.queued)}`, 'running / waiting')}
      ${kpi('Failed (24h)', num(s.scans.failed24h), 'scans that could not finish', s.scans.failed24h ? 'kpi--warn' : '')}
      ${kpi('Average score', s.scans.averageScore30d ?? '-', 'last 30 days')}
    </div>
    <div class="grid-2">
      <div class="card"><h2 class="card-title">Scans per day</h2>${dailyChart(s.scans.daily)}</div>
      <div class="card"><h2 class="card-title">Customers by plan</h2>${planBars(s.users.byPlan, s.users.total)}
        <p class="muted small" style="margin-top:12px">${num(s.users.byStatus.suspended || 0)} suspended account(s)</p></div>
    </div>
    <div class="grid-2">
      <div class="card"><div class="card-title-row"><h2 class="card-title">Newest customers</h2><a class="link small" href="/app/admin/users">All users</a></div>
        <ul class="list">${s.recentUsers.map((u) => html`<li><a class="link" href="/app/admin/users/${u.id}">${u.email}</a> ${planBadge(u.plan)}<span class="muted small">${timeAgo(u.createdAt)}</span></li>`)}</ul></div>
      <div class="card"><div class="card-title-row"><h2 class="card-title">Recent failed scans</h2><a class="link small" href="/app/admin/scans?status=failed">All failures</a></div>
        ${s.recentFailures.length ? html`<ul class="list">${s.recentFailures.map((f) => html`<li><div><b>${hostOf(f.url)}</b> <span class="muted small">${f.userEmail}</span><p class="muted small">${f.error || 'Unknown error'}</p></div><span class="muted small">${timeAgo(f.finishedAt)}</span></li>`)}</ul>` : html`<p class="muted">No failed scans.</p>`}</div>
    </div>`);
}
