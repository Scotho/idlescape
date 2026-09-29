// web/src/bank/storeOps.ts -- the pure op-shaping rules the store applies to every op before it
// queues one. Split out of store.ts, which is at the 400-line ceiling; these are the only pieces
// of that file that need nothing but their arguments, so they are also the only ones that can be
// read (and re-read, by store.fake.ts) without the whole state machine around them.
import { localInsert, localSort, localSwap } from './layout';
import type { BankItems, BankOp, ObjInfo } from './types';

/** The engine's own `validSlot`: an endpoint outside the container fails the whole batch. */
export function endpointsInContainer(op: BankOp, capacity: number): boolean {
  const inContainer = (slot: number): boolean => Number.isInteger(slot) && slot >= 0 && slot < capacity;
  if (op.op === 'swap') return inContainer(op.a) && inContainer(op.b);
  if (op.op === 'insert') return inContainer(op.from) && inContainer(op.to);
  if (op.op === 'moveToTab') return inContainer(op.slot);
  return true;
}

/**
 * Both ends of a move are pinned to the last occupied slot, exactly as the engine's ops.ts does
 * it: the slots past the items are not a place, they are the absence of items. Previewing a move
 * into one paints a phantom gap that the next poll silently erases. layout.ts deliberately does
 * not clamp, so this is the web's only clamp, and every caller (the pointer layer and the
 * keyboard layer alike) reaches it by going through submit().
 */
export function clampOp(op: BankOp, used: number): BankOp {
  const last = Math.max(used - 1, 0);
  if (op.op === 'swap') return { op: 'swap', a: Math.min(op.a, last), b: Math.min(op.b, last) };
  if (op.op === 'insert') return { op: 'insert', from: Math.min(op.from, last), to: Math.min(op.to, last) };
  return op;
}

/** A drag that lands back on its own slot is common, and applying it would still arm push-out
 *  for a tick while changing nothing at all. It is dropped rather than sent. */
export function isNoOp(op: BankOp): boolean {
  return (op.op === 'swap' && op.a === op.b) || (op.op === 'insert' && op.from === op.to);
}

/** Ops the engine may restructure the tab sizes for, so the store re-reads once they land. A
 *  sort compacts holes and then clamps the tabs down onto the items; the preview cannot. */
export function needsRead(op: BankOp): boolean {
  return op.op === 'moveToTab' || op.op === 'setTabs' || op.op === 'sort';
}

/**
 * The optimistic preview for the ops whose result the web can compute exactly, or null for the
 * ones only the engine can. moveToTab and setTabs restructure the tabs and the engine's own
 * arithmetic decides the result (it creates, grows, shrinks and drops tabs), so the store waits
 * and re-reads instead of guessing.
 */
export function previewOf(
  op: BankOp,
  view: { items: BankItems; tabs: number[]; used: number },
  info: (obj: number) => ObjInfo | null
): BankItems | null {
  if (op.op === 'swap') return localSwap(view.items, op.a, op.b);
  if (op.op === 'insert') return localInsert(view.items, op.from, op.to);
  if (op.op === 'sort') return localSort(view.items, view.tabs, op.tab, view.used, op.by, info);
  return null;
}
