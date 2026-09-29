import { categoriesByGroup } from '../utils/categories';
import { CategoryCard, WorldCard } from './CategoryCard';
import { PaidCategoryCard } from './PaidCategoryCard';
import { FEATURE_FLAGS } from '../config/appConfig';

export default function CategoryGrid({
  allCountries,
  tab,
  onTabChange,
  categoryId,
  onSelectCategory,
  countFor,
  paidCategories,
  onOpenPurchase,
}) {
  const isHistoricalTab = tab === 'historical';
  const defs = isHistoricalTab ? [] : categoriesByGroup(tab);
  const historicalDefs = FEATURE_FLAGS.paidCategories ? categoriesByGroup('historical') : [];

  return (
    <>
      <div className="tab-row" role="tablist" aria-label="Category groups">
        <button
          className={`tab-btn${tab === 'continent' ? ' active' : ''}`}
          role="tab"
          aria-selected={tab === 'continent'}
          onClick={() => onTabChange('continent')}
        >
          Continents
        </button>
        <button
          className={`tab-btn${tab === 'region' ? ' active' : ''}`}
          role="tab"
          aria-selected={tab === 'region'}
          onClick={() => onTabChange('region')}
        >
          Regions
        </button>
        {FEATURE_FLAGS.paidCategories && (
          <button
            className={`tab-btn${tab === 'historical' ? ' active' : ''}`}
            role="tab"
            aria-selected={tab === 'historical'}
            onClick={() => onTabChange('historical')}
          >
            Historical
          </button>
        )}
      </div>

      <WorldCard count={allCountries.length} selected={categoryId === 'world'} onClick={() => onSelectCategory('world')} />

      {isHistoricalTab ? (
        <div className="historical-grid" aria-live="polite">
          {historicalDefs.map((def) => {
            const category = paidCategories[def.id];
            if (!category) return null; // still loading from the backend
            return (
              <PaidCategoryCard
                key={def.id}
                category={category}
                selected={categoryId === def.id}
                onSelect={() => onSelectCategory(def.id)}
                onOpenPurchase={() => onOpenPurchase(def.id)}
              />
            );
          })}
        </div>
      ) : (
        <div className="category-grid" aria-live="polite">
          {defs.map((def) => (
            <CategoryCard
              key={def.id}
              label={def.label}
              count={countFor(def.id)}
              selected={categoryId === def.id}
              onClick={() => onSelectCategory(def.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}
