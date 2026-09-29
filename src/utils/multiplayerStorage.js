/**
 * multiplayerStorage.js
 * -----------------------------------------------------------------------
 * Deliberately a separate localStorage key from utils/storage.js's solo
 * guest stats -- see README "Solo vs multiplayer statistics". This never
 * syncs to the backend; only an authenticated host's completed game does
 * (see hooks/useMultiplayerGame.js), via a genuinely different code path
 * (routes/multiplayer.js), not a shared "guest vs. host" branch bolted
 * onto the solo storage functions.
 * -----------------------------------------------------------------------
 */
const GUEST_MULTIPLAYER_KEY = 'meridian_guest_multiplayer_games_v1';
const MAX_STORED = 20;

export function readGuestMultiplayerGames() {
  try {
    const raw = localStorage.getItem(GUEST_MULTIPLAYER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('[multiplayerStorage] corrupt guest data, resetting', err);
    return [];
  }
}

export function recordGuestMultiplayerGame(result) {
  const games = readGuestMultiplayerGames();
  games.unshift({ ...result, at: new Date().toISOString() });
  try {
    localStorage.setItem(GUEST_MULTIPLAYER_KEY, JSON.stringify(games.slice(0, MAX_STORED)));
  } catch (err) {
    console.warn('[multiplayerStorage] could not persist (storage full or disabled)', err);
  }
}

export function clearGuestMultiplayerGames() {
  localStorage.removeItem(GUEST_MULTIPLAYER_KEY);
}
