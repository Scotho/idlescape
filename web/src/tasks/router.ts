// web/src/tasks/router.ts -- `window.idlescape.tasks` over one TasksApi per character.
//
// SP4a built one api around one client. SP7 gives every character its own iframe, so each session
// owns its own transport, Worker host and api (`wireTasks`), and a run keeps driving the character
// it started on even after the player switches tabs. The parent document still publishes a single
// `tasks` object: it forwards to the *active* character's api, except for calls that name a run,
// which go to the api that owns it.
//
// Subscriptions are the other half of the job. The router listens to every attached api and
// re-publishes only what the ACTIVE session says, so the run banner and the Tasks panel subscribe
// once, to one object, and still follow the tab. `notifyActiveChanged()` re-publishes the newly
// active runtime's status the moment the tab changes, because status is edge-driven: without it a
// switch to an idle character would leave the previous character's run on the banner.
import { IDLE_STATUS, TasksError, type TasksApi } from './api';
import { DEFAULT_SETTINGS } from './settings';
import type { RunStatus, TraceEvent } from './types';
import type { Unsub } from '../agent/types';

export interface TasksRouterDeps {
  /** The character whose tab is in front, or null when no session is open. */
  activeId(): string | null;
}

export interface TasksRouter {
  /** The object published at `window.idlescape.tasks`. */
  api: TasksApi;
  attach(characterId: string, api: TasksApi): void;
  detach(characterId: string): void;
  /** The api for the character whose tab is in front, or null. */
  current(): TasksApi | null;
  /** The api that owns a run id, or null when no attached session started it. */
  owner(runId: string): TasksApi | null;
  /**
   * Told when the tab in front changes, so a panel can re-read everything it is showing: the
   * scripts, the history and the run all belong to the character, not to the panel.
   */
  onActiveChanged(cb: () => void): () => void;
  /** Call after the active tab changes so subscribers see the new session's status. */
  notifyActiveChanged(): void;
}

