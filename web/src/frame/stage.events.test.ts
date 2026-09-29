// web/src/frame/stage.events.test.ts -- the per-session half of the event feed's wiring.
//
// Kept apart from stage.test.ts, which is 334 lines and which Tasks 13 and 18 also open. The
// fakes here are the narrow ones this claim needs: a session whose hooks really deliver, and a
// TasksApi whose onEvent really fans out, which is what proves the producers are attached per
// session rather than to the router.
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { createStage, type StageDeps } from './stage';
import { createEventBus } from './events';
import { createTasksRouter } from '../tasks/router';
import { IDLE_STATUS, type TasksApi } from '../tasks/api';
import type { TraceEvent } from '../tasks/types';
import type { CharacterSessionManager, SessionManagerDeps } from '../sessions/manager';
import type { CharacterSession } from '../sessions/types';
import type { ClientHooks, HookEvents } from '../clientTypes';

type FakeApi = TasksApi & { pushEvent(e: TraceEvent): void; eventSubscribers(): number };

function fakeApi(): FakeApi {
  const subs = new Set<(e: TraceEvent) => void>();
  return {
    dispose: vi.fn(),
    status: () => IDLE_STATUS,
    onEvent: (cb: (e: TraceEvent) => void) => { subs.add(cb); return () => { subs.delete(cb); }; },
    onStatus: () => () => {},
    pushEvent: (e: TraceEvent) => { for (const cb of [...subs]) cb(e); },
    eventSubscribers: () => subs.size
  } as unknown as FakeApi;
}

function fakeSession(id: string) {
  const handlers = new Map<string, Set<(p: unknown) => void>>();
  const hooks = {
    on: (event: string, handler: (p: unknown) => void) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler);
      handlers.set(event, set);
      return () => { set.delete(handler); };
    },
    getState: () => ({ loggedIn: true }),
    getObjName: (obj: number) => (obj === 1511 ? 'Logs' : null)
  } as unknown as ClientHooks;
  const session = {
    id, character: { id, gameName: `name_${id}`, createdAt: 1, lastLoginAt: null },
    iframe: document.createElement('iframe'), hooks, state: 'online', startedAt: 0, lastStateAt: 0
  } as unknown as CharacterSession;
  const emit = <E extends keyof HookEvents>(event: E, payload: HookEvents[E]): void => {
    for (const h of handlers.get(event) ?? []) h(payload);
  };
  return { session, emit };
}

const started = (scriptId: string): TraceEvent =>
  ({ seq: 1, at: 0, kind: 'run_started', runId: 'r1', scriptId, version: 1, params: {}, startedBy: 'claude' });

/**
 * `createStage` arms one 1 Hz tab clock per stage (`TAB_CLOCK_MS` in stage.ts), so every stage
 * this file builds has to be stopped or its interval outlives the test. Same two lines
 * stage.test.ts carries. The fake clock is file-wide, and only so the leak is observable: the
 * tab clock is the only timer in the stage's graph, and every test here is synchronous.
 */
const stages: { dispose(): void }[] = [];
beforeAll(() => { vi.useFakeTimers(); });
afterEach(() => { for (const s of stages) s.dispose(); stages.length = 0; });
afterAll(() => { vi.useRealTimers(); });

