// The health checks as pure predicates over a snapshot plus a small rolling memory. Nothing here
// runs a task, touches the runner or holds a timer: `healthMonitor.ts` owns all of that, and
// keeping this half pure is what makes every condition testable against a fixture world.
import { realChoices } from '../agent/constants';
import type { HealthCondition, HealthPolicy } from './types';
import type { WorldState } from '../agent/types';

export const DEFAULT_NO_PROGRESS_MS = 90_000;
const DIALOG_STUCK_MS = 15_000;
const INVENTORY_SLOTS = 28;
/** The engine's own wording; matching text rather than a component id survives a content bump. */
const LEVEL_UP_RE = /you just advanced|congratulations.*\blevel\b/i;

export interface HealthMemory {
  /** The last time anything the run cares about moved: xp, inventory or position. */
  lastProgressAt: number;
  xpTotal: number;
  inventorySignature: string;
  position: string;
  /** When the current option-less dialog opened, or null. */
  dialogOpenSince: number | null;
  lifeId: number | undefined;
  /** True when the snapshot this memory was made from carried a different `lifeId` than the one
   * before it. It is a fact about the transition, so it is recorded by `observe` rather than
   * recomputed later against a memory that has already moved on. */
  lifeChanged: boolean;
  /** Item names held in this snapshot's inventory, lowercased. */
  held: string[];
  /** Names held in the snapshot before this one and not in this one: what just reached zero. */
  lost: string[];
  /**
   * The last tile the player was standing on while alive. On death the snapshot already
   * reports the respawn point, so this is the only record of where the loot fell.
   */
  lastAliveAt: { x: number; z: number; level: number } | null;
}

export function emptyMemory(now: number): HealthMemory {
  return {
    lastProgressAt: now, xpTotal: -1, inventorySignature: '', position: '',
    dialogOpenSince: null, lifeId: undefined, lifeChanged: false, held: [], lost: [], lastAliveAt: null
  };
}

const xpOf = (s: WorldState): number => (s.skills ?? []).reduce((n, k) => n + (k.experience ?? 0), 0);
const invOf = (s: WorldState): string => (s.inventory ?? []).map(i => `${i.id}x${i.count}`).join(',');
const posOf = (s: WorldState): string => `${s.player?.worldX ?? 0},${s.player?.worldZ ?? 0},${s.player?.level ?? 0}`;
const namesOf = (s: WorldState): string[] =>
  [...new Set((s.inventory ?? []).map(i => (i.name ?? '').toLowerCase()).filter(n => n !== ''))];

/** One snapshot in, the next memory out. Call it for every state message, running or not. */
export function observe(memory: HealthMemory, s: WorldState, now: number): HealthMemory {
  const xpTotal = xpOf(s), inventorySignature = invOf(s), position = posOf(s);
  // The first observation of a run has nothing to compare against, and `xpTotal === -1` is the
  // only value a real snapshot cannot produce: treat it as movement so the window starts now.
  const moved = memory.xpTotal === -1
    || xpTotal !== memory.xpTotal || inventorySignature !== memory.inventorySignature || position !== memory.position;
  // `realChoices` and not `options.length`: the live client attaches "Click here to continue"
  // to every option-less frame, so counting raw options here made `optionless` false on every
  // dialog a live world publishes, `dialogOpenSince` was never set, and `dialog-stuck` - one of
  // the three conditions spec 4.3 says fire constantly on the island - could not fire at all.
  const optionless = s.dialog?.isOpen === true && realChoices(s.dialog.options).length === 0;
  const lifeId = s.player?.lifeId ?? memory.lifeId;
  const held = namesOf(s);
  // A snapshot whose `lifeId` moved is a respawn, and `isDeath` treats it as the death itself.
  // It arrives alive and standing in Lumbridge, so it is exactly the snapshot `lastAliveAt` must
  // not follow: the death may never have been published with `isDead` set at all.
  const lifeChanged = memory.lifeId !== undefined && lifeId !== undefined && lifeId !== memory.lifeId;
  const alive = s.player?.isDead !== true;
  const at = s.player ? { x: s.player.worldX, z: s.player.worldZ, level: s.player.level } : null;
  return {
    lastProgressAt: moved ? now : memory.lastProgressAt,
    xpTotal, inventorySignature, position,
    dialogOpenSince: optionless ? memory.dialogOpenSince ?? now : null,
    lifeId,
    lifeChanged,
    held,
    // What the run had a moment ago and does not now. The empty first memory holds nothing, so
    // the snapshot a run starts on can never report a supply as lost.
    lost: memory.held.filter(name => !held.includes(name)),
    // Only while alive, and never on the snapshot that carries the respawn. The whole point of
    // the field is that the position after a death is the respawn point, and overwriting it
    // there would lose the one tile the loot is on.
    lastAliveAt: alive && !lifeChanged && at ? at : memory.lastAliveAt
  };
}

