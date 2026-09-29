// Main-thread half of the script runtime. Script code never runs here (spec section 3):
// this file owns the Worker, pushes world state and hook events into it, answers the
// Worker's transport RPC against the real game, and exposes run control to the panels
// and to `window.idlescape.tasks` (Task 10).
import { createRpcClient } from './rpc';
import type {
  MainToWorker, RpcMethod, ScriptRef, Transport, TransferredBlob, Unsub, WorkerToMain, WorldState
} from './types';
import type { BotAction, ChatColour } from '../clientTypes';
import type {
  Actor, BehaviourSettings, ParamValues, PauseReason, RunOutcome, RunStatus, RunSummary,
  ScriptManifest, TraceEvent
} from '../tasks/types';

export interface RunRequest {
  scriptRef: ScriptRef;
  params: ParamValues;
  startedBy: Actor;
  characterId: string | null;
  /** The character's game name, for the history row. Crosses beside the id and is never read here. */
  characterName: string | null;
  /** The player's bot-behaviour settings as they stood when this run was asked for (Task 8c). */
  behaviour: BehaviourSettings;
}

export interface RunEnd { runId: string; outcome: RunOutcome; summary: RunSummary }
export interface ExecuteResult { ok: boolean; value?: unknown; error?: string; logs: string[] }
export type CompileResult = { ok: true; manifest: ScriptManifest } | { ok: false; message: string; line?: number };
export type ResumeResult = { ok: true } | { ok: false; reason: 'paused_by_player' | 'not_paused' };

export interface WorkerHost {
  run(req: RunRequest): Promise<{ runId: string }>;
  /**
   * Re-run the last request against freshly loaded script code. A restart is a run starting, so
   * the behaviour settings are required rather than optional: replaying the ones the old request
   * carried would quietly break the "read once, at run start" ruling on every restart.
   */
  restart(behaviour: BehaviourSettings): Promise<{ runId: string }>;
  execute(code: string, params?: ParamValues): Promise<ExecuteResult>;
  compile(code: string): Promise<CompileResult>;
  pause(reason: PauseReason, by: Actor): void;
  resume(by: Actor): Promise<ResumeResult>;
  stop(by: Actor): Promise<void>;
  status(): RunStatus;
  /** When the human-input timer will auto-resume (Task 10 owns the timer). */
  setResumeAt(at: number | null): void;
  onTrace(cb: (e: TraceEvent) => void): Unsub;
  onRunEnd(cb: (e: RunEnd) => void): Unsub;
  /**
   * Every move of `status()`, including the ones the Worker starts on its own: an auto-resume
   * after the human-input timer, a `stuck` pause, the end of a run. Without this the api can only
   * publish the transitions it asked for itself, and the run banner goes stale (SP4a fix round).
   */
  onStatus(cb: (s: RunStatus) => void): Unsub;
  terminate(): void;
}

export interface WorkerHostDeps {
  transport: Transport;
  /** Production: `() => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`. */
  spawn: () => Worker;
  libraryManifests: ScriptManifest[];
  now?: () => number;
  /** How long a stop waits for `run_end` before the Worker is killed (spec section 8). */
  stopGraceMs?: number;
}

/**
 * The production `spawn`. Vite recognises exactly this `new Worker(new URL(...), { type:
 * 'module' })` form and emits `worker.ts` as its own module-worker chunk.
 */
export function spawnScriptWorker(): Worker {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
}

const IDLE: RunStatus = {
  state: 'idle', reason: null, runId: null, scriptId: null, scriptName: null, task: null,
  statusLine: '', attempts: 0, startedAt: null, attached: false, resumeAtMs: null,
  target: null, health: null, xpPerHour: {}
};

const text = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** `Blob.arrayBuffer` is missing under jsdom (and pre-2020 Safari); FileReader is not. */
function blobToBuffer(b: Blob): Promise<ArrayBuffer> {
  if (typeof b.arrayBuffer === 'function') return b.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error ?? new Error('screenshot read failed'));
    r.readAsArrayBuffer(b);
  });
}

