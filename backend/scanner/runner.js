import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { chromium } from 'playwright';
import { collectPerf, autoScroll, auditPage, drawOverlay, removeOverlay } from './checks/inpage.js';
import { checkAccessibility } from './checks/accessibility.js';
import { compareWithBaseline } from './checks/visual.js';
import { aiReview, isFatalAiError } from './checks/ai-review.js';
import { authenticate, runFlows } from './flows.js';
import { makeIssue, SEVERITY_ORDER } from './rules.js';
import { writeHtmlReport } from './report/html.js';
import { writeMarkdownReport } from './report/markdown.js';
import { summarize } from './report/summary.js';

const SKIP_EXT = /\.(pdf|zip|rar|7z|gz|tar|exe|dmg|msi|apk|jpg|jpeg|png|gif|webp|avif|svg|ico|mp4|mp3|wav|mov|avi|webm|docx?|xlsx?|pptx?|csv|xml|json|txt)$/i;
const MAX_SHOT_HEIGHT = 16000;
const MAX_CROPS = 30;
const FREEZE_CSS = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}';

let log = (...a) => console.log(...a);
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = paint('1');
const green = paint('32');
const sevColor = { critical: paint('31'), high: paint('91'), medium: paint('33'), low: paint('36') };

export function slugify(url) {
  const u = new URL(url);
  const base = (u.pathname + u.search).replace(/^\/|\/$/g, '').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 50) || 'home';
  return `${base}-${crypto.createHash('md5').update(url).digest('hex').slice(0, 5)}`;
}

function normalizeUrl(raw) {
  const u = new URL(raw);
  u.hash = '';
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(k)) u.searchParams.delete(k);
  u.pathname = u.pathname.replace(/\/index\.(html?|php)$/i, '/');
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
  return u.toString();
}

const sameSite = (a, b) => a.replace(/^www\./, '') === b.replace(/^www\./, '');

export async function runQA(cfg) {
  const started = new Date();
  const host = new URL(cfg.url).hostname.replace(/[^a-z0-9.-]/gi, '_');
  const stamp = started.toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const outDir = cfg.reportDir ? path.resolve(cfg.reportDir) : path.resolve(cfg.outDir, `${host}_${stamp}`);
  const shotDir = path.join(outDir, 'screenshots');
  fs.mkdirSync(shotDir, { recursive: true });

  log = cfg.quiet ? () => {} : (...a) => console.log(...a);
  log(`\n${bold('QA Automation')}  ${cfg.url}`);
  log(`   devices: ${cfg.viewports.join(', ')} | max pages: ${cfg.only ? cfg.only.length : cfg.maxPages} | AI review: ${cfg.ai.enabled ? 'on' : 'off'} | visual regression: ${cfg.visual.enabled ? 'on' : 'off'}`);
  log(`   output: ${outDir}\n`);

  // With an egress proxy every browser request (including redirects) is filtered by the proxy.
  // "<-loopback>" stops Chromium from silently bypassing the proxy for localhost.
  const browser = await chromium.launch({
    headless: cfg.headless,
    channel: 'chromium',
    ...(cfg.egressProxy ? { proxy: { server: cfg.egressProxy, bypass: '<-loopback>' } } : {}),
  });
  const state = {
    cfg, browser, outDir, shotDir,
    linkCache: new Map(),
    progress: { done: 0 },
    aiScreensLeft: cfg.ai.maxScreens,
    aiDisabledReason: null,
    aiUsage: { input: 0, output: 0 },
  };

  try {
    const storageState = await authenticate(browser, cfg, { shotDir, log });
    state.contextOptions = { ignoreHTTPSErrors: true, ...(storageState ? { storageState } : {}) };

    const pages = await crawlAndTest(state);

    let flows = [];
    if (cfg.flows?.length) {
      log('\nRunning user flows');
      flows = await runFlows(browser, cfg, { shotDir, contextOptions: state.contextOptions, log });
    }

    const finished = new Date();
    const run = {
      tool: 'QA Automation',
      url: cfg.url,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      durationSec: Math.round((finished - started) / 1000),
      viewports: cfg.viewports.map((v) => ({ name: v, ...cfg.viewportDefs[v] })),
      ai: { enabled: cfg.ai.enabled, model: cfg.ai.model, disabledReason: state.aiDisabledReason, usage: state.aiUsage },
      visual: cfg.visual,
      pages,
      flows,
    };
    run.summary = summarize(run);

    // make screenshot paths relative to the report folder
    const rel = (p) => (p ? path.relative(outDir, p).split(path.sep).join('/') : p);
    for (const p of run.pages) {
      for (const k of Object.keys(p.screenshots)) p.screenshots[k] = rel(p.screenshots[k]);
      for (const i of p.issues) { i.crop = rel(i.crop); i.screenshot = rel(i.screenshot); }
    }
    for (const f of run.flows) {
      for (const s of f.steps) s.screenshot = rel(s.screenshot);
      for (const i of f.issues) i.screenshot = rel(i.screenshot);
    }

    fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(run, null, 2));
    const htmlPath = writeHtmlReport(run, outDir);
    const mdPath = writeMarkdownReport(run, outDir);

    if (!cfg.quiet) printSummary(run, htmlPath, mdPath);
    if (cfg.open) openFile(htmlPath);

    const failOn = cfg.failOn ?? 'critical';
    const failing = failOn === 'none' ? 0
      : run.summary.bySeverity.critical + (failOn === 'high' ? run.summary.bySeverity.high : 0);
    return { exitCode: failing > 0 ? 1 : 0, run, htmlPath, mdPath, outDir };
  } finally {
    await browser.close();
  }
}

