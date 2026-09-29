import { describe, expect, it, vi } from 'vitest';
import { REQUEST_TIMEOUT_MS, createBankApi, friendlyBankError } from './api';
import type { BankSnapshot } from './types';

const SNAPSHOT: BankSnapshot = { ownerKey: 'u1', version: 4, capacity: 240, tabs: [2], slots: [{ slot: 0, obj: 995, count: 500 }] };

interface Call { url: string; init: RequestInit }

function fakeFetch(replies: { status: number; body?: unknown }[]): { impl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  const impl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    const reply = replies[Math.min(i++, replies.length - 1)];
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status, headers: { 'content-type': 'application/json' }
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const api = (impl: typeof fetch) => createBankApi({ idToken: async () => 'TOKEN', fetchImpl: impl });

describe('GET /api/bank', () => {
  it('sends the bearer and returns the snapshot', async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: SNAPSHOT }]);
    await expect(api(impl).get()).resolves.toEqual(SNAPSHOT);
    expect(calls[0].url).toBe('/api/bank');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer TOKEN');
  });

  it('rejects with player-facing copy on a refusal', async () => {
    const { impl } = fakeFetch([{ status: 503, body: { error: 'unavailable' } }]);
    await expect(api(impl).get()).rejects.toThrow('The bank is not reachable right now. Try again in a moment.');
  });

  it('rejects with copy, not a raw SyntaxError, on a 200 with a non-JSON body', async () => {
    const impl = (async () => new Response('<html>captive portal</html>', { status: 200 })) as unknown as typeof fetch;
    await expect(api(impl).get()).rejects.toThrow('Something went wrong. Try again.');
  });
});

describe('POST /api/bank/ops', () => {
  it('posts expectedVersion and ops, and returns the new version', async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: { version: 5 } }]);
    await expect(api(impl).ops(4, [{ op: 'swap', a: 0, b: 1 }])).resolves.toEqual({ ok: true, version: 5 });
    expect(calls[0].url).toBe('/api/bank/ops');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ expectedVersion: 4, ops: [{ op: 'swap', a: 0, b: 1 }] });
  });

  it('reports a 409 as a conflict carrying the version the server holds', async () => {
    const { impl } = fakeFetch([{ status: 409, body: { error: 'version', version: 9 } }]);
    await expect(api(impl).ops(4, [{ op: 'swap', a: 0, b: 1 }])).resolves.toEqual({ ok: false, kind: 'conflict', version: 9 });
  });

  it('turns a 422 engine rejection into copy', async () => {
    const { impl } = fakeFetch([{ status: 422, body: { error: 'tab_invariant' } }]);
    await expect(api(impl).ops(4, [{ op: 'insert', from: 0, to: 9 }])).resolves.toEqual({
      ok: false, kind: 'error', message: 'That move would break the bank tabs.'
    });
  });

  it('turns a 403 layout_only into copy without pretending it succeeded', async () => {
    const { impl } = fakeFetch([{ status: 403, body: { error: 'layout_only' } }]);
    const result = await api(impl).ops(4, [{ op: 'swap', a: 0, b: 1 }]);
    expect(result).toEqual({ ok: false, kind: 'error', message: 'The web bank can only re-order items, never move them.' });
  });

  it('refuses a batch longer than the server accepts before it leaves the browser', async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: { version: 5 } }]);
    const many = Array.from({ length: 201 }, (_, i) => ({ op: 'swap', a: i, b: i + 1 }) as const);
    await expect(api(impl).ops(4, many)).resolves.toEqual({
      ok: false, kind: 'error', message: 'Too many changes at once. Try again.'
    });
    expect(calls).toHaveLength(0);
  });

  it('reports a dropped connection as copy, not as a rejection', async () => {
    const impl = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    await expect(api(impl).ops(4, [{ op: 'swap', a: 0, b: 1 }])).resolves.toEqual({
      ok: false, kind: 'error', message: 'The bank is not reachable right now. Try again in a moment.'
    });
  });

  it('reports a 200 with a non-JSON body as an error result, not a rejection', async () => {
    // A proxy or gateway returning 200 with an HTML body (captive portal, stale cache,
    // load-balancer health page) is a real failure mode for a front-server topology; ops()
    // must never throw here or the store's flush loop wedges with inFlight stuck true.
    const impl = (async () => new Response('<html>captive portal</html>', { status: 200 })) as unknown as typeof fetch;
    await expect(api(impl).ops(4, [{ op: 'swap', a: 0, b: 1 }])).resolves.toEqual({
      ok: false, kind: 'error', message: 'Something went wrong. Try again.'
    });
  });
});

