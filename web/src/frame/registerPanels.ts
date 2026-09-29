// web/src/frame/registerPanels.ts -- the strip, as data.
//
// Strip order IS registration order (plugins/registry.ts's `emitStrip`), and registration used to
// live in `main.ts`'s module body, which no unit test can execute. Moving it here is what makes
// the eleven-button order provable at all, and it keeps `main.ts` under the line ceiling that ten
// tasks of the shell v2 plan are pushing it towards.
import { createBankPlugin, type BankPluginDeps } from '../plugins/builtin/bank';
import { createEventsPlugin, type EventsPluginDeps } from '../plugins/builtin/events';
import { createLootTrackerPlugin } from '../plugins/builtin/lootTracker';
import { createMarketplacePlugin } from '../plugins/builtin/marketplace';
import { notesPlugin } from '../plugins/builtin/notes';
import { createScreenshotPlugin } from '../plugins/builtin/screenshot';
import { createStatusHudPlugin } from '../plugins/builtin/statusHud';
import { createTasksPlugin, type TasksPluginDeps } from '../plugins/builtin/tasks';
import type { RunCounters } from '../plugins/builtin/tasksViews';
import { createXpTrackerPlugin } from '../plugins/builtin/xpTracker';
import { definePlugin, type ShellPlugin } from '../plugins/types';
import type { createLootLog } from '../stats/loot';
import type { createXpTracker } from '../stats/xp';
import type { PanelView } from './panels';
import type { IconName } from '../ui/icon';
import type { PanelId } from '../types';

/**
 * The strip, top to bottom, exactly as the mock draws it: Automation and Claude, the trackers and
 * the tools, the account surfaces, then the two system panels the spacer pushes to the bottom.
 * `ui/strip.ts` decides where the two hairlines and the spacer land, by position in this list.
 */
export const PANEL_ORDER: readonly PanelId[] = [
  'tasks', 'connect', 'xp', 'loot', 'events', 'notes', 'screenshot', 'bank', 'account', 'plugins', 'config'
];

/** The one thing this module asks of the shell registry, so a test can record what it is handed. */
export interface PluginShell { register(plugin: ShellPlugin): void }

export interface RegisterDeps {
  /** The active character's trackers and canvas; each plugin holds the getter, never the value. */
  activeXp: () => ReturnType<typeof createXpTracker>;
  activeLoot: () => ReturnType<typeof createLootLog>;
  activeCanvas: () => HTMLCanvasElement | null;
  /**
   * Everything the Automation panel needs except its counter row, which this module builds from
   * the two trackers above rather than asking `main.ts` for a third copy of them: the run card's
   * `logs` and `sessionXp` ARE `activeLoot` and `activeXp`, read at the moment the panel ticks.
   */
  tasks: Omit<TasksPluginDeps, 'counters'>;
  bank: BankPluginDeps;
  /** The frame's event bus and the open character names, for the Events feed. */
  events: EventsPluginDeps;
  /** The four SP1 panels, as the `PanelView` factories main.ts already owns. */
  connect: () => PanelView;
  account: () => PanelView;
  config: () => PanelView;
  plugins: () => PanelView;
}

/** Wraps a bare `PanelView` factory as a shell plugin, which is all four SP1 panels are. */
function asPlugin(
  id: PanelId, name: string, icon: IconName, description: string,
  view: () => PanelView, opts: { alwaysOn?: boolean; defaultEnabled?: boolean } = {}
): ShellPlugin {
  return definePlugin({ manifest: { id, name, icon, tier: 'shell', description, ...opts }, panel: () => view() });
}

/**
 * Registers every shell panel, in `PANEL_ORDER`.
 *
 * `marketplace` and `status-hud` are registered too and appear in neither the array nor the strip:
 * neither emits a button (`marketplace` lost its `panel` when it became a tab of Automation,
 * `status-hud` never had one), so where they sit in the register order cannot be observed. They go
 * last. The record is keyed by `PanelId`, so a new panel id that nobody registers is a compile
 * error rather than a button that silently never appears.
 */
export function registerShellPanels(shell: PluginShell, deps: RegisterDeps): void {
  /** Items picked up and xp earned this session, for the run card's counter row (Task 15). */
  const counters = (): RunCounters => ({
    logs: deps.activeLoot().entries().reduce((n, e) => n + e.count, 0),
    sessionXp: deps.activeXp().rows(Date.now()).reduce((n, r) => n + r.gained, 0)
  });
  const build: Record<PanelId, () => ShellPlugin> = {
    tasks: () => createTasksPlugin({ ...deps.tasks, counters }),
    connect: () => asPlugin('connect', 'Claude', 'claude', 'Pair and manage your Claude session.', deps.connect, { alwaysOn: true }),
    xp: () => createXpTrackerPlugin(deps.activeXp),
    loot: () => createLootTrackerPlugin(deps.activeLoot),
    events: () => createEventsPlugin(deps.events),
    notes: () => notesPlugin,
    screenshot: () => createScreenshotPlugin({ canvas: deps.activeCanvas }),
    bank: () => createBankPlugin(deps.bank),
    account: () => asPlugin('account', 'Account', 'account', 'Your account.', deps.account, { alwaysOn: true }),
    plugins: () => asPlugin('plugins', 'Plugins', 'plugins', 'Enable and configure plugins.', deps.plugins, { alwaysOn: true }),
    config: () => asPlugin('config', 'Configuration', 'config', 'Canvas size, filter, fullscreen.', deps.config, { alwaysOn: true }),
    marketplace: createMarketplacePlugin
  };
  for (const id of PANEL_ORDER) shell.register(build[id]());
  shell.register(build.marketplace());
  shell.register(createStatusHudPlugin());
}
