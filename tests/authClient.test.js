import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authedFetch, getToken, loginUrl, AUTH_EXPIRED_EVENT } from '../src/hooks/useAuth';
import { authErrorMessage, providerLabel, KNOWN_PROVIDERS } from '../src/utils/authMessages';

const memory = () => {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
};

beforeEach(() => {
  globalThis.localStorage = memory();
  globalThis.window = new EventTarget();
});

describe('authedFetch', () => {
  it('sends the session token as a bearer header, never as a cookie', async () => {
    localStorage.setItem('meridian_session_v1', 'tok-123');
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true });
    globalThis.fetch = fetchMock;
    await authedFetch('/api/me/stats');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/me/stats');
    expect(options.headers.Authorization).toBe('Bearer tok-123');
    expect(options.credentials).toBeUndefined();
  });

  it('sends no Authorization header for a guest', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 200, ok: true });
    await authedFetch('/api/categories');
    expect(globalThis.fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('keeps caller headers', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 200, ok: true });
    await authedFetch('/api/games', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(globalThis.fetch.mock.calls[0][1].headers['Content-Type']).toBe('application/json');
  });

  it('forgets the token and announces it when the server says 401', async () => {
    localStorage.setItem('meridian_session_v1', 'stale');
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 401, ok: false });
    const expired = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, expired);
    await authedFetch('/api/me/stats');
    expect(getToken()).toBeNull();
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('does not treat a guest 401 as an expired session', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 401, ok: false });
    const expired = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, expired);
    await authedFetch('/api/admin/users');
    expect(expired).not.toHaveBeenCalled();
  });

  it('returns null when the network fails (guest mode carries on)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('offline'));
    expect(await authedFetch('/api/me')).toBeNull();
  });

  it('copes with blocked storage', async () => {
    globalThis.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} };
    expect(getToken()).toBeNull();
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 200, ok: true });
    await expect(authedFetch('/api/categories')).resolves.toBeTruthy();
  });
});

describe('loginUrl', () => {
  it('points at the backend provider route and carries the return path', () => {
    expect(loginUrl('google', '/profile?x=1')).toBe('/auth/google?return_to=%2Fprofile%3Fx%3D1');
    expect(loginUrl('discord')).toBe('/auth/discord?return_to=%2F');
  });
});

describe('sign-in messages', () => {
  it('has a friendly message for every code the backend can send, and a safe default', () => {
    for (const code of ['access_denied', 'invalid_state', 'missing_code', 'provider_error', 'provider_not_configured', 'account_disabled', 'already_linked', 'link_expired', 'server_misconfigured', 'server_error']) {
      expect(authErrorMessage(code)).not.toBe(authErrorMessage('something-else'));
    }
    expect(authErrorMessage('???')).toMatch(/failed/i);
  });
  it('labels providers', () => {
    expect(providerLabel('google')).toBe('Google');
    expect(providerLabel('discord')).toBe('Discord');
    expect(providerLabel('other')).toBe('other');
    expect(KNOWN_PROVIDERS).toEqual(['google', 'discord']);
  });
});
