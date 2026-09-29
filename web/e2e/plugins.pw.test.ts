import { test, expect } from '@playwright/test';
import { loginAsGuest, openHome, scopedItem } from './helpers';

// The SP1 harness: open the home screen, "Play as guest" mints a character and starts the client.
// Persistence is verified via the settings store's localStorage write (what survives a reload)
// plus a panel close/reopen round-trip. We deliberately do NOT reload-then-relogin: the engine
// rejects an immediate re-login of the same guest with "already logged in" (code 5) until the
// prior session times out, which is expected RS behaviour and unrelated to plugin persistence.
test('a plugin toggle persists to storage and across a panel reopen', async ({ page }) => {
  await openHome(page);
  await loginAsGuest(page);

  const pluginsIcon = page.locator('[data-panel="plugins"]');
  await pluginsIcon.click();
  const lootToggle = page.locator('[data-toggle="loot"]');
  await expect(lootToggle).toBeChecked();          // loot is defaultEnabled
  await lootToggle.uncheck();
  await expect(lootToggle).not.toBeChecked();

  // The store writes localStorage synchronously: this is what a reload would load back. The key is
  // scoped to the signed-in uid (audit C10), so it is found by shape rather than by literal.
  await expect.poll(() => scopedItem(page, 'plugin', 'loot')).toContain('"enabled":false');
  // The pre-C10 bare key must not come back: a store that still wrote it would leak into the next
  // account on this browser.
  expect(await page.evaluate(() => localStorage.getItem('cs.plugin.loot'))).toBeNull();

  // Round-trip through the registry + store: close and reopen the panel, state must hold.
  await pluginsIcon.click(); // close
  await pluginsIcon.click(); // reopen
  await expect(page.locator('[data-toggle="loot"]')).not.toBeChecked();
});
