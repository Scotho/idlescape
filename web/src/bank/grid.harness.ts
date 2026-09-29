// web/src/bank/grid.harness.ts
// Shared fixtures for the item pane's tests. Extracted when grid.test.ts crossed the 400-line
// ceiling, so the rendering tests and the repaint/teardown tests can live in separate files
// without either growing a second copy of the bank they mount.
//
// This file imports NOTHING from vitest, deliberately. tsconfig excludes `src/**/*.test.ts` but
// not `*.harness.ts`, so a vitest import here pulls its ambient types into the shipped program
// and clobbers the global `setTimeout` signature (it made toast.ts fail noImplicitAny). Callers
// that need a spy build their own and pass it in as `onMenu`.
import { createBankGrid } from './grid';
import type { BankState } from './store';
import type { IconCache } from './icons';
import type { ObjInfo } from './types';

export const INFO: Record<number, ObjInfo> = {
  995: { name: 'Coins', examine: 'Lovely money!', cost: 1, stackable: true, noted: false },
  1038: { name: 'Red partyhat', examine: 'A nice hat.', cost: 1, stackable: false, noted: false },
  1618: { name: 'Uncut diamond', examine: 'Valuable.', cost: 200, stackable: false, noted: false }
};

export function icons(map: Record<number, string> = {}): IconCache {
  return { peek: obj => map[obj] ?? null, load: async obj => map[obj] ?? null, prime: async () => {}, onChange: () => () => {} };
}

export function state(over: Partial<BankState> = {}): BankState {
  const items = new Array(240).fill(null);
  items[0] = { slot: 0, obj: 995, count: 500 };
  items[1] = { slot: 1, obj: 1038, count: 1 };
  items[2] = { slot: 2, obj: 1618, count: 250_000 };
  return { version: 1, capacity: 240, tabs: [], items, used: 3, loading: false, live: true, pending: 0, error: null, ...over };
}

export function mount(over: Partial<Parameters<typeof createBankGrid>[0]> = {}, iconMap: Record<number, string> = {}) {
  const grid = createBankGrid({
    icons: icons(iconMap),
    info: obj => INFO[obj] ?? null,
    selectedTab: () => 0,
    search: () => '',
    onMenu: () => {},
    ...over
  });
  document.body.appendChild(grid.el);
  return { grid };
}

export const slots = (root: HTMLElement): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>('[data-bank-slot]'));

/** An IconCache whose onChange actually registers and removes listeners, and whose prime() is a
 *  spy, so a fix-round test can fire a repaint and check whether it really happened. */
export function controllableIcons(map: Record<number, string> = {}) {
  const listeners = new Set<() => void>();
  const primeCalls: number[][] = [];
  const cache: IconCache = {
    peek: obj => map[obj] ?? null,
    load: async obj => map[obj] ?? null,
    prime: async objs => { primeCalls.push(objs); },
    onChange(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    }
  };
  return { cache, primeCalls, fire: () => { for (const fn of [...listeners]) fn(); } };
}
