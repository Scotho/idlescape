// web/src/frame/runPresentation.ts -- the one run-state vocabulary (plan ruling R22).
//
// The mock presents five states and the runtime has none of them. It has seven `RunState` values,
// five `PauseReason` values, nine `HealthCondition` values and a session lifecycle beside all
// three (map-contracts.md section 1). This module is the whole of that mapping, read top to
// bottom, first match wins, and both surfaces read it: the co-pilot bar and the Automation run
// card's badge. Two divergent copies of these words used to exist, which is how the banner could
// say "You took over" while the card said "Paused: you took control" about the same second.
import { BAR_PAUSED, BAR_UNPAIRED } from '../ui/copy';
import { pairingReading, type PairingPill } from './overlays';
import type { PairingState } from './pairing';
import type { SessionState } from '../sessions/types';
import type { HealthCondition, RunStatus } from '../tasks/types';

export type CopilotState = 'unpaired' | 'standby' | 'running' | 'paused' | 'stuck';

export interface RunPresentationInput {
  status: RunStatus;
  pairing: PairingState;
  /**
   * The active character's lifecycle, not `displayStatus`'s narrowed three: the four strings
   * ruling R5 moves off `frame/stage.ts` are keyed on `booting` and `title` as well, and those
   * two do not survive the narrowing. Null is not a value here; a frame with no character open
   * passes `title`, which is the copy that asks the player to log in.
   */
  session: SessionState;
  now: number;
  /**
   * When the bar first saw this run in a terminal state, or null. `RunStatus` carries no such
   * stamp and `startedAt` is not one: a run that ran for ten seconds and then failed is already
   * past `startedAt + lingerMs`, so keying the linger off `startedAt` means a failure never shows
   * the stuck chrome at all. The bar stamps this in its own closure the first tick it sees a
   * terminal state, exactly as the run banner's `SETTLED` set did before this task replaced it.
   */
  settledAt: number | null;
  /** Settled runs linger this long after `settledAt` before the bar gets out of the way. */
  lingerMs?: number;
}

export interface RunPresentation {
  state: CopilotState;
  /** The bar's dot and the strip corner dot. The RULE is keyed off `state`, not off this. */
  tone: 'idle' | 'ok' | 'accent' | 'warn' | 'error';
  headline: string;
  detail: string | null;
  /** Seconds to auto-resume, or null. */
  resumeIn: number | null;
  /** True while `session` is not online: the primary action is disabled and the copy is moved. */
  blocked: boolean;
  /** What the canvas pairing pill should read. Derived from pairing FIRST (ruling R6). */
  pill: PairingPill;
}

/** How long a settled run keeps the bar's attention before it hands the chrome back. */
export const LINGER_MS = 4000;

/**
 * The stuck row's second line, per condition (ruling R23). A `Record` over the union rather than
 * a lookup with a fallback: SP4c adding a tenth `HealthCondition` is then a compile error here,
 * which is the only place that would otherwise silently print nothing.
 */
export const HEALTH_COPY: Record<HealthCondition, string> = {
  'no-progress': 'nothing has moved for a while',
  'unexpected-interface': 'an interface opened that the script did not expect',
  'dialog-stuck': 'a dialogue is waiting for an answer',
  'level-up': 'a level-up interrupted the script',
  death: 'the character died',
  logout: 'the character was logged out',
  'inventory-full': 'the inventory is full',
  'out-of-supplies': 'the supplies ran out',
  'low-hp': 'hp fell below the hard stop'
};

/**
 * The four strings a character that is not online shows instead of the bar's own copy. Moved from
 * `frame/stage.ts:277-281` byte for byte, ellipsis and middot included; nothing here is new prose.
 */
const OFFLINE_COPY: Record<Exclude<SessionState, 'online'>, string> = {
  booting: 'starting…',
  connecting: 'connecting…',
  offline: 'offline · press Login to reconnect',
  title: 'press Login to play'
};

/** The one hard-stop sentence, in the bar's own register. The run card title-cases it. */
const HARD_STOP = 'stopped: hp too low';

