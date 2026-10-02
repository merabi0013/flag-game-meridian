/**
 * storage.js
 * -----------------------------------------------------------------------
 * Ported from the previous vanilla-JS js/storage.js. The only
 * browser-specific piece is `localStorage` itself — everything else here
 * is plain data shaping. A future React Native port would swap the
 * localStorage calls for AsyncStorage and keep every function signature
 * identical.
 * -----------------------------------------------------------------------
 */
const GUEST_KEY = 'meridian_guest_stats_v1';

export function emptyStats() {
  return {
    gamesPlayed: 0,
    questionsAnswered: 0,
    correct: 0,
    incorrect: 0,
    bestScore: 0,
    bestStreak: 0,
    totalScore: 0,
    categoryStats: {},
    recentGames: [],
  };
}

/** Upgrades a stored per-category entry (missing, legacy {asked, correct}, or current) to the current shape. */
export function upgradeCategoryEntry(entry) {
  if (entry && Number.isFinite(entry.gamesPlayed)) return { ...entry };
  const legacyQuestions = entry ? entry.asked || 0 : 0;
  return {
    gamesPlayed: 0,
    questionsAnswered: legacyQuestions,
    correct: entry ? entry.correct || 0 : 0,
    incorrect: 0,
    skipped: 0,
    totalScore: 0,
    bestScore: 0,
    bestStreak: 0,
    asked: legacyQuestions,
    // Only true when older, less-detailed history is mixed in.
    partial: legacyQuestions > 0,
  };
}

export function readGuestStats() {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (!raw) return emptyStats();
    return { ...emptyStats(), ...JSON.parse(raw) };
  } catch (err) {
    console.warn('[storage] corrupt guest stats, resetting', err);
    return emptyStats();
  }
}

function writeGuestStats(stats) {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(stats));
  } catch (err) {
    console.warn('[storage] could not persist guest stats (storage full or disabled)', err);
  }
}

/** result: { categoryId, difficulty, correct, incorrect, score,
 *   bestStreak, totalQuestions, timedOut, durationSeconds, missed } */
export function recordGuestGame(result) {
  const stats = readGuestStats();
  stats.gamesPlayed += 1;
  stats.questionsAnswered += result.totalQuestions;
  stats.correct += result.correct;
  stats.incorrect += result.incorrect;
  stats.totalScore += result.score;
  stats.bestScore = Math.max(stats.bestScore, result.score);
  stats.bestStreak = Math.max(stats.bestStreak, result.bestStreak);

  // Per-category record, keyed by whatever category id was played (nothing
  // here knows about specific categories). Entries written by older
  // versions only have { asked, correct }; they are upgraded in place and
  // flagged `partial` because the detailed metrics only cover games
  // recorded since.
  const previous = stats.categoryStats[result.categoryId];
  const cat = upgradeCategoryEntry(previous);
  cat.gamesPlayed += 1;
  cat.questionsAnswered += result.totalQuestions;
  cat.correct += result.correct;
  cat.incorrect += result.incorrect;
  cat.skipped += result.skipped || 0;
  cat.totalScore += result.score;
  cat.bestScore = Math.max(cat.bestScore, result.score);
  cat.bestStreak = Math.max(cat.bestStreak, result.bestStreak);
  cat.asked = cat.questionsAnswered; // legacy field, kept for compatibility
  stats.categoryStats[result.categoryId] = cat;

  stats.recentGames.unshift({
    categoryId: result.categoryId,
    difficulty: result.difficulty,
    score: result.score,
    totalQuestions: result.totalQuestions,
    correct: result.correct,
    at: new Date().toISOString(),
  });
  stats.recentGames = stats.recentGames.slice(0, 15);

  writeGuestStats(stats);
  return stats;
}

export function clearGuestStats() {
  localStorage.removeItem(GUEST_KEY);
}

export function accuracy(stats) {
  if (!stats.questionsAnswered) return 0;
  return Math.round((stats.correct / stats.questionsAnswered) * 100);
}
