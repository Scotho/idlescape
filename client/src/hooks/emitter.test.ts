import { describe, expect, test } from 'bun:test';
import { createEmitter } from './emitter';
import type { HookEvents } from './types';

describe('emitter', () => {
  test('delivers to subscribers and supports unsubscribe', () => {
    const em = createEmitter<HookEvents>();
    const seen: number[] = [];
    const off = em.on('xp', p => seen.push(p.delta));
    em.emit('xp', { skill: 1, xp: 10, level: 1, delta: 10 });
    off();
    em.emit('xp', { skill: 1, xp: 20, level: 1, delta: 10 });
    expect(seen).toEqual([10]);
  });
  test('a throwing handler does not stop the others', () => {
    const em = createEmitter<HookEvents>();
    let hit = false;
    em.on('tick', () => { throw new Error('boom'); });
    em.on('tick', () => { hit = true; });
    em.emit('tick', { cycle: 1 });
    expect(hit).toBe(true);
  });
});