export function createWorkerHost(d: WorkerHostDeps): WorkerHost {
  const now = d.now ?? Date.now;
  // How long a stop waits for the Worker's own run-end report before killing it. Measured on
  // the live stack in SP4b Task 14: a chop run stopped while its task sat inside an SDK action
  // took about 1.7 s to unwind and report, and the 2 s this used to allow left no room for the
  // hops in front of it, so every stopped library run was killed instead and wrote a summary
  // reading "the worker was terminated before the run reported an end" with no xp, no items
  // and no tiles. The timer is only a backstop - a stop that lands settles the moment the
  // report arrives - so the extra seconds cost nothing except in the case they exist for.
  const graceMs = d.stopGraceMs ?? 5000;
  const traceSubs = new Set<(e: TraceEvent) => void>();
  const endSubs = new Set<(e: RunEnd) => void>();
  const statusSubs = new Set<(s: RunStatus) => void>();
  const resumeWaiters: ((r: ResumeResult) => void)[] = [];
  const endWaiters: (() => void)[] = [];
  const executes = createRpcClient<MainToWorker, ExecuteResult>(m => post(m), { timeoutMs: 70_000 });
  const compiles = createRpcClient<MainToWorker, CompileResult>(m => post(m));

  let worker: Worker | null = null;
  let status: RunStatus = { ...IDLE };
  let lastRun: RunRequest | null = null;
  let lastPublication: number | null = null;
  let degradedWarned = false;
  let offTransport: Unsub[] = [];

  /**
   * Fan out to panels. A subscriber that throws must not cost the others their event, nor
   * take down the caller — `onStatus` runs inside the Worker's message handler, and `onTrace`
   * inside the client's own tick. Mirrors `client/src/hooks/emitter.ts`: log and carry on.
   * The copy lets a subscriber unsubscribe (or subscribe) from inside its own callback.
   */
  function emit<T>(subs: Set<(v: T) => void>, value: T): void {
    for (const cb of [...subs]) {
      try { cb(value); } catch (e) { console.error('[tasks] a host subscriber threw', e); }
    }
  }

  /** The only writer of `status`, so no transition can escape `onStatus`. */
  function setStatus(next: RunStatus): void {
    status = next;
    emit(statusSubs, { ...next });
  }

  function ensureWorker(): Worker {
    if (worker) return worker;
    const w = d.spawn();
    w.onmessage = (e: MessageEvent) => { handle(e.data as WorkerToMain); };
    w.onerror = () => {
      // A Worker that throws at module scope never answers again. `state: 'failed'` alone left
      // the host holding the corpse: no `run_end`, transport subscriptions still live, and
      // `failed` is not a live state, so the next `run` posted into it. Reject the outstanding
      // calls with the truthful reason, then tear the Worker down — `terminate` synthesises the
      // `run_end` while the status still says a run is live, and nulls `worker` so the next post
      // spawns a fresh one — and leave the status on `failed` so the panels say why.
      executes.rejectAll('worker crashed');
      compiles.rejectAll('worker crashed');
      terminate();
      setStatus({ ...status, state: 'failed', statusLine: 'worker crashed' });
    };
    worker = w;
    lastPublication = null;
    degradedWarned = false;
    offTransport = [
      // One message per game tick: every post is a structured clone of the whole world,
      // so a snapshot the client has already published is dropped. The client's `state`
      // hook fires once per PLAYER_INFO packet, which is what makes `tick` the publication
      // key. It is deliberately NOT `revision ?? tick`: `revision` only advances on the
      // vendored collector's `publish` path, which the client does not take, so keying on
      // it pinned every snapshot at revision 0 and dropped every tick after the first —
      // `wait.*` never resolved and the runner's loop never woke (SP4a fix round).
      d.transport.onState(s => {
        const publication = s.tick;
        if (publication !== undefined && publication === lastPublication) return;
        lastPublication = publication ?? null;
        postState(s);
      }),
      d.transport.onEvent(event => post({ t: 'event', event })),
      d.transport.humanInput(() => post({ t: 'human_input' }))
    ];
    // A Worker starts life knowing nothing, and `onState` only speaks from the next tick onwards:
    // the first run would evaluate its custom requirements — and every `wait.*` — against no
    // snapshot until the game ticked again. Seed it with what the transport already holds, and
    // count that as the tick's publication so `onState` still de-duplicates it (SP4a re-review).
    const snapshot = d.transport.getState();
    if (snapshot) {
      lastPublication = snapshot.tick ?? null;
      postState(snapshot);
    }
    return w;
  }

  function post(m: MainToWorker, transfer?: Transferable[]): void {
    const w = ensureWorker();
    if (transfer) w.postMessage(m, transfer);
    else w.postMessage(m);
  }

  function postState(state: WorldState): void {
    try {
      post({ t: 'state', state });
      return;
    } catch (e) {
      // Structured clone refuses proxies and functions. The vendored SDK keeps its
      // normalisation off the client's snapshot, but a plugin may have decorated it;
      // a JSON round trip is slower and lossy but keeps the run alive. Say so once per
      // Worker: this runs every tick, and silent degradation is how a run goes strange
      // for an hour with nothing in the trace to explain it.
      warnDegraded(`world state is not structured-cloneable (${text(e)}); posting a JSON copy`);
    }
    try {
      post({ t: 'state', state: JSON.parse(JSON.stringify(state)) as WorldState });
    } catch (e) {
      // A circular or BigInt-bearing snapshot cannot be JSON'd either. This is called
      // from the client's own unguarded subscriber loop, so throwing here would take
      // the client's tick down with it: drop this one, the next tick brings another.
      warnDegraded(`world state could not be posted at all (${text(e)}); dropping the tick`);
    }
  }

  /** One line per Worker, to the console and to the trace the panel shows. */
  function warnDegraded(message: string): void {
    if (degradedWarned) return;
    degradedWarned = true;
    console.warn(`[tasks] ${message}`);
    const event: TraceEvent = { seq: 0, at: now(), kind: 'log', level: 'warn', text: message };
    emit(traceSubs, event);
  }

  function handle(m: WorkerToMain): void {
    switch (m.t) {
      case 'ready': return;
      case 'rpc': void answerRpc(m); return;
      case 'trace': emit(traceSubs, m.event); return;
      case 'status':
        setStatus({ ...status, ...m.status });
        return;
      case 'run_end': {
        setStatus({ ...status, state: m.outcome, task: null, reason: null });
        const waiters = endWaiters.splice(0);
        emit(endSubs, { runId: m.runId, outcome: m.outcome, summary: m.summary });
        for (const w of waiters) w();
        return;
      }
      case 'execute_result':
        executes.settle(m.callId, true, { ok: m.ok, value: m.value, error: m.error, logs: m.logs });
        return;
      case 'compile_result':
        compiles.settle(m.callId, true, m.ok && m.manifest
          ? { ok: true, manifest: m.manifest }
          : { ok: false, message: m.message ?? 'compile failed', line: m.line });
        return;
      case 'resume_result':
        resumeWaiters.shift()?.(m.ok ? { ok: true } : { ok: false, reason: m.reason ?? 'not_paused' });
        return;
      case 'cancel':
        // The Worker aborted a task. Drain the client queue on its behalf: the Worker has no
        // client, and its own RPC rejection only stops it waiting, not the game moving.
        d.transport.cancel();
        return;
    }
  }

  async function answerRpc(m: Extract<WorkerToMain, { t: 'rpc' }>): Promise<void> {
    try {
      const value = await callTransport(m.method, m.args);
      if (value instanceof Blob) {
        const buffer = await blobToBuffer(value);
        const blob: TransferredBlob = { __blob: true, type: value.type, buffer };
        post({ t: 'rpc_result', callId: m.callId, ok: true, value: blob }, [buffer]);
        return;
      }
      post({ t: 'rpc_result', callId: m.callId, ok: true, value });
    } catch (e) {
      post({ t: 'rpc_result', callId: m.callId, ok: false, error: text(e) });
    }
  }

  function callTransport(method: RpcMethod, args: unknown[]): unknown {
    switch (method) {
      case 'dispatch': return d.transport.dispatch(args[0] as BotAction, args[1] as number | undefined);
      case 'say': return d.transport.say(String(args[0]));
      case 'echo': return d.transport.echo(String(args[0]), args[1] as ChatColour | undefined);
      case 'screenshot': return d.transport.screenshot();
      case 'relogin': return d.transport.relogin();
      case 'logout': return d.transport.logout();
    }
  }

  function seed(req: RunRequest, runId: string): void {
    const ref = req.scriptRef;
    const manifest = ref.kind === 'library' ? d.libraryManifests.find(m => m.id === ref.id) : undefined;
    setStatus({
      ...IDLE, resumeAtMs: status.resumeAtMs, state: 'starting', runId,
      scriptId: ref.kind === 'library' ? ref.id : null,
      scriptName: manifest?.name ?? null, startedAt: now()
    });
  }

  /** Resolve once the Worker reports `run_end`, or kill it after the grace period. */
  function waitForEnd(): Promise<void> {
    return new Promise<void>(resolve => {
      let settled = false;
      const done = (): void => { if (settled) return; settled = true; clearTimeout(timer); resolve(); };
      endWaiters.push(done);
      const timer = setTimeout(() => { terminate(); done(); }, graceMs);
    });
  }

  function terminate(): void {
    // Killing the Worker is the one path where no `run_end` is coming: synthesise it, or
    // the api never writes the run to history and the panels keep a ghost run on screen.
    reportKilledRun();
    for (const off of offTransport) off();
    offTransport = [];
    worker?.terminate();
    worker = null;
    lastPublication = null;
    executes.rejectAll('worker terminated');
    compiles.rejectAll('worker terminated');
    while (resumeWaiters.length) resumeWaiters.shift()?.({ ok: false, reason: 'not_paused' });
    while (endWaiters.length) endWaiters.shift()?.();
    setStatus({ ...IDLE, resumeAtMs: status.resumeAtMs });
  }

  const LIVE = new Set(['starting', 'running', 'paused']);

  function reportKilledRun(): void {
    const s = status;
    if (!s.runId || !LIVE.has(s.state)) return;
    const at = now();
    const ref = lastRun?.scriptRef;
    const summary: RunSummary = {
      runId: s.runId, scriptId: s.scriptId ?? 'unknown', scriptName: s.scriptName ?? 'unknown',
      version: (s.scriptId ? d.libraryManifests.find(m => m.id === s.scriptId)?.version : undefined) ?? 0,
      source: ref?.kind === 'user' ? 'user' : 'library',
      startedBy: lastRun?.startedBy ?? 'player', characterId: lastRun?.characterId ?? null,
      characterName: lastRun?.characterName ?? null,
      params: lastRun?.params ?? {}, status: 'stopped', startedAt: s.startedAt ?? at, endedAt: at,
      durationMs: s.startedAt === null ? 0 : at - s.startedAt, xpGained: {}, lastTask: s.task,
      summary: 'the worker was terminated before the run reported an end',
      itemsDelta: {}, tilesTravelled: 0, recoveries: {}
    };
    emit(endSubs, { runId: s.runId, outcome: 'stopped', summary });
  }

  async function run(req: RunRequest): Promise<{ runId: string }> {
    const runId = `r${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    lastRun = req;
    seed(req, runId);
    post({
      t: 'run', runId, scriptRef: req.scriptRef, params: req.params, startedBy: req.startedBy,
      characterId: req.characterId, characterName: req.characterName, behaviour: req.behaviour
    });
    return { runId };
  }

  async function stop(by: Actor): Promise<void> {
    if (!worker || status.state === 'idle' || status.state === 'done' || status.state === 'failed' || status.state === 'stopped') return;
    const ended = waitForEnd();
    post({ t: 'stop', by });
    await ended;
  }

  return {
    run,
    async restart(behaviour) {
      const req = lastRun;
      if (!req) throw new Error('nothing to restart');
      await stop('player');
      // A module the Worker has imported stays in its module map, so edited library code
      // is only picked up by a new Worker; `run` respawns one through `ensureWorker`.
      // (In production the bundle is immutable and this only costs a Worker start.)
      if (req.scriptRef.kind === 'library') terminate();
      return run({ ...req, behaviour });
    },
    execute(code, params = {}) {
      return executes.call(callId => ({ t: 'execute', callId, code, params }));
    },
    compile(code) {
      return compiles.call(callId => ({ t: 'compile', callId, code }));
    },
    pause(reason, by) { post({ t: 'pause', reason, by }); },
    resume(by) {
      return new Promise<ResumeResult>(resolve => {
        resumeWaiters.push(resolve);
        post({ t: 'resume', by });
      });
    },
    stop,
    status: () => ({ ...status }),
    setResumeAt(at) { setStatus({ ...status, resumeAtMs: at }); },
    onTrace(cb) { traceSubs.add(cb); return () => { traceSubs.delete(cb); }; },
    onRunEnd(cb) { endSubs.add(cb); return () => { endSubs.delete(cb); }; },
    onStatus(cb) { statusSubs.add(cb); return () => { statusSubs.delete(cb); }; },
    terminate
  };
}
