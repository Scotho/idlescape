# Credits

Idlescape stands on the Lost City preservation project and on the community around it. This
file records what we ship from other projects and what we learned from them. Every task that
vendors code or borrows an idea updates this file in the same commit.

## Foundation (used as pinned upstream clones or a tracked fork)

| Project | License | What we use | Modified? |
|---|---|---|---|
| [LostCityRS/Engine-TS](https://github.com/LostCityRS/Engine-TS) | MIT | The game server, cloned at the sha in `scripts/upstream.lock` | Yes, since SP8. The clone itself is still never hand-edited: `engine-custom/` is a tracked overlay copied over it by `scripts/engine-overlay.ps1`, replacing five upstream files and adding our own `src/idlescape/` and `tools/pack/` files. No third-party code is vendored by it. Every change is listed in `engine-custom/PATCHES.md`, the same contract as `client/PATCHES.md`. |
| [LostCityRS/Content](https://github.com/LostCityRS/Content) | MIT | Game content, cloned at the pinned sha | No. Our additions live in `content-custom/` and are copied over at pack time. |
| [LostCityRS/Client-TS](https://github.com/LostCityRS/Client-TS) | MIT | The browser client, tracked as a fork in `client/` | Yes. Additions are confined to `client/src/hooks/`, `client/src/plugins/`, `client/src/vendor/`, and the call sites listed in `client/PATCHES.md`. |

## Vendored (code we ship, kept under `vendor/` with its license)

| Project | License | Upstream commit | Our path | Modified? |
|---|---|---|---|---|
| [MaxBittker/rs-sdk](https://github.com/MaxBittker/rs-sdk) | MIT | `56b73e08fc01a1d683d7a86d145a494ae945d071` | `client/src/vendor/rs-sdk/bot/` (types, StateCollector, ActionExecutor, ActionQueue, reach, formatters + their tests) and `client/src/vendor/rs-sdk/lite/movement.ts` (test-only router the `reach` differential test compares against) | Yes: a provenance header on every file, one test import path, the `ClientInteraction` test's packet-opcode fake, and `movement.ts`'s `LiteClient` type. The six production modules are otherwise byte-identical to upstream. Every change listed in `client/src/vendor/PATCHES.md`. |
| [MaxBittker/rs-sdk](https://github.com/MaxBittker/rs-sdk) | MIT | `56b73e08fc01a1d683d7a86d145a494ae945d071` | `web/src/vendor/rs-sdk/sdk/` (the agent-facing SDK: types, index, actions, actions-helpers, action-quantity, spells, trade-helpers, chunking, chat-history) | Yes: a provenance header on every file, and `index.ts` rewired off the rs-sdk gateway WebSocket onto our `Transport` (connection lifecycle, browser auto-launch, status polling and the screenshot round-trip deleted). The other eight files are otherwise byte-identical to upstream. `sdk/pathfinding.ts` is ours, not vendored: it keeps upstream's exported names and signatures, and answers them with a breadth-first search over the collision bitset our own generator writes (`web/src/data/collision.bin`), instead of upstream's A* over a collision dump run through the native `rsmod-pathfinder`, neither of which we ship. Every change listed in `web/src/vendor/PATCHES.md`. |

rs-sdk's gateway, MCP server, overlay UI, headless lite client and gameplay patches are not
shipped: `lite/movement.ts` is vendored for a test only, never imported by the runtime. Its
`execute_code` tool shape, `observe` and `control` connection modes, the generated `API.md`
resource, and the `PATCHES.md` checklist practice are used as designs.

## Evaluated, not taken

Earlier versions of this file claimed both of these as ported. Neither was. No code from either
branch is in this repository.

| Project | License | What happened |
|---|---|---|
| Client-TS branch `225-gpu` (Lost City contributors, with WebGL work by dennisdev) | MIT | Studied in a spike (`docs/superpowers/specs/2026-09-05-sp2b-gpu-spike-findings.md`) as the basis for a GPU renderer plugin. The renderer was never built. |
| Client-TS branch `225-custom` | MIT | Its `REBUILD_REGION` support for instanced regions was considered for the 274 port. The pinned 274 engine never emits the packet, so nothing was ported. |

## Inspiration (ideas and feature sets, no code taken)

| Project | License | What inspired us |
|---|---|---|
| [RuneLite](https://runelite.net) and its plugin hub | BSD-2-Clause | The frame, side panel, icon strip, plugin toggles with per-plugin settings, and the plugin catalogue we ranked feasibility against: Quest Helper, Tile Packs, NPC highlight, XP tracker, Loot tracker, Boosts, Idle notifier, Shortest Path, Menu entry swapper, Screen markers, Notes, GPU. |
| [CrystalMathLabs](https://crystalmathlabs.com) | proprietary service | The tracker model: snapshots on update, gains over periods, records, update on request. |
| [RemesTop/LostXP](https://github.com/RemesTop/LostXP) | none stated | XP/hr tracking by hooking the client instance, the draggable HP, prayer and energy HUD, separate session and rate resets. |
| [Operativekiwi/2004scape-extension](https://github.com/Operativekiwi/2004scape-extension) | none stated | A plugin tab bar over the web client with a tiny plugin contract; the panel set: quest helper, skill calculator, item and player lookup, market lookup, world selector, notes. Our data is regenerated from the Content pack, not copied. |
| [LostHQ/LostKit-Electron](https://github.com/LostHQ/LostKit-Electron) | GPL-3.0 | Hiscores lookup, stopwatch and AFK timer, notes, screenshot capture as player conveniences. |
| [xVye/chrome-2004scape](https://github.com/xVye/chrome-2004scape) | none stated | World status in a browser extension popup. |
| [rs2b2t/rs2b0t](https://github.com/rs2b2t/rs2b0t) | MIT | Behaviour-tree and priority task bases, out-of-tree scripts loaded by URL, outcome checking after every action. |
| [chsami/Microbot](https://github.com/chsami/Microbot) | BSD-2-Clause | `sleepUntil` over fixed sleeps, a single `Microbot.status` line the UI reads, a state-machine script base that snapshots the world when a step stalls, pause-all across every running script, and an agent server that drives the client from outside. |
| [OSRSB/OsrsBot](https://github.com/OSRSB/OsrsBot) | GPL-3.0, ideas only | Script lifecycle (`onStart`/`loop`/`onEnd`) and the provider layout that keeps world queries apart from actions. |
| [powerbot](https://powerbot.org) (the RSBot lineage) | GPL-3.0, ideas only | `@ScriptManifest` metadata on the script itself, a `loop()` that returns the delay until the next iteration, and a paint overlay for what the script is doing. |
| [dginovker/LostCityClientBot](https://github.com/dginovker/LostCityClientBot) and [LostCityServerBots](https://github.com/dginovker/LostCityServerBots) | MIT | A Claude Code driven client, research and botting tip files kept next to the code, server-side roaming bots for a populated world. |
| [MomoStudios/momobot-spectator](https://github.com/MomoStudios/momobot-spectator) | MIT | Read-only spectating through an observe-mode connection, sanitised public state, canvas streaming behind a Cloudflare Tunnel. |
| [NoHandlebars87/2004scapeDocker](https://github.com/NoHandlebars87/2004scapeDocker) | none stated | A compose file with a revision switch, and the Bun AVX pitfall note. |
| [LostCityRS/RuneScriptLanguage](https://github.com/LostCityRS/RuneScriptLanguage) | MIT | RuneScript editing support we recommend for content work. |
| [Old School RuneScape Wiki](https://oldschool.runescape.wiki) | CC BY-NC-SA 3.0 | Page anatomy, section order and editorial voice for our wiki. No text or data copied; cited as a modern analogue where our pack cannot answer. |
| [LostHQ](https://2004.losthq.rs) | not stated | Scope of a Lost City reference site. No data copied. |

### Sources

Every claim on a wiki page (`/wiki`) carries a citation, shown as a numbered footnote. The
kind before the colon says where it came from: `content` and `engine` are lines in the pinned
Content and Engine clones; `derived` is a value our own extractor computed from those; `cited`
is a URL the Content authors themselves attached to an entity as their own provenance (a quest
journal scan, a credited screenshot) and is not something we went looking for; `period` is a
contemporaneous (2004-2006) source we located ourselves, cited by URL and never copied from;
`modern` is the current OSRS Wiki or a similar reference, used and cited as a labelled modern
analogue only where the pack and period sources are both silent; `editorial` is our own
judgement call, dated. See `wiki/AUTHORING.md` for the full authoring process.

## Design, type and tools

| What | From | License or terms | Where |
|---|---|---|---|
| The shell v2 design bundle | A design handoff made for this project, vendored 2026-09-06 | Project material; provenance in `docs/design/idlescape-shell-v2/PROVENANCE.md` | `docs/design/idlescape-shell-v2/`, a reference and never imported |
| Pixelify Sans | Stefie Justprince | SIL Open Font License 1.1 | Loaded from Google Fonts by `web/index.html`; not stored here |
| Idleon | Lavaflame2 | proprietary game, ideas only | The other half of the pitch: several characters on one account, progressing while you are not at the keyboard. No code, art or data taken. |

Libraries are installed from npm and are not vendored. The main ones and their licenses are listed
in [`NOTICE.md`](NOTICE.md) section 3.

## The game itself

RuneScape was made by Jagex Ltd, and the 2004 game this project runs is theirs. idlescape is a
fan project, not affiliated with or endorsed by Jagex. No original game assets are stored in this
repository; see [`NOTICE.md`](NOTICE.md) section 4.

## How it was written

Every line of idlescape's own code was written by AI models in autonomous agent sessions, under
the owner's direction, through [Claude Code](https://claude.com/claude-code). By commit, in the
private working history:

| Model | Commits co-authored |
|---|---|
| Claude Fable 5.1 | 419 |
| Claude Opus 5 (1M context) | 126 |
| Claude Opus 4.8 | 80 |

The session workflow is built on the [superpowers](https://github.com/obra/superpowers) skills by
Jesse Vincent (MIT): brainstorming, plans, subagent-driven development and review. The skills
under `.claude/skills/` are ours and are written in that shape.

## People

Thanks to Pazaz and the Lost City team for the engine, content and client and for keeping the
history of the game open; to Max Bittker and the rs-sdk contributors for showing what an
agent-facing client looks like; and to the Lost City community tool authors above for years of
quality-of-life work we could learn from.
