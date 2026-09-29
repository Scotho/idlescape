// web/src/bank/store.ts -- the single source of truth the bank window renders.
//
// Two engine rulings shape this file (engine-custom/PATCHES.md, "The store"):
//
// 1. The version a successful apply returns is immediately reusable as the next
//    expectedVersion. The tick after an apply consumes its dirt without bumping, so refetching
//    to "learn the real version" would be wasted work and would race an in-game change.
// 2. ANY apply puts the owner into push-out mode for one tick: the store's tab layout is
//    written OUT to every online character instead of read in, and an in-game tab drag made in
//    that tick loses. A caller applying on most ticks holds the account there permanently, so
//    ops are coalesced into at most one apply per FLUSH_MS (two world ticks).
import { friendlyBankError, type BankApi, type OpsResult } from './api';
import type { BankStream } from './stream';
import { expandSlots, insertCrossesTab, usedOf } from './layout';
import { clampOp, endpointsInContainer, isNoOp, needsRead, previewOf } from './storeOps';
import { FLUSH_MS, MAX_OPS_PER_BATCH, POLL_MS, type BankItems, type BankOp, type ObjInfo } from './types';

export interface BankState {
  version: number;
  capacity: number;
  tabs: number[];
  items: BankItems;
  /** Highest occupied slot + 1. What the capacity counter and the tab invariant use. */
  used: number;
  /**
   * A read is in the air. INTERNAL to the store, and set without notifying subscribers: nothing
   * outside this module renders it, and its only reader is the onVersion guard below. It used to
   * be emitted, which cost a full replaceChildren of the item pane AND the tab strip on every
   * single poll, twice per refresh, for a flag with no pixels.
   */
  loading: boolean;
  /** The event stream is connected and delivering. Polling continues regardless. */
  live: boolean;
  /**
   * Ops applied locally but not yet accepted by the engine. Maintained here at five sites and
   * part of the state contract, but NOT YET RENDERED: no module outside this file reads it. The
   * spec asks for no pending badge, so it is deliberately kept and deliberately not drawn - it is
   * the number a future "saving..." affordance would need, and it is not dead.
   */
  pending: number;
  error: string | null;
}

export interface BankStoreDeps {
  api: BankApi;
  /** Built by the caller so the store can be tested without a network. */
  createStream(handlers: { onVersion(version: number): void; onHealth(healthy: boolean): void }): BankStream;
  info(obj: number): ObjInfo | null;
  notify(message: string, kind?: 'info' | 'error'): void;
  schedule?: (fn: () => void, ms: number) => number;
  cancel?: (handle: number) => void;
  flushMs?: number;
  pollMs?: number;
}

/**
 * What submit() actually did with the op it was handed. The store is entitled to change the op
 * (it clamps both endpoints onto the last occupied slot) or to refuse it outright (a cross-tab
 * insert), and neither decision used to come back: the keyboard layer announced the slot the KEY
 * asked for into a role=status live region, which is a lie to assistive tech whenever the store
 * disagreed. Every announcement is now derived from this.
 */
export type SubmitOutcome =
  /** Queued. `op` carries the endpoints the store really used, after the clamp. */
  | { kind: 'applied'; op: BankOp }
  /** Nothing was queued and nothing moved. `message` is the line the player was toasted with. */
  | { kind: 'refused'; message: string }
  /** Nothing to do and nothing to say: a move onto its own slot, or a store that is not running. */
  | { kind: 'dropped' };

export interface BankStore {
  state(): BankState;
  subscribe(fn: (state: BankState) => void): () => void;
  /** Subscribes to the stream FIRST, then does the first GET. */
  start(): void;
  stop(): void;
  refresh(): Promise<void>;
  /** Applies the op locally where it can be previewed and queues it for the next flush. The
   *  outcome says what was really done, because it is not always what was asked for. */
  submit(op: BankOp): SubmitOutcome;
  flush(): Promise<void>;
}

const CROSS_TAB = 'Drag onto a tab to move an item between tabs.';
const CHANGED_ELSEWHERE = 'Bank changed elsewhere.';
/** The engine's default bank size, replaced by the snapshot's own capacity on the first read. */
const DEFAULT_CAPACITY = 240;

