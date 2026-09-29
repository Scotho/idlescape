# SP8b - Web bank (2007scape-styled), reordering, live updates, Contracts hooks

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the web shell a full Old School RuneScape style bank window over the game stage, bound to the account's one shared 240-slot bank: eight columns of item slots with OSRS count colours, an item-icon tab bar, drag and keyboard reordering, per-tab sort helpers, an OSRS-style right-click menu whose "Sell..." and "Buy more..." entries are registrable stubs SP9 replaces, and live updates driven by the engine's bank-change hook with polling behind it.

**Architecture:** Everything the browser changes is a *layout* op. `web/src/bank/store.ts` holds one `BankState`, applies each op optimistically, coalesces ops into one `POST /api/bank/ops` per 1.2 s (two world ticks, because any apply puts the owner into the engine's one-tick push-out mode), and runs the version contract: a successful apply's version is immediately reusable as the next `expectedVersion`, a 409 refetches at the version it was handed and drops the optimistic queue. Live updates arrive on a new `GET /api/bank/events` SSE route fanned out from the existing `/internal/bank-changed` hook; because that hook is fire-and-forget with no delivery or ordering guarantee, the store also polls `GET /api/bank` every 10 s and on window focus, and treats the stream purely as an accelerator. Item art comes from the running 274 client through two new hook members (`getObjIcon`, `getObjInfo`, client patch 28) rendered out of `ObjType.getSprite` into a PNG data URL and cached in IndexedDB, so icons survive reloads and show before any client is open. The window itself is plain DOM in the parent document, mounted into a new `#bank-window` host inside `#canvas-wrap`, styled with CSS only (no Jagex art is vendored).

**Tech Stack:** Vite + TypeScript shell (`web/`, Vitest + jsdom, Playwright), Bun front server (`server/`, `bun test`), vendored 274 client fork (`client/`, `bun test`, `bun run build:dev`).

**Spec:** `docs/superpowers/specs/2026-09-05-sp8b-web-bank-design.md`, including section 11's four owner decisions. It amends `docs/superpowers/specs/2026-09-05-multi-character-platform-design.md` sections 7 and 10. The data contract it builds on is recorded in `engine-custom/PATCHES.md` ("Owner bank semantics", "Management routes").

## Global Constraints

- Strict TypeScript, no new `as any`, files under **400 lines**, a `types.ts` per package, conventional commits.
- Unit tests: **Vitest with jsdom** for `web/` (`cd web && npx vitest run`); **`bun test`** for `server/` and `client/`.
- Browser tests: **Playwright against the live stack**. Build with `cd web && npm run build:e2e && npx playwright test`. **NEVER** run plain `npm run build` for an e2e run: the front server serves `web/dist-e2e`, not `web/dist`.
- Dev stack: firebase emulators on **9099** (auth) and **8080** (firestore); engine on **8899** with management on **8897**; front server on **8787** serving `web/dist-e2e` and `client/out` from disk. Bring it up with `scripts/start-stack.ps1 -Prod` (PowerShell `Start-Process`, not bash); ready in about 2 minutes; a client rebuild needs no restart.
- Branch: `feat/platform-shell`. Every commit ends with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
  ```
- **No em dashes in new prose** (source comments, docs, UI copy). Use hyphens or commas.
- **Do not edit `engine/`, `engine-custom/` or `deploy/`.** This plan needs none of them: every server-side behaviour it relies on already shipped in SP8 and is pinned in `engine-custom/PATCHES.md`. `client/` **is** edited, once, for patch 28 (the icon and obj-info hooks); that is the only way to get item art into the web, because the 274 client rasterises icons from the cache at runtime and there is no sprite sheet on disk.
- **The owner's four decisions are binding:** (1) no remote deposit-all, the web bank is view and re-order only; (2) buying and selling go through Contracts only; (3) sort helpers live in the web UI and are never added to the game client; (4) a tab's icon is always the first item in that tab.
- Per-command verification (Git Bash, from the repo root):
  - web: `cd web && npm run typecheck && npm run lint && npx vitest run`
  - server: `cd server && ~/.bun/bin/bun run typecheck && ~/.bun/bin/bun test`
  - client: `cd client && ~/.bun/bin/bunx tsc --noEmit && ~/.bun/bin/bun test src/hooks && ~/.bun/bin/bun run build:dev`
  - e2e: stack up, then `cd web && npm run build:e2e && npx playwright test`

## What SP8 already shipped, verified in the code

Read this before Task 1; every task assumes it.

- `server/src/types.ts`: `BankSlot { slot; obj; count }` (there is **no** `noted` field: a noted item is its own obj id), `BankSnapshot { ownerKey; version; capacity; tabs; slots }`, `BankOp` (six shapes including `delta`), `BANK_LAYOUT_OPS = ['swap','insert','moveToTab','setTabs','sort']`.
- `server/src/bank/routes.ts`: `createBankRoutes({ client, secret })` returning `{ handle, handleHook, versionOf }`. `GET /api/bank` returns the snapshot with `slots` sparse and slot-ordered. `POST /api/bank/ops` takes `{ expectedVersion, ops }`, at most **200** ops, human principals only, and answers `403 { error: 'layout_only' }` to a `delta` op or the `{ obj, delta }` shorthand. A conflict is `409 { error: 'version', version }`; an engine rejection is `422 { error: <BankApplyError> }`; a suspended owner is `503 { error: 'unavailable' }`. The module already keeps a `versions: Map<string, number>` fed by `GET`, by a successful apply, by a conflict and by `handleHook`.
- `server/src/router.ts`: `classify()` maps `/api/bank` and `/api/bank/ops` to `{ kind: 'bank', sub }`, and `/internal/bank-changed` to `{ kind: 'bankHook' }`; `principalRule({ kind: 'bank' })` is `'human'`.
- `server/src/engine/managementClient.ts`: `createManagementClient({ baseUrl, secret, fetchImpl? })` returning `{ getBank, applyBank }`, with `ApplyResult = { ok: true; version } | { ok: false; kind: 'conflict'; version } | { ok: false; kind: 'rejected'; error } | { ok: false; kind: 'unavailable' }`. **SP8b imports this module; it never adds a second client.**
- **Post-apply version contract** (`engine-custom/PATCHES.md`, "The store"): a successful apply returns the version the bank now holds, and that number is immediately reusable as the next `expectedVersion`, because the following tick's sweep consumes the apply's dirt without bumping.
- **Push-out mode:** for one tick after ANY apply, item-only included, the store's tab layout is written OUT to every online character instead of read back in. An in-game tab drag colliding in that tick loses to the web caller. A client applying on most ticks holds the owner in push-out mode continuously, so the apply cadence matters.
- Tabs are `number[]`, at most 9, every size at least 1, `sum(tabs) <= lastUsedSlot`, mirrored to nine `scope=perm` varps `banktab_size_1..9`.
- **Explicitly NOT guaranteed:** change-hook delivery or ordering (fire and forget, 2 s timeout, no retry, silent when `IDLESCAPE_HOOK_URL` or the management secret is missing); that an in-game bank change is on disk before the next flush; the writable tab layout when two characters of one account are online at once; any agent access at all.
- `scripts/start-stack.ps1:58` sets `IDLESCAPE_HOOK_URL=http://127.0.0.1:8787/internal/bank-changed`, so the hook is live in the dev stack. In a deployed world it is a manual step that `README.md` only **documents** (section "Deploy: engine overlay and production hardening", step 3); no file under `deploy/` sets it today, so a deployment that has not had that step applied delivers no hook at all. Both paths must work, which is why polling is unconditional.

## Interfaces from the shell (SP7) this plan plugs into

- `web/src/frame/stage.ts` is the composition root for sessions; `web/src/main.ts` wires everything.
- `web/src/plugins/types.ts`: `PluginManifest { id; name; icon; tier; description; settings?; defaultEnabled?; alwaysOn?; requires? }`, `PluginContext { client(); settings; storage; notify; openPanel; user() }`, `ShellPlugin { manifest; onEnable?; onDisable?; panel?; overlay?; onTick? }`, `definePlugin`.
- `web/src/frame/panels.ts`: `PanelView { title; mount(body); unmount? }`; `createPluginRegistry({ strip, panel, title, body, onChange })` returning `{ open, close, toggle, current, manifests, register, restore }`.
- `web/src/plugins/registry.ts`: `createShellRegistry(deps)`; `main.ts` calls `shell.register(...)` for each plugin and `rebuildStrip` builds the icon strip from enabled panel-bearing plugins.
- `web/src/types.ts`: `PanelId = 'xp' | 'loot' | 'connect' | 'account' | 'config' | 'plugins' | 'characters' | 'tasks' | 'marketplace'`.
- `web/src/ui/el.ts`: `h(tag, attrs, ...children)`, `kv`, `badge`, `alert`, `empty`. `web/src/ui/strip.ts`: `applyTabListA11y(strip)`. `web/src/ui/toast.ts`: `createToastHost(root)`.
- `web/src/clientTypes.ts` mirrors `client/src/hooks/types.ts` verbatim; `ClientHooks` currently has `getObjName(id): string | null` and no icon member.
- `web/src/styles/index.css` imports the token and component sheets in cascade order; `web/src/styles/tokens.css` defines `--rl-*` colours, `--sp-*`, `--fs-*`, `--z-*`, `--focus-ring`.
- `web/e2e/helpers.ts`: `GATE_PASSWORD`, `SIGNUP_PASSWORD`, `CANVAS`, `uniqueName`, `openGate`, `clientState`, `loginAsGuest`, `createFirstCharacter`, `signUp`, `openPanel`, `sessionStates`, `createCharacterFromPanel`, `canvasClick`, `pressTitleLogin`.
- `web/e2e/bank.pw.test.ts` already proves the SP8 data path from a browser and holds a private `idTokenFor(email)` helper plus a `BankSnapshot` interface; Task 16 lifts both into `helpers.ts`.

## Explicitly out of scope for SP8b

Spec section 7's *game client* mirror (a `Client.ts` patch drawing only the selected tab's slot range plus divider lines, the `bank_main.if` tab components, the `bank.rs2` tab handlers, drag-to-tab and in-game search) is **SP8c**. It touches `content-custom/` and needs a second anchored client patch, it is independently testable, and none of the web work below depends on it: the tab sizes already round-trip through the nine `banktab_size_*` varps that SP8 seeds and pushes out. Task 17 records that split in the spec.

Also out: placeholders and bank fillers (engine-level), capacity beyond 240, market prices for `sort by value` (SP9; the engine's High Alchemy value is used), and any agent access to the bank (SP8 is human-only; SP9 revisits).

---

## File Structure

**Create**

- `web/src/bank/types.ts` - the package's shared shapes and constants. No logic.
- `web/src/bank/layout.ts` - pure tab and slot arithmetic, count formatting, local (optimistic) op application, sort comparators. The web counterpart of `engine-custom/src/idlescape/bankLayout.ts`.
- `web/src/bank/api.ts` - typed calls to `GET /api/bank` and `POST /api/bank/ops`, plus player-facing error copy.
- `web/src/bank/stream.ts` - the live-update client: an SSE reader driven by `fetch` (not `EventSource`, which cannot send a bearer), with backoff, a watchdog and a health flag.
- `web/src/bank/store.ts` - one `BankState`, optimistic ops, the coalescing flush, the version loop, polling.
- `web/src/bank/icons.ts` - IndexedDB icon cache in front of the client's `getObjIcon`.
- `web/src/bank/grid.ts` - the item pane: eight columns, counts, dividers, selection, drag, keyboard.
- `web/src/bank/tabsBar.ts` - the tab strip: "All items", one tab per tab with its first item's icon, "+".
- `web/src/bank/contextMenu.ts` - the OSRS-style menu and the entry registry SP9 writes into.
- `web/src/bank/view.ts` - the window: title bar, capacity, tabs, pane, bottom bar, search, focus and Escape.
- `web/src/plugins/builtin/bank.ts` - the `bank` shell plugin (icon, panel, open/close).
- `web/src/styles/bank.css` - all bank styling, imported from `index.css`.
- `web/e2e/bank-ui.pw.test.ts` - the browser coverage.
- Test files alongside each web module: `layout.test.ts`, `api.test.ts`, `stream.test.ts`, `store.test.ts`, `icons.test.ts`, `grid.test.ts`, `tabsBar.test.ts`, `contextMenu.test.ts`, `view.test.ts`, `plugins/builtin/bank.test.ts`.

**Modify**

- `client/src/hooks/types.ts`, `client/src/hooks/install.ts`, `client/src/hooks/install.test.ts`, `client/src/client/Client.ts`, `client/bundle.ts`, `client/PATCHES.md` - patch 28.
- `web/src/clientTypes.ts` - mirror patch 28's two members.
- `server/src/router.ts`, `server/src/router.test.ts` - `/api/bank/events`.
- `server/src/bank/routes.ts`, `server/src/bank/routes.test.ts` - the SSE handler and hook fan-out.
- `web/src/types.ts` - `PanelId` gains `'bank'`.
- `web/src/partials/frame.html` - the `#bank-window` host.
- `web/src/styles/index.css` - import `bank.css`.
- `web/styleguide.html`, `web/src/styleguide.ts` - a bank section.
- `web/src/main.ts` - build the api, store, icon cache, menu registry, window; register the plugin.
- `web/e2e/helpers.ts`, `web/e2e/bank.pw.test.ts` - shared `idTokenFor`, `BankSnapshot`, new bank UI helpers.
- `docs/superpowers/specs/2026-09-05-sp8b-web-bank-design.md`, `docs/superpowers/specs/2026-09-05-idlescape-roadmap-and-handoff.md`, `README.md` - recorded deviations and the SP8c split.

---

### Task 1: Item sprites - decide the source, then ship it as client patch 28

The spec (section 3.1) assumed `ObjType.getIcon(id, count)` rendering into a `PixMap`. **Neither exists in this fork.** What exists, verified in `client/src/config/ObjType.ts:364-518`, is:

```ts
static getSprite(id: number, count: number, outlineRgb: number): Pix32 | null
```

It returns a 32x32 `Pix32` whose `data: Int32Array` holds 0 for transparent and packed RGB otherwise; `outlineRgb === 0` is the inventory form (drop shadow, cached in `ObjType.spriteCache`), it already swaps in the stack-size art variant (`countobj`/`countco`) and already draws the note background for a cert item, and it saves and restores every `Pix2D`/`Pix3D` global it touches. It can return `null` when the model has not been streamed yet, and `ObjType.list` throws before the config archive loads and reads out of bounds past `ObjType.numDefinitions`, so both need guarding.

There is **no build-time sprite sheet** anywhere in the repo (`scripts/gen` does not exist) and the 274 client's `ObjType` has **no `tradeable` field** (the engine's does, `engine/server/src/cache/config/ObjType.ts:180`, but it never reaches the client cache). So: icons come from the running client at runtime, and Task 11 records that "Sell..." cannot be greyed out for untradeables in v1.

**Files:**
- Modify: `client/src/hooks/types.ts`, `client/src/hooks/install.ts`, `client/src/client/Client.ts` (bridge in the `installHooks({...})` block, plus two new private methods beside `emitInventoryDiff`), `client/bundle.ts`, `client/PATCHES.md`, `web/src/clientTypes.ts`
- Test: `client/src/hooks/install.test.ts` (modify)

**Interfaces:**
- Consumes: `HookBridge`, `installHooks`, `ClientHooks` (existing); `ObjType` and `Pix32`, both already imported by `Client.ts` (lines 16 and 55).
- Produces, in `client/src/hooks/types.ts` and mirrored verbatim into `web/src/clientTypes.ts`:
  ```ts
  /** Static obj facts the web bank needs. Null for an id this pack has never heard of. */
  export interface ObjInfo {
    name: string;
    /** Examine text, or null when the obj has none. */
    examine: string | null;
    /** ObjType.cost. The engine's `sort by value` is max(floor(cost * 6 / 10), 1). */
    cost: number;
    stackable: boolean;
    /** True for a bank note (certtemplate !== -1); notes are their own obj ids. */
    noted: boolean;
  }
  ```
  On `ClientHooks`:
  ```ts
  /** 32x32 PNG data URL of the inventory sprite, or null (unknown id, or model not streamed yet). */
  getObjIcon(id: number, count?: number): string | null;
  getObjInfo(id: number): ObjInfo | null;
  ```
  On `HookBridge` the same two, with `count: number` required; `install.ts` defaults it to 1.

- [ ] **Step 1: Write the failing hook test**

Append to `client/src/hooks/install.test.ts`. The file already aliases `window` to `globalThis` before importing `install.ts` and has a `harness()` builder. Change that builder's signature to `function harness(over: Partial<HookBridge> = {}): { hooks: ClientHooks; calls: Calls }`, give the bridge literal the defaults `getObjIcon: () => null` and `getObjInfo: () => null`, and spread `...over` last. Then add:

```ts
// client/src/hooks/install.test.ts  (appended)
import type { ObjInfo } from './types';

const COIN_ICON = 'data:image/png;base64,COIN';
const COIN_INFO: ObjInfo = { name: 'Coins', examine: 'Lovely money!', cost: 1, stackable: true, noted: false };

describe('installHooks obj art surface (patch 28)', () => {
  test('getObjIcon forwards the id and the count, defaulting the count to 1', () => {
    const asked: [number, number][] = [];
    const { hooks } = harness({
      getObjIcon: (id: number, count: number) => { asked.push([id, count]); return COIN_ICON; }
    });
    expect(hooks.getObjIcon(995, 500)).toBe(COIN_ICON);
    expect(hooks.getObjIcon(995)).toBe(COIN_ICON);
    expect(asked).toEqual([[995, 500], [995, 1]]);
  });

  test('getObjIcon relays a null from the bridge rather than inventing a placeholder', () => {
    const { hooks } = harness({ getObjIcon: () => null });
    expect(hooks.getObjIcon(4151)).toBeNull();
  });

  test('getObjInfo relays the obj facts and a null for an unknown id', () => {
    const { hooks } = harness({ getObjInfo: (id: number) => (id === 995 ? COIN_INFO : null) });
    expect(hooks.getObjInfo(995)).toEqual(COIN_INFO);
    expect(hooks.getObjInfo(99999)).toBeNull();
  });

  test('both members are published on window.idlescape.client', () => {
    const { hooks } = harness();
    const published = (globalThis as { idlescape?: { client?: ClientHooks } }).idlescape?.client;
    for (const member of ['getObjIcon', 'getObjInfo']) {
      expect(typeof (published as unknown as Record<string, unknown>)[member]).toBe('function');
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && ~/.bun/bin/bun test src/hooks/install.test.ts`
Expected: FAIL - `getObjIcon`/`getObjInfo` do not exist on `ClientHooks` or `HookBridge`.

- [ ] **Step 3: Add the members to the hook contract**

`client/src/hooks/types.ts`: add and export `ObjInfo`, add the two members to `ClientHooks` (`count?: number`) and to `HookBridge` (`count: number`).

`client/src/hooks/install.ts`, in the `hooks` literal beside `getObjName`:

```ts
    getObjIcon: (id, count) => bridge.getObjIcon(id, count ?? 1),
    getObjInfo: id => bridge.getObjInfo(id),
```

- [ ] **Step 4: Run the hook test to verify it passes**

Run: `cd client && ~/.bun/bin/bun test src/hooks/install.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the bridge in Client.ts (patch 28)**

In the `installHooks({ ... })` bridge literal (patch 3's block), beside `getObjName`:

```ts
            getObjIcon: (id: number, count: number): string | null => this.objIconDataUrl(id, count),
            getObjInfo: (id: number): ObjInfo | null => this.objInfo(id),
```

and two new private methods next to `emitInventoryDiff()`:

```ts
    /**
     * The 274 client rasterises item art from the cache at runtime; there is no sprite sheet on
     * disk. ObjType.getSprite(id, count, 0) is the inventory form: shadowed, cached, already
     * swapping in the stack-size art variant and already drawing a note's background. Its Pix32
     * is a 32x32 Int32Array where 0 means transparent, so it converts straight into ImageData.
     *
     * Returns null rather than throwing on every failure the web can legitimately hit: an id
     * past this pack (ObjType.list indexes a bare array), a model OnDemand has not streamed yet
     * (getSprite returns null), or a call made before the config archive loaded (list throws).
     * The web caches only non-null answers and asks again later.
     */
    private objIconDataUrl(id: number, count: number): string | null {
        if (!Number.isInteger(id) || id < 0 || id >= ObjType.numDefinitions) {
            return null;
        }
        let sprite: Pix32 | null;
        try {
            sprite = ObjType.getSprite(id, count, 0);
        } catch {
            return null;
        }
        if (!sprite) {
            return null;
        }
        const canvas: HTMLCanvasElement = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
        if (!ctx) {
            return null;
        }
        const image: ImageData = ctx.createImageData(32, 32);
        for (let i: number = 0; i < 32 * 32; i++) {
            const rgb: number = sprite.data[i];
            image.data[i * 4] = (rgb >> 16) & 0xff;
            image.data[i * 4 + 1] = (rgb >> 8) & 0xff;
            image.data[i * 4 + 2] = rgb & 0xff;
            image.data[i * 4 + 3] = rgb === 0 ? 0 : 255;
        }
        ctx.putImageData(image, 0, 0);
        return canvas.toDataURL('image/png');
    }

    /** ObjType facts the web bank needs; null for an id this pack has never heard of. */
    private objInfo(id: number): ObjInfo | null {
        if (!Number.isInteger(id) || id < 0 || id >= ObjType.numDefinitions) {
            return null;
        }
        let type: ObjType;
        try {
            type = ObjType.list(id);
        } catch {
            return null;
        }
        return { name: type.name ?? '', examine: type.desc, cost: type.cost, stackable: type.stackable, noted: type.certtemplate !== -1 };
    }
```

Add `ObjInfo` to the existing type-only import from `#/hooks/install.js` at the top of `Client.ts`.

- [ ] **Step 6: Reserve the new property names in the bundle**

`client/bundle.ts`, in `reserved`, after the SP7 block:

```ts
                    // SP8b patch 28: the web bank reads item art and obj facts off the hooks.
                    'getObjIcon', 'getObjInfo', 'examine', 'cost', 'stackable', 'noted',
```

- [ ] **Step 7: Mirror the contract into the web**

`web/src/clientTypes.ts`: add the same exported `ObjInfo` and the same two `ClientHooks` members, same doc comments. Its header says "Mirror of client/src/hooks/types.ts; keep identical", and that must stay true.

- [ ] **Step 8: Record patch 28 in client/PATCHES.md**

Add to the patch table:

| 28 | `installHooks({...})` bridge (patch 3) + two new private methods beside `emitInventoryDiff()` | **SP8b item art.** `getObjIcon(id, count)` renders `ObjType.getSprite(id, count, 0)` (32x32 `Pix32`, 0 = transparent) into `ImageData` and returns a PNG data URL; `getObjInfo(id)` returns `{ name, examine, cost, stackable, noted }`. Both bound-check against `ObjType.numDefinitions` and swallow the `ObjType.list` throw, so an id past this pack, a model OnDemand has not streamed, or a call before the config archive loads all answer `null` instead of taking the frame down. The 274 obj cache has no `tradeable` field, so none is exposed. | `private objIconDataUrl(id: number, count: number): string \| null {` |

Add to the "How to verify all patches are present" block:

```sh
grep -c "private objIconDataUrl(id: number, count: number)" src/client/Client.ts  # 1
grep -c "private objInfo(id: number): ObjInfo | null"        src/client/Client.ts  # 1
grep -c "'getObjIcon', 'getObjInfo'"                         bundle.ts             # 1
```

and add `getObjIcon` / `getObjInfo` to the header paragraph that lists the public hook contract.

- [ ] **Step 9: Verify the client end to end**

Run: `cd client && ~/.bun/bin/bunx tsc --noEmit && ~/.bun/bin/bun test src/hooks && ~/.bun/bin/bun run build:dev`
Then: `cd client && grep -c getObjIcon out/client.js` - expect at least 1, proving terser kept the name.
Then: `cd web && npm run typecheck`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add client/src/hooks/types.ts client/src/hooks/install.ts client/src/hooks/install.test.ts client/src/client/Client.ts client/bundle.ts client/PATCHES.md web/src/clientTypes.ts
git commit -F - <<'MSG'
feat(client): expose getObjIcon and getObjInfo for the web bank (patch 28)

