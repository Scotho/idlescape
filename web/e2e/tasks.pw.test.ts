import { expect, test } from '@playwright/test';
import { canvasClick, loginAsGuest, openHome, openPanel, VIEWPORT_CENTRE } from './helpers';

// SP4a Task 14: the script runtime through the browser, on the human path — the Marketplace shop
// window, `window.idlescape.tasks`, the co-pilot bar, the Tasks panel's run card, and the history a
// finished run leaves behind.
//
// A fresh guest stands in the Tutorial Island guide's house with no tools, so every bundled
// script is out of reach: that is what makes this the right place to prove requirements are never
// bypassed. The run itself is driven by a user script saved through the api, which needs nothing
// from the world.

/**
 * The script the runtime assertions ride on. It only has to stay in `running` long enough to be
 * paused, resumed and stopped, so it does the smallest honest thing: names itself in the status
 * line and sleeps.
 *
 * It deliberately does NOT call `bot.walkTo`: from the tutorial start that never returns (it waits
 * on the character-design chatbox, and there is no collision data to path with until SP4b). It
 * does wait on game ticks, which is itself an assertion — a task that awaits `c.wait.ticks` only
 * comes back if the Worker is fed a fresh world snapshot every tick. Before the SP4a fix round it
 * was not: the host de-duplicated states on a `revision` the client never advanced off 0, so
 * exactly one snapshot ever crossed and every `wait.*` hung.
 */
const LOOP_SCRIPT = `export default defineScript({
  id: 'e2e-loop', name: 'e2e loop', version: 1, description: '', stuckAfterMs: 20000,
  tasks: [{ name: 'step', when: () => true, timeoutMs: 8000, async run(c) {
    c.status('stepping');
    await c.wait.ticks(1);
  } }]
});`;

/** A script nothing matches, so the runner should notice it has nothing to do and say so. */
const NEVER_SCRIPT = `export default defineScript({
  id: 'e2e-never', name: 'e2e never', version: 1, description: '', stuckAfterMs: 3000,
  tasks: [{ name: 'never', when: () => false, run: async () => {} }]
});`;

