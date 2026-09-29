// web/src/bank/contextMenu.ts -- OSRS-style right-click menu over the bank grid.
import { h } from '../ui/el';
import type { MenuEntry, MenuItemContext } from './types';

/** Registers, or replaces by id, kept in registration order. */
export interface BankMenuRegistry {
  register(entry: MenuEntry): void;
  entries(): MenuEntry[];
}

export function createMenuRegistry(): BankMenuRegistry {
  const list: MenuEntry[] = [];
  return {
    register(entry: MenuEntry): void {
      const i = list.findIndex(e => e.id === entry.id);
      if (i >= 0) list[i] = entry;
      else list.push(entry);
    },
    entries(): MenuEntry[] {
      return list.slice();
    }
  };
}

export const CONTRACTS_HINT = 'Contracts coming soon';

/** The two entries SP9 replaces. Registered by the bank plugin at start-up. The bank module
 *  never imports anything from Contracts; SP9 takes these over by registering over the same ids. */
export function contractsStubs(): MenuEntry[] {
  return [
    { id: 'sell', label: 'Sell...', enabled: false, hint: CONTRACTS_HINT, run: () => {} },
    { id: 'buy', label: 'Buy more...', enabled: false, hint: CONTRACTS_HINT, run: () => {} }
  ];
}

export interface BankMenu {
  el: HTMLElement;
  /** `rows` is already composed: registry entries, then the caller's own. Cancel is added here. */
  open(rows: MenuEntry[], ctx: MenuItemContext, at: { x: number; y: number }): void;
  close(): void;
  isOpen(): boolean;
}

interface ResolvedRow { id: string; label: string; enabled: boolean; hint?: string; run(ctx: MenuItemContext): void }

function resolveRow(entry: MenuEntry, ctx: MenuItemContext): ResolvedRow {
  return {
    id: entry.id,
    label: typeof entry.label === 'function' ? entry.label(ctx) : entry.label,
    enabled: typeof entry.enabled === 'function' ? entry.enabled(ctx) : entry.enabled,
    hint: entry.hint,
    run: entry.run
  };
}

const CANCEL: MenuEntry = { id: 'cancel', label: 'Cancel', enabled: true, run: () => {} };

/**
 * Owns one detached `#bank-menu[role=menu]` element, appended to `host` on `open` and removed
 * on `close`. `open` always rebuilds its rows (the caller's rows plus a trailing Cancel), so the
 * same element is reused rather than a fresh one created per open.
 */
