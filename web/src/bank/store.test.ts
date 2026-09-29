// web/src/bank/store.test.ts
import { describe, expect, it, vi } from 'vitest';
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

describe('loading', () => {
  it('subscribes to the stream before the first GET, so no change falls in the gap', async () => {
    const { store, streamCalls, getCount } = harness();
    store.start();
    expect(streamCalls.start).toBe(1);
    expect(getCount()).toBeLessThanOrEqual(1);
    await settle();
    expect(store.state().version).toBe(4);
  });

  it('turns the sparse wire shape into a dense view with a used count', async () => {
    const { store } = harness();
    store.start();
    await settle();
    const state = store.state();
    expect(state.items.length).toBe(240);
    expect(state.items[0]).toEqual({ slot: 0, obj: 995, count: 500 });
    expect(state.used).toBe(3);
    expect(state.loading).toBe(false);
    store.stop();
  });

  it('notifies subscribers on every change', async () => {
    const { store } = harness();
    const seen = vi.fn();
    store.subscribe(seen);
    store.start();
    await settle();
    expect(seen).toHaveBeenCalled();
    store.stop();
  });

  it('reports a failed load as an error instead of an empty bank', async () => {
    const clock = timers();
    const store = createBankStore({
      api: { get: async () => { throw new Error('The bank is not reachable right now. Try again in a moment.'); }, ops: async () => ({ ok: true, version: 1 }) },
      createStream: () => ({ start: () => {}, stop: () => {}, healthy: () => false }),
      info: () => null,
      notify: () => {},
      schedule: clock.schedule, cancel: clock.cancel
    });
    store.start();
    await settle();
    expect(store.state().error).toBe('The bank is not reachable right now. Try again in a moment.');
    expect(store.state().items.every(item => item === null)).toBe(true);
    store.stop();
  });
});

