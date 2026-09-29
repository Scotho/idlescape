import { describe, expect, test } from 'vitest';
import { isUnexpectedModal, TASKS } from './recovery';
import { pick, tutorialHarness, type HarnessOpts } from './harness';

const at = (opts: HarnessOpts) => {
  const h = tutorialHarness(opts);
  return { h, task: pick(TASKS, h.state(), h.ctx) };
};

describe('design-character', () => {
  test('fires on the designer and randomises before accepting when the player asked for it', async () => {
    const { h, task } = at({ world: { interfaceOpen: true, interfaceId: 3559 }, params: { randomiseAppearance: true } });
    expect(task?.name).toBe('design-character');
    await task?.run(h.ctx);
    expect(h.calls.randomize).toBe(1);
    expect(h.calls.acceptDesign).toBe(1);
  });

  test('accepts the default body when the player did not ask for a random one', async () => {
    const { h, task } = at({ world: { interfaceOpen: true, interfaceId: 3559 }, params: { randomiseAppearance: false } });
    await task?.run(h.ctx);
    expect(h.calls.randomize).toBe(0);
    expect(h.calls.acceptDesign).toBe(1);
  });

  test('does not report the condition recovered while the designer is still open', async () => {
    const { h, task } = at({ world: { interfaceOpen: true, interfaceId: 3559 }, params: { randomiseAppearance: true } });
    await task?.run(h.ctx);
    expect(h.calls.recovered).toEqual([]);
  });

  test('reports it recovered once the designer has closed', async () => {
    const h = tutorialHarness({ world: { interfaceOpen: true, interfaceId: 3559 }, params: { randomiseAppearance: true } });
    const task = TASKS.find(t => t.name === 'design-character');
    h.set({ interfaceOpen: false, interfaceId: -1 });
    await task?.run(h.ctx);
    expect(h.calls.recovered).toEqual(['unexpected-interface']);
  });

  test('another interface is not the designer', () => {
    const { task } = at({ world: { interfaceOpen: true, interfaceId: 3560 } });
    expect(task?.name).not.toBe('design-character');
  });
});

describe('isUnexpectedModal', () => {
  test('the bank is expected, so the banking step is not undone by the recovery', () => {
    const h = tutorialHarness({ world: { modalOpen: true, bankOpen: true } });
    expect(isUnexpectedModal(h.state())).toBe(false);
  });

  test('the smithing interface is expected while the smithing step is showing', () => {
    const h = tutorialHarness({ world: { modalOpen: true, title: 'Smithing a dagger.' } });
    expect(isUnexpectedModal(h.state())).toBe(false);
  });

  test('the same modal under any other title is not expected', () => {
    const h = tutorialHarness({ world: { modalOpen: true, title: 'Mining.' } });
    expect(isUnexpectedModal(h.state())).toBe(true);
  });

  test('the character designer is not closed by the modal task, because design-character owns it', () => {
    const h = tutorialHarness({ world: { modalOpen: true, interfaceOpen: true, interfaceId: 3559 } });
    expect(isUnexpectedModal(h.state())).toBe(false);
  });

  test('no modal at all is not an unexpected modal', () => {
    const h = tutorialHarness({ world: { modalOpen: false } });
    expect(isUnexpectedModal(h.state())).toBe(false);
  });
});

describe('the dialog and level-up arms', () => {
  test('an option-less dialog is clicked through', async () => {
    const { h, task } = at({ world: { dialog: { isOpen: true } } });
    expect(task?.name).toBe('continue-dialog');
    await task?.run(h.ctx);
    expect(h.calls.dialogClicks.length).toBeGreaterThan(0);
    expect(h.calls.recovered).toEqual(['dialog-stuck']);
  });

  test('a dialog offering choices is left alone by every recovery task', () => {
    const { task } = at({ world: { dialog: { isOpen: true, options: [{ text: 'Yes' }, { text: 'No' }] } } });
    expect(task).toBeUndefined();
  });

  test('a level-up is dismissed before the dialog arm sees it', async () => {
    const { h, task } = at({ world: { dialog: { isOpen: true }, interfaceTexts: { 1: 'You just advanced a Mining level!' } } });
    expect(task?.name).toBe('dismiss-level-up');
    await task?.run(h.ctx);
    expect(h.calls.recovered).toEqual(['level-up']);
  });
});

