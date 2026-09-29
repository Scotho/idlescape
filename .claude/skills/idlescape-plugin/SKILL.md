---
name: idlescape-plugin
description: Use when adding a shell plugin or a panel to the idlescape web shell - a new icon on the strip, a side-panel body, a canvas overlay, or a settings schema. Covers the registry contract, the lifecycle, persistence, and the design-system rule a panel must not break.
user-invocable: true
---

# Adding a plugin or a panel

The shell's side panel is a plugin system, not a switch statement. Every surface behind an icon on
the strip is a `ShellPlugin` with a manifest, an optional typed settings schema, and per-user
persistence. Adding one should touch the frame in no way at all.

## Read first

- `docs/superpowers/specs/2026-09-05-sp2-plugin-framework-design.md` - the framework's design.
  Note its section 5 still presents nine Tier 1 plugins; five exist.
- `web/src/plugins/types.ts` - **the contract**: `PluginManifest`, `PluginContext`, `ShellPlugin`,
  `definePlugin`, and the `SettingField` union. Read it in full; it is 63 lines.
- `web/src/plugins/registry.ts` - enable/disable, ordering by `requires`, the strip rebuild.
- `web/src/frame/panels.ts` - **the panel contract**: `PanelView`, and the open/close/switch code
  that decides when your `unmount()` runs. 50 lines; read `open`, `close` and `toggle`.
- An existing plugin as the model: `web/src/plugins/builtin/xpTracker.ts` for a panel with settings,
  `statusHud.ts` for a canvas overlay, `notes.ts` for the smallest possible one.
- The **`idlescape-design` skill** before you write any markup or CSS. It is not optional; it owns
  the class families, the tokens and the styleguide rule.
- `docs/OPERATIONS.md` for the stack, if you need to see the plugin in a browser.

## Rules that are not negotiable

- **Compose the library; do not extend it locally.** A new panel uses the existing class families
  and tokens in `web/src/styles/`. If a surface genuinely needs something the library lacks, add it
  to the library **and** to `web/styleguide.html` in the same change, never as a per-panel one-off
  style.
- **Plugin ids are kebab-case and stable.** They appear in Firestore paths and in `localStorage`
  keys under `cs.plugin.<scope>.<id>`, one bucket per principal (`web/src/storage/scoped.ts`).
  Renaming one silently resets that plugin's state for every user.
- **Panel ids are pinned** in `web/src/types.ts` (`PanelId`). Adding a panel adds an id there; it is
  persisted under `cs.panel`, so an id is a data contract, not a label.
- **`localStorage` keys keep the `cs.` prefix.** `ctx.storage` namespaces per plugin for you; use it
  rather than reaching for `localStorage` directly.
- **No React.** Vite plus vanilla TypeScript, `h()` from `web/src/ui/el.ts` or an `innerHTML`
  template, token-driven plain CSS.
- **Files under 400 lines**, test file included. Split rather than trim the comments.
- **`panel(ctx)` returns a `PanelView`** (`web/src/frame/panels.ts:3`):
  `{ title: string; mount(body: HTMLElement): void; unmount?(): void }`. `mount` is handed the
  panel body element; it is emptied for you before every `mount` and after every `unmount`.
- **`unmount()` is the panel's teardown, and it runs far more often than `onDisable`.** It fires on
  **every panel switch** and on **close** (`panels.ts:18-38`, both the `close()` and the `open()`
  path call the outgoing view's `unmount`), and again on deactivate (`registry.ts:53-64`). A panel
  that clears its interval only in `onDisable` keeps painting into a detached body the moment the
  player opens another panel: the plugin is still enabled, so `onDisable` never ran. Clear
  intervals and call the unsubscribe that `client.on()` returned (`clientTypes.ts:112`) inside
  `unmount()`; keep in `onDisable` only what outlives the panel.
- **`ctx.client()` is the ACTIVE character's hooks** (`web/src/main.ts:165`:
  `stage.sessions.active()?.hooks ?? null`). It is `null` before any client has started and it is a
  **different object** after a character-tab switch, so resolve it on every read and never capture
  it at enable time. `builtin/statusHud.ts:50-59` is the pattern to copy: a `tick()` closure that
  calls `ctx.client()?.getState()` afresh each time, driven by `setInterval`.
- **`onTick` is dead. Do not implement it.** `ShellPlugin.onTick` (`types.ts:57`) and
  `registry.onTick` (`registry.ts:123`) both exist, and **nothing in production calls
  `registry.onTick`** - its only other reference in the tree is a `vi.fn()` mock in
  `pluginsPanel.test.ts`. A panel driven from `onTick` never updates. Poll on an interval, or
  subscribe to a hook event through `ctx.client()`.
- **`onDisable` must actually dispose.** A `dispose()` that only unsubscribes is not enough when the
  module also schedules async work: disposal has to fence what is already in flight. Five lifecycle
  leaks shipped in SP8b, four of them invisible to tests that looked like they covered the case.
