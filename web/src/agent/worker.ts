// The script Worker. Everything a script can touch lives in here (spec section 3):
// the world state pushed by the host each tick, the runner, the trace, and a Transport
// whose actions cross `postMessage` as RPC. The main thread never evaluates script code.
import { createRpcClient } from './rpc';
import { createRunContext } from './runContext';
import type { WorkerContext } from './workerContext';
import { createRunHealth, type RunHealth } from './runHealth';
import { compact, endSummary, liveStatus, manifestOf } from './workerReport';
import { resolvePolicy } from '../tasks/behaviour';
import { createTrace, type Trace } from '../tasks/trace';
import { createRunner, type Runner, type RunStatusLite } from '../tasks/runner';
import { compileUserScript, validateParams } from '../tasks/defineScript';
import { evaluateRequirements } from '../tasks/requirements';
import { SCRIPT_CONTEXT_KEYS } from '../tasks/scriptApiKeys';
import { SKILL_NAMES } from '../stats/skills';
import type {
  ActionResult, HookEvent, MainToWorker, RpcMethod, ScriptRef, TransferredBlob, Transport, WorkerToMain, WorldState
} from './types';
import type { Actor, ParamValues, RunOutcome, RunStatus, Script, ScriptContext } from '../tasks/types';

/** `self` typed for a dedicated worker without pulling the whole webworker lib in. */
const scope = self as unknown as {
  postMessage(m: WorkerToMain): void;
  onmessage: ((e: MessageEvent) => void) | null;
};

const EXECUTE_TIMEOUT_MS = 60_000;
const SNAPSHOT_EVERY_MS = 60_000;
const ACTION_TIMEOUT_MS = 10_000;

const post = (m: WorkerToMain): void => { scope.postMessage(m); };

// ---- state fanout -------------------------------------------------------------------
let latest: WorldState | null = null;
const stateSubs = new Set<(s: WorldState) => void>();
const eventSubs = new Set<(e: HookEvent) => void>();
const humanSubs = new Set<() => void>();
const tickSubs = new Set<() => void>();
const onTick = (cb: () => void): (() => void) => { tickSubs.add(cb); return () => { tickSubs.delete(cb); }; };

// ---- transport over RPC -------------------------------------------------------------
const rpc = createRpcClient<WorkerToMain, unknown>(post);
/** One `as` for the whole boundary: the host answers each method with its own return type. */
const callRpc = <T>(method: RpcMethod, args: unknown[], timeoutMs?: number): Promise<T> =>
  rpc.call(callId => ({ t: 'rpc', callId, target: 'transport', method, args }), timeoutMs) as Promise<T>;

/**
 * Two halves of one thing: the client stops working on what the task asked for (the host owns
 * the client, so the drain crosses as a message), and the task's own RPC calls stop waiting for
 * answers that are no longer wanted.
 */
const cancelInFlight = (why: string): void => { post({ t: 'cancel' }); rpc.rejectAll(why); };

const transport: Transport = {
  getState: () => latest,
  onState: cb => { stateSubs.add(cb); return () => { stateSubs.delete(cb); }; },
  onEvent: cb => { eventSubs.add(cb); return () => { eventSubs.delete(cb); }; },
  humanInput: cb => { humanSubs.add(cb); return () => { humanSubs.delete(cb); }; },
  dispatch: (action, timeoutMs = ACTION_TIMEOUT_MS) =>
    callRpc<ActionResult>('dispatch', [action, timeoutMs], timeoutMs + 2_000),
  say: text => callRpc<ActionResult>('say', [text]),
  echo: (text, colour) => { void callRpc('echo', [text, colour]).catch(() => {}); },
  screenshot: async () => {
    const blob = await callRpc<TransferredBlob>('screenshot', [], 20_000);
    return new Blob([blob.buffer], { type: blob.type });
  },
  cancel: () => { cancelInFlight('cancelled'); },
  // Long by RPC standards, and it has to be: the login crosses to the session manager, which
  // may be waiting on a client that is still booting its frame.
  relogin: () => callRpc<{ ok: boolean; reason?: string }>('relogin', [], 60_000),
  // Fire and forget, like `echo`: the run is ending, and nothing in the Worker waits on the
  // client actually going away.
  logout: () => { void callRpc('logout', []).catch(() => {}); }
};

