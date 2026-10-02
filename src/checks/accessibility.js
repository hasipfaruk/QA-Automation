import { AxeBuilder } from '@axe-core/playwright';
import { rectsFor } from './inpage.js';

const IMPACT_TO_SEVERITY = { critical: 'critical', serious: 'high', moderate: 'medium', minor: 'low' };
const MAX_NODES_PER_RULE = 6;

/** Run axe-core WCAG 2.x A/AA checks and return issues with element locations. */
export async function checkAccessibility(page) {
  let results;
  try {
    results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      // "region" flags every block outside a landmark - very noisy; the landmark-* rules still cover structure
      .disableRules(['region'])
      .analyze();
  } catch (err) {
    return [{
      rule: 'axe-failed', category: 'accessibility', severity: 'low',
      title: 'Accessibility scan could not run', description: String(err.message || err).slice(0, 300),
      fix: 'Usually caused by a strict Content-Security-Policy or the page navigating during the scan.', detail: {},
    }];
  }

  const issues = [];
  for (const v of results.violations) {
    const nodes = v.nodes.slice(0, MAX_NODES_PER_RULE);
    const selectors = nodes.map((n) => (typeof n.target[0] === 'string' ? n.target[0] : null));
    const rects = await page.evaluate(rectsFor, selectors.map((s) => s || ':not(*)')).catch(() => selectors.map(() => null));
    nodes.forEach((node, i) => {
      issues.push({
        rule: `a11y:${v.id}`,
        category: 'accessibility',
        severity: IMPACT_TO_SEVERITY[node.impact || v.impact] || 'medium',
        title: v.help,
        description: `${v.description}${v.nodes.length > MAX_NODES_PER_RULE && i === 0 ? ` (${v.nodes.length} elements affected; showing first ${MAX_NODES_PER_RULE})` : ''}`,
        fix: cleanSummary(node.failureSummary) + `\nReference: ${v.helpUrl}`,
        selector: selectors[i],
        element: node.html?.slice(0, 160),
        rect: rects[i],
        detail: { wcag: v.tags.filter((t) => /^wcag\d/.test(t)).join(', '), helpUrl: v.helpUrl, affected: v.nodes.length },
      });
    });
  }
  return issues;
}

function cleanSummary(s = '') {
  return s
    .replace(/^Fix (any|all) of the following:\s*/gm, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => '- ' + l.charAt(0).toUpperCase() + l.slice(1))
    .join('\n');
}
