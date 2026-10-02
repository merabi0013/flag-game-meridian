# Categories

How the category tree is structured, how a category is free or paid, how to
add one, and how per-category profile statistics are produced. Backend and
sign-in are in [BACKEND.md](./BACKEND.md).

- [The tree](#the-tree)
- [Leaf (category) schema](#leaf-category-schema)
- [Group options](#group-options)
- [Where flags come from](#where-flags-come-from)
- [Free vs paid](#free-vs-paid)
- [How to add a category](#how-to-add-a-category)
- [How the UI is generated](#how-the-ui-is-generated)
- [Profile statistics by category](#profile-statistics-by-category)
- [Guest statistics](#guest-statistics)
- [Existing data and IDs](#existing-data-and-ids)

## The tree

One file, read by both the frontend (bundled by Vite) and the backend:
**`shared/categoryTree.json`**. It is a two-level tree: *groups* (World,
Continents, Regions, Historical) that contain *categories* (the playable
leaves).

```
World (featured)      world
Continents (7)        europe, asia, eurasia, africa, north-america, south-america, oceania
Regions (18)          middle-east, western-europe, caucasus, southeast-asia, caribbean, …
Historical (list)     world-1914 (paid), world-1991, world-1945
```

Every existing category id was preserved, so saved statistics, purchases and
entitlements that reference them keep working.

A single game engine plays every category. It receives a list of countries and
does not know or care which category produced it; nothing in `src/utils/gameLogic.js`,
`useGame.js` or the game screens mentions a category id.

## Leaf (category) schema

```jsonc
{
  "id": "europe",              // stable, unique, [a-z0-9-], never reuse or change once players have history
  "name": "Europe",            // display name (the admin panel can override it in the database)
  "type": "default",           // "default" (free) | "paid" — SEED value only, see "Free vs paid"
  "flagSource": {              // where the flags come from
    "kind": "bundled",         //   "bundled": filter of src/data/countries.json
    "where": { "continent": "Europe" }   //   optional declarative filter
  },
  "description": "…",          // optional; shown on the tile
  "priceCents": 200,           // only needed for a paid category; > 0
  "currency": "usd"            // optional, default usd
}
```

| Field | Meaning |
|---|---|
| `name` | Display name. |
| `flagNumber` | **Never written.** The number of flags is derived: for server-hosted categories the backend counts the dataset; for bundled ones the frontend counts the matching countries. It can therefore never drift from the data. |
| `flagSource` / link | Where the flags are: `{kind:'bundled', where?}` or `{kind:'remote', dataset}`. |
| `type` | `default` (free) or `paid`. |

`where` is a small declarative filter (equality, or `{ "includes": value }` for
array fields), e.g. `{ "continent": "Europe" }`, `{ "eurasia": true }`,
`{ "regions": { "includes": "Caucasus" } }`. No `where` means every country.
It is evaluated by `matchesWhere()` in `src/utils/categories.js`; there is no
per-category code.

The backend validates the whole tree at startup (unique ids, valid types and
sources, a paid category must be server-hosted and have a price) and refuses to
start with a message naming the mistake.

## Group options

| Option | Effect |
|---|---|
| `featured: true` | The group's card(s) are pinned above the tabs instead of becoming a tab (used for **World**). |
| `layout: "list"` | Wide one-per-row cards (used for **Historical**) instead of the compact grid. |

## Where flags come from

- **`bundled`** — filtered from `src/data/countries.json`, which ships in the
  app. Because the data is public it cannot be protected, so **bundled
  categories are always free**.
- **`remote`** — served by the backend from `server/data/<dataset>.json`
  through `GET /api/categories/:id/countries`, which checks access first. This
  is what makes a category truly **paid**: the flags are simply not sent to
  someone who has not bought it. Historical maps use this.

## Free vs paid

The requirement: the browser must never be able to grant itself a paid
category. So:

1. The `type` in `categoryTree.json` is only the **seed default**: the first
   time the backend sees a category it writes a row in the `categories` table
   with that type. After that the **database is authoritative**. Seeding never
   overwrites an existing row, so admin changes survive restarts and deploys.
2. The browser receives the real `type` from `GET /api/categories`, but only
   uses it to draw the UI (a lock, the price). It is not used to decide
   anything: the JSON copy bundled in the frontend is ignored for that, and
   changing `type` in the browser gets you nothing.
3. Every protected action asks the server, through the single function
   `server/lib/access.js`:
   - `default` → anyone, including guests;
   - `paid` → an administrator, or a user with an active row in `entitlements`;
   - `enabled = false` takes any category offline (owners keep what they bought;
     admins can still play it).
   The flags endpoint, the game-recording endpoint, the multiplayer endpoint
   and checkout all use it. A paid category's flags are never sent to a user
   without access, and a finished game for a category the user cannot play is
   rejected.
4. Entitlements are created only by the server after Stripe confirms payment
   (webhook and confirm endpoint, both verified with Stripe, idempotent).

To change a category between free and paid **after deployment**:

- **Admin panel → Game categories:** toggle *Paid*, set the price, toggle
  *Enabled*. Only server-hosted categories can be made paid; a paid category
  needs a price ≥ 1 cent.
- or SQL (Neon SQL editor):

  ```sql
  UPDATE categories SET type = 'paid', price_cents = 200, updated_at = now() WHERE id = 'world-1991';
  UPDATE categories SET type = 'default'                                     WHERE id = 'world-1991';
  ```

To change the **default for a brand-new category**, set its `type` in the tree
(before its first deploy).

In the UI, the state of each tile comes from the catalog merge
(`src/utils/categoryCatalog.js`): *Free*, *Premium · $x* (locked, opens the
purchase modal), *Owned*, *Admin access*, or *Currently unavailable*.

## How to add a category

Everything is data; no component or game code changes.

**A bundled category** (a subset of the existing country list, always free):

1. Open `shared/categoryTree.json`.
2. Add a leaf to a group's `categories` (illustrative example — this one would duplicate the existing Southern Europe category):

   ```json
   {
     "id": "example-region",
     "name": "Example region",
     "type": "default",
     "flagSource": { "kind": "bundled", "where": { "regions": { "includes": "Southern Europe" } } }
   }
   ```

   (`where` matches fields of the entries in `src/data/countries.json`; the
   `regions` values in use today are e.g. `Caucasus`, `Western Europe`,
   `Southeast Asia`. A brand-new value has to be added to the countries
   that belong to it in that file.)
3. Done. The picker, the game, results and profile statistics show it; the
   backend seeds its configuration row on next start.

**A new group** (a new tab): add an object to `groups` with `id`, `name` and
`categories`. It becomes a tab automatically (`featured: true` pins it above the
tabs, `layout: "list"` makes wide cards).

**A server-hosted category** (needed for anything paid):

1. Add the flags file `server/data/<dataset>.json` — an array of entries shaped
   like those in `server/data/world-1991.json` (`id`, `name`, `flagSvg`,
   `flagPng`, `flagPngSmall`, and optional notes).
2. Add the leaf with `"flagSource": { "kind": "remote", "dataset": "<dataset>" }`.
   For a paid one also `"type": "paid"` and `"priceCents": 200`.
3. Deploy the backend. The frontend bundle is rebuilt by GitHub Actions on push.

Renaming a category = change `name` (the admin panel can also override it).
Removing one = delete it from the tree; players' history for it stays in the
database and is shown under "Other" on the profile. **Never change an `id`**
that has history; add a new category instead.

Tests: `npm test` and `npm --prefix server test` include tests that add a hypothetical category to a copy
of the tree and check that it appears in the catalog, is seeded by the
backend, and gets its own statistics row with no other code touched.

## How the UI is generated

`buildCatalog(tree, allCountries, serverCategories, myAccess)` merges the
tree, `GET /api/categories` (type, enabled, price, flag count) and
`GET /api/me/access` (what the signed-in user owns) into the list the picker
renders. `CategoryGrid` turns groups into tabs (or a pinned card) and
`CategoryTile` draws each state in the app's existing card/badge styles,
including the existing premium treatment. If the backend is unreachable,
bundled categories still work and server-hosted ones are hidden. The picker is
responsive: the tab row scrolls horizontally on narrow screens and the grid
reflows.

## Profile statistics by category

Statistics are **generated from recorded games**, not stored per category and
not hard-coded anywhere.

1. When a game ends the frontend sends `POST /api/games` (category id,
   difficulty, score, correct, incorrect, skipped, total questions, best streak,
   duration). The server validates the payload, requires that the category
   exists and that the user may play it, and stores one row in `games`.
2. `GET /api/me/stats` aggregates those rows in SQL grouped by `category_id`
   and returns `categoryStats[categoryId]`:

   | Field | Definition |
   |---|---|
   | `gamesPlayed` | number of finished games in the category |
   | `questionsAnswered` | sum of `correct + incorrect` (skipped flags come back later and are not counted against you) |
   | `correct`, `incorrect`, `skipped` | sums |
   | `accuracy` | `correct / questionsAnswered`, as a percentage |
   | `bestScore` | highest single-game score |
   | `bestStreak` | longest streak in any game |
   | `averageScore` | total score ÷ games played |

   Only metrics that are actually recorded are shown; nothing is estimated.
3. The Profile page (`src/utils/categoryStats.js`, `Profile.jsx`) lays those
   out following the **tree**: one section per group with a row for every
   category the user has played, using each category's current name. A category
   added tomorrow appears the first time someone plays it; history for a
   category that has since left the tree is shown under "Other".
4. Administrators can override six top-line totals for display
   (`gamesPlayed`, `questionsAnswered`, `correct`, `incorrect`, `bestScore`,
   `bestStreak`); overrides apply to the totals, not the per-category rows.

## Guest statistics

Signed-out players keep their statistics in `localStorage`, now with the same
per-category fields. Older guest data that only had `{asked, correct}` per
category is upgraded on read; the metrics it never recorded show as "—" rather
than invented values.

## Existing data and IDs

- All 26 original bundled categories select exactly the same flags as before
  (`tests/categories.test.js` embeds the old selection rules and compares).
- The three historical categories keep their ids (`world-1914`,
  `world-1991`, `world-1945`), their datasets and their free/paid state
  (World 1914 paid; the other two free), including for players who already own
  World 1914.
- The SQLite → PostgreSQL import (see [BACKEND.md](./BACKEND.md#migrating-the-old-sqlite-data))
  carries over the admin's category edits, purchases and entitlements.
