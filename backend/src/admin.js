import fs from 'node:fs';
import path from 'node:path';
import { HttpError, publicUser } from './auth.js';
import { PLANS, PAID_PLANS, planFor, trialEndsAt } from './plans.js';

const ROLES = ['user', 'admin'];
const STATUSES = ['active', 'suspended'];
const ACTIVE_SUBSCRIPTION = new Set(['active', 'trialing', 'past_due', 'dev']);

/** Delete a user with all scans, reports, baselines, tokens and sessions. */
export function deleteUserAndData({ db, config }, userId) {
  const scanIds = db.prepare('SELECT id FROM scans WHERE user_id = ?').all(userId).map((r) => r.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId); // cascades to sessions, tokens and scans
  for (const id of scanIds) fs.rmSync(path.join(config.reportsDir, id), { recursive: true, force: true });
  fs.rmSync(path.join(config.baselinesDir, String(userId)), { recursive: true, force: true });
}

export function createAdminService({ db, config, scans, auth }) {
  const q = {
    users: db.prepare(`
      SELECT u.*, (SELECT COUNT(*) FROM scans s WHERE s.user_id = u.id) AS scan_count,
             (SELECT MAX(created_at) FROM scans s WHERE s.user_id = u.id) AS last_scan_at
      FROM users u
      WHERE (? IS NULL OR u.email LIKE ? OR u.name LIKE ?)
        AND (? IS NULL OR u.plan = ?) AND (? IS NULL OR u.role = ?) AND (? IS NULL OR u.status = ?)
      ORDER BY u.created_at DESC LIMIT ? OFFSET ?`),
    countUsers: db.prepare(`
      SELECT COUNT(*) AS n FROM users u
      WHERE (? IS NULL OR u.email LIKE ? OR u.name LIKE ?)
        AND (? IS NULL OR u.plan = ?) AND (? IS NULL OR u.role = ?) AND (? IS NULL OR u.status = ?)`),
    user: db.prepare('SELECT * FROM users WHERE id = ?'),
    userTokens: db.prepare('SELECT id, name, prefix, created_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC'),
    userSessions: db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"),
    update: db.prepare('UPDATE users SET plan = ?, role = ?, status = ? WHERE id = ?'),
    adminCount: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'"),

    totalUsers: db.prepare('SELECT COUNT(*) AS n FROM users'),
    newUsers: db.prepare('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?'),
    byPlan: db.prepare('SELECT plan, COUNT(*) AS n FROM users GROUP BY plan'),
    byStatus: db.prepare('SELECT status, COUNT(*) AS n FROM users GROUP BY status'),
    paying: db.prepare("SELECT plan, subscription_status FROM users WHERE plan IN ('pro', 'business', 'enterprise') AND status = 'active'"),
    scansSince: db.prepare('SELECT COUNT(*) AS n FROM scans WHERE created_at >= ?'),
    scansByStatus: db.prepare('SELECT status, COUNT(*) AS n FROM scans GROUP BY status'),
    failedSince: db.prepare("SELECT COUNT(*) AS n FROM scans WHERE status = 'failed' AND created_at >= ?"),
    avgScore: db.prepare("SELECT ROUND(AVG(score)) AS v FROM scans WHERE status = 'done' AND created_at >= ?"),
    daily: db.prepare('SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM scans WHERE created_at >= ? GROUP BY day ORDER BY day'),
    recentUsers: db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 6'),
    recentFailures: db.prepare(`SELECT s.id, s.url, s.error, s.finished_at, u.email FROM scans s JOIN users u ON u.id = s.user_id
                                WHERE s.status = 'failed' ORDER BY s.created_at DESC LIMIT 6`),
  };

  const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();
  const startOfToday = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.toISOString(); };
  const toMap = (rows, key) => Object.fromEntries(rows.map((r) => [r[key], r.n]));

  function stats() {
    // Estimated monthly recurring revenue from list prices; Stripe remains the source of truth.
    let mrr = 0;
    for (const row of q.paying.all()) {
      const plan = PLANS[row.plan];
      if (plan?.price && (row.subscription_status === null || ACTIVE_SUBSCRIPTION.has(row.subscription_status))) mrr += plan.price;
    }
    const since14 = daysAgo(13).slice(0, 10);
    const daily = toMap(q.daily.all(`${since14}T00:00:00.000Z`), 'day');
    const series = [];
    for (let i = 13; i >= 0; i--) {
      const day = daysAgo(i).slice(0, 10);
      series.push({ day, scans: daily[day] || 0 });
    }
    const scanStatus = toMap(q.scansByStatus.all(), 'status');
    return {
      users: {
        total: q.totalUsers.get().n,
        new7d: q.newUsers.get(daysAgo(7)).n,
        byPlan: toMap(q.byPlan.all(), 'plan'),
        byStatus: toMap(q.byStatus.all(), 'status'),
      },
      revenue: { estimatedMrr: mrr, payingCustomers: q.paying.all().length },
      scans: {
        today: q.scansSince.get(startOfToday()).n,
        last30d: q.scansSince.get(daysAgo(30)).n,
        queued: scanStatus.queued || 0,
        running: scanStatus.running || 0,
        failed24h: q.failedSince.get(daysAgo(1)).n,
        averageScore30d: q.avgScore.get(daysAgo(30)).v,
        daily: series,
      },
      recentUsers: q.recentUsers.all().map(publicUser),
      recentFailures: q.recentFailures.all().map((r) => ({ id: r.id, url: r.url, error: r.error, finishedAt: r.finished_at, userEmail: r.email })),
    };
  }

  function listUsers({ search = null, plan = null, role = null, status = null, limit = 25, offset = 0 } = {}) {
    const like = search ? `%${search}%` : null;
    const args = [like, like, like, plan || null, plan || null, role || null, role || null, status || null, status || null];
    return {
      total: q.countUsers.get(...args).n,
      data: q.users.all(...args, limit, offset).map((u) => ({ ...publicUser(u), scanCount: u.scan_count, lastScanAt: u.last_scan_at })),
    };
  }

  function getUserRow(id) {
    const user = q.user.get(Number(id));
    if (!user) throw new HttpError(404, 'User not found.');
    return user;
  }

  function getUser(id) {
    const user = getUserRow(id);
    const usage = scans.usage(user);
    return {
      user: publicUser(user),
      plan: { id: planFor(user).id, name: planFor(user).name, trialEndsAt: planFor(user).id === 'trial' ? trialEndsAt(user) : null },
      usage: { used: usage.used, limit: usage.limit, remaining: usage.remaining, trialExpired: usage.trialExpired },
      activeSessions: q.userSessions.get(user.id).n,
      tokens: q.userTokens.all(user.id).map((t) => ({ id: t.id, name: t.name, prefix: t.prefix, createdAt: t.created_at, lastUsedAt: t.last_used_at })),
      recentScans: scans.list(user, { limit: 10 }).map(scans.serialize),
      stripe: { customerId: user.stripe_customer_id, subscriptionId: user.stripe_subscription_id, status: user.subscription_status },
    };
  }

  function updateUser(actor, id, patch) {
    const user = getUserRow(id);
    const next = { plan: user.plan, role: user.role, status: user.status };
    if (patch.plan !== undefined) {
      if (!PLANS[patch.plan]) throw new HttpError(422, `Plan must be one of: ${Object.keys(PLANS).join(', ')}.`);
      next.plan = patch.plan;
    }
    if (patch.role !== undefined) {
      if (!ROLES.includes(patch.role)) throw new HttpError(422, `Role must be one of: ${ROLES.join(', ')}.`);
      next.role = patch.role;
    }
    if (patch.status !== undefined) {
      if (!STATUSES.includes(patch.status)) throw new HttpError(422, `Status must be one of: ${STATUSES.join(', ')}.`);
      next.status = patch.status;
    }
    if (user.id === actor.id && (next.role !== user.role || next.status !== user.status)) {
      throw new HttpError(422, 'You cannot change your own role or status. Ask another administrator.');
    }
    const losesAdmin = user.role === 'admin' && user.status === 'active' && (next.role !== 'admin' || next.status !== 'active');
    if (losesAdmin && q.adminCount.get().n <= 1) throw new HttpError(422, 'At least one active administrator is required.');

    q.update.run(next.plan, next.role, next.status, user.id);
    if (next.status === 'suspended' && user.status !== 'suspended') auth.endAllSessions(user.id);
    const changes = Object.fromEntries(Object.keys(next).filter((k) => next[k] !== user[k]).map((k) => [k, { from: user[k], to: next[k] }]));
    return { user: publicUser(getUserRow(id)), changes, paidPlanManual: PAID_PLANS.includes(next.plan) && !user.stripe_subscription_id };
  }

  function signOutUser(id) {
    const user = getUserRow(id);
    auth.endAllSessions(user.id);
    return user;
  }

  function deleteUser(actor, id) {
    const user = getUserRow(id);
    if (user.id === actor.id) throw new HttpError(422, 'You cannot delete your own account from the admin panel.');
    if (user.role === 'admin' && q.adminCount.get().n <= 1) throw new HttpError(422, 'At least one active administrator is required.');
    deleteUserAndData({ db, config }, user.id);
    return user;
  }

  return { stats, listUsers, getUser, updateUser, signOutUser, deleteUser };
}
