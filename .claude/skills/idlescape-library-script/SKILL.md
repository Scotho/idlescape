---
name: idlescape-library-script
description: Use when adding a bundled library bot script under web/src/tasks/library/, or changing the loop helpers every bundled script shares. Carries the HELPERS inlining trap, which has cost a session and is not covered by the test whose comment says it is.
user-invocable: true
---

# Adding a library bot script

A bundled script is a `Script` object with declarative tasks, plus the raw module text imported
with `?raw` so a player can fork it into their own editable document. Both halves have to work, and
the second one is where the trap is.

## Read first

- `web/src/tasks/library/index.ts` - the bundle: `LIBRARY`, `libraryManifests()`, `SOURCES`,
  `librarySource()`, `forkSeed()`, and the `HELPERS` string. **Read the `HELPERS` block before you
  touch anything.**
- `web/src/tasks/library/loopHelpers.ts` - the real helpers, in TypeScript.
- `web/src/tasks/library/chopAndDrop.ts` - the model script, and the shortest one.
- `web/src/tasks/types.ts` and `web/src/tasks/defineScript.ts` - the `Script`, `Task`,
  `Requirement` and `ScriptManifest` shapes, and how a user script is compiled.
- `docs/superpowers/specs/2026-09-06-sp4b-bot-expansion-design.md` and its handoff
  `2026-09-07-sp4b-handoff.md` - the runtime these scripts run in. **In flight**: sprint entry 1 is
  editing `web/src/tasks/**` right now, so grep for symbols rather than trusting line numbers.
- `docs/OPERATIONS.md` for running the stack when you want to watch a script actually play.

## The HELPERS trap

`web/src/tasks/library/index.ts:35-52` is a **hand-maintained JavaScript transcription** of
`loopHelpers.ts`, prepended to every fork seed. It exists because `compileUserScript` strips import
lines and runs the rest through `new Function`, so the helpers a bundled script imports have to
travel with the source, without their TypeScript annotations.

Its own comment says `librarySource.test.ts` means "the two cannot drift apart silently". **That
comment overstates what the test does.** `librarySource.test.ts:28-41` compares
`dropAllTask(...).when` on two fixtures for chop-and-drop only, and calls `tool`, `invFull` and
`levelOf` directly. It never compares:

- `countMatching`;
- `dropAllTask.run`, which is the drop loop, its `c.signal.aborted` guard, and the half that moves
  the game;
- the `keepParam === true` branch;
- the net-fish and mine seeds.

So: **if you change `loopHelpers.ts`, change `HELPERS` by hand in the same edit, and prove the two
agree yourself.** The test will not tell you. This is audit finding C25; the proposed fix is to
generate `HELPERS` at build time by stripping the types off `loopHelpers.ts`, with a `--check` mode
in `scripts/build.ps1` like the atlas and collision generators. Until that lands, the transcription
is manual and it is on you.

## Rules that are not negotiable

- **Change `loopHelpers.ts` and `HELPERS` together, always.** Nothing else enforces it.
- **Script ids are kebab-case and stable.** They key the per-script toggle
  (`localStorage` `cs.script.<scope>.<id>`, one bucket per principal, see
  `web/src/storage/scoped.ts`; plus the Firestore mirror) and the user's forked documents.
- **A task's `run` checks `c.signal.aborted` inside every loop.** A task that ignores the signal
  cannot be stopped, and stop is a player-facing promise.
- **Declare requirements** (`requires`, and `tool(name)` for an item) rather than failing at
  runtime. The catalogue evaluates them and the panels draw the result.
- **Register the script in three places or it half-exists:** the `LIBRARY` array, the `?raw` import,
  and the `SOURCES` map. Missing the third makes `librarySource(id)` return null and the Fork button
  do nothing.
- **Files under 400 lines.** The library files are 17 to 81 lines; keep them that way.
- **No anti-detection behaviour.** The server is ours; there is nothing to evade (decision D10).
  Human-like timing is a gameplay choice, not an evasion feature.

## Working modes

### Adding a script

1. Write `web/src/tasks/library/<name>.ts` exporting a default `Script`: `id`, `name`, `version`,
   `description`, `tags`, `author`, `order`, `params`, `requires`, and the `tasks` array, plus any
   of `until`, `onStart`, `onStop`, `stuckAfterMs`, `maxAttempts`, `hardStop`, `estimateMinutes`.
2. Import both the module and its `?raw` text in `index.ts`.
3. Add it to `LIBRARY` and to `SOURCES`.
4. Add a test beside it and a case to `library.test.ts`.
5. **Add a seed case to `librarySource.test.ts`.** Every new script is a new seed, and the existing
   coverage is chop-and-drop only.

### Changing a shared helper

1. Edit `loopHelpers.ts`.
2. Edit the matching line inside `HELPERS` in `index.ts`, dropping the type annotations, keeping the
   behaviour identical including the guards.
3. Widen `librarySource.test.ts` to compare the helper you touched, for every seed. Do not leave
   the comparison at `when` alone.

## Verification

From `web/`:

```powershell
npm run typecheck
npm run lint
npm test -- src/tasks/library
```

`librarySource.test.ts` and `library.test.ts` are the bar, **plus** the mutation table that proves
your new comparison works: change one character in `HELPERS`, run the suite, watch a test fail. If
nothing fails, the comparison you added does not cover what you think it does.

Then the real thing, with the stack up (`docs/OPERATIONS.md`): open the Marketplace tab, fork the
script, run it, and watch the trace. A seed that compiles in a test and throws in `new Function` is
exactly the failure mode this trap produces.

The generated-`HELPERS` `--check` does not exist yet (audit C25). When it lands it joins
`bun scripts/gen/atlas.ts --check` in `scripts/build.ps1`, run from the repository root.
