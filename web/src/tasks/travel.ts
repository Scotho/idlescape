// `c.travel`: getting somewhere that is not in the current scene. `bot.walkTo` is a good local
// walker (it re-queries the path, opens doors, gives up on a dead end); this is the layer above
// it that resolves a target, follows a declared route when one exists, splits the rest into legs
// small enough for one scene, and reports a typed reason when it stops.
import type { AtlasLoader } from './atlas';
import type { CollisionLoader } from './collision';
import type {
  Atlas, AtlasRoute, RouteWaypoint, ScriptContext, TravelOpts, TravelResult, TravelTarget
} from './types';
import type { ActionResult, WorldState } from '../agent/types';

/**
 * One leg has to land inside the scene the client has built: 104 x 104 tiles centred on the
 * player, so 52 tiles in any direction. The spec asks for legs of at most 60, which 52
 * satisfies, and 52 is the number the geometry actually supports - a 60-tile leg target sits
 * outside the scene `walkTo` can path across.
 */
export const MAX_LEG_TILES = 52;
/**
 * How close the player has to be to a route's `from` landmark for that route to connect. One
 * scene half-width, the same bound a single leg uses: a route is taken up only when its start
 * is somewhere travel could reach in one leg anyway.
 */
const ROUTE_START_TILES = MAX_LEG_TILES;
const DEFAULT_TOLERANCE = 2;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_LEGS = 24;

export interface TravelDeps {
  state(): WorldState;
  bot: { walkTo(x: number, z: number, tolerance?: number): Promise<ActionResult> };
  atlas: AtlasLoader;
  collision: CollisionLoader;
  status(text: string): void;
  /** Performs a route's `interact` waypoint (a ladder, a gate). Wired in `workerContext`. */
  interact(waypoint: Extract<RouteWaypoint, { kind: 'interact' }>): Promise<ActionResult>;
  signal(): AbortSignal;
  now(): number;
}

export type Travel = ScriptContext['travel'];

/**
 * The travel layer as the Worker holds it: everything a script sees, plus the running total of
 * tiles this run has actually walked. The counter lives here rather than being parsed back out
 * of the trace because this is the only module that knows which movement was travel's own, and
 * `tiles()` is deliberately off `ScriptContext['travel']`: it is for the run summary, not for
 * script code to steer on.
 */
export interface TravelLayer extends Travel { tiles(): number }

const chebyshev = (ax: number, az: number, bx: number, bz: number): number =>
  Math.max(Math.abs(ax - bx), Math.abs(az - bz));

/** Coordinates for a target, or null when the atlas does not know it. */
export function resolveTarget(target: TravelTarget, atlas: Atlas | null, playerLevel: number): { x: number; z: number; level: number } | null {
  if ('landmark' in target) {
    const found = atlas?.landmarks.find(l => l.id === target.landmark);
    return found ? { x: found.x, z: found.z, level: found.level } : null;
  }
  if ('cluster' in target) return { x: target.cluster.x, z: target.cluster.z, level: target.cluster.level };
  return { x: target.x, z: target.z, level: target.level ?? playerLevel };
}

