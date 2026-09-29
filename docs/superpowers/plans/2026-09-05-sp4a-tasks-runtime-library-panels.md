# SP4a — Tasks runtime, script library and panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player (or Playwright) can open the Marketplace tab, run a built-in script, watch it in the Tasks tab and the canvas banner, pause it by clicking in the game, resume it, stop it, read its trace, and save scripts of their own; all of it driven through one in-page API, `window.idlescape.tasks`.

**Architecture:** The client fork gains rs-sdk's bot surface (vendored, MIT) and hooks v2 (`getWorldState`, `dispatch`) with our tutorial/hint/interface-text additions. The web shell vendors rs-sdk's `sdk/` (BotSDK plumbing and BotActions porcelain) behind a `Transport` interface, runs scripts inside a dedicated Worker through a priority-task runner that emits a structured trace, stores user scripts in Firestore and run history in IndexedDB, and exposes two shell plugins (Tasks, Marketplace) plus a run banner. No `/tab` or `/mcp` in this plan (SP4c).

**Tech Stack:** Client fork (Bun build, `bun test`), Vite + TypeScript shell (Vitest + jsdom, Playwright), Firestore rules (`@firebase/rules-unit-testing`), `fake-indexeddb` for history tests.

**Spec:** `docs/superpowers/specs/2026-09-05-sp4-tasks-scripting-environment-design.md` sections 3 to 10, 12, 14, 15 (item 1), 16, 17. Superseded sections of `2026-09-05-sp4-agent-runtime-design.md` do not apply.

## Global Constraints

