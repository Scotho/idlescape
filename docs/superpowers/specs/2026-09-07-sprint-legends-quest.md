# Idlescape — Sprint: Legends' Quest

Date: 2026-09-07
Status: drafted by the ideas session on the owner's instruction; **opens when Dragon Slayer
closes** (its merge to `develop`). Branch `sprint/legends-quest` when it opens.
Owns: **the sequence after Dragon Slayer.** Nothing here starts while
`2026-09-07-sprint-dragon-slayer.md` has an open row; that document owns the order until then.
Source: the owner's selection, on 2026-09-07, from `docs/ideas/2026-09-07-feature-candidates.md`.
Candidates not selected are archived in that file, not dropped.

Named for the quest that followed Dragon Slayer in prestige: the one you do once the capstone is
behind you and the world is yours to make comfortable.

## 1. What this sprint is

Dragon Slayer finishes the platform: the shell redesign, the script standard, studio and v2
surface, the bank, the camera row, the two content entries, contracts, hiscores, the gateway and
the headless runner. This sprint is what you build on a finished platform: play quality of life,
the corpus surfacing inside the game, the automation panel growing into a real tool, and the first
two features where Claude reads a run rather than drives one.

Every row here was a session suggestion the owner adopted, so **every row needs a spec before it
is dispatched**, per Dragon Slayer section 5 (a row without an authority is a wish). The State
column says "needs a spec" for all of them; a spec is written through section 5 below when the
row comes up, not in advance, because the platform it lands on is still moving.

## 2. The sequence

| # | Entry | Candidates | Depends on (Dragon Slayer numbers) | State |
|---|---|---|---|---|
| 1 | Loadouts | 1 | SP8b bank (shipped); the `Loadout` door in entries 7 and 11 | needs a spec |
| 2 | Keyboard, login and console | 4, 5, 6 | entry 3 (patch gate), entry 9 (key routing) | needs a spec for the login and console halves; the client-patch half is **delivered by Dragon Slayer entry 9 (D42)** |
| 3 | Notifications and event screenshots | 3, 8 | run status and screenshot plugin (shipped) | needs a spec |
| 4 | Route service | 11 | the collision pack (shipped) | needs a spec |
| 5 | Quest helper | 24 | entry 1's tutorial routes; this sprint's entry 4 | needs a spec; **high priority once the tutorial run has landed** |
| 6 | Library expansion: combat and every skill, with settings (D61) | 9 | entry 7 (API v2); this sprint's entries 1 and 4 | spec written and approved: `2026-09-07-library-catalog-and-task-list-design.md` |
| 7 | Task list and script stats (D61) | 10, 13 | tasks API and run history (shipped) | spec written and approved: `2026-09-07-library-catalog-and-task-list-design.md` |
| 8 | Windows and the session canvas (D90) | owner brief, relayed 2026-09-07 | entry 4 (Window family, z-scale, menu markup); entry 6 (studio) optional | spec written and approved: `2026-09-07-windows-and-session-canvas-design.md` |
| 9 | Trace tools and the death log | 7, 18 | trace window (shipped) | needs a spec |
| 10 | Wiki window and corpus surfaces (D90, D91) | 2, 19, 12, and the owner brief | wiki corpus and loot tracker (shipped); this sprint's entry 8; entry 3's client-fork gate | spec written and approved: `2026-09-07-wiki-window-and-vocabulary-design.md` |
| 11 | Sound | 15 | entry 4's `config` panel; the character strip; this sprint's entry 8 (the tab menu) | needs a spec |
| 12 | Shell panels | 17, 14, 21, 38 | entry 4 (event feed, co-pilot bar, panel column) | needs a spec |
| 13 | Claude reads traces | 25, 26 | entry 16 (SP4c), entry 6 (studio) | needs a spec |

