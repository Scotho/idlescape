import { afterEach, describe, expect, test, vi } from 'vitest';
import { health, mintPair, revokeAgentToken } from './api';

// Typed from `fetch` itself. Declared bare, the fake had no parameters, so `mock.calls[0]` was the
// empty tuple and the `as [string, RequestInit]` each assertion put beside it was checking nothing
// the compiler could see. Audit C16.
function mockFetch(status: number, body: unknown = null) {
  const f = vi.fn<typeof fetch>(async () => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', f);
  return f;
}

/** The url and init of the fake's first call, with the init the production caller always sends. */
function firstCall(f: ReturnType<typeof mockFetch>): { url: string; init: RequestInit } {
  const call = f.mock.calls[0];
  if (!call) throw new Error('fetch was never called');
  return { url: String(call[0]), init: call[1] ?? {} };
}
afterEach(() => vi.unstubAllGlobals());

describe('api', () => {
  test('health parses', async () => {
    mockFetch(200, { engine: 'up', engineUptimeMs: 5, version: '0.1.0' });
    expect((await health()).engine).toBe('up');
  });
  test('mintPair posts with bearer and returns the parsed body', async () => {
    const f = mockFetch(200, { pairUrl: 'https://x/pair/tok', token: 'tok', expiresAt: 123 });
    const res = await mintPair('tok-abc');
    expect(res).toEqual({ pairUrl: 'https://x/pair/tok', token: 'tok', expiresAt: 123 });
    const { url, init } = firstCall(f);
    expect(url).toBe('/api/pair');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok-abc');
  });
  test('mintPair throws on non-2xx', async () => {
    mockFetch(401);
    await expect(mintPair('tok-abc')).rejects.toThrow();
  });
  test('revokeAgentToken posts with bearer and resolves on 204', async () => {
    const f = mockFetch(204);
    await expect(revokeAgentToken('tok-abc', 'agent-1')).resolves.toBeUndefined();
    const { url, init } = firstCall(f);
    expect(url).toBe('/api/agent-tokens/agent-1/revoke');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok-abc');
  });
  test('revokeAgentToken throws on 404', async () => {
    mockFetch(404);
    await expect(revokeAgentToken('tok-abc', 'missing')).rejects.toThrow();
  });
});
