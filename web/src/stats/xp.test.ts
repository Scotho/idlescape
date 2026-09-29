import { describe, expect, test } from 'vitest';
import { createXpTracker } from './xp';
import { xpForLevel } from './skills';

describe('xpForLevel', () => {
  test('matches the classic table', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(83);
    expect(xpForLevel(10)).toBe(1154);
    expect(xpForLevel(99)).toBe(13034431);
  });
});

describe('levelOf', () => {
  test('is null for a skill with no event yet, and the last level seen after one', () => {
    const t = createXpTracker();
    expect(t.levelOf(8)).toBeNull();
    t.onXp({ skill: 8, xp: 1000, delta: 25, level: 34 }, 0);
    expect(t.levelOf(8)).toBe(34);
    t.onXp({ skill: 8, xp: 1100, delta: 25, level: 35 }, 0);
    expect(t.levelOf(8)).toBe(35);
    // The level-up producer reads this BEFORE onXp runs, which is the whole reason it exists.
    expect(t.levelOf(0)).toBeNull();
  });
});

describe('xp tracker', () => {
  test('first event sets a baseline and reports no gain', () => {
    const t = createXpTracker();
    t.onXp({ skill: 10, xp: 1000, delta: 1000, level: 9 }, 0);
    expect(t.rows(0)).toEqual([]);
  });
  test('subsequent events accumulate and compute per hour', () => {
    const t = createXpTracker();
    t.onXp({ skill: 10, xp: 1000, delta: 1000, level: 9 }, 0);
    t.onXp({ skill: 10, xp: 1300, delta: 300, level: 10 }, 30 * 60 * 1000);
    const [row] = t.rows(30 * 60 * 1000);
    expect(row.skill).toBe(10);
    expect(row.name).toBe('Fishing');
    expect(row.gained).toBe(300);
    expect(row.perHour).toBe(600);
    expect(row.level).toBe(10);
    expect(row.toNext).toBe(xpForLevel(11) - 1300);
  });
});

describe('xp tracker actions-to-level', () => {
  test('actionsToNext = ceil(toNext / last positive delta)', () => {
    const t = createXpTracker();
    const now = 0;
    // Cooking (skill 7). Establish baseline, then a gain of 40 xp at level 1.
    t.onXp({ skill: 7, xp: 0, delta: 0, level: 1 }, now);
    t.onXp({ skill: 7, xp: 40, delta: 40, level: 1 }, now + 1000);
    const row = t.rows(now + 1000).find(r => r.skill === 7)!;
    expect(row.gained).toBe(40);
    expect(row.toNext).not.toBeNull();
    expect(row.actionsToNext).toBe(Math.ceil(row.toNext! / 40));
  });

  test('actionsToNext is null when no positive delta has been seen yet', () => {
    const t = createXpTracker();
    t.onXp({ skill: 7, xp: 100, delta: 0, level: 10 }, 0);
    // gained is 0 so the row is filtered out; force a gain with delta 0 is impossible,
    // so assert via a skill that gained with an unknown delta path:
    t.onXp({ skill: 7, xp: 140, delta: 0, level: 10 }, 1000);
    const row = t.rows(1000).find(r => r.skill === 7)!;
    expect(row.gained).toBe(40);
    expect(row.actionsToNext).toBeNull();
  });

  test('reset clears tracks', () => {
    const t = createXpTracker();
    t.onXp({ skill: 7, xp: 0, delta: 0, level: 1 }, 0);
    t.onXp({ skill: 7, xp: 40, delta: 40, level: 1 }, 1000);
    t.reset();
    expect(t.rows(1000).length).toBe(0);
  });
});

// `pct` and `startedAt` are Task 19's: the v2 XP panel draws a meter per skill and the pinned card
// draws the same meter above the panel header, and both read `XpRow`. Deriving the percentage at
// each of the two call sites from `toNext` and the level table would put the same four lines of
// arithmetic in two modules, and the tracker already holds the total the sum needs.
describe('progress through the current level', () => {
  test('pct is how far the current total sits between this level and the next', () => {
    const t = createXpTracker();
    // Halfway from level 10 (1,154 xp) to level 11 (1,358 xp) is 1,256.
    t.onXp({ skill: 10, xp: 1154, delta: 0, level: 10 }, 0);
    t.onXp({ skill: 10, xp: 1256, delta: 102, level: 10 }, 1000);
    expect(t.rows(1000)[0].pct).toBe(50);
  });

  test('pct is 0 at the floor of a level and never negative below it', () => {
    const t = createXpTracker();
    t.onXp({ skill: 10, xp: 1000, delta: 0, level: 10 }, 0);
    t.onXp({ skill: 10, xp: 1100, delta: 100, level: 10 }, 1000);
    // 1,100 is below level 10's own floor of 1,154: the engine reported the level, so the level
    // is what the row says, and the bar clamps rather than drawing backwards.
    expect(t.rows(1000)[0].pct).toBe(0);
  });

  test('a maxed skill reads full, because there is no next level to fill towards', () => {
    const t = createXpTracker();
    t.onXp({ skill: 10, xp: 13034431, delta: 0, level: 99 }, 0);
    t.onXp({ skill: 10, xp: 13034531, delta: 100, level: 99 }, 1000);
    const [row] = t.rows(1000);
    expect(row.toNext).toBeNull();
    expect(row.pct).toBe(100);
    // And at exactly level 99's own floor, where the span is zero AND the numerator is: without
    // the guard that is 0/0, which is NaN, and a NaN width paints no bar at all.
    const u = createXpTracker();
    u.onXp({ skill: 10, xp: 13034331, delta: 0, level: 99 }, 0);
    u.onXp({ skill: 10, xp: 13034431, delta: 100, level: 99 }, 1000);
    expect(u.rows(1000)[0].pct).toBe(100);
  });

  test('startedAt is the first event of the session, null before any and after a reset', () => {
    const t = createXpTracker();
    expect(t.startedAt()).toBeNull();
    t.onXp({ skill: 10, xp: 1000, delta: 0, level: 10 }, 5000);
    t.onXp({ skill: 7, xp: 20, delta: 0, level: 1 }, 9000);
    expect(t.startedAt()).toBe(5000);
    t.reset();
    expect(t.startedAt()).toBeNull();
  });

  test('startedAt counts a skill whose row is filtered out for having gained nothing', () => {
    const t = createXpTracker();
    t.onXp({ skill: 10, xp: 1000, delta: 0, level: 10 }, 5000);
    expect(t.rows(9000)).toEqual([]);
    expect(t.startedAt()).toBe(5000);
  });
});
