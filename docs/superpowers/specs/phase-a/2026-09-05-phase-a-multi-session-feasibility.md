# Phase A — Multi-character browser sessions and render-suspend feasibility

Date: 2026-09-05. Scope: handoff sections 2.3, 3, 18.1, 18.2, 19 "Multi-character/session
architecture". Read-only audit of `client/`, `web/`, `server/`, and the pinned `engine/server`
(rev 274). Line numbers are from the working tree at commit `10838e2` on `feat/platform-shell`.
"Verified" = read in code; "inferred" = reasoning from that code or from browser behaviour I did
not measure here.

## Summary

1. Rendering is already separable from simulation at exactly one call site: `GameShell.run()`
   calls `mainloop()` (state + network) in an inner loop and `mainredraw()` (draw) once per
   outer iteration. Skipping `mainredraw()` while `gameLoop()` keeps running keeps the session
   valid; a one-line guard in `Client.mainredraw()` plus `refresh()` on resume is the core patch.
2. A shared runtime (two `Client` instances in one document) is not viable: the canvas is a
   module-level singleton, and per-character game state (interfaces/inventory, models, world
   click target, anticheat counters) lives in `static` fields. Iframe-per-character is required.
3. The engine keeps a player alive for 30 s after socket close and forces logout at 60 s, so
   "disconnect and reconnect later" is not a viable background model. The same account cannot be
   logged in twice, but N different accounts from one browser/IP are allowed today.
4. Two real blockers for background sessions are unrelated to rendering: the client's own 90 s
   idle-logout packet and browser timer throttling of hidden tabs. Both need explicit handling.
5. Verdict on handoff section 3: (1) yes, (2) yes, (3) yes, (4) yes with no work, (5) yes with
   focus handling, (6) plugin/UI state must be re-scoped per character in the shell.

## Findings

### F1. Loop structure: draw is a single, separable call (verified)

- `client/src/client/GameShell.ts:88` `run()`: after `maininit()` (:123) the loop sleeps via
  `setTimeout` (`await sleep(delta)` :183; `sleep` is `setTimeout` at
  `client/src/util/JsUtil.ts:1`), then runs `while (count < 256) { ... await this.mainloop();
  count += ratio }` (:185-192), then `await this.mainredraw()` (:203). No
  `requestAnimationFrame` anywhere, so a hidden/display:none frame does not stall the loop.
- `client/src/client/Client.ts:1289` `mainloop()`: `Client.loopCycle++`, tick emit, then
  `titleScreenLoop()` or `gameLoop()`, then `onDemandLoop()`.
- `Client.ts:1311` `mainredraw()`: `Client.drawCycle++`, then `titleScreenDraw()` or
  `gameDraw()`, `MobileKeyboard.draw()`. Nothing in `mainredraw()` is required by `mainloop()`
  except the caveats in F4.
- Shutdown: `GameShell.ts:231` `shutdown()` sets `state = -2`, calls `mainquit()` and nulls the
  canvas/window handlers. `Client.ts:1336` `mainquit()` closes the game stream, clears the
  mouse-tracking interval, `onDemand.stop()` (terminates the worker,
  `client/src/io/OnDemand.ts:130-139`), `unloadTitle()`. Only `GameShell.start()/stop()`
  (:262-271) change `state`; nothing in `Client.ts` calls them, so a client is never torn down
  in practice — teardown today means dropping the iframe/page.
- Re-entry guard: `Client.ts:860-865` `maininit()` sets `errorStarted` if `alreadyStarted`, and
  `web/src/clientHost.ts:7-9` single-flights `loadClient()`; `:21` constructs
  `new mod.Client(nodeId, 0, members)` once per document.

### F2. Module-level and static state makes one-document shared runtime impossible (verified)

