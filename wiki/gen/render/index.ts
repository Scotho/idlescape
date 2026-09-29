import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { ExtractedData, Page } from '../types';
import { buildContext } from './context';
import { assemble, type Draft } from './page';
import { renderItem } from './item'; import { renderNpc } from './npc'; import { renderLoc } from './loc'; import { renderQuest } from './quest';
import { renderSkill } from './skill'; import { renderShop } from './shop'; import { renderArea } from './area';
import { applyOverlay, parseOverlay, toSource, type LintProblem, type Overlay } from './overlay';
import { resolveNamedLinks } from './links';
import { confidenceOf } from './page';

export function loadOverlays(dir: string): Overlay[] {
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true }) as string[]).filter(f => f.endsWith('.md')).sort()
    .map(f => parseOverlay(readFileSync(path.join(dir, f), 'utf8'), `content/${f.replace(/\\/g, '/')}`));
}

export function renderAll(data: ExtractedData, overlays: Overlay[]): { pages: Page[]; drafts: Draft[]; problems: LintProblem[] } {
  const ctx = buildContext(data);
  for (const ov of overlays) if (ov.standalone) ctx.nameIndex.set(ov.standalone.title.toLowerCase(), { type: ov.type, slug: ov.standalone.slug });
  const problems: LintProblem[] = [];
  const byKey = new Map(overlays.filter(o => !o.standalone).map(o => [`${o.type}:${o.key}`, o]));
  const drafts: Draft[] = [
    ...data.items.map(e => renderItem(e, ctx)), ...data.npcs.map(e => renderNpc(e, ctx)), ...data.locs.map(e => renderLoc(e, ctx)),
    ...data.quests.map(e => renderQuest(e, ctx)), ...data.skills.map(e => renderSkill(e, ctx)), ...data.shops.map(e => renderShop(e, ctx)), ...data.areas.map(e => renderArea(e, ctx))
  ];
  const keyOf = new Map<string, string>();
  const entityKeys = new Set<string>();
  for (const list of [data.items, data.npcs, data.locs, data.quests, data.skills, data.shops, data.areas]) for (const e of list) { keyOf.set(`${e.type}/${e.slug}`, `${e.type}:${e.key}`); entityKeys.add(`${e.type}:${e.key}`); }
  // A keyed overlay names the entity it refines. If nothing carries that key the overlay is dead
  // weight - its prose and its citations never reach a page - so say so instead of dropping it.
  for (const [typeKey, ov] of byKey) if (!entityKeys.has(typeKey)) problems.push({ rule: 'orphan-overlay', page: `${ov.type}/${ov.key}`, message: `${ov.file} targets ${typeKey}, which matches no entity`, level: 'error' });
  const final: Draft[] = drafts.map(d => {
    const ov = byKey.get(keyOf.get(`${d.type}/${d.slug}`) ?? '');
    if (!ov) return d;
    const r = applyOverlay(d, ov, ctx.nameIndex);
    problems.push(...r.problems);
    return r.draft;
  });
  for (const ov of overlays.filter(o => o.standalone)) {
    const slug = ov.standalone!.slug;
    const page = `${ov.type}/${slug}`;
    if (final.some(d => d.type === ov.type && d.slug === slug)) {
      problems.push({ rule: 'duplicate-page', page, message: `${ov.file} collides with a generated page`, level: 'error' });
      continue;
    }
    const { md, unresolved } = resolveNamedLinks(ov.standalone!.lead, ctx.nameIndex);
    for (const u of unresolved) problems.push({ rule: 'unresolved-links', page, message: `[[${u}]] in ${ov.file}`, level: 'error' });
    const sections = ov.sections.map(s => { const r = resolveNamedLinks(s.body.trim(), ctx.nameIndex); for (const u of r.unresolved) problems.push({ rule: 'unresolved-links', page, message: `[[${u}]] in ${ov.file}`, level: 'error' }); const sources = s.sources.map(toSource); return { heading: s.heading, body: r.md, meta: { confidence: confidenceOf(sources), sources } }; });
    final.push({ type: ov.type, slug, title: ov.standalone!.title, lead: md, infobox: Object.entries(ov.infobox), sections, sources: Object.values(ov.sources).map(toSource) });
  }
  return { pages: final.map(d => assemble(d, data.manifest)), drafts: final, problems };
}
