import { loadEnv } from './env';
import { createHealth } from './health';
import { classify, principalRule, type Route } from './router';
import { serveStatic } from './static';
import { proxyHttp } from './proxy/http';
import { OWNER_HEADER, openUpstream, ownerHeaderFor, relayHandlers, type RelayData, type UpstreamHandle } from './proxy/ws';
import { initAdmin } from './firebaseAdmin';
import { createPairStore } from './pair/store';
import { createPairRoutes } from './pair/routes';
import { createAuthenticator, type Principal } from './auth/principal';
import { createCharacterStore } from './characters/store';
import { createCharacterRoutes } from './characters/routes';
import { createManagementClient } from './engine/managementClient';
import { createBankRoutes } from './bank/routes';
import { openWikiDb } from './wiki/db';
import { createWikiAuth } from './wiki/auth';
import { createWikiRoutes } from './wiki/routes';
import { withAccessLog } from './log';
import type { Server } from 'bun';

const env = loadEnv();
let wikiDb = openWikiDb(env.wikiDb);
setInterval(() => { if (!wikiDb) wikiDb = openWikiDb(env.wikiDb); }, 30_000); // picks up a build that lands after boot
const health = createHealth({ engineHttp: env.engineHttp, engineManagementHttp: env.engineManagementHttp, engineManagementSecret: env.engineManagementSecret, intervalMs: 10_000, wikiUp: () => wikiDb !== null });
health.start();
const admin = initAdmin(env);
const characterStore = createCharacterStore(admin);
// The exchange tells Claude which character the account plays; characters live in
// characters/{id} now, not in the retired gameAccounts/{uid}.
const pairStore = createPairStore(admin.db, async uid => (await characterStore.list(uid))[0]?.gameName ?? null);
const pairRoutes = createPairRoutes({ store: pairStore, auth: admin.auth, origin: env.publicOrigin });
const authn = createAuthenticator(admin);
// One shared bank per account, owned by the engine overlay; the front server only reads it
// and forwards layout ops (see server/src/bank/routes.ts).
const managementClient = createManagementClient({ baseUrl: env.engineManagementHttp, secret: env.engineManagementSecret });
const bankRoutes = createBankRoutes({ client: managementClient, secret: env.engineManagementSecret });
const characterRoutes = createCharacterRoutes({ store: characterStore, ownerSecret: env.ownerAssertionSecret, secureCookies: env.publicOrigin.startsWith('https:') });
const wiki = createWikiRoutes({ db: () => wikiDb, auth: createWikiAuth() });

function clientIp(req: Request, server: { requestIP(req: Request): { address: string } | null }): string {
  return req.headers.get('cf-connecting-ip') ?? server.requestIP(req)?.address ?? '0.0.0.0';
}

// Every branch here answers with a Response except the websocket upgrade, which returns
// undefined because Bun's handler takes the socket over. It is a function rather than the body
// of `fetch` so that one place can time and log the answer instead of sixteen return sites
// (audit C07).
async function handleRequest(req: Request, srv: Server<RelayData>, url: URL, route: Route): Promise<Response | undefined> {
  switch (route.kind) {
    case 'health': return Response.json(health.snapshot());
    // The engine posts this from loopback (local) or the compose bridge (deployed) and holds no
    // Firebase identity. The SOCKET address is what gets checked -- never
    // clientIp(), whose cf-connecting-ip preference is set by the caller and would let
    // anyone claim to be 127.0.0.1.
    case 'bankHook':
      return req.method === 'POST' ? bankRoutes.handleHook(req, srv.requestIP(req)?.address ?? '') : new Response(null, { status: 405 });
    case 'index':
    case 'static':
      return serveStatic(env, route);
    case 'pair':
      // mint/fetch/exchange/revoke run their own auth; 'guide' (/connect) is a plain page and
      // falls through to the principal check below, which it passes with rule 'none'.
      if (route.sub !== 'guide') return pairRoutes.handle(req, route);
      break;
    case 'wiki':
    case 'wikiApi':
      // The wiki is public; its routes rate-limit the API themselves (per bearer token, else
      // per client IP), so they answer before the principal check below.
      return wiki.handle(route.kind, req, url, clientIp(req, srv));
    default: break;
  }
  const rule = principalRule(route);
  let principal: Principal | null = null;
  if (rule !== 'none') {
    principal = await authn.authenticate(req);
    if (!principal) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (rule === 'human' && principal.kind !== 'human') return Response.json({ error: 'human_only' }, { status: 403 });
    if (rule === 'agent' && principal.kind !== 'agent') return Response.json({ error: 'agent_only' }, { status: 403 });
  }
  switch (route.kind) {
    case 'characters': return characterRoutes.handle(req, route, principal as Principal & { kind: 'human' });
    case 'bank': return bankRoutes.handle(req, route, principal as Principal);
    case 'client':
    case 'page': return serveStatic(env, route);
    case 'cache': return health.snapshot().engine === 'up' ? proxyHttp(env, req) : new Response('world offline', { status: 503 });
    case 'pair': return pairRoutes.handle(req, route);
    case 'ws': {
      if (health.snapshot().engine !== 'up') return new Response('world offline', { status: 503 });
      // Forward OUR stable public origin onto the upstream handshake, not the browser's
      // Origin header. The 274 engine's web.allowedOrigin check is an exact match against
      // whatever Origin arrives on the connection; in vite dev the browser sits on
      // :5173 while the engine's allowedOrigin is configured for the front server's own
      // origin (dev default http://localhost:8787, prod https://osrs.scotho.com), so
      // relaying the browser's Origin verbatim would fail that check whenever the browser
      // isn't already on the front server's port. Presenting env.publicOrigin instead
      // tells the engine "this connection came via our front server" regardless of which
      // port the browser is actually on -- the relay and the owner assertion below already own
      // real access control, so this doesn't weaken anything.
      const origin = env.publicOrigin;
      // Promote the owner-assertion cookie to a handshake header. The engine verifies it
      // against the RSA-decrypted login name; an absent header is a login the engine will
      // refuse whenever it is configured to require one.
      const ownerHeader = ownerHeaderFor(req);
      let handle: UpstreamHandle;
      try {
        handle = await openUpstream(env.engineWs, { origin, headers: ownerHeader ? { [OWNER_HEADER]: ownerHeader } : {} });
      } catch { return new Response('engine unreachable', { status: 502 }); }
      const { upstream, early } = handle;
      const ok = srv.upgrade(req, { data: { upstream, pending: [], early }, headers: { 'sec-websocket-protocol': 'binary' } });
      if (ok) return undefined;
      upstream.close();
      return new Response('upgrade failed', { status: 400 });
    }
    default: return new Response('Not found', { status: 404 });
  }
}

const server = Bun.serve<RelayData>({
  port: env.port,
  fetch(req, srv) {
    const url = new URL(req.url);
    const isUpgrade = req.headers.get('upgrade')?.toLowerCase() === 'websocket';
    const route = classify(url.pathname, isUpgrade);
    // The timing, the quiet-kind decision and the path scrub live in log.ts, where a test can
    // reach them; nothing imports this module, which opens a port at module scope.
    return withAccessLog(req, route.kind, line => console.log(line), () => handleRequest(req, srv, url, route));
  },
  websocket: relayHandlers
});

console.log(`[idlescape] front server on http://localhost:${server.port} -> engine ${env.engineHttp}`);
