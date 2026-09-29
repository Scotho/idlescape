// What the Tasks panel's settings form declares, and what `settingsFrom` makes of the values it
// gets back. Split out of tasks.test.ts, which was at the 400-line ceiling and is about the panel
// rather than about the settings behind it.
//
// The fakes here are deliberately narrow: `onEnable` touches nothing but `api.settings.set`, and a
// wider one would be a fake more permissive than the collaborator it stands in for.
import { describe, expect, test, vi } from 'vitest';
import { createTasksPlugin } from './tasks';
import { DEATH_BEHAVIOURS, DEFAULT_BEHAVIOUR, STUCK_BEHAVIOURS } from '../../tasks/behaviour';
import type { TasksApi } from '../../tasks/api';
import type { PluginContext, SettingValue } from '../types';

const fakeApi = () => {
  const set = vi.fn();
  return { set, api: { settings: { get: vi.fn(), set } } as unknown as TasksApi };
};

/** A settings store holding exactly `values`; anything else reads back undefined, as the real one does. */
const fakeCtx = (values: Record<string, SettingValue> = {}): PluginContext => ({
  client: () => null,
  settings: { get: <T,>(k: string) => values[k] as T, set: vi.fn(), subscribe: () => () => {} },
  storage: { get: () => null, set: vi.fn() },
  notify: vi.fn(), openPanel: vi.fn(), user: () => null
});

const plugin = (api: TasksApi) =>
  createTasksPlugin({
    api: () => api, hasSession: () => true, onActiveChanged: () => () => {}, openTrace: () => {},
    counters: () => ({ logs: 0, sessionXp: 0 }),
    marketplace: { api: () => api, hasSession: () => true, openPanel: vi.fn() }
  });

describe('the settings the manifest declares', () => {
  test('the two the runtime already read', () => {
    const { manifest } = plugin(fakeApi().api);
    expect(manifest.settings?.resumeAfterHumanInputMs).toMatchObject({ type: 'number', default: 5000, min: 0, max: 30_000, step: 1000 });
    expect(manifest.settings?.echoLogsToChat).toMatchObject({ type: 'boolean', default: false });
  });

  test('onDeath offers every behaviour a player can ask for, with loot as the default', () => {
    const { manifest } = plugin(fakeApi().api);
    const field = manifest.settings?.onDeath;
    expect(field).toMatchObject({ type: 'select', default: 'loot' });
    // Every value of the union, so a player can pick `fail` for themselves rather than only get
    // it from a script that declares it. The order is the panel's, not the union's.
    expect(field?.type === 'select' && field.options.map(o => o.value)).toEqual(
      ['loot', 'loot-and-logout', 'return', 'resume', 'pause', 'logout', 'fail']);
    expect(field?.type === 'select' && [...field.options].map(o => o.value).sort()).toEqual([...DEATH_BEHAVIOURS].sort());
    // The label is what the player reads, so it says what the bot will do, not what the value is.
    expect(field?.type === 'select' && field.options[0].label).toBe('Go back for my loot, then carry on');
  });

  test('onStuck governs every rung that cannot carry on by itself, and pauses by default', () => {
    const field = plugin(fakeApi().api).manifest.settings?.onStuck;
    expect(field).toMatchObject({ type: 'select', default: 'pause' });
    expect(field?.type === 'select' && field.options.map(o => o.value)).toEqual(['pause', 'logout', 'stop']);
    expect(field?.type === 'select' && [...field.options].map(o => o.value).sort()).toEqual([...STUCK_BEHAVIOURS].sort());
  });

  test('maxRelogins declares the range resolvePolicy clamps to', () => {
    // 0 is how a player says "if I get logged out, stay out", so the minimum is not 1.
    expect(plugin(fakeApi().api).manifest.settings?.maxRelogins)
      .toMatchObject({ type: 'number', default: 2, min: 0, max: 5, step: 1 });
  });

  test('every declared default matches the one the merge falls back to, so the two cannot drift', () => {
    const settings = plugin(fakeApi().api).manifest.settings ?? {};
    expect(settings.onDeath?.default).toBe(DEFAULT_BEHAVIOUR.onDeath);
    expect(settings.onStuck?.default).toBe(DEFAULT_BEHAVIOUR.onStuck);
    expect(settings.maxRelogins?.default).toBe(DEFAULT_BEHAVIOUR.maxRelogins);
  });
});

describe('settingsFrom', () => {
  test('enabling the plugin pushes every stored value into the runtime', async () => {
    const { api, set } = fakeApi();
    await plugin(api).onEnable!(fakeCtx({
      resumeAfterHumanInputMs: 12_000, echoLogsToChat: true, onDeath: 'logout', onStuck: 'stop', maxRelogins: 0
    }));
    expect(set).toHaveBeenCalledWith({
      resumeAfterHumanInputMs: 12_000, echoLogsToChat: true, onDeath: 'logout', onStuck: 'stop', maxRelogins: 0
    });
  });

  test('a player who has never opened the form gets the declared defaults', async () => {
    const { api, set } = fakeApi();
    await plugin(api).onEnable!(fakeCtx());
    expect(set).toHaveBeenCalledWith(expect.objectContaining(DEFAULT_BEHAVIOUR));
  });

  test('a stored value is passed on as stored, for resolvePolicy to judge', async () => {
    const { api, set } = fakeApi();
    // Firestore and the localStorage mirror can hold whatever a previous build wrote. Deciding
    // what that means belongs in one place - `resolvePolicy` - not in two.
    await plugin(api).onEnable!(fakeCtx({ onDeath: 'nonsense', maxRelogins: 99 }));
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ onDeath: 'nonsense', maxRelogins: 99 }));
  });
});
