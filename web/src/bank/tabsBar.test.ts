// web/src/bank/tabsBar.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createBankTabs } from './tabsBar';
import type { BankState } from './store';
import type { IconCache } from './icons';
import type { ObjInfo } from './types';

const INFO: Record<number, ObjInfo> = {
  995: { name: 'Coins', examine: 'Lovely money!', cost: 1, stackable: true, noted: false },
  1038: { name: 'Red partyhat', examine: 'A nice hat.', cost: 1, stackable: false, noted: false }
};

function icons(map: Record<number, string> = {}): IconCache {
  return { peek: obj => map[obj] ?? null, load: async obj => map[obj] ?? null, prime: async () => {}, onChange: () => () => {} };
}

function state(tabs: number[]): BankState {
  const items = new Array(240).fill(null);
  items[0] = { slot: 0, obj: 995, count: 500 };
  items[1] = { slot: 1, obj: 1038, count: 1 };
  items[2] = { slot: 2, obj: 1038, count: 1 };
  return { version: 1, capacity: 240, tabs, items, used: 3, loading: false, live: true, pending: 0, error: null };
}

function mount(over: Partial<Parameters<typeof createBankTabs>[0]> = {}, iconMap: Record<number, string> = {}) {
  const onSelect = vi.fn();
  const onTabMenu = vi.fn();
  const bar = createBankTabs({ icons: icons(iconMap), info: obj => INFO[obj] ?? null, selected: () => 0, onSelect, onTabMenu, ...over });
  document.body.appendChild(bar.el);
  return { bar, onSelect, onTabMenu };
}

const tabs = (root: HTMLElement): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>('[data-bank-tab], [data-bank-tab-new]'));

describe('the tab bar', () => {
  it('is a tab list with All items, one tab per size, and a plus tab', () => {
    const { bar } = mount();
    bar.render(state([2]));
    expect(bar.el.getAttribute('role')).toBe('tablist');
    expect(tabs(bar.el).map(t => t.dataset.bankTab ?? 'new')).toEqual(['0', '1', 'new']);
  });

  it('hides the plus tab once nine tabs exist', () => {
    const { bar } = mount();
    bar.render(state([1, 1, 1, 1, 1, 1, 1, 1, 1]));
    expect(bar.el.querySelector('[data-bank-tab-new]')).toBeNull();
    expect(bar.el.querySelectorAll('[data-bank-tab]')).toHaveLength(10);
  });

  it('uses the first item of the tab as its icon (owner decision 4)', () => {
    const { bar } = mount({}, { 995: 'data:image/png;base64,COIN' });
    bar.render(state([2]));
    const tab = bar.el.querySelector<HTMLElement>('[data-bank-tab="1"]')!;
    expect(tab.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,COIN');
  });

  it('falls back to the item initials while the icon is still being drawn', () => {
    const { bar } = mount();
    bar.render(state([2]));
    const tab = bar.el.querySelector<HTMLElement>('[data-bank-tab="1"]')!;
    expect(tab.querySelector('img')).toBeNull();
    expect(tab.textContent).toContain('Co');
  });

  it('names each tab and its item count for a screen reader and a tooltip', () => {
    const { bar } = mount();
    bar.render(state([2]));
    expect(bar.el.querySelector('[data-bank-tab="0"]')?.getAttribute('aria-label')).toBe('All items');
    expect(bar.el.querySelector('[data-bank-tab="1"]')?.getAttribute('aria-label')).toBe('Tab 1, 2 items');
    expect(bar.el.querySelector('[data-bank-tab="1"]')?.getAttribute('title')).toBe('Tab 1, 2 items');
  });

  it('marks the selected tab and keeps exactly one in the tab order', () => {
    const { bar } = mount({ selected: () => 1 });
    bar.render(state([2]));
    const all = bar.el.querySelector<HTMLElement>('[data-bank-tab="0"]')!;
    const one = bar.el.querySelector<HTMLElement>('[data-bank-tab="1"]')!;
    expect(one.getAttribute('aria-selected')).toBe('true');
    expect(all.getAttribute('aria-selected')).toBe('false');
    expect(tabs(bar.el).filter(t => t.tabIndex === 0)).toHaveLength(1);
  });

  it('selects on click', () => {
    const { bar, onSelect } = mount();
    bar.render(state([2]));
    bar.el.querySelector<HTMLElement>('[data-bank-tab="1"]')!.click();
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('moves selection with the arrow keys, Home and End', () => {
    const { bar, onSelect } = mount({ selected: () => 0 });
    bar.render(state([1, 1]));
    const all = bar.el.querySelector<HTMLElement>('[data-bank-tab="0"]')!;
    all.focus();
    all.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith(1);
    all.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(onSelect).toHaveBeenLastCalledWith(2);
  });

  it('opens the tab menu on right-click and on the menu key, never for the plus tab', () => {
    const { bar, onTabMenu } = mount();
    bar.render(state([2]));
    const one = bar.el.querySelector<HTMLElement>('[data-bank-tab="1"]')!;
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 8, clientY: 9 });
    one.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onTabMenu).toHaveBeenCalledWith(1, { x: 8, y: 9 });

    onTabMenu.mockClear();
    bar.el.querySelector<HTMLElement>('[data-bank-tab-new]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(onTabMenu).not.toHaveBeenCalled();
  });

  // All items is a real sort target: it is the only way to reach the items that sit in no tab.
  it('opens the tab menu on All items too', () => {
    const { bar, onTabMenu } = mount();
    bar.render(state([2]));
    const all = bar.el.querySelector<HTMLElement>('[data-bank-tab="0"]')!;
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 3, clientY: 4 });
    all.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onTabMenu).toHaveBeenCalledWith(0, { x: 3, y: 4 });
  });
});

