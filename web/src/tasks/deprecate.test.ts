import { describe, expect, test } from 'vitest';
import { createDeprecations } from './deprecate';

describe('createDeprecations', () => {
  test('warns once per member path, not once per call', () => {
    const lines: string[] = [];
    const d = createDeprecations(t => lines.push(t));
    d.warn('c.anchor(x, z)', 'Use c.anchor({ x, z }). Removed in api 3.');
    d.warn('c.anchor(x, z)', 'Use c.anchor({ x, z }). Removed in api 3.');
    d.warn('hardStop.hpBelow', 'Use hpBelowPoints. Removed in api 3.');
    expect(lines).toEqual([
      'c.anchor(x, z) is deprecated. Use c.anchor({ x, z }). Removed in api 3.',
      'hardStop.hpBelow is deprecated. Use hpBelowPoints. Removed in api 3.'
    ]);
  });

  test('a second run warns again, because the set is run scoped', () => {
    const lines: string[] = [];
    const d = createDeprecations(t => lines.push(t));
    d.warn('c.anchor(x, z)', 'x');
    d.reset();
    d.warn('c.anchor(x, z)', 'x');
    expect(lines).toHaveLength(2);
  });
});
