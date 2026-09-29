import { expect, test } from 'vitest';
import { buildRunReport } from './runReport';
import { createTrace, type TraceInput } from './trace';
import type { RunSummary, TraceEvent } from './types';

let seq = 0;
// A row as `Trace.push` takes it. `Omit` does not distribute over a union, so the
// `Omit<TraceEvent, 'seq' | 'at'>` this helper used to declare collapsed to the one member every
// arm shares, `kind`, and every fixture below was an excess-property error the moment the tests
// joined a typechecked program. `TraceInput` is the distributive form the production trace has
// always used, and reusing it retires the `as TraceEvent` that was hiding the drift. Audit C16.
const ev = (at: number, e: TraceInput): TraceEvent => ({ ...e, seq: ++seq, at });
const summary = (patch: Partial<RunSummary> = {}): RunSummary => ({
  runId: 'r1', scriptId: 's', scriptName: 'S', version: 1, source: 'library', startedBy: 'player',
  characterId: null, characterName: null, params: {}, status: 'done', startedAt: 0, endedAt: 10_000,
  durationMs: 10_000, xpGained: { Woodcutting: 120 }, itemsDelta: { 1511: 4 }, tilesTravelled: 37,
  recoveries: { 'dialog-stuck': 2 }, lastTask: 'chop', summary: 'done', ...patch
});

test('the timeline is one entry per task visit, with its duration and attempts', () => {
  const report = buildRunReport(summary(), [
    ev(0, { kind: 'task_enter', task: 'chop' }),
    ev(4000, { kind: 'task_exit', task: 'chop', outcome: 'ok', attempts: 1, ms: 4000 })
  ]);
  expect(report.timeline).toEqual([{ task: 'chop', startedAt: 0, ms: 4000, outcome: 'ok', attempts: 1 }]);
});

test('two visits to the same task are two entries, not one merged row', () => {
  const report = buildRunReport(summary(), [
    ev(0, { kind: 'task_enter', task: 'chop' }),
    ev(1000, { kind: 'task_exit', task: 'chop', outcome: 'ok', attempts: 1, ms: 1000 }),
    ev(2000, { kind: 'task_enter', task: 'chop' }),
    ev(3000, { kind: 'task_exit', task: 'chop', outcome: 'failed', attempts: 1, ms: 1000 })
  ]);
  expect(report.timeline).toHaveLength(2);
  expect(report.timeline[1].outcome).toBe('failed');
  expect(report.timeline[1].startedAt).toBe(2000);
});

/**
 * The shape the runner actually produces. `runner.ts` pushes `task_enter` only when the task
 * name *changes* (`if (lastTask !== t.name)`), so a script looping on one task emits one enter
 * and one exit per lap. A visit that took each exit as its whole duration would report a
 * half-hour of chopping as the four seconds of its first lap.
 */
test('a task looped by the runner sums its laps into one visit', () => {
  const report = buildRunReport(summary({ durationMs: 12_000, endedAt: 12_000 }), [
    ev(0, { kind: 'task_enter', task: 'chop' }),
    ev(4000, { kind: 'task_exit', task: 'chop', outcome: 'ok', attempts: 1, ms: 4000 }),
    // The lap it had to retry twice: `attempts` is the peak the visit reached, which is not the
    // same number as the last lap's, so a report that just kept the last one is caught here.
    ev(8000, { kind: 'task_exit', task: 'chop', outcome: 'failed', attempts: 3, ms: 4000 }),
    ev(11_000, { kind: 'task_exit', task: 'chop', outcome: 'ok', attempts: 1, ms: 3000 })
  ]);
  expect(report.timeline).toEqual([
    { task: 'chop', startedAt: 0, ms: 11_000, outcome: 'ok', attempts: 3 }
  ]);
});

