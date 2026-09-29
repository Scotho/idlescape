import { describe, expect, test } from 'bun:test';
import { readCookie } from './cookies';

const withCookie = (cookie: string | null) => new Request('http://x/', { headers: cookie ? { cookie } : {} });

describe('readCookie', () => {
  test('finds a cookie among others and keeps any = inside its value', () => {
    expect(readCookie(withCookie('a=1; cs_owner=x=y; b=2'), 'cs_owner')).toBe('x=y');
  });
  test('answers null with no cookie header or no such cookie', () => {
    expect(readCookie(withCookie(null), 'cs_owner')).toBeNull();
    expect(readCookie(withCookie('a=1'), 'cs_owner')).toBeNull();
  });
});
