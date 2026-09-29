import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD_PX } from './gridInput';
import { filler, harness, installPointerEvent } from './gridInput.harness';

installPointerEvent();

describe('drag', () => {
  it('a press with no travel is not a drag and moves nothing', () => {
    const h = harness();
    h.press(h.cells[0]);
    h.setHit(h.cells[3]);
    h.release(0, 0);
    expect(h.moves).toEqual([]);
    expect(h.root.classList.contains('is-dragging')).toBe(false);
  });

  it('past the threshold it drags, marks source and target, and reports the move', () => {
    const h = harness();
    h.press(h.cells[0]);
    h.moveTo(DRAG_THRESHOLD_PX + 1, 0);
    expect(h.root.classList.contains('is-dragging')).toBe(true);
    expect(h.cells[0].classList.contains('is-source')).toBe(true);
    h.setHit(h.cells[3]);
    h.moveTo(60, 0);
    expect(h.cells[3].classList.contains('is-target')).toBe(true);
    h.release(60, 0);
    expect(h.moves).toEqual([[0, 3]]);
    expect(h.root.classList.contains('is-dragging')).toBe(false);
    expect(h.cells[3].classList.contains('is-target')).toBe(false);
  });

  it('does not drag at exactly the threshold', () => {
    const h = harness();
    h.press(h.cells[0]);
    h.moveTo(DRAG_THRESHOLD_PX, 0);
    expect(h.root.classList.contains('is-dragging')).toBe(false);
    h.setHit(h.cells[3]);
    h.release(DRAG_THRESHOLD_PX, 0);
    expect(h.moves).toEqual([]);
  });

  it('never starts a drag from an empty slot', () => {
    const h = harness();
    h.press(h.cells[9]);
    h.moveTo(40, 0);
    h.setHit(h.cells[0]);
    h.release(40, 0);
    expect(h.moves).toEqual([]);
  });

  it('dropping on the source itself moves nothing', () => {
    const h = harness();
    h.press(h.cells[1]);
    h.moveTo(40, 0);
    h.setHit(h.cells[1]);
    h.release(40, 0);
    expect(h.moves).toEqual([]);
  });

  it('dropping outside the grid cancels', () => {
    const h = harness();
    h.press(h.cells[1]);
    h.moveTo(40, 0);
    h.setHit(document.body);
    h.release(40, 0);
    expect(h.moves).toEqual([]);
    expect(h.root.classList.contains('is-dragging')).toBe(false);
  });

  it('dropping on a tab header reports a tab move, not a slot move', () => {
    const header = document.createElement('div');
    document.body.appendChild(header);
    const h = harness({ tabAt: node => (node === header ? 2 : null) });
    h.press(h.cells[0]);
    h.moveTo(40, 0);
    h.setHit(header);
    h.release(40, 0);
    expect(h.tabDrops).toEqual([[0, 2]]);
    expect(h.moves).toEqual([]);
  });

  it('dropping on the plus tab asks for a new tab', () => {
    const plus = document.createElement('div');
    document.body.appendChild(plus);
    const h = harness({ tabAt: node => (node === plus ? 'new' : null) });
    h.press(h.cells[2]);
    h.moveTo(40, 0);
    h.setHit(plus);
    h.release(40, 0);
    expect(h.tabDrops).toEqual([[2, 'new']]);
  });

  it('a filler cell is not a drop position', () => {
    const h = harness();
    const blank = filler(h.root);
    h.press(h.cells[0]);
    h.moveTo(40, 0);
    h.setHit(blank);
    h.moveTo(50, 0);
    expect(h.root.querySelector('.is-target')).toBeNull();
    h.release(50, 0);
    expect(h.moves).toEqual([]);
  });

  it('a right-button press is not a drag', () => {
    const h = harness();
    h.down(h.cells[0], { clientX: 0, clientY: 0, button: 2 });
    h.moveTo(40, 0);
    h.setHit(h.cells[3]);
    h.release(40, 0);
    expect(h.moves).toEqual([]);
    expect(h.root.classList.contains('is-dragging')).toBe(false);
  });

  it('ignores a second pointer mid-gesture', () => {
    const h = harness();
    h.down(h.cells[0], { clientX: 0, clientY: 0, button: 0, pointerId: 1 });
    h.root.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 40, clientY: 0, pointerId: 9 }));
    expect(h.root.classList.contains('is-dragging')).toBe(false);
    h.setHit(h.cells[3]);
    h.root.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 40, clientY: 0, pointerId: 9 }));
    expect(h.moves).toEqual([]);
  });

  it('a plain click still reaches the cell, and the click after a real drag does not', () => {
    const h = harness();
    const clicks: string[] = [];
    h.root.addEventListener('click', () => clicks.push('click'));

    h.press(h.cells[0]);
    h.setHit(h.cells[0]);
    h.release(0, 0);
    h.cells[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicks).toEqual(['click']);

    h.press(h.cells[0]);
    h.moveTo(40, 0);
    h.setHit(h.cells[3]);
    h.release(40, 0);
    h.cells[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicks).toEqual(['click']);
  });

  it('pointercancel abandons the gesture without reporting a move', () => {
    const h = harness();
    h.press(h.cells[0]);
    h.moveTo(40, 0);
    h.setHit(h.cells[3]);
    h.moveTo(50, 0);
    h.cancel(50, 0);
    expect(h.root.classList.contains('is-dragging')).toBe(false);
    expect(h.root.querySelector('.is-target')).toBeNull();
    h.release(50, 0);
    expect(h.moves).toEqual([]);
  });

  it('marks an insert-mode drag on the pane so the caret can be styled', () => {
    const h = harness({ mode: 'insert' });
    h.press(h.cells[0]);
    h.moveTo(40, 0);
    expect(h.root.classList.contains('is-insert-mode')).toBe(true);
    h.setHit(h.cells[3]);
    h.release(40, 0);
    expect(h.root.classList.contains('is-insert-mode')).toBe(false);
    expect(h.moves).toEqual([[0, 3]]);
  });
});
