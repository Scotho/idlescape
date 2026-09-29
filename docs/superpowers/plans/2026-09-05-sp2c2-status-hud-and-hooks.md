# SP2c-2 — Status HUD plugin + client `ClientState` extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the client hooks `ClientState` with live hitpoints, prayer, run energy, and per-skill boosts, then ship the `status-hud` shell plugin — an over-canvas HUD with HP/prayer/energy bars and a boost summary.

**Architecture:** The client fork's `hookState()` (in `client/src/client/Client.ts`) already builds a `ClientState` snapshot from its stat arrays. Task 1 adds `hp`, `prayer`, `energy`, and `boosts` to `ClientState` (mirrored in `web/src/clientTypes.ts`), reads them from `statEffectiveLevel`/`statBaseLevel`/`runenergy`, and protects the new property names in the terser reserved list. Task 2 builds the `status-hud` plugin as a shell `overlay` that polls `getState()` on an interval and paints bars. Task 3 wires plugin-overlay rendering into `main.ts` (SP2a's registry exposes `overlaysFor()` but nothing renders it yet) and registers `status-hud`.

**Tech Stack:** TypeScript, the SP2a plugin framework, the Client-TS fork (Bun bundle via `client/bundle.ts`), Vite/Vitest (jsdom) for the web plugin.

**Spec:** `docs/superpowers/specs/2026-09-05-sp2-plugin-framework-design.md` (SP2 §5, the `status-hud` row: "ClientState extended with hp, prayer, energy, boosts … diffing statLevel versus statBaseLevel"). This is the SP2c slice that requires a client-fork change; the four framework-native plugins already shipped in `2026-09-05-sp2c-tier1-shell-plugins.md`.

## Global Constraints

- **Client/web hook types must stay byte-for-byte identical.** `web/src/clientTypes.ts` is a hand-kept mirror of `client/src/hooks/types.ts` (it says so at the top). Any `ClientState` change goes into BOTH, identically.
- **terser property mangling is ON** (`client/bundle.ts` → `mangle.properties.reserved`). Every `ClientState` property name the web reads must be in that reserved list, or the client bundle mangles it and the web reads `undefined`. New names to add: `hp`, `prayer`, `energy`, `boosts`, `current`, `max`.
- **Skill indices (from `client/src/client/Skill.ts`):** hitpoints = 3, prayer = 5. `Skill.count` = 25. `statEffectiveLevel[i]` = current/boosted level; `statBaseLevel[i]` = base level; `runenergy` = 0–100 (a single byte). These are the exact field names in `Client.ts`.
- **Do NOT touch the engine or the live PoC** (ports 8888/43594/8898). The client fork and web are in scope; the engine is not.
- **Escaping:** any string rendered into `innerHTML` goes through `escapeHtml` (`web/src/dom.ts`). The HUD renders only numbers, but follow the rule for any label.
- **Overlay lifecycle:** a plugin `overlay(ctx)` element is created once at enable; the plugin starts its update interval in `onEnable(ctx)` and clears it in `onDisable()`. Never leak an interval.
- **Branch:** commit to `feat/platform-shell`. Local-only repo; no deploy; no merge to develop/main.
- **Commit trailers (every commit):**
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Qn4XvzDVpesgyj3peXiM3M
  ```
- **Commands (Git Bash):** web — `cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npm run typecheck|npm test|npm run build|npx vitest run <p>"`; client build — `cd client && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "bun run build:dev"`; client hook tests — `cd client && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "bun test src/hooks"`. The `MSYS2_ARG_CONV_EXCL="*"` prefix is REQUIRED.

## Interfaces from earlier work (consumed here)

From SP2a `web/src/plugins/types.ts`: `definePlugin`, `ShellPlugin`, `PluginContext`, `PluginManifest`, `SettingSchema`. From `web/src/frame/panels.ts`: `PanelView`. From `web/src/dom.ts`: `escapeHtml`. From `web/src/clientTypes.ts`: `ClientHooks`, `ClientState`. SP2a registry (`web/src/plugins/registry.ts`) exposes `overlaysFor(): HTMLElement[]` (currently unrendered).

