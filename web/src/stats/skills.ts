export const SKILL_NAMES = ['Attack', 'Defence', 'Strength', 'Hitpoints', 'Ranged', 'Prayer', 'Magic', 'Cooking', 'Woodcutting', 'Fletching', 'Fishing', 'Firemaking', 'Crafting', 'Smithing', 'Mining', 'Herblore', 'Agility', 'Thieving', 'Slayer', 'Farming', 'Runecraft'];

const table: number[] = [0];
let points = 0;
for (let lvl = 1; lvl < 99; lvl++) {
  points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
  table.push(Math.floor(points / 4));
}

export function xpForLevel(level: number): number {
  return table[Math.min(Math.max(level, 1), 99) - 1];
}

/**
 * The chip colour on the canvas xp drop (map-design 3.4: a 9px rounded square, `#2e7d32` for the
 * mock's Woodcutting drop). The bundle states one skill colour and no palette, so this map names
 * only the skills the TOKEN LAYER already has a colour for and every other skill falls back to
 * `--xp-chip`, which is the mock's own chip. Inventing eighteen more hues would be design work the
 * bundle does not authorise; `skills.test.ts` pins each literal here to the token it copies,
 * because an inline `style.background` cannot read a custom property.
 */
export const SKILL_COLOURS: Record<string, string> = {
  Hitpoints: '#c0392b', // --hp
  Prayer: '#2980b9'     // --prayer
};

/** `--xp-chip`, the drop's default chip. */
export const XP_CHIP = '#2e7d32';

export function skillColour(skill: string): string {
  return SKILL_COLOURS[skill] ?? XP_CHIP;
}
