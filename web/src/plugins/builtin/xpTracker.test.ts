// web/src/plugins/builtin/xpTracker.test.ts
import { describe, expect, test, vi } from 'vitest';
import { createXpTrackerPlugin, type XpSource } from './xpTracker';
import { createXpTracker, type XpRow } from '../../stats/xp';
import type { PluginContext } from '../types';

function ctx(over: Partial<PluginContext> = {}): PluginContext {
  return {
    client: () => null,
    settings: { get: ((k: string) => (k === 'showToNext' ? true : undefined)) as PluginContext['settings']['get'], set: vi.fn(), subscribe: () => () => {} },
    storage: { get: () => null, set: () => {} },
    notify: vi.fn(), openPanel: vi.fn(), user: () => null, ...over
  };
}

const wcRow = (over: Partial<XpRow> = {}): XpRow => ({
  skill: 8, name: 'Woodcutting', gained: 4180, perHour: 24180,
  level: 34, toNext: 1290, actionsToNext: 52, pct: 64, ...over
});

/**
 * A source is exactly what the panel asks of a tracker, so this fake is no looser than the real
 * `createXpTracker`, which satisfies the same interface structurally. The literals below are the
 * mock's own (map-design 3.10), and no arithmetic in the real tracker produces them on demand.
 */
function source(rows: XpRow[], startedAt: number | null = 0): XpSource & { resets: number } {
  return {
    resets: 0,
    rows: () => rows,
    startedAt: () => startedAt,
    reset() { this.resets += 1; }
  };
}

function mountXp(rows: XpRow[], over: Partial<PluginContext> = {}): HTMLElement {
  const body = document.createElement('div');
  createXpTrackerPlugin(() => source(rows)).panel!(ctx(over)).mount(body);
  return body;
}

