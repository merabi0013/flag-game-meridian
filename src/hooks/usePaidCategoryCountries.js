import { useEffect, useState } from 'react';
import { fetchPaidCategoryCountries, PaymentApiError } from '../utils/paidCategoriesApi';

/**
 * Only call this once access is already known to be granted (owned or
 * admin) -- the endpoint itself re-checks that independently regardless
 * (see server/routes/categories.js), so this hook's `error` state is
 * exactly what happens if that check fails anyway (e.g. a stale UI, a
 * category disabled mid-session).
 */
export function usePaidCategoryCountries(categoryId, enabled) {
  const [countries, setCountries] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!categoryId || !enabled) {
      setCountries(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPaidCategoryCountries(categoryId)
      .then((data) => {
        if (!cancelled) setCountries(data.countries);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof PaymentApiError ? err.message : 'Could not load this category.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [categoryId, enabled]);

  return { countries, loading, error };
}
