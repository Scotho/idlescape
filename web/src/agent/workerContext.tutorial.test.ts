// The tutorial half of `ScriptContext`: `followHint`, `c.dialog` and the `clickThrough` shim.
//
// Split out of `workerContext.test.ts` when that file crossed the 400-line ceiling. The seam is
// a real one: everything here reads the chatbox and the hint arrow and needs none of the atlas,
// collision or travel wiring the other file exists to pin, so this harness supplies stubs for
// those and a plain click counter instead of a spy set.
import { describe, expect, test } from 'vitest';
import { createWorkerContext } from './workerContext';
import { createDeprecations } from '../tasks/deprecate';
import { createAttachments } from '../tasks/attachments';
import { createTrace } from '../tasks/trace';
import { CHAR_DESIGN_INTERFACE } from './constants';
import type { Atlas } from '../tasks/types';
import type { BotAction, Transport, WorldState } from './types';

const EMPTY_ATLAS: Atlas = {
  version: 1, source: { contentSha: 'x' }, kinds: {} as Atlas['kinds'], clusters: [], landmarks: [], routes: []
};

function fakeWorld(patch: Partial<WorldState> = {}): WorldState {
  return {
    tick: 1,
    inGame: true,
    player: { name: 'me', animId: -1, hp: 10, x: 3200, z: 3200, worldX: 3200, worldZ: 3200, level: 0 },
    skills: [],
    inventory: [],
    nearbyNpcs: [],
    nearbyLocs: [],
    gameMessages: [],
    recentDialogs: [],
    dialog: { isOpen: false, options: [], isWaiting: false },
    interface: { isOpen: false, interfaceId: -1, options: [] },
    hint: { kind: 'none' },
    tutorial: { open: true, title: 'Getting Started', lines: [] },
    ...patch
  } as unknown as WorldState;
}

function harness(initial: WorldState = fakeWorld()) {
  let state = initial;
  const stateSubs = new Set<(s: WorldState) => void>();
  const ticks = new Set<() => void>();
  /** Every action a script takes crosses `dispatch`; counting it is counting the clicks. */
  let dispatched = 0;
  const actions: BotAction[] = [];
  const transport = {
    getState: () => state,
    onState: (cb: (s: WorldState) => void) => { stateSubs.add(cb); return () => { stateSubs.delete(cb); }; },
    onEvent: () => () => {},
    dispatch: async (a: BotAction) => { dispatched += 1; actions.push(a); return { success: true, message: 'ok' }; },
    say: async () => ({ success: true, message: 'ok' }),
    echo: () => {},
    screenshot: async () => new Blob(),
    relogin: async () => ({ ok: true }),
    logout: () => {},
    cancel: () => {},
    humanInput: () => () => {}
  } as unknown as Transport;
  const abort = new AbortController();
  const { ctx } = createWorkerContext({
    transport, trace: createTrace(), params: {}, signal: () => abort.signal,
    onTick: cb => { ticks.add(cb); return () => { ticks.delete(cb); }; },
    atlas: { load: async () => EMPTY_ATLAS, peek: () => EMPTY_ATLAS, nearestCluster: () => null, landmark: () => null },
    collision: { load: async () => true, ready: () => true },
    anchor: () => ({ x: 0, z: 0, level: 0 }),
    deprecations: createDeprecations(() => {}),
    attachments: createAttachments(),
    runId: 'run-1',
    health: { is: () => false, last: () => null, recovered: () => {} }
  });
  return {
    ctx,
    clicks: (): number => dispatched,
    /** Every action that crossed the transport, in order, so a click can be told from a walk. */
    actions: (): BotAction[] => actions,
    push: (next: WorldState): void => { state = next; for (const cb of stateSubs) cb(next); },
    tick: (): void => { for (const cb of [...ticks]) cb(); }
  };
}

test('followHint reports no_hint, a missing target, and a blocking character design', async () => {
  const { ctx } = harness();
  await expect(ctx.tutorial.followHint()).resolves.toMatchObject({ success: false, reason: 'no_hint' });

  const missing = harness(fakeWorld({ hint: { kind: 'npc', npcIndex: 7 } } as unknown as Partial<WorldState>));
  await expect(missing.ctx.tutorial.followHint()).resolves.toMatchObject({ success: false, reason: 'target_not_found' });

  const design = harness(fakeWorld({
    hint: { kind: 'npc', npcIndex: 7 },
    interface: { isOpen: true, interfaceId: CHAR_DESIGN_INTERFACE, options: [] }
  } as unknown as Partial<WorldState>));
  await expect(design.ctx.tutorial.followHint()).resolves.toMatchObject({ success: false, reason: 'char_design_open' });
});

