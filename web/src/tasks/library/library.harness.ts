// web/src/tasks/library/library.harness.ts
// A `ScriptContext` for the three bundled scripts, built over the REAL `c.find` and `c.travel`
// rather than stubs of them. That is the whole point: Task 12's claim is that a library script
// now discovers and walks to its own resource, and a fake `find` that hands back whatever the
// test names would prove nothing about which layer answered or how far the run walked.
//
// What is faked is only what sits below those two layers: the snapshot, the atlas fetch, and the
// bot actions. Each fake refuses what the real thing refuses - `state().nearbyLocs` holds only
// the collector's own 15-tile scan, so a wider search has to go through `scanNearbyLocs`; the
// atlas is the real loader over a stub fetch, so `peek()` is null until `load()` resolves; and
// `walkTo` moves the player, so travel measures real progress.
//
// This file imports NOTHING from vitest, deliberately. tsconfig excludes `src/**/*.test.ts` but
// not `*.harness.ts`, so a vitest import here pulls its ambient types into the shipped program.
import { createAtlasLoader } from '../atlas';
import { createFind, DEFAULT_RADIUS } from '../find';
import { createTravel } from '../travel';
import type { Atlas, ScriptContext, Task } from '../types';
import type { ActionResult, WorldState } from '../../agent/types';
import type { NearbyLoc, NearbyNpc } from '../../vendor/rs-sdk/sdk/types';

export const cheb = (ax: number, az: number, bx: number, bz: number): number =>
  Math.max(Math.abs(ax - bx), Math.abs(az - bz));

export interface HarnessLoc { name: string; x: number; z: number; options: string[]; reachable?: boolean }
export interface HarnessNpc { name: string; x: number; z: number; options: string[]; reachable?: boolean }

/** Small on purpose: every cluster and every spawn in it is named by the test that uses it. */
export const ATLAS: Atlas = {
  version: 1, source: { contentSha: 'test' },
  kinds: {} as Atlas['kinds'],
  clusters: [
    { id: 1, kind: 'tree', variant: 'oaktree', level: 0, x: 3240, z: 3205, n: 4, r: 6, region: 0 },
    { id: 2, kind: 'tree', variant: 'tree2', level: 0, x: 3400, z: 3205, n: 9, r: 6, region: 0 },
    { id: 3, kind: 'rock', variant: 'tinrock1', level: 0, x: 3205, z: 3200, n: 3, r: 6, region: 0 },
    { id: 4, kind: 'rock', variant: 'copperrock1', level: 0, x: 3230, z: 3210, n: 3, r: 6, region: 0 },
    { id: 5, kind: 'fishing-spot', variant: 'freshfish', level: 0, x: 3210, z: 3200, n: 2, r: 6, region: 0 },
    { id: 6, kind: 'fishing-spot', variant: 'saltfish', level: 0, x: 3240, z: 3205, n: 2, r: 6, region: 0 }
  ],
  landmarks: [], routes: []
};

export interface HarnessOpts {
  locs?: HarnessLoc[];
  npcs?: HarnessNpc[];
  /** Omit for `ATLAS`; pass null for a Worker whose atlas fetch failed. */
  atlas?: Atlas | null;
  params?: Record<string, unknown>;
  inventory?: { slot: number; id: number; name: string; count: number }[];
  /** What one successful interaction puts in the inventory, so a `wait.until` can come true. */
  yields?: { id: number; name: string };
  /** Make every interaction fail the way an out-of-reach click does. */
  interactFails?: boolean;
}

export interface HarnessCalls {
  interactLoc: { name: string; x: number; z: number; op: string }[];
  interactNpc: { name: string; x: number; z: number; op: string }[];
  chopTree: string[];
  dropped: string[];
  waited: string[];
  status: string[];
  walked: { x: number; z: number }[];
}

export interface LibraryHarness {
  ctx: ScriptContext;
  calls: HarnessCalls;
  player: { worldX: number; worldZ: number; level: number };
}

const FAILED: ActionResult = { success: false, message: 'cant reach', reason: 'cant_reach' };

/** The run half of a bundled script's task, by script id and task name. */
export function taskOf(script: { tasks: Task[] }, taskName: string): Task {
  const found = script.tasks.find(t => t.name === taskName);
  if (!found) throw new Error(`no task ${taskName}`);
  return found;
}

