// web/src/plugins/builtin/tasksHistory.ts -- the panel's history, report and trace block.
//
// Lifted out of `builtin/tasks.ts` unchanged when that file reached 399 lines, one under the
// ceiling. It owns the run list, the report a history row opens, the live trace rows merged into
// that report, the frozen clock a finished run reads, and the last few health checks the run card
// shows. The panel keeps the run card, My scripts and the snippet, and composes this.
import { fmtElapsed, type HealthNote, type RunStep } from './tasksViews';
import { renderRunReport } from './runReportView';
import { buildRunReport } from '../../tasks/runReport';
import { empty, h } from '../../ui/el';
import { dot, type DotTone } from '../../ui/parts';
import type { TasksApi } from '../../tasks/api';
import type { RunStatus, RunSummary, TraceEvent } from '../../tasks/types';

/** A run in one of these states is over: nothing about it moves again. */
export const TERMINAL = new Set<RunStatus['state']>(['done', 'failed', 'stopped']);
/** How many health checks the run card keeps. The whole list is in the trace, one click away. */
const HEALTH_NOTES = 5;
/**
 * How many entered tasks the run card's quest-step row shows. The row is a breadcrumb of where
 * the run has just been, not its history: a script that loops through four tasks would otherwise
 * grow the row until the card scrolled. The whole list is in the trace and in the run report.
 */
const STEP_TRAIL = 4;

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * How a finished run ended, as the mock's 7px dot: green for done, red for failed, and the idle
 * grey for a run the player stopped, which did not go wrong. `stopped` therefore names no tone.
 */
const HISTORY_DOT: Record<string, DotTone> = { done: 'ok', failed: 'error' };

/** An hour in milliseconds: the numerator of the rate a finished row reports. */
const HOUR_MS = 3_600_000;
/** The mock's history dot, which is a pixel smaller than the family's own 8px default. */
const DOT_PX = 7;

/**
 * What the run earned an hour, or null when there is nothing honest to divide by: a row seeded
 * at run start has no duration yet, and a run that earned nothing has no rate worth a column.
 */
function xpPerHour(summary: RunSummary, xp: number): number | null {
  if (summary.durationMs <= 0 || xp <= 0) return null;
  return Math.round((xp * HOUR_MS) / summary.durationMs);
}

/**
 * One finished run: how it ended, how long it took, what it earned and at what rate, why it went
 * wrong if it did, and a way into its report. `data-trace-open` is the e2e's hook and keeps its
 * name; the label says what the button now opens, which is the report with the raw trace one
 * click further in.
 *
 * The status and the fail reason were two badges under SP4b. The mock's row has no badge at all:
 * the dot carries the outcome and the meta line carries the reason ("02:15 · 0 xp · no fishing
 * spot in range"), so both move rather than either being dropped.
 */
export function renderHistoryRow(summary: RunSummary, onOpenReport: () => void): HTMLElement {
  const xp = Object.values(summary.xpGained ?? {}).reduce((n, v) => n + v, 0);
  const rate = xpPerHour(summary, xp);
  const meta = [
    fmtElapsed(summary.durationMs),
    `${xp.toLocaleString()} xp`,
    ...(rate === null ? [] : [`${rate.toLocaleString()} xp/h`]),
    ...(summary.failReason ? [summary.failReason] : []),
    ...(summary.summary ? [summary.summary] : [])
  ];
  return h('div', { class: 'history-row', 'data-history-row': summary.runId },
    dot(HISTORY_DOT[summary.status] ?? 'idle', { size: DOT_PX }),
    h('span', { class: 'history-body' },
      h('b', { class: 'history-name' }, summary.scriptName),
      h('span', { class: 'history-meta', 'data-history-meta': '' }, meta.join(' · '))),
    h('button', { class: 'btn btn-outline btn-xs', type: 'button', 'data-trace-open': summary.runId, onclick: () => onOpenReport() }, 'Open report')
  );
}


export interface HistorySectionDeps {
  api(): TasksApi;
  notify(message: string, kind?: 'info' | 'error'): void;
  /** The report's Open trace: the raw trace is a window over the stage now, not a block here. */
  openTrace(runId: string, scriptName: string | null): void;
  /** Repaint the run card: a history row's duration and a health note both change what it says. */
  renderRun(): void;
  refreshScripts(): Promise<void>;
}

export interface HistorySection {
  historyHost: HTMLElement;
  reportHost: HTMLElement;
  /** The last few health checks of the run on screen, for the run card. */
  notes(): HealthNote[];
  /**
   * The run card's quest steps, derived from the `task_enter` trace: everything before the last
   * one is done and the last one is current. No live run can report an `upcoming` step, because
   * the executable script lives in the Worker and the api narrows the library to manifests on
   * purpose (`tasks/api.ts`: "the api never needs a script's `tasks`"). Plan ruling R29.
   */
  steps(): RunStep[];
  /** The history row's button: open one run's report, or close it if it is the one on screen. */
  openReport(runId: string): Promise<void>;
  refresh(): Promise<void>;
  onEvent(e: TraceEvent): void;
  /** A tab switch: close the open report and drop the previous character's checks. */
  reset(): void;
  /** How long a finished run took, by runId, as its history row reports it (the frozen clock). */
  clockFor(status: RunStatus): number;
}

