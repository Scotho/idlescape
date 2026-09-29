// web/src/tasks/types.ts - the script model contract (SP4a).
import type { WorldState, ActionResult } from '../agent/types';

// The vendored rs-sdk sdk layer (SP4a Task 3) provides the high-level actions and the
// state + primitives surface a script sees as `c.bot` and `c.sdk`.
import type { BotActions } from '../vendor/rs-sdk/sdk/actions';
import type { BotSDK } from '../vendor/rs-sdk/sdk/index';
import type { NearbyLoc, NearbyNpc } from '../vendor/rs-sdk/sdk/types';
export type { BotActions, BotSDK };

// The script-facing surface lives in scriptContext.ts (plan R1). Re-exported here so that
// `import type { ScriptContext } from './types'` keeps working everywhere it already does,
// and so this package still has one types.ts.
import type { HardStop, ScriptContext, TileLike } from './scriptContext';
export * from './scriptContext';

export type ParamField =
  | { type: 'boolean'; label: string; default: boolean }
  | { type: 'number'; label: string; default: number; min?: number; max?: number; step?: number }
  | { type: 'select'; label: string; default: string; options: { value: string; label: string }[] }
  | { type: 'text'; label: string; default: string; maxLength?: number };
export type ParamSchema = Record<string, ParamField>;
export type ParamValues = Record<string, boolean | number | string>;

export type Requirement =
  | { kind: 'item'; name: string; qty?: number; text: string }          // in inventory or worn
  | { kind: 'skill'; skill: string; level: number; text: string }
  | { kind: 'area'; regionIds: number[]; text: string }
  | { kind: 'custom'; test: (s: WorldState) => boolean; text: string };

// --- The atlas (SP4b Task 3) ------------------------------------------------
// A build-time index of where the map's resources are, generated from the pinned engine
// content clone by scripts/gen/atlas.ts and committed as web/src/data/atlas.json.

export type ResourceKind =
  | 'tree' | 'rock' | 'fishing-spot' | 'bank' | 'furnace' | 'anvil' | 'range' | 'altar' | 'fire';

export interface AtlasCluster {
  id: number; kind: ResourceKind; variant: string;      // 'oaktree', 'rock_copper', 'saltfish'
  level: number; x: number; z: number;
  n: number; r: number;                                 // placements collapsed, and cluster radius
  region: number;                                       // regionId, packed as WorldExtras reports it
  near?: string[];                                      // landmark ids within 50 tiles
}
export interface AtlasLandmark {
  /**
   * `'route'` is a place that exists only so a route can name it: the top and bottom of a ladder
   * are neither a resource nor a town, and `routeFor` resolves a route's `from` through this
   * table, so both ends of every route have to be in it.
   */
  id: string; kind: ResourceKind | 'town' | 'teleport' | 'route'; name: string;
  level: number; x: number; z: number;
}
export type RouteWaypoint =
  | { kind: 'walk'; x: number; z: number }
  | { kind: 'interact'; locName: string; op: string; x: number; z: number; toLevel?: number };
export interface AtlasRoute { from: string; to: string; level: number; waypoints: RouteWaypoint[] }
export interface Atlas {
  version: number; source: { contentSha: string };
  kinds: Record<ResourceKind, { label: string; op: string; skill?: string }>;
  clusters: AtlasCluster[]; landmarks: AtlasLandmark[]; routes: AtlasRoute[];
}

