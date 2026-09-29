// The `.jm2` map-square format, as the engine's own packer reads it
// (engine/server/tools/pack/map/Pack.js readMap). Pure string-to-data: the file IO lives in
// scripts/gen, so this half is covered by the web unit suite (plan ruling R2).
//
// Only what the generators need is kept: the land flag byte (the height, overlay and underlay
// tokens are rendering data), loc placements, and npc spawns.

export interface LocPlacement { level: number; x: number; z: number; id: number; shape: number; angle: number }
export interface NpcSpawn { level: number; x: number; z: number; id: number }

export interface MapSquare {
  mx: number; mz: number;
  /** `packLocal(level, x, z)` to the tile's `f` flags; 0 when the tile carries no `f` token. */
  land: Map<number, number>;
  locs: LocPlacement[];
  npcs: NpcSpawn[];
}

/** The engine's own packing: level in bits 12-13, local x in 6-11, local z in 0-5. */
export function packLocal(level: number, x: number, z: number): number {
  return (z & 0x3f) | ((x & 0x3f) << 6) | ((level & 0x3) << 12);
}

/** `m50_50.jm2` to `{ mx: 50, mz: 50 }`; null for anything else in the maps directory. */
export function squareCoords(fileName: string): { mx: number; mz: number } | null {
  const m = /^m(\d+)_(\d+)\.jm2$/.exec(fileName);
  return m ? { mx: Number(m[1]), mz: Number(m[2]) } : null;
}

type Section = 'MAP' | 'LOC' | 'NPC' | 'OBJ' | null;

export function parseJm2(text: string, mx: number, mz: number): MapSquare {
  const square: MapSquare = { mx, mz, land: new Map(), locs: [], npcs: [] };
  let section: Section = null;
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (line.length === 0) continue;
    if (line.startsWith('====')) {
      const name = line.replace(/=/g, '').trim();
      section = name === 'MAP' || name === 'LOC' || name === 'NPC' || name === 'OBJ' ? name : null;
      continue;
    }
    if (section === null || section === 'OBJ') continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const head = line.slice(0, colon).split(' ');
    if (head.length !== 3) continue;
    const level = Number(head[0]), x = Number(head[1]), z = Number(head[2]);
    const payload = line.slice(colon + 1).trim();
    if (section === 'MAP') {
      square.land.set(packLocal(level, x, z), flagsOf(payload));
    } else if (section === 'LOC') {
      const parts = payload.split(' ');
      square.locs.push({
        level, x, z,
        id: Number(parts[0]),
        // Pack.js: an omitted shape is 10 (CENTREPIECE_STRAIGHT) and an omitted angle is 0.
        shape: parts.length > 1 ? Number(parts[1]) : 10,
        angle: parts.length > 2 ? Number(parts[2]) : 0
      });
    } else {
      square.npcs.push({ level, x, z, id: Number(payload) });
    }
  }
  return square;
}

/** The `f<n>` token's value, or 0 when the tile has none. */
function flagsOf(payload: string): number {
  for (const token of payload.split(' ')) {
    if (token.charCodeAt(0) === 102) return Number(token.slice(1)) | 0;   // 'f'
  }
  return 0;
}
