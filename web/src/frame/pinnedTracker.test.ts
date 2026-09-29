// web/src/frame/pinnedTracker.test.ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { compactRate, createPinnedTracker, pinGuards } from './pinnedTracker';
import type { XpRow } from '../stats/xp';

const wcRow = (over: Partial<XpRow> = {}): XpRow => ({
  skill: 8, name: 'Woodcutting', gained: 4180, perHour: 24180,
  level: 34, toNext: 1290, actionsToNext: 52, pct: 64, ...over
});

let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  host.className = 'pinned-tracker hidden';
});
afterEach(() => { vi.useRealTimers(); });

describe('compactRate', () => {
  // The pinned card has a third of the XP panel's width for the same number, so the mock writes
  // `24.2k/h` where the panel writes `24,180/h` (map-design 3.8 against 3.10).
  test('is the mock 24.2k, keeps small numbers whole, and does not print a trailing .0', () => {
    expect(compactRate(24180)).toBe('24.2k');
    expect(compactRate(999)).toBe('999');
    expect(compactRate(1000)).toBe('1k');
    expect(compactRate(3400)).toBe('3.4k');
    expect(compactRate(1_250_000)).toBe('1.3m');
    expect(compactRate(0)).toBe('0');
  });

  // The branch used to be picked on the raw value and the rounding done after it, so 999,999 came
  // out as `1,000k`: a number in the wrong unit, which is the one thing this function exists to
  // avoid. Unreachable at 2004-era rates, but the function is exported and has two consumers now.
  test('a rate that rounds up out of its own unit takes the next unit, not a four-digit one', () => {
    expect(compactRate(999_999)).toBe('1m');
    expect(compactRate(999_949)).toBe('999.9k');
    expect(compactRate(999_950)).toBe('1m');
  });
});

// The mock's guards, lifted out of main.ts so they can be reached: main.ts `byId()`s at module
// scope and audit C18 rules it unimportable under jsdom, so the two lines that call this are the
// only untested thing left in the wiring, and they are now one destructure each.
describe('pinGuards', () => {
  test('the Pin button shows only on the XP panel, and only while it is not already pinned', () => {
    expect(pinGuards('xp', null).canPin).toBe(true);
    expect(pinGuards('xp', 'xp').canPin).toBe(false);
    expect(pinGuards('loot', null).canPin).toBe(false);
    expect(pinGuards(null, null).canPin).toBe(false);
  });

  // The `null` case is the one the mock does not answer, and entry 4's review found the shell
  // answering it wrong: the card's host lives inside `#side-panel`, which is `hidden` with no panel
  // open, so `showCard` was true for a card nobody could see while its 5 s tick kept running. The
  // pin itself survives; the card comes back the moment any other panel opens.
  test('the card shows only while XP is pinned and some OTHER panel is open, never with none', () => {
    expect(pinGuards('loot', 'xp').showCard).toBe(true);
    expect(pinGuards(null, 'xp').showCard).toBe(false);
    expect(pinGuards('xp', 'xp').showCard).toBe(false);
    expect(pinGuards('loot', null).showCard).toBe(false);
  });

  // The two are never both true: the button is the way to pin and the card is what a pin shows,
  // so a state that offered both would be offering to pin what is already pinned.
  test('the button and the card are never on screen together, in any of the four states', () => {
    for (const open of ['xp', 'loot', null] as const) {
      for (const pinned of ['xp', null] as const) {
        const g = pinGuards(open, pinned);
        expect(g.canPin && g.showCard, `${open} / ${pinned}`).toBe(false);
      }
    }
  });
});