**Renumbered 2026-09-07 (D90).** Two rows were added on a brief the owner relayed through a peer
session: row 8, windows, is new; row 10 is the old row 9, "Corpus surfaces", widened by the wiki
brief and given a spec. Old rows 8 to 12 are now 9 to 13. Section 7 maps every old number to its
new one. Decision ids cite numbers as of their own date (D58's rule), so D42's "sprint 3 entry
10's surface" is today's row 11.

### 1. Loadouts

A named snapshot of inventory and worn gear, saved from the web bank and restocked with one
button. The type behind it is the one the recorder idea, the API v2 bank top-up and the battlebots
kits all want, and Dragon Slayer entries 7 and 11 carry a door for it. If either of them has
already defined `Loadout` when this sprint opens, this entry is the bank surface over it; if
neither has, this entry defines it and the others adopt it. Either way there is one shape.

First because it is the smallest entry with the most consumers: entries 5 and 6 here restock from
it, and the recorder will emit it.

### 2. Keyboard, login and console

Three things a keyboard player wants on day one. **The first is no longer this entry's to build:
function keys switching sidebar tabs and Escape closing the open interface are delivered by Dragon
Slayer entry 9 (D42)**, folded into that row's key-routing patch so the two arrive as one numbered
client patch rather than two. What remains here is the other two halves, and they are what this
entry's spec is written for: a reload lands back in the world on the last character, with a setting
to turn it off, over the existing armed login; and a command line in the shell that runs a script by
name, stops, opens a panel, sets a setting.

**The precedence rule this entry was going to settle is settled there too, which is what folding it
bought.** The camera row adds WASD camera mode with an Enter-to-type rule, and function keys and
Escape have to compose with that mode. Section 6.6 of
`2026-09-07-camera-frame-and-renderer-design.md` writes the composition out as a table: F1 to F7 are
live in both modes, Escape's client-local arms run typing mode first and the interface close second
with at most one firing per press, and the shell's Escape panic key still pauses a moving run
alongside whichever arm won. This entry's remaining halves inherit that ordering rather than
restating it, and its spec is still written against entry 9's shipped key routing, not its plan.

### 3. Notifications and event screenshots

Browser notifications when a run ends, gets stuck, dies, or the character is attacked while idle,
so a background tab is useful. And the screenshot plugin firing on its own for level-ups, rare
drops and deaths, into the run report. Both are small and both are pure shell.

### 4. Route service

One pathfinder over the collision pack, served by the front server, used by scripts, the recorder,
the world map and `c.travel`. It replaces per-script walking logic and is what makes a long route
reliable rather than a sequence of hops. Fourth because three later entries walk: the quest helper,
the library expansion and the death log's walk-back.

**What it does not do:** it does not move the runtime. Scripts still run in the Worker; the
service answers "how do I get from here to there" and the Worker walks. One runner, two callers.

### 5. Quest helper

**High priority once the tutorial run has landed.** Per-quest generated step routes in the shape of
the tutorial island generator (`scripts/gen/tutorial-steps.ts` and the routes it emits), a panel
that shows the next step, and a script that can do it. Large per quest, but the pattern is proven
by the tutorial and the corpus already has every quest's text.

First release: the free-to-play quests a new character does in order, chosen at spec time. The
spec decides how a quest's steps are authored (generated from the corpus, hand-written data, or
recorded), and it should read the recorder idea first, because a recorded quest is the cheapest
authoring path once the recorder exists.

### 6. Library expansion

**Widened on the owner's instruction, 2026-09-07 (D61):** a library covering combat and every
skill, not five scripts. In the owner's words: "include a wide range of other plugins such as combat
and one for all skills. Include settings in these scripts to change what/where/how long/etc. Look
to other popular osrs bots for guidance on systems and fill in what is possible or feasible within
our system." The spec for this entry (`2026-09-07-library-catalog-and-task-list-design.md`, written
beside Dragon Slayer) surveys the script catalogues and settings of the bots already surveyed for
the API standard, and specifies a settings model every library script shares: what (target, item,
method), where (area, landmark, bank), how long (until level, until count, for a duration, forever),
and the restock and route behaviour. Scripts written against the v2 surface and the standard. Each one restocks from a loadout and walks through the
route service. Each is also a test of the API: a script the standard cannot express cleanly is a
finding against the standard, recorded in this entry's ledger.

