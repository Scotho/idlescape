// The Transport for a client running in this document: hook calls in, hook events out.
// Nothing above this file knows the client is local (SP7 swaps in an iframe transport).
import type { ChatColour, ClientHooks } from '../clientTypes';
import type { ActionResult, BotAction, HookEvent, Transport, Unsub, WorldState } from './types';

/**
 * A local transport holds listeners on the client's hooks and on the game canvas, so it has
 * to be able to let go of both: SP7 builds one of these per character iframe and disposes it
 * when the iframe goes away.
 */
export interface LocalTransport extends Transport {
  /** Removes every hook subscription and canvas listener. Safe to call more than once. */
  dispose(): void;
}

/** Hook events forwarded verbatim to `onEvent`. `state` drives `onState` instead. */
const EVENTS = ['login', 'logout', 'disconnect', 'xp', 'inventory', 'chat', 'tick', 'action'] as const;

const DEFAULT_TIMEOUT_MS = 10_000;

/** The shell's pause key. Never human input; see `onHuman`. */
const PAUSE_KEY = 'Escape';

/** A login that blew up is a failed attempt, never a rejection: the ladder reads `ok`. */
const loginFailed = (e: unknown): { ok: boolean; reason: string } =>
  ({ ok: false, reason: e instanceof Error ? e.message : String(e) });

/**
 * @param hooks   `window.idlescape.client`, the hooks v2 surface.
 * @param canvas  Accessor rather than an element: the canvas is `#canvas` in this
 *                document today and moves into an iframe in SP7, and it may not
 *                exist yet when the transport is built.
 * @param opts    `relogin` is the session manager's login for this character (SP7). It is
 *                optional only because a transport can be built without one; when it is
 *                there it is the right one, because the manager owns the login flow.
 */