- Canvas singleton: `client/src/graphics/Canvas.ts:1-2` exports `canvas =
  document.getElementById('canvas')` and `canvas2d` at import time. `GameShell` constructor
  (:62-70) and `run()` (:88-105) bind directly to it; `PixMap` draws with `canvas2d` by default
  (`client/src/graphics/PixMap.ts:1,13,31` `putImageData`). `resize()` (:79-83) sets
  `canvas.width/height` and `Pix3D.setRenderClipping()`.
- Per-character game state in statics: `IfType.list` holds every interface's contents,
  including the player inventory (`Client.ts:11579-11590` reads
  `IfType.list[INVENTORY_COM_ID].linkObjType`) — two clients would overwrite each other's
  inventories/bank/side panels. `World.groundX/groundZ` (`client/src/dash3d/World.ts:113-114`)
  is the walk-click target consumed in `gameLoop` (`Client.ts:2382-2395`). `Client` statics
  `cyclelogic1..10`, `oplogic1..10`, `loopCycle`, `drawCycle`, `lowMem`, `nodeId`
  (`Client.ts:95-122`) drive anticheat packets (`:2374-2379`, `:4928-4933`).
- Renderer statics: `Pix2D.pixels/clip*` (`graphics/Pix2D.ts:4-16`), `Pix3D.scanline`,
  texel pool, colour table (`dash3d/Pix3D.ts:8-33`; `Client` swaps `Pix3D.scanline`
  per area at `:1254-1260`, `:11199-11200`), `Model.*` scratch buffers, `Model.provider` (the
  OnDemand instance) (`dash3d/Model.ts:38-128`), `AnimFrame.list` (`dash3d/AnimFrame.ts:6`),
  `ClientPlayer.modelCache` (`dash3d/ClientPlayer.ts:210`), `ClientBuild.*`
  (`client/ClientBuild.ts:28-32`), sound synth buffers (`sound/JagFX.ts:8-12`,
  `sound/Tone.ts:8-16`), and `MobileKeyboard` appends an `<input>` to `document.body`
  (`client/MobileKeyboard.ts:508,556`).
- Conclusion: isolation requires a separate JS realm per character. A Web Worker realm would
  also isolate statics, but `GameShell`/`Client` use `document`, `window.location`
  (`Client.ts:586,1780`), DOM events and a 2D canvas context throughout; an OffscreenCanvas +
  input-forwarding port is a large fork divergence, contrary to `client/PATCHES.md`'s
  minimal-anchor policy. **Iframe per character is the only cheap option.**

### F3. Network/session lifecycle in the client (verified)

- `Client.ts:1772` `login()`: opens `ClientStream.openSocket(window.location.host, https)`
  (:1780; `io/ClientStream.ts:9-20` = `new WebSocket(ws(s)://host, 'binary')`), sends opcode
  16 (fresh) or 18 (reconnect) (:1821-1825). Response 2 resets all per-session state and calls
  `prepareGame()` (:1854-1963); 15 = reconnect accepted, keeps scene (:2014-2027); 5 = "already
  logged in" (:1968-1970).
- `Client.ts:2113` `gameLoop()`: `tcpIn()` up to 5 packets (:2126), mouse/camera/focus
  packets, `checkMinimap()` → `checkScene()` → `mapBuild()` + `MAP_BUILD_COMPLETE`
  (:2291, :5169-5221), `movePlayers()/moveNpcs()` → `moveEntity()` → `entityAnim()`
  (:2276-2277, :3554, :3565, :3600 — entity motion/animation is in the sim path, not draw),
  15 s no-packet → `lostCon()` (:2296-2299), 90 s no input → `IDLE_TIMER` + `logoutTimer =
  250` (:2432-2438), 1 s nothing sent → `NO_TIMEOUT` (:2504-2507), flush `out` (:2509-2523).
- `Client.ts:2565` `lostCon()`: if `logoutTimer > 0` → `logout()`; else paints "Connection
  lost" into `areaGame` (:2571-2576, draw from the sim path, harmless when hidden), sets
  `ingame = false`, emits `disconnect`, `login(..., reconnect=true)`, `logout()` on failure.