function build() {
  const sessions = new Map<string, CharacterSession>();
  let activeId: string | null = null;
  let managerDeps: SessionManagerDeps | null = null;
  const apis = new Map<string, FakeApi>();
  const manager = {
    setCharacters: () => {},
    activate: (id: string) => { activeId = id; return Promise.resolve(sessions.get(id) ?? null); },
    close: (id: string) => { sessions.delete(id); if (activeId === id) activeId = null; },
    get: (id: string) => sessions.get(id),
    list: () => [...sessions.values()],
    active: () => (activeId ? sessions.get(activeId) ?? null : null),
    activeId: () => activeId,
    states: () => ({}),
    dispose: () => {}
  } as unknown as CharacterSessionManager;
  const el = (): HTMLElement => document.createElement('div');
  const bus = createEventBus({ now: () => 0 });
  const deps: StageDeps = {
    frames: el(), tabs: el(), stage: el(), sidePanel: el(), title: el(),
    mintSession: () => Promise.reject(new Error('unused')),
    uid: () => 'u', characters: () => [], characterLimit: () => 3,
    overlays: { setXpLine: vi.fn(), setStatus: vi.fn() },
    tasks: createTasksRouter({ activeId: () => manager.activeId() }),
    events: bus,
    notify: vi.fn(), openPanel: vi.fn(), restorePanel: vi.fn(),
    enabledClientPlugins: () => [], getSize: () => 'auto', getFilter: () => 'auto',
    createSessions: d => { managerDeps = d; return manager; },
    wireTasks: d => { const api = fakeApi(); apis.set(d.characterId()!, api); return api; }
  };
  const stage = createStage(deps);
  stages.push(stage);
  const ready = (session: CharacterSession): void => { sessions.set(session.id, session); managerDeps!.onReady(session); };
  const show = (id: string): void => { activeId = id; managerDeps!.onChange(manager.list()); };
  return { stage, bus, apis, ready, show };
}

describe('the stage feeds the event bus per session', () => {
  test('a BACKGROUND character still reports xp, loot and its run', () => {
    const { bus, apis, ready, show } = build();
    const a = fakeSession('a');
    const b = fakeSession('b');
    ready(a.session);
    ready(b.session);
    show('a');
    // Everything below happens on the character that is NOT in front. tasks/router.ts drops
    // status and trace for exactly this case, which is why the run producer is attached to the
    // raw per-session api instead (plan ruling R9).
    b.emit('xp', { skill: 8, xp: 100, level: 34, delta: 25 });
    b.emit('inventory', { added: [{ id: 1511, count: 2 }], removed: [] });
    apis.get('b')!.pushEvent(started('chop-and-drop'));
    expect(bus.all().map(e => [e.characterId, e.characterName, e.type, e.text])).toEqual([
      ['b', 'name_b', 'xp', '+25 Woodcutting xp'],
      ['b', 'name_b', 'loot', '2 Logs picked up'],
      ['b', 'name_b', 'claude', 'Claude started chop-and-drop']
    ]);
  });

  test('a level-up is a second event off the same hook event', () => {
    const { bus, ready } = build();
    const a = fakeSession('a');
    ready(a.session);
    a.emit('xp', { skill: 8, xp: 100, level: 34, delta: 25 });
    a.emit('xp', { skill: 8, xp: 125, level: 35, delta: 25 });
    expect(bus.all().map(e => e.type)).toEqual(['xp', 'xp', 'level']);
    expect(bus.all()[2].text).toBe('Level up! Woodcutting 34 → 35');
  });

  test('closing a session takes its producers with it', () => {
    const { stage, bus, apis, ready } = build();
    const a = fakeSession('a');
    ready(a.session);
    const api = apis.get('a')!;
    // Two: the tasks router (which publishes the ACTIVE session) and the run producer beside it.
    expect(api.eventSubscribers()).toBe(2);
    stage.close('a');
    expect(api.eventSubscribers()).toBe(0);
    a.emit('xp', { skill: 8, xp: 200, level: 36, delta: 25 });
    api.pushEvent(started('chop-and-drop'));
    expect(bus.all()).toEqual([]);
  });

  test('a re-ready for the same session does not double up its run producer', () => {
    const { bus, apis, ready } = build();
    const a = fakeSession('a');
    ready(a.session);
    const first = apis.get('a')!;
    ready(a.session);
    expect(first.eventSubscribers()).toBe(0);
    apis.get('a')!.pushEvent(started('chop-and-drop'));
    expect(bus.all().length).toBe(1);
  });
});

describe("this file's own teardown", () => {
  // Runs last on purpose. Each test above builds one stage, and each stage arms one interval,
  // so if the afterEach stopped disposing them this would find four live timers instead of
  // none. The build() beside it keeps the zero from being vacuous: a stage really does arm one.
  test('leaves no tab clock running behind it', () => {
    expect(vi.getTimerCount()).toBe(0);
    build();
    expect(vi.getTimerCount()).toBe(1);
  });
});
