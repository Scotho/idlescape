// web/src/bank/gridInput.ts -- the input layer over the item pane (Task 8's grid). It turns a
// pointer drag or an arrow-key move into a single reported move and never touches the bank
// layout itself.
//
// Two rulings shape this file:
//
// 1. This module NEVER calls layout.ts's localSwap/localInsert. Those helpers deliberately do
//    not clamp their endpoints, the engine does, and the store's submit() is the only place the
//    web applies that clamp. A "preview" painted by calling the helpers directly would show a
//    gap the engine will never produce, which the next poll then erases under the player's
//    cursor. The drag preview here is therefore presentational only: is-source on the origin
//    cell and is-target on the hovered one. The move itself leaves through onMove, and the
//    caller routes it into the store.
// 2. NO DOM NODE IS HELD ACROSS A RENDER. grid.render() rebuilds the pane with
//    replaceChildren(), and it also runs from the icon cache's onChange, which fires whenever an
//    item model finishes streaming out of the game client. That can land in the middle of a
//    drag. Every piece of gesture state here is a slot number, nodes are resolved at event time,
//    and the classes are repainted from those slot numbers whenever the pane's children change.
import { SLOT_ATTR } from './grid';
import { createGridKeys } from './gridInputKeys';
import type { RearrangeMode } from './types';

/**
 * What the caller's store actually did with a reported move. The store clamps both endpoints onto
 * the last occupied slot and refuses a cross-tab insert, so the slot a gesture ASKED for is not
 * always the slot an item landed in - and the keyboard layer announces into a live region, where
 * saying otherwise is a plain lie to assistive tech.
 */
export type MoveOutcome =
  /** The store took it. `to` is where the item really landed, which may not be where it was aimed. */
  | { moved: true; to: number }
  /** Nothing moved. `message` is what the player was told, when there was anything to tell. */
  | { moved: false; message: string | null };

export interface GridInputDeps {
  /** The pane root. pointerdown, keydown, click and dragstart are delegated here, and it is
   *  what every class this module sets is scoped to. The three listeners a live drag needs
   *  (pointermove, pointerup, pointercancel) go on `root.ownerDocument` instead, and the blur
   *  cancel on its window, because a drag that leaves the pane must still be tracked and a
   *  release outside it must still end the gesture. All of them are removed by detach(). */
  root: HTMLElement;
  slotOf(node: EventTarget | null): number | null;
  visible(): number[];
  mode(): RearrangeMode;
  /** Both ends are real slots. The caller turns them into a swap or an insert, and answers with
   *  what its store actually did so the keyboard layer can announce THAT. */
  onMove(from: number, to: number): MoveOutcome;
  /** The pointer was released over a tab header: 1..9, or 'new' for the "+" tab. */
  onDropOnTab(slot: number, tab: number | 'new'): void;
  /** The context-menu key was pressed on a slot. */
  onMenuKey(slot: number): void;
  /** Which element is under a point. Seam so jsdom does not need a layout engine. */
  hitTest(x: number, y: number): Element | null;
  /** The tab a hit-test result belongs to, or null. Supplied by the tab bar. */
  tabAt(node: Element | null): number | 'new' | null;
  /** Item name for the announcements, or null for an empty slot. */
  nameOf(slot: number): string | null;
  announce(message: string): void;
}

export interface GridInput {
  detach(): void;
  /**
   * Drops whatever gesture is in flight (a pointer drag, a keyboard hold) and repaints, WITHOUT
   * unbinding the root listeners, so the same pane can be driven again afterwards. `detach()` is
   * one-way and cannot serve here: the bank window closes and reopens, and a close mid-drag has
   * to leave the document-level pointermove/pointerup listeners unbound and the gesture state
   * clear, or a pointerup delivered after the close still reports a move for a window that is
   * gone. Idempotent, and a no-op once detached.
   */
  cancel(): void;
  /** The slot picked up by keyboard, or null. The view draws it as held. */
  held(): number | null;
}

/** Pointer travel before a press becomes a drag. */
export const DRAG_THRESHOLD_PX = 4;

const DRAGGING = 'is-dragging';
const SOURCE = 'is-source';
const TARGET = 'is-target';
const HELD = 'is-held';
/** Set on the pane for the length of an insert-mode drag so the stylesheet can draw an
 *  insertion caret rather than a swap highlight. This is the only use this module has for
 *  mode(): the op itself is built by the caller, which reads the mode for that. */
const INSERT_MODE = 'is-insert-mode';

