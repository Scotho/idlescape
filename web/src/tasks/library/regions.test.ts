import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isTutorialRegion, regionId, TUTORIAL_REGION_IDS } from './regions';

describe('regionId', () => {
  it('packs a map square the way the engine reports it', () => {
    // Literals, not `(mx << 8) | mz` again: an assertion that repeats the implementation
    // passes for any packing at all. 48 * 256 + 48 = 12336, which is Tutorial Island's
    // main square, and 50 * 256 + 50 = 12850, which is Lumbridge.
    expect(regionId(48, 48)).toBe(12336);
    expect(regionId(50, 50)).toBe(12850);
    // The two coordinates are not interchangeable: transposing them has to change the answer.
    expect(regionId(48, 148)).toBe(12436);
    expect(regionId(148, 48)).toBe(37936);
  });
});

describe('TUTORIAL_REGION_IDS', () => {
  it('is the six squares the island covers', () => {
    expect([...TUTORIAL_REGION_IDS].sort((a, b) => a - b)).toEqual([12079, 12080, 12335, 12336, 12436, 12592]);
  });

  it('is exactly what the Tutorial Island spec inlines', () => {
    // `web/e2e/tutorial-island.pw.test.ts` cannot import this module: its predicate runs inside
    // the browser through `page.evaluate`, which no closure crosses, so it inlines the six
    // numbers. `web/e2e` is outside tsconfig's include and outside `eslint src/`, so nothing
    // mechanical watches that copy: this test reads the spec file itself and compares. An
    // assertion against literals alone left the half that can actually drift unguarded.
    //
    // `join(dirname(fileURLToPath(import.meta.url)), ...)` and not `new URL(...)`: Vite rewrites
    // the second into an asset URL and it throws under vitest.
    const spec = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../e2e/tutorial-island.pw.test.ts'), 'utf8');
    const match = /const TUTORIAL_REGION_IDS = \[([^\]]*)\]/.exec(spec);
    expect(match, 'the spec still declares an inlined TUTORIAL_REGION_IDS array').not.toBeNull();
    // Sorted on both sides: the spec only ever asks `includes`, so the order is not part of the
    // contract and pinning it would fail on a harmless re-ordering. The membership is.
    const inlined = (match?.[1] ?? '').split(',').map(n => Number(n.trim())).sort((a, b) => a - b);
    expect(inlined).toEqual([...TUTORIAL_REGION_IDS].sort((a, b) => a - b));
  });
});

describe('isTutorialRegion', () => {
  it('is true on the island and false off it', () => {
    expect(isTutorialRegion(12336)).toBe(true);
    // Lumbridge, where the tutorial drops a character off, and its two neighbours.
    expect(isTutorialRegion(12850)).toBe(false);
    expect(isTutorialRegion(12594)).toBe(false);
  });

  it('is false for a state that carries no region yet', () => {
    // The pre-login snapshot, which is `undefined` rather than 0: `includes(undefined)` on a
    // number array is false anyway, so this pins the guard rather than the array.
    expect(isTutorialRegion(undefined)).toBe(false);
  });
});
