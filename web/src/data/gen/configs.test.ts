import { expect, test } from 'vitest';
import { first, ops, parseConfigText, parsePack } from './configs';

const LOC_TEXT = `// a comment
[tree]
name=Tree
width=2
length=2
op1=Chop down
op3=hidden
category=tree
param=next_loc_stage,treestump2
param=ent,macro_ent_tree1

[bank_booth]
name=Bank booth
op2=Use-quickly
blockwalk=no
`;

test('a block keeps repeated keys in file order', () => {
  const blocks = parseConfigText(LOC_TEXT);
  expect([...blocks.keys()]).toEqual(['tree', 'bank_booth']);
  expect(blocks.get('tree')!.param).toEqual(['next_loc_stage,treestump2', 'ent,macro_ent_tree1']);
  expect(first(blocks.get('tree')!, 'name')).toBe('Tree');
  expect(first(blocks.get('tree')!, 'missing')).toBeUndefined();
});

test('ops collects op1..op5 and drops the hidden marker', () => {
  const blocks = parseConfigText(LOC_TEXT);
  expect(ops(blocks.get('tree')!)).toEqual(['Chop down']);
  expect(ops(blocks.get('bank_booth')!)).toEqual(['Use-quickly']);
});

test('a value containing = is kept whole', () => {
  const blocks = parseConfigText('[x]\ndesc=a=b\n');
  expect(first(blocks.get('x')!, 'desc')).toBe('a=b');
});

test('parsePack reads id=debugname', () => {
  const pack = parsePack('0=hans\n1=man\n\n2=man2\n');
  expect(pack.get(1)).toBe('man');
  expect(pack.size).toBe(3);
});
