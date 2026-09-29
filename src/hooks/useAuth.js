/**
 * useAuth.js
 * -----------------------------------------------------------------------
 * React port of the previous vanilla-JS js/auth.js. Same contract: probes
 * the optional backend's session cookie via GET /api/me, and falls back
 * to guest mode automatically if the backend is missing/unreachable/not
 * configured — nothing here ever blocks gameplay.
 * -----------------------------------------------------------------------
 */
import { useCallback, useEffect, useState } from 'react';

export const API_BASE = import.meta.env.VITE_API_BASE || '';

export async function authedFetch(path, options = {}) {
  try {
    return await fetch(API_BASE + path, { ...options, credentials: 'include' });
  } catch (err) {
    return null;
  }
}

export function loginUrl(provider, returnTo = '/') {
  return `${API_BASE}/auth/${provider}?returnTo=${encodeURIComponent(returnTo)}`;
}

export function useAuth() {
  const [user, setUser] = useState(null);
  const [backendReachable, setBackendReachable] = useState(null); // null = unknown
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeout = controller ? setTimeout(() => controller.abort(), 2500) : null;
        const res = await fetch(API_BASE + '/api/me', {
          credentials: 'include',
          signal: controller ? controller.signal : undefined,
        });
        if (timeout) clearTimeout(timeout);
        if (cancelled) return;
        setBackendReachable(true);
        if (res.ok) {
          const data = await res.json();
          setUser(data.user || null);
        } else {
          setUser(null);
        }
      } catch (err) {
        if (cancelled) return;
        setBackendReachable(false);
        setUser(null);
      } finally {
        if (!cancelled) setChecked(true);
      }
    }

    checkSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    await authedFetch('/api/logout', { method: 'POST' });
    setUser(null);
  }, []);

  return { user, backendReachable, checked, logout, loginUrl, authedFetch };
}
