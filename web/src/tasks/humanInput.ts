// Spec section 8: while a run is going, any real click or key on the game canvas hands
// control back to the player. The run pauses with reason `human-input` and resumes on its
// own once they have been quiet for `resumeAfterHumanInputMs` (0 = wait for them to resume).
//
// The timer lives here rather than in the Worker: the Worker cannot see the canvas, and the
// panels need the deadline to draw the "resumes in Ns" countdown. `setResumeAt` publishes it
// onto the host's `RunStatus.resumeAtMs`, which is what `TasksApi.status()` hands out.
import type { Transport } from '../agent/types';

export interface HumanInputDeps {
  transport: Transport;
  isRunning(): boolean;
  /** True while the current pause is the one this watcher caused. */
  isPausedByHuman(): boolean;
  pause(): void;
  resume(): void;
  /** 0 disables the auto-resume; the player resumes by hand. */
  resumeAfterMs(): number;
  /** Publishes the deadline (or `null`) so `status()` can show a countdown. */
  setResumeAt?(at: number | null): void;
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}

export interface HumanInputWatcher {
  /** Epoch ms the run auto-resumes at, or null when nothing is armed. */
  resumeAt(): number | null;
  /**
   * Drop a pending auto-resume and clear the published deadline. Called for every deliberate
   * control action (pause, resume, stop, restart): the truce is over, and the host carries
   * `resumeAtMs` across a stop, so a stale countdown would otherwise stay on screen.
   */
  cancel(): void;
  dispose(): void;
}

export function createHumanInputWatcher(d: HumanInputDeps): HumanInputWatcher {
  let timer: unknown = null;
  let resumeAt: number | null = null;

  const publish = (at: number | null): void => { resumeAt = at; d.setResumeAt?.(at); };

  /** (Re)start the quiet-period countdown; each further input pushes the deadline out. */
  const arm = (): void => {
    if (timer !== null) d.clearTimeout(timer);
    timer = null;
    const ms = d.resumeAfterMs();
    if (ms <= 0) { publish(null); return; }
    publish(d.now() + ms);
    timer = d.setTimeout(() => {
      timer = null;
      publish(null);
      // The player may have taken the pause over themselves (or stopped the run) while the
      // timer ran; only resume the pause this watcher owns.
      if (d.isPausedByHuman()) d.resume();
    }, ms);
  };

  const off = d.transport.humanInput(() => {
    if (d.isRunning()) { d.pause(); arm(); return; }
    if (d.isPausedByHuman()) arm();
  });

  const cancel = (): void => {
    if (timer !== null) d.clearTimeout(timer);
    timer = null;
    publish(null);
  };

  return {
    resumeAt: () => resumeAt,
    cancel,
    dispose(): void { off(); cancel(); }
  };
}
