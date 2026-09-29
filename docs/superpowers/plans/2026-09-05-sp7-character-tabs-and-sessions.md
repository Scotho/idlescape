# SP7 — Character tabs, one client per character, name-first login

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every created character its own live client. The shell stops loading the client bundle into its own document and instead hosts one same-origin `web/play.html` iframe per character, lazily created on first activation and kept alive for the tab's lifetime. A `#character-tabs` strip across the top of the game view (in the frame, not the side panel) shows one tab per created character with a status dot, empty slots within the account's limit, a disabled third slot for guests with a tooltip, and a disabled fourth "Add more" slot reading "coming soon". Guests now choose their character name exactly like registered users. The client's title screen loses the username/password fields and shows a single centred **Login** button driven by credentials the parent armed with `armLogin`; hidden characters keep simulating with rendering suspended.

**Architecture:** `web/index.html` stays the shell document: title bar, the new `#character-tabs` strip, and a `#client-frames` host inside `#canvas-wrap` holding N `<iframe class="client-frame">`. `web/play.html` is a minimal document with `#canvas` that runs the existing `clientHost.ts` loader inside its own realm, so `window.idlescape.{client,plugins}` is per iframe. `web/src/sessions/manager.ts` owns `Map<characterId, CharacterSession>`: it creates the iframe, waits for the hooks, mints `POST /api/characters/:id/session` and calls `armLogin`, polls `getState()` at 1 s, derives `booting | title | connecting | online | offline`, hides inactive frames with `setRenderSuspended(true)`, and on activation un-hides, resumes and focuses. The parent's `window.idlescape` becomes a façade whose `client`/`plugins` getters point at the active session, so `PluginContext.client()`, the e2e helpers and the SP4a Transport all follow the active tab. XP and loot trackers, hook subscriptions and client-tier plugin fan-out are keyed by character id. Six anchored client patches (22-27) add the armed-login hook surface, the single title button, the render-suspend guard and the idle-timer guard.

**Tech Stack:** Vite + TypeScript shell (`web/`, Vitest + jsdom, Playwright), vendored 274 client fork (`client/`, `bun test`, `bun run build:dev`), Bun front server (`server/`, `bun test`).

**Spec:** `docs/superpowers/specs/2026-09-05-sp7-character-tabs-and-sessions-design.md` (binding addendum: sections 1-6) amending `docs/superpowers/specs/2026-09-05-multi-character-platform-design.md` sections 5, 6 and decisions 1, 2, 12. Feasibility: `docs/superpowers/specs/phase-a/2026-09-05-phase-a-multi-session-feasibility.md` F1-F7 and its patch table, corrected by `docs/superpowers/specs/phase-a/2026-09-05-phase-a-critic-report.md` rows 10 and 19.

## Global Constraints

- Strict TypeScript, no new `as any`, files under 400 lines, `types.ts` per package, conventional commits (`docs/superpowers/specs/2026-09-05-idlescape-roadmap-and-handoff.md` section 5).
- Character limits are the **server's** number, read from `GET /api/characters` (`{ characters, limit }`): anonymous **2**, registered **3** (`server/src/types.ts` `CHARACTER_LIMITS = { anonymous: 2, password: 3 }`). The shell never hard-codes them; it only hard-codes `TAB_SLOTS = 3` character slots plus one "Add more" slot.
- Client patches in this sub-project are **22-27**. SP4a Task 2 already owns 17-21 (`client/PATCHES.md`); do not renumber those. The addendum's own table (17-22) is renumbered to 22-27 in Task 12.
- Tab strip copy is exact: empty slot `+ New character`; guest third slot tooltip `Create an account to unlock a third character`; fourth slot label `Add more` with the note `coming soon`.
- Playwright id contracts that must keep working: `#screen-gate`, `#screen-home`, `#screen-characters`, `#screen-frame`, `#gate-password`, `#btn-guest`, `#btn-show-signup`, `#signup-form`, `#char-name`, `#btn-char-create`, `#side-panel`, `#panel-title`, `#panel-body`, `#icon-strip`, `[data-panel]`, `#overlays`, `#plugin-overlays`, `#toasts`, `#offline-card`, `#offline-count`, `#foot-left`, `#foot-right`, `#title-centre`. New in SP7: `#character-tabs`, `#client-frames`, `[data-char-tab]`, `[data-char-tab-new]`, `[data-char-tab-locked]`, `[data-char-tab-more]`. `#canvas` moves out of the parent document into `web/play.html`.
- The Characters side panel keeps the SP6 behaviour and copy; only its "Log in as <name>" button becomes "Open tab" and its rows gain a live status.
- Do not touch `engine/`, the live PoC (8888/43594/8898), or deploy. Do not edit `client/src/vendor/`.
- Branch: `feat/platform-shell`. Commit trailers on every commit:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
  ```
- Commands (Git Bash, from the repo root):
  - client — `cd client && ~/.bun/bin/bunx tsc --noEmit && ~/.bun/bin/bun test src/hooks src/plugins && ~/.bun/bin/bun run build:dev`
  - web — `cd web && npm run typecheck && npm run lint && npx vitest run`
  - server — `cd server && ~/.bun/bin/bun run typecheck && ~/.bun/bin/bun test`
  - e2e — bring the stack up (`cd firebase && npm run emulators`, then `scripts/start-stack.ps1 -Prod`, wait for `/api/health` `engine: up`), then `cd web && npm run build:e2e && npx playwright test`.

## Interfaces from earlier work

- `client/src/hooks/types.ts`: `ClientHooks` (`login`, `logout`, `echoChat`, `getState`, `getObjName`, `getWorldState`, `dispatch`, `on`), `HookBridge`, `ClientState`, `LoginResult`, `HookEvents`. `client/src/hooks/install.ts`: `installHooks(bridge): { hooks, emitter }` writes `window.idlescape = { client, plugins }` and dispatches `idlescape:client-ready`.
- `client/src/client/Client.ts` patches 1-21 (`client/PATCHES.md`): the private fields block with `headlessTitle`/`pendingHeadlessLogin` (patch 2), the `installHooks({...})` bridge (patch 3), `titleScreenLoop()`'s headless early return (patch 7), `titleScreenDraw()`'s headless branches (patches 8, 9), `hookState()` (patch 16). `Client.logout()` clears `loginUser`/`loginPass`; `mainredraw()` starts with the error check; `gameLoop()`'s idle block is `if (now - this.idleTimer > 90_000)`.
- `web/src/clientHost.ts`: `loadClient(nodeId = 10, members = true): Promise<ClientHooks>` — single-flight `import('/client/client.js')` + `new Client(nodeId, 0, members)`, resolving on `idlescape:client-ready`. SP7 keeps the loader verbatim and moves its **caller** into the iframe.
- `web/src/clientTypes.ts`: mirror of the client hook types (must stay identical).
- `web/src/characters/api.ts`: `listCharacters(idToken) -> { characters, limit }`, `checkName`, `createCharacter`, `mintSession(idToken, id) -> { gameName, secret }`, `deleteCharacter`, `friendlyCharacterError(code)`.
- `web/src/characters/gate.ts`: `createCharactersGate(root, deps): { enter(identity), cached(), refresh() }`; `deps.onReady(characters, first)`.
- `web/src/home/controller.ts`: `createHomeController({ setState, onIdentity, gameName, startSession })` → `{ start, setPlayers, identity, characters, refreshCharacters, dismissConnect }`.
- `web/src/main.ts`: `state`/`screens`, `layout()`, `wireHooks(h)`, `startSession(character)`, `contextFor(id)`, `shell` (`createShellRegistry`), `rebuildStrip`, `deps`, `panelCtl`, `overlays`, `watchHealth()`, `enterApp()`.
- `web/src/frame/canvasSize.ts`: `CANVAS_W = 789`, `CANVAS_H = 532`, `computeCanvasSize({ available, mode })`, `applyCanvasSize(canvas, size, filter)`.
- `web/src/frame/panels.ts`: `createPluginRegistry({ strip, panel, title, body, onChange })` → `{ open, close, toggle, current, manifests, register, restore }`.
- `web/src/plugins/types.ts`: `PluginContext.client(): ClientHooks | null`, `definePlugin`, `PluginManifest.tier`. `web/src/plugins/registry.ts`: `createShellRegistry({ store, uid, contextFor, onIconStripChange, onClientToggle, notify })` → `{ register, init, isEnabled, enable, disable, setSetting, manifests, panelFor, overlaysFor, onTick }`.
- `web/src/plugins/builtin/characters.ts`: `createCharactersPlugin(deps)` with `idToken`, `isAnonymous`, `active`, `switchTo`, `reauth`; rows carry `[data-char-row]`, `[data-char-switch]`, `[data-char-delete]`, `#char-panel-create`, `#char-panel-name`, `#char-del-*`.
- `web/src/characters/switcher.ts`: `createCharacterSwitcher` (logout-then-login). **Deleted in Task 7.**
- `web/e2e/helpers.ts`: `GATE_PASSWORD`, `SIGNUP_PASSWORD`, `CANVAS`, `MINIMAP_CENTRE`, `VIEWPORT_CENTRE`, `uniqueName`, `openGate`, `clientState`, `loginAsGuest`, `signUp`, `openPanel`, `installRecorder`, `canvasClick`, `canvasPixels`, `LOADING_BAR_RED`, `waitForMove`.
- `server/src/router.ts`: `classify(pathname, isUpgrade)` with `{ kind: 'page'; file }` (used today only by `/styleguide`); `server/src/static.ts` `serveStatic` serves `page` from `env.webDist` with `no-cache`.
- SP4a (running in parallel, `docs/superpowers/plans/2026-09-05-sp4a-tasks-runtime-library-panels.md`): Task 3 `Transport` + `createLocalTransport(hooks, canvas)`; Task 10 `createTasksApi(deps)` and `window.idlescape.tasks` wired in `main.ts` around the single `hooks`.

---

## File Structure

- `web/play.html` — **Create.** Minimal per-character document: `#canvas` + `/src/play.ts`.
- `web/src/play.ts` — **Create.** Iframe-side entry that calls `loadClient()`.
- `web/src/sessions/types.ts` — **Create.** `SessionState`, `CharacterSession`, `deriveSessionState`, `displayStatus`.
- `web/src/sessions/manager.ts` — **Create.** `createSessionManager(deps)`: open/activate/login/close, 1 s polling, render-suspend.
- `web/src/sessions/wire.ts` — **Create.** `wireSession(session, deps)`: per-character hook subscriptions and trackers.
- `web/src/frame/characterTabs.ts` — **Create.** `computeSlots`, `createCharacterTabs`.
- `web/src/styles/tabs.css` — **Create.** The strip's styles; imported from `index.css`.
- `web/src/tasks/router.ts` — **Create (Task 9).** Routes `window.idlescape.tasks` to the active session's `TasksApi`.
- `web/e2e/tabs.pw.test.ts` — **Create.** Tab strip, two live clients, logout in one tab, guest disabled slots.
- `web/e2e/measure.pw.test.ts` — **Create.** Opt-in throttling and memory measurements.
- `docs/superpowers/measurements/2026-09-05-sp7-sessions.md` — **Create.** Recorded numbers.
- `web/src/main.ts`, `web/src/partials/frame.html`, `web/src/frame/canvasSize.ts`, `web/src/clientTypes.ts`, `web/src/characters/gate.ts`, `web/src/home/controller.ts`, `web/src/plugins/builtin/characters.ts`, `web/src/plugins/builtin/xpTracker.ts`, `web/src/plugins/builtin/lootTracker.ts`, `web/src/plugins/builtin/screenshot.ts` (call site only), `web/src/styles/index.css`, `web/vite.config.ts`, `web/e2e/helpers.ts`, `web/e2e/global.d.ts`, `web/e2e/characters.pw.test.ts`, `web/e2e/gate-to-game.pw.test.ts` — **Modify.**
- `web/src/clientHost.ts` — **Modify** (drop its `declare global`, which moves to `clientTypes.ts`); the loader body is unchanged.
- `web/src/characters/switcher.ts`, `web/src/characters/switcher.test.ts` — **Delete.**
- `client/src/hooks/types.ts`, `client/src/hooks/install.ts`, `client/src/client/Client.ts`, `client/bundle.ts`, `client/PATCHES.md` — **Modify.**
- `client/src/hooks/install.test.ts` — **Create.**
- `server/src/router.ts`, `server/src/router.test.ts` — **Modify.** `/play.html` page route.
- `README.md`, `docs/superpowers/specs/2026-09-05-sp7-character-tabs-and-sessions-design.md`, `docs/superpowers/specs/2026-09-05-idlescape-roadmap-and-handoff.md` — **Modify.**

---
### Task 1: Armed-login hook surface on the client (patches 22-23)

**Files:**
- Modify: `client/src/hooks/types.ts`, `client/src/hooks/install.ts`, `client/src/client/Client.ts`, `client/bundle.ts`, `web/src/clientTypes.ts`
- Test: `client/src/hooks/install.test.ts` (create)

**Interfaces:**
- Consumes: `HookBridge`, `Emitter<HookEvents>`, `installHooks` (existing).
- Produces (appended to `ClientHooks` in `client/src/hooks/types.ts` **and** mirrored verbatim in `web/src/clientTypes.ts`):
  ```ts
  /** Stores credentials for the title screen's Login button. Does not log in. */
  armLogin(gameName: string, secret: string, label?: string): void;
  /** Runs the login the parent armed with `armLogin`; same result contract as `login`. */
  loginArmed(): Promise<LoginResult>;
  /** Skips `mainredraw()` while true; resuming forces a full repaint. */
  setRenderSuspended(suspended: boolean): void;
  /** Suppresses the client's own 90 s idle-logout packet while true. */
  setAttended(attended: boolean): void;
  ```
  and on `HookBridge` (client-only): `armLogin(gameName: string, secret: string, label: string): void`, `loginArmed(): Promise<LoginResult>`, `setRenderSuspended(suspended: boolean): void`, `setAttended(attended: boolean): void`.

- [ ] **Step 1: Write the failing hook-bridge test**

`client/src/hooks/install.test.ts`. Bun has no DOM, and `install.ts` writes `window.idlescape` and dispatches an event on `window`, so the test aliases `window` to `globalThis` (which is an `EventTarget` in Bun) **before** importing the module.

```ts
// client/src/hooks/install.test.ts
import { beforeEach, describe, expect, test } from 'bun:test';
import type { ClientHooks, ClientState, HookBridge, LoginResult, WorldBridge, WorldState } from './types';

// install.ts targets a browser realm; bun has no `window`, so alias it before the import.
(globalThis as { window?: unknown }).window = globalThis;
const { installHooks } = await import('./install');

const state: ClientState = {
  loggedIn: false, gameName: null, skills: { xp: [], level: [] }, inventory: [], fps: 50, rttMs: null,
  hp: { current: 10, max: 10 }, prayer: { current: 1, max: 1 }, energy: 100, boosts: [],
  position: { x: 0, z: 0, level: 0 }, activeTab: 3, sceneReady: false
};

interface Calls {
  login: [string, string][];
  armLogin: [string, string, string][];
  loginArmed: number;
  suspended: boolean[];
  attended: boolean[];
}

function harness(): { hooks: ClientHooks; calls: Calls } {
  const calls: Calls = { login: [], armLogin: [], loginArmed: 0, suspended: [], attended: [] };
  const bridge: HookBridge = {
    login: (gameName, secret) => { calls.login.push([gameName, secret]); return Promise.resolve<LoginResult>({ ok: true }); },
    armLogin: (gameName, secret, label) => { calls.armLogin.push([gameName, secret, label]); },
    loginArmed: () => { calls.loginArmed++; return Promise.resolve<LoginResult>({ ok: false, code: 5, reason: 'already logged in' }); },
    logout: () => {},
    setRenderSuspended: v => { calls.suspended.push(v); },
    setAttended: v => { calls.attended.push(v); },
    addChat: () => {},
    getState: () => state,
    getObjName: () => null,
    world: () => ({} as WorldBridge)
  };
  return { hooks: installHooks(bridge).hooks, calls };
}

describe('installHooks armed-login surface', () => {
  beforeEach(() => { (globalThis as { idlescape?: unknown }).idlescape = undefined; });

  test('armLogin forwards the credentials and label without logging in', () => {
    const { hooks, calls } = harness();
    hooks.armLogin('bob', 'sec', 'Bob');
    expect(calls.armLogin).toEqual([['bob', 'sec', 'Bob']]);
    expect(calls.login).toEqual([]);
    expect(calls.loginArmed).toBe(0);
  });

  test('armLogin defaults the label to the game name', () => {
    const { hooks, calls } = harness();
    hooks.armLogin('bob', 'sec');
    expect(calls.armLogin).toEqual([['bob', 'sec', 'bob']]);
  });

  test('loginArmed resolves the bridge result', async () => {
    const { hooks, calls } = harness();
    await expect(hooks.loginArmed()).resolves.toEqual({ ok: false, code: 5, reason: 'already logged in' });
    expect(calls.loginArmed).toBe(1);
  });

  test('setRenderSuspended and setAttended forward the flag', () => {
    const { hooks, calls } = harness();
    hooks.setRenderSuspended(true);
    hooks.setRenderSuspended(false);
    hooks.setAttended(true);
    expect(calls.suspended).toEqual([true, false]);
    expect(calls.attended).toEqual([true]);
  });

  test('the public surface is published on window.idlescape.client', () => {
    const { hooks } = harness();
    const published = (globalThis as { idlescape?: { client?: ClientHooks } }).idlescape?.client;
    expect(published).toBe(hooks);
    for (const member of ['login', 'armLogin', 'loginArmed', 'logout', 'setRenderSuspended', 'setAttended', 'echoChat', 'getState', 'getObjName', 'getWorldState', 'dispatch', 'on']) {
      expect(typeof (published as unknown as Record<string, unknown>)[member]).toBe('function');
    }
  });
});
```

`WorldState` is imported only to keep the `world()` cast honest; if the linter flags it as unused, drop it from the import list.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd client && ~/.bun/bin/bun test src/hooks/install.test.ts`
Expected: FAIL — `armLogin` is not a member of `HookBridge`/`ClientHooks`.

- [ ] **Step 3: Extend the hook types**

In `client/src/hooks/types.ts`, inside `ClientHooks`, directly after `login(...)`:

```ts
    /** Stores credentials for the title screen's Login button. Does not log in. */
    armLogin(gameName: string, secret: string, label?: string): void;
    /** Runs the login the parent armed with `armLogin`; same result contract as `login`. */
    loginArmed(): Promise<LoginResult>;
```

and after `logout(): void;`:

```ts
    /** Skips `mainredraw()` while true; resuming forces a full repaint. */
    setRenderSuspended(suspended: boolean): void;
    /** Suppresses the client's own 90 s idle-logout packet while true. */
    setAttended(attended: boolean): void;
```

In `HookBridge`, after `login(...)`:

```ts
  armLogin(gameName: string, secret: string, label: string): void;
  loginArmed(): Promise<LoginResult>;
  setRenderSuspended(suspended: boolean): void;
  setAttended(attended: boolean): void;
```

- [ ] **Step 4: Wire the bridge through `installHooks`**

In `client/src/hooks/install.ts`, extend the `hooks` object literal:

```ts
  const hooks: ClientHooks = {
    login: (gameName, secret) => bridge.login(gameName, secret),
    armLogin: (gameName, secret, label) => bridge.armLogin(gameName, secret, label ?? gameName),
    loginArmed: () => bridge.loginArmed(),
    logout: () => bridge.logout(),
    setRenderSuspended: suspended => bridge.setRenderSuspended(suspended),
    setAttended: attended => bridge.setAttended(attended),
    echoChat(text, colour: ChatColour = 'orange') {
      bridge.addChat(0, `${CHAT_COLOUR_TAG[colour]}${text}`, '');
    },
    getState: () => bridge.getState(),
    getObjName: id => bridge.getObjName(id),
    getWorldState: world.getWorldState,
    dispatch: world.dispatch,
    on: (event, handler) => emitter.on(event, handler)
  };
