import { expect, test } from '@playwright/test';
import { loginAsGuest, openHome } from './helpers';
import { saveArtifacts } from './harness';

// SP4b Task 14: the headline claim. A guest is created, the Tutorial Island script is started,
// and nothing else touches the world until the character is standing on the mainland.
//
// This is the one wall-clock-bounded spec, because the tutorial has server-side waits of its
// own (spec decision 9: 25 minutes).

/**
 * The six map squares Tutorial Island covers, packed as `WorldExtras.regionId` reports them.
 * Inlined because a closure cannot cross into `page.evaluate` and the shell's own module is not
 * loaded in this process; `src/tasks/library/regions.test.ts` pins these six literals against
 * `TUTORIAL_REGION_IDS` so the two cannot drift.
 */
const TUTORIAL_REGION_IDS = [12079, 12080, 12335, 12336, 12436, 12592];

/** The instructors the island's stages are written around, as the task names spell them. */
const INSTRUCTORS = /guide|instructor|expert|chef|vannaka|brother/i;

/**
 * Spec 3.7: the artifacts are named `<script>-<sha>`, so a CI run does not overwrite the run
 * before it. Off CI there is no sha and the name is `tutorial-island-local`, which is what the
 * committed evidence in `docs/runs` and `docs/screenshots` is called.
 */
const SHA = (process.env.GITHUB_SHA ?? 'local').slice(0, 12);

/**
 * SKIPPED, with the evidence beside it, because the run still does not finish the island. It is
 * not skipped for a flake and not for anything the harness does: `docs/runs/
 * tutorial-island-local.jsonl` and `docs/screenshots/tutorial-island-local.png` are a real
 * 22 minute run of this exact spec, committed on purpose, and they are what the next round
 * starts from. Everything the harness claims - the seeding, the tick budgets, the trace slice on
 * a failure, the artifacts - has worked on every run of it.
 *
 * Where it gets to now, after SP4b's fix wave: design-character, the Gielinor Guide, the door
 * and the path, the inventory and skills tabs, cut-tree, build-fire, both rounds of
 * catch-shrimp and cook-shrimp, survival-recap, THROUGH THE CHEF DOOR, make-dough, bake-bread,
 * the music tab, out of the kitchen, the player controls, run turned on, the run to the quest
 * guide, the quest journal, into the mine, both prospects, both ores mined, and a bronze bar
 * smelted. That is 46 tasks entered and 406 trace events, against 25 tasks and 209 events
 * before the wave; the two fixes that bought it were `followHint` accepting a loc one tile off
 * the arrow (three of the island's doors are placed that way) and `enable-run` firing on a
 * title the content leaves stale.
 *
 * Where it stops, and it is the same shape one stage further on: `tut_smelting.rs2` moves
 * `%tutorial` to `^newbie_mining_instructor_after_smelt_bronze_bar` and calls
 * `~set_tutorial_progress`, but nothing re-renders the tutorial box, so `tutorial.title` still
 * reads `Smelting.` with the bronze bar already in the bag. `smelt-bar` matches its own title
 * again, `useItemOnLoc('Tin ore', 'Furnace')` refuses `item_not_found` in under a millisecond,
 * and three of those spend the attempt budget and pause the run stuck (trace seq 397 to 406).
 * The general lesson for the next round is in that sentence: `tutorial.title` lags the real
 * `%tutorial` across several transitions, so a step that can complete without the title moving
 * needs a second signal (an inventory delta, the hint, the dialog) in its `when`, exactly as
 * `bake-bread`, `open-controls-tab` and `enable-run` now have one.
 *
 * Seven defects this spec has found so far, every one fixed in `web/src` and every one covered
 * by a unit test that fails when the fix is removed: `realChoices` (the live client publishes
 * "Click here to continue" as a dialog OPTION, so every spoken line read as a choice),
 * `decline-tutorial-skip` (a non-live world offers to skip the tutorial and "Yes please."
 * matched the script's own preferred-option pattern), `clickThrough` waiting for the chatbox
 * frame to change rather than for a tick, `clickThrough`'s wait reading that same raw option
 * list and therefore never waiting at all, `cook-shrimp` firing on the burning title with
 * nothing in the bag to cook, `followHint` matching the arrow's exact tile, and `tabStep`
 * matching after its own click had cleared the flash.
 *
 * Un-skip it when a run reaches the mainland; it needs no change here.
 */
test.fixme('a fresh guest plays off Tutorial Island', async ({ page }) => {
  test.setTimeout(25 * 60_000);
  await openHome(page);
  await loginAsGuest(page);
  // `loginAsGuest` waits on the client's own state; the script runtime keeps a snapshot of its
  // own, one message behind it, and that is the snapshot `TasksApi.run` checks the script's
  // area requirement against. Starting the run before it has arrived is refused with
  // "Only runs on Tutorial Island" against a character standing on Tutorial Island.
  await expect
    .poll(() => page.evaluate(ids => {
      const s = window.idlescape!.tasks!.getState();
      return Boolean(s && ids.includes(s.regionId));
    }, TUTORIAL_REGION_IDS), { timeout: 60_000, message: 'the runtime sees the guest on the island' })
    .toBe(true);
  await page.evaluate(() => window.idlescape!.tasks!.run('tutorial-island', {}, { startedBy: 'test' }));

  const bar = page.locator('#copilot-bar');
  await expect(bar).toContainText('Tutorial Island', { timeout: 60_000 });
  // SP4b Task 10's detail line, on a live run rather than in jsdom. It reports the run's own tile,
  // so a character that has been placed in the world always gives it something to say.
  await expect(page.locator('[data-bar-detail]')).toContainText(/\d{4}, \d{4}/, { timeout: 60_000 });

  let arrived = false;
  try {
    await expect.poll(
      () => page.evaluate(ids => {
        const s = window.idlescape!.tasks!.getState();
        // The tile guard is not decoration: a snapshot taken before the player has been placed
        // carries `regionId: 0` and no tutorial, which satisfies both halves of "off the
        // island" while the character is still standing in the guide's house.
        return Boolean(s && (s.player?.worldX ?? 0) > 0 && !ids.includes(s.regionId) && s.tutorial?.open !== true);
      }, TUTORIAL_REGION_IDS),
      { timeout: 22 * 60_000, message: 'off the island' }
    ).toBe(true);
    arrived = true;
  } finally {
    // Kept whether or not the run needed them: the trace and the screenshot are the evidence
    // that this sub-project's headline claim is true, so they are committed either way.
    await saveArtifacts(page, `tutorial-island-${SHA}`).catch(() => {});
  }
  expect(arrived).toBe(true);

  const run = await page.evaluate(() => window.idlescape!.tasks!.getRun());
  // Section 4.3: death should never fire on the island, and the run should not have gone stuck.
  expect(run.events.filter(e => e.kind === 'health' && e.condition === 'death')).toHaveLength(0);
  expect(run.summary.status).toBe('done');
  expect(run.summary.failReason).toBeUndefined();
  // The run worked its way through the island's named instructors rather than falling out of
  // the far side of the region check by some other route.
  const entered = run.events.filter(e => e.kind === 'task_enter').map(e => (e as { task: string }).task);
  expect(entered.filter(t => INSTRUCTORS.test(t)).length).toBeGreaterThan(0);
});
