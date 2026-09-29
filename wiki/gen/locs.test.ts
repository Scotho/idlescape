import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extractLocs } from './locs';
import { parsePackIds } from './parse/packIds';

const fx = (f: string) => readFileSync(path.join(import.meta.dir, 'fixtures', f), 'utf8');

describe('extractLocs', () => {
  const locs = extractLocs({ locTexts: [{ file: 'scripts/a/gate.loc', text: fx('locs.loc') }], locPack: parsePackIds(fx('loc.pack')) });
  test('gate keeps options, examine, category and next stage param', () => {
    const g = locs.find(l => l.key === 'border_gate_toll_left')!;
    expect(g.name).toBe('Gate');
    expect(g.options).toEqual(['Open']);
    expect(g.category).toBe('border_gate_toll_left');
    expect(g.params['next_loc_stage']).toBe('loc_1562');
    expect(g.width).toBe(1);
  });
  test('duplicate names get numbered slugs by id', () => {
    const two = extractLocs({ locTexts: [{ file: 'f.loc', text: '[a]\nname=Tree\n[b]\nname=Tree\n' }], locPack: parsePackIds('0=a\n1=b\n') });
    expect(two.map(l => l.slug)).toEqual(['tree', 'tree-2']);
  });
});
