/**
 * routes/admin.js
 * -----------------------------------------------------------------------
 * Mounted in index.js as:
 *   app.use('/api/admin', requireAuth, requireAdmin, buildAdminRouter());
 *
 * requireAuth and requireAdmin run in front of every route in this file
 * (see server/index.js) — nothing here re-implements or duplicates that
 * check, and nothing here trusts anything from req.body to determine who
 * the caller is or what they're allowed to do. req.user is always the
 * database row for whoever the current server-side session belongs to.
 * -----------------------------------------------------------------------
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { getMergedStats, parseOverrides, validateOverrides } = require('../lib/userStats');
const { recordAdminAction, recentAdminActions } = require('../lib/auditLog');
const { ownerCount } = require('../lib/entitlements');

const ALLOWED_PROVIDERS_FOR_CREATE = ['google', 'discord', 'manual'];
const EDITABLE_FIELDS = ['name', 'email', 'status', 'statOverrides'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicAdminUser(row) {
  const overrides = parseOverrides(row);
  const qa = overrides.questionsAnswered ?? row.questionsAnswered ?? 0;
  const c = overrides.correct ?? row.correct ?? 0;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    provider: row.provider,
    isAdmin: !!row.is_admin,
    status: row.status,
    isVerifiedIdentity: !!row.is_verified_identity,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    gamesPlayed: overrides.gamesPlayed ?? row.gamesPlayed ?? 0,
    accuracy: qa ? Math.round((c / qa) * 100) : 0,
    hasOverrides: Object.keys(overrides).length > 0,
  };
  // NOTE: this deliberately never includes provider_id, created_by_admin
  // internals, or stat_overrides raw JSON — see README "Protect sensitive
  // user information". None of those are secrets, but they're internal
  // bookkeeping, not admin-panel-facing data.
}

function validateCreatePayload(body) {
  const errors = [];
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const provider = typeof body.provider === 'string' ? body.provider.trim() : 'manual';

  if (!name || name.length > 100) errors.push('name must be 1-100 characters');
  if (email && (!EMAIL_RE.test(email) || email.length > 200)) errors.push('email is not a valid address');
  if (!ALLOWED_PROVIDERS_FOR_CREATE.includes(provider)) {
    errors.push(`provider must be one of: ${ALLOWED_PROVIDERS_FOR_CREATE.join(', ')}`);
  }

  return { valid: errors.length === 0, errors, sanitized: { name, email: email || null, provider } };
}

function buildAdminRouter() {
  const router = express.Router();

  // --- Overview ------------------------------------------------------------
  router.get('/overview', (req, res) => {
    const users = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
    const admins = db.prepare('SELECT COUNT(*) as n FROM users WHERE is_admin = 1').get().n;
    const disabled = db.prepare("SELECT COUNT(*) as n FROM users WHERE status = 'disabled'").get().n;
    const games = db.prepare('SELECT COUNT(*) as n FROM games').get().n;
    const questions = db.prepare('SELECT COALESCE(SUM(total_questions), 0) as n FROM games').get().n;

    res.json({
      totalUsers: users,
      totalAdmins: admins,
      disabledUsers: disabled,
      gamesPlayed: games,
      questionsAnswered: questions,
    });
  });

  // --- List / search users ---------------------------------------------------
  router.get('/users', (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    const like = `%${search}%`;

    const whereClause = search ? 'WHERE u.name LIKE ? OR u.email LIKE ?' : '';
    const whereParams = search ? [like, like] : [];

    const total = db.prepare(`SELECT COUNT(*) as n FROM users u ${whereClause}`).get(...whereParams).n;

    const rows = db
      .prepare(
        `SELECT u.*, COALESCE(g.gamesPlayed, 0) as gamesPlayed,
                COALESCE(g.questionsAnswered, 0) as questionsAnswered,
                COALESCE(g.correct, 0) as correct
         FROM users u
         LEFT JOIN (
           SELECT user_id, COUNT(*) as gamesPlayed, SUM(total_questions) as questionsAnswered, SUM(correct) as correct
           FROM games GROUP BY user_id
         ) g ON g.user_id = u.id
         ${whereClause}
         ORDER BY u.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...whereParams, pageSize, (page - 1) * pageSize);

    res.json({
      users: rows.map(publicAdminUser),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  });

  // --- Single user detail (full stats) ---------------------------------------
  router.get('/users/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'User not found' });

    res.json({ user: publicAdminUser(row), stats: getMergedStats(row) });
  });

  // --- Create a placeholder user record ---------------------------------------
  router.post('/users', (req, res) => {
    const { valid, errors, sanitized } = validateCreatePayload(req.body || {});
    if (!valid) return res.status(400).json({ error: 'Invalid user payload', details: errors });

    const id = crypto.randomUUID();
    // provider_id is intentionally prefixed and random — it can never
    // match a real OAuth profile id, so this record can never be
    // mistaken for (or silently claimed by) a real login. See README
    // "Create User" for why this is a deliberate, disclosed limitation
    // rather than identity forgery.
    const providerId = `admin-created:${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO users (id, provider, provider_id, email, name, created_at, is_verified_identity, created_by_admin, status)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'active')`
    ).run(id, sanitized.provider, providerId, sanitized.email, sanitized.name, now, req.user.id);

    recordAdminAction({
      adminId: req.user.id,
      action: 'CREATE_USER',
      targetUserId: id,
      summary: `Created placeholder user "${sanitized.name}" (${sanitized.provider}, unverified identity)`,
    });

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    res.status(201).json({ user: publicAdminUser(row) });
  });

  // --- Edit a user (explicit allowlist only) -----------------------------------
  router.patch('/users/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'User not found' });

    const body = req.body || {};
    const unknownFields = Object.keys(body).filter((k) => !EDITABLE_FIELDS.includes(k));
    if (unknownFields.length) {
      // Explicit rejection, not silent drop — this is the boundary that
      // stops e.g. { isAdmin: true } or { provider: 'google' } from doing
      // anything at all, and makes that fact verifiable in a test.
      return res.status(400).json({ error: `Field(s) not editable through this endpoint: ${unknownFields.join(', ')}` });
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
      const email = body.email === null ? null : String(body.email).trim();
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

    let overridesResult = { valid: true, sanitized: null };
    if (body.statOverrides !== undefined) {
      overridesResult = validateOverrides(body.statOverrides);
      if (!overridesResult.valid) errors.push(...overridesResult.errors);
    }

    if (errors.length) return res.status(400).json({ error: 'Invalid update', details: errors });

    if (overridesResult.sanitized) {
      const existing = parseOverrides(row);
      const merged = { ...existing };
      for (const [k, v] of Object.entries(overridesResult.sanitized)) {
        if (v === null) delete merged[k];
        else merged[k] = v;
      }
      updates.stat_overrides = Object.keys(merged).length ? JSON.stringify(merged) : null;
      changes.push(`stat overrides updated: ${JSON.stringify(overridesResult.sanitized)}`);
    }

    if (Object.keys(updates).length === 0) {
      return res.json({ user: publicAdminUser(row), changed: false });
    }

    updates.updated_at = new Date().toISOString();
    const setClause = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE users SET ${setClause} WHERE id = ?`).run(...Object.values(updates), row.id);

    recordAdminAction({
      adminId: req.user.id,
      action: 'MODIFY_USER',
      targetUserId: row.id,
      summary: changes.join('; ') || 'No effective change',
    });

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(row.id);
    res.json({ user: publicAdminUser(updated), changed: true });
  });

  // --- Delete a user ------------------------------------------------------------
  router.delete('/users/:id', (req, res) => {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: "You can't delete your own account from the admin panel." });
    }
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'User not found' });

    const deleteTx = db.transaction((userId) => {
      db.prepare('DELETE FROM games WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    });
    deleteTx(row.id);

    recordAdminAction({
      adminId: req.user.id,
      action: 'DELETE_USER',
      targetUserId: row.id,
      summary: `Deleted user "${row.name || row.email || row.id}" (${row.provider}) and their game history`,
    });

    res.json({ ok: true });
  });

  // --- Audit log ------------------------------------------------------------------
  router.get('/audit-log', (req, res) => {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    res.json({ entries: recentAdminActions(limit) });
  });

  // --- Paid categories --------------------------------------------------------------
  router.get('/paid-categories', (req, res) => {
    const rows = db.prepare('SELECT * FROM paid_categories ORDER BY created_at ASC').all();
    res.json({
      categories: rows.map((c) => ({
        categoryId: c.category_id,
        name: c.name,
        description: c.description,
        priceCents: c.price_cents,
        currency: c.currency,
        enabled: !!c.enabled,
        premium: !!c.premium,
        ownerCount: ownerCount(c.category_id),
      })),
    });
  });

  router.patch('/paid-categories/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM paid_categories WHERE category_id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Unknown category' });

    const CATEGORY_EDITABLE_FIELDS = ['enabled', 'premium', 'priceCents', 'name', 'description'];
    const body = req.body || {};
    const unknownFields = Object.keys(body).filter((k) => !CATEGORY_EDITABLE_FIELDS.includes(k));
    if (unknownFields.length) {
      return res.status(400).json({ error: `Field(s) not editable: ${unknownFields.join(', ')}` });
    }

    const errors = [];
    const changes = [];
    const updates = {};

    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') errors.push('enabled must be a boolean');
      else if (body.enabled !== !!row.enabled) {
        updates.enabled = body.enabled ? 1 : 0;
        changes.push(`enabled ${!!row.enabled} -> ${body.enabled}`);
      }
    }
    if (body.premium !== undefined) {
      if (typeof body.premium !== 'boolean') errors.push('premium must be a boolean');
      else if (body.premium !== !!row.premium) {
        updates.premium = body.premium ? 1 : 0;
        changes.push(`premium ${!!row.premium} -> ${body.premium}`);
      }
    }
    if (body.priceCents !== undefined) {
      // 0 is allowed (a free category's symbolic price) -- only a
      // category that ends up premium after this update needs a real
      // price, checked below once we know the final premium value.
      if (!Number.isInteger(body.priceCents) || body.priceCents < 0 || body.priceCents > 100000) {
        errors.push('priceCents must be an integer between 0 and 100000 (i.e. up to $1,000.00)');
      } else if (body.priceCents !== row.price_cents) {
        updates.price_cents = body.priceCents;
        changes.push(`priceCents ${row.price_cents} -> ${body.priceCents}`);
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

    const finalPremium = updates.premium !== undefined ? !!updates.premium : !!row.premium;
    const finalPriceCents = updates.price_cents !== undefined ? updates.price_cents : row.price_cents;
    if (finalPremium && finalPriceCents < 1) {
      errors.push('A premium category needs a price greater than $0.00 -- set priceCents alongside premium: true');
    }

    if (errors.length) return res.status(400).json({ error: 'Invalid update', details: errors });
    if (Object.keys(updates).length === 0) {
      return res.json({ changed: false });
    }

    updates.updated_at = new Date().toISOString();
    const setClause = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE paid_categories SET ${setClause} WHERE category_id = ?`).run(...Object.values(updates), row.category_id);

    recordAdminAction({
      adminId: req.user.id,
      action: 'MODIFY_PAID_CATEGORY',
      targetUserId: null,
      summary: `${row.category_id}: ${changes.join('; ')}`,
    });

    const updated = db.prepare('SELECT * FROM paid_categories WHERE category_id = ?').get(row.category_id);
    res.json({
      changed: true,
      category: {
        categoryId: updated.category_id,
        name: updated.name,
        description: updated.description,
        priceCents: updated.price_cents,
        currency: updated.currency,
        enabled: !!updated.enabled,
        premium: !!updated.premium,
        ownerCount: ownerCount(updated.category_id),
      },
    });
  });

  // --- Transactions -----------------------------------------------------------------
  router.get('/transactions', (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));

    const total = db.prepare('SELECT COUNT(*) as n FROM transactions').get().n;
    const rows = db
      .prepare(
        `SELECT t.*, u.name as userName, u.email as userEmail
         FROM transactions t
         LEFT JOIN users u ON u.id = t.user_id
         ORDER BY t.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(pageSize, (page - 1) * pageSize);

    res.json({
      transactions: rows.map((t) => ({
        id: t.id,
        userName: t.userName,
        userEmail: t.userEmail,
        categoryId: t.category_id,
        provider: t.provider,
        amountCents: t.amount_cents,
        currency: t.currency,
        status: t.status,
        createdAt: t.created_at,
        completedAt: t.completed_at,
        // Deliberately NOT included: provider_session_id / provider_payment_intent_id
        // internals beyond what's needed to identify the row on Stripe's own
        // dashboard if ever needed — no card data exists here to begin with.
      })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  });

  // --- Multiplayer games (view-only; hosts write their own via routes/multiplayer.js) ---
  router.get('/multiplayer-games', (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));

    const total = db.prepare('SELECT COUNT(*) as n FROM multiplayer_games').get().n;
    const rows = db
      .prepare(
        `SELECT mg.*, u.name as hostName, u.email as hostEmail
         FROM multiplayer_games mg
         LEFT JOIN users u ON u.id = mg.host_user_id
         ORDER BY mg.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(pageSize, (page - 1) * pageSize);

    res.json({
      games: rows.map((r) => ({
        id: r.id,
        hostName: r.hostName,
        hostEmail: r.hostEmail,
        categoryId: r.category_id,
        difficulty: r.difficulty,
        totalQuestions: r.total_questions,
        guessingOrder: r.guessing_order,
        playerCount: r.player_count,
        players: JSON.parse(r.players_json),
        createdAt: r.created_at,
      })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  });

  return router;
}

module.exports = { buildAdminRouter };
