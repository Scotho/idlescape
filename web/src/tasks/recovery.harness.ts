// web/src/tasks/recovery.harness.ts
// The fake `ScriptContext` and `RecoveryDeps` the recovery tests drive. Extracted when
// recovery.test.ts crossed the 400-line ceiling, so the death behaviours (recovery.death.test.ts)
// and every other condition (recovery.test.ts) can share one fake world rather than grow two.
//
// Harness files are outside the shipped program: web/tsconfig.json excludes both harness globs and
// web/tsconfig.test.json includes them (audit C16), so naming vitest's `Mock` type here cannot put
// vitest's ambient globals into what ships, which is what used to clobber the global `setTimeout`
// signature and make toast.ts fail noImplicitAny. The `vi.fn` value itself is still handed in by
// the caller as a `SpyFactory`, so the spies belong to the test that has to reset them.
import type { Mock } from 'vitest';
import type { ScriptContext } from './types';
import type { WorldState } from '../agent/types';
import type { DialogState, GroundItem, PlayerState } from '../vendor/rs-sdk/sdk/types';

/**
 * `vi.fn`, handed in by the test. The return is `Mock<T>`, which is `T` plus vitest's mock surface;
 * declaring it as bare `T` was a lie `vi.fn` never satisfied, and it hid every caller that reaches
 * for `.mock.calls` or `.mockResolvedValue` on a fake this file built.
 */
export type SpyFactory = <T extends (...args: never[]) => unknown>(impl: T) => Mock<T>;

const dialog = (isOpen: boolean): DialogState => ({ isOpen, options: [], isWaiting: false });
const LOOT: GroundItem = { id: 440, name: 'Iron ore', count: 1, x: 3200, z: 3200, distance: 0, reachable: true };
const player = (): PlayerState => ({ worldX: 10, worldZ: 10, level: 0, hp: 10, maxHp: 10, animId: -1, isDead: false, lifeId: 1 } as unknown as PlayerState);
export const dead = (over: Partial<PlayerState> = {}): PlayerState => ({ ...player(), isDead: true, ...over } as PlayerState);

/**
 * How many times the fake `wait.until` looks before it gives up. The real one polls the live
 * snapshot until its timeout and answers with the same two outcomes: true the moment the
 * predicate holds, false when it never does. Each look here moves the fake world on one step.
 */
const WAIT_POLLS = 8;

/**
 * What the world looks like after a logout: `inGame` false on the tick the client last managed to
 * publish, and the player still standing where they were. Nothing clears the Worker's cached
 * snapshot, so this - not an empty world - is what a re-login recovery reads on its first look.
 */
export const STALE_LOGOUT: Partial<WorldState> = { tick: 41, inGame: false, player: player() };

export function fakeCtx(fn: SpyFactory, world: Partial<WorldState> = {}, opts: { anchor?: { x: number; z: number }; sticky?: boolean } = {}) {
  const calls: string[] = [];
  let state = { tick: 1, inGame: true, modalOpen: false, modalInterface: -1, dialog: dialog(false), player: player(), ...world } as WorldState;
  /** World changes the test has scheduled, applied `in` looks from now. */
  const scheduled: { in: number; patch(s: WorldState): Partial<WorldState> }[] = [];
  const advance = (): void => {
    for (const change of [...scheduled]) {
      change.in -= 1;
      if (change.in > 0) continue;
      state = { ...state, ...change.patch(state) } as WorldState;
      scheduled.splice(scheduled.indexOf(change), 1);
    }
  };
  const ctx = {
    state: () => state,
    status: fn(() => {}), log: fn(() => {}),
    sdk: {
      sendCloseModal: fn(async () => {
        calls.push('close');
        if (!opts.sticky) state = { ...state, modalOpen: false };
        return { success: true, message: 'closed' };
      }),
      scanNearbyLocs: fn(async () => { calls.push('scan'); return []; }),
      // The pile a death left. One item, because what the loop does with many is
      // `lootRecovery.test.ts`'s question, not this file's.
      scanGroundItems: fn(async () => { calls.push('scanGround'); return [LOOT]; })
    },
    bot: {
      dismissBlockingUI: fn(async () => { calls.push('dismiss'); }),
      pickupItem: fn(async () => { calls.push('pickup'); return { success: true, message: 'Picked up Iron ore' }; })
    },
    signal: new AbortController().signal,
    tutorial: {
      clickThrough: fn(async () => {
        calls.push('clickThrough');
        if (!opts.sticky) state = { ...state, dialog: dialog(false) };
      })
    },
    travel: {
      to: fn(async (t: { x: number; z: number }) => {
        calls.push(`travel:${t.x},${t.z}`);
        // A dead character does not walk. The fake has to refuse, or a recovery that skipped the
        // respawn wait would look like it worked.
        if (state.player?.isDead === true) return { success: false, reason: 'dead', legs: 0, tiles: 0 };
        return { success: true, legs: 1, tiles: 5 };
      }),
      distanceTo: () => 0
    },
    anchor: () => opts.anchor ?? { x: 10, z: 10 },
    wait: {
      until: async (p: (s: WorldState) => boolean, o?: { timeoutMs?: number; label?: string }) => {
        if (o?.label) calls.push(`wait:${o.label}`);
        for (let i = 0; i < WAIT_POLLS; i++) {
          if (p(state)) return true;
          advance();
        }
        return p(state);
      }
    }
  } as unknown as ScriptContext;
  return {
    ctx, calls,
    /** The server brings the character back `n` looks into the wait. */
    becomeAliveAfter: (n: number) => {
      scheduled.push({ in: n, patch: s => ({ player: { ...s.player, isDead: false } as PlayerState }) });
    },
    /** A world arrives `n` looks after the login resolved: a newer tick, and back in game. */
    worldBackAfter: (n: number) => {
      scheduled.push({ in: n, patch: s => ({ tick: (s.tick ?? 0) + 1, inGame: true }) });
    }
  };
}

/** An arbitrary epoch. `diedAt` and `now` share it, the way the run wires them from one clock. */
export const DIED_AT = 5_000_000;

/**
 * A death tile is recorded by default because that is what production does: the monitor captures
 * one on every death it fires. `burn` moves the shared clock the way a long walk back does.
 */
export const deps = (fn: SpyFactory, calls: string[] = []) => {
  let clock = DIED_AT;
  return {
    settle: fn(() => {}),
    relogin: fn(async (): Promise<{ ok: boolean; reason?: string }> => ({ ok: true })),
    logout: fn(() => { calls.push('logout'); }),
    deathTile: fn((): { x: number; z: number; level: number } | null => ({ x: 3200, z: 3200, level: 0 })),
    diedAt: fn((): number | null => DIED_AT),
    now: fn((): number => clock),
    burn: (ms: number): void => { clock += ms; }
  };
};
