// web/src/agent/workerHost.harness.ts
// The fake Worker and fake Transport the host's tests run it against, and the `host()` that wires
// one over both. Extracted when workerHost.test.ts crossed the 400-line ceiling, so the bridge
// tests (workerHost.bridge.test.ts) and the run-control tests (workerHost.test.ts) share one set.
//
// Harness files are outside the shipped program: web/tsconfig.json excludes both harness globs and
// web/tsconfig.test.json includes them (audit C16), so naming vitest's `Mock` type here cannot put
// vitest's ambient globals into what ships, which is what used to clobber the global `setTimeout`
// signature and make toast.ts fail noImplicitAny. The `vi.fn` value itself is still handed in by
// the caller as a `SpyFactory`, so the spies belong to the test that has to reset them.
import type { Mock } from 'vitest';
import { createWorkerHost } from './workerHost';
import type { MainToWorker, Transport, WorkerToMain, WorldState } from './types';
import type { BehaviourSettings, RunSummary, ScriptManifest } from '../tasks/types';

/**
 * `vi.fn`, handed in by the test. The return is `Mock<T>`, which is `T` plus vitest's mock surface;
 * declaring it as bare `T` was a lie `vi.fn` never satisfied, and it hid every caller that reaches
 * for `.mock.calls` or `.mockResolvedValue` on a fake this file built.
 */
export type SpyFactory = <T extends (...args: never[]) => unknown>(impl: T) => Mock<T>;

export const MANIFEST: ScriptManifest = {
  id: 'chop-and-drop', name: 'Chop and drop', version: 3, description: 'chops'
};

export function fakeWorker(fn: SpyFactory) {
  const posted: MainToWorker[] = [];
  let spawns = 0;
  const self = {
    /** Set to simulate a message structured clone refuses (a proxy or a function). */
    throwOn: null as ((m: MainToWorker) => boolean) | null,
    postMessage: (m: MainToWorker) => {
      if (self.throwOn?.(m)) throw new Error('could not be cloned');
      posted.push(m);
    },
    terminate: fn(() => {}),
    onmessage: null as ((e: MessageEvent) => void) | null,
    onerror: null as ((e: unknown) => void) | null,
    receive(m: WorkerToMain) { self.onmessage?.({ data: m } as MessageEvent); },
    /** A module-scope throw inside the Worker: the browser calls `onerror` and nothing else. */
    crash() { self.onerror?.(new Error('worker blew up')); }
  };
  return { self, posted, spawns: () => spawns, spawn: () => { spawns++; return self as unknown as Worker; } };
}

export function fakeTransport(fn: SpyFactory) {
  let state: WorldState | null = null;
  const stateSubs = new Set<(s: WorldState) => void>();
  const eventSubs = new Set<(e: { name: string; payload: unknown }) => void>();
  const humanSubs = new Set<() => void>();
  const transport = {
    getState: () => state,
    onState: (cb: (s: WorldState) => void) => { stateSubs.add(cb); return () => { stateSubs.delete(cb); }; },
    onEvent: (cb: (e: { name: string; payload: unknown }) => void) => { eventSubs.add(cb); return () => { eventSubs.delete(cb); }; },
    dispatch: fn(async () => ({ success: true, message: 'dispatched' })),
    say: fn(async () => ({ success: true, message: 'said' })),
    echo: fn(() => {}),
    screenshot: fn(async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })),
    relogin: fn(async () => ({ ok: true })),
    logout: fn(() => {}),
    cancel: fn(() => {}),
    humanInput: (cb: () => void) => { humanSubs.add(cb); return () => { humanSubs.delete(cb); }; }
  };
  return {
    transport: transport as unknown as Transport,
    spies: transport,
    pushState: (s: WorldState) => { state = s; for (const cb of stateSubs) cb(s); },
    emit: (name: string, payload: unknown) => { for (const cb of eventSubs) cb({ name, payload }); },
    human: () => { for (const cb of humanSubs) cb(); }
  };
}

export function host(fn: SpyFactory) {
  return wire(fn, 50);
}

/**
 * A host built the way the shell builds it, with no `stopGraceMs` injected, so a test can pin
 * the default the production path actually uses. Every other test here shortens the grace to
 * 50 ms, which left the default itself unpinned: it was changed from 2 000 to 5 000 in SP4b
 * Task 14 and the whole agent suite stayed green when the change was reverted.
 */
export function hostWithDefaultGrace(fn: SpyFactory) {
  return wire(fn, undefined);
}

function wire(fn: SpyFactory, stopGraceMs: number | undefined) {
  const w = fakeWorker(fn);
  const t = fakeTransport(fn);
  const h = createWorkerHost({
    transport: t.transport, spawn: w.spawn, libraryManifests: [MANIFEST], stopGraceMs
  });
  return { h, ...w, ...t };
}

/** What a player who has not touched the Tasks panel's settings starts a run with. */
export const BEHAVIOUR: BehaviourSettings = { onDeath: 'loot', onStuck: 'pause', maxRelogins: 2 };
export const RUN = { scriptRef: { kind: 'library', id: 'chop-and-drop' } as const, params: { drop: true }, startedBy: 'player' as const, characterId: 'char-1', characterName: 'Zezima', behaviour: BEHAVIOUR };

export const summary = (runId: string): RunSummary => ({
  runId, scriptId: 'chop-and-drop', scriptName: 'Chop and drop', version: 3, source: 'library',
  startedBy: 'player', characterId: 'char-1', characterName: 'Zezima', params: {}, status: 'done',
  startedAt: 1, endedAt: 2, durationMs: 1, xpGained: {}, lastTask: null, summary: 'done',
  itemsDelta: {}, tilesTravelled: 0, recoveries: {}
});
