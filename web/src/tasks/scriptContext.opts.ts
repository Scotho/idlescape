// Every named options bag a script passes, lifted out of scriptContext.ts so that file stays
// under the 400-line ceiling once S11's doc comment lands on all 48 of its declaration sites.
// The plan's Task 9 orders this split and names it `scriptContext.wait.ts`, over the wait and
// dialog members; moving the members would have turned two object type literals into named
// interfaces, which is the one shape gen/apiIndex.ts's traversal rule 2 treats as a namespace,
// so the bags moved instead and the seam is "the interface there, the bags it takes here".
//
// scriptContext.ts re-exports every name below, exactly as types.ts re-exports scriptContext.ts,
// so no import site moved. scriptApi.ts names this file directly instead, because its own rule
// is that each name in a re-export list comes from the file that declares it, and so must
// scripts/gen/apiDocs.ts's SOURCES array when Task 10 writes it.
import type { WorldState } from '../agent/types';

export interface WaitUntilOpts {
  /** Milliseconds. Defaults to DEFAULT_WAIT_MS, 20000. */
  timeoutMs?: number;
  /**
   * Names the wait in the trace when it expires. A cancelled wait and a timed-out wait both
   * return false, so this is the only way a reader tells them apart.
   */
  label?: string;
  /**
   * Re-arms the timeout each time this fires, for a wait whose subject is making progress: a
   * tree that is still being chopped, a furnace that is still smelting. A predicate that is
   * always true never times out, and only a stop ends the wait; that footgun is kept
   * deliberately rather than fixed, so write a predicate that can go false.
   */
  resetWhen?: (s: WorldState) => boolean;
  /**
   * A caller's own signal, raced with the task signal. Aborting it resolves the wait false and
   * leaves the run alone.
   */
  signal?: AbortSignal;
}

/** Waiting on the player's animation: any change, or one particular id. */
export interface WaitAnimationOpts {
  /** Wait for this animation id. Omitted, any change from the id at call time counts. */
  id?: number;
  /** Milliseconds. Defaults to DEFAULT_WAIT_MS, 20000. */
  timeoutMs?: number;
  /** Names the wait in the trace when it expires. Defaults to "animation". */
  label?: string;
  /** A caller's own signal, raced with the task signal. */
  signal?: AbortSignal;
}

/**
 * Waiting on hitpoints, as a percentage of the maximum rather than as a count, so the same
 * threshold reads the same at every level. Neither side matches while the world has published
 * no hitpoints or a zero maximum.
 */
export interface WaitHpOpts {
  /** Resolve when hitpoints fall strictly below this percentage of the maximum. */
  belowPercent?: number;
  /** Resolve when hitpoints rise strictly above this percentage of the maximum. */
  abovePercent?: number;
  /** Milliseconds. Defaults to DEFAULT_WAIT_MS, 20000. */
  timeoutMs?: number;
  /** Names the wait in the trace when it expires. Defaults to "hp". */
  label?: string;
  /** A caller's own signal, raced with the task signal. */
  signal?: AbortSignal;
}

/** How `c.dialog.continueUntilOption` clicks past the frames that offer nothing to decide. */
export interface DialogContinueOpts {
  /** Milliseconds to wait for the chatbox to change between clicks. Default 4000. */
  timeoutMs?: number;
  /** How many option-less frames to click past before reporting `timeout`. Default 10. */
  maxClicks?: number;
  /** A caller's own signal. Aborting it stops the clicking and leaves the run alone. */
  signal?: AbortSignal;
}

/** How `c.dialog.complete` walks a whole conversation. */
export interface DialogCompleteOpts {
  /** Milliseconds each frame is given to arrive. Default 4000. */
  timeoutMs?: number;
  /** A caller's own signal. Aborting it stops the walk after the click in flight. */
  signal?: AbortSignal;
}

export interface FollowHintOpts {
  /** Talk to a hinted npc rather than using option 1. Default true. */
  talk?: boolean;
}

export interface ClickThroughOpts {
  /** How many option-less frames to click past before giving up. Default 10. */
  maxClicks?: number;
  /** Milliseconds to wait for the chatbox to change between clicks. Default 4000. */
  timeoutMs?: number;
}

export interface LogOpts {
  /** How the line is filed in the trace, and how the panel colours it. Default "info". */
  level?: 'info' | 'warn' | 'error';
}

/** How `c.screenshot` names an image, and whether it keeps it. */
export interface ScreenshotOpts {
  /**
   * Names the image in the trace row and in the run's attachment list. Defaults to
   * "screenshot", so an unlabelled shot still reads as something in a trace.
   */
  label?: string;
  /**
   * Files the image with the run. Default true. Pass false for a caller that wants the bytes
   * and nothing else, so the shot does not spend one of the run's eight slots.
   */
  attach?: boolean;
}

/**
 * How `c.retry` decides to try again. The bag is required because `until` is: a retry with no
 * definition of success is a loop that either never stops or stops at the first answer, and
 * neither is what a caller meant.
 */
export interface RetryOpts<T> {
  /** How many times `fn` is called in total, not how many times it is re-called. Default 3. */
  attempts?: number;
  /** What counts as success. Required, which is why the bag is. */
  until: (r: T) => boolean;
  /**
   * Server ticks waited between attempts, not milliseconds (S8). One number means the same wait
   * every time; a ladder is walked in order and holds at its last rung. Default [1, 2, 4].
   */
  backoffTicks?: number | number[];
  /** Names the retry in the trace, once per attempt that did not succeed. */
  label?: string;
  /** A caller's own signal. Aborting it ends the retry after the attempt in flight. */
  signal?: AbortSignal;
}

/** Ends the run when hitpoints fall below the floor. */
export interface HardStop {
  /**
   * Absolute hitpoints, not a percentage.
   * @deprecated Use `hpBelowPoints`. Removed in api 3.
   */
  hpBelow?: number;
  /**
   * Absolute hitpoints, not a percentage: `hpBelowPoints: 10` ends the run at 9 hitpoints
   * whatever the maximum is. S8 asks a numeric member to name its unit, and this one did not.
   * `c.wait.hp` is the percentage-shaped member; this floor is a count.
   */
  hpBelowPoints?: number;
}
