// The `ScriptContext` a script sees (spec section 6), built inside the Worker over a
// Transport whose action methods cross `postMessage`. State reads are served from the
// snapshot the host pushes each tick, so `state()` and every `wait.*` predicate are
// local — only actions pay a round trip.
import { createLocalSdk } from './localSdk';
import { CHAR_DESIGN_INTERFACE } from './constants';
import { locAtHint } from './hintTarget';
import { createTravel } from '../tasks/travel';
import { createFind } from '../tasks/find';
import { createWait } from '../tasks/wait';
import { createRetry } from '../tasks/retry';
import { createDialog } from '../tasks/dialog';
import { createBotExtras } from '../tasks/botExtras';
import type { Transport, Unsub, WorldState } from './types';
import type {
  ClickThroughOpts, LogOpts, ParamValues, ScreenshotOpts, ScriptBot, ScriptContext, Tile, TileLike
} from '../tasks/types';
import type { Attachments } from '../tasks/attachments';
import type { Deprecations } from '../tasks/deprecate';
import type { AtlasLoader } from '../tasks/atlas';
import type { CollisionLoader } from '../tasks/collision';
import type { Trace } from '../tasks/trace';

export interface ContextDeps {
  transport: Transport;
  trace: Trace;
  params: ParamValues;
  /**
   * The signal that is live *now*. The runner installs the current task's signal before each
   * `run` and clears it afterwards, so a `wait.*` registers against the task that started it -
   * a fixed signal here is what made a 1 s task timeout wait out a 60 s `wait.until` (SP4a).
   */
  signal(): AbortSignal;
  /** One call per world-state message from the host. */
  onTick(cb: () => void): () => void;
  /** Static map knowledge, shared by every run in this Worker. */
  atlas: AtlasLoader;
  collision: CollisionLoader;
  /**
   * The run anchor, owned by the Worker so it outlives a context rebuild. Both call shapes
   * reach it; `c.anchor`'s wrapper below is what tells a script the positional one is going.
   */
  anchor(a?: TileLike | number, z?: number): Tile;
  /** Said once per run, so a script using a deprecated member hears about it while it runs. */
  deprecations: Deprecations;
  /**
   * Where `c.screenshot` files an image. Worker-scoped and keyed by run, so the eight-image cap
   * is per run and `runContext.ts` can release a finished one.
   */
  attachments: Attachments;
  /** The key this context's attachments are filed under. `runContext.ts` mints it. */
  runId: string;
  /**
   * What the health monitor has seen. It is run-scoped rather than Worker-scoped - the monitor
   * is built with the script's policy and dies with the run - so it arrives as a dep.
   */
  health: ScriptContext['health'];
}

/**
 * Before the first snapshot arrives there is no world to read. Scripts are written
 * against a live game, so `state()` hands out an empty object rather than null and the
 * `wait.*` predicates simply never match until the first tick lands.
 */
const NO_STATE = Object.freeze({}) as WorldState;

/** Why the two session members refuse, in the words the refusal reports and the log repeats. */
const SCRIPT_REFUSED = 'not available to script code';

/**
 * A context owns state subscriptions — its own `wait.*` predicates and, invisibly, the
 * one `BotSDK` opens in its constructor. A run and every snippet build a fresh context,
 * so those must be releasable or the Worker accumulates a live SDK per run that
 * re-normalises the world on every tick for the rest of the session.
 */
export interface WorkerContext {
  ctx: ScriptContext;
  /** Tiles `c.travel` has walked for this context. The run summary reports it (Task 11). */
  tiles(): number;
  /** Drop every state subscription this context opened. Call it when the run or snippet ends. */
  dispose(): void;
}

