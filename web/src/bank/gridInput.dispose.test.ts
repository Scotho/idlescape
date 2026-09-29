// Teardown is the part of this module that a passing feature test will happily walk over: the
// bank window can close with a pointer still down, and a listener left on the document then
// keeps a dead pane alive for the rest of the session. These tests assert that no callback fires
// and no state is written after detach, and they check the listener ledger directly rather than
// inferring disposal from "nothing seems to happen".
import { describe, expect, it } from 'vitest';
import type { LedgerEntry } from './gridInput.harness';
import { attachGridInput, type GridInput, type GridInputDeps } from './gridInput';
import { harness, installPointerEvent, instrument, outstanding, rebuiltCells } from './gridInput.harness';

installPointerEvent();

describe('disposal', () => {
  it('detach mid-drag removes every listener it added, on the root, document and window', () => {
    const log: LedgerEntry[] = [];
    let undo: (() => void)[] = [];
    let input: GridInput | null = null;
    try {
      const h = harness({
        attach: (deps: GridInputDeps) => {
          // Instrument only around attachGridInput, so the ledger records this module's
          // listeners and nothing the harness or another test put on the document.
          undo = [instrument(deps.root, 'root', log), instrument(document, 'document', log), instrument(window, 'window', log)];
          return attachGridInput(deps);
        }
      });
      input = h.input;
      // Tear down with a pointer still down and a drag in flight: that is when the
      // document-level listeners exist, and it is a real case (the window can close mid-drag).
      h.press(h.cells[0]);
      h.moveTo(40, 0);
      input.detach();
    } finally {
      for (const restore of undo) restore();
    }
    // Asserted after detach, never before it: an assertion that throws mid-test would skip the
    // teardown and leak a live gesture, on the document, into every test that follows.
    expect(log.some(entry => entry.target === 'document' && entry.kind === 'add')).toBe(true);
    // The blur cancel goes on the window and is bound with the other three, so it has to come
    // off with them: a Critical fix must not be traded for a teardown leak.
    expect(log.some(entry => entry.target === 'window' && entry.type === 'blur' && entry.kind === 'add')).toBe(true);
    expect(outstanding(log)).toEqual([]);
  });

  it('binds document listeners only while a gesture is live', () => {
    const log: LedgerEntry[] = [];
    let undo: (() => void)[] = [];
    try {
      const h = harness({
        attach: (deps: GridInputDeps) => {
          undo = [instrument(document, 'document', log)];
          return attachGridInput(deps);
        }
      });
      // Attaching alone puts nothing on the document.
      expect(log).toEqual([]);
      h.press(h.cells[0]);
      h.moveTo(40, 0);
      h.setHit(h.cells[3]);
      h.release(40, 0);
      // The completed drag left nothing behind either.
      expect(outstanding(log)).toEqual([]);
      h.input.detach();
      expect(outstanding(log)).toEqual([]);
    } finally {
      for (const restore of undo) restore();
    }
  });

  it('writes no state and fires no callback after detach', async () => {
    const h = harness();
    h.cells[0].focus();
    h.key(h.cells[0], { key: 'Enter' });
    expect(h.input.held()).toBe(0);
    h.press(h.cells[0]);
    h.moveTo(40, 0);
    expect(h.root.classList.contains('is-dragging')).toBe(true);

    h.input.detach();

    // Every class the module owns is gone the moment it lets go.
    expect(h.root.classList.contains('is-dragging')).toBe(false);
    expect(h.root.classList.contains('is-insert-mode')).toBe(false);
    expect(h.root.querySelector('.is-source')).toBeNull();
    expect(h.root.querySelector('.is-target')).toBeNull();
    expect(h.root.querySelector('.is-held')).toBeNull();
    expect(h.input.held()).toBeNull();

    // The interrupted gesture cannot complete: the release lands on nothing.
    h.setHit(h.cells[3]);
    h.release(40, 0);
    // Nor can a fresh one start, from either device.
    h.press(h.cells[0]);
    h.moveTo(40, 0);
    h.release(40, 0);
    h.cancel(40, 0);
    h.key(h.cells[0], { key: 'Enter' });
    h.key(h.cells[0], { key: 'ArrowRight' });
    h.key(h.cells[0], { key: 'ContextMenu' });
    h.key(h.cells[0], { key: 'F10', shiftKey: true });
    h.key(h.cells[0], { key: 'Escape' });

    // And a render after detach must not wake the repaint path either.
    h.root.replaceChildren(...rebuiltCells());
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(h.moves).toEqual([]);
    expect(h.tabDrops).toEqual([]);
    expect(h.menus).toEqual([]);
    // The pickup before detach is the only thing that was ever announced.
    expect(h.said).toEqual(['Picked up Coins. Use the arrow keys, then Enter to place it.']);
    expect(h.input.held()).toBeNull();
    expect(h.root.classList.contains('is-dragging')).toBe(false);
    expect(h.root.querySelector('.is-source')).toBeNull();
  });

  it('the window blur cancel is inert after detach', () => {
    const h = harness();
    h.press(h.cells[0]);
    h.moveTo(40, 0);
    h.input.detach();
    // Nothing should throw, nothing should repaint, and the gesture is already gone.
    h.blur();
    expect(h.root.classList.contains('is-dragging')).toBe(false);
    h.setHit(h.cells[3]);
    h.release(40, 0);
    expect(h.moves).toEqual([]);
  });

  it('a drop on a tab header after detach is not reported either', () => {
    const header = document.createElement('div');
    document.body.appendChild(header);
    const h = harness({ tabAt: node => (node === header ? 3 : null) });
    h.press(h.cells[0]);
    h.moveTo(40, 0);
    h.input.detach();
    h.setHit(header);
    h.release(40, 0);
    expect(h.tabDrops).toEqual([]);
  });

  it('detach is idempotent', () => {
    const h = harness();
    h.input.detach();
    expect(() => h.input.detach()).not.toThrow();
    expect(h.input.held()).toBeNull();
  });
});

