# SP2c — Tier-1 Framework-Native Shell Plugins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the four Tier-1 shell plugins that need only the SP2a framework plus existing hooks — `xp-tracker`, `loot-tracker`, `notes`, `screenshot` — as real `ShellPlugin`s with typed settings and per-user persistence, replacing the SP1 thin xp/loot panel wrappers.

**Architecture:** Each plugin is a `definePlugin({...})` module under `web/src/plugins/builtin/`, consuming the SP2a `PluginContext` (settings, storage, client, notify). `xp-tracker`/`loot-tracker` evolve the existing `web/src/stats/xp.ts` and `web/src/stats/loot.ts` (extending the XP tracker with per-action deltas for "actions to level"); `notes` persists a textarea through `ctx.settings` (Firestore-synced); `screenshot` captures the game canvas via `toBlob`. `main.ts` registers all four through the SP2a shell registry, replacing the two thin wrappers.

**Tech Stack:** TypeScript, Vite, Vitest (jsdom), the SP2a plugin framework, Firebase Firestore (via the SP2a settings store).

**Spec:** `docs/superpowers/specs/2026-09-05-sp2-plugin-framework-design.md` (SP2 §5). This plan implements the framework-native subset of §5. Deferred to later slices: `status-hud` (needs a client-fork `ClientState` hp/prayer/energy/boosts extension), `quest-helper` and `skill-calc` (need `scripts/gen/*` content-derived data), `hiscores` (SP3), item icons and ground-pickup attribution (need sprite/scene data), and the SP3 snapshot hook.

## Global Constraints

- **Build on SP2a only.** These are shell-tier plugins. Do NOT touch `client/`, `engine/`, or the live PoC (ports 8888/43594/8898). The web build must not import from `client/` or `engine/`.
- **Escaping:** every runtime string rendered into `innerHTML` — item names from `getObjName`, notes text, skill names — must go through `escapeHtml` from `web/src/dom.ts`. (SP1 final-review rule; this plan also fixes the pre-existing unescaped `getObjName` in the old loot panel.)
- **Storage safety:** wrap every direct `localStorage` access in `try/catch`. Prefer `ctx.settings`/`ctx.storage` (already guarded) over raw `localStorage`.
- **Settings persistence:** plugin state that should follow the user across devices goes through `ctx.settings` (Firestore-synced via the SP2a store); per-viewer-only conveniences go through `ctx.storage` (namespaced localStorage). The settings store persists arbitrary keys, not only `SettingSchema` fields.
- **Timers:** use `setInterval`/`clearInterval`; every plugin that starts a timer in its panel `mount` must clear it in `unmount` (the SP1 panels already do this).
- **Branch:** all work commits to `feat/platform-shell`. Local-only repo; no deploy; no merge to develop/main.
- **Commit trailers (every commit):**
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Qn4XvzDVpesgyj3peXiM3M
  ```
- **Test commands (Git Bash):** `cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npx vitest run <path>"`; typecheck `... "npm run typecheck"`; full unit `... "npm test"`; build `... "npm run build"`. The `MSYS2_ARG_CONV_EXCL="*"` prefix is REQUIRED (Git Bash mangles `/c` otherwise).

## Interfaces from SP2a (consumed by every task)

From `web/src/plugins/types.ts`:
- `definePlugin(p: ShellPlugin): ShellPlugin`
- `ShellPlugin { manifest; onEnable?(ctx); onDisable?(); panel?(ctx): PanelView; overlay?(ctx): HTMLElement; onTick?(cycle) }`
- `PluginManifest { id; name; icon; tier: 'shell'|'client'; description; settings?; defaultEnabled?; alwaysOn?; requires? }`
- `PluginContext { client(): ClientHooks | null; settings: { get<T>(key): T; set(key, value): void; subscribe(fn): () => void }; storage: { get(key): string|null; set(key, value): void }; notify(message, kind?): void; openPanel(id): void; user(): { uid; gameName } | null }`
- `SettingSchema`, `SettingsValues`, `SettingValue`

From `web/src/frame/panels.ts`: `PanelView { title: string; mount(body): void; unmount?(): void }`.
From `web/src/dom.ts`: `escapeHtml(s: string): string`.
From `web/src/stats/skills.ts`: `SKILL_NAMES: string[]`, `xpForLevel(level): number`.

---

## File Structure

