/**
 * countries.js
 * -----------------------------------------------------------------------
 * Same 197-entry dataset and classification policy as the previous
 * vanilla-JS version (see the project README's "Geographic data"
 * section) — unchanged by this migration. Bundled statically via Vite's
 * JSON import support rather than fetched at runtime, since it now ships
 * as part of the app bundle; this also removes the old fetch-based
 * loading state, since the data is available synchronously.
 * -----------------------------------------------------------------------
 */
import raw from './countries.json';

export const ALL_COUNTRIES = raw;

export function getCountryById(id) {
  return ALL_COUNTRIES.find((c) => c.id === id);
}
