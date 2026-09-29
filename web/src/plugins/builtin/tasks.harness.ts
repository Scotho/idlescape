// web/src/plugins/builtin/tasks.harness.ts
// The fixtures the Tasks panel's tests are built on: a run status, a catalogue row, a history
// row and the fake `TasksApi` and `PluginContext` the panel is mounted over. Extracted when
// tasks.test.ts crossed the 400-line ceiling as the run report joined it.
//
// Harness files are outside the shipped program: web/tsconfig.json excludes both harness globs and
// web/tsconfig.test.json includes them (audit C16), so naming vitest's `Mock` type here cannot put
// vitest's ambient globals into what ships, which is what used to clobber the global `setTimeout`
// signature and make toast.ts fail noImplicitAny. The `vi.fn` value itself is still handed in by
// the caller as a `SpyFactory`, so the spies belong to the test that has to reset them.
import type { Mock } from 'vitest';
import type { TasksApi } from '../../tasks/api';
import type { PluginContext } from '../types';
import type { RunStatus, RunSummary, TaskSummary } from '../../tasks/types';

/**
 * `vi.fn`, handed in by the test. The return is `Mock<T>`, which is `T` plus vitest's mock surface;
 * declaring it as bare `T` was a lie `vi.fn` never satisfied, and it hid every caller that reaches
 * for `.mock.calls` or `.mockResolvedValue` on a fake this file built.
 */
export type SpyFactory = <T extends (...args: never[]) => unknown>(impl: T) => Mock<T>;

export const status = (state: RunStatus['state']): RunStatus => ({
  state, reason: null, runId: state === 'idle' ? null : 'r1', scriptId: 'chop-and-drop', scriptName: 'Chop and drop',
  task: 'chop-nearest', statusLine: 'Chopping Tree', attempts: 1, startedAt: 1_000, attached: false, resumeAtMs: null,
  target: null, health: null, xpPerHour: {}
});

export const task = (o: Partial<TaskSummary>): TaskSummary => ({
  id: 'chop-and-drop', name: 'Chop and drop', description: 'Chops', version: 1, tags: ['skilling'],
  source: 'library', params: {}, requirements: { ok: true, missing: [] }, order: 10, enabled: true, ...o
});

export const run = (o: Partial<RunSummary>): RunSummary => ({
  runId: 'r1', scriptId: 'chop-and-drop', scriptName: 'Chop and drop', version: 1, source: 'library', startedBy: 'player',
  characterId: null, characterName: null, params: {}, status: 'done', startedAt: 0,
  endedAt: 65_000, durationMs: 65_000, xpGained: { Woodcutting: 250 }, lastTask: null,
  summary: 'chopped', itemsDelta: {}, tilesTravelled: 0, recoveries: {}, ...o
});

export function fakeApi(fn: SpyFactory, over: Partial<TasksApi> = {}): TasksApi {
  return {
    list: fn(async () => [task({}), task({ id: 'u1', name: 'My miner', source: 'user' })]),
    get: fn(async () => ({ ...task({ id: 'u1', source: 'user' }), code: 'export default defineScript({});' })),
    save: fn(async () => ({ id: 'x', version: 1 })),
    remove: fn(async () => {}),
    install: fn(async () => ({ id: 'chop-and-drop' })),
    run: fn(async () => ({ runId: 'r2' })),
    execute: fn(async () => ({ ok: true, value: 42, logs: ['hi'] })),
    dispatch: fn(async () => ({ success: true, message: 'ok' })),
    pause: fn(async () => {}), resume: fn(async () => {}), stop: fn(async () => {}),
    restart: fn(async () => ({ runId: 'r3' })),
    setEnabled: fn(async () => {}),
    status: fn(() => status('idle')),
    getRun: fn(async () => ({ summary: run({}), events: [{ seq: 1, at: 0, kind: 'log' as const, level: 'info' as const, text: 'hello' }] })),
    listRuns: fn(async () => [run({})]),
    exportRun: fn(async () => new Blob(['{}'], { type: 'application/json' })),
    onEvent: fn(() => () => {}), onStatus: fn(() => () => {}),
    getState: fn(() => null), screenshot: fn(async () => new Blob()),
    settings: { get: fn(() => ({ resumeAfterHumanInputMs: 5000, echoLogsToChat: false, onDeath: 'loot' as const, onStuck: 'pause' as const, maxRelogins: 2 })), set: fn(() => {}) },
    dispose: fn(() => {}),
    ...over
  };
}

export function fakeCtx(fn: SpyFactory, over: Partial<PluginContext> = {}): PluginContext {
  return {
    client: () => null,
    settings: { get: <T,>() => undefined as T, set: fn(() => {}), subscribe: () => () => {} },
    storage: { get: () => null, set: fn(() => {}) },
    notify: fn(() => {}), openPanel: fn(() => {}), user: () => null,
    ...over
  };
}