// ---- run state ----------------------------------------------------------------------
interface Current {
  runId: string; script: Script; params: ParamValues; startedBy: Actor;
  characterId: string | null; characterName: string | null;
  source: 'library' | 'user'; startedAt: number; abort: AbortController;
  /**
   * The context this run is executing in, held whole rather than as copied accessors. It owns
   * two things the run end needs - the state subscriptions to release (the SDK's included) and
   * the tile counter `c.travel` has been adding to - and a field per accessor was two wiring
   * lines that could each be miswired on their own without anything else noticing.
   */
  context: WorkerContext;
  /** The health monitor and its subscriptions, released alongside them. */
  health: RunHealth;
}
let current: Current | null = null;
/** True between a `run` message and the moment `current` is set — the await in between. */
let starting = false;
let runner: Runner | null = null;
let trace: Trace | null = null;
let statusLine = '';
let lastTask: string | null = null;
/**
 * What `c.find` last settled on, for as long as the run lasts. It is cleared where the run
 * starts rather than where it ends: `runner` is nulled in `endRun`, so nothing publishes a
 * status between runs, and a clear down there could not be told from no clear at all.
 */
let lastTarget: RunStatus['target'] = null;
let snapshotTimer: ReturnType<typeof setInterval> | null = null;
/** The signal the runner has installed for the task in flight, or null between tasks. */
let taskSignal: AbortSignal | null = null;

const isRunning = (): boolean => runner?.status().state === 'running';

function postStatus(s: RunStatusLite): void {
  if (s.task) lastTask = s.task;
  post({ t: 'status', status: liveStatus(s, { statusLine, target: lastTarget, run: current, trace, now: Date.now() }) });
}

// ---- message loop -------------------------------------------------------------------
scope.onmessage = (e: MessageEvent): void => {
  const m = e.data as MainToWorker;
  switch (m.t) {
    case 'state':
      latest = m.state;
      for (const cb of [...stateSubs]) cb(m.state);
      for (const cb of [...tickSubs]) cb();
      return;
    case 'event':
      recordEvent(m.event);
      for (const cb of [...eventSubs]) cb(m.event);
      return;
    case 'human_input':
      trace?.push({ kind: 'human_input' });
      runner?.pause('human-input', 'player');
      for (const cb of [...humanSubs]) cb();
      return;
    case 'rpc_result':
      rpc.settle(m.callId, m.ok, m.value, m.error);
      return;
    case 'run': void startRun(m).catch(e => { console.error('startRun failed', e); }); return;
    case 'execute': void execute(m.callId, m.code, m.params); return;
    case 'compile': compile(m.callId, m.code); return;
    case 'pause': runner?.pause(m.reason, m.by); return;
    case 'resume': {
      const r = runner?.resume(m.by) ?? { ok: false as const, reason: 'not_paused' as const };
      post({ t: 'resume_result', ok: r.ok, reason: r.ok ? undefined : r.reason });
      return;
    }
    case 'stop':
      // `runner.stop` aborts the task controller and drains on its own (SP4b), but only
      // while a task is in flight. Between tasks, and for a `wait.*` a script opened outside
      // one (onStart, onStop), the run-level signal is the only thing holding them, and an
      // outstanding RPC waits on a reply no signal touches. Both are settled here first so a
      // stop lands inside the host's stop grace instead of the wait's own 60 s timeout.
      current?.abort.abort();
      cancelInFlight('run stopped');
      runner?.stop(m.by);
      return;
  }
};

