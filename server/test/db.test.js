import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestDb } = require('./helpers/testDb');
const { migrate } = require('../db/migrate');
const { createRepositories } = require('../repositories');
const { loadTree, seedCategories, flattenTree } = require('../lib/categoryCatalog');
const { loadConfig, validateConfig } = require('../config');
const { hashToken } = require('../auth/tokens');

let db;
let repos;
beforeAll(async () => {
  db = await createTestDb();
  repos = createRepositories(db);
  await seedCategories(repos, loadTree());
});
afterAll(() => db.end());

describe('migrations', () => {
  it('run once each and are recorded', async () => {
    const { rows } = await db.query('SELECT version FROM schema_migrations ORDER BY version');
    expect(rows.map((r) => r.version)).toContain('001_initial');
    expect(await migrate(db, { log: () => {} })).toEqual([]); // second run applies nothing
  });

  it('create the expected tables', async () => {
    const { rows } = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()");
    const names = rows.map((r) => r.table_name);
    for (const table of ['users', 'auth_identities', 'sessions', 'one_time_codes', 'categories', 'games', 'multiplayer_games', 'transactions', 'entitlements', 'admin_audit_log']) {
      expect(names).toContain(table);
    }
  });
});

describe('users and identities', () => {
  it('stores the required user fields', async () => {
    const u = await repos.users.create({ name: 'Ada', email: 'ada@example.com' });
    expect(u.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(u).toMatchObject({ name: 'Ada', status: 'active', isAdmin: false });
    expect(u.createdAt).toBeInstanceOf(Date);
    expect(u.lastLoginAt).toBeNull();
    await repos.users.touchLogin(u.id);
    expect((await repos.users.findById(u.id)).lastLoginAt).toBeInstanceOf(Date);
  });

  it('allows one user several providers but one owner per provider account', async () => {
    const u = await repos.users.create({ name: 'Multi' });
    const other = await repos.users.create({ name: 'Other' });
    await repos.identities.create({ userId: u.id, provider: 'google', providerAccountId: 'G1' });
    await repos.identities.create({ userId: u.id, provider: 'discord', providerAccountId: 'D1' });
    expect((await repos.identities.listForUser(u.id)).map((i) => i.provider)).toEqual(['google', 'discord']);
    expect(await repos.identities.create({ userId: other.id, provider: 'google', providerAccountId: 'G1' })).toBeNull();
    expect((await repos.identities.find('google', 'G1')).userId).toBe(u.id);
    // the same account id under a different provider is a different identity
    expect(await repos.identities.create({ userId: other.id, provider: 'discord', providerAccountId: 'G1' })).not.toBeNull();
  });

  it('only updates allow-listed fields', async () => {
    const u = await repos.users.create({ name: 'Edit' });
    await expect(repos.users.update(u.id, { isAdmin: true })).rejects.toThrow(/not editable/);
    const updated = await repos.users.update(u.id, { name: 'Edited', statOverrides: { gamesPlayed: 3 } });
    expect(updated).toMatchObject({ name: 'Edited', statOverrides: { gamesPlayed: 3 } });
    expect((await repos.users.update(u.id, { statOverrides: null })).statOverrides).toBeNull();
  });

  it('cascades a user delete to their data but keeps payment records', async () => {
    const u = await repos.users.create({ name: 'Doomed' });
    await repos.identities.create({ userId: u.id, provider: 'google', providerAccountId: 'DOOM' });
    await repos.games.insert(u.id, { categoryId: 'europe', difficulty: 'easy', score: 1, correct: 1, incorrect: 0, totalQuestions: 1, bestStreak: 1, durationSeconds: 1 });
    await repos.commerce.insertCompleted({ userId: u.id, categoryId: 'world-1914', providerSessionId: 'cs_doom', paymentIntentId: null, amountCents: 200, currency: 'usd' });
    await repos.users.remove(u.id);
    expect(await repos.identities.find('google', 'DOOM')).toBeNull();
    expect(await repos.games.perCategory(u.id)).toEqual([]);
    expect((await repos.commerce.findBySession('cs_doom')).userId).toBeNull();
  });
});

describe('games', () => {
  it('aggregates in SQL per category with integer results', async () => {
    const u = await repos.users.create({ name: 'Player' });
    const g = (o) => ({ categoryId: 'europe', difficulty: 'easy', score: 100, correct: 1, incorrect: 1, totalQuestions: 2, bestStreak: 1, durationSeconds: 5, ...o });
    await repos.games.insert(u.id, g({ score: 100 }));
    await repos.games.insert(u.id, g({ score: 300, bestStreak: 4 }));
    await repos.games.insert(u.id, g({ categoryId: 'asia' }));
    const rows = await repos.games.perCategory(u.id);
    const europe = rows.find((r) => r.categoryId === 'europe');
    expect(europe).toMatchObject({ gamesPlayed: 2, questionsAnswered: 4, correct: 2, bestScore: 300, bestStreak: 4, totalScore: 400 });
    expect(typeof europe.gamesPlayed).toBe('number');
    expect(rows).toHaveLength(2);
    expect((await repos.games.recent(u.id, 2))).toHaveLength(2);
  });

  it('accepts games for categories that are not in the categories table (history outlives categories)', async () => {
    const u = await repos.users.create({ name: 'Historian' });
    await repos.games.insert(u.id, { categoryId: 'long-gone', difficulty: 'easy', score: 1, correct: 1, incorrect: 0, totalQuestions: 1, bestStreak: 1, durationSeconds: 1 });
    expect((await repos.games.perCategory(u.id))[0].categoryId).toBe('long-gone');
  });
});

describe('categories table', () => {
  it('holds one row per tree leaf with the tree defaults', async () => {
    const rows = await repos.categories.list();
    expect(rows).toHaveLength(flattenTree(loadTree()).length);
    expect(rows.find((c) => c.id === 'world-1914')).toMatchObject({ type: 'paid', priceCents: 200, enabled: true });
  });

  it('rejects an invalid type at the database level', async () => {
    await expect(db.query("UPDATE categories SET type = 'premium' WHERE id = 'europe'")).rejects.toThrow();
  });

  it('rejects unknown editable fields', async () => {
    await expect(repos.categories.update('europe', { flagSource: {} })).rejects.toThrow(/not editable/);
  });
});

describe('sessions and one-time codes', () => {
  it('consume a code exactly once, atomically, even when raced', async () => {
    const u = await repos.users.create({ name: 'Racer' });
    await repos.sessions.createCode({ codeHash: hashToken('race'), userId: u.id, purpose: 'login', ttlSeconds: 60 });
    const results = await Promise.all([1, 2, 3, 4].map(() => repos.sessions.consumeCode(hashToken('race'), 'login')));
    expect(results.filter(Boolean)).toEqual([u.id]);
  });
});

describe('transactions', () => {
  it('rejects a duplicate provider session', async () => {
    const u = await repos.users.create({ name: 'Buyer' });
    const tx = { userId: u.id, categoryId: 'world-1914', providerSessionId: 'cs_dup', amountCents: 200, currency: 'usd' };
    await repos.commerce.insertPending(tx);
    await expect(repos.commerce.insertPending(tx)).rejects.toThrow();
  });

  it('enforce one entitlement per user and category', async () => {
    const u = await repos.users.create({ name: 'Owner' });
    await repos.commerce.grant({ userId: u.id, categoryId: 'world-1914', transactionId: null });
    await repos.commerce.grant({ userId: u.id, categoryId: 'world-1914', transactionId: null });
    expect([...(await repos.commerce.ownedCategoryIds(u.id))]).toEqual(['world-1914']);
  });
});

describe('transactions in db.tx', () => {
  it('roll back on error', async () => {
    const before = (await repos.users.counts()).total;
    await expect(
      db.tx(async (q) => {
        await repos.users.create({ name: 'Ghost' }, q);
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect((await repos.users.counts()).total).toBe(before);
  });
});

describe('configuration', () => {
  it('reads every setting from one place and validates production requirements', () => {
    const dev = loadConfig({ DATABASE_URL: 'postgres://x' });
    expect(validateConfig(dev)).toEqual([]);
    expect(validateConfig(loadConfig({}))[0]).toMatch(/DATABASE_URL/);
    const prod = loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', SESSION_SECRET: 'short', CLIENT_URL: 'https://u.github.io/repo', API_PUBLIC_URL: 'http://api.example.com' });
    const problems = validateConfig(prod).join('\n');
    expect(problems).toMatch(/SESSION_SECRET/);
    expect(problems).toMatch(/API_PUBLIC_URL/);
    const good = loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', SESSION_SECRET: 'z'.repeat(40), CLIENT_URL: 'https://u.github.io/repo/', API_PUBLIC_URL: 'https://api.example.com/' });
    expect(validateConfig(good)).toEqual([]);
    expect(good.clientUrl).toBe('https://u.github.io/repo');
    expect(good.clientOrigin).toBe('https://u.github.io');
    expect(good.allowedOrigins).toEqual(['https://u.github.io']); // no dev origins in production
    expect(good.providers.google.callbackUrl).toBe('https://api.example.com/auth/google/callback');
  });

  it('lets a callback URL be overridden per provider', () => {
    const c = loadConfig({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b', GOOGLE_CALLBACK_URL: 'https://x.example/cb' });
    expect(c.providers.google).toMatchObject({ configured: true, callbackUrl: 'https://x.example/cb' });
    expect(c.providers.discord.configured).toBe(false);
  });
});
