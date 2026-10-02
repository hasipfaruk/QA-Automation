import { html } from './html.js';

export const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const STATUS_LABELS = { queued: 'Queued', running: 'Running', done: 'Done', failed: 'Failed' };

export function timeAgo(iso) {
  if (!iso) return '-';
  const sec = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (sec < 60) return 'just now';
  for (const [name, size] of [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
    const n = Math.floor(sec / size);
    if (n >= 1) return `${n} ${name}${n > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

export const dateTime = (iso) => (iso ? new Date(iso).toLocaleString() : '-');
export const dateOnly = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '-');
export const num = (n) => (n === null || n === undefined ? '-' : Number(n).toLocaleString('en-US'));
export const money = (n) => (n === null || n === undefined ? 'Custom' : `$${Number(n).toLocaleString('en-US')}`);
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function hostOf(url) {
  try { return new URL(url).host; } catch { return url; }
}

const scoreClass = (score) => (score >= 90 ? 'score--a' : score >= 75 ? 'score--b' : score >= 60 ? 'score--c' : 'score--f');

export function scoreRing(score, size = 'sm') {
  if (score === null || score === undefined) return html`<span class="ring ring--${size} ring--empty">-</span>`;
  return html`<span class="ring ring--${size} ${scoreClass(score)}" style="--p:${Number(score)}"><span>${score}</span></span>`;
}

export const statusPill = (status) => html`<span class="status status--${status}">${STATUS_LABELS[status] || status}</span>`;

export function severityDots(bySeverity) {
  if (!bySeverity) return html`<span class="muted">-</span>`;
  const parts = SEVERITIES.filter((k) => bySeverity[k]);
  if (!parts.length) return html`<span class="muted">none</span>`;
  return html`<span class="sev-counts">${parts.map((k) => html`<span class="dot dot--${k}" title="${k}"></span>${bySeverity[k]} `)}</span>`;
}

export const badge = (text, tone = 'neutral') => html`<span class="badge badge--${tone}">${text}</span>`;
export const planBadge = (plan) => badge(plan, { trial: 'neutral', pro: 'mint', business: 'lavender', enterprise: 'peach' }[plan] || 'neutral');
export const roleBadge = (role) => badge(role, role === 'admin' ? 'dark' : 'neutral');
export const userStatusBadge = (status) => badge(status, status === 'active' ? 'ok' : 'danger');

export function pager(page, pages, onChange) {
  if (pages <= 1) return html``;
  return html`<nav class="pager" aria-label="Pagination">
    <button class="btn btn--soft btn--sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Previous</button>
    <span class="muted">Page ${page} of ${pages}</span>
    <button class="btn btn--soft btn--sm" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next</button>
  </nav>`;
}

export function bindPager(root, onChange) {
  root.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => onChange(Number(b.dataset.page))));
}
