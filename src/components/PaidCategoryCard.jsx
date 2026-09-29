const CURRENCY_SYMBOLS = { usd: '$', eur: '\u20ac', gbp: '\u00a3' };

function formatPrice(cents, currency) {
  const symbol = CURRENCY_SYMBOLS[currency] || '';
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

/**
 * Visual states, matching the brief's mockups:
 *   - free          -> "Free" badge (e.g. a Historical map an admin
 *                      hasn't made premium) -- playable by anyone,
 *                      guests included, same as any other free category
 *   - admin bypass  -> "Admin access" badge, always clickable/playable
 *   - owned         -> "Owned" badge, playable (a real purchase)
 *   - disabled      -> "Currently unavailable" (even for an existing
 *                      owner -- see server README "Backend toggle": the
 *                      entitlement is preserved, but access pauses while
 *                      disabled, admins excepted)
 *   - locked        -> "Premium - $X.XX" badge, dimmed; click opens
 *                      the purchase modal instead of starting a game
 */
export function PaidCategoryCard({ category, selected, onSelect, onOpenPurchase }) {
  if (!category) return null;
  const { name, priceCents, currency, enabled, premium, owned, viaAdmin } = category;

  const isFree = !premium;
  const isAdminBypass = premium && viaAdmin;
  const isUnavailable = !enabled && !isAdminBypass;
  const isOwned = premium && owned && !viaAdmin;
  const isLocked = premium && !owned && !isAdminBypass && !isUnavailable;

  function handleClick() {
    if (isUnavailable) return;
    if (isFree || isAdminBypass || isOwned) {
      onSelect();
    } else {
      onOpenPurchase();
    }
  }

  const classes = ['world-card', 'paid-category-card'];
  if (selected) classes.push('selected');
  if (isLocked || isUnavailable) classes.push('dimmed');

  return (
    <button type="button" className={classes.join(' ')} onClick={handleClick} disabled={isUnavailable}>
      <span>
        <span className="cc-name">🌍 {name}</span>
        <br />
        {isUnavailable ? (
          <span className="badge badge-disabled">Currently unavailable</span>
        ) : isAdminBypass ? (
          <span className="badge badge-admin">Admin access</span>
        ) : isOwned ? (
          <span className="badge badge-owned">Owned</span>
        ) : isLocked ? (
          <span className="badge badge-locked">Premium &middot; {formatPrice(priceCents, currency)}</span>
        ) : (
          <span className="badge badge-owned">Free</span>
        )}
      </span>
      <span className="btn btn-sm btn-ghost" aria-hidden="true">
        {isLocked ? 'Purchase' : 'Select'}
      </span>
    </button>
  );
}
