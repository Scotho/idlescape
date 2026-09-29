# SP2a — Plugin Framework Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the SP1 panel registry into a real shell-tier plugin framework — manifests with typed settings, per-user settings persistence (Firestore + localStorage), a Plugins panel with toggles and settings forms — and migrate the six existing SP1 panels onto it so the platform still works, now plugin-managed.

**Architecture:** A new `web/src/plugins/` module owns the framework: `types.ts` (manifest, `SettingSchema`, `PluginContext`, `ShellPlugin`), `settings.ts` (a persistence store with Firestore-then-localStorage-then-defaults precedence and debounced writes), `settingsForm.ts` (renders a `SettingSchema` into a form), `registry.ts` (the `ShellPluginRegistry`: register/enable/disable, `requires` ordering, icon-strip management, settings wiring, and a no-op-until-SP2b seam for dispatching client-tier enable/disable), and `pluginsPanel.ts` (the Plugins panel). `main.ts` is rewired to build the registry, register the six SP1 panels as plugins, and restore enabled state on load. Firestore rules gain `users/{uid}/plugins/{pluginId}`.

**Tech Stack:** TypeScript, Vite, Vitest (jsdom), Firebase Web SDK v12 (Firestore), Playwright (e2e), Firebase emulator (rules tests).

**Spec:** `docs/superpowers/specs/2026-09-05-sp2-plugin-framework-design.md` (SP2). This plan implements the framework-core slice of that spec; the GPU renderer (spec §4) is SP2b and the Tier-1 shell plugins + generated data (spec §5, §3.4) are SP2c.

## Global Constraints

- **Build 274 runtime.** Front server on Bun (:8787); engine on Node 24 + tsx. This plan touches only `web/` and `firebase/`; do not touch `engine/`, `client/`, or the live PoC (ports 8888/43594/8898).
- **Local-only repo.** No remote, no push, no deploy. Firestore rules are validated against the emulator only; no cloud deploy.
- **Deploy is controller-gated.** Nothing ships to `osrs.scotho.com` in this plan.
- **Web import boundary:** the web build must not import from `client/` or `engine/`. Client-tier plugin control is reached only via `window.idlescape.plugins` at runtime (SP2b implements it).
- **Escaping:** any user-controlled or plugin-authored string rendered into `innerHTML` must go through `escapeHtml` from `web/src/dom.ts` (SP1 final-review rule: unescaped user strings are a stored-XSS class defect).
- **Storage safety:** every `localStorage` read/write is wrapped in `try/catch` (SP1 pattern — storage may be blocked); a blocked store must not throw.
- **Firestore settings shape:** `users/{uid}/plugins/{pluginId}` = `{ enabled: boolean, settings: {...primitives}, updatedAt }`, document under 8 KB, `settings` values limited to primitives (boolean/number/string).
- **Commit trailers (every commit):**
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Qn4XvzDVpesgyj3peXiM3M
  ```
- **Test commands:** web unit `cd web && npm test`; web typecheck `cd web && npm run typecheck`; rules `cd firebase && npm test` (emulator); e2e `cd web && npm run test:e2e`. On Windows/PowerShell, run npm via `cmd.exe /c "npm ..."` (the `.ps1` shim issue from SP1b).

---

## File Structure

- `web/src/plugins/types.ts` — **Create.** `SettingField`, `SettingSchema`, `SettingsValues`, `PluginManifest`, `PluginContext`, `ShellPlugin`, `definePlugin`.
- `web/src/plugins/settings.ts` — **Create.** `PluginDoc`, `SettingsStore`, `createSettingsStore(...)`: load precedence + debounced persistence, Firestore + localStorage.
- `web/src/plugins/settingsForm.ts` — **Create.** `renderSettingsForm(schema, values, onChange)`: `SettingSchema` → `HTMLElement`.
- `web/src/plugins/registry.ts` — **Create.** `ShellPluginRegistry`, `createShellRegistry(...)`: register/enable/disable, `requires`, icon strip, settings wiring, client-dispatch seam.
- `web/src/plugins/pluginsPanel.ts` — **Create.** `createPluginsPanel(...)`: the Plugins panel (list/search/toggle/gear/description/always-on).
- `firebase/firestore.rules` — **Modify.** Add `users/{uid}/plugins/{pluginId}` match.
- `firebase/rules.test.ts` — **Modify.** Tests for the new plugin-settings rules.
- `web/src/types.ts` — **Modify.** Add `'plugins'` to `PanelId`.
- `web/src/main.ts` — **Modify.** Rewire to `createShellRegistry`, register the six SP1 panels as plugins + the Plugins panel, restore enabled state.
- `web/tests/plugins.e2e.ts` — **Create.** Playwright: toggle a plugin, reload, assert persistence.
- Test files colocated: `web/src/plugins/*.test.ts`.

---

### Task 1: Plugin framework types

**Files:**
- Create: `web/src/plugins/types.ts`
- Test: `web/src/plugins/types.test.ts`

**Interfaces:**
- Consumes: `PanelView` from `web/src/frame/panels.ts` (`{ title: string; mount(body: HTMLElement): void; unmount?(): void }`); `ClientHooks` from `web/src/clientTypes.ts`.
- Produces: the type contract every later task imports — `SettingField`, `SettingSchema`, `SettingsValues`, `PluginManifest`, `PluginContext`, `ShellPlugin`, `definePlugin`.

> **Reconciliation with spec §3.1:** the spec sketches `panel?: (ctx) => HTMLElement`. The SP1 panel system uses `PanelView` (`title`/`mount`/`unmount`), and all six existing panels return it. To migrate them without rewriting their mount logic, `ShellPlugin.panel` returns `PanelView` here. Recorded as a plan ruling; behaviour is identical (a `PanelView` wraps the same element the spec's `HTMLElement` would be).

- [ ] **Step 1: Write the failing test**

```ts
// web/src/plugins/types.test.ts
import { describe, expect, test } from 'vitest';
import { definePlugin, type ShellPlugin, type SettingSchema } from './types';

describe('plugin types', () => {
  test('definePlugin returns its argument unchanged (identity helper for inference)', () => {
    const schema: SettingSchema = { show: { type: 'boolean', label: 'Show', default: true } };
    const p: ShellPlugin = {
      manifest: { id: 'demo', name: 'Demo', icon: '★', tier: 'shell', description: 'd', settings: schema }
    };
    expect(definePlugin(p)).toBe(p);
  });

  test('a manifest may declare alwaysOn and requires', () => {
    const p = definePlugin({
      manifest: { id: 'a', name: 'A', icon: '☺', tier: 'shell', description: 'x', alwaysOn: true, requires: ['b'] }
    });
    expect(p.manifest.alwaysOn).toBe(true);
    expect(p.manifest.requires).toEqual(['b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && cmd.exe /c "npx vitest run src/plugins/types.test.ts"`
Expected: FAIL — cannot find module `./types`.

- [ ] **Step 3: Write the implementation**

```ts
// web/src/plugins/types.ts
import type { PanelView } from '../frame/panels';
import type { ClientHooks } from '../clientTypes';

export type SettingField =
  | { type: 'boolean'; label: string; default: boolean }
  | { type: 'number'; label: string; default: number; min?: number; max?: number; step?: number }
  | { type: 'select'; label: string; default: string; options: { value: string; label: string }[] }
  | { type: 'color'; label: string; default: string }
  | { type: 'text'; label: string; default: string; maxLength?: number };

export type SettingSchema = Record<string, SettingField>;
export type SettingValue = boolean | number | string;
export type SettingsValues = Record<string, SettingValue>;

export interface PluginManifest {
  /** kebab-case, stable, used in Firestore paths and localStorage keys. */
  id: string;
  name: string;
  icon: string;
  tier: 'shell' | 'client';
  description: string;
  settings?: SettingSchema;
  /** Enabled by default when the user has no stored preference. */
  defaultEnabled?: boolean;
  /** Cannot be disabled by the user (e.g. account, claude-connection). Implies enabled. */
  alwaysOn?: boolean;
  /** Other plugin ids that must be enabled for this one to enable. */
  requires?: string[];
}

/** Everything a shell plugin is handed at enable time. */
export interface PluginContext {
  /** The live client hooks, or null before the client has started. */
  client: () => ClientHooks | null;
  settings: {
    get<T extends SettingValue = SettingValue>(key: string): T;
    set(key: string, value: SettingValue): void;
    subscribe(fn: (values: SettingsValues) => void): () => void;
  };
  /** Per-plugin namespaced localStorage (keys are prefixed with the plugin id). */
  storage: { get(key: string): string | null; set(key: string, value: string): void };
  /** Toast + browser notification. */
  notify: (message: string, kind?: 'info' | 'error') => void;
  openPanel: (id: string) => void;
  /** Current user, or null before login/bridge. */
  user: () => { uid: string; gameName: string | null } | null;
}

