# Idlescape — SPW: Wiki corpus, reader site, and agent query API

Date: 2026-09-05
Status: approved 2026-09-05 by the project owner ("agreed"); plan at docs/superpowers/plans/2026-09-05-spw-wiki-corpus.md; corpus targets revision 274 (ruled 2026-09-05 when SP1b moved the content clone)
Scope: a wiki of the game as it exists on our server, generated from the pinned Lost City
repositories and completed by hand where the data cannot say it, published two ways: a
reader site at `/wiki` linked from the frame title bar, and a query API at `/api/wiki` (with
MCP tools once SP4 lands) shaped around the questions a Claude session asks while planning
or answering the player. Every statement carries a source. Voice and page structure follow the
Old School RuneScape Wiki's house style, written fresh.

Depends on nothing but the Content and Engine clones, so it can start now on 225 and is
re-run on 274 after SP1b. The MCP surface (section 8.3) lands with SP4.

## 1. Why this exists

SP4 gives Claude eyes and hands in the game but no memory of the world. Asked "what do I need
for Dragon Slayer", "where is the nearest anvil to Varrock west bank", "what drops a
rune scimitar", or "how much woodcutting XP is a yew", Claude today would guess from
Old School knowledge, which is wrong often enough to matter: this is revision 225 (274
after SP1b), where quests, shops, drop rates and even item names differ from 2007 and from
today. The authoritative answer is in `engine/content`, in RuneScript and config files that
no model should read at question time. This sub-project reads them once, at build time,
and turns them into pages and a queryable store.

The human side matters for the same reason. The community reference for Lost City is
LostHQ (a RuneHQ-style static site). It tracks rev 274 and is a fine pointer, but by
roadmap Decision 6 we regenerate data from our own Content pack rather than copy anyone's,
and we want the reader and the agent to see the same corpus with the same sources.

## 2. Goals and non-goals

Goals

- One corpus, built by a script from the pinned Content and Engine clones plus a directory of
  hand-authored markdown, with provenance on every fact.
- A reader site at `/wiki` in the OSRS Wiki idiom: infobox first, bold subject lead, fixed
  section order per page type, present tense, neutral third person, sources at the foot.
- A query API at `/api/wiki` that answers the agent's question classes in one round trip and
  returns token-cheap markdown by default, structured JSON on request.
- A "Wiki" link in the frame title bar that opens the reader in a new tab.
- Coverage: every item, NPC, location object, quest, skill, shop, area and minigame in the
  pack gets a page; the ones the data cannot describe get an honest stub that says so.
- A style and sourcing lint that fails the build on pages below the bar.

Non-goals

- Editing in the browser. The corpus is files in git; edits are commits.
- Copying text or data from the OSRS Wiki (CC BY-NC-SA), LostHQ, RuneHQ or any archive.
  They are cited as sources for gap fills and cross-checks, never pasted.
- Images beyond item and NPC sprites rendered from our own cache. No map tiles yet.
- Real-time data (player counts, hiscores). SP3 owns that.
- Pathfinding. The wiki gives coordinates; SP4's vendored pathfinder walks them.

## 3. Approaches considered

1. Static site generator only (markdown to HTML at build time), API reads the HTML. Simple,
   but structured questions (drops, requirements, nearest bank) need parsing at query time.
2. One SQLite corpus built at build time (entity tables, FTS5 text index, prebuilt page
   markdown), read by both the reader routes and the API in the existing front server.
   Structured and full-text in one file; no new process; matches SP3's `bun:sqlite` choice.
   Chosen.
3. A separate wiki service (MediaWiki, Wiki.js). Editable, familiar, and a second stack to
   host, secure and back up, for a corpus that is generated anyway. Rejected.

## 4. Source inventory

What the pinned repositories contain and which page types each feeds. Counts are the
`engine/content` clone at the `scripts/upstream.lock` sha (225).

