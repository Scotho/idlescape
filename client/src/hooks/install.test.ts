// client/src/hooks/install.test.ts
import { beforeEach, describe, expect, test } from 'bun:test';
import type { ActionResult, ClientHooks, ClientState, HookBridge, LoginResult, ObjInfo, WorldBridge } from './types';

// install.ts targets a browser realm; bun has no `window`, so alias it before the import.
(globalThis as { window?: unknown }).window = globalThis;
const { installHooks } = await import('./install');

const state: ClientState = {
  loggedIn: false, gameName: null, skills: { xp: [], level: [] }, inventory: [], fps: 50, rttMs: null,
  hp: { current: 10, max: 10 }, prayer: { current: 1, max: 1 }, energy: 100, boosts: [],
  position: { x: 0, z: 0, level: 0 }, activeTab: 3, sceneReady: false
};

interface Calls {
  login: [string, string][];
  armLogin: [string, string, string][];
  loginArmed: number;
  suspended: boolean[];
  attended: boolean[];
}

function harness(over: Partial<HookBridge> = {}): { hooks: ClientHooks; calls: Calls } {
  const calls: Calls = { login: [], armLogin: [], loginArmed: 0, suspended: [], attended: [] };
  const bridge: HookBridge = {
    login: (gameName, secret) => { calls.login.push([gameName, secret]); return Promise.resolve<LoginResult>({ ok: true }); },
    armLogin: (gameName, secret, label) => { calls.armLogin.push([gameName, secret, label]); },
    loginArmed: () => { calls.loginArmed++; return Promise.resolve<LoginResult>({ ok: false, code: 5, reason: 'already logged in' }); },
    logout: () => {},
    setRenderSuspended: v => { calls.suspended.push(v); },
    setAttended: v => { calls.attended.push(v); },
    addChat: () => {},
    getState: () => state,
    getObjName: () => null,
    getObjIcon: () => null,
    getObjInfo: () => null,
    world: () => ({} as WorldBridge),
    ...over
  };
  return { hooks: installHooks(bridge).hooks, calls };
}

describe('installHooks armed-login surface', () => {
  beforeEach(() => { (globalThis as { idlescape?: unknown }).idlescape = undefined; });

  test('armLogin forwards the credentials and label without logging in', () => {
    const { hooks, calls } = harness();
    hooks.armLogin('bob', 'sec', 'Bob');
    expect(calls.armLogin).toEqual([['bob', 'sec', 'Bob']]);
    expect(calls.login).toEqual([]);
    expect(calls.loginArmed).toBe(0);
  });

  test('armLogin defaults the label to the game name', () => {
    const { hooks, calls } = harness();
    hooks.armLogin('bob', 'sec');
    expect(calls.armLogin).toEqual([['bob', 'sec', 'bob']]);
  });

  test('loginArmed resolves the bridge result', async () => {
    const { hooks, calls } = harness();
    await expect(hooks.loginArmed()).resolves.toEqual({ ok: false, code: 5, reason: 'already logged in' });
    expect(calls.loginArmed).toBe(1);
  });

  test('setRenderSuspended and setAttended forward the flag', () => {
    const { hooks, calls } = harness();
    hooks.setRenderSuspended(true);
    hooks.setRenderSuspended(false);
    hooks.setAttended(true);
    expect(calls.suspended).toEqual([true, false]);
    expect(calls.attended).toEqual([true]);
  });

  test('the public surface is published on window.idlescape.client', () => {
    const { hooks } = harness();
    const published = (globalThis as { idlescape?: { client?: ClientHooks } }).idlescape?.client;
    expect(published).toBe(hooks);
    for (const member of ['login', 'armLogin', 'loginArmed', 'logout', 'setRenderSuspended', 'setAttended', 'echoChat', 'getState', 'getObjName', 'getWorldState', 'dispatch', 'on']) {
      expect(typeof (published as unknown as Record<string, unknown>)[member]).toBe('function');
    }
  });
});

/**
 * A world bridge the action queue can actually run against. Only `executor.execute` is
 * exercised here; `collectState` throws rather than fabricating a BotState nothing reads.
 */
function worldBridge(execute: () => Promise<ActionResult>): WorldBridge {
  return {
    collector: { collectState: () => { throw new Error('collectState is not used by this test'); } },
    executor: { execute },
    extras: {
      hint: () => ({ type: 0, npc: 0, player: 0, tileX: 0, tileZ: 0, height: 0 }),
      flashIcon: () => -1,
      tutorialRoot: () => -1,
      componentText: () => null,
      modalComponentIds: () => [],
      position: () => ({ x: 0, z: 0, level: 0 })
    },
    tick: () => 1,
    cycle: () => 1
  };
}

describe('installHooks cancelAll (SP4b)', () => {
  beforeEach(() => { (globalThis as { idlescape?: unknown }).idlescape = undefined; });

  test('cancelAll drops queued actions but leaves the running one', async () => {
    let release: (r: ActionResult) => void = () => {};
    const world = worldBridge(() => new Promise<ActionResult>(r => { release = r; }));
    const { hooks } = harness({ world: () => world });

    // The first dispatch claims the queue synchronously, so the second one queues behind it.
    const first = hooks.dispatch({ type: 'say', message: 'a', reason: 'test' });
    const second = hooks.dispatch({ type: 'say', message: 'b', reason: 'test' });
    hooks.cancelAll();
    release({ success: true, message: 'done' });

    expect(await first).toEqual({ success: true, message: 'done' });
    expect(await second).toMatchObject({ success: false, reason: 'cancelled' });
  });
});

const COIN_ICON = 'data:image/png;base64,COIN';
const COIN_INFO: ObjInfo = { name: 'Coins', examine: 'Lovely money!', cost: 1, stackable: true, noted: false };

describe('installHooks obj art surface (patch 28)', () => {
  beforeEach(() => { (globalThis as { idlescape?: unknown }).idlescape = undefined; });

  test('getObjIcon forwards the id and the count, defaulting the count to 1', () => {
    const asked: [number, number][] = [];
    const { hooks } = harness({
      getObjIcon: (id: number, count: number) => { asked.push([id, count]); return COIN_ICON; }
    });
    expect(hooks.getObjIcon(995, 500)).toBe(COIN_ICON);
    expect(hooks.getObjIcon(995)).toBe(COIN_ICON);
    expect(asked).toEqual([[995, 500], [995, 1]]);
  });

  test('getObjIcon relays a null from the bridge rather than inventing a placeholder', () => {
    const { hooks } = harness({ getObjIcon: () => null });
    expect(hooks.getObjIcon(4151)).toBeNull();
  });

  test('getObjInfo relays the obj facts and a null for an unknown id', () => {
    const { hooks } = harness({ getObjInfo: (id: number) => (id === 995 ? COIN_INFO : null) });
    expect(hooks.getObjInfo(995)).toEqual(COIN_INFO);
    expect(hooks.getObjInfo(99999)).toBeNull();
  });

  test('both members are published on window.idlescape.client', () => {
    const { hooks } = harness();
    const published = (globalThis as { idlescape?: { client?: ClientHooks } }).idlescape?.client;
    expect(published).toBe(hooks);
    for (const member of ['getObjIcon', 'getObjInfo']) {
      expect(typeof (published as unknown as Record<string, unknown>)[member]).toBe('function');
    }
  });
});
