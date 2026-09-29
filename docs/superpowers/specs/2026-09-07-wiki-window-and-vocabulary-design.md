# idlescape: the wiki window, the corpus for agents, and one vocabulary

Date: 2026-09-07
Status: approved by the authoring session under D11, on a brief relayed by a peer session on the
owner's behalf (D90); uncommitted until the next docs commit.
Authority: **this document decides sprint 3 entry 10, "Wiki window and corpus surfaces"** (the row
previously numbered 9, "Corpus surfaces", widened), and **its section 9 is the vocabulary ruling
D91 that entries 6 and 7 adopt** over the words in
`2026-09-07-library-catalog-and-task-list-design.md`. Where this document and the wiki corpus spec
(`2026-09-05-spw-wiki-corpus-design.md`) differ on the corpus's shape, this one is the later
statement; where they differ on the reader's routes, the corpus spec still owns them.
Placement: sprint 3 row 10; section 13 says why.
Written on `sprint/dragon-slayer` against HEAD `9608f2b`.

Sources read directly: `wiki/gen/types.ts`, `wiki/gen/load.ts`, `wiki/gen/extract.ts`,
`wiki/gen/quests.ts`, `wiki/gen/shops.ts`, `wiki/gen/db.ts`, `wiki/data/274/manifest.json` and
`gaps.md`, `wiki/STYLE.md`, `wiki/AUTHORING.md`, `server/src/wiki/*`, `web/src/tasks/types.ts`,
`web/src/tasks/requirements.ts`, `web/src/tasks/api.ts`, `web/src/tasks/catalogue.ts`,
`web/src/clientTypes.ts`, `web/src/plugins/builtin/{tasks,tasksViews,marketplace,lootTracker}.ts`,
`client/PATCHES.md` (patch 28), the ledger `2026-09-05-spw-wiki-corpus.md`, the shell v2 gaps
design, the vendored bundle's `README.md`, the catalogue spec's section 12, and decisions D17, D47,
D61 (sprint 3 scope), D66, D70, D71 and D88.

---

## 1. The brief, and what it decides

The peer session's words, relayed for the owner:

> "Create a new popup ui for the wiki. Fully stylize the wiki to match our game. Fill in all data
> that may be useful for a bot script that is researching context and script actions.
> Conversation texts, locations on the world, etc etc. Create two view modes for the wiki, agent
> and player. Player ui is simplified similar to the current info / using the official 2007 wiki
> as the gold standard, assuming we have all that info. On the player wiki, render actions that
> communicate with the client (if it was opened in the client). If the current player meets
> requirements, and if so, links to related scripts. Overhaul the marketplace and tasks into a new
> terminology and category grouping that makes more logical and intuitive sense. None of this was
> solidified and it is your responsibility to pick a convention and normalize it."

Five deliverables, and the reason the fifth lives in this document: the player wiki's "links to
related scripts" and the Library's grouping have to use the same words for the same things, so the
vocabulary is ruled once, here, and both surfaces adopt it.

1. **A wiki window** in the shell, opened from the title bar, an examine line, an item tooltip, a
   bank slot's menu and a script's page, managed by the window system of
   `2026-09-07-windows-and-session-canvas-design.md`.
2. **The corpus filled for agents**: dialogue graphs, interaction tables, coordinates for every
   placed thing, combat behaviour, shop locations, quest transcripts, and a requirements vocabulary
   that matches the runtime's.
3. **Two modes**, player and agent, one corpus, persisted under `cs.wiki.mode`.
4. **Live actions** in player mode when the window is inside the shell: requirement checks against
   the live character, and Run, Walk here and Add to tasks buttons that call the tasks API.
5. **One vocabulary** for the Automation panel, the Library, task lists and the wiki's own
   navigation, with a closed `category` on every script.

## 2. What exists, verified

