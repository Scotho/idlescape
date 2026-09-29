// Placements into clusters. Tens of thousands of loc placements match the resource kinds; one
// row each would be a ~900 KB atlas, and the budget is 250 KB (spec decision 2), so adjacent
// placements of the same kind and variant collapse into one row with a centre, a count and a
// radius.
import { regionId } from '../../tasks/library/regions';
import type { AtlasCluster, ResourceKind } from '../../tasks/types';

export interface Placement { kind: ResourceKind; variant: string; level: number; x: number; z: number }

/** Spec decision 3: 6 tiles. Two oaks 7 tiles apart are two places to walk to, not one. */
export const DEFAULT_RADIUS = 6;

interface Building { kind: ResourceKind; variant: string; level: number; sx: number; sz: number; n: number; members: Placement[] }

const bucketKey = (p: { kind: string; variant: string; level: number }, bx: number, bz: number): string =>
  `${p.kind}|${p.variant}|${p.level}|${bx}|${bz}`;

/**
 * Greedy agglomeration over a spatial hash: each placement joins the nearest open cluster of
 * its own kind, variant and level whose running centre is within `radius`, or starts one.
 * The input is sorted first, so the output does not depend on the order the map files were
 * read - a generator whose bytes move for no reason makes the committed-output drift check
 * (`scripts/build.ps1`) useless.
 */
export function clusterPlacements(items: Placement[], radius: number = DEFAULT_RADIUS): AtlasCluster[] {
  const sorted = [...items].sort((a, b) =>
    a.kind.localeCompare(b.kind) || a.variant.localeCompare(b.variant) || a.level - b.level || a.x - b.x || a.z - b.z);
  const buckets = new Map<string, Building[]>();
  const all: Building[] = [];
  const cell = Math.max(1, radius);

  for (const p of sorted) {
    const bx = Math.floor(p.x / cell), bz = Math.floor(p.z / cell);
    let best: Building | null = null;
    let bestDist = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const candidate of buckets.get(bucketKey(p, bx + dx, bz + dz)) ?? []) {
          const cx = candidate.sx / candidate.n, cz = candidate.sz / candidate.n;
          const dist = Math.max(Math.abs(cx - p.x), Math.abs(cz - p.z));
          if (dist <= radius && dist < bestDist) { best = candidate; bestDist = dist; }
        }
      }
    }
    if (best) {
      best.sx += p.x; best.sz += p.z; best.n += 1; best.members.push(p);
      continue;
    }
    const built: Building = { kind: p.kind, variant: p.variant, level: p.level, sx: p.x, sz: p.z, n: 1, members: [p] };
    all.push(built);
    const key = bucketKey(p, bx, bz);
    const list = buckets.get(key) ?? [];
    buckets.set(key, list);
    list.push(built);
  }

  return all.map((b, i) => {
    const x = Math.round(b.sx / b.n), z = Math.round(b.sz / b.n);
    const r = b.members.reduce((max, m) => Math.max(max, Math.abs(m.x - x), Math.abs(m.z - z)), 0);
    return {
      id: i + 1, kind: b.kind, variant: b.variant, level: b.level, x, z, n: b.n, r,
      region: regionId(x >> 6, z >> 6)
    } satisfies AtlasCluster;
  });
}

/**
 * Per-kind cluster radius. Spec decision 3 named one 6-tile radius for every kind and section 8
 * flagged "a 6-tile cluster radius keeps the atlas under budget" as an assumption to confirm.
 * It does not hold: at 6 tiles the whole-map atlas is 825 KB against a 250 KB budget, and 87% of
 * the rows are forest, where one row per handful of trees carries no navigational information.
 * The atlas answers "which neighbourhood" and the scene scan answers "which object", so the
 * dense renewable kinds cluster coarsely while the singleton kinds a script interacts with by
 * tile - bank, furnace, anvil, range, altar, fishing spot - keep the 6-tile radius.
 *
 * A radius is not a bound on the settled cluster's `r`: a placement joins on its distance to
 * the *running* centre, and that centre then drifts, so members can end up further out than
 * the radius admitted. On the current content the widest tree cluster settles at r=46 against
 * a radius of 32, and the widest rock at r=18 against 16. What has to hold is that `r` stays
 * inside the 52-tile scene scan maximum (decision 4), so a walk to a cluster centre always
 * leaves its members inside a scan; `scripts/gen/atlas.ts` asserts it on every generated
 * cluster rather than leaving it to these numbers.
 */
export const KIND_RADIUS: Partial<Record<ResourceKind, number>> = { tree: 32, rock: 16, fire: 16 };

/**
 * `clusterPlacements` once per kind, at that kind's radius, renumbered into one id space.
 * Kinds are visited in name order so the ids are stable across runs.
 */
export function clusterByKind(
  items: Placement[],
  radii: Partial<Record<ResourceKind, number>> = KIND_RADIUS,
  fallback: number = DEFAULT_RADIUS
): AtlasCluster[] {
  const kinds = [...new Set(items.map(p => p.kind))].sort();
  const out: AtlasCluster[] = [];
  for (const kind of kinds) {
    for (const cluster of clusterPlacements(items.filter(p => p.kind === kind), radii[kind] ?? fallback)) {
      out.push({ ...cluster, id: out.length + 1 });
    }
  }
  return out;
}

/**
 * The landmarks within 50 tiles of each cluster, as `near`. It is what makes a cluster
 * addressable in prose ("the trees by Lumbridge castle") without a second lookup, and it is
 * the field `travel` uses to decide whether a route connects the two.
 */
export function attachNearby(clusters: AtlasCluster[], landmarks: { id: string; level: number; x: number; z: number }[], radius = 50): AtlasCluster[] {
  return clusters.map(c => {
    const near = landmarks
      .filter(l => l.level === c.level && Math.max(Math.abs(l.x - c.x), Math.abs(l.z - c.z)) <= radius)
      .map(l => l.id);
    return near.length ? { ...c, near } : c;
  });
}
