import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuthContext } from './AuthContext';
import { fetchCategories, fetchMyAccess } from '../utils/categoriesApi';
import { buildCatalog, nameOverridesFrom } from '../utils/categoryCatalog';
import { setCategoryNameOverrides, CATEGORY_TREE } from '../utils/categories';
import { ALL_COUNTRIES } from '../data/countries';
import { FEATURE_FLAGS } from '../config/appConfig';

const CatalogContext = createContext(null);

/**
 * One shared copy of "which categories exist and what can this person
 * play": the tree from shared/categoryTree.json merged with the server's
 * type/enabled/price and the signed-in user's access. refresh() is called
 * after a purchase so the picker reflects new ownership immediately.
 */
export function CatalogProvider({ children }) {
  const { user } = useAuthContext();
  const [server, setServer] = useState(null);
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const userId = user ? user.id : null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setServer(await fetchCategories());
    } catch {
      setServer(null); // backend unreachable: bundled categories still work
    }
    if (userId) {
      try {
        setAccess((await fetchMyAccess()).access);
      } catch {
        setAccess(null);
      }
    } else {
      setAccess(null);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const catalog = useMemo(() => buildCatalog(CATEGORY_TREE, ALL_COUNTRIES, server, access, { includeRemote: FEATURE_FLAGS.paidCategories }), [server, access]);

  useEffect(() => {
    setCategoryNameOverrides(nameOverridesFrom(catalog));
  }, [catalog]);

  const value = useMemo(() => ({ catalog, loading, refresh: load }), [catalog, loading, load]);
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used within a CatalogProvider');
  return ctx;
}
