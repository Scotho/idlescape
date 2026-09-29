import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extractMethods, extractSkills, levelForXp, xpForLevel } from './skills';
import { parseDbRows, parseDbTables } from './parse/dbrows';

const fx = (f: string) => readFileSync(path.join(import.meta.dir, 'fixtures', f), 'utf8');

describe('xp table (engine Player.ts levelExperience)', () => {
  test('known anchors', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(83);
    expect(xpForLevel(10)).toBe(1154);
    expect(xpForLevel(50)).toBe(101333);
    expect(xpForLevel(99)).toBe(13034431);
    expect(levelForXp(13034431)).toBe(99);
    expect(levelForXp(82)).toBe(1);
  });
});

describe('extractSkills', () => {
  const skills = extractSkills({ statEnumText: fx('stat.enum'), unlocksEnumText: fx('levelup_unlocks.enum') });
  test('19 skills in enum order, members from stats_free, unlock levels attached', () => {
    expect(skills).toHaveLength(19);
    expect(skills[0]).toMatchObject({ key: 'attack', name: 'Attack', index: 1, members: false, unlocks: [5, 10, 20, 30, 40, 60] });
    expect(skills.find(s => s.key === 'agility')!.members).toBe(true);
    expect(skills.find(s => s.key === 'runecraft')!.name).toBe('Runecraft');
  });
});

describe('extractMethods', () => {
  const tables = parseDbTables([{ file: 'scripts/skill_woodcutting/configs/trees.dbtable', text: fx('trees.dbtable') }]);
  const rows = parseDbRows([{ file: 'scripts/skill_woodcutting/configs/trees.dbrow', text: fx('trees.dbrow') }], tables);
  test('a row with levelrequired and productexp becomes a method with the skill from the folder', () => {
    const m = extractMethods({ rows, tables })[0]!;
    expect(m).toMatchObject({ skill: 'woodcutting', level: 1, xp: 25, action: 'Chop normal tree', outputs: ['logs'], table: 'woodcutting_trees', row: 'normal_tree_table' });
    expect(m.inputs).toContain('bronze_axe');
    expect(m.sources[0]!.ref).toBe('content:scripts/skill_woodcutting/configs/trees.dbrow#normal_tree_table');
  });
  test('the RuneScript null object is not an input or an output', () => {
    const t = parseDbTables([{ file: 'scripts/skill_cooking/configs/stews.dbtable', text: '[cooking_stews]\ncolumn=levelrequired,int\ncolumn=productexp,int\ncolumn=product,namedobj,LIST\ncolumn=ingredient,namedobj,LIST\n' }]);
    const r = parseDbRows([{ file: 'scripts/skill_cooking/configs/stews.dbrow', text: '[stew_table]\ntable=cooking_stews\ndata=levelrequired,25\ndata=productexp,1170\ndata=product,stew\ndata=product,null\ndata=ingredient,bowl_water\ndata=ingredient,null\n' }], t);
    const m = extractMethods({ rows: r, tables: t })[0]!;
    expect(m.outputs).toEqual(['stew']);
    expect(m.inputs).toEqual(['bowl_water']);
  });
});
