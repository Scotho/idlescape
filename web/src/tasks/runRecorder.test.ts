// The recorder's buffer against the trace it mirrors.
//
// The source here is the real `createTrace()`, not a fake: the whole defect this pins is a
// disagreement between the two caps, and a fake trace that dropped nothing (or dropped on
// different terms) could not show it.
import { describe, expect, test } from 'vitest';
import { createRunRecorder } from './runRecorder';
import { createTrace } from './trace';
import type { RunHistory } from './history';
import type { RunSummary, TraceEvent } from './types';
import type { WorkerHost } from '../agent/workerHost';

const RUN_ID = 'r1';

function summary(): RunSummary {
  return {
    runId: RUN_ID, scriptId: 's', scriptName: 'S', startedBy: 'player', startedAt: 1,
    status: 'running', summary: '', xp: {}, itemsDelta: {}, tasks: []
  } as unknown as RunSummary;
}

function setup() {
  const traceSubs = new Set<(e: TraceEvent) => void>();
  const endSubs = new Set<(x: { runId: string; summary: RunSummary }) => void>();
  const put: { events: TraceEvent[] }[] = [];
  const appended: TraceEvent[] = [];
  const history = {
    put: async (_s: RunSummary, events: TraceEvent[]) => { put.push({ events }); },
    appendEvents: async (_id: string, events: TraceEvent[]) => { appended.push(...events); },
    list: async () => [], get: async () => null, clear: async () => {}
  } as unknown as RunHistory;
  const host = {
    onTrace: (cb: (e: TraceEvent) => void) => { traceSubs.add(cb); return () => { traceSubs.delete(cb); }; },
    onRunEnd: (cb: (x: { runId: string; summary: RunSummary }) => void) => { endSubs.add(cb); return () => { endSubs.delete(cb); }; }
  } as unknown as Pick<WorkerHost, 'onTrace' | 'onRunEnd'>;

  const trace = createTrace();
  // The Worker's own wiring: every trace row crosses postMessage and arrives at the recorder.
  trace.onEvent(e => { for (const cb of [...traceSubs]) cb(e); });

  const recorder = createRunRecorder({
    host, history,
    store: { setLastRun: async () => {} },
    onEvent: () => {}, onChanged: () => {}, now: () => 2
  });
  recorder.begin(summary(), null);
  return { trace, recorder, put, appended, end: () => { for (const cb of [...endSubs]) cb({ runId: RUN_ID, summary: summary() }); } };
}

describe('runRecorder buffer', () => {
  test('holds exactly what the trace holds once the trace has started dropping', () => {
    const { trace, recorder } = setup();
    trace.push({ kind: 'run_started', runId: RUN_ID, scriptId: 's', version: 1, params: {}, startedBy: 'player' });
    // 200 past the 5000 cap, so the trace has trimmed and is fanning out a truncated marker.
    for (let i = 0; i < 5200; i++) trace.push({ kind: 'log', level: 'info', text: `line ${i}` });

    const held = recorder.eventsSince(0);
    expect(held.length).toBe(5000);
    expect(held.map(e => e.seq).sort((a, b) => a - b)).toEqual(trace.events().map(e => e.seq).sort((a, b) => a - b));

    // The marker survives the recorder's own trim and still agrees with the trace.
    const marker = held.find(e => e.kind === 'truncated');
    expect(marker).toMatchObject({ kind: 'truncated', dropped: 202 });
    // The head of the run survives too, and the oldest ordinary lines are the ones that went.
    expect(held.some(e => e.kind === 'run_started')).toBe(true);
    expect(held.some(e => e.kind === 'log' && e.text === 'line 0')).toBe(false);
    expect(held.some(e => e.kind === 'log' && e.text === 'line 5199')).toBe(true);
  });

  test('writes the trimmed buffer to history at run end, not every row the run ever produced', () => {
    const { trace, recorder, put, end } = setup();
    trace.push({ kind: 'run_started', runId: RUN_ID, scriptId: 's', version: 1, params: {}, startedBy: 'player' });
    for (let i = 0; i < 5200; i++) trace.push({ kind: 'log', level: 'info', text: `line ${i}` });
    put.length = 0;
    end();
    expect(put).toHaveLength(1);
    expect((put[0] as { events: TraceEvent[] }).events).toHaveLength(5000);
    void recorder;
  });

  test('a run shorter than the cap keeps every row', () => {
    const { trace, recorder } = setup();
    trace.push({ kind: 'run_started', runId: RUN_ID, scriptId: 's', version: 1, params: {}, startedBy: 'player' });
    for (let i = 0; i < 40; i++) trace.push({ kind: 'log', level: 'info', text: `line ${i}` });
    const held = recorder.eventsSince(0);
    expect(held).toHaveLength(41);
    expect(held.some(e => e.kind === 'truncated')).toBe(false);
    expect(held.some(e => e.kind === 'log' && e.text === 'line 0')).toBe(true);
  });

  test('the flush cursor keeps up, so a trimmed buffer still appends only what is new', () => {
    const { trace, recorder, appended } = setup();
    trace.push({ kind: 'run_started', runId: RUN_ID, scriptId: 's', version: 1, params: {}, startedBy: 'player' });
    for (let i = 0; i < 5200; i++) trace.push({ kind: 'log', level: 'info', text: `line ${i}` });
    // Every row the run produced reached IndexedDB, and the marker is the ONLY row sent more
    // than once. Without that exemption the cursor is dragged back to the marker on every
    // event past the cap and the tail behind it is re-sent every fifty events for the rest of
    // the run, which is thousands of rows an hour of pure re-writing.
    const ordinary = appended.filter(e => e.kind !== 'truncated').map(e => e.seq);
    expect(new Set(ordinary).size).toBe(ordinary.length);
    expect(ordinary[0]).toBe(1);
    expect(ordinary).toEqual([...ordinary].sort((a, b) => a - b));
    // Every seq the trace ever minted, except the last partial flush, reached the store.
    expect(ordinary.length).toBeGreaterThanOrEqual(5150);
    void recorder;
  });
});
