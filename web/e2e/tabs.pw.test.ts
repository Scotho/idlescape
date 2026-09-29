import { expect, test } from '@playwright/test';
import {
  LOADING_BAR_RED, canvasPixels, clientState, createFirstCharacter, openCharacterTab, openHome,
  openPanel, pressTitleLogin, sessionStates, signUp, uniqueName
} from './helpers';

// SP7: one client per character behind a tab strip in the frame.
// Requires: firebase emulators, engine, front server (serving web/dist-e2e) all running.

test('a guest names their character, gets a tab, and sees the locked third slot', async ({ page }) => {
  const name = uniqueName('gt_');
  await openHome(page);

  await test.step('the naming form blocks an empty submit', async () => {
    await expect.poll(() => page.locator('#btn-guest').isEnabled(), { timeout: 30_000 }).toBe(true);
    await page.locator('#btn-guest').click();
    await expect(page.locator('#screen-characters')).toBeVisible({ timeout: 30_000 });
    await page.locator('#btn-char-create').click();
    // `required` on #char-name keeps the gate on screen; nothing was created.
    await expect(page.locator('#screen-characters')).toBeVisible();
    await expect(page.locator('#screen-frame')).toBeHidden();
  });

  await createFirstCharacter(page, name);
  await expect.poll(() => page.evaluate(() => window.idlescape?.client?.getState().loggedIn ?? false), { timeout: 90_000 }).toBe(true);

  await test.step('the strip shows the character, one free slot, the guest lock and coming soon', async () => {
    const strip = page.locator('#character-tabs');
    await expect(strip.locator(`[data-char-tab]:has-text("${name}")`)).toBeVisible();
    // An online tab counts instead of reading `online` (G3): `0:07`, or `1:29:07` past the hour.
    await expect
      .poll(async () => strip.locator('[data-char-tab] [data-tab-status]').first().textContent(), { timeout: 30_000 })
      .toMatch(/^\d+:\d{2}(:\d{2})?$/);
    await expect(strip.locator('[data-char-tab-new]')).toHaveCount(1);
    const locked = strip.locator('[data-char-tab-locked]');
    await expect(locked).toBeDisabled();
    await expect(locked).toHaveAttribute('title', 'Create an account to unlock a third character');
    const more = strip.locator('[data-char-tab-more]');
    await expect(more).toBeDisabled();
    await expect(more).toContainText('coming soon');
  });

  await test.step('exactly one client frame exists and it is visible', async () => {
    const states = await sessionStates(page);
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ gameName: name, loggedIn: true, hidden: false });
  });
});

test('a registered account runs two characters at once and logging one out leaves the other online', async ({ page }) => {
  const [one, two] = [uniqueName('ta_'), uniqueName('tb_')];
  await openHome(page);
  await signUp(page, 'Tabs');
  await createFirstCharacter(page, one);
  await expect.poll(() => page.evaluate(() => window.idlescape?.client?.getState().loggedIn ?? false), { timeout: 90_000 }).toBe(true);
  await expect.poll(async () => (await clientState(page)).sceneReady, { timeout: 120_000 }).toBe(true);
  const firstPosition = (await clientState(page)).position;

  await test.step('the second character is created from the panel and opened from its tab', async () => {
    await openPanel(page, 'account');
    await page.locator('#char-panel-name').fill(two);
    await page.locator('#char-panel-create button[type="submit"]').click();
    await expect(page.locator(`[data-char-row]:has-text("${two}")`)).toBeVisible({ timeout: 15_000 });
    await page.locator(`#character-tabs [data-char-tab]:has-text("${two}")`).click();
    // A returning tab stops at its own title screen: one centred Login button, no fields. Both
    // polls have to pass before the click below, or it would land on the first character's
    // canvas -- its frame is the visible one until the new session boots and takes the stage.
    await expect.poll(async () => (await sessionStates(page)).length, { timeout: 60_000 }).toBe(2);
    await expect.poll(async () => (await clientState(page)).loggedIn, { timeout: 30_000 }).toBe(false);
    await pressTitleLogin(page);
    await expect.poll(async () => (await clientState(page)).gameName, { timeout: 90_000 }).toBe(two);
    await expect.poll(async () => (await clientState(page)).sceneReady, { timeout: 120_000 }).toBe(true);
  });

  await test.step('both clients are online at the same time, one hidden', async () => {
    const states = await sessionStates(page);
    expect(states.filter(s => s.loggedIn)).toHaveLength(2);
    expect(states.filter(s => s.hidden)).toHaveLength(1);
    expect(states.map(s => s.gameName).sort()).toEqual([one, two].sort());
  });

  await test.step('switching back resumes the first session where it left off', async () => {
    await openCharacterTab(page, one);
    await expect.poll(async () => (await clientState(page)).gameName, { timeout: 30_000 }).toBe(one);
    const back = await clientState(page);
    expect(back.loggedIn).toBe(true);
    expect(back.sceneReady).toBe(true);
    // Rendering resumed: the pre-login loading bar's solid red is gone from the viewport.
    await expect
      .poll(() => canvasPixels(page, [{ x: 300, y: 250 }]).then(p => p[0]), { timeout: 15_000 })
      .not.toBe(LOADING_BAR_RED);
    expect(back.position.x).toBeGreaterThan(0);
    expect(Math.abs(back.position.x - firstPosition.x)).toBeLessThan(64);
  });

  await test.step('logging one tab out leaves the other online', async () => {
    await page.evaluate(() => window.idlescape!.client!.logout());
    await expect.poll(async () => (await clientState(page)).loggedIn, { timeout: 30_000 }).toBe(false);
    const states = await sessionStates(page);
    expect(states.filter(s => s.loggedIn).map(s => s.gameName)).toEqual([two]);
    await expect.poll(async () => page.locator(`#character-tabs [data-char-tab]:has-text("${one}") [data-tab-status]`).textContent(), { timeout: 15_000 }).toBe('offline');
    // The logged-out tab is back to the word; the one still in game keeps counting.
    await expect
      .poll(async () => page.locator(`#character-tabs [data-char-tab]:has-text("${two}") [data-tab-status]`).textContent())
      .toMatch(/^\d+:\d{2}(:\d{2})?$/);
  });
});
