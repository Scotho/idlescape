import { parseJm2, type RawSpawn } from './parse/jm2';
import type { PackIds } from './parse/packIds';
import type { Areas } from './areas';
import type { Spawn } from './types';

export function extractSpawns(opts: { jm2Files: { file: string; text: string }[]; npcPack: PackIds; objPack: PackIds; locPack: PackIds; areas: Areas }): Spawn[] {
  const out: Spawn[] = [];
  const push = (kind: Spawn['kind'], rows: RawSpawn[], pack: PackIds, file: string) => {
    for (const r of rows) {
      const key = pack.byId.get(r.id);
      if (!key) continue;
      const coord = { x: r.x, z: r.z, level: r.level };
      out.push({ kind, id: r.id, key, coord, count: r.count, area: opts.areas.nearestArea(coord)?.slug ?? null, file });
    }
  };
  for (const { file, text } of opts.jm2Files) {
    const j = parseJm2(text, file);
    push('npc', j.npcs, opts.npcPack, file);
    push('obj', j.objs, opts.objPack, file);
    push('loc', j.locs, opts.locPack, file);
  }
  return out;
}
