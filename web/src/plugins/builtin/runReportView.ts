// web/src/plugins/builtin/runReportView.ts -- one run, as a player reads it: what it ended as,
// what it added up to, where its time went, and the raw trace behind a toggle.
//
// The model is `tasks/runReport.ts`, which is pure and is where the reading of a trace is
// tested. This file is the renderer, and it owns the two things a model cannot do: putting text
// on the clipboard and handing the player a file.
import { UNTRUSTED_HEADER } from './traceView';
import { badge, h } from '../../ui/el';
import type { RunReport, TimelineEntry } from '../../tasks/runReport';
import type { RunSummary } from '../../tasks/types';

export interface RunReportOpts {
  /** Called with the report as text; the panel puts it on the clipboard. */
  copy(text: string): void;
  /** The run as a file. `TasksApi.exportRun` builds the blob; this view makes it a download. */
  exportRun(): Promise<Blob>;
  /** The export could not be built or saved. The panel toasts it. */
  onError(message: string): void;
  /**
   * Pops the raw trace out into the stage window (Task 16). The report used to mount it inline
   * behind a disclosure; a button that opens a window is not a disclosure, so `Show trace` became
   * `Open trace` and lost its `aria-expanded` and its host in the same commit.
   */
  openTrace(runId: string, scriptName: string | null): void;
  onClose?(): void;
}

const STATUS_TONE: Record<string, 'ok' | 'error' | 'neutral'> = { done: 'ok', failed: 'error', stopped: 'neutral' };

