// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const auth = { completeLogin: vi.fn(), refreshUser: vi.fn() };
const toast = vi.fn();
vi.mock('../src/context/AuthContext', () => ({ useAuthContext: () => auth }));
vi.mock('../src/context/ToastContext', () => ({ useToast: () => toast }));

import AuthCallbackHandler from '../src/components/AuthCallbackHandler';

let here;
function Where() {
  here = useLocation();
  return null;
}
function mount(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AuthCallbackHandler />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  auth.completeLogin = vi.fn().mockResolvedValue({ id: 'u1' });
  auth.refreshUser = vi.fn();
  toast.mockClear();
});
afterEach(cleanup);

describe('AuthCallbackHandler', () => {
  it('does nothing on an ordinary page load', () => {
    mount('/game?category=europe');
    expect(auth.completeLogin).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(here.pathname + here.search).toBe('/game?category=europe');
  });

  it('exchanges the one-time code once, welcomes the user and returns to where they were', async () => {
    mount('/?auth_code=abc123&return_to=%2Fprofile');
    await waitFor(() => expect(here.pathname).toBe('/profile'));
    expect(auth.completeLogin).toHaveBeenCalledTimes(1);
    expect(auth.completeLogin).toHaveBeenCalledWith('abc123');
    expect(toast).toHaveBeenCalledWith('Signed in.');
    expect(here.search).toBe(''); // the code is gone from the address bar
  });

  it('never redirects to another site through return_to', async () => {
    mount('/?auth_code=evil1&return_to=%2F%2Fevil.example');
    await waitFor(() => expect(auth.completeLogin).toHaveBeenCalled());
    await waitFor(() => expect(here.pathname).toBe('/'));
    expect(here.search).toBe('');
    cleanup();
    mount('/?auth_code=evil2&return_to=https%3A%2F%2Fevil.example');
    await waitFor(() => expect(auth.completeLogin).toHaveBeenCalledWith('evil2'));
    await waitFor(() => expect(here.pathname).toBe('/'));
  });

  it('shows a readable message for a failed sign-in and cleans the URL', async () => {
    mount('/?auth_error=invalid_state');
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0][0]).toMatch(/expired or couldn't be verified/);
    expect(here.search).toBe('');
    expect(auth.completeLogin).not.toHaveBeenCalled();
  });

  it('tells the user when the code exchange fails', async () => {
    auth.completeLogin = vi.fn().mockRejectedValue(new Error('This sign-in link has expired or was already used. Please sign in again.'));
    mount('/?auth_code=used1');
    await waitFor(() => expect(toast).toHaveBeenCalledWith('This sign-in link has expired or was already used. Please sign in again.'));
    expect(here.search).toBe('');
  });

  it('confirms an account link and refreshes the profile', async () => {
    mount('/profile?auth_linked=discord&return_to=%2Fprofile');
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Discord connected to your account.'));
    expect(auth.refreshUser).toHaveBeenCalled();
    expect(here.pathname).toBe('/profile');
    expect(here.search).toBe('');
  });

  it('keeps unrelated query parameters when it removes its own', async () => {
    mount('/?purchase=cancelled&auth_error=access_denied');
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Sign-in was cancelled.'));
    expect(here.search).toBe('?purchase=cancelled');
  });
});
