/**
 * userStats.js
 * -----------------------------------------------------------------------
 * Single source of truth for turning a user's `games` rows into the
 * aggregate numbers shown on their profile — used by both
 * GET /api/me/stats (self) and the admin user-detail endpoint, so there
 * is exactly one definition of "how do we compute someone's stats"
 * rather than two that could drift apart.
 *
 * Admin "modify game performance" (see routes/admin.js) does NOT rewrite
 * game history. It writes an explicit, narrow override for exactly the
 * six top-line fields the brief asked for; per-category breakdowns and
 * recent-game history are always the real computed values. An override
 * is only ever set by an admin via a validated endpoint — a normal user
 * has no path to influence it.
 * -----------------------------------------------------------------------
 */
const db = require('../db');

const OVERRIDE_FIELDS = ['gamesPlayed', 'questionsAnswered', 'correct', 'incorrect', 'bestScore', 'bestStreak'];
const MAX_REASONABLE_VALUE = 10_000_000;

function computeAggregate(userId) {
  const totals = db
    .prepare(
      `SELECT
         COUNT(*) as gamesPlayed,
         COALESCE(SUM(total_questions), 0) as questionsAnswered,
         COALESCE(SUM(correct), 0) as correct,
         COALESCE(SUM(incorrect), 0) as incorrect,
         COALESCE(SUM(score), 0) as totalScore,
         COALESCE(MAX(score), 0) as bestScore,
         COALESCE(MAX(best_streak), 0) as bestStreak
       FROM games WHERE user_id = ?`
    )
    .get(userId);

  const byCategory = db
    .prepare(
      `SELECT category_id as categoryId,
              COUNT(*) as gamesPlayed,
              COALESCE(SUM(total_questions), 0) as asked,
              COALESCE(SUM(correct), 0) as correct,
              COALESCE(SUM(incorrect), 0) as incorrect,
              COALESCE(SUM(score), 0) as totalScore,
              COALESCE(MAX(score), 0) as bestScore,
              COALESCE(MAX(best_streak), 0) as bestStreak
       FROM games WHERE user_id = ? GROUP BY category_id`
    )
    .all(userId);

  const categoryStats = {};
  byCategory.forEach((row) => {
    // `asked` / `correct` are the original fields (kept for older clients);
    // the rest are computed from the same stored rows. Nothing here names a
    // category: every category_id found in `games` gets an entry.
    categoryStats[row.categoryId] = {
      asked: row.asked,
      correct: row.correct,
      gamesPlayed: row.gamesPlayed,
      questionsAnswered: row.asked,
      incorrect: row.incorrect,
      totalScore: row.totalScore,
      bestScore: row.bestScore,
      bestStreak: row.bestStreak,
    };
  });

  const recentGames = db
    .prepare(
      `SELECT category_id as categoryId, difficulty, score, total_questions as totalQuestions,
              correct, created_at as at
       FROM games WHERE user_id = ? ORDER BY created_at DESC LIMIT 15`
    )
    .all(userId);

  return { ...totals, categoryStats, recentGames };
}

function parseOverrides(user) {
  if (!user || !user.stat_overrides) return {};
  try {
    const parsed = JSON.parse(user.stat_overrides);
    if (!parsed || typeof parsed !== 'object') return {};
    const clean = {};
    OVERRIDE_FIELDS.forEach((f) => {
      if (Number.isInteger(parsed[f])) clean[f] = parsed[f];
    });
    return clean;
  } catch {
    return {};
  }
}

/** Merged, display-ready stats for a user: computed aggregate with any
 * admin overrides applied on top, field by field. */
function getMergedStats(user) {
  const aggregate = computeAggregate(user.id);
  const overrides = parseOverrides(user);
  const merged = { ...aggregate, ...overrides };
  merged.accuracy = merged.questionsAnswered ? Math.round((merged.correct / merged.questionsAnswered) * 100) : 0;
  merged.hasOverrides = Object.keys(overrides).length > 0;
  return merged;
}

/** Validates a partial overrides object submitted by an admin. Every key
 * must be one of the six explicitly approved fields, a non-negative
 * integer within a sane bound, and internally consistent with any other
 * provided fields in the same submission. Unknown keys are rejected
 * outright rather than silently dropped, so a typo'd field name surfaces
 * as an error instead of doing nothing. */
function validateOverrides(input) {
  if (input === undefined || input === null) return { valid: true, errors: [], sanitized: null };
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['statOverrides must be an object'], sanitized: null };
  }

  const errors = [];
  const sanitized = {};

  for (const key of Object.keys(input)) {
    if (!OVERRIDE_FIELDS.includes(key)) {
      errors.push(`Unknown stat field: ${key}`);
      continue;
    }
    const value = input[key];
    if (value === null) continue; // explicit null clears that one override
    if (!Number.isInteger(value) || value < 0 || value > MAX_REASONABLE_VALUE) {
      errors.push(`${key} must be a non-negative integer`);
      continue;
    }
    sanitized[key] = value;
  }

  if (
    sanitized.correct !== undefined &&
    sanitized.incorrect !== undefined &&
    sanitized.questionsAnswered !== undefined &&
    sanitized.correct + sanitized.incorrect > sanitized.questionsAnswered
  ) {
    errors.push('correct + incorrect cannot exceed questionsAnswered');
  }

  return { valid: errors.length === 0, errors, sanitized };
}

module.exports = { OVERRIDE_FIELDS, computeAggregate, parseOverrides, getMergedStats, validateOverrides };
