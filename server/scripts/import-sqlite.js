/**
 * `npm run import:sqlite -- ./data/meridian.sqlite3`
 *
 * One-time import of the previous SQLite database into PostgreSQL
 * (DATABASE_URL). Migrations and category seeding run first; the import
 * itself is all-or-nothing and refuses a non-empty target. The .sqlite3
 * file is opened read-only and never modified.
 *
 * better-sqlite3 is only needed for this one step, so it is not a regular
 * dependency:   npm install --no-save better-sqlite3
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { loadConfig } = require('../config');
const { createDb } = require('../db/pool');
const { migrate } = require('../db/migrate');
const { createRepositories } = require('../repositories');
const { loadTree, seedCategories } = require('../lib/categoryCatalog');
const { importLegacy } = require('../lib/legacyImport');

function readLegacy(file) {
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch {
    throw new Error('better-sqlite3 is not installed. Run:  npm install --no-save better-sqlite3   (inside server/), then retry.');
  }
  const sqlite = new Database(file, { readonly: true, fileMustExist: true });
  const hasTable = (name) => !!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  const all = (table) => (hasTable(table) ? sqlite.prepare(`SELECT * FROM ${table}`).all() : []);
  const legacy = {
    users: all('users'),
    games: all('games'),
    entitlements: all('entitlements'),
    transactions: all('transactions'),
    multiplayerGames: all('multiplayer_games'),
    auditLog: all('admin_audit_log'),
    paidCategories: all('paid_categories'),
  };
  sqlite.close();
  return legacy;
}

(async () => {
  const file = path.resolve(process.argv[2] || process.env.DB_PATH || './data/meridian.sqlite3');
  if (!fs.existsSync(file)) throw new Error(`SQLite file not found: ${file}`);
  const config = loadConfig();
  if (!config.databaseUrl) throw new Error('DATABASE_URL is not set');

  const legacy = readLegacy(file);
  console.log(`Read from ${file}: ${legacy.users.length} users, ${legacy.games.length} games, ${legacy.transactions.length} transactions, ${legacy.multiplayerGames.length} multiplayer games`);

  const db = createDb({ connectionString: config.databaseUrl, max: 2 });
  try {
    await migrate(db);
    await seedCategories(createRepositories(db), loadTree());
    const summary = await importLegacy(db, legacy);
    console.log('Imported:', JSON.stringify({ ...summary, warnings: summary.warnings.length }));
    if (summary.warnings.length) console.log('Review the warnings above; nothing was silently dropped.');
  } finally {
    await db.end();
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
