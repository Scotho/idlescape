import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';
import {
  MANAGEMENT, MANAGEMENT_SECRET, clientState, createCharacterFromPanel, idTokenFor, managementContext, openHome,
  pressTitleLogin, readBank, sessionStates, signUpAndPlay, uniqueName
} from './helpers';

// SP8 end to end: one bank per ACCOUNT, shared by every character of it, read through the front
// server and changed by the engine.
//
// The seeding and token helpers live in e2e/helpers.ts, shared with bank-ui.pw.test.ts.
//
// Requires: firebase emulators, engine (274) with ENGINE_MANAGEMENT_SECRET set, front server.
// See scripts/verify.ps1 and scripts/start-stack.ps1, which export the secret from server/.env
// into the engine process; playwright.config.ts reads the same file for this spec.
//
// COVERAGE BOUNDARY. Every bank read here is uid-keyed HTTP: the front server takes the uid from
// the caller's Firebase token and the engine looks the container up by that key, and neither
// consults which character is logged in. This spec therefore does NOT prove that the ENGINE bound
// a game socket to that account -- locally `node.production` is false, so `requireOwner` is false
// and an un-asserted login would still succeed, un-stamped, with every assertion below still
// passing. What proves the binding lives elsewhere and is deliberately not duplicated here:
//   - engine-custom/src/idlescape/shared.test.ts drives the real PlayerLoading.load under
//     requireOwner and pins the refusal, the acceptance, the stamped owner key and the socketless
//     login-server path;
//   - engine-custom/src/idlescape/ownerAssertion.vectors.json makes the front server's signer and
//     the engine's verifier agree on the wire format, checked from both sides.
// The one half of the binding this spec CAN see from a browser is asserted in step 8: the
// HttpOnly cs_owner cookie the front server minted names this account's uid against each
// character's own game name, and that cookie is what the relay promotes to X-Idlescape-Owner.
test('every character of one account shares one bank, and a web reorder is versioned', async ({ page }) => {
  test.skip(MANAGEMENT_SECRET === '', 'ENGINE_MANAGEMENT_SECRET is not configured for this stack');

  const first = uniqueName('bankone');
  const email = await signUpAndPlay(page, first, first);
  const idToken = await idTokenFor(email);

  // 1. The account's bank exists and is keyed by the Firebase uid, not by the character.
  const empty = await readBank(page, idToken);
  expect(empty).toMatchObject({ capacity: 240, version: 0, tabs: [], slots: [] });
  const ownerKey = empty.ownerKey;
  expect(ownerKey.length).toBeGreaterThan(0);

  const mgmt: APIRequestContext = await managementContext();
  try {
    // The loopback port is the economy seam, and it is not open to the world: no secret, no bank.
    const anon = await playwrightRequest.newContext();
    try {
      expect((await anon.get(`${MANAGEMENT}/owner/${ownerKey}/bank`)).status()).toBe(401);
    } finally {
      await anon.dispose();
    }

    // 2. Seed items the way Contracts will: an engine apply for an owner who IS online.
    const seeded = await mgmt.post(`${MANAGEMENT}/owner/${ownerKey}/bank/apply`, {
      data: { expectedVersion: 0, ops: [{ obj: 995, delta: 500 }, { obj: 1038, delta: 1 }] }
    });
    expect(seeded.status(), await seeded.text()).toBe(200);
    expect(await seeded.json()).toEqual({ ownerKey, version: 1 });

    const seen = await readBank(page, idToken);
    expect(seen.version).toBe(1);
    expect(seen.slots).toEqual([{ slot: 0, obj: 995, count: 500 }, { slot: 1, obj: 1038, count: 1 }]);

    // 3. A layout op from the browser is applied by the engine and bumps the version.
    const swap = await page.request.post('/api/bank/ops', {
      headers: { authorization: `Bearer ${idToken}` },
      data: { expectedVersion: seen.version, ops: [{ op: 'swap', a: 0, b: 1 }] }
    });
    expect(swap.status(), await swap.text()).toBe(200);
    const afterSwap = await readBank(page, idToken);
    expect(afterSwap.version).toBe(2);
    expect(afterSwap.slots).toEqual([{ slot: 0, obj: 1038, count: 1 }, { slot: 1, obj: 995, count: 500 }]);

    // 3b. The version an apply returns stays current: the tick that follows consumes the
    // apply's dirt without bumping (engine-custom/PATCHES.md). Two world ticks are 1.2 s, so a
    // second of quiet is enough to prove the sweep did not move it behind the caller's back.
    await page.waitForTimeout(1_500);
    expect((await readBank(page, idToken)).version).toBe(afterSwap.version);

    // 4. A stale version is refused with 409 and the engine's current version.
    const stale = await page.request.post('/api/bank/ops', {
      headers: { authorization: `Bearer ${idToken}` },
      data: { expectedVersion: seen.version, ops: [{ op: 'swap', a: 0, b: 1 }] }
    });
    expect(stale.status()).toBe(409);
    expect(await stale.json()).toEqual({ error: 'version', version: afterSwap.version });

    // ...and the client's answer to a 409 is to refetch at the version it was handed and
    // re-issue, which must then succeed.
    const refetched = await readBank(page, idToken);
    expect(refetched.version).toBe(afterSwap.version);
    const retried = await page.request.post('/api/bank/ops', {
      headers: { authorization: `Bearer ${idToken}` },
      data: { expectedVersion: refetched.version, ops: [{ op: 'swap', a: 0, b: 1 }] }
    });
    expect(retried.status(), await retried.text()).toBe(200);
    expect(await retried.json()).toEqual({ version: refetched.version + 1 });

    // 5. The browser may never change what the bank contains.
    const settled = await readBank(page, idToken);
    const cheat = await page.request.post('/api/bank/ops', {
      headers: { authorization: `Bearer ${idToken}` },
      data: { expectedVersion: settled.version, ops: [{ obj: 995, delta: 1_000_000 }] }
    });
    expect(cheat.status()).toBe(403);
    expect(await cheat.json()).toEqual({ error: 'layout_only' });
    expect((await readBank(page, idToken)).slots).toEqual(settled.slots);

    // 6. Adding and logging in a SECOND character of the account neither clobbers the store nor
    // re-keys it: the same owner key still answers, and it still holds the same slots. (This is
    // not a proof that the second login was bound to the account -- see the coverage boundary at
    // the top of this file.)
    const second = uniqueName('banktwo');
    await createCharacterFromPanel(page, second);
    await page.locator(`[data-char-row]:has-text("${second}") [data-char-open]`).click();
    await expect.poll(async () => (await sessionStates(page)).length, { timeout: 60_000 }).toBe(2);
    await expect.poll(async () => (await clientState(page)).loggedIn, { timeout: 30_000 }).toBe(false);
    await pressTitleLogin(page);
    // Polled on the SESSION's loggedIn, not on the facade's gameName: `getState().gameName` is
    // the client's `loginUser`, which is set when a login is armed and is therefore already the
    // second character's name while its login is still in flight. Waiting on gameName and then
    // asserting loggedIn is a race, and it is the one characters.pw.test.ts:44 loses.
    await expect.poll(async () => (await sessionStates(page)).filter(s => s.loggedIn).length, { timeout: 90_000 }).toBe(2);
    await expect.poll(async () => (await clientState(page)).gameName, { timeout: 30_000 }).toBe(second);

    const asSecond = await readBank(page, idToken);
    expect(asSecond.ownerKey).toBe(ownerKey);
    expect(asSecond.slots).toEqual(settled.slots);

    // 7. With both characters online, one apply is ONE version bump, not one per character, and
    // the snapshot the front server serves is byte for byte the one the engine holds.
    const both = await mgmt.post(`${MANAGEMENT}/owner/${ownerKey}/bank/apply`, {
      data: { expectedVersion: asSecond.version, ops: [{ obj: 1038, delta: 4 }] }
    });
    expect(both.status(), await both.text()).toBe(200);
    const shared = await readBank(page, idToken);
    expect(shared.version).toBe(asSecond.version + 1);
    expect(shared.slots.find(s => s.obj === 1038)?.count).toBe(5);

    const fromEngine = await mgmt.get(`${MANAGEMENT}/owner/${ownerKey}/bank`);
    expect(fromEngine.status()).toBe(200);
    expect(await fromEngine.json()).toEqual(shared);

    // 8. The half of the account-to-character binding a browser can see. The front server mints
    // `cs_owner` on the character session route and the relay promotes it to X-Idlescape-Owner on
    // the WebSocket upgrade, where the engine checks it against the name it decrypts out of the
    // login block. Here: the cookie is HttpOnly (so page script can never forge or read it), and
    // it carries one `<uid>.<character>.<exp>.<sig>` entry per character, each naming THIS
    // account's uid -- the same uid that keys the bank every assertion above read.
    const cookie = (await page.context().cookies()).find(c => c.name === 'cs_owner');
    expect(cookie, 'the front server minted no cs_owner cookie').toBeTruthy();
    expect(cookie!.httpOnly).toBe(true);
    const bound = cookie!.value.split('~').filter(Boolean).map(entry => entry.split('.'));
    expect(bound.every(parts => parts.length === 4 && parts[0] === ownerKey && parts[3].length > 0)).toBe(true);
    expect(bound.map(parts => parts[1]).sort()).toEqual([first, second].sort());
  } finally {
    await mgmt.dispose();
  }
});