- `Client.ts:2528` `logout()`: closes stream, `ingame = false`, `clearCaches()`,
  `world.resetMap()`, collision reset, `stopMidi`, emits `logout`.
- OnDemand: a second WebSocket owned by the worker (`io/OnDemandWorker.ts:595-600` opens
  `ClientStream.openSocket(host, secured)` lazily, with a 4 s reopen backoff). It is independent
  of the game socket; the engine drops it via `OnDemand.onClientClosed` (`engine/server/src/web.ts:124`).
  `OnDemand.run()` forwards `app.ingame` to the worker (`io/OnDemand.ts:279-284`).
- Both sockets are opened with `window.location.host` — inside a same-origin iframe this is the
  same front-server origin, so no URL changes are needed.

### F4. What "suspend rendering, keep simulation" requires (verified)

Draw-only work reached only from `mainredraw()`: `gameDraw()` (`Client.ts:3973`) →
`gameDrawMain()` (:4255; scene push, camera, `World.draw`, `entityOverlays`, `otherOverlays`),
`animateInterface()` for side/chat modals (:4012, :4054; only advances interface model anim
frames, :10651-10698), `drawSide()`/`drawChat()`/`minimapDraw()` (:4026, :4077, :4082), icon
redraw (:4087-4100), `titleScreenDraw()` (:1534).

Side effects that live in the draw path and would stop while suspended:

1. `otherOverlays()` → `buildMinimenu()` (:4949) builds the right-click/left-click menu entries
   that `mouseLoop()`/`doAction()` consume in `gameLoop`. Irrelevant while the character is
   hidden (no human input); on resume the first frame rebuilds it. Agent input paths must not
   depend on it (see Open questions).
2. `ANTICHEAT_CYCLELOGIC5` is sent from `otherOverlays()` while `crossMode === 2` (:4928-4933).
   Skipping it is harmless: the engine's cyclelogic handlers are no-op counters at 274 (inferred
   from the packet's name and the client's other cyclelogic sends still running from `gameLoop`,
   :2374-2379; not verified in engine).
3. `TUT_CLICKSIDE` is sent from the icon-redraw block (:4088-4093) when `tutFlashIcon ===
   activeIcon`. Tutorial-island progression would stall for a suspended character. Acceptable
   (a background character on tutorial island is an edge case), or move that send into
   `gameLoop`.
4. `sceneCycle++` (:4256) feeds `tileLastOccupiedCycle` for overlay stacking only (:4394-4432).

Things the simulation does that touch the canvas, all harmless when hidden: `lostCon()` and
`REBUILD_NORMAL` paint "Connection lost"/"Loading" (:2571-2576, :6928-6932),
`checkMinimap()` builds the minimap buffer on level change (:5178-5181, CPU only).

Resume: `refresh()` (:1332) sets `redrawFrame = true`; `gameDraw()` then repaints the frame
chrome and forces `redrawSide/Chat/Icons/ChatMode` (:3979-3999). No other state needs
reconstruction — scene, entities, interfaces, chat history and camera all advanced in
`gameLoop`.

Not draw-related but decisive for background sessions:

- **Client idle logout**: `idleTimer` is reset only by DOM input (`GameShell` handlers and
  `Client.ts:11790-11990` pointer overrides). After 90 s the client sends `IDLE_TIMER` and arms
  `logoutTimer = 250` (:2432-2438). The engine's `IdleTimerHandler`
  (`engine/server/src/network/game/client/handler/IdleTimerHandler.ts:7-11`) sets
  `player.requestIdleLogout = true` unless `Environment.node.debug`, and `processLogouts`
  (`engine/server/src/engine/World.ts:752-760`) logs the player out once `preventLogoutUntil`
  passes. A hidden character with no synthetic input is therefore logged out ~90 s + a few
  ticks after being backgrounded. This must be patched client-side (suppress the
  `IDLE_TIMER` send while an "attended by shell/agent" flag is set, or bump `idleTimer`
  from `hooks`).
