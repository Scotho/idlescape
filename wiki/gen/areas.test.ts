import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extractAreas, parsePacked } from './areas';

const fx = (f: string) => readFileSync(path.join(import.meta.dir, 'fixtures', f), 'utf8');

describe('areas', () => {
  const a = extractAreas({ labelsText: fx('labels.txt'), free2playText: fx('free2play.csv'), multiwayText: '0_50_50_0_0\n' });
  test('labels become areas with slash turned into space and size kept', () => {
    const duel = a.areas.find(x => x.slug === 'duel-arena')!;
    expect(duel.name).toBe('Duel Arena');
    expect(duel.coord).toEqual({ x: 3361, z: 3233, level: 0 });
    expect(duel.size).toBe(1);
  });
  test('packed coordinates convert to absolute', () => {
    expect(parsePacked('0_50_50_8_0')).toEqual({ level: 0, x: 3208, z: 3200 });
  });
  test('free-to-play and multiway tests use the 8x8 zone of the coordinate', () => {
    expect(a.isFree({ x: 3203, z: 3205, level: 0 })).toBe(true);
    expect(a.isFree({ x: 3216, z: 3200, level: 0 })).toBe(false);
    expect(a.isMultiway({ x: 3207, z: 3207, level: 0 })).toBe(true);
  });
  test('nearestArea returns the closest label within reach', () => {
    expect(a.nearestArea({ x: 3222, z: 3218, level: 0 })!.name).toBe('Lumbridge');
    expect(a.nearestArea({ x: 3290, z: 3160, level: 0 })!.name).toBe('Al Kharid');
    expect(a.nearestArea({ x: 2000, z: 2000, level: 0 })).toBeNull();
  });
});
