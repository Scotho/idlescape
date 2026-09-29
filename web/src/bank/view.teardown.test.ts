// web/src/bank/view.teardown.test.ts -- the window owns five releasable things and destroy()
// has to release all five. This sub-project has shipped four lifecycle leaks, three of them past
// tests that only checked for the absence of timers, so nothing here asserts an absence: every
// test drives the thing that would have fired and asserts that nothing moved.
import { describe, expect, it, vi } from 'vitest';
import { createBankWindow } from './view';
import { createMenuRegistry, contractsStubs } from './contextMenu';
import { installPointerEvent } from './gridInput.harness';
import { fakeBankStore } from './store.fake';
import type { IconCache } from './icons';
import type { ObjInfo } from './types';

// jsdom 26 has no PointerEvent; the harness installs the same stand-in gridInput's own tests use.
installPointerEvent();

const INFO: Record<number, ObjInfo> = {
  995: { name: 'Coins', examine: 'Lovely money!', cost: 1, stackable: true, noted: false },
  1038: { name: 'Red partyhat', examine: 'A nice hat.', cost: 1, stackable: false, noted: false }
};

/** An IconCache that reports how many listeners are still subscribed and can fire them on
 *  demand. IconCache is a cross-window singleton in the real shell, so a listener the window
 *  fails to release outlives the window that made it, for the life of the page. */
function controllableIcons(): { cache: IconCache; art: Record<number, string>; fire(): void; listeners(): number } {
  const listeners = new Set<() => void>();
  const art: Record<number, string> = {};
  return {
    art,
    cache: {
      peek: obj => art[obj] ?? null,
      load: async obj => art[obj] ?? null,
      prime: async () => {},
      onChange(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; }
    },
    fire() { for (const fn of [...listeners]) fn(); },
    listeners: () => listeners.size
  };
}

function mount() {
  document.body.innerHTML = '';
  const host = document.createElement('div');
  document.body.appendChild(host);
  const fake = fakeBankStore();
  const icons = controllableIcons();
  const registry = createMenuRegistry();
  for (const stub of contractsStubs()) registry.register(stub);
  const onClose = vi.fn();
  const win = createBankWindow(host, {
    store: fake.store, icons: icons.cache, info: obj => INFO[obj] ?? null, registry,
    notify: vi.fn(), onClose,
    storage: { get: () => null, set: () => {} }
  });
  return { win, fake, icons, onClose, host };
}

describe('destroy releases the store subscription, and never the store', () => {
  it('drops the subscription and never renders another state', () => {
    const { win, fake } = mount();
    win.open();
    const capacity = document.getElementById('bank-capacity')!;
    expect(capacity.textContent).toBe('2 / 240');
    win.destroy();
    // The store is a frame-lifetime singleton since Task 11 (ruling R10): the window releases
    // its own subscription and leaves the store to frame/singletons.ts.
    expect(fake.calls.stop).toBe(0);
    expect(fake.listenerCount()).toBe(0);
    fake.push({ used: 99, live: false, error: 'Something went wrong.' });
    expect(capacity.textContent).toBe('2 / 240');
    expect(win.el.textContent).not.toContain('Something went wrong.');
  });

  it('leaves the store alone even when the window was never opened', () => {
    const { win, fake } = mount();
    win.destroy();
    expect(fake.calls.stop).toBe(0);
    expect(fake.listenerCount()).toBe(0);
  });
});