The 274 fork has no ObjType.getIcon and no build-time sprite sheet; item art
comes from ObjType.getSprite(id, count, 0), a 32x32 Pix32 rendered here into a
PNG data URL. getObjInfo carries name, examine, cost, stackable and noted; the
274 obj cache has no tradeable flag, so none is exposed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
MSG
```

---

### Task 2: Bank types and the pure layout module

**Files:**
- Create: `web/src/bank/types.ts`, `web/src/bank/layout.ts`
- Test: `web/src/bank/layout.test.ts`

**Interfaces:**
- Consumes: `ObjInfo` from `web/src/clientTypes.ts` (Task 1).
- Produces, `web/src/bank/types.ts`:
  ```ts
  import type { ObjInfo } from '../clientTypes';
  export type { ObjInfo };

  /** One occupied slot. Mirrors server/src/types.ts BankSlot exactly; there is no `noted`
   *  field because a bank note is its own obj id (ObjInfo.noted says so). */
  export interface BankSlot { slot: number; obj: number; count: number }
  /** The wire shape of GET /api/bank. `slots` is sparse and slot-ordered. */
  export interface BankSnapshot { ownerKey: string; version: number; capacity: number; tabs: number[]; slots: BankSlot[] }

  export type BankSortKey = 'value' | 'name' | 'id';
  /** Exactly the five ops POST /api/bank/ops accepts. `delta` is deliberately absent. */
  export type BankOp =
    | { op: 'swap'; a: number; b: number }
    | { op: 'insert'; from: number; to: number }
    | { op: 'moveToTab'; slot: number; tab: number }
    | { op: 'setTabs'; sizes: number[] }
    | { op: 'sort'; tab: number; by: BankSortKey };

  export type RearrangeMode = 'swap' | 'insert';
  export type WithdrawAs = 'item' | 'note';
  export type Quantity = 1 | 5 | 10 | 'x' | 'all';

  /** What the right-click menu is acting on. */
  export interface MenuItemContext { slot: number; obj: number; count: number; info: ObjInfo | null }
  /** One menu row. SP9 registers its two by id; the bank module never imports Contracts. */
  export interface MenuEntry {
    id: string;
    label: string | ((ctx: MenuItemContext) => string);
    enabled: boolean | ((ctx: MenuItemContext) => boolean);
    /** Shown greyed beside a disabled entry, e.g. 'Contracts coming soon'. */
    hint?: string;
    run(ctx: MenuItemContext): void;
  }

  /** Dense view of the bank: index === slot, null === empty. */
  export type BankItems = (BankSlot | null)[];

  export const BANK_COLUMNS = 8;
  export const MAX_TABS = 9;
  /** Two world ticks. Any apply puts the owner in push-out mode for one tick, so the web
   *  coalesces to at most one apply per two ticks (engine-custom/PATCHES.md). */
  export const FLUSH_MS = 1_200;
  /** The change hook has no delivery guarantee, so the bank always polls behind the stream. */
  export const POLL_MS = 10_000;
  /** POST /api/bank/ops refuses a batch longer than this. */
  export const MAX_OPS_PER_BATCH = 200;
  ```
- Produces, `web/src/bank/layout.ts`:
  ```ts
  export function tabRanges(tabs: number[]): { start: number; end: number }[];
  /** 1..9 for a real tab, 0 for the main tab beyond them. */
  export function tabOfSlot(tabs: number[], slot: number): number;
  /** The slot range a tab owns. Tab 0 runs from sum(tabs) to `used`. */
  export function rangeOfTab(tabs: number[], tab: number, used: number): { start: number; end: number };
  /** Highest occupied index + 1, or 0. */
  export function usedOf(items: BankItems): number;
  /** GET /api/bank's sparse slots as a dense, capacity-long array. */
  export function expandSlots(snapshot: BankSnapshot): BankItems;
  /** Owner decision 4: a tab's icon is the first item in it. Null for an empty tab. */
  export function tabIconObj(items: BankItems, tabs: number[], tab: number, used: number): number | null;
  export function tabItemCount(items: BankItems, tabs: number[], tab: number, used: number): number;
  /** Optimistic local versions of the two move ops. Both return a NEW array. */
  export function localSwap(items: BankItems, a: number, b: number): BankItems;
  export function localInsert(items: BankItems, from: number, to: number): BankItems;
  /** True when an insert would drag items across a tab boundary; the engine rejects it
   *  with `tab_invariant` unless the same batch carries a setTabs. */
  export function insertCrossesTab(tabs: number[], from: number, to: number): boolean;
  /** The engine's only price signal, verified against alchemy.rs2:25. */
  export function alchValue(cost: number): number;
  /** OSRS stack colours. Null under 2: a single item shows no number. */
  export function formatCount(count: number): { text: string; tone: 'yellow' | 'white' | 'green' } | null;
  /** Same order the engine's `sort` op produces, so the optimistic view matches. */
  export function localSort(items: BankItems, tabs: number[], tab: number, used: number, by: BankSortKey, info: (obj: number) => ObjInfo | null): BankItems;
  ```

- [ ] **Step 1: Write the failing layout test**

```ts
// web/src/bank/layout.test.ts
import { describe, expect, it } from 'vitest';
import type { BankItems, BankSnapshot, ObjInfo } from './types';
import {
  alchValue, expandSlots, formatCount, insertCrossesTab, localInsert, localSort, localSwap,
  rangeOfTab, tabIconObj, tabItemCount, tabOfSlot, tabRanges, usedOf
} from './layout';

const at = (slot: number, obj: number, count = 1) => ({ slot, obj, count });

/** Dense array of `objs`, padded with nulls to `capacity`. */
function items(objs: (number | null)[], capacity = 240): BankItems {
  const out: BankItems = new Array(capacity).fill(null);
  objs.forEach((obj, slot) => { out[slot] = obj === null ? null : { slot, obj, count: 1 }; });
  return out;
}

const INFO: Record<number, ObjInfo> = {
  995: { name: 'Coins', examine: 'Lovely money!', cost: 1, stackable: true, noted: false },
  1618: { name: 'Uncut diamond', examine: 'This looks valuable.', cost: 200, stackable: false, noted: false },
  1619: { name: 'Uncut ruby', examine: 'This looks valuable.', cost: 100, stackable: false, noted: false }
};
const info = (obj: number): ObjInfo | null => INFO[obj] ?? null;

describe('tab arithmetic', () => {
  it('turns sizes into contiguous ranges', () => {
    expect(tabRanges([2, 3])).toEqual([{ start: 0, end: 2 }, { start: 2, end: 5 }]);
    expect(tabRanges([])).toEqual([]);
  });

  it('reports which tab a slot is in, 0 for the main tab', () => {
    expect(tabOfSlot([2, 3], 0)).toBe(1);
    expect(tabOfSlot([2, 3], 1)).toBe(1);
    expect(tabOfSlot([2, 3], 2)).toBe(2);
    expect(tabOfSlot([2, 3], 4)).toBe(2);
    expect(tabOfSlot([2, 3], 5)).toBe(0);
    expect(tabOfSlot([], 0)).toBe(0);
  });

  it('gives the main tab everything past the last tab, up to the used slots', () => {
    expect(rangeOfTab([2, 3], 0, 9)).toEqual({ start: 5, end: 9 });
    expect(rangeOfTab([2, 3], 2, 9)).toEqual({ start: 2, end: 5 });
    // A tab index past the end is empty, not a throw.
    expect(rangeOfTab([2], 4, 9)).toEqual({ start: 9, end: 9 });
  });

  it('counts used slots as the highest occupied index plus one, holes included', () => {
    expect(usedOf(items([995, null, 1618]))).toBe(3);
    expect(usedOf(items([]))).toBe(0);
  });
});

describe('expandSlots', () => {
  it('makes the sparse wire shape dense and capacity-long', () => {
    const snapshot: BankSnapshot = { ownerKey: 'u', version: 3, capacity: 240, tabs: [], slots: [at(0, 995, 500), at(2, 1618)] };
    const dense = expandSlots(snapshot);
    expect(dense.length).toBe(240);
    expect(dense[0]).toEqual({ slot: 0, obj: 995, count: 500 });
    expect(dense[1]).toBeNull();
    expect(dense[2]).toEqual({ slot: 2, obj: 1618, count: 1 });
    expect(dense[239]).toBeNull();
  });
});

describe('tab icons and counts (owner decision 4)', () => {
  it('uses the first item of the tab as its icon', () => {
    const bank = items([995, 1618, 1619]);
    expect(tabIconObj(bank, [2], 1, 3)).toBe(995);
    expect(tabIconObj(bank, [2], 0, 3)).toBe(1619);
  });

  it('skips holes when picking the icon and reports null for an empty tab', () => {
    expect(tabIconObj(items([null, 1618]), [2], 1, 2)).toBe(1618);
    expect(tabIconObj(items([995]), [1], 2, 1)).toBeNull();
  });

  it('counts the occupied slots of a tab', () => {
    expect(tabItemCount(items([995, null, 1618, 1619]), [3], 1, 4)).toBe(2);
    expect(tabItemCount(items([995, null, 1618, 1619]), [3], 0, 4)).toBe(1);
  });
});

describe('local swap and insert', () => {
  it('swaps two slots without touching the rest', () => {
    const before = items([995, 1618, 1619]);
    const after = localSwap(before, 0, 2);
    expect(after.slice(0, 3).map(s => s?.obj)).toEqual([1619, 1618, 995]);
    // The input is never mutated: the optimistic view must be reversible on a 409.
    expect(before.slice(0, 3).map(s => s?.obj)).toEqual([995, 1618, 1619]);
  });

  it('renumbers the slot field so the view and the server agree', () => {
    const after = localSwap(items([995, 1618]), 0, 1);
    expect(after[0]).toEqual({ slot: 0, obj: 1618, count: 1 });
    expect(after[1]).toEqual({ slot: 1, obj: 995, count: 1 });
  });

  it('shifts everything between the ends on an insert, in both directions', () => {
    expect(localInsert(items([1, 2, 3, 4]), 0, 2).slice(0, 4).map(s => s?.obj)).toEqual([2, 3, 1, 4]);
    expect(localInsert(items([1, 2, 3, 4]), 3, 1).slice(0, 4).map(s => s?.obj)).toEqual([1, 4, 2, 3]);
  });

  it('is a no-op when the ends are equal', () => {
    expect(localInsert(items([1, 2, 3]), 1, 1).slice(0, 3).map(s => s?.obj)).toEqual([1, 2, 3]);
  });
});

describe('insertCrossesTab', () => {
  it('is false inside one tab and true across a boundary', () => {
    expect(insertCrossesTab([2, 2], 0, 1)).toBe(false);
    expect(insertCrossesTab([2, 2], 1, 2)).toBe(true);
    expect(insertCrossesTab([2, 2], 3, 5)).toBe(true);
    // Everything past the tabs is one main tab.
    expect(insertCrossesTab([2], 4, 7)).toBe(false);
  });
});

describe('alchValue', () => {
  it('is max(floor(cost * 6 / 10), 1), the engine formula', () => {
    expect(alchValue(0)).toBe(1);
    expect(alchValue(1)).toBe(1);
    expect(alchValue(100)).toBe(60);
    expect(alchValue(101)).toBe(60);
  });
});

describe('formatCount', () => {
  it('shows nothing for a single item', () => {
    expect(formatCount(1)).toBeNull();
  });

  it('is yellow below 100 000', () => {
    expect(formatCount(2)).toEqual({ text: '2', tone: 'yellow' });
    expect(formatCount(99_999)).toEqual({ text: '99999', tone: 'yellow' });
  });

  it('turns white and K at 100 000', () => {
    expect(formatCount(100_000)).toEqual({ text: '100K', tone: 'white' });
    expect(formatCount(9_999_999)).toEqual({ text: '9999K', tone: 'white' });
  });

  it('turns green and M at 10 000 000', () => {
    expect(formatCount(10_000_000)).toEqual({ text: '10M', tone: 'green' });
    expect(formatCount(2_147_483_647)).toEqual({ text: '2147M', tone: 'green' });
  });
});

describe('localSort', () => {
  const bank = items([1619, 995, 1618]);

  it('sorts a tab by descending alch value and compacts it', () => {
    const after = localSort(bank, [3], 1, 3, 'value', info);
    expect(after.slice(0, 3).map(s => s?.obj)).toEqual([1618, 1619, 995]);
  });

  it('sorts by name with an en collation, not the host locale', () => {
    const after = localSort(bank, [3], 1, 3, 'name', info);
    expect(after.slice(0, 3).map(s => s?.obj)).toEqual([995, 1618, 1619]);
  });

  it('sorts by id', () => {
    const after = localSort(bank, [3], 1, 3, 'id', info);
    expect(after.slice(0, 3).map(s => s?.obj)).toEqual([995, 1618, 1619]);
  });

  it('compacts holes inside the sorted range and leaves other tabs alone', () => {
    const holed = items([1619, null, 1618, 995]);
    const after = localSort(holed, [3], 1, 4, 'id', info);
    expect(after.slice(0, 4).map(s => s?.obj ?? null)).toEqual([1618, 1619, null, 995]);
  });

  it('treats an obj this pack has never heard of as value 0 and name empty', () => {
    const unknown = items([4151, 1618]);
    expect(localSort(unknown, [2], 1, 2, 'value', info).slice(0, 2).map(s => s?.obj)).toEqual([1618, 4151]);
    expect(localSort(unknown, [2], 1, 2, 'name', info).slice(0, 2).map(s => s?.obj)).toEqual([4151, 1618]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run src/bank/layout.test.ts`
Expected: FAIL - `Failed to resolve import "./layout"`.

- [ ] **Step 3: Write types.ts and layout.ts**

Write `web/src/bank/types.ts` exactly as the Interfaces block above. Then `web/src/bank/layout.ts`, the minimal implementation the tests demand:

```ts
// web/src/bank/layout.ts -- pure tab and slot arithmetic for the web bank. No DOM, no fetch.
// The web counterpart of engine-custom/src/idlescape/bankLayout.ts: the two are meant to be
// read side by side, and every ruling below is that module's ruling.
import type { BankItems, BankSnapshot, BankSortKey, ObjInfo } from './types';

export function tabRanges(tabs: number[]): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let start = 0;
  for (const size of tabs) { out.push({ start, end: start + size }); start += size; }
  return out;
}

export function tabOfSlot(tabs: number[], slot: number): number {
  const ranges = tabRanges(tabs);
  for (let i = 0; i < ranges.length; i++) if (slot >= ranges[i].start && slot < ranges[i].end) return i + 1;
  return 0;
}

export function rangeOfTab(tabs: number[], tab: number, used: number): { start: number; end: number } {
  if (tab === 0) { const start = tabs.reduce((t, s) => t + s, 0); return { start, end: Math.max(start, used) }; }
  const range = tabRanges(tabs)[tab - 1];
  return range ?? { start: used, end: used };
}

export function usedOf(items: BankItems): number {
  for (let slot = items.length - 1; slot >= 0; slot--) if (items[slot]) return slot + 1;
  return 0;
}

export function expandSlots(snapshot: BankSnapshot): BankItems {
  const out: BankItems = new Array(snapshot.capacity).fill(null);
  for (const slot of snapshot.slots) if (slot.slot >= 0 && slot.slot < out.length) out[slot.slot] = { ...slot };
  return out;
}

export function tabIconObj(items: BankItems, tabs: number[], tab: number, used: number): number | null {
  const { start, end } = rangeOfTab(tabs, tab, used);
  for (let slot = start; slot < end; slot++) { const item = items[slot]; if (item) return item.obj; }
  return null;
}

export function tabItemCount(items: BankItems, tabs: number[], tab: number, used: number): number {
  const { start, end } = rangeOfTab(tabs, tab, used);
  let count = 0;
  for (let slot = start; slot < end; slot++) if (items[slot]) count++;
  return count;
}

/** Rewrites every `slot` field so a moved item's own record matches where it now sits. */
function renumber(items: BankItems): BankItems {
  return items.map((item, slot) => (item ? { ...item, slot } : null));
}

export function localSwap(items: BankItems, a: number, b: number): BankItems {
  const next = [...items];
  const tmp = next[a];
  next[a] = next[b];
  next[b] = tmp;
  return renumber(next);
}

export function localInsert(items: BankItems, from: number, to: number): BankItems {
  const next = [...items];
  const moving = next[from];
  if (from < to) for (let slot = from; slot < to; slot++) next[slot] = next[slot + 1];
  else for (let slot = from; slot > to; slot--) next[slot] = next[slot - 1];
  next[to] = moving;
  return renumber(next);
}

export function insertCrossesTab(tabs: number[], from: number, to: number): boolean {
  return tabOfSlot(tabs, from) !== tabOfSlot(tabs, to);
}

export function alchValue(cost: number): number {
  return Math.max(Math.floor((cost * 6) / 10), 1);
}

export function formatCount(count: number): { text: string; tone: 'yellow' | 'white' | 'green' } | null {
  if (count < 2) return null;
  if (count >= 10_000_000) return { text: `${Math.floor(count / 1_000_000)}M`, tone: 'green' };
  if (count >= 100_000) return { text: `${Math.floor(count / 1_000)}K`, tone: 'white' };
  return { text: String(count), tone: 'yellow' };
}

export function localSort(items: BankItems, tabs: number[], tab: number, used: number, by: BankSortKey, info: (obj: number) => ObjInfo | null): BankItems {
  const { start, end } = rangeOfTab(tabs, tab, used);
  const held = items.slice(start, end).filter((item): item is NonNullable<BankItems[number]> => item !== null);
  held.sort((a, b) => {
    if (by === 'id') return a.obj - b.obj;
    // 'en', not the host locale: the engine pins its collation the same way.
    if (by === 'name') return (info(a.obj)?.name ?? '').localeCompare(info(b.obj)?.name ?? '', 'en');
    return alchValue(info(b.obj)?.cost ?? 0) - alchValue(info(a.obj)?.cost ?? 0);
  });
  const next = [...items];
  for (let slot = start; slot < end; slot++) next[slot] = held[slot - start] ?? null;
  return renumber(next);
}
```

Note the one deliberate difference from the engine: `alchValue(info(obj)?.cost ?? 0)` is 1 for an unknown obj, while the engine scores an unknown obj 0. The test above pins the resulting order, which is the same either way for a descending sort with every known cost at or above 1.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run src/bank/layout.test.ts && npm run typecheck && npm run lint`
Expected: PASS, no type or lint errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/bank/types.ts web/src/bank/layout.ts web/src/bank/layout.test.ts
git commit -F - <<'MSG'
feat(bank): pure tab and slot arithmetic for the web bank

layout.ts is the web counterpart of engine-custom's bankLayout.ts: tab ranges,
local swap and insert, OSRS count colours, first-item tab icons (owner decision
4) and the engine's own sort order, so the optimistic view matches what the
apply will produce.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
MSG
```

---

### Task 3: The bank HTTP client

**Files:**
- Create: `web/src/bank/api.ts`
- Test: `web/src/bank/api.test.ts`

**Interfaces:**
- Consumes: `BankOp`, `BankSnapshot`, `MAX_OPS_PER_BATCH` from `./types`.
- Produces:
  ```ts
  export type OpsResult =
    | { ok: true; version: number }
    /** 409: the server hands back the version it actually holds. Refetch at it and re-issue. */
    | { ok: false; kind: 'conflict'; version: number }
    /** Anything else, already turned into player-facing copy. */
    | { ok: false; kind: 'error'; message: string };

  export interface BankApi {
    get(): Promise<BankSnapshot>;
    ops(expectedVersion: number, ops: BankOp[]): Promise<OpsResult>;
  }

  export function createBankApi(deps: { idToken(): Promise<string>; fetchImpl?: typeof fetch }): BankApi;
  /** Server and engine error codes rendered as copy. Anything unknown becomes the generic line. */
  export function friendlyBankError(code: string): string;
  ```

- [ ] **Step 1: Write the failing api test**

```ts
// web/src/bank/api.test.ts
import { describe, expect, it } from 'vitest';
import { createBankApi, friendlyBankError } from './api';
import type { BankSnapshot } from './types';

const SNAPSHOT: BankSnapshot = { ownerKey: 'u1', version: 4, capacity: 240, tabs: [2], slots: [{ slot: 0, obj: 995, count: 500 }] };

interface Call { url: string; init: RequestInit }

function fakeFetch(replies: { status: number; body?: unknown }[]): { impl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  const impl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    const reply = replies[Math.min(i++, replies.length - 1)];
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status, headers: { 'content-type': 'application/json' }
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const api = (impl: typeof fetch) => createBankApi({ idToken: async () => 'TOKEN', fetchImpl: impl });

describe('GET /api/bank', () => {
  it('sends the bearer and returns the snapshot', async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: SNAPSHOT }]);
    await expect(api(impl).get()).resolves.toEqual(SNAPSHOT);
    expect(calls[0].url).toBe('/api/bank');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer TOKEN');
  });

  it('rejects with player-facing copy on a refusal', async () => {
    const { impl } = fakeFetch([{ status: 503, body: { error: 'unavailable' } }]);
    await expect(api(impl).get()).rejects.toThrow('The bank is not reachable right now. Try again in a moment.');
  });
});

describe('POST /api/bank/ops', () => {
  it('posts expectedVersion and ops, and returns the new version', async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: { version: 5 } }]);
    await expect(api(impl).ops(4, [{ op: 'swap', a: 0, b: 1 }])).resolves.toEqual({ ok: true, version: 5 });
    expect(calls[0].url).toBe('/api/bank/ops');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ expectedVersion: 4, ops: [{ op: 'swap', a: 0, b: 1 }] });
  });

  it('reports a 409 as a conflict carrying the version the server holds', async () => {
    const { impl } = fakeFetch([{ status: 409, body: { error: 'version', version: 9 } }]);
    await expect(api(impl).ops(4, [{ op: 'swap', a: 0, b: 1 }])).resolves.toEqual({ ok: false, kind: 'conflict', version: 9 });
  });

  it('turns a 422 engine rejection into copy', async () => {
    const { impl } = fakeFetch([{ status: 422, body: { error: 'tab_invariant' } }]);
    await expect(api(impl).ops(4, [{ op: 'insert', from: 0, to: 9 }])).resolves.toEqual({
      ok: false, kind: 'error', message: 'That move would break the bank tabs.'
    });
  });

  it('turns a 403 layout_only into copy without pretending it succeeded', async () => {
    const { impl } = fakeFetch([{ status: 403, body: { error: 'layout_only' } }]);
    const result = await api(impl).ops(4, [{ op: 'swap', a: 0, b: 1 }]);
    expect(result).toEqual({ ok: false, kind: 'error', message: 'The web bank can only re-order items, never move them.' });
  });

  it('refuses a batch longer than the server accepts before it leaves the browser', async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: { version: 5 } }]);
    const many = Array.from({ length: 201 }, (_, i) => ({ op: 'swap', a: i, b: i + 1 }) as const);
    await expect(api(impl).ops(4, many)).resolves.toEqual({
      ok: false, kind: 'error', message: 'Too many changes at once. Try again.'
    });
    expect(calls).toHaveLength(0);
  });

  it('reports a dropped connection as copy, not as a rejection', async () => {
    const impl = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    await expect(api(impl).ops(4, [{ op: 'swap', a: 0, b: 1 }])).resolves.toEqual({
      ok: false, kind: 'error', message: 'The bank is not reachable right now. Try again in a moment.'
    });
  });
});

