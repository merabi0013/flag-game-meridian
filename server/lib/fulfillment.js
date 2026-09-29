/**
 * fulfillment.js
 * -----------------------------------------------------------------------
 * The one place a Stripe Checkout Session actually turns into a stored
 * transaction + a granted entitlement. Called from two places:
 *   - routes/purchase.js's GET /confirm (immediate UX after redirect back
 *     from Stripe -- works in local/sandbox dev with no public webhook
 *     endpoint reachable by Stripe)
 *   - routes/webhooks.js's checkout.session.completed handler (the
 *     reliable, production-grade path -- fires even if the user closes
 *     the tab before the redirect completes)
 *
 * Both call this with a Session object that was independently retrieved
 * from Stripe's own API (confirm route) or verified via Stripe's webhook
 * signature (webhook route) -- never anything the client just asserts.
 * Idempotent by construction: the transactions.provider_session_id
 * UNIQUE constraint plus the entitlements.(user_id, category_id) UNIQUE
 * constraint mean processing the same session twice (e.g. the redirect
 * AND the webhook both firing for one purchase) has no additional
 * effect the second time.
 * -----------------------------------------------------------------------
 */
const db = require('../db');
const { grantEntitlement } = require('./entitlements');

/** session: a Stripe Checkout Session object (from stripe.checkout.sessions.retrieve
 * or a verified webhook event's data.object). Returns { fulfilled, alreadyProcessed }. */
function fulfillCheckoutSession(session) {
  if (session.payment_status !== 'paid') {
    return { fulfilled: false, reason: `payment_status is "${session.payment_status}", not "paid"` };
  }

  const userId = session.client_reference_id || (session.metadata && session.metadata.userId);
  const categoryId = session.metadata && session.metadata.categoryId;
  if (!userId || !categoryId) {
    return { fulfilled: false, reason: 'Session is missing required metadata' };
  }

  const existing = db.prepare('SELECT * FROM transactions WHERE provider_session_id = ?').get(session.id);
  if (existing && existing.status === 'completed') {
    return { fulfilled: true, alreadyProcessed: true, userId, categoryId };
  }

  const tx = db.transaction(() => {
    const now = new Date().toISOString();
    if (existing) {
      db.prepare(
        "UPDATE transactions SET status = 'completed', completed_at = ?, provider_payment_intent_id = ? WHERE id = ?"
      ).run(now, session.payment_intent || null, existing.id);
    } else {
      // Defensive fallback: normally routes/purchase.js already inserted
      // a 'pending' row at checkout-creation time, so this branch is
      // only hit if that insert somehow didn't happen -- still safe
      // because provider_session_id is UNIQUE and we've already checked
      // no completed row exists above.
      db.prepare(
        `INSERT INTO transactions
           (user_id, category_id, provider, provider_session_id, provider_payment_intent_id, amount_cents, currency, status, created_at, completed_at)
         VALUES (?, ?, 'stripe', ?, ?, ?, ?, 'completed', ?, ?)`
      ).run(userId, categoryId, session.id, session.payment_intent || null, session.amount_total || 0, session.currency || 'usd', now, now);
    }

    const txRow = db.prepare('SELECT id FROM transactions WHERE provider_session_id = ?').get(session.id);
    grantEntitlement({ userId, categoryId, transactionId: txRow.id });
  });

  tx();
  return { fulfilled: true, alreadyProcessed: false, userId, categoryId };
}

module.exports = { fulfillCheckoutSession };
