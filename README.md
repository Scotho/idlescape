# idlescape

**Old School RuneScape crossed with Idleon, through client-side scripts.**

A 2004 RuneScape world you can play by hand, and an idle game you build yourself on top of it: write
a script, point it at a character, and it chops, fishes, banks and levels in a tab while you do
something else. Several characters per account, each in its own session, all feeding one shared
bank. The scripts run in your browser, in a sandbox beside the game canvas, against a private
server where automating your character is the intended way to play.

Play it: **https://osrs.scotho.com**

> ## This project is unfinished
>
> idlescape is a work in progress and the source is published as-is. Things are half built, some
> documents describe features that were never made, and there are rough edges everywhere. The live
> site can be reset or switched off at any time. No promises on issues, pull requests or support.
> If something here is useful to you, take it and run.
>
> It comes with **no warranty of any kind**. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).

> **An agentic coding experiment.** Every line of idlescape's own code was written by AI models in
> autonomous agent sessions, with the owner giving direction and ruling only on blockers (see
> [How it was built](#how-it-was-built)). The specs, plans, ledgers and skills under `docs/` and
> `.claude/` are the machinery of that experiment, left in on purpose. **Use them as a reference**,
> not as a template.

idlescape is a fan project. It is not affiliated with or endorsed by Jagex, and it stores none of
the original game's assets. It stands on [Lost City](https://github.com/LostCityRS), whose engine,
content and client it is built from. **[CREDITS.md](CREDITS.md) lists everyone this project owes.**

## What's in here

- **The game.** A pinned clone of the Lost City TypeScript engine (RuneScape 2 build 274, November
  2004) and a fork of the Lost City TypeScript browser client.
- **The shell.** A Vite and vanilla TypeScript frame around the game canvas, RuneLite-style: side
  panels, an icon strip, plugins with per-plugin settings, an XP tracker, a loot tracker, a status
  HUD.
- **Scripts.** A runtime that runs player-written scripts in a Web Worker, with every action
  crossing `postMessage` into a transport the page owns. A bundled script library, and a Tutorial
  Island script.
- **Characters.** Accounts through Firebase, guest play, several characters per account, one game
  session per character in its own tab.
- **The shared bank.** An overlay on the engine that gives one owner a bank shared across their
  characters, and a web bank window outside the game canvas.
- **A wiki.** A corpus generated from the game's own content, with a reader and a query API, every
  claim cited.
- **Letting Claude play.** A pairing flow and an agent-facing API, the same one scripts see.

## Rough state of things

Works:

- Logging in, guest or registered, and playing the 2004 game in the browser
- The shell, five of the nine planned first-tier plugins, the design system and its styleguide
- The script runtime, the task panels and the bundled library
- Several characters, character tabs, the shared owner bank and the web bank
- The wiki corpus, reader and query API
- The unit suites and the browser suite, behind one `npm run verify`

Half done:

- **The Tutorial Island script and the bot expansion**: in flight
- **The script API reference**: the sprint was paused partway through writing it
- **Wiki authoring**: five written pages against a long generated backlog
- **Tracker service**: the client-side trackers shipped, the server half did not

Designed, never built:

- **Hiscores**, the **MCP gateway** at `/mcp`, the **Script Studio**, **Contracts**, the **GPU
  renderer**, the **Battlebots** arena, **Time Candy**, client bank tabs

There is no offline progress. A script runs while its tab is open, and stops when it closes.

Known mess:

- `docs/` is the working record of the agent sessions. It is large, and parts of it are out of date
  or describe plans that changed. `docs/README.md` says which document is the authority for what.
- The deploy scripts assume one Lightsail box behind a Cloudflare tunnel, and Windows PowerShell 5.1
  on the operator's side.
- Setup has only ever been run on the author's machine.

## Run it

**Prerequisites:** Windows with PowerShell 5.1, Git, Node 24+ (runs the engine through `npx tsx`),
Bun 1.4 at `%USERPROFILE%\.bun\bin` (runs the front server and the client build), and Java with the
Firebase CLI for the emulators.

```powershell
git clone https://github.com/Scotho/idlescape.git
cd idlescape
copy server\.env.example server\.env
copy web\.env.example web\.env.local
npm run setup    # clone the Lost City engine and content at their pinned shas, install, pack once
npm run dev      # emulators, engine, client build, front server, vite dev
```

Then open `http://localhost:8787`. Local play runs entirely against the Firebase emulators and
needs no account anywhere.

```powershell
npm run build    # the three shippable artifacts, plus the generated-data drift gates
npm run verify   # the acceptance gate: every unit suite, a production build, browser e2e
```

| Command | What it proves | The trap attached to it |
|---|---|---|
| `npm run setup` | The pinned clones exist at `scripts/upstream.lock`'s shas, dependencies are installed, and the cache is packed | Idempotent, but the first pack takes about seven minutes. It force-checks the clones out, so anything hand-edited inside `engine/` is lost here |
| `npm run dev` | The stack runs locally: front server 8787, engine 8899, engine management 8897, emulators 9099 and 8080, vite 5173 | The client bundle must be built **after** the engine reports `World ready`, which is why the script waits. Start the Firebase emulators from PowerShell, never from a bash subshell, or they die silently |
| `npm run build` | `web/dist`, `client/out` and `wiki/build/wiki.db` build, `scripts/gen` typechecks, the committed `atlas.json`, `collision.bin` and `doors.json` still match the pinned content, and `wiki/data/274` was extracted from the pinned content sha | The `--check` generators run from the **repository root**; their typecheck runs from `web/`. `npm run build` in `web/` builds against real Firebase, which is correct only for what ships. Use `npm run build:e2e` for local play and Playwright |
| `npm run verify` | Ten steps: the 400-line ceiling; both clone pins, both overlays and their drift checks, all four `PATCHES.md` records and the engine suites; the client fork's typecheck; client unit tests; server; web (three typecheck programs, then lint and vitest); firebase rules; wiki; build; then Playwright against a stack it brings up itself | It answers about **this working tree**, never about a release image, and step 10 rebuilds `client/out` unminified over the bundle step 9 checked. Playwright must run from `web/`; from the root it reports "No tests found" and exits 0 |

[`docs/VERIFICATION.md`](docs/VERIFICATION.md) is the authority on all of it, including the greens
that lie. [`docs/OPERATIONS.md`](docs/OPERATIONS.md) has the ports, hosts, secret locations, stack
timings and the worktree hazard.

Things to know:

- **Use the emulators.** `web/.env.production` holds placeholders. To host your own copy, make your
  own Firebase project and put its web config there.
- **The engine and the game content are not in this repository.** `npm run setup` clones them from
  Lost City. You get them from Lost City, under their license.
- **Secrets are yours to generate.** Every `.env.example` documents its keys; nothing real is
  tracked. See [SECURITY.md](SECURITY.md).

## Where things are

| Path | What it is | Authority |
|---|---|---|
| `web/` | The Vite shell: frame, panels, plugins, bank window, character tabs, agent runtime host, styles | `docs/superpowers/specs/2026-09-04-idlescape-platform-design.md`; skill `idlescape-plugin` |
| `web/src/agent/`, `web/src/tasks/` | The script sandbox, the runtime and the bundled script library | skill `idlescape-library-script` |
| `server/` | The Bun front server, the only public surface: principal, characters, pairing, bank routes, wiki reader and API, engine proxy | `server/.env.example` |
| `client/` | Fork of LostCityRS/Client-TS, revision 274. Tracked as plain files | `client/PATCHES.md`; skill `idlescape-client-patch` |
| `engine/` | Pinned, git-ignored clones: `engine/server` (Engine-TS) and `engine/content` (Content) | `scripts/upstream.lock`. **Never edited** |
| `engine-custom/` | Tracked overlay over `engine/server`: owner assertion, staff allow-list, shared owner bank, management routes | `engine-custom/PATCHES.md`; skill `idlescape-engine-overlay` |
| `content-custom/` | Tracked overlay over `engine/content`: RuneScript, interfaces, pack ids | `content-custom/README.md`; skill `idlescape-content-overlay` |
| `firebase/` | Firestore rules, indexes, emulator config, rules tests | `firebase/firestore.rules` |
| `wiki/` | Corpus generator, authored pages, reader data | `wiki/AUTHORING.md` |
| `scripts/` | `setup.ps1`, `start-stack.ps1`, `build.ps1`, `verify.ps1`, the two overlay scripts, `upstream.lock`, and `gen/` | `docs/VERIFICATION.md` |
| `deploy/` | Docker compose and Dockerfiles, the Lightsail runbook and scripts, the Cloudflare tunnel config | `deploy/lightsail/README.md` |
| `docs/` | Specs, plans, promoted ledgers, measurements, the sprint board, the design bundle | `docs/README.md` |
| `.claude/skills/` | The nine project skills, each naming its own authority and verification command | `docs/README.md` |

## Never edited

| Path | Change it instead by |
|---|---|
| `engine/server`, `engine/content` | A file in `engine-custom/` or `content-custom/`, listed in that overlay's `manifest.json` with the upstream hash it was authored against, applied by `scripts/engine-overlay.ps1` or `scripts/content-overlay.ps1`, and documented in `PATCHES.md` behind an anchored grep. `scripts/setup.ps1` replaces both clones wholesale, so a direct edit is silently lost |
| `client/src/client/Client.ts` | A **numbered patch** recorded in `client/PATCHES.md`, described by surrounding code rather than line number, with a grep that proves it is still applied. Numbering is at 28 |
| `client/src/vendor/`, `web/src/vendor/` | A logged deviation in that directory's `PATCHES.md`, with the upstream license kept and the project credited in `CREDITS.md` |

## Generated map data

`scripts/gen/` reads the pinned `engine/content` clone at build time and writes four committed
files that the script layer needs and nothing else can produce:

| Output | What it is |
|---|---|
| `web/src/data/atlas.json` | Where the map's resources are: 1 520 clusters of trees, rocks, fishing spots, banks, furnaces, anvils, ranges, altars and cooking fires, plus 44 landmarks and 2 routes |
| `web/src/data/collision.bin` | One walkability bit per tile per level, over 483 map squares |
| `web/src/data/doors.json` | Every openable door, 2 653 of them |
| `web/src/tasks/library/tutorialIsland/steps.ts` | The Tutorial Island chatbox titles, in the order the content calls them |

Re-run them when the pinned content moves (a new sha in `scripts/upstream.lock`), and only then:

```powershell
bun scripts/gen/atlas.ts
bun scripts/gen/collision.ts
bun scripts/gen/tutorial-steps.ts
```

`scripts/build.ps1` runs all three in `--check` mode and **fails the build on drift**. Run them
from the repository root: from any other directory they exit 0 without checking anything.

## Deploying

The author's copy runs on one AWS Lightsail box behind a Cloudflare tunnel; nothing on the box
publishes a host port. The runbook, with provisioning, release, preview, cutover, rollback and
secret rotation, is [`deploy/lightsail/README.md`](deploy/lightsail/README.md). The identifiers in
it are placeholders in the public repository. Expect to adapt it.

## Where the documents are

| | |
|---|---|
| [`docs/README.md`](docs/README.md) | The index: the authority for every subject, the reading order, every spec and plan with its status |
| [`docs/VISION.md`](docs/VISION.md) | What idlescape is, who it is for, the principles that decide arguments, and what is out of scope |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Processes, packages, boundaries, data flows, generated artefacts, the build and release paths |
| [`docs/VERIFICATION.md`](docs/VERIFICATION.md) | Three tiers of verification, and the false greens |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | Ports, hosts, secrets, timings, the worktree hazard |
| [`docs/superpowers/SDD.md`](docs/superpowers/SDD.md) | How a sub-project keeps and promotes its ledger |
| [`CLAUDE.md`](CLAUDE.md) | The compressed version, for an agent session that has read nothing else |

## How it was built

idlescape was built between 2026-09-04 and 2026-09-27, entirely by autonomous agent sessions
through [Claude Code](https://claude.com/claude-code). The owner gave direction; the sessions wrote
the specs, the plans, the code, the tests and the reviews, and recorded every ruling they made.

| Model | Role |
|---|---|
| Claude Fable 5.1 | Most of the work: about two thirds of the commits |
| Claude Opus 5 (1M context) | About a fifth |
| Claude Opus 4.8 | The first days, and the rest |

The public repository starts from one release commit on top of the Lost City client commit the
fork began from. The full working history is kept privately.

It began as a check on one claim: that there is an OSRS-style game server written in TypeScript
with a matching TypeScript browser client, runnable locally. The claim was real. The project is
**Lost City** (formerly 2004Scape). It targets RuneScape 2 build 274 rather than the 2007 build Old
School RuneScape is based on, and it is the closest actively maintained pairing of an open-source
TypeScript server and browser client. Alternatives evaluated and not taken:
`xrsps/xrsps-typescript` (a React and WebGL recreation, not the real protocol), `runejs/server`
(build 435, needs the Java client), and `reinismu/runescape-web-client-377` (no matching server).

## Credits

- **[Lost City](https://github.com/LostCityRS)**: the engine, the content and the client. Without
  Pazaz and the Lost City team there is no project here.
- **[rs-sdk](https://github.com/MaxBittker/rs-sdk)** by Max Bittker and contributors: the
  observation and action layers the script runtime is built on.
- **RuneLite**, **Idleon**, and a long list of community tools whose ideas shaped the shell and the
  scripting model.

All of it, with licenses and exactly what was taken from each, is in **[CREDITS.md](CREDITS.md)**.

## License

- **Our code**: [MIT](LICENSE). Copyright (c) 2026 Craig Smith.
- **Forked and vendored code** (`client/`, the two `vendor/rs-sdk/` directories): MIT, under their
  own authors' copyright, with their license files kept beside them.
- **The game**: RuneScape is Jagex's. This repository's license grants nothing in it.

The full breakdown and the disclaimers are in **[NOTICE.md](NOTICE.md)**.
