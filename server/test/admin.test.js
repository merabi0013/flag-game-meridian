import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestApp } = require('./helpers/testApp');

let t;
let admin;
beforeAll(async () => {
  t = await createTestApp();
  admin = await t.makeAdmin();
});
afterAll(() => t.close());

describe('admin authorisation', () => {
  it('rejects guests (401) and ordinary users (403) on every admin route', async () => {
    const u = await t.login('google', t.profiles.google('plain'));
    const routes = [
      ['get', '/api/admin/overview'],
      ['get', '/api/admin/users'],
      ['get', `/api/admin/users/${u.user.id}`],
      ['get', '/api/admin/audit-log'],
      ['get', '/api/admin/categories'],
      ['get', '/api/admin/transactions'],
      ['get', '/api/admin/multiplayer-games'],
    ];
    for (const [m, path] of routes) {
      expect((await t.client[m](path)).status, `${path} guest`).toBe(401);
      expect((await t.client[m](path, { token: u.token })).status, `${path} user`).toBe(403);
    }
    expect((await t.client.post('/api/admin/users', { name: 'x' }, { token: u.token })).status).toBe(403);
    expect((await t.client.delete(`/api/admin/users/${u.user.id}`, { token: u.token })).status).toBe(403);
  });

  it('cannot be reached by claiming to be admin in a request body', async () => {
    const u = await t.login('google', t.profiles.google('sneaky'));
    const res = await t.client.patch(`/api/admin/users/${u.user.id}`, { isAdmin: true }, { token: u.token });
    expect(res.status).toBe(403);
    expect((await t.repos.users.findById(u.user.id)).isAdmin).toBe(false);
  });

  it('refuses to make anyone an administrator through the API', async () => {
    const u = await t.login('google', t.profiles.google('promote'));
    const res = await t.client.patch(`/api/admin/users/${u.user.id}`, { isAdmin: true }, { token: admin.token });
    expect(res.status).toBe(400);
    expect((await t.repos.users.findById(u.user.id)).isAdmin).toBe(false);
  });

  it('revoked admin rights take effect on the next request', async () => {
    const other = await t.login('google', t.profiles.google('demoted', { email: 'boss@example.com' }));
    expect((await t.client.get('/api/admin/overview', { token: other.token })).status).toBe(200);
    await t.repos.users.setAdmin(other.user.id, false);
    expect((await t.client.get('/api/admin/overview', { token: other.token })).status).toBe(403);
  });
});

