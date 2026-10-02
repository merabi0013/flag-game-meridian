/**
 * repositories/categories.js — per-category CONFIGURATION (free/paid,
 * enabled, price). This is the backend's authority over "is this category
 * paid"; the frontend never decides that. Gameplay data is elsewhere.
 */
function map(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    groupId: r.group_id,
    sortOrder: r.sort_order,
    type: r.type,
    enabled: r.enabled,
    priceCents: r.price_cents,
    currency: r.currency,
    description: r.description,
    flagSource: r.flag_source,
  };
}

const EDITABLE = { name: 'name', description: 'description', type: 'type', enabled: 'enabled', priceCents: 'price_cents' };

function makeCategoriesRepo(db) {
  return {
    async list(q = db) {
      const { rows } = await q.query('SELECT * FROM categories ORDER BY sort_order ASC, id ASC');
      return rows.map(map);
    },

    async get(id, q = db) {
      const { rows } = await q.query('SELECT * FROM categories WHERE id = $1', [id]);
      return map(rows[0]);
    },

    /**
     * Seeding: insert a category that does not exist yet. An EXISTING row is
     * never touched apart from structural fields (group, order, flag
     * source), so admin edits to type/enabled/price/name survive every
     * restart and deploy.
     */
    async seed(c, q = db) {
      await q.query(
        `INSERT INTO categories (id, name, group_id, sort_order, type, enabled, price_cents, currency, description, flag_source)
         VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9::jsonb)
         ON CONFLICT (id) DO UPDATE
            SET group_id = EXCLUDED.group_id, sort_order = EXCLUDED.sort_order, flag_source = EXCLUDED.flag_source`,
        [c.id, c.name, c.groupId, c.sortOrder, c.type, c.priceCents, c.currency, c.description || null, JSON.stringify(c.flagSource)]
      );
    },

    async update(id, fields, q = db) {
      const sets = [];
      const params = [id];
      for (const [key, value] of Object.entries(fields)) {
        if (!EDITABLE[key]) throw new Error(`categories.update: field not editable: ${key}`);
        params.push(value);
        sets.push(`${EDITABLE[key]} = $${params.length}`);
      }
      if (!sets.length) return this.get(id, q);
      const { rows } = await q.query(`UPDATE categories SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`, params);
      return map(rows[0]);
    },
  };
}

module.exports = { makeCategoriesRepo };
