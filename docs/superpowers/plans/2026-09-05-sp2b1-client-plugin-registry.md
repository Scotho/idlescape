# SP2b-1 — Client-tier Plugin Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the client-tier plugin registry (`window.idlescape.plugins`) and a `ClientCapability` object, so client-tier plugins can be registered inside the client bundle and enabled/disabled from the shell — the foundation the GPU renderer (SP2b-2/3) and future scene plugins (SP5) plug into.

**Architecture:** A new `client/src/plugins/` module (`capability.ts`, `registry.ts`) is installed alongside the existing hooks in `client/src/hooks/install.ts`, exposing `window.idlescape.plugins`. In this stage the capability's `state()` is real (delegates to the hook bridge's `getState`) while `renderer`, `scene`, and `menu` are honest stubs (documented seams filled by SP2b-2/3 and SP5); `frame.onBeforeDraw/onAfterDraw` register callbacks (fired once GameShell is wired in SP2b-2). The web shell's SP2a `onClientToggle` seam (a `console.info` no-op today) is changed to dispatch to `window.idlescape.plugins`.

**Tech Stack:** TypeScript, the Client-TS fork (Bun bundle + `bun test`), the SP2a web framework (Vite/Vitest).

**Spec:** `docs/superpowers/specs/2026-09-05-sp2-plugin-framework-design.md` (SP2 §3.1, the client tier + `ClientCapability`) as revised by `docs/superpowers/specs/2026-09-05-sp2b-gpu-spike-findings.md` (staging: this is SP2b-1).

## Global Constraints

- **Two-bundle boundary + terser property mangling.** The client bundle mangles property names except those in `client/bundle.ts` → `mangle.properties.reserved`. The web calls `window.idlescape.plugins.enable(id, settings)` and `.disable(id)` across the bundle boundary, so `plugins`, `enable`, `disable` MUST be reserved. (Registration and capability methods are called only inside the client bundle, where mangling is self-consistent, so they need not be reserved — but `state` is already reserved from the hooks work; leave it.)
- **Do NOT change rendering behaviour.** This stage adds plumbing only: no renderer is instantiated, no frame callback is fired, no pixel changes. `renderer.current()` returns `'software'`; `renderer.set('webgl'|'webgpu')` rejects ("no backend loaded") until SP2b-2.
- **Client/web type mirrors.** `web/src/clientTypes.ts` mirrors `client/src/hooks/types.ts`. This plan adds a small `ClientPluginRegistry` typing the web needs to call `window.idlescape.plugins`; keep the web's copy minimal and consistent with the client's public shape.
- **Do NOT touch the engine or the live PoC** (8888/43594/8898).
- **Branch:** commit to `feat/platform-shell`. Local-only; no deploy.
- **Commit trailers (every commit):**
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Qn4XvzDVpesgyj3peXiM3M
  ```
- **Commands (Git Bash):** client tests — `cd client && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "bun test src/plugins"` (and `src/hooks`); client build — `cd client && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "bun run build:dev"`; web — `cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npm run typecheck|npm run build"`. The `MSYS2_ARG_CONV_EXCL="*"` prefix is REQUIRED.

## Interfaces from earlier work

`client/src/hooks/types.ts`: `ClientState`, `ClientHooks`. `client/src/hooks/install.ts`: `installHooks(bridge)` sets `window.idlescape.client`; `HookBridge.getState(): ClientState`. SP2a web `main.ts` has `onClientToggle(id, enabled, settings)` wired into the shell registry (currently `console.info`).

---

## File Structure

- `client/src/plugins/capability.ts` — **Create.** `ClientCapability`, `RendererMode`, `createCapability(deps)`.
- `client/src/plugins/registry.ts` — **Create.** `ClientPlugin`, `ClientPluginRegistry`, `createClientPluginRegistry(cap)`.
- `client/src/hooks/install.ts` — **Modify.** Build the capability + registry, expose `window.idlescape.plugins`, extend the `Window` global.
- `client/bundle.ts` — **Modify.** Reserve `plugins`, `enable`, `disable`.
- `client/PATCHES.md` — **Modify.** Document the client-tier registry.
- `web/src/clientTypes.ts` — **Modify.** Add a minimal `ClientPluginRegistry` type + `window.idlescape.plugins` typing.
- `web/src/main.ts` — **Modify.** `onClientToggle` dispatches to `window.idlescape.plugins`.
- Tests: `client/src/plugins/registry.test.ts`, `client/src/plugins/capability.test.ts`.