describe('optimistic ops and the coalescing flush', () => {
  it('shows a swap immediately and sends nothing until the flush window closes', async () => {
    const { store, clock, sent } = harness();
    store.start();
    await settle();
    store.submit({ op: 'swap', a: 0, b: 2 });
    expect(store.state().items[0]?.obj).toBe(1618);
    expect(store.state().pending).toBe(1);
    expect(sent).toHaveLength(0);
    clock.fire(FLUSH_MS);
    await settle();
    expect(sent).toEqual([{ expectedVersion: 4, ops: [{ op: 'swap', a: 0, b: 2 }] }]);
    store.stop();
  });

  it('coalesces a burst of drags into ONE apply, because any apply holds the owner in push-out mode', async () => {
    const { store, clock, sent } = harness();
    store.start();
    await settle();
    store.submit({ op: 'swap', a: 0, b: 1 });
    store.submit({ op: 'swap', a: 1, b: 2 });
    store.submit({ op: 'insert', from: 2, to: 0 });
    clock.fire(FLUSH_MS);
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0].ops).toHaveLength(3);
    store.stop();
  });

  it('reuses the version the apply returned as the next expectedVersion, with no refetch', async () => {
    const { store, clock, sent, getCount } = harness({ results: [{ ok: true, version: 5 }, { ok: true, version: 6 }] });
    store.start();
    await settle();
    const gets = getCount();
    store.submit({ op: 'swap', a: 0, b: 1 });
    clock.fire(FLUSH_MS);
    await settle();
    expect(store.state().version).toBe(5);
    expect(store.state().pending).toBe(0);
    store.submit({ op: 'swap', a: 0, b: 1 });
    clock.fire(FLUSH_MS);
    await settle();
    expect(sent[1].expectedVersion).toBe(5);
    // The apply's own version is authoritative: nothing was refetched to learn it.
    expect(getCount()).toBe(gets);
    store.stop();
  });

  it('on a 409 refetches at the version it was handed, drops the queue and says so once', async () => {
    const { store, clock, sent, notices } = harness({
      snapshots: [snapshot(), snapshot({ version: 11, slots: [{ slot: 0, obj: 1038, count: 1 }] })],
      results: [{ ok: false, kind: 'conflict', version: 11 }]
    });
    store.start();
    await settle();
    store.submit({ op: 'swap', a: 0, b: 1 });
    clock.fire(FLUSH_MS);
    await settle();
    expect(store.state().version).toBe(11);
    expect(store.state().items[0]?.obj).toBe(1038);
    expect(store.state().pending).toBe(0);
    expect(notices.map(n => n.message)).toEqual(['Bank changed elsewhere.']);
    // Nothing is replayed: the player sees the server state.
    expect(sent).toHaveLength(1);
    store.stop();
  });

  it('on a rejection drops the queue, says why, and re-reads rather than keeping a fiction', async () => {
    const { store, clock, notices, getCount } = harness({ results: [{ ok: false, kind: 'error', message: 'That move would break the bank tabs.' }] });
    store.start();
    await settle();
    const gets = getCount();
    store.submit({ op: 'swap', a: 0, b: 1 });
    clock.fire(FLUSH_MS);
    await settle();
    expect(notices).toEqual([{ message: 'That move would break the bank tabs.', kind: 'error' }]);
    expect(store.state().pending).toBe(0);
    expect(getCount()).toBe(gets + 1);
    store.stop();
  });

  it('refuses an insert across a tab boundary before it costs a round trip', async () => {
    const { store, clock, sent, notices } = harness({ snapshots: [snapshot({ tabs: [2] })] });
    store.start();
    await settle();
    store.submit({ op: 'insert', from: 0, to: 2 });
    clock.fire(FLUSH_MS);
    await settle();
    expect(sent).toHaveLength(0);
    expect(notices[0].message).toBe('Drag onto a tab to move an item between tabs.');
    store.stop();
  });

  it('previews a sort with the engine order and flushes it at once', async () => {
    const { store, sent } = harness();
    store.start();
    await settle();
    store.submit({ op: 'sort', tab: 0, by: 'value' });
    expect(store.state().items.slice(0, 3).map(i => i?.obj)).toEqual([1618, 995, 1038]);
    await settle();
    expect(sent).toEqual([{ expectedVersion: 4, ops: [{ op: 'sort', tab: 0, by: 'value' }] }]);
    store.stop();
  });

  it('sends a moveToTab at once with no preview, then re-reads the layout the engine chose', async () => {
    const { store, sent, getCount } = harness({ results: [{ ok: true, version: 5 }] });
    store.start();
    await settle();
    const gets = getCount();
    store.submit({ op: 'moveToTab', slot: 2, tab: 1 });
    await settle();
    expect(sent).toEqual([{ expectedVersion: 4, ops: [{ op: 'moveToTab', slot: 2, tab: 1 }] }]);
    expect(getCount()).toBe(gets + 1);
    store.stop();
  });

  it('never sends more ops than the server accepts in one batch', async () => {
    const { store, clock, sent } = harness();
    store.start();
    await settle();
    for (let i = 0; i < 250; i++) store.submit({ op: 'swap', a: 0, b: 1 });
    clock.fire(FLUSH_MS);
    await settle();
    expect(sent[0].ops.length).toBeLessThanOrEqual(200);
    store.stop();
  });
});

describe('live updates', () => {
  it('refetches when the stream reports a newer version', async () => {
    const { store, stream } = harness({ snapshots: [snapshot(), snapshot({ version: 9 })] });
    store.start();
    await settle();
    stream().onVersion(9);
    await settle();
    expect(store.state().version).toBe(9);
    store.stop();
  });

  it('ignores a version it already has or an older one', async () => {
    const { store, stream, getCount } = harness();
    store.start();
    await settle();
    const gets = getCount();
    stream().onVersion(4);
    stream().onVersion(1);
    await settle();
    expect(getCount()).toBe(gets);
    store.stop();
  });

  it('mirrors the stream health onto the state', async () => {
    const { store, stream } = harness();
    store.start();
    await settle();
    stream().onHealth(false);
    expect(store.state().live).toBe(false);
    stream().onHealth(true);
    expect(store.state().live).toBe(true);
    store.stop();
  });

  it('polls regardless of stream health, because the change hook guarantees no delivery', async () => {
    const { store, clock, getCount } = harness();
    store.start();
    await settle();
    const gets = getCount();
    expect(clock.delays()).toContain(POLL_MS);
    clock.fire(POLL_MS);
    await settle();
    expect(getCount()).toBe(gets + 1);
    expect(clock.delays()).toContain(POLL_MS);
    store.stop();
  });

  it('stop tears down the stream and every timer', async () => {
    const { store, clock, streamCalls } = harness();
    store.start();
    await settle();
    store.stop();
    expect(streamCalls.stop).toBe(1);
    expect(clock.delays()).toEqual([]);
  });
});
