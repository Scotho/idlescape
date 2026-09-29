// `window.idlescape.tasks` — the one calling surface for the script runtime (spec section 10).
// The Tasks and Marketplace panels, the run banner, Playwright and (in SP4c) the tab socket all
// drive scripts through here; nothing above this file talks to the Worker host directly.
//
// It owns three things the host deliberately does not: the catalogue (library manifests merged
// with the signed-in user's Firestore docs), the current run's trace buffer and its journey into
// IndexedDB history, and the small pile of settings the Tasks panel exposes.
import { behaviourOf, createSettingsStore } from './settings';
import { createCatalogue, type TaskDetail } from './catalogue';
import { createRunReads } from './runReads';
import { createRunRecorder } from './runRecorder';
import { evaluateRequirements } from './requirements';
import { validateParams } from './params';
import type { RunHistory } from './history';
import type { SaveTaskInput, UserTaskDoc, UserTaskStore } from './userStore';
import type { TasksSettings } from './settings';
import type {
  ParamSchema, ParamValues, Requirement, RunStatus, RunSummary, ScriptManifest, TaskSummary, TraceEvent
} from './types';
import type { ExecuteResult, WorkerHost } from '../agent/workerHost';
import type { ActionResult, BotAction, Transport, Unsub, WorldState } from '../agent/types';

/** Re-exported so `TasksApi`'s callers need only this module. */
export type { TaskDetail };

export type TasksErrorCode =
  | 'busy' | 'run_active' | 'not_found' | 'requirements' | 'params' | 'disabled'
  | 'compile_error' | 'paused_by_player' | 'not_paused' | 'not_signed_in' | 'disposed';

/** Every rejection out of this api, so callers can branch on `code` instead of on prose. */
export class TasksError extends Error {
  readonly code: TasksErrorCode;
  readonly detail?: unknown;
  constructor(code: TasksErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = 'TasksError';
    this.code = code;
    this.detail = detail;
  }
}

export type TaskActor = 'player' | 'claude';

export interface TasksApi {
  list(): Promise<TaskSummary[]>;
  get(id: string): Promise<TaskDetail>;
  save(task: SaveTaskInput): Promise<{ id: string; version: number }>;
  remove(id: string): Promise<void>;
  install(libraryId: string): Promise<{ id: string }>;
  run(id: string, params?: Record<string, unknown>, opts?: { startedBy?: 'player' | 'claude' | 'test' }): Promise<{ runId: string }>;
  execute(code: string, params?: Record<string, unknown>): Promise<ExecuteResult>;
  dispatch(action: BotAction): Promise<ActionResult>;
  pause(by: TaskActor): Promise<void>;
  resume(by: TaskActor): Promise<void>;
  stop(by: TaskActor): Promise<void>;
  restart(): Promise<{ runId: string }>;
  /**
   * Turns a script on or off for the whole account. It governs *starting*: a run already in
   * flight is left alone, exactly as the behaviour settings are read once at run start.
   */
  setEnabled(id: string, enabled: boolean): Promise<void>;
  status(): RunStatus;
  getRun(runId?: string, sinceSeq?: number): Promise<{ summary: RunSummary; events: TraceEvent[] }>;
  listRuns(limit?: number): Promise<RunSummary[]>;
  /** One run as a JSON file: its summary and its trace, exactly as `getRun` reports them. */
  exportRun(runId: string): Promise<Blob>;
  onEvent(cb: (e: TraceEvent) => void): Unsub;
  onStatus(cb: (s: RunStatus) => void): Unsub;
  /** Null before the first world state arrives (pre-login), which is not an error. */
  getState(): WorldState | null;
  screenshot(): Promise<Blob>;
  settings: { get(): TasksSettings; set(patch: Partial<TasksSettings>): void };
  /**
   * Tear this runtime down: kill the Worker and release everything `wireTasks` built around it
   * (the transport's canvas and hook listeners, the human-input watcher, the logout hook).
   * SP7 gives every character iframe a runtime of its own, so a session that ends has to leave
   * nothing behind. Safe to call more than once.
   */
  dispose(): void;
}

