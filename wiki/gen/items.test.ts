import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extractItems, loadParamDefaults, parseWeight } from './items';
import { parsePackIds } from './parse/packIds';

const fx = (f: string) => readFileSync(path.join(import.meta.dir, 'fixtures', f), 'utf8');

describe('parseWeight', () => {
  test('grams, kilograms, pounds, ounces', () => {
    expect(parseWeight('3g')).toBe(3);
    expect(parseWeight('1.8kg')).toBe(1800);
    expect(parseWeight('1lb')).toBe(453);
    expect(parseWeight('4oz')).toBe(113);
    expect(parseWeight('')).toBe(0);
  });
});

describe('extractItems', () => {
  const items = extractItems({
    objTexts: [{ file: 'scripts/x/items.obj', text: fx('items.obj') }],
    objPack: parsePackIds(fx('obj.pack')),
    paramDefaults: loadParamDefaults([fx('params.param')])
  });
  test('basic fields, members, alch values', () => {
    const worm = items.find(i => i.key === 'worm')!;
    expect(worm.id).toBe(0);
    expect(worm.name).toBe('Worm');
    expect(worm.examine).toBe("Ugh! It's wriggling!");
    expect(worm.members).toBe(true);
    expect(worm.weightG).toBe(3);
    expect(worm.bonuses).toBeNull();
    expect(worm.slug).toBe('worm');
  });
  test('equipable item gets bonuses with param defaults and level requirements', () => {
    const cape = items.find(i => i.key === 'saradomin_cape')!;
    expect(cape.wearpos).toBe('back');
    expect(cape.bonuses).toMatchObject({ magicAttack: 10, stabDefence: 1, crushDefence: 2, magicDefence: 10, slashAttack: 0, attackRate: null });
    expect(cape.tradeable).toBe(false);
    expect(cape.highAlch).toBe(60);
    expect(cape.lowAlch).toBe(40);
    const scim = items.find(i => i.key === 'bronze_scimitar_fixture')!;
    expect(scim.bonuses?.attackRate).toBe(4);
    expect(scim.levelRequire).toEqual([{ skill: 'attack', level: 1 }]);
  });
  test('sources carry the file block and the cited urls', () => {
    const scim = items.find(i => i.key === 'bronze_scimitar_fixture')!;
    expect(scim.sources).toContainEqual({ kind: 'content', ref: 'content:scripts/x/items.obj#bronze_scimitar_fixture' });
    expect(scim.sources.some(s => s.kind === 'cited' && s.ref.includes('osrs-dumps'))).toBe(true);
  });
  test('items missing from the pack are skipped', () => {
    const out = extractItems({ objTexts: [{ file: 'f.obj', text: '[ghost]\nname=Ghost\n' }], objPack: parsePackIds(''), paramDefaults: new Map() });
    expect(out).toEqual([]);
  });
});
