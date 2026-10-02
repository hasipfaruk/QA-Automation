import express from 'express';
import { paging, pageResult, queryText } from '../lib/pagination.js';

export function adminRoutes({ auth, audit, scans, admin }) {
  const router = express.Router();
  router.use(auth.requireAdmin);

  router.get('/stats', (req, res) => res.json(admin.stats()));

  router.get('/users', (req, res) => {
    const p = paging(req);
    const result = admin.listUsers({
      search: queryText(req.query.q),
      plan: queryText(req.query.plan, 20),
      role: queryText(req.query.role, 20),
      status: queryText(req.query.status, 20),
      ...p,
    });
    res.json(pageResult(result, p));
  });

  router.get('/users/:id', (req, res) => res.json(admin.getUser(req.params.id)));

  router.patch('/users/:id', (req, res) => {
    const { plan, role, status } = req.body || {};
    const result = admin.updateUser(req.user, req.params.id, { plan, role, status });
    if (Object.keys(result.changes).length) {
      audit.record(req, 'admin.user_updated', { targetType: 'user', targetId: req.params.id, details: { email: result.user.email, changes: result.changes } });
    }
    res.json(result);
  });

  router.post('/users/:id/sign-out', (req, res) => {
    const user = admin.signOutUser(req.params.id);
    audit.record(req, 'admin.user_signed_out', { targetType: 'user', targetId: user.id, details: { email: user.email } });
    res.json({ ok: true });
  });

  router.delete('/users/:id', (req, res) => {
    const user = admin.deleteUser(req.user, req.params.id);
    audit.record(req, 'admin.user_deleted', { targetType: 'user', targetId: user.id, details: { email: user.email } });
    res.status(204).end();
  });

  router.get('/scans', (req, res) => {
    const p = paging(req);
    res.json(pageResult(scans.listAll({ status: queryText(req.query.status, 20), search: queryText(req.query.q), ...p }), p));
  });

  router.get('/scans/:id', (req, res) => res.json(scans.getAny(req.params.id)));

  router.delete('/scans/:id', (req, res) => {
    const scan = scans.removeAny(req.params.id);
    audit.record(req, 'admin.scan_deleted', { targetType: 'scan', targetId: scan.id, details: { url: scan.url, owner: scan.user_email } });
    res.status(204).end();
  });

  router.get('/audit', (req, res) => {
    const p = paging(req, { defaultLimit: 50 });
    res.json(pageResult(audit.list({ action: queryText(req.query.action, 60), search: queryText(req.query.q), ...p }), p));
  });

  return router;
}
