import { describe, expect, test, vi } from 'vitest';
import { createLocalSdk } from './localSdk';
import type { BotAction, Transport, WorldState } from './types';

function worldState(tick: number): WorldState {
  return {
    tick,
    inGame: true,
    player: { name: 'tester', worldX: 3222, worldZ: 3218, x: 3222, z: 3218, level: 0 },
    skills: [{ name: 'Cooking', level: 5, xp: 400 }],
    inventory: [],
    equipment: [],
    nearbyNpcs: [{ kind: 'npc', id: 278, index: 7, name: 'Cook', x: 3224, z: 3218, distance: 2, reachable: true }],
    nearbyPlayers: [],
    nearbyLocs: [],
    groundItems: [],
    gameMessages: [],
    recentDialogs: [],
    dialog: { isOpen: false },
    interface: { isOpen: false },
    shop: { isOpen: false },
    bank: { isOpen: false },
    modalOpen: false,
    modalInterface: -1,
    combatEvents: [],
    prayers: { activePrayers: [] },
    hint: { kind: 'none' },
    tutorial: { open: false, title: '', lines: [] },
    flashingTab: null,
    interfaceTexts: {},
    regionId: 12850,
    zone: { x: 402, z: 402 }
  } as unknown as WorldState;
}

function fakeTransport() {
  const dispatched: BotAction[] = [];
  const stateSubs = new Set<(s: WorldState) => void>();
  let state: WorldState | null = worldState(1);
  const transport: Transport = {
    getState: () => state,
    onState: cb => { stateSubs.add(cb); return () => { stateSubs.delete(cb); }; },
    onEvent: () => () => {},
    dispatch: async action => { dispatched.push(action); return { success: true, message: 'ok' }; },
    say: async () => ({ success: true, message: 'said' }),
    echo: vi.fn(),
    screenshot: async () => new Blob(),
    relogin: async () => ({ ok: true }),
    logout: () => {},
    cancel: vi.fn(),
    humanInput: () => () => {}
  };
  const push = (s: WorldState): void => { state = s; stateSubs.forEach(cb => cb(s)); };
  return { transport, dispatched, push };
}

describe('createLocalSdk', () => {
  test('serves the transport snapshot through the vendored finders', () => {
    const { transport } = fakeTransport();
    const { sdk, bot } = createLocalSdk(transport);
    expect(bot).toBeDefined();
    expect(sdk.isConnected()).toBe(true);
    const npc = sdk.findNearbyNpc('Cook');
    expect(npc).toMatchObject({ index: 7, name: 'Cook', distance: 2 });
  });

  test('raw actions go out over the transport', async () => {
    const { transport, dispatched } = fakeTransport();
    const { sdk } = createLocalSdk(transport);
    const result = await sdk.sendTalkToNpc(7);
    expect(result.success).toBe(true);
    expect(dispatched).toEqual([{ type: 'talkToNpc', npcIndex: 7, reason: 'SDK' }]);
  });

  test('chat is chunked and sent through the transport say path', async () => {
    const { transport, dispatched } = fakeTransport();
    const saySpy = vi.spyOn(transport, 'say');
    const { sdk } = createLocalSdk(transport);
    await sdk.sendSay('x'.repeat(200));
    expect(saySpy.mock.calls.length).toBeGreaterThan(1);
    expect(saySpy.mock.calls.every(([chunk]) => chunk.length <= 80)).toBe(true);
    expect(dispatched).toEqual([]);   // say never goes through dispatch
  });

  test('waitForCondition resolves on the next pushed state', async () => {
    const { transport, push } = fakeTransport();
    const { sdk } = createLocalSdk(transport);
    const pending = sdk.waitForCondition(s => s.tick > 1, 200);
    push(worldState(2));
    await expect(pending).resolves.toMatchObject({ tick: 2 });
  });

  test('waitForCondition rejects when nothing satisfies it', async () => {
    const { transport } = fakeTransport();
    const { sdk } = createLocalSdk(transport);
    await expect(sdk.waitForCondition(s => s.tick > 99, 20)).rejects.toThrow(/timed out/);
  });

  test('normalisation stays off the transport snapshot, which must survive structuredClone', () => {
    const { transport, push } = fakeTransport();
    const { sdk } = createLocalSdk(transport);
    push(worldState(2));

    // The client hands the same cached snapshot to every reader, and Task 7 posts it to
    // the executor Worker — a Proxy anywhere in it would throw DataCloneError there.
    const snapshot = transport.getState()!;
    expect(() => structuredClone(snapshot)).not.toThrow();
    expect((snapshot.skills as unknown as Record<string, unknown>)['Cooking']).toBeUndefined();

    // The SDK's own copy carries the named-skills view.
    const named = sdk.getState()!.skills as unknown as Record<string, { level: number }>;
    expect(named['Cooking']).toMatchObject({ level: 5 });
    expect(sdk.getState()).not.toBe(snapshot);
  });

  test('state listeners receive the normalised copy', async () => {
    const { transport, push } = fakeTransport();
    const { sdk } = createLocalSdk(transport);
    const pending = sdk.waitForCondition(s => s.tick > 1, 200);
    push(worldState(2));
    const seen = await pending;
    expect((seen.skills as unknown as Record<string, { level: number }>)['Cooking']).toMatchObject({ level: 5 });
  });

  test('screenshot comes from the transport, not a gateway round trip', async () => {
    const { transport } = fakeTransport();
    const { sdk } = createLocalSdk(transport);
    await expect(sdk.screenshot()).resolves.toBeInstanceOf(Blob);
  });
});
