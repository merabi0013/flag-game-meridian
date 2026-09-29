/**
 * multiplayerLogic.js
 * -----------------------------------------------------------------------
 * Local pass-and-play multiplayer, built as an extension of the existing
 * solo engine -- not a second game. Deliberately reuses, unchanged:
 *   - shuffle()                        (utils/shuffle.js)
 *   - isCorrectText(), buildMcOptions() (utils/countryUtils.js)
 *   - countriesForCategory()           (utils/categories.js)
 *   - scoreForCorrectAnswer()          (utils/gameLogic.js)
 *   - nextQuestionFields()             (utils/gameLogic.js)
 * Nothing here re-derives the matching/scoring/hint formulas -- only the
 * bookkeeping of "whose turn is it, what's their score, and how long have
 * they spent guessing" is new.
 *
 * Turn order is a fixed array of player ids decided once, at game
 * creation (written = setup order; randomized = shuffled once). The
 * current player for question index i is always turnOrder[i %
 * turnOrder.length] -- a pure function of progress, never a separately
 * mutated pointer that could drift out of sync.
 *
 * Per-player time tracking: `turnStartedAt` marks when the CURRENT
 * question became the current player's responsibility. Whenever a turn
 * resolves (a real answer or a skip -- never a hint, which doesn't end
 * the turn), the elapsed time since `turnStartedAt` is added to that
 * player's `totalTimeMs`, and `turnStartedAt` is reset for whoever goes
 * next. This is a per-player STOPWATCH that only accumulates while it's
 * that player's turn -- unrelated to (and never confused with) the
 * separate optional whole-game countdown timer (`timerEnabled` /
 * `timeRemaining`), which continues to work exactly as it did before.
 * -----------------------------------------------------------------------
 */
import { shuffle } from './shuffle';
import { isCorrectText, buildMcOptions } from './countryUtils';
import { countriesForCategory } from './categories';
import { scoreForCorrectAnswer, nextQuestionFields } from './gameLogic';

function emptyPlayer(id, name) {
  return { id, name, score: 0, streak: 0, bestStreak: 0, correct: 0, incorrect: 0, totalTimeMs: 0 };
}

/**
 * config: same shape as gameLogic.createInitialState's config, plus:
 *   playerNames: string[] (already parsed/validated/disambiguated --
 *                see utils/playerNames.js)
 *   guessingOrder: 'written' | 'randomized'
 */
export function createMultiplayerInitialState(config) {
  const pool = config.pool || countriesForCategory(config.categoryId, config.allCountries);

  if (!pool.length) {
    return { error: 'No flags found for that category.', ended: true, questions: [] };
  }
  if (!config.playerNames || config.playerNames.length < 2) {
    return { error: 'Multiplayer needs at least 2 players.', ended: true, questions: [] };
  }

  const requested = Number(config.questionCount) || pool.length;
  const questionCount = Math.max(1, Math.min(requested, pool.length));
  const questions = shuffle(pool).slice(0, questionCount);
  const timerEnabled = !!config.timerEnabled;
  const timeTotal = timerEnabled ? Math.round(config.timerMinutes * 60) : null;

  const players = config.playerNames.map((name, i) => emptyPlayer(`player-${i}`, name));
  const baseOrder = players.map((p) => p.id);

  // Enforced here, not just in the setup UI (see screens/MultiplayerSetup.jsx):
  // with more players than flags, a fixed written order would leave some
  // players with zero turns. The engine itself refuses written order in
  // that case, regardless of what guessingOrder the caller asked for.
  const mustRandomize = players.length > questions.length;
  const effectiveOrder = mustRandomize ? 'randomized' : config.guessingOrder === 'randomized' ? 'randomized' : 'written';
  const turnOrder = effectiveOrder === 'randomized' ? shuffle(baseOrder) : baseOrder;

  return {
    mode: 'multiplayer',
    categoryId: config.categoryId,
    difficulty: config.difficulty || 'normal',
    allCountries: config.allCountries,
    pool,
    questions,
    index: 0,
    guessingOrder: effectiveOrder,
    autoRandomized: mustRandomize && config.guessingOrder !== 'randomized',
    turnOrder,
    players,
    hintsUsedThisQuestion: 0,
    answered: false,
    startedAt: Date.now(),
    turnStartedAt: Date.now(),
    timerEnabled,
    timeRemaining: timeTotal,
    timeTotal,
    currentOptions: config.difficulty === 'easy' ? buildMcOptions(pool, questions[0], config.allCountries) : null,
    ended: false,
    result: null,
    lastAnswer: null,
    lastHint: null,
    error: null,
  };
}

