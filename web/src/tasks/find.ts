// `c.find`: three widening layers of "where is the nearest X", tried in order and reported so
// the trace says which one answered.
//
// Layer 1 is the current snapshot (and, past 15 tiles, an on-demand SDK re-scan). Layer 2 is the
// static atlas plus a `travel.to` to the cluster it names. Layer 3 walks a ring of scan points
// around the anchor. There is no camera layer: panning the client's camera changes nothing the
// bot can see, because the collector reads the scene graph, not the render view.
import { KIND_META } from '../data/gen/kinds';
import type { AtlasLoader } from './atlas';
import type { Travel } from './travel';
import type {
  AtlasCluster, AtlasLandmark, FindOpts, FoundTarget, ResourceKind, ScriptContext, SweepOpts, TargetEvent
} from './types';
import type { WorldState } from '../agent/types';
import type { NearbyLoc, NearbyNpc } from '../vendor/rs-sdk/sdk/types';

/** The collector's own scan. Anything wider has to be asked for. */
export const DEFAULT_RADIUS = 15;
/** Spec decision 4. The scene is 104 x 104 tiles, so 52 is the furthest that is built. */
export const MAX_RADIUS = 52;
export const SWEEP_RINGS = [20, 40, 60];
export const SWEEP_POINTS = 8;
export const DEFAULT_SWEEP_TILES = 200;
/** `travel.to` lands within its default tolerance of the tile it aimed at, not on it. */
const ARRIVAL_SLACK = 2;

export interface FindDeps {
  state(): WorldState;
  sdk: { scanNearbyLocs(radius?: number): Promise<NearbyLoc[]> };
  atlas: AtlasLoader;
  travel: Travel;
  status(text: string): void;
  trace(event: TargetEvent): void;
  signal(): AbortSignal;
}

export type Find = ScriptContext['find'];

/** Anything in the scene that carries a display name and a menu: a loc or an npc. */
export interface SceneEntry { name: string; options?: string[] }

const chebyshev = (ax: number, az: number, bx: number, bz: number): number =>
  Math.max(Math.abs(ax - bx), Math.abs(az - bz));

const nameMatches = (name: string, want: FindOpts['variant']): boolean =>
  want === undefined ? true : typeof want === 'string' ? name.toLowerCase() === want.toLowerCase() : want.test(name);

/**
 * How a scene entry is recognised as a kind. An op is only used where every config of that kind
 * publishes one, which is true of exactly two kinds: 35 of 35 `category=tree` configs carry a
 * `Chop down` op, bar the one Achey tree that says just `Chop`, and 52 of 52 `mining_rock*`
 * configs carry `Mine`. The `-down` alternative serves no atlas tree at all: the only five
 * `Chop-down` blocks in the content are the Kharazi Jungle Trees and Jungle Bushes, which are
 * `category=jungle_tree`/`jungle_bush` and so are not clustered. It is kept because a script
 * standing in that jungle should still be told what it can chop. Everywhere
 * else the op in `KIND_META` is the script's *intent*, not a menu entry the loc offers - fires
 * (0 of 10 configs), anvils (0 of 3), ranges (1 of 8) and furnaces (5 of 9) are used by putting
 * an item on them, so requiring the op would make those kinds unfindable. Those match the `name=`
 * the content gives them, which is the same field the client shows and the collector reports.
 *
 * Banks and fishing spots take either: the two bankable names (as `kinds.ts` already rules, so
 * the scene agrees with the atlas) plus the `Bank` op that `Open chest` carries, and the one
 * name all 51 fishing-spot npcs share plus the five fishing ops.
 *
 * Altars match on the name because their op is not one op: 13 of 21 offer `Craft-rune`, 6 offer
 * `Pray-at`, and `Altar slab` offers neither, so an op test would hide two thirds of them.
 */
