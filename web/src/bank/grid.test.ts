// web/src/bank/grid.test.ts
// What the item pane draws. Repaint, teardown and focus behaviour live in grid.repaint.test.ts;
// the fixtures both files mount live in grid.harness.ts.
import { describe, expect, it, vi } from 'vitest';
import { INFO, mount, slots, state } from './grid.harness';
import type { IconCache } from './icons';

describe('the item pane', () => {
  it('is a grid of rows of exactly eight cells', () => {
    const { grid } = mount();
    grid.render(state());
    expect(grid.el.getAttribute('role')).toBe('grid');
    const rows = Array.from(grid.el.querySelectorAll('[role="row"]'));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.querySelectorAll('[role="gridcell"]')).toHaveLength(8);
  });

  it('renders one cell per slot up to a whole row past the last item', () => {
    const { grid } = mount();
    grid.render(state());
    // Three items: one row of eight, plus a second row so there is somewhere to drop.
    expect(slots(grid.el)).toHaveLength(16);
    expect(slots(grid.el)[0].dataset.bankSlot).toBe('0');
  });

  it('draws the cached icon and falls back to the item name when there is none', () => {
    const { grid } = mount({}, { 995: 'data:image/png;base64,COIN' });
    grid.render(state());
    const [coins, hat] = slots(grid.el);
    expect(coins.querySelector('img.bank-icon')?.getAttribute('src')).toBe('data:image/png;base64,COIN');
    expect(hat.querySelector('img.bank-icon')).toBeNull();
    expect(hat.querySelector('.bank-fallback')?.textContent).toContain('Red');
  });

  it('colours counts the OSRS way and shows none for a single item', () => {
    const { grid } = mount();
    grid.render(state());
    const [coins, hat, diamond] = slots(grid.el);
    expect(coins.querySelector('.bank-count')?.textContent).toBe('500');
    expect(coins.querySelector('.bank-count')?.className).toContain('count-yellow');
    expect(hat.querySelector('.bank-count')).toBeNull();
    expect(diamond.querySelector('.bank-count')?.textContent).toBe('250K');
    expect(diamond.querySelector('.bank-count')?.className).toContain('count-white');
  });

  it('tags an occupied cell with its obj id and leaves an empty one untagged', () => {
    const { grid } = mount();
    grid.render(state());
    const cells = slots(grid.el);
    expect(cells.slice(0, 4).map(cell => cell.dataset.bankObj ?? null)).toEqual(['995', '1038', '1618', null]);
  });

  it('labels every occupied cell for a screen reader and marks empty ones', () => {
    const { grid } = mount();
    grid.render(state());
    const cells = slots(grid.el);
    expect(cells[0].getAttribute('aria-label')).toBe('Slot 1: Coins, 500');
    expect(cells[3].getAttribute('aria-label')).toBe('Slot 4: empty');
  });

  it('keeps exactly one cell in the tab order (roving tabindex)', () => {
    const { grid } = mount();
    grid.render(state());
    expect(slots(grid.el).filter(cell => cell.tabIndex === 0)).toHaveLength(1);
  });

  it('primes the icons of the slots it just drew', () => {
    const primed: number[][] = [];
    const cache: IconCache = { peek: () => null, load: async () => null, prime: async objs => { primed.push(objs); }, onChange: () => () => {} };
    const { grid } = mount({ icons: cache });
    grid.render(state());
    expect(primed[0].sort()).toEqual([995, 1038, 1618].sort());
  });
});

