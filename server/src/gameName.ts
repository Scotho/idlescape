import { randomInt } from 'node:crypto';

export const GAME_NAME_MAX = 12;
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const LOWER_ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function normaliseGameName(input: string): string | null {
  const cleaned = input
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, GAME_NAME_MAX);
  if (!/^[a-z][a-z0-9_]*$/.test(cleaned)) return null;
  return cleaned;
}

export function withSuffix(base: string, attempt: number): string {
  const suffix = String(attempt);
  return base.slice(0, GAME_NAME_MAX - suffix.length) + suffix;
}

function pick(alphabet: string, n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

export function randomGuestName(): string {
  return `guest_${pick(LOWER_ALNUM, 6)}`;
}

export function randomSecret(len: number = 20): string {
  return pick(ALNUM, len);
}