/** Turn hook events into trace deltas; the runner itself never sees xp or item events. */
function recordEvent(e: HookEvent): void {
  if (!trace) return;
  if (e.name === 'xp' && e.payload.delta) {
    trace.push({ kind: 'xp', skill: SKILL_NAMES[e.payload.skill] ?? `Skill ${e.payload.skill}`, delta: e.payload.delta });
  } else if (e.name === 'inventory') {
    for (const i of e.payload.added) trace.push({ kind: 'item', id: i.id, delta: i.count });
    for (const i of e.payload.removed) trace.push({ kind: 'item', id: i.id, delta: -i.count });
  } else if (e.name === 'action') {
    // Every action the client completed while this run held the game, ours or the player's:
    // the `action` trace row is how the panel (and Claude) sees what the game actually did.
    trace.push({ kind: 'action', action: e.payload.action.type, ok: e.payload.result.success, reason: e.payload.result.reason });
  }
}

// ---- script resolution --------------------------------------------------------------
// The library is a bundled module, and a module this Worker has already imported stays
// in its module map for the life of the Worker. Reloading edited script code is
// therefore the host's job: `restart()` terminates the Worker for a library run, so the
// next message spawns one with a fresh module graph.
async function resolveScript(ref: ScriptRef): Promise<{ script: Script; source: 'library' | 'user' } | { error: string; line?: number }> {
  if (ref.kind === 'library') {
    const { libraryById } = await import('../tasks/library/index');
    const script = libraryById(ref.id);
    return script ? { script, source: 'library' } : { error: `unknown library script ${ref.id}` };
  }
  const compiled = compileUserScript(ref.code);
  return compiled.ok ? { script: compiled.script, source: 'user' } : { error: compiled.message, line: compiled.line };
}

