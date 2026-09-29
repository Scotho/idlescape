// web/src/frame/eventProducers.bank.test.ts -- the bank producer over the REAL bank store.
//
// Fix round 1. `bank/store.fake.ts` only ever notifies what a test pushes, so no case built on it
// can see the notifications the real store sends on its own: `emit({ live: healthy })` the moment
// the SSE stream connects (store.ts's onHealth), and `emit({ loading: false, error })` when the
// first GET fails. start() fires `stream.start()` and `void refresh()` as two racing network
// operations, so either can land before the first read does. A producer that took its baseline
// from the first notification of ANY kind latched at the store's initial version of -1 and then
// announced "Bank updated" on a plain page load, which is the one thing it exists to prevent.
import { describe, expect, it } from 'vitest';
import { createBankStore, type BankStore } from '../bank/store';
import { createEventBus, type EventBus } from './events';
import { bankProducer } from './eventProducers';
import type { BankSnapshot } from '../bank/types';

const snapshot = (over: Partial<BankSnapshot> = {}): BankSnapshot => ({
  ownerKey: 'u1', version: 7, capacity: 240, tabs: [],
  slots: [{ slot: 0, obj: 995, count: 500 }, { slot: 1, obj: 1038, count: 1 }],
  ...over
});

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

interface Rig {
  bus: EventBus;
  store: BankStore;
  /** The stream's own health signal, which the real store turns into a subscriber notification. */
  onHealth(healthy: boolean): void;
  texts(): string[];
}

/** The real store over a fake api and a fake stream, with no timers armed. */
function rig(get: (call: number) => Promise<BankSnapshot>): Rig {
  const bus = createEventBus({ now: () => 0 });
  const handlers: { onVersion(v: number): void; onHealth(healthy: boolean): void }[] = [];
  let calls = 0;
  const store = createBankStore({
    api: { get: async () => get(++calls), ops: async expectedVersion => ({ ok: true, version: expectedVersion + 1 }) },
    createStream: h => { handlers.push(h); return { start: () => {}, stop: () => { h.onHealth(false); }, healthy: () => false }; },
    info: () => null,
    notify: () => {},
    schedule: () => 1,
    cancel: () => {}
  });
  bankProducer(bus, store);
  return { bus, store, onHealth: healthy => handlers[0].onHealth(healthy), texts: () => bus.all().map(e => e.text) };
}

describe('bankProducer over the real store', () => {
  it('says nothing when the stream connects before the first read lands', async () => {
    const rg = rig(() => Promise.resolve(snapshot()));
    rg.store.start();
    rg.onHealth(true);        // the first SSE chunk, ahead of the GET. Carries no version.
    await settle();
    expect(rg.texts()).toEqual([]);
    rg.store.stop();
  });

  it('says nothing when the first read FAILS before a later one succeeds', async () => {
    const rg = rig(call => (call === 1
      ? Promise.reject(new Error('The bank is not reachable right now. Try again in a moment.'))
      : Promise.resolve(snapshot())));
    rg.store.start();
    await settle();
    await rg.store.refresh();
    await settle();
    expect(rg.texts()).toEqual([]);
    rg.store.stop();
  });

  it('still announces the change that follows the load', async () => {
    const rg = rig(call => Promise.resolve(call === 1 ? snapshot() : snapshot({ version: 8, slots: [{ slot: 0, obj: 995, count: 500 }] })));
    rg.store.start();
    rg.onHealth(true);
    await settle();
    await rg.store.refresh();
    await settle();
    expect(rg.texts()).toEqual(['Bank updated — 1 / 240 slots used']);
    rg.store.stop();
  });

  it('says nothing about the first read of the SECOND account on the page', async () => {
    // main.ts builds one store per PAGE and frame/singletons.ts starts it per account, so this is
    // the sign-out-and-back-in case, not a hypothetical: uid2's bank is a smaller, older one.
    const rg = rig(call => Promise.resolve(call === 1 ? snapshot({ version: 20 }) : snapshot({ version: 3 })));
    rg.store.start();
    await settle();
    rg.store.stop();
    rg.store.start();
    rg.onHealth(true);
    await settle();
    expect(rg.texts()).toEqual([]);
    rg.store.stop();
  });
});