export type FoundVia = 'scene' | 'atlas' | 'sweep';
export interface FoundTarget {
  via: FoundVia; kind: ResourceKind;
  /**
   * The display name the game shows ('Oak'), except on the one path where the atlas layer walked
   * to a cluster and then saw nothing standing in it: there it is the cluster's content debug
   * name ('oaktree'), because that is all there is to report. It is for a human reading the
   * trace - never key behaviour on it. Read `loc`, `npc` or `cluster` instead.
   */
  name: string;
  x: number; z: number; level: number; distance: number;
  loc?: NearbyLoc; npc?: NearbyNpc;                     // present only for `via: 'scene'`
  cluster?: AtlasCluster;
}
export interface FindOpts {
  /**
   * Matched against the scene entry's display name, and against an atlas cluster's variant
   * (the content debug name). A string is an exact, case-insensitive match; a RegExp is tested
   * as written. The two namespaces differ on purpose: 'Oak' is what the game calls it and
   * 'oaktree' is what the content does.
   */
  variant?: string | RegExp;
  /** How far the scene layer looks, a count of tiles. 15 by default, capped at 52. */
  radius?: number;
  /** How far the atlas layer will accept a cluster from, a count of tiles. Unset, any distance. */
  maxDistance?: number;
  /** Keep only entries the walker believes it can reach. True by default. */
  reachableOnly?: boolean;
}
/** How `c.find.sweep` walks looking for what neither the scene nor the atlas could place. */
export interface SweepOpts {
  /** The walking budget, a count of tiles. 200 by default; the sweep gives up when it runs out. */
  maxTiles?: number;
  /** Where the scan points go: a ring around the anchor, or the zone grid. 'ring' by default. */
  pattern?: 'ring' | 'zones';
  /** Where the scan points are centred. The player's tile at the call by default. */
  anchor?: TileLike;
}

// --- Travel (SP4b Task 5) ---------------------------------------------------
// Getting somewhere that is not in the current scene: a resolved target, a declared route when
// one exists, scene-sized legs for the rest, and a typed reason when it stops. `TravelTarget` is
// the one piece a script passes, so it is declared in scriptContext.ts and re-exported above.

/** How `c.travel.to` is allowed to spend itself getting there. */
export interface TravelOpts {
  /** How near the target counts as arrived, a count of tiles, Chebyshev. 2 by default. */
  tolerance?: number;
  /** How many scene-sized legs it may walk before reporting `unreachable`. 24 by default. */
  maxLegs?: number;
  /** The whole walk's budget in milliseconds. 120000 by default, because travel takes minutes. */
  timeoutMs?: number;
}
/** What `c.travel.to` reports. It never throws, so every ending is one of these. */
export interface TravelResult {
  /** True only when the walk ended within `tolerance` of the goal, on the target's own plane. */
  success: boolean;
  /** Why it stopped, when it did not arrive. Absent on success. */
  reason?: 'unreachable' | 'needs_route' | 'aborted' | 'timeout';
  /** Where the player was left standing. Absent only when the target never resolved at all. */
  stoppedAt?: { x: number; z: number };
  /** How many legs it walked, a count. */
  legs: number;
  /** How far it walked, a count of tiles, summed over the legs. */
  tiles: number;
}

// --- Health and recovery (SP4b Task 7) --------------------------------------
// What "the run has come off the rails" means, as a closed set. The monitor in
// `healthMonitor.ts` decides which of these a snapshot shows; `recovery.ts` says what to do
// about it; the runner drains one recovery at a time before it looks at the script's tasks.

export type HealthCondition =
  | 'no-progress' | 'unexpected-interface' | 'dialog-stuck' | 'level-up'
  | 'death' | 'logout' | 'inventory-full' | 'out-of-supplies' | 'low-hp';
export type RecoveryOutcome = 'recovered' | 'escalated' | 'failed' | 'handled-by-script';
export interface HealthEvent { condition: HealthCondition; at: number; detail?: string; snapshot?: unknown }
/**
 * Why a run ended badly, as a closed set so history and Claude can group failures. `low_hp` is
 * its own reason rather than `stuck`: a character that dropped below `hardStop.hpBelow` and one
 * that could not make progress are two failures a player would never confuse.
 */
export type FailReason =
  | 'stuck' | 'unreachable' | 'no_progress' | 'died' | 'disconnected'
  | 'out_of_supplies' | 'inventory_full' | 'requirements' | 'timeout' | 'aborted' | 'crashed'
  | 'low_hp'
  /** The run ended because the player asked to be logged out, not because anything went wrong. */
  | 'logged_out';

/**
 * What a run does about its own death. `'loot'` is the default, and is the one behaviour that
 * needs the map: the engine drops everything but the three priciest items at the death tile and
 * despawns the pile 200 ticks later, so walking back for it is a race worth running and losing.
 *
 * `'return'` is the old behaviour, respawn then walk to the run anchor, for a script whose loot
 * is not worth the two minutes. `'resume'` carries on from the respawn point. `'fail'` is a
 * script saying a death ends the run, and is the only value that skips the respawn wait.
 *
 * `'pause'` hands the run back to the player, `'logout'` ends it by logging the account out, and
 * `'loot-and-logout'` does the loot walk first. Those three are endings the escalation ladder
 * owns rather than the recovery, because only the ladder can stop a run.
 */
