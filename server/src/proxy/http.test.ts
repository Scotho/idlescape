import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { proxyHttp } from './http';
import { loadEnv } from '../env';

let upstream: ReturnType<typeof Bun.serve>;
let env: ReturnType<typeof loadEnv>;

beforeAll(() => {
  upstream = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/crc') return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'application/octet-stream' } });
      if (url.pathname === '/boom') return new Response('x', { status: 500 });
      return new Response('nf', { status: 404 });
    }
  });
  env = loadEnv({ ENGINE_HTTP: `http://127.0.0.1:${upstream.port}` });
});
afterAll(() => upstream.stop(true));

describe('proxyHttp', () => {
  test('forwards path, status, body and content type', async () => {
    const res = await proxyHttp(env, new Request('http://front/crc'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
  test('passes upstream errors through', async () => {
    expect((await proxyHttp(env, new Request('http://front/boom'))).status).toBe(500);
  });
  test('returns 502 when upstream is unreachable', async () => {
    const dead = loadEnv({ ENGINE_HTTP: 'http://127.0.0.1:1' });
    expect((await proxyHttp(dead, new Request('http://front/crc'))).status).toBe(502);
  });
  test('a successful response is cached for an hour', async () => {
    const res = await proxyHttp(env, new Request('http://front/crc'));
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
  });
  test('an upstream error is never cached', async () => {
    // An engine mid-restart 404s and 502s. Caching those for an hour at the edge outlives the
    // restart by a long way, and the cache-archive paths are exactly where it hurts (audit C07).
    for (const path of ['/boom', '/missing']) {
      const res = await proxyHttp(env, new Request(`http://front${path}`));
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });
  test('the 502 this server invents is not cached either', async () => {
    const dead = loadEnv({ ENGINE_HTTP: 'http://127.0.0.1:1' });
    const res = await proxyHttp(dead, new Request('http://front/crc'));
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
