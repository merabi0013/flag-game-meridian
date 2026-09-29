/**
 * useMultiplayerGame.js
 * -----------------------------------------------------------------------
 * The multiplayer counterpart of useGame.js -- same shape on purpose
 * (useReducer + one timer effect + one persist-on-end effect), just
 * pointed at multiplayerLogic.js instead of gameLogic.js, and persisting
 * to the multiplayer-specific storage/endpoint instead of the solo ones.
 * -----------------------------------------------------------------------
 */
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { multiplayerReducer, createMultiplayerInitialState, currentCountry, currentPlayer } from '../utils/multiplayerLogic';
import { recordGuestMultiplayerGame } from '../utils/multiplayerStorage';
import { authedFetch } from './useAuth';

export function useMultiplayerGame(config, user) {
  const [state, dispatch] = useReducer(multiplayerReducer, config, createMultiplayerInitialState);
  const savedRef = useRef(false);

  useEffect(() => {
    if (!state.timerEnabled || state.ended) return undefined;
    const id = setInterval(() => dispatch({ type: 'TICK' }), 1000);
    return () => clearInterval(id);
  }, [state.timerEnabled, state.ended]);

  // Guests keep their result on-device only; an authenticated host's
  // result is also sent to the backend as their permanent history. The
  // other players never need accounts -- their names are just part of
  // the host's record (see server/routes/multiplayer.js).
  useEffect(() => {
    if (!state.ended || !state.result || savedRef.current) return;
    savedRef.current = true;
    recordGuestMultiplayerGame(state.result);
    if (user) {
      authedFetch('/api/multiplayer-games', {
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
  const player = state.ended || state.error ? null : currentPlayer(state);

  return { state, country, player, ...actions };
}
