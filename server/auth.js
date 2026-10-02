import { randomToken, sha256, safeEqual } from './security.js';

const SESSION_COOKIE = 'qa_session';
const SESSION_DAYS = 30;

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function createAuth({ db, config }) {
  const q = {
    insertSession: db.prepare('INSERT INTO sessions (id_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)'),
    findSession: db.prepare(`
      SELECT s.id_hash, s.csrf_token, u.*
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id_hash = ? AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`),
    deleteSession: db.prepare('DELETE FROM sessions WHERE id_hash = ?'),
    deleteUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ? AND id_hash != ?'),
    purgeExpired: db.prepare("DELETE FROM sessions WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"),
    findToken: db.prepare('SELECT t.id AS token_id, u.* FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?'),
    touchToken: db.prepare("UPDATE api_tokens SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"),
  };
  setInterval(() => q.purgeExpired.run(), 60 * 60 * 1000).unref();

  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    path: '/',
  };

  function startSession(res, userId) {
    const token = randomToken();
    const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
    q.insertSession.run(sha256(token), userId, randomToken(24), expires.toISOString());
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions, expires });
  }

  function endSession(req, res) {
    if (req.sessionId) q.deleteSession.run(req.sessionId);
    res.clearCookie(SESSION_COOKIE, cookieOptions);
  }

  /** Sign out every other device, e.g. after a password change. */
  function endOtherSessions(req) {
    q.deleteUserSessions.run(req.user.id, req.sessionId);
  }

  /** Attach req.user / req.csrfToken when a valid session cookie is present. */
  function loadSession(req, res, next) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) {
      const row = q.findSession.get(sha256(token));
      if (row) {
        const { id_hash: idHash, csrf_token: csrf, ...user } = row;
        req.user = user;
        req.sessionId = idHash;
        req.csrfToken = csrf;
      }
    }
    res.locals.user = req.user || null;
    res.locals.csrfToken = req.csrfToken || '';
    next();
  }

  function requireUser(req, res, next) {
    if (req.user) return next();
    const nextUrl = encodeURIComponent(req.originalUrl);
    return res.redirect(`/login?next=${nextUrl}`);
  }

  /** Form posts from signed-in users must carry the session's CSRF token. */
  function verifyCsrf(req, res, next) {
    if (!req.user) return next();
    const sent = req.body?._csrf || req.get('x-csrf-token');
    if (sent && safeEqual(sent, req.csrfToken)) return next();
    throw new HttpError(403, 'Your session form token is missing or expired. Reload the page and try again.');
  }

  /** Bearer token authentication for the REST API. */
  function requireApiToken(req, res, next) {
    const m = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') || '');
    if (!m) throw new HttpError(401, 'Missing API token. Send "Authorization: Bearer <token>".');
    const row = q.findToken.get(sha256(m[1]));
    if (!row) throw new HttpError(401, 'Invalid API token.');
    const { token_id: tokenId, ...user } = row;
    q.touchToken.run(tokenId);
    req.user = user;
    next();
  }

  return { startSession, endSession, endOtherSessions, loadSession, requireUser, verifyCsrf, requireApiToken };
}

/** Only allow redirects to local paths after login (prevents open redirects). */
export function safeNextPath(next) {
  return typeof next === 'string' && /^\/(?!\/)[\w\-./?=&%]*$/.test(next) ? next : '/app';
}
