/**
 * routes/categories.js
 * -----------------------------------------------------------------------
 * Two very different trust levels on purpose:
 *   GET /api/categories/paid       - public. Price/enabled/premium state
 *                                    isn't sensitive; a guest needs to
 *                                    see it to render the category grid
 *                                    at all. (Route name predates
 *                                    free-but-registered categories like
 *                                    Historical maps -- kept stable
 *                                    rather than renamed, since the
 *                                    frontend already depends on it.)
 *   GET /api/categories/:id/countries - the actual content gate. A
 *                                    non-premium category (e.g. a free
 *                                    Historical map) is served to
 *                                    ANYONE, guests included, same as
 *                                    the bundled free categories always
 *                                    have been. A premium category still
 *                                    requires auth + a real entitlement
 *                                    (or admin bypass) -- see
 *                                    lib/entitlements.js's userHasAccess().
 * -----------------------------------------------------------------------
 */
const express = require('express');
const { listPaidCategories, getPaidCategory, userHasAccess } = require('../lib/entitlements');
const { loadCountriesForPaidCategory } = require('../lib/paidCategoryData');

function publicCategory(row) {
  return {
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    priceCents: row.price_cents,
    currency: row.currency,
    enabled: !!row.enabled,
    premium: !!row.premium,
  };
}

function buildCategoriesRouter() {
  const router = express.Router();

  router.get('/api/categories/paid', (req, res) => {
    res.json({ categories: listPaidCategories().map(publicCategory) });
  });

  router.get('/api/categories/:id/countries', (req, res) => {
    const category = getPaidCategory(req.params.id);
    if (!category) return res.status(404).json({ error: 'Unknown category' });

    const isAdmin = req.isAuthenticated && req.isAuthenticated() && req.user.is_admin;
    if (!category.enabled && !isAdmin) {
      return res.status(403).json({ error: 'This category is not currently available.' });
    }

    if (category.premium) {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: 'Sign in to play this category.' });
      }
      if (!userHasAccess(req.user, req.params.id)) {
        return res.status(403).json({ error: "You don't own this category yet." });
      }
    }
    // Non-premium (free) and enabled: open to anyone, guests included --
    // the same rule every other free category in this game already
    // follows, just served from the backend instead of the bundle.

    const countries = loadCountriesForPaidCategory(req.params.id);
    if (!countries) return res.status(404).json({ error: 'No data available for this category' });

    res.json({ countries });
  });

  return router;
}

module.exports = { buildCategoriesRouter };
