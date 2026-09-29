// The contract between the script and the pinned content. `steps.ts` is generated from
// `tut_chatbox_steps.rs2`; `titles.ts` is hand written and is what every stage matches on. If a
// content bump renames a step, this is the test that says so, and it is the only warning anyone
// gets before the script sits on the island for its whole 25 minute estimate.
import { expect, test } from 'vitest';
import { TUTORIAL_STEPS } from './steps';
import { MATCHED_TITLES, T } from './titles';

test('every title the script matches on is still in the content', () => {
  for (const title of MATCHED_TITLES) {
    expect(TUTORIAL_STEPS, `"${title}" is gone from tut_chatbox_steps.rs2`).toContain(title);
  }
});

test('the content still calls 74 steps, 13 of them untitled', () => {
  // Literals, not `MATCHED_TITLES.length`: the point is what the pinned clone holds. The plan
  // said three empty titles; the clone has thirteen, and thirteen is what a change has to move.
  // 74, not 75: the file holds a 75th `~tutorialstep` call that is commented out, and the
  // generator skips it, so this list is the steps the tutorial calls rather than the lines the
  // file carries.
  expect(TUTORIAL_STEPS).toHaveLength(74);
  expect(TUTORIAL_STEPS.filter(t => t === '')).toHaveLength(13);
});

test('title matching alone cannot identify a step, which is why the flashing tab and the hint are read too', () => {
  const seen = new Map<string, number>();
  for (const title of TUTORIAL_STEPS) seen.set(title, (seen.get(title) ?? 0) + 1);
  expect(seen.get('')).toBe(13);
  expect(seen.get('Mining.')).toBe(3);
  expect(seen.get("It's tin.")).toBe(2);
  // Once, not twice: the second one in the file is the commented-out call, and a generator that
  // counted it would put a step here the tutorial never shows.
  expect(seen.get('Interacting with scenery')).toBe(1);
});

test('the titles the two ladders sit under are the ones the routes are keyed to', () => {
  // `combat.ts` climbs to the bank on this title and nothing else; `quest.ts` goes down to the
  // mine on an empty title plus a hint, which is why the empty ones above matter.
  expect(TUTORIAL_STEPS).toContain('Moving on.');
  expect(T.movingOn).toBe('Moving on.');
});

test('a title the stages do not know is not silently in the matched set', () => {
  // The negative half of the contract: `MATCHED_TITLES` is the stages' whole vocabulary, so a
  // title from the content that no stage names must not appear in it.
  expect(TUTORIAL_STEPS).toContain('Burning your shrimp.');
  expect(MATCHED_TITLES).not.toContain('A step from a future content bump');
  expect(MATCHED_TITLES).not.toContain('Sit back and watch');
});
