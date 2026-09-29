// web/src/stats/skills.test.ts -- the skill table and the xp drop's chip colours.
//
// The colours are hex literals in TypeScript rather than `var(--hp)` because they are written to
// an inline `style.background` on a node the cascade never sees a class for. That makes them a
// second copy of three token values, and a second copy drifts, so this file is the thing that
// stops it: every literal is read back out of `styles/tokens.css`. It is the same shape as the
// `--panel-w` / `--strip-w` fallback case in `styles/tokens.test.ts` (plan ruling R3).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SKILL_COLOURS, SKILL_NAMES, XP_CHIP, skillColour, xpForLevel } from './skills';

const here = dirname(fileURLToPath(import.meta.url));
const tokens = readFileSync(join(here, '../styles/tokens.css'), 'utf8');
const tokenValue = (name: string): string | null => new RegExp(`--${name}\\s*:\\s*([^;]+);`).exec(tokens)?.[1].trim() ?? null;

describe('the skill table', () => {
  it('names the twenty-one 2004 skills, Attack first and Runecraft last', () => {
    expect(SKILL_NAMES).toHaveLength(21);
    expect(SKILL_NAMES[0]).toBe('Attack');
    expect(SKILL_NAMES[20]).toBe('Runecraft');
  });

  it('has level 1 at 0 xp and level 99 at 13,034,431', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(99)).toBe(13034431);
  });
});

describe('skillColour', () => {
  it('answers every skill, and the ones with no colour of their own get the drop chip', () => {
    expect(skillColour('Woodcutting')).toBe(XP_CHIP);
    expect(skillColour('Fletching')).toBe(XP_CHIP);
    expect(skillColour('')).toBe(XP_CHIP);
    expect(skillColour('Hitpoints')).toBe('#c0392b');
    expect(skillColour('Prayer')).toBe('#2980b9');
  });

  // The drift guard. Mutation target: changing any literal in SKILL_COLOURS or XP_CHIP, or
  // revaluing one of the three tokens, fails here rather than silently painting a wrong chip.
  it('copies its literals from the token layer and from nowhere else', () => {
    expect(XP_CHIP).toBe(tokenValue('xp-chip'));
    expect(SKILL_COLOURS.Hitpoints).toBe(tokenValue('hp'));
    expect(SKILL_COLOURS.Prayer).toBe(tokenValue('prayer'));
  });

  it('names no skill the skill table does not have', () => {
    expect(Object.keys(SKILL_COLOURS).filter(name => !SKILL_NAMES.includes(name))).toEqual([]);
  });
});
