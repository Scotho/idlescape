// Which content config is which `ResourceKind`, and what a script does with it. Driven by the
// `category=` and `name=` fields the content actually carries (verified against
// engine/content/scripts/**: 35 `category=tree`, 28 `category=mining_rock_normal`,
// 8 `category=cooking_fire`, 7 `category=smithing_furnace`, 6 `category=prayer_altar`),
// never by hardcoded ids, which drift on every content bump.
import type { ResourceKind } from '../../tasks/types';
import { first, ops, type ConfigBlock } from './configs';

export const KIND_META: Record<ResourceKind, { label: string; op: string; skill?: string }> = {
  tree: { label: 'tree', op: 'Chop down', skill: 'Woodcutting' },
  rock: { label: 'rock', op: 'Mine', skill: 'Mining' },
  'fishing-spot': { label: 'fishing spot', op: 'Net', skill: 'Fishing' },
  bank: { label: 'bank', op: 'Use-quickly' },
  furnace: { label: 'furnace', op: 'Smelt', skill: 'Smithing' },
  anvil: { label: 'anvil', op: 'Smith', skill: 'Smithing' },
  range: { label: 'range', op: 'Cook', skill: 'Cooking' },
  altar: { label: 'altar', op: 'Pray-at', skill: 'Prayer' },
  fire: { label: 'fire', op: 'Cook', skill: 'Cooking' }
};

const FISHING_OPS = new Set(['net', 'bait', 'lure', 'cage', 'harpoon', 'fish']);

/**
 * The two things a player banks at. A name prefix of `bank ` is too loose: the content also
 * names the furniture standing beside a bank `Bank table` and `Bank notice board` (147 of the
 * 218 placements a prefix match finds), and every bank cluster becomes a landmark, so that
 * furniture would put walk-to targets in the atlas that no script can bank at. An op-carries
 * test cannot stand in for this: the content gives banks, ranges, anvils and most furnaces no
 * op at all, because they are used by putting an item on them.
 */
const BANK_NAMES = new Set(['bank booth', 'bank chest']);

/** The kind a loc config belongs to, or null when it is not something a script goes to. */
export function locKind(block: ConfigBlock): ResourceKind | null {
  const category = (first(block, 'category') ?? '').toLowerCase();
  const name = (first(block, 'name') ?? '').toLowerCase();
  const option = ops(block).map(o => o.toLowerCase());
  if (category === 'tree') return 'tree';
  if (category.startsWith('mining_rock')) return 'rock';
  if (category === 'smithing_furnace' || name === 'furnace') return 'furnace';
  if (category === 'cooking_fire' || name === 'fire') return 'fire';
  if (category === 'prayer_altar' || name.startsWith('altar')) return 'altar';
  if (name === 'anvil') return 'anvil';
  if (name === 'range' || name === 'cooking range') return 'range';
  if (BANK_NAMES.has(name) || option.includes('bank')) return 'bank';
  return null;
}

/** Fishing spots are NPCs, not locs (plan ruling R6). */
export function isFishingSpot(block: ConfigBlock): boolean {
  if ((first(block, 'name') ?? '').toLowerCase() === 'fishing spot') return true;
  return ops(block).some(o => FISHING_OPS.has(o.toLowerCase()));
}

/**
 * The variant a script filters on. Content debug names for map-square-scoped spawns carry
 * their square as a `<level>_<mx>_<mz>_` prefix (`0_43_51_saltfish`), which is placement
 * detail, not identity: strip it so one filter matches the same resource everywhere.
 */
export function variantOf(debugName: string): string {
  return debugName.replace(/^\d+_\d+_\d+_/, '');
}
