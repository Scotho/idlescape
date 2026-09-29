import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import type { ParamValues, RunState } from './types';

/** Firestore rejects a `code` string of 65 536 characters or more (spec section 9). */
export const MAX_CODE_LENGTH = 65_536;

export type TaskSource = 'user' | 'fork' | 'library';

export interface TaskLastRun {
  runId: string;
  at: number;
  status: RunState;
  summary: string;
}

/** `users/{uid}/tasks/{taskId}` — spec section 9, plus the document id for convenience. */
export interface UserTaskDoc {
  id: string;
  name: string;
  description: string;
  tags: string[];
  params: ParamValues;
  /** The `defineScript` module text. Empty for a library reference. */
  code: string;
  version: number;
  source: TaskSource;
  libraryId?: string;
  pinnedVersion?: number;
  createdAt: number;
  updatedAt: number;
  lastRun?: TaskLastRun;
}

export interface SaveTaskInput {
  /** Omit to create; pass an existing id to overwrite and bump its version. */
  id?: string;
  name: string;
  description: string;
  tags: string[];
  params: ParamValues;
  code: string;
  source: TaskSource;
  libraryId?: string;
  pinnedVersion?: number;
}

/**
 * The narrow slice of Firestore the store needs, so the store itself is testable without an
 * emulator. `createFirestoreTaskBackend` is the only implementation that talks to Firestore.
 */
export interface TaskDocBackend {
  list(uid: string): Promise<UserTaskDoc[]>;
  get(uid: string, id: string): Promise<UserTaskDoc | null>;
  set(uid: string, id: string, value: UserTaskDoc): Promise<void>;
  delete(uid: string, id: string): Promise<void>;
  update(uid: string, id: string, patch: Partial<UserTaskDoc>): Promise<void>;
  /** Firestore mints ids that sort by creation time; without it the store falls back to a UUID. */
  newId?(uid: string): string;
}

export interface UserTaskStore {
  list(): Promise<UserTaskDoc[]>;
  get(id: string): Promise<UserTaskDoc | null>;
  save(input: SaveTaskInput): Promise<{ id: string; version: number }>;
  remove(id: string): Promise<void>;
  setLastRun(id: string, lastRun: TaskLastRun): Promise<void>;
}

const withId = (id: string, data: unknown): UserTaskDoc => ({ ...(data as Omit<UserTaskDoc, 'id'>), id });

export function createFirestoreTaskBackend(db: Firestore): TaskDocBackend {
  const tasks = (uid: string) => collection(db, 'users', uid, 'tasks');
  const ref = (uid: string, id: string) => doc(db, 'users', uid, 'tasks', id);
  return {
    async list(uid) { return (await getDocs(tasks(uid))).docs.map(d => withId(d.id, d.data())); },
    async get(uid, id) { const s = await getDoc(ref(uid, id)); return s.exists() ? withId(s.id, s.data()) : null; },
    async set(uid, id, value) { await setDoc(ref(uid, id), value, { merge: false }); },
    async delete(uid, id) { await deleteDoc(ref(uid, id)); },
    async update(uid, id, patch) { await updateDoc(ref(uid, id), patch); },
    newId(uid) { return doc(tasks(uid)).id; }
  };
}

const randomId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

export function createUserTaskStore(deps: { backend: TaskDocBackend; uid: () => string | null }): UserTaskStore {
  const { backend } = deps;
  const owner = (): string => {
    const uid = deps.uid();
    if (!uid) throw new Error('not signed in');
    return uid;
  };

  return {
    async list() {
      const uid = deps.uid();
      // Signed out is not an error here: the panel still lists the bundled library.
      return uid ? backend.list(uid) : [];
    },
    async get(id) {
      const uid = deps.uid();
      return uid ? backend.get(uid, id) : null;
    },
    async save(input) {
      const uid = owner();
      if (input.code.length >= MAX_CODE_LENGTH) throw new Error('script is larger than 64 KB');
      const id = input.id ?? backend.newId?.(uid) ?? randomId();
      const existing = input.id ? await backend.get(uid, id) : null;
      const now = Date.now();
      const next: UserTaskDoc = {
        id,
        name: input.name,
        description: input.description,
        tags: [...input.tags],
        params: { ...input.params },
        code: input.code,
        version: (existing?.version ?? 0) + 1,
        source: input.source,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      };
      // The write is a full replace, so carry forward what save does not own, and leave
      // absent optionals out entirely — Firestore rejects explicit `undefined` values.
      if (input.libraryId !== undefined) next.libraryId = input.libraryId;
      if (input.pinnedVersion !== undefined) next.pinnedVersion = input.pinnedVersion;
      if (existing?.lastRun) next.lastRun = existing.lastRun;
      await backend.set(uid, id, next);
      return { id, version: next.version };
    },
    async remove(id) {
      await backend.delete(owner(), id);
    },
    async setLastRun(id, lastRun) {
      await backend.update(owner(), id, { lastRun });
    }
  };
}
