import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestApp } = require('./helpers/testApp');
const { aggregate, validateOverrides } = require('../lib/userStats');

let t;
let admin;
beforeAll(async () => {
  t = await createTestApp();
  admin = await t.makeAdmin();
});
afterAll(() => t.close());

const game = (over = {}) => ({
  categoryId: 'europe',
  difficulty: 'normal',
  score: 500,
  correct: 5,
  incorrect: 5,
  totalQuestions: 10,
  bestStreak: 3,
  durationSeconds: 60,
  ...over,
});

describe('recording games', () => {
  it('requires sign-in', async () => {
    expect((await t.client.post('/api/games', game())).status).toBe(401);
  });

  it('stores a valid game for the signed-in user (never a client-supplied user id)', async () => {
    const a = await t.login('google', t.profiles.google('rec-a'));
    const b = await t.login('google', t.profiles.google('rec-b'));
    const res = await t.client.post('/api/games', game({ userId: b.user.id, user_id: b.user.id }), { token: a.token });
    expect(res.status).toBe(201);
    expect((await t.client.get('/api/me/stats', { token: a.token })).json.gamesPlayed).toBe(1);
    expect((await t.client.get('/api/me/stats', { token: b.token })).json.gamesPlayed).toBe(0);
  });

  it('stores skipped flags', async () => {
    const u = await t.login('google', t.profiles.google('rec-skip'));
    await t.client.post('/api/games', game({ skipped: 4 }), { token: u.token });
    const s = (await t.client.get('/api/me/stats', { token: u.token })).json;
    expect(s.skipped).toBe(4);
    expect(s.categoryStats.europe.skipped).toBe(4);
  });

  it.each([
    ['unknown category', { categoryId: 'atlantis' }, 400],
    ['no category', { categoryId: '' }, 400],
    ['bad difficulty', { difficulty: 'nightmare' }, 400],
    ['too many questions', { totalQuestions: 5000 }, 400],
    ['correct > total', { correct: 11 }, 400],
    ['correct + incorrect > total', { correct: 8, incorrect: 8 }, 400],
    ['impossible score', { score: 999999 }, 400],
    ['negative streak', { bestStreak: -1 }, 400],
    ['string score', { score: 'lots' }, 400],
    ['negative skipped', { skipped: -2 }, 400],
  ])('rejects %s', async (_name, over, status) => {
    const u = await t.login('google', t.profiles.google('rec-bad'));
    const res = await t.client.post('/api/games', game(over), { token: u.token });
    expect(res.status).toBe(status);
    expect((await t.client.get('/api/me/stats', { token: u.token })).json.gamesPlayed).toBe(0);
  });

  it('records a game for a paid category only for someone who owns it', async () => {
    const u = await t.login('google', t.profiles.google('rec-paid'));
    expect((await t.client.post('/api/games', game({ categoryId: 'world-1914' }), { token: u.token })).status).toBe(403);
    await t.repos.commerce.grant({ userId: u.user.id, categoryId: 'world-1914', transactionId: null });
    expect((await t.client.post('/api/games', game({ categoryId: 'world-1914' }), { token: u.token })).status).toBe(201);
  });

  it('records multiplayer games and lists them back for the host', async () => {
    const u = await t.login('google', t.profiles.google('mp-host'));
    const players = [
      { name: 'Ann', score: 300, correct: 3, incorrect: 2, bestStreak: 2, totalTimeMs: 1000 },
      { name: 'Bob', score: 200, correct: 2, incorrect: 3, bestStreak: 1, totalTimeMs: 1200 },
    ];
    const body = { categoryId: 'asia', difficulty: 'easy', guessingOrder: 'written', totalQuestions: 10, players };
    expect((await t.client.post('/api/multiplayer-games', body, { token: u.token })).status).toBe(201);
    expect((await t.client.post('/api/multiplayer-games', { ...body, totalQuestions: 9 }, { token: u.token })).status).toBe(400);
    expect((await t.client.post('/api/multiplayer-games', { ...body, categoryId: 'atlantis' }, { token: u.token })).status).toBe(400);
    const list = await t.client.get('/api/me/multiplayer-games', { token: u.token });
    expect(list.json.games).toHaveLength(1);
    expect(list.json.games[0]).toMatchObject({ categoryId: 'asia', playerCount: 2, players });
    // solo stats are unaffected
    expect((await t.client.get('/api/me/stats', { token: u.token })).json.gamesPlayed).toBe(0);
  });
});

