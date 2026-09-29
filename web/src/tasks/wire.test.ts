// What one session's script runtime subscribes to, and what it releases. The Worker host is
// mocked because this file is about composition, not about running scripts: the questions are
// which hooks `wireTasks` acts on, and what `dispose()` takes down with it.
import { expect, test, vi } from 'vitest';
import type { ClientHooks, WorldState } from '../clientTypes';
import type { RunStatus } from './types';

const mocks = vi.hoisted(() => {
  const idle: RunStatus = {
    state: 'idle', reason: null, runId: null, scriptId: null, scriptName: null, task: null,
    statusLine: '', attempts: 0, startedAt: null, attached: false, resumeAtMs: null,
    target: null, health: null, xpPerHour: {}
  };
  return {
    // Mutable, because `api.stop` and `api.dispatch` both branch on it and the two tests below
    // need opposite answers: a live run for the logout, an idle one to put an action in flight.
    live: { status: idle },
    idle,
    host: {
      run: vi.fn(async () => ({ runId: 'r1' })),
      restart: vi.fn(async () => ({ runId: 'r2' })),
      execute: vi.fn(async () => ({ ok: true, logs: [] })),
      compile: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(async () => ({ ok: true as const })),
      stop: vi.fn(async () => {}),
      setResumeAt: vi.fn(),
      onTrace: vi.fn(() => () => {}),
      onRunEnd: vi.fn(() => () => {}),
      onStatus: vi.fn(() => () => {}),
      terminate: vi.fn()
    }
  };
});

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('../agent/workerHost', () => ({
  createWorkerHost: () => ({ ...mocks.host, status: () => mocks.live.status }),
  spawnScriptWorker: () => undefined
}));
// Firestore itself is the fake here, not the toggle store: the questions these tests ask are
// which uid the store was handed and whether teardown reaches the backend at all, and both are
// only answered by watching the write leave the real store.
const fs = vi.hoisted(() => ({
  doc: vi.fn((..._a: unknown[]) => ({ ref: true })),
  setDoc: vi.fn(async (..._a: unknown[]) => {})
}));
vi.mock('firebase/firestore', () => ({
  collection: (..._a: unknown[]) => ({ col: true }),
  doc: (...a: unknown[]) => fs.doc(...a),
  getDoc: async () => ({ exists: () => false, id: 'x', data: () => ({}) }),
  getDocs: async () => ({ docs: [] }),
  setDoc: (...a: unknown[]) => fs.setDoc(...a),
  deleteDoc: async () => {},
  updateDoc: async () => {}
}));

const { wireTasks } = await import('./wire');

function fakeHooks() {
  const handlers = new Map<string, Set<(p: unknown) => void>>();
  // Carrying the axe `chop-and-drop` declares: `TasksApi.run` checks the declarative
  // requirements before it posts, so a bare world would refuse every run these tests start.
  const state = {
    tick: 1, inGame: true, player: { worldX: 1, worldZ: 2 },
    inventory: [{ slot: 0, id: 1351, name: 'Bronze axe', count: 1 }], equipment: []
  } as unknown as WorldState;
  const hooks = {
    getWorldState: vi.fn(() => state),
    // Never settles, so an action stays in flight for as long as the test needs it there.
    dispatch: vi.fn(() => new Promise<never>(() => {})),
    cancelAll: vi.fn(),
    echoChat: vi.fn(),
    loginArmed: vi.fn(async () => ({ ok: true })),
    on: (ev: string, h: (p: unknown) => void) => {
      let set = handlers.get(ev);
      if (!set) { set = new Set(); handlers.set(ev, set); }
      set.add(h);
      return () => set.delete(h);
    }
  } as unknown as ClientHooks;
  return { hooks, emit: (ev: string, p: unknown): void => { handlers.get(ev)?.forEach(h => h(p)); } };
}

function wire(status: RunStatus = mocks.idle) {
  mocks.live.status = status;
  mocks.host.stop.mockClear();
  mocks.host.run.mockClear();
  mocks.host.terminate.mockClear();
  const { hooks, emit } = fakeHooks();
  const api = wireTasks({
    hooks, canvas: () => null, uid: () => 'u1', characterId: () => 'c1',
    characterName: () => 'Zezima',
    relogin: async () => ({ ok: true })
  });
  return { api, hooks, emit };
}