| Fact | Where |
|---|---|
| Ten entity types: `item, npc, loc, quest, skill, shop, area, method, mechanic, guide`. The corpus spec's `spawn`, `droptable` and `minigame` never became types. | `wiki/gen/types.ts:1` |
| 9,074 pages; 2,629 items, 1,359 npcs, 4,671 locs, 136 areas, 197 shops, 225 methods, 3,746 drops with exact `num/den`, 59 quests; 8,473 npc and ground-item spawns committed, 818,801 loc placements extracted but git-ignored. | `wiki/data/274/manifest.json`, `wiki/gen/extract.ts:60-64` |
| Dialogue is three `~chatnpc` lines per quest stage as `hints[]`, and nothing else. No NPC dialogue tree, no option labels, no transcript. | `wiki/gen/quests.ts:21, 53`, `wiki/STYLE.md:77, 81` |
| RuneScript is parsed into blocks for every `.rs2` but read by three consumers only: shop owners, death drops, quest start NPCs. `opnpcu`, `oplocu`, `opheldu`, `opheld`, `oploc` and the `.if` files are never read. | `wiki/gen/extract.ts:42`, `wiki/gen/load.ts:21-31` |
| NPC records carry stats, options, respawn and size; not max hit, aggression, attack range or style. | `wiki/gen/types.ts:22-25`, `STYLE.md:76` |
| 89 of 197 shops have no coordinates; 11 quests lack a start NPC and 7 lack rewards. | ledger `:105`, `wiki/data/274/gaps.md:5-30` |
| The `requirements` table holds quest requirements and item level requirements only. | `wiki/gen/db.ts:69-72` |
| `/api/wiki` serves `schema`, `search`, `page` (markdown or JSON with `sections` and `entity`), `entity`, and ten `q/<kind>` queries including `nearest`, `where`, `requirements`, `plan-context`. Every response carries `x-wiki-revision`. | `server/src/wiki/api.ts:29-85` |
| Bearer auth on `/api/wiki` is dead code: `verifyBearer` defaults to `false` and the gate cookie is the only credential. In the shell the cookie is present, so the window needs no auth work. | `server/src/wiki/auth.ts:3-16` |
| The reader at `/wiki` serves prerendered `page.html` with its own styling; the shell links to it in a new tab and has no wiki panel, tooltip or examine handler. | `server/src/wiki/reader.ts:11-53`, `web/src/partials/frame.html:3` |
| Client patch 28 gives the shell `getObjIcon(id, count)` and `getObjInfo(id)` with `name, examine, cost, stackable, noted`; the bank's `IconCache` fronts the first. | `client/PATCHES.md:124-140, 174`, `web/src/bank/icons.ts` |
| The runtime's `Requirement` kinds are `item, skill, area, custom`; the corpus's include `quest` and `questpoints`. `evaluateRequirements(reqs, state)` exists and every catalogue row already carries `{ ok, missing }`. | `web/src/tasks/types.ts:19-23`, `requirements.ts:11-20`, `catalogue.ts:53` |
| `WorldState` has skills, inventory, equipment, position, region and dialog state, and **no quest state**: no varp is exposed to the shell. | `web/src/clientTypes.ts:23-48`, vendored `sdk/types.ts:551-589` |
| A library script runs by id with params through `api.run(id, params, { startedBy })`, the single enforcement point. | `web/src/tasks/api.ts:266-289` |
| The loot tracker renders names from the client and persists nothing. | `web/src/plugins/builtin/lootTracker.ts` |
| No `category` field exists on any manifest; grouping is the tag convention `['skilling', 'woodcutting']`. The Marketplace filters by substring over name and tags and sorts by `order`. | `web/src/tasks/types.ts:168-177`, `marketplace.ts:35-40` |
| Shipped words: panel **Tasks** (id `tasks`), panel **Marketplace** (id `marketplace`), sections **My scripts**, **Run snippet**, **History**; badge **Library / Fork / Yours**. Shell v2 renames Tasks to **Automation** with **My tasks / Marketplace** tabs; the catalogue spec adds a **Lists** section and calls the panel both "Automation" and "Tasks" inside one section. No decision row has ever ruled on these names. | `tasks.ts:307-364`, `marketplace.ts:144-168`, bundle `README.md:11, 88-91`, catalogue spec `:1249-1256` |

