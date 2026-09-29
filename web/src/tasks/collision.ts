// The collision bitset at runtime: fetched on the first `travel.to`, decoded, and handed to the
// vendored pathfinder. Both files are Vite `?url` assets (plan ruling R5), so they cost the
// shell's first paint nothing and a regenerated file is a new URL rather than a stale cache.
import binAsset from '../data/collision.bin?url';
import doorsAsset from '../data/doors.json?url';
import { decodeCollision } from '../data/gen/collisionFile';
import { initPathfinding, type DoorInfo } from '../vendor/rs-sdk/sdk/pathfinding';

export interface CollisionLoaderDeps { binUrl?: string; doorsUrl?: string; fetchImpl?: typeof fetch }
export interface CollisionLoader {
  /** True once the pathfinder holds real data. False leaves it permissive, as SP4a shipped. */
  load(): Promise<boolean>;
  ready(): boolean;
}

interface DoorsFile { doors: DoorInfo[] }

export function createCollisionLoader(deps: CollisionLoaderDeps = {}): CollisionLoader {
  const binUrl = deps.binUrl ?? binAsset;
  const doorsUrl = deps.doorsUrl ?? doorsAsset;
  const doFetch = deps.fetchImpl ?? ((input: RequestInfo | URL) => fetch(input));
  let ready = false;
  let inFlight: Promise<boolean> | null = null;

  return {
    ready: () => ready,
    load() {
      if (ready) return Promise.resolve(true);
      inFlight ??= (async () => {
        try {
          const [bin, doors] = await Promise.all([doFetch(binUrl), doFetch(doorsUrl)]);
          if (!bin.ok || !doors.ok) throw new Error(`collision fetch failed: ${bin.status}/${doors.status}`);
          const grid = decodeCollision(await bin.arrayBuffer());
          // A door row carries no `blockrange` in the file; the vendored type wants one, and
          // nothing in our path queries reads it (it is a projectile rule, not a walk rule).
          const rows = ((await doors.json()) as DoorsFile).doors.map(d => ({ ...d, blockrange: false }));
          initPathfinding({ grid, doors: rows });
          ready = true;
          return true;
        } catch {
          return false;
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    }
  };
}