describe('the pinned XP card', () => {
  test('renders the top skill as a compact card above the panel header', () => {
    const pinned = createPinnedTracker(host, { rows: () => [wcRow()], onUnpin: vi.fn() });
    pinned.setPinned(true);
    expect(host.classList.contains('hidden')).toBe(false);
    expect(host.querySelector('.section-label')?.textContent).toBe('Pinned · XP');
    expect(host.querySelector('.pin-name')?.textContent).toBe('Woodcutting');
    expect(host.querySelector('.pin-gain')?.textContent).toBe('+4,180');
    expect(host.querySelector('.pin-sub')?.textContent).toBe('24.2k/h · lvl 34');
    expect((host.querySelector('.meter-fill') as HTMLElement).style.width).toBe('64%');
    expect(host.querySelector('.meter-fill')?.className).toContain('shimmer');
  });

  test('the top skill is the first row, which is the tracker order', () => {
    const rows = [wcRow({ name: 'Firemaking', gained: 610, perHour: 3400, level: 21, pct: 31 }), wcRow()];
    const pinned = createPinnedTracker(host, { rows: () => rows, onUnpin: vi.fn() });
    pinned.setPinned(true);
    expect(host.querySelector('.pin-name')?.textContent).toBe('Firemaking');
    expect(host.querySelectorAll('.pin-name').length).toBe(1);
  });

  test('the unpin button is labelled and calls back exactly once', () => {
    const onUnpin = vi.fn();
    const pinned = createPinnedTracker(host, { rows: () => [wcRow()], onUnpin });
    pinned.setPinned(true);
    const btn = host.querySelector<HTMLButtonElement>('[data-unpin]')!;
    expect(btn.getAttribute('aria-label')).toBe('Unpin');
    // map-design 3.8 draws it at 18x18 and 12px, which is `.btn-icon-xs`, not the window close.
    expect(btn.className).toBe('btn btn-icon btn-icon-xs');
    btn.click();
    expect(onUnpin).toHaveBeenCalledTimes(1);
  });

  test('a pin with nothing tracked yet stays out of the way rather than showing an empty card', () => {
    let rows: XpRow[] = [];
    const pinned = createPinnedTracker(host, { rows: () => rows, onUnpin: vi.fn() });
    pinned.setPinned(true);
    expect(host.classList.contains('hidden')).toBe(true);
    expect(host.children.length).toBe(0);
    // And it goes back out of the way when the rows disappear under it, which is what pressing
    // Reset in the XP panel and then closing the panel does.
    rows = [wcRow()];
    pinned.render();
    expect(host.children.length).toBeGreaterThan(0);
    rows = [];
    pinned.render();
    expect(host.classList.contains('hidden')).toBe(true);
    expect(host.children.length).toBe(0);
  });

  test('render repaints the card in place while pinned, and does nothing while unpinned', () => {
    let rows = [wcRow()];
    const pinned = createPinnedTracker(host, { rows: () => rows, onUnpin: vi.fn() });
    pinned.setPinned(true);
    rows = [wcRow({ name: 'Firemaking', gained: 610, perHour: 3400, level: 21, pct: 31 })];
    pinned.render();
    expect(host.querySelector('.pin-name')?.textContent).toBe('Firemaking');
    expect(host.querySelector('.pin-sub')?.textContent).toBe('3.4k/h · lvl 21');
    pinned.setPinned(false);
    rows = [wcRow()];
    pinned.render();
    expect(host.children.length).toBe(0);
  });

  test('a maxed skill reads its level rather than a rate towards a level that does not exist', () => {
    const rows = [wcRow({ level: 99, toNext: null, actionsToNext: null, pct: 100 })];
    const pinned = createPinnedTracker(host, { rows: () => rows, onUnpin: vi.fn() });
    pinned.setPinned(true);
    expect(host.querySelector('.pin-sub')?.textContent).toBe('24.2k/h · lvl 99');
  });

  test('a hostile skill name is text, never markup', () => {
    const rows = [wcRow({ name: '<img src=x onerror=alert(1)>' })];
    const pinned = createPinnedTracker(host, { rows: () => rows, onUnpin: vi.fn() });
    pinned.setPinned(true);
    expect(host.querySelector('img')).toBeNull();
    expect(host.innerHTML).toContain('&lt;img');
  });

  test('hides itself when unpinned and renders nothing after dispose', () => {
    const pinned = createPinnedTracker(host, { rows: () => [wcRow()], onUnpin: vi.fn() });
    pinned.setPinned(true);
    pinned.setPinned(false);
    expect(host.classList.contains('hidden')).toBe(true);
    expect(host.children.length).toBe(0);
    pinned.dispose();
    pinned.render();
    expect(host.children.length).toBe(0);
  });

  test('dispose survives a setPinned that arrives after it', () => {
    const onUnpin = vi.fn();
    const pinned = createPinnedTracker(host, { rows: () => [wcRow()], onUnpin });
    pinned.setPinned(true);
    pinned.dispose();
    expect(host.children.length).toBe(0);
    expect(host.classList.contains('hidden')).toBe(true);
    pinned.setPinned(true);
    expect(host.children.length).toBe(0);
    expect(onUnpin).not.toHaveBeenCalled();
  });

  // The card is only ever on screen while the XP panel is CLOSED (`showPinCard` is
  // `pinned === 'xp' && panel !== 'xp'`), so the panel's own 5 s interval is not running when the
  // card is: exactly one of the two is alive at any moment, and this is the one that keeps the
  // pinned numbers moving.
  test('keeps itself current on a 5 s tick while pinned', () => {
    vi.useFakeTimers();
    let rows = [wcRow()];
    const pinned = createPinnedTracker(host, { rows: () => rows, onUnpin: vi.fn() });
    pinned.setPinned(true);
    rows = [wcRow({ gained: 5000 })];
    vi.advanceTimersByTime(5000);
    expect(host.querySelector('.pin-gain')?.textContent).toBe('+5,000');
  });

  test('unpinning releases the tick, and dispose releases it too', () => {
    vi.useFakeTimers();
    let rows = [wcRow()];
    const pinned = createPinnedTracker(host, { rows: () => rows, onUnpin: vi.fn() });
    pinned.setPinned(true);
    pinned.setPinned(false);
    rows = [wcRow({ gained: 5000 })];
    vi.advanceTimersByTime(60_000);
    expect(host.children.length).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    pinned.setPinned(true);
    pinned.dispose();
    vi.advanceTimersByTime(60_000);
    expect(host.children.length).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