test('a different account gets a different bank', async ({ page }) => {
  test.skip(MANAGEMENT_SECRET === '', 'ENGINE_MANAGEMENT_SECRET is not configured for this stack');
  const name = uniqueName('bankalt');
  const email = await signUpAndPlay(page, name, name);
  const bank = await readBank(page, await idTokenFor(email));
  expect(bank.slots).toEqual([]);
  expect(bank.version).toBe(0);
});

test('the bank routes are human-only and refuse an unauthenticated caller', async ({ page }) => {
  await openHome(page);
  // No bearer at all: the route family is behind an identity, not open to any visitor.
  expect((await page.request.get('/api/bank')).status()).toBe(401);
  expect((await page.request.post('/api/bank/ops', { data: { expectedVersion: 0, ops: [] } })).status()).toBe(401);

  // A real agent token, minted through the pairing exchange exactly as Claude Code would: SP8
  // is human-only end to end, so an agent bearer authenticates and is then refused.
  await expect.poll(() => page.locator('#btn-connect').isEnabled(), { timeout: 30_000 }).toBe(true);
  await page.locator('#btn-connect').click();
  await expect(page.locator('#entry-connect-view')).toBeVisible({ timeout: 30_000 });
  const urlField = page.locator('#connect-url');
  await expect.poll(async () => (await urlField.inputValue()).length, { timeout: 15_000 }).toBeGreaterThan(0);
  const pairToken = (await urlField.inputValue()).split('/').pop();
  const exchanged = await page.request.post(`/api/pair/${pairToken}/exchange`, { data: { label: 'e2e bank agent' } });
  expect(exchanged.status()).toBe(200);
  const agentToken = ((await exchanged.json()) as { agentToken: string }).agentToken;

  const auth = { authorization: `Bearer ${agentToken}` };
  const read = await page.request.get('/api/bank', { headers: auth });
  expect(read.status()).toBe(403);
  expect(await read.json()).toEqual({ error: 'human_only' });
});
