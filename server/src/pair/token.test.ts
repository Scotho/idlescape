import { describe, expect, test } from 'bun:test';
import { expiryFrom, hashToken, randomToken } from './token';

describe('pair token', () => {
  test('randomToken length and alphabet', () => {
    const t = randomToken(32);
    expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(randomToken(40)).toMatch(/^[A-Za-z0-9_-]{40}$/);
    expect(randomToken(32)).not.toBe(randomToken(32));
  });
  test('hashToken is a stable 64-hex sha256, not the token', () => {
    const h = hashToken('abc');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(hashToken('abc'));
    expect(h).not.toContain('abc');
  });
  test('expiryFrom adds the ttl', () => {
    expect(expiryFrom(1000, 15 * 60 * 1000)).toBe(1000 + 900000);
  });
});