describe('xp-tracker plugin', () => {
  test('manifest is the xp shell plugin, default enabled, with a showToNext setting', () => {
    const p = createXpTrackerPlugin(() => createXpTracker());
    expect(p.manifest.id).toBe('xp');
    expect(p.manifest.tier).toBe('shell');
    expect(p.manifest.defaultEnabled).toBe(true);
    expect(p.manifest.settings?.showToNext).toBeTruthy();
  });

  test('renders one card per skill with a level chip, a gain, a meter and a footer', () => {
    const body = mountXp([wcRow()]);
    const c = body.querySelector('.card')!;
    expect(c.querySelector('.xp-level')?.textContent).toBe('34');
    expect(c.querySelector('.xp-name')?.textContent).toBe('Woodcutting');
    expect(c.querySelector('.xp-sub')?.textContent).toBe('24,180/h · 52 actions to 35');
    expect(c.querySelector('.xp-gain')?.textContent).toBe('+4,180');
    expect((c.querySelector('.meter-fill') as HTMLElement).style.width).toBe('64%');
    // map-design 3.10 and section 4: shimmer's three targets are the pinned card and BOTH XP panel
    // cards. Reserving the assertion for the pinned card leaves the two the player looks at most
    // untested, and `meter()` does not shimmer unless it is asked to.
    expect(c.querySelector('.meter-fill')?.className).toContain('shimmer');
    expect(c.querySelector('.xp-foot')?.textContent).toBe('lvl 341,290 xp to lvl 35');
  });

  test('one card per row, in the order the tracker hands them over', () => {
    const body = mountXp([wcRow(), wcRow({ skill: 11, name: 'Firemaking', level: 21, gained: 610 })]);
    expect([...body.querySelectorAll('.xp-name')].map(n => n.textContent)).toEqual(['Woodcutting', 'Firemaking']);
    expect(body.querySelectorAll('.card').length).toBe(2);
  });

  test('the header reads the session clock off the tracker, beside a Reset button', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(150_000));
    const body = mountXp([wcRow()]);
    // startedAt 0, now 150,000 ms: 2:30 in the same m:ss the character tab's online clock uses.
    expect(body.querySelector('.xp-since')?.textContent).toBe('Session · 2:30');
    const reset = body.querySelector<HTMLButtonElement>('[data-xp-reset]')!;
    expect(reset.className).toBe('btn btn-outline btn-quiet');
    expect(reset.textContent).toBe('Reset');
    vi.useRealTimers();
  });

  test('a maxed skill says so instead of counting down to a level that does not exist', () => {
    const body = mountXp([wcRow({ level: 99, toNext: null, actionsToNext: null, pct: 100 })]);
    expect(body.querySelector('.xp-sub')?.textContent).toBe('24,180/h · maxed');
    expect(body.querySelector('.xp-foot')?.textContent).toBe('lvl 99maxed');
  });

  test('showToNext off drops the actions clause and the footer target, and keeps the rate', () => {
    const off = { settings: { get: (() => false) as PluginContext['settings']['get'], set: vi.fn(), subscribe: () => () => {} } };
    const body = mountXp([wcRow()], off);
    expect(body.querySelector('.xp-sub')?.textContent).toBe('24,180/h');
    expect(body.querySelector('.xp-foot')?.textContent).toBe('lvl 34');
  });

  // The title AND the copy: both sentences are this panel's own (the mock draws only the loot
  // empty state), so nothing upstream pins either. The loot panel's copy is asserted because it
  // lives in ui/copy.ts and copy.test.ts enumerates it; this one has no em dash, so ruling R1 does
  // not put it there, and this case is the only thing between it and arbitrary text.
  test('shows the empty state, not an empty list, with no rows', () => {
    const body = mountXp([]);
    expect(body.querySelector('.empty-state-title')?.textContent).toBe('No experience yet');
    expect(body.querySelector('.empty-state-copy')?.textContent)
      .toBe('Train a skill and it appears here with its rate and its time to the next level.');
    // No CTA here, unlike the loot panel: the way to gain experience is to play.
    expect(body.querySelector('.empty-state .btn')).toBeNull();
    expect(body.querySelector('.card')).toBeNull();
    expect(body.querySelector('[data-xp-reset]')).toBeNull();
  });

  test('reset button clears the tracker and repaints at once', () => {
    const src = source([wcRow()]);
    const body = document.createElement('div');
    createXpTrackerPlugin(() => src).panel!(ctx()).mount(body);
    src.rows = () => [];
    body.querySelector<HTMLButtonElement>('[data-xp-reset]')!.click();
    expect(src.resets).toBe(1);
    expect(body.querySelector('.empty-state-title')).not.toBeNull();
  });

  test('a hostile skill name is text, never markup', () => {
    const body = mountXp([wcRow({ name: '<img src=x onerror=alert(1)>' })]);
    expect(body.querySelector('img')).toBeNull();
    expect(body.innerHTML).toContain('&lt;img');
  });

  test('the panel repaints on its own timer while mounted', () => {
    vi.useFakeTimers();
    const rows: XpRow[] = [];
    const body = document.createElement('div');
    createXpTrackerPlugin(() => source(rows)).panel!(ctx()).mount(body);
    expect(body.querySelectorAll('.card').length).toBe(0);
    rows.push(wcRow());
    vi.advanceTimersByTime(5000);
    expect(body.querySelectorAll('.card').length).toBe(1);
    vi.useRealTimers();
  });

  test('releases its timer on unmount and renders nothing afterwards', () => {
    vi.useFakeTimers();
    const rows: XpRow[] = [];
    const body = document.createElement('div');
    const view = createXpTrackerPlugin(() => source(rows)).panel!(ctx());
    view.mount(body);
    view.unmount!();
    rows.push(wcRow());
    vi.advanceTimersByTime(30_000);
    expect(body.querySelectorAll('.card').length).toBe(0);
    vi.useRealTimers();
  });

  // `frame/panels.ts` hands every panel the SAME `#panel-body` and only empties it between mounts,
  // so a listener the panel does not remove survives to the next open and fires once per past one.
  // The button is put back into the emptied body and clicked there, so the click bubbles to the
  // body exactly as the controller's next mount would have it: the listener, if any, is on `body`.
  test('releases its click listener on unmount, so a re-open cannot reset N times', () => {
    const src = source([wcRow()]);
    const body = document.createElement('div');
    const view = createXpTrackerPlugin(() => src).panel!(ctx());
    view.mount(body);
    const marker = body.querySelector<HTMLElement>('[data-xp-reset]')!;
    view.unmount!();
    body.replaceChildren(marker);
    marker.click();
    expect(src.resets).toBe(0);
  });

  test('the real tracker satisfies the source the panel asks for', () => {
    const t = createXpTracker();
    t.onXp({ skill: 7, xp: 0, delta: 0, level: 1 }, 0);
    t.onXp({ skill: 7, xp: 40, delta: 40, level: 1 }, 1000);
    const body = document.createElement('div');
    createXpTrackerPlugin(() => t).panel!(ctx()).mount(body);
    expect(body.querySelector('.xp-name')?.textContent).toBe('Cooking');
    expect(body.querySelector('.xp-gain')?.textContent).toBe('+40');
  });
});
