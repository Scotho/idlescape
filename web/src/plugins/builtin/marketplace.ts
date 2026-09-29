// web/src/plugins/builtin/marketplace.ts — the built-in script catalogue.
//
// The Tasks tab is the player's own shelf; this tab is the shop window in front of it. It lists
// the bundled library straight out of `TasksApi.list()` (which already folds in the `installed`
// flag and evaluates each script's requirements against the live world state), and offers two
// actions per card: run it now, or add it to my tasks. Running does not require adding — a
// library script runs from the bundle, so "Add to my tasks" is a bookmark, not an install step.
import { alert, badge, empty, h } from '../../ui/el';
import { card, tag as tagOf } from '../../ui/parts';
import { TUTORIAL_REGION_IDS } from '../../tasks/library/regions';
import { definePlugin, type PluginContext, type ShellPlugin } from '../types';
import type { PanelView } from '../../frame/panels';
import type { TasksApi } from '../../tasks/api';
import type { TaskSummary } from '../../tasks/types';

export interface MarketplaceDeps {
  /** `window.idlescape.tasks`: the router, which follows whichever character tab is in front. */
  api(): TasksApi;
  /** False until a character tab owns a runtime; the panel then shows its pre-game state. */
  hasSession(): boolean;
  openPanel(id: string): void;
  /**
   * Shows the My tasks tab of the Automation panel this view is mounted inside. The Automation
   * panel passes it; a view mounted anywhere else leaves it undefined and `openTasks` falls back
   * to `openPanel('tasks')`, which is the only thing that can help from outside that panel.
   */
  showMyTasks?(): void;
}

export interface MarketCardOptions { installed: boolean; startHere: boolean }
export interface MarketCardHandlers { run(id: string): void; install(id: string): void; openTasks(): void }

/** Typing in the search box re-renders at most this often. */
const SEARCH_DEBOUNCE_MS = 150;
/** The one script that earns a "Start here" nudge, and only where it can actually be started. */
const START_HERE_ID = 'tutorial-island';

/**
 * The catalogue as the panel shows it: the library's own `order` first (which is how the
 * library author ranked the scripts), then alphabetically, filtered by name or tag.
 */
