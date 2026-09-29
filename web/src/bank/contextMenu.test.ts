// web/src/bank/contextMenu.test.ts
import { describe, expect, it, vi } from 'vitest';
import { CONTRACTS_HINT, contractsStubs, createBankMenu, createMenuRegistry } from './contextMenu';
import type { MenuEntry, MenuItemContext } from './types';

const CTX: MenuItemContext = {
  slot: 2, obj: 1038, count: 1,
  info: { name: 'Red partyhat', examine: 'A nice hat.', cost: 1, stackable: false, noted: false }
};

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return createBankMenu({ host });
}

const rows = (menu: { el: HTMLElement }): HTMLElement[] => Array.from(menu.el.querySelectorAll<HTMLElement>('[data-bank-menu-entry]'));

describe('the registry', () => {
  it('keeps registration order', () => {
    const registry = createMenuRegistry();
    registry.register({ id: 'a', label: 'A', enabled: true, run: () => {} });
    registry.register({ id: 'b', label: 'B', enabled: true, run: () => {} });
    expect(registry.entries().map(e => e.id)).toEqual(['a', 'b']);
  });

  it('lets a later registration replace an entry in place, which is how SP9 takes over', () => {
    const registry = createMenuRegistry();
    for (const stub of contractsStubs()) registry.register(stub);
    const real = vi.fn();
    registry.register({ id: 'sell', label: 'Sell...', enabled: true, run: real });
    expect(registry.entries().map(e => e.id)).toEqual(['sell', 'buy']);
    registry.entries()[0].run(CTX);
    expect(real).toHaveBeenCalledWith(CTX);
  });
});

describe('the Contracts stubs', () => {
  it('are Sell and Buy more, disabled with the coming-soon hint', () => {
    const [sell, buy] = contractsStubs();
    expect(sell.id).toBe('sell');
    expect(sell.label).toBe('Sell...');
    expect(sell.enabled).toBe(false);
    expect(sell.hint).toBe(CONTRACTS_HINT);
    expect(buy.id).toBe('buy');
    expect(buy.label).toBe('Buy more...');
    expect(buy.enabled).toBe(false);
  });
});

