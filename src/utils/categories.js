/**
 * categories.js
 * -----------------------------------------------------------------------
 * The category registry. It is GENERIC: it contains no category ids and no
 * per-category logic. What categories exist, how they are grouped, what
 * they are called, whether they are free or paid and where their flags
 * come from all live in ONE data file, src/data/categoryTree.json — a
 * two-level tree (groups -> categories). Edit that file to add, rename,
 * reorder or re-type a category; nothing in this file or in the game
 * engine changes (see docs/CATEGORIES.md).
 *
 * A leaf category looks like:
 *   {
 *     id:         'europe',              stable, never changed once players
 *                                        have history (stats are keyed by it)
 *     name:       'Europe',
 *     type:       'default' | 'paid',    default = free for everyone
 *     flagSource: one of
 *       { kind: 'bundled', where? }      filter of src/data/countries.json
 *       { kind: 'dataset', dataset }     src/data/datasets/<dataset>.json
 *       { kind: 'remote' }               fetched from the backend's
 *                                        entitlement-checked endpoint
 *   }
 * and the registry adds `flagNumber`, which is DERIVED from the flags
 * (never typed into the tree) and `groupId`.
 *
 * free vs paid:
 *   - `default` categories read their flags from the app bundle and are
 *     playable by anyone. The backend is not involved.
 *   - `paid` categories keep working exactly as the existing premium
 *     system built them: their flags are NEVER in the bundle, they are
 *     fetched from GET /api/categories/:id/countries which checks
 *     ownership server-side, and price / enabled / ownership come from the
 *     backend (hooks/usePaidAccess.js). Because bundled data is public, a
 *     paid category must use flagSource { kind: 'remote' } — validateTree()
 *     enforces that.
 * -----------------------------------------------------------------------
 */
import tree from '../data/categoryTree.json';
import { ALL_COUNTRIES } from '../data/countries';

export const CATEGORY_TYPES = ['default', 'paid'];
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

// Every dataset file in src/data/datasets/, keyed by file name without
// ".json" (e.g. 'world-1914'). Eager so the flag count can be derived and
// games can start synchronously; they are small.
const DATASET_MODULES = import.meta.glob('../data/datasets/*.json', { eager: true, import: 'default' });
export const DATASETS = Object.fromEntries(
  Object.entries(DATASET_MODULES).map(([path, data]) => [path.split('/').pop().replace(/\.json$/, ''), data])
);

/**
 * Declarative filter over a country. Each key must match:
 *   { continent: 'Europe' }                 equality
 *   { eurasia: true }                       equality
 *   { regions: { includes: 'Caucasus' } }   array contains
 * No `where` means "every country".
 */
export function matchesWhere(country, where) {
  if (!where) return true;
  return Object.entries(where).every(([field, expected]) => {
    const actual = country[field];
    if (expected && typeof expected === 'object' && 'includes' in expected) {
      return Array.isArray(actual) && actual.includes(expected.includes);
    }
    return actual === expected;
  });
}

/** Human-readable problems with a tree (empty array = valid). */
export function validateTree(candidate, { datasets = DATASETS } = {}) {
  const problems = [];
  if (!candidate || !Array.isArray(candidate.groups) || !candidate.groups.length) {
    return ['tree.groups must be a non-empty array'];
  }
  const groupIds = new Set();
  const leafIds = new Set();
  for (const group of candidate.groups) {
    if (!group.id || !ID_RE.test(group.id)) problems.push(`group id invalid: ${group.id}`);
    if (groupIds.has(group.id)) problems.push(`duplicate group id: ${group.id}`);
    groupIds.add(group.id);
    if (!group.name) problems.push(`group ${group.id} needs a name`);
    if (group.layout !== undefined && !['grid', 'list'].includes(group.layout)) {
      problems.push(`group ${group.id}: layout must be "grid" or "list"`);
    }
    if (group.featured !== undefined && typeof group.featured !== 'boolean') {
      problems.push(`group ${group.id}: featured must be true or false`);
    }
    if (!Array.isArray(group.categories) || !group.categories.length) {
      problems.push(`group ${group.id} needs at least one category`);
      continue;
    }
    for (const leaf of group.categories) {
      if (!leaf.id || !ID_RE.test(leaf.id)) problems.push(`category id invalid: ${leaf.id}`);
      if (leafIds.has(leaf.id)) problems.push(`duplicate category id: ${leaf.id}`);
      leafIds.add(leaf.id);
      if (!leaf.name) problems.push(`category ${leaf.id} needs a name`);
      if (!CATEGORY_TYPES.includes(leaf.type)) problems.push(`category ${leaf.id}: type must be "default" or "paid"`);
      const source = leaf.flagSource;
      if (!source || !['bundled', 'dataset', 'remote'].includes(source.kind)) {
        problems.push(`category ${leaf.id}: flagSource.kind must be "bundled", "dataset" or "remote"`);
      } else if (source.kind === 'dataset' && !(source.dataset in datasets)) {
        problems.push(`category ${leaf.id}: dataset "${source.dataset}" not found in src/data/datasets/`);
      }
      if (leaf.type === 'paid' && source && source.kind !== 'remote') {
        problems.push(`category ${leaf.id}: a paid category must use flagSource {kind:"remote"} (bundled data is public)`);
      }
    }
  }
  return problems;
}

