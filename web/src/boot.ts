import { byId, show } from './dom';
import type { HealthSnapshot } from './types';

// Audit C18. boot() used to await a bare fetch with no catch, so a TypeError from an offline
// browser, a DNS hiccup or a front server that had not finished starting rejected the promise,
// `void boot()` swallowed it, and nothing after that await ran. Every screen partial starts hidden
// and the show/hide wiring only fires inside state.onChange, so the page was genuinely blank with
// nothing in the console. createBoot below catches everything and showBootError paints it.
// Everything here takes its dependencies as arguments because web/src/main.ts calls byId()
// fourteen times at module scope and cannot be imported under jsdom.

export interface HealthWatcherDeps {
  health: () => Promise<HealthSnapshot>;
  onSnapshot(h: HealthSnapshot | null): void;
  onCountdown(down: boolean, secs: number): void;
  intervalMs?: number;
}

export interface HealthWatcher {
  start(): void;
  stop(): void;
  /** One poll. Public so a test can drive it without timers, and so start() can poll at once. */
  tick(): Promise<void>;
}

const COUNTDOWN_FROM = 10;

export function createHealthWatcher(deps: HealthWatcherDeps): HealthWatcher {
  const intervalMs = deps.intervalMs ?? 1000;
  let timer: ReturnType<typeof setInterval> | null = null;
  // An in-flight guard, and not because /api/health is slow when the engine is down: it is not.
  // server/src/health.ts probes the engine on its own 10-second interval with a 3-second timeout
  // and server/src/index.ts returns the cached snapshot synchronously, so an engine outage answers
  // instantly. The pile-up case is a hung or overloaded FRONT server, where a 1-second interval
  // stacks requests until the browser's connection pool is the only thing throttling them.
  let inFlight = false;
  // stop() has to stop the callbacks of a request that is ALREADY in flight, not only the next
  // tick. Clearing the interval leaves a tick that is awaiting deps.health() free to reach
  // onSnapshot and onCountdown afterwards, and web/src/main.ts writes the frame singletons, the
  // home player count and the offline card from those, i.e. state written after the pagehide
  // teardown ran. Nothing is aborted: the reply is simply dropped when it lands.
  let stopped = false;
  let secs = COUNTDOWN_FROM;

  async function tick(): Promise<void> {
    if (inFlight) return;
    inFlight = true;
    try {
      const h = await deps.health().catch(() => null);
      if (stopped) return;
      deps.onSnapshot(h);
      const down = h === null || h.engine === 'down';
      if (down) secs = secs <= 1 ? COUNTDOWN_FROM : secs - 1;
      deps.onCountdown(down, secs);
    } finally {
      inFlight = false;
    }
  }

  return {
    start() {
      if (timer) return;
      stopped = false;
      void tick();
      timer = setInterval(() => { void tick(); }, intervalMs);
    },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
    },
    tick
  };
}

export interface BootDeps {
  watcher: HealthWatcher;
  enterApp(): void;
  onBootError(message: string): void;
}

export function createBoot(deps: BootDeps): { run(): Promise<void> } {
  return {
    async run() {
      try {
        deps.watcher.start();
        deps.enterApp();
      } catch (err) {
        // Nothing here may reject. A blank page with nothing in the console is the defect.
        deps.onBootError(err instanceof Error ? err.message : String(err));
      }
    }
  };
}

/**
 * The only visible failure surface a boot error has.
 *
 * Every screen partial starts hidden, is shown only by the app state, and #offline-card lives
 * inside #screen-frame, so none of them can paint a failure that happens before the home screen
 * does. web/src/partials/boot.html is a screen of its own for exactly this: every other `.screen`
 * is hidden, so a half-painted home screen cannot sit on top of the message, and #boot-error is
 * the error alert inside it.
 *
 * This lives here rather than in main.ts only so it can be tested: main.ts calls byId() fourteen
 * times at module scope and cannot be imported under jsdom.
 */
export function showBootError(message: string): void {
  for (const screen of document.querySelectorAll<HTMLElement>('.screen')) screen.classList.add('hidden');
  byId('boot-error').textContent = `Could not start: ${message}. Reload the page.`;
  show('screen-boot');
}

/**
 * The pagehide teardown, out here rather than inline in web/src/main.ts so that a test can drive it:
 * main.ts calls byId() fourteen times at module scope and cannot be imported under jsdom.
 *
 * pagehide is not always the last event a page sees. With `persisted: true` the document is being
 * frozen into the back/forward cache and is resumed on a later pageshow rather than discarded, so
 * clearing the fps interval and stopping the health poll there would leave a page restored by a Back
 * navigation with both timers dead and nothing to re-arm them. Frozen timers resume on their own, so
 * skipping the teardown is the whole fix. The flush stays unconditional: a frozen document can be
 * evicted without any further event, and flushing an already-flushed store is a no-op.
 */
export function createPageHideHandler(deps: { teardown(): void; flush(): void }): (e: { persisted: boolean }) => void {
  return e => {
    deps.flush();
    if (!e.persisted) deps.teardown();
  };
}
