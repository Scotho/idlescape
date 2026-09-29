# Shell v2: the test migration the redesign forces

Read at commit `19607b11dc7aead32aa7762f968bfb7fb7339656` (branch `sprint/dragon-slayer`), 2026-09-07.
Read-only inventory for the plan of sprint entry 2, "Shell v2 and the living component library".

**Moving files.** SP4b (sprint entry 1) is committing into this same tree as this was written.
Everything under `web/src/tasks/`, `web/src/agent/`, `web/src/frame/runBanner.ts`,
`web/src/plugins/builtin/tasks*.ts`, `traceView.ts` and `runReportView.ts` is SP4b tasks 9-15
territory. Every line number below for `web/src/plugins/builtin/tasks.test.ts`,
`tasks.settings.test.ts`, `traceView.test.ts`, `web/src/frame/runBanner.test.ts` and
`web/e2e/tasks.pw.test.ts` is **as of the commit above and may have moved**. Re-grep those five
before editing them; treat their counts as lower bounds.

## 1. The suite as it stands

| Measure | Count |
|---|---|
| Unit test files (`web/src/**/*.test.ts`) | 107 |
| Harness files (`web/src/**/*.harness.ts`) | 6 |
| Unit tests (`test(` 763 + `it(` 332; no `.each`, `.skip`, `.only` anywhere) | 1,095 |
| Playwright specs (`web/e2e/*.pw.test.ts`) | 10 |
| Playwright `test(` cases | 35 (bank-ui 5, bank 3, gate-to-game 3, measure 4, tasks 4, characters 2, tabs 2, gameplay 1, plugins 1, wiki 1) |
| Stylesheet layer | 13 files, 938 lines; largest `bank.css` 268, `data.css` 126, `tasks.css` 108, `tokens.css` 85 |

The gaps doc's section 2 quotes "1,092 unit tests across 106 files ... plus 21 Playwright specs".
Both halves are stale: it is 1,095 across 107 now, and the 21 counts Playwright *cases* from an
older tree, not spec files. Use 1,095 tests / 107 files / 10 spec files / 35 cases.

### Files already at or over 350 lines (a migration that adds to them must split first)

| File | Lines | Touched by this redesign? |
|---|---|---|
| `web/src/sessions/manager.test.ts` | 396 | Yes, indirectly. G3's session-start timestamp lands in the session manager. |
| `web/src/plugins/builtin/tasks.test.ts` | 391 | **Yes, heavily.** G6 rename, the Marketplace tab (G4), the trace pop-out. Already split once (`tasks.settings.test.ts` exists because it hit the ceiling). Moving file. |
| `web/e2e/bank-ui.pw.test.ts` | 380 | Yes. The 280px panel moves `#bank-host`'s left edge, which its clamp test reasons about explicitly. |
| `web/src/agent/worker.test.ts` | 375 | No |
| `web/src/bank/stream.test.ts` | 375 | No |
| `web/src/bank/view.test.ts` | 357 | Yes. The bank window is redrawn (470px warm ground, left tab rail, IconCache icons). |

Nothing else in either suite is above 350. `web/e2e/helpers.ts` is 328 and will grow (section 10).

## 2. Panel ids and selectors

### `[data-panel="..."]` and `data-panel`

| File | Line | Literal | Breaks on |
|---|---|---|---|
| `web/src/frame/panels.test.ts` | 9, 27 | `data-panel="connect"` | G7. The fixture's strip buttons are hand-written; narrowing `icon` to the glyph union changes `CONNECT_MANIFEST` on line 4. |
| `web/src/frame/panels.test.ts` | 9, 43, 66 | `data-panel="xp"` | G7 only |
| `web/src/frame/runBanner.test.ts` | 9, 56, 76 | `data-panel="tasks"` with the literal `▶` as its text | banner to co-pilot bar; G7 (emoji inside the fixture). Moving file. |
| `web/src/ui/strip.test.ts` | 6, 7, 8 | `data-panel="connect"`, `"xp"`, `"config"`, glyphs `✦` `📈` `⚙`, `title=` attributes | G7. Three emoji literals in the strip a11y fixture. |
| `web/e2e/gameplay.pw.test.ts` | 37, 40 | `[data-panel="connect"]` | Id survives; the panel-title assertion on line 38 is what changes (section 4) |
| `web/e2e/gate-to-game.pw.test.ts` | 28 | `[data-panel="account"]` | G5. The account panel absorbs the whole character section, so what lines 29 onward assert changes. |
| `web/e2e/plugins.pw.test.ts` | 13 | `[data-panel="plugins"]` | G7 icon only; selector survives |
| `web/e2e/tasks.pw.test.ts` | 94 | `[data-panel="tasks"] .strip-dot` with class `dot-accent` | G6 keeps the id (ruling 2), so the selector survives; the co-pilot bar replaces the banner that drives the dot. Moving file. |
| `web/e2e/helpers.ts` | 132-142 | `openPanel(page, id)` builds `[data-panel="${id}"]`, checks `.active`, waits on `#side-panel` | G4, G5, G6 through the dead ids below |

