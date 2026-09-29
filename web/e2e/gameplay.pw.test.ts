import { expect, test } from '@playwright/test';
import {
  LOADING_BAR_RED, MINIMAP_CENTRE, VIEWPORT_CENTRE, canvasClick, canvasPixels, clientState, installRecorder, loginAsGuest, openHome, uniqueName, waitForMove
} from './helpers';

// Gameplay without Claude. A fresh guest goes home -> entry -> Login (the "Connect to Claude"
// button is never pressed, no pair token is minted) and then plays through real input on the
// canvas: public chat via the keyboard, walking via the minimap and the 3D viewport, and a
// logout through the hook API. Every action is verified through window.idlescape.client
// state and events, and outbound WebSocket frames prove packets left the client.
//
// Requires: firebase emulators, engine (274), front server serving web/dist. See scripts/verify.ps1.
// A fresh browser context gets a fresh anonymous user, so each test is a new character and the
// engine's "already logged in" (code 5) rule never bites.

test.describe('gameplay without Claude', () => {
  test('guest logs in unpaired, chats, walks, and logs out', async ({ page }) => {
    const sent: number[] = [];
    page.on('websocket', ws => ws.on('framesent', f => sent.push(f.payload.length)));

    await openHome(page);
    // A guest names their own character now (SP7), so the name the client plays as is the one
    // the spec typed into the pre-game form.
    const chosen = uniqueName('gp_');
    const gameName = await loginAsGuest(page, chosen);
    expect(gameName).toBe(chosen);
    await installRecorder(page);

    await test.step('the world is painted, not the loading screen', async () => {
      // Regression: login used to race the client's asset loader; prepareTitle() then nulled the
      // game draw areas and the viewport kept showing the "Preparing game engine" bar forever.
      await expect.poll(() => canvasPixels(page, [{ x: 300, y: 250 }]).then(p => p[0]), { timeout: 15_000 }).not.toBe(LOADING_BAR_RED);
      await expect.poll(() => canvasPixels(page, [MINIMAP_CENTRE]).then(p => p[0]), { timeout: 15_000 }).not.toBe('0,0,0');
    });

    await test.step('in game with no Claude session paired', async () => {
      await page.locator('[data-panel="connect"]').click();
      await expect(page.locator('#panel-title')).toHaveText('Claude');
      // Task 20 replaced the one-line "nothing paired" state with the mock's unpaired card
      // (map-design 3.14), whose heading is the same fact in the shape the design gives it.
      await expect(page.locator('#panel-body .connect-title')).toHaveText('Pair a Claude session');
      await page.locator('[data-panel="connect"]').click(); // strip icon toggles the panel closed
      await expect(page.locator('#side-panel')).toBeHidden();
    });

    await test.step('public chat via the keyboard', async () => {
      const before = sent.length;
      // Clicking the chat pane focuses the canvas (tabIndex -1) so key events reach the client.
      await canvasClick(page, 260, 480);
      await page.keyboard.type('hello from e2e');
      await page.keyboard.press('Enter');
      await expect.poll(() => page.evaluate(() => window.__e2e!.chat.length), { timeout: 10_000 }).toBeGreaterThan(0);
      const chat = await page.evaluate(() => window.__e2e!.chat);
      const mine = chat.find(c => c.kind === 'public' && /hello from e2e/i.test(c.text));
      expect(mine, `expected own public chat line, saw ${JSON.stringify(chat)}`).toBeTruthy();
      // Display names render underscores as spaces ("guest 3zkshw"); compare on the normalised form.
      const norm = (s: string): string => s.replace(/@cr\d@/g, '').toLowerCase().replace(/[\s_]+/g, '_');
      expect(norm(mine!.sender ?? '')).toBe(norm(gameName));
      await expect.poll(() => sent.length).toBeGreaterThan(before);
    });

    await test.step('walk via the minimap', async () => {
      const start = (await clientState(page)).position;
      let moved = false;
      // Try each compass direction: the tutorial start room walls off some of them.
      for (const [dx, dy] of [[28, 0], [0, 28], [-28, 0], [0, -28]] as const) {
        await canvasClick(page, MINIMAP_CENTRE.x + dx, MINIMAP_CENTRE.y + dy);
        moved = await waitForMove(page, start, 6_000);
        if (moved) break;
      }
      expect(moved, `player never left ${JSON.stringify(start)}`).toBe(true);
      const end = (await clientState(page)).position;
      expect(end.level).toBe(start.level);
    });

    await test.step('walk via the 3D viewport', async () => {
      const start = (await clientState(page)).position;
      const before = sent.length;
      let moved = false;
      for (const [dx, dy] of [[0, 70], [90, 40], [-90, 40], [0, -60]] as const) {
        await canvasClick(page, VIEWPORT_CENTRE.x + dx, VIEWPORT_CENTRE.y + dy);
        moved = await waitForMove(page, start, 6_000);
        if (moved) break;
      }
      expect(sent.length).toBeGreaterThan(before);
      expect(moved, `player never left ${JSON.stringify(start)}`).toBe(true);
    });

    await test.step('state is coherent and a screenshot is captured', async () => {
      const s = await clientState(page);
      expect(s.loggedIn).toBe(true);
      expect(s.hp.max).toBeGreaterThanOrEqual(10);
      expect(s.energy).toBeGreaterThanOrEqual(0);
      expect(s.activeTab).toBeGreaterThanOrEqual(0);
      expect(sent.length).toBeGreaterThan(10);
      await page.screenshot({ path: '../docs/screenshots/e2e-gameplay.png' });
    });

    await test.step('logout through the hook API', async () => {
      await page.evaluate(() => window.idlescape!.client!.logout());
      await expect.poll(async () => (await clientState(page)).loggedIn, { timeout: 15_000 }).toBe(false);
      await expect.poll(() => page.evaluate(() => window.__e2e!.events.includes('logout'))).toBe(true);
      await expect(page.locator('#overlays')).toContainText('logged out');
    });
  });
});
