/**
 * middleware/auth.js
 * -----------------------------------------------------------------------
 * Authentication is a bearer token in the Authorization header:
 *     Authorization: Bearer <opaque session token>
 * The token's SHA-256 is looked up in the `sessions` table on EVERY request
 * (so disabling a user or deleting a session takes effect immediately), and
 * the user row is re-read from the database each time. Nothing the client
 * sends can set req.user or is_admin.
 *
 * Why a header and not a cookie: the frontend (github.io) and this API are
 * different *sites*, and browsers — Safari always, Chrome increasingly —
 * refuse to send third-party cookies. A bearer token has no such problem.
 * -----------------------------------------------------------------------
 */
const { hashToken } = require('../auth/tokens');

function bearerToken(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1] : null;
}

/** Populates req.user / req.sessionTokenHash when a valid session is presented. Never rejects. */
function authenticate({ repos, config }) {
  return async (req, res, next) => {
    try {
      const token = bearerToken(req);
      if (token) {
        const tokenHash = hashToken(token);
        const session = await repos.sessions.findLive(tokenHash);
        if (session) {
          const user = await repos.users.findById(session.userId);
          if (user && user.status !== 'disabled') {
            req.user = user;
            req.sessionTokenHash = tokenHash;
            await repos.sessions.slide(tokenHash, config.sessionTtlDays);
          }
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  return res.status(401).json({ error: 'Not signed in.' });
}

/** Always used AFTER requireAuth. Reads the freshly loaded database row only. */
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Administrator access required.' });
  next();
}

/** Tiny fixed-window per-IP limiter for the auth endpoints (no dependency). */
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  const timer = setInterval(() => hits.clear(), windowMs);
  timer.unref();
  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const n = (hits.get(key) || 0) + 1;
    hits.set(key, n);
    if (n > max) return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    next();
  };
}

module.exports = { authenticate, requireAuth, requireAdmin, rateLimit, bearerToken };
