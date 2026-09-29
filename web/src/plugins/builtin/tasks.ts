// web/src/plugins/builtin/tasks.ts -- the Automation panel: the run you have going, the scripts
// you own, a snippet runner, the history each run leaves behind, and the Marketplace beside them
// as a tab. Everything it does goes through `window.idlescape.tasks` (`TasksApi`); the panel holds
// no runtime state of its own beyond what it is currently showing and which tab is in front.
//
// The plugin id stays `tasks` through the rename to Automation (ruling C2): it is in every
// player's `cs.panel` and `cs.plugin.tasks`, and in `[data-panel="tasks"]` in both suites.
import { definePlugin, type PluginContext, type ShellPlugin } from '../types';
import { renderParamsForm, renderRunCard, renderScriptRow, updateRunCard, type RunCounters } from './tasksViews';
import { TERMINAL, createHistorySection } from './tasksHistory';
import { createMarketplaceView, type MarketplaceDeps } from './marketplace';
import { forkIdFor, forkSeed, librarySource } from '../../tasks/library/index';
import { confirmDialog } from '../../ui/dialog';
import { alert, empty, h } from '../../ui/el';
import { sectionLabel, segmented } from '../../ui/parts';
import type { PanelView } from '../../frame/panels';
import { DEFAULT_BEHAVIOUR } from '../../tasks/behaviour';
import type { TasksApi } from '../../tasks/api';
import type { TasksSettings } from '../../tasks/settings';
import type { DeathBehaviour, ParamValues, RunStatus, StuckBehaviour, TaskSummary } from '../../tasks/types';

export interface TasksPluginDeps {
  /** `window.idlescape.tasks`: the router, which follows whichever character tab is in front. */
  api: () => TasksApi;
  /**
   * The active session's loot count and total xp gained, for the run card's counter row: neither
   * is on `RunStatus`. `frame/registerPanels.ts` builds it from the same two trackers the XP and
   * Loot panels read, and the panel asks on the tick it already runs.
   */
  counters: () => RunCounters;
  /** False until a character tab owns a runtime; the panel then shows its pre-game state. */
  hasSession: () => boolean;
  /** The router's tab-change signal: everything the panel shows belongs to one character. */
  onActiveChanged: (cb: () => void) => () => void;
  /** Pops the raw trace into the window over the stage (Task 16). The run card's Trace and the
   *  run report's Open trace both go through here; the panel mounts no trace of its own. */
  openTrace: (runId: string, scriptName: string | null) => void;
  /** Everything the Marketplace tab's view needs; the panel builds one from its own `ctx`. */
  marketplace: MarketplaceDeps;
}

const MOVING = new Set<RunStatus['state']>(['starting', 'running']);
const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The panel's own tick: `onStatus` is edge-driven, so the countdown and clock need a timer. */
const TICK_MS = 1000;
/** How often a live run re-reads the rows and the history behind it. */
const REFRESH_MS = 10_000;

/** The card is rebuilt only when the controls change; everything else is patched in place. */
const shapeOf = (s: RunStatus): string => `${s.runId ?? ''}:${s.state}`;

/**
 * What the panel pushes into the runtime. The two select values are passed on exactly as stored -
 * `resolvePolicy` is the one place that decides what an unknown one means - and `maxRelogins` is
 * only coerced to a number, which turns a junk string into `NaN` for `clampRelogins` to catch.
 * Judging any of the three here would put that decision in two places. The run reads them exactly
 * once, when it starts.
 */
function settingsFrom(ctx: PluginContext): TasksSettings {
  return {
    resumeAfterHumanInputMs: Number(ctx.settings.get<number>('resumeAfterHumanInputMs') ?? 5000),
    echoLogsToChat: ctx.settings.get<boolean>('echoLogsToChat') === true,
    onDeath: ctx.settings.get<DeathBehaviour>('onDeath') ?? DEFAULT_BEHAVIOUR.onDeath,
    onStuck: ctx.settings.get<StuckBehaviour>('onStuck') ?? DEFAULT_BEHAVIOUR.onStuck,
    maxRelogins: Number(ctx.settings.get<number>('maxRelogins') ?? DEFAULT_BEHAVIOUR.maxRelogins)
  };
}

