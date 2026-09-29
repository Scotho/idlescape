import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { clientState, createFirstCharacter, openHome, openPanel, pressTitleLogin, sessionStates, signUp, uniqueName } from './helpers';

// SP7 measurements (spec section 5; phase-a open questions 2 and 6). Opt in with
//   E2E_MEASURE=1 npx playwright test e2e/measure.pw.test.ts
// The throttling cases deliberately idle for minutes, so they are never part of the default run.
test.skip(!process.env.E2E_MEASURE, 'set E2E_MEASURE=1 to run the SP7 measurements');
test.describe.configure({ mode: 'serial', timeout: 900_000 });

const OUT = 'test-results/sp7-measurements.json';
const results: Record<string, unknown> = {};

function record(key: string, value: unknown): void {
  results[key] = value;
  mkdirSync('test-results', { recursive: true });
  writeFileSync(OUT, JSON.stringify(results, null, 2));
}

/** How long each idle case runs. Overridable so the plumbing can be smoke-tested in seconds. */
const IDLE_MS = Number(process.env.E2E_IDLE_MS ?? 390_000); // > 5 min, past Chromium's intensive-throttling threshold
/** The engine forces a logout after 100 ticks without a packet (`World.ts` TIMEOUT_NO_RESPONSE). */
const ENGINE_NO_RESPONSE_MS = 60_000;

/**
 * `uniqueName`'s token is fixed per worker process, so every test in this file would otherwise
 * ask for the same three names and the second one would be told the name is taken.
 */
let characterSeq = 0;

/**
 * Opens `count` characters on one page and logs each of them in, calling `onOpened` once every
 * character is live. Returns their names.
 */
async function openCharacters(page: Page, count: number, onOpened?: (live: number) => Promise<void>): Promise<string[]> {
  const names = Array.from({ length: count }, () => uniqueName(`m${characterSeq++}_`));
  await openHome(page);
  await signUp(page, 'Measure');
  await createFirstCharacter(page, names[0]);
  await expect.poll(async () => (await sessionStates(page)).some(s => s.loggedIn), { timeout: 90_000 }).toBe(true);
  await expect.poll(async () => (await clientState(page)).sceneReady, { timeout: 180_000 }).toBe(true);
  await onOpened?.(1);
  for (const name of names.slice(1)) {
    const live = names.indexOf(name) + 1;
    await openPanel(page, 'account');
    await page.locator('#char-panel-name').fill(name);
    await page.locator('#char-panel-create button[type="submit"]').click();
    await expect(page.locator(`[data-char-row]:has-text("${name}")`)).toBeVisible({ timeout: 15_000 });
    await page.locator(`#character-tabs [data-char-tab]:has-text("${name}")`).click();
    // Both polls have to pass before the click below, or it would land on the previous
    // character's canvas: its frame stays in front until the new session boots (see tabs spec).
    await expect.poll(async () => (await sessionStates(page)).length, { timeout: 60_000 }).toBe(live);
    await expect.poll(async () => (await clientState(page)).loggedIn, { timeout: 60_000 }).toBe(false);
    await pressTitleLogin(page);
    await expect.poll(async () => (await sessionStates(page)).filter(s => s.loggedIn).length, { timeout: 90_000 }).toBe(live);
    await expect.poll(async () => (await clientState(page)).sceneReady, { timeout: 180_000 }).toBe(true);
    await onOpened?.(live);
  }
  return names;
}

/**
 * Clamps every client iframe's `setTimeout` to one wake per `periodMs`, aligned on a shared grid,
 * which is what Chromium's background-tab throttling does to a hidden page: 1 Hz once hidden and,
 * after five minutes, one aligned wake per minute. Pass `null` to restore the real timer.
 *
 * This models the throttle rather than triggering it, because Playwright cannot produce a hidden
 * page: it enables Chromium's focus emulation on every page it opens, so `document.visibilityState`
 * stays `visible` for a backgrounded tab and no throttling is ever applied. The same Chromium build
 * driven without Playwright does report `hidden` and does throttle (see the recorded document).
 * The client's loop is `setTimeout`-driven end to end (`GameShell.run` awaits `sleep()`, which is
 * `setTimeout`), so clamping that one function reproduces the wake rate the throttle imposes.
 */
