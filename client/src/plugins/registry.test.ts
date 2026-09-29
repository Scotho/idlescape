import { describe, expect, test } from 'bun:test';
import { createClientPluginRegistry } from './registry';
import { createCapability } from './capability';
import type { ClientState } from '../hooks/types';

const S: ClientState = { loggedIn: true, gameName: 'b', skills: { xp: [], level: [] }, inventory: [], fps: 50, rttMs: null, hp: { current: 1, max: 1 }, prayer: { current: 1, max: 1 }, energy: 0, boosts: [], position: { x: 0, z: 0, level: 0 }, activeTab: 3, sceneReady: true };
const cap = () => createCapability({ state: () => S });

describe('ClientPluginRegistry', () => {
  test('enable calls onEnable with the capability and settings; disable calls onDisable', async () => {
    const reg = createClientPluginRegistry(cap());
    let enabledWith: unknown = null; let disabled = false;
    reg.register({ id: 'gpu', onEnable: (c, s) => { enabledWith = { c, s }; }, onDisable: () => { disabled = true; } });
    await reg.enable('gpu', { mode: 'webgl' });
    expect(reg.isEnabled('gpu')).toBe(true);
    expect((enabledWith as { s: unknown }).s).toEqual({ mode: 'webgl' });
    reg.disable('gpu');
    expect(reg.isEnabled('gpu')).toBe(false);
    expect(disabled).toBe(true);
  });
  test('enable on an unknown id is a no-op (no throw)', async () => {
    const reg = createClientPluginRegistry(cap());
    await reg.enable('nope');
    expect(reg.isEnabled('nope')).toBe(false);
  });
  test('double enable does not call onEnable twice', async () => {
    const reg = createClientPluginRegistry(cap());
    let n = 0;
    reg.register({ id: 'p', onEnable: () => { n++; }, onDisable: () => {} });
    await reg.enable('p'); await reg.enable('p');
    expect(n).toBe(1);
  });
});
