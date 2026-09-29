// web/src/bank/gridInput.harness.ts -- test-only fixtures shared by gridInput.test.ts and
// gridInput.dispose.test.ts. They live here rather than inside either file so both stay under
// the 400-line ceiling. Nothing in the shipped bundle imports this module.
import { attachGridInput, type GridInput, type GridInputDeps, type MoveOutcome } from './gridInput';
import type { RearrangeMode } from './types';

/**
 * jsdom 26 still ships no PointerEvent, only MouseEvent, so `new PointerEvent(...)` throws under
 * the test environment. This is the smallest faithful stand-in: a MouseEvent carrying pointerId
 * and pointerType. gridInput only ever reads button, clientX, clientY and pointerId, and never
 * does `instanceof PointerEvent`, so the substitution is behaviour complete for its purposes.
 */
class FakePointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
  }
}

/** Call once per test file, at module scope, before any test constructs a PointerEvent. */
export function installPointerEvent(): void {
  const target = globalThis as { PointerEvent?: unknown };
  if (typeof target.PointerEvent === 'undefined') target.PointerEvent = FakePointerEvent;
}

export const NAMES: Record<number, string> = { 0: 'Coins', 1: 'Red partyhat', 2: 'Uncut diamond' };

/** Sixteen cells, two rows of eight, the first three occupied. */
export function pane(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'bank-pane';
  for (let slot = 0; slot < 16; slot++) {
    const cell = document.createElement('div');
    cell.className = 'bank-slot';
    cell.dataset.bankSlot = String(slot);
    cell.tabIndex = slot === 0 ? 0 : -1;
    root.appendChild(cell);
  }
  document.body.appendChild(root);
  return root;
}

/** A cell carrying no data-bank-slot, the way a filtered tab's inert filler cells are built. */
export function filler(root: HTMLElement): HTMLElement {
  const cell = document.createElement('div');
  cell.className = 'bank-slot bank-slot-filler';
  root.appendChild(cell);
  return cell;
}

/**
 * Sixteen fresh cell nodes, as grid.render() produces when it rebuilds the pane. The tab stop
 * is on slot 0, which is where grid puts it on every rebuild: its own `focusSlot` is only ever
 * `visibleSlots[0]` and never follows the player.
 */
export function rebuiltCells(): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (let slot = 0; slot < 16; slot++) {
    const cell = document.createElement('div');
    cell.className = 'bank-slot';
    cell.dataset.bankSlot = String(slot);
    cell.tabIndex = slot === 0 ? 0 : -1;
    out.push(cell);
  }
  return out;
}

export interface Harness {
  root: HTMLElement;
  cells: HTMLElement[];
  input: GridInput;
  moves: [number, number][];
  tabDrops: [number, number | 'new'][];
  menus: number[];
  said: string[];
  press(cell: HTMLElement, x?: number, y?: number): void;
  down(cell: HTMLElement, init: PointerEventInit): void;
  /** A pointermove with the left button still held: buttons = 1. */
  moveTo(x: number, y: number): void;
  /** A pointermove with NO button held, which is what arrives after a release the page never
   *  saw (the button let go outside the browser window). */
  drift(x: number, y: number): void;
  release(x: number, y: number): void;
  cancel(x: number, y: number): void;
  /** The window loses focus, e.g. the player alt-tabs away mid-drag. */
  blur(): void;
  key(cell: HTMLElement, init: KeyboardEventInit): void;
  setHit(el: Element | null): void;
}

export interface HarnessOverrides {
  mode?: RearrangeMode;
  tabAt?: (node: Element | null) => number | 'new' | null;
  /** Defaults to every one of the sixteen cells. `() => []` is the empty-tab case, where
   *  grid.ts renders a .bank-empty message and no addressable cells at all. */
  visible?: () => number[];
  /** Defaults to NAMES, which occupies slots 0-2. Override to occupy a different range, e.g.
   *  for a tab whose slots do not start at zero. */
  nameOf?: (slot: number) => string | null;
  /** Wraps the deps before they reach attachGridInput, so a test can instrument the target. */
  attach?: (deps: GridInputDeps) => GridInput;
  /** What the store answers with. Defaults to "applied, exactly where you asked"; override to
   *  reproduce the store's clamp or its cross-tab refusal. */
  onMove?: (from: number, to: number) => MoveOutcome;
}

