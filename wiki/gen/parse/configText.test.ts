import { describe, expect, test } from 'bun:test';
import { parseConfigText } from './configText';

const SAMPLE = `[worm]
name=Worm
desc=Ugh! It's wriggling!
cost=0
param=magicattack,10
param=stabdefence,1
weight=3g
// https://example.org/worm
members=yes

[helemos]
name=Helemos
op1=Talk-to // https://youtu.be/abc
op3=Trade
`;

describe('parseConfigText', () => {
  test('splits blocks and keeps multi-valued keys in order', () => {
    const blocks = parseConfigText(SAMPLE, 'x.obj');
    expect(blocks.map(b => b.key)).toEqual(['worm', 'helemos']);
    expect(blocks[0]!.fields.get('name')).toEqual(['Worm']);
    expect(blocks[0]!.fields.get('param')).toEqual(['magicattack,10', 'stabdefence,1']);
    expect(blocks[0]!.line).toBe(1);
  });
  test('keeps a value containing = and apostrophes intact', () => {
    const blocks = parseConfigText('[a]\ndesc=1+1=2 isn\'t it\n', 'y.obj');
    expect(blocks[0]!.fields.get('desc')).toEqual(["1+1=2 isn't it"]);
  });
  test('collects url citations from comment lines and trailing comments', () => {
    const blocks = parseConfigText(SAMPLE, 'x.obj');
    expect(blocks[0]!.citations).toEqual(['https://example.org/worm']);
    expect(blocks[1]!.citations).toEqual(['https://youtu.be/abc']);
    expect(blocks[1]!.fields.get('op1')).toEqual(['Talk-to']);
  });
});