const SCENE_MATCH: Record<ResourceKind, { op?: RegExp; name?: RegExp }> = {
  tree: { op: /^chop([- ]down)?$/i },
  rock: { op: /^mine$/i },
  'fishing-spot': { name: /^fishing spot$/i, op: /^(net|bait|lure|cage|harpoon|fish)$/i },
  bank: { name: /^bank (booth|chest)$/i, op: /^bank$/i },
  furnace: { name: /^furnace$/i },
  anvil: { name: /^anvil$/i },
  range: { name: /^(cooking )?range$/i },
  fire: { name: /^(fire|fireplace|cooking pot)$/i },
  altar: { name: /\baltar\b/i }
};

/** Whether one scene entry is this kind, by its op where the content always gives one, else by name. */
export function matchesKind(kind: ResourceKind, entry: SceneEntry): boolean {
  const rule = SCENE_MATCH[kind];
  if (rule.name?.test(entry.name)) return true;
  return rule.op !== undefined && (entry.options ?? []).some(o => rule.op?.test(o) === true);
}

/**
 * How wide to look after walking to a cluster. `travel.to({ cluster })` aims at the cluster's
 * centre, but a cluster is built to a per-kind radius and the measured `r` runs well past the
 * default scan: trees reach 46 and rocks 18. Scanning 15 tiles from the centre of a 46-tile
 * cluster finds nothing while standing in the middle of it, so the cluster's own `r` sets the
 * radius, plus the tolerance travel stopped within, capped at what the scene can hold.
 */
export function rescanRadius(cluster: AtlasCluster, opts: FindOpts = {}): number {
  return Math.min(MAX_RADIUS, Math.max(opts.radius ?? DEFAULT_RADIUS, cluster.r + ARRIVAL_SLACK));
}

