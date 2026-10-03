# Meridian — React Edition

This is the same flag-guessing game (categories, difficulty modes, game
length, scoring, streaks, flag rendering) rebuilt in React with a
component-based, mobile-portable architecture. It's a **migration**, not a
redesign — see "What changed vs. what didn't" below.

The optional accounts backend (`server/`) is unchanged from the previous
version and works exactly the same way; only how it serves the frontend
was updated (see "Running with accounts").

> **Categories and statistics.** The categories are one editable two-level
> tree in [`src/data/categoryTree.json`](src/data/categoryTree.json) and the
> profile shows statistics per category generated from it. All historical maps
> are currently **free** and bundled with the app. How the tree works, how to add
> a category, how free/paid is configured and how the statistics are produced:
> [`docs/CATEGORIES.md`](docs/CATEGORIES.md). Where older sections below describe
> `utils/categories.js` as a hand-written list, or Historical maps as premium,
> that document is authoritative.

```
meridian-react/
├── index.html              Vite entry (mounts <div id="root">)
├── vite.config.js
├── src/
│   ├── main.jsx              React root
│   ├── App.jsx                Router + providers
│   ├── screens/                One component per route
│   │   ├── Home.jsx              Category + game-length + difficulty setup
│   │   ├── Game.jsx               Gameplay screen
│   │   └── Results.jsx             End-of-round summary (rendered by Game)
│   ├── components/               Reusable, single-responsibility UI
│   │   ├── Header.jsx, Button.jsx, ProgressBar.jsx, ScoreDisplay.jsx
│   │   ├── FlagDisplay.jsx, AnswerOption.jsx, AnswerInput.jsx
│   │   ├── CategoryCard.jsx, CategoryGrid.jsx   (picker, generated from the category tree)
│   │   └── GameModeSelector.jsx, DifficultySelector.jsx, TimerToggle.jsx
│   │   └── MissedFlagsList.jsx
│   ├── hooks/
│   │   ├── useGame.js               Wraps gameLogic.js in a React reducer
│   │   └── useAuth.js                Session check, login URLs, logout
│   ├── context/
│   │   ├── AuthContext.jsx            App-wide session (one useAuth() call)
│   │   └── ToastContext.jsx            Tiny toast notification
│   ├── utils/                          ← the portable / framework-agnostic layer
│   │   ├── gameLogic.js                  Pure reducer: the entire game engine
│   │   ├── countryUtils.js                Answer matching, aliases, MC options
│   │   ├── categories.js                   Registry built from data/categoryTree.json (generic)
│   │   ├── categoryStats.js                 Records + tree → per-category profile sections
│   │   ├── shuffle.js                       Fisher-Yates
│   │   └── storage.js                        Guest stats (localStorage)
│   ├── data/
│   │   ├── categoryTree.json               THE category definitions (groups → categories)
│   │   ├── datasets/                        Flag sets for the historical maps
│   │   ├── countries.json                 197-entry dataset (unchanged)
│   │   └── countries.js                     Loader + getCountryById()
│   └── styles/
│       ├── main.css, game.css, responsive.css   Unchanged from the previous version
│       └── index.css                              Imports the three above
└── server/                             Optional accounts backend (unchanged logic)
```

## What changed vs. what didn't

**Unchanged (ported as-is or near-as-is):**
- All CSS (`styles/main.css`, `game.css`, `responsive.css`) — copied
  verbatim. Same colors, type, spacing, cards, buttons, border radius,
  animations.
- `data/countries.json` — identical 197-entry dataset.
- Scoring formula, hint penalty, streak bonus, text-matching leniency and
  aliases, multiple-choice option generation, game-length modes
  (10/20/All/Custom) with duplicate-free question selection, and the
  flag `object-fit: contain` fix — all ported rule-for-rule into
  `utils/gameLogic.js` and `utils/countryUtils.js`.
- The optional backend (`server/`) — same Express routes, same Passport
  Google/Discord OAuth setup, same SQLite schema, same
  server-recomputes-stats-from-stored-rows approach. It now also serves
  the React build's `dist/` folder with a client-side-routing fallback
  (previously it served three separate static HTML pages).

**Changed (the point of this migration):**
- Vanilla JS + hand-written DOM updates → React function components +
  hooks.
- Three separate HTML pages (`index.html`/`game.html`/`profile.html`) →
  one single-page app with three routes (`react-router-dom`).
- The old `game.js` event-emitter engine → `utils/gameLogic.js`, a pure
  `(state, action) → state` reducer with **no DOM, no React, no browser
  APIs** — see "Mobile portability" below.
- `data/countries.json` is now bundled at build time via a static import
  (Vite handles JSON imports natively) instead of `fetch()`'d at runtime,
  so the old loading spinner for the dataset is no longer needed.
- No new gameplay features were added in this migration, per the brief.

## Mobile portability

The brief's real goal was preparing for a future React Native/Expo
version, so the split is intentional:

- **Portable (no DOM/browser APIs), directly reusable in a React Native
  screen:** `utils/gameLogic.js`, `utils/countryUtils.js`,
  `utils/categories.js`, `utils/shuffle.js`, `data/countries.json`. These
  files import nothing from `react-dom`, `window`, or any web-only API.
- **Portable with a one-line swap:** `utils/storage.js` uses
  `localStorage`; a React Native port swaps that for `AsyncStorage` and
  keeps every function signature identical.
- **Web-only, would be rewritten (not ported) for React Native:**
  everything in `components/` and `screens/` (JSX targeting DOM
  elements/CSS classes), `App.jsx`'s `react-router-dom` usage, and
  `hooks/useAuth.js`'s `fetch`-based session check (React Native would
  use the same fetch API, so this one mostly carries over as-is too).

`hooks/useGame.js` is the one file that bridges the two: it's a thin
`useReducer` wrapper around `gameLogic.js` plus two small `useEffect`s
(timer tick, save-on-end). A React Native screen would write the same
kind of thin wrapper around the same `gameLogic.js` — the rules
themselves would never need to change.

## Running it

### Frontend only (guest mode)

```bash
npm install
npm run dev
# open http://localhost:5173
```

### Production build

```bash
npm run build     # outputs to dist/
npm run preview   # serve the build locally to sanity-check it
```

### With accounts (Google/Discord sign-in)

Same setup as before, just from a new location:

```bash
npm run build              # build the React app first
cd server
npm install
cp .env.example .env       # fill in SESSION_SECRET + OAuth credentials
npm start
# open http://localhost:8787 — serves the built React app AND the API
```

If you'd rather iterate on the frontend with Vite's dev server (hot
reload) while the backend runs separately, create `.env` at the project
root from `.env.example` and set `VITE_API_BASE=http://localhost:8787`,
then run `npm run dev` and `cd server && npm start` side by side. See
`server/.env.example`'s `CLIENT_URL` for the matching backend-side
setting.

Everything under "Authentication setup", "Database", "Geographic data",
and "What's real vs. what needs your configuration" from the previous
version's README still applies unchanged — the backend didn't change.

## Deploying to GitHub Pages

The frontend (this repo, minus `server/`) can be built and published as a
static site on GitHub Pages, either at a project URL
(`https://<user>.github.io/<repo>/`) or a user/org root site
(`https://<user>.github.io/`), and is ready for a custom domain too.
GitHub Pages can only serve static files, so **the accounts backend
(`server/`) is not part of this and needs its own host** — see "What
still needs the backend" below for exactly what that means for players.

### How the frontend knows its own base path

Everything the app needs to run correctly under a subpath is driven by
one build-time value, `VITE_BASE_PATH` (read in `vite.config.js`):

- Asset URLs, the manifest, and the GitHub Pages 404-redirect fallback
  (`spa-404.html`, emitted as `dist/404.html` by `vite.config.js` with the base baked in, + the matching decoder in `index.html`) all resolve
  against it via Vite's `%BASE_URL%`/`import.meta.env.BASE_URL`, rather
  than assuming the app is hosted at `/`.
- React Router's `<BrowserRouter basename>` (`src/App.jsx`) is set from
  the same value, so every route (`/game`, `/profile`, `/admin`, ...)
  resolves under the subpath automatically — no route definitions
  needed to change.
