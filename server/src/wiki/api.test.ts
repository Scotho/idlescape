import { describe, expect, test } from 'bun:test';
import { createWikiAuth } from './auth';
import { openWikiDb } from './db';
import { handleWikiApi } from './api';
import { createWikiRoutes } from './routes';
import { makeTestDb } from './testDb';

const db = openWikiDb(makeTestDb())!;
const call = (p: string, accept = '*/*') => handleWikiApi(db, new URL(`http://x${p}`), new Request(`http://x${p}`, { headers: { accept } }));

describe('wiki api', () => {
  test('markdown by default with revision headers; json on request', async () => {
    const md = await call('/api/wiki/search?q=bronze');
    expect(md.headers.get('content-type')).toContain('text/markdown');
    expect(md.headers.get('x-wiki-revision')).toBe('274');
    expect(await md.text()).toContain('- item/bronze-axe — Bronze axe');
    const js = await call('/api/wiki/search?q=bronze&format=json');
    expect((await js.json() as { hits: { slug: string }[] }).hits[0]!.slug).toBe('bronze-axe');
    const js2 = await call('/api/wiki/search?q=bronze', 'application/json');
    expect(js2.headers.get('content-type')).toContain('application/json');
  });
  test('search snippets have sentinel markers stripped in both formats', async () => {
    const md = await (await call('/api/wiki/search?q=bronze')).text();
    expect(md).not.toContain('');
    expect(md).not.toContain('');
    const js = (await (await call('/api/wiki/search?q=bronze&format=json')).json()) as { hits: { snippet: string }[] };
    expect(js.hits[0]!.snippet).not.toContain('');
    expect(js.hits[0]!.snippet).not.toContain('');
  });
  test('page with section filter; entity; schema', async () => {
    const t = await (await call('/api/wiki/page/item/bronze-axe?sections=Item%20sources')).text();
    expect(t).toContain('## Item sources');
    expect(t).not.toContain('## Bonuses');
    expect(((await (await call('/api/wiki/entity/item/1?format=json')).json()) as { key: string }).key).toBe('bronze_axe');
    expect(await (await call('/api/wiki/schema')).text()).toContain('# idlescape wiki API');
  });
  test('q routes and errors', async () => {
    expect((await call('/api/wiki/q/obtain?item=bronze+axe')).status).toBe(200);
    const amb = await call('/api/wiki/q/obtain?item=bronz&format=json');
    expect(amb.status).toBe(404);
    expect(((await amb.json()) as { error: string; candidates: unknown[] }).candidates.length).toBeGreaterThan(0);
    expect((await call('/api/wiki/q/nearest?kind=bank&x=3200&z=3200&level=0')).status).toBe(200);
    expect((await call('/api/wiki/q/nearest?kind=bank&x=abc')).status).toBe(400);
    expect((await call('/api/wiki/q/nope')).status).toBe(404);
    expect((await call('/api/wiki/q/plan-context?goal=bronze+axe&budget=200')).status).toBe(200);
  });
  test('near= goes through the same finite check as x/z', async () => {
    expect((await call('/api/wiki/q/obtain?item=bronze+axe&near=3200,3200')).status).toBe(200);
    expect((await call('/api/wiki/q/obtain?item=bronze+axe&near=3200,3200,0')).status).toBe(200);
    const bad = await call('/api/wiki/q/obtain?item=bronze+axe&near=abc&format=json');
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toBe('bad_query');
    expect((await call('/api/wiki/q/obtain?item=bronze+axe&near=3200')).status).toBe(400);
    expect((await call('/api/wiki/q/obtain?item=bronze+axe&near=3200,3200,zz')).status).toBe(400);
  });
  test('page json carries the union of its sections sources', async () => {
    const j = (await (await call('/api/wiki/page/item/bronze-axe?format=json')).json()) as { sources: string[] };
    expect(j.sources.length).toBeGreaterThan(0);
    expect(j.sources).toContain('content:a.obj#bronze_axe');
  });
  test('where answers grouped areas with a total, not one row per spawn', async () => {
    const md = await (await call('/api/wiki/q/where?name=bronze+axe')).text();
    expect(md).toContain('1 spawn across 1 area.');
    expect(md).toContain('- Lumbridge: 1 spawn, e.g. (3230, 3220, 0)');
    const j = (await (await call('/api/wiki/q/where?name=bronze+axe&format=json')).json()) as { total: number; areas: number; results: { area: string; areaSlug: string; count: number }[] };
    expect(j).toMatchObject({ total: 1, areas: 1 });
    expect(j.results[0]).toMatchObject({ area: 'Lumbridge', areaSlug: 'lumbridge', count: 1 });
  });
  test('obtain reports shared drop tables separately from npc drops', async () => {
    const md = await (await call('/api/wiki/q/obtain?item=bronze+axe')).text();
    expect(md).toContain('## Tables');
    expect(md).toContain('- rolled from gem_rock_table: 1/64, 1');
    expect(md).not.toContain('gem_rock_table (npc/');
  });
  test('every query kind renders its own markdown heading', async () => {
    const cases: [string, string][] = [
      ['/api/wiki/q/drops?npc=goblin', '## Drops'],
      ['/api/wiki/q/requirements?item=bronze+axe', '## Skills'],
      ['/api/wiki/q/methods?skill=woodcutting&level=5', '## Methods'],
      ['/api/wiki/q/unlocks?skill=woodcutting&level=1', '## Methods'],
      ['/api/wiki/q/nearest?kind=npc&name=goblin&x=3200&z=3200', '## Results'],
      ['/api/wiki/q/where?name=bronze+axe', '## Locations'],
      ['/api/wiki/q/shops?item=bronze+axe', '## Shops'],
      ['/api/wiki/q/quest-order', '## Available'],
      ['/api/wiki/q/plan-context?goal=bronze+axe&budget=400', '## Requirements'],
      ['/api/wiki/entity/item/bronze-axe', '## Fields']
    ];
    for (const [path, heading] of cases) {
      const md = await (await call(path)).text();
      expect(md, path).toContain(heading);
    }
  });
  test('every GET example in schema.md answers 200', async () => {
    const schema = await (await call('/api/wiki/schema')).text();
    const examples = [...schema.matchAll(/^GET (\/api\/wiki\/\S+)/gm)].map(m => m[1]!);
    expect(examples.length).toBeGreaterThan(12);
    for (const ex of examples) expect((await call(ex)).status, ex).toBe(200);
  });
  test('every response, success or error, carries the revision and build headers', async () => {
    for (const p of ['/api/wiki/schema', '/api/wiki/page/item/bronze-axe', '/api/wiki/q/nope', '/api/wiki/nothing']) {
      const res = await call(p);
      expect(res.headers.get('x-wiki-revision'), p).toBe('274');
      expect(res.headers.get('x-wiki-build'), p).toBeTruthy();
    }
  });
});

describe('wiki api rate limit', () => {
  test('answers 429 rate_limited past 120 requests/minute for the same credential', async () => {
    const routes = createWikiRoutes({ db: () => db, auth: createWikiAuth() });
    const url = new URL('http://x/api/wiki/search?q=bronze');
    const req = () => new Request(url.toString(), { headers: { authorization: 'Bearer rate-limit-test-token' } });
    let last: Response | null = null;
    for (let i = 0; i < 121; i++) last = await routes.handle('wikiApi', req(), url);
    expect(last!.status).toBe(429);
    expect(await last!.json()).toEqual({ error: 'rate_limited' });
    expect(last!.headers.get('x-wiki-revision')).toBe('274');
    expect(last!.headers.get('x-wiki-build')).toBeTruthy();
  });
});
