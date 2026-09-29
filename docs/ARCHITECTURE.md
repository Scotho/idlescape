# idlescape architecture

The system map. Written 2026-09-07 on `sprint/dragon-slayer`; file and line citations were read at
commit `30efd94` unless a section names a different commit. Files under `web/src/tasks`,
`web/src/agent`, `web/src/frame/copilotBar.ts` and `web/src/plugins/builtin/tasks*.ts` are moving
under sprint entry 1 (SP4b tasks 9 to 15): treat line numbers there as hints and grep for the
symbol beside them.

Read `docs/VISION.md` first for why the boundaries below exist. Environment facts (hosts, secrets,
timings, hazards) live in `docs/OPERATIONS.md` and are not repeated here.

---

## 1. Processes and ports

Five processes make a working local stack. `scripts/start-stack.ps1` starts them in this order and
that order matters (the client bundle must be built after the engine has regenerated its own
`public/client`).

| Process | Port | Started by | Notes |
|---|---|---|---|
| Firebase emulators (auth, firestore) | 9099, 8080 | `firebase/` `npm run emulators` | Skipped by `start-stack.ps1 -Prod`; `verify.ps1` starts them itself |
| Game engine (Lost City 274, Node + tsx) | 8899 | `npx tsx src/app.ts` in `engine/server` | `web.port` in `data/config/world.json`; game WebSocket and cache both on it |
| Engine management (Fastify) | 8897 | same process | `web.managementPort`; owner-bank routes added by the overlay; loopback only, never exposed |
| Front server (Bun) | 8787 | `bun run src/index.ts` in `server/` | The only public port. Serves the shell, proxies the game, owns every API route |
| Vite dev server | 5173 | `npm run dev` in `web/` | Dev only. `-Prod` serves the built bundle from the front server instead |

The wiki is not a process: it is a SQLite database at `wiki/build/wiki.db` (`WIKI_DB` in
`server/.env`) that the front server reads to serve `/wiki` and `/api/wiki`.

Port 8888 is the retired 225 proof-of-concept engine on the operator's PC. `server/.env.example:2-4`
warns explicitly never to point a dev front server at it.

## 2. Packages and responsibilities

| Path | What it is | Responsibility |
|---|---|---|
| `web/` | Vite + vanilla TypeScript shell (`@idlescape/web`) | The page the player sees: frame, panels, plugin registry, bank window, character tabs, agent runtime host, styles and styleguide |
| `server/` | Bun HTTP/WS front server (`@idlescape/server`) | The single public surface. Firebase principal, characters, pairing and agent tokens, owner bank routes, wiki reader and query API, static and cache proxying to the engine |
| `client/` | Fork of LostCityRS/Client-TS | The game client bundle. Vendored, edited only through numbered patches; exposes hooks the shell reads and a client-tier plugin registry |
| `engine/` | Pinned clone: `engine/server` (Engine-TS) and `engine/content` (Content) | **Never edited.** Recreated by `scripts/setup.ps1` at the shas in `scripts/upstream.lock` |
| `engine-custom/` | Overlay over `engine/server` | Owner assertion on login, staff allow-list, owner-keyed shared bank store and its `.sav` migration, management routes. `manifest.json` pins the upstream blob sha of every file it replaces |
| `content-custom/` | Overlay over `engine/content` | Custom RuneScript, interfaces and pack ids. Today it carries `pack/varp.pack` (varps 359 to 367, the bank tab sizes) and `scripts/interface_bank/` |
| `firebase/` | Rules, indexes, emulator config, rules tests | Identity and per-user documents. `firestore.rules` is the security boundary; `rules.test.ts` is its test |
| `wiki/` | Corpus generator, content and reader data | `gen/extract.ts` reads the pinned content into `wiki/data/274/*.json`; `gen/build.ts` builds `wiki/build/wiki.db`; `content/` holds authored pages |
| `scripts/` | PowerShell entry points and generators | `setup.ps1`, `start-stack.ps1`, `build.ps1`, `verify.ps1`, the two overlay scripts, `upstream.lock`, and `gen/` (atlas, collision, doors) |
| `deploy/` | Docker compose, Dockerfiles, Lightsail runbook and scripts, Cloudflare tunnel config, retired Windows task scripts | The release path. `deploy/lightsail/README.md` is the operator runbook |
| `docs/` | Specs, plans, ledgers, measurements, the sprint board, the design bundle | The project's memory. Index at `docs/README.md` |
| `live/` | A separate running instance with its own copy of the engine clones | Not part of this build and not a package. Git-ignored (`.gitignore:28`), never tracked, never edited and never read into. It is the fourth never-edited zone; `CLAUDE.md` holds that table |

