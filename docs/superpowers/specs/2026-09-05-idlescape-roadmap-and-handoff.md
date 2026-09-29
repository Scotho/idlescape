# Idlescape — Roadmap and handoff bundle (SP1 completion through SP5)

Date: 2026-09-05
Status: approved 2026-09-05 by the project owner ("agreed on everything")
Audience: the Claude Code session running the SDD workflow for
`docs/superpowers/plans/2026-09-04-idlescape-platform.md` (ledger promoted to
`docs/superpowers/ledgers/2026-09-04-idlescape-platform.md`). This document is the single
entry point for that session. It records the research, the decisions, the new sub-project
sequence, and what to do first.

Companion specs (read in this order):

0. `2026-09-05-entry-screen-and-quick-connect-design.md` — SP1 amendment already approved in
   the executing session: entry screen, pairing URL and skill document, agent tokens, Claude
   Connection panel, Task 13b. Merged into this batch 2026-09-05; SP4 inherits its token model
   and `/mcp` gateway path.
1. `2026-09-05-sp1b-revision-274-design.md` — migrate engine, content and client fork to rev 274
2. `2026-09-05-sp2-plugin-framework-design.md` — two-tier plugin system and the Tier 1 plugins
3. `2026-09-05-sp3-hiscores-tracker-design.md` — hiscores and CrystalMathLabs-style tracker
4. `2026-09-05-sp4-agent-runtime-design.md` — rs-sdk based observe/act layer, tasks, hosted MCP
   gateway at `/mcp`, tab socket
5. `2026-09-05-spw-wiki-corpus-design.md` — wiki corpus generated from the Content and Engine
   clones, reader site at `/wiki`, agent query API at `/api/wiki`, MCP tools with SP4
6. `2026-09-05-multi-character-platform-design.md` — Phase A decisions for the multi-character
   handoff (characters per Firebase user, iframe sessions, shared bank via an engine overlay,
   Contracts, wealth hiscores); research under `phase-a/`. Plan: `plans/2026-09-05-sp6-accounts-and-characters.md`.

`CREDITS.md` at the repo root is created alongside and must be kept current by every task that
borrows an idea or vendors code.

## 1. Instructions to the executing session

1. Finish SP1 Tasks 11, 12, 13, 13b and 14 as planned and as amended by the entry-screen spec
   (spec 0 above). They are revision-independent. Two adjustments while doing so, both additive:
   - Task 12: the icon strip and side panel are the future plugin list. Name the panel
     registry `PluginRegistry` and give each panel a `manifest` (`id`, `name`, `icon`,
     `tier: 'shell'`). Do not build the settings schema yet; SP2 adds it.
   - Task 13: the XP Tracker and Loot Tracker panels stay as specified. They become the SP2
     plugins of the same name without a rewrite, so keep their state in a module that does
     not import from the frame.
2. Then execute SP1b (revision 274). Intended slot: before Task 14, so the end-to-end browser
   test runs on the revision we ship. If Task 14 is already in flight when this bundle is read
   (it was, at 2026-09-05 00:10, with `web/e2e/`, `web/playwright.config.ts` and
   `web/src/clientHost.ts` uncommitted), finish Task 14 on 225, then run SP1b, then re-run the
   Task 14 e2e on 274 as SP1b's acceptance before Tasks 15 to 17. Update
   `scripts/upstream.lock`, `README.md` and the SP1 spec's "Client-TS 225" references as part
   of SP1b.
3. Run `superpowers:writing-plans` once per companion spec (SP1b, SP2, SP3, SP4) to produce a
   plan file under `docs/superpowers/plans/`, then execute the plans in that order with the
   same SDD loop (implementer, reviewer, fix rounds, ledger). Start a new workspace per plan and
   promote its ledger at close; the convention is `docs/superpowers/SDD.md`.
4. Deploy stays controller-gated, as ruled in the SP1 ledger: nothing touches the live PoC or
   Firebase cloud resources until the owner asks.