| Source | Where | Feeds |
|---|---|---|
| Item configs (`*.obj`, 170 files, 1869 items; `pack/obj.pack` for ids) | `scripts/**/configs/` | Item pages: name, examine, cost, weight, members, stackable, tradeable, equip slot, combat bonuses and level requirement (`param=`), category, cert link |
| NPC configs (`*.npc`, 116 files, 1017 NPCs) | same | NPC and monster pages: name, examine, options, combat level and stats, size, respawn, params (damage type, death drop, sounds), `vislevel` |
| Location objects (`*.loc`, 111 files, 3387 locs) | same | Object pages: name, examine, options, size, category |
| Quest scripts (53 folders under `scripts/quests/`, each `configs/*.varp` and `scripts/*.rs2`) | `scripts/quests/` | Quest pages: start NPC, progress varp and its stages, dialogue, item checks (`inv_total`), stat checks, rewards (`stat_advance`, `inv_add`, `%questpoints`), completion constant |
| Quest and stat enums (`quest.enum`, `stat.enum`, `levelup_unlocks.enum`) | `scripts/general/configs/`, `scripts/player/configs/` | Quest list and display names, skill list, level-up unlock text |
| Skill data tables (`*.dbtable` and `*.dbrow`: `woodcutting_trees`, `cooking_generic`, mining rocks, fishing spots, and the rest; 23 `.dbtable` and 45 `.dbrow` files across the pack) | `scripts/skill_*/configs/` | Skill pages and training tables: level required, XP per action, product, tool success chances, respawn |
| Skill scripts (`scripts/skill_*/scripts/*.rs2`) | same | Mechanics not in tables: `stat_advance` calls, failure messages, interaction rules |
| Drop scripts (`scripts/drop tables/scripts/*.rs2`, one per monster family) and drop rows (`table=drop_table` `.dbrow` files, e.g. gem rock) | `scripts/drop tables/`, `scripts/skill_mining/configs/` | Drop tables with exact rates: the scripts roll `random(N)` and branch on thresholds, which is a rate |
| Shop inventories (`*.inv` with `stock*=item,count,restock`, 143 invs) and shop scripts | `scripts/areas/**/configs/`, `scripts/shop/` | Shop pages and item "store locations" |
| Map files (`maps/m??_??.jm2`, 418 files; sections `MAP`, `LOC`, `NPC`, `OBJ`) | `maps/` | NPC spawn coordinates, ground item spawns, object placements; the basis of "where is" and "nearest" |
| Area labels and flags (`maps/labels.txt`, 107 labels with coordinates and zoom; `free2play.csv`, `multiway.csv`) | `maps/` | Area pages, members and multi-combat flags, coordinate to area-name resolution |
| Interfaces (`*.if`, 151 files) | `scripts/**/` | Quest journal and skill guide text where it exists |
| Level requirement scripts, prayers enum, spells, combat enum | `scripts/levelrequire/`, `scripts/skill_prayer/`, `scripts/skill_magic/`, `scripts/skill_combat/` | Equipment requirement rules, prayer and spell tables, combat formulas |
| Source comments in Content (`// https://...` next to the fact: 581 youtu.be, 370 osrs-dumps on raw.githubusercontent, 256 web.archive.org, 136 oldschool.runescape.wiki, 62 classic.runescape.wiki and others) | throughout `scripts/` | Per-fact provenance the Content authors already recorded; carried through as citations |
| Engine config parsers (`src/cache/config/*Type.ts`) and the packed cache (`data/pack/server/*.dat`) | `engine/server/` | The extractor reads the packed binaries through the engine's own parsers, so field semantics (defaults, `op` slots, `params`) match the game exactly |
| Engine mechanics (`src/engine/`, combat, skills, `CoordGrid.ts`) | `engine/server/` | Mechanics pages: tick length, XP formula, coordinate system, combat level formula |
| Client fork (`client/`) | `client/src/` | Interface names and skill guide layouts only; no wiki content |

Reference sites, cited but never copied: the OSRS Wiki for modern analogues, the Lost City
forum (quest guide archive, optimal quest order, "hard to find 2004 info" threads), LostHQ
as a pointer, and 2004 to 2005 Wayback snapshots of tip.it, RuneHQ and Sal's Realm, which are
the period sources the Content authors themselves cite.

## 5. Corpus model

### 5.1 Repository layout

