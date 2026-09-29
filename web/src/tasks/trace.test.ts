import { describe, expect, test } from 'vitest';
import { createTrace } from './trace';

describe('createTrace', () => {
  test('numbers events and serves a tail by seq', () => {
    const t = createTrace();
    t.push({ kind: 'status', text: 'a' }); t.push({ kind: 'status', text: 'b' });
    expect(t.events().map(e => e.seq)).toEqual([1, 2]);
    expect(t.events(1).map(e => (e as { text: string }).text)).toEqual(['b']);
  });
  test('coalesces xp and item deltas within 10 s', () => {
    let now = 1000; const t = createTrace({ now: () => now });
    t.push({ kind: 'xp', skill: 'Woodcutting', delta: 25 }); now += 3000;
    t.push({ kind: 'xp', skill: 'Woodcutting', delta: 25 }); now += 20_000;
    t.push({ kind: 'xp', skill: 'Woodcutting', delta: 25 });
    t.push({ kind: 'item', id: 1511, delta: 1 }); t.push({ kind: 'item', id: 1511, delta: 1 });
    expect(t.events().filter(e => e.kind === 'xp')).toHaveLength(2);
    expect(t.xpGained()).toEqual({ Woodcutting: 75 });
    expect(t.itemsDelta()).toEqual({ 1511: 2 });
  });
  test('caps with a truncated marker and keeps run_started', () => {
    const t = createTrace({ cap: 5 });
    t.push({ kind: 'run_started', runId: 'r', scriptId: 's', version: 1, params: {}, startedBy: 'test' });
    for (let i = 0; i < 10; i++) t.push({ kind: 'status', text: String(i) });
    const ev = t.events();
    expect(ev[0].kind).toBe('run_started');
    expect(ev[1]).toMatchObject({ kind: 'truncated' });
    expect(ev.length).toBeLessThanOrEqual(6);
    expect(t.tasksEntered()).toEqual([]);
  });
  // The defect this fixes: the marker used to be spliced into the list and never emitted, so
  // nothing downstream could ever see one. Nothing reads `events()` in production - the Worker
  // copies the fan-out across `postMessage`, the recorder buffers what it hears, and that is
  // what reaches IndexedDB and the exported file - so a report claiming dropped events could
  // only ever say zero.
  test('the truncation marker is fanned out to subscribers, not only spliced into the list', () => {
    const t = createTrace({ cap: 10 });
    const heard: { seq: number; dropped: number }[] = [];
    t.onEvent(e => { if (e.kind === 'truncated') heard.push({ seq: e.seq, dropped: e.dropped }); });
    for (let i = 0; i < 40; i++) t.push({ kind: 'status', text: String(i) });
    expect(heard.length).toBeGreaterThan(0);
    // 40 rows into a cap of 10 leaves ten, one of which is the marker itself, so nine status
    // rows survive and the other 31 were dropped.
    expect(heard.at(-1)).toEqual({ seq: heard[0].seq, dropped: 31 });
  });

  // A consumer as the real ones are: one row per seq, replaced on a re-emit. The marker's count
  // grows on every later trim, so a consumer that appended instead would carry a pile of stale
  // markers into the export and the report would add them all up.
  test('a growing marker is re-emitted under the seq it already had', () => {
    const t = createTrace({ cap: 10 });
    const seen = new Map<number, number>();
    t.onEvent(e => { if (e.kind === 'truncated') seen.set(e.seq, e.dropped); });
    for (let i = 0; i < 15; i++) t.push({ kind: 'status', text: String(i) });
    const firstCount = [...seen.values()][0];
    for (let i = 0; i < 10; i++) t.push({ kind: 'status', text: `b${i}` });
    expect(seen.size).toBe(1);
    expect([...seen.values()][0]).toBe(16);
    expect(firstCount).toBe(6);
  });

  // The recorder appends anything above its newest seq and only scans for a correction, so a
  // brand-new marker has to arrive after the row that pushed the list over the cap.
  test('the marker is emitted after the row that caused the trim, with the next seq', () => {
    const t = createTrace({ cap: 3 });
    const order: string[] = [];
    t.onEvent(e => order.push(`${e.kind}:${e.seq}`));
    for (let i = 0; i < 4; i++) t.push({ kind: 'status', text: String(i) });
    expect(order).toEqual(['status:1', 'status:2', 'status:3', 'status:4', 'truncated:5']);
  });

  // The defect this fixes: `push` used to return the merged row without telling anyone, so a
  // subscriber that had already copied the first row across a postMessage boundary kept the
  // original delta for ever. The summary said 50 xp and the exported trace said 25.
  test('a merged row is fanned out again, so a subscriber keyed on seq agrees with xpGained', () => {
    let now = 1000;
    const t = createTrace({ now: () => now });
    // A consumer as the real ones are: it keeps one row per seq and replaces on a re-emit.
    const seen = new Map<number, { skill: string; delta: number }>();
    t.onEvent(e => { if (e.kind === 'xp') seen.set(e.seq, { skill: e.skill, delta: e.delta }); });
    t.push({ kind: 'xp', skill: 'Woodcutting', delta: 25 });
    now += 1000;
    t.push({ kind: 'xp', skill: 'Woodcutting', delta: 25 });
    expect(seen.size).toBe(1);
    const total = [...seen.values()].reduce((n, e) => n + e.delta, 0);
    expect(total).toBe(t.xpGained().Woodcutting);
    expect(total).toBe(50);
  });

  test('a merged item row is fanned out too, and keeps the seq it was given', () => {
    let now = 1000;
    const t = createTrace({ now: () => now });
    const seen: { seq: number; delta: number }[] = [];
    t.onEvent(e => { if (e.kind === 'item') seen.push({ seq: e.seq, delta: e.delta }); });
    t.push({ kind: 'item', id: 1511, delta: 1 });
    now += 1000;
    t.push({ kind: 'item', id: 1511, delta: 3 });
    expect(seen).toEqual([{ seq: 1, delta: 1 }, { seq: 1, delta: 4 }]);
  });

  test('one subscriber that throws costs neither the others nor the caller', () => {
    const t = createTrace();
    const seen: string[] = [];
    t.onEvent(() => { throw new Error('boom'); });
    t.onEvent(e => { if (e.kind === 'status') seen.push(e.text); });
    expect(() => t.push({ kind: 'status', text: 'a' })).not.toThrow();
    expect(seen).toEqual(['a']);
  });

  test('a subscriber that unsubscribes during the fan-out does not skip the next one', () => {
    const t = createTrace();
    const seen: string[] = [];
    let offSecond = (): void => {};
    t.onEvent(() => { offSecond(); });
    offSecond = t.onEvent(e => { if (e.kind === 'status') seen.push(`second:${e.text}`); });
    t.onEvent(e => { if (e.kind === 'status') seen.push(`third:${e.text}`); });
    t.push({ kind: 'status', text: 'a' });
    // The set was copied before the walk, so the third still hears about this event; the second
    // is gone from the next one on.
    expect(seen).toEqual(['second:a', 'third:a']);
    t.push({ kind: 'status', text: 'b' });
    expect(seen).toEqual(['second:a', 'third:a', 'third:b']);
  });

  test('tasksEntered lists distinct task_enter names in order', () => {
    const t = createTrace();
    t.push({ kind: 'task_enter', task: 'a' }); t.push({ kind: 'task_enter', task: 'b' }); t.push({ kind: 'task_enter', task: 'a' });
    expect(t.tasksEntered()).toEqual(['a', 'b']);
  });
});
