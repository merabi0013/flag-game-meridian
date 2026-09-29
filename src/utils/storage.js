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

  const cat = stats.categoryStats[result.categoryId] || { asked: 0, correct: 0 };
  cat.asked += result.totalQuestions;
  cat.correct += result.correct;
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
