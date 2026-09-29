import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { WikiDb } from './db';
import { plainSnippet, toMarkdown, wantsJson } from './format';
import * as Q from './queries';
import type { QueryResult, WikiType } from './types';

const SCHEMA = readFileSync(path.join(import.meta.dir, 'schema.md'), 'utf8');
const TYPES = new Set<WikiType>(['item', 'npc', 'loc', 'quest', 'skill', 'shop', 'area', 'method', 'mechanic', 'guide']);

/** Every response - success or error, markdown or JSON - carries these two so an agent can tell
 * which content build answered it. */
export function headersFor(db: WikiDb): Record<string, string> {
  const m = db.meta();
  return { 'x-wiki-revision': m.revision, 'x-wiki-build': m.contentSha };
}

function respond(db: WikiDb, url: URL, req: Request, kind: string, r: QueryResult<unknown>): Response {
  const m = db.meta();
  const status = r.ok ? 200 : r.error === 'bad_query' ? 400 : 404;
  const headers: Record<string, string> = { ...headersFor(db), 'cache-control': 'no-cache' };
  if (wantsJson(url, req)) return Response.json(r.ok ? { ...(r.data as object), sources: r.sources, confidence: r.confidence, revision: m.revision } : { error: r.error, message: r.message, candidates: r.candidates ?? [] }, { status, headers });
  return new Response(toMarkdown(kind, r), { status, headers: { ...headers, 'content-type': 'text/markdown; charset=utf-8' } });
}

const num = (v: string | null, name: string): number => { if (v === null || v === '' || !Number.isFinite(Number(v))) throw new Error(`${name} must be a number`); return Number(v); };
const coordOf = (p: URLSearchParams) => ({ x: num(p.get('x'), 'x'), z: num(p.get('z'), 'z'), level: p.get('level') ? num(p.get('level'), 'level') : 0 });

export async function handleWikiApi(db: WikiDb, url: URL, req: Request): Promise<Response> {
  const p = url.searchParams;
  const seg = url.pathname.split('/').filter(Boolean).slice(2); // after api/wiki
  try {
    if (seg[0] === 'schema') return new Response(SCHEMA, { headers: { 'content-type': 'text/markdown; charset=utf-8', ...headersFor(db) } });
    if (seg[0] === 'search') {
      const q = p.get('q') ?? '';
      if (!q.trim()) return respond(db, url, req, 'search', { ok: false, error: 'bad_query', message: 'q is required' });
      const type = p.get('type') ?? undefined;
      const hits = db.search(q, type && TYPES.has(type as WikiType) ? type : undefined, Math.min(Number(p.get('limit') ?? 10) || 10, 50))
        .map(h => ({ ...h, snippet: plainSnippet(h.snippet) }));
      return respond(db, url, req, 'search', { ok: true, data: { hits }, sources: [], confidence: 'verified' });
    }
    if (seg[0] === 'page' && seg[1] && seg[2]) {
      const page = db.getPage(seg[1], seg[2]);
      if (!page) return respond(db, url, req, 'page', { ok: false, error: 'not_found', message: `no page ${seg[1]}/${seg[2]}`, candidates: db.search(seg[2].replace(/-/g, ' '), seg[1], 5) });
      const want = p.get('sections')?.split(',').map(s => s.trim().toLowerCase());
      let md = page.markdown;
      if (want) { const head = md.split('\n## ')[0]!; const secs = md.split('\n## ').slice(1).filter(s => want.includes(s.split('\n')[0]!.replace(/\s*\*\(.*\)\*$/, '').trim().toLowerCase())); md = [head, ...secs.map(s => `## ${s}`)].join('\n'); }
      if (wantsJson(url, req)) {
        const sections = JSON.parse(page.sections_json) as Record<string, { sources?: { kind: string; ref: string }[] }>;
        // The page's own sources are the union of its sections' - the rendered markdown lists the
        // same set as numbered footnotes.
        const pageSources = [...new Set(Object.values(sections).flatMap(sec => (sec.sources ?? []).map(s => s.ref)))];
        return respond(db, url, req, 'page', { ok: true, data: { type: page.type, slug: page.slug, title: page.title, lead: page.lead, markdown: md, sections, entity: JSON.parse(db.getEntity(page.type, page.slug)?.json ?? 'null') as unknown }, sources: pageSources, confidence: 'verified' });
      }
      return new Response(md, { headers: { 'content-type': 'text/markdown; charset=utf-8', ...headersFor(db) } });
    }
    if (seg[0] === 'entity' && seg[1] && seg[2]) {
      const e = db.getEntity(seg[1], decodeURIComponent(seg[2]));
      return respond(db, url, req, 'entity', e ? { ok: true, data: JSON.parse(e.json) as unknown, sources: [`content:${e.type}#${e.key}`], confidence: 'verified' } : { ok: false, error: 'not_found', message: `no ${seg[1]} ${seg[2]}`, candidates: db.search(seg[2], seg[1], 5) });
    }
    if (seg[0] === 'q' && seg[1]) {
      const kind = seg[1];
      // `near` goes through the same finite check as x/z/level, so `near=abc` is a 400 bad_query
      // rather than a silent NaN distance on every row.
      const near = p.has('near') ? (() => { const [x, z, l] = p.get('near')!.split(','); return { x: num(x ?? null, 'near.x'), z: num(z ?? null, 'near.z'), level: l === undefined || l === '' ? 0 : num(l, 'near.level') }; })() : undefined;
      const r: QueryResult<unknown> | null =
        kind === 'obtain' ? Q.obtain(db, p.get('item') ?? '', near)
        : kind === 'drops' ? Q.drops(db, p.get('npc') ?? '')
        : kind === 'requirements' ? Q.requirements(db, { quest: p.get('quest') ?? undefined, item: p.get('item') ?? undefined })
        : kind === 'unlocks' ? Q.unlocks(db, p.get('skill') ?? '', num(p.get('level'), 'level'))
        : kind === 'methods' ? Q.methods(db, p.get('skill') ?? '', num(p.get('level'), 'level'), p.get('members') === null ? undefined : p.get('members') === 'true')
        : kind === 'nearest' ? Q.nearest(db, p.get('kind') ?? '', p.get('name') ?? undefined, coordOf(p), Math.min(Number(p.get('limit') ?? 5) || 5, 25))
        : kind === 'where' ? Q.where(db, p.get('name') ?? '', Math.min(Number(p.get('limit') ?? Q.WHERE_DEFAULT_GROUPS) || Q.WHERE_DEFAULT_GROUPS, Q.WHERE_MAX_GROUPS))
        : kind === 'shops' ? Q.shops(db, { item: p.get('item') ?? undefined, area: p.get('area') ?? undefined })
        : kind === 'quest-order' ? Q.questOrder(db, (p.get('done') ?? '').split(',').filter(Boolean), p.get('members') === null ? undefined : p.get('members') === 'true')
        : kind === 'plan-context' ? Q.planContext(db, p.get('goal') ?? '', Math.max(50, Math.min(Number(p.get('budget') ?? 3000) || 3000, 12000)))
        : null;
      if (!r) return Response.json({ error: 'not_found', message: `unknown query kind "${kind}"` }, { status: 404, headers: headersFor(db) });
      return respond(db, url, req, kind, r);
    }
    return Response.json({ error: 'not_found', message: 'see /api/wiki/schema' }, { status: 404, headers: headersFor(db) });
  } catch (err) {
    return respond(db, url, req, seg[1] ?? seg[0] ?? 'api', { ok: false, error: 'bad_query', message: err instanceof Error ? err.message : String(err) });
  }
}
