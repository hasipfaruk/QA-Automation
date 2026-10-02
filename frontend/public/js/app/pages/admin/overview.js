import { get } from '../../core/api.js';
import { html, mount } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { renderShell } from '../../core/layout.js';
import { num, money, timeAgo, hostOf, planBadge } from '../../core/format.js';

const PLAN_ORDER = ['trial', 'pro', 'business', 'enterprise'];

function kpi(label, iconName, value, hint, tone = '') {
  return html`<div class="kpi ${tone ? `kpi--${tone}` : ''}"><span class="kpi__label">${icon(iconName)}${label}</span><span class="kpi__value">${value}</span><span class="kpi__hint">${hint}</span></div>`;
}

function dailyChart(series) {
  const max = Math.max(1, ...series.map((d) => d.scans));
  return html`<div class="chart" role="img" aria-label="Scans per day over the last 14 days">
    ${series.map((d) => html`<div class="chart__col" title="${d.day}: ${d.scans} scans">
      <span class="chart__val">${d.scans || ''}</span>
      <i class="chart__bar" style="height:${Math.round((d.scans / max) * 100)}%"></i>
      <span class="chart__label">${d.day.slice(8)}</span>
    </div>`)}
  </div>`;
}

export async function render({ session, main }) {
  renderShell({ session, active: 'admin-overview', title: 'Platform overview', description: 'Customers, revenue and scanning activity across Proofline.' });
  const s = await get('/admin/stats');
  const paidShare = s.users.total ? Math.round((s.revenue.payingCustomers / s.users.total) * 100) : 0;

  mount(main, html`
    <div class="kpis kpis--3">
      ${kpi('Customers', 'users', num(s.users.total), `${num(s.users.new7d)} joined in the last 7 days`)}
      ${kpi('Estimated MRR', 'card', money(s.revenue.estimatedMrr), `${num(s.revenue.payingCustomers)} paying accounts (${paidShare}%)`)}
      ${kpi('Scans today', 'activity', num(s.scans.today), `${num(s.scans.last30d)} in the last 30 days`)}
      ${kpi('Scan queue', 'refresh', `${num(s.scans.running)} running`, `${num(s.scans.queued)} waiting`)}
      ${kpi('Failed scans', 'alert', num(s.scans.failed24h), 'In the last 24 hours', s.scans.failed24h ? 'danger' : 'success')}
      ${kpi('Average score', 'overview', s.scans.averageScore30d ?? '-', 'Completed scans, last 30 days')}
    </div>

    <div class="grid-2">
      <section class="panel"><div class="panel__head"><h2>Scans per day</h2><span class="faint small">Last 14 days</span></div><div class="panel__body">${dailyChart(s.scans.daily)}</div></section>
      <section class="panel"><div class="panel__head"><h2>Customers by plan</h2><a class="link small" href="/app/admin/users">Manage</a></div>
        <div class="panel__body"><div class="bars">${PLAN_ORDER.map((p) => {
          const n = s.users.byPlan[p] || 0;
          return html`<div class="bars__row">${planBadge(p)}<div class="meter"><i style="width:${s.users.total ? Math.round((n / s.users.total) * 100) : 0}%"></i></div><b>${n}</b></div>`;
        })}</div>
        <p class="faint small" style="margin-top:18px">${num(s.users.byStatus.suspended || 0)} suspended account(s)</p></div>
      </section>
    </div>

    <div class="grid-2" style="margin-top:20px">
      <section class="panel"><div class="panel__head"><h2>Newest customers</h2><a class="link small" href="/app/admin/users">View all</a></div>
        <ul class="list">${s.recentUsers.map((u) => html`<li>
          <a class="list__main" href="/app/admin/users/${u.id}"><b>${u.name || u.email}</b><span>${u.email}</span></a>
          <span class="row">${planBadge(u.plan)}<span class="faint small nowrap">${timeAgo(u.createdAt)}</span></span>
        </li>`)}</ul>
      </section>
      <section class="panel"><div class="panel__head"><h2>Recent failed scans</h2><a class="link small" href="/app/admin/scans?status=failed">View all</a></div>
        ${s.recentFailures.length ? html`<ul class="list">${s.recentFailures.map((f) => html`<li>
          <span class="list__main"><b>${hostOf(f.url)}</b><span>${f.userEmail} | ${f.error || 'Unknown error'}</span></span>
          <span class="faint small nowrap">${timeAgo(f.finishedAt)}</span>
        </li>`)}</ul>` : html`<div class="panel__body"><p class="muted">No failed scans. Everything is running normally.</p></div>`}
      </section>
    </div>`);
}
