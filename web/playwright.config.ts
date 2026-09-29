import { readFileSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

/**
 * `e2e/bank.pw.test.ts` seeds items through the engine's loopback management port, which is
 * authenticated by ENGINE_MANAGEMENT_SECRET -- the same value scripts/start-stack.ps1 exports
 * from server/.env into the engine process. Reading that one file here means `npx playwright
 * test` needs no shell ceremony and the two halves can never be given different values by
 * hand. A real environment variable still wins, and a missing or unreadable file simply leaves
 * the variable unset, which makes the bank spec skip rather than fail.
 */
function loadSecretsFromServerEnv(): void {
  let text: string;
  try {
    text = readFileSync(new URL('../server/.env', import.meta.url), 'utf8');
  } catch {
    return;
  }
  for (const key of ['ENGINE_MANAGEMENT_SECRET', 'OWNER_ASSERTION_SECRET']) {
    if (process.env[key]) continue;
    const line = text.split(/\r?\n/).find(l => l.startsWith(`${key}=`));
    const value = line?.slice(key.length + 1).trim().replace(/^["']|["']$/g, '');
    if (value) process.env[key] = value;
  }
}

loadSecretsFromServerEnv();

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  workers: 1,
  // Spec decision 9: one retry. The script specs drive a live world, so a lost tick or a
  // shoal that swam off is a flake worth one more go; a second failure is a real finding.
  retries: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8787',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 800 }
  }
});