---

## File Structure

- `client/src/hooks/types.ts` — **Modify.** Add `hp`, `prayer`, `energy`, `boosts` to `ClientState`.
- `web/src/clientTypes.ts` — **Modify.** Identical `ClientState` addition (the mirror).
- `client/src/client/Client.ts` — **Modify.** `hookState()` populates the four new fields.
- `client/bundle.ts` — **Modify.** Add the six property names to the terser reserved list.
- `client/PATCHES.md` — **Modify.** Document the hookState extension.
- `web/src/plugins/builtin/statusHud.ts` — **Create.** The `status-hud` shell plugin.
- `web/src/partials/frame.html` — **Modify.** Add a `#plugin-overlays` host inside the stage overlay area.
- `web/src/styles/frame.css` — **Modify.** Minimal styles for the HUD bars.
- `web/src/main.ts` — **Modify.** Render `shell.overlaysFor()` into `#plugin-overlays` on change; register `status-hud`.
- Tests: `web/src/plugins/builtin/statusHud.test.ts`.

---

### Task 1: Extend ClientState with hp, prayer, energy, boosts

**Files:**
- Modify: `client/src/hooks/types.ts`, `web/src/clientTypes.ts` (identical change)
- Modify: `client/src/client/Client.ts` (the `hookState()` method)
- Modify: `client/bundle.ts` (terser reserved), `client/PATCHES.md`

**Interfaces:**
- Produces: `ClientState` gains
  ```ts
  hp: { current: number; max: number };
  prayer: { current: number; max: number };
  energy: number;         // run energy, 0–100
  boosts: number[];       // per skill: effective - base (positive = boosted, negative = drained)
  ```
  Consumed by Task 2 (`status-hud`).

- [ ] **Step 1: Add the fields to `client/src/hooks/types.ts`**

In the `ClientState` interface, after `rttMs: number | null;`, add:
```ts
  hp: { current: number; max: number };
  prayer: { current: number; max: number };
  energy: number;
  boosts: number[];
```

- [ ] **Step 2: Mirror the change in `web/src/clientTypes.ts`**

Make the identical addition to the `ClientState` interface there (same four lines, same order). The two interfaces must match exactly.

- [ ] **Step 3: Populate the fields in `hookState()` (`client/src/client/Client.ts`)**

The method currently ends its returned object with `fps: this.fps, rttMs: null`. Change the return to include the new fields. The existing return is:
```ts
        return {
            loggedIn: this.ingame,
            gameName: this.localPlayer?.name ?? (this.loginUser.length > 0 ? this.loginUser : null),
            skills: { xp: Array.from(this.statXP), level: Array.from(this.statBaseLevel) },
            inventory,
            fps: this.fps,
            rttMs: null
        };
```
Replace it with:
```ts
        const HITPOINTS = 3;
        const PRAYER = 5;
        return {
            loggedIn: this.ingame,
            gameName: this.localPlayer?.name ?? (this.loginUser.length > 0 ? this.loginUser : null),
            skills: { xp: Array.from(this.statXP), level: Array.from(this.statBaseLevel) },
            inventory,
            fps: this.fps,
            rttMs: null,
            hp: { current: this.statEffectiveLevel[HITPOINTS], max: this.statBaseLevel[HITPOINTS] },
            prayer: { current: this.statEffectiveLevel[PRAYER], max: this.statBaseLevel[PRAYER] },
            energy: this.runenergy,
            boosts: Array.from(this.statEffectiveLevel, (v: number, i: number) => v - this.statBaseLevel[i])
        };
```
(`statEffectiveLevel`, `statBaseLevel`, `statXP`, and `runenergy` are existing private fields on the class — verified present. Do not rename them.)

