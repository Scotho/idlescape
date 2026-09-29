// The Tasks panel's history, report and trace half, plus the marketplace seam.
//
// Split out of tasks.test.ts, which was 394 lines and one file: three tasks of the shell v2 plan
// add cases to this panel again. The panel lifecycle, the manifest, My scripts, the snippet and
// the tick are next door in tasks.test.ts; the fixtures both files share are tasks.harness.ts.
// The mount scaffolding below is duplicated rather than lifted into the harness: the harness
// cannot reach `vi`, and each file owns its own `beforeEach` either way.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createTasksPlugin } from './tasks';
import { fakeApi as buildApi, fakeCtx as buildCtx, status } from './tasks.harness';
import type { TasksApi } from '../../tasks/api';
import type { PluginContext } from '../types';

/** The harness cannot reach `vi`, so each caller binds its own spy factory in. */
const fakeApi = (over: Partial<TasksApi> = {}): TasksApi => buildApi(vi.fn, over);
const fakeCtx = (over: Partial<PluginContext> = {}): PluginContext => buildCtx(vi.fn, over);

const flush = () => new Promise(r => setTimeout(r, 0));
const body = () => document.getElementById('body')!;
const pushStatus = (api: TasksApi) => (vi.mocked(api.onStatus).mock.calls[0]![0]);
const pushEvent = (api: TasksApi) => (vi.mocked(api.onEvent).mock.calls[0]![0]);

/** The router's tab-change signal, so a test can play a switch without a stage. */
let activeChanged: (() => void)[] = [];
const onActiveChanged = (cb: () => void): (() => void) => {
  activeChanged.push(cb);
  return () => { activeChanged = activeChanged.filter(c => c !== cb); };
};
const switchTab = (): void => { for (const cb of [...activeChanged]) cb(); };

/**
 * The Marketplace tab's panel-opening seam, held here rather than built inline, so a case can
 * assert it was NOT reached: from inside this panel every `openPanel('tasks')` re-opens the panel
 * the player is already in.
 */
let openPanel = vi.fn();

/** The trace pop-out's opener (Task 16). The run card's Trace and the report's Open trace share it. */
let openTrace = vi.fn();

/** The panel's own deps, plus the Marketplace tab's, which it builds its catalogue view from. */
const pluginDeps = (api: TasksApi | null) => ({
  api: () => api!,
  // The run card's counter row. Real ones come off the session's loot and xp trackers, through
  // frame/registerPanels.ts; the panel only ever asks for the pair.
  counters: () => ({ logs: 3, sessionXp: 1_250 }),
  hasSession: () => api !== null,
  onActiveChanged,
  openTrace,
  marketplace: { api: () => api!, hasSession: () => api !== null, openPanel }
});

async function mount(api: TasksApi | null, ctx = fakeCtx()) {
  const plugin = createTasksPlugin(pluginDeps(api));
  const view = plugin.panel!(ctx);
  view.mount(body());
  await flush(); await flush();
  return { plugin, view, ctx };
}

beforeEach(() => { document.body.innerHTML = '<div id="body"></div>'; activeChanged = []; openPanel = vi.fn(); openTrace = vi.fn(); });

