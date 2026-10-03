# Categories and profile statistics

How the category tree works, how to add a category, how free/paid is
configured, and how the profile's per-category statistics are produced.

- [The tree](#the-tree)
- [Category data model](#category-data-model)
- [Where flags come from](#where-flags-come-from)
- [Free vs paid](#free-vs-paid)
- [Historical maps are free](#historical-maps-are-free)
- [How to add a category](#how-to-add-a-category)
- [How the UI is generated](#how-the-ui-is-generated)
- [Profile statistics by category](#profile-statistics-by-category)
- [Compatibility with existing data](#compatibility-with-existing-data)
- [Tests](#tests)

## The tree

One file defines every category: **`src/data/categoryTree.json`**. It is a
two-level tree: *groups* contain *categories* (the playable leaves).

```
World (featured)   world
Continents         europe, asia, eurasia, africa, north-america, south-america, oceania
Regions            middle-east, western-europe, northern-europe, southern-europe,
                   eastern-europe, central-europe, caucasus, southeast-asia, east-asia,
                   south-asia, central-asia, north-africa, sub-saharan-africa,
                   central-america, caribbean, south-america-region,
                   north-america-region, oceania-region
Historical (list)  world-1914, world-1945, world-1991
```

All existing category ids and display names were kept, so saved statistics and
history keep matching. Group options: `featured: true` pins the group's card
above the tabs (World); `layout: "list"` shows wide one-per-row cards
(Historical); every other group is a tab.

`src/utils/categories.js` turns the file into a registry
(`categoryGroups()`, `allCategories()`, `getCategoryDef(id)`,
`countriesForCategory(id)`, `labelForCategory(id)`). It contains **no category
ids and no per-category conditions**, and neither does the game engine
(`gameLogic.js`, `useGame.js`, the game screens): every category, free or paid,
is played by the same engine, which only receives a list of flags.

## Category data model

```jsonc
{
  "id": "europe",            // stable and unique; stats are keyed by it, so never change it
  "name": "Europe",          // display name
  "type": "default",         // "default" = free for everyone | "paid"
  "flagSource": {            // where its flags come from (see below)
    "kind": "bundled",
    "where": { "continent": "Europe" }
  }
}
```

| Field | Meaning |
|---|---|
| `id` | Stable unique identifier. |
| `name` | Display name. |
| `flagNumber` | **Derived, never typed in.** The registry counts the category's own flags, so it cannot drift from the data. (Exposed on every registry entry; `null` for a paid category, whose flags only exist on the backend.) |
| `flagSource` | Reference to the flag dataset (below). |
| `type` | `default` (free) or `paid`. |

The tree is validated when the app loads (`validateTree`) and by the test
suite: duplicate ids, bad types or sources, a `dataset` that does not exist, and
a paid category with public (bundled) flags are all reported by name.

## Where flags come from

| `flagSource` | Meaning |
|---|---|
| `{ "kind": "bundled", "where": {…} }` | A filter of the countries shipped in `src/data/countries.json`. `where` is declarative: equality (`{"continent":"Europe"}`, `{"eurasia":true}`) or array-contains (`{"regions":{"includes":"Caucasus"}}`). No `where` = every country. |
| `{ "kind": "dataset", "dataset": "world-1914" }` | The flag file `src/data/datasets/<dataset>.json` (the historical maps). |
| `{ "kind": "remote" }` | Fetched from the backend's entitlement-checked endpoint `GET /api/categories/:id/countries` (the existing premium system). Required for `paid`. |

## Free vs paid

`type` in `categoryTree.json` is the single switch.

- **`default`** — free for everyone, guests included. Flags come from the app
  bundle; the backend is not involved and nothing is fetched.
- **`paid`** — handled by the **existing premium infrastructure, unchanged**:
  the tile is the existing `PaidCategoryCard` (lock, price, owned, admin access,
  unavailable), price / enabled / ownership come from the backend
  (`/api/categories/paid`, `/api/me/access`, admin panel → Game Categories),
  checkout is Stripe, and the flags are only ever delivered by the server after
  it verifies ownership. Because anything in the bundle is public, a paid
  category must use `"flagSource": { "kind": "remote" }`; `validateTree` rejects
  anything else.

The backend is the authority for who may play a paid category; the browser only
draws the UI. Nothing in this phase adds a new backend, database or payment
code.

### Changing a category from free to paid (later)

1. In `src/data/categoryTree.json` set `"type": "paid"` and
   `"flagSource": { "kind": "remote" }` on the category.
2. Make sure the backend has it: its dataset in `server/data/<id>.json` (already
   there for the three historical maps), its entry in
   `server/lib/paidCategoryData.js`, and a `paid_categories` row with a price
   (the admin panel edits it).
3. Delete `src/data/datasets/<id>.json`, otherwise the flags remain downloadable
   from the public bundle.

No change to the game engine, the category UI or the profile is needed.
Changing it back is the reverse.

## Historical maps are free

`world-1914`, `world-1945` and `world-1991` are `type: "default"` with
`flagSource.kind: "dataset"`, so they are listed in the **Historical** tab like
any other free category (a "Free" badge, no purchase modal, no premium
restriction), start through the same setup and engine, and record statistics
like every other category. Because their flags ship with the app they also work
on GitHub Pages without any backend.

The premium system is untouched (see above). Its server copies of the datasets
in `server/data/` are kept for when a historical map is made paid again;
`tests/categories.test.js` fails if the bundled copy and the server copy ever
differ.

## How to add a category

Everything is data.

**A subset of the existing flags** (always free):

1. Add a leaf to a group in `src/data/categoryTree.json`:

   ```json
   {
     "id": "nordics",
     "name": "Nordic countries",
     "type": "default",
     "flagSource": { "kind": "bundled", "where": { "regions": { "includes": "Northern Europe" } } }
   }
   ```
2. Done: the picker, the game, the results screen and the profile statistics
   include it.

**A category with its own flag set** (for example a new historical map):

1. Add `src/data/datasets/world-1939.json`, an array of entries shaped like
   `world-1991.json` (`id`, `name`, `flagSvg`, `flagPng`, `flagPngSmall`, plus
   optional `historicalName`, `modernName`, `year`, `note`, …).
2. Add the leaf with `"flagSource": { "kind": "dataset", "dataset": "world-1939" }`.

**A new group** (a new tab): add `{ "id": "themes", "name": "Themes", "categories": [...] }`
to `groups`.

Never change the `id` of a category that players already have history in; add a
new category instead. Removing a category from the tree does not delete anyone's
history (see below).

## How the UI is generated

- **Picker** (`CategoryGrid`): featured groups above, every other group a tab,
  tiles by the group's `layout`. Counts come from `flagNumber`.
- **Game setup** (`Home`): the selected category's `flagNumber` drives the
  length options and the play button.
- **Game / multiplayer**: `countriesForCategory(id)` supplies the flag pool to
  the unchanged engine.
- **Profile**: see below. Nothing lists categories by hand.

## Profile statistics by category

The pipeline is **category → performance records → calculated statistics →
category statistics UI**:

1. **Records.** When a game ends it is recorded under its category id: for a
   signed-in player as a row in the existing `games` table (`/api/games`), for a
   guest in `localStorage` (`meridian_guest_stats_v1`).
2. **Calculation.** The per-category figures are computed from those records:
   the backend aggregates `games` grouped by `category_id` (`server/lib/userStats.js`);
   the guest record keeps the equivalent running totals (`src/utils/storage.js`).
   Per category: games played, questions answered, correct, accuracy
   (correct ÷ questions), best score, best streak. These are the metrics the
   app already tracked overall; nothing new is invented.
3. **Sections.** `buildStatsSections()` (`src/utils/categoryStats.js`) lays the
   categories that have records out by the tree's groups, in tree order, with
   each category's current name. Categories with no records are not shown, so
   there are no empty sections. History for a category id that is no longer in
   the tree is kept under "Other".
4. **UI.** The Profile shows an overall "All categories" summary (the existing
   statistics) followed by one card per played category, grouped under its
   parent group (Continents, Regions, Historical, …), each with the same five
   metrics. It is a responsive grid: two cards per row on desktop, one column on
   phones.

Adding a category to the tree is all it takes for it to appear on the profile
once someone plays it. Solo statistics are separate from the multiplayer game
history, as before.

## Compatibility with existing data

- **Category ids** are unchanged, so every existing game row, guest record and
  multiplayer record still resolves to its category and name.
- **Guest records** written by the previous version only had
  `{ asked, correct }` per category. They are upgraded in place the next time a
  game in that category is recorded (nothing is deleted or reset). Those
  categories show "—" for games played / best score / best streak until a new
  game is recorded; afterwards the new figures carry a **†** and a note explains
  that they cover games since detailed tracking began, while questions answered
  and accuracy still include the older games. No number is estimated.
- **Backend records**: the per-category query was extended to also return games
  played, best score, best streak and total score from the same stored `games`
  rows, alongside the original `asked` / `correct` fields (an older backend that
  only sends those still displays correctly, with "—" for the rest). Admin
  overrides still apply to the six top-line totals only.
- **Purchases and entitlements** are not modified. A user who bought World 1914
  keeps the entitlement in the backend; while the map is free the entitlement
  simply is not needed.

## Tests

```bash
npm test      # all unit and component tests
npm run build
```

`tests/categories.test.js` (tree structure; all 26 original categories select
exactly the flags they did before; historical maps free; every category starts
through the same engine; a hypothetical new category and group are data only;
free/paid configuration), `categoryStats.test.js`, `storage.test.js`,
`ui.categories.test.jsx` (picker), `ui.profile.test.jsx` (per-category
sections from stored records, legacy records, empty state),
`ui.home.test.jsx` (selecting and starting historical maps).
