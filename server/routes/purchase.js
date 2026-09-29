/**
 * routes/purchase.js
 * -----------------------------------------------------------------------
 * POST /api/purchase/:categoryId/checkout - creates a Stripe Checkout
 *   Session server-side and returns its hosted URL. The frontend does
 *   nothing but redirect the browser there -- it never sees a secret
 *   key, never constructs a price, never tells the backend "charge them".
 *
 * GET /api/purchase/confirm - where Stripe's Checkout redirects the
 *   browser back to after payment. This does NOT trust the redirect
 *   itself as proof of payment (a query string is just a query string)
 *   -- it re-fetches the Session from Stripe's own API using our secret
 *   key and only fulfills if Stripe says payment_status === 'paid'. See
 *   lib/fulfillment.js for the shared, idempotent grant logic also used
 *   by the webhook.
 * -----------------------------------------------------------------------
 */
const express = require('express');
const db = require('../db');
const { stripe, hasStripeCreds } = require('../lib/stripeClient');
const { getPaidCategory, hasEntitlement, listAccessForUser } = require('../lib/entitlements');
const { fulfillCheckoutSession } = require('../lib/fulfillment');
const { requireAuth } = require('../middleware/requireAuth');

function buildPurchaseRouter() {
  const router = express.Router();
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:8787';

  router.get('/api/me/access', requireAuth, (req, res) => {
    res.json({ categories: listAccessForUser(req.user) });
  });

  router.post('/api/purchase/:categoryId/checkout', requireAuth, async (req, res) => {
    if (!hasStripeCreds) {
      return res.status(503).json({ error: 'Payments are not configured on this server yet. See server/.env.example.' });
    }

    const category = getPaidCategory(req.params.categoryId);
    if (!category) return res.status(404).json({ error: 'Unknown category' });
    if (!category.enabled) return res.status(403).json({ error: 'This category is not currently available for purchase.' });
    if (!category.premium) return res.status(400).json({ error: 'This category is free — no purchase needed.' });
    if (req.user.is_admin) return res.status(400).json({ error: 'Administrators already have access - no purchase needed.' });
    if (hasEntitlement(req.user.id, category.category_id)) {
      return res.status(409).json({ error: 'You already own this category.' });
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        client_reference_id: req.user.id,
        customer_email: req.user.email || undefined,
        line_items: [
          {
            price_data: {
              currency: category.currency,
              unit_amount: category.price_cents,
              product_data: {
                name: category.name,
                description: category.description || undefined,
              },
            },
            quantity: 1,
          },
        ],
        metadata: { userId: req.user.id, categoryId: category.category_id },
        success_url: `${clientUrl}/purchase/confirm?session_id={CHECKOUT_SESSION_ID}&category=${encodeURIComponent(category.category_id)}`,
        cancel_url: `${clientUrl}/?purchase=cancelled&category=${encodeURIComponent(category.category_id)}`,
      });

      // Record the attempt immediately (status 'pending') so it's visible
      // in the admin transaction list even if the user abandons checkout,
      // and so fulfillment has a row to update rather than only ever
      // inserting one (see lib/fulfillment.js).
      db.prepare(
        `INSERT INTO transactions
           (user_id, category_id, provider, provider_session_id, amount_cents, currency, status, created_at)
         VALUES (?, ?, 'stripe', ?, ?, ?, 'pending', ?)`
      ).run(req.user.id, category.category_id, session.id, category.price_cents, category.currency, new Date().toISOString());

      res.json({ url: session.url });
    } catch (err) {
      console.error('[purchase] failed to create checkout session', err.message);
      res.status(502).json({ error: 'Could not start checkout with the payment provider. Please try again.' });
    }
  });

  router.get('/api/purchase/confirm', requireAuth, async (req, res) => {
    if (!hasStripeCreds) {
      return res.status(503).json({ error: 'Payments are not configured on this server.' });
    }
    const sessionId = req.query.session_id;
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'Missing session_id' });
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      // Whoever is asking us to confirm this session must be the same
      // person the session was created for -- checked against Stripe's
      // own record of client_reference_id, set at session-creation time
      // from THAT request's authenticated user, not from anything in
      // this request.
      if (session.client_reference_id !== req.user.id) {
        return res.status(403).json({ error: 'This checkout session does not belong to your account.' });
      }

      const result = fulfillCheckoutSession(session);
      if (!result.fulfilled) {
        return res.status(402).json({ paid: false, reason: result.reason });
      }

      res.json({ paid: true, categoryId: result.categoryId, access: listAccessForUser(req.user) });
    } catch (err) {
      console.error('[purchase] confirm failed', err.message);
      res.status(502).json({ error: 'Could not verify payment with the payment provider.' });
    }
  });

  return router;
}

module.exports = { buildPurchaseRouter };
