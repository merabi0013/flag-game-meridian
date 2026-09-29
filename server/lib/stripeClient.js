/**
 * stripeClient.js
 * -----------------------------------------------------------------------
 * Stripe was chosen over PayPal for this feature: Checkout Sessions give
 * a fully-hosted one-time-payment page (we never touch card data), the
 * webhook signature verification is a single documented SDK call, and
 * test-mode (sandbox) is just "use your test secret key" — no separate
 * sandbox account/app registration dance. See README "Payment provider"
 * for the full reasoning.
 *
 * Like Google/Discord OAuth, this is optional-until-configured: with no
 * STRIPE_SECRET_KEY, `stripe` is null and every purchase route responds
 * with a clear "not configured yet" error instead of crashing — the free
 * game and everything else keeps working.
 * -----------------------------------------------------------------------
 */
const Stripe = require('stripe');

const hasStripeCreds = !!process.env.STRIPE_SECRET_KEY;
const stripe = hasStripeCreds ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

if (!hasStripeCreds) {
  console.warn('[payments] STRIPE_SECRET_KEY not set — paid categories are disabled until configured.');
}

module.exports = { stripe, hasStripeCreds };
