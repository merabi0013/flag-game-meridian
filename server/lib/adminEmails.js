/**
 * adminEmails.js
 * -----------------------------------------------------------------------
 * ADMIN_EMAILS is a bootstrap mechanism only: a comma-separated list of
 * emails that get is_admin=1 written to their database row the first time
 * they log in (see passport-config.js). After that, the database's
 * is_admin column is the only thing that matters — every authorization
 * check in this app reads req.user.is_admin, never this list directly.
 *
 * This is intentionally grant-only, not sync-on-every-login: removing an
 * email from ADMIN_EMAILS later does NOT revoke an already-granted admin.
 * Revoking admin access is a deliberate, separate action (flip is_admin
 * back to 0 directly in the database — see server/README "How admin
 * access is protected"). Making removal-from-env instantly revocable
 * would mean a typo'd/edited env var could silently lock out your only
 * administrator; requiring a deliberate DB edit to revoke is safer.
 * -----------------------------------------------------------------------
 */
function getAdminEmailAllowlist() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isBootstrapAdminEmail(email) {
  if (!email) return false;
  return getAdminEmailAllowlist().includes(String(email).trim().toLowerCase());
}

module.exports = { getAdminEmailAllowlist, isBootstrapAdminEmail };
