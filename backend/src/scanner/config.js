import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_AI_MODEL } from './checks/ai-review.js';

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  laptop: { width: 1280, height: 720, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  tablet: { width: 768, height: 1024, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
};

export const DEFAULTS = {
  url: null,
  maxPages: 15,
  maxDepth: 3,
  viewports: ['desktop', 'tablet', 'mobile'],
  include: [],            // only crawl URLs containing one of these substrings (empty = all)
  exclude: ['logout', 'signout', 'sign-out', 'delete'],
  pages: [],              // extra paths/URLs to always test, even if not linked
  concurrency: 3,
  timeout: 30000,
  checkExternalLinks: true,
  thresholds: {
    loadTimeMs: 3000,
    lcpMs: 2500,
    cls: 0.1,
    pageWeightKb: 3000,
    minTapTargetPx: 24,
    minFontPx: 12,
  },
  visual: { enabled: false, updateBaseline: false, threshold: 0.5, baselineDir: 'qa-baselines' },
  ai: { enabled: false, model: process.env.AI_MODEL || DEFAULT_AI_MODEL, effort: 'medium', maxScreens: 20 },
  auth: null,             // { loginUrl, steps: [...] } or { storageState: 'state.json' }
  flows: [],              // [{ name, steps: [...] }]
  outDir: 'reports',
  failOn: 'critical',     // exit code 1 when issues of this severity exist: critical | high | none
  headless: true,
  open: false,
};

function deepMerge(base, extra) {
  if (!extra) return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(extra)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

export function loadConfig(cliOpts) {
  let fileCfg = {};
  const cfgPath = cliOpts.config || (fs.existsSync('qa.config.json') ? 'qa.config.json' : null);
  if (cfgPath) {
    fileCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    fileCfg._configDir = path.dirname(path.resolve(cfgPath));
  }
  return buildConfig(deepMerge(fileCfg, cliOpts.overrides));
}

/** Build a full config from plain options without touching the filesystem (used by the server). */
export function buildConfig(options) {
  const cfg = deepMerge(DEFAULTS, options);
  if (!cfg.url) throw new Error('No URL given. Use: qa <url>  or set "url" in qa.config.json');
  if (!/^https?:\/\//i.test(cfg.url)) cfg.url = 'https://' + cfg.url;
  for (const v of cfg.viewports) {
    if (!VIEWPORTS[v] && !(cfg.customViewports || {})[v]) throw new Error(`Unknown viewport "${v}". Known: ${Object.keys(VIEWPORTS).join(', ')}`);
  }
  cfg.viewportDefs = { ...VIEWPORTS, ...(cfg.customViewports || {}) };
  return cfg;
}
