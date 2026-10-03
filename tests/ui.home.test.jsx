// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

vi.mock('../src/context/AuthContext', () => ({ useAuthContext: () => ({ user: null, backendReachable: false, checked: true, authedFetch: vi.fn() }) }));
vi.mock('../src/hooks/useAuth', () => ({ authedFetch: vi.fn(() => Promise.resolve(null)), loginUrl: () => '#', API_BASE: '' }));
vi.mock('../src/context/ToastContext', () => ({ useToast: () => vi.fn() }));

import Home from '../src/screens/Home';
import Game from '../src/screens/Game';
import { countriesForCategory, allCategories } from '../src/utils/categories';
import { ALL_COUNTRIES } from '../src/data/countries';

afterEach(cleanup);

function Where() {
  const { pathname, search } = useLocation();
  return <div data-testid="where">{pathname + search}</div>;
}

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Where />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/game" element={<Game />} />
      </Routes>
    </MemoryRouter>
  );
}
const tile = (id) => document.querySelector(`[data-category="${id}"]`);

describe('picking and playing a historical map from the home screen (no backend)', () => {
  it('World 1914 can be selected and started like any free category', () => {
    renderApp();
    fireEvent.click(screen.getByRole('tab', { name: 'Historical' }));
    fireEvent.click(tile('world-1914'));
    const count = countriesForCategory('world-1914', ALL_COUNTRIES).length;
    const cta = document.querySelector('.play-cta');
    expect(cta.disabled).toBe(false);
    expect(cta.textContent).toMatch(/Play World 1914/);
    expect(document.body.textContent).not.toMatch(/Purchase this category|Premium/);
    fireEvent.click(cta);
    expect(screen.getByTestId('where').textContent).toMatch(/^\/game\?category=world-1914&/);
    expect(screen.getByTestId('where').textContent).toContain(`count=${Math.min(20, count)}`);
  });

  it('the game then runs through the normal engine', () => {
    renderApp('/game?category=world-1945&difficulty=easy&timer=0&minutes=3&count=4');
    expect(document.querySelector('.game-progress').textContent).toMatch(/Flag 1 of 4/);
    expect(document.querySelectorAll('.mc-option').length).toBeGreaterThan(1);
  });

  it('every free category starts a game from its own URL', () => {
    for (const leaf of allCategories()) {
      cleanup();
      renderApp(`/game?category=${leaf.id}&difficulty=easy&timer=0&minutes=3&count=3`);
      expect(document.querySelector('.game-progress')?.textContent, leaf.id).toMatch(/Flag 1 of 3/);
    }
  });

  it('shows the derived category count on the home screen', () => {
    renderApp();
    expect(screen.getByText('Categories').previousSibling.textContent).toBe(String(allCategories().length));
  });
});
