// Seeding and polling for the script e2e. Seeding goes through the engine's own developer
// commands, which the client's `say()` routes to CLIENT_CHEAT for any `::`-prefixed message
// (client/src/client/Client.ts:1883). There are no dev HTTP routes on the engine: the only
// management routes it registers are the owner bank ones (plan ruling R4).
import { expect, type Page } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Seed {
  /** `::tele level,mx,mz,lx,lz`. */
  at?: { level: number; mx: number; mz: number; lx: number; lz: number };
  /** `::give <item> <n>`; the item is the content debug name, e.g. `bronze_axe`. */
  inventory?: [string, number][];
  /** `::setstat <skill> <level>`. */
  skills?: [string, number][];
}

const cheat = (page: Page, message: string): Promise<unknown> =>
  page.evaluate(m => window.idlescape!.tasks!.dispatch({ type: 'say', message: m, reason: 'e2e' }), message);

/**
 * Lumbridge, packed the way `WorldExtras.regionId` reports a map square: the engine respawns
 * every death at `map_findsquare(0_50_50_21_18, ...)`, which is square 50/50 whatever the
 * character was doing beforehand.
 */
const LUMBRIDGE_REGION = 12850;

/**
 * Take a freshly created character off Tutorial Island, which every seeded run needs before it
 * needs anything else.
 *
 * Measured on the live stack, and the reason the plan's harness could not have worked: a fresh
 * guest starts at `%tutorial = 0`, and `[proc,tutorial_set_active_tabs]` only runs
 * `inv_transmit(inv, inventory:inv)` once `%tutorial > ^newbie_survival_instructor_open_inventory`
 * (engine/content/scripts/tutorial/scripts/tutorial.rs2:66). Until then the server holds the
 * character's inventory and never sends it, so `::give bronze_axe 1` succeeds, the item really
 * is in `inv`, and the bot sees an empty inventory for the rest of the session. `::setstat` is
 * unaffected, which is what makes the failure look like `::give` alone being broken.
 *
 * Two cheats fix it. `::setvar tutorial 1000` is `^tutorial_complete`, so nothing restarts the
 * tutorial; `::~death` is the `[debugproc,death]` in cheat_other.rs2 (the engine's debugproc
 * prefix is `~`, WorldConfig.ts:106), and `[queue,player_death]` ends with `~initalltabs`,
 * which is the one path other than login that binds the inventory to its interface. The
 * character respawns in Lumbridge with every tab live. Dying first also costs nothing: it
 * happens before anything is given.
 */
export async function leaveTutorial(page: Page): Promise<void> {
  await cheat(page, '::setvar tutorial 1000');
  await cheat(page, '::~death');
  await expect
    .poll(() => page.evaluate(() => window.idlescape!.tasks!.getState()?.regionId ?? 0), {
      timeout: 60_000,
      message: 'the character respawns in Lumbridge with its tabs initialised'
    })
    .toBe(LUMBRIDGE_REGION);
}

export async function seedCharacter(page: Page, seed: Seed): Promise<void> {
  await leaveTutorial(page);
  for (const [skill, level] of seed.skills ?? []) await cheat(page, `::setstat ${skill} ${level}`);
  for (const [item, count] of seed.inventory ?? []) await cheat(page, `::give ${item} ${count}`);
  // Every cheat is a packet; the world needs a tick to show the result, and a seed that has not
  // landed makes the run under test fail for a reason that has nothing to do with the run.
  const items = seed.inventory ?? [];
  if (items.length > 0) {
    await expect
      .poll(() => page.evaluate(() => window.idlescape!.tasks!.getState()?.inventory.length ?? 0), {
        timeout: 30_000,
        message: `the seeded inventory arrives (${items.map(i => i[0]).join(', ')})`
      })
      .toBeGreaterThanOrEqual(items.length);
  }
  if (seed.at) {
    const at = seed.at;
    await cheat(page, `::tele ${at.level},${at.mx},${at.mz},${at.lx},${at.lz}`);
    await expect
      .poll(() => page.evaluate(() => window.idlescape!.tasks!.getState()?.player?.worldX ?? 0), { timeout: 30_000 })
      .toBe((at.mx << 6) + at.lx);
    await expect
      .poll(() => page.evaluate(() => window.idlescape!.tasks!.getState()?.player?.worldZ ?? 0), { timeout: 30_000 })
      .toBe((at.mz << 6) + at.lz);
  }
}

export interface RunUntilOpts { ticks: number; label: string }

/**
 * Poll the live run until `predicate` holds, budgeted in GAME TICKS rather than wall clock so a
 * slow machine does not move the pass criteria. Fails with the last slice of the trace attached,
 * which is the difference between "the run did not finish" and knowing why.
 *
 * `predicate` is source, not a function: it is compiled inside the page with `state` and
 * `status` in scope, because a closure cannot cross into `page.evaluate`.
 */
export async function runUntil(page: Page, predicate: string, opts: RunUntilOpts): Promise<void> {
  const start = await page.evaluate(() => window.idlescape!.tasks!.getState()?.tick ?? 0);
  try {
    await expect.poll(
      () => page.evaluate(p => {
        const api = window.idlescape!.tasks!;
        const state = api.getState();
        return Boolean(new Function('state', 'status', `return ${p}`)(state, api.status()));
      }, predicate),
      { timeout: opts.ticks * 600 + 30_000, message: opts.label }
    ).toBe(true);
  } catch {
    const trace = await page.evaluate(async () => {
      const api = window.idlescape!.tasks!;
      const run = await api.getRun().catch(() => null);
      return run ? run.events.slice(-40).map(ev => JSON.stringify(ev)).join('\n') : 'no run';
    });
    const ticks = (await page.evaluate(() => window.idlescape!.tasks!.getState()?.tick ?? 0)) - start;
    throw new Error(`${opts.label} did not hold within ${opts.ticks} ticks (saw ${ticks})\n${trace}`);
  }
}

/**
 * Spec decision 9: a spec that fails twice leaves its trace and its screenshot behind. The
 * Tutorial Island run leaves both whether or not it needed them, because they are the evidence
 * that this sub-project's headline claim is true.
 *
 * `join(dirname(fileURLToPath(import.meta.url)), ...)` rather than `new URL(...)`: the same
 * pattern is what breaks under vitest, and anchoring on this file rather than on the process
 * working directory means the artifacts land in the repository from wherever Playwright was
 * started.
 */
export async function saveArtifacts(page: Page, name: string): Promise<void> {
  const run = await page.evaluate(() => window.idlescape!.tasks!.getRun().catch(() => null));
  const fs = await import('node:fs/promises');
  const docs = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs');
  await fs.mkdir(join(docs, 'runs'), { recursive: true });
  await fs.mkdir(join(docs, 'screenshots'), { recursive: true });
  if (run) await fs.writeFile(join(docs, 'runs', `${name}.jsonl`), run.events.map(e => JSON.stringify(e)).join('\n'));
  await page.screenshot({ path: join(docs, 'screenshots', `${name}.png`) });
}
