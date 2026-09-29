import { OWNER_ASSERTION_TTL_MS, OWNER_COOKIE, buildOwnerCookie, ownerCookieHeader } from '../auth/ownerAssertion';
import type { Principal } from '../auth/principal';
import { readCookie } from '../cookies';
import type { Route } from '../router';
import { CHARACTER_LIMITS } from '../types';
import { CharacterStoreError, type CharacterStore } from './store';

const REAUTH_WINDOW_MS = 300_000;
type CharRoute = Route & { kind: 'characters' };

function statusFor(code: string): number {
  switch (code) {
    case 'not_found': return 404;
    case 'deleted': return 410;
    case 'limit': case 'taken': case 'invalid': return 409;
    default: return 500;
  }
}

async function bodyOf(req: Request): Promise<Record<string, unknown>> {
  try { return (await req.json()) as Record<string, unknown>; } catch { return {}; }
}

export function createCharacterRoutes(deps: { store: CharacterStore; ownerSecret: string; secureCookies: boolean }) {
  const { store, ownerSecret, secureCookies } = deps;
  return {
    async handle(req: Request, route: CharRoute, principal: Principal & { kind: 'human' }): Promise<Response> {
      const sub = route.sub === 'list' && req.method === 'POST' ? 'create' : route.sub;
      try {
        switch (sub) {
          case 'list': {
            if (req.method !== 'GET') return new Response(null, { status: 405 });
            // The limit rides along with the listing so the shell never has to hard-code (and
            // drift from) the per-tier numbers: the server is the only source of truth.
            const limit = CHARACTER_LIMITS[principal.isAnonymous ? 'anonymous' : 'password'];
            return Response.json({ characters: await store.list(principal.uid), limit });
          }
          case 'check': {
            const name = new URL(req.url).searchParams.get('name') ?? '';
            return Response.json(await store.check(name));
          }
          case 'create': {
            const body = await bodyOf(req);
            const desired = typeof body.desiredName === 'string' ? body.desiredName : null;
            const created = await store.create(principal.uid, principal.isAnonymous, desired);
            return Response.json(created, { status: 201 });
          }
          case 'session': {
            if (req.method !== 'POST') return new Response(null, { status: 405 });
            const minted = await store.session(principal.uid, route.id!);
            // The credentials the client logs in with, plus the owner assertion the relay will
            // put on the upstream handshake so the engine can bind this socket to the account.
            const headers: Record<string, string> = { 'content-type': 'application/json' };
            if (ownerSecret !== '') {
              const cookie = buildOwnerCookie(ownerSecret, readCookie(req, OWNER_COOKIE), {
                uid: principal.uid,
                character: minted.gameName,
                exp: Date.now() + OWNER_ASSERTION_TTL_MS
              });
              headers['set-cookie'] = ownerCookieHeader(cookie, secureCookies);
            }
            return new Response(JSON.stringify(minted), { headers });
          }
          case 'delete': {
            if (req.method !== 'DELETE') return new Response(null, { status: 405 });
            if (!principal.isAnonymous && Date.now() - principal.authTime > REAUTH_WINDOW_MS) return Response.json({ error: 'reauth' }, { status: 403 });
            const target = await store.get(principal.uid, route.id!);
            const body = await bodyOf(req);
            if (body.confirm !== `delete ${target.gameName}`) return Response.json({ error: 'confirm' }, { status: 400 });
            await store.softDelete(principal.uid, route.id!);
            return new Response(null, { status: 204 });
          }
        }
      } catch (err) {
        if (err instanceof CharacterStoreError) return Response.json({ error: err.code }, { status: statusFor(err.code) });
        console.error('[characters]', err);
        return Response.json({ error: 'characters failed' }, { status: 500 });
      }
      return new Response('Not found', { status: 404 });
    }
  };
}
