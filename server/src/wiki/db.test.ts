import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openWikiDb } from './db';
import { makeTestDb } from './testDb';

describe('WikiDb', () => {
  const db = openWikiDb(makeTestDb())!;
  test('missing file returns null', () => { expect(openWikiDb('C:/nope/none.db')).toBeNull(); });
  test('a half-written or corrupt file returns null instead of throwing', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'cs-wiki-bad-')), 'wiki.db');
    writeFileSync(file, 'not a sqlite file, e.g. a build still in progress');
    expect(() => openWikiDb(file)).not.toThrow();
    expect(openWikiDb(file)).toBeNull();
  });
  test('meta, page, entity by slug, key and id', () => {
    expect(db.meta().revision).toBe('274');
    expect(db.getPage('item', 'bronze-axe')?.title).toBe('Bronze axe');
    expect(db.getEntity('item', 'bronze-axe')?.key).toBe('bronze_axe');
    expect(db.getEntity('item', 'bronze_axe')?.slug).toBe('bronze-axe');
    expect(db.getEntity('item', '1')?.slug).toBe('bronze-axe');
    expect(db.getEntity('item', 'nothing')).toBeNull();
  });
  test('search ranks title matches first, supports type filter and alias', () => {
    expect(db.search('bronze', undefined, 5)[0]?.slug).toBe('bronze-axe');
    // Goblin's own body mentions "Bronze axe" (its drop table), so an npc-filtered search for
    // "bronze axe" correctly surfaces Goblin rather than the (excluded) item page - not an empty result.
    expect(db.search('bronze axe', 'npc', 5).map(h => h.slug)).toEqual(['goblin']);
    expect(db.search('goblin', 'npc', 5)[0]?.slug).toBe('goblin');
    expect(Array.isArray(db.search('"; DROP TABLE pages; --', undefined, 5))).toBe(true); // sanitised to prefix tokens, never raw
  });
  test('listType and randomPage', () => {
    expect(db.listType('item').map(r => r.slug)).toEqual(['bronze-axe']);
    expect(['item', 'npc', 'area', 'shop']).toContain(db.randomPage()!.type);
  });
  test('area slugs resolve to display names', () => {
    expect(db.areaName('lumbridge')).toBe('Lumbridge');
    expect(db.areaName(null)).toBeNull();
    expect(db.areaName('nowhere')).toBeNull();
  });
});

// The fixture corpus has one page per type, so exact-first ranking only shows against the real
// build. Skipped when the corpus has not been built (`bun run --cwd wiki build`).
const CORPUS = path.join(import.meta.dir, '..', '..', '..', 'wiki', 'build', 'wiki.db');
describe.skipIf(!existsSync(CORPUS))('search ranking against the built corpus', () => {
  test('an exact name or alias outranks pages that merely mention it', () => {
    const real = openWikiDb(CORPUS)!;
    expect(real.search('bronze axe', undefined, 5)[0]?.slug).toBe('bronze-axe');
    expect(real.search('lumbridge', undefined, 5)[0]).toMatchObject({ type: 'area', slug: 'lumbridge' });
    expect(real.search('dragon slayer', undefined, 5)[0]).toMatchObject({ type: 'quest', slug: 'dragon-slayer' });
    // an inexact query still falls through to full-text search
    expect(real.search('bronze', undefined, 5).length).toBeGreaterThan(0);
  });
});
