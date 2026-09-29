// The library fake's own contract, for the wait members whose answer a script branches on.
//
// Every test that reaches this fake goes through `as unknown as ScriptContext`
// (library.harness.ts, the return), so the cast throws away every signature in the file. The
// `wait` bag carries a `satisfies ScriptContext['wait']` for that reason, and these cases pin
// the answers the annotation cannot: `wait.ticks` widened to a boolean under R6, and a fake
// still answering `undefined` would send a script that branches on it down the stopped-run
// path under the harness while the real member said the ticks were counted.
import { describe, expect, test } from 'vitest';
import { libraryHarness } from './library.harness';

describe('the library harness fake of c.wait', () => {
  test('ticks answers true, the way the real member answers a run that was never stopped', async () => {
    const h = libraryHarness();
    await expect(h.ctx.wait.ticks(2)).resolves.toBe(true);
  });

  test('the members added with the family answer a boolean too', async () => {
    const h = libraryHarness();
    await expect(h.ctx.wait.animation({ id: 879 })).resolves.toBe(true);
    await expect(h.ctx.wait.hp({ belowPercent: 20 })).resolves.toBe(true);
  });
});
