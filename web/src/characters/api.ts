import type { CharacterSummary } from '../types';

const JSON_HEADERS = { 'content-type': 'application/json' };

/**
 * Server error codes (`{ error }` from `/api/characters`) rendered as player-facing copy. Shared
 * by every surface that calls these routes -- the pre-game gate and the in-game Characters
 * panel -- so neither of them ever shows a player a raw code like `limit`.
 */
const FRIENDLY: Record<string, string> = {
  taken: 'That name is taken.',
  invalid: 'Names are 1-12 letters, digits or underscores and start with a letter.',
  limit: 'You have reached your character limit.',
  reauth: 'Please re-enter your password.',
  confirm: 'The confirmation phrase did not match.',
  not_found: 'That character no longer exists.',
  deleted: 'That character has been deleted.'
};

const GENERIC_ERROR = 'Something went wrong. Try again.';

/** Player-facing copy for a server error code; anything unrecognised (a 500, an offline fetch
 * rejection, a future code) becomes a generic message rather than leaking the raw string. */
export function friendlyCharacterError(code: string): string {
  return FRIENDLY[code] ?? GENERIC_ERROR;
}

async function call<T>(idToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...init, headers: { ...JSON_HEADERS, ...(init.headers ?? {}), authorization: `Bearer ${idToken}` }, credentials: 'same-origin' });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(body.error ?? `characters ${res.status}`);
  return body;
}

/** The listing carries the account's character limit; it is the server's number, never ours. */
export function listCharacters(idToken: string): Promise<{ characters: CharacterSummary[]; limit: number }> {
  return call(idToken, '/api/characters');
}
export function checkName(idToken: string, name: string): Promise<{ ok: true; gameName: string } | { ok: false; error: 'invalid' | 'taken' }> {
  return call(idToken, `/api/characters/check?name=${encodeURIComponent(name)}`);
}
export function createCharacter(idToken: string, desiredName?: string): Promise<CharacterSummary> {
  return call(idToken, '/api/characters', { method: 'POST', body: JSON.stringify(desiredName ? { desiredName } : {}) });
}
export function mintSession(idToken: string, id: string): Promise<{ gameName: string; secret: string }> {
  return call(idToken, `/api/characters/${id}/session`, { method: 'POST' });
}
export function deleteCharacter(idToken: string, id: string, confirm: string): Promise<void> {
  return call(idToken, `/api/characters/${id}`, { method: 'DELETE', body: JSON.stringify({ confirm }) });
}