## 3. The window

A `WindowSpec` with id `wiki`, `resize: 'free'`, `min: { w: 420, h: 320 }`, `initial: { w: 560,
h: 640, at: 'centre' }`, `closable: true`, minimising to the title bar's Wiki link (which stops
opening a new tab and opens the window instead; middle-click and Ctrl-click still open `/wiki`).
Its body is a single `WikiView` module:

- **Header row**: back and forward (a history stack per window, twenty deep), the search input
  (the same `/api/wiki/search` the reader uses, results as a dropdown of `type · title`), and the
  mode segmented control **Player | Agent**.
- **Body**: the page, rendered from an HTML fragment (section 4), inside the `.wiki-*` class
  family this entry adds to the design system and the styleguide.
- **Foot**: revision and build from the response headers, a Copy for Claude link in agent mode,
  and the source count.

Links inside a page navigate inside the window. A link to a type index opens that index inside the
window. External `cited`, `period` and `modern` sources open a new tab.

**How it opens.** `openWiki({ type, key | slug | id, mode?, section? })` on the frame, called by:
the title-bar link; an examine line in chat (the chat hook matches the client's examine message to
the last examined object, which `getObjInfo` names, and appends a small "wiki" glyph to the line);
the item tooltip (section 6); the bank slot context menu's new "Look up" row; a script's own page
(section 7); and the wiki's own links. Deep links from outside the shell are the reader's job and
are unchanged.

## 4. One renderer, two skins

**Ruling R1: the window renders the same HTML the reader serves.** The reader gains
`GET /wiki/<type>/<slug>?fragment=1`, which returns the prerendered article body only (the
`<article>` the page already wraps), with no page chrome and no stylesheet link. The window fetches
the fragment, sanitises nothing (it is our own build output, served from our own origin) and
inserts it. Markdown is rendered in one place, at build time, as it is today.

**Ruling R2: the reader adopts the shell's tokens.** `scripts/build.ps1` copies
`web/src/styles/tokens.css`, the bundle's `typography.css` and the new `web/src/styles/wiki.css`
into `wiki/build/theme.css`, which every reader page links. A unit test in `wiki/` asserts the
copied tokens equal the shell's byte for byte, so the two cannot drift without a red. The reader's
own page chrome (header, tiles, index lists) is restyled once onto the `.wiki-*` family, with the
Pixelify wordmark, the dark surfaces, the mono digits and the orange focus ring the bundle
specifies, and nothing else changes in `server/src/wiki/`. "Fully stylised to match our game" is
this: one stylesheet, the game's tokens, both skins.

The `.wiki-*` family: `.wiki-article`, `.wiki-infobox` (a `.card` with `.kv` rows), `.wiki-toc`,
`.wiki-section`, `.wiki-table` (data tables, mono numbers, sticky header inside the window),
`.wiki-req` (a requirement chip: met, unmet, unknown), `.wiki-action` (the action row), and
`.wiki-src` (a footnote). Every one is on the styleguide in the same change.

## 5. The two modes

One corpus, one fragment, two renderings. The build emits **two fragments per page**,
`page.html` (player) and `page.agent.html`, and the window asks for `?fragment=player` or
`?fragment=agent`. The reader's `/wiki/<type>/<slug>` shows player mode with a mode switch that
sets a `wiki_mode` cookie. The mode is persisted in the shell under `cs.wiki.mode`.

### 5.1 Player mode

The 2007 wiki is the model: an infobox at the top right, a one-paragraph lead, then the sections
a player reads in the order the wiki puts them. Per type, the sections that render and the ones
that are hidden in player mode:

