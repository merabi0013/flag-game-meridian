// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import tree from '../shared/categoryTree.json';
import { ALL_COUNTRIES } from '../src/data/countries';
import { buildCatalog } from '../src/utils/categoryCatalog';
import CategoryGrid from '../src/components/CategoryGrid';

afterEach(cleanup);

function serverWith(overrides = {}) {
  return {
    groups: tree.groups.map((g) => ({
      id: g.id,
      name: g.name,
      categories: g.categories.map((c) => ({
        id: c.id, name: c.name, groupId: g.id, type: c.type, enabled: true, priceCents: c.priceCents || 0, currency: 'usd',
        description: null, hosting: c.flagSource.kind, flagNumber: c.flagSource.kind === 'remote' ? 12 : null, ...(overrides[c.id] || {}),
      })),
    })),
  };
}

function setup({ server = serverWith(), access = null, tab = null, categoryId = null } = {}) {
  const catalog = buildCatalog(tree, ALL_COUNTRIES, server, access);
  const props = { groups: catalog.groups, tab, onTabChange: vi.fn(), categoryId, onSelectCategory: vi.fn(), onOpenPurchase: vi.fn() };
  const view = render(<CategoryGrid {...props} />);
  return { ...props, ...view, catalog };
}

describe('CategoryGrid renders the tree', () => {
  it('shows a tab for every non-featured group, the featured group above them, and the first tab by default', () => {
    setup();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Continents', 'Regions', 'Historical']);
    expect(screen.getByRole('tab', { name: 'Continents' }).getAttribute('aria-selected')).toBe('true');
    // featured World card is always visible
    expect(document.querySelector('[data-category="world"]')).toBeTruthy();
    // first tab's categories are shown, others are not
    expect(document.querySelector('[data-category="europe"]')).toBeTruthy();
    expect(document.querySelector('[data-category="caribbean"]')).toBeNull();
  });

  it('shows the flag count of each category, derived from the data', () => {
    setup();
    const europe = document.querySelector('[data-category="europe"]');
    const count = ALL_COUNTRIES.filter((c) => c.continent === 'Europe').length;
    expect(within(europe).getByText(`${count} flags`)).toBeTruthy();
    expect(within(document.querySelector('[data-category="world"]')).getByText(`${ALL_COUNTRIES.length} flags`)).toBeTruthy();
  });

  it('switching tabs asks the parent to change the tab and renders that group', () => {
    const { onTabChange, rerender, catalog } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Regions' }));
    expect(onTabChange).toHaveBeenCalledWith('regions');
    rerender(<CategoryGrid groups={catalog.groups} tab="regions" onTabChange={onTabChange} categoryId={null} onSelectCategory={() => {}} onOpenPurchase={() => {}} />);
    expect(document.querySelector('[data-category="caribbean"]')).toBeTruthy();
    expect(document.querySelector('[data-category="europe"]')).toBeNull();
  });

  it('selecting a free category calls onSelectCategory and marks it selected', () => {
    const { onSelectCategory, onOpenPurchase } = setup({ categoryId: 'asia' });
    fireEvent.click(document.querySelector('[data-category="europe"]'));
    expect(onSelectCategory).toHaveBeenCalledWith('europe');
    expect(onOpenPurchase).not.toHaveBeenCalled();
    expect(document.querySelector('[data-category="asia"]').className).toMatch(/selected/);
  });

  it('is generic: a new group and category in the tree appear as a new tab', () => {
    const extended = { groups: [...tree.groups, { id: 'themes', name: 'Themes', categories: [{ id: 'star-flags', name: 'Star flags', type: 'default', flagSource: { kind: 'bundled', where: { continent: 'Oceania' } } }] }] };
    const catalog = buildCatalog(extended, ALL_COUNTRIES, serverWith(), null);
    render(<CategoryGrid groups={catalog.groups} tab="themes" onTabChange={() => {}} categoryId={null} onSelectCategory={() => {}} onOpenPurchase={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Themes' })).toBeTruthy();
    expect(document.querySelector('[data-category="star-flags"]')).toBeTruthy();
  });
});

describe('premium (paid) categories in the picker', () => {
  const historical = { tab: 'historical' };

  it('shows the price and a locked state for a guest, and opens purchase instead of selecting', () => {
    const { onSelectCategory, onOpenPurchase } = setup(historical);
    const tile = document.querySelector('[data-category="world-1914"]');
    expect(tile.getAttribute('data-type')).toBe('paid');
    expect(tile.textContent).toMatch(/Premium\s*·\s*\$2\.00/);
    expect(tile.className).toMatch(/dimmed/);
    fireEvent.click(tile);
    expect(onOpenPurchase).toHaveBeenCalledWith('world-1914');
    expect(onSelectCategory).not.toHaveBeenCalled();
  });

  it('free server-hosted categories in the same group are selectable and badged Free', () => {
    const { onSelectCategory } = setup(historical);
    const tile = document.querySelector('[data-category="world-1991"]');
    expect(tile.textContent).toMatch(/Free/);
    fireEvent.click(tile);
    expect(onSelectCategory).toHaveBeenCalledWith('world-1991');
  });

  it('shows Owned and selects normally once purchased', () => {
    const { onSelectCategory } = setup({ ...historical, access: { 'world-1914': { owned: true, viaAdmin: false } } });
    const tile = document.querySelector('[data-category="world-1914"]');
    expect(tile.textContent).toMatch(/Owned/);
    fireEvent.click(tile);
    expect(onSelectCategory).toHaveBeenCalledWith('world-1914');
  });

  it('shows Admin access for administrators', () => {
    setup({ ...historical, access: { 'world-1914': { owned: true, viaAdmin: true } } });
    expect(document.querySelector('[data-category="world-1914"]').textContent).toMatch(/Admin access/);
  });

  it('disables a category the server switched off', () => {
    const { onSelectCategory, onOpenPurchase } = setup({ ...historical, server: serverWith({ 'world-1914': { enabled: false } }) });
    const tile = document.querySelector('[data-category="world-1914"]');
    expect(tile.textContent).toMatch(/Currently unavailable/);
    expect(tile.disabled).toBe(true);
    fireEvent.click(tile);
    expect(onSelectCategory).not.toHaveBeenCalled();
    expect(onOpenPurchase).not.toHaveBeenCalled();
  });

  it('follows the server, not the tree file: a category the server made paid shows locked', () => {
    setup({ ...historical, server: serverWith({ 'world-1991': { type: 'paid', priceCents: 300 } }) });
    expect(document.querySelector('[data-category="world-1991"]').textContent).toMatch(/Premium\s*·\s*\$3\.00/);
  });

  it('has no Historical tab when the backend is unreachable (server-hosted flags cannot load)', () => {
    setup({ server: null });
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Continents', 'Regions']);
    expect(document.querySelector('[data-category="world"]')).toBeTruthy(); // bundled World still playable
  });
});
