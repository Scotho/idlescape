import type { PanelView } from '../frame/panels';
import type { PluginContext, PluginManifest, SettingsValues, SettingValue, ShellPlugin } from './types';
import type { SettingsStore } from './settings';

export interface RegistryDeps {
  store: SettingsStore;
  uid: () => string | null;
  contextFor(id: string): PluginContext;
  onIconStripChange(enabledPanelPlugins: PluginManifest[]): void;
  onClientToggle(id: string, enabled: boolean, settings: SettingsValues): void;
  notify(message: string, kind?: 'info' | 'error'): void;
}

export interface ShellPluginRegistry {
  register(plugin: ShellPlugin): void;
  init(): Promise<void>;
  isEnabled(id: string): boolean;
  enable(id: string): Promise<void>;
  disable(id: string): void;
  setSetting(id: string, key: string, value: SettingValue): void;
  manifests(): PluginManifest[];
  panelFor(id: string): PanelView | undefined;
  overlaysFor(): HTMLElement[];
  onTick(cycle: number): void;
}

export function createShellRegistry(deps: RegistryDeps): ShellPluginRegistry {
  const plugins = new Map<string, ShellPlugin>();
  const order: string[] = [];
  const enabled = new Set<string>();
  const panels = new Map<string, PanelView>();
  const overlays = new Map<string, HTMLElement>();

  const manifest = (id: string) => plugins.get(id)!.manifest;

  function emitStrip(): void {
    deps.onIconStripChange(order.filter(id => enabled.has(id) && plugins.get(id)!.panel).map(manifest));
  }

  async function activate(id: string): Promise<void> {
    const p = plugins.get(id)!;
    enabled.add(id);
    if (p.manifest.tier === 'client') {
      deps.onClientToggle(id, true, deps.store.get(id)?.settings ?? {});
    } else {
      const ctx = deps.contextFor(id);
      if (p.panel) panels.set(id, p.panel(ctx));
      if (p.overlay) overlays.set(id, p.overlay(ctx));
      await p.onEnable?.(ctx);
    }
  }

  function deactivate(id: string): void {
    const p = plugins.get(id)!;
    enabled.delete(id);
    if (p.manifest.tier === 'client') {
      deps.onClientToggle(id, false, {});
    } else {
      panels.get(id)?.unmount?.();
      panels.delete(id);
      overlays.delete(id);
      p.onDisable?.();
    }
  }

  function defaultEnabled(id: string): boolean {
    if (manifest(id).alwaysOn) return true; // alwaysOn can never be disabled, even by a stale stored doc
    const stored = deps.store.get(id);
    if (stored) return stored.enabled;
    return manifest(id).defaultEnabled === true;
  }

  return {
    register(plugin) {
      if (plugins.has(plugin.manifest.id)) throw new Error(`duplicate plugin id: ${plugin.manifest.id}`);
      plugins.set(plugin.manifest.id, plugin);
      order.push(plugin.manifest.id);
    },
    async init() {
      // Reset any prior activation so a re-init (e.g. account switch) reflects the new
      // user's stored state instead of accumulating the previous session's plugins.
      for (const id of [...enabled]) deactivate(id);
      await deps.store.load(deps.uid());
      // Enable in dependency order: a plugin's requires come before it (topological by declaration + requires).
      const done = new Set<string>();
      const visit = async (id: string): Promise<void> => {
        if (done.has(id) || !plugins.has(id)) return;
        done.add(id);
        for (const dep of manifest(id).requires ?? []) await visit(dep);
        if (defaultEnabled(id)) await activate(id);
      };
      for (const id of order) await visit(id);
      emitStrip();
    },
    isEnabled: id => enabled.has(id),
    async enable(id) {
      if (!plugins.has(id) || enabled.has(id)) return;
      for (const dep of manifest(id).requires ?? []) {
        if (!enabled.has(dep)) { deps.notify(`${manifest(id).name} needs ${dep} enabled first.`, 'error'); return; }
      }
      await activate(id);
      deps.store.setEnabled(deps.uid(), id, true);
      emitStrip();
    },
    disable(id) {
      if (!enabled.has(id)) return;
      if (manifest(id).alwaysOn) { deps.notify(`${manifest(id).name} can't be turned off.`); return; }
      const blocker = order.find(other => enabled.has(other) && (manifest(other).requires ?? []).includes(id));
      if (blocker) { deps.notify(`Disable ${manifest(blocker).name} first — it needs ${manifest(id).name}.`, 'error'); return; }
      deactivate(id);
      deps.store.setEnabled(deps.uid(), id, false);
      emitStrip();
    },
    setSetting(id, key, value) {
      deps.store.setSettings(deps.uid(), id, { [key]: value });
      if (manifest(id).tier === 'client' && enabled.has(id)) {
        deps.onClientToggle(id, true, deps.store.get(id)?.settings ?? {});
      }
    },
    manifests: () => order.map(manifest),
    panelFor: id => panels.get(id),
    overlaysFor: () => order.filter(id => enabled.has(id) && overlays.has(id)).map(id => overlays.get(id)!),
    onTick(cycle) { for (const id of enabled) plugins.get(id)!.onTick?.(cycle); }
  };
}