5. Every task that takes an idea or code from an external project appends to `CREDITS.md`
   (see section 6). Vendored code keeps its upstream license header and lands under a
   `vendor/` directory in the owning package.

## 2. What was researched (facts the specs rely on)

Upstream is `LostCityRS` (Engine-TS, Content, Client-TS). Findings from 2026-09-04/05:

- Branch activity: 225 last touched 2026-02-23 (engine), 2026-03-18 (content), 2026-03-22
  (client). 274 touched 2026-08-20 on all three. Every reusable third-party project targets 274.
- Engine 225 to 274: 295 commits. Runtime moves from Bun to Node 24 with `tsx`; the web layer
  moves from `Bun.serve` to Fastify; configuration moves from `.env` to
  `data/config/world.json` (nested `WorldConfig`: `web.port`, `web.allowedOrigin`,
  `web.managementPort`, `node.port`, `node.profile`, `website.registration`, `login.enabled`,
  `db.backend` ...) with a setup UI on the management port; cache routes gain a CRC suffix
  (`/title<crc>`) and a `/versionlist` route; models, animations, maps and music now stream
  over the game WebSocket (`client.state === 2` handled by `OnDemand.onClientData`) through
  `public/client/ondemandworker.js`. Prisma schema has the same 14 tables. Hiscore tables are
  written only by `LoginServer.ts`, so single-world mode (`login.enabled=false`) records no
  hiscores.
- Client 225 to 274: 222 commits, 136 files (dash3d 49, config 13, graphics 13, client 11,
  io 11). New `io/OnDemand.ts` and `io/OnDemandWorker.ts`. `Client.ts` is 11 928 lines.
  All fourteen `Client` members our Task 10 hooks reference exist unchanged in 274:
  `b12`, `imageTitlebutton`, `statXP`, `statBaseLevel`, `loginUser`, `loginPass`,
  `loginSelect`, `loginMes1`, `loginMes2`, `login`, `logout`, `ingame`, `loopCycle`, `fps`,
  `addChat`. The `graphics/` directory has no renderer abstraction.
- Content 225 to 274: 649 commits, mostly `maps/`. Data only; repack about 7 minutes.
- Client-TS side branches: `225-gpu` (17 commits, 41 files: `graphics/renderer/` with a
  static `Renderer` facade, WebGL and WebGPU back ends, requestAnimationFrame loop; 27 commits
  behind 225 tip) and `225-custom` (1 commit: `REBUILD_REGION` for instanced regions).
- `MaxBittker/rs-sdk` (MIT, ~785 stars, active): fork of Lost City 274 with
  `server/webclient/src/bot/` (`StateCollector.ts` 68 KB, `ActionExecutor.ts` 25 KB,
  `reach.ts`, `formatters.ts`, `types.ts`), a username-keyed gateway on ws :7780 with
  `control` and `observe` modes, `sdk/` high-level actions and A* pathfinding over an exported
  collision pack, an MCP server (`execute_code`, `list_bots`, `disconnect_bot`), a headless
  `lite/LiteClient.ts` that runs the same StateCollector without a browser, and
  `server/PATCHES.md` listing every engine and client modification. Their gameplay patches
  (25x XP, no random events, infinite run, removed auto-bans) are not wanted.
- Browser overlays and wrappers: `RemesTop/LostXP` (Tampermonkey XP tracker and HUD by
  hooking the `Client` instance; no license), `Operativekiwi/2004scape-extension` (Chrome
  extension with a plugin tab bar: quest helper, skill calculator, item, player and market
  lookup, world selector, notes, IRC chat; no license), `LostHQ/LostKit-Electron` (GPLv3
  desktop wrapper: hiscores, world switcher, stopwatch, notes, screenshots, AFK timer).
