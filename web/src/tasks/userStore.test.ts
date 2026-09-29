import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createUserTaskStore, type SaveTaskInput, type TaskDocBackend, type UserTaskDoc } from './userStore';

/** In-memory stand-in for `createFirestoreTaskBackend` — the five methods, nothing else. */
function memoryBackend(): TaskDocBackend & { docs: Map<string, UserTaskDoc> } {
  const docs = new Map<string, UserTaskDoc>();
  const key = (uid: string, id: string) => `${uid}/${id}`;
  return {
    docs,
    async list(uid) {
      return [...docs.entries()].filter(([k]) => k.startsWith(`${uid}/`)).map(([, v]) => v);
    },
    async get(uid, id) {
      return docs.get(key(uid, id)) ?? null;
    },
    async set(uid, id, value) {
      docs.set(key(uid, id), value);
    },
    async delete(uid, id) {
      docs.delete(key(uid, id));
    },
    async update(uid, id, patch) {
      const existing = docs.get(key(uid, id));
      if (!existing) throw new Error('missing');
      docs.set(key(uid, id), { ...existing, ...patch });
    }
  };
}

const input = (over: Partial<SaveTaskInput> = {}): SaveTaskInput => ({
  name: 'Chop and drop',
  description: 'chops',
  tags: ['skilling'],
  params: { untilLevel: 15 },
  code: 'export default defineScript({});',
  source: 'user',
  ...over
});

const storeFor = (backend: TaskDocBackend, uid: string | null = 'u1') =>
  createUserTaskStore({ backend, uid: () => uid });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
});
afterEach(() => vi.useRealTimers());

describe('createUserTaskStore', () => {
  test('save assigns an id and version 1, and list/get read it back', async () => {
    const backend = memoryBackend();
    const store = storeFor(backend);
    const { id, version } = await store.save(input());
    expect(id).toBeTruthy();
    expect(version).toBe(1);

    const one = await store.get(id);
    expect(one).toMatchObject({ id, name: 'Chop and drop', source: 'user', version: 1, createdAt: 1_000, updatedAt: 1_000 });
    expect(await store.list()).toHaveLength(1);
  });

  test('a second save of the same id bumps the version and keeps createdAt', async () => {
    const backend = memoryBackend();
    const store = storeFor(backend);
    const first = await store.save(input());
    vi.setSystemTime(5_000);
    const second = await store.save(input({ id: first.id, name: 'Renamed' }));

    expect(second).toEqual({ id: first.id, version: 2 });
    expect(await store.get(first.id)).toMatchObject({ name: 'Renamed', version: 2, createdAt: 1_000, updatedAt: 5_000 });
  });

  test('optional fields are only written when supplied', async () => {
    const backend = memoryBackend();
    const store = storeFor(backend);
    const bare = await store.save(input());
    expect(Object.keys((await store.get(bare.id))!)).not.toContain('libraryId');

    const forked = await store.save(input({ source: 'fork', libraryId: 'chop-and-drop', pinnedVersion: 3 }));
    expect(await store.get(forked.id)).toMatchObject({ source: 'fork', libraryId: 'chop-and-drop', pinnedVersion: 3 });
  });

  test('remove deletes the document', async () => {
    const backend = memoryBackend();
    const store = storeFor(backend);
    const { id } = await store.save(input());
    await store.remove(id);
    expect(await store.get(id)).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  test('setLastRun patches only lastRun', async () => {
    const backend = memoryBackend();
    const store = storeFor(backend);
    const { id } = await store.save(input());
    await store.setLastRun(id, { runId: 'r1', at: 42, status: 'done', summary: 'chopped 28 logs' });
    expect(await store.get(id)).toMatchObject({ version: 1, lastRun: { runId: 'r1', at: 42, status: 'done', summary: 'chopped 28 logs' } });
  });

  test('code of 64 KB or more is rejected before it reaches the backend', async () => {
    const backend = memoryBackend();
    const store = storeFor(backend);
    await expect(store.save(input({ code: 'x'.repeat(65_536) }))).rejects.toThrow(/64 KB/);
    expect(backend.docs.size).toBe(0);
  });

  test('writes are rejected when signed out, and list is empty', async () => {
    const backend = memoryBackend();
    const store = storeFor(backend, null);
    await expect(store.save(input())).rejects.toThrow(/not signed in/);
    await expect(store.remove('t1')).rejects.toThrow(/not signed in/);
    await expect(store.setLastRun('t1', { runId: 'r', at: 1, status: 'done', summary: '' })).rejects.toThrow(/not signed in/);
    expect(await store.list()).toEqual([]);
    expect(await store.get('t1')).toBeNull();
  });

  test('list only returns the signed-in user documents', async () => {
    const backend = memoryBackend();
    await storeFor(backend, 'u2').save(input({ name: 'Theirs' }));
    const mine = storeFor(backend, 'u1');
    await mine.save(input({ name: 'Mine' }));
    expect((await mine.list()).map(d => d.name)).toEqual(['Mine']);
  });
});