- Strict TypeScript, no new `as any` outside `vendor/` directories, files under 400 lines outside `vendor/`, `types.ts` per package, conventional commits (roadmap spec section 5).
- Vendored code lives under `<package>/src/vendor/rs-sdk/` (the client's `#/*` import alias maps to `src/`, so `vendor/` sits under `src/`), keeps rs-sdk's MIT `LICENSE` beside it, and every local edit is listed in `<package>/src/vendor/PATCHES.md`. rs-sdk upstream commit to pin: `56b73e08fc01a1d683d7a86d145a494ae945d071` (fetched 2026-09-05).
- The public hook contract survives minification: every new property name crossing `window.idlescape.*` is added to the terser `reserved` list in `client/bundle.ts`.
- Design system (`2026-09-05-idlescape-design-system.md`): one orange accent, sentence case, `.badge`, `.dot`, `.alert`, `.kv`, `.btn`, `.card` classes from `web/src/styles/`, `h()`/`badge()`/`kv()` builders from `web/src/ui/el.ts`; no `innerHTML` with unescaped user text.
- Script code never runs on the main thread: only inside `web/src/agent/worker.ts`. Manual actions are refused with `run_active` while a run is `running`.
- Do not touch `engine/`, `server/src/characters/*`, `web/src/home/*`, `web/src/characters/*` (SP6 is in flight on this branch by another session; always `git add` explicit paths).
- Branch: `feat/platform-shell`. Commit trailers on every commit:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_018uuDm8cdH9rfPYS88TrEbC
  ```
- Commands (Git Bash, repo root): client — `cd client && ~/.bun/bin/bun test src/hooks src/vendor && bunx tsc --noEmit && ~/.bun/bin/bun run build:dev`; web — `cd web && npm run typecheck && npm run lint && npx vitest run`; rules — `cd firebase && npm test` (self-contained emulator exec); e2e — stack up per `scripts/verify.ps1` step 6, then `cd web && npx playwright test`.
- Ruling recorded here (amends spec section 15 item 1): the collision generator and global A* (`scripts/gen/collision.ts`, `pathfinding.ts`) move to the SP4b plan. In SP4a `walkTo` uses the client's own routefinder (scene-local, `outOfRange` legs), which covers Tutorial Island's hint targets and the skilling loops. The spec file is updated in Task 14.

## Interfaces from earlier work

- `client/src/hooks/types.ts`: `ClientHooks { login, logout, echoChat, getState, getObjName, on }`, `ClientState`, `HookEvents`, `HookBridge`; `client/src/hooks/install.ts` `installHooks(bridge)` builds `window.idlescape.client` and `.plugins`.
- `client/src/client/Client.ts` patches 1 to 16 in `client/PATCHES.md`; `hookState()`, `emitInventoryDiff()`, `hooksEmitter`.
- `web/src/plugins/types.ts`: `definePlugin`, `ShellPlugin { manifest, onEnable, onDisable, panel, overlay, onTick }`, `PluginContext { client, settings, storage, notify, openPanel, user }`.
- `web/src/frame/panels.ts` `PanelView { title, mount(body), unmount? }`; `web/src/types.ts` `PanelId` union (extend it).
- `web/src/main.ts`: `shell.register(...)`, `contextFor(id)`, `deps`, `hooks`, `notify()`, `byId('canvas')`, `pluginOverlayHost`.
- `web/src/plugins/firestoreBackend.ts` (Firestore write pattern), `web/src/firebase.ts` `db`, `web/src/ui/el.ts` `h/kv/badge/alert/empty`, `web/src/ui/toast.ts`.
- `web/e2e/helpers.ts`: `openGate`, `loginAsGuest`, `clientState`, `canvasClick`, `VIEWPORT_CENTRE`.

---

## File Structure

Client (`client/`):
- `src/client/Client.ts` — **Modify.** Bot surface block (patch 17), message tick fields (18), `mapFlagUnsetCount` (19), tick callback (20), `dispatch` idle reset and `hookWorldExtras()` (21).
- `src/vendor/rs-sdk/LICENSE`, `src/vendor/PATCHES.md` — **Create.**
- `src/vendor/rs-sdk/bot/{types,StateCollector,ActionExecutor,ActionQueue,reach,formatters}.ts` + `*.test.ts` — **Create** (vendored).
- `src/hooks/world.ts` — **Create.** `getWorldState()`, `dispatch()`, per-cycle cache, `WorldExtras` merge.
- `src/hooks/worldExtras.ts` + test — **Create.** `hint`, `tutorial`, `flashingTab`, `interface.texts`, `regionId` from a `ClientExtrasBridge`.
- `src/hooks/types.ts`, `src/hooks/install.ts`, `bundle.ts`, `PATCHES.md` — **Modify.**

Web (`web/`):
- `src/vendor/rs-sdk/LICENSE`, `src/vendor/PATCHES.md` — **Create.**
- `src/vendor/rs-sdk/sdk/{types,index,actions,actions-helpers,action-quantity,spells,trade-helpers,chunking,chat-history,pathfinding}.ts` — **Create** (vendored; `index.ts` transport-injected; `pathfinding.ts` is our scene-local shim).
- `src/agent/types.ts` — **Create.** `Transport`, `WorkerToMain`, `MainToWorker` message unions, `RunStatus`.
- `src/agent/localTransport.ts` + test — **Create.** `createLocalTransport(hooks)`.
- `src/agent/localSdk.ts` + test — **Create.** `createLocalSdk(transport)` returning `BotSDK` bound to the transport.
- `src/agent/worker.ts` — **Create.** Worker entry: builds `ScriptContext`, compiles scripts, hosts the runner.
- `src/agent/workerHost.ts` + test — **Create.** Main-thread side: spawns the Worker, forwards state ticks, RPC for bot/sdk calls, exposes run control.
- `src/agent/rpc.ts` + test — **Create.** Message framing helpers shared by worker and host.
- `src/tasks/types.ts` — **Create.** `Script`, `Task`, `ScriptManifest`, `ParamSchema`, `Requirement`, `TraceEvent`, `RunSummary`, `TaskSummary`.
- `src/tasks/defineScript.ts` + test — **Create.** `defineScript`, `validateParams`, `compileUserScript`.
- `src/tasks/requirements.ts` + test — **Create.** `evaluateRequirements(reqs, state)`.
- `src/tasks/runner.ts` + test — **Create.** Priority-task loop, pause reasons, stuck, attempts, timeouts.
- `src/tasks/trace.ts` + test — **Create.** Trace buffer, coalescing, caps, summary.
- `src/tasks/history.ts` + test — **Create.** IndexedDB run history.
- `src/tasks/userStore.ts` + test — **Create.** Firestore `users/{uid}/tasks`.
- `src/tasks/library/index.ts`, `library/chopAndDrop.ts`, `library/netFishAndDrop.ts`, `library/mineAndDrop.ts` + tests, `library/loopHelpers.ts` — **Create.**
- `src/tasks/api.ts` + test — **Create.** `createTasksApi(deps)` = `window.idlescape.tasks`.
- `src/tasks/humanInput.ts` + test — **Create.** Canvas input watcher with idle timer.
- `src/plugins/builtin/tasks.ts`, `tasksViews.ts`, `traceView.ts` + tests — **Create.** Tasks tab.
- `src/plugins/builtin/marketplace.ts` + test — **Create.** Marketplace tab.
- `src/frame/runBanner.ts` + test, `src/styles/tasks.css` — **Create.** Banner, strip dot.
- `src/main.ts`, `src/types.ts`, `src/clientTypes.ts`, `src/styles/index.css`, `package.json` — **Modify.**
- `e2e/tasks.pw.test.ts` — **Create.**

Firebase: `firebase/firestore.rules`, `firebase/rules.test.ts` — **Modify.**
Docs: `CREDITS.md`, `docs/superpowers/specs/2026-09-05-sp4-tasks-scripting-environment-design.md` (section 15 note) — **Modify.**

---

### Task 1: Port the rs-sdk bot surface into `Client.ts`

**Files:**
- Modify: `client/src/client/Client.ts`
- Modify: `client/PATCHES.md`
- Create: `client/src/vendor/rs-sdk/LICENSE`, `client/src/vendor/PATCHES.md`

**Interfaces:**
- Consumes: pristine 274 `Client.ts` members (`tryMove`, `IfType.list`, `chatModalId`, `mainModalId`, `npc`, `npcIds`, `localPlayer`, `out`, `ClientProt`).
- Produces (public on `Client`): `walkTo(x, z, running): WalkResult`, `interactNpc(npcIndex, optionIndex): ClientActionResult`, `interactLoc(x, z, locId, optionIndex): ClientActionResult`, `talkToNpc(npcIndex)`, `interactPlayer`, `pickupGroundItem`, `interactGroundItem`, `useInventoryItem(slot, opIndex)`, `dropInventoryItem(slot)`, `useItemOnItem/Loc/Npc`, `clickEquipmentSlot`, `clickDialogOption(index)`, `getDialogOptions()`, `getDialogText()`, `captureDialogToHistory()`, `getDialogHistory()`, `isDialogOpen()`, `isModalOpen()`, `getModalInterface()`, `getChatInterface()`, `isChatBackInputOpen()`, `isWaitingForDialog()`, `getInterfaceOptions()`, `clickInterfaceOption`, `clickComponent(componentId)`, `clickInterfaceIop`, `setTab(tab)`, `isShopOpen/getShopState/shopBuy/shopSell/closeShop`, `isBankOpen/getBankItems/findBankItemSlot/bankDeposit/bankWithdraw`, `submitCountDialog(n)`, `closeBotModal()`, `setCombatStyle/getCombatStyle`, `say(text): SayOutcome`, `sendPrivateMessage`, `spellOnNpc/Player/Item/GroundItem`, `acceptCharacterDesign`, `randomizeCharacterDesign`, `setCharacterDesign`, `findNpcByName`, `getNearbyNpcs`, `getPlayerPosition`, `projectTileToScreen/NpcToScreen/PlayerToScreen`, `setBotClickVisual` (no-op), `getMaxMessageLength()`, `isInGame()`, `getClientCycle()`, `setOnGameTickCallback(cb)`, field `mapFlagUnsetCount`, exported `normaliseComponentText`, types `ClientActionResult`, `ClientActionFailureReason`, `SayOutcome`.

- [ ] **Step 1: Fetch rs-sdk at the pinned commit into a scratch directory**

```bash
SCRATCH="$TMPDIR/rs-sdk-src"; rm -rf "$SCRATCH"
git clone --filter=blob:none --no-checkout https://github.com/MaxBittker/rs-sdk "$SCRATCH"
cd "$SCRATCH" && git sparse-checkout init --cone && git sparse-checkout set server/webclient/src/bot server/webclient/src/client sdk learnings
git checkout 56b73e08fc01a1d683d7a86d145a494ae945d071
git show HEAD:LICENSE > LICENSE.txt
# Normalise line endings and diff their Client.ts against pristine upstream 274 to see the 39 hunks
curl -sL https://raw.githubusercontent.com/LostCityRS/Client-TS/7d6ca61abda277cfed87d542e9e4aa3fe383b38d/src/client/Client.ts | tr -d '\r' > up.ts
tr -d '\r' < server/webclient/src/client/Client.ts > rs.ts
diff -u up.ts rs.ts > client.patch; grep -c '^@@' client.patch   # expect 39
```

- [ ] **Step 2: Write the block-presence test (a grep list, like the existing PATCHES.md verifier)**

Append to `client/PATCHES.md` under a new heading `## Patch 17-21 verification` (the greps double as the test; each must print the number shown):

```sh
cd client
grep -c "// === IDLESCAPE BOT SURFACE (vendored from rs-sdk, MIT) ==="   src/client/Client.ts  # 1
grep -c "// === END IDLESCAPE BOT SURFACE ==="                            src/client/Client.ts  # 1
grep -c "^    walkTo(x: number, z: number"                                src/client/Client.ts  # 1
grep -c "^    interactLoc(x: number, z: number, locId: number"           src/client/Client.ts  # 1
grep -c "^    getDialogOptions()"                                         src/client/Client.ts  # 1
grep -c "mapFlagUnsetCount: number = 0;"                                  src/client/Client.ts  # 1
grep -c "this.mapFlagUnsetCount++;"                                       src/client/Client.ts  # 1
grep -c "private messageSequence: number\[\]"                             src/client/Client.ts  # 1
grep -c "this.messageSequence\[0\] = ++this.nextMessageSequence;"        src/client/Client.ts  # 1
grep -c "this.onGameTickCallback();"                                      src/client/Client.ts  # 1
grep -c "export function normaliseComponentText"                          src/client/Client.ts  # 1
grep -c "setPacketLogging\|enableAgentMode\|autoLogin\|botOverlay"        src/client/Client.ts  # 0
```

- [ ] **Step 3: Run the greps to confirm they fail (all 1s print 0 today)**

Run the block above. Expected: every `# 1` line prints `0`; the last prints `0`.

- [ ] **Step 4: Apply the port**

Work from `client.patch` and `rs.ts` in the scratch directory. In `client/src/client/Client.ts`:

1. **Top-level additions** (from hunks 1, 3, 4): after the existing imports add
   `import type { WalkResult } from '#/vendor/rs-sdk/bot/types.js';` (the file lands in Task 2; add it now, typecheck runs at the end of Task 2). Copy the module-level `normaliseComponentText`, `SayOutcome`, `ClientActionFailureReason`, `ClientActionResult` declarations verbatim from `rs.ts` lines 96 to 150 (the `@@ -85,9 +96,55 @@` hunk), placing them above `export class Client`. Do NOT copy `ENABLE_BOT_SDK`, `BotSDKModule`, `BotOverlay`, `LoopCycle`, or `static maxMessageLength`; instead add `static readonly maxMessageLength: number = 80;` inside the class.
2. **Fields** (hunks 8, 9, 10): copy `messageTick`, `messageSequence`, `nextMessageSequence`, `dialogHistory`, `dialogHistoryMax`, `lastCapturedDialogId`, `mapFlagUnsetCount` and `onGameTickCallback` declarations verbatim next to the existing `chatType` fields. Skip `botOverlay`, `botAutoLoginAttempted`, `loginInProgress`, `lastTickTime`, `measuredTickInterval`, `tickSpeedMultiplier`, and the constructor signature change.
3. **The block** (hunk 11): copy `rs.ts` lines from `// === BOT SDK PUBLIC METHODS ===` through `// === END BOT SDK PUBLIC METHODS ===` into the class directly after the constructor, then delete these sub-sections inside the copy: packet logging (`packetLog` fields, `PACKET_NAMES`, `setPacketLogging`, `isPacketLoggingEnabled`, `getPacketLog`, `clearPacketLog`, `setPacketLogCallback`, `logPacket`, `writePacketOpcode`), credentials and login (`setCredentials`, `getCredentials`, `triggerLogin`, `getTitleState`, `goToLoginScreen`, `autoLogin`), and agent mode (`enableAgentMode`, `toggleAgentMode`, `isAgentModeEnabled`). Rename the two boundary comments to `// === IDLESCAPE BOT SURFACE (vendored from rs-sdk, MIT) ===` and `// === END IDLESCAPE BOT SURFACE ===`. Replace the body of `setBotClickVisual` with `/* overlay removed */`. Keep `getMaxMessageLength`, `isInGame`, `getClientCycle`, `setOnGameTickCallback`. Every `console.log(` inside the block becomes `// console.log(` (the shell logs through the trace).
4. **Call-site hunks**: in `addChat()` (hunk 38) shift `messageTick`/`messageSequence` with the other arrays and stamp `this.messageTick[0] = Client.loopCycle; this.messageSequence[0] = ++this.nextMessageSequence;`; in the chat reset loop (hunk 14) add `this.messageSequence[i] = 0;`; in the `UNSET_MAP_FLAG` handler (hunk 33) add `this.mapFlagUnsetCount++;` beside `this.minimapFlagX = 0;`; in the `PLAYER_INFO` handler (hunk 31) add only the `if (this.onGameTickCallback) { this.onGameTickCallback(); }` lines (not the tick-interval measurement).
5. **Skip entirely**: hunks 2, 5, 6, 7, 12, 13, 15, 16, 17, 18, 20, 21, 22 to 30, 32, 34 to 37, 39 (LoopCycle, XP curve, camera pitch, auto-login, username validation, overlay hooks, idle timer, packet log, always-run, transmog, tick multiplier, MESSAGE_PUBLIC, debug breadcrumbs).
6. Where the copied block references a private upstream field under a different name on our 274 tree, fix the reference and add a row to `client/src/vendor/PATCHES.md`. Known drift to check first: `this.chatModalId`, `this.mainModalId`, `this.viewportInterfaceId`, `this.sidebarInterfaceId`, `this.chatbackInput`, `this.chatbackInputOpen`, `this.objSelected`, `this.spellSelected`, `this.pressedContinueOption`, `this.tryMove` signature (11 params on 274).

- [ ] **Step 5: Create the vendor license and patch ledger**

`client/src/vendor/rs-sdk/LICENSE`: the MIT text from `LICENSE.txt` in the scratch clone, unchanged.

`client/src/vendor/PATCHES.md`:

```markdown
# client/src/vendor/PATCHES.md — local changes to vendored rs-sdk code

Upstream: https://github.com/MaxBittker/rs-sdk at 56b73e08fc01a1d683d7a86d145a494ae945d071 (MIT).

## Client.ts bot surface (client/PATCHES.md patches 17-21)
| Upstream item | Ours | Why |
|---|---|---|
| `// === BOT SDK PUBLIC METHODS ===` block | `// === IDLESCAPE BOT SURFACE ... ===` block, minus packet logging, credentials/login, agent mode | We log through the shell trace; login is hooks patch 3; no agent UI. |
| `setBotClickVisual` draws a red marker | body emptied | Overlay UI not vendored. |
| `console.log` calls in the block | commented out | Trace owns logging. |

## bot/ module
| File | Change | Why |
|---|---|---|
| rows are added by Task 2 as drift is fixed | | |
```

- [ ] **Step 6: Run the greps and the compiler**

```bash
cd client && grep -A14 "## Patch 17-21 verification" PATCHES.md | grep "^grep" | while read -r line; do eval "$line"; done; bunx tsc --noEmit 2>&1 | grep -v "vendor/rs-sdk/bot/types" | head
```

Expected: every grep prints its number; `tsc` reports only the missing `#/vendor/rs-sdk/bot/types.js` module (resolved in Task 2) and nothing else.

- [ ] **Step 7: Record patches 17 to 21 in `client/PATCHES.md`**

Add rows 17 to 21 to the patch table (anchor member, purpose, proving grep) mirroring rows 1 to 16: 17 bot surface block (after the constructor), 18 message tick/sequence fields and `addChat`, 19 `mapFlagUnsetCount` in `UNSET_MAP_FLAG`, 20 `onGameTickCallback` in `PLAYER_INFO`, 21 reserved for Task 2's `hookWorldExtras()`.

- [ ] **Step 8: Commit**

```bash
git add client/src/client/Client.ts client/PATCHES.md client/src/vendor/rs-sdk/LICENSE client/src/vendor/PATCHES.md
git commit -m "feat(client): vendor the rs-sdk bot surface into Client.ts (patches 17-20)"
```

---

### Task 2: Vendor the bot module, hooks v2, and the world-state extras

**Files:**
- Create: `client/src/vendor/rs-sdk/bot/types.ts`, `StateCollector.ts`, `ActionExecutor.ts`, `ActionQueue.ts`, `reach.ts`, `formatters.ts`, and their `*.test.ts`
- Create: `client/src/hooks/worldExtras.ts`, `client/src/hooks/worldExtras.test.ts`, `client/src/hooks/world.ts`
- Modify: `client/src/hooks/types.ts`, `client/src/hooks/install.ts`, `client/src/client/Client.ts` (patch 21), `client/bundle.ts`, `client/PATCHES.md`, `client/src/vendor/PATCHES.md`, `CREDITS.md`

**Interfaces:**
- Consumes: Task 1's public methods; vendored `BotStateCollector(client).collectState(tick)`, `ActionExecutor(client).execute(action)`, `BotActionQueue`.
- Produces: `ClientHooks.getWorldState(): WorldState`, `ClientHooks.dispatch(action: BotAction): Promise<ActionResult>`, `HookEvents.state { tick }`, `HookEvents.action { id, action, result }`; `WorldState = BotWorldState & WorldExtras`; `WorldExtras { hint, tutorial, flashingTab, interfaceTexts, regionId }`; `HookBridge.extras(): ClientExtrasBridge`.

- [ ] **Step 1: Copy the module and rewrite imports**

```bash
SRC="$TMPDIR/rs-sdk-src/server/webclient/src/bot"; DST=client/src/vendor/rs-sdk/bot; mkdir -p $DST
for f in types StateCollector ActionExecutor ActionQueue reach formatters; do cp $SRC/$f.ts $DST/; [ -f $SRC/$f.test.ts ] && cp $SRC/$f.test.ts $DST/; done
cp $SRC/ClientInteraction.test.ts $DST/
sed -i "s#'#/bot/#'#/vendor/rs-sdk/bot/#g; s#'./#'./#g" $DST/*.ts
grep -n "GatewayConnection\|BotOverlay\|OverlayUI" $DST/*.ts   # expect none
```

Each file keeps its content; add one header line `// Vendored from rs-sdk (MIT) 56b73e08; see client/src/vendor/PATCHES.md` at the top.

- [ ] **Step 2: Run the vendored tests and list drift**

```bash
cd client && ~/.bun/bin/bun test src/vendor 2>&1 | tail -30
```

Expected on first run: failures naming fields that differ on our tree (the collector reads `Client` privates through `as any`, so only runtime shape matters). Fix each by adjusting the vendored file to our 274 member names and add a row per fix in `client/src/vendor/PATCHES.md` (`bot/` table). `reach.ts` expects `client.collision` and `client.ensureCollision()`; if our `Client` exposes the level collision maps under `levelCollisionMap`, add to the bot surface block (Task 1's block, still patch 17) `get collision(): (CollisionMap | null)[] { return this.levelCollisionMap; }` and `ensureCollision(level: number): CollisionMap | null { return this.levelCollisionMap[level]; }` and record it. Re-run until green.

- [ ] **Step 3: Write the failing extras test**

`client/src/hooks/worldExtras.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { collectWorldExtras, TUTORIAL_TEXT } from './worldExtras';

function bridge(over: Partial<Parameters<typeof collectWorldExtras>[0]> = {}) {
  return {
    hint: () => ({ type: 0, npc: 0, player: 0, tileX: 0, tileZ: 0, height: 0 }),
    flashIcon: () => -1,
    componentText: (_id: number) => null as string | null,
    modalComponentIds: () => [] as number[],
    position: () => ({ x: 3094, z: 3107, level: 0 }),
    ...over
  };
}

describe('collectWorldExtras', () => {
  test('no hint, no tutorial box', () => {
    const e = collectWorldExtras(bridge());
    expect(e.hint).toEqual({ kind: 'none' });
    expect(e.tutorial).toEqual({ open: false, title: '', lines: [] });
    expect(e.flashingTab).toBeNull();
    expect(e.regionId).toBe((3094 >> 6) << 8 | (3107 >> 6));
  });
  test('npc hint and a flashing inventory tab', () => {
    const e = collectWorldExtras(bridge({ hint: () => ({ type: 1, npc: 42, player: 0, tileX: 0, tileZ: 0, height: 0 }), flashIcon: () => 3 }));
    expect(e.hint).toEqual({ kind: 'npc', npcIndex: 42 });
    expect(e.flashingTab).toBe(3);
  });
  test('tile hint carries absolute tile and height', () => {
    const e = collectWorldExtras(bridge({ hint: () => ({ type: 2, npc: 0, player: 0, tileX: 3100, tileZ: 3110, height: 128 }) }));
    expect(e.hint).toEqual({ kind: 'tile', tile: { x: 3100, z: 3110, height: 128 } });
  });
  test('tutorial title and lines come from the tutorial_text components, colour codes stripped', () => {
    const texts: Record<number, string> = { [TUTORIAL_TEXT.title]: '@yel@Cut down a tree', [TUTORIAL_TEXT.line1]: 'Use this to get some logs', [TUTORIAL_TEXT.line2]: '' };
    const e = collectWorldExtras(bridge({ componentText: id => texts[id] ?? null, modalComponentIds: () => [TUTORIAL_TEXT.root] }));
    expect(e.tutorial).toEqual({ open: true, title: 'Cut down a tree', lines: ['Use this to get some logs'] });
    expect(e.interfaceTexts[TUTORIAL_TEXT.title]).toBe('Cut down a tree');
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `cd client && ~/.bun/bin/bun test src/hooks/worldExtras.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 5: Implement `worldExtras.ts`**

```ts
// client/src/hooks/worldExtras.ts — idlescape additions on top of the vendored collector.
export const TUTORIAL_TEXT = { root: 6179, title: 6180, line1: 6181, line2: 6182, line3: 6183, line4: 6184 } as const;
export const CHAR_DESIGN_INTERFACE = 3559;

export interface HintRaw { type: number; npc: number; player: number; tileX: number; tileZ: number; height: number }
export interface ClientExtrasBridge {
  hint(): HintRaw;
  flashIcon(): number;                         // tutFlashIcon, -1 when none
  componentText(id: number): string | null;    // IfType.list[id]?.text
  modalComponentIds(): number[];               // ids whose text is worth publishing: open chat modal + main modal roots and their children
  position(): { x: number; z: number; level: number };
}

export type Hint =
  | { kind: 'none' }
  | { kind: 'npc'; npcIndex: number }
  | { kind: 'player'; playerIndex: number }
  | { kind: 'tile'; tile: { x: number; z: number; height: number } };

export interface WorldExtras {
  hint: Hint;
  tutorial: { open: boolean; title: string; lines: string[] };
  flashingTab: number | null;
  interfaceTexts: Record<number, string>;
  regionId: number;
}

const strip = (s: string | null): string => (s ?? '').replace(/@\w{3}@/g, '').replace(/\s+/g, ' ').trim();

export function collectWorldExtras(b: ClientExtrasBridge): WorldExtras {
  const h = b.hint();
  const hint: Hint = h.type === 1 ? { kind: 'npc', npcIndex: h.npc }
    : h.type === 10 ? { kind: 'player', playerIndex: h.player }
    : h.type >= 2 && h.type <= 6 ? { kind: 'tile', tile: { x: h.tileX, z: h.tileZ, height: h.height } }
    : { kind: 'none' };
  const title = strip(b.componentText(TUTORIAL_TEXT.title));
  const lines = [TUTORIAL_TEXT.line1, TUTORIAL_TEXT.line2, TUTORIAL_TEXT.line3, TUTORIAL_TEXT.line4].map(id => strip(b.componentText(id))).filter(Boolean);
  const open = b.modalComponentIds().includes(TUTORIAL_TEXT.root) || title.length > 0;
  const interfaceTexts: Record<number, string> = {};
  for (const id of [...b.modalComponentIds(), ...Object.values(TUTORIAL_TEXT)]) {
    const t = strip(b.componentText(id));
    if (t) interfaceTexts[id] = t;
  }
  const flash = b.flashIcon();
  const p = b.position();
  return { hint, tutorial: { open, title, lines }, flashingTab: flash >= 0 ? flash : null, interfaceTexts, regionId: ((p.x >> 6) << 8) | (p.z >> 6) };
}
```

- [ ] **Step 6: Run the extras test**

Run: `cd client && ~/.bun/bin/bun test src/hooks/worldExtras.test.ts`. Expected: 4 pass.

- [ ] **Step 7: Hooks v2 types, `world.ts`, `install.ts`, and patch 21**

`client/src/hooks/types.ts` additions:

```ts
import type { BotWorldState, BotAction } from '#/vendor/rs-sdk/bot/types.js';
import type { ActionResult } from '#/vendor/rs-sdk/bot/ActionExecutor.js';
import type { WorldExtras, ClientExtrasBridge } from './worldExtras';
export type { BotAction, ActionResult, WorldExtras };
export type WorldState = BotWorldState & WorldExtras;

// HookEvents gains:
//   state: { tick: number };
//   action: { id: string; action: BotAction; result: ActionResult };
// ClientHooks gains:
//   getWorldState(): WorldState;
//   dispatch(action: BotAction): Promise<ActionResult>;
// HookBridge gains:
//   world(): { collector: import('#/vendor/rs-sdk/bot/StateCollector.js').BotStateCollector; executor: import('#/vendor/rs-sdk/bot/ActionExecutor.js').ActionExecutor; extras: ClientExtrasBridge; cycle(): number };
```

Write those members into the existing interfaces (not as comments).

`client/src/hooks/world.ts`:

```ts
import { BotActionQueue } from '#/vendor/rs-sdk/bot/ActionQueue.js';
import { collectWorldExtras } from './worldExtras';
import type { ActionResult, BotAction, HookBridge, WorldState } from './types';
import type { Emitter } from './emitter';
import type { HookEvents } from './types';

export function createWorldHooks(bridge: HookBridge, emitter: Emitter<HookEvents>) {
  const queue = new BotActionQueue();
  let cached: { cycle: number; state: WorldState } | null = null;
  let seq = 0;

  function getWorldState(): WorldState {
    const w = bridge.world();
    const cycle = w.cycle();
    if (cached && cached.cycle === cycle) return cached.state;
    const state = { ...w.collector.collectState(cycle), ...collectWorldExtras(w.extras) } as WorldState;
    cached = { cycle, state };
    return state;
  }

  async function dispatch(action: BotAction): Promise<ActionResult> {
    const id = `a${++seq}`;
    const entry = queue.enqueue({ action, actionId: id });
    if (!entry) return { success: false, message: 'action queue full', reason: 'busy' };
    while (queue.startNext() !== entry) await new Promise(r => setTimeout(r, 20));
    try {
      const result = await bridge.world().executor.execute(action);
      emitter.emit('action', { id, action, result });
      return result;
    } finally { queue.complete(entry); }
  }

  /** Human input cancels queued work (SP4 4.4). */
  function cancelAll(): void { queue.clear(); }

  return { getWorldState, dispatch, cancelAll };
}
```

`install.ts`: build `const world = createWorldHooks(bridge, emitter)` and add `getWorldState: world.getWorldState, dispatch: world.dispatch` to `hooks`; also `window.idlescape.client` stays the same object.

Patch 21 in `Client.ts` (constructor, next to the existing `installHooks({...})` bridge): add `world: () => this.worldBridge()` and a private method:

```ts
private worldBridge() {
  this.botCollector ??= new BotStateCollector(this);
  this.botExecutor ??= new ActionExecutor(this);
  return {
    collector: this.botCollector, executor: this.botExecutor, cycle: () => this.hookCycle,
    extras: {
      hint: () => ({ type: this.hintType, npc: this.hintNpc, player: this.hintPlayer, tileX: this.hintTileX, tileZ: this.hintTileZ, height: this.hintHeight }),
      flashIcon: () => this.tutFlashIcon,
      componentText: (id: number) => IfType.list[id]?.text ?? null,
      modalComponentIds: () => [this.chatModalId, this.mainModalId].filter(id => id !== -1).flatMap(id => [id, ...(IfType.list[id]?.children ?? [])]),
      position: () => this.hookState().position
    }
  };
}
```

with fields `private botCollector: BotStateCollector | null = null; private botExecutor: ActionExecutor | null = null;` and imports from `#/vendor/rs-sdk/bot/`. Also emit `this.hooksEmitter?.emit('state', { tick: this.hookCycle })` right after the existing `tick` emit (patch 15 site). In `bundle.ts` add to `reserved`: `'getWorldState', 'dispatch', 'hint', 'tutorial', 'flashingTab', 'interfaceTexts', 'regionId', 'open', 'title', 'lines', 'tile', 'npcIndex', 'playerIndex', 'height', 'success', 'message', 'phase', 'data', 'type', 'action', 'result', 'tick'`.

- [ ] **Step 8: Typecheck, tests, build**

```bash
cd client && bunx tsc --noEmit && ~/.bun/bin/bun test src/hooks src/vendor && ~/.bun/bin/bun run build:dev && ls -la out/client.js
```

Expected: no type errors, all tests pass, `out/client.js` rebuilt.

- [ ] **Step 9: Update `client/PATCHES.md` (row 21 + greps), `client/src/vendor/PATCHES.md` (bot table), and `CREDITS.md` (Vendored row: pin `56b73e08`, path `client/src/vendor/rs-sdk/bot/`, modified: yes)**

- [ ] **Step 10: Commit**

```bash
git add client/src/vendor client/src/hooks client/src/client/Client.ts client/bundle.ts client/PATCHES.md CREDITS.md
git commit -m "feat(client): hooks v2 getWorldState/dispatch over the vendored rs-sdk bot module; hint, tutorial and interface-text extras"
```

---

### Task 3: Vendor the sdk layer behind a Transport, with a local transport over the hooks

**Files:**
- Create: `web/src/vendor/rs-sdk/LICENSE`, `web/src/vendor/PATCHES.md`, `web/src/vendor/rs-sdk/sdk/{types,index,actions,actions-helpers,action-quantity,spells,trade-helpers,chunking,chat-history,pathfinding}.ts`
- Create: `web/src/agent/types.ts`, `web/src/agent/localTransport.ts`, `web/src/agent/localTransport.test.ts`, `web/src/agent/localSdk.ts`, `web/src/agent/localSdk.test.ts`
- Modify: `web/src/clientTypes.ts` (mirror hooks v2), `web/tsconfig.json` (`"paths"` for `#vendor/*` is not needed; keep relative imports), `web/eslint.config.js` (ignore `src/vendor/**`), `web/vitest.config.ts` (exclude `src/vendor/**/*.test.ts` unless they pass), `CREDITS.md`

**Interfaces:**
- Consumes: `ClientHooks.getWorldState/dispatch/on/echoChat` (Task 2), vendored `BotSDK` and `BotActions`.
- Produces: `Transport` (spec section 5), `createLocalTransport(hooks: ClientHooks, canvas: () => HTMLCanvasElement | null): Transport`, `createLocalSdk(transport: Transport): { sdk: BotSDK; bot: BotActions }`. `BotSDK` constructor becomes `new BotSDK(transport: Transport)`.

- [ ] **Step 1: Copy and clean**

```bash
SRC="$TMPDIR/rs-sdk-src/sdk"; DST=web/src/vendor/rs-sdk/sdk; mkdir -p $DST
for f in types index actions actions-helpers action-quantity spells trade-helpers chunking chat-history; do cp $SRC/$f.ts $DST/; done
cp "$TMPDIR/rs-sdk-src/LICENSE.txt" web/src/vendor/rs-sdk/LICENSE
```

Do not copy `runner.ts`, `cli.ts`, `bug-report.ts`, `chat.ts`, `formatter.ts`, `generate-api-docs.ts`, `fetch-collision-data.ts`, `collision-data.json`, `pathfinding.ts`.

- [ ] **Step 2: Write `web/src/agent/types.ts`**

```ts
import type { BotAction, ActionResult, WorldState, ChatColour, HookEvents } from '../clientTypes';
export type { BotAction, ActionResult, WorldState };
export type Unsub = () => void;
export type HookEvent = { [K in keyof HookEvents]: { name: K; payload: HookEvents[K] } }[keyof HookEvents];

export interface Transport {
  getState(): WorldState | null;                       // synchronous: latest tick snapshot
  onState(cb: (s: WorldState) => void): Unsub;
  onEvent(cb: (e: HookEvent) => void): Unsub;
  dispatch(action: BotAction, timeoutMs?: number): Promise<ActionResult>;
  say(text: string): Promise<ActionResult>;
  echo(text: string, colour?: ChatColour): void;
  screenshot(): Promise<Blob>;
  humanInput(cb: () => void): Unsub;
}
```

- [ ] **Step 3: Patch `index.ts` (BotSDK) onto the Transport**

In `web/src/vendor/rs-sdk/sdk/index.ts`:
1. Replace the imports of `./pathfinding` with `import * as pathfinding from './pathfinding';` (kept, our shim) and add `import type { Transport } from '../../../agent/types';`.
2. Constructor: `constructor(private readonly transport: Transport)`; delete `config`, `ws`, `connectionState`, `intentionalDisconnect`, `serverMaxMessageLength` initialisers except `serverMaxMessageLength = 80`; in the constructor body subscribe: `this.transport.onState(s => { this.state = s; this.stateReceivedAt = Date.now(); this.chatHistory.ingest?.(s); for (const l of this.stateListeners) l(s); });`.
3. Delete methods `connect`, `disconnect`, `isConnected` (replace with `isConnected(): boolean { return this.transport.getState() !== null; }`), `waitForBotConnection`, `waitForConnection` (make it resolve immediately), `handleMessage`, `send`, `requestScreenshot` (rewrite as `async screenshot(): Promise<Blob> { return this.transport.screenshot(); }`), and `deriveGatewayUrl`.
4. `sendAction(action)`: body becomes `return this.transport.dispatch(action, this.config?.actionTimeout ?? 10_000);` wrapped in the existing try/catch that converts throws to `{ success: false, message, reason: 'timeout' | 'error' }`.
5. `sendSay(text)`: chunk with `chunkMessage(text, this.serverMaxMessageLength)` and `await this.transport.say(chunk)` per chunk.
6. Anything referencing `SDKConfig`, `SDKConnectionMode`, `ConnectionState`, `BotStatus` is deleted; `types.ts` keeps the types (unused types are harmless).

Record every deletion in `web/src/vendor/PATCHES.md` in a table with the same columns as the client ledger.

- [ ] **Step 4: Write the pathfinding shim**

`web/src/vendor/rs-sdk/sdk/pathfinding.ts` (ours, not vendored; header says so):

```ts
// Scene-local stand-in for rs-sdk's global A*. SP4b replaces this with a collision-backed
// implementation (spec section 4.3). Until then walkTo relies on the client routefinder.
export interface DoorInfo { level: number; x: number; z: number; shape: number; angle: number; blockrange: boolean }
export class TemporaryDoorBlocklist {
  private keys = new Set<string>();
  block(d: DoorInfo): void { this.keys.add(`${d.level},${d.x},${d.z}`); }
  has(level: number, x: number, z: number): boolean { return this.keys.has(`${level},${x},${z}`); }
  active(): DoorInfo[] { return []; }
  clear(): void { this.keys.clear(); }
}
export function initPathfinding(): void {}
export function isZoneAllocated(): boolean { return true; }
export function isTileWalkable(): boolean { return true; }
export function isFlagged(): boolean { return false; }
export function isZoneLikelyLand(): boolean { return true; }
export function findDoorsAlongPath(): DoorInfo[] { return []; }
export function getDoorAt(): DoorInfo | undefined { return undefined; }
/** Straight-line legs of at most 20 tiles; the client routefinder handles each leg. */
export function findLongPath(level: number, sx: number, sz: number, dx: number, dz: number): Array<{ x: number; z: number; level: number }> {
  const out: Array<{ x: number; z: number; level: number }> = [];
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx - sx), Math.abs(dz - sz)) / 20));
  for (let i = 1; i <= steps; i++) out.push({ x: Math.round(sx + ((dx - sx) * i) / steps), z: Math.round(sz + ((dz - sz) * i) / steps), level });
  return out;
}
```

Check what `actions.ts` imports from `./pathfinding` (`findDoorsAlongPath`, `isTileWalkable`) and what `index.ts` uses (`findLongPath`, `TemporaryDoorBlocklist`, `getDoorAt`); export exactly those names with the signatures they call.

- [ ] **Step 5: Write the failing local transport test**

`web/src/agent/localTransport.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest';
import { createLocalTransport } from './localTransport';
import type { ClientHooks, WorldState } from '../clientTypes';

function fakeHooks() {
  const handlers = new Map<string, Set<(p: unknown) => void>>();
  const state = { tick: 1, player: { worldX: 1, worldZ: 2 } } as unknown as WorldState;
  const hooks = {
    getWorldState: vi.fn(() => state),
    dispatch: vi.fn(async () => ({ success: true, message: 'ok' })),
    echoChat: vi.fn(),
    on: (ev: string, h: (p: unknown) => void) => { (handlers.get(ev) ?? handlers.set(ev, new Set()).get(ev)!).add(h); return () => handlers.get(ev)!.delete(h); }
  } as unknown as ClientHooks;
  const emit = (ev: string, p: unknown) => handlers.get(ev)?.forEach(h => h(p));
  return { hooks, emit };
}

describe('createLocalTransport', () => {
  test('pushes a snapshot on every state tick and serves it synchronously', () => {
    const { hooks, emit } = fakeHooks();
    const t = createLocalTransport(hooks, () => null);
    const seen: number[] = [];
    t.onState(s => seen.push(s.tick));
    emit('state', { tick: 1 }); emit('state', { tick: 2 });
    expect(seen).toEqual([1, 1]);          // fake returns the same snapshot; two ticks, two pushes
    expect(t.getState()?.tick).toBe(1);
  });
  test('dispatch forwards to hooks and times out', async () => {
    const { hooks } = fakeHooks();
    (hooks.dispatch as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise(() => {}));
    const t = createLocalTransport(hooks, () => null);
    const r = await t.dispatch({ type: 'wait', ticks: 1, reason: 't' } as never, 10);
    expect(r).toMatchObject({ success: false, reason: 'timeout' });
  });
  test('human input fires for canvas mousedown and keydown only', () => {
    const { hooks } = fakeHooks();
    const canvas = document.createElement('canvas');
    const t = createLocalTransport(hooks, () => canvas);
    const cb = vi.fn();
    t.humanInput(cb);
    canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 6: Run it to see it fail**

Run: `cd web && npx vitest run src/agent/localTransport.test.ts`. Expected: FAIL, cannot find module.

- [ ] **Step 7: Implement `localTransport.ts`**

```ts
import type { ClientHooks, ChatColour } from '../clientTypes';
import type { ActionResult, BotAction, HookEvent, Transport, Unsub, WorldState } from './types';

const EVENTS = ['login', 'logout', 'disconnect', 'xp', 'inventory', 'chat', 'tick', 'action'] as const;

export function createLocalTransport(hooks: ClientHooks, canvas: () => HTMLCanvasElement | null): Transport {
  let latest: WorldState | null = null;
  const stateSubs = new Set<(s: WorldState) => void>();
  const eventSubs = new Set<(e: HookEvent) => void>();
  const humanSubs = new Set<() => void>();
  hooks.on('state', () => { latest = hooks.getWorldState(); for (const cb of stateSubs) cb(latest); });
  for (const name of EVENTS) hooks.on(name, payload => { for (const cb of eventSubs) cb({ name, payload } as HookEvent); });

  const onHuman = (ev: Event): void => { if (ev.isTrusted || (ev as { synthetic?: boolean }).synthetic !== true) for (const cb of humanSubs) cb(); };
  let humanWired: HTMLCanvasElement | null = null;
  const wireHuman = (): void => {
    const c = canvas();
    if (!c || c === humanWired) return;
    humanWired = c;
    c.addEventListener('mousedown', onHuman);
    c.addEventListener('keydown', onHuman);
  };

  return {
    getState: () => latest ?? (latest = safeState()),
    onState: cb => { stateSubs.add(cb); return () => stateSubs.delete(cb); },
    onEvent: cb => { eventSubs.add(cb); return () => eventSubs.delete(cb); },
    dispatch: (action: BotAction, timeoutMs = 10_000) => withTimeout(hooks.dispatch(action), timeoutMs),
    say: text => hooks.dispatch({ type: 'say', text, reason: 'transport' } as BotAction),
    echo: (text: string, colour: ChatColour = 'orange') => hooks.echoChat(text, colour),
    screenshot: () => new Promise<Blob>((resolve, reject) => { const c = canvas(); if (!c) return reject(new Error('no canvas')); c.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'); }),
    humanInput: cb => { wireHuman(); humanSubs.add(cb); return () => humanSubs.delete(cb); }
  };

  function safeState(): WorldState | null { try { return hooks.getWorldState(); } catch { return null; } }
}

function withTimeout(p: Promise<ActionResult>, ms: number): Promise<ActionResult> {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve({ success: false, message: `action timed out after ${ms}ms`, reason: 'timeout' }), ms);
    p.then(r => { clearTimeout(t); resolve(r); }, e => { clearTimeout(t); resolve({ success: false, message: String(e), reason: 'error' }); });
  });
}
```

Note: in jsdom, `isTrusted` is false for dispatched events; the test relies on the `synthetic` escape hatch. Programmatic actions from the executor go through packets, not DOM events, so real human input is the only DOM source in production.

- [ ] **Step 8: `localSdk.ts` and its test**

```ts
// web/src/agent/localSdk.ts
import { BotSDK } from '../vendor/rs-sdk/sdk/index';
import { BotActions } from '../vendor/rs-sdk/sdk/actions';
import type { Transport } from './types';
export function createLocalSdk(transport: Transport): { sdk: BotSDK; bot: BotActions } {
  const sdk = new BotSDK(transport);
  return { sdk, bot: new BotActions(sdk) };
}
```

`localSdk.test.ts`: build a fake `Transport` whose `getState` returns a minimal `WorldState` with one NPC named `Cook` at distance 2 and `dispatch` recording actions; assert `sdk.findNpc('Cook')` returns it, `await sdk.sendTalkToNpc(index)` dispatches `{ type: 'talkToNpc', npcIndex }`, and `sdk.waitForCondition(s => s.tick > 1, 200)` resolves once `onState` fires with `tick: 2`.

- [ ] **Step 9: Typecheck, lint, tests**

Add `'src/vendor/**'` to the eslint `ignores`; add `exclude: ['src/vendor/**']` to the vitest `test` block (rs-sdk's sdk tests need their runner). Run `cd web && npm run typecheck && npm run lint && npx vitest run src/agent`. Expected: clean. Type errors inside `vendor/` are fixed in place and logged in `PATCHES.md`; do not loosen `tsconfig`.

- [ ] **Step 10: Commit**

```bash
git add web/src/vendor web/src/agent web/src/clientTypes.ts web/eslint.config.js web/vitest.config.ts CREDITS.md
git commit -m "feat(web): vendor rs-sdk sdk layer behind a Transport; local transport and sdk over hooks v2"
```

---

### Task 4: Script model: `defineScript`, params, requirements, user-script compiler

**Files:**
- Create: `web/src/tasks/types.ts`, `web/src/tasks/defineScript.ts`, `web/src/tasks/defineScript.test.ts`, `web/src/tasks/requirements.ts`, `web/src/tasks/requirements.test.ts`

**Interfaces:**
- Produces: types below; `defineScript(s: Script): Script`; `validateParams(schema, input): { ok: true; values } | { ok: false; errors: string[] }`; `compileUserScript(code: string): { ok: true; script: Script } | { ok: false; message: string; line?: number }`; `evaluateRequirements(reqs, state): { ok: boolean; missing: string[] }`.

- [ ] **Step 1: Write `types.ts`**

```ts
import type { WorldState, ActionResult } from '../agent/types';
import type { BotActions } from '../vendor/rs-sdk/sdk/actions';
import type { BotSDK } from '../vendor/rs-sdk/sdk/index';

export type ParamField =
  | { type: 'boolean'; label: string; default: boolean }
  | { type: 'number'; label: string; default: number; min?: number; max?: number; step?: number }
  | { type: 'select'; label: string; default: string; options: { value: string; label: string }[] }
  | { type: 'text'; label: string; default: string; maxLength?: number };
export type ParamSchema = Record<string, ParamField>;
export type ParamValues = Record<string, boolean | number | string>;

export type Requirement =
  | { kind: 'item'; name: string; qty?: number; text: string }          // in inventory or worn
  | { kind: 'skill'; skill: string; level: number; text: string }
  | { kind: 'area'; regionIds: number[]; text: string }
  | { kind: 'custom'; test: (s: WorldState) => boolean; text: string };

export interface ScriptManifest {
  id: string; name: string; version: number; description: string;
  tags?: string[]; author?: string; order?: number;
  params?: ParamSchema; requires?: Requirement[];
  stuckAfterMs?: number; maxAttempts?: number; hardStop?: { hpBelow?: number };
  estimateMinutes?: number;
}

export interface ScriptContext {
  state(): WorldState;
  bot: BotActions; sdk: BotSDK;
  wait: {
    until(pred: (s: WorldState) => boolean, opts?: { timeoutMs?: number; label?: string }): Promise<boolean>;
    ticks(n: number): Promise<void>;
    dialog(pattern?: RegExp, timeoutMs?: number): Promise<boolean>;
    xp(skill: string, minDelta?: number, timeoutMs?: number): Promise<boolean>;
    item(idOrName: number | string, delta?: number, timeoutMs?: number): Promise<boolean>;
    message(pattern: RegExp, timeoutMs?: number): Promise<boolean>;
    idle(timeoutMs?: number): Promise<boolean>;
  };
  tutorial: { title(): string; is(re: RegExp): boolean; followHint(opts?: { talk?: boolean }): Promise<ActionResult>; clickThrough(maxClicks?: number): Promise<void> };
  params: ParamValues;
  log(text: string, level?: 'info' | 'warn' | 'error'): void;
  status(text: string): void;
  memory: Map<string, unknown>;
  signal: AbortSignal;
}

export interface Task {
  name: string;
  when(s: WorldState, c: ScriptContext): boolean;
  run(c: ScriptContext): Promise<ActionResult | void>;
  timeoutMs?: number; maxAttempts?: number; cooldownMs?: number;
}

export type RunOutcome = 'done' | 'failed' | 'stopped';
export interface Script extends ScriptManifest {
  tasks: Task[];
  until?(s: WorldState, c: ScriptContext): boolean;   // c gives params-driven stop conditions
  onStart?(c: ScriptContext): Promise<void>;
  onStop?(c: ScriptContext, outcome: RunOutcome): Promise<void>;
}

export type PauseReason = 'player' | 'claude' | 'human-input' | 'stuck' | 'hard-stop';
export type RunState = 'idle' | 'starting' | 'running' | 'paused' | 'done' | 'failed' | 'stopped';
export type Actor = 'player' | 'claude' | 'test' | 'runner';

export type TraceEvent = { seq: number; at: number } & (
  | { kind: 'run_started'; runId: string; scriptId: string; version: number; params: ParamValues; startedBy: Actor }
  | { kind: 'task_enter'; task: string }
  | { kind: 'task_exit'; task: string; outcome: 'ok' | 'failed' | 'timeout' | 'aborted'; attempts: number; ms: number; reason?: string }
  | { kind: 'action'; action: string; ok: boolean; reason?: string }
  | { kind: 'log'; level: 'info' | 'warn' | 'error'; text: string }
  | { kind: 'status'; text: string }
  | { kind: 'xp'; skill: string; delta: number }
  | { kind: 'item'; id: number; delta: number }
  | { kind: 'stuck'; task: string | null; snapshot: unknown }
  | { kind: 'paused'; reason: PauseReason; by: Actor }
  | { kind: 'resumed'; by: Actor }
  | { kind: 'human_input' }
  | { kind: 'snapshot'; snapshot: unknown }
  | { kind: 'run_done'; status: RunOutcome; summary: string; durationMs: number; xpGained: Record<string, number>; itemsDelta: Record<number, number>; tasksEntered: string[] }
  | { kind: 'truncated'; dropped: number });

export interface RunSummary {
  runId: string; scriptId: string; scriptName: string; version: number; source: 'library' | 'user';
  startedBy: Actor; characterId: string | null; params: ParamValues;
  status: RunState; startedAt: number; endedAt: number | null; durationMs: number;
  xpGained: Record<string, number>; lastTask: string | null; summary: string;
}

export interface RunStatus {
  state: RunState; reason: PauseReason | null; runId: string | null; scriptId: string | null; scriptName: string | null;
  task: string | null; statusLine: string; attempts: number; startedAt: number | null; attached: boolean; resumeAtMs: number | null;
}

export interface TaskSummary {
  id: string; name: string; description: string; version: number; tags: string[];
  source: 'library' | 'user' | 'fork'; libraryId?: string; installed?: boolean; params: ParamSchema;
  requirements: { ok: boolean; missing: string[] }; estimateMinutes?: number; order: number;
  lastRun?: { runId: string; at: number; status: RunState; summary: string };
}
```

- [ ] **Step 2: Write the failing `defineScript` tests**

```ts
// web/src/tasks/defineScript.test.ts
import { describe, expect, test } from 'vitest';
import { compileUserScript, defineScript, validateParams } from './defineScript';

describe('defineScript', () => {
  test('rejects a script with no tasks or a bad id', () => {
    expect(() => defineScript({ id: 'Bad Id', name: 'x', version: 1, description: '', tasks: [] })).toThrow(/id/);
    expect(() => defineScript({ id: 'ok', name: 'x', version: 1, description: '', tasks: [] })).toThrow(/tasks/);
  });
  test('rejects duplicate task names', () => {
    const t = { name: 'a', when: () => true, run: async () => {} };
    expect(() => defineScript({ id: 'ok', name: 'x', version: 1, description: '', tasks: [t, t] })).toThrow(/duplicate/);
  });
});

describe('validateParams', () => {
  const schema = { level: { type: 'number', label: 'Level', default: 15, min: 2, max: 99 }, tree: { type: 'select', label: 'Tree', default: 'Tree', options: [{ value: 'Tree', label: 'Tree' }, { value: 'Oak', label: 'Oak' }] } } as const;
  test('applies defaults', () => { expect(validateParams(schema, {})).toEqual({ ok: true, values: { level: 15, tree: 'Tree' } }); });
  test('rejects out of range and unknown keys', () => {
    const r = validateParams(schema, { level: 120, tree: 'Willow', extra: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toEqual(['level must be between 2 and 99', 'tree must be one of Tree, Oak', 'unknown param extra']);
  });
});

describe('compileUserScript', () => {
  test('compiles an export-default defineScript module string', () => {
    const r = compileUserScript(`export default defineScript({ id: 'user-one', name: 'One', version: 1, description: 'd', tasks: [{ name: 'go', when: () => true, run: async () => {} }] });`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.script.id).toBe('user-one');
  });
  test('reports syntax errors with a message', () => {
    const r = compileUserScript('export default defineScript({');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/Unexpected|expected/i);
  });
  test('refuses code that does not produce a script', () => {
    expect(compileUserScript('export default 42;')).toMatchObject({ ok: false });
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `cd web && npx vitest run src/tasks/defineScript.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 4: Implement `defineScript.ts`**

```ts
import type { ParamSchema, ParamValues, Script } from './types';

const ID_RE = /^[a-z][a-z0-9-]{1,40}$/;

export function defineScript(s: Script): Script {
  if (!ID_RE.test(s.id)) throw new Error(`script id must match ${ID_RE}`);
  if (!Array.isArray(s.tasks) || s.tasks.length === 0) throw new Error('script needs at least one task');
  const names = new Set<string>();
  for (const t of s.tasks) {
    if (!t.name || typeof t.when !== 'function' || typeof t.run !== 'function') throw new Error(`task ${t.name ?? '?'} needs name, when and run`);
    if (names.has(t.name)) throw new Error(`duplicate task name ${t.name}`);
    names.add(t.name);
  }
  return s;
}

export function validateParams(schema: ParamSchema | undefined, input: Record<string, unknown>): { ok: true; values: ParamValues } | { ok: false; errors: string[] } {
  const errors: string[] = []; const values: ParamValues = {};
  for (const [key, f] of Object.entries(schema ?? {})) {
    const raw = input[key];
    if (raw === undefined) { values[key] = f.default; continue; }
    if (f.type === 'boolean') { if (typeof raw !== 'boolean') errors.push(`${key} must be true or false`); else values[key] = raw; }
    else if (f.type === 'number') {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) errors.push(`${key} must be a number`);
      else if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) errors.push(`${key} must be between ${f.min ?? '-inf'} and ${f.max ?? 'inf'}`);
      else values[key] = n;
    }
    else if (f.type === 'select') { if (!f.options.some(o => o.value === raw)) errors.push(`${key} must be one of ${f.options.map(o => o.value).join(', ')}`); else values[key] = String(raw); }
    else { const s = String(raw); if (f.maxLength && s.length > f.maxLength) errors.push(`${key} is too long`); else values[key] = s; }
  }
  for (const key of Object.keys(input)) if (!(key in (schema ?? {}))) errors.push(`unknown param ${key}`);
  return errors.length ? { ok: false, errors } : { ok: true, values };
}

/** User scripts are `export default defineScript({...})` module text; we turn the export into a return. */
export function compileUserScript(code: string): { ok: true; script: Script } | { ok: false; message: string; line?: number } {
  if (code.length > 65_536) return { ok: false, message: 'script is larger than 64 KB' };
  const body = code.replace(/^\s*import[^;]*;?\s*$/gm, '').replace(/export\s+default\s+/, 'return ');
  try {
    const factory = new Function('defineScript', `"use strict";\n${body}`) as (d: typeof defineScript) => unknown;
    const out = factory(defineScript);
    if (!out || typeof out !== 'object' || !Array.isArray((out as Script).tasks)) return { ok: false, message: 'script must export default defineScript({...})' };
    return { ok: true, script: out as Script };
  } catch (e) {
    const err = e as Error & { lineNumber?: number };
    return { ok: false, message: err.message, line: err.lineNumber };
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `cd web && npx vitest run src/tasks/defineScript.test.ts`. Expected: 7 pass.

- [ ] **Step 6: Requirements test and implementation**

`requirements.test.ts`: fixtures with a minimal `WorldState` (`inventory: [{ id: 1351, name: 'Bronze axe', count: 1 }]`, `equipment: []`, `skills: [{ name: 'Woodcutting', level: 12, baseLevel: 12, experience: 0 }]`, `regionId: 12336`). Assert: item present ok, item missing lists its `text`; skill 12 fails `level: 15` with text; area ok when `regionIds` includes 12336; `custom` uses `test`.

`requirements.ts`:

```ts
import type { WorldState } from '../agent/types';
import type { Requirement } from './types';
const has = (s: WorldState, name: string, qty = 1): boolean => {
  const n = name.toLowerCase();
  const count = [...(s.inventory ?? []), ...(s.equipment ?? [])].filter(i => i.name?.toLowerCase() === n).reduce((a, i) => a + (i.count || 1), 0);
  return count >= qty;
};
export function evaluateRequirements(reqs: Requirement[] | undefined, s: WorldState | null): { ok: boolean; missing: string[] } {
  if (!reqs?.length) return { ok: true, missing: [] };
  if (!s) return { ok: false, missing: reqs.map(r => r.text) };
  const missing = reqs.filter(r =>
    r.kind === 'item' ? !has(s, r.name, r.qty)
    : r.kind === 'skill' ? !(s.skills ?? []).some(k => k.name === r.skill && k.baseLevel >= r.level)
    : r.kind === 'area' ? !r.regionIds.includes(s.regionId)
    : !r.test(s)).map(r => r.text);
  return { ok: missing.length === 0, missing };
}
```

- [ ] **Step 7: Run all task tests, lint, typecheck; commit**

```bash
cd web && npx vitest run src/tasks && npm run lint && npm run typecheck
git add web/src/tasks/types.ts web/src/tasks/defineScript.ts web/src/tasks/defineScript.test.ts web/src/tasks/requirements.ts web/src/tasks/requirements.test.ts
git commit -m "feat(web): script model — defineScript, param validation, requirements, user-script compiler"
```

---

### Task 5: Trace buffer and run summary

**Files:**
- Create: `web/src/tasks/trace.ts`, `web/src/tasks/trace.test.ts`

**Interfaces:**
- Produces: `createTrace(opts: { cap?: number; now?: () => number }): Trace` with `push(ev: Omit<TraceEvent, 'seq' | 'at'>): TraceEvent`, `events(sinceSeq?: number): TraceEvent[]`, `onEvent(cb): Unsub`, `xpGained(): Record<string, number>`, `itemsDelta(): Record<number, number>`, `tasksEntered(): string[]`, `length`. Coalescing: consecutive `xp` events for the same skill within 10 s merge (delta summed); same for `item` by id. Cap: when `length > cap`, drop the oldest non-`run_started` events and push one `truncated { dropped }` marker (kept at index 1).

- [ ] **Step 1: Write the failing test**

```ts
// web/src/tasks/trace.test.ts
import { describe, expect, test } from 'vitest';
import { createTrace } from './trace';

describe('createTrace', () => {
  test('numbers events and serves a tail by seq', () => {
    const t = createTrace();
    t.push({ kind: 'status', text: 'a' }); t.push({ kind: 'status', text: 'b' });
    expect(t.events().map(e => e.seq)).toEqual([1, 2]);
    expect(t.events(1).map(e => (e as { text: string }).text)).toEqual(['b']);
  });
  test('coalesces xp and item deltas within 10 s', () => {
    let now = 1000; const t = createTrace({ now: () => now });
    t.push({ kind: 'xp', skill: 'Woodcutting', delta: 25 }); now += 3000;
    t.push({ kind: 'xp', skill: 'Woodcutting', delta: 25 }); now += 20_000;
    t.push({ kind: 'xp', skill: 'Woodcutting', delta: 25 });
    t.push({ kind: 'item', id: 1511, delta: 1 }); t.push({ kind: 'item', id: 1511, delta: 1 });
    expect(t.events().filter(e => e.kind === 'xp')).toHaveLength(2);
    expect(t.xpGained()).toEqual({ Woodcutting: 75 });
    expect(t.itemsDelta()).toEqual({ 1511: 2 });
  });
  test('caps with a truncated marker and keeps run_started', () => {
    const t = createTrace({ cap: 5 });
    t.push({ kind: 'run_started', runId: 'r', scriptId: 's', version: 1, params: {}, startedBy: 'test' });
    for (let i = 0; i < 10; i++) t.push({ kind: 'status', text: String(i) });
    const ev = t.events();
    expect(ev[0].kind).toBe('run_started');
    expect(ev[1]).toMatchObject({ kind: 'truncated' });
    expect(ev.length).toBeLessThanOrEqual(6);
    expect(t.tasksEntered()).toEqual([]);
  });
  test('tasksEntered lists distinct task_enter names in order', () => {
    const t = createTrace();
    t.push({ kind: 'task_enter', task: 'a' }); t.push({ kind: 'task_enter', task: 'b' }); t.push({ kind: 'task_enter', task: 'a' });
    expect(t.tasksEntered()).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run to see it fail** — `cd web && npx vitest run src/tasks/trace.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `trace.ts`**

```ts
import type { TraceEvent } from './types';
type Unsub = () => void;
type Input = Omit<TraceEvent, 'seq' | 'at'>;
const COALESCE_MS = 10_000;

export interface Trace {
  push(ev: Input): TraceEvent; events(sinceSeq?: number): TraceEvent[]; onEvent(cb: (e: TraceEvent) => void): Unsub;
  xpGained(): Record<string, number>; itemsDelta(): Record<number, number>; tasksEntered(): string[]; readonly length: number;
}

export function createTrace(opts: { cap?: number; now?: () => number } = {}): Trace {
  const cap = opts.cap ?? 5000; const now = opts.now ?? Date.now;
  const list: TraceEvent[] = []; const subs = new Set<(e: TraceEvent) => void>();
  const xp: Record<string, number> = {}; const items: Record<number, number> = {}; const entered: string[] = [];
  let seq = 0; let dropped = 0;

  function coalesce(ev: Input): boolean {
    const last = list[list.length - 1];
    if (!last || now() - last.at > COALESCE_MS) return false;
    if (ev.kind === 'xp' && last.kind === 'xp' && last.skill === ev.skill) { last.delta += ev.delta; last.at = now(); return true; }
    if (ev.kind === 'item' && last.kind === 'item' && last.id === ev.id) { last.delta += ev.delta; last.at = now(); return true; }
    return false;
  }
  function enforceCap(): void {
    if (list.length <= cap) return;
    const keepHead = list[0]?.kind === 'run_started' ? 1 : 0;
    const removeFrom = list[keepHead]?.kind === 'truncated' ? keepHead + 1 : keepHead;
    const excess = list.length - cap;
    list.splice(removeFrom, excess); dropped += excess;
    if (list[keepHead]?.kind === 'truncated') (list[keepHead] as Extract<TraceEvent, { kind: 'truncated' }>).dropped = dropped;
    else list.splice(keepHead, 0, { seq: ++seq, at: now(), kind: 'truncated', dropped });
  }
  return {
    push(ev) {
      if (ev.kind === 'xp') xp[ev.skill] = (xp[ev.skill] ?? 0) + ev.delta;
      if (ev.kind === 'item') items[ev.id] = (items[ev.id] ?? 0) + ev.delta;
      if (ev.kind === 'task_enter' && !entered.includes(ev.task)) entered.push(ev.task);
      if (coalesce(ev)) return list[list.length - 1];
      const full = { ...ev, seq: ++seq, at: now() } as TraceEvent;
      list.push(full); enforceCap();
      for (const cb of subs) cb(full);
      return full;
    },
    events: (since = 0) => list.filter(e => e.seq > since),
    onEvent: cb => { subs.add(cb); return () => subs.delete(cb); },
    xpGained: () => ({ ...xp }), itemsDelta: () => ({ ...items }), tasksEntered: () => [...entered],
    get length() { return list.length; }
  };
}
```

- [ ] **Step 4: Run; commit**

```bash
cd web && npx vitest run src/tasks/trace.test.ts
git add web/src/tasks/trace.ts web/src/tasks/trace.test.ts
git commit -m "feat(web): run trace buffer with coalescing, caps and summaries"
```

---

### Task 6: The priority-task runner

**Files:**
- Create: `web/src/tasks/runner.ts`, `web/src/tasks/runner.test.ts`

**Interfaces:**
- Consumes: `Script`, `Task`, `ScriptContext`, `Trace`, `WorldState`.
- Produces: `createRunner(deps: RunnerDeps): Runner`.

```ts
export interface RunnerDeps {
  script: Script; ctx: ScriptContext; trace: Trace;
  state(): WorldState | null;                 // latest snapshot
  onTick(cb: () => void): Unsub;              // fires once per game tick
  now(): number; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(h: unknown): void;
  onStateChange?(s: RunStatusLite): void;     // { state, reason, task, attempts }
}
export interface Runner {
  start(): Promise<RunOutcome>;               // resolves when the run ends
  pause(reason: PauseReason, by: Actor): void;
  resume(by: Actor): { ok: true } | { ok: false; reason: 'paused_by_player' | 'not_paused' };
  stop(by: Actor): void;
  status(): RunStatusLite;
}
```

Semantics (spec section 8): pick the first task whose `when(state, ctx)` is true; run under `timeoutMs` (default 30 000) with an `AbortController` chained from the run signal; `task_exit` outcomes `ok` (returned `undefined` or `{ success: true }`), `failed` (`{ success: false }` or threw), `timeout`, `aborted`. Consecutive failures of the same task reach `maxAttempts` (task, then script, then 3) → `stuck`. No matching task for `stuckAfterMs` (default 45 000) → `stuck` with `task: null`. `stuck` pauses with reason `stuck` and attaches `state()` as the snapshot. Between iterations wait one tick (`onTick`) so `when` evaluates on fresh state. `until(state)` true → `done`. HP below `hardStop.hpBelow` → `paused` `hard-stop` then `failed`. `pause('player')` can only be resumed by `player`. While paused the loop awaits a resume promise; a task in flight is aborted on pause (`aborted` exit, attempts not incremented). `stop` aborts and resolves `stopped`. Every transition calls `onStateChange`.

- [ ] **Step 1: Write the failing tests** (fake clock, fake ticks)

```ts
// web/src/tasks/runner.test.ts
import { describe, expect, test, vi } from 'vitest';
import { createRunner, type RunnerDeps } from './runner';
import { createTrace } from './trace';
import type { Script, ScriptContext } from './types';
import type { WorldState } from '../agent/types';

function harness(script: Script, states: Partial<WorldState>[]) {
  let i = 0; let now = 0;
  const tickSubs = new Set<() => void>();
  const timers: { at: number; fn: () => void }[] = [];
  const trace = createTrace({ now: () => now });
  const ctx = { state: () => states[Math.min(i, states.length - 1)] as WorldState, signal: new AbortController().signal, log: vi.fn(), status: vi.fn(), memory: new Map(), params: {} } as unknown as ScriptContext;
  const deps: RunnerDeps = {
    script, ctx, trace,
    state: () => states[Math.min(i, states.length - 1)] as WorldState,
    onTick: cb => { tickSubs.add(cb); return () => tickSubs.delete(cb); },
    now: () => now,
    setTimeout: (fn, ms) => { const t = { at: now + ms, fn }; timers.push(t); return t; },
    clearTimeout: h => { const k = timers.indexOf(h as never); if (k >= 0) timers.splice(k, 1); }
  };
  async function tick(ms = 600) {
    now += ms; i++;
    for (const t of [...timers]) if (t.at <= now) { timers.splice(timers.indexOf(t), 1); t.fn(); }
    for (const cb of [...tickSubs]) cb();
    await Promise.resolve(); await Promise.resolve();
  }
  return { deps, trace, tick, runner: createRunner(deps) };
}
const s = (over: Partial<WorldState> = {}): Partial<WorldState> => ({ tick: 1, player: { hp: 10, maxHp: 10 } as never, ...over });
const script = (tasks: Script['tasks'], extra: Partial<Script> = {}): Script => ({ id: 'test-script', name: 'T', version: 1, description: '', tasks, ...extra });

describe('runner', () => {
  test('runs the first matching task, then finishes when until holds', async () => {
    const run = vi.fn(async () => {});
    const h = harness(script([{ name: 'a', when: (st) => st.tick === 1, run }, { name: 'b', when: () => true, run: async () => {} }], { until: st => st.tick >= 3 }), [s({ tick: 1 }), s({ tick: 2 }), s({ tick: 3 })]);
    const done = h.runner.start();
    await h.tick(); await h.tick(); await h.tick();
    expect(await done).toBe('done');
    expect(run).toHaveBeenCalledTimes(1);
    expect(h.trace.tasksEntered()).toEqual(['a', 'b']);
  });
  test('three consecutive failures of one task pause the run as stuck', async () => {
    const h = harness(script([{ name: 'fail', when: () => true, run: async () => ({ success: false, message: 'no' }) }], { maxAttempts: 3 }), [s()]);
    void h.runner.start();
    for (let k = 0; k < 6; k++) await h.tick();
    expect(h.runner.status()).toMatchObject({ state: 'paused', reason: 'stuck', task: 'fail', attempts: 3 });
    expect(h.trace.events().some(e => e.kind === 'stuck')).toBe(true);
  });
  test('no matching task for stuckAfterMs pauses as stuck with task null', async () => {
    const h = harness(script([{ name: 'never', when: () => false, run: async () => {} }], { stuckAfterMs: 2000 }), [s()]);
    void h.runner.start();
    for (let k = 0; k < 5; k++) await h.tick(600);
    expect(h.runner.status()).toMatchObject({ state: 'paused', reason: 'stuck', task: null });
  });
  test('a task past its timeout exits as timeout and the run continues', async () => {
    let calls = 0;
    const h = harness(script([{ name: 'slow', when: () => calls === 0, timeoutMs: 1000, run: async (c) => { calls++; await new Promise((_, rej) => c.signal.addEventListener('abort', () => rej(new Error('aborted')))); } }, { name: 'next', when: () => true, run: async () => {} }], { until: () => calls > 0 && false }), [s()]);
    void h.runner.start();
    await h.tick(600); await h.tick(600); await h.tick(600);
    const exits = h.trace.events().filter(e => e.kind === 'task_exit');
    expect(exits[0]).toMatchObject({ task: 'slow', outcome: 'timeout' });
    expect(h.trace.tasksEntered()).toContain('next');
  });
  test('player pause cannot be resumed by claude; player can', async () => {
    const h = harness(script([{ name: 'a', when: () => true, run: async () => {} }]), [s()]);
    void h.runner.start(); await h.tick();
    h.runner.pause('player', 'player');
    expect(h.runner.resume('claude')).toEqual({ ok: false, reason: 'paused_by_player' });
    expect(h.runner.resume('player')).toEqual({ ok: true });
    expect(h.runner.status().state).toBe('running');
  });
  test('hard stop on low hp ends the run as failed', async () => {
    const h = harness(script([{ name: 'a', when: () => true, run: async () => {} }], { hardStop: { hpBelow: 3 } }), [s(), s({ player: { hp: 2, maxHp: 10 } as never })]);
    const done = h.runner.start(); await h.tick(); await h.tick();
    expect(await done).toBe('failed');
    expect(h.trace.events().find(e => e.kind === 'paused')).toMatchObject({ reason: 'hard-stop' });
  });
  test('stop aborts an in-flight task and resolves stopped', async () => {
    const h = harness(script([{ name: 'a', when: () => true, run: c => new Promise((_, rej) => c.signal.addEventListener('abort', () => rej(new Error('x')))) }]), [s()]);
    const done = h.runner.start(); await h.tick();
    h.runner.stop('player');
    expect(await done).toBe('stopped');
    expect(h.trace.events().at(-1)).toMatchObject({ kind: 'run_done', status: 'stopped' });
  });
});
```

- [ ] **Step 2: Run to see them fail** — `cd web && npx vitest run src/tasks/runner.test.ts`.

- [ ] **Step 3: Implement `runner.ts`**

```ts
import type { Actor, PauseReason, RunOutcome, RunState, Script, ScriptContext, Task } from './types';
import type { Trace } from './trace';
import type { WorldState } from '../agent/types';
type Unsub = () => void;
export interface RunStatusLite { state: RunState; reason: PauseReason | null; task: string | null; attempts: number }
export interface RunnerDeps {
  script: Script; ctx: ScriptContext; trace: Trace; state(): WorldState | null; onTick(cb: () => void): Unsub;
  now(): number; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(h: unknown): void; onStateChange?(s: RunStatusLite): void;
}
export interface Runner {
  start(): Promise<RunOutcome>; pause(reason: PauseReason, by: Actor): void;
  resume(by: Actor): { ok: true } | { ok: false; reason: 'paused_by_player' | 'not_paused' }; stop(by: Actor): void; status(): RunStatusLite;
}

export function createRunner(d: RunnerDeps): Runner {
  const { script, trace } = d;
  const stuckAfterMs = script.stuckAfterMs ?? 45_000;
  const st: RunStatusLite = { state: 'idle', reason: null, task: null, attempts: 0 };
  let pausedBy: Actor | null = null; let resumeWaiters: (() => void)[] = [];
  let taskAbort: AbortController | null = null; let runAbort = new AbortController(); let outcome: RunOutcome | null = null;
  let lastMatchAt = d.now(); let lastTask: string | null = null; let fails = 0;
  const set = (patch: Partial<RunStatusLite>): void => { Object.assign(st, patch); d.onStateChange?.({ ...st }); };
  const nextTick = (): Promise<void> => new Promise(res => { const off = d.onTick(() => { off(); res(); }); });
  const waitResume = (): Promise<void> => new Promise(res => resumeWaiters.push(res));

  function pause(reason: PauseReason, by: Actor): void {
    if (st.state !== 'running' && st.state !== 'starting') return;
    pausedBy = by; taskAbort?.abort();
    trace.push({ kind: 'paused', reason, by });
    set({ state: 'paused', reason });
  }
  function resume(by: Actor) {
    if (st.state !== 'paused') return { ok: false as const, reason: 'not_paused' as const };
    if (st.reason === 'player' && by !== 'player') return { ok: false as const, reason: 'paused_by_player' as const };
    if (st.reason === 'hard-stop') return { ok: false as const, reason: 'not_paused' as const };
    trace.push({ kind: 'resumed', by }); fails = 0; lastMatchAt = d.now();
    set({ state: 'running', reason: null });
    const w = resumeWaiters; resumeWaiters = []; for (const r of w) r();
    return { ok: true as const };
  }
  function stop(by: Actor): void {
    if (outcome) return; outcome = 'stopped'; trace.push({ kind: 'log', level: 'info', text: `stopped by ${by}` });
    taskAbort?.abort(); runAbort.abort(); const w = resumeWaiters; resumeWaiters = []; for (const r of w) r();
  }

  async function runTask(t: Task, s: WorldState): Promise<'ok' | 'failed' | 'timeout' | 'aborted'> {
    const started = d.now();
    taskAbort = new AbortController();
    const onRunAbort = (): void => taskAbort?.abort();
    runAbort.signal.addEventListener('abort', onRunAbort, { once: true });
    const ctx: ScriptContext = { ...d.ctx, signal: taskAbort.signal };
    let timedOut = false;
    const timer = d.setTimeout(() => { timedOut = true; taskAbort?.abort(); }, t.timeoutMs ?? 30_000);
    if (lastTask !== t.name) { trace.push({ kind: 'task_enter', task: t.name }); fails = 0; }
    lastTask = t.name; set({ task: t.name, attempts: fails + 1 });
    let out: 'ok' | 'failed' | 'timeout' | 'aborted'; let reason: string | undefined;
    try {
      const r = await t.run(ctx);
      out = r && typeof r === 'object' && r.success === false ? 'failed' : 'ok'; reason = r && typeof r === 'object' ? r.reason : undefined;
    } catch (e) { out = 'failed'; reason = e instanceof Error ? e.message : String(e); }
    if (taskAbort.signal.aborted) out = timedOut ? 'timeout' : 'aborted';
    d.clearTimeout(timer); runAbort.signal.removeEventListener('abort', onRunAbort); taskAbort = null;
    trace.push({ kind: 'task_exit', task: t.name, outcome: out, attempts: fails + 1, ms: d.now() - started, reason });
    void s;
    return out;
  }

  async function loop(): Promise<RunOutcome> {
    set({ state: 'running' });
    while (!outcome) {
      if (st.state === 'paused') { await waitResume(); continue; }
      const s = d.state();
      if (s) {
        const hp = s.player?.hp; const floor = script.hardStop?.hpBelow;
        if (floor !== undefined && typeof hp === 'number' && hp < floor) { trace.push({ kind: 'paused', reason: 'hard-stop', by: 'runner' }); set({ state: 'paused', reason: 'hard-stop' }); outcome = 'failed'; break; }
        if (script.until?.(s, d.ctx)) { outcome = 'done'; break; }
        const task = script.tasks.find(t => { try { return t.when(s, d.ctx); } catch { return false; } });
        if (task) {
          lastMatchAt = d.now();
          const out = await runTask(task, s);
          if (out === 'failed' || out === 'timeout') {
            fails++;
            if (fails >= (task.maxAttempts ?? script.maxAttempts ?? 3)) { trace.push({ kind: 'stuck', task: task.name, snapshot: d.state() }); pausedBy = 'runner'; set({ state: 'paused', reason: 'stuck' }); trace.push({ kind: 'paused', reason: 'stuck', by: 'runner' }); continue; }
          } else if (out === 'ok') fails = 0;
        } else if (d.now() - lastMatchAt >= stuckAfterMs && st.state === 'running') {
          trace.push({ kind: 'stuck', task: null, snapshot: s }); pausedBy = 'runner'; set({ state: 'paused', reason: 'stuck' }); trace.push({ kind: 'paused', reason: 'stuck', by: 'runner' }); continue;
        }
      }
      if (!outcome) await nextTick();
    }
    set({ state: outcome });
    return outcome;
  }

  return {
    async start() {
      set({ state: 'starting' });
      try { await script.onStart?.(d.ctx); } catch (e) { trace.push({ kind: 'log', level: 'error', text: `onStart failed: ${String(e)}` }); }
      const result = await loop();
      try { await script.onStop?.(d.ctx, result); } catch { /* ignore */ }
      return result;
    },
    pause, resume, stop, status: () => ({ ...st })
  };
}
```

The runner does not push `run_started`/`run_done`; the worker (Task 7) pushes those around `start()` because it knows the run id and the summary. (`pausedBy` is retained for the status API in Task 7.)

- [ ] **Step 4: Run the tests; iterate until green** — `cd web && npx vitest run src/tasks/runner.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add web/src/tasks/runner.ts web/src/tasks/runner.test.ts
git commit -m "feat(web): priority-task runner with pause reasons, stuck detection, timeouts and hard stop"
```

---

### Task 7: Worker entry, RPC framing, and the main-thread worker host

**Files:**
- Create: `web/src/agent/rpc.ts`, `web/src/agent/rpc.test.ts`, `web/src/agent/worker.ts`, `web/src/agent/workerHost.ts`, `web/src/agent/workerHost.test.ts`, `web/src/agent/workerContext.ts`
- Modify: `web/src/agent/types.ts` (message unions)

**Interfaces:**
- Produces:
  - Messages `MainToWorker`: `{ t: 'state'; state: WorldState }`, `{ t: 'event'; event: HookEvent }`, `{ t: 'human_input' }`, `{ t: 'run'; runId; scriptRef: { kind: 'library'; id } | { kind: 'user'; code }; params; startedBy; characterId }`, `{ t: 'execute'; callId; code; params }`, `{ t: 'pause'; reason; by }`, `{ t: 'resume'; by }`, `{ t: 'stop'; by }`, `{ t: 'rpc_result'; callId; ok; value? ; error? }`, `{ t: 'compile'; callId; code }`.
  - `WorkerToMain`: `{ t: 'ready' }`, `{ t: 'rpc'; callId; target: 'transport'; method: 'dispatch' | 'say' | 'echo' | 'screenshot'; args }`, `{ t: 'trace'; event: TraceEvent }`, `{ t: 'status'; status: RunStatusLite & { runId; scriptId; scriptName; statusLine } }`, `{ t: 'run_end'; runId; outcome; summary: RunSummary }`, `{ t: 'execute_result'; callId; ok; value?; error?; logs: string[] }`, `{ t: 'compile_result'; callId; ok; manifest?; message?; line? }`, `{ t: 'resume_result'; ok; reason? }`.
  - `createWorkerHost(deps: { transport: Transport; spawn: () => Worker; libraryManifests: ScriptManifest[]; now? }): WorkerHost` with `run(...)`, `execute(code, params)`, `compile(code)`, `pause`, `resume`, `stop`, `status(): RunStatus`, `onTrace(cb)`, `onRunEnd(cb)`, `restart(): Promise<{ runId }>`, `terminate()`.
  - Inside the Worker, `createWorkerContext(...)` builds the `ScriptContext` (spec section 6) over a `Transport` implemented on `postMessage` RPC, with `bot`/`sdk` from `createLocalSdk` (Task 3 works unchanged in the Worker because it only needs a `Transport`).

- [ ] **Step 1: `rpc.ts` and its test**

```ts
// web/src/agent/rpc.ts — request/response over postMessage with ids and timeouts.
export interface Pending<T> { resolve: (v: T) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
export function createRpcClient<Req, Res>(send: (m: Req) => void, opts: { timeoutMs?: number; now?: () => number } = {}) {
  const pending = new Map<string, Pending<Res>>(); let n = 0;
  return {
    call(make: (callId: string) => Req, timeoutMs = opts.timeoutMs ?? 15_000): Promise<Res> {
      const callId = `c${++n}`;
      return new Promise<Res>((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(callId); reject(new Error(`rpc ${callId} timed out`)); }, timeoutMs);
        pending.set(callId, { resolve, reject, timer }); send(make(callId));
      });
    },
    settle(callId: string, ok: boolean, value: Res | undefined, error?: string): boolean {
      const p = pending.get(callId); if (!p) return false;
      clearTimeout(p.timer); pending.delete(callId);
      if (ok) p.resolve(value as Res); else p.reject(new Error(error ?? 'rpc failed'));
      return true;
    },
    rejectAll(reason: string): void { for (const [id, p] of pending) { clearTimeout(p.timer); p.reject(new Error(reason)); pending.delete(id); } },
    get size() { return pending.size; }
  };
}
```

Test: `call` resolves on `settle(ok)`, rejects on `settle(false, undefined, 'boom')`, times out with fake timers (`vi.useFakeTimers()`), `rejectAll` rejects every outstanding call, `settle` on an unknown id returns false.

- [ ] **Step 2: `workerContext.ts` (runs inside the Worker)**

```ts
import { createLocalSdk } from './localSdk';
import type { Transport, WorldState, HookEvent } from './types';
import type { ScriptContext, ParamValues, TraceEvent } from '../tasks/types';
import type { Trace } from '../tasks/trace';
import { CHAR_DESIGN_INTERFACE } from './constants';

export interface ContextDeps { transport: Transport; trace: Trace; params: ParamValues; signal: AbortSignal; onTick(cb: () => void): () => void }

export function createWorkerContext(d: ContextDeps): ScriptContext {
  const { sdk, bot } = createLocalSdk(d.transport);
  const memory = new Map<string, unknown>();
  const state = (): WorldState => d.transport.getState() ?? ({} as WorldState);
  const untilP = (pred: (s: WorldState) => boolean, timeoutMs = 20_000, label?: string): Promise<boolean> => new Promise(res => {
    if (pred(state())) return res(true);
    const done = (v: boolean): void => { off(); offA(); clearTimeout(t); res(v); };
    const off = d.transport.onState(s => { if (pred(s)) done(true); });
    const onAbort = (): void => done(false); d.signal.addEventListener('abort', onAbort); const offA = (): void => d.signal.removeEventListener('abort', onAbort);
    const t = setTimeout(() => { if (label) d.trace.push({ kind: 'log', level: 'warn', text: `wait ${label} timed out` }); done(false); }, timeoutMs);
  });
  const skillXp = (s: WorldState, skill: string): number => s.skills?.find(k => k.name === skill)?.experience ?? 0;
  const itemCount = (s: WorldState, key: number | string): number => (s.inventory ?? []).filter(i => typeof key === 'number' ? i.id === key : i.name?.toLowerCase() === String(key).toLowerCase()).reduce((a, i) => a + i.count, 0);
  const lastMessageSeq = (s: WorldState): number => Math.max(0, ...(s.gameMessages ?? []).map(m => m.tick));

  const ctx: ScriptContext = {
    state, bot, sdk, params: d.params, memory, signal: d.signal,
    log: (text, level = 'info') => d.trace.push({ kind: 'log', level, text }),
    status: text => d.trace.push({ kind: 'status', text }),
    wait: {
      until: (pred, o) => untilP(pred, o?.timeoutMs, o?.label),
      ticks: n => new Promise(res => { let left = n; const off = d.onTick(() => { if (--left <= 0) { off(); res(); } }); }),
      dialog: (re, t) => untilP(s => !!s.dialog?.isOpen && (!re || re.test(s.recentDialogs?.at(-1)?.text ?? '')), t, 'dialog'),
      xp: (skill, min = 1, t) => { const base = skillXp(state(), skill); return untilP(s => skillXp(s, skill) - base >= min, t, `xp ${skill}`); },
      item: (key, delta = 1, t) => { const base = itemCount(state(), key); return untilP(s => itemCount(s, key) - base >= delta, t, `item ${key}`); },
      message: (re, t) => { const since = lastMessageSeq(state()); return untilP(s => (s.gameMessages ?? []).some(m => m.tick > since && re.test(m.text)), t, 'message'); },
      idle: t => untilP(s => (s.player?.animId ?? -1) === -1, t, 'idle')
    },
    tutorial: {
      title: () => state().tutorial?.title ?? '',
      is: re => re.test(state().tutorial?.title ?? ''),
      async followHint(o = {}) {
        const s = state(); const h = s.hint;
        if (h.kind === 'npc') { const npc = s.nearbyNpcs.find(n => n.index === h.npcIndex); if (!npc) return { success: false, message: 'hinted npc not in view', reason: 'target_not_found' }; return o.talk === false ? bot.interactNpc(npc, 1) : bot.talkTo(npc); }
        if (h.kind === 'tile') { const loc = s.nearbyLocs.find(l => l.x === h.tile.x && l.z === h.tile.z); return loc ? bot.interactLoc(loc, 1) : bot.walkTo(h.tile.x, h.tile.z, 1); }
        return { success: false, message: 'no hint arrow', reason: 'no_hint' };
      },
      async clickThrough(max = 10) { for (let i = 0; i < max && state().dialog?.isOpen && !state().dialog.options?.length; i++) { await sdk.sendClickDialog(0); await ctx.wait.ticks(1); } }
    }
  };
  void CHAR_DESIGN_INTERFACE; void (0 as unknown as HookEvent); void (0 as unknown as TraceEvent);
  return ctx;
}
```

Adjust the exact `bot`/`sdk` method names (`interactNpc`, `interactLoc`, `talkTo`, `sendClickDialog`) to the vendored signatures found in Task 3; `constants.ts` exports `CHAR_DESIGN_INTERFACE = 3559` and `TUTORIAL_TEXT` ids (mirrors of the client constants).

- [ ] **Step 3: `worker.ts` (Worker entry)**

Responsibilities: keep `latest` state from `state` messages and fan out to a Worker-side `Transport` (`getState`, `onState`, `onEvent`; `dispatch/say/echo/screenshot` go over RPC to the host; `humanInput` is fed by `human_input` messages); handle `run` (resolve the script: library via `import('../tasks/library/index')` `byId(id)`, user via `compileUserScript(code)`; validate params; build the trace with `onEvent` → `postMessage({ t: 'trace' })`; push `run_started`; create the runner with `onStateChange` → `status` messages; on end push `run_done` with `xpGained`, `itemsDelta`, `tasksEntered`, duration, and post `run_end`); handle `execute` (compile `async ({ bot, sdk, state, wait, log, params, signal }) => {...}` from the snippet via `new Function('ctx', 'return (async ({bot, sdk, state, wait, log, status, params, signal, tutorial, memory}) => {' + code + '\n})(ctx)')`, capture logs, 60 s timeout; refused with `run_active` when a run is `running`); `compile` (returns the manifest or the error); `pause`/`resume`/`stop`; `human_input` → `runner.pause('human-input', 'player')` and forward to `humanInput` subscribers. While a run is `running` the worker pushes a compact `snapshot` trace event every 60 s (spec 8.1: `player`, `skills`, `inventory` length, `tutorial`, `hint` only). XP and item trace events come from `event` messages (`xp` → `{ kind: 'xp', skill: SKILL_NAMES[skill], delta }`, `inventory` → one `item` per added/removed entry).

- [ ] **Step 4: `workerHost.ts` and its test**

`createWorkerHost` spawns the Worker with `deps.spawn()` (production: `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`), forwards `transport.onState` (throttled to one per tick), `transport.onEvent`, and `transport.humanInput` as messages, answers `rpc` messages by calling the transport method and replying `rpc_result` (Blob screenshots are transferred as `ArrayBuffer`), collects `trace`/`status`/`run_end`, and exposes the control API. `status()` merges the worker's last status with `resumeAtMs` (set by Task 10's human-input timer). `restart()` = `stop`, wait for `run_end`, `run` again with the same args; for library scripts it also posts `{ t: 'reload' }` which makes the worker re-import the library module (`import(/* @vite-ignore */ url + '?t=' + Date.now())` in dev only).

`workerHost.test.ts` uses a fake `Worker` (an object with `postMessage`, `onmessage`, `terminate`, and a `receive(msg)` helper the test uses to inject worker messages): assert `run()` posts a `run` message with a generated `runId`; an incoming `rpc dispatch` calls `transport.dispatch` and posts `rpc_result`; `trace` messages reach `onTrace`; `status()` reflects the last `status` message; `stop()` posts `stop`; `terminate()` calls the fake's `terminate` and `status().state` becomes `idle`.

- [ ] **Step 5: Typecheck, lint, tests**

`cd web && npm run typecheck && npm run lint && npx vitest run src/agent`. Vite bundles `worker.ts` as a module worker automatically because of the `new URL(..., import.meta.url)` form; confirm with `npx vite build` that `dist/assets/worker-*.js` exists.

- [ ] **Step 6: Commit**

```bash
git add web/src/agent
git commit -m "feat(web): script Worker with RPC transport, ScriptContext, and the main-thread worker host"
```

---

### Task 8: Run history in IndexedDB

**Files:**
- Create: `web/src/tasks/history.ts`, `web/src/tasks/history.test.ts`
- Modify: `web/package.json` (devDependency `fake-indexeddb@^6`), `web/vitest.config.ts` (`setupFiles` adds `fake-indexeddb/auto`)

**Interfaces:**
- Produces: `createRunHistory(opts?: { dbName?: string; cap?: number }): RunHistory` with `put(summary: RunSummary, events: TraceEvent[]): Promise<void>`, `appendEvents(runId, events): Promise<void>`, `list(limit?): Promise<RunSummary[]>` (newest first), `get(runId): Promise<{ summary: RunSummary; events: TraceEvent[] } | null>`, `clear(): Promise<void>`. Cap 50 runs: inserting the 51st deletes the oldest.

- [ ] **Step 1: Failing test**

```ts
import { beforeEach, describe, expect, test } from 'vitest';
import { createRunHistory } from './history';
import type { RunSummary } from './types';
const sum = (id: string, at: number): RunSummary => ({ runId: id, scriptId: 's', scriptName: 'S', version: 1, source: 'library', startedBy: 'test', characterId: null, params: {}, status: 'done', startedAt: at, endedAt: at + 10, durationMs: 10, xpGained: {}, lastTask: null, summary: '' });
describe('run history', () => {
  beforeEach(async () => { await createRunHistory({ dbName: 't' }).clear(); });
  test('stores, lists newest first, and returns events', async () => {
    const h = createRunHistory({ dbName: 't' });
    await h.put(sum('a', 1), [{ seq: 1, at: 1, kind: 'status', text: 'x' }]);
    await h.put(sum('b', 2), []);
    expect((await h.list()).map(r => r.runId)).toEqual(['b', 'a']);
    expect((await h.get('a'))?.events).toHaveLength(1);
    await h.appendEvents('a', [{ seq: 2, at: 2, kind: 'status', text: 'y' }]);
    expect((await h.get('a'))?.events).toHaveLength(2);
  });
  test('caps at N runs', async () => {
    const h = createRunHistory({ dbName: 't', cap: 3 });
    for (let i = 0; i < 5; i++) await h.put(sum(`r${i}`, i), []);
    expect((await h.list()).map(r => r.runId)).toEqual(['r4', 'r3', 'r2']);
    expect(await h.get('r0')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail**, then install: `cd web && npm i -D fake-indexeddb@^6` and add `'fake-indexeddb/auto'` to `setupFiles` before `src/test/setupDom.ts`.

- [ ] **Step 3: Implement with two object stores (`runs` keyed by `runId` with index `startedAt`; `events` keyed by `runId`)** using plain `indexedDB.open(dbName, 1)` wrapped in small promise helpers (`req<T>(r: IDBRequest<T>)`, `tx(db, stores, mode)`); `put` writes both stores in one transaction then trims via the `startedAt` index cursor; `list` reads the index in `prev` direction with `limit`.

- [ ] **Step 4: Tests green; commit**

```bash
git add web/src/tasks/history.ts web/src/tasks/history.test.ts web/package.json web/package-lock.json web/vitest.config.ts
git commit -m "feat(web): IndexedDB run history capped at 50 runs"
```

---

### Task 9: User scripts in Firestore, rules, and the library scripts

**Files:**
- Create: `web/src/tasks/userStore.ts`, `web/src/tasks/userStore.test.ts`
- Create: `web/src/tasks/library/index.ts`, `web/src/tasks/library/loopHelpers.ts`, `web/src/tasks/library/chopAndDrop.ts`, `web/src/tasks/library/netFishAndDrop.ts`, `web/src/tasks/library/mineAndDrop.ts`, `web/src/tasks/library/library.test.ts`
- Modify: `firebase/firestore.rules`, `firebase/rules.test.ts`

**Interfaces:**
- Produces: `createUserTaskStore(deps: { db: Firestore; uid: () => string | null }): UserTaskStore` with `list(): Promise<UserTaskDoc[]>`, `get(id)`, `save(input: { id?: string; name; description; tags; params; code; source: 'user' | 'fork' | 'library'; libraryId?; pinnedVersion? }): Promise<{ id; version }>`, `remove(id)`, `setLastRun(id, lastRun)`; `UserTaskDoc` mirrors spec section 9. Library: `LIBRARY: Script[]` ordered by `order`, `libraryById(id): Script | undefined`, `libraryManifests(): ScriptManifest[]`.

- [ ] **Step 1: Rules**

Add inside `match /users/{uid}`:

```
      // SP4a: saved scripts. Owner-only; code is bounded; source is one of three values.
      match /tasks/{taskId} {
        allow read: if request.auth != null && request.auth.uid == uid;
        allow write: if request.auth != null && request.auth.uid == uid
                     && request.resource.data.name is string && request.resource.data.name.size() >= 1 && request.resource.data.name.size() <= 60
                     && request.resource.data.code is string && request.resource.data.code.size() < 65536
                     && request.resource.data.source in ['user', 'fork', 'library'];
      }
```

`firebase/rules.test.ts` adds a `describe('users/{uid}/tasks')`: owner can `setDoc` a valid doc; another uid cannot read or write; a doc with `code` of 70 000 chars fails; `source: 'remote'` fails; missing `name` fails. Run `cd firebase && npm test`.

- [ ] **Step 2: `userStore.ts`**

Firestore v9 modular API like `firestoreBackend.ts`: `collection(db, 'users', uid, 'tasks')`, `getDocs`, `getDoc`, `setDoc(..., { merge: false })` with `createdAt: existing?.createdAt ?? Date.now()`, `updatedAt: Date.now()`, `version: (existing?.version ?? 0) + 1`, `deleteDoc`, `updateDoc(ref, { lastRun })`. Ids: `input.id ?? doc(collection).id`. `save` rejects with `Error('not signed in')` when `uid()` is null; rejects `code.length >= 65536` client-side with `Error('script is larger than 64 KB')`.

`userStore.test.ts` injects a fake `db` through a tiny adapter: define the store over an interface `TaskDocBackend { list(uid), get(uid, id), set(uid, id, doc), delete(uid, id), update(uid, id, patch) }`, export `createFirestoreTaskBackend(db)` (untested, five one-line wrappers) and `createUserTaskStore({ backend, uid })`; test the store against an in-memory backend: save assigns id and version 1, second save bumps to 2 and preserves `createdAt`, remove deletes, oversized code rejected, signed-out rejected.

- [ ] **Step 3: Library helpers and scripts with failing tests first**

`library.test.ts` drives each script's `tasks[].when` and `until` against fixture states (no Worker):

```ts
import { describe, expect, test } from 'vitest';
import { LIBRARY, libraryById } from './index';
import type { WorldState } from '../../agent/types';
const st = (o: Partial<WorldState>): WorldState => ({ inventory: [], equipment: [], skills: [{ name: 'Woodcutting', level: 1, baseLevel: 1, experience: 0 }, { name: 'Fishing', level: 1, baseLevel: 1, experience: 0 }, { name: 'Mining', level: 1, baseLevel: 1, experience: 0 }], nearbyLocs: [], nearbyNpcs: [], ...o } as unknown as WorldState);
const ctx = (params: Record<string, unknown>) => ({ params }) as never;
const full = Array.from({ length: 28 }, (_, i) => ({ slot: i, id: 1511, name: 'Logs', count: 1, optionsWithIndex: [] }));

describe('library', () => {
  test('is ordered and ids are unique', () => {
    expect(LIBRARY.map(s => s.id)).toEqual(['chop-and-drop', 'net-fish-and-drop', 'mine-and-drop']);
    expect(new Set(LIBRARY.map(s => s.id)).size).toBe(LIBRARY.length);
  });
  test('chop-and-drop drops when full, chops otherwise, stops at the level', () => {
    const s = libraryById('chop-and-drop')!;
    const c = ctx({ tree: 'Tree', untilLevel: 15, keepLogs: false });
    expect(s.tasks.find(t => t.when(st({ inventory: full }), c))?.name).toBe('drop-logs-when-full');
    expect(s.tasks.find(t => t.when(st({}), c))?.name).toBe('chop-nearest');
    expect(s.until!(st({ skills: [{ name: 'Woodcutting', level: 15, baseLevel: 15, experience: 2411 }] as never }), c)).toBe(true);   // until(state, ctx)
  });
  test('requirements name the tool', () => {
    expect(libraryById('mine-and-drop')!.requires![0].text).toMatch(/pickaxe/i);
    expect(libraryById('net-fish-and-drop')!.requires![0].text).toMatch(/net/i);
  });
});
```

`loopHelpers.ts`:

```ts
import type { WorldState } from '../../agent/types';
import type { Requirement, Task } from '../types';
export const levelOf = (s: WorldState, skill: string): number => s.skills?.find(k => k.name === skill)?.baseLevel ?? 1;
export const invFull = (s: WorldState): boolean => (s.inventory?.length ?? 0) >= 28;
export const tool = (name: string): Requirement => ({ kind: 'item', name, text: `Needs a ${name.toLowerCase()} in your inventory or equipped` });
/** Drop every inventory item whose name matches; one task reused by all three loops. */
export function dropAllTask(name: string, match: RegExp, keepParam?: string): Task {
  return {
    name, when: (s, c) => invFull(s) && !(keepParam && c.params[keepParam] === true),
    async run(c) { for (const item of c.state().inventory.filter(i => match.test(i.name))) { if (c.signal.aborted) return; await c.bot.dropItem(item, 'all'); } }
  };
}
```

`chopAndDrop.ts`:

```ts
import { defineScript } from '../defineScript';
import { dropAllTask, levelOf, tool } from './loopHelpers';
export default defineScript({
  id: 'chop-and-drop', name: 'Chop and drop', version: 1, order: 10, tags: ['skilling', 'woodcutting'], author: 'idlescape',
  description: 'Chops the nearest tree of the chosen kind and drops the logs until the target Woodcutting level.',
  params: {
    tree: { type: 'select', label: 'Tree', default: 'Tree', options: [{ value: 'Tree', label: 'Tree' }, { value: 'Oak', label: 'Oak' }] },
    untilLevel: { type: 'number', label: 'Stop at level', default: 15, min: 2, max: 99 },
    keepLogs: { type: 'boolean', label: 'Keep logs (stop when full)', default: false }
  },
  requires: [tool('Bronze axe')], stuckAfterMs: 45_000, maxAttempts: 3, hardStop: { hpBelow: 3 }, estimateMinutes: 20,
  until: (s, c) => levelOf(s, 'Woodcutting') >= Number(c.params.untilLevel) || (c.params.keepLogs === true && (s.inventory?.length ?? 0) >= 28),
  tasks: [
    dropAllTask('drop-logs-when-full', /logs$/i, 'keepLogs'),
    { name: 'chop-nearest', when: () => true, timeoutMs: 40_000, async run(c) { c.status(`Chopping ${c.params.tree}`); const r = await c.bot.chopTree(String(c.params.tree)); if (!r.success) return r; await c.wait.xp('Woodcutting', 1, 30_000); } }
  ]
});
```

`netFishAndDrop.ts` (`Small fishing net`, `bot.interactNpc` on the nearest `Fishing spot` with option `Net`, `wait.item(/shrimp|anchov/)`, Fishing level) and `mineAndDrop.ts` (`Bronze pickaxe`, nearest loc matching `params.ore` rocks via `bot.interactLoc(loc, 'Mine')`, `wait.xp('Mining')`) follow the same two-task shape. `index.ts` exports `LIBRARY` sorted by `order`, `libraryById`, `libraryManifests` (manifest = script minus `tasks/until/onStart/onStop`).

- [ ] **Step 4: Tests, lint, typecheck; commit**

```bash
cd web && npx vitest run src/tasks && npm run lint && npm run typecheck && (cd ../firebase && npm test)
git add web/src/tasks/userStore.ts web/src/tasks/userStore.test.ts web/src/tasks/library web/src/tasks/types.ts web/src/tasks/runner.ts firebase/firestore.rules firebase/rules.test.ts
git commit -m "feat(web,rules): Firestore user scripts, and the chop/fish/mine library scripts"
```

---

### Task 10: `window.idlescape.tasks`, human-input auto-resume, and the main.ts wiring

**Files:**
- Create: `web/src/tasks/api.ts`, `web/src/tasks/api.test.ts`, `web/src/tasks/humanInput.ts`, `web/src/tasks/humanInput.test.ts`
- Modify: `web/src/main.ts`, `web/src/clientTypes.ts` (declare `window.idlescape.tasks`), `web/src/types.ts` (`PanelId` adds `'tasks' | 'marketplace'`)

**Interfaces:**
- Consumes: `createWorkerHost` (Task 7), `createRunHistory` (8), `createUserTaskStore` (9), `LIBRARY`/`libraryManifests` (9), `evaluateRequirements` (4), `Transport` (3).
- Produces: `createTasksApi(deps: TasksApiDeps): TasksApi` (spec section 10, verbatim method list) plus `TasksApi.onStatus(cb: (s: RunStatus) => void): Unsub` and `TasksApi.settings: { get(): TasksSettings; set(p: Partial<TasksSettings>): void }` where `TasksSettings = { resumeAfterHumanInputMs: number; echoLogsToChat: boolean }` (default 5000, false). Errors are thrown as `TasksError` with `code: 'busy' | 'run_active' | 'not_found' | 'requirements' | 'params' | 'compile_error' | 'paused_by_player' | 'not_paused' | 'not_signed_in'` and `detail?: unknown`.

- [ ] **Step 1: `humanInput.ts` test and implementation**

Test: given `transport.humanInput` firing and a fake clock, `createHumanInputWatcher({ transport, isRunning, pause, resume, resumeAfterMs: () => 5000, now, setTimeout, clearTimeout })` pauses with `'human-input'` on the first input while running, does not pause when not running, re-arms the timer on each further input, calls `resume('player')` 5 s after the last input, does nothing when `resumeAfterMs` is 0, and exposes `resumeAt(): number | null`.

```ts
// web/src/tasks/humanInput.ts
import type { Transport } from '../agent/types';
export interface HumanInputDeps {
  transport: Transport; isRunning(): boolean; isPausedByHuman(): boolean;
  pause(): void; resume(): void; resumeAfterMs(): number;
  now(): number; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(h: unknown): void;
}
export function createHumanInputWatcher(d: HumanInputDeps) {
  let timer: unknown = null; let resumeAt: number | null = null;
  const arm = (): void => {
    if (timer) d.clearTimeout(timer);
    const ms = d.resumeAfterMs();
    if (ms <= 0) { resumeAt = null; timer = null; return; }
    resumeAt = d.now() + ms;
    timer = d.setTimeout(() => { timer = null; resumeAt = null; if (d.isPausedByHuman()) d.resume(); }, ms);
  };
  const off = d.transport.humanInput(() => {
    if (d.isRunning()) { d.pause(); arm(); }
    else if (d.isPausedByHuman()) arm();
  });
  return { resumeAt: () => resumeAt, dispose: () => { off(); if (timer) d.clearTimeout(timer); } };
}
```

- [ ] **Step 2: `api.ts` test (fake host, history, store, library)**

Assertions: `list()` merges library manifests (source `library`, `order` from manifest) and user docs (source from the doc), each with `requirements` evaluated against `transport.getState()`; `run('chop-and-drop')` with missing axe throws `TasksError('requirements')` listing the text; `run` with an active run throws `busy`; `run` validates params and forwards `{ scriptRef: { kind: 'library', id } }` to the host; `run('userId')` forwards `{ kind: 'user', code }`; `execute` while host status is `running` throws `run_active`, works when `paused`; `pause('player')` → host.pause with reason `player`; `resume('claude')` maps host `{ ok: false, reason: 'paused_by_player' }` to a thrown `TasksError('paused_by_player')`; `install('chop-and-drop')` saves a user doc `{ source: 'library', libraryId, pinnedVersion, code: '' }`; `save` compiles through `host.compile` first and throws `compile_error` on failure; on `run_end` the api writes history (`put`) and `setLastRun` on the user doc when the source is user; `getRun()` with no id returns the current run's trace from the in-memory buffer; `onEvent` relays host traces.

- [ ] **Step 3: Implement `api.ts`**

Shape:

```ts
export interface TasksApiDeps {
  host: WorkerHost; history: RunHistory; store: UserTaskStore; transport: Transport;
  library: { manifests(): ScriptManifest[]; byId(id: string): Script | undefined };
  characterId(): string | null; storage: { get(k: string): string | null; set(k: string, v: string): void };
  now?(): number;
}
export class TasksError extends Error { constructor(public code: TasksErrorCode, message: string, public detail?: unknown) { super(message); } }
export function createTasksApi(d: TasksApiDeps): TasksApi & { onStatus(cb: (s: RunStatus) => void): Unsub; settings: ... } { ... }
```

Rules inside: `run` refuses when `host.status().state` is `starting | running | paused` (`busy`); `execute`/`dispatch` refuse when state is `starting | running` (`run_active`); current-run trace is buffered in the api from `host.onTrace` and flushed to history on `run_end` (also `appendEvents` every 50 events so a crashed tab keeps most of the trace); `status()` returns the host status plus `resumeAtMs` from the human-input watcher and `attached: false` (SP4c flips it); `settings` persist in `storage` under `tasks.settings`; when `echoLogsToChat` is true every `log` trace event is mirrored with `transport.echo(text, 'orange')`.

- [ ] **Step 4: Wire `main.ts`**

After `wireHooks(h)` runs for a session, build once per hooks instance:

```ts
import { createLocalTransport } from './agent/localTransport';
import { createWorkerHost } from './agent/workerHost';
import { createRunHistory } from './tasks/history';
import { createUserTaskStore, createFirestoreTaskBackend } from './tasks/userStore';
import { createTasksApi } from './tasks/api';
import { createHumanInputWatcher } from './tasks/humanInput';
import { libraryManifests, libraryById } from './tasks/library';
import { db } from './firebase';
// ...
let tasksApi: ReturnType<typeof createTasksApi> | null = null;
function wireTasks(h: ClientHooks): void {
  const transport = createLocalTransport(h, () => byId<HTMLCanvasElement>('canvas'));
  const host = createWorkerHost({ transport, spawn: () => new Worker(new URL('./agent/worker.ts', import.meta.url), { type: 'module' }), libraryManifests: libraryManifests() });
  const api = createTasksApi({
    host, transport, history: createRunHistory(), store: createUserTaskStore({ backend: createFirestoreTaskBackend(db), uid: () => identity()?.uid ?? null }),
    library: { manifests: libraryManifests, byId: libraryById }, characterId: () => activeCharacter?.id ?? null,
    storage: { get: k => localStorage.getItem(`cs.${k}`), set: (k, v) => localStorage.setItem(`cs.${k}`, v) }
  });
  createHumanInputWatcher({ transport, isRunning: () => host.status().state === 'running', isPausedByHuman: () => host.status().reason === 'human-input', pause: () => host.pause('human-input', 'player'), resume: () => host.resume('player'), resumeAfterMs: () => api.settings.get().resumeAfterHumanInputMs, now: Date.now, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: h => clearTimeout(h as number) });
  tasksApi = api;
  window.idlescape = { ...(window.idlescape ?? {}), tasks: api };
  h.on('logout', () => { void api.stop('player').catch(() => {}); });
}
```

Call `wireTasks(h)` where `wireHooks(h)` is called (same guard against double wiring). `PluginContext` gains nothing; the plugins (Tasks 11 to 13) receive `tasksApi` through their factory deps like the characters plugin does. `clientTypes.ts` adds `tasks?: TasksApi` to the `window.idlescape` declaration. Keep `main.ts` under 400 lines: if it crosses, move `wireTasks` into `web/src/tasks/wire.ts` exporting `wireTasks(deps)`.

- [ ] **Step 5: Tests, typecheck, lint, build; commit**

```bash
cd web && npx vitest run src/tasks && npm run typecheck && npm run lint && npx vite build
git add web/src/tasks/api.ts web/src/tasks/api.test.ts web/src/tasks/humanInput.ts web/src/tasks/humanInput.test.ts web/src/main.ts web/src/clientTypes.ts web/src/types.ts web/src/tasks/wire.ts
git commit -m "feat(web): window.idlescape.tasks API with human-input pause and auto-resume"
```

---

### Task 11: Tasks tab

**Files:**
- Create: `web/src/plugins/builtin/tasks.ts`, `web/src/plugins/builtin/tasksViews.ts`, `web/src/plugins/builtin/traceView.ts`, `web/src/plugins/builtin/tasks.test.ts`, `web/src/plugins/builtin/traceView.test.ts`
- Modify: `web/src/main.ts` (register), `web/src/styles/tasks.css` (create), `web/src/styles/index.css` (import)

**Interfaces:**
- Consumes: `TasksApi` (`list`, `run`, `remove`, `save`, `get`, `execute`, `pause`, `resume`, `stop`, `restart`, `status`, `onStatus`, `onEvent`, `listRuns`, `getRun`, `settings`), `PluginContext.notify/openPanel`, `h/kv/badge/alert/empty`.
- Produces: `createTasksPlugin(deps: { api: () => TasksApi | null; openPanel: (id: PanelId) => void }): ShellPlugin` with manifest `{ id: 'tasks', name: 'Tasks', icon: '▶', tier: 'shell', defaultEnabled: true, settings: { resumeAfterHumanInputMs: number(0..30000 step 1000, default 5000), echoLogsToChat: boolean } }`; `renderRunCard(status, handlers): HTMLElement`; `renderScriptRow(task, handlers)`; `renderParamsForm(schema, onSubmit)`; `renderTraceView(events, opts)`; each view has stable `data-*` hooks: `[data-run-card]`, `[data-run-state]`, `[data-run-task]`, `[data-run-pause]`, `[data-run-resume]`, `[data-run-stop]`, `[data-run-restart]`, `[data-task-row="<id>"]`, `[data-task-run="<id>"]`, `[data-task-edit="<id>"]`, `[data-task-fork="<id>"]`, `[data-task-delete="<id>"]`, `[data-snippet]`, `[data-snippet-run]`, `[data-history-row="<runId>"]`, `[data-trace-open="<runId>"]`, `[data-trace-copy]`.

- [ ] **Step 1: Failing view tests** (jsdom)

```ts
// web/src/plugins/builtin/tasks.test.ts
import { describe, expect, test, vi } from 'vitest';
import { renderRunCard, renderScriptRow, renderParamsForm } from './tasksViews';
describe('run card', () => {
  test('running shows task, pause and stop; paused shows the reason and resume', () => {
    const el = renderRunCard({ state: 'running', reason: null, runId: 'r', scriptId: 's', scriptName: 'Chop', task: 'chop-nearest', statusLine: 'Chopping Tree', attempts: 1, startedAt: Date.now() - 65_000, attached: false, resumeAtMs: null }, { pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), restart: vi.fn() });
    expect(el.querySelector('[data-run-state]')?.textContent).toBe('Running');
    expect(el.querySelector('[data-run-task]')?.textContent).toContain('chop-nearest');
    expect(el.querySelector('[data-run-pause]')).not.toBeNull();
    expect(el.querySelector('[data-run-resume]')).toBeNull();
    const paused = renderRunCard({ state: 'paused', reason: 'human-input', runId: 'r', scriptId: 's', scriptName: 'Chop', task: 'chop-nearest', statusLine: '', attempts: 1, startedAt: 0, attached: false, resumeAtMs: Date.now() + 3000 }, { pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), restart: vi.fn() });
    expect(paused.querySelector('[data-run-state]')?.textContent).toMatch(/Paused: you took control/);
    expect(paused.querySelector('[data-run-resume]')).not.toBeNull();
  });
  test('stuck and hard-stop use the warning and error tones', () => {
    const stuck = renderRunCard({ state: 'paused', reason: 'stuck', task: 'cut-tree' } as never, {} as never);
    expect(stuck.querySelector('[data-run-state]')?.className).toContain('badge-warn');
    const dead = renderRunCard({ state: 'failed', reason: 'hard-stop', task: null } as never, {} as never);
    expect(dead.querySelector('[data-run-state]')?.className).toContain('badge-error');
  });
});
describe('script row', () => {
  test('library rows offer Run and Fork; user rows offer Run, Edit, Delete; unmet requirements disable Run with a title', () => {
    const lib = renderScriptRow({ id: 'chop-and-drop', name: 'Chop and drop', description: '', version: 1, tags: [], source: 'library', params: {}, requirements: { ok: false, missing: ['Needs a bronze axe'] }, order: 10 }, { run: vi.fn(), edit: vi.fn(), fork: vi.fn(), remove: vi.fn() });
    const runBtn = lib.querySelector<HTMLButtonElement>('[data-task-run]')!;
    expect(runBtn.disabled).toBe(true); expect(runBtn.title).toContain('bronze axe');
    expect(lib.querySelector('[data-task-fork]')).not.toBeNull(); expect(lib.querySelector('[data-task-delete]')).toBeNull();
    const user = renderScriptRow({ id: 'u1', name: 'Mine', description: '', version: 2, tags: [], source: 'user', params: {}, requirements: { ok: true, missing: [] }, order: 1000 }, { run: vi.fn(), edit: vi.fn(), fork: vi.fn(), remove: vi.fn() });
    expect(user.querySelector('[data-task-edit]')).not.toBeNull(); expect(user.querySelector('[data-task-delete]')).not.toBeNull();
  });
});
describe('params form', () => {
  test('renders fields from the schema and submits typed values', () => {
    const onSubmit = vi.fn();
    const form = renderParamsForm({ untilLevel: { type: 'number', label: 'Stop at level', default: 15, min: 2, max: 99 }, keepLogs: { type: 'boolean', label: 'Keep logs', default: false } }, onSubmit);
    (form.querySelector('[name="untilLevel"]') as HTMLInputElement).value = '20';
    (form.querySelector('[name="keepLogs"]') as HTMLInputElement).checked = true;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(onSubmit).toHaveBeenCalledWith({ untilLevel: 20, keepLogs: true });
  });
});
```

`traceView.test.ts`: renders one row per event with a `data-kind`, filters by kind through a `<select>`, expands a `stuck` snapshot into a `<pre>` on click, and "Copy to Claude" calls `opts.copy(text)` with the visible rows joined by newlines.

- [ ] **Step 2: Run to see them fail**, then implement `tasksViews.ts` and `traceView.ts` with `h()` builders. Status labels: running `Running` (badge-accent), paused `player` `Paused` (badge-warn), `claude` `Paused by Claude`, `human-input` `Paused: you took control · resumes in Ns` (N from `resumeAtMs`, re-rendered by the plugin every second), `stuck` `Stuck on <task>`, `hard-stop` `Stopped: hp too low` (badge-error), `done` `Done` (badge-ok), `failed` `Failed` (badge-error), `stopped` `Stopped`. Elapsed as `mm:ss`.

- [ ] **Step 3: Implement `tasks.ts` (the plugin)**

`panel(ctx)` mounts five sections in order: run card (only when status state is not `idle`), "My scripts" list (`api.list()` filtered to `source !== 'library' || installed`, where installed means a user doc with `source: 'library'` exists; library entries not installed are hidden here and live in the Marketplace), "Run snippet" (textarea + button; disabled with title "Pause the run first" while running; result rendered as `alert`), "History" (`api.listRuns(20)` rows with status badge, script, `mm:ss`, XP total, "Open trace"), and a footer link "Browse the Marketplace" calling `openPanel('marketplace')`. Subscribes to `api.onStatus` to re-render the card and to `api.onEvent` to append live rows when the trace view is open. Edit opens an inline editor (textarea with the code, Save → `api.save`, compile errors shown as `alert` error). Fork → `api.get(libraryId)` then `api.save({ ...doc, source: 'fork', id: undefined })`. Delete → `confirmDialog` from `web/src/ui/dialog.ts` then `api.remove`. Run → params form if the manifest has params, else immediate; errors surface through `ctx.notify(message, 'error')`. Settings from the manifest map to `api.settings.set` on change.

`web/src/styles/tasks.css`: `.run-card`, `.run-card-head`, `.task-row`, `.task-row-actions`, `.trace`, `.trace-row[data-kind]`, `.trace-pre`, `.snippet` using tokens only (no new colours). Import it in `styles/index.css` after `data.css`.

- [ ] **Step 4: Register in `main.ts`**

`shell.register(createTasksPlugin({ api: () => tasksApi, openPanel: id => panelCtl.open(id) }));` placed before the `connect` plugin so the strip order is XP, Loot, Notes, Screenshot, HUD, Tasks, Marketplace, Claude, Characters, Account, Config, Plugins.

- [ ] **Step 5: Tests, lint, typecheck; commit**

```bash
cd web && npx vitest run src/plugins && npm run lint && npm run typecheck
git add web/src/plugins/builtin/tasks.ts web/src/plugins/builtin/tasksViews.ts web/src/plugins/builtin/traceView.ts web/src/plugins/builtin/tasks.test.ts web/src/plugins/builtin/traceView.test.ts web/src/styles/tasks.css web/src/styles/index.css web/src/main.ts
git commit -m "feat(web): Tasks tab with run card, my scripts, snippet runner, history and trace viewer"
```

---

### Task 12: Marketplace tab

**Files:**
- Create: `web/src/plugins/builtin/marketplace.ts`, `web/src/plugins/builtin/marketplace.test.ts`
- Modify: `web/src/main.ts` (register), `web/src/styles/tasks.css` (`.market-card` rules)

**Interfaces:**
- Consumes: `TasksApi.list/install/run/status`, `PluginContext.notify/openPanel`, `transport.getState()` through `api.getState()` for the "Start here" badge.
- Produces: `createMarketplacePlugin(deps: { api: () => TasksApi | null; openPanel }): ShellPlugin` with manifest `{ id: 'marketplace', name: 'Marketplace', icon: '⚑', tier: 'shell', defaultEnabled: true }`; `renderMarketCard(task: TaskSummary, opts: { installed: boolean; startHere: boolean }, handlers: { run, install }): HTMLElement` with hooks `[data-market-card="<id>"]`, `[data-market-run]`, `[data-market-install]`, `[data-market-search]`.

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, test, vi } from 'vitest';
import { renderMarketCard, filterCatalogue } from './marketplace';
const t = (id: string, name: string, tags: string[] = [], order = 10) => ({ id, name, description: 'd', version: 1, tags, source: 'library' as const, params: {}, requirements: { ok: true, missing: [] }, order, estimateMinutes: 20 });
describe('market card', () => {
  test('shows name, tags, estimate, requirements and both actions', () => {
    const el = renderMarketCard({ ...t('chop-and-drop', 'Chop and drop', ['skilling']), requirements: { ok: false, missing: ['Needs a bronze axe'] } }, { installed: false, startHere: false }, { run: vi.fn(), install: vi.fn() });
    expect(el.textContent).toContain('Chop and drop'); expect(el.textContent).toContain('skilling'); expect(el.textContent).toContain('20 min');
    expect(el.textContent).toContain('Needs a bronze axe');
    expect(el.querySelector('[data-market-run]')).not.toBeNull(); expect(el.querySelector('[data-market-install]')?.textContent).toBe('Add to my tasks');
  });
  test('installed cards say Added; start-here badge appears when asked', () => {
    const el = renderMarketCard(t('tutorial-island', 'Tutorial Island', ['starter'], 0), { installed: true, startHere: true }, { run: vi.fn(), install: vi.fn() });
    expect(el.querySelector('[data-market-install]')?.textContent).toBe('Added');
    expect((el.querySelector('[data-market-install]') as HTMLButtonElement).disabled).toBe(true);
    expect(el.textContent).toContain('Start here');
  });
});
describe('filterCatalogue', () => {
  test('orders by order then name and filters by name or tag', () => {
    const items = [t('b', 'Bravo', ['mining'], 20), t('a', 'Alpha', ['fishing'], 10), t('c', 'Charlie', ['mining'], 20)];
    expect(filterCatalogue(items, '').map(i => i.id)).toEqual(['a', 'b', 'c']);
    expect(filterCatalogue(items, 'min').map(i => i.id)).toEqual(['b', 'c']);
    expect(filterCatalogue(items, 'alp').map(i => i.id)).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Implement**

`filterCatalogue(items, query)` sorts by `order` then `name`, matching `query` (lowercased) against name and tags. The panel: a search `input.input[data-market-search]` (debounce 150 ms), then cards for `api.list().filter(t => t.source === 'library')`, `installed` = a user doc with `libraryId === t.id` exists (the api's `list()` sets `installed` on library summaries; the field exists on `TaskSummary` since Task 4), `startHere` = `t.id === 'tutorial-island' && state.regionId is one of the six tutorial regions` (`TUTORIAL_REGION_IDS` exported from `web/src/tasks/library/regions.ts`: computed from the dbrow coord pairs `0_48_148, 0_49_48, 0_48_48, 0_48_47, 0_47_48, 0_47_47` as `(mx << 8) | mz`). Run now → same params/requirements flow as the Tasks tab (`api.run`); busy errors surface via `notify`. Add to my tasks → `api.install(id)` then re-render. Empty search state uses `empty('No scripts match.')`.

- [ ] **Step 3: Register in `main.ts` right after the Tasks plugin; tests, lint, typecheck; commit**

```bash
cd web && npx vitest run src/plugins/builtin/marketplace.test.ts && npm run lint && npm run typecheck
git add web/src/plugins/builtin/marketplace.ts web/src/plugins/builtin/marketplace.test.ts web/src/tasks/library/regions.ts web/src/tasks/types.ts web/src/tasks/api.ts web/src/styles/tasks.css web/src/main.ts
git commit -m "feat(web): Marketplace tab listing the built-in script catalogue"
```

---

### Task 13: Run banner, strip status dot, Escape to pause, toasts

**Files:**
- Create: `web/src/frame/runBanner.ts`, `web/src/frame/runBanner.test.ts`
- Modify: `web/src/main.ts`, `web/src/partials/frame.html` (add `<div id="run-banner" class="run-banner hidden" role="status"></div>` inside `#canvas-wrap` before `#overlays`), `web/src/styles/tasks.css`

**Interfaces:**
- Consumes: `TasksApi.onStatus/status/pause/resume/stop`, `panelCtl.open`, `byId('icon-strip')`, `notify`.
- Produces: `createRunBanner(deps: { root: HTMLElement; strip: () => HTMLElement; api: () => TasksApi | null; openTasks: () => void; notify: (m: string, k?: 'info' | 'error' | 'ok') => void; now?: () => number }): { update(s: RunStatus): void; dispose(): void }` with hooks `[data-banner-script]`, `[data-banner-task]`, `[data-banner-elapsed]`, `[data-banner-pause]`, `[data-banner-resume]`, `[data-banner-stop]`, `.run-banner.is-running|is-paused|is-error`, and a `.strip-dot.dot-accent|dot-warn|dot-error` appended to the Tasks strip button.

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, test, vi } from 'vitest';
import { createRunBanner } from './runBanner';
function setup() {
  document.body.innerHTML = '<div id="wrap"><div id="run-banner" class="run-banner hidden"></div><nav id="strip"><button class="strip-btn" data-panel="tasks">▶</button></nav></div>';
  const api = { pause: vi.fn(async () => {}), resume: vi.fn(async () => {}), stop: vi.fn(async () => {}), status: vi.fn() } as never;
  const b = createRunBanner({ root: document.getElementById('run-banner')!, strip: () => document.getElementById('strip')!, api: () => api, openTasks: vi.fn(), notify: vi.fn(), now: () => 100_000 });
  return { b, api, root: document.getElementById('run-banner')!, strip: document.getElementById('strip')! };
}
const st = (o: object) => ({ state: 'running', reason: null, runId: 'r', scriptId: 's', scriptName: 'Chop and drop', task: 'chop-nearest', statusLine: 'Chopping Tree', attempts: 1, startedAt: 100_000 - 125_000, attached: false, resumeAtMs: null, ...o }) as never;
describe('run banner', () => {
  test('hidden when idle, orange while running with elapsed and controls', () => {
    const { b, root, strip } = setup();
    b.update(st({ state: 'idle', runId: null }));
    expect(root.classList.contains('hidden')).toBe(true);
    b.update(st({}));
    expect(root.classList.contains('hidden')).toBe(false);
    expect(root.classList.contains('is-running')).toBe(true);
    expect(root.querySelector('[data-banner-elapsed]')?.textContent).toBe('02:05');
    expect(root.querySelector('[data-banner-task]')?.textContent).toContain('chop-nearest');
    expect(strip.querySelector('.strip-dot')?.className).toContain('dot-accent');
  });
  test('paused shows the reason; hard-stop is red; buttons call the api', () => {
    const { b, root, api } = setup();
    b.update(st({ state: 'paused', reason: 'stuck', task: 'cut-tree' }));
    expect(root.classList.contains('is-paused')).toBe(true);
    expect(root.textContent).toContain('Stuck on cut-tree');
    (root.querySelector('[data-banner-resume]') as HTMLButtonElement).click();
    expect(api.resume).toHaveBeenCalledWith('player');
    b.update(st({ state: 'failed', reason: 'hard-stop' }));
    expect(root.classList.contains('is-error')).toBe(true);
    (root.querySelector('[data-banner-stop]') as HTMLButtonElement | null)?.click();
  });
  test('Escape pauses a running run', () => {
    const { b, api } = setup();
    b.update(st({}));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(api.pause).toHaveBeenCalledWith('player');
  });
});
```

- [ ] **Step 2: Implement `runBanner.ts`**

Renders with `h()`; the banner text is `<script> · <task> · <statusLine> · mm:ss`; class per state (`running` → `is-running`, `paused` → `is-paused`, `failed`/hard-stop → `is-error`, `done`/`stopped`/`idle` → hide after 4 s for done/stopped with a toast `Chop and drop finished` / `stopped`). Pause/Resume toggle by state; Stop always present while not idle; the ✦ dot appears when `attached`. A 1 s interval refreshes elapsed and the "resumes in Ns" countdown while visible. The strip dot: find `[data-panel="tasks"]` in `strip()`, append or update `<span class="strip-dot dot ...">`; remove when idle. Escape listener on `document` calls `api.pause('player')` only when state is `running`. Toasts: `stuck` → `notify('Stuck on <task>. Open Tasks to see why.', 'error')`, `hard-stop` → `notify('Run stopped: hp too low', 'error')`, `done` → `notify('<script> finished', 'ok')`.

CSS in `tasks.css`: `.run-banner { position:absolute; top:0; left:0; right:0; display:flex; align-items:center; gap:var(--sp-2); padding:4px 8px; background:rgba(var(--rl-darker),.92); border-bottom:1px solid rgb(var(--rl-border)); font-size:var(--fs-md); z-index:var(--z-overlay); pointer-events:auto; }`, `.run-banner.is-running { border-bottom-color: rgb(var(--rl-orange)); }`, `.run-banner.is-running .run-banner-dot { animation: pulse 1.6s ease-in-out infinite; }`, `.run-banner.is-paused { border-bottom-color: rgb(var(--rl-warn)); }`, `.run-banner.is-error { border-bottom-color: rgb(var(--rl-error)); }`, `.strip-btn { position: relative; } .strip-dot { position:absolute; right:3px; top:3px; width:7px; height:7px; }`, and `@media (prefers-reduced-motion: reduce) { .run-banner .run-banner-dot { animation: none; } }`.

- [ ] **Step 3: Wire in `main.ts`**

`const runBanner = createRunBanner({ root: byId('run-banner'), strip: () => byId('icon-strip'), api: () => tasksApi, openTasks: () => panelCtl.open('tasks'), notify });` and inside `wireTasks`: `api.onStatus(s => runBanner.update(s));`. `rebuildStrip` must call `runBanner.update(tasksApi?.status() ?? IDLE_STATUS)` after rebuilding so the dot survives a strip rebuild, where `export const IDLE_STATUS: RunStatus = { state: 'idle', reason: null, runId: null, scriptId: null, scriptName: null, task: null, statusLine: '', attempts: 0, startedAt: null, attached: false, resumeAtMs: null }` lives in `web/src/tasks/api.ts`.

- [ ] **Step 4: Tests, lint, typecheck, build; commit**

```bash
cd web && npx vitest run src/frame && npm run lint && npm run typecheck && npx vite build
git add web/src/frame/runBanner.ts web/src/frame/runBanner.test.ts web/src/partials/frame.html web/src/styles/tasks.css web/src/main.ts
git commit -m "feat(web): run banner over the canvas, strip status dot, Escape to pause, run toasts"
```

---

### Task 14: Browser e2e, spec note, credits

**Files:**
- Create: `web/e2e/tasks.pw.test.ts`
- Modify: `web/e2e/global.d.ts` (declare `window.idlescape.tasks`), `docs/superpowers/specs/2026-09-05-sp4-tasks-scripting-environment-design.md` (section 15 item 1 note and section 7 `until` signature), `CREDITS.md` (Inspiration rows for Microbot, OSRSBot, RSBot/powerbot), `scripts/verify.ps1` (client test path adds `src/vendor`)

**Interfaces:**
- Consumes: everything above through the browser.

- [ ] **Step 1: Write the e2e**

```ts
import { expect, test } from '@playwright/test';
import { canvasClick, clientState, loginAsGuest, openGate, VIEWPORT_CENTRE } from './helpers';

// A fresh guest stands in the Tutorial Island guide's house: no trees, so chop-and-drop must
// end up stuck (the runner's honest failure path), and a snippet can talk to the RuneScape Guide.
test.describe('tasks runtime', () => {
  test('marketplace lists the library, a run shows in the banner, human input pauses, stop ends it', async ({ page }) => {
    await openGate(page);
    await loginAsGuest(page);
    await page.locator('[data-panel="marketplace"]').click();
    await expect(page.locator('#panel-title')).toHaveText('Marketplace');
    await expect(page.locator('[data-market-card="chop-and-drop"]')).toBeVisible();
    // No axe yet: Run now is disabled with the requirement as its title.
    await expect(page.locator('[data-market-card="chop-and-drop"] [data-market-run]')).toBeDisabled();

    // Requirements are never bypassed, even for tests; run a user script saved through the API
    // that needs no tools and only steps one tile.
    await page.evaluate(async () => {
      const api = window.idlescape!.tasks!;
      await api.save({ name: 'e2e walk', description: 'walks one tile back and forth', tags: ['test'], params: {}, source: 'user',
        code: `export default defineScript({ id: 'e2e-walk', name: 'e2e walk', version: 1, description: '', stuckAfterMs: 20000,
          tasks: [{ name: 'step', when: () => true, timeoutMs: 8000, async run(c) { const p = c.state().player; c.status('stepping'); await c.bot.walkTo(p.worldX + 1, p.worldZ, 0); await c.wait.ticks(2); } }] });` });
    });
    const runId = await page.evaluate(async () => (await window.idlescape!.tasks!.run('e2e-walk', {}, { startedBy: 'test' })).runId);
    expect(runId).toBeTruthy();
    await expect(page.locator('#run-banner')).toBeVisible();
    await expect(page.locator('#run-banner')).toHaveClass(/is-running/);
    await expect(page.locator('[data-panel="tasks"] .strip-dot')).toHaveClass(/dot-accent/);
    await expect.poll(() => page.evaluate(() => window.idlescape!.tasks!.status().task)).toBe('step');

    await test.step('a real click pauses the run and it resumes on its own', async () => {
      await canvasClick(page, VIEWPORT_CENTRE.x + 40, VIEWPORT_CENTRE.y + 40);
      await expect.poll(() => page.evaluate(() => window.idlescape!.tasks!.status().reason)).toBe('human-input');
      await expect(page.locator('#run-banner')).toHaveClass(/is-paused/);
      await expect.poll(() => page.evaluate(() => window.idlescape!.tasks!.status().state), { timeout: 10_000 }).toBe('running');
    });

    await test.step('Tasks tab shows the run card; Stop ends the run and history has it', async () => {
      await page.locator('[data-panel="tasks"]').click();
      await expect(page.locator('[data-run-card] [data-run-state]')).toHaveText('Running');
      await page.locator('[data-run-stop]').click();
      await expect.poll(() => page.evaluate(() => window.idlescape!.tasks!.status().state)).toBe('idle');
      await expect(page.locator('#run-banner')).toBeHidden({ timeout: 6000 });
      const runs = await page.evaluate(() => window.idlescape!.tasks!.listRuns(5));
      expect(runs[0]).toMatchObject({ runId, status: 'stopped', scriptId: 'e2e-walk' });
      const trace = await page.evaluate(id => window.idlescape!.tasks!.getRun(id), runId);
      expect(trace.events.map(e => e.kind)).toEqual(expect.arrayContaining(['run_started', 'task_enter', 'paused', 'resumed', 'run_done']));
    });

    await test.step('a snippet talks to the RuneScape Guide and a dialog opens', async () => {
      const r = await page.evaluate(() => window.idlescape!.tasks!.execute(`
        const r = await bot.talkTo(/runescape guide/i);
        const opened = await wait.dialog(undefined, 8000);
        return { talk: r.success, opened, title: state().tutorial.title };`));
      expect(r.ok).toBe(true);
      expect(r.value).toMatchObject({ opened: true });
      expect(String((r.value as { title: string }).title)).toMatch(/getting started/i);
    });

    await test.step('a script with nothing to do goes stuck and reports a snapshot', async () => {
      await page.evaluate(async () => {
        const api = window.idlescape!.tasks!;
        await api.save({ name: 'e2e never', description: '', tags: ['test'], params: {}, source: 'user',
          code: `export default defineScript({ id: 'e2e-never', name: 'never', version: 1, description: '', stuckAfterMs: 3000, tasks: [{ name: 'never', when: () => false, run: async () => {} }] });` });
        await api.run('e2e-never', {}, { startedBy: 'test' });
      });
      await expect.poll(() => page.evaluate(() => window.idlescape!.tasks!.status().reason), { timeout: 15_000 }).toBe('stuck');
      await expect(page.locator('#run-banner')).toContainText(/Stuck/);
      const s = await clientState(page);
      expect(s.loggedIn).toBe(true);
      await page.evaluate(() => window.idlescape!.tasks!.stop('player'));
    });
  });
});
```

The `bot.talkTo(RegExp)` and `wait.dialog` names must match Task 3's vendored signatures; adjust the snippet if they differ. `global.d.ts` declares `tasks?: import('../src/tasks/api').TasksApi` on `window.idlescape`.

- [ ] **Step 2: Bring the stack up and run**

Per the project memory (PowerShell for process launches): emulators via `Start-Process cmd.exe "/c npm run emulators"` in `firebase/`, then `scripts/start-stack.ps1 -Prod` in the background, wait for `/api/health` `engine: up`, `cd client && bun run build:dev`, `cd web && npm run build`, then `cd web && npx playwright test e2e/tasks.pw.test.ts`. Expected: green. Also re-run `e2e/gameplay.pw.test.ts` and `e2e/plugins.pw.test.ts` to confirm nothing regressed (the strip gained two icons; `plugins.pw.test.ts` uses ids, not positions).

- [ ] **Step 3: Docs**

- Spec section 15 item 1: append "Collision generator and global A* moved to SP4b (plan ruling 2026-09-05): SP4a `walkTo` uses the client routefinder with straight-line legs." Spec section 7 types: `until?(s: WorldState, c: ScriptContext): boolean`. Spec section 12.1 settings: `bannerPosition` is dropped (the banner is always top; one fewer knob).
- `CREDITS.md` Inspiration rows: `chsami/Microbot` (BSD-2-Clause): `sleepUntil` over fixed sleeps, `Microbot.status`, state-machine script base with snapshots, pause-all, agent server; `OSRSB/OsrsBot` (GPL-3.0, ideas only): script lifecycle and provider layout; `powerbot` RSBot lineage (GPL-3.0, ideas only): `@ScriptManifest`, `loop()` returning a delay, paint overlay.
- `scripts/verify.ps1` step 1: `& $bun test src/hooks src/vendor`.

- [ ] **Step 4: Commit**

```bash
git add web/e2e/tasks.pw.test.ts web/e2e/global.d.ts docs/superpowers/specs/2026-09-05-sp4-tasks-scripting-environment-design.md CREDITS.md scripts/verify.ps1
git commit -m "test(e2e): tasks runtime through the marketplace, banner, human-input pause, stop, snippet and stuck path"
```

---

## Acceptance for SP4a

- `scripts/verify.ps1` passes end to end (client hooks + vendor tests, server, web unit, rules, build, Playwright including `tasks.pw.test.ts`).
- Manual: open the game as a guest, Marketplace shows three cards with live requirement text; saving a script from the Tasks tab and running it shows the banner, the strip dot and the run card; clicking the canvas pauses with "you took control" and resumes after 5 s; Escape pauses; Stop ends; History shows the run with its trace.
- `window.idlescape.tasks` matches spec section 10 (SP4c's `/tab` relay calls it without changes).
