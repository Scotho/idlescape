import type { RunSummary, TraceEvent } from './types';

/** Persistent, capped log of script runs and their trace events. */
export interface RunHistory {
  /** Store (or replace) a run and its events, then trim the oldest runs past the cap. */
  put(summary: RunSummary, events: TraceEvent[]): Promise<void>;
  /**
   * Add events to a run already in the store; a no-op for an unknown run id. An event whose
   * `seq` is already stored **replaces** it: `trace.ts` re-emits a coalesced xp or item row
   * under the seq it already had, and appending that would double the delta in the stored
   * trace and put it at odds with the summary's own totals.
   */
  appendEvents(runId: string, events: TraceEvent[]): Promise<void>;
  /** Newest first, capped at `limit` (defaults to the store cap). */
  list(limit?: number): Promise<RunSummary[]>;
  get(runId: string): Promise<{ summary: RunSummary; events: TraceEvent[] } | null>;
  clear(): Promise<void>;
}

export interface RunHistoryOptions {
  dbName?: string;
  /** How many summaries are kept. Spec decision 6: 200. */
  summaryCap?: number;
  /** How many of those keep their trace, newest first. Spec decision 6: 50. */
  traceCap?: number;
}

const RUNS = 'runs';
const EVENTS = 'events';
const BY_STARTED_AT = 'startedAt';
const DEFAULT_DB = 'idlescape-runs';
const DEFAULT_SUMMARY_CAP = 200;
const DEFAULT_TRACE_CAP = 50;
/**
 * Schema 2 (SP4b Task 11). A v1 row is missing five fields `RunSummary` now requires, and they
 * are filled on the way out by `withDefaults` rather than by rewriting the store: an upgrade
 * transaction that rewrites 200 rows is one that can fail halfway and leave the history in a
 * state nothing has a name for. Nothing about the stores themselves changed, so the upgrade
 * creates them if they are absent and otherwise does nothing at all.
 */
const SCHEMA = 2;

interface EventsRecord {
  runId: string;
  events: TraceEvent[];
}

/** Promise wrapper for a single IndexedDB request. */
function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

/** Promise that settles when a transaction commits (or fails/aborts). */
function settled(t: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error ?? new Error('IndexedDB transaction failed'));
    t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function tx(db: IDBDatabase, stores: string[], mode: IDBTransactionMode): IDBTransaction {
  return db.transaction(stores, mode);
}

function openDatabase(dbName: string): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is not available'));
  const r = indexedDB.open(dbName, SCHEMA);
  r.onupgradeneeded = () => {
    const db = r.result;
    if (!db.objectStoreNames.contains(RUNS)) {
      db.createObjectStore(RUNS, { keyPath: 'runId' }).createIndex(BY_STARTED_AT, 'startedAt');
    }
    if (!db.objectStoreNames.contains(EVENTS)) {
      db.createObjectStore(EVENTS, { keyPath: 'runId' });
    }
  };
  return req(r);
}

/**
 * A row from either schema, as a reader wants it. The five fields Task 11 added are required on
 * `RunSummary` precisely so that nothing above this line has to ask how old a row is; this is
 * the one place that question is answered, and both reads go through it.
 */
function withDefaults(row: RunSummary): RunSummary {
  return {
    ...row,
    characterName: row.characterName ?? null,
    itemsDelta: row.itemsDelta ?? {},
    tilesTravelled: row.tilesTravelled ?? 0,
    recoveries: row.recoveries ?? {}
  };
}

/**
 * The two-pass retention of spec decision 6, inside the caller's transaction. Every request is
 * issued from an event handler so the transaction never idles and auto-commits mid-trim.
 *
 * Pass one drops the summaries past `summaryCap`, oldest first, taking their events with them.
 * Pass two walks back from the newest, skips the `traceCap` runs that keep their trace, and
 * drops the events of everything behind them: those runs stay listable and stay openable, and
 * their report is built from the summary alone. The two passes overlap on the rows pass one is
 * deleting, which costs nothing - deleting an events record twice is not an error.
 */
