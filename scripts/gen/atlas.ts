// Builds web/src/data/atlas.json from the pinned engine/content clone (spec section 3.2,
// owner decision 1). Run by scripts/build.ps1 with --check; run by hand without it to
// regenerate after a content bump.
//
//   bun scripts/gen/atlas.ts            # write
//   bun scripts/gen/atlas.ts --check    # fail if the committed file is stale
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseConfigText, parsePack, type ConfigBlock } from '../../web/src/data/gen/configs';
import { parseJm2, squareCoords } from '../../web/src/data/gen/jm2';
import { isFishingSpot, KIND_META, locKind, variantOf } from '../../web/src/data/gen/kinds';
import { attachNearby, clusterByKind, type Placement } from '../../web/src/data/gen/clusters';
import { deriveLandmarks, TOWNS } from '../../web/src/data/gen/landmarks';
import { TUTORIAL_PLACES, TUTORIAL_ROUTES } from '../../web/src/data/gen/tutorialRoutes';
import { CONTENT, contentSha, DATA, enforceBudget, filesUnder, writeOrCheck } from './lib/io';
import type { Atlas, ResourceKind } from '../../web/src/tasks/types';

const check = process.argv.includes('--check');

const configFiles = filesUnder(join(CONTENT, 'scripts'), /\.(loc|npc)$/);
const mapFiles = filesUnder(join(CONTENT, 'maps'), /\.jm2$/);
const packFiles = [join(CONTENT, 'pack', 'loc.pack'), join(CONTENT, 'pack', 'npc.pack')];

// 1. name -> kind, from the configs.
const locKinds = new Map<string, ResourceKind>();
const fishingNames = new Set<string>();
for (const file of configFiles) {
  const blocks: Map<string, ConfigBlock> = parseConfigText(readFileSync(file, 'utf8'));
  const isNpc = file.endsWith('.npc');
  for (const [name, block] of blocks) {
    if (isNpc) { if (isFishingSpot(block)) fishingNames.add(name); continue; }
    const kind = locKind(block);
    if (kind) locKinds.set(name, kind);
  }
}

// 2. id -> kind, through the packs.
const locById = new Map<number, { kind: ResourceKind; variant: string }>();
for (const [id, name] of parsePack(readFileSync(packFiles[0], 'utf8'))) {
  const kind = locKinds.get(name);
  if (kind) locById.set(id, { kind, variant: variantOf(name) });
}
const npcById = new Map<number, string>();
for (const [id, name] of parsePack(readFileSync(packFiles[1], 'utf8'))) {
  if (fishingNames.has(name)) npcById.set(id, variantOf(name));
}

// 3. Placements, from the maps.
const placements: Placement[] = [];
const populated = new Set<string>();
for (const file of mapFiles) {
  const coords = squareCoords(basename(file));
  if (!coords) continue;
  populated.add(`${coords.mx}_${coords.mz}`);
  const square = parseJm2(readFileSync(file, 'utf8'), coords.mx, coords.mz);
  for (const loc of square.locs) {
    const meta = locById.get(loc.id);
    if (!meta) continue;
    placements.push({ kind: meta.kind, variant: meta.variant, level: loc.level, x: (coords.mx << 6) + loc.x, z: (coords.mz << 6) + loc.z });
  }
  for (const npc of square.npcs) {
    const variant = npcById.get(npc.id);
    if (!variant) continue;
    placements.push({ kind: 'fishing-spot', variant, level: npc.level, x: (coords.mx << 6) + npc.x, z: (coords.mz << 6) + npc.z });
  }
}

// 4. A town whose square carries no map file is a typo, not a place.
for (const town of TOWNS) {
  if (!populated.has(`${town.x >> 6}_${town.z >> 6}`)) {
    throw new Error(`landmark "${town.id}" at (${town.x}, ${town.z}) is in map square ${town.x >> 6}_${town.z >> 6}, which has no .jm2`);
  }
}

const clusters = clusterByKind(placements);

// 5. A cluster wider than the scene scan can see is a walk-to target whose members a script
// then cannot find. `r` is not bounded by the kind's clustering radius - a placement joins on
// its distance to the running centre, which drifts as members arrive - so the bound has to be
// asserted on the settled output. 52 tiles is the scene scan maximum (spec decision 4).
const MAX_SCENE_RADIUS = 52;
for (const cluster of clusters) {
  if (cluster.r > MAX_SCENE_RADIUS) {
    throw new Error(
      `cluster ${cluster.id} (${cluster.kind} ${cluster.variant} at ${cluster.x}, ${cluster.z}) settled at ` +
      `r=${cluster.r}, past the ${MAX_SCENE_RADIUS} tile scene scan maximum; lower KIND_RADIUS for this kind`);
  }
}

const landmarks = [...deriveLandmarks(clusters), ...TUTORIAL_PLACES].sort((a, b) => a.id.localeCompare(b.id));

// 6. A route whose ends are not in the landmark table is a route `routeFor` will never take:
// it resolves `from` through that table and refuses when it cannot find it. Both ends are
// checked here rather than trusted, because the failure is silent at runtime - travel simply
// plans straight through the ladder and walks at a wall.
const byId = new Map(landmarks.map(l => [l.id, l]));
for (const route of TUTORIAL_ROUTES) {
  for (const id of [route.from, route.to]) {
    const place = byId.get(id);
    if (!place) throw new Error(`route ${route.from} -> ${route.to} names landmark "${id}", which is not in the atlas`);
    if (!populated.has(`${place.x >> 6}_${place.z >> 6}`)) {
      throw new Error(`landmark "${id}" at (${place.x}, ${place.z}) is in map square ${place.x >> 6}_${place.z >> 6}, which has no .jm2`);
    }
  }
  if (!route.waypoints.some(w => w.kind === 'interact')) {
    throw new Error(`route ${route.from} -> ${route.to} has no interact waypoint, so it declares no level change at all`);
  }
}

const withNearby = attachNearby(clusters, landmarks);
const atlas: Atlas = {
  version: 1,
  source: { contentSha: contentSha([...configFiles, ...mapFiles, ...packFiles]) },
  kinds: KIND_META,
  clusters: withNearby,
  // Spec decision 11: a level change is only ever made by a route's `interact` waypoint.
  // Tutorial Island's two ladders are the only ones declared so far.
  routes: TUTORIAL_ROUTES,
  landmarks
};

console.log(`${placements.length} placements -> ${clusters.length} clusters, ${atlas.landmarks.length} landmarks`);
const bytes = new TextEncoder().encode(JSON.stringify(atlas));
enforceBudget('atlas.json', bytes, { rawBytes: 250 * 1024, gzipBytes: 80 * 1024 });
writeOrCheck(join(DATA, 'atlas.json'), bytes, check);
