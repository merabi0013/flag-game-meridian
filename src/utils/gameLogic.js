/**
 * gameLogic.js
 * -----------------------------------------------------------------------
 * The entire game engine as a pure reducer: (state, action) -> state.
 * No DOM, no React, no browser APIs — this is the "shared/portable logic"
 * layer called out in the migration brief. A future React Native/Expo
 * screen can import this file and `useReducer` exactly as the web
 * screens/hooks/useGame.js does below.
 *
 * Ported rule-for-rule from the previous vanilla-JS js/game.js: same
 * scoring formula, same hint behavior, same skip/advance/timer semantics,
 * same text-matching leniency (via countryUtils).
 * -----------------------------------------------------------------------
 */
import { shuffle } from './shuffle';
import { isCorrectText, buildMcOptions } from './countryUtils';
import { countriesForCategory } from './categories';

/**
 * config: { categoryId, allCountries, difficulty, questionCount,
 *           timerEnabled, timerMinutes }
 */
/**
 * config: { categoryId, allCountries, difficulty, questionCount,
 *           timerEnabled, timerMinutes, pool? }
 *
 * `pool` is an optional pre-resolved country array — used for paid
 * categories, whose countries come from an entitlement-gated backend
 * endpoint (see hooks/usePaidCategoryCountries.js) rather than the
 * bundled `allCountries`. When omitted, the pool is resolved from
 * `allCountries` via the normal free-category lookup, unchanged from
 * before this existed.
 */
export function createInitialState(config) {
  const pool = config.pool || countriesForCategory(config.categoryId, config.allCountries);

  if (!pool.length) {
    return { error: 'No flags found for that category.', ended: true, questions: [] };
  }

  const requested = Number(config.questionCount) || pool.length;
  const questionCount = Math.max(1, Math.min(requested, pool.length));
  const questions = shuffle(pool).slice(0, questionCount);
  const timerEnabled = !!config.timerEnabled;
  const timeTotal = timerEnabled ? Math.round(config.timerMinutes * 60) : null;

  return {
    categoryId: config.categoryId,
    difficulty: config.difficulty || 'normal',
    allCountries: config.allCountries,
    pool,
    questions,
    index: 0,
    score: 0,
    correct: 0,
    incorrect: 0,
    skipped: 0, // number of times the player deferred a flag (informational only)
    carriedHints: {}, // countryId -> hints already used before that flag was deferred
    streak: 0,
    bestStreak: 0,
    hintsUsedThisQuestion: 0,
    answered: false,
    missed: [],
    startedAt: Date.now(),
    timerEnabled,
    timeRemaining: timeTotal,
    timeTotal,
    currentOptions: config.difficulty === 'easy' ? buildMcOptions(pool, questions[0], config.allCountries) : null,
    ended: false,
    result: null,
    lastAnswer: null, // { correct, countryId, countryName, gained }
    lastHint: null, // { type: 'text', text } | { type: 'narrow-options' }
    error: null,
  };
}

export function currentCountry(state) {
  return state.questions[state.index];
}

/** The shared scoring formula — exported so multiplayerLogic.js can
 * apply the exact same rule to whichever player's turn it is, instead
 * of re-deriving it. Unchanged from the original solo-only version. */
export function scoreForCorrectAnswer(hintsUsedThisQuestion, streak) {
  const base = 100;
  const hintPenalty = hintsUsedThisQuestion * 25;
  const streakBonus = Math.min(streak * 5, 50);
  return Math.max(25, base - hintPenalty) + streakBonus;
}

function buildResult(state, reason) {
  const durationSeconds = Math.round((Date.now() - state.startedAt) / 1000);
  return {
    categoryId: state.categoryId,
    difficulty: state.difficulty,
    reason,
    score: state.score,
    correct: state.correct,
    incorrect: state.incorrect,
    skipped: state.skipped || 0,
    totalQuestions: state.questions.length,
    bestStreak: state.bestStreak,
    timedOut: reason === 'timeout',
    durationSeconds,
    missed: state.missed,
  };
}

/** Resets per-question fields and (for Easy) rebuilds MC options for the
 * next index. Exported so multiplayerLogic.js can reuse it unchanged —
 * it only reads pool/allCountries/difficulty/questions, all of which
 * exist with the same shape on both solo and multiplayer state. */
export function nextQuestionFields(state, nextIndex) {
  const country = state.questions[nextIndex];
  return {
    index: nextIndex,
    hintsUsedThisQuestion: 0,
    answered: false,
    lastAnswer: null,
    lastHint: null,
    currentOptions:
      state.difficulty === 'easy' ? buildMcOptions(state.pool, country, state.allCountries) : null,
  };
}

