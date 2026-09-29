# idlescape wiki API

Agent-facing read API over the idlescape wiki content database. Every route lives under
`/api/wiki`, answers **markdown by default** (a compact, Claude-friendly digest — one fact per
line, a `##` heading per list, sources and a confidence tier at the end) and answers **JSON**
when the request either sets `?format=json` or sends `Accept: application/json`.

Every response — success or error — carries these headers:

- `X-Wiki-Revision` — the Lost City content revision this build was generated from.
- `X-Wiki-Build` — the content SHA the corpus was built from (first 8 hex chars shown in the
  wiki footer; the header carries the full value).

Errors, in both formats, share one shape:

```json
{ "error": "not_found" | "ambiguous" | "bad_query", "message": "...", "candidates": [{ "type": "item", "slug": "bronze-axe", "title": "Bronze axe" }] }
```

`not_found` and `ambiguous` answer with HTTP 404; `bad_query` (a missing or malformed
parameter, or an unknown skill/kind) answers with HTTP 400. `candidates` is only present when
the lookup has near-miss suggestions — an unresolved name always tries a fuzzy search before
giving up.

## Authentication and rate limiting

Every route is public: no cookie or token is required. A request may carry a bearer token issued
to an agent (`Authorization: Bearer <token>`), which names the bucket it is rate-limited in.

Each credential (the bearer token when one is sent, otherwise the client IP) is rate-limited to
**120 requests per minute**. A request over the limit answers `429 { "error": "rate_limited" }`.
The limit is tracked per credential, not per route.

## Routes

### `GET /api/wiki/schema`

Returns this document.

```
GET /api/wiki/schema
```

### `GET /api/wiki/search?q=&type=&limit=`

Full-text search across every page. `type` restricts to one entity type (`item`, `npc`, `loc`,
`quest`, `skill`, `shop`, `area`, `method`, `mechanic`, `guide`); `limit` caps hits (default 10,
max 50). Markdown answers a `## Results` list; JSON answers `{ "hits": [{ "type", "slug",
"title", "snippet", "score" }] }`. Snippets never carry the internal FTS highlight markers —
they come back as plain text in both formats.

```
GET /api/wiki/search?q=bronze
```

### `GET /api/wiki/page/:type/:slug?sections=&format=`

The rendered wiki page for one entity, as markdown (with front matter stripped to just the
lead and body) or, with `format=json`, `{ "type", "slug", "title", "lead", "markdown",
"sections", "entity" }` plus `sources`, the union of the sections' source refs. `sections` is a comma-separated allowlist of `##` heading names
(case-insensitive) to keep — omit it for the full page.

```
GET /api/wiki/page/item/bronze-axe
```

### `GET /api/wiki/entity/:type/:ref?format=`

The raw entity record — the same JSON the page was rendered from — looked up by numeric id,
slug, internal key, or alias. Markdown answers a `## Fields` list of the entity's scalar
properties.

```
GET /api/wiki/entity/item/bronze-axe
```

## Question routes (`/api/wiki/q/...`)

These are the routes an agent planning a task should reach for first: each answers one
question shape, already joined and formatted, instead of making the caller assemble entity
and spawn lookups itself.

### `GET /api/wiki/q/obtain?item=&near=x,z,level`

How to get an item: drops (with rate and quantity), shared drop tables the item is rolled from,
shop stock (with coordinates), overworld spawns (nearest first when `near` is given), and any
method or quest that produces it.

Drops from NPCs are in `drops`; shared `drop_table` dbrows (`gem_rock_table`, ...) are tables,
not NPCs, and come back separately in `tables` as `{ table, rate, chance, quantity }` (a
`## Tables` list in markdown). `near` is `x,z[,level]` and every part must be a number.

Anywhere a row carries an area, JSON gives both `area` (the display name, "Lumbridge") and
`areaSlug` (the key the spawn rows use); markdown prints the name.

```
GET /api/wiki/q/obtain?item=bronze+axe
```

### `GET /api/wiki/q/drops?npc=`