describe('tabs and dividers', () => {
  const tabbed = () => state({ tabs: [2], used: 3 });

  it('shows a divider before each tab while All items is selected', () => {
    const { grid } = mount({ selectedTab: () => 0 });
    grid.render(tabbed());
    expect(grid.el.querySelectorAll('[data-bank-divider]')).toHaveLength(1);
    expect(grid.el.querySelector('[data-bank-divider="1"]')).not.toBeNull();
  });

  it('shows only the selected tab, with no dividers', () => {
    const { grid } = mount({ selectedTab: () => 1 });
    grid.render(tabbed());
    expect(grid.el.querySelectorAll('[data-bank-divider]')).toHaveLength(0);
    expect(grid.visible().slice(0, 2)).toEqual([0, 1]);
    expect(grid.visible()).not.toContain(2);
  });

  it('shows the main tab as everything past the last tab', () => {
    const { grid } = mount({ selectedTab: () => 0 });
    grid.render(tabbed());
    expect(grid.visible()).toContain(2);
  });
});

describe('search', () => {
  it('dims what does not match and leaves matches alone', () => {
    const { grid } = mount({ search: () => 'coin' });
    grid.render(state());
    const cells = slots(grid.el);
    expect(cells[0].classList.contains('dim')).toBe(false);
    expect(cells[1].classList.contains('dim')).toBe(true);
    // An empty slot is never a match, and never worth dimming either.
    expect(cells[5].classList.contains('dim')).toBe(true);
  });

  it('dims nothing when the box is empty', () => {
    const { grid } = mount({ search: () => '' });
    grid.render(state());
    expect(slots(grid.el).some(cell => cell.classList.contains('dim'))).toBe(false);
  });
});

describe('the right-click menu', () => {
  it('opens with the slot under the pointer and suppresses the browser menu', () => {
    const onMenu = vi.fn();
    const { grid } = mount({ onMenu });
    grid.render(state());
    const cell = slots(grid.el)[1];
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 60 });
    cell.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onMenu).toHaveBeenCalledWith(
      { slot: 1, obj: 1038, count: 1, info: INFO[1038] },
      { x: 40, y: 60 }
    );
  });

  it('does not open on an empty slot', () => {
    const onMenu = vi.fn();
    const { grid } = mount({ onMenu });
    grid.render(state());
    slots(grid.el)[7].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(onMenu).not.toHaveBeenCalled();
  });

  /**
   * FINAL REVIEW, finding 13. preventDefault ran before the slot check, so a right-click that
   * opened nothing still swallowed the browser's own menu. The player was left with no menu from
   * either side over most of the pane.
   */
  it('leaves the browser its own menu everywhere the bank has none of its own', () => {
    const onMenu = vi.fn();
    const { grid } = mount({ onMenu });
    // used = 3 in an 8-wide pane, so this renders one real row plus a whole overhang row: real
    // but empty cells, and, in a filtered tab, filler cells with no data-bank-slot at all.
    grid.render(state());
    const fire = (target: EventTarget): MouseEvent => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 });
      target.dispatchEvent(event);
      return event;
    };
    expect(fire(grid.el).defaultPrevented).toBe(false);
    expect(fire(grid.el.querySelector('.bank-row')!).defaultPrevented).toBe(false);
    expect(fire(slots(grid.el)[7]).defaultPrevented).toBe(false);
    expect(onMenu).not.toHaveBeenCalled();

    // And it still suppresses it where the bank really does answer with a menu.
    expect(fire(slots(grid.el)[0]).defaultPrevented).toBe(true);
    expect(onMenu).toHaveBeenCalledTimes(1);
  });
});

describe('empty bank', () => {
  it('says so instead of drawing an empty grid', () => {
    const { grid } = mount();
    grid.render(state({ items: new Array(240).fill(null), used: 0 }));
    expect(grid.el.querySelector('.bank-empty')?.textContent).toContain('Your bank is empty');
  });
});

describe('slotOf', () => {
  it('finds the slot a nested node belongs to, and null outside the grid', () => {
    const { grid } = mount({}, { 995: 'data:image/png;base64,COIN' });
    grid.render(state());
    const img = grid.el.querySelector('img.bank-icon')!;
    expect(grid.slotOf(img)).toBe(0);
    expect(grid.slotOf(document.body)).toBeNull();
  });
});
