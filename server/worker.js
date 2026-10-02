import fs from 'node:fs';
import path from 'node:path';
import { buildConfig } from '../src/config.js';
import { runQA } from '../src/runner.js';
import { startEgressProxy, createUrlGuard } from '../src/net/egress-proxy.js';
import { PLANS } from './plans.js';

const POLL_MS = 1500;
const CLEANUP_MS = 60 * 60 * 1000;

const now = () => new Date().toISOString();

/** Keep the summary small: it is stored in the database and returned by the API. */
function compactSummary(run) {
  const s = run.summary;
  return {
    score: s.score,
    grade: s.grade,
    totalIssues: s.totalIssues,
    bySeverity: s.bySeverity,
    byCategory: s.byCategory,
    pagesTested: s.pagesTested,
    screensTested: s.screensTested,
    flowsPassed: s.flowsPassed,
    flowsTotal: s.flowsTotal,
    durationSec: run.durationSec,
    topFixes: s.topFixes.slice(0, 10).map((f) => ({
      title: f.title,
      severity: f.severity,
      category: f.category,
      count: f.count,
      pages: f.pages,
      fix: String(f.fix).slice(0, 600),
    })),
  };
}

export async function startWorker({ db, config, log = console.log }) {
  const proxy = config.allowPrivateUrls ? null : await startEgressProxy();
  const guard = config.allowPrivateUrls ? null : createUrlGuard();
  if (!proxy) log('[worker] ALLOW_PRIVATE_URLS is on: scans can reach private and local addresses. Do not use this in production.');

  const q = {
    // Scans that were running when the process stopped go back to the queue.
    requeue: db.prepare("UPDATE scans SET status = 'queued', started_at = NULL, progress_done = 0 WHERE status = 'running'"),
    claim: db.prepare(`
      UPDATE scans SET status = 'running', started_at = ?
      WHERE id = (SELECT id FROM scans WHERE status = 'queued' ORDER BY created_at LIMIT 1)
      RETURNING *`),
    progress: db.prepare('UPDATE scans SET progress_done = ?, progress_total = ? WHERE id = ?'),
    done: db.prepare("UPDATE scans SET status = 'done', score = ?, grade = ?, summary = ?, finished_at = ?, progress_done = progress_total WHERE id = ?"),
    failed: db.prepare("UPDATE scans SET status = 'failed', error = ?, finished_at = ? WHERE id = ?"),
    expired: db.prepare(`
      SELECT s.id, u.plan, s.finished_at FROM scans s JOIN users u ON u.id = s.user_id
      WHERE s.status IN ('done', 'failed') AND s.finished_at IS NOT NULL`),
  };
  q.requeue.run();

  let active = 0;
  let stopped = false;

  async function runScan(scan) {
    const options = JSON.parse(scan.options);
    const reportDir = path.join(config.reportsDir, scan.id);
    fs.rmSync(reportDir, { recursive: true, force: true });
    const cfg = buildConfig({
      url: options.url,
      maxPages: options.maxPages,
      viewports: options.viewports,
      checkExternalLinks: options.checkExternalLinks,
      flows: options.flows,
      auth: options.auth,
      ai: { enabled: options.ai },
      visual: {
        enabled: options.visual !== 'off',
        updateBaseline: options.visual === 'update',
        baselineDir: path.join(config.baselinesDir, String(scan.user_id)),
      },
      concurrency: 2,
      failOn: 'none',
      reportDir,
      quiet: true,
      restricted: true,
      egressProxy: proxy?.url,
      networkGuard: guard,
      hooks: {
        // total is an upper bound: the crawler may find fewer pages than the limit
        onProgress: ({ screensDone, pageLimit }) => {
          q.progress.run(screensDone, Math.max(screensDone, pageLimit * options.viewports.length), scan.id);
        },
      },
    });

    const started = Date.now();
    try {
      const { run } = await runQA(cfg);
      const summary = compactSummary(run);
      q.done.run(summary.score, summary.grade, JSON.stringify(summary), now(), scan.id);
      log(`[worker] scan ${scan.id} done in ${Math.round((Date.now() - started) / 1000)}s, score ${summary.score}`);
    } catch (err) {
      q.failed.run(String(err.message || err).split('\n')[0].slice(0, 500), now(), scan.id);
      log(`[worker] scan ${scan.id} failed: ${err.message}`);
    }
  }

  function tick() {
    if (stopped) return;
    while (active < config.workerConcurrency) {
      const scan = q.claim.get(now());
      if (!scan) break;
      active++;
      runScan(scan).finally(() => { active--; });
    }
  }

  /** Delete report files once they are older than the owner's plan allows. */
  function cleanup() {
    const cutoffFor = (plan) => Date.now() - (PLANS[plan] || PLANS.free).retentionDays * 864e5;
    let removed = 0;
    for (const row of q.expired.all()) {
      if (Date.parse(row.finished_at) > cutoffFor(row.plan)) continue;
      const dir = path.join(config.reportsDir, row.id);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        removed++;
      }
    }
    if (removed) log(`[worker] removed ${removed} expired report(s)`);
  }

  const pollTimer = setInterval(tick, POLL_MS);
  const cleanupTimer = setInterval(cleanup, CLEANUP_MS);
  tick();
  cleanup();

  return {
    async stop() {
      stopped = true;
      clearInterval(pollTimer);
      clearInterval(cleanupTimer);
      // Give running scans a moment to finish; anything still running is re-queued on the next start.
      const deadline = Date.now() + 20000;
      while (active > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
      await proxy?.close();
    },
    isIdle: () => active === 0,
  };
}
