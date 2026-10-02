import express from 'express';
import { HttpError, publicUser } from '../auth.js';
import { hashPassword, verifyPassword, validatePassword, randomToken, sha256 } from '../security.js';
import { planFor, trialEndsAt } from '../plans.js';
import { deleteUserAndData } from '../admin.js';
import { paging, pageResult } from './util.js';

const MAX_TOKENS = 20;

export function accountRoutes({ db, config, auth, audit, scans, billing }) {
  const router = express.Router();
  router.use(auth.requireUser);

  const q = {
    tokens: db.prepare('SELECT id, name, prefix, created_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC'),
    tokenCount: db.prepare('SELECT COUNT(*) AS n FROM api_tokens WHERE user_id = ?'),
    createToken: db.prepare('INSERT INTO api_tokens (user_id, name, token_hash, prefix) VALUES (?, ?, ?, ?) RETURNING id, created_at'),
    deleteToken: db.prepare('DELETE FROM api_tokens WHERE id = ? AND user_id = ?'),
    setPassword: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
    setName: db.prepare('UPDATE users SET name = ? WHERE id = ?'),
  };

  const usageJson = (user) => {
    const u = scans.usage(user);
    const plan = planFor(user);
    return {
      plan: { id: plan.id, name: plan.name, price: plan.price, trialEndsAt: plan.id === 'trial' ? trialEndsAt(user) : null, limits: { maxPages: plan.maxPages, viewports: plan.viewports, flows: plan.flows, ai: plan.ai, visual: plan.visual, activeScans: plan.activeScans } },
      used: u.used,
      limit: u.limit,
      remaining: u.remaining,
      trialExpired: u.trialExpired,
    };
  };

  router.get('/usage', (req, res) => res.json(usageJson(req.user)));

  // ---- scans
  router.get('/scans', (req, res) => {
    const p = paging(req, { defaultLimit: 25 });
    res.json(pageResult({ total: scans.count(req.user), data: scans.list(req.user, p).map(scans.serialize) }, p));
  });
  router.post('/scans', async (req, res) => {
    const scan = await scans.create(req.user, req.body || {}, 'web');
    res.status(201).json(scans.serialize(scan));
  });
  router.get('/scans/:id', (req, res) => res.json(scans.serialize(scans.getOrThrow(req.user, req.params.id))));
  router.post('/scans/:id/rerun', async (req, res) => res.status(201).json(scans.serialize(await scans.rerun(req.user, req.params.id, 'web'))));
  router.delete('/scans/:id', (req, res) => {
    scans.remove(req.user, req.params.id);
    res.status(204).end();
  });

  // ---- API tokens
  router.get('/tokens', (req, res) => res.json({
    data: q.tokens.all(req.user.id).map((t) => ({ id: t.id, name: t.name, prefix: t.prefix, createdAt: t.created_at, lastUsedAt: t.last_used_at })),
  }));
  router.post('/tokens', (req, res) => {
    if (q.tokenCount.get(req.user.id).n >= MAX_TOKENS) throw new HttpError(422, `You can have at most ${MAX_TOKENS} API tokens. Revoke one first.`);
    const name = String(req.body?.name || '').trim().slice(0, 60) || 'API token';
    const token = `qa_${randomToken(30)}`;
    const row = q.createToken.get(req.user.id, name, sha256(token), token.slice(0, 10));
    audit.record(req, 'token.created', { targetType: 'token', targetId: row.id, details: { name } });
    // The plain token is returned once and never stored.
    res.status(201).json({ id: row.id, name, prefix: token.slice(0, 10), token, createdAt: row.created_at });
  });
  router.delete('/tokens/:id', (req, res) => {
    const result = q.deleteToken.run(Number(req.params.id), req.user.id);
    if (result.changes) audit.record(req, 'token.revoked', { targetType: 'token', targetId: req.params.id });
    res.status(204).end();
  });

  // ---- account
  router.patch('/account', (req, res) => {
    const name = String(req.body?.name ?? '').trim().slice(0, 80);
    q.setName.run(name, req.user.id);
    res.json({ user: publicUser({ ...req.user, name }) });
  });
  router.post('/account/password', async (req, res) => {
    if (!(await verifyPassword(String(req.body?.current || ''), req.user.password_hash))) throw new HttpError(422, 'Current password is incorrect.');
    const pwError = validatePassword(req.body?.password);
    if (pwError) throw new HttpError(422, pwError);
    q.setPassword.run(await hashPassword(req.body.password), req.user.id);
    auth.endOtherSessions(req);
    audit.record(req, 'user.password_changed', { targetType: 'user', targetId: req.user.id });
    res.json({ ok: true });
  });
  router.delete('/account', (req, res) => {
    if (String(req.body?.confirm || '').trim().toLowerCase() !== req.user.email.toLowerCase()) {
      throw new HttpError(422, 'The email you typed does not match your account.');
    }
    if (req.user.role === 'admin') throw new HttpError(422, 'Administrators cannot delete their own account. Ask another administrator.');
    if (['active', 'trialing', 'past_due'].includes(req.user.subscription_status)) {
      throw new HttpError(422, 'Cancel your subscription in Billing before deleting your account.');
    }
    audit.record(req, 'user.deleted_self', { targetType: 'user', targetId: req.user.id });
    auth.endSession(req, res);
    deleteUserAndData({ db, config }, req.user.id);
    res.json({ ok: true, redirect: '/' });
  });

  // ---- billing
  router.get('/billing', (req, res) => res.json({
    usage: usageJson(req.user),
    subscriptionStatus: req.user.subscription_status,
    hasBillingAccount: Boolean(req.user.stripe_customer_id),
    billingEnabled: billing.enabled,
    devPlanSwitch: config.devPlanSwitch,
    salesEmail: config.salesEmail,
  }));
  router.post('/billing/checkout', async (req, res) => res.json({ url: await billing.checkoutUrl(req.user, String(req.body?.plan || '')) }));
  router.post('/billing/portal', async (req, res) => res.json({ url: await billing.portalUrl(req.user) }));
  router.post('/billing/dev-switch', (req, res) => {
    const plan = String(req.body?.plan || '');
    billing.devSwitch(req.user, plan);
    audit.record(req, 'billing.dev_plan_switch', { targetType: 'user', targetId: req.user.id, details: { from: req.user.plan, to: plan } });
    res.json({ ok: true });
  });

  return router;
}
