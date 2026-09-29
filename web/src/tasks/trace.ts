import type { TraceEvent } from './types';

type Unsub = () => void;
/**
 * `Omit` is not distributive: `Omit<TraceEvent, 'seq' | 'at'>` collapses the union
 * down to `{ kind }` because `keyof` an intersection-with-union only keeps the
 * shared keys. Distribute it so each variant keeps its own payload.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A trace row as a caller writes it, before the trace stamps `seq` and `at`. Exported so a
 *  test fixture builds rows through the same type the production `push` accepts. */
export type TraceInput = DistributiveOmit<TraceEvent, 'seq' | 'at'>;

const COALESCE_MS = 10_000;

export interface Trace {
  /**
   * Records one event and hands it to every subscriber. A coalesced delta re-emits the row it
   * merged into, **with the seq it already had**, so a subscriber keeps one row per seq and
   * replaces it: without that, a consumer that copied the first row across `postMessage`
   * (the Worker does exactly this) kept the original delta for ever, and the exported trace
   * and the run summary disagreed silently. The `truncated` marker is fanned out on the same
   * terms: once when the cap first bites, then again under that seq every time its count grows.
   */
  push(ev: TraceInput): TraceEvent;
  events(sinceSeq?: number): TraceEvent[];
  onEvent(cb: (e: TraceEvent) => void): Unsub;
  xpGained(): Record<string, number>;
  itemsDelta(): Record<number, number>;
  tasksEntered(): string[];
  readonly length: number;
}

export function createTrace(opts: { cap?: number; now?: () => number } = {}): Trace {
  const cap = opts.cap ?? 5000;
  const now = opts.now ?? Date.now;
  const list: TraceEvent[] = [];
  const subs = new Set<(e: TraceEvent) => void>();
  const xp: Record<string, number> = {};
  const items: Record<number, number> = {};
  const entered: string[] = [];
  let seq = 0;
  let dropped = 0;

  /** Merge consecutive same-target xp/item deltas landing within COALESCE_MS. */
  function coalesce(ev: TraceInput): boolean {
    const last = list[list.length - 1];
    if (!last || now() - last.at > COALESCE_MS) return false;
    if (ev.kind === 'xp' && last.kind === 'xp' && last.skill === ev.skill) {
      last.delta += ev.delta;
      last.at = now();
      return true;
    }
    if (ev.kind === 'item' && last.kind === 'item' && last.id === ev.id) {
      last.delta += ev.delta;
      last.at = now();
      return true;
    }
    return false;
  }

  /**
   * Hand one event to every subscriber. The set is copied before the walk, because a subscriber
   * is free to unsubscribe from inside its own callback, and each call is guarded: this runs
   * inside the runner's own loop, so one bad listener must cost neither the others nor the run.
   */
  function emit(e: TraceEvent): TraceEvent {
    for (const cb of [...subs]) {
      try {
        cb(e);
      } catch (err) {
        console.error('[trace] a subscriber threw', err);
      }
    }
    return e;
  }

  /**
   * Trim the oldest events past `cap`, keeping run_started at 0 and one marker at 1, and hand
   * back the marker so `push` can fan it out. The marker is a trace row like any other: nothing
   * downstream reads `events()` (the Worker copies the fan-out across `postMessage`, the
   * recorder buffers what it hears and IndexedDB stores that), so a marker that is spliced in
   * without being emitted reaches no subscriber, no export and no report. Its count is corrected
   * in place on every later trim and re-emitted under the seq it already has, which is the same
   * contract `push` documents for a coalesced delta.
   */
  function enforceCap(): TraceEvent | null {
    if (list.length <= cap) return null;
    const keepHead = list[0]?.kind === 'run_started' ? 1 : 0;
    const removeFrom = list[keepHead]?.kind === 'truncated' ? keepHead + 1 : keepHead;
    const excess = list.length - cap;
    list.splice(removeFrom, excess);
    dropped += excess;
    const marker = list[keepHead];
    if (marker?.kind === 'truncated') {
      marker.dropped = dropped;
      return marker;
    }
    const fresh: TraceEvent = { seq: ++seq, at: now(), kind: 'truncated', dropped };
    list.splice(keepHead, 0, fresh);
    return fresh;
  }

  return {
    push(ev) {
      if (ev.kind === 'xp') xp[ev.skill] = (xp[ev.skill] ?? 0) + ev.delta;
      if (ev.kind === 'item') items[ev.id] = (items[ev.id] ?? 0) + ev.delta;
      if (ev.kind === 'task_enter' && !entered.includes(ev.task)) entered.push(ev.task);
      if (coalesce(ev)) return emit(list[list.length - 1] as TraceEvent);
      const full = { ...ev, seq: ++seq, at: now() } as TraceEvent;
      list.push(full);
      const marker = enforceCap();
      emit(full);
      // After the row that caused the trim, and never before it: a new marker takes the next
      // seq, so emitting it second keeps every brand-new row monotonic for the consumers that
      // treat "a seq above the newest" as an append and anything else as a correction.
      if (marker) emit(marker);
      return full;
    },
    events: (since = 0) => list.filter(e => e.seq > since),
    onEvent: cb => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    xpGained: () => ({ ...xp }),
    itemsDelta: () => ({ ...items }),
    tasksEntered: () => [...entered],
    get length() {
      return list.length;
    },
  };
}
