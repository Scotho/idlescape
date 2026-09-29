import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  createBoot, createHealthWatcher, createPageHideHandler, showBootError
} from './boot';
import type { HealthSnapshot } from './types';

// One health fixture behind a factory. `wiki` and `management` are on it because web/src/types.ts's
// mirror now carries both: the shell does not read either, but the release gate does, and a fixture
// that drifts from server/src/types.ts should fail this typecheck rather than the gate.
const snapshot = (over: Partial<HealthSnapshot> = {}): HealthSnapshot => ({
  engine: 'up', engineUptimeMs: 1, version: '0.1.0',
  gateway: 'not_deployed', players: 3, wiki: 'up', management: 'up', ...over
});
const idleWatcher = (): ReturnType<typeof createHealthWatcher> =>
  createHealthWatcher({ health: async () => snapshot(), onSnapshot: () => {}, onCountdown: () => {} });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test('boot starts the health watcher, then enters the app', async () => {
  // The watcher starts first so the offline card and the player count are live whatever entering
  // the app does.
  const order: string[] = [];
  const watcher = idleWatcher();
  const start = vi.spyOn(watcher, 'start').mockImplementation(() => { order.push('start'); });
  await createBoot({ watcher, enterApp: () => { order.push('enterApp'); }, onBootError: () => {} }).run();
  expect(order).toEqual(['start', 'enterApp']);
  expect(start).toHaveBeenCalledTimes(1);
  watcher.stop();
});

test('boot never rejects, and a thrown enterApp reaches the error surface', async () => {
  const onBootError = vi.fn();
  const watcher = idleWatcher();
  const boot = createBoot({ watcher, enterApp: () => { throw new Error('homeCtl exploded'); }, onBootError });
  await expect(boot.run()).resolves.toBeUndefined();
  expect(onBootError).toHaveBeenCalledTimes(1);
  expect(onBootError.mock.calls[0]?.[0]).toContain('homeCtl exploded');
  watcher.stop();
});

test('a watcher that throws on start is caught too, and the app is not entered', async () => {
  const onBootError = vi.fn();
  const enterApp = vi.fn();
  const watcher = idleWatcher();
  vi.spyOn(watcher, 'start').mockImplementation(() => { throw new TypeError('no timers'); });
  await expect(createBoot({ watcher, enterApp, onBootError }).run()).resolves.toBeUndefined();
  expect(onBootError).toHaveBeenCalledWith('no timers');
  expect(enterApp).not.toHaveBeenCalled();
});

test('the health poll does not pile up while a request is in flight', async () => {
  let resolveHealth: (h: HealthSnapshot) => void = () => {};
  const health = vi.fn(() => new Promise<HealthSnapshot>(r => { resolveHealth = r; }));
  const w = createHealthWatcher({ health, onSnapshot: () => {}, onCountdown: () => {}, intervalMs: 1000 });
  w.start();
  expect(health).toHaveBeenCalledTimes(1);      // start() polls immediately
  await vi.advanceTimersByTimeAsync(5000);      // five ticks, one request still open
  expect(health).toHaveBeenCalledTimes(1);
  resolveHealth(snapshot());
  await vi.advanceTimersByTimeAsync(1000);
  expect(health).toHaveBeenCalledTimes(2);
  w.stop();
});

test('stop() ends the poll: nothing survives a teardown', async () => {
  const health = vi.fn(async () => snapshot());
  const seen: (HealthSnapshot | null)[] = [];
  const counts: number[] = [];
  const w = createHealthWatcher({
    health, onSnapshot: h => seen.push(h), onCountdown: (_down, secs) => { counts.push(secs); }, intervalMs: 1000
  });
  w.start();
  await vi.advanceTimersByTimeAsync(3000);
  const calls = health.mock.calls.length;
  expect(calls).toBeGreaterThan(1);
  const snapshots = seen.length;
  const countdowns = counts.length;
  w.stop();
  await vi.advanceTimersByTimeAsync(10_000);
  // Not just "no timer remains": no request fires and no callback is invoked after the teardown.
  expect(health).toHaveBeenCalledTimes(calls);
  expect(seen.length).toBe(snapshots);
  expect(counts.length).toBe(countdowns);
});

test('stop() while a poll is in flight: the reply that lands afterwards paints nothing', async () => {
  // The teardown case the test above cannot reach. Its health settles inside every timer advance, so
  // no request is ever open when stop() runs; here one is. Clearing the interval only stops the NEXT
  // tick, so without a stopped flag this reply still reaches onSnapshot and onCountdown, and
  // web/src/main.ts writes the frame singletons, the home player count and the offline card from those after
  // its pagehide teardown has already run.
  let resolveHealth: (h: HealthSnapshot) => void = () => {};
  const health = vi.fn(() => new Promise<HealthSnapshot>(r => { resolveHealth = r; }));
  const seen: (HealthSnapshot | null)[] = [];
  const counts: number[] = [];
  const w = createHealthWatcher({
    health, onSnapshot: h => seen.push(h), onCountdown: (_down, secs) => { counts.push(secs); }, intervalMs: 1000
  });
  w.start();
  await vi.advanceTimersByTimeAsync(500);   // start()'s immediate poll is open and unanswered
  expect(health).toHaveBeenCalledTimes(1);
  expect(seen).toEqual([]);
  w.stop();
  resolveHealth(snapshot());
  await vi.advanceTimersByTimeAsync(10_000);
  expect(seen).toEqual([]);
  expect(counts).toEqual([]);
  expect(health).toHaveBeenCalledTimes(1);
});

