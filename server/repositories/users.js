/**
 * repositories/users.js — the users table. Returns plain camelCase domain
 * objects; nothing outside repositories/ ever sees a SQL row.
 */
const EDITABLE = { name: 'name', email: 'email', status: 'status', statOverrides: 'stat_overrides' };

function map(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    status: r.status,
    isAdmin: r.is_admin,
    isVerifiedIdentity: r.is_verified_identity,
    createdByAdmin: r.created_by_admin,
    statOverrides: r.stat_overrides || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastLoginAt: r.last_login_at,
  };
}

/** Escapes LIKE wildcards so a search for "50%" matches literally. */
function likeEscape(s) {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function makeUsersRepo(db) {
  return {
    async create({ name, email = null, isAdmin = false, isVerifiedIdentity = true, createdByAdmin = null }, q = db) {
      const { rows } = await q.query(
        `INSERT INTO users (name, email, is_admin, is_verified_identity, created_by_admin)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [name, email, isAdmin, isVerifiedIdentity, createdByAdmin]
      );
      return map(rows[0]);
    },

    async findById(id, q = db) {
      const { rows } = await q.query('SELECT * FROM users WHERE id = $1', [id]);
      return map(rows[0]);
    },

    async touchLogin(id, q = db) {
      await q.query('UPDATE users SET last_login_at = now() WHERE id = $1', [id]);
    },

    async setAdmin(id, isAdmin, q = db) {
      await q.query('UPDATE users SET is_admin = $2, updated_at = now() WHERE id = $1', [id, isAdmin]);
    },

    /** fields: any of name, email, status, statOverrides (object|null). */
    async update(id, fields, q = db) {
      const sets = [];
      const params = [id];
      for (const [key, value] of Object.entries(fields)) {
        if (!EDITABLE[key]) throw new Error(`users.update: field not editable: ${key}`);
        params.push(key === 'statOverrides' && value !== null ? JSON.stringify(value) : value);
        sets.push(`${EDITABLE[key]} = $${params.length}${key === 'statOverrides' ? '::jsonb' : ''}`);
      }
      if (!sets.length) return this.findById(id, q);
      const { rows } = await q.query(`UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`, params);
      return map(rows[0]);
    },

    async remove(id, q = db) {
      // games, sessions, identities, entitlements and hosted multiplayer
      // games cascade; transactions keep their row with user_id = NULL.
      await q.query('DELETE FROM users WHERE id = $1', [id]);
    },

    /** Paginated admin listing with per-user game totals and linked providers. */
    async list({ search = '', page = 1, pageSize = 20 }, q = db) {
      const like = `%${likeEscape(search)}%`;
      const where = search ? `WHERE u.name ILIKE $1 ESCAPE '\\' OR u.email ILIKE $1 ESCAPE '\\'` : '';
      const whereParams = search ? [like] : [];

      const total = (await q.query(`SELECT COUNT(*)::int AS n FROM users u ${where}`, whereParams)).rows[0].n;
      const { rows } = await q.query(
        `SELECT u.*,
                COALESCE(g.games_played, 0)::int AS games_played,
                COALESCE(g.questions, 0)::int AS questions_answered,
                COALESCE(g.correct, 0)::int AS correct,
                (SELECT string_agg(i.provider, ',' ORDER BY i.created_at) FROM auth_identities i WHERE i.user_id = u.id) AS providers
         FROM users u
         LEFT JOIN (
           SELECT user_id, COUNT(*) AS games_played, SUM(total_questions) AS questions, SUM(correct) AS correct
           FROM games GROUP BY user_id
         ) g ON g.user_id = u.id
         ${where}
         ORDER BY u.created_at DESC
         LIMIT $${whereParams.length + 1} OFFSET $${whereParams.length + 2}`,
        [...whereParams, pageSize, (page - 1) * pageSize]
      );
      return {
        total,
        users: rows.map((r) => ({
          ...map(r),
          gamesPlayed: r.games_played,
          questionsAnswered: r.questions_answered,
          correct: r.correct,
          providers: r.providers ? r.providers.split(',') : [],
        })),
      };
    },

    async counts(q = db) {
      const { rows } = await q.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE is_admin)::int AS admins,
                COUNT(*) FILTER (WHERE status = 'disabled')::int AS disabled
         FROM users`
      );
      return rows[0];
    },
  };
}

module.exports = { makeUsersRepo, mapUser: map };
