# Meridian backend

How the backend, database and sign-in work, how to run it locally, and what to
do to put it in production. For categories see [CATEGORIES.md](./CATEGORIES.md).

- [Architecture](#architecture)
- [Where the backend runs (and why GitHub Pages is not enough)](#where-the-backend-runs)
- [Database: Neon PostgreSQL](#database-neon-postgresql)
- [Managing the database remotely](#managing-the-database-remotely)
- [Environment variables](#environment-variables)
- [Running locally](#running-locally)
- [Sign-in (Google and Discord)](#sign-in-google-and-discord)
  - [Google setup](#google-setup)
  - [Discord setup](#discord-setup)
  - [Local vs production callback URLs](#local-vs-production-callback-urls)
  - [Testing sign-in](#testing-sign-in)
- [How the sign-in flow works](#how-the-sign-in-flow-works)
- [Users and identities](#users-and-identities)
- [Linking a second provider](#linking-a-second-provider)
- [Sessions](#sessions)
- [Administrators](#administrators)
- [Profile statistics](#profile-statistics)
- [Migrating the old SQLite data](#migrating-the-old-sqlite-data)
- [Deploying the backend (Render example)](#deploying-the-backend-render-example)
- [Tests](#tests)
- [Adding another sign-in provider](#adding-another-sign-in-provider)

## Architecture

```
 Browser
   │  React app (static files, GitHub Pages)      no secrets, no DB access
   │
   │  HTTPS + "Authorization: Bearer <session token>"
   ▼
 Backend / API  (Node + Express, server/)          holds ALL secrets
   │  routes/      HTTP only: parse, authorise, call repositories
   │  auth/        provider registry + generic OAuth 2.0 (code + PKCE)
   │  lib/         access rules, category catalog, stats, fulfilment
   │  repositories/  the ONLY code that writes SQL
   │  db/          pool + migrations
   ▼
 PostgreSQL (Neon)
```

Rules the code follows:

- **The browser never talks to the database** and never receives a database
  URL, OAuth client secret, session secret or Stripe key. The only variables
  the frontend reads are the public `VITE_API_BASE` and `VITE_BASE_PATH`.
- **All SQL lives in `server/repositories/`.** Routes and services call
  repository methods that return plain camelCase objects. The connection is
  created in one place (`db/pool.js`) from a single `DATABASE_URL`, so moving
  to another PostgreSQL host (Supabase, RDS, a VPS, …) means changing that
  one variable. The `db` object is a tiny interface
  (`query`, `exec`, `tx`, `end`); the test-suite runs the same code on a real
  PostgreSQL and on an in-process PostgreSQL (PGlite).
- **Authorisation is decided on the server, on every request.**
  `lib/access.js` is the single place that answers "may this user play this
  category?" (see [CATEGORIES.md](./CATEGORIES.md#free-vs-paid)).
- **Migrations** are plain `.sql` files in `server/db/migrations/`, applied in
  order at startup (or with `npm run migrate`) under a PostgreSQL advisory lock
  so two instances cannot race. Applied migrations are recorded in
  `schema_migrations`. To change the schema add a new numbered file; never
  edit one that has been applied.

Main tables (`server/db/migrations/001_initial.sql`): `users`,
`auth_identities`, `sessions`, `one_time_codes`, `categories`, `transactions`,
`entitlements`, `games`, `multiplayer_games`, `admin_audit_log`.

## Where the backend runs

GitHub Pages only serves static files, so the backend is a **separate service
on its own host, independent of GitHub Pages**. Any host that can run Node
20+ works (Render, Railway, Fly.io, a VPS, …). The backend needs no disk — all
state is in the hosted database — so a free web-service tier is enough.

How the frontend finds it: at build time the GitHub Actions workflow passes
the repository variable `VITE_API_BASE` (the backend's public https URL, no
trailing slash) to Vite. `src/hooks/useAuth.js` prefixes every API request
with it. If `VITE_API_BASE` is empty, or the backend is unreachable, the app
falls back to **guest mode**: bundled free categories and local statistics
still work, sign-in and server-hosted categories are simply not offered.

Because the frontend (`https://<user>.github.io`) and the backend are
different sites, browsers block third-party cookies between them. The design
therefore avoids cookies for the session: the frontend keeps an opaque bearer
token and sends it in the `Authorization` header. CORS allows only exact
origins (see `CLIENT_URL` below) and does not use credentialed requests.

> The real production backend URL is **not known yet**, so nothing in this
> repository contains one. Wherever a production URL is needed the docs write
> `<API_PUBLIC_URL>`; you fill it in after the first deploy.

## Database: Neon PostgreSQL

**Chosen: Neon** (hosted PostgreSQL) with the `pg` driver.

Why:

- Free tier with no credit card and no expiry, real PostgreSQL 16 (the code
  uses ordinary SQL, `jsonb`, `timestamptz`, transactions, advisory locks).
- Remotely administrable: web SQL editor and table browser in the Neon
  console, standard `psql` / any GUI client over a normal connection string,
  and database **branching** (a copy-on-write copy of production to test a
  migration or an import on).
- Scales to zero when idle and wakes in about a second, which suits a small
  game.
- Portable: only `DATABASE_URL` ties the app to Neon (see the architecture
  section). Supabase was evaluated as the closest alternative; it would work
  with no code change because it is also plain PostgreSQL, but the extras
  (its own auth, storage, row-level-security API) are not needed here and using
  them would tie the app to that vendor.

Setup:

1. Create a project at <https://console.neon.tech>, pick the region closest to
   your backend host.
2. In **Connection details** copy the **pooled** connection string. It looks
   like `postgres://USER:PASSWORD@HOST/DBNAME?sslmode=require`.
3. Put it in `DATABASE_URL` (in `server/.env` locally, in your host's
   environment settings in production). Never commit it and never put it in
   a `VITE_*` variable.

The tables are created automatically the first time the server starts.

## Managing the database remotely

- **Console:** Neon → your project → *SQL Editor* to run queries, *Tables* to
  browse and edit rows.
- **psql / GUI (DBeaver, TablePlus, …):** `psql "$DATABASE_URL"`.
- **Safe experiments:** create a Neon *branch*, point a local `DATABASE_URL`
  at it, run a migration or import there, delete the branch when done.
- **Backups:** Neon keeps point-in-time history (window depends on plan). For
  a manual dump: `pg_dump "$DATABASE_URL" -Fc -f meridian.dump`.
- **Handy queries:**

  ```sql
  -- who is registered and how they sign in
  SELECT u.name, u.email, u.status, u.created_at, u.last_login_at,
         array_agg(i.provider) AS providers
    FROM users u LEFT JOIN auth_identities i ON i.user_id = u.id
   GROUP BY u.id ORDER BY u.created_at DESC;

  -- make a category free or paid (see CATEGORIES.md)
  UPDATE categories SET type = 'paid', price_cents = 200 WHERE id = 'world-1914';

  -- grant a user administrator rights
  UPDATE users SET is_admin = true WHERE email = 'you@example.com';
  ```

## Environment variables

All of these are read **only by the backend** (`server/config.js`). Locally
they live in `server/.env` (git-ignored; copy from `server/.env.example`); in
production set them in the hosting dashboard.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string (Neon pooled string, `?sslmode=require`). **Secret.** |
| `SESSION_SECRET` | yes in production (≥ 32 chars) | Signs the 10-minute sign-in handshake cookie. **Secret.** Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CLIENT_URL` | yes in production | Exact URL people open the React app at, **including the GitHub Pages sub-path**, no trailing slash, e.g. `https://<user>.github.io/<repo>`. Used for post-login redirects; its origin is the CORS allow-list. |
| `API_PUBLIC_URL` | yes in production (https) | The backend's own public URL, no trailing slash. Callback URLs default to `<API_PUBLIC_URL>/auth/<provider>/callback`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | to enable Google | From Google Cloud Console. Secret is **secret**. |
| `GOOGLE_CALLBACK_URL` | no | Override of the default Google callback. |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | to enable Discord | From the Discord Developer Portal. Secret is **secret**. |
| `DISCORD_CALLBACK_URL` | no | Override of the default Discord callback. |
| `ADMIN_EMAILS` | no | Comma-separated emails granted admin on first sign-in with a *provider-verified* address (grant-only). |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | no | Enable paid categories. Both **secret**. Blank = paid categories disabled, everything else unaffected. |
| `PORT` | no (default 8787) | Listen port. Most hosts set it for you. |
| `NODE_ENV` | no | `production` turns on the stricter validation above and `Secure` cookies. |
| `SESSION_TTL_DAYS` | no (30) | Session lifetime without use (slides forward while used). |
| `AUTH_RATE_LIMIT_PER_MINUTE` | no (60) | Per-IP limit on the sign-in endpoints. |
| `DATABASE_POOL_MAX` | no (5) | Max DB connections (keep small on free tiers). |
| `CORS_EXTRA_ORIGINS` | no | Extra allowed browser origins, comma-separated. |

Public frontend variables (baked into the JavaScript, so **never** a secret):

| Variable | Where set | Purpose |
|---|---|---|
| `VITE_API_BASE` | GitHub → Settings → Secrets and variables → Actions → **Variables** | Public URL of the backend. Empty = guest-only build. |
| `VITE_BASE_PATH` | set automatically by `.github/workflows/deploy-pages.yml` | Sub-path GitHub Pages serves the app from. |

The server refuses to start in production with a missing `DATABASE_URL`, a
short `SESSION_SECRET`, a missing `CLIENT_URL`, or a non-https
`API_PUBLIC_URL`, and prints exactly what is wrong. `.env` files are ignored by
Git (`.gitignore`); only the `*.example` templates are committed.

## Running locally

Requirements: Node 20+, and a PostgreSQL database (a free Neon project or a
local PostgreSQL).

```bash
npm install                  # frontend
npm --prefix server install  # backend
cp server/.env.example server/.env
#   edit server/.env: DATABASE_URL, SESSION_SECRET, and the OAuth credentials
#   you have (leave the others blank; that provider is simply hidden)

npm --prefix server start    # API on http://localhost:8787 (migrates + seeds first)

# in a second terminal — the Vite dev server:
echo "VITE_API_BASE=http://localhost:8787" > .env.local
npm run dev                  # http://localhost:5173  (CLIENT_URL default)
```

Alternatively `npm run build && npm --prefix server start` serves the built
app and the API together from `http://localhost:8787` (then set
`CLIENT_URL=http://localhost:8787` and leave `VITE_API_BASE` empty).

`GET /api/health` reports database reachability and which providers/payments
are configured.

## Sign-in (Google and Discord)

Sign-in is done **entirely on the server** (OAuth 2.0 authorisation-code flow
with PKCE). Client secrets never reach the browser. Both providers use the
same generic code in `server/auth/oauth.js`; each provider is one entry in
`server/auth/providers.js`.

A provider is enabled when its client id **and** secret are set. Providers
without credentials are not listed in the UI.

You must register the **callback URL** with each provider. The backend's
callback URL is:

```
<API_PUBLIC_URL>/auth/google/callback
<API_PUBLIC_URL>/auth/discord/callback
```

### Google setup

1. Go to <https://console.cloud.google.com/> and create (or pick) a project.
2. **APIs & Services → OAuth consent screen**: choose *External*, fill in the
   app name and your support email, add your email as a test user while the app
   is in *Testing* (publish it later to allow anyone). Scopes needed:
   `openid`, `email`, `profile` (these are non-sensitive; no review needed).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - **Application type: Web application.**
   - **Authorised redirect URIs** — add every callback you will use (exact
     match, including scheme, host, port and path, no trailing slash):
     - local: `http://localhost:8787/auth/google/callback`
     - production: `<API_PUBLIC_URL>/auth/google/callback`
   - "Authorised JavaScript origins" is **not** needed (the browser never
     calls Google directly).
4. Copy the **Client ID** and **Client secret** shown after creation.
5. Put them in the backend environment:
   `GOOGLE_CLIENT_ID=…`, `GOOGLE_CLIENT_SECRET=…` (local: `server/.env`;
   production: the host's environment settings).

### Discord setup

1. Go to <https://discord.com/developers/applications> → **New Application**.
2. Open **OAuth2** in the sidebar.
3. Under **Redirects** click *Add Redirect* and add every callback you will
   use (exact match):
   - local: `http://localhost:8787/auth/discord/callback`
   - production: `<API_PUBLIC_URL>/auth/discord/callback`
   and save.
4. Copy the **Client ID**, and use *Reset Secret* to reveal the **Client
   Secret** (shown once).
5. Set `DISCORD_CLIENT_ID=…`, `DISCORD_CLIENT_SECRET=…` in the backend
   environment. The app requests the `identify` and `email` scopes. (You do
   not need a bot, the "Bot" section, or an installation link.)

### Local vs production callback URLs

| | Backend (`API_PUBLIC_URL`) | Callback registered at the provider | Frontend (`CLIENT_URL`) |
|---|---|---|---|
| Local | `http://localhost:8787` | `http://localhost:8787/auth/<provider>/callback` | `http://localhost:5173` |
| Production | `<API_PUBLIC_URL>` — the URL your host gives the deployed backend (unknown until you deploy; not guessed here) | `<API_PUBLIC_URL>/auth/<provider>/callback` | `https://<user>.github.io/<repo>` |

Note the callback goes to the **backend**, not to GitHub Pages: the backend
finishes the OAuth exchange and only then redirects the browser back to
`CLIENT_URL`. You can register the local and production callbacks in the same
Google/Discord app at the same time.

### Testing sign-in

Local: start the backend and the Vite dev server (see above), open
`http://localhost:5173`, click *Sign in with Google/Discord*. After approving
you are returned to the app signed in; `GET /api/me` with the token returns your
user. Sign in again: the same user is returned (no duplicate) and `last_login_at`
updates. Check the row in the database:

```sql
SELECT * FROM users ORDER BY created_at DESC LIMIT 1;
SELECT provider, provider_account_id, email FROM auth_identities ORDER BY id DESC LIMIT 1;
```

Production: after deploying, register the production callback, set
`API_PUBLIC_URL` and `CLIENT_URL`, then repeat from the GitHub Pages URL.
Common problems: *redirect_uri_mismatch* (the registered URI does not exactly
equal `<API_PUBLIC_URL>/auth/<provider>/callback`), or the app bouncing back to
the site with an "error" message — the message names the cause (see
`src/utils/authMessages.js`).

## How the sign-in flow works

1. The React app sends the browser to `<API>/auth/<provider>?return_to=/path`.
2. The backend creates a random `state`, a PKCE verifier and a nonce, stores
   them in a signed (HMAC, `SESSION_SECRET`), `HttpOnly`, `SameSite=Lax`,
   10-minute cookie scoped to `/auth`, and redirects to the provider.
3. The provider redirects to `<API>/auth/<provider>/callback?code=…&state=…`.
   The backend verifies the cookie signature, expiry and that `state` matches;
   anything invalid (missing/expired cookie, wrong state, provider `error=…`,
   failed token exchange, no usable account id) redirects to
   `CLIENT_URL/?auth_error=<code>` and creates nothing.
4. It exchanges the code (with the PKCE verifier and the client secret) for the
   provider's profile, then **finds or creates** the user (below).
5. It issues a single-use, 60-second one-time code and redirects to
   `CLIENT_URL/?auth_code=<code>` — the session token itself is never placed in
   a URL.
6. The frontend `POST`s the code to `/api/auth/exchange` and receives the
   session token, keeps it in `localStorage` (`meridian_session_v1`), removes
   the code from the address bar, and sends `Authorization: Bearer <token>`
   afterwards.

`return_to` is only honoured if it is a same-app path (open-redirect safe).

## Users and identities

`users` is the person; `auth_identities` are the ways they can sign in.

| Field | Where |
|---|---|
| internal ID | `users.id` (UUID) |
| display name | `users.name` |
| provider | `auth_identities.provider` (`google`, `discord`, …) |
| provider account ID | `auth_identities.provider_account_id` (Google `sub`, Discord user id) — unique together with the provider |
| created date | `users.created_at` |
| last login | `users.last_login_at` (and per identity) |
| status | `users.status`: `active` \| `disabled` |
| stats relationship | `games.user_id → users.id`; per-category stats are aggregated from `games` |

First sign-in with an unknown (provider, account id) **creates** a user and an
identity. Later sign-ins with the same pair **log in** that user. The match is
on the provider's stable account id, **never on the email**: two different
provider identities are never assumed to be the same person, so signing in with
Discord after Google (same email) creates a separate account unless you link
them explicitly. A `disabled` user cannot sign in and their sessions are
deleted.

## Linking a second provider

Linking is an explicit action by an already signed-in user, so identities are
never merged by guesswork:

1. On the Profile page ("Connected accounts") the signed-in user clicks
   *Connect Discord* (or Google).
2. The frontend calls `POST /api/auth/link/<provider>/start` with the bearer
   token and gets a 120-second single-use `link` code.
3. The browser goes to `<API>/auth/<provider>?link_code=…`; the normal OAuth
   flow runs, and on the callback the identity is attached to **that** user.
4. If the provider account already belongs to a user, the request fails with
   `already_linked` and nothing changes.

## Sessions

- Opaque random bearer tokens; only the SHA-256 hash is stored (`sessions`), so
  a database leak does not expose usable sessions.
- Sliding expiry (`SESSION_TTL_DAYS`, default 30). Sessions survive backend
  restarts and cold starts because they live in PostgreSQL.
- `POST /api/logout` deletes the session. Disabling a user deletes theirs.
- Expired sessions and codes are purged every 6 hours.

## Administrators

Admin status is a column (`users.is_admin`) checked against the database on
every `/api/admin/*` request. Ways to grant it: the Neon SQL editor
(`UPDATE users SET is_admin = true WHERE email = '…'`), or `ADMIN_EMAILS` (only
applied when the provider marks the email as verified; grant-only — removing an
address later does not revoke). There is no endpoint that lets anyone set
`is_admin`.

Admin API (all behind `requireAuth` + `requireAdmin`): `GET /overview`,
`GET|POST /users`, `GET|PATCH|DELETE /users/:id`, `GET /audit-log`,
`GET /categories`, `PATCH /categories/:id`, `GET /transactions`,
`GET /multiplayer-games`.

## Profile statistics

`GET /api/me/stats` returns the user's totals and a `categoryStats` object.
Everything is computed from stored `games` rows; the browser cannot write
statistics directly (it only submits a finished game, which the server
validates). See [CATEGORIES.md](./CATEGORIES.md#profile-statistics-by-category).

## Migrating the old SQLite data

The previous version stored data in `server/data/meridian.sqlite3`. To move
users, sign-in identities, games, multiplayer history, purchases, entitlements,
admin audit entries and admin-edited category settings into PostgreSQL:

```bash
npm --prefix server install
npm --prefix server install --no-save better-sqlite3   # only needed for this import
# DATABASE_URL must point at an EMPTY database (the server may have been started once)
npm --prefix server run import:sqlite -- /path/to/meridian.sqlite3
```

- The SQLite file is opened read-only and is not modified.
- Everything runs in one transaction: all or nothing.
- It refuses to run if the target already has users or games, so it cannot
  duplicate history.
- User ids are kept; the same Google/Discord accounts sign in to the same users
  afterwards. Admin-created placeholder users keep no sign-in identity.
- Anything it cannot import (for example a game for a deleted user) is listed
  as a warning, never dropped silently.
- Existing OAuth users need no action; their old browser sessions do not carry
  over, so they sign in once again.

Try it first on a Neon branch.

## Deploying the backend (Render example)

Any Node host works; these settings are for a Render *Web Service* (free
tier). The server must be deployed **from the repository root**, because it
reads `shared/categoryTree.json`.

| Setting | Value |
|---|---|
| Root directory | *(empty — repository root)* |
| Build command | `npm --prefix server ci` |
| Start command | `node server/index.js` |
| Health check path | `/api/health` |
| Environment | the variables above (mark the secrets as secret) |

Free web services on Render sleep after inactivity, so the first request after
a pause takes several seconds. The frontend keeps working in guest mode
meanwhile.

After the first deploy:

1. Copy the service URL Render gives you → `API_PUBLIC_URL`.
2. Set `CLIENT_URL` (your GitHub Pages URL including the repository sub-path).
3. Register `<API_PUBLIC_URL>/auth/google/callback` and
   `<API_PUBLIC_URL>/auth/discord/callback` in the two OAuth apps.
4. In GitHub add the Actions **variable** `VITE_API_BASE` = `<API_PUBLIC_URL>`
   and re-run the *Deploy frontend to GitHub Pages* workflow.
5. (If migrating) run the SQLite import; set `ADMIN_EMAILS` or use the SQL
   above to create the first admin.

## Tests

```bash
npm test                       # frontend: unit + component tests (vitest, jsdom)
npm --prefix server test       # backend: routes, auth, repositories, import
npm run build                  # production build must succeed
VITE_BASE_PATH=/<repo>/ npm run build   # GitHub Pages-style build
```

The backend suite runs on in-process PostgreSQL (PGlite) by default. To run it
against a real PostgreSQL, point `TEST_DATABASE_URL` at a scratch database (each
test file uses its own random schema and drops it afterwards):

```bash
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/scratch npm --prefix server test
```

Covered: DB access layer and migrations, new and existing users, session
persistence and expiry, invalid/expired/replayed OAuth state and provider
errors, PKCE, explicit account linking, disabled users, category tree
validation and seeding, free/paid access (the server ignores anything the
client claims), game recording and category stats, admin endpoints, purchases
and webhook idempotency, the SQLite import, the category picker and profile UI,
the sign-in callback handler, and the Play Again / skip-queue / SPA-fallback
behaviour.

## Adding another sign-in provider

Add one entry to `server/auth/providers.js` (authorize/token/user-info URLs,
scopes, and a `profile` mapper returning `accountId`, `email`,
`emailVerified`, `name`, `avatarUrl`), add `<NAME>_CLIENT_ID` /
`<NAME>_CLIENT_SECRET` to `server/config.js` and `.env.example`, and add its
label to `src/utils/authMessages.js`. Routes, sessions, linking and the UI
button list pick it up automatically.
