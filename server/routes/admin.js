/**
 * routes/admin.js
 * -----------------------------------------------------------------------
 * Mounted in index.js as:
 *   app.use('/api/admin', requireAuth, requireAdmin, buildAdminRouter(deps));
 *
 * requireAuth and requireAdmin run in front of every route here, reading
 * the user row freshly loaded from the database for this request. Nothing
 * in req.body decides who the caller is or what they may do.
 * -----------------------------------------------------------------------
 */
const express = require('express');
const { validateOverrides, parseOverrides } = require('../lib/userStats');
const { publicCategory } = require('../lib/categoryCatalog');

const EDITABLE_FIELDS = ['name', 'email', 'status', 'statOverrides'];
const CATEGORY_EDITABLE_FIELDS = ['enabled', 'type', 'priceCents', 'name', 'description'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const pagination = (page, pageSize, total) => ({ page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
const pageParams = (req) => ({
  page: Math.max(1, parseInt(req.query.page, 10) || 1),
  pageSize: Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20)),
});

function publicAdminUser(user, extras = {}) {
  const overrides = parseOverrides(user);
  const qa = overrides.questionsAnswered ?? extras.questionsAnswered ?? 0;
  const c = overrides.correct ?? extras.correct ?? 0;
  const providers = extras.providers || [];
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    provider: providers[0] || 'manual',
    providers,
    isAdmin: !!user.isAdmin,
    status: user.status,
    isVerifiedIdentity: !!user.isVerifiedIdentity,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
    gamesPlayed: overrides.gamesPlayed ?? extras.gamesPlayed ?? 0,
    accuracy: qa ? Math.round((c / qa) * 100) : 0,
    hasOverrides: Object.keys(overrides).length > 0,
  };
  // Deliberately never includes raw stat_overrides JSON or provider account ids.
}

function validateCreatePayload(body) {
  const errors = [];
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!name || name.length > 100) errors.push('name must be 1-100 characters');
  if (email && (!EMAIL_RE.test(email) || email.length > 200)) errors.push('email is not a valid address');
  return { valid: errors.length === 0, errors, sanitized: { name, email: email || null } };
}

