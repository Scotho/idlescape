# idlescape: windows, the session canvas and the bank at release standard

Date: 2026-09-07
Status: approved by the authoring session under D11, on a brief relayed by a peer session on the
owner's behalf (D90); uncommitted until the next docs commit.
Authority: **this document decides sprint 3 entry 8, "Windows and the session canvas"**, in
`docs/superpowers/specs/2026-09-07-sprint-legends-quest.md`. Where it and the shell v2 plan
(`docs/superpowers/plans/2026-09-07-shell-v2.md`) overlap, the plan owns the Window family's
markup, tokens and static chrome (D22, D26, D29) and this document owns its **behaviour**: drag,
resize, focus order, docking, persistence and motion. Where they disagree on a literal, the
vendored bundle wins (shell v2 gaps design, ruling 6).
Placement: sprint 3 row 8, inserted before "Trace tools and the death log"; section 13 says why.
Written on `sprint/dragon-slayer` against HEAD `9608f2b` and the shell v2 plan as reconciled on
2026-09-07, because the entry composes with what that plan is about to build.

Sources read directly: `web/src/bank/view.ts`, `web/src/styles/bank.css`, `web/src/frame/*`
(`characterTabs.ts`, `stage.ts`, `canvasSize.ts`, `panels.ts`, `overlays.ts`),
`web/src/sessions/manager.ts`, `web/src/ui/dialog.ts`, `web/src/styles/tokens.css`,
`web/play.html`, the shell v2 plan Tasks 1, 7, 8, 16 and 17, the vendored bundle's `README.md`,
`design-system-readme.md` and `tokens/motion.css`, decisions D22, D26, D29, D48, D88, and the
web bank spec's section 12.

---

## 1. The brief, and what it decides

The peer session's words, relayed for the owner:

> "Dramatically improve the popup/overlay ui and polish it to a release standard. The one used for
> the bank. Allow user sessions tabs to be dragged out and have the window act as a canvas. Use
> win11 or apple standards for animations and interactivity. Resize the windows with the fixed
> resolution of the old client. Others can be resized however."

Four things are being asked for, and this document treats them as one system rather than four
polish items, because three of them are the same mechanism:

1. **A window manager.** Today there is exactly one floating surface in the shell, the bank, and it
   is bespoke: a centred `role="dialog"` in `bank.css` with no drag, no resize, no z-order and no
   memory of where it was (`web/src/bank/view.ts:192-199`, `web/src/styles/bank.css:19-29`). Shell
   v2 adds a second (trace, plan Task 16) and a third (the studio, Dragon Slayer entry 6) and gives
   all of them one class family, but no behaviour beyond open, close and `popIn`. Nothing in the
   vendored bundle specifies dragging, resizing, minimising, focus-raise or two windows at once.
2. **The stage as a canvas.** A character's session is an `<iframe>` in `#client-frames`, shown or
   hidden by a class, one at a time (`web/src/sessions/manager.ts:218-230`). The brief wants a
   session to be pulled off its tab into a floating window so two characters can be watched side by
   side. That is a window whose body is a live iframe, with one hard constraint section 4 states.
3. **A fixed-aspect window.** The game client draws a 789 by 532 canvas (`web/src/frame/canvasSize.ts:1-2`,
   `web/play.html:15,19`). A session window resizes **aspect-locked** to that ratio, with the canvas
   scaled inside it. Every other window resizes freely within its declared minimum.
4. **The bank at release standard.** The bank becomes the first managed window, and what "release
   standard" means for it is written out in section 8 as a checklist a reviewer can hold it to.

The brief says "765 by 503" nowhere, but a reader who remembers the 2004 client might expect it:
the shipped client is 789 by 532 and that is the ratio this document locks to.

## 2. What exists, verified

