import { html } from './html.js';

export const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const STATUS_LABELS = { queued: 'Queued', running: 'Running', done: 'Completed', failed: 'Failed' };

export function timeAgo(iso) {
  if (!iso) return 'Never';
  const sec = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (sec < 60) return 'Just now';
  for (const [name, size] of [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
    const n = Math.floor(sec / size);
    if (n >= 1) return `${n} ${name}${n > 1 ? 's' : ''} ago`;
  }
  return 'Just now';
}

export const dateTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '-');
export const dateOnly = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '-');
export const num = (n) => (n === null || n === undefined ? '-' : Number(n).toLocaleString('en-US'));
export const money = (n) => (n === null || n === undefined ? 'Custom' : `$${Number(n).toLocaleString('en-US')}`);
export const plural = (n, word) => `${num(n)} ${word}${n === 1 ? '' : 's'}`;
export const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function duration(sec) {
  if (sec === null || sec === undefined) return '-';
  const m = Math.floor(sec / 60);
  return m ? `${m}m ${sec % 60}s` : `${sec}s`;
}

export function hostOf(url) {
  try { return new URL(url).host; } catch { return url; }
}

const scoreClass = (score) => (score >= 90 ? 'score--a' : score >= 75 ? 'score--b' : score >= 60 ? 'score--c' : 'score--f');

export function scoreRing(score, size = 'sm') {
  if (score === null || score === undefined) return html`<span class="score score--empty" aria-label="No score">-</span>`;
  return html`<span class="score score--${size} ${scoreClass(score)}" style="--p:${Number(score)}" aria-label="Score ${score} out of 100"><span>${score}</span></span>`;
}

export const statusPill = (status) => html`<span class="status status--${status}">${STATUS_LABELS[status] || status}</span>`;

export function severityDots(bySeverity) {
  if (!bySeverity) return html`<span class="faint">-</span>`;
  const parts = SEVERITIES.filter((k) => bySeverity[k]);
  if (!parts.length) return html`<span class="faint">No issues</span>`;
  return html`<span class="sev-counts">${parts.map((k) => html`<span title="${capitalize(k)}"><i class="dot dot--${k}"></i>${bySeverity[k]}</span>`)}</span>`;
}

export const sevLabel = (severity) => html`<span class="sev-label sev-label--${severity}">${severity}</span>`;

export const badge = (text, tone = '') => html`<span class="badge ${tone ? `badge--${tone}` : ''}">${text}</span>`;
const PLAN_TONES = { trial: '', pro: 'accent', business: 'info', enterprise: 'success' };
export const planBadge = (plan) => badge(capitalize(plan), PLAN_TONES[plan]);
export const roleBadge = (role) => badge(role === 'admin' ? 'Administrator' : 'Customer', role === 'admin' ? 'accent' : '');
export const userStatusBadge = (status) => html`<span class="badge badge--dot ${status === 'active' ? 'badge--success' : 'badge--danger'}">${capitalize(status)}</span>`;

export function pager(page, pages, total, label = 'results') {
  if (!total) return html``;
  return html`<nav class="pager" aria-label="Pagination">
    <span>${num(total)} ${label} | page ${page} of ${pages}</span>
    ${pages > 1 ? html`<span class="pager__buttons">
      <button class="btn btn--sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Previous</button>
      <button class="btn btn--sm" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next</button>
    </span>` : ''}
  </nav>`;
}

export function bindPager(root, onChange) {
  root.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => onChange(Number(b.dataset.page))));
}