## 3. The boundaries, and how each is enforced today

A boundary with no enforcement is a convention that will be broken. This table is honest about
which is which; the "not yet" rows are the project audit's findings and each names its candidate.

| Boundary | Enforced by | Status |
|---|---|---|
| `engine/` and `engine/content` are never edited | `scripts/setup.ps1` force-checks them out at the pinned sha; the overlay manifests record the upstream blob hash of every replaced file, and `engine-overlay.ps1 -Check` exits 1 on drift | Enforced for the engine. `verify.ps1`'s engine overlay step runs both the apply and the `-Check` |
| Overlay files must exist in git | `verify.ps1`'s "overlay manifest paths are git-tracked" sub-step walks **both** overlay manifests and fails on any path `git ls-files` does not know | Enforced, in the same step. It exists because the overlay is copied into a throwaway clone, so an un-added file still passes every suite on the machine that wrote it |
| Content overlay must not drift | `scripts/content-overlay.ps1 -Check`, which rehashes every manifest entry against the clone's pinned blob and exits 1 | **Enforced.** `verify.ps1`'s overlay step applies the content overlay and then runs `-Check` and reads its exit code (audit C23, closed 2026-09-08). Until then the check printed its findings and ran `exit 0` unconditionally |
| Client fork changes are numbered patches | `client/PATCHES.md`, each patch with typed `patches-check` rows that prove it is applied | **Enforced** by `scripts/patches-check.ps1`, inside `verify.ps1`'s overlay step (audit C24, closed 2026-09-08). It runs four records, asserts every numbered patch owns at least one row, and diffs `client/` against the pinned import commit. It **prints** the assertion counts and the numbering high-water mark rather than pinning them in a constant, so no document has to quote a number |
| Vendored code keeps its license and a `PATCHES.md` | `web/src/vendor/PATCHES.md`, `CREDITS.md` | Convention. `CREDITS.md` currently attributes work that does not exist (audit C14) |
| Script code never runs on the main thread | The Worker boundary in `web/src/agent/worker.ts` and `workerHost.ts`; the transport is an RPC surface, not an object handed across | Structural |
| The shared bank is human-only | `server/src/router.ts:75-76` (`principalRule` returns `'human'` for `characters` and every `bank` route); an agent bearer gets `403 human_only` | Enforced. Agent-side item movement goes through `server/src/engine/managementClient.ts` instead |
| The engine management port is loopback only | `deploy/docker/docker-compose.yml` publishes no host port; the box firewall is SSH only | Enforced in deployment. `server/.env.example:6-8` states the rule |
| Files under 400 lines | `scripts/line-ceiling.ps1`, the authority, plus `web/eslint.config.js`'s `max-lines` as editor feedback; the script asserts the two carry the same number | **Enforced** (audit C16's first third). It is `verify.ps1` step 1, a second of work, and it refuses to pass if it scanned fewer than 200 files. Six exemptions, all in that script's header; `web/styleguide.html` is the only one over the ceiling today, exempt by decision D12 |
| Pack ids are pinned by name | `engine-custom/src/idlescape/packIds.ts`, the sprint section 3 table in code, asserted by `packIds.test.ts` and by `checkPack` on both `packAll` paths | **Enforced** (audit C22, closed 2026-09-08). All four allocated packs are tracked in `content-custom/pack/`, `.gitattributes` keeps a `.pack` canonical LF with `text eol=lf`, on `git add` as well as on checkout, and `BuildOverlay.ts` and `engine-custom/src/app.ts` both run the same `checkPackDir` scan before and after packing, on top of the sha-delta guard, and `engine-custom/PATCHES.md` carries a row per call |
| Both pinned clones sit at `scripts/upstream.lock` | `Assert-ClonePins` (`scripts/lib/UpstreamLock.ps1`) | **Enforced**, and it runs **first** in `verify.ps1`'s overlay step and again in `start-stack.ps1`. Both `-Check` implementations resolve the clone's own HEAD, so on a stale clone every recorded hash agrees with the blob it was taken from and both drift checks pass vacuously; this is the check that makes them mean something |
| Deleting an overlay file removes it from the clone | The `.overlay-manifest` sidecar each overlay writes into its clone root, and `Sync-OverlayRemovals` | **Enforced** on the apply path of both overlays. A path in the previous sidecar that is no longer in the source set is restored from the clone's git objects where upstream has one and deleted where it does not; the sidecar is untracked and survives `setup.ps1`'s force checkout. An overlay source file that is in neither manifest is now a hard failure rather than a printed note |
| The wiki package is part of the product | `verify.ps1`'s wiki step (typecheck + `bun test`) and `build.ps1` step 1c (the corpus pin, the reader database, the size floor and the lint report) | **Enforced in the gates**, and in the image: `server.Dockerfile`'s `wiki-build` stage builds the reader database into `/app/wiki/build/wiki.db` (audit C09, second half). Nothing has been released from that image, so `/wiki` still 503s on the running box |