```

- [ ] **Step 5: Patch 22 — the private fields**

In `client/src/client/Client.ts`, in the idlescape field block (patch 2), directly after `private pendingHeadlessLogin: boolean = false;` and its comment:

```ts
    // idlescape SP7 (patch 22): credentials the shell armed for this iframe's character. They
    // survive logout() -- which clears loginUser/loginPass -- so the title screen's Login button
    // can log the same character back in without another round trip to the parent.
    private armedUser: string = '';
    private armedPass: string = '';
    private armedLabel: string = '';
    // idlescape SP7 (patch 26/27): a backgrounded character keeps simulating with the draw
    // skipped, and does not send the idle-logout packet while the shell is minding it.
    private renderSuspended: boolean = false;
    private attended: boolean = false;
```

- [ ] **Step 6: Patch 23 — the bridge closures**

In the `installHooks({ ... })` call in the constructor (patch 3), replace the `login` closure and add the four new ones so the block reads:

```ts
        const installed = installHooks({
            login: (gameName: string, secret: string): Promise<LoginResult> => {
                this.headlessTitle = true;
                // Keep the armed copy in step: a later logout clears loginUser/loginPass, and the
                // title button must still be able to log this character back in.
                this.armedUser = gameName;
                this.armedPass = secret;
                if (this.armedLabel.length === 0) {
                    this.armedLabel = gameName;
                }
                this.loginUser = gameName;
                this.loginPass = secret;
                return new Promise<LoginResult>(resolve => {
                    this.loginResolver = resolve;
                    this.pendingHeadlessLogin = true;
                });
            },
            armLogin: (gameName: string, secret: string, label: string): void => {
                this.headlessTitle = true;
                this.armedUser = gameName;
                this.armedPass = secret;
                this.armedLabel = label;
            },
            loginArmed: (): Promise<LoginResult> => {
                this.headlessTitle = true;
                this.loginUser = this.armedUser;
                this.loginPass = this.armedPass;
                return new Promise<LoginResult>(resolve => {
                    this.loginResolver = resolve;
                    this.pendingHeadlessLogin = true;
                });
            },
            setRenderSuspended: (suspended: boolean): void => {
                this.renderSuspended = suspended;
                if (!suspended) {
                    // One frame repaints the chrome, side panel, chat and minimap (F4 "Resume").
                    this.refresh();
                }
            },
            setAttended: (attended: boolean): void => {
                this.attended = attended;
            },
            logout: (): void => {
                void this.logout();
            },
            addChat: (type: number, text: string, sender: string): void => this.addChat(type, text, sender),
            getState: (): ClientState => this.hookState(),
            getObjName: (id: number): string | null => ObjType.list(id)?.name ?? null,
            world: (): WorldBridge => this.worldBridge()
        });
```

- [ ] **Step 7: Reserve the new property names**

In `client/bundle.ts`, inside the terser `reserved` array, after the `'getWorldState', 'dispatch',` line:

```ts
                    // SP7 multi-session hook surface (client/PATCHES.md patches 22-27).
                    'armLogin', 'loginArmed', 'setRenderSuspended', 'setAttended',
```

- [ ] **Step 8: Mirror the surface in the web shell**

In `web/src/clientTypes.ts`, add the same four members to `ClientHooks` (identical JSDoc and signatures as Step 3). While in the file, move the global `Window` declaration here from `web/src/clientHost.ts` so there is exactly one home for it (SP4a Task 10 appends `tasks` to the same block):

```ts
declare global {
  interface Window {
    idlescape?: {
      /** The active session's hooks in the parent document; the iframe's own hooks inside `play.html`. */
      client?: ClientHooks | null;
      plugins?: ClientPluginRegistry | null;
    };
  }
}
```

and delete the `declare global { interface Window { idlescape?: ... } }` block from `web/src/clientHost.ts`, replacing it with `import type { ClientHooks } from './clientTypes';` plus `import './clientTypes';` is not needed — the ambient declaration is global once the file is part of the program. Keep `clientHost.ts`'s `loadClient` body unchanged.

- [ ] **Step 9: Run the client and web checks**

Run: `cd client && ~/.bun/bin/bunx tsc --noEmit && ~/.bun/bin/bun test src/hooks src/plugins`
Expected: all pass, including the 5 new `install.test.ts` cases.

Run: `cd web && npm run typecheck`
Expected: pass (nothing consumes the new members yet).

- [ ] **Step 10: Commit**

```bash
git add client/src/hooks client/src/client/Client.ts client/bundle.ts web/src/clientTypes.ts web/src/clientHost.ts
git commit -m "feat(client): armLogin/loginArmed/setRenderSuspended/setAttended hook surface (patches 22-23)"
```

---

### Task 2: Single Login title button, render suspend, idle guard (patches 24-27)

**Files:**
- Modify: `client/src/client/Client.ts`, `client/PATCHES.md`

**Interfaces:**
- Consumes: `armedUser`/`armedPass`/`armedLabel`/`renderSuspended`/`attended` (Task 1), `imageTitlebutton`, `b12`, `Colour`, `sWid`/`sHei`, `mouseClick*`, `loginscreen`, `loginMes1/2`.
- Produces: two private methods on `Client` — `drawArmedLoginButton(w: number, h: number): void` and `armedLoginHit(): boolean` — plus the guards in `mainredraw()` and `gameLoop()`.

The title box is drawn into a 360x200 area (`imageTitle4.draw(202, 171)`) while the hit test runs in screen space (`sWid`/`sHei`). Patches 24 and 25 reuse the *exact* offsets upstream already uses for the New User / Existing User buttons (`draw`: `y = ((h / 2) | 0) + 20`; `loop`: `y = ((sHei / 2) | 0) + 20; y += 20;`), so the button is hit-testable at native canvas `(394, 306)` for the stock 789x532 canvas. The e2e helper hard-codes that point.

- [ ] **Step 1: Patch 24 — draw one centred Login button**

Add a private method immediately **before** `private async titleScreenDraw()`:

```ts
    /**
     * idlescape SP7 (patch 24): the one button a shell-driven title screen shows. Same geometry
     * as the stock New User / Existing User buttons so `armedLoginHit()` lines up with it.
     */
    private drawArmedLoginButton(w: number, h: number): void {
        const x: number = (w / 2) | 0;
        const y: number = ((h / 2) | 0) + 20;
        this.imageTitlebutton?.plotSprite(x - 73, y - 20);
        this.b12?.centreStringTag('Login', x, y + 5, Colour.WHITE, true);
    }
```

In `titleScreenDraw()`, `loginscreen === 0`, replace the headless branch (the `Waiting for idlescape...` line) with:

```ts
            // idlescape headless title: the character name, then one centred Login button.
            if (this.headlessTitle) {
                if (this.armedLabel.length > 0) {
                    this.b12?.centreStringTag(this.armedLabel, w / 2, ((h / 2) | 0) - 2, Colour.YELLOW, true);
                }
                this.drawArmedLoginButton(w, h);
            } else {
```

(the `else` body — the two stock buttons — is unchanged).

In `titleScreenDraw()`, `loginscreen === 2`, the existing `if (!this.headlessTitle) { ...credential form... }` gains an `else` so a failed login still offers a retry under `loginMes1`/`loginMes2`:

```ts
            } else {
                // idlescape headless title: keep the status messages, offer the same Login button.
                this.drawArmedLoginButton(w, h);
            }
```

- [ ] **Step 2: Patch 25 — hit-test it in `titleScreenLoop()`**

Add a private method immediately **before** `private async titleScreenLoop()`:

```ts
    /**
     * idlescape SP7 (patch 25): hit test for `drawArmedLoginButton()`. Screen space, matching the
     * arithmetic the stock title buttons use.
     */
    private armedLoginHit(): boolean {
        const x: number = (this.sWid / 2) | 0;
        const y: number = ((this.sHei / 2) | 0) + 40;
        return this.mouseClickButton === 1 && this.mouseClickX >= x - 75 && this.mouseClickX <= x + 75 && this.mouseClickY >= y - 20 && this.mouseClickY <= y + 20;
    }
```

Replace the `headlessTitle` block at the top of `titleScreenLoop()` with:

```ts
        if (this.headlessTitle) {
            if (this.pendingHeadlessLogin) {
                this.pendingHeadlessLogin = false;
                await this.login(this.loginUser, this.loginPass, false);
                return;
            }
            // The player pressed the one button the shell armed. logout() cleared loginUser/Pass,
            // so re-seed them from the armed copy before logging in.
            if (this.armedUser.length > 0 && this.armedLoginHit()) {
                this.loginUser = this.armedUser;
                this.loginPass = this.armedPass;
                await this.login(this.loginUser, this.loginPass, false);
            }
            return;
        }
