import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extractShops } from './shops';
import { parseRs2 } from './parse/rs2';
import { parsePackIds } from './parse/packIds';

const fx = (f: string) => readFileSync(path.join(import.meta.dir, 'fixtures', f), 'utf8');

describe('extractShops', () => {
  const shops = extractShops({
    invTexts: [{ file: 'scripts/h/heroes.inv', text: fx('shop.inv') }],
    invPack: parsePackIds('0=dragonaxeshop\n1=fixture_generalshop\n'),
    npcTexts: [{ file: 'scripts/h/h.npc', text: fx('shopkeeper.npc') }],
    npcPack: parsePackIds('0=helemos\n1=fixture_shopkeeper\n'),
    rs2Blocks: parseRs2(fx('shopkeeper.rs2'), 'scripts/h/keeper.rs2'),
    npcSpawns: [{ kind: 'npc', id: 0, key: 'helemos', coord: { x: 2900, z: 3510, level: 0 }, count: 1, area: 'heroes-guild', file: 'maps/m45_54.jm2' }]
  });
  test('stock rows, flags, owner via npc param, coords from owner spawns', () => {
    const s = shops.find(x => x.key === 'dragonaxeshop')!;
    expect(s.stock).toEqual([{ itemKey: 'dragon_battleaxe', count: 2, restockTicks: 500 }, { itemKey: 'dragon_mace', count: 2, restockTicks: 500 }]);
    expect(s.buysAll).toBe(false);
    expect(s.restocks).toBe(true);
    expect(s.ownerNpcKeys).toEqual(['helemos']);
    expect(s.coords).toEqual([{ x: 2900, z: 3510, level: 0 }]);
    expect(s.sources.some(x => x.kind === 'cited' && x.ref.includes('web.archive.org'))).toBe(true);
  });
  test('owner and title via ~openshop(<inv>) call in an opnpc block', () => {
    const g = shops.find(x => x.key === 'fixture_generalshop')!;
    expect(g.ownerNpcKeys).toEqual(['fixture_shopkeeper']);
    expect(g.buysAll).toBe(true);
    expect(g.name).toBe('Fixture General Store');
  });
});