export function createWorkerContext(d: ContextDeps): WorkerContext {
  // Every subscription — ours and the SDK's — goes through here so `dispose` can undo it.
  const offs = new Set<Unsub>();
  const onState = (cb: (s: WorldState) => void): Unsub => {
    const off = d.transport.onState(cb);
    offs.add(off);
    return () => { offs.delete(off); off(); };
  };
  /**
   * What the SDK holds, and therefore what a script holds: `BotSDK` keeps its transport as a
   * TypeScript parameter property, which is an ordinary own property in the emitted JS, so
   * `c.sdk.transport` reaches every member of this object at runtime whatever `private` says.
   * The action methods a script may legitimately use are fine there. `relogin` and `logout` are
   * the two whose whole point is that script code must not have them - a script may not log the
   * account in or out - so they are refused here rather than left to the spread to hand out.
   * `onState` is swapped too, but for disposal rather than refusal.
   *
   * A third member added to this object is a decision, not an oversight: workerContext.test.ts
   * pins the list.
   *
   * And be exact about the limit of that: script text runs through `new Function` in the
   * Worker's own global scope (defineScript.ts:42, worker.ts:374), so it holds `self`, and
   * `self.postMessage({ t: 'rpc', callId: 'x', target: 'transport', method: 'logout', args: [] })`
   * reaches workerHost's `answerRpc` (workerHost.ts:257) and then, through `callTransport`
   * (:272), the RAW transport (:279). The same script reaches fetch and dynamic import(),
   * because the Worker is spawned { type: 'module' } (workerHost.ts:73). The swap below is
   * therefore a guardrail against accidents, not a boundary a determined script cannot walk
   * around. A Worker-resident script is trusted as the account's own code (decision D24), and
   * web/src/tasks/docs/06-limits-and-trust.md says so in those words.
   */
  const scoped: Transport = {
    ...d.transport, onState,
    relogin: () => Promise.resolve({ ok: false, reason: SCRIPT_REFUSED }),
    logout: () => { d.trace.push({ kind: 'log', level: 'warn', text: `logout is ${SCRIPT_REFUSED}` }); }
  };
  const { sdk, bot: vendoredBot } = createLocalSdk(scoped);
  const memory = new Map<string, unknown>();
  const state = (): WorldState => d.transport.getState() ?? NO_STATE;

  /**
   * P8's members, assigned ONTO the vendored instance rather than spread into a new object:
   * `BotActions` is a class and its 160 methods live on the prototype, so `{ ...bot, ...extras }`
   * would hand a script an object with the extras and nothing else. `createLocalSdk` builds a
   * fresh instance per context, so mutating it reaches no other run.
   */
  const bot: ScriptBot = Object.assign(vendoredBot, createBotExtras({
    state, dispatch: action => scoped.dispatch(action)
  }));

  const wait = createWait({
    state, onState, onTick: d.onTick, signal: d.signal,
    log: (text, level) => d.trace.push({ kind: 'log', level, text })
  });

  // P11 composes over the wait above and nothing else, so it is built after it and injected
  // rather than written inline: workerContext.ts is the wiring, not the mechanism.
  const retry = createRetry({
    ticks: wait.ticks,
    signal: d.signal,
    log: text => d.trace.push({ kind: 'log', level: 'info', text })
  });

  // P14, composed over the sdk and the wait above. The index-versus-array-position rule and the
  // measured comment about the frame wait live in dialog.ts, once, rather than in a paragraph in
  // each of the three call sites that used to carry them.
  const dialog = createDialog({
    state, click: i => sdk.sendClickDialog(i), wait, signal: d.signal
  });

  const travel = createTravel({
    state, bot,
    atlas: d.atlas,
    collision: d.collision,
    status: text => d.trace.push({ kind: 'status', text }),
    // A route's `interact` waypoint is a loc interaction like any other; resolving it through
    // the live scene rather than the route's own coordinates means a door that has been moved
    // by a content bump still works.
    interact: async wp => {
      const loc = (state().nearbyLocs ?? []).find(l => l.name === wp.locName && Math.abs(l.x - wp.x) <= 2 && Math.abs(l.z - wp.z) <= 2);
      if (!loc) return { success: false, message: `no ${wp.locName} at ${wp.x}, ${wp.z}`, reason: 'target_not_found' };
      return bot.interactLoc(loc, wp.op);
    },
    signal: d.signal,
    now: Date.now
  });

  // `find` sits on top of travel rather than beside it: its atlas layer walks to the cluster it
  // picked, and its sweep walks the ring, so both go through the same leg-splitting walker.
  const find = createFind({
    state, sdk, atlas: d.atlas, travel,
    status: text => d.trace.push({ kind: 'status', text }),
    trace: event => { d.trace.push(event); },
    signal: d.signal
  });

  const ctx: ScriptContext = {
    state, bot, sdk, params: d.params, memory, travel, find, health: d.health, retry, dialog,
    // The cast is the overload signature and not a widening: one implementation is how an
    // overloaded member is written, and `ScriptContext['anchor']` is the pair of arms it
    // presents. The deprecated arm is the one a number arrives on.
    anchor: ((a?: TileLike | number, z?: number): Tile => {
      if (typeof a === 'number') {
        d.deprecations.warn('c.anchor(x, z)', 'Use c.anchor({ x, z }). Removed in api 3.');
      }
      return d.anchor(a, z);
    }) as ScriptContext['anchor'],
    // A getter, not a value: the runner swaps the live signal between tasks, and a script that
    // captured `c.signal` at task start must still see its own task's abort.
    get signal() { return d.signal(); },
    log: (text: string, arg?: 'info' | 'warn' | 'error' | LogOpts) => {
      const level = typeof arg === 'string' ? arg : arg?.level ?? 'info';
      d.trace.push({ kind: 'log', level, text });
    },
    status: text => d.trace.push({ kind: 'status', text }),
    // P7. The capability was already reachable as `c.sdk.screenshot()` with two defects: it
    // rejects when there is no canvas (localTransport.ts:127), which S3 forbids, and a Worker
    // script had nowhere to put the Blob it got back. Both are closed here rather than in the
    // vendored sdk, which is not ours to edit.
    async screenshot(o: ScreenshotOpts = {}) {
      let shot: Blob;
      try {
        shot = await sdk.screenshot();
      } catch (e) {
        d.trace.push({ kind: 'log', level: 'warn', text: `screenshot failed: ${e instanceof Error ? e.message : String(e)}` });
        return null;
      }
      if (o.attach === false) return shot;
      const label = o.label ?? 'screenshot';
      // The id, never the Blob: R8, and the row's own comment in tasks/types.ts.
      const attachmentId = d.attachments.put(d.runId, label, shot);
      d.trace.push({ kind: 'attachment', attachmentId, label });
      return shot;
    },
    wait,
    tutorial: {
      title: () => state().tutorial?.title ?? '',
      is: re => re.test(state().tutorial?.title ?? ''),
      async followHint(o = {}) {
        const s = state();
        // The character-design chatbox swallows clicks, so a hint arrow behind it is
        // unreachable; say so instead of reporting the target as missing.
        if (s.interface?.isOpen && s.interface.interfaceId === CHAR_DESIGN_INTERFACE) {
          return { success: false, message: 'character design is open', reason: 'char_design_open' };
        }
        const h = s.hint;
        if (h?.kind === 'npc') {
          const npc = (s.nearbyNpcs ?? []).find(n => n.index === h.npcIndex);
          if (!npc) return { success: false, message: 'hinted npc not in view', reason: 'target_not_found' };
          return o.talk === false ? bot.interactNpc(npc, 1) : bot.talkTo(npc);
        }
        if (h?.kind === 'tile') {
          // Not an exact-tile match: three of Tutorial Island's doors stand one tile east of
          // their own arrow, and matching the tile alone walked a live run onto the door and
          // left it there. `locAtHint` carries the rule and the measurements behind it.
          const t = locAtHint(s.nearbyLocs ?? [], h.tile);
          return t ? bot.interactLoc(t.loc, t.op) : bot.walkTo(h.tile.x, h.tile.z, 1);
        }
        return { success: false, message: 'no hint arrow', reason: 'no_hint' };
      },
      /**
       * S12's shim. The name stays and the implementation moved: this is
       * `c.dialog.continueUntilOption` with its report thrown away, because `Promise<void>` is
       * what every saved script awaits and nothing may be renamed out from under one.
       */
      async clickThrough(arg?: number | ClickThroughOpts) {
        const o: ClickThroughOpts = typeof arg === 'number' ? { maxClicks: arg } : arg ?? {};
        await dialog.continueUntilOption(o);
      }
    }
  };
  return {
    ctx,
    tiles: travel.tiles,
    dispose() {
      for (const off of [...offs]) off();
      offs.clear();
    }
  };
}
