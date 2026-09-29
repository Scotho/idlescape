# Idlescape — SP1b: Revision 274 migration

Date: 2026-09-05
Status: approved 2026-09-05
Scope: move the pinned upstream clones and our client fork from Lost City build 225
(18 May 2004) to build 274 (23 November 2004), adjust scripts and the front server, and add
the custom-content overlay mechanism. Runs after SP1 Task 13 and before Task 14.

## 1. Goals and non-goals

Goals

- Engine, content and client at the 274 branch tips, pinned in `scripts/upstream.lock`.
- The client fork keeps exactly the additions from SP1 Tasks 9 and 10 (hooks module plus call
  sites), re-applied on 274 with no behaviour change to the shell.
- `npm run setup`, `dev`, `build`, `verify` work unchanged from the user's point of view.
- The front server proxies everything the 274 client needs.
- A `content-custom/` overlay directory so future custom content is tracked by us while the
  Content clone stays pristine and pinned.

Non-goals

- Any custom content itself.
- The GPU renderer (SP2).
- Any change to rs-sdk vendoring (SP4).

## 2. What changes upstream and how each lands here

### 2.1 Engine runtime and start-up

274 is Node-first: `package.json` declares `engines.node >= 24`, scripts run through `tsx`
(`npm run start` is `npm install && tsx src/app.ts`), dependencies include Fastify,
`@fastify/websocket`, `@fastify/static`, `ws`, `kysely`, `mysql2`, `prom-client`. Bun is no
longer used by the engine. Node 24 is installed on this machine.

- `scripts/setup.ps1`: clone or checkout `Engine-TS` and `Content` at the 274 shas in
  `upstream.lock`; run `npm install` in `engine/server`; run the pack once.
- `scripts/start-stack.ps1`: launch the engine with `npx tsx src/app.ts` from
  `engine/server`, not `bun run src/app.ts`.
- Java 17 remains a prerequisite for the pack tools. Verify during the task; if 274 no longer
  shells out to Java, drop it from README.

### 2.2 Engine configuration

`.env` is gone. Configuration is `engine/server/data/config/world.json`, loaded by
`src/util/WorldConfig.ts`, with a setup page on the management port
(`GET /setup`, `GET|PUT /setup/config`). The dev world needs:

```json
{
  "website": { "registration": false },
  "web": { "port": 8899, "allowedOrigin": "http://localhost:8788", "managementPort": 8897 },
  "node": { "port": 43596, "profile": "main", "debug": true, "production": false },
  "login": { "enabled": false },
  "friend": { "enabled": false },
  "logger": { "enabled": false },
  "db": { "backend": "sqlite" }
}
```

Exact key names and defaults come from `WorldConfig.ts` at the pinned sha; the implementer
reads that file and writes only the keys we override, letting the loader fill defaults.
`setup.ps1` writes this file if absent and never overwrites an existing one. The live and VM
deployments use 8888 / 8898 / 43594 as before.

`WEB_ALLOWED_ORIGIN` from the live PoC becomes `web.allowedOrigin`; for production it is
`https://osrs.scotho.com`.

### 2.3 Cache and asset delivery

In 274 the client fetches a small set of archives over HTTP (`/crc`, `/title`, `/config`,
`/interface`, `/media`, `/versionlist`, `/textures`, `/wordenc`, `/sounds`), each path
suffixed with a CRC (`/title123456789`). Everything else (models, animations, maps, music) is
streamed by `OnDemandWorker` over a second WebSocket to `window.location.host`, using the same
`/` upgrade endpoint; the engine dispatches on connection state (0 login/game, 2 on-demand).

Front server changes (`server/src/router.ts`, `server/src/proxy/*`):

- Cache route classification stays prefix-based; add `/versionlist`. Confirm prefix matching
  tolerates the CRC suffix (it does by construction, add a test).
- Remove `/models` from the proxy list only if the 274 engine no longer serves it; keep the
  list data-driven from one array in `types.ts`.
- `/client/*` static serving adds `ondemandworker.js` (and any worker chunk `bundle.ts`
  emits). Serve JS, wasm, soundfont and worker from the same build output so they never
  mismatch.