describe('friendlyBankError', () => {
  it('maps every code the server and the engine can send', () => {
    for (const code of ['human_only', 'layout_only', 'bad_ops', 'bad_version', 'bad_body', 'unavailable', 'bad_slot', 'bad_tab', 'tab_invariant', 'bad_op', 'full', 'insufficient']) {
      expect(friendlyBankError(code)).not.toBe('');
    }
  });

  it('never leaks a raw code the client has not seen before', () => {
    expect(friendlyBankError('some_future_code')).toBe('Something went wrong. Try again.');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run src/bank/api.test.ts`
Expected: FAIL - `Failed to resolve import "./api"`.

- [ ] **Step 3: Write api.ts**

```ts
// web/src/bank/api.ts -- the two routes the browser is allowed to call.
// Reordering is the ONLY thing the browser may change: server/src/bank/routes.ts answers 403
// layout_only to a delta op, and Contracts moves items server-side through the management
// client instead. Nothing here ever builds a delta.
import { MAX_OPS_PER_BATCH, type BankOp, type BankSnapshot } from './types';

export type OpsResult =
  | { ok: true; version: number }
  | { ok: false; kind: 'conflict'; version: number }
  | { ok: false; kind: 'error'; message: string };

export interface BankApi {
  get(): Promise<BankSnapshot>;
  ops(expectedVersion: number, ops: BankOp[]): Promise<OpsResult>;
}

const UNREACHABLE = 'The bank is not reachable right now. Try again in a moment.';
const GENERIC = 'Something went wrong. Try again.';

const FRIENDLY: Record<string, string> = {
  human_only: 'Sign in again to open your bank.',
  layout_only: 'The web bank can only re-order items, never move them.',
  bad_ops: 'That change was not understood. Try again.',
  bad_version: 'That change was not understood. Try again.',
  bad_body: 'That change was not understood. Try again.',
  unavailable: UNREACHABLE,
  bad_slot: 'That slot is not part of your bank.',
  bad_tab: 'That tab does not exist.',
  tab_invariant: 'That move would break the bank tabs.',
  bad_op: 'That change was not understood. Try again.',
  full: 'Your bank is full.',
  insufficient: 'You do not have that many.'
};

export function friendlyBankError(code: string): string {
  return FRIENDLY[code] ?? GENERIC;
}

async function errorCode(res: Response): Promise<string> {
  try { return String(((await res.json()) as { error?: unknown }).error ?? ''); } catch { return ''; }
}

export function createBankApi(deps: { idToken(): Promise<string>; fetchImpl?: typeof fetch }): BankApi {
  const call = deps.fetchImpl ?? fetch;
  const auth = async (): Promise<Record<string, string>> => ({ authorization: `Bearer ${await deps.idToken()}`, 'content-type': 'application/json' });

  return {
    async get() {
      const res = await call('/api/bank', { headers: await auth(), credentials: 'same-origin' });
      if (!res.ok) throw new Error(friendlyBankError(await errorCode(res)));
      return (await res.json()) as BankSnapshot;
    },

    async ops(expectedVersion, ops) {
      // The server caps a batch at 200 and answers 400 bad_ops past it; catching it here keeps
      // the store's queue honest instead of losing a whole flush to a round trip.
      if (ops.length > MAX_OPS_PER_BATCH) return { ok: false, kind: 'error', message: 'Too many changes at once. Try again.' };
      let res: Response;
      try {
        res = await call('/api/bank/ops', {
          method: 'POST', headers: await auth(), credentials: 'same-origin',
          body: JSON.stringify({ expectedVersion, ops })
        });
      } catch {
        return { ok: false, kind: 'error', message: UNREACHABLE };
      }
      if (res.ok) return { ok: true, version: ((await res.json()) as { version: number }).version };
      if (res.status === 409) {
        const body = (await res.json()) as { version?: number };
        // A 409 without a version is unusable as a retry target; treat it as a plain error so
        // the store refetches rather than re-issuing against a made-up number.
        if (typeof body.version !== 'number') return { ok: false, kind: 'error', message: GENERIC };
        return { ok: false, kind: 'conflict', version: body.version };
      }
      return { ok: false, kind: 'error', message: friendlyBankError(await errorCode(res)) };
    }
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run src/bank/api.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/bank/api.ts web/src/bank/api.test.ts
git commit -F - <<'MSG'
feat(bank): typed client for /api/bank and /api/bank/ops

A 409 is surfaced as a conflict carrying the version the server holds, which is
what the store refetches at; every other refusal becomes player-facing copy so
no raw server code reaches a player.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
MSG
```

---

### Task 4: `GET /api/bank/events` - the front server fans the change hook out as SSE

The engine already posts `/internal/bank-changed` after every version change from either path, and `createBankRoutes` already records it in a `versions` map. This task turns that map into a stream. It is **best effort by construction**: the hook is fire and forget with a 2 s timeout, no retry, no ordering guarantee, and it is silent altogether when `IDLESCAPE_HOOK_URL` or the management secret is missing (which is the case in `deploy/`). Task 6's store therefore polls behind this and treats the stream purely as an accelerator.

**Files:**
- Modify: `server/src/router.ts`, `server/src/router.test.ts`, `server/src/bank/routes.ts`, `server/src/bank/routes.test.ts`

**Interfaces:**
- Consumes: `ManagementClient`, `Principal`, the existing `versions` map.
- Produces:
  - `server/src/router.ts`: `{ kind: 'bank'; sub: 'get' | 'ops' | 'events' }`, with `/api/bank/events` classified before the two existing bank paths (order is irrelevant, the strings are distinct, but keep them adjacent). `principalRule` is unchanged: the whole `bank` family stays `'human'`.
  - `server/src/bank/routes.ts`:
    ```ts
    export interface BankRoutes {
      handle(req: Request, route: BankRoute, principal: Principal): Promise<Response>;
      handleHook(req: Request, ip: string): Promise<Response>;
      versionOf(ownerKey: string): number | null;
      /** Open SSE subscribers for an owner. Diagnostics and tests only. */
      streamCount(ownerKey: string): number;
    }
    export function createBankRoutes(deps: { client: ManagementClient; secret: string; heartbeatMs?: number }): BankRoutes;
    export const MAX_STREAMS_PER_OWNER = 4;
    ```
  - Wire format, one frame per version change:
    ```
    event: version
    data: {"version":7}

    ```
    plus `retry: 3000` once at open and `: ping` comments every `heartbeatMs` (default 15 000).

- [ ] **Step 1: Write the failing router test**

Append to `server/src/router.test.ts`:

```ts
test('the bank event stream is its own route and stays human-only', () => {
  expect(classify('/api/bank/events', false)).toEqual({ kind: 'bank', sub: 'events' });
  expect(principalRule({ kind: 'bank', sub: 'events' })).toBe('human');
});
```

- [ ] **Step 2: Write the failing SSE tests**

Append to `server/src/bank/routes.test.ts`:

```ts
const EVENTS = { kind: 'bank' as const, sub: 'events' as const };

/** Reads one decoded chunk, or '' if the stream produced nothing before it closed. */
async function chunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const { value, done } = await reader.read();
  return done || !value ? '' : new TextDecoder().decode(value);
}

/** Reads chunks until `needle` appears, so a heartbeat or the open frame cannot fail a test. */
async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, needle: string): Promise<string> {
  let seen = '';
  for (let i = 0; i < 10 && !seen.includes(needle); i++) seen += await chunk(reader);
  return seen;
}

function hookRequest(body: unknown, secret = 's'): Request {
  return new Request('http://x/internal/bank-changed', { method: 'POST', headers: { 'x-idlescape-mgmt': secret }, body: JSON.stringify(body) });
}

describe('bank event stream', () => {
  test('opens an SSE response and replays nothing until a change arrives', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's', heartbeatMs: 60_000 });
    const res = await routes.handle(new Request('http://x/api/bank/events'), EVENTS, human);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    const reader = res.body!.getReader();
    expect(await chunk(reader)).toContain('retry: 3000');
    await reader.cancel();
  });

  test('the hook is fanned out to that owner as a version event', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's', heartbeatMs: 60_000 });
    const res = await routes.handle(new Request('http://x/api/bank/events'), EVENTS, human);
    const reader = res.body!.getReader();
    await chunk(reader);
    expect((await routes.handleHook(hookRequest({ ownerKey: 'uidA', version: 7 }), '127.0.0.1')).status).toBe(204);
    const frame = await readUntil(reader, 'data:');
    expect(frame).toContain('event: version');
    expect(frame).toContain('data: {"version":7}');
    await reader.cancel();
  });

  test('a hook for a different owner is never delivered', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's', heartbeatMs: 60_000 });
    const res = await routes.handle(new Request('http://x/api/bank/events'), EVENTS, human);
    const reader = res.body!.getReader();
    await chunk(reader);
    await routes.handleHook(hookRequest({ ownerKey: 'someoneElse', version: 7 }), '127.0.0.1');
    await routes.handleHook(hookRequest({ ownerKey: 'uidA', version: 8 }), '127.0.0.1');
    expect(await readUntil(reader, 'data:')).toContain('data: {"version":8}');
    await reader.cancel();
  });

  test('a repeated version is not re-sent: the hook has no ordering guarantee', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's', heartbeatMs: 60_000 });
    const res = await routes.handle(new Request('http://x/api/bank/events'), EVENTS, human);
    const reader = res.body!.getReader();
    await chunk(reader);
    await routes.handleHook(hookRequest({ ownerKey: 'uidA', version: 8 }), '127.0.0.1');
    expect(await readUntil(reader, 'data:')).toContain('data: {"version":8}');
    await routes.handleHook(hookRequest({ ownerKey: 'uidA', version: 8 }), '127.0.0.1');
    await routes.handleHook(hookRequest({ ownerKey: 'uidA', version: 9 }), '127.0.0.1');
    // The duplicate 8 was dropped, so the very next frame is 9, not another 8.
    expect(await readUntil(reader, 'data:')).toContain('data: {"version":9}');
    await reader.cancel();
  });

  test('a successful apply is fanned out too, so a deployed world with no hook still updates', async () => {
    const routes = createBankRoutes({ client: stubClient({ applyBank: async () => ({ ok: true, version: 12 }) }), secret: 's', heartbeatMs: 60_000 });
    const res = await routes.handle(new Request('http://x/api/bank/events'), EVENTS, human);
    const reader = res.body!.getReader();
    await chunk(reader);
    await routes.handle(
      new Request('http://x/api/bank/ops', { method: 'POST', body: JSON.stringify({ expectedVersion: 11, ops: [{ op: 'swap', a: 0, b: 1 }] }) }),
      { kind: 'bank', sub: 'ops' }, human);
    expect(await readUntil(reader, 'data:')).toContain('data: {"version":12}');
    await reader.cancel();
  });

  test('cancelling the stream releases the subscriber', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's', heartbeatMs: 60_000 });
    const res = await routes.handle(new Request('http://x/api/bank/events'), EVENTS, human);
    const reader = res.body!.getReader();
    await chunk(reader);
    expect(routes.streamCount('uidA')).toBe(1);
    await reader.cancel();
    expect(routes.streamCount('uidA')).toBe(0);
  });

  test('a fifth stream for one owner is refused rather than leaked', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's', heartbeatMs: 60_000 });
    const readers = [];
    for (let i = 0; i < MAX_STREAMS_PER_OWNER; i++) {
      const res = await routes.handle(new Request('http://x/api/bank/events'), EVENTS, human);
      expect(res.status).toBe(200);
      const reader = res.body!.getReader();
      await chunk(reader);
      readers.push(reader);
    }
    const refused = await routes.handle(new Request('http://x/api/bank/events'), EVENTS, human);
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ error: 'too_many_streams' });
    for (const reader of readers) await reader.cancel();
  });

  test('an agent bearer is refused on the stream as well', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's' });
    const res = await routes.handle(new Request('http://x/api/bank/events'), EVENTS, agent);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'human_only' });
  });

  test('a non-GET on the stream is 405', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's' });
    const res = await routes.handle(new Request('http://x/api/bank/events', { method: 'POST' }), EVENTS, human);
    expect(res.status).toBe(405);
  });
});
```

Add `MAX_STREAMS_PER_OWNER` to the file's import from `./routes`.

- [ ] **Step 3: Run both tests to verify they fail**

Run: `cd server && ~/.bun/bin/bun test src/router.test.ts src/bank/routes.test.ts`
Expected: FAIL - `'events'` is not assignable to the route's `sub`, and `MAX_STREAMS_PER_OWNER` / `streamCount` do not exist.

- [ ] **Step 4: Add the route to the router**

`server/src/router.ts`: change the bank route type to `| { kind: 'bank'; sub: 'get' | 'ops' | 'events' }` and add, beside the two existing bank lines:

```ts
  // SSE. The engine's change hook is fire and forget with no delivery guarantee, so this is an
  // accelerator over the browser's own polling, never the only path a change takes.
  if (pathname === '/api/bank/events') return { kind: 'bank', sub: 'events' };
```

- [ ] **Step 5: Implement the fan-out in bank/routes.ts**

Add above `createBankRoutes`:

```ts
export const MAX_STREAMS_PER_OWNER = 4;
const DEFAULT_HEARTBEAT_MS = 15_000;
const ENCODER = new TextEncoder();
```

Inside `createBankRoutes`, beside the existing `versions` map:

```ts
  // One entry per open SSE response. Keyed by owner so a hook fans out to exactly the account
  // it names and to nobody else.
  const streams = new Map<string, Set<(frame: string) => void>>();

  /**
   * Records the version the engine now holds and, when it actually moved, tells every open
   * stream for that owner. Every path that learns a version goes through here: the GET, a
   * successful apply, a 409 (which carries the CURRENT version), and the change hook. The
   * "actually moved" check matters because the hook has no ordering guarantee: a late duplicate
   * or an out-of-order repeat must not push a browser backwards.
   */
  function record(ownerKey: string, version: number): void {
    if (versions.get(ownerKey) === version) return;
    versions.set(ownerKey, version);
    for (const send of streams.get(ownerKey) ?? []) send(`event: version\ndata: ${JSON.stringify({ version })}\n\n`);
  }
```

Replace the four existing `versions.set(...)` call sites with `record(...)` (the GET's `if (versions.get(...) !== ...)` guard becomes redundant and is deleted), then add the `events` branch at the top of `handle`, after the `human_only` check:

```ts
      if (route.sub === 'events') {
        if (req.method !== 'GET') return new Response(null, { status: 405 });
        const open = streams.get(ownerKey) ?? new Set<(frame: string) => void>();
        // A browser opens one stream per bank window. A cap keeps a reload loop or a wedged
        // tab from accumulating subscribers for the life of the process.
        if (open.size >= MAX_STREAMS_PER_OWNER) return Response.json({ error: 'too_many_streams' }, { status: 429 });
        streams.set(ownerKey, open);

        let send: (frame: string) => void = () => {};
        let heartbeat: ReturnType<typeof setInterval> | null = null;
        const release = (): void => {
          if (heartbeat) clearInterval(heartbeat);
          heartbeat = null;
          open.delete(send);
          if (open.size === 0) streams.delete(ownerKey);
        };

        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            send = frame => {
              // A closed or errored controller throws on enqueue; that is the browser having
              // gone away between the hook and this write, so drop the subscriber quietly.
              try { controller.enqueue(ENCODER.encode(frame)); } catch { release(); }
            };
            open.add(send);
            // `retry` tells the browser's own reconnect policy; the comment keeps proxies from
            // buffering the first bytes. No version is replayed: the store subscribes BEFORE it
            // does its first GET, so it cannot miss a change in between.
            send(': open\nretry: 3000\n\n');
            heartbeat = setInterval(() => send(': ping\n\n'), deps.heartbeatMs ?? DEFAULT_HEARTBEAT_MS);
          },
          cancel: release
        });

        // The abort fires when the socket drops without the reader cancelling.
        req.signal.addEventListener('abort', release);

        return new Response(body, {
          headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
            // nginx and friends buffer text/event-stream by default, which turns a live stream
            // into one long-poll that only flushes at the end.
            'x-accel-buffering': 'no'
          }
        });
      }
```

and add to the returned object:

```ts
    streamCount(ownerKey) {
      return streams.get(ownerKey)?.size ?? 0;
    }
```

Add `heartbeatMs?: number` to the `createBankRoutes` deps type and `streamCount(ownerKey: string): number` to `BankRoutes`. If `routes.ts` crosses 400 lines, move `isTrustedHookSource`, `sameSecret` and `layoutOp` into a new `server/src/bank/validate.ts` and re-export `isTrustedHookSource` from `routes.ts` so the existing tests keep importing it from there.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd server && ~/.bun/bin/bun run typecheck && ~/.bun/bin/bun test`
Expected: PASS, including the pre-existing `hookContract.test.ts` and `routes.test.ts` cases.

- [ ] **Step 7: Commit**

```bash
git add server/src/router.ts server/src/router.test.ts server/src/bank/routes.ts server/src/bank/routes.test.ts
git commit -F - <<'MSG'
feat(bank): stream owner bank version changes over GET /api/bank/events

Every path that learns a version - the GET, a successful apply, a 409 and the
engine change hook - now goes through one record() that fans out to the open SSE
subscribers for that owner, and only when the number actually moved, because the
hook guarantees neither delivery nor ordering. Streams are capped per owner and
released on cancel and on abort.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
MSG
```

---

### Task 5: The browser's live-update client

`EventSource` cannot send an `Authorization` header, and `/api/bank/events` is human-only behind a Firebase bearer, so the stream is read with `fetch` plus a `ReadableStream` reader and the SSE frames are parsed by hand. The module never decides what to do with a version; it reports one, and reports its own health so the store can fall back to polling.

**Files:**
- Create: `web/src/bank/stream.ts`
- Test: `web/src/bank/stream.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface BankStream {
    start(): void;
    stop(): void;
    /** True while a connection is open and delivering. The store polls harder when false. */
    healthy(): boolean;
  }
  export interface BankStreamDeps {
    idToken(): Promise<string>;
    onVersion(version: number): void;
    onHealth(healthy: boolean): void;
    fetchImpl?: typeof fetch;
    /** Timer seams so the tests never wait on a real clock. */
    schedule?: (fn: () => void, ms: number) => number;
    cancel?: (handle: number) => void;
  }
  export function createBankStream(deps: BankStreamDeps): BankStream;
  export const STREAM_PATH = '/api/bank/events';
  /** The server pings every 15 s; silence past this is a dead connection. */
  export const WATCHDOG_MS = 40_000;
  export const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000];
  ```

- [ ] **Step 1: Write the failing stream test**

```ts
// web/src/bank/stream.test.ts
import { describe, expect, it } from 'vitest';
import { BACKOFF_MS, STREAM_PATH, WATCHDOG_MS, createBankStream } from './stream';

/** A timer queue the test drives by hand. */
function timers() {
  const pending = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  return {
    schedule: (fn: () => void, ms: number) => { const id = next++; pending.set(id, { fn, ms }); return id; },
    cancel: (id: number) => { pending.delete(id); },
    /** Fires every timer whose delay equals `ms`, newest last. */
    fire(ms: number): void {
      for (const [id, entry] of [...pending]) if (entry.ms === ms) { pending.delete(id); entry.fn(); }
    },
    delays: () => [...pending.values()].map(t => t.ms)
  };
}

/** One controllable SSE body per connection, plus the requests that asked for one. */
function sse() {
  const pushes: ((text: string) => void)[] = [];
  const closes: (() => void)[] = [];
  const requests: { url: string; init: RequestInit }[] = [];
  let failNext: number | null = null;
  const impl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    requests.push({ url: String(input), init });
    if (failNext !== null) { const status = failNext; failNext = null; return new Response('no', { status }); }
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        pushes.push(text => controller.enqueue(new TextEncoder().encode(text)));
        closes.push(() => controller.close());
      }
    });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }) as unknown as typeof fetch;
  return { impl, requests, push: (text: string) => pushes[pushes.length - 1](text), close: () => closes[closes.length - 1](), failNextWith: (status: number) => { failNext = status; } };
}

/** Lets every pending microtask and the reader loop run. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function harness(over: Partial<Parameters<typeof createBankStream>[0]> = {}) {
  const clock = timers();
  const wire = sse();
  const versions: number[] = [];
  const health: boolean[] = [];
  const stream = createBankStream({
    idToken: async () => 'TOKEN',
    onVersion: v => versions.push(v),
    onHealth: h => health.push(h),
    fetchImpl: wire.impl,
    schedule: clock.schedule,
    cancel: clock.cancel,
    ...over
  });
  return { stream, clock, wire, versions, health };
}

describe('createBankStream', () => {
  it('connects with the bearer and asks for an event stream', async () => {
    const { stream, wire } = harness();
    stream.start();
    await settle();
    expect(wire.requests[0].url).toBe(STREAM_PATH);
    const headers = wire.requests[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer TOKEN');
    expect(headers.accept).toBe('text/event-stream');
    stream.stop();
  });

  it('reports a version frame', async () => {
    const { stream, wire, versions, health } = harness();
    stream.start();
    await settle();
    wire.push(': open\nretry: 3000\n\n');
    wire.push('event: version\ndata: {"version":7}\n\n');
    await settle();
    expect(versions).toEqual([7]);
    expect(health[health.length - 1]).toBe(true);
    expect(stream.healthy()).toBe(true);
    stream.stop();
  });

  it('reassembles a frame split across two reads', async () => {
    const { stream, wire, versions } = harness();
    stream.start();
    await settle();
    wire.push('event: version\ndata: {"ver');
    await settle();
    expect(versions).toEqual([]);
    wire.push('sion":9}\n\n');
    await settle();
    expect(versions).toEqual([9]);
    stream.stop();
  });

  it('ignores comments, pings and frames it cannot parse', async () => {
    const { stream, wire, versions } = harness();
    stream.start();
    await settle();
    wire.push(': ping\n\nevent: version\ndata: not json\n\nevent: other\ndata: {"version":3}\n\n');
    await settle();
    expect(versions).toEqual([]);
    stream.stop();
  });

  it('goes unhealthy and retries with backoff when the connection closes', async () => {
    const { stream, wire, clock, health } = harness();
    stream.start();
    await settle();
    wire.push('event: version\ndata: {"version":1}\n\n');
    await settle();
    wire.close();
    await settle();
    expect(stream.healthy()).toBe(false);
    expect(health[health.length - 1]).toBe(false);
    expect(clock.delays()).toContain(BACKOFF_MS[0]);
    clock.fire(BACKOFF_MS[0]);
    await settle();
    expect(wire.requests).toHaveLength(2);
    stream.stop();
  });

  it('walks the backoff ladder on repeated refusals and never past its last rung', async () => {
    const { stream, wire, clock } = harness();
    for (const ms of [...BACKOFF_MS, BACKOFF_MS[BACKOFF_MS.length - 1]]) {
      wire.failNextWith(503);
      if (wire.requests.length === 0) stream.start(); else clock.fire(clock.delays()[0]);
      await settle();
      expect(clock.delays()).toContain(ms);
    }
    stream.stop();
  });

  it('reconnects when the watchdog expires with no bytes at all', async () => {
    const { stream, wire, clock } = harness();
    stream.start();
    await settle();
    expect(clock.delays()).toContain(WATCHDOG_MS);
    clock.fire(WATCHDOG_MS);
    await settle();
    expect(stream.healthy()).toBe(false);
    clock.fire(BACKOFF_MS[0]);
    await settle();
    expect(wire.requests).toHaveLength(2);
    stream.stop();
  });

  it('stop cancels the pending retry and opens nothing more', async () => {
    const { stream, wire, clock } = harness();
    stream.start();
    await settle();
    wire.close();
    await settle();
    stream.stop();
    expect(clock.delays()).toEqual([]);
    await settle();
    expect(wire.requests).toHaveLength(1);
  });

  it('start is idempotent: a second call does not open a second connection', async () => {
    const { stream, wire } = harness();
    stream.start();
    stream.start();
    await settle();
    expect(wire.requests).toHaveLength(1);
    stream.stop();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run src/bank/stream.test.ts`
Expected: FAIL - `Failed to resolve import "./stream"`.

- [ ] **Step 3: Write stream.ts**

```ts
// web/src/bank/stream.ts -- live bank version updates over SSE.
//
// EventSource cannot carry an Authorization header and /api/bank/events is human-only behind a
// Firebase bearer, so the stream is read through fetch and the frames are parsed here. The
// engine's change hook, which feeds that route, guarantees neither delivery nor ordering and is
// silent altogether in a world with no IDLESCAPE_HOOK_URL: this module is an accelerator, and
// `healthy()` is how the store knows whether it may relax its own polling.

export interface BankStream { start(): void; stop(): void; healthy(): boolean }

export interface BankStreamDeps {
  idToken(): Promise<string>;
  onVersion(version: number): void;
  onHealth(healthy: boolean): void;
  fetchImpl?: typeof fetch;
  schedule?: (fn: () => void, ms: number) => number;
  cancel?: (handle: number) => void;
}

export const STREAM_PATH = '/api/bank/events';
export const WATCHDOG_MS = 40_000;
export const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000];

export function createBankStream(deps: BankStreamDeps): BankStream {
  const call = deps.fetchImpl ?? fetch;
  const schedule = deps.schedule ?? ((fn, ms) => window.setTimeout(fn, ms));
  const cancel = deps.cancel ?? (handle => window.clearTimeout(handle));

  let running = false;
  let live = false;
  let attempt = 0;
  let retry: number | null = null;
  let watchdog: number | null = null;
  let abort: AbortController | null = null;

  function setHealth(next: boolean): void {
    if (live === next) return;
    live = next;
    deps.onHealth(next);
  }

  function clearTimers(): void {
    if (retry !== null) { cancel(retry); retry = null; }
    if (watchdog !== null) { cancel(watchdog); watchdog = null; }
  }

  /** Any byte at all resets it; the server pings every 15 s, so silence past 40 s is death. */
  function armWatchdog(): void {
    if (watchdog !== null) cancel(watchdog);
    watchdog = schedule(() => { watchdog = null; abort?.abort(); }, WATCHDOG_MS);
  }

  function scheduleRetry(): void {
    setHealth(false);
    if (!running || retry !== null) return;
    const ms = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    attempt++;
    retry = schedule(() => { retry = null; void connect(); }, ms);
  }

  /** One SSE frame: the `data:` lines of a `version` event, or nothing worth reporting. */
  function handleFrame(frame: string): void {
    const lines = frame.split('\n');
    if (!lines.some(line => line === 'event: version')) return;
    const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('');
    if (!data) return;
    try {
      const parsed = JSON.parse(data) as { version?: unknown };
      if (typeof parsed.version === 'number' && Number.isInteger(parsed.version)) deps.onVersion(parsed.version);
    } catch { /* a truncated or malformed frame is dropped; the store polls anyway */ }
  }

  async function connect(): Promise<void> {
    if (!running) return;
    abort = new AbortController();
    armWatchdog();
    try {
      const res = await call(STREAM_PATH, {
        headers: { authorization: `Bearer ${await deps.idToken()}`, accept: 'text/event-stream' },
        credentials: 'same-origin',
        signal: abort.signal
      });
      if (!res.ok || !res.body) { scheduleRetry(); return; }
      // Only a body that actually arrives counts as healthy, and the ladder resets there too:
      // a route that answers 200 and then dies immediately must not reset the backoff.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        armWatchdog();
        attempt = 0;
        setHealth(true);
        buffer += decoder.decode(value, { stream: true });
        let split = buffer.indexOf('\n\n');
        while (split >= 0) {
          handleFrame(buffer.slice(0, split));
          buffer = buffer.slice(split + 2);
          split = buffer.indexOf('\n\n');
        }
      }
    } catch { /* aborted, or the socket dropped: both are a reconnect */ }
    if (watchdog !== null) { cancel(watchdog); watchdog = null; }
    scheduleRetry();
  }

  return {
    start() {
      if (running) return;
      running = true;
      attempt = 0;
      void connect();
    },
    stop() {
      running = false;
      clearTimers();
      abort?.abort();
      abort = null;
      setHealth(false);
    },
    healthy: () => live
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run src/bank/stream.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/bank/stream.ts web/src/bank/stream.test.ts
git commit -F - <<'MSG'
feat(bank): read bank version changes over SSE with backoff and a watchdog

EventSource cannot carry the Firebase bearer, so the stream is read through
fetch and the frames are parsed here. Silence past 40 s (the server pings every
15) aborts and reconnects; healthy() tells the store whether it may relax its
own polling, which is the real delivery guarantee.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
MSG
```

---

### Task 6: The bank store - optimistic ops, the coalescing flush, and the version loop

This is where the two engine rulings that matter are honoured:

1. **The post-apply version is immediately reusable.** After `{ ok: true, version }` the store keeps that number as its next `expectedVersion` and does **not** refetch. The tick that follows consumes the apply's dirt without bumping.
2. **Any apply puts the owner in push-out mode for one tick**, during which the store's tab layout is written out to every online character instead of read in. A client that applies on most ticks holds an account there permanently, so ops are coalesced into at most one apply per `FLUSH_MS` (1200 ms, two world ticks). A player dragging quickly produces one batch, not one apply per drag.

**Files:**
- Create: `web/src/bank/store.ts`
- Test: `web/src/bank/store.test.ts`

**Interfaces:**
- Consumes: `BankApi`, `OpsResult` (Task 3); `BankStream` (Task 5); `expandSlots`, `insertCrossesTab`, `localInsert`, `localSort`, `localSwap`, `usedOf` (Task 2); `BankItems`, `BankOp`, `FLUSH_MS`, `MAX_OPS_PER_BATCH`, `ObjInfo`, `POLL_MS` (Task 2).
- Produces:
  ```ts
  export interface BankState {
    version: number;
    capacity: number;
    tabs: number[];
    items: BankItems;
    /** Highest occupied slot + 1. What the capacity counter and the tab invariant use. */
    used: number;
    loading: boolean;
    /** The event stream is connected and delivering. Polling continues regardless. */
    live: boolean;
    /** Ops applied locally but not yet accepted by the engine. */
    pending: number;
    error: string | null;
  }

  export interface BankStoreDeps {
    api: BankApi;
    /** Built by the caller so the store can be tested without a network. */
    createStream(handlers: { onVersion(version: number): void; onHealth(healthy: boolean): void }): BankStream;
    info(obj: number): ObjInfo | null;
    notify(message: string, kind?: 'info' | 'error'): void;
    schedule?: (fn: () => void, ms: number) => number;
    cancel?: (handle: number) => void;
    flushMs?: number;
    pollMs?: number;
  }

  export interface BankStore {
    state(): BankState;
    subscribe(fn: (state: BankState) => void): () => void;
    /** Subscribes to the stream FIRST, then does the first GET. */
    start(): void;
    stop(): void;
    refresh(): Promise<void>;
    /** Applies the op locally where it can be previewed and queues it for the next flush. */
    submit(op: BankOp): void;
    flush(): Promise<void>;
  }

  export function createBankStore(deps: BankStoreDeps): BankStore;
  ```