- [ ] **Step 4: Protect the new property names in `client/bundle.ts`**

In the `mangle.properties.reserved` array, on the existing ClientState line, extend it. Change:
```ts
                    'loggedIn', 'gameName', 'skills', 'xp', 'level', 'inventory', 'id', 'count', 'fps', 'rttMs',
```
to:
```ts
                    'loggedIn', 'gameName', 'skills', 'xp', 'level', 'inventory', 'id', 'count', 'fps', 'rttMs',
                    'hp', 'prayer', 'energy', 'boosts', 'current', 'max',
```

- [ ] **Step 5: Document in `client/PATCHES.md`**

Add a short bullet under the hookState/getState patch note: that `hookState()` now also returns `hp`/`prayer` (`{current: statEffectiveLevel[idx], max: statBaseLevel[idx]}` for hitpoints=3, prayer=5), `energy` (`runenergy`, 0–100), and `boosts` (`statEffectiveLevel[i] - statBaseLevel[i]`), and that `bundle.ts` reserves `hp/prayer/energy/boosts/current/max`.

- [ ] **Step 6: Verify the client bundles and hooks still pass, and the web mirror type-checks**

Run:
```
cd client && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "bun run build:dev"
cd client && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "bun test src/hooks"
cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npm run typecheck"
```
Expected: client bundle succeeds; client hook tests pass; web typecheck exit 0 (the mirror addition compiles; nothing consumes the new fields yet, so no other web change is needed).

- [ ] **Step 7: Commit**

```bash
git add client/src/hooks/types.ts web/src/clientTypes.ts client/src/client/Client.ts client/bundle.ts client/PATCHES.md
git commit -m "feat(hooks): expose hp, prayer, run energy and boosts in ClientState"
```

---

### Task 2: status-hud plugin

**Files:**
- Create: `web/src/plugins/builtin/statusHud.ts`
- Test: `web/src/plugins/builtin/statusHud.test.ts`

**Interfaces:**
- Consumes: `definePlugin`, `PluginContext`, `ShellPlugin` from `../types`; `ClientState`, `ClientHooks` from `../../clientTypes`; `escapeHtml` from `../../dom`.
- Produces: `export function createStatusHudPlugin(opts?: { intervalMs?: number }): ShellPlugin` (manifest id `'status-hud'`, `tier: 'shell'`, off by default, `settings: { showBoosts: boolean }`). It has an `overlay(ctx)` returning a container, `onEnable(ctx)` starting a poll of `ctx.client()?.getState()` that repaints the container, and `onDisable()` clearing the interval.

**Design:** the overlay shows an HP bar (`current/max`, green→red by ratio), a prayer bar (`current/max`), a run-energy bar (`energy%`), and — when `showBoosts` is on — a one-line summary of boosted/drained skills (e.g. "Str +4, Att -2") using `SKILL_NAMES`. Guard `max === 0` (pre-login) by rendering a dimmed empty HUD. Poll interval default 600 ms (about one game tick). Numbers only, but any skill label passes through `escapeHtml`.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/plugins/builtin/statusHud.test.ts
import { describe, expect, test, vi } from 'vitest';
import { createStatusHudPlugin } from './statusHud';
import type { ClientState, ClientHooks } from '../../clientTypes';
import type { PluginContext } from '../types';

function state(over: Partial<ClientState> = {}): ClientState {
  return {
    loggedIn: true, gameName: 'bob', skills: { xp: [], level: [] }, inventory: [], fps: 50, rttMs: null,
    hp: { current: 30, max: 40 }, prayer: { current: 10, max: 43 }, energy: 55,
    boosts: new Array(25).fill(0), ...over
  };
}

