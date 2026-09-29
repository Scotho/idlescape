import type { AppState } from './types';

export function createAppState() {
  let current: AppState = 'boot';
  const listeners = new Set<(s: AppState) => void>();
  return {
    get: () => current,
    set(s: AppState) {
      if (s === current) return;
      current = s;
      for (const fn of listeners) fn(s);
    },
    onChange(fn: (s: AppState) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
}
