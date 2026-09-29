import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CONTENT, ROOT } from './paths';
import { assertContentPinned, assertOverlayNotWikiVisible, checkFull, readData, runExtract, stableManifest } from './extract';
import type { Manifest, Spawn } from './types';

describe.skipIf(!existsSync(path.join(CONTENT, 'pack', 'obj.pack')))('runExtract against the pinned content clone', () => {
  test('produces every entity type in plausible quantities', () => {
    const m = runExtract(CONTENT, mkdtempSync(path.join(tmpdir(), 'wiki-')));
    expect(m.counts.items).toBeGreaterThan(1500);
    expect(m.counts.npcs).toBeGreaterThan(900);
    expect(m.counts.locs).toBeGreaterThan(3000);
    expect(m.counts.quests).toBeGreaterThan(45);
    expect(m.counts.skills).toBe(19);
    expect(m.counts.spawns).toBeGreaterThan(5000);
    expect(m.counts.shops).toBeGreaterThan(50);
    expect(m.counts.drops).toBeGreaterThan(500);
    expect(m.counts.methods).toBeGreaterThan(20);
  }, 120_000);
});

describe('assertContentPinned', () => {
  test('does not throw when the shas match', () => {
    expect(() => assertContentPinned('abc123', 'abc123')).not.toThrow();
  });
  test('throws with both shas and the remediation command when they differ', () => {
    expect(() => assertContentPinned('actualsha', 'pinnedsha')).toThrow(/actualsha.*pinnedsha.*scripts\/setup\.ps1/s);
  });
});

describe('assertOverlayNotWikiVisible', () => {
  const overlay = (files: string[]): string => {
    const dir = mkdtempSync(path.join(tmpdir(), 'wiki-overlay-'));
    for (const rel of files) {
      const full = path.join(dir, rel);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, '');
    }
    return dir;
  };

  test('the real content-custom/ is clean, so the corpus really does describe the world', () => {
    expect(() => assertOverlayNotWikiVisible()).not.toThrow();
  });

  test('throws, naming the file, when the overlay grows something the extractor parses', () => {
    const dir = overlay(['scripts/probe/fake.obj']);
    expect(() => assertOverlayNotWikiVisible(dir)).toThrow(/scripts\/probe\/fake\.obj/);
  });

  test('every extension wiki/gen/load.ts walks is guarded, .jm2 included', () => {
    for (const ext of ['obj', 'npc', 'loc', 'inv', 'param', 'dbtable', 'dbrow', 'rs2', 'constant']) {
      expect(() => assertOverlayNotWikiVisible(overlay([`scripts/probe/fake.${ext}`]))).toThrow(/content-custom\//);
    }
    expect(() => assertOverlayNotWikiVisible(overlay(['maps/m50_50.jm2']))).toThrow(/m50_50\.jm2/);
  });

  test('a .varp anywhere but the accepted path still throws', () => {
    expect(() => assertOverlayNotWikiVisible(overlay(['scripts/probe/other.varp']))).toThrow(/other\.varp/);
  });

  test('the one accepted exception, SP8 bank-tab varp, does not throw', () => {
    expect(() => assertOverlayNotWikiVisible(overlay(['scripts/interface_bank/configs/banktab.varp']))).not.toThrow();
  });

  test('files the extractor never reads, pack/varp.pack and .gitkeep, do not throw', () => {
    expect(() => assertOverlayNotWikiVisible(overlay(['pack/varp.pack', 'maps/.gitkeep']))).not.toThrow();
  });

  test('an absent overlay directory is not an error', () => {
    expect(() => assertOverlayNotWikiVisible(path.join(ROOT, 'no-such-overlay-dir'))).not.toThrow();
  });
});

describe('stableManifest', () => {
  const a = JSON.stringify({ revision: 274, contentSha: 'aaa', generatedAt: '2026-09-05T16:55:47.243Z' });
  test('two runs differing only in generatedAt compare equal', () => {
    expect(stableManifest(a)).toBe(stableManifest(JSON.stringify({ revision: 274, contentSha: 'aaa', generatedAt: '2027-01-01T00:00:00.000Z' })));
  });
  test('a different contentSha does not compare equal', () => {
    expect(stableManifest(a)).not.toBe(stableManifest(JSON.stringify({ revision: 274, contentSha: 'bbb', generatedAt: a })));
  });
  test('generatedAt is gone rather than emptied', () => {
    expect(stableManifest(a)).not.toContain('generatedAt');
  });
});

// Slow (a full re-extract of the pinned content): this is the one test that proves the tier 3
// drift gate can fail. It is gated so `bun test` in verify.ps1 skips it; run it by hand when the
// data changes, with WIKI_CHECK_FULL=1.
test.skipIf(process.env.WIKI_CHECK_FULL !== '1')('checkFull: a clean tree reports no drift', () => {
  expect(checkFull()).toEqual([]);
}, 600_000);

const npcSpawn: Spawn = { kind: 'npc', id: 1, key: 'goblin', coord: { x: 0, z: 0, level: 0 }, count: 1, area: null, file: 'maps/m0_0.jm2' };
const locSpawn: Spawn = { kind: 'loc', id: 2, key: 'tree', coord: { x: 1, z: 1, level: 0 }, count: 1, area: null, file: 'maps/m0_0.jm2' };

function writeFixture(dir: string, rev: number, spawns: Spawn[], locSpawns: Spawn[] | null): void {
  const out = path.join(dir, String(rev));
  mkdirSync(out, { recursive: true });
  const manifest: Manifest = { revision: rev, contentSha: 'fixture', engineSha: 'fixture', generatedAt: new Date().toISOString(), counts: {} };
  const write = (name: string, v: unknown) => writeFileSync(path.join(out, name), JSON.stringify(v));
  write('items.json', []); write('npcs.json', []); write('locs.json', []); write('areas.json', []);
  write('shops.json', []); write('skills.json', []); write('methods.json', []); write('drops.json', []); write('quests.json', []);
  write('manifest.json', manifest);
  write('spawns.json', spawns);
  if (locSpawns !== null) write('loc-spawns.json', locSpawns);
}

describe('readData', () => {
  test('reads spawns.json and loc-spawns.json and concatenates them', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'wiki-readdata-'));
    writeFixture(tmp, 999, [npcSpawn], [locSpawn]);
    const data = readData(999, tmp);
    expect(data.spawns).toHaveLength(2);
    expect(data.spawns.map(s => s.kind).sort()).toEqual(['loc', 'npc']);
  });

  test('regenerates via the injected callback when loc-spawns.json is missing, passing (rev, root)', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'wiki-readdata-regen-'));
    writeFixture(tmp, 998, [npcSpawn], null); // no loc-spawns.json yet
    const calls: [number, string][] = [];
    const regenerate = (rev: number, root: string) => {
      calls.push([rev, root]);
      writeFileSync(path.join(root, String(rev), 'loc-spawns.json'), JSON.stringify([locSpawn]));
    };
    const data = readData(998, tmp, regenerate);
    expect(calls).toEqual([[998, tmp]]);
    expect(data.spawns).toHaveLength(2);
    expect(data.spawns).toContainEqual(locSpawn);
  });
});