export function createLocalTransport(
  hooks: ClientHooks,
  canvas: () => HTMLCanvasElement | null,
  opts: { relogin?(): Promise<{ ok: boolean; reason?: string }> } = {}
): LocalTransport {
  // Every dispatch this transport is still waiting on. `cancel` settles them; a normal reply
  // removes its own entry, so the set only ever holds work that is genuinely in flight.
  const waiting = new Set<(r: ActionResult) => void>();
  let latest: WorldState | null = null;
  const stateSubs = new Set<(s: WorldState) => void>();
  const eventSubs = new Set<(e: HookEvent) => void>();
  const humanSubs = new Set<() => void>();

  const offHooks: Unsub[] = [hooks.on('state', () => {
    latest = safeState();
    wireHuman();
    if (!latest) return;
    for (const cb of stateSubs) cb(latest);
  })];
  for (const name of EVENTS) {
    offHooks.push(hooks.on(name, payload => {
      for (const cb of eventSubs) cb({ name, payload } as HookEvent);
    }));
  }

  // jsdom reports `isTrusted: false` for dispatched events, so tests opt out with an
  // explicit `synthetic` marker instead. In production the executor drives the game
  // through packets, never DOM events, so every event here is a real person.
  //
  // Escape is the exception, and it is not gameplay input at all: it is the shell's pause key,
  // handled by the run banner on the parent document and forwarded out of the client iframe by
  // the stage (`frame/copilotBar.ts`, `frame/stage.ts` forwardEscape). Counting it here would
  // pause the run with reason `human-input` first, which auto-resumes after the quiet period,
  // and the hard `player` pause the player actually asked for would never land.
  const onHuman = (ev: Event): void => {
    if ((ev as KeyboardEvent).key === PAUSE_KEY) return;
    if (ev.isTrusted || (ev as { synthetic?: boolean }).synthetic !== true) {
      for (const cb of humanSubs) cb();
    }
  };
  let humanWired: HTMLCanvasElement | null = null;
  const wireHuman = (): void => {
    const c = canvas();
    if (!c || c === humanWired) return;
    humanWired = c;
    c.addEventListener('mousedown', onHuman);
    c.addEventListener('keydown', onHuman);
  };

  return {
    getState: () => latest ?? (latest = safeState()),
    onState: cb => { stateSubs.add(cb); return () => { stateSubs.delete(cb); }; },
    onEvent: cb => { eventSubs.add(cb); return () => { eventSubs.delete(cb); }; },
    dispatch: (action: BotAction, timeoutMs = DEFAULT_TIMEOUT_MS) =>
      withTimeout(hooks.dispatch(action), timeoutMs, waiting),
    cancel(): void {
      // A client bundle older than this hook is a real possibility (a frame that was already
      // open across a deploy), and a cancel that throws would take the abort path down with it.
      try { hooks.cancelAll(); } catch { /* older client: the settles below still apply */ }
      for (const settle of [...waiting]) settle({ success: false, message: 'cancelled', reason: 'cancelled' });
      waiting.clear();
    },
    // Through `withTimeout` like `dispatch`, not straight at the hook: `say` is a dispatch by
    // another name, and a `say` outside `waiting` would be one in-flight action `cancel` could
    // not settle - and one with no timeout of its own.
    say: text => withTimeout(hooks.dispatch({ type: 'say', message: text, reason: 'transport' }), DEFAULT_TIMEOUT_MS, waiting),
    echo: (text: string, colour: ChatColour = 'orange') => { hooks.echoChat(text, colour); },
    relogin: () => {
      // The whole call is wrapped, not just the promise: a synchronous throw from either branch
      // would escape a bare `.catch` and reject out of the transport, which aborts the recovery
      // task instead of letting the ladder see one failed attempt.
      try {
        return (opts.relogin
          ? opts.relogin()
          // Without the session manager the client's own armed credentials are still the right
          // fallback: SP7 arms them on every session it opens. It is only a fallback because
          // `loginArmed()` against a client that is already in game never settles - the title
          // screen it resolves from is gone - and only the manager knows that.
          : hooks.loginArmed().then(r => (r.ok ? { ok: true } : { ok: false, reason: r.reason })))
          .catch(loginFailed);
      } catch (e) {
        return Promise.resolve(loginFailed(e));
      }
    },
    // Fire and forget, and swallowing is right here: a client bundle older than this hook, or a
    // frame that has already gone, must not take the ending down with it. The run is over either
    // way - the ladder has already decided to fail it with `logged_out`.
    logout: () => {
      try { hooks.logout(); } catch { /* older client, or a frame that is already gone */ }
    },
    screenshot: () => new Promise<Blob>((resolve, reject) => {
      const c = canvas();
      if (!c) { reject(new Error('no canvas')); return; }
      c.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
    }),
    humanInput: (cb): Unsub => { wireHuman(); humanSubs.add(cb); return () => { humanSubs.delete(cb); }; },
    dispose(): void {
      while (offHooks.length) offHooks.pop()?.();
      humanWired?.removeEventListener('mousedown', onHuman);
      humanWired?.removeEventListener('keydown', onHuman);
      humanWired = null;
      // A dispatch or a say still in flight when the session's tab closes has nobody left to
      // answer it: the hooks went with the frame. Settle each one before dropping the set, or
      // the promise `workerHost.answerRpc` is awaiting never resolves and the Worker's RPC
      // waits out its own timeout against a transport that no longer exists.
      for (const settle of [...waiting]) settle({ success: false, message: 'transport disposed', reason: 'disposed' });
      waiting.clear();
      stateSubs.clear();
      eventSubs.clear();
      humanSubs.clear();
    }
  };

  // The client throws before the first world state exists; a transport with no state
  // is a normal pre-login condition, not an error the caller should have to handle.
  function safeState(): WorldState | null {
    try {
      return hooks.getWorldState();
    } catch {
      return null;
    }
  }
}

function withTimeout(p: Promise<ActionResult>, ms: number, waiting: Set<(r: ActionResult) => void>): Promise<ActionResult> {
  return new Promise(resolve => {
    let settled = false;
    const done = (r: ActionResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      waiting.delete(done);
      resolve(r);
    };
    const t = setTimeout(() => done({ success: false, message: `action timed out after ${ms}ms`, reason: 'timeout' }), ms);
    waiting.add(done);
    p.then(r => done(r), e => done({ success: false, message: String(e), reason: 'error' }));
  });
}