## 4. Data flows

### 4.1 Login and the owner assertion

The front server is the only thing that talks to Firebase Admin. A browser signs in with the
Firebase web SDK (`web/src/firebase.ts`, `web/src/auth.ts`), and every API call carries that ID
token. `server/src/auth/principal.ts` turns the token into a principal, and
`server/src/router.ts:73-85` decides per route whether a human, an agent bearer, either or neither
is allowed.

There is no site-wide password: the index, `/play.html`, the client bundle, the cache and the
game socket are open to any visitor, and identity starts at the principal check above. A request
to a path that does not exist answers `404`, and a human route called without a token answers
`401 {error:'unauthorized'}` before its handler runs. **Never assert that a server is current from
a status code alone**; assert on a route's own behaviour. That mistake once hid a broken SSE
fan-out for hours.

When a character enters the world, the front server signs an **owner assertion** with
`OWNER_ASSERTION_SECRET` (`server/src/auth/ownerAssertion.ts`) and the engine overlay verifies it
with the same secret (`engine-custom/src/idlescape/ownerAssertion.ts`). That is how the engine knows
which Firebase account a logging-in character belongs to, without the engine ever seeing a Firebase
token. Both halves read the secret from one place: `server/.env`, which `scripts/start-stack.ps1`
exports into the engine process (`start-stack.ps1:47-57`). They therefore cannot disagree.

### 4.2 The owner bank

One bank per **owner**, not per character. The store lives outside `player.invs` in the engine
overlay (`engine-custom/src/idlescape/ownerBank.ts`, `ownerBankFile.ts`, `ownerBankMerge.ts`), with
a one-time migration out of each character's `.sav`.

- The web side reads `GET /api/bank` and writes layout ops to `POST /api/bank/ops`
  (`server/src/bank/routes.ts`). Only the five layout ops are accepted (`swap`, `insert`,
  `moveToTab`, `setTabs`, `sort`), never an item delta.
- `apply` returns the version the bank now holds, or `409 {error:'version', version}` carrying the
  store's current version, which is immediately reusable as the next `expectedVersion`.
- **Any** apply arms a push-out for the following tick, which pushes the store's tab layout out to
  every online character of that owner instead of reading their varps in. A client applying on most
  ticks holds the owner in push-out mode continuously, and while it does, in-game tab rearrangement
  by that account cannot land. Batch the ops, or accept that.
- The engine posts `{ownerKey, version}` to the front server's `POST /internal/bank-changed`
  (authorised by loopback plus the management secret, `router.ts:50-52`), which updates a per-owner
  version map that `GET /api/bank/events` turns into an SSE stream. **The hook is fire and forget**,
  so the browser's polling fallback is not optional: a front server that was down during a mutation
  only learns the new version on its next `GET /api/bank`.

