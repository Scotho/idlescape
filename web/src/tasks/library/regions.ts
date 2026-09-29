// web/src/tasks/library/regions.ts — map-square ids the library and the panels reason about.
//
// The engine reports `WorldState.regionId` as a packed map square: the 64x64 tile square's
// x coordinate in the high byte and its z coordinate in the low byte, which is the same number
// the cache's dbrow coords (`level_mx_mz`) name.

/** Packs a map square's `mx`/`mz` coordinates the way the engine reports `regionId`. */
export function regionId(mx: number, mz: number): number {
  return (mx << 8) | mz;
}

/** The map squares Tutorial Island covers: dbrow coords 0_48_148, 0_49_48, 0_48_48, 0_48_47, 0_47_48, 0_47_47. */
export const TUTORIAL_REGION_IDS: readonly number[] = [
  regionId(48, 148), regionId(49, 48), regionId(48, 48),
  regionId(48, 47), regionId(47, 48), regionId(47, 47)
];

/** True while the player is standing on Tutorial Island. */
export function isTutorialRegion(id: number | undefined): boolean {
  return id !== undefined && TUTORIAL_REGION_IDS.includes(id);
}