- `web/src/stats/xp.ts` — **Modify.** Extend the tracker: record last per-action delta; add `actionsToNext` to `XpRow`.
- `web/src/plugins/builtin/xpTracker.ts` — **Create.** The `xp-tracker` ShellPlugin.
- `web/src/plugins/builtin/lootTracker.ts` — **Create.** The `loot-tracker` ShellPlugin (escapes item names).
- `web/src/plugins/builtin/notes.ts` — **Create.** The `notes` ShellPlugin.
- `web/src/plugins/builtin/screenshot.ts` — **Create.** The `screenshot` ShellPlugin.
- `web/src/main.ts` — **Modify.** Register the four builtin plugins; remove the thin `xp`/`loot` wrappers.
- `web/src/panels/xp.ts`, `web/src/panels/loot.ts` — **Delete** (replaced by the builtin plugins).
- Tests colocated: `web/src/plugins/builtin/*.test.ts`, plus `web/src/stats/xp.test.ts`.

---

### Task 1: Extend the XP tracker with actions-to-level

**Files:**
- Modify: `web/src/stats/xp.ts`
- Test: `web/src/stats/xp.test.ts`

**Interfaces:**
- Consumes: `SKILL_NAMES`, `xpForLevel` from `./skills`.
- Produces: `XpRow` gains `actionsToNext: number | null` (ceil of `toNext / lastDelta`, or null when maxed or no positive delta observed). `createXpTracker()`'s returned object keeps `onXp`, `rows`, `reset` with the same signatures; `onXp` now records the latest positive `delta` per skill.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/stats/xp.test.ts
import { describe, expect, test } from 'vitest';
import { createXpTracker } from './xp';