- The two places that do a full-page navigation with a hardcoded path
  (`Game.jsx` and `MultiplayerGame.jsx`'s "Play Again", which
  intentionally hard-reloads to re-derive game config from the URL) and
  the sign-in return-URL logic (`Profile.jsx`, `Header.jsx`) all build
  their target from the real current path or `BASE_URL` rather than a
  literal `/...`.

You never need to set `VITE_BASE_PATH` yourself for a normal deploy —
see the next section — and it's simply unset (meaning `/`) for local
dev, `npm run build` without it, a custom domain, or a
`<user>.github.io` root repo.

### One-time GitHub setup

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Source:** select
   **"GitHub Actions"** (not "Deploy from a branch" — the included
   workflow needs this setting).
3. If the accounts backend is deployed separately and you want the
   Pages build to talk to it, add its public URL as a repository
   variable: **Settings → Secrets and variables → Actions → Variables
   → New repository variable**, name `VITE_API_BASE`, value e.g.
   `https://meridian-api.onrender.com` (no trailing slash). Leave it
   unset to ship guest-mode-only, which still works fully.
4. Push to `main`. **Actions** will build and publish automatically —
   see `.github/workflows/deploy-pages.yml`.

The workflow computes the right base path for you (root `/` for a
`<user>.github.io` repo or a committed `public/CNAME`, `/<repo>/`
otherwise) by reading the repository's own name at build time — nothing
in this repo hardcodes `flag-game-meridian` or any other project name,
so forking or renaming it needs no code changes.

### Custom domain

Add a `public/CNAME` file containing just your domain
(`flags.example.com`) and configure the DNS record GitHub's docs
describe for Pages custom domains. The workflow detects the file and
automatically builds with a root base path, since a custom domain is
normally served at `/`, not `/<repo>/`. (No `public/CNAME` ships in this
repo — add your own; a real domain is never invented for you.)

### Deploying without the Actions workflow

Building locally and checking the result works the same way, if you'd
rather deploy some other way (a manual `gh-pages` branch push, etc.):

```bash
VITE_BASE_PATH=/your-repo-name/ npm run build
npm run preview   # sanity-check the build; note preview also needs the same base
```

`dist/` is what gets published — this repo intentionally does not
commit `dist/` itself (see `.gitignore`); it's rebuilt by CI on every
deploy instead.

### What still needs the backend

Once the frontend is on GitHub Pages by itself (no `VITE_API_BASE`
configured, or the configured backend unreachable), the app runs in
guest mode exactly as it already does locally without `server/` running
— nothing new was added for this. Concretely, that means:

- **Works fully, no backend needed:** solo play across every category
  (including paid/Historical categories if bought/admin-flagged — see
  below), local pass-and-play multiplayer, difficulty and game-length
  modes, guest stats and guest multiplayer history (both `localStorage`,
  as before).
- **Needs the backend deployed and `VITE_API_BASE` pointed at it:**
  Google/Discord sign-in, server-synced statistics across devices, the
  admin panel, and real Stripe purchases/entitlements for paid
  categories (a signed-out guest simply can't unlock a paid category —
  that was already true; it just also means "no backend configured" is
  indistinguishable from "not signed in" from the frontend's point of
  view, which is the correct, safe default).

Deploying `server/` itself is unchanged by this work — any Node host
that can run an Express app and give you a persistent disk for the
SQLite file (Render, Railway, Fly.io, a small VPS, etc.) works, following
"With accounts" above. Once it's live, set its URL as `CLIENT_URL` in
its own `.env` (this now also builds absolute post-login redirect URLs,
which is what makes split-origin — Pages frontend + separately hosted
backend — work at all; see `server/routes/auth.js`) and as the
frontend's `VITE_API_BASE`.

### Security notes specific to this split

- No secret of any kind is introduced on the frontend side by this
  change. `VITE_API_BASE` is a public URL, not a credential, and Vite
  variables are always inlined into the built JS bundle in plain text —
  never put anything else in a `VITE_*` variable (see `.env.example`).
- CORS (`server/index.js`) already restricts credentialed requests to a
  single configured `CLIENT_URL` origin; deploying the frontend
  elsewhere doesn't loosen that — you're expected to set `CLIENT_URL` to
  the real deployed frontend origin, not `*`.
- The GitHub Pages 404 fallback only ever re-encodes and restores a
  same-origin path (see `spa-404.html`); it does not introduce an
  open redirect, and it's inert (no-op) on a normal page load.

## Support / donation link

There's an optional external "Support the Game" link — a footer line on
every screen, plus a small, secondary note on the results screen (never
more prominent than Play Again). Both are driven entirely by
`src/config/appConfig.js`:

```js
export const SUPPORT_URL = 'YOUR_SUPPORT_PAGE_URL';
```

**As shipped, both UI elements render nothing at all** — not a
placeholder, not a disabled-looking link — because `SUPPORT_URL` is still
the placeholder string. Set it to your real page and they appear
automatically, e.g.:

```js
export const SUPPORT_URL = 'https://ko-fi.com/yourname';
```

