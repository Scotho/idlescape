import type { EntityType, Source } from '../types';
import { confidenceOf, type Draft, type Section } from './page';
import { resolveNamedLinks } from './links';

export interface LintProblem { rule: string; page: string; message: string; level: 'error' | 'warn' }
export interface OverlaySection { heading: string; body: string; sources: string[] }
export interface Overlay { file: string; type: EntityType; key: string; infobox: Record<string, string>; sources: Record<string, string>; disputes: string | null; sections: OverlaySection[]; standalone?: { slug: string; title: string; lead: string } }

/** Minimal front matter: `key: value` lines and one level of two-space-indented maps. */
function parseFrontmatter(text: string): Record<string, string | Record<string, string>> {
  const out: Record<string, string | Record<string, string>> = {};
  let map: Record<string, string> | null = null;
  for (const line of text.split(/\r?\n/)) {
    const nested = /^  ([^:]+):\s*(.*)$/.exec(line);
    if (nested && map) { map[nested[1]!.trim()] = nested[2]!.trim(); continue; }
    const top = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (!top) continue;
    if (top[2] === '') { map = {}; out[top[1]!] = map; } else { map = null; out[top[1]!] = top[2]!.trim(); }
  }
  return out;
}

const SRC_COMMENT = /<!--\s*src:\s*([^\s>]+)\s*-->/g;

export function parseOverlay(text: string, file: string): Overlay {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!fm) throw new Error(`${file}: missing front matter`);
  const meta = parseFrontmatter(fm[1]!);
  const str = (k: string) => (typeof meta[k] === 'string' ? (meta[k] as string) : undefined);
  const rec = (k: string) => (typeof meta[k] === 'object' ? (meta[k] as Record<string, string>) : {});
  const sections: OverlaySection[] = [];
  let cur: OverlaySection | null = null;
  for (const line of fm[2]!.split(/\r?\n/)) {
    const h = /^## (.+)$/.exec(line);
    if (h) { cur = { heading: h[1]!.trim(), body: '', sources: [] }; sections.push(cur); continue; }
    if (!cur) continue;
    for (const m of line.matchAll(SRC_COMMENT)) cur.sources.push(m[1]!);
    cur.body += (cur.body ? '\n' : '') + line.replace(SRC_COMMENT, '').replace(/\s+$/, '');
  }
  const standalone = str('slug') && str('title') ? { slug: str('slug')!, title: str('title')!, lead: str('lead') ?? '' } : undefined;
  return { file, type: str('type') as EntityType, key: str('key') ?? str('slug') ?? '', infobox: rec('infobox'), sources: rec('sources'), disputes: str('disputes') ?? null, sections, standalone };
}

export function toSource(ref: string): Source {
  const c = ref.indexOf(':');
  const kind = (c > 0 ? ref.slice(0, c) : 'editorial') as Source['kind'];
  return ['content', 'engine', 'derived', 'cited', 'period', 'modern', 'editorial'].includes(kind) ? { kind, ref: ref.slice(c + 1) } : { kind: 'editorial', ref };
}

export function applyOverlay(draft: Draft, ov: Overlay, nameIndex: Map<string, { type: EntityType; slug: string }>): { draft: Draft; problems: LintProblem[] } {
  const problems: LintProblem[] = [];
  const page = `${draft.type}/${draft.slug}`;
  const infobox = [...draft.infobox];
  for (const [k, v] of Object.entries(ov.infobox)) {
    const srcRef = ov.sources[k];
    if (!srcRef) problems.push({ rule: 'overlay-source', page, message: `infobox row "${k}" has no source in ${ov.file}`, level: 'error' });
    const i = infobox.findIndex(r => r[0] === k);
    if (i >= 0 && infobox[i]![1] !== v && ov.disputes !== 'content') problems.push({ rule: 'overlay-dispute', page, message: `infobox "${k}" is "${infobox[i]![1]}" in data but "${v}" in ${ov.file}; add "disputes: content" with a reason to override`, level: 'error' });
    if (i >= 0) { if (ov.disputes === 'content') infobox[i] = [k, v]; } else infobox.push([k, v]);
  }
  const sections: Section[] = [...draft.sections];
  const sameHeading = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
  for (const os of ov.sections) {
    const { md, unresolved } = resolveNamedLinks(os.body.trim(), nameIndex);
    for (const u of unresolved) problems.push({ rule: 'unresolved-links', page, message: `[[${u}]] in ${ov.file} does not match any entity name or alias`, level: 'error' });
    const sources = os.sources.map(toSource);
    const i = sections.findIndex(s => sameHeading(s.heading, os.heading));
    const heading = i >= 0 ? sections[i]!.heading : os.heading;
    const sec: Section = { heading, body: md, meta: { confidence: confidenceOf(sources), sources }, required: i >= 0 ? sections[i]!.required : false };
    if (i >= 0) { sections[i] = sec; continue; }
    const triviaAt = sections.findIndex(s => sameHeading(s.heading, 'Trivia'));
    if (triviaAt >= 0) sections.splice(triviaAt, 0, sec); else sections.push(sec);
  }
  return { draft: { ...draft, infobox, sections }, problems };
}