### `openPanel('...')` call sites in the e2e suite

| File | Line | Id asked for | Breaks on |
|---|---|---|---|
| `web/e2e/characters.pw.test.ts` | 21, 53 | `'characters'` | **G5.** Id deleted. Both calls become `openPanel(page, 'account')`. |
| `web/e2e/measure.pw.test.ts` | 45 | `'characters'` | **G5.** The spec is `test.skip` unless `E2E_MEASURE=1`, so it will not fail the gate; it will rot silently. Fix it in the same commit or it stays broken for months. |
| `web/e2e/tabs.pw.test.ts` | 57 | `'characters'` | **G5** |
| `web/e2e/helpers.ts` | 223 | `'characters'` inside `createCharacterFromPanel` | **G5.** One helper edit fixes every caller. |
| `web/e2e/tasks.pw.test.ts` | 43 | `'marketplace'` | **G4.** Marketplace loses its strip button, so `openPanel` can never find `[data-panel="marketplace"]`. Becomes `openPanel(page,'tasks')` plus a click on the Automation panel's Marketplace segment. Moving file. |
| `web/e2e/tasks.pw.test.ts` | 98 | `'tasks'` | G6. Id survives; the panel it opens is renamed Automation and reshaped. |
| `web/e2e/bank-ui.pw.test.ts` | 188 | `'bank'`, plus `openBankWindow` calling `openPanel(page,'bank')` at `helpers.ts:297` | Bank window redraw |

### `cs.panel`

Exactly one test names the key: `web/src/frame/panels.test.ts:51`,
`expect(localStorage.getItem('cs.panel')).toBe('xp')`. There is **no test anywhere for the
`characters -> account` fallback** that ruling 3 makes permanent. That fallback would ship untested
unless the plan adds a case; `panels.test.ts` is 68 lines with room for it.

## 3. The ids `characters`, `tasks`, `marketplace`, `connect`, `account`

| Id | Where named in tests | Fate |
|---|---|---|
| `characters` | `web/e2e/characters.pw.test.ts:21,53`; `measure.pw.test.ts:45`; `tabs.pw.test.ts:57`; `helpers.ts:223`. Plus the whole of `web/src/plugins/builtin/characters.test.ts` (214 lines, **15 tests**), which tests the plugin being deleted. | **Deleted (G5).** The 15 tests do not die; they move into `web/src/panels/account.test.ts`, which is 39 lines and 3 tests today. 18 tests fits 400 lines only if the account panel's own new surface (tier badge, "Characters · 2 of 3", inline create, Sign out) does not also land there. Plan a split: `account.test.ts` plus `account.characters.test.ts`. |
| `tasks` | `runBanner.test.ts:9,56,76`; `tasks.test.ts:155`; `tasks.pw.test.ts:94,98`; the `cs.plugin.tasks` settings store behind `tasks.settings.test.ts` | **Id survives (ruling 2).** Only `name: 'Tasks'` changes. One unit assertion breaks: `tasks.test.ts:155`. Moving file. |
| `marketplace` | `marketplace.test.ts:101` (manifest), `tasks.test.ts:308` (`expect(openPanel).toHaveBeenCalledWith('marketplace')`), `tasks.pw.test.ts:43-44` | **Plugin and view survive, strip button dies (G4).** `marketplace.test.ts:101` asserts `icon: '⚑'` and by implication a strip presence; the manifest loses `panel`, so the `toMatchObject` needs a panel-absence assertion added, not just the icon changed. `tasks.test.ts:303-308` ("the footer sends the player to the marketplace") becomes a *tab switch*, and it is the most likely silent survivor in the suite: a `vi.fn()` mock happily records a call to a panel that no longer exists. |
| `connect` | `panels.test.ts:4,9,23,27,34`; `connect.test.ts:19`; `ui/strip.test.ts:6`; `gameplay.pw.test.ts:37,40` | Id and display name both survive. `connect.test.ts:19` asserts `icon: '✦'` inside a `toEqual`, so it fails hard on G7. |
| `account` | `account.test.ts:17` (`toEqual({ id:'account', name:'Account', icon:'☺', tier:'shell' })`); `pluginsPanel.test.ts:17,23,32,36,43`; `gate-to-game.pw.test.ts:28-29` | Survives and absorbs `characters` (G5). `icon: '☺'` fails on G7. |

