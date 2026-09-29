import { expect, test } from '@playwright/test';
import { clientState, createFirstCharacter, loginAsGuest, openHome, signUp, uniqueName } from './helpers';

// The three ways out of the home screen: guest, the Claude pairing card, and a registered
// sign-up through the characters gate.
// Requires: firebase emulators, engine, front server (serving web/dist) all running. See scripts/verify.ps1.

test('home -> guest -> in game with hooks', async ({ page }) => {
  const frames: number[] = [];
  page.on('websocket', ws => ws.on('framereceived', f => frames.push(f.payload.length)));
  await openHome(page);

  // Nothing signs in automatically any more: the home screen enables its choices once the
  // (empty) auth state has resolved, and "Play as guest" mints the user, then holds them on the
  // naming form -- a guest picks their own name now (SP7) -- and starts the session from there.
  const chosen = uniqueName('gg_');
  const gameName = await loginAsGuest(page, chosen);
  expect(gameName).toBe(chosen);

  const state = await clientState(page);
  expect(state.skills.xp.length).toBeGreaterThan(20);
  expect(frames.length).toBeGreaterThan(10);
  // The guest warning lives on the home screen, which the auto-gate skips for a guest; in game
  // the same fact is carried by the footer.
  await expect(page.locator('#foot-left')).toContainText('guest · attach an email');

  await page.evaluate(() => window.idlescape!.client!.echoChat('hello from e2e'));
  await page.locator('[data-panel="account"]').click();
  await expect(page.locator('#panel-title')).toHaveText('Account');
  await expect(page.locator('.frame-title a.title-link')).toHaveAttribute('href', '/wiki');
  await page.screenshot({ path: '../docs/screenshots/e2e-in-game.png' });
});

test('connect to Claude shows a pairing link with fetchable markdown', async ({ page }) => {
  await openHome(page);
  await expect.poll(() => page.locator('#btn-connect').isEnabled(), { timeout: 30_000 }).toBe(true);

  // "Connect a Claude session" signs a guest in itself before it can mint a pair token.
  await page.locator('#btn-connect').click();
  await expect(page.locator('#entry-connect-view')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#home-choices')).toBeHidden();

  const urlField = page.locator('#connect-url');
  await expect.poll(async () => (await urlField.inputValue()).length, { timeout: 15_000 }).toBeGreaterThan(0);
  const pairUrl = await urlField.inputValue();
  const token = pairUrl.split('/').pop();
  expect(token).toBeTruthy();

  const res = await page.request.get(pairUrl, { headers: { accept: '*/*' } });
  expect(res.ok()).toBe(true);
  expect(res.headers()['content-type']).toContain('text/markdown');
  const body = await res.text();
  expect(body).toContain(token);

  await page.locator('#btn-entry-back').click();
  await expect(page.locator('#home-choices')).toBeVisible();
  await expect(page.locator('#entry-connect-view')).toBeHidden();

  // The connect sub-view keeps its own Login button so the player can continue into the game
  // without leaving the pairing flow first (spec 2.2). The guest minted for the pairing card owns
  // no character yet, so that Login lands on the naming form like every other first entry (SP7):
  // naming the character is what starts the client.
  await page.locator('#btn-connect').click();
  await expect(page.locator('#entry-connect-view')).toBeVisible();
  await page.locator('#btn-connect-login').click();
  await createFirstCharacter(page, uniqueName('cn_'));
});

test('a registered sign-up names its first character before the client starts', async ({ page }) => {
  // Every account with no character is held on #screen-characters until it picks a name --
  // guests included (SP7) -- and that name is what the client logs in as. What is particular to
  // a registered sign-up is the availability check running against the chosen name first.
  await openHome(page);
  const email = await signUp(page, 'Bob');
  // The identity strip updates from the linked/created credential before the characters gate takes over.
  await expect(page.locator('#entry-identity')).toHaveText(email);

  await expect(page.locator('#screen-characters')).toBeVisible({ timeout: 30_000 });
  const name = uniqueName('bob_');
  await page.locator('#char-name').fill(name);
  await expect(page.locator('#char-name-status')).toContainText(`${name} is available`, { timeout: 15_000 });
  await createFirstCharacter(page, name);
  await expect.poll(() => page.evaluate(() => window.idlescape?.client?.getState().loggedIn ?? false), { timeout: 90_000 }).toBe(true);
  const state = await clientState(page);
  expect(state.gameName).toBe(name);
});
