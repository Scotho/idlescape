// web/src/bank/view.drag.test.ts -- the composed pointer path through the whole window.
//
// This file exists because nothing could execute that path before it. view.ts hands gridInput
// `hitTest: document.elementFromPoint`, and jsdom does not implement elementFromPoint at all: it
// throws the moment a drag passes the 4px threshold. So every seam that only a completed drag
// reaches (tabs.tabAt, the 'new' tab arithmetic, the close-mid-drag path) went untested, and a
// mutation to any of them failed nothing. The stub below is the smallest thing that closes that:
// the test says what is under the pointer, exactly as the harness in gridInput.harness.ts does.
import { describe, expect, it, vi } from 'vitest';
import { createBankWindow } from './view';
import { createMenuRegistry, contractsStubs } from './contextMenu';
import { installPointerEvent } from './gridInput.harness';
import { fakeBankStore, filledItems } from './store.fake';
import type { BankState } from './store';
import type { IconCache } from './icons';
import type { ObjInfo } from './types';

installPointerEvent();

let hit: Element | null = null;
document.elementFromPoint = () => hit;

const INFO: Record<number, ObjInfo> = {
  995: { name: 'Coins', examine: 'Lovely money!', cost: 1, stackable: true, noted: false },
  1038: { name: 'Red partyhat', examine: 'A nice hat.', cost: 1, stackable: false, noted: false }
};

const icons: IconCache = { peek: () => null, load: async () => null, prime: async () => {}, onChange: () => () => {} };

function mount(over: Partial<BankState> = {}) {
  document.body.innerHTML = '';
  hit = null;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const fake = fakeBankStore(over);
  const registry = createMenuRegistry();
  for (const stub of contractsStubs()) registry.register(stub);
  const onClose = vi.fn();
  const notify = vi.fn();
  const win = createBankWindow(host, {
    store: fake.store, icons, info: obj => INFO[obj] ?? null, registry, notify, onClose,
    storage: { get: () => null, set: () => {} }
  });
  win.open();
  const cells = Array.from(win.el.querySelectorAll<HTMLElement>('[data-bank-slot]'));
  const pane = win.el.querySelector<HTMLElement>('.bank-pane')!;
  return { win, fake, onClose, notify, cells, pane };
}

const down = (cell: HTMLElement): void => {
  cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, pointerId: 1, clientX: 0, clientY: 0 }));
};
/** Past DRAG_THRESHOLD_PX, so the press becomes a real drag. `buttons: 1` says the left button is
 *  still held: gridInput abandons a move that arrives with buttons === 0, which is how it notices
 *  a release the page never saw. */
const moveOver = (target: Element | null): void => {
  hit = target;
  document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, buttons: 1, clientX: 60, clientY: 0 }));
};
const up = (): void => {
  document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, buttons: 0, clientX: 60, clientY: 0 }));
};
/** A real keydown is cancelable; preventDefault is how gridInput tells the window a key is spent. */
const escape = (target: EventTarget): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

describe('a drag that completes inside the pane', () => {
  it('reports a swap between the two slots it actually crossed', () => {
    const { fake, cells, pane } = mount({ items: filledItems(6), used: 6 });
    down(cells[0]);
    moveOver(cells[3]);
    expect(pane.classList.contains('is-dragging')).toBe(true);
    up();
    expect(fake.submitted).toEqual([{ op: 'swap', a: 0, b: 3 }]);
  });
});

