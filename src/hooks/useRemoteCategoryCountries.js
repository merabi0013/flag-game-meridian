import { useEffect, useState } from 'react';
import { fetchRemoteCategoryCountries, PaymentApiError } from '../utils/categoriesApi';

/**
 * Loads the flags of a server-hosted category. Call it with `enabled`
 * true only once access is expected (free, owned or admin) — the endpoint
 * re-checks that independently on every request (server/routes/
 * categories.js), so `error` is exactly what happens when that check
 * fails anyway (a stale screen, a category disabled mid-session).
 */
export function useRemoteCategoryCountries(categoryId, enabled) {
  const [countries, setCountries] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!categoryId || !enabled) {
      setCountries(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRemoteCategoryCountries(categoryId)
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
