import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestDb } = require('./helpers/testDb');
const { createRepositories } = require('../repositories');
const { loadTree, seedCategories } = require('../lib/categoryCatalog');
const { importLegacy } = require('../lib/legacyImport');

const ADMIN = '11111111-1111-4111-8111-111111111111';
const PLAYER = '22222222-2222-4222-8222-222222222222';
const DISCORD = '33333333-3333-4333-8333-333333333333';
const PLACEHOLDER = '44444444-4444-4444-8444-444444444444';

const legacyData = () => ({
  users: [
    { id: ADMIN, provider: 'google', provider_id: 'g-admin', email: 'boss@example.com', name: 'Boss', created_at: '2026-01-01T10:00:00.000Z', is_admin: 1, status: 'active', is_verified_identity: 1 },
    { id: PLAYER, provider: 'google', provider_id: 'g-player', email: 'p@example.com', name: 'Player', created_at: '2026-01-02T10:00:00.000Z', is_admin: 0, status: 'active', is_verified_identity: 1, stat_overrides: '{"bestScore":777}' },
    { id: DISCORD, provider: 'discord', provider_id: 'd-1', email: null, name: 'Disc', created_at: '2026-01-03T10:00:00.000Z', is_admin: 0, status: 'disabled', is_verified_identity: 1 },
    { id: PLACEHOLDER, provider: 'manual', provider_id: 'admin-created:abc', email: 'x@example.com', name: 'Placeholder', created_at: '2026-01-04T10:00:00.000Z', is_admin: 0, status: 'active', is_verified_identity: 0, created_by_admin: ADMIN },
    { id: 'not-a-uuid', provider: 'google', provider_id: 'g-odd', email: null, name: 'Odd Id', created_at: '2026-01-05T10:00:00.000Z', is_admin: 0, status: 'active' },
  ],
  games: [
    { id: 1, user_id: PLAYER, category_id: 'europe', difficulty: 'easy', score: 400, correct: 8, incorrect: 2, total_questions: 10, best_streak: 5, duration_seconds: 60, reason: null, created_at: '2026-02-01T10:00:00.000Z' },
    { id: 2, user_id: PLAYER, category_id: 'world-1914', difficulty: 'hard', score: 900, correct: 9, incorrect: 1, total_questions: 10, best_streak: 9, duration_seconds: 90, reason: 'finished', created_at: '2026-02-02T10:00:00.000Z' },
    { id: 3, user_id: 'ghost-user', category_id: 'asia', difficulty: 'easy', score: 1, correct: 1, incorrect: 0, total_questions: 1, best_streak: 1, duration_seconds: 1, created_at: '2026-02-03T10:00:00.000Z' },
  ],
  transactions: [
    { id: 7, user_id: PLAYER, category_id: 'world-1914', provider: 'stripe', provider_session_id: 'cs_1', provider_payment_intent_id: 'pi_1', amount_cents: 200, currency: 'usd', status: 'completed', created_at: '2026-02-01T09:00:00.000Z', completed_at: '2026-02-01T09:01:00.000Z' },
  ],
  entitlements: [
    { id: 1, user_id: PLAYER, category_id: 'world-1914', transaction_id: 7, status: 'active', purchased_at: '2026-02-01T09:01:00.000Z' },
    { id: 2, user_id: PLAYER, category_id: 'discontinued-pack', transaction_id: null, status: 'active', purchased_at: '2026-02-01T09:01:00.000Z' },
  ],
  multiplayerGames: [
    { id: 1, host_user_id: PLAYER, category_id: 'asia', difficulty: 'easy', total_questions: 4, guessing_order: 'written', player_count: 2, players_json: '[{"name":"A","score":1},{"name":"B","score":2}]', created_at: '2026-02-05T10:00:00.000Z' },
  ],
  auditLog: [{ id: 1, admin_id: ADMIN, action: 'MODIFY_USER', target_user_id: PLAYER, summary: 'stat overrides updated', created_at: '2026-02-06T10:00:00.000Z' }],
  paidCategories: [
    { category_id: 'world-1914', name: 'World 1914', description: 'custom text', price_cents: 350, currency: 'usd', enabled: 1, premium: 1 },
    { category_id: 'world-1991', name: 'World 1991', description: null, price_cents: 0, currency: 'usd', enabled: 0, premium: 0 },
    { category_id: 'retired', name: 'Retired', description: null, price_cents: 100, currency: 'usd', enabled: 1, premium: 1 },
  ],
});

