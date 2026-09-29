import { describe, expect, it, vi } from 'vitest';
import { BANK_TITLE, createBankWindow } from './view';
import { BANK_FOOTER_NOTE } from '../ui/copy';
import { createMenuRegistry, contractsStubs } from './contextMenu';
import { fakeBankStore, filledItems } from './store.fake';
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
  const onClose = vi.fn();
  const notify = vi.fn();
  const store: Record<string, string> = {};
  const win = createBankWindow(host, {
    store: fake.store, icons, info: obj => INFO[obj] ?? null, registry, notify, onClose,
    storage: { get: key => store[key] ?? null, set: (key, value) => { store[key] = value; } }
  });
  return { win, fake, onClose, notify, registry };
}

const byId = (id: string): HTMLElement => document.getElementById(id)!;
const menuRows = (): string[] => Array.from(document.querySelectorAll<HTMLElement>('#bank-menu [data-bank-menu-entry]')).map(r => r.dataset.bankMenuEntry!);
const rightClick = (el: Element): void => { el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 })); };

describe('opening and closing', () => {
  it('is a labelled dialog carrying the OSRS title', () => {
    const { win } = mount();
    win.open();
    expect(byId('bank-window').getAttribute('role')).toBe('dialog');
    expect(byId('bank-window').getAttribute('aria-label')).toBe(BANK_TITLE);
    expect(byId('bank-window').textContent).toContain(BANK_TITLE);
  });

  it('leaves the store running on open and on close: it is the frame\'s, not the window\'s', () => {
    // Ruling R10. The store used to be started here and stopped in releaseSession(), which meant
    // the Events feed recorded a bank change only while somebody was looking at the bank.
    const { win, fake } = mount();
    win.open();
    expect(fake.calls.start).toBe(0);
    expect(win.isOpen()).toBe(true);
    expect(fake.listenerCount()).toBe(1);
    win.close();
    expect(fake.calls.stop).toBe(0);
    expect(win.isOpen()).toBe(false);
    // The subscription is still the window's, and it goes with the window.
    expect(fake.listenerCount()).toBe(0);
  });

  it('destroy releases the subscription and still leaves the store running', () => {
    const { win, fake } = mount();
    win.open();
    win.destroy();
    expect(fake.listenerCount()).toBe(0);
    expect(fake.calls.stop).toBe(0);
  });

  it('closes on the x and on Escape, telling the shell each time', () => {
    const { win, onClose } = mount();
    win.open();
    byId('bank-close').click();
    expect(onClose).toHaveBeenCalledTimes(1);
    win.open();
    // Not cancelable, and that is fine HERE because nothing tries to prevent this one. Do not
    // copy the shape: preventDefault() on a non-cancelable event is silently a no-op, so a test
    // of the Escape that CANCELS A DRAG written this way asserts the opposite of what a browser
    // does. Those tests pass cancelable: true. See view.drag.test.ts.
    byId('bank-window').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(win.isOpen()).toBe(false);
  });

  it('moves focus into the window on open and gives it back on close', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { win } = mount();
    win.open();
    expect(byId('bank-window').contains(document.activeElement)).toBe(true);
    win.close();
    expect(document.activeElement).toBe(document.body);
  });
});