- **Browser timer throttling** (inferred, not measured): the loop is `setTimeout`-driven with
  `deltime = 20 ms`. Same-origin iframes share the top document's visibility, so
  `display:none`/offscreen iframes in a *visible* tab run at full rate. When the *tab* is hidden,
  Chrome clamps timers to 1 Hz and, after 5 min, to one wake per minute for chained timers
  (pages playing audio are exempt). At 1 Hz the client still sends `NO_TIMEOUT` every second
  (:2504) and reads packets, so the engine's 60 s `TIMEOUT_NO_RESPONSE` (`World.ts:132`) is not
  hit; at one wake per minute it would be. This is already true of the single client today;
  nothing here is new to multi-session, but it caps "keep the sim alive in a background tab" at
  the browser's policy.

### F5. Engine session rules (verified)

- Socket close: `engine/server/src/web.ts:122-130` sets `client.player.client = new
  NullClientSocket()`; the player stays in the world. `World.ts:739-760` `processLogouts()`:
  `lastConnected` stops advancing → after `TIMEOUT_NO_CONNECTION = 50` ticks (30 s, :131)
  `requestIdleLogout`; after `TIMEOUT_NO_RESPONSE = 100` ticks (60 s, :132) forced logout.
  Reconnect (opcode 18, `World.ts:2251`) is accepted by the login server only while
  `account.logged_in === nodeId` (`LoginServer.ts:268-310`) and swaps the socket onto the
  existing player with response 15 (`World.ts:824-850`). So "disconnect, reconnect later" only
  works inside a ~30 s window; there is no server-side persistent session beyond that.
- Same account twice: rejected with code 5 by three paths — login thread reply 3
  (`LoginServer.ts:311-319` → `World.ts:1857-1861`), in-world duplicate scan
  (`World.ts:857-866`), and pending logout flush (`World.ts:813-822`, `:1922-1927`).
- Multiple accounts per browser/IP: no per-IP or per-origin connection cap in the WS handler
  (`web.ts:87-135`) or in `LoginServer.ts` (only "too many attempts", reply 8 at `:176`, and
  the hop timer, `:320-330`). N characters = N engine accounts, each with its own game socket
  and OnDemand socket, is allowed as the engine stands.

### F6. Front server and shell hosting assumptions (verified)

- `server/src/index.ts:56-66`: every `/` WebSocket upgrade opens its own upstream and
  `RelayData`; `proxy/ws.ts:relayHandlers` has no per-page/per-uid state. Commit `314a459`
  added the two-sockets-per-page regression test. N iframes × 2 sockets is just more of the same.
- Gate cookie: `server/src/gate.ts:74` sets `HttpOnly; SameSite=Lax; Path=/`. Same-origin
  iframe subresource, `import()` and WebSocket requests carry it (inferred from cookie rules;
  the existing `/client/client.js` load already relies on it, `web/src/main.ts:200-203`).
- Firebase auth: `web/src/auth.ts` uses the Firebase web SDK in the parent. The iframe does
  not need Firebase at all: `startSession()` (`main.ts:150-172`) does `bridgeApi(token)` in
  the parent and then `hooks.login(gameName, secret)` — with iframes the parent calls
  `iframe.contentWindow.idlescape.client.login(...)` (same origin, direct access) or
  posts a message. The bridge today is one account per uid (`server/src/bridge.ts:16-38`,
  `gameAccounts/{uid}`), which the character model work must generalise.
- Shell DOM coupling to a single canvas: `web/src/partials/frame.html:10` has one
  `<canvas id="canvas">`; `main.ts:56-62` `layout()` sizes `byId('canvas')`;
  `frame/canvasSize.ts` is pure and reusable per frame; `deps.fullscreen` and the screenshot
  plugin target `byId('canvas')`. Overlays (`#overlays`, `#plugin-overlays`) sit in the parent
  over `#canvas-wrap` and would still cover whichever iframe is visible.