---

### Task 1: ClientCapability and ClientPluginRegistry

**Files:**
- Create: `client/src/plugins/capability.ts`, `client/src/plugins/registry.ts`
- Test: `client/src/plugins/capability.test.ts`, `client/src/plugins/registry.test.ts`

**Interfaces:**
- Consumes: `ClientState` from `../hooks/types`.
- Produces:
  - `type RendererMode = 'software' | 'webgl' | 'webgpu'`
  - `interface ClientCapability { renderer: { set(mode: RendererMode): Promise<void>; current(): RendererMode }; frame: { onBeforeDraw(cb: () => void): () => void; onAfterDraw(cb: () => void): () => void }; scene: { project(x: number, z: number, level: number, height: number): { sx: number; sy: number } | null }; menu: { onBuild(cb: () => void): () => void }; state: () => ClientState }`
  - `function createCapability(deps: { state: () => ClientState }): ClientCapability & { _fireBeforeDraw(): void; _fireAfterDraw(): void }` — the two `_fire*` methods let a later stage (GameShell wiring) drive the frame callbacks; they are internal (underscore) and not part of the public capability surface.
  - `interface ClientPlugin { id: string; onEnable(cap: ClientCapability, settings: Record<string, unknown>): void | Promise<void>; onDisable(): void }`
  - `interface ClientPluginRegistry { register(plugin: ClientPlugin): void; enable(id: string, settings?: Record<string, unknown>): Promise<void>; disable(id: string): void; isEnabled(id: string): boolean }`
  - `function createClientPluginRegistry(cap: ClientCapability): ClientPluginRegistry`

- [ ] **Step 1: Write the failing capability test**

```ts
// client/src/plugins/capability.test.ts
import { describe, expect, test } from 'bun:test';
import { createCapability } from './capability';
import type { ClientState } from '../hooks/types';

const S: ClientState = { loggedIn: true, gameName: 'b', skills: { xp: [], level: [] }, inventory: [], fps: 50, rttMs: null, hp: { current: 1, max: 1 }, prayer: { current: 1, max: 1 }, energy: 0, boosts: [] };

describe('ClientCapability', () => {
  test('state() delegates to the injected getter', () => {
    const cap = createCapability({ state: () => S });
    expect(cap.state()).toBe(S);
  });
  test('renderer defaults to software and rejects non-software until a backend loads', async () => {
    const cap = createCapability({ state: () => S });
    expect(cap.renderer.current()).toBe('software');
    await expect(cap.renderer.set('webgl')).rejects.toThrow();
    await expect(cap.renderer.set('software')).resolves.toBeUndefined();
  });
  test('scene.project is a null stub; menu.onBuild returns an unsubscribe', () => {
    const cap = createCapability({ state: () => S });
    expect(cap.scene.project(1, 2, 0, 0)).toBeNull();
    const unsub = cap.menu.onBuild(() => {});
    expect(typeof unsub).toBe('function');
  });
  test('frame callbacks fire via the internal _fire hooks and unsubscribe works', () => {
    const cap = createCapability({ state: () => S });
    let before = 0, after = 0;
    const un = cap.frame.onBeforeDraw(() => { before++; });
    cap.frame.onAfterDraw(() => { after++; });
    cap._fireBeforeDraw(); cap._fireAfterDraw();
    expect(before).toBe(1); expect(after).toBe(1);
    un(); cap._fireBeforeDraw();
    expect(before).toBe(1);
  });
});
```

- [ ] **Step 2: Write the failing registry test**

