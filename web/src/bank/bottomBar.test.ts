import { describe, expect, it, vi } from 'vitest';
import { createBottomBar } from './bottomBar';
import { createBankWindow } from './view';
import { createMenuRegistry, contractsStubs } from './contextMenu';
import { fakeBankStore, filledItems } from './store.fake';
import type { BankState } from './store';
import type { IconCache } from './icons';
import { BANK_FOOTER_NOTE } from '../ui/copy';
import type { ObjInfo, Quantity, RearrangeMode } from './types';

function mount() {
  // Every assertion below looks its control up by id on the document, and the jsdom body is
  // shared by every test in the file, so a second strip would shadow the first one's ids.
  document.body.innerHTML = '';
  let mode: RearrangeMode = 'swap';
  let quantity: Quantity = 1;
  let search = '';
  const bar = createBottomBar({
    mode: () => mode, setMode: next => { mode = next; bar.render(); },
    quantity: () => quantity, setQuantity: next => { quantity = next; bar.render(); },
    search: () => search, setSearch: next => { search = next; }
  });
  document.body.appendChild(bar.el);
  bar.render();
  return { bar, read: () => ({ mode, quantity, search }) };
}

const byId = (id: string): HTMLElement => document.getElementById(id)!;

describe('the bottom bar', () => {
  it('offers the five toggles the mock draws, the search box and the caption', () => {
    mount();
    for (const id of ['bank-mode-swap', 'bank-mode-insert', 'bank-qty-1', 'bank-qty-5', 'bank-qty-all', 'bank-search']) {
      expect(byId(id), id).not.toBeNull();
    }
    expect(document.querySelector('.bank-note')?.textContent).toBe(BANK_FOOTER_NOTE);
  });

  it('wears the button family at its quiet size rather than a bank-only control', () => {
    mount();
    expect([...byId('bank-mode-swap').classList]).toEqual(['btn', 'btn-quiet', 'bank-toggle']);
    expect([...byId('bank-search').classList]).toEqual(['input', 'bank-search']);
  });

  it('marks the current rearrange mode and switches it', () => {
    const { read } = mount();
    expect(byId('bank-mode-swap').getAttribute('aria-pressed')).toBe('true');
    byId('bank-mode-insert').click();
    expect(read().mode).toBe('insert');
    expect(byId('bank-mode-insert').getAttribute('aria-pressed')).toBe('true');
    expect(byId('bank-mode-swap').getAttribute('aria-pressed')).toBe('false');
  });

  it('switches the quantity', () => {
    const { read } = mount();
    byId('bank-qty-all').click();
    expect(read().quantity).toBe('all');
    expect(byId('bank-qty-all').getAttribute('aria-pressed')).toBe('true');
    expect(byId('bank-qty-1').getAttribute('aria-pressed')).toBe('false');
  });

  it('reports what is typed into the always-visible box', () => {
    const { read } = mount();
    const input = byId('bank-search') as HTMLInputElement;
    input.value = 'Coin';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(read().search).toBe('coin');
  });

  it('keeps the box in the DOM across an unrelated render so the caret is not lost', () => {
    const { bar, read } = mount();
    const input = byId('bank-search') as HTMLInputElement;
    input.value = 'coin';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    byId('bank-mode-insert').click();
    expect(read().mode).toBe('insert');
    expect(document.getElementById('bank-search')).toBe(input);
    expect(input.value).toBe('coin');
    bar.render();
    expect(document.getElementById('bank-search')).toBe(input);
  });
});

/**
 * FINAL REVIEW, finding 8. render() synced searchInput.value to deps.search(), which is the
 * trimmed, lower-cased key the pane filters on - so every render rewrote what the player had
 * typed. Deleting the sync line failed nothing either, so both directions are pinned here.
 */
