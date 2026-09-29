import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extractDrops, parseRandomChain } from './drops';
import { parseRs2 } from './parse/rs2';
import { parseDbRows, parseDbTables } from './parse/dbrows';

const fx = (f: string) => readFileSync(path.join(import.meta.dir, 'fixtures', f), 'utf8');

describe('parseRandomChain', () => {
  test('threshold chain yields contiguous ranges with the roll size and members flag', () => {
    const body = `def_int $random = random(128);
if ($random < 4) {
    obj_add(npc_coord, iron_scimitar, 1, ^lootdrop_duration);
} else if ($random < 6) {
    obj_add(npc_coord, steel_sq_shield, 1, ^lootdrop_duration);
} else if ($random < 20) {
    if (map_members = ^true) {
        obj_add(npc_coord, bloodrune, 2, ^lootdrop_duration);
    }
}`;
    const br = parseRandomChain(body);
    expect(br.map(b => [b.lo, b.hi, b.den])).toEqual([[0, 4, 128], [4, 6, 128], [6, 20, 128]]);
    expect(br[2]!.members).toBe(true);
    expect(br[0]!.members).toBe(false);
  });
});

describe('extractDrops', () => {
  const blocks = [...parseRs2(fx('bandit_drops.rs2'), 'scripts/drop tables/scripts/bandit.rs2'), ...parseRs2(fx('shared_droptables.rs2'), 'scripts/drop tables/scripts/shared_droptables.rs2')];
  const tables = parseDbTables([{ file: 'x.dbtable', text: fx('drop_table.dbtable') }]);
  const rows = parseDbRows([{ file: 'scripts/skill_mining/configs/gem_rock_table.dbrow', text: fx('gem_rock_table.dbrow') }], tables);
  const npcs = [{ key: 'brawling_bandit', params: { death_drop: 'bones' }, category: null }];
  const { drops } = extractDrops({ rs2Blocks: blocks, npcs, rows, tables });
  test('100% drop from the death_drop param', () => {
    expect(drops).toContainEqual(expect.objectContaining({ npcKey: 'brawling_bandit', itemKey: 'bones', num: 1, den: 1, table: 'always' }));
  });
  test('script branches become rates; members branch flagged', () => {
    const scim = drops.find(d => d.npcKey === 'brawling_bandit' && d.itemKey === 'iron_scimitar')!;
    expect(scim).toMatchObject({ min: 1, max: 1, num: 4, den: 128, condition: null });
    const blood = drops.find(d => d.itemKey === 'bloodrune')!;
    expect(blood).toMatchObject({ num: 1, den: 128, condition: 'members' });
  });
  test('~randomherb expands into herb sub-rates multiplied through', () => {
    const guam = drops.find(d => d.npcKey === 'brawling_bandit' && d.itemKey === 'unidentified_guam')!;
    // herb branch is thresholds 22..59 of 128 (37/128); guam is 32/128 of the herb roll
    expect(guam.num).toBe(37 * 32);
    expect(guam.den).toBe(128 * 128);
    expect(guam.table).toBe('randomherb');
    expect(guam.condition).toBe('members');
  });
  test('pre-roll members gate gates all proc rows and is not emitted as drop', () => {
    // randomherb proc has if(map_members = ^false) { return (coins, 10); } before $random
    // this means all herb rows are members-only
    const herbCoins = drops.find(d => d.itemKey === 'coins' && d.table === 'randomherb');
    expect(herbCoins).toBeUndefined();
  });
  test('drop_table dbrows attach to the row key as a table subject, not an npc', () => {
    const opal = drops.find(d => d.npcKey === 'gem_rock_table' && d.itemKey === 'uncut_opal')!;
    expect(opal).toMatchObject({ num: 60, den: 128, table: 'gem_rock_table', subjectKind: 'table' });
    expect(drops.find(d => d.npcKey === 'brawling_bandit')!.subjectKind).toBe('npc');
  });
  test('the null object is never a death drop', () => {
    const { drops: d } = extractDrops({ rs2Blocks: [], npcs: [{ key: 'fixture_duck', params: { death_drop: 'null' }, category: null }], rows: [], tables: new Map() });
    expect(d).toEqual([]);
  });
  test('drop counts with nested random() and calc() wrappers', () => {
    const syntheticText = `[ai_queue3,fixture_npc]
def_int $random = random(4);
if ($random < 2) {
    obj_add(npc_coord, coins, random(3)+1, ^lootdrop_duration);
} else if ($random < 4) {
    obj_add(npc_coord, coins, calc(5+random(2)), ^lootdrop_duration);
}`;
    const syntheticBlocks = parseRs2(syntheticText, 'fixture.rs2');
    const { drops: syntheticDrops } = extractDrops({ rs2Blocks: syntheticBlocks, npcs: [], rows: [], tables: new Map() });
    const coins1 = syntheticDrops.find(d => d.itemKey === 'coins' && d.min === 1);
    const coins2 = syntheticDrops.find(d => d.itemKey === 'coins' && d.min === 5);
    expect(coins1).toMatchObject({ min: 1, max: 3, num: 2, den: 4 });
    expect(coins2).toMatchObject({ min: 5, max: 6, num: 2, den: 4 });
  });
});

describe('category death scripts', () => {
  const catBlocks = parseRs2(`[ai_queue3,_fixture_cat]
def_int $random = random(4);
if ($random < 2) {
    obj_add(npc_coord, bones, 1, ^lootdrop_duration);
}

[ai_queue3,_category_7]
def_int $random = random(4);
if ($random < 1) {
    obj_add(npc_coord, coins, 1, ^lootdrop_duration);
}

[ai_queue3,_nobody_has_this]
def_int $random = random(4);
if ($random < 1) {
    obj_add(npc_coord, coins, 1, ^lootdrop_duration);
}`, 'fixture.rs2');
  const npcs = [
    { key: 'fixture_a', params: {}, category: 'fixture_cat' },
    { key: 'fixture_b', params: {}, category: 'fixture_cat' },
    { key: 'fixture_c', params: {}, category: 'named_seven' },
    { key: 'fixture_d', params: {}, category: 'category_7' }
  ];
  const categoryPack = { byKey: new Map([['named_seven', 7]]), byId: new Map([[7, 'named_seven']]) };
  const { drops, unmatchedCategories } = extractDrops({ rs2Blocks: catBlocks, npcs, rows: [], tables: new Map(), categoryPack });

  test('a leading-underscore subject names a category and fans out to every npc in it', () => {
    expect(drops.filter(d => d.itemKey === 'bones').map(d => d.npcKey).sort()).toEqual(['fixture_a', 'fixture_b']);
  });
  test('_category_<id> resolves through category.pack and also matches a literal category_<id>', () => {
    expect(drops.filter(d => d.itemKey === 'coins').map(d => d.npcKey).sort()).toEqual(['fixture_c', 'fixture_d']);
  });
  test('no row is ever keyed on the category itself', () => {
    expect(drops.filter(d => d.npcKey.startsWith('_'))).toEqual([]);
  });
  test('a category matching no npc is reported as a gap instead of emitting rows', () => {
    expect(unmatchedCategories).toEqual(['_nobody_has_this']);
  });
});
