import type { Area } from '../types';
import type { RenderContext } from './context';
import { section, type Draft } from './page';
import { wl } from './links';

const FEATURE_KEYS: [string, RegExp][] = [['Banks', /bank/i], ['Anvils', /^anvil/i], ['Furnaces', /furnace/i], ['Ranges', /^range$|stove|cooking range/i], ['Altars', /altar/i], ['Trees', /tree/i], ['Rocks', /rock/i], ['Fishing spots', /fishing/i]];

export function renderArea(a: Area, ctx: RenderContext): Draft {
  const here = ctx.data.spawns.filter(s => s.area === a.slug);
  const lead = `**${a.name}** is a${a.members ? ' members-only' : ' free-to-play'} area of the world map${a.multiway ? ' in a multi-combat zone' : ''}, centred on (${a.coord.x}, ${a.coord.z}).`;
  const features: string[] = [];
  for (const [label, re] of FEATURE_KEYS) {
    const locs = new Map<string, number>();
    for (const s of here) if (s.kind === 'loc') { const l = ctx.locByKey.get(s.key); if (l && re.test(l.name)) locs.set(l.slug, (locs.get(l.slug) ?? 0) + 1); }
    if (locs.size) features.push(`- ${label}: ${[...locs.entries()].map(([slug, n]) => `${wl('loc', slug, ctx.data.locs.find(l => l.slug === slug)!.name)} (${n})`).join(', ')}`);
  }
  const shops = ctx.data.shops.filter(s => s.coords.some(c => Math.hypot(c.x - a.coord.x, c.z - a.coord.z) < 120));
  if (shops.length) features.push(`- Shops: ${shops.map(s => wl('shop', s.slug, s.name)).join(', ')}`);
  const quests = ctx.data.quests.filter(q => q.startNpcKey && here.some(s => s.kind === 'npc' && s.key === q.startNpcKey));
  if (quests.length) features.push(`- Quest starts: ${quests.map(q => wl('quest', q.slug, q.name)).join(', ')}`);
  const npcs = new Map<string, number>(); for (const s of here) if (s.kind === 'npc') npcs.set(s.key, (npcs.get(s.key) ?? 0) + 1);
  // Some NPC configs (e.g. invisible effect entities used only for scripted scenery) carry an empty
  // display name, which slugify()s to an empty slug. Such NPCs have nothing to show a reader and would
  // otherwise emit a malformed `[[npc/|]]` link, so they are skipped here rather than listed.
  const list = (pred: (k: string) => boolean) => [...npcs.entries()].filter(([k]) => pred(k)).map(([k, n]) => { const e = ctx.npcByKey.get(k); return e && e.name ? `- ${wl('npc', e.slug, e.name)}${n > 1 ? ` (${n})` : ''}` : null; }).filter((s): s is string => s !== null).join('\n');
  return { type: 'area', slug: a.slug, title: a.name, lead,
    infobox: [['Members', a.members ? 'Yes' : 'No'], ['Multi-combat', a.multiway ? 'Yes' : 'No'], ['Map label', a.name], ['Coordinates', `(${a.coord.x}, ${a.coord.z}, 0)`]],
    sections: [section('Features', features.join('\n'), [...a.sources, { kind: 'derived', ref: 'derived:areas.ts:nearestArea', note: 'spawns attributed to the nearest label' }], true),
      section('NPCs', list(k => !ctx.npcByKey.get(k)?.options.includes('Attack')), a.sources), section('Monsters', list(k => !!ctx.npcByKey.get(k)?.options.includes('Attack')), a.sources), section('Trivia', '', a.sources)],
    sources: a.sources };
}
