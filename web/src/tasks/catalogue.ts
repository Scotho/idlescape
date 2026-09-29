// The "what can I run?" half of the tasks api: the bundled library merged with the signed-in
// user's saved documents into one list of `TaskSummary` rows, and the lookup that turns an id
// back into the manifest and/or document behind it.
//
// It lives apart from `api.ts` because it is pure catalogue — no run control, no history, no
// Worker — and because both the Tasks tab and the Marketplace read from it in different shapes.
import { evaluateRequirements } from './requirements';
import type { ScriptManifest, TaskSummary } from './types';
import type { UserTaskDoc, UserTaskStore } from './userStore';
import type { Transport } from '../agent/types';

/** A catalogue row plus its source text (empty for a bundled library script). */
export interface TaskDetail extends TaskSummary { code: string }

/** What an id resolved to: a bundled manifest, a saved document, or (for an install) both. */
export interface Resolved { manifest?: ScriptManifest; doc?: UserTaskDoc }

export interface CatalogueDeps {
  library: { manifests(): ScriptManifest[]; byId(id: string): ScriptManifest | undefined };
  store: UserTaskStore;
  transport: Transport;
  /** The per-account script toggle, so every row carries the switch the panels draw. */
  enabled(id: string): boolean;
}

/** User rows sort after the library, whose manifests carry small explicit `order` values. */
const USER_ORDER = 1000;

/** Optional fields are attached only when present, so no row carries an explicit `undefined`. */
function summarise(m: ScriptManifest, requirements: { ok: boolean; missing: string[] }, enabled: boolean): TaskSummary {
  const row: TaskSummary = {
    id: m.id, name: m.name, description: m.description, version: m.version, tags: m.tags ?? [],
    source: 'library', params: m.params ?? {}, requirements, order: m.order ?? 0, installed: false, enabled
  };
  if (m.estimateMinutes !== undefined) row.estimateMinutes = m.estimateMinutes;
  return row;
}

/** A saved script's own row. Its params schema lives in its code, so panels get an empty one. */
function userRow(doc: UserTaskDoc, enabled: boolean): TaskSummary {
  const row: TaskSummary = {
    id: doc.id, name: doc.name, description: doc.description, version: doc.version,
    tags: doc.tags, source: doc.source === 'library' ? 'library' : doc.source,
    params: {}, requirements: { ok: true, missing: [] }, order: USER_ORDER, installed: true, enabled
  };
  if (doc.libraryId !== undefined) row.libraryId = doc.libraryId;
  if (doc.lastRun) row.lastRun = doc.lastRun;
  return row;
}

export function createCatalogue(d: CatalogueDeps) {
  const world = () => d.transport.getState();
  const libraryRow = (m: ScriptManifest): TaskSummary => summarise(m, evaluateRequirements(m.requires, world()), d.enabled(m.id));
  const find = (id: string): ScriptManifest | undefined => d.library.byId(id) ?? d.library.manifests().find(m => m.id === id);

  return {
    find,

    async list(): Promise<TaskSummary[]> {
      const docs = await d.store.list().catch(() => [] as UserTaskDoc[]);
      const byLibraryId = new Map(docs.filter(x => x.libraryId).map(x => [x.libraryId as string, x]));
      const rows = d.library.manifests().map(m => {
        const row = libraryRow(m);
        const doc = byLibraryId.get(m.id);
        if (!doc) return row;
        // One row per script: an installed reference marks the library entry rather than adding
        // a near-duplicate every panel would then have to de-duplicate for itself.
        row.installed = true;
        row.libraryId = m.id;
        if (doc.lastRun) row.lastRun = doc.lastRun;
        return row;
      });
      const known = new Set(rows.map(r => r.id));
      for (const doc of docs) {
        if (doc.libraryId && known.has(doc.libraryId)) continue;
        rows.push(userRow(doc, d.enabled(doc.id)));
      }
      return rows;
    },

    /**
     * A manifest wins over a document of the same id: an installed reference shares the
     * library's id and must run the bundled code, not its own empty `code`. The document still
     * comes back, so a run started from it can write `lastRun` where the panels will see it.
     * Returns null for an id neither side knows.
     */
    async resolve(id: string): Promise<Resolved | null> {
      const manifest = find(id);
      const doc = (await d.store.get(id).catch(() => null)) ?? undefined;
      if (manifest) return { manifest, doc };
      if (doc) return { doc, manifest: doc.libraryId ? d.library.byId(doc.libraryId) : undefined };
      return null;
    },

    detail({ manifest, doc }: Resolved): TaskDetail {
      if (!doc && manifest) return { ...libraryRow(manifest), code: '' };
      const row = manifest
        ? { ...libraryRow(manifest), installed: true, libraryId: manifest.id }
        : userRow(doc as UserTaskDoc, d.enabled((doc as UserTaskDoc).id));
      return { ...row, code: doc?.code ?? '' };
    }
  };
}