describe('a drag that ends on a tab header', () => {
  it('moves the item into that tab, which is the only thing tabs.tabAt is for', () => {
    const { win, fake, cells } = mount({ tabs: [1] });
    down(cells[1]);
    moveOver(win.el.querySelector('[data-bank-tab="1"]'));
    up();
    expect(fake.submitted).toEqual([{ op: 'moveToTab', slot: 1, tab: 1 }]);
  });

  it('resolves a nested node inside the header, not just the button itself', () => {
    const { win, fake, cells } = mount({ tabs: [1] });
    const glyph = win.el.querySelector('[data-bank-tab="1"] .bank-tab-glyph, [data-bank-tab="1"] span');
    expect(glyph).not.toBeNull();
    down(cells[1]);
    moveOver(glyph);
    up();
    expect(fake.submitted).toEqual([{ op: 'moveToTab', slot: 1, tab: 1 }]);
  });

  it('makes the plus tab the NEXT tab index, not the last existing one', () => {
    const { win, fake, cells } = mount({ tabs: [1] });
    down(cells[1]);
    moveOver(win.el.querySelector('[data-bank-tab-new]'));
    up();
    // One tab exists, so the new one is tab 2. `tabs.length` instead of `tabs.length + 1` would
    // silently drop the item into the tab it came from.
    expect(fake.submitted).toEqual([{ op: 'moveToTab', slot: 1, tab: 2 }]);
  });

  it('refuses a tenth tab and says why', () => {
    const { fake, notify, cells } = mount({ tabs: [1, 1, 1, 1, 1, 1, 1, 1, 1], used: 9 });
    // The plus tab is not rendered at nine tabs, so this stands in for the layout shrinking under
    // a pointer that is already down: a stray node still answering 'new' to tabAt.
    const stale = document.createElement('div');
    stale.setAttribute('data-bank-tab-new', '');
    document.body.appendChild(stale);
    down(cells[1]);
    moveOver(stale);
    up();
    expect(fake.submitted).toEqual([]);
    expect(notify).toHaveBeenCalledWith('The bank already has nine tabs.');
  });
});

describe('Escape during a drag', () => {
  it('cancels the drag and leaves the window open', () => {
    const { win, fake, onClose, cells, pane } = mount();
    down(cells[0]);
    moveOver(cells[3]);
    const event = escape(cells[0]);
    expect(event.defaultPrevented).toBe(true);
    expect(win.isOpen()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(pane.classList.contains('is-dragging')).toBe(false);
    up();
    expect(fake.submitted).toEqual([]);
  });

  it('closes the window on the second press, once the drag is gone', () => {
    const { win, onClose, cells } = mount();
    down(cells[0]);
    moveOver(cells[3]);
    escape(cells[0]);
    escape(cells[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(win.isOpen()).toBe(false);
  });
});

describe('closing with a pointer still down', () => {
  it('quiesces the gesture: nothing is reported after the close and nothing is left painted', () => {
    const { win, fake, notify, cells, pane } = mount({ tabs: [1] });
    down(cells[1]);
    moveOver(cells[3]);
    expect(pane.classList.contains('is-dragging')).toBe(true);
    win.close();
    expect(pane.classList.contains('is-dragging')).toBe(false);
    // The document-level listeners were bound by the press, so this is the release of a gesture
    // that was genuinely in the air when the window went away.
    up();
    expect(fake.submitted).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
  });

  it('does not report a tab drop for a window that is gone', () => {
    const { win, fake, cells } = mount({ tabs: [1] });
    down(cells[1]);
    moveOver(win.el.querySelector('[data-bank-tab="1"]'));
    win.close();
    up();
    expect(fake.submitted).toEqual([]);
  });

  it('reopens clean rather than mid-drag', () => {
    const { win, fake, cells, pane } = mount({ items: filledItems(6), used: 6 });
    down(cells[0]);
    moveOver(cells[3]);
    win.close();
    win.open();
    expect(pane.className).toBe('bank-pane');
    expect(win.el.querySelectorAll('.is-source, .is-target')).toHaveLength(0);
    const reopened = Array.from(win.el.querySelectorAll<HTMLElement>('[data-bank-slot]'));
    down(reopened[1]);
    moveOver(reopened[3]);
    up();
    // Still drivable: close() must quiesce the gesture without detaching the root listeners.
    expect(fake.submitted).toEqual([{ op: 'swap', a: 1, b: 3 }]);
  });
});
