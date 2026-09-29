// Each recovery does the one thing spec 3.4's table says, against a context whose world the test
// drives - so "did the recovery work" is a real question the task has to answer, not a constant.
// Everything but death: the death behaviours are their own table and live in
// recovery.death.test.ts. The fake context both files drive lives in recovery.harness.ts.
import { expect, test, vi } from 'vitest';
import { recoveryTaskFor } from './recovery';
import { STALE_LOGOUT, deps as makeDeps, fakeCtx as makeCtx } from './recovery.harness';
import type { WorldState } from '../agent/types';

/** The harness with this file's spy factory bound in; `vi` cannot reach the harness itself. */
const fakeCtx = (world: Partial<WorldState> = {}, opts: Parameters<typeof makeCtx>[2] = {}) => makeCtx(vi.fn, world, opts);
const deps = () => makeDeps(vi.fn);
const mocked = (fn: unknown): ReturnType<typeof vi.fn> => fn as ReturnType<typeof vi.fn>;

test('every recovery is a task named for the condition it recovers', () => {
  const all = ['unexpected-interface', 'dialog-stuck', 'level-up', 'no-progress', 'inventory-full', 'death', 'logout'] as const;
  for (const c of all) {
    expect(recoveryTaskFor(c, deps())?.name).toBe(`recover:${c}`);
  }
});

test('unexpected-interface closes the modal and settles recovered once it is gone', async () => {
  const d = deps();
  const { ctx } = fakeCtx({ modalOpen: true, modalInterface: 99 });
  await recoveryTaskFor('unexpected-interface', d)!.run(ctx);
  expect(ctx.sdk.sendCloseModal).toHaveBeenCalled();
  expect(ctx.bot.dismissBlockingUI).not.toHaveBeenCalled();
  expect(d.settle).toHaveBeenCalledWith('unexpected-interface', 'recovered');
});

test('an interface that will not close falls back to dismiss and settles failed', async () => {
  const d = deps();
  const { ctx } = fakeCtx({ modalOpen: true, modalInterface: 99 }, { sticky: true });
  mocked(ctx.sdk.sendCloseModal).mockResolvedValue({ success: false, message: 'no' });
  await recoveryTaskFor('unexpected-interface', d)!.run(ctx);
  expect(ctx.bot.dismissBlockingUI).toHaveBeenCalled();
  expect(d.settle).toHaveBeenCalledWith('unexpected-interface', 'failed');
});

test('dialog-stuck clicks through and settles on whether the dialog actually closed', async () => {
  const d = deps();
  const { ctx } = fakeCtx({ dialog: { isOpen: true, options: [], isWaiting: false } });
  await recoveryTaskFor('dialog-stuck', d)!.run(ctx);
  expect(ctx.tutorial.clickThrough).toHaveBeenCalledWith(5);
  expect(d.settle).toHaveBeenCalledWith('dialog-stuck', 'recovered');
});

test('a dialog that survives the click-through settles failed, so the ladder escalates', async () => {
  const d = deps();
  const { ctx } = fakeCtx({ dialog: { isOpen: true, options: [], isWaiting: false } }, { sticky: true });
  await recoveryTaskFor('dialog-stuck', d)!.run(ctx);
  expect(d.settle).toHaveBeenCalledWith('dialog-stuck', 'failed');
});

test('level-up uses the same click-through and reports its own condition', async () => {
  const d = deps();
  const { ctx } = fakeCtx({ dialog: { isOpen: true, options: [], isWaiting: false } });
  await recoveryTaskFor('level-up', d)!.run(ctx);
  expect(ctx.tutorial.clickThrough).toHaveBeenCalledWith(5);
  expect(d.settle).toHaveBeenCalledWith('level-up', 'recovered');
});

