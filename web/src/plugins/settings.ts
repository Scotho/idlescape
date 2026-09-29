import { migrateBareKeys, readScoped, scopedIds, writeScoped } from '../storage/scoped';
import type { SettingsValues } from './types';

export interface PluginDoc { enabled: boolean; settings: SettingsValues }

export interface SettingsBackend {
  load(uid: string): Promise<Record<string, PluginDoc>>;
  write(uid: string, id: string, doc: PluginDoc): Promise<void>;
}

export interface SettingsStore {
  load(uid: string | null): Promise<Map<string, PluginDoc>>;
  get(id: string): PluginDoc | undefined;
  setEnabled(uid: string | null, id: string, enabled: boolean): void;
  setSettings(uid: string | null, id: string, settings: SettingsValues): void;
  flush(): Promise<void>;
}

function readLocal(uid: string | null, id: string): PluginDoc | undefined {
  const raw = readScoped('plugin', uid, id);
  if (raw === null) return undefined;
  try { return JSON.parse(raw) as PluginDoc; } catch { return undefined; }
}

function writeLocal(uid: string | null, id: string, doc: PluginDoc): void {
  writeScoped('plugin', uid, id, JSON.stringify(doc));
}

/** Run once at boot, before any store is built. See web/src/storage/scoped.ts. */
export function migratePluginKeys(): number { return migrateBareKeys('plugin'); }

export function createSettingsStore(backend: SettingsBackend, opts: { debounceMs?: number } = {}): SettingsStore {
  const debounceMs = opts.debounceMs ?? 800;
  const docs = new Map<string, PluginDoc>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pending = new Map<string, { uid: string; doc: PluginDoc }>();

  function schedule(uid: string, id: string): void {
    pending.set(id, { uid, doc: docs.get(id)! });
    const existing = timers.get(id);
    if (existing) clearTimeout(existing);
    timers.set(id, setTimeout(() => {
      const job = pending.get(id);
      timers.delete(id);
      pending.delete(id);
      if (job) void backend.write(job.uid, id, job.doc).catch(() => { /* offline: localStorage already holds it */ });
    }, debounceMs));
  }

  function mutate(uid: string | null, id: string, patch: Partial<PluginDoc>): void {
    const current = docs.get(id) ?? { enabled: false, settings: {} };
    const next: PluginDoc = { enabled: patch.enabled ?? current.enabled, settings: patch.settings ?? current.settings };
    docs.set(id, next);
    writeLocal(uid, id, next);
    if (uid) schedule(uid, id);
  }

  return {
    async load(uid) {
      docs.clear();
      let remote: Record<string, PluginDoc> = {};
      if (uid) { try { remote = await backend.load(uid); } catch { remote = {}; } }
      const ids = new Set(Object.keys(remote));
      // This principal's own mirror fills only ids the backend did not return. Another account's
      // bucket is not reachable from here at all: scopedIds is prefixed by uid (audit C10).
      for (const id of scopedIds('plugin', uid)) ids.add(id);
      for (const id of ids) {
        const doc = remote[id] ?? readLocal(uid, id);
        if (doc) docs.set(id, doc);
      }
      return new Map(docs);
    },
    get: id => docs.get(id),
    setEnabled(uid, id, enabled) { mutate(uid, id, { enabled }); },
    setSettings(uid, id, settings) {
      const current = docs.get(id) ?? { enabled: false, settings: {} };
      mutate(uid, id, { settings: { ...current.settings, ...settings } });
    },
    async flush() {
      for (const [id, timer] of timers) {
        clearTimeout(timer);
        const job = pending.get(id);
        if (job) await backend.write(job.uid, id, job.doc).catch(() => { /* ignore */ });
      }
      timers.clear();
      pending.clear();
    }
  };
}
