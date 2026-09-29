import { describe, expect, test } from 'vitest';
import { advance, advanceStep, hasChoices, hintedLoc, isTalking, stepKey, tabStep, titleIn, titleIs, useItemOn } from './helpers';
import { tutorialHarness } from './harness';
import type { WorldState } from '../../../agent/types';

const s = (h: ReturnType<typeof tutorialHarness>): WorldState => h.state();

describe('the step signal', () => {
  test('a repeated title is still two steps when the arrow moves', () => {
    const a = tutorialHarness({ world: { title: 'Mining.', hint: { kind: 'tile', tile: { x: 3080, z: 9500, height: 0 } } } });
    const b = tutorialHarness({ world: { title: 'Mining.', hint: { kind: 'tile', tile: { x: 3082, z: 9500, height: 0 } } } });
    expect(stepKey(s(a))).not.toBe(stepKey(s(b)));
  });

  test('the same title and the same arrow is the same step', () => {
    const a = tutorialHarness({ world: { title: 'Mining.', hint: { kind: 'npc', npcIndex: 4 } } });
    const b = tutorialHarness({ world: { title: 'Mining.', hint: { kind: 'npc', npcIndex: 4 } } });
    expect(stepKey(s(a))).toBe(stepKey(s(b)));
  });

  test('a different npc under the same title is a different step', () => {
    const a = tutorialHarness({ world: { title: '', hint: { kind: 'npc', npcIndex: 4 } } });
    const b = tutorialHarness({ world: { title: '', hint: { kind: 'npc', npcIndex: 9 } } });
    expect(stepKey(s(a))).not.toBe(stepKey(s(b)));
  });

  test('titleIs and titleIn read the empty title as a title, not as absent', () => {
    const h = tutorialHarness({ world: { title: '' } });
    expect(titleIs(s(h), '')).toBe(true);
    expect(titleIn(s(h), ['Mining.', ''])).toBe(true);
    expect(titleIn(s(h), ['Mining.'])).toBe(false);
  });

  test('a dialog offering choices is not the instructor talking', () => {
    const talking = tutorialHarness({ world: { dialog: { isOpen: true } } });
    const choosing = tutorialHarness({ world: { dialog: { isOpen: true, options: [{ text: 'Yes' }, { text: 'No' }] } } });
    expect(isTalking(s(talking))).toBe(true);
    expect(isTalking(s(choosing))).toBe(false);
  });

  test('"Click here to continue" is the instructor talking, not a choice', () => {
    // Measured on the live stack in SP4b Task 14: the client publishes the continue line as a
    // dialog option, so counting raw options made every spoken line look like a decision.
    // `continue-dialog` then never matched and `choose-dialog-option` matched everything.
    const h = tutorialHarness({
      world: { dialog: { isOpen: true, options: [{ text: 'Click here to continue', index: 1 }] } }
    });
    expect(isTalking(s(h))).toBe(true);
    expect(hasChoices(s(h))).toBe(false);
  });

  test('a real choice beside the continue line is still a choice', () => {
    const h = tutorialHarness({
      world: { dialog: { isOpen: true, options: [{ text: 'Click here to continue' }, { text: 'Yes please.' }] } }
    });
    expect(hasChoices(s(h))).toBe(true);
    expect(isTalking(s(h))).toBe(false);
  });
});

describe('hintedLoc', () => {
  test('answers the loc standing on the arrow tile', () => {
    const h = tutorialHarness({
      world: {
        hint: { kind: 'tile', tile: { x: 3080, z: 9500, height: 0 } },
        locs: [{ name: 'Rocks', x: 3081, z: 9500 }, { name: 'Rocks', x: 3080, z: 9500 }]
      }
    });
    expect(hintedLoc(s(h))?.x).toBe(3080);
  });

  test('answers null when the arrow is over a person, so a loc option is never sent at an npc', () => {
    const h = tutorialHarness({ world: { hint: { kind: 'npc', npcIndex: 1 }, locs: [{ name: 'Rocks', x: 3080, z: 9500 }] } });
    expect(hintedLoc(s(h))).toBeNull();
  });

  test('answers null when nothing is standing on the arrow tile', () => {
    const h = tutorialHarness({ world: { hint: { kind: 'tile', tile: { x: 1, z: 2, height: 0 } }, locs: [{ name: 'Rocks', x: 3080, z: 9500 }] } });
    expect(hintedLoc(s(h))).toBeNull();
  });
});