## 4. Panel titles and display strings

| File | Line | Literal | Breaks on |
|---|---|---|---|
| `web/e2e/characters.pw.test.ts` | 22 | `expect('#panel-title').toHaveText('Characters')` | **G5.** There is no Characters panel; becomes `'Account'`. |
| `web/e2e/tasks.pw.test.ts` | 44 | `expect('#panel-title').toHaveText('Marketplace')` | **G4.** Marketplace is a segment inside Automation, so `#panel-title` reads `Automation`. |
| `web/e2e/gameplay.pw.test.ts` | 38 | `toHaveText('Claude')` | Survives |
| `web/e2e/gate-to-game.pw.test.ts` | 29 | `toHaveText('Account')` | Survives |
| `web/src/plugins/builtin/tasks.test.ts` | 155 | `name: 'Tasks'` | **G6.** Becomes `'Automation'`. Moving file. |
| `web/src/plugins/builtin/marketplace.test.ts` | 101 | `name: 'Marketplace'` | Survives as a plugin name; the strip never shows it |
| `web/src/frame/panels.test.ts` | 25, 65 | `'Claude'`, `'xp-content'` | Survives |
| `web/src/frame/characterTabs.test.ts` | 33, 37, 76, 80, 134, 139, 141 | the word `'online'` and `'offline'` in `[data-tab-status]` | **G3.** The design replaces `online` with a live `1:29:07` timer. Four assertions on the literal `'online'`, one on `'offline'`, plus the tooltip `'alpha · online'` on line 37. A rewrite, not a rename. |
| `web/e2e/tabs.pw.test.ts` | 30 | polls `[data-tab-status]` textContent `.toBe('online')` | **G3**, same |
| `web/e2e/tabs.pw.test.ts` | 37 | `'coming soon'` on `[data-char-tab-more]` | Survives unless the tab strip copy is redrawn; check the mock |
| `web/e2e/gate-to-game.pw.test.ts` | 25 | `#foot-left` contains `'guest · attach an email'` | The footer is 21px `#1a1a1c` in the mock and its copy is not restated there. Confirm against the mock. |
| `web/src/frame/stage.test.ts` | 153, 176, 190 | title-bar text `'osrs.scotho.com · world 1 · name_a'` | The title bar is redrawn (28px gradient). Confirm the composed string against the mock. |
| `web/e2e/tasks.pw.test.ts` | 72 | `.toast-host` contains `/bronze axe/i` | The only toast-copy assertion in either suite |

`web/src/ui/toast.test.ts` (30 lines, 2 tests) asserts the classes `.toast`, `.toast-ok`,
`.is-leaving` and a 3-toast visible cap. Those class names are candidates for the alert family in
the G9 split, so the file is coupled to the CSS work even though it names no copy.

### The run banner's copy (all of it dies with the banner)

`web/src/frame/runBanner.test.ts` (171 lines, 11 tests) and the banner half of
`web/e2e/tasks.pw.test.ts`. Both moving files.

| Where | Literal |
|---|---|
| `runBanner.test.ts:31` | `'Stuck on cut-tree'` |
| `runBanner.test.ts:23,120,126` | elapsed `'02:05'`, `'02:08'` |
| `runBanner.test.ts:141,145` | `'resumes in 10s'`, `'resumes in 7s'` |
| `runBanner.test.ts:24,160` | task names `chop-nearest`, `walk-to-bank` |
| `tasks.pw.test.ts:93` | `'e2e loop'` |
| `tasks.pw.test.ts:107` | `'Paused'` |
| `tasks.pw.test.ts:119,129` | `'You took over'` |
| `tasks.pw.test.ts:227` | `/Stuck/` on `#run-banner` |

