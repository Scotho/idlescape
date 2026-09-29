// Named places a route or a script can address. Banks are derived from the atlas itself; the
// towns are the free-to-play centres a player would name out loud. The generator asserts every
// town lands in a populated map square, so a typo here fails the build rather than producing a
// landmark that `travel.to({ landmark })` walks at forever.
import type { AtlasCluster, AtlasLandmark } from '../../tasks/types';

export const TOWNS: { id: string; name: string; level: number; x: number; z: number }[] = [
  { id: 'lumbridge', name: 'Lumbridge castle', level: 0, x: 3222, z: 3218 },
  { id: 'varrock-west', name: 'Varrock west bank', level: 0, x: 3185, z: 3436 },
  { id: 'varrock-east', name: 'Varrock east bank', level: 0, x: 3253, z: 3420 },
  { id: 'draynor', name: 'Draynor village bank', level: 0, x: 3092, z: 3243 },
  { id: 'al-kharid', name: 'Al Kharid', level: 0, x: 3293, z: 3174 },
  { id: 'falador-east', name: 'Falador east bank', level: 0, x: 3013, z: 3355 },
  { id: 'edgeville', name: 'Edgeville', level: 0, x: 3093, z: 3493 },
  { id: 'port-sarim', name: 'Port Sarim', level: 0, x: 3013, z: 3234 },
  { id: 'barbarian-village', name: 'Barbarian village', level: 0, x: 3082, z: 3420 }
];

/** One landmark per bank cluster, plus the towns. Ids are stable: `bank-<level>-<x>-<z>`. */
export function deriveLandmarks(clusters: AtlasCluster[]): AtlasLandmark[] {
  const banks = clusters
    .filter(c => c.kind === 'bank')
    .map(c => ({ id: `bank-${c.level}-${c.x}-${c.z}`, kind: 'bank' as const, name: `Bank (${c.x}, ${c.z})`, level: c.level, x: c.x, z: c.z }));
  const towns = TOWNS.map(t => ({ id: t.id, kind: 'town' as const, name: t.name, level: t.level, x: t.x, z: t.z }));
  return [...towns, ...banks].sort((a, b) => a.id.localeCompare(b.id));
}