export type DeathBehaviour =
  | 'loot' | 'return' | 'resume' | 'pause' | 'logout' | 'loot-and-logout' | 'fail';

/**
 * What a run does when it cannot carry on by itself, which today is the `pause-stuck` rung of
 * every condition. `'pause'` is the historical behaviour and the default: a paused run is one a
 * player or Claude can resume. The other two end the run, because a player who asked to be
 * logged out or stopped is not coming back to resume it.
 */
export type StuckBehaviour = 'pause' | 'logout' | 'stop';

/**
 * The three behaviour settings the player owns, as they cross into the Worker on the `run`
 * message. **Read once, at run start**: changing one mid-run does not touch the run in flight,
 * the same way the attended toggle governs starting rather than stopping.
 *
 * Typed as the closed sets, but not trusted as them: these values come out of Firestore and a
 * localStorage mirror, so `resolvePolicy` validates every one of them.
 */
export interface BehaviourSettings {
  onDeath: DeathBehaviour;
  onStuck: StuckBehaviour;
  maxRelogins: number;
}

export interface HealthPolicy {
  noProgressMs?: number;                                // default 90_000
  onDeath?: DeathBehaviour;                             // default 'loot'
  onStuck?: StuckBehaviour;                             // default 'pause'
  maxRelogins?: number; maxRecoveryAttempts?: number;   // defaults 2 and 2 (per condition)
  expectInterfaces?: number[];                          // modal ids this script opens on purpose
  consumes?: string[];                                  // item names whose exhaustion ends the run
}

export interface ScriptManifest {
  id: string; name: string; version: number; description: string;
  tags?: string[]; author?: string; order?: number;
  params?: ParamSchema; requires?: Requirement[];
  stuckAfterMs?: number; maxAttempts?: number; hardStop?: HardStop;
  estimateMinutes?: number;
  health?: HealthPolicy;
  /** Where the run treats as home, when the script knows better than "wherever it started". */
  anchor?: TileLike;
}

export interface Task {
  name: string;
  when(s: WorldState, c: ScriptContext): boolean;
  run(c: ScriptContext): Promise<ActionResult | void>;
  timeoutMs?: number; maxAttempts?: number;
  /**
   * How long after this task EXITS before it may be selected again. The clock starts at the
   * exit, not at the entry, so a long task still gets its full cooldown afterwards.
   *
   * The runner takes the first task whose `when` holds and then asks whether it is due, so a
   * cooldown idles the tick rather than yielding to a later task that also matches. Put a
   * cooldown on a task whose `when` is narrow, not on one that matches everything.
   *
   * A cooldown skip is not an attempt: it does not spend `maxAttempts` and it does not reset
   * the ladder. It is run scoped, so a new run starts every task due.
   */
  cooldownMs?: number;
  /**
   * Conditions this task handles itself. The monitor queues no recovery of its own for one of
   * these; the task's `when` picks it up through `c.health.is(...)` and reports back with
   * `c.health.recovered(...)`.
   */
  recovers?: HealthCondition[];
}

export type RunOutcome = 'done' | 'failed' | 'stopped';
export interface Script extends ScriptManifest {
  tasks: Task[];
  until?(s: WorldState, c: ScriptContext): boolean;   // c gives params-driven stop conditions
  onStart?(c: ScriptContext): Promise<void>;
  onStop?(c: ScriptContext, outcome: RunOutcome): Promise<void>;
}

export type PauseReason = 'player' | 'claude' | 'human-input' | 'stuck' | 'hard-stop';
export type RunState = 'idle' | 'starting' | 'running' | 'paused' | 'done' | 'failed' | 'stopped';
export type Actor = 'player' | 'claude' | 'test' | 'runner';

/**
 * What `c.find` settled on, and which layer answered. `kind_` rather than `kind`: the trace
 * union is already discriminated on `kind`.
 */
export interface TargetEvent {
  kind: 'target'; via: FoundVia; kind_: ResourceKind; name: string;
  x: number; z: number; distance: number;
}

