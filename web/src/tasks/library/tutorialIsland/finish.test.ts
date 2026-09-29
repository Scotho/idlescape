import { describe, expect, test } from 'vitest';
import { TASKS } from './finish';
import { pick, tutorialHarness, type HarnessOpts } from './harness';

const at = (opts: HarnessOpts) => {
  const h = tutorialHarness(opts);
  return { h, task: pick(TASKS, h.state(), h.ctx) };
};

describe('the bank', () => {
  test('opens a booth on the banking title and waits for the box', async () => {
    const { h, task } = at({ world: { title: 'Banking.' } });
    expect(task?.name).toBe('open-bank');
    await task?.run(h.ctx);
    expect(h.calls.bank).toEqual(['open']);
    expect(h.calls.waited).toEqual(['until:false']);
  });

  test('closes the box first when it is open', async () => {
    const { h, task } = at({ world: { title: 'This is your bank box.', bankOpen: true, modalOpen: true } });
    expect(task?.name).toBe('close-bank');
    await task?.run(h.ctx);
    expect(h.calls.bank).toEqual(['close']);
  });

  test('takes the door once the box has gone, rather than closing it twice', async () => {
    const { h, task } = at({
      world: {
        title: 'This is your bank box.', bankOpen: false,
        hint: { kind: 'tile', tile: { x: 3126, z: 3124, height: 0 } }, locs: [{ name: 'Door', x: 3126, z: 3124 }]
      }
    });
    await task?.run(h.ctx);
    expect(h.calls.bank).toEqual([]);
    expect(h.calls.interactLoc).toEqual([{ name: 'Door', op: 1 }]);
  });
});

describe('the chapel and the wizard', () => {
  test('the friends title opens the ignore tab that is flashing', async () => {
    const { h, task } = at({ world: { title: 'This is your friends list.', flashingTab: 10 } });
    expect(task?.name).toBe('open-ignore-tab');
    await task?.run(h.ctx);
    expect(h.calls.setTab).toEqual([10]);
  });

  test('the ignore title is a conversation, not another tab', async () => {
    const { h, task } = at({
      world: { title: 'This is your ignore list.', flashingTab: 10, hint: { kind: 'npc', npcIndex: 6 }, npcs: [{ index: 6, name: 'Brother Brace', x: 0, z: 0 }] }
    });
    expect(task?.name).toBe('talk-brother-brace');
    await task?.run(h.ctx);
    expect(h.calls.setTab).toEqual([]);
    expect(h.calls.talkTo).toEqual(['Brother Brace']);
  });

  test('the magic menu title opens the flashing tab', async () => {
    const { h, task } = at({ world: { title: 'Open up your final menu.', flashingTab: 8 } });
    expect(task?.name).toBe('open-magic-tab');
    await task?.run(h.ctx);
    expect(h.calls.setTab).toEqual([8]);
  });

  test('wind strike is cast at a chicken and the wait is on magic xp', async () => {
    const { h, task } = at({ world: { title: 'Cast Wind Strike at a chicken.', npcs: [{ index: 2, name: 'Chicken', x: 3140, z: 3090 }] } });
    expect(task?.name).toBe('cast-wind-strike');
    await task?.run(h.ctx);
    expect(h.calls.cast).toEqual([{ target: 'Chicken', spell: 'wind strike' }]);
    expect(h.calls.waited).toEqual(['xp']);
  });

  test('does not wait for xp when there is no chicken to cast at', async () => {
    const { h, task } = at({ world: { title: 'Cast Wind Strike at a chicken.', npcs: [{ index: 2, name: 'Terrova', x: 0, z: 0 }] } });
    const r = await task?.run(h.ctx);
    expect(r?.success).toBe(false);
    expect(h.calls.waited).toEqual([]);
  });
});

