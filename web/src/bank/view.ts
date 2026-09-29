// web/src/bank/view.ts -- the bank window. This is the composition point: the store, the icon
// cache, the item pane, its input layer, the tab bar, the context menu and the parity strip all
// meet here and nowhere else.
//
// Teardown is the thing to read this file for. The window owns five releasable things (the store
// subscription, the running store, the grid's icon-cache listener, the tab bar's icon-cache
// listener and the grid input layer) and `destroy()` releases all five. IconCache is a
// cross-window singleton, so a listener left behind survives the window that made it.
import { badge, h } from '../ui/el';
import { createBottomBar } from './bottomBar';
import { createBankMenu, type BankMenuRegistry } from './contextMenu';
import { SLOT_ATTR, createBankGrid } from './grid';
import { attachGridInput } from './gridInput';
import { TAB_MENU_CONTEXT, itemMenuRows, tabMenuRows } from './menus';
import { createBankTabs } from './tabsBar';
import type { IconCache } from './icons';
import type { BankState, BankStore } from './store';
import { MAX_TABS, type BankOp, type MenuItemContext, type ObjInfo, type Quantity, type RearrangeMode } from './types';

export interface BankWindowDeps {
  store: BankStore;
  icons: IconCache;
  info(obj: number): ObjInfo | null;
  registry: BankMenuRegistry;
  notify(message: string, kind?: 'info' | 'error'): void;
  /** The window closed itself (the x, or Escape); the plugin closes its panel. */
  onClose(): void;
  /** Per-window persistence for the parity controls. Defaults to localStorage. */
  storage?: { get(key: string): string | null; set(key: string, value: string): void };
}

export interface BankWindow {
  el: HTMLElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
  destroy(): void;
}

/** The mock's own title (map-design 3.6), which drops the leading article the SP8b window had.
 *  Ruling C6: where the mock and anything else disagree on a literal, the mock ships. */
export const BANK_TITLE = 'Bank of Gielinor';

const MODE_KEY = 'cs.bank.mode';
const QTY_KEY = 'cs.bank.qty';
const NO_ROOM = 'The bank already has nine tabs.';

type ParityStorage = NonNullable<BankWindowDeps['storage']>;

/** localStorage throws outright in a private window with site data blocked, so every access is
 *  wrapped and the controls simply fall back to their defaults there. */
function localStore(): ParityStorage {
  return {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* not persisted */ } }
  };
}

function readQuantity(raw: string | null): Quantity {
  if (raw === '5') return 5;
  if (raw === 'all') return 'all';
  return 1;
}

