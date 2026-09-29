// Fork seeds: the Tasks panel forks a bundled script by saving its source as a user script,
// so every seed must compile through the same path `api.save` uses.
import { describe, expect, test } from 'vitest';
import { LIBRARY, forkIdFor, forkSeed, librarySource } from './index';
import { compileUserScript } from '../defineScript';
import { dropAllTask, invFull, levelOf, tool } from './loopHelpers';
import type { WorldState } from '../../agent/types';

const st = (o: Partial<WorldState>): WorldState => ({ inventory: [], skills: [], ...o } as unknown as WorldState);
/**
 * The bundled scripts a fork can be seeded from. `tutorial-island` is a directory of eight
 * modules plus a generated step list, so its `?raw` entry module would seed a fork importing
 * seven files `compileUserScript` strips and cannot supply; `librarySource` answers null for it
 * and the test below says so.
 */
const FORKABLE = LIBRARY.filter(s => s.id !== 'tutorial-island');

describe('librarySource', () => {
  test('is null for an unknown id and non-empty for every bundled script', () => {
    expect(librarySource('nope')).toBeNull();
    for (const s of FORKABLE) expect((librarySource(s.id) ?? '').length, s.id).toBeGreaterThan(100);
  });

  test('every bundled script compiles as a user script, helpers and all', () => {
    for (const s of FORKABLE) {
      const r = compileUserScript(librarySource(s.id)!);
      expect(r.ok, `${s.id}: ${r.ok ? '' : r.message}`).toBe(true);
      if (r.ok) {
        expect(r.script.id).toBe(s.id);
        expect(r.script.tasks.map(t => t.name)).toEqual(s.tasks.map(t => t.name));
      }
    }
  });

  test('the multi-module script has no seed, so the Fork button cannot offer one that will not compile', () => {
    expect(librarySource('tutorial-island')).toBeNull();
    expect(forkSeed('tutorial-island', 'tutorial-island-fork')).toBeNull();
    expect(LIBRARY.map(s => s.id)).toContain('tutorial-island');
  });

  test('the JS helper prelude behaves like loopHelpers.ts', () => {
    const compiled = compileUserScript(librarySource('chop-and-drop')!);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const full = Array.from({ length: 28 }, (_, i) => ({ slot: i, id: 1511, name: 'Logs', count: 1 }));
    const drop = compiled.script.tasks.find(t => t.name === 'drop-logs-when-full')!;
    const ref = dropAllTask('drop-logs-when-full', /logs$/i, 'keepLogs');
    const ctx = { params: { keepLogs: false } } as never;
    expect(drop.when(st({ inventory: full as never }), ctx)).toBe(ref.when(st({ inventory: full as never }), ctx));
    expect(drop.when(st({}), ctx)).toBe(ref.when(st({}), ctx));
    expect(compiled.script.requires![0]).toEqual(tool('Bronze axe'));
    expect(invFull(st({ inventory: full as never }))).toBe(true);
    expect(levelOf(st({ skills: [{ name: 'Woodcutting', baseLevel: 7 }] as never }), 'Woodcutting')).toBe(7);
  });
});

describe('forkSeed', () => {
  test('rewrites the manifest id so the fork saves under its own doc', () => {
    const seed = forkSeed('chop-and-drop', 'chop-and-drop-fork')!;
    const r = compileUserScript(seed);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.script.id).toBe('chop-and-drop-fork');
    expect(seed).not.toContain("id: 'chop-and-drop',");
  });

  test('is null for a script that is not in the library', () => {
    expect(forkSeed('nope', 'nope-fork')).toBeNull();
  });
});

describe('forkIdFor', () => {
  test('suffixes -fork, then -fork-2 and -fork-3 while the id is taken', () => {
    expect(forkIdFor('chop-and-drop', new Set())).toBe('chop-and-drop-fork');
    expect(forkIdFor('chop-and-drop', new Set(['chop-and-drop-fork']))).toBe('chop-and-drop-fork-2');
    expect(forkIdFor('chop-and-drop', new Set(['chop-and-drop-fork', 'chop-and-drop-fork-2']))).toBe('chop-and-drop-fork-3');
  });
});
