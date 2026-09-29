// web/src/tasks/runRecorder.ts - the live run's trace buffer and its journey into IndexedDB.
//
// One of the three things api.ts's own header names as its: the run that is current, the events
// it has produced, how many of them have reached history, and the summary that lands when it
// ends. Extracted whole when the per-script toggles pushed api.ts past the 400-line ceiling,
// because run control and the catalogue are the api's job and this is bookkeeping behind them.
//
// It knows nothing about scripts, params or the Worker protocol: it is handed a seeded summary
// and told when a run begins, and everything else arrives on the host's two subscriptions.
import type { RunHistory } from './history';
import type { TaskLastRun, UserTaskStore } from './userStore';
import type { RunSummary, TraceEvent } from './types';
import type { WorkerHost } from '../agent/workerHost';

/** Trace events between IndexedDB appends, so a tab that dies mid-run keeps most of its trace. */
const FLUSH_EVERY = 50;

/**
 * The same cap `trace.ts` applies at the far end of `postMessage`, and it has to be the same
 * number. The Worker's trace drops its oldest rows past this and fans out a `truncated` marker
 * saying how many went; a recorder that kept everything wrote the whole run to IndexedDB with
 * that marker in it, so the export and the report both claimed N events had been dropped over a
 * buffer that had dropped none. It is also the only bound on the buffer: a chop loop produces
 * roughly 1 500 events an hour and nothing else ever shortens it.
 */
const CAP = 5000;

/** The run the buffer belongs to, and the user document (if any) it was started from. */
export interface CurrentRun { summary: RunSummary; docId: string | null }

export interface RunRecorderDeps {
  host: Pick<WorkerHost, 'onTrace' | 'onRunEnd'>;
  history: RunHistory;
  store: Pick<UserTaskStore, 'setLastRun'>;
  /** Every trace event, as it arrives and before it is buffered: the api echoes logs from here. */
  onEvent(e: TraceEvent): void;
  /** Something a subscriber may care about moved; the api re-publishes its status. */
  onChanged(): void;
  now(): number;
}

export interface RunRecorder {
  /**
   * Everything that has to be true before a new runId starts producing trace: the buffer belongs
   * to this run only, the flush cursor is back to zero, and history already holds a row for the
   * periodic `appendEvents` to attach to. A restart needs this every bit as much as a run.
   */
  begin(summary: RunSummary, docId: string | null): void;
  /** The run the buffer belongs to, or null before anything has run in this tab. */
  current(): CurrentRun | null;
  /**
   * The live buffer, from `sinceSeq` exclusive. It carries the same hole `RunReads.getRun`
   * documents: a corrected row keeps its original seq, so it is below any cursor a caller
   * already holds and cannot be re-delivered through this door.
   */
  eventsSince(sinceSeq: number): TraceEvent[];
}

export function createRunRecorder(d: RunRecorderDeps): RunRecorder {
  const events: TraceEvent[] = [];
  const ended = new Set<string>();
  let flushed = 0;
  /** A `truncated` marker whose count has moved since the last flush carried it. */
  let markerDirty = false;
  let current: CurrentRun | null = null;

  /**
   * One row per `seq`. `trace.ts` coalesces consecutive xp and item deltas by mutating the row
   * it merged into and re-emitting it under the seq it already had, so an event that arrives a
   * second time is a correction, not a new line: appending it would double the delta in the
   * exported file and make it disagree with the summary's own totals.
   *
   * A correction behind the flush cursor pulls the cursor back to it, so the next flush carries
   * the corrected row to IndexedDB. `RunHistory.appendEvents` merges by seq at the far end, so
   * the rows in between being sent twice costs a write, not a duplicate.
   */
  function record(e: TraceEvent): void {
    // Appending is the O(1) case and the common one: `trace.ts` hands out a strictly rising seq
    // for every brand-new row, so a seq above the newest in the buffer cannot be a correction.
    // The scan below is the correction fallback, and it only ever runs for one - a coalesced
    // delta or a truncation marker whose count grew, both of which re-arrive under a seq the
    // buffer already holds. Guarding the other way round put a full findIndex over an unbounded
    // buffer in front of every ordinary append, which is O(n squared) across a long run.
    const newest = events.length - 1;
    if (newest < 0 || e.seq > (events[newest] as TraceEvent).seq) { events.push(e); return; }
    const at = events.findIndex(x => x.seq === e.seq);
    if (at === -1) { events.push(e); return; }
    events[at] = e;
    // The `truncated` marker is corrected on EVERY trim once the cap has bitten, which is once
    // per event for the rest of the run. Pulling the flush cursor back to it would then re-send
    // the whole tail behind it every fifty events, growing without bound. It rides the next
    // ordinary flush instead: `appendEvents` merges by seq, so the stored marker catches up one
    // flush later, and the `put` at run end carries the final count whatever happened before.
    if (e.kind === 'truncated') { markerDirty = true; return; }
    flushed = Math.min(flushed, at);
  }

  /**
   * Drop the oldest ordinary rows past the cap, keeping `run_started` and the `truncated`
   * marker, which is the rule `trace.ts` trims by. The marker does not sit at the head here the
   * way it does there: it arrives over `postMessage` under the highest seq of the moment, so it
   * is appended like any other row and is found by kind rather than by position.
   *
   * `flushed` is an index, so a row removed below it has to pull it back by one, and a row
   * removed at it leaves it where it is: the row that shifts down into that slot has not been
   * written yet either.
   */
  function enforceCap(): void {
    while (events.length > CAP) {
      const at = events.findIndex(e => e.kind !== 'run_started' && e.kind !== 'truncated');
      if (at === -1) return;
      events.splice(at, 1);
      if (flushed > at) flushed -= 1;
    }
  }

  d.host.onTrace(e => {
    record(e);
    enforceCap();
    d.onEvent(e);
    const runId = current?.summary.runId;
    if (runId && events.length - flushed >= FLUSH_EVERY) {
      const chunk = events.slice(flushed);
      if (markerDirty) {
        const marker = events.find(x => x.kind === 'truncated');
        if (marker && !chunk.includes(marker)) chunk.unshift(marker);
        markerDirty = false;
      }
      flushed = events.length;
      void d.history.appendEvents(runId, chunk).catch(() => {});
    }
    d.onChanged();
  });

  d.host.onRunEnd(({ runId, summary }) => {
    // `WorkerHost.terminate` can synthesise a second end for a run that then also reports its
    // own: the first one is the truthful summary, so later ones are dropped rather than
    // overwriting history with "the worker was terminated".
    if (ended.has(runId)) return;
    ended.add(runId);
    const doc = current?.summary.runId === runId ? current.docId : null;
    void d.history.put(summary, events.slice()).catch(() => {});
    if (doc) {
      const lastRun: TaskLastRun = { runId, at: summary.endedAt ?? d.now(), status: summary.status, summary: summary.summary };
      void d.store.setLastRun(doc, lastRun).catch(() => {});
    }
    if (current?.summary.runId === runId) current = { ...current, summary };
    d.onChanged();
  });

  return {
    begin(summary, docId) {
      events.length = 0;
      flushed = 0;
      markerDirty = false;
      current = { summary, docId };
      void d.history.put(summary, []).catch(() => {});
      d.onChanged();
    },
    current: () => current,
    eventsSince: sinceSeq => events.filter(e => e.seq > sinceSeq)
  };
}