- **The design rules a panel must keep** are the `idlescape-design` skill's, and it is the
  authority: the single orange focus ring `0 0 0 3px rgba(255,152,31,.18)`, all motion off under
  `prefers-reduced-motion`, and lowercase "idlescape" in any prose the panel shows.
- **The client tier is dormant** (decision D18). Do not write a `tier: 'client'` manifest for this
  sprint; the frame capability behind it (`_fireBeforeDraw`/`_fireAfterDraw`) is a known stub.
- **Shell v2 has landed** (sprint entry 4). The `.p-*` class dialect is gone from the stylesheets
  and from every panel that emitted it, Tasks is Automation, Characters is merged into Account and
  permanently aliased in `PANEL_ALIASES`, and `PanelId` in `web/src/types.ts` is twelve ids. Compose
  from `web/src/styles/`'s ten component families and the builders in `web/src/ui/`; a per-panel
  one-off style has nowhere to live, and `styles/styles.test.ts` is what says so.

## Working modes

### A new shell plugin

1. Create `web/src/plugins/builtin/<name>.ts` exporting a `definePlugin({...})`.
2. Manifest: `id` (kebab-case), `name`, `icon`, `tier: 'shell'`, `description`, and optionally
   `settings`, `defaultEnabled`, `alwaysOn`, `requires`.
3. Implement what you need of `onEnable(ctx)`, `onDisable()`, `panel(ctx)` and `overlay(ctx)`.
   **Not `onTick`** - see the rules above; nothing calls it. Everything the plugin may touch
   arrives in `ctx`; do not import from the frame.
4. If it has a panel, add its id to `PanelId` in `web/src/types.ts`.
5. Register it in `web/src/main.ts` beside the others.
6. Add its component demo to `web/styleguide.html` if it introduced anything to the library.

### A settings schema

`SettingField` is a closed union: `boolean`, `number`, `select`, `color`, `text`, each with a
`label` and a `default`. `settingsForm.ts` renders them; `settings.ts` persists them to Firestore
with a `localStorage` mirror and an 800 ms debounce, flushed on `pagehide`. Use per-control
listeners rather than form-level delegation: tests dispatch non-bubbling `new Event(...)`, and a
delegated listener never fires for them (SP2a ruling).

### Reading the game clock

There are three things called "tick" in the shell and only one of them is the server tick. Picking
the wrong one is how a panel ends up updating fifty times a second, or never.

| What you want | Where it is | Rate |
|---|---|---|
| **The server tick** | `ctx.client()!.getWorldState().tick` (`clientTypes.ts:103`, the field is `BotWorldState.tick`), or the payload of the **`state`** hook event, which fires once per `PLAYER_INFO` (`clientTypes.ts:69-70`) | one per **600 ms** server tick |
| The client's render cycle | the **`tick`** hook event, `{ cycle }` (`clientTypes.ts:68`), emitted from the client mainloop (`Client.ts:3524-3526`) | one per `deltime`, **~20 ms** |
| Nothing | `getState()` returns `ClientState` (`clientTypes.ts:36-53`), which has **no tick field at all** | n/a |

So: subscribe to `state` (or poll `getWorldState().tick`) for anything measured in game ticks, and
never to `tick` unless you genuinely want a per-frame callback. Resolve `ctx.client()` on each read,
and unsubscribe in `unmount()`.

### A canvas overlay

`overlay(ctx)` returns an absolutely-positioned element rendered over the canvas while enabled. The
overlay host is `pointer-events: none`; anything interactive inside it must opt back in, or its
clicks fall through to the game.

## Verification

From `web/`:

```powershell
npm run typecheck
npm run lint
npm test -- src/plugins            # registry, settings, settingsForm, pluginsPanel, and builtin/
```

The lifecycle tests are the bar. `web/src/plugins/registry.test.ts` covers enable, disable,
`requires` ordering, and the uid change that must deactivate everything before reloading; your
plugin needs its own `builtin/<name>.test.ts` beside it. Two teardowns, not one:

- **`unmount()` while still enabled** - the panel-switch case, which is the common one. Mount the
  view, call `unmount()`, then assert that no callback fires and nothing is written afterwards.
- **`onDisable()`** - the same assertion for whatever outlives the panel.

Assert that no callback fires and no state is written after disposal, not merely that no timer
remains. A `ctx.client()` that returns a different object on the second call is worth faking too:
that is what a character-tab switch does.

Then the browser check, from `web/` with the stack up:

```powershell
npx playwright test e2e/plugins.pw.test.ts
```

**The styleguide completeness rule** exists, as of sprint entry 4, and it runs in the web vitest
suite: `web/src/styleguide.families.test.ts` fails when a family stylesheet has no styleguide
section or defines a class no demo on the page draws, and `web/src/styles/styles.test.ts` fails
when a per-surface file restyles a library class, at the head of a selector or as a descendant.
`web/src/styles/tokens.test.ts` adds the palette half: a colour token with no swatch on `#colour`,
and a legacy `--rl-*` triplet no stylesheet still calls, are both failures. So a component you add
without a styleguide entry is a red test, not a review note. Open `/styleguide` (served by
the front server) anyway to see it drawn: the page is the thing the next author copies from.