```
wiki/
  package.json            bun; scripts: extract, draft-report, build, lint, serve-dev
  gen/                    extractors, one per source family, each under 400 lines
    index.ts              orchestrates: extract -> merge overlays -> render -> index -> db
    engineCache.ts        opens engine/server/data/pack/server via the engine's *Type parsers
    items.ts npcs.ts locs.ts quests.ts skills.ts drops.ts shops.ts maps.ts areas.ts
    citations.ts          pulls `// https://` comments adjacent to each config block or script label
    render/               markdown page renderers per page type + infobox templates
    lint.ts               style, sourcing and link checks
    types.ts              Entity, Page, Source, Confidence
  content/                hand-authored markdown overlays and standalone pages (committed)
    items/<slug>.md  npcs/  quests/  skills/  areas/  guides/  mechanics/
  data/                   generator output, committed (roadmap convention): entities.json
                          per type, spawns.json, citations.json, gaps.md, manifest.json
  build/                  git-ignored: wiki.db (SQLite), sprites/, report.md
  STYLE.md                the house style (section 6)
  AUTHORING.md            how overlays and gap fills are written and reviewed (section 7)
```

`scripts/build.ps1` gains `bun run --cwd wiki build`. `scripts/gen/` (the roadmap's home for
generated data) delegates XP tables, quest steps and item names to `wiki/gen` so SP2 plugins
and the wiki share one extraction; `manifest.json` records the Content and Engine shas the
data came from.

### 5.2 Entities

Every entity has `type`, `id` (the pack id), `key` (the Content symbolic name, e.g.
`bronze_axe`), `slug` (URL form, `bronze-axe`), `name`, `revision`, `members`, `fields`
(typed per entity), `sources[]`, `confidence`, and `related[]` (typed links). Types:

`item`, `npc` (with a `monster` facet when it has combat stats), `loc` (scenery), `quest`,
`skill`, `shop`, `area`, `spawn` (NPC or ground item at a coordinate), `droptable`,
`method` (a skilling action: skill, level, XP, inputs, outputs, source table), `minigame`,
`mechanic` (hand-authored), `guide` (hand-authored).

Coordinates are absolute `(x, z, level)` as the OSRS Wiki writes them, converted from the
pack's `level_mx_mz_lx_lz` form by the engine's `CoordGrid`. Each coordinate resolves to the
nearest `labels.txt` area for prose ("north of the Lumbridge castle courtyard" is editorial;
"Lumbridge" is data).

### 5.3 Sources and confidence

Each fact group on a page carries one or more sources. Source kinds:

| Kind | Form | Meaning |
|---|---|---|
| `content` | `content:scripts/areas/area_alkharid/configs/alkharid.npc#al_kharid_warrior` | Read from a pack file at the manifest sha |
| `engine` | `engine:src/engine/entity/Player.ts#combatLevel` | Mechanic read from engine code |
| `derived` | `derived:quests.ts:progression` plus the script path | Computed by an extractor from scripts (quest stage order, drop rates from `random()` thresholds) |
| `cited` | the URL the Content authors left beside the fact | Their provenance, carried through unchanged |
| `period` | Wayback URL dated 2004 to 2006 | A contemporary fansite or Jagex page we consulted for a gap |
| `modern` | OSRS Wiki or RS Classic Wiki URL | A modern analogue used for a gap; may differ from 225 |
| `editorial` | `editorial:<author>:<date>` | Our own wording or inference, stated as such |

Confidence is the weakest source in the group: `verified` (content or engine), `derived`,
`period`, `modern`, `editorial`. The reader shows a small badge per section when below
`verified`; the API returns `confidence` on every response and per section in JSON.

### 5.4 Page render and overlay merge

For each entity the renderer produces markdown from data using the page-type template
(section 6.3). If `wiki/content/<type>/<slug>.md` exists, its frontmatter can override
infobox fields (each override needs a `source:`) and its body sections are merged by
heading: an overlay section replaces the generated section of the same name, and extra
sections are appended in template order. Hand text never silently overrides data without a
source, and the lint rejects an overlay whose infobox values disagree with the pack unless the
frontmatter says `disputes: content` with a reason.

Pages are stored in the db as markdown (for the API) and as prerendered HTML (for the reader),
alongside an FTS5 index over title, aliases, examine, lead and body, with title boosted.

### 5.5 Database

