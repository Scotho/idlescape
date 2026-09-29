import { slugify, dedupeSlugs } from './slug';
import type { Area, Coord } from './types';

export function parsePacked(s: string): Coord {
  const p = s.trim().split('_').map(Number);
  if (p.length !== 5 || p.some(n => !Number.isInteger(n))) throw new Error(`bad packed coord: ${s}`);
  return { level: p[0]!, x: p[1]! * 64 + p[3]!, z: p[2]! * 64 + p[4]! };
}

function zoneKey(c: Coord): string { return `${c.level}:${c.x >> 3}:${c.z >> 3}`; }

function zoneSet(text: string): Set<string> {
  const s = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('//')) continue;
    s.add(zoneKey(parsePacked(t)));
  }
  return s;
}

export interface Areas { areas: Area[]; isFree(c: Coord): boolean; isMultiway(c: Coord): boolean; nearestArea(c: Coord): Area | null }

// Label size 0 is a point of interest, 1 a town, 2 a region. Reach in tiles grows with size.
const REACH = [40, 120, 400];

export function extractAreas(opts: { labelsText: string; free2playText: string; multiwayText: string }): Areas {
  const areas: Area[] = [];
  let id = 0;
  for (const line of opts.labelsText.split(/\r?\n/)) {
    const m = /^=?([^,]+),(\d+),(\d+),(\d+)\s*$/.exec(line.trim());
    if (!m) continue;
    const name = m[1]!.replace(/\//g, ' ').trim();
    const coord = { x: Number(m[2]), z: Number(m[3]), level: 0 };
    areas.push({ type: 'area', id: id++, key: slugify(name), slug: slugify(name), name, members: false, aliases: [], coord, size: Number(m[4]),
      multiway: false, sources: [{ kind: 'content', ref: `content:maps/labels.txt#${name}` }] });
  }
  dedupeSlugs(areas);
  const free = zoneSet(opts.free2playText);
  const multi = zoneSet(opts.multiwayText);
  const isFree = (c: Coord) => free.has(zoneKey(c));
  const isMultiway = (c: Coord) => multi.has(zoneKey(c));
  for (const a of areas) { a.members = !isFree(a.coord); a.multiway = isMultiway(a.coord); }
  function nearestArea(c: Coord): Area | null {
    let best: Area | null = null; let bestScore = Infinity;
    for (const a of areas) {
      const d = Math.hypot(a.coord.x - c.x, a.coord.z - c.z);
      if (d > (REACH[a.size] ?? 400)) continue;
      const score = d + a.size * 25; // ties go to the more specific label
      if (score < bestScore) { bestScore = score; best = a; }
    }
    return best;
  }
  return { areas, isFree, isMultiway, nearestArea };
}
