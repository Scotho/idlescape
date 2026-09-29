import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import type { EntityRow, PageRow, SearchHit, WikiMeta, WikiType } from './types';

export interface WikiDb {
  raw: Database;
  meta(): WikiMeta;
  getPage(type: string, slug: string): PageRow | null;
  getEntity(type: string, ref: string): EntityRow | null;
  search(q: string, type: string | undefined, limit: number): SearchHit[];
  listType(type: string): { slug: string; title: string; members: number }[];
  randomPage(): { type: WikiType; slug: string } | null;
  /** Area slug -> display name, so every response can print "Lumbridge" where the spawn rows
   * and the `nearestArea` helper only carry the slug. Built once at open. */
  areaNames: Map<string, string>;
  areaName(slug: string | null | undefined): string | null;
}

/** Sanitised, lower-cased prefix tokens from free text: `[a-z0-9]+` only, never raw user text. */
function tokensOf(q: string): string[] {
  return q.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/** Turn free text into a safe FTS5 MATCH expression: quoted prefix tokens joined by AND. */
export function ftsQuery(q: string): string | null {
  const tokens = tokensOf(q);
  if (!tokens.length) return null;
  return tokens.map(t => `"${t}"*`).join(' AND ');
}

/** Same tokens, joined by OR: the fallback when the AND query finds nothing. */
function ftsQueryOr(q: string): string | null {
  const tokens = tokensOf(q);
  if (tokens.length < 2) return null;
  return tokens.map(t => `"${t}"*`).join(' OR ');
}

// Private-use sentinel characters passed to FTS5's snippet() in place of literal `<b>`/`</b>`.
// Matched text can itself contain `<`, `>` or `&` (game text is not HTML-safe), so the snippet
// column must be HTML-escaped as plain text before these sentinels are turned into real tags -
// see `renderSnippet` in layout.ts, which is the only place that should consume `.snippet`.
export const SNIPPET_OPEN = '';
export const SNIPPET_CLOSE = '';

export function openWikiDb(path: string): WikiDb | null {
  if (!existsSync(path)) return null;
  try {
    const raw = new Database(path, { readonly: true });
    raw.exec('PRAGMA query_only = 1');
    const metaQ = raw.prepare<{ key: string; value: string }, []>('SELECT key, value FROM meta');
    const pageQ = raw.prepare<PageRow, [string, string]>('SELECT * FROM pages WHERE type = ? AND slug = ?');
    const bySlug = raw.prepare<EntityRow, [string, string]>('SELECT * FROM entities WHERE type = ? AND slug = ?');
    const byKey = raw.prepare<EntityRow, [string, string]>('SELECT * FROM entities WHERE type = ? AND key = ?');
    const byId = raw.prepare<EntityRow, [string, number]>('SELECT * FROM entities WHERE type = ? AND id = ?');
    const byAlias = raw.prepare<EntityRow, [string, string]>('SELECT e.* FROM aliases a JOIN entities e ON e.type = a.type AND e.slug = a.slug WHERE a.type = ? AND a.alias = ? LIMIT 1');
    const searchAll = raw.prepare<SearchHit, [string, number]>(`SELECT type, slug, title, snippet(search, 3, '${SNIPPET_OPEN}', '${SNIPPET_CLOSE}', '…', 12) AS snippet, bm25(search, 10.0, 5.0, 2.0, 1.0) AS score FROM search WHERE search MATCH ? ORDER BY score LIMIT ?`);
    const searchType = raw.prepare<SearchHit, [string, string, number]>(`SELECT type, slug, title, snippet(search, 3, '${SNIPPET_OPEN}', '${SNIPPET_CLOSE}', '…', 12) AS snippet, bm25(search, 10.0, 5.0, 2.0, 1.0) AS score FROM search WHERE search MATCH ? AND type = ? ORDER BY score LIMIT ?`);
    const listQ = raw.prepare<{ slug: string; title: string; members: number }, [string]>('SELECT p.slug, p.title, COALESCE(e.members, 0) AS members FROM pages p LEFT JOIN entities e ON e.type = p.type AND e.slug = p.slug WHERE p.type = ? ORDER BY p.title COLLATE NOCASE');
    const randomQ = raw.prepare<{ type: WikiType; slug: string }, []>('SELECT type, slug FROM pages ORDER BY random() LIMIT 1');
    // `buildDb` writes every entity's lower-cased display name into `aliases` alongside its real
    // aliases, so one indexed lookup on `aliases.alias` covers both "name is exactly this" and
    // "an alias is exactly this". Ties (several NPCs called "Goblin") go to the lowest entity id.
    const EXACT = `SELECT p.type, p.slug, p.title, substr(p.lead, 1, 200) AS snippet, -1.0e9 AS score
      FROM aliases a JOIN entities e ON e.type = a.type AND e.slug = a.slug JOIN pages p ON p.type = a.type AND p.slug = a.slug
      WHERE a.alias = ?`;
    const exactAll = raw.prepare<SearchHit, [string, number]>(`${EXACT} ORDER BY e.id LIMIT ?`);
    const exactType = raw.prepare<SearchHit, [string, string, number]>(`${EXACT} AND a.type = ? ORDER BY e.id LIMIT ?`);
    const areaNames = new Map((raw.query("SELECT slug, name FROM entities WHERE type = 'area'").all() as { slug: string; name: string }[]).map(r => [r.slug, r.name]));

    function runSearch(m: string, type: string | undefined, limit: number): SearchHit[] {
      try { return type ? searchType.all(m, type, limit) : searchAll.all(m, limit); } catch { return []; }
    }

    /** Pages whose name or alias is exactly the whole query. These outrank every FTS hit:
     * a search for "bronze axe" wants the Bronze axe, not the page that says it most often. */
    function exactHits(q: string, type: string | undefined, limit: number): SearchHit[] {
      const alias = q.trim().toLowerCase();
      if (!alias) return [];
      try { return type ? exactType.all(alias, type, limit) : exactAll.all(alias, limit); } catch { return []; }
    }

    return {
      raw,
      meta() { return Object.fromEntries(metaQ.all().map(r => [r.key, r.value])) as unknown as WikiMeta; },
      getPage(type, slug) { return pageQ.get(type, slug) ?? null; },
      getEntity(type, ref) {
        const n = /^\d+$/.test(ref) ? byId.get(type, Number(ref)) : null;
        return n ?? bySlug.get(type, ref) ?? byKey.get(type, ref) ?? byAlias.get(type, ref.toLowerCase().replace(/-/g, ' ')) ?? null;
      },
      search(q, type, limit) {
        const exact = exactHits(q, type, limit);
        const m = ftsQuery(q);
        let hits = m ? runSearch(m, type, limit) : [];
        if (m && !hits.length) { const orQuery = ftsQueryOr(q); if (orQuery) hits = runSearch(orQuery, type, limit); }
        if (!exact.length) return hits;
        const seen = new Set(exact.map(h => `${h.type}/${h.slug}`));
        return [...exact, ...hits.filter(h => !seen.has(`${h.type}/${h.slug}`))].slice(0, limit);
      },
      listType(type) { return listQ.all(type); },
      randomPage() { return randomQ.get() ?? null; },
      areaNames,
      areaName(slug) { return slug ? areaNames.get(slug) ?? null : null; }
    };
  } catch (err) {
    console.warn(`[wiki] failed to open ${path}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
