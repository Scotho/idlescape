// A run, as a reader wants it: what it did in order, and what it added up to. Pure, so the
// panel is a renderer and this is the thing that is actually tested.
//
// The totals come from the summary rather than from the trace, because history keeps 200
// summaries and only 50 traces (spec decision 6): a report for an older run has to be honest
// with no events at all.
import type { FailReason, HealthCondition, RunSummary, TraceEvent } from './types';

export interface TimelineEntry {
  task: string; startedAt: number; ms: number;
  outcome: 'ok' | 'failed' | 'timeout' | 'aborted' | null; attempts: number;
}

export interface RunReport {
  totals: { durationMs: number; xp: Record<string, number>; items: Record<number, number>; tiles: number };
  timeline: TimelineEntry[];
  recoveries: Partial<Record<HealthCondition, number>>;
  failReason?: FailReason;
  droppedEvents: number;
}

/**
 * When the run stopped, for a task that was still in flight. `endedAt` is null while the run is
 * live, and the summary's own duration is the only clock the report has then.
 */
const endOf = (s: RunSummary): number => s.endedAt ?? s.startedAt + s.durationMs;

export function buildRunReport(summary: RunSummary, events: TraceEvent[]): RunReport {
  const timeline: TimelineEntry[] = [];
  let open: TimelineEntry | null = null;
  let droppedEvents = 0;

  for (const e of events) {
    if (e.kind === 'truncated') { droppedEvents += e.dropped; continue; }
    if (e.kind === 'task_enter') {
      open = { task: e.task, startedAt: e.at, ms: 0, outcome: null, attempts: 0 };
      timeline.push(open);
      continue;
    }
    // A visit is not closed by its exit. `runner.ts` pushes `task_enter` only when the task name
    // changes, so a script looping on one task reports one enter and an exit per lap: taking the
    // first exit as the whole visit would show half an hour of chopping as four seconds. The
    // laps add up, and the last one is what the visit ended as.
    if (e.kind === 'task_exit' && open && open.task === e.task) {
      open.ms += e.ms;
      open.outcome = e.outcome;
      open.attempts = Math.max(open.attempts, e.attempts);
    }
  }
  // A task the run was still inside when it ended has no exit event at all; give it the rest of
  // the run rather than a zero-width bar, which would read as "it did nothing". A visit that did
  // report an exit keeps its own measured time: the gap after its last lap is the runner picking
  // the next task, not this one working.
  if (open && open.outcome === null) open.ms = Math.max(0, endOf(summary) - open.startedAt);

  return {
    totals: {
      durationMs: summary.durationMs,
      xp: { ...summary.xpGained },
      items: { ...summary.itemsDelta },
      tiles: summary.tilesTravelled
    },
    timeline,
    recoveries: { ...summary.recoveries },
    ...(summary.failReason === undefined ? {} : { failReason: summary.failReason }),
    droppedEvents
  };
}