```

- [ ] **Step 3: Patch 26 — the render-suspend guard**

In `mainredraw()`, immediately after the error branch:

```ts
    override async mainredraw() {
        if (this.errorStarted || this.errorLoading || this.errorHost) {
            this.drawError();
            return;
        }

        // idlescape SP7 (patch 26): a hidden character keeps simulating in mainloop(); only the
        // draw is skipped. setRenderSuspended(false) calls refresh(), which repaints everything.
        if (this.renderSuspended && this.ingame) {
            return;
        }

        Client.drawCycle++;
```

- [ ] **Step 4: Patch 27 — the idle-timer guard**

In `gameLoop()`, the 90 s idle block:

```ts
        // idlescape SP7 (patch 27): a shell-minded background character must not idle itself out.
        // The engine's IdleTimerHandler is a no-op while world.json has node.debug=true, so this
        // only bites in production config -- but the client-side `logoutTimer = 250` it arms turns
        // a lostCon() into a hard logout instead of a reconnect even today, so the guard earns its
        // place now. (phase-a critic report, row 10.)
        if (!this.attended && now - this.idleTimer > 90_000) {
            // no input in 90s, notify the server
            this.logoutTimer = 250;
            this.idleTimer += 10_000; // 10s backoff

            this.out.p1Enc(ClientProt.IDLE_TIMER);
        }
```

- [ ] **Step 5: Update `client/PATCHES.md`**

In the "How to verify all patches are present" block, replace the `Waiting for idlescape...` line (it no longer exists) with the SP7 greps, and add a new "Patch 22-27 verification" section after the 17-21 one:

```sh
cd client
grep -c "private renderSuspended: boolean = false;"                       src/client/Client.ts  # 1
grep -c "private attended: boolean = false;"                              src/client/Client.ts  # 1
grep -c "private armedUser: string = '';"                                 src/client/Client.ts  # 1
grep -c "armLogin: (gameName: string, secret: string, label: string)"     src/client/Client.ts  # 1
grep -c "loginArmed: (): Promise<LoginResult>"                            src/client/Client.ts  # 1
grep -c "setRenderSuspended: (suspended: boolean): void"                  src/client/Client.ts  # 1
grep -c "setAttended: (attended: boolean): void"                          src/client/Client.ts  # 1
grep -c "private drawArmedLoginButton(w: number, h: number): void {"      src/client/Client.ts  # 1
grep -c "private armedLoginHit(): boolean {"                              src/client/Client.ts  # 1
grep -c "if (this.renderSuspended && this.ingame) {"                      src/client/Client.ts  # 1
grep -c "if (!this.attended && now - this.idleTimer > 90_000) {"          src/client/Client.ts  # 1
grep -c "Waiting for idlescape..."                                        src/client/Client.ts  # 0
```

Append these rows to the patch table:

```
| 22 | private fields (patch 2 block) | `armedUser`, `armedPass`, `armedLabel`, `renderSuspended`, `attended`. The armed credentials are a separate copy of `loginUser`/`loginPass` because `logout()` clears those. | `private armedUser: string = '';` |
| 23 | `installHooks({...})` bridge (patch 3) | `armLogin(gameName, secret, label)` sets `headlessTitle` and stores the credentials without logging in; `loginArmed()` copies them into `loginUser`/`loginPass` and arms `pendingHeadlessLogin`; `setRenderSuspended(v)` sets the flag and calls `refresh()` on `false`; `setAttended(v)` sets the flag. The existing `login` closure also fills the armed copy. | `loginArmed: (): Promise<LoginResult>` |
| 24 | `titleScreenDraw()` (patches 8, 9) + a new private method | Under `headlessTitle`: `loginscreen === 0` draws `armedLabel` then one centred "Login" button instead of `Waiting for idlescape...`; `loginscreen === 2` keeps `loginMes1/2` and draws the same button so a failed login can be retried. No username or password fields are ever drawn. | `private drawArmedLoginButton(w: number, h: number): void {` |
| 25 | `titleScreenLoop()` (patch 7) + a new private method | Under `headlessTitle`: fire a pending hook login as before, otherwise hit-test the Login button and log in with the armed credentials. Screen-space geometry mirrors the stock title buttons, so the button sits at native canvas (394, 306) on a 789x532 canvas. | `private armedLoginHit(): boolean {` |
| 26 | `mainredraw()` (after the error check) | `if (this.renderSuspended && this.ingame) return;` — draw is the only thing suspended; `mainloop()` keeps reading packets, moving entities and building maps (phase-a F1, F4). | `if (this.renderSuspended && this.ingame) {` |
| 27 | idle block in `gameLoop()` | `!this.attended &&` guard on the 90 s `IDLE_TIMER` send. **Production-only for the engine effect** (`world.json` `node.debug: true` makes `IdleTimerHandler` a no-op today — phase-a critic report row 10); the client-side effect, avoiding `logoutTimer = 250` turning a `lostCon()` into a hard logout, applies now. | `if (!this.attended && now - this.idleTimer > 90_000) {` |
```

Also add to the reserved-names paragraph: "`bundle.ts` additionally reserves `armLogin`, `loginArmed`, `setRenderSuspended`, `setAttended` (SP7)."

- [ ] **Step 6: Typecheck, test and build the client**

Run: `cd client && ~/.bun/bin/bunx tsc --noEmit && ~/.bun/bin/bun test src/hooks src/plugins && ~/.bun/bin/bun run build:dev`
Expected: typecheck clean, all hook and plugin tests pass, `client.js` emitted.

Run the PATCHES.md verification block from Step 5 and confirm every count matches.

- [ ] **Step 7: Commit**

```bash
git add client/src/client/Client.ts client/PATCHES.md
git commit -m "feat(client): single Login title button, render-suspend and idle guards (patches 24-27)"
```

---
### Task 3: `web/play.html` and the per-iframe loader

**Files:**
- Create: `web/play.html`, `web/src/play.ts`
- Modify: `web/vite.config.ts`, `server/src/router.ts`
- Test: `server/src/router.test.ts` (append)

**Interfaces:**
- Consumes: `loadClient()` from `web/src/clientHost.ts` (unchanged), `classify` from `server/src/router.ts`.
- Produces: the document served at `/play.html` whose realm exposes `window.idlescape.client` (a `ClientHooks`) and `window.idlescape.plugins`; `classify('/play.html', false) === { kind: 'page', file: 'play.html' }`.

- [ ] **Step 1: Write the failing router test** (append to `server/src/router.test.ts`)

```ts
describe('the per-character client page', () => {
  test('/play.html is served as a page from web/dist', () => {
    expect(classify('/play.html', false)).toEqual({ kind: 'page', file: 'play.html' });
  });
  test('the WebSocket upgrade path is unaffected', () => {
    expect(classify('/', true)).toEqual({ kind: 'ws' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && ~/.bun/bin/bun test src/router.test.ts`
Expected: FAIL — `/play.html` currently classifies as `{ kind: 'notfound' }`.

- [ ] **Step 3: Add the route**

In `server/src/router.ts`, `classify()`, directly after the `/styleguide` line:

```ts
  // One same-origin document per character (SP7); the gate cookie covers it like the index.
  if (pathname === '/play.html') return { kind: 'page', file: 'play.html' };
```

`serveStatic` already handles `page` (reads `env.webDist/<file>` with `cache-control: no-cache`), and `index.ts` applies the gate before dispatch, so a gated visitor gets the same 401 as for `/`.

- [ ] **Step 4: Write `web/play.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="color-scheme" content="dark">
  <title>idlescape client</title>
  <style>
    html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
    #canvas { display: block; width: 100%; height: 100%; background: #000; user-select: none; outline: none; -webkit-tap-highlight-color: transparent; }
  </style>
</head>
<body>
<canvas id="canvas" width="789" height="532" tabindex="0" aria-label="Game view">Your browser cannot run the web client.</canvas>
<script type="module" src="/src/play.ts"></script>
</body>
</html>
```

The canvas keeps the native 789x532 backing store the client draws into; the parent sizes the **iframe**, and the CSS stretches the canvas to fill it, so `frame/canvasSize.ts`'s maths is unchanged.

- [ ] **Step 5: Write `web/src/play.ts`**

```ts
// web/src/play.ts -- the entry point of one character's client document (web/play.html).
//
// This runs inside the shell's iframe, never in the parent. `loadClient()` imports the 274
// bundle and constructs `Client`, which installs `window.idlescape.{client,plugins}` into *this*
// realm; the parent reaches them through `iframe.contentWindow`. Nothing here knows which
// character it is: the parent arms the credentials with `hooks.armLogin(...)` once it sees the
// hooks appear, and the title screen's Login button does the rest.
import { loadClient } from './clientHost';

void loadClient().catch((err: unknown) => {
  console.error('[idlescape] client failed to load', err);
  const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
  const ctx = canvas?.getContext('2d');
  if (!ctx || !canvas) return;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#e0a030';
  ctx.font = '14px sans-serif';
  ctx.fillText('Could not start the game client. Reload the page.', 24, 40);
});
```

- [ ] **Step 6: Add the page to the Vite build**

In `web/vite.config.ts`, extend `rollupOptions.input`:

```ts
    // Three pages: the app, one client document per character (SP7), and the living styleguide.
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), play: resolve(__dirname, 'play.html'), styleguide: resolve(__dirname, 'styleguide.html') } }
```

The dev server needs no change: Vite serves `play.html` from the project root, and the existing `/client`, cache-prefix and WebSocket proxies apply to the iframe's requests because it is the same origin.

- [ ] **Step 7: Run the checks**

Run: `cd server && ~/.bun/bin/bun test src/router.test.ts`
Expected: pass.

Run: `cd web && npm run typecheck && npm run lint && npx vite build`
Expected: pass; `web/dist/play.html` exists.

Verify by hand: `ls web/dist/play.html`.

- [ ] **Step 8: Commit**

```bash
git add web/play.html web/src/play.ts web/vite.config.ts server/src/router.ts server/src/router.test.ts
git commit -m "feat(web): per-character client document at /play.html"
```

---

### Task 4: Character session manager

**Files:**
- Create: `web/src/sessions/types.ts`, `web/src/sessions/manager.ts`
- Test: `web/src/sessions/types.test.ts`, `web/src/sessions/manager.test.ts`

**Interfaces:**
- Consumes: `ClientHooks`, `LoginResult` (`web/src/clientTypes.ts`), `CharacterSummary` (`web/src/types.ts`), `mintSession` (passed in as a dep, not imported, so the manager stays testable).
- Produces `web/src/sessions/types.ts`:
  ```ts
  export type SessionState = 'booting' | 'title' | 'connecting' | 'online' | 'offline';
  export type SessionStatus = 'offline' | 'connecting' | 'online';
  export interface CharacterSession {
    readonly id: string;
    character: CharacterSummary;
    iframe: HTMLIFrameElement;
    hooks: ClientHooks | null;
    state: SessionState;
    startedAt: number;
    lastStateAt: number;
  }
  export interface SessionInputs { hooks: boolean; loggedIn: boolean; pendingLogin: boolean; disconnected: boolean }
  export function deriveSessionState(i: SessionInputs): SessionState;
  export function displayStatus(s: SessionState): SessionStatus;
  ```
  and `web/src/sessions/manager.ts`:
  ```ts
  export interface SessionManagerDeps {
    host: HTMLElement;
    mintSession(characterId: string): Promise<{ gameName: string; secret: string }>;
    onReady(session: CharacterSession): void;
    onChange(sessions: CharacterSession[]): void;
    /** Testing seam; the default creates a real <iframe src="/play.html">. */
    createFrame?(character: CharacterSummary): HTMLIFrameElement;
    now?(): number;
    pollMs?: number;        // default 1000
    readyTimeoutMs?: number; // default 30000
  }
  export interface CharacterSessionManager {
    /** The account's live characters; `activate` opens an unopened one from this roster. */
    setCharacters(characters: CharacterSummary[]): void;
    open(character: CharacterSummary): Promise<CharacterSession>;
    activate(characterId: string): Promise<CharacterSession | null>;
    login(characterId: string): Promise<LoginResult>;
    close(characterId: string): void;
    get(characterId: string): CharacterSession | undefined;
    list(): CharacterSession[];
    active(): CharacterSession | null;
    activeId(): string | null;
    states(): Record<string, SessionState>;
    dispose(): void;
  }
  export const READY_TIMEOUT_MESSAGE = 'The game client did not start. Reload the page and try again.';
  export function createSessionManager(deps: SessionManagerDeps): CharacterSessionManager;
  ```

- [ ] **Step 1: Write the failing state-derivation test**

```ts
// web/src/sessions/types.test.ts
import { describe, expect, test } from 'vitest';
import { deriveSessionState, displayStatus } from './types';

const inputs = (over: Partial<Parameters<typeof deriveSessionState>[0]> = {}) =>
  ({ hooks: true, loggedIn: false, pendingLogin: false, disconnected: false, ...over });

describe('deriveSessionState', () => {
  test('no hooks yet is booting, whatever else is set', () => {
    expect(deriveSessionState(inputs({ hooks: false }))).toBe('booting');
    expect(deriveSessionState(inputs({ hooks: false, pendingLogin: true }))).toBe('booting');
  });
  test('logged in wins over everything else', () => {
    expect(deriveSessionState(inputs({ loggedIn: true, pendingLogin: true, disconnected: true }))).toBe('online');
  });
  test('a login in flight is connecting', () => {
    expect(deriveSessionState(inputs({ pendingLogin: true }))).toBe('connecting');
  });
  test('a dropped connection is offline until the login or logout event lands', () => {
    expect(deriveSessionState(inputs({ disconnected: true }))).toBe('offline');
  });
  test('an armed but unpressed title screen is title', () => {
    expect(deriveSessionState(inputs())).toBe('title');
  });
});

describe('displayStatus', () => {
  test('collapses the five internal states onto the three the strip shows', () => {
    expect(displayStatus('booting')).toBe('offline');
    expect(displayStatus('title')).toBe('offline');
    expect(displayStatus('offline')).toBe('offline');
    expect(displayStatus('connecting')).toBe('connecting');
    expect(displayStatus('online')).toBe('online');
  });
});
```

- [ ] **Step 2: Write the failing manager test**

```ts
// web/src/sessions/manager.test.ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createSessionManager } from './manager';
import type { CharacterSession } from './types';
import type { ClientHooks, ClientState, HookEvents, LoginResult } from '../clientTypes';
import type { CharacterSummary } from '../types';

const character = (id: string, gameName: string): CharacterSummary => ({ id, gameName, createdAt: 1, lastLoginAt: null });

interface FakeClient {
  hooks: ClientHooks;
  emit<E extends keyof HookEvents>(event: E, payload: HookEvents[E]): void;
  loggedIn: boolean;
  armed: [string, string, string | undefined][];
  suspended: boolean[];
  attended: boolean[];
  loginArmedCalls: number;
  loginResult: LoginResult;
  logoutCalls: number;
}

function fakeClient(): FakeClient {
  const handlers = new Map<string, Set<(p: unknown) => void>>();
  const self: FakeClient = {
    loggedIn: false, armed: [], suspended: [], attended: [], loginArmedCalls: 0, logoutCalls: 0,
    loginResult: { ok: true },
    emit: (event, payload) => { for (const h of handlers.get(event as string) ?? []) h(payload); },
    hooks: {
      login: () => Promise.resolve<LoginResult>({ ok: true }),
      armLogin: (gameName, secret, label) => { self.armed.push([gameName, secret, label]); },
      loginArmed: () => { self.loginArmedCalls++; return Promise.resolve(self.loginResult); },
      logout: () => { self.logoutCalls++; self.loggedIn = false; self.emit('logout', {}); },
      setRenderSuspended: v => { self.suspended.push(v); },
      setAttended: v => { self.attended.push(v); },
      echoChat: () => {},
      getState: () => ({ loggedIn: self.loggedIn } as ClientState),
      getObjName: () => null,
      getWorldState: () => { throw new Error('unused'); },
      dispatch: () => { throw new Error('unused'); },
      on: (event, handler) => {
        const set = handlers.get(event) ?? new Set();
        set.add(handler as (p: unknown) => void);
        handlers.set(event, set);
        return () => set.delete(handler as (p: unknown) => void);
      }
    } as unknown as ClientHooks
  };
  return self;
}

/** A real <iframe> (so appendChild works in jsdom) with a scripted contentWindow. */
function frameFor(client: FakeClient, readyAfterMs: number): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  const start = Date.now();
  Object.defineProperty(iframe, 'contentWindow', {
    get: () => (Date.now() - start >= readyAfterMs ? { idlescape: { client: client.hooks }, focus: () => {} } : {})
  });
  return iframe;
}

describe('createSessionManager', () => {
  let host: HTMLElement;
  beforeEach(() => { vi.useFakeTimers(); host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { vi.useRealTimers(); host.remove(); });

  function build(clients: Record<string, FakeClient>) {
    const changes: CharacterSession[][] = [];
    const ready: string[] = [];
    const manager = createSessionManager({
      host,
      createFrame: c => frameFor(clients[c.id], 0),
      mintSession: async id => ({ gameName: `name_${id}`, secret: `s_${id}` }),
      onReady: s => { ready.push(s.id); },
      onChange: s => { changes.push(s); },
      pollMs: 1000
    });
    manager.setCharacters(Object.keys(clients).map(id => character(id, `name_${id}`)));
    return { manager, changes, ready };
  }

  test('open creates one iframe, mints credentials and arms the client', async () => {
    const a = fakeClient();
    const { manager, ready } = build({ a });
    const session = await manager.open(character('a', 'alpha'));
    expect(host.querySelectorAll('iframe')).toHaveLength(1);
    expect(session.iframe.dataset.character).toBe('a');
    expect(a.armed).toEqual([['name_a', 's_a', 'name_a']]);
    expect(session.state).toBe('title');
    expect(ready).toEqual(['a']);
  });

  test('open is single-flight per character', async () => {
    const a = fakeClient();
    const { manager } = build({ a });
    const [one, two] = await Promise.all([manager.open(character('a', 'alpha')), manager.open(character('a', 'alpha'))]);
    expect(one).toBe(two);
    expect(host.querySelectorAll('iframe')).toHaveLength(1);
    expect(a.armed).toHaveLength(1);
  });

  test('activate hides and suspends the others, resumes and shows the chosen one', async () => {
    const a = fakeClient();
    const b = fakeClient();
    const { manager } = build({ a, b });
    await manager.open(character('a', 'alpha'));
    await manager.activate('a');
    await manager.activate('b');   // opens b lazily
    expect(manager.activeId()).toBe('b');
    expect(manager.get('a')!.iframe.classList.contains('hidden')).toBe(true);
    expect(manager.get('b')!.iframe.classList.contains('hidden')).toBe(false);
    expect(a.suspended.at(-1)).toBe(true);
    expect(b.suspended.at(-1)).toBe(false);
    // A background character is minded by the shell, so it must not idle itself out.
    expect(a.attended.at(-1)).toBe(true);
  });

  test('login moves the session through connecting to online', async () => {
    const a = fakeClient();
    const { manager } = build({ a });
    await manager.activate('a');
    const pending = manager.login('a');
    expect(manager.get('a')!.state).toBe('connecting');
    a.loggedIn = true;
    a.emit('login', { gameName: 'name_a' });
    await expect(pending).resolves.toEqual({ ok: true });
    expect(manager.get('a')!.state).toBe('online');
    expect(a.loginArmedCalls).toBe(1);
  });

  test('logout returns the session to the title screen and disconnect marks it offline', async () => {
    const a = fakeClient();
    const { manager } = build({ a });
    await manager.activate('a');
    await manager.login('a');
    a.loggedIn = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(manager.get('a')!.state).toBe('online');
    a.hooks.logout();
    await vi.advanceTimersByTimeAsync(1000);
    expect(manager.get('a')!.state).toBe('title');
    a.emit('disconnect', { code: 0 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(manager.get('a')!.state).toBe('offline');
  });

  test('the 1 s poll reports a state change exactly once', async () => {
    const a = fakeClient();
    const { manager, changes } = build({ a });
    await manager.activate('a');
    const before = changes.length;
    a.loggedIn = true;
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(changes.length).toBe(before + 1);
    expect(manager.states()).toEqual({ a: 'online' });
  });

  test('close logs out, drops the iframe and falls back to the previous character', async () => {
    const a = fakeClient();
    const b = fakeClient();
    const { manager } = build({ a, b });
    await manager.activate('a');
    await manager.activate('b');
    manager.close('b');
    expect(b.logoutCalls).toBe(1);
    expect(host.querySelectorAll('iframe')).toHaveLength(1);
    expect(manager.get('b')).toBeUndefined();
    expect(manager.activeId()).toBe('a');
    expect(manager.get('a')!.iframe.classList.contains('hidden')).toBe(false);
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `cd web && npx vitest run src/sessions`
Expected: FAIL — `./types` and `./manager` do not exist.

- [ ] **Step 4: Implement `web/src/sessions/types.ts`**

```ts
// web/src/sessions/types.ts
import type { ClientHooks } from '../clientTypes';
import type { CharacterSummary } from '../types';

/** Internal lifecycle of one character's client. */
export type SessionState = 'booting' | 'title' | 'connecting' | 'online' | 'offline';
/** What the tab strip and the Characters panel actually show. */
export type SessionStatus = 'offline' | 'connecting' | 'online';

export interface CharacterSession {
  readonly id: string;
  character: CharacterSummary;
  iframe: HTMLIFrameElement;
  /** Null until the iframe's client has installed its hooks. */
  hooks: ClientHooks | null;
  state: SessionState;
  startedAt: number;
  lastStateAt: number;
}

export interface SessionInputs {
  /** The iframe's `window.idlescape.client` is present. */
  hooks: boolean;
  /** `getState().loggedIn`. */
  loggedIn: boolean;
  /** A `loginArmed()` call has not settled yet. */
  pendingLogin: boolean;
  /** The `disconnect` hook event fired and no `login`/`logout` has cleared it. */
  disconnected: boolean;
}

/**
 * The one place the five states come from. `loggedIn` is authoritative because it is polled
 * from the client itself; the flags only decide how a *not* logged-in session is described.
 */
export function deriveSessionState(i: SessionInputs): SessionState {
  if (!i.hooks) return 'booting';
  if (i.loggedIn) return 'online';
  if (i.pendingLogin) return 'connecting';
  if (i.disconnected) return 'offline';
  return 'title';
}

export function displayStatus(s: SessionState): SessionStatus {
  if (s === 'online') return 'online';
  if (s === 'connecting') return 'connecting';
  return 'offline';
}
```

- [ ] **Step 5: Implement `web/src/sessions/manager.ts`**

```ts
// web/src/sessions/manager.ts
import type { ClientHooks, ClientPluginRegistry, LoginResult } from '../clientTypes';
import type { CharacterSummary } from '../types';
import { deriveSessionState, type CharacterSession, type SessionState } from './types';

export const READY_TIMEOUT_MESSAGE = 'The game client did not start. Reload the page and try again.';
const PLAY_URL = '/play.html';
const READY_POLL_MS = 50;
const DEFAULT_POLL_MS = 1000;
const DEFAULT_READY_TIMEOUT_MS = 30_000;

/** The realm inside one client iframe. */
export type ClientFrameWindow = Window & { idlescape?: { client?: ClientHooks | null; plugins?: ClientPluginRegistry | null } };

export interface SessionManagerDeps {
  host: HTMLElement;
  mintSession(characterId: string): Promise<{ gameName: string; secret: string }>;
  /** Called once per session, as soon as its hooks exist and its credentials are armed. */
  onReady(session: CharacterSession): void;
  onChange(sessions: CharacterSession[]): void;
  /** Testing seam; the default creates a real `<iframe src="/play.html">`. */
  createFrame?(character: CharacterSummary): HTMLIFrameElement;
  now?(): number;
  pollMs?: number;
  readyTimeoutMs?: number;
}

export interface CharacterSessionManager {
  open(character: CharacterSummary): Promise<CharacterSession>;
  activate(characterId: string): Promise<CharacterSession | null>;
  login(characterId: string): Promise<LoginResult>;
  close(characterId: string): void;
  get(characterId: string): CharacterSession | undefined;
  list(): CharacterSession[];
  active(): CharacterSession | null;
  activeId(): string | null;
  states(): Record<string, SessionState>;
  dispose(): void;
}

interface Entry {
  session: CharacterSession;
  pendingLogin: boolean;
  disconnected: boolean;
  cancelled: boolean;
  unsubscribe: () => void;
}

export function frameWindow(session: CharacterSession | null): ClientFrameWindow | null {
  return (session?.iframe.contentWindow as ClientFrameWindow | null) ?? null;
}

export function createSessionManager(deps: SessionManagerDeps): CharacterSessionManager {
  const entries = new Map<string, Entry>();
  const opening = new Map<string, Promise<CharacterSession>>();
  /** Characters the account owns, so `activate` can open one that has never been opened. */
  const roster = new Map<string, CharacterSummary>();
  const now = deps.now ?? (() => Date.now());
  const pollMs = deps.pollMs ?? DEFAULT_POLL_MS;
  const readyTimeoutMs = deps.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  let activeId: string | null = null;

  const defaultFrame = (character: CharacterSummary): HTMLIFrameElement => {
    const iframe = document.createElement('iframe');
    iframe.src = PLAY_URL;
    iframe.title = `${character.gameName} game view`;
    return iframe;
  };
  const makeFrame = deps.createFrame ?? defaultFrame;

  function emit(): void {
    deps.onChange(list());
  }

  function list(): CharacterSession[] {
    return [...entries.values()].map(e => e.session).sort((a, b) => a.character.createdAt - b.character.createdAt);
  }

  /** Recomputes one session's state; returns true when it moved. */
  function refresh(entry: Entry): boolean {
    const next = deriveSessionState({
      hooks: entry.session.hooks !== null,
      loggedIn: entry.session.hooks?.getState().loggedIn ?? false,
      pendingLogin: entry.pendingLogin,
      disconnected: entry.disconnected
    });
    if (next === entry.session.state) return false;
    entry.session.state = next;
    entry.session.lastStateAt = now();
    return true;
  }

  function refreshAll(): void {
    let moved = false;
    for (const entry of entries.values()) moved = refresh(entry) || moved;
    if (moved) emit();
  }

  const poll = setInterval(refreshAll, pollMs);

  /**
   * Polls `contentWindow` rather than listening for `idlescape:client-ready`: the iframe's window
   * is replaced during navigation, so a listener attached before the document exists is lost.
   */
  function waitForHooks(entry: Entry): Promise<ClientHooks> {
    const deadline = now() + readyTimeoutMs;
    return new Promise<ClientHooks>((resolve, reject) => {
      const tick = (): void => {
        if (entry.cancelled) { reject(new Error('session closed')); return; }
        const hooks = frameWindow(entry.session)?.idlescape?.client ?? null;
        if (hooks) { resolve(hooks); return; }
        if (now() > deadline) { reject(new Error(READY_TIMEOUT_MESSAGE)); return; }
        setTimeout(tick, READY_POLL_MS);
      };
      tick();
    });
  }

  function subscribe(entry: Entry, hooks: ClientHooks): void {
    const offs = [
      hooks.on('login', () => { entry.disconnected = false; entry.pendingLogin = false; if (refresh(entry)) emit(); }),
      hooks.on('logout', () => { entry.disconnected = false; entry.pendingLogin = false; if (refresh(entry)) emit(); }),
      hooks.on('disconnect', () => { entry.disconnected = true; if (refresh(entry)) emit(); })
    ];
    entry.unsubscribe = () => { for (const off of offs) off(); };
  }

  async function openInner(character: CharacterSummary): Promise<CharacterSession> {
    const iframe = makeFrame(character);
    iframe.className = 'client-frame hidden';
    iframe.dataset.character = character.id;
    const session: CharacterSession = {
      id: character.id, character, iframe, hooks: null,
      state: 'booting', startedAt: now(), lastStateAt: now()
    };
    const entry: Entry = { session, pendingLogin: false, disconnected: false, cancelled: false, unsubscribe: () => {} };
    entries.set(character.id, entry);
    deps.host.appendChild(iframe);
    emit();

    const hooks = await waitForHooks(entry);
    session.hooks = hooks;
    subscribe(entry, hooks);
    // The credentials never touch the iframe URL: they are handed straight across the same-origin
    // boundary, and the title screen's Login button is the only thing that uses them.
    const creds = await deps.mintSession(character.id);
    hooks.armLogin(creds.gameName, creds.secret, creds.gameName);
    // Every session is minded by the shell for its whole life (client patch 27).
    hooks.setAttended(true);
    hooks.setRenderSuspended(activeId !== character.id);
    refresh(entry);
    deps.onReady(session);
    emit();
    return session;
  }

  function open(character: CharacterSummary): Promise<CharacterSession> {
    const existing = entries.get(character.id);
    if (existing) return Promise.resolve(existing.session);
    const inFlight = opening.get(character.id);
    if (inFlight) return inFlight;
    const p = openInner(character).finally(() => opening.delete(character.id));
    opening.set(character.id, p);
    return p;
  }

  function show(characterId: string | null): void {
    for (const entry of entries.values()) {
      const isActive = entry.session.id === characterId;
      entry.session.iframe.classList.toggle('hidden', !isActive);
      entry.session.hooks?.setRenderSuspended(!isActive);
    }
    activeId = characterId;
    if (characterId === null) return;
    const session = entries.get(characterId)?.session;
    const canvas = session?.iframe.contentDocument?.getElementById('canvas');
    frameWindow(session ?? null)?.focus?.();
    (canvas as HTMLElement | null)?.focus?.();
  }

  return {
    open,

    setCharacters(characters: CharacterSummary[]): void {
      roster.clear();
      for (const c of characters) {
        roster.set(c.id, c);
        const entry = entries.get(c.id);
        if (entry) entry.session.character = c;
      }
    },

    async activate(characterId: string): Promise<CharacterSession | null> {
      const known = entries.get(characterId)?.session ?? null;
      const character = roster.get(characterId);
      if (!known && !character) return null;
      // Lazily create the iframe on first activation (spec section 5, decision 1).
      const session = known ?? (await open(character!));
      show(characterId);
      emit();
      return session;
    },

    login(characterId: string): Promise<LoginResult> {
      const entry = entries.get(characterId);
      const hooks = entry?.session.hooks;
      if (!entry || !hooks) return Promise.resolve<LoginResult>({ ok: false, code: -1, reason: READY_TIMEOUT_MESSAGE });
      entry.pendingLogin = true;
      if (refresh(entry)) emit();
      return hooks.loginArmed().finally(() => {
        entry.pendingLogin = false;
        if (refresh(entry)) emit();
      });
    },

    close(characterId: string): void {
      const entry = entries.get(characterId);
      if (!entry) return;
      entry.cancelled = true;
      entry.unsubscribe();
      entry.session.hooks?.logout();
      entry.session.iframe.remove();
      entries.delete(characterId);
      if (activeId === characterId) {
        const next = list().at(-1) ?? null;
        show(next?.id ?? null);
      }
      emit();
    },

    get: id => entries.get(id)?.session,
    list,
    active: () => (activeId ? entries.get(activeId)?.session ?? null : null),
    activeId: () => activeId,
    states: () => Object.fromEntries(list().map(s => [s.id, s.state])),
    dispose(): void {
      clearInterval(poll);
      for (const id of [...entries.keys()]) {
        const entry = entries.get(id)!;
        entry.cancelled = true;
        entry.unsubscribe();
        entry.session.iframe.remove();
        entries.delete(id);
      }
      activeId = null;
    }
  };
}
```

Two details the tests pin down. `open` sets `setRenderSuspended(activeId !== character.id)` so a frame that boots while it is *not* the active tab starts suspended. `close` falls back to the last remaining session (`list().at(-1)`), which is "the previous character" in `createdAt` order.

- [ ] **Step 6: Run the tests**

Run: `cd web && npx vitest run src/sessions && npm run typecheck && npm run lint`
Expected: pass (5 derivation cases, 7 manager cases).

- [ ] **Step 7: Commit**

```bash
git add web/src/sessions
git commit -m "feat(web): character session manager with per-iframe clients, armed login and 1s status polling"
```

---
### Task 5: The character tab strip in the frame

**Files:**
- Create: `web/src/frame/characterTabs.ts`, `web/src/styles/tabs.css`
- Modify: `web/src/partials/frame.html`, `web/src/styles/index.css`
- Test: `web/src/frame/characterTabs.test.ts`

**Interfaces:**
- Consumes: `CharacterSummary` (`web/src/types.ts`), `SessionState`, `displayStatus` (Task 4).
- Produces:
  ```ts
  export const TAB_SLOTS = 3;
  export const NEW_CHARACTER_LABEL = '+ New character';
  export const GUEST_LOCK_TOOLTIP = 'Create an account to unlock a third character';
  export const MORE_LABEL = 'Add more';
  export const COMING_SOON = 'coming soon';

  export type TabSlot =
    | { kind: 'character'; index: number; characterId: string; label: string; status: SessionStatus; active: boolean; disabled: false; tooltip: string }
    | { kind: 'empty'; index: number; label: string; disabled: false }
    | { kind: 'locked'; index: number; label: string; disabled: true; tooltip: string }
    | { kind: 'more'; index: number; label: string; note: string; disabled: true; tooltip: string };

  export interface TabsInput { characters: CharacterSummary[]; limit: number; states: Record<string, SessionState>; activeId: string | null }
  export function computeSlots(input: TabsInput): TabSlot[];               // always TAB_SLOTS + 1 entries
  export interface TabsDeps { onSelect(characterId: string): void; onNew(): void }
  export function createCharacterTabs(root: HTMLElement, deps: TabsDeps): { render(input: TabsInput): void };
  ```

- [ ] **Step 1: Write the failing test**

```ts
// web/src/frame/characterTabs.test.ts
import { describe, expect, test, vi } from 'vitest';
import {
  COMING_SOON, GUEST_LOCK_TOOLTIP, MORE_LABEL, NEW_CHARACTER_LABEL, TAB_SLOTS,
  computeSlots, createCharacterTabs, type TabsInput
} from './characterTabs';
import type { CharacterSummary } from '../types';

const c = (id: string, gameName: string, createdAt: number): CharacterSummary => ({ id, gameName, createdAt, lastLoginAt: null });
const input = (over: Partial<TabsInput> = {}): TabsInput => ({ characters: [], limit: 3, states: {}, activeId: null, ...over });

describe('computeSlots', () => {
  test('always renders three character slots plus the Add more slot', () => {
    expect(computeSlots(input())).toHaveLength(TAB_SLOTS + 1);
    expect(computeSlots(input({ limit: 2 }))).toHaveLength(TAB_SLOTS + 1);
  });

  test('a guest with no character sees two open slots, a locked third and coming soon', () => {
    const slots = computeSlots(input({ limit: 2 }));
    expect(slots.map(s => s.kind)).toEqual(['empty', 'empty', 'locked', 'more']);
    expect(slots[0].label).toBe(NEW_CHARACTER_LABEL);
    expect(slots[2]).toMatchObject({ kind: 'locked', disabled: true, tooltip: GUEST_LOCK_TOOLTIP });
    expect(slots[3]).toMatchObject({ kind: 'more', label: MORE_LABEL, note: COMING_SOON, disabled: true });
  });

  test('a registered account with no character sees three open slots', () => {
    expect(computeSlots(input({ limit: 3 })).map(s => s.kind)).toEqual(['empty', 'empty', 'empty', 'more']);
  });

  test('only created characters get real tabs, in createdAt order, with live status', () => {
    const slots = computeSlots(input({
      limit: 3,
      characters: [c('b', 'beta', 20), c('a', 'alpha', 10)],
      states: { a: 'online', b: 'connecting' },
      activeId: 'a'
    }));
    expect(slots.slice(0, 2)).toEqual([
      { kind: 'character', index: 0, characterId: 'a', label: 'alpha', status: 'online', active: true, disabled: false, tooltip: 'alpha · online' },
      { kind: 'character', index: 1, characterId: 'b', label: 'beta', status: 'connecting', active: false, disabled: false, tooltip: 'beta · connecting' }
    ]);
    expect(slots[2].kind).toBe('empty');
  });

  test('a character with no session yet reads offline', () => {
    const slots = computeSlots(input({ characters: [c('a', 'alpha', 1)] }));
    expect(slots[0]).toMatchObject({ kind: 'character', status: 'offline' });
  });

  test('a guest at the limit has no empty slot, only the locked one', () => {
    const slots = computeSlots(input({ limit: 2, characters: [c('a', 'alpha', 1), c('b', 'beta', 2)] }));
    expect(slots.map(s => s.kind)).toEqual(['character', 'character', 'locked', 'more']);
  });
});

describe('createCharacterTabs', () => {
  function mount(over: Partial<TabsInput> = {}) {
    const root = document.createElement('nav');
    document.body.appendChild(root);
    const onSelect = vi.fn();
    const onNew = vi.fn();
    const tabs = createCharacterTabs(root, { onSelect, onNew });
    tabs.render(input(over));
    return { root, tabs, onSelect, onNew };
  }

  test('renders a tablist with one button per slot and the exact copy', () => {
    const { root } = mount({ limit: 2 });
    expect(root.getAttribute('role')).toBe('tablist');
    expect(root.querySelectorAll('button')).toHaveLength(4);
    expect(root.textContent).toContain(NEW_CHARACTER_LABEL);
    expect(root.textContent).toContain(MORE_LABEL);
    expect(root.textContent).toContain(COMING_SOON);
    expect(root.querySelector('[data-char-tab-locked]')!.getAttribute('title')).toBe(GUEST_LOCK_TOOLTIP);
  });

  test('a character tab reports its id and marks the active one', () => {
    const { root, onSelect } = mount({ characters: [c('a', 'alpha', 1), c('b', 'beta', 2)], states: { a: 'online' }, activeId: 'a' });
    const tabA = root.querySelector<HTMLButtonElement>('[data-char-tab="a"]')!;
    expect(tabA.classList.contains('active')).toBe(true);
    expect(tabA.getAttribute('aria-selected')).toBe('true');
    expect(tabA.querySelector('[data-tab-status]')!.textContent).toBe('online');
    root.querySelector<HTMLButtonElement>('[data-char-tab="b"]')!.click();
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  test('an empty slot opens the create form; disabled slots do nothing', () => {
    const { root, onNew, onSelect } = mount({ limit: 2 });
    root.querySelector<HTMLButtonElement>('[data-char-tab-new]')!.click();
    expect(onNew).toHaveBeenCalledTimes(1);
    const locked = root.querySelector<HTMLButtonElement>('[data-char-tab-locked]')!;
    const more = root.querySelector<HTMLButtonElement>('[data-char-tab-more]')!;
    expect(locked.disabled).toBe(true);
    expect(more.disabled).toBe(true);
    locked.click();
    more.click();
    expect(onNew).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('Left and Right move focus between the real tabs only', () => {
    const { root } = mount({ characters: [c('a', 'alpha', 1), c('b', 'beta', 2)], activeId: 'a' });
    const tabA = root.querySelector<HTMLButtonElement>('[data-char-tab="a"]')!;
    tabA.focus();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(root.querySelector('[data-char-tab="b"]'));
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement).toBe(tabA);
  });

  test('re-rendering replaces the strip rather than appending to it', () => {
    const { root, tabs } = mount({ characters: [c('a', 'alpha', 1)] });
    tabs.render(input({ characters: [c('a', 'alpha', 1)], states: { a: 'online' } }));
    expect(root.querySelectorAll('button')).toHaveLength(4);
    expect(root.querySelector('[data-char-tab="a"] [data-tab-status]')!.textContent).toBe('online');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run src/frame/characterTabs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `web/src/frame/characterTabs.ts`**

```ts
// web/src/frame/characterTabs.ts -- the character strip across the top of the game view.
//
// It lives in the frame (not the side panel) and is rendered by the shell, so it exists before
// any plugin mounts. Only *created* characters get a real tab; the remaining slots are the
// account's unused capacity, a locked slot beyond it, and one disabled "Add more" slot.
import { escapeHtml } from '../dom';
import { displayStatus, type SessionState, type SessionStatus } from '../sessions/types';
import type { CharacterSummary } from '../types';

/** Character slots always drawn, whatever the account's limit is (spec section 5). */
export const TAB_SLOTS = 3;
export const NEW_CHARACTER_LABEL = '+ New character';
export const GUEST_LOCK_TOOLTIP = 'Create an account to unlock a third character';
export const MORE_LABEL = 'Add more';
export const COMING_SOON = 'coming soon';

export type TabSlot =
  | { kind: 'character'; index: number; characterId: string; label: string; status: SessionStatus; active: boolean; disabled: false; tooltip: string }
  | { kind: 'empty'; index: number; label: string; disabled: false }
  | { kind: 'locked'; index: number; label: string; disabled: true; tooltip: string }
  | { kind: 'more'; index: number; label: string; note: string; disabled: true; tooltip: string };

export interface TabsInput {
  characters: CharacterSummary[];
  /** The server's limit for this account (2 for a guest, 3 for a registered user). */
  limit: number;
  states: Record<string, SessionState>;
  activeId: string | null;
}

export function computeSlots(input: TabsInput): TabSlot[] {
  const ordered = [...input.characters].sort((a, b) => a.createdAt - b.createdAt);
  const slots: TabSlot[] = [];
  for (let index = 0; index < TAB_SLOTS; index++) {
    const character = ordered[index];
    if (character) {
      const status = displayStatus(input.states[character.id] ?? 'offline');
      slots.push({
        kind: 'character', index, characterId: character.id, label: character.gameName,
        status, active: character.id === input.activeId, disabled: false,
        tooltip: `${character.gameName} · ${status}`
      });
      continue;
    }
    if (index < input.limit) {
      slots.push({ kind: 'empty', index, label: NEW_CHARACTER_LABEL, disabled: false });
      continue;
    }
    slots.push({ kind: 'locked', index, label: NEW_CHARACTER_LABEL, disabled: true, tooltip: GUEST_LOCK_TOOLTIP });
  }
  slots.push({ kind: 'more', index: TAB_SLOTS, label: MORE_LABEL, note: COMING_SOON, disabled: true, tooltip: COMING_SOON });
  return slots;
}

export interface TabsDeps {
  onSelect(characterId: string): void;
  onNew(): void;
}

function slotHtml(slot: TabSlot): string {
  if (slot.kind === 'character') {
    return `<button type="button" role="tab" class="char-tab${slot.active ? ' active' : ''}"
      data-char-tab="${escapeHtml(slot.characterId)}" title="${escapeHtml(slot.tooltip)}"
      aria-selected="${slot.active ? 'true' : 'false'}" tabindex="${slot.active ? 0 : -1}">
      <span class="char-tab-dot ${slot.status}" aria-hidden="true"></span>
      <span class="char-tab-name">${escapeHtml(slot.label)}</span>
      <span class="char-tab-status" data-tab-status>${slot.status}</span>
    </button>`;
  }
  if (slot.kind === 'empty') {
    return `<button type="button" class="char-tab char-tab-empty" data-char-tab-new tabindex="-1">
      <span class="char-tab-name">${escapeHtml(slot.label)}</span></button>`;
  }
  if (slot.kind === 'locked') {
    return `<button type="button" class="char-tab char-tab-locked" data-char-tab-locked disabled
      title="${escapeHtml(slot.tooltip)}" aria-label="${escapeHtml(slot.tooltip)}" tabindex="-1">
      <span class="char-tab-name">${escapeHtml(slot.label)}</span></button>`;
  }
  return `<button type="button" class="char-tab char-tab-more" data-char-tab-more disabled
    title="${escapeHtml(slot.tooltip)}" tabindex="-1">
    <span class="char-tab-name">${escapeHtml(slot.label)}</span>
    <span class="char-tab-status">${escapeHtml(slot.note)}</span></button>`;
}

export function createCharacterTabs(root: HTMLElement, deps: TabsDeps): { render(input: TabsInput): void } {
  root.setAttribute('role', 'tablist');
  root.setAttribute('aria-orientation', 'horizontal');
  root.setAttribute('aria-label', 'Characters');

  const realTabs = (): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>('[data-char-tab]'));

  root.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    const id = button.dataset.charTab;
    if (id) { deps.onSelect(id); return; }
    if (button.dataset.charTabNew !== undefined) deps.onNew();
  });

  // Keyboard: Left/Right (and Home/End) move between the real character tabs only; the empty and
  // disabled slots are not part of the tab ring.
  root.addEventListener('keydown', event => {
    const tabs = realTabs();
    const i = tabs.indexOf(document.activeElement as HTMLElement);
    if (i < 0 || tabs.length === 0) return;
    let next = -1;
    if (event.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    tabs[next].focus();
  });

  return {
    render(input: TabsInput): void {
      root.innerHTML = computeSlots(input).map(slotHtml).join('');
      // Something in the strip must always be reachable by Tab.
      const tabs = realTabs();
      if (tabs.length && !tabs.some(t => t.tabIndex === 0)) tabs[0].tabIndex = 0;
    }
  };
}
```

- [ ] **Step 4: Put the strip and the iframe host in the frame**

In `web/src/partials/frame.html`, insert the strip between the title bar and `.frame-body`, and replace the single `<canvas>` with the iframe host:

```html
  </header>
  <nav id="character-tabs" class="char-tabs"></nav>
  <div class="frame-body">
    <div id="stage" class="stage">
      <div id="canvas-wrap" class="canvas-wrap">
        <!-- One same-origin /play.html iframe per opened character (SP7); the canvas lives inside them. -->
        <div id="client-frames" class="client-frames"></div>
        <div id="overlays" class="overlays"></div>
```

Everything else in the partial (overlays, plugin overlays, toasts, offline card, side panel, icon strip, footer) is untouched.

- [ ] **Step 5: Style the strip**

Create `web/src/styles/tabs.css`:

```css
/* Character tabs: one row of slots across the top of the game view (SP7). */
.char-tabs { display: flex; align-items: stretch; gap: 2px; padding: 0 var(--sp-2); background: rgb(var(--rl-darker)); border-bottom: 1px solid rgb(var(--rl-border)); }
.char-tabs:empty { display: none; }
.char-tab { display: flex; align-items: center; gap: var(--sp-1); min-width: 132px; height: 28px; padding: 0 var(--sp-2); border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: transparent; color: rgb(var(--rl-text)); font-size: var(--fs-sm); white-space: nowrap; }
.char-tab:hover:not(:disabled) { background: rgb(var(--rl-hover)); color: rgb(var(--rl-strong)); }
.char-tab.active { background: rgb(var(--rl-panel)); color: rgb(var(--rl-strong)); border-bottom-color: rgb(var(--rl-orange)); }
.char-tab:focus-visible { box-shadow: inset var(--focus-ring); }
.char-tab:disabled { color: rgb(var(--rl-muted)); opacity: .55; cursor: not-allowed; }
.char-tab-name { overflow: hidden; text-overflow: ellipsis; }
.char-tab-status { margin-left: auto; color: rgb(var(--rl-muted)); font-size: var(--fs-xs); }
.char-tab-dot { width: 7px; height: 7px; border-radius: 50%; background: rgb(var(--rl-muted)); flex: none; }
.char-tab-dot.connecting { background: #d8a13a; }
.char-tab-dot.online { background: #4caf50; }
.char-tab-empty { color: rgb(var(--rl-muted)); }

/* The iframe host replaces the old single canvas; exactly one frame is visible at a time. */
.client-frames { position: relative; display: flex; justify-content: center; }
.client-frame { display: block; border: 0; background: #000; }
.client-frame.hidden { display: none; }

@media (max-width: 700px) {
  .char-tab { min-width: 0; }
  .char-tab-status { display: none; }
}
```

Add `@import './tabs.css';` to `web/src/styles/index.css` after the `frame.css` import.

- [ ] **Step 6: Run the tests**

Run: `cd web && npx vitest run src/frame && npm run typecheck && npm run lint`
Expected: pass (6 `computeSlots` cases, 5 render cases).

- [ ] **Step 7: Commit**

```bash
git add web/src/frame/characterTabs.ts web/src/frame/characterTabs.test.ts web/src/styles/tabs.css web/src/styles/index.css web/src/partials/frame.html
git commit -m "feat(web): character tab strip in the frame with slots, guest lock and coming-soon"
```

---

### Task 6: Name-first login for guests

**Files:**
- Modify: `web/src/characters/gate.ts`, `web/src/home/controller.ts`, `web/src/partials/characters.html`
- Test: `web/src/characters/gate.test.ts` (rewrite the guest cases)

**Interfaces:**
- Consumes: `listCharacters` (which returns `{ characters, limit }`), `createCharacter`, `checkName`, `friendlyCharacterError`.
- Produces (changed):
  ```ts
  // web/src/characters/gate.ts
  export interface GateDeps {
    idToken(): Promise<string>;
    /** Characters plus the character just created, if the gate created it. */
    onReady(characters: CharacterSummary[], chosen: CharacterSummary, created: boolean): void;
    onError(message: string): void;
    setState(s: AppState): void;
  }
  export interface CharactersGate {
    enter(identity: Identity): Promise<void>;
    cached(): CharacterSummary[];
    /** The account's server-side character limit; 0 before the first successful listing. */
    limit(): number;
    refresh(): Promise<CharacterSummary[]>;
  }
  // web/src/home/controller.ts
  export interface HomeControllerDeps {
    setState(s: AppState): void;
    onIdentity(identity: Identity | null): void;
    gameName(): string | null;
    /** Hands the frame the account's characters and the one to open. */
    enterFrame(characters: CharacterSummary[], chosen: CharacterSummary, created: boolean): void;
  }
  export interface HomeController { /* ...unchanged... */ characterLimit(): number }
  ```
  `GateDeps.isAnonymous` is removed: the gate no longer behaves differently for guests.

- [ ] **Step 1: Write the failing gate tests**

Replace the guest cases in `web/src/characters/gate.test.ts` with these (keep the file's existing fixture/DOM setup, which mounts `characters.html`'s markup and stubs `../characters/api`):

```ts
  test('a guest with no character gets the naming form, not a silent creation', async () => {
    listCharacters.mockResolvedValue({ characters: [], limit: 2 });
    await gate.enter({ uid: 'g1', isAnonymous: true, email: null, displayName: null });
    expect(createCharacter).not.toHaveBeenCalled();
    expect(setState).toHaveBeenCalledWith('characters');
    expect(onReady).not.toHaveBeenCalled();
  });

  test('a registered user with no character gets the same form', async () => {
    listCharacters.mockResolvedValue({ characters: [], limit: 3 });
    await gate.enter({ uid: 'u1', isAnonymous: false, email: 'a@b.c', displayName: null });
    expect(setState).toHaveBeenCalledWith('characters');
  });

  test('submitting the form creates the character and reports it as freshly created', async () => {
    listCharacters.mockResolvedValue({ characters: [], limit: 2 });
    createCharacter.mockResolvedValue({ id: 'c1', gameName: 'zed', createdAt: 1, lastLoginAt: null });
    await gate.enter({ uid: 'g1', isAnonymous: true, email: null, displayName: null });
    root.querySelector<HTMLInputElement>('#char-name')!.value = 'Zed';
    root.querySelector<HTMLFormElement>('#char-create-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(createCharacter).toHaveBeenCalledWith('token', 'Zed');
    expect(onReady).toHaveBeenCalledWith([{ id: 'c1', gameName: 'zed', createdAt: 1, lastLoginAt: null }], { id: 'c1', gameName: 'zed', createdAt: 1, lastLoginAt: null }, true);
  });

  test('an existing character is handed over without the form and is not marked created', async () => {
    const existing = { id: 'c0', gameName: 'alpha', createdAt: 1, lastLoginAt: null };
    listCharacters.mockResolvedValue({ characters: [existing], limit: 3 });
    await gate.enter({ uid: 'u1', isAnonymous: false, email: 'a@b.c', displayName: null });
    expect(onReady).toHaveBeenCalledWith([existing], existing, false);
    expect(setState).not.toHaveBeenCalledWith('characters');
  });

  test('the limit from the listing is exposed to the shell', async () => {
    listCharacters.mockResolvedValue({ characters: [], limit: 2 });
    await gate.enter({ uid: 'g1', isAnonymous: true, email: null, displayName: null });
    expect(gate.limit()).toBe(2);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run src/characters/gate.test.ts`
Expected: FAIL — the guest branch still auto-creates, `onReady` takes two arguments, `limit()` does not exist.

- [ ] **Step 3: Change the gate**

In `web/src/characters/gate.ts`:

1. Update the file's doc comment: guests now name their character exactly like registered users; the gate shows the form whenever the account has no character.
2. Drop `isAnonymous` from `GateDeps` and add `created: boolean` to `onReady`.
3. Add `let limit = 0;` next to `cached`, set it from every listing, and expose `limit: () => limit`.
4. `create()` reports the creation:

```ts
  async function create(name: string): Promise<string | null> {
    toggleVisible(q('char-busy'), true);
    try {
      const created = await createCharacter(await deps.idToken(), name);
      cached = [...cached, created];
      deps.onReady(cached, created, true);
      return null;
    } catch (err) {
      return friendlyCharacterError((err as Error).message);
    } finally {
      toggleVisible(q('char-busy'), false);
    }
  }
```

5. The submit handler always passes a name (the input is `required`, so the browser blocks an empty submit):

```ts
  q<HTMLFormElement>('char-create-form').addEventListener('submit', e => {
    e.preventDefault();
    setError(null);
    const name = q<HTMLInputElement>('char-name').value.trim();
    if (!name) { setError('Choose a name for your character.'); return; }
    void create(name).then(setError);
  });
```

6. `enter()` loses the anonymous branch entirely:

```ts
    async enter(identity: Identity): Promise<void> {
      void identity;   // the gate no longer branches on who is signing in
      try {
        const listed = await listCharacters(await deps.idToken());
        cached = listed.characters;
        limit = listed.limit;
      } catch {
        deps.onError(LIST_FAILED);
        return;
      }
      const first = cached[0];
      if (first) { deps.onReady(cached, first, false); return; }
      // Zero characters: guest or registered, the player names this one (owner requirement 1).
      setError(null);
      deps.setState('characters');
      q<HTMLInputElement>('char-name').focus();
    },
```

  If `enter(identity)` ends up with an unused parameter that the linter rejects, change the signature to `enter(): Promise<void>` and update the two call sites in `home/controller.ts`.

7. `refresh()` also records the limit:

```ts
    async refresh(): Promise<CharacterSummary[]> {
      const listed = await listCharacters(await deps.idToken());
      cached = listed.characters;
      limit = listed.limit;
      return cached;
    }
```

- [ ] **Step 4: Change the home controller**

In `web/src/home/controller.ts`:

- Rename `HomeControllerDeps.startSession` to `enterFrame(characters, chosen, created)`.
- Gate construction drops `isAnonymous` and forwards the third argument:

```ts
  const gate = createCharactersGate(byId('screen-characters'), {
    idToken: currentIdToken,
    onReady: (all, chosen, created) => deps.enterFrame(all, chosen, created),
    onError: message => { /* unchanged */ },
    setState: s => deps.setState(s)
  });
```

- Add `characterLimit: () => gate.limit()` to the returned `HomeController` and to its interface.

- [ ] **Step 5: Update the gate copy**

In `web/src/partials/characters.html`, change the sub-heading so it reads for both kinds of account:

```html
    <h2 class="card-heading">Name your character</h2>
    <p class="card-sub">This is the name other players see. 1 to 12 characters: letters, digits or underscores, starting with a letter.</p>
```

- [ ] **Step 6: Run the tests**

Run: `cd web && npx vitest run src/characters && npm run typecheck`
Expected: the gate suite passes. `main.ts` will not compile until Task 7 renames `startSession`; for this task change `main.ts`'s `homeCtl` construction to `enterFrame: (_all, chosen) => { void startSession(chosen); }` so typecheck stays green.

- [ ] **Step 7: Commit**

```bash
git add web/src/characters/gate.ts web/src/characters/gate.test.ts web/src/home/controller.ts web/src/partials/characters.html web/src/main.ts
git commit -m "feat(web): guests name their first character too; the gate reports the account limit"
```

---
### Task 7: Rewire the composition root around sessions

**Files:**
- Create: `web/src/sessions/wire.ts`
- Modify: `web/src/main.ts`, `web/src/frame/canvasSize.ts`, `web/src/plugins/builtin/xpTracker.ts`, `web/src/plugins/builtin/lootTracker.ts`
- Delete: `web/src/characters/switcher.ts`, `web/src/characters/switcher.test.ts`
- Test: `web/src/sessions/wire.test.ts`, `web/src/frame/canvasSize.test.ts` (append)

**Interfaces:**
- Consumes: `createSessionManager`, `frameWindow`, `CharacterSession` (Task 4); `createCharacterTabs` (Task 5); `HomeController.enterFrame`/`characterLimit` (Task 6); `createXpTracker`, `createLootLog`, `createOverlays`, `createShellRegistry`, `createPluginRegistry`.
- Produces:
  ```ts
  // web/src/frame/canvasSize.ts (append)
  export function applyFrameSize(iframe: HTMLIFrameElement, size: { width: number; height: number }, filter: 'auto' | 'pixelated'): void;
  // web/src/sessions/wire.ts
  export interface SessionWiringDeps {
    xpFor(characterId: string): ReturnType<typeof createXpTracker>;
    lootFor(characterId: string): ReturnType<typeof createLootLog>;
    isActive(characterId: string): boolean;
    setXpLine(text: string | null): void;
    setStatus(text: string, tone: 'muted' | 'error'): void;
    setTitle(text: string): void;
    now?(): number;
  }
  export function wireSession(session: CharacterSession, deps: SessionWiringDeps): () => void;
  // web/src/plugins/builtin/xpTracker.ts, lootTracker.ts
  export function createXpTrackerPlugin(tracker: () => ReturnType<typeof createXpTracker>): ShellPlugin;
  export function createLootTrackerPlugin(log: () => ReturnType<typeof createLootLog>): ShellPlugin;
  ```

- [ ] **Step 1: Write the failing per-session wiring test**

```ts
// web/src/sessions/wire.test.ts
import { describe, expect, test, vi } from 'vitest';
import { wireSession } from './wire';
import type { CharacterSession } from './types';
import { createXpTracker } from '../stats/xp';
import { createLootLog } from '../stats/loot';
import type { ClientHooks, HookEvents } from '../clientTypes';

function sessionFor(id: string, gameName: string) {
  const handlers = new Map<string, Set<(p: unknown) => void>>();
  const hooks = {
    on: (event: string, handler: (p: unknown) => void) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler);
      handlers.set(event, set);
      return () => set.delete(handler);
    }
  } as unknown as ClientHooks;
  const session = { id, character: { id, gameName, createdAt: 1, lastLoginAt: null }, hooks } as unknown as CharacterSession;
  const emit = <E extends keyof HookEvents>(event: E, payload: HookEvents[E]): void => {
    for (const h of handlers.get(event) ?? []) h(payload);
  };
  return { session, emit };
}

describe('wireSession', () => {
  function build(activeId: string) {
    const xp = new Map<string, ReturnType<typeof createXpTracker>>();
    const loot = new Map<string, ReturnType<typeof createLootLog>>();
    const calls = { xpLine: [] as (string | null)[], status: [] as string[], title: [] as string[] };
    const deps = {
      xpFor: (id: string) => { const t = xp.get(id) ?? createXpTracker(); xp.set(id, t); return t; },
      lootFor: (id: string) => { const l = loot.get(id) ?? createLootLog(); loot.set(id, l); return l; },
      isActive: (id: string) => id === activeId,
      setXpLine: (t: string | null) => { calls.xpLine.push(t); },
      setStatus: (t: string) => { calls.status.push(t); },
      setTitle: (t: string) => { calls.title.push(t); }
    };
    return { deps, xp, loot, calls };
  }

  test('xp and loot land in the tracker for that character', () => {
    const { deps, xp, loot } = build('a');
    const a = sessionFor('a', 'alpha');
    const b = sessionFor('b', 'beta');
    wireSession(a.session, deps);
    wireSession(b.session, deps);
    a.emit('xp', { skill: 0, xp: 100, level: 2, delta: 100 });
    a.emit('xp', { skill: 0, xp: 300, level: 3, delta: 200 });
    b.emit('xp', { skill: 0, xp: 50, level: 1, delta: 50 });
    expect(xp.get('a')!.rows(Date.now())[0].gained).toBe(200);
    expect(xp.get('b')!.rows(Date.now())).toEqual([]);
    a.emit('inventory', { added: [{ id: 995, count: 5 }], removed: [] });
    expect([...loot.get('a')!.entries()]).toHaveLength(1);
    expect([...loot.get('b')!.entries()]).toHaveLength(0);
  });

  test('only the active session writes the overlays and the title bar', () => {
    const { deps, calls } = build('a');
    const a = sessionFor('a', 'alpha');
    const b = sessionFor('b', 'beta');
    wireSession(a.session, deps);
    wireSession(b.session, deps);
    b.emit('login', { gameName: 'beta' });
    b.emit('disconnect', { code: 0 });
    expect(calls.status).toEqual([]);
    expect(calls.title).toEqual([]);
    a.emit('login', { gameName: 'alpha' });
    expect(calls.title.at(-1)).toContain('alpha');
    a.emit('disconnect', { code: 0 });
    expect(calls.status.at(-1)).toBe('reconnecting…');
  });

  test('the returned disposer detaches every handler', () => {
    const { deps, xp } = build('a');
    const a = sessionFor('a', 'alpha');
    const off = wireSession(a.session, deps);
    off();
    a.emit('xp', { skill: 0, xp: 100, level: 2, delta: 100 });
    a.emit('xp', { skill: 0, xp: 300, level: 3, delta: 200 });
    expect(xp.get('a')!.rows(Date.now())).toEqual([]);
  });
});
```

Append to `web/src/frame/canvasSize.test.ts`:

```ts
import { applyFrameSize } from './canvasSize';

describe('applyFrameSize', () => {
  test('sizes the iframe and passes the filter down to the inner canvas', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const canvas = iframe.contentDocument!.createElement('canvas');
    canvas.id = 'canvas';
    iframe.contentDocument!.body.appendChild(canvas);
    applyFrameSize(iframe, { width: 800, height: 539 }, 'pixelated');
    expect(iframe.style.width).toBe('800px');
    expect(iframe.style.height).toBe('539px');
    expect(canvas.style.imageRendering).toBe('pixelated');
    iframe.remove();
  });

  test('is a no-op on a frame whose document is not reachable yet', () => {
    const iframe = document.createElement('iframe');
    expect(() => applyFrameSize(iframe, { width: 100, height: 67 }, 'auto')).not.toThrow();
    expect(iframe.style.width).toBe('100px');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run src/sessions/wire.test.ts src/frame/canvasSize.test.ts`
Expected: FAIL — `./wire` missing, `applyFrameSize` not exported.

- [ ] **Step 3: Add `applyFrameSize`**

Append to `web/src/frame/canvasSize.ts`:

```ts
/**
 * Sizes one character's iframe. The canvas inside `play.html` stretches to fill it (CSS
 * `width/height: 100%`) while keeping its native 789x532 backing store, so the client's own
 * coordinate space -- and every e2e mouse calculation -- is unchanged.
 */
export function applyFrameSize(iframe: HTMLIFrameElement, size: { width: number; height: number }, filter: 'auto' | 'pixelated'): void {
  iframe.style.width = `${size.width}px`;
  iframe.style.height = `${size.height}px`;
  const canvas = iframe.contentDocument?.getElementById('canvas') as HTMLCanvasElement | null;
  if (canvas) canvas.style.imageRendering = filter;
}
```

- [ ] **Step 4: Implement `web/src/sessions/wire.ts`**

```ts
// web/src/sessions/wire.ts -- everything the shell subscribes to per character.
//
// SP6 wired one `hooks` once; with one client per character the XP tracker, the loot log and the
// hook subscriptions are keyed by character id, and only the *active* session is allowed to write
// the shared chrome (the overlay status line, the XP line and the title bar).
import type { createLootLog } from '../stats/loot';
import type { createXpTracker } from '../stats/xp';
import type { CharacterSession } from './types';

export interface SessionWiringDeps {
  xpFor(characterId: string): ReturnType<typeof createXpTracker>;
  lootFor(characterId: string): ReturnType<typeof createLootLog>;
  isActive(characterId: string): boolean;
  setXpLine(text: string | null): void;
  setStatus(text: string, tone: 'muted' | 'error'): void;
  setTitle(text: string): void;
  now?(): number;
}

/** Subscribes one session's hooks; the returned function detaches every handler. */
export function wireSession(session: CharacterSession, deps: SessionWiringDeps): () => void {
  const hooks = session.hooks;
  if (!hooks) return () => {};
  const now = deps.now ?? (() => Date.now());
  const id = session.id;
  const offs = [
    hooks.on('xp', ev => {
      const tracker = deps.xpFor(id);
      tracker.onXp(ev, now());
      if (!deps.isActive(id)) return;
      const [top] = tracker.rows(now());
      deps.setXpLine(top ? `${top.name} · ${top.perHour.toLocaleString()} xp/h` : null);
    }),
    hooks.on('inventory', ev => deps.lootFor(id).onInventory(ev, now())),
    hooks.on('login', ev => {
      if (!deps.isActive(id)) return;
      deps.setStatus('● not paired', 'muted');
      deps.setTitle(`osrs.scotho.com · world 1 · ${ev.gameName}`);
    }),
    hooks.on('logout', () => {
      if (!deps.isActive(id)) return;
      deps.setStatus('logged out', 'muted');
      deps.setTitle('');
    }),
    hooks.on('disconnect', () => {
      if (!deps.isActive(id)) return;
      deps.setStatus('reconnecting…', 'error');
    })
  ];
  return () => { for (const off of offs) off(); };
}
```

- [ ] **Step 5: Make the XP and loot plugins read the active tracker**

In `web/src/plugins/builtin/xpTracker.ts`, change the factory parameter to a getter and every use site:

```ts
export function createXpTrackerPlugin(tracker: () => ReturnType<typeof createXpTracker>): ShellPlugin {
```
then `tracker.rows(Date.now())` → `tracker().rows(Date.now())` and `tracker.reset()` → `tracker().reset()`.

In `web/src/plugins/builtin/lootTracker.ts`:

```ts
export function createLootTrackerPlugin(log: () => ReturnType<typeof createLootLog>): ShellPlugin {
```
then `log.entries()` → `log().entries()` and any `log.reset()` → `log().reset()`.

Update their unit tests (`xpTracker.test.ts`, `lootTracker.test.ts` if present) to pass `() => tracker`.

- [ ] **Step 6: Rewrite the session parts of `main.ts`**

Delete the `loadClient`, `createCharacterSwitcher` and `startSession` machinery and replace it as follows. Everything not mentioned here (gate wiring, `watchHealth`, `boot`, `rebuildStrip`, `onPanelChange`, `notify`, `settingsStore`, the six SP1 panel registrations) is unchanged.

Imports:

```ts
import { createSessionManager, frameWindow, type ClientFrameWindow } from './sessions/manager';
import { wireSession } from './sessions/wire';
import { displayStatus, type CharacterSession } from './sessions/types';
import { createCharacterTabs } from './frame/characterTabs';
import { applyCanvasSize, applyFrameSize, computeCanvasSize, type SizeMode } from './frame/canvasSize';
```
(remove `import { loadClient } from './clientHost';` and `import { createCharacterSwitcher } from './characters/switcher';`; `applyCanvasSize` stays imported only if still used — if not, drop it.)

Module state: delete `let hooks`, `let gameName`, `let activeCharacter`, `let wired`, `const xp = createXpTracker()`, `const loot = createLootLog()`. Add:

```ts
// One tracker per character: XP and loot are per session, not per page (phase-a F7).
const xpByCharacter = new Map<string, ReturnType<typeof createXpTracker>>();
const lootByCharacter = new Map<string, ReturnType<typeof createLootLog>>();
const NO_CHARACTER = ' none';
function xpFor(characterId: string): ReturnType<typeof createXpTracker> {
  const existing = xpByCharacter.get(characterId);
  if (existing) return existing;
  const created = createXpTracker();
  xpByCharacter.set(characterId, created);
  return created;
}
function lootFor(characterId: string): ReturnType<typeof createLootLog> {
  const existing = lootByCharacter.get(characterId);
  if (existing) return existing;
  const created = createLootLog();
  lootByCharacter.set(characterId, created);
  return created;
}
const activeXp = () => xpFor(sessions.activeId() ?? NO_CHARACTER);
const activeLoot = () => lootFor(sessions.activeId() ?? NO_CHARACTER);
```

Session manager, tabs and the parent façade (place them above `deps` and `shell`, since both reference `sessions`):

```ts
const sessions = createSessionManager({
  host: byId('client-frames'),
  mintSession: async characterId => mintSession(await currentIdToken(), characterId),
  onReady: session => {
    wireSession(session, { xpFor, lootFor, isActive: id => sessions.activeId() === id,
      setXpLine: t => overlays.setXpLine(t), setStatus: (t, tone) => overlays.setStatus(t, tone),
      setTitle: t => { byId('title-centre').textContent = t; } });
    syncClientPlugins(session);
    layout();
  },
  onChange: () => { renderTabs(); }
});

const tabs = createCharacterTabs(byId('character-tabs'), {
  onSelect: characterId => { void selectCharacter(characterId); },
  onNew: () => panelCtl.open('characters')
});

/**
 * The parent's `window.idlescape` is a façade over the active session, so plugins, the e2e
 * helpers and the SP4a transport keep reading one place while the real hooks live per iframe.
 */
window.idlescape = {
  get client() { return sessions.active()?.hooks ?? null; },
  get plugins() { return frameWindow(sessions.active())?.idlescape?.plugins ?? null; }
};

function renderTabs(): void {
  tabs.render({ characters: homeCtl.characters(), limit: homeCtl.characterLimit(), states: sessions.states(), activeId: sessions.activeId() });
}

async function selectCharacter(characterId: string): Promise<void> {
  try {
    await sessions.activate(characterId);
    layout();
    renderTabs();
    panelCtl.restore();
  } catch (err) {
    notify((err as Error).message, 'error');
  }
}

function activeCanvas(): HTMLCanvasElement | null {
  const session = sessions.active();
  return (session?.iframe.contentDocument?.getElementById('canvas') as HTMLCanvasElement | null) ?? null;
}

function framePlugins(session: CharacterSession | null): ClientFrameWindow['idlescape'] extends undefined ? never : NonNullable<ClientFrameWindow['idlescape']>['plugins'] {
  return frameWindow(session)?.idlescape?.plugins ?? null;
}

/** A freshly booted frame must catch up with the client-tier plugins the user already enabled. */
function syncClientPlugins(session: CharacterSession): void {
  const plugins = framePlugins(session);
  if (!plugins) return;
  for (const manifest of shell.manifests()) {
    if (manifest.tier !== 'client' || !shell.isEnabled(manifest.id)) continue;
    void plugins.enable(manifest.id, settingsStore.get(manifest.id)?.settings ?? {});
  }
}
```

If the `framePlugins` return type above is awkward, declare it plainly instead:

```ts
import type { ClientPluginRegistry } from './clientTypes';
function framePlugins(session: CharacterSession | null): ClientPluginRegistry | null {
  return frameWindow(session)?.idlescape?.plugins ?? null;
}
```

`layout()` sizes every frame:

```ts
function layout(): void {
  const stage = byId('stage');
  const panelOpen = !byId('side-panel').classList.contains('hidden');
  const reserved = 32 + (panelOpen && stage.clientWidth > 1100 ? 210 : 0) + 16;
  const size = computeCanvasSize({ available: stage.clientWidth - reserved, mode: sizeMode });
  // Hidden frames are sized too, so switching tabs never reflows the stage.
  for (const session of sessions.list()) applyFrameSize(session.iframe, size, filter);
}
```

`deps` changes: drop `xp`/`loot` (nothing consumes them), and retarget the client-facing entries:

```ts
const deps = {
  identity, gameName: () => sessions.active()?.character.gameName ?? null,
  hooks: () => sessions.active()?.hooks ?? null,
  activeCharacter: () => sessions.active()?.character ?? null,
  characters: () => homeCtl.characters(),
  refreshCharacters: async () => { const list = await homeCtl.refreshCharacters(); sessions.setCharacters(list); renderTabs(); return list; },
  startSession: (c: CharacterSummary) => { void selectCharacter(c.id); },
  signOut: async () => {
    for (const session of sessions.list()) sessions.close(session.id);
    xpByCharacter.clear();
    lootByCharacter.clear();
    renderTabs();
    await signOutUser();
  },
  attachEmail, openPanel: (id: PanelId) => panelCtl.open(id), notify,
  setSize: (m: SizeMode) => { sizeMode = m; localStorage.setItem('cs.size', m); layout(); },
  setFilter: (f: 'auto' | 'pixelated') => { filter = f; localStorage.setItem('cs.filter', f); layout(); },
  getSize: () => sizeMode, getFilter: () => filter,
  toggleOverlays: () => { const o = byId('overlays'); o.classList.toggle('hidden'); return o.classList.contains('hidden'); },
  fullscreen: () => { void activeCanvas()?.requestFullscreen?.(); }
};
```

`contextFor`'s `client` and `user`:

```ts
    client: () => sessions.active()?.hooks ?? null,
    ...
    user: () => { const u = identity(); return u ? { uid: u.uid, gameName: sessions.active()?.character.gameName ?? null } : null; }
```

Plugin registrations:

```ts
shell.register(createXpTrackerPlugin(activeXp));
shell.register(createLootTrackerPlugin(activeLoot));
shell.register(createScreenshotPlugin({ canvas: activeCanvas }));
```

`shell`'s `onClientToggle` fans out to every open frame:

```ts
  onClientToggle: (id, enabled, settings) => {
    for (const session of sessions.list()) {
      const plugins = framePlugins(session);
      if (!plugins) continue;   // that frame is still booting; syncClientPlugins catches it up
      if (enabled) void plugins.enable(id, settings as Record<string, unknown>);
      else plugins.disable(id);
    }
  },
```

The footer fps line becomes one interval over the active session (it used to live inside `wireHooks`):

```ts
setInterval(() => {
  const hooks = sessions.active()?.hooks ?? null;
  byId('foot-right').textContent = hooks ? `fps ${hooks.getState().fps}${gateEnabled ? ' · gate: fiddlesticks' : ''}` : '';
}, 1000);
```

`startSession` is replaced by `enterFrame`, handed to the home controller:

```ts
const homeCtl = createHomeController({
  setState: s => state.set(s),
  gameName: () => sessions.active()?.character.gameName ?? null,
  enterFrame: (characters, chosen, created) => { void enterFrame(characters, chosen, created); },
  onIdentity: id => { /* unchanged */ }
});

/** Leaves the home screen for the frame and opens the chosen character's tab. */
async function enterFrame(characters: CharacterSummary[], chosen: CharacterSummary, created: boolean): Promise<void> {
  homeCtl.dismissConnect();
  state.set('playing');
  sessions.setCharacters(characters);
  renderTabs();
  layout();
  overlays.setStatus('starting…', 'muted');
  try {
    await sessions.activate(chosen.id);
    layout();
    renderTabs();
    // The character the player just named goes straight in; a returning player presses the title
    // screen's Login button themselves (spec section 2, "First-login flow").
    if (created) {
      const result = await sessions.login(chosen.id);
      if (!result.ok) {
        setAccountError(result.reason);
        overlays.setStatus(`login failed (${result.code})`, 'error');
        panelCtl.open('account');
        return;
      }
    } else {
      overlays.setStatus('press Login to play', 'muted');
    }
    setAccountError(null);
    const u = identity();
    byId('foot-left').textContent = u?.isAnonymous ? 'guest · attach an email to keep this character' : u?.email ?? '';
    panelCtl.restore();
  } catch (err) {
    setAccountError((err as Error).message);
    overlays.setStatus('session failed', 'error');
    panelCtl.open('account');
  }
}
```

`displayStatus` is imported for the Characters panel deps in Task 8; if `main.ts` does not use it yet, leave it out of the import list until then.

- [ ] **Step 7: Delete the single-client switcher**

```bash
git rm web/src/characters/switcher.ts web/src/characters/switcher.test.ts
```

Its only consumer was `main.ts`'s `characterSwitcher`, which Task 8 replaces with `openTab`.

- [ ] **Step 8: Keep `main.ts` under 400 lines**

Run: `wc -l web/src/main.ts`. If it is at or over 400, move `enterFrame`, `selectCharacter`, `renderTabs`, `activeCanvas`, `framePlugins` and `syncClientPlugins` into `web/src/frame/stage.ts` exporting `createStage(deps)` and keep `main.ts` as pure composition.

- [ ] **Step 9: Run the whole web suite**

Run: `cd web && npx vitest run && npm run typecheck && npm run lint && npx vite build`
Expected: pass. Vitest must report no reference to `characters/switcher`.

- [ ] **Step 10: Commit**

```bash
git add web/src
git commit -m "feat(web): one client per character in the shell, tab strip wiring, per-character trackers"
```

---

### Task 8: Characters panel over sessions

**Files:**
- Modify: `web/src/plugins/builtin/characters.ts`, `web/src/main.ts`
- Test: `web/src/plugins/builtin/characters.test.ts`

**Interfaces:**
- Consumes: `SessionState`, `displayStatus` (Task 4); `CharacterSessionManager` through the deps below.
- Produces (changed `CharactersDeps`):
  ```ts
  export interface CharactersDeps {
    idToken(): Promise<string>;
    isAnonymous(): boolean;
    /** The character whose tab is in front, or null before any tab is open. */
    active(): CharacterSummary | null;
    /** Live session state for a character, or null when it has no session yet. */
    stateOf(characterId: string): SessionState | null;
    /** Opens (lazily creating) and focuses that character's tab. */
    openTab(c: CharacterSummary): Promise<void>;
    /** Closes a character's tab and iframe; called after a successful delete. */
    closeTab(characterId: string): void;
    /** The listing changed (create or delete): the shell re-renders the tab strip. */
    onListChanged(characters: CharacterSummary[], limit: number): void;
    reauth(password: string): Promise<void>;
  }
  ```

- [ ] **Step 1: Write the failing panel test**

Extend `web/src/plugins/builtin/characters.test.ts` (keep its existing mock of `../../characters/api`) with:

```ts
  test('rows show the live session status and offer Open tab instead of Log in as', async () => {
    listCharacters.mockResolvedValue({ characters: [alpha, beta], limit: 3 });
    const { body, deps } = await mountPanel({ active: () => alpha, stateOf: id => (id === 'a' ? 'online' : id === 'b' ? 'connecting' : null) });
    expect(body.querySelector('[data-char-row="a"]')!.textContent).toContain('online');
    expect(body.querySelector('[data-char-row="b"]')!.textContent).toContain('connecting');
    expect(body.querySelector('[data-char-switch]')).toBeNull();
    body.querySelector<HTMLButtonElement>('[data-char-open="b"]')!.click();
    await vi.waitFor(() => expect(deps.openTab).toHaveBeenCalledWith(beta));
  });

  test('a character with no session reads offline', async () => {
    listCharacters.mockResolvedValue({ characters: [alpha], limit: 3 });
    const { body } = await mountPanel({ stateOf: () => null });
    expect(body.querySelector('[data-char-row="a"]')!.textContent).toContain('offline');
  });

  test('the active character has no Open tab button but keeps Delete', async () => {
    listCharacters.mockResolvedValue({ characters: [alpha, beta], limit: 3 });
    const { body } = await mountPanel({ active: () => alpha, stateOf: () => 'online' });
    expect(body.querySelector('[data-char-open="a"]')).toBeNull();
    expect(body.querySelector('[data-char-delete="a"]')).not.toBeNull();
  });

  test('a successful delete closes the tab for that character and reports the new listing', async () => {
    listCharacters.mockResolvedValueOnce({ characters: [alpha, beta], limit: 3 })
                  .mockResolvedValueOnce({ characters: [alpha], limit: 3 });
    deleteCharacter.mockResolvedValue(undefined);
    const { body, deps } = await mountPanel({ active: () => alpha, stateOf: () => 'online' });
    body.querySelector<HTMLButtonElement>('[data-char-delete="b"]')!.click();
    body.querySelector<HTMLInputElement>('#char-del-phrase')!.value = 'delete beta';
    body.querySelector<HTMLInputElement>('#char-del-phrase')!.dispatchEvent(new Event('input'));
    body.querySelector<HTMLButtonElement>('#char-del-confirm')!.click();
    await vi.waitFor(() => expect(deps.closeTab).toHaveBeenCalledWith('b'));
    expect(deps.onListChanged).toHaveBeenLastCalledWith([alpha], 3);
  });

  test('creating from the panel reports the new listing so the tab strip refreshes', async () => {
    listCharacters.mockResolvedValueOnce({ characters: [alpha], limit: 3 })
                  .mockResolvedValueOnce({ characters: [alpha, beta], limit: 3 });
    createCharacter.mockResolvedValue(beta);
    const { body, deps } = await mountPanel({});
    body.querySelector<HTMLInputElement>('#char-panel-name')!.value = 'beta';
    body.querySelector<HTMLFormElement>('#char-panel-create')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(deps.onListChanged).toHaveBeenLastCalledWith([alpha, beta], 3));
  });
```

with the fixtures and a `mountPanel` helper at the top of the describe block:

```ts
const alpha = { id: 'a', gameName: 'alpha', createdAt: 1, lastLoginAt: null };
const beta = { id: 'b', gameName: 'beta', createdAt: 2, lastLoginAt: null };

async function mountPanel(over: Partial<CharactersDeps>) {
  const deps = {
    idToken: async () => 'token',
    isAnonymous: () => false,
    active: () => null,
    stateOf: () => null,
    openTab: vi.fn(async () => {}),
    closeTab: vi.fn(),
    onListChanged: vi.fn(),
    reauth: vi.fn(async () => {}),
    ...over
  } as unknown as CharactersDeps & { openTab: ReturnType<typeof vi.fn>; closeTab: ReturnType<typeof vi.fn>; onListChanged: ReturnType<typeof vi.fn> };
  const body = document.createElement('div');
  document.body.appendChild(body);
  const view = createCharactersPlugin(deps).panel!({} as PluginContext);
  view.mount(body);
  await vi.waitFor(() => expect(body.querySelector('[data-char-row]')).not.toBeNull());
  return { body, deps, view };
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/plugins/builtin/characters.test.ts`
Expected: FAIL — `stateOf`/`openTab`/`closeTab`/`onListChanged` are not part of `CharactersDeps`, and rows still render `data-char-switch`.

- [ ] **Step 3: Change the panel**

In `web/src/plugins/builtin/characters.ts`:

1. Replace `switchTo` in `CharactersDeps` with `stateOf`, `openTab`, `closeTab`, `onListChanged` exactly as in the Interfaces block; import `displayStatus` and `SessionState` from `../../sessions/types`.
2. `reload()` reports upward after every successful listing:

```ts
      async function reload(): Promise<void> {
        try {
          const listed = await listCharacters(await deps.idToken());
          list = listed.characters;
          limit = listed.limit;
          loadError = null;
          deps.onListChanged(list, limit);
        } catch (err) {
          loadError = friendlyCharacterError((err as Error).message);
        }
        render();
      }
```

3. The row markup shows the live status and an "Open tab" button:

```ts
        const active = deps.active();
        const rows = list.map(c => {
          const status = displayStatus(deps.stateOf(c.id) ?? 'offline');
          const isActive = c.id === active?.id;
          return `
          <div class="p-row char-row${isActive ? ' active' : ''}" data-char-row="${escapeHtml(c.id)}">
            <span class="p-value">${escapeHtml(c.gameName)}</span>
            <span class="p-label" data-char-status="${escapeHtml(c.id)}">${status}</span>
            ${isActive ? '' : `<button class="p-btn" data-char-open="${escapeHtml(c.id)}">Open tab</button><button class="p-btn p-btn-danger" data-char-delete="${escapeHtml(c.id)}">Delete</button>`}
          </div>`;
        }).join('');
```

  The active row keeps its Delete button (it is the one the player is most likely to want to remove, and the delete flow is guarded anyway):

```ts
            ${isActive ? `<button class="p-btn p-btn-danger" data-char-delete="${escapeHtml(c.id)}">Delete</button>` : `<button class="p-btn" data-char-open="${escapeHtml(c.id)}">Open tab</button><button class="p-btn p-btn-danger" data-char-delete="${escapeHtml(c.id)}">Delete</button>`}
```

4. Replace the `[data-char-switch]` click wiring with `[data-char-open]`, keeping the existing disable-while-in-flight guard (rename `setSwitchButtonsDisabled` to `setOpenButtonsDisabled` and its selector to `[data-char-open]`):

```ts
        body.querySelectorAll<HTMLButtonElement>('[data-char-open]').forEach(b => b.addEventListener('click', () => {
          const c = list.find(x => x.id === b.dataset.charOpen);
          if (!c) return;
          setOpenButtonsDisabled(true);
          void deps.openTab(c)
            .catch(err => setError((err as Error).message))
            .finally(() => { setOpenButtonsDisabled(false); render(); });
        }));
```

5. In the delete confirmation, close the tab before reloading:

```ts
              await deleteCharacter(await deps.idToken(), c.id, phrase);
              // The iframe is bound to this character; nothing may keep playing it.
              deps.closeTab(c.id);
              await reload();
```

- [ ] **Step 4: Register the panel with session-backed deps in `main.ts`**

```ts
shell.register(createCharactersPlugin({
  idToken: currentIdToken,
  isAnonymous: () => identity()?.isAnonymous ?? true,
  active: () => sessions.active()?.character ?? null,
  stateOf: characterId => sessions.get(characterId)?.state ?? null,
  openTab: async c => { sessions.setCharacters([...homeCtl.characters(), c].filter((x, i, all) => all.findIndex(y => y.id === x.id) === i)); await selectCharacter(c.id); },
  closeTab: characterId => { sessions.close(characterId); renderTabs(); },
  onListChanged: (characters, _limit) => { sessions.setCharacters(characters); renderTabs(); },
  reauth: reauthEmail
}));
```

  `openTab`'s dedupe keeps a character created from inside the panel selectable before the next `refreshCharacters()`; `onListChanged` then makes the roster authoritative again.

- [ ] **Step 5: Run the tests**

Run: `cd web && npx vitest run src/plugins && npm run typecheck && npm run lint`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add web/src/plugins/builtin/characters.ts web/src/plugins/builtin/characters.test.ts web/src/main.ts
git commit -m "feat(web): Characters panel opens tabs and closes a deleted character iframe"
```

---
### Task 9: Re-thread SP4a's transport and task runtime per session

**Assumption:** SP4a Tasks 3 and 10 have landed, i.e. `web/src/agent/localTransport.ts` exports `createLocalTransport(hooks: ClientHooks, canvas: () => HTMLCanvasElement | null): Transport`, `web/src/tasks/api.ts` exports `createTasksApi(deps)` / `TasksApi` / `TasksError`, and `main.ts` contains a `wireTasks(h: ClientHooks)` that builds one transport, one worker host and one api around the single `hooks`, then assigns `window.idlescape = { ...window.idlescape, tasks: api }`.

**If SP4a has not landed yet:** do Steps 1 and 6 only (the `sessionCanvas` seam and the note in the spec), skip Steps 2-5, and leave a `// SP4a: wireTasks(session) goes here` comment beside `onReady` in `main.ts`. **If SP4a's wiring differs** (for example `wireTasks` already lives in `web/src/tasks/wire.ts`, or the api is created inside a plugin factory): keep this task's contract — *one `TasksApi` per session, created where `wireSession` is called, with `characterId` fixed to that session; `window.idlescape.tasks` is a parent-document router over them* — and adapt the mechanics. Do not make the transport read "whatever is active": a run must keep driving the character it started on even after the player switches tabs.

**Files:**
- Create: `web/src/tasks/router.ts`, `web/src/tasks/router.test.ts`
- Modify: `web/src/main.ts` (or `web/src/tasks/wire.ts` if SP4a put `wireTasks` there), `web/src/plugins/builtin/tasks.ts` (its `tasksApi` factory dep)

**Interfaces:**
- Consumes: `Transport`, `createLocalTransport` (SP4a Task 3); `TasksApi`, `createTasksApi`, `TasksError` (SP4a Task 10); `CharacterSession` (Task 4).
- Produces:
  ```ts
  // web/src/tasks/router.ts
  export interface TasksRouterDeps { activeId(): string | null }
  export interface TasksRouter {
    /** The object published at `window.idlescape.tasks`. */
    api: TasksApi;
    attach(characterId: string, api: TasksApi): void;
    detach(characterId: string): void;
    /** The api for the character whose tab is in front, or null. */
    current(): TasksApi | null;
    /** The api that owns a run id, falling back to the active one. */
    owner(runId: string): TasksApi | null;
  }
  export function createTasksRouter(deps: TasksRouterDeps): TasksRouter;
  ```

- [ ] **Step 1: Add the per-session canvas seam in `main.ts`**

```ts
/** The canvas inside one character's iframe; the SP4a transport screenshots through it. */
function sessionCanvas(session: CharacterSession): HTMLCanvasElement | null {
  return (session.iframe.contentDocument?.getElementById('canvas') as HTMLCanvasElement | null) ?? null;
}
```

- [ ] **Step 2: Write the failing router test**

```ts
// web/src/tasks/router.test.ts
import { describe, expect, test, vi } from 'vitest';
import { createTasksRouter } from './router';
import type { TasksApi } from './api';

function fakeApi(tag: string) {
  return {
    tag,
    list: vi.fn(async () => [{ id: tag }]),
    run: vi.fn(async () => ({ runId: `${tag}-run` })),
    stop: vi.fn(async () => {}),
    getRun: vi.fn(async (id: string) => ({ id, tag })),
    status: vi.fn(() => ({ state: 'idle' as const }))
  } as unknown as TasksApi & { tag: string };
}

describe('createTasksRouter', () => {
  test('delegates to the api of the active session', async () => {
    let active: string | null = 'a';
    const router = createTasksRouter({ activeId: () => active });
    const a = fakeApi('a');
    const b = fakeApi('b');
    router.attach('a', a);
    router.attach('b', b);
    await router.api.list();
    expect(a.list).toHaveBeenCalledTimes(1);
    active = 'b';
    await router.api.list();
    expect(b.list).toHaveBeenCalledTimes(1);
    expect(a.list).toHaveBeenCalledTimes(1);
  });

  test('a run keeps belonging to the character it started on', async () => {
    let active: string | null = 'a';
    const router = createTasksRouter({ activeId: () => active });
    const a = fakeApi('a');
    const b = fakeApi('b');
    router.attach('a', a);
    router.attach('b', b);
    const { runId } = await router.api.run('chop-and-drop');
    active = 'b';
    await router.api.getRun(runId);
    expect(a.getRun).toHaveBeenCalledWith(runId);
    expect(b.getRun).not.toHaveBeenCalled();
    await router.api.stop(runId);
    expect(a.stop).toHaveBeenCalled();
  });

  test('with no session open every call throws not_signed_in rather than crashing', async () => {
    const router = createTasksRouter({ activeId: () => null });
    await expect(router.api.list()).rejects.toThrow('not_signed_in');
  });

  test('detach drops the api and forgets its runs', async () => {
    const router = createTasksRouter({ activeId: () => 'a' });
    const a = fakeApi('a');
    router.attach('a', a);
    const { runId } = await router.api.run('x');
    router.detach('a');
    expect(router.current()).toBeNull();
    expect(router.owner(runId)).toBeNull();
  });
});
```

- [ ] **Step 3: Implement `web/src/tasks/router.ts`**

```ts
// web/src/tasks/router.ts -- `window.idlescape.tasks` over one TasksApi per character.
//
// SP4a built one api around one client. With one client per character, each session owns its own
// transport, worker host and api, so a run keeps driving the character it started on even after
// the player switches tabs. The parent document still publishes a single `tasks` object: it
// forwards to the *active* character's api, except for calls that name a run, which go to the api
// that owns it.
import { TasksError, type TasksApi } from './api';

export interface TasksRouterDeps { activeId(): string | null }

export interface TasksRouter {
  api: TasksApi;
  attach(characterId: string, api: TasksApi): void;
  detach(characterId: string): void;
  current(): TasksApi | null;
  owner(runId: string): TasksApi | null;
}

export function createTasksRouter(deps: TasksRouterDeps): TasksRouter {
  const apis = new Map<string, TasksApi>();
  const runOwners = new Map<string, string>();

  const current = (): TasksApi | null => {
    const id = deps.activeId();
    return id ? apis.get(id) ?? null : null;
  };

  const need = (): TasksApi => {
    const api = current();
    if (!api) throw new TasksError('not_signed_in', 'Open a character tab before running a task.');
    return api;
  };

  const owner = (runId: string): TasksApi | null => {
    const id = runOwners.get(runId);
    return id ? apis.get(id) ?? null : null;
  };

  // Every method forwards; `run` records the owner, and run-addressed methods use it.
  const api = {
    async list(...args: Parameters<TasksApi['list']>) { return need().list(...args); },
    async run(...args: Parameters<TasksApi['run']>) {
      const ownerId = deps.activeId();
      const result = await need().run(...args);
      if (ownerId) runOwners.set(result.runId, ownerId);
      return result;
    },
    async stop(...args: Parameters<TasksApi['stop']>) {
      const [first] = args as unknown as [string];
      return (owner(first) ?? need()).stop(...args);
    },
    async getRun(...args: Parameters<TasksApi['getRun']>) {
      const [first] = args as unknown as [string | undefined];
      return (first ? owner(first) ?? need() : need()).getRun(...args);
    },
    status: (...args: Parameters<TasksApi['status']>) => need().status(...args)
  } as unknown as TasksApi;

  return {
    api,
    attach(characterId, sessionApi) { apis.set(characterId, sessionApi); },
    detach(characterId) {
      apis.delete(characterId);
      for (const [runId, id] of [...runOwners]) if (id === characterId) runOwners.delete(runId);
    },
    current,
    owner
  };
}
```

  Mirror **every** method SP4a's `TasksApi` actually declares (`execute`, `dispatch`, `pause`, `resume`, `install`, `save`, `onEvent`, `onStatus`, `settings`, ...) with the same forwarding rule: run-addressed methods through `owner(runId)`, everything else through `need()`. The test above covers the shape; add one forwarding assertion per extra method as you add it.

- [ ] **Step 4: Build one task runtime per session**

Move SP4a's `wireTasks` next to `wireSession` (in `main.ts`, or in `web/src/tasks/wire.ts` if that is where SP4a put it) and make it session-scoped:

```ts
const tasksRouter = createTasksRouter({ activeId: () => sessions.activeId() });

function wireTasks(session: CharacterSession): void {
  const hooks = session.hooks;
  if (!hooks) return;
  // Bound to THIS iframe's hooks and canvas, not to "whatever is active".
  const transport = createLocalTransport(hooks, () => sessionCanvas(session));
  const host = createWorkerHost({ transport, spawn: () => new Worker(new URL('../agent/worker.ts', import.meta.url), { type: 'module' }), libraryManifests: libraryManifests() });
  const api = createTasksApi({
    host, transport, history: createRunHistory(),
    store: createUserTaskStore({ backend: createFirestoreTaskBackend(db), uid: () => identity()?.uid ?? null }),
    library: { manifests: libraryManifests, byId: libraryById },
    characterId: () => session.id,
    storage: { get: k => localStorage.getItem(`cs.${session.id}.${k}`), set: (k, v) => localStorage.setItem(`cs.${session.id}.${k}`, v) }
  });
  createHumanInputWatcher({
    transport, isRunning: () => host.status().state === 'running',
    isPausedByHuman: () => host.status().reason === 'human-input',
    pause: () => host.pause('human-input', 'player'), resume: () => host.resume('player'),
    resumeAfterMs: () => api.settings.get().resumeAfterHumanInputMs,
    now: Date.now, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: h => clearTimeout(h as number)
  });
  hooks.on('logout', () => { void api.stop('player').catch(() => {}); });
  tasksRouter.attach(session.id, api);
}
```

Call `wireTasks(session)` from the session manager's `onReady`, right after `wireSession(...)`. In `sessions.close`/`deps.signOut`, call `tasksRouter.detach(characterId)`.

Storage keys gain the character id because a run's settings and history belong to the character; if SP4a already namespaces them by `characterId()` internally, leave the plain `cs.${k}` keys.

- [ ] **Step 5: Publish the router on the parent façade and hand it to the panels**

In `main.ts`, extend the façade written in Task 7:

```ts
window.idlescape = {
  get client() { return sessions.active()?.hooks ?? null; },
  get plugins() { return frameWindow(sessions.active())?.idlescape?.plugins ?? null; },
  tasks: tasksRouter.api
};
```

and add `tasks?: TasksApi` to the `Window.idlescape` declaration in `web/src/clientTypes.ts`. The Tasks and Marketplace plugins (SP4a Tasks 11-12) take `() => tasksRouter.api` instead of the single api; change their factory dep from `tasksApi: TasksApi` to `tasksApi: () => TasksApi` and their call sites accordingly.

- [ ] **Step 6: Record the seam in the spec**

Append to section 3 of `docs/superpowers/specs/2026-09-05-sp7-character-tabs-and-sessions-design.md`:

```
- SP4a interplay: `createLocalTransport` binds to one session's hooks and that iframe's canvas; a
  `TasksApi` is built per session with `characterId` fixed, so a run belongs to the character it
  started on. `window.idlescape.tasks` stays a parent-document object -- a router that forwards to
  the active session's api, except run-addressed calls, which go to the api that owns the run.
```

- [ ] **Step 7: Run the checks**

Run: `cd web && npx vitest run src/tasks src/sessions && npm run typecheck && npm run lint`
Expected: pass. If SP4a has not landed, only Steps 1 and 6 apply and this command is `cd web && npm run typecheck && npm run lint`.

- [ ] **Step 8: Commit**

```bash
git add web/src/tasks web/src/main.ts web/src/clientTypes.ts docs/superpowers/specs/2026-09-05-sp7-character-tabs-and-sessions-design.md
git commit -m "feat(web): per-character task runtime behind a window.idlescape.tasks router"
```

---

### Task 10: Browser coverage for tabs, two live clients and the naming gate

**Files:**
- Create: `web/e2e/tabs.pw.test.ts`
- Modify: `web/e2e/helpers.ts`, `web/e2e/global.d.ts`, `web/e2e/characters.pw.test.ts`, `web/e2e/gate-to-game.pw.test.ts`

**Interfaces:**
- Consumes: `#character-tabs`, `#client-frames`, `[data-char-tab]`, `[data-char-tab-new]`, `[data-char-tab-locked]`, `[data-char-tab-more]`, `[data-char-open]`, the parent `window.idlescape.client` façade.
- Produces (in `web/e2e/helpers.ts`):
  ```ts
  export const TITLE_LOGIN_BUTTON: { x: number; y: number };
  export function loginAsGuest(page: Page, name?: string): Promise<string>;
  export function createFirstCharacter(page: Page, name: string): Promise<void>;
  export function pressTitleLogin(page: Page): Promise<void>;
  export function openCharacterTab(page: Page, characterName: string): Promise<void>;
  export function sessionStates(page: Page): Promise<{ character: string; gameName: string | null; loggedIn: boolean; hidden: boolean }[]>;
  ```

- [ ] **Step 1: Retarget the canvas helpers at the active iframe**

In `web/e2e/helpers.ts`:

```ts
/**
 * The active character's canvas now lives inside a same-origin `/play.html` iframe, so every
 * canvas measurement goes through `#client-frames iframe:not(.hidden)`. The canvas fills the
 * iframe, so the iframe's own bounding box is the canvas's box in page coordinates.
 */
async function activeCanvasBox(page: Page): Promise<{ left: number; top: number; width: number; height: number }> {
  const box = await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>('#client-frames iframe:not(.hidden)');
    if (!frame) throw new Error('no active client frame');
    const r = frame.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  return box;
}

export async function canvasClick(page: Page, x: number, y: number, button: 'left' | 'right' = 'left'): Promise<void> {
  const box = await activeCanvasBox(page);
  await page.mouse.click(box.left + (x * box.width) / CANVAS.width, box.top + (y * box.height) / CANVAS.height, { button });
}

export function canvasPixels(page: Page, points: { x: number; y: number }[]): Promise<string[]> {
  return page.evaluate(pts => {
    const frame = document.querySelector<HTMLIFrameElement>('#client-frames iframe:not(.hidden)');
    const c = frame?.contentDocument?.getElementById('canvas') as HTMLCanvasElement | null;
    if (!c) throw new Error('no active client canvas');
    const ctx = c.getContext('2d')!;
    return pts.map(p => Array.from(ctx.getImageData(p.x, p.y, 1, 1).data.slice(0, 3)).join(','));
  }, points);
}

/**
 * The single centred title button `drawArmedLoginButton()` paints (client patch 24). Its hit test
 * (patch 25) is `x = (sWid / 2) | 0`, `y = ((sHei / 2) | 0) + 40` with a 150x40 box, so the centre
 * of a 789x532 canvas button is (394, 306).
 */
export const TITLE_LOGIN_BUTTON = { x: Math.trunc(CANVAS.width / 2), y: Math.trunc(CANVAS.height / 2) + 40 } as const;

export async function pressTitleLogin(page: Page): Promise<void> {
  await canvasClick(page, TITLE_LOGIN_BUTTON.x, TITLE_LOGIN_BUTTON.y);
}
```

- [ ] **Step 2: Teach the entry helpers the naming step**

```ts
/** Fills the pre-game naming form and waits for the frame. Guests and registered users alike. */
export async function createFirstCharacter(page: Page, name: string): Promise<void> {
  await expect(page.locator('#screen-characters')).toBeVisible({ timeout: 30_000 });
  await page.locator('#char-name').fill(name);
  await page.locator('#btn-char-create').click();
  await expect(page.locator('#screen-frame')).toBeVisible({ timeout: 30_000 });
}

/**
 * Presses "Play as guest", names the character (guests choose a name now, SP7 owner requirement 1)
 * and waits until the client reports a logged-in player with stats and a world position. The gate
 * auto-presses Login for a character the player just created. Returns the game name.
 */
export async function loginAsGuest(page: Page, name: string = uniqueName('g_')): Promise<string> {
  await expect.poll(() => page.locator('#btn-guest').isEnabled(), { timeout: 30_000 }).toBe(true);
  await expect(page.locator('#entry-connect-view')).toBeHidden();
  await page.locator('#btn-guest').click();
  await createFirstCharacter(page, name);
  await expect.poll(() => page.evaluate(() => window.idlescape?.client?.getState().loggedIn ?? false), { timeout: 90_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.idlescape?.client?.getState().skills.xp.length ?? 0), { timeout: 30_000 }).toBeGreaterThan(20);
  await expect.poll(async () => (await clientState(page)).position.x, { timeout: 60_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await clientState(page)).sceneReady, { timeout: 120_000 }).toBe(true);
  const state = await clientState(page);
  if (!state.gameName) throw new Error('logged in without a game name');
  return state.gameName;
}

/** Clicks a character's tab and waits for its frame to become the visible one. */
export async function openCharacterTab(page: Page, characterName: string): Promise<void> {
  const tab = page.locator(`#character-tabs [data-char-tab]:has-text("${characterName}")`);
  await expect(tab).toBeVisible();
  await tab.click();
  await expect.poll(() => page.evaluate(() => window.idlescape?.client?.getState().gameName ?? null)).not.toBeNull();
}

/** Every open session, read straight out of its iframe: which are online, which are hidden. */
export function sessionStates(page: Page): Promise<{ character: string; gameName: string | null; loggedIn: boolean; hidden: boolean }[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLIFrameElement>('#client-frames iframe')).map(f => {
      const w = f.contentWindow as (Window & { idlescape?: { client?: { getState(): { gameName: string | null; loggedIn: boolean } } | null } }) | null;
      const s = w?.idlescape?.client?.getState();
      return { character: f.dataset.character ?? '', gameName: s?.gameName ?? null, loggedIn: s?.loggedIn ?? false, hidden: f.classList.contains('hidden') };
    })
  );
}
```

`installRecorder` needs no change: `window.idlescape.client` is the parent façade over the active session. Add a comment saying so, since it now silently records only the active character.

In `web/e2e/global.d.ts` widen the declaration to match the façade:

```ts
declare global {
  interface Window {
    idlescape?: { client?: ClientHooks | null };
    __e2e?: { chat: { kind: string; sender: string | null; text: string }[]; events: string[] };
  }
}
```

- [ ] **Step 3: Write the tab-strip spec**

```ts
// web/e2e/tabs.pw.test.ts
import { expect, test } from '@playwright/test';
import {
  SIGNUP_PASSWORD, clientState, createFirstCharacter, loginAsGuest, openCharacterTab, openPanel,
  pressTitleLogin, sessionStates, signUp, uniqueName
} from './helpers';
import { openGate } from './helpers';

// SP7: one client per character behind a tab strip in the frame.
// Requires: firebase emulators, engine, front server (serving web/dist) all running.

test('a guest names their character, gets a tab, and sees the locked third slot', async ({ page }) => {
  const name = uniqueName('gt_');
  await openGate(page);

  await test.step('the naming form blocks an empty submit', async () => {
    await expect.poll(() => page.locator('#btn-guest').isEnabled(), { timeout: 30_000 }).toBe(true);
    await page.locator('#btn-guest').click();
    await expect(page.locator('#screen-characters')).toBeVisible({ timeout: 30_000 });
    await page.locator('#btn-char-create').click();
    // `required` on #char-name keeps the gate on screen; nothing was created.
    await expect(page.locator('#screen-characters')).toBeVisible();
    await expect(page.locator('#screen-frame')).toBeHidden();
  });

  await createFirstCharacter(page, name);
  await expect.poll(() => page.evaluate(() => window.idlescape?.client?.getState().loggedIn ?? false), { timeout: 90_000 }).toBe(true);

  await test.step('the strip shows the character, one free slot, the guest lock and coming soon', async () => {
    const strip = page.locator('#character-tabs');
    await expect(strip.locator(`[data-char-tab]:has-text("${name}")`)).toBeVisible();
    await expect.poll(async () => strip.locator('[data-char-tab] [data-tab-status]').first().textContent(), { timeout: 30_000 }).toBe('online');
    await expect(strip.locator('[data-char-tab-new]')).toHaveCount(1);
    const locked = strip.locator('[data-char-tab-locked]');
    await expect(locked).toBeDisabled();
    await expect(locked).toHaveAttribute('title', 'Create an account to unlock a third character');
    const more = strip.locator('[data-char-tab-more]');
    await expect(more).toBeDisabled();
    await expect(more).toContainText('coming soon');
  });

  await test.step('exactly one client frame exists and it is visible', async () => {
    const states = await sessionStates(page);
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ gameName: name, loggedIn: true, hidden: false });
  });
});

test('a registered account runs two characters at once and logging one out leaves the other online', async ({ page }) => {
  const [one, two] = [uniqueName('ta_'), uniqueName('tb_')];
  await openGate(page);
  await signUp(page, 'Tabs');
  await createFirstCharacter(page, one);
  await expect.poll(async () => (await clientState(page)).loggedIn, { timeout: 90_000 }).toBe(true);
  await expect.poll(async () => (await clientState(page)).sceneReady, { timeout: 120_000 }).toBe(true);
  const firstPosition = (await clientState(page)).position;

  await test.step('the second character is created from the panel and opened from its tab', async () => {
    await openPanel(page, 'characters');
    await page.locator('#char-panel-name').fill(two);
    await page.locator('#char-panel-create button[type="submit"]').click();
    await expect(page.locator(`[data-char-row]:has-text("${two}")`)).toBeVisible({ timeout: 15_000 });
    await page.locator(`#character-tabs [data-char-tab]:has-text("${two}")`).click();
    // A returning tab stops at its own title screen: one centred Login button, no fields.
    await expect.poll(async () => (await sessionStates(page)).length, { timeout: 60_000 }).toBe(2);
    await expect.poll(async () => (await clientState(page)).loggedIn, { timeout: 30_000 }).toBe(false);
    await pressTitleLogin(page);
    await expect.poll(async () => (await clientState(page)).gameName, { timeout: 90_000 }).toBe(two);
    await expect.poll(async () => (await clientState(page)).sceneReady, { timeout: 120_000 }).toBe(true);
  });

  await test.step('both clients are online at the same time, one hidden', async () => {
    const states = await sessionStates(page);
    expect(states.filter(s => s.loggedIn)).toHaveLength(2);
    expect(states.filter(s => s.hidden)).toHaveLength(1);
    expect(states.map(s => s.gameName).sort()).toEqual([one, two].sort());
  });

  await test.step('switching back resumes the first session where it left off', async () => {
    await openCharacterTab(page, one);
    await expect.poll(async () => (await clientState(page)).gameName, { timeout: 30_000 }).toBe(one);
    const back = await clientState(page);
    expect(back.loggedIn).toBe(true);
    expect(back.sceneReady).toBe(true);
    // Rendering resumed: the pre-login loading bar's solid red is gone from the viewport.
    expect(back.position.x).toBeGreaterThan(0);
    expect(Math.abs(back.position.x - firstPosition.x)).toBeLessThan(64);
  });

  await test.step('logging one tab out leaves the other online', async () => {
    await page.evaluate(() => window.idlescape!.client!.logout());
    await expect.poll(async () => (await clientState(page)).loggedIn, { timeout: 30_000 }).toBe(false);
    const states = await sessionStates(page);
    expect(states.filter(s => s.loggedIn).map(s => s.gameName)).toEqual([two]);
    await expect.poll(async () => page.locator(`#character-tabs [data-char-tab]:has-text("${one}") [data-tab-status]`).textContent(), { timeout: 15_000 }).toBe('offline');
    await expect.poll(async () => page.locator(`#character-tabs [data-char-tab]:has-text("${two}") [data-tab-status]`).textContent()).toBe('online');
  });
});
```

- [ ] **Step 4: Update the two specs that depended on the old flow**

`web/e2e/characters.pw.test.ts`:
- The first character now comes from `createFirstCharacter(page, one)` instead of the inline `#char-name` fill (identical, but shared).
- Replace the "switching logs the first character out and the second in" step with a tab-based one:

```ts
  await test.step('switching tabs keeps the first character online', async () => {
    await page.locator(`#character-tabs [data-char-tab]:has-text("${two}")`).click();
    await expect.poll(async () => (await sessionStates(page)).length, { timeout: 60_000 }).toBe(2);
    await pressTitleLogin(page);
    await expect.poll(async () => (await clientState(page)).gameName, { timeout: 90_000 }).toBe(two);
    expect((await sessionStates(page)).filter(s => s.loggedIn)).toHaveLength(2);
  });
```
- The panel's switch buttons are now `[data-char-open]`; the delete step is unchanged except that after deleting `three` the spec also asserts its tab is gone: `await expect(page.locator(\`#character-tabs [data-char-tab]:has-text("${three}")\`)).toHaveCount(0);`

`web/e2e/gate-to-game.pw.test.ts`:
- Test 1 keeps `loginAsGuest(page)` (which now names the character).
- Test 3 (`signUp(page, 'Bob')`) keeps its `#char-name-status` availability assertion and then uses `createFirstCharacter`.

- [ ] **Step 5: Bring the stack up and run the whole suite**

Run (PowerShell, repo root): `cd firebase; Start-Process cmd.exe "/c npm run emulators"`, then `scripts/start-stack.ps1 -Prod`; wait for `/api/health` to report `engine: up`.
Run (Git Bash): `cd web && npm run build:e2e && npx playwright test`
Expected: `gameplay`, `gate-to-game`, `plugins`, `characters` and the new `tabs` specs all pass.

- [ ] **Step 6: Commit**

```bash
git add web/e2e
git commit -m "test(e2e): character tabs, two live clients, guest naming and the single Login button"
```

---
### Task 11: Measurements — background-tab throttling and three-client memory

These are the two numbers the parent spec (section 5, "Measurements gating the rollout") and the feasibility audit's open questions 2 and 6 said must be measured rather than assumed. They run opt-in so the normal e2e suite stays fast.

**Files:**
- Create: `web/e2e/measure.pw.test.ts`, `docs/superpowers/measurements/2026-09-05-sp7-sessions.md`

**Interfaces:**
- Consumes: `openGate`, `signUp`, `createFirstCharacter`, `pressTitleLogin`, `sessionStates`, `uniqueName` (Task 10); Playwright's `browser.newBrowserCDPSession()` and `context.newCDPSession(page)`.
- Produces: `web/test-results/sp7-measurements.json` (`{ throttling: {...}, memory: {...} }`) plus the recorded document.

- [ ] **Step 1: Write the measurement spec**

```ts
// web/e2e/measure.pw.test.ts
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createFirstCharacter, openGate, openPanel, pressTitleLogin, sessionStates, signUp, uniqueName } from './helpers';

// SP7 measurements (spec section 5; phase-a open questions 2 and 6). Opt in with
//   E2E_MEASURE=1 npx playwright test e2e/measure.pw.test.ts
// The throttling case deliberately idles for minutes, so it is never part of the default run.
test.skip(!process.env.E2E_MEASURE, 'set E2E_MEASURE=1 to run the SP7 measurements');
test.describe.configure({ mode: 'serial', timeout: 900_000 });

const OUT = 'test-results/sp7-measurements.json';
const results: Record<string, unknown> = {};

function record(key: string, value: unknown): void {
  results[key] = value;
  mkdirSync('test-results', { recursive: true });
  writeFileSync(OUT, JSON.stringify(results, null, 2));
}

/** Opens `count` characters on one page and logs each of them in. Returns their names. */
async function openCharacters(page: import('@playwright/test').Page, count: number): Promise<string[]> {
  const names = Array.from({ length: count }, (_, i) => uniqueName(`m${i}_`));
  await openGate(page);
  await signUp(page, 'Measure');
  await createFirstCharacter(page, names[0]);
  await expect.poll(async () => (await sessionStates(page)).some(s => s.loggedIn), { timeout: 90_000 }).toBe(true);
  for (const name of names.slice(1)) {
    await openPanel(page, 'characters');
    await page.locator('#char-panel-name').fill(name);
    await page.locator('#char-panel-create button[type="submit"]').click();
    await expect(page.locator(`[data-char-row]:has-text("${name}")`)).toBeVisible({ timeout: 15_000 });
    await page.locator(`#character-tabs [data-char-tab]:has-text("${name}")`).click();
    await expect.poll(async () => (await sessionStates(page)).length, { timeout: 60_000 }).toBe(names.indexOf(name) + 1);
    await pressTitleLogin(page);
    await expect.poll(async () => (await sessionStates(page)).filter(s => s.loggedIn).length, { timeout: 90_000 }).toBe(names.indexOf(name) + 1);
  }
  return names;
}

test('three clients survive a hidden tab past the engine 60s no-response timeout', async ({ page, context }) => {
  const names = await openCharacters(page, 3);

  // Chromium applies background timer throttling to a page that is not the foreground tab;
  // bringing a second page to front is the documented way to background the first.
  const other = await context.newPage();
  await other.goto('about:blank');
  await other.bringToFront();
  expect(await page.evaluate(() => document.visibilityState)).toBe('hidden');

  const HIDDEN_MS = 390_000;   // > 5 min, past Chromium's intensive-throttling threshold
  const startedAt = Date.now();
  await other.waitForTimeout(HIDDEN_MS);
  await page.bringToFront();

  const after = await sessionStates(page);
  record('throttling', {
    hiddenMs: Date.now() - startedAt,
    characters: names,
    sessions: after,
    survived: after.filter(s => s.loggedIn).length,
    engineNoResponseTimeoutMs: 60_000
  });
  await other.close();

  // The engine forces a logout after 60 s of no packets (World.ts TIMEOUT_NO_RESPONSE = 100 ticks).
  // If this assertion fails, the mitigations in the feasibility audit apply (audio keepalive, or
  // moving the keepalive into a worker) and the number recorded above is the evidence for it.
  expect(after.filter(s => s.loggedIn)).toHaveLength(3);
});

test('memory for one, two and three live clients', async ({ page, browser, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const browserCdp = await browser.newBrowserCDPSession();

  async function sample(label: string): Promise<Record<string, number>> {
    const metrics = await cdp.send('Performance.getMetrics');
    const heap = Object.fromEntries(metrics.metrics.filter(m => m.name === 'JSHeapUsedSize' || m.name === 'JSHeapTotalSize').map(m => [m.name, m.value]));
    const processes = await browserCdp.send('SystemInfo.getProcessInfo');
    const rendererCpuTime = processes.processInfo.filter(p => p.type === 'renderer').reduce((sum, p) => sum + p.cpuTime, 0);
    const row = { ...heap, rendererCpuTime };
    record(`memory.${label}`, row);
    return row;
  }

  await sample('0-before-any-session');
  const names = await openCharacters(page, 3);
  // One sample per additional client, taken after each has a built scene.
  for (let i = 1; i <= names.length; i++) {
    await expect.poll(async () => (await sessionStates(page)).filter(s => s.loggedIn).length, { timeout: 120_000 }).toBeGreaterThanOrEqual(i);
    await sample(`${i}-clients`);
  }

  const three = results['memory.3-clients'] as Record<string, number>;
  const zero = results['memory.0-before-any-session'] as Record<string, number>;
  record('memory.summary', {
    perClientHeapBytes: Math.round((three.JSHeapUsedSize - zero.JSHeapUsedSize) / 3),
    totalHeapBytes: three.JSHeapUsedSize
  });

  // A ceiling, not a target: three 274 clients in one renderer must stay usable on a laptop.
  expect(three.JSHeapUsedSize).toBeLessThan(1_500_000_000);
});
```

If `SystemInfo.getProcessInfo` is unavailable in the installed Chromium build, drop `rendererCpuTime` and keep the `Performance.getMetrics` heap numbers; they are the load-bearing figure.

- [ ] **Step 2: Run the measurements**

Bring the stack up as in Task 10, then (Git Bash):

```bash
cd web && E2E_MEASURE=1 npx playwright test e2e/measure.pw.test.ts
cat test-results/sp7-measurements.json
```

Expected: both tests pass; the JSON holds the hidden-tab survival count and the per-client heap delta.

- [ ] **Step 3: Record the numbers**

Create `docs/superpowers/measurements/2026-09-05-sp7-sessions.md`:

```md
# SP7 measurements — background-tab survival and three-client memory

Date: <run date>. Source: `web/e2e/measure.pw.test.ts` (`E2E_MEASURE=1`), Chromium <version>,
stack: engine 8899 + front server 8787 + firebase emulators. Raw output:
`web/test-results/sp7-measurements.json`.

## 1. Background-tab throttling (phase-a open question 2)

| Hidden for | Sessions | Still logged in | Verdict |
|---|---|---|---|
| <ms> | 3 | <n> | <pass/fail> |

The engine forces a logout after 60 s without a packet (`World.ts` `TIMEOUT_NO_RESPONSE = 100`
ticks). The client sends `NO_TIMEOUT` once a second from `gameLoop()`, so survival depends on
whether Chromium's intensive throttling (one wake per minute after 5 minutes) still lets that
send happen. <Conclusion, and the mitigation to adopt if it does not: audio keepalive, or moving
the keepalive off the main-thread timer.>

## 2. Memory for three live clients (phase-a open question 6)

| Live clients | JSHeapUsedSize | Delta per client |
|---|---|---|
| 0 | <bytes> | — |
| 1 | <bytes> | <bytes> |
| 2 | <bytes> | <bytes> |
| 3 | <bytes> | <bytes> |

Model, texture, interface and sound-synth caches are per iframe; the IndexedDB cache `lostcity`
is shared across the same-origin frames. <Conclusion on whether three is a safe ceiling.>
```

Fill every `<...>` from the JSON before committing — no placeholders survive this step.

- [ ] **Step 4: Commit**

```bash
git add web/e2e/measure.pw.test.ts docs/superpowers/measurements/2026-09-05-sp7-sessions.md
git commit -m "test(e2e): SP7 background-throttling and three-client memory measurements"
```

---

### Task 12: Spec renumbering, README and roadmap

**Files:**
- Modify: `docs/superpowers/specs/2026-09-05-sp7-character-tabs-and-sessions-design.md`, `docs/superpowers/specs/2026-09-05-idlescape-roadmap-and-handoff.md`, `README.md`

- [ ] **Step 1: Renumber and correct the addendum's client-patch table**

In `docs/superpowers/specs/2026-09-05-sp7-character-tabs-and-sessions-design.md` section 4, replace the table (rows 17-22) with the shipped numbering, which starts at 22 because SP4a Task 2 owns 17-21:

```md
| # | Site | Change |
|---|---|---|
| 22 | private fields (patch 2) | `armedUser`, `armedPass`, `armedLabel`, `renderSuspended = false`, `attended = false`. The armed credentials are a separate copy because `logout()` clears `loginUser`/`loginPass`. |
| 23 | `installHooks` bridge (patch 3) | `armLogin(gameName, secret, label)` stores credentials and sets `headlessTitle` without logging in; `loginArmed()` runs the armed login; `setRenderSuspended(v)` sets the flag and calls `refresh()` when `v` is false; `setAttended(v)`. |
| 24 | `titleScreenDraw()` (patches 8/9) | Under `headlessTitle`: draw `armedLabel` and one centred `imageTitlebutton` labelled "Login" instead of "Waiting for idlescape..."; keep `loginMes1/2` for errors and offer the same button on `loginscreen === 2`. |
| 25 | `titleScreenLoop()` (patch 7) | Under `headlessTitle`: hit-test the Login button and call `login(armedUser, armedPass, false)`; keep the `pendingHeadlessLogin` path for `hooks.login`/`hooks.loginArmed`. |
| 26 | `mainredraw()` | `if (this.renderSuspended && this.ingame) return;` |
| 27 | idle block in `gameLoop()` | `!this.attended &&` guard. Production-only for the engine effect (`node.debug: true` makes `IdleTimerHandler` a no-op — phase-a critic report row 10); the client-side `logoutTimer = 250` effect applies today. |
```

and change the sentence under it to: "`bundle.ts` reserves `armLogin`, `loginArmed`, `setRenderSuspended`, `setAttended`."

- [ ] **Step 2: Record the owner rulings in the addendum**

Add to section 1, under the verbatim requirements:

```md
Rulings recorded after this document was first written (2026-09-05, conversation):

- The tabs live **in the frame**, across the top of the game view, not in the side panel.
- Tabs only ever represent **created** characters; the remaining slots are capacity, not characters.
- Limits stay guest 2 / registered 3, read from `GET /api/characters`.
- A guest's third slot is a **disabled** tab with the tooltip "Create an account to unlock a third character".
- Any further "Add more" slot is **disabled** with the text "coming soon".
- The Characters side panel stays as SP6 built it; only its "Log in as <name>" button becomes "Open tab".
- Client patches are numbered from **22** (SP4a already uses 17-21).
```

and set the document's `Status:` line to `implemented by docs/superpowers/plans/2026-09-05-sp7-character-tabs-and-sessions.md`.

Section 7 ("Out of scope") loses the measurements sentence: they are Task 11 of this plan, not deferred.

- [ ] **Step 3: Update the roadmap row**

In `docs/superpowers/specs/2026-09-05-idlescape-roadmap-and-handoff.md` section 4, replace the SP7 row with:

```md
| SP7 | Iframe per character (`web/play.html`), session manager with render suspend, character tab strip in the frame (guest 2 / registered 3 slots, locked guest slot, "coming soon"), name-first login for guests, single "Login" title button (client patches 22-27), per-character trackers and task runtime, throttling and memory measurements. Plan: `docs/superpowers/plans/2026-09-05-sp7-character-tabs-and-sessions.md`. | SP6 |
```

The mute toggle stays listed under a later sub-project: it is not part of SP7 as built (the addendum's decision table does not include it, and the owner requirements do not mention it). Note that explicitly in the row's dependency column or in section 12 "Out of scope".

- [ ] **Step 4: Update the README**

Under "How it fits together", replace the sentence describing the single client with:

```md
The shell no longer loads the game client into its own document. Each character the player opens
gets a same-origin `/play.html` iframe with its own `#canvas` and its own
`window.idlescape.{client,plugins}`; the shell arms it with credentials from
`POST /api/characters/:id/session` and the client's title screen shows one "Login" button. Hidden
characters keep simulating with rendering suspended, so switching tabs resumes instantly. The
parent's `window.idlescape.client` is a façade over whichever character's tab is in front.
```

and add a line to the local-development notes: "`web/play.html` is a second Vite entry point; `npm run build` emits `dist/play.html` and the front server serves it at `/play.html` behind the same gate cookie as `/`."

- [ ] **Step 5: Full verification pass**

Run all four suites:

```bash
cd client && ~/.bun/bin/bunx tsc --noEmit && ~/.bun/bin/bun test src/hooks src/plugins && ~/.bun/bin/bun run build:dev
cd server && ~/.bun/bin/bun run typecheck && ~/.bun/bin/bun test
cd web && npm run typecheck && npm run lint && npx vitest run
cd web && npm run build:e2e && npx playwright test
```

Expected: all green. Also re-run the `client/PATCHES.md` grep block and confirm every count matches, and `wc -l` every file touched in `web/src` to confirm none crossed 400 lines.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/superpowers/specs/2026-09-05-sp7-character-tabs-and-sessions-design.md docs/superpowers/specs/2026-09-05-idlescape-roadmap-and-handoff.md
git commit -m "docs: SP7 patch renumbering, owner rulings, roadmap and README for one client per character"
```

---

## Self-review notes

**Spec coverage.** Owner requirement 1 (name selection for new accounts *and* first-time guests, then load client and panel) → Tasks 6, 7 (`enterFrame` auto-presses Login for a just-created character), 10. Requirement 2 (Login button only, no fields) → Tasks 1, 2, 10. Requirement 3 (a client instance is bound to the character it logged in for) → Task 4 (`armLogin` per iframe, one iframe per character, never reused). Requirement 4 (tabs across the top, name + logged-in state, switching) → Tasks 5, 7. Requirement 5 (guest 2 / registered 3, disabled third slot with a tooltip, further slots "coming soon") → Task 5 (`computeSlots`), Task 7 (limit from `homeCtl.characterLimit()`), Task 10. Requirement 6 (Characters panel unchanged) → Task 8 keeps its markup, copy and delete flow and changes only the switch button and the status column. Addendum section 2 decisions → guest names Task 6; limits Tasks 5, 7; strip location Task 5; tab contents Task 5; one client per character Tasks 3, 4; login screen Tasks 1, 2; status source Task 4; first-login flow Tasks 6, 7. Section 3 architecture → Tasks 3, 4, 7, 9. Section 4 patches → Tasks 1, 2 (renumbered 22-27 in Task 12). Section 5 tab behaviour → Task 5, plus delete-closes-the-tab in Task 8. Section 6 testing → Tasks 1 (bun), 4, 5, 6, 7, 8 (vitest), 10 (Playwright). Parent spec section 5's measurements → Task 11. Critic row 10 → patch 27's production-only note (Task 2 Step 4, Task 12 Step 1). Critic row 19 → nothing to do: `position`/`activeTab`/`sceneReady` already ship, and the strip needs only `loggedIn`.

**Not in SP7 by design.** The mute toggle and `setAudioMuted` (parent spec section 5) — the addendum's decision table and the owner requirements omit them; Task 12 Step 3 records that. The `activity` hook field and the richer switcher dashboard (parent decision 12) — the strip needs only the three display statuses. Kicking an online character on delete from *another* browser tab (SP8's engine overlay); SP7 closes only this document's iframe.

**Type consistency.** `SessionState`/`SessionStatus`/`CharacterSession`/`deriveSessionState`/`displayStatus` are defined once in Task 4 (`web/src/sessions/types.ts`) and consumed by Tasks 5, 7, 8. `CharacterSessionManager` (Task 4) gains no members later; `setCharacters` is on it from the start because Tasks 7 and 8 both call it. `ClientFrameWindow` and `frameWindow` come from Task 4 and are used in Tasks 7 and 9. `applyFrameSize` is added in Task 7 before `layout()` uses it. `CharactersDeps`'s new members (Task 8) are all backed by manager methods defined in Task 4. `GateDeps.onReady(characters, chosen, created)` and `HomeControllerDeps.enterFrame` are defined in Task 6 and consumed in Task 7; Task 6 Step 6 keeps `main.ts` compiling in between. `ClientHooks`'s four new members are added in Task 1 and used from Task 4 onward, in both `client/src/hooks/types.ts` and `web/src/clientTypes.ts`. The `Window.idlescape` declaration has exactly one home (`web/src/clientTypes.ts`, Task 1 Step 8) so Task 9's `tasks?` member merges rather than conflicts.

**Placeholder scan.** No "TBD", no "similar to task N", no "add error handling". The two conditional passages are deliberate and bounded: Task 9's SP4a-landed / not-landed / differs branches (with the invariant stated so the adaptation is mechanical), and Task 11's `SystemInfo.getProcessInfo` fallback. Task 11 Step 3's `<...>` markers are inside a document template whose own step says to fill them from the recorded JSON before committing.
