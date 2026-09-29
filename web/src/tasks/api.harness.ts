// web/src/tasks/api.harness.ts
// The fakes `TasksApi`'s tests are built on: a Worker host, a run history, a user store and a
// transport, plus the `setup` that wires one api over all four. Extracted when api.test.ts
// crossed the 400-line ceiling, so the catalogue-and-run-control tests (api.test.ts) and the
// trace/settings/teardown tests (api.runtime.test.ts) can share one set rather than grow two.
//
// Harness files are outside the shipped program: web/tsconfig.json excludes both harness globs and
// web/tsconfig.test.json includes them (audit C16), so naming vitest's `Mock` type here cannot put
// vitest's ambient globals into what ships, which is what used to clobber the global `setTimeout`
// signature and make toast.ts fail noImplicitAny. The `vi.fn` value itself is still handed in by
// the caller as a `SpyFactory`, so the spies belong to the test that has to reset them.
import type { Mock } from 'vitest';
import { createTasksApi, TasksError, type TasksApi } from './api';
import { createToggleStore } from './toggles';
import type { RunHistory } from './history';
import type { SaveTaskInput, TaskLastRun, UserTaskDoc, UserTaskStore } from './userStore';
import type { RunStatus, RunSummary, ScriptManifest, TraceEvent } from './types';
import type { Transport, WorldState } from '../agent/types';
import type { CompileResult, RunEnd, RunRequest, ResumeResult, WorkerHost } from '../agent/workerHost';

/**
 * `vi.fn`, handed in by the test. The return is `Mock<T>`, which is `T` plus vitest's mock surface;
 * declaring it as bare `T` was a lie `vi.fn` never satisfied, and it hid every caller that reaches
 * for `.mock.calls` or `.mockResolvedValue` on a fake this file built.
 */
export type SpyFactory = <T extends (...args: never[]) => unknown>(impl: T) => Mock<T>;

export const IDLE: RunStatus = {
  state: 'idle', reason: null, runId: null, scriptId: null, scriptName: null, task: null,
  statusLine: '', attempts: 0, startedAt: null, attached: false, resumeAtMs: null,
  target: null, health: null, xpPerHour: {}
};

export const CHOP: ScriptManifest = {
  id: 'chop-and-drop', name: 'Chop and drop', version: 3, description: 'chops trees', order: 10,
  tags: ['skilling'], estimateMinutes: 20,
  params: { untilLevel: { type: 'number', label: 'Stop at level', default: 15, min: 2, max: 99 }, keepLogs: { type: 'boolean', label: 'Keep logs', default: false } },
  requires: [{ kind: 'item', name: 'Bronze axe', text: 'Needs a bronze axe' }]
};
export const MINE: ScriptManifest = { id: 'mine-and-drop', name: 'Mine and drop', version: 1, description: 'mines', order: 20 };

export const world = (items: string[]): WorldState => ({
  inventory: items.map((name, id) => ({ id, name, count: 1 })), equipment: [], skills: [], regionId: 12_850
} as unknown as WorldState);

export function fakeHost(fn: SpyFactory) {
  let status: RunStatus = { ...IDLE };
  const traceSubs = new Set<(e: TraceEvent) => void>();
  const endSubs = new Set<(e: RunEnd) => void>();
  const statusSubs = new Set<(s: RunStatus) => void>();
  const runs: RunRequest[] = [];
  const api = {
    runs,
    // Like the real host: every write of `status` fans out to `onStatus`, including the ones
    // that originate in the Worker with no trace event behind them.
    setStatus: (patch: Partial<RunStatus>): void => {
      status = { ...status, ...patch };
      for (const cb of statusSubs) cb({ ...status });
    },
    trace: (e: TraceEvent): void => { for (const cb of traceSubs) cb(e); },
    end: (e: RunEnd): void => { for (const cb of endSubs) cb(e); },
    compileResult: { ok: true, manifest: { id: 'my-script', name: 'Mine', version: 1, description: '' } } as CompileResult,
    resumeResult: { ok: true } as ResumeResult,
    host: {
      run: fn(async (req: RunRequest) => {
        runs.push(req);
        const runId = `r${runs.length}`;
        status = { ...status, state: 'running', runId };
        return { runId };
      }),
      restart: fn(async () => { status = { ...status, state: 'running', runId: 'r2' }; return { runId: 'r2' }; }),
      execute: fn(async () => ({ ok: true, value: 42, logs: [] })),
      compile: fn(async () => api.compileResult),
      pause: fn(() => {}),
      resume: fn(async () => api.resumeResult),
      stop: fn(async () => { status = { ...status, state: 'stopped' }; }),
      status: () => ({ ...status }),
      setResumeAt: fn(() => {}),
      onTrace: (cb: (e: TraceEvent) => void) => { traceSubs.add(cb); return () => { traceSubs.delete(cb); }; },
      onRunEnd: (cb: (e: RunEnd) => void) => { endSubs.add(cb); return () => { endSubs.delete(cb); }; },
      onStatus: (cb: (s: RunStatus) => void) => { statusSubs.add(cb); return () => { statusSubs.delete(cb); }; },
      terminate: fn(() => {})
    } as unknown as WorkerHost
  };
  return api;
}

