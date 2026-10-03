import { CategoryCard, WorldCard, ListCard } from './CategoryCard';
import { PaidCategoryCard } from './PaidCategoryCard';
import { FEATURE_FLAGS } from '../config/appConfig';

/**
 * The category picker. It renders whatever is in the category tree
 * (utils/categories.js -> src/data/categoryTree.json):
 *   - a group marked `featured` is pinned above the tabs,
 *   - every other group is a tab,
 *   - a group's `layout` picks compact grid or wide list cards.
 * Adding a group or a category to the tree needs no change here.
 *
 * A `default` (free) category is a plain tile that selects it. A `paid`
 * category is rendered by the existing PaidCategoryCard, driven by the
 * backend's price / ownership data (`paidCategories`); until the backend
 * has answered it renders nothing, exactly as before.
 */
export default function CategoryGrid({ groups, tab, onTabChange, categoryId, onSelectCategory, paidCategories, onOpenPurchase }) {
  // Paid categories only exist in the UI while the premium feature is on.
  const visible = groups
    .map((group) => ({
      ...group,
      categories: group.categories.filter((c) => c.type !== 'paid' || FEATURE_FLAGS.paidCategories),
    }))
    .filter((group) => group.categories.length > 0);

  const featuredGroups = visible.filter((g) => g.featured);
  const tabGroups = visible.filter((g) => !g.featured);
  const activeGroup = tabGroups.find((g) => g.id === tab) || tabGroups[0];

  const tile = (category, group) => {
    if (category.type === 'paid') {
      const info = paidCategories[category.id];
      if (!info) return null; // backend hasn't answered (or isn't reachable)
      return (
        <PaidCategoryCard
          key={category.id}
          category={info}
          selected={categoryId === category.id}
          onSelect={() => onSelectCategory(category.id)}
          onOpenPurchase={() => onOpenPurchase(category.id)}
        />
      );
    }
    const common = {
      id: category.id,
      label: category.name,
      count: category.flagNumber,
      selected: categoryId === category.id,
      onClick: () => onSelectCategory(category.id),
    };
    if (group.featured) return <WorldCard key={category.id} {...common} />;
    if (group.layout === 'list') return <ListCard key={category.id} {...common} />;
    return <CategoryCard key={category.id} {...common} />;
  };

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

      {featuredGroups.map((group) => group.categories.map((category) => tile(category, group)))}

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