| Type | Player sections, in order | Hidden in player mode |
|---|---|---|
| item | infobox (examine, value, high and low alch, weight, members, tradeable, stackable, equipment bonuses if worn, requirements) · lead · Obtaining (shops with location, drops with rarity words, methods) · Uses (item-on interactions as sentences, section 6.2) · Trivia | raw params, ids, spawn tables beyond the first five |
| npc | infobox (combat level, hitpoints, max hit, aggressive, attack style, respawn, examine, options) · lead · Location (nearest area, "north of Lumbridge bank", with a coordinate the player can copy) · Drops (table: item, quantity, rarity as the wiki's five words and the fraction) · Dialogue (section 6.1, rendered as a transcript) · Strategy (overlay) | option indices, condition expressions, spawn lists |
| loc | infobox (options, examine, size) · Location (top five placements by area) · Uses | the full placement list |
| quest | infobox (start point, difficulty, length, requirements as chips, items required, rewards) · Walkthrough (overlay, else the generated stage list) · Transcript (section 6.1) | varp values, stage labels, hints |
| skill | infobox · Training methods (level, xp, inputs, outputs, xp per action) · Unlocks · Scripts for this skill (section 7) | method table rows |
| shop | infobox (owner, location) · Stock (item, count, restock) | restock ticks as raw numbers |
| area | infobox (free to play, multiway) · What is here (npcs, shops, locs by count) | coordinates |

Numbers are mono; rarity words follow the wiki's convention (Always, Common, Uncommon, Rare,
Very rare) with the fraction in a `title` and in agent mode.

### 5.2 Agent mode

Dense, complete and copyable, for a script author or Claude reading it through the gateway. It is
what `q/plan-context` already tries to be, on a page:

- **Identity block**: type, id, key, slug, aliases, revision, every source kind counted.
- **Entity as JSON** in a `.code` block, exactly the `entity` the API returns.
- **Coordinates** as a table of `x, z, level, area, count, file`, every row, for every kind of
  placement including locs (section 6.3).
- **Interactions**: every op with its index and label (`opnpc1 Talk-to`), every item-on edge in
  both directions, with the script label that handles it.
- **Dialogue graph**: nodes and edges with option indices (section 6.1), the form a script needs to
  choose an option by number.
- **Requirements** as data, in the runtime's vocabulary (section 6.5), and the unlocks a page
  grants.
- **Drops** with `num/den`, conditions and the table they came from; **methods** with xp and tick
  cost where known.
- **Queries**: the exact `/api/wiki` URLs this page was built from, and a `Copy for Claude`
  action that copies the agent fragment as markdown with the identity block first.
- **Scripts**: every library script whose `skills`, `quests`, `npcs` or `items` names this entity
  (section 7), with its id and the params that would target it.

## 6. The corpus, filled

Everything here is a generator change under `wiki/gen/`, additive on `wiki/gen/types.ts`, with the
existing lint and coverage machinery; the DB gains tables and the API gains query kinds. Ruling R3
sets the order: dialogue, interactions, placements, combat, shops, quests, requirements. Each is a
task in the plan with its own count in `manifest.json` and its own gate in `wiki/gen/lint.ts`.

### 6.1 Dialogue graphs

A new extractor `wiki/gen/dialogue.ts` walks every `opnpc1..5` block and every proc it calls
(the call graph `quests.ts:89-92` already follows one level; this follows it to a depth of 12 with
cycle detection) and emits a graph per NPC key:

```ts
export interface DialogueNode { id: string; speaker: 'npc' | 'player' | 'box'; text: string;
  script: string; line: number }
export interface DialogueEdge { from: string; to: string; option?: number; label?: string;
  when?: string }   // `when` is the raw condition expression, verbatim, never evaluated
export interface Dialogue { npcKey: string; entry: string[]; nodes: DialogueNode[];
  edges: DialogueEdge[]; sources: Source[] }
```