export function createTravel(d: TravelDeps): TravelLayer {
  /** Every tile walked by every `to()` call of this run, which is what the run summary reports. */
  let walked = 0;
  const here = (): { x: number; z: number; level: number } => {
    const p = d.state().player;
    return { x: p?.worldX ?? 0, z: p?.worldZ ?? 0, level: p?.level ?? 0 };
  };

  /**
   * The route that connects where the player stands to where they are going, or null. A route
   * declares both ends and the level it starts on, and all three have to hold: matching `to`
   * alone would follow a route whose first waypoint is across the map, from wherever the player
   * happens to be. An unknown `from` landmark is a route that cannot be shown to connect, so it
   * is not used.
   */
  const routeFor = (atlas: Atlas | null, target: TravelTarget, from: { x: number; z: number; level: number }): AtlasRoute | null => {
    if (!atlas || !('landmark' in target)) return null;
    return atlas.routes.find(r => {
      if (r.to !== target.landmark || r.level !== from.level) return false;
      const start = atlas.landmarks.find(l => l.id === r.from);
      return start !== undefined && chebyshev(from.x, from.z, start.x, start.z) <= ROUTE_START_TILES;
    }) ?? null;
  };

  async function to(target: TravelTarget, opts: TravelOpts = {}): Promise<TravelResult> {
    const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
    const deadline = d.now() + (opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const maxLegs = opts.maxLegs ?? DEFAULT_MAX_LEGS;
    // The collision data is what makes a leg follow the ground rather than the straight line.
    // A failed load leaves the pathfinder permissive, which is SP4a's behaviour, not an error.
    await d.collision.load();
    // Only a landmark target needs the atlas, and `AtlasLoader.load` retries a failed fetch on
    // every call: fetching for a coordinate target would re-attempt a dead fetch on every lap
    // of a script's loop, for an answer it never reads.
    const atlas = 'landmark' in target ? (d.atlas.peek() ?? await d.atlas.load()) : d.atlas.peek();
    const start = here();
    const destination = resolveTarget(target, atlas, start.level);
    if (!destination) return { success: false, reason: 'unreachable', legs: 0, tiles: 0 };

    const route = routeFor(atlas, target, start);
    // Spec decision 11: a level change is only ever made by a route's `interact` waypoint.
    if (destination.level !== start.level && !route) {
      return { success: false, reason: 'needs_route', stoppedAt: { x: start.x, z: start.z }, legs: 0, tiles: 0 };
    }

    const waypoints: RouteWaypoint[] = route
      ? route.waypoints
      : [{ kind: 'walk', x: destination.x, z: destination.z }];

    let legs = 0;
    let tiles = 0;
    let replanned = false;
    let stalled = 0;

    for (const waypoint of waypoints) {
      if (waypoint.kind === 'interact') {
        if (d.signal().aborted) return stop('aborted');
        if (d.now() > deadline) return stop('timeout');
        d.status(`${waypoint.op} the ${waypoint.locName}`);
        const result = await d.interact(waypoint);
        if (!result.success) return stop('unreachable');
        continue;
      }
      // Walk to this waypoint in scene-sized legs, re-reading the player between each so a
      // partial walk is progress rather than a restart.
      for (;;) {
        if (d.signal().aborted) return stop('aborted');
        if (d.now() > deadline) return stop('timeout');
        if (legs >= maxLegs) return stop('unreachable');
        const from = here();
        const remaining = chebyshev(from.x, from.z, waypoint.x, waypoint.z);
        if (remaining <= tolerance) break;
        const leg = stepToward(from, waypoint);
        d.status(`Travelling to ${waypoint.x}, ${waypoint.z} (${remaining} tiles)`);
        await d.bot.walkTo(leg.x, leg.z, tolerance);
        legs++;
        const after = here();
        const moved = chebyshev(from.x, from.z, after.x, after.z);
        tiles += moved;
        walked += moved;
        if (moved > 0) { stalled = 0; continue; }
        stalled++;
        // One re-plan, then say so. A walker that keeps re-trying a leg it cannot walk is the
        // "stuck in a doorway for the whole run" failure the health monitor should never have
        // to catch for us.
        if (stalled >= 2) {
          if (replanned) return stop('unreachable');
          replanned = true;
          stalled = 0;
        }
      }
    }

    // A route's last `walk` waypoint is where its author says arrival looks like: a route that
    // deliberately ends at a bank door rather than on top of the landmark tile has still
    // arrived. Only a straight-planned travel is measured against the landmark itself.
    const lastWalk = route?.waypoints.filter(w => w.kind === 'walk').at(-1);
    const goal = lastWalk ?? destination;
    const end = here();
    // The level is checked as well as the distance. A route's `interact` can report success on a
    // click that landed while the transition did not happen, and spec decision 11 is only half
    // kept if travel then says it arrived from the wrong plane.
    const arrived = chebyshev(end.x, end.z, goal.x, goal.z) <= tolerance && end.level === destination.level;
    return { success: arrived, ...(arrived ? {} : { reason: 'unreachable' as const }), stoppedAt: { x: end.x, z: end.z }, legs, tiles };

    function stop(reason: TravelResult['reason']): TravelResult {
      const at = here();
      return { success: false, reason, stoppedAt: { x: at.x, z: at.z }, legs, tiles };
    }
  }

  /** The furthest point toward `to` that is still inside one scene. */
  function stepToward(from: { x: number; z: number }, to: { x: number; z: number }): { x: number; z: number } {
    const dist = chebyshev(from.x, from.z, to.x, to.z);
    if (dist <= MAX_LEG_TILES) return { x: to.x, z: to.z };
    const ratio = MAX_LEG_TILES / dist;
    return {
      x: Math.round(from.x + (to.x - from.x) * ratio),
      z: Math.round(from.z + (to.z - from.z) * ratio)
    };
  }

  return {
    to,
    tiles: () => walked,
    distanceTo(target) {
      const from = here();
      const destination = resolveTarget(target, d.atlas.peek(), from.level);
      return destination ? chebyshev(from.x, from.z, destination.x, destination.z) : Infinity;
    }
  };
}