`wiki/build/wiki.db`, built fresh each run, opened read-only by the front server (`bun:sqlite`,
one connection per worker, `PRAGMA query_only`).

```sql
entities   (type, id, key, slug, name, members, confidence, json)         -- json = full entity
pages      (type, slug, title, markdown, html, updated_sha)
sources    (type, id, section, kind, ref, note)
links      (from_type, from_slug, to_type, to_slug, relation)              -- 'drops','sells','requires','rewards','spawns_at','uses','made_from','located_in'
spawns     (npc_id | obj_id, x, z, level, count, area_slug)
methods    (skill, level, xp, action, input_json, output_json, source_ref)
drops      (npc_id, item_id, min, max, num, den, rarity_label, table_ref, condition)
requirements (subject_type, subject_id, kind, key, value)                  -- kind: 'skill'|'quest'|'item'|'questpoints'
aliases    (alias, type, slug)                                             -- 'rune scim', 'r2h', 'Cooks Assistant'
search     FTS5 (title, aliases, lead, body, type UNINDEXED, slug UNINDEXED)
```

Indexes on `links(to_type,to_slug)`, `spawns(npc_id)`, `spawns(x,z)`, `drops(item_id)`,
`requirements(kind,key)`, `methods(skill,level)`.

## 6. House style

`wiki/STYLE.md` is normative for generated templates, overlays and lint. Summary:

### 6.1 Voice

- Present tense, third person, neutral. "The **Bronze axe** is a woodcutting tool." Never
  "you can" outside `guide` pages, where second person is allowed in walkthrough steps.
- British spelling (armour, defence, colour), Jagex capitalisation for proper nouns, lower
  case for skills and item names mid-sentence ("a rune scimitar requires 40 attack").
- Numbers as digits; XP as "250 experience" in prose and "250 xp" in tables; coordinates
  as `(3222, 3218, 0)`; rates as "1/128" with the percentage in parentheses.
- Members content says so in the infobox and in the first sentence when relevant.
- No hedging words where the source is `verified`. Where confidence is lower the sentence
  says what is known: "In Old School RuneScape this drop is 1/128; the 225 script has not been
  matched to a source."
- No copying. Lint rejects any sentence longer than 12 words that appears verbatim in a
  small deny list of scraped OSRS Wiki lead sentences for the 200 most common entities, as a
  smoke check; the real control is the authoring process in section 7.

### 6.2 Page anatomy

Every page: title, infobox (right column on desktop, top on narrow), lead paragraph with the
subject in bold and its one-line definition, then sections in the type's fixed order, then
"Sources" (numbered footnotes grouped by section), then "Build" (revision, Content sha,
generated date). Sections with no data are omitted, except the ones marked required, which
render a stub line: "No information is recorded for this section yet." so the gap is visible.

### 6.3 Templates by page type

Item: infobox (image, released as "2004 build 225", members, quest item, tradeable,
equipable, stackable, high and low alchemy derived from `cost`, weight, examine, id and key);
sections Uses, Item sources (drops, shops, spawns, skilling outputs, quest rewards),
Creation (if a `method` outputs it), Products (if a method consumes it), Bonuses (equipable
only, the ten stats plus attack speed), Requirements, Changes, Trivia. Required: Uses, Item
sources.

NPC (non-combat): infobox (image, location areas, options, examine, id); sections
Dialogue (topics only), Location, Quests involved, Shop (if any), Trivia. Required: Location.

Monster: infobox adds combat level, hitpoints, attack, strength, defence, max hit if derivable,
aggressive, poisonous, attack style, respawn; sections Location (spawn table with coordinates
and counts), Drops (100%, then tables in script order with rate and quantity), Strategy
(overlay only), Trivia. Required: Location, Drops.

Scenery (loc): infobox (options, examine, id, locations count); sections Uses, Locations,
Trivia. Required: Uses.

Quest: infobox (start point NPC and area, difficulty from the quest enum group, length
(overlay), requirements, items required, items recommended, enemies to defeat, quest points,
rewards); sections Walkthrough (numbered by progress stage, derived from the varp progression
and dialogue; overlay refines), Rewards, Required for completing, Transcript (link only),
Trivia. Required: Walkthrough, Rewards.

