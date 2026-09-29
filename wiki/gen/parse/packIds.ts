import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface PackIds { byKey: Map<string, number>; byId: Map<number, string> }

export function parsePackIds(text: string): PackIds {
  const byKey = new Map<string, number>();
  const byId = new Map<number, string>();
  for (const line of text.split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const id = Number(line.slice(0, eq));
    const key = line.slice(eq + 1).trim();
    if (!Number.isInteger(id) || !key) continue;
    byKey.set(key, id);
    byId.set(id, key);
  }
  return { byKey, byId };
}

export type PackKind = 'obj' | 'npc' | 'loc' | 'varp' | 'inv' | 'param' | 'seq' | 'category';

export function loadPackIds(contentDir: string, kind: PackKind): PackIds {
  return parsePackIds(readFileSync(path.join(contentDir, 'pack', `${kind}.pack`), 'utf8'));
}

/**
 * The packs upstream tracks (obj, npc, loc, inv, varp, and so on) are always in a clone; the ones the
 * engine's packer GENERATES (category, param, seq, dbrow, script, ...) exist only after a pack run,
 * so a fresh clone, such as the one the server image's wiki stage makes, has none of them. Callers
 * that can do without one take undefined here rather than dying on ENOENT.
 */
export function loadPackIdsIfPresent(contentDir: string, kind: PackKind): PackIds | undefined {
  const file = path.join(contentDir, 'pack', `${kind}.pack`);
  if (!existsSync(file)) return undefined;
  return parsePackIds(readFileSync(file, 'utf8'));
}
