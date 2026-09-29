// web/src/bank/tabsBar.ts -- the column of tab buttons down the side of the bank window.
//
// Owner decision 4: a tab's icon is always the first item in that tab, decided once by
// layout.ts's tabIconObj. There is no other icon-picking mechanism and no user choice about it.
import { h } from '../ui/el';
import type { BankState } from './store';
import type { IconCache } from './icons';
import { tabIconObj, tabItemCount } from './layout';
import { MAX_TABS, type ObjInfo } from './types';

export interface BankTabsDeps {
  icons: IconCache;
  info(obj: number): ObjInfo | null;
  /** 0 is "All items". */
  selected(): number;
  onSelect(tab: number): void;
  /** Right-click (or the menu key) on a tab, All items (0) included; the view builds the sort
   *  entries. Tab 0 is a real sort target: `{ op: 'sort', tab: 0 }` sorts the main area, which is
   *  the only way to sort the items that are in no tab at all. The plus tab is an action, not a
   *  view, and never opens a menu. */
  onTabMenu(tab: number, at: { x: number; y: number }): void;
}

export interface BankTabs {
  el: HTMLElement;
  render(state: BankState): void;
  /** Which tab a node belongs to, 'new' for the plus tab, or null. Fed to gridInput.tabAt. */
  tabAt(node: Element | null): number | 'new' | null;
  /** Releases the icons.onChange subscription. Safe to call more than once. The frozen interface
   *  originally had no disposal path; a review found the subscription leaking across every
   *  window open/close cycle (IconCache is a cross-window singleton), so this was added. */
  dispose(): void;
}

function tabAt(node: Element | null): number | 'new' | null {
  const found = node?.closest<HTMLElement>('[data-bank-tab], [data-bank-tab-new]') ?? null;
  if (!found) return null;
  if (found.hasAttribute('data-bank-tab-new')) return 'new';
  const raw = found.getAttribute('data-bank-tab');
  return raw === null ? null : Number(raw);
}

