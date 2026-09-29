/**
 * entitlements.js
 * -----------------------------------------------------------------------
 * The commerce side of backend-registered categories (paid or free-but-
 * admin-toggleable, e.g. Historical maps): does this category exist, is
 * it enabled, is it premium, what does it cost, and does a given user
 * have access to it. Deliberately knows nothing about flags or countries
 * -- see paidCategoryData.js for that half, and the README's "keep these
 * responsibilities separate" note.
 *
 * `premium` is what actually gates access -- a row can exist here purely
 * so an admin can flip its Free/Premium status later (see README
 * "Historical categories"), while defaulting to freely playable by
 * anyone, guests included. `enabled` is separate: it can take a category
 * offline entirely (free or premium) without touching its premium flag
 * or deleting anyone's entitlement.
 *
 * userHasAccess() is the one function that answers "can this person play
 * this category" and it's the same function used by every route that
 * needs the answer (checkout, the countries endpoint, the access-list
 * endpoint) -- one definition, not several that could drift apart.
 * -----------------------------------------------------------------------
 */
const db = require('../db');

function getPaidCategory(categoryId) {
  return db.prepare('SELECT * FROM paid_categories WHERE category_id = ?').get(categoryId);
}

function listPaidCategories() {
  return db.prepare('SELECT * FROM paid_categories ORDER BY created_at ASC').all();
}

function hasEntitlement(userId, categoryId) {
  const row = db
    .prepare("SELECT 1 FROM entitlements WHERE user_id = ? AND category_id = ? AND status = 'active'")
    .get(userId, categoryId);
  return !!row;
}

/** True if this user can play this category right now, for whatever
 * reason: it's not premium at all (free for everyone, including
 * guests -- `user` may be null here), an admin bypass, or a real
 * entitlement. Does NOT consider `enabled` -- a disabled category still
 * honors existing ownership (see README "Backend toggle"); `enabled`
 * only gates NEW purchases and whether normal users can start it right
 * now (checked separately by callers alongside this). */
function userHasAccess(user, categoryId) {
  const category = getPaidCategory(categoryId);
  if (category && !category.premium) return true;
  if (user && user.is_admin) return true;
  if (!user) return false;
  return hasEntitlement(user.id, categoryId);
}

function grantEntitlement({ userId, categoryId, transactionId }) {
  db.prepare(
    `INSERT OR IGNORE INTO entitlements (user_id, category_id, transaction_id, status, purchased_at)
     VALUES (?, ?, ?, 'active', ?)`
  ).run(userId, categoryId, transactionId, new Date().toISOString());
}

function ownerCount(categoryId) {
  return db.prepare("SELECT COUNT(*) as n FROM entitlements WHERE category_id = ? AND status = 'active'").get(categoryId).n;
}

/** Every registered category, annotated with this user's access to it.
 * Used by GET /api/me/access -- one call the frontend can use to render
 * the whole category grid's lock/owned/admin/free state. */
function listAccessForUser(user) {
  return listPaidCategories().map((cat) => {
    const premium = !!cat.premium;
    const owned = !premium || hasEntitlement(user.id, cat.category_id);
    return {
      categoryId: cat.category_id,
      name: cat.name,
      description: cat.description,
      priceCents: cat.price_cents,
      currency: cat.currency,
      enabled: !!cat.enabled,
      premium,
      owned: owned || !!user.is_admin,
      viaAdmin: premium && !owned && !!user.is_admin,
    };
  });
}

module.exports = {
  getPaidCategory,
  listPaidCategories,
  hasEntitlement,
  userHasAccess,
  grantEntitlement,
  ownerCount,
  listAccessForUser,
};
