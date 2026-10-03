/**
 * categoryStats.js
 * -----------------------------------------------------------------------
 * The reusable pipeline behind the profile's per-category statistics:
 *
 *   category tree  +  performance records  ->  calculated stats  ->  UI
 *
 * `categoryStats` (from GET /api/me/stats, or the guest's localStorage) is
 * the performance record per category id. This file turns it into the
 * grouped sections the profile renders. Nothing here names a category:
 * the sections come from the tree's groups and the rows from whatever
 * categories actually appear in the records, so a category added to the
 * tree shows up on its own the first time someone plays it.
 *
 * Only real, recorded numbers are shown. A metric that was never recorded
 * (a record written before per-category tracking existed) is `null` and is
 * rendered as "—", never guessed.
 * -----------------------------------------------------------------------
 */

const num = (v) => (Number.isFinite(v) ? v : null);

/** Accepts the server's shape, the guest's shape, or the legacy { asked, correct }. */
export function normalizeCategoryStat(raw = {}) {
  const questionsAnswered = num(raw.questionsAnswered) ?? num(raw.asked) ?? 0;
  const correct = num(raw.correct) ?? 0;
  const gamesPlayed = num(raw.gamesPlayed);
  // Older records never saved per-game detail: for those, games / best
  // score / best streak only cover newer games (the UI footnotes them) and
  // are unknown ("—") when there are none yet.
  const partial = !!raw.partial || gamesPlayed === null;
  const hasDetail = gamesPlayed !== null && gamesPlayed > 0;
  return {
    gamesPlayed: partial && !hasDetail ? null : gamesPlayed,
    questionsAnswered,
    correct,
    accuracy: questionsAnswered > 0 ? Math.round((correct / questionsAnswered) * 100) : 0,
    bestScore: partial && !hasDetail ? null : num(raw.bestScore),
    bestStreak: partial && !hasDetail ? null : num(raw.bestStreak),
    partial,
  };
}

function hasActivity(raw) {
  if (!raw) return false;
  return normalizeCategoryStat(raw).questionsAnswered > 0 || (num(raw.gamesPlayed) || 0) > 0;
}

/**
 * @param {object} categoryStats  { [categoryId]: record }
 * @param {Array}  groups         the tree's groups (utils/categories.js categoryGroups())
 * @param {(id) => string} nameFor label lookup
 * @returns {{ sections: Array<{id,name,rows:Array}>, hasPartial: boolean, isEmpty: boolean }}
 *   Sections follow the tree's order and only include categories that have
 *   records, so there are never empty sections.
 */
export function buildStatsSections(categoryStats, groups, nameFor) {
  const records = categoryStats || {};
  const seen = new Set();
  let hasPartial = false;

  const toRow = (id) => {
    const row = { id, name: nameFor(id), ...normalizeCategoryStat(records[id]) };
    hasPartial = hasPartial || row.partial;
    return row;
  };

  const sections = groups
    .map((group) => ({
      id: group.id,
      name: group.name,
      rows: group.categories
        .filter((leaf) => hasActivity(records[leaf.id]))
        .map((leaf) => {
          seen.add(leaf.id);
          return toRow(leaf.id);
        }),
    }))
    .filter((section) => section.rows.length > 0);

  // History for a category id that is no longer in the tree is kept, not
  // hidden: records are never discarded just because the tree changed.
  const orphans = Object.keys(records)
    .filter((id) => !seen.has(id) && hasActivity(records[id]))
    .sort()
    .map(toRow);
  if (orphans.length) sections.push({ id: 'other', name: 'Other', rows: orphans });

  return { sections, hasPartial, isEmpty: sections.length === 0 };
}
