// web/src/frame/pairing.ts -- the frame-level pairing store (plan ruling R10).
//
// The `agentTokens` listener used to be created in the Claude panel's mount() and destroyed in
// its unmount(), so with the panel shut nothing in the frame knew whether Claude was paired. The
// co-pilot bar (Task 14) needs that truth with every panel closed, and the Events feed needs a
// pairing producer that runs for the whole session rather than while somebody is looking at it.
// The listener therefore lives here, started once per uid by frame/singletons.ts; the Claude
// panel and the bar are consumers.
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export interface AgentTokenRow {
  id: string;
  label: string;
  createdAt: number;
  lastSeenAt: number | null;
  revokedAt: number | null;
}

/** A token seen inside this window is driving something right now. Lifted from connect.ts:37. */
export const SEEN_RECENTLY_MS = 60_000;

export type PairingState = 'unpaired' | 'paired-stale' | 'paired-live';

export interface PairingDeps {
  /** The Firestore listener. Injectable so a test can push snapshots without an emulator. */
  subscribeSessions?(uid: string, cb: (rows: AgentTokenRow[]) => void): () => void;
  now?(): number;
}

export interface PairingStore {
  state(): PairingState;
  sessions(): readonly AgentTokenRow[];
  /** Fires on every snapshot, not only on a state change: the Claude panel re-renders rows. */
  subscribe(fn: (state: PairingState) => void): () => void;
  start(uid: string): void;
  stop(): void;
}

interface AgentTokenDoc { label: string; createdAt: number; lastSeenAt: number | null; revokedAt: number | null }

/** `defaultSubscribeSessions` from panels/connect.ts:44-53, moved here unchanged. */
export function defaultSubscribeSessions(uid: string, cb: (rows: AgentTokenRow[]) => void): () => void {
  const q = query(collection(db, 'agentTokens'), where('uid', '==', uid));
  return onSnapshot(q, snap => {
    const rows: AgentTokenRow[] = snap.docs.map(d => {
      const data = d.data() as AgentTokenDoc;
      return { id: d.id, label: data.label, createdAt: data.createdAt, lastSeenAt: data.lastSeenAt, revokedAt: data.revokedAt };
    });
    cb(rows);
  });
}

/** `activeRows()` at connect.ts:103-105, and the liveness test at :153, lifted verbatim. */
function deriveState(rows: readonly AgentTokenRow[], now: number): PairingState {
  const active = rows.filter(r => r.revokedAt === null);
  if (active.length === 0) return 'unpaired';
  return active.some(r => r.lastSeenAt !== null && now - r.lastSeenAt <= SEEN_RECENTLY_MS)
    ? 'paired-live' : 'paired-stale';
}

export function createPairingStore(deps: PairingDeps = {}): PairingStore {
  const subscribeSessions = deps.subscribeSessions ?? defaultSubscribeSessions;
  const now = deps.now ?? (() => Date.now());
  const subs = new Set<(state: PairingState) => void>();
  let rows: AgentTokenRow[] = [];
  let unsubscribe: (() => void) | null = null;
  let startedUid: string | null = null;

  function stop(): void {
    startedUid = null;
    unsubscribe?.();
    unsubscribe = null;
    rows = [];
  }

  return {
    // Derived at read time rather than at snapshot time, because liveness is a function of the
    // clock: a token last seen 61 seconds ago is stale even though no snapshot has arrived to
    // say so, and the bar reads this on every repaint.
    state: () => deriveState(rows, now()),
    sessions: () => rows,
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    start(uid) {
      if (startedUid === uid) return;
      stop();
      startedUid = uid;
      unsubscribe = subscribeSessions(uid, next => {
        // A snapshot delivered after stop() belongs to the account that just signed out.
        if (startedUid === null) return;
        rows = next;
        const state = deriveState(rows, now());
        for (const fn of [...subs]) fn(state);
      });
    },
    stop
  };
}
