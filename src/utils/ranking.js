/**
 * ranking.js
 * -----------------------------------------------------------------------
 * Leaderboard ranking for multiplayer results, kept as a small pure
 * function separate from any rendering so it's directly testable.
 *
 * Sort: score descending, then totalTimeMs ascending (lower time breaks
 * a tie in the player's favor). Rank: two players share a rank only when
 * BOTH score and totalTimeMs are identical; the next distinct group's
 * rank continues immediately after (no gap) -- e.g. six players scoring
 * [1000,1000,900,800,800,800] rank as [1,1,2,3,3,3], not [1,1,3,4,4,4].
 * -----------------------------------------------------------------------
 */
export function rankPlayers(players) {
  const sorted = [...players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.totalTimeMs ?? 0) - (b.totalTimeMs ?? 0);
  });

  let rank = 0;
  let prev = null;
  return sorted.map((p) => {
    const key = `${p.score}|${p.totalTimeMs ?? 0}`;
    if (key !== prev) {
      rank += 1;
      prev = key;
    }
    return { ...p, rank };
  });
}

/** milliseconds -> "M:SS", for display only -- ranking itself always
 * compares the raw totalTimeMs, never this formatted string. */
export function formatDurationMs(ms) {
  const totalSeconds = Math.round((ms || 0) / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
