export interface RawSpawn { level: number; x: number; z: number; id: number; count: number }
export interface Jm2 { npcs: RawSpawn[]; objs: RawSpawn[]; locs: RawSpawn[] }

export function parseJm2(text: string, file: string): Jm2 {
  const m = /m(\d+)_(\d+)\.jm2$/.exec(file);
  if (!m) throw new Error(`not a map file: ${file}`);
  const mx = Number(m[1]), mz = Number(m[2]);
  const out: Jm2 = { npcs: [], objs: [], locs: [] };
  let section: keyof Jm2 | null = null;
  for (const line of text.split(/\r?\n/)) {
    const h = /^==== (\w+) ====$/.exec(line.trim());
    if (h) { section = h[1] === 'NPC' ? 'npcs' : h[1] === 'OBJ' ? 'objs' : h[1] === 'LOC' ? 'locs' : null; continue; }
    if (!section) continue;
    const row = /^(\d+) (\d+) (\d+): (\d+)(?: (\d+))?/.exec(line);
    if (!row) continue;
    const level = Number(row[1]), lx = Number(row[2]), lz = Number(row[3]), id = Number(row[4]);
    const count = section === 'objs' && row[5] !== undefined ? Number(row[5]) : 1;
    out[section].push({ level, x: mx * 64 + lx, z: mz * 64 + lz, id, count });
  }
  return out;
}
