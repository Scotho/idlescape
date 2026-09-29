import { describe, expect, test } from 'bun:test';
import { createBankRoutes, MAX_STREAMS_PER_OWNER } from './routes';
import type { ManagementClient } from '../engine/managementClient';

// Split out of routes.test.ts: the two together would put that file over the 400 line budget.

const human = { kind: 'human' as const, uid: 'uidA', isAnonymous: false, authTime: Date.now() };
const agent = { kind: 'agent' as const, uid: 'uidA', tokenId: 't', mode: 'read' as const, characters: 'all' as const, contracts: 'deny' as const };

function stubClient(over: Partial<ManagementClient> = {}): ManagementClient {
  return {
    getBank: async ownerKey => ({ ownerKey, version: 2, capacity: 240, tabs: [], slots: [] }),
    applyBank: async () => ({ ok: true, version: 3 }),
    ...over
  };
}

const EVENTS = { kind: 'bank' as const, sub: 'events' as const };

/**
 * Only what these tests need from a stream reader. `Response.body` is typed as a stream of
 * `any` here, which does not satisfy Bun's `ReadableStreamDefaultReader<Uint8Array>`.
 */
type FrameReader = { read(): Promise<{ value?: Uint8Array; done: boolean }>; cancel(): Promise<void> };

/** Reads one decoded chunk, or '' if the stream produced nothing before it closed. */
async function chunk(reader: FrameReader): Promise<string> {
  const { value, done } = await reader.read();
  return done || !value ? '' : new TextDecoder().decode(value);
}

/** Reads chunks until `needle` appears, so a heartbeat or the open frame cannot fail a test. */
async function readUntil(reader: FrameReader, needle: string): Promise<string> {
  let seen = '';
  for (let i = 0; i < 10 && !seen.includes(needle); i++) seen += await chunk(reader);
  return seen;
}

function hookRequest(body: unknown, secret = 's'): Request {
  return new Request('http://x/internal/bank-changed', { method: 'POST', headers: { 'x-idlescape-mgmt': secret }, body: JSON.stringify(body) });
}

