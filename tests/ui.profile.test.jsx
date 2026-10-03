// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = { user: null, authedFetch: vi.fn() };
vi.mock('../src/context/AuthContext', () => ({ useAuthContext: () => ({ backendReachable: true, checked: true, ...state }) }));
vi.mock('../src/context/ToastContext', () => ({ useToast: () => vi.fn() }));

import Profile from '../src/screens/Profile';

const memory = () => {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
};
const json = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
const base = { gamesPlayed: 0, questionsAnswered: 0, correct: 0, incorrect: 0, bestScore: 0, bestStreak: 0, accuracy: 0, totalScore: 0, categoryStats: {}, recentGames: [] };

beforeEach(() => {
  globalThis.localStorage = memory();
  state.user = null;
  state.authedFetch = vi.fn();
});
afterEach(cleanup);

const renderProfile = () => render(<MemoryRouter><Profile /></MemoryRouter>);
const card = (id) => document.querySelector(`[data-category="${id}"]`);
const metrics = (el) => Object.fromEntries([...el.querySelectorAll('dl > div')].map((d) => [d.querySelector('dt').textContent, d.querySelector('dd').textContent]));
const headings = () => within(screen.getByTestId('category-stats')).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

describe('Profile: statistics separated by category', () => {
  it('shows a signed-in user their stored records as one section per played category, grouped like the picker', async () => {
    state.user = { id: 'u1', name: 'Ada', email: 'a@x.io', provider: 'google', isAdmin: false };
    state.authedFetch = vi.fn((path) =>
      path === '/api/me/stats'
        ? json({
            ...base, gamesPlayed: 5, questionsAnswered: 50, correct: 30, bestScore: 900, bestStreak: 9, totalScore: 2000,
            categoryStats: {
              world: { asked: 10, correct: 5, gamesPlayed: 1, questionsAnswered: 10, incorrect: 5, totalScore: 300, bestScore: 300, bestStreak: 3 },
              europe: { asked: 20, correct: 12, gamesPlayed: 2, questionsAnswered: 20, incorrect: 8, totalScore: 600, bestScore: 400, bestStreak: 5 },
              asia: { asked: 10, correct: 9, gamesPlayed: 1, questionsAnswered: 10, incorrect: 1, totalScore: 900, bestScore: 900, bestStreak: 9 },
              'world-1914': { asked: 10, correct: 4, gamesPlayed: 1, questionsAnswered: 10, incorrect: 6, totalScore: 200, bestScore: 200, bestStreak: 2 },
            },
            recentGames: [],
          })
        : json({ games: [] })
    );
    renderProfile();
    await waitFor(() => expect(card('europe')).toBeTruthy());

    // World is a single same-named category: no redundant heading. Others are grouped.
    expect(headings()).toEqual(['Continents', 'Historical']);
    expect(metrics(card('europe'))).toEqual({ 'Games played': '2', 'Questions answered': '20', Accuracy: '60%', 'Best score': '400', 'Best streak': '5' });
    expect(metrics(card('asia'))).toMatchObject({ Accuracy: '90%', 'Best score': '900', 'Best streak': '9' });
    expect(metrics(card('world'))['Games played']).toBe('1');
    expect(metrics(card('world-1914'))).toMatchObject({ 'Games played': '1', Accuracy: '40%' });
    expect(card('africa')).toBeNull(); // never played: no empty section
    expect(card('europe').querySelector('h4').textContent).toBe('Europe');
    expect(card('world-1914').querySelector('h4').textContent).toBe('World 1914');
  });

  it('keeps the overall statistics', async () => {
    renderProfile();
    expect(screen.getByTestId('overall-stats')).toBeTruthy();
    expect(within(screen.getByTestId('overall-stats')).getByText('Games played')).toBeTruthy();
  });

  it('shows a guest their local per-category records', async () => {
    localStorage.setItem(
      'meridian_guest_stats_v1',
      JSON.stringify({
        gamesPlayed: 1, questionsAnswered: 10, correct: 7, incorrect: 3, bestScore: 500, bestStreak: 4, totalScore: 500,
        categoryStats: { 'world-1991': { gamesPlayed: 1, questionsAnswered: 10, correct: 7, incorrect: 3, totalScore: 500, bestScore: 500, bestStreak: 4, asked: 10 } },
        recentGames: [],
      })
    );
    renderProfile();
    await waitFor(() => expect(card('world-1991')).toBeTruthy());
    expect(metrics(card('world-1991'))).toEqual({ 'Games played': '1', 'Questions answered': '10', Accuracy: '70%', 'Best score': '500', 'Best streak': '4' });
    expect(screen.queryByText(/Detailed per-category tracking/)).toBeNull();
  });

  it('shows "—" (never a made-up number) for a record that predates per-category tracking, with a footnote', async () => {
    localStorage.setItem(
      'meridian_guest_stats_v1',
      JSON.stringify({ gamesPlayed: 1, questionsAnswered: 10, correct: 7, incorrect: 3, bestScore: 500, bestStreak: 4, totalScore: 500, categoryStats: { europe: { asked: 10, correct: 7 } }, recentGames: [] })
    );
    renderProfile();
    await waitFor(() => expect(card('europe')).toBeTruthy());
    expect(metrics(card('europe'))).toEqual({ 'Games played': '—', 'Questions answered': '10', Accuracy: '70%', 'Best score': '—', 'Best streak': '—' });
    expect(screen.getByText(/Detailed per-category tracking/)).toBeTruthy();
  });

  it('marks partial figures with a dagger once newer games exist', async () => {
    localStorage.setItem(
      'meridian_guest_stats_v1',
      JSON.stringify({ gamesPlayed: 2, questionsAnswered: 20, correct: 15, incorrect: 5, bestScore: 500, bestStreak: 4, totalScore: 800, categoryStats: { europe: { asked: 20, correct: 15, gamesPlayed: 1, questionsAnswered: 20, incorrect: 5, totalScore: 300, bestScore: 300, bestStreak: 3, partial: true } }, recentGames: [] })
    );
    renderProfile();
    await waitFor(() => expect(card('europe')).toBeTruthy());
    expect(metrics(card('europe'))).toMatchObject({ 'Games played': '1†', 'Best score': '300†', Accuracy: '75%' });
  });

  it('works with the older backend response shape (only asked / correct)', async () => {
    state.user = { id: 'u1', name: 'Ada', provider: 'google' };
    state.authedFetch = vi.fn((path) => (path === '/api/me/stats' ? json({ ...base, gamesPlayed: 2, questionsAnswered: 20, correct: 10, categoryStats: { asia: { asked: 20, correct: 10 } } }) : json({ games: [] })));
    renderProfile();
    await waitFor(() => expect(card('asia')).toBeTruthy());
    expect(metrics(card('asia'))).toMatchObject({ 'Questions answered': '20', Accuracy: '50%', 'Games played': '—' });
  });

  it('says so when no game has been played', () => {
    renderProfile();
    expect(screen.getByText(/No games played yet in any category/)).toBeTruthy();
    expect(screen.queryByTestId('category-stats')).toBeNull();
  });

  it('lists history for a category no longer in the tree under "Other"', async () => {
    state.user = { id: 'u1', name: 'Ada', provider: 'google' };
    state.authedFetch = vi.fn((path) => (path === '/api/me/stats' ? json({ ...base, gamesPlayed: 1, categoryStats: { 'retired-cat': { asked: 5, correct: 5, gamesPlayed: 1, questionsAnswered: 5, bestScore: 1, bestStreak: 1 } } }) : json({ games: [] })));
    renderProfile();
    await waitFor(() => expect(card('retired-cat')).toBeTruthy());
    expect(headings()).toEqual(['Other']);
  });
});
