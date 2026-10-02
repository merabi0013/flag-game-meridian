import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestApp } = require('./helpers/testApp');
const { loadTree, validateTree, flattenTree, seedCategories, flagNumberFor, loadRemoteDataset } = require('../lib/categoryCatalog');
const { makeAccess } = require('../lib/access');

const LEGACY_IDS = [
  'world',
  'europe', 'asia', 'eurasia', 'africa', 'north-america', 'south-america', 'oceania',
  'middle-east', 'western-europe', 'northern-europe', 'southern-europe', 'eastern-europe', 'central-europe', 'caucasus',
  'southeast-asia', 'east-asia', 'south-asia', 'central-asia', 'north-africa', 'sub-saharan-africa',
  'central-america', 'caribbean', 'south-america-region', 'north-america-region', 'oceania-region',
  'world-1914', 'world-1991', 'world-1945',
];

const clone = (o) => JSON.parse(JSON.stringify(o));

describe('the shipped category tree', () => {
  const tree = loadTree();
  const leaves = flattenTree(tree);

  it('is valid', () => {
    expect(validateTree(tree)).toEqual([]);
  });

  it('is a two-level tree: groups containing categories', () => {
    expect(tree.groups.map((g) => g.id)).toEqual(['world', 'continents', 'regions', 'historical']);
    for (const g of tree.groups) for (const c of g.categories) expect(c.categories).toBeUndefined();
  });

  it('preserves every existing category id (game history keys on these)', () => {
    expect(leaves.map((l) => l.id).sort()).toEqual([...LEGACY_IDS].sort());
  });

  it('gives every leaf a name, a type and a flag source', () => {
    for (const l of leaves) {
      expect(l.name).toBeTruthy();
      expect(['default', 'paid']).toContain(l.type);
      expect(['bundled', 'remote']).toContain(l.flagSource.kind);
    }
  });

  it('derives flagNumber from the dataset for server-hosted categories', () => {
    for (const l of leaves.filter((x) => x.flagSource.kind === 'remote')) {
      expect(flagNumberFor(l)).toBe(loadRemoteDataset(l.flagSource.dataset).length);
      expect(flagNumberFor(l)).toBeGreaterThan(0);
    }
    // bundled counts live in the frontend dataset, so the server reports null
    expect(flagNumberFor(leaves.find((l) => l.id === 'europe'))).toBeNull();
  });
});

describe('tree validation', () => {
  const base = () => clone(loadTree());

  it('rejects duplicate category ids', () => {
    const t = base();
    t.groups[1].categories.push(clone(t.groups[1].categories[0]));
    expect(validateTree(t).join()).toMatch(/duplicate category id/);
  });

  it('rejects an unknown type', () => {
    const t = base();
    t.groups[0].categories[0].type = 'premium';
    expect(validateTree(t).join()).toMatch(/type must be/);
  });

  it('rejects a paid category whose flags are bundled in the public app', () => {
    const t = base();
    t.groups[1].categories[0].type = 'paid';
    t.groups[1].categories[0].priceCents = 100;
    expect(validateTree(t).join()).toMatch(/only remote/);
  });

  it('rejects a paid category with no price', () => {
    const t = base();
    const paid = t.groups[3].categories.find((c) => c.type === 'paid');
    delete paid.priceCents;
    expect(validateTree(t).join()).toMatch(/priceCents/);
  });

  it('rejects a remote source without a dataset, and path-like dataset names', () => {
    const t = base();
    t.groups[3].categories[1].flagSource = { kind: 'remote', dataset: '../secrets' };
    expect(validateTree(t).join()).toMatch(/dataset/);
    expect(loadRemoteDataset('../../package')).toBeNull();
  });

  it('rejects malformed ids and missing names', () => {
    const t = base();
    t.groups[0].categories[0].id = 'Bad Id';
    t.groups[0].categories[0].name = '';
    const problems = validateTree(t).join();
    expect(problems).toMatch(/id invalid/);
    expect(problems).toMatch(/needs a name/);
  });
});

