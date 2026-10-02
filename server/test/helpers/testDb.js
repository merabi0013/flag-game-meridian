/**
 * Test database.
 *  - If TEST_DATABASE_URL is set, tests run against that real PostgreSQL
 *    (each test file gets its own throw-away schema).
 *  - Otherwise an in-process PostgreSQL (PGlite, WASM) is used, so
 *    `npm test` needs no database installed at all.
 * Both expose exactly the interface documented in db/pool.js.
 */
const { migrate } = require('../../db/migrate');

async function createPgliteDb() {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite();
  // PGlite's query() only accepts one statement; exec() accepts many but
  // returns no rows for parameterised calls, so route by params.
  const run = (target) => ({
    query: async (text, params) => {
      if (params && params.length) return target.query(text, params);
      const res = await target.exec(text);
      const last = Array.isArray(res) ? res[res.length - 1] : res;
      return { rows: (last && last.rows) || [] };
    },
  });
  return {
    dialect: 'pglite',
    query: (text, params) => run(pg).query(text, params),
    exec: (text) => pg.exec(text),
    tx: (fn) => pg.transaction((tx) => fn(run(tx))),
    end: () => pg.close(),
  };
}

async function createRealPgDb(url) {
  const { createDb } = require('../../db/pool');
  const schema = `t_${Math.random().toString(36).slice(2, 10)}`;
  const admin = createDb({ connectionString: url, max: 1 });
  await admin.exec(`CREATE SCHEMA ${schema}`);
  const u = new URL(url);
  u.searchParams.set('options', `-c search_path=${schema}`);
  const db = createDb({ connectionString: u.toString(), max: 4 });
  const end = db.end;
  db.end = async () => {
    await end();
    await admin.exec(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  };
  return db;
}

async function createTestDb() {
  const db = process.env.TEST_DATABASE_URL ? await createRealPgDb(process.env.TEST_DATABASE_URL) : await createPgliteDb();
  await migrate(db, { log: () => {} });
  return db;
}

module.exports = { createTestDb };
