import path from 'node:path';
import { makeIssue } from './rules.js';

/**
 * Replace ${ENV:NAME} with environment variables so passwords stay out of config files.
 * Disabled in restricted mode (hosted service), where it would expose the server's own secrets.
 */
function resolveEnv(v, restricted) {
  if (typeof v !== 'string') return v;
  return v.replace(/\$\{ENV:([A-Z0-9_]+)\}/gi, (_, name) => {
    if (restricted) throw new Error('${ENV:...} variables are not available on the hosted service');
    if (process.env[name] === undefined) throw new Error(`Environment variable ${name} is not set`);
    return process.env[name];
  });
}

function describeStep(s) {
  const action = Object.keys(s).find((k) => ACTIONS[k]) || 'unknown';
  const arg = s[action];
  let label = `${action} ${typeof arg === 'object' ? JSON.stringify(arg) : arg ?? ''}`;
  if (s.value !== undefined) {
    const secret = /pass|secret|token/i.test(String(arg)) || /\$\{ENV:/.test(String(s.value));
    label += ` = ${secret ? '****' : s.value}`;
  }
  return { action, label: label.trim() };
}

// Each action receives (page, step, baseUrl, env) where env() resolves ${ENV:...} placeholders.
const ACTIONS = {
  goto: (page, s, base, env) => page.goto(new URL(env(s.goto), base).toString(), { waitUntil: 'load' }),
  click: (page, s, base, env) => page.locator(env(s.click)).first().click(),
  fill: (page, s, base, env) => page.locator(env(s.fill)).first().fill(String(env(s.value ?? ''))),
  type: (page, s, base, env) => page.locator(env(s.type)).first().pressSequentially(String(env(s.value ?? '')), { delay: 30 }),
  select: (page, s, base, env) => page.locator(env(s.select)).first().selectOption(String(env(s.value))),
  check: (page, s, base, env) => page.locator(env(s.check)).first().check(),
  uncheck: (page, s, base, env) => page.locator(env(s.uncheck)).first().uncheck(),
  hover: (page, s, base, env) => page.locator(env(s.hover)).first().hover(),
  press: (page, s) => (s.selector ? page.locator(s.selector).first().press(s.press) : page.keyboard.press(s.press)),
  upload: (page, s, base, env) => page.locator(env(s.upload)).first().setInputFiles(env(s.file)),
  wait: (page, s, base, env) => (typeof s.wait === 'number' ? page.waitForTimeout(s.wait) : page.locator(env(s.wait)).first().waitFor({ state: 'visible' })),
  expectText: async (page, s, base, env) => {
    await page.getByText(env(s.expectText)).first().waitFor({ state: 'visible', timeout: s.timeout ?? 10000 })
      .catch(() => { throw new Error(`Expected text "${s.expectText}" not visible on the page`); });
  },
  expectNoText: async (page, s, base, env) => {
    await page.waitForTimeout(500);
    if (await page.getByText(env(s.expectNoText)).first().isVisible()) throw new Error(`Text "${s.expectNoText}" should NOT be visible`);
  },
  expectVisible: async (page, s, base, env) => {
    await page.locator(env(s.expectVisible)).first().waitFor({ state: 'visible', timeout: s.timeout ?? 10000 })
      .catch(() => { throw new Error(`Element "${s.expectVisible}" is not visible`); });
  },
  expectUrl: async (page, s, base, env) => {
    await page.waitForURL((u) => u.toString().includes(env(s.expectUrl)), { timeout: s.timeout ?? 10000 })
      .catch(() => { throw new Error(`Expected URL to contain "${s.expectUrl}" but it is ${page.url()}`); });
  },
  screenshot: () => Promise.resolve(),
};

// Actions that touch the local machine and are therefore blocked in restricted mode.
const RESTRICTED_ACTIONS = new Set(['upload']);
const STEP_EXTRA_KEYS = new Set(['value', 'timeout', 'selector', 'file']);
export const STEP_ACTIONS = Object.keys(ACTIONS);

/**
 * Validate untrusted step lists (e.g. submitted through the web app or API).
 * Throws an Error with a user-friendly message when something is wrong.
 */
export function validateSteps(steps, { restricted = false, label = 'steps', maxSteps = 40 } = {}) {
  if (!Array.isArray(steps)) throw new Error(`${label} must be a list`);
  if (steps.length > maxSteps) throw new Error(`${label} can have at most ${maxSteps} steps`);
  steps.forEach((s, i) => {
    const where = `${label}, step ${i + 1}`;
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error(`${where}: must be an object like {"click": "#button"}`);
    const keys = Object.keys(s);
    const actions = keys.filter((k) => ACTIONS[k]);
    if (actions.length !== 1) throw new Error(`${where}: needs exactly one action (${STEP_ACTIONS.join(', ')})`);
    if (restricted && RESTRICTED_ACTIONS.has(actions[0])) throw new Error(`${where}: "${actions[0]}" is not available on the hosted service`);
    for (const k of keys) {
      if (!ACTIONS[k] && !STEP_EXTRA_KEYS.has(k)) throw new Error(`${where}: unknown field "${k}"`);
      const v = s[k];
      if (k === 'timeout' || (k === 'wait' && typeof v === 'number')) {
        if (typeof v !== 'number' || v < 0 || v > 30000) throw new Error(`${where}: ${k} must be a number between 0 and 30000`);
      } else if (typeof v !== 'string' || v.length > 500) {
        throw new Error(`${where}: "${k}" must be text of at most 500 characters`);
      }
      if (restricted && typeof v === 'string' && /\$\{ENV:/i.test(v)) {
        throw new Error(`${where}: \${ENV:...} variables are not available on the hosted service`);
      }
    }
  });
}

/** Run a list of steps. Returns { ok, steps:[{label, ok, screenshot, error}], failure } */
export async function runSteps(page, steps, { baseUrl, shotDir, shotPrefix, timeout = 15000, restricted = false }) {
  page.setDefaultTimeout(timeout);
  const env = (v) => resolveEnv(v, restricted);
  const results = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const { action, label } = describeStep(s);
    const shot = shotDir ? path.join(shotDir, `${shotPrefix}-step${String(i + 1).padStart(2, '0')}.jpg`) : null;
    try {
      if (!ACTIONS[action]) throw new Error(`Unknown step: ${JSON.stringify(s)}. Valid actions: ${STEP_ACTIONS.join(', ')}`);
      if (restricted && RESTRICTED_ACTIONS.has(action)) throw new Error(`"${action}" is not available on the hosted service`);
      await ACTIONS[action](page, s, baseUrl, env);
      await page.waitForLoadState('load', { timeout: 5000 }).catch(() => {});
      if (shot) await page.screenshot({ path: shot, type: 'jpeg', quality: 70 });
      results.push({ n: i + 1, action, label, ok: true, screenshot: shot });
    } catch (err) {
      if (shot) await page.screenshot({ path: shot, type: 'jpeg', quality: 70 }).catch(() => {});
      const message = String(err.message || err).split('\n')[0].slice(0, 300);
      results.push({ n: i + 1, action, label, ok: false, screenshot: shot, error: message });
      return { ok: false, steps: results, failure: { step: i + 1, action: label, message } };
    }
  }
  return { ok: true, steps: results };
}

/** Run each configured flow in its own browser context. */
export async function runFlows(browser, cfg, { shotDir, contextOptions, log }) {
  const out = [];
  for (const flow of cfg.flows || []) {
    const vpName = flow.viewport || 'desktop';
    const vp = cfg.viewportDefs[vpName];
    const context = await browser.newContext({ ...contextOptions, viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
    const slug = flow.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    log(`  > flow: ${flow.name}`);
    const res = await runSteps(page, flow.steps, { baseUrl: cfg.url, shotDir, shotPrefix: `flow-${slug}`, timeout: flow.timeout || 15000, restricted: !!cfg.restricted });
    const issues = [];
    if (!res.ok) {
      issues.push(makeIssue('flow-step-failed', { isMobile: vp.isMobile }, { flow: flow.name, ...res.failure }, { screenshot: res.steps.at(-1)?.screenshot }));
    }
    for (const msg of [...new Set(consoleErrors)].slice(0, 5)) {
      issues.push(makeIssue('console-error', {}, { message: msg }, { title: `Console error during flow "${flow.name}"` }));
    }
    log(`    ${res.ok ? 'passed' : 'FAILED at step ' + res.failure.step + ': ' + res.failure.message}`);
    out.push({ name: flow.name, viewport: vpName, ok: res.ok, steps: res.steps, issues, url: page.url() });
    await context.close();
  }
  return out;
}

/** Log in once and return a storageState object to reuse for every page. */
export async function authenticate(browser, cfg, { shotDir, log }) {
  const auth = cfg.auth;
  if (!auth) return null;
  if (auth.storageState) {
    if (cfg.restricted) throw new Error('storageState files are not available on the hosted service');
    const p = path.resolve(cfg._configDir || '.', auth.storageState);
    log(`  using saved login state ${p}`);
    return p;
  }
  log('  logging in...');
  const context = await browser.newContext();
  const page = await context.newPage();
  const steps = [{ goto: auth.loginUrl || cfg.url }, ...(auth.steps || [])];
  const res = await runSteps(page, steps, { baseUrl: cfg.url, shotDir, shotPrefix: 'login', timeout: 20000, restricted: !!cfg.restricted });
  if (!res.ok) {
    await context.close();
    throw new Error(`Login failed at step ${res.failure.step} (${res.failure.action}): ${res.failure.message}. See ${res.steps.at(-1)?.screenshot}`);
  }
  const state = await context.storageState();
  await context.close();
  log('  logged in');
  return state;
}