describe('the v2 window chrome', () => {
  it('is a centred window on the warm ground, wearing the shared family (D22)', () => {
    const { win } = mount();
    win.open();
    const el = byId('bank-window');
    // The bank is the window family's ONE modifier and Task 7 already wrote it: the ground, the
    // header gradient and the heavier shadow are `.window-warm`, the placement and the header's
    // 8px 12px padding are `.window-centred`. layout/bank.css owns the width and what is inside.
    expect([...el.classList]).toEqual(['window', 'window-warm', 'window-centred', 'bank-window']);
    const head = el.querySelector('.window-head')!;
    expect(head.parentElement).toBe(el);
    // The header row is the family's WHOLE. It wore a `bank-head` too, which layout/bank.css
    // never styled and styles/bank.test.ts's class contract could not see, so the class list is
    // pinned here: a bank-only name on this row has to earn a rule and a contract row first.
    expect([...head.classList]).toEqual(['window-head']);
    expect(el.querySelector('.window-title')?.textContent).toBe(BANK_TITLE);
    expect(BANK_TITLE).toBe('Bank of Gielinor');
    // `window-sub` is load-bearing and was unpinned: it is the ONLY source of the mock's muted
    // capacity colour (--text-muted #7c7c7a). `.bank-capacity` sets flex, size and tabular
    // figures and no colour at all, so dropping the family class renders the capacity at --text.
    expect([...byId('bank-capacity').classList]).toEqual(['window-sub', 'bank-capacity']);
  });

  it('keeps #bank-capacity in the "N / 240" format the e2e helper polls for', () => {
    const { win } = mount();
    win.open();
    // helpers.ts's openBankWindow polls this with /^\d+ \/ 240$/ for 20 seconds; a separator or
    // a suffix here turns every bank e2e failure into a timeout instead of a readable assertion.
    expect(byId('bank-capacity').textContent).toMatch(/^\d+ \/ 240$/);
  });

  it('shows the live badge as a Badge with a dot, not a bespoke pill', () => {
    const { win, fake } = mount();
    win.open();
    const b = document.querySelector('.bank-live')!;
    expect(b.className).toBe('badge badge-ok bank-live');
    expect(b.querySelector('.badge-dot')).not.toBeNull();
    expect(b.textContent).toBe('live');
    // Polling is the same badge with the family's neutral tone, so the dot greys with it rather
    // than staying green over the word "polling".
    fake.push({ live: false });
    expect(document.querySelector('.bank-live')!.className).toBe('badge bank-live');
    expect(document.querySelector('.bank-live .badge-dot')).not.toBeNull();
  });

  it('closes on a shared window-close control rather than a bank-only one', () => {
    const { win, onClose } = mount();
    win.open();
    const close = byId('bank-close');
    expect([...close.classList]).toEqual(['btn', 'btn-icon', 'window-close']);
    expect(close.textContent).toBe('×');
    close.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the footer README never describes: modes, quantities, search and the caption', () => {
    const { win } = mount();
    win.open();
    expect([...document.querySelectorAll('.bank-bottom .bank-toggle')].map(b => b.textContent))
      .toEqual(['Swap', 'Insert', '1', '5', 'All']);
    expect(document.querySelector('.bank-search')?.getAttribute('placeholder')).toBe('Search');
    expect(document.querySelector('.bank-note')?.textContent).toBe(BANK_FOOTER_NOTE);
  });

  it('draws an empty slot legibly with no icon at all (the no-client case)', () => {
    // Ruling R14's caveat: with no character open `deps.client()` is null, `icons.peek` answers
    // null for everything, and the slot has to read without an icon. The count and the name tile
    // are what carry it; nothing icon-shaped is drawn in the gap.
    const items = filledItems(2);
    items[0] = { slot: 0, obj: 995, count: 250_000 };
    const { win } = mount({ items, used: 2 });
    win.open();
    const slot = document.querySelector('[data-bank-slot="0"]')!;
    expect(slot.querySelector('.bank-count')?.textContent).toBe('250K');
    expect(slot.querySelector('img')).toBeNull();
    expect(slot.querySelector('.bank-fallback')?.textContent).toBe('Coins');
  });
});

describe('the chrome', () => {
  it('shows used against capacity and follows the store', () => {
    const { win, fake } = mount();
    win.open();
    expect(byId('bank-capacity').textContent).toBe('2 / 240');
    fake.push({ used: 7 });
    expect(byId('bank-capacity').textContent).toBe('7 / 240');
  });

  it('says whether live updates are connected', () => {
    const { win, fake } = mount();
    win.open();
    expect(byId('bank-live').textContent).toBe('live');
    fake.push({ live: false });
    expect(byId('bank-live').textContent).toBe('polling');
  });

  it('shows a load error instead of pretending the bank is empty', () => {
    const { win, fake } = mount();
    win.open();
    fake.push({ error: 'The bank is not reachable right now. Try again in a moment.' });
    expect(byId('bank-window').textContent).toContain('not reachable');
  });
});

