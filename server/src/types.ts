// HTTP archive path prefixes the 274 client fetches (each CRC-suffixed by the
// engine, e.g. /title123456789). Models/anims/maps/music are NOT in this list:
// revision 274 streams those over the OnDemand websocket instead of HTTP.
export const CACHE_PREFIXES: readonly string[] = [
  '/crc',
  '/title',
  '/config',
  '/interface',
  '/media',
  '/versionlist',
  '/textures',
  '/wordenc',
  '/sounds'
];

export interface Env {
  port: number;
  engineHttp: string;
  engineWs: string;
  engineManagementHttp: string;
  engineManagementSecret: string;
  ownerAssertionSecret: string;
  firebaseProjectId: string;
  googleCredentialsPath: string;
  firebaseEmulators: boolean;
  publicOrigin: string;
  webDist: string;
  clientOut: string;
  enginePublic: string;
  wikiDb: string;
}

export interface HealthSnapshot {
  engine: 'up' | 'down';
  engineUptimeMs: number;
  version: string;
  gateway: 'up' | 'down' | 'not_deployed';
  players: number | null;
  wiki: 'up' | 'missing';
  /**
   * The engine overlay, answering on its own secret-gated route (audit C07, decision D75).
   * `up` proves three things at once: the running image carries engine-custom, ENGINE_MANAGEMENT_HTTP
   * reaches the engine, and both halves hold the same ENGINE_MANAGEMENT_SECRET. `unauthorized` is a
   * 401 (different secrets) or a 404 (an engine that started without one, so the route was never
   * registered). `unconfigured` means THIS server has no secret, which is a working local stack.
   * This response is public, so the value carries a status word and never a secret.
   */
  management: 'up' | 'unauthorized' | 'unconfigured' | 'down';
}

export interface BridgeResponse {
  gameName: string;
  secret: string;
}

export interface GameAccountDoc {
  gameName: string;
  secret: string;
  createdAt: number;
}

export interface CharacterDoc {
  uid: string;
  gameName: string;
  secret: string;
  createdAt: number;
  lastLoginAt: number | null;
  deletedAt: number | null;
}

export interface CharacterSummary {
  id: string;
  gameName: string;
  createdAt: number;
  lastLoginAt: number | null;
}

export type CharacterError = 'limit' | 'taken' | 'invalid' | 'not_found' | 'deleted';

export const CHARACTER_LIMITS = { anonymous: 2, password: 3 } as const;

// --- Shared bank (SP8) -------------------------------------------------------
// The overlay owns the real bank; these shapes mirror engine-custom/src/idlescape's
// management payloads verbatim so the front server never reinterprets them.
export interface BankSlot { slot: number; obj: number; count: number }
export interface BankSnapshot { ownerKey: string; version: number; capacity: number; tabs: number[]; slots: BankSlot[] }
export type BankOp =
  | { op: 'delta'; obj: number; count: number }
  | { op: 'swap'; a: number; b: number }
  | { op: 'insert'; from: number; to: number }
  | { op: 'moveToTab'; slot: number; tab: number }
  | { op: 'setTabs'; sizes: number[] }
  | { op: 'sort'; tab: number; by: 'value' | 'name' | 'id' };
// Everything a browser may ask for. 'delta' is deliberately absent: only server-side
// callers (SP9 Contracts) may change what the bank contains.
export const BANK_LAYOUT_OPS = ['swap', 'insert', 'moveToTab', 'setTabs', 'sort'] as const;