```ts
// client/src/plugins/registry.test.ts
import { describe, expect, test } from 'bun:test';
import { createClientPluginRegistry } from './registry';
import { createCapability } from './capability';
import type { ClientState } from '../hooks/types';

const S: ClientState = { loggedIn: true, gameName: 'b', skills: { xp: [], level: [] }, inventory: [], fps: 50, rttMs: null, hp: { current: 1, max: 1 }, prayer: { current: 1, max: 1 }, energy: 0, boosts: [] };
const cap = () => createCapability({ state: () => S });

describe('ClientPluginRegistry', () => {
  test('enable calls onEnable with the capability and settings; disable calls onDisable', async () => {
    const reg = createClientPluginRegistry(cap());
    let enabledWith: unknown = null; let disabled = false;
    reg.register({ id: 'gpu', onEnable: (c, s) => { enabledWith = { c, s }; }, onDisable: () => { disabled = true; } });
    await reg.enable('gpu', { mode: 'webgl' });
    expect(reg.isEnabled('gpu')).toBe(true);
    expect((enabledWith as { s: unknown }).s).toEqual({ mode: 'webgl' });
    reg.disable('gpu');
    expect(reg.isEnabled('gpu')).toBe(false);
    expect(disabled).toBe(true);
  });
  test('enable on an unknown id is a no-op (no throw)', async () => {
    const reg = createClientPluginRegistry(cap());
    await reg.enable('nope');
    expect(reg.isEnabled('nope')).toBe(false);
  });
  test('double enable does not call onEnable twice', async () => {
    const reg = createClientPluginRegistry(cap());
    let n = 0;
    reg.register({ id: 'p', onEnable: () => { n++; }, onDisable: () => {} });
    await reg.enable('p'); await reg.enable('p');
    expect(n).toBe(1);
  });
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `cd client && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "bun test src/plugins"`
Expected: FAIL — modules `./capability` / `./registry` not found.

- [ ] **Step 4: Implement `capability.ts`**

```ts
// client/src/plugins/capability.ts
import type { ClientState } from '../hooks/types';

export type RendererMode = 'software' | 'webgl' | 'webgpu';

export interface ClientCapability {
  renderer: { set(mode: RendererMode): Promise<void>; current(): RendererMode };
  frame: { onBeforeDraw(cb: () => void): () => void; onAfterDraw(cb: () => void): () => void };
  scene: { project(x: number, z: number, level: number, height: number): { sx: number; sy: number } | null };
  menu: { onBuild(cb: () => void): () => void };
  state: () => ClientState;
}

export interface InternalCapability extends ClientCapability {
  _fireBeforeDraw(): void;
  _fireAfterDraw(): void;
}

export function createCapability(deps: { state: () => ClientState }): InternalCapability {
  const before = new Set<() => void>();
  const after = new Set<() => void>();
  let mode: RendererMode = 'software';
  const sub = (set: Set<() => void>, cb: () => void): (() => void) => { set.add(cb); return () => set.delete(cb); };
  const fire = (set: Set<() => void>): void => { for (const cb of set) cb(); };
  return {
    renderer: {
      current: () => mode,
      // Only 'software' is available until a backend plugin loads (SP2b-2). A backend
      // replaces this capability's renderer at that point.
      set: async (m: RendererMode) => {
        if (m !== 'software') throw new Error(`renderer '${m}' has no backend loaded yet`);
        mode = m;
      }
    },
    frame: {
      onBeforeDraw: cb => sub(before, cb),
      onAfterDraw: cb => sub(after, cb)
    },
    scene: { project: () => null }, // SP5 fills this
    menu: { onBuild: () => () => {} }, // SP5 fills this
    state: deps.state,
    _fireBeforeDraw: () => fire(before),
    _fireAfterDraw: () => fire(after)
  };
}
```

- [ ] **Step 5: Implement `registry.ts`**

```ts
// client/src/plugins/registry.ts
import type { ClientCapability } from './capability';

export interface ClientPlugin {
  id: string;
  onEnable(cap: ClientCapability, settings: Record<string, unknown>): void | Promise<void>;
  onDisable(): void;
}