describe('destroy releases both icon-cache listeners', () => {
  it('leaves the singleton with no subscribers at all', () => {
    const { win, icons } = mount();
    // One from the grid, one from the tab bar. Both are taken at construction, not at open, so
    // an open/close/open cycle cannot accumulate them and destroy is the only thing that frees
    // them: a window built and thrown away without ever being opened still has to release these.
    expect(icons.listeners()).toBe(2);
    win.open();
    expect(icons.listeners()).toBe(2);
    win.close();
    win.open();
    expect(icons.listeners()).toBe(2);
    win.destroy();
    expect(icons.listeners()).toBe(0);
  });

  it('fences a repaint that was already queued when destroy ran', async () => {
    const { win, icons } = mount();
    win.open();
    expect(win.el.querySelectorAll('img.bank-icon')).toHaveLength(0);
    icons.art[995] = 'data:image/png;base64,COIN';
    // grid.ts coalesces onChange onto a microtask, so this repaint is in flight, not done.
    icons.fire();
    win.destroy();
    await Promise.resolve();
    await Promise.resolve();
    expect(win.el.querySelectorAll('img.bank-icon')).toHaveLength(0);
  });
});

describe('destroy releases the grid input layer', () => {
  it('a keyboard move on a cell that outlived the window submits nothing and announces nothing', () => {
    const { win, fake } = mount();
    win.open();
    const cells = Array.from(win.el.querySelectorAll<HTMLElement>('[data-bank-slot]'));
    const status = document.getElementById('bank-status')!;
    win.destroy();
    cells[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    cells[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(fake.submitted).toEqual([]);
    expect(status.textContent).toBe('');
  });

  it('a pointer drag started before destroy never becomes a drag after it', () => {
    const { win, fake } = mount();
    win.open();
    const pane = win.el.querySelector<HTMLElement>('.bank-pane')!;
    const cells = Array.from(win.el.querySelectorAll<HTMLElement>('[data-bank-slot]'));
    cells[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 0, clientY: 0 }));
    win.destroy();
    // The document-level move and up listeners are bound by the press, not by attach, so this is
    // the gesture that was genuinely already in the air when destroy ran.
    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 60, clientY: 0 }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 60, clientY: 0 }));
    expect(pane.classList.contains('is-dragging')).toBe(false);
    expect(win.el.querySelectorAll('.is-source, .is-target')).toHaveLength(0);
    expect(fake.submitted).toEqual([]);
  });
});

describe('destroy leaves the window inert', () => {
  it('does not call onClose, cannot be reopened, and is safe to call twice', () => {
    const { win, fake, onClose, icons } = mount();
    win.open();
    win.destroy();
    win.destroy();
    expect(onClose).not.toHaveBeenCalled();
    expect(fake.calls.stop).toBe(0);
    expect(icons.listeners()).toBe(0);
    win.open();
    expect(win.isOpen()).toBe(false);
    expect(fake.listenerCount()).toBe(0);
    expect(document.getElementById('bank-window')).toBeNull();
  });

  it('takes the context menu down with it', () => {
    const { win } = mount();
    win.open();
    win.el.querySelector('[data-bank-slot="0"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    expect(document.getElementById('bank-menu')).not.toBeNull();
    win.destroy();
    expect(document.getElementById('bank-menu')).toBeNull();
  });
});

describe('close is not destroy', () => {
  it('an open, close, reopen cycle leaves exactly one of everything', () => {
    const { win, fake, icons } = mount();
    win.open();
    win.close();
    win.open();
    expect(icons.listeners()).toBe(2);
    expect(fake.listenerCount()).toBe(1);
    expect(fake.calls.start).toBe(0);
    expect(fake.calls.stop).toBe(0);
    win.destroy();
    expect(icons.listeners()).toBe(0);
    expect(fake.listenerCount()).toBe(0);
  });

  it('takes the context menu down on a plain close too', () => {
    const { win } = mount();
    win.open();
    win.el.querySelector('[data-bank-slot="0"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    expect(document.getElementById('bank-menu')).not.toBeNull();
    win.close();
    // Left open, the menu strands its own document pointerdown listener and stays in the host.
    expect(document.getElementById('bank-menu')).toBeNull();
  });

  it('a state pushed after close is not rendered', () => {
    const { win, fake } = mount();
    win.open();
    const capacity = document.getElementById('bank-capacity')!;
    win.close();
    fake.push({ used: 42 });
    expect(capacity.textContent).toBe('2 / 240');
  });
});
