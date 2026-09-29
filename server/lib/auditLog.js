/**
 * auditLog.js — minimal, deliberately non-fancy audit trail for
 * administrative actions. Never pass secrets (tokens, session data) into
 * `summary`; it's plain text meant for a human reading the admin panel.
 */
const db = require('../db');

function recordAdminAction({ adminId, action, targetUserId, summary }) {
  db.prepare(
    'INSERT INTO admin_audit_log (admin_id, action, target_user_id, summary, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(adminId, action, targetUserId || null, summary || null, new Date().toISOString());
}

function recentAdminActions(limit = 25) {
  return db
    .prepare(
      `SELECT al.id, al.action, al.target_user_id as targetUserId, al.summary, al.created_at as at,
              admin.name as adminName, admin.email as adminEmail,
              target.name as targetName
       FROM admin_audit_log al
       LEFT JOIN users admin ON admin.id = al.admin_id
       LEFT JOIN users target ON target.id = al.target_user_id
       ORDER BY al.created_at DESC
       LIMIT ?`
    )
    .all(limit);
}

module.exports = { recordAdminAction, recentAdminActions };
