# Idlescape — Shell v2: gaps, migrations, and the living component library

Date: 2026-09-06
Status: companion to the vendored handoff, written 2026-09-06; recorded for review
Design authority: `docs/design/idlescape-shell-v2/README.md` and
`docs/design/idlescape-shell-v2/Idlescape Shell v2.dc.html`. This document does not restate them
and does not overrule them. Where a value is in question, the mock is the answer.
Sprint: Dragon Slayer, entry 2 (`2026-09-07-sprint-dragon-slayer.md`)

## 1. Why this exists

The handoff is high fidelity about what the shell should look like and near-silent about three
things a session implementing it will hit within the hour: subsystems the design assumes exist
and do not, contracts it assumes hold and which nobody has checked, and a panel-id migration it
correctly flags and then leaves to the reader. This document closes those, and adds the step the
handoff has no way to specify: how the component library stays alive after the redesign lands.

Everything in section 2 was read out of the code on `feat/platform-shell` on 2026-09-06.

## 2. The shell as it actually is

| Fact | Where |
|---|---|
| Twelve plugins render a strip panel today: `bank`, `characters`, `loot`, `marketplace`, `notes`, `screenshot`, `tasks`, `xp` (builtins), plus `account`, `config`, `connect`, `plugins` (registered in `main.ts`). | `web/src/plugins/builtin/*.ts`, `web/src/main.ts:240` and its 12 sibling `shell.register` calls |
| `status-hud` is overlay-only: it has an `overlay()` and no `panel()`, so it has never had a strip button. | `web/src/plugins/builtin/statusHud.ts:38-60` |
| Icons are emoji string literals on the manifest (`icon: '🏦'`, `'👥'`, `'▶'`, `'✦'`, `'🧩'`). The strip renders them directly. | the manifests above, `web/src/ui/strip.ts` |
| Run state literals already in the task runtime: `idle`, `starting`, `running`, `paused`, `stuck`, `stopped`, `failed`, `done`, plus `died`, `disconnected`, `unreachable` from the health ladder. | `web/src/tasks/*.ts` |
| A trace module and a trace view already exist, as do run history and a health monitor. | `web/src/tasks/trace.ts`, `history.ts`, `healthMonitor.ts`, `web/src/plugins/builtin/traceView.ts` |
| `localStorage` keys in use: `cs.panel`, `cs.filter`, `cs.size`, `cs.bank.as`, `cs.bank.mode`, `cs.bank.qty`, `cs.plugin.<id>`. | grep `'cs.` across `web/src` |
| The stylesheet layer is 1,099 lines across 14 files, largest `bank.css` at 268. `tokens.css` is 85. | `web/src/styles/` |
| A styleguide page already exists and is built as its own Vite entry point. | `web/styleguide.html`, `web/src/styleguide.ts` |
| The suite the migration must not break: 1,092 unit tests across 106 files in `web/`, plus 21 Playwright specs. | `2026-09-07-sp4b-handoff.md` section 1 |

## 3. The icon set is a migration plan in disguise

The handoff ships exactly **eleven** glyphs: `automation`, `claude`, `xp`, `loot`, `events`,
`notes`, `screenshot`, `bank`, `account`, `plugins`, `config`
(`components/core/Icon.d.ts:3`).

Today's strip has twelve buttons. Apply the handoff's three structural changes and it has eleven:

```
tasks       -> automation      (rename)
connect     -> claude          (rename)
characters  -> merged into account   (-1)
marketplace -> tab inside Automation (-1)
events                                (+1, new)
xp, loot, notes, screenshot, bank, plugins, config   unchanged
```

Eleven buttons, eleven glyphs, and every name matches. The icon set was drawn for the
post-migration strip, which means **the merges are not optional polish that can be deferred to a
later entry** - defer them and the icon set does not fit the strip. They land together or not at
all. Nothing in the handoff says this; it falls out of counting.

## 4. Gaps

### G1. The Events panel has no data behind it

