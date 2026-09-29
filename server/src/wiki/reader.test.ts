import { describe, expect, test } from 'bun:test';
import { openWikiDb, SNIPPET_CLOSE, SNIPPET_OPEN } from './db';
import { makeTestDb } from './testDb';
import { handleWiki } from './reader';

const db = openWikiDb(makeTestDb())!;
const get = (p: string) => handleWiki(db, new URL(`http://x${p}`));

describe('reader', () => {
  test('front page lists types with counts and a search box', async () => {
    const html = await (await get('/wiki')).text();
    expect(html).toContain('<form action="/wiki/search"');
    expect(html).toContain('Items (1)');
  });
  test('page renders infobox, lead, sources and json/markdown links', async () => {
    const res = await get('/wiki/item/bronze-axe');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<h1>Bronze axe</h1>');
    expect(html).toContain('<strong>Bronze axe</strong>');
    expect(html).toContain('href="/api/wiki/page/item/bronze-axe?format=json"');
    expect(html).toContain('Revision 274');
  });
  test('search page groups hits; exact title redirects', async () => {
    expect((await get('/wiki/search?q=bronze+axe')).status).toBe(302);
    const html = await (await get('/wiki/search?q=bronze')).text();
    expect(html).toContain('/wiki/item/bronze-axe');
    // Snippet highlighting must go through renderSnippet: the raw FTS sentinel markers
    // never reach the response, and any HTML-looking text in a snippet is escaped, not
    // interpolated raw.
    expect(html).not.toContain(SNIPPET_OPEN);
    expect(html).not.toContain(SNIPPET_CLOSE);
  });
  test('unknown slug is a 404 page with suggestions; type index lists pages; random redirects', async () => {
    const res = await get('/wiki/item/bronze-axx');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('/wiki/item/bronze-axe');
    expect(await (await get('/wiki/item')).text()).toContain('Bronze axe');
    expect((await get('/wiki/random')).status).toBe(302);
  });
  test('the type index opens its first list before closing one, and escapes the jump letter', async () => {
    const html = await (await get('/wiki/item')).text();
    const body = html.slice(html.indexOf('<h1>'));
    expect(body.indexOf('<ul>')).toBeLessThan(body.indexOf('</ul>'));
    expect(body).not.toContain('<ul></ul>');
    expect(body).toContain('<h2 id="B">B</h2><ul>');
    expect(body).not.toContain('<h2 id="<');
  });
});
