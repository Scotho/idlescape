// What a run does about its own death, one test per `DeathBehaviour`, asserting the ordered calls
// rather than only the settle: the order is the behaviour. Split from recovery.test.ts when it
// crossed the 400-line ceiling; the fake context both files drive lives in recovery.harness.ts.
import { expect, test, vi } from 'vitest';
import { recoveryTaskFor } from './recovery';
import { LOOT_WINDOW_MS } from './lootRecovery';
import { dead, deps as makeDeps, fakeCtx as makeCtx } from './recovery.harness';
import type { DeathBehaviour } from './types';
import type { WorldState } from '../agent/types';

/** The harness with this file's spy factory bound in; `vi` cannot reach the harness itself. */
const fakeCtx = (world: Partial<WorldState> = {}, opts: Parameters<typeof makeCtx>[2] = {}) => makeCtx(vi.fn, world, opts);
/** `calls` is the context's own log, so `logout` takes its place in the ordering. */
const deps = (calls?: string[]) => makeDeps(vi.fn, calls);
const mocked = (fn: unknown): ReturnType<typeof vi.fn> => fn as ReturnType<typeof vi.fn>;

/** A dead character, a run anchor at 50,50, and deps sharing the context's call log. */
function onDeath(policy: DeathBehaviour) {
  const world = fakeCtx({ player: dead() }, { anchor: { x: 50, z: 50 } });
  return { ...world, d: { ...deps(world.calls), onDeath: policy } };
}

test('death with onDeath: return waits for the respawn, walks back to the anchor and resumes', async () => {
  const d = { ...deps(), onDeath: 'return' as const };
  const { ctx, calls, becomeAliveAfter } = fakeCtx({ player: dead({ worldX: 100, worldZ: 100 }) }, { anchor: { x: 50, z: 50 } });
  becomeAliveAfter(2);                       // the fake world respawns two looks in
  await recoveryTaskFor('death', d)!.run(ctx);
  // The order is the whole recovery: a corpse cannot walk, so the wait has to finish first.
  expect(calls).toEqual(['wait:respawn', 'travel:50,50']);
  expect(ctx.travel.to).toHaveBeenCalledWith({ x: 50, z: 50 }, expect.objectContaining({ tolerance: 3 }));
  expect(d.settle).toHaveBeenCalledWith('death', 'recovered');
});

test('a death that never respawns settles failed rather than walking a corpse home', async () => {
  const d = deps();
  const { ctx } = fakeCtx({ player: dead() });
  await recoveryTaskFor('death', d)!.run(ctx);
  // The walk is not attempted at all: a trip that cannot start would spend the rest of the task
  // budget before reporting the failure the ladder is already waiting for.
  expect(ctx.travel.to).not.toHaveBeenCalled();
  expect(d.settle).toHaveBeenCalledWith('death', 'failed');
});

test('death with onDeath: resume waits for the respawn but does not walk back', async () => {
  const d = { ...deps(), onDeath: 'resume' as const };
  const { ctx, becomeAliveAfter } = fakeCtx({ player: dead() }, { anchor: { x: 50, z: 50 } });
  becomeAliveAfter(1);
  await recoveryTaskFor('death', d)!.run(ctx);
  // `resume` carries on from the respawn point; the walk home is what `return` adds.
  expect(ctx.travel.to).not.toHaveBeenCalled();
  expect(d.settle).toHaveBeenCalledWith('death', 'recovered');
});

test('death with onDeath: fail settles failed on the first death, without waiting for a respawn', async () => {
  const d = { ...deps(), onDeath: 'fail' as const };
  const { ctx, calls } = fakeCtx({ player: dead() });
  await recoveryTaskFor('death', d)!.run(ctx);
  // The run is over now: nothing waits and nothing walks. The monitor's second-death budget is
  // a different rule, and this one fires on the first.
  expect(calls).toEqual([]);
  expect(d.settle).toHaveBeenCalledWith('death', 'failed');
});

test('the default policy goes back for the loot before it walks to the anchor', async () => {
  const d = deps();
  const { ctx, calls, becomeAliveAfter } = fakeCtx({ player: dead({ worldX: 100, worldZ: 100 }) }, { anchor: { x: 50, z: 50 } });
  becomeAliveAfter(1);
  await recoveryTaskFor('death', d)!.run(ctx);
  // The ordering is the whole feature: respawn, then the death tile, then home. Looting after
  // the anchor walk would be a second trip, and the pile despawns 120 s after the death.
  expect(calls).toEqual(['wait:respawn', 'travel:3200,3200', 'scanGround', 'pickup', 'travel:50,50']);
  expect(d.settle).toHaveBeenCalledWith('death', 'recovered');
});

