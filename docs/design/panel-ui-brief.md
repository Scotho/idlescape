# idlescape — panel UI design brief

Written 2026-09-06 against `feat/platform-shell` @ `187fc64`. Everything below was read out of the
running code, and the screenshots in `screenshots/` were captured from the live stack on the same
day by `capture-screenshots.pw.test.ts` in this directory.

Companion files in this directory:

- `panel-layout.html` — a self-contained, static, simplified version of the rendered layout. Open
  it in a browser; it needs no build and no server. Every panel body is present as static markup
  so a redesign can be tried directly on it.
- `screenshots/` — the real UI, captured in game.
- `capture-screenshots.pw.test.ts` — the Playwright script that took them. Its header says how to
  re-run it after a redesign; it lives here rather than in `web/e2e/` so it does not add a signup
  and thirty seconds to every `npm run verify`.

---

## 1. Mission

**idlescape is a browser-playable 2004-era RuneScape with a Claude that can play alongside you.**

The game is [Lost City](https://github.com/LostCityRS) (formerly 2004Scape) — a cycle-accurate
open-source re-implementation of RuneScape 2 build 274 (23 November 2004), server and client both
in TypeScript. We run the engine and content as pinned upstream clones, fork the browser client
thinly, and wrap the whole thing in a **shell** of our own. The shell is the product. It is where
this project's design work lives.

The premise is **co-pilot, not bot**. The human plays in the browser. Their Claude session attaches
to the *same character* over a paired MCP connection and can drive it — start a script, watch it,
be interrupted the instant the human touches the mouse. The player is never locked out, and the
game canvas is never something Claude owns. The panel UI is the seam between those two drivers: it
has to make "what is running, who started it, and how do I take it back" legible at a glance.

Secondary goals that shape the panels:

- **RuneLite is the reference.** The audience already lives in RuneLite's sidebar: dense, dark,
  legible, unfussy, one accent colour. We deliberately chose that idiom rather than a generic
  dark-mode SaaS look.
- **One click to play.** Gate password → sign in → name a character → in game. No game password is
  ever shown to a player; the shell mints a one-shot session for them.
- **Multi-character.** One Firebase account holds 2 (guest) or 3 (registered) characters. Each one
  runs in its own same-origin `/play.html` iframe with its own client, its own XP tracker, its own
  loot log and its own script runtime. Hidden characters keep simulating with rendering suspended,
  so tab switching is instant.
- **Everything is a plugin.** The side panel is not a fixed set of screens. It is a registry: every
  panel is a plugin with a manifest (`id`, `name`, `icon`, `tier`, `description`, `settings`), and
  the icon strip is rebuilt from whichever plugins the account has enabled.

The public deployment is `https://osrs.scotho.com`, behind a temporary shared password gate.

---

## 2. The goal for the rebuild

> **Usability and joy come before OSRS nostalgia.** The shell should feel immediately familiar to
> an OSRS player, and adopt modern conventions and design wherever they genuinely improve
> usability.

Read that as a tie-breaker, not a licence to leave the genre. Concretely:

- **Familiar, not a replica.** An OSRS player should recognise where they are within a second — the
  dark ground, the dense sidebar, the tab rail, the 2004 canvas untouched at the centre. That is
  the *entry price*, and it is already paid. It is not the ceiling.
- **When nostalgia and usability conflict, usability wins.** Period-accurate chrome that costs a
  player a click, a squint or a guess is the wrong trade. A 210px column, emoji icons, one-panel-
  at-a-time and grey one-line empty states are period-flavoured constraints we chose, not laws.
- **Modern conventions are allowed and wanted** where they earn their place: real search and
  filtering, sensible responsive behaviour, resizable or detachable surfaces, keyboard shortcuts
  and a command surface, clear affordances, progressive disclosure, skeleton and loading states,
  onboarding that teaches, motion that explains a change rather than decorating it, and
  accessibility as a default rather than a retrofit.
- **Joy is a requirement, not a garnish.** The first minute should feel good: a first-run state
  that invites rather than apologises, feedback that confirms an action landed, small moments of
  delight when a run finishes or a level goes up. "Dense and dark" must not become "grim and inert".
- **The co-pilot is the thing that is actually new.** No RuneScape client has a second driver.
  Making "what is Claude doing, and how do I take the wheel back" instantly legible is the single
  highest-value design problem here, and it deserves more than a 210px column and a thin banner.
- **The 2004 canvas is sacred; everything around it is not.** The game view is pixel-exact and
  ours to frame, never to restyle. Every other surface in the shell is open for redesign.

---

## 3. What surrounds the panels

```
Browser
├── the shell  (web/, Vite + vanilla TS, no framework)
│   ├── #screen-gate / #screen-home / #screen-characters   full-screen cards
│   └── #screen-frame                                       the game frame  ← the panel UI
│         └── one <iframe src="/play.html"> per open character
│               └── #canvas 789×532, the real 2004 client
│
└──HTTPS/WSS──> front server (Bun, :8787)  gate, auth, characters, bank, WS relay
                     └──> engine (Node/tsx, :8899)  Lost City 274 + our overlay
                Firebase Auth + Firestore (accounts, characters, plugin settings, run history)
```

Two things follow from this that a redesign must respect:

1. **The game is an iframe, not a canvas we own.** The shell cannot draw inside it, cannot read its
   keyboard events without help, and must size it in whole-pixel multiples of 789×532. Anything the
   panel UI wants to say *over* the game is an absolutely-positioned overlay in the parent
   document, stacked above the iframe.
2. **No UI framework.** No React, no Vue, no Tailwind. Panels are built with a tiny `h()` element
   builder (`web/src/ui/el.ts`), `innerHTML` templates, or both. CSS is hand-written, token-driven,
   in `web/src/styles/*.css`. Files are kept under 400 lines by convention.

---

## 4. The design system as it stands

There is already a design system and a **living styleguide page at `/styleguide.html`**
(`web/styleguide.html` + `web/src/styleguide.ts`) — see `screenshots/14-styleguide.png`. It
documents colour, type, spacing, buttons, forms, data display, overlays, dialogs and the frame.
A redesign should either extend it or replace it wholesale; it should not be left to rot.

### Tokens (`web/src/styles/tokens.css`)

Colours are stored as **RGB triplets** so both `rgb(var(--x))` and `rgba(var(--x), a)` work.

| token | value | role |
|---|---|---|
| `--rl-border` | `#111111` | every 1px rule |
| `--rl-window` | `#1b1b1b` | page ground |
| `--rl-darker` | `#1e1e1e` | title bar, icon strip, footer, inputs |
| `--rl-panel` | `#282828` | side panel, cards |
| `--rl-hover` | `#323232` | raised controls, hover |
| `--rl-raised` | `#3c3c3c` | control borders, scrollbar thumb |
| `--rl-muted` / `--rl-text` / `--rl-strong` | `#808080` / `#b0b0b0` / `#e6e6e6` | text ramp |
| `--rl-orange` | `#ff981f` | **the one accent** |
| `--rl-orange-deep` | `#d6780a` | primary button border / active |
| `--rl-ok` `--rl-warn` `--rl-error` `--rl-info` | `#43a047` `#ffb300` `#e53935` `#4a90d9` | semantic tones |
| `--rl-danger` | `#a02828` | destructive buttons |
| `--rl-hp` `--rl-prayer` `--rl-run` | `#c0392b` `#2980b9` `#27ae60` | HUD meters |

Type: two families with different jobs. **Pixelify Sans** (Google Fonts, monospace fallback) is the
*game* voice — wordmark, canvas overlays, HUD numerals. The **system UI stack at 12–13px** is the
*tool* voice, the size RuneLite renders its panels at. Scale: 10 / 11 / 12 / 13 / 15 / 18 / 24
(`--fs-xs` … `--fs-2xl`), line height 1.4 (1.2 tight).

Spacing on a 4px rhythm (`--sp-1` 4 … `--sp-6` 32). Shape: `--radius: 2px`, `--radius-lg: 4px`, no
shadows except on `<dialog>`. Controls: `--ctl-h: 28px`, `--ctl-h-sm: 24px`, `--ctl-h-lg: 36px`,
bumped to 36/32/44 under `@media (pointer: coarse)`.

Frame geometry: `--panel-w: 210px`, `--strip-w: 32px`, `--title-h: 22px`, `--foot-h: 18px`.

Motion: 90 / 140 / 220ms with `cubic-bezier(.2,.7,.3,1)`, all of it disabled under
`prefers-reduced-motion`. Focus is one ring everywhere:
`0 0 0 2px rgb(var(--rl-window)), 0 0 0 4px rgb(var(--rl-orange))`.

### Stated principles

- **One accent.** Orange means "this is the current thing" or "this is the main action". Nothing
  else is orange.
- **RuneLite density, web hit targets.**
- **Motion only answers an action** and stops under `prefers-reduced-motion`.
- **Words do one job, in sentence case,** and name the action they perform: "Revoke" produces
  "Revoked".

### Component classes

`web/src/styles/` — `layout.css` (`.stack` `.cluster` `.spread` `.grid-2` `.card` `.section`),
`button.css` (`.btn` + `-primary` `-ghost` `-danger` `-sm` `-lg` `-icon` `-block` `.is-loading`,
`.link`, `.btn-row`), `forms.css` (`.input` `.select` `.switch` `.field` `.field-inline`
`.input-search`), `data.css` (`.kv` `.badge` `.dot` `.alert` `.meter` `.table` `.empty`, plus the
plugin/session/character row shapes), `frame.css`, `tabs.css`, `overlays.css`, `dialog.css`,
`bank.css`, `tasks.css`.

**Note the `.p-*` aliases.** `.p-btn` `.p-input` `.p-row` `.p-label` `.p-value` `.p-empty`
`.p-error` `.p-muted` are compact aliases kept for markup written before the design system landed.
Roughly half the panels still use them. Unifying these is fair game and would be welcome.

---

## 5. Anatomy of the frame

`web/src/partials/frame.html` is the whole skeleton; `web/src/styles/frame.css` sizes it.

```
┌ .frame-title  22px ───────────────────────────────────────────────────────┐
│ idlescape                osrs.scotho.com · world 1 · shoth4019zr          │
├ .char-tabs  28px ─────────────────────────────────────────────────────────┤
│ [● shoth4019zr  online] [+ New character] [+ New character] [Add more ⋯]  │
├ .frame-body ──────────────────────────────────────────┬─ 210px ─┬─ 32px ──┤
│ .canvas-wrap                                          │ .side-  │ .icon-  │
│   #client-frames   one iframe per character           │  panel  │  strip  │
│   #run-banner      absolute, top, over the canvas     │         │  ✚      │
│   #overlays        xp line / status pill / info boxes │ header  │  💰     │
│   #plugin-overlays status HUD etc.                    │  ───    │  ▶      │
│   #bank-host       the bank window, centred           │  body   │  ⚑      │
│   #toasts          bottom-centre                      │         │  🏦     │
│   #offline-card    "World offline, retrying in 10s"   │         │  ✦      │
│                                                       │         │  👥     │
│                                                       │         │  ☺      │
│                                                       │         │  ⚙ 🧩   │
├ .frame-foot  18px ────────────────────────────────────┴─────────┴─────────┤
│ someone@example.com                              fps 50 · gate: fiddlesticks│
└───────────────────────────────────────────────────────────────────────────┘
```

**Title bar** (`.frame-title`, 22px): wordmark in Pixelify orange on the left; `#title-centre`
carries `host · world 1 · <character>` only while that character is online.

**Character tabs** (`.char-tabs`, 28px, `web/src/frame/characterTabs.ts`): always exactly four
slots. Created characters get a real tab with a status dot (grey offline / amber connecting /
green online) and a status word; unused slots within the account limit read `+ New character` and
open the Characters panel; a slot beyond the limit is disabled with
"Create an account to unlock a third character"; the fourth is a disabled `Add more · coming soon`.

**Canvas stage** (`.canvas-wrap`): the iframe host, plus five absolutely-positioned layers. Layer
order is `--z-overlay: 5` (overlays, plugin HUD), the run banner one step above that, `--z-toast: 40`,
`--z-dialog: 50`. The canvas is sized by `web/src/frame/canvasSize.ts` into whole multiples of
789×532 (1x / 2x / 3x / fit-window), and `stage.layout()` reserves `32 + (panel open && stage
wider than 1100 ? 210 : 0) + 16` px for the chrome. **Every open frame is sized, hidden ones
included**, so switching tabs never reflows.

**Side panel** (`.side-panel`, 210px): a header (`#panel-icon` in orange, `#panel-title`,
`#panel-back` ×) and a scrolling `#panel-body` with 8px padding and an 8px flex-column gap. One
panel at a time. The open panel id is persisted to `localStorage['cs.panel']` and restored on load
and after a character switch.

**Icon strip** (`.icon-strip`, 32px): a real ARIA tab list (`web/src/ui/strip.ts`) — `role=tablist`,
`aria-selected` mirrored from `.active`, roving `tabIndex`, arrow/Home/End key navigation, and a
CSS tooltip built from `data-tip`. The active button gets a 2px orange left rail plus orange glyph.
The gear (Configuration) is pushed to the bottom with `margin-top: auto`. Buttons are 30px tall
with a 13px emoji/glyph as the only label.

**Footer** (`.frame-foot`, 18px): account identity left, `fps N · gate: <password>` right.

**Responsive.** At ≤1100px the side panel drops below the canvas full-width. At ≤700px the icon
strip becomes a horizontal bottom bar with 36×32 buttons and tooltips off.

---

## 6. The panels

Panels are plugins. `web/src/plugins/registry.ts` owns enable/disable, dependency ordering
(`requires`), `alwaysOn`, per-account settings persisted to Firestore, and the strip rebuild.
`web/src/frame/panels.ts` owns open/close/toggle and mounting into `#panel-body`.

A panel is just `{ title, mount(body), unmount?() }`. Mount is called **every time** the icon is
clicked, so panels re-render from scratch and must be cheap.

| # | id | icon | name | default | what it is |
|---|---|---|---|---|---|
| 1 | `xp` | ✚ | XP Tracker | on | Per-skill XP gained, xp/h, level, XP and actions to next level. "Reset session". Re-renders every 5s. |
| 2 | `loot` | 💰 | Loot Tracker | on | Items gained this session, newest first, with counts. "Reset". Re-renders every 2s. |
| 3 | `notes` | 📝 | Notes | off | One textarea per character, synced to the account through plugin settings. |
| 4 | `screenshot` | 📸 | Screenshot | off | Captures the active canvas to PNG, downloads it, keeps 10 thumbnails. |
| 5 | `status-hud` | ❤ | Status HUD | off | **Overlay only, no panel.** HP / Prayer / Run meters and stat boosts over the game view. |
| 6 | `tasks` | ▶ | Tasks | on | The scripting cockpit. See below. |
| 7 | `marketplace` | ⚑ | Marketplace | on | The bundled script catalogue: search, per-script card with tags, version, time estimate, a requirements warning when the character can't run it yet, "Run now" and "Add to my tasks". |
| 8 | `bank` | 🏦 | Bank | on | A handle for the bank *window*. See below. |
| 9 | `connect` | ✦ | Claude | always on | Pairing. A one-shot pairing URL with Copy and a 15:00 countdown, live pairing status, then a row per paired Claude session (live dot, label, "Active now"/"Last seen 3m ago", Revoke behind a confirm dialog), gateway status and link health (`fps · rtt · ws`). |
| 10 | `characters` | 👥 | Characters | always on | A row per character (name, session status, "Open tab", "Delete"), a create form while under the limit, and a delete flow gated on typing `delete <name>` plus password re-authentication. |
| 11 | `account` | ☺ | Account | always on | Signed-in-as, current character, Guest/Email badge, the guest "attach an email" form, Sign out. Also where login rejections are written. |
| 12 | `config` | ⚙ | Configuration | always on | Canvas size (1x/2x/3x/Fit window), scaling (Smooth/Pixelated), hide overlays, Enter fullscreen. |
| 13 | `plugins` | 🧩 | Plugins | always on | Search, then a row per plugin: icon, name, description, a gear that expands an inline settings form, and a switch. `alwaysOn` plugins show a disabled switch labelled "always on". |

### The Tasks panel in detail (`web/src/plugins/builtin/tasks.ts`)

The most complex panel, and the one the co-pilot premise lives in. Top to bottom:

- **The run card** — pinned above everything, only present when a run exists. A tone badge
  (Starting / Running / Paused / `Paused: you took control · resumes in 4s` / `Stuck on <task>` /
  `Stopped: hp too low` / Done / Failed / Stopped), an `mm:ss` clock, the script name and current
  task as a key/value row, one line of script prose, and exactly the controls that fit the state
  (Pause · Stop, or Resume · Stop, or Run again). It is **patched in place** every second rather
  than rebuilt, because rebuilding would take keyboard focus off Pause.
- **My scripts** — one row per owned script: name, a Library/Fork/Yours badge, description,
  `v1 · ~20 min · tags`, last-run line, an amber missing-requirements line, and Run / Edit or Fork /
  Delete. Run expands an inline parameter form when the script declares params. Edit expands an
  inline code textarea with Save (compile errors come back as an error alert).
- **Run snippet** — a code textarea and a Run button, disabled while a run is moving; the result
  comes back as an ok/error alert plus a `<pre>` of logs.
- **History** — the last 20 runs: script name, outcome badge, `mm:ss · N xp · summary`, and
  "Open trace".
- **The trace** — a monospace event log, one line per event, filterable, colour-railed by kind
  (xp green, action blue, task enter/exit orange, stuck/paused amber, run_done orange), snapshots
  folded away behind expandable rows, with a Copy button whose whole point is pasting the trace
  into a Claude session.
- A "Browse the Marketplace" link in the footer.

Settings: auto-resume delay after the human takes control (default 5000ms), echo script logs to
game chat.

### The bank window (`web/src/bank/`, `web/src/styles/bank.css`)

Not a side panel — eight columns need ~420px, so it is a **centred window over the stage** mounted
into `#bank-host`, styled after the 2007scape bank. The Bank *panel* is just its handle: opening
the panel opens the window, closing either closes both, and the panel body summarises
`Used 27 / 240`, `Tabs`, `Updates live|polling` and an info alert.

The window has a title bar (`The Bank of Gielinor`, `27 / 240`, `live`, ×), a left tab rail with
drag-to-tab targets, an 8-column item grid with drag-to-reorder, a right-click context menu
(including stubbed Contracts entries), and a bottom bar with Swap/Insert, Item/Note, quantity
1/5/10/X/All, a search box, and disabled "Deposit inventory" / "Deposit worn items".

**The web bank is view-and-reorder only.** Items enter and leave the bank in game. The bank is
per-*account*, shared by every character, and updates arrive over an SSE stream with a 10-second
poll behind it.

### Cross-cutting surfaces

- **Run banner** (`web/src/frame/runBanner.ts`) — a strip across the top of the canvas:
  dot · script · task · message · `mm:ss`, an orange bottom rule while live, amber paused, red
  errored. The whole line is a button into the Tasks panel. It also owns the status dot on the
  Tasks strip icon, the run outcome toasts, and **Escape as the panic key** — including a
  re-dispatch from inside each iframe, because a keydown in a same-origin iframe never reaches the
  parent.
- **Canvas overlays** (`web/src/frame/overlays.ts`) — pixel-font pills over the canvas: an XP line
  top-left, a status pill top-right (`● not paired`, `connecting…`, `offline · press Login to
  reconnect`), and a stack of label/value info boxes.
- **Toasts** (`web/src/ui/toast.ts`) — bottom-centre of the canvas, tone-railed left border.
- **Dialogs** (`web/src/ui/dialog.ts`) — native `<dialog>` with a backdrop, used for destructive
  confirmations, with a `window.confirm` fallback.
- **Offline card** — covers the canvas when the engine is down, counting down to a retry.

---

## 7. Rules a redesign has to keep

1. **The strip is generated, not authored.** `rebuildStrip()` writes one `<button class="strip-btn"
   data-panel="<id>" title="<name>">` per enabled panel plugin, with the plugin's icon as its only
   content. Order is registration order. Any new strip design has to be producible from a manifest
   list.
2. **One panel open at a time**, persisted to `localStorage['cs.panel']`, restored on boot and after
   a character switch.
3. **`mount()` runs on every open.** Panels hold no DOM between opens; `unmount()` must release
   timers and subscriptions.
4. **Everything shown is per-character.** XP, loot, notes, the run, the trace and the script list
   all belong to the character whose tab is in front. Switching tabs re-reads them. The bank is the
   one exception: it is per-account.
5. **Accessibility already implemented, and not to be lost:** the strip's tab-list roles and arrow
   keys, `aria-live` on the panel and on every error line, `aria-label`s on icon-only buttons, a
   single visible focus ring, `prefers-reduced-motion`, and `role=status` / `role=alert` on the run
   banner and bank error.
6. **Selectors are load-bearing.** 21 Playwright specs and ~791 unit tests drive
   `[data-panel="<id>"]`, `#side-panel`, `#panel-body`, `#char-panel-name`, `[data-task-run]`,
   `[data-bank-slot]`, `#bank-capacity` and friends. Renaming them is allowed but is a real cost —
   flag it rather than doing it silently.
7. **`localStorage` keys keep the `cs.` prefix** (`cs.panel`, `cs.size`, `cs.filter`, `cs.bank.*`,
   `cs.pl.<plugin>.<key>`). Renaming them silently resets every existing player's saved state.
8. **No framework, no CSS framework, no build-step CSS.** Plain CSS with tokens, plain TS.
9. **The canvas is the hero.** Chrome is 1px rules and 2px radii. The game must never be crowded
   off screen by the panel.

---

## 8. Where it hurts today (my read, not a mandate)

Offered as raw material for the redesign; disagree freely.

- **210px is very tight** for the panels that carry real content. The Marketplace cards, the Tasks
  script rows and the trace all wrap badly; buttons in a `.btn-row` end up ~60px wide. There is no
  way to widen or detach a panel, no multi-panel view, and no way to pop the trace out.
- **The strip is emoji.** ✚ 💰 📝 📸 ❤ ▶ ⚑ 🏦 ✦ 👥 ☺ ⚙ 🧩 render inconsistently across platforms
  and don't read as one family. RuneLite's strip is a coherent icon set; ours is a grab bag.
- **Two markup dialects.** Some panels are built with `h()`, some with `innerHTML` templates, and
  the `.p-*` aliases coexist with the newer `.btn`/`.input`/`.kv` names. Same visual result,
  divergent code.
- **Empty states are thin.** Most read as one grey sentence. The first-run experience — no scripts,
  no loot, no XP, no Claude paired — is most of what a new player sees, and it currently looks
  like an app that isn't working.
- **Nothing above the fold says what the co-pilot is doing** unless a run is live. When idle, the
  status pill says `● not paired` and that is all.
- **The bank window and the side panel are different visual languages** (the bank leans 2007scape,
  the panels lean RuneLite) with no shared vocabulary for a "window".
- **Density is uniform.** Everything is 12–13px at the same weight, so the run card, a history row
  and a settings toggle all read at the same level of importance.
- **Vertical space is unmanaged.** With 13 panels the strip is nearly full at 900px tall; there is
  no grouping, no overflow, no way to reorder or pin.

---

## 9. File map

```
web/
  index.html                     shell entry, @includes the four partials
  play.html                      the per-character client iframe document
  styleguide.html                the living styleguide  →  /styleguide.html
  src/
    main.ts                      composition root: wires state, stage, plugins, panels
    partials/
      gate.html home.html characters.html frame.html
    frame/
      stage.ts          one iframe per character; sizing, chrome, per-character runtimes
      panels.ts         the open/close/toggle panel controller + localStorage
      characterTabs.ts  the four-slot tab strip
      runBanner.ts      the run strip over the canvas
      overlays.ts       xp line, status pill, info boxes
      canvasSize.ts     789×532 multiples and fit-to-window
    ui/
      el.ts  dialog.ts  toast.ts  strip.ts        the shared primitives
    panels/
      account.ts  config.ts  connect.ts  connectCard.ts
    plugins/
      registry.ts  settings.ts  settingsForm.ts  pluginsPanel.ts  firestoreBackend.ts
      builtin/  xpTracker  lootTracker  notes  screenshot  statusHud
                tasks  tasksViews  traceView  marketplace  characters  bank
    bank/         view  grid  gridInput  tabsBar  bottomBar  contextMenu  icons  store  stream
    tasks/        api  runner  router  wire  types  history  library/
    styles/       index tokens base layout button forms data tasks frame tabs overlays dialog bank
docs/superpowers/specs/2026-09-05-idlescape-design-system.md    the current system, in full
```

---

## 10. Screenshots

Captured 2026-09-06 at 1440×900 from the live stack, signed in as a fresh registered account
standing on Tutorial Island, with a seeded bank.

| file | what it shows |
|---|---|
| `00-home.png` | the home screen behind the gate |
| `01-frame-no-panel.png` | the frame with no panel open |
| `02-xp-tracker.png` / `-panel.png` | XP Tracker |
| `03-loot-tracker.png` / `-panel.png` | Loot Tracker (empty state) |
| `04-tasks.png` / `-panel.png` | Tasks, idle, no scripts installed |
| `05-marketplace.png` / `-panel.png` | Marketplace, three bundled scripts, all showing missing requirements |
| `06-bank-window.png` / `-only.png` | the bank window over the stage |
| `07-claude.png` / `-panel.png` | Claude pairing, unpaired |
| `08-characters.png` / `-panel.png` | Characters |
| `09-account.png` / `-panel.png` | Account |
| `10-configuration.png` / `-panel.png` | Configuration |
| `11-plugins.png` / `-panel.png` | Plugins, all 13 |
| `12-plugins-settings*.png` | Plugins with the XP Tracker settings form expanded |
| `13-narrow-1100.png` | the ≤1100px layout, panel below the canvas |
| `14-styleguide.png` | the existing styleguide page |
| `15-layout-doc-frame.png` | `panel-layout.html`, section 1 — the frame, with a live run |
| `16-layout-doc-gallery.png` | `panel-layout.html`, section 3 — every panel body side by side |

Not photographed from the live stack, because it needs a run with the right items in the
inventory: the run banner in its running / paused / stuck states, and the Tasks panel's run card
and trace. Those are mocked up in `panel-layout.html` instead, from the real markup and CSS —
`15-layout-doc-frame.png` shows them.
