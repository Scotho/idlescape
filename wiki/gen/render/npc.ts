import type { NpcEntity, Source } from '../types';
import type { RenderContext } from './context';
import { section, type Draft } from './page';
import { wl } from './links';
import { fmtCoord, fmtRate } from './infobox';

export function renderNpc(n: NpcEntity, ctx: RenderContext): Draft {
  const monster = n.stats !== null && n.options.includes('Attack');
  const spawns = ctx.spawnsByKey.get(`npc:${n.key}`) ?? [];
  const areas = [...new Set(spawns.map(s => s.area).filter((a): a is string => !!a))].map(a => ctx.areaBySlug.get(a)).filter((a): a is NonNullable<typeof a> => !!a);
  const where = areas.length ? ` found in ${areas.slice(0, 3).map(a => wl('area', a.slug, a.name)).join(', ')}` : '';
  // Examine text is already shown in the infobox's "Examine" row and is quoted verbatim from the game;
  // in-game examine text is frequently written in the second person, so it is not repeated in the lead
  // (which must follow the wiki's no-second-person voice rule for its own prose).
  const lead = monster
    ? `The **${n.name}** is a level ${n.combatLevel} monster${where}.`
    : `**${n.name}** is a non-player character${where}.`;
  const src: Source[] = n.sources;

  const byArea = new Map<string, typeof spawns>();
  for (const s of spawns) (byArea.get(s.area ?? 'unknown') ?? byArea.set(s.area ?? 'unknown', []).get(s.area ?? 'unknown')!).push(s);
  const location = [...byArea.entries()].map(([slug, rows]) => {
    const a = ctx.areaBySlug.get(slug);
    return `- ${a ? wl('area', a.slug, a.name) : 'Unlabelled area'}: ${rows.length} spawn${rows.length === 1 ? '' : 's'}, e.g. ${fmtCoord(rows[0]!.coord)}`;
  }).join('\n');

  const drops = [...(ctx.dropsByNpc.get(n.key) ?? [])].sort((a, b) => b.num / b.den - a.num / a.den);
  const dropSrc = drops.flatMap(d => d.sources);
  const dropRows = drops.map(d => {
    const it = ctx.itemByKey.get(d.itemKey);
    const qty = d.min === d.max ? String(d.min) : `${d.min}–${d.max}`;
    return `| ${it ? wl('item', it.slug, it.name) : d.itemKey} | ${qty} | ${fmtRate(d.num, d.den)} | ${d.condition ?? ''} |`;
  });
  const dropTable = dropRows.length ? ['| Item | Quantity | Rarity | Notes |', '|---|---|---|---|', ...dropRows].join('\n') : '';

  const shops = ctx.data.shops.filter(s => s.ownerNpcKeys.includes(n.key));
  const quests = ctx.data.quests.filter(q => q.startNpcKey === n.key);

  const infobox: [string, string][] = [
    ['Released', '2004 (build 274)'], ['Members', n.members ? 'Yes' : 'No'], ['Options', n.options.join(', ') || '—'], ['Examine', n.examine ?? '—'], ['NPC id', String(n.id)], ['Key', n.key]
  ];
  if (n.stats) infobox.push(['Combat level', String(n.combatLevel ?? '—')], ['Hitpoints', String(n.stats.hitpoints)], ['Attack', String(n.stats.attack)], ['Strength', String(n.stats.strength)], ['Defence', String(n.stats.defence)],
    ['Respawn', n.respawnTicks === null ? '—' : `${n.respawnTicks} ticks (${(n.respawnTicks * 0.6).toFixed(0)} s)`], ['Size', `${n.size}x${n.size}`]);

  const sections = [
    section('Location', location, [...src, { kind: 'content', ref: 'content:maps/*.jm2#NPC' }], true),
    ...(monster ? [section('Drops', dropTable, dropSrc.length ? dropSrc : src, true)] : []),
    section('Quests involved', quests.map(q => `- Starts ${wl('quest', q.slug, q.name)}`).join('\n'), src),
    section('Shop', shops.map(s => `- Runs ${wl('shop', s.slug, s.name)}`).join('\n'), src),
    ...(monster ? [section('Strategy', '', src)] : []),
    section('Trivia', '', src)
  ];
  return { type: 'npc', slug: n.slug, title: n.name, lead, infobox, sections, sources: src };
}
