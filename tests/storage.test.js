import { describe, it, expect, beforeEach } from 'vitest';
import { readGuestStats, recordGuestGame, upgradeCategoryEntry, accuracy } from '../src/utils/storage';

const memory = () => {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
};
beforeEach(() => {
  globalThis.localStorage = memory();
});

const game = (o = {}) => ({ categoryId: 'europe', difficulty: 'easy', correct: 8, incorrect: 2, score: 400, bestStreak: 5, totalQuestions: 10, ...o });

describe('guest statistics are recorded per category', () => {
  it('records games, questions, correct, best score and best streak for the category played', () => {
    recordGuestGame(game());
    recordGuestGame(game({ correct: 4, incorrect: 6, score: 200, bestStreak: 2 }));
    recordGuestGame(game({ categoryId: 'world-1914', score: 900, correct: 9, incorrect: 1, bestStreak: 9 }));
    const { categoryStats } = readGuestStats();
    expect(categoryStats.europe).toMatchObject({ gamesPlayed: 2, questionsAnswered: 20, correct: 12, incorrect: 8, totalScore: 600, bestScore: 400, bestStreak: 5, asked: 20, partial: false });
    expect(categoryStats['world-1914']).toMatchObject({ gamesPlayed: 1, bestScore: 900, bestStreak: 9 });
  });

  it('keeps the overall totals correct alongside', () => {
    recordGuestGame(game());
    recordGuestGame(game({ categoryId: 'asia', correct: 2, incorrect: 8, score: 100 }));
    const stats = readGuestStats();
    expect(stats).toMatchObject({ gamesPlayed: 2, questionsAnswered: 20, correct: 10, totalScore: 500, bestScore: 400 });
    expect(accuracy(stats)).toBe(50);
  });

  it('works for a category id it has never seen (no category-specific code)', () => {
    recordGuestGame(game({ categoryId: 'brand-new-category' }));
    expect(readGuestStats().categoryStats['brand-new-category'].gamesPlayed).toBe(1);
  });
});

describe('existing guest records stay usable', () => {
  it('upgrades a legacy { asked, correct } entry in place without losing it', () => {
    localStorage.setItem(
      'meridian_guest_stats_v1',
      JSON.stringify({ gamesPlayed: 3, questionsAnswered: 30, correct: 20, incorrect: 10, bestScore: 500, bestStreak: 6, totalScore: 900, categoryStats: { europe: { asked: 30, correct: 20 } }, recentGames: [{ categoryId: 'europe', difficulty: 'easy', score: 1, totalQuestions: 10, correct: 5, at: '2026-01-01T00:00:00.000Z' }] })
    );
    // reading alone changes nothing
    expect(readGuestStats().categoryStats.europe).toEqual({ asked: 30, correct: 20 });
    recordGuestGame(game());
    const stats = readGuestStats();
    expect(stats.categoryStats.europe).toMatchObject({ questionsAnswered: 40, correct: 28, asked: 40, gamesPlayed: 1, bestScore: 400, partial: true });
    expect(stats.gamesPlayed).toBe(4);
    expect(stats.recentGames).toHaveLength(2); // history kept
  });

  it('upgradeCategoryEntry handles missing, legacy and current entries', () => {
    expect(upgradeCategoryEntry(undefined)).toMatchObject({ gamesPlayed: 0, questionsAnswered: 0, partial: false });
    expect(upgradeCategoryEntry({ asked: 5, correct: 2 })).toMatchObject({ questionsAnswered: 5, correct: 2, gamesPlayed: 0, partial: true });
    const current = { gamesPlayed: 2, questionsAnswered: 4, correct: 1, incorrect: 3, totalScore: 1, bestScore: 1, bestStreak: 1, asked: 4 };
    expect(upgradeCategoryEntry(current)).toEqual(current);
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('meridian_guest_stats_v1', '{nope');
    expect(readGuestStats().gamesPlayed).toBe(0);
    expect(() => recordGuestGame(game())).not.toThrow();
  });
});
