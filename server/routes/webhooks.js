/**
 * routes/webhooks.js
 * -----------------------------------------------------------------------
 * Mounted with express.raw() (NOT express.json()) in index.js, because
 * Stripe's signature verification needs the exact raw request body bytes
 * -- parsing it to JSON first would break the signature check. This is
 * mounted before the app's global express.json() middleware for exactly
 * that reason.
 *
 * This is the reliable path (fires even if the user's browser never
 * makes it back to /purchase/confirm); routes/purchase.js's confirm
 * route is the immediate-UX path for local/sandbox dev where Stripe has
 * no public URL to send webhooks to. Both funnel into the same
 * lib/fulfillment.js, which is idempotent either way.
 * -----------------------------------------------------------------------
 */
const express = require('express');
const { stripe, hasStripeCreds } = require('../lib/stripeClient');
const { fulfillCheckoutSession } = require('../lib/fulfillment');

function buildWebhookRouter() {
  const router = express.Router();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  router.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
    if (!hasStripeCreds || !webhookSecret) {
      // Not an error in local/sandbox dev where only the confirm-redirect
      // path is used -- just nothing to verify against.
      return res.status(503).send('Webhook not configured');
    }

    const signature = req.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (err) {
      console.error('[webhook] signature verification failed', err.message);
      return res.status(400).send('Webhook signature verification failed');
    }

    if (event.type === 'checkout.session.completed') {
      try {
        fulfillCheckoutSession(event.data.object);
      } catch (err) {
        console.error('[webhook] fulfillment failed', err.message);
        return res.status(500).send('Fulfillment error');
      }
    }

    res.json({ received: true });
  });

  return router;
}

module.exports = { buildWebhookRouter };