describe('xp tracker actions-to-level', () => {
  test('actionsToNext = ceil(toNext / last positive delta)', () => {
    const t = createXpTracker();
    const now = 0;
    // Cooking (skill 7). Establish baseline, then a gain of 40 xp at level 1.
    t.onXp({ skill: 7, xp: 0, delta: 0, level: 1 }, now);
    t.onXp({ skill: 7, xp: 40, delta: 40, level: 1 }, now + 1000);
    const row = t.rows(now + 1000).find(r => r.skill === 7)!;
    expect(row.gained).toBe(40);
    expect(row.toNext).not.toBeNull();
    expect(row.actionsToNext).toBe(Math.ceil(row.toNext! / 40));
  });

  test('actionsToNext is null when no positive delta has been seen yet', () => {
    const t = createXpTracker();
    t.onXp({ skill: 7, xp: 100, delta: 0, level: 10 }, 0);
    // gained is 0 so the row is filtered out; force a gain with delta 0 is impossible,
    // so assert via a skill that gained with an unknown delta path:
    t.onXp({ skill: 7, xp: 140, delta: 0, level: 10 }, 1000);
    const row = t.rows(1000).find(r => r.skill === 7)!;
    expect(row.gained).toBe(40);
    expect(row.actionsToNext).toBeNull();
  });

  test('reset clears tracks', () => {
    const t = createXpTracker();
    t.onXp({ skill: 7, xp: 0, delta: 0, level: 1 }, 0);
    t.onXp({ skill: 7, xp: 40, delta: 40, level: 1 }, 1000);
    t.reset();
    expect(t.rows(1000).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npx vitest run src/stats/xp.test.ts"`
Expected: FAIL — `actionsToNext` is not a property of `XpRow`.

- [ ] **Step 3: Implement**

Replace the contents of `web/src/stats/xp.ts` with:

```ts
import { SKILL_NAMES, xpForLevel } from './skills';

export interface XpRow { skill: number; name: string; gained: number; perHour: number; level: number; toNext: number | null; actionsToNext: number | null }
interface Track { baseline: number; latest: number; level: number; firstAt: number; lastDelta: number }

export function createXpTracker() {
  const tracks = new Map<number, Track>();
  return {
    onXp(ev: { skill: number; xp: number; delta: number; level: number }, now: number) {
      const t = tracks.get(ev.skill);
      if (!t) { tracks.set(ev.skill, { baseline: ev.xp, latest: ev.xp, level: ev.level, firstAt: now, lastDelta: ev.delta > 0 ? ev.delta : 0 }); return; }
      t.latest = ev.xp; t.level = ev.level;
      if (ev.delta > 0) t.lastDelta = ev.delta;
    },
    rows(now: number): XpRow[] {
      const out: XpRow[] = [];
      for (const [skill, t] of tracks) {
        const gained = t.latest - t.baseline;
        if (gained <= 0) continue;
        const hours = Math.max(now - t.firstAt, 1) / 3_600_000;
        const toNext = t.level >= 99 ? null : xpForLevel(t.level + 1) - t.latest;
        const actionsToNext = toNext !== null && t.lastDelta > 0 ? Math.ceil(toNext / t.lastDelta) : null;
        out.push({ skill, name: SKILL_NAMES[skill] ?? `Skill ${skill}`, gained, perHour: Math.round(gained / hours), level: t.level, toNext, actionsToNext });
      }
      return out.sort((a, b) => b.gained - a.gained);
    },
    reset() { tracks.clear(); }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npx vitest run src/stats/xp.test.ts"` then `... "npm run typecheck"`
Expected: PASS; typecheck exit 0. (typecheck will flag the old `panels/xp.ts` if it reads `XpRow` — it only reads existing fields, so it still compiles; it is deleted in Task 6.)

- [ ] **Step 5: Commit**

```bash
git add web/src/stats/xp.ts web/src/stats/xp.test.ts
git commit -m "feat(stats): track last per-action xp delta for actions-to-level"
```

---

### Task 2: xp-tracker plugin

**Files:**
- Create: `web/src/plugins/builtin/xpTracker.ts`
- Test: `web/src/plugins/builtin/xpTracker.test.ts`

**Interfaces:**
- Consumes: `definePlugin`, `PluginContext`, `ShellPlugin` from `../types`; `createXpTracker`, `XpRow` from `../../stats/xp`; `PanelView` from `../../frame/panels`.
- Produces: `export const xpTrackerPlugin: ShellPlugin` (manifest id `'xp'`), and `export function createXpTrackerPlugin(tracker: ReturnType<typeof createXpTracker>): ShellPlugin` so `main.ts` can inject the shared tracker instance that the hooks feed. Manifest declares `settings: { showToNext: boolean }` and `defaultEnabled: true`.

**Design:** the plugin owns a `panel(ctx)` that renders the tracker rows every 5 s (per-skill: name, +gained, /h, level, and — when `showToNext` is on — "N to next / M actions"), plus a "Reset session" button calling `tracker.reset()`. All names via `escapeHtml`. The tracker instance is injected (created in main.ts and fed by the hooks `xp` event), so the plugin does not wire hooks itself.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/plugins/builtin/xpTracker.test.ts
import { describe, expect, test, vi } from 'vitest';
import { createXpTrackerPlugin } from './xpTracker';
import { createXpTracker } from '../../stats/xp';
import type { PluginContext } from '../types';

function ctx(over: Partial<PluginContext> = {}): PluginContext {
  return {
    client: () => null,
    settings: { get: ((k: string) => (k === 'showToNext' ? true : undefined)) as PluginContext['settings']['get'], set: vi.fn(), subscribe: () => () => {} },
    storage: { get: () => null, set: () => {} },
    notify: vi.fn(), openPanel: vi.fn(), user: () => null, ...over
  };
}

describe('xp-tracker plugin', () => {
  test('manifest is the xp shell plugin, default enabled, with a showToNext setting', () => {
    const t = createXpTracker();
    const p = createXpTrackerPlugin(t);
    expect(p.manifest.id).toBe('xp');
    expect(p.manifest.tier).toBe('shell');
    expect(p.manifest.defaultEnabled).toBe(true);
    expect(p.manifest.settings?.showToNext).toBeTruthy();
  });

  test('panel shows an empty state before any xp, then a row after a gain', () => {
    const t = createXpTracker();
    const p = createXpTrackerPlugin(t);
    const view = p.panel!(ctx());
    const body = document.createElement('div');
    view.mount(body);
    expect(body.textContent).toContain('Gain some experience');
    t.onXp({ skill: 7, xp: 0, delta: 0, level: 1 }, Date.now());
    t.onXp({ skill: 7, xp: 40, delta: 40, level: 1 }, Date.now());
    // re-mount to force a synchronous re-render (avoids waiting on the interval)
    view.unmount?.();
    const body2 = document.createElement('div');
    p.panel!(ctx()).mount(body2);
    expect(body2.textContent).toContain('Cooking');
    expect(body2.textContent).toContain('+40');
  });

  test('reset button clears the tracker', () => {
    const t = createXpTracker();
    t.onXp({ skill: 7, xp: 0, delta: 0, level: 1 }, Date.now());
    t.onXp({ skill: 7, xp: 40, delta: 40, level: 1 }, Date.now());
    const p = createXpTrackerPlugin(t);
    const body = document.createElement('div');
    p.panel!(ctx()).mount(body);
    body.querySelector<HTMLButtonElement>('[data-xp-reset]')!.click();
    expect(t.rows(Date.now()).length).toBe(0);
  });

  test('a skill name is escaped in output', () => {
    // SKILL_NAMES is hardcoded/safe, but assert the render path escapes anyway by
    // checking no raw angle brackets survive from a crafted name via the fallback.
    const t = createXpTracker();
    t.onXp({ skill: 999, xp: 0, delta: 0, level: 1 }, Date.now());
    t.onXp({ skill: 999, xp: 5, delta: 5, level: 1 }, Date.now());
    const p = createXpTrackerPlugin(t);
    const body = document.createElement('div');
    p.panel!(ctx()).mount(body);
    expect(body.querySelector('script')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npx vitest run src/plugins/builtin/xpTracker.test.ts"`
Expected: FAIL — cannot find module `./xpTracker`.

- [ ] **Step 3: Implement**

```ts
// web/src/plugins/builtin/xpTracker.ts
import { definePlugin, type PluginContext, type ShellPlugin } from '../types';
import { createXpTracker } from '../../stats/xp';
import { escapeHtml } from '../../dom';
import type { PanelView } from '../../frame/panels';

const REFRESH_MS = 5000;

export function createXpTrackerPlugin(tracker: ReturnType<typeof createXpTracker>): ShellPlugin {
  function panel(ctx: PluginContext): PanelView {
    let timer: ReturnType<typeof setInterval> | null = null;
    const showToNext = () => ctx.settings.get<boolean>('showToNext') !== false;
    function render(body: HTMLElement): void {
      const rows = tracker.rows(Date.now());
      if (rows.length === 0) {
        body.innerHTML = '<div class="p-empty">Gain some experience to start tracking.</div>';
        return;
      }
      const toNext = showToNext();
      body.innerHTML = `<button class="p-btn" data-xp-reset>Reset session</button>
        <div class="p-table">${rows.map(r => `
          <span class="p-value">${escapeHtml(r.name)}</span><span class="p-value">+${r.gained.toLocaleString()}</span>
          <span class="p-label">${r.perHour.toLocaleString()}/h</span><span class="p-label">lvl ${r.level}</span>
          ${toNext ? `<span class="p-label">${r.toNext === null ? 'maxed' : `${r.toNext.toLocaleString()} to next${r.actionsToNext !== null ? ` · ${r.actionsToNext.toLocaleString()} actions` : ''}`}</span>` : ''}
        `).join('')}</div>`;
    }
    return {
      title: 'XP Tracker',
      mount(body) {
        render(body);
        body.addEventListener('click', e => {
          if ((e.target as HTMLElement).closest('[data-xp-reset]')) { tracker.reset(); render(body); }
        });
        timer = setInterval(() => render(body), REFRESH_MS);
      },
      unmount() { if (timer !== null) { clearInterval(timer); timer = null; } }
    };
  }

  return definePlugin({
    manifest: {
      id: 'xp', name: 'XP Tracker', icon: '✚', tier: 'shell',
      description: 'Per-skill XP, xp/h and actions to the next level.',
      defaultEnabled: true,
      settings: { showToNext: { type: 'boolean', label: 'Show "to next level"', default: true } }
    },
    panel
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npx vitest run src/plugins/builtin/xpTracker.test.ts"` then `... "npm run typecheck"`
Expected: PASS; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/plugins/builtin/xpTracker.ts web/src/plugins/builtin/xpTracker.test.ts
git commit -m "feat(plugins): xp-tracker plugin with actions-to-level and reset"
```

---

### Task 3: loot-tracker plugin

**Files:**
- Create: `web/src/plugins/builtin/lootTracker.ts`
- Test: `web/src/plugins/builtin/lootTracker.test.ts`

**Interfaces:**
- Consumes: `definePlugin`, `PluginContext`, `ShellPlugin` from `../types`; `createLootLog` from `../../stats/loot`; `escapeHtml` from `../../dom`; `PanelView` from `../../frame/panels`.
- Produces: `export function createLootTrackerPlugin(log: ReturnType<typeof createLootLog>): ShellPlugin` (manifest id `'loot'`, `defaultEnabled: true`). Item names via `ctx.client()?.getObjName(id)`, **escaped**. A "Reset" button calls `log.reset()`.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/plugins/builtin/lootTracker.test.ts
import { describe, expect, test, vi } from 'vitest';
import { createLootTrackerPlugin } from './lootTracker';
import { createLootLog } from '../../stats/loot';
import type { PluginContext } from '../types';

function ctx(getObjName: (id: number) => string | null): PluginContext {
  return {
    client: () => ({ getObjName } as unknown as ReturnType<PluginContext['client']>),
    settings: { get: (() => undefined) as PluginContext['settings']['get'], set: vi.fn(), subscribe: () => () => {} },
    storage: { get: () => null, set: () => {} },
    notify: vi.fn(), openPanel: vi.fn(), user: () => null
  };
}

describe('loot-tracker plugin', () => {
  test('manifest is the loot shell plugin, default enabled', () => {
    const p = createLootTrackerPlugin(createLootLog());
    expect(p.manifest.id).toBe('loot');
    expect(p.manifest.defaultEnabled).toBe(true);
  });

  test('renders escaped item names with counts', () => {
    const log = createLootLog();
    log.onInventory({ added: [{ id: 526, count: 3 }] }, Date.now());
    const p = createLootTrackerPlugin(log);
    const body = document.createElement('div');
    p.panel!(ctx(() => 'Bones')).mount(body);
    expect(body.textContent).toContain('Bones');
    expect(body.textContent).toContain('x3');
  });

  test('a hostile item name is escaped, not rendered live', () => {
    const log = createLootLog();
    log.onInventory({ added: [{ id: 1, count: 1 }] }, Date.now());
    const p = createLootTrackerPlugin(log);
    const body = document.createElement('div');
    p.panel!(ctx(() => '<img src=x onerror=alert(1)>')).mount(body);
    expect(body.querySelector('img')).toBeNull();
    expect(body.innerHTML).toContain('&lt;img');
  });

  test('reset clears the log', () => {
    const log = createLootLog();
    log.onInventory({ added: [{ id: 526, count: 3 }] }, Date.now());
    const p = createLootTrackerPlugin(log);
    const body = document.createElement('div');
    p.panel!(ctx(() => 'Bones')).mount(body);
    body.querySelector<HTMLButtonElement>('[data-loot-reset]')!.click();
    expect(log.entries().length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npx vitest run src/plugins/builtin/lootTracker.test.ts"`
Expected: FAIL — cannot find module `./lootTracker`.

- [ ] **Step 3: Implement**

```ts
// web/src/plugins/builtin/lootTracker.ts
import { definePlugin, type PluginContext, type ShellPlugin } from '../types';
import { createLootLog } from '../../stats/loot';
import { escapeHtml } from '../../dom';
import type { PanelView } from '../../frame/panels';

const REFRESH_MS = 2000;

export function createLootTrackerPlugin(log: ReturnType<typeof createLootLog>): ShellPlugin {
  function panel(ctx: PluginContext): PanelView {
    let timer: ReturnType<typeof setInterval> | null = null;
    function render(body: HTMLElement): void {
      const entries = [...log.entries()].sort((a, b) => b.firstSeen - a.firstSeen);
      if (entries.length === 0) {
        body.innerHTML = '<div class="p-empty">Items you pick up will appear here.</div>';
        return;
      }
      body.innerHTML = `<button class="p-btn" data-loot-reset>Reset</button>
        <div class="p-table">${entries.map(e => {
          const name = ctx.client()?.getObjName(e.id) ?? `#${e.id}`;
          return `<span class="p-value">${escapeHtml(name)}</span><span class="p-label">x${e.count.toLocaleString()}</span>`;
        }).join('')}</div>`;
    }
    return {
      title: 'Loot Tracker',
      mount(body) {
        render(body);
        body.addEventListener('click', e => {
          if ((e.target as HTMLElement).closest('[data-loot-reset]')) { log.reset(); render(body); }
        });
        timer = setInterval(() => render(body), REFRESH_MS);
      },
      unmount() { if (timer !== null) { clearInterval(timer); timer = null; } }
    };
  }

  return definePlugin({
    manifest: {
      id: 'loot', name: 'Loot Tracker', icon: '💰', tier: 'shell',
      description: 'Items gained this session.',
      defaultEnabled: true
    },
    panel
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npx vitest run src/plugins/builtin/lootTracker.test.ts"` then `... "npm run typecheck"`
Expected: PASS; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/plugins/builtin/lootTracker.ts web/src/plugins/builtin/lootTracker.test.ts
git commit -m "feat(plugins): loot-tracker plugin with escaped item names and reset"
```

---

### Task 4: notes plugin

**Files:**
- Create: `web/src/plugins/builtin/notes.ts`
- Test: `web/src/plugins/builtin/notes.test.ts`

**Interfaces:**
- Consumes: `definePlugin`, `PluginContext`, `ShellPlugin` from `../types`; `PanelView` from `../../frame/panels`.
- Produces: `export const notesPlugin: ShellPlugin` (manifest id `'notes'`, no `defaultEnabled` — off by default; no `settings` schema so no gear). The panel is a `<textarea>` whose value loads from `ctx.settings.get('content')` and writes back via `ctx.settings.set('content', value)` on input (the store debounces + Firestore-syncs).

**Design note:** notes content persists through `ctx.settings` even without a `SettingSchema` field — the SP2a settings store persists arbitrary keys; the schema only drives the auto-generated settings form. This gives per-user, cross-device notes.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/plugins/builtin/notes.test.ts
import { describe, expect, test, vi } from 'vitest';
import { notesPlugin } from './notes';
import type { PluginContext } from '../types';

function ctx(initial: string | undefined, set: (k: string, v: unknown) => void): PluginContext {
  return {
    client: () => null,
    settings: { get: ((k: string) => (k === 'content' ? initial : undefined)) as PluginContext['settings']['get'], set, subscribe: () => () => {} },
    storage: { get: () => null, set: () => {} },
    notify: vi.fn(), openPanel: vi.fn(), user: () => null
  };
}

describe('notes plugin', () => {
  test('manifest is a shell plugin, off by default, no settings gear', () => {
    expect(notesPlugin.manifest.id).toBe('notes');
    expect(notesPlugin.manifest.defaultEnabled).toBeUndefined();
    expect(notesPlugin.manifest.settings).toBeUndefined();
  });

  test('textarea loads stored content', () => {
    const view = notesPlugin.panel!(ctx('hello world', () => {}));
    const body = document.createElement('div');
    view.mount(body);
    expect(body.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('hello world');
  });

  test('typing persists content through settings.set', () => {
    const set = vi.fn();
    const view = notesPlugin.panel!(ctx('', set));
    const body = document.createElement('div');
    view.mount(body);
    const ta = body.querySelector<HTMLTextAreaElement>('textarea')!;
    ta.value = 'new note';
    ta.dispatchEvent(new Event('input'));
    expect(set).toHaveBeenCalledWith('content', 'new note');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npx vitest run src/plugins/builtin/notes.test.ts"`
Expected: FAIL — cannot find module `./notes`.

- [ ] **Step 3: Implement**

```ts
// web/src/plugins/builtin/notes.ts
import { definePlugin, type PluginContext, type ShellPlugin } from '../types';
import type { PanelView } from '../../frame/panels';

function panel(ctx: PluginContext): PanelView {
  return {
    title: 'Notes',
    mount(body) {
      const ta = document.createElement('textarea');
      ta.className = 'p-input p-notes';
      ta.rows = 12;
      ta.placeholder = 'Notes for this character (synced to your account).';
      ta.value = ctx.settings.get<string>('content') ?? '';
      ta.addEventListener('input', () => ctx.settings.set('content', ta.value));
      body.replaceChildren(ta);
    }
  };
}

export const notesPlugin: ShellPlugin = definePlugin({
  manifest: {
    id: 'notes', name: 'Notes', icon: '📝', tier: 'shell',
    description: 'A per-character scratchpad, synced to your account.'
  },
  panel
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npx vitest run src/plugins/builtin/notes.test.ts"` then `... "npm run typecheck"`
Expected: PASS; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/plugins/builtin/notes.ts web/src/plugins/builtin/notes.test.ts
git commit -m "feat(plugins): notes plugin (account-synced scratchpad)"
```

---

### Task 5: screenshot plugin

**Files:**
- Create: `web/src/plugins/builtin/screenshot.ts`
- Test: `web/src/plugins/builtin/screenshot.test.ts`

**Interfaces:**
- Consumes: `definePlugin`, `PluginContext`, `ShellPlugin` from `../types`; `PanelView` from `../../frame/panels`.
- Produces: `export function createScreenshotPlugin(deps?: { canvas?: () => HTMLCanvasElement | null }): ShellPlugin` (manifest id `'screenshot'`, off by default). The panel has a "Capture" button that reads the game canvas (default: `document.querySelector('#canvas')`, overridable via `deps.canvas` for tests), calls `toBlob`, keeps the last 10 thumbnails (object URLs) in-memory, renders them, and downloads the newest via a temporary `<a download>`.

**Design note:** `deps.canvas` is injectable so the test can supply a stub canvas without a real game. Object URLs created for thumbnails are revoked in `unmount` to avoid leaks.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/plugins/builtin/screenshot.test.ts
import { describe, expect, test, vi } from 'vitest';
import { createScreenshotPlugin } from './screenshot';
import type { PluginContext } from '../types';

function ctx(): PluginContext {
  return {
    client: () => null,
    settings: { get: (() => undefined) as PluginContext['settings']['get'], set: vi.fn(), subscribe: () => () => {} },
    storage: { get: () => null, set: () => {} },
    notify: vi.fn(), openPanel: vi.fn(), user: () => null
  };
}

describe('screenshot plugin', () => {
  test('manifest is a shell plugin, off by default', () => {
    const p = createScreenshotPlugin();
    expect(p.manifest.id).toBe('screenshot');
    expect(p.manifest.defaultEnabled).toBeUndefined();
  });

  test('capture calls toBlob on the provided canvas and adds a thumbnail', async () => {
    const canvas = document.createElement('canvas');
    const blob = new Blob(['x'], { type: 'image/png' });
    canvas.toBlob = ((cb: (b: Blob | null) => void) => cb(blob)) as HTMLCanvasElement['toBlob'];
    // jsdom lacks createObjectURL; stub it.
    const createURL = vi.fn(() => 'blob:stub');
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();

    const p = createScreenshotPlugin({ canvas: () => canvas });
    const body = document.createElement('div');
    p.panel!(ctx()).mount(body);
    body.querySelector<HTMLButtonElement>('[data-shot-capture]')!.click();
    await Promise.resolve();
    expect(createURL).toHaveBeenCalledWith(blob);
    expect(body.querySelectorAll('img.p-shot-thumb').length).toBe(1);
  });

  test('capture with no canvas notifies instead of throwing', () => {
    const c = ctx();
    const p = createScreenshotPlugin({ canvas: () => null });
    const body = document.createElement('div');
    p.panel!(c).mount(body);
    body.querySelector<HTMLButtonElement>('[data-shot-capture]')!.click();
    expect(c.notify).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npx vitest run src/plugins/builtin/screenshot.test.ts"`
Expected: FAIL — cannot find module `./screenshot`.

- [ ] **Step 3: Implement**

```ts
// web/src/plugins/builtin/screenshot.ts
import { definePlugin, type PluginContext, type ShellPlugin } from '../types';
import type { PanelView } from '../../frame/panels';

const MAX_THUMBS = 10;

export function createScreenshotPlugin(deps: { canvas?: () => HTMLCanvasElement | null } = {}): ShellPlugin {
  const getCanvas = deps.canvas ?? (() => document.querySelector<HTMLCanvasElement>('#canvas'));

  function panel(ctx: PluginContext): PanelView {
    const urls: string[] = [];
    let strip: HTMLElement | null = null;

    function download(url: string): void {
      const a = document.createElement('a');
      a.href = url;
      a.download = `idlescape-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    function addThumb(url: string): void {
      urls.unshift(url);
      while (urls.length > MAX_THUMBS) { const old = urls.pop()!; URL.revokeObjectURL(old); }
      if (strip) {
        strip.innerHTML = urls.map(u => `<img class="p-shot-thumb" src="${u}" alt="screenshot" />`).join('');
      }
    }

    function capture(): void {
      const canvas = getCanvas();
      if (!canvas) { ctx.notify('No game canvas to capture yet.', 'error'); return; }
      canvas.toBlob(blob => {
        if (!blob) { ctx.notify('Screenshot failed.', 'error'); return; }
        const url = URL.createObjectURL(blob);
        addThumb(url);
        download(url);
      }, 'image/png');
    }

    return {
      title: 'Screenshot',
      mount(body) {
        body.innerHTML = `<button class="p-btn p-btn-primary" data-shot-capture>Capture</button>
          <div class="p-shot-strip" data-shot-strip></div>`;
        strip = body.querySelector<HTMLElement>('[data-shot-strip]');
        body.addEventListener('click', e => {
          if ((e.target as HTMLElement).closest('[data-shot-capture]')) capture();
        });
      },
      unmount() { for (const u of urls) URL.revokeObjectURL(u); urls.length = 0; strip = null; }
    };
  }

  return definePlugin({
    manifest: {
      id: 'screenshot', name: 'Screenshot', icon: '📸', tier: 'shell',
      description: 'Capture the game view and download a PNG.'
    },
    panel
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npx vitest run src/plugins/builtin/screenshot.test.ts"` then `... "npm run typecheck"`
Expected: PASS; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/plugins/builtin/screenshot.ts web/src/plugins/builtin/screenshot.test.ts
git commit -m "feat(plugins): screenshot plugin with capture, thumbnails and download"
```

---

### Task 6: Register the builtin plugins in main.ts

**Files:**
- Modify: `web/src/main.ts`
- Delete: `web/src/panels/xp.ts`, `web/src/panels/loot.ts`

**Interfaces:**
- Consumes: `createXpTrackerPlugin`, `createLootTrackerPlugin`, `notesPlugin`, `createScreenshotPlugin` from `./plugins/builtin/*`; the existing `xp`/`loot` tracker instances already created in `main.ts` (`const xp = createXpTracker()`, `const loot = createLootLog()`); the SP2a `shell` registry.
- Produces: the four builtin plugins registered on the shell registry; the old `asPlugin('xp', ...)` and `asPlugin('loot', ...)` wrappers and the `createXpPanel`/`createLootPanel` imports removed.

**Design notes:**
- `main.ts` already owns `const xp = createXpTracker()` and `const loot = createLootLog()`, fed by `wireHooks` (`h.on('xp', ...)` / `h.on('inventory', ...)`). Register `createXpTrackerPlugin(xp)` and `createLootTrackerPlugin(loot)` so the plugins render the same live instances. Keep the existing `overlays.setXpLine(...)` call in `wireHooks` (the overlay stays; migrating it into the plugin is a later slice).
- Register `notesPlugin` and `createScreenshotPlugin()` (no injected canvas → it uses `#canvas`).
- Remove the two `import { createXpPanel, ... }` / `createLootPanel` lines and the two `asPlugin('xp'...)` / `asPlugin('loot'...)` `shell.register(...)` lines; replace with `shell.register(createXpTrackerPlugin(xp)); shell.register(createLootTrackerPlugin(loot)); shell.register(notesPlugin); shell.register(createScreenshotPlugin());`.
- Delete `web/src/panels/xp.ts` and `web/src/panels/loot.ts` (now unused). Confirm no other importer via a grep before deleting.

- [ ] **Step 1: Confirm the old panels have no other importers**

Run: `cd /c/projects/osrs_test && grep -rn "panels/xp\|panels/loot\|createXpPanel\|createLootPanel" web/src --include=*.ts | grep -v "\.test\."`
Expected: only `web/src/main.ts` references them. (If anything else does, adjust it in this task.)

- [ ] **Step 2: Rewire the registrations in `web/src/main.ts`**

Remove:
```ts
import { createXpPanel, manifest as xpManifest } from './panels/xp';
import { createLootPanel, manifest as lootManifest } from './panels/loot';
```
and the two lines:
```ts
shell.register(asPlugin('xp', 'XP', '✚', 'Per-skill XP and xp/h.', () => createXpPanel(deps), { defaultEnabled: true }));
shell.register(asPlugin('loot', 'Loot', '💰', 'Items gained this session.', () => createLootPanel(deps), { defaultEnabled: true }));
```
Add the imports:
```ts
import { createXpTrackerPlugin } from './plugins/builtin/xpTracker';
import { createLootTrackerPlugin } from './plugins/builtin/lootTracker';
import { notesPlugin } from './plugins/builtin/notes';
import { createScreenshotPlugin } from './plugins/builtin/screenshot';
```
And register them alongside the other `shell.register(...)` calls (order: after `claude`, before `connect`/`account`/`config`/`plugins` so the toggleable ones group together):
```ts
shell.register(createXpTrackerPlugin(xp));
shell.register(createLootTrackerPlugin(loot));
shell.register(notesPlugin);
shell.register(createScreenshotPlugin());
```

- [ ] **Step 3: Delete the dead panels**

```bash
git rm web/src/panels/xp.ts web/src/panels/loot.ts
```

- [ ] **Step 4: Gate — typecheck, full unit suite, build**

Run:
```
cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npm run typecheck"
cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npm test"
cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npm run build"
```
Expected: typecheck exit 0 (no dangling imports); all unit tests pass (the deleted panels' behavior now lives in the builtin plugin tests); build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web/src/main.ts
git commit -m "feat(plugins): register xp/loot/notes/screenshot builtins, drop the thin panel wrappers"
```

---

## Self-Review

**1. Spec coverage (SP2 §5 framework-native subset):**
- `xp-tracker` (rows: gained, xp/h, time to level, actions to level; reset) → Tasks 1, 2. Overlay xp/h line stays in main.ts (deferred migration, noted). SP3 snapshot hook deferred (noted).
- `loot-tracker` (name, count, first seen; reset; escaped names) → Task 3. Item icons + ground-pickup attribution deferred (need sprite/scene data, noted).
- `notes` (textarea persisted per user) → Task 4.
- `screenshot` (button, history of last 10 thumbnails, download) → Task 5.
- Registration/integration → Task 6.
- Deferred with reasons in Global Constraints/plan intro: `status-hud` (client hooks change), `quest-helper`/`skill-calc` (gen scripts), `hiscores` (SP3).

**2. Placeholder scan:** No TBD/TODO; every code step has complete code and tests.

**3. Type consistency:** `XpRow.actionsToNext` defined in Task 1, consumed in Task 2. `createXpTrackerPlugin(tracker)`/`createLootTrackerPlugin(log)` signatures consistent between their tasks and Task 6. `PluginContext`/`ShellPlugin`/`definePlugin` used identically to SP2a's definitions. `ctx.settings.get<T>(key)`/`set(key, value)` matches the SP2a `PluginContext`. `notify(message, kind?)` matches SP2a.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-05-sp2c-tier1-shell-plugins.md`. This is the framework-native slice of SP2c (four plugins). Recommended execution: **subagent-driven-development**, continuing the established SDD loop with a fresh ledger at `.superpowers/sdd/2026-09-05-sp2c-tier1-shell-plugins/`.
