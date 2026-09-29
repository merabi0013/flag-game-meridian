import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { confirmPurchase, PaymentApiError } from '../utils/paidCategoriesApi';
import { labelForCategory } from '../utils/categories';

/**
 * Stripe redirects the browser here after checkout (see the success_url
 * built in server/routes/purchase.js). This does NOT treat arriving here
 * as proof of payment -- the query string is just a query string. It
 * calls GET /api/purchase/confirm, which re-fetches the session from
 * Stripe's own API server-side and only grants access if Stripe reports
 * payment_status === 'paid'. See server/lib/fulfillment.js.
 */
export default function PurchaseConfirm() {
  const [params] = useSearchParams();
  const [state, setState] = useState('checking'); // 'checking' | 'success' | 'failed'
  const [message, setMessage] = useState(null);

  const sessionId = params.get('session_id');
  const categoryId = params.get('category');

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!sessionId) {
        setState('failed');
        setMessage('Missing checkout session -- nothing to confirm.');
        return;
      }
      try {
        const result = await confirmPurchase(sessionId);
        if (cancelled) return;
        if (result.paid) {
          setState('success');
        } else {
          setState('failed');
          setMessage("Payment wasn't completed, so nothing was unlocked.");
        }
      } catch (err) {
        if (cancelled) return;
        setState('failed');
        setMessage(err instanceof PaymentApiError ? err.message : 'Could not verify this payment.');
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const categoryName = categoryId ? labelForCategory(categoryId) : 'this category';

  return (
    <main className="setup">
      <div className="container">
        <div className="panel state-block" style={{ maxWidth: 480, margin: '40px auto' }}>
          {state === 'checking' && (
            <>
              <div className="spinner" />
              <h3>Confirming your purchase…</h3>
              <p>Verifying payment with Stripe. This only takes a moment.</p>
            </>
          )}
          {state === 'success' && (
            <>
              <h3>{categoryName} unlocked!</h3>
              <p>Your purchase is confirmed and saved to your account — you can play it right away.</p>
              <Link to="/" className="btn btn-primary" style={{ marginTop: 14 }}>
                Start playing
              </Link>
            </>
          )}
          {state === 'failed' && (
            <>
              <h3>Purchase not completed</h3>
              <p>{message}</p>
              <Link to="/" className="btn btn-ghost" style={{ marginTop: 14 }}>
                Back to categories
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
