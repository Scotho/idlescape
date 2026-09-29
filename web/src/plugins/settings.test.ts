import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createSettingsStore, type PluginDoc, type SettingsBackend } from './settings';

function memoryBackend(seed: Record<string, PluginDoc> = {}): SettingsBackend & { writes: [string, string, PluginDoc][] } {
  const writes: [string, string, PluginDoc][] = [];
  return {
    writes,
    async load() { return { ...seed }; },
    async write(uid, id, doc) { writes.push([uid, id, doc]); }
  };
}

beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('settings store', () => {
  test('load prefers backend docs over localStorage', async () => {
    try { localStorage.setItem('cs.plugin.u.u1.xp', JSON.stringify({ enabled: false, settings: {} })); } catch { /* ignore */ }
    const store = createSettingsStore(memoryBackend({ xp: { enabled: true, settings: { rate: 5 } } }));
    const map = await store.load('u1');
    expect(map.get('xp')).toEqual({ enabled: true, settings: { rate: 5 } });
  });

  test('load falls back to localStorage when backend is empty', async () => {
    try { localStorage.setItem('cs.plugin.u.u1.notes', JSON.stringify({ enabled: true, settings: { text: 'hi' } })); } catch { /* ignore */ }
    const store = createSettingsStore(memoryBackend());
    const map = await store.load('u1');
    expect(map.get('notes')).toEqual({ enabled: true, settings: { text: 'hi' } });
  });

  test('setEnabled writes localStorage immediately and backend after debounce', async () => {
    const backend = memoryBackend();
    const store = createSettingsStore(backend, { debounceMs: 500 });
    await store.load('u1');
    store.setEnabled('u1', 'xp', false);
    expect(JSON.parse(localStorage.getItem('cs.plugin.u.u1.xp')!).enabled).toBe(false);
    expect(backend.writes.length).toBe(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(backend.writes).toEqual([['u1', 'xp', { enabled: false, settings: {} }]]);
  });

  test('a null uid never calls the backend', async () => {
    const backend = memoryBackend();
    const store = createSettingsStore(backend, { debounceMs: 10 });
    await store.load(null);
    store.setEnabled(null, 'xp', true);
    await vi.advanceTimersByTimeAsync(10);
    expect(backend.writes.length).toBe(0);
    expect(JSON.parse(localStorage.getItem('cs.plugin.anon.xp')!).enabled).toBe(true);
  });

  test('setSettings merges into the existing doc and coalesces rapid writes', async () => {
    const backend = memoryBackend();
    const store = createSettingsStore(backend, { debounceMs: 500 });
    await store.load('u1');
    store.setSettings('u1', 'xp', { a: 1 });
    store.setSettings('u1', 'xp', { a: 1, b: 2 });
    await vi.advanceTimersByTimeAsync(500);
    expect(backend.writes.length).toBe(1);
    expect(backend.writes[0][2].settings).toEqual({ a: 1, b: 2 });
  });

  // Audit C10: the leak, reproduced. Before scoping, load(uid) unioned in every cs.plugin.* key in
  // the browser, so the second account on one machine inherited the first account's choices.
  test('a second account cannot see the first account settings', async () => {
    const store = createSettingsStore(memoryBackend(), { debounceMs: 10 });
    await store.load('userA');
    store.setEnabled('userA', 'loot', false);
    expect(localStorage.getItem('cs.plugin.u.userA.loot')).toContain('"enabled":false');

    const forB = await store.load('userB');
    expect(forB.has('loot')).toBe(false);
    expect(store.get('loot')).toBeUndefined();
  });

  test('signing out shows the anon bucket, not the account that was just signed in', async () => {
    const store = createSettingsStore(memoryBackend(), { debounceMs: 10 });
    await store.load('userA');
    store.setEnabled('userA', 'loot', false);

    const signedOut = await store.load(null);
    expect(signedOut.has('loot')).toBe(false);
    expect(localStorage.getItem('cs.plugin.anon.loot')).toBeNull();
  });
});
