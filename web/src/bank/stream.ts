// web/src/bank/stream.ts -- live bank version updates over SSE.
//
// EventSource cannot carry an Authorization header and /api/bank/events is human-only behind a
// Firebase bearer, so the stream is read through fetch and the frames are parsed here. The
// engine's change hook, which feeds that route, guarantees neither delivery nor ordering and is
// silent altogether in a world with no IDLESCAPE_HOOK_URL: this module is an accelerator, and
// `healthy()` is how the store knows whether it may relax its own polling.

export interface BankStream { start(): void; stop(): void; healthy(): boolean }

export interface BankStreamDeps {
  idToken(): Promise<string>;
  onVersion(version: number): void;
  onHealth(healthy: boolean): void;
  fetchImpl?: typeof fetch;
  /** Timer seams so the tests never wait on a real clock. */
  schedule?: (fn: () => void, ms: number) => number;
  cancel?: (handle: number) => void;
}

export const STREAM_PATH = '/api/bank/events';
/** The server pings every 15 s; silence past this is a dead connection. */
export const WATCHDOG_MS = 40_000;
export const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000];
/** How long a connection must survive before it counts as a success worth resetting the ladder. */
export const STABLE_MS = 30_000;

/** An unterminated frame past this is a peer that is never going to finish one. */
const MAX_BUFFER = 64 * 1024;
/**
 * SSE ends a line with CRLF, LF or a bare CR, and ends an event on a blank line. The bare-CR
 * alternative refuses a CR that has an LF after it, so the two halves of one CRLF are never read
 * as two empty lines.
 */
const FRAME_END = /(?:\r\n|\r(?!\n)|\n)(?:\r\n|\r(?!\n)|\n)/;
const LINE_END = /\r\n|\r|\n/;

/** Where the blank line ending the first complete frame in `buffer` sits, or null if none does. */
function frameEnd(buffer: string): { at: number; len: number } | null {
  // A trailing CR may be the first half of a CRLF still in flight, so it never ends a scan.
  const scan = buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer;
  const match = FRAME_END.exec(scan);
  return match === null ? null : { at: match.index, len: match[0].length };
}