| Fact | Where |
|---|---|
| The bank window is built once into `#bank-host` inside `#canvas-wrap`, opened by the Bank panel's `mount()` and closed by its `unmount()`; window and panel are a bidirectional pair. | `web/src/partials/frame.html:16`, `web/src/main.ts:216-221`, `web/src/plugins/builtin/bank.ts:52-59` |
| The bank host is `pointer-events: none` at `calc(var(--z-dialog) - 1)`; the window opts back in. Anything interactive mounted into such a host must set `pointer-events: auto` or its clicks fall through (web bank spec 12.7). | `web/src/styles/bank.css:13-17` |
| Escape closes the bank from an element-level keydown that bails on `defaultPrevented`; `close()` releases the session, removes the element and restores focus to the opener. No focus trap. | `web/src/bank/view.ts:204-208, 230-284` |
| The bank's context menu is `position: fixed`, clamped into the host's viewport rect. | `web/src/bank/contextMenu.ts:140-173` |
| The character strip re-renders by `root.innerHTML = ...` on every session state change, so any pointer state anchored to a tab dies on the next tick. | `web/src/frame/characterTabs.ts:125-136` |
| Sessions are iframes created lazily and switched by toggling `.client-frame.hidden`; every hidden session gets `setRenderSuspended(true)`. | `web/src/sessions/manager.ts:78-86, 166-174, 218-230` |
| Stage sizing hard-codes the strip and panel widths (`32`, `210`) that `tokens.css` also declares, and sizes every session including hidden ones. | `web/src/frame/stage.ts:241-247`, `web/src/styles/tokens.css:63-64` |
| Canvas modes are `'1' | '2' | '3' | 'auto'` under `cs.size`; the iframe gets pixel width and height and the canvas keeps `aspect-ratio: 789/532`. | `web/src/frame/canvasSize.ts:1-32`, `web/src/main.ts:50` |
| Shipped motion tokens are `--dur-fast 90ms`, `--dur-base 140ms`, `--dur-slow 220ms`, `--ease cubic-bezier(.2,.7,.3,1)`; the bundle adds `popIn`, `fadeUp` and six other keyframes and one global reduced-motion block. `popIn` does not exist in `web/` yet. | `web/src/styles/tokens.css:68-72`, `docs/design/idlescape-shell-v2/tokens/motion.css` |
| The z-scale at HEAD has four lanes; shell v2 Task 1 makes it six and D48 rules that two stage windows are ordered by DOM order, most recent last, with no third lane. | `web/src/styles/tokens.css:75-78`, plan `:456-475` |
| Shell v2 Task 7 owns `.window`, `.window-warm`, `.window-docked`, `.window-centred`, `.window-head`, `.window-title`, `.window-sub`, `.window-close`, `.window-body`, `.window-foot` and the `.menu` markup; D88 defers the menu's **behaviour** (dismissal, Escape, roving focus, positioning) to sprint 3 as `frame/contextMenu.ts`. | plan `:1948-2158` |
| The only modal is the native `<dialog>` behind `confirmDialog`. | `web/src/ui/dialog.ts`, `web/src/styles/dialog.css` |
| No panel can be popped out; `frame/panels.ts` is a single-slot controller and panels are `{ title, mount, unmount }` with no position or size. | `web/src/frame/panels.ts:3-62` |

Two of these are the shape of the work: the bank is the only precedent and it is not reusable, and
an iframe is the one kind of window body that cannot be moved in the DOM.

## 3. The model

### 3.1 A window

```ts
// web/src/frame/windows/types.ts
export type WindowId = 'bank' | 'trace' | 'studio' | 'wiki' | 'match' | `session:${string}`;
export type WindowState = 'floating' | 'maximised' | 'minimised' | 'docked';
export type ResizeMode = 'free' | 'aspect' | 'none';

export interface WindowSpec {
  id: WindowId;
  title: string;
  subtitle?: () => string;          // session windows: name and the online timer
  resize: ResizeMode;
  aspect?: number;                  // required when resize is 'aspect'; 789 / 532 for a session
  min: { w: number; h: number };
  initial: { w: number; h: number; at: 'centre' | 'dock-right' | 'stage' };
  closable: boolean;               // false for a session window: closing it docks it (R6)
  dockable: boolean;               // true only for session windows
  warm?: boolean;                  // composes .window-warm (the bank)
  body: (host: HTMLElement) => { dispose(): void };
  onClose?: () => void;
}

export interface WindowRect { x: number; y: number; w: number; h: number }
export interface WindowLayout { rect: WindowRect; state: WindowState; restore?: WindowRect }
```

