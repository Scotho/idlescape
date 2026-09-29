import type { Env } from '../types';

export async function proxyHttp(env: Env, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const target = `${env.engineHttp}${url.pathname}${url.search}`;
  try {
    const upstream = await fetch(target, { method: 'GET', signal: AbortSignal.timeout(30_000) });
    const headers = new Headers();
    const ct = upstream.headers.get('content-type');
    if (ct) headers.set('content-type', ct);
    // Only a success is cacheable. An engine mid-restart answers 404 or 502, and an hour of edge
    // caching outlives the restart by a very long way on exactly the cache-archive paths a client
    // cannot start without (audit C07).
    const ok = upstream.status >= 200 && upstream.status < 300;
    headers.set('cache-control', ok ? 'public, max-age=3600' : 'no-store');
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return new Response('engine unreachable', { status: 502, headers: { 'cache-control': 'no-store' } });
  }
}