describe('the item menu', () => {
  it('is Contracts entries, then one Move to tab per tab, then Examine, then Cancel', () => {
    const { win } = mount({ tabs: [1] });
    win.open();
    rightClick(document.querySelector('[data-bank-slot="1"]')!);
    expect(menuRows()).toEqual(['sell', 'buy', 'move-to-tab-1', 'move-to-new-tab', 'examine', 'cancel']);
  });

  it('offers no new tab once nine exist', () => {
    const { win } = mount({ tabs: [1, 1, 1, 1, 1, 1, 1, 1, 1], used: 9 });
    win.open();
    rightClick(document.querySelector('[data-bank-slot="1"]')!);
    expect(menuRows()).not.toContain('move-to-new-tab');
  });

  it('submits a moveToTab from the menu', () => {
    const { win, fake } = mount({ tabs: [1] });
    win.open();
    rightClick(document.querySelector('[data-bank-slot="1"]')!);
    document.querySelector<HTMLElement>('[data-bank-menu-entry="move-to-tab-1"]')!.click();
    expect(fake.submitted).toEqual([{ op: 'moveToTab', slot: 1, tab: 1 }]);
  });

  it('asks for the next tab index when Move to new tab is chosen', () => {
    const { win, fake } = mount({ tabs: [1] });
    win.open();
    rightClick(document.querySelector('[data-bank-slot="1"]')!);
    document.querySelector<HTMLElement>('[data-bank-menu-entry="move-to-new-tab"]')!.click();
    expect(fake.submitted).toEqual([{ op: 'moveToTab', slot: 1, tab: 2 }]);
  });

  it('examines into the status line rather than a chat box', () => {
    const { win } = mount();
    win.open();
    rightClick(document.querySelector('[data-bank-slot="0"]')!);
    document.querySelector<HTMLElement>('[data-bank-menu-entry="examine"]')!.click();
    expect(byId('bank-status').textContent).toBe('Lovely money!');
  });

  it('lets SP9 take the Sell entry over by re-registering the id', () => {
    const { win, registry } = mount();
    const sell = vi.fn();
    registry.register({ id: 'sell', label: 'Sell...', enabled: true, run: sell });
    win.open();
    rightClick(document.querySelector('[data-bank-slot="0"]')!);
    document.querySelector<HTMLElement>('[data-bank-menu-entry="sell"]')!.click();
    expect(sell).toHaveBeenCalledWith({ slot: 0, obj: 995, count: 500, info: INFO[995] });
  });

  it('never offers to move an item into the tab it is already in', () => {
    const { win } = mount({ tabs: [2] });
    win.open();
    rightClick(document.querySelector('[data-bank-slot="0"]')!);
    expect(menuRows()).not.toContain('move-to-tab-1');
    expect(menuRows()).toContain('move-to-new-tab');
  });

  it('does not open a menu on an empty slot', () => {
    const { win } = mount();
    win.open();
    rightClick(document.querySelector('[data-bank-slot="5"]')!);
    expect(document.getElementById('bank-menu')).toBeNull();
  });
});

describe('the tab menu and the web-only sort helpers (owner decision 3)', () => {
  it('offers sort by value, name and id on a tab', () => {
    const { win } = mount({ tabs: [2] });
    win.open();
    rightClick(document.querySelector('[data-bank-tab="1"]')!);
    expect(menuRows()).toEqual(['sort-value', 'sort-name', 'sort-id', 'cancel']);
  });

  it('submits the sort op for that tab', () => {
    const { win, fake } = mount({ tabs: [2] });
    win.open();
    rightClick(document.querySelector('[data-bank-tab="1"]')!);
    document.querySelector<HTMLElement>('[data-bank-menu-entry="sort-value"]')!.click();
    expect(fake.submitted).toEqual([{ op: 'sort', tab: 1, by: 'value' }]);
  });

  it('submits a sort by id, the third helper', () => {
    const { win, fake } = mount({ tabs: [2] });
    win.open();
    rightClick(document.querySelector('[data-bank-tab="1"]')!);
    document.querySelector<HTMLElement>('[data-bank-menu-entry="sort-id"]')!.click();
    expect(fake.submitted).toEqual([{ op: 'sort', tab: 1, by: 'id' }]);
  });

  it('sorts the main tab from the All items tab', () => {
    const { win, fake } = mount({ tabs: [2] });
    win.open();
    rightClick(document.querySelector('[data-bank-tab="0"]')!);
    document.querySelector<HTMLElement>('[data-bank-menu-entry="sort-name"]')!.click();
    expect(fake.submitted).toEqual([{ op: 'sort', tab: 0, by: 'name' }]);
  });

  it('never offers a sort on the plus tab', () => {
    const { win } = mount({ tabs: [2] });
    win.open();
    rightClick(document.querySelector('[data-bank-tab-new]')!);
    expect(document.getElementById('bank-menu')).toBeNull();
  });
});

