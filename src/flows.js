import path from 'node:path';
import { makeIssue } from './rules.js';

/** Replace ${ENV:NAME} with environment variables so passwords stay out of config files. */
function env(v) {
  if (typeof v !== 'string') return v;
  return v.replace(/\$\{ENV:([A-Z0-9_]+)\}/gi, (_, name) => {
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

const ACTIONS = {
  goto: (page, s, base) => page.goto(new URL(env(s.goto), base).toString(), { waitUntil: 'load' }),
  click: (page, s) => page.locator(env(s.click)).first().click(),
  fill: (page, s) => page.locator(env(s.fill)).first().fill(String(env(s.value ?? ''))),
  type: (page, s) => page.locator(env(s.type)).first().pressSequentially(String(env(s.value ?? '')), { delay: 30 }),
  select: (page, s) => page.locator(env(s.select)).first().selectOption(String(env(s.value))),
  check: (page, s) => page.locator(env(s.check)).first().check(),
  uncheck: (page, s) => page.locator(env(s.uncheck)).first().uncheck(),
  hover: (page, s) => page.locator(env(s.hover)).first().hover(),
  press: (page, s) => (s.selector ? page.locator(s.selector).first().press(s.press) : page.keyboard.press(s.press)),
  upload: (page, s) => page.locator(env(s.upload)).first().setInputFiles(env(s.file)),
  wait: (page, s) => (typeof s.wait === 'number' ? page.waitForTimeout(s.wait) : page.locator(env(s.wait)).first().waitFor({ state: 'visible' })),
  expectText: async (page, s) => {
    await page.getByText(env(s.expectText)).first().waitFor({ state: 'visible', timeout: s.timeout ?? 10000 })
      .catch(() => { throw new Error(`Expected text "${s.expectText}" not visible on the page`); });
  },
  expectNoText: async (page, s) => {
    await page.waitForTimeout(500);
    if (await page.getByText(env(s.expectNoText)).first().isVisible()) throw new Error(`Text "${s.expectNoText}" should NOT be visible`);
  },
  expectVisible: async (page, s) => {
    await page.locator(env(s.expectVisible)).first().waitFor({ state: 'visible', timeout: s.timeout ?? 10000 })
      .catch(() => { throw new Error(`Element "${s.expectVisible}" is not visible`); });
  },
  expectUrl: async (page, s) => {
    await page.waitForURL((u) => u.toString().includes(env(s.expectUrl)), { timeout: s.timeout ?? 10000 })
      .catch(() => { throw new Error(`Expected URL to contain "${s.expectUrl}" but it is ${page.url()}`); });
  },
  screenshot: () => Promise.resolve(),
};

/** Run a list of steps. Returns { ok, steps:[{label, ok, screenshot, error}], failure } */
export async function runSteps(page, steps, { baseUrl, shotDir, shotPrefix, timeout = 15000 }) {
  page.setDefaultTimeout(timeout);
  const results = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const { action, label } = describeStep(s);
    const shot = shotDir ? path.join(shotDir, `${shotPrefix}-step${String(i + 1).padStart(2, '0')}.jpg`) : null;
    try {
      if (!ACTIONS[action]) throw new Error(`Unknown step: ${JSON.stringify(s)}. Valid actions: ${Object.keys(ACTIONS).join(', ')}`);
      await ACTIONS[action](page, s, baseUrl);
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
    const res = await runSteps(page, flow.steps, { baseUrl: cfg.url, shotDir, shotPrefix: `flow-${slug}`, timeout: flow.timeout || 15000 });
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
    const p = path.resolve(cfg._configDir || '.', auth.storageState);
    log(`  using saved login state ${p}`);
    return p;
  }
  log('  logging in...');
  const context = await browser.newContext();
  const page = await context.newPage();
  const steps = [{ goto: auth.loginUrl || cfg.url }, ...(auth.steps || [])];
  const res = await runSteps(page, steps, { baseUrl: cfg.url, shotDir, shotPrefix: 'login', timeout: 20000 });
  if (!res.ok) {
    await context.close();
    throw new Error(`Login failed at step ${res.failure.step} (${res.failure.action}): ${res.failure.message}. See ${res.steps.at(-1)?.screenshot}`);
  }
  const state = await context.storageState();
  await context.close();
  log('  logged in');
  return state;
}