The co-pilot bar's five states carry entirely new copy from the mock: "not paired - Claude can play
this character alongside you", "paired · standing by", "paused - you took control",
"stuck on <task>", plus the `Esc take control` kbd hint. None of it exists in any test today. G8
check 1 belongs here: the bar reads two sources (pairing state and run state), and the eleven run
state literals must each map onto one of the five presented states.

## 5. Emoji icon literals (G7)

Every typed one of these is a compile error the moment `PluginManifest['icon']` is narrowed to the
eleven-glyph union, which is exactly what the G7 resolution is for.

| File | Line | Literal |
|---|---|---|
| `web/src/panels/account.test.ts` | 17 | `'☺'` inside a `toEqual` (exact) |
| `web/src/panels/connect.test.ts` | 19 | `'✦'` inside a `toEqual` (exact) |
| `web/src/plugins/builtin/marketplace.test.ts` | 101 | `'⚑'` |
| `web/src/frame/panels.test.ts` | 4 | `'✦'` on `CONNECT_MANIFEST` |
| `web/src/frame/panels.test.ts` | 5 | `icon: 'xp'` on `XP_MANIFEST`. **Already a glyph name, not an emoji.** Free pass, and a hint that the union was half anticipated. |
| `web/src/plugins/pluginsPanel.test.ts` | 16, 17, 18, 80 | `'★'`, `'☺'`, `'▦'`, `'★'` |
| `web/src/plugins/registry.test.ts` | 28, 37, 38, 39, 49, 50, 61, 71, 81, 93, 111, 122 | `'★'` twelve times |
| `web/src/plugins/types.test.ts` | 8, 15 | `'★'`, `'☺'` |
| `web/src/ui/strip.test.ts` | 6, 7, 8 | `'✦'`, `'📈'`, `'⚙'` in raw fixture HTML. **Not typed**, so no compile error. Silent survivor. |
| `web/src/frame/runBanner.test.ts` | 9, 56, 76 | `'▶'` in raw fixture HTML. Same, silent. Moving file. |

**24 typed sites across 6 files** fail to compile; **6 untyped fixture sites across 2 files** do
not, and would keep rendering emoji into a strip that should be drawing SVG. Grep for the raw
glyphs, not only for `icon:`.

## 6. The strip's DOM shape and ARIA

`web/src/ui/strip.test.ts` (62 lines, 4 tests) is the whole strip contract, and it is entirely
fixture-driven: three hand-written `<button class="strip-btn" data-panel=... title=...>` elements.
It asserts `role="tablist"` on the nav; `role="tab"` on each `[data-panel]`; `aria-selected`
mirroring `.active`; roving `tabIndex` (`0` / `-1`); `title` moved to `dataset.tip` plus
`aria-label`; ArrowUp and ArrowDown wrapping, Home, End; and `syncSelected()` following a later
`.active` change.

The redesign keeps this contract but changes the button's *contents* from a text glyph to an inline
SVG. The `aria-label` assertion on line 26 then carries the entire accessible name, since an SVG
contributes no text, so `applyTabListA11y` must run after `icon()` renders and the fixture must
contain an SVG child or the test proves nothing about the real strip. The strip is 40px in the
mock; nothing in either suite measures it.

Other ARIA the redesign touches:

- `#side-panel` is `aria-live="polite"` in `web/src/partials/frame.html:23`. No test asserts it.
- `#run-banner` is `role="status"` (`frame.html:12`), and `runBanner.test.ts:108-157` is built
  entirely around that live region being atomic: `aria-hidden="true"` on `[data-banner-elapsed]`
  and `[data-banner-countdown]`, plus "same node, mutated in place" identity checks so a tick does
  not re-announce the whole bar. **The co-pilot bar has to re-earn every one of those properties**,
  and they are the least obvious thing in the file.
- `web/src/bank/view.a11y.test.ts` (103 lines) and `grid.test.ts:12,14,56,57` pin the bank grid's
  `role="row"` / `role="gridcell"` / `aria-label` shape; `tabsBar.test.ts:68,69,78,79,189` pins
  `aria-selected` and per-tab `aria-label`. The bank window redraw must preserve all of it.

## 7. DOM hooks named by tests

### `#side-panel`, `#panel-title`, `#panel-body`

`helpers.ts:141` (`#side-panel` visible), `bank-ui.pw:179,234`, `gameplay.pw:41`;
`#panel-title` at `characters.pw:22`, `gameplay.pw:38`, `gate-to-game.pw:29`, `tasks.pw:44`;
`#panel-body` at `bank-ui.pw:189`, `characters.pw:31`, `gameplay.pw:39`. All survive the 280px
panel as selectors; only their contents change.

