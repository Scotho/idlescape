// The route table's own invariants, and the ones `routeFor` and `travel.to` silently depend on.
// A route that breaks any of these does not fail loudly at runtime: travel simply ignores it and
// plans straight through a ladder.
import { describe, expect, test } from 'vitest';
import atlas from './../atlas.json';
import { MINE_LADDER_TOP, TUTORIAL_PLACES, TUTORIAL_ROUTES } from './tutorialRoutes';
import type { Atlas } from '../../tasks/types';

const shipped = atlas as unknown as Atlas;

describe('the declared routes', () => {
  test('both ends of every route are in the landmark table routeFor resolves from', () => {
    const ids = new Set(TUTORIAL_PLACES.map(p => p.id));
    for (const route of TUTORIAL_ROUTES) {
      expect(ids, `${route.from} is not a landmark`).toContain(route.from);
      expect(ids, `${route.to} is not a landmark`).toContain(route.to);
    }
  });

  test('every route ends on a walk waypoint, because arrival is measured against the last one', () => {
    for (const route of TUTORIAL_ROUTES) {
      expect(route.waypoints.at(-1)?.kind, `${route.from} -> ${route.to}`).toBe('walk');
    }
  });

  test('that last walk lands on the destination landmark, so arrival is judged at the right tile', () => {
    for (const route of TUTORIAL_ROUTES) {
      const last = route.waypoints.at(-1);
      const to = TUTORIAL_PLACES.find(p => p.id === route.to);
      expect(last?.kind === 'walk' && last.x).toBe(to?.x);
      expect(last?.kind === 'walk' && last.z).toBe(to?.z);
    }
  });

  test('every route starts within one leg of its from landmark, which is what ROUTE_START_TILES bounds', () => {
    for (const route of TUTORIAL_ROUTES) {
      const from = TUTORIAL_PLACES.find(p => p.id === route.from);
      const first = route.waypoints[0];
      expect(first.kind).toBe('walk');
      if (first.kind !== 'walk' || !from) throw new Error('checked above');
      // 52 as a literal, not as an imported constant: an assertion against the constant would
      // pass for any value the constant took.
      expect(Math.max(Math.abs(first.x - from.x), Math.abs(first.z - from.z))).toBeLessThanOrEqual(52);
    }
  });

  test('each one carries exactly one interact waypoint, on the ladder its name says', () => {
    const climbs = TUTORIAL_ROUTES.map(r => r.waypoints.filter(w => w.kind === 'interact'));
    expect(climbs.map(c => c.length)).toEqual([1, 1]);
    expect(climbs.map(c => c[0])).toEqual([
      { kind: 'interact', locName: 'Ladder', op: 'Climb-down', x: 3088, z: 3119 },
      { kind: 'interact', locName: 'Ladder', op: 'Climb-up', x: 3111, z: 9526 }
    ]);
  });

  test('the mine is a 6400-tile jump in z on the same plane, not a change of level', () => {
    const [mine] = TUTORIAL_ROUTES;
    const from = TUTORIAL_PLACES.find(p => p.id === mine.from);
    const to = TUTORIAL_PLACES.find(p => p.id === mine.to);
    expect(mine.level).toBe(0);
    expect(from?.level).toBe(0);
    expect(to?.level).toBe(0);
    expect((to?.z ?? 0) - (from?.z ?? 0)).toBe(6400);
    expect(MINE_LADDER_TOP).toEqual({ x: 3088, z: 3119 });
  });
});

describe('the shipped atlas', () => {
  test('carries both routes and both pairs of endpoints', () => {
    expect(shipped.routes).toHaveLength(2);
    expect(shipped.routes.map(r => `${r.from}->${r.to}`)).toEqual([
      'tutorial-mine-ladder->tutorial-mine', 'tutorial-combat-ladder->tutorial-bank'
    ]);
    const ids = shipped.landmarks.map(l => l.id);
    for (const place of TUTORIAL_PLACES) expect(ids).toContain(place.id);
  });

  test('the route landmarks are the only ones of kind route, and they carry real island tiles', () => {
    const routes = shipped.landmarks.filter(l => l.kind === 'route');
    expect(routes).toHaveLength(4);
    expect(routes.map(l => `${l.x},${l.z}`).sort()).toEqual(['3088,3119', '3088,9519', '3111,3126', '3111,9526']);
  });
});