test('return skips the loot walk entirely', async () => {
  const d = { ...deps(), onDeath: 'return' as const };
  const { ctx, calls, becomeAliveAfter } = fakeCtx({ player: dead() }, { anchor: { x: 50, z: 50 } });
  becomeAliveAfter(1);
  await recoveryTaskFor('death', d)!.run(ctx);
  expect(calls).toEqual(['wait:respawn', 'travel:50,50']);
  expect(ctx.bot.pickupItem).not.toHaveBeenCalled();
});

test('resume neither loots nor walks', async () => {
  const d = { ...deps(), onDeath: 'resume' as const };
  const { ctx, calls, becomeAliveAfter } = fakeCtx({ player: dead() });
  becomeAliveAfter(1);
  await recoveryTaskFor('death', d)!.run(ctx);
  expect(calls).toEqual(['wait:respawn']);
  expect(ctx.travel.to).not.toHaveBeenCalled();
});

test('a death with no recorded tile still walks to the anchor', async () => {
  const d = deps();
  d.deathTile.mockReturnValue(null);
  const { ctx, calls, becomeAliveAfter } = fakeCtx({ player: dead() }, { anchor: { x: 50, z: 50 } });
  becomeAliveAfter(1);
  await recoveryTaskFor('death', d)!.run(ctx);
  expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining('no recorded death tile'), 'warn');
  expect(calls).toEqual(['wait:respawn', 'travel:50,50']);
  expect(d.settle).toHaveBeenCalledWith('death', 'recovered');
});

test('a loot walk that cannot reach the death tile does not fail the recovery', async () => {
  const d = deps();
  const { ctx, calls, becomeAliveAfter } = fakeCtx({ player: dead() }, { anchor: { x: 50, z: 50 } });
  becomeAliveAfter(1);
  // Unreachable to the death tile, fine to the anchor: the run is alive either way, and the loot
  // was already lost the moment it died.
  mocked(ctx.travel.to).mockImplementation(async (t: { x: number; z: number }) => {
    calls.push(`travel:${t.x},${t.z}`);
    return t.x === 3200 ? { success: false, reason: 'unreachable', legs: 1, tiles: 0 } : { success: true, legs: 1, tiles: 5 };
  });
  await recoveryTaskFor('death', d)!.run(ctx);
  expect(calls).toEqual(['wait:respawn', 'travel:3200,3200', 'travel:50,50']);
  expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining('unreachable'), 'warn');
  expect(d.settle).toHaveBeenCalledWith('death', 'recovered');
});

test('a loot walk that throws does not fail the recovery either', async () => {
  const d = deps();
  const { ctx, calls, becomeAliveAfter } = fakeCtx({ player: dead() }, { anchor: { x: 50, z: 50 } });
  becomeAliveAfter(1);
  mocked(ctx.bot.pickupItem).mockRejectedValue(new Error('worker gone'));
  await recoveryTaskFor('death', d)!.run(ctx);
  // Without the catch this throws out of `run`, the ladder never gets its settle, and the death
  // stays the active condition for the rest of the run.
  expect(calls).toEqual(['wait:respawn', 'travel:3200,3200', 'scanGround', 'travel:50,50']);
  expect(d.settle).toHaveBeenCalledWith('death', 'recovered');
});

test('a loot phase that spends the whole window still leaves the anchor walk its own budget', async () => {
  const d = deps();
  const { ctx, calls, becomeAliveAfter } = fakeCtx({ player: dead() }, { anchor: { x: 50, z: 50 } });
  becomeAliveAfter(1);
  mocked(ctx.travel.to).mockImplementation(async (t: { x: number; z: number }) => {
    calls.push(`travel:${t.x},${t.z}`);
    // The loot walk runs the 120 s window almost flat before it gives up. The deadline is
    // absolute, so what it hands back to the anchor walk is whatever the task budget has left.
    if (t.x === 3200) { d.burn(LOOT_WINDOW_MS - 1000); return { success: false, reason: 'timeout', legs: 4, tiles: 50 }; }
    return { success: true, legs: 1, tiles: 5 };
  });
  const task = recoveryTaskFor('death', d)!;
  await task.run(ctx);
  expect(calls).toEqual(['wait:respawn', 'travel:3200,3200', 'travel:50,50']);
  expect(d.settle).toHaveBeenCalledWith('death', 'recovered');
  // And the budget that keeps the runner from aborting that second walk part way: a respawn
  // wait, the whole loot window, and a full-length walk home after it.
  expect(task.timeoutMs).toBeGreaterThanOrEqual(60_000 + LOOT_WINDOW_MS + 120_000);
});