### `[data-bank-slot]` and `#bank-capacity`

45 references in unit tests and harnesses, 10 in e2e. `web/src/bank/grid.harness.ts:46` and
`gridInput.harness.ts:112,121` are built on it, so the harnesses are load-bearing for the bank
redraw. `#bank-capacity` is read at `view.test.ts:87,89`, `view.teardown.test.ts:61,191`, and in
`helpers.ts:300` where `openBankWindow` **polls it against `/^\d+ \/ 240$/`**. The mock shows a mono
capacity in the header; if the format gains a separator or a suffix, every bank e2e hangs for 20
seconds and then fails on a timeout rather than on a readable assertion.

### `[data-task-run]`, `[data-trace-open]`, run-card hooks

`tasks.test.ts:59,69,185,200` use `[data-task-run]`; `tasks.test.ts:274,285,294` use
`[data-trace-open="r1"]` to open an **inline** `[data-trace-row]` list inside the panel. The design
makes the trace a **pop-out window over the stage bottom right, 430px**, so those three tests assert
a shape the redesign deletes.

`web/src/plugins/builtin/traceView.test.ts` (119 lines, 9 tests) is safer than it looks: it calls
`renderTraceView(events, { copy })` and inspects the returned element, so the row rendering,
`[data-trace-filter]`, `[data-trace-copy]`, `.trace-pre` and `button.trace-line` all survive a
change of *mounting*. G8 check 2 is about the mounting, not the rows. What the design does add is a
`kind` per line for the 2px rails, and `traceView.test.ts:19` already asserts `r.dataset.kind` for
every event, so that contract exists.

Run card: `[data-run-card]`, `[data-run-state]`, `[data-run-pause]`, `[data-run-resume]`,
`[data-run-stop]`, `[data-run-task]`, `[data-run-restart]`, roughly 16 references in unit tests and
8 in `tasks.pw`. The README says the run card is a **patch in place, do not rebuild**, so these are
the hooks to preserve deliberately rather than rediscover.

### `[data-banner-*]`

`[data-banner-task]` x7, `[data-banner-elapsed]` x3, `[data-banner-script]` x2,
`[data-banner-countdown]` x2, `[data-banner-resume]` x1, `[data-banner-stop]` x1, all in
`runBanner.test.ts`, all dead with the banner. Plus `#run-banner` at `tasks.pw:92,227` and
`.strip-dot` / `dot-accent` at `runBanner.test.ts:25,67,105` and `tasks.pw:94`. The strip dot
survives the redesign (the README has Pause/Resume/Stop driving "bar, run card, strip dot, pills"),
so keep those three unit assertions and re-home them onto the co-pilot bar's module.

### The character tab's DOM

`web/src/frame/characterTabs.test.ts` (143 lines, **14 tests**) plus `web/e2e/tabs.pw.test.ts`.
Hooks: `[data-char-tab]` (14 unit, 8 e2e), `[data-char-tab-new]`, `[data-char-tab-locked]`,
`[data-char-tab-more]`, `[data-tab-status]`, `aria-selected` (`characterTabs.test.ts:79`), and the
tooltip `'alpha · online'` (line 37). Changes: the 32px tab height, and G3 replacing
`[data-tab-status]`'s word with a ticking `h:mm:ss` on the active tab. Offline tabs presumably keep
a word; the mock decides.

### The characters panel's DOM (moves wholesale into account, G5)

`#char-panel-name`, `#char-panel-create`, `#char-panel-error`, `[data-char-row]`,
`[data-char-open]`, `[data-char-delete]`, `[data-char-switch]`.

Unit: `characters.test.ts:51,61,62,63,69,70,71,72,79,85,86,94,107,108,118,121,129,130,131,137,138,147,156,176,191,192,200,201,203,210,211`.
E2E: `characters.pw:23,25,26,27,30,37,54,55,61,65`; `bank.pw:115`; `measure.pw:46-48`;
`helpers.ts:222-232` (`createCharacterFromPanel`).

