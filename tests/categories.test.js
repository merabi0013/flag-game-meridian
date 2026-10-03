import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import tree from '../src/data/categoryTree.json';
import { ALL_COUNTRIES } from '../src/data/countries';
import { createInitialState } from '../src/utils/gameLogic';
import {
  CATEGORY_TREE,
  DATASETS,
  allCategories,
  buildRegistry,
  categoriesByGroup,
  categoryGroups,
  countriesForCategory,
  getCategoryDef,
  isPaidCategory,
  labelForCategory,
  matchesWhere,
  validateTree,
} from '../src/utils/categories';

// The category rules exactly as they were hard-coded before the tree
// refactor. The tree must select the SAME flags for every existing id.
const LEGACY = {
  world: () => true,
  europe: (c) => c.continent === 'Europe',
  asia: (c) => c.continent === 'Asia',
  eurasia: (c) => c.eurasia === true,
  africa: (c) => c.continent === 'Africa',
  'north-america': (c) => c.continent === 'North America',
  'south-america': (c) => c.continent === 'South America',
  oceania: (c) => c.continent === 'Oceania',
  ...Object.fromEntries(
    [
      ['middle-east', 'Middle East'],
      ['western-europe', 'Western Europe'],
      ['northern-europe', 'Northern Europe'],
      ['southern-europe', 'Southern Europe'],
      ['eastern-europe', 'Eastern Europe'],
      ['central-europe', 'Central Europe'],
      ['caucasus', 'Caucasus'],
      ['southeast-asia', 'Southeast Asia'],
      ['east-asia', 'East Asia'],
      ['south-asia', 'South Asia'],
      ['central-asia', 'Central Asia'],
      ['north-africa', 'North Africa'],
      ['sub-saharan-africa', 'Sub-Saharan Africa'],
      ['central-america', 'Central America'],
      ['caribbean', 'Caribbean'],
      ['south-america-region', 'South America'],
      ['north-america-region', 'North America'],
      ['oceania-region', 'Oceania'],
    ].map(([id, region]) => [id, (c) => c.regions.includes(region)])
  ),
};
const LEGACY_LABELS = { oceania: 'Australia / Oceania', 'south-america-region': 'South America', 'north-america-region': 'North America', 'oceania-region': 'Oceania', 'world-1914': 'World 1914' };
const HISTORICAL = ['world-1914', 'world-1945', 'world-1991'];

describe('the category tree', () => {
  it('is two levels: groups containing categories', () => {
    expect(tree.groups.map((g) => g.id)).toEqual(['world', 'continents', 'regions', 'historical']);
    for (const group of tree.groups) {
      expect(group.categories.length).toBeGreaterThan(0);
      for (const leaf of group.categories) expect(leaf.categories).toBeUndefined(); // no third level
    }
    expect(CATEGORY_TREE).toBe(tree);
  });

  it('is valid, as shipped', () => {
    expect(validateTree(tree)).toEqual([]);
  });

  it('keeps every existing category id, once', () => {
    const ids = allCategories().map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [...Object.keys(LEGACY), ...HISTORICAL]) expect(ids).toContain(id);
    expect(ids).toHaveLength(Object.keys(LEGACY).length + HISTORICAL.length);
  });

  it('gives every leaf the same data model: id, name, flagNumber, flagSource, type', () => {
    for (const leaf of allCategories()) {
      expect(leaf.id, leaf.id).toMatch(/^[a-z0-9-]+$/);
      expect(leaf.name, leaf.id).toBeTruthy();
      expect(['default', 'paid']).toContain(leaf.type);
      expect(['bundled', 'dataset', 'remote']).toContain(leaf.flagSource.kind);
      expect(Number.isInteger(leaf.flagNumber) && leaf.flagNumber > 0, leaf.id).toBe(true);
      expect(leaf.groupId).toBe(categoryGroups().find((g) => g.categories.includes(leaf)).id);
    }
  });

  it('keeps the labels players already know', () => {
    for (const [id, label] of Object.entries(LEGACY_LABELS)) expect(labelForCategory(id)).toBe(label);
    expect(labelForCategory('not-a-category')).toBe('not-a-category'); // unknown ids degrade to the id
  });

  it('exposes the groups for the UI', () => {
    expect(categoriesByGroup('continents')).toHaveLength(7);
    expect(categoriesByGroup('regions')).toHaveLength(18);
    expect(categoriesByGroup('historical').map((l) => l.id)).toEqual(['world-1914', 'world-1945', 'world-1991']);
    expect(categoriesByGroup('nope')).toEqual([]);
    expect(categoryGroups().find((g) => g.id === 'world').featured).toBe(true);
    expect(categoryGroups().find((g) => g.id === 'historical').layout).toBe('list');
  });
});

