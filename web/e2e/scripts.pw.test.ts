import { expect, test, type Page } from '@playwright/test';
import { loginAsGuest, openHome } from './helpers';
import { runUntil, seedCharacter } from './harness';
import type { TraceEvent } from '../src/tasks/types';

// SP4b Task 14: the three library scripts driven against the live 274 stack, on tick budgets
// rather than wall clocks (spec decision 9), and the per-script toggle refusing a run on the
// api path every caller shares.
//
// Each test seeds a character with the engine's own developer commands and then leaves the run
// alone: nothing here clicks the world for the bot. The budget is the assertion. 600 ticks is
// six minutes of game time, which is several times what any of these loops needs when `c.find`
// and `c.travel` work and is unreachable when they do not.

const SKILLING_TIMEOUT_MS = 12 * 60_000;

/**
 * How many logs the chop character is handed before it starts. `dropAllTask` fires on a full
 * bag and nothing else (`invFull`, 28 slots), so a character that starts empty has to cut 27
 * logs at level 1 before the drop half of this spec's own title happens at all: measured on the
 * live stack, that is longer than the whole spec's budget. Seeding the bag to one axe plus 25
 * logs leaves two to cut, which is the same cycle reached in the same way and inside a minute.
 */
const SEEDED_LOGS = 25;
/** Spec decision 9: 600 ticks per skilling e2e. */
const TICKS = 600;
/**
 * Out of reach inside the budget, on purpose. A run that reaches its own target level ends
 * itself, and an ended run's `status()` is back to idle with no target on it, so a spec that
 * asked for level 3 would be racing its own subject for every assertion below.
 */
const UNTIL_LEVEL = 10;

/** Lumbridge castle courtyard, the tile the atlas calls the `lumbridge` landmark. */
const LUMBRIDGE = { level: 0, mx: 50, mz: 50, lx: 22, lz: 18 };

/**
 * The scene scan's default radius (spec decision 4). It is the number the two atlas specs below
 * are built on: a seed tile inside it would be answered by the scene layer and would prove
 * nothing about the atlas, and a run that reached its resource without walking further than this
 * never left the scene it started in. The spec text says "a 30 tile walk"; the property it is
 * naming is this one, and the two seeds stand 17 and 24 tiles out for reasons measured on the
 * live stack and written beside each of them.
 */
const SCENE_DEFAULT_TILES = 15;

interface Ended {
  tilesTravelled: number;
  xpGained: Record<string, number>;
}

/**
 * Stop the run and wait for the report that ends it. Totals like `tilesTravelled` and `xpGained`
 * are only counted into the summary when a run finishes (`workerReport.ts` builds them from the
 * Worker's own context); a live run's summary is still the one `api.ts` seeded and reports zero
 * for every one of them.
 */
async function endRun(page: Page): Promise<Ended> {
  // `stop` takes a `TaskActor`, which is 'player' or 'claude' and nothing else; the spec drives
  // the api exactly as the Stop button does.
  await page.evaluate(() => window.idlescape!.tasks!.stop('player'));
  await expect
    .poll(() => page.evaluate(async () => (await window.idlescape!.tasks!.getRun()).summary.endedAt), {
      timeout: 60_000,
      message: 'the run end report reaches history'
    })
    .not.toBeNull();
  const run = await page.evaluate(() => window.idlescape!.tasks!.getRun());
  const { tilesTravelled, xpGained } = run.summary;
  return { tilesTravelled, xpGained };
}

/**
 * Which of `c.find`'s three layers answered, in the order the run asked. `flatMap` rather than
 * `filter().map()`: a filter callback does not narrow the trace union, and the cast that used to
 * stand here was one TypeScript rejects outright once `e2e/` is compiled.
 */
function targetLayers(events: TraceEvent[]): string[] {
  return events.flatMap(e => (e.kind === 'target' ? [e.via] : []));
}

/**
 * Items the run put down. The summary's `itemsDelta` cannot answer this: it is the run's NET
 * change per item id, so a run that fills a bag, drops all 27 logs and then cuts three more
 * reports `+3` and looks like a run that never dropped anything. The trace keeps each loss.
 */