**Do not confuse these with the gate screen.** `web/src/characters/gate.test.ts` (160 lines, 12
tests) drives `#screen-characters`, `#char-name`, `#char-create-form`, `#char-create-error` read out
of `src/partials/characters.html`, and `gate-to-game.pw:70-81` and `tabs.pw:17-18` use it. That is
the pre-game gate, a different surface, and the design does not merge it. Two similarly named DOMs,
one merged and one not, is the trap inside G5. `web/src/home/controller.test.ts:46` also loads
`partials/characters.html` alongside `home.html`.

## 8. `.p-*` classes (retired in the same pass as the CSS split)

The family in `web/src/styles/`: `.p-btn`, `.p-btn-danger`, `.p-btn-icon`, `.p-btn-primary`,
`.p-empty`, `.p-error`, `.p-input`, `.p-label`, `.p-link`, `.p-msg`, `.p-muted`, `.p-notes`,
`.p-ok`, `.p-plugin-controls`, `.p-plugin-desc`, `.p-plugin-icon`, `.p-plugin-list`,
`.p-plugin-main`, `.p-plugin-name`, `.p-plugin-row`, `.p-plugin-settings`, `.p-row`,
`.p-row-stack`, `.p-setting`, `.p-setting-label`, `.p-settings-form`, `.p-shot-strip`,
`.p-shot-thumb`, `.p-table`, `.p-value`. Thirty classes, roughly 180 emission sites across
non-test `web/src/**/*.ts`.

Only **five** test assertions name one:

| File | Line | Class |
|---|---|---|
| `web/src/panels/connect.test.ts` | 39 | `.p-empty` |
| `web/src/panels/connect.test.ts` | 73 | `.p-value` |
| `web/src/panels/connect.test.ts` | 156 | `.p-empty` |
| `web/src/plugins/builtin/characters.test.ts` | 189 | `.p-error` |
| `web/src/plugins/builtin/screenshot.test.ts` | 37 | `.p-shot-thumb` |

**The `.p-*` retirement is almost invisible to the test suite.** Nothing catches a half-done
retirement: 180 emission sites, five assertions. Library part 4's "no per-panel selector outside its
layout file" rule is the only mechanical defence, and it has to be written as part of this entry
rather than deferred, or step 1 of the order of work lands unverified.

When grepping, anchor on `.p-` or `class="`. A bare `grep p-` over `web/src` also hits script ids:
`chop-and-drop` (81 hits), `chop-nearest`, `chop-and-drop-fork`, `chop-logs-when-full`,
`mine-ore-when-full`, `catch-fish-when-full`.

## 9. Tests coupled to stylesheet *files* (the G9 split breaks these, and they are easy to miss)

| File | Line | What it does |
|---|---|---|
| `web/src/styles/bank.test.ts` | 30 | `expect(read('index.css')).toContain("@import './bank.css';")`, a literal import line |
| `web/src/styles/bank.test.ts` | 33 onward | Enumerates roughly 25 `.bank-*` selectors that must exist in `bank.css` (8 tests, 93 lines). A split by component family relocates most of them. |
| `web/src/partials.test.ts` | 38, 40, 44 | Reads `styles/frame.css` and `styles/data.css` by name and regex-matches the `.title-link`, `.title-link:hover` and `.wiki-link` base rules |
| `web/src/frame/runBanner.test.ts` | 165-170 | Reads `tasks.css` and asserts four literal strings, including `z-index: calc(var(--z-overlay) + 1)` and three `.run-banner:not(.hidden) ~ ...` selectors. Dies with the banner **and** with the split. Moving file. |

Three separate test files hard-code stylesheet filenames. The G9 split (`tokens`, `base`, then one
file per family: button, badge, card, meter, form, overlay, strip, tab, alert, icon, then per-surface
layout files) renames or deletes `data.css`, `tasks.css` and probably `bank.css` as a unit. Plan
these three edits into the **first** task of the sprint order (section 6 step 1), not discovered at
step 6.

`web/src/partials.test.ts` also reads `src/partials/frame.html` and `home.html` directly, and
`frame.html` is where `#character-tabs`, `#run-banner`, `#overlays`, `#side-panel`, `#panel-title`,
`#panel-body` and `#foot-left` are declared. Every frame-level structural change is a `frame.html`
edit that this file sits on top of.

## 10. `web/e2e/helpers.ts` exports the specs depend on (328 lines)

