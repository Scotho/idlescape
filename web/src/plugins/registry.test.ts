import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createShellRegistry, type RegistryDeps } from './registry';
import { definePlugin, type PluginContext } from './types';
import type { SettingsStore, PluginDoc } from './settings';

function fakeStore(seed: Record<string, PluginDoc> = {}): SettingsStore {
  const m = new Map<string, PluginDoc>(Object.entries(seed));
  return {
    async load() { return new Map(m); },
    get: id => m.get(id),
    setEnabled: (_uid, id, enabled) => { m.set(id, { enabled, settings: m.get(id)?.settings ?? {} }); },
    setSettings: (_uid, id, s) => { m.set(id, { enabled: m.get(id)?.enabled ?? false, settings: { ...(m.get(id)?.settings ?? {}), ...s } }); },
    async flush() {}
  };
}

function deps(store: SettingsStore, over: Partial<RegistryDeps> = {}): RegistryDeps {
  const ctx = { settings: { get: () => undefined as never, set: () => {}, subscribe: () => () => {} } } as unknown as PluginContext;
  return {
    store, uid: () => 'u1', contextFor: () => ctx,
    onIconStripChange: vi.fn(), onClientToggle: vi.fn(), notify: vi.fn(), ...over
  };
}

let enabledCalls: string[];
beforeEach(() => { enabledCalls = []; });
const track = (id: string) => definePlugin({
  manifest: { id, name: id, icon: 'plugins', tier: 'shell', description: id },
  onEnable: () => { enabledCalls.push(id); },
  panel: () => ({ title: id, mount: () => {} })
});

describe('shell registry', () => {
  test('init enables defaultEnabled and alwaysOn plugins, not the rest', async () => {
    const store = fakeStore();
    const reg = createShellRegistry(deps(store));
    reg.register(definePlugin({ manifest: { id: 'a', name: 'A', icon: 'plugins', tier: 'shell', description: 'a', defaultEnabled: true } }));
    reg.register(definePlugin({ manifest: { id: 'b', name: 'B', icon: 'plugins', tier: 'shell', description: 'b' } }));
    reg.register(definePlugin({ manifest: { id: 'c', name: 'C', icon: 'plugins', tier: 'shell', description: 'c', alwaysOn: true } }));
    await reg.init();
    expect(reg.isEnabled('a')).toBe(true);
    expect(reg.isEnabled('b')).toBe(false);
    expect(reg.isEnabled('c')).toBe(true);
  });

  test('stored enabled state overrides manifest defaults', async () => {
    const store = fakeStore({ a: { enabled: false, settings: {} }, b: { enabled: true, settings: {} } });
    const reg = createShellRegistry(deps(store));
    reg.register(definePlugin({ manifest: { id: 'a', name: 'A', icon: 'plugins', tier: 'shell', description: 'a', defaultEnabled: true } }));
    reg.register(definePlugin({ manifest: { id: 'b', name: 'B', icon: 'plugins', tier: 'shell', description: 'b' } }));
    await reg.init();
    expect(reg.isEnabled('a')).toBe(false);
    expect(reg.isEnabled('b')).toBe(true);
  });

  test('enable refuses when a required dependency is disabled', async () => {
    const store = fakeStore();
    const notify = vi.fn();
    const reg = createShellRegistry(deps(store, { notify }));
    reg.register(track('base'));
    reg.register(definePlugin({ manifest: { id: 'dep', name: 'Dep', icon: 'plugins', tier: 'shell', description: 'dep', requires: ['base'] } }));
    await reg.init();
    await reg.enable('dep');
    expect(reg.isEnabled('dep')).toBe(false);
    expect(notify).toHaveBeenCalled();
  });

  test('disable refuses for alwaysOn plugins', async () => {
    const store = fakeStore();
    const reg = createShellRegistry(deps(store));
    reg.register(definePlugin({ manifest: { id: 'x', name: 'X', icon: 'plugins', tier: 'shell', description: 'x', alwaysOn: true } }));
    await reg.init();
    reg.disable('x');
    expect(reg.isEnabled('x')).toBe(true);
  });

  test('client-tier enable routes through onClientToggle, not a shell onEnable', async () => {
    const store = fakeStore();
    const onClientToggle = vi.fn();
    const reg = createShellRegistry(deps(store, { onClientToggle }));
    reg.register(definePlugin({ manifest: { id: 'gpu', name: 'GPU', icon: 'plugins', tier: 'client', description: 'gpu' } }));
    await reg.init();
    await reg.enable('gpu');
    expect(onClientToggle).toHaveBeenCalledWith('gpu', true, expect.any(Object));
    expect(reg.isEnabled('gpu')).toBe(true);
  });

  test('onIconStripChange fires with enabled plugins that expose a panel', async () => {
    const store = fakeStore();
    const onIconStripChange = vi.fn();
    const reg = createShellRegistry(deps(store, { onIconStripChange }));
    reg.register(track('withpanel'));
    reg.register(definePlugin({ manifest: { id: 'nopanel', name: 'N', icon: 'plugins', tier: 'shell', description: 'n', defaultEnabled: true } }));
    await reg.init();
    await reg.enable('withpanel');
    const last = onIconStripChange.mock.calls.at(-1)![0] as { id: string }[];
    expect(last.map(m => m.id)).toContain('withpanel');
    expect(last.map(m => m.id)).not.toContain('nopanel');
  });

  test('re-init deactivates plugins no longer enabled in the reloaded store (account switch)', async () => {
    const backing = new Map<string, PluginDoc>();
    const store: SettingsStore = {
      async load() { return new Map(backing); },
      get: id => backing.get(id),
      setEnabled: (_u, id, enabled) => { backing.set(id, { enabled, settings: backing.get(id)?.settings ?? {} }); },
      setSettings: () => {},
      async flush() {}
    };
    const reg = createShellRegistry(deps(store));
    reg.register(definePlugin({ manifest: { id: 'loot', name: 'Loot', icon: 'plugins', tier: 'shell', description: 'l', defaultEnabled: true }, panel: () => ({ title: 'l', mount: () => {} }) }));
    await reg.init();
    expect(reg.isEnabled('loot')).toBe(true);          // guest default
    backing.set('loot', { enabled: false, settings: {} }); // new account has it off
    await reg.init();
    expect(reg.isEnabled('loot')).toBe(false);         // must reflect the new account, not accumulate
  });

  test('an alwaysOn plugin stays enabled even if a stored doc says disabled', async () => {
    const store = fakeStore({ acc: { enabled: false, settings: {} } });
    const reg = createShellRegistry(deps(store));
    reg.register(definePlugin({ manifest: { id: 'acc', name: 'Acc', icon: 'plugins', tier: 'shell', description: 'a', alwaysOn: true }, panel: () => ({ title: 'a', mount: () => {} }) }));
    await reg.init();
    expect(reg.isEnabled('acc')).toBe(true);
  });
});
