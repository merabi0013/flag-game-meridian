/** repositories/commerce.js — entitlements (who owns what) and payment transactions. */
function mapTx(r) {
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    categoryId: r.category_id,
    provider: r.provider,
    providerSessionId: r.provider_session_id,
    amountCents: r.amount_cents,
    currency: r.currency,
    status: r.status,
    createdAt: r.created_at,
    completedAt: r.completed_at,
    userName: r.user_name,
    userEmail: r.user_email,
  };
}

function makeCommerceRepo(db) {
  return {
    // --- entitlements ---------------------------------------------------
    async hasEntitlement(userId, categoryId, q = db) {
      const { rows } = await q.query(
        "SELECT 1 FROM entitlements WHERE user_id = $1 AND category_id = $2 AND status = 'active'",
        [userId, categoryId]
      );
      return rows.length > 0;
    },

    async ownedCategoryIds(userId, q = db) {
      const { rows } = await q.query("SELECT category_id FROM entitlements WHERE user_id = $1 AND status = 'active'", [userId]);
      return new Set(rows.map((r) => r.category_id));
    },

    async grant({ userId, categoryId, transactionId }, q = db) {
      await q.query(
        `INSERT INTO entitlements (user_id, category_id, transaction_id, status)
         VALUES ($1, $2, $3, 'active') ON CONFLICT (user_id, category_id) DO NOTHING`,
        [userId, categoryId, transactionId]
      );
    },

    async ownerCounts(q = db) {
      const { rows } = await q.query(
        "SELECT category_id, COUNT(*)::int AS n FROM entitlements WHERE status = 'active' GROUP BY category_id"
      );
      return new Map(rows.map((r) => [r.category_id, r.n]));
    },

    // --- transactions ---------------------------------------------------
    async insertPending({ userId, categoryId, providerSessionId, amountCents, currency }, q = db) {
      await q.query(
        `INSERT INTO transactions (user_id, category_id, provider, provider_session_id, amount_cents, currency, status)
         VALUES ($1, $2, 'stripe', $3, $4, $5, 'pending')`,
        [userId, categoryId, providerSessionId, amountCents, currency]
      );
    },

    async findBySession(providerSessionId, q = db) {
      const { rows } = await q.query('SELECT * FROM transactions WHERE provider_session_id = $1', [providerSessionId]);
      return mapTx(rows[0]);
    },

    async markCompleted(id, paymentIntentId, q = db) {
      await q.query(
        "UPDATE transactions SET status = 'completed', completed_at = now(), provider_payment_intent_id = $2 WHERE id = $1",
        [id, paymentIntentId]
      );
    },

    /** Idempotent by provider_session_id UNIQUE; returns the row either way. */
    async insertCompleted({ userId, categoryId, providerSessionId, paymentIntentId, amountCents, currency }, q = db) {
      await q.query(
        `INSERT INTO transactions (user_id, category_id, provider, provider_session_id, provider_payment_intent_id, amount_cents, currency, status, completed_at)
         VALUES ($1, $2, 'stripe', $3, $4, $5, $6, 'completed', now())
         ON CONFLICT (provider_session_id) DO NOTHING`,
        [userId, categoryId, providerSessionId, paymentIntentId, amountCents, currency]
      );
      return this.findBySession(providerSessionId, q);
    },

    async listTransactions({ page, pageSize }, q = db) {
      const total = (await q.query('SELECT COUNT(*)::int AS n FROM transactions')).rows[0].n;
      const { rows } = await q.query(
        `SELECT t.*, u.name AS user_name, u.email AS user_email
           FROM transactions t LEFT JOIN users u ON u.id = t.user_id
          ORDER BY t.created_at DESC, t.id DESC LIMIT $1 OFFSET $2`,
        [pageSize, (page - 1) * pageSize]
      );
      return { total, transactions: rows.map(mapTx) };
    },
  };
}

module.exports = { makeCommerceRepo };