- Other bot projects: `dginovker/LostCityClientBot` (MIT, subset of rs-sdk),
  `dginovker/LostCityServerBots` (MIT, server-side roaming bots), `rs2b2t/rs2b0t` (MIT,
  behaviour-tree task base, scripts loaded by URL, anarchy fork), `MomoStudios/momobot-spectator`
  (MIT, rs-sdk observe mode plus canvas streaming behind a Cloudflare Tunnel).
- RuneLite plugin hub top installs at research time: Quest Helper, 117 HD, Sailing, Tile
  Packs, GotR Helper, ToA, WikiSync, Better NPC Highlight, Zulrah, Gauntlet, Mahogany Homes,
  Tempoross, Giants' Foundry, Party Panel, Banked Experience, Rogues' Den, Mixology, Bank Tag
  Layouts, Port Tasks, Fight Cave Waves, Hunter Rumours, Skills Progress, Wilderness Player
  Alarm, Inventory Setups, Equipment Inspector, Totem Fletching, Fight Caves Predictor,
  Shortest Path, Radius Markers, Barrows Doors.

## 3. Decisions (all approved 2026-09-05)

| # | Decision | Ruling |
|---|---|---|
| 1 | When to migrate to 274 | After Task 13, before Task 14. SP1b. |
| 2 | Tracker storage | Front-server SQLite (`bun:sqlite`) `data/tracker.db`. Firestore keeps identity only. |
| 3 | Hiscore feed | Client snapshots via hooks, ingested by the front server with sanity checks. Ingest is source-agnostic so an engine feed can replace it later. |
| 4 | Observe/act layer | rs-sdk's client bot module and `sdk/` actions vendored as the base. Our own transport, gateway, auth and runners on top. |
| 5 | Task runner | Dual: browser runner in the shell and MCP runner for Claude Code, one task API. |
| 6 | Unlicensed extensions | Reference only. Data regenerated from our Content pack. Credits page records inspiration versus vendored code. |
| 7 | Pairing and gateway shape (merge of the entry-screen spec, 2026-09-05) | Entry-screen spec's `pairTokens` → `agentTokens` model, `/pair/<token>` skill document, and hosted MCP at `/mcp` over Streamable HTTP are authoritative. SP4's earlier local `agent/` package and `/agent` socket are dropped. Task code runs only in the browser tab's Worker; `/mcp` reaches it through a `/tab` socket. Decision 5's "dual runner" becomes one runner with two callers. Agent tokens gain an owner-controlled `mode` (`observe` default, `control`). |

Why rs-sdk is a safe base long term: the parts we vendor (state collection, action execution,
reachability, world-state types, high-level actions, pathfinding) read the same `Client`
fields our hooks already touch and are transport-agnostic. The parts where our architecture
differs (a human in the tab, Firebase identity, pairing, an in-browser runner, a front server
that owns the public port) are all in the transport and hosting layer, which we replace.
Nothing we build sits on top of their gateway, so a later divergence does not strand us.

## 4. Sub-project sequence

