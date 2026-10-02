/**
 * useAuth.js
 * -----------------------------------------------------------------------
 * Client side of the backend's sign-in. The flow (details in
 * server/routes/auth.js):
 *
 *   1. a "Continue with Google/Discord" link goes to <API>/auth/<provider>
 *   2. after the provider, the backend redirects back to this app with a
 *      one-time ?auth_code=…   (handled by components/AuthCallbackHandler)
 *   3. completeLogin(code) exchanges it for a session token
 *
 * The session token is kept in localStorage and sent as
 * `Authorization: Bearer …`. It is NOT a cookie on purpose: this app
 * (github.io) and its API are different sites, and browsers refuse to send
 * third-party cookies. No database credential or provider secret is ever
 * in the browser — only this opaque, revocable token.
 *
 * If the backend is missing/unreachable, everything falls back to guest
 * mode automatically; nothing here blocks gameplay.
 * -----------------------------------------------------------------------
 */
import { useCallback, useEffect, useState } from 'react';

export const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '');

const TOKEN_KEY = 'meridian_session_v1';
export const AUTH_EXPIRED_EVENT = 'meridian:auth-expired';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // storage blocked: behave as signed out
  }
}

function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Without storage the session lasts until this page unloads only.
  }
}

function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // nothing to clear
  }
}

/** fetch() to the API with the session token attached. Returns null on a network failure. */
export async function authedFetch(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(API_BASE + path, { ...options, headers });
    if (res.status === 401 && token && getToken() === token) {
      // The server no longer recognises this session (expired, revoked,
      // account disabled): drop it and tell the app.
      clearToken();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    return res;
  } catch {
    return null;
  }
}

export function loginUrl(provider, returnTo = '/') {
  return `${API_BASE}/auth/${provider}?return_to=${encodeURIComponent(returnTo)}`;
}

export function useAuth() {
  const [user, setUser] = useState(null);
  const [backendReachable, setBackendReachable] = useState(null); // null = unknown
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tokenAtStart = getToken();

    async function checkSession() {
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeout = controller ? setTimeout(() => controller.abort(), 8000) : null;
        const res = await fetch(API_BASE + '/api/me', {
          headers: tokenAtStart ? { Authorization: `Bearer ${tokenAtStart}` } : {},
          signal: controller ? controller.signal : undefined,
        });
        if (timeout) clearTimeout(timeout);
        if (cancelled) return;
        setBackendReachable(true);
        // A login may have completed while this probe was in flight; do
        // not let a stale answer overwrite it.
        if (getToken() !== tokenAtStart) return;
        const data = res.ok ? await res.json() : null;
        if (data && data.user) {
          setUser(data.user);
        } else {
          if (tokenAtStart) clearToken(); // stale token
          setUser(null);
        }
      } catch {
        if (cancelled) return;
        setBackendReachable(false);
        // Keep the token: a backend that is merely asleep or offline
        // shouldn't sign the person out permanently.
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

  // A 401 from any call means the session is gone.
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  /** Trade the one-time ?auth_code for a session. Throws Error(message) on failure. */
  const completeLogin = useCallback(async (code) => {
    let res;
    try {
      res = await fetch(API_BASE + '/api/auth/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
    } catch {
      throw new Error('Could not reach the server to finish signing in.');
    }
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || !body.token) {
      throw new Error((body && body.error) || 'Sign-in could not be completed. Please try again.');
    }
    setToken(body.token);
    setBackendReachable(true);
    setUser(body.user);
    setChecked(true);
    return body.user;
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await authedFetch('/api/me');
    if (res && res.ok) {
      const data = await res.json();
      setUser(data.user || null);
    }
  }, []);

  const logout = useCallback(async () => {
    await authedFetch('/api/logout', { method: 'POST' });
    clearToken();
    setUser(null);
  }, []);

  /** Start connecting another provider to the signed-in account. Redirects the browser. */
  const linkProvider = useCallback(async (provider, returnTo = '/profile') => {
    const res = await authedFetch(`/api/auth/link/${provider}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnTo }),
    });
    const body = res ? await res.json().catch(() => null) : null;
    if (!res || !res.ok || !body || !body.url) {
      throw new Error((body && body.error) || 'Could not start connecting that account.');
    }
    window.location.href = body.url;
  }, []);

  return { user, backendReachable, checked, logout, loginUrl, authedFetch, completeLogin, refreshUser, linkProvider };
}