export interface ClientPluginRegistry {
  register(plugin: ClientPlugin): void;
  enable(id: string, settings?: Record<string, unknown>): Promise<void>;
  disable(id: string): void;
  isEnabled(id: string): boolean;
}

export function createClientPluginRegistry(cap: ClientCapability): ClientPluginRegistry {
  const plugins = new Map<string, ClientPlugin>();
  const enabled = new Set<string>();
  return {
    register(plugin) { plugins.set(plugin.id, plugin); },
    async enable(id, settings = {}) {
      const p = plugins.get(id);
      if (!p || enabled.has(id)) return;
      enabled.add(id);
      await p.onEnable(cap, settings);
    },
    disable(id) {
      const p = plugins.get(id);
      if (!p || !enabled.has(id)) return;
      enabled.delete(id);
      p.onDisable();
    },
    isEnabled: id => enabled.has(id)
  };
}
```

- [ ] **Step 6: Run both tests to verify they pass**

Run: `cd client && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "bun test src/plugins"`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add client/src/plugins/capability.ts client/src/plugins/registry.ts client/src/plugins/capability.test.ts client/src/plugins/registry.test.ts
git commit -m "feat(client-plugins): ClientCapability and client-tier plugin registry"
```

---

### Task 2: Expose `window.idlescape.plugins` from the client bundle

**Files:**
- Modify: `client/src/hooks/install.ts`
- Modify: `client/bundle.ts` (terser reserved), `client/PATCHES.md`

**Interfaces:**
- Consumes: `createCapability` from `../plugins/capability`, `createClientPluginRegistry` + `ClientPluginRegistry` from `../plugins/registry`; the existing `HookBridge.getState`.
- Produces: `window.idlescape.plugins: ClientPluginRegistry`, and the returned `Installed` optionally exposes the registry for internal client use.

- [ ] **Step 1: Extend `install.ts`**

Add imports at the top:
```ts
import { createCapability } from '../plugins/capability';
import { createClientPluginRegistry, type ClientPluginRegistry } from '../plugins/registry';
```
Extend the `Window` global to include `plugins`:
```ts
declare global {
  interface Window { idlescape?: { client?: ClientHooks; plugins?: ClientPluginRegistry } }
}
```
In `installHooks(bridge)`, after `hooks` is built and before setting `window.idlescape`, add:
```ts
  const capability = createCapability({ state: () => bridge.getState() });
  const plugins = createClientPluginRegistry(capability);
```
Change the window assignment from `{ ...(window.idlescape ?? {}), client: hooks }` to:
```ts
  window.idlescape = { ...(window.idlescape ?? {}), client: hooks, plugins };
```
(Leave the `idlescape:client-ready` event dispatch as-is.)

- [ ] **Step 2: Reserve the public property names in `client/bundle.ts`**

In `mangle.properties.reserved`, extend the idlescape API line. After `'client',` add `'plugins', 'enable', 'disable',` (these cross the bundle boundary — the web calls `window.idlescape.plugins.enable/disable`).

- [ ] **Step 3: Document in `client/PATCHES.md`**

Add a bullet: `installHooks` now also exposes `window.idlescape.plugins` (a client-tier plugin registry) built with a `ClientCapability` whose `state()` delegates to the hook bridge; `renderer/scene/menu` are stubs pending SP2b-2/SP5; `bundle.ts` reserves `plugins/enable/disable`.

- [ ] **Step 4: Verify the client bundles and all client tests pass**

