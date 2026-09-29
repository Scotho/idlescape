# Idlescape: the Script Studio

Date: 2026-09-07
Status: approved by the orchestrator under D11, 2026-09-07; committed on `sprint/dragon-slayer` the
same day with the sprint amendment; owner may reverse any ruling in section 23.
Placement: **sprint entry 6, "Script Studio"**, immediately after the script API reference (entry 5)
and before the Script API v2 surface (entry 7), with everything below renumbered once. The survey
spec's phase-next proposals become entry 7 immediately after this one, so the studio is the last
entry that sees today's `ScriptContext` and the first that could lint tomorrow's (section 21).
Classification: **architectural.** It adds a new kind of surface (the first large window over the
stage), a new component family the library does not have, a new third-party runtime dependency, a
new validation subsystem, a storage-schema addition, and a behaviour change to the script compiler.
It restructures how script authoring works rather than changing an existing flow.
Extends, and does not restate: `2026-09-05-sp4-tasks-scripting-environment-design.md` section 6
(the script API and its authoring rules), section 7 (the script model), section 8 (run lifecycle,
pause reasons, one run per tab, restart, Escape as the panic key), section 9 (user storage),
section 10 (`window.idlescape.tasks`), section 12.2 (the Marketplace card) and section 17
(security posture). **It supersedes SP4 section 12.1 item 2**, "Edit (user scripts: a code editor
textarea with compile feedback)", which is built literally as a 12-row textarea at
`web/src/plugins/builtin/tasks.ts:160-181`. It does not supersede section 12.1 item 3, the Run
snippet box; see ruling 12.
`2026-09-06-sp4b-bot-expansion-design.md` owns `c.find`, `c.travel`, the health monitor, the run
report and the per-script toggles. This document composes them and redesigns none of them.
Design authority: `docs/design/idlescape-shell-v2/Idlescape Shell v2.dc.html` for every literal,
`README.md` and `design-system-readme.md` for the brand rules, with
`2026-09-06-idlescape-shell-v2-gaps-design.md` as the companion that closes gaps and does not
overrule the mock.
Standard: `2026-09-07-script-api-survey-and-standard-design.md` section 4 (rules S1 to S12) is the
standard this entry's validator enforces, and its P20 is the enforcement map. This document does
not restate a rule; section 8.2 cites the rule each lint enforces.
Depends on: Spec A (`2026-09-07-script-api-docs-design.md`) for `api-index.json`, and sprint entry
2 (Shell v2) for **four** things rather than one, because the widest of them is the easiest to
miss. All four are stated below against what
`docs/superpowers/plans/2026-09-07-shell-v2.md` actually builds, not against the mock, and two of
them are settled by decision D22:
1. **Its token layer.** Every colour, radius, control height and font in this document is written
   in the design bundle's names, and **none of them exists in `web/src/styles/tokens.css` today**,
   which is an `--rl-*` RGB-triplet system (`--rl-panel`, `--rl-text`, `--rl-strong`,
   `--rl-orange`). The names this entry consumes, so entry 2's task list carries them:
   `--sunken`, `--panel`, `--card`, `--bar`, `--window`, `--hairline`, `--text`, `--text-strong`,
   `--text-muted`, `--text-faint`, `--accent`, `--accent-tint`, `--focus-ring`, `--font-num`,
   `--r-window`, `--r-card`, `--ctl-h-xs`. They live in
   `docs/design/idlescape-shell-v2/tokens/colors.css`, `spacing.css` and `typography.css`, and
   Shell v2's own order of work puts them in step 1. **`--r-window` is already in the bundle**
   (`docs/design/idlescape-shell-v2/tokens/spacing.css:9`, `--r-window: 10px`), and the shell v2
   plan's Task 7 already consumes it, so it is a rename entry 2 is committed to like the rest.
   **`--window` is the one name nothing carries yet**: it is in neither `tokens/colors.css` nor
   the plan's Task 1 Step 3 added-colour group, and Task 7 hard-codes the window ground as the
   literal `#202022`. **D29 gives it an owner**: entry 2's Task 1 Step 3 adds
   `--window: #202022` beside `--chrome-bar` in the R18 group and Task 7 reads it, which is the
   same treatment every other mock colour without a bundle token already gets. Until that step has run, section 7.3's
   "no literal hex" unit test would pass against **undefined** custom properties and the editor
   would render unthemed, which is the failure mode worth naming out loud.
2. **The `Window` component family** (section 4.2). **Settled by D22: Shell v2 owns it.** The plan's
   **Task 7** already writes shared window chrome (`.window`, `.window-head`, `.window-title`,
   `.window-sub`, `.window-body`, `.window-foot` in `overlay.css`) for the trace pop-out and the
   bank window, so the family exists in that plan under different class names. What D22 adds is the
   reconciliation against section 4.2's default-and-modifier table, because Task 7's `.window`
   currently carries the neutral ground `#202022` and the trace shadow as the family default with
   **no bank modifier**, while Task 17 restyles the bank separately. The studio composes `.window`
   unmodified and adds nothing.
3. **A merged z-scale.** The plan's Task 7 puts `.window` on `calc(var(--z-overlay) + 1)` and its
   Task 16 puts `.trace-window` on `calc(var(--z-overlay) + 2)`, both inside the canvas column's
   stacking context, with the bank below the trace. The studio needs one lane **above both and
   below `--z-dialog` and `--z-toast`**, which on that scale is `calc(var(--z-overlay) + 3)`.
   Section 4.3 states the requirement; the number belongs to entry 2 and this entry does not pick
   one of its own.
4. **A full-height canvas column.** Section 4.3 item 1. **Settled by D22: the change is Shell v2's**,
   and it lands in the plan's **Task 8 step 5**, the step that rewrites `layout/frame.css`.
   **`.frame-body` had no home in that plan at all**, which is worse than D22 assumed: a grep of
   the plan returned zero occurrences of the selector, Task 2's `frame.css` migration row listed
   `.frame`, `.stage`, `.canvas-wrap` and the rest without it, and Task 8 step 5 named the title
   bar, the wordmark, the side panel, the panel header and body, the footer and "the canvas wrap
   and stage" and never the body row. As written, the CSS split could have dropped the shipped
   `.frame-body` rule (`frame.css:20`) silently, which is the exact failure this dependency exists
   to catch. **D29 gives it one**: the migration row and Task 8 step 5 now both name it. The
   assertion section 4.3 names is still this entry's and stays here, because the failure is silent.

---

## 1. What this delivers

A window over the stage where a player writes, validates, saves and runs their own scripts, and
where an agent session and a player see the same API.

1. **A window**, centred over the stage, in the shell v2 window language, built once into its own
   host layer, opened from the Automation panel and from a script card. No twelfth strip button.
2. **A script list** in a 190px rail: new, edit, rename, duplicate, fork from library, delete
   behind the existing confirm dialog.
3. **An editor**, CodeMirror 6, themed entirely from `tokens.css`, with line numbers, bracket
   matching, multi-cursor, find and replace, member-aware completions and hover cards generated
   from Spec A's `api-index.json`.
4. **A validation model in four priced tiers**: syntax, manifest and params shape, fourteen
   structural rules that turn the standard's S1 to S12 into diagnostics, and (phase 2) real type
   checking against generated declarations. All four render as one diagnostic shape in the trace
   window's own row grammar.
5. **A run bar**: run with params, pause, resume, stop, and an explicit restart when the saved code
   is ahead of the running code.
6. **A console pane** fed by the existing trace stream, and a **help pane** that shows Spec A's
   reference for the symbol under the cursor.
7. **A command palette** and the Sublime and VS Code key idiom.
8. **Four changes to existing files that carry more felt value than the editor**: persist the
   compiled manifest that `api.save` already receives and discards, shadow the forbidden worker
   globals in `compileUserScript` and refuse the rest at the one enforcement point every run
   already crosses, clean up the orphaned toggle document a delete leaves behind, and give a
   compile error a real line under V8.

## 2. Facts this rests on

First read at `1bfdc7d` on `sprint/dragon-slayer`, with SP4b tasks 1 to 9 landed and 10 to 15 open,
then re-verified against `5889437` and again against `30efd948`.

**One baseline governs every line number in this document: `30efd948`**
(`fix(tasks): mend the run card bullet, the pill offsets and the check-list churn`). Citations were
previously given at a mix of the three commits, which is how the same fact came to carry two
line numbers in this set; the cross-review caught five of them. Every citation below and in
sections 4, 8, 9 and 15 is now read at `30efd948`, and SP4b keeps moving these files, so **treat
each number as a hint and grep for the symbol beside it**. Where a citation and a grep disagree, the
grep is right. Where SP4b moves a file, this document is written against the plan's end state
(`docs/superpowers/plans/2026-09-06-sp4b-bot-expansion.md` lines 4828 to 6105) and says so at the
point of use.

| Fact | Where |
|---|---|
| Today's editing surface is a 12-row `<textarea class="p-input snippet-code">` injected into the task row, with an `alert()` for the compile error. This is what the entry replaces. | `web/src/plugins/builtin/tasks.ts:160-181`, `web/src/styles/tasks.css:34` |
| There is **no "new script" affordance anywhere**. Fork from a library row is the only creation path. `api.save` with no `id` already creates a document and nothing calls it that way. | `web/src/tasks/api.ts:180-198`, `userStore.ts:105-130` |
| `api.save` already receives the full compiled `ScriptManifest` from `host.compile` and **discards it**. Because it does, `catalogue.userRow` hard-codes `params: {}`, `api.run` validates a user script's params against an empty schema, and `declaredRequires` compiles the document a second time just to read `requires`. | `api.ts:184-187`, `catalogue.ts:39-49`, `api.ts:240-245, 268`, `params.ts:41-56` |
| `compileUserScript` returns `err.lineNumber`, which is a SpiderMonkey property. Under V8 a compile error carries **no position at all**. | `web/src/tasks/defineScript.ts:46-49` |
| Nothing shadows or removes worker globals before a user script runs, and there is no Content-Security-Policy anywhere in the repo, so `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, `indexedDB`, `caches` and `self` are all reachable from inside `new Function`. SP4 section 17's "no network beyond `postMessage`" is two-thirds true. | `defineScript.ts:38-49`, `worker.ts:364-369`, grep for `Content-Security-Policy` over `server/src`, `web/index.html`, `deploy/` |
| The runtime depends on `new Function` in two places, so **any future CSP must carry `script-src 'unsafe-eval'` or the bot breaks before the editor does**. | `defineScript.ts:42`, `worker.ts:365` |
| `transport.relogin` and `transport.logout` are actively swapped out of the scoped transport because `c.sdk.transport` is an ordinary own property a script can read. The swap is the enforcement, and `workerContext.test.ts` pins the list. | `web/src/agent/workerContext.ts:71-87` |
| The bank window is the precedent for a window opened from a panel: built **once at boot** into `#bank-host`, with `createBankPlugin({ window: () => bankWindow, ... })` giving the panel a handle. `.bank-host` is `position:absolute; inset:0; pointer-events:none; z-index: calc(var(--z-dialog) - 1)`. The host div lives in `web/src/partials/frame.html:16`. | `web/src/main.ts:216-222`, `web/src/styles/bank.css:10-17` |
| The bank window is `role="dialog" aria-label="Bank of Gielinor" tabindex="-1"`, **not** `aria-modal`, with its own Escape handler guarded by `event.defaultPrevented`, and a `role="status" aria-live="polite"` region inside it. | `web/src/bank/view.ts:89, 193, 201-208` |
| Escape has four claimants today; the run banner's `document` keydown is the panic path, no-ops unless `state === 'running'`, and **never calls `preventDefault`**. The bank and the dialog family both read `event.defaultPrevented` and rely on it staying false. | `frame/stage.ts:195-202`, `frame/runBanner.ts:260-265`, `bank/view.ts:204-208`, `ui/dialog.ts` |
| `#bank-host` is a child of `#canvas-wrap`, which is `position:relative; flex:1` inside `.stage`, which sits in `.frame-body { align-items: flex-start }`. **The canvas column is therefore content-height, about 532px**, and a percentage height on a window inside it resolves against that box, not the frame; it also moves when the side panel's content is taller. | `web/src/partials/frame.html:9-16`, `web/src/styles/frame.css:20-22` |
| `#run-banner` is inside `#canvas-wrap` too, at `position:absolute; top:0; left:0; right:0` and `z-index: calc(var(--z-overlay) + 1)`, far below the bank lane's `calc(var(--z-dialog) - 1)`. Anything covering the canvas column covers the banner. | `frame.html:12`, `web/src/styles/tasks.css:72-84` |
| In the mock the co-pilot bar is the **first child of the Canvas column**, 42px tall, and both windows are absolutely positioned inside that same column: trace at `right:16px; bottom:16px; z-index:30`, bank centred at `z-index:25`. | mock lines 51-53, 117, 139 |
| `web/src/styles/index.css` is the aggregator every shipped stylesheet is reached through. A family file nothing imports ships as dead source. | `web/src/styles/index.css` |
| `TasksApi` carries no `compile`. `host.compile` is a `WorkerHost` method reachable only inside `wireTasks`, and `tasks/router.ts` forwards `TasksApi` members only. | `web/src/tasks/api.ts:43-77`, `web/src/agent/workerHost.ts:362-364`, `tasks/router.ts` |
| `case 'compile'` and `case 'pause'` are consecutive arms of the **same** message loop in the agent worker, and `compile` runs the script body through `new Function` and **executes its module-level statements**. | `web/src/agent/worker.ts:128-131`, `web/src/tasks/defineScript.ts:42-43` |
| `api.run` is the codebase's stated single enforcement point ("The Run button, the run card's Run again, the Marketplace's Run now, `window.idlescape.tasks.run`/`restart` from Playwright and the SP4c relay all arrive here"). `api.execute` consults no linter at all. | `web/src/tasks/api.ts:248-258`, `:343-346` |
| The `scriptToggles` rules block has `allow read` and one `allow write` carrying a shape check, and **no `allow delete`**. A delete carries no `request.resource`, so that check raises a null-value error and denies. The neighbouring `tasks` block documents this trap and works around it with its own `allow delete`. `toggles.ts` exposes only `isEnabled`/`setEnabled`. | `firebase/firestore.rules:29-34`, `:43-45`, `web/src/tasks/toggles.ts:27-41` |
| `manifestOf` names eleven optional fields **unconditionally**, so every absent one is an own property valued `undefined`, and structured clone across `postMessage` preserves them. `web/src/firebase.ts:14` is a bare `getFirestore(app)` with no `ignoreUndefinedProperties`, and `userStore.save` attaches its own optionals conditionally under the comment "leave absent optionals out entirely - Firestore rejects explicit `undefined` values". | `web/src/agent/workerReport.ts:71-82`, `web/src/firebase.ts:14`, `web/src/tasks/userStore.ts:123-127` |
| `RunStatus` is produced by `workerHost` out of the worker's `WorkerStatus`, which `Pick`s only `target`, `health` and `xpPerHour` off it. The `run` message carries `scriptRef`, params, `startedBy`, `characterId` and behaviour and **no version**, and a user script's `scriptRef` is code. But `recorder.current()` already holds a `RunSummary` whose `version` is `manifest?.version ?? doc?.version ?? 0`. | `web/src/agent/types.ts:85, 99-101`, `workerHost.ts:75, 274-281`, `web/src/tasks/api.ts:226-228`, `runRecorder.ts:32-40` |
| The mock ships exactly two windows and **there is no `Window` component**: both are hand-rolled inline. A third window has nothing to compose until the family is extracted. | mock lines 117 and 139; gaps spec section 5 |
| Shell v2 lands on **eleven strip buttons for eleven drawn glyphs**, and there is no code, terminal, file or docs glyph among them. | gaps spec section 3, `components/core/Icon.d.ts` |
| The design system already has a code surface: `.textarea.code` is 11px `--font-num` on `--sunken` `#141416`. The focus rule is element-based (`input:focus, textarea:focus, select:focus`), so a `contenteditable` editor gets **no focus ring for free**. | `components/forms/Textarea.jsx`, `tokens/base.css` |
| The trace window's body is the system's only machine-output grammar: `ui-monospace` 10.5px, rows `padding:2.5px 10px; border-left:2px solid <rail>`, rails in the same five tones as the Alert family. | mock lines 117-134 |
| Panels remount on every open and `unmount()` releases timers. An editor with an unsaved buffer therefore cannot live in a panel. | project conventions, README |
| Scripts are per **account** (`users/{uid}/tasks/{taskId}`); runs and the Worker that hosts them are per **character**. | `userStore.ts`, `web/src/agent/worker.ts` |
| The Firestore rule for `tasks/{taskId}` validates named fields and does **not** use `hasOnly`, so an added map field is allowed without a rules change. | `firebase/firestore.rules:35-45` |
| `userStore.save` is a full replace with `merge:false` and no revision history: the previous text is gone. | `userStore.ts:105-130` |
| Vite already sets `worker: { format: 'es' }` and emits worker chunks into `dist/assets/`. The server serves `/assets/*` only, through a per-segment `^[A-Za-z0-9._-]+$` filter, so any asset addressed by a hand-written runtime path works in dev and 404s in production. | `web/vite.config.ts:41-44`, `server/src/router.ts:68-79` |
| `web/` has exactly one runtime dependency, `firebase`. `typescript` is a devDependency pinned at `^5.9.0`. `typescript@latest` now resolves to 7.0.2, the native port, which is a different artefact with a different API. | `web/package.json`; spike section 9 |
| `TasksApi` already carries `pause`, `resume`, `stop`, `restart`, `onStatus`, `onEvent`, `getRun` and `listRuns`. The studio needs no new run-control mechanism. | `web/src/tasks/api.ts:42-75` |
| SP4b task 13 adds an eleven-module `tutorialIsland` library script. `SOURCES` is a flat id-to-text map, so **a multi-file library script has no fork seed** under the current design. | plan line 5615; `library/index.ts:54-58` |

## 3. Where the design came from

This document takes the best of three independent proposals, written into
`.superpowers/sdd/2026-09-07-script-studio-specs/`, a git-ignored workspace a fresh clone does not
have. The table below is the attribution; every decision it names is argued in this document,
which stands alone:

