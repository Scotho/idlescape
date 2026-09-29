// The whole wait family, S7's "c.wait is the only sanctioned wait", as a factory over the five
// things a wait needs. It lives here rather than in workerContext.ts for the reason
// runContext.ts:1-7 gives about seams, and because workerContext.ts has no room: it was 294
// lines before this proposal and three more land beside it.
//
// Every member resolves rather than rejects, and false means one of two things: the timeout
// expired, or the run was stopped. `label` is what separates them in a trace, which is why S7
// asks for one.
//
// `dialogText` lives in dialog.ts and is imported rather than written twice: `c.wait.dialog`
// matching one string while `c.dialog.text()` reports another is a script waiting for a line its
// own reader says is not there.
import { dialogText } from './dialog';
import type {
  ScriptContext, WaitAnimationOpts, WaitHpOpts, WaitUntilOpts
} from './scriptContext';
import type { Unsub, WorldState } from '../agent/types';

/** How long a wait with no `timeoutMs` waits before it gives up. */
export const DEFAULT_WAIT_MS = 20_000;

export interface WaitDeps {
  /** The latest snapshot, synchronously. Never null: the context hands out an empty world. */
  state(): WorldState;
  onState(cb: (s: WorldState) => void): Unsub;
  /** One call per world-state message from the host, which is what `ticks` counts. */
  onTick(cb: () => void): Unsub;
  /**
   * The signal that is live *now*. The runner swaps the current task's signal in before each
   * `run`, so a wait must read it at call time rather than capture it once.
   */
  signal(): AbortSignal;
  log(text: string, level: 'warn'): void;
}

export function createWait(d: WaitDeps): ScriptContext['wait'] {
  const untilP = (pred: (s: WorldState) => boolean, o: WaitUntilOpts = {}): Promise<boolean> =>
    new Promise(res => {
      const timeoutMs = o.timeoutMs ?? DEFAULT_WAIT_MS;
      if (safe(pred, d.state())) { res(true); return; }
      const task = d.signal();
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = (v: boolean): void => {
        if (settled) return;
        settled = true;
        off();
        task.removeEventListener('abort', onAbort);
        o.signal?.removeEventListener('abort', onAbort);
        clearTimeout(timer);
        res(v);
      };
      const arm = (): void => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          // The label is the only thing that separates a timeout from a cancellation in a
          // trace, because S2 makes both resolve false. S7 requires one for that reason.
          if (o.label) d.log(`wait ${o.label} timed out after ${timeoutMs}ms`, 'warn');
          done(false);
        }, timeoutMs);
      };
      const off = d.onState(s => {
        if (safe(pred, s)) { done(true); return; }
        // DreamBot documents the footgun and we keep it rather than fixing it: a resetWhen that
        // is always true re-arms on every snapshot, so the wait never expires. Only an abort
        // ends it. The doc comment on WaitUntilOpts.resetWhen says so.
        if (o.resetWhen && safe(o.resetWhen, s)) arm();
      });
      const onAbort = (): void => done(false);
      task.addEventListener('abort', onAbort);
      o.signal?.addEventListener('abort', onAbort);
      arm();
      if (task.aborted || o.signal?.aborted) done(false);
    });

  /**
   * R6: true when it counted the ticks, false when the run was stopped first. No saved script
   * can observe the widening, because JavaScript discards a return value nobody reads.
   */
  const ticks = (n: number): Promise<boolean> =>
    new Promise(res => {
      if (n <= 0) { res(true); return; }
      const signal = d.signal();
      let left = n;
      let settled = false;
      const finish = (counted: boolean): void => {
        if (settled) return;
        settled = true;
        off();
        signal.removeEventListener('abort', onAbort);
        res(counted);
      };
      const onAbort = (): void => finish(false);
      const off = d.onTick(() => { if (--left <= 0) finish(true); });
      signal.addEventListener('abort', onAbort);
      if (signal.aborted) finish(false);
    });

  return {
    until: untilP,
    ticks,
    dialog: (re, t) => untilP(s => !!s.dialog?.isOpen && (!re || re.test(dialogText(s))), { timeoutMs: t, label: 'dialog' }),
    xp: (skill, min = 1, t) => {
      const base = skillXp(d.state(), skill);
      return untilP(s => skillXp(s, skill) - base >= min, { timeoutMs: t, label: `xp ${skill}` });
    },
    item: (key, delta = 1, t) => {
      const base = itemCount(d.state(), key);
      return untilP(s => itemCount(s, key) - base >= delta, { timeoutMs: t, label: `item ${key}` });
    },
    message: (re, t) => {
      const since = lastMessageTick(d.state());
      return untilP(s => (s.gameMessages ?? []).some(m => m.tick > since && re.test(m.text)), { timeoutMs: t, label: 'message' });
    },
    idle: t => untilP(s => (s.player?.animId ?? -1) === -1, { timeoutMs: t, label: 'idle' }),
    animation: (o: WaitAnimationOpts = {}) => {
      // The baseline is captured at call time, like xp, item and message, so there is no
      // missed-edge race between the call and the first snapshot after it.
      const base = d.state().player?.animId ?? -1;
      const hit = (s: WorldState): boolean =>
        o.id === undefined ? (s.player?.animId ?? -1) !== base : (s.player?.animId ?? -1) === o.id;
      return untilP(hit, { timeoutMs: o.timeoutMs, label: o.label ?? 'animation', signal: o.signal });
    },
    hp: (o: WaitHpOpts) => untilP(s => {
      const pct = hpPercent(s);
      if (pct === null) return false;
      if (o.belowPercent !== undefined && pct < o.belowPercent) return true;
      return o.abovePercent !== undefined && pct > o.abovePercent;
    }, { timeoutMs: o.timeoutMs, label: o.label ?? 'hp', signal: o.signal })
  };
}

/** A predicate written by a script must never take the run down. */
function safe(pred: (s: WorldState) => boolean, s: WorldState): boolean {
  try {
    return pred(s);
  } catch {
    return false;
  }
}

function skillXp(s: WorldState, skill: string): number {
  return (s.skills ?? []).find(k => k.name.toLowerCase() === skill.toLowerCase())?.experience ?? 0;
}

function itemCount(s: WorldState, key: number | string): number {
  return (s.inventory ?? [])
    .filter(i => (typeof key === 'number' ? i.id === key : i.name?.toLowerCase() === String(key).toLowerCase()))
    .reduce((a, i) => a + i.count, 0);
}

function lastMessageTick(s: WorldState): number {
  return (s.gameMessages ?? []).reduce((max, m) => Math.max(max, m.tick), 0);
}

/**
 * Current hitpoints as a percentage of the maximum, or null when the world has not published
 * either. A zero maximum is folded into the null arm rather than divided by: it is a world that
 * has not finished publishing, not a dead player.
 */
function hpPercent(s: WorldState): number | null {
  const hp = s.player?.hp;
  const max = s.player?.maxHp;
  if (typeof hp !== 'number' || typeof max !== 'number' || max <= 0) return null;
  return (hp / max) * 100;
}

