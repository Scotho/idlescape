// Per-principal localStorage buckets. Audit C10: `cs.plugin.<id>` and `cs.script.<id>` carried no
// uid, so load(uid) enumerated the whole namespace and one browser leaked enable flags, notes and
// script toggles between accounts. Every key is now scoped: `cs.<ns>.u.<uid>.<id>` for a signed-in
// principal and `cs.<ns>.anon.<id>` for a signed-out one. Enumeration is by the scoped prefix, so
// a store cannot see another scope's keys at all: the leak is closed by construction rather than
// by a filter someone can forget to apply.
//
// IN SCOPE: `cs.plugin.*` (web/src/plugins/settings.ts) and `cs.script.*` (web/src/tasks/toggles.ts),
// the two stores audit C10 names.
//
// OUT OF SCOPE, deliberately, and still unscoped, for two different reasons:
//   - `cs.<k>` (web/src/tasks/wire.ts) is audit C21 and belongs to entry 4.
//   - `cs.tasks.settings`, `cs.panel`, `cs.size`, `cs.filter` and the two `cs.bank.*` keys are
//     per-browser display preferences rather than per-account state, so sharing them between one
//     person's own accounts is not a leak.
//   - `cs.pl.<id>.<k>` (web/src/main.ts's PluginContext.storage) is NOT a display preference. It is
//     arbitrary per-plugin data and it is on exactly this defect. It waits only because no builtin
//     plugin calls it today: `git grep -n "storage\." -- web/src/plugins/builtin` returns nothing,
//     so the leak is currently unreachable. THE FIRST PLUGIN THAT USES ctx.storage MUST SCOPE IT
//     through this module; do not read the line above as permission to leave it bare.
//
// Entry 4's web/src/ui/storage.ts KEYS inventory composes over this module rather than restating
// the shape.

export type ScopedNamespace = 'plugin' | 'script';

/** `u.<uid>` signed in, `anon` signed out. Literal discriminators, so no uid can collide with anon. */
export function scopeOf(uid: string | null): string {
  return uid === null ? 'anon' : `u.${uid}`;
}

/** Everything one principal's bucket shares, e.g. `cs.plugin.u.abc123.` or `cs.script.anon.`. */
export function scopePrefix(ns: ScopedNamespace, uid: string | null): string {
  return `cs.${ns}.${scopeOf(uid)}.`;
}

export function scopedKey(ns: ScopedNamespace, uid: string | null, id: string): string {
  return `${scopePrefix(ns, uid)}${id}`;
}

/** The ids in one principal's bucket. Guarded: a private window can block storage outright. */
export function scopedIds(ns: ScopedNamespace, uid: string | null): string[] {
  const prefix = scopePrefix(ns, uid);
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k !== null && k.startsWith(prefix)) out.push(k.slice(prefix.length));
    }
  } catch { /* storage blocked */ }
  return out;
}

export function readScoped(ns: ScopedNamespace, uid: string | null, id: string): string | null {
  try { return localStorage.getItem(scopedKey(ns, uid, id)); } catch { return null; }
}

export function writeScoped(ns: ScopedNamespace, uid: string | null, id: string, value: string): void {
  try { localStorage.setItem(scopedKey(ns, uid, id), value); } catch { /* storage blocked */ }
}

/**
 * Moves every pre-C10 bare `cs.<ns>.<id>` key into the anon bucket, and into no account's bucket.
 * Returns how many were moved. Idempotent: after one pass there are no bare keys left, so a second
 * pass moves nothing, which is why this needs no marker key to guard it.
 *
 * Why anon and not the signed-in account: the principal that wrote a bare key is unknowable, and
 * adopting it into whichever account signs in first is exactly the leak this closes. Firestore is
 * the record for a signed-in account (`users/{uid}/plugins`, `users/{uid}/scriptToggles`) and
 * load(uid) refills that bucket from it; `anon` is precisely what a bare key has always meant in
 * the signed-out case. Nothing is deleted without being read first, so no value is silently reset.
 */
export function migrateBareKeys(ns: ScopedNamespace): number {
  const nsPrefix = `cs.${ns}.`;
  // Collect first: removing a key while enumerating by index shifts every index after it.
  const bare: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k === null || !k.startsWith(nsPrefix)) continue;
      const rest = k.slice(nsPrefix.length);
      // `u.` and `anon.` are the two scope discriminators. No plugin id (`loot`, `xp`, `notes`,
      // `tasks`, `bank`, `status-hud`, ...) and no script id (kebab-case, e.g. `chop-and-drop`)
      // starts with either, so anything else is a pre-C10 bare key.
      if (rest.startsWith('u.') || rest.startsWith('anon.')) continue;
      bare.push(rest);
    }
  } catch { return 0; }

  let moved = 0;
  for (const id of bare) {
    try {
      const from = `${nsPrefix}${id}`;
      const value = localStorage.getItem(from);
      // The target was written by the current code and is newer than any bare key, so a collision
      // drops the bare key rather than overwriting what the anon bucket already holds.
      if (value !== null && readScoped(ns, null, id) === null) { writeScoped(ns, null, id, value); moved++; }
      localStorage.removeItem(from);
    } catch { /* storage blocked mid-sweep: leave the rest alone */ }
  }
  return moved;
}
