import { marked } from 'marked';
import { finalizeLinks, WIKILINK } from './links';
import { escapeCell } from './infobox';
import type { Confidence, EntityType, Manifest, Page, SectionMeta, Source } from '../types';

/** Escapes markdown-significant characters in an infobox cell, but leaves any typed
 * `[[type/slug|label]]` wikilink segments verbatim so they survive to `finalizeLinks`. */
export function escapeCellLinks(v: string): string {
  const re = new RegExp(WIKILINK.source, 'g');
  let out = '';
  let last = 0;
  for (const m of v.matchAll(re)) {
    out += escapeCell(v.slice(last, m.index));
    out += m[0];
    last = m.index! + m[0].length;
  }
  out += escapeCell(v.slice(last));
  return out;
}

export interface Section { heading: string; body: string; meta: SectionMeta; required?: boolean }
export interface Draft { type: EntityType; slug: string; title: string; lead: string; infobox: [string, string][]; sections: Section[]; sources: Source[] }

export const STUB = 'No information is recorded for this section yet.';
export function stub(_heading: string): string { return STUB; }

const RANK: Record<Confidence, number> = { verified: 0, derived: 1, period: 2, modern: 3, editorial: 4 };
const KIND_TO_CONF: Record<Source['kind'], Confidence> = { content: 'verified', engine: 'verified', cited: 'verified', derived: 'derived', period: 'period', modern: 'modern', editorial: 'editorial' };
export function confidenceOf(sources: Source[]): Confidence {
  if (sources.length === 0) return 'editorial';
  return sources.map(s => KIND_TO_CONF[s.kind]).reduce((w, c) => (RANK[c] > RANK[w] ? c : w), 'verified');
}

export function section(heading: string, body: string, sources: Source[], required = false): Section {
  return { heading, body, meta: { confidence: confidenceOf(sources), sources }, required };
}

export function assemble(d: Draft, manifest: Manifest): Page {
  const parts: string[] = [`# ${d.title}`, ''];
  if (d.infobox.length) parts.push(['| | |', '|---|---|', ...d.infobox.map(([k, v]) => `| **${k}** | ${escapeCellLinks(v)} |`)].join('\n'), '');
  // The lead is stored on its own (it feeds `pages.lead`, the FTS `lead` column, the page JSON
  // and plan-context), so finalize it here rather than only inside the assembled markdown -
  // otherwise the stored copy keeps raw `[[type/slug|Label]]` syntax. Its links are merged back
  // in below, since the whole-document pass no longer sees them.
  const { md: lead, links: leadLinks } = finalizeLinks(d.lead);
  parts.push(lead, '');
  const sections: Record<string, SectionMeta> = {};
  const footnotes: string[] = [];
  const noteIndex = new Map<string, number>();
  const ref = (s: Source) => { const key = `${s.kind}:${s.ref}`; let n = noteIndex.get(key); if (!n) { n = footnotes.length + 1; noteIndex.set(key, n); footnotes.push(`${n}. \`${s.ref}\`${s.note ? ` — ${s.note}` : ''}`); } return n; };
  for (const s of d.sections) {
    if (!s.body.trim() && !s.required) continue;
    sections[s.heading] = s.meta;
    const marks = s.meta.sources.map(ref).map(n => `[${n}]`).join(' ');
    const badge = s.meta.confidence === 'verified' ? '' : ` *(${s.meta.confidence})*`;
    parts.push(`## ${s.heading}${badge}`, '', (s.body.trim() || STUB) + (marks ? ` ${marks}` : ''), '');
  }
  if (footnotes.length) parts.push('## Sources', '', ...footnotes, '');
  parts.push('## Build', '', `Revision ${manifest.revision} · Content ${manifest.contentSha.slice(0, 8)} · Engine ${manifest.engineSha.slice(0, 8)} · generated ${manifest.generatedAt.slice(0, 10)}`, '');
  const { md, links } = finalizeLinks(parts.join('\n'));
  const html = marked.parse(md, { async: false }) as string;
  return { type: d.type, slug: d.slug, title: d.title, lead, markdown: md, html, sections, links: [...links, ...leadLinks].map(l => ({ ...l, relation: 'mentions' })) };
}
