import express from 'express';
import { HttpError } from '../lib/errors.js';
import { publicUser } from '../lib/serializers.js';
import { hashPassword, verifyPassword, DUMMY_PASSWORD_HASH } from '../lib/crypto.js';
import { rateLimiter } from '../lib/rate-limit.js';
import { validateEmail, validatePassword, safeNextPath } from '../lib/validation.js';
import { publicPlans, planFor, trialEndsAt } from '../config/plans.js';

export function sessionRoutes({ db, config, auth, audit }) {
  const router = express.Router();
  const limiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
  const q = {
    byEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    create: db.prepare("INSERT INTO users (email, name, password_hash, plan) VALUES (?, ?, ?, 'trial') RETURNING *"),
  };

  const limit = (req) => {
    const r = limiter(`${req.ip}|${String(req.body?.email || '').toLowerCase()}`);
    if (!r.allowed) throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil(r.retryAfterSec / 60)} minutes.`);
  };

  router.get('/session', (req, res) => {
    if (!req.user) return res.json({ user: null });
    const plan = planFor(req.user);
    res.json({
      user: publicUser(req.user),
      plan: { id: plan.id, name: plan.name, trialEndsAt: plan.id === 'trial' ? trialEndsAt(req.user) : null },
      csrfToken: req.csrfToken,
    });
  });

  router.get('/config', (req, res) => res.json({
    signupsOpen: config.signupsOpen,
    billingEnabled: Boolean(config.stripe.secretKey && config.stripe.prices.pro && config.stripe.prices.business),
    devPlanSwitch: config.devPlanSwitch,
    aiAvailable: config.aiAvailable,
    salesEmail: config.salesEmail,
    supportEmail: config.supportEmail,
  }));

  router.get('/plans', (req, res) => res.json({ data: publicPlans() }));

  router.post('/auth/signup', async (req, res) => {
    if (!config.signupsOpen) throw new HttpError(403, 'New sign ups are currently closed.');
    limit(req);
    const email = String(req.body?.email || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim().slice(0, 80);
    if (!validateEmail(email)) throw new HttpError(422, 'Enter a valid email address.');
    const pwError = validatePassword(req.body?.password);
    if (pwError) throw new HttpError(422, pwError);
    if (q.byEmail.get(email)) throw new HttpError(409, 'An account with this email already exists. Log in instead.');
    const user = q.create.get(email, name, await hashPassword(req.body.password));
    auth.startSession(res, user.id);
    audit.record(req, 'user.signup', { actor: user, targetType: 'user', targetId: user.id });
    res.status(201).json({ user: publicUser(user), redirect: '/app?notice=welcome' });
  });

  router.post('/auth/login', async (req, res) => {
    limit(req);
    const email = String(req.body?.email || '').trim().toLowerCase();
    const user = q.byEmail.get(email);
    const ok = await verifyPassword(String(req.body?.password || ''), user?.password_hash || DUMMY_PASSWORD_HASH);
    if (!user || !ok) {
      audit.record(req, 'user.login_failed', { actor: { id: user?.id ?? null, email }, targetType: 'user', targetId: user?.id ?? null });
      throw new HttpError(401, 'Email or password is incorrect.');
    }
    if (user.status !== 'active') {
      audit.record(req, 'user.login_blocked', { actor: user, targetType: 'user', targetId: user.id });
      throw new HttpError(403, 'This account is suspended. Contact support.');
    }
    auth.startSession(res, user.id);
    audit.record(req, 'user.login', { actor: user, targetType: 'user', targetId: user.id });
    // Administrators work in the admin console; customers return to where they were going.
    const next = safeNextPath(req.body?.next);
    const redirect = user.role === 'admin' ? (next.startsWith('/app/admin') ? next : '/app/admin') : next;
    res.json({ user: publicUser(user), redirect });
  });

  router.post('/auth/logout', (req, res) => {
    if (req.user) audit.record(req, 'user.logout', { targetType: 'user', targetId: req.user.id });
    auth.endSession(req, res);
    res.json({ ok: true, redirect: '/' });
  });

  return router;
}