export function gameReducer(state, action) {
  if (state.ended || state.error) return state;

  switch (action.type) {
    case 'SUBMIT_ANSWER': {
      if (state.answered) return state;
      const country = currentCountry(state);
      const correct =
        state.difficulty === 'easy' ? action.value === country.id : isCorrectText(country, action.value, state.difficulty);

      if (correct) {
        const streak = state.streak + 1;
        const gained = scoreForCorrectAnswer(state.hintsUsedThisQuestion, streak);
        return {
          ...state,
          answered: true,
          correct: state.correct + 1,
          streak,
          bestStreak: Math.max(state.bestStreak, streak),
          score: state.score + gained,
          lastAnswer: { correct: true, countryId: country.id, countryName: country.name, gained, chosenId: action.value },
        };
      }

      return {
        ...state,
        answered: true,
        incorrect: state.incorrect + 1,
        streak: 0,
        missed: [...state.missed, { id: country.id, name: country.name }],
        lastAnswer: { correct: false, countryId: country.id, countryName: country.name, gained: 0, chosenId: action.value },
      };
    }

    case 'USE_HINT': {
      if (state.answered) return state;
      const country = currentCountry(state);
      const hintsUsedThisQuestion = state.hintsUsedThisQuestion + 1;

      if (state.difficulty === 'easy' && state.currentOptions) {
        const wrong = state.currentOptions.filter((c) => c.id !== country.id);
        const keepWrong = wrong[Math.floor(Math.random() * wrong.length)];
        const currentOptions = shuffle([country, keepWrong]);
        return { ...state, hintsUsedThisQuestion, currentOptions, lastHint: { type: 'narrow-options' } };
      }

      const text = `${country.continent} · starts with "${country.name[0].toUpperCase()}" · ${country.name.length} letters`;
      return { ...state, hintsUsedThisQuestion, lastHint: { type: 'text', text } };
    }

    case 'SKIP': {
      // Skip DEFERS the current flag: it moves to the end of the queue and
      // the next flag takes its place at the same position. Nothing is
      // answered, so no score/streak/correct/incorrect change and `index`
      // (which drives "Flag X of N") stays put — the player has completed
      // exactly as many flags as before. The deferred flag comes round
      // again once everything ahead of it has been answered.
      if (state.answered) return state;
      // Nothing behind the current flag to defer it past: skipping the
      // only remaining flag would just show it again, so it's a no-op
      // (the UI disables the button in this state too).
      if (!canSkip(state)) return state;
      const country = currentCountry(state);
      const questions = [
        ...state.questions.slice(0, state.index),
        ...state.questions.slice(state.index + 1),
        country,
      ];
      const carriedHints = state.hintsUsedThisQuestion
        ? { ...state.carriedHints, [country.id]: state.hintsUsedThisQuestion }
        : state.carriedHints;
      const withQueue = { ...state, questions, carriedHints, skipped: state.skipped + 1 };
      return { ...withQueue, ...questionFieldsFor(withQueue, state.index) };
    }

    case 'ADVANCE':
      return advance(state);

    case 'TICK': {
      if (!state.timerEnabled || state.ended) return state;
      const timeRemaining = state.timeRemaining - 1;
      if (timeRemaining <= 0) {
        return { ...state, timeRemaining: 0, ended: true, result: buildResult(state, 'timeout') };
      }
      return { ...state, timeRemaining };
    }

    default:
      return state;
  }
}

/** True while at least one flag remains after the current one, i.e.
 * there's somewhere to defer the current flag to. */
export function canSkip(state) {
  return !state.ended && !state.error && !state.answered && state.index < state.questions.length - 1;
}

// Solo-only wrapper around the shared nextQuestionFields: a flag that
// comes back after being skipped keeps the hint penalty it had already
// incurred, so skip can't be used to reset it.
function questionFieldsFor(state, index) {
  const fields = nextQuestionFields(state, index);
  fields.hintsUsedThisQuestion = state.carriedHints?.[state.questions[index].id] || 0;
  return fields;
}

function advance(state) {
  if (!state.answered) return state;
  const nextIndex = state.index + 1;
  if (nextIndex >= state.questions.length) {
    return { ...state, ended: true, result: buildResult(state, 'completed') };
  }
  return { ...state, ...questionFieldsFor(state, nextIndex) };
}