test('a visit ends where the next task begins, even with a lap still unreported', () => {
  const report = buildRunReport(summary(), [
    ev(0, { kind: 'task_enter', task: 'chop' }),
    ev(1000, { kind: 'task_exit', task: 'chop', outcome: 'ok', attempts: 1, ms: 1000 }),
    ev(2000, { kind: 'task_enter', task: 'drop' }),
    ev(3000, { kind: 'task_exit', task: 'drop', outcome: 'ok', attempts: 1, ms: 1000 })
  ]);
  expect(report.timeline.map(e => e.task)).toEqual(['chop', 'drop']);
  expect(report.timeline[0].ms).toBe(1000);
});

test('a task that never exited is still on the timeline, running to the end of the run', () => {
  const report = buildRunReport(summary({ endedAt: 9000 }), [ev(1000, { kind: 'task_enter', task: 'chop' })]);
  expect(report.timeline).toEqual([{ task: 'chop', startedAt: 1000, ms: 8000, outcome: null, attempts: 0 }]);
});

test('a run still going takes its open task up to startedAt plus the duration so far', () => {
  const report = buildRunReport(summary({ endedAt: null, startedAt: 1000, durationMs: 5000 }), [
    ev(2000, { kind: 'task_enter', task: 'chop' })
  ]);
  expect(report.timeline[0].ms).toBe(4000);
});

test('an exit for a task nothing entered is ignored rather than inventing a row', () => {
  const report = buildRunReport(summary(), [
    ev(1000, { kind: 'task_exit', task: 'ghost', outcome: 'ok', attempts: 1, ms: 1000 })
  ]);
  expect(report.timeline).toEqual([]);
});

test('an exit naming a different task does not land on the visit that is open', () => {
  const report = buildRunReport(summary({ endedAt: 6000 }), [
    ev(0, { kind: 'task_enter', task: 'chop' }),
    ev(1000, { kind: 'task_exit', task: 'ghost', outcome: 'failed', attempts: 9, ms: 1000 })
  ]);
  expect(report.timeline).toEqual([{ task: 'chop', startedAt: 0, ms: 6000, outcome: null, attempts: 0 }]);
});

test('totals come from the summary, which is what history stores once the trace is gone', () => {
  const report = buildRunReport(summary(), []);
  expect(report.totals).toMatchObject({ durationMs: 10_000, xp: { Woodcutting: 120 }, items: { 1511: 4 }, tiles: 37 });
  expect(report.recoveries).toEqual({ 'dialog-stuck': 2 });
});

test('the totals are copies, so a reader cannot write back into the stored summary', () => {
  const stored = summary();
  const report = buildRunReport(stored, []);
  report.totals.xp.Woodcutting = 1;
  report.totals.items[1511] = 1;
  report.recoveries['dialog-stuck'] = 9;
  expect(stored.xpGained).toEqual({ Woodcutting: 120 });
  expect(stored.itemsDelta).toEqual({ 1511: 4 });
  expect(stored.recoveries).toEqual({ 'dialog-stuck': 2 });
});

test('a fail reason is carried through, and is absent on a run that ended well', () => {
  expect(buildRunReport(summary({ failReason: 'died' }), []).failReason).toBe('died');
  expect('failReason' in buildRunReport(summary(), [])).toBe(false);
});

// Driven from a real capped trace rather than a hand-built `truncated` row, and through the
// same seq-keyed buffer the recorder keeps: a marker that never reaches a subscriber never
// reaches IndexedDB or the export either, so a fixture that invents one proves nothing about
// what a reader will actually see.
test('a truncated trace reports how many events it lost', () => {
  const trace = createTrace({ cap: 10 });
  const buffer = new Map<number, TraceEvent>();
  trace.onEvent(e => buffer.set(e.seq, e));
  for (let i = 0; i < 40; i++) trace.push({ kind: 'status', text: String(i) });
  const report = buildRunReport(summary(), [...buffer.values()]);
  // Ten rows survive the cap, one of them the marker; the other 31 status rows are gone.
  expect(report.droppedEvents).toBe(31);
});

test('a run with no events produces an empty timeline rather than throwing', () => {
  expect(buildRunReport(summary(), []).timeline).toEqual([]);
  expect(buildRunReport(summary(), []).droppedEvents).toBe(0);
});
