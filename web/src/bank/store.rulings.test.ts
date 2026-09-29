// The rulings store.test.ts does not cover: the engine's move clamp, the flush loop's failure
// containment, and the start/stop lifecycle. Kept in its own file so store.test.ts stays exactly
// as the plan wrote it and neither file approaches the 400-line ceiling.
import { describe, expect, it, vi } from 'vitest';
import { createBankStore, type BankStore } from './store';
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

interface Deferred<T> { promise: Promise<T>; resolve(value: T): void }

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

interface Rig {
  store: BankStore;
  clock: ReturnType<typeof timers>;
  sent: { expectedVersion: number; ops: BankOp[] }[];
  notices: { message: string; kind?: string }[];
  streamCalls: { start: number; stop: number };
  getCount(): number;
}

function rig(over: {
  snapshots?: BankSnapshot[];
  results?: OpsResult[];
  opsImpl?(expectedVersion: number, ops: BankOp[]): Promise<OpsResult>;
  getImpl?(): Promise<BankSnapshot>;
} = {}): Rig {
  const clock = timers();
  const snapshots = over.snapshots ?? [snapshot()];
  const results = over.results ?? [];
  const sent: { expectedVersion: number; ops: BankOp[] }[] = [];
  const notices: { message: string; kind?: string }[] = [];
  const streamCalls = { start: 0, stop: 0 };
  let getCount = 0;
  let opsCount = 0;

  const store = createBankStore({
    api: {
      get: async () => {
        getCount++;
        if (over.getImpl) return over.getImpl();
        return snapshots[Math.min(getCount - 1, snapshots.length - 1)];
      },
      ops: async (expectedVersion, ops) => {
        sent.push({ expectedVersion, ops });
        if (over.opsImpl) return over.opsImpl(expectedVersion, ops);
        return results[Math.min(opsCount++, results.length - 1)] ?? { ok: true, version: expectedVersion + 1 };
      }
    },
    createStream: () => ({
      start: () => { streamCalls.start++; },
      stop: () => { streamCalls.stop++; },
      healthy: () => true
    }),
    info: obj => INFO[obj] ?? null,
    notify: (message, kind) => notices.push({ message, kind }),
    schedule: clock.schedule,
    cancel: clock.cancel
  });

  return { store, clock, sent, notices, streamCalls, getCount: () => getCount };
}

describe('the engine move clamp', () => {
  it('pins a swap past the last used slot back onto it, so no phantom gap is painted', async () => {
    const { store, clock, sent } = rig();
    store.start();
    await settle();
    // Three items, so the last item sits at slot 2. Slot 100 is legal but is not a place.
    store.submit({ op: 'swap', a: 0, b: 100 });
    expect(store.state().items[0]?.obj).toBe(1618);
    expect(store.state().items[2]?.obj).toBe(995);
    expect(store.state().used).toBe(3);
    clock.fire(FLUSH_MS);
    await settle();
    expect(sent[0].ops).toEqual([{ op: 'swap', a: 0, b: 2 }]);
    store.stop();
  });

  it('pins both ends of an insert, and sends the clamped op so the wire matches the preview', async () => {
    const { store, clock, sent } = rig();
    store.start();
    await settle();
    store.submit({ op: 'insert', from: 0, to: 200 });
    expect(store.state().items.slice(0, 3).map(item => item?.obj)).toEqual([1038, 1618, 995]);
    clock.fire(FLUSH_MS);
    await settle();
    expect(sent[0].ops).toEqual([{ op: 'insert', from: 0, to: 2 }]);
    store.stop();
  });

  it('drops a move that lands back on its own slot rather than burning an apply on it', async () => {
    const { store, clock, sent } = rig();
    store.start();
    await settle();
    // Both of these clamp onto slot 2 and cancel out. Any apply arms push-out for a tick.
    store.submit({ op: 'swap', a: 100, b: 200 });
    store.submit({ op: 'insert', from: 2, to: 2 });
    expect(store.state().pending).toBe(0);
    clock.fire(FLUSH_MS);
    await settle();
    expect(sent).toHaveLength(0);
    store.stop();
  });

  it('refuses an endpoint outside the container instead of losing the whole batch to bad_slot', async () => {
    const { store, clock, sent, notices } = rig();
    store.start();
    await settle();
    store.submit({ op: 'swap', a: 0, b: 240 });
    store.submit({ op: 'insert', from: -1, to: 0 });
    clock.fire(FLUSH_MS);
    await settle();
    expect(sent).toHaveLength(0);
    expect(notices).toEqual([
      { message: 'That slot is not part of your bank.', kind: 'error' },
      { message: 'That slot is not part of your bank.', kind: 'error' }
    ]);
    store.stop();
  });
});

