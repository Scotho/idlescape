// web/src/bank/grid.ts -- the item pane: eight columns, OSRS-style counts, tab dividers,
// search dimming. This is the render surface for the bank window; Task 9 attaches drag and
// keyboard handling to the elements produced here via `slotOf` and `visible`.
import { h } from '../ui/el';
import type { BankState } from './store';
import type { IconCache } from './icons';
import { formatCount, rangeOfTab, tabIconObj, tabRanges } from './layout';
import { BANK_COLUMNS, type BankSlot, type MenuItemContext, type ObjInfo } from './types';

export interface BankGridDeps {
  icons: IconCache;
  info(obj: number): ObjInfo | null;
  /** 0 is "All items"; 1..9 is a tab. */
  selectedTab(): number;
  /** Lower-cased search text, or ''. */
  search(): string;
  onMenu(ctx: MenuItemContext, at: { x: number; y: number }): void;
}

export interface BankGrid {
  el: HTMLElement;
  render(state: BankState): void;
  /** The slot a DOM node belongs to, or null. Used by the input layer (Task 9). */
  slotOf(node: EventTarget | null): number | null;
  /** Every rendered slot index, in visual order. Used for keyboard movement. */
  visible(): number[];
  /** Releases the `icons.onChange` subscription. Idempotent. Task 12's `BankWindow.destroy()`
   *  must call this on every teardown: `IconCache` is a cross-window singleton, so a grid that
   *  never disposes leaks its listener, its closed-over `lastState` and its detached `el` for
   *  the life of the page. */
  dispose(): void;
}

/** DOM contract the e2e spec and the input layer both depend on. */
export const SLOT_ATTR = 'data-bank-slot';
const OBJ_ATTR = 'data-bank-obj';
const DIVIDER_ATTR = 'data-bank-divider';

/**
 * A short tile label for an item with no icon cached yet. Names that already fit a small tile
 * are shown whole; a longer name is cut to its first word, provided that word is itself long
 * enough to be worth showing alone, otherwise the whole name is truncated instead. A name that
 * streamed in blank (never seen from live OSRS data, but ObjInfo.name is not statically
 * guaranteed non-empty) falls back to a placeholder rather than an empty, unlabelled tile.
 */
function abbreviate(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return '?';
  if (trimmed.length <= 12) return trimmed;
  const [first] = trimmed.split(' ');
  if (first.length >= 3 && first.length < trimmed.length) return `${first}…`;
  return `${trimmed.slice(0, 11)}…`;
}