export interface ShellPlugin {
  manifest: PluginManifest;
  onEnable?(ctx: PluginContext): void | Promise<void>;
  onDisable?(): void;
  /** Side-panel body shown when this plugin's icon is active. */
  panel?(ctx: PluginContext): PanelView;
  /** Absolutely-positioned element rendered over the canvas while enabled. */
  overlay?(ctx: PluginContext): HTMLElement;
  onTick?(cycle: number): void;
}

/** Identity helper: gives call-site type inference without changing the value. */
export function definePlugin(p: ShellPlugin): ShellPlugin {
  return p;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && cmd.exe /c "npx vitest run src/plugins/types.test.ts"` then `cd web && cmd.exe /c "npm run typecheck"`
Expected: PASS; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/plugins/types.ts web/src/plugins/types.test.ts
git commit -m "feat(plugins): shell plugin framework types and definePlugin"
```

---

### Task 2: Settings persistence store

**Files:**
- Create: `web/src/plugins/settings.ts`
- Test: `web/src/plugins/settings.test.ts`

**Interfaces:**
- Consumes: `SettingsValues` from `./types`; Firestore `db` from `../firebase` (injected in tests, not imported directly, so the store is unit-testable without Firebase).
- Produces:
  - `interface PluginDoc { enabled: boolean; settings: SettingsValues }`
  - `interface SettingsBackend { load(uid): Promise<Record<string, PluginDoc>>; write(uid, id, doc): Promise<void> }`
  - `function createSettingsStore(backend: SettingsBackend, opts?: { debounceMs?: number; now?: () => number }): SettingsStore`
  - `interface SettingsStore { load(uid: string | null): Promise<Map<string, PluginDoc>>; get(id: string): PluginDoc | undefined; setEnabled(uid, id, enabled): void; setSettings(uid, id, settings): void; flush(): Promise<void> }`

**Design notes (from spec §3.2):** load precedence is Firestore (via backend) if it returns anything, else localStorage, else empty (callers fall back to manifest defaults). Writes go to localStorage synchronously, then to the backend debounced. Guests use the same path under their anonymous uid. `uid === null` means not-signed-in: localStorage only, no backend calls.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/plugins/settings.test.ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createSettingsStore, type PluginDoc, type SettingsBackend } from './settings';

function memoryBackend(seed: Record<string, PluginDoc> = {}): SettingsBackend & { writes: [string, string, PluginDoc][] } {
  const writes: [string, string, PluginDoc][] = [];
  return {
    writes,
    async load() { return { ...seed }; },
    async write(uid, id, doc) { writes.push([uid, id, doc]); }
  };
}

beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('settings store', () => {
  test('load prefers backend docs over localStorage', async () => {
    try { localStorage.setItem('cs.plugin.xp', JSON.stringify({ enabled: false, settings: {} })); } catch { /* ignore */ }
    const store = createSettingsStore(memoryBackend({ xp: { enabled: true, settings: { rate: 5 } } }));
    const map = await store.load('u1');
    expect(map.get('xp')).toEqual({ enabled: true, settings: { rate: 5 } });
  });

  test('load falls back to localStorage when backend is empty', async () => {
    try { localStorage.setItem('cs.plugin.notes', JSON.stringify({ enabled: true, settings: { text: 'hi' } })); } catch { /* ignore */ }
    const store = createSettingsStore(memoryBackend());
    const map = await store.load('u1');
    expect(map.get('notes')).toEqual({ enabled: true, settings: { text: 'hi' } });
  });

  test('setEnabled writes localStorage immediately and backend after debounce', async () => {
    const backend = memoryBackend();
    const store = createSettingsStore(backend, { debounceMs: 500 });
    await store.load('u1');
    store.setEnabled('u1', 'xp', false);
    expect(JSON.parse(localStorage.getItem('cs.plugin.xp')!).enabled).toBe(false);
    expect(backend.writes.length).toBe(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(backend.writes).toEqual([['u1', 'xp', { enabled: false, settings: {} }]]);
  });

  test('a null uid never calls the backend', async () => {
    const backend = memoryBackend();
    const store = createSettingsStore(backend, { debounceMs: 10 });
    await store.load(null);
    store.setEnabled(null, 'xp', true);
    await vi.advanceTimersByTimeAsync(10);
    expect(backend.writes.length).toBe(0);
    expect(JSON.parse(localStorage.getItem('cs.plugin.xp')!).enabled).toBe(true);
  });

  test('setSettings merges into the existing doc and coalesces rapid writes', async () => {
    const backend = memoryBackend();
    const store = createSettingsStore(backend, { debounceMs: 500 });
    await store.load('u1');
    store.setSettings('u1', 'xp', { a: 1 });
    store.setSettings('u1', 'xp', { a: 1, b: 2 });
    await vi.advanceTimersByTimeAsync(500);
    expect(backend.writes.length).toBe(1);
    expect(backend.writes[0][2].settings).toEqual({ a: 1, b: 2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && cmd.exe /c "npx vitest run src/plugins/settings.test.ts"`
Expected: FAIL — cannot find module `./settings`.

- [ ] **Step 3: Write the implementation**

```ts
// web/src/plugins/settings.ts
import type { SettingsValues } from './types';

export interface PluginDoc { enabled: boolean; settings: SettingsValues }

export interface SettingsBackend {
  load(uid: string): Promise<Record<string, PluginDoc>>;
  write(uid: string, id: string, doc: PluginDoc): Promise<void>;
}

export interface SettingsStore {
  load(uid: string | null): Promise<Map<string, PluginDoc>>;
  get(id: string): PluginDoc | undefined;
  setEnabled(uid: string | null, id: string, enabled: boolean): void;
  setSettings(uid: string | null, id: string, settings: SettingsValues): void;
  flush(): Promise<void>;
}

const KEY = (id: string) => `cs.plugin.${id}`;

function readLocal(id: string): PluginDoc | undefined {
  try {
    const raw = localStorage.getItem(KEY(id));
    return raw ? (JSON.parse(raw) as PluginDoc) : undefined;
  } catch { return undefined; }
}
function writeLocal(id: string, doc: PluginDoc): void {
  try { localStorage.setItem(KEY(id), JSON.stringify(doc)); } catch { /* storage blocked */ }
}

export function createSettingsStore(backend: SettingsBackend, opts: { debounceMs?: number } = {}): SettingsStore {
  const debounceMs = opts.debounceMs ?? 800;
  const docs = new Map<string, PluginDoc>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pending = new Map<string, { uid: string; doc: PluginDoc }>();

  function schedule(uid: string, id: string): void {
    pending.set(id, { uid, doc: docs.get(id)! });
    const existing = timers.get(id);
    if (existing) clearTimeout(existing);
    timers.set(id, setTimeout(() => {
      const job = pending.get(id);
      timers.delete(id);
      pending.delete(id);
      if (job) void backend.write(job.uid, id, job.doc).catch(() => { /* offline: localStorage already holds it */ });
    }, debounceMs));
  }

  function mutate(uid: string | null, id: string, patch: Partial<PluginDoc>): void {
    const current = docs.get(id) ?? { enabled: false, settings: {} };
    const next: PluginDoc = { enabled: patch.enabled ?? current.enabled, settings: patch.settings ?? current.settings };
    docs.set(id, next);
    writeLocal(id, next);
    if (uid) schedule(uid, id);
  }

  return {
    async load(uid) {
      docs.clear();
      let remote: Record<string, PluginDoc> = {};
      if (uid) { try { remote = await backend.load(uid); } catch { remote = {}; } }
      const ids = new Set(Object.keys(remote));
      // localStorage fills only ids the backend did not return.
      for (const id of Object.keys(localStorage_snapshot())) if (!ids.has(id)) ids.add(id);
      for (const id of ids) {
        const doc = remote[id] ?? readLocal(id);
        if (doc) docs.set(id, doc);
      }
      return new Map(docs);
    },
    get: id => docs.get(id),
    setEnabled(uid, id, enabled) { mutate(uid, id, { enabled }); },
    setSettings(uid, id, settings) {
      const current = docs.get(id) ?? { enabled: false, settings: {} };
      mutate(uid, id, { settings: { ...current.settings, ...settings } });
    },
    async flush() {
      for (const [id, timer] of timers) {
        clearTimeout(timer);
        const job = pending.get(id);
        if (job) await backend.write(job.uid, id, job.doc).catch(() => { /* ignore */ });
      }
      timers.clear();
      pending.clear();
    }
  };
}

/** Enumerate cs.plugin.* ids present in localStorage, guarded. */
function localStorage_snapshot(): Record<string, true> {
  const out: Record<string, true> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('cs.plugin.')) out[k.slice('cs.plugin.'.length)] = true;
    }
  } catch { /* storage blocked */ }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && cmd.exe /c "npx vitest run src/plugins/settings.test.ts"` then `cd web && cmd.exe /c "npm run typecheck"`
Expected: PASS; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/plugins/settings.ts web/src/plugins/settings.test.ts
git commit -m "feat(plugins): settings store with firestore-then-localstorage precedence and debounced writes"
```

---

### Task 3: Firestore backend adapter for settings

**Files:**
- Create: `web/src/plugins/firestoreBackend.ts`
- Test: `web/src/plugins/firestoreBackend.test.ts`

**Interfaces:**
- Consumes: `SettingsBackend`, `PluginDoc` from `./settings`; Firestore `db` from `../firebase`; `collection`, `getDocs`, `doc`, `setDoc`, `serverTimestamp` from `firebase/firestore`.
- Produces: `function createFirestoreBackend(): SettingsBackend` reading/writing `users/{uid}/plugins/{id}`. The `updatedAt` server timestamp is added on write only; `load` strips it to `{ enabled, settings }`.

**Design note:** this is the only file that imports the Firebase SDK for settings; keeping it separate lets Task 2's store stay unit-tested with a fake. Because the Firebase SDK is awkward to unit-test, this task's test mocks the four SDK functions via `vi.mock('firebase/firestore', ...)` and asserts the adapter maps shapes correctly.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/plugins/firestoreBackend.test.ts
import { describe, expect, test, vi } from 'vitest';

const setDoc = vi.fn(async () => {});
const getDocs = vi.fn(async () => ({
  docs: [
    { id: 'xp', data: () => ({ enabled: true, settings: { rate: 3 }, updatedAt: { seconds: 1 } }) },
    { id: 'notes', data: () => ({ enabled: false, settings: { text: 'x' } }) }
  ]
}));
vi.mock('firebase/firestore', () => ({
  collection: (..._a: unknown[]) => ({ _c: true }),
  doc: (..._a: unknown[]) => ({ _d: true }),
  getDocs: (...a: unknown[]) => getDocs(...a),
  setDoc: (...a: unknown[]) => setDoc(...a),
  serverTimestamp: () => 'TS'
}));
vi.mock('../firebase', () => ({ db: {} }));

import { createFirestoreBackend } from './firestoreBackend';

describe('firestore settings backend', () => {
  test('load strips updatedAt and returns id-keyed docs', async () => {
    const backend = createFirestoreBackend();
    const map = await backend.load('u1');
    expect(map).toEqual({ xp: { enabled: true, settings: { rate: 3 } }, notes: { enabled: false, settings: { text: 'x' } } });
  });

  test('write sends enabled, settings and a server timestamp with merge', async () => {
    setDoc.mockClear();
    const backend = createFirestoreBackend();
    await backend.write('u1', 'xp', { enabled: true, settings: { rate: 9 } });
    expect(setDoc).toHaveBeenCalledTimes(1);
    const [, payload, options] = setDoc.mock.calls[0];
    expect(payload).toEqual({ enabled: true, settings: { rate: 9 }, updatedAt: 'TS' });
    expect(options).toEqual({ merge: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && cmd.exe /c "npx vitest run src/plugins/firestoreBackend.test.ts"`
Expected: FAIL — cannot find module `./firestoreBackend`.

- [ ] **Step 3: Write the implementation**

```ts
// web/src/plugins/firestoreBackend.ts
import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { PluginDoc, SettingsBackend } from './settings';

export function createFirestoreBackend(): SettingsBackend {
  return {
    async load(uid) {
      const snap = await getDocs(collection(db, 'users', uid, 'plugins'));
      const out: Record<string, PluginDoc> = {};
      for (const d of snap.docs) {
        const data = d.data() as { enabled?: boolean; settings?: Record<string, unknown> };
        out[d.id] = { enabled: data.enabled ?? false, settings: (data.settings ?? {}) as PluginDoc['settings'] };
      }
      return out;
    },
    async write(uid, id, docData) {
      await setDoc(
        doc(db, 'users', uid, 'plugins', id),
        { enabled: docData.enabled, settings: docData.settings, updatedAt: serverTimestamp() },
        { merge: true }
      );
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && cmd.exe /c "npx vitest run src/plugins/firestoreBackend.test.ts"` then `cd web && cmd.exe /c "npm run typecheck"`
Expected: PASS; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/plugins/firestoreBackend.ts web/src/plugins/firestoreBackend.test.ts
git commit -m "feat(plugins): firestore backend adapter for per-user plugin settings"
```

---

### Task 4: Firestore rules for plugin settings

**Files:**
- Modify: `firebase/firestore.rules`
- Modify: `firebase/rules.test.ts`

**Interfaces:**
- Consumes: existing `users/{uid}` match block (final review left it: `read: if request.auth != null`).
- Produces: a `users/{uid}/plugins/{pluginId}` subcollection rule: owner-only read and write; `enabled` must be a boolean; `settings` must be a map; document size guarded.

**Design note (spec §3.2):** read/write own documents only. Enforce `enabled is bool` and `settings is map`. Firestore rules cannot deeply validate every settings value is primitive, but can cap the map's key count and require the top-level types, which bounds abuse; the 8 KB document cap is enforced by Firestore itself. The parent `users/{uid}` `read: if request.auth != null` does NOT cascade to subcollections in rules v2, so the subcollection needs its own explicit owner-only rule.

- [ ] **Step 1: Write the failing test**

Add to `firebase/rules.test.ts` a new describe block (place it after the existing `pairTokens`/`agentTokens` blocks):

```ts
describe('plugin settings', () => {
  test('owner can create and read their own plugin doc', async () => {
    const db = env.authenticatedContext('u1').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/u1/plugins/xp'), { enabled: true, settings: { rate: 3 } }));
    await assertSucceeds(getDoc(doc(db, 'users/u1/plugins/xp')));
  });
  test('a different user cannot read or write your plugin docs', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'users/u1/plugins/xp'), { enabled: true, settings: {} });
    });
    const other = env.authenticatedContext('u2').firestore();
    await assertFails(getDoc(doc(other, 'users/u1/plugins/xp')));
    await assertFails(setDoc(doc(other, 'users/u1/plugins/xp'), { enabled: false, settings: {} }));
  });
  test('enabled must be a boolean and settings a map', async () => {
    const db = env.authenticatedContext('u1').firestore();
    await assertFails(setDoc(doc(db, 'users/u1/plugins/xp'), { enabled: 'yes', settings: {} }));
    await assertFails(setDoc(doc(db, 'users/u1/plugins/xp'), { enabled: true, settings: 5 }));
  });
});
```

(Ensure `getDoc`, `setDoc`, `doc`, `assertSucceeds`, `assertFails` are already imported at the top of the file — they are, from the existing tests.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd firebase && cmd.exe /c "npm test"`
Expected: FAIL — the new writes are denied (no matching rule yet), so `assertSucceeds` throws.
(If the emulator cannot start in this environment due to memory, record the blocker and proceed per the fallback in the ruling note below; the rule change is strictly additive and verifiable by inspection against the adjacent `users/{uid}` block.)

- [ ] **Step 3: Write the implementation**

In `firebase/firestore.rules`, inside `match /users/{uid} { ... }`, after the existing `allow delete: if false;` line and before the closing brace of the `users` block, add the subcollection match:

```
      // Per-user plugin settings (SP2a). Owner-only; typed top-level fields.
      match /plugins/{pluginId} {
        allow read: if request.auth != null && request.auth.uid == uid;
        allow write: if request.auth != null && request.auth.uid == uid
                     && request.resource.data.enabled is bool
                     && request.resource.data.settings is map;
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd firebase && cmd.exe /c "npm test"`
Expected: PASS — all rules tests green (existing + the 3 new). If the emulator is memory-blocked, note it in the report; the change mirrors the adjacent owner-only pattern and is strictly additive.

- [ ] **Step 5: Commit**

```bash
git add firebase/firestore.rules firebase/rules.test.ts
git commit -m "feat(rules): owner-only per-user plugin settings subcollection"
```

---

### Task 5: Settings form renderer

**Files:**
- Create: `web/src/plugins/settingsForm.ts`
- Test: `web/src/plugins/settingsForm.test.ts`

**Interfaces:**
- Consumes: `SettingSchema`, `SettingsValues`, `SettingValue` from `./types`; `escapeHtml` from `../dom`.
- Produces: `function renderSettingsForm(schema: SettingSchema, values: SettingsValues, onChange: (key: string, value: SettingValue) => void): HTMLElement`.

**Design note:** builds a `<form>` with one labelled control per field. Never inserts a label or option text via `innerHTML` — labels come from the plugin author but are treated as untrusted and set with `textContent` (or `escapeHtml` if building markup strings). Emits `onChange(key, value)` on every input, coercing number inputs with `Number(...)`. Missing keys in `values` fall back to the field's `default`.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/plugins/settingsForm.test.ts
import { describe, expect, test, vi } from 'vitest';
import { renderSettingsForm } from './settingsForm';
import type { SettingSchema } from './types';

const schema: SettingSchema = {
  show: { type: 'boolean', label: 'Show FPS', default: true },
  cap: { type: 'number', label: 'FPS cap', default: 60, min: 10, max: 120, step: 5 },
  mode: { type: 'select', label: 'Mode', default: 'webgl', options: [{ value: 'webgl', label: 'WebGL' }, { value: 'webgpu', label: 'WebGPU' }] },
  tint: { type: 'color', label: 'Tint', default: '#ff0000' },
  note: { type: 'text', label: 'Note', default: '', maxLength: 40 }
};

describe('renderSettingsForm', () => {
  test('renders one control per field with defaults applied when value missing', () => {
    const form = renderSettingsForm(schema, { cap: 90 }, () => {});
    expect(form.querySelector<HTMLInputElement>('[data-key="show"]')!.checked).toBe(true);
    expect(form.querySelector<HTMLInputElement>('[data-key="cap"]')!.value).toBe('90');
    expect(form.querySelector<HTMLSelectElement>('[data-key="mode"]')!.value).toBe('webgl');
    expect(form.querySelector<HTMLInputElement>('[data-key="tint"]')!.value).toBe('#ff0000');
  });

  test('a boolean toggle emits onChange with a boolean', () => {
    const onChange = vi.fn();
    const form = renderSettingsForm(schema, {}, onChange);
    const box = form.querySelector<HTMLInputElement>('[data-key="show"]')!;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledWith('show', false);
  });

  test('a number field emits a coerced number', () => {
    const onChange = vi.fn();
    const form = renderSettingsForm(schema, {}, onChange);
    const input = form.querySelector<HTMLInputElement>('[data-key="cap"]')!;
    input.value = '45';
    input.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledWith('cap', 45);
  });

  test('a hostile field label is not rendered as live markup', () => {
    const hostile: SettingSchema = { x: { type: 'boolean', label: '<img src=x onerror=alert(1)>', default: false } };
    const form = renderSettingsForm(hostile, {}, () => {});
    expect(form.querySelector('img')).toBeNull();
    expect(form.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && cmd.exe /c "npx vitest run src/plugins/settingsForm.test.ts"`
Expected: FAIL — cannot find module `./settingsForm`.

- [ ] **Step 3: Write the implementation**

```ts
// web/src/plugins/settingsForm.ts
import type { SettingField, SettingSchema, SettingsValues, SettingValue } from './types';

function control(key: string, field: SettingField, value: SettingValue | undefined): HTMLElement {
  const row = document.createElement('label');
  row.className = 'p-setting';
  const caption = document.createElement('span');
  caption.className = 'p-setting-label';
  caption.textContent = field.label; // textContent => author label can never inject markup
  row.appendChild(caption);

  let input: HTMLInputElement | HTMLSelectElement;
  if (field.type === 'select') {
    const sel = document.createElement('select');
    for (const opt of field.options) {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      sel.appendChild(o);
    }
    sel.value = String(value ?? field.default);
    input = sel;
  } else {
    const el = document.createElement('input');
    if (field.type === 'boolean') { el.type = 'checkbox'; el.checked = Boolean(value ?? field.default); }
    else if (field.type === 'number') { el.type = 'number'; el.value = String(value ?? field.default); if (field.min != null) el.min = String(field.min); if (field.max != null) el.max = String(field.max); if (field.step != null) el.step = String(field.step); }
    else if (field.type === 'color') { el.type = 'color'; el.value = String(value ?? field.default); }
    else { el.type = 'text'; el.value = String(value ?? field.default); if (field.maxLength != null) el.maxLength = field.maxLength; }
    input = el;
  }
  input.className = 'p-input';
  input.dataset.key = key;
  row.appendChild(input);
  return row;
}

export function renderSettingsForm(
  schema: SettingSchema,
  values: SettingsValues,
  onChange: (key: string, value: SettingValue) => void
): HTMLElement {
  const form = document.createElement('form');
  form.className = 'p-settings-form';
  form.addEventListener('submit', e => e.preventDefault());
  for (const [key, field] of Object.entries(schema)) {
    form.appendChild(control(key, field, values[key]));
  }
  const read = (t: EventTarget | null): SettingValue | undefined => {
    const el = t as HTMLInputElement | HTMLSelectElement;
    const key = el.dataset.key;
    if (!key || !(key in schema)) return undefined;
    const field = schema[key];
    if (field.type === 'boolean') return (el as HTMLInputElement).checked;
    if (field.type === 'number') return Number((el as HTMLInputElement).value);
    return el.value;
  };
  const handler = (e: Event) => {
    const el = e.target as HTMLElement;
    const key = (el as HTMLElement).dataset?.key;
    const value = read(e.target);
    if (key && value !== undefined) onChange(key, value);
  };
  form.addEventListener('input', handler);
  form.addEventListener('change', handler);
  return form;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && cmd.exe /c "npx vitest run src/plugins/settingsForm.test.ts"` then `cd web && cmd.exe /c "npm run typecheck"`
Expected: PASS; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/plugins/settingsForm.ts web/src/plugins/settingsForm.test.ts
git commit -m "feat(plugins): SettingSchema form renderer with escaped labels and coerced values"
```

---

### Task 6: Shell plugin registry

**Files:**
- Create: `web/src/plugins/registry.ts`
- Test: `web/src/plugins/registry.test.ts`

**Interfaces:**
- Consumes: `ShellPlugin`, `PluginManifest`, `PluginContext`, `SettingsValues`, `SettingValue` from `./types`; `SettingsStore`, `PluginDoc` from `./settings`.
- Produces:
  - `interface RegistryDeps { store: SettingsStore; uid: () => string | null; contextFor(id: string): PluginContext; onIconStripChange(enabledPanelPlugins: PluginManifest[]): void; onClientToggle(id: string, enabled: boolean, settings: SettingsValues): void; notify(message: string, kind?: 'info' | 'error'): void }`
  - `function createShellRegistry(deps: RegistryDeps): ShellPluginRegistry`
  - `interface ShellPluginRegistry { register(plugin: ShellPlugin): void; init(): Promise<void>; isEnabled(id: string): boolean; enable(id: string): Promise<void>; disable(id: string): void; setSetting(id: string, key: string, value: SettingValue): void; manifests(): PluginManifest[]; panelFor(id: string): PanelView | undefined; overlaysFor(): HTMLElement[]; onTick(cycle: number): void }`

**Design notes:**
- `init()` calls `store.load(uid())`, then for each registered plugin computes enabled = stored doc's `enabled` if present, else `manifest.alwaysOn === true` or `manifest.defaultEnabled === true`, else false. Then it enables each enabled plugin in dependency order (`requires` first). `alwaysOn` plugins are always enabled and cannot be disabled.
- `enable(id)`: refuses (via `notify`) if a `requires` dependency is not enabled; marks enabled in the store (`setEnabled`), calls the plugin's `onEnable(ctx)`; if the manifest is `tier: 'client'`, calls `deps.onClientToggle(id, true, settings)` instead of a shell `onEnable`; recomputes the icon strip.
- `disable(id)`: refuses for `alwaysOn`; refuses if another enabled plugin `requires` it; calls `onDisable()` (or `onClientToggle(id,false,{})` for client tier); `store.setEnabled(false)`; recompute strip.
- `panelFor(id)` returns the plugin's `panel(ctx)` if enabled and it declares one.
- `overlaysFor()` returns overlay elements of all enabled plugins that declare `overlay`.
- `onTick(cycle)` forwards to every enabled plugin's `onTick`.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/plugins/registry.test.ts
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createShellRegistry, type RegistryDeps } from './registry';
import { definePlugin, type PluginContext } from './types';
import type { SettingsStore, PluginDoc } from './settings';

function fakeStore(seed: Record<string, PluginDoc> = {}): SettingsStore {
  const m = new Map<string, PluginDoc>(Object.entries(seed));
  return {
    async load() { return new Map(m); },
    get: id => m.get(id),
    setEnabled: (_uid, id, enabled) => { m.set(id, { enabled, settings: m.get(id)?.settings ?? {} }); },
    setSettings: (_uid, id, s) => { m.set(id, { enabled: m.get(id)?.enabled ?? false, settings: { ...(m.get(id)?.settings ?? {}), ...s } }); },
    async flush() {}
  };
}

function deps(store: SettingsStore, over: Partial<RegistryDeps> = {}): RegistryDeps {
  const ctx = { settings: { get: () => undefined as never, set: () => {}, subscribe: () => () => {} } } as unknown as PluginContext;
  return {
    store, uid: () => 'u1', contextFor: () => ctx,
    onIconStripChange: vi.fn(), onClientToggle: vi.fn(), notify: vi.fn(), ...over
  };
}

let enabledCalls: string[];
beforeEach(() => { enabledCalls = []; });
const track = (id: string) => definePlugin({
  manifest: { id, name: id, icon: '★', tier: 'shell', description: id },
  onEnable: () => { enabledCalls.push(id); },
  panel: () => ({ title: id, mount: () => {} })
});

describe('shell registry', () => {
  test('init enables defaultEnabled and alwaysOn plugins, not the rest', async () => {
    const store = fakeStore();
    const reg = createShellRegistry(deps(store));
    reg.register(definePlugin({ manifest: { id: 'a', name: 'A', icon: '★', tier: 'shell', description: 'a', defaultEnabled: true } }));
    reg.register(definePlugin({ manifest: { id: 'b', name: 'B', icon: '★', tier: 'shell', description: 'b' } }));
    reg.register(definePlugin({ manifest: { id: 'c', name: 'C', icon: '★', tier: 'shell', description: 'c', alwaysOn: true } }));
    await reg.init();
    expect(reg.isEnabled('a')).toBe(true);
    expect(reg.isEnabled('b')).toBe(false);
    expect(reg.isEnabled('c')).toBe(true);
  });

  test('stored enabled state overrides manifest defaults', async () => {
    const store = fakeStore({ a: { enabled: false, settings: {} }, b: { enabled: true, settings: {} } });
    const reg = createShellRegistry(deps(store));
    reg.register(definePlugin({ manifest: { id: 'a', name: 'A', icon: '★', tier: 'shell', description: 'a', defaultEnabled: true } }));
    reg.register(definePlugin({ manifest: { id: 'b', name: 'B', icon: '★', tier: 'shell', description: 'b' } }));
    await reg.init();
    expect(reg.isEnabled('a')).toBe(false);
    expect(reg.isEnabled('b')).toBe(true);
  });

  test('enable refuses when a required dependency is disabled', async () => {
    const store = fakeStore();
    const notify = vi.fn();
    const reg = createShellRegistry(deps(store, { notify }));
    reg.register(track('base'));
    reg.register(definePlugin({ manifest: { id: 'dep', name: 'Dep', icon: '★', tier: 'shell', description: 'dep', requires: ['base'] } }));
    await reg.init();
    await reg.enable('dep');
    expect(reg.isEnabled('dep')).toBe(false);
    expect(notify).toHaveBeenCalled();
  });

  test('disable refuses for alwaysOn plugins', async () => {
    const store = fakeStore();
    const reg = createShellRegistry(deps(store));
    reg.register(definePlugin({ manifest: { id: 'x', name: 'X', icon: '★', tier: 'shell', description: 'x', alwaysOn: true } }));
    await reg.init();
    reg.disable('x');
    expect(reg.isEnabled('x')).toBe(true);
  });

  test('client-tier enable routes through onClientToggle, not a shell onEnable', async () => {
    const store = fakeStore();
    const onClientToggle = vi.fn();
    const reg = createShellRegistry(deps(store, { onClientToggle }));
    reg.register(definePlugin({ manifest: { id: 'gpu', name: 'GPU', icon: '★', tier: 'client', description: 'gpu' } }));
    await reg.init();
    await reg.enable('gpu');
    expect(onClientToggle).toHaveBeenCalledWith('gpu', true, expect.any(Object));
    expect(reg.isEnabled('gpu')).toBe(true);
  });

  test('onIconStripChange fires with enabled plugins that expose a panel', async () => {
    const store = fakeStore();
    const onIconStripChange = vi.fn();
    const reg = createShellRegistry(deps(store, { onIconStripChange }));
    reg.register(track('withpanel'));
    reg.register(definePlugin({ manifest: { id: 'nopanel', name: 'N', icon: '★', tier: 'shell', description: 'n', defaultEnabled: true } }));
    await reg.init();
    await reg.enable('withpanel');
    const last = onIconStripChange.mock.calls.at(-1)![0] as { id: string }[];
    expect(last.map(m => m.id)).toContain('withpanel');
    expect(last.map(m => m.id)).not.toContain('nopanel');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && cmd.exe /c "npx vitest run src/plugins/registry.test.ts"`
Expected: FAIL — cannot find module `./registry`.

- [ ] **Step 3: Write the implementation**

```ts
// web/src/plugins/registry.ts
import type { PanelView } from '../frame/panels';
import type { PluginContext, PluginManifest, SettingsValues, SettingValue, ShellPlugin } from './types';
import type { SettingsStore } from './settings';

export interface RegistryDeps {
  store: SettingsStore;
  uid: () => string | null;
  contextFor(id: string): PluginContext;
  onIconStripChange(enabledPanelPlugins: PluginManifest[]): void;
  onClientToggle(id: string, enabled: boolean, settings: SettingsValues): void;
  notify(message: string, kind?: 'info' | 'error'): void;
}

export interface ShellPluginRegistry {
  register(plugin: ShellPlugin): void;
  init(): Promise<void>;
  isEnabled(id: string): boolean;
  enable(id: string): Promise<void>;
  disable(id: string): void;
  setSetting(id: string, key: string, value: SettingValue): void;
  manifests(): PluginManifest[];
  panelFor(id: string): PanelView | undefined;
  overlaysFor(): HTMLElement[];
  onTick(cycle: number): void;
}

export function createShellRegistry(deps: RegistryDeps): ShellPluginRegistry {
  const plugins = new Map<string, ShellPlugin>();
  const order: string[] = [];
  const enabled = new Set<string>();
  const panels = new Map<string, PanelView>();
  const overlays = new Map<string, HTMLElement>();

  const manifest = (id: string) => plugins.get(id)!.manifest;

  function emitStrip(): void {
    deps.onIconStripChange(order.filter(id => enabled.has(id) && plugins.get(id)!.panel).map(manifest));
  }

  async function activate(id: string): Promise<void> {
    const p = plugins.get(id)!;
    enabled.add(id);
    if (p.manifest.tier === 'client') {
      deps.onClientToggle(id, true, deps.store.get(id)?.settings ?? {});
    } else {
      const ctx = deps.contextFor(id);
      if (p.panel) panels.set(id, p.panel(ctx));
      if (p.overlay) overlays.set(id, p.overlay(ctx));
      await p.onEnable?.(ctx);
    }
  }

  function deactivate(id: string): void {
    const p = plugins.get(id)!;
    enabled.delete(id);
    if (p.manifest.tier === 'client') {
      deps.onClientToggle(id, false, {});
    } else {
      panels.get(id)?.unmount?.();
      panels.delete(id);
      overlays.delete(id);
      p.onDisable?.();
    }
  }

  function defaultEnabled(id: string): boolean {
    const stored = deps.store.get(id);
    if (stored) return stored.enabled;
    const m = manifest(id);
    return m.alwaysOn === true || m.defaultEnabled === true;
  }

  return {
    register(plugin) {
      if (plugins.has(plugin.manifest.id)) throw new Error(`duplicate plugin id: ${plugin.manifest.id}`);
      plugins.set(plugin.manifest.id, plugin);
      order.push(plugin.manifest.id);
    },
    async init() {
      await deps.store.load(deps.uid());
      // Enable in dependency order: a plugin's requires come before it (topological by declaration + requires).
      const done = new Set<string>();
      const visit = async (id: string): Promise<void> => {
        if (done.has(id) || !plugins.has(id)) return;
        done.add(id);
        for (const dep of manifest(id).requires ?? []) await visit(dep);
        if (defaultEnabled(id)) await activate(id);
      };
      for (const id of order) await visit(id);
      emitStrip();
    },
    isEnabled: id => enabled.has(id),
    async enable(id) {
      if (!plugins.has(id) || enabled.has(id)) return;
      for (const dep of manifest(id).requires ?? []) {
        if (!enabled.has(dep)) { deps.notify(`${manifest(id).name} needs ${dep} enabled first.`, 'error'); return; }
      }
      await activate(id);
      deps.store.setEnabled(deps.uid(), id, true);
      emitStrip();
    },
    disable(id) {
      if (!enabled.has(id)) return;
      if (manifest(id).alwaysOn) { deps.notify(`${manifest(id).name} can't be turned off.`); return; }
      const blocker = order.find(other => enabled.has(other) && (manifest(other).requires ?? []).includes(id));
      if (blocker) { deps.notify(`Disable ${manifest(blocker).name} first — it needs ${manifest(id).name}.`, 'error'); return; }
      deactivate(id);
      deps.store.setEnabled(deps.uid(), id, false);
      emitStrip();
    },
    setSetting(id, key, value) {
      deps.store.setSettings(deps.uid(), id, { [key]: value });
      if (manifest(id).tier === 'client' && enabled.has(id)) {
        deps.onClientToggle(id, true, deps.store.get(id)?.settings ?? {});
      }
    },
    manifests: () => order.map(manifest),
    panelFor: id => panels.get(id),
    overlaysFor: () => order.filter(id => enabled.has(id) && overlays.has(id)).map(id => overlays.get(id)!),
    onTick(cycle) { for (const id of enabled) plugins.get(id)!.onTick?.(cycle); }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && cmd.exe /c "npx vitest run src/plugins/registry.test.ts"` then `cd web && cmd.exe /c "npm run typecheck"`
Expected: PASS; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/plugins/registry.ts web/src/plugins/registry.test.ts
git commit -m "feat(plugins): shell registry with enable/disable, requires ordering, and client-toggle seam"
```

---

### Task 7: Plugins panel

**Files:**
- Create: `web/src/plugins/pluginsPanel.ts`
- Test: `web/src/plugins/pluginsPanel.test.ts`

**Interfaces:**
- Consumes: `ShellPluginRegistry` from `./registry`; `PluginManifest`, `SettingsValues` from `./types`; `renderSettingsForm` from `./settingsForm`; `escapeHtml` from `../dom`; `PanelView` from `../frame/panels`.
- Produces: `function createPluginsPanel(reg: ShellPluginRegistry, currentSettings: (id: string) => SettingsValues): PanelView` — the panel body listing every registered plugin with a search box, a toggle (disabled+checked for `alwaysOn`, shown as "always on"), a gear that expands the settings form (only when the manifest has `settings`), and the description.

**Design note:** the panel re-renders its list on mount and after any toggle. All author-supplied strings (`name`, `description`) go through `escapeHtml`. Toggling calls `reg.enable`/`reg.disable`; the gear toggles a per-row settings form built with `renderSettingsForm`, wired so each change calls `reg.setSetting(id, key, value)`.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/plugins/pluginsPanel.test.ts
import { describe, expect, test, vi } from 'vitest';
import { createPluginsPanel } from './pluginsPanel';
import type { ShellPluginRegistry } from './registry';
import type { PluginManifest } from './types';

function fakeReg(manifests: PluginManifest[], enabledIds: Set<string>): ShellPluginRegistry {
  return {
    register: vi.fn(), init: vi.fn(), isEnabled: id => enabledIds.has(id),
    enable: vi.fn(async id => { enabledIds.add(id); }), disable: vi.fn(id => { enabledIds.delete(id); }),
    setSetting: vi.fn(), manifests: () => manifests, panelFor: () => undefined, overlaysFor: () => [], onTick: vi.fn()
  } as unknown as ShellPluginRegistry;
}

const MANIFESTS: PluginManifest[] = [
  { id: 'xp', name: 'XP Tracker', icon: '★', tier: 'shell', description: 'Tracks XP', settings: { rate: { type: 'boolean', label: 'Show rate', default: true } } },
  { id: 'account', name: 'Account', icon: '☺', tier: 'shell', description: 'Your account', alwaysOn: true },
  { id: 'gpu', name: 'GPU Renderer', icon: '▦', tier: 'client', description: 'WebGL' }
];

describe('plugins panel', () => {
  test('lists every plugin with an escaped name and description', () => {
    const reg = fakeReg(MANIFESTS, new Set(['account']));
    const view = createPluginsPanel(reg, () => ({}));
    const body = document.createElement('div');
    view.mount(body);
    expect(body.textContent).toContain('XP Tracker');
    expect(body.textContent).toContain('GPU Renderer');
  });

  test('an alwaysOn plugin shows "always on" and a disabled, checked toggle', () => {
    const reg = fakeReg(MANIFESTS, new Set(['account']));
    const view = createPluginsPanel(reg, () => ({}));
    const body = document.createElement('div');
    view.mount(body);
    const toggle = body.querySelector<HTMLInputElement>('[data-toggle="account"]')!;
    expect(toggle.disabled).toBe(true);
    expect(toggle.checked).toBe(true);
    expect(body.textContent?.toLowerCase()).toContain('always on');
  });

  test('flipping a toggle calls enable then disable', async () => {
    const enabled = new Set(['account']);
    const reg = fakeReg(MANIFESTS, enabled);
    const view = createPluginsPanel(reg, () => ({}));
    const body = document.createElement('div');
    view.mount(body);
    const toggle = body.querySelector<HTMLInputElement>('[data-toggle="xp"]')!;
    toggle.checked = true; toggle.dispatchEvent(new Event('change'));
    expect(reg.enable).toHaveBeenCalledWith('xp');
  });

  test('search filters the list by name', () => {
    const reg = fakeReg(MANIFESTS, new Set());
    const view = createPluginsPanel(reg, () => ({}));
    const body = document.createElement('div');
    view.mount(body);
    const search = body.querySelector<HTMLInputElement>('[data-plugins-search]')!;
    search.value = 'gpu'; search.dispatchEvent(new Event('input'));
    expect(body.querySelector('[data-row="gpu"]')).not.toBeNull();
    expect(body.querySelector('[data-row="xp"]')).toBeNull();
  });

  test('a hostile plugin name is escaped, not rendered live', () => {
    const evil: PluginManifest[] = [{ id: 'e', name: '<img src=x onerror=alert(1)>', icon: '★', tier: 'shell', description: 'd' }];
    const reg = fakeReg(evil, new Set());
    const view = createPluginsPanel(reg, () => ({}));
    const body = document.createElement('div');
    view.mount(body);
    expect(body.querySelector('img')).toBeNull();
    expect(body.innerHTML).toContain('&lt;img');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && cmd.exe /c "npx vitest run src/plugins/pluginsPanel.test.ts"`
Expected: FAIL — cannot find module `./pluginsPanel`.

- [ ] **Step 3: Write the implementation**

```ts
// web/src/plugins/pluginsPanel.ts
import type { PanelView } from '../frame/panels';
import type { ShellPluginRegistry } from './registry';
import type { PluginManifest, SettingsValues } from './types';
import { renderSettingsForm } from './settingsForm';
import { escapeHtml } from '../dom';

export function createPluginsPanel(reg: ShellPluginRegistry, currentSettings: (id: string) => SettingsValues): PanelView {
  let root: HTMLElement | null = null;
  let filter = '';
  const open = new Set<string>();

  function rowMarkup(m: PluginManifest): string {
    const on = reg.isEnabled(m.id) || m.alwaysOn === true;
    const toggle = m.alwaysOn
      ? `<span class="p-muted">always on</span><input type="checkbox" data-toggle="${escapeHtml(m.id)}" checked disabled />`
      : `<input type="checkbox" data-toggle="${escapeHtml(m.id)}" ${on ? 'checked' : ''} />`;
    const gear = m.settings ? `<button class="p-btn p-btn-icon" data-gear="${escapeHtml(m.id)}" title="Settings">⚙</button>` : '';
    return `<div class="p-plugin-row" data-row="${escapeHtml(m.id)}">
      <span class="p-plugin-icon">${escapeHtml(m.icon)}</span>
      <div class="p-plugin-main"><div class="p-plugin-name">${escapeHtml(m.name)}</div>
      <div class="p-plugin-desc p-muted">${escapeHtml(m.description)}</div></div>
      <div class="p-plugin-controls">${gear}${toggle}</div>
      <div class="p-plugin-settings" data-settings="${escapeHtml(m.id)}" hidden></div>
    </div>`;
  }

  function render(): void {
    if (!root) return;
    const list = reg.manifests().filter(m => m.name.toLowerCase().includes(filter) || m.id.includes(filter));
    root.innerHTML = `<input class="p-input" data-plugins-search placeholder="Search plugins" value="${escapeHtml(filter)}" />
      <div class="p-plugin-list">${list.map(rowMarkup).join('')}</div>`;
    for (const m of list) {
      if (open.has(m.id) && m.settings) {
        const host = root.querySelector<HTMLElement>(`[data-settings="${CSS.escape(m.id)}"]`)!;
        host.hidden = false;
        host.appendChild(renderSettingsForm(m.settings, currentSettings(m.id), (key, value) => reg.setSetting(m.id, key, value)));
      }
    }
  }

  return {
    title: 'Plugins',
    mount(body) {
      root = body;
      body.addEventListener('input', e => {
        const s = (e.target as HTMLElement).closest<HTMLInputElement>('[data-plugins-search]');
        if (s) { filter = s.value.trim().toLowerCase(); render(); s.focus(); }
      });
      body.addEventListener('change', async e => {
        const t = (e.target as HTMLElement).closest<HTMLInputElement>('[data-toggle]');
        if (!t) return;
        const id = t.dataset.toggle!;
        if (t.checked) await reg.enable(id); else reg.disable(id);
        render();
      });
      body.addEventListener('click', e => {
        const g = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-gear]');
        if (!g) return;
        const id = g.dataset.gear!;
        if (open.has(id)) open.delete(id); else open.add(id);
        render();
      });
      render();
    },
    unmount() { root = null; open.clear(); }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && cmd.exe /c "npx vitest run src/plugins/pluginsPanel.test.ts"` then `cd web && cmd.exe /c "npm run typecheck"`
Expected: PASS; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/plugins/pluginsPanel.ts web/src/plugins/pluginsPanel.test.ts
git commit -m "feat(plugins): Plugins panel with search, toggles, settings gear, always-on rows"
```

---

### Task 8: Migrate main.ts onto the framework and add the Plugins panel

**Files:**
- Modify: `web/src/types.ts` (add `'plugins'` to `PanelId`)
- Modify: `web/src/main.ts`
- Create: `web/tests/plugins.e2e.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-7 (`createShellRegistry`, `createSettingsStore`, `createFirestoreBackend`, `createPluginsPanel`, `definePlugin`); the existing panel factories (`createClaudePanel`, `createXpPanel`, `createLootPanel`, `createConnectPanel`, `createAccountPanel`, `createConfigPanel`) and their shared `deps` object; the existing icon-strip DOM (`byId('icon-strip')`, `byId('side-panel')`, `byId('panel-title')`, `byId('panel-body')`), the overlays, `identity`, `gameName`, `hooks`.
- Produces: a working app where the six SP1 panels are registered as shell plugins through `createShellRegistry`, the Plugins panel is added, `account` and `connect` are `alwaysOn`, `claude`/`xp`/`loot` are `defaultEnabled: true` and toggleable, `config` is `alwaysOn` (canvas/filter/fullscreen live there), the icon strip shows only enabled panel plugins, and enabled state + settings persist per user.

**Design notes:**
- Wrap each existing panel factory as a `ShellPlugin` whose `panel(ctx)` returns the existing `PanelView`. The manifests reuse the ids already in `PanelId` (`claude`, `xp`, `loot`, `connect`, `account`, `config`) plus the new `plugins`. The existing panels keep their current `deps`-based construction (they don't need `PluginContext` yet); `panel:` closes over the already-built `PanelView`.
- Replace the direct `createPluginRegistry` usage. The icon strip is rebuilt by an `onIconStripChange(manifests)` callback that renders one `[data-panel]` button per enabled panel-bearing plugin, preserving the SP1 click-to-open behaviour and the `layout()` call on open/close. Keep a thin panel-open controller (open/close/toggle/restore) — reuse `frame/panels.ts`'s registry for the open/close/active-highlight mechanics by registering only enabled plugins' `PanelView`s into it whenever the strip changes.
- `onClientToggle` is a no-op that logs to console in SP2a (client tier lands in SP2b); `notify` uses the existing overlays/toast (fall back to `overlays.setStatus(message, kind === 'error' ? 'error' : 'muted')`).
- `contextFor(id)` builds a `PluginContext` from module state: `client: () => hooks`, `settings.get/set` proxied to the store for that id (defaults from the manifest schema), `storage` namespaced `cs.pl.<id>.<key>`, `notify`, `openPanel`, `user: () => identity ? { uid: identity.uid, gameName } : null`.
- After `startSession` obtains identity, call `registry.init()` so per-user settings load; on sign-out, re-init with `uid() === null` (localStorage-only). Call `registry.init()` again when identity changes to a different uid.

- [ ] **Step 1: Write the failing e2e test**

```ts
// web/tests/plugins.e2e.ts
import { test, expect } from '@playwright/test';

// Assumes the SP1 e2e harness: gate open via password, guest auto-login, Login starts the client.
test('a plugin toggle persists across reload', async ({ page }) => {
  await page.goto('/');
  // Gate (if shown): enter the shared password.
  const gate = page.locator('#gate-password');
  if (await gate.isVisible().catch(() => false)) {
    await gate.fill('fiddlesticks');
    await page.locator('#gate-form button[type="submit"]').click();
  }
  await page.locator('#btn-login').click();
  // Open the Plugins panel via its icon (always present).
  await page.locator('[data-panel="plugins"]').click();
  const lootToggle = page.locator('[data-toggle="loot"]');
  await expect(lootToggle).toBeChecked();
  await lootToggle.uncheck();
  await page.reload();
  const gate2 = page.locator('#gate-password');
  if (await gate2.isVisible().catch(() => false)) {
    await gate2.fill('fiddlesticks');
    await page.locator('#gate-form button[type="submit"]').click();
  }
  await page.locator('#btn-login').click();
  await page.locator('[data-panel="plugins"]').click();
  await expect(page.locator('[data-toggle="loot"]')).not.toBeChecked();
});
```

- [ ] **Step 2: Run the e2e to verify it fails**

Run: `cd web && cmd.exe /c "npm run test:e2e -- plugins.e2e.ts"`
Expected: FAIL — no `[data-panel="plugins"]` icon yet (framework not wired).
(Requires the SP1 e2e stack running per `scripts/start-stack.ps1`; if the stack/emulator is unavailable in this environment, record the blocker and rely on the unit tests + a manual `npm run build` gate, then run the e2e when the stack is available.)

- [ ] **Step 3: Add `'plugins'` to `PanelId`**

In `web/src/types.ts`, change:
```ts
export type PanelId = 'claude' | 'xp' | 'loot' | 'connect' | 'account' | 'config';
```
to:
```ts
export type PanelId = 'claude' | 'xp' | 'loot' | 'connect' | 'account' | 'config' | 'plugins';
```

- [ ] **Step 4: Rewire `main.ts`**

Replace the registry construction and panel registration (SP1 lines ~44-70) with framework wiring. The existing `frame/panels.ts` `createPluginRegistry` stays as the low-level open/close controller; the new shell registry drives which plugins are registered into it. Concretely:

```ts
// add imports
import { createShellRegistry } from './plugins/registry';
import { createSettingsStore } from './plugins/settings';
import { createFirestoreBackend } from './plugins/firestoreBackend';
import { createPluginsPanel } from './plugins/pluginsPanel';
import { definePlugin, type PluginContext, type SettingsValues } from './plugins/types';

// ...after `deps` is defined...

// Low-level open/close controller (SP1). We (re)register only enabled panel plugins into it.
const panelCtl = createPluginRegistry({
  strip: byId('icon-strip'), panel: byId('side-panel'), title: byId('panel-title'),
  body: byId('panel-body'), onChange: () => layout()
});

const settingsStore = createSettingsStore(createFirestoreBackend());

function contextFor(id: string): PluginContext {
  const schema = shell.manifests().find(m => m.id === id)?.settings ?? {};
  return {
    client: () => hooks,
    settings: {
      get: <T,>(key: string) => (settingsStore.get(id)?.settings[key] ?? (schema[key]?.default as unknown)) as T,
      set: (key, value) => shell.setSetting(id, key, value),
      subscribe: () => () => {}
    },
    storage: {
      get: k => { try { return localStorage.getItem(`cs.pl.${id}.${k}`); } catch { return null; } },
      set: (k, v) => { try { localStorage.setItem(`cs.pl.${id}.${k}`, v); } catch { /* blocked */ } }
    },
    notify: (message, kind) => overlays.setStatus(message, kind === 'error' ? 'error' : 'muted'),
    openPanel: (pid: string) => panelCtl.open(pid as PanelId),
    user: () => (identity ? { uid: identity.uid, gameName } : null)
  };
}

const shell = createShellRegistry({
  store: settingsStore,
  uid: () => identity?.uid ?? null,
  contextFor,
  onIconStripChange: rebuildStrip,
  onClientToggle: (id, enabled) => console.info(`[plugins] client-tier ${id} -> ${enabled} (implemented in SP2b)`),
  notify: (message, kind) => overlays.setStatus(message, kind === 'error' ? 'error' : 'muted')
});

// Register the six SP1 panels as shell plugins wrapping their existing PanelView factories.
function asPlugin(id: PanelId, name: string, icon: string, description: string, view: () => { title: string; mount(b: HTMLElement): void; unmount?(): void }, opts: { alwaysOn?: boolean; defaultEnabled?: boolean } = {}) {
  return definePlugin({ manifest: { id, name, icon, tier: 'shell', description, ...opts }, panel: () => view() });
}
shell.register(asPlugin('claude', 'Claude', '✦', 'Chat with your Claude session.', () => createClaudePanel(deps), { defaultEnabled: true }));
shell.register(asPlugin('xp', 'XP', '✚', 'Per-skill XP and xp/h.', () => createXpPanel(deps), { defaultEnabled: true }));
shell.register(asPlugin('loot', 'Loot', '💰', 'Items gained this session.', () => createLootPanel(deps), { defaultEnabled: true }));
shell.register(asPlugin('connect', 'Claude Connection', '⛓', 'Pair a Claude session.', () => createConnectPanel(deps), { alwaysOn: true }));
shell.register(asPlugin('account', 'Account', '☺', 'Your account.', () => createAccountPanel(deps), { alwaysOn: true }));
shell.register(asPlugin('config', 'Configuration', '⚙', 'Canvas size, filter, fullscreen.', () => createConfigPanel(deps), { alwaysOn: true }));
shell.register(definePlugin({ manifest: { id: 'plugins', name: 'Plugins', icon: '🧩', tier: 'shell', description: 'Enable and configure plugins.', alwaysOn: true }, panel: () => createPluginsPanel(shell, id => settingsStore.get(id)?.settings ?? {} as SettingsValues) }));

// Rebuild the icon strip from enabled panel-bearing plugins, re-registering their views into panelCtl.
function rebuildStrip(enabledPanels: { id: string; name: string; icon: string }[]): void {
  const strip = byId('icon-strip');
  const openNow = panelCtl.current();
  strip.replaceChildren();
  for (const m of enabledPanels) {
    const view = shell.panelFor(m.id) ?? shell.manifests().find(x => x.id === m.id) ? null : null;
    const pv = shellPanelView(m.id);
    if (pv) panelCtl.register({ id: m.id as PanelId, name: m.name, icon: m.icon, tier: 'shell' }, pv);
    const btn = document.createElement('button');
    btn.className = 'icon-btn'; btn.dataset.panel = m.id; btn.title = m.name; btn.textContent = m.icon;
    strip.appendChild(btn);
  }
  if (openNow && enabledPanels.some(m => m.id === openNow)) panelCtl.open(openNow);
}
```

Note: `shellPanelView(id)` must return the plugin's `PanelView`. Since the shell registry only exposes `panelFor(id)` for enabled plugins after activation, add a helper in the registry OR build the `PanelView` in `rebuildStrip` by calling the plugin's `panel(contextFor(id))`. Simplest: extend the registry with a public `panelFor(id)` that lazily builds and caches the view for an enabled plugin (already added in Task 6). Use `shell.panelFor(m.id)`.

Simplify `rebuildStrip` to:

```ts
function rebuildStrip(enabledPanels: PluginManifest[]): void {
  const strip = byId('icon-strip');
  const openNow = panelCtl.current();
  strip.replaceChildren();
  for (const m of enabledPanels) {
    const pv = shell.panelFor(m.id);
    if (pv) panelCtl.register({ id: m.id as PanelId, name: m.name, icon: m.icon, tier: 'shell' }, pv);
    const btn = document.createElement('button');
    btn.className = 'icon-btn'; btn.dataset.panel = m.id; btn.title = m.name; btn.textContent = m.icon;
    strip.appendChild(btn);
  }
  if (openNow && enabledPanels.some(m => m.id === openNow)) panelCtl.open(openNow);
}
```

The `plugins`, `account`, `connect`, `config` icons must always appear (alwaysOn) — since they are `alwaysOn`, `init()`/`emitStrip()` include them (they all declare `panel`). Import `PluginManifest` in main.ts.

Finally, call `void shell.init()` after `enterApp()` sets up identity, and re-run `void shell.init()` inside the `onUserIdToken` handler whenever `identity?.uid` changes (guard against re-running for the same uid). Remove the old direct `panels.register(...)` block and the old `panels` variable; replace `deps.openPanel` and any `panels.open(...)` / `panels.restore()` calls with `panelCtl.open(...)` / `panelCtl.restore()`.

- [ ] **Step 5: Run typecheck, unit tests, and the e2e**

Run:
```
cd web && cmd.exe /c "npm run typecheck"
cd web && cmd.exe /c "npm test"
cd web && cmd.exe /c "npm run test:e2e -- plugins.e2e.ts"
```
Expected: typecheck exit 0; all unit tests pass; the e2e passes (toggle persists across reload). If the e2e stack is unavailable, record it and gate on typecheck + unit + `npm run build`.

- [ ] **Step 6: Commit**

```bash
git add web/src/types.ts web/src/main.ts web/tests/plugins.e2e.ts
git commit -m "feat(plugins): migrate SP1 panels onto the shell framework, add the Plugins panel"
```

---

## Self-Review

**1. Spec coverage (SP2 framework-core slice):**
- §3 architecture `web/src/plugins/{registry,types,settings}.ts` → Tasks 1, 2, 3, 6 (settings split into store + Firestore backend for testability; recorded).
- §3.1 manifest + lifecycle (`PluginManifest`, `ShellPlugin`, `PluginContext`) → Task 1. `panel` returns `PanelView` not `HTMLElement` — reconciliation ruling recorded in Task 1.
- §3.2 settings persistence (Firestore `users/{uid}/plugins/{id}`, localStorage mirror, precedence, debounce, guests under anon uid) → Tasks 2, 3; rules → Task 4.
- §3.3 Plugins panel (search, toggle, gear→settings form, description, icon strip shows enabled panel plugins, Configuration keeps canvas/filter/fullscreen) → Tasks 7, 8.
- §6 `claude-connection` always-on → Task 8 (`connect` registered `alwaysOn`).
- Client tier (§3.1 `ClientCapability`, `window.idlescape.plugins`) → deferred to SP2b; SP2a keeps the `tier` field + `onClientToggle` seam. Recorded as the plan's YAGNI cut.
- §3.4 generated data, §4 GPU renderer, §5 Tier-1 plugins → SP2c/SP2b (out of this plan's scope by decomposition).

**2. Placeholder scan:** No TBD/TODO. Every code step has full code. The `rebuildStrip` first draft in Task 8 Step 4 is explicitly superseded by the simplified version in the same step (kept to show the reasoning); implementers use the simplified `rebuildStrip`.

**3. Type consistency:** `SettingValue`/`SettingsValues` consistent across Tasks 1, 2, 5, 6. `PluginDoc { enabled, settings }` consistent across Tasks 2, 3, 6. `ShellPluginRegistry` method names (`init`, `enable`, `disable`, `isEnabled`, `setSetting`, `manifests`, `panelFor`, `overlaysFor`, `onTick`) consistent between Task 6 (definition) and Tasks 7, 8 (consumers). `RegistryDeps.onClientToggle(id, enabled, settings)` consistent between Task 6 and Task 8. `createSettingsStore(backend, opts)` signature consistent between Tasks 2, 3, 8.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-05-sp2a-plugin-framework-core.md`. This is SP2a of a three-part SP2 decomposition (SP2a framework core → SP2b GPU renderer → SP2c Tier-1 plugins + data). Recommended execution: **subagent-driven-development**, continuing the established SDD loop, with a fresh ledger at `.superpowers/sdd/2026-09-05-sp2a-plugin-framework-core/`.
