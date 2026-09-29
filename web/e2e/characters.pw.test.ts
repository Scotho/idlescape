import { expect, test } from '@playwright/test';
import {
  SIGNUP_PASSWORD, clientState, createFirstCharacter, openHome, openPanel, pressTitleLogin, sessionStates, signUp, uniqueName
} from './helpers';

// SP6 character management end to end: the naming gate, the Account panel's create form and
// its limit (a guest gets two characters, a registered account three), a live switch between two
// characters of the same account, and the guarded delete.
// Requires: firebase emulators, engine, front server (serving web/dist) all running.

test('a registered user creates three characters, is refused a fourth, switches, and deletes with the phrase', async ({ page }) => {
  // `gameNames/{name}` is never released by a soft delete, so every name is run-unique.
  const [one, two, three] = [uniqueName('t1_'), uniqueName('t2_'), uniqueName('t3_')];

  await openHome(page);
  await signUp(page, 'Trio');
  await createFirstCharacter(page, one);
  await expect.poll(() => page.evaluate(() => window.idlescape?.client?.getState().loggedIn ?? false), { timeout: 90_000 }).toBe(true);

  await test.step('the panel creates up to the registered limit of three', async () => {
    await openPanel(page, 'account');
    await expect(page.locator('#panel-title')).toHaveText('Account');
    await expect(page.locator(`[data-char-row]:has-text("${one}")`)).toBeVisible();
    for (const n of [two, three]) {
      await page.locator('#char-panel-name').fill(n);
      await page.locator('#char-panel-create button[type="submit"]').click();
      await expect(page.locator(`[data-char-row]:has-text("${n}")`)).toBeVisible({ timeout: 15_000 });
    }
    // A fourth is not refused with an error: the form is not offered at all.
    await expect(page.locator('#char-panel-create')).toHaveCount(0);
    await expect(page.locator('#panel-body')).toContainText('Character limit reached');
  });

  await test.step('switching tabs keeps the first character online', async () => {
    // Opened from the Account panel, which is still on screen from the step above: that is
    // the panel's own path onto the stage, and the tab-strip path has its own spec (tabs.pw).
    await page.locator(`[data-char-row]:has-text("${two}") [data-char-open]`).click();
    // The new frame is appended before it takes the stage; wait for both, or the Login press
    // below would land on the first character's canvas instead of the second's title screen.
    await expect.poll(async () => (await sessionStates(page)).length, { timeout: 60_000 }).toBe(2);
    await expect.poll(async () => (await clientState(page)).loggedIn, { timeout: 30_000 }).toBe(false);
    await pressTitleLogin(page);
    // The wait is on the SESSION's loggedIn, not on the facade's gameName: `getState().gameName`
    // is the client's `loginUser`, which is set when a login is armed, so it is already `two`
    // while that login is still in flight. Waiting on gameName and then asserting loggedIn was a
    // race, and it lost roughly one run in three.
    await expect.poll(async () => (await sessionStates(page)).filter(s => s.loggedIn).length, { timeout: 90_000 }).toBe(2);
    await expect.poll(async () => (await clientState(page)).gameName, { timeout: 30_000 }).toBe(two);
  });

  await test.step('deleting needs the exact phrase and the account password', async () => {
    // `startSession` restores the panel after a switch; openPanel must not toggle it shut.
    await openPanel(page, 'account');
    await expect(page.locator('[data-char-row]')).toHaveCount(3, { timeout: 15_000 });
    await page.locator('[data-char-delete]').last().click();
    await expect(page.locator('#char-del-confirm')).toBeDisabled();
    await page.locator('#char-del-phrase').fill(`delete ${three}`);
    await expect(page.locator('#char-del-confirm')).toBeEnabled();
    await page.locator('#char-del-password').fill(SIGNUP_PASSWORD);
    await page.locator('#char-del-confirm').click();
    await expect(page.locator(`[data-char-row]:has-text("${three}")`)).toHaveCount(0, { timeout: 15_000 });
    // The strip follows the listing: a deleted character loses its tab too.
    await expect(page.locator(`#character-tabs [data-char-tab]:has-text("${three}")`)).toHaveCount(0);
    // Back under the limit, so the create form returns.
    await expect(page.locator('#char-panel-create')).toBeVisible();
  });
});

test('an agent bearer cannot call the character routes', async ({ page }) => {
  // A *real* agent token, minted through the pairing exchange exactly as Claude Code would.
  // Asserting only the unknown-token 401 would prove nothing: any unauthenticated call answers 401
  // too, so the whole route family could vanish and the test would still pass.
  await openHome(page);
  await expect.poll(() => page.locator('#btn-connect').isEnabled(), { timeout: 30_000 }).toBe(true);
  await page.locator('#btn-connect').click();
  await expect(page.locator('#entry-connect-view')).toBeVisible({ timeout: 30_000 });
  const urlField = page.locator('#connect-url');
  await expect.poll(async () => (await urlField.inputValue()).length, { timeout: 15_000 }).toBeGreaterThan(0);
  const pairToken = (await urlField.inputValue()).split('/').pop();
  expect(pairToken).toBeTruthy();

  // The exchange needs no browser session (Claude's fetch carries none) and hands back the
  // one-shot `csa_` secret.
  const exchanged = await page.request.post(`/api/pair/${pairToken}/exchange`, { data: { label: 'e2e agent' } });
  expect(exchanged.status()).toBe(200);
  const agentToken = ((await exchanged.json()) as { agentToken: string }).agentToken;
  expect(agentToken).toMatch(/^csa_[A-Za-z0-9_-]{40}$/);

  const auth = { authorization: `Bearer ${agentToken}` };
  const list = await page.request.get('/api/characters', { headers: auth });
  expect(list.status()).toBe(403);
  expect(await list.json()).toEqual({ error: 'human_only' });
  const del = await page.request.delete('/api/characters/' + 'a'.repeat(20), { headers: auth, data: { confirm: 'delete a' } });
  expect(del.status()).toBe(403);
  expect(await del.json()).toEqual({ error: 'human_only' });

  // An unknown agent token authenticates to nothing at all, so it never reaches the
  // human/agent split: 401, not 403.
  const unknown = { authorization: 'Bearer csa_' + 'x'.repeat(40) };
  expect((await page.request.get('/api/characters', { headers: unknown })).status()).toBe(401);
  expect((await page.request.delete('/api/characters/' + 'a'.repeat(20), { headers: unknown, data: { confirm: 'delete a' } })).status()).toBe(401);
});
