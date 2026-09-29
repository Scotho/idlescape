// What every Tutorial Island stage needs: reading the step signal, and the two moves that carry
// most of the island (click through what the instructor is saying, or do what the arrow points
// at). The titles themselves live in `titles.ts`, which is the contract with the content.
//
// `%tutorial` is a server-only varp, so a client sees the step only as the chatbox title, the
// flashing sidebar tab and the hint arrow. Several titles are empty and several repeat, which is
// why "the step moved on" is a title plus a hint rather than a title alone.
import { realChoices } from '../../../agent/constants';
import type { ScriptContext, Task } from '../../types';
import type { WorldState } from '../../../agent/types';
import type { NearbyLoc } from '../../../vendor/rs-sdk/sdk/types';

export const titleOf = (s: WorldState): string => s.tutorial?.title ?? '';
export const titleIs = (s: WorldState, title: string): boolean => titleOf(s) === title;
export const titleIn = (s: WorldState, titles: readonly string[]): boolean => titles.includes(titleOf(s));

/** An option-less dialog: the instructor is talking and the only move is to click on. */
export const isTalking = (s: WorldState): boolean =>
  s.dialog?.isOpen === true && realChoices(s.dialog.options).length === 0;
/**
 * A dialog offering choices. Never clicked blind: choosing wrongly is not undoable.
 *
 * "Click here to continue" does not count, and that is not a detail: the live client publishes
 * that line as an option of its own, so counting raw options made every ordinary instructor line
 * look like a decision and every real decision look the same as one.
 */
export const hasChoices = (s: WorldState): boolean =>
  s.dialog?.isOpen === true && realChoices(s.dialog.options).length > 0;
export const hasHint = (s: WorldState): boolean => (s.hint?.kind ?? 'none') !== 'none';
export const hintIsNpc = (s: WorldState): boolean => s.hint?.kind === 'npc';
export const hintIsTile = (s: WorldState): boolean => s.hint?.kind === 'tile';

/**
 * The loc the hint arrow is standing on, when there is one. Several mining and smithing steps
 * point the arrow at a rock, a furnace or an anvil and then ask for a named option on it, which
 * a plain `followHint` (option 1) would get wrong.
 */
export function hintedLoc(s: WorldState): NearbyLoc | null {
  const h = s.hint;
  if (h?.kind !== 'tile') return null;
  return (s.nearbyLocs ?? []).find(l => l.x === h.tile.x && l.z === h.tile.z) ?? null;
}
export const flashingTab = (s: WorldState): number | null => s.flashingTab ?? null;

/** Where the player is standing, or the origin before the first snapshot. */
export const tileOf = (s: WorldState): { x: number; z: number; level: number } =>
  ({ x: s.player?.worldX ?? 0, z: s.player?.worldZ ?? 0, level: s.player?.level ?? 0 });

/** Chebyshev distance from the player to a tile, in tiles. */
export function distanceTo(s: WorldState, x: number, z: number): number {
  const at = tileOf(s);
  return Math.max(Math.abs(at.x - x), Math.abs(at.z - z));
}

/**
 * The signal a step is identified by: the title, plus whatever the hint arrow is pointing at.
 * Consecutive steps genuinely share a title (`It's tin.` twice, `Mining.` three times), so a
 * wait for "the title changed" would sit out its whole timeout between them.
 */
export function stepKey(s: WorldState): string {
  const hint = s.hint;
  const at = hint?.kind === 'npc' ? String(hint.npcIndex)
    : hint?.kind === 'player' ? String(hint.playerIndex)
      : hint?.kind === 'tile' ? `${hint.tile.x},${hint.tile.z}`
        : '';
  return `${titleOf(s)}|${hint?.kind ?? 'none'}|${at}`;
}

/** Long enough for a server-side step to publish, short enough that a wedged run is noticed. */
export const STEP_WAIT_MS = 20_000;

/** Waits until the step signal moves off `from`. False on a timeout, which is not fatal by itself. */
export function waitForStep(c: ScriptContext, from: string, timeoutMs = STEP_WAIT_MS, label?: string): Promise<boolean> {
  return c.wait.until(s => stepKey(s) !== from, { timeoutMs, label });
}

/**
 * The default move: click on through what the instructor is saying, or do what the arrow points
 * at. A step showing neither is one the server has not published a move for yet, and waiting is
 * the correct answer to that - returning a failure would spend one of the run's three attempts
 * on the server being slow.
 */
export async function advance(c: ScriptContext, label: string): Promise<void> {
  const before = stepKey(c.state());
  if (isTalking(c.state())) {
    const r = await c.dialog.continueUntilOption({ maxClicks: 5 });
    // Information the old `clickThrough` could not give: it returned void whether the chatbox
    // moved on or stood in front of the run for its whole budget of clicks.
    if (!r.success) c.log(`${label}: the chatbox did not move on (${r.reason ?? r.message})`, 'warn');
  } else if (hasHint(c.state())) {
    const r = await c.tutorial.followHint();
    if (!r.success) c.log(`${label}: the hint could not be followed (${r.reason ?? r.message})`, 'warn');
  }
  await waitForStep(c, before, STEP_WAIT_MS, label);
}

/** A step whose whole job is "do what the instructor or the arrow says", which is most of the island. */
export function advanceStep(name: string, when: (s: WorldState) => boolean, opts: { timeoutMs?: number; status?: string } = {}): Task {
  return {
    name, when, timeoutMs: opts.timeoutMs ?? 30_000,
    async run(c) {
      c.status(opts.status ?? name);
      await advance(c, name);
    }
  };
}

/**
 * The flashing sidebar tab a step asks for. `flashingTab` is the tab index the client is
 * flashing, or null. The SDK's tab method is `sendSetTab`; there is no `sendClickTab`.
 */
export function tabStep(name: string, when: (s: WorldState) => boolean, opts: { status?: string } = {}): Task {
  return {
    name,
    // A tab step is the move only while the client is actually flashing a tab. The click clears
    // the flash locally, and the tutorial's own text does not always move on with it, so without
    // this the step keeps matching its title and `run` spends the whole attempt budget on
    // instant refusals inside a millisecond. That is what took the first live run through the
    // kitchen to a stuck pause under "It's only a short distance to the next guide."
    // (docs/runs/tutorial-island-local.jsonl, seq 200 to 208).
    when: s => when(s) && flashingTab(s) !== null,
    timeoutMs: 20_000,
    async run(c) {
      const tab = flashingTab(c.state());
      if (tab === null) return { success: false, message: 'no tab is flashing', reason: 'not_found' };
      c.status(opts.status ?? `Opening tab ${tab}`);
      await c.sdk.sendSetTab(tab);
      await c.wait.until(s => flashingTab(s) !== tab, { timeoutMs: 10_000, label: name });
    }
  };
}

/** Uses one inventory item on another by name, which is how most of the island's crafting works. */
export async function useItemOn(c: ScriptContext, sourceName: string, targetName: string): Promise<{ success: boolean; message: string; reason?: string }> {
  const inventory = c.state().inventory ?? [];
  const matches = (name: string) => (item: { name?: string }): boolean => (item.name ?? '').toLowerCase() === name.toLowerCase();
  const source = inventory.find(matches(sourceName));
  const target = inventory.find(matches(targetName));
  if (!source || !target) {
    return { success: false, message: `need ${sourceName} and ${targetName} in the inventory`, reason: 'not_found' };
  }
  return c.sdk.sendUseItemOnItem(source.slot, target.slot);
}