describe('tasks panel history and marketplace', () => {
  // `data-trace-open` stays the hook on the history row (web/e2e/tasks.pw.test.ts drives it);
  // what it opens is the report, with the raw trace behind the report's own toggle.
  test('history lists runs and opening one shows its report, with the trace a click further', async () => {
    const api = fakeApi();
    await mount(api);
    expect(body().querySelector('[data-history-row="r1"]')?.textContent).toContain('Chop and drop');
    body().querySelector<HTMLButtonElement>('[data-trace-open="r1"]')!.click();
    await flush();
    expect(api.getRun).toHaveBeenCalledWith('r1');
    expect(body().querySelector('[data-report]')?.getAttribute('data-report')).toBe('r1');
    // Task 16: the raw trace is a window over the stage. The report never fills a host of its
    // own, so the panel body still holds no trace row after the button is pressed.
    expect(body().querySelector('[data-trace-row]')).toBeNull();
    body().querySelector<HTMLButtonElement>('[data-report-trace]')!.click();
    expect(openTrace).toHaveBeenCalledWith('r1', 'Chop and drop');
    expect(body().querySelector('[data-trace-row]')).toBeNull();
  });

  // The run card's Trace opens the WINDOW (Task 16), which never closes anything the panel has
  // open: before that it went through the History section, and a button labelled Trace could
  // close the report a player had opened from its history row.
  test('Trace on the run card opens the window and leaves the panel alone', async () => {
    const api = fakeApi({ status: vi.fn(() => status('running')) });
    await mount(api);
    pushStatus(api)(status('running'));
    body().querySelector<HTMLButtonElement>('[data-trace-open="r1"]')!.click();
    await flush();
    expect(body().querySelector('[data-report]')?.getAttribute('data-report')).toBe('r1');
    body().querySelector<HTMLButtonElement>('[data-run-trace]')!.click();
    await flush();
    expect(openTrace).toHaveBeenCalledWith('r1', 'Chop and drop');
    // The report the player opened is still on screen, and Trace read nothing back off the api.
    expect(body().querySelector('[data-report]')).not.toBeNull();
    expect(api.getRun).toHaveBeenCalledTimes(1);
    // The history row's own button still toggles, which is what Trace never does.
    body().querySelector<HTMLButtonElement>('[data-trace-open="r1"]')!.click();
    await flush();
    expect(body().querySelector('[data-report]')).toBeNull();
  });

  // The panel used to grow a live trace inside the open report, and that append is the window's
  // now: a live row surviving a close and a re-open is `traceWindow.test.ts`'s case. What the
  // panel still has to do is leave the report alone, which is what nothing else here watches.
  test('a live trace event grows no rows inside the open report', async () => {
    const api = fakeApi({ status: vi.fn(() => status('running')) });
    await mount(api);
    body().querySelector<HTMLButtonElement>('[data-trace-open="r1"]')!.click();
    await flush();
    pushEvent(api)({ seq: 2, at: 1_000, kind: 'xp', skill: 'Woodcutting', delta: 25 });
    expect(body().querySelector('[data-report]')).not.toBeNull();
    expect(body().querySelectorAll('[data-trace-row]')).toHaveLength(0);
    expect(body().textContent).not.toContain('xp Woodcutting +25');
  });

  // The panel is what knows which run the Export button belongs to; the view only asks.
  test('Export goes back to the api for the run the report is showing', async () => {
    const api = fakeApi();
    await mount(api);
    body().querySelector<HTMLButtonElement>('[data-trace-open="r1"]')!.click();
    await flush();
    body().querySelector<HTMLButtonElement>('[data-report-export]')!.click();
    await flush();
    expect(api.exportRun).toHaveBeenCalledWith('r1');
  });

  // Everything the panel shows belongs to one character, and the router follows the tab: a switch
  // has to re-read the catalogue and the history, and drop the trace of the run it was watching.
  test('a tab switch re-reads the scripts and history and closes the open report', async () => {
    const api = fakeApi();
    const { view } = await mount(api);
    body().querySelector<HTMLButtonElement>('[data-trace-open="r1"]')!.click();
    await flush();
    expect(body().querySelector('[data-report]')).not.toBeNull();
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.listRuns).toHaveBeenCalledTimes(1);
    switchTab();
    await flush();
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.listRuns).toHaveBeenCalledTimes(2);
    expect(body().querySelector('[data-report]')).toBeNull();
    // Unmounting takes the panel off the signal with the rest of its subscriptions.
    view.unmount!();
    switchTab();
    await flush();
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  // The health checks live only in the trace, event by event: the card cannot read them back
  // from `RunStatus`, so the panel is the thing that remembers them.
  test('the run card keeps the last five health checks; a new run and a tab switch each start clean', async () => {
    const api = fakeApi({ status: vi.fn(() => status('running')) });
    await mount(api);
    const conditions = ['death', 'logout', 'low-hp', 'inventory-full', 'no-progress', 'level-up', 'dialog-stuck'] as const;
    conditions.forEach((condition, i) => pushEvent(api)({ seq: i, at: i * 10, kind: 'health', condition }));
    await flush();
    const items = body().querySelectorAll('[data-run-health-item]');
    expect(items).toHaveLength(5);
    expect(items[0]!.textContent).toContain('low-hp');
    expect(items[4]!.textContent).toContain('dialog-stuck');
    expect(body().querySelector('[data-run-health]')!.textContent).not.toContain('death');

    pushEvent(api)({ seq: 99, at: 990, kind: 'run_started', runId: 'r2', scriptId: 'chop-and-drop', version: 1, params: {}, startedBy: 'player' });
    pushStatus(api)(status('running'));
    await flush();
    expect(body().querySelectorAll('[data-run-health-item]')).toHaveLength(0);
    expect(body().querySelector<HTMLElement>('[data-run-health]')!.hidden).toBe(true);

    // The other clean sheet is a character switch. A run already in flight never sends a second
    // `run_started`, so without a clear on the switch the card shows the previous character's
    // checks until that run happens to notice something of its own.
    pushEvent(api)({ seq: 100, at: 1_000, kind: 'health', condition: 'low-hp' });
    await flush();
    expect(body().querySelectorAll('[data-run-health-item]')).toHaveLength(1);
    switchTab();
    await flush();
    pushStatus(api)(status('running'));
    await flush();
    expect(body().querySelectorAll('[data-run-health-item]')).toHaveLength(0);
  });

  // The quest steps live only in the trace as well, and the panel is what derives them: the
  // executable script is in the Worker and the api narrows the library to manifests (ruling R29).
  test('the quest steps follow task_enter, cap the trail, and settle when the run is done', async () => {
    const api = fakeApi({ status: vi.fn(() => status('running')) });
    await mount(api);
    ['walk', 'chop-tree', 'drop'].forEach((task, i) => pushEvent(api)({ seq: i, at: i * 10, kind: 'task_enter', task }));
    await flush();
    const steps = () => Array.from(body().querySelectorAll<HTMLElement>('.run-step'))
      .map(el => `${el.dataset.step}:${el.querySelector('.run-step-label')?.textContent ?? ''}`);
    expect(steps()).toEqual(['done:walk', 'done:chop-tree', 'current:drop']);

    // The fifth task drops the first: the row keeps the last four, because it is a breadcrumb of
    // where the run has just been rather than its history, and a looping script would otherwise
    // grow it until the card scrolled. The whole list is in the trace and in the report.
    ['bank', 'walk-back'].forEach((task, i) => pushEvent(api)({ seq: 10 + i, at: 100 + i, kind: 'task_enter', task }));
    await flush();
    expect(steps().map(s => s.split(':')[1])).toEqual(['chop-tree', 'drop', 'bank', 'walk-back']);

    // The run ends: every step is done, and the list is the run's own, not the trail.
    pushEvent(api)({
      seq: 20, at: 200, kind: 'run_done', status: 'done', summary: '41 logs', durationMs: 1_000,
      xpGained: {}, itemsDelta: {}, tasksEntered: ['walk', 'chop-tree', 'drop']
    });
    pushStatus(api)(status('done'));
    await flush();
    expect(steps()).toEqual(['done:walk', 'done:chop-tree', 'done:drop']);

    // And a new run starts with an empty row rather than the last one's breadcrumbs.
    pushEvent(api)({ seq: 30, at: 300, kind: 'run_started', runId: 'r2', scriptId: 'chop-and-drop', version: 1, params: {}, startedBy: 'player' });
    pushStatus(api)(status('running'));
    await flush();
    expect(steps()).toEqual([]);
    expect(body().querySelector<HTMLElement>('[data-run-steps]')!.hidden).toBe(true);
  });

  // G4: the Marketplace is a tab of this panel, not a panel beside it. The case this replaces
  // asserted `openPanel` had been called with 'marketplace' through a `vi.fn()`, which keeps
  // passing after that id stops resolving to anything; a tab switch is observable in the DOM.
  test('the Marketplace tab replaces My tasks with the catalogue, and comes back', async () => {
    const api = fakeApi();
    await mount(api);
    expect(body().querySelector('[data-task-row]')).not.toBeNull();
    expect(body().querySelector('[data-market-search]')).toBeNull();

    body().querySelector<HTMLButtonElement>('.seg-btn[data-seg="market"]')!.click();
    await flush();
    expect(body().querySelector<HTMLElement>('.seg-btn[data-seg="market"]')!.classList.contains('active')).toBe(true);
    expect(body().querySelector<HTMLElement>('.seg-btn[data-seg="my"]')!.classList.contains('active')).toBe(false);
    expect(body().querySelector('[data-market-card]')).not.toBeNull();
    // Replaced, not appended: the catalogue's own mount() appends, so the host is cleared first.
    expect(body().querySelector('[data-task-row]')).toBeNull();

    body().querySelector<HTMLButtonElement>('.seg-btn[data-seg="my"]')!.click();
    await flush();
    expect(body().querySelector('[data-market-search]')).toBeNull();
    expect(body().querySelector('[data-task-row]')).not.toBeNull();
  });

  // Run now is the one thing in the catalogue that has to leave the catalogue: the run it starts
  // shows on the run card at the top of My tasks. `openPanel('tasks')` from here re-opens the
  // panel the player is standing in, which re-mounts this view with `tab` still 'market', so the
  // player is left staring at the shop window with a run going on behind it.
  test('Run now on the Marketplace tab lands on My tasks and opens no panel', async () => {
    const api = fakeApi();
    await mount(api);
    body().querySelector<HTMLButtonElement>('.seg-btn[data-seg="market"]')!.click();
    await flush();
    body().querySelector<HTMLButtonElement>('[data-market-run="chop-and-drop"]')!.click();
    await flush(); await flush();
    expect(api.run).toHaveBeenCalledWith('chop-and-drop');
    expect(body().querySelector<HTMLElement>('.seg-btn[data-seg="my"]')!.classList.contains('active')).toBe(true);
    expect(body().querySelector('[data-market-search]')).toBeNull();
    expect(body().querySelector('[data-task-row]')).not.toBeNull();
    expect(openPanel).not.toHaveBeenCalled();
  });

  // Before G4 the strip carried a Marketplace button, so the catalogue was reachable with no
  // character logged in. It is a tab now, and the tab bar goes up before the session check, so it
  // still is - and the catalogue's own pre-game state is live rather than unreachable code.
  test('the tabs are up before a character starts, and the Marketplace tab still opens', async () => {
    await mount(null);
    expect(body().querySelectorAll('.seg-btn')).toHaveLength(2);
    expect(body().textContent).toContain('The game has not started');
    body().querySelector<HTMLButtonElement>('.seg-btn[data-seg="market"]')!.click();
    await flush();
    expect(body().textContent).toContain('Start a character to browse the script catalogue.');
    body().querySelector<HTMLButtonElement>('.seg-btn[data-seg="my"]')!.click();
    await flush();
    expect(body().textContent).toContain('The game has not started');
  });

  // Ruling R27: the tab is closure state on a `PanelView` that is built once per plugin enable,
  // so it survives a close and re-open without a `cs.` key. And it re-opens with ONE catalogue.
  test('the open tab survives a re-open, and mounts a single catalogue', async () => {
    const api = fakeApi();
    const { view } = await mount(api);
    body().querySelector<HTMLButtonElement>('.seg-btn[data-seg="market"]')!.click();
    await flush();
    view.unmount!();
    view.mount(body());
    await flush(); await flush();
    expect(body().querySelector<HTMLElement>('.seg-btn[data-seg="market"]')!.classList.contains('active')).toBe(true);
    expect(body().querySelectorAll('[data-market-search]')).toHaveLength(1);
  });

  // The catalogue's search debounce is 150 ms and belongs to the view, not to the panel: without
  // `market.unmount()` in the panel's own teardown it outlives the panel that owns it.
  test('closing the panel on the Marketplace tab clears the catalogue search debounce', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const api = fakeApi();
      const { view } = await mount(api);
      body().querySelector<HTMLButtonElement>('.seg-btn[data-seg="market"]')!.click();
      await vi.advanceTimersByTimeAsync(0);
      const search = body().querySelector<HTMLInputElement>('[data-market-search]')!;
      search.value = 'mining';
      search.dispatchEvent(new Event('input'));
      expect(vi.getTimerCount()).toBe(1);
      view.unmount!();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test('unmount drops the status and event subscriptions', async () => {
    const offStatus = vi.fn(); const offEvent = vi.fn();
    const api = fakeApi({ onStatus: vi.fn(() => offStatus), onEvent: vi.fn(() => offEvent) });
    const { view } = await mount(api);
    view.unmount!();
    expect(offStatus).toHaveBeenCalled();
    expect(offEvent).toHaveBeenCalled();
  });
});
