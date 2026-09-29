// web/src/bank/stream.test.ts
import { describe, expect, it } from 'vitest';
import { BACKOFF_MS, STABLE_MS, STREAM_PATH, WATCHDOG_MS, createBankStream } from './stream';

/** A timer queue the test drives by hand. */
function timers() {
  const pending = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  return {
    schedule: (fn: () => void, ms: number) => { const id = next++; pending.set(id, { fn, ms }); return id; },
    cancel: (id: number) => { pending.delete(id); },
    /** Fires every timer whose delay equals `ms`, newest last. */
    fire(ms: number): void {
      for (const [id, entry] of [...pending]) if (entry.ms === ms) { pending.delete(id); entry.fn(); }
    },
    delays: () => [...pending.values()].map(t => t.ms)
  };
}

/**
 * One controllable SSE body per connection, plus the requests that asked for one. `cancelled` and
 * `aborted` are indexed by request, so a test can see whether a connection was really torn down or
 * merely forgotten about: without them nothing here can tell a live stream from an orphaned one.
 */
function sse() {
  const pushes: (((text: string) => void) | undefined)[] = [];
  const closes: ((() => void) | undefined)[] = [];
  const requests: { url: string; init: RequestInit }[] = [];
  const cancelled: boolean[] = [];
  const aborted: boolean[] = [];
  let latest = -1;
  let failNext: number | null = null;
  const impl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const index = requests.length;
    requests.push({ url: String(input), init });
    cancelled.push(false);
    aborted.push(false);
    const signal = init.signal;
    if (signal) {
      if (signal.aborted) aborted[index] = true;
      else signal.addEventListener('abort', () => { aborted[index] = true; }, { once: true });
    }
    if (failNext !== null) { const status = failNext; failNext = null; return new Response('no', { status }); }
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        latest = index;
        pushes[index] = text => controller.enqueue(new TextEncoder().encode(text));
        closes[index] = () => controller.close();
      },
      cancel() { cancelled[index] = true; }
    });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }) as unknown as typeof fetch;
  return {
    impl,
    requests,
    cancelled,
    aborted,
    push: (text: string) => pushes[latest]?.(text),
    close: () => closes[latest]?.(),
    /** Pushing into a body whose reader is already gone throws, and that is a passing outcome. */
    pushAt: (i: number, text: string) => { try { pushes[i]?.(text); } catch { /* reader released */ } },
    /** True once a connection can no longer deliver anything: torn down from either end. */
    dead: (i: number) => cancelled[i] || aborted[i],
    failNextWith: (status: number) => { failNext = status; }
  };
}

