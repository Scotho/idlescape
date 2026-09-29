import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadPackIdsIfPresent, parsePackIds } from './packIds';

describe('parsePackIds', () => {
  test('maps both directions and ignores blank lines', () => {
    const m = parsePackIds('0=hans\n1=man\n\n2=man2\n');
    expect(m.byKey.get('man')).toBe(1);
    expect(m.byId.get(2)).toBe('man2');
    expect(m.byId.size).toBe(3);
  });
});

describe('loadPackIdsIfPresent', () => {
  test('returns undefined for a clone without the generated pack, and the ids when it exists', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'packids-'));
    try {
      mkdirSync(path.join(dir, 'pack'));
      expect(loadPackIdsIfPresent(dir, 'category')).toBeUndefined();
      writeFileSync(path.join(dir, 'pack', 'category.pack'), '0=first\n7=named_seven\n');
      const ids = loadPackIdsIfPresent(dir, 'category');
      expect(ids?.byId.get(7)).toBe('named_seven');
      expect(ids?.byKey.get('first')).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
