# Shell v2: the code as it stands

Read at commit `19607b11dc7aead32aa7762f968bfb7fb7339656` (branch `sprint/dragon-slayer`).
**HEAD moved during this read**: it is `274f14973d9bacfabbf034e4a5f4d3cea5a9b8d6`
("refactor(tasks): split the run recorder and the view tests out of two files at the ceiling") by
the time the file was written. That commit touched `web/src/tasks/api.ts` (extracting
`web/src/tasks/runRecorder.ts`), `web/src/plugins/builtin/tasks.test.ts` and a new
`web/src/plugins/builtin/tasksViews.test.ts`. Every `api.ts` line number below has been
re-verified at the new HEAD; nothing else this map cites changed. SP4b is still implementing
sprint entry 1 in this tree, so every file marked MOVING may change again before the plan is
written. See "Moving targets" at the end.

All paths are relative to the repository root. Line numbers are at the commit above.

---

## 1. The plugin manifest type and registration

### web/src/plugins/types.ts (63 lines)

- `SettingField` union, lines 4-9: `boolean | number | select | color | text`. `color` is
  declared and rendered (`settingsForm.ts:104`) but no builtin manifest uses it.
- `PluginManifest`, lines 15-29: `id`, `name`, `icon`, `tier: 'shell' | 'client'`, `description`,
  `settings?`, `defaultEnabled?`, `alwaysOn?`, `requires?`. There is **no** `panel`/`overlay`
  field on the manifest: those are methods on `ShellPlugin` (lines 49-58), and the strip is
  derived from `plugins.get(id).panel` being present, not from a manifest flag.
- `PluginContext`, lines 32-47: `client()`, `settings.{get,set,subscribe}`, `storage.{get,set}`,
  `notify`, `openPanel`, `user()`.
- `ShellPlugin`, lines 49-58: `manifest`, `onEnable?`, `onDisable?`, `panel?(ctx): PanelView`,
  `overlay?(ctx): HTMLElement`, `onTick?`.
- `definePlugin(p)`, lines 61-63: identity helper.

### web/src/plugins/registry.ts (125 lines)

- `RegistryDeps` lines 5-12; `ShellPluginRegistry` interface lines 14-25.
- `emitStrip()` lines 36-38: **the strip's source of truth** -
  `order.filter(id => enabled.has(id) && plugins.get(id)!.panel).map(manifest)`. Registration
  order is strip order; a plugin with no `panel()` never gets a button.
- `activate` lines 40-51: shell tier builds the `PanelView` **once**, at enable time, and caches
  it in `panels`. Client tier is fanned out to every frame instead.
- `deactivate` lines 53-64: calls `panels.get(id)?.unmount?.()` then drops the view.
- `defaultEnabled` lines 66-71: `alwaysOn` wins, then the stored doc, then `manifest.defaultEnabled`.
- `init()` lines 79-94: deactivates everything, `store.load(uid)`, then a `requires`-first
  topological enable, then one `emitStrip()`.
- `enable`/`disable` lines 96-113: `disable` refuses `alwaysOn` and refuses if another enabled
  plugin `requires` it.
- `panelFor(id)` line 121, `overlaysFor()` line 122.

### web/src/main.ts (358 lines) - the composition root

Order of `shell.register(...)` calls, which is the strip order today:

| # | line | id | name | icon | panel | overlay | defaultEnabled | alwaysOn | settings |
|---|------|----|------|------|-------|---------|----------------|----------|----------|
| 1 | 196 | `xp` | XP Tracker | ✚ | yes | - | true | - | `showToNext` |
| 2 | 197 | `loot` | Loot Tracker | 💰 | yes | - | true | - | - |
| 3 | 198 | `notes` | Notes | 📝 | yes | - | - | - | - |
| 4 | 199 | `screenshot` | Screenshot | 📸 | yes | - | - | - | - |
| 5 | 200 | `status-hud` | Status HUD | ❤ | **no** | yes | - | - | `showBoosts` |
| 6 | 202 | `tasks` | Tasks | ▶ | yes | - | true | - | 5 fields |
| 7 | 203 | `marketplace` | Marketplace | ⚑ | yes | - | true | - | - |
| 8 | 222 | `bank` | Bank | 🏦 | yes | - | true | - | - |
| 9 | 223 | `connect` | Claude | ✦ | yes | - | - | true | - |
| 10 | 224 | `characters` | Characters | 👥 | yes | - | - | true | - |
| 11 | 238 | `account` | Account | ☺ | yes | - | - | true | - |
| 12 | 239 | `config` | Configuration | ⚙ | yes | - | - | true | - |
| 13 | 240 | `plugins` | Plugins | 🧩 | yes | - | - | true | - |

Manifest declaration sites: `builtin/xpTracker.ts:42-47`, `builtin/lootTracker.ts:39-43`,
`builtin/notes.ts:21-24`, `builtin/screenshot.ts:57-60`, `builtin/statusHud.ts:40-44`,
`builtin/tasks.ts:324-360`, `builtin/marketplace.ts:158-161`, `builtin/bank.ts:24-28`,
`builtin/characters.ts:28`. The four panels registered through the `asPlugin()` adapter
(`main.ts:193-195`) - `connect`, `account`, `config` - build their manifest inline at the
register call. `plugins` is an inline `definePlugin` at `main.ts:240`.

`status-hud` is the only plugin with an `overlay()` and no `panel()`, so it has **no strip
button**; its element goes into `#plugin-overlays` via `rebuildStrip` line 256.

Other main.ts anchors the plan will need:
- `panelCtl = createPluginRegistry({...})` line 56 (wires `#icon-strip`, `#side-panel`,
  `#panel-title`, `#panel-body`, `onChange`).
- `stripA11y = applyTabListA11y(byId('icon-strip'))` line 57.
- `byId('panel-back')` close wiring line 59.
- `onPanelChange(open)` lines 62-65: mirrors the open panel's icon into `#panel-icon` and calls
  `stripA11y.syncSelected()`.
- `contextFor(id)` lines 162-179; note `settings.subscribe` is a **no-op stub** (line 169).
- `rebuildStrip(enabledPanels)` lines 243-259 (below).
- The footer fps interval, lines 262-265, writing `#foot-right` once a second.
- `enterFrame` lines 268-300, which writes `#foot-left` (line 291) and calls `panelCtl.restore()`.

### web/src/types.ts

