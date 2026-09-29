import { expect, test } from '@playwright/test';
import { openHome } from './helpers';

// Requires the engine, the front server serving web/dist, and a built wiki/build/wiki.db.
// Locally that database is built by scripts/build.ps1's step 1c, which scripts/verify.ps1 runs
// before it starts the stack; in the deployed stack it is built by server.Dockerfile's
// wiki-build stage and copied to /app/wiki/build/wiki.db.
test('home-card Wiki link opens the reader in a new tab and search finds the bronze axe', async ({ page, context }) => {
  await openHome(page);
  await expect(page.locator('#screen-home a.wiki-link')).toHaveAttribute('href', '/wiki');

  const [wiki] = await Promise.all([context.waitForEvent('page'), page.locator('#screen-home a.wiki-link').click()]);
  await wiki.waitForLoadState();
  expect(new URL(wiki.url()).pathname).toBe('/wiki');

  await wiki.getByLabel('Search').fill('bronze axe');
  await wiki.getByLabel('Search').press('Enter');
  await expect(wiki).toHaveURL(/\/wiki\/item\/bronze-axe$/);
  await expect(wiki.locator('article h1')).toHaveText('Bronze axe');
  await expect(wiki.getByRole('heading', { name: 'Sources', exact: true })).toBeVisible();

  const json = await wiki.request.get('/api/wiki/page/item/bronze-axe?format=json');
  expect(json.status()).toBe(200);
  expect((await json.json() as { slug: string }).slug).toBe('bronze-axe');
});
