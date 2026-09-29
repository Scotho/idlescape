// docs/design/capture-screenshots.pw.test.ts — the script that produced docs/design/screenshots/.
//
// It is kept HERE, outside web/e2e/, on purpose: `npm run verify` runs every spec under
// web/e2e/, and this one is a capture run, not an assertion suite — it would add a signup and
// ~30s to every verification. To re-shoot after a redesign:
//
//   1. bring the stack up:  npm run dev        (PowerShell, ~2 min; ports 8787/8899/9099/8080)
//   2. copy this file to    web/e2e/panel-shots.pw.test.ts
//   3. cd web && npx playwright test e2e/panel-shots.pw.test.ts
//   4. delete the copy
//
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import {
  MANAGEMENT, MANAGEMENT_SECRET, idTokenFor, managementContext, openHome, openPanel, readBank,
  signUpAndPlay, uniqueName
} from './helpers';

// It signs up a fresh account, plays into Tutorial Island, seeds a bank through the engine's
// loopback management port, and photographs the shell and every panel on the strip.

const OUT = '../docs/design/screenshots';  // relative to web/, which is playwright's cwd

const SEED = [
  { obj: 995, delta: 250_000 },   // coins
  { obj: 1038, delta: 1 },        // red partyhat
  { obj: 1163, delta: 1 },        // rune full helm
  { obj: 1618, delta: 12 },       // uncut diamond (noted)
  { obj: 1619, delta: 30 },       // uncut ruby (noted)
  ...Array.from({ length: 22 }, (_, i) => ({ obj: 1265 + i, delta: 1 + i }))
];

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

async function panelShot(page: Page, id: string, name: string): Promise<void> {
  await openPanel(page, id);
  // Off the strip, or the button's hover tooltip paints over the panel it is describing.
  await page.mouse.move(600, 860);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.locator('#side-panel').screenshot({ path: `${OUT}/${name}-panel.png` }).catch(() => {});
}

test('capture the shell and every panel', async ({ page }) => {
  test.setTimeout(600_000);
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });

  // The home screen, before anything is signed in.
  await openHome(page);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/00-home.png` });

  const name = uniqueName('shot');
  const email = await signUpAndPlay(page, name, name);

  // Seed the bank the way Contracts will, so the bank window has something to photograph.
  if (MANAGEMENT_SECRET !== '') {
    const idToken = await idTokenFor(email);
    const ownerKey = (await readBank(page, idToken)).ownerKey;
    const mgmt = await managementContext();
    try {
      const res = await mgmt.post(`${MANAGEMENT}/owner/${ownerKey}/bank/apply`, { data: { expectedVersion: 0, ops: SEED } });
      expect(res.status(), await res.text()).toBe(200);
    } finally {
      await mgmt.dispose();
    }
  }

  // Let the world paint before anything else.
  await page.waitForTimeout(3000);

  // 1. The frame with nothing open.
  const open = page.locator('#icon-strip [data-panel].active');
  if (await open.count()) await open.first().click();
  await shot(page, '01-frame-no-panel');

  // 2. Every panel on the strip, in strip order.
  await panelShot(page, 'xp', '02-xp-tracker');
  await panelShot(page, 'loot', '03-loot-tracker');
  await panelShot(page, 'tasks', '04-tasks');
  await panelShot(page, 'marketplace', '05-marketplace');
  await panelShot(page, 'connect', '07-claude');
  await panelShot(page, 'characters', '08-characters');
  await panelShot(page, 'account', '09-account');
  await panelShot(page, 'config', '10-configuration');
  await panelShot(page, 'plugins', '11-plugins');

  // The plugins panel with one settings form expanded.
  await page.locator('[data-gear="xp"]').click().catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/12-plugins-settings.png` });
  await page.locator('#side-panel').screenshot({ path: `${OUT}/12-plugins-settings-panel.png` }).catch(() => {});

  // 3. The bank: a centred window over the stage, not a side panel.
  await openPanel(page, 'bank');
  await expect(page.locator('#bank-window')).toBeVisible({ timeout: 20_000 });
  await page.mouse.move(600, 860);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/06-bank-window.png` });
  await page.locator('#bank-window').screenshot({ path: `${OUT}/06-bank-window-only.png` }).catch(() => {});

  // 4. Narrow layout: the panel drops below the canvas and the strip becomes a bottom tab bar.
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/13-narrow-1100.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });

  // 5. The styleguide page, which is the design system as it stands.
  await page.goto('/styleguide.html');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/14-styleguide.png`, fullPage: true });
});