describe('c.tutorial.followHint over a tile arrow', () => {
  // The chef's door, measured in the pinned content: `tutorial_step_go_to_chef` puts the arrow
  // on 0_48_48_6_12, absolute (3078, 3084), and `newbie_door2` (loc 3017) is placed at m48_48
  // "0 7 12: 3017 0", absolute (3079, 3084). An exact-tile match walked the first live run onto
  // the door's own tile and then found nothing on the arrow for the rest of the run.
  const HINT = { x: 3078, z: 3084 };
  const door = {
    id: 3017, name: 'Door', x: 3079, z: 3084, level: 0, distance: 1,
    options: ['Open'], optionsWithIndex: [{ text: 'Open', opIndex: 1 }], reachable: true
  };
  const bench = {
    id: 1234, name: 'Bench', x: 3074, z: 3084, level: 0, distance: 4,
    options: ['Search'], optionsWithIndex: [{ text: 'Search', opIndex: 1 }], reachable: true
  };

  const at = (x: number, z: number, locs: unknown[]): WorldState => fakeWorld({
    hint: { kind: 'tile', tile: { ...HINT, height: 0 } },
    player: { name: 'me', animId: -1, hp: 10, x, z, worldX: x, worldZ: z, level: 0 },
    nearbyLocs: locs
  } as unknown as Partial<WorldState>);

  const flush = (): Promise<void> => new Promise(r => setTimeout(r, 0));

  test('clicks the door standing one tile east of the arrow', async () => {
    // Standing where the run stopped: on the door's own tile, with the arrow one tile west.
    const h = harness(at(3079, 3084, [door]));
    void h.ctx.tutorial.followHint();
    await flush();
    expect(h.actions()[0]).toMatchObject({ type: 'interactLoc', x: 3079, z: 3084, locId: 3017, optionIndex: 1 });
  });

  test('walks to the arrow when nothing within a tile of it can be clicked', async () => {
    const h = harness(at(3070, 3084, [bench]));
    void h.ctx.tutorial.followHint();
    await flush();
    expect(h.actions().some(a => a.type === 'interactLoc')).toBe(false);
    expect(h.actions().some(a => a.type === 'walkTo')).toBe(true);
  });
});

describe('c.tutorial.clickThrough', () => {
  /**
   * The live client attaches "Click here to continue" to every option-less chatbox frame, so a
   * fixture without it is a fake more permissive than the collaborator it stands for: it lets a
   * guard that counts raw `options.length` pass exactly as well as one that counts real choices.
   * Every talking frame below carries it, which is what makes both guards testable.
   */
  const CONTINUE = [{ text: 'Click here to continue', index: 1 }];

  const dialogOf = (texts: Record<number, string>, options: { text: string; index?: number }[]): WorldState =>
    fakeWorld({
      dialog: { isOpen: true, options, isWaiting: false },
      interfaceTexts: texts
    } as unknown as Partial<WorldState>);

  /** An instructor speaking: nothing to decide, plus the continue line the client adds. */
  const talking = (texts: Record<number, string>): WorldState => dialogOf(texts, CONTINUE);
  /** A frame that really does offer a choice. */
  const choosing = (texts: Record<number, string>, options: { text: string; index?: number }[]): WorldState =>
    dialogOf(texts, options);
  const closed = (): WorldState =>
    fakeWorld({ dialog: { isOpen: false, options: [], isWaiting: false } } as unknown as Partial<WorldState>);

  const flush = (): Promise<void> => new Promise(r => setTimeout(r, 0));

  test('waits for the chatbox to move on before it clicks again, and never clicks into a choice', async () => {
    const guide = { 4884: 'RuneScape Guide', 4885: 'Do you want to skip the tutorial?', 4886: 'Click here to continue' };
    const h = harness(talking(guide));
    const done = h.ctx.tutorial.clickThrough(5);
    await flush();
    expect(h.clicks()).toBe(1);

    // A tick and a snapshot carrying the SAME frame is the case that broke the live run: the
    // server has not answered yet, and a second click here is the one that resolved the guide's
    // choice as "Yes please." and teleported the character off the island. The frame carries the
    // continue option, so a wait that counted raw options would have fired all five by now.
    h.tick();
    h.push(talking(guide));
    await flush();
    expect(h.clicks()).toBe(1);

    // The choice arrives. `clickThrough` returns without touching it, which is what leaves it to
    // `decline-tutorial-skip`.
    h.push(choosing({ 2460: 'Select an Option', 2461: 'Yes please.', 2462: 'No, thank you.' }, [{ text: 'Yes please.', index: 1 }]));
    await done;
    expect(h.clicks()).toBe(1);
  });

  test('clicks a frame whose only option is the continue line', async () => {
    // Reading `options.length` as "this frame offers a choice" made `clickThrough` refuse every
    // line an instructor speaks, which is how a Tutorial Island run stood in front of the
    // Gielinor Guide until its step wait ran out.
    const h = harness(talking({ 4885: 'Greetings!' }));
    const done = h.ctx.tutorial.clickThrough(1);
    await flush();
    expect(h.clicks()).toBe(1);
    h.push(closed());
    await done;
  });

  test('clicks the next frame once the chatbox has actually moved on', async () => {
    const h = harness(talking({ 4885: 'Greetings!' }));
    const done = h.ctx.tutorial.clickThrough(2);
    await flush();
    expect(h.clicks()).toBe(1);
    h.push(talking({ 4885: 'You have already learnt the first thing' }));
    await flush();
    expect(h.clicks()).toBe(2);
    h.push(closed());
    await done;
  });

  test('the shim spends the budget it was given, not the default ten', async () => {
    // `clickThrough` is a shim over `dialog.continueUntilOption` now, and the argument it was
    // called with is the only thing it still decides. A shim that forwarded an empty bag would
    // take the default ten and keep clicking after the caller's two were spent.
    const h = harness(talking({ 4885: 'One' }));
    const done = h.ctx.tutorial.clickThrough(2);
    await flush();
    expect(h.clicks()).toBe(1);
    h.push(talking({ 4885: 'Two' }));
    await flush();
    expect(h.clicks()).toBe(2);
    h.push(talking({ 4885: 'Three' }));
    await flush();
    expect(h.clicks()).toBe(2);
    await done;
  });

  test('no burst of clicks while the frame stands still', async () => {
    // The defect the first round of these tests could not catch: with a wait that reads raw
    // `options.length`, the predicate is true the first time it is evaluated against a live
    // frame and `clickThrough(5)` fires all five clicks inside one millisecond. The trace of
    // the first live run (docs/runs/tutorial-island-local.jsonl, seq 19-23) is exactly that.
    const h = harness(talking({ 4885: 'Greetings!' }));
    const done = h.ctx.tutorial.clickThrough(5);
    await flush();
    await flush();
    await flush();
    expect(h.clicks()).toBe(1);
    h.push(closed());
    await done;
    expect(h.clicks()).toBe(1);
  });
});

