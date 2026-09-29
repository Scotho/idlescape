// Tutorial Island's two level changes, as declared atlas routes (spec decision 11: ladders,
// stairs and boats are only ever taken as a route's `interact` waypoint, and everything else is
// refused `needs_route`). These are the first routes the shipped atlas carries.
//
// Both are ladders, and neither changes the plane: the tutorial's underground is the same level 0
// shifted 6400 tiles north (`~climb_ladder(movecoord(coord, 0, 0, 6400), ...)` in
// `engine/content/scripts/tutorial/scripts/tut_doors_and_gates.rs2`), which is why map square
// 48_148 is one of the island's regions. Travel would otherwise try to walk the 6400 tiles.
//
// Every coordinate below was read out of the pinned clone, not guessed: the ladder locs are
// `newbieladdertop1` (id 3029) and `newbieladder2` (id 3030) in `engine/content/pack/loc.pack`,
// and their placements come from `m48_48.jm2` and `m48_148.jm2`.
//
// Shared with the shell on purpose, the way `kinds.ts` and `collisionFile.ts` are: the Tutorial
// Island script names these landmark ids when it calls `c.travel.to`, and a second copy of the
// ids would be a second thing to keep in step.
import type { AtlasLandmark, AtlasRoute } from '../../tasks/types';

/** Landmark ids, as `c.travel.to({ landmark })` names them. */
export const TUTORIAL_MINE_LADDER = 'tutorial-mine-ladder';
export const TUTORIAL_MINE = 'tutorial-mine';
export const TUTORIAL_COMBAT_LADDER = 'tutorial-combat-ladder';
export const TUTORIAL_BANK = 'tutorial-bank';

/** `newbieladdertop1`, the quest guide's ladder down into the mine. */
export const MINE_LADDER_TOP = { x: 3088, z: 3119 };
/** `newbieladder1`, the same ladder seen from the mine floor. */
export const MINE_LADDER_BOTTOM = { x: 3088, z: 9519 };
/** `newbieladder2`, the combat area's ladder up to the bank. */
export const COMBAT_LADDER_BOTTOM = { x: 3111, z: 9526 };
/** Where that ladder comes out, beside the tutorial bank. */
export const BANK_LADDER_TOP = { x: 3111, z: 3126 };

/**
 * The route endpoints, as landmarks. `routeFor` resolves a route's `from` through the landmark
 * table and refuses a route whose start it cannot find, so these are not optional decoration.
 *
 * `ROUTE_START_TILES` is 52, so a route is only taken up when the player is standing within one
 * scene of its `from`: the mine ladder is 5 tiles from where the quest guide leaves the player
 * and the combat ladder is 16 from the combat instructor, both comfortably inside that.
 */
export const TUTORIAL_PLACES: AtlasLandmark[] = [
  { id: TUTORIAL_MINE_LADDER, kind: 'route', name: 'Tutorial Island mine ladder', level: 0, ...MINE_LADDER_TOP },
  { id: TUTORIAL_MINE, kind: 'route', name: 'Tutorial Island mine', level: 0, ...MINE_LADDER_BOTTOM },
  { id: TUTORIAL_COMBAT_LADDER, kind: 'route', name: 'Tutorial Island combat area ladder', level: 0, ...COMBAT_LADDER_BOTTOM },
  { id: TUTORIAL_BANK, kind: 'route', name: 'Tutorial Island bank', level: 0, ...BANK_LADDER_TOP }
];

/**
 * Each route is walk, climb, walk. The closing walk is not decoration either: arrival is measured
 * against a route's last `walk` waypoint, so a route ending on its `interact` would be judged
 * against the tile the ladder was on rather than the tile the climb landed on.
 */
export const TUTORIAL_ROUTES: AtlasRoute[] = [
  {
    from: TUTORIAL_MINE_LADDER, to: TUTORIAL_MINE, level: 0,
    waypoints: [
      { kind: 'walk', ...MINE_LADDER_TOP },
      { kind: 'interact', locName: 'Ladder', op: 'Climb-down', ...MINE_LADDER_TOP },
      { kind: 'walk', ...MINE_LADDER_BOTTOM }
    ]
  },
  {
    from: TUTORIAL_COMBAT_LADDER, to: TUTORIAL_BANK, level: 0,
    waypoints: [
      { kind: 'walk', ...COMBAT_LADDER_BOTTOM },
      { kind: 'interact', locName: 'Ladder', op: 'Climb-up', ...COMBAT_LADDER_BOTTOM },
      { kind: 'walk', ...BANK_LADDER_TOP }
    ]
  }
];