function ctx(getState: () => ClientState, showBoosts = true): PluginContext {
  const client = { getState } as unknown as ClientHooks;
  return {
    client: () => client,
    settings: { get: ((k: string) => (k === 'showBoosts' ? showBoosts : undefined)) as PluginContext['settings']['get'], set: vi.fn(), subscribe: () => () => {} },
    storage: { get: () => null, set: () => {} },
    notify: vi.fn(), openPanel: vi.fn(), user: () => null
  };
}

describe('status-hud plugin', () => {
  test('manifest: shell, off by default, has showBoosts setting', () => {
    const p = createStatusHudPlugin();
    expect(p.manifest.id).toBe('status-hud');
    expect(p.manifest.tier).toBe('shell');
    expect(p.manifest.defaultEnabled).toBeUndefined();
    expect(p.manifest.settings?.showBoosts).toBeTruthy();
  });

  test('overlay renders hp/prayer/energy values after enable', () => {
    vi.useFakeTimers();
    const p = createStatusHudPlugin({ intervalMs: 100 });
    const c = ctx(() => state());
    const el = p.overlay!(c);
    p.onEnable!(c);
    vi.advanceTimersByTime(100);
    expect(el.textContent).toContain('30');
    expect(el.textContent).toContain('40');
    expect(el.textContent).toContain('55');
    p.onDisable!();
    vi.useRealTimers();
  });

  test('boost summary lists boosted and drained skills when showBoosts is on', () => {
    vi.useFakeTimers();
    const boosts = new Array(25).fill(0); boosts[2] = 4; boosts[0] = -2; // Strength +4, Attack -2
    const p = createStatusHudPlugin({ intervalMs: 100 });
    const c = ctx(() => state({ boosts }), true);
    const el = p.overlay!(c);
    p.onEnable!(c);
    vi.advanceTimersByTime(100);
    expect(el.textContent).toContain('Strength');
    expect(el.textContent).toContain('+4');
    expect(el.textContent).toContain('Attack');
    p.onDisable!();
    vi.useRealTimers();
  });

  test('onDisable stops the interval (no further getState calls)', () => {
    vi.useFakeTimers();
    const getState = vi.fn(() => state());
    const p = createStatusHudPlugin({ intervalMs: 100 });
    const c = ctx(getState);
    p.overlay!(c); p.onEnable!(c);
    vi.advanceTimersByTime(100);
    const callsAfterEnable = getState.mock.calls.length;
    p.onDisable!();
    vi.advanceTimersByTime(500);
    expect(getState.mock.calls.length).toBe(callsAfterEnable);
    vi.useRealTimers();
  });

  test('pre-login (max 0) does not throw and renders a dimmed hud', () => {
    vi.useFakeTimers();
    const p = createStatusHudPlugin({ intervalMs: 100 });
    const c = ctx(() => state({ hp: { current: 0, max: 0 }, prayer: { current: 0, max: 0 }, energy: 0 }));
    const el = p.overlay!(c);
    p.onEnable!(c);
    expect(() => vi.advanceTimersByTime(100)).not.toThrow();
    p.onDisable!();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npx vitest run src/plugins/builtin/statusHud.test.ts"`
Expected: FAIL — cannot find module `./statusHud`.

- [ ] **Step 3: Implement**

```ts
// web/src/plugins/builtin/statusHud.ts
import { definePlugin, type PluginContext, type ShellPlugin } from '../types';
import type { ClientState } from '../../clientTypes';
import { escapeHtml } from '../../dom';
import { SKILL_NAMES } from '../../stats/skills';

function bar(label: string, current: number, max: number, cls: string): string {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((current / max) * 100))) : 0;
  const dim = max > 0 ? '' : ' hud-dim';
  return `<div class="hud-row${dim}">
    <span class="hud-label">${escapeHtml(label)}</span>
    <span class="hud-bar"><span class="hud-fill ${cls}" style="width:${pct}%"></span></span>
    <span class="hud-num">${max > 0 ? `${current}/${max}` : '—'}</span>
  </div>`;
}

function boostSummary(boosts: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < boosts.length; i++) {
    if (boosts[i] !== 0 && SKILL_NAMES[i]) parts.push(`${escapeHtml(SKILL_NAMES[i])} ${boosts[i] > 0 ? '+' : ''}${boosts[i]}`);
  }
  return parts.length ? `<div class="hud-boosts">${parts.join(', ')}</div>` : '';
}

export function createStatusHudPlugin(opts: { intervalMs?: number } = {}): ShellPlugin {
  const intervalMs = opts.intervalMs ?? 600;
  let el: HTMLElement | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let showBoosts = true;

  function paint(s: ClientState): void {
    if (!el) return;
    el.innerHTML = `${bar('HP', s.hp.current, s.hp.max, 'hud-hp')}
      ${bar('Pray', s.prayer.current, s.prayer.max, 'hud-pray')}
      ${bar('Run', s.energy, 100, 'hud-run')}
      ${showBoosts ? boostSummary(s.boosts) : ''}`;
  }

  return definePlugin({
    manifest: {
      id: 'status-hud', name: 'Status HUD', icon: '❤', tier: 'shell',
      description: 'HP, prayer, run energy and stat boosts over the game view.',
      settings: { showBoosts: { type: 'boolean', label: 'Show stat boosts', default: true } }
    },
    overlay(_ctx: PluginContext) {
      el = document.createElement('div');
      el.className = 'hud';
      return el;
    },
    onEnable(ctx: PluginContext) {
      showBoosts = ctx.settings.get<boolean>('showBoosts') !== false;
      const tick = () => { const s = ctx.client()?.getState(); if (s) paint(s); };
      tick();
      timer = setInterval(tick, intervalMs);
    },
    onDisable() {
      if (timer !== null) { clearInterval(timer); timer = null; }
      el = null;
    }
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npx vitest run src/plugins/builtin/statusHud.test.ts"` then `... "npm run typecheck"`
Expected: PASS; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/plugins/builtin/statusHud.ts web/src/plugins/builtin/statusHud.test.ts
git commit -m "feat(plugins): status-hud overlay (hp/prayer/energy bars + boosts)"
```

---

### Task 3: Render plugin overlays and register status-hud

**Files:**
- Modify: `web/src/partials/frame.html` (add `#plugin-overlays` host)
- Modify: `web/src/styles/frame.css` (HUD styles)
- Modify: `web/src/main.ts` (render `overlaysFor()`; register `status-hud`)

**Interfaces:**
- Consumes: `createStatusHudPlugin` from `./plugins/builtin/statusHud`; SP2a `shell.overlaysFor()` and the existing `rebuildStrip` change-notification path (`onIconStripChange`, called on every enable/disable/init).
- Produces: enabled plugins' overlay elements rendered into `#plugin-overlays`; `status-hud` registered on the shell registry.

**Design notes:**
- SP2a's registry exposes `overlaysFor()` but `main.ts` never renders it. `onIconStripChange` (wired to `rebuildStrip`) fires on every enable/disable/init, so it is the reliable "enabled set changed" signal. In `rebuildStrip`, after rebuilding the icon strip, also refresh the overlay host: `pluginOverlayHost.replaceChildren(...shell.overlaysFor())`. The overlay elements are stable instances cached in the registry (created at activate), so `replaceChildren` just re-parents them; a disabled plugin drops out of `overlaysFor()` and thus out of the DOM.
- Put `#plugin-overlays` inside the stage overlay area (a sibling of the existing `#overlays`), absolutely positioned so it sits over the canvas without disturbing the built-in `#overlays` content (xp line/status/boxes).

- [ ] **Step 1: Add the overlay host to `web/src/partials/frame.html`**

Next to the existing `<div id="overlays" class="overlays"></div>`, add a sibling:
```html
        <div id="plugin-overlays" class="plugin-overlays"></div>
```

- [ ] **Step 2: Add HUD + host styles to `web/src/styles/frame.css`**

Append:
```css
.plugin-overlays { position: absolute; top: 8px; right: 8px; display: flex; flex-direction: column; gap: 6px; pointer-events: none; z-index: 5; }
.hud { background: rgba(var(--rl-darker), 0.85); border: 1px solid rgb(var(--rl-border)); border-radius: var(--radius); padding: 6px 8px; min-width: 150px; font-size: 11px; color: rgb(var(--rl-text)); }
.hud-row { display: grid; grid-template-columns: 34px 1fr auto; align-items: center; gap: 6px; margin: 2px 0; }
.hud-row.hud-dim { opacity: 0.5; }
.hud-bar { height: 8px; background: rgb(var(--rl-hover)); border-radius: 4px; overflow: hidden; }
.hud-fill { display: block; height: 100%; }
.hud-hp { background: #c0392b; } .hud-pray { background: #2980b9; } .hud-run { background: #27ae60; }
.hud-num { font-variant-numeric: tabular-nums; } .hud-boosts { margin-top: 4px; opacity: 0.9; }
```
(If `--rl-darker`/`--rl-border`/`--rl-hover`/`--rl-text`/`--radius` are not defined, reuse whatever tokens `frame.css` already uses for the icon strip and panels — grep `frame.css` for the existing token names and match them.)

- [ ] **Step 3: Render overlays and register the plugin in `main.ts`**

Add the import near the other builtin imports:
```ts
import { createStatusHudPlugin } from './plugins/builtin/statusHud';
```
Register it with the other builtins (after `screenshot`):
```ts
shell.register(createStatusHudPlugin());
```
Add an overlay host reference near the `overlays` setup:
```ts
const pluginOverlayHost = byId('plugin-overlays');
```
In `rebuildStrip`, after the strip loop (before the `if (openNow ...)` line), add:
```ts
  pluginOverlayHost.replaceChildren(...shell.overlaysFor());
```

- [ ] **Step 4: Gate — typecheck, full unit suite, build**

Run:
```
cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npm run typecheck"
cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npm test"
cd web && MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npm run build"
```
Expected: typecheck exit 0; all unit tests pass; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web/src/partials/frame.html web/src/styles/frame.css web/src/main.ts
git commit -m "feat(plugins): render plugin overlays and register status-hud"
```

---

## Self-Review

**1. Spec coverage:** SP2 §5 `status-hud` — HP/prayer/energy bars with numbers + boost countdown, `ClientState` extended with hp/prayer/energy/boosts diffing effective vs base → Tasks 1, 2, 3. "Boost countdown" (time until a boost decays) is not modelled (the client does not expose boost timers to the hook); the HUD shows the current boost delta instead — recorded as a scope note. LostXP/RuneLite Boosts idea satisfied by the boost summary.

**2. Placeholder scan:** No TBD/TODO; every code step has complete code. The frame.css token names carry a fallback instruction (grep existing tokens) because the exact token spelling lives in a file this plan reads at implementation time.

**3. Type consistency:** `ClientState` addition identical in `client/src/hooks/types.ts` and `web/src/clientTypes.ts` (Task 1). `hp/prayer/energy/boosts` shapes defined in Task 1, consumed by Task 2's `paint`. `createStatusHudPlugin(opts?)` signature consistent between Task 2 and Task 3. `overlaysFor()` matches the SP2a registry signature. Skill indices (3, 5) and field names (`statEffectiveLevel`, `statBaseLevel`, `runenergy`) verified against `Client.ts`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-05-sp2c2-status-hud-and-hooks.md`. This is the client-fork slice of SP2c. Recommended execution: **subagent-driven-development**, fresh ledger at `.superpowers/sdd/2026-09-05-sp2c2-status-hud-and-hooks/`. Remaining SP2 after this: `quest-helper`/`skill-calc` (need `scripts/gen/*` content data), `hiscores` (SP3), and SP2b (GPU renderer).
