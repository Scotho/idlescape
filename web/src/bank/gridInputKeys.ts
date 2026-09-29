// web/src/bank/gridInputKeys.ts -- the keyboard half of the item pane's input layer, split out
// of gridInput.ts when that file reached the 400-line ceiling.
//
// The seam is a real one rather than a line-count convenience: this module never touches a
// pointer, never owns a class, and never paints. It reaches the pointer half through exactly
// four members of `KeysHost` (`held`, `hold`, `dragging`, `cancelDrag`), which is the whole of
// what the two layers share, and everything else it needs comes from the same `GridInputDeps`
// the pointer half was given.
//
// Ruling 2 of gridInput.ts applies here unchanged: NO DOM NODE IS HELD ACROSS A RENDER. Every
// piece of state here is a slot number and nodes are resolved at event time.
import { SLOT_ATTR } from './grid';
import type { GridInputDeps } from './gridInput';
import { BANK_COLUMNS } from './types';

export interface KeysHost {
  /** The pane root. Every node this module touches is resolved from here at event time. */
  root: HTMLElement;
  deps: GridInputDeps;
  /** The slot picked up by keyboard, or null. */
  held(): number | null;
  /** Sets the keyboard hold and repaints. The pointer half owns the classes. */
  hold(slot: number | null): void;
  /** True while a pointer drag is live. Escape belongs to the drag when it is. */
  dragging(): boolean;
  /** Drops the live pointer drag without reporting a move. */
  cancelDrag(): void;
}

export interface GridKeys {
  onKeyDown(ev: KeyboardEvent): void;
}

/** Index in `shown` the key moves to, or -1 for a key that is not movement. */
function stepTo(shown: number[], index: number, key: string): number {
  const last = shown.length - 1;
  if (key === 'ArrowRight') return Math.min(index + 1, last);
  if (key === 'ArrowLeft') return Math.max(index - 1, 0);
  if (key === 'ArrowDown') return Math.min(index + BANK_COLUMNS, last);
  if (key === 'ArrowUp') return Math.max(index - BANK_COLUMNS, 0);
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  return -1;
}

export function createGridKeys(host: KeysHost): GridKeys {
  const { root, deps } = host;

  /**
   * Roving tab stop: exactly one addressable cell stays in the Tab order, the one the player is
   * on. Focus RESTORE across a render is not handled here and must not be: grid.ts reads
   * `slotOf(document.activeElement)` before `replaceChildren` detaches the cell and refocuses
   * the player's own slot afterwards, so focus has exactly one owner. This module only ever
   * moves focus in direct response to a key the player pressed.
   */
  function focusSlot(slot: number): void {
    const cell = root.querySelector<HTMLElement>(`[${SLOT_ATTR}="${slot}"]`);
    if (!cell) return;
    for (const other of root.querySelectorAll<HTMLElement>(`[${SLOT_ATTR}]`)) other.tabIndex = -1;
    cell.tabIndex = 0;
    cell.focus();
  }

  function pickUpOrPlace(slot: number): void {
    const heldSlot = host.held();
    if (heldSlot === null) {
      const name = deps.nameOf(slot);
      if (name === null) return;
      host.hold(slot);
      deps.announce(`Picked up ${name}. Use the arrow keys, then Enter to place it.`);
      return;
    }
    const from = heldSlot;
    // Read the name before the move: onMove reaches the store synchronously, and the layout the
    // name came from is already gone by the time it returns.
    const name = deps.nameOf(from) ?? '';
    host.hold(null);
    if (from === slot) { deps.announce(`Put ${name} back.`); return; }
    // Announced from what the store DID, never from what this key asked for. The store clamps
    // both endpoints onto the last occupied slot and refuses a cross-tab insert outright, so
    // `slot` is a request, not a result: reporting it turned an End key at the bottom of a
    // half-full bank into "Moved Coins to slot 24" for an item that landed in slot 10, and a
    // refused cross-tab insert into a move that never happened at all.
    const outcome = deps.onMove(from, slot);
    if (outcome.moved) { deps.announce(`Moved ${name} to slot ${outcome.to + 1}.`); return; }
    // A refusal carries the reason the store already toasted; a plain no-op (both endpoints
    // clamped onto the same slot) has nothing to explain, so say only that nothing moved.
    deps.announce(outcome.message ?? `${name} stayed in slot ${from + 1}.`);
  }

  function putBack(): void {
    const heldSlot = host.held();
    if (heldSlot === null) return;
    const name = deps.nameOf(heldSlot) ?? '';
    host.hold(null);
    deps.announce(`Put ${name} back.`);
  }

  function onKeyDown(ev: KeyboardEvent): void {
    // Checked before the slot gate, and before anything else: a live pointer drag is cancellable
    // from anywhere inside the pane. preventDefault is the whole point of the branch - it is what
    // tells the window above that this Escape has already been spent, so cancelling a drag does
    // not also close the bank out from under the player. A second Escape then closes it.
    if (ev.key === 'Escape' && host.dragging()) {
      ev.preventDefault();
      host.cancelDrag();
      deps.announce('Move cancelled.');
      return;
    }
    const slot = deps.slotOf(ev.target);
    if (slot === null) return;
    const key = ev.key;

    // A slot the pane is not currently showing is not addressable. An empty or out-of-range tab
    // renders a .bank-empty message with no cells at all, and visible() is empty there, so every
    // branch below is gated on the slot actually being on screen.
    const shown = deps.visible();
    const index = shown.indexOf(slot);
    if (index < 0) return;

    if (key === 'ContextMenu' || (key === 'F10' && ev.shiftKey)) {
      ev.preventDefault();
      deps.onMenuKey(slot);
      return;
    }

    // Ctrl/Meta/Alt combinations belong to the browser and to assistive tech, not to the bank.
    // Shift is deliberately not in this list: Shift+F10 is a pinned binding, handled above.
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

    const next = stepTo(shown, index, key);
    const to = next >= 0 ? shown[next] : undefined;
    if (to !== undefined) {
      ev.preventDefault();
      focusSlot(to);
      return;
    }

    // 'Spacebar' is the legacy key name older engines still send for the space bar.
    if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
      ev.preventDefault();
      pickUpOrPlace(slot);
      return;
    }
    if (key === 'Escape' && host.held() !== null) {
      ev.preventDefault();
      putBack();
    }
  }

  return { onKeyDown };
}
