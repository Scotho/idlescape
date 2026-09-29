import { describe, expect, test } from 'vitest';
import { packLocal, parseJm2, squareCoords } from './jm2';

const FIXTURE = [
  '==== MAP ====',
  '0 0 0: u48',
  '0 4 9: h50 o10;1;3 f4 u50',
  '0 5 7: h50 o10 f1 u50',
  '1 5 7: f2',
  '==== LOC ====',
  '0 0 0: 1247 22 3',
  '0 0 7: 1258 22',
  '0 0 8: 1911 3 1',
  '0 0 8: 1938',
  '==== NPC ====',
  '0 0 38: 59',
  '==== OBJ ====',
  '0 5 27: 882 1'
].join('\n');

describe('parseJm2', () => {
  const square = parseJm2(FIXTURE, 50, 50);

  test('reads the f token, and only the f token, as the flags', () => {
    expect(square.land.get(packLocal(0, 4, 9))).toBe(4);
    expect(square.land.get(packLocal(0, 5, 7))).toBe(1);
    expect(square.land.get(packLocal(1, 5, 7))).toBe(2);
    // A tile with no f token is present with flags 0, not absent: "not blocked" and
    // "not in the file" have to be distinguishable for the bridge lookup in Task 4.
    expect(square.land.get(packLocal(0, 0, 0))).toBe(0);
  });

  test('defaults an omitted loc shape to 10 and an omitted angle to 0', () => {
    expect(square.locs).toContainEqual({ level: 0, x: 0, z: 7, id: 1258, shape: 22, angle: 0 });
    expect(square.locs).toContainEqual({ level: 0, x: 0, z: 8, id: 1938, shape: 10, angle: 0 });
  });

  test('keeps every loc on a tile that carries more than one', () => {
    const onTile = square.locs.filter(l => l.level === 0 && l.x === 0 && l.z === 8);
    expect(onTile.map(l => l.id).sort()).toEqual([1911, 1938]);
  });

  test('reads npc spawns and ignores the OBJ section', () => {
    expect(square.npcs).toEqual([{ level: 0, x: 0, z: 38, id: 59 }]);
  });

  test('squareCoords reads the map square out of the file name', () => {
    expect(squareCoords('m50_50.jm2')).toEqual({ mx: 50, mz: 50 });
    expect(squareCoords('m29_75.jm2')).toEqual({ mx: 29, mz: 75 });
    expect(squareCoords('free2play.csv')).toBeNull();
  });
});
