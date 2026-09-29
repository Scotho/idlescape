import type { EntityType } from '../types';
export const WIKILINK = /\[\[([a-z]+)\/([a-z0-9-]+)\|([^\]]+)\]\]/g;
export function wl(type: EntityType, slug: string, label: string): string { return `[[${type}/${slug}|${label}]]`; }
/** Resolve `[[Name]]` and `[[Name|label]]` by name or alias into typed links; returns unresolved names. */
export function resolveNamedLinks(md: string, nameIndex: Map<string, { type: EntityType; slug: string }>): { md: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const out = md.replace(/\[\[([^\]|/]+)(?:\|([^\]]+))?\]\]/g, (whole, name: string, label?: string) => {
    const hit = nameIndex.get(name.trim().toLowerCase());
    if (!hit) { unresolved.push(name); return whole; }
    return wl(hit.type, hit.slug, label ?? name);
  });
  return { md: out, unresolved };
}
/** Typed links to markdown links; returns the link list for the db. */
export function finalizeLinks(md: string): { md: string; links: { toType: EntityType; toSlug: string }[] } {
  const links: { toType: EntityType; toSlug: string }[] = [];
  const out = md.replace(WIKILINK, (_, t: string, s: string, label: string) => { links.push({ toType: t as EntityType, toSlug: s }); return `[${label}](/wiki/${t}/${s})`; });
  return { md: out, links };
}
