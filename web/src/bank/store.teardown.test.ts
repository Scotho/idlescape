// The fix round's cases: `running` fences the store's timers, but the promises already in the
// air need a fence of their own, and the store's own two follow-up reads need an ordering token
// the poll's guard cannot supply. Every case here fails against the store as first written.
import { describe, expect, it, vi } from 'vitest';
import { createBankStore, type BankStore } from './store';
import type { OpsResult } from './api';
import type { BankOp, BankSnapshot } from './types';
import { FLUSH_MS, POLL_MS } from './types';

function snapshot(over: Partial<BankSnapshot> = {}): BankSnapshot {
  return {
    ownerKey: 'u1', version: 4, capacity: 240, tabs: [],
    slots: [{ slot: 0, obj: 995, count: 500 }, { slot: 1, obj: 1038, count: 1 }],
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

interface Deferred<T> { promise: Promise<T>; resolve(value: T): void; reject(err: Error): void }

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

interface Rig {
  store: BankStore;
  clock: ReturnType<typeof timers>;
  sent: { expectedVersion: number; ops: BankOp[] }[];
  notices: { message: string; kind?: string }[];
  getCount(): number;
  onVersion(version: number): void;
}

function rig(over: {
  getImpl?(call: number): Promise<BankSnapshot>;
  opsImpl?(call: number): Promise<OpsResult>;
} = {}): Rig {
  const clock = timers();
  const sent: { expectedVersion: number; ops: BankOp[] }[] = [];
  const notices: { message: string; kind?: string }[] = [];
  const handlers: { onVersion(v: number): void }[] = [];
  let getCount = 0;

  const store = createBankStore({
    api: {
      get: async () => {
        getCount++;
        return over.getImpl ? over.getImpl(getCount) : snapshot();
      },
      ops: async (expectedVersion, ops) => {
        sent.push({ expectedVersion, ops });
        return over.opsImpl ? over.opsImpl(sent.length) : { ok: true, version: expectedVersion + 1 };
      }
    },
    createStream: h => {
      handlers.push(h);
      // Task 5's stream fires one synchronous onHealth(false) out of stop(). Reproduced here so
      // teardown is tested against the stream it will really be given.
      return { start: () => {}, stop: () => { h.onHealth(false); }, healthy: () => false };
    },
    info: () => null,
    notify: (message, kind) => notices.push({ message, kind }),
    schedule: clock.schedule,
    cancel: clock.cancel
  });

  return { store, clock, sent, notices, getCount: () => getCount, onVersion: v => handlers[0].onVersion(v) };
}

describe('stop() fences the work already in the air', () => {
  it('drops an apply that fails after teardown instead of toasting over a closed window', async () => {
    const gate = deferred<OpsResult>();
    const { store, clock, notices, getCount } = rig({ opsImpl: () => gate.promise });
    store.start();
    await settle();
    store.submit({ op: 'swap', a: 0, b: 1 });
    clock.fire(FLUSH_MS);
    await settle();
    const gets = getCount();

    store.stop();
    gate.resolve({ ok: false, kind: 'error', message: 'nope' });
    await settle();
    // Neither the toast nor the failure path's re-read belongs to a bank window that is gone.
    expect(notices).toEqual([]);
    expect(getCount()).toBe(gets);
  });

  it('does not let a conflict that resolves after teardown emit into a dead store', async () => {
    const gate = deferred<OpsResult>();
    const { store, clock } = rig({ opsImpl: () => gate.promise });
    store.start();
    await settle();
    store.submit({ op: 'swap', a: 0, b: 1 });
    clock.fire(FLUSH_MS);
    await settle();

    store.stop();
    const afterTeardown = vi.fn();
    store.subscribe(afterTeardown);
    gate.resolve({ ok: false, kind: 'conflict', version: 99 });
    await settle();
    expect(afterTeardown).not.toHaveBeenCalled();
    // -1 is what stop() left, not what the 409 wrote: 99 here would be the dead conflict landing.
    expect(store.state().version).toBe(-1);
  });

  it('clears inFlight, so reopening the bank over a still-hanging apply is not wedged', async () => {
    // The player drags, closes the bank while the POST is in the air, and reopens it. api.ts has
    // no timeout anywhere, so a hung socket can outlive the session: if inFlight survived stop(),
    // every later flush would sit in the deferred branch re-arming its own window forever.
    const hung = deferred<OpsResult>();
    const { store, clock, sent } = rig({ opsImpl: call => (call === 1 ? hung.promise : Promise.resolve({ ok: true, version: 8 })) });
    store.start();
    await settle();
    store.submit({ op: 'swap', a: 0, b: 1 });
    clock.fire(FLUSH_MS);
    await settle();
    expect(sent).toHaveLength(1);

    store.stop();
    store.start();
    await settle();
    store.submit({ op: 'swap', a: 0, b: 1 });
    clock.fire(FLUSH_MS);
    await settle();
    expect(sent).toHaveLength(2);
    expect(store.state().pending).toBe(0);
    expect(store.state().version).toBe(8);
    store.stop();
  });

  it('lets a stale apply resolve without un-flagging the apply that replaced it', async () => {
    const hung = deferred<OpsResult>();
    const second = deferred<OpsResult>();
    const { store, clock, sent } = rig({ opsImpl: call => (call === 1 ? hung.promise : second.promise) });
    store.start();
    await settle();
    store.submit({ op: 'swap', a: 0, b: 1 });
    clock.fire(FLUSH_MS);
    await settle();
    store.stop();
    store.start();
    await settle();
    store.submit({ op: 'swap', a: 0, b: 1 });
    clock.fire(FLUSH_MS);
    await settle();
    expect(sent).toHaveLength(2);

    // The abandoned socket finally errors. It must not clear the live apply's in-flight flag.
    hung.resolve({ ok: true, version: 50 });
    await settle();
    expect(store.state().version).toBe(4);
    store.submit({ op: 'swap', a: 0, b: 1 });
    clock.fire(FLUSH_MS);
    await settle();
    expect(sent).toHaveLength(2);
    store.stop();
  });
});

describe('reads commit in the order they were issued', () => {
  it('discards a slow read that a later one has already overtaken', async () => {
    // The store issues reads from three places, and two of them run with inFlight cleared and
    // the queue empty, so the poll's own guard cannot see them.
    const slow = deferred<BankSnapshot>();
    const { store, getCount } = rig({
      getImpl: call => {
        if (call === 1) return Promise.resolve(snapshot());
        if (call === 2) return slow.promise;
        return Promise.resolve(snapshot({ version: 20 }));
      }
    });
    store.start();
    await settle();
    void store.refresh();
    void store.refresh();
    await settle();
    expect(getCount()).toBe(3);
    expect(store.state().version).toBe(20);

    slow.resolve(snapshot({ version: 4 }));
    await settle();
    // Going back to 4 here would send the wrong expectedVersion on the next drag and earn a 409.
    expect(store.state().version).toBe(20);
    expect(store.state().loading).toBe(false);
    store.stop();
  });

  it('does not let an overtaken read that fails stamp its error over fresher state', async () => {
    const slow = deferred<BankSnapshot>();
    const { store } = rig({
      getImpl: call => {
        if (call === 1) return Promise.resolve(snapshot());
        if (call === 2) return slow.promise;
        return Promise.resolve(snapshot({ version: 20 }));
      }
    });
    store.start();
    await settle();
    void store.refresh();
    void store.refresh();
    await settle();

    slow.reject(new Error('The bank is not reachable right now. Try again in a moment.'));
    await settle();
    expect(store.state().error).toBeNull();
    expect(store.state().version).toBe(20);
    store.stop();
  });
});

describe('a subscriber cannot wedge the store', () => {
  it('survives a listener that throws, rather than stranding loading and deafening the stream', async () => {
    const { store, getCount, onVersion } = rig({
      getImpl: call => Promise.resolve(call === 1 ? snapshot() : snapshot({ version: 9 }))
    });
    let throwNext = true;
    store.subscribe(() => { if (throwNext) { throwNext = false; throw new Error('render failed'); } });
    store.start();
    await settle();
    // The throw lands on the emit that commits the first read. `loading` is no longer emitted at
    // all (it renders nowhere, so it is set without a frame of its own), which is why the throw
    // has moved down the read rather than opening it.
    expect(store.state().loading).toBe(false);
    expect(store.state().version).toBe(4);

    // A stranded `loading` would make the onVersion guard discard every event for the session.
    const gets = getCount();
    onVersion(9);
    await settle();
    expect(getCount()).toBe(gets + 1);
    expect(store.state().version).toBe(9);

    // Directly: a throwing subscriber must not reject the read it interrupted. Every caller
    // reaches refresh() as `void refresh()`, so a rejection here is an unhandled rejection.
    throwNext = true;
    await expect(store.refresh()).resolves.toBeUndefined();
    store.stop();
  });
});

describe('the 409 version', () => {
  it('is taken before the re-read, so a failed re-read cannot earn a second conflict', async () => {
    const { store, clock, sent, notices } = rig({
      getImpl: call => (call === 1
        ? Promise.resolve(snapshot())
        : Promise.reject(new Error('The bank is not reachable right now. Try again in a moment.'))),
      opsImpl: call => Promise.resolve(call === 1 ? { ok: false, kind: 'conflict', version: 11 } : { ok: true, version: 12 })
    });
    store.start();
    await settle();
    store.submit({ op: 'swap', a: 0, b: 1 });
    clock.fire(FLUSH_MS);
    await settle();
    expect(notices).toEqual([{ message: 'Bank changed elsewhere.', kind: undefined }]);
    expect(store.state().version).toBe(11);

    // The next drag must go out at 11, not at the pre-conflict 4 that would 409 all over again.
    store.submit({ op: 'swap', a: 0, b: 1 });
    clock.fire(FLUSH_MS);
    await settle();
    expect(sent[1].expectedVersion).toBe(11);
    store.stop();
  });
});

describe('the poll after teardown', () => {
  it('is not re-armed by a read that was still running when stop() landed', async () => {
    const gate = deferred<BankSnapshot>();
    const { store, clock } = rig({ getImpl: call => (call === 1 ? Promise.resolve(snapshot()) : gate.promise) });
    store.start();
    await settle();
    clock.fire(POLL_MS);
    await settle();
    store.stop();
    gate.resolve(snapshot({ version: 12 }));
    await settle();
    expect(clock.delays()).toEqual([]);
    // -1 is stop()'s own reset; 12 would be the abandoned read committing into a dead store.
    expect(store.state().version).toBe(-1);
    expect(store.state().live).toBe(false);
  });

  it('forgets the version, so the next account on the page cannot inherit this one', async () => {
    // main.ts builds ONE store per page and starts it per account (frame/singletons.ts), so a
    // version left behind would be sent as the next account's expectedVersion and would be what
    // frame/eventProducers.ts compares that account's first read against, announcing it.
    const { store } = rig({ getImpl: () => Promise.resolve(snapshot({ version: 20 })) });
    store.start();
    await settle();
    expect(store.state().version).toBe(20);
    store.stop();
    expect(store.state().version).toBe(-1);
  });
});