function droppedEvents(events: TraceEvent[]): number {
  return events.filter(e => e.kind === 'item' && e.delta < 0).length;
}

test.describe('library scripts on the live stack', () => {
  test('chop-and-drop earns woodcutting xp and drops a full inventory', async ({ page }) => {
    test.setTimeout(SKILLING_TIMEOUT_MS);
    await openHome(page);
    await loginAsGuest(page);
    await seedCharacter(page, { at: LUMBRIDGE, inventory: [['bronze_axe', 1], ['logs', SEEDED_LOGS]] });

    // `seedCharacter` waits for the first seeded item; the other 25 ride the same burst, and a
    // run that started on 3 logs instead of 26 would spend the whole budget cutting the rest.
    await runUntil(page, '(state.inventory ?? []).length >= 26', { ticks: 20, label: 'the seeded bag arrives' });

    await page.evaluate(l => window.idlescape!.tasks!.run('chop-and-drop', { tree: 'Tree', untilLevel: l }, { startedBy: 'test' }), UNTIL_LEVEL);
    await runUntil(page, "status.state === 'running'", { ticks: 20, label: 'the run starts' });
    await runUntil(
      page,
      "(state.skills ?? []).some(k => k.name === 'Woodcutting' && k.experience > 0)",
      { ticks: TICKS, label: 'woodcutting xp' }
    );

    const status = await page.evaluate(() => window.idlescape!.tasks!.status());
    expect(status.reason).not.toBe('stuck');
    // What the run settled on, which is `c.find`'s answer rather than the snapshot's. Measured
    // on the live stack: the courtyard answers `via: 'scene'`, because the client's scene runs
    // to the map square's edge and the castle garden's trees are inside the 15-tile default.
    // The atlas claim belongs to the two specs below, which stand where the scene cannot help.
    expect(status.target?.kind).toBe('tree');

    // The other half of this test's own title, and of spec 3.7's row: at least one drop cycle.
    // `chop-and-drop` drops only once the bag is full, so the cycle is 28 slots and then a bag
    // holding the axe again, and both halves are read off the live world. The spec used to stop
    // the run on its first log, which proved the chopping and nothing else.
    await runUntil(page, '(state.inventory ?? []).length >= 28', { ticks: TICKS, label: 'a full inventory' });
    await runUntil(page, '(state.inventory ?? []).length <= 5', { ticks: 60, label: 'the bag emptied again' });
    const live = await page.evaluate(() => window.idlescape!.tasks!.getRun());
    expect(droppedEvents(live.events)).toBeGreaterThan(0);

    const ended = await endRun(page);
    expect(ended.xpGained.Woodcutting).toBeGreaterThan(0);
  });

  test('net-fish-and-drop finds its spot through the atlas and catches something', async ({ page }) => {
    test.setTimeout(SKILLING_TIMEOUT_MS);
    await openHome(page);
    await loginAsGuest(page);
    // (3103, 3245), the east end of Draynor village and 17 tiles from the shrimp shoal the
    // atlas calls `saltfish` (3086, 3229). Out of the scene scan's 15-tile default on purpose:
    // the atlas layer is what has to answer, and a spec standing on top of the shoal would
    // never exercise it.
    //
    // 17 tiles and not the spec's "30 tile walk", deliberately (SP4b Task 14 fix round 1). The
    // number the spec is naming is the scene default it has to clear, and the ground 30 tiles
    // from this shoal is either water or the dark wizards named below; a tile chosen to match a
    // round number in prose would have put the character back in the fight the seeded hitpoints
    // exist to avoid. The walk itself is asserted below rather than assumed from the seed.
    //
    // The hitpoints are seeded and Draynor is the shoal, both for measured reasons. Two
    // `young_dark_wizard` spawns sit a few tiles north of the water (m48_50.jm2, `0 12 36: 174`
    // and `0 13 38: 174`) and they are aggressive to a level-3 character, so the first run of
    // this spec ended on `hard-stop` with the character dead beside the shoal; 40 hitpoints
    // outlast the budget without touching what is under test. The obvious alternative,
    // Rimmington's shoal, has no aggressive neighbour at all and was tried first: the engine
    // adds a zone's static npcs when a player first enters it, so the spots were still absent
    // from the snapshot when `find` re-scanned on arrival and the run went stuck against an
    // empty shore. Draynor's shoal is already spawned by the time the walk reaches it.
    await seedCharacter(page, {
      at: { level: 0, mx: 48, mz: 50, lx: 31, lz: 45 },
      inventory: [['net', 1]], skills: [['hitpoints', 40]]
    });

    await page.evaluate(l => window.idlescape!.tasks!.run('net-fish-and-drop', { untilLevel: l }, { startedBy: 'test' }), UNTIL_LEVEL);
    await runUntil(page, "status.state === 'running'", { ticks: 20, label: 'the run starts' });
    await runUntil(
      page,
      "(state.skills ?? []).some(k => k.name === 'Fishing' && k.experience > 0)",
      { ticks: TICKS, label: 'fishing xp' }
    );

    const live = await page.evaluate(() => window.idlescape!.tasks!.getRun());
    // The layer, not the tile: `via: 'scene'` here would mean the spec proved nothing about the
    // atlas, which is the whole reason the character stands where it does.
    expect(targetLayers(live.events)).toContain('atlas');

    const ended = await endRun(page);
    // Further than the scene could ever have seen: the walk is the claim, not the seed tile.
    expect(ended.tilesTravelled).toBeGreaterThan(SCENE_DEFAULT_TILES);
    expect(ended.xpGained.Fishing).toBeGreaterThan(0);
  });

  test('mine-and-drop walks to the Varrock rocks and earns mining xp', async ({ page }) => {
    test.setTimeout(SKILLING_TIMEOUT_MS);
    await openHome(page);
    await loginAsGuest(page);
    // (3280, 3340), open ground about 24 tiles south of the Varrock south-east mine's copper
    // cluster (3286, 3364) and well outside the scene scan's 15-tile default, so the atlas is
    // what has to name the rocks and `c.travel` is what has to reach them.
    await seedCharacter(page, { at: { level: 0, mx: 51, mz: 52, lx: 16, lz: 12 }, inventory: [['bronze_pickaxe', 1]] });

    await page.evaluate(l => window.idlescape!.tasks!.run('mine-and-drop', { ore: 'Copper', untilLevel: l }, { startedBy: 'test' }), UNTIL_LEVEL);
    await runUntil(page, "status.state === 'running'", { ticks: 20, label: 'the run starts' });
    await runUntil(
      page,
      "(state.skills ?? []).some(k => k.name === 'Mining' && k.experience > 0)",
      { ticks: TICKS, label: 'mining xp' }
    );

    const status = await page.evaluate(() => window.idlescape!.tasks!.status());
    expect(status.reason).not.toBe('stuck');
    expect(status.target?.kind).toBe('rock');
    // Every mining rock in the content is displayed `Rocks`, so which ore a run is standing in
    // can only come from the cluster it walked to: the layer that answered is the claim this
    // test can make honestly, and the scene could not have made it from 24 tiles away.
    const live = await page.evaluate(() => window.idlescape!.tasks!.getRun());
    expect(targetLayers(live.events)).toContain('atlas');

    const ended = await endRun(page);
    expect(ended.tilesTravelled).toBeGreaterThan(SCENE_DEFAULT_TILES);
    expect(ended.xpGained.Mining).toBeGreaterThan(0);
  });

  test('a disabled script is refused on every path', async ({ page }) => {
    await openHome(page);
    await loginAsGuest(page);
    await page.evaluate(() => window.idlescape!.tasks!.setEnabled('chop-and-drop', false));
    const refusal = await page.evaluate(async () => {
      try { await window.idlescape!.tasks!.run('chop-and-drop'); return 'no-error'; }
      catch (e) { return (e as { code?: string }).code ?? 'unknown'; }
    });
    expect(refusal).toBe('disabled');
    // The refusal is the api's, so the panel that lists the script agrees with it.
    const summary = await page.evaluate(async () =>
      (await window.idlescape!.tasks!.list()).find(t => t.id === 'chop-and-drop')?.enabled);
    expect(summary).toBe(false);
    await page.evaluate(() => window.idlescape!.tasks!.setEnabled('chop-and-drop', true));
  });
});
