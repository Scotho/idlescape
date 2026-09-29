import { describe, expect, test } from 'vitest';
import { createDialog } from './dialog';

const OPTIONS = [
  { text: 'Yes please.', index: 1 },
  { text: 'No thanks.', index: 2 },
  { text: "I'll think about it.", index: 3 }
];

/**
 * The fake is a SCRIPTED SEQUENCE of dialogue frames, not one frozen frame. A frozen frame is
 * a hang: `complete` loops until the dialogue ends, and against a state that never changes and
 * a `wait.until` that always resolves true, a faithful implementation never terminates and the
 * suite times out rather than failing. Each click advances to the next frame; the last frame is
 * closed. `frames` is also what lets the multi-step assertion below say two clicks rather than
 * one, which is the difference between testing a tree and testing a single choice.
 *
 * A typed factory, not `as never`: the Global Constraints ban `as any`, and `as never` defeats
 * the same check by another spelling. `DialogDeps.state` reads two fields, so it is declared to
 * take two fields.
 */
type DialogFrame = { isOpen: boolean; options?: { text: string; index?: number }[]; text?: string };

function harness(
  frames: DialogFrame[] = [{ isOpen: true, options: OPTIONS, text: 'Do you want to skip the tutorial?' }],
  signal: AbortSignal = new AbortController().signal
) {
  const clicked: number[] = [];
  let at = 0;
  const dialog = createDialog({
    state: () => ({ dialog: frames[Math.min(at, frames.length - 1)] }),
    click: async i => { clicked.push(i); at++; return { success: true, message: 'ok' }; },
    wait: { until: async () => true, dialog: async () => true },
    signal: () => signal
  });
  return { dialog, clicked };
}

/**
 * The three synchronous reads over one frozen world, for the cases that need `recentDialogs`
 * beside the frame. A click here is a failure rather than a recorded number: nothing in this
 * factory's tests clicks.
 */
function reader(world: { dialog?: DialogFrame; recentDialogs?: { text: string[] }[] }) {
  return createDialog({
    state: () => world,
    click: async () => { throw new Error('a read must not click'); },
    wait: { until: async () => true, dialog: async () => true },
    signal: () => new AbortController().signal
  });
}

const CLOSED: DialogFrame = { isOpen: false };
const CONTINUE: DialogFrame = { isOpen: true, options: [{ text: 'Click here to continue', index: 1 }], text: 'Greetings!' };
const SECOND = [
  { text: 'Sounds good.', index: 1 },
  { text: 'Let me think.', index: 3 }
];

describe('c.dialog', () => {
  test('choose sends the SERVER index, never the array position', async () => {
    const h = harness();
    const r = await h.dialog.choose(/no thanks/i);
    expect(r.success).toBe(true);
    expect(h.clicked).toEqual([2]);            // array position 1, server index 2
  });

  test('choose takes a string as an exact case-insensitive match, per S5', async () => {
    const h = harness();
    await h.dialog.choose('yes please.');
    expect(h.clicked).toEqual([1]);
  });

  test('a pattern that matches nothing reports no_option and clicks nothing', async () => {
    const h = harness();
    const r = await h.dialog.choose(/bury the body/i);
    expect(r).toMatchObject({ success: false, reason: 'no_option' });
    expect(h.clicked).toEqual([]);
  });

  test('a closed dialogue reports wrong_interface rather than no_option', async () => {
    const h = harness([CLOSED]);
    const r = await h.dialog.choose(/yes/i);
    expect(r).toMatchObject({ success: false, reason: 'wrong_interface' });
  });

  test('an option that carries no index of its own falls back to its position plus one', async () => {
    // The two migrated call sites both carried this fallback, for a publisher that omits the
    // field. Position 1 with no index is server index 2, never 1 and never the position.
    const h = harness([{ isOpen: true, options: [{ text: 'Not yet' }, { text: 'Take me there.' }] }]);
    await h.dialog.choose(/take me there/i);
    expect(h.clicked).toEqual([2]);
  });

  test('complete drives a TREE, consuming its patterns in order, one per choice frame', async () => {
    const h = harness([
      { isOpen: true, options: OPTIONS, text: 'Do you want to skip the tutorial?' },
      { isOpen: true, options: SECOND, text: 'Are you sure?' },
      CLOSED
    ]);
    const r = await h.dialog.complete([/no thanks/i, /let me think/i]);
    expect(r.success).toBe(true);
    // The whole array, not clicked[0]: a one-step implementation passes a clicked[0] assertion.
    expect(h.clicked).toEqual([2, 3]);
  });

  test('complete stops with no_option when a frame matches none of the remaining patterns', async () => {
    const h = harness([
      { isOpen: true, options: OPTIONS, text: 'Do you want to skip the tutorial?' },
      { isOpen: true, options: SECOND, text: 'Are you sure?' },
      CLOSED
    ]);
    const r = await h.dialog.complete([/no thanks/i, /bury the body/i]);
    expect(r).toMatchObject({ success: false, reason: 'no_option' });
    expect(h.clicked).toEqual([2]);
  });

  test('complete ends happily when the tree runs out before the patterns do', async () => {
    // A caller who wrote one pattern too many has answered every question the npc asked, which
    // is a success. Reporting `wrong_interface` from the spent `choose` would be a lie.
    const h = harness([{ isOpen: true, options: OPTIONS, text: 'Skip?' }, CLOSED]);
    const r = await h.dialog.complete([/no thanks/i, /let me think/i]);
    expect(r.success).toBe(true);
    expect(h.clicked).toEqual([2]);
  });

  test('complete clicks past an option-less frame before it answers the choice behind it', async () => {
    // The skip offer on the live island: the question is one ordinary chatbox frame and its two
    // answers only open behind it.
    const h = harness([CONTINUE, { isOpen: true, options: OPTIONS, text: 'Skip?' }, CLOSED]);
    const r = await h.dialog.complete([/no thanks/i]);
    expect(r.success).toBe(true);
    expect(h.clicked).toEqual([0, 2]);
  });

  test('options() and text() are synchronous snapshot reads', () => {
    const h = harness();

    expect(h.dialog.isOpen()).toBe(true);
    expect(h.dialog.options()).toEqual(['Yes please.', 'No thanks.', "I'll think about it."]);
    expect(h.dialog.text()).toContain('skip the tutorial');
  });

  test('options() leaves out the continue line, which is not a decision', () => {
    // The live client publishes "Click here to continue" as an option of its own, so a script
    // reading `options()` as "what I may choose between" would be offered a click as a choice.
    const h = harness([CONTINUE]);
    expect(h.dialog.options()).toEqual([]);
    expect(h.dialog.isOpen()).toBe(true);
  });

  test('text() reads the completed line, which is all this client publishes', () => {
    // The live collector fills `isOpen`, `options` and `isWaiting` and never `dialog.text`, so a
    // reader of that field alone returns '' on every real frame. `recentDialogs` is where the
    // line arrives, and it is what `c.wait.dialog(pattern)` matches on: the two must agree, or a
    // script can wait successfully for a line `text()` says is not there.
    const dialog = reader({
      dialog: { isOpen: true, options: [{ text: 'Click here to continue', index: 1 }] },
      recentDialogs: [{ text: ['Hello there.'] }, { text: ['Do you want to skip', 'the tutorial?'] }]
    });
    expect(dialog.text()).toBe('Do you want to skip the tutorial?');
  });

  test('text() prefers a published current line when a client does send one', () => {
    const dialog = reader({
      dialog: { isOpen: true, options: [], text: 'the current line' },
      recentDialogs: [{ text: ['an older line'] }]
    });
    expect(dialog.text()).toBe('the current line');
  });

  test('a closed dialogue reads as closed, empty and silent', () => {
    const h = harness([CLOSED]);
    expect(h.dialog.isOpen()).toBe(false);
    expect(h.dialog.options()).toEqual([]);
    expect(h.dialog.text()).toBe('');
  });
});