### F7. Hook layer and plugin state (verified)

- `client/src/hooks/install.ts:12-29` writes `window.idlescape.client/plugins` into the
  client's own realm and dispatches `idlescape:client-ready` — per iframe this isolates
  cleanly; the parent reaches it via `contentWindow`.
- `ClientState` (`hooks/types.ts:4-15`, built at `Client.ts:11579-11604`) exposes
  loggedIn, gameName, skills, inventory, fps, hp, prayer, energy, boosts. It does not expose
  position, current animation, or interaction target — the handoff's switcher wants
  "location / activity / idle"; add `x,z,level` (`localPlayer.x/z`, `minusedlevel`) and
  `seqId`/`targetId` to `hookState()` (one anchor, ours).
- Shell plugin settings are keyed by uid + plugin id, not character (`web/src/plugins/settings.ts:19`
  `cs.plugin.${id}`; Firestore via `firestoreBackend`). `PluginContext.client()` returns the
  single `hooks` (`main.ts:75-93`), `onClientToggle` fans out to the single
  `window.idlescape.plugins` (`main.ts:104-109`), and `wireHooks()` subscribes once
  (`main.ts:139-146`). XP tracker/loot log (`stats/*`) are per page, not per character.
- Client-tier plugins (`client/src/plugins/registry.ts`, `capability.ts`) live inside the
  client realm; their `frame.onBeforeDraw/onAfterDraw` (`capability.ts:33-36`) will simply not
  fire while rendering is suspended, which is the right semantics for overlay plugins.

## Implications for the handoff

Section 3 questions:

1. Keep sim alive while rendering suspended — **yes**: guard `mainredraw()`; `gameLoop()`
   continues to read packets, send keepalives, move entities, build maps. Must also suppress the
   client's 90 s `IDLE_TIMER` for attended background characters.
2. Stop/detach canvas rendering — **yes**, but "detach" means "don't draw"; the canvas element
   stays bound (module singleton). Hiding the iframe (`display:none` or offscreen) is free.
3. Resume the visual client — **yes**: `refresh()` + un-hide; one frame repaints everything.
4. Restore world state without restart — **nothing to restore**; the instance never lost it.
   The engine does *not* offer a persistent detached session, so keeping the client instance
   alive is the only way to preserve state (F5).
5. Input after restore — **yes**: handlers stay bound to the iframe's canvas/window
   (`GameShell.ts:88-105`); the parent must focus the iframe's canvas on switch for keyboard.
   Mobile keyboard `<input>` is per iframe document.
6. Plugin/UI state — client-side state is per iframe automatically; shell-side state
   (`hooks` singleton, `wireHooks`, XP/loot trackers, `onClientToggle`, settings keyed by uid)
   must become per-character maps. Settings scope (per uid vs per character) is a product
   decision.

Section 18.1 architecture: **iframe per character** (same origin, `src` = the existing shell's
client page or a minimal `client.html` containing `#canvas`), lazily created on first select
(handoff 2.3), never destroyed while the tab lives. Shared runtime: no (F2). Worker-backed: no
for the render client (F2); the roadmap's SP5 headless `LiteClient` (rs-sdk) is the right tool
for *unattended* characters, not for "instantly return to manual play".

Section 18.2: yes, with the patch below. "Throttled rendering" is a free intermediate:
`setTargetedFramerate()` (`GameShell.ts:258`) only throttles draws (the `tfps` sleep at
`:207-212`) and is already exposed to `Client`.

Resource envelope (inferred): each iframe holds its own decoded cache (models, textures,
`IfType` interfaces, sound synth buffers) — tens of MB and a 50 Hz `gameLoop` per character;
suspended, the 3D rasteriser (the dominant CPU cost) is skipped. IndexedDB `lostcity`
(`io/Database.ts:12`, `OnDemandWorker.ts:96`) is shared across same-origin iframes; writes are
idempotent puts, so concurrent instances are safe.