// cancel() is disposal's other half: the bank window closes and reopens, so a close mid-drag has
// to drop the gesture WITHOUT taking the root listeners with it. detach() cannot serve there.
describe('cancel', () => {
  it('drops a live drag, unbinds the document AND the window blur, and reports nothing', () => {
    const log: LedgerEntry[] = [];
    let undo: (() => void)[] = [];
    try {
      const h = harness({
        attach: (deps: GridInputDeps) => {
          // The window as well as the document: the blur cancel is bound with the other three,
          // so a cancel() that unbound only the document would trade one leak for another.
          undo = [instrument(document, 'document', log), instrument(window, 'window', log)];
          return attachGridInput(deps);
        }
      });
      h.press(h.cells[0]);
      h.moveTo(40, 0);
      expect(h.root.classList.contains('is-dragging')).toBe(true);
      h.input.cancel();
      expect(h.root.classList.contains('is-dragging')).toBe(false);
      expect(h.root.querySelectorAll('.is-source, .is-target')).toHaveLength(0);
      expect(log.some(entry => entry.target === 'window' && entry.type === 'blur' && entry.kind === 'add')).toBe(true);
      // Checked HERE, before any release. A release of its own unbinds the listeners on the way
      // through, so a ledger read after one cannot tell a cancel() that unbound them from a
      // cancel() that merely stopped painting and left them for the pointerup to clean up.
      expect(outstanding(log)).toEqual([]);
      h.setHit(h.cells[3]);
      h.release(40, 0);
      expect(h.moves).toEqual([]);
      expect(outstanding(log)).toEqual([]);
    } finally {
      for (const restore of undo) restore();
    }
  });

  it('leaves the pane drivable afterwards, which is the whole difference from detach', () => {
    const h = harness();
    h.press(h.cells[0]);
    h.moveTo(40, 0);
    h.input.cancel();
    h.press(h.cells[1]);
    h.moveTo(40, 0);
    h.setHit(h.cells[3]);
    h.release(40, 0);
    expect(h.moves).toEqual([[1, 3]]);
  });

  it('forgets which slot was pressed, so a later move cannot resume the drag', () => {
    const h = harness();
    h.press(h.cells[0]);
    h.moveTo(40, 0);
    h.input.cancel();
    // Bound at press time and released by cancel(), so these reach nothing. If cancel() had only
    // stopped painting, this move would repaint the drag and the release would report it.
    h.moveTo(80, 0);
    expect(h.root.classList.contains('is-dragging')).toBe(false);
    h.setHit(h.cells[3]);
    h.release(80, 0);
    expect(h.moves).toEqual([]);
  });

  it('leaves the window blur cancel inert afterwards', () => {
    const h = harness();
    h.press(h.cells[0]);
    h.moveTo(40, 0);
    h.input.cancel();
    h.blur();
    expect(h.root.classList.contains('is-dragging')).toBe(false);
    h.setHit(h.cells[3]);
    h.release(40, 0);
    expect(h.moves).toEqual([]);
  });

  it('drops a keyboard hold too, and is idempotent', () => {
    const h = harness();
    h.key(h.cells[0], { key: 'Enter' });
    expect(h.input.held()).toBe(0);
    h.input.cancel();
    expect(h.input.held()).toBeNull();
    expect(() => h.input.cancel()).not.toThrow();
  });
});

describe('Escape during a pointer drag', () => {
  it('cancels the drag, says so, and marks the key spent so the window above does not close', () => {
    const h = harness();
    h.press(h.cells[0]);
    h.moveTo(40, 0);
    expect(h.root.classList.contains('is-dragging')).toBe(true);
    // cancelable: true because a real keydown is cancelable. defaultPrevented is the entire
    // contract with the bank window: it is how the window knows this Escape is already spent.
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    h.cells[0].dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(h.root.classList.contains('is-dragging')).toBe(false);
    expect(h.said).toEqual(['Move cancelled.']);
    h.setHit(h.cells[3]);
    h.release(40, 0);
    expect(h.moves).toEqual([]);
  });

  it('leaves a second Escape alone, so it can close the window', () => {
    const h = harness();
    h.press(h.cells[0]);
    h.moveTo(40, 0);
    h.cells[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const second = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    h.cells[0].dispatchEvent(second);
    expect(second.defaultPrevented).toBe(false);
  });

  it('still puts a keyboard hold back when no drag is live', () => {
    const h = harness();
    h.key(h.cells[0], { key: 'Enter' });
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    h.cells[0].dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(h.said).toEqual(['Picked up Coins. Use the arrow keys, then Enter to place it.', 'Put Coins back.']);
  });
});