export function isNoProgress(memory: HealthMemory, now: number, windowMs = DEFAULT_NO_PROGRESS_MS): boolean {
  return now - memory.lastProgressAt >= windowMs;
}

export function isUnexpectedInterface(s: WorldState, expected: number[] = []): boolean {
  return s.modalOpen === true && !expected.includes(s.modalInterface ?? -1);
}

export function isDialogStuck(memory: HealthMemory, now: number): boolean {
  return memory.dialogOpenSince !== null && now - memory.dialogOpenSince >= DIALOG_STUCK_MS;
}

export function isLevelUp(s: WorldState): boolean {
  return Object.values(s.interfaceTexts ?? {}).some(text => LEVEL_UP_RE.test(text));
}

/**
 * `memory` is the memory produced by observing `s`: the respawn is only visible as the step
 * between two snapshots, and `observe` is the one place that sees both.
 */
export function isDeath(s: WorldState, memory: HealthMemory): boolean {
  return s.player?.isDead === true || memory.lifeChanged;
}

export function isInventoryFull(s: WorldState): boolean {
  return (s.inventory?.length ?? 0) >= INVENTORY_SLOTS;
}

/**
 * Spec 3.4: "a declared `consumes` item reaching zero". Reaching zero, not being absent - a
 * script that declares `consumes: ['Logs']` and starts with an empty inventory has not run out of
 * anything yet, and since this condition has no recovery it would fail its own run on the first
 * snapshot. Like `isDeath`, it reads a transition `observe` recorded, so `memory` must be the
 * memory produced from the snapshot in question.
 */
export function isOutOfSupplies(memory: HealthMemory, consumes: string[] = []): boolean {
  if (consumes.length === 0) return false;
  return consumes.some(name => memory.lost.includes(name.toLowerCase()));
}

/**
 * The condition to act on, most urgent first. Order matters: a dead character inside an
 * unexpected interface is a death, and treating it as an interface would click at a respawn
 * screen for the rest of the run.
 *
 * `low-hp` is deliberately absent: it is the runner's own `hardStop.hpBelow`, which ends the run
 * rather than recovering it, and a second owner would race the first.
 */
export function evaluate(memory: HealthMemory, s: WorldState, now: number, policy: HealthPolicy): HealthCondition | null {
  if (isDeath(s, memory)) return 'death';
  if (isLevelUp(s)) return 'level-up';
  if (isUnexpectedInterface(s, policy.expectInterfaces)) return 'unexpected-interface';
  if (isDialogStuck(memory, now)) return 'dialog-stuck';
  if (isOutOfSupplies(memory, policy.consumes)) return 'out-of-supplies';
  if (isInventoryFull(s)) return 'inventory-full';
  if (isNoProgress(memory, now, policy.noProgressMs ?? DEFAULT_NO_PROGRESS_MS)) return 'no-progress';
  return null;
}