describe('advance', () => {
  test('clicks the instructor on rather than following the arrow, when both are showing', async () => {
    const h = tutorialHarness({
      world: { title: 'Combat.', dialog: { isOpen: true }, hint: { kind: 'npc', npcIndex: 1 }, npcs: [{ index: 1, name: 'Vannaka', x: 0, z: 0 }] }
    });
    await advance(h.ctx, 'test');
    expect(h.calls.dialogClicks.length).toBeGreaterThan(0);
    expect(h.calls.talkTo).toEqual([]);
  });

  test('follows the arrow when nobody is talking', async () => {
    const h = tutorialHarness({ world: { hint: { kind: 'npc', npcIndex: 1 }, npcs: [{ index: 1, name: 'Vannaka', x: 0, z: 0 }] } });
    await advance(h.ctx, 'test');
    expect(h.calls.talkTo).toEqual(['Vannaka']);
  });

  test('does nothing and waits when the step shows neither, rather than spending an attempt', async () => {
    const h = tutorialHarness({ world: { title: 'Combat.' } });
    await advance(h.ctx, 'test');
    expect(h.calls.talkTo).toEqual([]);
    expect(h.calls.dialogClicks).toEqual([]);
    expect(h.calls.waited).toEqual(['until:false']);
  });

  test('opens the door standing one tile east of the arrow instead of walking onto it', async () => {
    // The chef's door, measured in the pinned content: `tutorial_step_go_to_chef` puts the arrow
    // on 0_48_48_6_12, absolute (3078, 3084), and `newbie_door2` is placed at m48_48
    // "0 7 12: 3017 0", absolute (3079, 3084). This is the step that stopped the first live run.
    const h = tutorialHarness({
      world: {
        title: 'The Master Chef.',
        hint: { kind: 'tile', tile: { x: 3078, z: 3084, height: 0 } },
        locs: [{ id: 3017, name: 'Door', x: 3079, z: 3084, options: ['Open'] }],
        player: { worldX: 3079, worldZ: 3084 }
      }
    });
    await advance(h.ctx, 'go-to-chef');
    expect(h.calls.interactLoc).toEqual([{ name: 'Door', op: 1 }]);
    expect(h.calls.walked).toEqual([]);
  });

  test('walks to the arrow when the only thing beside it offers nothing to click', async () => {
    const h = tutorialHarness({
      world: {
        hint: { kind: 'tile', tile: { x: 3078, z: 3084, height: 0 } },
        locs: [{ id: 9, name: 'Fence', x: 3079, z: 3084 }],
        player: { worldX: 3070, worldZ: 3084 }
      }
    });
    await advance(h.ctx, 'go-to-chef');
    expect(h.calls.interactLoc).toEqual([]);
    expect(h.calls.walked).toEqual([{ x: 3078, z: 3084 }]);
  });

  test('logs the refusal when the arrow cannot be followed', async () => {
    const h = tutorialHarness({ world: { hint: { kind: 'npc', npcIndex: 7 }, npcs: [{ index: 1, name: 'Vannaka', x: 0, z: 0 }] } });
    await advance(h.ctx, 'moving-around');
    expect(h.calls.log.join(' ')).toContain('target_not_found');
  });
});

describe('advanceStep and tabStep', () => {
  test('advanceStep names itself in the status line and matches on its own predicate', async () => {
    const task = advanceStep('demo', st => titleIs(st, 'Combat.'), { status: 'Doing the demo' });
    const h = tutorialHarness({ world: { title: 'Combat.' } });
    expect(task.when(s(h), h.ctx)).toBe(true);
    await task.run(h.ctx);
    expect(h.calls.status).toEqual(['Doing the demo']);
  });

  test('tabStep clicks the tab the client is flashing, not a tab of its own choosing', async () => {
    const task = tabStep('demo-tab', () => true);
    const h = tutorialHarness({ world: { flashingTab: 11 } });
    await task.run(h.ctx);
    expect(h.calls.setTab).toEqual([11]);
  });

  test('tabStep refuses when nothing is flashing rather than clicking tab 0', async () => {
    const task = tabStep('demo-tab', () => true);
    const h = tutorialHarness({ world: { flashingTab: null } });
    const r = await task.run(h.ctx);
    expect(r).toEqual({ success: false, message: 'no tab is flashing', reason: 'not_found' });
    expect(h.calls.setTab).toEqual([]);
  });
});

describe('useItemOn', () => {
  test('sends the two slots the named items are actually in', async () => {
    const h = tutorialHarness({
      world: { inventory: [{ slot: 3, id: 1, name: 'Pot of flour', count: 1 }, { slot: 7, id: 2, name: 'Bucket of water', count: 1 }] }
    });
    const r = await useItemOn(h.ctx, 'Bucket of water', 'Pot of flour');
    expect(r.success).toBe(true);
    expect(h.calls.useItemOnItem).toEqual([{ source: 7, target: 3 }]);
  });

  test('refuses when one of the two is not carried, rather than sending slot 0 on 0', async () => {
    const h = tutorialHarness({ world: { inventory: [{ slot: 3, id: 1, name: 'Pot of flour', count: 1 }] } });
    const r = await useItemOn(h.ctx, 'Bucket of water', 'Pot of flour');
    expect(r).toEqual({ success: false, message: 'need Bucket of water and Pot of flour in the inventory', reason: 'not_found' });
    expect(h.calls.useItemOnItem).toEqual([]);
  });
});