// ---- run ----------------------------------------------------------------------------
async function startRun(m: Extract<MainToWorker, { t: 'run' }>): Promise<void> {
  // One run per tab (spec section 8). The api refuses a second `run` with `busy`; this
  // is the backstop for a stray message. `starting` covers the await below, where
  // `current` is not set yet and a second `run` would orphan the first.
  if (current || starting) { failRun(m, 'a run is already active'); return; }
  starting = true;
  let t: Trace | null = null;
  // Hoisted because it subscribes the moment it is built, while `current` - which is what
  // `endRun` disposes - is not assigned until several statements later. Anything that throws in
  // between would otherwise leave a live monitor on the Worker's fan-outs for good.
  let health: RunHealth | null = null;
  try {
    const resolved = await resolveScript(m.scriptRef);
    if ('error' in resolved) { failRun(m, resolved.error); return; }
    const parsed = validateParams(resolved.script.params, m.params);
    if (!parsed.ok) { failRun(m, parsed.errors.join('; ')); return; }
    // The api checks the declarative requirements it can see, but `custom` ones hold a
    // predicate that cannot cross `postMessage`, and a user script's requirements only exist
    // once its code is compiled — here. With no snapshot yet (pre-login) there is nothing to
    // check against, and refusing every run would be worse than letting the tasks find out.
    if (latest) {
      const missing = evaluateRequirements(resolved.script.requires, latest);
      if (!missing.ok) { failRun(m, `${resolved.script.name} needs: ${missing.missing.join('; ')}`); return; }
    }

    t = createTrace();
    trace = t;
    statusLine = '';
    lastTask = null;
    lastTarget = null;
    t.onEvent(e => {
      post({ t: 'trace', event: e });
      if (e.kind === 'status') statusLine = e.text;
      if (e.kind === 'target') lastTarget = { via: e.via, kind: e.kind_, name: e.name, distance: e.distance };
      // `postStatus` otherwise fires only when the runner's own state moves, so the four things
      // the banner reads from the trace would sit frozen on a run working one task. `xp` is in
      // the set because `xpPerHour` is computed at post time and is otherwise a lap stale; its
      // rate limit is the trace's own coalescing of same-skill gains inside ten seconds.
      const live = e.kind === 'status' || e.kind === 'target' || e.kind === 'health' || e.kind === 'recovery' || e.kind === 'xp';
      if (live && runner) postStatus(runner.status());
    });

    const abort = new AbortController();
    // The player's settings crossed on this message and are read exactly here, once. A run in
    // flight keeps the answers it started with; changing a setting governs the next run.
    const policy = resolvePolicy(resolved.script.health, m.behaviour);
    // Built before the context, which carries its `c.health`, and read back through getters
    // because the runner it escalates to is built after both.
    health = createRunHealth({
      script: resolved.script, policy, trace: t, state: () => latest, onTick,
      onEvent: cb => { eventSubs.add(cb); return () => { eventSubs.delete(cb); }; },
      snapshot: () => compact(latest), ctx: () => context.ctx, runner: () => runner, now: Date.now,
      // The recovery's way back in. It is wired from the transport rather than from the context
      // on purpose: `ScriptContext` has no `relogin` and must not gain one.
      relogin: () => transport.relogin(),
      logout: () => { transport.logout(); }
    });
    const context = createRunContext({
      transport, trace: t, params: parsed.values, onTick,
      signal: () => taskSignal ?? abort.signal, state: () => latest, health: health.health
    });
    // A script that says where home is overrides the anchor's own lazy seeding. The tile form,
    // because the positional arm now warns and this call is the runtime's, not the script's.
    const home = resolved.script.anchor;
    if (home) context.ctx.anchor(home);
    current = {
      runId: m.runId, script: resolved.script, params: parsed.values, startedBy: m.startedBy,
      characterId: m.characterId, characterName: m.characterName, source: resolved.source,
      startedAt: Date.now(), abort, context, health
    };
    starting = false;                      // `current` guards a second `run` from here on
    t.push({
      kind: 'run_started', runId: m.runId, scriptId: resolved.script.id,
      version: resolved.script.version, params: parsed.values, startedBy: m.startedBy
    });

    const buffer = t;
    runner = createRunner({
      script: resolved.script, ctx: context.ctx, trace: t, state: () => latest, onTick, now: Date.now,
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: h => { clearTimeout(h as ReturnType<typeof setTimeout>); },
      onStateChange: postStatus,
      setSignal: sig => { taskSignal = sig; },
      cancel: () => { cancelInFlight('task aborted'); },
      recovery: health.recovery
    });
    snapshotTimer = setInterval(
      () => { if (isRunning()) buffer.push({ kind: 'snapshot', snapshot: compact(latest) }); },
      SNAPSHOT_EVERY_MS
    );
    postStatus(runner.status());

    let outcome: RunOutcome = 'failed';
    try {
      outcome = await runner.start();
    } catch (e) {
      buffer.push({ kind: 'log', level: 'error', text: `run crashed: ${message(e)}` });
    } finally {
      endRun(buffer, outcome);
    }
  } catch (e) {
    // A rejected dynamic import, or a `defineScript` body that throws, must still end
    // the run: silence here leaves the panels waiting on a run that never reports.
    if (current && t) endRun(t, 'failed');
    else { health?.dispose(); failRun(m, `could not start the run: ${message(e)}`); }
  } finally {
    starting = false;
  }
}

function endRun(t: Trace, outcome: RunOutcome): void {
  const run = current;
  if (!run) return;
  if (snapshotTimer !== null) { clearInterval(snapshotTimer); snapshotTimer = null; }
  run.abort.abort();
  taskSignal = null;
  run.context.dispose();
  // The monitor watches the tick and event fan-outs, which outlive every run: without this it
  // keeps observing, and writes into the trace of a run that has already been summarised.
  run.health.dispose();
  // Built before the `run_done` row is pushed, so the two report the same totals: `run_done`
  // carries no xp or items of its own, so reading the trace either side of it gives the same
  // answer, and one of the two has to be first.
  const summary = endSummary(run, t, outcome, {
    at: Date.now(), lastTask, failReason: runner?.failReason() ?? null
  });
  t.push({
    kind: 'run_done', status: outcome, summary: summary.summary, durationMs: summary.durationMs,
    xpGained: summary.xpGained, itemsDelta: summary.itemsDelta, tasksEntered: t.tasksEntered()
  });
  runner = null;
  trace = null;
  current = null;
  post({ t: 'run_end', runId: summary.runId, outcome, summary });
}

