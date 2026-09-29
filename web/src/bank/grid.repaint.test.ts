// web/src/bank/grid.repaint.test.ts
// The item pane's repaint, teardown and focus behaviour. Split from grid.test.ts when that file
// crossed the 400-line ceiling; the rendering tests stayed there and the fixtures both files
// mount live in grid.harness.ts.
import { describe, expect, it } from 'vitest';
import { INFO, controllableIcons, mount, slots, state } from './grid.harness';
import type { ObjInfo } from './types';

describe('fix round: dispose() releases the icon subscription', () => {
  it('stops repainting and stops priming once dispose() has run', async () => {
    const { cache, primeCalls, fire } = controllableIcons();
    const { grid } = mount({ icons: cache });
    grid.render(state());
    const childrenBefore = grid.el.innerHTML;
    primeCalls.length = 0;

    grid.dispose();
    fire();
    await Promise.resolve();

    expect(primeCalls).toHaveLength(0);
    expect(grid.el.innerHTML).toBe(childrenBefore);
  });

  it('is idempotent: a second dispose() does not throw', () => {
    const { cache } = controllableIcons();
    const { grid } = mount({ icons: cache });
    grid.render(state());
    grid.dispose();
    expect(() => grid.dispose()).not.toThrow();
  });

  it('drops a repaint that was already coalesced onto a microtask before dispose() ran', async () => {
    const { cache, primeCalls, fire } = controllableIcons();
    const { grid } = mount({ icons: cache });
    grid.render(state());
    const childrenBefore = grid.el.innerHTML;
    primeCalls.length = 0;

    fire(); // schedules the coalesced microtask repaint
    grid.dispose(); // too late to stop future onChange calls, but this one is already queued
    await Promise.resolve();

    expect(primeCalls).toHaveLength(0);
    expect(grid.el.innerHTML).toBe(childrenBefore);
  });
});

describe('fix round: repaint coalescing', () => {
  it('coalesces a burst of icon arrivals into a single rebuild', async () => {
    const { cache, primeCalls, fire } = controllableIcons();
    const { grid } = mount({ icons: cache });
    grid.render(state());
    primeCalls.length = 0;

    fire();
    fire();
    fire();
    // Not yet: the repaint is deferred to a microtask, so nothing has run synchronously.
    expect(primeCalls).toHaveLength(0);

    await Promise.resolve();
    expect(primeCalls).toHaveLength(1);
  });
});

describe('fix round: focus survives a repaint', () => {
  it('keeps the roving cell focused across an icon-driven repaint', async () => {
    const { cache, fire } = controllableIcons();
    const { grid } = mount({ icons: cache });
    grid.render(state());
    const cell = slots(grid.el)[0];
    cell.focus();
    expect(document.activeElement).toBe(cell);

    fire();
    await Promise.resolve();

    expect(document.activeElement).not.toBe(document.body);
    expect((document.activeElement as HTMLElement | null)?.getAttribute('data-bank-slot')).toBe('0');
  });

  it('returns focus to the cell the player was actually on, not the first one', async () => {
    const { cache, fire } = controllableIcons();
    const { grid } = mount({ icons: cache });
    grid.render(state());
    const cell = slots(grid.el)[3];
    cell.focus();
    expect(cell.getAttribute('data-bank-slot')).toBe('3');

    fire();
    await Promise.resolve();

    // focusSlot used to be assigned only from visibleSlots[0], so every icon arrival threw a
    // keyboard user back to the first slot. Task 9 found this against the merged grid.
    expect((document.activeElement as HTMLElement | null)?.getAttribute('data-bank-slot')).toBe('3');
  });

  it('does not steal focus when the pane was not focused', async () => {
    const { cache, fire } = controllableIcons();
    const { grid } = mount({ icons: cache });
    grid.render(state());
    (document.activeElement as HTMLElement | null)?.blur?.();
    expect(grid.el.contains(document.activeElement)).toBe(false);

    fire();
    await Promise.resolve();

    expect(grid.el.contains(document.activeElement)).toBe(false);
  });
});

describe('fix round: empty or missing tab', () => {
  it('shows a tab-specific empty message for a tab past the declared count, not a blank pane', () => {
    const { grid } = mount({ selectedTab: () => 5 });
    grid.render(state({ tabs: [2], used: 8 }));
    expect(grid.el.querySelector('.bank-empty')?.textContent).toContain('empty');
    expect(grid.visible()).toEqual([]);
    expect(grid.el.querySelectorAll('[data-bank-slot]')).toHaveLength(0);
  });

  it('shows the same message for a genuinely zero-size tab, not a filler-only row', () => {
    const { grid } = mount({ selectedTab: () => 2 });
    grid.render(state({ tabs: [2, 0, 3], used: 8 }));
    expect(grid.el.querySelector('.bank-empty')).not.toBeNull();
    expect(grid.el.querySelectorAll('[data-bank-slot]')).toHaveLength(0);
    expect(grid.el.querySelectorAll('[role="gridcell"]')).toHaveLength(0);
  });
});

