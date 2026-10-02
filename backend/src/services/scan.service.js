import fs from 'node:fs';
import path from 'node:path';
import { validateSteps } from '../scanner/flows.js';
import { createUrlGuard } from '../scanner/net/egress-proxy.js';
import { PLANS, planFor, trialExpired } from '../config/plans.js';
import { HttpError } from '../lib/errors.js';
import { newId, randomToken } from '../lib/crypto.js';

const ALL_VIEWPORTS = ['desktop', 'laptop', 'tablet', 'mobile'];
const VISUAL_MODES = ['off', 'compare', 'update'];
const MAX_FLOWS = 10;

const monthStartIso = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
};

const asBool = (v, fallback) => {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  return /^(1|true|on|yes)$/i.test(String(v));
};

function parseJsonField(value, label) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    throw new HttpError(422, `${label} is not valid JSON: ${err.message}`);
  }
}

export function normalizeUrl(input) {
  let raw = String(input || '').trim();
  if (!raw) throw new HttpError(422, 'Enter the URL of the site to scan.');
  if (raw.length > 2000) throw new HttpError(422, 'That URL is too long.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = 'https://' + raw;
  let u;
  try { u = new URL(raw); } catch { throw new HttpError(422, 'That does not look like a valid URL.'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new HttpError(422, 'Only http:// and https:// URLs can be scanned.');
  if (u.username || u.password) throw new HttpError(422, 'Remove the username and password from the URL. Use login steps instead.');
  u.hash = '';
  return u.toString();
}

/**
 * Turn untrusted input (form fields or API JSON) into scan options that fit the user's plan.
 * Throws HttpError(422/402) with a message the user can act on.
 */
export function buildScanOptions(user, input, { aiAvailable }) {
  const plan = planFor(user);
  const url = normalizeUrl(input.url);

  let viewports = input.viewports;
  if (typeof viewports === 'string') viewports = viewports.split(',');
  if (!Array.isArray(viewports) || !viewports.length) viewports = ['desktop', 'mobile'];
  viewports = [...new Set(viewports.map((v) => String(v).trim().toLowerCase()))];
  for (const v of viewports) {
    if (!ALL_VIEWPORTS.includes(v)) throw new HttpError(422, `Unknown device "${v}". Use: ${ALL_VIEWPORTS.join(', ')}.`);
    if (!plan.viewports.includes(v)) throw new HttpError(402, `The ${v} device size is not included in the ${plan.name} plan.`);
  }

  const requestedPages = input.maxPages === undefined || input.maxPages === '' ? Math.min(10, plan.maxPages) : Number(input.maxPages);
  if (!Number.isInteger(requestedPages) || requestedPages < 1) throw new HttpError(422, 'Max pages must be a whole number of at least 1.');
  if (requestedPages > plan.maxPages) throw new HttpError(402, `The ${plan.name} plan scans up to ${plan.maxPages} pages per scan.`);

  const ai = asBool(input.ai, false);
  if (ai && !plan.ai) throw new HttpError(402, `AI design review is not included in the ${plan.name} plan.`);
  if (ai && !aiAvailable) throw new HttpError(422, 'AI design review is not configured on this server.');

  const visual = String(input.visual || 'off').toLowerCase();
  if (!VISUAL_MODES.includes(visual)) throw new HttpError(422, `Visual mode must be one of: ${VISUAL_MODES.join(', ')}.`);
  if (visual !== 'off' && !plan.visual) throw new HttpError(402, `Visual regression is not included in the ${plan.name} plan.`);

  const flows = parseJsonField(input.flows, 'User flows') ?? [];
  if (!Array.isArray(flows)) throw new HttpError(422, 'User flows must be a JSON list of {"name", "steps"} objects.');
  if (flows.length && !plan.flows) throw new HttpError(402, `User flows are not included in the ${plan.name} plan.`);
  if (flows.length > MAX_FLOWS) throw new HttpError(422, `At most ${MAX_FLOWS} user flows per scan.`);
  const cleanFlows = flows.map((f, i) => {
    if (!f || typeof f !== 'object') throw new HttpError(422, `Flow ${i + 1} must be an object with "name" and "steps".`);
    const name = String(f.name || `Flow ${i + 1}`).slice(0, 80);
    const viewport = f.viewport ? String(f.viewport) : 'desktop';
    if (!plan.viewports.includes(viewport)) throw new HttpError(422, `Flow "${name}": device "${viewport}" is not available.`);
    try {
      validateSteps(f.steps, { restricted: true, label: `Flow "${name}"` });
    } catch (err) {
      throw new HttpError(422, err.message);
    }
    return { name, viewport, steps: f.steps };
  });

  const login = parseJsonField(input.login, 'Login steps');
  let auth = null;
  if (login) {
    if (!plan.flows) throw new HttpError(402, `Login steps are not included in the ${plan.name} plan.`);
    if (typeof login !== 'object' || Array.isArray(login)) throw new HttpError(422, 'Login must be an object like {"loginUrl": "/login", "steps": [...]}.');
    try {
      validateSteps(login.steps || [], { restricted: true, label: 'Login' });
    } catch (err) {
      throw new HttpError(422, err.message);
    }
    auth = { loginUrl: login.loginUrl ? String(login.loginUrl).slice(0, 2000) : undefined, steps: login.steps || [] };
  }

  return {
    url,
    viewports,
    maxPages: requestedPages,
    checkExternalLinks: asBool(input.checkExternalLinks, true),
    ai,
    visual,
    flows: cleanFlows,
    auth,
  };
}

const SECRET_STEP_ACTIONS = new Set(['fill', 'type']);

/** Hide values typed into fields (passwords, test data) whenever options leave the server. */
export function redactOptions(options) {
  const redactSteps = (steps = []) => steps.map((st) => (
    Object.keys(st).some((k) => SECRET_STEP_ACTIONS.has(k)) && st.value !== undefined ? { ...st, value: '********' } : st
  ));
  return {
    ...options,
    flows: (options.flows || []).map((f) => ({ ...f, steps: redactSteps(f.steps) })),
    auth: options.auth ? { ...options.auth, steps: redactSteps(options.auth.steps) } : null,
  };
}

export function createScanService({ db, config }) {
  const guard = config.allowPrivateUrls ? null : createUrlGuard();
  const q = {
    insert: db.prepare(`INSERT INTO scans (id, user_id, url, source, options, progress_total, report_token)
                        VALUES (?, ?, ?, ?, ?, ?, ?)`),
    get: db.prepare('SELECT * FROM scans WHERE id = ? AND user_id = ?'),
    byToken: db.prepare('SELECT * FROM scans WHERE report_token = ?'),
    list: db.prepare('SELECT * FROM scans WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM scans WHERE user_id = ?'),
    monthUsage: db.prepare('SELECT COUNT(*) AS n FROM scans WHERE user_id = ? AND created_at >= ?'),
    active: db.prepare("SELECT COUNT(*) AS n FROM scans WHERE user_id = ? AND status IN ('queued', 'running')"),
    remove: db.prepare('DELETE FROM scans WHERE id = ? AND user_id = ?'),
    anyById: db.prepare('SELECT s.*, u.email AS user_email FROM scans s JOIN users u ON u.id = s.user_id WHERE s.id = ?'),
    removeAny: db.prepare('DELETE FROM scans WHERE id = ?'),
    listAll: db.prepare(`SELECT s.*, u.email AS user_email FROM scans s JOIN users u ON u.id = s.user_id
      WHERE (? IS NULL OR s.status = ?) AND (? IS NULL OR s.url LIKE ? OR u.email LIKE ?)
      ORDER BY s.created_at DESC LIMIT ? OFFSET ?`),
    countAll: db.prepare(`SELECT COUNT(*) AS n FROM scans s JOIN users u ON u.id = s.user_id
      WHERE (? IS NULL OR s.status = ?) AND (? IS NULL OR s.url LIKE ? OR u.email LIKE ?)`),
  };

  function usage(user) {
    const plan = planFor(user);
    // Trial allowance covers the whole trial; paid plans reset every calendar month (UTC).
    const since = plan.id === 'trial' ? user.created_at : monthStartIso();
    const used = q.monthUsage.get(user.id, since).n;
    return { used, limit: plan.scansPerMonth, remaining: Math.max(0, plan.scansPerMonth - used), plan, trialExpired: trialExpired(user) };
  }

  async function create(user, input, source = 'web') {
    const options = buildScanOptions(user, input, { aiAvailable: config.aiAvailable });
    if (guard && !(await guard(options.url))) {
      throw new HttpError(422, 'That address is private or could not be found. Only public websites can be scanned.');
    }
    const plan = planFor(user);
    if (trialExpired(user)) throw new HttpError(402, 'Your trial has ended. Choose a plan to keep scanning.');
    const { used } = usage(user);
    if (used >= plan.scansPerMonth) {
      throw new HttpError(402, `You have used all ${plan.scansPerMonth} scans in the ${plan.name} plan this month. Upgrade to keep scanning.`);
    }
    if (q.active.get(user.id).n >= plan.activeScans) {
      throw new HttpError(429, `The ${plan.name} plan runs ${plan.activeScans} scan${plan.activeScans > 1 ? 's' : ''} at a time. Wait for the current scan to finish.`);
    }
    const id = newId();
    q.insert.run(id, user.id, options.url, source, JSON.stringify(options), options.maxPages * options.viewports.length, randomToken(24));
    return q.get.get(id, user.id);
  }

  const get = (user, id) => q.get.get(id, user.id);

  function getOrThrow(user, id) {
    const scan = get(user, id);
    if (!scan) throw new HttpError(404, 'Scan not found.');
    return scan;
  }

  const list = (user, { limit = 20, offset = 0 } = {}) => q.list.all(user.id, limit, offset);
  const count = (user) => q.count.get(user.id).n;
  const byReportToken = (token) => q.byToken.get(token);

  function remove(user, id) {
    const scan = getOrThrow(user, id);
    if (scan.status === 'running') throw new HttpError(409, 'This scan is still running. Delete it after it finishes.');
    q.remove.run(id, user.id);
    fs.rmSync(reportDir(scan), { recursive: true, force: true });
  }

  async function rerun(user, id, source = 'web') {
    const scan = getOrThrow(user, id);
    return create(user, JSON.parse(scan.options), source);
  }

  const reportDir = (scan) => path.join(config.reportsDir, scan.id);
  const hasReport = (scan) => scan.status === 'done' && fs.existsSync(path.join(reportDir(scan), 'report.html'));

  /** Public JSON shape used by the API and the status endpoint. */
  function serialize(scan) {
    const report = hasReport(scan);
    return {
      id: scan.id,
      url: scan.url,
      status: scan.status,
      source: scan.source,
      progress: { done: scan.progress_done, total: scan.progress_total },
      score: scan.score,
      grade: scan.grade,
      summary: scan.summary ? JSON.parse(scan.summary) : null,
      error: scan.error,
      options: redactOptions(JSON.parse(scan.options)),
      createdAt: scan.created_at,
      startedAt: scan.started_at,
      finishedAt: scan.finished_at,
      reportUrl: report ? `${config.appUrl}/r/${scan.report_token}/report.html` : null,
      markdownUrl: report ? `${config.appUrl}/r/${scan.report_token}/REPORT.md` : null,
      dashboardUrl: `${config.appUrl}/app/scans/${scan.id}`,
    };
  }

  // ---- administrator views across all users
  function listAll({ status = null, search = null, limit = 25, offset = 0 } = {}) {
    const st = status || null;
    const like = search ? `%${search}%` : null;
    const args = [st, st, like, like, like];
    return {
      total: q.countAll.get(...args).n,
      data: q.listAll.all(...args, limit, offset).map((row) => ({ ...serialize(row), userId: row.user_id, userEmail: row.user_email })),
    };
  }

  function getAny(id) {
    const row = q.anyById.get(id);
    if (!row) throw new HttpError(404, 'Scan not found.');
    return { ...serialize(row), userId: row.user_id, userEmail: row.user_email };
  }

  function removeAny(id) {
    const row = q.anyById.get(id);
    if (!row) throw new HttpError(404, 'Scan not found.');
    if (row.status === 'running') throw new HttpError(409, 'This scan is still running.');
    q.removeAny.run(id);
    fs.rmSync(reportDir(row), { recursive: true, force: true });
    return row;
  }

  return { usage, create, get, getOrThrow, list, count, remove, rerun, byReportToken, reportDir, hasReport, serialize, listAll, getAny, removeAny, plans: PLANS };
}
