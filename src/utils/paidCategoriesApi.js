/**
 * paidCategoriesApi.js
 * -----------------------------------------------------------------------
 * Thin wrappers, same shape as utils/adminApi.js. None of these decide
 * anything -- every one can come back 401/403/409/etc., and the backend
 * is what actually enforces price, ownership, and payment status (see
 * server/routes/purchase.js, categories.js). The frontend only ever
 * displays what these calls report and redirects to whatever URL the
 * checkout call returns.
 * -----------------------------------------------------------------------
 */
import { authedFetch } from '../hooks/useAuth';

export class PaymentApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function apiFetch(path, options) {
  const res = await authedFetch(path, options);
  if (!res) throw new PaymentApiError('Could not reach the server.', 0);
  let body = null;
  try {
    body = await res.json();
  } catch {
    // no body
  }
  if (!res.ok) {
    throw new PaymentApiError((body && body.error) || `Request failed (${res.status})`, res.status);
  }
  return body;
}

/** Public -- no auth required, safe to call for guests so the category
 * grid can show price/lock state before sign-in. */
export function fetchPaidCategories() {
  return apiFetch('/api/categories/paid');
}

/** Requires auth. Combines the paid-category list with this user's
 * ownership (real entitlement OR admin bypass) in one call. */
export function fetchMyAccess() {
  return apiFetch('/api/me/access');
}

export function fetchPaidCategoryCountries(categoryId) {
  return apiFetch(`/api/categories/${encodeURIComponent(categoryId)}/countries`);
}

export function startCheckout(categoryId) {
  return apiFetch(`/api/purchase/${encodeURIComponent(categoryId)}/checkout`, { method: 'POST' });
}

export function confirmPurchase(sessionId) {
  return apiFetch(`/api/purchase/confirm?session_id=${encodeURIComponent(sessionId)}`);
}
