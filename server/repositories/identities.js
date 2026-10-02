/** repositories/identities.js — how a user can sign in (one row per provider account). */
function map(r) {
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    provider: r.provider,
    providerAccountId: r.provider_account_id,
    email: r.email,
    emailVerified: r.email_verified,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    createdAt: r.created_at,
    lastLoginAt: r.last_login_at,
  };
}

function makeIdentitiesRepo(db) {
  return {
    async find(provider, providerAccountId, q = db) {
      const { rows } = await q.query('SELECT * FROM auth_identities WHERE provider = $1 AND provider_account_id = $2', [
        provider,
        providerAccountId,
      ]);
      return map(rows[0]);
    },

    async listForUser(userId, q = db) {
      const { rows } = await q.query('SELECT * FROM auth_identities WHERE user_id = $1 ORDER BY created_at ASC', [userId]);
      return rows.map(map);
    },

    /** Returns the new identity, or null if (provider, account) already exists. */
    async create({ userId, provider, providerAccountId, email = null, emailVerified = false, displayName = null, avatarUrl = null }, q = db) {
      const { rows } = await q.query(
        `INSERT INTO auth_identities (user_id, provider, provider_account_id, email, email_verified, display_name, avatar_url, last_login_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (provider, provider_account_id) DO NOTHING
         RETURNING *`,
        [userId, provider, providerAccountId, email, emailVerified, displayName, avatarUrl]
      );
      return map(rows[0]);
    },

    /** Refresh the provider-supplied profile details on every login. */
    async touch(id, { email, emailVerified, displayName, avatarUrl }, q = db) {
      await q.query(
        `UPDATE auth_identities
            SET email = COALESCE($2, email), email_verified = $3, display_name = COALESCE($4, display_name),
                avatar_url = COALESCE($5, avatar_url), last_login_at = now()
          WHERE id = $1`,
        [id, email || null, !!emailVerified, displayName || null, avatarUrl || null]
      );
    },
  };
}

module.exports = { makeIdentitiesRepo };
