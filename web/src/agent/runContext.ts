// Assembling the `ScriptContext` a run or a snippet gets. The two callers differ only in whose
// signal the context reads and whose params it carries; the map knowledge behind it is shared by
// the whole Worker and the anchor is the caller's own. That assembly lives here so `worker.ts`
// stays about the message loop. What belongs here is Worker-lifetime state a context is built
// over - the atlas, the collision grid, the anchor. A context member built from `state`, `sdk`
// or `bot` belongs in `workerContext.ts` instead, where those locals are: `c.find` (Task 6) is
// composed there over `travel` for exactly that reason.
import { createWorkerContext, type WorkerContext } from './workerContext';
import { createAtlasLoader } from '../tasks/atlas';
import { createCollisionLoader } from '../tasks/collision';
import type { Transport, WorldState } from './types';
import type { ParamValues, ScriptContext, Tile, TileLike } from '../tasks/types';
import { createDeprecations } from '../tasks/deprecate';
import { createAttachments, type Attachments } from '../tasks/attachments';
import type { Trace } from '../tasks/trace';

// One per Worker: the atlas and the collision bitset are static map knowledge, so a second run
// in the same tab pays nothing for them. Neither is disposed when a run ends - the collision
// grid is installed in the vendored pathfinder as module state, and tearing it down would make
// the next run re-fetch and re-decode half a megabyte for the same answer.
const atlas = createAtlasLoader();
const collision = createCollisionLoader();

/**
 * Where `c.screenshot` files its images. Worker-scoped like the two above, and keyed by context
 * rather than one store per context, because the eight-image cap has to be per run and the
 * outer map has to be released: a store built per context would leak nothing but would also
 * make `clear` meaningless, and one that is never cleared grows an entry per run for the life
 * of the tab. `dispose` below is the release.
 *
 * The bytes stay in the Worker. Only the id and the label cross `postMessage`, so nothing
 * upstream can fetch an image yet; a persisted store is P6, entry 7.
 */
const attachments = createAttachments();

/**
 * The key one context's attachments are filed under. Minted here rather than taken from the run
 * message: `RunContextDeps` carries no run id, a snippet has none at all, and the store only
 * needs a key that is unique per context and dead when that context disposes.
 */
let contexts = 0;

/**
 * Where the run started, until `c.anchor({ x, z })` moves it. Recovery walks back to it, so it
 * is owned out here rather than by the context, which a snippet rebuilds. It seeds on first read
 * rather than when it is built, because `startRun` explicitly permits a run that begins before
 * the first snapshot arrives - seeding then would pin the anchor at the map origin for the
 * whole run.
 */
export function makeAnchor(state: () => WorldState | null): (a?: TileLike | number, z?: number) => Tile {
  let at: Tile | null = null;
  return (a, z) => {
    const player = state()?.player;
    // An omitted level means the plane the player is on, which is exactly what it means in
    // `travel.to` (`resolveTarget` resolves `target.level ?? playerLevel`, travel.ts:62). A
    // `Tile` has to name all three, so the plane is resolved here instead of being left off,
    // and resolving it to a hardcoded 0 would be a different promise: an anchor set upstairs
    // and handed back as level 0 makes `c.travel.to(c.anchor())` refuse the walk home as
    // `needs_route` (travel.ts:106), which is what recovery.ts:134 and runHealth.ts:104 do.
    const here = player?.level ?? 0;
    // Two arms on purpose: `anchor({ x, z })` is the compliant form and `anchor(x, z)` is the
    // form every saved script that ever set an anchor is written in. S12 says additions over
    // renames, so the old arm keeps working until api 3 removes it. Both are reached by string
    // from script text nothing typechecks, so `null` and a non-number first argument have to
    // fall through to the seed rather than throw inside the player's run.
    if (typeof a === 'object' && a !== null) at = { x: a.x, z: a.z, level: a.level ?? here };
    else if (typeof a === 'number' && z !== undefined) at = { x: a, z, level: here };
    at ??= { x: player?.worldX ?? 0, z: player?.worldZ ?? 0, level: here };
    return { ...at };
  };
}

/**
 * A snippet runs with no run behind it, and so with no health monitor. An inert member keeps
 * `c.health` the same shape everywhere instead of making every reader test for it.
 */
const NO_HEALTH: ScriptContext['health'] = { is: () => false, last: () => null, recovered: () => {} };

/**
 * The transport a context runs over, refusing to dispatch once the signal it is running under
 * has fired.
 *
 * Measured on the live stack in SP4b Task 14, and the reason this exists: an SDK action is
 * written to survive a failed dispatch, so when a stop rejects the RPC it is waiting on
 * (`cancelInFlight` in worker.ts), the action simply issues the next one. That fresh call is
 * behind the `rejectAll` and behind the `cancel` message, so nothing cancels it and the Worker
 * was still working a second and a half after `stopped by test`. `WorkerHost.stop` gives the
 * Worker a two second grace and then kills it, which synthesises a summary reading "the worker
 * was terminated before the run reported an end" with no xp, no items and no tiles on it, so
 * every chop, fish and mine run wrote a hollow row to history and to the run report.
 *
 * `signal()` is the task's own while a task is in flight and the run's between them, so this
 * refuses exactly the actions of a task that has been aborted or a run that has been stopped,
 * and nothing else: `onStart` and a natural end's `onStop` both run with neither aborted.
 */
function abortAware(transport: Transport, signal: () => AbortSignal): Transport {
  return {
    ...transport,
    dispatch: (action, timeoutMs) =>
      signal().aborted
        ? Promise.reject(new Error('the task was aborted'))
        : transport.dispatch(action, timeoutMs)
  };
}

export interface RunContextDeps {
  transport: Transport;
  trace: Trace;
  params: ParamValues;
  signal(): AbortSignal;
  onTick(cb: () => void): () => void;
  /** The latest snapshot, for seeding the anchor. Null before the first one arrives. */
  state(): WorldState | null;
  /** The run's health monitor, or nothing for a snippet. */
  health?: ScriptContext['health'];
  /**
   * Where `c.screenshot` files images. Defaults to the Worker's one store above, which is what
   * every real caller wants; a test passes its own so it can read back what a disposal released.
   */
  attachments?: Attachments;
}

/** A context over this Worker's shared map knowledge, with an anchor of the caller's own. */
export function createRunContext(d: RunContextDeps): WorkerContext {
  // Built here, beside the anchor, and for the same reason: both belong to one run rather than
  // to the Worker, so the set of notices already said dies with the run and the next run's
  // player is told too.
  const deprecations = createDeprecations(text => d.trace.push({ kind: 'log', level: 'warn', text }));
  const runId = `ctx-${++contexts}`;
  const store = d.attachments ?? attachments;
  const built = createWorkerContext({
    transport: abortAware(d.transport, d.signal),
    trace: d.trace,
    params: d.params,
    signal: d.signal,
    onTick: d.onTick,
    atlas,
    collision,
    deprecations,
    attachments: store,
    runId,
    anchor: makeAnchor(d.state),
    health: d.health ?? NO_HEALTH
  });
  return {
    ...built,
    dispose() {
      built.dispose();
      deprecations.reset();
      store.clear(runId);
    }
  };
}
