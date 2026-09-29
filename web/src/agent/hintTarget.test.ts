// The tile-hint rule, on its own. Every number below is a measurement from the pinned content:
// `tutorial_step_go_to_chef` puts its arrow on 0_48_48_6_12, absolute (3078, 3084), and
// `newbie_door2` (loc 3017) is placed at m48_48 "0 7 12: 3017 0", absolute (3079, 3084).
import { describe, expect, test } from 'vitest';
import { locAtHint } from './hintTarget';
import type { NearbyLoc } from '../vendor/rs-sdk/sdk/types';

const CHEF_DOOR_HINT = { x: 3078, z: 3084 };

function loc(name: string, x: number, z: number, options: string[] = []): NearbyLoc {
  return {
    id: 3017, name, x, z, level: 0, distance: 1,
    options, optionsWithIndex: options.map((text, i) => ({ text, opIndex: i + 1 })), reachable: true
  };
}

describe('locAtHint', () => {
  test('takes the door one tile east of the arrow, and sends the option it opens with', () => {
    // `Open` deliberately second, so a rule that always sends option 1 fails here.
    const door = loc('Door', 3079, 3084, ['Look-at', 'Open']);
    expect(locAtHint([door], CHEF_DOOR_HINT)).toEqual({ loc: door, op: 2 });
  });

  test('nothing within a tile of the arrow is nothing, so the caller walks', () => {
    // Two tiles east. The bank exit's arrow and its door are one apart, never two, and a rule
    // that reached further would let a hint beside a room click something in the next room.
    expect(locAtHint([loc('Door', 3080, 3084, ['Open'])], CHEF_DOOR_HINT)).toBeNull();
  });

  test('a neighbour carrying no menu option is not a target', () => {
    // A fence, a floor or a wall decoration standing beside the arrow. Walking to the tile is
    // the right answer to those, which is what the tutorial's own no-loc hints ask for.
    expect(locAtHint([loc('Fence', 3079, 3084, [])], CHEF_DOOR_HINT)).toBeNull();
  });

  test('the arrow tile wins over a neighbour that opens', () => {
    const onTile = loc('Gate', 3078, 3084, ['Climb-over']);
    const beside = loc('Door', 3079, 3084, ['Open']);
    expect(locAtHint([beside, onTile], CHEF_DOOR_HINT)).toEqual({ loc: onTile, op: 1 });
  });

  test('a loc on the arrow tile with no options at all is still the target', () => {
    // The rule before the neighbour case existed, and every hint step that already worked
    // depends on it: door1, the gate, door3, door4, both ladders, the mine gate, the rat cage,
    // the bank booth and door8 all stand on their own arrow.
    const onTile = loc('Ladder', 3078, 3084, []);
    expect(locAtHint([onTile], CHEF_DOOR_HINT)).toEqual({ loc: onTile, op: 1 });
  });

  test('among two neighbours the one that opens wins', () => {
    const table = loc('Table', 3079, 3084, ['Search']);
    const door = loc('Door', 3078, 3085, ['Open']);
    expect(locAtHint([table, door], CHEF_DOOR_HINT)).toEqual({ loc: door, op: 1 });
  });

  test('an empty scene is nothing', () => {
    expect(locAtHint([], CHEF_DOOR_HINT)).toBeNull();
  });
});
