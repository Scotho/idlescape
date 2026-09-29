import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  MANAGEMENT, MANAGEMENT_SECRET, bankObjOrder, dragBankSlot, idTokenFor, managementContext,
  openBankWindow, readBank, signUpAndPlay, uniqueName
} from './helpers';

// SP8b end to end: the bank WINDOW's grid, its drags and its data path. The wire contract is
// bank.pw.test.ts's job; this spec is about what a player can see and do. Items are seeded
// through the loopback management port, standing in for the Contracts service that will do it
// for real in SP9, because the browser is only ever allowed to re-order (POST /api/bank/ops
// answers 403 layout_only to anything else).
//
// This is the first time the bank runs outside jsdom, so it also pins what jsdom is structurally
// incapable of seeing: real pointer plumbing, since document.elementFromPoint does not exist
// there. The chrome half -- the panel copy, the tab rail's nine-tab limit and the context menu's
// edge clamp -- is bank-window.pw.test.ts, split out by shell v2 Task 17.
//
// Requires: firebase emulators, engine (274) with ENGINE_MANAGEMENT_SECRET set, front server.

const COINS = 995;
const PARTYHAT = 1038;
/** 1618 is cert_uncut_diamond, a NOTE: `toCertificate()` copies the linked item's cost, so it
 *  is the most valuable of the four and it is named "Uncut diamond". */
const DIAMOND = 1618;
const RUBY = 1619;
const RUNE_HELM = 1163;

async function apply(mgmt: APIRequestContext, ownerKey: string, expectedVersion: number, ops: { obj: number; delta: number }[]): Promise<void> {
  const res = await mgmt.post(`${MANAGEMENT}/owner/${ownerKey}/bank/apply`, { data: { expectedVersion, ops } });
  expect(res.status(), await res.text()).toBe(200);
}

/** Signs up, plays, and seeds the bank. Returns the owner key, the id token and the context. */
async function bankedPlayer(page: Page, prefix: string, ops: { obj: number; delta: number }[]): Promise<{ ownerKey: string; idToken: string; mgmt: APIRequestContext }> {
  const name = uniqueName(prefix);
  const email = await signUpAndPlay(page, name, name);
  const idToken = await idTokenFor(email);
  const ownerKey = (await readBank(page, idToken)).ownerKey;
  const mgmt = await managementContext();
  // Disposed here rather than left to the caller's finally: the caller's try does not start
  // until this returns, so a seeding failure would otherwise leak the context on the way out.
  try {
    await apply(mgmt, ownerKey, 0, ops);
  } catch (error) {
    await mgmt.dispose();
    throw error;
  }
  return { ownerKey, idToken, mgmt };
}

/** Presses and drags past the threshold WITHOUT releasing, so the gesture is still live. */
async function startDrag(page: Page, from: number, to: number): Promise<void> {
  const source = page.locator(`#bank-window [data-bank-slot="${from}"]`);
  const target = page.locator(`#bank-window [data-bank-slot="${to}"]`);
  const box = await target.boundingBox();
  if (!box) throw new Error(`bank slot ${to} has no box`);
  await source.hover();
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await expect(page.locator('#bank-window .bank-pane.is-dragging')).toHaveCount(1);
}

