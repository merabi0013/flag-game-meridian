/**
 * categoryStats.js
 * -----------------------------------------------------------------------
 * Turns a `categoryStats` object (from GET /api/me/stats, or the guest's
 * localStorage) plus the category tree into the grouped rows the profile
 * page renders. Nothing here names a category: the sections come from the
 * tree's groups and the rows from whatever categories actually appear in
 * the performance records, so a new category shows up on its own.
 *
 * Only real, recorded numbers are shown. A metric that was never recorded
 * (older guest data) is `null` and rendered as "—", never guessed.
 * -----------------------------------------------------------------------
 */

const num = (v) => (Number.isFinite(v) ? v : null);
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Accepts the server's rich shape, the guest's rich shape, or the legacy { asked, correct }. */
export function normalizeCategoryStat(raw = {}) {
  const questionsAnswered = num(raw.questionsAnswered) ?? num(raw.asked) ?? 0;
  const correct = num(raw.correct) ?? 0;
  const gamesPlayed = num(raw.gamesPlayed);
  const totalScore = num(raw.totalScore);
  const averageScore = num(raw.averageScore) ?? (gamesPlayed && totalScore !== null ? Math.round(totalScore / gamesPlayed) : null);
  return {
    gamesPlayed,
    questionsAnswered,
    correct,
    accuracy: pct(correct, questionsAnswered),
    bestScore: num(raw.bestScore),
    bestStreak: num(raw.bestStreak),
    averageScore,
    partial: !!raw.partial,
  };
}

/**
 * @param {object} categoryStats  { [categoryId]: rawStat }
 * @param {object} tree           shared/categoryTree.json
 * @param {(id) => string} nameFor label lookup
 * @returns {{ sections: Array<{id,name,rows:Array}>, hasPartial: boolean, isEmpty: boolean }}
 */
export function buildStatsSections(categoryStats, tree, nameFor) {
  const stats = categoryStats || {};
  const seen = new Set();
  let hasPartial = false;

  const played = (id) => {
    const raw = stats[id];
    return raw && (normalizeCategoryStat(raw).questionsAnswered > 0 || (num(raw.gamesPlayed) || 0) > 0);
  };

  const sections = tree.groups
    .map((group) => {
      const rows = group.categories
        .filter((leaf) => played(leaf.id))
        .map((leaf) => {
          seen.add(leaf.id);
          const row = { id: leaf.id, name: nameFor(leaf.id), ...normalizeCategoryStat(stats[leaf.id]) };
          hasPartial = hasPartial || row.partial;
          return row;
        });
      return { id: group.id, name: group.name, rows };
    })
    .filter((section) => section.rows.length > 0);

  // History for a category that has since left the tree is kept, not hidden.
  const orphans = Object.keys(stats)
    .filter((id) => !seen.has(id) && played(id))
    .sort()
    .map((id) => {
      const row = { id, name: nameFor(id), ...normalizeCategoryStat(stats[id]) };
      hasPartial = hasPartial || row.partial;
      return row;
    });
  if (orphans.length) sections.push({ id: 'other', name: 'Other', rows: orphans });

  return { sections, hasPartial, isEmpty: sections.length === 0 };
}