export interface TasksApiDeps {
  host: WorkerHost;
  history: RunHistory;
  store: UserTaskStore;
  transport: Transport;
  /**
   * Manifests only: the api never needs a script's `tasks`, so `libraryById` (which returns
   * the full `Script`) narrows to this without the api depending on the executable shape.
   */
  library: { manifests(): ScriptManifest[]; byId(id: string): ScriptManifest | undefined };
  characterId(): string | null;
  /** The character's game name, for the history row; null before a character is chosen. */
  characterName(): string | null;
  storage: { get(k: string): string | null; set(k: string, v: string): void };
  /**
   * The per-account script toggles (`tasks/toggles.ts`), with the uid already bound in by
   * `wire.ts`. The api is the one enforcement point (spec decision 8), so this is read on
   * every `run` and reported on every catalogue row.
   */
  toggles: { isEnabled(id: string): boolean; setEnabled(id: string, enabled: boolean): Promise<void> };
  /**
   * Cancels the human-input auto-resume countdown. Every deliberate control action ends the
   * "you took over, I'll wait" state, and the host keeps `resumeAtMs` across a stop, so without
   * this `status()` would keep advertising a deadline nothing is going to honour. Wired in
   * `wire.ts`; the watcher is built after the api, so it arrives as a closure.
   */
  cancelHumanInput?(): void;
  /**
   * Teardown the composition root owns: `dispose()` calls this after terminating the Worker.
   * Wired in `wire.ts` (transport, watcher, logout hook), which builds those around the api.
   */
  onDispose?(): void;
  now?(): number;
}

/** The status the banner and the strip dot show when nothing is running (Task 13). */
export const IDLE_STATUS: RunStatus = {
  state: 'idle', reason: null, runId: null, scriptId: null, scriptName: null, task: null,
  statusLine: '', attempts: 0, startedAt: null, attached: false, resumeAtMs: null,
  target: null, health: null, xpPerHour: {}
};

/** A run is "live" in these states; starting another one is a `busy` error. */
const LIVE = new Set(['starting', 'running', 'paused']);
/** `execute`/`dispatch` may share the game with a paused run, but never with a moving one. */
const EXCLUSIVE = new Set(['starting', 'running']);
const notSignedIn = (e: unknown): boolean => e instanceof Error && /not signed in/i.test(e.message);

