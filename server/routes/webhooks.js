/**
 * routes/webhooks.js — Stripe webhook. Mounted with express.raw() BEFORE
 * the app-wide express.json() (see index.js): signature verification needs
 * the exact raw request bytes. This is the reliable fulfilment path (it
 * fires even if the buyer never returns to the site); the confirm redirect
 * in routes/purchase.js is the immediate one. Both are idempotent.
 */
const express = require('express');

function buildWebhookRouter({ stripeClient, fulfillment }) {
  const router = express.Router();
  const { stripe, hasStripeCreds, webhookSecret } = stripeClient;

  router.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!hasStripeCreds || !webhookSecret) return res.status(503).send('Webhook not configured');

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
    } catch (err) {
      console.error('[webhook] signature verification failed', err.message);
      return res.status(400).send('Webhook signature verification failed');
    }

    if (event.type === 'checkout.session.completed') {
      try {
        await fulfillment.fulfillCheckoutSession(event.data.object);
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
