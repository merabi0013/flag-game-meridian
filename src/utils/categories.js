/**
 * categories.js
 * -----------------------------------------------------------------------
 * Continents (incl. Eurasia as a landmass union), regions, and World.
 * Pure data + predicates over a country array — ported from the previous
 * vanilla-JS js/categories.js with identical category ids and labels, so
 * existing localStorage guest stats (keyed by these ids) stay valid.
 *
 * Paid categories (access: 'paid') are listed here too, so they appear
 * in the same "World" group as free ones — but this file only carries
 * their id/name/group. Price, enabled/disabled state, and ownership are
 * never hard-coded here; they're always live values from the backend
 * (GET /api/categories/paid, GET /api/me/access — see
 * hooks/usePaidCategories.js), because those can change at any time via
 * the admin panel. `countriesForCategory()` below only resolves the
 * FREE, bundled dataset — a paid category's actual flags come from
 * GET /api/categories/:id/countries (entitlement-checked server-side),
 * fetched separately once ownership is confirmed. Deliberately: this
 * file answers "what categories exist", not "who can play them".
 * -----------------------------------------------------------------------
 */

const CONTINENT_DEFS = [
  { id: 'world', label: 'World', group: 'world', access: 'free' },
  { id: 'europe', label: 'Europe', group: 'continent', access: 'free', match: (c) => c.continent === 'Europe' },
  { id: 'asia', label: 'Asia', group: 'continent', access: 'free', match: (c) => c.continent === 'Asia' },
  { id: 'eurasia', label: 'Eurasia', group: 'continent', access: 'free', match: (c) => c.eurasia === true },
  { id: 'africa', label: 'Africa', group: 'continent', access: 'free', match: (c) => c.continent === 'Africa' },
  { id: 'north-america', label: 'North America', group: 'continent', access: 'free', match: (c) => c.continent === 'North America' },
  { id: 'south-america', label: 'South America', group: 'continent', access: 'free', match: (c) => c.continent === 'South America' },
  { id: 'oceania', label: 'Australia / Oceania', group: 'continent', access: 'free', match: (c) => c.continent === 'Oceania' },
];

/**
 * Historical maps — a category group of its own (not nested under
 * World), each backed by an entitlement-gated backend endpoint the same
 * way World 1914 always has been. Some are free by default (Historical
 * maps default to premium: false server-side — see server/db/index.js's
 * seed and README "Historical categories"); World 1914 predates this
 * group and keeps its existing premium status and stable id unchanged
 * (README "Backward compatibility" — no purchase/history record was
 * ever invalidated by adding this group).
 */
const HISTORICAL_DEFS = [
  { id: 'world-1914', label: 'World 1914', group: 'historical', access: 'paid' },
  { id: 'world-1991', label: 'World 1991', group: 'historical', access: 'paid' },
  { id: 'world-1945', label: 'World 1945', group: 'historical', access: 'paid' },
];

const REGION_DEFS = [
  { id: 'middle-east', label: 'Middle East', region: 'Middle East' },
  { id: 'western-europe', label: 'Western Europe', region: 'Western Europe' },
  { id: 'northern-europe', label: 'Northern Europe', region: 'Northern Europe' },
  { id: 'southern-europe', label: 'Southern Europe', region: 'Southern Europe' },
  { id: 'eastern-europe', label: 'Eastern Europe', region: 'Eastern Europe' },
  { id: 'central-europe', label: 'Central Europe', region: 'Central Europe' },
  { id: 'caucasus', label: 'Caucasus', region: 'Caucasus' },
  { id: 'southeast-asia', label: 'Southeast Asia', region: 'Southeast Asia' },
  { id: 'east-asia', label: 'East Asia', region: 'East Asia' },
  { id: 'south-asia', label: 'South Asia', region: 'South Asia' },
  { id: 'central-asia', label: 'Central Asia', region: 'Central Asia' },
  { id: 'north-africa', label: 'North Africa', region: 'North Africa' },
  { id: 'sub-saharan-africa', label: 'Sub-Saharan Africa', region: 'Sub-Saharan Africa' },
  { id: 'central-america', label: 'Central America', region: 'Central America' },
  { id: 'caribbean', label: 'Caribbean', region: 'Caribbean' },
  { id: 'south-america-region', label: 'South America', region: 'South America' },
  { id: 'north-america-region', label: 'North America', region: 'North America' },
  { id: 'oceania-region', label: 'Oceania', region: 'Oceania' },
].map((r) => ({ ...r, group: 'region', access: 'free', match: (c) => c.regions.includes(r.region) }));

const ALL_DEFS = [...CONTINENT_DEFS, ...REGION_DEFS, ...HISTORICAL_DEFS];

export function allCategories() {
  return ALL_DEFS;
}

export function categoriesByGroup(group) {
  return ALL_DEFS.filter((c) => c.group === group);
}

export function getCategoryDef(id) {
  return ALL_DEFS.find((c) => c.id === id);
}

export function isPaidCategory(id) {
  const def = getCategoryDef(id);
  return !!def && def.access === 'paid';
}

/** Resolves a FREE category's countries from the bundled dataset. For a
 * paid category this always returns [] — see the file header comment;
 * use hooks/usePaidCategoryCountries.js instead for those. */
export function countriesForCategory(id, allCountries) {
  const def = getCategoryDef(id);
  if (!def || def.access === 'paid') return [];
  if (def.id === 'world') return allCountries.slice();
  return allCountries.filter(def.match);
}

export function labelForCategory(id) {
  const def = getCategoryDef(id);
  return def ? def.label : id;
}