test('no-progress re-scans first, then walks back to the anchor, not to wherever it happens to be', async () => {
  const d = deps();
  const { ctx, calls } = fakeCtx({}, { anchor: { x: 50, z: 60 } });
  await recoveryTaskFor('no-progress', d)!.run(ctx);
  // Spec 3.4: status, one re-scan, then re-path. The scan has to come first, or the walk home
  // is decided on the same 15-tile window that produced the condition.
  expect(calls).toEqual(['scan', 'travel:50,60']);
  expect(ctx.sdk.scanNearbyLocs).toHaveBeenCalledWith(30);
  expect(ctx.travel.to).toHaveBeenCalledWith({ x: 50, z: 60 }, expect.objectContaining({ tolerance: 3 }));
  expect(d.settle).toHaveBeenCalledWith('no-progress', 'recovered');
});

test('a re-scan that fails still walks home', async () => {
  const d = deps();
  const { ctx, calls } = fakeCtx();
  mocked(ctx.sdk.scanNearbyLocs).mockRejectedValue(new Error('no scan'));
  await recoveryTaskFor('no-progress', d)!.run(ctx);
  expect(calls).toEqual(['travel:10,10']);
  expect(d.settle).toHaveBeenCalledWith('no-progress', 'recovered');
});

test('a travel that fails settles failed, so the ladder escalates instead of looping', async () => {
  const d = deps();
  const { ctx } = fakeCtx();
  mocked(ctx.travel.to).mockResolvedValue({ success: false, reason: 'unreachable', legs: 2, tiles: 0 });
  await recoveryTaskFor('no-progress', d)!.run(ctx);
  expect(d.settle).toHaveBeenCalledWith('no-progress', 'failed');
});

test('inventory-full with no script handler settles failed rather than dropping something', async () => {
  const d = deps();
  const { ctx } = fakeCtx();
  await recoveryTaskFor('inventory-full', d)!.run(ctx);
  expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining('full'), 'warn');
  expect(d.settle).toHaveBeenCalledWith('inventory-full', 'failed');
});

test('a condition with no default recovery returns null', () => {
  // low-hp is the runner's own hard stop, and only the script that declared `consumes` knows how
  // to restock; both go straight to their typed failure instead of through a task.
  for (const c of ['low-hp', 'out-of-supplies'] as const) {
    expect(recoveryTaskFor(c, deps())).toBeNull();
  }
});

test('logout re-logs in and waits for the world to come back', async () => {
  const d = deps();
  const { ctx, calls, worldBackAfter } = fakeCtx(STALE_LOGOUT);
  worldBackAfter(2);
  await recoveryTaskFor('logout', d)!.run(ctx);
  expect(d.relogin).toHaveBeenCalledTimes(1);
  expect(calls).toEqual(['wait:world after relogin']);
  expect(d.settle).toHaveBeenCalledWith('logout', 'recovered');
});

test('a login that resolves ok against a stale snapshot waits, and settles failed', async () => {
  const d = deps();
  // The pre-logout position is still in the snapshot and always will be, so anything that tests
  // where the player is standing would call this recovered before a world came back.
  const { ctx } = fakeCtx(STALE_LOGOUT);
  await recoveryTaskFor('logout', d)!.run(ctx);
  expect(d.settle).toHaveBeenCalledWith('logout', 'failed');
});

test('a login the session manager refuses settles failed without waiting for a world', async () => {
  const d = deps();
  d.relogin.mockResolvedValue({ ok: false, reason: 'Login already in progress.' });
  const { ctx, calls } = fakeCtx();
  await recoveryTaskFor('logout', d)!.run(ctx);
  expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining('Login already in progress.'), 'warn');
  expect(calls).toEqual([]);
  expect(d.settle).toHaveBeenCalledWith('logout', 'failed');
});

test('logout gives up after maxRelogins', async () => {
  const d = { ...deps(), maxRelogins: 1 };
  d.relogin.mockResolvedValue({ ok: false, reason: 'no credentials' });
  const { ctx } = fakeCtx();
  const task = recoveryTaskFor('logout', d)!;
  // The runner is what stops re-running a failed task, and it reads `maxAttempts`. A recovery
  // that ignored `maxRelogins` would keep asking the session manager to log in for ever.
  expect(task.maxAttempts).toBe(1);
  await task.run(ctx);
  expect(d.settle).toHaveBeenLastCalledWith('logout', 'failed');
});
