import { describe, expect, it, vi } from 'vitest';
import { createIconCache, type IconSource } from './icons';

let dbSeq = 0;
const freshDb = (): string => `idlescape-icons-test-${++dbSeq}`;

function source(map: Record<number, string | null>): { impl: IconSource; asked: number[] } {
  const asked: number[] = [];
  return { impl: { getObjIcon: (id: number) => { asked.push(id); return map[id] ?? null; } }, asked };
}

const COIN = 'data:image/png;base64,COIN';
const HAT = 'data:image/png;base64,HAT';

describe('createIconCache', () => {
  it('peeks null before anything is loaded', () => {
    const cache = createIconCache({ client: () => null, dbName: freshDb() });
    expect(cache.peek(995)).toBeNull();
  });

  it('asks the client once and then serves from memory', async () => {
    const { impl, asked } = source({ 995: COIN });
    const cache = createIconCache({ client: () => impl, dbName: freshDb() });
    await expect(cache.load(995)).resolves.toBe(COIN);
    await expect(cache.load(995)).resolves.toBe(COIN);
    expect(asked).toEqual([995]);
    expect(cache.peek(995)).toBe(COIN);
  });

  it('always renders at count 1: the bank prints the number itself', async () => {
    const seen: unknown[] = [];
    const impl: IconSource = { getObjIcon: (id: number, count?: number) => { seen.push([id, count]); return COIN; } };
    const cache = createIconCache({ client: () => impl, dbName: freshDb() });
    await cache.load(995);
    expect(seen).toEqual([[995, 1]]);
  });

  it('survives a reload: a second cache on the same database needs no client', async () => {
    const dbName = freshDb();
    const { impl } = source({ 1038: HAT });
    await createIconCache({ client: () => impl, dbName }).load(1038);
    const reopened = createIconCache({ client: () => null, dbName });
    await expect(reopened.load(1038)).resolves.toBe(HAT);
    expect(reopened.peek(1038)).toBe(HAT);
  });

  it('does not cache a null: a model that has not streamed yet is retried', async () => {
    const { impl, asked } = source({});
    const cache = createIconCache({ client: () => impl, dbName: freshDb() });
    await expect(cache.load(4151)).resolves.toBeNull();
    await expect(cache.load(4151)).resolves.toBeNull();
    expect(asked).toEqual([4151, 4151]);
  });

  it('resolves null and never throws when no client is open', async () => {
    const cache = createIconCache({ client: () => null, dbName: freshDb() });
    await expect(cache.load(995)).resolves.toBeNull();
  });

  it('dedupes concurrent loads of the same id', async () => {
    const { impl, asked } = source({ 995: COIN });
    const cache = createIconCache({ client: () => impl, dbName: freshDb() });
    await Promise.all([cache.load(995), cache.load(995), cache.load(995)]);
    expect(asked).toEqual([995]);
  });

  it('primes only the misses', async () => {
    const { impl, asked } = source({ 995: COIN, 1038: HAT });
    const cache = createIconCache({ client: () => impl, dbName: freshDb() });
    await cache.load(995);
    asked.length = 0;
    await cache.prime([995, 1038, 995]);
    expect(asked).toEqual([1038]);
    expect(cache.peek(1038)).toBe(HAT);
  });

  it('dedupes a fresh id repeated within one prime batch', async () => {
    const { impl, asked } = source({ 1038: HAT });
    const cache = createIconCache({ client: () => impl, dbName: freshDb() });
    await cache.prime([1038, 1038, 1038]);
    expect(asked).toEqual([1038]);
    expect(cache.peek(1038)).toBe(HAT);
  });

  it('tells the view when a new icon lands, exactly once, and unsubscribe works', async () => {
    const { impl } = source({ 995: COIN });
    const cache = createIconCache({ client: () => impl, dbName: freshDb() });
    const changed = vi.fn();
    const off = cache.onChange(changed);
    await cache.load(995);
    expect(changed).toHaveBeenCalledTimes(1);
    off();
    changed.mockClear();
    await cache.load(1038);
    expect(changed).not.toHaveBeenCalled();
  });

  it('does not fire onChange for a null (nothing landed)', async () => {
    const { impl } = source({});
    const cache = createIconCache({ client: () => impl, dbName: freshDb() });
    const changed = vi.fn();
    cache.onChange(changed);
    await cache.load(4151);
    expect(changed).not.toHaveBeenCalled();
  });

  it('degrades to memory-only when IndexedDB is unavailable, without throwing', async () => {
    const original = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true });
    try {
      const { impl } = source({ 995: COIN });
      const cache = createIconCache({ client: () => impl, dbName: freshDb() });
      await expect(cache.load(995)).resolves.toBe(COIN);
      expect(cache.peek(995)).toBe(COIN);
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { value: original, configurable: true });
    }
  });

  it('degrades to memory-only when the database open request errors (a corrupt database)', async () => {
    const original = globalThis.indexedDB;
    const corrupt: Pick<IDBFactory, 'open'> = {
      open: () => {
        const request = {
          onupgradeneeded: null as (() => void) | null,
          onsuccess: null as (() => void) | null,
          onerror: null as (() => void) | null,
          result: undefined,
          error: new Error('database is corrupt')
        };
        queueMicrotask(() => request.onerror?.());
        return request as unknown as IDBOpenDBRequest;
      }
    };
    Object.defineProperty(globalThis, 'indexedDB', { value: corrupt, configurable: true });
    try {
      const { impl } = source({ 995: COIN });
      const cache = createIconCache({ client: () => impl, dbName: freshDb() });
      await expect(cache.load(995)).resolves.toBe(COIN);
      expect(cache.peek(995)).toBe(COIN);
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { value: original, configurable: true });
    }
  });

  it('works when its methods are destructured off the returned object (no this)', async () => {
    const { impl } = source({ 995: COIN, 1038: HAT });
    const { load, prime, peek, onChange } = createIconCache({ client: () => impl, dbName: freshDb() });
    const changed = vi.fn();
    onChange(changed);
    await expect(load(995)).resolves.toBe(COIN);
    await prime([1038]);
    expect(peek(1038)).toBe(HAT);
    expect(changed).toHaveBeenCalled();
  });

  /**
   * FINAL REVIEW, finding 12. prime() filtered on `memory.has` alone, so every obj the cache had
   * no art for was re-read from IndexedDB on every repaint - and a repaint happens on every poll
   * and every icon arrival. With no game client open, which is the state IndexedDB exists to
   * serve, that was ~240 gets per rebuild of a full bank.
   */
  it('asks the database once per obj it has nothing for, however often the pane repaints', async () => {
    const { impl, asked } = source({});
    const cache = createIconCache({ client: () => impl, dbName: freshDb() });
    const get = vi.spyOn(IDBObjectStore.prototype, 'get');
    try {
      await cache.prime([995, 1038]);
      await cache.prime([995, 1038]);
      await cache.prime([995, 1038]);
      expect(get).toHaveBeenCalledTimes(2);
      // And the CLIENT is still retried every time: a null there means the model has not streamed
      // yet, which is not a fact about the icon and must never be cached as final.
      expect(asked).toEqual([995, 1038, 995, 1038, 995, 1038]);
    } finally {
      get.mockRestore();
    }
  });

  it('still reads the database for an obj it has never asked about', async () => {
    const dbName = freshDb();
    await createIconCache({ client: () => source({ 1038: HAT }).impl, dbName }).load(1038);
    const reopened = createIconCache({ client: () => null, dbName });
    const get = vi.spyOn(IDBObjectStore.prototype, 'get');
    try {
      // A miss on 995 must not stop 1038 being found on disk in the same batch.
      await reopened.prime([995, 1038]);
      expect(get).toHaveBeenCalledTimes(2);
      expect(reopened.peek(1038)).toBe(HAT);
    } finally {
      get.mockRestore();
    }
  });

  it('opens IndexedDB only once across several load/prime calls on one instance', async () => {
    const openSpy = vi.spyOn(indexedDB, 'open');
    try {
      const { impl } = source({ 995: COIN, 1038: HAT });
      const cache = createIconCache({ client: () => impl, dbName: freshDb() });
      await cache.load(995);
      await cache.load(995);
      await cache.prime([1038, 995]);
      await cache.load(1038);
      expect(openSpy).toHaveBeenCalledTimes(1);
    } finally {
      openSpy.mockRestore();
    }
  });
});
