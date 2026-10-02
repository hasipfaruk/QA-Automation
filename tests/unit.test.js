import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPublicAddress, createUrlGuard } from '../backend/scanner/net/egress-proxy.js';
import { validateSteps } from '../backend/scanner/flows.js';
import { buildScanOptions, normalizeUrl, redactOptions } from '../backend/src/scans.js';
import { hashPassword, verifyPassword, validatePassword } from '../backend/src/security.js';
import { safeNextPath } from '../backend/src/auth.js';
import { trialExpired, PLANS } from '../backend/src/plans.js';
import { html, trusted } from '../frontend/app/assets/js/core/html.js';

const trial = { id: 1, plan: 'trial', created_at: new Date().toISOString() };
const pro = { id: 2, plan: 'pro', created_at: new Date().toISOString() };

test('isPublicAddress blocks private, loopback and metadata ranges', () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.3.4', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(isPublicAddress(ip), true, ip);
});

test('url guard rejects non-http protocols and private hosts', async () => {
  const guard = createUrlGuard();
  assert.equal(await guard('file:///etc/passwd'), false);
  assert.equal(await guard('http://127.0.0.1:8080/'), false);
  assert.equal(await guard('http://169.254.169.254/latest/meta-data'), false);
  assert.equal(await guard('http://localhost/'), false);
  assert.equal(await guard('https://8.8.8.8/'), true);
});

test('validateSteps blocks upload and ${ENV} in restricted mode', () => {
  assert.doesNotThrow(() => validateSteps([{ goto: '/' }, { fill: '#q', value: 'x' }, { wait: 500 }], { restricted: true }));
  assert.throws(() => validateSteps([{ upload: '#f', file: '/etc/passwd' }], { restricted: true }), /not available/);
  assert.throws(() => validateSteps([{ fill: '#a', value: '${ENV:SECRET}' }], { restricted: true }), /ENV/);
  assert.throws(() => validateSteps([{ click: '#a', fill: '#b' }]), /exactly one action/);
  assert.throws(() => validateSteps([{ click: '#a', extra: 1 }]), /unknown field/);
  assert.throws(() => validateSteps('nope'), /must be a list/);
});

test('buildScanOptions enforces plan limits', () => {
  const opts = buildScanOptions(trial, { url: 'example.com' }, { aiAvailable: true });
  assert.equal(opts.url, 'https://example.com/');
  assert.deepEqual(opts.viewports, ['desktop', 'mobile']);
  assert.equal(opts.maxPages, 5);

  const err = (fn) => { try { fn(); } catch (e) { return e; } assert.fail('expected an error'); };
  assert.equal(err(() => buildScanOptions(trial, { url: 'example.com', maxPages: 6 }, {})).status, 402);
  assert.equal(err(() => buildScanOptions(trial, { url: 'example.com', viewports: ['tablet'] }, {})).status, 402);
  assert.equal(err(() => buildScanOptions(trial, { url: 'example.com', ai: true }, { aiAvailable: true })).status, 402);
  assert.equal(err(() => buildScanOptions(trial, { url: 'example.com', flows: '[{"name":"a","steps":[{"goto":"/"}]}]' }, {})).status, 402);
  assert.equal(err(() => buildScanOptions(pro, { url: 'example.com', ai: true }, { aiAvailable: false })).status, 422);
  assert.equal(err(() => buildScanOptions(pro, { url: 'example.com', flows: '[oops' }, {})).status, 422);

  const proOpts = buildScanOptions(pro, { url: 'https://example.com', viewports: 'desktop,tablet', maxPages: '40', visual: 'compare' }, { aiAvailable: false });
  assert.deepEqual(proOpts.viewports, ['desktop', 'tablet']);
  assert.equal(proOpts.maxPages, 40);
  assert.equal(proOpts.visual, 'compare');
});

test('typed values are redacted from scan options', () => {
  const redacted = redactOptions({
    url: 'https://example.com/',
    flows: [{ name: 'f', steps: [{ fill: '#q', value: 'search term' }, { click: '#go' }] }],
    auth: { loginUrl: '/login', steps: [{ fill: '#password', value: 'hunter2-secret' }] },
  });
  assert.equal(redacted.auth.steps[0].value, '********');
  assert.equal(redacted.flows[0].steps[0].value, '********');
  assert.deepEqual(redacted.flows[0].steps[1], { click: '#go' });
  assert.equal(JSON.stringify(redacted).includes('hunter2'), false);
});

test('trial plan expires after the trial period', () => {
  assert.equal(trialExpired(trial), false);
  assert.equal(trialExpired({ plan: 'trial', created_at: new Date(Date.now() - 30 * 864e5).toISOString() }), true);
  assert.equal(trialExpired({ plan: 'pro', created_at: new Date(Date.now() - 300 * 864e5).toISOString() }), false);
  assert.equal(PLANS.enterprise.selfServe, false);
});

test('normalizeUrl rejects unsupported and credentialed URLs', () => {
  assert.equal(normalizeUrl('example.com/a#b'), 'https://example.com/a');
  assert.throws(() => normalizeUrl('ftp://example.com'), /http/);
  assert.throws(() => normalizeUrl('javascript:alert(1)'), /valid URL|http/);
  assert.throws(() => normalizeUrl('https://user:pass@example.com'), /password/);
  assert.throws(() => normalizeUrl(''), /Enter/);
});

test('passwords are hashed and verified', async () => {
  const hash = await hashPassword('correct horse battery');
  assert.match(hash, /^scrypt\$/);
  assert.equal(await verifyPassword('correct horse battery', hash), true);
  assert.equal(await verifyPassword('wrong password!', hash), false);
  assert.ok(validatePassword('short'));
  assert.equal(validatePassword('long enough password'), null);
});

test('safeNextPath only allows local paths', () => {
  assert.equal(safeNextPath('/app/scans'), '/app/scans');
  assert.equal(safeNextPath('//evil.com'), '/app');
  assert.equal(safeNextPath('https://evil.com'), '/app');
  assert.equal(safeNextPath('/\\evil.com'), '/app');
});

test('frontend html template escapes values', () => {
  assert.equal(String(html`<p>${'<script>"x"</script>'}</p>`), '<p>&lt;script&gt;&quot;x&quot;&lt;/script&gt;</p>');
  assert.equal(String(html`<p>${trusted('<b>ok</b>')}</p>`), '<p><b>ok</b></p>');
  assert.equal(String(html`<ul>${['<a>', 'b'].map((x) => html`<li>${x}</li>`)}</ul>`), '<ul><li>&lt;a&gt;</li><li>b</li></ul>');
});