The handoff specifies the Events panel completely as a surface - segmented character filter, six
type chips, skill select, tone-railed rows, footer count, Copy for Claude, empty state - and there
is no event feed anywhere in the app to render. It is not a panel that needs building; it is a
subsystem that needs designing, with a panel on top.

Two properties make it harder than it looks. It is **cross-character**, so it cannot live inside a
character's iframe session the way every other per-character surface does; it has to sit in the
frame, above SP7's session manager, and be fed by every session. And its six types
(XP / Loot / Levels / Runs / Claude / Bank) are sourced from five different places that do not
currently emit anything: the XP tracker, the loot tracker, the game client's level-ups, the task
runner, the agent transport, and the owner bank's change stream.

**Resolution.** Events is its own work item inside this entry, sequenced *before* the panel that
consumes it: a frame-level append-only ring buffer, per account, capped and session-scoped
(the footer already says "this session"), with one `emit(event)` entry point that each of the six
producers calls. It is not persisted; the handoff's footer copy is the requirement, and not
persisting removes every migration and quota question. The panel is then a pure read of it.

### G2. Canvas XP drops need per-drop granularity

The `floatUp` XP drop over the canvas needs a discrete "you just gained N in skill S" signal. The
XP tracker samples state on a timer to compute a rate; a sampled delta and a drop are not the same
event, and a sampled one arrives at the wrong time and with the wrong grouping.

**Resolution.** The drop feeds off the same emitter as G1's XP events, which derives its deltas
from the client state diff on each tick rather than from the tracker's sampling window. One
producer, two consumers - the canvas overlay and the Events panel - so a drop and its row can
never disagree.

### G3. The online timer has no clock to read

The active character tab shows a live `1:29:07`. There is no per-character session-start timestamp
anywhere; the tab currently shows the word "online".

**Resolution.** Stamp session start in SP7's session manager when a character's runtime attaches,
and clear it on detach. Frame-local, not persisted: a reload restarting the timer is correct
behaviour, since the session did restart.

### G4. Marketplace loses its strip button but keeps its plugin

`marketplace` is a registered plugin with `defaultEnabled: true` and its own `PanelView`. The
design keeps its content and moves it inside Automation as a segmented tab. That is not a delete.

**Resolution.** Keep the plugin, its id and its view; drop `panel` from the manifest so
`rebuildStrip()` stops giving it a button, and have the Automation panel mount the same view in its
Marketplace tab. The strip contract - generated from the manifest - stays untouched, which is what
the handoff's "unchanged contract" line requires.

### G5. Characters into Account is a real deletion

`characters` is a plugin with a panel, an id, and Playwright specs addressing
`[data-panel="characters"]`. Merging it into `account` removes a panel id that tests name.

**Resolution.** Fold the character-card list, the inline create and the tab-open action into the
account panel as a section; delete the `characters` plugin; update the specs that address it in the
same commit. `cs.panel` may hold the string `characters` in a live browser, so the panel resolver
needs a fallback mapping `characters -> account` rather than opening nothing. That fallback is
permanent, not a migration step: the key is never rewritten, so an old value can arrive at any time.

### G6. Tasks to Automation is a rename with two halves

**Resolution.** Change the display name to `Automation`. **Keep the plugin id `tasks`.** The id
appears in `cs.panel` values, `[data-panel="tasks"]` selectors across both suites, and
`cs.plugin.tasks` settings. Renaming the id buys a tidier string and costs a silent settings reset
for every existing player, which the handoff itself warns against for `localStorage` keys. The
handoff asks for a renamed *panel*, and the panel's name is what users see.

### G7. Emoji icons become a glyph key

The manifest's `icon` is a free string rendered directly. The design replaces it with one of
eleven drawn 16x16 SVGs.

**Resolution.** Narrow `PluginManifest['icon']` to the glyph union in `Icon.d.ts` and render
through an `icon(name)` helper in `web/src/ui/`. Narrowing the type is what turns "we changed the
icons" into a compile error listing every site that still needs one, which is the cheapest possible
migration. A plugin naming an unknown glyph falls back to the `plugins` glyph rather than rendering
nothing.

