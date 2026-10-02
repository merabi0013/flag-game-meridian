/**
 * categoryCatalog.js
 * -----------------------------------------------------------------------
 * Merges three sources into the one structure the UI renders:
 *
 *   1. the category tree in shared/categoryTree.json  (structure, names)
 *   2. GET /api/categories                            (the SERVER's type,
 *                                                      enabled, price, and
 *                                                      flag count)
 *   3. GET /api/me/access                             (what THIS user owns)
 *
 * The server's `type` always wins: the `type` in the JSON file is a seed
 * default for the database and is deliberately ignored here. If the server
 * is unreachable, bundled categories still work (they are free by
 * construction — bundled data can never be paid) and server-hosted ones
 * are simply not offered.
 *
 * Pure function: no React, no fetch — easy to test.
 * -----------------------------------------------------------------------
 */
import { countriesForCategory } from './categories';

/**
 * @param {object} tree            shared/categoryTree.json
 * @param {Array}  allCountries    the bundled dataset
 * @param {object|null} server     { groups: [...] } from GET /api/categories, or null
 * @param {object|null} access     { [id]: { owned, viaAdmin } } from GET /api/me/access, or null
 * @param {object} options         { includeRemote: false } hides every server-hosted category
 */
export function buildCatalog(tree, allCountries, server = null, access = null, { includeRemote = true } = {}) {
  const serverById = new Map();
  if (server && Array.isArray(server.groups)) {
    for (const group of server.groups) for (const c of group.categories) serverById.set(c.id, c);
  }

  const byId = {};
  const groups = tree.groups
    .map((group) => {
      const categories = group.categories
        .map((leaf) => {
          const remote = leaf.flagSource.kind === 'remote';
          const fromServer = serverById.get(leaf.id);

          // Server-hosted flags are only offered when the server told us
          // about the category; bundled ones always work.
          if (remote && (!includeRemote || !fromServer)) return null;

          const type = fromServer ? fromServer.type : 'default'; // bundled + no server: free by construction
          const enabled = fromServer ? fromServer.enabled : true;
          const paid = type === 'paid';
          const mine = access && access[leaf.id];
          const viaAdmin = paid && !!(mine && mine.viaAdmin);
          const owned = !paid || !!(mine && mine.owned);
          const unavailable = !enabled && !viaAdmin;

          const entry = {
            id: leaf.id,
            name: (fromServer && fromServer.name) || leaf.name,
            groupId: group.id,
            hosting: leaf.flagSource.kind,
            type,
            enabled,
            priceCents: fromServer ? fromServer.priceCents : 0,
            currency: fromServer ? fromServer.currency : 'usd',
            description: (fromServer && fromServer.description) || leaf.description || null,
            // Derived, never hand-maintained: server counts its dataset;
            // bundled counts are computed from the shipped data.
            flagNumber: remote ? (fromServer.flagNumber ?? 0) : countriesForCategory(leaf.id, allCountries, leaf).length,
            owned,
            viaAdmin,
            unavailable,
            locked: paid && !owned && !unavailable,
            playable: !unavailable && owned,
          };
          byId[leaf.id] = entry;
          return entry;
        })
        .filter(Boolean);

      return {
        id: group.id,
        name: group.name,
        featured: !!group.featured,
        layout: group.layout === 'list' ? 'list' : 'grid',
        categories,
      };
    })
    .filter((group) => group.categories.length > 0);

  return { groups, byId, serverLoaded: !!server };
}

/** Category names as the server has them, for labels outside the picker. */
export function nameOverridesFrom(catalog) {
  const map = {};
  for (const entry of Object.values(catalog.byId)) map[entry.id] = entry.name;
  return map;
}