export function createTasksApi(d: TasksApiDeps): TasksApi {
  const now = d.now ?? Date.now;
  const statusSubs = new Set<(s: RunStatus) => void>();
  let lastPublished = '';
  let disposed = false;
  const settings = createSettingsStore(d.storage);
  const getSettings = settings.get;

  // ---- status ---------------------------------------------------------------------
  const status = (): RunStatus => ({ ...d.host.status(), attached: false });

  /**
   * Fan out only on a real change: `onTrace` fires far more often than the status moves. Guarded
   * like the host's `emit` — this runs inside the Worker's message handler and the client's own
   * tick, so one subscriber that throws must cost neither the others nor the caller.
   */
  function publish(): void {
    const s = status();
    const key = JSON.stringify(s);
    if (key === lastPublished) return;
    lastPublished = key;
    for (const cb of [...statusSubs]) { try { cb(s); } catch (e) { console.error('[tasks] a status subscriber threw', e); } }
  }

  // Status transitions the api did not ask for — the human-input timer auto-resuming, a `stuck`
  // pause, a run ending by itself — arrive here and nowhere else. Publishing only from the trace
  // handler left the run banner showing "You took over" after an auto-resume (and, because the
  // banner gates Escape on its cached status, made the panic key stop working). `publish` still
  // de-dupes, so the extra fan-out costs nothing when a control action published already.
  d.host.onStatus(() => { publish(); });

  // ---- trace buffer and history ---------------------------------------------------
  // The buffer, the flush cursor and the run's landing in IndexedDB live in `runRecorder.ts`;
  // what stays here is the one decision the recorder cannot make, which is whether a log line
  // should also be echoed into game chat.
  const recorder = createRunRecorder({
    host: d.host,
    history: d.history,
    store: d.store,
    now,
    onEvent: e => { if (getSettings().echoLogsToChat && e.kind === 'log') d.transport.echo(e.text, 'orange'); },
    onChanged: publish
  });

  // ---- catalogue ------------------------------------------------------------------
  const catalogue = createCatalogue({
    library: d.library, store: d.store, transport: d.transport, enabled: id => d.toggles.isEnabled(id)
  });

  async function resolve(id: string): Promise<{ manifest?: ScriptManifest; doc?: UserTaskDoc }> {
    const found = await catalogue.resolve(id);
    if (!found) throw new TasksError('not_found', `no task with id "${id}"`);
    return found;
  }

  // ---- writes ---------------------------------------------------------------------
  async function save(task: SaveTaskInput): Promise<{ id: string; version: number }> {
    requireLive(); // `host.compile` posts, so this is a Worker entry point (and `install` comes through here).
    // Compile before Firestore sees it: a script that cannot load is not worth storing, and the
    // compiled manifest's id gives the doc a stable, human-readable key (`run('e2e-walk')`).
    const compiled = task.code ? await d.host.compile(task.code) : null;
    if (compiled && !compiled.ok) {
      throw new TasksError('compile_error', compiled.message, { message: compiled.message, line: compiled.line });
    }
    // The doc id is the store's to mint when the caller omits one (its documented "omit to
    // create" contract). Deriving it from the compiled manifest id would make two scripts that
    // happen to declare the same `defineScript` id overwrite each other, turn Fork into a
    // clobber, and let a user script shadow a library id it could then never be run under.
    try {
      return await d.store.save(task);
    } catch (e) {
      if (notSignedIn(e)) throw new TasksError('not_signed_in', 'sign in to save a script');
      throw e;
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await d.store.remove(id);
    } catch (e) {
      if (notSignedIn(e)) throw new TasksError('not_signed_in', 'sign in to delete a script');
      throw e;
    }
  }

  async function install(libraryId: string): Promise<{ id: string }> {
    const manifest = catalogue.find(libraryId);
    if (!manifest) throw new TasksError('not_found', `no library script with id "${libraryId}"`);
    // The doc id is the library id, so installing twice bumps a version rather than
    // littering the tab with copies, and `run(libraryId)` keeps meaning the bundled script.
    const { id } = await save({
      id: libraryId, name: manifest.name, description: manifest.description, tags: manifest.tags ?? [],
      params: {}, code: '', source: 'library', libraryId, pinnedVersion: manifest.version
    });
    return { id };
  }

  // ---- run control ----------------------------------------------------------------
  function seed(runId: string, manifest: ScriptManifest | undefined, doc: UserTaskDoc | undefined, params: ParamValues, startedBy: 'player' | 'claude' | 'test'): RunSummary {
    const at = now();
    return {
      runId, scriptId: manifest?.id ?? doc?.id ?? 'unknown', scriptName: manifest?.name ?? doc?.name ?? 'unknown',
      version: manifest?.version ?? doc?.version ?? 0, source: manifest ? 'library' : 'user',
      startedBy, characterId: d.characterId(), characterName: d.characterName(), params,
      status: 'starting', startedAt: at, endedAt: null, durationMs: 0, xpGained: {}, lastTask: null,
      summary: '', itemsDelta: {}, tilesTravelled: 0, recoveries: {}
    };
  }

  /**
   * A user doc carries no manifest until its code is compiled, so this is the only place the
   * requirements it declares (the ones a fork kept from the library script it came from
   * included) can be seen before the run starts. Code that no longer compiles is left alone:
   * the Worker owns that error message and writes the failed run to history, which refusing
   * here would skip. `custom` requirements never survive the Worker boundary — those are
   * evaluated inside it, against the same snapshot.
   */
  async function declaredRequires(manifest: ScriptManifest | undefined, doc: UserTaskDoc | undefined): Promise<Requirement[] | undefined> {
    if (manifest) return manifest.requires;
    if (!doc?.code) return undefined;
    const compiled = await d.host.compile(doc.code);
    return compiled.ok ? compiled.manifest.requires : undefined;
  }

  /**
   * Spec decision 8: one enforcement point. The Run button, the run card's "Run again", the
   * Marketplace's Run now, `window.idlescape.tasks.run`/`restart` from Playwright and the SP4c
   * relay all arrive here, and are refused identically. Both restart paths go through it too,
   * because a restart is a run starting (plan ruling R26).
   */
  function refuseIfDisabled(id: string): void {
    if (!d.toggles.isEnabled(id)) {
      throw new TasksError('disabled', 'that script is turned off; turn it back on in the Tasks tab');
    }
  }

  async function run(id: string, params: Record<string, unknown> = {}, opts: { startedBy?: 'player' | 'claude' | 'test' } = {}): Promise<{ runId: string }> {
    requireLive();
    if (LIVE.has(status().state)) throw new TasksError('busy', 'a run is already active; stop it first');
    refuseIfDisabled(id);
    const { manifest, doc } = await resolve(id);
    const missing = evaluateRequirements(await declaredRequires(manifest, doc), d.transport.getState());
    if (!missing.ok) {
      throw new TasksError('requirements', `${manifest?.name ?? doc?.name ?? id} needs: ${missing.missing.join('; ')}`, missing.missing);
    }
    const schema: ParamSchema = manifest?.params ?? {};
    const values = validateParams(schema, params, (message, detail) => new TasksError('params', message, detail));
    const scriptRef = manifest
      ? { kind: 'library' as const, id: manifest.id }
      : { kind: 'user' as const, code: (doc as UserTaskDoc).code };
    const startedBy = opts.startedBy ?? 'player';
    // The behaviour settings are snapshotted here, not read from inside the run: this is the one
    // moment the ruling names, and everything downstream of it works from the copy that crossed.
    const { runId } = await d.host.run({
      scriptRef, params: values, startedBy, characterId: d.characterId(),
      characterName: d.characterName(), behaviour: behaviourOf(getSettings())
    });
    recorder.begin(seed(runId, manifest, doc, values, startedBy), doc?.id ?? null);
    return { runId };
  }

  async function restart(): Promise<{ runId: string }> {
    requireLive();
    const cur = recorder.current();
    if (!cur) throw new TasksError('not_found', 'nothing to restart');
    // Before either branch, and before anything is stopped: the library branch below reaches the
    // host directly, so checking inside `run` alone would refuse a user script and start a
    // library one. `seed` keys `scriptId` off the same id `run` and the catalogue use.
    refuseIfDisabled(cur.summary.scriptId);
    d.cancelHumanInput?.();
    // Spec section 8: a restart is a fresh read for user scripts, so an edit made in the Tasks
    // panel between the two runs actually lands. The host can only replay the frozen code string
    // it was handed, so go back through the store; library refs are immutable in the bundle and
    // the host's terminate-and-replay (which drops the Worker's module map) is the right path.
    if (cur.summary.source === 'user' && cur.docId) {
      if (LIVE.has(status().state)) await d.host.stop('player');
      const by = cur.summary.startedBy;
      return run(cur.docId, cur.summary.params, { startedBy: by === 'claude' || by === 'test' ? by : 'player' });
    }
    // A restart is a run starting, so it reads the settings again rather than replaying the ones
    // the host still holds. (The user-script path above goes back through `run`, which does too.)
    const r = await d.host.restart(behaviourOf(getSettings()));
    recorder.begin({
      ...cur.summary, runId: r.runId, status: 'starting', startedAt: now(), endedAt: null,
      durationMs: 0, xpGained: {}, lastTask: null, summary: '',
      itemsDelta: {}, tilesTravelled: 0, recoveries: {}
    }, cur.docId);
    return r;
  }

  function requireIdle(): void {
    if (EXCLUSIVE.has(status().state)) throw new TasksError('run_active', 'pause or stop the run first');
  }

  /**
   * Every call that posts into the Worker respawns one through `ensureWorker`, so an api left
   * behind by a closed tab (a stale panel closure) refuses rather than raising a runtime for a
   * session that is gone. `stop` is exempt: the host answers it with no Worker, so it stays a no-op.
   */
  const requireLive = (): void => { if (disposed) throw new TasksError('disposed', 'this script runtime was closed with its character tab'); };

  // Reading a run back, and handing one to the player as a file: `runReads.ts`.
  const reads = createRunReads({
    history: d.history, recorder, notFound: m => new TasksError('not_found', m)
  });

  return {
    list: () => catalogue.list(),
    async get(id) { return catalogue.detail(await resolve(id)); },
    save,
    remove,
    install,
    run,
    // `async` so a refusal rejects rather than throwing at the call site: every caller of this
    // api awaits it, and Playwright's `page.evaluate` only sees rejections.
    async execute(code, params = {}) {
      requireLive();
      requireIdle();
      return d.host.execute(code, validateParams({}, params, (m, detail) => new TasksError('params', m, detail)));
    },
    async dispatch(action) {
      requireIdle();
      return d.transport.dispatch(action);
    },
    // Every deliberate control action ends the human-input truce, so the countdown goes with it.
    async pause(by) { requireLive(); d.cancelHumanInput?.(); d.host.pause(by, by); publish(); },
    async resume(by) {
      requireLive();
      d.cancelHumanInput?.();
      const r = await d.host.resume(by);
      publish();
      if (!r.ok) {
        throw new TasksError(r.reason, r.reason === 'paused_by_player'
          ? 'the player paused this run; only they can resume it'
          : 'nothing is paused');
      }
    },
    async stop(by) { d.cancelHumanInput?.(); await d.host.stop(by); publish(); },
    restart,
    // The toggle governs starting, so nothing here touches the run in flight: a player who
    // switches a script off mid-run has said "not again", not "stop now". The id is resolved
    // first, exactly as `run` resolves it: `window.idlescape.tasks.setEnabled` is on the page for
    // Playwright and the SP4c relay, and the Firestore rule allows any `{scriptId}` under the
    // account, so without this a caller could fill the subcollection with documents no
    // catalogue row will ever show.
    async setEnabled(id, enabled) { requireLive(); await resolve(id); await d.toggles.setEnabled(id, enabled); publish(); },
    status,
    getRun: reads.getRun,
    listRuns: reads.listRuns,
    exportRun: reads.exportRun,
    onEvent(cb) { return d.host.onTrace(cb); },
    onStatus(cb) { statusSubs.add(cb); return () => { statusSubs.delete(cb); }; },
    getState: () => d.transport.getState(),
    screenshot: () => d.transport.screenshot(),
    settings,
    dispose() {
      if (disposed) return;
      disposed = true;
      d.host.terminate();
      statusSubs.clear();
      d.onDispose?.();
    }
  };
}
