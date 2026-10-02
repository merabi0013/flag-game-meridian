/**
 * categories.js
 * -----------------------------------------------------------------------
 * The frontend's view of the category tree in shared/categoryTree.json
 * (the SAME file the backend reads — edit it to add/rename/reorder
 * categories). This file is generic: it contains no category ids and no
 * per-category logic, so adding a category never touches it.
 *
 * What lives where:
 *   shared/categoryTree.json   structure, names, seed `type`, flag source
 *   backend `categories` table  the authoritative type/enabled/price
 *   this file                   resolving a category's flags + labels
 *
 * A leaf's `flagSource` says where its flags come from:
 *   { kind: 'bundled', where? }  filter the countries shipped in the app
 *                                (`where` is declarative, see matchesWhere)
 *   { kind: 'remote', dataset }  fetched from the backend, which checks
 *                                access (needed for anything paid)
 *
 * NOTE: `type` in the JSON is only a seed default for the backend. Nothing
 * here (or anywhere in the browser) uses it to decide access — see
 * utils/categoryCatalog.js for how the server's value is merged in.
 * -----------------------------------------------------------------------
 */
import tree from '../../shared/categoryTree.json';

export const CATEGORY_TREE = tree;

/**
 * Declarative filter over a country. Each key must match:
 *   { continent: 'Europe' }               equality
 *   { eurasia: true }                     equality
 *   { regions: { includes: 'Caucasus' } } array contains
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

/** Flat list of every leaf in a tree, each carrying its group's id. */
export function flattenLeaves(fromTree = tree) {
  return fromTree.groups.flatMap((group) => group.categories.map((leaf) => ({ ...leaf, groupId: group.id })));
}

const LEAVES = flattenLeaves();
const BY_ID = new Map(LEAVES.map((leaf) => [leaf.id, leaf]));

// Names the backend has renamed (admin panel), registered by the catalog
// provider so labels everywhere (results, profile, history) stay in step.
let nameOverrides = {};
export function setCategoryNameOverrides(map) {
  nameOverrides = map || {};
}

export function allCategories() {
  return LEAVES;
}

export function getCategoryDef(id) {
  return BY_ID.get(id);
}

/** Where this category's flags come from: 'bundled' | 'remote' | undefined. */
export function hostingOf(id) {
  const def = BY_ID.get(id);
  return def ? def.flagSource.kind : undefined;
}

/** True when the flags must be fetched from the backend (paid OR free). */
export function isRemoteCategory(id) {
  return hostingOf(id) === 'remote';
}

/**
 * Resolves a BUNDLED category's countries. For a remote category this is
 * always [] — its flags come from the backend (hooks/useRemoteCategoryCountries.js).
 */
export function countriesForCategory(id, allCountries, fromLeaf = BY_ID.get(id)) {
  if (!fromLeaf || fromLeaf.flagSource.kind !== 'bundled') return [];
  const { where } = fromLeaf.flagSource;
  return where ? allCountries.filter((c) => matchesWhere(c, where)) : allCountries.slice();
}

export function labelForCategory(id) {
  if (nameOverrides[id]) return nameOverrides[id];
  const def = BY_ID.get(id);
  return def ? def.name : id;
}