describe('category configuration lives in the database', () => {
  let t;
  let admin;
  beforeAll(async () => {
    t = await createTestApp();
    admin = await t.makeAdmin();
  });
  afterAll(() => t.close());

  const flat = (json) => json.groups.flatMap((g) => g.categories);

  it('seeds every leaf and serves the tree publicly with the server-side type', async () => {
    const res = await t.client.get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.json.groups.map((g) => g.id)).toEqual(['world', 'continents', 'regions', 'historical']);
    const all = flat(res.json);
    expect(all.map((c) => c.id).sort()).toEqual([...LEGACY_IDS].sort());
    const by = Object.fromEntries(all.map((c) => [c.id, c]));
    expect(by['world-1914']).toMatchObject({ type: 'paid', priceCents: 200, hosting: 'remote', enabled: true });
    expect(by['world-1991']).toMatchObject({ type: 'default', hosting: 'remote' });
    expect(by.europe).toMatchObject({ type: 'default', hosting: 'bundled' });
    expect(by['world-1991'].flagNumber).toBe(loadRemoteDataset('world-1991').length);
    // no internals leak
    expect(JSON.stringify(res.json)).not.toMatch(/flagSource|dataset/);
  });

  it('serves free server-hosted flags to guests and refuses paid ones', async () => {
    const free = await t.client.get('/api/categories/world-1991/countries');
    expect(free.status).toBe(200);
    expect(free.json.countries.length).toBe(loadRemoteDataset('world-1991').length);
    expect((await t.client.get('/api/categories/world-1914/countries')).status).toBe(401);
    expect((await t.client.get('/api/categories/nope/countries')).status).toBe(404);
    expect((await t.client.get('/api/categories/europe/countries')).status).toBe(404); // bundled: nothing to serve
    expect((await t.client.get('/api/categories/..%2F..%2Fpackage/countries')).status).toBe(404);
  });

  it('refuses paid flags to a signed-in user without an entitlement, allows them with one, and admins always', async () => {
    const u = await t.login('google', t.profiles.google('cat-user'));
    expect((await t.client.get('/api/categories/world-1914/countries', { token: u.token })).status).toBe(403);
    await t.repos.commerce.grant({ userId: u.user.id, categoryId: 'world-1914', transactionId: null });
    expect((await t.client.get('/api/categories/world-1914/countries', { token: u.token })).status).toBe(200);
    expect((await t.client.get('/api/categories/world-1914/countries', { token: admin.token })).status).toBe(200);
  });

  it('the SERVER decides what is paid: switching a category to paid gates it even though the tree file says default', async () => {
    const before = await t.client.get('/api/categories/world-1945/countries');
    expect(before.status).toBe(200);
    const patch = await t.client.patch('/api/admin/categories/world-1945', { type: 'paid', priceCents: 300 }, { token: admin.token });
    expect(patch.status).toBe(200);
    expect(patch.json.category).toMatchObject({ type: 'paid', priceCents: 300 });
    expect((await t.client.get('/api/categories/world-1945/countries')).status).toBe(401);
    const listing = flat((await t.client.get('/api/categories')).json).find((c) => c.id === 'world-1945');
    expect(listing.type).toBe('paid');
    // ...and back
    await t.client.patch('/api/admin/categories/world-1945', { type: 'default' }, { token: admin.token });
    expect((await t.client.get('/api/categories/world-1945/countries')).status).toBe(200);
  });

  it('never trusts a type claimed by the browser', async () => {
    const u = await t.login('google', t.profiles.google('liar'));
    const game = { categoryId: 'world-1914', type: 'default', premium: false, difficulty: 'easy', score: 100, correct: 1, incorrect: 0, totalQuestions: 1, bestStreak: 1, durationSeconds: 5 };
    expect((await t.client.post('/api/games', game, { token: u.token })).status).toBe(403);
    const mp = { categoryId: 'world-1914', type: 'default', difficulty: 'easy', guessingOrder: 'written', totalQuestions: 2, players: [
      { name: 'A', score: 1, correct: 1, incorrect: 0, bestStreak: 1, totalTimeMs: 10 },
      { name: 'B', score: 1, correct: 1, incorrect: 0, bestStreak: 1, totalTimeMs: 10 },
    ] };
    expect((await t.client.post('/api/multiplayer-games', mp, { token: u.token })).status).toBe(403);
  });

  it('bundled-data categories cannot be made paid (their flags ship in the public bundle)', async () => {
    const res = await t.client.patch('/api/admin/categories/europe', { type: 'paid', priceCents: 100 }, { token: admin.token });
    expect(res.status).toBe(400);
    expect(res.json.details.join()).toMatch(/server-hosted/);
  });

  it('a paid category needs a price', async () => {
    const res = await t.client.patch('/api/admin/categories/world-1991', { type: 'paid' }, { token: admin.token });
    expect(res.status).toBe(400);
    expect(res.json.details.join()).toMatch(/price/);
  });

  it('only administrators can change category configuration', async () => {
    const u = await t.login('google', t.profiles.google('not-admin'));
    expect((await t.client.patch('/api/admin/categories/world-1914', { enabled: false }, { token: u.token })).status).toBe(403);
    expect((await t.client.patch('/api/admin/categories/world-1914', { enabled: false })).status).toBe(401);
    expect((await t.client.get('/api/admin/categories', { token: u.token })).status).toBe(403);
  });

  it('rejects unknown or invalid fields', async () => {
    const tok = { token: admin.token };
    expect((await t.client.patch('/api/admin/categories/world-1914', { flagSource: {} }, tok)).status).toBe(400);
    expect((await t.client.patch('/api/admin/categories/world-1914', { type: 'premium' }, tok)).status).toBe(400);
    expect((await t.client.patch('/api/admin/categories/world-1914', { priceCents: -5 }, tok)).status).toBe(400);
    expect((await t.client.patch('/api/admin/categories/nope', { enabled: true }, tok)).status).toBe(404);
  });

  it('a disabled category cannot be played, but owners keep their entitlement', async () => {
    const owner = await t.login('google', t.profiles.google('owner-1'));
    await t.repos.commerce.grant({ userId: owner.user.id, categoryId: 'world-1914', transactionId: null });
    await t.client.patch('/api/admin/categories/world-1914', { enabled: false }, { token: admin.token });
    expect((await t.client.get('/api/categories/world-1914/countries', { token: owner.token })).status).toBe(403);
    expect((await t.client.get('/api/categories/world-1914/countries', { token: admin.token })).status).toBe(200);
    await t.client.patch('/api/admin/categories/world-1914', { enabled: true }, { token: admin.token });
    expect((await t.client.get('/api/categories/world-1914/countries', { token: owner.token })).status).toBe(200);
  });

  it('re-seeding on restart never overwrites admin edits', async () => {
    await t.client.patch('/api/admin/categories/world-1991', { type: 'paid', priceCents: 450, enabled: false, name: 'Renamed 1991' }, { token: admin.token });
    await seedCategories(t.repos, t.tree);
    await seedCategories(t.repos, t.tree);
    const row = await t.repos.categories.get('world-1991');
    expect(row).toMatchObject({ type: 'paid', priceCents: 450, enabled: false, name: 'Renamed 1991' });
    await t.client.patch('/api/admin/categories/world-1991', { type: 'default', enabled: true, name: 'World 1991' }, { token: admin.token });
  });

  it('lists per-user access, counting owners in the admin view', async () => {
    const u = await t.login('google', t.profiles.google('access-user'));
    const before = await t.client.get('/api/me/access', { token: u.token });
    expect(before.json.access['world-1914']).toEqual({ owned: false, viaAdmin: false });
    expect(before.json.access.europe).toEqual({ owned: true, viaAdmin: false });
    await t.repos.commerce.grant({ userId: u.user.id, categoryId: 'world-1914', transactionId: null });
    expect((await t.client.get('/api/me/access', { token: u.token })).json.access['world-1914'].owned).toBe(true);
    expect((await t.client.get('/api/me/access', { token: admin.token })).json.access['world-1914']).toEqual({ owned: true, viaAdmin: true });
    expect((await t.client.get('/api/me/access')).status).toBe(401);
    const adminList = await t.client.get('/api/admin/categories', { token: admin.token });
    expect(adminList.json.categories.find((c) => c.id === 'world-1914').ownerCount).toBeGreaterThanOrEqual(2);
  });
});

