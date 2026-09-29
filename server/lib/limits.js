/**
 * limits.js
 * -----------------------------------------------------------------------
 * MAX_QUESTIONS_PER_GAME used to be hard-coded at 20 in routes/stats.js,
 * left over from before the frontend added "10 / 20 / All / Custom"
 * game-length modes. That made it a real bug: finishing a "World -> All"
 * game (197 questions) would fail this bound and silently never sync to
 * a signed-in user's account (the frontend swallows a failed sync rather
 * than erroring the whole results screen -- see hooks/useGame.js). Fixed
 * here as a single generous, documented constant instead of copying the
 * same stale number into the new multiplayer endpoint.
 *
 * 300 is comfortably above the largest existing category (World, 197)
 * and any reasonably-sized future paid category, without importing the
 * frontend's dataset into the backend just to compute an exact number.
 * -----------------------------------------------------------------------
 */
const MAX_QUESTIONS_PER_GAME = 300;
const MAX_SCORE_PER_QUESTION = 150; // 100 base + 50 max streak bonus; hints only ever reduce this
const VALID_DIFFICULTIES = new Set(['easy', 'normal', 'hard']);

module.exports = { MAX_QUESTIONS_PER_GAME, MAX_SCORE_PER_QUESTION, VALID_DIFFICULTIES };