export function createBankMenu(deps: { host: HTMLElement }): BankMenu {
  const { host } = deps;
  const el = h('div', { id: 'bank-menu', role: 'menu', class: 'bank-menu' });
  el.style.position = 'fixed';

  let open_ = false;
  let rowEls: HTMLElement[] = [];
  let returnFocusTo: HTMLElement | null = null;
  let outsidePointerDown: ((ev: Event) => void) | null = null;

  function isOpen(): boolean {
    return open_;
  }

  function focusable(): HTMLElement[] {
    return rowEls.filter(r => r.getAttribute('aria-disabled') !== 'true');
  }

  /** Roving tab stop: only `target` sits in the Tab order, so Tab leaves the menu instead of
   *  cycling through every row (the standard menu pattern; mirrors `applyTabListA11y`). */
  function focusRow(target: HTMLElement | undefined): void {
    if (!target) return;
    for (const r of focusable()) r.tabIndex = r === target ? 0 : -1;
    target.focus();
  }

  function close(): void {
    if (!open_) return;
    open_ = false;
    if (outsidePointerDown) {
      document.removeEventListener('pointerdown', outsidePointerDown);
      outsidePointerDown = null;
    }
    el.remove();
    el.replaceChildren();
    rowEls = [];
    const toFocus = returnFocusTo;
    returnFocusTo = null;
    toFocus?.focus();
  }

  function buildRow(row: ResolvedRow, ctx: MenuItemContext): HTMLElement {
    const disabled = !row.enabled;
    const activate = (): void => {
      if (disabled) return;
      close();
      row.run(ctx);
    };
    return h('button', {
      type: 'button',
      role: 'menuitem',
      class: disabled ? 'bank-menu-row disabled' : 'bank-menu-row',
      'data-bank-menu-entry': row.id,
      'aria-disabled': disabled ? 'true' : null,
      // Every enabled row starts out of the Tab order; `focusRow` promotes exactly one of them
      // (the one actually focused) to tabindex 0 once all rows exist.
      tabindex: '-1',
      onclick: activate,
      onkeydown: (ev: Event) => {
        const key = (ev as KeyboardEvent).key;
        if (key === 'Enter' || key === ' ') { ev.preventDefault(); activate(); }
      }
    },
      h('span', { class: 'bank-menu-label' }, row.label),
      row.hint ? h('span', { class: 'bank-menu-hint' }, row.hint) : null
    );
  }

  function open(rows: MenuEntry[], ctx: MenuItemContext, at: { x: number; y: number }): void {
    close();
    returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const resolved = [...rows, CANCEL].map(entry => resolveRow(entry, ctx));
    rowEls = resolved.map(row => buildRow(row, ctx));
    el.replaceChildren(...rowEls);
    // Parked at the viewport origin to be MEASURED, not to be seen: nothing paints between here
    // and the assignment at the bottom of this function, which runs in the same task. The menu
    // declares no width, so as a shrink-to-fit fixed box its width is capped by the space left
    // between `left` and the viewport's right edge. Measuring it where the pointer actually is,
    // near an edge, therefore reports a SQUEEZED width; the clamp below then places it by that
    // too-small number, the menu re-lays-out at its natural width, and it lands back off the end
    // of the host (8 px off, in a 760 px viewport, which is how this was found). At the origin
    // the whole viewport is available, so the width measured is the width it will take.
    el.style.left = '0px';
    el.style.top = '0px';

    host.appendChild(el);
    open_ = true;

    // `el.style.position = 'fixed'`, so `left`/`top` are viewport coordinates, and so is
    // `at` (it comes straight from the triggering pointer event). Clamp in that same viewport
    // space: the menu's edge must stay within [hostRect.left, hostRect.left + hostRect.width -
    // menuRect.width], NOT [0, hostRect.width] -- the host is not always anchored at the
    // viewport origin (e.g. #bank-host inside the flex #canvas-wrap starts well right of x=0,
    // beside the side strip). jsdom never lays out elements, so getBoundingClientRect() is
    // all-zero there; skip the clamp in that case rather than clamp into a bogus zero-size box
    // (see contextMenu.test.ts "positions itself at the pointer" for the zero-rect passthrough,
    // and "clamps into the host's own rect..." for the nonzero-offset cases with stubbed rects).
    const hostRect = host.getBoundingClientRect();
    const menuRect = el.getBoundingClientRect();
    let left = at.x;
    let top = at.y;
    if (hostRect.width > 0 && hostRect.height > 0 && menuRect.width > 0 && menuRect.height > 0) {
      const minX = hostRect.left;
      const minY = hostRect.top;
      const maxX = Math.max(minX, hostRect.left + hostRect.width - menuRect.width);
      const maxY = Math.max(minY, hostRect.top + hostRect.height - menuRect.height);
      left = Math.min(Math.max(at.x, minX), maxX);
      top = Math.min(Math.max(at.y, minY), maxY);
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;

    outsidePointerDown = (ev: Event) => {
      if (ev.target instanceof Node && el.contains(ev.target)) return;
      close();
    };
    document.addEventListener('pointerdown', outsidePointerDown);

    focusRow(focusable()[0]);
  }

  el.addEventListener('keydown', ev => {
    if (!open_) return;
    const list = focusable();
    if (list.length === 0) return;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const i = active ? list.indexOf(active) : -1;

    if (ev.key === 'ArrowDown') { ev.preventDefault(); focusRow(list[i < 0 ? 0 : (i + 1) % list.length]); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); focusRow(list[i < 0 ? list.length - 1 : (i - 1 + list.length) % list.length]); }
    else if (ev.key === 'Home') { ev.preventDefault(); focusRow(list[0]); }
    else if (ev.key === 'End') { ev.preventDefault(); focusRow(list[list.length - 1]); }
    else if (ev.key === 'Escape') { ev.preventDefault(); close(); }
  });

  return { el, open, close, isOpen };
}
