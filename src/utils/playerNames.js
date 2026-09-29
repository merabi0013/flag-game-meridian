/**
 * playerNames.js
 * -----------------------------------------------------------------------
 * Parsing is intentionally forgiving (spec: support commas, newlines, and
 * a mix of both) but disambiguation is strict, since it feeds directly
 * into multiplayerLogic.js's player list and turn order.
 *
 * There is deliberately NO maximum player count here. The only practical
 * ceiling comes from the browser/device rendering a very long list -- see
 * styles/main.css's scrollable results leaderboard for how that's kept
 * usable rather than capped. A generous backend sanity ceiling exists
 * separately in server/routes/multiplayer.js purely as an anti-abuse
 * safeguard against a malformed/malicious request, not as a game-design
 * limit -- it is far above anything a real host would type in by hand.
 * -----------------------------------------------------------------------
 */
export const MIN_PLAYERS = 2;
export const MAX_NAME_LENGTH = 24;

/** "Alice, Bob\nCharlie\nDavid, Eve" -> ["Alice","Bob","Charlie","David","Eve"] */
export function parsePlayerNames(raw) {
  if (!raw) return [];
  return raw
    .split(/[\n,]/)
    .map((n) => n.trim().slice(0, MAX_NAME_LENGTH))
    .filter(Boolean);
}

/** Two people can genuinely share a chosen name (e.g. two "Sam"s in the
 * same room) -- rather than reject or silently merge them (which would
 * corrupt turn-order attribution), give the later ones a distinguishing
 * suffix so every player still has a unique, readable label. */
export function disambiguateNames(names) {
  const seen = new Map();
  return names.map((name) => {
    const count = (seen.get(name) || 0) + 1;
    seen.set(name, count);
    return count === 1 ? name : `${name} (${count})`;
  });
}

/** Runs both steps and reports validation issues without throwing, so
 * the setup screen can show them inline rather than crash. */
export function parseAndValidatePlayers(raw) {
  const parsed = disambiguateNames(parsePlayerNames(raw));
  const errors = [];
  if (parsed.length > 0 && parsed.length < MIN_PLAYERS) {
    errors.push(`Enter at least ${MIN_PLAYERS} player names to play multiplayer.`);
  }
  return { names: parsed, errors, valid: errors.length === 0 && parsed.length >= MIN_PLAYERS };
}