const secs = (ms: number): string => `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
const count = (n: number): string => n.toLocaleString();
const outcomeOf = (e: TimelineEntry): string => e.outcome ?? 'still running';

/**
 * The file name a player sees in their downloads: the script, the run, nothing to guess at.
 * Spec 3.5 names the file `run-<runId>.json`; a downloads folder is shared with every other
 * application on the machine and a run id is a bare opaque string, so the name is prefixed with
 * the product and the script it came from. The payload is exactly what the spec asks for.
 * Recorded as a deviation for Task 15 to fold into the spec.
 */
export function exportFileName(summary: RunSummary): string {
  return `idlescape-run-${summary.scriptId.replace(/[^a-z0-9-]+/gi, '-')}-${summary.runId}.json`;
}

/**
 * The report as text, for the clipboard. It carries the same header the trace copy does: what
 * follows is game text and a script's own log lines, so it is content, not instructions.
 */
export function reportText(summary: RunSummary, report: RunReport): string {
  const lines = [
    UNTRUSTED_HEADER,
    `${summary.scriptName} v${summary.version} (${summary.runId}) - ${summary.status}${report.failReason ? `: ${report.failReason}` : ''}`,
    `${secs(report.totals.durationMs)}, ${count(report.totals.tiles)} tiles travelled`
  ];
  const xp = Object.entries(report.totals.xp);
  if (xp.length) lines.push(`xp: ${xp.map(([skill, n]) => `${skill} +${count(n)}`).join(', ')}`);
  const items = Object.entries(report.totals.items);
  if (items.length) lines.push(`items: ${items.map(([id, n]) => `${id} ${n > 0 ? '+' : ''}${count(n)}`).join(', ')}`);
  const rec = Object.entries(report.recoveries);
  if (rec.length) lines.push(`recoveries: ${rec.map(([c, n]) => `${c} x${count(n ?? 0)}`).join(', ')}`);
  for (const e of report.timeline) lines.push(`- ${e.task}: ${secs(e.ms)}, ${outcomeOf(e)}, attempt ${e.attempts}`);
  if (report.droppedEvents > 0) lines.push(`${count(report.droppedEvents)} earlier events were dropped from the trace.`);
  return lines.join('\n');
}

/**
 * The blob reaches the player as a real download: this is the shell, not a sandboxed artifact,
 * so an `<a download>` works. The anchor goes into the document because a detached one is
 * ignored by some browsers, and the object URL is revoked on the next tick - revoking it in the
 * same task can beat the browser's own read of the href, and never revoking it pins the blob in
 * memory for the life of the page.
 */
async function download(opts: RunReportOpts, name: string): Promise<void> {
  let url: string | null = null;
  try {
    url = URL.createObjectURL(await opts.exportRun());
    const a = h('a', { href: url, download: name, class: 'hidden' });
    document.body.append(a);
    a.click();
    a.remove();
  } catch (e) {
    opts.onError(e instanceof Error ? e.message : String(e));
  } finally {
    if (url !== null) {
      const held = url;
      setTimeout(() => { URL.revokeObjectURL(held); }, 0);
    }
  }
}

/** One block of the stacked bar, sized as its share of the run and titled with the real numbers. */
function segment(entry: TimelineEntry, total: number): HTMLElement {
  const el = h('div', {
    class: 'report-seg', 'data-report-seg': entry.task, 'data-outcome': entry.outcome ?? 'open',
    title: `${entry.task}: ${secs(entry.ms)}, ${outcomeOf(entry)}`
  });
  // A share below a pixel still has to be findable, so every block keeps a floor.
  el.style.width = `${Math.max(total > 0 ? (entry.ms / total) * 100 : 0, 1)}%`;
  return el;
}

function stat(label: string, value: string): HTMLElement {
  return h('div', { class: 'report-stat' },
    h('span', { class: 'report-stat-label' }, label),
    h('span', { class: 'report-stat-value' }, value));
}

/**
 * Spec 3.5 asks the totals for XP by skill, not for one number. A run that trained two skills
 * reads as two stats; a run that trained none still shows the column, so the row does not change
 * shape between runs. The clipboard copy carries the same breakdown, but this is the screen and
 * the screen is where a player actually looks.
 */
function xpStats(xp: Record<string, number>): HTMLElement[] {
  const entries = Object.entries(xp);
  if (!entries.length) return [stat('XP', '0')];
  return entries.map(([skill, n]) => stat(`${skill} XP`, count(n)));
}

function totalsRow(report: RunReport): HTMLElement {
  const items = Object.values(report.totals.items).reduce((n, v) => n + v, 0);
  return h('div', { class: 'report-totals', 'data-report-totals': '' },
    stat('Time', secs(report.totals.durationMs)),
    ...xpStats(report.totals.xp),
    stat('Items', `${items > 0 ? '+' : ''}${count(items)}`),
    stat('Tiles', count(report.totals.tiles)));
}

function recoveryRow(report: RunReport): HTMLElement | null {
  const entries = Object.entries(report.recoveries);
  if (!entries.length) return null;
  return h('div', { class: 'report-recoveries', 'data-report-recoveries': '' },
    ...entries.map(([condition, n]) => badge(`${condition} x${count(n ?? 0)}`, 'warn')));
}

export function renderRunReport(summary: RunSummary, report: RunReport, opts: RunReportOpts): HTMLElement {
  const total = report.timeline.reduce((n, e) => n + e.ms, 0);
  return h('div', { class: 'report', 'data-report': summary.runId },
    h('div', { class: 'report-head' },
      h('span', { class: 'report-name' }, `${summary.scriptName} v${summary.version}`),
      badge(summary.status, STATUS_TONE[summary.status] ?? 'neutral'),
      report.failReason ? badge(report.failReason, 'error') : null,
      opts.onClose ? h('button', { class: 'btn btn-outline', type: 'button', 'data-report-close': '', onclick: () => opts.onClose?.() }, 'Close') : null),
    totalsRow(report),
    recoveryRow(report),
    report.timeline.length
      ? h('div', { class: 'report-bar', 'data-report-timeline': '' }, ...report.timeline.map(e => segment(e, total)))
      : null,
    h('div', { class: 'report-rows' }, ...report.timeline.map(e => h('div', {
      class: 'report-row', 'data-report-row': e.task, 'data-outcome': e.outcome ?? 'open'
    }, `${e.task} - ${secs(e.ms)} - ${outcomeOf(e)} - attempt ${e.attempts}`))),
    report.droppedEvents > 0
      ? h('div', { class: 'report-dropped' }, `${count(report.droppedEvents)} earlier events were dropped from the trace.`)
      : null,
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', 'data-report-copy': '', onclick: () => opts.copy(reportText(summary, report)) }, 'Copy for Claude'),
      h('button', { class: 'btn', type: 'button', 'data-report-export': '', onclick: () => void download(opts, exportFileName(summary)) }, 'Export'),
      h('button', {
        class: 'btn btn-outline', type: 'button', 'data-report-trace': '',
        onclick: () => opts.openTrace(summary.runId, summary.scriptName)
      }, 'Open trace')));
}
