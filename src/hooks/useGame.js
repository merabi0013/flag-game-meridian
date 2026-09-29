/**
 * useGame.js
 * -----------------------------------------------------------------------
 * The only place this app couples gameLogic.js to React: useReducer for
 * state, one useEffect for the optional countdown timer, and one
 * useEffect to persist the result (guest localStorage + optional backend
 * sync) exactly once when a round ends. Everything else is delegated to
 * the framework-agnostic reducer in utils/gameLogic.js.
 * -----------------------------------------------------------------------
 */
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { gameReducer, createInitialState, currentCountry } from '../utils/gameLogic';
import { recordGuestGame } from '../utils/storage';
import { authedFetch } from './useAuth';

export function useGame(config, user) {
  const [state, dispatch] = useReducer(gameReducer, config, createInitialState);
  const savedRef = useRef(false);

  // Countdown timer — only runs while a timer was requested and the round
  // is still active.
  useEffect(() => {
    if (!state.timerEnabled || state.ended) return undefined;
    const id = setInterval(() => dispatch({ type: 'TICK' }), 1000);
    return () => clearInterval(id);
  }, [state.timerEnabled, state.ended]);

  // Persist exactly once when the round ends: guest stats always, and a
  // best-effort sync to the backend if the player is signed in.
  useEffect(() => {
    if (!state.ended || !state.result || savedRef.current) return;
    savedRef.current = true;
    recordGuestGame(state.result);
    if (user) {
      authedFetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state.result),
      });
    }
  }, [state.ended, state.result, user]);

  const actions = useMemo(
    () => ({
      submitAnswer: (value) => dispatch({ type: 'SUBMIT_ANSWER', value }),
      useHint: () => dispatch({ type: 'USE_HINT' }),
      skip: () => dispatch({ type: 'SKIP' }),
      advance: () => dispatch({ type: 'ADVANCE' }),
    }),
    []
  );

  const country = state.ended || state.error ? null : currentCountry(state);

  return { state, country, ...actions };
}