export function createTasksRouter(deps: TasksRouterDeps): TasksRouter {
  const apis = new Map<string, TasksApi>();
  const runOwners = new Map<string, string>();
  const subscriptions = new Map<string, Unsub[]>();
  const statusSubs = new Set<(s: RunStatus) => void>();
  const eventSubs = new Set<(e: TraceEvent) => void>();
  /** `(v: void)` rather than `()` so these fan out through the same guarded `emit`. */
  const activeSubs = new Set<(v: void) => void>();
  /**
   * The active id the subscribers were last told about; `undefined` means "not yet told". The
   * stage calls `notifyActiveChanged` on every session-manager emit — a background login, logout,
   * disconnect or boot included — and an open Tasks panel must not close its trace and re-read the
   * catalogue because another character logged in behind it.
   */
  let lastActiveId: string | null | undefined = undefined;

  /** Mirrors the host's fan-out: one subscriber that throws costs neither the others nor the caller. */
  function emit<T>(subs: Set<(v: T) => void>, value: T): void {
    for (const cb of [...subs]) {
      try { cb(value); } catch (e) { console.error('[tasks] a router subscriber threw', e); }
    }
  }

  const current = (): TasksApi | null => {
    const id = deps.activeId();
    return id ? apis.get(id) ?? null : null;
  };

  const need = (): TasksApi => {
    const api = current();
    if (!api) throw new TasksError('not_signed_in', 'Open a character tab before running a task.');
    return api;
  };

  const owner = (runId: string): TasksApi | null => {
    const id = runOwners.get(runId);
    return id ? apis.get(id) ?? null : null;
  };

  function unsubscribe(characterId: string): void {
    for (const off of subscriptions.get(characterId) ?? []) off();
    subscriptions.delete(characterId);
  }

  /**
   * A write every attached session should see. Settings are per account, not per character
   * (the panel writes them from one tab and every character's runtime reads them), so a write
   * that reached only `current()` left the other tabs on the old value until their next reload.
   * One session that throws must not cost the others the write.
   */
  function fanOut(write: (api: TasksApi) => void): void {
    for (const api of [...apis.values()]) {
      try { write(api); } catch (e) { console.error('[tasks] a session refused a fan-out write', e); }
    }
  }

  // Every method forwards. `run` records which character owns the run it starts; run-addressed
  // calls go to that owner, everything else to the active session. The three totals — `status`,
  // `getState` and `settings` — answer without a session rather than throwing: they are the
  // synchronous accessors the run banner and the strip paint from, and SP4a already gives each of
  // them a "nothing is running" value.
  const api: TasksApi = {
    async list(...args: Parameters<TasksApi['list']>) { return need().list(...args); },
    async get(...args: Parameters<TasksApi['get']>) { return need().get(...args); },
    async save(...args: Parameters<TasksApi['save']>) { return need().save(...args); },
    async remove(...args: Parameters<TasksApi['remove']>) { return need().remove(...args); },
    async install(...args: Parameters<TasksApi['install']>) { return need().install(...args); },
    async run(...args: Parameters<TasksApi['run']>) {
      // Read the owner before the await: the player may switch tabs while the run is starting.
      const ownerId = deps.activeId();
      const result = await need().run(...args);
      if (ownerId) runOwners.set(result.runId, ownerId);
      return result;
    },
    async execute(...args: Parameters<TasksApi['execute']>) { return need().execute(...args); },
    async dispatch(...args: Parameters<TasksApi['dispatch']>) { return need().dispatch(...args); },
    async pause(...args: Parameters<TasksApi['pause']>) { return need().pause(...args); },
    async resume(...args: Parameters<TasksApi['resume']>) { return need().resume(...args); },
    // SP4a's `stop` takes the actor who asked, not a run id, so the active session is the right
    // target: the banner and the Tasks panel only ever show the run in front of the player. A
    // caller that names a run it started (Playwright, the SP4c tab socket) is honoured too — no
    // actor is ever a run id, so the lookup can only match a real run.
    async stop(...args: Parameters<TasksApi['stop']>) {
      const [first] = args;
      return (owner(first) ?? need()).stop(...args);
    },
    async restart(...args: Parameters<TasksApi['restart']>) { return need().restart(...args); },
    // Per account, not per character: a script switched off on one tab is off on all of them.
    // `fanOut` above cannot carry this one - it returns a promise and that helper's `void`
    // signature would swallow it, so the async shape is repeated rather than the function
    // reused. One session that refuses must not cost the others the write, and must not reject
    // the caller: the panel's own row has already been re-read by the time this settles.
    async setEnabled(...args: Parameters<TasksApi['setEnabled']>) {
      // The `async` wrapper turns a session that throws synchronously into one that rejects,
      // so a single bad api cannot stop the others being told before the awaiting even starts.
      const writes = [...apis.values()].map(async api => api.setEnabled(...args));
      await Promise.all(writes.map(w => w.catch(e => { console.error('[tasks] a session refused a toggle', e); })));
    },
    async getRun(...args: Parameters<TasksApi['getRun']>) {
      const [first] = args;
      return (first ? owner(first) ?? need() : need()).getRun(...args);
    },
    async listRuns(...args: Parameters<TasksApi['listRuns']>) { return need().listRuns(...args); },
    // Run-addressed, like `getRun`: a player exporting a row from the history list is asking for
    // that run, which may belong to a tab that is no longer in front.
    async exportRun(...args: Parameters<TasksApi['exportRun']>) {
      const [first] = args;
      return (owner(first) ?? need()).exportRun(...args);
    },
    async screenshot(...args: Parameters<TasksApi['screenshot']>) { return need().screenshot(...args); },
    status: () => current()?.status() ?? IDLE_STATUS,
    getState: () => current()?.getState() ?? null,
    onEvent(cb) { eventSubs.add(cb); return () => { eventSubs.delete(cb); }; },
    onStatus(cb) { statusSubs.add(cb); return () => { statusSubs.delete(cb); }; },
    settings: {
      get: () => current()?.settings.get() ?? { ...DEFAULT_SETTINGS },
      set: patch => { fanOut(api => api.settings.set(patch)); }
    },
    /** The router owns no runtime: each session disposes its own api when its tab closes. */
    dispose: () => {}
  };

  return {
    api,
    attach(characterId, sessionApi) {
      // Re-attaching the same character (a frame that booted twice) must not double-subscribe.
      unsubscribe(characterId);
      apis.set(characterId, sessionApi);
      // A runtime arriving for the tab in front is a change even though the id has not moved:
      // the next notify re-publishes for it rather than reporting the previous api's status.
      if (deps.activeId() === characterId) lastActiveId = undefined;
      subscriptions.set(characterId, [
        sessionApi.onStatus(s => { if (deps.activeId() === characterId) emit(statusSubs, s); }),
        sessionApi.onEvent(e => { if (deps.activeId() === characterId) emit(eventSubs, e); })
      ]);
    },
    detach(characterId) {
      unsubscribe(characterId);
      apis.delete(characterId);
      for (const [runId, id] of [...runOwners]) if (id === characterId) runOwners.delete(runId);
    },
    current,
    owner,
    onActiveChanged(cb) { activeSubs.add(cb); return () => { activeSubs.delete(cb); }; },
    notifyActiveChanged() {
      const id = deps.activeId();
      if (id === lastActiveId) return;
      lastActiveId = id;
      // Status first: the banner is repainted before the panels start re-reading the catalogue.
      emit(statusSubs, current()?.status() ?? IDLE_STATUS);
      emit(activeSubs, undefined);
    }
  };
}
