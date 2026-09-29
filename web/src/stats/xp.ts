import { SKILL_NAMES, xpForLevel } from './skills';

/**
 * One skill's session. `pct` is how far the current total sits through the CURRENT level, which
 * is what the v2 meter draws; it is not progress towards the session's own goal, and a maxed
 * skill reads 100 because there is no next level to fill towards. Both the XP panel and the
 * pinned card read it, which is why the tracker computes it once rather than each of them
 * re-deriving it from `toNext` and the level table.
 */
export interface XpRow { skill: number; name: string; gained: number; perHour: number; level: number; toNext: number | null; actionsToNext: number | null; pct: number }
interface Track { baseline: number; latest: number; level: number; firstAt: number; lastDelta: number }

/**
 * Progress through the reported level, clamped. The clamp is not defensive tidiness: the level in
 * an `XpEvent` is the engine's, and a client that reports a level whose floor is above the total
 * it also reports would otherwise draw a meter backwards.
 *
 * A maxed skill falls out of the `span <= 0` guard rather than out of a `level >= 99` test of its
 * own: `xpForLevel` clamps its argument to 99, so at 99 the floor and the next level are the same
 * number and the span is zero. A separate early return would read as intent and be dead code.
 */
function levelPct(level: number, total: number): number {
  const floor = xpForLevel(level);
  const span = xpForLevel(level + 1) - floor;
  if (span <= 0) return 100;
  return Math.min(100, Math.max(0, ((total - floor) / span) * 100));
}

export function createXpTracker() {
  const tracks = new Map<number, Track>();
  return {
    onXp(ev: { skill: number; xp: number; delta: number; level: number }, now: number) {
      const t = tracks.get(ev.skill);
      if (!t) { tracks.set(ev.skill, { baseline: ev.xp, latest: ev.xp, level: ev.level, firstAt: now, lastDelta: ev.delta > 0 ? ev.delta : 0 }); return; }
      t.latest = ev.xp; t.level = ev.level;
      if (ev.delta > 0) t.lastDelta = ev.delta;
    },
    /**
     * The level this skill was last seen at, or null for a skill this tracker has never had an
     * event for. The level-up producer (frame/eventProducers.ts) reads it BEFORE onXp updates
     * the track, which is why sessions/wire.ts calls the producer first.
     */
    levelOf(skill: number): number | null {
      return tracks.get(skill)?.level ?? null;
    },
    rows(now: number): XpRow[] {
      const out: XpRow[] = [];
      for (const [skill, t] of tracks) {
        const gained = t.latest - t.baseline;
        if (gained <= 0) continue;
        const hours = Math.max(now - t.firstAt, 1) / 3_600_000;
        const toNext = t.level >= 99 ? null : xpForLevel(t.level + 1) - t.latest;
        const actionsToNext = toNext !== null && t.lastDelta > 0 ? Math.ceil(toNext / t.lastDelta) : null;
        out.push({ skill, name: SKILL_NAMES[skill] ?? `Skill ${skill}`, gained, perHour: Math.round(gained / hours), level: t.level, toNext, actionsToNext, pct: levelPct(t.level, t.latest) });
      }
      return out.sort((a, b) => b.gained - a.gained);
    },
    /**
     * When this session's first xp event arrived, or null before any and after a reset. It is the
     * XP panel's `Session · {elapsed}` clock: the session the Reset button resets is this one, so
     * the clock reads off the same state the button clears rather than off the iframe's own age.
     */
    startedAt(): number | null {
      let first: number | null = null;
      for (const t of tracks.values()) if (first === null || t.firstAt < first) first = t.firstAt;
      return first;
    },
    reset() { tracks.clear(); }
  };
}