Every item an NPC drops, with rate, quantity, drop condition and drop table name.

```
GET /api/wiki/q/drops?npc=goblin
```

### `GET /api/wiki/q/requirements?item=|quest=`

The skill levels, prerequisite quests, prerequisite items and quest points an item or quest
requires.

```
GET /api/wiki/q/requirements?item=bronze+axe
```

### `GET /api/wiki/q/methods?skill=&level=&members=`

Every training method for a skill at or below the given level, ranked by xp. `members` filters
to free-to-play methods when set to `false` (not yet enforced per-method — see Known gaps).

```
GET /api/wiki/q/methods?skill=woodcutting&level=5
```

### `GET /api/wiki/q/unlocks?skill=&level=`

What a skill level unlocks: methods available at exactly that level, items whose level
requirement is exactly that level, and the next level at which something unlocks (`null` when
nothing above it is known).

```
GET /api/wiki/q/unlocks?skill=woodcutting&level=1
```

### `GET /api/wiki/q/nearest?kind=&name=&x=&z=&level=&limit=`

The nearest spawns of a kind to a coordinate. `kind` is `npc`, `loc`, `bank`, `anvil`,
`furnace`, `range` or `altar`; `npc` and `loc` require `name`. `x` and `z` are required game
tile coordinates; `level` defaults to 0 (ground floor).

```
GET /api/wiki/q/nearest?kind=npc&name=goblin&x=3222&z=3218&level=0
```

### `GET /api/wiki/q/where?name=&limit=`

Where an NPC, item, or scenery object spawns, **grouped by area**: one row per area with the
number of spawns there and one example coordinate, largest area first. `limit` caps the number
of groups (default 200, max 500); the response also carries `total` (every spawn) and `areas`
(how many groups exist before the cap). Common scenery has tens of thousands of placements, so
the ungrouped list is never returned.

```
GET /api/wiki/q/where?name=bronze+axe
```

### `GET /api/wiki/q/shops?item=&area=`

Shops that stock a given item, or every shop within an area, each with stock and coordinates.

```
GET /api/wiki/q/shops?item=bronze+axe
```

### `GET /api/wiki/q/quest-order?done=&members=`

Quests whose quest prerequisites are satisfied by the comma-separated slugs in `done`
(`members=false` excludes members-only quests). **Skill requirements are listed on each quest,
not checked** — pass the caller's actual skill levels through the game's own state endpoint to
filter further; this route only prunes on quest-completion prerequisites.

```
GET /api/wiki/q/quest-order
```

### `GET /api/wiki/q/plan-context?goal=&budget=`

The single best-matching page for a free-text goal, trimmed to roughly `budget` tokens (4
characters/token, default 3000, max 12000), plus the requirements and obtain summary for
anything that page requires — a one-call context bundle for "how do I do X".

```
GET /api/wiki/q/plan-context?goal=bronze+axe&budget=800
```

## Known gaps

- `methods`'s `members` filter is accepted but not yet enforced per method — the corpus does
  not currently record a members flag on individual training methods, only on items and NPCs.
- Bearer tokens are not verified: `PairStore` has no verify-by-secret method yet, so a token only
  selects a rate-limit bucket. Verification lands with SP4, through `createWikiAuth`'s
  `verifyBearer` seam in `server/src/wiki/auth.ts`.
- A quest's `members` flag is derived from its start NPC's spawn zones. Quests with no start NPC,
  or whose start NPC has no spawns, report `false`; they are listed in `wiki/data/274/gaps.md`
  under "Quests with unknown members status".
- 89 of 197 shops have no coordinates in the content pack, so they answer with `coord: null` and
  no area.
- Spawns outside any map label carry `area: null` and print as "Unlabelled area".
- `loc.members` and `shop.members` are always `false`: neither config carries a members flag and
  neither is derived from its zone yet.
- `unlocks` lists methods and items only — quests unlocked at a skill level are not included.
- The server opens `wiki.db` once at boot (retrying every 30 s while it is missing). A rebuild
  that replaces the file while the server is running is not picked up until the server restarts.
