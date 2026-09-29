/**
 * paidCategoryData.js
 * -----------------------------------------------------------------------
 * The game-data side of paid categories: what countries/flags belong to
 * this category. Knows nothing about price, ownership, or payments — see
 * entitlements.js for that half.
 *
 * Data files live under server/data/ (not the public frontend bundle),
 * and are only ever served through GET /api/categories/:id/countries,
 * which checks entitlements.userHasAccess() first. This is what makes
 * "own it" actually mean something for this content, rather than the
 * data simply sitting in a fetchable static file.
 *
 * Adding a future paid category (e.g. "World 1939") is: add its JSON
 * file here, add one line to DATA_SOURCES, add one row to the
 * paid_categories table (see db/index.js's seed for the pattern). No
 * other file in the payment system needs to change.
 * -----------------------------------------------------------------------
 */
const path = require('path');
const fs = require('fs');

const DATA_SOURCES = {
  'world-1914': path.join(__dirname, '..', 'data', 'world-1914.json'),
  'world-1991': path.join(__dirname, '..', 'data', 'world-1991.json'),
  'world-1945': path.join(__dirname, '..', 'data', 'world-1945.json'),
};

const cache = new Map();

function loadCountriesForPaidCategory(categoryId) {
  if (cache.has(categoryId)) return cache.get(categoryId);

  const filePath = DATA_SOURCES[categoryId];
  if (!filePath || !fs.existsSync(filePath)) return null;

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  cache.set(categoryId, data);
  return data;
}

module.exports = { loadCountriesForPaidCategory };
