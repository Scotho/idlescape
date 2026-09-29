import type { Env } from './types';

function str(src: Record<string, string | undefined>, key: string, fallback?: string): string {
  const v = src[key];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`${key} is required`);
  }
  return v;
}

function bool(src: Record<string, string | undefined>, key: string, fallback: boolean): boolean {
  const v = src[key];
  if (v === undefined || v === '') return fallback;
  if (v === 'true') return true;
  if (v === 'false') return false;
  throw new Error(`${key} must be true or false`);
}

function int(src: Record<string, string | undefined>, key: string, fallback: number): number {
  const v = src[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${key} must be a positive integer`);
  return n;
}

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const engineManagementSecret = source.ENGINE_MANAGEMENT_SECRET ?? '';
  // Same bar as the owner secret: a short shared secret on a route that can move a player's
  // bank is worse than no route at all, so refuse it at boot.
  if (engineManagementSecret !== '' && engineManagementSecret.length < 32) {
    throw new Error('ENGINE_MANAGEMENT_SECRET must be at least 32 characters');
  }
  const ownerAssertionSecret = source.OWNER_ASSERTION_SECRET ?? '';
  // A production front server that cannot sign owner assertions would hand out sessions the
  // engine must then refuse; fail at boot instead of at login.
  if (ownerAssertionSecret !== '' && ownerAssertionSecret.length < 32) {
    throw new Error('OWNER_ASSERTION_SECRET must be at least 32 characters');
  }
  return {
    port: int(source, 'PORT', 8787),
    // 8899 is the 274 dev engine (`npx tsx src/app.ts` in engine/server). 8888 is the retired 225
    // proof of concept that still runs on this machine, and pointing a dev front server at it
    // gives a shell talking a protocol the client no longer speaks (audit C17). The deployed stack
    // overrides both from docker-compose.yml regardless.
    engineHttp: str(source, 'ENGINE_HTTP', 'http://127.0.0.1:8899'),
    engineWs: str(source, 'ENGINE_WS', 'ws://127.0.0.1:8899'),
    engineManagementHttp: str(source, 'ENGINE_MANAGEMENT_HTTP', 'http://127.0.0.1:8897'),
    // Shared with the engine overlay, which reads the same key. Empty is allowed: a local
    // stack with no secret simply has no reachable bank management port.
    engineManagementSecret,
    ownerAssertionSecret,
    firebaseProjectId: str(source, 'FIREBASE_PROJECT_ID', 'idlescape-osrs'),
    googleCredentialsPath: str(source, 'GOOGLE_APPLICATION_CREDENTIALS', './secrets/firebase-admin.json'),
    firebaseEmulators: bool(source, 'FIREBASE_EMULATORS', false),
    publicOrigin: str(source, 'PUBLIC_ORIGIN', 'http://localhost:8787'),
    webDist: str(source, 'WEB_DIST', '../web/dist'),
    clientOut: str(source, 'CLIENT_OUT', '../client/out'),
    enginePublic: str(source, 'ENGINE_PUBLIC', '../engine/server/public'),
    wikiDb: str(source, 'WIKI_DB', '../wiki/build/wiki.db')
  };
}
