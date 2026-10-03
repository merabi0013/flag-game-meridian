import { describe, it, expect } from 'vitest';
import { buildStatsSections, normalizeCategoryStat } from '../src/utils/categoryStats';
import { buildRegistry, categoryGroups, labelForCategory } from '../src/utils/categories';
import tree from '../src/data/categoryTree.json';

const rec = (o = {}) => ({ gamesPlayed: 2, questionsAnswered: 20, correct: 15, incorrect: 5, totalScore: 600, bestScore: 400, bestStreak: 6, ...o });

describe('normalizeCategoryStat', () => {
  it('computes accuracy from the records and passes the recorded metrics through', () => {
    expect(normalizeCategoryStat(rec())).toEqual({ gamesPlayed: 2, questionsAnswered: 20, correct: 15, accuracy: 75, bestScore: 400, bestStreak: 6, partial: false });
  });

  it('understands the legacy { asked, correct } shape and shows unrecorded metrics as null, not 0', () => {
    expect(normalizeCategoryStat({ asked: 10, correct: 7 })).toMatchObject({ questionsAnswered: 10, accuracy: 70, gamesPlayed: null, bestScore: null, bestStreak: null, partial: true });
  });

  it('keeps the detail it has for a partly-upgraded record, and flags it', () => {
    expect(normalizeCategoryStat({ ...rec(), partial: true })).toMatchObject({ gamesPlayed: 2, bestScore: 400, partial: true });
  });

  it('never divides by zero', () => {
    expect(normalizeCategoryStat({}).accuracy).toBe(0);
  });
});

describe('buildStatsSections', () => {
  const nameFor = labelForCategory;

  it('groups the played categories by the tree, in tree order', () => {
    const { sections, isEmpty } = buildStatsSections(
      { 'world-1914': rec(), europe: rec({ bestScore: 111 }), world: rec(), caucasus: rec(), asia: rec() },
      categoryGroups(),
      nameFor
    );
    expect(isEmpty).toBe(false);
    expect(sections.map((s) => [s.id, s.rows.map((r) => r.id)])).toEqual([
      ['world', ['world']],
      ['continents', ['europe', 'asia']],
      ['regions', ['caucasus']],
      ['historical', ['world-1914']],
    ]);
    expect(sections[1].rows[0]).toMatchObject({ name: 'Europe', bestScore: 111, accuracy: 75 });
  });

  it('is calculated from the records: change a record and the row changes', () => {
    const a = buildStatsSections({ europe: rec({ correct: 10 }) }, categoryGroups(), nameFor).sections[0].rows[0];
    const b = buildStatsSections({ europe: rec({ correct: 20 }) }, categoryGroups(), nameFor).sections[0].rows[0];
    expect([a.accuracy, b.accuracy]).toEqual([50, 100]);
  });

  it('omits categories and groups with no records (no empty sections)', () => {
    const { sections } = buildStatsSections({ europe: rec() }, categoryGroups(), nameFor);
    expect(sections.map((s) => s.id)).toEqual(['continents']);
    expect(sections[0].rows.map((r) => r.id)).toEqual(['europe']);
    expect(buildStatsSections({}, categoryGroups(), nameFor).isEmpty).toBe(true);
    expect(buildStatsSections(undefined, categoryGroups(), nameFor).isEmpty).toBe(true);
    expect(buildStatsSections({ asia: { gamesPlayed: 0, questionsAnswered: 0, correct: 0 } }, categoryGroups(), nameFor).isEmpty).toBe(true);
  });

  it('supports a category added to the tree without any code change', () => {
    const extended = structuredClone(tree);
    extended.groups.push({ id: 'themes', name: 'Themes', categories: [{ id: 'star-flags', name: 'Star flags', type: 'default', flagSource: { kind: 'bundled', where: { continent: 'Oceania' } } }] });
    const registry = buildRegistry(extended);
    const { sections } = buildStatsSections({ 'star-flags': rec() }, registry.groups, (id) => registry.byId.get(id).name);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ id: 'themes', name: 'Themes' });
    expect(sections[0].rows[0]).toMatchObject({ id: 'star-flags', name: 'Star flags', gamesPlayed: 2 });
  });

  it('keeps history for a category that is no longer in the tree, under "Other"', () => {
    const { sections } = buildStatsSections({ europe: rec(), retired: rec() }, categoryGroups(), nameFor);
    expect(sections.at(-1)).toMatchObject({ id: 'other', name: 'Other' });
    expect(sections.at(-1).rows[0]).toMatchObject({ id: 'retired', name: 'retired' });
  });

  it('reports when any row relies on older, less detailed records', () => {
    expect(buildStatsSections({ europe: rec() }, categoryGroups(), nameFor).hasPartial).toBe(false);
    expect(buildStatsSections({ europe: { asked: 4, correct: 1 } }, categoryGroups(), nameFor).hasPartial).toBe(true);
  });
});
