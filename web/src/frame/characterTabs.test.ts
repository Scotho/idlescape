import { describe, expect, test, vi } from 'vitest';
import {
  COMING_SOON, GUEST_LOCK_TOOLTIP, MORE_LABEL, NEW_CHARACTER_LABEL, TAB_SLOTS,
  computeSlots, createCharacterTabs, onlineFor, slotHtml, type TabSlot, type TabsInput
} from './characterTabs';
import type { CharacterSummary } from '../types';

const c = (id: string, gameName: string, createdAt: number): CharacterSummary => ({ id, gameName, createdAt, lastLoginAt: null });
const input = (over: Partial<TabsInput> = {}): TabsInput => ({ characters: [], limit: 3, states: {}, onlineSince: {}, activeId: null, ...over });

describe('computeSlots', () => {
  test('always renders three character slots plus the Add more slot', () => {
    expect(computeSlots(input())).toHaveLength(TAB_SLOTS + 1);
    expect(computeSlots(input({ limit: 2 }))).toHaveLength(TAB_SLOTS + 1);
  });

  test('a guest with no character sees two open slots, a locked third and coming soon', () => {
    const slots = computeSlots(input({ limit: 2 }));
    expect(slots.map(s => s.kind)).toEqual(['empty', 'empty', 'locked', 'more']);
    expect(slots[0].label).toBe(NEW_CHARACTER_LABEL);
    expect(slots[2]).toMatchObject({ kind: 'locked', disabled: true, tooltip: GUEST_LOCK_TOOLTIP });
    expect(slots[3]).toMatchObject({ kind: 'more', label: MORE_LABEL, note: COMING_SOON, disabled: true });
  });

  test('a registered account with no character sees three open slots', () => {
    expect(computeSlots(input({ limit: 3 })).map(s => s.kind)).toEqual(['empty', 'empty', 'empty', 'more']);
  });

  test('only created characters get real tabs, in createdAt order, with live status', () => {
    const slots = computeSlots(input({
      limit: 3,
      characters: [c('b', 'beta', 20), c('a', 'alpha', 10)],
      states: { a: 'online', b: 'connecting' },
      activeId: 'a'
    }));
    expect(slots.slice(0, 2)).toEqual([
      { kind: 'character', index: 0, characterId: 'a', label: 'alpha', status: 'online', active: true, disabled: false, tooltip: 'alpha · online', clock: false, onlineSince: null },
      { kind: 'character', index: 1, characterId: 'b', label: 'beta', status: 'connecting', active: false, disabled: false, tooltip: 'beta · connecting', clock: false, onlineSince: null }
    ]);
    expect(slots[2].kind).toBe('empty');
  });

  test('a character with no session yet reads offline', () => {
    const slots = computeSlots(input({ characters: [c('a', 'alpha', 1)] }));
    expect(slots[0]).toMatchObject({ kind: 'character', status: 'offline' });
  });

  test('a guest at the limit has no empty slot, only the locked one', () => {
    const slots = computeSlots(input({ limit: 2, characters: [c('a', 'alpha', 1), c('b', 'beta', 2)] }));
    expect(slots.map(s => s.kind)).toEqual(['character', 'character', 'locked', 'more']);
  });
});

