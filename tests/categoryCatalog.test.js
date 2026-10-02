import { describe, it, expect } from 'vitest';
import tree from '../shared/categoryTree.json';
import { ALL_COUNTRIES } from '../src/data/countries';
import { buildCatalog, nameOverridesFrom } from '../src/utils/categoryCatalog';
import { countriesForCategory } from '../src/utils/categories';

// What GET /api/categories returns (shape from server/routes/categories.js).
function serverResponse(overrides = {}) {
  return {
    groups: tree.groups.map((g) => ({
      id: g.id,
      name: g.name,
      categories: g.categories.map((c) => ({
        id: c.id,
        name: c.name,
        groupId: g.id,
        type: c.type,
        enabled: true,
        priceCents: c.priceCents || 0,
        currency: 'usd',
        description: c.description || null,
        hosting: c.flagSource.kind,
        flagNumber: c.flagSource.kind === 'remote' ? 10 : null,
        ...(overrides[c.id] || {}),
      })),
    })),
  };
}
const build = (server, access, opts) => buildCatalog(tree, ALL_COUNTRIES, server, access, opts);

describe('buildCatalog', () => {
  it('mirrors the tree: same groups, same order, presentation hints carried over', () => {
    const catalog = build(serverResponse());
    expect(catalog.groups.map((g) => g.id)).toEqual(['world', 'continents', 'regions', 'historical']);
    expect(catalog.groups[0]).toMatchObject({ featured: true });
    expect(catalog.groups[3]).toMatchObject({ layout: 'list', featured: false });
    expect(catalog.groups[1].layout).toBe('grid');
    expect(catalog.groups[1].categories.map((c) => c.id)).toEqual(tree.groups[1].categories.map((c) => c.id));
  });

  it('derives flagNumber: bundled from the shipped data, server-hosted from the server', () => {
    const catalog = build(serverResponse());
    expect(catalog.byId.europe.flagNumber).toBe(countriesForCategory('europe', ALL_COUNTRIES).length);
    expect(catalog.byId.world.flagNumber).toBe(ALL_COUNTRIES.length);
    expect(catalog.byId['world-1991'].flagNumber).toBe(10);
  });

  describe('free vs paid comes from the SERVER, never from the tree file', () => {
    it("ignores a tree file that says a category is paid when the server says it is not", () => {
      expect(tree.groups[3].categories[0].type).toBe('paid'); // world-1914 seeds as paid...
      const catalog = build(serverResponse({ 'world-1914': { type: 'default' } }));
      expect(catalog.byId['world-1914']).toMatchObject({ type: 'default', locked: false, playable: true });
    });

    it('locks a category the server says is paid even though the tree file says default', () => {
      expect(tree.groups[3].categories[1].type).toBe('default'); // world-1991 seeds as default...
      const catalog = build(serverResponse({ 'world-1991': { type: 'paid', priceCents: 300 } }));
      expect(catalog.byId['world-1991']).toMatchObject({ type: 'paid', locked: true, playable: false, priceCents: 300 });
    });

    it('treats a guest as owning nothing that is paid', () => {
      const e = build(serverResponse()).byId['world-1914'];
      expect(e).toMatchObject({ type: 'paid', owned: false, viaAdmin: false, locked: true, playable: false });
    });

    it('unlocks a paid category the user owns', () => {
      const e = build(serverResponse(), { 'world-1914': { owned: true, viaAdmin: false } }).byId['world-1914'];
      expect(e).toMatchObject({ owned: true, viaAdmin: false, locked: false, playable: true });
    });

    it('flags admin access', () => {
      const e = build(serverResponse(), { 'world-1914': { owned: true, viaAdmin: true } }).byId['world-1914'];
      expect(e).toMatchObject({ viaAdmin: true, playable: true, locked: false });
    });

    it('makes free categories playable for everyone, guests included', () => {
      const catalog = build(serverResponse());
      expect(catalog.byId.europe).toMatchObject({ playable: true, locked: false });
      expect(catalog.byId['world-1991']).toMatchObject({ playable: true, locked: false });
    });
  });

  describe('disabled categories', () => {
    it('are unavailable, even to an owner', () => {
      const catalog = build(serverResponse({ 'world-1914': { enabled: false } }), { 'world-1914': { owned: true, viaAdmin: false } });
      expect(catalog.byId['world-1914']).toMatchObject({ unavailable: true, playable: false, locked: false });
    });
    it('stay available to admins', () => {
      const catalog = build(serverResponse({ 'world-1914': { enabled: false } }), { 'world-1914': { owned: true, viaAdmin: true } });
      expect(catalog.byId['world-1914']).toMatchObject({ unavailable: false, playable: true });
    });
  });

  describe('when the backend is unreachable', () => {
    it('still offers every bundled category, as free', () => {
      const catalog = build(null, null);
      expect(catalog.serverLoaded).toBe(false);
      expect(catalog.byId.europe).toMatchObject({ playable: true, type: 'default' });
      expect(Object.keys(catalog.byId)).toHaveLength(tree.groups.slice(0, 3).flatMap((g) => g.categories).length);
    });
    it('does not offer server-hosted categories (their flags cannot be fetched)', () => {
      const catalog = build(null, null);
      expect(catalog.byId['world-1914']).toBeUndefined();
      expect(catalog.groups.map((g) => g.id)).not.toContain('historical');
    });
  });

  it('can hide server-hosted categories by feature flag', () => {
    const catalog = build(serverResponse(), null, { includeRemote: false });
    expect(catalog.byId['world-1914']).toBeUndefined();
    expect(catalog.byId.europe).toBeDefined();
  });

  it('uses names, prices and descriptions the server has edited', () => {
    const catalog = build(serverResponse({ europe: { name: 'The Old Continent' }, 'world-1914': { description: 'New text', priceCents: 999 } }));
    expect(catalog.byId.europe.name).toBe('The Old Continent');
    expect(catalog.byId['world-1914']).toMatchObject({ description: 'New text', priceCents: 999 });
    expect(nameOverridesFrom(catalog).europe).toBe('The Old Continent');
  });

  it('ignores server categories that are not in the tree, and copes with a partial server list', () => {
    const server = serverResponse();
    server.groups[1].categories.push({ id: 'atlantis', name: 'Atlantis', type: 'default', enabled: true, hosting: 'remote', flagNumber: 3 });
    server.groups = server.groups.filter((g) => g.id !== 'regions');
    const catalog = build(server);
    expect(catalog.byId.atlantis).toBeUndefined();
    expect(catalog.byId['middle-east']).toMatchObject({ playable: true, type: 'default' }); // bundled: still fine
  });

  it('supports a hypothetical new category and group without any code change', () => {
    const extended = {
      groups: [
        ...tree.groups,
        {
          id: 'themes',
          name: 'Themes',
          layout: 'list',
          categories: [
            { id: 'premium-pack', name: 'Premium Pack', type: 'paid', priceCents: 499, flagSource: { kind: 'remote', dataset: 'world-1945' } },
            { id: 'oceania-lite', name: 'Oceania Lite', type: 'default', flagSource: { kind: 'bundled', where: { continent: 'Oceania' } } },
          ],
        },
      ],
    };
    const server = {
      groups: [
        ...serverResponse().groups,
        {
          id: 'themes',
          name: 'Themes',
          categories: [{ id: 'premium-pack', name: 'Premium Pack', type: 'paid', enabled: true, priceCents: 499, currency: 'usd', hosting: 'remote', flagNumber: 12 }],
        },
      ],
    };
    const catalog = buildCatalog(extended, ALL_COUNTRIES, server, null);
    const themes = catalog.groups.find((g) => g.id === 'themes');
    expect(themes.categories.map((c) => c.id)).toEqual(['premium-pack', 'oceania-lite']);
    expect(catalog.byId['premium-pack']).toMatchObject({ type: 'paid', locked: true, flagNumber: 12 });
    expect(catalog.byId['oceania-lite'].flagNumber).toBe(countriesForCategory('oceania', ALL_COUNTRIES).length);
  });
});
