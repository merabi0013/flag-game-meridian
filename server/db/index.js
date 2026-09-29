const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || './data/meridian.sqlite3';
const resolved = path.resolve(__dirname, '..', dbPath);
fs.mkdirSync(path.dirname(resolved), { recursive: true });

const db = new Database(resolved);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    email TEXT,
    name TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(provider, provider_id)
  );

  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id),
    category_id TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    score INTEGER NOT NULL,
    correct INTEGER NOT NULL,
    incorrect INTEGER NOT NULL,
    total_questions INTEGER NOT NULL,
    best_streak INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_games_user ON games(user_id);
`);

/**
 * Small idempotent migration helper: SQLite has no
 * "ADD COLUMN IF NOT EXISTS", so we check pragma table_info first. Safe to
 * run on every startup, including against a database created by an older
 * version of this schema.
 */
function ensureColumn(table, column, definition) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all();
  if (existing.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

// --- Admin system columns (added on top of the original schema above) ---
// is_admin: the ONLY thing any backend authorization check ever reads.
//   Never settable through any user-facing or admin-facing API endpoint —
//   see server/README "How administrator authorization works".
// status: 'active' | 'disabled'. A disabled account can't establish a new
//   session (checked in passport-config.js's deserializeUser).
// is_verified_identity: 0 for a placeholder record an admin created by
//   hand (see routes/admin.js) which has no real OAuth login behind it
//   yet; 1 for every account that has actually completed an OAuth flow.
// created_by_admin: the admin user's id, only set for admin-created rows.
ensureColumn('users', 'is_admin', "INTEGER NOT NULL DEFAULT 0");
ensureColumn('users', 'status', "TEXT NOT NULL DEFAULT 'active'");
ensureColumn('users', 'is_verified_identity', "INTEGER NOT NULL DEFAULT 1");
ensureColumn('users', 'created_by_admin', "TEXT");
ensureColumn('users', 'stat_overrides', "TEXT"); // JSON blob, see routes/admin.js
ensureColumn('users', 'updated_at', "TEXT");

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_user_id TEXT,
    summary TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log(created_at);
`);

// --- Paid categories -------------------------------------------------------
// The category's game DATA (which countries/flags belong to it) lives
// entirely outside this database — see server/data/world-1914.json and
// server/lib/paidCategoryData.js. This table is only the commerce side:
// price, whether it's currently purchasable, and (via `entitlements`
// below) who owns it. A category can exist in the game's category system
// without ever appearing here (free categories always do this); a row
// here is what makes a category_id purchasable at all.
db.exec(`
  CREATE TABLE IF NOT EXISTS paid_categories (
    category_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS entitlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id),
    category_id TEXT NOT NULL REFERENCES paid_categories(category_id),
    transaction_id INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    purchased_at TEXT NOT NULL,
    UNIQUE(user_id, category_id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id),
    category_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_session_id TEXT UNIQUE,
    provider_payment_intent_id TEXT,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_entitlements_user ON entitlements(user_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
`);

// `premium` was added after this table already existed in some
// deployments (world-1914 as the sole paid category) -- DEFAULT 1
// backfills every pre-existing row to premium=1, preserving current
// behavior. See the seeding block below for why new rows pass their own
// explicit value instead of relying on this default.
ensureColumn('paid_categories', 'premium', 'INTEGER NOT NULL DEFAULT 1');

// --- Multiplayer history -----------------------------------------------
// A deliberately separate table from `games` (solo history) — see
// README "Solo vs multiplayer statistics". `players_json` is a JSON
// array of per-player results ({name, score, correct, incorrect,
// bestStreak, turnsTaken, accuracy}); it's read-only history, not
// something queried per-field, so one JSON column is simpler than a
// second child table for this first version.
db.exec(`
  CREATE TABLE IF NOT EXISTS multiplayer_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    host_user_id TEXT NOT NULL REFERENCES users(id),
    category_id TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    total_questions INTEGER NOT NULL,
    guessing_order TEXT NOT NULL,
    player_count INTEGER NOT NULL,
    players_json TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_multiplayer_host ON multiplayer_games(host_user_id);
`);

// Seed the initial registered categories if they don't already exist.
// Price/enabled/premium all live in the database (admin-editable, see
// routes/admin.js) precisely so none of it is hard-coded across the app
// -- see README "Paid category architecture" and "Historical categories".
//
// `premium` was added after `world-1914` already existed as a paid
// category with real entitlements possibly attached to it, so the
// column is added with DEFAULT 1 (see ensureColumn above) -- that
// backfills every pre-existing row (at the time of writing, only
// world-1914) to premium=1, preserving its existing paid behavior
// without a separate UPDATE statement. The two new Historical rows
// below explicitly pass premium=0, since every new historical map is
// free by default (README "Default: everything free") regardless of
// the table's backfill default.
const seedCategory = db.prepare(
  `INSERT OR IGNORE INTO paid_categories (category_id, name, description, price_cents, currency, enabled, premium, created_at)
   VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
);

seedCategory.run(
  'world-1914',
  'World 1914',
  'Every applicable flag as it stood in 1914 — empires, kingdoms, and colonial borders instead of today\'s map.',
  200,
  'usd',
  1,
  new Date().toISOString()
);

seedCategory.run(
  'world-1991',
  'World 1991',
  'Flags of the world as 1991 ended — the Soviet Union dissolved days earlier, the Baltics and Yugoslav republics newly independent.',
  0,
  'usd',
  0,
  new Date().toISOString()
);

seedCategory.run(
  'world-1945',
  'World 1945',
  'Flags at the close of World War II — occupation, newly declared (and contested) independence, and empires already gone.',
  0,
  'usd',
  0,
  new Date().toISOString()
);

module.exports = db;
