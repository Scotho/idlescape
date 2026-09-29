// One task per condition, built on the same `ScriptContext` a script gets. They are ordinary
// tasks: the runner enters and exits them, traces them, and counts their attempts, which is what
// makes a recovery visible in the run report instead of being invisible runtime behaviour.
import { LOOT_WINDOW_MS, recoverLoot } from './lootRecovery';
import type { HealthCondition, HealthPolicy, ScriptContext, Task } from './types';

export interface RecoveryDeps {
  /** How the recovery reports what happened, so the ladder can escalate. */
  settle(condition: HealthCondition, outcome: 'recovered' | 'failed'): void;
  /**
   * Log the character back in, for `logout`. Not on `ScriptContext` and not going there: a
   * recovery may put the account back in the game, a script may not log it in and out. The
   * Worker wires this from `transport.relogin`.
   */
  relogin(): Promise<{ ok: boolean; reason?: string }>;
  /**
   * End the session, for the `logout` and `loot-and-logout` deaths. Not on `ScriptContext` for
   * the same reason as `relogin`. The Worker wires this from `transport.logout`, and it is the
   * recovery rather than the ladder that calls it, because only the recovery knows whether the
   * player asked for the loot walk first.
   */
  logout(): void;
  /** The resolved `HealthPolicy.onDeath` - the script's over the player's; default `loot`. */
  onDeath?: HealthPolicy['onDeath'];
  /** The script's own `HealthPolicy.maxRelogins`; default 2, enforced as the task's attempts. */
  maxRelogins?: HealthPolicy['maxRelogins'];
  /**
   * Where the run died, captured by the monitor when the death fired. It cannot be read from the
   * snapshot here: by the time this task runs, the player is standing in Lumbridge.
   */
  deathTile(): { x: number; z: number; level: number } | null;
  /** Epoch ms of that death: what the pile's 200-tick despawn window is measured from. */
  diedAt(): number | null;
  /**
   * The same clock `diedAt` was stamped from. One dep rather than reaching for `Date.now` here,
   * because the two are compared: a caller whose clock starts at zero would make every death two
   * minutes stale, skip the loot walk and still report a recovered run.
   */
  now(): number;
}

const CLICK_THROUGH = 5;
const MODAL_CLOSE_MS = 3000;
/**
 * Spec 3.4: no-progress does "status, one re-scan, then re-path to the run anchor". The re-scan
 * has to be asked for - the collector's own snapshot stops at 15 tiles, and re-reading
 * `state().nearbyLocs` after it widens nothing.
 */
const RESCAN_RADIUS = 30;
const ANCHOR_TOLERANCE = 3;
const RESPAWN_MS = 60_000;
/**
 * `travel`'s own default for a walk given no `timeoutMs`, which is what the anchor walk is. Named
 * here because the death budget has to leave room for the whole of it.
 */
const ANCHOR_WALK_MS = 120_000;
/**
 * The three phases end to end, not a round number: the loot deadline is absolute (`diedAt` plus
 * 120 s), so a loot phase that runs the window down returns with the anchor walk still ahead of
 * it and still wanting its full budget. A tighter total lets the runner's timer abort that walk,
 * `travel.to` answers `aborted`, and a survivable death settles failed - the one route by which
 * the loot detour could fail a run.
 */
const DEATH_TIMEOUT_MS = RESPAWN_MS + LOOT_WINDOW_MS + ANCHOR_WALK_MS;
/** Spec 3.4: the re-login itself, then the world it has to produce before the script resumes. */
const RELOGIN_TIMEOUT_MS = 90_000;
const WORLD_AFTER_RELOGIN_MS = 30_000;
const DEFAULT_MAX_RELOGINS = 2;

/**
 * The loot half of the death recovery, and the reason it is a `void` helper rather than something
 * the caller branches on: whatever happens in here, the run is alive and walks home next. The
 * items were lost the moment the character died, so going back for them can only be a bonus, and
 * a recovery that could fail over them would turn a survivable death into a dead run.
 */
async function goBackForTheLoot(c: ScriptContext, d: RecoveryDeps): Promise<void> {
  const tile = d.deathTile();
  const diedAt = d.diedAt();
  if (!tile || diedAt === null) {
    c.log('died with no recorded death tile; not going back for loot', 'warn');
    return;
  }
  try {
    const loot = await recoverLoot(c, { tile, deadline: diedAt + LOOT_WINDOW_MS, now: d.now });
    c.log(
      loot.reason
        ? `recovered ${loot.picked} items before giving up: ${loot.reason}`
        : `recovered ${loot.picked} items from the death pile`,
      loot.reason ? 'warn' : 'info'
    );
  } catch (error) {
    // The last way this could still fail a survivable death: a throw out of travel or a pickup
    // would leave the task without a settle at all. Swallow it and walk home.
    c.log(`the walk back for the loot threw and was abandoned: ${String(error)}`, 'warn');
  }
}

