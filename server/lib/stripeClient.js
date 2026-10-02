/**
 * lib/stripeClient.js
 * -----------------------------------------------------------------------
 * Stripe Checkout (hosted page; we never touch card data). Optional until
 * configured: with no STRIPE_SECRET_KEY, `stripe` is null and every
 * purchase route answers "not configured" instead of crashing — the free
 * game is unaffected. Takes the parsed config; reads no environment itself.
 * -----------------------------------------------------------------------
 */
const Stripe = require('stripe');

function makeStripeClient(config) {
  const secretKey = config.stripe && config.stripe.secretKey;
  return {
    hasStripeCreds: !!secretKey,
    stripe: secretKey ? new Stripe(secretKey) : null,
    webhookSecret: (config.stripe && config.stripe.webhookSecret) || null,
  };
}

module.exports = { makeStripeClient };