describe('admin user management', () => {
  it('lists, searches (with literal wildcards) and paginates users, showing linked providers', async () => {
    const u = await t.login('google', t.profiles.google('findme', { name: '100%_Fun' }));
    await t.login('google', t.profiles.google('other-person', { name: 'Someone Else' }));
    const all = await t.client.get('/api/admin/users?pageSize=2&page=1', { token: admin.token });
    expect(all.json.users).toHaveLength(2);
    expect(all.json.pagination.total).toBeGreaterThan(2);
    const hit = await t.client.get(`/api/admin/users?search=${encodeURIComponent('100%_')}`, { token: admin.token });
    expect(hit.json.users.map((x) => x.id)).toEqual([u.user.id]);
    expect(hit.json.users[0].providers).toEqual(['google']);
    const miss = await t.client.get(`/api/admin/users?search=${encodeURIComponent('%')}`, { token: admin.token });
    expect(miss.json.users.map((x) => x.name)).toContain('100%_Fun');
    expect(miss.json.users.map((x) => x.name)).not.toContain('Someone Else');
  });

  it('returns 404 for unknown or malformed ids', async () => {
    expect((await t.client.get('/api/admin/users/not-a-uuid', { token: admin.token })).status).toBe(404);
    expect((await t.client.get('/api/admin/users/00000000-0000-0000-0000-000000000000', { token: admin.token })).status).toBe(404);
  });

  it('creates placeholder users that no login can ever claim', async () => {
    const res = await t.client.post('/api/admin/users', { name: 'Placeholder', email: 'ph@example.com' }, { token: admin.token });
    expect(res.status).toBe(201);
    expect(res.json.user).toMatchObject({ name: 'Placeholder', isVerifiedIdentity: false, providers: [] });
    // Signing in with the same email creates a DIFFERENT user (no merge by email).
    const login = await t.login('google', t.profiles.google('ph-real', { email: 'ph@example.com' }));
    expect(login.user.id).not.toBe(res.json.user.id);
    expect((await t.client.post('/api/admin/users', { name: '' }, { token: admin.token })).status).toBe(400);
  });

  it('edits name, email and status; disabling signs the user out everywhere', async () => {
    const u = await t.login('google', t.profiles.google('editable'));
    const res = await t.client.patch(`/api/admin/users/${u.user.id}`, { name: 'New Name', status: 'disabled' }, { token: admin.token });
    expect(res.json.user).toMatchObject({ name: 'New Name', status: 'disabled' });
    expect((await t.client.get('/api/me', { token: u.token })).json.user).toBeNull();
    expect((await t.client.patch(`/api/admin/users/${u.user.id}`, { status: 'weird' }, { token: admin.token })).status).toBe(400);
    expect((await t.client.patch(`/api/admin/users/${u.user.id}`, { email: 'nope' }, { token: admin.token })).status).toBe(400);
    expect((await t.client.patch(`/api/admin/users/${u.user.id}`, { provider: 'x' }, { token: admin.token })).status).toBe(400);
  });

  it('deletes a user together with their games, identities, sessions and entitlements, but keeps payment records', async () => {
    const u = await t.login('google', t.profiles.google('deleteme'));
    await t.client.post('/api/games', { categoryId: 'europe', difficulty: 'easy', score: 1, correct: 1, incorrect: 0, totalQuestions: 1, bestStreak: 1, durationSeconds: 1 }, { token: u.token });
    await t.repos.commerce.grant({ userId: u.user.id, categoryId: 'world-1914', transactionId: null });
    await t.repos.commerce.insertCompleted({ userId: u.user.id, categoryId: 'world-1914', providerSessionId: 'cs_delete_1', paymentIntentId: 'pi_1', amountCents: 200, currency: 'usd' });

    expect((await t.client.delete(`/api/admin/users/${u.user.id}`, { token: admin.token })).status).toBe(200);

    const count = async (sql) => (await t.db.query(sql, [u.user.id])).rows.length;
    expect(await count('SELECT 1 FROM games WHERE user_id = $1')).toBe(0);
    expect(await count('SELECT 1 FROM auth_identities WHERE user_id = $1')).toBe(0);
    expect(await count('SELECT 1 FROM sessions WHERE user_id = $1')).toBe(0);
    expect(await count('SELECT 1 FROM entitlements WHERE user_id = $1')).toBe(0);
    const tx = await t.repos.commerce.findBySession('cs_delete_1');
    expect(tx).toMatchObject({ status: 'completed', amountCents: 200, userId: null });
    // the audit trail records it
    const log = await t.client.get('/api/admin/audit-log', { token: admin.token });
    expect(log.json.entries.map((e) => e.action)).toContain('DELETE_USER');
  });

  it("refuses to delete the admin's own account", async () => {
    expect((await t.client.delete(`/api/admin/users/${admin.user.id}`, { token: admin.token })).status).toBe(400);
  });

  it('shows overview counts', async () => {
    const res = await t.client.get('/api/admin/overview', { token: admin.token });
    expect(res.json.totalUsers).toBeGreaterThan(3);
    expect(res.json.totalAdmins).toBeGreaterThanOrEqual(1);
  });

  it('lists multiplayer games and transactions', async () => {
    const host = await t.login('google', t.profiles.google('mp-admin-view'));
    const players = [
      { name: 'A', score: 1, correct: 1, incorrect: 0, bestStreak: 1, totalTimeMs: 1 },
      { name: 'B', score: 1, correct: 1, incorrect: 0, bestStreak: 1, totalTimeMs: 1 },
    ];
    await t.client.post('/api/multiplayer-games', { categoryId: 'europe', difficulty: 'easy', guessingOrder: 'randomized', totalQuestions: 2, players }, { token: host.token });
    const mp = await t.client.get('/api/admin/multiplayer-games', { token: admin.token });
    expect(mp.json.games[0]).toMatchObject({ categoryId: 'europe', playerCount: 2, hostName: 'Google mp-admin-view' });
    const tx = await t.client.get('/api/admin/transactions', { token: admin.token });
    expect(Array.isArray(tx.json.transactions)).toBe(true);
  });
});