### 4.3 Characters, sessions and iframes

Characters belong to Firebase accounts: guests get two, registered users three
(`server/src/characters/store.ts`, `web/src/characters/`). Each character plays inside its own
same-origin document, `web/play.html`, routed by `server/src/router.ts` (`/play.html`) and served
like the index. `web/src/sessions/manager.ts` owns the set of live iframes and
suspends rendering for the ones that are not in front; `web/src/frame/characterTabs.ts` is the tab
strip. The measured cost of that design is recorded in
`docs/superpowers/measurements/2026-09-05-sp7-sessions.md`, which is the only measurement file in
the repository and is linked from the docs index.

### 4.4 The agent runtime

This is the piece that makes scripting and Claude the same feature.

```
panels / window.idlescape.tasks
        |
web/src/agent/workerHost.ts      main thread: owns the Worker, pushes world state in,
        |                        answers transport RPC out, exposes run control
   postMessage (rpc.ts framing, callId echoed back)
        |
web/src/agent/worker.ts          the Worker: runner, trace, run health, and a Transport
        |                        whose actions cross the boundary as RPC
web/src/agent/localTransport.ts  main thread: hooks in, hook events out (per iframe)
        |
client hooks -> the game
```

- **Worker.** `web/src/agent/worker.ts:1-3`: "Everything a script can touch lives in here ... The
  main thread never evaluates script code." It builds the run context, compiles the user script
  (`web/src/tasks/defineScript.ts`), validates params, and runs the runner.
- **What the sandbox refuses, in its own words.** Two `Transport` members are refused to script
  code and say so identically: `relogin()` resolves `{ ok: false, reason: 'not available to script
  code' }`, and `logout()` only writes a warn line into the trace
  (`web/src/agent/workerContext.ts:49, 87-88`; a third member added to that object is a decision,
  not an oversight, and `workerContext.test.ts` pins the list). Compilation refuses source over
  64 KB and strips every `import` line before evaluating
  (`web/src/tasks/defineScript.ts:39-40`), so a script imports nothing: whatever it uses is in its
  own text or arrives on `ScriptContext`. **Decision D24 rules that all of this is a guardrail,
  not a boundary** - script text runs in the Worker's own global scope, so it can forge the
  Worker's own RPC frames and reach the raw transport. What bounds the blast radius is that no
  cross-account script sharing exists, which is why D24 is a precondition on SP4c's scope.
- **Scoped transport.** `web/src/agent/localTransport.ts` holds listeners on the client's hooks and
  on the game canvas and can let go of both, because SP7 builds one per character iframe.
- **Runner and tasks.** `web/src/tasks/` holds the task API (`api.ts`), the catalogue
  (`catalogue.ts`), requirements, params, pathing (`atlas.ts`, `collision.ts`, `find.ts`) and the
  bundled library.
- **Health ladder.** `web/src/tasks/health.ts` is pure predicates over a snapshot plus a rolling
  memory; `web/src/tasks/healthMonitor.ts` is the stateful half that decides when a condition has
  newly fired and hands the runner one pending recovery at a time. Its escalation type is
  `'continue' | 're-anchor' | 'pause-stuck' | {fail}` (`healthMonitor.ts:10`). A recovery is an
  ordinary traced task, not a special case.
- **Trace and history.** `web/src/tasks/trace.ts` emits events; `web/src/tasks/history.ts` is the
  capped, persistent log of runs and their events, newest first.
- **Toggles.** `web/src/tasks/toggles.ts` is the per-script enable, per account: Firestore is the
  record, `localStorage` under `cs.script.` is the mirror. It deliberately copies the debounce, key
  shape and load precedence of `web/src/plugins/settings.ts` (`toggles.ts:1-5`), because a second
  differently-behaved persistence model for the same kind of value is how two stores end up
  disagreeing.
- **Escape is the panic key.** `web/src/frame/copilotBar.ts`'s `onKey`: Escape only ever pauses, and
  only while a script is actually running. It is forwarded from the stage into the session
  (`web/src/frame/stage.ts:108`) and is deliberately not counted as gameplay input by
  `localTransport.ts:66-68`.

