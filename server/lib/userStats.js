/**
 * lib/userStats.js
 * -----------------------------------------------------------------------
 * The one definition of "how do we compute someone's stats". Used by
 * GET /api/me/stats and the admin user-detail endpoint.
 *
 * Everything is derived from the rows in `games`, grouped by category_id
 * in SQL (repositories/games.js). Nothing here names a category, so a new
 * category shows up in a profile the moment someone plays it.
 *
 * Per-category numbers (all computed, none stored):
 *   gamesPlayed, questionsAnswered, correct, incorrect, skipped,
 *   accuracy (% correct of questions), bestScore, bestStreak,
 *   averageScore (mean score per game)
 * plus the legacy `asked` / `correct` pair older clients read.
 *
 * Admin "modify game performance" never rewrites history: it stores an
 * override for exactly six top-line fields (OVERRIDE_FIELDS). Per-category
 * numbers and recent games are always the real computed values.
 * -----------------------------------------------------------------------
 */
const OVERRIDE_FIELDS = ['gamesPlayed', 'questionsAnswered', 'correct', 'incorrect', 'bestScore', 'bestStreak'];
const MAX_REASONABLE_VALUE = 10_000_000;

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

function categoryEntry(row) {
  return {
    gamesPlayed: row.gamesPlayed,
    questionsAnswered: row.questionsAnswered,
    correct: row.correct,
    incorrect: row.incorrect,
    skipped: row.skipped,
    accuracy: pct(row.correct, row.questionsAnswered),
    bestScore: row.bestScore,
    bestStreak: row.bestStreak,
    averageScore: row.gamesPlayed ? Math.round(row.totalScore / row.gamesPlayed) : 0,
    // Legacy shape, kept so an older cached frontend keeps rendering.
    asked: row.questionsAnswered,
  };
}

/** Pure: per-category rows -> { totals, categoryStats }. Exported for tests. */
function aggregate(rows) {
  const totals = { gamesPlayed: 0, questionsAnswered: 0, correct: 0, incorrect: 0, skipped: 0, totalScore: 0, bestScore: 0, bestStreak: 0 };
  const categoryStats = {};
  for (const r of rows) {
    totals.gamesPlayed += r.gamesPlayed;
    totals.questionsAnswered += r.questionsAnswered;
    totals.correct += r.correct;
    totals.incorrect += r.incorrect;
    totals.skipped += r.skipped;
    totals.totalScore += r.totalScore;
    totals.bestScore = Math.max(totals.bestScore, r.bestScore);
    totals.bestStreak = Math.max(totals.bestStreak, r.bestStreak);
    categoryStats[r.categoryId] = categoryEntry(r);
  }
  return { totals, categoryStats };
}

function cleanOverrides(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean = {};
  for (const f of OVERRIDE_FIELDS) if (Number.isInteger(raw[f])) clean[f] = raw[f];
  return clean;
}

function parseOverrides(user) {
  return cleanOverrides(user && user.statOverrides);
}

function makeUserStats(repos) {
  async function computeAggregate(userId) {
    const [rows, recentGames] = await Promise.all([repos.games.perCategory(userId), repos.games.recent(userId, 15)]);
    const { totals, categoryStats } = aggregate(rows);
    return { ...totals, categoryStats, recentGames };
  }

  /** Computed aggregate with admin overrides applied on top, field by field. */
  async function getMergedStats(user) {
    const computed = await computeAggregate(user.id);
    const overrides = parseOverrides(user);
    const merged = { ...computed, ...overrides };
    merged.accuracy = pct(merged.correct, merged.questionsAnswered);
    merged.averageScore = computed.gamesPlayed ? Math.round(computed.totalScore / computed.gamesPlayed) : 0;
    merged.hasOverrides = Object.keys(overrides).length > 0;
    return merged;
  }

  return { computeAggregate, getMergedStats };
}

/**
 * Validates a partial overrides object submitted by an admin: only the six
 * approved keys, each a non-negative integer (or null to clear), and
 * internally consistent. Unknown keys are rejected, not silently dropped.
 */
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
    if (value === null) {
      sanitized[key] = null; // explicit null clears that one override
      continue;
    }
    if (!Number.isInteger(value) || value < 0 || value > MAX_REASONABLE_VALUE) {
      errors.push(`${key} must be a non-negative integer`);
      continue;
    }
    sanitized[key] = value;
  }
  if (
    Number.isInteger(sanitized.correct) &&
    Number.isInteger(sanitized.incorrect) &&
    Number.isInteger(sanitized.questionsAnswered) &&
    sanitized.correct + sanitized.incorrect > sanitized.questionsAnswered
  ) {
    errors.push('correct + incorrect cannot exceed questionsAnswered');
  }
  return { valid: errors.length === 0, errors, sanitized };
}

module.exports = { OVERRIDE_FIELDS, aggregate, parseOverrides, validateOverrides, makeUserStats };