export function createBankTabs(deps: BankTabsDeps): BankTabs {
  const el = h('div', { class: 'bank-tabs', role: 'tablist', 'aria-orientation': 'vertical' });
  let lastState: BankState | null = null;

  function tabLabel(state: BankState, tab: number): string {
    if (tab === 0) return 'All items';
    const count = tabItemCount(state.items, state.tabs, tab, state.used);
    return `Tab ${tab}, ${count} ${count === 1 ? 'item' : 'items'}`;
  }

  function buildFace(state: BankState, tab: number): Node {
    if (tab === 0) return h('span', { class: 'bank-tab-glyph', 'aria-hidden': 'true' }, '∞');
    const obj = tabIconObj(state.items, state.tabs, tab, state.used);
    if (obj === null) return h('span', { class: 'bank-tab-glyph' }, String(tab));
    const src = deps.icons.peek(obj);
    if (src) return h('img', { src, alt: '' });
    // The icon cache's own rule: null means "not rasterised yet", not "no icon"; show initials
    // until deps.icons.onChange repaints us with the real thing.
    const name = deps.info(obj)?.name ?? '';
    return h('span', { class: 'bank-tab-initials' }, name.slice(0, 2));
  }

  function buildTab(state: BankState, tab: number, selected: number): HTMLElement {
    const label = tabLabel(state, tab);
    return h('button', {
      type: 'button',
      role: 'tab',
      class: 'bank-tab',
      'data-bank-tab': String(tab),
      'aria-selected': tab === selected ? 'true' : 'false',
      'aria-label': label,
      title: label,
      tabindex: tab === selected ? '0' : '-1',
      onclick: () => deps.onSelect(tab)
    }, buildFace(state, tab));
  }

  function buildPlusTab(): HTMLElement {
    return h('button', {
      type: 'button',
      role: 'tab',
      class: 'bank-tab bank-tab-new',
      'data-bank-tab-new': true,
      'aria-label': 'New tab',
      title: 'New tab',
      tabindex: '-1'
    }, '+');
  }

  function primeIcons(state: BankState): void {
    const objs: number[] = [];
    for (let tab = 1; tab <= state.tabs.length; tab++) {
      const obj = tabIconObj(state.items, state.tabs, tab, state.used);
      if (obj !== null) objs.push(obj);
    }
    void deps.icons.prime(objs);
  }

  /** True while `el` (or a descendant) holds document focus. Read before `replaceChildren` wipes
   *  the old buttons out from under it. Mirrors grid.ts's `paneHasFocus`. */
  function stripHasFocus(): boolean {
    return document.activeElement !== null && el.contains(document.activeElement);
  }

  function render(state: BankState): void {
    lastState = state;
    const selected = deps.selected();
    const nodes: HTMLElement[] = [buildTab(state, 0, selected)];
    for (let tab = 1; tab <= state.tabs.length; tab++) nodes.push(buildTab(state, tab, selected));
    if (state.tabs.length < MAX_TABS) nodes.push(buildPlusTab());

    // Roving tabindex: something real must stay reachable by Tab even if `selected()` names a
    // tab that no longer exists (a tab drop right after one closes, say).
    const real = nodes.filter(node => node.hasAttribute('data-bank-tab'));
    if (real.length > 0 && !real.some(node => node.tabIndex === 0)) real[0].tabIndex = 0;

    // A module that calls replaceChildren on nodes it owns restores focus within its own
    // subtree; the composing window handles only the cross-module case. Without this, an icon
    // landing while the strip has focus (this module re-renders itself synchronously from
    // icons.onChange) detaches the focused button and drops document.activeElement to <body>,
    // throwing a keyboard player clean out of the dialog. Read before the rebuild, restored
    // after, and only when the focus was ours to begin with, so it can never steal focus from
    // the pane or from anything else in the window.
    const hadFocus = stripHasFocus();
    el.replaceChildren(...nodes);
    if (hadFocus) {
      const roving = real.find(node => node.tabIndex === 0) ?? real[0];
      roving?.focus();
    }
    primeIcons(state);
  }

  el.addEventListener('contextmenu', event => {
    const mouse = event as MouseEvent;
    const target = (mouse.target as Element | null)?.closest<HTMLElement>('[data-bank-tab], [data-bank-tab-new]');
    if (!target) return;
    event.preventDefault();
    const tab = tabAt(target);
    if (typeof tab === 'number' && tab >= 0 && tab <= MAX_TABS) deps.onTabMenu(tab, { x: mouse.clientX, y: mouse.clientY });
  });

  el.addEventListener('keydown', event => {
    if (!lastState) return;
    const key = event.key;
    const targetEl = (event.target as Element | null)?.closest<HTMLElement>('[data-bank-tab], [data-bank-tab-new]') ?? null;
    const current = tabAt(targetEl);

    if (key === 'ContextMenu' || (key === 'F10' && event.shiftKey)) {
      if (targetEl && typeof current === 'number' && current >= 0 && current <= MAX_TABS) {
        event.preventDefault();
        const rect = targetEl.getBoundingClientRect();
        deps.onTabMenu(current, { x: rect.left, y: rect.top });
      }
      return;
    }

    // Roving among the real tabs only: the plus tab is an action, not a view, so arrow/Home/End
    // never land on it.
    if (typeof current !== 'number') return;
    const list = [0, ...lastState.tabs.map((_, i) => i + 1)];
    const i = list.indexOf(current);
    if (i < 0) return;
    let next = -1;
    if (key === 'ArrowRight') next = (i + 1) % list.length;
    else if (key === 'ArrowLeft') next = (i - 1 + list.length) % list.length;
    else if (key === 'Home') next = 0;
    else if (key === 'End') next = list.length - 1;
    if (next < 0) return;
    event.preventDefault();
    deps.onSelect(list[next]);
  });

  const unsubscribe = deps.icons.onChange(() => { if (lastState) render(lastState); });
  let disposed = false;

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    unsubscribe();
  }

  return { el, render, tabAt, dispose };
}
