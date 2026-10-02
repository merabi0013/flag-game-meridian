/**
 * categoriesApi.js
 * -----------------------------------------------------------------------
 * Thin wrappers over the category, access and purchase endpoints. None of
 * these decide anything — each can come back 401/403/409/etc. and the
 * backend is what actually enforces type, price, ownership and payment
 * status (server/routes/categories.js, purchase.js). The frontend only
 * displays what these report and redirects to the URL checkout returns.
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

/** Public: the category tree with the server's type/enabled/price/flag counts. */
export function fetchCategories() {
  return apiFetch('/api/categories');
}

/** Requires auth: what this user can play (real entitlement or admin). */
export function fetchMyAccess() {
  return apiFetch('/api/me/access');
}

/** Flags for a server-hosted category. The server re-checks access on every call. */
export function fetchRemoteCategoryCountries(categoryId) {
  return apiFetch(`/api/categories/${encodeURIComponent(categoryId)}/countries`);
}

export function startCheckout(categoryId) {
  return apiFetch(`/api/purchase/${encodeURIComponent(categoryId)}/checkout`, { method: 'POST' });
}

export function confirmPurchase(sessionId) {
  return apiFetch(`/api/purchase/confirm?session_id=${encodeURIComponent(sessionId)}`);
}
