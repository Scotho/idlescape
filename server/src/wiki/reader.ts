import type { WikiDb } from './db';
import { esc, layout, renderSnippet, TYPE_LABEL } from './layout';

const html = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });

function counts(db: WikiDb): Map<string, number> {
  return new Map((db.raw.query('SELECT type, COUNT(*) n FROM pages GROUP BY type').all() as { type: string; n: number }[]).map(r => [r.type, r.n]));
}

export async function handleWiki(db: WikiDb, url: URL): Promise<Response> {
  const meta = db.meta();
  const parts = url.pathname.split('/').filter(Boolean); // ['wiki', type?, slug?]
  if (parts.length === 1) {
    const c = counts(db);
    const tiles = [...TYPE_LABEL.entries()].filter(([t]) => c.has(t)).map(([t, l]) => `<li><a href="/wiki/${t}">${l} (${c.get(t)})</a></li>`).join('');
    return html(layout({ title: 'Home', counts: c, meta, body: `<h1>idlescape wiki</h1><p>The game as it runs on this server: revision ${esc(meta.revision)}, generated from the Lost City content pack with a source on every fact.</p><ul>${tiles}</ul><p><a href="/api/wiki/schema">API for agents</a></p>` }));
  }
  if (parts[1] === 'search') {
    const q = url.searchParams.get('q')?.trim() ?? '';
    const hits = q ? db.search(q, url.searchParams.get('type') ?? undefined, 40) : [];
    const exact = hits.find(h => h.title.toLowerCase() === q.toLowerCase());
    if (exact) return redirect(`/wiki/${exact.type}/${exact.slug}`);
    const groups = new Map<string, typeof hits>();
    for (const h of hits) (groups.get(h.type) ?? groups.set(h.type, []).get(h.type)!).push(h);
    const body = `<h1>Search: ${esc(q)}</h1>` + (hits.length ? [...groups.entries()].map(([t, hs]) => `<h2>${TYPE_LABEL.get(t) ?? t}</h2><ul>${hs.map(h => `<li><a href="/wiki/${h.type}/${h.slug}">${esc(h.title)}</a> — ${renderSnippet(h.snippet)}</li>`).join('')}</ul>`).join('') : '<p>No pages match.</p>');
    return html(layout({ title: `Search: ${q}`, meta, body }));
  }
  if (parts[1] === 'random') { const r = db.randomPage(); return r ? redirect(`/wiki/${r.type}/${r.slug}`) : html(layout({ title: 'Empty', meta, body: '<p>No pages yet.</p>' }), 404); }
  const type = parts[1]!, slug = parts[2];
  if (!TYPE_LABEL.has(type)) return html(layout({ title: 'Not found', meta, body: '<h1>Not found</h1>' }), 404);
  if (!slug) {
    const rows = db.listType(type);
    // One <ul> per initial letter, opened before any close tag: the old form emitted a stray
    // `</ul>` ahead of the first heading. Titles are game text, so the letter is escaped too.
    let letter = '';
    const parts: string[] = [];
    for (const r of rows) {
      const l = r.title.charAt(0).toUpperCase();
      if (l !== letter) { if (letter) parts.push('</ul>'); parts.push(`<h2 id="${esc(l)}">${esc(l)}</h2><ul>`); letter = l; }
      parts.push(`<li><a href="/wiki/${type}/${r.slug}">${esc(r.title)}</a>${r.members ? '<span class="badge">members</span>' : ''}</li>`);
    }
    if (letter) parts.push('</ul>');
    return html(layout({ title: TYPE_LABEL.get(type)!, meta, body: `<h1>${TYPE_LABEL.get(type)}</h1>${parts.join('')}` }));
  }
  const page = db.getPage(type, slug);
  if (!page) {
    const sugg = db.search(slug.replace(/-/g, ' '), type, 10);
    return html(layout({ title: 'Not found', meta, body: `<h1>No page "${esc(slug)}"</h1>${sugg.length ? `<p>Did you mean:</p><ul>${sugg.map(h => `<li><a href="/wiki/${h.type}/${h.slug}">${esc(h.title)}</a></li>`).join('')}</ul>` : ''}` }), 404);
  }
  const tools = `<p class="foot"><a href="/api/wiki/page/${type}/${slug}?format=json">View as JSON</a> · <a href="/api/wiki/page/${type}/${slug}">View as Markdown</a></p>`;
  return html(layout({ title: page.title, meta, body: page.html + tools }));
}
