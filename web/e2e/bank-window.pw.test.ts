import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  MANAGEMENT, MANAGEMENT_SECRET, idTokenFor, managementContext, openBankWindow, openPanel,
  readBank, signUpAndPlay, uniqueName
} from './helpers';

// SP8b end to end, split out of `bank-ui.pw.test.ts` by shell v2 Task 17 when that file reached
// the 400-line ceiling. This half is the window's CHROME: the panel's copy, the tab rail's nine
// tab limit, and the context menu's edge clamp, which is the one thing in the bank that only a
// real layout can settle (getBoundingClientRect is all-zero under jsdom, and stacking has no
// meaning without a paint). `bank-ui.pw.test.ts` keeps the grid, the drags and the data path.
//
// `apply` and `bankedPlayer` are duplicated from that file rather than lifted into `helpers.ts`,
// which is at 382 lines and would cross the ceiling with them.
//
// Requires: firebase emulators, engine (274) with ENGINE_MANAGEMENT_SECRET set, front server.

/** Sixteen non-noted items, enough to fill two full rows so column 8 holds a real cell. */
const SIXTEEN = Array.from({ length: 16 }, (_, i) => 1265 + i * 2);

/** Enough items that the pane overflows the window's max height at a 640px viewport, which is
 *  what puts a real, clickable cell down in the bottom right corner of the visible pane. */
const SIXTY_FOUR = Array.from({ length: 64 }, (_, i) => 1265 + i);

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
  try {
    await apply(mgmt, ownerKey, 0, ops);
  } catch (error) {
    await mgmt.dispose();
    throw error;
  }
  return { ownerKey, idToken, mgmt };
}

/**
 * Owner decision 1: the web bank never deposits. SP8b said so with two permanently disabled
 * buttons in the footer; the v2 footer does not draw them (map-design 3.6), so the panel's info
 * alert is the whole of it, and it is the alert this asserts.
 */
test('the bank panel says the web can never move items', async ({ page }) => {
  const name = uniqueName('bankcopy');
  await signUpAndPlay(page, name, name);
  await openPanel(page, 'bank');
  await expect(page.locator('#panel-body')).toContainText('Items only move in and out of the bank in game. One bank per account, shared by every character.');
  await expect(page.locator('#panel-body .alert-info')).toHaveCount(1);
  // The window it is a handle for is the shared family's, warm and centred (D22).
  await expect(page.locator('#bank-window')).toHaveClass('window window-warm window-centred bank-window');
  await expect(page.locator('#bank-window .window-title')).toHaveText('Bank of Gielinor');
});

/**
 * Two things jsdom cannot see at all. The clamp reads getBoundingClientRect, which is all-zero
 * under jsdom, so every clamp test there had to stub rects; and stacking has no meaning without
 * a paint. `#bank-host` sits beside the side strip with a nonzero left edge, so the clamp has to
 * work in viewport space rather than in the host's own 0-based box.
 */
