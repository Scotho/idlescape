// The merge is the whole feature, so it is tested on its own, before any of the plumbing that
// carries its result into the Worker.
import { expect, test } from 'vitest';
import { DEFAULT_BEHAVIOUR, resolvePolicy } from './behaviour';

const player = { onDeath: 'logout' as const, onStuck: 'stop' as const, maxRelogins: 0 };

test('with no script policy the player settings win', () => {
  expect(resolvePolicy(undefined, player)).toMatchObject({ onDeath: 'logout', onStuck: 'stop', maxRelogins: 0 });
});

test('a script that declares a policy keeps it, field by field', () => {
  const merged = resolvePolicy({ onDeath: 'fail', noProgressMs: 5000 }, player);
  expect(merged.onDeath).toBe('fail');
  // Fields the script did not declare still follow the player.
  expect(merged.onStuck).toBe('stop');
  expect(merged.maxRelogins).toBe(0);
  expect(merged.noProgressMs).toBe(5000);
});

test('with neither, the built-in defaults apply and loot is the death default', () => {
  expect(resolvePolicy(undefined, DEFAULT_BEHAVIOUR)).toMatchObject({ onDeath: 'loot', onStuck: 'pause', maxRelogins: 2 });
});

test('an unknown stored value falls back to the default rather than reaching the ladder', () => {
  // The one that earns its keep: settings come out of Firestore and localStorage, both of which
  // can hold anything a previous build wrote, and the ladder switches on these by name.
  expect(resolvePolicy(undefined, { ...DEFAULT_BEHAVIOUR, onDeath: 'nonsense' as never }).onDeath).toBe('loot');
  expect(resolvePolicy(undefined, { ...DEFAULT_BEHAVIOUR, onStuck: 'nonsense' as never }).onStuck).toBe('pause');
});

test('maxRelogins is clamped to its declared range', () => {
  expect(resolvePolicy(undefined, { ...DEFAULT_BEHAVIOUR, maxRelogins: 99 }).maxRelogins).toBe(5);
  expect(resolvePolicy(undefined, { ...DEFAULT_BEHAVIOUR, maxRelogins: -1 }).maxRelogins).toBe(0);
  // Storage is JSON, so a number is only a number until someone writes a string into it.
  expect(resolvePolicy(undefined, { ...DEFAULT_BEHAVIOUR, maxRelogins: '3' as never }).maxRelogins).toBe(2);
});

test('a script declaring nonsense falls back to the player, not to the built-in default', () => {
  // A user script is compiled from whatever the player typed, so it can declare junk too. The
  // player's own answer is the better fallback: they said what they wanted.
  const merged = resolvePolicy({ onDeath: 'explode' as never, maxRelogins: 99 }, player);
  expect(merged.onDeath).toBe('logout');
  expect(merged.maxRelogins).toBe(5);
});