export function libraryHarness(opts: HarnessOpts = {}): LibraryHarness {
  const player = { worldX: 3200, worldZ: 3200, level: 0 };
  const inventory = [...(opts.inventory ?? [])];
  const calls: HarnessCalls = { interactLoc: [], interactNpc: [], chopTree: [], dropped: [], waited: [], status: [], walked: [] };
  const ok: ActionResult = { success: true, message: 'ok' };

  const locsWithin = (radius: number): NearbyLoc[] => (opts.locs ?? [])
    .filter(l => cheb(l.x, l.z, player.worldX, player.worldZ) <= radius)
    .map(l => ({
      id: 1, name: l.name, x: l.x, z: l.z, level: 0, options: l.options, optionsWithIndex: [],
      reachable: l.reachable ?? true, distance: cheb(l.x, l.z, player.worldX, player.worldZ)
    } as unknown as NearbyLoc));

  const npcsSeen = (): NearbyNpc[] => (opts.npcs ?? []).map(n => ({
    kind: 'npc', id: 1, index: 1, name: n.name, x: n.x, z: n.z, tileX: n.x, tileZ: n.z,
    options: n.options, optionsWithIndex: [], reachable: n.reachable ?? true,
    distance: cheb(n.x, n.z, player.worldX, player.worldZ)
  } as unknown as NearbyNpc));

  const state = (): WorldState => ({
    player: { ...player },
    // The collector publishes only its own narrow scan; anything wider is an sdk re-scan.
    nearbyLocs: locsWithin(DEFAULT_RADIUS),
    nearbyNpcs: npcsSeen(),
    inventory: [...inventory],
    skills: []
  } as unknown as WorldState);

  const body = 'atlas' in opts ? opts.atlas : ATLAS;
  const fetchImpl = (body === null
    ? async () => { throw new Error('offline'); }
    : async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;
  const atlas = createAtlasLoader({ url: '/atlas.json', fetchImpl });

  const abort = new AbortController();
  const status = (text: string): void => { calls.status.push(text); };
  const travel = createTravel({
    state,
    bot: {
      async walkTo(x: number, z: number) {
        calls.walked.push({ x, z });
        player.worldX = x; player.worldZ = z;
        return ok;
      }
    },
    atlas,
    collision: { load: async () => true, ready: () => true },
    status,
    interact: async () => ({ success: false, message: 'the harness declares no routes' }),
    signal: () => abort.signal,
    now: () => Date.now()
  });

  const find = createFind({
    state,
    sdk: { scanNearbyLocs: async (radius = DEFAULT_RADIUS) => locsWithin(radius) },
    atlas, travel, status,
    trace: () => undefined,
    signal: () => abort.signal
  });

  const interacted = (): ActionResult => {
    if (opts.interactFails) return FAILED;
    if (opts.yields) inventory.push({ slot: inventory.length, count: 1, ...opts.yields });
    return ok;
  };

  const ctx = {
    state, params: opts.params ?? {}, status, log: () => undefined,
    memory: new Map<string, unknown>(), signal: abort.signal,
    find, travel,
    bot: {
      async interactLoc(loc: NearbyLoc, op: string) {
        calls.interactLoc.push({ name: loc.name, x: loc.x, z: loc.z, op });
        return interacted();
      },
      async interactNpc(npc: NearbyNpc, op: string) {
        calls.interactNpc.push({ name: npc.name, x: npc.x, z: npc.z, op });
        return interacted();
      },
      async chopTree(kind: string) {
        calls.chopTree.push(kind);
        // The real `chopTree` resolves its target out of the current snapshot by display name
        // (`resolveLocation` -> `findNearbyLoc`) and answers 'No tree found' when nothing
        // matches, so the fake refuses the same way. A fake that always succeeded would hide
        // the whole point of the fall-through: it is a re-resolve, not a free chop.
        const tree = locsWithin(DEFAULT_RADIUS).find(l => l.name.toLowerCase() === kind.toLowerCase());
        if (tree === undefined) return { success: false, message: 'No tree found' } as ActionResult;
        return interacted();
      },
      async dropItem(item: { name?: string }) { calls.dropped.push(item.name ?? '<unnamed>'); return ok; }
    },
    wait: {
      // The real `wait.until` polls to a timeout and its boolean answer is the whole point of
      // the call, so the fake records what the predicate said rather than throwing it away. A
      // fake that only recorded 'a wait happened' pins neither the predicate nor its operands.
      async until(pred: (s: WorldState) => boolean) {
        const answer = pred(state());
        calls.waited.push(`until:${answer}`);
        return answer;
      },
      async xp() { calls.waited.push('xp'); return true; },
      async item() { calls.waited.push('item'); throw new Error('wait.item takes number | string only'); },
      // `ticks` answers a boolean since R6 widened it, so the fake answers one too: a run that
      // was never stopped counted the ticks it was asked for. It read `undefined` until the
      // `satisfies` below started comparing this bag with the member it stands in for.
      async ticks() { return true; },
      async dialog() { return true; },
      async message() { return true; },
      async idle() { return true; },
      async animation() { return true; },
      async hp() { return true; }
      // The cast on the return throws away every signature in this file, so this one bag is
      // pinned to the real declaration instead. A member that drifts from `ScriptContext['wait']`
      // is a typecheck error here rather than a falsy answer inside a script months later.
    } satisfies ScriptContext['wait']
  } as unknown as ScriptContext;

  return { ctx, calls, player };
}