function buildAdminRouter({ repos, userStats, tree }) {
  const router = express.Router();
  const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

  const adminRow = async (user) => {
    const identities = await repos.identities.listForUser(user.id);
    return publicAdminUser(user, { providers: identities.map((i) => i.provider) });
  };

  const groupNames = new Map(tree.groups.map((g) => [g.id, g.name]));
  const adminCategory = (category, ownerCounts) => ({
    ...publicCategory(category),
    categoryId: category.id, // kept for the existing admin UI
    groupName: groupNames.get(category.groupId) || category.groupId,
    ownerCount: ownerCounts.get(category.id) || 0,
  });

  // --- Overview ------------------------------------------------------------
  router.get('/overview', wrap(async (req, res) => {
    const [counts, totals] = await Promise.all([repos.users.counts(), repos.games.totals()]);
    res.json({
      totalUsers: counts.total,
      totalAdmins: counts.admins,
      disabledUsers: counts.disabled,
      gamesPlayed: totals.games,
      questionsAnswered: totals.questions,
    });
  }));

  // --- List / search users ---------------------------------------------------
  router.get('/users', wrap(async (req, res) => {
    const { page, pageSize } = pageParams(req);
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    const { users, total } = await repos.users.list({ search, page, pageSize });
    res.json({ users: users.map((u) => publicAdminUser(u, u)), pagination: pagination(page, pageSize, total) });
  }));

  // --- Single user detail (full stats) ---------------------------------------
  router.get('/users/:id', wrap(async (req, res) => {
    const user = await findUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: await adminRow(user), stats: await userStats.getMergedStats(user) });
  }));

  // --- Create a placeholder user record ---------------------------------------
  router.post('/users', wrap(async (req, res) => {
    const { valid, errors, sanitized } = validateCreatePayload(req.body || {});
    if (!valid) return res.status(400).json({ error: 'Invalid user payload', details: errors });

    // No sign-in identity is attached, so this record can never be claimed
    // by (or mistaken for) a real Google/Discord login.
    const user = await repos.users.create({ name: sanitized.name, email: sanitized.email, isVerifiedIdentity: false, createdByAdmin: req.user.id });
    await repos.audit.record({
      adminId: req.user.id,
      action: 'CREATE_USER',
      targetUserId: user.id,
      summary: `Created placeholder user "${sanitized.name}" (no sign-in identity, unverified)`,
    });
    res.status(201).json({ user: await adminRow(user) });
  }));

  // --- Edit a user (explicit allowlist only) -----------------------------------
  router.patch('/users/:id', wrap(async (req, res) => {
    const row = await findUser(req.params.id);
    if (!row) return res.status(404).json({ error: 'User not found' });

    const body = req.body || {};
    const unknown = Object.keys(body).filter((k) => !EDITABLE_FIELDS.includes(k));
    if (unknown.length) {
      // Explicit rejection (not a silent drop): { isAdmin: true } must do nothing at all.
      return res.status(400).json({ error: `Field(s) not editable through this endpoint: ${unknown.join(', ')}` });
    }

    const errors = [];
    const changes = [];
    const updates = {};

    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 100) errors.push('name must be 1-100 characters');
      else if (name !== row.name) {
        updates.name = name;
        changes.push(`name "${row.name}" -> "${name}"`);
      }
    }
    if (body.email !== undefined) {
      const email = body.email === null || body.email === '' ? null : String(body.email).trim();
      if (email && (!EMAIL_RE.test(email) || email.length > 200)) errors.push('email is not a valid address');
      else if (email !== row.email) {
        updates.email = email;
        changes.push(`email "${row.email || ''}" -> "${email || ''}"`);
      }
    }
    if (body.status !== undefined) {
      if (!['active', 'disabled'].includes(body.status)) errors.push("status must be 'active' or 'disabled'");
      else if (body.status !== row.status) {
        updates.status = body.status;
        changes.push(`status "${row.status}" -> "${body.status}"`);
      }
    }
    if (body.statOverrides !== undefined) {
      const result = validateOverrides(body.statOverrides);
      if (!result.valid) errors.push(...result.errors);
      else if (result.sanitized) {
        const merged = { ...parseOverrides(row) };
        for (const [k, v] of Object.entries(result.sanitized)) {
          if (v === null) delete merged[k];
          else merged[k] = v;
        }
        updates.statOverrides = Object.keys(merged).length ? merged : null;
        changes.push(`stat overrides updated: ${JSON.stringify(result.sanitized)}`);
      }
    }

    if (errors.length) return res.status(400).json({ error: 'Invalid update', details: errors });
    if (!Object.keys(updates).length) return res.json({ user: await adminRow(row), changed: false });

    const updated = await repos.users.update(row.id, updates);
    if (updates.status === 'disabled') await repos.sessions.removeAllForUser(row.id); // sign them out everywhere
    await repos.audit.record({ adminId: req.user.id, action: 'MODIFY_USER', targetUserId: row.id, summary: changes.join('; ') });
    res.json({ user: await adminRow(updated), changed: true });
  }));

  // --- Delete a user ------------------------------------------------------------
  router.delete('/users/:id', wrap(async (req, res) => {
    if (req.params.id === req.user.id) return res.status(400).json({ error: "You can't delete your own account from the admin panel." });
    const row = await findUser(req.params.id);
    if (!row) return res.status(404).json({ error: 'User not found' });

    // Games, sessions, identities, entitlements and hosted multiplayer games
    // cascade in the database; transactions are kept with user_id = NULL.
    await repos.users.remove(row.id);
    await repos.audit.record({
      adminId: req.user.id,
      action: 'DELETE_USER',
      targetUserId: row.id,
      summary: `Deleted user "${row.name || row.email || row.id}" and their game history`,
    });
    res.json({ ok: true });
  }));

  // --- Audit log ------------------------------------------------------------------
  router.get('/audit-log', wrap(async (req, res) => {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    res.json({ entries: await repos.audit.recent(limit) });
  }));

  // --- Categories (free/paid, enabled, price) -----------------------------------
  router.get('/categories', wrap(async (req, res) => {
    const [rows, owners] = await Promise.all([repos.categories.list(), repos.commerce.ownerCounts()]);
    res.json({ categories: rows.map((c) => adminCategory(c, owners)) });
  }));

  router.patch('/categories/:id', wrap(async (req, res) => {
    const row = await repos.categories.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Unknown category' });

    const body = req.body || {};
    const unknown = Object.keys(body).filter((k) => !CATEGORY_EDITABLE_FIELDS.includes(k));
    if (unknown.length) return res.status(400).json({ error: `Field(s) not editable: ${unknown.join(', ')}` });

    const errors = [];
    const changes = [];
    const updates = {};

    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') errors.push('enabled must be a boolean');
      else if (body.enabled !== row.enabled) {
        updates.enabled = body.enabled;
        changes.push(`enabled ${row.enabled} -> ${body.enabled}`);
      }
    }
    if (body.type !== undefined) {
      if (!['default', 'paid'].includes(body.type)) errors.push("type must be 'default' or 'paid'");
      else if (body.type !== row.type) {
        updates.type = body.type;
        changes.push(`type ${row.type} -> ${body.type}`);
      }
    }
    if (body.priceCents !== undefined) {
      if (!Number.isInteger(body.priceCents) || body.priceCents < 0 || body.priceCents > 100000) {
        errors.push('priceCents must be an integer between 0 and 100000 (i.e. up to $1,000.00)');
      } else if (body.priceCents !== row.priceCents) {
        updates.priceCents = body.priceCents;
        changes.push(`priceCents ${row.priceCents} -> ${body.priceCents}`);
      }
    }
    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 100) errors.push('name must be 1-100 characters');
      else if (name !== row.name) {
        updates.name = name;
        changes.push(`name "${row.name}" -> "${name}"`);
      }
    }
    if (body.description !== undefined) {
      const description = typeof body.description === 'string' ? body.description.trim().slice(0, 500) : '';
      if (description !== (row.description || '')) {
        updates.description = description || null;
        changes.push('description updated');
      }
    }

    const finalType = updates.type !== undefined ? updates.type : row.type;
    const finalPrice = updates.priceCents !== undefined ? updates.priceCents : row.priceCents;
    if (finalType === 'paid') {
      if (row.flagSource.kind !== 'remote') {
        // Bundled flag data ships inside the public JavaScript bundle, so
        // "paying" for it would be theatre. Only server-hosted data can be gated.
        errors.push('Only server-hosted categories can be paid: this one\'s flags are bundled in the public app.');
      }
      if (finalPrice < 1) errors.push('A paid category needs a price greater than $0.00 — set priceCents alongside type: "paid"');
    }

    if (errors.length) return res.status(400).json({ error: 'Invalid update', details: errors });
    if (!Object.keys(updates).length) return res.json({ changed: false });

    const updated = await repos.categories.update(row.id, updates);
    await repos.audit.record({ adminId: req.user.id, action: 'MODIFY_CATEGORY', summary: `${row.id}: ${changes.join('; ')}` });
    res.json({ changed: true, category: adminCategory(updated, await repos.commerce.ownerCounts()) });
  }));

  // --- Transactions -----------------------------------------------------------------
  router.get('/transactions', wrap(async (req, res) => {
    const { page, pageSize } = pageParams(req);
    const { transactions, total } = await repos.commerce.listTransactions({ page, pageSize });
    res.json({
      transactions: transactions.map((t) => ({
        id: t.id,
        userName: t.userName,
        userEmail: t.userEmail,
        categoryId: t.categoryId,
        provider: t.provider,
        amountCents: t.amountCents,
        currency: t.currency,
        status: t.status,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
      })),
      pagination: pagination(page, pageSize, total),
    });
  }));

  // --- Multiplayer games (view-only) ----------------------------------------------------
  router.get('/multiplayer-games', wrap(async (req, res) => {
    const { page, pageSize } = pageParams(req);
    const { games, total } = await repos.multiplayer.listAll({ page, pageSize });
    res.json({ games: games.map((g) => ({ ...g, createdAt: g.at })), pagination: pagination(page, pageSize, total) });
  }));

  async function findUser(id) {
    // A malformed id must be a 404, not a Postgres "invalid uuid" 500.
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return repos.users.findById(id);
  }

  return router;
}

module.exports = { buildAdminRouter };
