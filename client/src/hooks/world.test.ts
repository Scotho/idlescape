import { describe, expect, test } from 'bun:test';
import type { BotState } from '#/vendor/rs-sdk/bot/types.js';
import { createEmitter } from './emitter';
import { createWorldHooks } from './world';
import type { ActionResult, BotAction, ClientState, HookEvents, HookBridge, WorldBridge } from './types';

/** The smallest complete BotState; only `tick` is ever asserted on. */
function botState(tick: number): BotState {
  return {
    tick,
    revision: 0,
    player: null,
    skills: [],
    inventory: [],
    equipment: [],
    combatStyle: { currentStyle: 0, weaponName: 'Unarmed', styles: [], tabInterfaceId: -1, known: false },
    nearbyNpcs: [],
    nearbyPlayers: [],
    nearbyLocs: [],
    groundItems: [],
    gameMessages: [],
    recentDialogs: [],
    menuActions: [],
    shop: { isOpen: false, title: '', shopItems: [], playerItems: [] },
    bank: { isOpen: false, items: [], noteMode: false },
    trade: { isOpen: false, screen: null, partner: null, myOffer: [], theirOffer: [], myAccepted: false, partnerAccepted: false },
    inGame: true,
    combatEvents: [],
    dialog: { isOpen: false, options: [], isWaiting: false },
    interface: { isOpen: false, interfaceId: -1, options: [] },
    modalOpen: false,
    modalInterface: -1,
    prayers: { activePrayers: [], prayerPoints: 0, prayerLevel: 1 },
    isSkulled: false,
    autoRetaliateEnabled: false,
    opFeedback: { mapFlagUnsetCount: 0, lastMapFlagUnsetTick: -1, opRejectedCount: 0, lastOpRejectedTick: -1 }
  };
}

const emptyState: ClientState = {
  loggedIn: true, gameName: 'tester', skills: { xp: [], level: [] }, inventory: [], fps: 50, rttMs: null,
  hp: { current: 10, max: 10 }, prayer: { current: 1, max: 1 }, energy: 100, boosts: [],
  position: { x: 3200, z: 3200, level: 0 }, activeTab: 3, sceneReady: true
};

interface Harness {
  bridge: HookBridge;
  collects: number[];
  executed: BotAction[];
  setCycle(cycle: number): void;
  setTick(tick: number): void;
  /** Resolve the pending execute() call, if the harness is in async mode. */
  release(result: ActionResult): void;
}

function harness(options: { async?: boolean } = {}): Harness {
  let cycle = 1;
  let tick = 100;
  const collects: number[] = [];
  const executed: BotAction[] = [];
  let pending: ((result: ActionResult) => void) | null = null;

  const world: WorldBridge = {
    collector: { collectState: (tick: number) => { collects.push(tick); return botState(tick); } },
    executor: {
      execute: (action: BotAction) => {
        executed.push(action);
        if (!options.async) return { success: true, message: `did ${action.type}` };
        return new Promise<ActionResult>(resolve => { pending = resolve; });
      }
    },
    extras: {
      hint: () => ({ type: 1, npc: 7, player: 0, tileX: 0, tileZ: 0, height: 0 }),
      flashIcon: () => -1,
      tutorialRoot: () => -1,
      componentText: () => null,
      modalComponentIds: () => [],
      position: () => ({ x: 3094, z: 3107, level: 0 })
    },
    tick: () => tick,
    cycle: () => cycle
  };

  const bridge: HookBridge = {
    login: async () => ({ ok: true }),
    armLogin: () => {},
    loginArmed: async () => ({ ok: true }),
    setRenderSuspended: () => {},
    setAttended: () => {},
    logout: () => {},
    addChat: () => {},
    getState: () => emptyState,
    getObjName: () => null,
    getObjIcon: () => null,
    getObjInfo: () => null,
    world: () => world
  };

  return {
    bridge, collects, executed,
    setCycle: (next: number) => { cycle = next; },
    setTick: (next: number) => { tick = next; },
    release: (result: ActionResult) => { pending?.(result); pending = null; }
  };
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => { setTimeout(resolve, ms); });

