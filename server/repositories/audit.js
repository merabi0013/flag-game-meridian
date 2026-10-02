/** repositories/audit.js — admin action audit trail. Never put secrets in `summary`. */
function makeAuditRepo(db) {
  return {
    async record({ adminId, action, targetUserId = null, summary = null }, q = db) {
      await q.query('INSERT INTO admin_audit_log (admin_id, action, target_user_id, summary) VALUES ($1, $2, $3, $4)', [
        adminId,
        action,
        targetUserId,
        summary,
      ]);
    },

    async recent(limit = 25, q = db) {
      const { rows } = await q.query(
        `SELECT al.id, al.action, al.target_user_id, al.summary, al.created_at,
                admin.name AS admin_name, admin.email AS admin_email, target.name AS target_name
           FROM admin_audit_log al
           LEFT JOIN users admin ON admin.id = al.admin_id
           LEFT JOIN users target ON target.id = al.target_user_id
          ORDER BY al.created_at DESC, al.id DESC LIMIT $1`,
        [limit]
      );
      return rows.map((r) => ({
        id: r.id,
        action: r.action,
        targetUserId: r.target_user_id,
        summary: r.summary,
        at: r.created_at,
        adminName: r.admin_name,
        adminEmail: r.admin_email,
        targetName: r.target_name,
      }));
    },
  };
}

module.exports = { makeAuditRepo };
