import { describe, expect, it } from 'vitest';
import { NAMES, filler, harness, installPointerEvent } from './gridInput.harness';

installPointerEvent();

describe('keyboard', () => {
  it('moves focus by one with the left and right arrows', () => {
    const h = harness();
    h.cells[0].focus();
    h.key(h.cells[0], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(h.cells[1]);
    h.key(h.cells[1], { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(h.cells[0]);
  });

  it('moves focus by a row with the up and down arrows', () => {
    const h = harness();
    h.cells[0].focus();
    h.key(h.cells[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(h.cells[8]);
    h.key(h.cells[8], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(h.cells[0]);
  });

  it('clamps at both ends instead of wrapping', () => {
    const h = harness();
    h.cells[0].focus();
    h.key(h.cells[0], { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(h.cells[0]);
    h.key(h.cells[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(h.cells[0]);
    h.cells[15].focus();
    h.key(h.cells[15], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(h.cells[15]);
    h.key(h.cells[15], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(h.cells[15]);
  });

  it('keeps a single roving tab stop on the focused cell', () => {
    const h = harness();
    h.cells[0].focus();
    h.key(h.cells[0], { key: 'ArrowRight' });
    expect(h.cells.filter(cell => cell.tabIndex === 0)).toEqual([h.cells[1]]);
  });

  it('Home and End go to the first and last visible slot', () => {
    const h = harness();
    h.cells[5].focus();
    h.key(h.cells[5], { key: 'End' });
    expect(document.activeElement).toBe(h.cells[15]);
    h.key(h.cells[15], { key: 'Home' });
    expect(document.activeElement).toBe(h.cells[0]);
  });

  it('picks an item up with Enter, places it with Enter, and says what happened', () => {
    const h = harness();
    h.cells[0].focus();
    h.key(h.cells[0], { key: 'Enter' });
    expect(h.input.held()).toBe(0);
    expect(h.cells[0].classList.contains('is-held')).toBe(true);
    expect(h.said[0]).toBe('Picked up Coins. Use the arrow keys, then Enter to place it.');
    h.cells[3].focus();
    h.key(h.cells[3], { key: 'Enter' });
    expect(h.moves).toEqual([[0, 3]]);
    expect(h.input.held()).toBeNull();
    expect(h.said[1]).toBe('Moved Coins to slot 4.');
  });

  it('Space works exactly like Enter', () => {
    const h = harness();
    h.cells[1].focus();
    h.key(h.cells[1], { key: ' ' });
    expect(h.input.held()).toBe(1);
  });

  it('Escape puts a held item back down without moving it', () => {
    const h = harness();
    h.cells[0].focus();
    h.key(h.cells[0], { key: 'Enter' });
    h.key(h.cells[0], { key: 'Escape' });
    expect(h.input.held()).toBeNull();
    expect(h.moves).toEqual([]);
    expect(h.said[h.said.length - 1]).toBe('Put Coins back.');
  });

  it('placing a held item back on its own slot is not a move', () => {
    const h = harness();
    h.cells[0].focus();
    h.key(h.cells[0], { key: 'Enter' });
    h.key(h.cells[0], { key: 'Enter' });
    expect(h.input.held()).toBeNull();
    expect(h.moves).toEqual([]);
    expect(h.said[h.said.length - 1]).toBe('Put Coins back.');
  });

  it('places a held item onto an empty slot', () => {
    const h = harness();
    h.cells[0].focus();
    h.key(h.cells[0], { key: 'Enter' });
    h.key(h.cells[9], { key: 'Enter' });
    expect(h.moves).toEqual([[0, 9]]);
    expect(h.said[1]).toBe('Moved Coins to slot 10.');
  });

  it('never picks up an empty slot', () => {
    const h = harness();
    h.cells[9].focus();
    h.key(h.cells[9], { key: 'Enter' });
    expect(h.input.held()).toBeNull();
  });

  it('a pointer press drops a keyboard hold', () => {
    const h = harness();
    h.cells[0].focus();
    h.key(h.cells[0], { key: 'Enter' });
    expect(h.input.held()).toBe(0);
    h.press(h.cells[1]);
    expect(h.input.held()).toBeNull();
    expect(h.root.querySelector('.is-held')).toBeNull();
    h.setHit(h.cells[1]);
    h.release(0, 0);
  });

  it('opens the menu on the context-menu key and on Shift+F10', () => {
    const h = harness();
    h.cells[1].focus();
    h.key(h.cells[1], { key: 'ContextMenu' });
    h.key(h.cells[1], { key: 'F10', shiftKey: true });
    expect(h.menus).toEqual([1, 1]);
  });

  // Every other keyboard test uses a pane whose visible() is [0..15], where an index into that
  // list and the slot it names are the same number, so the mapping between them is invisible.
  // A real tab starts partway down the bank, and that is where getting it wrong moves the
  // player into a slot from a different tab.
  describe('a tab whose slots do not start at zero', () => {
    const secondRow = (): number[] => [8, 9, 10, 11, 12, 13, 14, 15];
    /** The same three items, but living in the tab that starts at slot 8. */
    const occupied = (slot: number): string | null => NAMES[slot - 8] ?? null;

    it('steps by slot, not by index into visible()', () => {
      const h = harness({ visible: secondRow });
      h.cells[8].focus();
      h.key(h.cells[8], { key: 'ArrowRight' });
      expect(document.activeElement).toBe(h.cells[9]);
      h.key(h.cells[9], { key: 'ArrowLeft' });
      expect(document.activeElement).toBe(h.cells[8]);
    });

    it('sends Home and End to the tab ends, not to slot 0', () => {
      const h = harness({ visible: secondRow });
      h.cells[12].focus();
      h.key(h.cells[12], { key: 'Home' });
      expect(document.activeElement).toBe(h.cells[8]);
      h.key(h.cells[8], { key: 'End' });
      expect(document.activeElement).toBe(h.cells[15]);
    });

    it('places a held item into the slot the player navigated to', () => {
      const h = harness({ visible: secondRow, nameOf: occupied });
      h.cells[8].focus();
      h.key(h.cells[8], { key: 'Enter' });
      h.key(h.cells[8], { key: 'ArrowRight' });
      expect(document.activeElement).toBe(h.cells[9]);
      h.key(h.cells[9], { key: 'Enter' });
      expect(h.moves).toEqual([[8, 9]]);
    });

    it('clamps to the tab, never stepping outside it', () => {
      const h = harness({ visible: secondRow });
      h.cells[8].focus();
      h.key(h.cells[8], { key: 'ArrowLeft' });
      expect(document.activeElement).toBe(h.cells[8]);
      h.key(h.cells[8], { key: 'ArrowUp' });
      expect(document.activeElement).toBe(h.cells[8]);
    });
  });

  it('lets Ctrl, Meta and Alt combinations through to the browser', () => {
    const h = harness();
    h.cells[5].focus();
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      h.key(h.cells[5], { key: 'ArrowRight', [modifier]: true });
      h.key(h.cells[5], { key: 'Home', [modifier]: true });
      h.key(h.cells[5], { key: 'Enter', [modifier]: true });
    }
    expect(document.activeElement).toBe(h.cells[5]);
    expect(h.input.held()).toBeNull();
    expect(h.said).toEqual([]);
  });

  it('slides sideways off a partial bottom row rather than staying in column', () => {
    // Documented, not endorsed. stepTo clamps on the index into visible(), so ArrowDown from
    // slot 12 with 16 slots shown lands on 15 and changes column. It is what the brief
    // prescribes; recorded here so the behaviour is deliberate rather than incidental.
    const h = harness({ visible: () => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] });
    h.cells[12].focus();
    h.key(h.cells[12], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(h.cells[15]);
  });

  it('ignores a key pressed off any slot', () => {
    const h = harness();
    const blank = filler(h.root);
    h.key(blank, { key: 'Enter' });
    h.key(blank, { key: 'ContextMenu' });
    expect(h.input.held()).toBeNull();
    expect(h.menus).toEqual([]);
  });

  it('detach removes every listener', () => {
    const h = harness();
    h.input.detach();
    h.cells[0].focus();
    h.key(h.cells[0], { key: 'Enter' });
    expect(h.input.held()).toBeNull();
  });
});
