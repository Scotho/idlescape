// Where a screenshot goes. A script in a Worker has nowhere else to put a Blob: fetch is
// forbidden by S10, there is no DOM, and there is no persisted store yet (P6 is entry 7).
//
// It is NOT the trace. A trace event crosses postMessage, is capped at 5000 (trace.ts:35), is
// persisted per run in IndexedDB (history.ts:74-78), is rendered by traceView.ts's detailOf
// exhaustive switch, and is copied to Claude behind UNTRUSTED_HEADER. A Blob is wrong at all
// five. The trace row carries an id and a label; the bytes live here, in memory, for the life
// of the run.
//
// The store itself is Worker-scoped and keyed by run, not one store per run: the cap has to be
// per run, and `clear(runId)` is what stops the outer map growing one entry per run for the
// life of the tab. `runContext.ts` owns both halves of that, beside the anchor.

/** One filed image, as a reader sees it. The bytes are fetched separately, by id. */
export interface Attachment {
  id: string;
  label: string;
}

export interface Attachments {
  /** Files `blob` against `runId` and hands back the id the trace row carries. */
  put(runId: string, label: string, blob: Blob): string;
  /** What this run has filed, oldest first. Ids and labels only. */
  list(runId: string): Attachment[];
  /** The bytes behind an id, or null once the cap or a `clear` has dropped them. */
  get(id: string): Blob | null;
  /** Called when a run ends. Without it the outer map grows one entry per run for ever. */
  clear(runId: string): void;
}

/** How many images one run may hold. A loop that shoots every tick must not fill the tab. */
const DEFAULT_CAP = 8;

/**
 * Ten lowercase alphanumerics. Not a security token: a map key that has to survive a
 * `postMessage` and read tolerably in a trace row, which is why it is not `crypto.randomUUID`,
 * whose hyphens and length buy nothing here.
 */
function newId(): string {
  return Math.random().toString(36).slice(2, 12);
}

export function createAttachments(cap: number = DEFAULT_CAP): Attachments {
  // The cap is a public parameter, and a store that holds nothing is not a store: at zero or
  // below, `while (filed.length > cap)` is still true at an empty list, `shift()` hands back
  // undefined and the drop loop never ends, hanging the Worker that called `put`. One is the
  // floor, and a fractional cap is floored so the loop has an integer to stop at.
  const limit = Math.max(1, Math.floor(cap));
  const byRun = new Map<string, { id: string; label: string; blob: Blob }[]>();
  // A second index rather than a walk of every run: `get` is called with an id read off a trace
  // row, which does not carry the run it belongs to.
  const byId = new Map<string, Blob>();
  return {
    put(runId, label, blob) {
      const id = newId();
      const filed = byRun.get(runId) ?? [];
      filed.push({ id, label, blob });
      byId.set(id, blob);
      // The oldest goes, not the newest: a run that is stuck wants the picture of now.
      while (filed.length > limit) {
        const dropped = filed.shift();
        if (dropped) byId.delete(dropped.id);
      }
      byRun.set(runId, filed);
      return id;
    },
    list: runId => (byRun.get(runId) ?? []).map(a => ({ id: a.id, label: a.label })),
    get: id => byId.get(id) ?? null,
    clear(runId) {
      for (const a of byRun.get(runId) ?? []) byId.delete(a.id);
      byRun.delete(runId);
    }
  };
}
