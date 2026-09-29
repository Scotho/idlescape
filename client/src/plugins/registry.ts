import type { ClientCapability } from './capability';

export interface ClientPlugin {
  id: string;
  onEnable(cap: ClientCapability, settings: Record<string, unknown>): void | Promise<void>;
  onDisable(): void;
}

export interface ClientPluginRegistry {
  register(plugin: ClientPlugin): void;
  enable(id: string, settings?: Record<string, unknown>): Promise<void>;
  disable(id: string): void;
  isEnabled(id: string): boolean;
}

export function createClientPluginRegistry(cap: ClientCapability): ClientPluginRegistry {
  const plugins = new Map<string, ClientPlugin>();
  const enabled = new Set<string>();
  return {
    register(plugin) { plugins.set(plugin.id, plugin); },
    async enable(id, settings = {}) {
      const p = plugins.get(id);
      if (!p || enabled.has(id)) return;
      enabled.add(id);
      await p.onEnable(cap, settings);
    },
    disable(id) {
      const p = plugins.get(id);
      if (!p || !enabled.has(id)) return;
      enabled.delete(id);
      p.onDisable();
    },
    isEnabled: id => enabled.has(id)
  };
}
