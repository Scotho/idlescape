import { describe, expect, test } from 'bun:test';
import { slugify, dedupeSlugs, aliasesFor } from './slug';

describe('slug', () => {
  test('slugify follows wiki title rules', () => {
    expect(slugify("Cook's Assistant")).toBe('cooks-assistant');
    expect(slugify('Cape of saradomin')).toBe('cape-of-saradomin');
    expect(slugify('Romeo & Juliet')).toBe('romeo-and-juliet');
    expect(slugify('  Gu\'Tanoth ')).toBe('gutanoth');
    expect(slugify(`Gu’Tanoth`)).toBe('gutanoth');
  });
  test('dedupeSlugs appends -2, -3 in id order', () => {
    const rows = [{ id: 5, name: 'Man', slug: 'man' }, { id: 1, name: 'Man', slug: 'man' }, { id: 7, name: 'Man', slug: 'man' }];
    dedupeSlugs(rows);
    expect(rows.map(r => r.slug)).toEqual(['man-2', 'man', 'man-3']);
  });
  test('dedupeSlugs skips a candidate already taken by an unrelated entity', () => {
    // A literal key like "coins_2" slugifies to "coins-2" on its own; that must not collide with
    // the second of several distinct "Coins" items whose naive dedup would also want "coins-2".
    const rows = [
      { id: 1, name: 'Coins', slug: 'coins' },
      { id: 2, name: 'coins_2', slug: 'coins-2' },
      { id: 3, name: 'Coins', slug: 'coins' },
      { id: 4, name: 'Coins', slug: 'coins' },
    ];
    dedupeSlugs(rows);
    const slugs = rows.map(r => r.slug);
    expect(slugs).toEqual(['coins', 'coins-2', 'coins-3', 'coins-4']);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  test('aliasesFor includes the symbolic key spaced out', () => {
    expect(aliasesFor('bronze_axe', 'Bronze axe')).toEqual(['bronze axe']);
    expect(aliasesFor('rune_scimitar', 'Rune scimitar')).toEqual(['rune scimitar']);
  });
});
