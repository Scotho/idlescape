import { parseConfigText, first, paramsOf } from './parse/configText';
import type { PackIds } from './parse/packIds';
import { optionsOf } from './npcs';
import { slugify, dedupeSlugs, aliasesFor } from './slug';
import type { LocEntity, Source } from './types';

export function extractLocs(opts: { locTexts: { file: string; text: string }[]; locPack: PackIds }): LocEntity[] {
  const locs: LocEntity[] = [];
  for (const { file, text } of opts.locTexts) {
    for (const b of parseConfigText(text, file)) {
      const id = opts.locPack.byKey.get(b.key);
      if (id === undefined) continue;
      const name = first(b, 'name') ?? b.key;
      const sources: Source[] = [{ kind: 'content', ref: `content:${b.file}#${b.key}` }, ...b.citations.map(u => ({ kind: 'cited' as const, ref: u }))];
      locs.push({
        type: 'loc', id, key: b.key, slug: slugify(name), name, members: false, aliases: aliasesFor(b.key, name), sources,
        examine: first(b, 'desc'), options: optionsOf(b, 'op'), width: Number(first(b, 'width') ?? 1), length: Number(first(b, 'length') ?? 1),
        category: first(b, 'category'), params: paramsOf(b)
      });
    }
  }
  dedupeSlugs(locs);
  return locs;
}