describe('profile statistics are separated by category', () => {
  it('computes games, questions, accuracy, best score, best streak and average per category', async () => {
    const u = await t.login('google', t.profiles.google('percat'));
    const post = (over) => t.client.post('/api/games', game(over), { token: u.token });
    await post({ categoryId: 'europe', score: 400, correct: 8, incorrect: 2, bestStreak: 5 });
    await post({ categoryId: 'europe', score: 200, correct: 4, incorrect: 6, bestStreak: 2 });
    await post({ categoryId: 'asia', score: 900, correct: 9, incorrect: 1, bestStreak: 9 });
    await post({ categoryId: 'world', score: 100, correct: 1, incorrect: 9, bestStreak: 1 });

    const s = (await t.client.get('/api/me/stats', { token: u.token })).json;
    expect(s.categoryStats.europe).toMatchObject({
      gamesPlayed: 2, questionsAnswered: 20, correct: 12, incorrect: 8, accuracy: 60, bestScore: 400, bestStreak: 5, averageScore: 300,
    });
    expect(s.categoryStats.asia).toMatchObject({ gamesPlayed: 1, questionsAnswered: 10, correct: 9, accuracy: 90, bestScore: 900, bestStreak: 9, averageScore: 900 });
    expect(s.categoryStats.world).toMatchObject({ gamesPlayed: 1, accuracy: 10 });
    expect(Object.keys(s.categoryStats).sort()).toEqual(['asia', 'europe', 'world']); // only categories actually played
    // legacy fields still present for older clients
    expect(s.categoryStats.europe).toMatchObject({ asked: 20, correct: 12 });
    // overall
    expect(s).toMatchObject({ gamesPlayed: 4, questionsAnswered: 40, correct: 22, incorrect: 18, bestScore: 900, bestStreak: 9, accuracy: 55 });
    expect(s.recentGames).toHaveLength(4);
  });

  it("keeps one user's statistics out of another's", async () => {
    const a = await t.login('google', t.profiles.google('iso-a'));
    const b = await t.login('google', t.profiles.google('iso-b'));
    await t.client.post('/api/games', game({ categoryId: 'africa' }), { token: a.token });
    expect((await t.client.get('/api/me/stats', { token: b.token })).json.categoryStats).toEqual({});
  });

  it('still reports history for a category that has since left the tree', async () => {
    const u = await t.login('google', t.profiles.google('retired'));
    await t.repos.games.insert(u.user.id, { categoryId: 'retired-cat', difficulty: 'easy', score: 10, correct: 1, incorrect: 0, totalQuestions: 1, bestStreak: 1, durationSeconds: 1 });
    const s = (await t.client.get('/api/me/stats', { token: u.token })).json;
    expect(s.categoryStats['retired-cat'].gamesPlayed).toBe(1);
  });

  it('aggregate() is pure and handles no games', () => {
    expect(aggregate([])).toEqual({
      totals: { gamesPlayed: 0, questionsAnswered: 0, correct: 0, incorrect: 0, skipped: 0, totalScore: 0, bestScore: 0, bestStreak: 0 },
      categoryStats: {},
    });
  });

  it('requires sign-in', async () => {
    expect((await t.client.get('/api/me/stats')).status).toBe(401);
  });
});

describe('admin stat overrides', () => {
  it('only touch the six approved top-line fields, never per-category numbers', async () => {
    const u = await t.login('google', t.profiles.google('override'));
    await t.client.post('/api/games', game({ categoryId: 'europe' }), { token: u.token });
    const res = await t.client.patch(`/api/admin/users/${u.user.id}`, { statOverrides: { gamesPlayed: 99, bestScore: 12345 } }, { token: admin.token });
    expect(res.status).toBe(200);
    const s = (await t.client.get('/api/me/stats', { token: u.token })).json;
    expect(s).toMatchObject({ gamesPlayed: 99, bestScore: 12345, hasOverrides: true });
    expect(s.categoryStats.europe.gamesPlayed).toBe(1); // real, computed
    // clearing one override
    await t.client.patch(`/api/admin/users/${u.user.id}`, { statOverrides: { gamesPlayed: null } }, { token: admin.token });
    const s2 = (await t.client.get('/api/me/stats', { token: u.token })).json;
    expect(s2.gamesPlayed).toBe(1);
    expect(s2.bestScore).toBe(12345);
  });

  it('are validated', () => {
    expect(validateOverrides({ correct: -1 }).valid).toBe(false);
    expect(validateOverrides({ nope: 1 }).errors[0]).toMatch(/Unknown/);
    expect(validateOverrides({ correct: 5, incorrect: 5, questionsAnswered: 4 }).valid).toBe(false);
    expect(validateOverrides({ correct: 1.5 }).valid).toBe(false);
    expect(validateOverrides([]).valid).toBe(false);
    expect(validateOverrides(null)).toMatchObject({ valid: true, sanitized: null });
  });
});
