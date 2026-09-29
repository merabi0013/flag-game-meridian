import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { loginUrl } from '../hooks/useAuth';
import { startCheckout, PaymentApiError } from '../utils/paidCategoriesApi';
import Button from './Button';

const CURRENCY_SYMBOLS = { usd: '$', eur: '\u20ac', gbp: '\u00a3' };

function formatPrice(cents, currency) {
  const symbol = CURRENCY_SYMBOLS[currency] || '';
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

export default function PurchaseModal({ category, user, onClose }) {
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handlePurchase() {
    setLoading(true);
    setError(null);
    try {
      const result = await startCheckout(category.categoryId);
      // Full page navigation on purpose -- Stripe Checkout is a hosted
      // page, not something to render inside our own app.
      window.location.href = result.url;
    } catch (err) {
      setLoading(false);
      if (err instanceof PaymentApiError && err.status === 503) {
        setError("Payments aren't set up on this server yet.");
      } else if (err instanceof PaymentApiError && err.status === 409) {
        setError('You already own this category -- refresh the page.');
      } else {
        setError(err.message || 'Could not start checkout.');
      }
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {!user ? (
          <>
            <h2>Sign in to purchase</h2>
            <p className="modal-desc">
              You'll need an account to buy and keep {category.name}. Your current session (and any game in
              progress) stays untouched.
            </p>
            <div className="modal-actions">
              <a className="btn btn-primary btn-block" href={loginUrl('google', location.pathname + location.search)}>
                Continue with Google
              </a>
              <a className="btn btn-ghost btn-block" href={loginUrl('discord', location.pathname + location.search)}>
                Continue with Discord
              </a>
              <Button variant="ghost" block onClick={onClose}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2>{category.name}</h2>
            <p className="modal-desc">{category.description}</p>
            <div className="modal-price">{formatPrice(category.priceCents, category.currency)}</div>
            <div className="modal-price-label">One-time purchase</div>
            {error && <p className="modal-error">{error}</p>}
            <div className="modal-actions">
              <Button variant="primary" block disabled={loading} onClick={handlePurchase}>
                {loading ? 'Starting checkout…' : 'Purchase'}
              </Button>
              <Button variant="ghost" block disabled={loading} onClick={onClose}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
