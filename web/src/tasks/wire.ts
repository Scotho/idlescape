// Composition of the script runtime for a live client session. `main.ts` stays the shell's
// composition root and calls this once, the first time a session brings `ClientHooks` to life —
// everything below needs a real client, so none of it can be built at page load.
import { createLocalTransport } from '../agent/localTransport';
import { createWorkerHost, spawnScriptWorker } from '../agent/workerHost';
import { createTasksApi, type TasksApi } from './api';
import { createRunHistory } from './history';
import { createHumanInputWatcher, type HumanInputWatcher } from './humanInput';
import { libraryById, libraryManifests } from './library';
import { createFirestoreToggleBackend, createToggleStore } from './toggles';
import { createFirestoreTaskBackend, createUserTaskStore } from './userStore';
import { db } from '../firebase';
import type { ClientHooks } from '../clientTypes';

export interface WireTasksDeps {
  hooks: ClientHooks;
  /** The game canvas: an accessor because it moves into an iframe in SP7. */
  canvas(): HTMLCanvasElement | null;
  uid(): string | null;
  characterId(): string | null;
  /** This session's character name, as the stage reads it off the character summary. */
  characterName(): string | null;
  /**
   * Logs this character back in, for the `logout` recovery. The stage passes the session
   * manager's `login`, which is the only caller that knows whether a login is already in
   * flight or the session is already online.
   */
  relogin(): Promise<{ ok: boolean; reason?: string }>;
}

/** Shell settings share the `cs.` namespace with the rest of the frame's localStorage. */
const storage = {
  get: (k: string): string | null => { try { return localStorage.getItem(`cs.${k}`); } catch { return null; } },
  set: (k: string, v: string): void => { try { localStorage.setItem(`cs.${k}`, v); } catch { /* blocked */ } }
};

export function wireTasks(d: WireTasksDeps): TasksApi {
  const transport = createLocalTransport(d.hooks, d.canvas, { relogin: d.relogin });
  const host = createWorkerHost({ transport, spawn: spawnScriptWorker, libraryManifests: libraryManifests() });
  // The watcher needs `api.settings` and the api needs to cancel the watcher's timer, so the
  // knot is tied with a closure over a `let` rather than by merging the two.
  let watcher: HumanInputWatcher | null = null;
  // Per account, so the uid is bound in here and the api never sees one. The load is fired and
  // not awaited: `isEnabled` answers "enabled" for everything until it lands, which is the same
  // answer it gives a script nobody has ever touched, and a run started in that window is one
  // the player asked for from a panel whose rows came from this same store. A switch flipped
  // while that read is in flight is not lost: the store keeps it and refuses to let the remote
  // snapshot overwrite it.
  //
  // One store per session, deliberately, even though the value is per account: the store binds a
  // uid at load time and a session outlives an account switch only by being torn down, so hoisting
  // one above the sessions would trade this cost for a staleness bug. The cost is that
  // `router.setEnabled` fans one click out to every attached session, so N character tabs issue N
  // identical `setDoc` calls to `users/{uid}/scriptToggles/{id}`. They are idempotent and carry the
  // same value, and N is the number of tabs the player has open.
  const toggles = createToggleStore(createFirestoreToggleBackend(db));
  void toggles.load(d.uid());
  const api = createTasksApi({
    host,
    transport,
    history: createRunHistory(),
    store: createUserTaskStore({ backend: createFirestoreTaskBackend(db), uid: d.uid }),
    library: { manifests: libraryManifests, byId: libraryById },
    characterId: d.characterId,
    characterName: d.characterName,
    storage,
    toggles: {
      isEnabled: id => toggles.isEnabled(id),
      setEnabled: async (id, enabled) => { toggles.setEnabled(d.uid(), id, enabled); }
    },
    cancelHumanInput: () => { watcher?.cancel(); },
    // `api.dispose()` kills the Worker; everything else the runtime holds was built here.
    // A tab closing must not lose a toggle still sitting inside its 800 ms debounce.
    onDispose: () => { void toggles.flush(); watcher?.dispose(); transport.dispose(); }
  });

  // Spec section 8: a real click or key on the canvas hands the game back to the player, and the
  // run picks itself up again once they stop. `setResumeAt` puts the deadline on the status the
  // banner and the run card draw their countdown from.
  watcher = createHumanInputWatcher({
    transport,
    isRunning: () => host.status().state === 'running',
    isPausedByHuman: () => { const s = host.status(); return s.state === 'paused' && s.reason === 'human-input'; },
    pause: () => { host.pause('human-input', 'player'); },
    resume: () => { void host.resume('player'); },
    resumeAfterMs: () => api.settings.get().resumeAfterHumanInputMs,
    setResumeAt: at => { host.setResumeAt(at); },
    now: Date.now,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: h => { clearTimeout(h as number); }
  });

  // Deliberately no `logout` handler. Stopping the run on that hook pre-empted the ladder's own
  // `logout` recovery, and it fired exactly when the recovery was wanted: a server-initiated
  // logout (a kick, a world shutdown) reaches this hook, and so does a dropped connection whose
  // auto-reconnect failed, after `disconnect` has already queued the recovery. The three things
  // the handler was covering are each covered better elsewhere - the shell closing a session
  // calls `api.dispose()`, which kills the Worker whatever the hooks say; a player clicking
  // logout in the game is a real canvas click, so the human-input watcher has already paused the
  // run; and everything else is what `maxRelogins` and spec 3.4's `logout` row exist for.
  // `window.idlescape.tasks` is the shell's to publish (main.ts): this function composes a
  // runtime, and SP7 wires one per character iframe — only one of them can own the global.
  return api;
}