describe('the menu', () => {
  const entry = (id: string, over: Partial<MenuEntry> = {}): MenuEntry => ({ id, label: id, enabled: true, run: () => {}, ...over });

  it('renders the rows it is given plus a Cancel, in order', () => {
    const menu = mount();
    menu.open([...contractsStubs(), entry('examine', { label: 'Examine Red partyhat' })], CTX, { x: 10, y: 10 });
    expect(rows(menu).map(r => r.dataset.bankMenuEntry)).toEqual(['sell', 'buy', 'examine', 'cancel']);
    expect(menu.isOpen()).toBe(true);
  });

  it('resolves a label and an enabled predicate against the context', () => {
    const menu = mount();
    menu.open([entry('x', { label: ctx => `Sell ${ctx.info?.name ?? ''}`, enabled: ctx => ctx.count > 1 })], CTX, { x: 0, y: 0 });
    const row = rows(menu)[0];
    expect(row.textContent).toContain('Sell Red partyhat');
    expect(row.getAttribute('aria-disabled')).toBe('true');
  });

  it('shows the hint beside a disabled row and does not run it', () => {
    const run = vi.fn();
    const menu = mount();
    menu.open([entry('sell', { enabled: false, hint: CONTRACTS_HINT, run })], CTX, { x: 0, y: 0 });
    expect(rows(menu)[0].querySelector('.bank-menu-hint')?.textContent).toBe(CONTRACTS_HINT);
    rows(menu)[0].click();
    expect(run).not.toHaveBeenCalled();
    expect(menu.isOpen()).toBe(true);
  });

  it('runs an enabled row with the context and closes', () => {
    const run = vi.fn();
    const menu = mount();
    menu.open([entry('sell', { run })], CTX, { x: 0, y: 0 });
    rows(menu)[0].click();
    expect(run).toHaveBeenCalledWith(CTX);
    expect(menu.isOpen()).toBe(false);
  });

  it('Cancel just closes', () => {
    const menu = mount();
    menu.open([entry('sell')], CTX, { x: 0, y: 0 });
    menu.el.querySelector<HTMLElement>('[data-bank-menu-entry="cancel"]')!.click();
    expect(menu.isOpen()).toBe(false);
  });

  it('is a menu, focuses the first enabled row and wraps with the arrow keys', () => {
    const menu = mount();
    menu.open([entry('a', { enabled: false }), entry('b'), entry('c')], CTX, { x: 0, y: 0 });
    expect(menu.el.getAttribute('role')).toBe('menu');
    expect(document.activeElement).toBe(rows(menu)[1]);
    menu.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(rows(menu)[2]);
    menu.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    // Past the last row it wraps to Cancel, then round to the first enabled row.
    expect(document.activeElement).toBe(rows(menu)[3]);
    menu.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(rows(menu)[1]);
  });

  it('closes on Escape and on a click outside', () => {
    const menu = mount();
    menu.open([entry('a')], CTX, { x: 0, y: 0 });
    menu.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.isOpen()).toBe(false);
    menu.open([entry('a')], CTX, { x: 0, y: 0 });
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(menu.isOpen()).toBe(false);
  });

  it('opening again replaces the previous menu rather than stacking one', () => {
    const menu = mount();
    menu.open([entry('a')], CTX, { x: 0, y: 0 });
    menu.open([entry('b')], CTX, { x: 0, y: 0 });
    expect(document.querySelectorAll('#bank-menu')).toHaveLength(1);
    expect(rows(menu).map(r => r.dataset.bankMenuEntry)).toEqual(['b', 'cancel']);
  });

  it('positions itself at the pointer', () => {
    const menu = mount();
    menu.open([entry('a')], CTX, { x: 120, y: 44 });
    expect(menu.el.style.left).toBe('120px');
    expect(menu.el.style.top).toBe('44px');
  });

  it('uses a roving tab stop: only the focused row is in the Tab order', () => {
    const menu = mount();
    menu.open([entry('a', { enabled: false }), entry('b'), entry('c')], CTX, { x: 0, y: 0 });
    const [, b, c, cancel] = rows(menu);
    expect(b.tabIndex).toBe(0);
    expect([c, cancel].map(r => r.tabIndex)).toEqual([-1, -1]);
    menu.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(c.tabIndex).toBe(0);
    expect([b, cancel].map(r => r.tabIndex)).toEqual([-1, -1]);
  });

  describe('positioning clamp against a nonzero host rect', () => {
    // jsdom never runs layout, so the only way to test the clamp is to stub
    // getBoundingClientRect on both the host and the menu with real, nonzero rects.
    function fakeRect(left: number, top: number, width: number, height: number): DOMRect {
      return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
    }

    function mountAt(hostRect: DOMRect, menuRect: DOMRect) {
      const host = document.createElement('div');
      document.body.appendChild(host);
      host.getBoundingClientRect = () => hostRect;
      const menu = createBankMenu({ host });
      menu.el.getBoundingClientRect = () => menuRect;
      return menu;
    }

    // The host spans viewport x [700, 1000) (e.g. #bank-host beside the side strip), not
    // [0, 300); a click near the host's right edge must clamp against the host's own bounds,
    // not against [0, hostRect.width].
    const host = fakeRect(700, 50, 300, 400);
    const menuSize = fakeRect(0, 0, 200, 100);

    it('clamps to the host far edge, not [0, host.width]', () => {
      const menu = mountAt(host, menuSize);
      menu.open([entry('a')], CTX, { x: 950, y: 380 });
      expect(menu.el.style.left).toBe('800px'); // hostRect.left(700) + width(300) - menuWidth(200)
      expect(menu.el.style.top).toBe('350px'); // hostRect.top(50) + height(400) - menuHeight(100)
    });

    it('clamps to the host near edge', () => {
      const menu = mountAt(host, menuSize);
      menu.open([entry('a')], CTX, { x: 650, y: 10 });
      expect(menu.el.style.left).toBe('700px'); // hostRect.left
      expect(menu.el.style.top).toBe('50px'); // hostRect.top
    });

    it('passes an in-bounds point through unclamped', () => {
      const menu = mountAt(host, menuSize);
      menu.open([entry('a')], CTX, { x: 750, y: 100 });
      expect(menu.el.style.left).toBe('750px');
      expect(menu.el.style.top).toBe('100px');
    });

    // Found by the browser (e2e/bank-ui.pw.test.ts), not by jsdom, which never lays anything
    // out. The menu declares no width, so a real engine shrink-fits it into the space between
    // `left` and the viewport's right edge: measured at the pointer, near an edge, it reports a
    // width smaller than the one it will actually take once moved. The stub below reproduces
    // that dependency, which is the only way to hold the fix in a unit test.
    it('measures its natural width, not the squeezed width at the pointer', () => {
      const VIEWPORT = 760;
      const NATURAL = 175;
      const el = document.createElement('div');
      document.body.appendChild(el);
      el.getBoundingClientRect = () => fakeRect(8, 59, 744, 469); // #bank-host at a 760px viewport
      const menu = createBankMenu({ host: el });
      menu.el.getBoundingClientRect = () => {
        const left = Number.parseFloat(menu.el.style.left || '0');
        return fakeRect(left, 0, Math.min(NATURAL, VIEWPORT - left), 138);
      };
      // A right-click in the last column, at x 593: measuring there reports 167 wide and lands
      // the menu at 585, where it re-lays-out at 175 and overruns the host's right edge (752).
      menu.open([entry('a')], CTX, { x: 593, y: 217 });
      expect(menu.el.style.left).toBe('577px'); // hostRect.left(8) + width(744) - menuWidth(175)
    });
  });
});

