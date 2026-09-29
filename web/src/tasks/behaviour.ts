// web/src/tasks/behaviour.ts - the merge that decides what a run does when it goes wrong.
//
// Precedence, and it is the whole feature: a script's own `health.*` beats the player's setting,
// which beats the built-in default. A script that deliberately declares `onDeath: 'fail'` is
// making a statement about itself and keeps it; every script that says nothing follows the player.
//
// Pure on purpose. The player's values arrive from Firestore and from a localStorage mirror,
// either of which can hold whatever a previous build wrote, so this is also the one place that
// decides what an unknown value means: the default, never the ladder.
import type { BehaviourSettings, DeathBehaviour, HealthPolicy, StuckBehaviour } from './types';

/** Every value the `onDeath` setting offers, in the order the panel lists them. */
export const DEATH_BEHAVIOURS: readonly DeathBehaviour[] =
  ['loot', 'return', 'resume', 'pause', 'logout', 'loot-and-logout', 'fail'];
/** Every value the `onStuck` setting offers. */
export const STUCK_BEHAVIOURS: readonly StuckBehaviour[] = ['pause', 'logout', 'stop'];
/** The declared range of `maxRelogins`. 0 means "if I get logged out, stay out". */
export const MIN_RELOGINS = 0;
export const MAX_RELOGINS = 5;

/** What a player who has never touched the settings gets, and the fallback for a bad stored value. */
export const DEFAULT_BEHAVIOUR: BehaviourSettings = { onDeath: 'loot', onStuck: 'pause', maxRelogins: 2 };

/** The three fields every consumer of a resolved policy can rely on, plus whatever else it declared. */
export type ResolvedPolicy = Required<Pick<HealthPolicy, 'onDeath' | 'onStuck' | 'maxRelogins'>> & HealthPolicy;

/** `value` when the closed set contains it, and `fallback` when it holds anything else. */
function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** A count out of storage: a non-number, or one outside the declared range, is pulled back in. */
function clampRelogins(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_RELOGINS, Math.max(MIN_RELOGINS, Math.round(value)));
}

/**
 * The script's declared policy over the player's settings over the built-in defaults, field by
 * field: a script that declares only `noProgressMs` still follows the player everywhere else.
 * Both sources are validated, because a compiled user script can declare nonsense every bit as
 * easily as a stale settings document can hold it.
 */
export function resolvePolicy(script: HealthPolicy | undefined, player: BehaviourSettings): ResolvedPolicy {
  const chosen: BehaviourSettings = {
    onDeath: oneOf(DEATH_BEHAVIOURS, player.onDeath, DEFAULT_BEHAVIOUR.onDeath),
    onStuck: oneOf(STUCK_BEHAVIOURS, player.onStuck, DEFAULT_BEHAVIOUR.onStuck),
    maxRelogins: clampRelogins(player.maxRelogins, DEFAULT_BEHAVIOUR.maxRelogins)
  };
  const declared = script ?? {};
  return {
    ...declared,
    onDeath: oneOf(DEATH_BEHAVIOURS, declared.onDeath, chosen.onDeath),
    onStuck: oneOf(STUCK_BEHAVIOURS, declared.onStuck, chosen.onStuck),
    maxRelogins: declared.maxRelogins === undefined ? chosen.maxRelogins : clampRelogins(declared.maxRelogins, chosen.maxRelogins)
  };
}
