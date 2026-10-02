import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import tree from '../shared/categoryTree.json';
import { ALL_COUNTRIES } from '../src/data/countries';
import {
  allCategories,
  countriesForCategory,
  flattenLeaves,
  getCategoryDef,
  hostingOf,
  isRemoteCategory,
  labelForCategory,
  matchesWhere,
  setCategoryNameOverrides,
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
const LEGACY_LABELS = { oceania: 'Australia / Oceania', 'south-america-region': 'South America', 'world-1914': 'World 1914' };

describe('the category tree', () => {
  it('is two levels: groups containing categories', () => {
    expect(tree.groups.map((g) => g.id)).toEqual(['world', 'continents', 'regions', 'historical']);
    for (const g of tree.groups) {
      expect(g.categories.length).toBeGreaterThan(0);
      for (const c of g.categories) expect(c.categories).toBeUndefined();
    }
  });

  it('keeps every existing category id, with unique ids', () => {
    const ids = flattenLeaves().map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [...Object.keys(LEGACY), 'world-1914', 'world-1991', 'world-1945']) expect(ids).toContain(id);
    expect(ids).toHaveLength(Object.keys(LEGACY).length + 3);
  });

  it('gives every category a name, a type and a flag source', () => {
    for (const leaf of allCategories()) {
      expect(leaf.name, leaf.id).toBeTruthy();
      expect(['default', 'paid']).toContain(leaf.type);
      expect(['bundled', 'remote']).toContain(leaf.flagSource.kind);
    }
  });

  it('points every remote category at a dataset the backend actually has', () => {
    for (const leaf of allCategories().filter((l) => l.flagSource.kind === 'remote')) {
      expect(existsSync(new URL(`../server/data/${leaf.flagSource.dataset}.json`, import.meta.url)), leaf.id).toBe(true);
    }
  });

  it('allows only server-hosted categories to be paid (bundled flags are public)', () => {
    for (const leaf of allCategories().filter((l) => l.type === 'paid')) expect(leaf.flagSource.kind).toBe('remote');
  });

  it('never stores a flag count (it is derived)', () => {
    for (const leaf of allCategories()) expect(leaf.flagNumber).toBeUndefined();
  });
});

describe('resolving bundled flags', () => {
  it.each(Object.keys(LEGACY))('%s selects exactly the same flags as before the refactor', (id) => {
    const expected = ALL_COUNTRIES.filter(LEGACY[id]).map((c) => c.id);
    const actual = countriesForCategory(id, ALL_COUNTRIES).map((c) => c.id);
    expect(actual).toEqual(expected);
    expect(actual.length).toBeGreaterThan(0);
  });

  it('World is every flag, as a copy', () => {
    const world = countriesForCategory('world', ALL_COUNTRIES);
    expect(world).toHaveLength(ALL_COUNTRIES.length);
    expect(world).not.toBe(ALL_COUNTRIES);
  });

  it('returns nothing for server-hosted or unknown categories (their flags come from the backend)', () => {
    expect(countriesForCategory('world-1914', ALL_COUNTRIES)).toEqual([]);
    expect(countriesForCategory('no-such-category', ALL_COUNTRIES)).toEqual([]);
  });

  it('reports where each category is hosted', () => {
    expect(hostingOf('europe')).toBe('bundled');
    expect(hostingOf('world-1991')).toBe('remote');
    expect(isRemoteCategory('world-1914')).toBe(true);
    expect(isRemoteCategory('asia')).toBe(false);
    expect(hostingOf('nope')).toBeUndefined();
    expect(getCategoryDef('caucasus').name).toBe('Caucasus');
  });
});

describe('labels', () => {
  it('come from the tree, keep their old wording, and fall back to the id', () => {
    for (const [id, label] of Object.entries(LEGACY_LABELS)) expect(labelForCategory(id)).toBe(label);
    expect(labelForCategory('retired-thing')).toBe('retired-thing');
  });

  it('follow a rename made on the server', () => {
    setCategoryNameOverrides({ europe: 'Old Continent' });
    expect(labelForCategory('europe')).toBe('Old Continent');
    setCategoryNameOverrides({});
    expect(labelForCategory('europe')).toBe('Europe');
  });
});

describe('matchesWhere', () => {
  const c = { continent: 'Asia', eurasia: true, regions: ['Caucasus', 'Middle East'] };
  it('supports equality and array-includes, all conditions required', () => {
    expect(matchesWhere(c, { continent: 'Asia' })).toBe(true);
    expect(matchesWhere(c, { continent: 'Europe' })).toBe(false);
    expect(matchesWhere(c, { eurasia: true })).toBe(true);
    expect(matchesWhere(c, { regions: { includes: 'Caucasus' } })).toBe(true);
    expect(matchesWhere(c, { regions: { includes: 'Caribbean' } })).toBe(false);
    expect(matchesWhere(c, { continent: 'Asia', regions: { includes: 'Caribbean' } })).toBe(false);
    expect(matchesWhere({}, { regions: { includes: 'x' } })).toBe(false);
  });
  it('treats a missing filter as "everything"', () => {
    expect(matchesWhere(c, undefined)).toBe(true);
  });
});

describe('adding a hypothetical new category is data only', () => {
  const extended = {
    groups: [
      ...tree.groups,
      {
        id: 'themes',
        name: 'Themes',
        categories: [
          { id: 'star-flags', name: 'Flags with stars', type: 'default', flagSource: { kind: 'bundled', where: { continent: 'Oceania' } } },
        ],
      },
    ],
  };
  it('resolves through the same generic code path with no per-category logic', () => {
    const leaf = flattenLeaves(extended).find((l) => l.id === 'star-flags');
    expect(leaf.groupId).toBe('themes');
    const flags = countriesForCategory('star-flags', ALL_COUNTRIES, leaf);
    expect(flags.length).toBeGreaterThan(0);
    expect(flags.every((f) => f.continent === 'Oceania')).toBe(true);
  });
});