/**
 * FINAL REVIEW, findings 5 and 6. Two lines of close() were load-bearing and unfalsifiable:
 * deleting either one failed none of the 307 bank tests.
 */
describe('what close() is actually for', () => {
  it('unbinds its document pointerdown listener, so right-clicking does not accumulate them', () => {
    // Finding 5. The menu binds a document-level pointerdown on every open to catch a click
    // outside itself. Left bound, that is one listener per right-click for the life of the page,
    // each holding this closure and the menu element - the exact leak shape this sub-project has
    // now shipped five times, and the highest-value single test the review could name.
    const added: unknown[] = [];
    const removed: unknown[] = [];
    const realAdd = document.addEventListener.bind(document);
    const realRemove = document.removeEventListener.bind(document);
    const addSpy = vi.spyOn(document, 'addEventListener').mockImplementation((type, fn, options) => {
      if (type === 'pointerdown') added.push(fn);
      realAdd(type, fn as EventListener, options);
    });
    const removeSpy = vi.spyOn(document, 'removeEventListener').mockImplementation((type, fn, options) => {
      if (type === 'pointerdown') removed.push(fn);
      realRemove(type, fn as EventListener, options);
    });
    try {
      const menu = mount();
      for (let i = 0; i < 3; i++) {
        menu.open([{ id: 'a', label: 'A', enabled: true, run: () => {} }], CTX, { x: 0, y: 0 });
        menu.close();
      }
      expect(added).toHaveLength(3);
      // Identity, not merely the count: removing a different function leaves the real one bound.
      expect(removed).toEqual(added);
    } finally {
      addSpy.mockRestore();
      removeSpy.mockRestore();
    }
  });

  it('runs BEFORE the row does, so focus survives the repaint the row causes', () => {
    // Finding 6. Swapping close() and row.run() in buildRow fails zero tests, but it moves the
    // player's focus to <body>: activating a row usually rebuilds the pane, and a pane that
    // rebuilds restores focus only if it HAD focus (grid.ts, paneHasFocus). close() first hands
    // focus back to the originating cell, so the rebuild sees it and follows the player. Run
    // first, and returnFocusTo is a detached node by the time close() tries to focus it.
    const pane = document.createElement('div');
    document.body.appendChild(pane);
    const cell = (): HTMLElement => {
      const el = document.createElement('div');
      el.tabIndex = 0;
      el.dataset.cell = '1';
      return el;
    };
    pane.replaceChildren(cell());
    /** grid.ts's own restore rule, reduced to its two lines. */
    const rebuild = (): void => {
      const hadFocus = document.activeElement !== null && pane.contains(document.activeElement);
      const next = cell();
      pane.replaceChildren(next);
      if (hadFocus) next.focus();
    };

    const menu = mount();
    (pane.firstElementChild as HTMLElement).focus();
    menu.open([{ id: 'sort', label: 'Sort by name', enabled: true, run: rebuild }], CTX, { x: 0, y: 0 });
    rows(menu)[0].click();

    expect(document.activeElement).toBe(pane.firstElementChild);
    expect(document.activeElement).not.toBe(document.body);
  });
});