describe('createCharacterTabs', () => {
  function mount(over: Partial<TabsInput> = {}) {
    const root = document.createElement('nav');
    document.body.appendChild(root);
    const onSelect = vi.fn();
    const onNew = vi.fn();
    const tabs = createCharacterTabs(root, { onSelect, onNew, now: () => 0 });
    tabs.render(input(over));
    return { root, tabs, onSelect, onNew };
  }

  test('renders a tablist with one button per slot and the exact copy', () => {
    const { root } = mount({ limit: 2 });
    expect(root.getAttribute('role')).toBe('tablist');
    expect(root.querySelectorAll('button')).toHaveLength(4);
    expect(root.textContent).toContain(NEW_CHARACTER_LABEL);
    expect(root.textContent).toContain(MORE_LABEL);
    expect(root.textContent).toContain(COMING_SOON);
    expect(root.querySelector('[data-char-tab-locked]')!.getAttribute('title')).toBe(GUEST_LOCK_TOOLTIP);
  });

  test('a character tab reports its id and marks the active one', () => {
    const { root, onSelect } = mount({ characters: [c('a', 'alpha', 1), c('b', 'beta', 2)], states: { a: 'online' }, activeId: 'a' });
    const tabA = root.querySelector<HTMLButtonElement>('[data-char-tab="a"]')!;
    expect(tabA.classList.contains('active')).toBe(true);
    expect(tabA.getAttribute('aria-selected')).toBe('true');
    expect(tabA.querySelector('[data-tab-status]')!.textContent).toBe('online');
    root.querySelector<HTMLButtonElement>('[data-char-tab="b"]')!.click();
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  test('an empty slot opens the create form; disabled slots do nothing', () => {
    const { root, onNew, onSelect } = mount({ limit: 2 });
    root.querySelector<HTMLButtonElement>('[data-char-tab-new]')!.click();
    expect(onNew).toHaveBeenCalledTimes(1);
    const locked = root.querySelector<HTMLButtonElement>('[data-char-tab-locked]')!;
    const more = root.querySelector<HTMLButtonElement>('[data-char-tab-more]')!;
    expect(locked.disabled).toBe(true);
    expect(more.disabled).toBe(true);
    locked.click();
    more.click();
    expect(onNew).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('Left and Right move focus between the real tabs only', () => {
    const { root } = mount({ characters: [c('a', 'alpha', 1), c('b', 'beta', 2)], activeId: 'a' });
    const tabA = root.querySelector<HTMLButtonElement>('[data-char-tab="a"]')!;
    tabA.focus();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(root.querySelector('[data-char-tab="b"]'));
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement).toBe(tabA);
  });

  test('with no character yet the first open slot is the tab stop of the strip', () => {
    const { root } = mount({ limit: 2 });
    const news = root.querySelectorAll<HTMLButtonElement>('[data-char-tab-new]');
    expect(news[0].tabIndex).toBe(0);
    expect(news[1].tabIndex).toBe(-1);
    expect(root.querySelector<HTMLButtonElement>('[data-char-tab-locked]')!.tabIndex).toBe(-1);
    expect(root.querySelector<HTMLButtonElement>('[data-char-tab-more]')!.tabIndex).toBe(-1);
  });

  test('once a character exists the tab stop is its tab and the open slots stay out of the ring', () => {
    const { root } = mount({ characters: [c('a', 'alpha', 1)], activeId: 'a' });
    expect(root.querySelector<HTMLButtonElement>('[data-char-tab="a"]')!.tabIndex).toBe(0);
    for (const empty of root.querySelectorAll<HTMLButtonElement>('[data-char-tab-new]')) {
      expect(empty.tabIndex).toBe(-1);
    }
    root.querySelector<HTMLButtonElement>('[data-char-tab="a"]')!.focus();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(root.querySelector('[data-char-tab="a"]'));
  });

  test('a quote in a character name cannot break out of an attribute', () => {
    const { root } = mount({ characters: [c('a', `al"ph'a`, 1)] });
    expect(root.querySelectorAll('button')).toHaveLength(4);
    const tab = root.querySelector<HTMLButtonElement>('[data-char-tab="a"]')!;
    expect(tab.getAttribute('title')).toBe(`al"ph'a · offline`);
    expect(tab.querySelector('[data-tab-status]')!.textContent).toBe('offline');
  });

  test('re-rendering replaces the strip rather than appending to it', () => {
    const { root, tabs } = mount({ characters: [c('a', 'alpha', 1)] });
    tabs.render(input({ characters: [c('a', 'alpha', 1)], states: { a: 'online' } }));
    expect(root.querySelectorAll('button')).toHaveLength(4);
    expect(root.querySelector('[data-char-tab="a"] [data-tab-status]')!.textContent).toBe('online');
  });
});

// The online clock's two markers, asserted straight off `slotHtml` so each branch is pinned
// without a mount. Both are chrome the stylesheet already draws: `.char-tab-status.num` is the
// mono face, `data-online-since` is what the tick reads.
describe('the online clock markers', () => {
  const characterSlot = (over: Partial<Extract<TabSlot, { kind: 'character' }>> = {}): TabSlot => ({
    kind: 'character', index: 0, characterId: 'a', label: 'alpha', status: 'online',
    active: true, disabled: false, tooltip: 'alpha · online', ...over
  });
  const statusOf = (html: string): HTMLElement => {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host.querySelector<HTMLElement>('[data-tab-status]')!;
  };

  test('a tab with no clock renders a plain status word and no stamp', () => {
    const status = statusOf(slotHtml(characterSlot()));
    expect(status.className).toBe('char-tab-status');
    expect(status.hasAttribute('data-online-since')).toBe(false);
    expect(status.textContent).toBe('online');
  });

  test('a tab that renders a clock takes the mono face and the stamp the tick reads', () => {
    const status = statusOf(slotHtml(characterSlot({ clock: true, onlineSince: 1710 })));
    expect(status.className).toBe('char-tab-status num');
    expect(status.getAttribute('data-online-since')).toBe('1710');
  });

  test('a null stamp writes no attribute, so a tab that never came online is not ticked', () => {
    const status = statusOf(slotHtml(characterSlot({ clock: false, onlineSince: null })));
    expect(status.className).toBe('char-tab-status');
    expect(status.hasAttribute('data-online-since')).toBe(false);
  });
});

describe('onlineFor', () => {
  test('drops the hour segment below an hour and pads the rest', () => {
    expect(onlineFor(0)).toBe('0:00');
    expect(onlineFor(67)).toBe('1:07');
    expect(onlineFor(3599)).toBe('59:59');
  });

  test('shows h:mm:ss from an hour up, matching the mock', () => {
    // The mock's own renderVals(): osec 5347 renders 1:29:07.
    expect(onlineFor(5347)).toBe('1:29:07');
    expect(onlineFor(3600)).toBe('1:00:00');
  });
});

describe('the tab clock', () => {
  function mount(now: () => number = () => 0) {
    const root = document.createElement('nav');
    document.body.appendChild(root);
    const tabs = createCharacterTabs(root, { onSelect: vi.fn(), onNew: vi.fn(), now });
    const status = (id: string) => root.querySelector<HTMLElement>(`[data-char-tab="${id}"] [data-tab-status]`);
    return { root, tabs, status };
  }

  test('renders the clock for an online character and the word for every other state', () => {
    const { tabs, status } = mount();
    tabs.render(input({
      characters: [c('a', 'alpha', 1), c('b', 'beta', 2)],
      states: { a: 'online', b: 'offline' }, onlineSince: { a: 1_000, b: null }
    }));
    // 5,347 SECONDS is 1:29:07, and `tick` takes MILLISECONDS: the gap has to be 5,347,000ms.
    tabs.tick(5_348_000);
    expect(status('a')?.textContent).toBe('1:29:07');
    expect(status('a')?.className).toContain('num');
    expect(status('b')?.textContent).toBe('offline');
    expect(status('b')?.className).not.toContain('num');
  });

  test('render paints the clock itself, so an online tab never shows the word for a frame', () => {
    const { tabs, status } = mount(() => 61_000);
    tabs.render(input({ characters: [c('a', 'alpha', 1)], states: { a: 'online' }, onlineSince: { a: 0 } }));
    expect(status('a')?.textContent).toBe('1:01');
  });

  test('patches the clock in place, keeping focus and the roving tabindex', () => {
    const { root, tabs, status } = mount();
    tabs.render(input({ characters: [c('a', 'alpha', 1)], states: { a: 'online' }, onlineSince: { a: 0 }, activeId: 'a' }));
    const node = status('a')!;
    const tab = root.querySelector<HTMLElement>('[data-char-tab="a"]')!;
    tab.focus();
    tabs.tick(61_000);
    // Mutation target: calling render() from tick() replaces the node and blurs the tab.
    expect(status('a')).toBe(node);
    expect(node.textContent).toBe('1:01');
    expect(document.activeElement).toBe(tab);
    expect(tab.tabIndex).toBe(0);
  });

  test("keeps the tooltip's word, so 'alpha · online' still reads as a state", () => {
    const { root, tabs } = mount();
    tabs.render(input({ characters: [c('a', 'alpha', 1)], states: { a: 'online' }, onlineSince: { a: 0 } }));
    expect(root.querySelector('[data-char-tab="a"]')?.getAttribute('title')).toBe('alpha · online');
  });

  test('tick is a no-op for a tab with no stamp, and never throws', () => {
    const { tabs, status } = mount();
    tabs.render(input({ characters: [c('a', 'alpha', 1)], states: { a: 'connecting' }, onlineSince: { a: null } }));
    expect(() => tabs.tick(9_999)).not.toThrow();
    expect(status('a')?.textContent).toBe('connecting');
  });

  test('a clock never counts backwards from a stamp in the future', () => {
    const { tabs, status } = mount();
    tabs.render(input({ characters: [c('a', 'alpha', 1)], states: { a: 'online' }, onlineSince: { a: 10_000 } }));
    tabs.tick(4_000);
    expect(status('a')?.textContent).toBe('0:00');
  });
});