/** Lets every pending microtask and the reader loop run. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function harness(over: Partial<Parameters<typeof createBankStream>[0]> = {}) {
  const clock = timers();
  const wire = sse();
  const versions: number[] = [];
  const health: boolean[] = [];
  const stream = createBankStream({
    idToken: async () => 'TOKEN',
    onVersion: v => versions.push(v),
    onHealth: h => health.push(h),
    fetchImpl: wire.impl,
    schedule: clock.schedule,
    cancel: clock.cancel,
    ...over
  });
  return { stream, clock, wire, versions, health };
}

describe('createBankStream', () => {
  it('connects with the bearer and asks for an event stream', async () => {
    const { stream, wire } = harness();
    stream.start();
    await settle();
    expect(wire.requests[0].url).toBe(STREAM_PATH);
    const headers = wire.requests[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer TOKEN');
    expect(headers.accept).toBe('text/event-stream');
    stream.stop();
  });

  it('reports a version frame', async () => {
    const { stream, wire, versions, health } = harness();
    stream.start();
    await settle();
    wire.push(': open\nretry: 3000\n\n');
    wire.push('event: version\ndata: {"version":7}\n\n');
    await settle();
    expect(versions).toEqual([7]);
    expect(health[health.length - 1]).toBe(true);
    expect(stream.healthy()).toBe(true);
    stream.stop();
  });

  it('reassembles a frame split across two reads', async () => {
    const { stream, wire, versions } = harness();
    stream.start();
    await settle();
    wire.push('event: version\ndata: {"ver');
    await settle();
    expect(versions).toEqual([]);
    wire.push('sion":9}\n\n');
    await settle();
    expect(versions).toEqual([9]);
    stream.stop();
  });

  it('ignores comments, pings and frames it cannot parse', async () => {
    const { stream, wire, versions } = harness();
    stream.start();
    await settle();
    wire.push(': ping\n\nevent: version\ndata: not json\n\nevent: other\ndata: {"version":3}\n\n');
    await settle();
    expect(versions).toEqual([]);
    stream.stop();
  });

  it('goes unhealthy and retries with backoff when the connection closes', async () => {
    const { stream, wire, clock, health } = harness();
    stream.start();
    await settle();
    wire.push('event: version\ndata: {"version":1}\n\n');
    await settle();
    wire.close();
    await settle();
    expect(stream.healthy()).toBe(false);
    expect(health[health.length - 1]).toBe(false);
    expect(clock.delays()).toContain(BACKOFF_MS[0]);
    clock.fire(BACKOFF_MS[0]);
    await settle();
    expect(wire.requests).toHaveLength(2);
    stream.stop();
  });

  it('walks the backoff ladder on repeated refusals and never past its last rung', async () => {
    const { stream, wire, clock } = harness();
    for (const ms of [...BACKOFF_MS, BACKOFF_MS[BACKOFF_MS.length - 1]]) {
      wire.failNextWith(503);
      if (wire.requests.length === 0) stream.start(); else clock.fire(clock.delays()[0]);
      await settle();
      expect(clock.delays()).toContain(ms);
    }
    stream.stop();
  });

  it('reconnects when the watchdog expires with no bytes at all', async () => {
    const { stream, wire, clock } = harness();
    stream.start();
    await settle();
    expect(clock.delays()).toContain(WATCHDOG_MS);
    clock.fire(WATCHDOG_MS);
    await settle();
    expect(stream.healthy()).toBe(false);
    clock.fire(BACKOFF_MS[0]);
    await settle();
    expect(wire.requests).toHaveLength(2);
    stream.stop();
  });

  it('stop cancels the pending retry and opens nothing more', async () => {
    const { stream, wire, clock } = harness();
    stream.start();
    await settle();
    wire.close();
    await settle();
    stream.stop();
    expect(clock.delays()).toEqual([]);
    await settle();
    expect(wire.requests).toHaveLength(1);
  });

  it('start is idempotent: a second call does not open a second connection', async () => {
    const { stream, wire } = harness();
    stream.start();
    stream.start();
    await settle();
    expect(wire.requests).toHaveLength(1);
    stream.stop();
  });

  // A React effect cleanup-and-rerun (a token or account change) calls stop() and start() in the
  // same tick. The abort rejection stop() triggers only lands a microtask later, so the dead
  // attempt wakes up with a live connection already in place.
  it('a same-tick stop() then start() leaves exactly one live connection', async () => {
    const { stream, wire, clock } = harness();
    stream.start();
    await settle();
    wire.push('event: version\ndata: {"version":1}\n\n');
    await settle();

    stream.stop();
    stream.start();
    await settle();

    expect(wire.requests).toHaveLength(2);
    // The killed attempt released its reader and aborted its request; the new one did neither.
    expect([wire.cancelled[0], wire.aborted[0]]).toEqual([true, true]);
    expect(wire.dead(1)).toBe(false);
    // The dead attempt must not have queued a reconnect on top of the connection that replaced it.
    expect(clock.delays().filter(ms => BACKOFF_MS.includes(ms))).toEqual([]);
    // ...and the live connection still owns a watchdog of its own.
    expect(clock.delays()).toContain(WATCHDOG_MS);

    stream.stop();
    expect(wire.dead(1)).toBe(true);
    expect(clock.delays()).toEqual([]);
  });

  it('reports nothing after stop(), not even down a connection opened before it', async () => {
    const { stream, wire, versions, health, clock } = harness();
    stream.start();
    await settle();
    wire.push('event: version\ndata: {"version":1}\n\n');
    await settle();
    stream.stop();
    stream.start();
    await settle();
    // A retry queued by the attempt stop() killed opens a third connection here, and the second
    // one is then unreachable: nothing holds its controller and its watchdog has been cancelled.
    clock.fire(BACKOFF_MS[0]);
    await settle();
    stream.stop();
    await settle();

    expect(wire.requests).toHaveLength(2);
    for (let i = 0; i < wire.requests.length; i++) expect(wire.dead(i)).toBe(true);

    const seenVersions = versions.length;
    const seenHealth = health.length;
    for (let i = 0; i < wire.requests.length; i++) wire.pushAt(i, 'event: version\ndata: {"version":42}\n\n');
    await settle();

    expect(versions).toHaveLength(seenVersions);
    expect(health).toHaveLength(seenHealth);
    expect(stream.healthy()).toBe(false);
    expect(clock.delays()).toEqual([]);
  });

  it('leaves no unhandled rejection when stop() lands during the token fetch', async () => {
    let release: (token: string) => void = () => {};
    const { stream } = harness({ idToken: () => new Promise<string>(resolve => { release = resolve; }) });
    const seen: unknown[] = [];
    const onUnhandled = (reason: unknown): void => { seen.push(reason); };
    process.on('unhandledRejection', onUnhandled);
    try {
      stream.start();
      await settle();
      stream.stop();
      await settle();
      release('TOKEN');
      await settle();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(seen).toEqual([]);
  });

  it('escalates the ladder across short-lived connections and resets only once one survives', async () => {
    const { stream, wire, clock } = harness();
    // Three connections that answer 200, deliver a byte and then die: a byte alone is not success.
    stream.start();
    for (let i = 0; i < 3; i++) {
      if (i > 0) clock.fire(BACKOFF_MS[i - 1]);
      await settle();
      wire.push(': open\n\n');
      await settle();
      wire.close();
      await settle();
      expect(clock.delays()).toContain(BACKOFF_MS[i]);
    }
    clock.fire(BACKOFF_MS[2]);
    await settle();
    wire.push(': open\n\n');
    await settle();

    // This one lasts, so the ladder goes back to its first rung when it eventually drops.
    expect(clock.delays()).toContain(STABLE_MS);
    clock.fire(STABLE_MS);
    wire.close();
    await settle();
    expect(clock.delays()).toContain(BACKOFF_MS[0]);
    stream.stop();
  });

  it('accepts CRLF line endings and an event field with no space after the colon', async () => {
    const { stream, wire, versions } = harness();
    stream.start();
    await settle();
    wire.push(':open\r\n\r\nevent:version\r\ndata:{"version":11}\r\n\r\n');
    await settle();
    expect(versions).toEqual([11]);
    stream.stop();
  });

  it('joins continuation data lines with a newline, as the spec requires', async () => {
    const { stream, wire, versions } = harness();
    stream.start();
    await settle();
    wire.push('event: version\ndata: {"version":\ndata: 12}\n\n');
    await settle();
    expect(versions).toEqual([12]);
    stream.stop();
  });

  it('drops a peer that dribbles bytes without ever ending a frame', async () => {
    const { stream, wire, clock } = harness();
    stream.start();
    await settle();
    wire.push(`event: version\ndata: ${'x'.repeat(70 * 1024)}`);
    await settle();
    expect(stream.healthy()).toBe(false);
    expect(wire.dead(0)).toBe(true);
    expect(clock.delays()).toContain(BACKOFF_MS[0]);
    clock.fire(BACKOFF_MS[0]);
    await settle();
    expect(wire.requests).toHaveLength(2);
    stream.stop();
  });
});

/**
 * FINAL REVIEW, finding 9. `if (done || gen !== generation) break;` -- changing that to
 * `if (done) break;` left the whole suite green. A reader that resolves after its connection has
 * been retired then goes on to call setHealth(true), which (unlike armWatchdog and armStable)
 * carries no fence of its own, and reports a live stream for a connection that is gone.
 */
describe('a read that wins its race after the connection was retired', () => {
  it('reports nothing, and does not mark a dead connection healthy', async () => {
    const { stream, wire, versions, health } = harness();
    stream.start();
    await settle();
    // Get the first connection genuinely live first, so a stale setHealth(true) below is a
    // change rather than a no-op the flag would swallow.
    wire.push('event: version\ndata: {"version":7}\n\n');
    await settle();
    expect(health).toEqual([true]);

    // Bytes are enqueued and the pending read resolved BEFORE the restart, so the race inside
    // the loop settles on the chunk rather than on the abort. That is the only way the in-loop
    // generation check is reached at all: an abort that lands first rejects the race instead.
    // stop() then start() in the same tick is what a React effect cleanup-and-rerun produces on
    // a token or account change.
    wire.push('event: version\ndata: {"version":8}\n\n');
    stream.stop();
    stream.start();
    await settle();

    expect(wire.requests).toHaveLength(2);
    // The second connection has had no bytes at all, so nothing may report it live, and the
    // ghost's own frame belongs to a connection that is gone.
    expect(stream.healthy()).toBe(false);
    expect(health).toEqual([true, false]);
    expect(versions).toEqual([7]);
    stream.stop();
  });
});