/** Crawl the site breadth-first and test each page on every viewport. */
async function crawlAndTest(state) {
  const { cfg } = state;
  const origin = new URL(cfg.url);
  const results = [];
  const seen = new Set();
  const queue = [];
  const crawl = !cfg.only;

  const allowed = (u) => {
    if (!sameSite(u.hostname, origin.hostname) || SKIP_EXT.test(u.pathname)) return false;
    const s = u.toString().toLowerCase();
    if (cfg.include?.length && !cfg.include.some((p) => s.includes(p.toLowerCase()))) return false;
    if (cfg.exclude?.some((p) => s.includes(p.toLowerCase()))) return false;
    return true;
  };
  const enqueue = (raw, depth, force = false) => {
    let u;
    try { u = new URL(normalizeUrl(new URL(raw, cfg.url).toString())); } catch { return; }
    const key = u.toString();
    if (seen.has(key) || (!force && !allowed(u))) return;
    seen.add(key);
    queue.push({ url: key, depth });
  };

  for (const u of cfg.only || [cfg.url]) enqueue(u, 0, true);
  for (const u of cfg.pages || []) enqueue(u, 1, true);

  const limit = cfg.only ? cfg.only.length : Math.max(cfg.maxPages, queue.length);
  let started = 0;
  let active = 0;

  await new Promise((resolve) => {
    const pump = () => {
      while (active < cfg.concurrency && queue.length && started < limit) {
        const task = queue.shift();
        started++;
        active++;
        const idx = started;
        testUrlAllViewports(state, task.url, idx, limit)
          .then((pageResults) => {
            results.push(...pageResults);
            const first = pageResults[0];
            if (crawl && first?.links && task.depth < cfg.maxDepth) {
              if (first.finalUrl) seen.add(normalizeUrl(first.finalUrl));
              for (const l of first.links) enqueue(l.href, task.depth + 1);
            }
          })
          .catch((err) => log(`  Error: ${task.url}: ${err.message}`))
          .finally(() => {
            active--;
            if (active === 0 && (!queue.length || started >= limit)) resolve();
            else pump();
          });
      }
      if (active === 0) resolve();
    };
    pump();
  });

  // keep crawl order stable in the report
  const order = [...seen];
  results.sort((a, b) => order.indexOf(a.url) - order.indexOf(b.url) || state.cfg.viewports.indexOf(a.viewport) - state.cfg.viewports.indexOf(b.viewport));
  return results;
}

