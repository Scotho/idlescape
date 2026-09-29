import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseJm2 } from './jm2';

describe('parseJm2', () => {
  const text = readFileSync(path.join(import.meta.dir, '..', 'fixtures', 'm50_50.jm2'), 'utf8');
  const out = parseJm2(text, 'maps/m50_50.jm2');
  test('npc lines become absolute coordinates from the file name', () => {
    expect(out.npcs[0]).toEqual({ level: 0, x: 3200, z: 3238, id: 59, count: 1 });
  });
  test('obj lines carry counts and levels', () => {
    expect(out.objs[1]).toEqual({ level: 2, x: 3205, z: 3224, id: 1511, count: 3 });
  });
  test('loc lines ignore shape and rotation', () => {
    expect(out.locs).toHaveLength(2);
    expect(out.locs[1]).toEqual({ level: 0, x: 3200, z: 3207, id: 1258, count: 1 });
  });
});