export function harness(over: HarnessOverrides = {}): Harness {
  const root = pane();
  const cells = Array.from(root.querySelectorAll<HTMLElement>('[data-bank-slot]'));
  const moves: [number, number][] = [];
  const tabDrops: [number, number | 'new'][] = [];
  const menus: number[] = [];
  const said: string[] = [];
  let hit: Element | null = null;
  const deps: GridInputDeps = {
    root,
    slotOf: node => {
      const cell = (node as HTMLElement | null)?.closest?.<HTMLElement>('[data-bank-slot]');
      return cell ? Number(cell.dataset.bankSlot) : null;
    },
    visible: over.visible ?? (() => cells.map((_, slot) => slot)),
    mode: () => over.mode ?? 'swap',
    onMove: (from, to) => { moves.push([from, to]); return over.onMove ? over.onMove(from, to) : { moved: true, to }; },
    onDropOnTab: (slot, tab) => tabDrops.push([slot, tab]),
    onMenuKey: slot => menus.push(slot),
    hitTest: () => hit,
    tabAt: over.tabAt ?? (() => null),
    nameOf: over.nameOf ?? (slot => NAMES[slot] ?? null),
    announce: message => said.push(message)
  };
  const input = (over.attach ?? attachGridInput)(deps);
  const down = (cell: HTMLElement, init: PointerEventInit): void => { cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, ...init })); };
  const press = (cell: HTMLElement, x = 0, y = 0): void => { down(cell, { clientX: x, clientY: y, button: 0, buttons: 1 }); };
  const moveTo = (x: number, y: number): void => { root.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y, buttons: 1 })); };
  const drift = (x: number, y: number): void => { root.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y, buttons: 0 })); };
  const release = (x: number, y: number): void => { root.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y })); };
  const cancel = (x: number, y: number): void => { root.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, clientX: x, clientY: y })); };
  const key = (cell: HTMLElement, init: KeyboardEventInit): void => { cell.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init })); };
  const blur = (): void => { window.dispatchEvent(new Event('blur')); };
  return { root, cells, input, moves, tabDrops, menus, said, press, down, moveTo, drift, release, cancel, blur, key, setHit: (el: Element | null) => { hit = el; } };
}

/** One recorded add/removeEventListener call, so disposal can be proved rather than inferred
 *  from "nothing seems to happen afterwards". */
export interface LedgerEntry { target: string; type: string; fn: unknown; capture: boolean; kind: 'add' | 'remove' }

function captureOf(options: boolean | AddEventListenerOptions | EventListenerOptions | undefined): boolean {
  return typeof options === 'boolean' ? options : options?.capture === true;
}

/** Records every listener added to and removed from `target`. Returns the undo. */
export function instrument(target: EventTarget, name: string, log: LedgerEntry[]): () => void {
  const add = target.addEventListener.bind(target);
  const remove = target.removeEventListener.bind(target);
  const patched = target as {
    addEventListener: EventTarget['addEventListener'];
    removeEventListener: EventTarget['removeEventListener'];
  };
  // `window` carries its own addEventListener rather than inheriting EventTarget's, so undoing
  // by delete alone would strip the method off it for the rest of the file. Put back exactly
  // what was there: the own value if there was one, otherwise nothing.
  const owned = {
    add: Object.prototype.hasOwnProperty.call(target, 'addEventListener') ? patched.addEventListener : null,
    remove: Object.prototype.hasOwnProperty.call(target, 'removeEventListener') ? patched.removeEventListener : null
  };
  patched.addEventListener = (type, fn, options) => {
    log.push({ target: name, type, fn, capture: captureOf(options), kind: 'add' });
    add(type, fn, options);
  };
  patched.removeEventListener = (type, fn, options) => {
    log.push({ target: name, type, fn, capture: captureOf(options), kind: 'remove' });
    remove(type, fn, options);
  };
  return () => {
    if (owned.add) patched.addEventListener = owned.add;
    else delete (patched as Partial<typeof patched>).addEventListener;
    if (owned.remove) patched.removeEventListener = owned.remove;
    else delete (patched as Partial<typeof patched>).removeEventListener;
  };
}

/** Listeners the ledger saw added but never removed, keyed by target, type, capture and identity. */
export function outstanding(log: LedgerEntry[]): string[] {
  const counts = new Map<string, number>();
  for (const entry of log) {
    const id = `${entry.target}:${entry.type}:capture=${entry.capture}:fn#${log.findIndex(e => e.fn === entry.fn)}`;
    counts.set(id, (counts.get(id) ?? 0) + (entry.kind === 'add' ? 1 : -1));
  }
  return [...counts.entries()].filter(([, count]) => count !== 0).map(([id]) => id);
}
