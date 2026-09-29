// What the Worker hands back to the host, as plain data: the live status, the row history keeps,
// the one-line run summary, the compact snapshot a trace row carries, and a script's manifest
// with everything `postMessage` cannot clone removed. It sits out of `worker.ts`, which is about
// the message loop and the run lifecycle; nothing here reads the Worker's state.
import type { Trace } from '../tasks/trace';
import type { RunStatusLite } from '../tasks/runner';
import type {
  Actor, FailReason, HealthCondition, ParamValues, RunOutcome, RunStatus, RunSummary, Script,
  ScriptContext, ScriptManifest
} from '../tasks/types';
import type { WorkerStatus, WorldState } from './types';

/** An hour, in milliseconds: the numerator of every xp rate the banner and the card show. */
const HOUR_MS = 3_600_000;

/** The run in flight, as `liveStatus` reads it. The Worker's own `Current` satisfies this. */
export interface LiveRun {
  runId: string; startedAt: number;
  script: { id: string; name: string };
  health: { health: ScriptContext['health'] };
}

export interface LiveStatusDeps {
  statusLine: string;
  /** The last `target` trace event, kept by the Worker across tasks. */
  target: RunStatus['target'];
  run: LiveRun | null;
  trace: Trace | null;
  now: number;
}

/**
 * The status the host paints the banner and the run card from: the runner's own half, plus the
 * three things only the Worker can see. The runner produces `RunStatusLite` and can reach
 * neither the health monitor nor the trace, so it is this side that fills them.
 */
export function liveStatus(s: RunStatusLite, d: LiveStatusDeps): WorkerStatus {
  // Floored at one millisecond: a status posted in the same millisecond the run started would
  // otherwise divide by zero and report an infinite rate.
  const elapsedMs = Math.max(1, d.run ? d.now - d.run.startedAt : 1);
  const xpPerHour: Record<string, number> = {};
  for (const [skill, xp] of Object.entries(d.trace?.xpGained() ?? {})) {
    xpPerHour[skill] = Math.round((xp * HOUR_MS) / elapsedMs);
  }
  const monitor = d.run?.health.health ?? null;
  const event = monitor?.last() ?? null;
  return {
    ...s, statusLine: d.statusLine, target: d.target, xpPerHour,
    // `last()` is the last condition the monitor ever saw; `is()` is whether it is still the one
    // being recovered. Without the second the pip would stay lit for the rest of the run.
    health: event && monitor?.is(event.condition) === true ? { condition: event.condition, since: event.at } : null,
    runId: d.run?.runId ?? null, scriptId: d.run?.script.id ?? null, scriptName: d.run?.script.name ?? null
  };
}

/** The run that has just ended, as `endSummary` reads it. The Worker's own `Current` satisfies it. */
export interface EndedRun {
  runId: string; startedAt: number;
  script: { id: string; name: string; version: number };
  source: 'library' | 'user'; startedBy: Actor; params: ParamValues;
  characterId: string | null; characterName: string | null;
  /**
   * The context the run executed in. `tiles()` is the count `c.travel` added to over the whole
   * run, and it is read off the context itself rather than through an accessor the Worker copied
   * out, so there is no second place for the two to disagree.
   */
  context: { tiles(): number };
  health: { counts(): Partial<Record<HealthCondition, number>> };
}

/**
 * The row history keeps. Every field is either the run's own identity, which the `run` message
 * carried, or a total the trace has already counted, so it is assembled here rather than in the
 * message loop. `failReason` is omitted rather than set to null: a run that ended well has no
 * reason, and `RunSummary` says so by making it the one optional field.
 */
export function endSummary(
  run: EndedRun, t: Trace, outcome: RunOutcome,
  d: { at: number; lastTask: string | null; failReason: FailReason | null }
): RunSummary {
  const durationMs = d.at - run.startedAt;
  return {
    runId: run.runId, scriptId: run.script.id, scriptName: run.script.name, version: run.script.version,
    source: run.source, startedBy: run.startedBy, characterId: run.characterId,
    characterName: run.characterName, params: run.params,
    status: outcome, startedAt: run.startedAt, endedAt: d.at, durationMs,
    xpGained: t.xpGained(), lastTask: d.lastTask, summary: summarise(outcome, t, durationMs),
    itemsDelta: t.itemsDelta(), tilesTravelled: run.context.tiles(), recoveries: run.health.counts(),
    ...(d.failReason === null ? {} : { failReason: d.failReason })
  };
}

export function summarise(outcome: RunOutcome, t: Trace, durationMs: number): string {
  const parts = [`${outcome} after ${Math.max(1, Math.round(durationMs / 1000))}s`];
  const tasks = t.tasksEntered();
  if (tasks.length) parts.push(`${tasks.length} task${tasks.length === 1 ? '' : 's'}`);
  for (const [skill, xp] of Object.entries(t.xpGained())) parts.push(`+${xp} ${skill} xp`);
  return parts.join(', ');
}

/** The compact snapshot of spec 8.1: enough to see where the character was, not the whole world. */
export function compact(s: WorldState | null): unknown {
  if (!s) return null;
  return {
    tick: s.tick, player: s.player, skills: s.skills, inventory: s.inventory?.length ?? 0,
    tutorial: s.tutorial, hint: s.hint
  };
}

/** The manifest without anything that cannot be structured-cloned. */
export function manifestOf(s: Script): ScriptManifest {
  return {
    id: s.id, name: s.name, version: s.version, description: s.description, tags: s.tags,
    author: s.author, order: s.order, params: s.params,
    // `custom` requirements hold a predicate, which cannot be structured-cloned: the main
    // thread sees the declarative ones (and checks those before a run), while the Worker
    // evaluates the whole list, `custom` included, in `startRun`.
    requires: s.requires?.filter(r => r.kind !== 'custom'),
    stuckAfterMs: s.stuckAfterMs, maxAttempts: s.maxAttempts, hardStop: s.hardStop,
    estimateMinutes: s.estimateMinutes, health: s.health, anchor: s.anchor
  };
}