async function waitFor(done: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!done()) {
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

describe('getWorldState', () => {
  test('collects once per client cycle and serves the cached snapshot within it', () => {
    const h = harness();
    const hooks = createWorldHooks(h.bridge, createEmitter<HookEvents>());
    const first = hooks.getWorldState();
    expect(hooks.getWorldState()).toBe(first);
    expect(h.collects).toEqual([100]);
    h.setCycle(2);
    expect(hooks.getWorldState()).not.toBe(first);
    expect(h.collects).toEqual([100, 100]);
  });

  test('stamps the snapshot with the server tick, not the client cycle', () => {
    const h = harness();
    const hooks = createWorldHooks(h.bridge, createEmitter<HookEvents>());
    expect(hooks.getWorldState().tick).toBe(100);
    h.setCycle(2);
    h.setTick(101);
    expect(hooks.getWorldState().tick).toBe(101);
    expect(h.collects).toEqual([100, 101]);
  });

  // The vendored collector only advances its own `publicationRevision` on the `publish = true`
  // path, which this hook does not take, so `revision` came out 0 on every snapshot. Consumers
  // that read it as "which snapshot is this" (the Worker host's de-duplication, the SDK's
  // `revision ?? tick` event baselines) then saw one frozen value forever.
  test('successive ticks are distinct snapshots with an advancing tick and revision', () => {
    const h = harness();
    const hooks = createWorldHooks(h.bridge, createEmitter<HookEvents>());
    const first = hooks.getWorldState();
    h.setCycle(2);
    h.setTick(101);
    const second = hooks.getWorldState();
    h.setCycle(3);
    h.setTick(102);
    const third = hooks.getWorldState();

    expect([first, second, third].map(s => s.tick)).toEqual([100, 101, 102]);
    expect([first, second, third].map(s => s.revision)).toEqual([100, 101, 102]);
    expect(second).not.toBe(first);
    expect(third).not.toBe(second);
  });

  test('merges the idlescape extras over the vendored state', () => {
    const h = harness();
    const state = createWorldHooks(h.bridge, createEmitter<HookEvents>()).getWorldState();
    expect(state.hint).toEqual({ kind: 'npc', npcIndex: 7 });
    expect(state.regionId).toBe(((3094 >> 6) << 8) | (3107 >> 6));
    expect(state.zone).toEqual({ x: 3094 >> 3, z: 3107 >> 3 });
  });
});

describe('dispatch', () => {
  test('executes the action and emits it with the result', async () => {
    const h = harness();
    const emitter = createEmitter<HookEvents>();
    const seen: HookEvents['action'][] = [];
    emitter.on('action', payload => seen.push(payload));
    const hooks = createWorldHooks(h.bridge, emitter);

    const action: BotAction = { type: 'none', reason: 'test' };
    const result = await hooks.dispatch(action);

    expect(result).toEqual({ success: true, message: 'did none' });
    expect(h.executed).toEqual([action]);
    expect(seen).toEqual([{ id: 'a1', action, result }]);
  });

  test('runs one action at a time; a queued action waits for the active one', async () => {
    const h = harness({ async: true });
    const hooks = createWorldHooks(h.bridge, createEmitter<HookEvents>());

    const first = hooks.dispatch({ type: 'none', reason: 'first' });
    const second = hooks.dispatch({ type: 'none', reason: 'second' });
    await Promise.resolve();
    expect(h.executed.map(a => a.reason)).toEqual(['first']);

    h.release({ success: true, message: 'first done' });
    expect(await first).toEqual({ success: true, message: 'first done' });
    // The queued action starts on the next poll of the queue, not immediately.
    await waitFor(() => h.executed.length === 2);
    h.release({ success: true, message: 'second done' });
    expect(await second).toEqual({ success: true, message: 'second done' });
    expect(h.executed.map(a => a.reason)).toEqual(['first', 'second']);
  });

  test('cancelAll keeps the in-flight action as a barrier: the next dispatch waits for it', async () => {
    const h = harness({ async: true });
    const hooks = createWorldHooks(h.bridge, createEmitter<HookEvents>());

    const inFlight = hooks.dispatch({ type: 'none', reason: 'in-flight' });
    await Promise.resolve();
    expect(h.executed.map(a => a.reason)).toEqual(['in-flight']);

    hooks.cancelAll();
    const afterCancel = hooks.dispatch({ type: 'none', reason: 'after-cancel' });
    // Give the queue several polls; clear() would have nulled the active entry here and let
    // this second action run alongside the first.
    await sleep(80);
    expect(h.executed.map(a => a.reason)).toEqual(['in-flight']);

    h.release({ success: true, message: 'in-flight done' });
    expect(await inFlight).toEqual({ success: true, message: 'in-flight done' });
    await waitFor(() => h.executed.length === 2);
    h.release({ success: true, message: 'after-cancel done' });
    expect(await afterCancel).toEqual({ success: true, message: 'after-cancel done' });
  });

  test('cancelAll releases a waiting action instead of stranding its promise', async () => {
    const h = harness({ async: true });
    const hooks = createWorldHooks(h.bridge, createEmitter<HookEvents>());

    const first = hooks.dispatch({ type: 'none', reason: 'first' });
    const queued = hooks.dispatch({ type: 'none', reason: 'queued' });
    await Promise.resolve();
    hooks.cancelAll();

    expect(await queued).toEqual({ success: false, message: 'action cancelled', reason: 'cancelled' });
    h.release({ success: true, message: 'first done' });
    expect(await first).toEqual({ success: true, message: 'first done' });
    expect(h.executed.map(a => a.reason)).toEqual(['first']);
  });
});