export function createFind(d: FindDeps): Find {
  const here = (): { x: number; z: number; level: number } => {
    const p = d.state().player;
    return { x: p?.worldX ?? 0, z: p?.worldZ ?? 0, level: p?.level ?? 0 };
  };

  const report = (target: FoundTarget): FoundTarget => {
    d.trace({
      kind: 'target', via: target.via, kind_: target.kind, name: target.name,
      x: target.x, z: target.z, distance: target.distance
    });
    return target;
  };

  /** Layer 1. Fishing spots are npcs; everything else is a loc. */
  async function scene(kind: ResourceKind, opts: FindOpts, via: 'scene' | 'sweep'): Promise<FoundTarget | null> {
    const radius = Math.min(opts.radius ?? DEFAULT_RADIUS, MAX_RADIUS);
    const wanted = (e: SceneEntry & { reachable?: boolean; distance: number }): boolean =>
      matchesKind(kind, e) && nameMatches(e.name, opts.variant)
      && (opts.reachableOnly === false || e.reachable !== false) && e.distance <= radius;
    const from = here();

    if (kind === 'fishing-spot') {
      // Npcs only ever arrive on the snapshot; there is no on-demand npc scan to widen.
      const npc = (d.state().nearbyNpcs ?? []).filter((n: NearbyNpc) => wanted(n)).sort((a, b) => a.distance - b.distance)[0];
      return npc
        ? { via, kind, name: npc.name, x: npc.tileX ?? npc.x, z: npc.tileZ ?? npc.z, level: from.level, distance: npc.distance, npc }
        : null;
    }

    // The collector's own scan is 15 tiles; past that the SDK has to ask the client to walk the
    // built scene again, which also re-fills the reach probe. Its answer replaces the snapshot's
    // loc list rather than joining it, because the snapshot only ever holds the narrow set.
    const scanned = radius > DEFAULT_RADIUS ? await d.sdk.scanNearbyLocs(radius).catch(() => null) : null;
    const loc = (scanned ?? d.state().nearbyLocs ?? []).filter((l: NearbyLoc) => wanted(l)).sort((a, b) => a.distance - b.distance)[0];
    return loc ? { via, kind, name: loc.name, x: loc.x, z: loc.z, level: loc.level, distance: loc.distance, loc } : null;
  }

  function nearestAtlas(kind: ResourceKind, opts: FindOpts = {}): AtlasCluster | null {
    const atlas = d.atlas.peek();
    return atlas ? d.atlas.nearestCluster(atlas, kind, here(), opts) : null;
  }

  /** SWEEP_POINTS points on each ring, nearest ring first. */
  function ringPoints(anchor: { x: number; z: number }): { x: number; z: number }[] {
    const out: { x: number; z: number }[] = [];
    for (const radius of SWEEP_RINGS) {
      for (let i = 0; i < SWEEP_POINTS; i++) {
        const angle = (i / SWEEP_POINTS) * Math.PI * 2;
        out.push({ x: Math.round(anchor.x + Math.cos(angle) * radius), z: Math.round(anchor.z + Math.sin(angle) * radius) });
      }
    }
    return out;
  }

  /** The centres of the eight neighbouring zone groups (8 tiles to a zone, 8 zones across). */
  function zonePoints(anchor: { x: number; z: number }): { x: number; z: number }[] {
    const step = 64;
    const out: { x: number; z: number }[] = [];
    for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) {
      if (dx === 0 && dz === 0) continue;
      out.push({ x: anchor.x + dx * step, z: anchor.z + dz * step });
    }
    return out;
  }

  async function sweep(kind: ResourceKind, opts: SweepOpts & FindOpts = {}): Promise<FoundTarget | null> {
    const budget = opts.maxTiles ?? DEFAULT_SWEEP_TILES;
    const anchor = opts.anchor ?? { x: here().x, z: here().z };
    const points = opts.pattern === 'zones' ? zonePoints(anchor) : ringPoints(anchor);
    let walked = 0;
    for (let i = 0; i < points.length; i++) {
      if (d.signal().aborted) return null;
      if (walked >= budget) return null;
      d.status(`Looking for a ${KIND_META[kind].label}, ${i + 1} of ${points.length}`);
      const result = await d.travel.to({ x: points[i].x, z: points[i].z });
      walked += result.tiles;
      const found = await scene(kind, opts, 'sweep');
      if (found) return report(found);
    }
    return null;
  }

  async function nearest(kind: ResourceKind, opts: FindOpts = {}): Promise<FoundTarget | null> {
    const inScene = await scene(kind, opts, 'scene');
    if (inScene) return report(inScene);
    if (d.signal().aborted) return null;

    // Tutorial Island has no tree cluster at all, so a null atlas is a normal answer here, not a
    // failure: it simply widens straight to the sweep.
    await d.atlas.load();
    const cluster = nearestAtlas(kind, opts);
    if (cluster && !d.signal().aborted) {
      d.status(`Walking to the nearest ${KIND_META[kind].label}`);
      const trip = await d.travel.to({ cluster });
      if (trip.success) {
        // `variant` is dropped for the re-scan: the cluster was already chosen by it, and it is
        // a content debug name ('oaktree') that no display name ('Oak') would ever equal.
        const at = await scene(kind, { ...opts, variant: undefined, radius: rescanRadius(cluster, opts) }, 'scene');
        // The cluster is where the content places the resource; the scene is the truth about
        // what is standing there now. Report the cluster either way so a script can retry it.
        const from = here();
        return report(at
          ? { ...at, via: 'atlas', cluster }
          : {
            via: 'atlas', kind, name: cluster.variant, x: cluster.x, z: cluster.z, level: cluster.level,
            distance: chebyshev(cluster.x, cluster.z, from.x, from.z), cluster
          });
      }
    }

    return sweep(kind, opts);
  }

  return {
    nearest,
    nearestAtlas,
    sweep,
    landmark: (id: string): AtlasLandmark | null => {
      const atlas = d.atlas.peek();
      return atlas ? d.atlas.landmark(atlas, id) : null;
    }
  };
}