test('pause neither loots nor walks, and leaves the ending to the ladder', async () => {
  const { ctx, calls, d, becomeAliveAfter } = onDeath('pause');
  becomeAliveAfter(1);
  await recoveryTaskFor('death', d)!.run(ctx);
  // The respawn is still waited out - a player coming back to a paused run should find a live
  // character, not a corpse - and then nothing at all. `pause-stuck` is the monitor's to decide.
  expect(calls).toEqual(['wait:respawn']);
  expect(ctx.travel.to).not.toHaveBeenCalled();
  expect(d.logout).not.toHaveBeenCalled();
  expect(d.settle).toHaveBeenCalledWith('death', 'recovered');
});

test('logout logs out without looting, and without walking home', async () => {
  const { ctx, calls, d, becomeAliveAfter } = onDeath('logout');
  becomeAliveAfter(1);
  await recoveryTaskFor('death', d)!.run(ctx);
  expect(calls).toEqual(['wait:respawn', 'logout']);
  expect(ctx.travel.to).not.toHaveBeenCalled();
  expect(ctx.bot.pickupItem).not.toHaveBeenCalled();
  // The run ends because the ladder turns this settle into `{ fail: 'logged_out' }`, not because
  // the recovery failed: nothing went wrong, the player asked for it.
  expect(d.settle).toHaveBeenCalledWith('death', 'recovered');
});

test('loot-and-logout loots first, then logs out, and never walks home', async () => {
  const { ctx, calls, d, becomeAliveAfter } = onDeath('loot-and-logout');
  becomeAliveAfter(1);
  await recoveryTaskFor('death', d)!.run(ctx);
  // The ordering is the whole behaviour: the pile despawns 120 s after the death, so the loot
  // walk cannot wait for anything, and the logout cannot come before it.
  expect(calls).toEqual(['wait:respawn', 'travel:3200,3200', 'scanGround', 'pickup', 'logout']);
  expect(ctx.travel.to).toHaveBeenCalledTimes(1);
  expect(d.settle).toHaveBeenCalledWith('death', 'recovered');
});

test('a logout policy whose respawn never lands still logs out', async () => {
  for (const policy of ['logout', 'loot-and-logout'] as const) {
    const { ctx, calls, d } = onDeath(policy);
    // No `becomeAliveAfter`: the character stays a corpse for the whole respawn budget.
    await recoveryTaskFor('death', d)!.run(ctx);
    // The ladder answers a logout policy with `{ fail: 'logged_out' }` whatever this settle says,
    // and `runHealth` skips its own call for a death. Leaving without the packet would report an
    // account logged out and leave it online, with nothing left in the run that would log it out.
    expect(calls).toEqual(['wait:respawn', 'logout']);
    expect(d.logout).toHaveBeenCalledTimes(1);
    expect(ctx.travel.to).not.toHaveBeenCalled();
    // Still `failed`: nothing recovered. The ending is the ladder's to name, not this settle's.
    expect(d.settle).toHaveBeenCalledWith('death', 'failed');
  }
});

test('a death that never respawns under a carry-on policy sends no logout packet', async () => {
  const { ctx, calls, d } = onDeath('return');
  await recoveryTaskFor('death', d)!.run(ctx);
  expect(calls).toEqual(['wait:respawn']);
  expect(d.logout).not.toHaveBeenCalled();
});

test('a loot-and-logout whose loot walk fails still logs out', async () => {
  const { ctx, calls, d, becomeAliveAfter } = onDeath('loot-and-logout');
  becomeAliveAfter(1);
  mocked(ctx.travel.to).mockImplementation(async (t: { x: number; z: number }) => {
    calls.push(`travel:${t.x},${t.z}`);
    return { success: false, reason: 'unreachable', legs: 1, tiles: 0 };
  });
  await recoveryTaskFor('death', d)!.run(ctx);
  // The loot was lost the moment the character died. A walk that could not reach it must not
  // turn the ending the player asked for into a failed run.
  expect(calls).toEqual(['wait:respawn', 'travel:3200,3200', 'logout']);
  expect(d.settle).toHaveBeenCalledWith('death', 'recovered');
});
