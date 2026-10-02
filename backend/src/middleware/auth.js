import { randomToken, sha256, safeEqual } from '../lib/crypto.js';
import { HttpError } from '../lib/errors.js';

const SESSION_COOKIE = 'qa_session';
const SESSION_DAYS = 30;
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) {
      try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore malformed cookie */ }
    }
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
    deleteOtherSessions: db.prepare('DELETE FROM sessions WHERE user_id = ? AND id_hash != ?'),
    deleteAllSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    purgeExpired: db.prepare("DELETE FROM sessions WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"),
    findToken: db.prepare('SELECT t.id AS token_id, u.* FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?'),
    touchToken: db.prepare("UPDATE api_tokens SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"),
    touchLogin: db.prepare("UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"),
  };
  setInterval(() => q.purgeExpired.run(), 60 * 60 * 1000).unref();

  const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: config.secureCookies, path: '/' };

  function startSession(res, userId) {
    const token = randomToken();
    const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
    q.insertSession.run(sha256(token), userId, randomToken(24), expires.toISOString());
    q.touchLogin.run(userId);
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions, expires });
  }

  function endSession(req, res) {
    if (req.sessionId) q.deleteSession.run(req.sessionId);
    res.clearCookie(SESSION_COOKIE, cookieOptions);
  }

  const endOtherSessions = (req) => q.deleteOtherSessions.run(req.user.id, req.sessionId);
  const endAllSessions = (userId) => q.deleteAllSessions.run(userId);

  /** Attach req.user and req.csrfToken when a valid session cookie belongs to an active user. */
  function loadSession(req, res, next) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) {
      const row = q.findSession.get(sha256(token));
      if (row && row.status === 'active') {
        const { id_hash: idHash, csrf_token: csrf, ...user } = row;
        req.user = user;
        req.sessionId = idHash;
        req.csrfToken = csrf;
      }
    }
    next();
  }

  /**
   * State-changing API calls must be JSON (cross-site forms cannot send it without a CORS
   * preflight) and, for signed-in users, carry the session's CSRF token in X-CSRF-Token.
   */
  function protectApi(req, res, next) {
    if (!UNSAFE_METHODS.has(req.method)) return next();
    const hasBody = Number(req.get('content-length') || 0) > 0 || req.get('transfer-encoding');
    if (hasBody && !req.is('application/json')) throw new HttpError(415, 'Send requests as application/json.');
    if (req.user) {
      const sent = req.get('x-csrf-token');
      if (!sent || !safeEqual(sent, req.csrfToken)) throw new HttpError(403, 'Missing or invalid CSRF token. Reload the page and try again.');
    }
    next();
  }

  function requireUser(req, res, next) {
    if (!req.user) throw new HttpError(401, 'Please log in.');
    next();
  }

  function requireAdmin(req, res, next) {
    if (!req.user) throw new HttpError(401, 'Please log in.');
    if (req.user.role !== 'admin') throw new HttpError(403, 'Administrator access required.');
    next();
  }

  /** Bearer token authentication for the public REST API. */
  function requireApiToken(req, res, next) {
    const m = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') || '');
    if (!m) throw new HttpError(401, 'Missing API token. Send "Authorization: Bearer <token>".');
    const row = q.findToken.get(sha256(m[1]));
    if (!row) throw new HttpError(401, 'Invalid API token.');
    if (row.status !== 'active') throw new HttpError(403, 'This account is suspended.');
    const { token_id: tokenId, ...user } = row;
    q.touchToken.run(tokenId);
    req.user = user;
    next();
  }

  /** Redirect browsers that open app pages while signed out (the API enforces access itself). */
  function pageGuard({ admin = false } = {}) {
    return (req, res, next) => {
      if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
      if (admin && req.user.role !== 'admin') return res.redirect('/app');
      next();
    };
  }

  return { startSession, endSession, endOtherSessions, endAllSessions, loadSession, protectApi, requireUser, requireAdmin, requireApiToken, pageGuard };
}
