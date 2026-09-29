import type { Script, ScriptManifest } from '../types';
import chopAndDrop from './chopAndDrop';
import mineAndDrop from './mineAndDrop';
import netFishAndDrop from './netFishAndDrop';
import tutorialIsland from './tutorialIsland/index';
// A bundled script has no source at runtime (`api.get` returns `code: ''` for it), so the raw
// module text is imported alongside the module itself and handed to Fork as a seed.
import chopAndDropSource from './chopAndDrop.ts?raw';
import mineAndDropSource from './mineAndDrop.ts?raw';
import netFishAndDropSource from './netFishAndDrop.ts?raw';

/** The bundled default library, in the order the Marketplace and Tasks panels list it. */
export const LIBRARY: Script[] = [chopAndDrop, netFishAndDrop, mineAndDrop, tutorialIsland].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

export function libraryById(id: string): Script | undefined {
  return LIBRARY.find(s => s.id === id);
}

/** The manifest half of each script: everything but `tasks`, `until`, `onStart` and `onStop`. */
export function libraryManifests(): ScriptManifest[] {
  return LIBRARY.map(s => ({
    id: s.id, name: s.name, version: s.version, description: s.description,
    tags: s.tags, author: s.author, order: s.order, params: s.params, requires: s.requires,
    stuckAfterMs: s.stuckAfterMs, maxAttempts: s.maxAttempts, hardStop: s.hardStop,
    estimateMinutes: s.estimateMinutes, health: s.health, anchor: s.anchor
  }));
}

/**
 * The JavaScript half of `loopHelpers.ts`. A fork is compiled by `compileUserScript`, which
 * strips import lines and runs the rest as plain JS through `new Function` -- so the helpers
 * every bundled script imports have to travel with it, without their TypeScript annotations.
 * `librarySource.test.ts` compiles every seed and compares these against the real helpers, so
 * the two cannot drift apart silently.
 */
const HELPERS = `// Helpers inlined from loopHelpers.ts so this script stands on its own.
const levelOf = (s, skill) => s.skills?.find(k => k.name === skill)?.baseLevel ?? 1;
const invFull = s => (s.inventory?.length ?? 0) >= 28;
const countMatching = (s, match) => (s.inventory ?? []).filter(i => match.test(i.name ?? '')).reduce((n, i) => n + (i.count ?? 1), 0);
const tool = name => ({ kind: 'item', name, text: \`Needs a \${name.toLowerCase()} in your inventory or equipped\` });
function dropAllTask(name, match, keepParam) {
  return {
    name,
    recovers: ['inventory-full'],
    when: (s, c) => invFull(s) && !(keepParam && c.params[keepParam] === true),
    async run(c) {
      for (const item of (c.state().inventory ?? []).filter(i => match.test(i.name ?? ''))) {
        if (c.signal.aborted) return;
        await c.bot.dropItem(item, 'all');
      }
      c.health.recovered('inventory-full');
    }
  };
}
`;

const SOURCES: Record<string, string> = {
  'chop-and-drop': chopAndDropSource,
  'net-fish-and-drop': netFishAndDropSource,
  'mine-and-drop': mineAndDropSource
  // `tutorial-island` is deliberately absent. It is eight modules plus a generated step list,
  // and its `?raw` entry module would seed a fork that imports seven files `compileUserScript`
  // strips and cannot supply. `librarySource('tutorial-island')` therefore answers null, and the
  // Tasks panel reads that to leave the Fork button off its row (`renderScriptRow`'s `forkable`
  // option); forking a multi-module script is out of scope for SP4b.
};

/**
 * The editable source of a bundled script: its module text with the loop helpers inlined, ready
 * to be saved as a user script. Null for an id the bundle does not carry.
 */
export function librarySource(id: string): string | null {
  const source = SOURCES[id];
  return source === undefined ? null : `${HELPERS}\n${source.replace(/^\s*import[^;]*;?\s*$/gm, '').trimStart()}`;
}

/** `librarySource` with the manifest id rewritten, so the fork saves under its own document. */
export function forkSeed(libraryId: string, forkId: string): string | null {
  const source = librarySource(libraryId);
  return source === null ? null : source.replace(new RegExp(`id:\\s*(['"])${libraryId}\\1`), `id: '${forkId}'`);
}

/** `<id>-fork`, then `-fork-2`, `-fork-3`... while the player already owns that id. */
export function forkIdFor(libraryId: string, taken: ReadonlySet<string>): string {
  const base = `${libraryId}-fork`;
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  return `${base}-${Date.now()}`;
}
