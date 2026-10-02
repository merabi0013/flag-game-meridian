/**
 * lib/fulfillment.js
 * -----------------------------------------------------------------------
 * The one place a paid Stripe Checkout Session becomes a stored transaction
 * plus a granted entitlement. Called from the confirm redirect
 * (routes/purchase.js) and from the webhook (routes/webhooks.js); both
 * hand it a Session that came from Stripe's own API or a verified webhook
 * signature, never anything the browser merely asserts.
 *
 * Idempotent: transactions.provider_session_id and
 * entitlements(user_id, category_id) are UNIQUE, so processing one session
 * twice (redirect AND webhook) changes nothing the second time.
 * -----------------------------------------------------------------------
 */
function makeFulfillment({ db, repos }) {
  /** Returns { fulfilled, alreadyProcessed?, userId?, categoryId?, reason? }. */
  async function fulfillCheckoutSession(session) {
    if (session.payment_status !== 'paid') {
      return { fulfilled: false, reason: `payment_status is "${session.payment_status}", not "paid"` };
    }
    const userId = session.client_reference_id || (session.metadata && session.metadata.userId);
    const categoryId = session.metadata && session.metadata.categoryId;
    if (!userId || !categoryId) return { fulfilled: false, reason: 'Session is missing required metadata' };

    return db.tx(async (q) => {
      const existing = await repos.commerce.findBySession(session.id, q);
      if (existing && existing.status === 'completed') {
        return { fulfilled: true, alreadyProcessed: true, userId, categoryId };
      }
      let tx = existing;
      if (existing) {
        await repos.commerce.markCompleted(existing.id, session.payment_intent || null, q);
      } else {
        // Normally checkout creation already stored a 'pending' row; this is
        // the defensive fallback if that insert never happened.
        tx = await repos.commerce.insertCompleted(
          {
            userId,
            categoryId,
            providerSessionId: session.id,
            paymentIntentId: session.payment_intent || null,
            amountCents: session.amount_total || 0,
            currency: session.currency || 'usd',
          },
          q
        );
      }
      await repos.commerce.grant({ userId, categoryId, transactionId: tx.id }, q);
      return { fulfilled: true, alreadyProcessed: false, userId, categoryId };
    });
  }

  return { fulfillCheckoutSession };
}

module.exports = { makeFulfillment };