describe('c.dialog over the real transport', () => {
  const frame = (options: { text: string; index?: number }[], texts: Record<number, string> = {}): WorldState =>
    fakeWorld({
      dialog: { isOpen: true, options, isWaiting: false },
      interfaceTexts: texts
    } as unknown as Partial<WorldState>);

  const flush = (): Promise<void> => new Promise(r => setTimeout(r, 0));

  test('choose dispatches the option\'s own server index, not its array position', async () => {
    // The whole proposal, end to end: the option a script names sits at array position 1 and the
    // server registered it as 7. Sending the position would click a different answer, and
    // sending position+1 would click the one beside it.
    const h = harness(frame([{ text: 'Yes please.', index: 4 }, { text: 'No, thank you.', index: 7 }]));
    void h.ctx.dialog.choose(/no,? thank you/i);
    await flush();
    expect(h.actions()[0]).toMatchObject({ type: 'clickDialogOption', optionIndex: 7 });
  });

  test('options() reads the choices and leaves out the client\'s own continue line', () => {
    const h = harness(frame([{ text: 'Click here to continue', index: 1 }, { text: 'Yes please.', index: 2 }]));
    expect(h.ctx.dialog.options()).toEqual(['Yes please.']);
    expect(h.ctx.dialog.isOpen()).toBe(true);
  });

  test('choose refuses a closed chatbox without dispatching anything', async () => {
    const h = harness();
    await expect(h.ctx.dialog.choose(/yes/i)).resolves.toMatchObject({ success: false, reason: 'wrong_interface' });
    expect(h.clicks()).toBe(0);
  });

  test('text() reads the line the real client actually publishes', async () => {
    // Over the live shape, not a hand-set field: `StateCollector.collectDialogState` publishes
    // `isOpen`, `options` and `isWaiting`, so `dialog.text` is empty on every real frame and the
    // line arrives in `recentDialogs`. `c.wait.dialog` matches on the same string, which this
    // pins by waiting for a pattern and reading it back.
    const h = harness(fakeWorld({
      dialog: { isOpen: true, options: [], isWaiting: false },
      recentDialogs: [{ text: ['Do you want to skip', 'the tutorial?'], tick: 4, interfaceId: 60 }]
    } as unknown as Partial<WorldState>));
    expect(h.ctx.dialog.text()).toBe('Do you want to skip the tutorial?');
    await expect(h.ctx.wait.dialog(/skip the tutorial/i, 50)).resolves.toBe(true);
  });

  test('continueUntilOption is what the clickThrough shim now spends its budget on', async () => {
    // The shim keeps its name and its `Promise<void>`; this is the member beside it that says
    // why it stopped. One click, then the frame wait, exactly as the tests above pin the shim.
    const h = harness(frame([{ text: 'Click here to continue', index: 1 }], { 4885: 'Greetings!' }));
    const done = h.ctx.dialog.continueUntilOption({ maxClicks: 1 });
    await flush();
    expect(h.clicks()).toBe(1);
    h.push(fakeWorld({ dialog: { isOpen: false, options: [], isWaiting: false } } as unknown as Partial<WorldState>));
    await expect(done).resolves.toMatchObject({ success: false, reason: 'timeout' });
  });
});
