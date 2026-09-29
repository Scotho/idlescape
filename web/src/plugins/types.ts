import type { PanelView } from '../frame/panels';
import type { ClientHooks } from '../clientTypes';
import type { IconName } from '../ui/icon';

export type SettingField =
  | { type: 'boolean'; label: string; default: boolean }
  | { type: 'number'; label: string; default: number; min?: number; max?: number; step?: number }
  | { type: 'select'; label: string; default: string; options: { value: string; label: string }[] }
  | { type: 'color'; label: string; default: string }
  | { type: 'text'; label: string; default: string; maxLength?: number };

export type SettingSchema = Record<string, SettingField>;
export type SettingValue = boolean | number | string;
export type SettingsValues = Record<string, SettingValue>;

export interface PluginManifest {
  /** kebab-case, stable, used in Firestore paths and localStorage keys. */
  id: string;
  name: string;
  /** One of the eleven drawn glyphs. An unknown name renders the `plugins` glyph. */
  icon: IconName;
  tier: 'shell' | 'client';
  description: string;
  settings?: SettingSchema;
  /** Enabled by default when the user has no stored preference. */
  defaultEnabled?: boolean;
  /** Cannot be disabled by the user (e.g. account, claude-connection). Implies enabled. */
  alwaysOn?: boolean;
  /** Other plugin ids that must be enabled for this one to enable. */
  requires?: string[];
}

/** Everything a shell plugin is handed at enable time. */
export interface PluginContext {
  /** The live client hooks, or null before the client has started. */
  client: () => ClientHooks | null;
  settings: {
    get<T extends SettingValue = SettingValue>(key: string): T;
    set(key: string, value: SettingValue): void;
    subscribe(fn: (values: SettingsValues) => void): () => void;
  };
  /** Per-plugin namespaced localStorage (keys are prefixed with the plugin id). */
  storage: { get(key: string): string | null; set(key: string, value: string): void };
  /** Toast + browser notification. */
  notify: (message: string, kind?: 'info' | 'error') => void;
  openPanel: (id: string) => void;
  /** Current user, or null before login/bridge. */
  user: () => { uid: string; gameName: string | null } | null;
}

export interface ShellPlugin {
  manifest: PluginManifest;
  onEnable?(ctx: PluginContext): void | Promise<void>;
  onDisable?(): void;
  /** Side-panel body shown when this plugin's icon is active. */
  panel?(ctx: PluginContext): PanelView;
  /** Absolutely-positioned element rendered over the canvas while enabled. */
  overlay?(ctx: PluginContext): HTMLElement;
  onTick?(cycle: number): void;
}

/** Identity helper: gives call-site type inference without changing the value. */
export function definePlugin(p: ShellPlugin): ShellPlugin {
  return p;
}
