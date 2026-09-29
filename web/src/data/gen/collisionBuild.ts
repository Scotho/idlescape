// One walkability bit per tile per level, mirroring what the engine writes into its own
// collision map when it loads a map square (engine/server/src/engine/GameMap.ts:203-285).
//
// Walls are deliberately absent (plan ruling R1): a wall blocks a tile EDGE, which a per-tile
// bit cannot express, and the client's own routefinder - which every leg is handed to - knows
// them. Openable walls come out as door rows instead, which is what the vendored walkTo needs.
import { first, ops, type ConfigBlock } from './configs';
import { packLocal, type MapSquare } from './jm2';

export interface LocInfo { width: number; length: number; blockwalk: boolean; active: boolean; openable: boolean }
export interface DoorRow { level: number; x: number; z: number; shape: number; angle: number }

/** `yes`, `true` and `1`, per the packer's `getConfigBoolean` (tools/pack/config/PackShared.ts). */
const configBool = (value: string): boolean => value === 'yes' || value === 'true' || value === '1';

/** Every `model`, `model1`..`model5` value, which is what the packer's `key.startsWith('model')` collects. */
const modelNamesOf = (block: ConfigBlock): string[] =>
  Object.keys(block).filter(key => key.startsWith('model')).flatMap(key => block[key]);

/**
 * One `.loc` config block, reduced to what collision needs. `LocType`'s defaults are width 1,
 * length 1, blockwalk true, and `active` -1, which `postDecode` then derives.
 *
 * `postDecode` sets `active` to 1 when the config has an op, or when it has models and either no
 * shapes at all or `shapes[0] === 10` (CENTREPIECE_STRAIGHT). Working back through the packer
 * (tools/pack/config/LocConfig.ts): a `model=` value that names a model verbatim packs as shape
 * `_8` = 10, `_8` entries sort first, and an all-`_8` model list is written with opcode 5, which
 * leaves `shapes` null. Both of those cases, and only those, mean "some model name resolves
 * verbatim in model.pack" - so that is the test here. A model that only resolves through a shape
 * suffix leaves `active` 0: `[puddle]` is `model=floor_puddle` and model.pack holds only
 * `floor_puddle_0` (the `_0` suffix is GROUND_DECOR), so a puddle does not block. Taking "has any
 * model" as the rule instead would mark 259 676 of the 311 905 ground-decor placements active
 * rather than 1 259, walling off floors, dug-up soil and skirting boards across the map.
 *
 * @param modelNames every name in `engine/content/pack/model.pack`.
 */
export function locInfoOf(block: ConfigBlock, modelNames: ReadonlySet<string>): LocInfo {
  const option = ops(block);
  const activeRaw = first(block, 'active');
  const centrepiece = modelNamesOf(block).some(name => modelNames.has(name));
  return {
    width: Number(first(block, 'width') ?? 1),
    length: Number(first(block, 'length') ?? 1),
    blockwalk: first(block, 'blockwalk') !== 'no',
    active: activeRaw !== undefined ? configBool(activeRaw) : option.length > 0 || centrepiece,
    openable: option.some(o => /^open$/i.test(o))
  };
}

const BLOCK_MAP_SQUARE = 0x1;
const LINK_BELOW = 0x2;
/** 64 x 64 tiles, one bit each. */
const SQUARE_BYTES = 512;

export type LocLayer = 'wall' | 'walldecor' | 'ground' | 'grounddecor';

/** `routefinder/flags.ts` `locShapeLayer`, as a range test over the same shape numbering. */
export function layerOf(shape: number): LocLayer {
  if (shape <= 3) return 'wall';
  if (shape <= 8) return 'walldecor';
  if (shape <= 21) return 'ground';
  return 'grounddecor';
}

export function buildSquare(
  square: MapSquare,
  locs: Map<number, LocInfo>
): { levels: Map<number, Uint8Array>; doors: DoorRow[] } {
  const levels = new Map<number, Uint8Array>();
  const doors: DoorRow[] = [];
  const bits = (level: number): Uint8Array => {
    const existing = levels.get(level);
    if (existing) return existing;
    const made = new Uint8Array(SQUARE_BYTES);
    levels.set(level, made);
    return made;
  };
  // Every level is present in the output even when empty, so a caller can tell "level 2 of this
  // square is open" from "this square has no level 2" without a second table.
  for (let level = 0; level < 4; level++) bits(level);

  const flagsAt = (level: number, x: number, z: number): number => square.land.get(packLocal(level, x, z)) ?? 0;
  /**
   * Which level a tile's collision actually belongs to, following the bridge rule. The engine
   * writes `level === 1 ? land : lands[packCoord(x, z, 1)]`, and both branches read the same
   * tile at level 1, so one expression covers it. Level 0 under a bridge yields -1, which the
   * engine drops outright (`if (actualLevel < 0) continue`) rather than clamping to 0.
   */
  const actualLevel = (level: number, x: number, z: number): number =>
    (flagsAt(1, x, z) & LINK_BELOW) === LINK_BELOW ? level - 1 : level;
  const set = (level: number, x: number, z: number): void => {
    if (level < 0 || level > 3 || x < 0 || x > 63 || z < 0 || z > 63) return;
    const i = (x << 6) | z;
    bits(level)[i >> 3] |= 1 << (i & 7);
  };

  for (const [packed, flags] of square.land) {
    if ((flags & BLOCK_MAP_SQUARE) !== BLOCK_MAP_SQUARE) continue;
    const z = packed & 0x3f, x = (packed >> 6) & 0x3f, level = (packed >> 12) & 0x3;
    set(actualLevel(level, x, z), x, z);
  }

  for (const loc of square.locs) {
    const info = locs.get(loc.id);
    if (!info) continue;
    const level = actualLevel(loc.level, loc.x, loc.z);
    if (level < 0) continue;
    const layer = layerOf(loc.shape);
    if (layer === 'wall' && info.openable) doors.push({ level, x: loc.x, z: loc.z, shape: loc.shape, angle: loc.angle });
    if (!info.blockwalk) continue;
    if (layer === 'ground') {
      // The engine passes (length, width) to `changeLoc` for LocAngle.NORTH (1) and SOUTH (3)
      // and (width, length) otherwise, and `changeLoc`'s fourth argument is the x extent.
      const turned = loc.angle === 1 || loc.angle === 3;
      const xExtent = turned ? info.length : info.width;
      const zExtent = turned ? info.width : info.length;
      for (let dx = 0; dx < xExtent; dx++) for (let dz = 0; dz < zExtent; dz++) set(level, loc.x + dx, loc.z + dz);
    } else if (layer === 'grounddecor' && info.active) {
      set(level, loc.x, loc.z);
    }
  }

  return { levels, doors };
}