Skill: infobox (members, minimum level, max level); sections Mechanics, Training (a table per
method from `methods`, by level), Tools, Quests giving experience, Level-up unlocks (from
`levelup_unlocks.enum`), Trivia. Required: Training.

Shop: infobox (owner NPC, area, coordinates, currency, buys from players (`allstock`),
restocks); sections Stock (item, base count, price rules), Location. Required: Stock.

Area: infobox (members, multi-combat, map label, coordinates); sections Features (banks,
shops, altars, anvils, furnaces, ranges, quest starts), NPCs, Monsters, Music (from
`scripts/music`), Trivia. Required: Features.

Mechanic and guide pages are free-form under a lead, with the same sources footer.

### 6.4 Linking

First mention of any other entity in a section links to it. Aliases resolve links in
overlays (`[[rune scim]]` becomes the rune scimitar page). Lint fails on unresolved links and
reports orphans (pages with no inbound links) in `report.md` without failing.

## 7. Authoring and gap filling

The generator writes `wiki/data/gaps.md` after every run: entities missing a lead
(generated leads exist for all, so this lists ones flagged `needs-overlay`), quests whose
derived walkthrough has fewer stages than varp values, monsters with a death script the drop
extractor could not fully parse, methods without a source table, and required sections that
rendered a stub. It is the work queue.

Gap fills are written as overlays in `wiki/content/`, in Claude Code sessions using the prompt
in `AUTHORING.md`: the author is given the entity JSON, the relevant scripts, and the citation
list, asked to write in STYLE.md voice, to cite every claim from those inputs first, to
consult period sources second, the OSRS Wiki third, and to label anything else `editorial`.
Each overlay is reviewed by a second session against the same inputs before commit
(subagent-driven development pattern). Priority order: the free-to-play quests, then the
members quests, then monsters with drop tables, then skill training tables, then areas.

Quest walkthroughs are the largest hand effort but the scripts do most of it: the progress
varp values, the dialogue labels that set them, the `inv_total` and `stat` checks that gate
them, and the `stat_advance` and `inv_add` calls at completion are all extractable; the
overlay adds ordering advice, travel directions and item preparation.

## 8. Interfaces

### 8.1 Reader site

Served by the front server, gate cookie required like the shell. Server-rendered HTML from
the prebuilt `pages.html` column inside one layout template; no client framework, one small
script for the search box and infobox collapse.

| Route | Content |
|---|---|
| `GET /wiki` | Front page: search box, entry tiles per type with counts, "random page", recent build note |
| `GET /wiki/search?q=` | FTS results grouped by type with snippets; a single exact title match redirects |
| `GET /wiki/<type>/<slug>` | The page. Unknown slug: 404 page with search results for the slug words |
| `GET /wiki/<type>` | Alphabetical index with letter jumps and a members filter |
| `GET /wiki/random` | 302 to a random page |
| `GET /wiki/sprites/<type>/<id>.png` | Item and NPC head sprites rendered from our cache at build time |

Visual: the shell's RuneLite tokens (dark window, grey panels, orange accents) applied to a
classic wiki layout: left rail with search, type navigation and "on this page"; article
column at 760px; infobox right at 300px. System sans, tabular figures in tables. Print
stylesheet hides the rails. Below 900px the infobox drops above the lead and the rail becomes
a top bar.

Every page links its entity's API form ("View as JSON", "View as Markdown") so a human can
see exactly what Claude sees.

### 8.2 Title bar link

`web/src/partials/frame.html` gains, after the brand, `<a class="title-link" href="/wiki"
target="_blank" rel="noopener">Wiki</a>` styled muted with orange on hover. The entry screen
card gains the same link under the buttons so the wiki is reachable before login. Opening in
a new tab keeps the game socket alive.

### 8.3 Agent query API

Front server, `server/src/wiki/` (`db.ts`, `routes.ts`, `queries.ts`, `format.ts`,
`types.ts`). Router classification `wiki` for `/wiki/*` and `/api/wiki/*`. Authentication:
`/api/wiki/*` accepts either the gate cookie (browser, same-origin) or an agent bearer token
(Task 13b `agentTokens`, mode `observe` suffices, since it is read-only). This lets a paired
Claude Code session use the API from the skill document before SP4's MCP tools exist.

