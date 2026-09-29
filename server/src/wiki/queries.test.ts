import { describe, expect, test } from 'bun:test';
import { openWikiDb } from './db';
import { makeTestDb } from './testDb';
import { drops, escapeLike, methods, nearest, obtain, planContext, questOrder, requirements, resolveEntity, shops, unlocks, where } from './queries';

const db = openWikiDb(makeTestDb())!;

describe('resolveEntity', () => {
  test('exact slug, key, alias, then fuzzy with candidates', () => {
    expect(resolveEntity(db, 'item', 'bronze-axe')).toMatchObject({ ok: true });
    expect(resolveEntity(db, 'item', 'bronze_axe')).toMatchObject({ ok: true });
    expect(resolveEntity(db, 'item', 'Bronze Axe')).toMatchObject({ ok: true });
    const r = resolveEntity(db, 'item', 'bronz');
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error).toBe('ambiguous'); expect(r.candidates?.[0]?.slug).toBe('bronze-axe'); }
    expect(resolveEntity(db, 'item', 'zzzz')).toMatchObject({ ok: false, error: 'not_found' });
  });
});

describe('question routes', () => {
  test('obtain lists drops with chance, shops with coords, spawns nearest first', () => {
    const r = obtain(db, 'bronze axe', { x: 3200, z: 3200, level: 0 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.drops[0]).toMatchObject({ npc: { slug: 'goblin', members: false }, rate: '3/128', condition: null });
      expect(r.data.drops.map(x => x.npc.slug)).toEqual(['goblin']); // the drop_table row is not an npc
      expect(r.data.tables).toEqual([{ table: 'gem_rock_table', rate: '1/64', chance: 2 / 128, quantity: '1' }]);
      expect(r.data.shops[0]).toMatchObject({ shop: { slug: 'lumbridge-general-store' }, stock: 10, area: 'Lumbridge', areaSlug: 'lumbridge' });
      expect(r.data.spawns[0]).toMatchObject({ coord: { x: 3230, z: 3220, level: 0 }, area: 'Lumbridge', areaSlug: 'lumbridge', distance: 36 });
      expect(r.data.methods).toEqual([]);
      expect(r.data.item.members).toBe(false);
      expect(r.confidence).toBe('derived');
    }
  });
  test('drops for an npc', () => {
    const r = drops(db, 'goblin');
    expect(r.ok && r.data.drops[0]?.item.slug).toBe('bronze-axe');
  });
  test('requirements for an item', () => {
    const r = requirements(db, { item: 'bronze axe' });
    expect(r.ok && r.data.skills).toEqual([{ skill: 'attack', level: 1 }]);
  });
  test('methods and unlocks by skill and level', () => {
    expect(methods(db, 'woodcutting', 5, false)).toMatchObject({ ok: true, data: { methods: [{ action: 'Chop normal tree', xp: 25 }] } });
    expect(unlocks(db, 'woodcutting', 1)).toMatchObject({ ok: true, data: { methods: [{ action: 'Chop normal tree' }], next: null } });
    expect(methods(db, 'nonsense', 1, false)).toMatchObject({ ok: false, error: 'bad_query' });
  });
  test('nearest by kind and by name; where by name', () => {
    const n = nearest(db, 'npc', 'goblin', { x: 3200, z: 3200, level: 0 }, 5);
    expect(n.ok && n.data.results[0]).toMatchObject({ slug: 'goblin', distance: expect.any(Number) });
    expect(n.ok && n.data.results[0]?.area).toBe('Lumbridge');
    const w = where(db, 'bronze axe');
    expect(w.ok && w.data.results[0]).toMatchObject({ area: 'Lumbridge', areaSlug: 'lumbridge', count: 1, example: { x: 3230, z: 3220, level: 0 } });
    expect(w.ok && w.data.total).toBe(1);
    expect(nearest(db, 'bank', undefined, { x: 3200, z: 3200, level: 0 }, 5)).toMatchObject({ ok: true, data: { results: [] } });
  });
  test('nearest reports the true distance past 1000 tiles, not a level-penalty modulo', () => {
    // The goblin spawn sits at (3245, 3240, 0); asking from 1500 tiles away on the same level
    // used to come back around 500 (distance + 1000, then % 1000) instead of ~1500.
    const n = nearest(db, 'npc', 'goblin', { x: 3245 + 1500, z: 3240, level: 0 }, 5);
    expect(n.ok).toBe(true);
    if (n.ok) {
      expect(n.data.results[0]?.distance).toBeGreaterThanOrEqual(1400);
      expect(n.data.results[0]?.sameLevel).toBe(true);
    }
  });
  test('shops by item and by area', () => {
    expect(shops(db, { item: 'bronze axe' })).toMatchObject({ ok: true, data: { shops: [{ shop: { slug: 'lumbridge-general-store' }, area: 'Lumbridge', areaSlug: 'lumbridge' }] } });
    expect(shops(db, { area: 'lumbridge' })).toMatchObject({ ok: true, data: { shops: [{ shop: { slug: 'lumbridge-general-store' }, area: 'Lumbridge', areaSlug: 'lumbridge' }] } });
  });
  test('where groups spawns by area, biggest first, and caps the number of groups', () => {
    const w = where(db, 'goblin', 1);
    expect(w.ok).toBe(true);
    if (w.ok) {
      expect(w.data.subject.slug).toBe('goblin');
      expect(w.data.results).toHaveLength(1);
      expect(w.data.results[0]).toMatchObject({ area: 'Lumbridge', count: 1 });
      expect(w.data.areas).toBe(1);
    }
    // over-large and nonsense limits clamp instead of throwing
    expect(where(db, 'goblin', 10_000).ok).toBe(true);
    expect(where(db, 'goblin', 0).ok).toBe(true);
    expect(where(db, 'nothing at all')).toMatchObject({ ok: false, error: 'not_found' });
  });
  test('questOrder with nothing done returns quests with no quest prerequisites', () => {
    expect(questOrder(db, [], false)).toMatchObject({ ok: true });
  });
  test('planContext bundles the best page and trims to budget', () => {
    const r = planContext(db, 'get a bronze axe', 400);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.data.page.slug).toBe('bronze-axe'); expect(r.data.markdown.length).toBeLessThanOrEqual(400 * 4); }
  });
  test('planContext clamps a tiny budget so the cap can never go negative', () => {
    const r = planContext(db, 'bronze axe', 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.markdown.length).toBeLessThanOrEqual(200);
  });
});

describe('escapeLike', () => {
  test('escapes backslash, percent and underscore for a LIKE pattern', () => {
    expect(escapeLike('a_b%')).toBe('a\\_b\\%');
    expect(escapeLike('a\\b')).toBe('a\\\\b');
  });
});
