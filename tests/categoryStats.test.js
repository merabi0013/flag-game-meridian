import { describe, it, expect } from 'vitest';
import tree from '../shared/categoryTree.json';
import { buildStatsSections, normalizeCategoryStat } from '../src/utils/categoryStats';

const nameFor = (id) => ({ europe: 'Europe', asia: 'Asia', 'world-1914': 'World 1914', caucasus: 'Caucasus' }[id] || id);
const serverStat = (o = {}) => ({ gamesPlayed: 2, questionsAnswered: 20, correct: 12, incorrect: 8, skipped: 0, accuracy: 60, bestScore: 400, bestStreak: 5, averageScore: 300, asked: 20, ...o });

describe('normalizeCategoryStat', () => {
  it('passes the server shape through', () => {
    expect(normalizeCategoryStat(serverStat())).toEqual({
      gamesPlayed: 2, questionsAnswered: 20, correct: 12, accuracy: 60, bestScore: 400, bestStreak: 5, averageScore: 300, partial: false,
    });
  });

  it('computes accuracy itself and treats a category with no questions as 0%', () => {
    expect(normalizeCategoryStat({ questionsAnswered: 3, correct: 1 }).accuracy).toBe(33);
    expect(normalizeCategoryStat({}).accuracy).toBe(0);
  });

  it('reads the legacy { asked, correct } shape without inventing missing numbers', () => {
    const s = normalizeCategoryStat({ asked: 10, correct: 7 });
    expect(s).toMatchObject({ questionsAnswered: 10, correct: 7, accuracy: 70, gamesPlayed: null, bestScore: null, bestStreak: null, averageScore: null });
  });

  it('derives the average from a stored total when the average itself is missing (guest data)', () => {
    expect(normalizeCategoryStat({ gamesPlayed: 4, totalScore: 1001, questionsAnswered: 8, correct: 4 }).averageScore).toBe(250);
  });
});

describe('buildStatsSections', () => {
  it('groups played categories by the tree, in tree order, and skips categories never played', () => {
    const { sections, isEmpty } = buildStatsSections(
      { asia: serverStat(), europe: serverStat({ gamesPlayed: 1 }), caucasus: serverStat({ bestScore: 50 }), 'world-1914': serverStat() },
      tree,
      nameFor
    );
    expect(isEmpty).toBe(false);
    expect(sections.map((s) => s.id)).toEqual(['continents', 'regions', 'historical']);
    expect(sections[0].rows.map((r) => r.id)).toEqual(['europe', 'asia']); // tree order, not insertion order
    expect(sections[0].rows[0]).toMatchObject({ name: 'Europe', gamesPlayed: 1, accuracy: 60, bestScore: 400, bestStreak: 5, averageScore: 300 });
    expect(sections[1].rows[0]).toMatchObject({ id: 'caucasus', bestScore: 50 });
  });

  it('is empty when nothing has been played', () => {
    expect(buildStatsSections({}, tree, nameFor)).toEqual({ sections: [], hasPartial: false, isEmpty: true });
    expect(buildStatsSections(undefined, tree, nameFor).isEmpty).toBe(true);
    expect(buildStatsSections({ europe: { asked: 0, correct: 0 } }, tree, nameFor).isEmpty).toBe(true);
  });

  it('keeps history for a category that has left the tree, under "Other"', () => {
    const { sections } = buildStatsSections({ europe: serverStat(), 'retired-cat': serverStat() }, tree, nameFor);
    expect(sections[sections.length - 1]).toMatchObject({ id: 'other', name: 'Other' });
    expect(sections[sections.length - 1].rows[0].id).toBe('retired-cat');
  });

  it('flags partially detailed guest history', () => {
    const { hasPartial } = buildStatsSections({ europe: { asked: 5, correct: 3, gamesPlayed: 1, partial: true } }, tree, nameFor);
    expect(hasPartial).toBe(true);
  });

  it('produces rows for a hypothetical new category with no code change', () => {
    const extended = { groups: [...tree.groups, { id: 'themes', name: 'Themes', categories: [{ id: 'star-flags', name: 'Star flags', type: 'default', flagSource: { kind: 'bundled' } }] }] };
    const { sections } = buildStatsSections({ 'star-flags': serverStat() }, extended, (id) => (id === 'star-flags' ? 'Star flags' : id));
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ id: 'themes', name: 'Themes' });
    expect(sections[0].rows[0]).toMatchObject({ id: 'star-flags', name: 'Star flags', accuracy: 60 });
  });
});
