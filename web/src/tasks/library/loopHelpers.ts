import type { WorldState } from '../../agent/types';
import type { Requirement, Task } from '../types';
export const levelOf = (s: WorldState, skill: string): number => s.skills?.find(k => k.name === skill)?.baseLevel ?? 1;
export const invFull = (s: WorldState): boolean => (s.inventory?.length ?? 0) >= 28;
/** How many matching items the inventory holds, counting stacks. */
export const countMatching = (s: WorldState, match: RegExp): number =>
  (s.inventory ?? []).filter(i => match.test(i.name ?? '')).reduce((n, i) => n + (i.count ?? 1), 0);
export const tool = (name: string): Requirement => ({ kind: 'item', name, text: `Needs a ${name.toLowerCase()} in your inventory or equipped` });
/**
 * Drop every inventory item whose name matches; one task reused by all three loops.
 *
 * `recovers: ['inventory-full']` is not decoration. The health monitor raises that condition on
 * the same snapshot `invFull` becomes true, and a condition no task claims goes to the default
 * recovery, which cannot empty a bag safely and says so: measured on the live stack in SP4b Task
 * 14, `chop-and-drop` filled its 28 slots, the monitor aborted the chopping task, the default
 * recovery logged "this script declares no way to empty it" and failed, and the run paused
 * `stuck` with a full bag and a drop task sitting right there. Claiming the condition leaves the
 * queue alone so this task's own `when` picks it up, and `c.health.recovered` is what clears it.
 *
 * With `keepParam` set the script has chosen to stop on a full bag instead, and its `until`
 * ends the run on the same snapshot; the claim then goes unanswered, which costs nothing on a
 * run that is over.
 */
export function dropAllTask(name: string, match: RegExp, keepParam?: string): Task {
  return {
    name, recovers: ['inventory-full'],
    when: (s, c) => invFull(s) && !(keepParam && c.params[keepParam] === true),
    // `inventory` is optional on the shared `WorldState` placeholder (a snapshot may be
    // partial before login) and so is an item's `name`, so both are guarded here.
    async run(c) {
      for (const item of (c.state().inventory ?? []).filter(i => match.test(i.name ?? ''))) {
        if (c.signal.aborted) return;
        await c.bot.dropItem(item, 'all');
      }
      // The monitor holds the condition `active` until this call, and stays silent about it
      // until it is made: an unanswered claim is a condition the run can never raise again.
      c.health.recovered('inventory-full');
    }
  };
}
