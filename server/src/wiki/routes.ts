import { createHash } from 'node:crypto';
import { handleWikiApi, headersFor } from './api';
import { createRateLimiter } from './rateLimit';
import type { WikiDb } from './db';
import type { WikiAuth } from './auth';
import { handleWiki } from './reader';

const RATE_LIMIT = 120;
const WINDOW_MS = 60_000;

function credentialOf(req: Request): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '');
  return m ? `bearer:${m[1]}` : null;
}

export function createWikiRoutes(deps: { db: () => WikiDb | null; auth: WikiAuth; nowFn?: () => number }) {
  // One bucket of recent-request timestamps per SHA-256 of the credential (the bearer token, else
  // the client IP) - never the raw credential itself. nowFn is
  // injectable so tests can drive the sliding window and idle-credential sweep with a fake clock.
  const limiter = createRateLimiter({ limit: RATE_LIMIT, windowMs: WINDOW_MS, now: deps.nowFn ?? Date.now });

  // The wiki is public, so an allowed request usually carries no credential at all. Falling back to
  // the client IP keeps such requests inside a bucket instead of handing them an unlimited API.
  function rateLimited(req: Request, ip: string | undefined): boolean {
    const credential = credentialOf(req) ?? (ip ? `ip:${ip}` : null);
    if (!credential) return false;
    return limiter.hit(createHash('sha256').update(credential).digest('hex'));
  }

  return {
    async handle(kind: 'wiki' | 'wikiApi', req: Request, url: URL, ip?: string): Promise<Response> {
      if (!(await deps.auth.allowed(req, kind))) return kind === 'wiki' ? new Response(null, { status: 302, headers: { location: '/' } }) : Response.json({ error: 'unauthorized' }, { status: 401 });
      const db = deps.db();
      if (kind === 'wikiApi' && rateLimited(req, ip)) return Response.json({ error: 'rate_limited' }, { status: 429, headers: db ? headersFor(db) : {} });
      if (!db) return kind === 'wiki' ? new Response('wiki not built: run bun run --cwd wiki build', { status: 503 }) : Response.json({ error: 'wiki_missing' }, { status: 503 });
      return kind === 'wiki' ? handleWiki(db, url) : handleWikiApi(db, url, req);
    }
  };
}