let db;
let repos;
beforeEach(async () => {
  db = await createTestDb();
  repos = createRepositories(db);
  await seedCategories(repos, loadTree());
});
afterEach(() => db.end());

describe('importing the previous SQLite data', () => {
  it('preserves users, sign-in identities, history, purchases and admin edits', async () => {
    const summary = await importLegacy(db, legacyData(), { log: () => {} });
    expect(summary).toMatchObject({ users: 5, identities: 4, games: 2, transactions: 1, entitlements: 1, multiplayerGames: 1, auditEntries: 1, categoriesUpdated: 2 });

    // ids, admin flags, status and overrides survive
    const admin = await repos.users.findById(ADMIN);
    expect(admin).toMatchObject({ name: 'Boss', isAdmin: true, status: 'active' });
    expect(admin.createdAt.toISOString()).toBe('2026-01-01T10:00:00.000Z');
    expect((await repos.users.findById(PLAYER)).statOverrides).toEqual({ bestScore: 777 });
    expect((await repos.users.findById(DISCORD)).status).toBe('disabled');

    // the same Google/Discord accounts still sign in to the same users
    expect((await repos.identities.find('google', 'g-player')).userId).toBe(PLAYER);
    expect((await repos.identities.find('discord', 'd-1')).userId).toBe(DISCORD);
    // an admin-created placeholder gets NO identity and keeps its creator
    expect(await repos.identities.listForUser(PLACEHOLDER)).toEqual([]);
    const ph = await repos.users.findById(PLACEHOLDER);
    expect(ph).toMatchObject({ isVerifiedIdentity: false, createdByAdmin: ADMIN });

    // history
    const cats = await repos.games.perCategory(PLAYER);
    expect(cats.find((c) => c.categoryId === 'world-1914')).toMatchObject({ bestScore: 900, questionsAnswered: 10 });
    expect((await repos.multiplayer.listForHost(PLAYER, 10))[0].players).toEqual([{ name: 'A', score: 1 }, { name: 'B', score: 2 }]);

    // purchases: transaction, entitlement and their link
    expect((await repos.commerce.findBySession('cs_1'))).toMatchObject({ status: 'completed', amountCents: 200, userId: PLAYER });
    expect(await repos.commerce.hasEntitlement(PLAYER, 'world-1914')).toBe(true);
    const { rows } = await db.query('SELECT transaction_id FROM entitlements WHERE user_id = $1', [PLAYER]);
    expect(rows[0].transaction_id).not.toBeNull();

    // admin edits to categories
    expect(await repos.categories.get('world-1914')).toMatchObject({ type: 'paid', priceCents: 350, description: 'custom text' });
    expect(await repos.categories.get('world-1991')).toMatchObject({ type: 'default', enabled: false });

    // audit trail
    expect((await repos.audit.recent(5))[0]).toMatchObject({ action: 'MODIFY_USER', targetUserId: PLAYER });
  });

  it('maps a non-UUID legacy id to a fresh id and keeps its data linked', async () => {
    await importLegacy(db, legacyData(), { log: () => {} });
    const identity = await repos.identities.find('google', 'g-odd');
    expect(identity.userId).toMatch(/^[0-9a-f-]{36}$/);
    expect((await repos.users.findById(identity.userId)).name).toBe('Odd Id');
  });

  it('reports (never silently drops) rows it cannot import', async () => {
    const summary = await importLegacy(db, legacyData(), { log: () => {} });
    const text = summary.warnings.join('\n');
    expect(text).toMatch(/game 3/);
    expect(text).toMatch(/discontinued-pack/);
    expect(text).toMatch(/"retired"/);
  });

  it('refuses to import into a database that already has users or games', async () => {
    await repos.users.create({ name: 'Existing' });
    await expect(importLegacy(db, legacyData(), { log: () => {} })).rejects.toThrow(/already contains/);
  });

  it('is all-or-nothing: a failure leaves the database untouched', async () => {
    const bad = legacyData();
    bad.games[0].score = null; // violates NOT NULL
    await expect(importLegacy(db, bad, { log: () => {} })).rejects.toThrow();
    expect((await repos.users.counts()).total).toBe(0);
    expect(await repos.categories.get('world-1914')).toMatchObject({ priceCents: 200 }); // untouched too
  });

  it('cannot leave a paid category without a price', async () => {
    const data = legacyData();
    data.paidCategories = [{ category_id: 'world-1914', price_cents: 0, premium: 1, enabled: 1 }];
    await importLegacy(db, data, { log: () => {} });
    expect((await repos.categories.get('world-1914')).type).toBe('default');
  });
});
