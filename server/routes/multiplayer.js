/**
 * routes/multiplayer.js
 * -----------------------------------------------------------------------
 * Same trust model as routes/stats.js's solo POST /api/games: the host
 * is whoever the authenticated session says they are (never a client-
 * submitted id), and the payload is validated server-side before being
 * stored as history -- never taken on faith.
 *
 * The one thing unique to multiplayer: if the category being played is
 * one of the paid categories, the SAME entitlement check used to gate
 * solo play (userHasAccess) applies here too -- see README "Paid
 * categories compatibility". There is no separate multiplayer bypass.
 * -----------------------------------------------------------------------
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { MAX_QUESTIONS_PER_GAME, MAX_SCORE_PER_QUESTION, VALID_DIFFICULTIES } = require('../lib/limits');

// Keep in sync with the frontend's src/utils/playerNames.js MIN_PLAYERS.
// There is deliberately NO maximum player count here as a game-design
// rule -- see README "Remove the maximum player limit". PLAYER_COUNT_ABUSE_CEILING
// exists purely as an anti-abuse sanity bound against a malformed/malicious
// request (e.g. a payload claiming a million players), set far above
// anything a real host would ever type in by hand.
const MIN_PLAYERS = 2;
const PLAYER_COUNT_ABUSE_CEILING = 2000;
const NAME_MAX_LEN = 40; // a little more than the frontend's 24, to tolerate the "(2)" disambiguation suffix
const MAX_PLAYER_TIME_MS = 24 * 60 * 60 * 1000; // 24h sanity ceiling, not a design limit

function validatePlayer(p) {
  if (!p || typeof p !== 'object') return 'each player must be an object';
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > NAME_MAX_LEN) return 'invalid player name';
  for (const field of ['score', 'correct', 'incorrect', 'bestStreak']) {
    if (!Number.isInteger(p[field]) || p[field] < 0 || p[field] > MAX_QUESTIONS_PER_GAME * MAX_SCORE_PER_QUESTION) {
      return `invalid player.${field}`;
    }
  }
  if (!Number.isInteger(p.totalTimeMs) || p.totalTimeMs < 0 || p.totalTimeMs > MAX_PLAYER_TIME_MS) {
    return 'invalid player.totalTimeMs';
  }
  return null;
}

function validateMultiplayerPayload(body) {
  const errors = [];
  const totalQuestions = Number(body.totalQuestions);
  const players = body.players;

  if (!Number.isInteger(totalQuestions) || totalQuestions <= 0 || totalQuestions > MAX_QUESTIONS_PER_GAME) {
    errors.push('totalQuestions out of range');
  }
  if (typeof body.categoryId !== 'string' || !body.categoryId || body.categoryId.length > 64) {
    errors.push('categoryId missing/invalid');
  }
  if (!VALID_DIFFICULTIES.has(body.difficulty)) errors.push('difficulty invalid');
  if (!['written', 'randomized'].includes(body.guessingOrder)) errors.push('guessingOrder invalid');

  if (!Array.isArray(players) || players.length < MIN_PLAYERS) {
    errors.push(`players must be an array of at least ${MIN_PLAYERS} entries`);
  } else if (players.length > PLAYER_COUNT_ABUSE_CEILING) {
    errors.push('players array is unreasonably large');
  } else {
    players.forEach((p, i) => {
      const err = validatePlayer(p);
      if (err) errors.push(`players[${i}]: ${err}`);
    });
    // Every question in the game went to exactly one player's turn, so
    // the total turns taken across all players must equal the game
    // length -- a real structural integrity check, not just per-field
    // range checks. (When there are more players than flags, some
    // players legitimately end up with zero turns -- that's fine, they
    // just contribute 0 to this sum.)
    if (Number.isInteger(totalQuestions)) {
      const totalTurns = players.reduce((sum, p) => sum + (p.correct || 0) + (p.incorrect || 0), 0);
      if (totalTurns !== totalQuestions) {
        errors.push(`sum of player turns (${totalTurns}) does not equal totalQuestions (${totalQuestions})`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function buildMultiplayerRouter({ repos, access }) {
  const router = express.Router();

  router.post('/api/multiplayer-games', requireAuth, async (req, res, next) => {
    try {
      const { valid, errors } = validateMultiplayerPayload(req.body || {});
      if (!valid) return res.status(400).json({ error: 'Invalid multiplayer game payload', details: errors });
      const b = req.body;

      // Same rule as solo play — no multiplayer-specific bypass.
      const category = await repos.categories.get(b.categoryId);
      if (!category) return res.status(400).json({ error: 'Unknown category' });
      if (!(await access.canPlay(req.user, category))) return res.status(403).json({ error: "You don't have access to this category." });

      await repos.multiplayer.insert(req.user.id, { ...b, categoryId: category.id });
      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.get('/api/me/multiplayer-games', requireAuth, async (req, res, next) => {
    try {
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 15));
      res.json({ games: await repos.multiplayer.listForHost(req.user.id, limit) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildMultiplayerRouter, validateMultiplayerPayload };
