// web/src/bank/store.render.test.ts -- what a refresh costs, and what a caller that throws
// cannot do to the store. Split out of store.test.ts, which is at the 400-line ceiling.
import { describe, expect, it } from 'vitest';
import { createBankStore } from './store';
import type { OpsResult } from './api';
import type { BankOp, BankSnapshot, ObjInfo } from './types';
import { FLUSH_MS, POLL_MS } from './types';

const INFO: Record<number, ObjInfo> = {
  995: { name: 'Coins', examine: 'Lovely money!', cost: 1, stackable: true, noted: false },
  1038: { name: 'Red partyhat', examine: 'A nice hat.', cost: 1, stackable: false, noted: false },
  1618: { name: 'Uncut diamond', examine: 'Valuable.', cost: 200, stackable: false, noted: false }
};

function snapshot(over: Partial<BankSnapshot> = {}): BankSnapshot {
  return {
    ownerKey: 'u1', version: 4, capacity: 240, tabs: [],
    slots: [{ slot: 0, obj: 995, count: 500 }, { slot: 1, obj: 1038, count: 1 }, { slot: 2, obj: 1618, count: 3 }],
    ...over
  };
}

function timers() {
  const pending = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  return {
    schedule: (fn: () => void, ms: number) => { const id = next++; pending.set(id, { fn, ms }); return id; },
    cancel: (id: number) => { pending.delete(id); },
    fire(ms: number): void { for (const [id, e] of [...pending]) if (e.ms === ms) { pending.delete(id); e.fn(); } },
    delays: () => [...pending.values()].map(t => t.ms)
  };
}

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function harness(over: {
  snapshots?: BankSnapshot[];
  results?: OpsResult[];
  notify?: (message: string, kind?: 'info' | 'error') => void;
  info?: (obj: number) => ObjInfo | null;
} = {}) {
  const clock = timers();
  const snapshots = over.snapshots ?? [snapshot()];
  const results = over.results ?? [];
  const sent: { expectedVersion: number; ops: BankOp[] }[] = [];
  let getCount = 0;
  let opsCount = 0;
  const notices: { message: string; kind?: string }[] = [];
  const handlers: { onVersion(v: number): void; onHealth(h: boolean): void }[] = [];
  const streamCalls = { start: 0, stop: 0 };

  const store = createBankStore({
    api: {
      get: async () => snapshots[Math.min(getCount++, snapshots.length - 1)],
      ops: async (expectedVersion, ops) => {
        sent.push({ expectedVersion, ops });
        return results[Math.min(opsCount++, results.length - 1)] ?? { ok: true, version: expectedVersion + 1 };
      }
    },
    createStream: h => { handlers.push(h); return { start: () => { streamCalls.start++; }, stop: () => { streamCalls.stop++; }, healthy: () => true }; },
    info: over.info ?? (obj => INFO[obj] ?? null),
    notify: over.notify ?? ((message, kind) => notices.push({ message, kind })),
    schedule: clock.schedule,
    cancel: clock.cancel
  });

  return { store, clock, sent, notices, streamCalls, stream: () => handlers[0], getCount: () => getCount };
}

/**
 * FINAL REVIEW, finding 3. `loading` is load-bearing internally (the onVersion guard reads it)
 * but is rendered nowhere, and emit({ loading: true }) opened every read with a frame of its own.
 * A frame is not free here: the window's subscriber is render(), which replaceChildren's the item
 * pane AND the tab strip, so each 10 s poll rebuilt the whole window twice for a flag with no
 * pixels. It is set without notifying now; the semantics are untouched.
 */
