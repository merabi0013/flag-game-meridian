-- Meridian initial schema (PostgreSQL 13+).
--
-- Design notes
--  * users is the person/account; auth_identities are the ways they can sign
--    in (Google, Discord, ...). One user may have several identities, but
--    two identities are NEVER merged automatically just because their emails
--    match — linking is an explicit, authenticated action (see README).
--  * categories holds per-category *configuration* (free/paid, enabled,
--    price). It never holds gameplay data; flags live in the frontend bundle
--    or in server/data/*.json (see categories.flag_source).
--  * Timestamps are timestamptz (UTC). Booleans are real booleans.

CREATE TABLE users (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,               -- display name
  email                TEXT,                        -- from the first identity that supplied one
  status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  is_admin             BOOLEAN NOT NULL DEFAULT false,
  is_verified_identity BOOLEAN NOT NULL DEFAULT true, -- false = placeholder created by an admin
  created_by_admin     UUID,
  stat_overrides       JSONB,                       -- admin display overrides, see lib/userStats.js
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ,
  last_login_at        TIMESTAMPTZ
);
CREATE INDEX idx_users_created ON users (created_at DESC);
CREATE INDEX idx_users_email_lower ON users (lower(email));

CREATE TABLE auth_identities (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider            TEXT NOT NULL,                -- 'google' | 'discord' | 'manual' | ...
  provider_account_id TEXT NOT NULL,                -- the provider's stable id for the person (Google `sub`, Discord snowflake)
  email               TEXT,
  email_verified      BOOLEAN NOT NULL DEFAULT false,
  display_name        TEXT,
  avatar_url          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at       TIMESTAMPTZ,
  UNIQUE (provider, provider_account_id)
);
CREATE INDEX idx_identities_user ON auth_identities (user_id);

-- Opaque bearer-token sessions. Only the SHA-256 of the token is stored, so
-- a database leak does not leak usable sessions.
CREATE TABLE sessions (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  user_agent   TEXT
);
CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

-- Single-use, short-lived codes: 'login' (OAuth callback -> frontend token
-- exchange) and 'link' (start of an authenticated account-linking flow).
CREATE TABLE one_time_codes (
  code_hash  TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL CHECK (purpose IN ('login', 'link')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_codes_expires ON one_time_codes (expires_at);

-- Category configuration. One row per leaf category in shared/categoryTree.json.
CREATE TABLE categories (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  group_id     TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  type         TEXT NOT NULL DEFAULT 'default' CHECK (type IN ('default', 'paid')),
  enabled      BOOLEAN NOT NULL DEFAULT true,
  price_cents  INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency     TEXT NOT NULL DEFAULT 'usd',
  description  TEXT,
  flag_source  JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ
);

CREATE TABLE transactions (
  id                         BIGSERIAL PRIMARY KEY,
  user_id                    UUID REFERENCES users (id) ON DELETE SET NULL, -- keep financial records if a user is deleted
  category_id                TEXT NOT NULL,
  provider                   TEXT NOT NULL,
  provider_session_id        TEXT UNIQUE,
  provider_payment_intent_id TEXT,
  amount_cents               INTEGER NOT NULL,
  currency                   TEXT NOT NULL,
  status                     TEXT NOT NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at               TIMESTAMPTZ
);
CREATE INDEX idx_transactions_user ON transactions (user_id);
CREATE INDEX idx_transactions_created ON transactions (created_at DESC);

CREATE TABLE entitlements (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category_id    TEXT NOT NULL REFERENCES categories (id),
  transaction_id BIGINT REFERENCES transactions (id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'active',
  purchased_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, category_id)
);
CREATE INDEX idx_entitlements_user ON entitlements (user_id);

-- category_id is intentionally NOT a foreign key on games: history must
-- survive a category being renamed, retired or removed from the tree.
CREATE TABLE games (
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category_id      TEXT NOT NULL,
  difficulty       TEXT NOT NULL,
  score            INTEGER NOT NULL,
  correct          INTEGER NOT NULL,
  incorrect        INTEGER NOT NULL,
  skipped          INTEGER NOT NULL DEFAULT 0,
  total_questions  INTEGER NOT NULL,
  best_streak      INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  reason           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_games_user_created ON games (user_id, created_at DESC);
CREATE INDEX idx_games_user_category ON games (user_id, category_id);

CREATE TABLE multiplayer_games (
  id              BIGSERIAL PRIMARY KEY,
  host_user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category_id     TEXT NOT NULL,
  difficulty      TEXT NOT NULL,
  total_questions INTEGER NOT NULL,
  guessing_order  TEXT NOT NULL,
  player_count    INTEGER NOT NULL,
  players         JSONB NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_multiplayer_host ON multiplayer_games (host_user_id, created_at DESC);

CREATE TABLE admin_audit_log (
  id             BIGSERIAL PRIMARY KEY,
  admin_id       UUID NOT NULL,
  action         TEXT NOT NULL,
  target_user_id UUID,
  summary        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_created ON admin_audit_log (created_at DESC);
