// web/src/frame/events.test.ts -- the ring buffer's two hard parts: the cap, and the teardown.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENT_CAP, createEventBus } from './events';

// `amount` is `number | null` on ShellEvent with no `?`, so a fixture that omits it does not
// typecheck and `npm run typecheck` fails before a single case runs.
const base = {
  characterId: 'c1', characterName: 'shoth4019zr', type: 'xp' as const,
  skill: 'Woodcutting', tone: 'default' as const, amount: null
};
let clock = 1000;
beforeEach(() => { clock = 1000; });
const bus = () => createEventBus({ now: () => clock++ });

describe('createEventBus', () => {
  it('stamps a monotonic seq and the clock, newest last', () => {
    const b = bus();
    b.emit({ ...base, text: 'first' });
    b.emit({ ...base, text: 'second' });
    expect(b.all().map(e => [e.seq, e.at, e.text])).toEqual([[1, 1000, 'first'], [2, 1001, 'second']]);
  });

  it('honours an explicit at, for a producer that knows better than the clock', () => {
    const b = bus();
    b.emit({ ...base, text: 'x', at: 42 });
    expect(b.all()[0].at).toBe(42);
  });

  it('drops the oldest past the cap and keeps seq climbing', () => {
    const b = createEventBus({ now: () => 0, cap: 3 });
    for (const text of ['a', 'b', 'c', 'd']) b.emit({ ...base, text });
    expect(b.all().map(e => e.text)).toEqual(['b', 'c', 'd']);
    expect(b.all().map(e => e.seq)).toEqual([2, 3, 4]);
  });

  it('defaults to a 500 event cap', () => {
    expect(EVENT_CAP).toBe(500);
    const b = createEventBus({ now: () => 0 });
    for (let i = 0; i < EVENT_CAP + 10; i++) b.emit({ ...base, text: String(i) });
    expect(b.all().length).toBe(EVENT_CAP);
    expect(b.all()[0].text).toBe('10');
  });

  it('carries every field of the record through untouched', () => {
    const b = bus();
    b.emit({ ...base, type: 'run', tone: 'fail', skill: null, amount: 25, characterId: null, characterName: null, text: 'r' });
    expect(b.all()[0]).toEqual({
      seq: 1, at: 1000, characterId: null, characterName: null, type: 'run',
      skill: null, text: 'r', tone: 'fail', amount: 25
    });
  });

  it('notifies every subscriber with the stamped record, and stops on unsubscribe', () => {
    const b = bus();
    const seen: string[] = [];
    const off = b.subscribe(e => seen.push(`${e.seq}:${e.text}`));
    b.emit({ ...base, text: 'a' });
    off();
    b.emit({ ...base, text: 'b' });
    expect(seen).toEqual(['1:a']);
    expect(b.all().length).toBe(2);          // unsubscribing does not stop recording
  });

  it('fires nothing after dispose, and answers an empty log', () => {
    const b = bus();
    const fn = vi.fn();
    b.subscribe(fn);
    b.emit({ ...base, text: 'a' });
    b.dispose();
    b.emit({ ...base, text: 'b' });
    expect(fn).toHaveBeenCalledTimes(1);      // not twice: dispose fences what comes next
    expect(b.all()).toEqual([]);
  });

  it('survives a subscriber that throws, so one bad consumer cannot stop the feed', () => {
    const b = bus();
    const good: string[] = [];
    b.subscribe(() => { throw new Error('boom'); });
    b.subscribe(e => good.push(e.text));
    expect(() => b.emit({ ...base, text: 'a' })).not.toThrow();
    expect(good).toEqual(['a']);
  });
});
