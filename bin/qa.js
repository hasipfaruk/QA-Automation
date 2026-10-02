#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { loadConfig } from '../src/config.js';
import { runQA } from '../src/runner.js';

const HELP = `
QA Automation - tests a website/web app and tells you what to fix.

Usage:
  node bin/qa.js <url> [options]
  node bin/qa.js --config qa.config.json

Options:
  -c, --config <file>       JSON config file (default: ./qa.config.json if present)
  -p, --max-pages <n>       Max pages to crawl (default 15)
  -d, --max-depth <n>       Max link depth from start URL (default 3)
  -v, --viewports <list>    Comma list: desktop,laptop,tablet,mobile (default desktop,tablet,mobile)
      --only <url>          Test only the given URL(s), no crawling (repeatable)
      --ai                  Ask Claude to visually review screenshots for UI/UX problems
                            (needs ANTHROPIC_API_KEY)
      --visual              Compare screenshots with saved baselines (visual regression)
      --update-baseline     Save current screenshots as the new baselines
      --no-external         Do not check external links
      --headed              Show the browser while testing
      --concurrency <n>     Parallel browser tabs (default 3)
  -o, --out <dir>           Output folder (default ./reports)
      --open                Open the HTML report when finished
  -h, --help                Show this help
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: 'string', short: 'c' },
    'max-pages': { type: 'string', short: 'p' },
    'max-depth': { type: 'string', short: 'd' },
    viewports: { type: 'string', short: 'v' },
    only: { type: 'string', multiple: true },
    ai: { type: 'boolean' },
    visual: { type: 'boolean' },
    'update-baseline': { type: 'boolean' },
    'no-external': { type: 'boolean' },
    headed: { type: 'boolean' },
    concurrency: { type: 'string' },
    out: { type: 'string', short: 'o' },
    open: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  console.log(HELP);
  process.exit(0);
}

const o = {};
if (positionals[0]) o.url = positionals[0];
if (values.only?.length) { o.url ??= values.only[0]; o.only = values.only; }
if (values['max-pages']) o.maxPages = Number(values['max-pages']);
if (values['max-depth']) o.maxDepth = Number(values['max-depth']);
if (values.viewports) o.viewports = values.viewports.split(',').map((s) => s.trim()).filter(Boolean);
if (values.ai) o.ai = { enabled: true };
if (values.visual || values['update-baseline']) o.visual = { enabled: true, updateBaseline: !!values['update-baseline'] };
if (values['no-external']) o.checkExternalLinks = false;
if (values.headed) o.headless = false;
if (values.concurrency) o.concurrency = Number(values.concurrency);
if (values.out) o.outDir = values.out;
if (values.open) o.open = true;

try {
  const cfg = loadConfig({ config: values.config, overrides: o });
  const { exitCode } = await runQA(cfg);
  process.exit(exitCode);
} catch (err) {
  console.error('\nError: ' + (err?.message || err));
  if (!positionals[0] && !values.config) console.log(HELP);
  process.exit(2);
}
