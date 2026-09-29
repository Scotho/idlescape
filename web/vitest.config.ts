import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    // Vendored rs-sdk tests need the upstream bun runner and its fixtures. `pathfinding.ts` is
    // ours rather than vendored (src/vendor/PATCHES.md), so its suite belongs to this runner.
    exclude: ['**/node_modules/**', '**/dist/**', 'src/vendor/**/!(pathfinding).test.ts'],
    // fake-indexeddb backs the run-history store (SP4a Task 8) under jsdom.
    setupFiles: ['fake-indexeddb/auto', 'src/test/setupDom.ts']
  }
});
