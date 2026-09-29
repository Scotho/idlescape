// web/src/tasks/runReads.ts - reading a run back: the live one out of the recorder's buffer,
// an older one out of IndexedDB, and either of them as a file the player can keep.
//
// api.ts's header names the current run's trace and its journey into history as one of the three
// things it owns; `runRecorder.ts` owns the writing half and this is the reading half. It was
// split out when `exportRun` pushed api.ts past the 400-line ceiling, and the seam is a real one:
// nothing here knows about scripts, params, the catalogue or the Worker.
import type { RunHistory } from './history';
import type { RunRecorder } from './runRecorder';
import type { RunSummary, TraceEvent } from './types';

export interface RunReadsDeps {
  history: Pick<RunHistory, 'get' | 'list'>;
  recorder: Pick<RunRecorder, 'current' | 'eventsSince'>;
  /**
   * How this api reports a run it cannot find. It arrives as a factory rather than being thrown
   * from here so that `TasksError` stays api.ts's, and this module stays free of it: the api is
   * what callers catch, and it is the api that decides what its codes mean.
   */
  notFound(message: string): Error;
}

export interface RunReads {
  /**
   * `sinceSeq` is a cursor for an incremental reader, and it has a hole nothing uses yet: a
   * coalesced delta and a grown `truncated` marker both re-arrive under the seq they already
   * had, which is by definition at or below any cursor a caller is holding, so a correction can
   * never cross this door. A reader that pages with it keeps the stale row `trace.ts` re-emitted
   * to replace. Every caller in the shell reads whole runs (`getRun(runId)`), which is correct;
   * anything that starts paging has to reconcile by seq at its own end, or this parameter has
   * to go.
   */
  getRun(runId?: string, sinceSeq?: number): Promise<{ summary: RunSummary; events: TraceEvent[] }>;
  listRuns(limit?: number): Promise<RunSummary[]>;
  exportRun(runId: string): Promise<Blob>;
}

export function createRunReads(d: RunReadsDeps): RunReads {
  async function getRun(runId?: string, sinceSeq = -1): Promise<{ summary: RunSummary; events: TraceEvent[] }> {
    const cur = d.recorder.current();
    if (!runId || runId === cur?.summary.runId) {
      if (!cur) throw d.notFound('no run has started in this tab');
      return { summary: cur.summary, events: d.recorder.eventsSince(sinceSeq) };
    }
    const stored = await d.history.get(runId);
    if (!stored) throw d.notFound(`no run with id "${runId}"`);
    return { summary: stored.summary, events: stored.events.filter(e => e.seq > sinceSeq) };
  }

  return {
    getRun,
    listRuns: limit => d.history.list(limit),
    /**
     * The whole run as JSON: the summary and every event `getRun` would show, which for a run
     * older than the trace cap is the summary and an empty list. It is deliberately the same
     * pair the report is built from, so a file a player sends on says exactly what they saw.
     */
    async exportRun(runId) {
      const run = await getRun(runId);
      return new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' });
    }
  };
}