async function testUrlAllViewports(state, url, idx, total) {
  const out = [];
  for (let i = 0; i < state.cfg.viewports.length; i++) {
    const vp = state.cfg.viewports[i];
    const r = await testPage(state, url, vp, i === 0);
    const counts = r.issues.reduce((m, x) => ((m[x.severity] = (m[x.severity] || 0) + 1), m), {});
    const badge = ['critical', 'high', 'medium', 'low'].filter((s) => counts[s]).map((s) => sevColor[s](`${counts[s]} ${s}`)).join(', ') || green('clean');
    log(`  [page ${idx}] ${vp.padEnd(7)} ${shortUrl(url)}  ${badge}`);
    out.push(r);
    state.progress.done++;
    state.cfg.hooks?.onProgress?.({ screensDone: state.progress.done, pagesStarted: idx, pageLimit: total, url, viewport: vp });
  }
  return out;
}

const shortUrl = (u) => { const x = new URL(u); return (x.pathname + x.search).slice(0, 70) || '/'; };

/** Load one URL at one viewport, run every check, capture screenshots. */
async function testPage(state, url, vpName, primary) {
  const { cfg, browser, shotDir } = state;
  const vp = cfg.viewportDefs[vpName];
  const ctx = { isMobile: vp.isMobile, viewport: vpName };
  const key = `${slugify(url)}--${vpName}`;
  const result = { url, finalUrl: null, viewport: vpName, title: null, status: null, perf: null, seo: null, issues: [], screenshots: {}, links: [], aiSummary: null };

  const context = await browser.newContext({
    ...state.contextOptions,
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: vp.deviceScaleFactor ?? 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(cfg.timeout);

  const consoleErrors = new Map();
  const warnings = [];
  const pageErrors = new Map();
  const httpErrors = new Map();
  const failed = new Map();
  const mixed = new Set();
  const isHttps = url.startsWith('https:');

  page.on('console', (m) => {
    const loc = m.location();
    const where = loc?.url ? `${loc.url}${loc.lineNumber ? ':' + loc.lineNumber : ''}` : '';
    if (m.type() === 'error') {
      const text = m.text().slice(0, 500);
      if (/^Failed to load resource/.test(text)) return; // reported via network listener with more detail
      if (!consoleErrors.has(text)) consoleErrors.set(text, where);
    } else if (m.type() === 'warning') warnings.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => {
    const msg = (e.message || String(e)).slice(0, 500);
    const where = (e.stack || '').split('\n').find((l) => /https?:\/\//.test(l))?.trim().replace(/^at\s+/, '') || '';
    if (!pageErrors.has(msg)) pageErrors.set(msg, where);
  });
  page.on('request', (req) => { if (isHttps && req.url().startsWith('http:')) mixed.add(req.url()); });
  page.on('response', (res) => {
    const st = res.status();
    if (st < 400) return;
    const req = res.request();
    if (req.isNavigationRequest() && req.frame() === page.mainFrame()) return; // handled below
    if (!httpErrors.has(res.url())) httpErrors.set(res.url(), { url: res.url(), status: st, statusText: res.statusText(), method: req.method(), type: req.resourceType() });
  });
  page.on('requestfailed', (req) => {
    const err = req.failure()?.errorText || 'failed';
    if (/ERR_ABORTED|NS_BINDING_ABORTED/.test(err)) return; // navigation/cancel noise
    if (!failed.has(req.url())) failed.set(req.url(), { url: req.url(), method: req.method(), error: err });
  });

  try {
    let response;
    try {
      response = await page.goto(url, { waitUntil: 'load', timeout: cfg.timeout });
    } catch (err) {
      result.issues.push(makeIssue('page-load-failed', ctx, { message: String(err.message).split('\n')[0] }));
      const shot = path.join(shotDir, `${key}-error.jpg`);
      await page.screenshot({ path: shot, type: 'jpeg', quality: 70 }).catch(() => {});
      if (fs.existsSync(shot)) result.screenshots.annotated = shot;
      return finalize(result);
    }
    result.status = response?.status() ?? null;
    result.finalUrl = page.url();
    if (result.status >= 400) {
      result.issues.push(makeIssue('http-error', ctx, { url, status: result.status, statusText: response.statusText(), method: 'GET', isDocument: true }, { title: `Page returns HTTP ${result.status}` }));
    }

    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    result.perf = await page.evaluate(collectPerf).catch(() => null);
    await page.evaluate(autoScroll).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.addStyleTag({ content: FREEZE_CSS }).catch(() => {});
    await page.waitForTimeout(200);
    result.title = await page.title().catch(() => null);

    // ---- in-page audit (layout, images, seo, links)
    const audit = await page.evaluate(auditPage, {
      isMobile: vp.isMobile,
      minTapTargetPx: cfg.thresholds.minTapTargetPx,
      minFontPx: cfg.thresholds.minFontPx,
    });
    // error pages (404/500...) only get the HTTP error + screenshot, not layout/SEO/a11y noise
    const isErrorPage = result.status >= 400;
    for (const f of isErrorPage ? [] : audit.findings) {
      result.issues.push(makeIssue(f.rule, ctx, f.detail, { selector: f.selector, element: f.element, rect: f.rect }));
    }
    result.links = audit.links;
    result.seo = audit.seo;
    result.pageSize = audit.page;

    // ---- accessibility
    if (!isErrorPage) result.issues.push(...await checkAccessibility(page));

    // ---- SEO (once per URL, on the primary viewport)
    if (primary && !isErrorPage) result.issues.push(...seoIssues(audit.seo, ctx));

    // ---- performance
    if (result.perf) result.issues.push(...perfIssues(result.perf, cfg.thresholds, ctx));

    // ---- console / runtime errors
    for (const [message, location] of pageErrors) result.issues.push(makeIssue('page-crash', ctx, { message, location }));
    for (const [message, location] of [...consoleErrors].slice(0, 10)) result.issues.push(makeIssue('console-error', ctx, { message, location }));
    if (warnings.length) result.issues.push(makeIssue('console-warning', ctx, { count: warnings.length, sample: warnings[0] }));

    // ---- network
    for (const e of [...httpErrors.values()].slice(0, 15)) result.issues.push(makeIssue('http-error', ctx, e));
    for (const e of [...failed.values()].slice(0, 10)) result.issues.push(makeIssue('request-failed', ctx, e));
    for (const u of [...mixed].slice(0, 10)) result.issues.push(makeIssue('mixed-content', ctx, { url: u }));

    // ---- broken links (once per URL)
    if (primary) result.issues.push(...await checkLinks(state, page, audit.links));

    // ---- screenshots
    const pageH = Math.min(audit.page.height, MAX_SHOT_HEIGHT);
    const shotOpts = pageH < audit.page.height
      ? { fullPage: true, clip: { x: 0, y: 0, width: audit.page.viewportWidth, height: MAX_SHOT_HEIGHT } }
      : { fullPage: true };
    if (pageH < audit.page.height) result.truncatedScreenshot = true;

    const cleanPath = path.join(shotDir, `${key}-clean.jpg`);
    await page.screenshot({ ...shotOpts, path: cleanPath, type: 'jpeg', quality: 75 });
    result.screenshots.clean = cleanPath;

    if (cfg.visual.enabled) {
      const png = await page.screenshot({ ...shotOpts, type: 'png' });
      const cmp = compareWithBaseline({
        pngBuffer: png,
        baselineDir: path.resolve(cfg._configDir || '.', cfg.visual.baselineDir),
        key, outDir: shotDir,
        threshold: cfg.visual.threshold,
        updateBaseline: cfg.visual.updateBaseline,
        ctx,
      });
      if (cmp?.issue) result.issues.push(cmp.issue);
      if (cmp?.diffFile) { result.screenshots.diff = cmp.diffFile; cmp.issue.screenshot = cmp.diffFile; }
    }

    // ---- AI visual review (uses clean screenshots, before overlays are drawn)
    if (cfg.ai.enabled && !state.aiDisabledReason && state.aiScreensLeft > 0) {
      state.aiScreensLeft--;
      await runAiReview(state, page, result, vp, vpName, pageH);
    }

    // ---- annotate: number issues, draw boxes, capture annotated screenshot + crops
    result.issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    result.issues.forEach((iss, i) => { iss.n = i + 1; });
    // boxes covering most of the page (e.g. <html>/<body>) don't help locate anything
    const pageArea = audit.page.width * pageH;
    for (const i of result.issues) if (i.rect && i.rect.w * i.rect.h > pageArea * 0.6) i.rect = null;
    const marks = result.issues.filter((i) => i.rect && i.rect.y < pageH && i.rect.w + i.rect.h > 0)
      .map((i) => ({ n: i.n, severity: i.severity, rect: i.rect }));

    if (marks.length) {
      await page.evaluate(drawOverlay, marks);
      const annotated = path.join(shotDir, `${key}-annotated.jpg`);
      await page.screenshot({ ...shotOpts, path: annotated, type: 'jpeg', quality: 75 });
      result.screenshots.annotated = annotated;

      let crops = 0;
      for (const iss of result.issues) {
        if (!iss.rect || crops >= MAX_CROPS || iss.rect.y >= pageH) continue;
        const pad = 40;
        const x = Math.max(0, iss.rect.x - pad);
        const y = Math.max(0, iss.rect.y - pad);
        const w = Math.min(audit.page.width - x, Math.max(iss.rect.w, 10) + pad * 2, 1400);
        const h = Math.min(pageH - y, Math.max(iss.rect.h, 10) + pad * 2, 900);
        if (w < 5 || h < 5) continue;
        const crop = path.join(shotDir, `${key}-issue${iss.n}.jpg`);
        await page.screenshot({ fullPage: true, clip: { x, y, width: w, height: h }, path: crop, type: 'jpeg', quality: 75 }).then(() => {
          iss.crop = crop;
          crops++;
        }).catch(() => {});
      }
      await page.evaluate(removeOverlay).catch(() => {});
    } else {
      result.screenshots.annotated = cleanPath;
    }
  } catch (err) {
    result.issues.push(makeIssue('page-load-failed', ctx, { message: 'Test crashed: ' + String(err.message).split('\n')[0] }));
  } finally {
    await context.close().catch(() => {});
  }
  return finalize(result);
}

function finalize(result) {
  result.issues.forEach((iss, i) => { iss.n ??= i + 1; });
  return result;
}

async function runAiReview(state, page, result, vp, vpName, pageH) {
  const { cfg } = state;
  const sliceH = Math.round(vp.height * 1.5);
  const slices = [];
  for (let y = 0; y < pageH && slices.length < 3; y += sliceH) {
    const h = Math.min(sliceH, pageH - y);
    if (h < 50) break;
    const buffer = await page.screenshot({ fullPage: true, clip: { x: 0, y, width: vp.width, height: h }, type: 'jpeg', quality: 80 });
    slices.push({ buffer, offsetY: y, width: vp.width, height: h });
  }
  try {
    const ai = await aiReview({ slices, url: result.url, viewportName: vpName, viewport: vp, model: cfg.ai.model, effort: cfg.ai.effort });
    result.aiSummary = ai.summary;
    result.issues.push(...ai.issues);
    if (ai.usage) { state.aiUsage.input += ai.usage.input_tokens || 0; state.aiUsage.output += ai.usage.output_tokens || 0; }
  } catch (err) {
    if (isFatalAiError(err)) {
      state.aiDisabledReason = `AI review disabled: ${err.message}`.slice(0, 300);
      log(`  Warning: ${state.aiDisabledReason}\n    Set AI_API_KEY to enable AI design review.`);
    } else {
      result.aiSummary = `AI review failed for this page: ${String(err.message).slice(0, 200)}`;
    }
  }
}

function seoIssues(seo, ctx) {
  const out = [];
  if (!seo) return out;
  if (!seo.title) out.push(makeIssue('missing-title', ctx));
  else if (seo.title.length < 15 || seo.title.length > 65) out.push(makeIssue('bad-title-length', ctx, { length: seo.title.length, title: seo.title }));
  if (!seo.description) out.push(makeIssue('missing-description', ctx));
  if (seo.h1Count !== 1) out.push(makeIssue('h1-count', ctx, { count: seo.h1Count }));
  if (seo.headingSkip) out.push(makeIssue('heading-skip', ctx, { skip: seo.headingSkip }));
  if (!seo.lang) out.push(makeIssue('missing-lang', ctx));
  if (!seo.favicon) out.push(makeIssue('missing-favicon', ctx));
  const missingOg = [!seo.ogTitle && 'og:title', !seo.ogImage && 'og:image'].filter(Boolean);
  if (missingOg.length) out.push(makeIssue('missing-og', ctx, { missing: missingOg }));
  if (seo.robots && /noindex/i.test(seo.robots)) out.push(makeIssue('noindex', ctx, { robots: seo.robots }));
  return out;
}

function perfIssues(p, t, ctx) {
  const out = [];
  if (p.loadMs && p.loadMs > t.loadTimeMs) out.push(makeIssue('slow-load', ctx, { value: p.loadMs, limit: t.loadTimeMs }));
  if (p.lcpMs && p.lcpMs > t.lcpMs) out.push(makeIssue('slow-lcp', ctx, { value: p.lcpMs, limit: t.lcpMs }));
  if (p.cls > t.cls) out.push(makeIssue('layout-shift', ctx, { value: p.cls, limit: t.cls }));
  if (p.pageWeightKb > t.pageWeightKb) out.push(makeIssue('heavy-page', ctx, { value: p.pageWeightKb, limit: t.pageWeightKb, requests: p.requests }));
  return out;
}

/** Check every link on the page (shared cache so each URL is requested once per run). */
async function checkLinks(state, page, links) {
  const { cfg } = state;
  const origin = new URL(cfg.url).hostname;
  const ctx = {};
  const guard = cfg.networkGuard;
  const todo = links.filter((l) => {
    const internal = sameSite(new URL(l.href).hostname, origin);
    return internal || cfg.checkExternalLinks;
  }).slice(0, 150);

  const check = (href) => {
    if (!state.linkCache.has(href)) {
      state.linkCache.set(href, (async () => {
        // with a guard, never follow redirects: the target could be an internal address
        const opts = { timeout: 15000, maxRedirects: guard ? 0 : 10, failOnStatusCode: false };
        try {
          if (guard && !(await guard(href))) return { skipped: true };
          let res = await page.request.head(href, opts);
          if (res.status() >= 400) res = await page.request.get(href, opts);
          return { status: res.status() };
        } catch (err) {
          return { error: String(err.message).split('\n')[0].slice(0, 120) };
        }
      })());
    }
    return state.linkCache.get(href);
  };

  const issues = [];
  for (let i = 0; i < todo.length; i += 8) {
    const batch = todo.slice(i, i + 8);
    const res = await Promise.all(batch.map((l) => check(l.href)));
    batch.forEach((l, j) => {
      const r = res[j];
      const internal = sameSite(new URL(l.href).hostname, origin);
      // 401/403/429/999 usually mean "bot blocked", not "broken"
      if (r.skipped) return;
      const broken = r.error ? true : [404, 410].includes(r.status) || r.status >= 500;
      if (broken) issues.push(makeIssue('broken-link', ctx, { href: l.href, status: r.status, error: r.error, internal }, { selector: l.selector, element: l.element, rect: l.rect }));
    });
  }
  return issues;
}

function printSummary(run, htmlPath, mdPath) {
  const s = run.summary;
  log('\n--------------------------------------------');
  log(`  Quality score: ${s.score}/100  (${s.grade})`);
  log(`  Pages: ${s.pagesTested} x ${run.viewports.length} devices   Issues: ${s.totalIssues}`);
  log(`  ${['critical', 'high', 'medium', 'low'].map((k) => sevColor[k](`${k} ${s.bySeverity[k]}`)).join('   ')}`);
  if (run.flows.length) log(`  Flows: ${run.flows.filter((f) => f.ok).length}/${run.flows.length} passed`);
  if (s.topFixes.length) {
    log('\n  Top things to fix:');
    for (const f of s.topFixes.slice(0, 8)) log(`   ${sevColor[f.severity](f.severity.padEnd(8))} ${f.title} (${f.pages} page(s), ${f.count} occurrence(s))`);
  }
  log(`\n  HTML report:     ${htmlPath}`);
  log(`  Markdown report: ${mdPath}`);
  log('--------------------------------------------\n');
}

function openFile(p) {
  const cmd = process.platform === 'win32' ? `start "" "${p}"` : process.platform === 'darwin' ? `open "${p}"` : `xdg-open "${p}"`;
  exec(cmd);
}