describe('existing bundled categories are unchanged', () => {
  it.each(Object.entries(LEGACY))('%s selects exactly the flags it did before the refactor', (id, predicate) => {
    const expected = ALL_COUNTRIES.filter(predicate).map((c) => c.id);
    expect(countriesForCategory(id, ALL_COUNTRIES).map((c) => c.id)).toEqual(expected);
    expect(getCategoryDef(id).flagNumber).toBe(expected.length);
    expect(getCategoryDef(id).type).toBe('default');
  });
});

describe('historical maps are free', () => {
  it.each(HISTORICAL)('%s is a default (free) category that is playable without any backend', (id) => {
    const def = getCategoryDef(id);
    expect(def.type).toBe('default');
    expect(isPaidCategory(id)).toBe(false);
    expect(def.flagSource.kind).toBe('dataset');
    const flags = countriesForCategory(id, ALL_COUNTRIES);
    expect(flags.length).toBeGreaterThan(5);
    expect(def.flagNumber).toBe(flags.length); // derived from the dataset itself
    expect(flags.every((f) => f.id && f.name && f.flagSvg)).toBe(true);
  });

  it('no category in the shipped tree is paid', () => {
    expect(allCategories().filter((l) => l.type === 'paid')).toEqual([]);
  });

  it('the bundled datasets are identical to the backend\'s copies (premium infrastructure)', () => {
    for (const id of HISTORICAL) {
      const server = JSON.parse(readFileSync(new URL(`../server/data/${id}.json`, import.meta.url), 'utf8'));
      expect(DATASETS[id], id).toEqual(server);
    }
  });
});

describe('every category launches through the same game engine', () => {
  it.each(allCategories().map((l) => l.id))('%s', (id) => {
    const state = createInitialState({
      categoryId: id,
      allCountries: ALL_COUNTRIES,
      difficulty: 'normal',
      questionCount: 5,
      timerEnabled: false,
    });
    expect(state.error).toBeFalsy();
    const pool = new Set(countriesForCategory(id, ALL_COUNTRIES).map((c) => c.id));
    expect(state.questions.length).toBe(Math.min(5, pool.size));
    expect(state.questions.every((q) => pool.has(q.id))).toBe(true);
  });

  it('an unknown category id fails gracefully instead of crashing', () => {
    const state = createInitialState({ categoryId: 'nope', allCountries: ALL_COUNTRIES, difficulty: 'normal', questionCount: 5 });
    expect(state.error).toBeTruthy();
  });
});

describe('free / paid is configuration, not code', () => {
  it('a paid category is supported by the data model and is resolved by the backend path', () => {
    const paidTree = {
      groups: [{ id: 'g', name: 'G', categories: [{ id: 'premium-map', name: 'Premium map', type: 'paid', flagSource: { kind: 'remote' } }] }],
    };
    const registry = buildRegistry(paidTree);
    const leaf = registry.byId.get('premium-map');
    expect(leaf.type).toBe('paid');
    expect(leaf.flagNumber).toBeNull(); // only the backend knows once access is confirmed
    expect(leaf.countries).toBeNull(); // and no flags are ever bundled for it
  });

  it('refuses a paid category whose flags are bundled (they would be public)', () => {
    const problems = validateTree({
      groups: [{ id: 'g', name: 'G', categories: [{ id: 'leaky', name: 'Leaky', type: 'paid', flagSource: { kind: 'dataset', dataset: 'world-1914' } }] }],
    });
    expect(problems.join()).toMatch(/paid category must use flagSource/);
  });

  it('switching a historical map between free and paid is a change to its `type` and flag source only', () => {
    const asPaid = structuredClone(tree);
    const leaf = asPaid.groups.find((g) => g.id === 'historical').categories.find((c) => c.id === 'world-1914');
    leaf.type = 'paid';
    leaf.flagSource = { kind: 'remote' };
    const registry = buildRegistry(asPaid);
    expect(registry.byId.get('world-1914').type).toBe('paid');
    expect(registry.byId.get('world-1991').type).toBe('default'); // others untouched
  });
});