describe('the flush loop survives its own failures', () => {
  it('clears inFlight when ops() throws, so the loop is not wedged for the session', async () => {
    let throwNext = true;
    const { store, clock, sent, notices } = rig({
      opsImpl: async () => {
        // Task 3 leaves this possible: a 200 whose body is not JSON throws out of ops().
        if (throwNext) { throwNext = false; throw new SyntaxError('Unexpected token < in JSON at position 0'); }
        return { ok: true, version: 9 };
      }
    });
    store.start();
    await settle();
    store.submit({ op: 'swap', a: 0, b: 1 });
    clock.fire(FLUSH_MS);
    await settle();
    // The internal message never reaches the player; the queue is dropped and the bank re-read.
    expect(notices).toEqual([{ message: 'Something went wrong. Try again.', kind: 'error' }]);
    expect(store.state().pending).toBe(0);

    store.submit({ op: 'swap', a: 0, b: 1 });
    clock.fire(FLUSH_MS);
    await settle();
    expect(sent).toHaveLength(2);
    expect(store.state().version).toBe(9);
    store.stop();
  });

  it('re-arms rather than stranding an op submitted while a batch is still in the air', async () => {
    const gate = deferred<OpsResult>();
    let first = true;
    const { store, clock, sent } = rig({
      opsImpl: async () => {
        if (first) { first = false; return gate.promise; }
        return { ok: true, version: 7 };
      }
    });
    store.start();
    await settle();
    store.submit({ op: 'swap', a: 0, b: 1 });
    clock.fire(FLUSH_MS);
    await settle();
    expect(sent).toHaveLength(1);

    // A moveToTab normally goes out at once, but one apply is already in the air.
    store.submit({ op: 'moveToTab', slot: 2, tab: 1 });
    await settle();
    expect(sent).toHaveLength(1);

    gate.resolve({ ok: true, version: 6 });
    await settle();
    clock.fire(FLUSH_MS);
    await settle();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({ expectedVersion: 6, ops: [{ op: 'moveToTab', slot: 2, tab: 1 }] });
    store.stop();
  });

  it('re-reads after a sort, because the engine clamps the tabs down onto the compacted items', async () => {
    const { store, getCount } = rig({
      snapshots: [snapshot({ tabs: [3] }), snapshot({ version: 5, tabs: [2], slots: [{ slot: 0, obj: 995, count: 500 }, { slot: 1, obj: 1038, count: 1 }] })],
      results: [{ ok: true, version: 5 }]
    });
    store.start();
    await settle();
    const gets = getCount();
    store.submit({ op: 'sort', tab: 1, by: 'value' });
    await settle();
    expect(getCount()).toBe(gets + 1);
    expect(store.state().tabs).toEqual([2]);
    store.stop();
  });
});

describe('lifecycle', () => {
  it('skips a poll that lands mid-drag rather than erasing the optimistic view', async () => {
    const { store, clock, getCount } = rig();
    store.start();
    await settle();
    const gets = getCount();
    store.submit({ op: 'swap', a: 0, b: 2 });
    clock.fire(POLL_MS);
    await settle();
    expect(getCount()).toBe(gets);
    expect(store.state().items[0]?.obj).toBe(1618);
    // The poll is re-armed, not abandoned.
    expect(clock.delays()).toContain(POLL_MS);
    store.stop();
  });

  it('drops the read that stop() interrupted rather than emitting into a torn-down store', async () => {
    const gate = deferred<BankSnapshot>();
    let first = true;
    const { store, clock } = rig({
      getImpl: () => {
        if (first) { first = false; return Promise.resolve(snapshot()); }
        return gate.promise;
      }
    });
    store.start();
    await settle();
    clock.fire(POLL_MS);
    await settle();
    store.stop();
    // Registered after teardown: a torn-down store has no business calling anyone.
    const afterTeardown = vi.fn();
    store.subscribe(afterTeardown);
    gate.resolve(snapshot({ version: 12 }));
    await settle();
    // -1 is stop()'s own reset; 12 would be the interrupted read committing after teardown.
    expect(store.state().version).toBe(-1);
    expect(afterTeardown).not.toHaveBeenCalled();
    expect(store.state().loading).toBe(false);
    expect(clock.delays()).toEqual([]);
  });

  it('opens exactly one stream however many times start() is called', async () => {
    const { store, streamCalls } = rig();
    store.start();
    store.start();
    await settle();
    expect(streamCalls.start).toBe(1);
    store.stop();
    expect(streamCalls.stop).toBe(1);
  });

  it('drops an op submitted after stop(), leaving no timer armed behind it', async () => {
    const { store, clock, sent } = rig();
    store.start();
    await settle();
    store.stop();
    store.submit({ op: 'swap', a: 0, b: 1 });
    expect(clock.delays()).toEqual([]);
    clock.fire(FLUSH_MS);
    await settle();
    expect(sent).toHaveLength(0);
  });
});
