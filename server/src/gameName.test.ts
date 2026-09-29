import { describe, expect, test } from 'bun:test';
import { normaliseGameName, randomGuestName, randomSecret, withSuffix } from './gameName';

describe('normaliseGameName', () => {
  test('lowercases and keeps valid names', () => {
    expect(normaliseGameName('Bob_7')).toBe('bob_7');
  });
  test('replaces spaces and hyphens with underscores', () => {
    expect(normaliseGameName('Old Man-Jenkins')).toBe('old_man_jenk');
  });
  test('strips invalid characters', () => {
    expect(normaliseGameName('b0b!!@#')).toBe('b0b');
  });
  test('truncates to 12', () => {
    expect(normaliseGameName('abcdefghijklmnop')).toBe('abcdefghijkl');
  });
  test('rejects names not starting with a letter or empty after cleaning', () => {
    expect(normaliseGameName('123abc')).toBeNull();
    expect(normaliseGameName('___')).toBeNull();
    expect(normaliseGameName('')).toBeNull();
  });
});

describe('withSuffix', () => {
  test('keeps total length within 12', () => {
    expect(withSuffix('abcdefghijkl', 7)).toBe('abcdefghijk7');
    expect(withSuffix('bob', 42)).toBe('bob42');
  });
});

describe('randomGuestName', () => {
  test('is guest_ plus six lowercase alphanumerics', () => {
    expect(randomGuestName()).toMatch(/^guest_[a-z0-9]{6}$/);
  });
});

describe('randomSecret', () => {
  test('is 20 alphanumerics by default and differs between calls', () => {
    const a = randomSecret();
    expect(a).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(randomSecret()).not.toBe(a);
  });
});