async function clampFrameTimers(page: Page, periodMs: number | null): Promise<void> {
  await page.evaluate(period => {
    type Clamped = Window & { __realSetTimeout?: typeof window.setTimeout; __wakes?: number };
    for (const frame of Array.from(document.querySelectorAll<HTMLIFrameElement>('#client-frames iframe'))) {
      const w = frame.contentWindow as Clamped | null;
      if (!w) continue;
      if (period === null) {
        if (w.__realSetTimeout) w.setTimeout = w.__realSetTimeout;
        continue;
      }
      w.__realSetTimeout ??= w.setTimeout.bind(w) as typeof window.setTimeout;
      const real = w.__realSetTimeout;
      w.__wakes = 0;
      w.setTimeout = ((handler: TimerHandler, ms?: number, ...rest: unknown[]) => {
        const wait = Math.max(ms ?? 0, period - (Date.now() % period));
        return real(
          (...args: unknown[]) => {
            w.__wakes = (w.__wakes ?? 0) + 1;
            if (typeof handler === 'function') handler(...args);
          },
          wait,
          ...rest
        );
      }) as typeof window.setTimeout;
    }
  }, periodMs);
}

/**
 * Counts game-loop iterations per frame. One `tick` event is emitted per `mainloop()`, which is
 * one pass of the loop that sends the keepalive, so this is the number the engine cares about.
 */
async function installLoopCounters(page: Page, expected: number): Promise<void> {
  const attached = await page.evaluate(() => {
    type Counted = Window & {
      __ticks?: number;
      __maxLoopGapMs?: number;
      idlescape?: { client?: { on(event: string, cb: () => void): unknown } | null };
    };
    let attachedTo = 0;
    for (const frame of Array.from(document.querySelectorAll<HTMLIFrameElement>('#client-frames iframe'))) {
      const w = frame.contentWindow as Counted | null;
      if (!w?.idlescape?.client) continue;
      attachedTo++;
      w.__ticks = 0;
      w.__maxLoopGapMs = 0;
      let last = w.performance.now();
      w.idlescape.client.on('tick', () => {
        const now = w.performance.now();
        w.__ticks = (w.__ticks ?? 0) + 1;
        w.__maxLoopGapMs = Math.max(w.__maxLoopGapMs ?? 0, now - last);
        last = now;
      });
    }
    return attachedTo;
  });
  // A frame whose hooks were missing is skipped silently above, and `frameCounters` reports -1
  // for it. Without this the run would be recorded as if it had measured three live clients.
  expect(attached, 'loop counters attached to every client frame').toBe(expected);
}

/** Clamp wakes served, loop iterations run, and the longest stall, per frame. */
function frameCounters(page: Page): Promise<{ wakes: number[]; loops: number[]; maxGaps: number[] }> {
  return page.evaluate(() => {
    const frames = Array.from(document.querySelectorAll<HTMLIFrameElement>('#client-frames iframe'));
    const read = (f: HTMLIFrameElement) => f.contentWindow as (Window & { __wakes?: number; __ticks?: number; __maxLoopGapMs?: number }) | null;
    return {
      wakes: frames.map(f => read(f)?.__wakes ?? -1),
      loops: frames.map(f => read(f)?.__ticks ?? -1),
      maxGaps: frames.map(f => Math.round(read(f)?.__maxLoopGapMs ?? -1))
    };
  });
}

/** The engine's own view of who is in the world, straight off its management gauge. */
async function enginePlayers(page: Page): Promise<number | null> {
  const base = process.env.E2E_ENGINE_MANAGEMENT ?? 'http://localhost:8897';
  const text = await page.request.get(`${base}/prometheus`).then(r => r.text()).catch(() => null);
  const m = text?.match(/^lostcity_active_players(?:\{[^}]*\})?\s+(\d+(?:\.\d+)?)/m);
  return m ? Math.round(Number(m[1])) : null;
}

/**
 * Runs three live clients for `IDLE_MS` with their timers clamped to `periodMs` (or unclamped when
 * null), polling once a tick-ish so the first logout is timestamped rather than merely counted.
 */
async function measureIdle(page: Page, label: string, periodMs: number | null): Promise<void> {
  const names = await openCharacters(page, 3);
  const before = await sessionStates(page);
  const playersBefore = await enginePlayers(page);
  await installLoopCounters(page, names.length);
  await clampFrameTimers(page, periodMs);

  const startedAt = Date.now();
  const firstLogoutMs: Record<string, number> = {};
  while (Date.now() - startedAt < IDLE_MS) {
    await page.waitForTimeout(5_000);
    for (const s of await sessionStates(page)) {
      if (!s.loggedIn && firstLogoutMs[s.character] === undefined) firstLogoutMs[s.character] = Date.now() - startedAt;
    }
  }
  const counters = await frameCounters(page);
  const after = await sessionStates(page);
  const playersAfter = await enginePlayers(page);
  await clampFrameTimers(page, null);

  record(label, {
    timerPeriodMs: periodMs,
    idleMs: Date.now() - startedAt,
    characters: names,
    // Playwright's focus emulation keeps this 'visible' whatever the tab is doing; recorded so the
    // reader can see the clamp is a model of throttling, not throttling itself.
    visibilityState: await page.evaluate(() => document.visibilityState),
    engineNoResponseTimeoutMs: ENGINE_NO_RESPONSE_MS,
    clampWakesPerFrame: counters.wakes,
    loopIterationsPerFrame: counters.loops,
    loopIterationsPerMinutePerFrame: counters.loops.map(n => Number((n / ((Date.now() - startedAt) / 60_000)).toFixed(2))),
    // The longest the loop went without a pass, so the longest possible gap between keepalives.
    maxLoopGapMsPerFrame: counters.maxGaps,
    before,
    sessions: after,
    survived: after.filter(s => s.loggedIn).length,
    firstLogoutMs,
    enginePlayers: { before: playersBefore, after: playersAfter }
  });
}

