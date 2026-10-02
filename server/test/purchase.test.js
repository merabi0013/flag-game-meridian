import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestApp } = require('./helpers/testApp');
const { makeStripeClient } = require('../lib/stripeClient');

/** A fake Stripe: remembers sessions it "created" and lets a test mark them paid. */
function fakeStripe() {
  const sessions = new Map();
  let n = 0;
  return {
    sessions,
    hasStripeCreds: true,
    webhookSecret: 'whsec_test',
    stripe: {
      checkout: {
        sessions: {
          create: async (params) => {
            const id = `cs_test_${++n}`;
            sessions.set(id, { id, payment_status: 'unpaid', client_reference_id: params.client_reference_id, metadata: params.metadata, amount_total: params.line_items[0].price_data.unit_amount, currency: params.line_items[0].price_data.currency, payment_intent: `pi_${n}`, params });
            return { id, url: `https://checkout.stripe.test/${id}` };
          },
          retrieve: async (id) => {
            if (!sessions.has(id)) throw new Error('No such session');
            return sessions.get(id);
          },
        },
      },
      webhooks: {
        constructEvent: (body, signature, secret) => {
          if (signature !== 'valid-signature' || secret !== 'whsec_test') throw new Error('bad signature');
          return JSON.parse(body.toString());
        },
      },
    },
  };
}

let t;
let stripe;
beforeAll(async () => {
  stripe = fakeStripe();
  t = await createTestApp({ stripeClient: stripe });
});
afterAll(() => t.close());

