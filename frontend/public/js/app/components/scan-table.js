import { html } from '../core/html.js';
import { hostOf, scoreRing, statusPill, severityDots, timeAgo } from '../core/format.js';

/** Table of scans. Pass showOwner for admin views. */
export function scanTable(scans, { showOwner = false, emptyText = 'No scans yet.', hrefFor = (s) => `/app/scans/${s.id}` } = {}) {
  if (!scans.length) return html`<div class="empty-state"><p>${emptyText}</p></div>`;
  return html`
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Site</th>${showOwner ? html`<th>Owner</th>` : ''}<th>Status</th><th>Score</th><th>Issues</th><th>Started</th><th></th></tr></thead>
        <tbody>
          ${scans.map((s) => html`<tr>
            <td><a href="${hrefFor(s)}" class="table__main">${hostOf(s.url)}</a><span class="table__sub">${s.url}</span></td>
            ${showOwner ? html`<td><a class="link small" href="/app/admin/users/${s.userId}">${s.userEmail}</a></td>` : ''}
            <td>${statusPill(s.status)}</td>
            <td>${scoreRing(s.score)}</td>
            <td>${severityDots(s.summary?.bySeverity)}</td>
            <td class="muted nowrap">${timeAgo(s.createdAt)}</td>
            <td class="table__action">${s.reportUrl ? html`<a href="${s.reportUrl}" class="link" target="_blank" rel="noopener">Report</a>` : ''}</td>
          </tr>`)}
        </tbody>
      </table>
    </div>`;
}