### G8. Three contracts to verify before building on them

Not gaps so much as assumptions with no evidence attached. Each is a ten-minute check that fails
loudly at the wrong time if skipped.

1. **The co-pilot bar's five states** (unpaired / standby / running / paused / stuck) against the
   eleven state literals the runtime actually uses. `stuck` exists by name; `unpaired` and
   `standby` are pairing states, not run states, so the bar reads two sources, not one. Confirm
   which, and confirm that `starting`, `stopped`, `failed`, `done`, `died`, `disconnected` and
   `unreachable` each map onto one of the five presented states with nothing falling through.
2. **The trace window** against `web/src/tasks/trace.ts` and the existing `traceView` plugin: the
   design's row shape (mono 10.5px, 2px kind rails, filter input, copy) needs a `kind` per line,
   and the window is a pop-out over the stage rather than a panel, so `traceView`'s current
   mounting is not reusable as-is.
3. **Bank item icons** against what SP8b's client patch 28 exposes. The handoff says icons come
   from the client's `IconCache` in production and that the mock's wiki hot-links are placeholders.
   Confirm the cache is reachable from the frame, not only from inside the client iframe; if it is
   not, that is a client patch, and it is on the critical path for the bank window.

### G9. The CSS will not fit the files it has

1,099 lines today, against a design that adds a co-pilot bar, an events panel, a trace window, a
gradient card system, eight keyframes and a token layer several times the current 85 lines. The
project's 400-line ceiling applies per file.

**Resolution.** Split by component family, not by panel, mirroring the library: `tokens.css`,
`base.css`, then one file per family (`button`, `badge`, `card`, `meter`, `form`, `overlay`,
`strip`, `tab`, `alert`, `icon`), then per-surface files for genuine layout only. This is also the
mechanical enforcement of "no per-panel one-off styles": there is nowhere to put one.

The `.p-*` alias family is retired in the same pass, as the handoff instructs.

## 5. The living component library

The handoff hands over a system. Nothing in it keeps the system alive, and a design system that is
not mechanically defended is a design system that describes the code for about six weeks. This is
the step that outlasts the redesign, and it is why this entry is sequenced first: every panel built
before it exists is a panel to redo.

Four parts, in order:

1. **Vendored and reachable.** Done. The bundle is at `docs/design/idlescape-shell-v2/` (it existed
   only in a Downloads folder before), and `.claude/skills/idlescape-design/` makes it a skill, so a
   future session designing a surface loads the brand guide rather than inventing one. The skill
   carries the rules the handoff scatters: no React, compose the library, `cs.` prefix, one focus
   ring, lowercase `idlescape`.
2. **Every family on the styleguide.** `web/styleguide.html` already exists and is already its own
   Vite entry. Each class family gets a section rendering every variant and state. The rule that
   makes it living rather than decorative: **a component that is not on the styleguide does not
   exist**, and adding a family without its styleguide entry is an incomplete change.
3. **The five `.card.html` files become regression fixtures.** `components/<group>/<group>.card.html`
   shipped as visual references for core, data, forms, navigation and overlay. Wire them as
   Playwright screenshot baselines against the styleguide's corresponding sections, so a token
   change that alters a button's height fails a test instead of drifting.
4. **A rule with teeth.** A lint or test-time check that `web/src/styles/` contains no per-panel
   selector outside its layout file - the enforcement half of "every new panel composes these
   classes; no per-panel one-off styles". Without it, part 2 is a convention, and conventions lose.

Maintenance after that is a sentence in the skill and a section in the styleguide, not a process.

## 6. Order of work

1. Tokens and base, `.p-*` retired, CSS split per G9.
2. The component class families, each landing with its styleguide section (library part 2).
3. The icon set and the manifest narrowing (G7).
4. The three structural migrations together, since section 3 shows they cannot be separated:
   Tasks to Automation (G6), Characters into Account (G5), Marketplace into a tab (G4).
5. The event emitter and its ring buffer (G1, G2), then the Events panel and the canvas XP drop.
6. The remaining surfaces: co-pilot bar, run card patch, trace window, bank window, canvas
   overlays, account panel, empty states.