export function createBankStream(deps: BankStreamDeps): BankStream {
  const call = deps.fetchImpl ?? fetch;
  const schedule = deps.schedule ?? ((fn, ms) => window.setTimeout(fn, ms));
  const cancel = deps.cancel ?? (handle => window.clearTimeout(handle));

  let running = false;
  let live = false;
  let attempt = 0;
  let retry: number | null = null;
  let watchdog: number | null = null;
  let stable: number | null = null;
  let abort: AbortController | null = null;
  // Every connect() attempt takes a ticket, and stop() and the next connect() both move the
  // counter on. An attempt whose abort rejection only lands a microtask later can then tell that
  // it is no longer the current one. Without it a same-tick stop(); start() (exactly what a React
  // effect cleanup-and-rerun on a token or account change produces) lets the dead attempt's tail
  // schedule a retry over the live connection, which then loses its controller and its watchdog
  // and runs forever, holding one of the server's four subscriber slots for the life of the page.
  let generation = 0;

  function setHealth(next: boolean): void {
    if (live === next) return;
    live = next;
    deps.onHealth(next);
  }

  /** The two timers that belong to one connection, as opposed to the retry between connections. */
  function clearConnectionTimers(): void {
    if (watchdog !== null) { cancel(watchdog); watchdog = null; }
    if (stable !== null) { cancel(stable); stable = null; }
  }

  function clearTimers(): void {
    if (retry !== null) { cancel(retry); retry = null; }
    clearConnectionTimers();
  }

  /** Any byte at all resets it; only armed once bytes could actually be flowing. */
  function armWatchdog(gen: number, controller: AbortController): void {
    if (gen !== generation) return;
    if (watchdog !== null) cancel(watchdog);
    watchdog = schedule(() => {
      if (gen !== generation) return;
      watchdog = null;
      controller.abort();
    }, WATCHDOG_MS);
  }

  /**
   * The ladder resets on a connection that has survived, never on its first byte: a proxy that
   * accepts, pings once and closes, or an engine restarting in a loop, would otherwise hold the
   * backoff at its first rung forever and get one request per second per tab.
   */
  function armStable(gen: number): void {
    if (gen !== generation) return;
    if (stable !== null) cancel(stable);
    stable = schedule(() => {
      if (gen !== generation) return;
      stable = null;
      attempt = 0;
    }, STABLE_MS);
  }

  function scheduleRetry(gen: number): void {
    if (gen !== generation) return;
    setHealth(false);
    if (!running || retry !== null) return;
    const ms = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    attempt++;
    retry = schedule(() => { retry = null; if (gen === generation) void connect(); }, ms);
  }

  /** One SSE frame: the `data:` lines of a `version` event, or nothing worth reporting. */
  function handleFrame(frame: string): void {
    const data: string[] = [];
    let event = '';
    for (const line of frame.split(LINE_END)) {
      if (line.startsWith(':')) continue; // a comment, which is how the server keeps proxies open
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      const raw = colon < 0 ? '' : line.slice(colon + 1);
      // The spec strips one optional space after the colon and nothing else, so `event:version`
      // and `event: version` are the same field and neither is a special case here.
      const value = raw.startsWith(' ') ? raw.slice(1) : raw;
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
    if (event !== 'version' || data.length === 0) return;
    try {
      const parsed = JSON.parse(data.join('\n')) as { version?: unknown };
      if (typeof parsed.version === 'number' && Number.isInteger(parsed.version)) deps.onVersion(parsed.version);
    } catch { /* a truncated or malformed frame is dropped; the store polls anyway */ }
  }

  async function connect(): Promise<void> {
    if (!running) return;
    const gen = ++generation;
    const controller = new AbortController();
    abort = controller;
    // stop() and the watchdog both act only through this controller. A mocked, or otherwise
    // inert, response body will never reject its reader on its own just because the request's
    // AbortSignal fired, so every wait below is raced against this rejection by hand.
    const aborted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener(
        'abort',
        () => reject(new DOMException('bank stream aborted', 'AbortError')),
        { once: true }
      );
    });
    // The race below is this promise's first real handler, and it is not built until idToken()
    // has resolved, so a stop() inside that window would reject with nobody listening: an
    // unhandledrejection on every unmount that races a Firebase token refresh.
    void aborted.catch(() => {});
    try {
      const res = await Promise.race([
        call(STREAM_PATH, {
          headers: { authorization: `Bearer ${await deps.idToken()}`, accept: 'text/event-stream' },
          credentials: 'same-origin',
          signal: controller.signal
        }),
        aborted
      ]);
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        // Only now, with a body actually in flight, does silence mean anything: arming the
        // watchdog before this point would fire against a slow-but-healthy connect handshake, or
        // linger on a request that was refused outright and is already on its own backoff. The
        // stability timer starts here too, because a route that answers 200 and then dies
        // immediately must not reset the backoff.
        armWatchdog(gen, controller);
        armStable(gen);
        try {
          for (;;) {
            const { value, done } = await Promise.race([reader.read(), aborted]);
            // A stop(), or a restart, between a read being issued and it resolving makes this
            // attempt a ghost: it reports nothing more and touches no shared timer.
            if (done || gen !== generation) break;
            armWatchdog(gen, controller);
            setHealth(true);
            buffer += decoder.decode(value, { stream: true });
            for (let end = frameEnd(buffer); end !== null; end = frameEnd(buffer)) {
              handleFrame(buffer.slice(0, end.at));
              buffer = buffer.slice(end.at + end.len);
            }
            // Bytes with no frame boundary in them keep re-arming the watchdog while the buffer
            // grows without bound. Our own server always terminates its frames, so past this cap
            // the peer is faulty: drop the connection onto the normal backoff path.
            if (buffer.length > MAX_BUFFER) break;
          }
        } finally {
          // A watchdog-triggered abort means the reader will never resolve on its own; release it
          // rather than leaving it locked. Never let this throw out of a finally.
          void reader.cancel().catch(() => {});
        }
      }
    } catch { /* aborted, refused, or the socket dropped mid-stream: all three are a reconnect */ }
    // Whatever ended this attempt, the controller to close is the one it captured. Reaching for
    // the shared `abort` here would tear down a newer connection that has already replaced it.
    controller.abort();
    if (abort === controller) abort = null;
    if (gen !== generation) return;
    clearConnectionTimers();
    scheduleRetry(gen);
  }

  return {
    start() {
      if (running) return;
      running = true;
      attempt = 0;
      void connect();
    },
    stop() {
      running = false;
      // Retiring the generation is what makes stop() actually stop: any attempt still suspended
      // on a read or on a token fetch is now stale and will report nothing when it wakes.
      generation++;
      clearTimers();
      abort?.abort();
      abort = null;
      setHealth(false);
    },
    healthy: () => live
  };
}
