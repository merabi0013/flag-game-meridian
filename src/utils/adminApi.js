/**
 * adminApi.js
 * -----------------------------------------------------------------------
 * Thin fetch wrappers for the admin API. These carry no authorization
 * logic of their own — every one of them can fail with 401/403, and
 * every caller (see screens/AdminPanel.jsx) treats that as "show the
 * access-denied view", not as a bug. The real gate is server-side (see
 * server/middleware/auth.js (requireAdmin)); nothing here decides who's an
 * admin.
 * -----------------------------------------------------------------------
 */
import { authedFetch } from '../hooks/useAuth';

export class AdminApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function adminFetch(path, options) {
  const res = await authedFetch(`/api/admin${path}`, options);
  if (!res) throw new AdminApiError('Could not reach the server.', 0);

  let body = null;
  try {
    body = await res.json();
  } catch {
    // no body
  }

  if (!res.ok) {
    throw new AdminApiError((body && body.error) || `Request failed (${res.status})`, res.status);
  }
  return body;
}

export function fetchOverview() {
  return adminFetch('/overview');
}

export function fetchUsers({ search = '', page = 1, pageSize = 20 } = {}) {
  const params = new URLSearchParams({ search, page: String(page), pageSize: String(pageSize) });
  return adminFetch(`/users?${params.toString()}`);
}

export function fetchUserDetail(id) {
  return adminFetch(`/users/${encodeURIComponent(id)}`);
}

export function createUser(payload) {
  return adminFetch('/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function updateUser(id, patch) {
  return adminFetch(`/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export function deleteUser(id) {
  return adminFetch(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function fetchAuditLog(limit = 25) {
  return adminFetch(`/audit-log?limit=${limit}`);
}

export function fetchAdminMultiplayerGames({ page = 1, pageSize = 20 } = {}) {
  return adminFetch(`/multiplayer-games?page=${page}&pageSize=${pageSize}`);
}

export function fetchAdminCategories() {
  return adminFetch('/categories');
}

export function updateAdminCategory(categoryId, patch) {
  return adminFetch(`/categories/${encodeURIComponent(categoryId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}