Run:
```
cd client && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "bun run build:dev"
cd client && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "bun test src/hooks src/plugins"
```
Expected: bundle succeeds; all client tests pass. (Optionally confirm the built `out/client.js` contains the unmangled string `plugins` next to `client`.)

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/install.ts client/bundle.ts client/PATCHES.md
git commit -m "feat(client-plugins): expose window.idlescape.plugins from the client bundle"
```

---

### Task 3: Dispatch shell `onClientToggle` to the client registry

**Files:**
- Modify: `web/src/clientTypes.ts` (add the `ClientPluginRegistry` type + `window.idlescape.plugins` typing)
- Modify: `web/src/main.ts` (replace the `onClientToggle` no-op)

**Interfaces:**
- Consumes: `window.idlescape.plugins` (installed by the client bundle after `loadClient`).
- Produces: `onClientToggle(id, enabled, settings)` now calls `window.idlescape.plugins?.enable(id, settings)` / `.disable(id)` instead of logging.

- [ ] **Step 1: Add the web-side typing to `web/src/clientTypes.ts`**

Append (mirrors the client's public shape; the web only needs the registry's calling surface):
```ts
export interface ClientPluginRegistry {
  register(plugin: unknown): void;
  enable(id: string, settings?: Record<string, unknown>): Promise<void>;
  disable(id: string): void;
  isEnabled(id: string): boolean;
}

declare global {
  interface Window { idlescape?: { client?: ClientHooks; plugins?: ClientPluginRegistry } }
}
```
(If a `declare global` for `window.idlescape` already exists elsewhere in the web sources, extend that one instead of adding a second — grep `web/src` for `idlescape?:` first and keep a single declaration.)

- [ ] **Step 2: Replace the `onClientToggle` no-op in `web/src/main.ts`**

Find the shell registry's `onClientToggle` (currently `console.info(...)`), and change it to dispatch to the client registry:
```ts
  onClientToggle: (id, enabled, settings) => {
    const plugins = window.idlescape?.plugins;
    if (!plugins) return; // client bundle not loaded yet; the shell re-syncs on next init
    if (enabled) void plugins.enable(id, settings as Record<string, unknown>);
    else plugins.disable(id);
  },
```

- [ ] **Step 3: Verify web typecheck and build**

Run:
```
cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npm run typecheck"
cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npm test"
cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npm run build"
```
Expected: typecheck exit 0; all unit tests pass; build succeeds. (No client-tier shell plugin is registered yet, so `onClientToggle` has no live trigger in this stage — SP2b-2 adds the `gpu-renderer` shell manifest that exercises it. The dispatch is verified by typecheck + build here.)

- [ ] **Step 4: Commit**

```bash
git add web/src/clientTypes.ts web/src/main.ts
git commit -m "feat(client-plugins): shell onClientToggle dispatches to window.idlescape.plugins"
```

---

## Self-Review

**1. Spec coverage (SP2 §3.1 client tier, SP2b-1 slice):** `window.idlescape.plugins` + `ClientPluginRegistry` (Tasks 1, 2); `ClientCapability` with `renderer`/`frame`/`scene`/`menu`/`state` (Task 1, renderer/scene/menu stubbed per the staging); shell drives client plugins via `onClientToggle` (Task 3). The renderer backend, GameShell frame-callback firing, and the `gpu-renderer` plugin are SP2b-2 (noted). WebGPU deferred.

**2. Placeholder scan:** No TBD/TODO; all code present. The stubs (`renderer.set` rejecting non-software, `scene.project` → null, `menu.onBuild` → no-op unsub, unfired `frame` callbacks) are deliberate, documented seams for named later stages, not placeholders.

**3. Type consistency:** `ClientCapability`/`RendererMode` defined in Task 1, consumed by `registry.ts` and `install.ts`. `ClientPluginRegistry` shape identical between `client/src/plugins/registry.ts` (Task 1) and the web mirror in `web/src/clientTypes.ts` (Task 3, calling surface). `window.idlescape` global extended consistently in client `install.ts` (Task 2) and web `clientTypes.ts` (Task 3). `createCapability` returns `InternalCapability` (adds `_fireBeforeDraw/_fireAfterDraw`) so SP2b-2 can drive frame callbacks from GameShell.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-05-sp2b1-client-plugin-registry.md`. This is SP2b-1 (client-tier registry foundation). Recommended execution: **subagent-driven-development**, fresh ledger at `.superpowers/sdd/2026-09-05-sp2b1-client-plugin-registry/`. Next after this: SP2b-2 (fullscreen WebGL present path — the first real renderer, low-risk), then the checkpointed SP2b-3 (scene rasterizer, high-risk).
