/**
 * lib/categoryCatalog.js
 * -----------------------------------------------------------------------
 * The backend's view of the category tree in shared/categoryTree.json
 * (the same file the React app bundles):
 *
 *   loadTree()            parse + validate the tree (throws on mistakes)
 *   seedCategories()      make sure every leaf has a configuration row in
 *                         the `categories` table (never overwrites edits)
 *   loadRemoteDataset()   read a remote category's flags from server/data
 *   flagNumberFor()       derive a category's flag count from its dataset
 *   publicCategory()      the shape sent to the browser (no internals)
 *
 * Nothing here knows about gameplay, scoring or payments.
 * -----------------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');

const TREE_PATH = path.join(__dirname, '..', '..', 'shared', 'categoryTree.json');
const DATA_DIR = path.join(__dirname, '..', 'data');
const TYPES = new Set(['default', 'paid']);
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function validateTree(tree) {
  const problems = [];
  if (!tree || !Array.isArray(tree.groups) || !tree.groups.length) {
    return ['tree.groups must be a non-empty array'];
  }
  const groupIds = new Set();
  const leafIds = new Set();
  for (const g of tree.groups) {
    if (!g.id || !ID_RE.test(g.id)) problems.push(`group id invalid: ${g.id}`);
    if (groupIds.has(g.id)) problems.push(`duplicate group id: ${g.id}`);
    groupIds.add(g.id);
    if (!g.name) problems.push(`group ${g.id} needs a name`);
    if (g.layout !== undefined && !['grid', 'list'].includes(g.layout)) problems.push(`group ${g.id}: layout must be "grid" or "list"`);
    if (g.featured !== undefined && typeof g.featured !== 'boolean') problems.push(`group ${g.id}: featured must be true or false`);
    if (!Array.isArray(g.categories) || !g.categories.length) problems.push(`group ${g.id} needs categories`);
    for (const c of g.categories || []) {
      if (!c.id || !ID_RE.test(c.id)) problems.push(`category id invalid: ${c.id}`);
      if (leafIds.has(c.id)) problems.push(`duplicate category id: ${c.id}`);
      leafIds.add(c.id);
      if (!c.name) problems.push(`category ${c.id} needs a name`);
      if (!TYPES.has(c.type)) problems.push(`category ${c.id}: type must be "default" or "paid"`);
      const fs_ = c.flagSource;
      if (!fs_ || !['bundled', 'remote'].includes(fs_.kind)) {
        problems.push(`category ${c.id}: flagSource.kind must be "bundled" or "remote"`);
      } else if (fs_.kind === 'remote' && !/^[a-z0-9-]+$/.test(fs_.dataset || '')) {
        problems.push(`category ${c.id}: remote flagSource needs a dataset name`);
      }
      if (c.type === 'paid' && fs_ && fs_.kind !== 'remote') {
        problems.push(`category ${c.id}: only remote (server-hosted) categories can be paid`);
      }
      if (c.type === 'paid' && !(c.priceCents > 0)) problems.push(`category ${c.id}: a paid category needs priceCents > 0`);
    }
  }
  return problems;
}

function loadTree(treePath = TREE_PATH) {
  const tree = JSON.parse(fs.readFileSync(treePath, 'utf8'));
  const problems = validateTree(tree);
  if (problems.length) throw new Error(`Invalid category tree:\n - ${problems.join('\n - ')}`);
  return tree;
}

/** Flat, ordered list of leaves with their group attached. */
function flattenTree(tree) {
  const out = [];
  let sortOrder = 0;
  for (const g of tree.groups) {
    for (const c of g.categories) {
      out.push({ ...c, groupId: g.id, groupName: g.name, sortOrder: sortOrder++ });
    }
  }
  return out;
}

async function seedCategories(repos, tree = loadTree()) {
  for (const c of flattenTree(tree)) {
    await repos.categories.seed({
      id: c.id,
      name: c.name,
      groupId: c.groupId,
      sortOrder: c.sortOrder,
      type: c.type,
      priceCents: c.priceCents || 0,
      currency: c.currency || 'usd',
      description: c.description,
      flagSource: c.flagSource,
    });
  }
}

const datasetCache = new Map();

/** Countries for a remote dataset, or null if there is no such file. */
function loadRemoteDataset(dataset) {
  if (!/^[a-z0-9-]+$/.test(dataset || '')) return null; // no path traversal, ever
  if (datasetCache.has(dataset)) return datasetCache.get(dataset);
  const file = path.join(DATA_DIR, `${dataset}.json`);
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  datasetCache.set(dataset, data);
  return data;
}

/** Derived, never hand-maintained. null when the count lives in the frontend bundle. */
function flagNumberFor(category) {
  if (!category.flagSource || category.flagSource.kind !== 'remote') return null;
  const data = loadRemoteDataset(category.flagSource.dataset);
  return data ? data.length : 0;
}

/** What the browser is allowed to know about a category. Deliberately no flagSource internals. */
function publicCategory(category, ownerAccess) {
  return {
    id: category.id,
    name: category.name,
    groupId: category.groupId,
    type: category.type,
    enabled: category.enabled,
    priceCents: category.priceCents,
    currency: category.currency,
    description: category.description,
    hosting: category.flagSource.kind, // 'bundled' | 'remote' — tells the client WHERE the flags come from
    flagNumber: flagNumberFor(category),
    ...(ownerAccess || {}),
  };
}

module.exports = { TREE_PATH, validateTree, loadTree, flattenTree, seedCategories, loadRemoteDataset, flagNumberFor, publicCategory };
