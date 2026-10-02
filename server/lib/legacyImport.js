/**
 * lib/legacyImport.js
 * -----------------------------------------------------------------------
 * Copies the data from the previous SQLite version of Meridian into
 * PostgreSQL, preserving it: users (and how they sign in), game history,
 * multiplayer history, purchases, entitlements, admin audit entries, admin
 * edits to paid/free category settings.
 *
 * Takes plain row arrays (see scripts/import-sqlite.js for reading them
 * out of the .sqlite3 file) so it has no SQLite dependency of its own.
 *
 * Safety:
 *  - runs in ONE transaction: it either imports everything or nothing;
 *  - refuses to run against a database that already holds users or games
 *    (so running it twice can never duplicate history);
 *  - never deletes or overwrites anything that already exists.
 * -----------------------------------------------------------------------
 */
const crypto = require('crypto');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REAL_PROVIDERS = new Set(['google', 'discord']);

const asJson = (text) => {
  if (text === null || text === undefined || text === '') return null;
  if (typeof text === 'object') return text;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

async function importLegacy(db, legacy, { log = console.log } = {}) {
  const rows = {
    users: legacy.users || [],
    games: legacy.games || [],
    entitlements: legacy.entitlements || [],
    transactions: legacy.transactions || [],
    multiplayerGames: legacy.multiplayerGames || [],
    auditLog: legacy.auditLog || [],
    paidCategories: legacy.paidCategories || [],
  };
  const summary = { users: 0, identities: 0, games: 0, multiplayerGames: 0, transactions: 0, entitlements: 0, auditEntries: 0, categoriesUpdated: 0, warnings: [] };
  const warn = (msg) => {
    summary.warnings.push(msg);
    log(`  warning: ${msg}`);
  };

  return db.tx(async (q) => {
    const existing = await q.query('SELECT (SELECT COUNT(*) FROM users)::int AS users, (SELECT COUNT(*) FROM games)::int AS games');
    if (existing.rows[0].users > 0 || existing.rows[0].games > 0) {
      throw new Error('The target database already contains users or games. Import into an empty database (run migrations first, nothing else).');
    }

    // --- users -------------------------------------------------------------
    const userIds = new Map(); // legacy id -> new uuid
    const idFor = (legacyId) => userIds.get(String(legacyId)) || null;
    for (const u of rows.users) {
      const id = UUID_RE.test(String(u.id)) ? String(u.id).toLowerCase() : crypto.randomUUID();
      userIds.set(String(u.id), id);
    }
    for (const u of rows.users) {
      const id = idFor(u.id);
      await q.query(
        `INSERT INTO users (id, name, email, status, is_admin, is_verified_identity, created_by_admin, stat_overrides, created_at, updated_at, last_login_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, COALESCE($9::timestamptz, now()), COALESCE($10::timestamptz, $9::timestamptz, now()), NULL)`,
        [
          id,
          u.name || u.email || `${u.provider || 'legacy'} player`,
          u.email || null,
          u.status === 'disabled' ? 'disabled' : 'active',
          !!u.is_admin,
          u.is_verified_identity === undefined || u.is_verified_identity === null ? true : !!u.is_verified_identity,
          u.created_by_admin ? idFor(u.created_by_admin) : null,
          asJson(u.stat_overrides) ? JSON.stringify(asJson(u.stat_overrides)) : null,
          u.created_at || null,
          u.updated_at || null,
        ]
      );
      summary.users++;

      // Only a real OAuth login becomes a sign-in identity. Admin-created
      // placeholders (provider_id "admin-created:…") stay identity-less.
      if (REAL_PROVIDERS.has(u.provider) && u.provider_id && !String(u.provider_id).startsWith('admin-created:')) {
        await q.query(
          `INSERT INTO auth_identities (user_id, provider, provider_account_id, email, email_verified, display_name, created_at)
           VALUES ($1, $2, $3, $4, false, $5, COALESCE($6::timestamptz, now()))
           ON CONFLICT (provider, provider_account_id) DO NOTHING`,
          [id, u.provider, String(u.provider_id), u.email || null, u.name || null, u.created_at || null]
        );
        summary.identities++;
      }
    }

    // --- category settings the admin had edited -------------------------------
    for (const c of rows.paidCategories) {
      const res = await q.query(
        `UPDATE categories
            SET type = $2, enabled = $3, price_cents = $4, currency = $5,
                name = COALESCE($6, name), description = COALESCE($7, description), updated_at = now()
          WHERE id = $1 RETURNING id`,
        [c.category_id, c.premium === 0 || c.premium === false ? 'default' : 'paid', c.enabled !== 0 && c.enabled !== false, c.price_cents || 0, c.currency || 'usd', c.name || null, c.description || null]
      );
      if (res.rows.length) summary.categoriesUpdated++;
      else warn(`category "${c.category_id}" is not in shared/categoryTree.json; its settings were not imported`);
    }
    // A category can only be 'paid' with a real price and server-hosted data;
    // fall back to the tree's own rules instead of failing the whole import.
    await q.query("UPDATE categories SET type = 'default' WHERE type = 'paid' AND price_cents < 1");

    // --- transactions, then entitlements (which point at transactions) ----------
    const txIds = new Map();
    for (const t of rows.transactions) {
      const userId = idFor(t.user_id);
      const { rows: out } = await q.query(
        `INSERT INTO transactions (user_id, category_id, provider, provider_session_id, provider_payment_intent_id, amount_cents, currency, status, created_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now()), $10::timestamptz)
         ON CONFLICT (provider_session_id) DO NOTHING RETURNING id`,
        [userId, t.category_id, t.provider || 'stripe', t.provider_session_id || null, t.provider_payment_intent_id || null, t.amount_cents || 0, t.currency || 'usd', t.status || 'completed', t.created_at || null, t.completed_at || null]
      );
      if (out[0]) {
        txIds.set(String(t.id), out[0].id);
        summary.transactions++;
      }
    }
    for (const e of rows.entitlements) {
      const userId = idFor(e.user_id);
      if (!userId) {
        warn(`entitlement ${e.id} refers to an unknown user; skipped`);
        continue;
      }
      const cat = await q.query('SELECT 1 FROM categories WHERE id = $1', [e.category_id]);
      if (!cat.rows.length) {
        warn(`entitlement ${e.id} is for unknown category "${e.category_id}"; skipped`);
        continue;
      }
      await q.query(
        `INSERT INTO entitlements (user_id, category_id, transaction_id, status, purchased_at)
         VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now())) ON CONFLICT (user_id, category_id) DO NOTHING`,
        [userId, e.category_id, e.transaction_id ? txIds.get(String(e.transaction_id)) || null : null, e.status || 'active', e.purchased_at || null]
      );
      summary.entitlements++;
    }

    // --- game history ----------------------------------------------------------
    for (const g of rows.games) {
      const userId = idFor(g.user_id);
      if (!userId) {
        warn(`game ${g.id} refers to an unknown user; skipped`);
        continue;
      }
      await q.query(
        `INSERT INTO games (user_id, category_id, difficulty, score, correct, incorrect, skipped, total_questions, best_streak, duration_seconds, reason, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, $10, COALESCE($11::timestamptz, now()))`,
        [userId, g.category_id, g.difficulty, g.score, g.correct, g.incorrect, g.total_questions, g.best_streak, g.duration_seconds, g.reason || null, g.created_at || null]
      );
      summary.games++;
    }
    for (const m of rows.multiplayerGames) {
      const userId = idFor(m.host_user_id);
      const players = asJson(m.players_json);
      if (!userId || !players) {
        warn(`multiplayer game ${m.id} could not be imported (unknown host or unreadable players); skipped`);
        continue;
      }
      await q.query(
        `INSERT INTO multiplayer_games (host_user_id, category_id, difficulty, total_questions, guessing_order, player_count, players, reason, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, COALESCE($9::timestamptz, now()))`,
        [userId, m.category_id, m.difficulty, m.total_questions, m.guessing_order, m.player_count, JSON.stringify(players), m.reason || null, m.created_at || null]
      );
      summary.multiplayerGames++;
    }
    for (const a of rows.auditLog) {
      const adminId = idFor(a.admin_id);
      if (!adminId) {
        warn(`audit entry ${a.id} has an unknown admin; skipped`);
        continue;
      }
      await q.query(
        `INSERT INTO admin_audit_log (admin_id, action, target_user_id, summary, created_at)
         VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))`,
        [adminId, a.action, a.target_user_id ? idFor(a.target_user_id) : null, a.summary || null, a.created_at || null]
      );
      summary.auditEntries++;
    }
    return summary;
  });
}

module.exports = { importLegacy };
