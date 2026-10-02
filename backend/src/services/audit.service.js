// Append-only audit trail of security-relevant and administrative actions.

export function createAudit({ db }) {
  const q = {
    insert: db.prepare(`INSERT INTO audit_log (actor_id, actor_email, action, target_type, target_id, details, ip)
                        VALUES (?, ?, ?, ?, ?, ?, ?)`),
    list: db.prepare(`SELECT * FROM audit_log
                      WHERE (? IS NULL OR action LIKE ?) AND (? IS NULL OR actor_email LIKE ? OR target_id = ?)
                      ORDER BY id DESC LIMIT ? OFFSET ?`),
    count: db.prepare(`SELECT COUNT(*) AS n FROM audit_log
                       WHERE (? IS NULL OR action LIKE ?) AND (? IS NULL OR actor_email LIKE ? OR target_id = ?)`),
  };

  /**
   * @param {import('express').Request|null} req  request of the acting user (or null for system events)
   * @param {string} action  dotted name, e.g. "user.login" or "admin.user.updated"
   */
  function record(req, action, { actor, targetType = null, targetId = null, details = null } = {}) {
    const who = actor || req?.user || null;
    q.insert.run(
      who?.id ?? null,
      who?.email ?? null,
      action,
      targetType,
      targetId === null ? null : String(targetId),
      details ? JSON.stringify(details) : null,
      req?.ip ?? null,
    );
  }

  function list({ action = null, search = null, limit = 50, offset = 0 } = {}) {
    const a = action ? `${action}%` : null;
    const s = search ? `%${search}%` : null;
    const args = [a, a, s, s, search];
    return {
      total: q.count.get(...args).n,
      data: q.list.all(...args, limit, offset).map((r) => ({
        id: r.id,
        actorId: r.actor_id,
        actorEmail: r.actor_email,
        action: r.action,
        targetType: r.target_type,
        targetId: r.target_id,
        details: r.details ? JSON.parse(r.details) : null,
        ip: r.ip,
        createdAt: r.created_at,
      })),
    };
  }

  return { record, list };
}