Patch footprint for a render-suspend flag (all anchors by surrounding code per `PATCHES.md`):

| # | Site | Change |
|---|---|---|
| A | `Client.ts` private fields (next to `headlessTitle`, patch 2) | `renderSuspended = false`, `attended = false` |
| B | `Client.ts` constructor `installHooks({...})` (:604-621) | bridge closures `setRenderSuspended(v)` (sets flag; on `false` calls `this.refresh()`), `setAttended(v)`, `touchIdle()` |
| C | `Client.ts:1311` `mainredraw()` | after the error check: `if (this.renderSuspended && this.ingame) return;` |
| D | `Client.ts:2432` idle block in `gameLoop()` | `if (!this.attended && now - this.idleTimer > 90_000)` |
| E | `hooks/types.ts`, `hooks/install.ts`, `client/bundle.ts` reserved list | new `ClientHooks` members; add `x/z/level/seq` to `ClientState` + `hookState()` (:11579) |
| F | optional `Client.ts:4088-4093` | move `TUT_CLICKSIDE` send into `gameLoop` (only if tutorial-in-background matters) |

Three upstream-file anchors (A, C, D; B is inside our existing patch 3), all one to three lines.

Shell work (ours, no fork impact): `clientHost.ts` becomes `createClientFrame(characterId)`
returning `{ iframe, hooks }`; `main.ts` keeps `Map<characterId, Frame>`, switches visibility,
focuses the active canvas, re-targets `layout()`/fullscreen/screenshot at the active frame, and
fans `wireHooks`/`onClientToggle`/trackers out per frame. Front server: none (F6). Engine: none
for N accounts (F5); the account→characters model is separate work.

## Open questions

1. Agent input path vs draw: the SP4 design vendors rs-sdk's `ActionExecutor` (not yet in tree;
   `client/vendor` absent). If it synthesises actions through `buildMinimenu()`/`doAction()`
   it depends on draw-path menu building (F4.1) and would need a sim-path rebuild call while
   suspended; if it writes packets directly it does not. Decide when vendoring.
2. Background-tab throttling must be measured on Chrome/Firefox/Safari with N iframes: does the
   engine's 60 s no-response timeout trip under one-wake-per-minute throttling? Mitigations if
   so: keep music playing (audio exemption), or move the keepalive/tcpIn tick into a worker.
3. Idle policy: with `IDLE_TIMER` suppressed, what logs an abandoned background character out?
   Options: shell-side inactivity policy per character, or a server-side account-level rule.
4. Settings scope: per uid (today) or per character? Affects `settings.ts` key shape and the
   Firestore rules in `firebase/`.
5. `ClientState` additions for the switcher dashboard (position, activity, target): which
   fields, and do they belong in `hookState()` or in an SP4 `StateCollector` snapshot?
6. Memory ceiling: three live 274 clients per tab has not been profiled (handoff Phase E item
   32). Model/texture caches are per iframe; confirm the budget on a low-end laptop.
7. Guest identity: bridge is `gameAccounts/{uid}` one-to-one; guest character persistence under a
   multi-character model needs its own decision (handoff 6.1).

## Recommendation

Adopt **iframe-per-character with render-suspend**: one same-origin iframe per opened
character, created lazily on first selection and kept alive for the tab's lifetime; the parent
shell hides inactive frames and calls `setRenderSuspended(true)`, and on switch un-hides,
`setRenderSuspended(false)`, and focuses the canvas. Apply the six-site patch above (three
tiny upstream anchors), suppress the client idle-logout for attended frames, and extend
`ClientState` with position/activity for the switcher. Do not pursue a shared runtime or a
worker-hosted render client; reserve the roadmap's SP5 headless `LiteClient` for unattended
characters that never need instant manual takeover. Before locking the plan, run the two
measurements in Open questions 2 and 6 (throttled-tab survival and 3-client memory), since
they, not the render loop, are the real constraints.
