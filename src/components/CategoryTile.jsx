const CURRENCY_SYMBOLS = { usd: '$', eur: '€', gbp: '£' };

export function formatPrice(cents, currency) {
  const symbol = CURRENCY_SYMBOLS[currency] || '';
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

/**
 * One tile for every category, whatever group it is in. What it shows
 * comes only from the catalog entry (utils/categoryCatalog.js), whose
 * `type` is the SERVER's value:
 *
 *   default type      -> just the flag count (or a "Free" badge in lists)
 *   paid, locked      -> "Premium · $X.XX", dimmed; click opens purchase
 *   paid, owned       -> "Owned" badge, playable
 *   paid, via admin   -> "Admin access" badge, playable
 *   disabled          -> "Currently unavailable" (owners keep their
 *                        purchase; play pauses, admins excepted)
 *
 * layout: 'grid' compact card | 'list' wide card. `featured` is the wide
 * card pinned above the tabs.
 */
export default function CategoryTile({ category, layout = 'grid', featured = false, selected, onSelect, onOpenPurchase }) {
  const { name, type, flagNumber, priceCents, currency, owned, viaAdmin, unavailable, locked } = category;
  const paid = type === 'paid';

  function handleClick() {
    if (unavailable) return;
    if (locked) onOpenPurchase(category.id);
    else onSelect(category.id);
  }

  let badge = null;
  if (unavailable) badge = <span className="badge badge-disabled">Currently unavailable</span>;
  else if (paid && viaAdmin) badge = <span className="badge badge-admin">Admin access</span>;
  else if (paid && owned) badge = <span className="badge badge-owned">Owned</span>;
  else if (locked) badge = <span className="badge badge-locked">Premium &middot; {formatPrice(priceCents, currency)}</span>;
  else if (layout === 'list' && !featured) badge = <span className="badge badge-owned">Free</span>;

  const count = flagNumber > 0 ? (
    <span className="cc-count">
      {flagNumber} flag{flagNumber === 1 ? '' : 's'}
    </span>
  ) : null;

  const dimmed = locked || unavailable;

  if (layout === 'grid' && !featured) {
    return (
      <button
        type="button"
        className={`category-card${selected ? ' selected' : ''}${dimmed ? ' dimmed' : ''}`}
        onClick={handleClick}
        disabled={unavailable}
        data-category={category.id}
        data-type={type}
      >
        <span className="cc-name">{name}</span>
        {count}
        {badge}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`world-card paid-category-card${selected ? ' selected' : ''}${dimmed ? ' dimmed' : ''}`}
      onClick={handleClick}
      disabled={unavailable}
      data-category={category.id}
      data-type={type}
    >
      <span>
        <span className="cc-name">🌍 {name}</span>
        <br />
        {count}
        {count && badge ? ' ' : null}
        {badge}
      </span>
      <span className="btn btn-sm btn-ghost" aria-hidden="true">
        {locked ? 'Purchase' : 'Select'}
      </span>
    </button>
  );
}
