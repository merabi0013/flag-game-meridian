/**
 * routes/stats.js — recording solo games and reading the signed-in user's
 * statistics. Authentication is handled in middleware/auth.js; /api/me and
 * /api/logout live in routes/auth.js.
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { MAX_QUESTIONS_PER_GAME, MAX_SCORE_PER_QUESTION, VALID_DIFFICULTIES } = require('../lib/limits');

/**
 * Structural validation of a submitted game result. This is not anti-cheat
 * (that would need the whole game replayed server-side): it rejects payloads
 * that are malformed or outside what the scoring rules allow, and it NEVER
 * trusts a client-sent aggregate — stats are always recomputed from stored rows.
 */
function validateGamePayload(body) {
  const errors = [];
  const totalQuestions = Number(body.totalQuestions);
  const correct = Number(body.correct);
  const incorrect = Number(body.incorrect);
  const score = Number(body.score);
  const bestStreak = Number(body.bestStreak);
  const durationSeconds = Number(body.durationSeconds);
  const skipped = body.skipped === undefined ? 0 : Number(body.skipped);

  if (!Number.isInteger(totalQuestions) || totalQuestions <= 0 || totalQuestions > MAX_QUESTIONS_PER_GAME) {
    errors.push('totalQuestions out of range');
  }
  if (!Number.isInteger(correct) || correct < 0 || correct > totalQuestions) errors.push('correct out of range');
  if (!Number.isInteger(incorrect) || incorrect < 0 || incorrect > totalQuestions) errors.push('incorrect out of range');
  if (correct + incorrect > totalQuestions) errors.push('correct + incorrect exceeds totalQuestions');
  if (!Number.isInteger(skipped) || skipped < 0 || skipped > MAX_QUESTIONS_PER_GAME * 50) errors.push('skipped out of range');
  if (!Number.isInteger(score) || score < 0 || score > totalQuestions * MAX_SCORE_PER_QUESTION) errors.push('score out of range');
  if (!Number.isInteger(bestStreak) || bestStreak < 0 || bestStreak > totalQuestions) errors.push('bestStreak out of range');
  if (!Number.isInteger(durationSeconds) || durationSeconds < 0 || durationSeconds > 60 * 60) errors.push('durationSeconds out of range');
  if (typeof body.categoryId !== 'string' || !body.categoryId || body.categoryId.length > 64) errors.push('categoryId missing/invalid');
  if (!VALID_DIFFICULTIES.has(body.difficulty)) errors.push('difficulty invalid');

  return { valid: errors.length === 0, errors };
}

function buildStatsRouter({ repos, userStats, access }) {
  const router = express.Router();

  router.post('/api/games', requireAuth, async (req, res, next) => {
    try {
      const body = req.body || {};
      const { valid, errors } = validateGamePayload(body);
      if (!valid) return res.status(400).json({ error: 'Invalid game payload', details: errors });

      // The category must exist and the caller must be allowed to play it —
      // the same server-side rule as fetching its flags. A `type` claimed by
      // the browser is never consulted.
      const category = await repos.categories.get(body.categoryId);
      if (!category) return res.status(400).json({ error: 'Unknown category' });
      if (!(await access.canPlay(req.user, category))) return res.status(403).json({ error: "You don't have access to this category." });

      await repos.games.insert(req.user.id, {
        categoryId: category.id,
        difficulty: body.difficulty,
        score: body.score,
        correct: body.correct,
        incorrect: body.incorrect,
        skipped: body.skipped || 0,
        totalQuestions: body.totalQuestions,
        bestStreak: body.bestStreak,
        durationSeconds: body.durationSeconds,
        reason: typeof body.reason === 'string' ? body.reason.slice(0, 100) : null,
      });
      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.get('/api/me/stats', requireAuth, async (req, res, next) => {
    try {
      res.json(await userStats.getMergedStats(req.user));
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildStatsRouter, validateGamePayload };
