import express from 'express';
import { HttpError } from '../auth.js';
import { rateLimiter } from '../security.js';
import { paging } from './util.js';

/** Token-authenticated REST API for CI pipelines and integrations. */
export function publicApiRoutes({ auth, scans }) {
  const router = express.Router();
  const limiter = rateLimiter({ windowMs: 60 * 1000, max: 120 });

  router.use(express.json({ limit: '200kb' }));
  router.use((req, res, next) => {
    const r = limiter(req.get('authorization') || req.ip);
    if (!r.allowed) {
      res.set('Retry-After', String(r.retryAfterSec));
      throw new HttpError(429, 'Too many requests. Slow down and try again shortly.');
    }
    next();
  });
  router.use(auth.requireApiToken);

  router.get('/me', (req, res) => {
    const u = scans.usage(req.user);
    res.json({ email: req.user.email, plan: u.plan.id, usage: { used: u.used, limit: u.limit, remaining: u.remaining } });
  });
  router.get('/scans', (req, res) => {
    const p = paging(req, { defaultLimit: 20 });
    res.json({ data: scans.list(req.user, p).map(scans.serialize), total: scans.count(req.user) });
  });
  router.post('/scans', async (req, res) => res.status(201).json(scans.serialize(await scans.create(req.user, req.body || {}, 'api'))));
  router.get('/scans/:id', (req, res) => res.json(scans.serialize(scans.getOrThrow(req.user, req.params.id))));
  router.post('/scans/:id/rerun', async (req, res) => res.status(201).json(scans.serialize(await scans.rerun(req.user, req.params.id, 'api'))));
  router.delete('/scans/:id', (req, res) => {
    scans.remove(req.user, req.params.id);
    res.status(204).end();
  });

  return router;
}