`PanelId` (line 5) is a closed union:
`'xp' | 'loot' | 'connect' | 'account' | 'config' | 'plugins' | 'characters' | 'tasks' |
'marketplace' | 'bank'`. Deleting the `characters` panel id (per the entry's constraints) touches
this line, `stage.ts:140` (`deps.openPanel('characters')` from the "+ New character" tab) and
`main.ts:298` / `main.ts:286` (`panelCtl.open('account')`), which are the only literal uses.

---

## 2. The strip

### web/src/main.ts `rebuildStrip`, lines 243-259

```
243  function rebuildStrip(enabledPanels: PluginManifest[]): void {
244    const strip = byId('icon-strip');
245    const openNow = panelCtl.current();
246    strip.replaceChildren();
247    for (const m of enabledPanels) {
248      const pv = shell.panelFor(m.id);
249      if (pv) panelCtl.register({ id: m.id as PanelId, ... }, pv);
250      const btn = document.createElement('button');
252      btn.className = m.id === 'config' ? 'strip-btn strip-gear' : 'strip-btn';
252      btn.dataset.panel = m.id; btn.title = m.name; btn.textContent = m.icon;
253      strip.appendChild(btn);
255    stripA11y.syncSelected();
256    pluginOverlayHost.replaceChildren(...shell.overlaysFor());
257    if (openNow && enabledPanels.some(...)) panelCtl.open(openNow);
258    runBanner.update(tasksRouter.api.status());
```

Facts that matter: the whole strip is destroyed and rebuilt on every registry change (so the
run banner's dot has to be repainted, line 258, and is looked up fresh every time); the button
is a raw `document.createElement` (not `h()`); `strip-gear` is the only per-id class, and it is
what pushes Configuration to the bottom via `margin-top: auto` (`frame.css:45`).

### web/src/ui/strip.ts (43 lines) - `applyTabListA11y(strip)`

- Sets `role="tablist"` + `aria-orientation="vertical"` on the strip (lines 8-9 of the file body,
  i.e. `strip.ts:8-9`).
- `tabs()` = `strip.querySelectorAll('[data-panel]')`.
- `syncSelected()` lines 14-25: sets `role="tab"`, mirrors `.active` into `aria-selected`, roving
  `tabIndex` (0 for active, -1 otherwise), and **moves `title` into `data-tip` + `aria-label`**
  (line 20) so the CSS tooltip at `frame.css:46` can render it. If no tab is selected, the first
  gets `tabIndex = 0` (lines 23-24).
- Keydown handler lines 27-39: Down/Right, Up/Left (wrapping), Home, End. **Focus only** - it does
  not activate a panel. Activation is the click handler in `frame/panels.ts`.
- Called once at `main.ts:57` and again by the styleguide (`styleguide.ts:35`).

### The corner dot

There is no "corner dot" in the strip itself. The only dot the strip carries is the run status
dot the run banner injects into the Tasks button:

- Painted by `frame/runBanner.ts:131-141` `paintDot(tone)`: finds
  `strip.querySelector('[data-panel="tasks"]')`, appends a
  `<span class="strip-dot dot ..." aria-hidden="true">`, class is `strip-dot dot dot-accent
  dot-live` while running, `strip-dot dot dot-{warn|error}` otherwise, and removed when the tone
  is null.
- CSS: `styles/tasks.css:101-103` (`.dot-accent`, `.strip-btn { position: relative }`,
  `.strip-dot { position: absolute; right: 3px; top: 3px; width: 7px; height: 7px; }`) plus the
  reduced-motion rule at `tasks.css:105-107`. Base `.dot*` classes live in `styles/data.css:38-44`.

---

## 3. The side panel host and the `cs.panel` resolver

### web/src/frame/panels.ts (64 lines) - the whole panel host

- `PanelView` (line 3): `{ title; mount(body); unmount?() }`. `PluginManifest` here (line 4) is a
  **second, narrower manifest type** than `plugins/types.ts`'s - `{ id: PanelId; name; icon;
  tier: 'shell' }` - and `rebuildStrip` adapts between them at `main.ts:249`.
- `const STORAGE_KEY = 'cs.panel'` line 5. **This is the resolver.**
- `setActive(id)` lines 11-15: toggles `.active` on every `[data-panel]`.
- `close()` lines 17-25: `unmount()` the current view, empty `#panel-body`, add `.hidden` to
  `#side-panel`, `localStorage.removeItem('cs.panel')`, `onChange(null)`.
- `open(id)` lines 27-40: **returns silently when `views.get(id)` is missing** (line 29) - this is
  where the permanent `characters -> account` fallback has to go. Then `unmount()` the old view,
  empty the body, set `#panel-title`, `view.mount(body)`, unhide, `setActive`,
  `localStorage.setItem('cs.panel', id)`, `onChange(id)`.
- Click delegation lines 42-45, on the strip element, `closest('[data-panel]')` -> `toggle`.
- `toggle` line 47: same id closes, else opens.
- `register(manifest, view)` lines 52-56: replaces an existing entry by id.
- `restore()` lines 57-61: reads `cs.panel`, and **only opens if `views.has(saved)`** - so a
  stored `characters` today silently opens nothing. Called from `main.ts:292` (`enterFrame`) and
  `stage.ts:269` (after every `selectCharacter`).

Mount/unmount lifecycle in one sentence: the `PanelView` object is created once per plugin enable
(`registry.ts:47`) and its `mount(body)`/`unmount()` pair is called on **every** open/close, so
panel state that must survive a re-open lives in the view closure, and timers must be released in
`unmount()` (all of `xpTracker.ts:37`, `lootTracker.ts:84`, `tasks.ts` unmount block,
`marketplace.ts` unmount, `bank.ts:177-182`, `connect.ts`, `pluginsPanel.ts:71` do this).

### aria-live

`web/src/partials/frame.html:23`: `<aside id="side-panel" class="side-panel hidden"
aria-live="polite">`. The whole panel is one polite live region. Other live regions in the frame:
`#run-banner` is `role="status"` (frame.html:12), the toast host is `role="status"
aria-live="polite"` (`ui/toast.ts:17`), `#offline-card` is `role="status"` (frame.html:18), and
the bank window has `#bank-status` `role="status" aria-live="polite"` (`bank/view.ts:89`) and
`#bank-error` `role="alert"` (`bank/view.ts:88`).

### The frame markup (web/src/partials/frame.html, 39 lines)

`index.html` is 21 lines and is nothing but four `<!-- @include -->` markers (lines 15-18)
resolved by the Vite plugin; the real frame DOM is this partial:

| line | element |
|------|---------|
| 2-5 | `header.frame-title` with `.title-left` (brand + Wiki link) and `#title-centre` |
| 6 | `nav#character-tabs.char-tabs` |
| 8 | `div#stage.stage` |
| 9 | `div#canvas-wrap.canvas-wrap` |
| 11 | `div#client-frames.client-frames` (one iframe per character) |
| 12 | `div#run-banner.run-banner.hidden role="status"` |
| 13 | `div#overlays.overlays` |
| 14 | `div#plugin-overlays.plugin-overlays` |
| 16 | `div#bank-host.bank-host` |
| 17 | `div#toasts` |
| 18-21 | `div#offline-card.offline.hidden role="status"` with `#offline-count` |
| 23-30 | `aside#side-panel` -> `.panel-header` (`#panel-icon`, `#panel-title`, `#panel-back`) and `#panel-body` |
| 32 | `nav#icon-strip.icon-strip aria-label="Panels"` |
| 35-38 | `footer.frame-foot` with `#foot-left` and `#foot-right.num` |

Note the strip is a `<nav aria-label="Panels">` in the markup and is then given `role="tablist"`
by `applyTabListA11y`, which overrides the landmark role.

---

## 4. web/src/ui/ - the builders

### el.ts (51 lines)

- `h(tag, attrs, ...children)` lines 11-24. `on*` keys become listeners (`key.slice(2)`, line 15),
  `true` sets a bare attribute, `null`/`undefined`/`false` are skipped for both attrs and
  children, strings become text nodes. Typed over `HTMLElementTagNameMap`.
- `kv(label, value, { id, num })` lines 27-32 -> `.kv > .kv-label + .kv-value[.num]`.
- `badge(text, tone)` lines 35-37 -> `.badge` / `.badge-{ok,warn,error,info,accent}`.
- `alert(body, { tone, title })` lines 40-46 -> `.alert` / `.alert-*`, `role="alert"` for the
  error tone and `role="status"` otherwise.
- `empty(text, title?)` lines 49-51 -> `.empty` + optional `.empty-title`.

That is the whole builder set. There is no `card`, `section`, `switch`, `field` or `table`
builder; `section()` is a private helper inside `builtin/tasks.ts:57-59`.

### toast.ts (39 lines)

`createToastHost(root, { setTimeout? })` lines 17-38. Appends `.toast-host[role=status]
[aria-live=polite]`; `show(message, tone = 'neutral', durationMs = 3500)` returns an early
dismiss; caps at `MAX_VISIBLE = 3` (line 33); leave animation is 160 ms (`LEAVE_MS`, line 12).
Tones: `neutral | ok | error | info`. Instantiated once at `main.ts:58` over `#toasts`.

### dialog.ts (49 lines)

`confirmDialog(opts, root = document.body)`. Falls back to `window.confirm` where `showModal` is
missing (lines 20-24, which is the jsdom path in unit tests). Builds `dialog.dlg` with
`.dlg-title`, `.dlg-body`, `.dlg-actions`; Escape and backdrop click both cancel (lines 43-44);
focus goes to Cancel for a danger dialog and Confirm otherwise (line 47).

### strip.ts - see section 2.

---

## 5. The frame

### frame/stage.ts (331 lines) - MOVING (SP4b touches nothing here directly, but see §12)

`createStage(deps)` owns one `/play.html` iframe per character.

- `StageDeps` lines 26-50; `Stage` interface lines 52-84.
- `NO_CHARACTER = ' none'` line 87: the sentinel tracker key when nothing is active, so the XP and
  loot panels always have a source.
- `canvasOf(session)` lines 89-91 - reaches into `session.iframe.contentDocument#canvas`.
- `pluginsOf(session)` lines 93-95 - `frameWindow(session)?.idlescape?.plugins`.
- Per-character maps: `xpByCharacter` 99, `lootByCharacter` 100, `tasksBySession` 105,
  `unwireBySession` 107, `unescapeBySession` 109.
- `tabs = createCharacterTabs(...)` lines 138-141; `onNew` opens the `characters` panel (line 140).
- `sessions = makeSessions({ onReady, onChange })` lines 143-181. `onReady` (146-175) wires the
  session, builds the per-frame `TasksApi` and `deps.tasks.attach(session.id, api)` (line 170),
  syncs client plugins, and installs the Escape forwarder.
- **The iframe Esc re-dispatch**: `forwardEscape(session)` lines 195-206. It adds a `keydown`
  listener on `session.iframe.contentDocument` and, for `Escape`, calls
  `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))` on the
  **parent** document (line 202). Disposer stored in `unescapeBySession`, released in `close`
  (lines 283-284). This is the contract the entry says must not change.
- `syncChrome(session)` lines 219-238: writes `#title-centre` (`osrs.scotho.com · world 1 ·
  {name}` when online, else empty) and the overlay status line, per session state (lines 229-235),
  and the XP overlay line from the tracker's top row (236-237).
- `layout()` lines 240-246: `reserved = 32 + (panelOpen && stage.clientWidth > 1100 ? 210 : 0) +
  16` - **the strip width (32) and the panel width (210) are hardcoded here** and duplicate
  `--strip-w` / `--panel-w` in `tokens.css`.
- `close(characterId)` lines 280-294 and `closeAll()` 315-321.

### frame/characterTabs.ts (138 lines)

- `TAB_SLOTS = 3` (line 11), `NEW_CHARACTER_LABEL`, `GUEST_LOCK_TOOLTIP`, `MORE_LABEL = 'Add
  more'`, `COMING_SOON = 'coming soon'` lines 12-15.
- `TabSlot` union lines 17-21: `character | empty | locked | more`.
- `computeSlots(input)` lines 31-53 - pure, sorted by `createdAt`.
- `slotHtml(slot)` lines 68-91 - **innerHTML template strings**, with `attr()` (lines 64-66) doing
  attribute-safe escaping on top of `escapeHtml`.
- `createCharacterTabs(root, deps)` lines 93-138: sets `role="tablist"`,
  `aria-orientation="horizontal"`, `aria-label="Characters"` (94-96); click delegation 100-106;
  arrow/Home/End keydown over the **real tabs only** 110-122; `render()` 125-136 assigns the
  roving tabindex.
- Status dot classes: `.char-tab-dot.connecting` / `.online` in `styles/tabs.css:11-13`.

### frame/overlays.ts (23 lines)

`createOverlays(root)` writes `<div class="ov ov-xp hidden">`, `<div class="ov ov-status muted">`,
`<div class="ov ov-boxes">` by innerHTML (line 2) and exposes `setXpLine`, `setStatus(text,
tone)`, `setInfoBoxes(items)`, `setHidden`. Styles in `styles/overlays.css` (34 lines).

### frame/runBanner.ts (251 lines) - MOVING (SP4b Task 10)

- Deps lines 14-24 (`root`, `strip()`, `api()`, `openTasks()`, `notify`, `now?`).
- `LINGER_MS = 4000` line 34, `TICK_MS = 1000` line 36,
  `SETTLED = new Set(['done','failed','stopped'])` line 37, `ANNOUNCE_MEMORY = 32` line 39.
- `mmss` 41-46; `message(s)` 49-62 (the prose line); `secondsToResume` 65-68;
  `signature(s, counting)` 74-76 (what the live region actually reads, deliberately excluding the
  clock and the countdown); `tone(s)` 78-83 -> `'accent' | 'warn' | 'error' | null`.
- Elements: `dot` 104, `elapsedEl` 108 and `countdownEl` 109 (both `aria-hidden`, because
  `#run-banner` is an atomic live region), `line` 112 (a real `<button>` that opens Tasks),
  `pauseBtn`/`resumeBtn`/`stopBtn` 125-127, all appended at line 128.
- `paintDot` 131-141 - see §2.
- `parts(s, counting)` 143-153 - script, task, message, countdown, elapsed, and the `✦`
  "Claude is attached" mark at line 151.
- `paint()` 160-193 - visibility, the three `is-*` classes, the `signature` diff at 176 that keeps
  the DOM stable between ticks, and the per-state show/hide of the three buttons 187-191.
- `tick(on)` 196-199 - one interval for the whole banner.
- **The toasts**: `announce(s)` 201-208 - stuck, hard-stop, done, stopped, failed. The dedupe set
  `announced` (97) is keyed `runId:state:reason` and only terminal outcomes go in (update block
  221-235), because the router re-publishes the same terminal status on every tab switch.
- **Escape**: `onKey` 210-214, registered on `document` at 215. It fires only when
  `last?.state === 'running'` and only ever calls `api.pause('player')`. `dispose()` 238-249
  removes it.

### The footer and title bar

The footer has no module: `#foot-left` is written once in `main.ts:291`, `#foot-right` by the
1 Hz interval at `main.ts:262-265`. The title bar's centre is written by `stage.syncChrome`
(`stage.ts:229`) and `sessions/wire.ts:92,97`. Styles: `styles/frame.css:4-17` (title),
`:49-52` (footer).

---

## 6. The session manager (G3: where a per-character session-start stamp attaches)

### web/src/sessions/types.ts (51 lines)

- `SessionState = 'booting' | 'title' | 'connecting' | 'online' | 'offline'` (line 9).
- `SessionStatus = 'offline' | 'connecting' | 'online'` (line 11) - what the UI shows.
- `CharacterSession` lines 13-22 - **already carries `startedAt: number` and
  `lastStateAt: number`**.
- `deriveSessionState(i)` lines 39-45 - the single place the five states come from.
- `displayStatus(s)` lines 47-51.

### web/src/sessions/manager.ts (296 lines)

- Constants lines 12-20 (`READY_TIMEOUT_MESSAGE`, `SESSION_CLOSED_MESSAGE`,
  `LOGIN_IN_PROGRESS_MESSAGE`, `PLAY_URL`, poll intervals).
- `Entry` lines 53-60 (`session`, `pendingLogin`, `disconnected`, `cancelled`, `unsubscribe`).
- `refresh(entry)` lines 98-109 - **sets `entry.session.lastStateAt = now()` on every state move**.
- `poll = setInterval(refreshAll, pollMs)` line 117 (1 s default).
- `waitForHooks` 123-135; `subscribe(entry, hooks)` 137-144 (login/logout/disconnect).
- **`openInner`** 164-200 is the attach point: the session object is built at 168-171 with
  `startedAt: now()`, the iframe is appended at 174, credentials are minted and armed at 182-184,
  `hooks.setAttended(true)` at 189, and `deps.onReady(session)` fires at 197.
- `login(characterId)` 258-275 - the only place `pendingLogin` is set, and therefore the natural
  place to stamp "this character's play session started" if the stamp must mean *logged in* rather
  than *iframe booted*. `startedAt` today means the latter.
- `close` 277-283, `drop` 158-162, `remove` 147-155, `dispose` 290-294 - the detach points.

`sessions/wire.ts` (53-105 in the concatenated read; the file is 105 lines) is where the hooks are
subscribed per character: `xp` (82-87), `inventory` (88), `login` (89-93), `logout` (94-98),
`disconnect` (99-102), and the returned disposer (104). Only the active session writes shared
chrome (`deps.isActive(id)` guards).

---

## 7. The XP and loot trackers, and how they sample

### web/src/stats/xp.ts (29 lines)

`createXpTracker()`. One `Track { baseline, latest, level, firstAt, lastDelta }` per skill id, all
in memory. `onXp(ev, now)` lines 9-14: the **first** event for a skill sets the baseline (so the
first xp drop of a session is never counted). `rows(now)` lines 15-26: `gained = latest -
baseline`, skips non-positive, `perHour = gained / hours` where `hours = max(now - firstAt, 1) /
3.6e6`, `toNext = xpForLevel(level+1) - latest` (null at 99), `actionsToNext = ceil(toNext /
lastDelta)`. Sorted by `gained` desc. `reset()` clears.

### web/src/stats/loot.ts (15 lines)

`createLootLog()`. `Map<objId, { id, count, firstSeen }>`; `onInventory(ev, now)` adds only
`ev.added`. Removals are ignored, so it is a gain log, not a delta.

**Sampling**: neither tracker polls. They are fed by the hook subscriptions in `sessions/wire.ts`
(`xp` -> `tracker.onXp`, `inventory` -> `loot.onInventory`). The *panels* poll:
`builtin/xpTracker.ts` re-renders every `REFRESH_MS = 5000` (line 7, timer at 35, cleared at 37),
`builtin/lootTracker.ts` every `REFRESH_MS = 2000` (line 7, timer 82, cleared 84). Both panels
rebuild `body.innerHTML` wholesale on every tick (xpTracker 17/21-26, lootTracker 66/69-73) using
`.p-table`, `.p-value`, `.p-label`, `.p-btn`, `.p-empty` - so a redesign of those two panels is a
full rewrite, not a restyle. The loot panel resolves names through `ctx.client()?.getObjName(id)`
(lootTracker line 71), which is null with no session, falling back to `#id`.

---

## 8. Every place that could feed an event (G-series "events" feed)

The client hook surface is `web/src/clientTypes.ts:61-73` (`HookEvents`) and `:86-113`
(`ClientHooks`). Events available: `login {gameName}`, `logout`, `disconnect {code}`,
`xp {skill,xp,level,delta}`, `inventory {added,removed}`, `chat {kind,sender,text}`,
`tick {cycle}`, `state {tick}`, `action {id,action,result}`.

Candidate feeds, with where they already exist:

1. **Level-ups from client state.** There is no `levelup` hook. Two existing derivations:
   `XpEvent.level` is on every xp event (`clientTypes.ts:55`), and the xp tracker keeps
   `t.level` (`stats/xp.ts:12`). The run-health layer detects one from chat text:
   `web/src/tasks/health.ts:11` `LEVEL_UP_RE = /you just advanced|congratulations.*\blevel\b/i`,
   consumed at `health.ts:133` (`if (isLevelUp(s)) return 'level-up'`). So a level-up event can be
   sourced either from `hooks.on('xp')` (delta in `ev.level` against the tracker's last known
   level) or from the health condition `'level-up'`.
2. **Task runner run start / end / fail.** `TasksApi.onStatus` (`tasks/api.ts:340`) and
   `onEvent`/trace. The authoritative markers are the trace kinds `run_started` and `run_done`
   (`tasks/types.ts` TraceEvent union) and the `RunState` transitions. The banner already
   consumes exactly these at `runBanner.ts:218-236`. The router re-publishes on tab change
   (`tasks/router.ts:169-175`), which is why the banner needs the `announced` dedupe.
3. **Agent transport pairing states.** `panels/connectCard.ts` is the state machine:
   `'Waiting for Claude…'` (line 122 in the file body, set in `start()`), `Expired` +
   "New link" (lines 90-99), `Paired as {label}` (`onSnapshotUpdate`, lines 103-110),
   and the mint failure `"Couldn't create a link."` (`MINT_ERROR_MESSAGE`, line 59) with a
   "Try again" button. `panels/connect.ts` holds the session list: a row is
   `dot-green dot-live` when `lastSeenAt` is within `SEEN_RECENTLY_MS = 60_000` (line 36),
   otherwise `dot-grey` + `Last seen …` (`renderSessions`, lines 148-168), plus the gateway status
   `up | down | not deployed yet` (`gatewayText`, lines 71-75) polled every `HEALTH_POLL_MS = 5000`.
4. **Owner bank change stream.** `web/src/bank/stream.ts` - `createBankStream` with
   `onVersion(version)` and `onHealth(healthy)`, `STREAM_PATH = '/api/bank/events'`,
   `WATCHDOG_MS = 40_000`, `BACKOFF_MS = [1000, 2000, 5000, 10000]`, `STABLE_MS = 30_000`
   (lines 21-26). The store surfaces it as `BankState.live` (rendered as `live | polling` in
   `builtin/bank.ts:161`).

Also worth knowing: `RunStatus.attached` is **hardcoded `false`** at `tasks/api.ts:133`
(`{ ...d.host.status(), attached: false }`) and in `IDLE_STATUS` (`api.ts:113-115`),
`workerHost.ts:76` and `api.harness.ts:23`. So the banner's `✦ Claude is attached` mark
(`runBanner.ts:151`) can never render today. Any event surface that wants "Claude attached" has to
fix that first.

---

## 9. The bank panel and window

### builtin/bank.ts (64 lines)

Manifest lines 24-28. The panel is a **handle**, not the bank: `mount` (171-176) subscribes to the
store, calls `deps.window().open()` and renders four `kv()` rows plus an `alert()` -
Used `n / capacity`, Tabs, Updates `live|polling`, an "Open bank window" `.p-btn.p-btn-primary`,
and the `NO_DEPOSIT` notice (line 20). `unmount` (177-182) unsubscribes and closes the window.
`main.ts:220` wires the window's own close back to `panelCtl.close()`.

### bank/view.ts (the window; composition point)

- `BANK_TITLE = 'The Bank of Gielinor'` (line 40).
- localStorage keys `cs.bank.mode` / `cs.bank.as` / `cs.bank.qty` (lines 42-44), read/written
  through the guarded `localStore()` (49-56).
- `#bank-capacity` is built at **`bank/view.ts:86`** (`h('span', { id: 'bank-capacity', class:
  'bank-capacity' })`), alongside `#bank-live` (87), `#bank-error` (88, `role="alert"`),
  `#bank-status` (89, `role="status" aria-live="polite"`) and `#bank-close` (90-93).
- Mounted into `#bank-host` (`main.ts:216`), which is inside `#canvas-wrap`
  (frame.html:16) - i.e. over the stage, **not** in the side panel.

### `[data-bank-slot]`

Declared once: `bank/grid.ts:35` `export const SLOT_ATTR = 'data-bank-slot'` (with
`data-bank-obj` 36 and `data-bank-divider` 37). Every selector in `grid.ts` and `gridInput.ts`
keys on the attribute rather than the `.bank-slot` class, deliberately, because a filtered tab's
inert filler cells carry the class but not the attribute (`grid.ts:98`, `gridInput.ts:107,207`).
The roving-tabindex anchor is `[data-bank-slot][tabindex="0"]` (`grid.ts:259`).

### The IconCache path (client patch 28)

`bank/icons.ts` (152 lines). `createIconCache({ client(): IconSource | null })` -
`IconSource = Pick<ClientHooks, 'getObjIcon'>` (line 14). Three layers: an in-memory `Map`
(`peek`, line 144, synchronous and safe in a repaint), IndexedDB (`ICON_DB =
'idlescape-icons'`, `ICON_STORE = 'icons'`, lines 27-28), then the live client's
`getObjIcon(obj, 1)` at line 119. `diskMisses` (line 69) memoises only the *database* half; a
client miss is never cached because it means "the model has not streamed yet".

**Is it reachable from the frame?** Yes, and only from the frame. It is constructed once in the
parent at `main.ts:209`:
`createIconCache({ client: () => stage.sessions.active()?.hooks ?? null })`. The rasterisation
itself happens inside the client iframe (`hooks.getObjIcon` crosses the same-origin boundary as an
ordinary method call on the iframe's `window.idlescape.client`), but the cache object, its
IndexedDB connection and every consumer (`grid.ts`, `tabsBar.ts`) live in the parent document. The
cache is a cross-window singleton - `view.ts`'s header comment calls this out - so a listener left
behind outlives the window that registered it, and `destroy()` must release both the grid's and
the tab bar's `icons.onChange` subscriptions.

---

## 10. The styleguide entry

- `web/styleguide.html` (490 lines). A standalone page, dark-only (`meta color-scheme`), pulling
  the real `/src/styles/index.css` (line 12) and the Pixelify Sans web font (line 11). Lines
  13-49 are a `<style>` block of styleguide-only chrome (`.sg`, `.sg-nav`, `.sg-demo`,
  `.sg-swatch`, `.sg-bank-frame`, `.sg-frame`, plus its own responsive rules) explicitly marked
  "nothing here is part of the design system".
- Sections: `#colour` (78), `#type` (114), `#space` (130), `#buttons` (148), `#forms` (174),
  `#data` (212), `#feedback` (270), `#sections` (294), `#bank` (313), `#frame` (365),
  `#panel` (405), `#home` (444), `#hud` (466). There is **no run-banner section** yet (SP4b Task
  10 step 4 adds one) and no tasks/trace section.
- `web/src/styleguide.ts` (57 lines) is the page's only script and is explicitly "not part of the
  app bundle" (line 1). It wires four demos: toasts (15-20, real `createToastHost`), the confirm
  dialog (22-30, real `confirmDialog`), the icon strip (33-42, **the real `applyTabListA11y`**),
  and a fake bank tab bar that mimics `tabsBar.ts`'s aria-selected behaviour (46-56).
- Build: `web/vite.config.ts:48` -
  `rollupOptions: { input: { main: index.html, play: play.html, styleguide: styleguide.html } }`.
  So the styleguide is a third page in the ordinary build and in `build:e2e`.
- Preview: `web/package.json:9` `"preview": "vite preview"` (memory note: use `vite preview` for
  screenshots, not the dev server).

---

## 11. web/src/styles/*

`wc -l`, and what each file owns:

| file | lines | owns |
|------|-------|------|
| `index.css` | 14 | the `@import` order only |
| `tokens.css` | 85 | every custom property (see below) |
| `base.css` | 43 | reset, `.hidden`, `.sr-only`, the single focus ring, scrollbars, `.muted/.p-muted`, `.pixel`, `.num`, `kbd`, reduced-motion |
| `layout.css` | 37 | `.stack*`, `.cluster`, `.spread`, `.grid-2`, `.grow`, `.divider`, `.card*`, `.section`/`.section-body` |
| `button.css` | 47 | `.btn` + variants and the `.p-btn*` aliases, `.link`, `.btn-row` |
| `forms.css` | 72 | `.input`, `.select`, `.switch`, `.field*`, `.p-input`, `.p-settings-form`, `.p-setting*`, `.p-error`, `.p-ok` |
| `data.css` | 126 | `.kv`/`.p-row`, `.table`/`.p-table`, `.empty`/`.p-empty`, `.badge*`, `.dot*`, `.alert`/`.p-msg`, `.session-row`, `.p-plugin-*`, `.p-shot-*`, `.p-notes` |
| `tasks.css` | 108 | `.run-card*`, `.task-row*`, `.params-form`, `.snippet-code`, `.trace*`, `.market-*`, `.run-banner*`, `.strip-dot` |
| `frame.css` | 72 | `.frame`, `.frame-title`, `.brand`, `.title-*`, `.stage`, `.canvas-wrap`, `.side-panel`, `.panel-*`, `.icon-strip`, `.strip-btn`, `.strip-gear`, `.frame-foot`, `.offline`, two responsive breakpoints (1100 px, 700 px) |
| `tabs.css` | 24 | `.char-tabs`, `.char-tab*`, `.char-tab-dot.{connecting,online}` |
| `overlays.css` | 34 | `.overlays`, `.ov`, `.ov-xp`, `.ov-status`, `.ov-boxes`, `.ov-box`, `.hud` |
| `dialog.css` | 8 | `.dlg`, `.dlg-title`, `.dlg-body`, `.dlg-actions` |
| `bank.css` | 268 | the whole bank window |
| **total** | **938** | (plus `styleguide.html`'s 37-line inline block) |

`index.css` imports `tasks.css` **twice** (lines 8 and 14). Harmless today because the file is
idempotent, but it is a real duplication a v2 pass should collapse.

Tokens in `tokens.css`: surfaces `--rl-border/window/darker/panel/hover/raised` (6-11), text
`--rl-muted/text/strong` (14-16), accent `--rl-orange` + `--rl-orange-deep` (19-20), semantic
`--rl-ok/warn/error/info/danger` (23-27), HUD `--rl-hp/prayer/run` (30-32), type
`--font-ui`, `--font-pixel`, `--fs-xs..2xl`, `--lh`, `--lh-tight` (35-44), spacing `--sp-1..6`
(47-52), shape `--radius`, `--radius-lg`, `--ctl-h`, `--ctl-h-sm`, `--ctl-h-lg` (55-59), frame
geometry `--panel-w: 210px`, `--strip-w: 32px`, `--title-h: 22px`, `--foot-h: 18px` (62-65),
motion `--dur-fast/base/slow`, `--ease` (68-71), layers `--z-overlay/panel/toast/dialog` (74-77),
`--focus-ring` (80). A `@media (pointer: coarse)` block (83-85) bumps the three control heights.

### The `.p-*` classes: every one, and where it is used

Thirty classes are defined. The `p-` prefix is a legacy "panel" namespace; `data.css` and
`button.css` define most of them as **aliases beside a newer unprefixed class**
(`.kv, .p-row`, `.table, .p-table`, `.empty, .p-empty`, `.alert, .p-msg`, `.btn, .p-btn`,
`.muted, .p-muted`), which is why `el.ts` emits the unprefixed names and the older
innerHTML panels emit the prefixed ones.

| class | defined | used by (non-test) |
|-------|---------|--------------------|
| `p-btn` | button.css:24 | panels/account.ts, panels/config.ts, panels/connect.ts, panels/connectCard.ts, builtin/bank.ts, builtin/characters.ts, builtin/lootTracker.ts, builtin/screenshot.ts, builtin/xpTracker.ts, plugins/pluginsPanel.ts, styleguide.html |
| `p-btn-primary` | button.css:25 | panels/account.ts, builtin/bank.ts, builtin/characters.ts, builtin/screenshot.ts, styleguide.html |
| `p-btn-danger` | button.css:26 | builtin/characters.ts, styleguide.html |
| `p-btn-icon` | button.css:29 | plugins/pluginsPanel.ts, styleguide.html |
| `p-link` | button.css | panels/connectCard.ts, styleguide.html |
| `p-input` | forms.css (+ data.css, tasks.css overrides) | panels/account.ts, panels/config.ts, panels/connectCard.ts, builtin/characters.ts, builtin/notes.ts, builtin/tasks.ts, builtin/tasksViews.ts, builtin/traceView.ts, plugins/pluginsPanel.ts, plugins/settingsForm.ts, styleguide.html |
| `p-row` | data.css:4 | panels/account.ts, panels/connect.ts, panels/connectCard.ts, builtin/characters.ts, styleguide.html |
| `p-row-stack` | data.css:9 | panels/connect.ts only |
| `p-label` | data.css:5 | panels/account.ts, panels/connect.ts, panels/connectCard.ts, builtin/characters.ts, builtin/lootTracker.ts, builtin/xpTracker.ts, styleguide.html |
| `p-value` | data.css:6 | same six files as `p-label`, plus styleguide.html |
| `p-table` | data.css:13 | builtin/lootTracker.ts, builtin/xpTracker.ts, styleguide.html |
| `p-empty` | data.css:27 | panels/connect.ts, builtin/characters.ts, builtin/lootTracker.ts, builtin/xpTracker.ts, styleguide.html |
| `p-msg` | data.css | panels/connectCard.ts, styleguide.html |
| `p-muted` | base.css:73, data.css | plugins/pluginsPanel.ts, styleguide.html |
| `p-error` | forms.css | panels/account.ts, panels/connect.ts, panels/connectCard.ts, builtin/characters.ts |
| `p-ok` | forms.css | **nothing** - dead CSS |
| `p-notes` | data.css | builtin/notes.ts only |
| `p-shot-strip`, `p-shot-thumb` | data.css | builtin/screenshot.ts only |
| `p-settings-form`, `p-setting`, `p-setting-label` | forms.css | plugins/settingsForm.ts, styleguide.html |
| `p-plugin-list`, `p-plugin-row`, `p-plugin-icon`, `p-plugin-main`, `p-plugin-name`, `p-plugin-desc`, `p-plugin-controls`, `p-plugin-settings` | data.css | plugins/pluginsPanel.ts, styleguide.html |

So the `p-*` surface is concentrated in exactly nine source files: `panels/account.ts`,
`panels/config.ts`, `panels/connect.ts`, `panels/connectCard.ts`, `builtin/characters.ts`,
`builtin/lootTracker.ts`, `builtin/xpTracker.ts`, `builtin/notes.ts`, `builtin/screenshot.ts`,
plus `plugins/pluginsPanel.ts` and `plugins/settingsForm.ts`. Every one of those builds DOM by
innerHTML template string (except `settingsForm.ts`, which uses `document.createElement`); none
of them uses `h()`. The files that already use `h()`/`kv()`/`badge()`/`alert()`/`empty()` -
`builtin/bank.ts`, `builtin/tasks.ts`, `builtin/tasksViews.ts`, `builtin/marketplace.ts`,
`builtin/traceView.ts`, `frame/runBanner.ts`, `ui/toast.ts`, `ui/dialog.ts`, all of `bank/` -
use the unprefixed classes only. That line is the cleanest available seam for a v2 conversion.

---

## 12. Every `cs.` localStorage key, with its reader and writer

| key | written | read | notes |
|-----|---------|------|-------|
| `cs.panel` | `frame/panels.ts:38` (`open`), removed at `:24` (`close`) | `frame/panels.ts:60` (`restore`) | The panel resolver. `restore()` only opens when `views.has(saved)`, so an unknown id today opens nothing rather than falling back. |
| `cs.size` | `main.ts:144` | `main.ts:50` | `SizeMode`, default `'auto'`. Read **unguarded** at module scope. |
| `cs.filter` | `main.ts:145` | `main.ts:51` | `'auto' \| 'pixelated'`. Also unguarded. |
| `cs.plugin.<id>` | `plugins/settings.ts:27` | `plugins/settings.ts:22`; enumerated at `:89-96` (`localStorage_snapshot`, prefix `cs.plugin.`) | Per-plugin `{ enabled, settings }` doc, mirroring Firestore. |
| `cs.pl.<pluginId>.<key>` | `main.ts:173` | `main.ts:172` | The `PluginContext.storage` namespace. No builtin uses it today. |
| `cs.<key>` (tasks shell settings) | `tasks/wire.ts:31` | `tasks/wire.ts:30` | A generic `cs.`-prefixed getter/setter handed to the tasks runtime; the concrete keys are chosen inside `tasks/settings.ts`. |
| `cs.bank.mode` | `bank/view.ts` `setMode` | `bank/view.ts` init | Key constant at `bank/view.ts:42`. |
| `cs.bank.as` | `bank/view.ts` `setWithdrawAs` | init | Constant at `:43`. |
| `cs.bank.qty` | `bank/view.ts` `setQuantity` | init via `readQuantity` (`:58-64`) | Constant at `:44`. |

Every access except `main.ts:50-51` is wrapped in try/catch (a private window with site data
blocked throws outright). The two unguarded reads in `main.ts` are a live bug for that case.

---

## 13. G8.1: the run state literals, the health ladder, and the pairing states

### `RunStatus` and its literals - `web/src/tasks/types.ts`

- `PauseReason = 'player' | 'claude' | 'human-input' | 'stuck' | 'hard-stop'` (line 239).
- `RunState = 'idle' | 'starting' | 'running' | 'paused' | 'done' | 'failed' | 'stopped'`
  (line 240).
- `Actor = 'player' | 'claude' | 'test' | 'runner'` (line 241).
- `RunOutcome = 'done' | 'failed' | 'stopped'` (line 226).
- `RunStatus` (lines 279-282): `{ state, reason, runId, scriptId, scriptName, task, statusLine,
  attempts, startedAt, attached, resumeAtMs }`.
- `FailReason` (lines 111-118): `stuck | unreachable | no_progress | died | disconnected |
  out_of_supplies | inventory_full | requirements | timeout | aborted | crashed | low_hp |
  logged_out`.
- `HealthCondition` (lines 101-103): `no-progress | unexpected-interface | dialog-stuck |
  level-up | death | logout | inventory-full | out-of-supplies | low-hp`.
- `RecoveryOutcome` (line 104): `recovered | escalated | failed | handled-by-script`.
- `DeathBehaviour` (line 129): `loot | return | resume | pause | logout | loot-and-logout | fail`.
- `StuckBehaviour` (line 138): `pause | logout | stop`.
- `RunSummary` lines 267-277, `TaskSummary` lines 284-289.

Where the literals become UI copy today:
- `builtin/tasksViews.ts:23-40` `statusLabel(s, now)` - the run card's badge, tone-mapped
  (`hard-stop` -> "Stopped: hp too low"/error; `stuck` -> "Stuck on {task}"/warn; then per state).
  **`reason` outranks `state`.**
- `frame/runBanner.ts:49-62` `message(s)` and `:78-83` `tone(s)` - the banner's prose and colour,
  a *different* set of strings for the same states. Two copies of the same vocabulary.
- `builtin/tasksViews.ts:157` `HISTORY_TONE = { done: 'ok', failed: 'error', stopped: 'neutral' }`.
- `builtin/tasksViews.ts:94` `SOURCE_TONE = { library: 'info', user: 'accent', fork: 'accent' }`.

### The health ladder - `web/src/tasks/healthMonitor.ts` (254 lines)

- `Escalation = 'continue' | 're-anchor' | 'pause-stuck' | { fail: FailReason }` (line 9).
- `TERMINAL` (lines 18-24): `death -> died`, `logout -> disconnected`,
  `out-of-supplies -> out_of_supplies`, `inventory-full -> inventory_full`,
  `no-progress -> no_progress`. `low-hp` is deliberately absent - it is the runner's own
  `hardStop.hpBelow` and never enters the ladder (comment lines 13-17).
- `OCCURRENCE_BUDGET` (lines 32-41): `death { n: 1, to: 'terminal' }`,
  `no-progress { n: 1, to: 'pause-stuck' }`.
- `NO_REANCHOR = ['inventory-full']` (line 48).
- `deathRung(policy)` (from line 56) maps `DeathBehaviour` onto the ladder.
- `fire(condition, at, detail)` lines 135-162: dedupes against `active`/`pending`, records
  `counts[condition]`, emits `{ kind: 'health', condition, detail }` into the trace (line 150),
  and hands a script-claimed condition straight to `{ kind: 'recovery', action: 'script',
  outcome: 'handled-by-script' }` (line 155). **One slot, not a queue** (comment 158-161).
- `evaluate(...)` in `web/src/tasks/health.ts:133` is where each condition is decided;
  `LEVEL_UP_RE` at `health.ts:11`.

### Pairing / connect states - see §8 item 3

`panels/connectCard.ts` (163 lines) is the pairing state machine; `panels/connect.ts` (259 lines)
is the paired-session list plus gateway health. Neither exposes a typed state enum - the states
are string literals written straight into `#connect-status`. If G8.1 wants a closed set of
pairing states, it has to be introduced; nothing to reuse.

---

## 14. G8.2: `TraceEvent` kinds and how traceView mounts

### `TraceEvent` - `web/src/tasks/types.ts:249-265`

`{ seq: number; at: number } & (` one of eighteen kinds `)`:

`run_started` (runId, scriptId, version, params, startedBy) · `task_enter` (task) ·
`task_exit` (task, outcome `ok|failed|timeout|aborted`, attempts, ms, reason?) ·
`action` (action, ok, reason?) · `log` (level `info|warn|error`, text) · `status` (text) ·
`xp` (skill, delta) · `item` (id, delta) · `stuck` (task, snapshot) ·
`paused` (reason: PauseReason, by: Actor) · `resumed` (by) · `human_input` ·
`snapshot` (snapshot) · `run_done` (status, summary, durationMs, xpGained, itemsDelta,
tasksEntered) · `truncated` (dropped) · `health` (condition, detail?) ·
`recovery` (condition, action, outcome) · `target` (`TargetEvent`, lines 232-235: via, kind_,
name, x, z, distance).

`web/src/tasks/trace.ts` (91 lines) is the buffer: `cap` default 5000 (line 25),
`COALESCE_MS = 10_000` (line 12) merging consecutive same-skill `xp` and same-id `item` deltas
(`coalesce`, 36-50), and `enforceCap` (53-63) which keeps `run_started` at index 0 and maintains a
single `truncated` marker at index 1.

### `builtin/traceView.ts` (134 lines) - MOVING (SP4b Task 11 wraps it in a run report)

- `UNTRUSTED_HEADER` (line 12) - prepended to the "Copy to Claude" payload.
- `describeEvent(e)` lines 21-42 - **an exhaustive switch over all eighteen kinds**; adding a kind
  is a type error here, which is the intended guard.
- `traceRow(e, t0)` lines 52-67: `.trace-row[data-trace-row=seq][data-kind][data-line]`, and a
  real `<button class="trace-line trace-toggle" aria-expanded>` only when the event carries a
  snapshot (`stuck` or `snapshot`, line 44).
- `toggleSnapshot(row)` 70-80, `applyFilter(rows, kind)` 82-86, `addKindOption` 88-91.
- `appendTraceEvent(view, e)` 94-105 - the live-append path; keeps the current filter and grows the
  `<select>`'s option list.
- `renderTraceView(events, { copy, onClose })` 107-133 - builds
  `.trace > .trace-head(select.p-input, button[data-trace-copy], button[data-trace-close]) +
  .trace-rows[data-trace-rows]`, with delegated click handling on `rows` so appended rows expand.

**Where it mounts**: `builtin/tasks.ts` only. `traceHost` is created at `tasks.ts:77`, mounted as
the second child of the History `section()` at `tasks.ts:270`, filled by `openTraceFor(runId)`
(`tasks.ts:238-253`, which toggles on a repeat click and calls `api.getRun(runId)`), fed live by
`onEvent` (`tasks.ts:266-270`) which appends only while `openTrace === api.status().runId`, and
cleared by `closeTrace()` (`tasks.ts:236`) on unmount and on every tab change
(`tasks.ts:296-303`). The history row's entry point is `data-trace-open` in
`tasksViews.ts:168`.

CSS: `styles/tasks.css:24-42` (`.trace`, `.trace-head`, `.trace-rows` capped at
`max-height: 260px`, `.trace-row`, `.trace-toggle`, seven `[data-kind]` colour rules, `.trace-pre`).

---

## 15. Moving targets

SP4b tasks 9-15 are being implemented into this same working tree on this same branch. Sources:
`docs/superpowers/specs/2026-09-07-sp4b-handoff.md` section 3 (lines 92-168) and
`docs/superpowers/plans/2026-09-06-sp4b-bot-expansion.md` lines 4828-6105.

Files this map cites that SP4b will change, and what it adds:

**Task 9 - per-script toggles** (plan lines 4832-5142)
- `web/src/plugins/builtin/tasksViews.ts` - `RowHandlers` gains `setEnabled(enabled)`;
  `renderScriptRow` gains a `<label class="field field-inline task-row-toggle">` wrapping an
  `<input type="checkbox" class="switch" data-task-enabled={id}>` **before the Run button**, with
  an "On"/"Off" `.field-label` beside it, and Run becomes `disabled` with the title "This script
  is turned off" when `task.enabled === false`. So a new `.task-row-toggle` class lands in
  `styles/tasks.css`, and `.switch`/`.field-inline` (forms.css) gain a second consumer.
- `web/src/plugins/builtin/tasks.ts` - `refreshScripts` passes the new `setEnabled` handler.
- `web/src/plugins/builtin/marketplace.ts` - a disabled script's card renders
  `alert('This script is turned off. Turn it back on in the Tasks tab.', { tone: 'warn', title:
  'Turned off' })` and its Run button routes to the Tasks tab instead of calling `api.run`.
- `web/src/tasks/types.ts` - `TaskSummary` gains `enabled: boolean`.
- Also: `tasks/api.ts`, `tasks/catalogue.ts`, `tasks/router.ts`, `tasks/wire.ts`, new
  `tasks/toggles.ts`, `firebase/firestore.rules`.

**Task 10 - the live run, in the banner and the card** (plan lines 5154-5310)
- `web/src/tasks/types.ts` - `RunStatus` (and `RunStatusLite`, so the Worker can fill them) gains
  **`target`, `health` and `xpPerHour`**. Anything in this map that enumerates `RunStatus`
  (§13) is stale the moment that lands.
- `web/src/frame/runBanner.ts` - a second, **collapsible detail line**: a `detailEl`
  (`.run-banner-detail`, `data-banner-detail`) plus a `detailToggle` button
  (`.run-banner-detail-toggle`, `data-banner-detail-toggle`, `aria-expanded`), with the collapsed
  flag held in the closure and deliberately **not persisted** (no new setting, no new
  localStorage key). Plus a **health pip**, built like `dot`, carrying
  `title = "Recovering: {condition}"` and hidden when `status.health` is null. `detailParts(s)`
  reads `s.target`, `d.api()?.getState()?.player` and `s.xpPerHour`. Both new elements join the
  `d.root.replaceChildren(...)` call at line 128 and are painted at the end of `paint()`. The
  detail line is `aria-hidden` for the same reason the clock is.
- `web/src/plugins/builtin/tasksViews.ts` - `renderRunCard` gains a details block under the
  status line (elapsed and ETA, xp/h per skill, the current target, the last five health checks
  with outcomes), and `updateRunCard` patches those fields in place rather than rebuilding.
- `web/src/plugins/builtin/tasks.ts` - keeps a five-entry ring buffer of `health`/`recovery`
  trace events and hands it to `renderRunCard`.
- `web/src/styles/*.css` (`tasks.css` in practice), `web/styleguide.html` and
  `web/src/styleguide.ts` - **a new "Run banner" styleguide section** showing four states
  (running; running with a target and a health pip; paused; failed). Sections §10 and §11 of this
  map both change.
- `web/src/agent/types.ts`, `web/src/agent/worker.ts` (`postStatus`), `web/src/agent/workerHost.ts`.

**Task 11 - run history, the report, and export** (plan lines 5315-5525)
- **New** `web/src/plugins/builtin/runReportView.ts` (+ test) - renders the report: the timeline as
  a stacked bar, the outcome and `FailReason`, totals, recoveries by condition, a "Show trace"
  toggle that mounts the **existing `renderTraceView`** underneath, and two buttons ("Copy for
  Claude", moved out of traceView, and "Export"). New markup hook `data-report`.
- **New** `web/src/tasks/runReport.ts` (+ test) - `buildRunReport(summary, events)`.
- `web/src/plugins/builtin/tasks.ts` - `openTraceFor` becomes `openReportFor`; the existing
  `data-trace-open` hook on the history row **stays** so `web/e2e/tasks.pw.test.ts` keeps working.
- `web/src/plugins/builtin/traceView.ts` - loses the copy button's ownership (it moves into the
  report view) and gains a host that is no longer the panel directly. §14's "mounts in tasks.ts
  only" becomes "mounts inside runReportView".
- `web/src/tasks/history.ts` - IndexedDB schema version 2, `summaryCap` 200 / `traceCap` 50,
  read-time defaults rather than a rewrite migration.
- `web/src/tasks/types.ts` - `RunSummary` gains required `itemsDelta`, `tilesTravelled`,
  `recoveries`, plus `failReason` and `characterName`.
- `web/src/agent/worker.ts` (`endRun`), `web/src/tasks/api.ts`.

**Tasks 12-15** touch `web/src/tasks/library/**`, `web/src/data/atlas.json`, `scripts/gen/*`,
`web/e2e/*.pw.test.ts` and the SP4b spec. None of those are surfaces this map covers, with one
exception: Task 13 registers a new library script, so the Marketplace's catalogue gains an entry
and `builtin/marketplace.ts`'s `START_HERE_ID = 'tutorial-island'` (line 29) stops pointing at
nothing.

### Summary: treat as unstable

`web/src/plugins/builtin/tasks.ts`, `web/src/plugins/builtin/tasksViews.ts`,
`web/src/plugins/builtin/traceView.ts`, `web/src/plugins/builtin/marketplace.ts`,
`web/src/frame/runBanner.ts`, `web/src/tasks/types.ts`, `web/src/tasks/api.ts`,
`web/src/tasks/router.ts`, `web/src/tasks/wire.ts`, `web/src/tasks/history.ts`,
`web/src/styles/tasks.css`, `web/styleguide.html`, `web/src/styleguide.ts`,
plus two new files that do not exist yet: `web/src/plugins/builtin/runReportView.ts` and
`web/src/tasks/toggles.ts`.

Everything else in this map - the plugin registry and manifests, `ui/strip.ts`, `frame/panels.ts`,
`ui/el.ts`, `ui/toast.ts`, `ui/dialog.ts`, `frame/stage.ts`, `frame/characterTabs.ts`,
`frame/overlays.ts`, `sessions/*`, `stats/*`, `bank/*`, `panels/*`, `plugins/pluginsPanel.ts`,
`plugins/settingsForm.ts`, `partials/frame.html`, and every stylesheet except `tasks.css` - is
outside SP4b's declared file lists and can be planned against as read.