test('the context menu stays inside the host and paints above the window', async ({ page }) => {
  test.skip(MANAGEMENT_SECRET === '', 'ENGINE_MANAGEMENT_SECRET is not configured for this stack');
  test.setTimeout(240_000);

  const { mgmt } = await bankedPlayer(page, 'bankedge', SIXTY_FOUR.map(obj => ({ obj, delta: 1 })));
  try {
    // A narrow viewport pushes the window's edges up against the host's, so a right-click in the
    // bottom right corner of the pane asks for a menu that would hang off both. 640 rather than
    // 760: `.bank-window` is min(470px, 100% - 28px), so it stops shrinking once the host is
    // about 498px wide while the host itself keeps going, and every pixel of that gap is margin
    // for the non-vacuity guards below. Measured at 640: the host is the full 640 (the frame
    // wraps the side panel under the canvas below 1100), the window is 470 at left 85, and the
    // click point clears the host's right edge by about 60px with `.bank-menu`'s 160px
    // min-width, while the clamped menu still overhangs the window by about 85px.
    await page.setViewportSize({ width: 640, height: 640 });
    await openBankWindow(page);
    await expect(page.locator('#bank-capacity')).toHaveText('64 / 240');

    // The click point is derived from the layout rather than from a fixed cell inset: the
    // deepest cell whose row is visible in the (scrolling) pane, two pixels inside its bottom
    // right corner and never past the pane's own edge.
    const target = await page.evaluate(() => {
      const pane = document.querySelector('.bank-pane')!.getBoundingClientRect();
      let best: { el: Element; rect: DOMRect } | null = null;
      for (const el of document.querySelectorAll('#bank-window [data-bank-slot]')) {
        const rect = el.getBoundingClientRect();
        if (rect.top < pane.top - 1 || rect.top > pane.bottom - 8) continue;
        if (!best || rect.bottom > best.rect.bottom || (rect.bottom === best.rect.bottom && rect.right > best.rect.right)) best = { el, rect };
      }
      if (!best) return null;
      return {
        x: best.rect.right - 3,
        y: Math.min(best.rect.bottom, pane.bottom) - 3,
        hasItem: best.el.hasAttribute('data-bank-obj')
      };
    });
    expect(target, 'no visible cell in the pane').not.toBeNull();
    expect(target!.hasItem, 'the deepest visible cell must hold a real item, or no menu opens').toBe(true);
    await page.mouse.click(target!.x, target!.y, { button: 'right' });
    await expect(page.locator('#bank-menu')).toBeVisible();

    const geometry = await page.evaluate(() => {
      const host = document.getElementById('bank-host')!.getBoundingClientRect();
      const menu = document.getElementById('bank-menu')!.getBoundingClientRect();
      const window_ = document.getElementById('bank-window')!.getBoundingClientRect();
      return {
        host: { left: host.left, right: host.right, top: host.top, bottom: host.bottom, width: host.width, height: host.height },
        menu: { left: menu.left, right: menu.right, top: menu.top, bottom: menu.bottom, width: menu.width, height: menu.height },
        window: { right: window_.right },
        viewport: { width: innerWidth, height: innerHeight }
      };
    });

    // The click really did ask for a menu that would have overflowed the host on BOTH axes, so
    // neither clamp below is vacuous. Roughly 80px of margin across and 25px down.
    expect(target!.x + geometry.menu.width).toBeGreaterThan(geometry.host.right);
    expect(target!.y + geometry.menu.height).toBeGreaterThan(geometry.host.bottom);
    // ...and it overflowed neither the host nor the viewport.
    expect(geometry.menu.right).toBeLessThanOrEqual(geometry.host.right + 1);
    expect(geometry.menu.bottom).toBeLessThanOrEqual(geometry.host.bottom + 1);
    expect(geometry.menu.left).toBeGreaterThanOrEqual(geometry.host.left - 1);
    expect(geometry.menu.top).toBeGreaterThanOrEqual(geometry.host.top - 1);
    expect(geometry.menu.right).toBeLessThanOrEqual(geometry.viewport.width);
    expect(geometry.menu.bottom).toBeLessThanOrEqual(geometry.viewport.height);

    // The host is NOT at the viewport origin, and this is the assertion that says so. #bank-host
    // starts 51px down, under the shell's two chrome bars, so an implementation that clamped
    // into [0, hostRect.height] rather than [hostRect.top, hostRect.top + hostRect.height] would
    // park the menu 51px higher than this. That is the mistake the clamp was written with and
    // later fixed, and it is unfalsifiable under jsdom, where every rect is zero.
    expect(geometry.host.top).toBeGreaterThan(0);
    expect(geometry.menu.top).toBeGreaterThan(geometry.host.height - geometry.menu.height);
    // ...while still overhanging the window itself, which is the arrangement the stacking check
    // below is about: a menu that fitted inside the window would prove nothing about painting.
    expect(geometry.menu.right).toBeGreaterThan(geometry.window.right);

    // Stacking. `.bank-host` is the positioned ancestor and carries the z-index (Task 14), so the
    // menu and the window are siblings inside one stacking context; the menu must still win. Read
    // through hit testing rather than through computed styles: what a player can click is the
    // only thing that matters, and it is exactly what a unit test cannot see.
    const overlap = await page.evaluate(() => {
      const menu = document.getElementById('bank-menu')!.getBoundingClientRect();
      const point = { x: menu.left + menu.width / 2, y: menu.top + menu.height / 2 };
      const hit = document.elementFromPoint(point.x, point.y);
      return { insideMenu: hit?.closest('#bank-menu') !== null && hit !== null, tag: hit?.tagName ?? null };
    });
    expect(overlap.insideMenu, `the window is painting over the menu (hit ${overlap.tag})`).toBe(true);
    // The whole viewport, not just the window: the point is that the menu overhangs the window
    // and is still fully on screen.
    await page.screenshot({ path: 'test-results/bank-menu-over-window.png' });
  } finally {
    await mgmt.dispose();
  }
});

/**
 * The NO_ROOM branch in view.ts's onDropOnTab. Task 12's unit test reaches it through a detached
 * node; the claim to check here is whether the real "the strip shrank under the pointer" race is
 * reachable from a browser at all. It is not: the plus tab is simply not rendered at nine tabs,
 * and the menu drops its "Move to new tab" row at the same time, so neither path can ask for a
 * tenth. The guard is belt and braces, exactly as its comment says.
 */
