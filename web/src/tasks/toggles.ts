// Per-script enable, per account (spec decision 7). Firestore is the record; localStorage is a
// mirror so a reload before the debounce fires still shows what the player chose, and so a
// signed-out player still has working toggles. The mirror is keyed by principal
// (`cs.script.u.<uid>.<id>`, or `cs.script.anon.<id>` signed out) through web/src/storage/scoped.ts:
// audit C10 found the old bare `cs.script.<id>` key leaking one account's choices into another on
// the same browser. Deliberately the same debounce, key shape and load precedence as
// web/src/plugins/settings.ts, which scopes itself through the same module: a second,
// differently-behaved persistence model for the same kind of value is how two stores end up
// disagreeing about what was chosen.
import { collection, doc, getDocs, setDoc, type Firestore } from 'firebase/firestore';
import { migrateBareKeys, readScoped, scopedIds, writeScoped } from '../storage/scoped';

export interface ToggleBackend {
  load(uid: string): Promise<Record<string, boolean>>;
  write(uid: string, id: string, enabled: boolean): Promise<void>;
}

export interface ToggleStore {
  /** Reads the account's toggles; null uid means the local mirror is the whole store. */
  load(uid: string | null): Promise<Map<string, boolean>>;
  /** Absent means enabled: a script the player has never touched runs. */
  isEnabled(id: string): boolean;
  setEnabled(uid: string | null, id: string, enabled: boolean): void;
  /** Sends every pending write now, for a teardown that cannot wait for the debounce. */
  flush(): Promise<void>;
}

const DEBOUNCE_MS = 800;

export function createFirestoreToggleBackend(db: Firestore): ToggleBackend {
  return {
    async load(uid) {
      const snap = await getDocs(collection(db, 'users', uid, 'scriptToggles'));
      const out: Record<string, boolean> = {};
      // Anything but an explicit `false` is enabled, so a half-written document cannot turn a
      // script off; the rule already refuses a non-boolean `enabled`.
      for (const d of snap.docs) out[d.id] = (d.data() as { enabled?: boolean }).enabled !== false;
      return out;
    },
    async write(uid, id, enabled) {
      await setDoc(doc(db, 'users', uid, 'scriptToggles', id), { enabled, updatedAt: Date.now() });
    }
  };
}

function readLocal(uid: string | null, id: string): boolean | undefined {
  const raw = readScoped('script', uid, id);
  return raw === null ? undefined : raw === 'true';
}

/** Run once at boot, before any store is built. See web/src/storage/scoped.ts. */
export function migrateScriptKeys(): number { return migrateBareKeys('script'); }

export function createToggleStore(backend: ToggleBackend, opts: { debounceMs?: number } = {}): ToggleStore {
  const debounceMs = opts.debounceMs ?? DEBOUNCE_MS;
  const values = new Map<string, boolean>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pending = new Map<string, { uid: string; enabled: boolean }>();
  // Ids written since the current load began. `wire.ts` fires `load()` without awaiting it, so a
  // player can flip a switch while the remote read is in flight; without this the stale remote
  // value would overwrite the fresh one in memory while the debounced write still lands, and the
  // panel would show On over an account holding Off until the next reload.
  const dirty = new Set<string>();

  function schedule(uid: string, id: string, enabled: boolean): void {
    pending.set(id, { uid, enabled });
    const existing = timers.get(id);
    if (existing) clearTimeout(existing);
    timers.set(id, setTimeout(() => {
      const job = pending.get(id);
      timers.delete(id);
      pending.delete(id);
      // Offline is not an error: localStorage already holds the value the player chose.
      if (job) void backend.write(job.uid, id, job.enabled).catch(() => {});
    }, debounceMs));
  }

  return {
    async load(uid) {
      dirty.clear();
      values.clear();
      let remote: Record<string, boolean> = {};
      if (uid) { try { remote = await backend.load(uid); } catch { remote = {}; } }
      // This principal's mirror goes in first and the backend overwrites it, so a value written on
      // another device wins over a stale local mirror while an id the backend has never heard of
      // stays. A write made while this load was in flight outranks both. Another account's bucket
      // is unreachable from here: scopedIds is prefixed by uid (audit C10).
      for (const id of scopedIds('script', uid)) {
        const local = readLocal(uid, id);
        if (local !== undefined && !dirty.has(id)) values.set(id, local);
      }
      for (const [id, enabled] of Object.entries(remote)) { if (!dirty.has(id)) values.set(id, enabled); }
      return new Map(values);
    },
    isEnabled: id => values.get(id) !== false,
    setEnabled(uid, id, enabled) {
      values.set(id, enabled);
      dirty.add(id);
      writeScoped('script', uid, id, String(enabled));
      if (uid) schedule(uid, id, enabled);
    },
    async flush() {
      const jobs = [...pending.entries()];
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      pending.clear();
      for (const [id, job] of jobs) await backend.write(job.uid, id, job.enabled).catch(() => {});
    }
  };
}
