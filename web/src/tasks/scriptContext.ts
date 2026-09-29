// The surface a script sees, and the named options bags it passes. Split out of types.ts
// (which re-exports every name here, so no import site moved) for two reasons: the doc
// comments S11 requires put the file over the 400-line ceiling, and this file is what
// scriptApi.ts declares and what scripts/gen/apiDocs.ts walks.
//
// The import below is the other half of a deliberate type-only cycle: the members here reference
// the run model that stays in types.ts, and types.ts re-exports this file. A type-only cycle is
// erased at emit and nothing in it is a value, so it costs nothing at runtime. It matters at one
// place only: a re-export list must name each type from the file that declares it.
//
// S11 landed a doc comment on every declaration site below, which cost this file the same
// ceiling headroom types.ts ran out of, so every named options bag moved one file further out
// to scriptContext.opts.ts and is re-exported from here.
import type {
  AtlasCluster, AtlasLandmark, BotActions, BotSDK, FindOpts, FoundTarget, HealthCondition,
  HealthEvent, ParamValues, ResourceKind, SweepOpts, TravelOpts, TravelResult
} from './types';
import type { ActionResult, WorldState } from '../agent/types';
import type { BotExtras } from './botExtras';
import type {
  ClickThroughOpts, DialogCompleteOpts, DialogContinueOpts, FollowHintOpts, LogOpts, RetryOpts,
  ScreenshotOpts, WaitAnimationOpts, WaitHpOpts, WaitUntilOpts
} from './scriptContext.opts';

export type {
  ClickThroughOpts, DialogCompleteOpts, DialogContinueOpts, FollowHintOpts, HardStop, LogOpts,
  RetryOpts, ScreenshotOpts, WaitAnimationOpts, WaitHpOpts, WaitUntilOpts
} from './scriptContext.opts';

/**
 * What `c.bot` is: the vendored `BotActions` plus the members we add over it. Nothing may be
 * added to `web/src/vendor/rs-sdk/` without a `PATCHES.md` deviation, and re-vendoring would pay
 * that cost again every time, so the extra members are declared in `botExtras.ts` and assigned
 * onto the vendored instance in `workerContext.ts`. The interface is what says so in the types.
 */
export interface ScriptBot extends BotActions, BotExtras {}

// One world-coordinate shape, per S8: x and z, never x and y, because that is what the engine
// and the whole vendored surface use. `level` is the floor plane, 0 being the ground floor, and
// a `Tile` always names it.
export interface Tile { x: number; z: number; level: number }
/**
 * What a call site may pass where a tile is wanted. An omitted `level` means the plane the
 * player is on, not the ground floor: `c.travel.to({ x, z })` walks on the player's own plane,
 * and `c.anchor({ x, z })` records the plane the player was on when the anchor was set. Say
 * `level` explicitly to mean a particular floor.
 */
export type TileLike = { x: number; z: number; level?: number };

/** Somewhere `c.travel` can be asked to go: a tile, a named landmark, or an atlas cluster. */
export type TravelTarget =
  | TileLike
  | { landmark: string }
  | { cluster: AtlasCluster };

