// web/src/tasks/settings.ts - the small pile of settings the Tasks panel exposes, and the
// localStorage mirror behind them. Extracted from api.ts when the bot-behaviour settings (Task 8c)
// pushed that file past the 400-line ceiling; the api owns run control, not a settings store.
import { DEFAULT_BEHAVIOUR } from './behaviour';
import type { BehaviourSettings } from './types';

/**
 * Everything the Tasks panel's settings form owns. The first two govern the api; the last three
 * are the bot's behaviour and are consumed inside the Worker, so they travel on the `run` message.
 *
 * The behaviour three are **read once, at run start**: changing one mid-run does not affect the
 * run in flight, exactly as the attended toggle governs starting rather than stopping. Stop the
 * run and start it again to pick a new answer up.
 *
 * Typed as the closed sets, but not trusted as them: the plugin store persists these per account
 * to Firestore with a localStorage mirror, so `resolvePolicy` validates the three on the way in.
 */
export interface TasksSettings extends BehaviourSettings {
  /** Quiet period before a human-input pause auto-resumes. 0 = the player resumes by hand. */
  resumeAfterHumanInputMs: number;
  echoLogsToChat: boolean;
}

/** Exported for the router, which has to answer `settings.get()` with no session attached. */
export const DEFAULT_SETTINGS: TasksSettings = { resumeAfterHumanInputMs: 5000, echoLogsToChat: false, ...DEFAULT_BEHAVIOUR };

/** The behaviour half, as the Worker wants it on a `run`. A copy, so nothing later mutates it. */
export const behaviourOf = (s: TasksSettings): BehaviourSettings =>
  ({ onDeath: s.onDeath, onStuck: s.onStuck, maxRelogins: s.maxRelogins });

const SETTINGS_KEY = 'tasks.settings';

export interface SettingsStore {
  get(): TasksSettings;
  set(patch: Partial<TasksSettings>): void;
}

/** Read through once, then held: every trace event asks for `echoLogsToChat`. */
export function createSettingsStore(storage: { get(k: string): string | null; set(k: string, v: string): void }): SettingsStore {
  let settings: TasksSettings | null = null;
  const get = (): TasksSettings => {
    if (settings) return settings;
    let stored: Partial<TasksSettings> = {};
    try { stored = JSON.parse(storage.get(SETTINGS_KEY) ?? '{}') as Partial<TasksSettings>; } catch { stored = {}; }
    settings = { ...DEFAULT_SETTINGS, ...stored };
    return settings;
  };
  return {
    get,
    set(patch) {
      settings = { ...get(), ...patch };
      try { storage.set(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage blocked */ }
    }
  };
}
