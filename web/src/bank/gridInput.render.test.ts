// grid.render() rebuilds the whole pane with replaceChildren(), and it runs not only when the
// store changes but from the icon cache's onChange, whenever an item model finishes streaming
// out of the game client. That lands at an arbitrary moment, mid-drag and mid-keyboard-walk
// included. These tests hold that window open on purpose: a render must not corrupt a gesture,
// must not lose the drag or held marks, and must not drag the player's focus back to the top of
// the bank. They also cover the empty tab, where the pane has no addressable cells at all.
import { describe, expect, it } from 'vitest';
import { harness, installPointerEvent, rebuiltCells } from './gridInput.harness';

installPointerEvent();

/** Lets the MutationObserver's microtask run, the same way a real repaint would. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('a render landing under the input layer', () => {
  it('survives a full re-render mid-drag and still reports the intended move', async () => {
    const h = harness();
    h.press(h.cells[0]);
    h.moveTo(40, 0);
    h.setHit(h.cells[3]);
    h.moveTo(50, 0);
    expect(h.cells[3].classList.contains('is-target')).toBe(true);

    // Every cell node is replaced, including the ones a naive implementation would be holding
    // from pointerdown.
    const rebuilt = rebuiltCells();
    h.root.replaceChildren(...rebuilt);
    await settle();

    expect(h.root.classList.contains('is-dragging')).toBe(true);
    expect(rebuilt[0].classList.contains('is-source')).toBe(true);
    expect(rebuilt[3].classList.contains('is-target')).toBe(true);

    h.setHit(rebuilt[3]);
    h.release(50, 0);
    expect(h.moves).toEqual([[0, 3]]);
  });

  it('keeps a keyboard-held item marked across a re-render', async () => {
    const h = harness();
    h.cells[0].focus();
    h.key(h.cells[0], { key: 'Enter' });
    const rebuilt = rebuiltCells();
    h.root.replaceChildren(...rebuilt);
    await settle();
    expect(h.input.held()).toBe(0);
    expect(rebuilt[0].classList.contains('is-held')).toBe(true);
  });

  it('never moves focus itself on a render: grid.ts owns the restore', async () => {
    // Focus restore across a rebuild has exactly one owner. grid.ts reads
    // slotOf(document.activeElement) before replaceChildren detaches the cell and refocuses the
    // player's own slot afterwards; this module must not second-guess it, or the two would
    // fight over ordering. So a render it did not cause must leave focus exactly where the
    // rebuild left it, wherever that is.
    const h = harness();
    h.cells[0].focus();
    h.key(h.cells[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(h.cells[8]);

    h.root.replaceChildren(...rebuiltCells());
    await settle();
    // jsdom drops focus to <body> when the focused node is detached, and nothing here picks it
    // back up. In the real pane grid.ts has already restored it by this point.
    expect(document.activeElement).toBe(document.body);

    // Nor does it chase focus that is outside the pane entirely.
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    h.root.replaceChildren(...rebuiltCells());
    await settle();
    expect(document.activeElement).toBe(outside);
  });

  it('cancels a drag whose source stops being rendered', async () => {
    let shown = [...Array(16).keys()];
    const h = harness({ visible: () => shown });
    h.press(h.cells[0]);
    h.moveTo(40, 0);
    expect(h.root.classList.contains('is-dragging')).toBe(true);

    // A tab switch mid-drag: the source slot is no longer on screen.
    shown = [];
    h.root.replaceChildren(...rebuiltCells());
    await settle();

    expect(h.root.classList.contains('is-dragging')).toBe(false);
    h.setHit(h.cells[3]);
    h.release(40, 0);
    expect(h.moves).toEqual([]);
  });

  it('does nothing at all when the pane shows no addressable cells', () => {
    const h = harness({ visible: () => [] });
    h.cells[0].focus();
    h.key(h.cells[0], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(h.cells[0]);
    h.key(h.cells[0], { key: 'End' });
    expect(document.activeElement).toBe(h.cells[0]);
    h.key(h.cells[0], { key: 'Enter' });
    h.key(h.cells[0], { key: 'ContextMenu' });
    expect(h.input.held()).toBeNull();
    expect(h.menus).toEqual([]);
    expect(h.said).toEqual([]);
    // A press cannot start a drag there either: paint() drops a source slot that is not shown.
    h.press(h.cells[0]);
    h.moveTo(40, 0);
    expect(h.root.classList.contains('is-dragging')).toBe(false);
    h.setHit(h.cells[3]);
    h.release(40, 0);
    expect(h.moves).toEqual([]);
  });
});