A window is a `WindowSpec` registered with the manager once and opened by id. The manager owns
the chrome; the spec's `body` owns the content. The bank, trace, studio and match windows become
specs; nothing about their bodies changes.

### 3.2 The manager

`web/src/frame/windows/manager.ts` exposes `open(id)`, `close(id)`, `focus(id)`, `setState(id,
state)`, `layout(id)`, `onChange(cb)` and `dispose()`. It holds one `HTMLElement` per open window
inside `#stage-windows`, a new host that replaces `#bank-host` and `#trace-host` (plan Task 16
creates the second; this entry folds both into one). The host is `position: absolute; inset: 0;
pointer-events: none` in the stage, at `var(--z-stage-window)`, and every window sets
`pointer-events: auto`, which is the trap the web bank spec records.

**Z-order is DOM order, most recent focus last.** `focus(id)` appends the window's element to the
end of the host. That is D48's rule generalised: no per-window z-index anywhere, and the six-lane
scale stays six.

### 3.3 The session canvas

The stage is the desktop. A session is in one of two places:

- **Docked**: the session fills the stage as today. Exactly one session is docked at a time, and
  it is the active tab. This is the layout every existing test sees and it is the default.
- **Floating**: the session is a window with `resize: 'aspect'`, its tab still in the strip, its
  iframe positioned to the window's body rect.

**Ruling R1: an iframe is never reparented.** Moving an `<iframe>` in the DOM reloads its document,
which for a session means a re-login and the loss of every hook subscription. So a session window
does **not** contain its iframe. The iframe stays in `#client-frames`, and the window's body is an
empty region whose rect the manager writes onto the iframe as inline `left`, `top`, `width` and
`height` on every layout change, with `#client-frames` raised to sit visually inside the window
host. The chrome (title bar, handles, focus ring) is a sibling that the iframe never occludes
because the iframe's rect is the body rect, not the window rect. A test pins this by identity:
after dock, float, drag, resize and re-dock, `iframe.contentWindow` is the same object and the
element has the same node identity.

**Detaching a tab.** Pointer down on a character tab, move past 6 px, and the tab lifts into a
ghost that follows the pointer (a translucent copy at 0.85 opacity, `transform` only). Release
over the stage floats the session there at its last floating rect or, first time, at 0.6 of the
stage's width aspect-locked and centred on the pointer. Release back over the strip cancels. A
floating session's tab shows a small "floating" glyph after its name and a click on it focuses the
window rather than docking it. Docking again: the window's dock button, double-click on its title
bar, the tab's context menu, or dragging the window's title bar onto the strip.

**Which session is docked.** If the active tab's session is floating, the stage behind the windows
shows the docked session, which is the most recently docked one; if none is docked, the stage
shows the empty state the shell already has for "no character". The manager's `setRenderSuspended`
rule changes from "hidden is suspended" to "not visible is suspended": a floating session is
visible and renders; a docked session under a maximised window is still docked and renders; a
minimised session is suspended. `hooks.setAttended(true)` stays unconditional.

### 3.4 Persistence

One key, `cs.windows`, a JSON object keyed by `WindowId` holding `WindowLayout` plus, for session
windows, the character id it belongs to. Written on every settled layout change (after a drag or
resize ends, not during), read on `open(id)`. Missing, malformed or off-stage rects fall back to
`initial`, and every rect is clamped to the stage on read, so a layout saved on a wide monitor is
usable on a narrow one. `cs.size` keeps its meaning for the docked session; a floating session's
size is its window rect. `cs.bank.*` and `cs.panel` are untouched.

## 4. Interaction, to a named standard

The brief says "win11 or apple standards". Both are written down; this section names the rule
taken from each so a reviewer can check the behaviour rather than a feeling.

