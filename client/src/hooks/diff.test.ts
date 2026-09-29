import { describe, expect, test } from 'bun:test';
import { diffInventory, diffXp } from './diff';

describe('diffXp', () => {
  test('emits one event per changed skill with delta', () => {
    const prev = [0, 100, 50];
    const next = [0, 130, 50];
    const levels = [1, 2, 1];
    expect(diffXp(prev, next, levels)).toEqual([{ skill: 1, xp: 130, level: 2, delta: 30 }]);
  });
  test('first sync (prev empty) emits nothing', () => {
    expect(diffXp([], [10, 20], [1, 1])).toEqual([]);
  });
});

describe('diffInventory', () => {
  test('reports added and removed by id with count deltas', () => {
    const ev = diffInventory([335, 314, 0], [1, 5, 0], [335, 314, 1511], [3, 2, 1]);
    expect(ev.added).toEqual([{ id: 335, count: 2 }, { id: 1511, count: 1 }]);
    expect(ev.removed).toEqual([{ id: 314, count: 3 }]);
  });
  test('slot moves are not changes', () => {
    const ev = diffInventory([335, 314], [1, 1], [314, 335], [1, 1]);
    expect(ev.added).toEqual([]);
    expect(ev.removed).toEqual([]);
  });
});
