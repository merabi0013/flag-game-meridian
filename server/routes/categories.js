/**
 * routes/categories.js
 * -----------------------------------------------------------------------
 *   GET /api/categories                public tree: groups -> categories,
 *                                      each with the SERVER's type, enabled,
 *                                      price and derived flagNumber
 *   GET /api/categories/:id/countries  the content gate for server-hosted
 *                                      flag data (see lib/access.js)
 *
 * The tree structure comes from shared/categoryTree.json; the
 * configuration (type/enabled/price) comes from the `categories` table.
 * A category present in the table but no longer in the tree is retired:
 * its history stays, it just isn't offered.
 * -----------------------------------------------------------------------
 */
const express = require('express');
const { publicCategory, loadRemoteDataset } = require('../lib/categoryCatalog');

function buildCategoriesRouter({ repos, access, tree }) {
  const router = express.Router();

  router.get('/api/categories', async (req, res, next) => {
    try {
      const rows = new Map((await repos.categories.list()).map((c) => [c.id, c]));
      const groups = tree.groups.map((g) => ({
        id: g.id,
        name: g.name,
        categories: g.categories.filter((leaf) => rows.has(leaf.id)).map((leaf) => publicCategory(rows.get(leaf.id))),
      }));
      res.json({ groups });
    } catch (err) {
      next(err);
    }
  });

  router.get('/api/categories/:id/countries', async (req, res, next) => {
    try {
      const category = await repos.categories.get(req.params.id);
      if (!category) return res.status(404).json({ error: 'Unknown category' });
      if (category.flagSource.kind !== 'remote') {
        return res.status(404).json({ error: 'This category is bundled with the app and has no server-hosted flags.' });
      }
      const isAdmin = !!(req.user && req.user.isAdmin);
      if (!category.enabled && !isAdmin) return res.status(403).json({ error: 'This category is not currently available.' });
      if (category.type === 'paid') {
        if (!req.user) return res.status(401).json({ error: 'Sign in to play this category.' });
        if (!(await access.userHasAccess(req.user, category))) return res.status(403).json({ error: "You don't own this category yet." });
      }
      // type 'default' + enabled: open to anyone, guests included.

      const countries = loadRemoteDataset(category.flagSource.dataset);
      if (!countries) return res.status(404).json({ error: 'No data available for this category' });
      res.json({ countries });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildCategoriesRouter };
