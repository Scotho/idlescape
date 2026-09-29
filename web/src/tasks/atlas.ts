// The atlas at runtime: fetched once per Worker, on the first call that needs it, and cached.
// It is a Vite `?url` asset (plan ruling R5), so it costs the shell's first paint nothing and
// arrives content-hashed - a regenerated atlas is a new URL, never a stale cache entry.
import atlasUrl from '../data/atlas.json?url';
import type { Atlas, AtlasCluster, AtlasLandmark, FindOpts, ResourceKind } from './types';

export interface AtlasLoaderDeps {
  url?: string;
  fetchImpl?: typeof fetch;
}

export interface AtlasLoader {
  /** The atlas, or null when it could not be fetched. Retries on the next call. */
  load(): Promise<Atlas | null>;
  /** What `load` already resolved, without starting a fetch. Null until it has. */
  peek(): Atlas | null;
  nearestCluster(atlas: Atlas, kind: ResourceKind, from: { x: number; z: number; level: number }, opts?: FindOpts): AtlasCluster | null;
  landmark(atlas: Atlas, id: string): AtlasLandmark | null;
}

/**
 * `FindOpts.variant` documents a string as a case-insensitive match, and `find.ts` compares
 * scene names that way. Comparing cluster variants exactly would have made the same option mean
 * two things across the two layers, so `variant: 'Oaktree'` matched the scene and silently found
 * zero clusters. A RegExp is still tested exactly as the caller wrote it.
 */
const matches = (variant: string, want: FindOpts['variant']): boolean =>
  want === undefined ? true : typeof want === 'string' ? variant.toLowerCase() === want.toLowerCase() : want.test(variant);

export function createAtlasLoader(deps: AtlasLoaderDeps = {}): AtlasLoader {
  const url = deps.url ?? atlasUrl;
  const doFetch = deps.fetchImpl ?? ((input: RequestInfo | URL) => fetch(input));
  let atlas: Atlas | null = null;
  let inFlight: Promise<Atlas | null> | null = null;

  return {
    peek: () => atlas,
    async load() {
      if (atlas) return atlas;
      // One fetch for every concurrent caller; a failure clears the promise so the next call
      // tries again rather than caching "the network was down once".
      inFlight ??= (async () => {
        try {
          const res = await doFetch(url);
          if (!res.ok) throw new Error(`atlas fetch failed: ${res.status}`);
          atlas = (await res.json()) as Atlas;
          return atlas;
        } catch {
          return null;
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    },
    nearestCluster(a, kind, from, opts = {}) {
      let best: AtlasCluster | null = null;
      let bestDist = Infinity;
      for (const c of a.clusters) {
        if (c.kind !== kind || c.level !== from.level || !matches(c.variant, opts.variant)) continue;
        const dist = Math.max(Math.abs(c.x - from.x), Math.abs(c.z - from.z));
        if (opts.maxDistance !== undefined && dist > opts.maxDistance) continue;
        if (dist < bestDist) { best = c; bestDist = dist; }
      }
      return best;
    },
    landmark: (a, id) => a.landmarks.find(l => l.id === id) ?? null
  };
}