### 4.5 The plugin system and the strip

Two tiers. The **shell tier** (`web/src/plugins/`) is a registry of manifests with enable/disable,
a settings schema per plugin (`types.ts:4-12`), Firestore-plus-`localStorage` persistence
(`settings.ts`), and a Plugins panel. The **client tier** (`client/src/plugins/`) is a capability
object compiled into the client bundle.

`web/src/frame/panels.ts` is the panel registry behind the icon strip: one `PanelId` per surface,
one open panel at a time, and the current one persisted under `localStorage` key `cs.panel`
(`panels.ts`). The twelve ids are pinned in `web/src/types.ts`: `xp`, `loot`, `connect`, `account`,
`config`, `plugins`, `tasks`, `marketplace`, `bank`, `events`, `notes`, `screenshot`. `characters`
was one of them until the Characters panel merged into Account; `PANEL_ALIASES` in `panels.ts`
carries a stored `cs.panel` of `characters` to `account`, permanently, because the key is only ever
rewritten by a successful open. `marketplace` keeps its id and its view and has no strip button:
it is a tab of the Automation panel, whose own plugin id is still `tasks`.

Three things a reader should know. `web/src/plugins/builtin/traceView.ts` and `tasksViews.ts` are
views, not plugins, sitting in the plugin directory: a naming exception nothing else documents.
The **client tier is dormant for this sprint** (decision D18): the registry exists, the frame
capability `_fireBeforeDraw`/`_fireAfterDraw` is a stub, and no `tier: 'client'` manifest exists
outside two test fixtures. And **the `onTick` lifecycle hook is dormant too**: `ShellPlugin.onTick`
and `registry.onTick` (`registry.ts:123`) exist, but nothing in production calls the registry
method, so a plugin that implements `onTick` is never called. The `idlescape-plugin` skill owns
that rule and the three-way distinction between the 600 ms server tick, the ~20 ms client cycle,
and `getState()`, which carries no tick at all.

### 4.6 The wiki

`wiki/gen/extract.ts` reads the pinned content clone into `wiki/data/274/*.json` (12 tracked files
of generated output); `wiki/gen/build.ts` compiles those plus the authored pages in `wiki/content/`
into `wiki/build/wiki.db`. The front server serves the reader at `/wiki` and the question-shaped
query API at `/api/wiki` (`server/src/wiki/`), both public and both answered ahead of the
principal check. The API is rate-limited to 120 requests a minute per bearer token when one is
sent, otherwise per client IP (`server/src/wiki/routes.ts`).

Bearer tokens are **not verified yet**: `createWikiAuth` in `server/src/wiki/auth.ts` takes an
optional `verifyBearer` that nothing wires, because `PairStore` has no verify-by-secret method
until SP4. Today a token only picks the rate-limit bucket (audit C28). Authoring is 5 pages against a generated gap queue in `wiki/data/274/gaps.md`.

## 5. Generated artefacts and their drift gates

Generated output is committed, so a content bump that nobody regenerated has to be caught by a gate
rather than by a player.

| Artefact | Generator | Drift gate |
|---|---|---|
| `web/src/data/atlas.json` | `scripts/gen/atlas.ts` | `bun scripts/gen/atlas.ts --check` in `build.ps1:62-65`. **Must run from the repository root** |
| `web/src/data/collision.bin`, `doors.json` | `scripts/gen/collision.ts` | `--check`, same place, same working-directory rule |
| `scripts/gen/*` types | - | `npx tsc --project ../scripts/gen/tsconfig.json`, run from `web/` (`build.ps1:55`). Bun strips the generators' types without checking them, and `web/tsconfig.json` covers only `web/src` |
| `wiki/data/274/*.json` | `wiki/gen/extract.ts` | `build.ps1:1c` asserts `manifest.json`'s `contentSha` equals `scripts/upstream.lock`'s `engine/content` sha, which catches a content bump nobody re-extracted. A hand-edited data file needs `bun wiki/gen/extract.ts --check-full`, a full re-extract, which is tier 3 |
| `web/src/tasks/library/index.ts` `HELPERS` | Hand-transcribed from `loopHelpers.ts` | **A test that covers four helpers and one branch of one of them** (`librarySource.test.ts:28-41`, audit C25). Generating it at build time with a `--check` is the proposal |
| `engine/server/public/client/*` | The engine's own `BUILD_STARTUP` | Rebuild the client bundle after the engine is up, which is why `start-stack.ps1` orders it that way |