export function currentCountry(state) {
  return state.questions[state.index];
}

export function currentPlayerId(state) {
  return state.turnOrder[state.index % state.turnOrder.length];
}

export function currentPlayer(state) {
  return state.players.find((p) => p.id === currentPlayerId(state));
}

function updatePlayer(players, playerId, updates) {
  return players.map((p) => (p.id === playerId ? { ...p, ...updates } : p));
}

/** Elapsed time since the current turn began, in whole milliseconds. */
function elapsedThisTurn(state) {
  return Math.max(0, Date.now() - state.turnStartedAt);
}

function buildMultiplayerResult(state, reason) {
  const durationSeconds = Math.round((Date.now() - state.startedAt) / 1000);
  return {
    mode: 'multiplayer',
    categoryId: state.categoryId,
    difficulty: state.difficulty,
    reason,
    totalQuestions: state.questions.length,
    guessingOrder: state.guessingOrder,
    durationSeconds,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      correct: p.correct,
      incorrect: p.incorrect,
      bestStreak: p.bestStreak,
      turnsTaken: p.correct + p.incorrect,
      accuracy: p.correct + p.incorrect ? Math.round((p.correct / (p.correct + p.incorrect)) * 100) : 0,
      totalTimeMs: p.totalTimeMs,
    })),
  };
}

export function multiplayerReducer(state, action) {
  if (state.ended || state.error) return state;

  switch (action.type) {
    case 'SUBMIT_ANSWER': {
      if (state.answered) return state;
      const country = currentCountry(state);
      const player = currentPlayer(state);
      const correct =
        state.difficulty === 'easy' ? action.value === country.id : isCorrectText(country, action.value, state.difficulty);
      const turnTimeMs = elapsedThisTurn(state);

      if (correct) {
        const streak = player.streak + 1;
        const gained = scoreForCorrectAnswer(state.hintsUsedThisQuestion, streak);
        return {
          ...state,
          answered: true,
          players: updatePlayer(state.players, player.id, {
            score: player.score + gained,
            streak,
            bestStreak: Math.max(player.bestStreak, streak),
            correct: player.correct + 1,
            totalTimeMs: player.totalTimeMs + turnTimeMs,
          }),
          lastAnswer: {
            correct: true,
            countryId: country.id,
            countryName: country.name,
            gained,
            chosenId: action.value,
            playerId: player.id,
            playerName: player.name,
          },
        };
      }

      return {
        ...state,
        answered: true,
        players: updatePlayer(state.players, player.id, {
          streak: 0,
          incorrect: player.incorrect + 1,
          totalTimeMs: player.totalTimeMs + turnTimeMs,
        }),
        lastAnswer: {
          correct: false,
          countryId: country.id,
          countryName: country.name,
          gained: 0,
          chosenId: action.value,
          playerId: player.id,
          playerName: player.name,
        },
      };
    }

    case 'USE_HINT': {
      // A hint doesn't end the turn, so it never touches totalTimeMs --
      // that only happens when the turn actually resolves, below.
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
      const player = currentPlayer(state);
      let next = state;
      if (!state.answered) {
        const turnTimeMs = elapsedThisTurn(state);
        next = {
          ...state,
          answered: true,
          players: updatePlayer(state.players, player.id, {
            streak: 0,
            incorrect: player.incorrect + 1,
            totalTimeMs: player.totalTimeMs + turnTimeMs,
          }),
        };
      }
      return advance(next);
    }

    case 'ADVANCE':
      return advance(state);

    case 'TICK': {
      if (!state.timerEnabled || state.ended) return state;
      const timeRemaining = state.timeRemaining - 1;
      if (timeRemaining <= 0) {
        // The whole game is being cut off mid-turn -- credit the current
        // player for the partial turn they were mid-way through, same as
        // any other turn-ending event, rather than losing that time.
        const player = currentPlayer(state);
        const turnTimeMs = state.answered ? 0 : elapsedThisTurn(state);
        const players = state.answered
          ? state.players
          : updatePlayer(state.players, player.id, { totalTimeMs: player.totalTimeMs + turnTimeMs });
        const finalState = { ...state, players };
        return { ...finalState, timeRemaining: 0, ended: true, result: buildMultiplayerResult(finalState, 'timeout') };
      }
      return { ...state, timeRemaining };
    }

    default:
      return state;
  }
}

function advance(state) {
  if (!state.answered) return state;
  const nextIndex = state.index + 1;
  if (nextIndex >= state.questions.length) {
    return { ...state, ended: true, result: buildMultiplayerResult(state, 'completed') };
  }
  return { ...state, ...nextQuestionFields(state, nextIndex), turnStartedAt: Date.now() };
}