- WebSocket relay: the browser now opens two upstream sockets per page. Confirm the relay is
  per-connection with no per-cookie or per-IP singleton, and that the gate check runs on both.
  Add a test with two concurrent relayed sockets.
- Health probe: `HEAD /rs2.cgi` still exists under Fastify. Keep.

### 2.4 Client fork rebase

`client/` is tracked as plain files with upstream history in `client/.upstream-git`. Procedure:

1. In `client/.upstream-git`, fetch and check out `274` at the pinned sha; export the tree
   over `client/` (excluding `client/src/hooks/`, `client/out/`, `node_modules`).
2. Re-apply Task 10's fourteen call-site hunks in `src/client/Client.ts`. The touched members
   exist unchanged in 274. Hunks by area: imports and fields; `login` resolver capture in the
   login response path (all response codes, including reconnect); headless title (skip title
   button drawing when `headlessTitle`); XP diff after the stat update packet; inventory diff
   after inventory update packets (the `+1` slot offset verified in Task 10 must be re-verified
   against 274's three draw sites); chat kind mapping in `addChat`/`drawChat`; per-cycle `tick`
   emit; `installHooks` wiring at construction.
3. `bundle.ts` in 274 emits the worker; confirm `client/out/` contains `client.js`,
   `ondemandworker.js`, `tinymidipcm.wasm`, the soundfont, and update `build.ps1` and the
   front server's static list.
4. Typecheck, `bun test` for hooks, then a manual login through the front server.
5. Create `client/PATCHES.md` listing every call-site hunk (file, anchor member, purpose, a
   grep that proves it is still present), in the style of rs-sdk's checklist. Every later
   upstream bump walks this file. `CREDITS.md` points at it.

Task 14's browser e2e (login, XP event on Tutorial Island, inventory event) is the acceptance
test for this step; if SP1b lands before Task 14 as sequenced, write a minimal Playwright login
check inside SP1b and let Task 14 extend it.

### 2.5 Custom content overlay

- New tracked directory `content-custom/` mirroring Content's layout (`scripts/`, `configs/`,
  `maps/`, `models/` ...), empty except a README, plus `content-custom/manifest.json` listing
  every file it contributes.
- `setup.ps1` (and later the container build) copies `content-custom/**` over
  `engine/content/` after checkout and before the pack. The copy is idempotent; a
  `scripts/content-overlay.ps1` performs it and is what `dev` invokes on start so the engine's
  content watcher sees a consistent tree.
- `git status` in `engine/content` is expected to show overlay files; `upstream.lock` pins the
  base. A `scripts/content-overlay.ps1 -Check` mode reports overlay files whose base file
  changed upstream, for use after a bump.
- Port the `225-custom` commit (`REBUILD_REGION`, client `ServerProt`, `World`,
  `WorldRegion`, `Client`) onto the 274 client only if the 274 engine emits that packet;
  otherwise record it in the SP2 backlog. Instanced regions are the first custom-content
  enabler and are cheap to carry.

## 3. Documentation and locks

- `scripts/upstream.lock`: three new shas (engine 274 tip, content 274 tip, client 274 tip
  as of the task date).
- `README.md`: revision sentence, runtime (Node 24 for the engine, Bun for the front server
  and client build), `world.json` instead of `.env`, port table, overlay mechanism.
- SP1 spec: add a dated note at the top pointing to this document; do not rewrite history.

## 4. Testing

- Unit: router classification with CRC suffixes and `/versionlist`; relay with two concurrent
  sockets; static list includes the worker; setup script writes `world.json` once.
- Integration: engine boots under Node with the generated `world.json`; `HEAD /rs2.cgi` 200;
  front server serves `/` and relays a login; XP and inventory events fire on Tutorial Island.
- Regression: hooks tests unchanged and green.

## 5. Risks

- Content pack time (about 7 minutes) and world load (about 1 minute) on first run; the live
  PoC on 8888 keeps running throughout.
- 274 client might need `lowmem=0` and `members` flags in the shell's boot URL as the engine's
  `client.ejs` passes them; read `view/client.ejs` at the pinned sha and mirror its query and
  globals in the shell's client host (Task 14).
- If `OnDemandWorker` cannot be served cross-origin, it must come from the same origin as the
  page. The front server already serves the bundle from the page origin, so this is satisfied.