describe('adding a category is data only', () => {
  it('a new category and a new group are picked up with no code change', () => {
    const extended = structuredClone(tree);
    extended.groups.find((g) => g.id === 'regions').categories.push({
      id: 'balkans',
      name: 'Balkans',
      type: 'default',
      flagSource: { kind: 'bundled', where: { regions: { includes: 'Southern Europe' }, continent: 'Europe' } },
    });
    extended.groups.push({
      id: 'themes',
      name: 'Themes',
      categories: [{ id: 'oceania-flags', name: 'Oceania flags', type: 'default', flagSource: { kind: 'bundled', where: { continent: 'Oceania' } } }],
    });
    const registry = buildRegistry(extended);
    expect(registry.byId.get('balkans').flagNumber).toBe(
      ALL_COUNTRIES.filter((c) => c.regions.includes('Southern Europe') && c.continent === 'Europe').length
    );
    expect(registry.groups.map((g) => g.id)).toContain('themes');
    expect(registry.leaves).toHaveLength(allCategories().length + 2);

    // and it plays through the unchanged engine
    const state = createInitialState({
      categoryId: 'balkans',
      allCountries: ALL_COUNTRIES,
      difficulty: 'easy',
      questionCount: 3,
      pool: registry.byId.get('balkans').countries,
    });
    expect(state.error).toBeFalsy();
    expect(state.questions).toHaveLength(3);
  });

  it('a new category backed by its own dataset needs only the data file', () => {
    const datasets = { 'world-1939': [{ id: 'de-1939', name: 'Germany', flagSvg: 'x.svg' }, { id: 'pl-1939', name: 'Poland', flagSvg: 'y.svg' }] };
    const registry = buildRegistry(
      { groups: [{ id: 'historical', name: 'Historical', categories: [{ id: 'world-1939', name: 'World 1939', type: 'default', flagSource: { kind: 'dataset', dataset: 'world-1939' } }] }] },
      { datasets }
    );
    expect(registry.byId.get('world-1939').flagNumber).toBe(2);
  });
});

describe('validateTree reports mistakes', () => {
  const bad = (leaf, groupExtra = {}) => validateTree({ groups: [{ id: 'g', name: 'G', ...groupExtra, categories: [leaf] }] }).join('\n');
  const ok = { id: 'a', name: 'A', type: 'default', flagSource: { kind: 'bundled' } };

  it('catches duplicates, bad ids/types/sources and missing datasets', () => {
    expect(validateTree({ groups: [] })).not.toEqual([]);
    expect(validateTree({ groups: [{ id: 'g', name: 'G', categories: [ok, ok] }] }).join()).toMatch(/duplicate category id: a/);
    expect(validateTree({ groups: [{ id: 'g', name: 'G', categories: [ok] }, { id: 'g', name: 'G2', categories: [{ ...ok, id: 'b' }] }] }).join()).toMatch(/duplicate group id/);
    expect(bad({ ...ok, id: 'Bad Id' })).toMatch(/category id invalid/);
    expect(bad({ ...ok, type: 'free' })).toMatch(/type must be/);
    expect(bad({ ...ok, flagSource: { kind: 'magic' } })).toMatch(/flagSource.kind/);
    expect(bad({ ...ok, flagSource: { kind: 'dataset', dataset: 'missing' } })).toMatch(/not found/);
    expect(bad(ok, { layout: 'cloud' })).toMatch(/layout/);
    expect(bad({ ...ok, name: '' })).toMatch(/needs a name/);
  });

  it('buildRegistry throws on an invalid tree rather than half-loading it', () => {
    expect(() => buildRegistry({ groups: [{ id: 'g', name: 'G', categories: [{ ...ok, type: 'x' }] }] })).toThrow(/Invalid category tree/);
  });
});

describe('matchesWhere', () => {
  const country = { continent: 'Europe', eurasia: false, regions: ['Caucasus', 'Western Europe'] };
  it('supports equality, array-includes and no filter', () => {
    expect(matchesWhere(country, undefined)).toBe(true);
    expect(matchesWhere(country, { continent: 'Europe' })).toBe(true);
    expect(matchesWhere(country, { continent: 'Asia' })).toBe(false);
    expect(matchesWhere(country, { regions: { includes: 'Caucasus' } })).toBe(true);
    expect(matchesWhere(country, { regions: { includes: 'Nope' } })).toBe(false);
    expect(matchesWhere({ regions: undefined }, { regions: { includes: 'x' } })).toBe(false);
  });
});