- [ ] **Step 1: Write the failing store test**

```ts
// web/src/bank/store.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createBankStore } from './store';
import type { OpsResult } from './api';
import type { BankOp, BankSnapshot, ObjInfo } from './types';
import { FLUSH_MS, POLL_MS } from './types';

const INFO: Record<number, ObjInfo> = {
  995: { name: 'Coins', examine: 'Lovely money!', cost: 1, stackable: true, noted: false },
  1038: { name: 'Red partyhat', examine: 'A nice hat.', cost: 1, stackable: false, noted: false },
  1618: { name: 'Uncut diamond', examine: 'Valuable.', cost: 200, stackable: false, noted: false }
};

function snapshot(over: Partial<BankSnapshot> = {}): BankSnapshot {
  return {
    ownerKey: 'u1', version: 4, capacity: 240, tabs: [],
    slots: [{ slot: 0, obj: 995, count: 500 }, { slot: 1, obj: 1038, count: 1 }, { slot: 2, obj: 1618, count: 3 }],
    ...over
  };
}

function timers() {
  const pending = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  return {
    schedule: (fn: () => void, ms: number) => { const id = next++; pending.set(id, { fn, ms }); return id; },
    cancel: (id: number) => { pending.delete(id); },
    fire(ms: number): void { for (const [id, e] of [...pending]) if (e.ms === ms) { pending.delete(id); e.fn(); } },
    delays: () => [...pending.values()].map(t => t.ms)
  };
}

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function harness(over: { snapshots?: BankSnapshot[]; results?: OpsResult[] } = {}) {
  const clock = timers();
  const snapshots = over.snapshots ?? [snapshot()];
  const results = over.results ?? [];
  const sent: { expectedVersion: number; ops: BankOp[] }[] = [];
  let getCount = 0;
  let opsCount = 0;
  const notices: { message: string; kind?: string }[] = [];
  const handlers: { onVersion(v: number): void; onHealth(h: boolean): void }[] = [];
  const streamCalls = { start: 0, stop: 0 };

  const store = createBankStore({
    api: {
      get: async () => snapshots[Math.min(getCount++, snapshots.length - 1)],
      ops: async (expectedVersion, ops) => {
        sent.push({ expectedVersion, ops });
        return results[Math.min(opsCount++, results.length - 1)] ?? { ok: true, version: expectedVersion + 1 };
      }
    },
    createStream: h => { handlers.push(h); return { start: () => { streamCalls.start++; }, stop: () => { streamCalls.stop++; }, healthy: () => true }; },
    info: obj => INFO[obj] ?? null,
    notify: (message, kind) => notices.push({ message, kind }),
    schedule: clock.schedule,
    cancel: clock.cancel
  });

  return { store, clock, sent, notices, streamCalls, stream: () => handlers[0], getCount: () => getCount };
}

describe('loading', () => {
  it('subscribes to the stream before the first GET, so no change falls in the gap', async () => {
    const { store, streamCalls, getCount } = harness();
    store.start();
    expect(streamCalls.start).toBe(1);
    expect(getCount()).toBeLessThanOrEqual(1);
    await settle();
    expect(store.state().version).toBe(4);
  });

  it('turns the sparse wire shape into a dense view with a used count', async () => {
    const { store } = harness();
    store.start();
    await settle();
    const state = store.state();
    expect(state.items.length).toBe(240);
    expect(state.items[0]).toEqual({ slot: 0, obj: 995, count: 500 });
    expect(state.used).toBe(3);
    expect(state.loading).toBe(false);
    store.stop();
  });

  it('notifies subscribers on every change', async () => {
    const { store } = harness();
    const seen = vi.fn();
    store.subscribe(seen);
    store.start();
    await settle();
    expect(seen).toHaveBeenCalled();
    store.stop();
  });

  it('reports a failed load as an error instead of an empty bank', async () => {
    const clock = timers();
    const store = createBankStore({
      api: { get: async () => { throw new Error('The bank is not reachable right now. Try again in a moment.'); }, ops: async () => ({ ok: true, version: 1 }) },
      createStream: () => ({ start: () => {}, stop: () => {}, healthy: () => false }),
      info: () => null,
      notify: () => {},
      schedule: clock.schedule, cancel: clock.cancel
    });
    store.start();
    await settle();
    expect(store.state().error).toBe('The bank is not reachable right now. Try again in a moment.');
    expect(store.state().items.every(item => item === null)).toBe(true);
    store.stop();
  });
});

describe('optimistic ops and the coalescing flush', () => {
  it('shows a swap immediately and sends nothing until the flush window closes', async () => {
    const { store, clock, sent } = harness();
    store.start();
    await settle();
    store.submit({ op: 'swap', a: 0, b: 2 });
    expect(store.state().items[0]?.obj).toBe(1618);
    expect(store.state().pending).toBe(1);
    expect(sent).toHaveLength(0);
    clock.fire(FLUSH_MS);
    await settle();
    expect(sent).toEqual([{ expectedVersion: 4, ops: [{ op: 'swap', a: 0, b: 2 }] }]);
    store.stop();
  });

  it('coalesces a burst of drags into ONE apply, because any apply holds the owner in push-out mode', async () => {
    const { store, clock, sent } = harness();
    store.start();
    await settle();
    store.submit({ op: 'swap', a: 0, b: 1 });
    store.submit({ op: 'swap', a: 1, b: 2 });
    store.submit({ op: 'insert', from: 2, to: 0 });
    clock.fire(FLUSH_MS);
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0].ops).toHaveLength(3);
    store.stop();
  });

  it('reuses the version the apply returned as the next expectedVersion, with no refetch', async () => {
    const { store, clock, sent, getCount } = harness({ results: [{ ok: true, version: 5 }, { ok: true, version: 6 }] });
    store.start();
    await settle();
    const gets = getCount();
    store.submit({ op: 'swap', a: 0, b: 1 });
    clock.fire(FLUSH_MS);
    await settle();
    expect(store.state().version).toBe(5);
    expect(store.state().pending).toBe(0);
    store.submit({ op: 'swap', a: 0, b: 1 });
    clock.fire(FLUSH_MS);
    await settle();
    expect(sent[1].expectedVersion).toBe(5);
    // The apply's own version is authoritative: nothing was refetched to learn it.
    expect(getCount()).toBe(gets);
    store.stop();
  });

  it('on a 409 refetches at the version it was handed, drops the queue and says so once', async () => {
    const { store, clock, sent, notices } = harness({
      snapshots: [snapshot(), snapshot({ version: 11, slots: [{ slot: 0, obj: 1038, count: 1 }] })],
      results: [{ ok: false, kind: 'conflict', version: 11 }]
    });
    store.start();
    await settle();
    store.submit({ op: 'swap', a: 0, b: 1 });
    clock.fire(FLUSH_MS);
    await settle();
    expect(store.state().version).toBe(11);
    expect(store.state().items[0]?.obj).toBe(1038);
    expect(store.state().pending).toBe(0);
    expect(notices.map(n => n.message)).toEqual(['Bank changed elsewhere.']);
    // Nothing is replayed: the player sees the server state.
    expect(sent).toHaveLength(1);
    store.stop();
  });

  it('on a rejection drops the queue, says why, and re-reads rather than keeping a fiction', async () => {
    const { store, clock, notices, getCount } = harness({ results: [{ ok: false, kind: 'error', message: 'That move would break the bank tabs.' }] });
    store.start();
    await settle();
    const gets = getCount();
    store.submit({ op: 'swap', a: 0, b: 1 });
    clock.fire(FLUSH_MS);
    await settle();
    expect(notices).toEqual([{ message: 'That move would break the bank tabs.', kind: 'error' }]);
    expect(store.state().pending).toBe(0);
    expect(getCount()).toBe(gets + 1);
    store.stop();
  });

  it('refuses an insert across a tab boundary before it costs a round trip', async () => {
    const { store, clock, sent, notices } = harness({ snapshots: [snapshot({ tabs: [2] })] });
    store.start();
    await settle();
    store.submit({ op: 'insert', from: 0, to: 2 });
    clock.fire(FLUSH_MS);
    await settle();
    expect(sent).toHaveLength(0);
    expect(notices[0].message).toBe('Drag onto a tab to move an item between tabs.');
    store.stop();
  });

  it('previews a sort with the engine order and flushes it at once', async () => {
    const { store, sent } = harness();
    store.start();
    await settle();
    store.submit({ op: 'sort', tab: 0, by: 'value' });
    expect(store.state().items.slice(0, 3).map(i => i?.obj)).toEqual([1618, 995, 1038]);
    await settle();
    expect(sent).toEqual([{ expectedVersion: 4, ops: [{ op: 'sort', tab: 0, by: 'value' }] }]);
    store.stop();
  });

  it('sends a moveToTab at once with no preview, then re-reads the layout the engine chose', async () => {
    const { store, sent, getCount } = harness({ results: [{ ok: true, version: 5 }] });
    store.start();
    await settle();
    const gets = getCount();
    store.submit({ op: 'moveToTab', slot: 2, tab: 1 });
    await settle();
    expect(sent).toEqual([{ expectedVersion: 4, ops: [{ op: 'moveToTab', slot: 2, tab: 1 }] }]);
    expect(getCount()).toBe(gets + 1);
    store.stop();
  });

  it('never sends more ops than the server accepts in one batch', async () => {
    const { store, clock, sent } = harness();
    store.start();
    await settle();
    for (let i = 0; i < 250; i++) store.submit({ op: 'swap', a: 0, b: 1 });
    clock.fire(FLUSH_MS);
    await settle();
    expect(sent[0].ops.length).toBeLessThanOrEqual(200);
    store.stop();
  });
});

describe('live updates', () => {
  it('refetches when the stream reports a newer version', async () => {
    const { store, stream } = harness({ snapshots: [snapshot(), snapshot({ version: 9 })] });
    store.start();
    await settle();
    stream().onVersion(9);
    await settle();
    expect(store.state().version).toBe(9);
    store.stop();
  });

  it('ignores a version it already has or an older one', async () => {
    const { store, stream, getCount } = harness();
    store.start();
    await settle();
    const gets = getCount();
    stream().onVersion(4);
    stream().onVersion(1);
    await settle();
    expect(getCount()).toBe(gets);
    store.stop();
  });

  it('mirrors the stream health onto the state', async () => {
    const { store, stream } = harness();
    store.start();
    await settle();
    stream().onHealth(false);
    expect(store.state().live).toBe(false);
    stream().onHealth(true);
    expect(store.state().live).toBe(true);
    store.stop();
  });

  it('polls regardless of stream health, because the change hook guarantees no delivery', async () => {
    const { store, clock, getCount } = harness();
    store.start();
    await settle();
    const gets = getCount();
    expect(clock.delays()).toContain(POLL_MS);
    clock.fire(POLL_MS);
    await settle();
    expect(getCount()).toBe(gets + 1);
    expect(clock.delays()).toContain(POLL_MS);
    store.stop();
  });

  it('stop tears down the stream and every timer', async () => {
    const { store, clock, streamCalls } = harness();
    store.start();
    await settle();
    store.stop();
    expect(streamCalls.stop).toBe(1);
    expect(clock.delays()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run src/bank/store.test.ts`
Expected: FAIL - `Failed to resolve import "./store"`.

- [ ] **Step 3: Write store.ts**

```ts
// web/src/bank/store.ts -- the single source of truth the bank window renders.
//
// Two engine rulings shape this file (engine-custom/PATCHES.md, "The store"):
//
// 1. The version a successful apply returns is immediately reusable as the next
//    expectedVersion. The tick after an apply consumes its dirt without bumping, so refetching
//    to "learn the real version" would be wasted work and would race an in-game change.
// 2. ANY apply puts the owner into push-out mode for one tick: the store's tab layout is
//    written OUT to every online character instead of read in, and an in-game tab drag made in
//    that tick loses. A caller applying on most ticks holds the account there permanently, so
//    ops are coalesced into at most one apply per FLUSH_MS (two world ticks).
import type { BankApi } from './api';
import type { BankStream } from './stream';
import { expandSlots, insertCrossesTab, localInsert, localSort, localSwap, usedOf } from './layout';
import { FLUSH_MS, MAX_OPS_PER_BATCH, POLL_MS, type BankItems, type BankOp, type ObjInfo } from './types';

export interface BankState {
  version: number; capacity: number; tabs: number[]; items: BankItems; used: number;
  loading: boolean; live: boolean; pending: number; error: string | null;
}

export interface BankStoreDeps {
  api: BankApi;
  createStream(handlers: { onVersion(version: number): void; onHealth(healthy: boolean): void }): BankStream;
  info(obj: number): ObjInfo | null;
  notify(message: string, kind?: 'info' | 'error'): void;
  schedule?: (fn: () => void, ms: number) => number;
  cancel?: (handle: number) => void;
  flushMs?: number;
  pollMs?: number;
}

export interface BankStore {
  state(): BankState;
  subscribe(fn: (state: BankState) => void): () => void;
  start(): void;
  stop(): void;
  refresh(): Promise<void>;
  submit(op: BankOp): void;
  flush(): Promise<void>;
}

const CROSS_TAB = 'Drag onto a tab to move an item between tabs.';
const CHANGED_ELSEWHERE = 'Bank changed elsewhere.';

export function createBankStore(deps: BankStoreDeps): BankStore {
  const schedule = deps.schedule ?? ((fn, ms) => window.setTimeout(fn, ms));
  const cancel = deps.cancel ?? (handle => window.clearTimeout(handle));
  const flushMs = deps.flushMs ?? FLUSH_MS;
  const pollMs = deps.pollMs ?? POLL_MS;

  let state: BankState = { version: -1, capacity: 240, tabs: [], items: new Array(240).fill(null), used: 0, loading: false, live: false, pending: 0, error: null };
  const listeners = new Set<(state: BankState) => void>();
  const queue: BankOp[] = [];
  let flushTimer: number | null = null;
  let pollTimer: number | null = null;
  let inFlight = false;
  let stream: BankStream | null = null;

  function emit(patch: Partial<BankState>): void {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  }

  async function refresh(): Promise<void> {
    emit({ loading: true });
    try {
      const snapshot = await deps.api.get();
      const items = expandSlots(snapshot);
      emit({ version: snapshot.version, capacity: snapshot.capacity, tabs: [...snapshot.tabs], items, used: usedOf(items), loading: false, error: null });
    } catch (err) {
      // A failed load must never read as "your bank is empty": keep whatever we had and say so.
      emit({ loading: false, error: (err as Error).message });
    }
  }

  function armPoll(): void {
    if (pollTimer !== null) cancel(pollTimer);
    // Unconditional, even while the stream is healthy: the engine's change hook is fire and
    // forget with a 2 s timeout and no retry, and a world with no IDLESCAPE_HOOK_URL never
    // posts at all. Polling is the only delivery this bank actually has.
    pollTimer = schedule(() => { pollTimer = null; void refresh().finally(armPoll); }, pollMs);
  }

  async function flush(): Promise<void> {
    if (flushTimer !== null) { cancel(flushTimer); flushTimer = null; }
    if (inFlight || queue.length === 0) return;
    const batch = queue.splice(0, MAX_OPS_PER_BATCH);
    inFlight = true;
    const result = await deps.api.ops(state.version, batch);
    inFlight = false;
    if (result.ok) {
      // Ruling 1: this number is current and immediately reusable.
      emit({ version: result.version, pending: queue.length });
      if (queue.length > 0) scheduleFlush();
      return;
    }
    // Both failures drop the queue rather than replaying it: the ops were computed against a
    // layout the engine no longer has, and re-issuing them blind would move the wrong slots.
    queue.length = 0;
    emit({ pending: 0 });
    if (result.kind === 'conflict') deps.notify(CHANGED_ELSEWHERE);
    else deps.notify(result.message, 'error');
    await refresh();
  }

  function scheduleFlush(): void {
    if (flushTimer !== null) return;
    flushTimer = schedule(() => { flushTimer = null; void flush(); }, flushMs);
  }

  /** The optimistic preview for the ops whose result the web can compute exactly. */
  function preview(op: BankOp): boolean {
    if (op.op === 'swap') { const items = localSwap(state.items, op.a, op.b); emit({ items, used: usedOf(items) }); return true; }
    if (op.op === 'insert') { const items = localInsert(state.items, op.from, op.to); emit({ items, used: usedOf(items) }); return true; }
    if (op.op === 'sort') { const items = localSort(state.items, state.tabs, op.tab, state.used, op.by, deps.info); emit({ items, used: usedOf(items) }); return true; }
    // moveToTab and setTabs restructure the tabs; the engine's own arithmetic decides the
    // result (it creates, grows, shrinks and drops tabs), so the store waits and re-reads.
    return false;
  }

  return {
    state: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    start() {
      // Subscribe BEFORE the first GET: a change landing between the two would otherwise be
      // missed by the stream and wait out a whole poll interval.
      stream = deps.createStream({
        onVersion: version => { if (version > state.version && queue.length === 0 && !inFlight) void refresh(); },
        onHealth: healthy => emit({ live: healthy })
      });
      stream.start();
      armPoll();
      void refresh();
    },

    stop() {
      stream?.stop();
      stream = null;
      if (flushTimer !== null) { cancel(flushTimer); flushTimer = null; }
      if (pollTimer !== null) { cancel(pollTimer); pollTimer = null; }
      queue.length = 0;
      emit({ pending: 0, live: false });
    },

    refresh,

    submit(op) {
      if (op.op === 'insert' && insertCrossesTab(state.tabs, op.from, op.to)) { deps.notify(CROSS_TAB); return; }
      const previewed = preview(op);
      queue.push(op);
      emit({ pending: queue.length });
      // A previewable op can wait for its neighbours; a structural one is what the player just
      // asked for and has nothing on screen to show for it, so it goes now.
      if (previewed && op.op !== 'sort') scheduleFlush();
      else void flush().then(() => { if (!previewed) return refresh(); });
    },

    flush
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run src/bank/store.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/bank/store.ts web/src/bank/store.test.ts
git commit -F - <<'MSG'
feat(bank): optimistic bank store on the engine version contract

A successful apply's version is reused directly as the next expectedVersion; a
409 refetches at the version the server handed back, drops the queue and says
"Bank changed elsewhere" once. Ops coalesce into at most one apply per two world
ticks so a drag burst does not pin the account in push-out mode, and polling runs
behind the stream because the change hook guarantees no delivery.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
MSG
```

---

### Task 7: The icon cache

**Decision recorded here (it deviates from spec section 3.1):** the cache keys on the **obj id alone** and always renders at `count = 1`.

- The spec's "keyed by id + note flag" is unnecessary: a bank note is its own obj id in 274 (`certtemplate !== -1`), so the id already carries noted-ness, and `getObjIcon` already draws the note background for such an id.
- Stack-size art variants (coins at 1/2/3/4/5/25/100/...) are dropped on purpose: the bank always prints the count as text beside the icon, so the variant art carries no information here, and keying on the count would make the cache unbounded.

`fake-indexeddb` is already a `web` devDependency and already loaded by `web/vitest.config.ts` (`setupFiles: ['fake-indexeddb/auto', ...]`), so no new dependency is needed.

**Files:**
- Create: `web/src/bank/icons.ts`
- Test: `web/src/bank/icons.test.ts`

**Interfaces:**
- Consumes: `ClientHooks.getObjIcon` from `web/src/clientTypes.ts` (Task 1).
- Produces:
  ```ts
  /** Just the member the cache needs, so a test never builds a whole ClientHooks. */
  export type IconSource = Pick<ClientHooks, 'getObjIcon'>;

  export interface IconCache {
    /** Cached data URL, or null. Never touches the network or the client; safe in a render. */
    peek(obj: number): string | null;
    /** Resolves to a data URL, or null when no client is open and nothing is cached. */
    load(obj: number): Promise<string | null>;
    /** Warms the cache for a set of ids, deduping in-flight loads. */
    prime(objs: number[]): Promise<void>;
    /** Fires after any new icon lands, so a view can repaint. */
    onChange(fn: () => void): () => void;
  }

  export function createIconCache(deps: { client(): IconSource | null; dbName?: string }): IconCache;
  export const ICON_DB = 'idlescape-icons';
  export const ICON_STORE = 'icons';
  ```

- [ ] **Step 1: Write the failing icon test**

```ts
// web/src/bank/icons.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createIconCache, type IconSource } from './icons';

let dbSeq = 0;
const freshDb = (): string => `idlescape-icons-test-${++dbSeq}`;

function source(map: Record<number, string | null>): { impl: IconSource; asked: number[] } {
  const asked: number[] = [];
  return { impl: { getObjIcon: (id: number) => { asked.push(id); return map[id] ?? null; } }, asked };
}

const COIN = 'data:image/png;base64,COIN';
const HAT = 'data:image/png;base64,HAT';

describe('createIconCache', () => {
  it('peeks null before anything is loaded', () => {
    const cache = createIconCache({ client: () => null, dbName: freshDb() });
    expect(cache.peek(995)).toBeNull();
  });

  it('asks the client once and then serves from memory', async () => {
    const { impl, asked } = source({ 995: COIN });
    const cache = createIconCache({ client: () => impl, dbName: freshDb() });
    await expect(cache.load(995)).resolves.toBe(COIN);
    await expect(cache.load(995)).resolves.toBe(COIN);
    expect(asked).toEqual([995]);
    expect(cache.peek(995)).toBe(COIN);
  });

  it('always renders at count 1: the bank prints the number itself', async () => {
    const seen: unknown[] = [];
    const impl: IconSource = { getObjIcon: (id: number, count?: number) => { seen.push([id, count]); return COIN; } };
    const cache = createIconCache({ client: () => impl, dbName: freshDb() });
    await cache.load(995);
    expect(seen).toEqual([[995, 1]]);
  });

  it('survives a reload: a second cache on the same database needs no client', async () => {
    const dbName = freshDb();
    const { impl } = source({ 1038: HAT });
    await createIconCache({ client: () => impl, dbName }).load(1038);
    const reopened = createIconCache({ client: () => null, dbName });
    await expect(reopened.load(1038)).resolves.toBe(HAT);
    expect(reopened.peek(1038)).toBe(HAT);
  });

  it('does not cache a null: a model that has not streamed yet is retried', async () => {
    const { impl, asked } = source({});
    const cache = createIconCache({ client: () => impl, dbName: freshDb() });
    await expect(cache.load(4151)).resolves.toBeNull();
    await expect(cache.load(4151)).resolves.toBeNull();
    expect(asked).toEqual([4151, 4151]);
  });

  it('resolves null and never throws when no client is open', async () => {
    const cache = createIconCache({ client: () => null, dbName: freshDb() });
    await expect(cache.load(995)).resolves.toBeNull();
  });

  it('dedupes concurrent loads of the same id', async () => {
    const { impl, asked } = source({ 995: COIN });
    const cache = createIconCache({ client: () => impl, dbName: freshDb() });
    await Promise.all([cache.load(995), cache.load(995), cache.load(995)]);
    expect(asked).toEqual([995]);
  });

  it('primes only the misses', async () => {
    const { impl, asked } = source({ 995: COIN, 1038: HAT });
    const cache = createIconCache({ client: () => impl, dbName: freshDb() });
    await cache.load(995);
    asked.length = 0;
    await cache.prime([995, 1038, 995]);
    expect(asked).toEqual([1038]);
    expect(cache.peek(1038)).toBe(HAT);
  });

  it('tells the view when a new icon lands', async () => {
    const { impl } = source({ 995: COIN });
    const cache = createIconCache({ client: () => impl, dbName: freshDb() });
    const changed = vi.fn();
    const off = cache.onChange(changed);
    await cache.load(995);
    expect(changed).toHaveBeenCalled();
    off();
    changed.mockClear();
    await cache.load(1038);
    expect(changed).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run src/bank/icons.test.ts`
Expected: FAIL - `Failed to resolve import "./icons"`.

- [ ] **Step 3: Write icons.ts**