test.describe('tasks runtime', () => {
  test('the marketplace lists the library and never bypasses a requirement', async ({ page }) => {
    await openHome(page);
    await loginAsGuest(page);
    // The Marketplace is a tab of the Automation panel now (G4), not a panel of its own.
    await openPanel(page, 'tasks');
    await expect(page.locator('#panel-title')).toHaveText('Automation');
    await page.click('.seg-btn[data-seg="market"]');

    for (const id of ['chop-and-drop', 'net-fish-and-drop', 'mine-and-drop']) {
      await expect(page.locator(`[data-market-card="${id}"]`)).toBeVisible();
    }

    // No axe in the guide's house, so the card says why it is not ready. The button stays live on
    // purpose (the panel refuses the run and explains, rather than presenting a dead control).
    const chop = page.locator('[data-market-card="chop-and-drop"]');
    await expect(chop).toContainText('Not ready yet');
    await expect(chop).toContainText(/bronze axe/i);

    // Requirements are enforced by the api, not by the panel: the refusal is the same one the
    // Tasks tab, the co-pilot bar and (in SP4c) the tab relay would get.
    const refusal = await page.evaluate(async () => {
      try {
        await window.idlescape!.tasks!.run('chop-and-drop');
        return { code: 'no-error', message: '' };
      } catch (e) {
        const err = e as { code?: string; message?: string };
        return { code: err.code ?? 'unknown', message: err.message ?? '' };
      }
    });
    expect(refusal.code).toBe('requirements');
    expect(refusal.message).toMatch(/bronze axe/i);

    // The same refusal on the human path: pressing Run now raises it as a toast.
    await chop.locator('[data-market-run]').click();
    await expect(page.locator('.toast-host')).toContainText(/bronze axe/i);
    await expect.poll(() => page.evaluate(() => window.idlescape!.tasks!.status().state)).toBe('idle');
  });

  test('a run shows in the co-pilot bar and the run card, human input pauses it, and Stop ends it', async ({ page }) => {
    await openHome(page);
    await loginAsGuest(page);

    const saved = await page.evaluate(async code => window.idlescape!.tasks!.save({
      id: 'e2e-loop', name: 'e2e loop', description: 'holds a run open for the e2e', tags: ['test'],
      params: {}, code, source: 'user'
    }), LOOP_SCRIPT);
    expect(saved).toMatchObject({ id: 'e2e-loop', version: 1 });

    const runId = await page.evaluate(async () =>
      (await window.idlescape!.tasks!.run('e2e-loop', {}, { startedBy: 'test' })).runId);
    expect(runId).toBeTruthy();

    const bar = page.locator('#copilot-bar');
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute('data-state', 'running');
    await expect(bar).toContainText('e2e loop');
    await expect(page.locator('[data-panel="tasks"] .strip-dot')).toHaveClass(/dot-accent/);
    await expect.poll(() => page.evaluate(() => window.idlescape!.tasks!.status().task)).toBe('step');

    await test.step('the Tasks tab shows the run card, and Escape is the panic key', async () => {
      await openPanel(page, 'tasks');
      await expect(page.locator('[data-run-card] [data-run-state]')).toHaveText('Running');
      await page.keyboard.press('Escape');
      await expect.poll(() => page.evaluate(() => window.idlescape!.tasks!.status().state)).toBe('paused');
      // Escape pauses as the player, so only the player resumes it — the run card's own control.
      // The bar is asserted on both edges now that the api republishes every host status move:
      // `pause`/`resume` publish before the Worker has answered, so the settled state only ever
      // arrives on the host's own `onStatus`. The bar carries its state on `data-state` (the v2
      // chrome keys off it), and the card's badge is the same words in title case (ruling R22).
      await expect(bar).toHaveAttribute('data-state', 'paused');
      await expect(bar).toContainText('paused — you took control');
      await expect(page.locator('[data-run-card] [data-run-state]')).toHaveText('Paused — you took control');
      await page.locator('[data-run-resume]').click();
      await expect.poll(() => page.evaluate(() => window.idlescape!.tasks!.status().state)).toBe('running');
      await expect(bar).toHaveAttribute('data-state', 'running');
      await expect(page.locator('[data-run-card] [data-run-state]')).toHaveText('Running');
    });

    await test.step('a real click pauses the run and it resumes on its own', async () => {
      await canvasClick(page, VIEWPORT_CENTRE.x + 40, VIEWPORT_CENTRE.y + 40);
      await expect.poll(() => page.evaluate(() => window.idlescape!.tasks!.status().reason)).toBe('human-input');
      await expect(bar).toHaveAttribute('data-state', 'paused');
      await expect(bar).toContainText('paused — you took control');
      // The pause carries its own deadline, which is what the bar and the run card count down.
      expect(await page.evaluate(() => window.idlescape!.tasks!.status().resumeAtMs)).not.toBeNull();
      await expect
        .poll(() => page.evaluate(() => window.idlescape!.tasks!.status().state), { timeout: 15_000 })
        .toBe('running');
      // The auto-resume moves the host's status with nothing the api asked for behind it, which
      // is exactly the publication `TasksApi` used to miss: the bar kept saying the run was paused
      // for the rest of it.
      await expect(bar).toHaveAttribute('data-state', 'running');
      await expect(bar).not.toContainText('paused — you took control');
      await expect(page.locator('[data-run-card] [data-run-state]')).toHaveText('Running');
    });

    await test.step('Escape still works after the auto-resume', async () => {
      // The regression the stale banner caused: the bar's `onKey` gates the panic key on the
      // status it last heard about, so a missed auto-resume killed Escape for the rest of the run.
      await page.keyboard.press('Escape');
      // `player`, not `human-input`: the panic key is a hard pause that waits for the player,
      // so a `human-input` reason here would mean the key was read as gameplay input instead.
      await expect.poll(() => page.evaluate(() => window.idlescape!.tasks!.status().reason)).toBe('player');
      await expect.poll(() => page.evaluate(() => window.idlescape!.tasks!.status().state)).toBe('paused');
      await expect(bar).toHaveAttribute('data-state', 'paused');
      await page.locator('[data-run-resume]').click();
      await expect.poll(() => page.evaluate(() => window.idlescape!.tasks!.status().state)).toBe('running');
      await expect(bar).toHaveAttribute('data-state', 'running');
    });

    await test.step('Escape reaches the shell from the focused game canvas', async () => {
      // The posture that matters: the player is looking at the game, so the client canvas inside
      // the iframe holds focus. Two things have to be true for the panic key to work there. The
      // bar's listener sits on the parent document and a keydown in a same-origin iframe never
      // crosses the frame boundary, so the stage forwards it (`frame/stage.ts` forwardEscape); and
      // Escape is the shell's pause key rather than gameplay input, so the transport's human-input
      // watcher ignores it (`agent/localTransport.ts`) instead of pausing with `human-input` first.
      await canvasClick(page, VIEWPORT_CENTRE.x + 40, VIEWPORT_CENTRE.y + 40);
      await expect.poll(() => page.evaluate(() => window.idlescape!.tasks!.status().reason)).toBe('human-input');
      // Let the click's own pause run out, so the Escape below is the only thing pausing the run.
      await expect
        .poll(() => page.evaluate(() => window.idlescape!.tasks!.status().state), { timeout: 15_000 })
        .toBe('running');
      await expect
        .poll(() => page.evaluate(() => {
          const frame = document.querySelector<HTMLIFrameElement>('#client-frames iframe:not(.hidden)');
          return frame?.contentDocument?.activeElement?.id ?? null;
        }))
        .toBe('canvas');
      await page.keyboard.press('Escape');
      // `player`, not `human-input`: the hard pause only lands when the forwarding works and the
      // canvas keydown was not counted as the player taking over.
      await expect.poll(() => page.evaluate(() => window.idlescape!.tasks!.status().reason)).toBe('player');
      await expect.poll(() => page.evaluate(() => window.idlescape!.tasks!.status().state)).toBe('paused');
      await expect(bar).toHaveAttribute('data-state', 'paused');
      await page.locator('[data-run-resume]').click();
      await expect.poll(() => page.evaluate(() => window.idlescape!.tasks!.status().state)).toBe('running');
      await expect(bar).toHaveAttribute('data-state', 'running');
    });

    await test.step('Stop ends the run, the bar falls back to standby and history keeps the trace', async () => {
      await page.locator('[data-run-stop]').click();
      await expect.poll(() => page.evaluate(() => window.idlescape!.tasks!.status().state)).toBe('stopped');
      // The v2 bar never hides: it is 42px of persistent chrome in all five states, so the end of
      // a run is the IDLE chrome arriving. Which of the two it is comes from pairing, not from the
      // run (rows 9 and 10 of the mapping): this guest has no Claude session, so it is `unpaired`,
      // and either value proves the run chrome is gone. The 10s covers ruling R4's linger.
      await expect(bar).toHaveAttribute('data-state', /^(standby|unpaired)$/, { timeout: 10_000 });

      const runs = await page.evaluate(() => window.idlescape!.tasks!.listRuns(5));
      expect(runs[0]).toMatchObject({ runId, status: 'stopped', scriptId: 'e2e-loop' });

      const trace = await page.evaluate(id => window.idlescape!.tasks!.getRun(id), runId);
      expect(trace.events.map(e => e.kind)).toEqual(
        expect.arrayContaining(['run_started', 'task_enter', 'paused', 'resumed', 'run_done']));
      await expect(page.locator(`[data-history-row="${runId}"]`)).toBeVisible();
    });
  });

  // Both of these need the Worker to see the world move: `wait.*` only resolves on a snapshot it
  // has not seen before, and the runner's stuck timer only fires from its tick loop. Neither could
  // pass while the host de-duplicated world states on a `revision` the client never advanced.
  test('a snippet waits on game ticks and the world clock advances inside the Worker', async ({ page }) => {
    await openHome(page);
    await loginAsGuest(page);

    // The first `wait.ticks` is the baseline, not the assertion: a snippet can start before the
    // Worker has been handed any snapshot at all, and `state()` is an empty object until then.
    const r = await page.evaluate(() => window.idlescape!.tasks!.execute(`
      await wait.ticks(1);
      const before = state().tick;
      await wait.ticks(3);
      return { before, after: state().tick };`));
    expect(r.error ?? '').toBe('');
    expect(r.ok).toBe(true);
    const { before, after } = r.value as { before: number; after: number };
    expect(after).toBeGreaterThanOrEqual(before + 3);
  });

  test('a script with nothing to do goes stuck', async ({ page }) => {
    await openHome(page);
    await loginAsGuest(page);

    await page.evaluate(async code => {
      const api = window.idlescape!.tasks!;
      await api.save({ id: 'e2e-never', name: 'e2e never', description: '', tags: ['test'], params: {}, code, source: 'user' });
      await api.run('e2e-never', {}, { startedBy: 'test' });
    }, NEVER_SCRIPT);
    await expect
      .poll(() => page.evaluate(() => window.idlescape!.tasks!.status().reason), { timeout: 15_000 })
      .toBe('stuck');
    // The stuck pause starts in the Worker with no control action behind it, so the bar only
    // hears about it because the api republishes every host status move.
    await expect(page.locator('#copilot-bar')).toContainText(/stuck on /);
    await page.evaluate(() => window.idlescape!.tasks!.stop('player'));
  });

  // The guide snippet from the brief. It was skipped through SP4a because `bot.talkTo` walks to
  // its target first and `walkTo` had no collision data to path with; SP4b shipped
  // `collision.bin` and the real pathfinder over it, and the snippet has run green against the
  // live stack since (SP4b's fix wave, 5.9 s).
  //
  // The `wait.until` in front of the talk is the whole reason this spec is reliable in the full
  // suite rather than only on its own, and it is an assertion, not a settling delay. Measured in
  // a full run on 2026-09-07: the snippet's opening `state()` was the session's FIRST
  // publication -- `tick: 1`, `nearbyNpcs: []`, the local player still at its pre-placement
  // sentinel coordinates, and "Welcome to RuneScape." the only game message. `loginAsGuest`
  // returns on that first player-update packet, and the npc list, the scene entities and the
  // character-design modal all arrive on later ticks. `bot.talkTo` resolves its target out of
  // whatever snapshot the Worker holds when it is called, so from there it answered
  // `NPC not found` synchronously and the 8 s `wait.dialog` behind it could only ever fail --
  // `{ talk: false, opened: false }`, which is exactly what the gate run reported. Run alone the
  // spec is slow enough that the guide is already in view, which is why it passed by itself and
  // failed in company. The sibling spec above states the same rule for `wait.*` and opens with a
  // baseline `wait.ticks(1)` for it; a `bot.*` call needs the same thing and more of it, because
  // it reads a populated scene rather than a counter.
  test('a snippet talks to the RuneScape Guide and a dialog opens', async ({ page }) => {
    await openHome(page);
    await loginAsGuest(page);
    const r = await page.evaluate(() => window.idlescape!.tasks!.execute(`
      const seen = await wait.until(
        s => (s.nearbyNpcs ?? []).some(n => /runescape guide/i.test(n.name) && n.distance <= 5),
        { timeoutMs: 30000, label: 'the guide is in view' });
      const r = await bot.talkTo(/runescape guide/i);
      const opened = await wait.dialog(undefined, 8000);
      return { seen, talk: r.success, opened, why: r.message ?? '', title: state().tutorial.title };`));
    expect(r.ok).toBe(true);
    // The message carries the run's own account of itself: `seen` false means the world never
    // arrived, `why` is `talkTo`'s refusal, and a failure that prints neither is a new shape.
    expect(r.value, JSON.stringify(r.value)).toMatchObject({ seen: true, talk: true, opened: true });
    expect(String((r.value as { title: string }).title)).toMatch(/getting started/i);
  });
});