`~chatnpc`, `~chatplayer`, `~mesbox`, `~objbox` and the `p_choice` and `multi2..5` families are
the recognised forms; the option label text is the edge label and its position is the option
index. A branch behind an `if` keeps the condition as `when`. A quest's **Transcript** is the
union of the dialogue graphs of every NPC its scripts touch, filtered to nodes whose script is
under the quest's folder, in file order. Player mode renders a graph as a transcript with choices
indented; agent mode renders nodes and edges as two tables. `hints[]` stays for compatibility and
is now derived from the graph.

Count target: every NPC with an `opnpc1` block has a graph; the lint fails on a graph with zero
nodes for an NPC whose option 1 is Talk-to.

### 6.2 Interactions

`wiki/gen/interactions.ts` reads `opnpcu`, `oplocu`, `opheldu`, `opheld1..5`, `oploc1..5` and
`opobj1..5` blocks and emits `Interaction { subjectKind, subjectKey, verb, objectKind?,
objectKey?, script, line, sources }`. Item-on-NPC and item-on-loc are the rows a quest script
needs ("use bucket on cow"); `opheld` gives an item's own options. The `.if` files are globbed
too, for the interface texts a script sees in `interfaceTexts`, stored as `InterfaceText { ifKey,
component, text }` so an agent can match a prompt to its source. Rendered as **Uses** in player
mode and **Interactions** in agent mode.

### 6.3 Placements for locs

The 818,801 loc placements stay out of git, but each loc entity gains `placements: { total,
byArea: { area, count, sample: Coord[] }[] }` with at most 25 sample coordinates per area, chosen
nearest the area's centre. That is bounded at roughly 120,000 rows worst case and in practice far
fewer, and it is what a script needs: "the nearest bank booth to Lumbridge" is a `q/nearest` over
it. `q/nearest` and `q/where` gain `loc` as a subject kind.

### 6.4 Combat behaviour, shops, quests

- NPC records gain `maxHit`, `aggressive`, `attackRange`, `attackStyle` and `poisonous` where the
  `.npc` config or its params carry them (`huntmode` and `huntrange` give aggression, the
  `attack_style` and `max_hit` params give the rest); absent values are absent, not zero, and the
  page says "not in the data" rather than guessing.
- The 89 shops without coordinates take the spawn coordinate of their owner NPC, marked
  `derived`; a shop whose owner has no spawn stays in `gaps.md`.
- The 11 quests without a start NPC and the 7 without rewards are resolved by the interaction and
  dialogue extractors where a quest's `opnpc1` block sets its varp; the rest stay in `gaps.md` as
  overlay work under `wiki/AUTHORING.md`.

### 6.5 Requirements, one vocabulary with the runtime

**Ruling R4: the runtime's `Requirement` gains `quest` and `questpoints` kinds, and the corpus
emits requirements in the runtime's shape**, so a page's requirement chips and a script's
`requires` are evaluated by the same `evaluateRequirements`. The quest kind is evaluated against
quest state, which needs one thing the shell does not have: varps.

**Ruling R5: one numbered client patch exposes read-only quest varps.** `WorldExtras` gains
`varps: Record<number, number>` holding only the varp ids the corpus lists as quest varps (59 of
them), refreshed with the rest of the state each tick; nothing writes. The patch lives in
`client/src/hooks/` per D56's zone rule, is recorded in `client/PATCHES.md` as the next number
(29 at the time of writing; the plan reads the file), and lands behind Dragon Slayer entry 3's
client-fork gate. Until it lands, a quest chip renders "unknown" and a script with a quest
requirement runs with a traced warning instead of a refusal.

## 7. Actions that talk to the client

Only when the window is inside the shell and a character is active; the reader renders the same
rows as plain text with an "Open in idlescape" link.

