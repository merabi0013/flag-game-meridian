/**
 * requireAdmin.js
 * -----------------------------------------------------------------------
 * The single source of truth for "is this user an admin", used by every
 * /api/admin/* route. Always runs after requireAuth. Checks
 * req.user.is_admin — a value that came from THIS request's own
 * server-side session lookup (passport's deserializeUser reads it fresh
 * from the database on every request), never from anything the client
 * sent. There is no code path anywhere in this app that lets a request
 * body, header, or cookie set or influence this value.
 * -----------------------------------------------------------------------
 */
function requireAdmin(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not signed in.' });
  }
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Administrator access required.' });
  }
  next();
}

module.exports = { requireAdmin };