## 6. Build and verify

`scripts/build.ps1` produces the three shippable artifacts and gates the generated data:

1. `npm run build` in `web/` (this is `tsc --noEmit && vite build`) into `web/dist`.
2. Typecheck `scripts/gen`, then `atlas.ts --check` and `collision.ts --check` from the repo root.
3. Assert `wiki/data/274/manifest.json`'s `contentSha` equals the pinned content sha, then
   `bun run --cwd wiki build` into `wiki/build/wiki.db` (`build.ps1`'s own marker for this is `1c`).
4. `bun run build` in `client/` into `client/out`.
5. Assert `client.js`, `ondemandworker.js` and `tinymidipcm.wasm` exist in `client/out`, that
   `wiki.db` clears a 32 MiB floor, and that `wiki/build/report.md` records no lint errors.

`scripts/verify.ps1` is the acceptance gate, ten steps, each of which stops every process it
starts in a `finally` block:

1. The 400-line ceiling (`scripts/line-ceiling.ps1`). First because it is a second of work, so a
   file over the ceiling is not paid for with the ten minutes of suites below it.
2. Engine overlay apply, then `-Check` for drift, then the manifest-git-tracked check, then the
   engine typecheck, then the engine unit tests (`npx tsx --test --test-force-exit`, with suite
   paths passed **relative** to `engine/server`; absolute paths make node evaluate the circular
   module graph twice and three suites die at load).
3. Client fork typecheck: `bun run typecheck` in `client/`, `tsc --noEmit` over its 123 source
   files (`tsconfig.check.json`: the pristine config, minus the git-ignored `out/` build output)
   rather than over what a test happens to import (audit C16).
4. Client unit tests: `bun test src/hooks src/plugins src/vendor`.
5. Server typecheck (`tsc --noEmit`, standalone because `bun test` only typechecks what it imports),
   then `bun test` with the auth and firestore emulators up.
6. Web typecheck, lint, vitest. The typecheck is three programs: `tsconfig.json` for `src/`,
   `tsconfig.e2e.json` for the Playwright half, `tsconfig.test.json` for the test files and the
   ten harnesses.
7. Firebase rules tests (self-contained `emulators:exec`).
8. Wiki typecheck and `bun test` in `wiki/` (fixtures only: no emulator, no stack).
9. `scripts/build.ps1`.
10. Browser e2e: emulators, `start-stack.ps1 -Prod`, wait for `/api/health` to report `engine: up`,
   assert the management secret is present **and that the engine answers it with a 200** (a missing
   secret would make the bank spec skip itself, and a skip reads as green), rebuild the web bundle
   in mode `e2e`, then `npx playwright test` from `web/`.

`docs/VERIFICATION.md` is the authority on when to run which, and on the false greens.

## 7. The release path

`deploy/docker/docker-compose.yml` (project name `idlescape`) builds three services on one
Lightsail box: `engine` (unpublished), `server` (internal only), and `cloudflared` behind the
`public` profile so a plain `up -d` never exposes an unchecked stack. No service publishes a host
port; the connector dials out.

`deploy/lightsail/release.ps1` ships **HEAD**, not the working tree. Five pre-flight checks are
refusals, not inputs, and each throws before anything leaves the machine (the first four at
`release.ps1:44-58`, the fifth just before the archive is cut):

1. **Uncommitted changes to tracked files.** `-Force` is the override, and it ships HEAD
   anyway, so the override buys nothing but the warning.
2. **A missing sha line in HEAD's `scripts/upstream.lock`** for `engine/server` or `engine/content`.
3. **A bad Firebase key in HEAD's `web/.env.production`.** All five of `VITE_FIREBASE_API_KEY`,
   `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID`, `_MESSAGING_SENDER_ID` must be present and non-empty
   and must not start with `placeholder` or `demo`.
4. **`VITE_USE_FIREBASE_EMULATORS` not equal to `false`** in that same file.
5. **A dirty tracked file under `deploy/`.** Checked again by name at the last moment before the
   archive is cut, and `-Force` does **not** cover it: the box reads `deploy/` files directly, so
   an unshipped edit there is a revert of what is running rather than a missing improvement. Its
   own opt-out is `-AllowDirtyDeploy` (audit C08, decision D15's rider).

Only past all five does it write `secrets/compose.env`, `git archive` plus scp to the box, then
`box/extract.sh`, `box/up.sh`, and poll `box/health.sh`. The health assertion is `Get-HealthGaps`
(`deploy/lightsail/common.ps1:69-76`), which reads three fields of the snapshot
(`server/src/health.ts`): `"engine":"up"`, a **numeric** `"players"`, and `"wiki":"up"`. Both
`release.ps1` and `cutover.ps1` gate on it, `cutover.ps1` twice, including its probe against the
public hostname. `"engine":"up"` on its own is a `HEAD /rs2.cgi` probe and was green for months
against a stack carrying none of the overlay (audit C07); `players` is a number only when the
front server reached the engine's management port; `wiki` is `"up"` only once the wiki database is
in the server image, which sprint entry 2 landed, so the gate stays red only until a release is
cut from an image that carries it (decision D75).
`gateway` and `version` are still ignored. What no health response can show is
whether the image carries the engine overlay at all: that is asserted at build time instead, by
`deploy/docker/engine.Dockerfile`.

What is gated, and what is broken:

- **Every release is owner-gated** (board gate G5). Nothing touches the live host, the production
  engine or cloud Firebase until the owner asks. So the two paragraphs above describe the pipeline
  **at HEAD**, and the box still runs the image it was last released with.
- At HEAD the deployed stack **applies the engine overlay** and gets the idlescape environment:
  `engine.Dockerfile` copies `engine-custom/` onto the pinned clone and asserts it landed, and the
  compose file env_files both shared engine secrets into the engine service and points the front
  server's `ENGINE_MANAGEMENT_HTTP` at the engine container rather than at itself (decisions D73
  and D74). Until a release happens the **running** box is still the audit C07 stack: stock 274,
  no owner bank, and `"engine":"up"` is not evidence that it has one. A health response still
  cannot prove an image carries the overlay; that half of C07 is sprint entry 2's.
- `/wiki` will no longer return 503 forever in production: `server.Dockerfile`'s `wiki-build` stage clones
  Content at `CONTENT_SHA`, runs the extract and the wiki build, and copies the result to
  `/app/wiki/build/wiki.db`, which is the path `server/src/env.ts` already defaults to (audit C09,
  sprint entry 2). Nothing has been released from that image; the running box is still the one
  where it does 503.
- `deploy/lightsail/cloudflared.yml` carries an ingress for another project on the same box. It is
  committed as of decision D15, so a release from HEAD no longer drops that hostname, and
  `release.ps1` refuses outright while that file is dirty.

## 8. The invariants a change must preserve

Break one of these and the failure is silent or expensive, which is why they are listed rather than
left to judgement.

1. **Pack ids are pinned by name**, in the sprint spec's section 3 table. `BuildOverlay.ts` runs
   with `Environment.build.verify = false`, so a missing name auto-registers and rewrites the
   `.pack` file, and a renumbered `.pack` renumbers obj ids already written into every `.sav` and
   every owner-bank JSON, turning one item into another. **This does not happen silently.**
   `BuildOverlay.ts` exists in the first place because `readConfigs` checks every packed client
   config against a hard-coded CRC of the original 2004 cache (`703279713` for `.varp`), which
   makes the engine's own `npm run build` abort with ".varp checksum mismatch!" the moment
   `content-custom` adds a name that cache never had. Turning `verify` off to get past that CRC
   also turns off the id pinning, so the tool puts that half back by measurement: it sha256s every
   `*.pack` in the pack directory before and after `packAll` and exits 1 naming the files that
   moved (`engine-custom/tools/pack/packGuard.ts`, `BuildOverlay.ts`). The second half of that
   guard is now `checkPack` (`engine-custom/src/idlescape/packIds.ts`), run before and after
   `packAll` on both call sites: it **reads the `.pack` line** and compares id to name against the
   sprint's section 3 table, so a wrong id that never moves is no longer byte-identical to a right
   one, and `packIds.test.ts` asserts the same table against the four tracked files in
   `content-custom/pack/`. One blind spot remains: a `packAll` that **throws** exits at the catch
   before the after-comparison, so a half-finished run names no files; re-run it after the fix to
   learn whether anything moved.
2. **`localStorage` keys keep the `cs.` prefix and their exact names.** Renaming one silently resets
   player state. Live today: `cs.panel`, `cs.size`, `cs.filter`, `cs.bank.mode`, `cs.bank.qty`, and
   the two per-principal families `cs.plugin.<scope>.<id>` and `cs.script.<scope>.<id>`, where
   `<scope>` is `u.<uid>` signed in and `anon` signed out (audit
   C10). `web/src/storage/scoped.ts`'s header is the authority for that shape and for which `cs.`
   keys are deliberately still bare.
3. **Panel ids are stable** (`web/src/types.ts:5`). They are persisted, and shell v2's migration is
   a planned, tested change across 1,487 unit tests and 27 Playwright specs, not a rename.
4. **The Escape contract.** Escape pauses a running script and nothing else. Nearer owners spend it
   first (a live drag in the bank grid, then the bank window itself) and mark it `defaultPrevented`
   so one keypress never does two things.
5. **Files stay under 400 lines**, test files included.
6. **No em dashes** in prose or in AWS resource names; hyphens or commas.
7. **The pinned clones stay pristine**, and every overlay file is `git add`ed.
8. **One focus ring**, the orange `0 0 0 3px rgba(255,152,31,.18)`, and motion off under
   `prefers-reduced-motion`.

## 9. Where things are heading

The order is owned by `docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md`. It is repeated
here without re-arguing it, because a map that stops at today is half a map.

| # | Entry | What it adds to this architecture |
|---|---|---|
| 1 | SP4b, bot expansion | Per-script toggles, the live run in the banner and the card, global A* and the collision generator, state detection and recovery, the Tutorial Island script |
| 2 | Shell v2 and the living component library | A persistent co-pilot bar in five run states, a 280px side panel, Automation replacing Tasks, a cross-character Events panel, Characters merged into Account, a drawn SVG icon set, and the retirement of the `.p-*` class dialect. Panel ids migrate here |
| 3 | SP8c, the game client's bank tabs | The client half: tab-range draw and dividers in `Client.ts`, `bank_main.if` components and `bank.rs2` handlers in `content-custom/` |
| 4 | Time candy | An owner-scoped ledger with an interchangeable bearer-token item, exercising the content overlay, `BuildOverlay.ts` and hand-pinned pack ids |
| 5 | Battlebots minigame | A generated region, a front-server match store, four library bot scripts, and bot scripts running in the player's existing per-character Worker |
| 6 | SP9, Contracts | Economy database, escrow settlement, market queries, agent tools. It registers over the `sell` and `buy` menu ids SP8b shipped disabled |
| 7 | SP10, wealth hiscores | Blocked on SP3's hiscores half, which does not exist. Decision D14 rules that SP3b is built first |
| 8 | SP4c, the gateway | `/tab` registry, relay, schema, modes and rate limits; `runs.db`; the tutorial run driven through MCP. This is where the second caller of the one runner arrives |
| 9 | SP5, tier 2 plugins and the headless runner | Scene projection plugins and the headless LiteClient runner. Plans against the scene and menu halves only, per decision D18 |

The project audit proposes five further rows, each carrying findings this document has cited above:
release integrity (C07, C09, C17, C08), account isolation and the boot path (C10, C18), the front
door and the static gate (C11 to C16, which this document is part of), the overlay, pack and
client-fork gates (C22, C23, C24), and a reconciliation and janitorial batch (C31 to C35). See
`docs/superpowers/specs/2026-09-07-project-audit.md` section 3.1 and the board's queue.