describe('choose-dialog-option', () => {
  test('prefers the option that leaves the island, and answers with its 1-based server index', async () => {
    const { h, task } = at({
      world: { dialog: { isOpen: true, options: [{ text: 'Not yet' }, { text: 'Yes please, take me to the mainland.' }] } }
    });
    expect(task?.name).toBe('choose-dialog-option');
    const r = await task?.run(h.ctx);
    // Position 1, server index 2. Sending the position would be off by one every time, and for
    // an option at position 0 it would send the continue click the client refuses outright.
    expect(h.calls.dialogClicks).toEqual([2]);
    expect(r).toBeUndefined();
  });

  test('sends the option its own index, not its position plus one', async () => {
    // The server numbers the options it registered; a dialog whose registered numbers are not
    // 1, 2, 3 is what tells `chosen.index` apart from `position + 1`.
    const { h, task } = at({
      world: { dialog: { isOpen: true, options: [{ text: 'Not yet', index: 4 }, { text: 'Take me to the mainland.', index: 7 }] } }
    });
    await task?.run(h.ctx);
    expect(h.calls.dialogClicks).toEqual([7]);
  });

  test('declines the RuneScape Guide offer to skip the tutorial', async () => {
    // The offer only exists on a world where `map_live` is false, which is every dev and e2e
    // stack, and "Yes please." is what PREFERRED_OPTION would otherwise take: the run would end
    // in Lumbridge twenty seconds after it started with none of the island played.
    const { h, task } = at({
      world: { dialog: { isOpen: true, options: [{ text: 'Yes please.' }, { text: 'No, thank you.' }] } }
    });
    expect(task?.name).toBe('choose-dialog-option');
    await task?.run(h.ctx);
    // Position 1, server index 2, and NOT index 1 - which is the whole point.
    expect(h.calls.dialogClicks).toEqual([2]);
  });

  test('still says yes to the dialog that leaves the island', async () => {
    // The leaving dialog answers "Yes." and "No.", not "No, thank you.", so the decline above
    // cannot reach it. A rule that matched any "no" would strand every run on the island.
    const { h, task } = at({ world: { dialog: { isOpen: true, options: [{ text: 'Yes.' }, { text: 'No.' }] } } });
    await task?.run(h.ctx);
    expect(h.calls.dialogClicks).toEqual([1]);
  });

  test('takes the first option when none of them says anything it recognises', async () => {
    const { h, task } = at({ world: { dialog: { isOpen: true, options: [{ text: 'Tell me about mining' }, { text: 'Nothing' }] } } });
    await task?.run(h.ctx);
    // The first option is server index 1. Zero is the implicit continue click, which
    // `Client.clickDialogOption` rejects while a choice is pending.
    expect(h.calls.dialogClicks).toEqual([1]);
  });

  test('the last dialog of the island, "Yes." first, is answered rather than refused', async () => {
    // The magic instructor's terminal dialog (magic_instructor.rs2): "Do you want to go to the
    // mainland?" with "Yes." at position 0. Sending the position sends 0, the client refuses it,
    // and the run trips maxAttempts without ever leaving the island.
    const { h, task } = at({ world: { dialog: { isOpen: true, options: [{ text: 'Yes.' }, { text: 'No.' }] } } });
    const r = await task?.run(h.ctx);
    expect(h.calls.dialogClicks).toEqual([1]);
    expect(r).toBeUndefined();
  });

  test('reports the refusal rather than waiting when the click is rejected', async () => {
    // `index: 0` is a dialog the fake will refuse, standing in for the client refusing a click.
    const { h, task } = at({ world: { dialog: { isOpen: true, options: [{ text: 'Yes.', index: 0 }] } } });
    const r = await task?.run(h.ctx);
    expect(r?.success).toBe(false);
    expect(h.calls.waited).toEqual([]);
  });

  test('never fires on an option-less dialog, which recovery.ts owns', () => {
    const { task } = at({ world: { dialog: { isOpen: true } } });
    expect(task).toBeUndefined();
  });

  test('a named step wins over the choice, so the last dialog is reached by talking first', () => {
    const { task } = at({
      world: { title: 'You have almost completed the tutorial!', dialog: { isOpen: true, options: [{ text: 'Yes' }] } }
    });
    expect(task?.name).toBe('leave-for-the-mainland');
  });
});

describe('follow-the-arrow', () => {
  test('carries an untitled chapel step that is only an arrow', async () => {
    const { h, task } = at({
      world: { title: '', hint: { kind: 'npc', npcIndex: 6 }, npcs: [{ index: 6, name: 'Brother Brace', x: 0, z: 0 }] }
    });
    expect(task?.name).toBe('follow-the-arrow');
    await task?.run(h.ctx);
    expect(h.calls.talkTo).toEqual(['Brother Brace']);
  });

  test('does not fire when nothing is being pointed at, so an unknown step goes stuck', () => {
    const { task } = at({ world: { title: 'A step from a future content bump' } });
    expect(task).toBeUndefined();
  });

  test('loses to every named step above it', () => {
    const { task } = at({ world: { title: 'Banking.', hint: { kind: 'npc', npcIndex: 6 }, npcs: [{ index: 6, name: 'Banker', x: 0, z: 0 }] } });
    expect(task?.name).toBe('open-bank');
  });
});
