/**
 * repositories/games.js — solo game history and the per-user / per-category
 * aggregates the profile is built from. Aggregation happens in SQL, grouped
 * by category_id, so a new category needs no code here.
 */
function makeGamesRepo(db) {
  return {
    async insert(userId, g, q = db) {
      await q.query(
        `INSERT INTO games (user_id, category_id, difficulty, score, correct, incorrect, skipped, total_questions, best_streak, duration_seconds, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [userId, g.categoryId, g.difficulty, g.score, g.correct, g.incorrect, g.skipped || 0, g.totalQuestions, g.bestStreak, g.durationSeconds, g.reason || null]
      );
    },

    /** One row per category the user has played. */
    async perCategory(userId, q = db) {
      const { rows } = await q.query(
        `SELECT category_id,
                COUNT(*)::int AS games_played,
                COALESCE(SUM(total_questions), 0)::int AS questions_answered,
                COALESCE(SUM(correct), 0)::int AS correct,
                COALESCE(SUM(incorrect), 0)::int AS incorrect,
                COALESCE(SUM(skipped), 0)::int AS skipped,
                COALESCE(SUM(score), 0)::int AS total_score,
                COALESCE(MAX(score), 0)::int AS best_score,
                COALESCE(MAX(best_streak), 0)::int AS best_streak
           FROM games WHERE user_id = $1 GROUP BY category_id`,
        [userId]
      );
      return rows.map((r) => ({
        categoryId: r.category_id,
        gamesPlayed: r.games_played,
        questionsAnswered: r.questions_answered,
        correct: r.correct,
        incorrect: r.incorrect,
        skipped: r.skipped,
        totalScore: r.total_score,
        bestScore: r.best_score,
        bestStreak: r.best_streak,
      }));
    },

    async recent(userId, limit = 15, q = db) {
      const { rows } = await q.query(
        `SELECT category_id, difficulty, score, total_questions, correct, created_at
           FROM games WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
        [userId, limit]
      );
      return rows.map((r) => ({
        categoryId: r.category_id,
        difficulty: r.difficulty,
        score: r.score,
        totalQuestions: r.total_questions,
        correct: r.correct,
        at: r.created_at,
      }));
    },

    async totals(q = db) {
      const { rows } = await q.query(
        'SELECT COUNT(*)::int AS games, COALESCE(SUM(total_questions), 0)::int AS questions FROM games'
      );
      return rows[0];
    },
  };
}

module.exports = { makeGamesRepo };
