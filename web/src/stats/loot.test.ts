import { describe, expect, test } from 'vitest';
import { createLootLog } from './loot';

describe('loot log', () => {
  test('aggregates added items by id and keeps first seen', () => {
    const l = createLootLog();
    l.onInventory({ added: [{ id: 335, count: 1 }] }, 100);
    l.onInventory({ added: [{ id: 335, count: 2 }, { id: 1511, count: 1 }] }, 200);
    expect(l.entries()).toEqual([{ id: 335, count: 3, firstSeen: 100 }, { id: 1511, count: 1, firstSeen: 200 }]);
  });
});
