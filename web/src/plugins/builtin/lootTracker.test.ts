// web/src/plugins/builtin/lootTracker.test.ts
import { describe, expect, test, vi } from 'vitest';
import { createLootTrackerPlugin } from './lootTracker';
import { createLootLog } from '../../stats/loot';
import { LOOT_EMPTY_COPY } from '../../ui/copy';
import type { PluginContext } from '../types';

function ctx(getObjName: (id: number) => string | null, over: Partial<PluginContext> = {}): PluginContext {
  return {
    client: () => ({ getObjName } as unknown as ReturnType<PluginContext['client']>),
    settings: { get: (() => undefined) as PluginContext['settings']['get'], set: vi.fn(), subscribe: () => () => {} },
    storage: { get: () => null, set: () => {} },
    notify: vi.fn(), openPanel: vi.fn(), user: () => null, ...over
  };
}

const mountLoot = (log: ReturnType<typeof createLootLog>, over: Partial<PluginContext> = {}): HTMLElement => {
  const body = document.createElement('div');
  createLootTrackerPlugin(() => log).panel!(ctx(() => 'Bones', over)).mount(body);
  return body;
};

describe('loot-tracker plugin', () => {
  test('manifest is the loot shell plugin, default enabled', () => {
    const p = createLootTrackerPlugin(() => createLootLog());
    expect(p.manifest.id).toBe('loot');
    expect(p.manifest.defaultEnabled).toBe(true);
  });

  test('renders one row per item, newest first, with its count', () => {
    const log = createLootLog();
    log.onInventory({ added: [{ id: 526, count: 3 }] }, 1000);
    log.onInventory({ added: [{ id: 995, count: 1200 }] }, 2000);
    const body = document.createElement('div');
    const names: Record<number, string> = { 526: 'Bones', 995: 'Coins' };
    createLootTrackerPlugin(() => log).panel!(ctx(id => names[id] ?? null)).mount(body);
    expect([...body.querySelectorAll('.kv-label')].map(n => n.textContent)).toEqual(['Coins', 'Bones']);
    expect([...body.querySelectorAll('.kv-value')].map(n => n.textContent)).toEqual(['x1,200', 'x3']);
  });

  // The count line is the one string this panel invents (the mock draws only the empty state), so
  // nothing upstream pins it. Two entries with DIFFERENT counts are what separate the item total
  // from the stack count: with `3` and `1,200` the two numbers can never be confused, where a log
  // of two singles would read `2 in 2 stacks` under either arithmetic.
  test('the header counts items and stacks separately, beside the same Reset the XP panel uses', () => {
    const log = createLootLog();
    log.onInventory({ added: [{ id: 526, count: 3 }] }, 1000);
    log.onInventory({ added: [{ id: 995, count: 1200 }] }, 2000);
    const body = mountLoot(log);
    expect(body.querySelector('.loot-head')).not.toBeNull();
    expect(body.querySelector('.loot-count')?.textContent).toBe('1,203 in 2 stacks');
    const reset = body.querySelector<HTMLButtonElement>('.loot-head [data-loot-reset]')!;
    expect(reset.className).toBe('btn btn-outline btn-quiet');
    expect(reset.textContent).toBe('Reset');
  });

  // The line does not special-case a singular, so a first drop reads `1 in 1 stacks`. Pinned as
  // it ships rather than quietly reworded: fix round 1 was asked to assert this literal, and a
  // round that both asserts a string and changes it has asserted nothing.
  test('a single first drop is one item in one stack, ungrammatical `stacks` and all', () => {
    const log = createLootLog();
    log.onInventory({ added: [{ id: 526, count: 1 }] }, 1000);
    expect(mountLoot(log).querySelector('.loot-count')?.textContent).toBe('1 in 1 stacks');
  });

  test('an item the client cannot name falls back to its id rather than rendering null', () => {
    const log = createLootLog();
    log.onInventory({ added: [{ id: 4151, count: 1 }] }, 1000);
    const body = document.createElement('div');
    createLootTrackerPlugin(() => log).panel!(ctx(() => null)).mount(body);
    expect(body.querySelector('.kv-label')?.textContent).toBe('#4151');
  });

  test('a hostile item name is text, never markup', () => {
    const log = createLootLog();
    log.onInventory({ added: [{ id: 1, count: 1 }] }, Date.now());
    const body = document.createElement('div');
    createLootTrackerPlugin(() => log).panel!(ctx(() => '<img src=x onerror=alert(1)>')).mount(body);
    expect(body.querySelector('img')).toBeNull();
    expect(body.innerHTML).toContain('&lt;img');
  });

  test('reset clears the log and repaints to the empty state', () => {
    const log = createLootLog();
    log.onInventory({ added: [{ id: 526, count: 3 }] }, Date.now());
    const body = mountLoot(log);
    body.querySelector<HTMLButtonElement>('[data-loot-reset]')!.click();
    expect(log.entries().length).toBe(0);
    expect(body.querySelector('.empty-state-title')?.textContent).toBe('Nothing looted yet');
  });

  // map-design 3.11: the full empty-state pattern, which is the one README calls the pattern for
  // all empty states. The copy carries an em dash and therefore lives in ui/copy.ts (ruling R1).
  test('the empty state is the full pattern, with the bobbing mark and the mock copy', () => {
    const body = mountLoot(createLootLog());
    const state = body.querySelector('.empty-state')!;
    expect(state.classList.contains('compact')).toBe(false);
    expect(state.querySelector('.empty-state-mark')?.textContent).toBe('◌');
    expect(state.querySelector('.empty-state-title')?.textContent).toBe('Nothing looted yet');
    expect(state.querySelector('.empty-state-copy')?.textContent).toBe(LOOT_EMPTY_COPY);
    expect(body.querySelector('[data-loot-reset]')).toBeNull();
  });

  test('the empty state offers the panel CTA, which opens Automation', () => {
    const openPanel = vi.fn();
    const body = mountLoot(createLootLog(), { openPanel });
    const cta = body.querySelector<HTMLButtonElement>('.empty-state .btn')!;
    expect(cta.textContent).toBe('Run a script');
    // The mock draws this one at h27 with a .25 resting glow, which is the panel-CTA pair and not
    // the co-pilot bar's primary; `.btn-cta` is the whole difference.
    expect(cta.className).toBe('btn btn-primary btn-cta');
    cta.click();
    expect(openPanel).toHaveBeenCalledWith('tasks');
  });

  test('the panel repaints on its own 2 s timer while mounted', () => {
    vi.useFakeTimers();
    const log = createLootLog();
    const body = mountLoot(log);
    log.onInventory({ added: [{ id: 526, count: 3 }] }, Date.now());
    vi.advanceTimersByTime(2000);
    expect(body.querySelectorAll('.kv').length).toBe(1);
    vi.useRealTimers();
  });

  test('releases its timer on unmount and renders nothing afterwards', () => {
    vi.useFakeTimers();
    const log = createLootLog();
    const body = document.createElement('div');
    const view = createLootTrackerPlugin(() => log).panel!(ctx(() => 'Bones'));
    view.mount(body);
    view.unmount!();
    log.onInventory({ added: [{ id: 526, count: 3 }] }, Date.now());
    vi.advanceTimersByTime(30_000);
    expect(body.querySelectorAll('.kv').length).toBe(0);
    vi.useRealTimers();
  });

  // `frame/panels.ts` hands every panel the SAME `#panel-body` and only empties it between mounts,
  // so a listener the panel does not remove survives to the next open and fires once per past one.
  // The button is put back into the emptied body and clicked there, so the click bubbles to the
  // body exactly as the controller's next mount would have it: the listener, if any, is on `body`.
  test('releases its click listener on unmount, so a re-open cannot reset N times', () => {
    const log = createLootLog();
    log.onInventory({ added: [{ id: 526, count: 3 }] }, 1000);
    const body = document.createElement('div');
    const view = createLootTrackerPlugin(() => log).panel!(ctx(() => 'Bones'));
    view.mount(body);
    const marker = body.querySelector<HTMLElement>('[data-loot-reset]')!;
    view.unmount!();
    body.replaceChildren(marker);
    marker.click();
    expect(log.entries().length).toBe(1);
  });
});