describe('adding a hypothetical new category is data only', () => {
  let t;
  let tree;
  beforeAll(async () => {
    tree = clone(loadTree());
    // A brand-new group with a free and a paid leaf, and a new leaf in an
    // existing group. No code anywhere mentions any of these ids.
    tree.groups.push({
      id: 'themes',
      name: 'Themes',
      categories: [
        { id: 'flags-with-stars', name: 'Flags with Stars', type: 'default', flagSource: { kind: 'remote', dataset: 'world-1991' } },
        { id: 'premium-pack', name: 'Premium Pack', type: 'paid', priceCents: 499, description: 'Extra flags', flagSource: { kind: 'remote', dataset: 'world-1945' } },
      ],
    });
    tree.groups[1].categories.push({ id: 'antarctica', name: 'Antarctica', type: 'default', flagSource: { kind: 'bundled', where: { continent: 'Antarctica' } } });
    expect(validateTree(tree)).toEqual([]);
    t = await createTestApp({ tree });
  });
  afterAll(() => t.close());

  it('appears in the served tree with its own type and derived flagNumber', async () => {
    const res = await t.client.get('/api/categories');
    const themes = res.json.groups.find((g) => g.id === 'themes');
    expect(themes.name).toBe('Themes');
    expect(themes.categories.map((c) => [c.id, c.type])).toEqual([['flags-with-stars', 'default'], ['premium-pack', 'paid']]);
    expect(themes.categories[1]).toMatchObject({ priceCents: 499, description: 'Extra flags' });
    expect(themes.categories[0].flagNumber).toBe(loadRemoteDataset('world-1991').length);
    expect(res.json.groups[1].categories.map((c) => c.id)).toContain('antarctica');
  });

  it('is gated by the same access rules as every other category', async () => {
    expect((await t.client.get('/api/categories/flags-with-stars/countries')).status).toBe(200);
    expect((await t.client.get('/api/categories/premium-pack/countries')).status).toBe(401);
    const u = await t.login('google', t.profiles.google('newcat'));
    expect((await t.client.get('/api/categories/premium-pack/countries', { token: u.token })).status).toBe(403);
    await t.repos.commerce.grant({ userId: u.user.id, categoryId: 'premium-pack', transactionId: null });
    expect((await t.client.get('/api/categories/premium-pack/countries', { token: u.token })).status).toBe(200);
  });

  it('records games and produces per-category stats with no category-specific code', async () => {
    const u = await t.login('google', t.profiles.google('newcat-stats'));
    const game = { categoryId: 'antarctica', difficulty: 'easy', score: 300, correct: 3, incorrect: 1, totalQuestions: 4, bestStreak: 3, durationSeconds: 30 };
    expect((await t.client.post('/api/games', game, { token: u.token })).status).toBe(201);
    const stats = await t.client.get('/api/me/stats', { token: u.token });
    expect(stats.json.categoryStats.antarctica).toMatchObject({ gamesPlayed: 1, questionsAnswered: 4, correct: 3, accuracy: 75, bestScore: 300, bestStreak: 3, averageScore: 300 });
  });

  it('a category removed from the tree is no longer offered', async () => {
    const slim = clone(tree);
    slim.groups = slim.groups.filter((g) => g.id !== 'themes');
    const t2 = await createTestApp({ tree: slim });
    try {
      const res = await t2.client.get('/api/categories');
      expect(res.json.groups.map((g) => g.id)).not.toContain('themes');
    } finally {
      await t2.close();
    }
  });
});

describe('lib/access (unit)', () => {
  it('encodes the free/paid/enabled rules in one place', async () => {
    const owned = new Set(['p']);
    const access = makeAccess({ commerce: { hasEntitlement: async (u, c) => owned.has(c), ownedCategoryIds: async () => owned } });
    const free = { id: 'f', type: 'default', enabled: true };
    const paid = { id: 'p', type: 'paid', enabled: true };
    const other = { id: 'q', type: 'paid', enabled: true };
    const user = { id: 'u', isAdmin: false };
    const admin = { id: 'a', isAdmin: true };
    expect(await access.canPlay(null, free)).toBe(true);
    expect(await access.canPlay(null, paid)).toBe(false);
    expect(await access.canPlay(user, paid)).toBe(true);
    expect(await access.canPlay(user, other)).toBe(false);
    expect(await access.canPlay(admin, other)).toBe(true);
    expect(await access.canPlay(user, { ...free, enabled: false })).toBe(false);
    expect(await access.canPlay(admin, { ...free, enabled: false })).toBe(true);
    expect(await access.canPlay(user, undefined)).toBe(false);
  });
});