describe('friendlyBankError', () => {
  it('maps every code the server and the engine can send', () => {
    for (const code of ['human_only', 'layout_only', 'bad_ops', 'bad_version', 'bad_body', 'unavailable', 'bad_slot', 'bad_tab', 'tab_invariant', 'bad_op', 'full', 'insufficient']) {
      expect(friendlyBankError(code)).not.toBe('');
    }
  });

  it('never leaks a raw code the client has not seen before', () => {
    expect(friendlyBankError('some_future_code')).toBe('Something went wrong. Try again.');
  });
});

/**
 * FINAL REVIEW, finding 2 and residual 14. get() issued its fetch with no try/catch at all, so
 * whatever the browser threw reached the player: store.refresh() catches, does
 * emit({ error: messageOf(err) }), and messageOf prefers err.message, which put "Failed to fetch"
 * verbatim into #bank-error (role=alert). ops() has always wrapped the same throw. Neither route
 * had a timeout, so a hung socket never failed at all.
 */
describe('the two failure seams under a route', () => {
  const boom = (message: string) => (async () => { throw new TypeError(message); }) as unknown as typeof fetch;

  it('turns a raw fetch throw on GET into player-facing copy', async () => {
    await expect(api(boom('Failed to fetch')).get()).rejects.toThrow('The bank is not reachable right now. Try again in a moment.');
    await expect(api(boom('Failed to fetch')).get()).rejects.not.toThrow('Failed to fetch');
  });

  it('reports a token that will not refresh as a sign-in problem, not an unreachable bank', async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: SNAPSHOT }]);
    const dead = createBankApi({ idToken: async () => { throw new Error('auth/network-request-failed'); }, fetchImpl: impl });
    await expect(dead.get()).rejects.toThrow('Sign in again to open your bank.');
    await expect(dead.ops(4, [{ op: 'swap', a: 0, b: 1 }])).resolves.toEqual({
      ok: false, kind: 'error', message: 'Sign in again to open your bank.'
    });
    // Neither route may reach the network without a bearer.
    expect(calls).toHaveLength(0);
  });

  it('bounds both routes with a real timeout, so a hung socket fails instead of hanging', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout');
    try {
      const { impl, calls } = fakeFetch([{ status: 200, body: SNAPSHOT }, { status: 200, body: { version: 5 } }]);
      const client = api(impl);
      await client.get();
      await client.ops(4, [{ op: 'swap', a: 0, b: 1 }]);
      expect(spy.mock.calls.map(call => call[0])).toEqual([REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS]);
      for (const call of calls) expect(call.init.signal).toBeInstanceOf(AbortSignal);
    } finally {
      spy.mockRestore();
    }
  });

  it('reports the abort that timeout fires as copy, not as a raw TimeoutError', async () => {
    const timedOut = (async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    }) as unknown as typeof fetch;
    await expect(api(timedOut).get()).rejects.toThrow('The bank is not reachable right now. Try again in a moment.');
    await expect(api(timedOut).ops(4, [{ op: 'swap', a: 0, b: 1 }])).resolves.toEqual({
      ok: false, kind: 'error', message: 'The bank is not reachable right now. Try again in a moment.'
    });
  });
});
