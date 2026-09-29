// P8's one wrapper, tested against the shape the client actually validates: an
// `interactGroundItem` action with an option ordinal between 1 and 5 (Client.ts:1282).
import { describe, expect, test } from 'vitest';
import { createBotExtras } from './botExtras';
import type { BotAction, WorldState } from '../agent/types';
import type { GroundItem } from '../vendor/rs-sdk/sdk/types';

/**
 * The dependency's real shape: `dispatch` takes the vendored `BotAction` union, so an action
 * this wrapper builds wrongly is a type error here rather than a runtime surprise in the client.
 */
function harness(groundItems: GroundItem[], result = { success: true, message: 'ok' }) {
  const dispatched: BotAction[] = [];
  const bot = createBotExtras({
    state: () => ({ groundItems } as unknown as WorldState),
    dispatch: async (action: BotAction) => { dispatched.push(action); return result; }
  });
  return { bot, dispatched };
}

const item = (patch: Partial<GroundItem> = {}): GroundItem =>
  ({ id: 1511, name: 'Logs', x: 3222, z: 3218, count: 1, distance: 2, ...patch });

describe('c.bot.interactGroundItem', () => {
  test('interactGroundItem defaults to option 3, which is Take', async () => {
    const h = harness([item()]);
    const r = await h.bot.interactGroundItem('Logs');
    expect(r.success).toBe(true);
    expect(h.dispatched).toEqual([
      { type: 'interactGroundItem', x: 3222, z: 3218, itemId: 1511, optionIndex: 3, reason: 'script' }
    ]);
  });

  test('a selector that matches nothing reports target_not_found and dispatches nothing', async () => {
    const h = harness([]);
    const r = await h.bot.interactGroundItem(/bones/i);
    expect(r).toMatchObject({ success: false, reason: 'target_not_found' });
    expect(h.dispatched).toEqual([]);
  });

  test('a RegExp, a string and a GroundItem all resolve to the same call', async () => {
    const bones = item({ id: 526, name: 'Bones', x: 1, z: 2, distance: 1 });
    for (const sel of ['Bones', /bones/i, bones] as const) {
      const h = harness([bones]);
      await h.bot.interactGroundItem(sel, { opIndex: 5 });
      expect(h.dispatched[0]).toMatchObject({ itemId: 526, optionIndex: 5 });
    }
  });

  // S5's rule, not the shape S5 names as the live violation: a string matches the whole name,
  // trimmed and case-insensitively, so "Logs" does not answer with "Oak logs".
  test('a string selector matches the whole name, not a substring of it', async () => {
    const h = harness([item({ id: 1521, name: 'Oak logs', distance: 1 })]);
    const r = await h.bot.interactGroundItem('logs');
    expect(r).toMatchObject({ success: false, reason: 'target_not_found' });
    expect(h.dispatched).toEqual([]);
  });

  test('the nearest of several matches is the one taken', async () => {
    const h = harness([
      item({ id: 1511, name: 'Logs', x: 10, z: 10, distance: 9 }),
      item({ id: 1511, name: 'Logs', x: 4, z: 4, distance: 1 }),
      item({ id: 1511, name: 'Logs', x: 7, z: 7, distance: 5 })
    ]);
    await h.bot.interactGroundItem('Logs');
    expect(h.dispatched[0]).toMatchObject({ x: 4, z: 4 });
  });

  // A `GroundItem` a caller resolved itself is taken at its word: it may have come from
  // `c.sdk.scanGroundItems`, which reaches piles the tick snapshot has not published.
  test('a resolved GroundItem is used even when the snapshot does not hold it', async () => {
    const h = harness([]);
    await h.bot.interactGroundItem(item({ id: 440, name: 'Iron ore', x: 8, z: 9 }));
    expect(h.dispatched[0]).toMatchObject({ itemId: 440, x: 8, z: 9, optionIndex: 3 });
  });

  // `RegExp.prototype.test` leaves `lastIndex` past the match on a /g or /y pattern, and one
  // RegExp object is tested against every pile in the sweep. Unreset, the second pile is tested
  // from the middle of its name: the nearer pile below is missed and the far one is taken.
  test('a /g pattern is matched from the start of every name, not from the last match', async () => {
    const h = harness([
      item({ id: 1511, name: 'Logs', x: 10, z: 10, distance: 9 }),
      item({ id: 1511, name: 'Logs', x: 4, z: 4, distance: 1 })
    ]);
    const sel = /logs/gi;
    await h.bot.interactGroundItem(sel);
    expect(h.dispatched[0]).toMatchObject({ x: 4, z: 4 });
    // And the same object again, because a script holds its pattern in a module constant.
    const again = harness([item({ id: 1511, name: 'Logs', x: 6, z: 6, distance: 2 })]);
    await again.bot.interactGroundItem(sel);
    expect(again.dispatched[0]).toMatchObject({ x: 6, z: 6 });
  });

  test('a caller signal that has already fired reports stopped and dispatches nothing', async () => {
    const h = harness([item()]);
    const ac = new AbortController();
    ac.abort();
    const r = await h.bot.interactGroundItem('Logs', { signal: ac.signal });
    expect(r).toMatchObject({ success: false, reason: 'stopped' });
    expect(h.dispatched).toEqual([]);
  });

  test('the client\'s own failure is reported rather than rewritten', async () => {
    const h = harness([item()], { success: false, message: 'too far away' });
    const r = await h.bot.interactGroundItem('Logs');
    expect(r).toEqual({ success: false, message: 'too far away' });
  });
});