/** A run that never started still owes the host a `run_end`, or the panels hang on "starting". */
function failRun(m: Extract<MainToWorker, { t: 'run' }>, error: string): void {
  const at = Date.now();
  post({ t: 'trace', event: { seq: 1, at, kind: 'log', level: 'error', text: error } });
  post({
    t: 'run_end', runId: m.runId, outcome: 'failed',
    summary: {
      runId: m.runId, scriptId: m.scriptRef.kind === 'library' ? m.scriptRef.id : 'user-script',
      scriptName: 'unknown', version: 0, source: m.scriptRef.kind, startedBy: m.startedBy,
      characterId: m.characterId, characterName: m.characterName, params: m.params,
      status: 'failed', startedAt: at, endedAt: at, durationMs: 0, xpGained: {}, lastTask: null,
      summary: error, itemsDelta: {}, tilesTravelled: 0, recoveries: {}
    }
  });
}

// ---- manual snippets ----------------------------------------------------------------
async function execute(callId: string, code: string, params: ParamValues): Promise<void> {
  if (isRunning() || runner?.status().state === 'starting') {
    post({ t: 'execute_result', callId, ok: false, error: 'run_active', logs: [] });
    return;
  }
  const logs: string[] = [];
  const t = createTrace();
  t.onEvent(e => { if (e.kind === 'log' || e.kind === 'status') logs.push(e.text); });
  const abort = new AbortController();
  // A snippet gets an anchor of its own: nothing outlives it, so it starts where the player is.
  const { ctx, dispose } = createRunContext({
    transport, trace: t, params, signal: () => abort.signal, onTick, state: () => latest
  });
  let expire: (e: Error) => void = () => {};
  const deadline = new Promise<never>((_, reject) => { expire = reject; });
  const timer = setTimeout(() => { abort.abort(); expire(new Error(`snippet timed out after ${EXECUTE_TIMEOUT_MS / 1000}s`)); }, EXECUTE_TIMEOUT_MS);
  try {
    const value = await Promise.race([snippet(code)(ctx), deadline]);
    postExecuteResult(callId, value, logs);
  } catch (e) {
    post({ t: 'execute_result', callId, ok: false, error: message(e), logs });
  } finally {
    clearTimeout(timer);
    // A snippet holds a context of its own; without this each one leaves a live SDK
    // behind, re-normalising the world on every tick for the rest of the session.
    abort.abort();
    dispose();
  }
}

/** The snippet body is an async function over the destructured context, exactly as the panel documents. */
function snippet(code: string): (ctx: ScriptContext) => Promise<unknown> {
  // Generated from the declared surface (P0). The hand-maintained list this replaces was a silent
  // failure mode: a member missing from it was invisible to snippets and nothing complained.
  const names = Object.keys(SCRIPT_CONTEXT_KEYS).join(', ');
  return new Function('ctx', `return (async ({${names}}) => {${code}\n})(ctx)`) as (ctx: ScriptContext) => Promise<unknown>;
}

/** A snippet may return anything, including something structured clone refuses. */
function postExecuteResult(callId: string, value: unknown, logs: string[]): void {
  try {
    post({ t: 'execute_result', callId, ok: true, value, logs });
  } catch {
    post({ t: 'execute_result', callId, ok: true, value: String(value), logs });
  }
}

function compile(callId: string, code: string): void {
  const r = compileUserScript(code);
  if (!r.ok) { post({ t: 'compile_result', callId, ok: false, message: r.message, line: r.line }); return; }
  post({ t: 'compile_result', callId, ok: true, manifest: manifestOf(r.script) });
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

post({ t: 'ready' });
