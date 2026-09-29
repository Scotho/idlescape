import type { LocEntity } from '../types';
import type { RenderContext } from './context';
import { section, type Draft } from './page';
import { wl } from './links';
import { fmtCoord } from './infobox';

export function renderLoc(l: LocEntity, ctx: RenderContext): Draft {
  const spawns = ctx.spawnsByKey.get(`loc:${l.key}`) ?? [];
  // Examine text is already shown in the infobox's "Examine" row and is quoted verbatim from the game;
  // in-game examine text is frequently written in the second person, so it is not repeated in the lead
  // (which must follow the wiki's no-second-person voice rule for its own prose).
  const lead = `The **${l.name}** is a piece of scenery${l.options.length ? ` with the option${l.options.length > 1 ? 's' : ''} ${l.options.map(o => `"${o}"`).join(', ')}` : ''}.`;
  const byArea = new Map<string, number>();
  for (const s of spawns) byArea.set(s.area ?? 'unknown', (byArea.get(s.area ?? 'unknown') ?? 0) + 1);
  const locations = [...byArea.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([slug, n]) => { const a = ctx.areaBySlug.get(slug); return `- ${a ? wl('area', a.slug, a.name) : 'Unlabelled area'}: ${n}`; }).join('\n');
  const uses = (ctx.methodsByInput.get(l.key) ?? []).map(m => `- ${m.action} (${wl('skill', m.skill, m.skill)} ${m.level})`).join('\n');
  return { type: 'loc', slug: l.slug, title: l.name, lead,
    infobox: [['Options', l.options.join(', ') || '—'], ['Examine', l.examine ?? '—'], ['Size', `${l.width}x${l.length}`], ['Placements', String(spawns.length)], ['Object id', String(l.id)], ['Key', l.key]],
    sections: [section('Uses', uses, l.sources, true), section('Locations', locations || (spawns[0] ? `- ${fmtCoord(spawns[0].coord)}` : ''), [...l.sources, { kind: 'content', ref: 'content:maps/*.jm2#LOC' }]), section('Trivia', '', l.sources)],
    sources: l.sources };
}
