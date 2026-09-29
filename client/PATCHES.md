# client/PATCHES.md — idlescape call-site patches on the vendored client fork

`client/` is a vendored copy of [LostCityRS/Client-TS](https://github.com/LostCityRS/Client-TS),
pinned in `scripts/upstream.lock`. Current base: **revision 274**, sha
`7d6ca61abda277cfed87d542e9e4aa3fe383b38d` (branch `origin/274`).

Everything under `client/src/hooks/` is **ours** and is never touched by an upstream bump
(`types.ts`, `emitter.ts`, `diff.ts`, `install.ts`, `world.ts`, `worldExtras.ts`, `objArt.ts` +
their tests).
The public contract those files define — `window.idlescape.client` with `login / logout /
echoChat / getState / getObjName / getObjIcon / getObjInfo / getWorldState / dispatch /
cancelAll / on` and
the `ClientState` / `WorldState` / `LoginResult` / `HookEvents` / `ObjInfo` field names — is
consumed by the web shell and protected by the terser `reserved` list in `client/bundle.ts`. Do
not rename any of those without updating both.

`world.ts`'s `cancelAll()` uses the vendored queue's `beginGeneration()`, not `clear()`: it drops
everything still pending but keeps the in-flight action as a quiescence barrier, so the next
dispatch cannot run alongside an action that has not settled. **Cancelling the in-flight action
itself is out of scope here** — the executor returns a plain promise with no abort channel — and
is deferred to the Transport layer, which owns the connection the action is waiting on. SP4b
publishes it on `ClientHooks` and the web shell calls it through `Transport.cancel()` whenever a
task aborts; the in-flight action is still not cancellable, so the transport settles the caller's
promise with `reason: 'cancelled'` and the script re-reads the world.

Everything under `client/src/vendor/` is **third-party code we vendored**, not upstream 274 —
currently `rs-sdk/` ([MaxBittker/rs-sdk](https://github.com/MaxBittker/rs-sdk), MIT, pinned at
`56b73e08fc01a1d683d7a86d145a494ae945d071`). Its licence sits at `src/vendor/rs-sdk/LICENSE` and
every deviation from upstream rs-sdk is logged in `src/vendor/PATCHES.md`. `src/vendor/` is the
only place the repo's "no `as any`" rule is relaxed.

Everything else in `client/` is the pristine 274 tree **except** the call sites below, all in
`src/client/Client.ts`. Every upstream bump re-applies this list by locating each anchor by
**surrounding code** (line numbers drift), then re-runs `bun run typecheck`, `bun test
src/hooks`, and `bun run build`.

`scripts/patches-check.ps1` checks that claim mechanically: it diffs `client/` against the import
commit recorded as `client-import` in `scripts/upstream.lock` and fails on any changed path outside
`bundle.ts`, `package.json`, `tsconfig.check.json`, `PATCHES.md`, `src/client/Client.ts` and the
three directories that are ours (`src/hooks/`, `src/plugins/`, `src/vendor/`). So the roughly 97
files no grep will ever mention are covered too. Audit C24 found this unchecked.

`bun run typecheck` is `tsc --noEmit -p tsconfig.check.json`, and `scripts/verify.ps1` runs it on
every gate, so the claim above is checked rather than remembered. Audit C16 found it unchecked.
`tsconfig.check.json` is the one file in `client/` that is ours rather than upstream's: it does
nothing but `extends` the pristine `tsconfig.json` and exclude `out/`, the git-ignored bundler
output that the pristine config's default glob would otherwise sweep in whenever a build had run.
The program is 123 files under `src/` either way, and it no longer depends on build state.
`src/vendor/` remains the only place the repo's no-`as any` rule is relaxed; casts do not fail a
typecheck, so the vendored tree passing is not evidence about its casts.

Run `powershell -File scripts/patches-check.ps1` from the repository root. `scripts/verify.ps1`
runs it in its overlay step, so this block is checked on every gate rather than pasted by hand.
The rows below are data, not shell: `<tag> | <mode> | <expected> | <file> | <literal>`, split on
the first four pipes so a literal may contain a pipe. That is not decoration. This file's own patch
28 table row escapes a table-cell pipe as `\|`, and grep reads that as alternation and answers 7
instead of 1. `<mode>` is `contains`, `startswith` (the old `^`-anchored greps, indent kept) or
`after:<n>` (the old `grep -A5 ... | grep -c` pipeline). A row whose target file is missing is a
failure, never a skip, and every numbered patch in the table below must own at least one row.

```patches-check
root: client
tsconfig | contains | 1 | tsconfig.check.json | "exclude": ["out", "node_modules"]
tsconfig | contains | 1 | package.json | tsconfig.check.json
tsconfig | contains | 0 | tsconfig.json | exclude
```

## How to verify all patches are present

```patches-check
root: client
patch 1 | contains | 1 | src/client/Client.ts | from '#/hooks/install.js'
patch 2 | contains | 1 | src/client/Client.ts | private hooksEmitter: Emitter<HookEvents>
patch 3 | contains | 1 | src/client/Client.ts | const installed = installHooks({
patch 4 | contains | 1 | src/client/Client.ts | this.hooksEmitter?.emit('login', { gameName: this.loginUser })
patch 5 | contains | 1 | src/client/Client.ts | if (this.loginResolver && !this.ingame) {
patch 6 | contains | 1 | src/client/Client.ts | reason: 'Unable to connect to the world.'
patch 7 | contains | 2 | src/client/Client.ts | if (this.headlessTitle) {
patch 7 | contains | 1 | src/client/Client.ts | if (this.pendingHeadlessLogin) {
patch 8 | contains | 1 | src/client/Client.ts | // idlescape headless title: the character name
patch 9 | contains | 1 | src/client/Client.ts | skip the credential form
patch 10 | contains | 1 | src/client/Client.ts | const events = diffXp(this.prevStatXP
patch 11 | contains | 2 | src/client/Client.ts | this.emitInventoryDiff(comId);
patch 12 | contains | 1 | src/client/Client.ts | this.hooksEmitter?.emit('chat',
patch 13 | contains | 1 | src/client/Client.ts | this.hooksEmitter?.emit('logout', {})
patch 14 | contains | 1 | src/client/Client.ts | this.hooksEmitter?.emit('disconnect', { code: 0 })
patch 15 | contains | 1 | src/client/Client.ts | this.hooksEmitter?.emit('tick', { cycle: this.hookCycle })
patch 16 | contains | 1 | src/client/Client.ts | private hookState(): ClientState {
patch 16 | contains | 1 | src/client/Client.ts | private emitInventoryDiff(comId: number): void {
```

## Patch 17-21 verification

The old `setPacketLogging\|enableAgentMode\|autoLogin\|botOverlay` line is four rows now, one per
name. That alternation was the single most dangerous line in this file: it is the assertion that
packet logging, auto-login, agent mode and the bot overlay were **never** vendored from rs-sdk, and
run under a substring matcher it would have gone on answering 0 after somebody vendored all four.
Split into four literals it cannot lie, and each is nameable in the failure output.

```patches-check
root: client
patch 17 | contains | 1 | src/client/Client.ts | // === IDLESCAPE BOT SURFACE (vendored from rs-sdk, MIT) ===
patch 17 | contains | 1 | src/client/Client.ts | // === END IDLESCAPE BOT SURFACE ===
patch 17 | startswith | 1 | src/client/Client.ts |     walkTo(x: number, z: number
patch 17 | startswith | 1 | src/client/Client.ts |     interactLoc(x: number, z: number, locId: number
patch 17 | startswith | 1 | src/client/Client.ts |     getDialogOptions()
patch 19 | contains | 1 | src/client/Client.ts | mapFlagUnsetCount: number = 0;
patch 19 | contains | 1 | src/client/Client.ts | this.mapFlagUnsetCount++;
patch 18 | contains | 1 | src/client/Client.ts | private messageSequence: number[]
patch 18 | contains | 1 | src/client/Client.ts | this.messageSequence[0] = ++this.nextMessageSequence;
patch 20 | contains | 1 | src/client/Client.ts | this.onGameTickCallback();
patch 17 | contains | 1 | src/client/Client.ts | export function normaliseComponentText
# never vendored from rs-sdk: packet logging, auto-login, agent mode, the bot overlay
not-vendored | contains | 0 | src/client/Client.ts | setPacketLogging
not-vendored | contains | 0 | src/client/Client.ts | enableAgentMode
not-vendored | contains | 0 | src/client/Client.ts | autoLogin
not-vendored | contains | 0 | src/client/Client.ts | botOverlay
patch 21 | contains | 1 | src/client/Client.ts | private worldBridge(): WorldBridge {
patch 21 | contains | 1 | src/client/Client.ts | world: (): WorldBridge => this.worldBridge()
patch 21b | contains | 1 | src/client/Client.ts | this.hookGameTick++;
patch 21b | contains | 1 | src/client/Client.ts | emit('state', { tick: this.hookGameTick })
patch 21 | contains | 1 | src/client/Client.ts | tutorialRoot: (): number => this.tutComId,
patch 21 | contains | 1 | src/client/Client.ts | from '#/vendor/rs-sdk/bot/StateCollector.js'
patch 21 | contains | 1 | src/client/Client.ts | from '#/vendor/rs-sdk/bot/ActionExecutor.js'
```

## Patch 22-23 verification

```patches-check
root: client
patch 22 | contains | 1 | src/client/Client.ts | private armedUser: string = '';
patch 22 | contains | 1 | src/client/Client.ts | private armedPass: string = '';
patch 22 | contains | 1 | src/client/Client.ts | private armedLabel: string = '';
patch 22 | contains | 1 | src/client/Client.ts | private renderSuspended: boolean = false;
patch 22 | contains | 1 | src/client/Client.ts | private attended: boolean = false;
patch 23 | contains | 1 | src/client/Client.ts | if (this.armedLabel.length === 0 || gameName !== this.armedUser) {
patch 23 | contains | 1 | src/client/Client.ts | armLogin: (gameName: string, secret: string, label: string)
patch 23 | contains | 1 | src/client/Client.ts | loginArmed: (): Promise<LoginResult> => {
patch 23 | contains | 1 | src/client/Client.ts | reason: 'No character armed.'
patch 23 | contains | 1 | src/client/Client.ts | setRenderSuspended: (suspended: boolean): void => {
patch 23 | contains | 1 | src/client/Client.ts | setAttended: (attended: boolean): void => {
patch 23 | contains | 1 | bundle.ts | 'armLogin', 'loginArmed', 'setRenderSuspended', 'setAttended',
```

## Patch 24-27 verification

```patches-check
root: client
patch 24 | contains | 1 | src/client/Client.ts | private drawArmedLoginButton(w: number, h: number): void {
patch 25 | contains | 1 | src/client/Client.ts | private armedLoginHit(): boolean {
patch 26 | contains | 1 | src/client/Client.ts | if (this.renderSuspended && this.ingame) {
patch 27 | contains | 1 | src/client/Client.ts | if (!this.attended) {
patch 27 | after:5 | 1 | src/client/Client.ts | ClientProt.IDLE_TIMER
patch 27 | contains | 0 | src/client/Client.ts | if (this.attended) {
patch 27 | contains | 1 | src/client/Client.ts | this.idleTimer = now;
patch 24 | contains | 0 | src/client/Client.ts | Waiting for idlescape...
```

The `if (this.attended) {` row and the `after:5` row are the **polarity check** for patch 27, and
both halves matter. The count of `if (this.attended) {` must be **0**: an inverted guard still
compiles, still passes every bun test (the block lives in a `gameLoop()` closure no headless test
reaches) and would send the idle-logout packet for exactly the shell sessions the hook promises to
protect. The `after:5` row then proves the surviving negated branch is the one holding the send:
`ClientProt.IDLE_TIMER` sits five lines below it, under the comment and the two stock assignments.
**That row must stay directly below its anchor row**, the `if (!this.attended) {` one: `after:<n>`
measures from the matches of the previous row, so moving it or inserting a row between the two
silently re-points it at something else.

## Patch 28 verification

```patches-check
root: client
patch 28 | contains | 1 | src/client/Client.ts | private objIconDataUrl(id: number, count: number)
patch 28 | contains | 1 | src/client/Client.ts | private objInfo(id: number): ObjInfo | null
patch 28 | contains | 1 | src/client/Client.ts | private warnObjArtFault(call: string, err: unknown)
patch 28 | contains | 1 | src/client/Client.ts | private objIconMemo: Map<string, string>
patch 28 | contains | 1 | src/client/Client.ts | from '#/hooks/objArt.js'
patch 28 | contains | 1 | bundle.ts | 'getObjIcon', 'getObjInfo'
```

The guard, the memo, the count clamp and the Pix32-to-PNG encode are **not** in `Client.ts`:
`src/hooks/objArt.ts` holds `isObjId`, `normaliseObjCount`, `objIconKey`, `pix32ToPngDataUrl`,
`OBJ_ICON_MEMO_MAX` and `renderObjIcon`, all unit-tested in `src/hooks/objArt.test.ts` against a
fake canvas and a fake `ObjIconPort`. The vendored file carries only the port into `ObjType` and
the DOM, the two fields the port reads, and the once-per-session fault log.

## The patches (all in `src/client/Client.ts`)

| # | Anchor member | Purpose | Grep that proves it |
|---|---|---|---|
| 1 | top-of-file imports (after `#/sound/JagFX.js`) | Bring in `installHooks`, `diffInventory/diffXp`, `INVENTORY_COM_ID`, and the `ClientState/LoginResult/HookEvents/Emitter` types. `type`-marked for `verbatimModuleSyntax`. | `from '#/hooks/install.js'` |
| 2 | private fields (after `ingame`) | `hooksEmitter`, `loginResolver`, `headlessTitle`, `prevStatXP`, `prevInvIds`, `prevInvCounts`, `hookCycle`, `pendingHeadlessLogin`. | `private hooksEmitter: Emitter<HookEvents>` |
| 3 | `constructor` (before `this.run()`) | `installHooks(...)` wires the bridge (login/logout/addChat/getState/getObjName) and stashes `installed.emitter`. The `login` closure sets `headlessTitle`, stores the credentials, captures the resolver and arms `pendingHeadlessLogin`; it must **not** call `this.login()` itself (see patch 7). | `const installed = installHooks({` |
| 4 | `login()` — `response === 2` success (after `prepareGame()`) | Reset the diff caches, resolve the login promise `{ ok: true }`, emit `login`. | `this.hooksEmitter?.emit('login', { gameName: this.loginUser })` |
| 5 | `login()` — after the whole response if/else chain | Resolve a still-pending promise as a failure for any non-success, non-recursing code. `!this.ingame` is the success discriminator (2/15 set ingame; 1/21 recurse and resolve within the recursive call). | `if (this.loginResolver && !this.ingame) {` |
| 6 | `login()` `catch` block (first statement) | Resolve the promise `{ ok: false, code: -1 }` before the existing (possibly rethrowing) WebSocket handler. | `reason: 'Unable to connect to the world.'` |
| 7 | `titleScreenLoop()` (first statement) | Under `headlessTitle`: fire a `pendingHeadlessLogin` via `await this.login(loginUser, loginPass, false)`, then return — no title UI interaction under programmatic login. Firing from here guarantees `maininit()`/`load()` has finished; calling `login()` straight from the hook raced the loader, whose `prepareTitle()` nulled the game draw areas after `prepareGame()` created them, so the viewport and minimap were never painted (found 2026-09-05 by the gameplay e2e). | `if (this.headlessTitle) {` (first of two hits) |
| 8 | `titleScreenDraw()` `loginscreen === 0` | When headless, skip the New/Existing user buttons; keep "Welcome to RuneScape". The headless branch body itself is patch 24. | `// idlescape headless title: the character name` |
| 9 | `titleScreenDraw()` `loginscreen === 2` | Keep the `loginMes1/2` messages, wrap the username/password/Login/Cancel drawing in `if (!this.headlessTitle)`. | `skip the credential form` (comment) |
| 10 | `UPDATE_STAT` handler (after the level-recompute loop) | Emit `xp` deltas from `diffXp(prevStatXP, statXP, statBaseLevel)`, then re-snapshot `prevStatXP`. `statXP/statBaseLevel` are `Int32Array`, converted with `Array.from` (no `as any`). | `const events = diffXp(this.prevStatXP` |
| 11 | `UPDATE_INV_FULL` and `UPDATE_INV_PARTIAL` handlers (before each `this.ptype = -1`) | `this.emitInventoryDiff(comId)` after the inventory is written. | `this.emitInventoryDiff(comId);` (two hits) |
| 12 | `addChat()` (end) | Emit `chat` with kind mapped from the draw-code type numbers (see below). | `this.hooksEmitter?.emit('chat',` |
| 13 | `logout()` (end) | Emit `logout {}`. | `this.hooksEmitter?.emit('logout', {})` |
| 14 | `lostCon()` (before the reconnect `this.login(...)`) | Emit `disconnect { code: 0 }`. | `this.hooksEmitter?.emit('disconnect', { code: 0 })` |
| 15 | `mainloop()` (after `Client.loopCycle++`) | `this.hookCycle++`; emit `tick { cycle }` while in-game. | `this.hooksEmitter?.emit('tick', { cycle: this.hookCycle })` |
| 16 | new private methods next to `addChat()` | `hookState()` builds the `ClientState` snapshot; `emitInventoryDiff()` diffs the **player** inventory only (`comId === INVENTORY_COM_ID`) against the prev snapshot. | `private hookState(): ClientState {` / `private emitInventoryDiff(comId: number): void {` |
| 17 | top-of-file (`import type { WalkResult }`, module-level decls above `export class Client`) + the whole block directly after the `constructor` | The **idlescape bot surface**, vendored from rs-sdk (MIT). Module scope gains `normaliseComponentText`, `SayOutcome`, `ClientActionFailureReason`, `ClientActionResult`; the class gains `static readonly maxMessageLength`, the `messageTick`/`dialogHistory`/`onGameTickCallback` fields, and the observe/act methods (`walkTo`, `interactNpc/Loc/Player`, inventory/bank/shop/dialog/interface/tab helpers, `say`, spells, character design, projections). Packet logging, credentials/auto-login and agent mode are **not** vendored. See `src/vendor/PATCHES.md`. | `// === IDLESCAPE BOT SURFACE (vendored from rs-sdk, MIT) ===` / `// === END IDLESCAPE BOT SURFACE ===` |
| 18 | `chatText` fields, the chat reset loop, and `addChat()` | `messageTick`/`messageSequence`/`nextMessageSequence` shift alongside the chat arrays; `addChat()` stamps `Client.loopCycle` and a monotonic sequence so the SDK can tell new lines from re-reads. | `private messageSequence: number[]` / `this.messageSequence[0] = ++this.nextMessageSequence;` |
| 19 | `UNSET_MAP_FLAG` handler (beside `this.minimapFlagX = 0;`) | `mapFlagUnsetCount++` — a session counter the StateCollector combines with tick/tile tracking to publish `state.opFeedback`. | `this.mapFlagUnsetCount++;` |
| 20 | `PLAYER_INFO` handler (first statement) | Fire `onGameTickCallback()` once per server tick, before `getPlayerPos()`. The rs-sdk tick-interval measurement (`lastTickTime`/`tickSpeedMultiplier`) is **not** ported. | `this.onGameTickCallback();` |
| 21 | top-of-file imports, the hook fields, the `installHooks({...})` bridge, the `PLAYER_INFO` handler (beside patch 20), and a new private method beside `emitInventoryDiff()` | **Hooks v2 / world bridge.** Value-imports `BotStateCollector` and `ActionExecutor` from `#/vendor/rs-sdk/bot/`; adds `botCollector`/`botExecutor` (lazy, built on first `getWorldState()`/`dispatch()`) and `hookGameTick`; adds `world: () => this.worldBridge()` to the bridge; `worldBridge()` returns `{ collector, executor, tick, cycle, extras }`, where `extras` reads the 274 hint/tutorial/interface fields listed below. `executor.setScanProvider(collector)` is wired here — `BotStateCollector implements ScanProvider`, and without it the `scanLocs`/`scanGroundItems`/prayer actions answer "Scan provider not available". | `private worldBridge(): WorldBridge {` |
| 21b | `PLAYER_INFO` handler, immediately after patch 20's `onGameTickCallback()` | **The world-state clock.** `hookGameTick++` then `emit('state', { tick })`. It lives here, not in `mainloop()` next to the `tick` emit, because `PLAYER_INFO` arrives once per **server** tick (600ms) while `mainloop()` runs at `deltime = 20ms`: the vendored collector measures its expiry windows in server ticks (`EVENT_EXPIRY_TICKS = 50`, i.e. 30s), so feeding it client cycles would shrink every window to ~1/30th and stamp every event in the wrong unit. `hookGameTick` is monotonic across relogs — the collector's caches assume ticks never go backwards. | `this.hookGameTick++;` |
| 22 | private fields (patch 2 block) | `armedUser`, `armedPass`, `armedLabel`, `renderSuspended`, `attended`. The armed credentials are a separate copy of `loginUser`/`loginPass` because `logout()` clears those. | `private armedUser: string = '';` |
| 23 | `installHooks({...})` bridge (patch 3) | `armLogin(gameName, secret, label)` sets `headlessTitle` and stores the credentials without logging in; `loginArmed()` copies them into `loginUser`/`loginPass` and arms `pendingHeadlessLogin`, or resolves `{ ok: false, code: -1, reason: 'No character armed.' }` when nothing is armed; `setRenderSuspended(v)` sets the flag and calls `refresh()` on `false`; `setAttended(v)` sets the flag. The existing `login` closure also fills the armed copy, and re-labels whenever the game name differs from the armed one. | `loginArmed: (): Promise<LoginResult>` |
| 24 | `titleScreenDraw()` (patches 8, 9) + a new private method | Under `headlessTitle`: `loginscreen === 0` draws `armedLabel` then one centred "Login" button instead of `Waiting for idlescape...`. Both the label and the button are drawn only when something is armed, so the button always matches `armedLoginHit()`. The `loginscreen === 2` branch draws the same button under `loginMes1/2` as **defence in depth** — nothing assigns `loginscreen = 2` while `headlessTitle` is set (every assignment lives in the non-headless half of `titleScreenLoop()`), so it is unreachable today. No username or password fields are ever drawn. | `private drawArmedLoginButton(w: number, h: number): void {` |
| 25 | `titleScreenLoop()` (patch 7) + a new private method | Under `headlessTitle`: fire a pending hook login as before, otherwise hit-test the Login button and log in with the armed credentials. Screen-space geometry mirrors the stock title buttons, so the button sits at native canvas (394, 306) on a 789x532 canvas. | `private armedLoginHit(): boolean {` |
| 26 | `mainredraw()` (after the error check) | `if (this.renderSuspended && this.ingame) return;` — draw is the only thing suspended; `mainloop()` keeps reading packets, moving entities and building maps (phase-a F1, F4). | `if (this.renderSuspended && this.ingame) {` |
| 27 | idle block in `gameLoop()` | `attended` guard on the 90 s `IDLE_TIMER` send: the stock condition is kept and its body moves under `if (!this.attended)`, with an `else { this.idleTimer = now; }` so the timer cannot go stale while attended (a stale timer would fire the block every tick, a burst of `IDLE_TIMER` packets with `logoutTimer` pinned at 250, the moment `attended` flips back off). The polarity follows the hook contract, "suppresses the client's own 90 s idle-logout packet while true" (`src/hooks/types.ts`), and the shell calls `setAttended(true)` for every session it owns (`web/src/sessions/manager.ts`). **Production-only for the engine effect** (`world.json` `node.debug: true` makes `IdleTimerHandler` a no-op today, phase-a critic report row 10); the client-side effect, avoiding `logoutTimer = 250` turning a `lostCon()` into a hard logout, applies now. | `if (!this.attended) {` plus the polarity check above |
| 28 | private fields (patch 2 block), the `installHooks({...})` bridge (patch 3), and three new private methods beside `emitInventoryDiff()` | **SP8b item art.** `getObjIcon(id, count)` renders `ObjType.getSprite(id, count, 0)` (32x32 `Pix32`, 0 = transparent) into a PNG data URL and memoises it per `(id, count)` in `objIconMemo`, capped at `OBJ_ICON_MEMO_MAX`; `getObjInfo(id)` returns `{ name, examine, cost, stackable, noted }`. `isObjId` bound-checks against `ObjType.numDefinitions`, which also covers the `ObjType.list` throw before the config archive loads, and `normaliseObjCount` collapses a non-positive-integer count to 1 so a caller cannot park `ohi = NaN` in the shared `ObjType.spriteCache`. An unexpected ObjType throw is reported once per session by `warnObjArtFault` (getSprite's global save and restore has no `finally`) and answers `null`. The 274 obj cache has no `tradeable` field, so none is exposed. | `private objIconDataUrl(id: number, count: number): string \| null {` |

`hookState()` also returns `position` (`{ x, z, level }`, the local player's absolute tile:
`(mapBuildCentreZoneX - 6) * 8 + (localPlayer.x >> 7)`, likewise for `z`, with `minusedlevel`
as the plane; all zero before the first player packet) and `activeTab` (`activeIcon`, the
selected sidebar tab, 3 = inventory) and `sceneReady` (`sceneState === 2`, the region scene is built and the loading bar is gone). `gameName` is `loginUser` (the stable login username)
and only falls back to `localPlayer.name` (the formatted display form) when no login has
been attempted. `bundle.ts` reserves `position`/`x`/`z`/`activeTab`/`sceneReady`.

### Patch 21's 274 anchors (`extras`)

| Extras member | 274 field | Written by |
|---|---|---|
| `hint()` | `hintType`, `hintNpc`, `hintPlayer`, `hintTileX`, `hintTileZ`, `hintHeight` (all `private`, declared together in the field block) | `ServerProt.HINT_ARROW` handler. It reads `hintType` first; `1` stores `hintNpc` (g2), `2..6` collapse **to `2`** after setting `hintOffsetX/Z`, then store `hintTileX`/`hintTileZ` (g2) and `hintHeight` (g1); `10` stores `hintPlayer` (g2). `hintType` is cleared to `0` in the `login()` `response === 2` reset block. So `collectWorldExtras`'s `2..6` tile branch only ever sees `2` on 274 — the wider range is kept so a bump that stops collapsing still works. |
| `flashIcon()` | `tutFlashIcon` (`-1` = none) | `ServerProt.TUT_FLASH` handler (`this.tutFlashIcon = this.in.g1()`); cleared to `-1` in the `login()` reset block and by `drawSidebar()` once the flashing tab becomes the active one. |
| `tutorialRoot()` | `tutComId` (`-1` = closed) | `ServerProt.TUT_OPEN` (`this.tutComId = this.in.g2b()`); cleared in the `login()` reset block. **The tutorial box is not a chat/main modal on 274** — `TUT_OPEN` never touches `chatModalId`/`mainModalId`, and the box is drawn by its own branch in `drawChat()`. So `tutorial.open` must come from this field; deriving it from the tutorial components' text latches on permanently, because `IF_SETTEXT` never clears a component's text once written. `worldExtras.ts` gates `title`, `lines` **and** the tutorial entries of `interfaceTexts` on it for the same reason. |
| `componentText(id)` | `IfType.list[id]?.text` (`string \| null`) | `ServerProt.IF_SETTEXT` handler (`IfType.list[comId].text = text`). |
| `modalComponentIds()` | `chatModalId`, `mainModalId` (`-1` = none) expanded through `IfType.list[id]?.children` (`number[] \| null`) | `ServerProt.IF_OPENCHAT` sets `chatModalId`; `IF_OPENMAIN` / `IF_OPENMAIN_SIDE` set `mainModalId`; `IF_CLOSE` and the `login()` reset block set both to `-1`. `children` is filled by `IfType`'s decoder. |
| `position()` | delegates to `hookState().position` | see the `hookState()` note above. |

The tutorial text-box component ids live in `client/src/hooks/worldExtras.ts`
(`TUTORIAL_TEXT` = root 6179, title 6180, lines 6181-6184) — content-pack ids, not client
fields, so they are asserted by `worldExtras.test.ts` rather than grepped out of `Client.ts`.

`hookState()` also returns `hp`/`prayer` (`{ current: statEffectiveLevel[idx], max: statBaseLevel[idx] }`
for hitpoints=3, prayer=5), `energy` (`runenergy`, 0–100), and `boosts` (per-skill
`statEffectiveLevel[i] - statBaseLevel[i]`). `bundle.ts` reserves `hp`/`prayer`/`energy`/`boosts`/
`current`/`max` alongside the existing `ClientState` property names so terser's property mangler
doesn't rename them.

Hooks v2 adds `getWorldState()` and `dispatch()` to `window.idlescape.client`, and the `state`
and `action` events to `HookEvents`. `bundle.ts` reserves `getWorldState`/`dispatch` plus the
`WorldExtras` and `ActionResult` field names (`hint`, `tutorial`, `flashingTab`,
`interfaceTexts`, `regionId`, `zone`, `open`, `title`, `lines`, `tile`, `npcIndex`,
`playerIndex`, `height`, `success`, `message`, `phase`, `data`, `type`, `action`, `result`,
`tick`) **and, harvested at build time by `vendoredBotProperties()`, every field name declared
in `src/vendor/rs-sdk/bot/types.ts`** (147 of them). Both directions need it: `getWorldState()`
hands the web a `BotWorldState`, and `dispatch()` takes a `BotAction` object literal the web
builds by hand — a mangled *input* name such as `optionIndex`, `locId` or `itemSlot` arrives as
`undefined` and the action dispatches with the field silently dropped. The harvest is a regex
over the file, so adding a field upstream needs no edit here; over-reserving is harmless.
Verify after a bump with `bun run build && grep -c optionIndex out/client.js` (expect 1).
`bundle.ts` additionally reserves `armLogin`, `loginArmed`, `setRenderSuspended`,
`setAttended` (SP7).
Patch 28 adds `getObjIcon`, `getObjInfo` and the `ObjInfo` field names `examine`, `cost`,
`stackable`, `noted` (SP8b); `name` and `id` were already reserved.

`WorldExtras` is deliberately **flat**: `regionId` and `zone` (the absolute tile `>> 3`) sit next
to `hint`/`tutorial` rather than under a `location` object, and `interfaceTexts` is a flat
`Record<number, string>`. The web-side mirror must follow the same shape.

## Revision-274 verification notes (re-checked this bump)

- **Inventory `+1` slot offset: PRESENT on 274 — `- 1` is required.** The three sidebar/interface
  draw sites read the object id as `linkObjType[slot] - 1`, each guarded by `linkObjType[slot]
  > 0` (0 = empty slot):
  - `ObjType.list(child.linkObjType[slot] - 1)` — guarded by `linkObjType[slot] <= 0` skip.
  - `const id: number = child.linkObjType[slot] - 1;` — guarded by `linkObjType[slot] > 0`.
  - `ObjType.list(child.linkObjType[slot] - 1)` — guarded by `linkObjType[slot] > 0`.

  The `UPDATE_INV_FULL`/`UPDATE_INV_PARTIAL` handlers store the raw server value and zero-fill
  empty slots, so the client holds `objId + 1`. `hookState()` and `emitInventoryDiff()` apply
  `- 1` for `> 0` and treat `0` as empty — consistent with the draw code.
- **Chat type numbers on 274 (`drawChat`): unchanged from 225.** `0` = game (black); `1` =
  filtered public / `2` = public (sender + blue); `3` = incoming private "From X:" / `7` = same,
  unfiltered; `4` = trade request (0x800080); `5` = login/logout notification (dark red); `6` =
  outgoing private "To X:"; `8` = duel request (0x7e3200). Mapping used: `1|2 → public`,
  `3|6|7 → private`, everything else (`0,4,5,8`) → `game`. `echoChat` uses type `0` → `game`.
  `HookEvents.chat.kind` only distinguishes game/public/private, so trade (4/8) and login-notice
  (5) collapse to `game`.
- **Login response codes on 274:** `2` = fresh accept (sets `ingame`, calls `prepareGame`), `15`
  = reconnect accept (sets `ingame`, no `prepareGame`), `1`/`21` recurse, and there **is** a
  generic `else` (unlike 225). Patch 5's post-chain resolver covers all failure codes cleanly via
  the `!this.ingame` discriminator, so no per-branch failure blocks are needed.
- **`bundle.ts` (274):** already emits `ondemandworker.js` (entrypoint `src/io/OnDemandWorker.ts`,
  new in 274) alongside `client.js` and `mapview.js`, and copies `tinymidipcm.wasm`. 274 dropped
  the bzip2 wasm (pure-JS `src/io/BZip2.js` + `fflate` gunzip), so no `bzip2.wasm` is produced.
  The idlescape terser `reserved` block was ported into 274's `bundle.ts` so the public hook
  property names survive minification.
- **Soundfont:** not a client build artifact. The front server serves it (and `deps.js`) from
  the engine's shipped `public/client` as a fallback (`server/src/static.ts`).
- **`installHooks` now also exposes `window.idlescape.plugins`** (a client-tier plugin
  registry) built with a `ClientCapability` whose `state()` delegates to the hook bridge;
  `renderer/scene/menu` are stubs pending SP2b-2/SP5; `bundle.ts` reserves `plugins/enable/disable`.