describe('fix round: colliding tab dividers', () => {
  it('renders every tab that starts in the same physical row, instead of dropping all but the first', () => {
    const { grid } = mount({ selectedTab: () => 0 });
    grid.render(state({ tabs: [2, 3], used: 5 }));
    const dividers = Array.from(grid.el.querySelectorAll('[data-bank-divider]')).map(node => node.getAttribute('data-bank-divider'));
    expect(dividers).toEqual(['1', '2']);
  });
});

describe('fix round: filler cells are presentation, not gridcells', () => {
  it('marks a filler cell role=presentation so it is not counted as a phantom column', () => {
    const { grid } = mount({ selectedTab: () => 1 });
    grid.render(state({ tabs: [2], used: 3 }));
    const fillers = Array.from(grid.el.querySelectorAll('.bank-slot-filler'));
    expect(fillers.length).toBeGreaterThan(0);
    for (const filler of fillers) {
      expect(filler.getAttribute('role')).toBe('presentation');
      expect(filler.getAttribute('role')).not.toBe('gridcell');
    }
  });
});

describe('fix round: abbreviate() degenerate inputs', () => {
  const infoWith = (entries: Record<number, ObjInfo>) => (obj: number): ObjInfo | null => entries[obj] ?? null;

  it('does not fall back to a single stray letter for a long name with a tiny first word', () => {
    const st = state();
    st.items[3] = { slot: 3, obj: 9001, count: 1 };
    const { grid } = mount({ info: infoWith({ 9001: { name: 'A very shiny thing', examine: null, cost: 1, stackable: false, noted: false } }) });
    grid.render(st);
    const text = slots(grid.el)[3].querySelector('.bank-fallback')?.textContent ?? '';
    expect(text).not.toBe('A…');
    expect(text.length).toBeGreaterThan(2);
  });

  it('never renders a blank fallback tile for an empty name', () => {
    const st = state();
    st.items[3] = { slot: 3, obj: 9002, count: 1 };
    const { grid } = mount({ info: infoWith({ 9002: { name: '', examine: null, cost: 1, stackable: false, noted: false } }) });
    grid.render(st);
    const cell = slots(grid.el)[3];
    const text = cell.querySelector('.bank-fallback')?.textContent ?? '';
    expect(text.length).toBeGreaterThan(0);
  });
});

/**
 * FINAL REVIEW, finding 7. The pane's roving tab stop had two writers that shared no state:
 * gridInputKeys.focusSlot() writes tabIndex straight onto the cell, and this module re-derived
 * its own `focusSlot` from document.activeElement, but only while the pane had focus. So a
 * keyboard user who arrowed down the bank and then clicked away lost their place to the next
 * repaint. The DOM is the shared record; this reads it back.
 */
describe('the roving tab stop when the pane does not have focus', () => {
  it('survives a repaint, so tabbing back lands where the player left off', () => {
    const { grid } = mount();
    grid.render(state({ items: state().items, used: 40 }));
    const cells = slots(grid.el);
    expect(cells.length).toBeGreaterThan(16);

    // What gridInputKeys.focusSlot() does when the player arrows to slot 16.
    for (const cell of cells) cell.tabIndex = -1;
    cells[16].tabIndex = 0;
    cells[16].focus();
    // Focus leaves the pane entirely: a click on the search box, the tab strip, the page behind.
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    expect(grid.el.contains(document.activeElement)).toBe(false);

    // Any repaint at all: a poll landing, or an icon finishing its raster.
    grid.render(state({ items: state().items, used: 40 }));
    const after = slots(grid.el).filter(cell => cell.tabIndex === 0);
    expect(after).toHaveLength(1);
    expect(after[0].getAttribute('data-bank-slot')).toBe('16');
    outside.remove();
  });

  it('falls back to the first visible slot when the tab stop is gone', () => {
    // A tab switch, or a bank that shrank: the remembered slot is no longer on screen and there
    // is no tabindex=0 to read, so the pane starts over at its first cell rather than none.
    const { grid } = mount();
    grid.render(state({ used: 3 }));
    for (const cell of slots(grid.el)) cell.tabIndex = -1;
    grid.render(state({ used: 3 }));
    const after = slots(grid.el).filter(cell => cell.tabIndex === 0);
    expect(after).toHaveLength(1);
    expect(after[0].getAttribute('data-bank-slot')).toBe('0');
  });
});
