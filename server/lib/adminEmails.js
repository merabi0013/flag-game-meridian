/**
 * adminEmails.js
 * -----------------------------------------------------------------------
 * ADMIN_EMAILS is a bootstrap mechanism only: a comma-separated list of
 * emails that get is_admin = true the first time they sign in with a
 * provider-VERIFIED address (see services/accounts.js). After that, the
 * database's is_admin column is the only thing that matters — every
 * authorization check reads req.user.isAdmin, never this list.
 *
 * Grant-only, on purpose: removing an email later does NOT revoke an
 * already-granted admin. Revoking is a deliberate database edit
 * (UPDATE users SET is_admin = false ...), so a typo'd env var can never
 * lock out your only administrator.
 * -----------------------------------------------------------------------
 */
function getAdminEmailAllowlist(env = process.env) {
  return (env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isBootstrapAdminEmail(email, env = process.env) {
  if (!email) return false;
  return getAdminEmailAllowlist(env).includes(String(email).trim().toLowerCase());
}

module.exports = { getAdminEmailAllowlist, isBootstrapAdminEmail };
