// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import tree from '../shared/categoryTree.json';
import { ALL_COUNTRIES } from '../src/data/countries';
import { buildCatalog } from '../src/utils/categoryCatalog';

const state = { user: null, authedFetch: vi.fn(), linkProvider: vi.fn() };
vi.mock('../src/context/AuthContext', () => ({ useAuthContext: () => ({ backendReachable: true, checked: true, ...state }) }));
vi.mock('../src/context/ToastContext', () => ({ useToast: () => vi.fn() }));
let catalog;
vi.mock('../src/context/CatalogContext', () => ({ useCatalog: () => ({ catalog, loading: false, refresh: vi.fn() }) }));

import Profile from '../src/screens/Profile';

const memory = () => {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
};
const json = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

beforeEach(() => {
  globalThis.localStorage = memory();
  catalog = buildCatalog(tree, ALL_COUNTRIES, null, null);
  state.user = null;
  state.authedFetch = vi.fn();
  state.linkProvider = vi.fn().mockResolvedValue();
});
afterEach(cleanup);

const renderProfile = () => render(<MemoryRouter><Profile /></MemoryRouter>);
const rowFor = (id) => document.querySelector(`[data-category="${id}"]`);
const cells = (row) => [...row.querySelectorAll('td')].map((td) => td.textContent);

describe('Profile: statistics by category', () => {
  it('shows a signed-in user their server stats separated by category, grouped like the picker', async () => {
    state.user = { id: 'u1', name: 'Ada', email: 'a@x.io', provider: 'google', providers: ['google'], isAdmin: false };
    state.authedFetch = vi.fn((path) => {
      if (path === '/api/me/stats') {
        return json({
          gamesPlayed: 4, questionsAnswered: 40, correct: 22, incorrect: 18, bestScore: 900, bestStreak: 9, accuracy: 55, totalScore: 1600, averageScore: 400,
          categoryStats: {
            europe: { gamesPlayed: 2, questionsAnswered: 20, correct: 12, accuracy: 60, bestScore: 400, bestStreak: 5, averageScore: 300 },
            asia: { gamesPlayed: 1, questionsAnswered: 10, correct: 9, accuracy: 90, bestScore: 900, bestStreak: 9, averageScore: 900 },
            caucasus: { gamesPlayed: 1, questionsAnswered: 10, correct: 1, accuracy: 10, bestScore: 100, bestStreak: 1, averageScore: 100 },
          },
          recentGames: [],
        });
      }
      return json({ games: [] });
    });
    renderProfile();
    await waitFor(() => expect(rowFor('europe')).toBeTruthy());

    const section = screen.getByTestId('category-stats');
    expect(within(section).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Continents', 'Regions']);
    expect(cells(rowFor('europe'))).toEqual(['Europe', '2', '20', '', '60%', '400', '5', '300']);
    expect(cells(rowFor('asia'))).toEqual(['Asia', '1', '10', '', '90%', '900', '9', '900']);
    expect(rowFor('caucasus')).toBeTruthy();
    expect(rowFor('africa')).toBeNull(); // never played: not listed
  });

  it('shows a guest their local per-category stats, and "—" for anything never recorded', async () => {
    localStorage.setItem('meridian_guest_stats_v1', JSON.stringify({
      gamesPlayed: 1, questionsAnswered: 10, correct: 7, incorrect: 3, bestScore: 500, bestStreak: 4, totalScore: 500,
      categoryStats: { europe: { asked: 10, correct: 7 } }, recentGames: [],
    }));
    renderProfile();
    await waitFor(() => expect(rowFor('europe')).toBeTruthy());
    expect(cells(rowFor('europe'))).toEqual(['Europe', '—', '10', '', '70%', '—', '—', '—']);
  });

  it('says so when no game has been played', () => {
    renderProfile();
    expect(screen.getByText(/No games played yet in any category/)).toBeTruthy();
  });

  it('lists history for a category that is no longer in the tree under "Other"', async () => {
    state.user = { id: 'u1', name: 'Ada', provider: 'google', providers: ['google'] };
    state.authedFetch = vi.fn((path) => (path === '/api/me/stats' ? json({ gamesPlayed: 1, questionsAnswered: 5, correct: 5, incorrect: 0, bestScore: 1, bestStreak: 1, accuracy: 100, totalScore: 1, categoryStats: { 'retired-cat': { gamesPlayed: 1, questionsAnswered: 5, correct: 5, bestScore: 1, bestStreak: 1, averageScore: 1 } }, recentGames: [] }) : json({ games: [] })));
    renderProfile();
    await waitFor(() => expect(rowFor('retired-cat')).toBeTruthy());
    expect(within(screen.getByTestId('category-stats')).getByRole('heading', { level: 3 }).textContent).toBe('Other');
  });
});

describe('Profile: connected accounts', () => {
  beforeEach(() => {
    state.authedFetch = vi.fn((path) => (path === '/api/me/stats' ? json({ gamesPlayed: 0, questionsAnswered: 0, correct: 0, incorrect: 0, bestScore: 0, bestStreak: 0, accuracy: 0, totalScore: 0, categoryStats: {}, recentGames: [] }) : json({ games: [] })));
  });

  it('shows which providers are connected and lets the user connect another', async () => {
    state.user = { id: 'u1', name: 'Ada', provider: 'google', providers: ['google'] };
    renderProfile();
    expect(screen.getByText('Connected')).toBeTruthy();
    const connect = screen.getByRole('button', { name: /Connect Discord/ });
    expect(screen.queryByRole('button', { name: /Connect Google/ })).toBeNull();
    fireEvent.click(connect);
    await waitFor(() => expect(state.linkProvider).toHaveBeenCalledWith('discord', '/profile'));
  });

  it('is not shown to guests', () => {
    renderProfile();
    expect(screen.queryByText('Connected accounts')).toBeNull();
  });
});
