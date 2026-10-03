import { useCallback, useEffect, useState } from 'react';
import { fetchPaidCategories, fetchMyAccess } from '../utils/paidCategoriesApi';
import { allCategories } from '../utils/categories';
import { FEATURE_FLAGS } from '../config/appConfig';

/**
 * Merges the public price/enabled list (visible to guests, so the
 * category grid can render lock badges before sign-in) with the signed-
 * in user's actual access (real entitlement or admin bypass). Returns a
 * map keyed by categoryId so components can do a simple lookup.
 *
 * Only does anything while the category tree actually contains a `paid`
 * category (and the premium feature is on). With every category free —
 * the current state, historical maps included — there is nothing to ask
 * the backend, so no request is made and the map stays empty. Making a
 * category `paid` in src/data/categoryTree.json turns this back on.
 *
 * refresh() is called once after a purchase is confirmed (see
 * screens/PurchaseConfirm.jsx) so the category grid reflects new
 * ownership immediately, without requiring a logout/login or a manual
 * page reload.
 */
export function usePaidAccess(user) {
  const [byId, setById] = useState({});
  const [loading, setLoading] = useState(true);

  const hasPaid = FEATURE_FLAGS.paidCategories && allCategories().some((c) => c.type === 'paid');

  const load = useCallback(async () => {
    if (!hasPaid) {
      setById({});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const pub = await fetchPaidCategories();
      const map = {};
      pub.categories.forEach((c) => {
        // A non-premium category (e.g. a free Historical map) is playable
        // by anyone immediately, guests included -- only a genuinely
        // premium category starts out locked pending sign-in/purchase.
        map[c.categoryId] = { ...c, owned: !c.premium, viaAdmin: false };
      });

      if (user) {
        try {
          const mine = await fetchMyAccess();
          mine.categories.forEach((c) => {
            map[c.categoryId] = { ...map[c.categoryId], ...c };
          });
        } catch {
          // Not signed in / session hiccup -- guest-level (locked) view
          // is still correct and better than showing nothing.
        }
      }

      setById(map);
    } catch {
      setById({});
    } finally {
      setLoading(false);
    }
  }, [user, hasPaid]);

  useEffect(() => {
    load();
  }, [load]);

  return { paidCategories: byId, loading, refresh: load };
}