Responses default to `text/markdown` because Claude reads it cheapest; `?format=json`
or `Accept: application/json` returns the structured form. Every response carries
`X-Wiki-Revision`, `X-Wiki-Build` (Content sha) and, in JSON, `sources` and `confidence`.

Routes:

| Route | Answers | Notes |
|---|---|---|
| `GET /api/wiki/search?q=&type=&limit=10` | "Is there a page about X" | FTS with alias expansion; returns `{type, slug, title, snippet, score}` rows. Markdown form is a compact list. |
| `GET /api/wiki/page/<type>/<slug>?sections=lead,drops` | "Tell me about X" | Page markdown, optionally restricted to sections to save tokens; JSON form returns the entity plus sections keyed by heading |
| `GET /api/wiki/entity/<type>/<id-or-key-or-slug>` | Exact record | Resolves numeric id, symbolic key or slug |
| `GET /api/wiki/q/obtain?item=` | "How do I get X" | Drops (with rates, sorted best first), shops (with location), spawns (nearest to an optional `near=x,z,level`), methods that produce it, quests that reward it |
| `GET /api/wiki/q/drops?npc=` | "What does X drop" | Full drop table with rates and conditions |
| `GET /api/wiki/q/requirements?quest=` or `?item=` | "What do I need for X" | Skills, quests, items, quest points; includes the transitive quest prerequisites |
| `GET /api/wiki/q/unlocks?skill=&level=` | "What can I do at level N" | Methods, equipment and quests newly available at that level, plus the next unlock |
| `GET /api/wiki/q/methods?skill=&level=&members=` | "How should I train X at level N" | Methods usable at that level ordered by XP per action with inputs, outputs and where the resources are |
| `GET /api/wiki/q/nearest?kind=bank\|shop\|anvil\|furnace\|range\|altar\|npc\|loc&name=&x=&z=&level=&limit=5` | "Where is the nearest X" | Euclidean over `spawns` and feature locs, same level first; returns coordinates, area and distance in tiles |
| `GET /api/wiki/q/where?name=` | "Where is X" | All spawn or placement coordinates grouped by area for an NPC, item or scenery |
| `GET /api/wiki/q/shops?item=` or `?area=` | "Who sells X", "What shops are in Y" | Stock rows with base count and location |
| `GET /api/wiki/q/quest-order?done=[slugs]&members=` | "What quest should I do next" | Quests whose requirements the given completion set satisfies, sorted by quest points then length |
| `GET /api/wiki/q/plan-context?goal=` | "Help me plan X" | Bundle: the best-matching page's lead, its requirements, obtain rows for required items, nearest features to the start point, capped at `budget` tokens (default 3000). One call before a planning conversation. |
| `GET /api/wiki/schema` | The API's own documentation, markdown | Served as MCP resource `idlescape://wiki-schema` too |

Errors are JSON `{ error: 'not_found' | 'ambiguous' | 'bad_query', candidates?: [...] }`;
`ambiguous` returns up to five candidate slugs so Claude can pick without a second search.
Rate limit 120 requests per minute per token or cookie.

Query design rules: one call per question class, no pagination in the markdown form (limits
instead), coordinates always with area names, rates always as fraction and percentage,
members flags on every row, and `sources` always present so Claude can tell the player where
the answer came from.

