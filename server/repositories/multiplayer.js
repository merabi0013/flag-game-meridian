/** repositories/multiplayer.js — multiplayer history (kept apart from solo `games` by design). */
function map(r) {
  return {
    id: r.id,
    categoryId: r.category_id,
    difficulty: r.difficulty,
    totalQuestions: r.total_questions,
    guessingOrder: r.guessing_order,
    playerCount: r.player_count,
    players: r.players,
    at: r.created_at,
    hostName: r.host_name,
    hostEmail: r.host_email,
  };
}

function makeMultiplayerRepo(db) {
  return {
    async insert(hostUserId, g, q = db) {
      await q.query(
        `INSERT INTO multiplayer_games (host_user_id, category_id, difficulty, total_questions, guessing_order, player_count, players, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        [hostUserId, g.categoryId, g.difficulty, g.totalQuestions, g.guessingOrder, g.players.length, JSON.stringify(g.players), g.reason || null]
      );
    },

    async listForHost(hostUserId, limit, q = db) {
      const { rows } = await q.query(
        'SELECT * FROM multiplayer_games WHERE host_user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2',
        [hostUserId, limit]
      );
      return rows.map(map);
    },

    async listAll({ page, pageSize }, q = db) {
      const total = (await q.query('SELECT COUNT(*)::int AS n FROM multiplayer_games')).rows[0].n;
      const { rows } = await q.query(
        `SELECT mg.*, u.name AS host_name, u.email AS host_email
           FROM multiplayer_games mg LEFT JOIN users u ON u.id = mg.host_user_id
          ORDER BY mg.created_at DESC, mg.id DESC LIMIT $1 OFFSET $2`,
        [pageSize, (page - 1) * pageSize]
      );
      return { total, games: rows.map(map) };
    },
  };
}

module.exports = { makeMultiplayerRepo };