/**
 * Builds the registry from a tree. Pure (no globals), so tests can build one
 * from a hypothetical tree. Throws if the tree is invalid.
 */
export function buildRegistry(sourceTree, { allCountries = ALL_COUNTRIES, datasets = DATASETS } = {}) {
  const problems = validateTree(sourceTree, { datasets });
  if (problems.length) throw new Error(`Invalid category tree:\n - ${problems.join('\n - ')}`);

  const byId = new Map();
  const groups = sourceTree.groups.map((group) => {
    const categories = group.categories.map((leaf) => {
      const { kind } = leaf.flagSource;
      const countries =
        kind === 'bundled'
          ? allCountries.filter((c) => matchesWhere(c, leaf.flagSource.where))
          : kind === 'dataset'
          ? datasets[leaf.flagSource.dataset]
          : null; // remote: only the backend knows
      const entry = {
        id: leaf.id,
        name: leaf.name,
        type: leaf.type,
        flagSource: leaf.flagSource,
        hosting: kind,
        groupId: group.id,
        // Derived, never hand-maintained. null = not known client-side
        // (a remote/paid category; the backend reports it once access is
        // confirmed).
        flagNumber: countries ? countries.length : null,
        countries,
      };
      byId.set(entry.id, entry);
      return entry;
    });
    return {
      id: group.id,
      name: group.name,
      featured: !!group.featured,
      layout: group.layout === 'list' ? 'list' : 'grid',
      categories,
    };
  });

  return { groups, byId, leaves: groups.flatMap((g) => g.categories) };
}

const registry = buildRegistry(tree);

export const CATEGORY_TREE = tree;

/** The groups in tree order: [{ id, name, featured, layout, categories: [leaf] }]. */
export function categoryGroups() {
  return registry.groups;
}

/** Every leaf category, in tree order. */
export function allCategories() {
  return registry.leaves;
}

export function getCategoryDef(id) {
  return registry.byId.get(id);
}

export function categoriesByGroup(groupId) {
  const group = registry.groups.find((g) => g.id === groupId);
  return group ? group.categories : [];
}

export function isPaidCategory(id) {
  const def = registry.byId.get(id);
  return !!def && def.type === 'paid';
}

/**
 * Resolves a category's countries for the game engine. Works the same for
 * every free category whatever its flag source. For a paid (remote)
 * category, or an unknown id, this is [] — paid flags come from the
 * backend (hooks/usePaidCategoryCountries.js) after access is verified.
 *
 * `allCountries` is accepted for callers that pass their own dataset
 * (the engine's `config.allCountries`); it is only used for bundled
 * categories.
 */
export function countriesForCategory(id, allCountries = ALL_COUNTRIES) {
  const def = registry.byId.get(id);
  if (!def || def.type === 'paid') return [];
  if (def.hosting === 'bundled') {
    return allCountries === ALL_COUNTRIES ? def.countries.slice() : allCountries.filter((c) => matchesWhere(c, def.flagSource.where));
  }
  if (def.hosting === 'dataset') return def.countries.slice();
  return [];
}

export function labelForCategory(id) {
  const def = registry.byId.get(id);
  return def ? def.name : id;
}
