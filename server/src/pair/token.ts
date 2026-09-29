import { createHash, randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

export function randomToken(len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function expiryFrom(nowMs: number, ttlMs: number): number {
  return nowMs + ttlMs;
}
