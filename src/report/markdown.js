import fs from 'node:fs';
import path from 'node:path';
import { CATEGORIES } from '../rules.js';

const ICON = { critical: '**Critical**', high: '**High**', medium: 'Medium', low: 'Low' };
const pathOf = (u) => { try { const x = new URL(u); return (x.pathname + x.search) || '/'; } catch { return u; } };

/** A plain fix-list that can be pasted into Jira/GitHub/Trello or given to a developer. */
export function writeMarkdownReport(run, outDir) {
  const s = run.summary;
  const L = [];
  L.push(`# QA Report - ${run.url}`);
  L.push('');
  L.push(`**Score:** ${s.score}/100 (${s.grade})  `);
  L.push(`**Tested:** ${s.pagesTested} pages x ${run.viewports.map((v) => v.name).join(', ')} - ${new Date(run.startedAt).toLocaleString()}  `);
  L.push(`**Issues:** ${s.totalIssues} (critical ${s.bySeverity.critical}, high ${s.bySeverity.high}, medium ${s.bySeverity.medium}, low ${s.bySeverity.low})`);
  if (s.flowsTotal) L.push(`  \n**User flows:** ${s.flowsPassed}/${s.flowsTotal} passed`);
  L.push('');
  L.push('Open `report.html` for annotated screenshots. Numbers like **#3** refer to the numbered boxes on each screenshot.');
  L.push('');
  L.push('## Fix list (most important first)');
  L.push('');
  s.topFixes.forEach((g, idx) => {
    L.push(`### ${idx + 1}. ${g.title}`);
    L.push(`${ICON[g.severity]} | ${CATEGORIES[g.category] || g.category} | ${g.count} occurrence(s) on ${g.pages} page(s) | devices: ${g.viewports.join(', ')}`);
    L.push('');
    L.push(`**Problem:** ${g.description}`);
    L.push('');
    L.push('**Where:**');
    for (const e of g.examples) {
      const where = e.flow ? `flow "${e.flow}"` : `\`${pathOf(e.url)}\` (${e.viewport}) #${e.n}`;
      L.push(`- ${where}${e.selector ? ` -> \`${e.selector}\`` : ''}${e.element ? ` ${e.element.replace(/\n/g, ' ').slice(0, 100)}` : ''}`);
    }
    if (g.pages > g.examples.length) L.push(`- ...and ${g.pages - new Set(g.examples.map((e) => e.url)).size} more page(s)`);
    L.push('');
    L.push(`**How to fix:** ${g.fix.replace(/\n/g, '  \n')}`);
    L.push('');
  });

  if (run.flows.length) {
    L.push('## User flows');
    for (const f of run.flows) {
      L.push(`- ${f.ok ? '[PASS]' : '[FAIL]'} **${f.name}** (${f.viewport})`);
      for (const st of f.steps) L.push(`  - ${st.ok ? '[x]' : '[ ]'} ${st.n}. ${st.label}${st.error ? ` - ${st.error}` : ''}`);
    }
    L.push('');
  }

  L.push('## Pages');
  L.push('| Page | Device | Status | Load | LCP | CLS | Issues |');
  L.push('|---|---|---|---|---|---|---|');
  for (const p of run.pages) {
    L.push(`| ${pathOf(p.url)} | ${p.viewport} | ${p.status ?? '-'} | ${p.perf?.loadMs ? (p.perf.loadMs / 1000).toFixed(1) + 's' : '-'} | ${p.perf?.lcpMs ? (p.perf.lcpMs / 1000).toFixed(1) + 's' : '-'} | ${p.perf?.cls ?? '-'} | ${p.issues.length} |`);
  }
  const file = path.join(outDir, 'REPORT.md');
  fs.writeFileSync(file, L.join('\n'));
  return file;
}
