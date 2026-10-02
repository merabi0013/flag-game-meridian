/** repositories/sessions.js — bearer-token sessions (token hashes only) and one-time codes. */
function makeSessionsRepo(db) {
  return {
    async create({ userId, tokenHash, ttlDays, userAgent = null }, q = db) {
      await q.query(
        `INSERT INTO sessions (user_id, token_hash, expires_at, user_agent)
         VALUES ($1, $2, now() + $3::int * interval '1 day', $4)`,
        [userId, tokenHash, ttlDays, userAgent ? String(userAgent).slice(0, 300) : null]
      );
    },

    /** The user id for a live (unexpired) session, or null. */
    async findLive(tokenHash, q = db) {
      const { rows } = await q.query(
        'SELECT user_id, last_seen_at, expires_at FROM sessions WHERE token_hash = $1 AND expires_at > now()',
        [tokenHash]
      );
      return rows[0] ? { userId: rows[0].user_id, lastSeenAt: rows[0].last_seen_at } : null;
    },

    /** Sliding expiry: extend, but at most about once an hour per session. */
    async slide(tokenHash, ttlDays, q = db) {
      await q.query(
        `UPDATE sessions SET last_seen_at = now(), expires_at = now() + $2::int * interval '1 day'
          WHERE token_hash = $1 AND last_seen_at < now() - interval '1 hour'`,
        [tokenHash, ttlDays]
      );
    },

    async remove(tokenHash, q = db) {
      await q.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
    },

    async removeAllForUser(userId, q = db) {
      await q.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    },

    async purgeExpired(q = db) {
      await q.query('DELETE FROM sessions WHERE expires_at <= now()');
      await q.query('DELETE FROM one_time_codes WHERE expires_at <= now()');
    },

    // --- one-time codes ---------------------------------------------------
    async createCode({ codeHash, userId, purpose, ttlSeconds }, q = db) {
      await q.query(
        `INSERT INTO one_time_codes (code_hash, user_id, purpose, expires_at)
         VALUES ($1, $2, $3, now() + $4::int * interval '1 second')`,
        [codeHash, userId, purpose, ttlSeconds]
      );
    },

    /** Atomically consume a code: returns the user id exactly once, else null. */
    async consumeCode(codeHash, purpose, q = db) {
      const { rows } = await q.query(
        'DELETE FROM one_time_codes WHERE code_hash = $1 AND purpose = $2 AND expires_at > now() RETURNING user_id',
        [codeHash, purpose]
      );
      return rows[0] ? rows[0].user_id : null;
    },
  };
}

module.exports = { makeSessionsRepo };