describe('bank event stream', () => {
  test('opens an SSE response and replays nothing until a change arrives', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's', heartbeatMs: 60_000 });
    const res = await routes.handle(new Request('http://x/api/bank/events'), EVENTS, human);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    const reader = res.body!.getReader();
    expect(await chunk(reader)).toContain('retry: 3000');
    await reader.cancel();
  });

  test('the hook is fanned out to that owner as a version event', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's', heartbeatMs: 60_000 });
    const res = await routes.handle(new Request('http://x/api/bank/events'), EVENTS, human);
    const reader = res.body!.getReader();
    await chunk(reader);
    expect((await routes.handleHook(hookRequest({ ownerKey: 'uidA', version: 7 }), '127.0.0.1')).status).toBe(204);
    const frame = await readUntil(reader, 'data:');
    expect(frame).toContain('event: version');
    expect(frame).toContain('data: {"version":7}');
    await reader.cancel();
  });

  test('a hook for a different owner is never delivered', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's', heartbeatMs: 60_000 });
    const res = await routes.handle(new Request('http://x/api/bank/events'), EVENTS, human);
    const reader = res.body!.getReader();
    await chunk(reader);
    await routes.handleHook(hookRequest({ ownerKey: 'someoneElse', version: 7 }), '127.0.0.1');
    await routes.handleHook(hookRequest({ ownerKey: 'uidA', version: 8 }), '127.0.0.1');
    expect(await readUntil(reader, 'data:')).toContain('data: {"version":8}');
    await reader.cancel();
  });

  test('a repeated version is not re-sent: the hook has no ordering guarantee', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's', heartbeatMs: 60_000 });
    const res = await routes.handle(new Request('http://x/api/bank/events'), EVENTS, human);
    const reader = res.body!.getReader();
    await chunk(reader);
    await routes.handleHook(hookRequest({ ownerKey: 'uidA', version: 8 }), '127.0.0.1');
    expect(await readUntil(reader, 'data:')).toContain('data: {"version":8}');
    await routes.handleHook(hookRequest({ ownerKey: 'uidA', version: 8 }), '127.0.0.1');
    await routes.handleHook(hookRequest({ ownerKey: 'uidA', version: 9 }), '127.0.0.1');
    // The duplicate 8 was dropped, so the very next frame is 9, not another 8.
    expect(await readUntil(reader, 'data:')).toContain('data: {"version":9}');
    await reader.cancel();
  });

  test('a successful apply is fanned out too, so a deployed world with no hook still updates', async () => {
    const routes = createBankRoutes({ client: stubClient({ applyBank: async () => ({ ok: true, version: 12 }) }), secret: 's', heartbeatMs: 60_000 });
    const res = await routes.handle(new Request('http://x/api/bank/events'), EVENTS, human);
    const reader = res.body!.getReader();
    await chunk(reader);
    await routes.handle(
      new Request('http://x/api/bank/ops', { method: 'POST', body: JSON.stringify({ expectedVersion: 11, ops: [{ op: 'swap', a: 0, b: 1 }] }) }),
      { kind: 'bank', sub: 'ops' }, human);
    expect(await readUntil(reader, 'data:')).toContain('data: {"version":12}');
    await reader.cancel();
  });

  test('cancelling the stream releases the subscriber', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's', heartbeatMs: 60_000 });
    const res = await routes.handle(new Request('http://x/api/bank/events'), EVENTS, human);
    const reader = res.body!.getReader();
    await chunk(reader);
    expect(routes.streamCount('uidA')).toBe(1);
    await reader.cancel();
    expect(routes.streamCount('uidA')).toBe(0);
  });

  test('a dropped socket releases the subscriber even though the reader never cancelled', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's', heartbeatMs: 60_000 });
    const aborter = new AbortController();
    const res = await routes.handle(new Request('http://x/api/bank/events', { signal: aborter.signal }), EVENTS, human);
    const reader = res.body!.getReader();
    await chunk(reader);
    expect(routes.streamCount('uidA')).toBe(1);
    aborter.abort();
    expect(routes.streamCount('uidA')).toBe(0);
    await reader.cancel();
  });

  /**
   * FINAL REVIEW, finding 4. The double-release guard had two implementations - a `released`
   * early-return and the identity check below - and this test passed with EITHER one removed, so
   * it could tell neither apart. They were not two invariants: the early-return made the identity
   * check unreachable, because a second call never reached it. The flag is gone, one owner is
   * left, and the two things release() still has to be idempotent about are pinned separately
   * here and in the test below.
   */
  test('a stream released twice cannot evict a later stream for the same owner', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's', heartbeatMs: 60_000 });
    const aborter = new AbortController();
    const first = await routes.handle(new Request('http://x/api/bank/events', { signal: aborter.signal }), EVENTS, human);
    const firstReader = first.body!.getReader();
    await chunk(firstReader);
    await firstReader.cancel();
    expect(routes.streamCount('uidA')).toBe(0);

    const second = await routes.handle(new Request('http://x/api/bank/events'), EVENTS, human);
    const secondReader = second.body!.getReader();
    await chunk(secondReader);
    // The first request's socket only drops now, after the browser has already reconnected.
    aborter.abort();
    expect(routes.streamCount('uidA')).toBe(1);
    await routes.handleHook(hookRequest({ ownerKey: 'uidA', version: 33 }), '127.0.0.1');
    expect(await readUntil(secondReader, 'data:')).toContain('data: {"version":33}');
    await secondReader.cancel();
  });

  test('a stream released twice clears its heartbeat once, not once per release', async () => {
    // The other half of release()'s idempotence, and the reason `heartbeat = null` is there.
    // cancel and abort both fire for one dropped socket and not always in the same tick, so
    // release() runs twice for every connection that closes uncleanly.
    const realSet = globalThis.setInterval;
    const realClear = globalThis.clearInterval;
    const created: unknown[] = [];
    const cleared: unknown[] = [];
    try {
      globalThis.setInterval = ((handler: () => void, ms?: number) => {
        const id = realSet(handler, ms);
        created.push(id);
        return id;
      }) as typeof globalThis.setInterval;
      globalThis.clearInterval = ((id: Parameters<typeof realClear>[0]) => {
        cleared.push(id);
        realClear(id);
      }) as typeof globalThis.clearInterval;

      const routes = createBankRoutes({ client: stubClient(), secret: 's', heartbeatMs: 60_000 });
      const aborter = new AbortController();
      const res = await routes.handle(new Request('http://x/api/bank/events', { signal: aborter.signal }), EVENTS, human);
      const reader = res.body!.getReader();
      await chunk(reader);
      // Both release paths, for the one connection.
      await reader.cancel();
      aborter.abort();
    } finally {
      globalThis.setInterval = realSet;
      globalThis.clearInterval = realClear;
    }
    expect(created).toHaveLength(1);
    expect(cleared).toEqual(created);
  });

  test('the stream is kept warm by a heartbeat, and that timer is cleared when it closes', async () => {
    // Spied rather than inferred. A missing clearInterval has no visible effect from inside the
    // process: the timer keeps firing on a closed controller, enqueue throws, and the catch calls
    // release() again, which finds the heartbeat already cleared and does nothing more. Only a
    // spy can tell "cleared once" from "never cleared".
    const realSet = globalThis.setInterval;
    const realClear = globalThis.clearInterval;
    const created: unknown[] = [];
    const cleared: unknown[] = [];
    try {
      globalThis.setInterval = ((handler: () => void, ms?: number) => {
        const id = realSet(handler, ms);
        created.push(id);
        return id;
      }) as typeof globalThis.setInterval;
      globalThis.clearInterval = ((id: Parameters<typeof realClear>[0]) => {
        cleared.push(id);
        realClear(id);
      }) as typeof globalThis.clearInterval;

      const routes = createBankRoutes({ client: stubClient(), secret: 's', heartbeatMs: 5 });
      const res = await routes.handle(new Request('http://x/api/bank/events'), EVENTS, human);
      const reader = res.body!.getReader();
      await chunk(reader);
      expect(await readUntil(reader, ': ping')).toContain(': ping');
      await reader.cancel();
    } finally {
      globalThis.setInterval = realSet;
      globalThis.clearInterval = realClear;
    }
    expect(created).toHaveLength(1);
    expect(cleared).toEqual(created);
  });

  test('a request whose signal has already fired does not leave a subscriber behind', async () => {
    // addEventListener('abort', ...) no-ops on an already-aborted signal, so the listener alone
    // would never free this one.
    const routes = createBankRoutes({ client: stubClient(), secret: 's', heartbeatMs: 60_000 });
    const res = await routes.handle(new Request('http://x/api/bank/events', { signal: AbortSignal.abort() }), EVENTS, human);
    expect(res.status).toBe(200);
    expect(routes.streamCount('uidA')).toBe(0);
  });

  test('a fifth stream for one owner is refused rather than leaked', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's', heartbeatMs: 60_000 });
    const readers: FrameReader[] = [];
    for (let i = 0; i < MAX_STREAMS_PER_OWNER; i++) {
      const res = await routes.handle(new Request('http://x/api/bank/events'), EVENTS, human);
      expect(res.status).toBe(200);
      const reader = res.body!.getReader();
      await chunk(reader);
      readers.push(reader);
    }
    const refused = await routes.handle(new Request('http://x/api/bank/events'), EVENTS, human);
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ error: 'too_many_streams' });
    for (const reader of readers) await reader.cancel();
  });

  test('a subscriber that never reads blocks neither the hook nor the other subscribers', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's', heartbeatMs: 60_000 });
    const wedged = (await routes.handle(new Request('http://x/api/bank/events'), EVENTS, human)).body!.getReader();
    const live = (await routes.handle(new Request('http://x/api/bank/events'), EVENTS, human)).body!.getReader();
    await chunk(live);
    // `wedged` is never read: its frames queue in its own controller, and the hook handler
    // enqueues without ever awaiting a consumer.
    expect((await routes.handleHook(hookRequest({ ownerKey: 'uidA', version: 21 }), '127.0.0.1')).status).toBe(204);
    expect(await readUntil(live, 'data:')).toContain('data: {"version":21}');
    await wedged.cancel();
    await live.cancel();
    expect(routes.streamCount('uidA')).toBe(0);
  });

  test('an agent bearer is refused on the stream as well', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's' });
    const res = await routes.handle(new Request('http://x/api/bank/events'), EVENTS, agent);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'human_only' });
  });

  test('a non-GET on the stream is 405', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's' });
    const res = await routes.handle(new Request('http://x/api/bank/events', { method: 'POST' }), EVENTS, human);
    expect(res.status).toBe(405);
  });
});
