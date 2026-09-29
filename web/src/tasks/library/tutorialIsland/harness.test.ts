// The stage fake's own contract, for the members a cast would otherwise let drift.
//
// Every test in this directory reaches the fake through `as unknown as ScriptContext`
// (harness.ts, the return), so no typecheck ever compares a fake member's signature with the
// interface member it stands in for. `clickThrough` now takes either a positional budget or a
// `ClickThroughOpts` bag, and a fake that understood only the first would read a bag as a number:
// `i < max` against an object is false, so the loop would click nothing, return, and leave a
// stage test green over a run that did nothing at all.
import { describe, expect, test } from 'vitest';
import { tutorialHarness } from './harness';
import type { HarnessWorld } from './harness';

/** A chatbox showing the instructor speaking: one option, and it is the continue line. */
const talking = (): HarnessWorld => ({ dialog: { isOpen: true, options: [{ text: 'Click here to continue', index: 1 }] } });

describe('the tutorial harness fake of c.tutorial.clickThrough', () => {
  test('spends the grandfathered positional budget', async () => {
    const h = tutorialHarness({ world: talking() });
    await h.ctx.tutorial.clickThrough(3);
    expect(h.calls.dialogClicks).toEqual([0, 0, 0]);
  });

  test('reads maxClicks out of the options bag, which is the compliant form', async () => {
    const h = tutorialHarness({ world: talking() });
    await h.ctx.tutorial.clickThrough({ maxClicks: 3 });
    expect(h.calls.dialogClicks).toEqual([0, 0, 0]);
  });

  test('defaults to ten clicks on either arm, the same default the real one carries', async () => {
    const bare = tutorialHarness({ world: talking() });
    await bare.ctx.tutorial.clickThrough();
    const bag = tutorialHarness({ world: talking() });
    await bag.ctx.tutorial.clickThrough({ timeoutMs: 500 });
    expect(bare.calls.dialogClicks).toHaveLength(10);
    expect(bag.calls.dialogClicks).toHaveLength(10);
  });

  test('stops at a frame offering a real choice whichever arm asked for the clicks', async () => {
    const world: HarnessWorld = { dialog: { isOpen: true, options: [{ text: 'Click here to continue' }, { text: 'Yes please.' }] } };
    const positional = tutorialHarness({ world });
    await positional.ctx.tutorial.clickThrough(3);
    const bag = tutorialHarness({ world });
    await bag.ctx.tutorial.clickThrough({ maxClicks: 3 });
    expect(positional.calls.dialogClicks).toEqual([]);
    expect(bag.calls.dialogClicks).toEqual([]);
  });
});

describe('the tutorial harness fake of c.wait', () => {
  test('ticks answers true, the way the real member answers a run that was never stopped', async () => {
    const h = tutorialHarness({ world: talking() });
    await expect(h.ctx.wait.ticks(2)).resolves.toBe(true);
    expect(h.calls.waited).toEqual(['ticks']);
  });

  test('the members added with the family answer a boolean and are recorded', async () => {
    const h = tutorialHarness({ world: talking() });
    await expect(h.ctx.wait.animation({ id: 879 })).resolves.toBe(true);
    await expect(h.ctx.wait.hp({ belowPercent: 20 })).resolves.toBe(true);
    expect(h.calls.waited).toEqual(['animation', 'hp']);
  });
});
