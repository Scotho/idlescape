// The wiki's two entry points do their work inside an `if (import.meta.main)` block, and
// package.json is how build.ps1, verify.ps1, the root `npm run wiki:*` scripts and AUTHORING.md
// all reach them. That makes the specifier in each script load-bearing rather than cosmetic.
//
// Measured on bun 1.4.1 during this task: with the BARE form (`bun run gen/build.ts`) the
// package's `build` script loaded the module with `import.meta.main === false`, wrote nothing and
// exited 0, so `bun run --cwd wiki build` was a silent no-op and any exit-code check over it was a
// gate that could not fail. Typed at a PowerShell prompt the same bare form fails outright with
// `Module not found`. The behaviour is not stable across shells and this file does not pin it; the
// `./`-relative form is stable, and these tests hold the shape that works and the reason it
// matters. See the ledger entry for sprint entry 2, Task 4.
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const GEN = import.meta.dir;
const PKG = path.join(GEN, '..', 'package.json');
const scripts = (JSON.parse(readFileSync(PKG, 'utf8')) as { scripts: Record<string, string> }).scripts;

test('a ./-relative specifier runs the file as main, which is the property the entry points need', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wiki-scripts-'));
  writeFileSync(path.join(dir, 'entry.ts'), 'process.stdout.write(String(import.meta.main));\n');
  const r = spawnSync(process.execPath, ['run', './entry.ts'], { cwd: dir, encoding: 'utf8' });
  expect(r.status).toBe(0);
  expect(r.stdout.trim()).toBe('true');
});

describe('wiki/package.json', () => {
  test('every script that runs a local TypeScript entry point uses a ./-relative specifier', () => {
    const offenders = Object.entries(scripts)
      .filter(([, cmd]) => /(^|\s)bun run \S+\.ts(\s|$)/.test(cmd))
      .filter(([, cmd]) => !/(^|\s)bun run \.\/\S+\.ts(\s|$)/.test(cmd))
      .map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  test('the three entry-point scripts the gates and the docs call are spelled exactly this way', () => {
    expect(scripts.extract).toBe('bun run ./gen/extract.ts');
    expect(scripts.build).toBe('bun run ./gen/build.ts');
    expect(scripts.lint).toBe('bun run ./gen/build.ts --lint-only');
  });

  test('both entry points really are import.meta.main guarded, which is why the specifier matters', () => {
    for (const f of ['build.ts', 'extract.ts']) {
      expect(readFileSync(path.join(GEN, f), 'utf8')).toContain('import.meta.main');
    }
  });
});
