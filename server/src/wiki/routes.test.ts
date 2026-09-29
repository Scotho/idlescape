import { describe, expect, test } from 'bun:test';
import { openWikiDb } from './db';
import { createWikiRoutes } from './routes';
import { makeTestDb } from './testDb';
import type { WikiAuth } from './auth';

const db = openWikiDb(makeTestDb())!;
const allowAll: WikiAuth = { allowed: async () => true };
const denyAll: WikiAuth = { allowed: async () => false };
/** Allowed only with `x-ok: 1`, so one route object can serve both an allowed and a denied call. */
const headerAuth: WikiAuth = { allowed: async req => req.headers.get('x-ok') === '1' };

const url = (p: string) => new URL(`http://x${p}`);
const req = (p: string, headers: Record<string, string> = {}) => new Request(`http://x${p}`, { headers });

describe('wiki routes auth', () => {
  const routes = createWikiRoutes({ db: () => db, auth: denyAll });
  test('an unauthenticated api call is 401 json, not a redirect', async () => {
    const res = await routes.handle('wikiApi', req('/api/wiki/search?q=bronze'), url('/api/wiki/search?q=bronze'), '1.2.3.4');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });
  test('an unauthenticated reader call is a 302 back to the home page', async () => {
    const res = await routes.handle('wiki', req('/wiki'), url('/wiki'), '1.2.3.4');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
  });
  test('an authenticated call is served', async () => {
    const open = createWikiRoutes({ db: () => db, auth: allowAll });
    expect((await open.handle('wikiApi', req('/api/wiki/search?q=bronze'), url('/api/wiki/search?q=bronze'), '1.2.3.4')).status).toBe(200);
    expect((await open.handle('wiki', req('/wiki'), url('/wiki'), '1.2.3.4')).status).toBe(200);
  });
});

describe('wiki routes without a database', () => {
  const routes = createWikiRoutes({ db: () => null, auth: allowAll });
  test('the api answers 503 wiki_missing and the reader answers a 503 page', async () => {
    const api = await routes.handle('wikiApi', req('/api/wiki/search?q=bronze'), url('/api/wiki/search?q=bronze'), '1.2.3.4');
    expect(api.status).toBe(503);
    expect(await api.json()).toEqual({ error: 'wiki_missing' });
    const reader = await routes.handle('wiki', req('/wiki'), url('/wiki'), '1.2.3.4');
    expect(reader.status).toBe(503);
    expect(await reader.text()).toContain('wiki not built');
  });
});

describe('wiki routes rate limiting', () => {
  test('credential-less calls are keyed on the client IP, so the public api is still limited', async () => {
    const routes = createWikiRoutes({ db: () => db, auth: allowAll });
    let last: Response | null = null;
    for (let i = 0; i < 121; i++) last = await routes.handle('wikiApi', req('/api/wiki/search?q=bronze'), url('/api/wiki/search?q=bronze'), '10.0.0.1');
    expect(last!.status).toBe(429);
    expect(await last!.json()).toEqual({ error: 'rate_limited' });
    // a different IP has its own bucket
    expect((await routes.handle('wikiApi', req('/api/wiki/search?q=bronze'), url('/api/wiki/search?q=bronze'), '10.0.0.2')).status).toBe(200);
  });
  test('rejected calls never consume the limiter', async () => {
    const routes = createWikiRoutes({ db: () => db, auth: headerAuth });
    for (let i = 0; i < 200; i++) {
      const res = await routes.handle('wikiApi', req('/api/wiki/search?q=bronze'), url('/api/wiki/search?q=bronze'), '10.0.0.3');
      expect(res.status).toBe(401);
    }
    const allowed = await routes.handle('wikiApi', req('/api/wiki/search?q=bronze', { 'x-ok': '1' }), url('/api/wiki/search?q=bronze'), '10.0.0.3');
    expect(allowed.status).toBe(200);
  });
});