| Page | Action row | What it calls |
|---|---|---|
| skill | **Train with <script>** for each library script with this skill in `skills`, the button disabled with the missing requirement as its reason when `evaluateRequirements` says no | `api.run(id, params)` with the page's entity pre-selected as the `what` param where the script declares one (D71's sourced select) |
| npc, loc, item, shop, area | **Walk here** to the nearest placement | `api.run('travel-to', { to: coord })` |
| npc | **Fight with <script>** when the combat script's `npcs` or its target select can name this NPC | `api.run(id, { target })` |
| quest | **Do this quest** when a quest script exists (sprint 3's quest helper, entry 5, is the producer); otherwise **Show next step** opens the quest helper panel | `api.run`, or the panel |
| any with a script | **Add to tasks** appends a task to the open list or creates one | the task-list store of the catalogue spec, section 11 |
| item | **Look up in bank** highlights the item in the bank window when it holds it | the bank window's `focusItem(objId)` |

Requirement chips read the live `WorldState` through `api.getState()` and the owner bank through
the bank store when it is open, and update on `onActiveChanged`. `startedBy` is `'player'`; a run
started from a wiki page is an ordinary run.

## 8. Tooltips, examine and the collection log

The three candidates the old entry 9 carried are kept, each small:

- **Item tooltip** (candidate 19): a `.tooltip` family, shown after 350 ms hover on any `[data-obj]`
  element (bank slots first, inventory mirror later), with icon, name, examine, value, and a "wiki"
  link that opens the window. Data comes from `getObjInfo` and the icon cache; no wiki request is
  made for a hover. The family joins the styleguide.
- **Examine to wiki** (candidate 2): section 3's chat hook.
- **Collection log** (candidate 12): a page kind `collection` in the window, reading a new
  per-account store `users/{uid}/collection/{objKey}` with `{ first, count, sources[] }`, written
  by the loot tracker on every pickup (it gains the write; today it persists nothing) and checked
  against the corpus item list. Player mode shows the wiki's log layout by area and source; agent
  mode is the JSON. A Firestore rule follows the `tasks/{taskId}` block's shape, as D67 did.

## 9. One vocabulary: Automation, Library, tasks and runs

### 9.1 The problem

The same two things have carried seven names: **Tasks**, **Automation**, **My scripts**, **My
tasks**, **Marketplace**, **Library**, **catalogue**, plus "quest plugins" and "plugins" in the
owner's own instruction (D61) and in the sprint 3 document, where "plugins" already means the
shell plugin system. And "task" means both a step inside a script (`Task` in `types.ts:221`, the
run card's quest-step row) and a step in a task list (the catalogue spec's `TaskStep`). Nobody
ruled; the words accreted. The brief says pick a convention. This is it, recorded as D91.

### 9.2 The ruling

**Nouns**, one word for one thing, everywhere a player reads:

| Word | Means | Never used for |
|---|---|---|
| **Script** | A runnable program with a manifest: from the Library, yours, or a fork. | A step, a run, a plugin |
| **Library** | The bundled scripts we ship. The tab in Automation that browses them. | User scripts; the goals list |
| **Task** | One step of a task list: a script, its settings and its stop. | A step inside a script's own code |
| **Task list** | An ordered set of tasks the bot runs through. | A run |
| **Run** | One execution of a script or a task list, with its trace and report. | "History" |
| **Step** | A step inside a script's own flow (the run card's quest-step row). | A task |
| **Plugin** | A shell plugin under `web/src/plugins/`. | A script, ever |
| **Automation** | The panel. Its id stays `tasks`. | - |

**The Automation panel**, in shell v2's segmented form, has four tabs in this order:

1. **Scripts**: what you have. Installed library scripts, yours, forks; the source badge stays
   `Library / Yours / Fork`. Replaces "My scripts" and "My tasks".
2. **Library**: what we ship. Replaces "Marketplace". The plugin id `marketplace` and its view
   survive (shell v2 G4); only the label and the copy change. "Marketplace" implied buying and
   publishing, and the studio spec explicitly cut publishing.
3. **Tasks**: task lists. Replaces the catalogue spec's "Lists" section.
4. **Runs**: the run card, then the history. Replaces "History"; the Events panel's chip already
   says Runs.

The run snippet box stays inside Scripts. The strip glyph and label stay `automation` and
"Automation". Strings only, per D47's precedent: no id, no key, no selector, no route changes.