export function recoveryTaskFor(condition: HealthCondition, d: RecoveryDeps): Task | null {
  const name = `recover:${condition}`;
  const done = (ok: boolean): void => { d.settle(condition, ok ? 'recovered' : 'failed'); };

  switch (condition) {
    case 'unexpected-interface':
      return {
        name, when: () => true, timeoutMs: 10_000, maxAttempts: 2,
        async run(c) {
          c.status('Closing an interface the script did not open');
          await c.sdk.sendCloseModal();
          const closed = await c.wait.until(s => s.modalOpen !== true, { timeoutMs: MODAL_CLOSE_MS, label: 'modal close' });
          // `dismissBlockingUI` knows the interfaces that must never be auto-closed, so it is the
          // fallback rather than the first move.
          if (!closed) await c.bot.dismissBlockingUI();
          done(c.state().modalOpen !== true);
        }
      };
    case 'dialog-stuck':
    case 'level-up':
      return {
        name, when: () => true, timeoutMs: 15_000, maxAttempts: 2,
        async run(c) {
          c.status(condition === 'level-up' ? 'Reading a level-up' : 'Clicking through a dialog');
          await c.tutorial.clickThrough(CLICK_THROUGH);
          done(c.state().dialog?.isOpen !== true);
        }
      };
    case 'no-progress':
      return {
        name, when: () => true, timeoutMs: 60_000, maxAttempts: 2,
        async run(c) {
          c.status('Nothing has happened for a while; looking around');
          // A wider scan first: the thing the script was working on may simply have fallen out
          // of the 15-tile window it was reading. A scan that fails must not stop the walk home.
          await c.sdk.scanNearbyLocs(RESCAN_RADIUS).catch(() => null);
          const trip = await c.travel.to(c.anchor(), { tolerance: ANCHOR_TOLERANCE });
          done(trip.success);
        }
      };
    case 'inventory-full':
      return {
        name, when: () => true, timeoutMs: 5000, maxAttempts: 1,
        async run(c) {
          // Nothing generic is safe here: dropping the wrong item loses it, and banking needs a
          // bank. A script that fills its inventory declares its own handler with `recovers`.
          c.log('The inventory is full and this script declares no way to empty it', 'warn');
          done(false);
        }
      };
    case 'death':
      return {
        name, when: () => true, timeoutMs: DEATH_TIMEOUT_MS, maxAttempts: 1,
        async run(c) {
          const policy = d.onDeath ?? 'loot';
          // `fail` gives up on the first death: no respawn wait, no walk home. What the ladder
          // does with that settle is the monitor's business, not this task's.
          if (policy === 'fail') {
            // The message names the policy rather than who set it: `onDeath: 'fail'` can be the
            // script declaring a death ends the run, or the player picking "Stop the run".
            c.log('Ending the run on this death (onDeath is fail)', 'warn');
            done(false);
            return;
          }
          c.status('Died; waiting to respawn');
          // The respawn is server-side and takes a few ticks; there is nothing to click, and a
          // dead character cannot walk, so this has to finish before anything else is tried.
          // Even the two endings wait it out: a player coming back to a paused run, or logging in
          // after a `logout`, should find a live character rather than a corpse.
          const alive = await c.wait.until(s => s.player?.isDead !== true, { timeoutMs: RESPAWN_MS, label: 'respawn' });
          if (policy === 'resume') { done(alive); return; }
          // A respawn that never came leaves nothing to walk home. Spending what is left of the
          // budget on a trip that cannot start only delays the settle the ladder is waiting for.
          if (!alive) {
            // The one thing that must still happen: the ladder answers a logout policy with
            // `{ fail: 'logged_out' }` whatever this settle says, and `runHealth` skips its own
            // call for a death, so leaving without the packet reports an account logged out and
            // leaves it online, with nothing left in the run that would ever log it out.
            if (policy === 'logout' || policy === 'loot-and-logout') { c.status('Logging out'); d.logout(); }
            done(false);
            return;
          }
          // `pause` is the player asking to be waited for: nothing to loot, nowhere to walk. The
          // ladder turns this settle into a `pause-stuck`.
          if (policy === 'pause') { c.log('Paused after a death, as your settings ask', 'warn'); done(true); return; }
          if (policy === 'loot' || policy === 'loot-and-logout') await goBackForTheLoot(c, d);
          if (policy === 'logout' || policy === 'loot-and-logout') {
            c.status('Logging out');
            // The ladder turns this settle into `{ fail: 'logged_out' }`; this is only the packet.
            d.logout();
            done(true);
            return;
          }
          const home = c.anchor();
          c.status(`Walking back to ${home.x}, ${home.z}`);
          const trip = await c.travel.to({ x: home.x, z: home.z }, { tolerance: ANCHOR_TOLERANCE });
          done(trip.success);
        }
      };
    case 'logout':
      return {
        name, when: () => true, timeoutMs: RELOGIN_TIMEOUT_MS, maxAttempts: d.maxRelogins ?? DEFAULT_MAX_RELOGINS,
        async run(c) {
          c.status('Logging back in');
          // Read before the login, because nothing clears the Worker's cached snapshot on a
          // logout: `state()` still reports the last in-game tick, so a position test would pass
          // against a world that is already gone. A newer tick that says `inGame` is the only
          // honest proof that a login which resolved `ok` actually produced a world.
          const before = c.state().tick ?? 0;
          const result = await d.relogin();
          if (!result.ok) { c.log(`Could not log back in: ${result.reason ?? 'unknown'}`, 'warn'); done(false); return; }
          const back = await c.wait.until(
            s => (s.tick ?? 0) > before && s.inGame === true,
            { timeoutMs: WORLD_AFTER_RELOGIN_MS, label: 'world after relogin' }
          );
          done(back);
        }
      };
    default:
      // `low-hp` is the runner's own hard stop, and `out-of-supplies` is a script's own business.
      // The monitor answers a condition with no task by escalating it to its typed failure.
      return null;
  }
}