describe('tabAt', () => {
  it('resolves a nested node to its tab, the plus tab to new, and anything else to null', () => {
    const { bar } = mount({}, { 995: 'data:image/png;base64,COIN' });
    bar.render(state([2]));
    expect(bar.tabAt(bar.el.querySelector('[data-bank-tab="1"] img'))).toBe(1);
    expect(bar.tabAt(bar.el.querySelector('[data-bank-tab-new]'))).toBe('new');
    expect(bar.tabAt(bar.el.querySelector('[data-bank-tab="0"]'))).toBe(0);
    expect(bar.tabAt(document.body)).toBeNull();
  });
});

/** A real IconCache (icons()) has no way to fire onChange from the outside; this variant keeps
 *  the listener set so a test can trigger it and inspect whether the subscription is still live. */
function controllableIcons(map: Record<number, string> = {}): { cache: IconCache; fire(): void; listenerCount(): number } {
  const listeners = new Set<() => void>();
  const cache: IconCache = {
    peek: obj => map[obj] ?? null,
    load: async obj => map[obj] ?? null,
    prime: async () => {},
    onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); }
  };
  return { cache, fire: () => { for (const fn of [...listeners]) fn(); }, listenerCount: () => listeners.size };
}

// A module that calls replaceChildren on nodes it owns restores focus within its own subtree.
// This strip re-renders itself synchronously from icons.onChange, which the composing window
// never sees, so nothing above it could ever have covered this.
describe('focus across a rebuild', () => {
  it('keeps the player on the roving tab when an icon arrival repaints the strip', () => {
    const { cache, fire } = controllableIcons();
    const bar = createBankTabs({ icons: cache, info: obj => INFO[obj] ?? null, selected: () => 1, onSelect: vi.fn(), onTabMenu: vi.fn() });
    document.body.appendChild(bar.el);
    bar.render(state([2]));
    const before = bar.el.querySelector<HTMLElement>('[data-bank-tab="1"]')!;
    before.focus();
    expect(document.activeElement).toBe(before);

    fire();
    // A fresh node, because replaceChildren rebuilt the strip, and the player is still on it.
    const after = bar.el.querySelector<HTMLElement>('[data-bank-tab="1"]')!;
    expect(after).not.toBe(before);
    expect(document.activeElement).toBe(after);
    expect(document.activeElement).not.toBe(document.body);
  });

  // The fact that decides whether the composing window needs a restore of its own. A tablist
  // with automatic activation moves focus WITH the selection, and this strip's keydown calls
  // deps.onSelect without focusing anything first, so at the moment render() runs the focused
  // node is still the OLD tab while the roving tabindex has already moved to the new one.
  // Restoring the roving tab rather than the previously focused node is what makes those agree.
  it('follows the selection, not the node that happened to be focused', () => {
    const { cache } = controllableIcons();
    let selected = 0;
    const bar = createBankTabs({ icons: cache, info: obj => INFO[obj] ?? null, selected: () => selected, onSelect: vi.fn(), onTabMenu: vi.fn() });
    document.body.appendChild(bar.el);
    bar.render(state([2]));
    bar.el.querySelector<HTMLElement>('[data-bank-tab="0"]')!.focus();

    // Exactly the state a keyboard ArrowRight leaves behind: the selection has moved, focus has not.
    selected = 1;
    bar.render(state([2]));
    const now = bar.el.querySelector<HTMLElement>('[data-bank-tab="1"]')!;
    expect(now.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(now);
  });

  it('does not steal focus that was never in the strip', () => {
    const { cache, fire } = controllableIcons();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    const bar = createBankTabs({ icons: cache, info: obj => INFO[obj] ?? null, selected: () => 0, onSelect: vi.fn(), onTabMenu: vi.fn() });
    document.body.appendChild(bar.el);
    bar.render(state([2]));
    outside.focus();
    fire();
    expect(document.activeElement).toBe(outside);
  });
});

describe('dispose', () => {
  it('releases the icons.onChange subscription so a later icon change does not repaint', () => {
    const { cache, fire, listenerCount } = controllableIcons();
    const bar = createBankTabs({ icons: cache, info: obj => INFO[obj] ?? null, selected: () => 0, onSelect: vi.fn(), onTabMenu: vi.fn() });
    document.body.appendChild(bar.el);
    bar.render(state([2]));
    expect(listenerCount()).toBe(1);

    // Still subscribed: firing onChange repaints, so the tab-1 button is a fresh node.
    const beforeDispose = bar.el.querySelector('[data-bank-tab="1"]');
    fire();
    expect(bar.el.querySelector('[data-bank-tab="1"]')).not.toBe(beforeDispose);

    bar.dispose();
    expect(listenerCount()).toBe(0);

    // Disposed: firing onChange must not repaint (and must not throw against the detached bar).
    const afterDispose = bar.el.querySelector('[data-bank-tab="1"]');
    fire();
    expect(bar.el.querySelector('[data-bank-tab="1"]')).toBe(afterDispose);
  });

  it('is safe to call twice', () => {
    const { cache } = controllableIcons();
    const bar = createBankTabs({ icons: cache, info: obj => INFO[obj] ?? null, selected: () => 0, onSelect: vi.fn(), onTabMenu: vi.fn() });
    bar.render(state([2]));
    expect(() => {
      bar.dispose();
      bar.dispose();
    }).not.toThrow();
  });
});