describe('c.dialog.continueUntilOption', () => {
  test('clicks the continue line and stops the moment a choice is showing', async () => {
    const h = harness([CONTINUE, { isOpen: true, options: OPTIONS, text: 'Skip?' }]);
    const r = await h.dialog.continueUntilOption();
    expect(r.success).toBe(true);
    expect(h.clicked).toEqual([0]);
  });

  test('a frame that never offers a choice is reported as a timeout, not as a success', async () => {
    // The information `clickThrough` could not give: it returned void whether the chatbox moved
    // on or stood still for its whole budget.
    const h = harness([CONTINUE]);
    const r = await h.dialog.continueUntilOption({ maxClicks: 3 });
    expect(r).toMatchObject({ success: false, reason: 'timeout' });
    expect(h.clicked).toEqual([0, 0, 0]);
  });

  test('a dialogue that has already ended is a success with no click at all', async () => {
    const h = harness([CLOSED]);
    const r = await h.dialog.continueUntilOption();
    expect(r.success).toBe(true);
    expect(h.clicked).toEqual([]);
  });

  test('a stopped run ends the loop instead of bursting its whole budget of clicks', async () => {
    // `wait.until` resolves false the instant the run is stopped, so without the guard the loop
    // spends every remaining click inside one millisecond. That burst is the exact failure the
    // frame wait was written to prevent, reached the other way round.
    const stop = new AbortController();
    const h = harness([CONTINUE], stop.signal);
    stop.abort();
    const r = await h.dialog.continueUntilOption({ maxClicks: 10 });
    expect(r).toMatchObject({ success: false, reason: 'stopped' });
    expect(h.clicked).toEqual([]);
  });

  test("a caller's own signal stops it too, without touching the run", async () => {
    const mine = new AbortController();
    mine.abort();
    const h = harness([CONTINUE]);
    const r = await h.dialog.continueUntilOption({ signal: mine.signal });
    expect(r).toMatchObject({ success: false, reason: 'stopped' });
    expect(h.clicked).toEqual([]);
  });

  test('a refused click is reported rather than retried', async () => {
    const clicked: number[] = [];
    const dialog = createDialog({
      state: () => ({ dialog: CONTINUE }),
      click: async i => { clicked.push(i); return { success: false, message: 'refused', reason: 'invalid_option' }; },
      wait: { until: async () => true, dialog: async () => true },
      signal: () => new AbortController().signal
    });
    const r = await dialog.continueUntilOption({ maxClicks: 5 });
    expect(r).toMatchObject({ success: false, reason: 'invalid_option' });
    expect(clicked).toEqual([0]);
  });
});