| Behaviour | Rule | From |
|---|---|---|
| Drag start | 6 px movement threshold before a press becomes a drag; below it a press is a click. `setPointerCapture` on the title bar for the duration. | Windows (drag threshold `SM_CXDRAG`), macOS |
| Drag | Direct manipulation, 1:1, no easing, no animation. The window may go partly off-stage but its title bar never leaves the stage: at least 32 px of it stays visible on every side. | Both |
| Resize | Eight handles: edges 6 px wide, corners 10 px, each with its cursor. Aspect-locked windows resize from any handle and derive the other axis. Minimum size is enforced at the handle, never by a snap-back after release. | Windows |
| Snap | Drag to within 8 px of the left or right stage edge shows a translucent snap preview of that half; release snaps. Drag to the top edge previews maximise. Drag away restores the pre-snap size. Snap is a layout, not a state: a snapped window is `floating` with a rect. | Windows 11 Snap |
| Focus | Pointer down anywhere in a window raises it and, if focus was outside it, moves focus to its first focusable element. Raising never scrolls the page. | Both |
| Title bar double-click | Toggles maximise and restore (`resize: 'none'` windows ignore it). For a session window, docks it. | Windows |
| Minimise | The window shrinks toward its origin and the strip: a session window toward its tab, any other window toward its strip button (the bank's, the trace's Automation button, the wiki's title-bar link). The origin gains a dot. Click the origin to restore. | macOS (a transform-only reading of the genie) |
| Escape | If focus is inside a closable window, Escape closes it and marks the event handled (the bank's existing R30 form). The shell's panic Escape still pauses a moving run alongside, per the camera spec's precedence table, section 6.6. A session window does not close on Escape, because the client inside owns that key. | Project rule |
| Keyboard move and resize | With the title bar focused (it is a `tabindex="0"` element with the window's `aria-label`): arrows move by 8 px, Shift plus arrows resize by 8 px, Enter toggles maximise, Space opens the window menu. This is the accessible path Windows offers under Alt plus Space, without the chord. | Windows |
| Window menu | The `.menu` family with the behaviour D88 deferred to sprint 3: Restore, Move, Size, Minimise, Maximise, Dock or Float, Close. Right-click on the title bar and Space on it open the same menu. | Windows |
| Out-of-view guard | On stage resize (panel open or close, breakpoint), every window is re-clamped so its title bar stays reachable. | Both |

Touch: the same pointer events with a 10 px threshold; handles grow to 14 px under
`(pointer: coarse)`. The shell already has a mobile breakpoint and the bank a mobile override, so
this is one media query, not a second implementation.

## 5. Motion, to a named standard

The bundle's `tokens/motion.css` is the base and this entry extends it in the same file, so the
plan's test that every keyframe lives in one place and reduced motion is handled in exactly one
place keeps passing.

| Moment | Motion | Tokens |
|---|---|---|
| Open | Scale .96 to 1 with fade, 180 ms, decelerating. This is the bundle's `popIn .18s`; the easing is tightened to `--ease-out`. | `--dur-open: 180ms`, `--ease-out: cubic-bezier(0, 0, .2, 1)` |
| Close | Fade with scale to .98, 120 ms, accelerating. | `--dur-close: 120ms`, `--ease-in: cubic-bezier(.4, 0, 1, 1)` |
| Focus raise | Shadow deepens from the resting `0 18px 50px rgba(0,0,0,.6)` to `0 24px 64px rgba(0,0,0,.72)` and the border brightens one hairline step, 120 ms. Unfocused windows keep the resting shadow. | `--dur-close` |
| Snap preview | Preview fades in 100 ms; release animates `transform` and size to the target over 200 ms with the emphasised curve. | `--dur-snap: 200ms`, `--ease-emphasised: cubic-bezier(.2, 0, 0, 1)` |
| Minimise and restore | 220 ms `transform` toward or from the origin, emphasised curve, opacity to .0 over the last third. | `--dur-slow` (existing), `--ease-emphasised` |
| Dock and float | 220 ms `transform` and size between the stage rect and the window rect, emphasised curve; the iframe's rect is written at the end of the transition, not per frame, and is hidden behind a stage-coloured scrim for the duration so the client never draws mid-transition. | as above |
| Drag and resize | None. `will-change: transform` is set at drag start and cleared at drag end. | - |

Every animation is `transform` and `opacity` only. Under `prefers-reduced-motion` all of it is off
through the bundle's single global block; dock and float then switch rects in one frame with the
scrim still applied for that frame.

Two new easings and three new durations is the whole token cost. `--ease` (the shipped
`cubic-bezier(.2,.7,.3,1)`) stays for buttons and panels; nothing else in the shell changes speed.

## 6. Components, and where each lands

| Piece | File | Lines, expected | Depends on |
|---|---|---|---|
| Types | `web/src/frame/windows/types.ts` | 60 | - |
| Manager: registry, open, close, focus, state, persistence | `web/src/frame/windows/manager.ts` | 320 | shell v2 Task 7 `.window*` |
| Chrome builder: title bar, controls, handles, menu wiring | `web/src/frame/windows/chrome.ts` | 220 | `.menu` family, `frame/contextMenu.ts` |
| Drag, resize, snap, clamp maths (pure, no DOM) | `web/src/frame/windows/geometry.ts` | 200 | - |
| Pointer layer: capture, thresholds, handles to geometry | `web/src/frame/windows/pointer.ts` | 240 | `geometry.ts` |
| Keyboard layer and the window menu | `web/src/frame/windows/keys.ts` | 160 | `chrome.ts` |
| Session windows: iframe rect projection, dock and float, the tab ghost | `web/src/frame/windows/sessionWindow.ts` | 280 | `sessions/manager.ts`, `characterTabs.ts` |
| Context menu behaviour D88 deferred here | `web/src/frame/contextMenu.ts` | 200 | `.menu` markup |
| Character strip reconciliation (keyed render, no `innerHTML` rebuild) | `web/src/frame/characterTabs.ts` (rewrite in place) | 300 | - |
| Stage sizing reads tokens, sizes the docked session only | `web/src/frame/stage.ts` (edit) | - | - |
| Styles: floating modifiers, handles, snap preview, ghost, minimised origin dot | `web/src/styles/window.css` (new family file beside `overlays.css`) | 240 | Task 7 |
| Motion tokens | `web/src/styles/motion.css` (the bundle's file, extended) | +12 | Task 1 |
| Styleguide: a live "Windows" section with a draggable, resizable demo and the menu | `web/styleguide.html` | +80 | D12 exemption |

The bank (`web/src/bank/view.ts`) loses its own host, positioning, Escape handler and focus-restore,
each of which the manager now does, and keeps its body, grid, tabs, menu and store untouched.
Trace (plan Task 16) and the studio (Dragon Slayer entry 6) register specs the same way; if this
entry lands before the studio it registers nothing for it and the studio spec's host paragraph is
amended to say "register a `WindowSpec`" instead of "mount into `#studio-host`" (R7).

## 7. The bank at release standard

The bank is the surface the brief names, so "release standard" is written as a checklist. Each row
is a test or a screenshot in the entry's ledger, not an opinion.

1. **Managed.** Opens as a `floating` window centred at 470 by the height of its content, drags,
   resizes, snaps, minimises to the Bank strip button, remembers its rect in `cs.windows`, raises
   on focus, and closes from its own button, Escape and the panel's `unmount()` as today.
2. **Reflows.** The grid's column count is `max(8, floor((bodyWidth - railWidth) / pitch))`, where
   the pitch is the 48 px OSRS pitch shell v2 keeps. Eight columns at the initial width, more when
   the player widens the window, never fewer. Tab dividers, keyboard clamping (`ArrowDown` from the
   last full row) and drop targets all read the live column count; `BANK_COLUMNS` becomes a
   parameter of `grid.ts` and `gridInput.ts` with 8 as the default, so every existing test keeps
   its number and one new test drives a 12-column layout through every path the 8-column tests
   cover.
3. **Never blank.** Icons that have not streamed in yet draw a 0.35-opacity slot outline with the
   item name as `title`, never an empty cell; the outline fades to the icon over `--dur-open`.
4. **Status is quiet.** The `#bank-status` live region says one thing per settled batch ("Moved 3
   items", "Sorted tab 2") and nothing during a drag. The polling `#bank-live` badge shows `live`,
   `polling` or `offline` in the window subtitle slot rather than inside the title.
5. **Errors are placed.** `#bank-error` renders as the `.alert` family in the window's foot, with
   Retry, and never shifts the grid.
6. **Menus behave.** The bank's context menu moves onto `frame/contextMenu.ts`: click-away,
   Escape, roving arrows, focus restore to the slot, edge positioning inside the stage, and the
   `pointer-events: auto` trap fixed once in the family instead of once in `bank.css`.
7. **Focus is honest.** The window has `role="dialog"` and `aria-label`, and is non-modal, so it
   has no `aria-modal` and no trap (web bank spec 12.6 stands). Focus enters the first tab on open
   and returns to the opener on close. The title bar is focusable and the keyboard move and resize
   path works on it.
8. **Nothing leaks.** Open and close fifty times in a test and the `IconCache` subscriber count,
   the manager's element count and the number of `pointer*` listeners on `document` are what they
   were.
9. **It looks like the mock.** The Playwright screenshot of the open bank at 470 px matches the
   bundle's bank surface to the tolerance shell v2's regression fixtures use, and a second capture
   at 720 px shows twelve columns with the same chrome.
10. **It is quick.** Drag at 60 fps with the Performance panel showing no layout thrash: the drag
    path writes `transform` only, and the iframe projection (which does write layout) is a session
    window concern the bank never touches.

## 8. Tests

- **`geometry.test.ts`**: pure. Clamp, snap zones, aspect derivation from each of eight handles,
  minimum enforcement, the 32 px title-bar visibility guard, re-clamp on a smaller stage. Every
  rule in section 4's table that is a number has a case that fails when the number changes.
- **`manager.test.ts`** (jsdom): open, close, focus order as DOM order, state transitions,
  persistence round trip through `cs.windows`, fallback on malformed JSON, clamp on read.
- **`pointer.test.ts`** (jsdom): synthetic `PointerEvent`s **with `buttons: 1`** (the trap the web
  bank spec records), the 6 px threshold, capture and release, a drag abandoned by `blur`.
- **`sessionWindow.test.ts`** (jsdom with the session manager's test double): float, dock, iframe
  node identity and `contentWindow` identity across every transition, suspend rules, the ghost
  lifecycle, a tab render mid-drag not killing the drag.
- **`characterTabs.test.ts`**: rewritten for keyed reconciliation; the existing roving-focus and
  slot tests stay green.
- **Playwright `windows.pw.test.ts`**: real browser, because jsdom has no pointer-events model and
  no layout. Float a session, resize it aspect-locked and assert the canvas's client rect keeps
  789/532 within a pixel; two floating sessions both drawing (the frame counter on each moves);
  drag the bank, reload, the bank reopens where it was; the bank at twelve columns; menu
  click-away with a real mouse; reduced motion forced on and every transition finishing in one
  frame. Runs inside `npm run verify`'s bare Playwright invocation, so it is a gate.
- **Styleguide regression**: the new Windows section joins the bundle's per-family screenshot
  fixtures.

What a green does not cover, for `docs/VERIFICATION.md`: frame rate during a drag is measured by
hand in the ledger, once, on the owner's machine; nothing asserts it.

## 9. What this spec does not do

- **No pop-out to a real browser window** (`window.open`). It would reload the iframe (R1) and
  lose the session. A later entry could host a session in a second top-level window through the
  session manager's own login, which is a different design.
- **No panel pop-out.** Panels stay in the single-slot column. The brief asks for sessions and
  the bank; a floating panel is one `WindowSpec` away once someone wants it, and it is not wanted.
- **No modal windows.** `confirmDialog` and the native `<dialog>` stay for the two confirmations
  the shell has; the manager is non-modal by construction.
- **No new art.** Handles, ghosts and the minimised dot are CSS.
- **No client patch.** The canvas already keeps its aspect through CSS; the session window only
  changes the iframe's rect.
- **No change to `cs.size`, `cs.panel`, `cs.bank.*` or any panel id.**

## 10. Dependencies

| On | What is needed | State |
|---|---|---|
| Dragon Slayer entry 4, shell v2 Task 1 | the six-lane z-scale, `--window`, `--r-window`, the bundle's `motion.css` in `web/` | plan reconciled 2026-09-07 |
| Task 7 | the `.window*` chrome and the `.menu` markup; D88's behaviour deferral is what this entry picks up | same |
| Task 8 step 5 | a full-height canvas column, so a window can be positioned in stage coordinates | same |
| Tasks 16 and 17 | trace and bank as `.window` compositions; this entry converts both to `WindowSpec`s | same |
| Dragon Slayer entry 6, the studio | optional: if it has landed, its host becomes a `WindowSpec` (R7) | spec approved |
| Camera spec section 6.6 | the Escape precedence table this entry's Escape rule composes with | approved |
| Sprint 3 entry 10, Sound (renumbered 11) | consumes the character-tab menu this entry ships and adds Mute to it | needs a spec |
| Sprint 3 wiki entry | opens its window through this manager | its spec is written beside this one |

## 11. Rulings, with the cost if each is wrong

| Id | Ruling | Alternative | Cost if wrong |
|---|---|---|---|
| R1 | An iframe is never reparented; a session window projects its body rect onto the iframe. | Put the iframe inside the window element. | The alternative reloads the client on every dock and float, which is a re-login; there is no cheap reversal. |
| R2 | Z-order is DOM order with most recent focus last, generalising D48; no per-window z-index. | A z counter per window. | One line per window if a fixed order is ever needed. |
| R3 | One host `#stage-windows` replaces `#bank-host` and `#trace-host`. | Keep one host per window. | Two selectors in tests and the frame partial. |
| R4 | A session window is aspect-locked to 789/532; every other window is `free` unless its spec says otherwise. | Let sessions resize freely and letterbox. | A `ResizeMode` per spec; reversible in one line. |
| R5 | Layout persists in one `cs.windows` key, clamped on read. | One key per window. | A one-time migration of a key nobody has yet. |
| R6 | A session window has no Close; its close control docks. Logging out stays in the tab menu and the account panel. | Close ends the session. | A boolean on the spec. |
| R7 | If the studio has landed first, its host paragraph is amended to register a `WindowSpec`; if this entry lands first, the studio composes the manager from the start. | The studio keeps `#studio-host`. | One paragraph and one `open()` call. |
| R8 | The bank reflows columns with width, minimum eight. | Fixed eight columns, vertical resize only. | `BANK_COLUMNS` back to a constant. |
| R9 | Motion: two new easings and three durations, all `transform` and `opacity`, all off under reduced motion, in the bundle's `motion.css`. | Per-window animation rules. | Tokens are one file. |
| R10 | `frame/contextMenu.ts` ships here, including the character-tab menu (Float, Dock, Minimise), so sprint 3's Sound entry adds Mute to a menu that exists. | Sound ships the menu behaviour. | One file moves entries. |
| R11 | The character strip renders by keyed reconciliation. | Keep the `innerHTML` rebuild and re-arm drag state after each render. | The rewrite is a prerequisite task; the alternative leaks state on every tick. |
| R12 | Placement: sprint 3 row 8, before trace tools, corpus surfaces and Sound, because those three compose it. | After the wiki entry, and the wiki opens as a centred non-managed window first. | One renumber. |

## 12. What the plan has to decide

1. Whether `characterTabs.ts`'s rewrite is task 1 or is folded into the session-window task. The
   recommendation is task 1, on its own, because the existing tests pin it.
2. The exact snap preview colour: the bundle's `--accent-tint` or the scrim. Recommendation:
   `--accent-tint` at 0.15 with a 1 px accent border.
3. Whether the minimised origin dot reuses `.dot-accent` from the StatusDot family. Recommendation:
   yes.

## 13. Placement

Sprint 3 row 8, inserted before "Trace tools and the death log", which becomes 9; corpus surfaces
becomes 10 and takes the wiki spec as its authority; Sound 11, Shell panels 12, Claude reads traces
13. Row 8 needs Dragon Slayer entry 4 and benefits from entry 6, both of which close before sprint 3
opens. Nothing above row 8 in sprint 3 depends on it: loadouts, keyboard and console, notifications,
the route service, the quest helper and the two library rows are all panel or runtime work. Rows 9
to 11 each consume something it builds: the trace window's chrome, the wiki window and the
character-tab menu.

## 14. Ledger

The entry's SDD workspace is `.superpowers/sdd/<plan-basename>/`; its ledger is promoted to
`docs/superpowers/ledgers/<plan-basename>.md` at close, per `docs/superpowers/SDD.md`. The
frame-rate measurement in section 8 and the two Playwright screenshots in section 7 are its
measured facts.