/**
 * A titled block of the My tasks tab. The mock heads each one with a SectionLabel rather than the
 * collapsible `<details>` this panel used before v2 (map-design 3.9, "Tab A"): a collapsed
 * History section hides the thing the tab exists for.
 */
function block(title: string, ...children: (Node | null)[]): HTMLElement {
  return h('div', { class: 'stack-tight' }, sectionLabel(title), ...children);
}

function panel(ctx: PluginContext, deps: TasksPluginDeps): PanelView {
  const unsubs: (() => void)[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  let refresh: ReturnType<typeof setInterval> | null = null;
  let shape: string | null = null;
  /**
   * Which tab is in front. It lives here and not in `localStorage`: the `PanelView` is built once
   * per plugin enable and only `mount`/`unmount` run per open, so a closure variable survives a
   * re-open without adding a `cs.` key (ruling R27).
   */
  let tab: 'my' | 'market' = 'my';
  /** Whether `market.mount` has run since the last `market.unmount`; the view's contract needs it. */
  let marketMounted = false;

  const runHost = h('div', { class: 'stack-tight' });
  // `.task-list`, not `.stack-tight`: the mock's card list is a 7px column and owns that gap alone.
  const scriptsHost = h('div', { class: 'task-list' });
  const snippetOut = h('div', { class: 'stack-tight' });
  // The history block's elements live for the life of the view, so the section is built once
  // here. Its two callbacks reach back into whichever mount is current, the same way the snippet
  // button's listener below is re-pointed rather than re-bound.
  let repaintRun: () => void = () => {};
  let reloadScripts: () => Promise<void> = async () => {};
  const history = createHistorySection({
    api: deps.api,
    notify: (message, kind) => ctx.notify(message, kind),
    renderRun: () => repaintRun(),
    refreshScripts: () => reloadScripts(), openTrace: deps.openTrace
  });

  const market = createMarketplaceView(ctx, {
    ...deps.marketplace,
    // A disabled script's Run button used to send the player to another panel; the panel it named
    // is the one they are already in, so it moves the tab instead.
    showMyTasks: () => { tab = 'my'; paintTabs(); paintContent(); }
  });

  const tabHost = h('div');
  const contentHost = h('div', { class: 'automation-content' });
  // `textarea code`, the v2 family's code box, at the mock's own two rows.
  const snippetCode = h('textarea', { class: 'textarea code snippet-code', rows: 2, 'data-snippet': '', placeholder: 'await bot.chopTree("Tree")' });
  const snippetRun = h('button', { class: 'btn', type: 'button', 'data-snippet-run': '' }, 'Run snippet');
  // The panel is mounted again every time its icon is clicked, but these elements live for the
  // life of the view, so the listener is bound once here and re-pointed at each mount.
  let onSnippetClick: () => void = () => {};
  snippetRun.addEventListener('click', () => onSnippetClick());

  /**
   * What My tasks shows before a character is logged in. It is a tab's content and not the whole
   * body: the tab bar is mounted above it, so the Marketplace is still reachable with no session,
   * the way it was when the strip had a Marketplace button of its own.
   */
  const preGame = empty('Log a character into the game and your scripts show up here.', 'The game has not started');

  // The mock's tab: the run card, then the card list with no heading of its own, then the two
  // labelled blocks.
  const myTasksEl = h('div', { class: 'stack' },
    runHost,
    scriptsHost,
    block('Run snippet', snippetCode, h('div', { class: 'btn-row' }, snippetRun), snippetOut),
    block('History', history.historyHost, history.reportHost));

  function paintTabs(): void {
    tabHost.replaceChildren(segmented(
      [{ value: 'my', label: 'My tasks' }, { value: 'market', label: 'Marketplace' }],
      tab,
      next => { tab = next as 'my' | 'market'; paintTabs(); paintContent(); }
    ));
  }

  /**
   * `market.mount` APPENDS rather than replacing, so the host is cleared first or the catalogue
   * lands under My tasks. The `marketMounted` guard runs both ways: the default tab is `my`, so
   * the FIRST paint would otherwise unmount a view that has never mounted, and a re-open on the
   * Marketplace tab would otherwise mount a second copy of it.
   */
  function paintContent(): void {
    if (tab === 'market') {
      if (!marketMounted) { contentHost.replaceChildren(); market.mount(contentHost); marketMounted = true; }
      return;
    }
    if (marketMounted) { market.unmount?.(); marketMounted = false; }
    contentHost.replaceChildren(deps.hasSession() ? myTasksEl : preGame);
  }

  /** Everything the panel does needs a live runtime, so the whole body hangs off one `api`. */
  function mountPanel(api: TasksApi): void {
    const fail = (e: unknown): void => ctx.notify(messageOf(e), 'error');
    const guard = (p: Promise<unknown>): void => { void p.then(() => {}, fail); };

    // ---- the live run -------------------------------------------------------------
    const handlers = {
      pause: () => guard(api.pause('player')),
      resume: () => guard(api.resume('player')),
      stop: () => guard(api.stop('player')),
      restart: () => guard(api.restart()),
      // The trace is a window over the stage (Task 16); it never closes what the panel has open.
      trace: () => { const s = api.status(); if (s.runId !== null) deps.openTrace(s.runId, s.scriptName); }
    };

    function renderRun(status: RunStatus): void {
      if (status.state === 'idle') { runHost.replaceChildren(); shape = null; return; }
      const cardDeps = { now: history.clockFor(status), notes: history.notes(), steps: history.steps() };
      const card = runHost.firstElementChild as HTMLElement | null;
      // Replacing the card once a second would throw away keyboard focus on Pause, Stop or Run
      // again, so a card whose controls still fit the state is patched instead.
      if (card && shape === shapeOf(status)) { updateRunCard(card, status, deps.counters(), cardDeps); return; }
      shape = shapeOf(status);
      // The counter row renders at zero and is filled by the patch, so a rebuild (a pause, a
      // resume, a new run) takes the live figures here rather than reading 0 until the next tick.
      const fresh = renderRunCard(status, handlers, cardDeps);
      updateRunCard(fresh, status, deps.counters(), cardDeps);
      runHost.replaceChildren(fresh);
    }
    repaintRun = () => renderRun(api.status());

    /** The tick exists for the countdown and the clock; neither moves once the run is over. */
    function syncTick(status: RunStatus): void {
      const moving = status.state !== 'idle' && !TERMINAL.has(status.state);
      if (moving && timer === null) timer = setInterval(() => renderRun(api.status()), TICK_MS);
      if (!moving && timer !== null) { clearInterval(timer); timer = null; }
      // The clock ticks once a second; the rows and the history behind them are a network
      // read, so they get their own, slower beat. Both stop the moment the run does.
      if (moving && refresh === null) {
        refresh = setInterval(() => { void history.refresh(); void refreshScripts(); }, REFRESH_MS);
      }
      if (!moving && refresh !== null) { clearInterval(refresh); refresh = null; }
    }

    // ---- my scripts ---------------------------------------------------------------
    function start(task: TaskSummary, params: ParamValues): void {
      guard(api.run(task.id, params).then(() => ctx.notify(`Started ${task.name}`)));
    }

    function onRun(task: TaskSummary, row: HTMLElement): void {
      const open = row.querySelector('[data-params-form]');
      if (open) { open.remove(); return; }
      const schema = task.params ?? {};
      if (!Object.keys(schema).length) { start(task, {}); return; }
      row.append(renderParamsForm(schema, values => {
        row.querySelector('[data-params-form]')?.remove();
        start(task, values);
      }, { submitLabel: 'Run', onCancel: () => row.querySelector('[data-params-form]')?.remove() }));
    }

    async function onEdit(task: TaskSummary, row: HTMLElement): Promise<void> {
      if (row.querySelector('[data-task-editor]')) { row.querySelector('[data-task-editor]')?.remove(); return; }
      const detail = await api.get(task.id).catch(e => { fail(e); return null; });
      if (!detail) return;
      const code = h('textarea', { class: 'textarea code snippet-code', rows: 12, 'data-task-code': task.id, spellcheck: 'false' });
      code.value = detail.code;
      const out = h('div', {});
      const editor = h('div', { class: 'stack-tight', 'data-task-editor': task.id },
        code, out,
        h('div', { class: 'btn-row' },
          h('button', {
            class: 'btn btn-primary', type: 'button', 'data-task-save': task.id,
            onclick: () => {
              out.replaceChildren();
              void api.save({ id: task.id, name: task.name, description: task.description, tags: task.tags ?? [], params: {}, code: code.value, source: task.source })
                .then(() => { ctx.notify(`Saved ${task.name}`); editor.remove(); void refreshScripts(); })
                .catch(e => out.replaceChildren(alert(messageOf(e), { tone: 'error', title: 'That script did not compile' })));
            }
          }, 'Save'),
          h('button', { class: 'btn', type: 'button', onclick: () => editor.remove() }, 'Cancel')));
      row.append(editor);
    }

    async function onFork(task: TaskSummary): Promise<void> {
      const libraryId = task.source === 'library' ? task.id : task.libraryId;
      const seedFor = libraryId ? forkIdFor(libraryId, new Set((await api.list().catch(() => [])).map(t => t.id))) : null;
      const code = libraryId && seedFor ? forkSeed(libraryId, seedFor) : null;
      if (!libraryId || !seedFor || code === null) { ctx.notify('That script has no source to fork.', 'error'); return; }
      await api.save({ id: seedFor, name: `${task.name} (fork)`, description: task.description, tags: task.tags ?? [], params: {}, code, source: 'fork' })
        .then(() => { ctx.notify(`Forked ${task.name}`); return refreshScripts(); })
        .catch(fail);
    }

    async function onRemove(task: TaskSummary): Promise<void> {
      const yes = await confirmDialog({ title: `Delete ${task.name}?`, body: 'This removes the script from your account. Runs already in your history stay.', confirmLabel: 'Delete', danger: true });
      if (!yes) return;
      await api.remove(task.id).then(() => { ctx.notify(`Deleted ${task.name}`); return refreshScripts(); }).catch(fail);
    }

    async function refreshScripts(): Promise<void> {
      const all = await api.list().catch(e => { fail(e); return [] as TaskSummary[]; });
      // A library entry the player has not installed lives in the Marketplace, not here.
      const mine = all.filter(t => t.source !== 'library' || t.installed === true);
      if (!mine.length) {
        scriptsHost.replaceChildren(empty('Install a script from the Marketplace, or fork one, and it shows up here.', 'No scripts yet'));
        return;
      }
      scriptsHost.replaceChildren(...mine.map(task => {
        const row = renderScriptRow(task, {
          run: () => onRun(task, row), edit: () => void onEdit(task, row),
          fork: () => void onFork(task), remove: () => void onRemove(task),
          // The toggle governs starting, not the run in flight, so nothing else moves here.
          // The re-read is in `finally`, not `then`: the player has already moved the checkbox,
          // so a refused write that skipped it would leave the switch showing a state the
          // account does not hold. Re-reading either way puts the row back on the truth.
          setEnabled: enabled => guard(api.setEnabled(task.id, enabled).finally(() => refreshScripts()))
        }, { forkable: task.source !== 'library' || librarySource(task.id) !== null });
        return row;
      }));
    }
    reloadScripts = refreshScripts;

    // ---- snippet ------------------------------------------------------------------
    function syncSnippet(status: RunStatus): void {
      const busy = MOVING.has(status.state);
      snippetRun.disabled = busy;
      snippetRun.title = busy ? 'Pause the run first' : '';
    }

    async function runSnippet(): Promise<void> {
      const code = snippetCode.value.trim();
      if (!code) return;
      snippetRun.disabled = true;
      try {
        const result = await api.execute(code);
        snippetOut.replaceChildren(alert(
          result.ok ? String(result.value ?? 'done') : (result.error ?? 'the snippet failed'),
          { tone: result.ok ? 'ok' : 'error', title: result.ok ? 'Result' : 'Error' }));
        if (result.logs.length) snippetOut.append(h('pre', { class: 'trace-pre' }, result.logs.join('\n')));
      } catch (e) {
        snippetOut.replaceChildren(alert(messageOf(e), { tone: 'error', title: 'Error' }));
      } finally {
        syncSnippet(api.status());
      }
    }
    onSnippetClick = () => void runSnippet();

    // ---- mount --------------------------------------------------------------------
    // The tab bar and the content host are already on screen: `mount` puts them there before it
    // knows whether there is a session, so this half only has to fill `myTasksEl` in.
    api.settings.set(settingsFrom(ctx));
    unsubs.push(ctx.settings.subscribe(() => api.settings.set(settingsFrom(ctx))));
    renderRun(api.status());
    syncSnippet(api.status());
    syncTick(api.status());
    void refreshScripts();
    void history.refresh();
    unsubs.push(api.onStatus(status => { renderRun(status); syncSnippet(status); syncTick(status); }));
    unsubs.push(api.onEvent(history.onEvent));
    // A tab switch means a different character's scripts, history and run: re-read them, and drop
    // the trace of the run the panel was watching. `onStatus` above repaints the run card.
    unsubs.push(deps.onActiveChanged(() => {
      // Another character's run: close the report and drop the checks that are not this one's.
      history.reset();
      // The last tab closed: leave what is on screen rather than toast a `not_signed_in` from
      // `list()`; the panel mounts into its pre-game state the next time it is opened.
      if (!deps.hasSession()) return;
      void refreshScripts();
      void history.refresh();
    }));
  }

  return {
    title: 'Automation',
    mount(body) {
      // The tab bar goes up before the session check. Returning early on the empty state left the
      // Marketplace tab, and the catalogue's own pre-game state, unreachable from the whole shell.
      body.replaceChildren(tabHost, contentHost);
      paintTabs();
      paintContent();
      if (!deps.hasSession()) return;
      mountPanel(deps.api());
    },
    unmount() {
      for (const off of unsubs.splice(0)) off();
      if (timer !== null) clearInterval(timer);
      if (refresh !== null) clearInterval(refresh);
      timer = null;
      refresh = null;
      shape = null;
      history.reset();
      // The catalogue's 150 ms search debounce would otherwise outlive the panel.
      if (marketMounted) { market.unmount?.(); marketMounted = false; }
    }
  };
}

export function createTasksPlugin(deps: TasksPluginDeps): ShellPlugin {
  return definePlugin({
    manifest: {
      id: 'tasks', name: 'Automation', icon: 'automation', tier: 'shell', defaultEnabled: true,
      description: 'Run scripts, browse the marketplace, and watch a live run.',
      settings: {
        resumeAfterHumanInputMs: { type: 'number', label: 'Auto-resume after you take control (ms)', default: 5000, min: 0, max: 30_000, step: 1000 },
        echoLogsToChat: { type: 'boolean', label: 'Echo script logs to game chat', default: false },
        // The bot's behaviour. A script that declares its own `health.*` keeps it; everything
        // else follows these, and a run reads them once, when it starts.
        onDeath: {
          type: 'select', label: 'When I die', default: 'loot',
          options: [
            { value: 'loot', label: 'Go back for my loot, then carry on' },
            { value: 'loot-and-logout', label: 'Go back for my loot, then log out' },
            { value: 'return', label: 'Go back to work, leave the loot' },
            { value: 'resume', label: 'Carry on from where I respawned' },
            { value: 'pause', label: 'Pause and wait for me' },
            { value: 'logout', label: 'Log out' },
            { value: 'fail', label: 'Stop the run' }
          ]
        },
        onStuck: {
          type: 'select', label: 'When a run gets stuck', default: 'pause',
          options: [
            { value: 'pause', label: 'Pause and wait for me' },
            { value: 'logout', label: 'Log out' },
            { value: 'stop', label: 'Stop the run' }
          ]
        },
        maxRelogins: { type: 'number', label: 'Times to log back in after a disconnect', default: 2, min: 0, max: 5, step: 1 }
      }
    },
    // With no character open the router has nowhere to put these and the write is dropped; the
    // panel pushes them again on its next mount, once a session is there to take them.
    onEnable(ctx) { deps.api().settings.set(settingsFrom(ctx)); },
    panel: ctx => panel(ctx, deps)
  });
}
