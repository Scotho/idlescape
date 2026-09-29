import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The owner assertion binds a game socket to the Firebase account that owns the character it
 * will log in as. The relay cannot read the login block (the client RSA-encrypts uid/username/
 * password and only the engine holds the private key), so the binding has to be carried
 * out-of-band and checked inside the engine against the name it decrypts. See the platform
 * spec, decision 13.
 *
 * It travels in an HttpOnly cookie because the 274 client builds its WebSocket URL itself
 * (`new WebSocket(`${protocol}://${host}`, 'binary')`, client/src/io/ClientStream.ts:12) with
 * no query string and no header control -- a cookie is the only channel the browser attaches
 * to that upgrade without patching the client. The relay copies it onto the upstream
 * handshake as X-Idlescape-Owner.
 */
export const OWNER_COOKIE = 'cs_owner';
export const OWNER_ASSERTION_TTL_MS = 43_200_000; // 12 h
export const OWNER_ASSERTION_MAX_ENTRIES = 5;

const VERSION = 'cs1';
const UID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const NAME_RE = /^[a-z0-9_]{1,12}$/;

export interface OwnerAssertion {
  uid: string;
  character: string;
  exp: number;
}

function sign(secret: string, uid: string, character: string, exp: number): string {
  return createHmac('sha256', secret).update(`${VERSION}|${uid}|${character}|${exp}`).digest('base64url');
}

export function signOwnerAssertion(secret: string, a: OwnerAssertion): string {
  // Mirrors verifyOwnerAssertion's empty-secret rule: an entry signed with no secret can never
  // verify, so minting one would only put a dead entry in the cookie (and evict a live one).
  if (secret.length === 0) throw new Error('owner assertion: no secret configured');
  if (!UID_RE.test(a.uid)) throw new Error('owner assertion: bad uid');
  if (!NAME_RE.test(a.character)) throw new Error('owner assertion: bad character');
  return `${a.uid}.${a.character}.${a.exp}.${sign(secret, a.uid, a.character, a.exp)}`;
}

export function verifyOwnerAssertion(secret: string, entry: string, nowMs: number = Date.now()): OwnerAssertion | null {
  // A server with no secret configured must authorise nobody, rather than everybody.
  if (secret.length === 0) return null;
  const parts = entry.split('.');
  if (parts.length !== 4) return null;
  const [uid, character, expText, sig] = parts;
  if (!UID_RE.test(uid) || !NAME_RE.test(character) || sig.length === 0) return null;
  const exp = Number(expText);
  if (!Number.isSafeInteger(exp) || exp <= nowMs) return null;

  const expected = Buffer.from(sign(secret, uid, character, exp));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;
  return { uid, character, exp };
}

export function splitOwnerCookie(value: string | null): string[] {
  if (!value) return [];
  return value.split('~').filter(part => part.length > 0);
}

/**
 * Rebuilds the cookie around one freshly minted assertion: keeps the caller's other live
 * characters (so SP7's several concurrent sessions all stay bound), drops anything expired or
 * unverifiable, replaces the entry for this character, and caps the list oldest-first. An
 * assertion for a different uid means a different account is now signed in on this browser,
 * so the previous list is discarded entirely.
 */
export function buildOwnerCookie(secret: string, previous: string | null, next: OwnerAssertion, nowMs: number = Date.now()): string {
  const kept: string[] = [];
  for (const entry of splitOwnerCookie(previous)) {
    const parsed = verifyOwnerAssertion(secret, entry, nowMs);
    if (!parsed || parsed.uid !== next.uid || parsed.character === next.character) continue;
    kept.push(entry);
  }
  kept.push(signOwnerAssertion(secret, next));
  return kept.slice(Math.max(0, kept.length - OWNER_ASSERTION_MAX_ENTRIES)).join('~');
}

export function ownerCookieHeader(value: string, secure: boolean): string {
  return `${OWNER_COOKIE}=${value}; Path=/; Max-Age=${OWNER_ASSERTION_TTL_MS / 1000}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}