test('start() twice does not double the poll rate', async () => {
  const health = vi.fn(async () => snapshot());
  const w = createHealthWatcher({ health, onSnapshot: () => {}, onCountdown: () => {}, intervalMs: 1000 });
  w.start();
  w.start();
  await vi.advanceTimersByTimeAsync(3000);
  expect(health).toHaveBeenCalledTimes(4);       // one at start, three ticks
  w.stop();
});

test('start() after stop() polls again, so a teardown is not permanent', async () => {
  const health = vi.fn(async () => snapshot());
  const w = createHealthWatcher({ health, onSnapshot: () => {}, onCountdown: () => {}, intervalMs: 1000 });
  w.start();
  await vi.advanceTimersByTimeAsync(2000);
  expect(health).toHaveBeenCalledTimes(3);       // one at start, two ticks
  w.stop();
  w.start();
  await vi.advanceTimersByTimeAsync(2000);
  expect(health).toHaveBeenCalledTimes(6);       // one at the restart, two more ticks
  w.stop();
});

test('start() after stop() paints again, so the in-flight guard is not permanent either', async () => {
  // The counterpart to the test above: stop() suppresses callbacks, and start() must un-suppress
  // them. Counting requests cannot see the difference, because the interval is armed either way.
  const seen: (HealthSnapshot | null)[] = [];
  const w = createHealthWatcher({
    health: async () => snapshot({ players: 7 }), onSnapshot: h => seen.push(h), onCountdown: () => {}, intervalMs: 1000
  });
  w.start();
  await vi.advanceTimersByTimeAsync(2000);
  expect(seen.length).toBe(3);                   // one at start, two ticks
  w.stop();
  seen.length = 0;
  w.start();
  await vi.advanceTimersByTimeAsync(2000);
  w.stop();
  expect(seen).toEqual([snapshot({ players: 7 }), snapshot({ players: 7 }), snapshot({ players: 7 })]);
});

test('a rejected health call reports down and does not escape', async () => {
  const seen: (HealthSnapshot | null)[] = [];
  const w = createHealthWatcher({
    health: async () => { throw new TypeError('Failed to fetch'); },
    onSnapshot: h => seen.push(h), onCountdown: () => {}, intervalMs: 1000
  });
  await w.tick();
  expect(seen).toEqual([null]);
  w.stop();
});

test('a healthy snapshot reaches onSnapshot and reports not-down', async () => {
  const seen: (HealthSnapshot | null)[] = [];
  const downs: boolean[] = [];
  const w = createHealthWatcher({
    health: async () => snapshot({ players: 7 }),
    onSnapshot: h => seen.push(h), onCountdown: down => { downs.push(down); }, intervalMs: 1000
  });
  await w.tick();
  expect(seen).toEqual([snapshot({ players: 7 })]);
  expect(downs).toEqual([false]);
  w.stop();
});

test('the offline countdown runs 10 down to 1 and wraps', async () => {
  const counts: number[] = [];
  const w = createHealthWatcher({
    health: async () => snapshot({ engine: 'down' }),
    onSnapshot: () => {}, onCountdown: (down, secs) => { if (down) counts.push(secs); }, intervalMs: 1000
  });
  for (let i = 0; i < 11; i++) await w.tick();
  expect(counts.slice(0, 10)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 10]);
  w.stop();
});

// The closing test for C18 itself. Everything above proves the plumbing; this proves the page is
// not blank, which is the whole finding. It loads the REAL partials the way
// web/src/characters/gate.test.ts does, with the home screen already showing, so a future edit that
// hides the message or leaves another screen over it fails here rather than in production.
const partial = (name: string): string => readFileSync(resolve(process.cwd(), `src/partials/${name}.html`), 'utf-8');

test('a boot error paints a message that is actually visible on its own screen', () => {
  document.body.innerHTML = partial('boot') + partial('home');
  document.getElementById('screen-home')!.classList.remove('hidden');

  showBootError('homeCtl exploded');

  const el = document.getElementById('boot-error');
  expect(el).not.toBeNull();
  expect(el!.textContent).toBe('Could not start: homeCtl exploded. Reload the page.');
  expect(el!.getAttribute('role')).toBe('alert');
  // .hidden is `display: none !important` (web/src/styles/base.css:21), so an ancestor carrying it
  // is the same as painting nothing.
  for (let n: HTMLElement | null = el; n !== null; n = n.parentElement) {
    expect(n.classList.contains('hidden')).toBe(false);
  }
  // Every other screen is out of the way, so nothing covers the message.
  const visible = [...document.querySelectorAll('.screen')].filter(s => !s.classList.contains('hidden'));
  expect(visible.map(s => s.id)).toEqual(['screen-boot']);
});

test('the boot error screen is on the page: index.html includes its partial', () => {
  const index = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8');
  expect(index).toContain('<!-- @include "src/partials/boot.html" -->');
});

// pagehide is not only the last event a page sees. These two guard the half of the teardown that must
// NOT run when the browser is freezing the document into the back/forward cache, because it resumes
// that same document on pageshow and nothing would re-arm the fps line or the health poll.
test('a back/forward-cache freeze flushes the settings but leaves the timers running', () => {
  const teardown = vi.fn();
  const flush = vi.fn();
  createPageHideHandler({ teardown, flush })({ persisted: true });
  expect(flush).toHaveBeenCalledTimes(1);
  expect(teardown).not.toHaveBeenCalled();
});

test('a real unload flushes the settings and tears the timers down', () => {
  const teardown = vi.fn();
  const flush = vi.fn();
  createPageHideHandler({ teardown, flush })({ persisted: false });
  expect(flush).toHaveBeenCalledTimes(1);
  expect(teardown).toHaveBeenCalledTimes(1);
});