```ts
// web/src/bank/icons.ts -- item art for the web bank.
//
// The 274 client rasterises item icons from the cache at runtime (client patch 28,
// getObjIcon), so an icon can only be produced while a character's frame is open. IndexedDB
// carries them across reloads and lets the bank draw before any client is up.
//
// The key is the obj id ALONE and every icon is rendered at count 1. A bank note is its own obj
// id in 274, so noted-ness is already in the key; stack-size art variants are dropped because
// the bank prints the count as text beside the icon, and keying on the count would make this
// cache unbounded.
import type { ClientHooks } from '../clientTypes';

export type IconSource = Pick<ClientHooks, 'getObjIcon'>;

export interface IconCache {
  peek(obj: number): string | null;
  load(obj: number): Promise<string | null>;
  prime(objs: number[]): Promise<void>;
  onChange(fn: () => void): () => void;
}

export const ICON_DB = 'idlescape-icons';
export const ICON_STORE = 'icons';

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function openDatabase(dbName: string): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is not available'));
  const request = indexedDB.open(dbName, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(ICON_STORE)) db.createObjectStore(ICON_STORE, { keyPath: 'obj' });
  };
  return req(request);
}

export function createIconCache(deps: { client(): IconSource | null; dbName?: string }): IconCache {
  const dbName = deps.dbName ?? ICON_DB;
  const memory = new Map<number, string>();
  const inFlight = new Map<number, Promise<string | null>>();
  const listeners = new Set<() => void>();
  // A private window, a browser with site data blocked or a stripped test realm all land here.
  // The cache then works for the life of the page and simply does not survive a reload.
  let db: Promise<IDBDatabase | null> | null = null;

  function database(): Promise<IDBDatabase | null> {
    db ??= openDatabase(dbName).catch(() => null);
    return db;
  }

  async function fromDisk(obj: number): Promise<string | null> {
    const open = await database();
    if (!open) return null;
    try {
      const row = await req<{ obj: number; url: string } | undefined>(open.transaction(ICON_STORE, 'readonly').objectStore(ICON_STORE).get(obj));
      return row?.url ?? null;
    } catch {
      return null;
    }
  }

  async function toDisk(obj: number, url: string): Promise<void> {
    const open = await database();
    if (!open) return;
    try { await req(open.transaction(ICON_STORE, 'readwrite').objectStore(ICON_STORE).put({ obj, url })); } catch { /* quota, or a closed db */ }
  }

  function remember(obj: number, url: string): void {
    memory.set(obj, url);
    for (const listener of listeners) listener();
  }

  async function resolve(obj: number): Promise<string | null> {
    const stored = await fromDisk(obj);
    if (stored) { remember(obj, stored); return stored; }
    // Null is NOT cached: it means no client is open, or OnDemand has not streamed the model
    // yet, and both fix themselves. Caching it would leave a permanent hole.
    const drawn = deps.client()?.getObjIcon(obj, 1) ?? null;
    if (!drawn) return null;
    remember(obj, drawn);
    void toDisk(obj, drawn);
    return drawn;
  }

  return {
    peek: obj => memory.get(obj) ?? null,

    load(obj) {
      const cached = memory.get(obj);
      if (cached) return Promise.resolve(cached);
      const running = inFlight.get(obj);
      if (running) return running;
      const promise = resolve(obj).finally(() => inFlight.delete(obj));
      inFlight.set(obj, promise);
      return promise;
    },

    async prime(objs) {
      await Promise.all([...new Set(objs)].filter(obj => !memory.has(obj)).map(obj => this.load(obj)));
    },

    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run src/bank/icons.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/bank/icons.ts web/src/bank/icons.test.ts
git commit -F - <<'MSG'
feat(bank): IndexedDB icon cache in front of the client's getObjIcon

Keyed on the obj id alone and always rendered at count 1: a bank note is its own
obj id in 274, and the bank prints the stack size as text, so neither a note flag
nor a count belongs in the key. A null is never cached, because it only means no
client is open yet or the model has not streamed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
MSG
```

---

### Task 8: The item pane - eight columns, OSRS counts, tab dividers, search dimming

**Files:**
- Create: `web/src/bank/grid.ts`
- Test: `web/src/bank/grid.test.ts`

**Interfaces:**
- Consumes: `BankState` (Task 6); `IconCache` (Task 7); `formatCount`, `rangeOfTab`, `tabIconObj`, `tabRanges` (Task 2); `BANK_COLUMNS`, `MenuItemContext`, `ObjInfo` (Task 2); `h` from `../ui/el`.
- Produces:
  ```ts
  export interface BankGridDeps {
    icons: IconCache;
    info(obj: number): ObjInfo | null;
    /** 0 is "All items"; 1..9 is a tab. */
    selectedTab(): number;
    /** Lower-cased search text, or ''. */
    search(): string;
    onMenu(ctx: MenuItemContext, at: { x: number; y: number }): void;
  }

  export interface BankGrid {
    el: HTMLElement;
    render(state: BankState): void;
    /** The slot a DOM node belongs to, or null. Used by the input layer (Task 9). */
    slotOf(node: EventTarget | null): number | null;
    /** Every rendered slot index, in visual order. Used for keyboard movement. */
    visible(): number[];
  }

  export function createBankGrid(deps: BankGridDeps): BankGrid;
  /** DOM contract the e2e spec and the input layer both depend on. */
  export const SLOT_ATTR = 'data-bank-slot';
  ```
- DOM contract produced here and depended on by Tasks 9, 12 and 16:
  - `.bank-pane[role=grid]` root, `.bank-row[role=row]` rows of exactly 8 cells,
  - `.bank-slot[role=gridcell][data-bank-slot="<n>"]`, `tabindex` 0 on exactly one cell (roving),
  - `data-bank-obj="<id>"` on an occupied cell and absent on an empty one, so the Playwright spec can read the visible order without a screenshot,
  - `img.bank-icon` when an icon is cached, otherwise `span.bank-fallback` with the abbreviated name,
  - `span.bank-count.count-yellow|count-white|count-green` when `formatCount` returns one,
  - `.bank-slot.dim` for a slot that does not match a non-empty search,
  - `.bank-divider[data-bank-divider="<tab>"]` before each tab's first row, only while "All items" is selected,
  - `.bank-empty` when the bank has no items at all.

- [ ] **Step 1: Write the failing grid test**

```ts
// web/src/bank/grid.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createBankGrid } from './grid';
import type { BankState } from './store';
import type { IconCache } from './icons';
import type { ObjInfo } from './types';

const INFO: Record<number, ObjInfo> = {
  995: { name: 'Coins', examine: 'Lovely money!', cost: 1, stackable: true, noted: false },
  1038: { name: 'Red partyhat', examine: 'A nice hat.', cost: 1, stackable: false, noted: false },
  1618: { name: 'Uncut diamond', examine: 'Valuable.', cost: 200, stackable: false, noted: false }
};

function icons(map: Record<number, string> = {}): IconCache {
  return { peek: obj => map[obj] ?? null, load: async obj => map[obj] ?? null, prime: async () => {}, onChange: () => () => {} };
}

function state(over: Partial<BankState> = {}): BankState {
  const items = new Array(240).fill(null);
  items[0] = { slot: 0, obj: 995, count: 500 };
  items[1] = { slot: 1, obj: 1038, count: 1 };
  items[2] = { slot: 2, obj: 1618, count: 250_000 };
  return { version: 1, capacity: 240, tabs: [], items, used: 3, loading: false, live: true, pending: 0, error: null, ...over };
}

function mount(over: Partial<Parameters<typeof createBankGrid>[0]> = {}, iconMap: Record<number, string> = {}) {
  const onMenu = vi.fn();
  const grid = createBankGrid({
    icons: icons(iconMap),
    info: obj => INFO[obj] ?? null,
    selectedTab: () => 0,
    search: () => '',
    onMenu,
    ...over
  });
  document.body.appendChild(grid.el);
  return { grid, onMenu };
}

const slots = (root: HTMLElement): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>('[data-bank-slot]'));

describe('the item pane', () => {
  it('is a grid of rows of exactly eight cells', () => {
    const { grid } = mount();
    grid.render(state());
    expect(grid.el.getAttribute('role')).toBe('grid');
    const rows = Array.from(grid.el.querySelectorAll('[role="row"]'));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.querySelectorAll('[role="gridcell"]')).toHaveLength(8);
  });

  it('renders one cell per slot up to a whole row past the last item', () => {
    const { grid } = mount();
    grid.render(state());
    // Three items: one row of eight, plus a second row so there is somewhere to drop.
    expect(slots(grid.el)).toHaveLength(16);
    expect(slots(grid.el)[0].dataset.bankSlot).toBe('0');
  });

  it('draws the cached icon and falls back to the item name when there is none', () => {
    const { grid } = mount({}, { 995: 'data:image/png;base64,COIN' });
    grid.render(state());
    const [coins, hat] = slots(grid.el);
    expect(coins.querySelector('img.bank-icon')?.getAttribute('src')).toBe('data:image/png;base64,COIN');
    expect(hat.querySelector('img.bank-icon')).toBeNull();
    expect(hat.querySelector('.bank-fallback')?.textContent).toContain('Red');
  });

  it('colours counts the OSRS way and shows none for a single item', () => {
    const { grid } = mount();
    grid.render(state());
    const [coins, hat, diamond] = slots(grid.el);
    expect(coins.querySelector('.bank-count')?.textContent).toBe('500');
    expect(coins.querySelector('.bank-count')?.className).toContain('count-yellow');
    expect(hat.querySelector('.bank-count')).toBeNull();
    expect(diamond.querySelector('.bank-count')?.textContent).toBe('250K');
    expect(diamond.querySelector('.bank-count')?.className).toContain('count-white');
  });

  it('tags an occupied cell with its obj id and leaves an empty one untagged', () => {
    const { grid } = mount();
    grid.render(state());
    const cells = slots(grid.el);
    expect(cells.slice(0, 4).map(cell => cell.dataset.bankObj ?? null)).toEqual(['995', '1038', '1618', null]);
  });

  it('labels every occupied cell for a screen reader and marks empty ones', () => {
    const { grid } = mount();
    grid.render(state());
    const cells = slots(grid.el);
    expect(cells[0].getAttribute('aria-label')).toBe('Slot 1: Coins, 500');
    expect(cells[3].getAttribute('aria-label')).toBe('Slot 4: empty');
  });

  it('keeps exactly one cell in the tab order (roving tabindex)', () => {
    const { grid } = mount();
    grid.render(state());
    expect(slots(grid.el).filter(cell => cell.tabIndex === 0)).toHaveLength(1);
  });

  it('primes the icons of the slots it just drew', () => {
    const primed: number[][] = [];
    const cache: IconCache = { peek: () => null, load: async () => null, prime: async objs => { primed.push(objs); }, onChange: () => () => {} };
    const { grid } = mount({ icons: cache });
    grid.render(state());
    expect(primed[0].sort()).toEqual([995, 1038, 1618].sort());
  });
});

describe('tabs and dividers', () => {
  const tabbed = () => state({ tabs: [2], used: 3 });

  it('shows a divider before each tab while All items is selected', () => {
    const { grid } = mount({ selectedTab: () => 0 });
    grid.render(tabbed());
    expect(grid.el.querySelectorAll('[data-bank-divider]')).toHaveLength(1);
    expect(grid.el.querySelector('[data-bank-divider="1"]')).not.toBeNull();
  });

  it('shows only the selected tab, with no dividers', () => {
    const { grid } = mount({ selectedTab: () => 1 });
    grid.render(tabbed());
    expect(grid.el.querySelectorAll('[data-bank-divider]')).toHaveLength(0);
    expect(grid.visible().slice(0, 2)).toEqual([0, 1]);
    expect(grid.visible()).not.toContain(2);
  });

  it('shows the main tab as everything past the last tab', () => {
    const { grid } = mount({ selectedTab: () => 0 });
    grid.render(tabbed());
    expect(grid.visible()).toContain(2);
  });
});

describe('search', () => {
  it('dims what does not match and leaves matches alone', () => {
    const { grid } = mount({ search: () => 'coin' });
    grid.render(state());
    const cells = slots(grid.el);
    expect(cells[0].classList.contains('dim')).toBe(false);
    expect(cells[1].classList.contains('dim')).toBe(true);
    // An empty slot is never a match, and never worth dimming either.
    expect(cells[5].classList.contains('dim')).toBe(true);
  });

  it('dims nothing when the box is empty', () => {
    const { grid } = mount({ search: () => '' });
    grid.render(state());
    expect(slots(grid.el).some(cell => cell.classList.contains('dim'))).toBe(false);
  });
});

describe('the right-click menu', () => {
  it('opens with the slot under the pointer and suppresses the browser menu', () => {
    const { grid, onMenu } = mount();
    grid.render(state());
    const cell = slots(grid.el)[1];
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 60 });
    cell.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onMenu).toHaveBeenCalledWith(
      { slot: 1, obj: 1038, count: 1, info: INFO[1038] },
      { x: 40, y: 60 }
    );
  });

  it('does not open on an empty slot', () => {
    const { grid, onMenu } = mount();
    grid.render(state());
    slots(grid.el)[7].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(onMenu).not.toHaveBeenCalled();
  });
});

describe('empty bank', () => {
  it('says so instead of drawing an empty grid', () => {
    const { grid } = mount();
    grid.render(state({ items: new Array(240).fill(null), used: 0 }));
    expect(grid.el.querySelector('.bank-empty')?.textContent).toContain('Your bank is empty');
  });
});

describe('slotOf', () => {
  it('finds the slot a nested node belongs to, and null outside the grid', () => {
    const { grid } = mount({}, { 995: 'data:image/png;base64,COIN' });
    grid.render(state());
    const img = grid.el.querySelector('img.bank-icon')!;
    expect(grid.slotOf(img)).toBe(0);
    expect(grid.slotOf(document.body)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run src/bank/grid.test.ts`
Expected: FAIL - `Failed to resolve import "./grid"`.

- [ ] **Step 3: Write grid.ts**

Build the module around one `render(state)` that rebuilds the pane's children with `h()` (never `innerHTML`), and keep these rules:

- Rows are always `BANK_COLUMNS` wide; the last row is padded with empty cells, and one whole extra row is drawn past the last item so there is always somewhere to drop.
- The visible slot range is `rangeOfTab(state.tabs, deps.selectedTab(), state.used)` when a tab is selected, and `0 .. used` when "All items" is.
- A divider is emitted before the first cell of each tab, only while "All items" is selected; its icon comes from `tabIconObj` through `deps.icons.peek`.
- `aria-label` is `Slot ${slot + 1}: ${name}, ${count}` for an occupied cell (`, ${count}` omitted when the count is 1) and `Slot ${slot + 1}: empty` otherwise.
- Roving tabindex: the module keeps a `focusSlot` field, defaults it to the first visible slot, and re-applies it on every render so focus survives a repaint.
- `search()` matches case-insensitively against `deps.info(obj)?.name`; a non-empty search adds `dim` to every cell that does not match, empty cells included.
- After building, call `void deps.icons.prime(objsDrawn)` and subscribe once to `deps.icons.onChange` so a late icon repaints (guard the repaint against re-entering `render`; keep the last `BankState` in a field and re-render from it).
- The `contextmenu` listener is delegated on the pane root, calls `preventDefault()` and only fires `deps.onMenu` for an occupied slot.
- Keep the file under 400 lines. If it grows past that, move the single-cell builder into `web/src/bank/cell.ts` and import it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run src/bank/grid.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/bank/grid.ts web/src/bank/grid.test.ts
git commit -F - <<'MSG'
feat(bank): 2007scape-styled item pane with tab dividers and search dimming

Eight columns of gridcells with OSRS count colours (yellow, white K, green M),
a divider per tab while All items is selected, a name tile whenever no icon is
cached yet, and a roving tabindex so the pane is reachable by keyboard.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
MSG
```

---

### Task 9: Drag and keyboard reordering

Two ways to reorder, both producing the same op. Which op depends on the rearrange mode: **Swap** produces `{ op: 'swap', a, b }`, **Insert** produces `{ op: 'insert', from, to }`. Releasing over a tab header produces `{ op: 'moveToTab' }` instead, which the tab bar (Task 10) owns; this module only reports which tab the pointer was over.

**Files:**
- Create: `web/src/bank/gridInput.ts`
- Test: `web/src/bank/gridInput.test.ts`

**Interfaces:**
- Consumes: `BANK_COLUMNS`, `RearrangeMode` (Task 2); the grid's `slotOf` and `visible` (Task 8).
- Produces:
  ```ts
  export interface GridInputDeps {
    /** The pane root; every listener is delegated here. */
    root: HTMLElement;
    slotOf(node: EventTarget | null): number | null;
    visible(): number[];
    mode(): RearrangeMode;
    /** Both ends are real slots. The caller turns them into a swap or an insert. */
    onMove(from: number, to: number): void;
    /** The pointer was released over a tab header: 1..9, or 'new' for the "+" tab. */
    onDropOnTab(slot: number, tab: number | 'new'): void;
    /** The context-menu key was pressed on a slot. */
    onMenuKey(slot: number): void;
    /** Which element is under a point. Seam so jsdom does not need a layout engine. */
    hitTest(x: number, y: number): Element | null;
    /** The tab a hit-test result belongs to, or null. Supplied by the tab bar. */
    tabAt(node: Element | null): number | 'new' | null;
    /** Item name for the announcements, or null for an empty slot. */
    nameOf(slot: number): string | null;
    announce(message: string): void;
  }

  export interface GridInput {
    detach(): void;
    /** The slot picked up by keyboard, or null. The view draws it as held. */
    held(): number | null;
  }

  export function attachGridInput(deps: GridInputDeps): GridInput;
  /** Pointer travel before a press becomes a drag. */
  export const DRAG_THRESHOLD_PX = 4;
  ```
- CSS hooks it sets: `.bank-pane.is-dragging`, `.bank-slot.is-source`, `.bank-slot.is-target`, `.bank-slot.is-held`.

- [ ] **Step 1: Write the failing input test**

```ts
// web/src/bank/gridInput.test.ts
import { describe, expect, it, vi } from 'vitest';
import { DRAG_THRESHOLD_PX, attachGridInput } from './gridInput';
import type { RearrangeMode } from './types';

const NAMES: Record<number, string> = { 0: 'Coins', 1: 'Red partyhat', 2: 'Uncut diamond' };

/** Sixteen cells, two rows of eight, the first three occupied. */
function pane(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'bank-pane';
  for (let slot = 0; slot < 16; slot++) {
    const cell = document.createElement('div');
    cell.className = 'bank-slot';
    cell.dataset.bankSlot = String(slot);
    cell.tabIndex = slot === 0 ? 0 : -1;
    root.appendChild(cell);
  }
  document.body.appendChild(root);
  return root;
}

function harness(over: { mode?: RearrangeMode; tabAt?: (node: Element | null) => number | 'new' | null } = {}) {
  const root = pane();
  const cells = Array.from(root.querySelectorAll<HTMLElement>('[data-bank-slot]'));
  const moves: [number, number][] = [];
  const tabDrops: [number, number | 'new'][] = [];
  const menus: number[] = [];
  const said: string[] = [];
  let hit: Element | null = null;
  const input = attachGridInput({
    root,
    slotOf: node => {
      const cell = (node as HTMLElement | null)?.closest?.<HTMLElement>('[data-bank-slot]');
      return cell ? Number(cell.dataset.bankSlot) : null;
    },
    visible: () => cells.map((_, slot) => slot),
    mode: () => over.mode ?? 'swap',
    onMove: (from, to) => moves.push([from, to]),
    onDropOnTab: (slot, tab) => tabDrops.push([slot, tab]),
    onMenuKey: slot => menus.push(slot),
    hitTest: () => hit,
    tabAt: over.tabAt ?? (() => null),
    nameOf: slot => NAMES[slot] ?? null,
    announce: message => said.push(message)
  });
  const press = (cell: HTMLElement, x = 0, y = 0): void => { cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, button: 0 })); };
  const moveTo = (x: number, y: number): void => { root.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y })); };
  const release = (x: number, y: number): void => { root.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y })); };
  const key = (cell: HTMLElement, init: KeyboardEventInit): void => { cell.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init })); };
  return { root, cells, input, moves, tabDrops, menus, said, press, moveTo, release, key, setHit: (el: Element | null) => { hit = el; } };
}

describe('drag', () => {
  it('a press with no travel is not a drag and moves nothing', () => {
    const h = harness();
    h.press(h.cells[0]);
    h.setHit(h.cells[3]);
    h.release(0, 0);
    expect(h.moves).toEqual([]);
    expect(h.root.classList.contains('is-dragging')).toBe(false);
  });

  it('past the threshold it drags, marks source and target, and reports the move', () => {
    const h = harness();
    h.press(h.cells[0]);
    h.moveTo(DRAG_THRESHOLD_PX + 1, 0);
    expect(h.root.classList.contains('is-dragging')).toBe(true);
    expect(h.cells[0].classList.contains('is-source')).toBe(true);
    h.setHit(h.cells[3]);
    h.moveTo(60, 0);
    expect(h.cells[3].classList.contains('is-target')).toBe(true);
    h.release(60, 0);
    expect(h.moves).toEqual([[0, 3]]);
    expect(h.root.classList.contains('is-dragging')).toBe(false);
    expect(h.cells[3].classList.contains('is-target')).toBe(false);
  });

  it('never starts a drag from an empty slot', () => {
    const h = harness();
    h.press(h.cells[9]);
    h.moveTo(40, 0);
    h.setHit(h.cells[0]);
    h.release(40, 0);
    expect(h.moves).toEqual([]);
  });

  it('dropping on the source itself moves nothing', () => {
    const h = harness();
    h.press(h.cells[1]);
    h.moveTo(40, 0);
    h.setHit(h.cells[1]);
    h.release(40, 0);
    expect(h.moves).toEqual([]);
  });

  it('dropping outside the grid cancels', () => {
    const h = harness();
    h.press(h.cells[1]);
    h.moveTo(40, 0);
    h.setHit(document.body);
    h.release(40, 0);
    expect(h.moves).toEqual([]);
    expect(h.root.classList.contains('is-dragging')).toBe(false);
  });

  it('dropping on a tab header reports a tab move, not a slot move', () => {
    const header = document.createElement('div');
    document.body.appendChild(header);
    const h = harness({ tabAt: node => (node === header ? 2 : null) });
    h.press(h.cells[0]);
    h.moveTo(40, 0);
    h.setHit(header);
    h.release(40, 0);
    expect(h.tabDrops).toEqual([[0, 2]]);
    expect(h.moves).toEqual([]);
  });

  it('dropping on the plus tab asks for a new tab', () => {
    const plus = document.createElement('div');
    document.body.appendChild(plus);
    const h = harness({ tabAt: node => (node === plus ? 'new' : null) });
    h.press(h.cells[2]);
    h.moveTo(40, 0);
    h.setHit(plus);
    h.release(40, 0);
    expect(h.tabDrops).toEqual([[2, 'new']]);
  });
});

