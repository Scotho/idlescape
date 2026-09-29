// web/src/bank/view.a11y.test.ts -- what the composed window says out loud. Split out of
// view.test.ts, which is at the 400-line ceiling.
import { describe, expect, it, vi } from 'vitest';
import { createBankWindow } from './view';
import { createMenuRegistry, contractsStubs } from './contextMenu';
import { FAKE_CROSS_TAB, fakeBankStore, filledItems } from './store.fake';
import type { BankState } from './store';
import type { IconCache } from './icons';
import type { ObjInfo } from './types';

const INFO: Record<number, ObjInfo> = {
  995: { name: 'Coins', examine: 'Lovely money!', cost: 1, stackable: true, noted: false },
  1038: { name: 'Red partyhat', examine: 'A nice hat.', cost: 1, stackable: false, noted: false }
};

const icons: IconCache = { peek: () => null, load: async () => null, prime: async () => {}, onChange: () => () => {} };

function mount(over: Partial<BankState> = {}) {
  document.body.innerHTML = '';
  const host = document.createElement('div');
  document.body.appendChild(host);
  const fake = fakeBankStore(over);
  const registry = createMenuRegistry();
  for (const stub of contractsStubs()) registry.register(stub);
  const store: Record<string, string> = {};
  const win = createBankWindow(host, {
    store: fake.store, icons, info: obj => INFO[obj] ?? null, registry, notify: vi.fn(), onClose: vi.fn(),
    storage: { get: key => store[key] ?? null, set: (key, value) => { store[key] = value; } }
  });
  return { win, fake };
}

const byId = (id: string): HTMLElement => document.getElementById(id)!;

/**
 * FINAL REVIEW, finding 1. The keyboard layer used to call onMove and then announce
 * `Moved ${name} to slot ${slot + 1}` unconditionally, into #bank-status (role=status). But the
 * store is entitled to disagree: it clamps both endpoints onto the last occupied slot and refuses
 * a cross-tab insert outright. Neither decision came back, so the live region told assistive tech
 * about moves that never happened. These are the two probes the review reproduced; both are
 * composed tests, because each half on its own is innocent.
 */
describe('the live region reports what the store did, not what the key asked for', () => {
  const status = (): string => byId('bank-status').textContent ?? '';

  it('announces the CLAMPED slot when End runs past the last occupied one', () => {
    // used = 10, so the All-items pane draws a whole overhang row: visible() ends at slot 23 and
    // End lands there, while the store pins the move onto slot 9.
    const { win, fake } = mount({ items: filledItems(10), used: 10 });
    win.open();
    const cell = (slot: number): HTMLElement => document.querySelector<HTMLElement>(`[data-bank-slot="${slot}"]`)!;
    expect(document.querySelector('[data-bank-slot="23"]')).not.toBeNull();
    cell(0).focus();
    cell(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    cell(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(cell(23));
    cell(23).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(fake.submitted).toEqual([{ op: 'swap', a: 0, b: 9 }]);
    expect(status()).toBe('Moved Coins to slot 10.');
    expect(status()).not.toContain('slot 24');
  });

  it('does not claim a move the store refused outright', () => {
    // tabs [4] puts slots 0-3 in tab 1 and the rest outside it, so an insert from 0 to 6 straddles
    // a tab boundary: only a drop onto a tab header may move an item between tabs.
    const { win, fake } = mount({ items: filledItems(8), used: 8, tabs: [4] });
    win.open();
    byId('bank-mode-insert').click();
    const cell = (slot: number): HTMLElement => document.querySelector<HTMLElement>(`[data-bank-slot="${slot}"]`)!;
    cell(0).focus();
    cell(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    cell(6).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(fake.submitted).toEqual([]);
    expect(fake.notices).toEqual([FAKE_CROSS_TAB]);
    expect(status()).not.toContain('Moved');
    expect(status()).toBe(FAKE_CROSS_TAB);
  });

  it('says nothing moved when the clamp collapses the move onto its own slot', () => {
    const { win, fake } = mount({ items: filledItems(3), used: 3 });
    win.open();
    const cell = (slot: number): HTMLElement => document.querySelector<HTMLElement>(`[data-bank-slot="${slot}"]`)!;
    cell(2).focus();
    cell(2).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    // Slot 5 is drawn (the overhang row) but empty, so both endpoints clamp onto slot 2.
    cell(5).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(fake.submitted).toEqual([]);
    expect(status()).toBe('Coins stayed in slot 3.');
  });

  it('still announces an ordinary accepted move at the slot it reached', () => {
    const { win, fake } = mount({ items: filledItems(8), used: 8 });
    win.open();
    const cell = (slot: number): HTMLElement => document.querySelector<HTMLElement>(`[data-bank-slot="${slot}"]`)!;
    cell(0).focus();
    cell(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    cell(3).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(fake.submitted).toEqual([{ op: 'swap', a: 0, b: 3 }]);
    expect(status()).toBe('Moved Coins to slot 4.');
  });
});
