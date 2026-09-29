# SP2c — Tier-1 Framework-Native Shell Plugins

- **Plan:** `docs/superpowers/plans/2026-09-05-sp2c-tier1-shell-plugins.md`
- **Spec:** `docs/superpowers/specs/2026-09-05-sp2-plugin-framework-design.md` (SP2 §5, framework-native subset)
- **Branch:** `feat/platform-shell`
- **Commit range:** `9fa25fa6` (BASE) .. `7aad2e5b` (HEAD) — six commits: `6e7b663`, `a2c8f07`, `e51fdb1`, `9cfb328`, `ec7fef7`, `7aad2e5`
- Read at `sprint/dragon-slayer` HEAD `30efd94`, ledger source `.superpowers/sdd/2026-09-05-sp2c-tier1-shell-plugins/progress.md` plus `task-1-report.md`, `task-2-5-report.md`, `task-6-report.md`.

## What shipped

Four `ShellPlugin`s built on the SP2a framework, replacing the SP1 thin xp/loot panel wrappers: `xp-tracker` (actions-to-level, reset), `loot-tracker` (escaped item names, reset), `notes` (account-synced scratchpad via `ctx.settings`), `screenshot` (canvas capture, thumbnails, download). `web/src/stats/xp.ts` was extended with a per-action `lastDelta` to compute `actionsToNext`. All four plugins registered in `main.ts` in place of the old `asPlugin('xp', ...)` / `asPlugin('loot', ...)` wrappers; `web/src/panels/xp.ts` and `web/src/panels/loot.ts` deleted.

## Rulings

- **Task 1 — append rather than replace `xp.test.ts`.** The brief's Step 1 code block showed the test file as if starting from scratch (only the new `actions-to-level` describe block), but the file already held two pre-existing describe blocks (`xpForLevel`, `xp tracker`) from prior work not covered by this brief. Implementer appended the new block instead of overwriting, to avoid deleting existing coverage. Reviewer accepted this on controller inspection (6/6 passing, both old and new suites intact). Flagged by the implementer as a brief-vs-repo-state mismatch in case a full-file replacement had been intended for another reason — no cost: the safer read was taken and confirmed correct.
- **Tasks 2-5 batched as one dispatch.** Pre-flight scan found xpTracker/lootTracker/notes/screenshot to be four independent new files under `web/src/plugins/builtin/` with no inter-task file overlap and no signature drift against what T6 consumes — batched into a single sonnet dispatch, one commit per plugin. Reviewed together by controller inspection: escaping verified on xp name + loot `getObjName`, timers cleared, screenshot revokes object URLs and takes an injectable canvas. No cost — all four landed verbatim per brief.
- **Delegated-listener bubbling gotcha carried forward from SP2a, didn't bite here.** Pre-flight noted synthetic `new Event()` in tests doesn't bubble by default, and these plugins attach listeners on the panel body via delegation; the task-4 (notes) report confirms the textarea `input` test dispatched on the child element still reached the body listener because the event's `bubbles` flag was set appropriately by the test code — no `{bubbles:true}` fix-up was needed. No cost.
- **Final review done by controller inspection, not a subagent, for all three review points (T1; T2-5 batch; T6).** Justified as a contained slice on an already-final-reviewed SP2a framework, with all plugins simple, verbatim to their briefs, escaped, and tested. No findings surfaced; no cost recorded.
- **Task 6 — pre-delete grep confirmation before `git rm`.** Before deleting `panels/xp.ts`/`panels/loot.ts`, implementer grepped for other importers of `panels/xp`, `panels/loot`, `createXpPanel`, `createLootPanel` across `web/src` — only `main.ts` referenced them (plus the files' own definitions). Proceeded with the delete only after confirming no other caller. No cost — clean deletion, build stayed green.

## Deferred / carried forward

- `plugins.pw.test.ts` e2e run deferred to when the full stack is available (memory note, not a numbered follow-up).
- SP2c-remaining slices, not part of this plan:
  - `status-hud` — needs a client-fork `ClientState` hp/prayer/energy/boosts extension.
  - `quest-helper` and `skill-calc` — need `scripts/gen/*` content-derived data.
  - `hiscores` — pushed to SP3.
  - item icons and ground-pickup attribution — need sprite/scene data.
- SP2b GPU renderer flagged as "the long pole" (client-tier registry + 225-gpu port) — not part of this plan, noted for sequencing awareness only.

## Measured facts

- Full web unit suite: 20 test files, 86 tests, all passing (confirmed after Tasks 2-5 and again after Task 6).
- `npm run typecheck`: exit 0 at every gate (Task 1, Tasks 2-5, Task 6).
- `npm run build`: passes after Task 6 — `tsc --noEmit && vite build` produced `dist/index.html` and hashed assets; only a pre-existing >500kB chunk-size informational warning, unrelated to this change.
- Task 6 diff: `web/src/main.ts` modified, `web/src/panels/loot.ts` and `web/src/panels/xp.ts` deleted — 8 insertions, 78 deletions.
- Per-plugin test counts (Tasks 2-5): xp-tracker 4/4, loot-tracker 4/4, notes 3/3, screenshot 3/3.
- Task 1 test count: `src/stats/xp.test.ts` 6/6 (3 pre-existing + 3 new).

## Traps recorded

- **jsdom stderr noise in the screenshot test is expected, not a failure.** The screenshot capture path appends a temporary `<a href="blob:stub" download>` and calls `.click()`; jsdom logs `Error: Not implemented: navigation (except hash changes)` because it can't navigate a stubbed `blob:` URL, but this does not throw or fail the test. Per the brief's own note that jsdom lacks `URL.createObjectURL`/`canvas.toBlob` (both stubbed in the test), no code or test changes were made to suppress the noise — it surfaces on every run of `screenshot.test.ts` and should not be mistaken for a regression.
- **Non-bubbling synthetic events vs. body-delegated listeners** (inherited SP2a gotcha, restated for this plan): these plugins attach click/input listeners on the panel body via delegation; a test that dispatches `new Event(...)` on a descendant without `{bubbles: true}` will not reach the delegated listener. Real events bubble; if a delegated-listener test doesn't fire, the fix is `{bubbles:true}` on the dispatch, not switching off delegation.

## Per-task table

| Task | What it built | Commit(s) | Fix rounds |
|---|---|---|---|
| 1 | `web/src/stats/xp.ts`: `Track.lastDelta`, `XpRow.actionsToNext` (`Math.ceil(toNext / lastDelta)` when `lastDelta > 0`); appended 3 tests to existing `xp.test.ts` | `6e7b663` | 0 |
| 2 | `web/src/plugins/builtin/xpTracker.ts` + test — `createXpTrackerPlugin(xp)`, actions-to-level rows, reset, escaped skill names | `a2c8f07` | 0 |
| 3 | `web/src/plugins/builtin/lootTracker.ts` + test — `createLootTrackerPlugin(loot)`, escaped item names via `getObjName`, reset | `e51fdb1` | 0 |
| 4 | `web/src/plugins/builtin/notes.ts` + test — `notesPlugin`, account-synced textarea via `ctx.settings`, off-by-default | `9cfb328` | 0 |
| 5 | `web/src/plugins/builtin/screenshot.ts` + test — `createScreenshotPlugin()`, canvas capture, thumbnails, download, injectable canvas | `ec7fef7` | 0 |
| 6 | `web/src/main.ts` — registered the four builtins with shared `xp`/`loot` instances, removed old `asPlugin` wrappers/imports; `git rm web/src/panels/xp.ts web/src/panels/loot.ts` | `7aad2e5` | 0 |