test('the tab strip and the item menu both stop at nine tabs', async ({ page }) => {
  test.skip(MANAGEMENT_SECRET === '', 'ENGINE_MANAGEMENT_SECRET is not configured for this stack');
  test.setTimeout(240_000);

  const { idToken, mgmt } = await bankedPlayer(page, 'banktabs', SIXTEEN.slice(0, 10).map(obj => ({ obj, delta: 1 })));
  try {
    // Nine tabs, one item each, built through the same layout route the window uses.
    for (let tab = 1; tab <= 9; tab++) {
      const version = (await readBank(page, idToken)).version;
      const res = await page.request.post('/api/bank/ops', {
        headers: { authorization: `Bearer ${idToken}` },
        data: { expectedVersion: version, ops: [{ op: 'moveToTab', slot: 9, tab }] }
      });
      expect(res.status(), await res.text()).toBe(200);
    }
    expect((await readBank(page, idToken)).tabs).toHaveLength(9);

    await openBankWindow(page);
    await expect(page.locator('#bank-window [data-bank-tab="9"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#bank-window [data-bank-tab-new]')).toHaveCount(0);

    // The tenth tab has no entry point: no plus tab to drop on, and no "Move to new tab" row.
    await page.locator('#bank-window [data-bank-slot="9"]').click({ button: 'right' });
    await expect(page.locator('#bank-menu')).toBeVisible();
    await expect(page.locator('[data-bank-menu-entry="move-to-new-tab"]')).toHaveCount(0);
    await expect(page.locator('[data-bank-menu-entry="move-to-tab-9"]')).toHaveCount(1);
  } finally {
    await mgmt.dispose();
  }
});

/**
 * The one thing about this window jsdom cannot adjudicate: its layout. map-design 3.6 draws the
 * slot as `aspect-ratio: 4/3` in a `repeat(8, 1fr)` grid, and shipped as written that lays every
 * row on top of the one below it: a cell in an `auto` grid row contributes its CONTENT height to
 * the track, so Chromium sized the rows off the name tile's single line (22.7px) and then drew
 * each 35.8px cell overlapping its neighbour. A `1fr` column has the matching hazard on the other
 * axis, growing past its share to fit a long name. Both are stated in `layout/bank.css` and
 * neither is visible to a test with no layout engine, so they are pinned here.
 */
test('the window is 470px wide, eight columns across, with rows that do not overlap', async ({ page }) => {
  test.skip(MANAGEMENT_SECRET === '', 'ENGINE_MANAGEMENT_SECRET is not configured for this stack');
  test.setTimeout(240_000);

  const { mgmt } = await bankedPlayer(page, 'bankgrid', SIXTY_FOUR.map(obj => ({ obj, delta: 1 })));
  try {
    // Enough items, in a short enough viewport, that the pane has to SCROLL. That is the
    // condition: with a pane taller than its rows the mock's `aspect-ratio` lays out correctly,
    // and it is only once the tracks have to fit a definite, smaller box that they collapse onto
    // the name tile's line height and the cells start overlapping. A version of this case seeded
    // with sixteen items at the default viewport passes against the broken CSS.
    await page.setViewportSize({ width: 640, height: 640 });
    await openBankWindow(page);
    await expect(page.locator('#bank-capacity')).toHaveText('64 / 240');
    const geometry = await page.evaluate(() => {
      const win = document.getElementById('bank-window')!.getBoundingClientRect();
      const cells = Array.from(document.querySelectorAll('#bank-window [data-bank-slot]'), el => el.getBoundingClientRect());
      const top = Math.round(cells[0].top);
      const firstRow = cells.filter(r => Math.round(r.top) === top);
      const secondRow = cells.filter(r => Math.round(r.top) > top);
      const widths = new Set(firstRow.map(r => Math.round(r.width)));
      return {
        windowWidth: Math.round(win.width),
        perRow: firstRow.length,
        cellHeight: Math.round(cells[0].height),
        distinctWidths: widths.size,
        rowGap: Math.round(secondRow[0].top - cells[0].bottom)
      };
    });
    // The mock's 470, and the eight columns OSRS has.
    expect(geometry.windowWidth).toBe(470);
    expect(geometry.perRow).toBe(8);
    // Every column the same width: a name tile may not widen the one it is in.
    expect(geometry.distinctWidths).toBe(1);
    // 36px is the mock's 4:3 at the design width, and the row must be at least that tall.
    expect(geometry.cellHeight).toBe(36);
    expect(geometry.rowGap, 'the rows overlap: a cell is taller than its grid track').toBe(3);
  } finally {
    await mgmt.dispose();
  }
});