7. Regression fixtures and the styles rule (library parts 3 and 4).

G8's three checks happen before the step that depends on each, not as a phase.

## 7. Rulings, for the record

1. The product is **idlescape**, lowercase in UI strings, titles and wordmarks. The handoff arrived
   calling it "fable"; every occurrence was renamed on vendoring, and the placeholder host
   `fable.scotho.com` became `osrs.scotho.com`. See `docs/design/idlescape-shell-v2/PROVENANCE.md`.
2. The plugin **id** `tasks` survives the rename to Automation; only the display name changes.
3. `characters` as a panel id is deleted, with a permanent `characters -> account` fallback in the
   `cs.panel` resolver.
4. `marketplace` survives as a plugin and a view, and loses only its strip button.
5. Events are **session-scoped and not persisted**, per the panel's own footer copy.
6. The mock is the source of truth for every literal. Where this document and the mock disagree
   about a number, the mock wins and this document is wrong.

## 8. What actually shipped

Written at the close-out on 2026-09-09, from the built thing. Sprint entry 4 ran this document's
gaps as `docs/superpowers/plans/2026-09-07-shell-v2.md`, twenty-one tasks in two blocks
(`e69b0708..18d7e17`), and the plan was the authority wherever it and this document disagreed. Every
gap G1 to G9 shipped. The rulings below are where the built thing differs from what this document
says, so that a reader of section 4 does not have to discover them from the code; the full record,
with the cost of each, is `docs/superpowers/ledgers/2026-09-07-shell-v2.md`.

**Where this document is now wrong, and the sentence to distrust.**

1. **Section 7's ruling 6 held, and it cost this document three numbers.** The mock won every
   disagreement. Control heights are 27, 22, 25 and 29px, not the 28 and 36 the styleguide's own
   lede had claimed for a year; the bank slot ships at a stated 36px because the mock's
   `aspect-ratio: 4/3` cannot survive an `auto` grid row in a scrolling pane; and the trace window's
   header is one row, not the two section 4 implies.
2. **The bank footer is smaller than section 4 describes.** The withdraw form, the 10 and X
   quantities, the magnifier and the two disabled deposit buttons are gone, because map-design 3.6
   draws four things on that row. Nothing load-bearing went with them: the web bank is layout-only.
   Owner decision 1, "the web bank never deposits", moved into the panel's info alert rather than
   being dropped. `cs.bank.as` is deleted **unread**, never renamed, so no stored state was lost.
3. **The bank window's title lost its leading article**: `Bank of Gielinor`, not
   `The Bank of Gielinor`. This crosses into sprint entry 8 and is recorded as **D131**.
4. **`PanelId` is twelve ids, not the ten this document counts.** `events`, `notes` and `screenshot`
   were added; `characters` was deleted with the permanent alias section 7's ruling 3 promised.
5. **The co-pilot bar has no separate session subscription.** Its one-second tick is that
   subscription: there was nothing to subscribe to, and the alternative was a second owner of one
   repaint. The bar's detail row belongs to a run, so an idle bar draws no coordinates.
6. **The pinned XP card runs its own 5 s interval**, not the XP panel's. The card is on screen only
   while that panel is closed, so following "one timer, not two" literally would have frozen it.
7. **The status HUD's pre-login reading keeps its em dash** in one named constant, and the mock's
   own em-dash strings live in `web/src/ui/copy.ts` and nowhere else.
8. **Section 3's icon migration finished except where a glyph is decorative.** The manifest's `icon`
   is narrowed to the drawn set, so a plugin that invents a name fails `npm run typecheck`.

**What this document did not carry, and who has it.** Audit rows C19, C20 and C21 were folded into
this entry and are **left open** with what did close named in the ledger's close-out. The canvas
still overflows an 800px viewport in `auto` size mode. The pinned card is mounted inside a
`#side-panel` that hides when no panel is open. `RunStatus.attached` is still hardcoded and there is
still no Claude message channel, both of which this document already put outside its own scope.
