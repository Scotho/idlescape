import { SNIPPET_CLOSE, SNIPPET_OPEN } from './db';

const TYPES: [string, string][] = [['item', 'Items'], ['npc', 'NPCs and monsters'], ['loc', 'Scenery'], ['quest', 'Quests'], ['skill', 'Skills'], ['shop', 'Shops'], ['area', 'Areas'], ['mechanic', 'Mechanics'], ['guide', 'Guides']];
export const TYPE_LABEL = new Map(TYPES);

export function esc(s: string): string { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!); }

/**
 * FTS snippet() text: HTML-escape it as plain text first (the matched game text is not
 * HTML-safe - it can itself contain `<`, `>`, `&`), then turn the private-use sentinel
 * characters (never produced by `esc`, since they aren't in its escape set) into the real
 * `<b>`/`</b>` highlight tags. This is the only safe way to render a `.snippet` value.
 */
export function renderSnippet(s: string): string {
  return esc(s).split(SNIPPET_OPEN).join('<b>').split(SNIPPET_CLOSE).join('</b>');
}

const CSS = `
:root{--win:#1b1b1b;--darker:#1e1e1e;--panel:#282828;--border:#151515;--muted:#808080;--text:#a0a0a0;--strong:#e0e0e0;--orange:#ff981f}
*{box-sizing:border-box}body{margin:0;background:var(--win);color:var(--text);font:14px/1.5 system-ui,Segoe UI,sans-serif}
a{color:var(--orange);text-decoration:none}a:hover{text-decoration:underline}
.top{display:flex;gap:16px;align-items:center;padding:8px 16px;background:var(--darker);border-bottom:1px solid var(--border)}
.top .brand{color:var(--orange);font-weight:700;letter-spacing:.04em}.top form{margin-left:auto}.top input{background:var(--panel);border:1px solid var(--border);color:var(--strong);padding:6px 8px;width:280px}
.wrap{display:grid;grid-template-columns:200px minmax(0,760px) 300px;gap:24px;max-width:1320px;margin:0 auto;padding:16px}
.rail{font-size:13px}.rail a{display:block;padding:2px 0;color:var(--text)}.rail a:hover{color:var(--orange)}
article h1{color:var(--strong);margin:0 0 8px;font-size:26px}article h2{color:var(--strong);font-size:18px;border-bottom:1px solid var(--border);margin-top:24px}
article table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}article td,article th{border:1px solid var(--border);padding:4px 8px;background:var(--panel);text-align:left}
article table:first-of-type{float:right;width:300px;margin:0 0 12px 16px}article em{color:var(--muted)}article code{background:var(--panel);padding:1px 4px}
article > p:first-of-type strong{color:var(--strong)}.foot{clear:both;font-size:12px;color:var(--muted);margin-top:32px}
.badge{display:inline-block;background:var(--panel);color:var(--muted);font-size:11px;padding:1px 6px;border-radius:3px;margin-left:6px}
@media (max-width:900px){.wrap{grid-template-columns:1fr}.rail{display:flex;flex-wrap:wrap;gap:12px}article table:first-of-type{float:none;width:100%;margin:0 0 12px}}
@media print{.top,.rail{display:none}.wrap{display:block}}
`;

export function layout(opts: { title: string; body: string; counts?: Map<string, number>; meta?: { revision: string; contentSha: string } }): string {
  const nav = TYPES.map(([t, label]) => `<a href="/wiki/${t}">${label}${opts.counts?.has(t) ? ` (${opts.counts.get(t)})` : ''}</a>`).join('');
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.title)} · idlescape wiki</title><style>${CSS}</style></head>
<body><header class="top"><a class="brand" href="/wiki">idlescape wiki</a><a href="/" title="Back to the game">game</a><a href="/wiki/random">random</a>
<form action="/wiki/search" method="get"><input type="search" name="q" placeholder="Search the wiki" aria-label="Search"></form></header>
<div class="wrap"><nav class="rail">${nav}</nav><main><article>${opts.body}</article>
<p class="foot">Game text and data are © Jagex Ltd, preserved by the Lost City project. Editorial text and code are MIT. ${opts.meta ? `Revision ${esc(opts.meta.revision)} · Content ${esc(opts.meta.contentSha.slice(0, 8))}` : ''}</p></main><aside></aside></div></body></html>`;
}