export function fakeHistory(fn: SpyFactory) {
  const puts: { summary: RunSummary; events: TraceEvent[] }[] = [];
  const appends: { runId: string; events: TraceEvent[] }[] = [];
  const store = new Map<string, { summary: RunSummary; events: TraceEvent[] }>();
  const history: RunHistory = {
    put: fn(async (summary: RunSummary, events: TraceEvent[]) => { puts.push({ summary, events }); store.set(summary.runId, { summary, events }); }),
    appendEvents: fn(async (runId: string, events: TraceEvent[]) => { appends.push({ runId, events }); }),
    list: fn(async () => [...store.values()].map(v => v.summary)),
    get: fn(async (runId: string) => store.get(runId) ?? null),
    clear: fn(async () => { store.clear(); })
  };
  return { history, puts, appends, store };
}

export function fakeStore(fn: SpyFactory, initial: UserTaskDoc[] = []) {
  const docs = new Map(initial.map(d => [d.id, d]));
  const saved: SaveTaskInput[] = [];
  const lastRuns: { id: string; at: number }[] = [];
  let signedIn = true;
  const guard = (): void => { if (!signedIn) throw new Error('not signed in'); };
  const store: UserTaskStore = {
    list: fn(async () => (signedIn ? [...docs.values()] : [])),
    get: fn(async (id: string) => docs.get(id) ?? null),
    save: fn(async (input: SaveTaskInput) => {
      guard();
      saved.push(input);
      const id = input.id ?? `gen-${saved.length}`;
      const version = (docs.get(id)?.version ?? 0) + 1;
      docs.set(id, { ...input, id, version, createdAt: 1, updatedAt: 1 } as UserTaskDoc);
      return { id, version };
    }),
    remove: fn(async (id: string) => { guard(); docs.delete(id); }),
    setLastRun: fn(async (id: string, lastRun: TaskLastRun) => { guard(); lastRuns.push({ id, at: lastRun.at }); })
  };
  return { store, docs, saved, lastRuns, signOut: () => { signedIn = false; } };
}

export function fakeTransport(fn: SpyFactory, state: WorldState | null) {
  const echoes: string[] = [];
  const transport = {
    getState: () => state,
    onState: () => () => {},
    onEvent: () => () => {},
    dispatch: fn(async () => ({ success: true, message: 'ok' })),
    say: fn(async () => ({ success: true, message: 'ok' })),
    echo: fn((text: string) => { echoes.push(text); }),
    screenshot: fn(async () => new Blob([new Uint8Array([1])], { type: 'image/png' })),
    relogin: fn(async () => ({ ok: true })),
    logout: fn(() => {}),
    cancel: fn(() => {}),
    humanInput: () => () => {}
  };
  return { transport: transport as unknown as Transport, spies: transport, echoes };
}

export const userDoc = (over: Partial<UserTaskDoc> = {}): UserTaskDoc => ({
  id: 'u1', name: 'My miner', description: 'mine', tags: ['mining'], params: {},
  code: 'export default defineScript({})', version: 2, source: 'user', createdAt: 1, updatedAt: 2, ...over
});

/**
 * The real toggle store over an empty backend, rather than a stand-in: `isEnabled`'s
 * "absent means enabled" is the rule the api leans on, and a fake that answered from a plain
 * object would be free to disagree with it. A null uid means no backend write and no debounce
 * timer, so a test needs neither fake timers nor a flush.
 */
export function fakeToggles(fn: SpyFactory, off: string[]) {
  const store = createToggleStore({ load: async () => ({}), write: async () => {} });
  for (const id of off) store.setEnabled(null, id, false);
  const toggles = {
    isEnabled: fn((id: string) => store.isEnabled(id)),
    setEnabled: fn(async (id: string, enabled: boolean) => { store.setEnabled(null, id, enabled); })
  };
  return { store, toggles };
}