/** What one pass of the flush loop did, so the caller knows whether to follow it with a read. */
type FlushOutcome = 'idle' | 'deferred' | 'applied' | 'failed' | 'stopped';

/** An unexpected throw carries an internal message; the player gets the generic line instead. */
const GENERIC = friendlyBankError('');

function messageOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : GENERIC;
}

export function createBankStore(deps: BankStoreDeps): BankStore {
  const schedule = deps.schedule ?? ((fn: () => void, ms: number) => window.setTimeout(fn, ms));
  const cancel = deps.cancel ?? ((handle: number) => window.clearTimeout(handle));
  const flushMs = deps.flushMs ?? FLUSH_MS;
  const pollMs = deps.pollMs ?? POLL_MS;

  let state: BankState = {
    version: -1,
    capacity: DEFAULT_CAPACITY,
    items: new Array<null>(DEFAULT_CAPACITY).fill(null),
    tabs: [],
    used: 0,
    loading: false,
    live: false,
    pending: 0,
    error: null
  };
  const listeners = new Set<(state: BankState) => void>();
  const queue: BankOp[] = [];
  let flushTimer: number | null = null;
  let pollTimer: number | null = null;
  let inFlight = false;
  let running = false;
  /** Set by an op whose result only the engine can compute. Cleared by the read that follows. */
  let readAfterApply = false;
  let stream: BankStream | null = null;
  /**
   * The teardown fence. `running` fences the timers, but not the promises already in the air:
   * without this, a read or an apply that resolves after stop() still emits into a torn-down
   * store, still raises a toast for a window that is gone, and still issues a follow-up GET.
   * Every await captures the epoch before it and re-checks it after. stop() increments it, so a
   * result belonging to a closed window is recognised and dropped. Internal: it is not part of
   * BankState and never reaches a subscriber.
   */
  let epoch = 0;
  /**
   * The read-ordering token, distinct from the epoch because it moves within one session. The
   * store issues reads from three places (the poll, the failure re-read, the readAfterApply
   * follow-up) and two of them run with `inFlight` already cleared and the queue already
   * emptied, so the poll's own guard cannot see them. Without a token two GETs can cross and the
   * older response wins, leaving a stale layout AND a stale `state.version`, which then sends
   * the wrong expectedVersion and earns a 409 for a legal drag. Only the most recently issued
   * read may commit.
   */
  let reads = 0;

  /**
   * State the view does not draw, set without a render pass. Only `loading` belongs here: it
   * exists for the onVersion guard alone, and giving it a frame of its own made every 10 s poll
   * rebuild the whole window twice. The flag's internal semantics are unchanged; it simply no
   * longer wakes anybody.
   */
  function setQuietly(patch: Partial<BankState>): void {
    state = { ...state, ...patch };
  }

  /**
   * Raised to the same trust level as emit() below. `notify` is the caller's toast host, and a
   * throw from it used to reject flushOnce() - which every caller reaches as `void flushOnce()`,
   * so the throw became an unhandled rejection AND skipped the recovery re-read that follows it,
   * leaving the pane showing an optimistic layout the engine had already refused.
   */
  function notify(message: string, kind?: 'info' | 'error'): void {
    try { deps.notify(message, kind); } catch { /* the view's failure is the view's problem */ }
  }

  /** Same rule for the object table: a throwing info() inside a sort preview would escape out of
   *  submit() and into whichever key or pointer handler asked for it. */
  function info(obj: number): ObjInfo | null {
    try { return deps.info(obj); } catch { return null; }
  }

  function emit(patch: Partial<BankState>): void {
    state = { ...state, ...patch };
    for (const listener of listeners) {
      // A subscriber that throws must not take the store's own state machine with it. The patch
      // above has already landed, so `state` is correct either way; letting the throw escape
      // would strand whichever flag this emit was setting (`loading` above all, which the
      // onVersion guard below then reads as "a read is in flight" for the rest of the session).
      try { listener(state); } catch { /* the view's failure is the view's problem */ }
    }
  }

  async function refresh(): Promise<void> {
    const mine = epoch;
    setQuietly({ loading: true });
    let snapshot;
    // Taken on the line before the request, not before the loading flag: the token orders reads
    // by the moment they are ISSUED. Taking it earlier let a refresh() called synchronously from
    // inside a subscriber hold the higher token while the outer read reached the network first,
    // so the outer, later response was the one discarded.
    const read = ++reads;
    try {
      snapshot = await deps.api.get();
    } catch (err) {
      // Torn down, or overtaken by a later read that already owns `loading` and the state.
      if (epoch !== mine || read !== reads) return;
      // A failed load must never read as "your bank is empty": keep whatever we had and say so.
      emit({ loading: false, error: messageOf(err) });
      return;
    }
    if (epoch !== mine || read !== reads) return;
    const items = expandSlots(snapshot);
    emit({
      version: snapshot.version,
      capacity: snapshot.capacity,
      tabs: [...snapshot.tabs],
      items,
      used: usedOf(items),
      loading: false,
      error: null
    });
  }

  function armPoll(): void {
    if (pollTimer !== null) { cancel(pollTimer); pollTimer = null; }
    if (!running) return;
    // Unconditional, even while the stream is healthy: the engine's change hook is fire and
    // forget with a 2 s timeout and no retry, and a world with no IDLESCAPE_HOOK_URL never
    // posts at all. Polling is the only delivery this bank actually has.
    pollTimer = schedule(() => {
      pollTimer = null;
      // A poll landing mid-drag would overwrite the optimistic view with the pre-op layout and
      // leave it wrong until the next poll, so it waits for the local queue to drain first.
      if (queue.length > 0 || inFlight) { armPoll(); return; }
      void refresh().finally(armPoll);
    }, pollMs);
  }

  function scheduleFlush(): void {
    if (flushTimer !== null || !running) return;
    flushTimer = schedule(() => { flushTimer = null; void flushOnce(); }, flushMs);
  }

  async function flushOnce(): Promise<FlushOutcome> {
    if (flushTimer !== null) { cancel(flushTimer); flushTimer = null; }
    if (queue.length === 0) return 'idle';
    // A second flush while one is in the air would send the same expectedVersion twice. Re-arm
    // the window instead, so ops submitted mid-apply are never stranded in the queue.
    if (inFlight) { scheduleFlush(); return 'deferred'; }

    const batch = queue.splice(0, MAX_OPS_PER_BATCH);
    const mine = epoch;
    let result: OpsResult;
    inFlight = true;
    try {
      result = await deps.api.ops(state.version, batch);
    } catch {
      // ops() is contracted never to reject, but it can still throw on a malformed 200 body (a
      // proxy answering HTML, say). Clearing inFlight anywhere but a finally would wedge the
      // flush loop for the rest of the session with nothing on screen to say why.
      result = { ok: false, kind: 'error', message: GENERIC };
    } finally {
      // Only for the session this batch belongs to. stop() already cleared the flag, and a new
      // session may have started an apply of its own that this one must not un-flag.
      if (epoch === mine) inFlight = false;
    }
    // The bank window this batch was sent from has been torn down. Its result is nobody's now:
    // no emit into a dead store, no toast over a closed window, no follow-up read.
    if (epoch !== mine) return 'stopped';

    if (result.ok) {
      // Ruling 1: this number is current and immediately reusable.
      emit({ version: result.version, pending: queue.length });
      if (queue.length > 0) { scheduleFlush(); return 'applied'; }
      if (readAfterApply) { readAfterApply = false; await refresh(); }
      return 'applied';
    }

    // Both failures drop the queue rather than replaying it: the ops were computed against a
    // layout the engine no longer has, and re-issuing them blind would move the wrong slots.
    queue.length = 0;
    readAfterApply = false;
    if (result.kind === 'conflict') {
      // Take the version the server handed back BEFORE re-reading. If the read then fails, the
      // next flush would otherwise send the same stale expectedVersion and earn a second 409,
      // and a second "Bank changed elsewhere", for a perfectly legal drag.
      emit({ pending: 0, version: result.version });
      notify(CHANGED_ELSEWHERE);
    } else {
      emit({ pending: 0 });
      notify(result.message, 'error');
    }
    await refresh();
    return 'failed';
  }

  return {
    state: () => state,
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },

    start() {
      if (running) return;
      running = true;
      // The session these handlers belong to. stop() bumps the epoch, so a stream that keeps
      // calling after it was stopped cannot reach the session that replaced it.
      const mine = epoch;
      // Subscribe BEFORE the first GET: a change landing between the two would otherwise be
      // missed by the stream and wait out a whole poll interval.
      stream = deps.createStream({
        onVersion: version => {
          if (epoch !== mine) return;
          // A newer version arriving while local ops are outstanding is this client's own apply
          // coming back around; refetching there would drop the optimistic view on the floor.
          // `loading` is deliberately in this list, and it is the one real cost of the guard: a
          // change made after an in-flight GET reached the server but before it returned is
          // dropped and waits out a full poll interval. Accepted, because the alternative is a
          // second concurrent GET on every window open for a race that the poll already closes.
          if (state.loading || inFlight || queue.length > 0) return;
          if (version > state.version) void refresh();
        },
        // stop() below stops the stream while `epoch` has already moved, so the one synchronous
        // onHealth(false) the stream fires on teardown lands here and is dropped. That is the
        // stream owner's deliberate signal, not a live event, and stop() emits live: false anyway.
        onHealth: healthy => { if (epoch === mine) emit({ live: healthy }); }
      });
      stream.start();
      armPoll();
      void refresh();
    },

    stop() {
      running = false;
      // Fence everything already in the air before touching anything else: an apply or a read
      // that resolves after this point belongs to a window that no longer exists.
      epoch++;
      // Cleared here as well as in the flush's finally. Left set, it would put every flushOnce()
      // after the next start() into the deferred branch, which re-arms its own window forever:
      // the player drags, closes the bank mid-POST, reopens, and nothing ever reaches the server
      // again. A hung fetch has no timeout in api.ts, so that state can outlive the session.
      inFlight = false;
      // Tearing the store down must tear the stream down: the server caps concurrent streams at
      // four per owner, and a reader left running holds one of those slots for the session.
      stream?.stop();
      stream = null;
      if (flushTimer !== null) { cancel(flushTimer); flushTimer = null; }
      if (pollTimer !== null) { cancel(pollTimer); pollTimer = null; }
      queue.length = 0;
      readAfterApply = false;
      // The version goes back to "no read yet". The store object outlives a sign-out (main.ts
      // builds one per PAGE, not per account), and a version left behind is the previous
      // account's: it would be sent as the next expectedVersion, and frame/eventProducers.ts's
      // bank producer would compare the new account's first read against it and announce it.
      emit({ pending: 0, live: false, loading: false, version: -1 });
    },

    refresh,

    submit(op): SubmitOutcome {
      // The store only owns a queue between start() and stop(); an op arriving outside that
      // window has no flush timer and no teardown behind it, so it is dropped rather than left.
      if (!running) return { kind: 'dropped' };
      if (!endpointsInContainer(op, state.capacity)) {
        const message = friendlyBankError('bad_slot');
        notify(message, 'error');
        return { kind: 'refused', message };
      }
      const move = clampOp(op, state.used);
      if (isNoOp(move)) return { kind: 'dropped' };
      if (move.op === 'insert' && insertCrossesTab(state.tabs, move.from, move.to)) {
        notify(CROSS_TAB);
        return { kind: 'refused', message: CROSS_TAB };
      }
      const items = previewOf(move, state, info);
      if (items) emit({ items, used: usedOf(items) });
      queue.push(move);
      if (needsRead(move)) readAfterApply = true;
      emit({ pending: queue.length });
      // A drag can wait for its neighbours: coalescing is the whole point of ruling 2, and a
      // burst becomes one apply. A sort or a tab change is a single deliberate action with
      // nothing to coalesce with, so it goes now.
      if (move.op === 'swap' || move.op === 'insert') scheduleFlush();
      else void flushOnce();
      // The CLAMPED op, not the one that came in: the caller announces from this.
      return { kind: 'applied', op: move };
    },

    async flush() { await flushOnce(); }
  };
}
