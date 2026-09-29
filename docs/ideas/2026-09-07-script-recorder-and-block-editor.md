# Idea: script recorder and block editor, for non-programmers

Recorded: 2026-09-07, from the owner
Status: brainstorming (round two rulings below, 2026-09-07)
Touches: sprint entries 5 (script API reference and standard), 6 (Script Studio), 7 (script API
v2 surface), the client hooks (`client/src/hooks`), the user script store

## The idea, in the owner's words

Scripting features for non-programmers, allowing simple scripts, adding more functionality over
time.

**Feature 1, "record".** A feature that allows users to record actions that are converted into
scripts. Two modes, "exact" and "smart". Player action will be similar to exact, showing both
situations.

- Exact: Start tile X, click bank tile Y, withdraw 14 Z, close bank, click inventory, select item
  [1,1], use on item [1,2], craft XYZ, wait X, and so on. Basically just a tinky task. Requirements
  much stricter.
- Smart: find the fastest way to the bank, go to the bank, open the bank, withdraw 14 of item Z
  from anywhere it is in the bank, close the bank, craft XYZ, wait until finished, and so on.

Smart should be the default recording session. It uses all of the features of the broader general
bot system like its pathing and event systems, and may warrant extending it where necessary.

A recording session produces a script that shows up alongside the existing ones like woodcutting
and fishing.

**Feature 2, a block editor.** A simple, scratch.io-like script editor and designer that somebody
can open a recorded script in and modify manually with blocks and simple language. Powerful but
easy to understand. Save, re-test, and so on.

Smart will allow settings like run X times or until Y items are created. Exact is just 1:1.

Not all features have to be represented in the editor, just those that can represent the recorder.
These can be distinct from full code scripts until or if parity is ever achieved. That does mean
that all recorded scripts, or scripts made by the editor, can be converted to JS/TS and expanded.

## First consideration

**What exists to build on.** The script API after SP4b has the verbs smart mode needs: `c.find`
(scene, atlas, sweep), `c.travel` (with routes and typed failures), `c.wait` (until, ticks, xp,
item), the health ladder, params with `until` conditions, and a library format that registers a
script beside woodcutting and fishing. The API standard (entry 5) fixes the vocabulary the
recorder would emit into, and the API v2 surface (entry 7) adds the pieces smart mode would lean on
hardest: a dialogue namespace, bank helpers such as a top-up primitive, `c.retry`, events, and
per-script persisted state. The Script Studio (entry 6) brings the compile worker, the validator,
the save and revision model and a window over the stage that a block editor would sit inside.
Recorded scripts are user scripts in the same store, so "shows up alongside the existing ones"
is the existing Automation panel with no new surface.

**The one new seam: capturing the player's actions.** Nothing today observes what the player
clicks. The client's hooks publish state and accept dispatched actions; they do not report the
player's own menu selections. Exact mode needs an input tap that sees each menu action as the
client resolves it (target, option, tile, interface component), which is a numbered client patch
under `client/src/hooks`, additive and small, in the same family as the state collector. Smart
mode needs the same tap plus an intent layer in the shell that turns a click on a bank booth into
"go to bank, open bank", a withdraw into "withdraw N of item", and a use-item-on-item into
"craft". That layer is the interesting part and is where the recorder either works or produces
brittle scripts; it should be specified as a table of recognisable intents with the API call each
one emits, and anything unrecognised falls back to an exact step with a comment.

**Exact mode is a literal transcript.** Each step becomes a task with a strict precondition (the
tile, the interface, the slot) and the script's requirements section is generated from what was
observed (start tile, items present, levels). It will break the moment the world differs, which is
the owner's stated expectation and the reason smart is the default. It is also the cheapest
possible first release, and it gives the intent layer a corpus to learn from: every exact recording
is a labelled example of what smart should have produced.

**Smart mode's loop settings** ("run X times", "until Y items") map directly onto the library
format's `until` predicate and params. The recorder emits a manifest with those as params so the
run card offers them without editing.

**The block editor.** A block language whose vocabulary is exactly the recorder's intent table,
stored as a small JSON program beside the generated code in the user script document (the studio
spec already persists a compiled manifest on that document, so a second structured field is in
character). Blocks compile to JavaScript through the same compiler path the studio uses, so a
block script is a real script with no second runtime, and "convert to JS/TS" is one button that
drops the block program and keeps the code. One-way: once ejected, the code is the source. Parity
with full code is explicitly not a goal; the editor represents what the recorder can produce, and
grows as the intent table grows. Rendering blocks needs no library: the shell v2 component families
(cards, segmented controls, selects, badges) compose into a vertical block list with drag ordering,
and the studio window is the host.

