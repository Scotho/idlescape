import { describe, expect, test } from 'vitest';
import { createAppState } from './state';

describe('app state', () => {
  test('starts at boot and notifies on change', () => {
    const s = createAppState();
    const seen: string[] = [];
    s.onChange(v => seen.push(v));
    s.set('home');
    s.set('playing');
    expect(s.get()).toBe('playing');
    expect(seen).toEqual(['home', 'playing']);
  });
  test('setting the same state does not notify', () => {
    const s = createAppState();
    let n = 0;
    s.onChange(() => n++);
    s.set('boot');
    expect(n).toBe(0);
  });
  test('accepts the home and characters states', () => {
    const s = createAppState();
    const seen: string[] = [];
    s.onChange(v => seen.push(v));
    s.set('home'); s.set('characters'); s.set('playing');
    expect(seen).toEqual(['home', 'characters', 'playing']);
  });
});