test('a logout no longer stops the run: the ladder owns that condition now', async () => {
  const { emit } = wire({ ...mocks.idle, state: 'running', runId: 'r1' });
  // A server-initiated logout (a kick, a world shutdown) reaches this hook, and so does a dropped
  // connection whose auto-reconnect failed, after `disconnect` has already queued the recovery.
  // Stopping the run here fired exactly when the `logout` recovery was wanted.
  emit('logout', {});
  emit('disconnect', { code: 3 });
  await Promise.resolve();
  await Promise.resolve();
  expect(mocks.host.stop).not.toHaveBeenCalled();
});

test('the toggle store is wired both ways: a script turned off here is refused by run', async () => {
  localStorage.clear();
  const { api } = wire();
  await api.setEnabled('chop-and-drop', false);
  // The local mirror is the visible half of the write; Firestore is mocked away in this file.
  expect(localStorage.getItem('cs.script.u.u1.chop-and-drop')).toBe('false');
  await expect(api.run('chop-and-drop')).rejects.toMatchObject({ code: 'disabled' });
  expect(mocks.host.run).not.toHaveBeenCalled();
  await api.setEnabled('chop-and-drop', true);
  expect((await api.list()).find(t => t.id === 'chop-and-drop')?.enabled).toBe(true);
  api.dispose();
});

test('a toggle is written to this account, not to a store with no uid behind it', async () => {
  localStorage.clear();
  fs.doc.mockClear();
  fs.setDoc.mockClear();
  vi.useFakeTimers();
  try {
    const { api } = wire();
    await api.setEnabled('chop-and-drop', false);
    // Still inside the 800 ms debounce: the local mirror has it, the account does not yet.
    expect(fs.setDoc).not.toHaveBeenCalled();
    vi.advanceTimersByTime(800);
    await Promise.resolve();
    // Spec decision 7's path, spelled out: a null uid would write only the localStorage mirror
    // and this document would never exist.
    expect(fs.doc).toHaveBeenCalledWith({}, 'users', 'u1', 'scriptToggles', 'chop-and-drop');
    expect(fs.setDoc).toHaveBeenCalledTimes(1);
    expect(fs.setDoc.mock.calls[0][1]).toMatchObject({ enabled: false });
    api.dispose();
  } finally { vi.useRealTimers(); }
});

test('dispose flushes a toggle still sitting inside the debounce', async () => {
  localStorage.clear();
  fs.doc.mockClear();
  fs.setDoc.mockClear();
  vi.useFakeTimers();
  try {
    const { api } = wire();
    await api.setEnabled('mine-and-drop', false);
    expect(fs.setDoc).not.toHaveBeenCalled();
    // The tab closes before the debounce fires. Without the flush the write is simply lost: the
    // Worker is terminated and the timer goes with the page.
    api.dispose();
    await Promise.resolve();
    await Promise.resolve();
    expect(fs.doc).toHaveBeenCalledWith({}, 'users', 'u1', 'scriptToggles', 'mine-and-drop');
    expect(fs.setDoc).toHaveBeenCalledTimes(1);
    expect(fs.setDoc.mock.calls[0][1]).toMatchObject({ enabled: false });
    // And it fired once, not twice: the debounce timer went with it.
    vi.advanceTimersByTime(5000);
    expect(fs.setDoc).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});

test('dispose kills the Worker and lets the client go with it', async () => {
  const { api } = wire();
  const inFlight = api.dispatch({ type: 'say', message: 'x', reason: 'test' });
  api.dispose();
  expect(mocks.host.terminate).toHaveBeenCalledTimes(1);
  // The transport went down with the api, and it settled what it was holding rather than
  // dropping it: `onDispose` is the only thing that reaches it.
  expect(await inFlight).toMatchObject({ success: false, reason: 'disposed' });
  api.dispose();                       // idempotent: the stage disposes on every session swap
  expect(mocks.host.terminate).toHaveBeenCalledTimes(1);
});

// The name the stage read off this session's character has to reach the `run` message, or the
// summary the Worker writes names nobody.
test('the character name reaches the run request beside the id', async () => {
  const { api } = wire();
  await api.run('chop-and-drop');
  expect(mocks.host.run).toHaveBeenCalledWith(
    expect.objectContaining({ characterId: 'c1', characterName: 'Zezima' })
  );
});