describe('the cost of a refresh', () => {
  it('is one render pass, not two', async () => {
    const { store, clock } = harness();
    const frames: number[] = [];
    store.subscribe(state => frames.push(state.version));
    store.start();
    await settle();
    expect(frames).toEqual([4]);

    // And the same on every poll behind it, which is where the doubling actually cost something.
    clock.fire(POLL_MS);
    await settle();
    expect(frames).toEqual([4, 4]);
    store.stop();
  });

  it('still sets loading internally, so the onVersion guard keeps working', async () => {
    // Gated so a read can be left in the air on purpose. `loading` renders nowhere, so the only
    // way to see it is through the guard it exists for.
    let release: (snap: BankSnapshot) => void = () => {};
    const gate = new Promise<BankSnapshot>(resolve => { release = resolve; });
    const clock = timers();
    const handlers: { onVersion(v: number): void; onHealth(h: boolean): void }[] = [];
    let gets = 0;
    let first = true;
    const store = createBankStore({
      api: {
        get: async () => { gets++; if (first) { first = false; return snapshot(); } return gate; },
        ops: async () => ({ ok: true, version: 1 })
      },
      createStream: h => { handlers.push(h); return { start: () => {}, stop: () => {}, healthy: () => false }; },
      info: () => null,
      notify: () => {},
      schedule: clock.schedule,
      cancel: clock.cancel
    });
    store.start();
    await settle();
    clock.fire(POLL_MS);
    await settle();
    expect(gets).toBe(2);
    // The second read is still in the air, so the guard drops the event rather than opening a
    // third concurrent GET. Nothing draws `loading`, and nothing draws its absence either, which
    // is exactly why it needs a test of its own.
    handlers[0].onVersion(99);
    await settle();
    expect(gets).toBe(2);
    release(snapshot({ version: 12 }));
    await settle();
    expect(store.state().version).toBe(12);
    store.stop();
  });
});

/**
 * FINAL REVIEW, residual 16. `deps.notify` and `deps.info` were left at the trust level emit()
 * was raised above: a throwing notify rejected flushOnce(), which every caller reaches as
 * `void flushOnce()` - an unhandled rejection, and the recovery re-read below it never ran, so
 * the pane kept showing an optimistic layout the engine had already refused.
 */
describe('a caller that throws cannot wedge the store', () => {
  it('survives a notify that throws on the conflict path, and still does the recovery re-read', async () => {
    const { store, clock, getCount } = harness({
      snapshots: [snapshot(), snapshot({ version: 11 })],
      results: [{ ok: false, kind: 'conflict', version: 11 }],
      notify: () => { throw new Error('the toast host is gone'); }
    });
    store.start();
    await settle();
    const before = getCount();
    store.submit({ op: 'swap', a: 0, b: 1 });
    clock.fire(FLUSH_MS);
    await expect(store.flush()).resolves.toBeUndefined();
    await settle();
    expect(getCount()).toBe(before + 1);
    expect(store.state().version).toBe(11);
    store.stop();
  });

  it('survives a notify that throws on a refusal, and still refuses', async () => {
    const { store } = harness({ notify: () => { throw new Error('the toast host is gone'); } });
    store.start();
    await settle();
    expect(store.submit({ op: 'swap', a: 0, b: 900 })).toEqual({
      kind: 'refused', message: 'That slot is not part of your bank.'
    });
    store.stop();
  });

  it('survives an info that throws inside a sort preview', async () => {
    const { store, sent, clock } = harness({ info: () => { throw new Error('the object table is gone'); } });
    store.start();
    await settle();
    expect(store.submit({ op: 'sort', tab: 0, by: 'name' })).toMatchObject({ kind: 'applied' });
    await settle();
    expect(sent[0].ops).toEqual([{ op: 'sort', tab: 0, by: 'name' }]);
    clock.fire(FLUSH_MS);
    store.stop();
  });
});

/**
 * FINAL REVIEW, residual 17. Two mutations survived the whole store suite. Both behaviours are
 * correct and load-bearing; neither was pinned. Same shape as finding 9 in stream.ts: a fence
 * whose whole job is to make something NOT happen, and a suite that only ever watched the happy
 * path where it does.
 */
describe('the fences stop() leaves behind', () => {
  it('ignores an onHealth from a stream that belongs to a closed window', async () => {
    const { store, stream } = harness();
    store.start();
    await settle();
    stream().onHealth(true);
    expect(store.state().live).toBe(true);

    store.stop();
    expect(store.state().live).toBe(false);
    // A real BankStream is torn down by stop(), but a reader already suspended on a read can
    // still wake and report. The epoch is what says that report belongs to nobody: without it a
    // closed bank window's state flips back to "live" and the panel says so.
    stream().onHealth(true);
    expect(store.state().live).toBe(false);
  });

  it('drops its stream reference, so a second stop() cannot tear the next one down', async () => {
    const { store, streamCalls } = harness();
    store.start();
    await settle();
    store.stop();
    expect(streamCalls.stop).toBe(1);
    // stop() is reachable twice for one close: the window's own close() and the plugin's unmount
    // both call it. Holding the reference means the second call stops a stream that has already
    // been retired - and once the window reopens, a stream the NEW session owns.
    store.stop();
    expect(streamCalls.stop).toBe(1);
  });
});