test('the bank window shows, re-orders, tabs, sorts, searches and follows the world', async ({ page }) => {
  test.skip(MANAGEMENT_SECRET === '', 'ENGINE_MANAGEMENT_SECRET is not configured for this stack');
  test.setTimeout(240_000);

  const { ownerKey, idToken, mgmt } = await bankedPlayer(page, 'bankui', [
    { obj: COINS, delta: 500 }, { obj: PARTYHAT, delta: 1 }, { obj: DIAMOND, delta: 1 }, { obj: RUBY, delta: 1 }
  ]);
  try {
    // 1. The window opens from the strip and reads the account's bank.
    await openBankWindow(page);
    await expect(page.locator('#bank-window')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('#bank-window')).toHaveAttribute('aria-label', 'Bank of Gielinor');
    await expect(page.locator('#bank-capacity')).toHaveText('4 / 240');
    expect((await bankObjOrder(page)).slice(0, 4)).toEqual([COINS, PARTYHAT, DIAMOND, RUBY]);

    // 2. Eight columns, exactly as OSRS.
    await expect(page.locator('#bank-window [role="row"]').first().locator('[role="gridcell"]')).toHaveCount(8);

    // 3. Item art really does come from the running client (patch 28 -> icons.ts). A model that
    // OnDemand has not streamed yet falls back to a name tile, so this polls rather than asserts.
    await expect.poll(() => page.locator('#bank-window img.bank-icon').count(), { timeout: 60_000 }).toBeGreaterThan(0);

    // 4. Drag to swap. The engine applies it; the version moves; the DOM and the API agree.
    await dragBankSlot(page, 0, 2);
    await expect.poll(async () => (await readBank(page, idToken)).slots[0]?.obj, { timeout: 20_000 }).toBe(DIAMOND);
    await expect.poll(async () => (await bankObjOrder(page)).slice(0, 4), { timeout: 20_000 }).toEqual([DIAMOND, PARTYHAT, COINS, RUBY]);

    // 5. A SECOND drag straight after the first must also land. This is the post-apply version
    // contract: the version the apply returned is immediately reusable, so the store does not
    // 409 against itself on every other move.
    const afterFirst = (await readBank(page, idToken)).version;
    await dragBankSlot(page, 1, 3);
    await expect.poll(async () => (await readBank(page, idToken)).version, { timeout: 20_000 }).toBeGreaterThan(afterFirst);
    await expect.poll(async () => (await bankObjOrder(page)).slice(0, 4), { timeout: 20_000 }).toEqual([DIAMOND, RUBY, COINS, PARTYHAT]);

    // 6. The right-click menu carries the Contracts entry points, disabled until SP9.
    await page.locator('#bank-window [data-bank-slot="0"]').click({ button: 'right' });
    await expect(page.locator('#bank-menu')).toBeVisible();
    const sell = page.locator('[data-bank-menu-entry="sell"]');
    await expect(sell).toHaveAttribute('aria-disabled', 'true');
    await expect(sell).toContainText('Contracts coming soon');
    await expect(page.locator('[data-bank-menu-entry="buy"]')).toHaveAttribute('aria-disabled', 'true');

    // 7. A tab is created from the menu; its icon is the item that made it (owner decision 4).
    await page.locator('[data-bank-menu-entry="move-to-new-tab"]').click();
    await expect(page.locator('#bank-window [data-bank-tab="1"]')).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await readBank(page, idToken)).tabs, { timeout: 20_000 }).toEqual([1]);
    await expect(page.locator('[data-bank-tab="1"]')).toHaveAttribute('aria-label', 'Tab 1, 1 item');

    // 8. Sorting is a web-only helper (owner decision 3) that the ENGINE performs. High Alchemy
    // values from the pack: 1618 costs 200 (the note copies uncut diamond's cost) so it alchs
    // for 120, 1619 costs 100 so it alchs for 60, and 995 and 1038 declare no cost at all so
    // both alch for the floor of 1. The tie between those two keeps its pre-sort order. The
    // diamond is in tab 1 by now, so the main area is everything from slot 1 on.
    //
    // THE DRAG FIRST IS LOAD-BEARING. Step 5 left the main area already value-descending, and
    // step 7's moveToTab of slot 0 into the first tab moves nothing (ops.ts computes dest 0 and
    // moveWithin(items, 0, 0) is inert), so sorting here would be a genuine no-op: ownerBank.ts
    // reports changed: false, burns no version, and a "Sort by value" row that was never wired
    // to the store would sail through. One swap puts the coins in front of the ruby, the
    // pre-sort order is asserted, and the sort then has real work and must move the version.
    await dragBankSlot(page, 1, 2);
    await expect.poll(async () => (await readBank(page, idToken)).slots.filter(s => s.slot >= 1).map(s => s.obj), { timeout: 20_000 })
      .toEqual([COINS, RUBY, PARTYHAT]);
    const beforeSort = (await readBank(page, idToken)).version;

    await page.locator('#bank-window [data-bank-tab="0"]').click({ button: 'right' });
    await page.locator('[data-bank-menu-entry="sort-value"]').click();
    await expect.poll(async () => (await readBank(page, idToken)).slots.filter(s => s.slot >= 1).map(s => s.obj), { timeout: 20_000 })
      .toEqual([RUBY, COINS, PARTYHAT]);
    // A sort that changed nothing burns no version, so this cannot be satisfied by a no-op.
    await expect.poll(async () => (await readBank(page, idToken)).version, { timeout: 20_000 }).toBeGreaterThan(beforeSort);

    // 9. Search dims what does not match. The box is always in the footer now (map-design 3.6);
    // there is no magnifier to open it with, so clearing it is what undims the pane.
    await page.locator('#bank-search').fill('coins');
    await expect(page.locator(`#bank-window [data-bank-obj="${COINS}"]`)).not.toHaveClass(/dim/);
    await expect(page.locator(`#bank-window [data-bank-obj="${PARTYHAT}"]`)).toHaveClass(/dim/);
    await page.locator('#bank-search').fill('');

    // 9b. The window is on the LIVE path, not merely the polling one. `#bank-live` is the only
    // observable difference between the two, and step 10's deliberately generous budget below is
    // satisfied by polling alone, so without this assertion the engine's /internal/bank-changed
    // hook and the front server's whole SSE fan-out could break with the suite still green.
    await expect.poll(async () => (await page.locator('#bank-live').textContent()) ?? '', { timeout: 45_000 }).toBe('live');

    // 10. A change made OUTSIDE the browser reaches the open window without a reload. The engine
    // posts /internal/bank-changed and the front server fans it out; polling covers the case
    // where the hook is not delivered at all, so this is generous rather than tight.
    const before = await readBank(page, idToken);
    await apply(mgmt, ownerKey, before.version, [{ obj: RUNE_HELM, delta: 1 }]);
    await expect(page.locator('#bank-capacity')).toHaveText('5 / 240', { timeout: 20_000 });
    await expect(page.locator(`#bank-window [data-bank-obj="${RUNE_HELM}"]`)).toHaveCount(1);

    // 11. The same reordering from the keyboard, with a spoken line for a screen reader.
    // The exact order is knowable, so it is asserted: ArrowRight steps to the adjacent visible
    // slot and the default rearrange mode is swap, so this is precisely a swap of slots 0 and 1.
    expect((await bankObjOrder(page)).slice(0, 5)).toEqual([DIAMOND, RUBY, COINS, PARTYHAT, RUNE_HELM]);
    await page.locator('#bank-window [data-bank-slot="0"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#bank-status')).toContainText('Picked up');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(page.locator('#bank-status')).toContainText('Moved');
    await expect.poll(async () => (await bankObjOrder(page)).slice(0, 5), { timeout: 20_000 })
      .toEqual([RUBY, DIAMOND, COINS, PARTYHAT, RUNE_HELM]);

    // 12. Escape closes the window and the panel with it.
    await page.keyboard.press('Escape');
    await expect(page.locator('#bank-window')).toBeHidden();
    await expect(page.locator('#side-panel')).toBeHidden();
  } finally {
    await mgmt.dispose();
  }
});

