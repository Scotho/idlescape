// The scoped-key module audit C10 exists for: the key shape, enumeration that cannot see another
// principal, and the one-time migration of the pre-C10 bare keys into the signed-out bucket.
// `web/src/test/setupDom.ts` runs once per file and does not touch localStorage, so this file
// clears it itself or it inherits keys from whatever ran above it.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { migrateBareKeys, readScoped, scopedIds, scopedKey, scopePrefix, writeScoped } from './scoped';

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

test('a signed-in principal and a signed-out one get different keys', () => {
  expect(scopedKey('plugin', 'abc123', 'loot')).toBe('cs.plugin.u.abc123.loot');
  expect(scopedKey('plugin', null, 'loot')).toBe('cs.plugin.anon.loot');
  expect(scopedKey('script', 'abc123', 'chop-and-drop')).toBe('cs.script.u.abc123.chop-and-drop');
  expect(scopePrefix('script', null)).toBe('cs.script.anon.');
});

test('every key keeps the cs. prefix', () => {
  for (const key of [scopedKey('plugin', 'u1', 'x'), scopedKey('script', null, 'y')]) {
    expect(key.startsWith('cs.')).toBe(true);
  }
});

test('enumeration sees one principal and never another', () => {
  writeScoped('plugin', 'userA', 'loot', '{"enabled":false,"settings":{}}');
  writeScoped('plugin', 'userB', 'xp', '{"enabled":true,"settings":{}}');
  writeScoped('plugin', null, 'notes', '{"enabled":true,"settings":{}}');
  expect(scopedIds('plugin', 'userA')).toEqual(['loot']);
  expect(scopedIds('plugin', 'userB')).toEqual(['xp']);
  expect(scopedIds('plugin', null)).toEqual(['notes']);
});

test('a foreign namespace is never adopted', () => {
  localStorage.setItem('cs.other.u.userA.loot', 'x');
  localStorage.setItem('cs.pl.loot.k', 'x');
  expect(scopedIds('plugin', 'userA')).toEqual([]);
});

test('the pre-C10 bare keys move into the anon bucket and nowhere else', () => {
  localStorage.setItem('cs.plugin.loot', '{"enabled":false,"settings":{}}');
  localStorage.setItem('cs.script.chop-and-drop', 'false');
  expect(migrateBareKeys('plugin')).toBe(1);
  expect(migrateBareKeys('script')).toBe(1);
  expect(localStorage.getItem('cs.plugin.loot')).toBeNull();
  expect(localStorage.getItem('cs.script.chop-and-drop')).toBeNull();
  expect(readScoped('plugin', null, 'loot')).toBe('{"enabled":false,"settings":{}}');
  expect(readScoped('script', null, 'chop-and-drop')).toBe('false');
  // The rule that matters: no account inherits them.
  expect(readScoped('plugin', 'userA', 'loot')).toBeNull();
  expect(scopedIds('script', 'userA')).toEqual([]);
});

test('the migration leaves already-scoped keys alone and is idempotent', () => {
  writeScoped('plugin', 'userA', 'xp', 'kept');
  localStorage.setItem('cs.plugin.loot', 'moved');
  expect(migrateBareKeys('plugin')).toBe(1);
  expect(migrateBareKeys('plugin')).toBe(0);
  expect(readScoped('plugin', 'userA', 'xp')).toBe('kept');
  expect(readScoped('plugin', null, 'loot')).toBe('moved');
});

test('a bare key never overwrites a value the anon bucket already holds', () => {
  writeScoped('plugin', null, 'loot', 'newer');
  localStorage.setItem('cs.plugin.loot', 'older');
  expect(migrateBareKeys('plugin')).toBe(0);
  expect(readScoped('plugin', null, 'loot')).toBe('newer');
  expect(localStorage.getItem('cs.plugin.loot')).toBeNull();
});

test('blocked storage returns zero rather than throwing at boot', () => {
  localStorage.setItem('cs.plugin.loot', 'x');
  vi.spyOn(Storage.prototype, 'key').mockImplementation(() => { throw new Error('blocked'); });
  expect(() => migrateBareKeys('plugin')).not.toThrow();
  expect(migrateBareKeys('plugin')).toBe(0);
  expect(scopedIds('plugin', null)).toEqual([]);
});
