/**
 * db/pool.js
 * -----------------------------------------------------------------------
 * The ONLY file that knows how to talk to PostgreSQL. Everything else
 * (repositories/*) uses the tiny interface this returns:
 *
 *   db.query(text, params)  -> { rows }
 *   db.exec(text)           -> run a multi-statement script (migrations)
 *   db.tx(async (q) => …)   -> run work in one transaction; q has .query()
 *   db.end()
 *
 * Swapping the Postgres provider (Neon -> Supabase -> RDS) needs no code
 * changes at all — only DATABASE_URL. Swapping the database *engine* means
 * reimplementing this file and repositories/, and nothing else.
 * -----------------------------------------------------------------------
 */
const { Pool, types } = require('pg');

// bigint (int8) comes back as a string by default; every id/count in this
// app fits comfortably in a JS number.
types.setTypeParser(20, (v) => parseInt(v, 10));

function createDb({ connectionString, max = 5 }) {
  const pool = new Pool({
    connectionString,
    max,
    // Serverless Postgres (Neon) suspends idle compute and closes idle
    // connections; keep our idle timeout shorter than theirs so we never
    // hand out a connection the server has already dropped.
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
  });

  // An idle client erroring (server restart, scale-to-zero) must not crash
  // the process; the pool discards it and opens a fresh one on demand.
  pool.on('error', (err) => console.error('[db] idle client error:', err.message));

  return {
    dialect: 'postgres',
    query: (text, params) => pool.query(text, params),
    exec: (text) => pool.query(text),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: (text, params) => client.query(text, params) });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // connection already gone; nothing to roll back
        }
        throw err;
      } finally {
        client.release();
      }
    },
    end: () => pool.end(),
  };
}

module.exports = { createDb };