export function filterCatalogue(items: TaskSummary[], query: string): TaskSummary[] {
  const q = query.trim().toLowerCase();
  return items
    .filter(t => q === '' || t.name.toLowerCase().includes(q) || t.tags.some(tag => tag.toLowerCase().includes(q)))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** One catalogue entry: what it does, what it needs, and the two things you can do with it. */
export function renderMarketCard(task: TaskSummary, opts: MarketCardOptions, handlers: MarketCardHandlers): HTMLElement {
  // Absent means on, so a card built from a stale row offers Run rather than a dead end.
  const off = task.enabled === false;
  // Tags, not badges: the catalogue's `skilling` and `woodcutting` are nouns, and the badge is
  // the shell's status colour. map-design 3.9's market card draws Tags at the same geometry.
  const meta: HTMLElement[] = task.tags.map(tagOf);
  // The version rides next to the estimate so the shop window and the Tasks tab (which shows the
  // installed revision) can be read against each other at a glance.
  meta.push(h('span', { class: 'market-est' }, `v${task.version}`));
  if (task.estimateMinutes !== undefined) meta.push(h('span', { class: 'market-est' }, `${task.estimateMinutes} min`));

  const el = card({ class: 'card-lift market-card' },
    h('div', { class: 'market-head' },
      h('span', { class: 'market-name' }, task.name),
      opts.startHere ? badge('Start here', 'accent') : null
    ),
    h('div', { class: 'market-desc' }, task.description),
    meta.length ? h('div', { class: 'market-meta' }, ...meta) : null,
    task.requirements.ok
      ? null
      : alert(h('div', { class: 'market-missing' }, ...task.requirements.missing.map(m => h('div', {}, m))), { tone: 'warn', title: 'Not ready yet' }),
    // The switch itself lives under My tasks, where the script the player owns is: this card
    // says why Run now would be refused and sends them to the one place that can undo it.
    off
      ? alert('This script is turned off. Turn it back on under My tasks.', { tone: 'warn', title: 'Turned off' })
      : null,
    h('div', { class: 'market-actions' },
      h('button', {
        type: 'button', class: 'btn btn-primary btn-sm btn-in-card', 'data-market-run': task.id,
        title: off ? 'This script is turned off' : `Run ${task.name}`,
        onclick: () => (off ? handlers.openTasks() : handlers.run(task.id))
      }, off ? 'Open My tasks' : 'Run now'),
      h('button', {
        type: 'button', class: 'btn btn-sm', 'data-market-install': task.id, disabled: opts.installed,
        onclick: () => handlers.install(task.id)
      }, opts.installed ? 'Added ✓' : 'Add to my tasks')
    )
  );
  el.setAttribute('data-market-card', task.id);
  return el;
}

/**
 * The catalogue as a mountable view: the Marketplace tab of the Automation panel (G4), and the
 * body of anything else that wants the shop window. It takes `ctx` as well as `deps` because six
 * refusals inside it are reported through `ctx.notify`.
 */
export function createMarketplaceView(ctx: PluginContext, deps: MarketplaceDeps): PanelView {
  let listEl: HTMLElement | null = null;
  let rows: TaskSummary[] = [];
  let query = '';
  let debounce: ReturnType<typeof setTimeout> | null = null;

  const fail = (err: unknown): void => ctx.notify((err as Error).message, 'error');

  /**
   * Where the player's own scripts are, from wherever this view is mounted. Inside the Automation
   * panel that is the My tasks TAB, not a panel: `openPanel('tasks')` there re-opens the panel the
   * player is already looking at, which unmounts and re-mounts this very view, re-fetches the
   * catalogue and leaves the Marketplace tab in front, so the run they just started is never on
   * screen. Mounted anywhere else there is no tab to move and the panel is the only answer.
   */
  const goToMyTasks = (): void => { if (deps.showMyTasks) { deps.showMyTasks(); return; } deps.openPanel('tasks'); };

  /** Re-reads the catalogue: `list()` re-evaluates requirements against the live state. */
  async function reload(): Promise<void> {
    if (!deps.hasSession()) { rows = []; render(); return; }
    try {
      rows = await deps.api().list();
    } catch (err) {
      rows = [];
      fail(err);
    }
    render();
  }

  function startHere(task: TaskSummary): boolean {
    if (task.id !== START_HERE_ID) return false;
    const state = deps.hasSession() ? deps.api().getState() : null;
    return state !== null && TUTORIAL_REGION_IDS.includes(state.regionId);
  }

  const handlers: MarketCardHandlers = {
    run(id) {
      if (!deps.hasSession()) { ctx.notify('Start a character before running a script.', 'error'); return; }
      // No params dialog here: the marketplace runs a script on its defaults, and the Tasks
      // tab (which the run banner opens onto) is where a run is tuned, paused and stopped. A
      // script that has params says so in the toast, so nobody thinks they chose the settings.
      const task = rows.find(r => r.id === id);
      const name = task?.name ?? id;
      const defaults = Object.keys(task?.params ?? {}).length > 0;
      void deps.api().run(id)
        .then(() => {
          ctx.notify(defaults ? `Started ${name} with its default settings.` : `Started ${name}.`);
          // The run shows on the run card at the top of My tasks, so that is where the player goes.
          goToMyTasks();
        })
        .catch(fail);
    },
    install(id) {
      if (!deps.hasSession()) { ctx.notify('Sign in and start a character to keep scripts.', 'error'); return; }
      void deps.api().install(id).then(() => { ctx.notify('Added to your tasks.'); return reload(); }).catch(fail);
    },
    openTasks: goToMyTasks
  };

  function render(): void {
    if (!listEl) return;
    if (!deps.hasSession()) {
      listEl.replaceChildren(empty('Start a character to browse the script catalogue.'));
      return;
    }
    const shown = filterCatalogue(rows.filter(t => t.source === 'library'), query);
    listEl.replaceChildren(...(shown.length
      ? shown.map(t => renderMarketCard(t, { installed: t.installed === true, startHere: startHere(t) }, handlers))
      : [empty('No scripts match.')]));
  }

  return {
    title: 'Marketplace',
    mount(body) {
      const search = h('input', {
        class: 'input input-lg', type: 'search', 'data-market-search': '',
        placeholder: 'Search scripts', 'aria-label': 'Search scripts', value: query
      });
      search.addEventListener('input', () => {
        if (debounce !== null) clearTimeout(debounce);
        debounce = setTimeout(() => { debounce = null; query = search.value; render(); }, SEARCH_DEBOUNCE_MS);
      });
      listEl = h('div', { class: 'market-list' });
      // `.market-tab`, not `.stack`: the mock's Marketplace is one 10px column, search box and
      // cards alike, and the column is the only thing that sets a gap in it.
      body.append(h('div', { class: 'market-tab' }, search, listEl));
      void reload();
    },
    unmount() {
      if (debounce !== null) clearTimeout(debounce);
      debounce = null;
      listEl = null;
    }
  };
}

/**
 * The plugin keeps its id, its manifest and `defaultEnabled`, and declares no `panel`: `emitStrip`
 * (plugins/registry.ts) only gives a button to a plugin that has one, so dropping it is the whole
 * of G4's strip half. The view above lives on, inside Automation's Marketplace tab. Nothing is
 * left for the plugin to close over, which is why it no longer takes deps.
 */
export function createMarketplacePlugin(): ShellPlugin {
  return definePlugin({
    manifest: {
      // `alwaysOn`, because nothing is left for a switch to switch: the Automation panel builds
      // `createMarketplaceView` in its own `panel()` closure and never asks the registry whether
      // this plugin is enabled, and with no `panel` there is no strip button for `emitStrip` to
      // drop either. Without it the Plugins panel renders a live checkbox that controls nothing.
      id: 'marketplace', name: 'Marketplace', icon: 'automation', tier: 'shell', defaultEnabled: true, alwaysOn: true,
      description: 'Browse the built-in script catalogue and add scripts to your tasks.'
    }
  });
}
