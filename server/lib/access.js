/**
 * lib/access.js
 * -----------------------------------------------------------------------
 * The single answer to "can this person play this category right now".
 * Every route that needs the answer (the flags endpoint, checkout, the
 * multiplayer submit, the access list) calls this — one definition, so
 * they cannot drift apart. It knows about configuration + ownership only:
 * nothing about flags, scoring or payment providers.
 *
 *   type 'default'  -> anyone (guests included)
 *   type 'paid'     -> an admin, or a user with an active entitlement
 *
 * `enabled` is separate: it can take ANY category offline without touching
 * its type or anyone's purchases. Existing owners keep their entitlement
 * while a category is disabled; it just can't be started (admins excepted).
 * -----------------------------------------------------------------------
 */
function makeAccess(repos) {
  async function userHasAccess(user, category) {
    if (!category) return false;
    if (category.type !== 'paid') return true;
    if (!user) return false;
    if (user.isAdmin) return true;
    return repos.commerce.hasEntitlement(user.id, category.id);
  }

  /** Playable right now = has access AND (enabled OR admin). */
  async function canPlay(user, category) {
    if (!category) return false;
    if (!category.enabled && !(user && user.isAdmin)) return false;
    return userHasAccess(user, category);
  }

  /** Per-category access flags for a signed-in user (one query for ownership). */
  async function accessMap(user, categories) {
    const owned = await repos.commerce.ownedCategoryIds(user.id);
    const map = {};
    for (const c of categories) {
      const paid = c.type === 'paid';
      const hasEntitlement = owned.has(c.id);
      map[c.id] = {
        owned: !paid || hasEntitlement || !!user.isAdmin,
        viaAdmin: paid && !hasEntitlement && !!user.isAdmin,
      };
    }
    return map;
  }

  return { userHasAccess, canPlay, accessMap };
}

module.exports = { makeAccess };