export function setup(fn: SpyFactory, opts: { docs?: UserTaskDoc[]; state?: WorldState | null; off?: string[] } = {}) {
  const h = fakeHost(fn);
  const hist = fakeHistory(fn);
  const st = fakeStore(fn, opts.docs ?? []);
  const tr = fakeTransport(fn, opts.state === undefined ? world(['Bronze axe']) : opts.state);
  const bag = new Map<string, string>();
  const tg = fakeToggles(fn, opts.off ?? []);
  const cancelHumanInput = fn(() => {});
  const onDispose = fn(() => {});
  const api: TasksApi = createTasksApi({
    host: h.host, history: hist.history, store: st.store, transport: tr.transport,
    library: { manifests: () => [CHOP, MINE], byId: id => [CHOP, MINE].find(m => m.id === id) },
    characterId: () => 'char-1',
    characterName: () => 'Zezima',
    storage: { get: k => bag.get(k) ?? null, set: (k, v) => { bag.set(k, v); } },
    toggles: tg.toggles,
    cancelHumanInput,
    onDispose,
    now: () => 5000
  });
  return { api, host: h, hist, store: st, tr, bag, toggles: tg, cancelHumanInput, onDispose };
}

/**
 * A whole `TasksApi` for a consumer that only listens to it: the run producer (frame/
 * eventProducers.ts) subscribes with `onEvent` and reads nothing else, and a fresh object literal
 * in that test would have been two methods wide. Implementing the WHOLE interface means a method
 * added upstream is a compile error here rather than a silent `undefined` at a call site, and
 * every method this fake has no business answering throws by name instead of returning a lie.
 *
 * This file imports nothing from vitest (see the header), so `pushEvent` is a plain function over
 * a Set rather than a spy.
 */
export interface FakeTasksApi extends TasksApi {
  /** Push one trace event to every current `onEvent` subscriber, as the recorder would. */
  pushEvent(e: TraceEvent): void;
  /** Push one status to every current `onStatus` subscriber. */
  pushStatus(patch: Partial<RunStatus>): void;
  /** How many `onEvent` subscribers are live. A disposer that only gated would leave this at 1. */
  eventSubscribers(): number;
  statusSubscribers(): number;
}

export function fakeTasksApi(): FakeTasksApi {
  const eventSubs = new Set<(e: TraceEvent) => void>();
  const statusSubs = new Set<(s: RunStatus) => void>();
  let status: RunStatus = { ...IDLE };
  /** Not part of this fake's job. Named, so a test that reaches for one reads why it stopped. */
  const unsupported = (method: string): never => {
    throw new Error(`fakeTasksApi: ${method}() is not part of this fake`);
  };
  return {
    list: async () => unsupported('list'),
    get: async () => unsupported('get'),
    save: async () => unsupported('save'),
    remove: async () => unsupported('remove'),
    install: async () => unsupported('install'),
    run: async () => unsupported('run'),
    execute: async () => unsupported('execute'),
    dispatch: async () => unsupported('dispatch'),
    pause: async () => unsupported('pause'),
    resume: async () => unsupported('resume'),
    stop: async () => unsupported('stop'),
    restart: async () => unsupported('restart'),
    setEnabled: async () => unsupported('setEnabled'),
    status: () => ({ ...status }),
    getRun: async () => unsupported('getRun'),
    listRuns: async () => unsupported('listRuns'),
    exportRun: async () => unsupported('exportRun'),
    onEvent: cb => { eventSubs.add(cb); return () => { eventSubs.delete(cb); }; },
    onStatus: cb => { statusSubs.add(cb); return () => { statusSubs.delete(cb); }; },
    getState: () => null,
    screenshot: async () => unsupported('screenshot'),
    settings: { get: () => unsupported('settings.get'), set: () => unsupported('settings.set') },
    dispose: () => { eventSubs.clear(); statusSubs.clear(); },
    pushEvent(e) { for (const cb of [...eventSubs]) cb(e); },
    pushStatus(patch) { status = { ...status, ...patch }; for (const cb of [...statusSubs]) cb({ ...status }); },
    eventSubscribers: () => eventSubs.size,
    statusSubscribers: () => statusSubs.size
  };
}

/** Every rejection out of this api carries a `code`; this is how a test gets at one. */
export const grab = async (p: Promise<unknown>): Promise<TasksError> => {
  try { await p; } catch (e) { return e as TasksError; }
  throw new Error('expected a TasksError');
};