export function createBankWindow(host: HTMLElement, deps: BankWindowDeps): BankWindow {
  const storage = deps.storage ?? localStore();

  let mode: RearrangeMode = 'swap';
  let quantity: Quantity = 1;
  let searchText = '';
  let selectedTab = 0;
  let opened = false;
  let closing = false;
  let destroyed = false;
  let unsubscribe: (() => void) | null = null;
  let opener: HTMLElement | null = null;
  /** The last state rendered. Every lookup that answers a question about the bank (the menus,
   *  `nameOf`, a tab drop) reads this rather than calling `store.state()`, so a mid-gesture
   *  answer matches the layout actually on screen. */
  let lastState: BankState = deps.store.state();

  const submit = (op: BankOp): void => { deps.store.submit(op); };

  const capacityEl = h('span', { id: 'bank-capacity', class: 'window-sub bank-capacity' });
  /** The live mark is the Badge component with a dot (map-design 3.6), not a bank-only pill. The
   *  `bank-live` class and the `bank-live` id both survive: styles/bank.test.ts enumerates the
   *  class and `bank-ui.pw` polls the id, which is the only observable difference between the
   *  SSE path and the poll behind it. */
  const liveEl = badge('live', 'ok');
  const liveLabel = liveEl.firstChild as Text;
  liveEl.id = 'bank-live';
  liveEl.classList.add('bank-live');
  liveEl.prepend(h('span', { class: 'badge-dot', 'aria-hidden': 'true' }));
  const errorEl = h('div', { id: 'bank-error', class: 'bank-error', role: 'alert', hidden: true });
  const statusEl = h('div', { id: 'bank-status', class: 'bank-status', role: 'status', 'aria-live': 'polite' });
  const closeButton = h('button',
    { type: 'button', id: 'bank-close', class: 'btn btn-icon window-close', 'aria-label': 'Close the bank', title: 'Close', onclick: () => close() },
    '×'
  );

  function announce(message: string): void {
    statusEl.textContent = message;
  }

  const menu = createBankMenu({ host });

  const bar = createBottomBar({
    mode: () => mode,
    setMode: next => { mode = next; storage.set(MODE_KEY, next); bar.render(); },
    quantity: () => quantity,
    setQuantity: next => { quantity = next; storage.set(QTY_KEY, String(next)); bar.render(); },
    search: () => searchText,
    // Only the pane repaints: rebuilding the strip here would take the caret out of the box the
    // player is still typing in.
    setSearch: next => { searchText = next; grid.render(lastState); }
  });

  function openItemMenu(ctx: MenuItemContext, at: { x: number; y: number }): void {
    menu.open(itemMenuRows(lastState, ctx, deps.registry, submit, announce), ctx, at);
  }

  const grid = createBankGrid({
    icons: deps.icons,
    info: deps.info,
    selectedTab: () => selectedTab,
    search: () => searchText,
    onMenu: openItemMenu
  });

  const tabs = createBankTabs({
    icons: deps.icons,
    info: deps.info,
    selected: () => selectedTab,
    onSelect: tab => { selectedTab = tab; render(lastState); },
    onTabMenu: (tab, at) => { menu.open(tabMenuRows(tab, submit), TAB_MENU_CONTEXT, at); }
  });

  /**
   * BINDING (Task 9's review): an occupied slot whose ObjInfo has not streamed yet falls back to
   * its obj id, exactly as grid.ts labels it. The input layer uses this as its occupancy oracle,
   * so returning null for a real item would make that item silently undraggable until the model
   * arrived.
   */
  function nameOf(slot: number): string | null {
    const item = lastState.items[slot] ?? null;
    if (!item) return null;
    return deps.info(item.obj)?.name ?? String(item.obj);
  }

  function contextFor(slot: number): MenuItemContext | null {
    const item = lastState.items[slot] ?? null;
    if (!item) return null;
    return { slot, obj: item.obj, count: item.count, info: deps.info(item.obj) };
  }

  const input = attachGridInput({
    root: grid.el,
    slotOf: grid.slotOf,
    visible: grid.visible,
    mode: () => mode,
    onMove: (from, to) => {
      const outcome = deps.store.submit(mode === 'insert' ? { op: 'insert', from, to } : { op: 'swap', a: from, b: to });
      if (outcome.kind === 'refused') return { moved: false, message: outcome.message };
      if (outcome.kind === 'dropped') return { moved: false, message: null };
      // The store's clamp can move BOTH endpoints, so the landing slot comes off the op it
      // actually queued rather than off the `to` this callback was handed.
      const op = outcome.op;
      return { moved: true, to: op.op === 'insert' ? op.to : op.op === 'swap' ? op.b : to };
    },
    onDropOnTab: (slot, tab) => {
      if (tab !== 'new') { submit({ op: 'moveToTab', slot, tab }); return; }
      // The plus tab is not rendered at nine tabs, so this is belt and braces against a drop
      // resolving against a layout that shrank under the pointer.
      if (lastState.tabs.length >= MAX_TABS) { deps.notify(NO_ROOM); return; }
      submit({ op: 'moveToTab', slot, tab: lastState.tabs.length + 1 });
    },
    onMenuKey: slot => {
      const ctx = contextFor(slot);
      if (!ctx) return;
      const rect = grid.el.querySelector<HTMLElement>(`[${SLOT_ATTR}="${slot}"]`)?.getBoundingClientRect();
      openItemMenu(ctx, { x: rect?.left ?? 0, y: rect?.top ?? 0 });
    },
    hitTest: (x, y) => document.elementFromPoint(x, y),
    tabAt: tabs.tabAt,
    nameOf,
    announce
  });

  // The shared window header (Task 7), and the family's whole: a direct child of the window so
  // `.window-centred > .window-head` lands the mock's 8px 12px padding on it, with the only
  // bank-owned classes on the three spans inside. The row also wore a `bank-head`, which
  // layout/bank.css never styled and styles/bank.test.ts's class contract could not see, so it is
  // gone and view.test.ts pins this class list against a fourth name arriving the same way.
  const titleBar = h('div', { class: 'window-head' },
    h('span', { class: 'window-title bank-title' }, BANK_TITLE),
    capacityEl,
    liveEl,
    closeButton
  );

  const el = h('div',
    { id: 'bank-window', class: 'window window-warm window-centred bank-window', role: 'dialog', 'aria-label': BANK_TITLE, tabindex: '-1' },
    titleBar,
    errorEl,
    h('div', { class: 'bank-body' }, tabs.el, grid.el),
    statusEl,
    bar.el
  );

  // Escape closes the window, but only when nothing nearer has already claimed it: the input
  // layer preventDefaults Escape while a keyboard-held item is in the air, and the context menu
  // is hosted outside this element so its own Escape never reaches here at all.
  el.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    close();
  });

  function render(state: BankState): void {
    lastState = state;
    // A tab can vanish under the selection (the engine drops an emptied tab on a moveToTab), and
    // an out-of-range tab renders as a permanently empty pane. Fall back to All items.
    if (selectedTab > state.tabs.length) selectedTab = 0;
    capacityEl.textContent = `${state.used} / ${state.capacity}`;
    liveLabel.data = state.live ? 'live' : 'polling';
    liveEl.classList.toggle('badge-ok', state.live);
    errorEl.textContent = state.error ?? '';
    errorEl.hidden = state.error === null;
    // No focus handling here, deliberately. A module that calls replaceChildren on nodes it owns
    // restores focus within its own subtree: grid.ts does it for the pane and tabsBar.ts does it
    // for the strip, restoring the ROVING tab rather than the node that was focused, which is
    // what makes an arrow key land on the newly selected tab (the strip calls onSelect without
    // focusing first, so at this point the focused node is still the old tab). A restore here as
    // well was measurably unfalsifiable: deleting it failed no test, including the ones written
    // specifically to discriminate. It is gone rather than left as a second owner of focus.
    tabs.render(state);
    grid.render(state);
  }

  function focusIntoWindow(): void {
    const roving = el.querySelector<HTMLElement>(`[${SLOT_ATTR}][tabindex="0"]`) ?? el.querySelector<HTMLElement>(`[${SLOT_ATTR}]`);
    // An empty bank has no cells at all, so the close button is the fallback: focus must land
    // inside the dialog either way or the player is left tabbing through the page behind it.
    (roving ?? closeButton).focus();
  }

  function open(): void {
    if (destroyed || opened) return;
    opened = true;
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    host.appendChild(el);
    // The store is a frame-lifetime singleton (plan ruling R10): it was started when the account
    // resolved and it keeps running with this window shut, so the bank producer records a change
    // the player was not watching. The window subscribes and renders what is already there.
    unsubscribe = deps.store.subscribe(render);
    // The parity controls are re-read here rather than at construction so a second window in the
    // same page picks up what the first one left behind.
    mode = storage.get(MODE_KEY) === 'insert' ? 'insert' : 'swap';
    quantity = readQuantity(storage.get(QTY_KEY));
    bar.render();
    render(deps.store.state());
    focusIntoWindow();
  }

  function releaseSession(): void {
    opened = false;
    unsubscribe?.();
    unsubscribe = null;
    menu.close();
    // Not detach(): the window reopens and the pane must stay drivable. But the gesture itself
    // has to go. gridInput binds pointermove/pointerup on the DOCUMENT at press time, so a close
    // with a pointer still down otherwise leaves those bound, the pane wearing is-dragging, and
    // a pointerup delivered afterwards still reporting a move for a window that is gone.
    input.cancel();
  }

  function close(): void {
    // Re-entry guard: the x and Escape can both arrive for one gesture, and deps.onClose() is
    // free to call back in here while it tears its own panel down.
    if (!opened || closing) return;
    closing = true;
    try {
      releaseSession();
      el.remove();
      const back = opener;
      opener = null;
      if (back?.isConnected) back.focus();
      deps.onClose();
    } finally {
      closing = false;
    }
  }

  return {
    el,
    open,
    close,
    isOpen: () => opened,
    /**
     * Releases everything this window owns, whether or not it is open, and leaves the instance
     * inert: open() is a no-op afterwards. The store is NOT among them: it outlives every window
     * (ruling R10) and frame/singletons.ts stops it on sign-out.
     */
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      const wasOpen = opened;
      opened = false;
      unsubscribe?.();
      unsubscribe = null;
      menu.close();
      // detach() before dispose(): the input layer's MutationObserver watches the pane, and the
      // grid's own disposal is what stops anything else rebuilding it.
      input.detach();
      grid.dispose();
      tabs.dispose();
      if (wasOpen) el.remove();
      opener = null;
    }
  };
}