### 7. Task list and script stats

**Widened on the owner's instruction, 2026-09-07 (D61):** a "task list" feature, in the owner's
words "a set of tasks and have the bot proceed through them autonomously": a player builds an
ordered list of library scripts each with its own settings and stop condition, saves it per account,
and runs it as one autonomous run with pause, resume, skip and the run report per step. Chain
examples: woodcut until level 30, then fish until 200 shrimp, then bank. `until` predicates already
exist; the list is a list over them in the Automation panel, specified in the same spec as entry 6. And a
stats page: XP per hour per script over time and per character, from the history store, answering
"which script is actually best".

### 8. Windows and the session canvas

The shell gains a window manager, and the bank is the first surface held to a release standard
under it. Every floating surface (bank, trace, studio, wiki, the arena's match window) becomes a
`WindowSpec` with drag, eight-handle resize, Windows 11 snap, minimise to its origin, focus-raise by
DOM order (D48 generalised), keyboard move and resize, a window menu, and a remembered rect under
one new `cs.windows` key. A character tab drags off the strip into a floating **session window**
whose body is the live client iframe, aspect-locked to the client's 789 by 532 canvas; the iframe
is never reparented, because reparenting reloads it. Every other window resizes freely. Motion is
named against the Windows 11 and macOS rules it takes from, is `transform` and `opacity` only, and
is off under reduced motion. The entry also ships `frame/contextMenu.ts`, the menu behaviour the
shell v2 plan deferred to this sprint (D88), with the character-tab menu (Float, Dock, Minimise)
that entry 11 adds Mute to. Eighth because rows 9 to 11 each compose something it builds and
nothing above it does.

### 9. Trace tools and the death log

Search, filter and bookmarks in the trace window: find events by type or text, pin a moment, jump
between pins. And a death log: what was lost, where and when, with a one-click script that walks
back to the tile over the route service.

### 10. Wiki window and corpus surfaces

The wiki corpus inside the game, widened on the owner's relayed brief (D90). A **wiki window**
managed by entry 8, opened from the title bar, an examine line, an item tooltip, a bank slot's
menu or a script's page, rendering the reader's own prerendered fragment so markdown is rendered
once; the standalone `/wiki` reader restyled onto the shell's tokens through a copied theme file
with an equality test. **Two modes**, player and agent: player mode follows the 2007 wiki's page
shape (infobox, lead, the sections a player reads); agent mode is the entity as data, every
coordinate, every interaction with its option index, the dialogue graph, requirements in the
runtime's vocabulary, and the queries the page was built from, copyable for Claude. **The corpus
filled for agents**: dialogue graphs walked from every `opnpc` block, item-on interaction tables,
loc placements sampled per area, NPC max hit and aggression, the 89 shops without coordinates
resolved through their owner, quest transcripts. **Live actions** in player mode when the window
is inside the shell: requirement chips against the live character (quest state through one
numbered hooks patch exposing read-only quest varps, behind Dragon Slayer entry 3's gate), and
Train, Fight, Walk here, Do this quest and Add to tasks buttons over the tasks API. The three
candidates the row already carried stay: the item tooltip, examine to wiki, and a per-account
collection log written by the loot tracker.

**Its section 9 is the vocabulary ruling (D91) rows 6 and 7 build to**: Script, Library, Task,
Task list, Run, Step and Plugin each mean one thing; the Automation panel's tabs are Scripts,
Library, Tasks and Runs; "Marketplace", "My scripts", "My tasks", "Lists" and "History" are
retired as labels with every id, key and selector unchanged; and every script manifest declares a
closed `category` plus the skills, quests, npcs and items it touches, which the Library groups by
and the wiki joins on.

### 11. Sound

Volume per channel, mute, and now-playing, in the `config` panel's Display section beside the
camera row's settings. Two surfaces the owner named: **mute on the login screen**, where the title
music plays before any character is chosen, and **a right-click menu on a character tab** in the
strip across the top of the game view (`web/src/frame/characterTabs.ts`) with mute on it. The
strip has no context menu today and the design system has no menu family, so the spec adds one
to the library and the styleguide in the same change, never as a one-off. The setting persists
under a `cs.` key and applies before the client starts, so the login screen honours it.

### 12. Shell panels

Four panel-column features on the shell v2 dialect. A chat panel with timestamps, filters by
kind, history search and copy, beside the client's own chatbox. A session timeline: a day view per
character of runs, level-ups, deaths and drops, over the cross-character event feed. Time to the
next level at the current script's rate on the co-pilot bar. And a responsive panel column so the
shell fits a phone, since the client already has a mobile keyboard.

**The strip stays at eleven icons.** Every surface here is a section of an existing panel or the
bar; none is a new panel.

### 13. Claude reads traces

The first two features where Claude reads a run rather than drives a character, and the reason
they are last: both go through the gateway Dragon Slayer's entry 16 builds. "Why did this run
fail" sends a run's trace through the gateway and returns a post-mortem with a suggested fix.
"Write me a script that fishes lobsters at Karamja and banks at Draynor" lands as a draft in the
studio, validated by its linter before the player sees it.

**D24 applies as a precondition.** A script Claude writes is the account's own code once saved,
and the relay carries the trust model D24 states.

## 3. Constraints that do not move

Inherited from Dragon Slayer and `CLAUDE.md`, restated because several rows here are tempted by
each: files under 400 lines; the shell v2 icon strip at exactly eleven glyphs; `localStorage`
keys under the `cs.` prefix with their exact names; no gameplay patches (no XP multipliers, no
infinite run); no new art; one script runtime, two callers; D24's trust model on anything that
relays another account's code; and the design system decides the UI, so a surface that needs a new
component adds it to the library and the styleguide in the same change.

## 4. Doors Dragon Slayer should leave open for this sprint

Carried to the Dragon Slayer board's ideas section on 2026-09-07:

- Entries 7 and 11: the `Loadout` type, one shape, already a door.
- Entry 9: key routing that a later patch can extend with function keys and Escape, and a written
  precedence for typing mode.
- Entry 4: the `config` panel reserves a Sound section beside Display; the event feed's event
  shape carries what a day view needs (kind, character, time, a one-line label); the co-pilot bar
  has a slot for a rate-derived line.
- Entry 16: the gateway's relay is shaped so a trace can be sent as one payload.

## 5. Conventions and adding an entry

Dragon Slayer sections 5 and 6 apply unchanged: brainstorm to a spec, commit it, insert the row
where it should be built and say why, renumber, and a plan-approved or audit-adopted authority
where that shape fits. Ledgers are promoted, never deleted. Work lands on `sprint/legends-quest`
and merges to `develop` when the sprint closes.

## 6. What was archived

The candidates the owner did not select are kept in
`docs/ideas/2026-09-07-feature-candidates.md` under "Archived", with their scores and their
dependency, so a later session can revive one by adopting it as an idea. Nothing was dropped.

## 7. Changes since the draft

| # | Change | Decision |
|---|---|---|
| 1 | Rows 6 and 7 gained their authority, `2026-09-07-library-catalog-and-task-list-design.md`. | D61 (sprint 3 scope), D66 to D86 |
| 2 | Section 2 gained **row 8, Windows and the session canvas**, on the owner's relayed brief, with `2026-09-07-windows-and-session-canvas-design.md` as its authority. | D90 |
| 3 | Old row 9, Corpus surfaces, became **row 10, Wiki window and corpus surfaces**, widened by the same brief, with `2026-09-07-wiki-window-and-vocabulary-design.md` as its authority. | D90 |
| 4 | Rows 8 to 12 were renumbered 9 to 13: trace tools 8 to 9, corpus surfaces 9 to 10, Sound 10 to 11, shell panels 11 to 12, Claude reads traces 12 to 13. Sound's dependency column now names row 8's tab menu. | D90 |
| 5 | The vocabulary for scripts, the Library, tasks and runs is ruled in the wiki spec's section 9 and applies to rows 6 and 7 before they are built; the catalogue spec carries an amendment note. | D91 |