describe('close-unexpected-modal and accept-expected-interface', () => {
  test('closes a modal nothing asked for and reports it once it has gone', async () => {
    const h = tutorialHarness({ world: { modalOpen: true, title: 'Mining.' } });
    const task = pick(TASKS, h.state(), h.ctx);
    expect(task?.name).toBe('close-unexpected-modal');
    h.set({ modalOpen: false });
    await task?.run(h.ctx);
    expect(h.calls.closeModal).toBe(1);
    expect(h.calls.recovered).toEqual(['unexpected-interface']);
  });

  test('does not report it recovered while the modal is still up', async () => {
    const { h, task } = at({ world: { modalOpen: true, title: 'Mining.' } });
    await task?.run(h.ctx);
    expect(h.calls.recovered).toEqual([]);
  });

  test('an expected modal the monitor flagged is handed back rather than left claimed forever', async () => {
    const { h, task } = at({ world: { modalOpen: true, bankOpen: true }, health: ['unexpected-interface'] });
    expect(task?.name).toBe('accept-expected-interface');
    await task?.run(h.ctx);
    expect(h.calls.closeModal).toBe(0);
    expect(h.calls.recovered).toEqual(['unexpected-interface']);
  });

  test('does not fire when the monitor is not waiting on the condition', () => {
    const { task } = at({ world: { modalOpen: true, bankOpen: true }, health: [] });
    expect(task).toBeUndefined();
  });
});

test('every recovery task claims the condition it handles, so the monitor stands down', () => {
  const claims = Object.fromEntries(TASKS.map(t => [t.name, t.recovers ?? []]));
  expect(claims).toEqual({
    // `decline-tutorial-skip` claims nothing: the skip offer is an ordinary dialog the monitor
    // reports as `dialog-stuck` if it stands, and `continue-dialog` is what answers for that.
    'decline-tutorial-skip': [],
    'design-character': ['unexpected-interface'],
    'dismiss-level-up': ['level-up'],
    'continue-dialog': ['dialog-stuck'],
    'close-unexpected-modal': ['unexpected-interface'],
    'accept-expected-interface': []
  });
});

describe('decline-tutorial-skip', () => {
  const SKIP = [{ text: 'Yes please.' }, { text: 'No, thank you.' }];

  test('answers the decline option with its own server index, never with its position', async () => {
    // Array position 1, server index 2. Position 0 is "Yes please.", and taking it ends the run
    // in Lumbridge twenty seconds after it started with none of the island played.
    const { h, task } = at({ world: { dialog: { isOpen: true, options: SKIP } } });
    expect(task?.name).toBe('decline-tutorial-skip');
    const r = await task?.run(h.ctx);
    expect(h.calls.dialogClicks).toEqual([2]);
    expect(r).toBeUndefined();
  });

  test('sends the index the server registered rather than the position plus one', async () => {
    const { h, task } = at({
      world: { dialog: { isOpen: true, options: [{ text: 'Yes please.', index: 3 }, { text: 'No, thank you.', index: 9 }] } }
    });
    await task?.run(h.ctx);
    expect(h.calls.dialogClicks).toEqual([9]);
  });

  test('clicks the question frame through rather than answering something it has not read', async () => {
    // The offer arrives as an ordinary chatbox line and the two answers only open behind it, so
    // the task matches on the question text with no options on screen at all. Every click it
    // makes here is the continue click; nothing it sends is a choice.
    const { h, task } = at({
      world: { dialog: { isOpen: true }, interfaceTexts: { 4885: 'Do you want to skip the tutorial?' } }
    });
    expect(task?.name).toBe('decline-tutorial-skip');
    const r = await task?.run(h.ctx);
    expect(h.calls.dialogClicks.every(i => i === 0)).toBe(true);
    // The fake frame never moves, so the clicking gives up and says so. That report is what the
    // old `clickThrough(1)` could not make: it returned void either way and the task then blamed
    // the missing answers.
    expect(r).toMatchObject({ success: false, reason: 'timeout' });
  });

  test('reports not_found when the chatbox closes with the answers never having opened', async () => {
    // `asksToSkip` still holds - the question is on the interface - but the dialogue itself has
    // gone, so there is nothing to click through and nothing to answer. Kept spelled
    // `not_found` rather than `target_not_found`: closing that union is P10, sprint entry 7.
    const { h, task } = at({
      world: { dialog: { isOpen: false }, interfaceTexts: { 4885: 'Do you want to skip the tutorial?' } }
    });
    expect(task?.name).toBe('decline-tutorial-skip');
    const r = await task?.run(h.ctx);
    expect(h.calls.dialogClicks).toEqual([]);
    expect(r).toMatchObject({ success: false, reason: 'not_found' });
  });
});
