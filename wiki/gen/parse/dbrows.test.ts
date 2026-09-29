import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseDbRows, parseDbTables } from './dbrows';

const fx = (f: string) => readFileSync(path.join(import.meta.dir, '..', 'fixtures', f), 'utf8');

describe('dbrows', () => {
  const tables = parseDbTables([{ file: 'trees.dbtable', text: fx('trees.dbtable') }]);
  const rows = parseDbRows([{ file: 'trees.dbrow', text: fx('trees.dbrow') }], tables);
  test('table columns with types and flags', () => {
    expect(tables.get('woodcutting_trees')![0]).toEqual({ name: 'levelrequired', types: ['int'], list: false });
    expect(tables.get('woodcutting_trees')![1]).toMatchObject({ name: 'tree', types: ['loc'], list: true });
    expect(tables.get('woodcutting_trees')![5]).toEqual({ name: 'successchance', types: ['namedobj', 'int', 'int'], list: true });
  });
  test('row values grouped per column, tuples kept, lists accumulate', () => {
    const r = rows[0]!;
    expect(r.table).toBe('woodcutting_trees');
    expect(r.key).toBe('normal_tree_table');
    expect(r.values['levelrequired']).toEqual([['0']]);
    expect(r.values['productexp']).toEqual([['250']]);
    expect(r.values['product']).toEqual([['logs']]);
    expect(r.values['tree']!.length).toBeGreaterThan(10);
    expect(r.values['successchance']![0]).toEqual(['bronze_axe', '64', '200']);
  });
});
