/**
 * routes/purchase.js
 *   GET  /api/me/access                      what the signed-in user can play
 *   POST /api/purchase/:categoryId/checkout  create a Stripe Checkout Session
 *   GET  /api/purchase/confirm               verify payment with Stripe, then grant
 *
 * The price, type and enabled flag all come from the `categories` table.
 * The confirm route never trusts the redirect itself: it re-fetches the
 * Session from Stripe and fulfils only if Stripe says it is paid AND it
 * was created for the caller. See lib/fulfillment.js.
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');

function buildPurchaseRouter({ config, repos, access, stripeClient, fulfillment, tree }) {
  const router = express.Router();
  const { stripe, hasStripeCreds } = stripeClient;

  const offeredCategories = async () => {
    const offered = new Set(tree.groups.flatMap((g) => g.categories.map((c) => c.id)));
    return (await repos.categories.list()).filter((c) => offered.has(c.id));
  };

  router.get('/api/me/access', requireAuth, async (req, res, next) => {
    try {
      res.json({ access: await access.accessMap(req.user, await offeredCategories()) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/api/purchase/:categoryId/checkout', requireAuth, async (req, res) => {
    if (!hasStripeCreds) {
      return res.status(503).json({ error: 'Payments are not configured on this server yet. See server/.env.example.' });
    }
    try {
      const category = await repos.categories.get(req.params.categoryId);
      if (!category) return res.status(404).json({ error: 'Unknown category' });
      if (!category.enabled) return res.status(403).json({ error: 'This category is not currently available for purchase.' });
      if (category.type !== 'paid') return res.status(400).json({ error: 'This category is free — no purchase needed.' });
      if (req.user.isAdmin) return res.status(400).json({ error: 'Administrators already have access - no purchase needed.' });
      if (await repos.commerce.hasEntitlement(req.user.id, category.id)) {
        return res.status(409).json({ error: 'You already own this category.' });
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        client_reference_id: req.user.id,
        customer_email: req.user.email || undefined,
        line_items: [
          {
            price_data: {
              currency: category.currency,
              unit_amount: category.priceCents,
              product_data: { name: category.name, description: category.description || undefined },
            },
            quantity: 1,
          },
        ],
        metadata: { userId: req.user.id, categoryId: category.id },
        success_url: `${config.clientUrl}/purchase/confirm?session_id={CHECKOUT_SESSION_ID}&category=${encodeURIComponent(category.id)}`,
        cancel_url: `${config.clientUrl}/?purchase=cancelled&category=${encodeURIComponent(category.id)}`,
      });

      // Recorded immediately as 'pending' so abandoned checkouts are visible
      // to admins and fulfilment has a row to complete.
      await repos.commerce.insertPending({
        userId: req.user.id,
        categoryId: category.id,
        providerSessionId: session.id,
        amountCents: category.priceCents,
        currency: category.currency,
      });
      res.json({ url: session.url });
    } catch (err) {
      console.error('[purchase] failed to create checkout session', err.message);
      res.status(502).json({ error: 'Could not start checkout with the payment provider. Please try again.' });
    }
  });

  router.get('/api/purchase/confirm', requireAuth, async (req, res) => {
    if (!hasStripeCreds) return res.status(503).json({ error: 'Payments are not configured on this server.' });
    const sessionId = req.query.session_id;
    if (!sessionId || typeof sessionId !== 'string') return res.status(400).json({ error: 'Missing session_id' });

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      // Whoever confirms must be the person the session was created for.
      if (session.client_reference_id !== req.user.id) {
        return res.status(403).json({ error: 'This checkout session does not belong to your account.' });
      }
      const result = await fulfillment.fulfillCheckoutSession(session);
      if (!result.fulfilled) return res.status(402).json({ paid: false, reason: result.reason });
      res.json({ paid: true, categoryId: result.categoryId, access: await access.accessMap(req.user, await offeredCategories()) });
    } catch (err) {
      console.error('[purchase] confirm failed', err.message);
      res.status(502).json({ error: 'Could not verify payment with the payment provider.' });
    }
  });

  return router;
}

module.exports = { buildPurchaseRouter };
