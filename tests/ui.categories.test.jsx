// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import tree from '../src/data/categoryTree.json';
import { ALL_COUNTRIES } from '../src/data/countries';
import { buildRegistry, categoryGroups } from '../src/utils/categories';
import CategoryGrid from '../src/components/CategoryGrid';

afterEach(cleanup);

function setup({ groups = categoryGroups(), tab = 'continents', categoryId = null, paidCategories = {} } = {}) {
  const props = { groups, tab, onTabChange: vi.fn(), categoryId, onSelectCategory: vi.fn(), paidCategories, onOpenPurchase: vi.fn() };
  const view = render(<CategoryGrid {...props} />);
  return { ...props, ...view };
}
const tile = (id) => document.querySelector(`[data-category="${id}"]`);

describe('CategoryGrid renders the tree', () => {
  it('shows a tab for every non-featured group and the featured group above them', () => {
    setup();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Continents', 'Regions', 'Historical']);
    expect(screen.getByRole('tab', { name: 'Continents' }).getAttribute('aria-selected')).toBe('true');
    expect(tile('world')).toBeTruthy(); // featured, always visible
    expect(tile('europe')).toBeTruthy();
    expect(tile('caribbean')).toBeNull(); // other tabs' tiles are not shown
  });

  it('lists all 7 continents with their derived flag counts', () => {
    setup();
    expect(document.querySelectorAll('[data-group="continents"] > button')).toHaveLength(7);
    const europe = ALL_COUNTRIES.filter((c) => c.continent === 'Europe').length;
    expect(within(tile('europe')).getByText(`${europe} flags`)).toBeTruthy();
    expect(within(tile('world')).getByText(`${ALL_COUNTRIES.length} flags`)).toBeTruthy();
  });

  it('shows every region on the Regions tab', () => {
    setup({ tab: 'regions' });
    expect(document.querySelectorAll('[data-group="regions"] > button')).toHaveLength(18);
    expect(tile('caribbean')).toBeTruthy();
  });

  it('asks the parent to change tab', () => {
    const { onTabChange } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Regions' }));
    expect(onTabChange).toHaveBeenCalledWith('regions');
  });

  it('falls back to the first tab when the requested one does not exist', () => {
    setup({ tab: 'nonsense' });
    expect(tile('europe')).toBeTruthy();
  });

  it('selecting a free category selects it and never opens a purchase', () => {
    const { onSelectCategory, onOpenPurchase } = setup({ categoryId: 'asia' });
    fireEvent.click(tile('europe'));
    expect(onSelectCategory).toHaveBeenCalledWith('europe');
    expect(onOpenPurchase).not.toHaveBeenCalled();
    expect(tile('asia').className).toMatch(/selected/);
  });
});

describe('Historical maps are free, selectable categories', () => {
  it('shows all three, marked Free, with no premium badge or purchase button', () => {
    const { onSelectCategory, onOpenPurchase } = setup({ tab: 'historical' });
    for (const id of ['world-1914', 'world-1945', 'world-1991']) {
      const card = tile(id);
      expect(card, id).toBeTruthy();
      expect(within(card).getByText('Free')).toBeTruthy();
      expect(card.className).not.toMatch(/dimmed/);
      expect(card.textContent).not.toMatch(/Premium|Purchase|unavailable/i);
      expect(card.disabled).toBeFalsy();
      fireEvent.click(card);
      expect(onSelectCategory).toHaveBeenLastCalledWith(id);
    }
    expect(onOpenPurchase).not.toHaveBeenCalled();
  });

  it('works with no backend information at all (GitHub Pages without a server)', () => {
    setup({ tab: 'historical', paidCategories: {} });
    expect(tile('world-1914')).toBeTruthy();
    expect(within(tile('world-1914')).getByText(/\d+ flags/)).toBeTruthy();
  });
});

describe('the picker is generic', () => {
  it('a new group and category in the tree appear as a new tab with a working tile', () => {
    const extended = structuredClone(tree);
    extended.groups.push({ id: 'themes', name: 'Themes', categories: [{ id: 'star-flags', name: 'Star flags', type: 'default', flagSource: { kind: 'bundled', where: { continent: 'Oceania' } } }] });
    const registry = buildRegistry(extended);
    const { onSelectCategory } = setup({ groups: registry.groups, tab: 'themes' });
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toContain('Themes');
    fireEvent.click(tile('star-flags'));
    expect(onSelectCategory).toHaveBeenCalledWith('star-flags');
  });

  it('a paid category uses the existing premium card: locked for non-owners, no flags exposed', () => {
    const paidTree = structuredClone(tree);
    const leaf = paidTree.groups.find((g) => g.id === 'historical').categories.find((c) => c.id === 'world-1914');
    leaf.type = 'paid';
    leaf.flagSource = { kind: 'remote' };
    const registry = buildRegistry(paidTree);
    const info = { categoryId: 'world-1914', name: 'World 1914', priceCents: 200, currency: 'usd', enabled: true, premium: true, owned: false, viaAdmin: false };
    const { onSelectCategory, onOpenPurchase } = setup({ groups: registry.groups, tab: 'historical', paidCategories: { 'world-1914': info } });
    const card = tile('world-1914');
    expect(card.textContent).toMatch(/Premium/);
    fireEvent.click(card);
    expect(onOpenPurchase).toHaveBeenCalledWith('world-1914');
    expect(onSelectCategory).not.toHaveBeenCalled();
    expect(tile('world-1991').textContent).toMatch(/Free/); // the others stay free
  });

  it('a paid category renders nothing until the backend has answered', () => {
    const paidTree = structuredClone(tree);
    const leaf = paidTree.groups.find((g) => g.id === 'historical').categories.find((c) => c.id === 'world-1914');
    leaf.type = 'paid';
    leaf.flagSource = { kind: 'remote' };
    setup({ groups: buildRegistry(paidTree).groups, tab: 'historical', paidCategories: {} });
    expect(tile('world-1914')).toBeNull();
    expect(tile('world-1945')).toBeTruthy();
  });
});