**Dependencies, in order.** Entry 5 (the vocabulary), entry 7 (the verbs smart mode emits), a
client patch for the input tap (can be written any time, small), entry 6 (the studio window and
compiler path). So: after entry 7, as one or two entries of its own, with exact mode and the input
tap first and the block editor second.

**Rough size.** Input tap: small (one client patch, one hooks test). Exact recorder: medium. Smart
intent layer: medium to large, and the piece that needs a real spec. Block editor: medium once the
intent table exists. Two entries, or three if the block editor is split out.

**Questions a brainstorm would settle.**
1. Where the input tap lives: a client patch reporting resolved menu actions, or a shell-level
   interception of the dispatch path. The client patch sees the real action; the shell sees only
   what the shell sent.
2. What "wait X" records: ticks, a state condition, or both, and how smart mode chooses the
   condition (item count changed, animation ended, interface closed).
3. The intent table's first release: banking, crafting, skilling on a nearby object, walking to a
   landmark. Combat and dialogue later.
4. How a recording handles a mistake mid-session: an undo of the last step, or edit afterwards in
   the block editor only.
5. Whether block programs can be shared. The API survey ruled no cross-account script sharing
   (decision D24); a block program is still a script and inherits that.

**Doors to leave open now.** The studio's user script document should tolerate an extra structured
field without a schema change (a nullable `blocks` field is enough). The API v2 surface's intent-
shaped verbs (dialogue, bank top-up, retry) should keep names a recorder can emit verbatim. The
client hooks' next patch should not preclude an input tap, which mostly means keeping the menu
resolution path in one place.

## Round two: rulings from the owner (2026-09-07)

Discussed with the owner in a session on 2026-09-07. Confirmed:

1. **Combat is in the first intent table**, not later. Recording a fight reduces to one intent,
   "fight NPC X here until Y", plus the thresholds below.
2. **The combat settings are manifest fields, not recorder-only settings.** Eat at X HP, prayer
   potion at Y prayer (prayer potions exist in this content tree, three doses at this revision),
   teleport at X HP or Y food, bank at Y food or Y prayer. They extend `health` and `hardStop` on
   the script manifest, which the studio already renders as a form on every user script card,
   and proposal P12 (threshold-driven consumables in the health policy) is already in the API v2
   row. Code scripts get them for free; the block editor combat section is a form over the same
   fields; the recorder fills them from what it watches the player do.
3. **A recorded combat script is a valid battlebots bot as-is.** The arena is the test bed, and
   the recorder and battlebots share one combat vocabulary.
4. **"Bank at Y" means walk to the bank, restock and come back to the anchor**, then continue.
   Not "stop the run".
5. **The input tap is a client patch at `Client.doAction`** (`client/src/client/Client.ts:10954`),
   the one method every menu selection resolves through, with three callers. That closes question 1
   above. It should land early, with entry 8's batch of client patches, so every manual session
   becomes recorder corpus and the trace's `human_input` event can carry the real click.
6. **The block editor's first release is a linear list of intent cards with one loop wrapper**
   (run N times, or until an item count). Nested control flow waits for a recorded script that
   needs it.

**Improvements the restock loop forces, all of which serve every system.** The owner asked for
these to be thought through as a set rather than found one at a time.

- **A `Loadout` type**: the recorded starting inventory and worn gear. Restock means "make the
  inventory match the loadout again"; battlebots kits are loadouts; the studio's declarative
  requirements can be generated from one. One shape, three consumers.
- **Bank top-up** (proposal P16, `bank.ensure`, currently "later"): promote it into the API v2
  row. Restock is `ensure(loadout)`, and smart mode emits it verbatim.
- **Travel**: teleports and run energy (P13, already "next"); a "nearest bank from here" query
  over the atlas; a return-to-anchor primitive over the existing `c.anchor`; obstacle handling on
  long routes (doors, gates, ladders, level changes) where the atlas routes do not already cover
  it; and interruption handling, so a script walking to the bank that is attacked can fight or
  flee rather than fail the leg.
- **Combat primitives**: target selection (nearest of a type, not already fighting someone),
  under-attack detection as an event (P1 events, P9 `wait.hp`), and loot pickup (P8 ground items).
- **The health policy grows the thresholds above** with a reaction per threshold: eat, drink,
  teleport, bank-and-return.

**Sequencing** is unchanged: after entries 6 and 7, two entries, recorder first. The only new
door is the `Loadout` type, which entry 11's kits and entry 7's `bank.ensure` should both use.