/**
 * What a SETTLED run is called. The bar collapses done, failed and stopped into standby, because
 * their news belongs in the toast, so this is the run card's half of the vocabulary; it lives here
 * so that the two halves cannot drift apart again (ruling R22). Null means the run never started.
 */
export function outcomeLabel(s: Pick<RunStatus, 'state' | 'reason'>): { text: string; tone: 'ok' | 'error' | 'neutral' } | null {
  if (s.reason === 'hard-stop') return { text: HARD_STOP, tone: 'error' };
  if (s.state === 'done') return { text: 'done', tone: 'ok' };
  if (s.state === 'failed') return { text: 'failed', tone: 'error' };
  if (s.state === 'stopped') return { text: 'stopped', tone: 'neutral' };
  return null;
}

/** Whole seconds left on an auto-resume, or null when nothing is counting down. */
function secondsToResume(s: RunStatus, now: number): number | null {
  if (s.state !== 'paused' || s.resumeAtMs === null) return null;
  return Math.max(0, Math.ceil((s.resumeAtMs - now) / 1000));
}

/** Why the run is not moving, in priority order: the condition, then whatever it last said. */
function stuckReason(s: RunStatus): string {
  if (s.health) return HEALTH_COPY[s.health.condition];
  // `statusLine` is `string`, never null, and its "nothing to say" value is the empty string,
  // which would otherwise render as a blank second line.
  return s.statusLine.trim() || 'no reason reported';
}

export function presentRun(input: RunPresentationInput): RunPresentation {
  const s = input.status;
  const lingerMs = input.lingerMs ?? LINGER_MS;
  const live = s.state === 'running' || s.state === 'starting';
  const stuckPause = s.state === 'paused' && (s.reason === 'stuck' || s.reason === 'hard-stop');
  // Ruling R4: a failure borrows the stuck chrome from when it SETTLED, then gets out of the way.
  const lingering = s.state === 'failed' && input.settledAt !== null && input.now - input.settledAt < lingerMs;
  const blocked = input.session !== 'online';
  const base = {
    resumeIn: secondsToResume(s, input.now),
    blocked,
    // Ruling R6: pairing never overrides a live run, and the pill answers about pairing alone,
    // so it may legitimately disagree with the state beside it.
    pill: pairingReading(input.pairing, live).text
  };

  // Rows 1 and 2: a pause the run cannot get itself out of.
  if (stuckPause) {
    const hardStop = s.reason === 'hard-stop';
    return {
      ...base, state: 'stuck', tone: hardStop ? 'error' : 'warn',
      headline: hardStop ? HARD_STOP : `stuck on ${s.task ?? 'the current task'}`,
      detail: hardStop ? null : stuckReason(s)
    };
  }
  // Rows 5 and 6: the run exists the moment it is asked for.
  if (live) {
    return { ...base, state: 'running', tone: 'accent', headline: s.statusLine.trim() || 'running', detail: null };
  }
  // Rows 3 and 4: every other pause reason, and a null one.
  if (s.state === 'paused') {
    const claude = s.reason === 'claude';
    return {
      ...base, state: 'paused', tone: 'warn',
      headline: claude ? 'paused by Claude' : s.reason === null ? 'paused' : BAR_PAUSED,
      detail: null
    };
  }
  // Row 7: the failure, for as long as it lingers.
  if (lingering) {
    return {
      ...base, state: 'stuck', tone: 'error',
      headline: s.reason === 'hard-stop' ? HARD_STOP : 'run failed', detail: stuckReason(s)
    };
  }
  // Rows 8 to 10, and the only place ruling R5's moved copy lands: the primary button is what
  // gets disabled, and it exists in these two states alone.
  const unpaired = input.pairing === 'unpaired';
  const headline = input.session !== 'online'
    ? OFFLINE_COPY[input.session]
    : unpaired ? BAR_UNPAIRED : 'paired · standing by';
  return {
    ...base, state: unpaired ? 'unpaired' : 'standby', tone: unpaired ? 'idle' : 'ok',
    headline, detail: null
  };
}