| Decision | From |
|---|---|
| One open buffer at a time, which deletes Tabs, Tree, split panes, resizers and diff from the new-component list | `approach-mvp.md` section 0 |
| Persist the compiled manifest on `UserTaskDoc` | all three, independently; the mechanics here follow `approach-mvp.md` section 6.2 and `approach-maint.md` change 1 |
| Shadow the forbidden globals in `compileUserScript`, with the honest limits stated | fix from `approach-mvp.md` section 8; limits from `approach-devx.md` section 8.2; one shared list file from `approach-maint.md` section 8 |
| Escape ruling A, and the precise mechanism (return `false` so CodeMirror never calls `preventDefault`) | `approach-mvp.md` section 3.5 |
| Four validation tiers priced separately, with V2 errors blocking Run but not Save | `approach-devx.md` section 4 |
| Ten of the fourteen V2 rules (the other four come from the standard's P20) | `approach-devx.md` section 4.2 |
| The command palette as the organising idea instead of a toolbar | `approach-devx.md` section 2.4 |
| Window geometry `min(920px, ...)` by `min(620px, ...)`, and two widths instead of a resizer | `approach-devx.md` section 2.2 |
| The V8 stack parse for a real compile line, behind one shared `PROLOGUE_LINES` constant | `approach-devx.md` sections 4.1 and 8.2 |
| Local drafts and a ten-deep revision ring in IndexedDB, never Firestore revisions | `approach-devx.md` section 6.5, `approach-maint.md` change 2 |
| `expectedVersion` compare-and-set for the SP4c conflict, with no merge UI | `approach-devx.md` section 6.5 |
| Multi-file cut, with the buffer model keyed by `docId + path` so the seam survives | `approach-maint.md` section 12 item 1 |
| Delete also deletes the orphaned toggle document | `approach-maint.md` change 3 |
| Asserted size ceilings rather than stated budgets | `approach-devx.md` section 9.2 |
| The eslint import boundary that keeps model modules free of `@codemirror/view`, which is what makes them testable | `approach-devx.md` section 10.1 |
| The honest fake `TasksApi` written from `TasksErrorCode` | `approach-maint.md` section 10 |

Rejected from all three: Monaco (section 7.1), `@valtown/codemirror-ts`, `@typescript/vfs` and
`comlink` (section 7.4), a `Proxy` over `c.sdk` to hide `transport` (section 15.1), and suppressing
the trace window while the studio is open (section 11).

**Four of the rows above were amended after review, and the amendments are the substance rather
than polish**, so a reviewer going back to the argument does not find a decision this document no
longer holds:

- The window geometry from `approach-devx.md` 2.2 is kept, but its **containing block** was never
  stated in any of the three proposals, and stated wrongly the geometry is unreachable. Section 4.1
  fixes it and prices the layout change it needs.
- Escape ruling A from `approach-mvp.md` 3.5 is kept, and its guard is **not** `defaultPrevented`,
  which is the guard the proposal and the earlier draft of this document both named. Section 4.5
  items 4a and 4b replace it.
- V1 over the agent worker's `compile` message, taken from `approach-mvp.md`, is **reversed**:
  section 8 gives the studio a disposable compile worker instead.
- "V2 errors block Run", from `approach-devx.md` 4, is kept in the editor and **is no longer the
  security boundary**: section 15.2 moves the blocking subset into `compileUserScript`.

## 4. The window

### 4.1 Geometry and chrome

Composed from the window language the mock fixes at lines 117 to 146.

**What the percentages resolve against, first, because everything else depends on it.** The window
is centred in `#studio-host`, and `#studio-host` covers **the canvas column below the co-pilot
bar** and nothing else. Section 4.3 fixes the DOM position and the one shipped-layout change that
makes the column a stable height instead of a content-sized one. Written out so no reader has to
infer it: `calc(100% - 24px)` is 100% of the canvas column minus the co-pilot bar, never of the
frame, never of the viewport, and never of the 789x532 canvas.

- Centred in that box: `left:50%; top:50%; transform:translate(-50%,-50%)`, the bank's placement.
- `width: min(920px, calc(100% - 24px)); height: min(620px, calc(100% - 24px))`. The widest
  existing window is 470px, so **this is a new size class and the spec says so plainly** rather
  than pretending 470 will do.
- **The viewport at which 920x620 is actually reached**, computed against the mock's frame
  (`--panel-w` 280, `--strip-w` 40, `--sp-2` 8 each side, title 22, character tabs 34, footer 18,
  co-pilot bar 42): the column is `viewport width - 336` with the side panel open and
  `viewport width - 56` with it closed, and `viewport height - 132`. So 920 wide needs **1280px**
  of viewport with the panel open and **1000px** with it closed, and 620 tall needs **776px**.
  1280x800 reaches both. 1366x768 misses the height by eight pixels and gets 612. That is the sort
  of number a layout module should not have to discover, so it is here.
- **The collapse ladder below that**, keyed off the window's own width, which is what `layout.ts`
  measures. At or above 860px the rail (190), the editor and the help pane (300) all show. From 760
  to 859 the help pane auto-closes, and it is remembered separately from the player's
  `cs.studio.help` choice so it returns when there is room. Below 760 the rail collapses to a
  drawer over the editor, toggled by `Ctrl-Shift-E` and by a `Scripts` button that appears in the
  header only in that state. The editor region never goes below 320px; the dock and the footer are
  unaffected. In height, below 520px the dock collapses to its switch row and the Problems count
  moves to the header badge, which it already carries.
- One alternative size, `calc(100% - 24px)` square, toggled by a palette command and remembered
  under `cs.studio.wide`. It is **the full canvas column less the gutter, not the full frame**: it
  never covers the co-pilot bar, the side panel, the icon strip or the character tabs. One class,
  no resizer, and no new component family. A drag resizer is cut: no drag handle exists anywhere in
  the system, and panel width is a design-time prop rather than a user drag.
- **Which surfaces the window is permitted to overlap, ruled rather than assumed.** Inside the
  canvas column it overlaps everything: the game canvas, the canvas overlays and pills, the run
  banner, and the trace window. Outside it, nothing: the co-pilot bar, the character tabs, the
  frame title, the footer, the side panel and the icon strip all stay visible and interactive.
  This is one rule instead of four exceptions, and it is what makes the z lane below decidable.
  What the studio occludes it re-provides, and section 4.3 says where.
- Ground `#202022`, the neutral window ground, introduced as the token `--window` rather than
  hard-coded a third time. **Not** `#252220`, which is the bank's warm identity; a second warm
  surface would read as a second bank.
- Border `1px solid rgba(255,255,255,.08)`, radius `10px` (`--r-window`), shadow
  `0 18px 50px rgba(0,0,0,.6)`, `overflow:hidden` on a `flex-direction:column` frame. The shadow is
  the trace window's, not the bank's `0 20px 60px rgba(0,0,0,.65)`: the two mock windows disagree
  on shadow as they disagree on ground and header, and the studio takes the neutral window's
  values throughout so the family defaults stay one coherent set. Section 4.2 splits the family
  defaults from the bank's modifiers explicitly.
- `animation: popIn .18s ease`, **with the centring translate carried inside the keyframe**,
  because `popIn` animates `transform` and would otherwise cancel `translate(-50%,-50%)` for its
  duration. The shipped bank window sidesteps this by not using `popIn` at all; a centred studio
  window hits it on day one. Reduced motion already clamps the duration in `web/src/styles/base.css`.
- No backdrop. Opaque: transparency and blur are for surfaces over the game canvas, and this is
  chrome.
- `z-index` from whatever merged scale Shell v2 produces, and **the studio must not pick a number
  of its own**. Today two systems coexist (`tokens.css`'s `--z-overlay:5 / --z-panel:10 /
  --z-toast:40 / --z-dialog:50` against the mock's 25 for the bank and 30 for the trace). What the
  studio needs from the merge, stated as a requirement on entry 2: **one lane above both windows
  and below the confirm dialog and the toast layer**, in the same stacking context they live in.
  Not "the bank's lane": that phrase and "above the bank" contradicted each other, and being above
  the bank but below the trace is not achievable together with the overlap rule above, because a
  430px trace window docked at the bottom right of the canvas column would paint over precisely the
  studio's Problems dock, its footer meta line and its Run/Save/Pause/Stop row. See section 11 for
  what that means for the trace, which is **occluded, not suppressed**, and ruling 13.

Header, following the trace window's header because that is the one with a subtitle and a tool, at
**24px**, the window-chrome height the mock uses on every window control (the trace header's filter
input, its Copy for Claude button and its close; the bank's close), off the panel's ladder of
22/25/27/29. There is no 23px control anywhere in the bundle:

```
[Script studio 650 #e8e8e6] [name input flex:1 h24] [Badge valid|N problems] [Badge live] [x 24px]
```

The name input is the rename affordance. The close is the 24px `x` (the multiplication sign, never
an icon and never an emoji) with `aria-label="Close the script studio"`, the middle rung of the
18/24/26 dismiss ladder.

Footer is the script card's meta line, which the design already makes a ready-made status bar,
plus the editor's own three figures:

```
v6 · 2 tasks · 1 param · saved 2 min ago · Ln 12, Col 5 · 12.4 KB / 64 KB
```

`font-size:10px; color:#575755`, middot separated, the size figure in `--font-num` with
`tabular-nums`, turning `--warn` at 90 percent of the cap. A player who hits a cap with no warning
has lost work.

### 4.2 The `Window` family, and who owns it

The mock ships two windows and no `Window` component; both are hand-rolled. The studio must not be
the third one-off, because `SKILL.md` says compose the library and the gaps spec section 5 part 4
plans a lint rule forbidding per-panel selectors.

**The `.win` names below are this document's superseded proposal, kept only because the table under
them is the specification of the defaults-and-modifier split.** They were written before D22 gave
the family, its class names and its file to entry 2. The shipping names are entry 2's `.window`,
`.window-head`, `.window-title`, `.window-sub`, `.window-body` and `.window-foot` in `overlay.css`,
per the ruling three blocks below; read `.win` here as "the family default" and `.win-bank` as "the
bank modifier", not as a name this entry proposes. The proposal was `.win`, `.win-docked` /
`.win-centred`, `.win-head`, `.win-title`, `.win-sub`, `.win-close`, `.win-body`, `.win-foot` in
`web/src/styles/window.css`, with a `createWindow(opts): WindowHandle` helper in
`web/src/ui/window.ts`; **none of those paths is this entry's to create.**

**The literals are not already fixed, and pretending they were is how a family ships with the wrong
defaults.** The two mock windows disagree on four of them, so the family needs a stated default and
a stated modifier rather than a transcription:

| | Family default (`.win`) | `.win-bank` modifier |
|---|---|---|
| ground | `var(--window)` `#202022` | `#252220`, the warm bank identity |
| header | flat `#1b1b1d` | `linear-gradient(180deg,#2c2925,#252220)` |
| shadow | `0 18px 50px rgba(0,0,0,.6)` | `0 20px 60px rgba(0,0,0,.65)` |
| placement | `.win-docked` (`right:16px; bottom:16px`) or `.win-centred` | `.win-centred` |

Everything the two agree on is a genuine transcription and carries no modifier: border
`1px solid rgba(255,255,255,.08)`, radius `var(--r-window)` 10px, header separator
`1px solid rgba(0,0,0,.5)`, header padding `8px 10px` docked and `8px 12px` centred, every
chrome control 24px, title `#e8e8e6` at weight 650, subtitle `var(--text-muted)`, close as the
multiplication sign at `var(--text-muted)` hovering to `#2e2e2d` / `#e8e8e6`, footer
`padding:6px 10px; border-top:1px solid rgba(0,0,0,.5); color:#575755; font-size:10px`,
`overflow:hidden`, `animation: popIn .18s ease`. The studio is `.win` unmodified.

**It belongs to Shell v2 (entry 2). Ruled by D22, and the plan already builds most of it.** The
gaps spec never mentions a `Window` family, and that was the gap this section was written against.
The shell v2 **plan** does: its **Task 7** ("the overlay family (pills, HUD, the XP drop, window
chrome)") writes `.window`, `.window-head`, `.window-title`, `.window-sub`, `.window-body` and
`.window-foot` into `overlay.css`, on the shell's own layer scale, and its Tasks 16 and 17 compose
that chrome for the trace pop-out and the bank window. So the family exists in entry 2's plan; what
it does not have is the **defaults-and-modifier split**, and that is what D22 sends into the
reconcile-against-HEAD pass:

- Task 7's `.window` today carries the neutral ground `#202022`, the flat header, the trace shadow
  and the trace's `8px 10px` header padding as the family default, and defines **no bank modifier**
  while Task 17 restyles the bank separately. The table above is the specification for that split:
  the family defaults are the neutral window's values and a `.win-bank`-equivalent modifier carries
  the bank's warm ground, gradient header and heavier shadow.
- **The names and the file are entry 2's, not this entry's.** This document previously proposed
  `.win`/`.win-bank` in `web/src/styles/window.css` with `createWindow()` in `web/src/ui/window.ts`.
  The plan ships `.window*` in `overlay.css`. **Where they differ, entry 2 wins**, because it owns
  the library and this entry only composes it; section 19's file rows are written that way. What
  this entry needs is a family with the stated defaults, a centred placement modifier and a
  styleguide section, under whatever names entry 2 lands. If entry 2's own G9 one-file-per-family
  rule moves the chrome out of `overlay.css` into a family file, that is entry 2's call and this
  entry follows it.

**The fallback, priced and now unlikely.** If entry 2 somehow lands without the family, task 1 of
this entry extracts it and ports both existing windows in the same commit. That is library work on
two surfaces this entry otherwise does not touch. D22 makes it the contingency rather than the
plan.

### 4.3 The host layer, and why the studio is not a panel

`web/src/partials/frame.html` gains `<div id="studio-host" class="studio-host"></div>` beside
`#bank-host`, inside the canvas column, and it is a full-cover layer transparent to clicks
everywhere except the window itself. That much follows the bank. Three things about it do not, and
each is here because the naive version does not work:

**1. The canvas column must become full height, and that is a Shell v2 change this entry
depends on.** `#bank-host` is `position:absolute; inset:0` over `.canvas-wrap`, which is
`position:relative; flex:1` inside `.stage`, which sits in `.frame-body { align-items: flex-start }`
(`web/src/styles/frame.css:20-22`). The stage is therefore **content height**: the canvas column is
about 532px tall, and it moves when the side panel's content is taller. A window asking for
`min(620px, calc(100% - 24px))` inside it gets about 508px, and the whole 620px layout of this
document (24px header, editor, a 160px dock, a footer) is unreachable at any viewport size. The
bank never noticed because it is `max-height`, not `height`.

The fix is one declaration and it is one Shell v2 wants anyway: `.frame-body { align-items:
stretch }`. The stage then fills the frame body, `.stage`'s own `align-items: stretch` passes it to
the canvas column, the side panel and the icon strip, and all three become full-height columns,
which is what the mock draws (its side panel is a full-height column with a scrolling body and its
strip runs the full height). `.canvas-wrap` keeps `align-items: flex-start`, so the game canvas
stays pinned to the top and does not stretch.

**D22 rules this change entry 2's, and it lands in the shell v2 plan's Task 8 step 5**, the step
that rewrites `layout/frame.css`. D22 assumed that step already wrote `.frame-body`; it did not.
**The selector appeared nowhere in that plan**: Task 2's `frame.css` migration row enumerated
`.frame`, `.frame-title`, `.brand`, `.title-*`, `.stage`, `.canvas-wrap`, `.side-panel`,
`.panel-*`, `.frame-foot`, `.offline` and both breakpoints without it, and Task 8 step 5 named
every other frame region and not this one. So the plan could have dropped the shipped rule
entirely rather than merely failing to change it. **D29 puts it in both places**, and the
reconcile-against-HEAD pass carries the outcome rather than assuming it.

**One wrinkle the plan creates, and the requirement is stated as an outcome because of it.** That
plan's Task 14 step 6 moves the run banner out of `#canvas-wrap` and replaces it with
`#copilot-bar` **above `#stage`**, which makes `.frame-body` hold two children rather than one. If
entry 2 then makes `.frame-body` a column, `align-items: stretch` is its cross axis and the
full-height property comes from `.stage { flex: 1 }` instead. So the requirement this entry places
on entry 2 is the **outcome**, not the declaration: *the canvas column is a full-height box whose
height does not depend on the side panel's content.* Whichever declaration produces it is entry
2's. What stays here is the assertion, because the failure is silent: if the canvas column is still
content height when the studio lands, the window gets about 508px and wobbles with the side panel
rather than erroring, which is the worst failure shape available.

**2. It sits below the co-pilot bar, and after entry 2 that costs no inset at all.** The mock draws
the co-pilot bar as the first child of the Canvas column, which is what this section was written
against and which would have required `.studio-host { inset: var(--copilot-h) 0 0 0 }`. **The shell
v2 plan does something better: its Task 14 step 6 moves the bar out of `#canvas-wrap` entirely**,
replacing `#run-banner` with `#copilot-bar` above `#stage`, "because the bar is chrome and not an
overlay". So `#studio-host` is `inset: 0` over `#canvas-wrap`, the co-pilot bar is structurally
outside the box the studio covers, and section 4.1's overlap rule needs no exception for it. The
requirement on entry 2 reduces to the outcome already stated in item 1: the canvas column is a
full-height box, and the bar is not inside it.

**And there is no run banner left to occlude.** That same task deletes `web/src/frame/runBanner.ts`
and `runBanner.test.ts` and lifts their working parts into `frame/copilotBar.ts`, so this
document's earlier worry, that the studio covers the banner, does not survive entry 2. What the
studio still owes is unchanged and is now owed to the co-pilot bar's users rather than to a hidden
banner: the run state is the header's `live` badge and the stale-version Alert (section 10), Stop
and Pause are the footer run bar, and the pause feedback the Escape ruling depends on is announced
in the studio's `role="status"` region. The bar itself stays visible and live above the window the
whole time, which is strictly better than the re-provision this section used to promise.

**3. Its z lane is the merged scale's studio lane, not the bank's**, per section 4.1: above both
existing windows, below the confirm dialog and the toasts, in the same stacking context they live
in. The bank's `calc(var(--z-dialog) - 1)` is scoped to `#canvas-wrap`'s stacking context and is
not a number the studio may copy.

The studio also differs from the bank in **being constructed on first open, not at boot**, because
its chunk is about 185 KB gzipped and app boot must not pay for it. The Automation panel holds a
handle and a dynamic import that has not run.

It follows the bank in the way that matters: panels remount on every open and `unmount()` releases
timers, so an editor with an unsaved buffer cannot live in one. A strip click away from Automation
and back must not discard a draft.

**Panel switch behaviour, and a deliberate divergence from the bank.** The bank plugin closes its
window in `unmount()` and the window closes the panel through `onClose`. The studio does not: it
stays open when the player switches panels, because you often want the history list, the XP tracker
or the events feed beside the editor. Closing is the `x`, the Escape ladder in section 4.5, or a
palette command. The studio calls back so the Automation panel's Edit affordance stays in step.

### 4.4 ARIA

- `role="dialog"`, `aria-label="Script studio"`, `tabindex="-1"`. **Never `aria-modal`, never
  `showModal()`**: the game keeps running behind the window, the co-pilot bar keeps updating, and a
  focus trap would trap the panic path.
- Focus moves into the window on open (to the editor when a buffer is open, to the rail's New
  button when it is empty) and returns to the opener on close.
- A `role="status" aria-live="polite"` region carries save results and validation summaries,
  following `web/src/bank/view.ts:89`. Diagnostics are announced as a count and a summary, never
  one live region per squiggle.
- Every icon-only button carries `aria-label` and `title`.
- **The `Problems | Console` switch is a tab pattern and is built as one.** It swaps two panes, so
  the `.seg` container carries `role="tablist"`, each button `role="tab"` with `aria-selected` and
  `aria-controls`, each pane `role="tabpanel"` with `aria-labelledby`, and left and right arrows
  move between the two with roving `tabindex`. The design system's Segmented ships bare buttons
  with no roles at all (`components/forms/Segmented.jsx`), so this is an addition rather than a
  composition, and it lands as a `.seg[role=tablist]` variant on the styleguide in the same change.
  The mock's only tablist, the icon strip, already uses exactly these roles (mock line 486), so the
  pattern is the project's own rather than an import. Where a `.seg` genuinely filters one list
  rather than swapping panes, it stays plain buttons with `aria-pressed`, and the styleguide says
  which is which.
- **The rail is a list with roving tabindex.** `role="list"` on the container, `role="listitem"` on
  each row with the row's open action as its button, up and down arrows moving between rows, Home
  and End to the ends, and the open row carrying `aria-current="true"`. Without this the rail is
  reachable only by tabbing through every row's actions.
- **The palette and the completion popup** follow the combobox shape the `OverlayList` family
  defines in section 6.1: the search input owns `aria-expanded`, `aria-controls` and
  `aria-activedescendant`, the list is `role="listbox"`, each row `role="option"` with
  `aria-selected`, and arrow keys move the active descendant without moving DOM focus.
- **One focus ring, on everything.** Every focusable control in the window shows
  `box-shadow: var(--focus-ring)` with `border-color: var(--accent)` on `:focus-visible`. The token
  layer's rule is element-based (`input:focus, textarea:focus, select:focus`, `tokens/base.css:7`),
  so buttons, rail rows, tabs and the editor's `contenteditable` all get nothing for free. This is
  the same gap section 7.3 already names for the editor, stated once here for the whole window so
  it is not solved twice with two different rings.
- CodeMirror's accessibility affordances are left at their defaults and `aria-label` is set on the
  editor's content element. The spec records that a `contenteditable` editor with no announcement
  is worse than a slightly slower one, and that this is reviewed against a screen reader rather
  than asserted by a test.

### 4.5 The Escape contract

This is the sharpest risk in the request and it is safety-adjacent: a code editor is the first
surface in idlescape that wants Escape for itself, and CodeMirror's default keymap binds it to
`simplifySelection`.

**Ruling: panic wins always, unconditionally.**

1. The panic handler moves to `window` with `{ capture: true }`, so the pause fires before any
   editor, popup or window sees the key. It stays unconditional and still only pauses while
   `state === 'running'`. **It must not start calling `preventDefault`**, and that is a constraint
   on the change rather than an observation: `web/src/bank/view.ts:204-208`, the dialog family and
   entry 2's own trace pop-out all read `event.defaultPrevented` and would stop closing on Escape
   the day it was set.

   **Which file that handler is in depends on entry 2, and after entry 2 it is not the run
   banner.** At `30efd948` it is the `document` keydown at `web/src/frame/runBanner.ts:260-265`.
   The shell v2 plan's Task 14 deletes `runBanner.ts` and lifts "the `document` keydown handler
   that only ever calls `api.pause('player')` while running" into `web/src/frame/copilotBar.ts`.
   This entry runs after entry 2, so **the change lands in `copilotBar.ts`**, and the plan text is
   the citation rather than a line number that will have moved. If this entry ever runs first, the
   same edit lands in `runBanner.ts` and entry 2 carries it across in the lift.
2. The studio installs `Prec.highest(keymap.of([{ key: 'Escape', run: () => false }]))` ahead of
   the default keymap. **Returning `false` means "not handled", so CodeMirror does not call
   `preventDefault` and the event continues** to the window handler. This is the mechanism, and it
   is the part that is easy to get wrong.
3. The completion popup closes on Escape from `EditorView.domEventHandlers({ keydown })` by calling
   `closeCompletion(view)` and **returning false**, so the popup closes and the key still reaches
   the panic path. Both things happen.
4. **The studio's own Escape close is gated on the run state first, and on consumption second.**
   `defaultPrevented` alone is not a usable guard here, because items 1, 2 and 3 all deliberately
   leave it false. Two rules, in order:

   **4a. While `api.status().state === 'running'`, the studio's Escape close is a no-op.** Escape
   pauses the run and the window stays open, and the studio announces `Run paused` in its
   `role="status"` region, matching the co-pilot bar's own "Esc take control" hint. Without this
   rule an implementer following section 4.5 literally ships a studio that dismisses itself on the
   panic key, and with a dirty buffer also opens the discard ladder, which is the precise opposite
   of what the section 18.3 assertion says must happen. This rule is why that assertion exists.

   **4b. With no run moving, the studio ignores an Escape it can see was consumed.** The handler
   checks `completionStatus(view) === 'active'` at the time the key arrives, and skips closing when
   it is; equivalently, item 3's handler stamps a `consumedEscapeAt` timestamp on the same event
   tick and the window's handler ignores an Escape carrying it. Either mechanism is acceptable and
   the plan picks one; what is not acceptable is `defaultPrevented`, because with a popup open and
   no run moving a single Escape would then dismiss the popup **and** close the window in the same
   event, which is the opposite of the Sublime and VS Code idiom this entry is imitating. The
   window's handler still also honours `event.defaultPrevented`, for anything nearer that does set
   it, exactly as the bank does.
5. **With no run moving and nothing consuming the key**, Escape closes the studio if the buffer is
   clean. If it is dirty, the first Escape focuses `Save` and announces `Unsaved changes. Save, or
   press Escape again to discard.`; the second closes, and the draft survives in IndexedDB either
   way. The dirty ladder is likewise unreachable while a run is moving, per 4a, so a player cannot
   be shown a save prompt by pressing the panic key.
6. `basicSetup` is **not** used. The extension array is hand-assembled, because `basicSetup` brings
   the default keymap including its Escape binding plus features we do not want, and `minimalSetup`
   is too small (no line numbers, no folding, no autocompletion).

Acceptance is two Playwright assertions, not a unit test, because the two branches fail
independently: with a run moving, the editor focused and a completion popup open, Escape pauses the
run and the window stays open; and with no run moving and a completion popup open, one Escape
closes the popup and leaves the window open. **If the first is missing, the panic key silently
stops working in the one surface where a player is most likely to be experimenting. If the second
is missing, the editor throws the player out of the window every time they dismiss a completion.**

## 5. Entry points, and the strip count

**No strip button, and no twelfth glyph.** Shell v2's gaps spec section 3 turns on eleven glyphs
matching eleven post-migration strip buttons, and there is no code, terminal, file or docs glyph
among them. The bank precedent settles it: the bank window opens from the Bank panel and adds no
strip entry.

| Entry | Where | What opens |
|---|---|---|
| `New script` | Automation, `My tasks`, in the panel header's action slot, `.btn .btn-xs .btn-outline` | the studio with the template picker (Spec A's nine examples) |
| `Edit` | a user or fork script card, the row it already has | the studio on that document |
| `Fork` | a library script card, the row it already has | fork as today (`forkSeed`, `forkIdFor`), then the studio on the new document |
| `Open in studio` | the run card, **replacing `Trace`** while a run is live | the studio on the running script, with the `live` badge and the Console tab open |

Two of those placements are exact where the earlier draft was approximate, and the difference
matters because this entry claims to compose only patterns that exist:

- **`New script` does not hang off a section label**, because `My tasks` has none. In the mock the
  segmented tabs are followed straight by the script cards, and the only `SectionLabel` rows in
  that panel are `Run snippet` and `History` (mock lines 229 to 257). The system also has no
  "section label with a trailing action" row anywhere. Rather than invent one, `New script` goes in
  the Automation **panel header**, beside the title, which is a slot the header already has room
  for and which reads correctly as a panel-level verb rather than a list-level one. If the owner
  would rather it sat over the cards, the cost is a new `label plus trailing action` pattern with
  its own styleguide entry, added by this entry; that was owner question 17, ruled in section 24.
- **`Open in studio` replaces `Trace` on the run card**, it does not become a fifth control. The
  run card's action row is three equal `flex:1` 27px buttons in a 280px panel (Pause or Resume,
  Trace, Stop; mock lines 205 to 228), and the handoff says the run card is patched in place rather
  than rebuilt, so a fourth button makes each about 62px wide and a wrap makes the card taller than
  the mock draws it. `Trace` is the right one to give up **only while the studio is open**: the
  studio's Console tab is the same stream, and the trace window is occluded by the studio anyway
  (section 4.3). So the rule is: while the studio is closed the row is unchanged; while it is open,
  `Trace` reads `Open in studio` and focuses the existing window instead of opening a second one.

The mock already settles the verb grammar: you fork what you do not own and you edit what you do,
and `Edit` and `Fork` are mutually exclusive per card, matching `source: 'user' | 'fork' |
'library'`. The studio adds no new verbs; it adds the missing one, `New`.

There is also a programmatic handle, `window.idlescape.studio`, with `open(docId?)`, `close()` and
`state()`, mirroring `window.idlescape.tasks`, for Playwright and for SP4c. About fifteen lines,
and it is what makes the Playwright suite in section 18 possible.

## 6. Regions

```
+------------------------------------------------------------------------+
| Script studio  [name.......]  [Valid]  [live on Zezima]            [x]  |
+-----------+---------------------------------------------+--------------+
| SCRIPTS   |  1  export default defineScript({           |  HELP        |
| [+ New]   |  2    id: 'mine-and-bank',                  |  c.travel.to |
| card rows |  3    tasks: [                              |  signature   |
| 190px     |                                             |  doc comment |
|           |                                             |  example     |
|           +---------------------------------------------+  300px       |
|           | [ Problems | Console ]          3 problems  |  (toggled)   |
|           | ERR 12:5  c.find.nearest expects a kind     |              |
+-----------+---------------------------------------------+--------------+
| v6 · 2 tasks · 1 param · saved 2 min ago · Ln 12, Col 5 · 12.4 KB / 64 KB |
| [Run]  [Save]                                    [Pause] [Stop]          |
+------------------------------------------------------------------------+
```

- **Script rail**, 190px: the account's scripts as the mock's script cards at reduced width, with
  provenance badges (`Library` info, `Fork` accent) already drawn in the mock, a `New` button at
  the top, and a marker for an unsaved draft. A **flat list, not a tree**: storage is flat, and a
  `Tree` family would model nesting that does not exist.

  **No per-row overflow menu.** An anchored overflow is a popover family, the design system has
  none (the component table ends at CharTab), and section 6.1 lists "a popover family" among the
  things this entry does not add, so specifying one here was this document contradicting itself.
  The row's verbs go where the mock already puts row verbs: the open row grows a second line of two
  `.btn-xs .btn-outline` buttons, `Duplicate` and `Delete`, exactly as the mock's script cards
  carry `Run`/`Fork` and its history rows carry a 22px outline `Trace` (mock lines 241 to 262).
  `Rename` is not among them because it already has two affordances, `F2` and the header name
  field. All three verbs are also palette commands, which is the keyboard route and costs nothing
  because the palette registry already exists.

  **The open row and the dirty row are two different signals and carry two different marks.** The
  open row takes the card's 3px accent rail, which is the accent's reserved meaning ("current
  thing") used correctly. The dirty marker is a **`.dot .dot-warn`**, not an accent dot: an unsaved
  draft is a status, the semantic hues are reserved for status, and an accent dot here would
  collide both with the open row's rail and with the run card's live-run accent. Naming the tone is
  the point; StatusDot ships `ok`, `accent`, `warn`, `error` and `idle`, and leaving it unnamed
  invites the one that reads as a second "current thing".
- **Editor**: section 7.
- **Bottom dock**, 160px, collapsible, a `.seg` switch over `Problems | Console` with the tab roles
  from section 4.4. Both use the trace window's row grammar unchanged: `ui-monospace` 10.5px, rows
  `padding:2.5px 10px; border-left:2px solid <rail>`. **The two tabs do not share a rail
  vocabulary, and saying "the grammar unchanged" for both was wrong.** The Problems tab has one
  axis, severity, and four rails: `--error #e53935`, `--warn #ffb300`, `--info #4a90d9`,
  `--ok #43a047`. The Console tab renders the same event stream the trace window does and therefore
  **reuses `traceView.ts`'s existing kind-to-rail map wholesale**, which is six treatments, not
  four: `#ff981f` for `task_enter` and `run_done`, `#4a90d9` for `action`, `#43a047` for `xp`,
  `#ffb300` for `stuck` and `paused`, `#e53935` for a failure, and `2px solid transparent` for a
  plain `log` row (mock lines 125 to 134). Anything else and the same row looks different in the
  two places ruling 13 says a player may watch at once. A Problems row click moves the cursor to
  the diagnostic's range.
- **Help pane**, 300px, toggled by `Ctrl-Shift-D` and remembered under `cs.studio.help`, default
  closed on first open, auto-closed below 860px of window width per section 4.1. Section 12.
- **Footer**: the meta line and the run bar (section 10).

**Empty states use the quieter Events pattern**, not the bobbing dashed Loot circle: 34px circle,
`1.5px dashed #4e4e4c`, no animation, title 12.5px, copy at `max-width:180px`, `gap:7px;
padding:28px 12px`, and a 24px grey action button (mock lines 364 to 370). This is a developer
tool, and an animation inside a window that is already entering on `popIn` is one motion too many.

**What goes inside the circle, which the mock answers and section 8.5 appears to forbid.** The mock
puts a decorative unicode glyph there, `⌕` for Events and `◌` for Loot, while section 8.5
refuses the mock's `⚠` on the grounds that the brand guide bans decorative glyphs, and the drawn
eleven-icon set has no search, code, file or docs glyph to substitute. The two are reconcilable and this
document reconciles them rather than leaving a reader to guess: **the circle is empty.** A 34px
dashed ring with nothing in it is already the pattern's whole visual signal, the title carries the
meaning, and an empty ring is the one answer that needs neither a glyph the guide bans nor an icon
the set does not have. Recorded against the section 8.5 rule so the two read as one decision.

Two empty states are needed: "no script open", whose action button opens the template picker, and
"no problems", which has no action.

**Validation blocking a run uses the Alert**, not the mock's bare amber line, because the Alert is
the composed one. A blocked `Run` keeps its orange gradient at `opacity:.35`, per the mock's own
decision that "cannot run yet" is distinguished from "not the main action" by opacity alone.

### 6.1 What it composes, and the two families it adds

Composed unchanged: `.btn` and its sizes, `.badge`, `.tag`, `.dot`, `.alert`, `.section-label`,
`.input`, `.seg`, `.card`, `.kv`, and the trace row grammar. Exactly one primary button at a time:
`Run` is primary when the buffer is saved and valid, `Save` when it is dirty.

Composed but **not added here**: the `Window` family (section 4.2). D22 gives it, its class names
and its file to entry 2, and the shell v2 plan's Task 7 builds the chrome; this entry composes
`.window` unmodified and creates no window family, no `window.css` and no `ui/window.ts`. Its
styleguide section is entry 2's too.

Added to the library, with its `web/styleguide.html` section in the same change:

1. **`OverlayList`**, a filtered list, used by the command palette **and** by the completion popup,
   so one family pays for two features. Its markup helper is `web/src/ui/overlayList.ts`.

**`OverlayList` is therefore the one genuinely new visual family in this entry, so it is drawn here
rather than left to the implementer.** Every other surface in this document is transcribed from the mock;
this one has no mock to trace, because the bundle has no filtered list. Its literals, all from
existing tokens:

| Part | Value |
|---|---|
| container | ground `var(--card)` `#232325`, border `1px solid var(--hairline)`, radius `var(--r-card)` 8px, shadow `0 20px 60px rgba(0,0,0,.65)`, `overflow:hidden` |
| search row | the `.input` family unchanged, 24px, `var(--sunken)` ground, sitting on `padding:6px` above the list |
| list | `max-height: 320px; overflow-y:auto; padding:4px 0` |
| row | `var(--ctl-h-xs)` 22px, `padding:0 10px`, `font-size:11px`, `color:var(--text)`, group label on the right at `var(--text-faint)` `font-size:10px` |
| active row | the Segmented active treatment: `background:var(--accent-tint)`, `color:var(--accent)`, weight 650. Hover is `background:var(--control)` and does **not** move the active row |
| no match | one 22px row reading `No matches`, at `var(--text-faint)`, not an empty-state circle |

**No scrim and no blur, and it does not join the overlay stylesheet.** The earlier draft filed it
under "the existing overlay family", which is wrong in this design system: `overlay` means
`OverlayPill` and `HudPill`, which the brand guide calls "the ONLY language over the canvas" and
draws as a black scrim `rgba(0,0,0,.62)` with a tone-tinted 1px border, a 3px radius and a
2px backdrop blur. The same guide restricts transparency and blur to surfaces over the game canvas
and forbids them inside panels. An `OverlayList` inheriting that family would read as canvas chrome
sitting inside a window. It gets its own file, `web/src/styles/overlayList.css`, per gaps spec G9's
one-file-per-family rule, and its own styleguide section.

**Where it anchors.** The palette instance is centred in the **studio window**, not the frame, at
`top:80px` with `translateX(-50%)` and `width:min(520px, calc(100% - 48px))`: it is a studio
command list, and a palette floating over the whole frame would imply commands the frame does not
have. The completion instance is CodeMirror's own tooltip element restyled to these literals and
positioned by CodeMirror at the caret, with `max-height:220px` and no search row. Section 6.1 says
that out loud rather than pretending the popup is ours.

Not added, and deliberately: a document tab strip (one buffer at a time), a tree, split panes, a
resizer, a diff view, a toolbar, a minimap, a popover family. The completion popup is CodeMirror's
own element restyled to `OverlayList`'s literals, and the spec names that out loud rather than
pretending otherwise.

## 7. The editor engine

### 7.1 The choice: CodeMirror 6

Reasons, in order:

1. **It can be driven from `tokens.css`.** CodeMirror themes are plain style-spec objects whose
   values are CSS strings, so every colour in the editor is `var(--sunken)`, `var(--accent)`,
   `var(--text-faint)` and moves when a token moves. Monaco's theming is a token-colour JSON model
   that cannot read our tokens, which would make the studio the one surface in the app not
   following the stated design authority, and the one surface someone re-themes by hand every time
   the palette moves.
2. **The cost curve is right.** About 185 KB gzipped buys the whole editor. Monaco is roughly 3 MB
   gzipped shipped and 93.4 MB installed, for one surface, in a repo whose entire stylesheet layer
   is 1,099 lines across 14 files.
3. **Monaco gives away the part this project can build and charges for the part it cannot absorb.**
   It makes the inner text rectangle free and the outer window (rail, dock, palette, help pane)
   no easier, and the outer window is the half with a published design authority.
4. **V0 and V2 validation are free** from the lezer tree CodeMirror already builds. In Monaco the
   same rules are a second AST pass.
5. **Vite needs no plugin and no config change.** Monaco needs a `MonacoEnvironment` shim,
   per-label `?worker` imports and grammar pruning, and its `getWorkerUrl` style is exactly the
   shape that 404s under `server/src/router.ts`'s assets-only filter: a production-only failure
   that works in dev.
6. **The deferred option stays cheap.** `linter()` takes an async source, so phase 2's type
   checking is one new file plus one entry in the extension array. Choosing CodeMirror now does not
   spend the option; choosing Monaco spends three megabytes to buy an option we are not exercising.

Packages, all MIT, pinned exactly: `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`,
`@codemirror/language`, `@codemirror/search`, `@codemirror/autocomplete`, `@codemirror/lint`,
`@codemirror/lang-javascript`, `@lezer/javascript`, `@lezer/highlight`.

### 7.2 Vendoring plan

The project convention vendors third-party code under `web/src/vendor/` with its licence and a
`PATCHES.md`, never edited in place without a patch note. That convention exists for code we copy
and might patch, as `rs-sdk` is.

**Recommendation: pinned exact npm dependencies, with a section in `web/src/vendor/PATCHES.md`
recording the decision.** Ten small ESM packages whose whole value is tree shaking are not
hand-copyable without becoming unmaintainable, copying them freezes us out of upstream fixes, and
`firebase` is already a plain npm dependency. The `PATCHES.md` section names each package, its
exact version, its licence (MIT throughout), the measured size, and the reason it is pinned rather
than copied, so the next reader does not go looking under `vendor/`.

This reads a stated convention narrowly rather than ignoring it silently, so it is ruling 3 and
was owner question 3, ruled in section 24. If the owner wants literal vendoring, the cost is a `vendor/codemirror/` tree of
roughly 590 KB of source plus a manual upgrade path, and it should be priced into the entry.

### 7.3 Theme

**Near-monochrome, in one file, `web/src/studio/editor/theme.ts`.** The brand guide is explicit:
one accent, orange `#ff981f`, meaning "current thing / main action / Claude is driving", nothing
else orange, and the semantic hues reserved for status. A syntax theme is by definition colour
spent on non-status meaning, so a coloured theme would make a green string and a green "run
succeeded" dot mean two different things in one window.

| Surface | Value |
|---|---|
| ground | `var(--sunken)` `#141416` |
| body text | `var(--text)` |
| keywords | `var(--text-strong)` at weight 650 |
| comments | `var(--text-muted)` `#7c7c7a`, **not** `--text-faint`: `#575755` on `#141416` is a likely contrast failure, so take the next rung rather than measure and redo |
| punctuation | `var(--text-muted)` |
| strings, numbers | `var(--text-strong)`, no hue |
| gutter digits | `var(--text-faint)` |
| cursor | `var(--accent)`, the one accent use, and a cursor is unambiguously "the current thing" |
| selection | the global `::selection rgba(255,152,31,.35)`, inherited |
| matching bracket | `var(--accent-tint)` `rgba(255,152,31,.15)` |
| active line | `rgba(255,255,255,.03)` |
| focus ring | re-created on `.cm-editor.cm-focused` as `border-color: var(--accent); box-shadow: var(--focus-ring)`, because the base focus rule is element-based (`tokens/base.css:7`) and a `contenteditable` div gets nothing for free. Written as tokens, not as `#ff981f` and `0 0 0 3px rgba(255,152,31,.18)`: both values already exist as tokens, and a raw hex in this table would fail the very test the next paragraph specifies. The rule lives in `editor.css` beside the other `.cm-*` overrides, not in `theme.ts`, because it is a container-level rule rather than a CodeMirror style-spec value; section 19 lists it there only |
| font | `var(--font-num)` at 11px, `var(--lh)` 1.45, matching the `.code` textarea the design system already defines |
| scrollbars | inherited from base (`thin`, `#3c3c3c` on `#1a1a1c`); the library is prevented from shipping its own |

A unit test asserts that the theme object contains **no literal hex value anywhere**, only
`var(--token)` references. That single test is what keeps the editor on the token layer forever.

This is the least VS Code-looking answer and it is a **one-file reversal**: if the owner wants
colour, a bounded exception scoped to `.cm-editor` replaces `theme.ts` and nothing else changes.
That reversibility is why this document takes the conservative side.

### 7.4 Language: JavaScript, checked, never transpiled

User scripts are JavaScript, and the editor is `javascript({ typescript: false })`. Phase 2's type
checker uses `allowJs: true, checkJs: true` against generated declarations, which type-checks the
JavaScript the runtime actually executes with **no transpile step, no change to
`compileUserScript`, and no change to `UserTaskDoc.code`**.

Real TypeScript is cut. It means two artefacts per script, a Firestore decision about which is
canonical, and source maps before a runtime error can name a source line. It is a bigger change to
the runtime than to the editor and it deserves its own decision.

Rejected dependencies, so nobody reintroduces them from a README: `@valtown/codemirror-ts` (stable
channel unmoved since 2024-12-28, and its documented setup calls `createDefaultMapFromCDN`, a
run-time third-party fetch a self-hosted box must not make), `@typescript/vfs` and `comlink` (both
replaceable by about 150 lines over the repo's own `web/src/agent/rpc.ts` conventions).
`typescript` stays pinned on the 5.x line, because `typescript@latest` now resolves to 7.0.2, the
native port.

## 8. The validation model

Four mechanisms at four prices. Separating them is most of the design, because "API validation"
covers all four and only one of them costs a megabyte.

| Tier | What it catches | Where it runs | Latency | Cost | Blocks |
|---|---|---|---|---|---|
| **V0 syntax** | unbalanced braces, bad tokens, with real character ranges | main thread, the lezer tree CodeMirror already builds | instant | free | Save |
| **V1 shape** | the `defineScript` id regex, an empty `tasks`, duplicate task names, a task missing `when` or `run`, the 64 KB cap, and (new) param defaults that do not satisfy the script's own schema | a **short-lived compile worker the studio owns**, importing `web/src/tasks/defineScript.ts` and nothing else; see below | about 50 ms, debounced 750 ms, forced on Save by `forceLinting(view)` | about 120 lines of glue, about 2 KB gzipped | Save |
| **V2 structure** | the fourteen rules in 8.2 | main thread, one walk of the same lezer tree | instant | about 580 lines of rules, about 5 KB gzipped | Run, not Save |
| **V3 types** | `c.bot.chopTre`, wrong arity, `c.find.nearest('tre')` against `ResourceKind`, wrong argument types | a second, lazily loaded, opt-in worker holding `ts.createLanguageService` over Spec A's generated declarations | 300 to 800 ms cold, 5 to 40 ms warm (estimates, section 17) | about 1.04 MB gzipped | nothing |

**V1 must not run in the agent worker, and this is the correction that matters most in section 8.**
The earlier draft routed V1 through `workerHost.compile` on the grounds that "no second evaluator
is created anywhere". That is true about the *count* of evaluators and misses what changes about
the *timing*. `compile` in the agent worker calls `compileUserScript`, which runs the script body
through `new Function` and **executes its module-level statements** (`defineScript.ts:42-43`).
Today that happens once, on an explicit save or run. Debounced at 750 ms it happens on incomplete
text, every three-quarters of a second of typing, **inside the per-character worker that is driving
the live run**. `case 'compile'` and `case 'pause'` are consecutive arms of the same message loop
(`worker.ts:128-131`), so a half-typed `while (true)` or a heavy top-level loop blocks that thread:
the run stops stepping, and the `pause('player')` the Escape ladder posts queues behind it. That
defeats the exact property ruling 4 exists to protect, and nothing in section 18 would have seen
it. It is also not something a reviewer should have to notice; it is a spec-level mistake.

**So the studio owns a compile worker of its own**, and V1 runs there:

- `web/src/studio/compile/worker.ts` imports `web/src/tasks/defineScript.ts` and nothing else. It
  receives no `Transport`, imports nothing under `web/src/agent/`, and its protocol carries code in
  and `{ ok, manifest?, message?, line?, column? }` out. This is exactly the rule 15.5 item 2
  already applies to the phase 2 type-check worker, and the same eslint `no-restricted-imports`
  boundary and the same static-import unit test cover both.
- It is **terminated and restarted on a 500 ms watchdog**, which is the whole reason a separate
  worker is affordable: a half-typed infinite loop kills a throwaway thread and produces one
  `Script did not finish compiling` diagnostic, instead of freezing the character.
- The **agent worker's `compile` message is reserved for explicit Save and Run**, which is what it
  does today, unchanged.
- This also removes a change the earlier draft implied but never listed: `TasksApi` carries no
  `compile` (`api.ts:43-77`), `host.compile` is a `WorkerHost` method reachable only inside
  `wireTasks`, and `tasks/router.ts` forwards `TasksApi` members only, so routing V1 through the
  api would have meant widening `TasksApi`, `router.ts` and their tests. It does not, and section
  19 lists neither. Section 15.4's rule that the studio holds nothing but the router still stands:
  a worker that receives no transport is not a second path to the character.
- The **new param-defaults check moves with it**, and moves one level lower than the earlier draft
  put it. Rather than living inside the agent worker's `compile` handler, `defineScript.ts` gains
  an exported `checkParamDefaults(manifest): string[]` running
  `validateParams(schema, defaultsOf(schema))`, so the agent worker's compile, the studio's compile
  worker and `api.save` all reach one implementation. It returns diagnostics and never fails the
  compile: a script with a bad default must keep running, or this becomes a behaviour change to
  existing scripts rather than a warning about them. Feeding `{}` instead of the defaults would not
  work, because `validateParams` short-circuits an absent key straight to `f.default`
  (`defineScript.ts:21-22`), which is precisely why a bad default goes unnoticed today.

**No evaluator is added to any surface that was not already evaluating.** V0 and V2 are read-only
walks of a syntax tree that never execute. V3 parses and checks and does not evaluate. The
completion source reads a JSON file. The one place script text is evaluated on a keystroke is a
disposable worker with no transport, no agent import and a kill timer. That paragraph belongs in
the plan verbatim, because "add a linter" is exactly the shape of change that quietly adds an
evaluator to a thread that was doing something else.

**The alternative, considered and declined**, was to pay for no second worker: gate the debounced V1
on `api.status().state` being idle, and state in this section that live-typing shape diagnostics are
unavailable while a run is moving. That is cheaper and strictly worse, because the moment a player
most wants shape feedback is while watching their script run. So it is ruling 20 and was owner
question 18, ruled in section 24.

### 8.1 Manifest and params validation

With the compiled manifest persisted (section 9.2), the studio renders the real params form beside
the editor, which nothing can do today.

The one new check is that a script's own param defaults satisfy its own schema, and it lives in
`defineScript.ts` as `checkParamDefaults`, for the reasons and with the mechanics given at the end
of section 8. About ten lines plus the `defaultsOf` helper, no new message, one implementation
reached by all three compile paths, and a script whose `select` default is not one of its own
options is caught at save time rather than at run time.

Both `validateParams` implementations stay where they are: `defineScript.ts`'s is the Worker's and
remains authoritative, `params.ts`'s is the api's. The studio adds no third copy.

### 8.2 The fourteen V2 rules, and the standard they enforce

Each is a named export under 40 lines with its own test, receiving the lezer tree and returning
`Diagnostic[]`. Every one of them turns a rule that exists today only as prose into a diagnostic,
which makes this the cheapest quality win in the request.

**The rule list is not this document's, and that is the point.** The standard is
`2026-09-07-script-api-survey-and-standard-design.md` section 4, rules S1 to S12, and its P20
declares `web/src/tasks/standard.ts` as the **one** statement of the lintable subset, read by the
validator and rendered by the reference. This table is the validator's half of that declaration:
every row cites the standard rule it enforces, and the lint ids, the clauses they enforce and their
severities live in `standard.ts` with a test asserting that this directory's exports and that
module's list agree. That is the same one-list-many-consumers shape `web/src/tasks/forbidden.ts`
already uses in the first row, extended to the rest, and without it the standard and the linter are
two documents that can disagree. `standard.ts` is created by the survey spec's P20, in entry 3's
first task, so it exists before this entry starts.

**`standard.ts` carries two shapes, not one, and D28 is why.** P20's first draft declared a single
`StandardRule { id: ``S${number}``; title: string; severity: 'error' | 'warn' }`, which cannot hold
this table: these ids are kebab-case lint names rather than `S`-numbers, `no-static-widget-id`
cites a clause and a proposal, and three of the fourteen are `info`, which that union excludes. P20
now declares `STANDARD` (the twelve clauses) beside `LINTS` (`id: string`, the clause or clauses it
enforces, `severity: 'error' | 'warn' | 'info'`), and this table is `LINTS`. **The severity
vocabulary is `error`, `warn` and `info` in both documents**: this table used to spell the middle
tier "warning" in prose while the module spells it `warn`, and a string-comparing agreement test
fails on that alone.

| Rule | Standard | Severity | Message |
|---|---|---|---|
| `no-forbidden-globals` | S10 | error | the identifiers in `web/src/tasks/forbidden.ts` are not available to a script. **The list is not restated here or anywhere else**, because two hand-written copies of a security list in one document is how they drift; see section 15.2 for the list itself and for the `addEventListener` decision, and see the four-way agreement test named there |
| `no-eval` | S10 | error | `eval` and `new Function` cannot be used in a script |
| `no-transport-escape` | S10 | error | `sdk.transport` reaches the raw transport; use `c.bot` or `c.sdk` |
| `no-dom` | S10 | error | `document` and `window` do not exist in the script Worker |
| `untrusted-text` | S10 | info | chat, dialogue and interface text are untrusted; do not branch on them without a pattern |
| `no-fixed-sleep` | S7 | **error** | a `setTimeout` sleep drifts against the game tick; use `c.wait.ticks` or `c.wait.until` (ships the one quick fix) |
| `no-legacy-wait` | S7 | warn | `sdk.waitFor*` throws on timeout and ignores the abort signal; use the `c.wait` equivalent |
| `wait-until-needs-label` | S7 | info | give `c.wait.until` a `label` so a timeout is legible in the trace |
| `no-await-in-when` | S2 | error | a `when` predicate is synchronous and must not `await` |
| `no-captured-signal` | S2 | warn | `c.signal` is a getter; the runner swaps it between tasks, so a cached copy misses your own task's abort |
| `no-unbounded-loop` | S2 | warn | a `while (true)` with no `await` in its body will hang the Worker |
| `no-static-widget-id` | S5, P15 | warn | a bare component number breaks on a content bump; use the `INTERFACE` registry |
| `no-deprecated-member` | S12 | warn | carries the generator's own `deprecated` string, so the rule needs no list of its own |
| `manifest-has-description` | S11 | info | a script with no description shows an empty card. P20's enforcement map listed S11 as the docs companion's gate 2 only; that gate covers **our own declarations**, and this lint covers **a script's own manifest**, so the two do not overlap and the map now names both |

**Four of those fourteen are new here**, added because the standard needs them and this is the only
surface that can check them: `no-static-widget-id`, `no-legacy-wait`, `no-captured-signal` and
`no-deprecated-member` (survey spec section 6.3 item 2). All four are lezer-tree walks of the same
shape as the ten this document already had. `no-deprecated-member` reads `api-index.json`'s
`deprecated` field, so it needs no list of its own and cannot drift from the generator.

**`no-fixed-sleep` is an error, not a warning, and it blocks Run and not Save.** This was the one
substantive disagreement between this document and the standard (survey spec section 6.3), and it
is **resolved in the standard's favour** under D11: S7's "no fixed sleeps" is the rule the survey
supports most strongly of any (twelve of nineteen systems make a condition-plus-timeout wait the
sanctioned primitive; Microbot makes it non-negotiable in the agent contract its coding agents work
under), and a standard whose strongest rule the validator declines to enforce is not a standard. It
takes the tier this document already gives `no-eval` and `no-await-in-when`: a draft may contain a
fixed sleep, a run may not. This is cheap to comply with rather than punitive, because
`no-fixed-sleep` is the one rule that ships a quick fix. Reversing it means moving this severity and
softening S7 to "discouraged" in the same edit; the two move together or not at all.

Every rule reports a **range**, not a line, and every test asserts the range as well as the
message: a diagnostic with the wrong range is a bug a message-only assertion cannot see.

### 8.3 Completions and hover, without a compiler

The completion source and the hover cards read Spec A's `api-index.json`. After the context root
and after each of its namespaces, the list is the real member set with the real doc comment in the
info panel, and `enums` gives string-literal completions for `ResourceKind` and the other closed
sets. It is member-aware rather than type-aware, which covers the case a player actually hits: what
is this called and what does it take.

**The trigger prefixes are derived, never enumerated in code.** `editor/complete.ts` builds the
trigger set at load time from the index's members whose `kind` is `'namespace'`, which today
resolves to `c.`, `c.bot.`, `c.sdk.`, `c.find.`, `c.travel.`, `c.wait.`, `c.health.` and
`c.tutorial.` and will resolve to whatever the surface is on the day it runs. Writing that set out
as a literal, in the entry whose whole purpose is to stop the API being hand-listed, would mean a
namespace added by SP4c or a later entry silently gets no completions: Spec A's gate 6 forces a new
`ScriptContext` member into `scriptApi.ts` and into the index, but nothing would force it into a
literal here. Section 18.2 gains a unit-test bullet asserting the derived set equals the index's
namespaces for a fixture carrying an unfamiliar namespace.

**Completions surface `deprecated`, and hover cards render the notice.** The generator emits
`ApiMember.deprecated?: string` and S12's whole deprecation path depends on a player seeing it: a
completion that offers a deprecated member without saying so actively works against the standard
(survey spec section 6.3 item 3). A deprecated member is offered with its notice in the info panel
and sorted below its replacement, never hidden, because hiding it would break the code of a player
who is reading their own script. The `no-deprecated-member` lint in section 8.2 reads the same
field, so the completion and the diagnostic cannot disagree.

It cannot drift, because Spec A gate 1 guards the JSON. And it fixes a class of bug already sitting
in the tree: SP4b plan task 13 step 2 tells its implementer to call `c.sdk.sendClickTab` and then
to "check its exact name", when the real method is `sendSetTab`. A completion list generated from
the surface catches that at authoring time, for an agent as much as for a player.

### 8.4 Compile errors get a real position

`compileUserScript` returns `err.lineNumber`, which is SpiderMonkey-only, so under V8 the current
editor has a message and nothing to point at. The fix, about twenty lines in `defineScript.ts`:
parse `err.stack` for the V8 anonymous frame and subtract the wrapper's prologue offset, falling
back to `err.lineNumber` and then to `undefined`, returning `{ message, line, column }`.

The offset must come from **one shared `PROLOGUE_LINES` constant**, because section 15.2's global
shadowing changes the prologue's length and two literals in two files would drift on the first
edit. One unit test per engine shape.

This improves `api.save` for every caller, including the Automation panel's existing alert and
SP4c's `compile_error` tool, not only the studio.

### 8.5 What the player sees

One grammar for all four tiers: a squiggle over the range, a gutter marker, a Problems row in the
trace row grammar railed by severity, and a count badge in the header. Each `Diagnostic` carries a
`source` tag of `'syntax' | 'shape' | 'structure' | 'types'`, so the pane can group them and a
player can tell which mechanism is talking. Quick fixes ride on `Diagnostic.actions`; only
`no-fixed-sleep` ships one at launch.

The mock's `⚠` character is not used anywhere: the brand guide bans emoji and decorative glyphs,
and the Alert rail or a `.dot` says the same thing in the system's own vocabulary.

**V3 never blocks anything.** `checkJs` on valid JavaScript produces false positives, and a
blocking check built on that would be a trap. It is advisory, prominent, and off by default until
the harness in section 17 measures it.

## 9. Scripts: add, remove, rename, fork, duplicate, and storage

### 9.1 The verbs

| Verb | Mechanism | Change from today |
|---|---|---|
| **New** | `api.save` with no `id`, seeded from one of Spec A's nine examples through the template picker | The affordance that does not exist anywhere today |
| **Edit** | opens the studio on the document | Replaces the inline textarea at `tasks.ts:160-181`, which is deleted |
| **Rename** | the header name field, written with the next Save, bounded client-side to 1 to 60 characters to match `firebase/firestore.rules:39`. It does **not** touch the `defineScript({ id })` in the code, and the studio says so in a hint, because renaming the manifest id orphans the run history keyed on it | New, and free |
| **Duplicate** | `api.save` with no `id`, the same code, the name suffixed, and the manifest id suffixed by the existing `-fork`, `-fork-2` scheme | New. It is what players do before a risky edit |
| **Fork** | unchanged: `forkSeed(libraryId, forkId)` over `librarySource`, then open the result | Only the entry point moves |
| **Delete** | `api.remove(id)` behind `confirmDialog` with today's copy verbatim ("This removes the script from your account. Runs already in your history stay."), **plus** deleting the orphaned `users/{uid}/scriptToggles/{scriptId}` document, which nothing cleans up today. That cleanup needs three things, not one; see below. The studio refuses the delete while a run of that script is in flight, reusing the `busy` wording; this is a studio-side check against `api.status()`, not a new error code on `api.remove` | The toggle cleanup and the refusal are new |
| **Install** | unchanged, stays in the Marketplace. Opening an installed library reference (`code: ''`) shows the library source read-only with a `Fork to edit` primary and an info Alert | Read-only opening is new |

**Everything the studio scaffolds follows the standard's S1.** The New-script templates are Spec
A's nine examples, the fork seed is `forkSeed` over `librarySource`, and the snippet console's
starting text is this entry's. All three are the first API a player or an agent session reads, so
none of them may invent its own naming: camelCase members, verb or verbNoun methods, noun
accessors, predicates reading as predicates, no abbreviated domain words, and a closed string union
in `snake_case`. The nine examples inherit this from entry 3, which lands them after the phase-now
proposals for exactly this reason; the snippet starting text is reviewed against S1 in this entry's
own review (survey spec section 6.3 item 4).

**Deleting the toggle document needs a rules change, a store method and a test, and without the
first it fails silently in production.** The `scriptToggles` block in `firebase/firestore.rules`
has `allow read` and one `allow write` carrying `request.resource.data.enabled is bool`, and no
`allow delete` (rules:29-34). A delete carries no `request.resource`, so that shape check raises a
null-value error and denies. This is exactly the trap the neighbouring `tasks` block documents in
its own comment and works around with a rule of its own (rules:43-45). So:

1. `firebase/firestore.rules` gains `allow delete: if request.auth != null && request.auth.uid ==
   uid;` in the `scriptToggles` match, alongside the optional `manifest is map` guard section 9.2
   already puts in that file.
2. `web/src/tasks/toggles.ts` gains `remove(id)` on `ToggleStore` and `ToggleBackend`, clearing the
   local `cs.script.<id>` mirror as well as the document; it exposes only `isEnabled`/`setEnabled`
   over a `setDoc` today (toggles.ts:27-41). It joins section 19's Modified list.
3. The emulator test asserts the delete succeeds and that a re-created script of the same id starts
   enabled, because "absent means enabled" is the store's rule and a half-cleaned toggle would
   silently disable a new script.

Without step 1 the delete fails with a permission error in production **and** in the emulator, and
the studio would report a successful removal while leaving the toggle behind, which is worse than
not cleaning up at all.

**Forking a multi-file library script is refused with an explicit message.** SP4b task 13's
eleven-module `tutorialIsland` has no seed under the flat `SOURCES` map, and the studio must not
paper over that with a concatenation that would not compile. It says "This script is built from
several files and cannot be forked yet", and section 20 records it as known and unfixed.

### 9.2 The one storage change worth making

`UserTaskDoc` gains one optional field:

```ts
  /** The manifest `host.compile` returned at save time. Absent on documents saved by older builds. */
  manifest?: StoredManifest;
```

`StoredManifest` is what `manifestOf` produces at `web/src/agent/workerReport.ts:71-82` (the
`ScriptManifest` minus `custom` requirements, which cannot cross the Worker boundary) **with every
undefined-valued key pruned**. The pruning is not tidiness, it is the difference between the
feature working and throwing on the first script:

`manifestOf` returns an object literal that names `tags`, `author`, `order`, `params`, `requires`,
`stuckAfterMs`, `maxAttempts`, `hardStop`, `estimateMinutes`, `health` and `anchor`
**unconditionally**, so every absent optional is an own property whose value is `undefined`, and
structured clone across `postMessage` preserves own properties with undefined values.
`web/src/firebase.ts:14` is a bare `getFirestore(app)` with no `ignoreUndefinedProperties`, so
`setDoc` throws `Unsupported field value: undefined` on the first script that omits any one of the
eleven, which is most scripts. This is exactly why `userStore.save` attaches `libraryId`,
`pinnedVersion` and `lastRun` conditionally, under the comment "leave absent optionals out entirely
- Firestore rejects explicit `undefined` values" (`userStore.ts:123-127`).

So a `storedManifestOf(m: ScriptManifest): StoredManifest` sits beside `manifestOf` in
`workerReport.ts`, drops every key whose value is `undefined`, and `StoredManifest` is typed as
that pruned shape. It is about six lines. **The test that matters is a manifest carrying no `tags`,
no `requires` and no `health` round-tripping through a save**, because a fixture manifest with
every field populated passes either way and is the test somebody would otherwise write.

This is the highest-value line in the entry and it is nearly free. Today `api.save` receives the
manifest and throws it away, so `catalogue.userRow` hard-codes `params: {}`, `api.run` validates a
user script's params against an empty schema that passes any scalar straight through, and a bad
value fails the run instead of the form. Persisting it gives every user script a real params form,
real declarative requirements, real tags, a real estimate and a real health policy on its card, and
it **deletes the second compile per run** in `declaredRequires`, taking a user script from three
compiles per run to two.

Scope: `userStore.ts` carries the field through the full-replace write, `api.ts` stops discarding
it and reads `requires` and `params` from it, `catalogue.ts` reads it in `userRow`. The migration is
a no-op: absent means exactly today's behaviour until the document is next saved.

**No Firestore rules change is required for `manifest`**, because the `tasks/{taskId}` rule
validates named fields and does not use `hasOnly`. One optional guard is added anyway for hygiene,
written so an absent field still passes:

```
&& (!('manifest' in request.resource.data) || request.resource.data.manifest is map)
```

That is the only rules change **this section** needs. Section 9.1's toggle cleanup needs a second
one in the same file, an `allow delete` on `scriptToggles`, and that one is not optional: without
it the delete is denied. The two land together.

Everything else about storage is unchanged: the path, the full replace with `merge:false`, the
version bump per save, the 64 KB cap, the 60-character name, and the deliberate split between the
Firestore doc id and the `defineScript({ id })` at `api.ts:188-191`.

**The 64 KB cap stays.** Firestore rejects a `code` string at or above 65,536 characters. Raising
it means chunking across documents, which means a merge story, which means a new mechanism. The
footer figure makes the cap visible instead.

### 9.3 Multi-file is cut, and the seam is preserved

One script stays one text blob, matching `UserTaskDoc.code`. Files would mean a module system
inside `new Function` (imports are deleted by a regex today), a storage-schema change, a fork-seed
story, and a tab strip the library does not have.

**The seam survives the cut**: the buffer model is keyed by `docId + path`, with `path` always
`'index.js'` today, so a later `files?: Record<string, string>` field does not rewrite the studio.
Section 20 lists what cutting it leaves open.

## 10. The run bar and live-edit semantics

**Ruling: Save always succeeds and never touches a running Worker; restart is one explicit click.**

Refusing the save is wrong: the save writes a per-account document and the run is a per-character
Worker holding a frozen code string, so there is no correctness reason to refuse, and refusing means
a player who spots a bug mid-run must kill a forty-minute run to write the fix down.

Hot-swapping at the next task boundary is also wrong, and it is the seductive one. The run's
context, `memory` map, anchor, health monitor and trace are all built around one compiled `Script`
object at `startRun`. Swapping the task list under a live `RunStatus` means deciding what happens
to `c.memory`, to an in-flight `wait.until`, to a task whose `when` no longer exists, and to a
`recovers` claim that may no longer be honoured. It also makes SP4b task 11's run report
structurally dishonest: a trace keyed to one script would describe two.

Mechanics:

1. `Save` compiles first (V0 and V1 clean), writes, and bumps `version`, exactly as `api.save`
   already does.
2. `RunStatus` gains **`scriptVersion?: number`**, the `UserTaskDoc.version` the run compiled from,
   null or absent while nothing is running. The studio compares it against the saved version.

   **It is filled in `api.ts`, not plumbed through the Worker, and it is optional for a reason.**
   Section 19 lists only `types.ts` for this field, which reads as a one-line change and is not
   one: `RunStatus` is produced by `workerHost` (`IDLE` at `workerHost.ts:75`, `seed()` at
   `:274-281`) out of the Worker's `WorkerStatus`, which `Pick`s `target`, `health` and `xpPerHour`
   off `RunStatus` (`agent/types.ts:99-101`), and the `run` message carries `scriptRef`, params,
   `startedBy`, `characterId` and behaviour and no version (`:85`). A user script's `scriptRef`
   **is code**, so the Worker cannot know a document version even in principle. Plumbing one
   through `RunRequest`, the `run` message and `WorkerStatus` would drag in `agent/types.ts`,
   `workerHost.ts` and three harnesses.

   The cheap and correct answer is one file: `api.ts`'s `status()` is already
   `({ ...d.host.status(), attached: false })`, and `recorder.current()` already holds a
   `RunSummary` whose `version` is `manifest?.version ?? doc?.version ?? 0` (`api.ts:226-228`),
   set at `recorder.begin` from the same document the run compiled from. `status()` reads it. The
   field is declared optional so that the `RunStatus` literals at `workerHost.ts:75`,
   `api.ts:113`'s `IDLE_STATUS`, `api.harness.ts`, `workerHost.harness.ts` and `styleguide.ts` all
   keep compiling untouched; a required field would break five literals for no gain.
3. While a run of the open script is live and the saved version is ahead, the header swaps the
   `live` badge for a warn Alert reading `Saved as v7. The run is still on v6.` with one
   `Restart on v7` button, naming the character when it is not the front one.
4. `Restart on v7` is `api.restart()`, which already stops and re-runs a user script from a fresh
   store read and already enforces the toggle. Zero runtime change, and the behaviour already has
   tests.
5. Nothing is automatic. An auto-restart would stop a script mid-bank-trip on a keystroke.

The run bar itself is thin, because `TasksApi` already carries everything:

- `Run` opens the params form rendered from the persisted manifest when the script declares params,
  and calls `api.run(docId, values)` otherwise. Enforcement of "one run per tab", the toggle and
  the requirements stays in `api.run`, which the studio must not duplicate: a disabled `Run` shows
  the reason the api would have given.
- `Pause` / `Resume` / `Stop` are `api.pause('player')`, `api.resume('player')`,
  `api.stop('player')`.
- `Run selection as a snippet` is `api.execute(code)`, the existing path, refused with
  `run_active` while a run is moving and rendered as a disabled button with the reason rather than
  a thrown toast.

## 11. The console and trace pane

The Console tab of the bottom dock subscribes to `api.onEvent` and `api.onStatus` and renders the
live trace in the trace window's own row grammar. It is a **view of the same stream**, not a second
trace: no new event source, no new store, and `traceView.ts`'s existing prose-per-kind renderer is
reused rather than reimplemented.

**The trace window is not suppressed while the studio is open, and it is occluded by it.** The two
halves of that sentence are both load-bearing and the earlier draft only had the first. Not
suppressed: the studio never closes the trace window, never touches its state, never unsubscribes
it, and it is there unchanged the moment the studio closes. Suppressing it would be a surprising
side effect on a surface the player opened themselves. Occluded: it lives at `right:16px;
bottom:16px` **inside the canvas column** (mock line 117), which is the box the studio covers, so
there is no "beside". A 430px trace window in that corner would sit over exactly the studio's
Problems dock, its footer meta line and its Run/Save/Pause/Stop row.

That is the rule section 4.3 states: **the studio occludes everything inside the canvas column and
re-provides what matters.** The trace window is the only surface that rule still applies to after
entry 2, because the run banner is gone and the co-pilot bar has moved out of the column (section
4.3 item 2); entry 2's plan adds `#trace-host` beside `#bank-host` at `frame.html:16`, inside
`#canvas-wrap`, and gives `.trace-window` `right:16px; bottom:16px`, so the geometry this section
assumes is what that plan builds. For the trace, the re-provision is the Console tab, which is the
same stream in the same row grammar (section 6).
Ruling 13 is restated in those terms, and section 4.1's z lane follows from it rather than from a
guess about which window should be on top. The alternatives, considered and rejected: nudging the
trace window left and up while the studio is open, which has nowhere to go in a column the studio
covers; and moving the studio's dock and run bar out of the bottom-right quadrant, which is a
worse layout chosen to accommodate a window the player can already read inside the studio.

`Copy for Claude` in the console reuses `UNTRUSTED_HEADER` from
`web/src/plugins/builtin/traceView.ts:12` verbatim rather than writing a second header.

A run report is **not** duplicated in the studio. SP4b task 11 builds `runReport.ts` and
`runReportView.ts` and the history row opens it; a second report would be a second report.

## 12. The help pane

The help pane is the studio's rendering of Spec A's `api-index.json`, and it is what makes the
documentation half of the request land in the client rather than only in a file.

- **Symbol under the cursor.** The pane tracks the caret. When the caret is inside a member
  expression the lezer tree can resolve to an `api-index` path (`c.travel.to`, `c.bot.chopTree`),
  the pane shows that member's signature, doc comment, `since`, and the ids of the examples that
  use it, each with an `Open as new script` action. When it resolves to nothing, the pane keeps its
  last member and does not flicker.
- **Hover cards** use the same lookup, so hover and pane can never disagree.
- **Browse mode**: a `.input` search over paths and doc text, grouped by namespace, plus the seven
  quickstart pages rendered from their `?raw` sources.
- **A diagnostic links to its rule.** A V2 diagnostic carries a `source` the Problems row turns
  into a link to that rule's paragraph in `06-limits-and-trust.md`, so "why can I not call fetch"
  is one click rather than a search.
- **No markdown library.** The seven pages are our own prose in a known subset, rendered by about
  90 lines that build text nodes. No user-authored markdown is ever rendered, so no sanitiser is
  needed and none is added. **The subset is a contract with Spec A, not an implementation detail**,
  because a page written outside it renders as raw characters in a 300px pane and there is no table
  family to fall back on. **The subset is stated once, in Spec A section 5, and this renderer
  implements exactly that list and nothing more.** It is stated there rather than here because Spec
  A ships first, binds its own seven pages to it, and runs gate 5 over every page with this
  renderer; a second enumeration here would be the second source those two gates exist to prevent.
  Adding a node is therefore an edit to Spec A section 5 and to `help/markdown.ts` in the same
  change, and tables in particular are Spec A ruling 11: they stay out, and a two-column
  enumeration is written as a definition list in the `.kv` row grammar.

## 13. Keyboard

The palette is the organising idea rather than a toolbar, which is the cheapest way to be keyboard
driven and removes the pressure to grow a toolbar pattern the design system does not have. The
registry is a plain array of `{ id, title, group, when?, run }` filtered by a subsequence matcher;
every toolbar button is a thin wrapper over a command.

| Binding | Command |
|---|---|
| `Ctrl-Shift-P`, `F1` | Command palette |
| `Ctrl-S` | Save |
| `Ctrl-Enter` | Save and run |
| `Ctrl-Shift-Enter` | Run selection as a snippet |
| `Ctrl-F`, `Ctrl-H` | Find, replace (`@codemirror/search`) |
| `Ctrl-G` | Go to line |
| `Ctrl-R`, `Ctrl-Shift-O` | Go to symbol (task names and manifest keys, from the lezer tree) |
| `Ctrl-Shift-D` | Toggle the help pane |
| `Ctrl-Shift-M` | Toggle the Problems dock |
| `F2` | Rename the open script |
| `Escape` | Section 4.5. Never claimed by the editor |

Two mechanical notes the plan must not discover:

- `Ctrl-S`, `Ctrl-P`, `Ctrl-F` and `Ctrl-G` are browser bindings. The studio calls
  `preventDefault` on them **only while focus is inside the window**, and releases them the moment
  it closes.
- The game client owns keyboard input while the canvas has focus, and
  `web/src/frame/stage.ts:195-202` re-dispatches Escape from inside the same-origin iframe. Focus
  routing between the window and the stage is explicit: opening the studio moves focus into it,
  closing returns it to the opener, and no studio binding is installed on `document`.

## 14. Drafts, autosave, and conflict rules

Today `userStore.save` is a destructive full replace with no revision history. **An editor that
autosaved to Firestore would make that worse, not better**, so:

- **Firestore saves are explicit.** `Ctrl-S` or the button. There is no autosave to the server, and
  no `beforeunload` prompt.
- **Drafts are local and automatic.** Every 1.5 s idle pause and every blur writes the buffer to
  IndexedDB (`idlescape-studio`, one record per `{ uid, docId, path }`), following the conventions
  already in `web/src/tasks/history.ts`. A closed window, a refresh or a sign-out never loses work.
  A dirty document shows a `.dot .dot-warn` in the rail, distinct from the open row's accent rail;
  section 6 gives the reason the tone is named here rather than left to the implementer.
- **Revisions are local too**: the last ten saved bodies per document in the same store, offered
  through `Script: restore previous version` in the palette with a read-only preview. It is a
  device-local safety net and the help pane labels it as one.
- **Firestore revision subcollections are cut**: a write per save, a rules block and a quota
  question, for a case a local ring covers for the single-author product this actually is.
- **SP4c conflict.** When Claude writes the same document through `save_task`, the studio holds the
  `version` it loaded and `api.save` gains an optional `expectedVersion`. A mismatch surfaces as an
  Alert, `Claude changed this script while you were editing.`, with `Keep mine` and `Reload theirs`
  and the incoming text shown read-only in the help pane region. This is a compare-and-set, not a
  merge; a merge UI is cut. `expectedVersion` is optional, so every existing caller keeps
  last-write-wins and nothing else has to change.

## 15. Security seams

The rule for this entry: **the studio adds exactly one place where script text is evaluated, and it
is the place that already exists.** Everything else it does with script text is parsing.

### 15.1 The raw transport

`c.sdk.transport` is an own property on the vendored `BotSDK`, so a script can read it and reach
every member of the **scoped** transport. That is exactly the authority the script already has
through `c.bot` and `c.sdk`, so it is a legibility problem rather than an escalation. The
`relogin` and `logout` swap at `workerContext.ts:71-87` stays as the enforcement, the
`Record<keyof Transport, true>` harness stays as the gate, and the V2 `no-transport-escape` rule
makes it an authoring error so nobody writes code depending on a shape we may change.

**A `Proxy` over the scoped `sdk` that throws on `transport` is deliberately not adopted.** It
would change method identity and property-write behaviour on a vendored class for no change in
authority. *Cost if wrong: `c.sdk.transport` stays readable from script code and a determined
script keeps the access it already had through the porcelain.*

### 15.2 The network, and the allowlist

This is the real hole. `compileUserScript` gains the forbidden identifiers as extra formal
parameters, called with `undefined` for each:

```
new Function('defineScript', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource',
             'importScripts', 'indexedDB', 'caches', 'Worker', 'SharedWorker',
             'postMessage', 'addEventListener', 'self', 'globalThis',
             '"use strict";\n' + body)
```

The snippet wrapper at `web/src/agent/worker.ts:364-369` gets the same treatment. The list lives in
one file, `web/src/tasks/forbidden.ts`, consumed by the compiler, by the V2 linter, by the help
pane and by Spec A's generator, with a test asserting all four agree. About fifteen lines and one
test. **`addEventListener` is on the list**, and that is the one member worth deciding out loud
rather than leaving two copies of the list to disagree about: shadowing it removes a script's
ability to register its own listeners on the worker global, which is the point, because a script
that wants to hear about the world has `c.wait.*` and the event stream and has no business
listening to the worker's own message port. Section 8.2 does not restate the list, for the same
reason a security list should have one home.

**The run gate must live where every run path already crosses, and in the earlier draft it did
not.** That draft rested the whole claim on "deliberate network use requires an obvious `eval`
string the studio refuses to run", with the refusal implemented as a V2 lint in
`web/src/studio/`. But `api.run` carries the codebase's own statement of the rule it was breaking:
"Spec decision 8: one enforcement point. The Run button, the run card's Run again, the Marketplace's
Run now, `window.idlescape.tasks.run`/`restart` from Playwright and the SP4c relay all arrive here"
(`api.ts:248-258`). V2 blocks Run, not Save, so a script containing `eval('fetch')(...)` can be
saved from the studio and then started from the task card, the Marketplace card, SP4b task 9's
per-script auto-start toggle, SP4c's `run_task`, or the Automation panel's Run snippet box that
ruling 12 explicitly keeps (`api.execute` at `api.ts:343-346` consults no linter at all). The
studio would refuse; nothing else would. A security shape that holds only in the surface that
authored the code is not a security shape.

**So the blocking subset moves to the chokepoints, both of them.**
`web/src/tasks/defineScript.ts` gains one exported `scanForbidden(code): { name: string; index:
number } | null`, a source scan for the `forbidden.ts` identifiers and for `eval` and
`new Function`, and **two** call sites, because the runtime has two evaluators rather than one:

- `compileUserScript`, which every saved-script path crosses: `api.run` (the Run button, the run
  card's Run again, the Marketplace's Run now, SP4b task 9's auto-start toggle, SP4c's `run_task`,
  `api.restart`), `api.save`, the agent worker's `compile`, and the studio's own compile worker.
- **The snippet wrapper at `web/src/agent/worker.ts:364-369`**, which `api.execute` reaches and
  `compileUserScript` does not. This is the path ruling 12 keeps alive in the Automation panel's
  Run snippet box, and missing it would leave one unguarded door in the exact surface a player
  reaches for when they want to try something quickly.

Both refuse with a new `TasksErrorCode`, `forbidden_api`, carrying the identifier and its position.
The refusal is then identical from the card, from the toggle, from the snippet box and from SP4c,
which is what "one enforcement point" is supposed to mean. **The studio's V2 keeps its `no-eval` and
`no-forbidden-globals` rules unchanged**, reading the same `forbidden.ts`: it becomes the fast
in-editor rendering of a rule the runtime enforces, rather than the only place the rule exists.
That is also a better authoring experience, because the diagnostic arrives while typing rather than
at the moment of Run.

**What it still does not do, stated plainly so nobody oversells it.** `eval` cannot be shadowed as
a parameter: naming one `eval` under `"use strict"` is a SyntaxError. The source scan catches the
literal identifier, and constructor chains such as `(function(){}).constructor('return fetch')()`
still reach `Function` and therefore the network, and no scan short of a real sandbox catches every
spelling of that. So the honest combined shape is: **accidental network use is impossible;
casual deliberate network use is refused at the one place every run starts; a determined
constructor-chain escape remains open.** That is a meaningful bar and it is **not** a sandbox, and
ruling 6 carries it at that strength. Spec A's `06-limits-and-trust.md` says the same thing in the
same words, so the shipped documentation and this section cannot disagree.

**And the trust model underneath it, ruled by decision D24 from audit C30 and stated here because
this is the section that would otherwise imply a stronger one.** A script resident in the Worker is
**trusted as the account's own code**. Everything in this section is a guardrail against accidents
and against a casual deliberate reach, not a boundary, and there are three reasons that is the
honest answer rather than a defect:

- **The forged-RPC path is real and unclosable from inside.** Script text runs through
  `new Function` in the Worker's own global scope, so it holds `self`, and
  `self.postMessage({ t: 'rpc', target: 'transport', method: 'logout' })` is indistinguishable from
  a legitimate SDK call: it reaches `workerHost`'s `answerRpc` and then `callTransport`, which calls
  the **raw** `d.transport.logout()`. `RpcMethod` is a compile-time type and erases. The audit's
  alternative, dropping `relogin` and `logout` from `RpcMethod` and giving recovery its own message
  type, is still forgeable from inside the Worker, so it buys the appearance of a boundary and not
  one. The `relogin`/`logout` swap at `workerContext.ts:71-87` and the
  `Record<keyof Transport, true>` harness stay exactly as they are; what changes is that the comment
  there stops reading as a security claim, and that correction belongs to entry 3's first task
  rather than to this entry.
- **No cross-account sharing exists, which is what bounds the blast radius.** Scripts live under
  `users/{uid}/tasks`, the only marketplace is of our own bundled scripts, and nothing anywhere runs
  another account's code. Section 15.6's refusal of URL import and of Marketplace publishing is not
  tidiness, it is what keeps this paragraph true.
- **Any future sharing or relay of another account's code carries this as an explicit
  precondition.** SP4c is the entry that would make "someone else's script" a real case, and it may
  not ship one while the trust model is what this paragraph describes. That precondition belongs on
  that entry's scope line, and D24 records it.

The standard states the same thing once, in its S10 ("The trust model this rule sits on"), and this
section does not invent a second wording for it.

**If the owner would rather `compileUserScript` did not become a linter**, the fallback is to delete
the "the studio refuses to run" sentence outright and restate the shape as "accidental network use
is impossible; deliberate network use is unblocked outside the studio", carrying that weaker claim
into ruling 6 and into Spec A's page. What is not acceptable is the earlier
draft's version, which claimed the stronger shape while implementing the weaker one.

**The standing constraint, written down rather than left as tribal knowledge:** the runtime depends
on `new Function`, so any future CSP must carry `script-src 'unsafe-eval'` or the bot breaks before
the editor does, and the symptom will look like an editor bug.

This is a behaviour change to the existing runtime: a user script that was quietly using `fetch`
stops working. That is the point, and so it is ruling 6.

### 15.3 The DOM, on the main thread

Absent by construction inside the Worker. The new risk is on the main thread, where the studio
renders strings that came out of a user-authored document (names, descriptions, tags, diagnostic
messages quoting source) and out of `WorldState` (console lines carrying game chat and npc
dialogue). Rules: everything derived from a document or from `WorldState` is set with `textContent`
through `h()`, never `innerHTML`; `innerHTML` templates are allowed only for static chrome; script
text is rendered by CodeMirror, which builds text nodes; and every copy path carries
`UNTRUSTED_HEADER`.

### 15.4 Another character's session

Every action against a character goes through `window.idlescape.tasks`, the router that forwards to
the active character and routes run-id calls to the owning api. **The studio holds no `TasksApi`
reference across a character switch and no `runId` it did not receive from the router**, adds no
cross-character path, and never receives a `Transport`. Written down so nobody later hands the
studio a transport handle for convenience. In particular the studio does **not** reach
`WorkerHost.compile`, which is not on `TasksApi` and which the router does not forward, and this
entry does not widen either to make it reachable.

The studio's own compile worker (section 8) and its phase 2 type-check worker are the two things it
owns outright rather than reaching through the router, and neither is an exception to the rule
above: each receives no `Transport`, imports nothing under `web/src/agent/`, holds no character
identity, and carries only strings and positions across its protocol. 15.5 items 1 and 2 are the
enforcement for both.

### 15.5 The validator must not widen any of the above

1. No code path under `web/src/studio/` may call `new Function` or `eval` or construct a worker
   from a `blob:` URL. An eslint `no-restricted-syntax` rule scoped to that directory, plus a test
   that greps the built chunk.
2. The studio's compile worker (section 8) and the phase 2 type-check worker are **different
   workers** from the agent worker. Neither receives a `Transport`, neither imports anything under
   `web/src/agent/`, and both protocols carry only strings and positions. The compile worker's
   allowed import set is `web/src/tasks/defineScript.ts` and its transitive type-only imports.
   Enforced by an eslint `no-restricted-imports` rule and by a unit test that reads each worker
   module's static imports and asserts the allowed set.
3. No run-time third-party fetch, ever. No CDN, no `createDefaultMapFromCDN`. Declarations ship in
   the bundle, so the studio works offline and on the Lightsail box.
4. Completion and hover data is generated, never introspected from a live context object at run
   time, which would be the tempting shortcut and would require a real context on the main thread.

### 15.6 Getting a script in and out

Paste and drag-drop of a `.js` file are allowed: they are identical to typing, and the text goes
through V0, V1 and V2 before it can be saved or run. Export is copy to clipboard and download as
`.js`, with no server round trip. **Fetching a script by URL is refused**: SP4 lists third-party
script loading by URL as an explicit non-goal, and reversing it is an owner decision with a
supply-chain tail that should not happen quietly inside an editor entry. **Publishing a user script
to the Marketplace is cut** for the same reason: the moment a script can arrive from another
player, 15.2's shadowing stops being tidy and becomes load-bearing.

**There is no cross-account script sharing anywhere in the product, and this entry does not add
one.** That is the standard's ruling 15 and decision D24, not a preference of this document: a
script is the account's own trusted code (section 15.2), and every mechanism in section 15 is sized
for that. The studio says so where a player will meet it, in the help pane's
`06-limits-and-trust.md` page, so a player who wonders why there is no share button finds the answer
rather than filing it as a missing feature. Adding sharing later is an entry of its own with its own
security section, and its precondition is stated in 15.2.

## 16. Session switch, sign-out, and per account versus per character

Scripts are per account; runs and their Workers are per character. The studio edits the first and
drives the second, which is the constraint most likely to be got wrong.

| Event | Behaviour |
|---|---|
| **Character tab switch** | The buffer does not change and nothing is discarded, because the document is per account. What changes is the run context: the `live` badge clears if the new character is not running this script, the console re-subscribes to the new character's stream, and `Run` now means "run on this character". The header names the active character beside the run controls so the disagreement is legible. |
| **Panel switch** | Nothing. The studio is not a panel and does not remount (section 4.3). |
| **Sign-out** | The store returns `[]` and that is not an error. The studio does not close and discards nothing. The rail keeps showing the bundled library read-only, open buffers stay (they are already in IndexedDB), `Save` disables under a warn Alert reading `Sign in to save. Your open edits are kept on this device.` |
| **Sign-in as the same account** | The rail repopulates. A draft that differs from the stored code is offered back with `Restore your unsaved draft?` |
| **Sign-in as a different account** | Buffers close. Drafts are keyed by uid, so nothing crosses accounts. |
| **Window close with a dirty buffer** | The Escape ladder in section 4.5, or the `x` with the same two-step. Drafts are written regardless, so closing is never destructive and needs no modal. |
| **Tab close or reload** | No `beforeunload`. The 1.5 s idle write and the blur write cover it without a browser prompt. |

`localStorage` keys added, all under the `cs.` prefix: `cs.studio.open` (the last open script id),
`cs.studio.help`, `cs.studio.dock`, `cs.studio.wide`, and in phase 2 `cs.studio.typecheck`. Buffer
text is never in `localStorage`: a 64 KB document times several would blow the quota. That is what
IndexedDB is for.

## 17. Size budget and lazy loading

| Chunk | When it loads | Gzipped | Ceiling, asserted |
|---|---|---|---|
| Automation panel delta (a handle and one button) | always | about 0.4 KB | the entry chunk must not grow |
| **Studio chunk**: CodeMirror core, `lang-javascript`, lezer, search, autocomplete, lint, plus window, layout, rail, palette, problems, console, theme, lint rules, completion source | first `New script`, `Edit`, `Fork` or `Open in studio` | about **185 KB** | 220 KB |
| **Help chunk**: `api-index.json` plus the seven prose pages plus the renderer | first time the help pane opens | about 45 KB | 60 KB |
| **Type-check chunk** (phase 2): `typescript` 5.x minified, the ES2022 lib closure **without** `lib.dom.d.ts`, the generated API declarations, worker glue | first time type checking is enabled, then prefetched on studio open | about **1.04 MB** | 1.2 MB |

Rules:

- **The Automation panel must not grow.** Everything is behind `await import('../../studio')`. A
  player who never opens the studio pays nothing.
- **Ceilings are asserted, not stated.** A size check after `vite build` reads `web/dist/assets/*`
  and fails when the entry chunk's gzipped size increases or a named chunk exceeds its ceiling,
  wired into `scripts/verify.ps1`. A ceiling that is not asserted is a wish.
- **Three split points and two workers, all reached by `import`**, so every one lands in
  `/assets/` with a Vite hashed name that satisfies the router's per-segment filter. The compile
  worker is `new Worker(new URL('./compile/worker.ts', import.meta.url), { type: 'module' })`,
  copying `spawnScriptWorker` at `web/src/agent/workerHost.ts:70-72` exactly, which is the idiom
  Vite's `worker: { format: 'es' }` config already emits correctly. Nothing is addressed by a
  hand-written runtime path, which is the single most likely production-only failure in this entry,
  and phase 2's declaration tree is bound by the same rule (section 20 task 2).
- **Perceived latency.** The window frame, header, rail and empty state render from data already in
  memory, so the window is visible before the studio chunk finishes loading. Targets: frame visible
  within 150 ms of the click, editor mounted within 400 ms on a warm cache.
- **The degradation path is designed, not discovered.** If the studio chunk fails to load, the
  window opens a `.textarea.code` with V1 diagnostics from the agent worker and a footer line
  saying so. If the type-check chunk fails, the editor keeps working with V0, V1 and V2 and the
  footer reads `type checking: unavailable`. Neither failure blocks saving or running.

**The type-checking numbers are estimates and this spec does not present them as measured.** Phase
2's first task is a throwaway harness reporting `performance.now()` and
`performance.measureUserAgentSpecificMemory()` from the real worker against the real generated
declarations, and phase 2's acceptance criteria are written against what it reports. If first
diagnostics exceed 2 s or heap exceeds 200 MB, type checking ships default-off and stays opt-in.

Excluding `lib.dom.d.ts` saves 1,874,901 bytes and is also a correctness win: it turns
`document.querySelector` into a type error rather than a puzzle.

## 18. Testing

### 18.1 The jsdom limit, and the file split it dictates

jsdom has no layout: `getBoundingClientRect` returns zeros and `Range.getClientRects` is not
implemented, so CodeMirror's view layer either behaves wrongly or throws. **No unit test mounts an
`EditorView`.**

That limit is the reason for the file split in section 19: every module holding model logic must be
free of any `@codemirror/view` import so it can be unit tested, and only `editor/*.ts` may import
the view. An eslint `no-restricted-imports` rule pins the boundary, because it will otherwise erode
in the first follow-up change. The window itself takes the editor as a small injected interface
(`{ value(); setValue(s); focus(); destroy(); }`), which is the seam that keeps `window.test.ts`
able to run at all.

### 18.2 Unit, vitest and jsdom

- **Lint rules**: one file per group, parsing fixtures with `@lezer/javascript` directly, asserting
  ranges as well as messages and severities. Cases include every forbidden global, `await` inside a
  `when`, a `setTimeout` sleep, `while (true)` with no `await`, and a clean script producing zero
  diagnostics.
- **Diagnostics mapping**: `{ message, line, column }` from `compile_error` onto a CodeMirror
  `Diagnostic`, including the V8 stack-offset arithmetic, with one fixture per engine shape.
- **Completions and hover** against a fixture `api-index.json`: `c.` offers the namespaces,
  `c.bot.` offers a known method with its doc, an unknown prefix offers nothing, and a
  `ResourceKind` string position offers the nine values. Plus: **the derived trigger set equals the
  index's `kind: 'namespace'` members** for a fixture carrying an unfamiliar namespace, which is
  the test that keeps section 8.3's prefixes out of a code literal.
- **The compile worker's boundary**: its static imports are exactly the allowed set, it produces a
  diagnostic rather than hanging on a fixture containing a top-level `while (true)`, and the
  watchdog terminates and replaces it within its budget.
- **`checkParamDefaults`**: a `select` default outside its own options, a `number` default outside
  its own min and max, a clean schema producing nothing, and the fact that none of the three fails
  the compile.
- **Theme**: every value is a `var(--token)` reference and no literal hex appears anywhere.
- **Palette**: the subsequence filter, `when` gating, ordering by group then title.
- **Rail model**: grouping by `source`, read-only library rows, dirty markers, delete confirm,
  empty state.
- **Buffers**: dirty tracking, the idle draft write and the revision ring, over `fake-indexeddb`,
  which is already a devDependency.
- **Save orchestration** against an **honest fake `TasksApi`** written from `TasksErrorCode`, which
  refuses everything the real one refuses (`busy`, `run_active`, `disabled`, `not_signed_in`,
  `compile_error`, `params`, `disposed`), with a test asserting the fake implements every code. A
  fake that accepts everything hides the failure paths that are most of this surface.
- **Teardown**: assert that no callback fires and no state is written after `dispose()`, not merely
  that no timer remains, and that work already in flight is fenced. The studio has three sources of
  in-flight work: the compile RPC, the type-check worker and the draft debounce. A generation
  ticket on each is the shape that fits.
- **Existing suites extended**: `api.test.ts`, `catalogue.test.ts` and `userStore.test.ts` for the
  persisted manifest (a saved script's row carries its declared params, `declaredRequires` no
  longer compiles, a document with no `manifest` behaves exactly as today);
  `defineScript.test.ts` for the shadowed globals, the `forbidden_api` refusal from every caller,
  `checkParamDefaults`, and the parsed line and column; `toggles.test.ts` plus the Firestore
  emulator rules test for the `scriptToggles` delete; `workerReport.test.ts` for
  `storedManifestOf` pruning a manifest with no `tags`, no `requires` and no `health`;
  `workerContext.test.ts` unchanged and still pinning the swap list.

### 18.3 Playwright, which is load-bearing rather than supplementary

Two specs in `web/e2e/`, reusing the harness SP4b task 14 creates, run against `build:e2e` output
rather than the dev server, because that is the only thing that catches the `/assets/` 404 trap.

`studio.pw.test.ts`
1. Automation, `New script`, pick a template, the window opens with content.
2. Type, save, and the script appears in `My tasks` **with a params form derived from its
   manifest**, which is the visible proof of section 9.2.
3. Save and run: the console pane shows trace rows agreeing with `api.status()` and with
   `api.getRun()`. **Not with the run banner**, which the studio window is covering (section 4.3);
   the banner is asserted after the studio closes, which is also the assertion that proves the
   occlusion is occlusion and not damage.
4. **The panic assertion**: with a run moving, the editor focused and a completion popup open,
   Escape pauses the run **and the window stays open**, and the studio's status region reads
   `Run paused`. This test is never quarantined.
4b. **The popup assertion**: with **no** run moving and a completion popup open, one Escape closes
   the popup and the window stays open; a second Escape closes the window. This is the branch item
   4 cannot see, because it runs with a run moving.
5. Character switch with a dirty buffer: the buffer survives, the `live` badge clears, `Run`
   targets the new character.
6. Delete: the buffer closes, the rail updates, the toggle document is gone, and a delete is
   refused while that script's run is live.
7. Sign out with the window open: `Save` disables, the alert appears, and drafts survive a reload.
8. A strip click away from Automation and back leaves the buffer intact.
9. Every studio asset resolves under `/assets/` in the production build.

`studio-validation.pw.test.ts`
1. Invalid syntax shows a squiggle at the right token, a Problems count, and blocks Save.
2. A `fetch(` call shows the `no-forbidden-globals` error, blocks Run, and does not block Save.
   Then, from the Automation panel rather than the studio, running that saved script from its card
   is refused with `forbidden_api`, and pasting the same call into the Run snippet box is refused
   the same way. That is the assertion that the enforcement point is `compileUserScript` and not
   the studio, and it is the reason section 15.2 changed.
3. The `no-fixed-sleep` quick fix applies and the diagnostic clears.
4. The completion list contains `travel` and shows its doc comment.
5. The help pane follows the caret onto `c.travel.to` and shows its signature.

### 18.4 What is not tested

Editor rendering fidelity, completion popup positioning, theme colours and screen-reader output.
Those are reviewed against `web/styleguide.html`, which gains a section per new family in the same
change, and the sections are screenshotted through `vite preview` per existing practice.

## 19. File structure

Every file under 400 lines including tests and CSS. Estimates in parentheses; an estimate above 250
is a warning that the module will need splitting again.

```
web/src/studio/
  index.ts                   (120)  createStudio(), the host layer, open/close/dispose,
                                    window.idlescape.studio
  window.ts                  (190)  studio chrome over entry 2's window family, header, footer,
                                    Escape ladder. Composes .window*; defines no family of its own
  window.test.ts             (180)
  layout.ts                  (150)  regions, widths, cs.studio.* persistence
  rail.ts                    (170)  script list model plus DOM: rows, badges, dirty dot, overflow
  rail.test.ts               (140)
  buffers.ts                 (200)  open buffer, dirty tracking, drafts and revisions (IndexedDB)
  buffers.test.ts            (190)
  save.ts                    (190)  save, rename, duplicate, fork, delete, expectedVersion conflict
  save.test.ts               (200)
  runBar.ts                  (170)  run with params, pause, stop, the stale-version alert
  runBar.test.ts             (150)
  console.ts                 (170)  onEvent/onStatus subscription, trace-row rendering, copy
  problems.ts                (150)  diagnostic model, severity gating, the Save and Run gates
  problemsView.ts            (140)  the Problems list in the trace row grammar
  palette.ts                 (170)  command registry and filter, pure
  paletteView.ts             (150)  palette DOM over OverlayList
  help/pane.ts               (200)  browse, search, symbol-under-cursor
  help/markdown.ts           ( 90)  the known-subset renderer, text nodes only
  help/lookup.ts             (120)  caret position -> api-index path, pure
  help/lookup.test.ts        (140)
  editor/index.ts            (180)  EditorView construction and the extension array   [view]
  editor/theme.ts            (180)  EditorView.theme + HighlightStyle, all var(--token) [view]
  editor/keymap.ts           (120)  bindings, Prec.highest Escape, browser-key handling [view]
  editor/complete.ts         (180)  completion source over api-index.json
  editor/hover.ts            ( 60)  hoverTooltip over the same index                    [view]
  editor/lintShape.ts        ( 90)  the async V1 linter over the compile worker -> Diagnostic
  editor/lintStructure.ts    (260)  the V2 lezer walk and rule driver
  editor/rules/*.ts          14 files, under 40 lines each, one test file per group
  compile/client.ts          (110)  spawn, call, the 500 ms watchdog, terminate and replace
  compile/worker.ts          ( 60)  imports defineScript.ts and nothing else; no Transport
  compile/protocol.ts        ( 40)  code in, {ok, manifest?, message?, line?, column?} out
  compile/client.test.ts     (130)
  typecheck/ (phase 2)       client.ts (160), worker.ts (220), protocol.ts (60), vfs.ts (60)

web/src/tasks/
  forbidden.ts               ( 30)  one list, four consumers
  forbidden.test.ts          ( 50)

web/src/ui/
  (the window helper)        ( 90)  entry 2's; the studio composes it and creates nothing. The
                                    shell v2 plan builds the chrome in Task 7 under its own names;
                                    section 4.2 says entry 2 owns the names and the file, and this
                                    row exists only so a reader does not expect this entry to
                                    create one
  overlayList.ts             ( 90)  the centred filtered list, shared by palette and completions
  overlayList.test.ts        (110)

web/src/styles/
  (the window family sheet)  (110)  entry 2's, per section 4.2. The shell v2 plan writes the chrome
                                    into overlay.css in its Task 7; if entry 2's own one-file-per-
                                    family rule moves it, it moves there, and this entry follows
  overlayList.css            ( 90)  the OverlayList family; NOT the canvas overlay stylesheet
  editor.css                 (180)  .cm-* overrides, focus ring, gutter, diagnostics, popup
  studio.css                 (140)  studio layout only, no component redefinitions

web/e2e/
  studio.pw.test.ts          (280)
  studio-validation.pw.test.ts (200)

Modified:
web/src/plugins/builtin/tasks.ts        New script in the panel header, Edit and Fork open the
                                        studio; the inline textarea at :160-181 is deleted,
                                        a net reduction
web/src/plugins/builtin/tasksViews.ts   card buttons route to the studio; the run card's Trace
                                        becomes Open in studio while the studio is open
web/src/main.ts                         one host div, one handle passed to the tasks plugin
web/src/partials/frame.html             #studio-host beside #bank-host
(entry 2's layout/frame.css)            the canvas column becomes a full-height box (section 4.3
                                        item 1). **Not this entry's edit**: D22 puts it in the
                                        shell v2 plan's Task 8 step 5. This entry only asserts the
                                        outcome, because the failure is silent
web/src/styles/index.css                @import overlayList.css, editor.css, studio.css. Without
                                        this the three ship as dead source. **Not `window.css`**:
                                        the window family is entry 2's and entry 2 imports it
web/src/tasks/api.ts                    persist the manifest, drop the second compile,
                                        expectedVersion, delete the toggle on remove,
                                        RunStatus.scriptVersion from recorder.current()
web/src/tasks/userStore.ts              carry `manifest` through save
web/src/tasks/toggles.ts                remove(id) on the store and the backend, clearing the
                                        local cs.script.<id> mirror too
web/src/tasks/catalogue.ts              userRow reads the persisted manifest
web/src/tasks/types.ts                  StoredManifest, RunStatus.scriptVersion?: number
web/src/tasks/defineScript.ts           shadow the forbidden globals, the forbidden_api source
                                        scan (section 15.2), checkParamDefaults,
                                        PROLOGUE_LINES, real line and column
web/src/agent/worker.ts                 the same shadowing for the snippet wrapper
web/src/agent/workerReport.ts           storedManifestOf beside manifestOf
web/src/frame/copilotBar.ts             the panic Escape handler to window capture phase; it must
                                        NOT start calling preventDefault (section 4.5 item 1). It
                                        is `frame/runBanner.ts` today and entry 2's Task 14 lifts
                                        it into the bar and deletes the banner
firebase/firestore.rules                the optional `manifest is map` guard, AND
                                        `allow delete` on scriptToggles (section 9.1)
web/package.json                        the CodeMirror pins
web/src/vendor/PATCHES.md               the not-vendored decision, versions, licences, sizes
web/styleguide.html, web/src/styleguide.ts   Window, OverlayList and the .seg tablist variant
scripts/verify.ps1                      the chunk-size assertions
web/eslint.config.js                    the three import boundaries and the no-eval rule

Modified by phase 2 only, and named here because neither document owned them before:
scripts/gen/apiDocs.ts                  Spec A's generator gains --declarations, emitting the
                                        API .d.ts tree, plus --check over it (about 120 lines)
web/src/agent/api.d.ts (or the path phase 2 picks)   the generated declaration tree, committed
                                        and gated, imported so Vite bundles it into the
                                        type-check chunk rather than fetched by a runtime path

Modified because entry 4 changes what entry 3's generated artefact says:
web/src/tasks/docs/06-limits-and-trust.md   the generated `forbidden` block gains content and
                                        the network paragraph is restated at section 15.2's
                                        strength
web/src/agent/API.md, web/src/agent/api-index.json   regenerated, since forbidden.ts is a
                                        generator input (Spec A section 3.2)
```

CSS splits by component family rather than by panel, per gaps spec G9: of the files this entry
adds, `overlayList.css` and `editor.css` are family files and `studio.css` holds layout and nothing
else, which is the only place studio-only selectors may exist. The window family sheet is **entry
2's**, not one of the three, and entry 2 imports it. All three of this entry's are reached through
`web/src/styles/index.css`, which is the aggregator every shipped stylesheet already joins; a
family file nothing imports is dead source, and section 19 previously created three of them without
touching the file that pulls them in.

## 20. Phased delivery

**Phase 1, the first release.** The window, the rail and all six verbs, the editor with the quiet
theme, V0, V1 and V2 validation, member-aware completions and hover from `api-index.json`, the
Problems and Console dock, the help pane, the run bar with the restart policy, the palette and the
key map, local drafts and revisions, the persisted manifest, the shadowed globals, the parsed
compile line, and both Playwright specs. This is a complete and shippable answer to the request on
its own, and the spec says so plainly rather than leaving type checking as an unfunded ambition.

**Phase 2, in the same entry, gated on measurement.** Four tasks in order, and the second of them
is work that neither this document nor Spec A previously owned, which is why it is now named:

1. **The measurement harness.** A throwaway harness reporting `performance.now()` and
   `performance.measureUserAgentSpecificMemory()` from the real worker against the real generated
   declarations. Phase 2's acceptance criteria are written against what it reports.
2. **Extend Spec A's generator with `--declarations`, and gate it.** About 120 lines in
   `scripts/gen/apiDocs.ts` emitting the API `.d.ts` tree from the same `ts.Program` the index
   comes from, plus a `--check` over the emitted tree reusing `writeOrCheck` exactly as gate 1
   does. Three decisions this task makes and records: the tree is **committed**, because Spec A's
   argument against committing it was that a gate would protect nobody and that argument stops
   holding the moment it has a reader; it is **imported as a module** so Vite bundles it into the
   type-check chunk with a hashed `/assets/` name, never addressed by a hand-written runtime path,
   which section 17 names as this entry's most likely production-only failure; and it inherits
   gate 1's regenerate-and-byte-compare rather than getting a gate of its own.
3. **The type-check worker itself**: `ts.createLanguageService` over that tree plus the ES2022 lib
   closure without DOM, hand-rolled over the repo's own `web/src/agent/rpc.ts` conventions.
4. **The opt-in surface**: behind `cs.studio.typecheck`, enabled from a one-click affordance in the
   Problems pane, prefetched on studio open once a player has enabled it, advisory and never
   blocking.

Spec A section 3.3 names this entry as the consumer that turns the mode on, so the two documents
agree about who owns it rather than leaving it in the gap between them.

**Cut, and the reasons, so nobody re-adds them by accident.** Multiple buffers and a tab strip;
multi-file scripts and a module linker (the seam survives, section 9.3); a drag resizer and split
editors; a minimap; a diff view; go-to-definition, rename symbol and find-all-references (about 200
more lines on the same worker, none of them what a first-script player needs); vim and emacs
keymaps; user-selectable themes; a debugger with breakpoints (it needs the runner to yield between
statements, which is a different execution model, not a different editor); Firestore revision
history; autosave to Firestore; hot-swapping a running script; running a single task in isolation;
dry-running against a recorded trace; importing by URL; publishing to the Marketplace; a twelfth
strip glyph; and removing the Automation panel's Run snippet box.

## 21. Sprint placement, and what it depends on

**Ruled: entry 4**, immediately after Spec A's documentation entry, with SP8c, time candy,
battlebots and everything below renumbered once.

The sprint this produces, after the three script rows are inserted: 1 SP4b, 2 Shell v2, 3 Script
API reference, **4 Script Studio**, 5 Script API v2 surface, 6 SP8c, 7 Time candy, 8 Battlebots, 9
SP9, 10 SP3b, 11 SP10, 12 SP4c, 13 SP5. Entry 5 is the survey spec's phase-next proposals and
entries 10 and 11 are D14's SP3b ruling; a reader renumbering the sprint should renumber once, from
here.

- **After entry 1 (SP4b).** Nine of the files this entry modifies are being rewritten by SP4b tasks
  9 to 15, `tasks.ts` and `tasksViews.ts` and `types.ts` among them. This entry must be sequenced
  after task 15, not merged into it.
- **After entry 2 (Shell v2).** It composes the component library and needs four things from it:
  the token layer, the window family, a merged z-scale and a full-height canvas column (see the
  header, section 4.2, section 4.3 and section 22). Two of the four are settled by D22 and all four
  are stated against what the shell v2 **plan** builds rather than against the mock. Built earlier,
  the studio invents a third one-off window, does entry 2's extraction on its behalf, and writes its
  CSS against custom properties that do not exist.
- **After Spec A.** The completion source, the hover cards and the help pane all read
  `api-index.json`.
- **Before entry 5 (Script API v2 surface).** The survey spec's phase-next proposals add `c.on`,
  `c.world`, `c.store`, `c.overlay` and the rest, and every one of them wants a completion list, a
  hover card and a lint the moment it exists. Built in the other order, eleven runtime additions
  land against a textarea.
- **Before SP8c, time candy and battlebots**, which is the part that is a judgement rather than a
  dependency. Reasons: those three entries author content and scripts (battlebots ships four
  library bot scripts) and would author them against a textarea; and the file-level collisions with
  `tasks.ts` and `tasksViews.ts` are cheapest to resolve while SP4b's changes are recent rather
  than three entries stale.

**The alternative, and its cost:** place the studio after battlebots, at entry 7. Battlebots is the
only entry in the sprint whose plan is already written, so delaying it by two entries delays the
most shovel-ready work in the sprint. The cost of that ordering is that battlebots' four bot
scripts and time candy's testing are done in the textarea, and the studio then lands against a
`tasks.ts` that three more entries have touched.

**Pack ids and engine surfaces: none.** This entry touches no `content-custom/pack/*` file,
allocates no obj, inv, loc, map, interface, dbrow or varp id, patches nothing under
`engine-custom/` or `client/`, and needs no content overlay run. The pack id table in
`2026-09-07-sprint-dragon-slayer.md` section 3 is unaffected, and no server route is added (Spec A
adds the two docs routes).

## 22. Risks

- **Four dependencies on entry 2, and after the reconciliation only one of them is unowned.** The
  token layer is the widest and is already the shell v2 plan's Task 1: every colour, radius and
  control height in this document is written in names `web/src/styles/tokens.css` does not carry
  today, and the section 7.3 "no literal hex" test would pass against undefined custom properties.
  The window family is that plan's Task 7 and D22 sends section 4.2's default-and-modifier table
  into it. The full-height canvas column is D22's second half and lands in that plan's Task 8 step
  5; it fails **silently** without the edit, because the window is then short and moves with the
  side panel's content rather than erroring, which is why section 4.3 asserts the outcome rather
  than assuming it. **The merged z-scale is the one still unowned**: the plan gives `.window`
  `calc(var(--z-overlay) + 1)` and `.trace-window` `+ 2` without naming a studio lane, so entry 2's
  reconcile pass either names one or this entry takes `+ 3` and says so in its plan. **Two more
  gaps inside the first and fourth dependencies were found by cross-review after this paragraph was
  written, and both are now owned by D29 rather than unowned**: the `--window` colour token existed
  in neither the bundle nor the plan's added-colour group (`--r-window`, which this document also
  called missing, was in the bundle all along), and `.frame-body` appeared nowhere in the plan at
  all. If entry 2 slips, this entry either slips with it or absorbs work on surfaces it otherwise
  does not touch.
- **jsdom cannot test the editor**, so the Playwright suite is load-bearing rather than
  supplementary. If Playwright is skipped in a hurry, the Escape assertion goes with it, and that
  is the one that must not be lost.
- **The V2 rules can produce false positives**, for instance a `while (true)` that awaits through a
  helper the walker cannot follow. Every V2 rule is `warn` or `info` except the six errors
  (`no-forbidden-globals`, `no-eval`, `no-transport-escape`, `no-dom`, `no-await-in-when` and, per
  ruling 22, `no-fixed-sleep`), and warnings
  block nothing.
- **Shadowing the forbidden globals is a behaviour change** that can break an existing user script
  quietly using `fetch`. That is the point, and it is why it is a ruling rather than an
  implementation detail.
- **185 KB gzipped on a Lightsail Free-plan box** is a cold-cache download for each new visitor who
  opens the studio. If that is still too much, the fallback is the `.code` textarea with the same
  V1 and V2 validation and no highlighting, which is a strictly smaller version of this same design
  and is already the degradation path in section 17.
- **`api-index.json` is only as good as the doc comments.** They are good today. A generator makes
  their quality visible, which is a feature and occasionally an embarrassment.

## 23. Rulings, for the record

Every one of these is a question the readers raised that this document decides rather than
escalates. Section 24 restates the ones with a real alternative worth the owner's time, so any of
them can be overturned at review. Rulings 16 and 18 have no question of their own: both are
transcriptions of literals the mock or the brand guide already fixes, and there is nothing to
choose between.

1. **A window centred in the canvas column below the co-pilot bar, `min(920px, ...)` by
   `min(620px, ...)` of that column**, with a `wide` toggle instead of a resizer, a stated collapse
   ladder below 860px, and one overlap rule: it covers everything inside the canvas column and
   nothing outside it. After entry 2 the trace window is the only surface that rule still applies
   to, because that entry's Task 14 deletes `runBanner.ts` and moves the bar out of the column
   (rulings 13 and 28, section 11); the run banner is not in the overlap list for the same reason.
   Reaching 920x620 needs about 1280x776 of viewport with the side panel open. *Cost if wrong: a
   smaller window makes the help pane and the dock unusable together; a resizer needs a component
   family the system does not have.* **Carries one required change to entry 2's layout, stated as
   an outcome rather than as a declaration:** *the canvas column is a full-height box whose height
   does not depend on the side panel's content.* Section 4.3 item 1 gives the reason the literal
   `.frame-body { align-items: stretch }` is no longer the right way to say it: Task 14 gives
   `.frame-body` a second child, so whichever declaration entry 2 reaches for is entry 2's. Without
   the outcome the side panel and the icon strip stay content-height (the mock draws them full
   height), and the window gets about 508px and wobbles with the side panel's content, at every
   viewport size.
2. **No strip button and no twelfth glyph.** Four entry points, all in Automation, following the
   bank precedent. *Cost if wrong: the studio is one click deeper than a panel would be.*
3. **CodeMirror 6 as pinned npm dependencies**, not copied under `vendor/`, with the decision,
   versions, licences and sizes recorded in `PATCHES.md`. *Cost if wrong: we read a stated
   convention narrowly. Literal vendoring costs a 590 KB source tree and a manual upgrade path.*
4. **Escape ruling A: panic wins always.** The banner's handler moves to `window` capture phase,
   it still never calls `preventDefault`, and the editor never `preventDefault`s Escape.
   **The studio's own close is a no-op while `state === 'running'`**, and with no run moving it
   skips an Escape it can see the completion popup consumed; neither is guarded on
   `defaultPrevented`, which items 1 to 3 deliberately leave false. *Cost if wrong: guarded on
   `defaultPrevented` alone, the panic key closes the studio while pausing the run, and one Escape
   dismisses a completion popup and the window together. Both are covered by Playwright assertions
   of their own, and neither is quarantinable.*
5. **The quiet near-monochrome theme.** *Cost if wrong: the editor looks less like VS Code than the
   request implies. Reversal is one file.*
6. **The forbidden globals are shadowed at compile time, not merely warned about, and the blocking
   subset is enforced in `compileUserScript` rather than in the studio.** `eval` cannot be
   shadowed, so it is caught by a source scan at that same chokepoint and refused with a new
   `forbidden_api` error code, identically from the Run button, the task card, the auto-start
   toggle, the snippet box and SP4c. The studio's V2 rules become the fast in-editor rendering of
   the same list. The honest shape is: accidental network use impossible, casual deliberate network
   use refused everywhere a run starts, a determined constructor-chain escape still open. *Cost if
   wrong: an existing user script that was quietly using `fetch` stops working, with a `TypeError`
   naming the global, or is refused with `forbidden_api`. Enforcing it only in the studio, which is
   what the earlier draft did, means the refusal holds in the one surface that authored the code
   and nowhere else, while the spec claims otherwise.*
7. **The compiled manifest is persisted on `UserTaskDoc`.** *Cost if wrong: a document shape
   changes. No rules change is required, the migration is a no-op, and the alternative is that user
   scripts keep having no params form.*
8. **Save always succeeds and never touches a running Worker; restart is explicit.** *Cost if
   wrong: a player must click Restart to see their change take effect. The alternatives are
   refusing the save (loses work) or hot-swapping (unsound, and it makes the run report dishonest).*
9. **One open buffer at a time, and multi-file is cut with the seam preserved.** *Cost if wrong:
   SP4b task 13's eleven-module `tutorialIsland` still has no fork seed, and the studio says so
   rather than producing a concatenation that would not compile.*
10. **Drafts and revisions are local (IndexedDB); there is no autosave to Firestore and no server
    revision history.** *Cost if wrong: a player who changes device loses their unsaved drafts,
    which are by definition unsaved.*
11. **SP4c conflicts are compare-and-set with `expectedVersion`, not a merge.** *Cost if wrong: a
    player must choose Keep mine or Reload theirs. A merge UI is a product of its own.*
12. **The Automation panel's Run snippet box stays** (SP4 section 12.1 item 3 is not superseded),
    and the studio adds `Run selection as a snippet` on the same `api.execute` path. *Cost if
    wrong: two snippet surfaces coexist for one phase. Removing it is a later deletion, not a
    prerequisite.*
13. **The trace window is not suppressed while the studio is open, and is occluded by it.** Its
    state is never touched and it returns unchanged when the studio closes; while the studio is
    open the Console tab is the same stream in the same row grammar, reusing `traceView.ts`'s
    kind-to-rail map wholesale so the rows look identical in both. *Cost if wrong: a player who
    opens both and then closes the studio sees the same rows twice, in two places they chose to
    open. Claiming they sit beside each other, which the earlier draft did, is not available: both
    live in the canvas column and the studio covers it.*
14. **No `Proxy` over `c.sdk` to hide `transport`** (section 15.1). *Cost stated there.*
15. **Both Playwright specs run against `build:e2e` output**, not the dev server, because the
    `/assets/` 404 trap is invisible in dev. *Cost if wrong: nothing; it is slower.*
16. **`OverlayList` is drawn here, from existing tokens, in its own stylesheet, and does not join
    the canvas overlay family.** *Cost if wrong: a family filed under `overlay` inherits the black
    scrim and 2px blur the brand guide calls the only language over the canvas and forbids inside
    panels, so a palette inside a window would read as canvas chrome.*
17. **The rail has no per-row overflow menu.** Duplicate and Delete are `.btn-xs .btn-outline` on
    the open row, Rename is `F2` and the header field, and all three are palette commands. *Cost if
    wrong: a row is one click deeper than a menu would make it. Adding the menu means adding a
    popover family section 6.1 says this entry does not add.*
18. **The `Window` family's defaults are the trace window's values and `.win-bank` carries the
    bank's**, because the two mock instances disagree on ground, header, shadow and placement.
    *Cost if wrong: the studio inherits the bank's warm ground or heavier shadow and reads as a
    second bank, which section 4.1 already rules against on the ground colour alone.*
19. **The empty-state circle is empty**, carrying neither the mock's decorative glyph nor a
    substitute from the eleven-icon set, which has none that fits. *Cost if wrong: two empty states
    look plainer than the mock's. The alternatives are a glyph the brand guide bans or an icon that
    does not exist.*
20. **V1 shape validation runs in a disposable compile worker the studio owns**, not in the agent
    worker's `compile` message. *Cost if wrong: a half-typed `while (true)`, at 750 ms intervals,
    blocks the thread driving the live run and queues the Escape pause behind it, defeating ruling
    4. The alternative, gating debounced V1 on an idle run, costs about 2 KB less and removes shape
    feedback exactly when a player most wants it; it was owner question 18, ruled in section 24.*

21. **Sprint entry 4**, after the script API reference and before the survey spec's phase-next
    row, with everything below renumbered once (section 21). *Cost if wrong: placing it after
    battlebots at entry 7 keeps the shovel-ready work early and costs battlebots' four bot scripts
    and time candy's testing being authored in a textarea, against a `tasks.ts` three more entries
    have touched.*
22. **`no-fixed-sleep` is an error that blocks Run and not Save.** This document had it as a
    warning; the standard's S7 treats a fixed sleep as the rule the survey supports most strongly of
    any, and that disagreement (survey spec section 6.3) is resolved in the standard's favour under
    D11. It takes the tier `no-eval` and `no-await-in-when` already have, and it is the one rule
    that ships a quick fix, so complying is a keystroke. *Cost if wrong: reversing it means moving
    one severity in `standard.ts` and softening S7 to "discouraged" in the same edit. The two move
    together, because a standard whose strongest rule the validator declines to enforce is not a
    standard.*
23. **The validator consumes `web/src/tasks/standard.ts` rather than declaring its own rule list**,
    and the list grows from ten rules to fourteen: `no-static-widget-id` (S5, P15), `no-legacy-wait`
    (S7), `no-captured-signal` (S2) and `no-deprecated-member` (S12) join the ten (section 8.2). A
    test asserts that this directory's exports and that module's list agree, the way
    `forbidden.ts` already does for the security list. *Cost if wrong: the standard and the linter
    become two documents that can disagree, which is the failure Spec A's gate 1 exists to prevent
    one layer up. The four new rules are lezer walks of the same shape as the ten; the cost of
    omitting them is that four of the standard's twelve rules have no enforcement point at all.*
24. **Completions and hover surface `deprecated`** (section 8.3), sorted below the replacement and
    never hidden. *Cost if wrong: a completion that offers a deprecated member without saying so
    actively works against S12's whole deprecation path, which is the mechanism that makes
    "additions over renames" survivable.*
25. **The help pane's markdown subset is stated once, in Spec A section 5**, and this renderer
    implements exactly it (section 12). *Cost if wrong: two enumerations of one contract, which is
    precisely the drift Spec A's gate 5 was built to catch and would then be catching against the
    wrong list.*
26. **A Worker-resident script is trusted as the account's own code, and every mechanism in section
    15 is a guardrail rather than a boundary** (section 15.2, from audit C30, recorded as D24). The
    forged-RPC path is real and unclosable from inside; no cross-account sharing exists, which is
    what bounds the blast radius; and any future sharing or relay of another account's code carries
    this as an explicit precondition on that entry's scope line. *Cost if wrong: the audit's
    alternative, giving recovery its own message type, is still forgeable from inside the Worker, so
    it buys the appearance of a boundary and not one. Saying so plainly is what makes SP4c's
    precondition legible instead of a surprise.*
27. **Entry 2 owns the window family, including its names and its file; section 4.2's table is the
    values it must carry** (D22). The shell v2 plan already builds the chrome in its Task 7 under
    `.window*` in `overlay.css`; where those names differ from this document's earlier
    `.win`/`.win-bank` proposal, entry 2 wins and this entry composes what lands. *Cost if wrong:
    the studio does entry 2's extraction on two other surfaces, which was owner question 16's
    alternative and is priced in section 4.2.*
28. **The panic Escape handler's home after entry 2 is `frame/copilotBar.ts`, not
    `frame/runBanner.ts`, and there is no run banner left for the studio to occlude.** Entry 2's
    Task 14 deletes the banner, lifts its keydown handler into the bar, and moves the bar out of
    `#canvas-wrap` above `#stage`, so the studio's host is `inset: 0` and the bar stays visible and
    live above the window. *Cost if wrong: the change lands in a file that no longer exists, or the
    studio ships an inset for a bar that is not in its box. Both are caught by the section 18.3
    panic assertion, but only after they have already cost a round.*
29. **Everything the studio scaffolds follows the standard's S1** (section 9.1): the nine templates,
    the fork seed and the snippet console's starting text. *Cost if wrong: the first API a player or
    an agent session reads invents its own naming, and every script written from a template carries
    it forward.*

## 24. Questions this document no longer asks

All nineteen owner questions this document raised are ruled above under D11. **Every one took the
recommendation the draft made**, and the alternatives and their costs stay in the rulings, so any of
them can be overturned at review without reconstructing the argument. Two rulings changed their
reasoning rather than their answer, because the shell v2 plan turned out to build something better
than the mock implied, and both are flagged in the table.

| Was question | Subject | Ruled at |
|---|---|---|
| 1 | Window size, placement, and what it may cover | ruling 1, with D22 owning the layout change |
| 2 | What Escape does | ruling 4, and ruling 28 for where the handler lives |
| 3 | CodeMirror pinned or vendored | ruling 3 |
| 4 | Roughly 1 MB for real type checking | ruling 4's phase 2 gate, and section 20 |
| 5 | Whether the syntax theme spends colour | ruling 5 |
| 6 | Whether the forbidden globals are blocked, and where | rulings 6 and 26 |
| 7 | Persisting the compiled manifest | ruling 7 |
| 8 | One buffer or tabs, multi-file or not | ruling 9 |
| 9 | Revision history and autosave | ruling 10 |
| 10 | Whether the studio replaces the Run snippet box | ruling 12 |
| 11 | Import from disk or URL, publish to the Marketplace | ruling 26, and section 15.6 |
| 12 | Where this entry sits in the sprint | ruling 21 |
| 13 | Whether the SP4c conflict needs more than compare-and-set | ruling 11 |
| 14 | Which empty-state pattern, and what goes in the circle | ruling 19 |
| 15 | Whether the mock's em dashes count as design literals | see below |
| 16 | Whether the `Window` family belongs here or to Shell v2 | ruling 27, per D22 |
| 17 | Where `New script` lives in the Automation panel | ruling 17's neighbour: the panel header's action slot |
| 18 | Whether V1 gets its own compile worker | ruling 20 |
| 19 | Whether the banner's occlusion needs more | ruling 28: **the answer is still no, and the reason changed.** After entry 2 there is no run banner and the co-pilot bar is outside the canvas column, so nothing of it is occluded and the re-provision this document promised is no longer owed |

**Was question 15, the em dashes, ruled here because it is a copy rule rather than a design one.**
The shell v2 ruling it deferred to is D12: mock copy ships verbatim with its em dashes, confined to
`web/src/ui/copy.ts`. That ruling covers **mock literals only**. It does not travel to prose this
entry writes, so: **every string this entry authors that is not a literal transcribed from the mock
carries no em dash**, per the sprint's rule, and the few strings it does transcribe follow D12 and
live where D12 puts them. The two halves are separable in practice because this entry's own copy is
diagnostics, alerts, empty-state titles and button labels, none of which the mock draws.
## 25. What this does not do

- It does not change the script model, the run lifecycle, the pause reasons, the one-run-per-tab
  rule, or the trace. SP4 sections 7 and 8 and SP4b own those and this document composes them.
- It does not add a strip button, a twelfth glyph, a panel, or a route.
- It does not introduce a second trace, a second run report, a second markdown renderer, or a
  second monospace family. It does add **one more place `compileUserScript` runs**, a disposable
  studio-owned compile worker with no transport and a kill timer (section 8), which is a third
  caller of an existing evaluator rather than a new one, and the spec says so plainly rather than
  keeping the tidier "no second evaluator anywhere" sentence it can no longer honestly claim.
- It does not transpile TypeScript, change `UserTaskDoc.code`, raise the 64 KB cap, or raise the
  60-character name limit.
- It does not sandbox the Worker. It closes the accidental-network path and states plainly that a
  real sandbox is a CSP the runtime cannot currently accept.
- It does not support multi-file scripts, and therefore does not give SP4b task 13's
  `tutorialIsland` a fork seed. It refuses that fork with a message instead.
- It does not let a script be imported by URL or published to the Marketplace.
- It does not touch pack ids, engine or client patches, or the content overlay.