/** Slot 1 holds an obj the INFO table above has never heard of, standing in for a model that has
 *  not streamed out of the game client yet. */
function withUnknown(): BankState['items'] {
  const items = filledItems(6);
  items[1] = { slot: 1, obj: 4151, count: 1 };
  return items;
}

describe('an item whose model has not streamed yet', () => {
  // BINDING, from Task 9's review: nameOf is the input layer's occupancy oracle, so an occupied
  // slot with no ObjInfo must name itself by its obj id rather than reading as empty. Returning
  // null here makes the item silently undraggable, and the search-filter test above cannot see
  // that: grid.ts computes its own match name and never calls nameOf.
  it('is still pickable up, and names itself by its obj id', () => {
    const { win } = mount({ items: withUnknown(), used: 6 });
    win.open();
    const cell = document.querySelector<HTMLElement>('[data-bank-slot="1"]')!;
    cell.focus();
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(byId('bank-status').textContent).toContain('Picked up 4151');
  });

  it('is still movable, so the move actually reaches the store', () => {
    const { win, fake } = mount({ items: withUnknown(), used: 6 });
    win.open();
    const cells = Array.from(document.querySelectorAll<HTMLElement>('[data-bank-slot]'));
    cells[1].focus();
    cells[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    cells[4].focus();
    cells[4].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(fake.submitted).toEqual([{ op: 'swap', a: 1, b: 4 }]);
  });
});

describe('the tab selection', () => {
  it('keeps keyboard focus in the strip when the selection moves', () => {
    const { win } = mount({ tabs: [1] });
    win.open();
    const all = document.querySelector<HTMLElement>('[data-bank-tab="0"]')!;
    all.focus();
    // tabs.render ends in replaceChildren, which detaches the button under the player's focus.
    all.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    // Automatic activation: focus must be ON the tab that is now selected, not merely somewhere
    // in the strip. The strip's keydown calls onSelect without focusing first, so at render time
    // the focused node is still tab 0 while the roving tabindex has moved to tab 1.
    expect(document.activeElement).toBe(document.querySelector('[data-bank-tab][aria-selected="true"]'));
    expect(document.activeElement).toBe(document.querySelector('[data-bank-tab][tabindex="0"]'));
    expect(document.activeElement).toBe(document.querySelector('[data-bank-tab="1"]'));
    expect(byId('bank-window').contains(document.activeElement)).toBe(true);
  });

  it('follows the selection through End and Home too', () => {
    const { win } = mount({ tabs: [1, 1] });
    win.open();
    const all = document.querySelector<HTMLElement>('[data-bank-tab="0"]')!;
    all.focus();
    all.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(document.querySelector('[data-bank-tab="2"]'));
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(document.querySelector('[data-bank-tab="0"]'));
  });

  it('leaves focus alone when the strip did not have it', () => {
    const { win, fake } = mount({ tabs: [1] });
    win.open();
    const cell = document.querySelector<HTMLElement>('[data-bank-slot="0"]')!;
    cell.focus();
    fake.push({ used: 3 });
    expect(document.activeElement).toBe(document.querySelector('[data-bank-slot="0"]'));
  });

  it('falls back to All items when the selected tab disappears', () => {
    const { win, fake } = mount({ tabs: [1] });
    win.open();
    document.querySelector<HTMLElement>('[data-bank-tab="1"]')!.click();
    expect(document.querySelector('[data-bank-tab="1"]')!.getAttribute('aria-selected')).toBe('true');
    fake.push({ tabs: [] });
    expect(document.querySelector('[data-bank-tab="0"]')!.getAttribute('aria-selected')).toBe('true');
  });
});
