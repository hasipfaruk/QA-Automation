import { html } from '../core/html.js';
import { icon } from '../core/icons.js';
import { hostOf, scoreRing, statusPill, severityDots, timeAgo } from '../core/format.js';

/**
 * Table of scans.
 * @param {object[]} scans
 * @param {{ showOwner?: boolean, empty?: object, hrefFor?: (scan) => string, actions?: (scan) => any }} options
 */
export function scanTable(scans, { showOwner = false, empty, hrefFor = (s) => `/app/scans/${s.id}`, actions } = {}) {
  if (!scans.length) {
    const e = empty || { title: 'No scans yet', text: 'Run your first scan to see results here.' };
    return html`<div class="empty">
      <div class="empty__icon">${icon('scans')}</div>
      <h3>${e.title}</h3><p class="muted">${e.text}</p>
      ${e.action ? html`<a class="btn btn--primary" href="${e.action.href}">${e.action.label}</a>` : ''}
    </div>`;
  }
  return html`
    <div class="table-wrap">
      <table class="table">
        <thead><tr>
          <th>Website</th>${showOwner ? html`<th>Customer</th>` : ''}<th>Status</th><th>Score</th><th>Issues</th><th>Started</th><th class="table__actions"><span class="sr-only">Actions</span></th>
        </tr></thead>
        <tbody>
          ${scans.map((s) => html`<tr>
            <td><a href="${hrefFor(s)}" class="table__primary">${hostOf(s.url)}</a><span class="table__secondary">${s.url}</span></td>
            ${showOwner ? html`<td><a class="table__primary small" href="/app/admin/users/${s.userId}">${s.userEmail}</a></td>` : ''}
            <td>${statusPill(s.status)}</td>
            <td>${scoreRing(s.score)}</td>
            <td>${severityDots(s.summary?.bySeverity)}</td>
            <td class="nowrap muted small">${timeAgo(s.createdAt)}</td>
            <td class="table__actions">${actions ? actions(s) : s.reportUrl ? html`<a href="${s.reportUrl}" class="btn btn--sm btn--ghost" target="_blank" rel="noopener">Report ${icon('external', 'icon icon--xs')}</a>` : ''}</td>
          </tr>`)}
        </tbody>
      </table>
    </div>`;
}