function trim(t: IDBTransaction, summaryCap: number, traceCap: number): void {
  const runs = t.objectStore(RUNS);
  const events = t.objectStore(EVENTS);
  const count = runs.count();
  count.onsuccess = () => {
    let excess = count.result - summaryCap;
    if (excess > 0) {
      const cursor = runs.index(BY_STARTED_AT).openCursor(null, 'next');
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c || excess <= 0) return;
        events.delete(c.primaryKey);
        c.delete();
        excess -= 1;
        c.continue();
      };
    }
    if (count.result <= traceCap) return;
    const keep = runs.index(BY_STARTED_AT).openCursor(null, 'prev');
    let skipped = false;
    keep.onsuccess = () => {
      const c = keep.result;
      if (!c) return;
      // `advance` counts from where the cursor stands, so one hop of `traceCap` from the newest
      // row lands on the first run that has to give its trace up.
      if (!skipped) {
        skipped = true;
        if (traceCap > 0) { c.advance(traceCap); return; }
      }
      events.delete(c.primaryKey);
      c.continue();
    };
  };
}

export function createRunHistory(opts: RunHistoryOptions = {}): RunHistory {
  const dbName = opts.dbName ?? DEFAULT_DB;
  const summaryCap = Math.max(1, opts.summaryCap ?? DEFAULT_SUMMARY_CAP);
  const traceCap = Math.max(0, Math.min(summaryCap, opts.traceCap ?? DEFAULT_TRACE_CAP));
  let opening: Promise<IDBDatabase> | null = null;
  const db = (): Promise<IDBDatabase> => (opening ??= openDatabase(dbName));

  return {
    async put(summary, events) {
      const t = tx(await db(), [RUNS, EVENTS], 'readwrite');
      t.objectStore(RUNS).put(summary);
      t.objectStore(EVENTS).put({ runId: summary.runId, events } satisfies EventsRecord);
      trim(t, summaryCap, traceCap);
      await settled(t);
    },

    async appendEvents(runId, events) {
      if (events.length === 0) return;
      const t = tx(await db(), [EVENTS], 'readwrite');
      const store = t.objectStore(EVENTS);
      const existing: IDBRequest<EventsRecord | undefined> = store.get(runId);
      existing.onsuccess = () => {
        const rec = existing.result;
        if (!rec) return;
        // A Map keyed on seq: a replacement keeps the row's place in the trace and a new event
        // lands at the end, so the stored order stays the order the run produced.
        const bySeq = new Map(rec.events.map(e => [e.seq, e]));
        for (const e of events) bySeq.set(e.seq, e);
        store.put({ runId, events: [...bySeq.values()] } satisfies EventsRecord);
      };
      await settled(t);
    },

    async list(limit = summaryCap) {
      const t = tx(await db(), [RUNS], 'readonly');
      const out: RunSummary[] = [];
      const cursor = t.objectStore(RUNS).index(BY_STARTED_AT).openCursor(null, 'prev');
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c || out.length >= limit) return;
        out.push(withDefaults(c.value as RunSummary));
        c.continue();
      };
      await settled(t);
      return out;
    },

    async get(runId) {
      const t = tx(await db(), [RUNS, EVENTS], 'readonly');
      const summaryReq: IDBRequest<RunSummary | undefined> = t.objectStore(RUNS).get(runId);
      const eventsReq: IDBRequest<EventsRecord | undefined> = t.objectStore(EVENTS).get(runId);
      const [summary, rec] = await Promise.all([req(summaryReq), req(eventsReq)]);
      if (!summary) return null;
      return { summary: withDefaults(summary), events: rec?.events ?? [] };
    },

    async clear() {
      const t = tx(await db(), [RUNS, EVENTS], 'readwrite');
      t.objectStore(RUNS).clear();
      t.objectStore(EVENTS).clear();
      await settled(t);
    },
  };
}
