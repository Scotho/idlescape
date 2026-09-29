import { describe, expect, test, vi } from 'vitest';
import { createLocalTransport } from './localTransport';
import type { ActionResult, ClientHooks, WorldState } from '../clientTypes';

function fakeHooks() {
  const handlers = new Map<string, Set<(p: unknown) => void>>();
  const state = { tick: 1, player: { worldX: 1, worldZ: 2 } } as unknown as WorldState;
  const hooks = {
    getWorldState: vi.fn(() => state),
    dispatch: vi.fn(async () => ({ success: true, message: 'ok' })),
    cancelAll: vi.fn(),
    echoChat: vi.fn(),
    loginArmed: vi.fn(async () => ({ ok: true })),
    logout: vi.fn(),
    on: (ev: string, h: (p: unknown) => void) => {
      let set = handlers.get(ev);
      if (!set) { set = new Set(); handlers.set(ev, set); }
      set.add(h);
      return () => set.delete(h);
    }
  } as unknown as ClientHooks;
  const emit = (ev: string, p: unknown): void => { handlers.get(ev)?.forEach(h => h(p)); };
  return { hooks, emit };
}

describe('createLocalTransport', () => {
  test('pushes a snapshot on every state tick and serves it synchronously', () => {
    const { hooks, emit } = fakeHooks();
    const t = createLocalTransport(hooks, () => null);
    const seen: number[] = [];
    t.onState(s => seen.push(s.tick));
    emit('state', { tick: 1 });
    emit('state', { tick: 2 });
    expect(seen).toEqual([1, 1]);          // fake returns the same snapshot; two ticks, two pushes
    expect(t.getState()?.tick).toBe(1);
  });

  test('onState unsubscribes', () => {
    const { hooks, emit } = fakeHooks();
    const t = createLocalTransport(hooks, () => null);
    const cb = vi.fn();
    const off = t.onState(cb);
    emit('state', { tick: 1 });
    off();
    emit('state', { tick: 2 });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('forwards hook events as a tagged union', () => {
    const { hooks, emit } = fakeHooks();
    const t = createLocalTransport(hooks, () => null);
    const seen: string[] = [];
    t.onEvent(e => seen.push(e.name));
    emit('xp', { skill: 0, xp: 10, level: 1, delta: 10 });
    emit('chat', { kind: 'game', sender: null, text: 'hi' });
    emit('action', { id: 'a1', action: { type: 'none', reason: 't' }, result: { success: true, message: 'ok' } });
    expect(seen).toEqual(['xp', 'chat', 'action']);
  });

  test('dispatch forwards to hooks and times out', async () => {
    const { hooks } = fakeHooks();
    (hooks.dispatch as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise(() => {}));
    const t = createLocalTransport(hooks, () => null);
    const r = await t.dispatch({ type: 'wait', ticks: 1, reason: 't' } as never, 10);
    expect(r).toMatchObject({ success: false, reason: 'timeout' });
  });

  test('dispatch converts a rejection into a failed result', async () => {
    const { hooks } = fakeHooks();
    (hooks.dispatch as ReturnType<typeof vi.fn>).mockImplementationOnce(() => Promise.reject(new Error('boom')));
    const t = createLocalTransport(hooks, () => null);
    const r = await t.dispatch({ type: 'wait', ticks: 1, reason: 't' } as never);
    expect(r).toMatchObject({ success: false, reason: 'error' });
    expect(r.message).toContain('boom');
  });

  test('say dispatches a say action and echo goes to the client chat', async () => {
    const { hooks } = fakeHooks();
    const t = createLocalTransport(hooks, () => null);
    await t.say('hello');
    expect(hooks.dispatch).toHaveBeenCalledWith({ type: 'say', message: 'hello', reason: 'transport' });
    t.echo('note');
    expect(hooks.echoChat).toHaveBeenCalledWith('note', 'orange');
  });

  test('human input fires for canvas mousedown and keydown only', () => {
    const { hooks } = fakeHooks();
    const canvas = document.createElement('canvas');
    const t = createLocalTransport(hooks, () => canvas);
    const cb = vi.fn();
    t.humanInput(cb);
    canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(cb).toHaveBeenCalledTimes(2);
  });

  test('Escape on the canvas is the pause key of the shell, not human input', () => {
    const { hooks } = fakeHooks();
    const canvas = document.createElement('canvas');
    const t = createLocalTransport(hooks, () => canvas);
    const cb = vi.fn();
    t.humanInput(cb);
    // Escape is the co-pilot bar's panic key (frame/copilotBar.ts), forwarded out of the client
    // iframe by the stage. Counting it as human input would pause the run with reason
    // `human-input`, which auto-resumes, and the hard `player` pause would never land.
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cb).not.toHaveBeenCalled();
    // Every other key still hands control back to the player.
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(cb).toHaveBeenCalledTimes(3);
  });

  // SP7 wires one runtime per character iframe, so a transport has to be able to let go of
  // the document it was built against.
  test('dispose drops the canvas listeners and the hook subscriptions, twice over', () => {
    const { hooks, emit } = fakeHooks();
    const canvas = document.createElement('canvas');
    const t = createLocalTransport(hooks, () => canvas);
    const human = vi.fn();
    const events = vi.fn();
    const states = vi.fn();
    t.humanInput(human);
    t.onEvent(events);
    t.onState(states);

    t.dispose();
    t.dispose();                                       // idempotent: SP7 disposes on every swap

    canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    emit('xp', { skill: 0, xp: 10, level: 1, delta: 10 });
    emit('state', { tick: 2 });
    expect(human).not.toHaveBeenCalled();
    expect(events).not.toHaveBeenCalled();
    expect(states).not.toHaveBeenCalled();
  });

  test('cancel drains the client queue and settles the dispatches waiting on it', async () => {
    const { hooks } = fakeHooks();
    let never: (r: ActionResult) => void = () => {};
    (hooks.dispatch as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise<ActionResult>(r => { never = r; }));
    const transport = createLocalTransport(hooks, () => null);

    const inFlight = transport.dispatch({ type: 'say', message: 'x', reason: 'test' });
    transport.cancel();

    expect(hooks.cancelAll).toHaveBeenCalledTimes(1);
    expect(await inFlight).toMatchObject({ success: false, reason: 'cancelled' });
    // The late reply must not resolve it a second time or overwrite the cancellation.
    never({ success: true, message: 'late' });
    expect(await inFlight).toMatchObject({ success: false, reason: 'cancelled' });
  });

  test('cancel settles an in-flight say as well as a dispatch', async () => {
    const { hooks } = fakeHooks();
    (hooks.dispatch as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise<ActionResult>(() => {}));
    const transport = createLocalTransport(hooks, () => null);
    const said = transport.say('hello');
    transport.cancel();
    expect(await said).toMatchObject({ success: false, reason: 'cancelled' });
  });

  test('cancel survives a client bundle too old to publish cancelAll', async () => {
    const { hooks } = fakeHooks();
    (hooks as { cancelAll: unknown }).cancelAll = undefined;
    (hooks.dispatch as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise<ActionResult>(() => {}));
    const transport = createLocalTransport(hooks, () => null);
    const inFlight = transport.dispatch({ type: 'say', message: 'x', reason: 'test' });
    expect(() => transport.cancel()).not.toThrow();
    expect(await inFlight).toMatchObject({ success: false, reason: 'cancelled' });
  });

  // The same teardown leak family as SP8b's five: a tab that closes mid-action leaves the host's
  // `answerRpc` awaiting a promise nothing will ever settle.
  test('dispose settles the dispatches still in flight instead of dropping them', async () => {
    const { hooks } = fakeHooks();
    (hooks.dispatch as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise<ActionResult>(() => {}));
    const t = createLocalTransport(hooks, () => null);
    const inFlight = t.dispatch({ type: 'say', message: 'x', reason: 'test' });
    const said = t.say('hello');

    t.dispose();

    // Both resolve, and both say why. Without this the promise inside `workerHost.answerRpc`
    // never resolves and the Worker's RPC waits out its own timeout against a dead transport.
    expect(await inFlight).toMatchObject({ success: false, reason: 'disposed' });
    expect(await said).toMatchObject({ success: false, reason: 'disposed' });
  });

  test('relogin prefers the session manager and reports its refusal', async () => {
    const { hooks } = fakeHooks();
    const relogin = vi.fn(async () => ({ ok: false, reason: 'Login already in progress.' }));
    const t = createLocalTransport(hooks, () => null, { relogin });
    expect(await t.relogin()).toEqual({ ok: false, reason: 'Login already in progress.' });
    // The manager owns the flow; a bare `loginArmed()` against a client already in game never
    // settles, so the transport must not reach for it when it has a manager.
    expect(hooks.loginArmed).not.toHaveBeenCalled();
  });

  test('relogin falls back to the client\'s own armed credentials, and never rejects', async () => {
    const { hooks } = fakeHooks();
    const t = createLocalTransport(hooks, () => null);
    expect(await t.relogin()).toEqual({ ok: true });
    (hooks.loginArmed as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('no frame'));
    // A recovery reads `ok`; a rejection here would abort the recovery task instead.
    expect(await t.relogin()).toEqual({ ok: false, reason: 'no frame' });
  });

  test('a relogin that throws synchronously is a failed attempt, not a rejection', async () => {
    const { hooks } = fakeHooks();
    const relogin = vi.fn(() => { throw new Error('frame is gone'); });
    const t = createLocalTransport(hooks, () => null, { relogin });
    // A rejection here aborts the recovery task; the ladder needs to see one failed attempt.
    await expect(t.relogin()).resolves.toEqual({ ok: false, reason: 'frame is gone' });
  });

  test('logout forwards to the client, and a client that cannot take it does not throw', () => {
    const { hooks } = fakeHooks();
    const t = createLocalTransport(hooks, () => null);
    t.logout();
    expect(hooks.logout).toHaveBeenCalledTimes(1);
    // A frame that has already gone, or a client bundle older than this hook, must not take the
    // ending down with it: the ladder has already decided to fail the run with `logged_out`.
    (hooks.logout as ReturnType<typeof vi.fn>).mockImplementationOnce(() => { throw new Error('no frame'); });
    expect(() => t.logout()).not.toThrow();
  });

  test('screenshot rejects when there is no canvas', async () => {
    const { hooks } = fakeHooks();
    const t = createLocalTransport(hooks, () => null);
    await expect(t.screenshot()).rejects.toThrow(/no canvas/);
  });
});