describe('checkout', () => {
  it('requires sign-in and a paid, enabled, known category', async () => {
    expect((await t.client.post('/api/purchase/world-1914/checkout', {})).status).toBe(401);
    const u = await t.login('google', t.profiles.google('buyer-0'));
    expect((await t.client.post('/api/purchase/nope/checkout', {}, { token: u.token })).status).toBe(404);
    expect((await t.client.post('/api/purchase/europe/checkout', {}, { token: u.token })).status).toBe(400); // free
  });

  it('uses the price stored on the server, not anything the browser sends', async () => {
    const u = await t.login('google', t.profiles.google('buyer-1'));
    const res = await t.client.post('/api/purchase/world-1914/checkout', { priceCents: 1, amount: 1, unit_amount: 1 }, { token: u.token });
    expect(res.status).toBe(200);
    expect(res.json.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    const session = [...stripe.sessions.values()].pop();
    expect(session.amount_total).toBe(200);
    expect(session.params.success_url).toContain(`${t.CLIENT_URL}/purchase/confirm`);
    const tx = await t.repos.commerce.findBySession(session.id);
    expect(tx).toMatchObject({ status: 'pending', userId: u.user.id, categoryId: 'world-1914', amountCents: 200 });
  });

  it('refuses administrators and existing owners', async () => {
    const admin = await t.makeAdmin();
    expect((await t.client.post('/api/purchase/world-1914/checkout', {}, { token: admin.token })).status).toBe(400);
    const owner = await t.login('google', t.profiles.google('buyer-owner'));
    await t.repos.commerce.grant({ userId: owner.user.id, categoryId: 'world-1914', transactionId: null });
    expect((await t.client.post('/api/purchase/world-1914/checkout', {}, { token: owner.token })).status).toBe(409);
  });

  it('is unavailable (503) when Stripe is not configured, without affecting free play', async () => {
    const t2 = await createTestApp({ stripeClient: makeStripeClient({ stripe: {} }) });
    try {
      const u = await t2.login('google', t2.profiles.google('nostripe'));
      expect((await t2.client.post('/api/purchase/world-1914/checkout', {}, { token: u.token })).status).toBe(503);
      expect((await t2.client.get('/api/categories/world-1991/countries')).status).toBe(200);
      expect((await t2.client.get('/api/health')).json.paymentsConfigured).toBe(false);
    } finally {
      await t2.close();
    }
  });
});

describe('confirming a purchase', () => {
  async function startPurchase(id) {
    const u = await t.login('google', t.profiles.google(id));
    await t.client.post('/api/purchase/world-1914/checkout', {}, { token: u.token });
    const session = [...stripe.sessions.values()].pop();
    return { u, session };
  }

  it('does not grant access while Stripe says the session is unpaid', async () => {
    const { u, session } = await startPurchase('confirm-unpaid');
    const res = await t.client.get(`/api/purchase/confirm?session_id=${session.id}`, { token: u.token });
    expect(res.status).toBe(402);
    expect((await t.client.get('/api/categories/world-1914/countries', { token: u.token })).status).toBe(403);
  });

  it('grants the category once Stripe reports it paid, and is idempotent', async () => {
    const { u, session } = await startPurchase('confirm-paid');
    session.payment_status = 'paid';
    const first = await t.client.get(`/api/purchase/confirm?session_id=${session.id}`, { token: u.token });
    expect(first.status).toBe(200);
    expect(first.json).toMatchObject({ paid: true, categoryId: 'world-1914' });
    expect(first.json.access['world-1914'].owned).toBe(true);
    expect((await t.client.get('/api/categories/world-1914/countries', { token: u.token })).status).toBe(200);

    const second = await t.client.get(`/api/purchase/confirm?session_id=${session.id}`, { token: u.token });
    expect(second.status).toBe(200);
    const { rows: ents } = await t.db.query('SELECT 1 FROM entitlements WHERE user_id = $1 AND category_id = $2', [u.user.id, 'world-1914']);
    expect(ents).toHaveLength(1);
    const { rows: txs } = await t.db.query('SELECT status FROM transactions WHERE provider_session_id = $1', [session.id]);
    expect(txs).toEqual([{ status: 'completed' }]);
  });

  it("refuses to confirm someone else's checkout session", async () => {
    const { session } = await startPurchase('confirm-owner');
    session.payment_status = 'paid';
    const thief = await t.login('google', t.profiles.google('confirm-thief'));
    expect((await t.client.get(`/api/purchase/confirm?session_id=${session.id}`, { token: thief.token })).status).toBe(403);
    expect((await t.client.get('/api/categories/world-1914/countries', { token: thief.token })).status).toBe(403);
  });

  it('validates its input', async () => {
    const u = await t.login('google', t.profiles.google('confirm-bad'));
    expect((await t.client.get('/api/purchase/confirm', { token: u.token })).status).toBe(400);
    expect((await t.client.get('/api/purchase/confirm?session_id=cs_missing', { token: u.token })).status).toBe(502);
    expect((await t.client.get('/api/purchase/confirm?session_id=x')).status).toBe(401);
  });
});

describe('Stripe webhook', () => {
  const event = (session) => ({ type: 'checkout.session.completed', data: { object: session } });
  const post = (body, signature) =>
    fetch(`${t.client.base}/api/webhooks/stripe`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': signature }, body: JSON.stringify(body) });

  it('rejects a bad signature and grants nothing', async () => {
    const u = await t.login('google', t.profiles.google('hook-bad'));
    await t.client.post('/api/purchase/world-1914/checkout', {}, { token: u.token });
    const session = { ...[...stripe.sessions.values()].pop(), payment_status: 'paid' };
    expect((await post(event(session), 'forged')).status).toBe(400);
    expect(await t.repos.commerce.hasEntitlement(u.user.id, 'world-1914')).toBe(false);
  });

  it('fulfils a verified paid session even if the buyer never returns, and twice is harmless', async () => {
    const u = await t.login('google', t.profiles.google('hook-ok'));
    await t.client.post('/api/purchase/world-1914/checkout', {}, { token: u.token });
    const session = { ...[...stripe.sessions.values()].pop(), payment_status: 'paid' };
    expect((await post(event(session), 'valid-signature')).status).toBe(200);
    expect((await post(event(session), 'valid-signature')).status).toBe(200);
    expect(await t.repos.commerce.hasEntitlement(u.user.id, 'world-1914')).toBe(true);
    const { rows } = await t.db.query('SELECT 1 FROM entitlements WHERE user_id = $1', [u.user.id]);
    expect(rows).toHaveLength(1);
  });

  it('ignores unpaid sessions and other event types', async () => {
    const u = await t.login('google', t.profiles.google('hook-unpaid'));
    await t.client.post('/api/purchase/world-1914/checkout', {}, { token: u.token });
    const session = [...stripe.sessions.values()].pop();
    expect((await post(event(session), 'valid-signature')).status).toBe(200);
    expect((await post({ type: 'customer.created', data: { object: {} } }, 'valid-signature')).status).toBe(200);
    expect(await t.repos.commerce.hasEntitlement(u.user.id, 'world-1914')).toBe(false);
  });
});