| Sub-project | Delivers | Depends on |
|---|---|---|
| SP1 (in flight) | Tasks 11 to 13: shell, frame, panels. Then Tasks 14 to 17 on 274. | — |
| SP1b | Revision 274 across engine, content, client fork, scripts, front server. Custom content overlay mechanism. | Tasks 11 to 13 |
| SP2 | Plugin framework (shell and client tiers), settings persistence, Plugins panel, Tier 1 plugins including the GPU renderer port. | SP1b, Task 14 |
| SP3 | Snapshot ingest, tracker database, hiscores and player pages, Hiscores panel, XP Tracker link. | SP2 (XP Tracker plugin), bridge from SP1 |
| SP4 | Vendored rs-sdk bot module in the client, `/tab` socket and hosted `/mcp` gateway in the front server on top of Task 13b's tokens, task API, browser runner, Tasks and Claude panels, chat mirror. | SP2 framework, SP1b, Task 13b |
| SP4b (done 2026-09-07) | Bot expansion: task-scoped abort, a build-time resource atlas and collision bitset with a real pathfinder over them, `c.find` and `c.travel`, a health monitor and recovery ladder covering death, loot and re-login, player-owned bot behaviour settings, per-script toggles, live run detail, run history with per-run reports and export, the three library scripts rebuilt on discovery, the Tutorial Island script, and the first real-stack Playwright runs any of the bot work has had. Plan: `docs/superpowers/plans/2026-09-06-sp4b-bot-expansion.md`. What it built, what it did not, and what the live stack taught are in that spec's section 9. | SP4, SP7 |
| SP5 | Tier 2 plugins that need scene projection (tile markers, highlights, idle notifier, shortest path, menu swapper, world map) and the headless LiteClient runner. | SP2, SP4 |
| SPW | Wiki corpus extracted from Content and Engine, `/wiki` reader linked from the title bar, `/api/wiki` question-shaped query API, authoring backlog for gap fills. Revision-independent; can start after Task 14 and run beside SP1b, re-extracting on 274. MCP tools land inside SP4. | Task 13b (agent tokens for API auth); SP4 for MCP tools only |
| SP6 | Firebase-owned characters (guest 2, registered 3), principal module, home page with guest/login/signup, player count, patch notes, no-character gate, single-client switch, guarded deletion. Plan: `docs/superpowers/plans/2026-09-05-sp6-accounts-and-characters.md`; design: `docs/superpowers/specs/2026-09-05-multi-character-platform-design.md`. | Nothing new |
| SP7 | Iframe per character (`web/play.html`), session manager with render suspend, character tab strip in the frame (guest 2 / registered 3 slots, locked guest slot, "coming soon"), name-first login for guests, single "Login" title button (client patches 22-27), per-character trackers and task runtime, throttling and memory measurements. Plan: `docs/superpowers/plans/2026-09-05-sp7-character-tabs-and-sessions.md`. | SP6. The mute toggle and `setAudioMuted` are **not** in SP7 as built (neither the owner requirements nor the SP7 addendum's decision table include them); they move to a later sub-project. |
| SP8 (done 2026-09-06) | `engine-custom/` overlay and `scripts/engine-overlay.ps1`, owner assertion on login, staff allow-list instead of a build flag, owner-keyed shared bank store with the one-time `.sav` migration, engine management routes, and the front server's `GET /api/bank` / `POST /api/bank/ops` / `POST /internal/bank-changed`. Plan: `docs/superpowers/plans/2026-09-05-sp8-engine-overlay-and-shared-bank.md`. The production changes it documents rather than makes are in `README.md`, "Deploy: engine overlay and production hardening". | SP6 |
| SP8b (done 2026-09-06) | The web bank: 2007scape-styled window over the stage, item-icon tabs, drag and keyboard reordering, per-tab sort helpers, an OSRS right-click menu with registrable Contracts entry points, live updates over `GET /api/bank/events` with polling behind them, and client patch 28 for item art. Plan: `docs/superpowers/plans/2026-09-06-sp8b-web-bank.md`. Deviations from the spec are recorded in that spec's section 12. | SP8, SP7 |
| SP8c | The GAME client's half of the bank tabs: a tab-range draw plus divider lines in `Client.ts`, the `bank_main.if` tab components and `bank.rs2` handlers in `content-custom/`, then drag-to-tab and in-game search. Owner decision 3 keeps the SORT helpers out of it. | SP8b |
| SP9 | Contracts: economy db, escrow settlement, market queries, web UI, agent tools and policy. | SP8, SP4 |
| SP10 | Raw coin and estimated wealth hiscores on the SP3 tracker. | SP8, SP9, SP3 |

SP4 replaces the SP1 spec's original sub-projects 2, 3 and 4. The SP1 spec's section 13 open
questions are answered in the SP4 spec.

**This table no longer owns the order.** As of 2026-09-07 the whole remaining sequence - the
unbuilt entries here plus the new work - lives in `2026-09-07-sprint-dragon-slayer.md`. This table
remains the authority on what each of SP1 through SP10 delivers and depends on; that document is
the authority on what gets built next.

**What SP8b inherits from SP8 as built.** Rulings in `engine-custom/PATCHES.md`, which is the
surviving record: SP8's SDD workspace was deleted at close under the old convention, before
`docs/superpowers/SDD.md` replaced deletion with promotion, so there is no ledger file for it. The
contract itself is stated in full below.

- **The post-apply contract.** `apply` returns the version the bank now holds, or 409
  `{ error: 'version', version }` carrying the store's current version, and that number is
  immediately reusable as the next `expectedVersion`: the following tick's sweep consumes the
  apply's dirt without bumping again, and for that one tick pushes the store's tab layout out to
  every online character of the owner instead of reading their varps in. The next bump comes only
  from a later in-game change or a later apply. On 409 the client refetches the snapshot at the
  returned version and re-issues its ops.
- **That push-out is armed by ANY apply**, not only one that touched the tabs, so a client
  applying on most ticks (one op per drag) holds the owner in push-out mode continuously, and for
  as long as it does, in-game tab rearrangement by that account's characters cannot land. Batch
  the ops, or accept that. Where an in-game tab drag and an external apply collide in one tick,
  the web caller wins on the layout; the item change behind the in-game action is kept and folded
  into the apply's version.
- **Cross-character updates are live, not stale.** The owner container sits outside `player.invs`
  and the overlay resets its tracking after client output, so every online character of the owner
  receives the same inventory diff in the same tick.
- **Reads and writes are human-only in SP8.** An agent bearer is refused with `403 human_only` on
  both `/api/bank` routes, and `POST /api/bank/ops` accepts only the five layout ops (`swap`,
  `insert`, `moveToTab`, `setTabs`, `sort`), never a `delta`. Agent reads and SP9's item movement
  go through the server-side management client (`server/src/engine/managementClient.ts`), which is
  also the module SP8b's spec calls `server/src/bank/engine.ts`.
- **There is no `GET /api/bank/events` yet.** The engine's change hook posts `{ ownerKey, version }`
  to the front server's `POST /internal/bank-changed`, which updates a per-owner version map; SP8b
  turns that into the SSE stream. The hook is fire and forget, so keep the fallback poll: a front
  server that was down during a mutation only learns the new version on its next `GET /api/bank`.

**What SP9 inherits from SP8b as built.** The menu registry (`createMenuRegistry` /
`contractsStubs` in `web/src/bank/contextMenu.ts`), the two entry ids `sell` and `buy` it ships
disabled with "Contracts coming soon", and the `MenuItemContext` those entries receive. SP9
registers over both ids and owns tradeability itself, since it owns the escrow; the full account
of what SP8b built versus the design it started from is `docs/superpowers/specs/2026-09-05-sp8b-web-bank-design.md` section 12.

## 5. Conventions carried forward

Unchanged from the SP1 spec section 8: strict TypeScript, no new `as any`, ESLint flat
config, Vitest or `bun test` per package, conventional commits, files under 400 lines,
`types.ts` per package, `.env.example` per process, upstream clones never edited and pinned in
`scripts/upstream.lock`. Additions:

- Vendored third-party code lives in `<package>/vendor/<project>/`, keeps its license file,
  and is listed in `CREDITS.md` with the upstream commit. The 400-line rule does not apply
  inside `vendor/`. Local modifications to vendored files are recorded in
  `<package>/vendor/PATCHES.md` in the style of rs-sdk's own checklist.
- Plugin ids are kebab-case and stable; they appear in Firestore paths.
- Generated data (quest steps, XP tables, item names) is built from the Content pack by a
  script under `scripts/gen/` and committed, with the generator's input commit recorded.

## 6. Credits policy

`CREDITS.md` has two sections. "Vendored" lists code we ship, with project, license, upstream
commit, path in our tree, and whether it is modified. "Inspiration" lists projects whose ideas
or feature sets shaped ours without any code taken. Every task that adds to either updates the
file in the same commit.