### 9.3 Category and grouping

**Every script manifest declares a `category`**, a closed union, and optional subject lists the
wiki and the Library both group by:

```ts
export type ScriptCategory = 'combat' | 'skilling' | 'questing' | 'utility' | 'minigames';
export interface ScriptManifest {
  // ...existing fields, tags kept for search only
  category: ScriptCategory;
  skills?: SkillName[];        // from web/src/stats/skills.ts
  quests?: string[];           // corpus quest keys
  npcs?: string[];             // corpus npc keys the script can target
  items?: string[];            // corpus item keys it produces or consumes
}
```

The Library tab groups by category in that order, then by the first skill, with a search box over
name, tags and subjects. The Scripts tab keeps a flat list with the same search. The wiki's "Scripts
for this skill" and agent mode's script block are joins over these fields. `tags` stays and is
search-only; `order` stays as the tiebreak. The nineteen catalogue scripts and the four shipped
ones are assigned in the plan; `tutorial-island` is `questing`, `travel-to` and `bank-items` are
`utility`, the battlebots archetypes are `minigames`. The studio's `LINTS` gain
`manifest-has-category` when `standard.ts` exists (D80's shape).

### 9.4 The wiki's own navigation

The window's home and the reader's tiles use the same top-level words, in this order: **Skills,
Combat, Quests, Items, Locations, Shops, Scripts**, where Combat is the npc index filtered to
attackable NPCs, Locations is areas and locs, and Scripts is the Library rendered as pages (one
generated `script` page per library manifest at build time, from `libraryManifests()`, so a
script is a wiki entity a quest page can link to). "Mechanics" and "Guides" stay as a secondary
row.

### 9.5 What changes in the catalogue spec

The catalogue spec's section 12.1 stands in substance and changes in words: "the Lists section"
reads "the Tasks tab", "My scripts" reads "Scripts", "the Marketplace" reads "the Library", and
its empty state points at the Library. Its `TaskList` and `TaskStep` types keep their names. An
amendment note at the top of that spec points here; nothing else in it moves.

## 10. Tests

- **Generator**: one unit test per extractor over a fixture script tree under `wiki/gen/test/`
  with a known dialogue graph, an item-on-NPC edge, a loc with placements in two areas, an NPC
  with `huntmode`; `manifest.json` counts asserted after `extract`; `lint.ts` gains the zero-node
  Talk-to rule and a test that breaks it. The theme-copy equality test of R2.
- **Server**: `?fragment=player|agent` returns the article only; a request for an unknown mode is
  400; `q/nearest` with `kind=loc`.
- **Web** (jsdom): `WikiView` navigation stack, mode persistence, requirement chips over a fake
  state with and without varps, action rows enabled and disabled with the right reason, the
  tooltip's 350 ms timer and its dismissal, the collection store write on a loot event.
- **Playwright**: open the window from the title bar, search, navigate, switch modes, a Train
  button starting a real run on the live stack, Walk here moving the character, the tooltip over a
  bank slot, and the reader page at `/wiki` rendering with the shell's tokens. The live-run cases
  carry `@smoke` per D79's shape so `verify.ps1` runs them.
- **Vocabulary**: a test over `web/src` UI strings asserting none of "Marketplace", "My scripts",
  "My tasks", "History" appears as a label, and every library manifest has a `category`.

## 11. What this spec does not do

- **No MCP tools.** `wiki_search`, `wiki_page` and `wiki_query` stay with SP4c (Dragon Slayer
  entry 16); the fragments and query kinds this entry adds are what those tools will call.
- **No bearer auth.** The window runs behind the gate cookie; SP4c wires `verifyBearer`.
- **No sprites route.** Icons in the window come from the client's icon cache when the shell is
  present and are absent in the reader, as today; the reserved `/wiki/sprites` route stays
  reserved.
- **No quest scripts.** Section 7's "Do this quest" consumes sprint 3 entry 5's output.
- **No map art.** Coordinates are text and "north of Lumbridge bank" is derived from the nearest
  area; the free-camera world viewer is an archived candidate.
- **No change to `PanelId`, `cs.panel`, `cs.plugin.*`, `cs.script.*`, plugin ids or routes.**

## 12. Dependencies

| On | What is needed | State |
|---|---|---|
| Sprint 3 entry 8, windows | `WindowSpec`, the manager, `frame/contextMenu.ts`, the `.tooltip` host rules | spec written beside this one |
| Dragon Slayer entry 3 | the client-fork gate the varp patch (R5) lands behind | needs a plan |
| Dragon Slayer entry 4 | tokens, `.card`, `.kv`, `.seg`, `.alert`, the styleguide fixtures | plan reconciled |
| Dragon Slayer entry 7 | D71's sourced selects, so a Train button can pre-select the page's subject | spec approved |
| Sprint 3 entries 6 and 7 | the category field lands with the catalogue (R6); the task-list store the Add to tasks row writes | specs approved |
| Sprint 3 entry 5, quest helper | the producer of "Do this quest" | needs a spec |
| The wiki corpus | everything in section 2 | shipped |

## 13. Rulings, with the cost if each is wrong

| Id | Ruling | Alternative | Cost if wrong |
|---|---|---|---|
| R1 | The window renders the reader's prerendered fragment; markdown is rendered once, at build. | Render markdown in the shell from `/api/wiki/page?format=json`. | A markdown renderer in `web/` and two renderings to keep equal. |
| R2 | The reader links a `theme.css` copied from the shell's tokens at build, with an equality test. | Hand-maintain a second stylesheet. | Drift with no red. |
| R3 | Corpus fill order: dialogue, interactions, placements, combat, shops, quests, requirements. | Any other order. | A plan reorders tasks. |
| R4 | The runtime's `Requirement` gains `quest` and `questpoints`; the corpus emits the runtime's shape. | Two vocabularies with a mapper. | A mapper nobody maintains. |
| R5 | One numbered hooks patch exposes read-only quest varps on `WorldExtras.varps`. | Infer quest state from the quest journal interface text. | The patch is one file in the hooks zone; the alternative is fragile and needs the journal open. |
| R6 | `category` and the subject lists land on `ScriptManifest` in sprint 3 entry 6, since it writes every manifest, and this entry consumes them. If entry 6 has closed without them, this entry adds them as its first task. | This entry adds them regardless. | One task moves entries. |
| R7 | "Marketplace" becomes "Library"; ids, keys and selectors are unchanged (D47's shape). | Keep Marketplace. | A string sweep in reverse. |
| R8 | "History" becomes "Runs" and the run card moves into that tab. | Keep History. | A string and one section move. |
| R9 | The collection log is a per-account Firestore collection written by the loot tracker. | IndexedDB per browser. | A browser-local log is not "every item ever obtained per account", which is the candidate's words. |
| R10 | The wiki gains a generated `script` page per library manifest, so scripts are entities. | Link to the panel only. | One renderer file. |
| R11 | Placement: sprint 3 row 10, after windows and trace tools. | Before windows, as a centred unmanaged window. | One renumber. |

## 14. Placement

Sprint 3 row 10, the row that was "Corpus surfaces", widened and renamed "Wiki window and corpus
surfaces". It sits after row 8 (windows), which it composes, and row 9 (trace tools), which is
independent; before Sound and Shell panels, which do not need it; and before "Claude reads
traces", whose gateway will read the agent fragments this entry produces. The vocabulary ruling
(D91) applies to rows 6 and 7 immediately, before this row is built, because those rows write the
strings.

## 15. Ledger

The entry's workspace and promoted ledger follow `docs/superpowers/SDD.md`. The measured facts it
must record: the dialogue graph count, the interaction row count, the placement sample row count,
the shops and quests resolved out of `gaps.md`, and the size of `wiki.db` before and after.