Constants: `GATE_PASSWORD`, `SIGNUP_PASSWORD`, `CANVAS` (789x532), `MINIMAP_CENTRE`,
`VIEWPORT_CENTRE`, `TITLE_LOGIN_BUTTON`, `LOADING_BAR_RED`, `MANAGEMENT`, `MANAGEMENT_SECRET`.
Type: `BankSnapshot`.
Functions: `uniqueName`, `openGate`, `clientState`, `createFirstCharacter`, `loginAsGuest`,
`openCharacterTab`, `sessionStates`, `signUp`, **`openPanel`**, `installRecorder`, `canvasClick`,
`canvasPixels`, `pressTitleLogin`, `waitForMove`, **`createCharacterFromPanel`**,
`managementContext`, `idTokenFor`, `readBank`, `signUpAndPlay`, **`openBankWindow`**,
`bankObjOrder`, `dragBankSlot`. (Private: `activeCanvasBox`.)

Four are on the redesign's critical path:

- `openPanel` (132-142). The `[data-panel]` plus `.active` plus `#side-panel` contract, used by six
  specs. Its comment explains that the strip toggles and that `startSession` restores the last open
  panel after a character switch, so a blind click closes an already-open panel. That reasoning
  survives the redesign and should be preserved verbatim.
- `createCharacterFromPanel` (222-232). Opens `'characters'`, fills `#char-panel-name`, submits
  `#char-panel-create button[type="submit"]`, waits on `[data-char-row]`. **G5 rewrites all four
  lines**, and fixing this one helper fixes `characters.pw`, `bank.pw`, `measure.pw` and `tabs.pw`
  at once. Do it first.
- `openBankWindow` (296-302). The `#bank-capacity` `/^\d+ \/ 240$/` poll (section 7).
- `dragBankSlot` (317-327). `#bank-window [data-bank-slot="N"]` geometry, with a documented 4px
  drag threshold and stepped mouse moves. The 470px window and 8-column grid change every box it
  drags between.

`web/e2e/global.d.ts` (18 lines) declares `window.__e2e` and `window.idlescape`. The specs reach the
tasks API through `window.idlescape.tasks` (throughout `tasks.pw`) and the client through
`window.idlescape.client` (`helpers.ts:157`). The global name already matches the lowercase product
ruling; nothing to rename.

## 11. Where the breakage lands, by redesign change

| Change | Unit test files hit | E2E specs hit | Rough test count |
|---|---|---|---|
| G4 marketplace strip button | `marketplace.test.ts`, `tasks.test.ts` | `tasks.pw` | ~4 |
| G5 characters merge | `characters.test.ts` (whole file, 15 tests, moves), `account.test.ts` | `characters.pw`, `tabs.pw`, `measure.pw`, `bank.pw`, `helpers.ts` | ~15 moved, ~10 edited |
| G6 rename to Automation | `tasks.test.ts` | `tasks.pw` | ~2 |
| G7 icons | `account.test.ts`, `connect.test.ts`, `marketplace.test.ts`, `panels.test.ts`, `pluginsPanel.test.ts`, `registry.test.ts`, `types.test.ts`, `strip.test.ts`, `runBanner.test.ts` | none | 24 typed, 6 fixture sites |
| Banner to co-pilot bar | `runBanner.test.ts` (whole file, 11 tests) | `tasks.pw` (3 steps) | ~14 |
| 280px panel | none directly | `bank-ui.pw` (clamp reasoning at 247-263) | ~1, geometric |
| `.p-*` retirement | `connect.test.ts`, `characters.test.ts`, `screenshot.test.ts` | none | 5 |
| CSS split (G9) | `styles/bank.test.ts`, `partials.test.ts`, `runBanner.test.ts` | none | ~12 |
| Trace pop-out | `tasks.test.ts` (3 tests) | none | ~3 |
| G3 online timer | `characterTabs.test.ts` (5 assertions plus the tooltip) | `tabs.pw` (1) | ~6 |
| Bank window redraw | `bank/view.test.ts` (357 lines, at the ceiling), `view.a11y.test.ts`, `grid.test.ts`, `tabsBar.test.ts`, `styles/bank.test.ts` | `bank-ui.pw` (380 lines, at the ceiling), `bank.pw` | large; both ceiling files need splitting first |

**Nothing at all tests today:** the Events panel (does not exist), the co-pilot bar's five states,
the `cs.panel` `characters -> account` fallback, the strip's 40px width, the styleguide page
(`web/styleguide.html` has no test of its own), or the five `.card.html` fixtures. Those are new
files, not migrations. Keep them out of the "tests to move" count and budget them separately.
