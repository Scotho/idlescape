// gridInput against the REAL createBankGrid, not the hand-built pane the other files use.
// The seam between the two is where an icon arrival rebuilds the pane under a live gesture, and
// the harness cannot prove that the two modules agree about who restores focus. Here they are
// wired together and a real repaint is fired mid-gesture.
import { describe, expect, it } from 'vitest';
import { createBankGrid } from './grid';
import { attachGridInput } from './gridInput';
import { installPointerEvent } from './gridInput.harness';
import type { BankState } from './store';
import type { IconCache } from './icons';
import type { ObjInfo } from './types';

installPointerEvent();

const INFO: Record<number, ObjInfo> = {
  995: { name: 'Coins', examine: 'Lovely money!', cost: 1, stackable: true, noted: false },
  1038: { name: 'Red partyhat', examine: 'A nice hat.', cost: 1, stackable: false, noted: false },
  1618: { name: 'Uncut diamond', examine: 'Valuable.', cost: 200, stackable: false, noted: false }
};

function state(tabs: number[] = []): BankState {
  const items = new Array(240).fill(null);
  items[0] = { slot: 0, obj: 995, count: 500 };
  items[1] = { slot: 1, obj: 1038, count: 1 };
  items[2] = { slot: 2, obj: 1618, count: 250_000 };
  return { version: 1, capacity: 240, tabs, items, used: 3, loading: false, live: true, pending: 0, error: null };
}

/** An icon cache whose onChange really registers, so a test can fire a repaint on demand. */
function controllableIcons() {
  const listeners = new Set<() => void>();
  const cache: IconCache = {
    peek: () => null,
    load: async () => null,
    prime: async () => {},
    onChange(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; }
  };
  return { cache, fire: () => { for (const fn of [...listeners]) fn(); } };
}

function wired(over: { tabs?: number[]; selectedTab?: number } = {}) {
  const icons = controllableIcons();
  const snapshot = state(over.tabs ?? []);
  const grid = createBankGrid({
    icons: icons.cache,
    info: obj => INFO[obj] ?? null,
    selectedTab: () => over.selectedTab ?? 0,
    search: () => '',
    onMenu: () => {}
  });
  document.body.appendChild(grid.el);
  grid.render(snapshot);

  const moves: [number, number][] = [];
  let hitSlot: number | null = null;
  const input = attachGridInput({
    root: grid.el,
    slotOf: grid.slotOf,
    visible: grid.visible,
    mode: () => 'swap',
    onMove: (from, to) => { moves.push([from, to]); return { moved: true as const, to }; },
    onDropOnTab: () => {},
    onMenuKey: () => {},
    // Resolved freshly on every call, exactly as a real hit test would be: the node for a slot
    // is a different object after every repaint.
    hitTest: () => (hitSlot === null ? null : grid.el.querySelector(`[data-bank-slot="${hitSlot}"]`)),
    tabAt: () => null,
    nameOf: slot => {
      const item = snapshot.items[slot];
      return item ? INFO[item.obj]?.name ?? String(item.obj) : null;
    },
    announce: () => {}
  });

  const cell = (slot: number): HTMLElement => {
    const el = grid.el.querySelector<HTMLElement>(`[data-bank-slot="${slot}"]`);
    if (!el) throw new Error(`no cell for slot ${slot}`);
    return el;
  };
  const focusedSlot = (): number | null => grid.slotOf(document.activeElement);
  /** Fires an icon arrival and lets both grid's coalescing microtask and the observer run. */
  const repaint = async (): Promise<void> => {
    icons.fire();
    await new Promise(resolve => setTimeout(resolve, 0));
  };
  return { grid, input, moves, cell, focusedSlot, repaint, setHit: (slot: number | null) => { hitSlot = slot; } };
}

describe('gridInput on the real item pane', () => {
  it('keeps the player on their slot when an icon arrival rebuilds the pane', async () => {
    const w = wired();
    w.cell(0).focus();
    w.cell(0).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    expect(w.focusedSlot()).toBe(8);

    await w.repaint();

    // grid.ts alone is responsible for this, and gridInput no longer second-guesses it. The two
    // agreeing is the whole point of the test: it fails if either side regresses.
    expect(w.focusedSlot()).toBe(8);
    expect(w.cell(8).tabIndex).toBe(0);
    w.grid.dispose();
    w.input.detach();
  });

  it('keeps a drag alive across an icon arrival and still reports the intended move', async () => {
    const w = wired();
    w.cell(0).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, button: 0, buttons: 1 }));
    w.setHit(2);
    w.grid.el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 40, clientY: 0, buttons: 1 }));
    expect(w.cell(2).classList.contains('is-target')).toBe(true);

    await w.repaint();

    // Fresh nodes, and the marks are back on the right ones.
    expect(w.grid.el.classList.contains('is-dragging')).toBe(true);
    expect(w.cell(0).classList.contains('is-source')).toBe(true);
    expect(w.cell(2).classList.contains('is-target')).toBe(true);

    w.grid.el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 40, clientY: 0 }));
    expect(w.moves).toEqual([[0, 2]]);
    w.grid.dispose();
    w.input.detach();
  });

  it('keeps a keyboard-held item marked across an icon arrival', async () => {
    const w = wired();
    w.cell(1).focus();
    w.cell(1).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    expect(w.input.held()).toBe(1);

    await w.repaint();

    expect(w.input.held()).toBe(1);
    expect(w.cell(1).classList.contains('is-held')).toBe(true);
    w.grid.dispose();
    w.input.detach();
  });

  it('never resolves a filler cell, which carries the bank-slot class but no slot attribute', () => {
    // Tab 1 spans slots 0-1, so the row is padded out to eight with six real filler cells. The
    // "All items" fixture the other cases use renders no fillers at all, which is why this
    // assertion has to select a tab to have anything to assert about.
    const w = wired({ tabs: [2], selectedTab: 1 });
    const fillers = Array.from(w.grid.el.querySelectorAll('.bank-slot-filler'));
    expect(fillers.length).toBeGreaterThan(0);
    for (const node of fillers) expect(w.grid.slotOf(node)).toBeNull();
    // And none of them is in visible(), so the keyboard cannot reach one either.
    expect(w.grid.visible()).toEqual([0, 1]);
    w.grid.dispose();
    w.input.detach();
  });

  it('a release the page never saw cannot be committed by a later click', () => {
    const w = wired();
    w.cell(0).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, button: 0, buttons: 1 }));
    w.setHit(2);
    w.grid.el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 40, clientY: 0, buttons: 1 }));
    expect(w.grid.el.classList.contains('is-dragging')).toBe(true);

    // The button was let go outside the window: no pointerup, no pointercancel, just the next
    // move with nothing held.
    w.grid.el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 50, clientY: 0, buttons: 0 }));
    expect(w.grid.el.classList.contains('is-dragging')).toBe(false);

    w.grid.el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 50, clientY: 0 }));
    expect(w.moves).toEqual([]);
    w.grid.dispose();
    w.input.detach();
  });
});
