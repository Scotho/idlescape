import type { Auth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Route } from '../router';
import { AGENT_PREFIX } from '../auth/principal';
import { NotOwnerError, type PairStore } from './store';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_TEMPLATE = readFileSync(path.join(DIR, 'skill.md'), 'utf8');
const HUMAN_TEMPLATE = readFileSync(path.join(DIR, 'human.html'), 'utf8');
const GUIDE_TEMPLATE = readFileSync(path.join(DIR, 'guide.md'), 'utf8');

const EXPIRED_MESSAGE = 'This link has expired. Press "Connect to Claude" again to get a fresh one.';

type PairRoute = Extract<Route, { kind: 'pair' }>;

export interface PairRoutes {
  handle(req: Request, route: PairRoute): Promise<Response>;
}

function substitute(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.split(`{{${k}}}`).join(v), template);
}

function wantsHtml(req: Request): boolean {
  return (req.headers.get('accept') ?? '').includes('text/html');
}

function expiredResponse(html: boolean): Response {
  if (html) {
    const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Link expired</title></head>` +
      `<body><p>${EXPIRED_MESSAGE}</p></body></html>`;
    return new Response(body, { status: 410, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  return new Response(EXPIRED_MESSAGE, { status: 410, headers: { 'content-type': 'text/markdown; charset=utf-8' } });
}

// Minimal markdown -> HTML, deliberately simple: headers, bold, inline code, links, bullet
// lists, and paragraphs. The guide is short and structured; a full markdown engine is not
// worth a dependency for it.
function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inList = false;
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const inline = (s: string) => s
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
    if (line.startsWith('## ')) { closeList(); out.push(`<h2>${inline(line.slice(3))}</h2>`); continue; }
    if (line.startsWith('# ')) { closeList(); out.push(`<h1>${inline(line.slice(2))}</h1>`); continue; }
    if (/^-\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(line.replace(/^-\s+/, '').replace(/^\d+\.\s+/, ''))}</li>`);
      continue;
    }
    closeList();
    if (line === '') continue;
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join('\n');
}

function renderGuideHtml(origin: string): string {
  const body = renderMarkdown(substitute(GUIDE_TEMPLATE, { ORIGIN: origin }));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Connecting Claude</title>` +
    `<style>body{font:16px/1.5 system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;color:#1a1a1a;background:#fdfdfb}` +
    `code{background:#f0efe8;padding:0.1rem 0.35rem;border-radius:3px}a{color:#2c5f2d}</style></head>` +
    `<body>${body}</body></html>`;
}

export function createPairRoutes(opts: { store: PairStore; auth: Auth; origin: string }): PairRoutes {
  const { store, auth, origin } = opts;

  async function verifyBearer(req: Request): Promise<string | null> {
    const header = req.headers.get('authorization') ?? '';
    if (!header.startsWith('Bearer ')) return null;
    try {
      const decoded = await auth.verifyIdToken(header.slice(7));
      return decoded.uid;
    } catch {
      return null;
    }
  }

  async function mint(req: Request): Promise<Response> {
    if (req.method !== 'POST') return new Response(null, { status: 405 });
    const uid = await verifyBearer(req);
    if (!uid) return Response.json({ error: 'missing token' }, { status: 401 });
    const { token, expiresAt } = await store.mint(uid);
    return Response.json({ pairUrl: `${origin}/pair/${token}`, token, expiresAt });
  }

  async function fetchDoc(req: Request, token: string): Promise<Response> {
    if (req.method !== 'GET') return new Response(null, { status: 405 });
    const html = wantsHtml(req);
    const looked = await store.lookup(token);
    if (!looked || looked.usedAt !== null || looked.expired) return expiredResponse(html);
    if (html) return new Response(substitute(HUMAN_TEMPLATE, { ORIGIN: origin }), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    return new Response(substitute(SKILL_TEMPLATE, { ORIGIN: origin, TOKEN: token }), { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
  }

  async function exchange(req: Request, token: string): Promise<Response> {
    if (req.method !== 'POST') return new Response(null, { status: 405 });
    let label: string | undefined;
    try {
      const body = (await req.json()) as { label?: unknown };
      if (typeof body.label === 'string') label = body.label;
    } catch { /* no body */ }
    const result = await store.exchange(token, label);
    if (!result.ok) return Response.json({ error: result.reason }, { status: 410 });
    return Response.json({ agentToken: AGENT_PREFIX + result.agentToken, gatewayUrl: `${origin}/mcp`, gameName: result.gameName });
  }

  async function revoke(req: Request, id: string): Promise<Response> {
    if (req.method !== 'POST') return new Response(null, { status: 405 });
    const uid = await verifyBearer(req);
    if (!uid) return Response.json({ error: 'missing token' }, { status: 401 });
    try {
      await store.revoke(uid, id);
      return new Response(null, { status: 204 });
    } catch (err) {
      if (err instanceof NotOwnerError) return new Response(null, { status: 404 });
      throw err;
    }
  }

  async function guide(req: Request): Promise<Response> {
    if (req.method !== 'GET') return new Response(null, { status: 405 });
    return new Response(renderGuideHtml(origin), { headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  async function handle(req: Request, route: PairRoute): Promise<Response> {
    switch (route.sub) {
      case 'mint': return mint(req);
      case 'fetch': return fetchDoc(req, route.token ?? '');
      case 'exchange': return exchange(req, route.token ?? '');
      case 'revoke': return revoke(req, route.id ?? '');
      case 'guide': return guide(req);
    }
  }

  return { handle };
}
