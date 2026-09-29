import { describe, expect, test } from 'vitest';
import { createRunHistory } from './history';
import type { RunSummary, TraceEvent } from './types';

/**
 * A fresh database per test. `fake-indexeddb` keeps one store per name for the whole file, and
 * the migration tests each need a database that has never been opened at version 2.
 */
let n = 0;
const unique = (): string => `runs-test-${++n}`;

const sum = (id: string, at: number, o: Partial<RunSummary> = {}): RunSummary => ({
  runId: id, scriptId: 's', scriptName: 'S', version: 1, source: 'library', startedBy: 'test',
  characterId: null, characterName: null, params: {}, status: 'done', startedAt: at,
  endedAt: at + 10, durationMs: 10, xpGained: {}, lastTask: null, summary: '',
  itemsDelta: {}, tilesTravelled: 0, recoveries: {}, ...o
});
const ev = (seq: number): TraceEvent => ({ seq, at: seq, kind: 'status', text: `e${seq}` });

/**
 * A v1 row, exactly as builds before Task 11 wrote it: no `characterName`, no `itemsDelta`, no
 * `tilesTravelled`, no `recoveries`. Written through a hand-opened version 1 database so the
 * upgrade path is the real one and not a v2 store with fields deleted.
 */
function seedV1(dbName: string, count: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(dbName, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      db.createObjectStore('runs', { keyPath: 'runId' }).createIndex('startedAt', 'startedAt');
      db.createObjectStore('events', { keyPath: 'runId' });
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const t = db.transaction(['runs', 'events'], 'readwrite');
      for (let i = 0; i < count; i++) {
        t.objectStore('runs').put({
          runId: `v1-${i}`, scriptId: 's', scriptName: 'S', version: 1, source: 'library',
          startedBy: 'test', characterId: null, params: {}, status: 'done', startedAt: i,
          endedAt: i + 1, durationMs: 1, xpGained: { Woodcutting: 5 }, lastTask: null, summary: 'old'
        });
        t.objectStore('events').put({ runId: `v1-${i}`, events: [ev(1)] });
      }
      t.oncomplete = () => { db.close(); resolve(); };
      t.onerror = () => reject(t.error);
    };
  });
}

/** What version the database is actually at, so the upgrade is a fact rather than an intention. */
function versionOf(dbName: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(dbName);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => { const v = open.result.version; open.result.close(); resolve(v); };
  });
}

describe('run history', () => {
  test('stores, lists newest first, and returns events', async () => {
    const h = createRunHistory({ dbName: unique() });
    await h.put(sum('a', 1), [ev(1)]);
    await h.put(sum('b', 2), []);
    expect((await h.list()).map(r => r.runId)).toEqual(['b', 'a']);
    expect((await h.get('a'))?.events).toHaveLength(1);
    await h.appendEvents('a', [ev(2)]);
    expect((await h.get('a'))?.events).toHaveLength(2);
  });

  // `trace.ts` re-emits a coalesced xp or item row under the seq it already had, and the
  // recorder pulls its flush cursor back to it, so the same seq reaches this store twice.
  test('an event that arrives again under a seq already stored replaces it in place', async () => {
    const h = createRunHistory({ dbName: unique() });
    const xp = (seq: number, delta: number): TraceEvent => ({ seq, at: seq, kind: 'xp', skill: 'Woodcutting', delta });
    await h.put(sum('a', 1), [xp(1, 25), ev(2)]);
    await h.appendEvents('a', [xp(1, 60), ev(3)]);
    const stored = (await h.get('a'))!.events;
    expect(stored.map(e => e.seq)).toEqual([1, 2, 3]);
    expect(stored[0]).toMatchObject({ kind: 'xp', delta: 60 });
  });

  test('summaries are kept to the summary cap and traces to the trace cap', async () => {
    const history = createRunHistory({ dbName: unique(), summaryCap: 8, traceCap: 3 });
    for (let i = 0; i < 11; i++) await history.put(sum(`r${i}`, i), [ev(i + 1)]);
    const list = await history.list(1000);
    expect(list).toHaveLength(8);
    // The newest three keep their events; the five summaries behind them lose the trace but
    // stay readable, and the three oldest are gone entirely.
    expect((await history.get('r10'))!.events).toHaveLength(1);
    expect((await history.get('r8'))!.events).toHaveLength(1);
    expect((await history.get('r7'))!.events).toEqual([]);
    expect((await history.get('r3'))!.events).toEqual([]);
    expect(await history.get('r2')).toBeNull();
  });

  test('the shipped caps are 200 summaries and 50 traces', async () => {
    const history = createRunHistory({ dbName: unique() });
    // 205 rows through the real store: the two caps have to be the defaults, not the test's.
    for (let i = 0; i < 205; i++) await history.put(sum(`r${i}`, i), [ev(i + 1)]);
    expect(await history.list(1000)).toHaveLength(200);
    expect((await history.get('r155'))!.events).toHaveLength(1);
    expect((await history.get('r154'))!.events).toEqual([]);
    expect(await history.get('r4')).toBeNull();
    expect(await history.get('r5')).not.toBeNull();
  });

  test('a v1 database is migrated without dropping a single summary', async () => {
    const name = unique();
    await seedV1(name, 60);
    const history = createRunHistory({ dbName: name, summaryCap: 200, traceCap: 50 });
    expect(await history.list(1000)).toHaveLength(60);
    expect(await versionOf(name)).toBe(2);
    // The upgrade rewrote nothing, so what v1 wrote is still there to read.
    expect((await history.get('v1-59'))!.summary.xpGained).toEqual({ Woodcutting: 5 });
    expect((await history.get('v1-0'))!.events).toHaveLength(1);
  });

  test('a summary written by an older build reads back with the new fields defaulted', async () => {
    const name = unique();
    await seedV1(name, 1);
    const history = createRunHistory({ dbName: name });
    const [row] = await history.list(1);
    expect(row.itemsDelta).toEqual({});
    expect(row.recoveries).toEqual({});
    expect(row.tilesTravelled).toBe(0);
    expect(row.characterName).toBeNull();
    // `get` reads through the same normaliser as `list`; a reader must not have to know which.
    expect((await history.get('v1-0'))!.summary.tilesTravelled).toBe(0);
  });

  test('the defaults never overwrite what a row actually carries', async () => {
    const h = createRunHistory({ dbName: unique() });
    await h.put(sum('a', 1, {
      characterName: 'Zezima', itemsDelta: { 1511: 4 }, tilesTravelled: 37,
      recoveries: { 'dialog-stuck': 2 }, failReason: 'stuck'
    }), []);
    const [row] = await h.list(1);
    expect(row).toMatchObject({
      characterName: 'Zezima', itemsDelta: { 1511: 4 }, tilesTravelled: 37,
      recoveries: { 'dialog-stuck': 2 }, failReason: 'stuck'
    });
  });

  test('clear empties both stores', async () => {
    const name = unique();
    const h = createRunHistory({ dbName: name });
    await h.put(sum('a', 1), [ev(1)]);
    await h.clear();
    expect(await h.list()).toEqual([]);
    expect(await h.get('a')).toBeNull();
  });
});
