/**
 * db/migrate.js
 * -----------------------------------------------------------------------
 * A deliberately small migration runner: every file in db/migrations/
 * (named NNN_description.sql) runs exactly once, in order, each inside its
 * own transaction, and is recorded in schema_migrations. Safe to run on
 * every server start and safe if two instances start at the same time (a
 * Postgres advisory lock serialises them).
 *
 * To change the schema later: add 002_something.sql. Never edit a
 * migration that has already been applied anywhere.
 * -----------------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const LOCK_KEY = 727274; // arbitrary, just has to be the same everywhere

async function migrate(db, { log = console.log } = {}) {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();

  const applied = [];
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    await db.tx(async (q) => {
      await q.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
      const done = await q.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
      if (done.rows.length) return;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await q.query(sql);
      await q.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
      applied.push(version);
      log(`[db] applied migration ${version}`);
    });
  }
  return applied;
}

module.exports = { migrate };