/**
 * The known limitation the unit tests could not settle. A real mouse press does not preventDefault
 * (gridInput says so, on purpose, so the press still focuses the cell and still produces a click),
 * so the cell takes focus and Escape reaches the pane's own keydown: the drag is cancelled, the
 * Escape is spent, and the window stays. Put the focus somewhere else -- the search box, a tab --
 * and the pane never sees the key, so the window's root listener closes it instead. Closing
 * cancels the gesture on the way out (releaseSession calls input.cancel), so the second case is
 * benign rather than broken, but it is NOT the two-Escape contract.
 */
test('Escape during a live drag is focus dependent', async ({ page }) => {
  test.skip(MANAGEMENT_SECRET === '', 'ENGINE_MANAGEMENT_SECRET is not configured for this stack');
  test.setTimeout(240_000);

  const { mgmt } = await bankedPlayer(page, 'bankesc', [{ obj: COINS, delta: 500 }, { obj: PARTYHAT, delta: 1 }, { obj: RUBY, delta: 1 }]);
  try {
    await openBankWindow(page);

    // A. Focus in the pane, which is where a mouse drag puts it. First Escape cancels.
    await startDrag(page, 0, 2);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-bank-slot'))).toBe('0');
    await page.keyboard.press('Escape');
    await expect(page.locator('#bank-status')).toContainText('Move cancelled.');
    await expect(page.locator('#bank-window .bank-pane.is-dragging')).toHaveCount(0);
    await expect(page.locator('#bank-window')).toBeVisible();
    await page.mouse.up();
    // ...and the second Escape closes the window, the layout untouched by the cancelled drag.
    await expect.poll(async () => (await bankObjOrder(page)).slice(0, 3)).toEqual([COINS, PARTYHAT, RUBY]);
    await page.keyboard.press('Escape');
    await expect(page.locator('#bank-window')).toBeHidden();

    // B. Focus in the search box. The pane never sees the key, so the FIRST Escape closes the
    // window; the gesture dies with it rather than being cancelled in place.
    await openBankWindow(page);
    await page.locator('#bank-search').fill('co');
    await startDrag(page, 0, 2);
    await page.locator('#bank-search').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#bank-window')).toBeHidden();
    await expect(page.locator('#side-panel')).toBeHidden();
    await page.mouse.up();
    // The release after the close reports nothing: the layout is exactly as it was seeded.
    await openBankWindow(page);
    await expect.poll(async () => (await bankObjOrder(page)).slice(0, 3)).toEqual([COINS, PARTYHAT, RUBY]);
  } finally {
    await mgmt.dispose();
  }
});
