// web/src/bank/icons.ts -- item art for the web bank.
//
// The 274 client rasterises item icons from the cache at runtime (client patch 28,
// getObjIcon), so an icon can only be produced while a character's frame is open. IndexedDB
// carries them across reloads and lets the bank draw before any client is up.
//
// The key is the obj id ALONE and every icon is rendered at count 1. A bank note is its own obj
// id in 274, so noted-ness is already in the key; stack-size art variants are dropped because
// the bank prints the count as text beside the icon, and keying on the count would make this
// cache unbounded.
import type { ClientHooks } from '../clientTypes';

/** Just the member the cache needs, so a test never builds a whole ClientHooks. */
export type IconSource = Pick<ClientHooks, 'getObjIcon'>;

export interface IconCache {
  /** Cached data URL, or null. Never touches the network or the client; safe in a render. */
  peek(obj: number): string | null;
  /** Resolves to a data URL, or null when no client is open and nothing is cached. */
  load(obj: number): Promise<string | null>;
  /** Warms the cache for a set of ids, deduping in-flight loads. */
  prime(objs: number[]): Promise<void>;
  /** Fires after any new icon lands, so a view can repaint. */
  onChange(fn: () => void): () => void;
}

export const ICON_DB = 'idlescape-icons';
export const ICON_STORE = 'icons';

/** Promise wrapper for a single IndexedDB request. */
function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function openDatabase(dbName: string): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is not available'));
  const request = indexedDB.open(dbName, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(ICON_STORE)) db.createObjectStore(ICON_STORE, { keyPath: 'obj' });
  };
  return req(request);
}

/**
 * Icon cache in front of the client's getObjIcon. `peek` is a synchronous Map read, safe to call
 * for every visible slot on every repaint. `load`/`prime` dedupe in flight work and fall back to
 * IndexedDB, then the live client, degrading to memory-only when IndexedDB is missing or errors.
 */
export function createIconCache(deps: { client(): IconSource | null; dbName?: string }): IconCache {
  const dbName = deps.dbName ?? ICON_DB;
  const memory = new Map<number, string>();
  const inFlight = new Map<number, Promise<string | null>>();
  /**
   * Objs the database has already answered nothing for. prime() filters on `memory.has` alone, so
   * with no game client open - a state the bank is explicitly designed for, since IndexedDB is
   * what lets it draw before any client is up - a 240-slot bank issued ~240 IndexedDB gets on
   * EVERY repaint, and a repaint happens on every poll and every icon arrival.
   *
   * Only the DATABASE half is remembered. The client is still asked every time, because a null
   * from the client means "the model has not streamed from the server yet" and fixes itself,
   * while a null from the database means the icon was never rasterised and written - a fact that
   * only changes when this cache itself writes it, at which point the icon is in memory and this
   * path is not reached again.
   */
  const diskMisses = new Set<number>();
  const listeners = new Set<() => void>();
  // A private window, a browser with site data blocked, or a stripped test realm all land here.
  // The cache then works for the life of the page and simply does not survive a reload.
  let db: Promise<IDBDatabase | null> | null = null;

  function database(): Promise<IDBDatabase | null> {
    db ??= openDatabase(dbName).catch(() => null);
    return db;
  }

  async function fromDisk(obj: number): Promise<string | null> {
    const open = await database();
    if (!open) return null;
    try {
      const row = await req<{ obj: number; url: string } | undefined>(
        open.transaction(ICON_STORE, 'readonly').objectStore(ICON_STORE).get(obj)
      );
      return row?.url ?? null;
    } catch {
      return null;
    }
  }

  async function toDisk(obj: number, url: string): Promise<void> {
    const open = await database();
    if (!open) return;
    try {
      await req(open.transaction(ICON_STORE, 'readwrite').objectStore(ICON_STORE).put({ obj, url }));
    } catch {
      // Quota exceeded, or the connection already closed: memory still has it this session.
    }
  }

  function remember(obj: number, url: string): void {
    memory.set(obj, url);
    for (const listener of listeners) listener();
  }

  async function resolve(obj: number): Promise<string | null> {
    const stored = diskMisses.has(obj) ? null : await fromDisk(obj);
    if (stored) {
      remember(obj, stored);
      return stored;
    }
    diskMisses.add(obj);
    // Null is NOT cached: it means no client is open, or the model has not streamed from the
    // server yet (Task 1's live verification), and both fix themselves on a later call. Caching
    // it would leave a permanent hole; leaving it unmemoised makes the retry demand-driven
    // (only as fast as the caller asks again) instead of a spin.
    const drawn = deps.client()?.getObjIcon(obj, 1) ?? null;
    if (!drawn) return null;
    remember(obj, drawn);
    void toDisk(obj, drawn);
    return drawn;
  }

  function load(obj: number): Promise<string | null> {
    const cached = memory.get(obj);
    if (cached) return Promise.resolve(cached);
    const running = inFlight.get(obj);
    if (running) return running;
    const promise = resolve(obj).finally(() => inFlight.delete(obj));
    inFlight.set(obj, promise);
    return promise;
  }

  async function prime(objs: number[]): Promise<void> {
    // load() is what dedupes: a second prime() overlapping the first joins the in-flight promise
    // rather than issuing a second read for the same obj.
    const misses = [...new Set(objs)].filter(obj => !memory.has(obj));
    await Promise.all(misses.map(obj => load(obj)));
  }

  return {
    peek: obj => memory.get(obj) ?? null,
    load,
    prime,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
}