export function createBankGrid(deps: BankGridDeps): BankGrid {
  let lastState: BankState | null = null;
  let focusSlot = -1;
  let visibleSlots: number[] = [];
  let rendering = false;
  let repaintScheduled = false;
  let disposed = false;

  function slotOf(node: EventTarget | null): number | null {
    if (!(node instanceof Node)) return null;
    let cursor: Node | null = node;
    while (cursor) {
      if (cursor instanceof HTMLElement && cursor.hasAttribute(SLOT_ATTR)) {
        const raw = Number(cursor.getAttribute(SLOT_ATTR));
        return Number.isNaN(raw) ? null : raw;
      }
      cursor = cursor.parentNode;
    }
    return null;
  }

  function handleContextMenu(ev: Event): void {
    // preventDefault only once there is actually a menu to open. It used to run first, so a
    // right-click on a filler cell, on a divider, on an empty slot or on bare pane background
    // swallowed the browser's own menu and put nothing in its place: the player got no menu at
    // all, from either side, and no way to reach Inspect or Reload over the bank.
    if (!lastState) return;
    const slot = slotOf(ev.target);
    if (slot === null) return;
    const item = lastState.items[slot] ?? null;
    if (!item) return;
    ev.preventDefault();
    const info = deps.info(item.obj);
    const mouse = ev as MouseEvent;
    deps.onMenu({ slot, obj: item.obj, count: item.count, info }, { x: mouse.clientX, y: mouse.clientY });
  }

  const el = h('div', { class: 'bank-pane', role: 'grid', oncontextmenu: handleContextMenu });

  // Presentation, not gridcell: a filler exists only to keep the visual row eight wide. Giving
  // it role=gridcell (even aria-hidden) leaves assistive tech counting a column that isn't
  // really there. It keeps the `bank-slot` class for shared styling, so anything that needs the
  // REAL, addressable cells (Task 9's input layer, Task 13's stylesheet selectors) must key off
  // `[data-bank-slot]`, never `.bank-slot` alone.
  function buildFillerCell(): HTMLElement {
    return h('div', { class: 'bank-slot bank-slot-filler', role: 'presentation' });
  }

  function buildCell(slot: number, item: BankSlot | null, searchText: string): HTMLElement {
    const info = item ? deps.info(item.obj) : null;
    const name = info?.name ?? (item ? String(item.obj) : '');
    const matches = item !== null && name.toLowerCase().includes(searchText);
    const dim = searchText !== '' && !matches;
    const count = item ? formatCount(item.count) : null;
    const iconUrl = item ? deps.icons.peek(item.obj) : null;
    const label = item
      ? `Slot ${slot + 1}: ${name}${item.count === 1 ? '' : `, ${item.count}`}`
      : `Slot ${slot + 1}: empty`;

    return h('div',
      {
        class: dim ? 'bank-slot dim' : 'bank-slot',
        role: 'gridcell',
        [SLOT_ATTR]: String(slot),
        [OBJ_ATTR]: item ? String(item.obj) : null,
        'aria-label': label
      },
      item
        ? (iconUrl ? h('img', { class: 'bank-icon', src: iconUrl, alt: '' }) : h('span', { class: 'bank-fallback' }, abbreviate(name)))
        : null,
      count ? h('span', { class: `bank-count count-${count.tone}` }, count.text) : null
    );
  }

  function buildDivider(tab: number, iconObj: number | null): HTMLElement {
    const iconUrl = iconObj !== null ? deps.icons.peek(iconObj) : null;
    return h('div', { class: 'bank-divider', [DIVIDER_ATTR]: String(tab) },
      iconUrl ? h('img', { class: 'bank-icon', src: iconUrl, alt: '' }) : null
    );
  }

  /** True while `el` (or a descendant of it) holds document focus. Read before `replaceChildren`
   *  wipes the old tree out from under it, so the new roving cell can be refocused afterward. */
  function paneHasFocus(): boolean {
    return document.activeElement !== null && el.contains(document.activeElement);
  }

  function showEmpty(message: string): void {
    visibleSlots = [];
    el.replaceChildren(h('div', { class: 'bank-empty' }, message));
  }

  function build(state: BankState): void {
    // dispose() only stops FUTURE onChange invocations; a repaint already coalesced onto a
    // microtask before dispose() ran is still in flight and would otherwise land on a dead grid
    // (replaceChildren on a detached el, a re-prime nobody asked for). Checking here, in the one
    // funnel every call path (render(), the coalesced repaint, and any future scheduling path)
    // goes through, covers all of them at once rather than trusting each caller to check.
    if (disposed) return;
    // Re-entrancy guard: a render() call and a coalesced icon repaint can never race in practice
    // (prime() is async and onChange is coalesced onto a microtask), but this covers both call
    // paths in one place rather than trusting each caller to wrap itself.
    if (rendering) return;
    rendering = true;
    try {
      buildInner(state);
    } finally {
      rendering = false;
    }
  }

  function buildInner(state: BankState): void {
    if (state.used === 0) {
      showEmpty('Your bank is empty.');
      return;
    }

    const columns = BANK_COLUMNS;
    const tab = deps.selectedTab();
    const searchText = deps.search();
    const allItems = tab === 0;

    let realStart: number;
    let realEnd: number;
    let renderStart: number;
    let renderEnd: number;

    if (allItems) {
      realStart = 0;
      realEnd = state.used;
      renderStart = 0;
      renderEnd = Math.min(state.capacity, Math.ceil(realEnd / columns) * columns + columns);
    } else {
      const range = rangeOfTab(state.tabs, tab, state.used);
      realStart = range.start;
      realEnd = range.end;
      renderStart = Math.floor(realStart / columns) * columns;
      renderEnd = Math.ceil(realEnd / columns) * columns;
    }

    // A tab past the declared count, or a tab whose own declared size is zero, has no real
    // slots at all: rangeOfTab collapses to start === end. Falling through would draw a row of
    // pure filler (or, when start/end both land on a row boundary, nothing at all) - a blank
    // rectangle the player can neither focus nor drop into. Say so instead.
    if (!allItems && realEnd <= realStart) {
      showEmpty('This tab is empty.');
      return;
    }

    // Two tabs can declare sizes that land their starts in the same physical row (tab sizes are
    // an arbitrary slot count via `setTabs`, not a multiple of BANK_COLUMNS). Keeping only the
    // first and dropping the rest would silently orphan the second tab's items under the first
    // tab's heading; stacking both dividers looks odd but never hides a tab.
    const dividerAtRow = new Map<number, number[]>();
    if (allItems) {
      tabRanges(state.tabs).forEach((range, i) => {
        const row = Math.floor(range.start / columns);
        const tabsHere = dividerAtRow.get(row);
        if (tabsHere) tabsHere.push(i + 1);
        else dividerAtRow.set(row, [i + 1]);
      });
    }

    const objsDrawn: number[] = [];
    const nextVisible: number[] = [];
    const slotCells = new Map<number, HTMLElement>();
    const children: HTMLElement[] = [];

    const firstRow = Math.floor(renderStart / columns);
    const lastRow = renderEnd > renderStart ? Math.ceil(renderEnd / columns) - 1 : firstRow - 1;

    for (let row = firstRow; row <= lastRow; row++) {
      const dividerTabs = dividerAtRow.get(row);
      if (dividerTabs) {
        for (const dividerTab of dividerTabs) {
          children.push(buildDivider(dividerTab, tabIconObj(state.items, state.tabs, dividerTab, state.used)));
        }
      }
      const rowCells: HTMLElement[] = [];
      for (let col = 0; col < columns; col++) {
        const slot = row * columns + col;
        const isReal = allItems ? slot < renderEnd : slot >= realStart && slot < realEnd;
        if (!isReal) {
          rowCells.push(buildFillerCell());
          continue;
        }
        const item = state.items[slot] ?? null;
        const cell = buildCell(slot, item, searchText);
        slotCells.set(slot, cell);
        nextVisible.push(slot);
        if (item) objsDrawn.push(item.obj);
        rowCells.push(cell);
      }
      children.push(h('div', { class: 'bank-row', role: 'row' }, ...rowCells));
    }

    visibleSlots = nextVisible;
    // The player's own focus wins over the roving default. Read it here, while the old cell is
    // still attached and document.activeElement still points at it: without this, focusSlot is
    // only ever visibleSlots[0], so a keyboard user on slot 40 is thrown back to slot 1 by every
    // icon that lands.
    //
    // And when the pane does NOT have focus, the tab stop is read back off the DOM instead. This
    // module is not the only writer of it: gridInputKeys.focusSlot() sets tabIndex straight on
    // the cell as the player arrows around, so [data-bank-slot][tabindex="0"] is where the pane's
    // current tab stop actually lives. Deriving from activeElement alone meant that arrowing to
    // slot 16, clicking away, and then ANY repaint (a poll, an icon arrival) silently reverted
    // the tab stop to slot 0, and tabbing back put the player at the top of the bank. Reading the
    // DOM keeps this the single owner of `focusSlot` rather than adding a cross-module setter.
    const hadFocus = paneHasFocus();
    const focusedSlot = hadFocus
      ? slotOf(document.activeElement)
      : slotOf(el.querySelector<HTMLElement>(`[${SLOT_ATTR}][tabindex="0"]`));
    if (focusedSlot !== null) focusSlot = focusedSlot;
    if (!visibleSlots.includes(focusSlot)) focusSlot = visibleSlots[0] ?? -1;
    for (const [slot, cell] of slotCells) cell.tabIndex = slot === focusSlot ? 0 : -1;

    el.replaceChildren(...children);
    // replaceChildren detaches the focused node, which resets document.activeElement to <body>.
    // Every repaint rebuilds the whole tree (an icon landing mid-drag included), so without this
    // a keyboard user's focus is thrown out of the pane on every single icon arrival.
    if (hadFocus) slotCells.get(focusSlot)?.focus();

    void deps.icons.prime(objsDrawn);
  }

  /** Coalesces a burst of icon arrivals (icons.ts fires onChange once per icon, and a freshly
   *  opened bank can have dozens land within the same second) onto a single microtask, so N
   *  icons landing back to back produce one rebuild instead of N - the same window in which
   *  Task 9's drag would otherwise see its nodes swapped out from under it, N times over. */
  function scheduleRepaint(): void {
    if (repaintScheduled) return;
    repaintScheduled = true;
    queueMicrotask(() => {
      repaintScheduled = false;
      if (lastState) build(lastState);
    });
  }

  const unsubscribeIcons = deps.icons.onChange(() => {
    if (!lastState) return;
    scheduleRepaint();
  });

  return {
    el,
    render(state: BankState): void {
      lastState = state;
      build(state);
    },
    slotOf,
    visible: () => [...visibleSlots],
    dispose(): void {
      if (disposed) return;
      disposed = true;
      unsubscribeIcons();
    }
  };
}