export function createHistorySection(deps: HistorySectionDeps): HistorySection {
  const historyHost = h('div', { class: 'stack-tight' });
  const reportHost = h('div', { class: 'stack-tight' });

  let openReport: string | null = null;
  /** How long a finished run took, by `runId`, as its history row reports it. */
  const durations = new Map<string, number>();
  /** The fallback clock for a run that ended with no history row yet: `runId` to the end time. */
  const frozen = new Map<string, number>();
  /**
   * The last few health checks of the run on screen, newest last. They exist only in the trace,
   * which arrives event by event, so the card cannot read them back from `RunStatus`.
   */
  let notes: HealthNote[] = [];
  /** The tasks this run has entered, oldest first, capped at `STEP_TRAIL`. */
  let entered: string[] = [];
  /** True once `run_done` has been seen: the last task is no longer the current one. */
  let finished = false;

  const fail = (e: unknown): void => deps.notify(messageOf(e), 'error');

  /**
   * A finished run must stop counting: `RunStatus` keeps `startedAt` after the run ends and
   * never carries an end time, so the clock freezes here, at the duration the run's history
   * row reports once `refresh` has it, and otherwise at the moment the end was seen.
   */
  function clockFor(status: RunStatus): number {
    if (!TERMINAL.has(status.state) || status.runId === null) return Date.now();
    const summary = durations.get(status.runId);
    if (summary !== undefined && status.startedAt !== null) return status.startedAt + summary;
    const at = frozen.get(status.runId) ?? Date.now();
    frozen.set(status.runId, at);
    return at;
  }

  function closeReport(): void { openReport = null; reportHost.replaceChildren(); }

  /**
   * A run as a player reads it, in the panel. The raw trace behind it is a window over the stage
   * since Task 16, so the report's own button hands the run id up rather than mounting anything:
   * a run older than the trace cap has no events at all, and the report is built from the summary
   * either way. Pressing the row that opened the report closes it again.
   */
  async function openReportFor(runId: string): Promise<void> {
    if (openReport === runId) { closeReport(); return; }
    const api = deps.api();
    const run = await api.getRun(runId).catch(e => { fail(e); return null; });
    if (!run) return;
    openReport = runId;
    reportHost.replaceChildren(renderRunReport(run.summary, buildRunReport(run.summary, run.events), {
      copy: text => {
        void navigator.clipboard?.writeText(text)
          .then(() => deps.notify('Copied; paste it into your Claude session.'))
          .catch(() => deps.notify('Could not reach the clipboard.', 'error'));
      },
      exportRun: () => api.exportRun(runId),
      onError: message => deps.notify(message, 'error'),
      openTrace: deps.openTrace,
      onClose: closeReport
    }));
  }

  async function refresh(): Promise<void> {
    const runs = await deps.api().listRuns(20).catch(() => []);
    // Only a run that has actually ended has a duration; a live row still reads 0.
    for (const run of runs) if (run.endedAt !== null) durations.set(run.runId, run.durationMs);
    historyHost.replaceChildren(...(runs.length
      ? runs.map(run => renderHistoryRow(run, () => void openReportFor(run.runId)))
      : [empty('Runs you start show up here, newest first.')]));
    // A run that ended before the panel opened takes its clock from the row just loaded.
    deps.renderRun();
  }

  function onEvent(e: TraceEvent): void {
    // Live trace rows go to the pop-out window, which owns its own element (Task 16, ruling R13).
    // The report in the panel is a finished reading of a run and does not grow under the player.
    // A new run starts with a clean sheet; the finished one keeps its checks in its own trace.
    if (e.kind === 'run_started') { notes = []; entered = []; finished = false; }
    if (e.kind === 'task_enter') {
      entered = [...entered, e.task].slice(-STEP_TRAIL);
      finished = false;
      deps.renderRun();
    }
    if (e.kind === 'health' || e.kind === 'recovery') {
      notes = [...notes, e].slice(-HEALTH_NOTES);
      deps.renderRun();
    }
    if (e.kind === 'run_done') {
      // The run's own list, which outlives the trail the panel was keeping, and every step of a
      // finished run is done: leaving the last one `current` would draw a pulsing marker over a
      // run that stopped.
      if (e.tasksEntered.length) entered = e.tasksEntered.slice(-STEP_TRAIL);
      finished = true;
      void refresh();
      void deps.refreshScripts();
    }
  }

  return {
    historyHost,
    reportHost,
    notes: () => notes,
    steps: () => entered.map((label, i) => ({
      label,
      state: !finished && i === entered.length - 1 ? 'current' : 'done'
    })),
    openReport: openReportFor,
    refresh,
    onEvent,
    reset() { closeReport(); notes = []; entered = []; finished = false; },
    clockFor
  };
}