describe('keyboard', () => {
  it('moves focus by one with the left and right arrows', () => {
    const h = harness();
    h.cells[0].focus();
    h.key(h.cells[0], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(h.cells[1]);
    h.key(h.cells[1], { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(h.cells[0]);
  });

  it('moves focus by a row with the up and down arrows', () => {
    const h = harness();
    h.cells[0].focus();
    h.key(h.cells[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(h.cells[8]);
    h.key(h.cells[8], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(h.cells[0]);
  });

  it('Home and End go to the first and last visible slot', () => {
    const h = harness();
    h.cells[5].focus();
    h.key(h.cells[5], { key: 'End' });
    expect(document.activeElement).toBe(h.cells[15]);
    h.key(h.cells[15], { key: 'Home' });
    expect(document.activeElement).toBe(h.cells[0]);
  });

  it('picks an item up with Enter, places it with Enter, and says what happened', () => {
    const h = harness();
    h.cells[0].focus();
    h.key(h.cells[0], { key: 'Enter' });
    expect(h.input.held()).toBe(0);
    expect(h.cells[0].classList.contains('is-held')).toBe(true);
    expect(h.said[0]).toBe('Picked up Coins. Use the arrow keys, then Enter to place it.');
    h.cells[3].focus();
    h.key(h.cells[3], { key: 'Enter' });
    expect(h.moves).toEqual([[0, 3]]);
    expect(h.input.held()).toBeNull();
    expect(h.said[1]).toBe('Moved Coins to slot 4.');
  });

  it('Space works exactly like Enter', () => {
    const h = harness();
    h.cells[1].focus();
    h.key(h.cells[1], { key: ' ' });
    expect(h.input.held()).toBe(1);
  });

  it('Escape puts a held item back down without moving it', () => {
    const h = harness();
    h.cells[0].focus();
    h.key(h.cells[0], { key: 'Enter' });
    h.key(h.cells[0], { key: 'Escape' });
    expect(h.input.held()).toBeNull();
    expect(h.moves).toEqual([]);
    expect(h.said[h.said.length - 1]).toBe('Put Coins back.');
  });

  it('never picks up an empty slot', () => {
    const h = harness();
    h.cells[9].focus();
    h.key(h.cells[9], { key: 'Enter' });
    expect(h.input.held()).toBeNull();
  });

  it('opens the menu on the context-menu key and on Shift+F10', () => {
    const h = harness();
    h.cells[1].focus();
    h.key(h.cells[1], { key: 'ContextMenu' });
    h.key(h.cells[1], { key: 'F10', shiftKey: true });
    expect(h.menus).toEqual([1, 1]);
  });

  it('detach removes every listener', () => {
    const h = harness();
    h.input.detach();
    h.cells[0].focus();
    h.key(h.cells[0], { key: 'Enter' });
    expect(h.input.held()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run src/bank/gridInput.test.ts`
Expected: FAIL - `Failed to resolve import "./gridInput"`.

- [ ] **Step 3: Write gridInput.ts**

Rules the implementation follows:

- One `pointerdown` listener on `deps.root`, plus `pointermove`/`pointerup`/`pointercancel`. Left button only. It records `{ slot, x, y }` and does nothing else until the pointer has travelled more than `DRAG_THRESHOLD_PX`, at which point `is-dragging` goes on the root and `is-source` on the origin cell.
- During the drag, `deps.hitTest(x, y)` decides the hover target: a slot gets `is-target` (cleared from the previous one), a tab header gets nothing here (the tab bar highlights itself).
- On release: a tab under the pointer wins and calls `onDropOnTab`; otherwise a slot that is not the source calls `onMove(from, to)`; anything else cancels. Every path clears the classes.
- The keyboard half lives on the same root as one `keydown` listener. Movement uses `deps.visible()` as the ordered list and `BANK_COLUMNS` as the row stride, clamping at both ends. `Enter`/`Space` pick up an occupied slot or place a held one; `Escape` cancels; `ContextMenu` and `Shift+F10` call `onMenuKey`. Every branch that acts calls `event.preventDefault()`.
- Announcements go through `deps.announce` with the exact copy the tests pin, and `slot + 1` is what a player is told (the pane is one-based on screen).
- `detach()` removes every listener and clears every class it set.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run src/bank/gridInput.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/bank/gridInput.ts web/src/bank/gridInput.test.ts
git commit -F - <<'MSG'
feat(bank): drag and keyboard reordering for the bank pane

A press becomes a drag past 4 px; releasing over a slot reports a move and over
a tab header reports a tab move. The same reordering is reachable from the
keyboard: arrows to move, Enter or Space to pick up and place, Escape to put
back, with a spoken line for every action.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
MSG
```

---

### Task 10: The tab bar

Owner decision 4: **a tab's icon is always the first item in that tab**, with no digit option. An empty tab cannot exist (the engine drops a tab whose size reaches 0), so a tab with no icon only happens while the first icon is still being rasterised, and then it shows the item's initials.

**Files:**
- Create: `web/src/bank/tabsBar.ts`
- Test: `web/src/bank/tabsBar.test.ts`

**Interfaces:**
- Consumes: `BankState` (Task 6); `IconCache` (Task 7); `tabIconObj`, `tabItemCount` (Task 2); `MAX_TABS`, `ObjInfo` (Task 2).
- Produces:
  ```ts
  export interface BankTabsDeps {
    icons: IconCache;
    info(obj: number): ObjInfo | null;
    /** 0 is "All items". */
    selected(): number;
    onSelect(tab: number): void;
    /** Right-click (or the menu key) on a tab; the view builds the sort entries. */
    onTabMenu(tab: number, at: { x: number; y: number }): void;
  }

  export interface BankTabs {
    el: HTMLElement;
    render(state: BankState): void;
    /** Which tab a node belongs to, 'new' for the plus tab, or null. Fed to gridInput.tabAt. */
    tabAt(node: Element | null): number | 'new' | null;
  }

  export function createBankTabs(deps: BankTabsDeps): BankTabs;
  ```
- DOM contract: `.bank-tabs[role=tablist]` root; `[data-bank-tab="0"]` is "All items" and carries the infinity glyph; `[data-bank-tab="1..9"]` one per tab; `[data-bank-tab-new]` is the "+" tab, present only while fewer than `MAX_TABS` tabs exist. Each is a `button[role=tab]` with `aria-selected` and a roving `tabindex`.

- [ ] **Step 1: Write the failing tab-bar test**

```ts
// web/src/bank/tabsBar.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createBankTabs } from './tabsBar';
import type { BankState } from './store';
import type { IconCache } from './icons';
import type { ObjInfo } from './types';

const INFO: Record<number, ObjInfo> = {
  995: { name: 'Coins', examine: 'Lovely money!', cost: 1, stackable: true, noted: false },
  1038: { name: 'Red partyhat', examine: 'A nice hat.', cost: 1, stackable: false, noted: false }
};

function icons(map: Record<number, string> = {}): IconCache {
  return { peek: obj => map[obj] ?? null, load: async obj => map[obj] ?? null, prime: async () => {}, onChange: () => () => {} };
}

function state(tabs: number[]): BankState {
  const items = new Array(240).fill(null);
  items[0] = { slot: 0, obj: 995, count: 500 };
  items[1] = { slot: 1, obj: 1038, count: 1 };
  items[2] = { slot: 2, obj: 1038, count: 1 };
  return { version: 1, capacity: 240, tabs, items, used: 3, loading: false, live: true, pending: 0, error: null };
}

function mount(over: Partial<Parameters<typeof createBankTabs>[0]> = {}, iconMap: Record<number, string> = {}) {
  const onSelect = vi.fn();
  const onTabMenu = vi.fn();
  const bar = createBankTabs({ icons: icons(iconMap), info: obj => INFO[obj] ?? null, selected: () => 0, onSelect, onTabMenu, ...over });
  document.body.appendChild(bar.el);
  return { bar, onSelect, onTabMenu };
}

const tabs = (root: HTMLElement): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>('[data-bank-tab], [data-bank-tab-new]'));

describe('the tab bar', () => {
  it('is a tab list with All items, one tab per size, and a plus tab', () => {
    const { bar } = mount();
    bar.render(state([2]));
    expect(bar.el.getAttribute('role')).toBe('tablist');
    expect(tabs(bar.el).map(t => t.dataset.bankTab ?? 'new')).toEqual(['0', '1', 'new']);
  });

  it('hides the plus tab once nine tabs exist', () => {
    const { bar } = mount();
    bar.render(state([1, 1, 1, 1, 1, 1, 1, 1, 1]));
    expect(bar.el.querySelector('[data-bank-tab-new]')).toBeNull();
    expect(bar.el.querySelectorAll('[data-bank-tab]')).toHaveLength(10);
  });

  it('uses the first item of the tab as its icon (owner decision 4)', () => {
    const { bar } = mount({}, { 995: 'data:image/png;base64,COIN' });
    bar.render(state([2]));
    const tab = bar.el.querySelector<HTMLElement>('[data-bank-tab="1"]')!;
    expect(tab.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,COIN');
  });

  it('falls back to the item initials while the icon is still being drawn', () => {
    const { bar } = mount();
    bar.render(state([2]));
    const tab = bar.el.querySelector<HTMLElement>('[data-bank-tab="1"]')!;
    expect(tab.querySelector('img')).toBeNull();
    expect(tab.textContent).toContain('Co');
  });

  it('names each tab and its item count for a screen reader and a tooltip', () => {
    const { bar } = mount();
    bar.render(state([2]));
    expect(bar.el.querySelector('[data-bank-tab="0"]')?.getAttribute('aria-label')).toBe('All items');
    expect(bar.el.querySelector('[data-bank-tab="1"]')?.getAttribute('aria-label')).toBe('Tab 1, 2 items');
    expect(bar.el.querySelector('[data-bank-tab="1"]')?.getAttribute('title')).toBe('Tab 1, 2 items');
  });

  it('marks the selected tab and keeps exactly one in the tab order', () => {
    const { bar } = mount({ selected: () => 1 });
    bar.render(state([2]));
    const all = bar.el.querySelector<HTMLElement>('[data-bank-tab="0"]')!;
    const one = bar.el.querySelector<HTMLElement>('[data-bank-tab="1"]')!;
    expect(one.getAttribute('aria-selected')).toBe('true');
    expect(all.getAttribute('aria-selected')).toBe('false');
    expect(tabs(bar.el).filter(t => t.tabIndex === 0)).toHaveLength(1);
  });

  it('selects on click', () => {
    const { bar, onSelect } = mount();
    bar.render(state([2]));
    bar.el.querySelector<HTMLElement>('[data-bank-tab="1"]')!.click();
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('moves selection with the arrow keys, Home and End', () => {
    const { bar, onSelect } = mount({ selected: () => 0 });
    bar.render(state([1, 1]));
    const all = bar.el.querySelector<HTMLElement>('[data-bank-tab="0"]')!;
    all.focus();
    all.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith(1);
    all.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(onSelect).toHaveBeenLastCalledWith(2);
  });

  it('opens the tab menu on right-click and on the menu key, never for All items or plus', () => {
    const { bar, onTabMenu } = mount();
    bar.render(state([2]));
    const one = bar.el.querySelector<HTMLElement>('[data-bank-tab="1"]')!;
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 8, clientY: 9 });
    one.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onTabMenu).toHaveBeenCalledWith(1, { x: 8, y: 9 });

    onTabMenu.mockClear();
    bar.el.querySelector<HTMLElement>('[data-bank-tab="0"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    bar.el.querySelector<HTMLElement>('[data-bank-tab-new]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(onTabMenu).not.toHaveBeenCalled();
  });
});

describe('tabAt', () => {
  it('resolves a nested node to its tab, the plus tab to new, and anything else to null', () => {
    const { bar } = mount({}, { 995: 'data:image/png;base64,COIN' });
    bar.render(state([2]));
    expect(bar.tabAt(bar.el.querySelector('[data-bank-tab="1"] img'))).toBe(1);
    expect(bar.tabAt(bar.el.querySelector('[data-bank-tab-new]'))).toBe('new');
    expect(bar.tabAt(bar.el.querySelector('[data-bank-tab="0"]'))).toBe(0);
    expect(bar.tabAt(document.body)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run src/bank/tabsBar.test.ts`
Expected: FAIL - `Failed to resolve import "./tabsBar"`.

- [ ] **Step 3: Write tabsBar.ts**

Rules:

- `render(state)` rebuilds the bar with `h()`: an "All items" button carrying the infinity glyph, then `state.tabs.length` buttons, then the "+" button while `state.tabs.length < MAX_TABS`.
- Each real tab's face is `deps.icons.peek(tabIconObj(state.items, state.tabs, tab, state.used))`; when that is null, fall back to the first two characters of `deps.info(obj)?.name`, and when there is no obj at all, the tab number. `void deps.icons.prime(...)` for the icons it wanted, and subscribe once to `deps.icons.onChange` to repaint from the last rendered state.
- `aria-label` and `title` are `All items` for tab 0, `Tab ${n}, ${count} items` (`1 item` in the singular) for a real tab, and `New tab` for the plus.
- Roving tabindex plus `ArrowLeft`/`ArrowRight`/`Home`/`End`, each calling `deps.onSelect` with the tab it lands on (the plus tab is skipped by the keyboard: it is an action, not a view).
- `contextmenu` is delegated on the root, `preventDefault()`s, and calls `deps.onTabMenu` only for tabs 1..9. `ContextMenu` and `Shift+F10` do the same from the keyboard, positioned at the button's `getBoundingClientRect()`.
- `tabAt(node)` is `node?.closest('[data-bank-tab], [data-bank-tab-new]')` mapped to a number, `'new'` or `null`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run src/bank/tabsBar.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/bank/tabsBar.ts web/src/bank/tabsBar.test.ts
git commit -F - <<'MSG'
feat(bank): tab bar with first-item icons and a plus tab

Owner decision 4: a tab's icon is the first item in it, with initials as the
fallback while the icon is still being rasterised. Arrow keys, Home and End move
between tabs; right-click on a real tab opens the tab menu.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
MSG
```

---

### Task 11: The right-click menu and the Contracts entry points

Two recorded deviations from spec section 5:

1. **No submenu.** The spec draws "Move to tab" as a submenu. This renders one flat entry per tab (`Move to tab 1` ... `Move to tab 9`, then `Move to new tab`), because at most nine tabs exist, a flat menu is one keyboard model instead of two, and a submenu on a right-click menu is the part screen readers and touch handle worst.
2. **"Sell..." is not greyed out for untradeables.** The spec wanted `ObjType.tradeable`. The 274 **client** cache has no such field (only the engine's `ObjType` does, and it never reaches the client), and there is no build-time item table in this repo. So both Contracts entries are simply disabled with "Contracts coming soon" until SP9 registers over them, and SP9's own form owns tradeability, which it must anyway because it owns the escrow.

**Files:**
- Create: `web/src/bank/contextMenu.ts`
- Test: `web/src/bank/contextMenu.test.ts`

**Interfaces:**
- Consumes: `MenuEntry`, `MenuItemContext` (Task 2); `h` from `../ui/el`.
- Produces:
  ```ts
  export interface BankMenuRegistry {
    /** Registers, or REPLACES by id. SP9 calls this once to take over 'sell' and 'buy'. */
    register(entry: MenuEntry): void;
    /** Registration order. */
    entries(): MenuEntry[];
  }
  export function createMenuRegistry(): BankMenuRegistry;

  /** The two entries SP9 replaces. Registered by the bank plugin at start-up. */
  export function contractsStubs(): MenuEntry[];
  export const CONTRACTS_HINT = 'Contracts coming soon';

  export interface BankMenu {
    el: HTMLElement;
    /** `rows` is already composed: registry entries, then the caller's own. Cancel is added here. */
    open(rows: MenuEntry[], ctx: MenuItemContext, at: { x: number; y: number }): void;
    close(): void;
    isOpen(): boolean;
  }
  export function createBankMenu(deps: { host: HTMLElement }): BankMenu;
  ```
- DOM contract: `#bank-menu[role=menu]`, one `button[role=menuitem][data-bank-menu-entry="<id>"]` per row, a disabled row carrying `aria-disabled="true"`, class `disabled` and a `.bank-menu-hint`, and a final `[data-bank-menu-entry="cancel"]`.

- [ ] **Step 1: Write the failing menu test**

```ts
// web/src/bank/contextMenu.test.ts
import { describe, expect, it, vi } from 'vitest';
import { CONTRACTS_HINT, contractsStubs, createBankMenu, createMenuRegistry } from './contextMenu';
import type { MenuEntry, MenuItemContext } from './types';

const CTX: MenuItemContext = {
  slot: 2, obj: 1038, count: 1,
  info: { name: 'Red partyhat', examine: 'A nice hat.', cost: 1, stackable: false, noted: false }
};

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return createBankMenu({ host });
}

const rows = (menu: { el: HTMLElement }): HTMLElement[] => Array.from(menu.el.querySelectorAll<HTMLElement>('[data-bank-menu-entry]'));

describe('the registry', () => {
  it('keeps registration order', () => {
    const registry = createMenuRegistry();
    registry.register({ id: 'a', label: 'A', enabled: true, run: () => {} });
    registry.register({ id: 'b', label: 'B', enabled: true, run: () => {} });
    expect(registry.entries().map(e => e.id)).toEqual(['a', 'b']);
  });

  it('lets a later registration replace an entry in place, which is how SP9 takes over', () => {
    const registry = createMenuRegistry();
    for (const stub of contractsStubs()) registry.register(stub);
    const real = vi.fn();
    registry.register({ id: 'sell', label: 'Sell...', enabled: true, run: real });
    expect(registry.entries().map(e => e.id)).toEqual(['sell', 'buy']);
    registry.entries()[0].run(CTX);
    expect(real).toHaveBeenCalledWith(CTX);
  });
});

describe('the Contracts stubs', () => {
  it('are Sell and Buy more, disabled with the coming-soon hint', () => {
    const [sell, buy] = contractsStubs();
    expect(sell.id).toBe('sell');
    expect(sell.label).toBe('Sell...');
    expect(sell.enabled).toBe(false);
    expect(sell.hint).toBe(CONTRACTS_HINT);
    expect(buy.id).toBe('buy');
    expect(buy.label).toBe('Buy more...');
    expect(buy.enabled).toBe(false);
  });
});

describe('the menu', () => {
  const entry = (id: string, over: Partial<MenuEntry> = {}): MenuEntry => ({ id, label: id, enabled: true, run: () => {}, ...over });

  it('renders the rows it is given plus a Cancel, in order', () => {
    const menu = mount();
    menu.open([...contractsStubs(), entry('examine', { label: 'Examine Red partyhat' })], CTX, { x: 10, y: 10 });
    expect(rows(menu).map(r => r.dataset.bankMenuEntry)).toEqual(['sell', 'buy', 'examine', 'cancel']);
    expect(menu.isOpen()).toBe(true);
  });

  it('resolves a label and an enabled predicate against the context', () => {
    const menu = mount();
    menu.open([entry('x', { label: ctx => `Sell ${ctx.info?.name ?? ''}`, enabled: ctx => ctx.count > 1 })], CTX, { x: 0, y: 0 });
    const row = rows(menu)[0];
    expect(row.textContent).toContain('Sell Red partyhat');
    expect(row.getAttribute('aria-disabled')).toBe('true');
  });

  it('shows the hint beside a disabled row and does not run it', () => {
    const run = vi.fn();
    const menu = mount();
    menu.open([entry('sell', { enabled: false, hint: CONTRACTS_HINT, run })], CTX, { x: 0, y: 0 });
    expect(rows(menu)[0].querySelector('.bank-menu-hint')?.textContent).toBe(CONTRACTS_HINT);
    rows(menu)[0].click();
    expect(run).not.toHaveBeenCalled();
    expect(menu.isOpen()).toBe(true);
  });

  it('runs an enabled row with the context and closes', () => {
    const run = vi.fn();
    const menu = mount();
    menu.open([entry('sell', { run })], CTX, { x: 0, y: 0 });
    rows(menu)[0].click();
    expect(run).toHaveBeenCalledWith(CTX);
    expect(menu.isOpen()).toBe(false);
  });

  it('Cancel just closes', () => {
    const menu = mount();
    menu.open([entry('sell')], CTX, { x: 0, y: 0 });
    menu.el.querySelector<HTMLElement>('[data-bank-menu-entry="cancel"]')!.click();
    expect(menu.isOpen()).toBe(false);
  });

  it('is a menu, focuses the first enabled row and wraps with the arrow keys', () => {
    const menu = mount();
    menu.open([entry('a', { enabled: false }), entry('b'), entry('c')], CTX, { x: 0, y: 0 });
    expect(menu.el.getAttribute('role')).toBe('menu');
    expect(document.activeElement).toBe(rows(menu)[1]);
    menu.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(rows(menu)[2]);
    menu.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    // Past the last row it wraps to Cancel, then round to the first enabled row.
    expect(document.activeElement).toBe(rows(menu)[3]);
    menu.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(rows(menu)[1]);
  });

  it('closes on Escape and on a click outside', () => {
    const menu = mount();
    menu.open([entry('a')], CTX, { x: 0, y: 0 });
    menu.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.isOpen()).toBe(false);
    menu.open([entry('a')], CTX, { x: 0, y: 0 });
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(menu.isOpen()).toBe(false);
  });

  it('opening again replaces the previous menu rather than stacking one', () => {
    const menu = mount();
    menu.open([entry('a')], CTX, { x: 0, y: 0 });
    menu.open([entry('b')], CTX, { x: 0, y: 0 });
    expect(document.querySelectorAll('#bank-menu')).toHaveLength(1);
    expect(rows(menu).map(r => r.dataset.bankMenuEntry)).toEqual(['b', 'cancel']);
  });

  it('positions itself at the pointer', () => {
    const menu = mount();
    menu.open([entry('a')], CTX, { x: 120, y: 44 });
    expect(menu.el.style.left).toBe('120px');
    expect(menu.el.style.top).toBe('44px');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run src/bank/contextMenu.test.ts`
Expected: FAIL - `Failed to resolve import "./contextMenu"`.

- [ ] **Step 3: Write contextMenu.ts**

Rules:

- `createMenuRegistry()` keeps an array; `register` replaces in place when the id already exists, otherwise appends.
- `contractsStubs()` returns the two entries above, both `enabled: false`, `hint: CONTRACTS_HINT`, `run: () => {}`. The bank module never imports anything from SP9; SP9 registers over them.
- `createBankMenu({ host })` owns one detached `#bank-menu` element, appended to `host` on `open` and removed on `close`.
- `open(rows, ctx, at)` closes any open menu first, resolves each row's `label`/`enabled` against `ctx`, appends a `cancel` row, positions with `style.left`/`style.top` clamped so the menu stays inside `host.getBoundingClientRect()` (skip the clamp when the host has no size, which is jsdom), and focuses the first enabled row.
- Keyboard: `ArrowDown`/`ArrowUp` wrap over enabled rows plus Cancel, `Home`/`End` jump, `Enter`/`Space` activate, `Escape` closes. A disabled row is never focusable (`tabindex="-1"`, `aria-disabled="true"`) and never runs.
- A `pointerdown` on `document` outside the menu closes it. The listener is added on open and removed on close, so a closed menu holds nothing.
- `close()` restores focus to whatever had it when `open` was called, so keyboard users are not dumped at the top of the document.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run src/bank/contextMenu.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/bank/contextMenu.ts web/src/bank/contextMenu.test.ts
git commit -F - <<'MSG'
feat(bank): OSRS-style right-click menu with registrable Contracts entries

Sell... and Buy more... ship disabled with "Contracts coming soon"; SP9 replaces
them by re-registering the same ids, so the bank never imports Contracts. Move
to tab is flattened to one entry per tab rather than a submenu, and the 274
client cache has no tradeable flag so Sell is not greyed out per item in v1.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
MSG
```

---

### Task 12: The bank window - chrome, bottom bar, search, sort helpers, focus and Escape

This composes Tasks 6 to 11 into one window and owns the pieces that only make sense there: the title bar and capacity counter, the OSRS parity controls, the search box, the composed menus (including the per-tab **sort helpers**, which owner decision 3 keeps in the web UI and out of the game client), and focus handling.

**Files:**
- Create: `web/src/bank/bottomBar.ts`, `web/src/bank/view.ts`
- Test: `web/src/bank/bottomBar.test.ts`, `web/src/bank/view.test.ts`

**Interfaces:**
- Consumes: `BankStore`/`BankState` (6), `IconCache` (7), `createBankGrid` (8), `attachGridInput` (9), `createBankTabs` (10), `createBankMenu`/`BankMenuRegistry` (11), `MAX_TABS`/`MenuEntry`/`ObjInfo`/`Quantity`/`RearrangeMode`/`WithdrawAs` (2), `h` from `../ui/el`.
- Produces, `web/src/bank/bottomBar.ts`:
  ```ts
  export interface BottomBarDeps {
    mode(): RearrangeMode;
    setMode(mode: RearrangeMode): void;
    withdrawAs(): WithdrawAs;
    setWithdrawAs(as: WithdrawAs): void;
    quantity(): Quantity;
    setQuantity(quantity: Quantity): void;
    search(): string;
    setSearch(text: string): void;
  }
  export interface BottomBar { el: HTMLElement; render(): void }
  export function createBottomBar(deps: BottomBarDeps): BottomBar;
  /** Owner decision 1: the web bank never deposits. The buttons stay for parity, disabled. */
  export const DEPOSIT_HINT = 'Deposit from a character in game';
  ```
- Produces, `web/src/bank/view.ts`:
  ```ts
  export interface BankWindowDeps {
    store: BankStore;
    icons: IconCache;
    info(obj: number): ObjInfo | null;
    registry: BankMenuRegistry;
    notify(message: string, kind?: 'info' | 'error'): void;
    /** The window closed itself (the x, or Escape); the plugin closes its panel. */
    onClose(): void;
    /** Per-window persistence for the parity controls. Defaults to localStorage. */
    storage?: { get(key: string): string | null; set(key: string, value: string): void };
  }
  export interface BankWindow { el: HTMLElement; open(): void; close(): void; isOpen(): boolean; destroy(): void }
  export function createBankWindow(host: HTMLElement, deps: BankWindowDeps): BankWindow;
  export const BANK_TITLE = 'The Bank of Gielinor';
  ```
- DOM contract (the e2e spec depends on all of it): `#bank-window[role=dialog][aria-label="The Bank of Gielinor"]`, `#bank-capacity`, `#bank-live`, `#bank-close`, `#bank-status[role=status][aria-live=polite]`, `#bank-mode-swap`, `#bank-mode-insert`, `#bank-as-item`, `#bank-as-note`, `#bank-qty-1`, `#bank-qty-5`, `#bank-qty-10`, `#bank-qty-x`, `#bank-qty-all`, `#bank-search-toggle`, `#bank-search`, `#bank-deposit-inv`, `#bank-deposit-worn`.

- [ ] **Step 1: Write the failing bottom-bar test**

```ts
// web/src/bank/bottomBar.test.ts
import { describe, expect, it } from 'vitest';
import { DEPOSIT_HINT, createBottomBar } from './bottomBar';
import type { Quantity, RearrangeMode, WithdrawAs } from './types';

function mount() {
  let mode: RearrangeMode = 'swap';
  let withdrawAs: WithdrawAs = 'item';
  let quantity: Quantity = 1;
  let search = '';
  const bar = createBottomBar({
    mode: () => mode, setMode: next => { mode = next; bar.render(); },
    withdrawAs: () => withdrawAs, setWithdrawAs: next => { withdrawAs = next; bar.render(); },
    quantity: () => quantity, setQuantity: next => { quantity = next; bar.render(); },
    search: () => search, setSearch: next => { search = next; }
  });
  document.body.appendChild(bar.el);
  bar.render();
  return { bar, read: () => ({ mode, withdrawAs, quantity, search }) };
}

const byId = (id: string): HTMLElement => document.getElementById(id)!;

describe('the bottom bar', () => {
  it('offers the OSRS parity controls', () => {
    mount();
    for (const id of ['bank-mode-swap', 'bank-mode-insert', 'bank-as-item', 'bank-as-note', 'bank-qty-1', 'bank-qty-5', 'bank-qty-10', 'bank-qty-x', 'bank-qty-all', 'bank-search-toggle', 'bank-deposit-inv', 'bank-deposit-worn']) {
      expect(byId(id)).not.toBeNull();
    }
  });

  it('marks the current rearrange mode and switches it', () => {
    const { read } = mount();
    expect(byId('bank-mode-swap').getAttribute('aria-pressed')).toBe('true');
    byId('bank-mode-insert').click();
    expect(read().mode).toBe('insert');
    expect(byId('bank-mode-insert').getAttribute('aria-pressed')).toBe('true');
    expect(byId('bank-mode-swap').getAttribute('aria-pressed')).toBe('false');
  });

  it('switches the withdraw form and the quantity', () => {
    const { read } = mount();
    byId('bank-as-note').click();
    byId('bank-qty-all').click();
    expect(read().withdrawAs).toBe('note');
    expect(read().quantity).toBe('all');
  });

  it('leaves both deposit buttons disabled with the reason (owner decision 1)', () => {
    mount();
    for (const id of ['bank-deposit-inv', 'bank-deposit-worn']) {
      const button = byId(id) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(button.title).toBe(DEPOSIT_HINT);
    }
  });

  it('reveals the search box on the magnifier and reports what is typed', () => {
    const { read } = mount();
    expect(document.getElementById('bank-search')).toBeNull();
    byId('bank-search-toggle').click();
    const input = byId('bank-search') as HTMLInputElement;
    input.value = 'Coin';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(read().search).toBe('coin');
  });

  it('hides the box again and clears the filter', () => {
    const { read } = mount();
    byId('bank-search-toggle').click();
    const input = byId('bank-search') as HTMLInputElement;
    input.value = 'coin';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    byId('bank-search-toggle').click();
    expect(document.getElementById('bank-search')).toBeNull();
    expect(read().search).toBe('');
  });
});
```

- [ ] **Step 2: Write the failing window test**

```ts
// web/src/bank/view.test.ts
import { describe, expect, it, vi } from 'vitest';
import { BANK_TITLE, createBankWindow } from './view';
import { createMenuRegistry, contractsStubs } from './contextMenu';
import type { BankState, BankStore } from './store';
import type { IconCache } from './icons';
import type { BankOp, ObjInfo } from './types';

const INFO: Record<number, ObjInfo> = {
  995: { name: 'Coins', examine: 'Lovely money!', cost: 1, stackable: true, noted: false },
  1038: { name: 'Red partyhat', examine: 'A nice hat.', cost: 1, stackable: false, noted: false }
};

function fakeStore(over: Partial<BankState> = {}) {
  const items = new Array(240).fill(null);
  items[0] = { slot: 0, obj: 995, count: 500 };
  items[1] = { slot: 1, obj: 1038, count: 1 };
  let state: BankState = { version: 3, capacity: 240, tabs: [], items, used: 2, loading: false, live: true, pending: 0, error: null, ...over };
  const listeners = new Set<(s: BankState) => void>();
  const submitted: BankOp[] = [];
  const calls = { start: 0, stop: 0 };
  const store: BankStore = {
    state: () => state,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    start: () => { calls.start++; },
    stop: () => { calls.stop++; },
    refresh: async () => {},
    submit: op => { submitted.push(op); },
    flush: async () => {}
  };
  return { store, submitted, calls, push(next: Partial<BankState>) { state = { ...state, ...next }; for (const fn of listeners) fn(state); } };
}

const icons: IconCache = { peek: () => null, load: async () => null, prime: async () => {}, onChange: () => () => {} };

function mount(over: Partial<BankState> = {}) {
  document.body.innerHTML = '';
  const host = document.createElement('div');
  document.body.appendChild(host);
  const fake = fakeStore(over);
  const registry = createMenuRegistry();
  for (const stub of contractsStubs()) registry.register(stub);
  const onClose = vi.fn();
  const notify = vi.fn();
  const store: Record<string, string> = {};
  const win = createBankWindow(host, {
    store: fake.store, icons, info: obj => INFO[obj] ?? null, registry, notify, onClose,
    storage: { get: key => store[key] ?? null, set: (key, value) => { store[key] = value; } }
  });
  return { win, fake, onClose, notify, registry };
}

const byId = (id: string): HTMLElement => document.getElementById(id)!;
const menuRows = (): string[] => Array.from(document.querySelectorAll<HTMLElement>('#bank-menu [data-bank-menu-entry]')).map(r => r.dataset.bankMenuEntry!);
const rightClick = (el: Element): void => { el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 })); };

describe('opening and closing', () => {
  it('is a labelled dialog carrying the OSRS title', () => {
    const { win } = mount();
    win.open();
    expect(byId('bank-window').getAttribute('role')).toBe('dialog');
    expect(byId('bank-window').getAttribute('aria-label')).toBe(BANK_TITLE);
    expect(byId('bank-window').textContent).toContain(BANK_TITLE);
  });

  it('starts the store on open and stops it on close', () => {
    const { win, fake } = mount();
    win.open();
    expect(fake.calls.start).toBe(1);
    expect(win.isOpen()).toBe(true);
    win.close();
    expect(fake.calls.stop).toBe(1);
    expect(win.isOpen()).toBe(false);
  });

  it('closes on the x and on Escape, telling the shell each time', () => {
    const { win, onClose } = mount();
    win.open();
    byId('bank-close').click();
    expect(onClose).toHaveBeenCalledTimes(1);
    win.open();
    byId('bank-window').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(win.isOpen()).toBe(false);
  });

  it('moves focus into the window on open and gives it back on close', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { win } = mount();
    win.open();
    expect(byId('bank-window').contains(document.activeElement)).toBe(true);
    win.close();
    expect(document.activeElement).toBe(document.body);
  });
});

describe('the chrome', () => {
  it('shows used against capacity and follows the store', () => {
    const { win, fake } = mount();
    win.open();
    expect(byId('bank-capacity').textContent).toBe('2 / 240');
    fake.push({ used: 7 });
    expect(byId('bank-capacity').textContent).toBe('7 / 240');
  });

  it('says whether live updates are connected', () => {
    const { win, fake } = mount();
    win.open();
    expect(byId('bank-live').textContent).toBe('live');
    fake.push({ live: false });
    expect(byId('bank-live').textContent).toBe('polling');
  });

  it('shows a load error instead of pretending the bank is empty', () => {
    const { win, fake } = mount();
    win.open();
    fake.push({ error: 'The bank is not reachable right now. Try again in a moment.' });
    expect(byId('bank-window').textContent).toContain('not reachable');
  });
});

describe('reordering', () => {
  it('sends a swap in swap mode and an insert in insert mode', () => {
    const { win, fake } = mount();
    win.open();
    const cells = Array.from(document.querySelectorAll<HTMLElement>('[data-bank-slot]'));
    cells[0].focus();
    cells[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    cells[3].focus();
    cells[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(fake.submitted).toEqual([{ op: 'swap', a: 0, b: 3 }]);

    byId('bank-mode-insert').click();
    cells[0].focus();
    cells[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    cells[2].focus();
    cells[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(fake.submitted[1]).toEqual({ op: 'insert', from: 0, to: 2 });
  });

  it('remembers the rearrange mode across a close and reopen', () => {
    const { win } = mount();
    win.open();
    byId('bank-mode-insert').click();
    win.close();
    win.open();
    expect(byId('bank-mode-insert').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('the item menu', () => {
  it('is Contracts entries, then one Move to tab per tab, then Examine, then Cancel', () => {
    const { win } = mount({ tabs: [1] });
    win.open();
    rightClick(document.querySelector('[data-bank-slot="1"]')!);
    expect(menuRows()).toEqual(['sell', 'buy', 'move-to-tab-1', 'move-to-new-tab', 'examine', 'cancel']);
  });

  it('offers no new tab once nine exist', () => {
    const { win } = mount({ tabs: [1, 1, 1, 1, 1, 1, 1, 1, 1], used: 9 });
    win.open();
    rightClick(document.querySelector('[data-bank-slot="1"]')!);
    expect(menuRows()).not.toContain('move-to-new-tab');
  });

  it('submits a moveToTab from the menu', () => {
    const { win, fake } = mount({ tabs: [1] });
    win.open();
    rightClick(document.querySelector('[data-bank-slot="1"]')!);
    document.querySelector<HTMLElement>('[data-bank-menu-entry="move-to-tab-1"]')!.click();
    expect(fake.submitted).toEqual([{ op: 'moveToTab', slot: 1, tab: 1 }]);
  });

  it('asks for the next tab index when Move to new tab is chosen', () => {
    const { win, fake } = mount({ tabs: [1] });
    win.open();
    rightClick(document.querySelector('[data-bank-slot="1"]')!);
    document.querySelector<HTMLElement>('[data-bank-menu-entry="move-to-new-tab"]')!.click();
    expect(fake.submitted).toEqual([{ op: 'moveToTab', slot: 1, tab: 2 }]);
  });

  it('examines into the status line rather than a chat box', () => {
    const { win } = mount();
    win.open();
    rightClick(document.querySelector('[data-bank-slot="0"]')!);
    document.querySelector<HTMLElement>('[data-bank-menu-entry="examine"]')!.click();
    expect(byId('bank-status').textContent).toBe('Lovely money!');
  });

  it('lets SP9 take the Sell entry over by re-registering the id', () => {
    const { win, registry } = mount();
    const sell = vi.fn();
    registry.register({ id: 'sell', label: 'Sell...', enabled: true, run: sell });
    win.open();
    rightClick(document.querySelector('[data-bank-slot="0"]')!);
    document.querySelector<HTMLElement>('[data-bank-menu-entry="sell"]')!.click();
    expect(sell).toHaveBeenCalledWith({ slot: 0, obj: 995, count: 500, info: INFO[995] });
  });
});

describe('the tab menu and the web-only sort helpers (owner decision 3)', () => {
  it('offers sort by value, name and id on a tab', () => {
    const { win } = mount({ tabs: [2] });
    win.open();
    rightClick(document.querySelector('[data-bank-tab="1"]')!);
    expect(menuRows()).toEqual(['sort-value', 'sort-name', 'sort-id', 'cancel']);
  });

  it('submits the sort op for that tab', () => {
    const { win, fake } = mount({ tabs: [2] });
    win.open();
    rightClick(document.querySelector('[data-bank-tab="1"]')!);
    document.querySelector<HTMLElement>('[data-bank-menu-entry="sort-value"]')!.click();
    expect(fake.submitted).toEqual([{ op: 'sort', tab: 1, by: 'value' }]);
  });

  it('sorts the main tab from the All items tab', () => {
    const { win, fake } = mount({ tabs: [2] });
    win.open();
    rightClick(document.querySelector('[data-bank-tab="0"]')!);
    document.querySelector<HTMLElement>('[data-bank-menu-entry="sort-name"]')!.click();
    expect(fake.submitted).toEqual([{ op: 'sort', tab: 0, by: 'name' }]);
  });
});

describe('search', () => {
  it('dims what does not match', () => {
    const { win } = mount();
    win.open();
    byId('bank-search-toggle').click();
    const input = byId('bank-search') as HTMLInputElement;
    input.value = 'partyhat';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelector('[data-bank-slot="0"]')!.classList.contains('dim')).toBe(true);
    expect(document.querySelector('[data-bank-slot="1"]')!.classList.contains('dim')).toBe(false);
  });
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `cd web && npx vitest run src/bank/bottomBar.test.ts src/bank/view.test.ts`
Expected: FAIL - `Failed to resolve import "./bottomBar"` and `"./view"`.

- [ ] **Step 4: Write bottomBar.ts and view.ts**

`bottomBar.ts`: build the row with `h()`; every control is a `button[aria-pressed]` except the search input; the magnifier toggles the input in and out and clears the filter on the way out; both deposit buttons are `disabled` with `title = DEPOSIT_HINT` and the accessible name "Deposit inventory" / "Deposit worn items"; `setSearch` receives the value already lower-cased.

`view.ts`: build the window once in the factory, keep it detached until `open()`.

- `open()`: append to `host`, remember `document.activeElement`, `deps.store.start()`, subscribe, render, focus the first grid cell.
- `close()`: unsubscribe, `deps.store.stop()`, remove from `host`, restore focus, `deps.onClose()`. Guard against re-entry so the x and Escape cannot both fire it.
- Parity controls read and write through `deps.storage ?? localStorage` under `cs.bank.mode`, `cs.bank.as` and `cs.bank.qty`.
- `render(state)` updates `#bank-capacity` (`${state.used} / ${state.capacity}`), `#bank-live` (`live` when `state.live`, `polling` otherwise), the error block, then `tabs.render(state)` and `grid.render(state)`.
- The item menu is composed as `[...deps.registry.entries(), ...moveEntries, examineEntry]` where `moveEntries` is one `move-to-tab-${n}` per existing tab excluding the item's own tab plus `move-to-new-tab` while `state.tabs.length < MAX_TABS`, and `examine` writes `info.examine ?? info.name` into `#bank-status`.
- The tab menu is `sort-value`, `sort-name`, `sort-id`, each submitting `{ op: 'sort', tab, by }`. This is the whole of owner decision 3: the helpers exist here and nowhere near the game client.
- `attachGridInput` is wired with `mode()` from the bottom bar, `onMove` mapping to `swap` or `insert`, `onDropOnTab` mapping `'new'` to `state.tabs.length + 1`, `tabAt: tabs.tabAt`, `hitTest: (x, y) => document.elementFromPoint(x, y)`, and `announce` writing into `#bank-status`.
- Keep each file under 400 lines; if `view.ts` grows past it, move the menu composition into `web/src/bank/menus.ts` exporting `itemMenuRows(state, registry, submit, announce)` and `tabMenuRows(tab, submit)`.

- [ ] **Step 5: Run both tests to verify they pass**

Run: `cd web && npx vitest run src/bank/ && npm run typecheck && npm run lint`
Expected: PASS across the whole bank package.

- [ ] **Step 6: Commit**

```bash
git add web/src/bank/bottomBar.ts web/src/bank/bottomBar.test.ts web/src/bank/view.ts web/src/bank/view.test.ts
git commit -F - <<'MSG'
feat(bank): the bank window, its parity controls and the web-only sort helpers

Title bar, capacity counter, live badge, the OSRS rearrange and withdraw
controls with both deposit buttons disabled and explained (owner decision 1),
search dimming, the composed item and tab menus, and per-tab sort by value, name
or id, which stay in the web UI and never reach the game client (decision 3).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
MSG
```

---

### Task 13: The 2007scape look, on the design system

The frame is drawn with CSS only: borders, gradients and the design tokens. **No Jagex art is vendored**; the only pixels that come from the cache are the item icons the running client rasterises (Task 1). Colours follow spec section 3: a stone header with the gold title, a `#3e3529` interior, 36 px slots on a 48 x 36 px pitch, eight columns.

**Files:**
- Create: `web/src/styles/bank.css`
- Test: `web/src/styles/bank.test.ts`
- Modify: `web/src/styles/index.css`, `web/styleguide.html`, `web/src/styleguide.ts`

**Interfaces:**
- Consumes: the tokens in `web/src/styles/tokens.css` (`--rl-*`, `--sp-*`, `--fs-*`, `--z-dialog`, `--focus-ring`, `--font-pixel`) and every class name the view emits (Tasks 8 to 12).
- Produces: no TypeScript surface. The class contract is what Tasks 8 to 12 already emit; this task makes it visible, and the test pins that neither half can drift.

- [ ] **Step 1: Write the failing stylesheet test**

```ts
// web/src/styles/bank.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string): string => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

describe('bank.css', () => {
  const css = read('bank.css');

  it('is imported by the app stylesheet', () => {
    expect(read('index.css')).toContain("@import './bank.css';");
  });

  it('styles every class the bank view emits', () => {
    for (const selector of [
      '.bank-window', '.bank-title', '.bank-capacity', '.bank-live', '.bank-close',
      '.bank-tabs', '.bank-tab', '.bank-tab.active', '.bank-tab-new',
      '.bank-pane', '.bank-row', '.bank-slot', '.bank-icon', '.bank-fallback',
      '.bank-count', '.count-yellow', '.count-white', '.count-green',
      '.bank-divider', '.bank-empty', '.bank-status',
      '.bank-bottom', '.bank-ctl', '.bank-menu', '.bank-menu-hint',
      '.bank-slot.dim', '.bank-pane.is-dragging', '.bank-slot.is-source', '.bank-slot.is-target', '.bank-slot.is-held'
    ]) {
      expect(css, `${selector} has no rule`).toContain(selector);
    }
  });

  it('lays the pane out in exactly eight columns', () => {
    expect(css).toMatch(/grid-template-columns:\s*repeat\(8,/);
  });

  it('takes its colours from the design tokens, not from raw hex, apart from the OSRS palette', () => {
    // The four OSRS-specific colours are allowed; everything else must be a token.
    const hexes = new Set(css.match(/#[0-9a-fA-F]{3,8}/g) ?? []);
    const allowed = new Set(['#3e3529', '#4d4436', '#2b2419', '#ffcc33', '#ffff00', '#ffffff', '#00ff80']);
    expect([...hexes].filter(hex => !allowed.has(hex.toLowerCase()))).toEqual([]);
  });

  it('keeps the window under the dialog layer so a confirm still covers it', () => {
    expect(css).toContain('z-index: calc(var(--z-dialog) - 1)');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run src/styles/bank.test.ts`
Expected: FAIL - `ENOENT` on `bank.css`.

- [ ] **Step 3: Write bank.css and import it**

Write `web/src/styles/bank.css` covering the selectors above. The load-bearing rules:

```css
/* The bank window: an OSRS bank drawn with CSS over the game stage. No Jagex art is vendored;
   the only cache pixels here are the item icons the running client rasterises. */
.bank-window {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(432px, calc(100% - 24px)); max-height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: #3e3529; color: rgb(var(--rl-strong));
  border: 2px solid #2b2419; border-radius: var(--radius);
  box-shadow: 0 12px 40px rgba(0, 0, 0, .55);
  /* Under a confirm dialog, over the game canvas and the plugin overlays. */
  z-index: calc(var(--z-dialog) - 1);
}
.bank-title { background: linear-gradient(#4d4436, #3e3529); color: #ffcc33; text-align: center; }
.bank-pane { display: grid; grid-template-columns: repeat(8, 48px); overflow-y: auto; }
.bank-slot { width: 48px; height: 36px; }
.bank-count { font-family: var(--font-pixel); font-size: var(--fs-xs); }
.count-yellow { color: #ffff00; } .count-white { color: #ffffff; } .count-green { color: #00ff80; }
.bank-slot.dim { opacity: .3; }
.bank-slot:focus-visible, .bank-tab:focus-visible, .bank-ctl:focus-visible { outline: none; box-shadow: var(--focus-ring); }
@media (prefers-reduced-motion: reduce) { .bank-window, .bank-slot { transition: none; } }
```

plus the rest of the selectors the test lists. Add `@import './bank.css';` to `web/src/styles/index.css` after `dialog.css`.

- [ ] **Step 4: Add a styleguide section**

`web/styleguide.html`: a "Bank" section showing a static window shell, one row of eight slots with each count tone, a tab bar with an active tab and a plus tab, and an open menu with one disabled row and its hint. Mark it up with the same classes so the sheet is exercised. `web/src/styleguide.ts`: wire the demo tab bar's clicks to move the `active` class, the same way the existing strip demo does.

- [ ] **Step 5: Run the test and look at the page**

Run: `cd web && npx vitest run src/styles/bank.test.ts && npm run typecheck && npm run lint && npm run build:e2e`
Then: `cd web && npx vite preview --port 4173` and open `http://localhost:4173/styleguide.html`; check the bank section in a narrow and a wide viewport and confirm the focus ring is visible on a slot, a tab and a control.
Expected: PASS, and the section renders.

- [ ] **Step 6: Commit**

```bash
git add web/src/styles/bank.css web/src/styles/bank.test.ts web/src/styles/index.css web/styleguide.html web/src/styleguide.ts
git commit -F - <<'MSG'
feat(bank): 2007scape styling on the design tokens, plus a styleguide section

Borders and gradients only: nothing Jagex-owned is vendored, and the only cache
pixels are the item icons the running client draws. A test pins that every class
the view emits has a rule and that the pane really is eight columns.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
MSG
```

---

### Task 14: The `bank` shell plugin and the shell wiring

**Files:**
- Create: `web/src/plugins/builtin/bank.ts`, `web/src/plugins/builtin/bank.test.ts`
- Modify: `web/src/types.ts` (`PanelId`), `web/src/partials/frame.html` (the host element), `web/src/styles/bank.css` (the host's rules), `web/src/main.ts` (construction and registration)

**Interfaces:**
- Consumes: `ShellPlugin`/`definePlugin` (`web/src/plugins/types.ts`); `PanelView` (`web/src/frame/panels.ts`); `BankStore`/`BankState` (6); `BankWindow` (12); `h`, `kv`, `alert` (`web/src/ui/el.ts`).
- Produces:
  ```ts
  export interface BankPluginDeps {
    /** The one window instance the shell owns; the plugin never builds it. */
    window(): BankWindow;
    store: BankStore;
    /** The window and the side panel open and close together. */
    closePanel(): void;
  }
  export function createBankPlugin(deps: BankPluginDeps): ShellPlugin;
  ```
  `PanelId` in `web/src/types.ts` gains `'bank'`.
  `web/src/partials/frame.html` gains, inside `#canvas-wrap` after `#plugin-overlays`:
  ```html
  <!-- The bank window mounts here (SP8b): a centred window over the stage, not a side panel. -->
  <div id="bank-host" class="bank-host"></div>
  ```
  and `web/src/styles/bank.css` gains `.bank-host { position: absolute; inset: 0; pointer-events: none; }` with `.bank-window { pointer-events: auto; }`, plus `.bank-host` in `bank.test.ts`'s selector list.

- [ ] **Step 1: Write the failing plugin test**

```ts
// web/src/plugins/builtin/bank.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createBankPlugin } from './bank';
import type { BankState, BankStore } from '../../bank/store';
import type { BankWindow } from '../../bank/view';

function fakeStore(over: Partial<BankState> = {}) {
  let state: BankState = { version: 3, capacity: 240, tabs: [2], items: new Array(240).fill(null), used: 5, loading: false, live: true, pending: 0, error: null, ...over };
  const listeners = new Set<(s: BankState) => void>();
  const store: BankStore = {
    state: () => state,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    start: () => {}, stop: () => {}, refresh: async () => {}, submit: () => {}, flush: async () => {}
  };
  return { store, push(next: Partial<BankState>) { state = { ...state, ...next }; for (const fn of listeners) fn(state); } };
}

function fakeWindow() {
  let open = false;
  const calls = { open: 0, close: 0 };
  const win = { el: document.createElement('div'), open: () => { open = true; calls.open++; }, close: () => { open = false; calls.close++; }, isOpen: () => open, destroy: () => {} } as BankWindow;
  return { win, calls };
}

function mount(over: Partial<BankState> = {}) {
  document.body.innerHTML = '';
  const body = document.createElement('div');
  document.body.appendChild(body);
  const store = fakeStore(over);
  const window_ = fakeWindow();
  const closePanel = vi.fn();
  const plugin = createBankPlugin({ window: () => window_.win, store: store.store, closePanel });
  const view = plugin.panel!({} as never);
  return { plugin, view, body, store, window_, closePanel };
}

describe('the bank plugin', () => {
  it('is a shell plugin on by default with its own strip icon', () => {
    const { plugin } = mount();
    expect(plugin.manifest).toMatchObject({ id: 'bank', name: 'Bank', tier: 'shell', defaultEnabled: true });
    expect(plugin.manifest.icon.length).toBeGreaterThan(0);
    expect(plugin.manifest.alwaysOn).toBeUndefined();
  });

  it('opens the window when its panel is opened and closes it on unmount', () => {
    const { view, body, window_ } = mount();
    view.mount(body);
    expect(window_.calls.open).toBe(1);
    view.unmount?.();
    expect(window_.calls.close).toBe(1);
  });

  it('summarises the bank and follows the store', () => {
    const { view, body, store } = mount();
    view.mount(body);
    expect(body.textContent).toContain('5 / 240');
    expect(body.textContent).toContain('1 tab');
    store.push({ used: 9, tabs: [2, 2] });
    expect(body.textContent).toContain('9 / 240');
    expect(body.textContent).toContain('2 tabs');
  });

  it('says plainly that the web bank never moves items (owner decision 1)', () => {
    const { view, body } = mount();
    view.mount(body);
    expect(body.textContent).toContain('Items only move in and out of the bank in game.');
  });

  it('reopens the window from the panel after the player closed it', () => {
    const { view, body, window_ } = mount();
    view.mount(body);
    window_.win.close();
    body.querySelector<HTMLButtonElement>('#bank-panel-open')!.click();
    expect(window_.calls.open).toBe(2);
  });

  it('shows the live state and a load error', () => {
    const { view, body, store } = mount();
    view.mount(body);
    expect(body.textContent).toContain('live');
    store.push({ live: false, error: 'The bank is not reachable right now. Try again in a moment.' });
    expect(body.textContent).toContain('polling');
    expect(body.textContent).toContain('not reachable');
  });

  it('unsubscribes on unmount so a closed panel stops re-rendering', () => {
    const { view, body, store } = mount();
    view.mount(body);
    view.unmount?.();
    store.push({ used: 40 });
    expect(body.textContent).not.toContain('40 / 240');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run src/plugins/builtin/bank.test.ts`
Expected: FAIL - `Failed to resolve import "./bank"`.

- [ ] **Step 3: Write the plugin**

```ts
// web/src/plugins/builtin/bank.ts -- the Bank panel and the window it opens.
//
// The window is not a side panel: eight columns need about 420 px, so it is a centred window
// over the stage (spec section 3) mounted into #bank-host. The panel is its handle: opening it
// opens the window, closing it closes the window, and the body summarises what the window shows
// so the state is legible even when the window is behind something.
import { alert, h, kv } from '../../ui/el';
import { definePlugin, type ShellPlugin } from '../types';
import type { BankState, BankStore } from '../../bank/store';
import type { BankWindow } from '../../bank/view';

export interface BankPluginDeps {
  window(): BankWindow;
  store: BankStore;
  closePanel(): void;
}

const NO_DEPOSIT = 'Items only move in and out of the bank in game.';

export function createBankPlugin(deps: BankPluginDeps): ShellPlugin {
  return definePlugin({
    manifest: {
      id: 'bank', name: 'Bank', icon: '🏦', tier: 'shell',
      description: 'Your account bank: view, re-order and sort. Shared by every character.',
      defaultEnabled: true
    },
    panel: () => {
      let body: HTMLElement | null = null;
      let unsubscribe: (() => void) | null = null;

      function render(state: BankState): void {
        if (!body) return;
        const tabs = state.tabs.length === 1 ? '1 tab' : `${state.tabs.length} tabs`;
        body.replaceChildren(
          kv('Used', `${state.used} / ${state.capacity}`, { num: true }),
          kv('Tabs', tabs),
          kv('Updates', state.live ? 'live' : 'polling'),
          h('button', { class: 'p-btn p-btn-primary', id: 'bank-panel-open', type: 'button', onclick: () => deps.window().open() }, 'Open bank window'),
          alert(NO_DEPOSIT, { tone: 'info' }),
          state.error ? alert(state.error, { tone: 'error' }) : null
        );
      }

      return {
        title: 'Bank',
        mount(el: HTMLElement) {
          body = el;
          unsubscribe = deps.store.subscribe(render);
          deps.window().open();
          render(deps.store.state());
        },
        unmount() {
          unsubscribe?.();
          unsubscribe = null;
          body = null;
          deps.window().close();
        }
      };
    }
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run src/plugins/builtin/bank.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into the shell**

`web/src/types.ts`: `PanelId` becomes `'xp' | 'loot' | 'connect' | 'account' | 'config' | 'plugins' | 'characters' | 'tasks' | 'marketplace' | 'bank'`.

`web/src/partials/frame.html`: add `<div id="bank-host" class="bank-host"></div>` inside `#canvas-wrap`, after `#plugin-overlays`.

`web/src/styles/bank.css`: add `.bank-host { position: absolute; inset: 0; pointer-events: none; z-index: calc(var(--z-dialog) - 1); }` and `.bank-window { pointer-events: auto; }`; add `.bank-host` to the selector list in `web/src/styles/bank.test.ts`.

`web/src/main.ts`, after the existing plugin registrations:

```ts
// SP8b: one bank per ACCOUNT. The icon cache and the obj facts come from whichever character
// frame is in front; the bank itself does not care which, because it is keyed by the uid.
const bankMenu = createMenuRegistry();
for (const stub of contractsStubs()) bankMenu.register(stub);
const bankObjInfo = (obj: number): ObjInfo | null => stage.sessions.active()?.hooks?.getObjInfo(obj) ?? null;
const bankIcons = createIconCache({ client: () => stage.sessions.active()?.hooks ?? null });
const bankStore = createBankStore({
  api: createBankApi({ idToken: currentIdToken }),
  createStream: handlers => createBankStream({ idToken: currentIdToken, ...handlers }),
  info: bankObjInfo,
  notify: (message, kind) => notify(message, kind === 'error' ? 'error' : 'info')
});
const bankWindow = createBankWindow(byId('bank-host'), {
  store: bankStore, icons: bankIcons, info: bankObjInfo, registry: bankMenu,
  notify: (message, kind) => notify(message, kind === 'error' ? 'error' : 'info'),
  // Escape and the x close the window; the panel that opened it must follow.
  onClose: () => panelCtl.close()
});
shell.register(createBankPlugin({ window: () => bankWindow, store: bankStore, closePanel: () => panelCtl.close() }));
```

with the matching imports (`createBankApi`, `createBankStream`, `createBankStore`, `createIconCache`, `createBankWindow`, `createMenuRegistry`, `contractsStubs`, `createBankPlugin`, and `type ObjInfo` from `./clientTypes`).

Note for the reviewer: with no character frame open, `bankObjInfo` returns null and `getObjIcon` is unavailable, so the pane shows persisted icons from IndexedDB and a bare slot where it has none. That is the documented degraded state, not a bug; the bank itself still loads, because it is read over HTTP from the uid.

- [ ] **Step 6: Verify the whole web package**

Run: `cd web && npm run typecheck && npm run lint && npx vitest run && npm run build:e2e`
Expected: PASS, and the build emits with no new warnings.

- [ ] **Step 7: Commit**

```bash
git add web/src/plugins/builtin/bank.ts web/src/plugins/builtin/bank.test.ts web/src/types.ts web/src/partials/frame.html web/src/styles/bank.css web/src/styles/bank.test.ts web/src/main.ts
git commit -F - <<'MSG'
feat(bank): register the Bank plugin and mount its window over the stage

The panel is the window's handle: opening it opens the window, closing it closes
the window, and the body summarises capacity, tabs and whether updates are live.
The window mounts into a new #bank-host inside the canvas wrapper, because eight
columns do not fit a side panel.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
MSG
```

---

### Task 15: Playwright coverage against the live stack

**Files:**
- Create: `web/e2e/bank-ui.pw.test.ts`
- Modify: `web/e2e/helpers.ts` (shared bank helpers), `web/e2e/bank.pw.test.ts` (import them instead of its private copies)

**Interfaces:**
- Consumes: the DOM contract from Tasks 8, 10, 11 and 12; the seeding path `web/e2e/bank.pw.test.ts` already proves.
- Produces, in `web/e2e/helpers.ts`:
  ```ts
  export interface BankSnapshot { ownerKey: string; version: number; capacity: number; tabs: number[]; slots: { slot: number; obj: number; count: number }[] }
  export const MANAGEMENT: string;          // E2E_ENGINE_MANAGEMENT ?? 'http://127.0.0.1:8897'
  export const MANAGEMENT_SECRET: string;   // ENGINE_MANAGEMENT_SECRET ?? ''
  export function idTokenFor(email: string): Promise<string>;
  export function readBank(page: Page, idToken: string): Promise<BankSnapshot>;
  export function managementContext(): Promise<APIRequestContext>;
  export function signUpAndPlay(page: Page, accountName: string, character: string): Promise<string>;
  /** Opens the Bank panel from the strip and waits for the window. */
  export function openBankWindow(page: Page): Promise<void>;
  /** The obj id in each rendered slot, in visual order; null for an empty slot. */
  export function bankObjOrder(page: Page): Promise<(number | null)[]>;
  /** Presses, drags past the threshold in steps, and releases over the target. */
  export function dragBankSlot(page: Page, from: number, to: number): Promise<void>;
  ```
  `idTokenFor`, `readBank`, `signUpAndPlay`, `MANAGEMENT` and `MANAGEMENT_SECRET` move out of `web/e2e/bank.pw.test.ts` verbatim (the comments travel with them); that spec then imports them and keeps its own coverage-boundary note.

- [ ] **Step 1: Move the shared helpers**

Cut `MANAGEMENT`, `SECRET` (renamed `MANAGEMENT_SECRET`), `BankSnapshot`, `idTokenFor`, `readBank` and `signUpAndPlay` out of `web/e2e/bank.pw.test.ts` into `web/e2e/helpers.ts`, add `managementContext()`:

```ts
/** An API context already carrying the management secret. Loopback only; never the browser. */
export async function managementContext(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ extraHTTPHeaders: { 'x-idlescape-mgmt': MANAGEMENT_SECRET } });
}
```

and the three UI helpers:

```ts
export async function openBankWindow(page: Page): Promise<void> {
  await openPanel(page, 'bank');
  await expect(page.locator('#bank-window')).toBeVisible({ timeout: 15_000 });
  // The first paint can precede the first snapshot; wait for a real capacity reading.
  await expect.poll(async () => (await page.locator('#bank-capacity').textContent()) ?? '', { timeout: 20_000 }).toMatch(/^\d+ \/ 240$/);
}

export function bankObjOrder(page: Page): Promise<(number | null)[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('#bank-window [data-bank-slot]'))
      .map(cell => (cell.dataset.bankObj ? Number(cell.dataset.bankObj) : null))
  );
}

export async function dragBankSlot(page: Page, from: number, to: number): Promise<void> {
  const source = page.locator(`#bank-window [data-bank-slot="${from}"]`);
  const target = page.locator(`#bank-window [data-bank-slot="${to}"]`);
  await source.hover();
  await page.mouse.down();
  // Steps matter: the input layer only becomes a drag past 4 px of travel.
  await target.hover({ force: true });
  await target.hover({ force: true });
  await page.mouse.up();
}
```

Update `web/e2e/bank.pw.test.ts` to import them and delete its local copies. Nothing about its assertions changes.

- [ ] **Step 2: Run the existing bank spec to prove the move is inert**

Bring the stack up (`scripts/start-stack.ps1 -Prod` in PowerShell, wait for `/api/health` to report `engine: up`), then:
Run: `cd web && npm run build:e2e && npx playwright test e2e/bank.pw.test.ts`
Expected: PASS, exactly as before the move.

- [ ] **Step 3: Write the failing bank UI spec**

```ts
// web/e2e/bank-ui.pw.test.ts
import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  MANAGEMENT, MANAGEMENT_SECRET, bankObjOrder, dragBankSlot, idTokenFor, openBankWindow,
  openPanel, readBank, signUpAndPlay, uniqueName
} from './helpers';

// SP8b end to end: the bank WINDOW. The data path is bank.pw.test.ts's job; this spec is about
// what a player can see and do. Items are seeded through the loopback management port, standing
// in for the Contracts service that will do it for real in SP9, because the browser is only ever
// allowed to re-order (POST /api/bank/ops answers 403 layout_only to anything else).
//
// Requires: firebase emulators, engine (274) with ENGINE_MANAGEMENT_SECRET set, front server.

const COINS = 995;
const PARTYHAT = 1038;
const DIAMOND = 1618;
const RUBY = 1619;

test('the bank window shows, re-orders, tabs, sorts, searches and follows the world', async ({ page }) => {
  test.skip(MANAGEMENT_SECRET === '', 'ENGINE_MANAGEMENT_SECRET is not configured for this stack');
  test.setTimeout(240_000);

  const name = uniqueName('bankui');
  const email = await signUpAndPlay(page, name, name);
  const idToken = await idTokenFor(email);
  const ownerKey = (await readBank(page, idToken)).ownerKey;

  const mgmt: APIRequestContext = await (await import('@playwright/test')).request.newContext({ extraHTTPHeaders: { 'x-idlescape-mgmt': MANAGEMENT_SECRET } });
  try {
    const seeded = await mgmt.post(`${MANAGEMENT}/owner/${ownerKey}/bank/apply`, {
      data: { expectedVersion: 0, ops: [{ obj: COINS, delta: 500 }, { obj: PARTYHAT, delta: 1 }, { obj: DIAMOND, delta: 1 }, { obj: RUBY, delta: 1 }] }
    });
    expect(seeded.status(), await seeded.text()).toBe(200);

    // 1. The window opens from the strip and reads the account's bank.
    await openBankWindow(page);
    await expect(page.locator('#bank-window')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('#bank-window')).toHaveAttribute('aria-label', 'The Bank of Gielinor');
    await expect(page.locator('#bank-capacity')).toHaveText('4 / 240');
    expect((await bankObjOrder(page)).slice(0, 4)).toEqual([COINS, PARTYHAT, DIAMOND, RUBY]);

    // 2. Eight columns, exactly as OSRS.
    await expect(page.locator('#bank-window [role="row"]').first().locator('[role="gridcell"]')).toHaveCount(8);

    // 3. Item art really does come from the running client (patch 28 -> icons.ts). A model that
    // OnDemand has not streamed yet falls back to a name tile, so this polls rather than asserts.
    await expect.poll(() => page.locator('#bank-window img.bank-icon').count(), { timeout: 60_000 }).toBeGreaterThan(0);

    // 4. Drag to swap. The engine applies it; the version moves; the DOM and the API agree.
    await dragBankSlot(page, 0, 2);
    await expect.poll(async () => (await readBank(page, idToken)).slots[0]?.obj, { timeout: 20_000 }).toBe(DIAMOND);
    expect((await bankObjOrder(page)).slice(0, 4)).toEqual([DIAMOND, PARTYHAT, COINS, RUBY]);

    // 5. A SECOND drag straight after the first must also land. This is the post-apply version
    // contract: the version the apply returned is immediately reusable, so the store does not
    // 409 against itself on every other move.
    const afterFirst = (await readBank(page, idToken)).version;
    await dragBankSlot(page, 1, 3);
    await expect.poll(async () => (await readBank(page, idToken)).version, { timeout: 20_000 }).toBeGreaterThan(afterFirst);
    expect((await bankObjOrder(page)).slice(0, 4)).toEqual([DIAMOND, RUBY, COINS, PARTYHAT]);

    // 6. The right-click menu carries the Contracts entry points, disabled until SP9.
    await page.locator('#bank-window [data-bank-slot="0"]').click({ button: 'right' });
    await expect(page.locator('#bank-menu')).toBeVisible();
    const sell = page.locator('[data-bank-menu-entry="sell"]');
    await expect(sell).toHaveAttribute('aria-disabled', 'true');
    await expect(sell).toContainText('Contracts coming soon');
    await expect(page.locator('[data-bank-menu-entry="buy"]')).toHaveAttribute('aria-disabled', 'true');

    // 7. A tab is created from the menu; its icon is the item that made it (owner decision 4).
    await page.locator('[data-bank-menu-entry="move-to-new-tab"]').click();
    await expect(page.locator('#bank-window [data-bank-tab="1"]')).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await readBank(page, idToken)).tabs, { timeout: 20_000 }).toEqual([1]);
    await expect(page.locator('[data-bank-tab="1"]')).toHaveAttribute('aria-label', 'Tab 1, 1 item');

    // 8. Sorting is a web-only helper (owner decision 3) that the ENGINE performs.
    await page.locator('#bank-window [data-bank-tab="0"]').click({ button: 'right' });
    await page.locator('[data-bank-menu-entry="sort-value"]').click();
    await expect.poll(async () => {
      const bank = await readBank(page, idToken);
      // The main tab is everything past tab 1, sorted by High Alchemy value, descending.
      return bank.slots.filter(s => s.slot >= 1).map(s => s.obj);
    }, { timeout: 20_000 }).toEqual([DIAMOND, RUBY, COINS].filter(obj => obj !== (await bankObjOrder(page))[0]));

    // 9. Search dims what does not match.
    await page.locator('#bank-search-toggle').click();
    await page.locator('#bank-search').fill('coins');
    await expect(page.locator('#bank-window [data-bank-obj="995"]')).not.toHaveClass(/dim/);
    await expect(page.locator(`#bank-window [data-bank-obj="${PARTYHAT}"]`)).toHaveClass(/dim/);
    await page.locator('#bank-search-toggle').click();

    // 10. A change made OUTSIDE the browser reaches the open window without a reload. The engine
    // posts /internal/bank-changed and the front server fans it out; polling covers the case
    // where the hook is not delivered at all, so this is generous rather than tight.
    const before = await readBank(page, idToken);
    const added = await mgmt.post(`${MANAGEMENT}/owner/${ownerKey}/bank/apply`, {
      data: { expectedVersion: before.version, ops: [{ obj: 1163, delta: 1 }] }
    });
    expect(added.status(), await added.text()).toBe(200);
    await expect(page.locator('#bank-capacity')).toHaveText('5 / 240', { timeout: 20_000 });
    await expect(page.locator('#bank-window [data-bank-obj="1163"]')).toHaveCount(1);

    // 11. The same reordering from the keyboard, with a spoken line for a screen reader.
    const orderBefore = await bankObjOrder(page);
    await page.locator('#bank-window [data-bank-slot="0"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#bank-status')).toContainText('Picked up');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(page.locator('#bank-status')).toContainText('Moved');
    await expect.poll(async () => (await bankObjOrder(page))[0], { timeout: 20_000 }).not.toBe(orderBefore[0]);

    // 12. Escape closes the window and the panel with it.
    await page.keyboard.press('Escape');
    await expect(page.locator('#bank-window')).toBeHidden();
    await expect(page.locator('#side-panel')).toBeHidden();
  } finally {
    await mgmt.dispose();
  }
});

test('the bank panel says the web can never move items', async ({ page }) => {
  const name = uniqueName('bankcopy');
  await signUpAndPlay(page, name, name);
  await openPanel(page, 'bank');
  await expect(page.locator('#panel-body')).toContainText('Items only move in and out of the bank in game.');
  await expect(page.locator('#bank-deposit-inv')).toBeDisabled();
  await expect(page.locator('#bank-deposit-worn')).toBeDisabled();
  await expect(page.locator('#bank-deposit-inv')).toHaveAttribute('title', 'Deposit from a character in game');
});
```

Simplify step 8's expected order to a literal once the seeded costs are known from the pack: `oc_cost` for 1618 is higher than 1619, and 995 is 1. Replace the computed `.filter(...)` with the literal list the first run reports, and leave a comment naming the three costs.

- [ ] **Step 4: Run the spec to verify it fails**

Run: `cd web && npm run build:e2e && npx playwright test e2e/bank-ui.pw.test.ts`
Expected: FAIL before Tasks 1 to 14 are merged; after them, this is the run that must go green.

- [ ] **Step 5: Run the whole browser suite**

Run: `cd web && npm run build:e2e && npx playwright test`
Expected: PASS, with no regression in `bank.pw.test.ts`, `tabs.pw.test.ts`, `plugins.pw.test.ts` or `characters.pw.test.ts`. A new strip icon changes the icon order, so if `plugins.pw.test.ts` asserts a strip position, update that assertion in this commit and say so in the message.

- [ ] **Step 6: Commit**

```bash
git add web/e2e/helpers.ts web/e2e/bank.pw.test.ts web/e2e/bank-ui.pw.test.ts
git commit -F - <<'MSG'
test(bank): browser coverage for the bank window against the live stack

Opens the window from the strip, proves eight columns and real client-drawn
icons, drags twice in a row (which is the post-apply version contract), creates
a tab from the menu, sorts through the engine, dims a search miss, sees an
out-of-band change arrive without a reload, and reorders from the keyboard with
a spoken line. The seeding and token helpers move into e2e/helpers.ts.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
MSG
```

---

### Task 16: Record what shipped, what changed against the spec, and what SP8c inherits

Six things in this plan deviate from the spec as written, every one of them because the code says otherwise. They must be written down where the next reader looks, not left in commit messages.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-05-sp8b-web-bank-design.md`, `docs/superpowers/specs/2026-09-05-idlescape-roadmap-and-handoff.md`, `README.md`

**Interfaces:**
- Consumes: nothing. Produces: nothing executable. This is the record.

- [ ] **Step 1: Add a "Built as" section to the SP8b spec**

Append to `docs/superpowers/specs/2026-09-05-sp8b-web-bank-design.md`, after section 11:

```markdown
## 12. Built as (SP8b implementation, 2026-09-06)

The plan is `docs/superpowers/plans/2026-09-06-sp8b-web-bank.md`. Six things differ from the
design above, each because the code said otherwise:

1. **Item icons.** Section 3.1 assumed `ObjType.getIcon` and a `PixMap`. Neither exists in this
   fork. Client patch 28 exposes `getObjIcon(id, count?)` built on `ObjType.getSprite(id, count, 0)`
   (a 32x32 `Pix32`, 0 = transparent) plus `getObjInfo(id)` for name, examine, cost, stackable
   and noted. The cache (`web/src/bank/icons.ts`, IndexedDB `idlescape-icons`) keys on the obj
   id ALONE and always renders at count 1: a bank note is its own obj id in 274, so noted-ness
   is already in the key, and the bank prints the stack size as text so the stack art variant
   carries nothing. A build-time icon sheet remains possible later and remains unnecessary.
2. **`noted` is not on a slot.** `BankSlot` is `{ slot, obj, count }` end to end; section 4's
   `noted` field never existed in SP8 and is derived from `ObjInfo.noted` instead.
3. **Untradeable items are not greyed out.** Section 5 wanted `ObjType.tradeable`. The 274
   CLIENT cache has no such field (only the engine's `ObjType` does, and it is never packed for
   the client) and this repo has no `scripts/gen` item table. Both Contracts entries ship
   disabled with "Contracts coming soon"; SP9 registers over them by id and owns tradeability,
   which it must anyway because it owns the escrow.
4. **"Move to tab" is flat, not a submenu.** At most nine tabs exist, and one keyboard model is
   better than two for a right-click menu.
5. **The live transport is SSE read through `fetch`, not `EventSource`.** `EventSource` cannot
   send an `Authorization` header and `/api/bank/events` is human-only behind a Firebase bearer.
   Polling `GET /api/bank` every 10 seconds runs UNCONDITIONALLY behind it, because the engine's
   change hook is fire and forget with a 2 s timeout, no retry and no ordering guarantee, and is
   silent altogether in a world with no `IDLESCAPE_HOOK_URL`.
6. **Ops are coalesced to at most one apply per 1.2 s** (two world ticks). ANY apply puts the
   owner into push-out mode for one tick, and a client applying on most ticks would hold an
   account there permanently, so a drag burst becomes one batch. `moveToTab` and `setTabs` are
   sent immediately because they restructure the tabs and the engine's own arithmetic decides
   the result, so there is nothing the web could preview honestly.

Section 7's GAME CLIENT mirror (drawing only the selected tab's range, the divider lines, the
`bank_main.if` tab components, the `bank.rs2` handlers, drag-to-tab and in-game search) is
**SP8c**, not SP8b: it touches `content-custom/` and a second anchored client patch, it is
independently testable, and nothing in the web bank depends on it. Tab sizes already round-trip
through the nine `banktab_size_*` varps SP8 seeds and pushes out.
```

- [ ] **Step 2: Add the roadmap rows**

`docs/superpowers/specs/2026-09-05-idlescape-roadmap-and-handoff.md`, between the SP8 and SP9 rows:

```markdown
| SP8b (done 2026-09-06) | The web bank: 2007scape-styled window over the stage, item-icon tabs, drag and keyboard reordering, per-tab sort helpers, an OSRS right-click menu with registrable Contracts entry points, live updates over `GET /api/bank/events` with polling behind them, and client patch 28 for item art. Plan: `docs/superpowers/plans/2026-09-06-sp8b-web-bank.md`. Deviations from the spec are recorded in that spec's section 12. | SP8, SP7 |
| SP8c | The GAME client's half of the bank tabs: a tab-range draw plus divider lines in `Client.ts`, the `bank_main.if` tab components and `bank.rs2` handlers in `content-custom/`, then drag-to-tab and in-game search. Owner decision 3 keeps the SORT helpers out of it. | SP8b |
```

and, in the "What SP8b inherits from SP8 as built" section, add a closing line naming what SP9 now inherits from SP8b: the menu registry (`createMenuRegistry` / `contractsStubs` in `web/src/bank/contextMenu.ts`), the two ids `sell` and `buy`, and the `MenuItemContext` those entries receive.

- [ ] **Step 3: Update the README**

In the shared-bank paragraph (around line 173), add after the sentence about `GET /api/bank` and `POST /api/bank/ops`:

```markdown
   Since SP8b the shell also serves `GET /api/bank/events`, a Server-Sent Events stream of
   `{ version }` fanned out from the engine's change hook, and the Bank panel (strip icon 🏦)
   opens a 2007scape-styled window over the game view. The web bank is **view and re-order
   only**: dragging, tabs and the sort helpers all send layout ops, and items still enter and
   leave the bank in game, or later through Contracts. The stream is an accelerator, not a
   guarantee: the browser polls `GET /api/bank` every 10 seconds regardless, because the hook
   has a 2 s timeout, no retry and no delivery guarantee, and is absent entirely in a
   deployment that has not been given `IDLESCAPE_HOOK_URL` (step 3 below).
```

- [ ] **Step 4: Verify the whole repo one more time**

Run, in order:
```
cd client && ~/.bun/bin/bunx tsc --noEmit && ~/.bun/bin/bun test src/hooks && ~/.bun/bin/bun run build:dev
cd server && ~/.bun/bin/bun run typecheck && ~/.bun/bin/bun test
cd web && npm run typecheck && npm run lint && npx vitest run && npm run build:e2e
cd web && npx playwright test
```
Expected: every suite green. Confirm the patch greps from `client/PATCHES.md` still return their stated counts:
```
cd client && grep -c "private objIconDataUrl(id: number, count: number)" src/client/Client.ts
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-05-sp8b-web-bank-design.md docs/superpowers/specs/2026-09-05-idlescape-roadmap-and-handoff.md README.md
git commit -F - <<'MSG'
docs(bank): record how SP8b was built and split the in-game mirror out as SP8c

Six deviations from the design are written into the spec itself: the real icon
API, no noted flag on a slot, no tradeable flag in the 274 client cache, a flat
Move to tab, SSE read through fetch with unconditional polling behind it, and the
1.2 s apply cadence that keeps an account out of permanent push-out mode.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
MSG
```

---

## Self-review

Run against the spec with fresh eyes after writing the plan.

**1. Spec coverage.**

| Spec requirement | Task |
|---|---|
| 1: OSRS look, dark-brown pane, eight columns, item-icon tabs, title, capacity counter, swap/insert, item/note, quantity buttons, search, right-click menus | 8, 10, 12, 13 |
| 2: the ACCOUNT's shared bank, live, from the web or any client | 3, 4, 5, 6, 15 |
| 3: reordering from the web, applied by the engine, versioned, never by the browser | 6, 9, 12, 15 |
| 4: Contracts hooks, prefilled sell and buy | 11 (entry points and registry); the forms are SP9 |
| 5: bank tabs at account level, mirrored in the web view | 10, 12; the GAME client mirror is SP8c (Task 16) |
| 3.1: item icons | 1, 7 |
| 4: data and sync, store, 409 handling, toast | 3, 5, 6 |
| 5: menu entries registrable without touching the bank module | 11 |
| 6: tab semantics, drop on "+", sort helpers per tab | 10, 12 |
| 7: feasibility table, web column | 8, 9, 10, 12; the game-client column is SP8c |
| 8: module list | File Structure, with the splits noted below |
| 9: testing (unit, server, browser) | every task's own tests, plus 15 |
| 11: the four owner decisions | 1 (12), 2 (11), 3 (12), 4 (10) |

Gaps I could not turn into a task, all deliberate and all recorded in Task 16: the SP9 contract
forms themselves; the engine-overlay work in spec section 8's module list (SP8 already shipped
it, and this plan may not touch `engine-custom/`); the `content-custom/` and second client patch
of section 7 (SP8c); placeholders, bank fillers and capacity beyond 240 (engine-level, out of
v1 by the spec's own section 7); market prices for `sort by value` (SP9; the engine's High
Alchemy value is used and the spec allows it); agent access (SP8 is human-only, SP9 revisits).

**2. Placeholder scan.** No "TBD", no "similar to Task N", no "add error handling". Every code
step carries the code. Three steps deliberately give rules rather than a full listing (Task 8
step 3, Task 9 step 3, Task 10 step 3, Task 12 step 4): in each case the tests above them are
complete and executable and pin every behaviour named, which is the contract the implementer
works to. Task 15 step 3 asks for one literal to be substituted after the first run (the alch
order of three seeded objs); that is a measurement, not a placeholder, and the step says so.

**3. Type consistency.** Checked across tasks: `BankSlot`/`BankSnapshot`/`BankOp` match
`server/src/types.ts` exactly (no `noted`); `ObjInfo` is defined once in Task 1 and imported
everywhere; `BankState` is defined in Task 6 and consumed unchanged by 8, 10, 12 and 14;
`IconCache` (`peek`/`load`/`prime`/`onChange`) is identical in 7, 8, 10 and 12; `MenuEntry`
and `MenuItemContext` come from `types.ts` and are used unchanged in 11 and 12; `BankMenuRegistry`
is `register`/`entries` in 11, 12 and 14; the grid exposes `slotOf`/`visible` in 8 and Task 9
consumes exactly those; `tabAt` returns `number | 'new' | null` in both 9 and 10; `FLUSH_MS`,
`POLL_MS`, `MAX_OPS_PER_BATCH`, `MAX_TABS` and `BANK_COLUMNS` live only in `types.ts`.

**4. File-size check.** `types.ts`, `layout.ts`, `api.ts`, `stream.ts`, `store.ts`, `icons.ts`,
`grid.ts`, `gridInput.ts`, `tabsBar.ts`, `contextMenu.ts`, `bottomBar.ts`, `view.ts`,
`plugins/builtin/bank.ts` are twelve small modules rather than the spec's six, precisely to stay
under the 400-line ceiling; Tasks 4, 8 and 12 each name the further split to make if their file
still crosses it (`server/src/bank/validate.ts`, `web/src/bank/cell.ts`, `web/src/bank/menus.ts`).