MCP (lands in SP4's `server/src/mcp/tools.ts`): `wiki_search`, `wiki_page`, `wiki_query`
(one tool with `kind` matching the `q/` routes, so the tool list stays short) and resource
`idlescape://wiki-schema`. All mode `observe`. The SP4 skill document gains a paragraph
telling Claude to consult the wiki before answering game questions and to cite its sources
in replies.

## 9. Build and revision handling

1. `bun run --cwd wiki extract`: opens the engine's packed cache through the engine parsers
   (falls back to text configs for fields the binary pack drops, such as symbolic keys and
   comments), walks scripts and maps, writes `wiki/data/*.json` and `gaps.md`, records shas
   in `manifest.json`. About one minute.
2. `bun run --cwd wiki build`: merges overlays, renders pages, lints, builds `wiki.db` and
   sprites. Fails on lint errors.
3. `scripts/build.ps1` calls both; `scripts/verify.ps1` runs the wiki unit tests and the
   API contract tests against the built db.
4. The front server reads `WIKI_DB=../wiki/build/wiki.db` from env; if missing, `/wiki`
   and `/api/wiki` return 503 "wiki not built" and `/api/health` gains `wiki: 'up' | 'missing'`.

Revision: pages carry `revision: 225` now. SP1b re-runs the extractor on 274; overlays are
keyed by symbolic key, not id, so they survive the id churn; the lint reports overlays whose
entity vanished or whose infobox now disputes the data. Both revisions' `data/` are kept
under `wiki/data/<rev>/` so a "Changes" section can be generated by diffing them, which is the
one place the wiki describes history.

## 10. Security and licensing

- Read-only everywhere; no write routes. The db is opened `query_only`.
- Game text (names, examines, dialogue) is Jagex's, included by Lost City for preservation
  under their stated terms; the wiki footer repeats that notice and our MIT covers only our
  code and editorial text.
- No third-party wiki text or data enters the corpus. `CREDITS.md` gains an "Inspiration" row
  for the OSRS Wiki (style and page anatomy) and for LostHQ (site scope), and a "Sources"
  note explaining the citation kinds.
- `/api/wiki` with an agent token exposes only game data, never player data.

## 11. Testing

- Unit (bun, `wiki/`): each extractor against fixture files copied from the pack (one `.npc`,
  `.obj`, `.loc`, `.inv`, a drop script, a quest folder, one `.jm2`) with golden JSON; drop
  rate derivation from `random()` threshold chains including nested members checks; quest
  progression ordering; coordinate conversion and nearest-area resolution; overlay merge
  precedence and the `disputes` rule; lint rules with passing and failing samples.
- Unit (bun, `server/`): auth acceptance (cookie, token, neither); markdown versus JSON
  negotiation; each `q/` route against a small built db fixture; `ambiguous` candidates;
  token budget trimming in `plan-context`.
- Contract: `GET /api/wiki/schema` examples are executed by a test so the documentation
  cannot drift from the routes.
- Browser (Playwright, extends the gate-to-game test): the title bar "Wiki" link opens a new
  page whose URL is `/wiki`; searching "bronze axe" lands on the item page with an infobox
  and a Sources section; the JSON link returns `type: 'item'`.
- Coverage gate: `report.md` lists coverage per type; the build fails if any required
  section is a stub on more than 20% of pages of a type once the corresponding authoring
  phase is marked done in `AUTHORING.md`.

## 12. Order of work

1. `wiki/` package, engine-cache reader, items, NPCs, locs, areas and spawns extractors,
   `data/` output, manifest. Golden tests.
2. Quests, skills, methods, drops, shops extractors; citations harvester; `gaps.md`.
3. Renderers and templates, STYLE.md, lint, `wiki.db` build, sprites.
4. Front server: `wiki` routes, reader layout, search, title bar and entry screen links,
   health field, e2e.
5. `/api/wiki` query routes, schema document, contract tests, skill document paragraph.
6. Authoring phase A: free-to-play quest overlays and mechanics pages (tick, XP table,
   combat level, coordinates). Phase B: members quests. Phase C: monsters and drop
   strategy. Phase D: skill training and areas. Each phase closes by updating `AUTHORING.md`
   and the coverage gate.
7. With SP4: MCP tools and resource.

Steps 1 to 5 are one implementation plan. Step 6 is an authoring backlog worked in parallel
by separate sessions. Step 7 is a line item in the SP4 plan.

## 13. Decisions for the owner

Made in this draft, flagged because a different call changes the work:

1. Storage is a build-time SQLite file read by the existing front server, not a hosted wiki
   engine. Editing happens in git.
2. The API is markdown-first with JSON on request, and question-shaped (`q/obtain`,
   `q/nearest`) rather than a generic graph query. A generic query language can be added
   later on the same tables.
3. `/api/wiki` accepts agent tokens in `observe` mode so Claude can use it before SP4.
4. Overlays are written in Claude Code sessions with review, not by a runtime model call, so
   the corpus is deterministic and every sentence is committed and diffable.
5. Both 225 and 274 data are kept so pages can carry a generated "Changes" section after SP1b.
