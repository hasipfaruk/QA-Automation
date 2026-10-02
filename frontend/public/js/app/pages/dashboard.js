import { get } from '../core/api.js';
import { html, mount, $ } from '../core/html.js';
import { icon } from '../core/icons.js';
import { renderShell, flashFromQuery } from '../core/layout.js';
import { num, dateOnly, timeAgo, hostOf } from '../core/format.js';
import { scanTable } from '../components/scan-table.js';

function trialNotice(usage) {
  if (usage.plan.id !== 'trial') return '';
  if (usage.trialExpired) {
    return html`<div class="alert alert--danger">${icon('alert')}<div><b>Your trial has ended.</b> Choose a plan to continue scanning. Your scan history is kept. <a href="/app/billing">View plans</a></div></div>`;
  }
  const days = Math.max(0, Math.ceil((Date.parse(usage.plan.trialEndsAt) - Date.now()) / 864e5));
  return html`<div class="alert alert--info">${icon('alert')}<div><b>${days} day${days === 1 ? '' : 's'} left in your free trial</b> (ends ${dateOnly(usage.plan.trialEndsAt)}). Upgrade for more pages, all devices, user flows and AI review. <a href="/app/billing">Compare plans</a></div></div>`;
}

function kpi(label, iconName, value, hint, tone = '') {
  return html`<div class="kpi ${tone ? `kpi--${tone}` : ''}">
    <span class="kpi__label">${icon(iconName)}${label}</span>
    <span class="kpi__value">${value}</span>
    <span class="kpi__hint">${hint}</span>
  </div>`;
}

export async function render({ session, main }) {
  const firstName = (session.user.name || '').split(' ')[0];
  renderShell({ session, active: 'overview', title: firstName ? `Welcome back, ${firstName}` : 'Overview', description: 'Quality across your websites at a glance.' });
  flashFromQuery({ welcome: { type: 'success', text: 'Welcome to Proofline. Start your first scan.' } });

  const [usage, recent] = await Promise.all([get('/usage'), get('/scans?limit=8')]);
  const done = recent.data.filter((s) => s.status === 'done' && s.summary);
  const latest = done[0];
  const avg = done.length ? Math.round(done.reduce((sum, s) => sum + s.score, 0) / done.length) : null;
  const critical = latest ? (latest.summary.bySeverity.critical || 0) + (latest.summary.bySeverity.high || 0) : null;
  const pct = usage.limit ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;

  mount(main, html`
    ${trialNotice(usage)}
    <div class="kpis">
      ${kpi(usage.plan.id === 'trial' ? 'Scans in trial' : 'Scans this month', 'activity', html`${num(usage.used)}<span class="faint small"> / ${num(usage.limit)}</span>`,
        html`<div class="meter" style="margin-top:6px"><i style="width:${pct}%"></i></div>`)}
      ${kpi('Average score', 'overview', avg ?? '-', done.length ? `Across your last ${done.length} completed scan${done.length === 1 ? '' : 's'}` : 'No completed scans yet')}
      ${kpi('High priority issues', 'alert', critical ?? '-', latest ? `Critical and high in ${hostOf(latest.url)}` : 'From your latest scan', critical ? 'danger' : critical === 0 ? 'success' : '')}
      ${kpi('Last scan', 'refresh', recent.data[0] ? timeAgo(recent.data[0].createdAt) : '-', recent.data[0] ? hostOf(recent.data[0].url) : 'Nothing scanned yet')}
    </div>

    <div class="panel">
      <div class="panel__head"><div><h2>Quick scan</h2><p class="muted small">Test a URL with your default settings. Use New scan for devices, user flows and advanced checks.</p></div></div>
      <form class="panel__body url-input" id="quick-scan" novalidate>
        <label class="sr-only" for="quick-url">Website URL</label>
        <input class="input" id="quick-url" name="url" type="text" inputmode="url" placeholder="https://www.example.com" required>
        <button class="btn btn--primary btn--lg" type="submit">${icon('plus')} Scan website</button>
      </form>
    </div>

    <div class="section-title"><h2>Recent scans</h2>${recent.total ? html`<a href="/app/scans">View all scans</a>` : ''}</div>
    ${scanTable(recent.data, { empty: { title: 'No scans yet', text: 'Enter a URL above or open New scan to test your first website.', action: { href: '/app/scans/new', label: 'Create a scan' } } })}`);

  $('#quick-scan').addEventListener('submit', (e) => {
    e.preventDefault();
    const url = $('#quick-url').value.trim();
    if (url) window.location.href = `/app/scans/new?url=${encodeURIComponent(url)}`;
  });
}