export interface ScriptContext {
  /**
   * The world as of the last snapshot the host pushed. Never null: before the first snapshot
   * it is a frozen empty object, so a `wait.*` predicate simply never matches rather than
   * throwing. This is the one place our surface differs from `c.sdk.getState()`, which is
   * `WorldState | null`. A snapshot read, no round trip.
   */
  state(): WorldState;
  /**
   * The game actions: click a loc, talk to an npc, walk a few tiles, drop an item. Members
   * report rather than throw, but the result SHAPE is per action and is not our `ActionResult`:
   * `pickup` and `dropItem` carry `success`, `message` and a `reason`; `talkTo`, `chopTree` and
   * `burnLogs` carry `success` and `message` and no `reason` at all; `walkAdjacentTo` answers a
   * bare boolean, `dismissBlockingUI` nothing, and `openDoorAt` a string union. Read the
   * member's own return type before branching on a field.
   * Each is a client round trip and resolves once the client has acted, which is not the same
   * moment the world has answered; pair one with a `c.wait.*` to know the result landed.
   *
   * `BotActions` is vendored, under `web/src/vendor/rs-sdk/`, so its prose is not ours to edit
   * and the reference marks it as theirs. `BotExtras` is the short list we add over it, and
   * those members are documented where they are declared, in `botExtras.ts`.
   */
  bot: ScriptBot;
  /**
   * The raw SDK the bot layer is built on, for the calls `c.bot` does not wrap. Vendored, and
   * with the harsher contract that goes with it: several members return null or reject where our
   * own surface reports. Prefer `c.bot`, `c.wait`, `c.find` and `c.travel`, and reach for this
   * when nothing above it can say what you mean.
   *
   * `c.sdk.getState()` is `WorldState | null` where `c.state()` is never null, which is the one
   * difference between the two layers that catches an author out.
   */
  sdk: BotSDK;
  /**
   * The only sanctioned way for a script to spend time (S7). Every member resolves rather than
   * rejects, and `false` means one of two things: the timeout expired, or the run was stopped.
   * `opts.label`, where a member takes one, is what tells those apart in the trace.
   *
   * Every `timeoutMs` here is milliseconds and defaults to 20000. They cost no round trip: a
   * wait subscribes to the snapshots the host is already pushing. There is no fixed sleep on
   * this surface, because a fixed sleep drifts against the server's own beat.
   */
  wait: {
    /**
     * Resolves true the moment `pred` accepts a snapshot, false on timeout or stop. `pred` is
     * tested against the current snapshot first, so a condition that already holds returns
     * without waiting a tick, and a `pred` that throws counts as not matching rather than
     * taking the run down.
     */
    until(pred: (s: WorldState) => boolean, opts?: WaitUntilOpts): Promise<boolean>;
    /**
     * Waits `n` server ticks. True when it counted them, false when the run was stopped first.
     * Ticks, not milliseconds: a tick is the server's own beat, and a fixed sleep drifts against
     * it. This is the only delay a script may express.
     */
    ticks(n: number): Promise<boolean>;
    /**
     * Waits for a chatbox to be open, and for its text to match `pattern` when one is given.
     * True when it opened, false on timeout or stop. It matches against the same string
     * `c.dialog.text()` reports. `timeoutMs` is milliseconds, 20000 by default.
     */
    dialog(pattern?: RegExp, timeoutMs?: number): Promise<boolean>;
    /**
     * Waits for `skill` to gain at least `minDelta` experience over what it held at the call.
     * Skill names match case-insensitively, and a name the world does not publish reads as zero
     * experience, so it never gains any and the wait times out. `minDelta` is experience
     * points, 1 by default; `timeoutMs` is milliseconds, 20000 by default.
     */
    xp(skill: string, minDelta?: number, timeoutMs?: number): Promise<boolean>;
    /**
     * Waits for the inventory to hold `delta` more of an item than it did at the call, by id or
     * by name, matched case-insensitively with stacks summed. It counts a gain only, so it
     * never fires for an item being dropped. `delta` is a count of items, 1 by default;
     * `timeoutMs` is milliseconds, 20000 by default.
     */
    item(idOrName: number | string, delta?: number, timeoutMs?: number): Promise<boolean>;
    /**
     * Waits for a game message published after the call to match `pattern`. Messages already on
     * screen never count, because the baseline is the newest message's tick at the call.
     * `timeoutMs` is milliseconds, 20000 by default.
     */
    message(pattern: RegExp, timeoutMs?: number): Promise<boolean>;
    /**
     * Waits for the player to stop animating, which is how "the action finished" reads from a
     * snapshot. A call made while already idle returns true without waiting a tick.
     * `timeoutMs` is milliseconds, 20000 by default.
     */
    idle(timeoutMs?: number): Promise<boolean>;
    /**
     * Waits on the player's animation: any change from the id at call time, or `opts.id`
     * exactly. The baseline is captured at the call, as `xp`, `item` and `message` do, so there
     * is no missed edge between the call and the next snapshot.
     */
    animation(opts?: WaitAnimationOpts): Promise<boolean>;
    /**
     * Waits for hitpoints to cross a threshold: strictly below `opts.belowPercent`, or strictly
     * above `opts.abovePercent`, each a percentage of the maximum rather than a count, so one
     * number reads the same at every level. True when it crossed, false on timeout or stop. The
     * bag is required because a call with neither side set can never match; it does not wait
     * forever, it resolves false when `timeoutMs` expires (milliseconds, 20000 by default).
     */
    hp(opts: WaitHpOpts): Promise<boolean>;
  };
  /**
   * Call `fn` until `opts.until` accepts its result, backing off a few server ticks between
   * attempts, and return the last result either way. It never throws for running out of
   * attempts, so a caller reads the result and decides.
   *
   * It lives entirely inside one task attempt: the backoff counts against the task's
   * `timeoutMs`, the attempts do not touch `Task.maxAttempts`, and an abort returns the last
   * result rather than waiting out a backoff. Use `Task.maxAttempts` for "this task keeps
   * failing", `Task.cooldownMs` for "do not run this again for a while", and this one for "the
   * same call sometimes needs a second go".
   */
  retry<T>(fn: () => Promise<T>, opts: RetryOpts<T>): Promise<T>;
  /**
   * The chatbox conversation: what it is showing, and how to answer it.
   *
   * The namespace exists to own one rule. `sdk.sendClickDialog` takes the SERVER-assigned
   * `DialogOption.index`, which starts at 1 because 0 is the implicit continue click, and the
   * array position is not that number. Every member here resolves an option by its text and
   * sends the option's own index, so a script never handles the number at all.
   *
   * The three verbs report an `ActionResult` rather than a bare boolean, because each performs a
   * game action that can fail for a reason worth branching on: `no_option` when nothing matched,
   * `wrong_interface` when no dialogue is open, `timeout` when the chatbox never moved on, and
   * `stopped` when the run ended first. The three reads are synchronous snapshot reads, per S2.
   */
  dialog: {
    /** True while a dialogue is on screen, whether or not it offers a choice. */
    isOpen(): boolean;
    /**
     * The line the chatbox is showing, or the empty string when there is nothing to read. It is
     * the last completed line on this client, because the collector publishes lines and not a
     * current-line field, and it is the same string `c.wait.dialog(pattern)` matches against.
     */
    text(): string;
    /**
     * The choices on offer, in the order the server published them. The client's own "Click here
     * to continue" line is left out: it is a click, not a decision.
     */
    options(): string[];
    /**
     * Answer the option whose text matches. A string matches the whole option, trimmed and
     * case-insensitively; a `RegExp` is tested against it. The predicate arm S5 states for a
     * selector arrives with the fluent query in entry 7 (P3 and P10).
     */
    choose(sel: string | RegExp): Promise<ActionResult>;
    /**
     * Click past the frames that offer nothing to decide, and stop at the first one that does.
     * Succeeds when a choice is showing or the dialogue ended; reports `timeout` when the
     * chatbox never moved on within the budget.
     */
    continueUntilOption(opts?: DialogContinueOpts): Promise<ActionResult>;
    /**
     * Walk a whole conversation, answering each choice frame with the next pattern in order. A
     * pattern is spent once it is used, so a tree is walked rather than a branch retaken. It
     * ends happily when the dialogue closes, even with patterns to spare.
     */
    complete(choices: (string | RegExp)[], opts?: DialogCompleteOpts): Promise<ActionResult>;
  };
  /**
   * Tutorial Island, and nothing else: the guide's own heading, and the hint arrow it points
   * with. The two reads are snapshot reads and cost nothing; the two verbs click and report an
   * `ActionResult`. Anywhere but Tutorial Island the heading is the empty string and there is
   * never a hint, so every member here is safe to call and simply finds nothing.
   */
  tutorial: {
    /** The guide's current heading, or the empty string where there is no tutorial pane. */
    title(): string;
    /** True when the heading matches. False, never throwing, where there is no tutorial pane. */
    is(re: RegExp): boolean;
    /**
     * Do whatever the hint arrow points at: talk to the npc, or click the door, or walk to the
     * tile. A snapshot read and then one client round trip. It reports rather than throws:
     * `no_hint` when nothing is pointed at, `target_not_found` when the hinted npc has left the
     * scene, and `char_design_open` when the character-design pane is swallowing the click.
     * Pass `talk: false` to use option 1 on a hinted npc instead of talking to it.
     */
    followHint(opts?: FollowHintOpts): Promise<ActionResult>;
    // Grandfathered positional first, the compliant bag second. The order is load-bearing:
    // `Parameters<T>` reads the LAST overload, which is what scriptContext.harness.ts asserts.
    /**
     * Click a chatbox through its option-less frames, and stop the moment one offers a choice.
     * `maxClicks` is a count of frames, 10 by default. It resolves when a choice is showing,
     * when the dialogue closed, or when it gave up, and it cannot say which of the three
     * happened.
     *
     * @deprecated Prefer `c.dialog.continueUntilOption()`, which reports why it stopped. This
     * one keeps its name and its `Promise<void>`, because that is what every saved script
     * awaits, and it is grandfathered under S4 rather than scheduled for removal: there is
     * nothing wrong with it, so it is not run through `createDeprecations` and a run that calls
     * it says nothing at `warn`. Tutorial Island's own tests call it sixty times.
     */
    clickThrough(maxClicks?: number): Promise<void>;
    /**
     * The compliant arm of the same member (S4), taking the bag rather than a bare count:
     * `maxClicks` is a count of frames (10) and `timeoutMs` is the milliseconds each frame is
     * given to arrive (4000). It still resolves to nothing; use `c.dialog.continueUntilOption`
     * when the answer matters.
     */
    clickThrough(opts?: ClickThroughOpts): Promise<void>;
  };
  /**
   * The values this run was started with, one per field in the script's `params` schema, filled
   * in from the manifest's defaults wherever the caller left a field out. `params` is optional
   * on a manifest and the two arms differ: where the script declares a schema, every declared
   * name is present and a name it does not declare is dropped, so a typo cannot masquerade as a
   * setting; where it declares none, which is the ordinary case for a user-written script, every
   * scalar key the caller passed comes through as given. Fixed for the run, and free to read.
   */
  params: ParamValues;
  /**
   * Write a line into the run's trace: the script's own narration, which is what the Tasks panel
   * lists and what a report copied to Claude carries. `level` defaults to `info`. Free, and it
   * never throws. Use `c.status` for the one line that says what is happening right now.
   */
  log(text: string, level?: 'info' | 'warn' | 'error'): void;
  /**
   * The compliant arm of the same member (S4): the same line with its level in a named bag. The
   * positional arm above is grandfathered rather than deprecated, because saved scripts call it
   * by string and there is nothing wrong with it.
   */
  log(text: string, opts: LogOpts): void;
  /**
   * Say what the run is doing right now, in one short line. Each call is its own trace row and
   * the newest is what the panel shows beside the run, so this reads as a replacement rather
   * than as a list. Free, and it never throws.
   */
  status(text: string): void;
  /**
   * Capture the game canvas as a PNG, and file it against the run so a reader can see what the
   * script saw. The trace gets a row carrying the image's id and its label; the bytes stay in
   * the Worker, because a Blob in a trace row would be persisted per run in IndexedDB and
   * copied to Claude as text.
   *
   * It reports rather than throws, per S3: a client with no canvas yet, or one that has been
   * torn down, resolves `null` and says so in the trace at `warn`. `c.sdk.screenshot()` is the
   * same capability with the older, harsher contract, and it rejects.
   *
   * A run keeps its last eight images and nothing else; the ninth drops the oldest, and they
   * are all released when the run ends. There is no persisted store yet (P6 is entry 7), so an
   * image outlives neither the run nor the tab.
   */
  screenshot(opts?: ScreenshotOpts): Promise<Blob | null>;
  /**
   * Scratch space that survives between task runs inside one run, and nothing else. It is a
   * plain Map, so `get` is `unknown | undefined`, and it is gone when the run ends. Nothing
   * here is persisted; per-script storage is not built yet.
   */
  memory: Map<string, unknown>;
  /**
   * The abort signal of the task running right now. Read it, never cache it: the runner swaps
   * the controller between tasks, so a copy taken at task start misses your own task's stop.
   * A snapshot read, no round trip.
   */
  signal: AbortSignal;
  /**
   * Getting somewhere that is not in the current scene. It resolves the target, takes a declared
   * atlas route where one exists, and splits the rest into legs of at most 52 tiles, which is
   * what one built scene can be pathed across. `c.bot.walkTo` is the local walker underneath it.
   * Distances here are tiles, measured Chebyshev.
   */
  travel: {
    /**
     * Walk to a tile, a named landmark or an atlas cluster, and report how it went. It reports
     * rather than throws: `success` is false with a reason of `unreachable` when no path or no
     * atlas entry could be found, `needs_route` when the gap needs a route nobody has declared,
     * `timeout` when the budget ran out, and `aborted` when the run was stopped. The result also
     * carries `legs` and `tiles`, both counts. It is many round trips, one per leg, and it can
     * take minutes: the defaults are 120000 milliseconds and 24 legs. An omitted `level` on a
     * tile means the plane the player is already on.
     */
    to(target: TravelTarget, opts?: TravelOpts): Promise<TravelResult>;
    /** Straight line, cheap, for a `when` predicate. Infinity when the target cannot be resolved. */
    distanceTo(target: TravelTarget): number;
  };
  /** Where the nearest resource of a kind is: the scene, then the atlas, then a sweep. */
  find: {
    /**
     * The nearest resource of `kind`, searched in the scene, then the atlas, then a sweep.
     * `FoundTarget.via` says which layer answered. Null when no layer found one.
     * Costs a client round trip when the scene rescan runs. Distances are tiles, Chebyshev.
     */
    nearest(kind: ResourceKind, opts?: FindOpts): Promise<FoundTarget | null>;
    /**
     * The atlas layer on its own: the nearest recorded cluster of `kind`, without reading the
     * scene and without walking anywhere. Null when the atlas has not loaded yet or records no
     * cluster of that kind within `opts.maxDistance`. A lookup in memory, no round trip, so it
     * is cheap enough to call from a task's `when`. Distances are tiles, Chebyshev.
     */
    nearestAtlas(kind: ResourceKind, opts?: FindOpts): AtlasCluster | null;
    /**
     * The sweep layer on its own: walk a ring or a block of scan points around the anchor and
     * rescan at each, for a resource neither the scene nor the atlas could place. Null when the
     * walk finished having found nothing, when the tile budget ran out, or when the run was
     * stopped. It walks, so it is a round trip per point and it can take minutes;
     * `opts.maxTiles` is a count of tiles walked, 200 by default.
     */
    sweep(kind: ResourceKind, opts?: SweepOpts & FindOpts): Promise<FoundTarget | null>;
    /**
     * The atlas landmark with this id, or null when the atlas has not loaded or records no such
     * id. A lookup in memory, no round trip. Landmark ids are the atlas's own, not display
     * names; `c.travel.to({ landmark: id })` takes the same string.
     */
    landmark(id: string): AtlasLandmark | null;
  };
  /**
   * Read, or set, the tile the run treats as home. Recovery walks back here.
   *
   * The compliant overload is declared FIRST here, the other way round from `log` and
   * `clickThrough`, and deliberately: a bare `c.anchor()` matches whichever arm comes first, so
   * declaring the deprecated one first would make the plain read resolve to a `@deprecated`
   * signature and strike it through in every editor. Nothing reads `Parameters<>` off this
   * member, because neither arm takes an options bag, so nothing depends on the other order.
   *
   * That order is a trap for whatever renders this member into the reference: `Parameters<T>`
   * and any traversal that keeps the LAST declaration read the deprecated arm, so a renderer
   * that picks one signature would publish `anchor(x, z)` as the recommended form. It has to
   * emit both arms and mark the second one deprecated.
   */
  anchor(tile?: TileLike): Tile;
  /** @deprecated Use `anchor({ x, z })`. Removed in api 3. */
  anchor(x?: number, z?: number): Tile;
  /** What the health monitor has seen, for a script that wants to handle a condition itself. */
  health: {
    /** True while this condition is the one waiting for a recovery. A task claims it with `when`. */
    is(condition: HealthCondition): boolean;
    /**
     * The most recent condition the monitor raised, or null when it has raised none this run. A
     * snapshot read, no round trip. The event says what was seen and when (`at` is epoch
     * milliseconds), not what was done about it.
     */
    last(): HealthEvent | null;
    /** A script handler reporting that it dealt with the condition itself. */
    recovered(condition: HealthCondition): void;
  };
}
