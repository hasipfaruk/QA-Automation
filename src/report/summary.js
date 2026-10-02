import { SEVERITY_ORDER, SEVERITY_WEIGHT } from '../rules.js';

const IGNORE_FOR_SCORE = new Set(['new-baseline']);

function pagePenalty(issues) {
  const byRule = new Map();
  for (const i of issues) {
    if (IGNORE_FOR_SCORE.has(i.rule)) continue;
    const k = i.rule + '|' + i.title;
    const e = byRule.get(k) || { w: 0, count: 0 };
    e.w = Math.max(e.w, SEVERITY_WEIGHT[i.severity] || 0);
    e.count++;
    byRule.set(k, e);
  }
  let p = 0;
  for (const { w, count } of byRule.values()) p += Math.min(w * 2, w + 0.25 * w * (count - 1));
  return p;
}

export function grade(score) {
  return score >= 90 ? 'A - Excellent' : score >= 75 ? 'B - Good' : score >= 60 ? 'C - Needs work' : score >= 40 ? 'D - Poor' : 'F - Critical problems';
}

export function summarize(run) {
  const all = [
    ...run.pages.flatMap((p) => p.issues.map((i) => ({ ...i, url: p.url, viewport: p.viewport }))),
    ...run.flows.flatMap((f) => f.issues.map((i) => ({ ...i, url: f.url, viewport: f.viewport, flow: f.name }))),
  ].filter((i) => !IGNORE_FOR_SCORE.has(i.rule));

  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  const byCategory = {};
  for (const i of all) {
    bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1;
    byCategory[i.category] = (byCategory[i.category] || 0) + 1;
  }

  const pageScores = run.pages.map((p) => Math.max(0, 100 - pagePenalty(p.issues)));
  let score = pageScores.length ? pageScores.reduce((a, b) => a + b, 0) / pageScores.length : 0;
  score -= run.flows.filter((f) => !f.ok).length * 10;
  score = Math.max(0, Math.round(score));

  // group identical problems across pages so the fix list is short and actionable
  const groups = new Map();
  for (const i of all) {
    const key = i.category === 'ai' ? `${i.rule}|${i.title}|${i.url}` : `${i.rule}|${i.title}`;
    let g = groups.get(key);
    if (!g) {
      g = { rule: i.rule, title: i.title, category: i.category, severity: i.severity, fix: i.fix, description: i.description, count: 0, urls: new Set(), viewports: new Set(), examples: [] };
      groups.set(key, g);
    }
    if (SEVERITY_ORDER[i.severity] < SEVERITY_ORDER[g.severity]) g.severity = i.severity;
    g.count++;
    g.urls.add(i.url);
    g.viewports.add(i.viewport);
    if (g.examples.length < 5) g.examples.push({ url: i.url, viewport: i.viewport, n: i.n, selector: i.selector, element: i.element, flow: i.flow });
  }
  const topFixes = [...groups.values()]
    .map((g) => ({ ...g, pages: g.urls.size, urls: [...g.urls], viewports: [...g.viewports] }))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.pages - a.pages || b.count - a.count);

  return {
    score,
    grade: grade(score),
    pagesTested: new Set(run.pages.map((p) => p.url)).size,
    screensTested: run.pages.length,
    totalIssues: all.length,
    bySeverity,
    byCategory,
    topFixes,
    flowsPassed: run.flows.filter((f) => f.ok).length,
    flowsTotal: run.flows.length,
  };
}
