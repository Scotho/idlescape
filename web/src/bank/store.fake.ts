// web/src/bank/store.fake.ts -- the honest stand-in for the real store, shared by every composed
// bank-window test. Nothing in the shipped bundle imports this module.
//
// It exists because of a defect the final SP8b review found: three separate hand-rolled fakes all
// accepted any op they were handed, so a view test could watch the keyboard layer announce
// "Moved Coins to slot 24" for an item the real store would have clamped into slot 10, and pass.
// A fake that is more permissive than the thing it stands for cannot fail a test about what the
// real thing refuses, so the two rulings submit() actually applies are reproduced here:
//
// 1. THE CLAMP. Both endpoints of a move are pinned to the last occupied slot (store.ts clamp()),
//    because the slots past the items are not a place. A move that clamps onto itself is dropped.
// 2. THE CROSS-TAB REFUSAL. An insert whose endpoints straddle a tab boundary is refused outright
//    (store.ts, via insertCrossesTab); only a drop onto a tab header moves an item between tabs.
import { insertCrossesTab } from './layout';
import { clampOp, isNoOp } from './storeOps';
import type { BankState, BankStore, SubmitOutcome } from './store';
import type { BankOp } from './types';

/** Word for word the store's own copy, so a test asserting on it asserts on the real line. */
export const FAKE_CROSS_TAB = 'Drag onto a tab to move an item between tabs.';

export interface FakeBankStore {
  store: BankStore;
  /** The ops the store ACCEPTED, already clamped. A refused or dropped op never appears. */
  submitted: BankOp[];
  /** Every line submit() would have toasted. */
  notices: string[];
  calls: { start: number; stop: number };
  /** How many subscribers are currently attached, so an unsubscribe can be proved. */
  listenerCount(): number;
  push(next: Partial<BankState>): void;
}

/** Two occupied slots (coins, a party hat), matching what the composed tests have always used. */
export function fakeBankState(over: Partial<BankState> = {}): BankState {
  const items = new Array(240).fill(null);
  items[0] = { slot: 0, obj: 995, count: 500 };
  items[1] = { slot: 1, obj: 1038, count: 1 };
  return { version: 3, capacity: 240, tabs: [], items, used: 2, loading: false, live: true, pending: 0, error: null, ...over };
}

export function fakeBankStore(over: Partial<BankState> = {}): FakeBankStore {
  let state = fakeBankState(over);
  const listeners = new Set<(s: BankState) => void>();
  const submitted: BankOp[] = [];
  const notices: string[] = [];
  const calls = { start: 0, stop: 0 };

  function submit(op: BankOp): SubmitOutcome {
    // The store's OWN helpers, not a copy of them: a fake that reimplements the rules is a fake
    // that can drift away from them, which is how the announcement defect stayed hidden.
    const move = clampOp(op, state.used);
    if (isNoOp(move)) return { kind: 'dropped' };
    if (move.op === 'insert' && insertCrossesTab(state.tabs, move.from, move.to)) {
      notices.push(FAKE_CROSS_TAB);
      return { kind: 'refused', message: FAKE_CROSS_TAB };
    }
    submitted.push(move);
    return { kind: 'applied', op: move };
  }

  const store: BankStore = {
    state: () => state,
    subscribe: fn => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    start: () => { calls.start++; },
    // The real stop() emits, and puts the version back to -1 so the next account cannot inherit
    // this one's (store.ts stop()). A fake that only counted the call would let a producer that
    // reads a stale version pass here and misbehave in the browser.
    stop: () => { calls.stop++; state = { ...state, pending: 0, live: false, loading: false, version: -1 }; for (const fn of listeners) fn(state); },
    refresh: async () => {},
    submit,
    flush: async () => {}
  };

  return {
    store,
    submitted,
    notices,
    calls,
    listenerCount: () => listeners.size,
    push(next: Partial<BankState>) { state = { ...state, ...next }; for (const fn of listeners) fn(state); }
  };
}

/** A bank with `count` occupied slots, for a test that moves an item to a high slot: aiming past
 *  `used` is not a move the engine would ever make, and the clamp above will not pretend it is. */
export function filledItems(count: number): BankState['items'] {
  const items = new Array(240).fill(null);
  for (let slot = 0; slot < count; slot++) items[slot] = { slot, obj: slot === 1 ? 1038 : 995, count: slot === 1 ? 1 : 500 };
  return items;
}
