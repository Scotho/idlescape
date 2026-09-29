// The gesture nobody ends. A mouse pointer gets no implicit capture and this module takes none
// (see the note on GridInputDeps.root), so a button released outside the browser window - routine
// when dragging toward a screen edge - delivers neither pointerup nor pointercancel. Left alone
// the drag stays live indefinitely and the player's next ordinary click commits it as a real bank
// op: onMove into whatever slot they clicked, or an unrequested moveToTab if they clicked a tab.
import { describe, expect, it } from 'vitest';
import { filler, harness, installPointerEvent } from './gridInput.harness';

installPointerEvent();

describe('a release the page never saw', () => {
  it('is cancelled by the next move with no button held', () => {
    const h = harness();
    h.press(h.cells[0]);
    h.setHit(h.cells[3]);
    h.moveTo(40, 0);
    expect(h.root.classList.contains('is-dragging')).toBe(true);

    h.drift(50, 0);
    expect(h.root.classList.contains('is-dragging')).toBe(false);
    expect(h.root.querySelector('.is-target')).toBeNull();

    // The stray pointerup from a later click must find nothing left to commit.
    h.setHit(h.cells[9]);
    h.release(50, 0);
    expect(h.moves).toEqual([]);
  });

  it('never repaints a target once the button is gone', () => {
    const h = harness();
    h.press(h.cells[0]);
    h.moveTo(40, 0);
    h.drift(50, 0);
    // Drifting back over the pane must not behave as though an item were still on the cursor.
    h.setHit(h.cells[3]);
    h.drift(60, 0);
    expect(h.root.querySelector('.is-target')).toBeNull();
    expect(h.root.classList.contains('is-dragging')).toBe(false);
  });

  it('is cleared by the next press, even a press on an empty slot', () => {
    const h = harness();
    h.press(h.cells[0]);
    h.moveTo(40, 0);
    expect(h.root.classList.contains('is-dragging')).toBe(true);

    // An empty slot returns at the nameOf guard. The reset has to happen before that, or this
    // innocuous click's own pointerup commits the dead drag as onMove(0, 9).
    h.press(h.cells[9]);
    expect(h.root.classList.contains('is-dragging')).toBe(false);
    h.setHit(h.cells[9]);
    h.release(0, 0);
    expect(h.moves).toEqual([]);
  });

  it('is cleared by a press that resolves to no slot at all', () => {
    const h = harness();
    const blank = filler(h.root);
    h.press(h.cells[0]);
    h.moveTo(40, 0);
    h.press(blank);
    expect(h.root.classList.contains('is-dragging')).toBe(false);
    h.setHit(h.cells[9]);
    h.release(0, 0);
    expect(h.moves).toEqual([]);
  });

  it('cannot be committed as an unrequested tab move', () => {
    const header = document.createElement('div');
    document.body.appendChild(header);
    const h = harness({ tabAt: node => (node === header ? 2 : null) });
    h.press(h.cells[0]);
    h.moveTo(40, 0);
    // Moving the cursor toward the tab bar with nothing held is what actually happens next.
    h.drift(80, 0);
    h.setHit(header);
    h.release(80, 0);
    expect(h.tabDrops).toEqual([]);
    expect(h.moves).toEqual([]);
  });

  it('is cancelled when the window loses focus mid-drag', () => {
    const h = harness();
    h.press(h.cells[0]);
    h.setHit(h.cells[3]);
    h.moveTo(40, 0);
    expect(h.root.classList.contains('is-dragging')).toBe(true);

    h.blur();
    expect(h.root.classList.contains('is-dragging')).toBe(false);
    expect(h.root.querySelector('.is-source')).toBeNull();
    h.release(40, 0);
    expect(h.moves).toEqual([]);
  });

  it('leaves no click to swallow, so the next click still gets through', () => {
    const h = harness();
    const clicks: string[] = [];
    h.root.addEventListener('click', () => clicks.push('click'));
    h.press(h.cells[0]);
    h.moveTo(40, 0);
    h.drift(50, 0);
    h.cells[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicks).toEqual(['click']);
  });
});
