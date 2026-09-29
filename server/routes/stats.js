const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/requireAuth');
const { getMergedStats } = require('../lib/userStats');
const { MAX_QUESTIONS_PER_GAME, MAX_SCORE_PER_QUESTION, VALID_DIFFICULTIES } = require('../lib/limits');

function publicUser(user) {
  if (!user) return null;
  // isAdmin here is for UI purposes ONLY (e.g. showing the "Administrative
  // Panel" link on the profile page). It is never read back by any
  // authorization check — every /api/admin/* route independently
  // re-verifies req.user.is_admin from the database on that request. See
  // middleware/requireAdmin.js.
  return { id: user.id, provider: user.provider, email: user.email, name: user.name, isAdmin: !!user.is_admin };
}

/**
 * Validates a submitted game result against structural bounds. This is not
 * a full anti-cheat system (that would require replaying the whole game
 * server-side) - it rejects payloads that are malformed or outside what's
 * mathematically possible given the engine's own scoring rules, and it
 * NEVER trusts a client-sent aggregate profile. Authoritative stats below
 * are always recomputed from the rows actually stored in `games`.
 */
function validateGamePayload(body) {
  const errors = [];
  const totalQuestions = Number(body.totalQuestions);
  const correct = Number(body.correct);
  const incorrect = Number(body.incorrect);
  const score = Number(body.score);
  const bestStreak = Number(body.bestStreak);
  const durationSeconds = Number(body.durationSeconds);

  if (!Number.isInteger(totalQuestions) || totalQuestions <= 0 || totalQuestions > MAX_QUESTIONS_PER_GAME) {
    errors.push('totalQuestions out of range');
  }
  if (!Number.isInteger(correct) || correct < 0 || correct > totalQuestions) errors.push('correct out of range');
  if (!Number.isInteger(incorrect) || incorrect < 0 || incorrect > totalQuestions) errors.push('incorrect out of range');
  if (correct + incorrect > totalQuestions) errors.push('correct + incorrect exceeds totalQuestions');
  if (!Number.isInteger(score) || score < 0 || score > totalQuestions * MAX_SCORE_PER_QUESTION) {
    errors.push('score out of range');
  }
  if (!Number.isInteger(bestStreak) || bestStreak < 0 || bestStreak > totalQuestions) errors.push('bestStreak out of range');
  if (!Number.isInteger(durationSeconds) || durationSeconds < 0 || durationSeconds > 60 * 60) {
    errors.push('durationSeconds out of range');
  }
  if (typeof body.categoryId !== 'string' || !body.categoryId || body.categoryId.length > 64) {
    errors.push('categoryId missing/invalid');
  }
  if (!VALID_DIFFICULTIES.has(body.difficulty)) errors.push('difficulty invalid');

  return { valid: errors.length === 0, errors };
}

function buildStatsRouter() {
  const router = express.Router();

  router.get('/api/me', (req, res) => {
    res.json({ user: req.isAuthenticated && req.isAuthenticated() ? publicUser(req.user) : null });
  });

  router.post('/api/logout', (req, res) => {
    req.logout(() => {
      res.json({ ok: true });
    });
  });

  router.post('/api/games', requireAuth, (req, res) => {
    const { valid, errors } = validateGamePayload(req.body || {});
    if (!valid) return res.status(400).json({ error: 'Invalid game payload', details: errors });

    const b = req.body;
    db.prepare(
      `INSERT INTO games
        (user_id, category_id, difficulty, score, correct, incorrect, total_questions, best_streak, duration_seconds, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      req.user.id,
      b.categoryId,
      b.difficulty,
      b.score,
      b.correct,
      b.incorrect,
      b.totalQuestions,
      b.bestStreak,
      b.durationSeconds,
      b.reason || null,
      new Date().toISOString()
    );

    res.status(201).json({ ok: true });
  });

  router.get('/api/me/stats', requireAuth, (req, res) => {
    res.json(getMergedStats(req.user));
  });

  return router;
}

module.exports = { buildStatsRouter };