export function attachGridInput(deps: GridInputDeps): GridInput {
  const { root } = deps;
  const doc = root.ownerDocument;
  const view = doc.defaultView;

  let attached = true;
  /** The slot the pointer went down on, or null. Never an element. */
  let pressSlot: number | null = null;
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let targetSlot: number | null = null;
  let heldSlot: number | null = null;
  /** True between a real drag ending and the synthetic click that follows it. */
  let draggedSinceDown = false;
  let docBound = false;
  let observer: MutationObserver | null = null;

  // Every selector below keys on [data-bank-slot], never on .bank-slot: a filtered tab's inert
  // filler cells carry the bank-slot class too, and only the attribute marks a real, addressable
  // cell. deps.slotOf draws the same line, which is why a filler is never a gesture endpoint.
  function cellFor(slot: number): HTMLElement | null {
    return root.querySelector<HTMLElement>(`[${SLOT_ATTR}="${slot}"]`);
  }

  function stripClass(name: string): void {
    for (const el of root.querySelectorAll<HTMLElement>(`.${name}`)) el.classList.remove(name);
  }

  function bindDoc(): void {
    if (docBound) return;
    docBound = true;
    doc.addEventListener('pointermove', onPointerMove);
    doc.addEventListener('pointerup', onPointerUp);
    doc.addEventListener('pointercancel', onPointerCancel);
    // Alt-tabbing away mid-drag delivers no pointer event at all, so the buttons check below
    // never gets a chance to run and the pane would sit painted mid-drag until the player came
    // back and moved. Bound and released with the other three, so it cannot outlive a gesture.
    view?.addEventListener('blur', onWindowBlur);
  }

  function unbindDoc(): void {
    if (!docBound) return;
    docBound = false;
    doc.removeEventListener('pointermove', onPointerMove);
    doc.removeEventListener('pointerup', onPointerUp);
    doc.removeEventListener('pointercancel', onPointerCancel);
    view?.removeEventListener('blur', onWindowBlur);
  }

  /** Abandons a gesture: no move is reported, the classes come off, and there is no trailing
   *  click to swallow because the button was released somewhere we never heard about. */
  function abandon(): void {
    resetPointer();
    draggedSinceDown = false;
    paint();
  }

  /**
   * Drops EVERY gesture without reporting anything: the pointer drag through abandon(), which is
   * also what releases the document listeners and the window blur listener bound with them, plus
   * the keyboard hold, which abandon() has no business knowing about. Shared by the Escape branch
   * and by the public cancel().
   */
  function cancelGesture(): void {
    if (!attached) return;
    heldSlot = null;
    abandon();
  }

  /** Drops the pointer gesture without reporting anything. */
  function resetPointer(): void {
    pressSlot = null;
    pointerId = null;
    dragging = false;
    targetSlot = null;
    unbindDoc();
  }

  /**
   * Repaints every class this module owns from the current slot numbers. Safe to call at any
   * time and after any render: it resolves cells freshly and drops state whose slot is no longer
   * on screen (a tab switch mid-drag, say).
   */
  function paint(): void {
    if (!attached) return;
    const shown = deps.visible();
    if (pressSlot !== null && !shown.includes(pressSlot)) resetPointer();
    if (targetSlot !== null && !shown.includes(targetSlot)) targetSlot = null;
    if (heldSlot !== null && !shown.includes(heldSlot)) heldSlot = null;

    stripClass(SOURCE);
    stripClass(TARGET);
    stripClass(HELD);
    root.classList.toggle(DRAGGING, dragging);
    root.classList.toggle(INSERT_MODE, dragging && deps.mode() === 'insert');
    if (dragging && pressSlot !== null) cellFor(pressSlot)?.classList.add(SOURCE);
    if (dragging && targetSlot !== null) cellFor(targetSlot)?.classList.add(TARGET);
    if (heldSlot !== null) cellFor(heldSlot)?.classList.add(HELD);
  }

  function mine(ev: PointerEvent): boolean {
    return pressSlot !== null && (pointerId === null || ev.pointerId === pointerId);
  }

  function onPointerDown(ev: PointerEvent): void {
    // FIRST, before any early return below. A gesture whose pointerup was never delivered (the
    // button released outside the window, with no implicit capture for a mouse and no
    // pointercancel to follow) is still live here, and this press's own pointerup would then
    // commit it: onMove into whatever slot the player innocently clicked, or onDropOnTab if
    // they clicked a tab header. Pressing an empty slot used to return at the nameOf guard
    // below without clearing it, which is exactly how that chain was reproduced.
    const stale = pressSlot !== null;
    resetPointer();
    draggedSinceDown = false;
    if (stale) paint();

    const slot = deps.slotOf(ev.target);
    // Filler cells in a filtered tab carry no data-bank-slot, so they resolve to null here and
    // are never a gesture origin.
    if (slot === null) return;
    if (ev.button !== 0) return;
    // An empty slot has nothing to pick up. nameOf is this module's occupancy oracle.
    if (deps.nameOf(slot) === null) return;
    // A pointer gesture supersedes a keyboard hold. The hold is dropped without an announcement
    // because the player is plainly driving with the pointer.
    heldSlot = null;
    pressSlot = slot;
    pointerId = ev.pointerId;
    startX = ev.clientX;
    startY = ev.clientY;
    dragging = false;
    targetSlot = null;
    bindDoc();
    paint();
    // No preventDefault: the press must still focus the cell and still produce a click, so a
    // plain click keeps reaching the context menu and the cell's own handlers.
  }

  function onPointerMove(ev: PointerEvent): void {
    if (!mine(ev)) return;
    // No button held means the release happened somewhere we were never told about: outside the
    // browser window, which is routine when dragging toward a screen edge. Neither pointerup nor
    // pointercancel is delivered there, so this is the only signal the gesture is over. Without
    // it the drag stays live indefinitely and the next ordinary click commits it as a real op.
    if (ev.buttons === 0) { abandon(); return; }
    const started = !dragging;
    if (!dragging) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) <= DRAG_THRESHOLD_PX) return;
      dragging = true;
      draggedSinceDown = true;
    }
    const over = deps.slotOf(deps.hitTest(ev.clientX, ev.clientY));
    const next = over !== null && over !== pressSlot ? over : null;
    if (!started && next === targetSlot) return;
    targetSlot = next;
    paint();
  }

  function onPointerUp(ev: PointerEvent): void {
    if (!mine(ev)) return;
    const from = pressSlot;
    const wasDragging = dragging;
    resetPointer();
    paint();
    if (from === null || !wasDragging) return;
    const node = deps.hitTest(ev.clientX, ev.clientY);
    // A tab header under the pointer wins: that is a moveToTab, which the tab bar owns.
    const tab = deps.tabAt(node);
    if (tab !== null) { deps.onDropOnTab(from, tab); return; }
    const to = deps.slotOf(node);
    // Off the grid, or back on the source: nothing happened.
    if (to === null || to === from) return;
    // The outcome is deliberately dropped here. A pointer drag is its own feedback - the pane
    // repaints under the cursor - and the store already toasts a refusal, so announcing every
    // drag into the live region would narrate what the player can see while adding nothing a
    // refusal has not already said. The keyboard path, which is driven blind, announces instead.
    deps.onMove(from, to);
  }

  function onPointerCancel(ev: PointerEvent): void {
    if (!mine(ev)) return;
    abandon();
  }

  /** The window lost focus mid-gesture; the release will happen where we cannot see it. */
  function onWindowBlur(): void {
    if (pressSlot === null) return;
    abandon();
  }

  /** Swallows the click a real drag leaves behind so a drag never reads as a click. */
  function onClickCapture(ev: Event): void {
    if (!draggedSinceDown) return;
    draggedSinceDown = false;
    ev.preventDefault();
    ev.stopPropagation();
  }

  /** Item icons are <img>, which the browser would otherwise native-drag out of the page. */
  function onDragStart(ev: Event): void {
    ev.preventDefault();
  }

  // The keyboard half. It reaches this one through four members and nothing else: the hold, the
  // drag flag and the drag cancel. `hold` repaints here rather than there because the classes are
  // this module's, not the keyboard layer's.
  const keys = createGridKeys({
    root,
    deps,
    held: () => heldSlot,
    hold: slot => { heldSlot = slot; paint(); },
    dragging: () => dragging,
    cancelDrag: cancelGesture
  });
  const onKeyDown = (ev: KeyboardEvent): void => { keys.onKeyDown(ev); };

  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('keydown', onKeyDown);
  root.addEventListener('click', onClickCapture, true);
  root.addEventListener('dragstart', onDragStart);
  // The pane is rebuilt wholesale by render(), so repaint from the slot numbers when that
  // happens rather than holding the nodes. Only childList is observed, so this module's own
  // class and tabIndex writes never re-enter it. grid.ts coalesces a burst of icon arrivals onto
  // one microtask, which narrows this window but does not close it.
  observer = new MutationObserver(() => paint());
  observer.observe(root, { childList: true, subtree: true });

  return {
    detach(): void {
      if (!attached) return;
      attached = false;
      resetPointer();
      heldSlot = null;
      draggedSinceDown = false;
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('click', onClickCapture, true);
      root.removeEventListener('dragstart', onDragStart);
      observer?.disconnect();
      observer = null;
      root.classList.remove(DRAGGING, INSERT_MODE);
      stripClass(SOURCE);
      stripClass(TARGET);
      stripClass(HELD);
    },
    cancel: cancelGesture,
    held: () => heldSlot
  };
}