export type TraceEvent = { seq: number; at: number } & (
  | { kind: 'run_started'; runId: string; scriptId: string; version: number; params: ParamValues; startedBy: Actor }
  | { kind: 'task_enter'; task: string }
  | { kind: 'task_exit'; task: string; outcome: 'ok' | 'failed' | 'timeout' | 'aborted'; attempts: number; ms: number; reason?: string }
  | { kind: 'action'; action: string; ok: boolean; reason?: string }
  | { kind: 'log'; level: 'info' | 'warn' | 'error'; text: string }
  | { kind: 'status'; text: string }
  | { kind: 'xp'; skill: string; delta: number }
  | { kind: 'item'; id: number; delta: number }
  | { kind: 'stuck'; task: string | null; snapshot: unknown }
  | { kind: 'paused'; reason: PauseReason; by: Actor }
  | { kind: 'resumed'; by: Actor }
  | { kind: 'human_input' }
  | { kind: 'snapshot'; snapshot: unknown }
  | { kind: 'run_done'; status: RunOutcome; summary: string; durationMs: number; xpGained: Record<string, number>; itemsDelta: Record<number, number>; tasksEntered: string[] }
  | { kind: 'truncated'; dropped: number }
  | { kind: 'health'; condition: HealthCondition; detail?: string }
  | { kind: 'recovery'; condition: HealthCondition; action: string; outcome: RecoveryOutcome }
  // An id and a label, never the Blob. This row crosses postMessage, is persisted per run in
  // IndexedDB, is rendered by traceView.ts and is copied to Claude as text; the bytes live in
  // the Worker's attachment store (tasks/attachments.ts) for the life of the run.
  | { kind: 'attachment'; attachmentId: string; label: string }
  | TargetEvent);

export interface RunSummary {
  runId: string; scriptId: string; scriptName: string; version: number; source: 'library' | 'user';
  startedBy: Actor; characterId: string | null; params: ParamValues;
  /**
   * The character's game name as it stood when the run started. History outlives a rename and
   * outlives the character itself, and `characterId` alone tells a player reading a month-old
   * row nothing. Null for a run started before a character was chosen.
   */
  characterName: string | null;
  status: RunState; startedAt: number; endedAt: number | null; durationMs: number;
  xpGained: Record<string, number>; lastTask: string | null; summary: string;
  /**
   * Why the run ended badly. Absent on a run that ended well, which is the only branch a reader
   * has to make: the four below are required with empty defaults so that a row written by an
   * older build reads back the same shape as one written today (`withDefaults` in history.ts).
   */
  failReason?: FailReason;
  /** Item id to net change over the run, as the trace counted it. */
  itemsDelta: Record<number, number>;
  /** Tiles `c.travel` actually moved the character, summed over every leg of the run. */
  tilesTravelled: number;
  /** How many times each condition fired during the run. The run report (Task 11) reads it. */
  recoveries: Partial<Record<HealthCondition, number>>;
}

export interface RunStatus {
  state: RunState; reason: PauseReason | null; runId: string | null; scriptId: string | null; scriptName: string | null;
  task: string | null; statusLine: string; attempts: number; startedAt: number | null; attached: boolean; resumeAtMs: number | null;
  /**
   * What the run is working on, from the last `target` trace event, and which of `c.find`'s
   * three layers answered. Null until `c.find` answers once, and it then keeps the last answer
   * for the rest of the run: the banner is saying what the run is at, not what it found this
   * second.
   */
  target: { via: FoundVia; kind: ResourceKind; name: string; distance: number } | null;
  /** The condition a recovery is running for, and when it started. Null while the run is healthy. */
  health: { condition: HealthCondition; since: number } | null;
  /** Skill name to xp per hour, over the run so far. Empty until the run has earned something. */
  xpPerHour: Record<string, number>;
}

export interface TaskSummary {
  id: string; name: string; description: string; version: number; tags: string[];
  source: 'library' | 'user' | 'fork'; libraryId?: string; installed?: boolean; params: ParamSchema;
  requirements: { ok: boolean; missing: string[] }; estimateMinutes?: number; order: number;
  /** Per account (spec decision 7). Always set by the catalogue; false means `run` refuses. */
  enabled: boolean;
  lastRun?: { runId: string; at: number; status: RunState; summary: string };
}