**Recommendation:** [Ko-fi](https://ko-fi.com). For one-off tips it takes
0% platform fee (Buy Me a Coffee takes ~5% on its free tier), signup is
just as quick, and it's just as reputable/recognizable to players. Buy Me
a Coffee or GitHub Sponsors both work identically here if you'd rather
use one of those — just paste that URL into the same constant.

The link always opens in a new tab (`target="_blank" rel="noopener
noreferrer"`) and is a plain external `<a>`, not a React Router route, so
clicking it never touches game state, auth, or navigation — verified in
`Game.jsx` and the reducer, neither of which this feature touches at all.

## Administrative system

There's a backend-authorized admin panel at `/admin`, reachable from
Profile → "Administrative Panel" (link only shows for admins — see below
for why that's a UI convenience, not the actual security boundary).

### The one rule everything else follows

**The frontend is never trusted for authorization.** There is no
request, cookie, header, or client state that grants admin access.
Every single `/api/admin/*` route independently re-verifies, from the
database, on that request:
1. Is there a valid session? (`requireAuth`)
2. Does that session's user have `is_admin = 1` in the database right
   now? (`requireAdmin`)

Both middlewares live in `server/middleware/` and run in front of every
admin route in `server/index.js` — there's no route that skips either
one. `/api/me`'s `isAdmin` field (used only to decide whether to show the
"Administrative Panel" link) is display-only; hiding a button is
convenience, not security, and I verified this directly — see "Security
testing performed" below.

### How administrator authorization works

- `users.is_admin` (a column added to the existing `users` table — no
  parallel user system) is the only thing any authorization check reads.
- There is **no admin registration page, no way to select "administrator"
  during signup, and no endpoint that ever lets a user set their own or
  anyone else's `is_admin`.** The user-edit endpoint's field allowlist
  (`server/routes/admin.js`) doesn't include `isAdmin` at all — sending it
  gets the whole request rejected with 400, not silently ignored.
- Admins sign in exactly the same way everyone else does — the existing
  Google/Discord OAuth. There is no second, parallel login system; admin
  status is purely an authorization check layered on top of the same
  session everyone already has (see "Final security principle" in the
  original brief — this is the direct answer to "determine the cleanest
  way to integrate without creating a second conflicting session system").

### How the initial administrator is granted

Two independent, backend-only mechanisms (`server/lib/adminEmails.js`,
`server/passport-config.js`):

**Option A — direct database flag.** Open the SQLite file and set
`is_admin = 1` for a user's row. This is the actual source of truth no
matter how it got set.

**Option B — bootstrap allowlist (`ADMIN_EMAILS` in `.env`).** A
comma-separated list of emails. The first time one of those emails
completes a real Google/Discord login, that row's `is_admin` gets set to
`1` automatically. This is grant-only — removing an email from the list
later does **not** revoke access already granted, specifically so an
edited/typo'd env var can't silently lock out your only admin. Revoking
is always the deliberate Option A (flip the column back to `0`).

### Creating the first administrator (safe local dev procedure)

```bash
cd server
npm install
cp .env.example .env      # fill in SESSION_SECRET + your OAuth credentials
npm start                 # log in once via Google or Discord as yourself
```

Then, with the server stopped (avoids a concurrent-write conflict with
better-sqlite3's WAL mode):

```bash
sqlite3 server/data/meridian.sqlite3 \
  "UPDATE users SET is_admin = 1 WHERE email = 'you@example.com';"
```

Or set `ADMIN_EMAILS=you@example.com` in `.env` *before* your first login
instead, and skip the manual SQL step entirely.

### Administrative API overview

All mounted under `/api/admin`, all behind `requireAuth` +
`requireAdmin` (`server/routes/admin.js`):

| Route | Purpose |
|---|---|
| `GET /overview` | User/admin/game counts for the dashboard |
| `GET /users?search=&page=&pageSize=` | Paginated, searchable user list |
| `GET /users/:id` | One user's full detail + merged stats |
| `POST /users` | Create an application-only placeholder record |
| `PATCH /users/:id` | Edit `name`, `email`, `status`, or `statOverrides` — **explicit allowlist; any other field name in the request body is rejected outright, not dropped** |
| `DELETE /users/:id` | Delete a user + their game history (can't delete your own account this way) |
| `GET /audit-log?limit=` | Recent administrative actions |

### "Modify game performance" and the data model

The app's real stats have always been computed from the `games` table
(see the original README's "Never trust client-provided scores"), not
stored as editable numbers on the user. Rather than let an admin rewrite
game history (which would corrupt the per-category breakdown and recent-
games list), editing stats writes a narrow, validated **override** for
exactly the six top-line fields the brief asked for (`gamesPlayed`,
`questionsAnswered`, `correct`, `incorrect`, `bestScore`, `bestStreak`),
stored as one JSON column (`users.stat_overrides`). Both a user's own
`/api/me/stats` and the admin detail view merge the same way (one shared
function, `server/lib/userStats.js`), so they can never disagree. Per-
category stats and recent-game history are always the real computed
values — never overridden.

### Create User and identity

An admin-created user is explicitly **not** a real OAuth identity — its
`provider_id` is a random, prefixed value (`admin-created:<uuid>`) that
can never match a real Google/Discord profile id, so it can never be
mistaken for, or silently "claimed" by, a real login. It's marked
`isVerifiedIdentity: false` and shown with an "Unverified" badge. If that
same person later signs in for real, it creates a **separate** account —
this intentionally does not attempt identity-linking/merging, which the
brief scoped out ("do not allow administrators to impersonate or forge a
Google/Discord identity").

### Account status

`users.status` is `'active'` or `'disabled'`. Disabling takes effect
immediately and server-side: `passport-config.js`'s `deserializeUser`
rejects a disabled user on their very next request, which — per
Passport's own session-strategy behavior — clears that session's login
data outright. If you re-enable the account, the user has to sign in
again; their old session doesn't silently resume. No client action is
trusted to disable/enable anything; only `PATCH /api/admin/users/:id`
(admin-only) can change `status`.

### Protecting sensitive information

The admin API never returns: OAuth client secrets/tokens, the session
secret, `provider_id`, `created_by_admin`, or the raw `stat_overrides`
JSON — see `publicAdminUser()` in `routes/admin.js`, the one function
every admin response is filtered through.

### Privilege escalation — what was specifically tested

Every one of these was tested as a real HTTP request against the running
server (not just read as code) and confirmed to fail exactly as expected:

| Attempt | Result |
|---|---|
| Unauthenticated request to any `/api/admin/*` route | `401` |
| Authenticated normal user to any `/api/admin/*` route | `403` |
| Normal user `PATCH`ing `{ isAdmin: true }` on their own record | `403` (blocked by `requireAdmin` before the field allowlist is even reached) |
| Admin `PATCH`ing `{ isAdmin: true }` on someone else | `400`, "Field(s) not editable through this endpoint: isAdmin" |
| Admin `PATCH`ing `{ provider: 'google' }` | `400`, same rejection pattern |
| Admin submitting `statOverrides` where `correct + incorrect > questionsAnswered` | `400` with a specific validation message |
| Admin submitting a negative number or an unknown stat field name | `400` |
| Admin deleting their own account via the admin endpoint | `400`, explicit block |
| Admin deleting a nonexistent user | `404` |
| A disabled account's existing session hitting any authenticated route | treated as signed out (`401`/`user: null`) on the very next request |

### Audit logging

`admin_audit_log` (new table) records `admin_id`, `action`
(`CREATE_USER`/`MODIFY_USER`/`DELETE_USER`), `target_user_id`, a
plain-text `summary` (e.g. `status "active" -> "disabled"`), and a
timestamp — visible in the admin panel's "Recent admin activity" section
and via `GET /api/admin/audit-log`. No secrets are ever written into a
summary.

### New environment variable

Only one addition to `server/.env.example`:

```env
ADMIN_EMAILS=
```

Comma-separated, optional, bootstrap-only (see above). Everything else
under the original README's "Environment variables" section is
unchanged.

## Paid categories

> **Status.** The premium system below is intact and unchanged, but currently
> **no category uses it**: all categories, historical maps included, are
> `type: "default"` (free) in `src/data/categoryTree.json`. A category becomes
> paid again by changing its `type` there; see
> [`docs/CATEGORIES.md`](docs/CATEGORIES.md#free-vs-paid).

The first paid category, **World 1914**, sits alongside the free World
category and is unlocked with a real one-time Stripe payment. Same rule
as the admin system: **the frontend is never the authority on who owns
what** — every check happens server-side, re-verified on every request.

### Payment provider: Stripe

Chosen over PayPal for this feature. Checkout Sessions give a fully
Stripe-hosted payment page (card data never touches this app), webhook
signature verification is one documented SDK call
(`stripe.webhooks.constructEvent`), and test/sandbox mode is just "use
your test secret key" — no separate sandbox app/account registration.
PayPal's REST + IPN/webhook verification is comparatively more involved
for the same outcome.

### Architecture: three responsibilities, three files

- **Category definition** (`src/utils/categories.js`) — World 1914 is
  just another entry with `access: 'paid'`. It appears in the same World
  section as the free World category, per the brief.
- **Game data** (`server/data/world-1914.json`, loaded by
  `server/lib/paidCategoryData.js`) — the actual flags/countries. Served
  only through `GET /api/categories/:id/countries`, which checks
  ownership first (see below) — it's not a static file the client bundle
  ships with.
- **Commerce state** (`paid_categories` table, `server/lib/entitlements.js`)
  — price, enabled/disabled, and (via `entitlements`) who owns it. A
  future "World 1939" is: add its JSON file, one line in
  `paidCategoryData.js`'s `DATA_SOURCES`, one seed row in `db/index.js` —
  no changes to any payment route, because every route works generically
  off `category_id`, never `if (categoryId === 'world-1914')`.

### The payment flow, and why it's not a single API call

```
React "Purchase" click
  → POST /api/purchase/:id/checkout   (server creates a Stripe Checkout
                                        Session; a 'pending' transaction
                                        row is recorded immediately)
  → browser redirected to Stripe's hosted checkout page
  → user pays (or cancels)
  → Stripe redirects back to /purchase/confirm?session_id=...
  → React calls GET /api/purchase/confirm
  → server re-fetches the Session from STRIPE'S OWN API and checks
    payment_status === 'paid' — the redirect's query string itself is
    never trusted as proof of anything
  → if paid: transaction marked 'completed', entitlement granted
  → React re-fetches /api/me/access — the category shows as owned
    immediately, no logout/login or reload needed
```

A production deployment should *also* configure a Stripe webhook
(`STRIPE_WEBHOOK_SECRET`) pointed at `/api/webhooks/stripe`, subscribed to
`checkout.session.completed` — this is the reliable path that fires even
if the user closes the tab before the redirect completes. Both paths
call the same `server/lib/fulfillment.js`, which is idempotent (verified
directly: replaying the same completed-session event twice creates
exactly one transaction row and one entitlement, never two — the
`transactions.provider_session_id` and `entitlements.(user_id,
category_id)` UNIQUE constraints are what make that true regardless of
which path fires, or fires twice).

### What's checked, where

| Question | Answered by |
|---|---|
| Is this category real and enabled? | `paid_categories` table, checked in every route that touches it |
| Does this user own it? | `entitlements` table (real purchase) OR `req.user.is_admin` — one function, `userHasAccess()`, used everywhere the answer matters |
| Was this payment actually completed? | Stripe's own API (`sessions.retrieve`) or a signature-verified webhook event — never the client's say-so |
| Whose purchase is this? | `client_reference_id`, set server-side from the authenticated session at checkout-creation time, re-checked against the *current* request's session at confirmation time |

### Administrator bypass

An admin's `is_admin` flag (the same one from the admin system) grants
access to every paid category without a transaction, checked the same
way in the same function (`userHasAccess`). No fake purchase record is
ever created for an admin — `GET /api/me/access` simply reports
`viaAdmin: true` for display, and the countries endpoint lets them
through without an entitlement row existing at all.

### Backend toggle and existing owners

Disabling a category (`PATCH /api/admin/paid-categories/:id`) does two
things immediately: blocks new checkouts, and blocks *everyone but
admins* from playing it — **including existing owners**, per the brief's
explicit preference. Their entitlement row is never deleted; re-enabling
the category restores their access automatically (verified directly: an
owner got `403` while disabled, then `200` again after re-enabling, with
zero writes to the `entitlements` table in between).

### Duplicate-purchase prevention

`entitlements` has a `UNIQUE(user_id, category_id)` constraint. The
checkout route also proactively checks and returns `409 Already own
this` before ever creating a Stripe session, so a user doesn't get sent
to checkout at all for something they already have.

### What's stored, and what deliberately isn't

`transactions`: user, category, provider, Stripe's session/payment-intent
IDs, amount, currency, status, timestamps. **Never stored, anywhere:**
card numbers, CVVs, PayPal/Stripe login credentials, or any other payment
credential — Stripe's hosted Checkout page is the only thing that ever
sees them.

### Environment variables

```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

Both optional — with neither set, every purchase-related endpoint
responds with a clear "not configured" error (mirroring the OAuth
"not configured" pattern) and the rest of the app, free categories
included, is completely unaffected. Get test-mode keys at
https://dashboard.stripe.com/test/apikeys — these are separate from live
keys and can never move real money, exactly the sandbox behavior the
brief asked for.

### Performing a first test purchase

1. Get a Stripe test secret key, put it in `server/.env` as
   `STRIPE_SECRET_KEY`.
2. `npm run build && cd server && npm start`, sign in with a real
   Google/Discord account.
3. Click World 1914 → Purchase. You'll land on Stripe's real hosted
   checkout page (in test mode).
4. Use Stripe's standard test card `4242 4242 4242 4242`, any future
   expiry, any CVC.
5. You're redirected back and land on "World 1914 unlocked!" — no real
   money moves in test mode.

### Admin panel additions

Two new sections, both behind the same `requireAuth` + `requireAdmin`
chain as the rest of the admin API:

- **Game Categories** — see each paid category's price, enabled state,
  and owner count; toggle enabled/disabled. The edit endpoint uses the
  same explicit-field-allowlist pattern as user editing — sending
  anything else (e.g. trying to rename `category_id`) is rejected with
  `400`, not silently ignored.
- **Transactions** — paginated list (user, category, provider, amount,
  status, timestamps). No refund UI yet, per the brief — refunding later
  means adding a status transition, not deleting history.

### World 1914's data, honestly

`server/data/world-1914.json` is a curated set of 30 major sovereign
states as they stood in 1914 (the great powers, the rest of Europe,
Japan, Ethiopia, Liberia, and the independent Americas) — not every
colonial subdivision of the era, which would be a much larger and murkier
undertaking. Where a country's flag design genuinely predates and
survived 1914 unchanged (the U.S., Scandinavia, Japan, Russia's
tricolor, Turkey's crescent-and-star lineage from the Ottoman era, and
most of the Americas), it uses the same flagcdn.com source as the main
dataset. For the two entities with no accurate modern equivalent
(German Empire, Austria-Hungary), the flags are small original geometric
renderings of their well-documented historical color schemes — not a
reproduction of any specific copyrighted artwork. Every entry with any
meaningful caveat carries a `note` field saying so. This is a starting
set, not a claim of completeness — expanding it is a one-file edit (see
"Architecture" above), and a natural next step given more time.

## Multiplayer (local pass-and-play)

This is **local pass-and-play multiplayer, not online multiplayer**.
Multiple people take turns on the same device/screen — no WebSockets,
rooms, matchmaking, or remote players. That's a deliberate scope
decision, not a missing feature; see "A note on future online
multiplayer" below for how this was built to make that addition later
straightforward rather than a rewrite.

### How it extends the existing engine, not a second one

Nothing about matching, scoring, hints, or difficulty was reimplemented.
`utils/multiplayerLogic.js` imports and reuses, unchanged:
`shuffle()`, `isCorrectText()`, `buildMcOptions()`,
`countriesForCategory()`, and two functions promoted out of the solo
engine specifically for this — `scoreForCorrectAnswer()` and
`nextQuestionFields()` (see `utils/gameLogic.js`). The only genuinely new
logic is turn-order bookkeeping: whose turn is it, and crediting the
right player's score/streak instead of a single global one.

`hooks/useMultiplayerGame.js` mirrors `hooks/useGame.js` exactly in
shape (`useReducer` + one timer effect + one persist-on-end effect) —
same pattern, pointed at the multiplayer reducer and multiplayer
storage/endpoint instead.

### Selecting multiplayer

In game setup (Home), a **Solo / Multiplayer** toggle sits next to
Difficulty. Choosing Multiplayer changes the primary button to **Setup
Teams**, which — unlike Play — doesn't start a game. It navigates to
`/multiplayer/setup`, carrying the already-chosen category, difficulty,
game length, and timer setting along as URL parameters.

### Player names and turn order

The setup screen's textarea accepts names separated by commas, newlines,
or a mix of both (`"Alice, Bob\nCharlie"` → three players) — parsing and
validation live in `utils/playerNames.js`. Two people can share a
chosen name; the second (and later) is auto-suffixed (`"Sam"`,
`"Sam (2)"`) rather than silently merged or rejected, since merging would
corrupt turn-order attribution. **There is no maximum player count** —
the only floor is a minimum of 2 (you can't have pass-and-play with one
person). See "Polish pass" below for how a very large roster stays
usable in both the in-game display and the results screen.

**Written order** plays names in exactly the order entered. **Randomized**
shuffles the player list exactly once, when the game is created — verified
directly (see "Testing performed"): the frozen order is checked against
the actual current player on every single question of a 9-question,
3-player game, and the order array itself is confirmed byte-for-byte
unchanged after play. There is no per-question re-roll. The current
player for question index `i` is always `turnOrder[i % turnOrder.length]`
— a pure function of progress, not a separately-tracked pointer that
could drift.

Game length still means total flags for the whole game, not per player —
"20 flags, 3 players" is 20 questions total, distributed across players
by the turn order, cycling as needed.

### Scoring, independence, and the results screen

Every scoring rule (difficulty, hint penalty, streak bonus) applies
exactly as in solo — only to whichever player's turn it currently is.
Verified directly: one player's wrong answer resets only their own
streak while another player's in-progress streak is untouched in the
same game state update.

At the end, `screens/MultiplayerResults.jsx` ranks all players using
dense competition ranking (see "Polish pass" below) and shows each
player's score, correct/incorrect, accuracy, best streak, and total time.

### Paid categories and the disabled-category toggle

No multiplayer-specific bypass exists. Starting a multiplayer game on a
paid category, and *submitting* its result to the backend, both run
through the exact same `userHasAccess()` check solo play uses (admin
bypass included) — see `server/routes/multiplayer.js`. A category
disabled by an admin is unavailable to start a new multiplayer game on,
same as solo, for the same reason (see "Paid categories" above).

### Guest vs. authenticated-host history — genuinely separate paths

- **Guest**: the completed game is saved to `localStorage` only
  (`utils/multiplayerStorage.js`, a different key from solo guest
  stats) — never sent to the backend as a permanent record.
- **Authenticated host**: the game is *also* POSTed to
  `/api/multiplayer-games`. The host is always the authenticated
  session's user — never a client-submitted id — and the payload is
  validated server-side before being stored: difficulty and guessing-order
  enums, at least 2 players (no upper bound — see "Polish pass"), each player's fields as non-negative integers
  within a sane bound, and a structural check that the sum of every
  player's turns taken equals the game's total question count (a
  question can only go to one player, so these must match — a real
  integrity check, not just per-field range validation).
- Other players never need their own accounts; their names are just
  data inside the host's history record.

Solo and multiplayer history are stored in **separate database tables**
(`games` vs. a new `multiplayer_games`) and shown in separate profile
sections ("Solo game history" / "Multiplayer game history"), never
merged.

### A pre-existing bug fixed while building this

While validating multiplayer's question-count bound, I found the solo
endpoint's was stale: `MAX_QUESTIONS` was hard-coded to `20` from before
the "10/20/All/Custom" game-length feature existed, meaning a completed
"World → All" game (197 questions) has been silently failing to sync to
signed-in users' accounts ever since (guest local stats were unaffected;
only the backend sync failed quietly). Fixed as a single shared,
documented constant (`server/lib/limits.js`) used by both the solo and
multiplayer endpoints — verified directly: a simulated 197-question solo
submission that would have 400'd against the old bound now succeeds.

### Admin visibility

The admin panel's new "Multiplayer games" section lists recent games
across every host (category, players, winner, timestamp) — read-only,
behind the same `requireAuth`+`requireAdmin` chain as everything else in
the admin API. Normal users can't see other hosts' multiplayer games;
verified directly (`403` on `/api/admin/multiplayer-games` as a normal
user).

### Polish pass: unlimited players, per-player time, in-game focus, fair ranking

A follow-up round refined the initial implementation in five ways,
without touching the reused solo engine or restarting/rebuilding
multiplayer's own core loop:

**No maximum player count.** The old `MAX_PLAYERS = 12` is gone from
both `utils/playerNames.js` and the backend's field validation. The
backend keeps a separate, generous anti-abuse ceiling
(`PLAYER_COUNT_ABUSE_CEILING = 2000` in `server/routes/multiplayer.js`)
purely against a malformed/malicious request — never surfaced anywhere
as a game rule, and far above anything a real host would type by hand.

**In-game display shows only the current player.** The old full-roster
table during active play is gone; `screens/MultiplayerGame.jsx` now
shows just the current player's name, score, streak, and total time —
everyone else's stats stay hidden until the results screen. This also
means the UI no longer assumes a small player count while a game is in
progress (a 50-player roster and a 2-player roster look identical
during play).

**Per-player cumulative time tracking**, entirely new in
`utils/multiplayerLogic.js`: a `turnStartedAt` timestamp marks when a
question became the current player's responsibility; resolving that
turn (answering or skipping — a hint alone does *not* end the turn, and
was verified directly to add nothing) adds the elapsed milliseconds to
that player's `totalTimeMs` and resets the clock for whoever's next.
This is a genuinely separate concept from the existing optional
whole-game countdown (`timerEnabled`/`timeRemaining`) — both can be
active at once and are shown as clearly separate, labeled stats
("Total time" vs. "Time left") exactly as the brief asked, never
conflated. Verified directly: one player's turn taking real wall-clock
time was confirmed to accumulate correctly across multiple non-
consecutive turns, without leaking so much as a millisecond onto
another player's total.

**Dense competition ranking**, in the new `utils/ranking.js`: players
sort by score descending, then `totalTimeMs` ascending as the tiebreak;
two players share a rank only when *both* fields match exactly, and the
next distinct group's rank continues immediately after with no gap
(`[1000,1000,900,800,800,800]` → `[1,1,2,3,3,3]`). This exact six-player
case from the brief is one of the automated tests. Time is always
compared as the raw number of milliseconds, never as a formatted
string, so ranking can't be thrown off by string comparison quirks.

**Scrollable results past 12 players.** Below 12, the results list
renders exactly as before. Above it, `.recent-list-scroll` (a max-height
plus `overflow-y: auto`) kicks in — every player is still present in the
markup and reachable by scrolling, none are hidden; verified directly
that a 20-player result renders the very first and very last player in
the list.

**Automatic randomization when players outnumber flags**, enforced in
the engine itself, not only the setup UI: `createMultiplayerInitialState`
compares the actual resolved player count against the actual resolved
question count (whatever "10/20/All/Custom" ultimately clamped down to —
see `count` already being the real, clamped number by the time it
reaches this screen) and forces `guessingOrder: 'randomized'` regardless
of what was requested, so a caller can't put the engine into an
inconsistent state by going around the UI. The setup screen mirrors this
live: typing past the flag count instantly disables the Written Order
button, selects Randomized, shows an explanatory warning directly below
the player list, and updates the natural-language description — and all
of it reverses automatically if the player count drops back at or below
the flag count. Verified directly: 6 players/3 flags forces randomized
even when written order was explicitly requested; 5 players/5 flags does
not force it, confirming the boundary is "strictly more than," not
"at least as many."

### A note on future online multiplayer

This was deliberately structured so that adding real-time online play
later would mean building a *new* transport/sync layer on top of the
same rules, not rewriting them: `multiplayerLogic.js` is a pure
`(state, action) → state` reducer with no network code in it at all — an
online version would replace `hooks/useMultiplayerGame.js`'s local
`useReducer` with something that broadcasts/receives the same actions
over a connection (WebSocket, etc.) and applies them through the exact
same reducer on every client, keeping `multiplayerLogic.js`,
`gameLogic.js`, and everything they both reuse completely untouched.

## Mobile-ready & future native app path

This pass made the game genuinely comfortable on phones (not just
"doesn't overflow") and documents, without implementing, the path to
Android/iOS store distribution.

### What changed for mobile

- **Mobile navigation was a real gap, now fixed.** The nav bar's
  Play/Profile/Admin/Support links were CSS-hidden below 620px with
  nothing replacing them — a guest or host on a phone had no way to
  reach Profile except by remembering the URL. `components/Header.jsx`
  now has a hamburger button + slide-down drawer with the same
  destinations, closing on navigation, outside click, or Escape.
  Verified directly: an SSR render confirms the drawer markup exists
  and "Profile" appears in the document twice (desktop row + mobile
  drawer) — the link was never actually removed, only re-presented.
- **Viewport units that account for mobile browser chrome.**
  `viewport-fit=cover` added to the meta tag; `body`'s height now
  prefers `100dvh` (falls back to `100vh` on older browsers) so the
  page doesn't jump when a phone's address bar shows/hides.
- **Safe-area insets** (`env(safe-area-inset-*)`) on the nav and page
  bottom, for the iPhone notch/Dynamic Island/home indicator and
  Android gesture-nav areas.
- **Landscape phones** get a dedicated `(max-height: 480px) and
  (orientation: landscape)` rule that trims vertical padding so the
  flag and answer controls both fit without scrolling mid-question —
  landscape's scarce resource is height, not width.
- **Touch targets**: buttons, segmented controls, multiple-choice
  options, and OAuth provider buttons now carry an explicit
  `min-height` (44–48px), rather than relying on padding alone landing
  in a comfortable range.
- **A real bug found and fixed while auditing this**: the multiplayer
  player-name textarea had been given the admin search box's CSS class
  for convenience, which silently imposed that class's `max-width:
  340px` — fine on a phone, but oddly cramped on tablet/desktop. It now
  has its own `.player-names-input` class sized to its actual container.
- **Accidental game loss**: `hooks/useWarnBeforeUnload.js` attaches a
  native `beforeunload` confirmation only while a solo or multiplayer
  game is actively in progress (not on setup/results screens), so a
  stray back-swipe or refresh doesn't silently discard an in-progress
  game. It's the browser's own dialog, not a custom modal, and only
  ever attached/detached via one `useEffect` per session component —
  never left dangling after the game ends or the component unmounts.
- **PWA basics**: `public/manifest.webmanifest`, real PNG icons (32/16
  favicons, 180px Apple touch icon, 192/512 + a maskable 512 variant)
  generated from the existing compass-rose brand mark rather than a
  placeholder square, and the corresponding `<link>`/`<meta>` tags in
  `index.html`. This makes the site installable ("Add to Home Screen")
  today — it is *not* an offline-first rewrite, which the brief
  explicitly cautioned against; there's no service worker or offline
  cache here, just standard installability metadata.
- **Centralized feature flags**: `src/config/appConfig.js` gained
  `FEATURE_FLAGS` (currently `multiplayer`, `paidCategories`,
  `supportLink`), wired into `Home.jsx` (hides the Solo/Multiplayer
  toggle) and `CategoryGrid.jsx` (hides paid-category cards) as a
  working example of the pattern — a static, build-time object, not a
  remote-config framework, since that's the right amount of ceremony
  for a project this size (see the file's own comment for when it would
  be worth outgrowing this).

### What was already fine, on inspection

- **Flag loading**: each question's flag was already fetched only when
  that question is shown (a plain `<img src>` per question, not a
  preloaded batch of hundreds) — no change needed.
- **Timers**: every `setInterval` in the codebase (the solo/multiplayer
  countdown, the multiplayer live-time display) was already paired with
  a `useEffect` cleanup — audited directly, no leaks found.
- **Game state survives rotation/backgrounding** by construction: the
  game reducers (`gameLogic.js`, `multiplayerLogic.js`) live in
  `useReducer` state owned by the screen component, and CSS media
  queries never remount that component — there was nothing to fix here,
  only to confirm.
- **No hover-dependent functionality**: every interactive affordance in
  the game (answer selection, category cards, toggles) is click/tap-
  driven; `:hover` is only ever a cosmetic accent on top of that.
- **Backend authority was already correct** and needed no changes for
  this pass: admin status, entitlements, and purchase verification are
  all re-checked server-side on every request (see the "Administrative
  system" and "Paid categories" sections above) — this pass's job was
  to confirm that remains true, not to re-implement it.

### Public vs. private configuration (confirmed, not changed)

The frontend's only environment-driven value is `VITE_API_BASE`
(`.env.example` at the project root) — where the optional backend
lives, never a secret. Every actual secret
(`SESSION_SECRET`, `GOOGLE_CLIENT_SECRET`, `DISCORD_CLIENT_SECRET`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ADMIN_EMAILS`) lives only
in `server/.env`, a separate file in a separate directory that is never
part of the Vite build — nothing under `server/` is bundled into the
browser. This was true before this pass; it was audited, not changed.

### Recommended future native path: React + Capacitor

**Capacitor over React Native**, for this specific codebase: React
Native would mean rewriting every screen and component (`Home.jsx`,
`Game.jsx`, `MultiplayerGame.jsx`, the entire `components/` tree) since
none of it renders to React Native's native-component API — the exact
"another major rewrite" the brief says to avoid. Capacitor instead
wraps the *existing* built web app (the same `npm run build` output
already served by `server/`) in a thin native shell, so the actual
payoff of everything already built here — the responsive UI, the mobile
nav, the touch targets — carries over directly rather than being
redone.

What's already portable without any change (confirmed by this
project's own architecture, not aspirational): `utils/gameLogic.js`,
`utils/multiplayerLogic.js`, `utils/countryUtils.js`,
`utils/categories.js`, `utils/shuffle.js`, `utils/ranking.js`, and
`data/countries.json` — zero DOM/browser API references, pure
`(state, action) → state` reducers and pure functions. A Capacitor
build uses these completely unmodified, same as the web build does.

What would need a platform-specific look when the native step actually
happens:
- **Local storage**: `utils/storage.js` / `utils/multiplayerStorage.js`
  use `localStorage` directly. Capacitor's `Preferences` API is a
  drop-in-shaped async replacement; the function signatures here would
  stay the same, only the implementation swaps.
- **OAuth**: the current flow is a full-page browser redirect
  (`window.location.href` to `/auth/google` etc., server-side
  Passport). Inside a Capacitor shell this needs the
  `@capacitor/browser` plugin (opens the system browser, not an
  in-app webview, which Google/Discord and most OAuth providers
  require) plus a custom URL scheme or Universal/App Link so the
  provider's redirect can hand control back to the app. The backend's
  OAuth routes and session logic would not need to change — only how
  the browser is opened and how the callback returns.
- **Payments**: Stripe Checkout's hosted page works the same way inside
  `@capacitor/browser`. Apple/Google's respective in-app-purchase
  requirements (mandatory for digital goods sold through their stores)
  are a separate, later integration — the brief explicitly said not to
  build this yet. The existing design already isolates *why* this is
  low-risk to add later: `server/lib/entitlements.js`'s
  `userHasAccess()` is the single function every access check calls,
  and `transactions.provider` is already a plain string column (`'stripe'`
  today) rather than an assumed-Stripe-forever design — a future
  `'apple_iap'`/`'google_play'` provider would add a new fulfillment
  path next to `server/lib/fulfillment.js`, not replace it.

### Not done in this pass (deliberately)

No `capacitor.config.ts`, no Android/iOS project folders, no service
worker, and no store submission — the brief was explicit that this is
architectural preparation, not the native build itself. This section
exists so that step is additive work on top of what's here, not a
rewrite of it.

## Historical categories

A new top-level **Historical** tab sits alongside Continents/Regions in
the category picker, containing three research-backed periods. This
section documents the research, the corrections made to the pre-existing
World 1914 dataset, and exactly how the free/premium control works.

### Research approach and sources

Primary starting point: [flaglog.com](https://flaglog.com), a specialist
vexillology reference with year-by-year world flag charts (used here for
[1914](https://flaglog.com/1914), [1990](https://flaglog.com/1990), 1991,
and [1945](https://flaglog.com/1945)). Every entity below was
cross-checked against well-established historical facts (specific
independence/adoption dates, which government was in power) rather than
copied wholesale — flaglog's stated design descriptions were treated as
the flag-design source, while political status and dates were verified
against broader historical knowledge. Nothing below was invented: where
a fact couldn't be confirmed to a standard I was comfortable with (an
exact flag design requiring a detailed emblem I couldn't accurately
render, an ambiguous political status), that entity was left out
entirely rather than guessed — see "Deliberately omitted" under each
category.

**Snapshot convention, applied consistently across all three
categories:** each represents its political entities and flags *as they
stood on December 31 of that year* — not an arbitrary mix of flags from
nearby years. Every entry's `year` and `politicalStatus` field states
this explicitly.

### World 1914 — corrected and expanded (30 → 37 entities)

This was an audit of the existing dataset, not just an addition. Real
corrections made:

- **Romania and Bulgaria**: the old dataset's note claimed "the 1914 flag
  would have carried royal arms at center" — flaglog.com's chart actually
  documents *plain* tricolors for both in 1914. That incorrect caveat
  was removed; the plain modern-style tricolors were already the right
  flags, just described with the wrong reasoning.
- **Austria-Hungary, German Empire, Ottoman Empire**: previously
  described only as "simplified representations" invented for the game;
  now confirmed accurate against flaglog.com's chart and re-documented
  with that source, rather than framed as an approximation of unknown
  accuracy.

New entities added, each because flaglog.com's 1914 chart documents a
specific, verifiable flag distinct from any modern country's current
flag (the exact case the brief warned against getting wrong):

- **Republic of China** — the Qing dynasty had already abdicated in
  February 1912; 1914 China used the five-colored flag (red-yellow-
  blue-white-black stripes), not an imperial dragon flag and not the
  later Nationalist flag.
- **Persia** — a plain green-white-red national flag (the more ornate
  state flag added a lion-and-sun emblem too detailed to render
  accurately here, so the plainer, still-documented variant was used).
- **Sultanate of Egypt** — Britain deposed the Khedive and proclaimed
  Egypt a sultanate under British protection on December 19, 1914,
  right at this snapshot's edge; its flag (red field, crescent-and-star
  motifs) is completely unlike modern Egypt's flag.
- **Principality of Albania** and **Tunisia** — both real, both
  documented, both distinguishable from any nearby modern flag.

**Deliberately omitted** (real, documented entities I chose not to
include rather than risk an inaccurate flag): Siam (1914 used a plain
red flag with a white elephant emblem — confirmed *not* the modern
striped flag — but the elephant illustration was beyond what I could
render accurately); Qajar Persia's court/state flag variant (the
lion-and-sun emblem, same reasoning); Kuwait (a red flag with Arabic
inscription); Korea and Ukraine (both correctly excluded as independent
states, since neither existed as one in 1914 — the flags sometimes
shown for them represent resistance/nationalist movements under
Japanese and Russian/Austro-Hungarian rule respectively, not states);
Bosnia and Herzegovina, Zanzibar (both real colonial-administrative
entities, left as candidates for future expansion rather than rushed in
here).

### World 1991 (18 entities) — the dissolution of the Soviet Union

The single most important rule applied here: **the USSR itself is not
included**, because it formally dissolved December 26, 1991 — five days
before this snapshot date. Several corrections avoid the exact mistake
the brief warned about (assuming a newly-independent state's flag is
whatever it uses today):

- **Belarus's 1991 flag was white-red-white**, adopted at independence
  — completely different from the red-green flag Belarus uses today
  (which is a Soviet-derived design reintroduced by referendum in 1995).
- **Georgia's 1991 flag was the maroon 1918-1921 First Republic design**
  (a wine-red field with black-and-white canton stripes), readopted
  November 1990 — not the white five-red-crosses flag, which wasn't
  adopted until 2004.
- **Ethiopia's flag was briefly emblem-free**: the transitional
  government removed the Derg-era state seal on May 28, 1991, and the
  modern emblem (adopted 1996) didn't exist yet either — so 1991
  Ethiopia is a plain, unmarked green-yellow-red tricolor, matching
  neither the old nor the new version.
- **Central Asia's more complicated truth**: flaglog.com's own chart
  notes that Kyrgyzstan, Tajikistan, Turkmenistan, and Kazakhstan were
  *still flying their old Soviet-republic flags* as of December 31,
  1991 — only Uzbekistan had adopted a genuinely new flag by year-end.
  Rather than either wrongly using their modern post-1992 flags or
  inventing unverified Soviet-republic-flag renderings, those four are
  **deliberately omitted** from this snapshot, and only Uzbekistan is
  included.
- Also deliberately omitted: North Macedonia (its distinctive flag
  wasn't adopted until August 1992, and I couldn't confirm what, if
  any, distinct flag it used in the interim); the residual Yugoslav
  federation's exact status was included cautiously, labeled
  explicitly as "in collapse."

### World 1945 (10 entities) — the end of World War II

Deliberately the smallest of the three, prioritizing confidence over
coverage for a period with unusually many overlapping occupations and
contested transitions right at the snapshot date:

- **The Republic of China's 1945 flag is the same "Blue Sky, White Sun"
  design Taiwan uses today** — the Nationalist government that used
  this flag in 1945 is the same government that relocated to Taiwan in
  1949 after the Chinese Civil War, so this is a case where reusing a
  "modern" flag is actually correct, not a shortcut.
- **Indonesia and Vietnam** both declared independence in 1945 (August
  17 and September 2 respectively) using the same flags they use today
  — but neither was yet recognized by its former colonial power (the
  Netherlands, France), so both are labeled "declared, not yet
  recognized" rather than presented as settled independent states.
- **The Soviet Union's flag is a deliberately simplified rendering**: a
  single gold mark stands in for the hammer-and-sickle emblem, which I
  could not render accurately — disclosed directly in that entry's note
  rather than presented as exact.
- **Germany is deliberately excluded** — at the exact end of 1945 there
  was no German government or state flag in effect; the Allied Control
  Council governed the occupied zones directly. Rather than assign it
  a flag it didn't have, this is a documented, sourced gap.

### The premium/free control (Historical maps and World 1914 alike)

> **Update.** The frontend no longer decides free/paid per backend row: it is
> the `type` of each category in the tree (all `default` right now). The
> backend's `premium` flag and admin Game Categories panel still control price
> and ownership for any category the tree marks `paid`. The text below
> describes the backend mechanism, which is unchanged.

Every category in the Historical tab — and World 1914, which predates
it — is now backed by the exact same `paid_categories` table and
`userHasAccess()` function documented in "Paid categories" above.
**Nothing new was built for commerce here; the existing entitlement
system was generalized to also register free-by-default categories**,
not just paid ones:

- A new `premium` column on `paid_categories` (`server/db/index.js`)
  is what actually gates access now, separate from `enabled`. A
  category with `premium = false` is playable by **anyone, including
  signed-out guests** — verified directly: an unauthenticated request
  to World 1991's or World 1945's country-data endpoint succeeds, while
  the same request against World 1914 (still `premium = true`) is
  rejected.
- **World 1914's existing paid status was preserved automatically**,
  not manually patched: the `premium` column was added with `DEFAULT 1`,
  so SQLite backfills every pre-existing row (at migration time, only
  World 1914) to `premium = 1` as part of adding the column itself. The
  two new Historical rows are inserted with `premium = 0` explicitly.
  This means no existing purchase, entitlement, or history record
  referencing `world-1914` was ever touched or invalidated.
- **Every new historical map defaults to free** (`premium: false`) per
  the brief's explicit requirement — verified directly against the
  actual seeded rows for World 1991 and World 1945.
- **Per-category admin control, finally with a real UI**: the backend
  endpoints for this (`GET`/`PATCH /api/admin/paid-categories/:id`)
  existed from the original Paid Categories work but had no frontend to
  actually use them — this was a genuine gap, not a design choice, found
  during this pass's inspection. `components/admin/GameCategoriesList.jsx`
  is the new "Game Categories" section of the admin panel: an
  Enabled toggle, a Premium toggle, and a price field, per category,
  saved individually. Toggling one category's premium status doesn't
  touch any other row.
- **A premium category needs a real price**: the PATCH endpoint now
  rejects `premium: true` unless the resulting price is greater than
  $0.00 — verified directly (attempting to mark a category premium with
  no price set returns `400`).
- Checkout (`POST /api/purchase/:id/checkout`) now also rejects a
  purchase attempt against a category that isn't premium at all
  (`400`, "This category is free — no purchase needed") — there's
  nothing to buy.

### Historical categories work through the existing engine unchanged

No new game logic, difficulty handling, multiplayer logic, or history
storage was written for this feature — every historical category flows
through exactly the same `isPaidCategory()` → entitlement-gated-fetch →
`gameLogic.js`/`multiplayerLogic.js` path World 1914 always has, which
is why adding two more categories required zero changes to `Game.jsx`,
`MultiplayerGame.jsx`, `useGame.js`, or `useMultiplayerGame.js`. Solo,
Multiplayer, all four difficulties, and all four game-length modes work
identically for a Historical category as for any other — verified by
the same SSR/logic test suite already covering those paths, since
nothing about them needed to change.

## Tests

```bash
npm test        # unit + component tests (vitest, jsdom)
npm run build   # production build
VITE_BASE_PATH=/<repo>/ npm run build   # GitHub Pages-style build
```

The deploy workflow runs `npm test` before building. The section below records
the testing done for the original React migration.

## Testing performed for this migration

- `npm run build` succeeds cleanly (Vite/Rollup catches import errors,
  JSX syntax errors, and unresolved modules).
- A standalone script exercised `utils/gameLogic.js` directly (no React,
  no DOM) and verified: all four game-length modes produce the requested
  count with zero duplicate countries; over-requesting (e.g. custom=999
  on a 14-country region) clamps to the pool size; a full 5-question
  playthrough in Easy mode scores and ends correctly; hint penalties and
  streak bonuses compute to the right point values; a wrong answer resets
  streak and is recorded in the missed list; skipping the last question
  ends the round; the countdown timer ends the round with `reason:
  'timeout'` exactly when it hits zero; text-mode alias/typo matching
  (`"usa"` → United States, tolerated vs. rejected typos by difficulty)
  behaves identically to the previous version; and an unknown category id
  produces a graceful error state instead of a crash.
- A server-rendering smoke test mounted `Home`, `Game` (Easy/Normal/Hard,
  including a `count=9999` over-request against the World category and an
  invalid category id), and `Profile` and asserted on their output —
  confirming every screen renders without throwing and that game-length
  clamping is correct end-to-end through the React hook, not just the
  reducer in isolation.
- The built `dist/` output was served through the actual `server/`
  Express app (not just Vite's preview server) and verified: `/`,
  `/game`, and `/profile` all return the SPA via the client-routing
  fallback; `/api/me` and `/api/health` respond correctly; an unknown
  `/api/*` route still correctly 404s as JSON instead of falling through
  to the SPA fallback; and the built JS bundle is served correctly.

Not exercised (same limitation as before): a live Google/Discord OAuth
round-trip, since that needs credentials only you can generate.

Support-link addition specifically verified: while `SUPPORT_URL` is still
the placeholder, no support link/text renders anywhere (Home, Game,
Profile) and no placeholder href is ever emitted; once a real URL is set,
the footer link and the Results-screen CTA both render with the correct
`href`/`target="_blank"`/`rel="noopener noreferrer"`, visible text label,
and — checked directly in the rendered HTML — the Results CTA always
appears after the Play Again button, never before it.

Admin-system addition specifically verified end-to-end (real HTTP
requests against a running server, not just code review — full table in
"Privilege escalation" above): unauthenticated/normal-user/admin access
to every admin route resolves to 401/403/200 respectively; the field
allowlist rejects `isAdmin`/`provider`/any unknown field on `PATCH`
outright; stat-override validation rejects bad math, negative numbers,
and unknown field names; self-delete is blocked; disabling a user
invalidates their session on the next request; create/edit/delete all
write correct audit-log entries; and — via a React SSR smoke test — the
`/admin` route never renders the dashboard or user table before the
session check resolves, and a signed-out Profile view never shows the
Administrative Panel link. A live OAuth login as a real bootstrapped
admin (via `ADMIN_EMAILS`) was not exercised, for the same reason as
above — it needs credentials only you can generate — but the grant logic
itself was exercised directly against the database layer it uses.

Paid-category addition specifically verified end-to-end against a real
running server (not just code review):
- `GET /api/categories/paid` is public; `GET /api/categories/:id/countries`
  correctly returns `401` (anonymous), `403` (signed-in, no entitlement),
  and `200` with all 30 entries (admin bypass, zero entitlement rows).
- Simulating a completed Stripe Checkout Session (a fake session object
  fed directly to `fulfillCheckoutSession`, bypassing the real Stripe API
  call, which needs live credentials I don't have) correctly granted the
  entitlement and made `/api/categories/:id/countries` return `200`
  immediately after.
- **Replaying that exact same session twice** — simulating Stripe
  retrying a webhook delivery — produced `alreadyProcessed: true` the
  second time, with the entitlements and transactions tables both still
  at exactly one row each (checked directly via SQL), confirming the
  idempotency the brief specifically called for.
- An `unpaid`-status session correctly granted nothing.
- Disabling the category via the admin endpoint immediately blocked an
  *existing owner* (`403`) while leaving their entitlement row untouched
  in the database, and access returned automatically on re-enable — no
  entitlement writes involved in either transition.
- The admin `PATCH` endpoint's field allowlist rejected an attempt to
  rename `category_id` with `400`, the same pattern as the user-editing
  endpoint.
- A garbage `STRIPE_SECRET_KEY` (simulating a real Stripe API failure)
  produced a clean `502` to the client with no stack trace or secret
  leaked, and the server remained healthy for subsequent requests
  afterward — checked by hitting an unrelated endpoint immediately after
  the failure.
- A React SSR smoke test confirmed: `world-1914` is correctly registered
  as `access: 'paid'` and grouped with World (not a separate section);
  the Game screen shows a "Checking access…" state and never renders the
  flag/gameplay UI for a paid category before the backend confirms
  access, while a free category's Game screen is completely unaffected;
  and the post-checkout confirmation screen renders its verifying state
  correctly.

Not exercised, for the same reason noted throughout this document: an
actual live Stripe test-mode checkout completed through Stripe's real
hosted page, since that requires a Stripe account and test API key only
you can create. Everything up to and immediately after that boundary —
session creation request shape, confirmation verification logic,
idempotent fulfillment, and failure handling — was exercised directly.

Multiplayer addition specifically verified via a standalone script
against `utils/multiplayerLogic.js` directly (no React, no DOM — 24
assertions): mixed comma/newline name parsing; duplicate-name
disambiguation; player-count validation (min 2, max 12, truncation);
written order matching input order exactly across a full 6-question,
3-player cycling game; randomized order frozen once at creation and
checked against the actual current player on all 9 questions of a
9-question game, then confirmed byte-for-byte unchanged after play;
independent per-player score/streak updates (one player's wrong answer
verified to leave a different in-progress player's streak untouched in
the same state transition); and a full 4-question, 2-player game's final
result matching hand-computed expected scores/accuracy exactly, with the
sum of all players' turns confirmed equal to the total question count.
A React SSR smoke test (16 assertions) confirmed: the Solo/Multiplayer
toggle renders on Home without disturbing existing content; a
mode-less `/game` URL still takes the solo path unchanged (regression
check); the multiplayer setup screen guards against a missing category
and renders its player-count/order controls correctly; the multiplayer
game screen renders the current-player banner and shared flag/answer
components; and the results screen ranks the higher-scoring player
above the lower one. Against a real running backend: a valid multiplayer
submission succeeds and appears only in its host's own history (not
another user's); an unauthenticated submission is `401`; mismatched
turn-count sums, too few players, and an invalid difficulty are each
`400` with a specific message; submitting a paid category the host
doesn't own is `403`, while the same submission succeeds for an admin
with no purchase; a normal user is `403` on the admin multiplayer-games
list while an admin sees every host's games; and — since fixing it
required touching the same validation code — a previously-broken
197-question solo submission (`world` category, `All` length) that would
have 400'd against the stale bound now succeeds.

Polish-pass additions specifically verified via a standalone script
against `utils/multiplayerLogic.js` and `utils/ranking.js` directly (21
assertions, no React/DOM): 40 parsed player names validate with zero
cap; the engine forces `randomized` for 6 players/3 flags even when
`written` was explicitly requested, while leaving 5 players/5 flags on
`written` as requested (the exact boundary case); a player's
`totalTimeMs` accumulates real elapsed time across two non-consecutive
turns while a different player's total is provably untouched in between,
and a wrong answer or a skip both still bank time while a hint alone
does not; and the six-player dense-ranking example from the brief
(`[1000,1000,900,800,800,800] → [1,1,2,3,3,3]`) matches exactly, along
with same-score-different-time (no tie) and same-score-same-time (true
tie) cases. A React SSR smoke test (11 assertions) confirmed the setup
screen no longer mentions any maximum; the in-game screen shows the
current player's stats and total time while every other player's name
is absent from the active gameplay markup entirely (not just visually
hidden); and the results list only gains the scrollable class above the
12-player threshold, with every player — first and last — still present
in the markup either way. Against a real running backend: a 40-player
submission with per-player `totalTimeMs` succeeds and round-trips back
intact through `GET /api/me/multiplayer-games`; a negative or
unreasonably large (>24h) `totalTimeMs` is rejected with `400`.

Mobile-readiness pass specifically verified: `npm run build` succeeds
and the built `dist/` correctly contains the manifest and all icon
files at the paths `index.html` references. A React SSR smoke test (7
assertions) confirmed the hamburger button and drawer markup render,
"Profile" appears twice in the document (desktop row, CSS-hidden on
mobile, plus the mobile drawer) rather than having been removed, and
every existing screen (Home, solo Game, Profile) renders exactly as
before with the nav changes in place. A live-server regression pass
re-confirmed solo submission, the public paid-categories list, and
multiplayer submission all still return their expected status codes
after every CSS/config change in this pass — nothing in this round
touched the backend, so this was a targeted re-check rather than a
full re-audit. The player-name-textarea sizing bug (see "What changed
for mobile" above) was caught during a manual CSS-specificity audit
rather than by an automated test, since it was a visual/layout issue
with no failing assertion to write — worth naming so it doesn't read as
if every fix here traced back to a test.

Historical-categories pass specifically verified against a real running
server: the public category list correctly reports `premium: true` for
World 1914 and `premium: false` for both new categories immediately
after a fresh migration (confirming the `DEFAULT 1` backfill worked
without a manual data-fix step); an unauthenticated request successfully
fetches full country data for World 1991 and World 1945 while the
identical request against World 1914 is `401`; a normal signed-in user
is still `403` on World 1914 without a purchase; an admin's attempt to
mark a category premium without also setting a real price is `400`; a
full toggle round-trip (mark World 1991 premium with a price → confirm
a guest is now locked out → confirm an admin still has bypass access →
revert to free → confirm guest access returns) behaves correctly at
every step with zero entitlement-table writes involved in any of the
toggles; and the admin field-allowlist still rejects an attempted
`category_id` rename with `400`. A React SSR smoke test (11 assertions)
confirmed the category-model changes directly: the Historical group
contains exactly the three intended categories, World 1914 was moved
out of the World group (and World no longer contains it) while all
three correctly resolve as backend-fetched categories, and the Home
screen renders the new Historical tab without disturbing the existing
hero or the free-category Game screen. All three historical JSON
datasets were validated for unique ids and complete metadata
(`historicalName`/`modernName`/`year`/`politicalStatus`/`source`/
`verified` present on every entry) before being wired in. The gap this
pass found and fixed — a backend admin endpoint for paid-category
management that existed with no frontend ever calling it — was caught
by inspection, not a failing test, since there was no missing
functionality to fail a test against; it's named here for the same
reason as the mobile-pass finding above.
