import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildDb } from './db';
import { renderAll } from './render';
import { data } from './render/fixture';

describe('buildDb', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'wikidb-')), 'wiki.db');
  const { pages } = renderAll(data, []);
  buildDb(file, data, pages);
  const db = new Database(file, { readonly: true });
  test('entities, pages and fts are populated', () => {
    expect(db.query('SELECT COUNT(*) n FROM entities').get()).toEqual({ n: 4 }); // item, npc, area, shop
    expect(db.query("SELECT title FROM pages WHERE type='item' AND slug='bronze-axe'").get()).toEqual({ title: 'Bronze axe' });
    const hit = db.query("SELECT slug FROM search WHERE search MATCH 'bronze' ORDER BY bm25(search) LIMIT 1").get() as { slug: string };
    expect(hit.slug).toBe('bronze-axe');
  });
  test('relations: drops, shop stock links, spawns, methods, requirements', () => {
    expect(db.query("SELECT num, den FROM drops WHERE item_key='bronze_axe' AND subject_kind='npc'").get()).toEqual({ num: 3, den: 128 });
    expect(db.query("SELECT npc_key, num FROM drops WHERE subject_kind='table'").get()).toEqual({ npc_key: 'gem_rock_table', num: 2 });
    // a drop_table row is not an npc, so it never becomes an npc -> item 'drops' link
    expect(db.query("SELECT COUNT(*) n FROM links WHERE relation='drops'").get()).toEqual({ n: 1 });
    expect(db.query("SELECT COUNT(*) n FROM links WHERE relation='sells' AND to_slug='bronze-axe'").get()).toEqual({ n: 1 });
    expect(db.query("SELECT x, z, level, area FROM spawns WHERE kind='obj' AND key='bronze_axe'").get()).toEqual({ x: 3230, z: 3220, level: 0, area: 'lumbridge' });
    expect(db.query("SELECT skill, level, xp FROM methods").get()).toEqual({ skill: 'woodcutting', level: 1, xp: 25 });
    expect(db.query("SELECT COUNT(*) n FROM aliases WHERE alias='bronze axe'").get()).toEqual({ n: 1 });
  });
  test('meta table carries the manifest', () => {
    expect(db.query("SELECT value FROM meta WHERE key='revision'").get()).toEqual({ value: '274' });
  });
});
