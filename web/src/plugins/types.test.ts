import { describe, expect, test } from 'vitest';
import { definePlugin, type ShellPlugin, type SettingSchema } from './types';

describe('plugin types', () => {
  test('definePlugin returns its argument unchanged (identity helper for inference)', () => {
    const schema: SettingSchema = { show: { type: 'boolean', label: 'Show', default: true } };
    const p: ShellPlugin = {
      manifest: { id: 'demo', name: 'Demo', icon: 'plugins', tier: 'shell', description: 'd', settings: schema }
    };
    expect(definePlugin(p)).toBe(p);
  });

  test('a manifest may declare alwaysOn and requires', () => {
    const p = definePlugin({
      manifest: { id: 'a', name: 'A', icon: 'account', tier: 'shell', description: 'x', alwaysOn: true, requires: ['b'] }
    });
    expect(p.manifest.alwaysOn).toBe(true);
    expect(p.manifest.requires).toEqual(['b']);
  });
});
