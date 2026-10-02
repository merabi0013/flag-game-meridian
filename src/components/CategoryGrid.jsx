import CategoryTile from './CategoryTile';

/**
 * The category picker, generated from the catalog's groups: groups marked
 * `featured` are pinned above the tabs, every other group becomes a tab,
 * and each group's `layout` picks compact grid or wide list. Adding a
 * group or a category to shared/categoryTree.json needs no change here.
 */
export default function CategoryGrid({ groups, tab, onTabChange, categoryId, onSelectCategory, onOpenPurchase }) {
  const featuredGroups = groups.filter((g) => g.featured);
  const tabGroups = groups.filter((g) => !g.featured);
  const activeGroup = tabGroups.find((g) => g.id === tab) || tabGroups[0];

  const tile = (category, group, featured = false) => (
    <CategoryTile
      key={category.id}
      category={category}
      layout={group.layout}
      featured={featured}
      selected={categoryId === category.id}
      onSelect={onSelectCategory}
      onOpenPurchase={onOpenPurchase}
    />
  );

  return (
    <>
      {tabGroups.length > 1 && (
        <div className="tab-row" role="tablist" aria-label="Category groups">
          {tabGroups.map((group) => (
            <button
              key={group.id}
              className={`tab-btn${activeGroup && activeGroup.id === group.id ? ' active' : ''}`}
              role="tab"
              aria-selected={!!activeGroup && activeGroup.id === group.id}
              onClick={() => onTabChange(group.id)}
            >
              {group.name}
            </button>
          ))}
        </div>
      )}

      {featuredGroups.map((group) => group.categories.map((category) => tile(category, group, true)))}

      {activeGroup && (
        <div
          className={activeGroup.layout === 'list' ? 'historical-grid' : 'category-grid'}
          aria-live="polite"
          data-group={activeGroup.id}
        >
          {activeGroup.categories.map((category) => tile(category, activeGroup))}
        </div>
      )}
    </>
  );
}