test('three unthrottled clients idle past the engine 60s no-response timeout', async ({ page }) => {
  // Control: at the client's own wake rate the keepalive goes out every second and nothing drops.
  await measureIdle(page, 'throttling.unthrottled', null);
  expect((results['throttling.unthrottled'] as { survived: number }).survived).toBe(3);
});

test('three clients at one wake per second (Chromium hidden-tab throttling)', async ({ page }) => {
  // The regime a hidden tab is in for its first five minutes. The client sends NO_TIMEOUT whenever
  // more than a second has passed (Client.ts gameLoop), so one wake per second should be enough.
  await measureIdle(page, 'throttling.oneHz', 1_000);
  const row = results['throttling.oneHz'] as { survived: number; maxLoopGapMsPerFrame: number[] };
  expect(Math.max(...row.maxLoopGapMsPerFrame)).toBeGreaterThan(900); // the clamp really bit
  expect(row.survived).toBe(3);
});

test('three clients at one wake per minute (Chromium intensive throttling)', async ({ page }) => {
  // The regime a hidden tab enters after five minutes. One keepalive per 60 s against a 60 s
  // no-response timeout is the case the feasibility audit flagged; whatever this records is the
  // evidence for or against the mitigations it proposed (audio keepalive, or a worker keepalive).
  await measureIdle(page, 'throttling.intensive', 60_000);
  // Survival is deliberately not gated: at this wake rate the keepalive gap equals the engine's
  // timeout, so the outcome is a race and the recorded number is the finding. What is asserted is
  // that the clamp really did starve the loop, so a survival here means something.
  const row = results['throttling.intensive'] as { survived: number; maxLoopGapMsPerFrame: number[] };
  expect(row.maxLoopGapMsPerFrame).toHaveLength(3);
  // Only meaningful once the window holds at least two wakes; a shortened smoke run holds none.
  if (IDLE_MS >= 2 * 60_000) expect(Math.max(...row.maxLoopGapMsPerFrame)).toBeGreaterThan(ENGINE_NO_RESPONSE_MS * 0.9);
});

test('memory for one, two and three live clients', async ({ page, browser, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const browserCdp = await browser.newBrowserCDPSession();

  async function sample(label: string): Promise<Record<string, number>> {
    const metrics = await cdp.send('Performance.getMetrics');
    const heap = Object.fromEntries(metrics.metrics.filter(m => m.name === 'JSHeapUsedSize' || m.name === 'JSHeapTotalSize').map(m => [m.name, m.value]));
    let rendererCpuTime: number | null = null;
    try {
      // Not implemented in every Chromium build; the heap numbers are the load-bearing figure.
      const processes = await browserCdp.send('SystemInfo.getProcessInfo');
      rendererCpuTime = processes.processInfo.filter(p => p.type === 'renderer').reduce((sum, p) => sum + p.cpuTime, 0);
    } catch {
      rendererCpuTime = null;
    }
    const row = { ...heap, ...(rendererCpuTime === null ? {} : { rendererCpuTime }) };
    record(`memory.${label}`, row);
    return row;
  }

  await sample('0-before-any-session');
  // One sample per additional client, taken once that client has a built scene.
  await openCharacters(page, 3, async live => { await sample(`${live}-clients`); });

  const three = results['memory.3-clients'] as Record<string, number>;
  const zero = results['memory.0-before-any-session'] as Record<string, number>;
  record('memory.summary', {
    perClientHeapBytes: Math.round((three.JSHeapUsedSize - zero.JSHeapUsedSize) / 3),
    totalHeapBytes: three.JSHeapUsedSize
  });

  // A ceiling, not a target: three 274 clients in one renderer must stay usable on a laptop.
  expect(three.JSHeapUsedSize).toBeLessThan(1_500_000_000);
});