describe('the search box and the filter it feeds', () => {
  function withSearch(initial: string) {
    document.body.innerHTML = '';
    let search = initial;
    const bar = createBottomBar({
      mode: () => 'swap', setMode: () => { bar.render(); },
      quantity: () => 1, setQuantity: () => {},
      search: () => search, setSearch: next => { search = next; }
    });
    document.body.appendChild(bar.el);
    bar.render();
    return { bar, read: () => search };
  }

  it('never rewrites what the player typed', () => {
    const { bar, read } = withSearch('');
    const input = document.getElementById('bank-search') as HTMLInputElement;
    input.value = '  Coins ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(read()).toBe('coins');

    // Any other control on the strip re-renders it. The caret must find the same text it left.
    byId('bank-mode-insert').click();
    bar.render();
    expect(input.value).toBe('  Coins ');
    expect(read()).toBe('coins');
  });

  it('does adopt a filter the box did not produce, so a reopened box shows what is filtering', () => {
    // The owner re-reads its state and renders; the box has to show the live filter rather than
    // sitting empty over a pane that is already filtered.
    const { bar } = withSearch('coins');
    bar.render();
    expect((document.getElementById('bank-search') as HTMLInputElement).value).toBe('coins');
  });
});

/**
 * The same strip, driven through the window that composes it. Moved here from `view.test.ts`
 * when Task 17 split that file: these cases are about the footer's own controls (the rearrange
 * mode, and the search box the pane filters on), and the module they exercise is this one. The
 * mount scaffolding is duplicated rather than shared, on Task 10's precedent: a bank window needs
 * a store, an icon cache, a menu registry and a storage stub, and a helper module for one extra
 * caller would be further from the assertions than the ten lines it saves.
 */
describe('the strip inside the bank window', () => {
  const INFO: Record<number, ObjInfo> = {
    995: { name: 'Coins', examine: 'Lovely money!', cost: 1, stackable: true, noted: false },
    1038: { name: 'Red partyhat', examine: 'A nice hat.', cost: 1, stackable: false, noted: false }
  };
  const icons: IconCache = { peek: () => null, load: async () => null, prime: async () => {}, onChange: () => () => {} };

  /** Slot 1 holds an obj INFO has never heard of, standing in for a model still streaming. */
  function withUnknown(): BankState['items'] {
    const items = filledItems(6);
    items[1] = { slot: 1, obj: 4151, count: 1 };
    return items;
  }

  function mountWindow(over: Partial<BankState> = {}) {
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

  it('sends a swap in swap mode and an insert in insert mode', () => {
    const { win, fake } = mountWindow({ items: filledItems(8), used: 8 });
    win.open();
    const cells = Array.from(document.querySelectorAll<HTMLElement>('[data-bank-slot]'));
    cells[0].focus();
    cells[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    cells[3].focus();
    cells[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(fake.submitted).toEqual([{ op: 'swap', a: 0, b: 3 }]);

    byId('bank-mode-insert').click();
    cells[0].focus();
    cells[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    cells[2].focus();
    cells[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(fake.submitted[1]).toEqual({ op: 'insert', from: 0, to: 2 });
  });

  it('remembers the rearrange mode across a close and reopen', () => {
    const { win } = mountWindow();
    win.open();
    byId('bank-mode-insert').click();
    win.close();
    win.open();
    expect(byId('bank-mode-insert').getAttribute('aria-pressed')).toBe('true');
  });

  it('dims what does not match', () => {
    const { win } = mountWindow();
    win.open();
    const input = byId('bank-search') as HTMLInputElement;
    input.value = 'partyhat';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelector('[data-bank-slot="0"]')!.classList.contains('dim')).toBe(true);
    expect(document.querySelector('[data-bank-slot="1"]')!.classList.contains('dim')).toBe(false);
  });

  it('undims everything again when the box is emptied', () => {
    const { win } = mountWindow();
    win.open();
    const input = byId('bank-search') as HTMLInputElement;
    input.value = 'partyhat';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelectorAll('[data-bank-slot].dim')).toHaveLength(0);
  });

  it('matches on the obj id while the model is still streaming', () => {
    const { win } = mountWindow({ items: withUnknown() });
    win.open();
    const input = byId('bank-search') as HTMLInputElement;
    input.value = '4151';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelector('[data-bank-slot="1"]')!.classList.contains('dim')).toBe(false);
    expect(document.querySelector('[data-bank-slot="0"]')!.classList.contains('dim')).toBe(true);
  });
});
