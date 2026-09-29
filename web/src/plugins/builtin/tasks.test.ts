// The Tasks panel itself: what it mounts, what it re-reads, and what it does through the api.
// The history, the report, the trace and the marketplace seam are tasks.market.test.ts, split out
// when this file reached 394 lines. The pure view builders (run card, script row, params form) are
// tasksViews.test.ts, the run report is runReportView.test.ts, and the fixtures every one of them
// shares are tasks.harness.ts.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createTasksPlugin } from './tasks';
import { fakeApi as buildApi, fakeCtx as buildCtx, run, status, task } from './tasks.harness';
import { TasksError, type TasksApi } from '../../tasks/api';
import type { PluginContext } from '../types';
import type { RunStatus } from '../../tasks/types';

/** The harness cannot reach `vi`, so each caller binds its own spy factory in. */
const fakeApi = (over: Partial<TasksApi> = {}): TasksApi => buildApi(vi.fn, over);
const fakeCtx = (over: Partial<PluginContext> = {}): PluginContext => buildCtx(vi.fn, over);

const flush = () => new Promise(r => setTimeout(r, 0));
const body = () => document.getElementById('body')!;
const pushStatus = (api: TasksApi) => (vi.mocked(api.onStatus).mock.calls[0]![0]);

/** The router's tab-change signal, so a test can play a switch without a stage. */
let activeChanged: (() => void)[] = [];
const onActiveChanged = (cb: () => void): (() => void) => {
  activeChanged.push(cb);
  return () => { activeChanged = activeChanged.filter(c => c !== cb); };
};

/** The panel's own deps, plus the Marketplace tab's, which it builds its catalogue view from. */
const pluginDeps = (api: TasksApi | null) => ({
  api: () => api!,
  // The run card's counter row. Real ones come off the session's loot and xp trackers, through
  // frame/registerPanels.ts; the panel only ever asks for the pair.
  counters: () => ({ logs: 3, sessionXp: 1_250 }),
  hasSession: () => api !== null,
  onActiveChanged,
  // The trace is a window over the stage (Task 16); the panel only hands the run id up.
  openTrace: vi.fn(),
  marketplace: { api: () => api!, hasSession: () => api !== null, openPanel: vi.fn() }
});

async function mount(api: TasksApi | null, ctx = fakeCtx()) {
  const plugin = createTasksPlugin(pluginDeps(api));
  const view = plugin.panel!(ctx);
  view.mount(body());
  await flush(); await flush();
  return { plugin, view, ctx };
}

beforeEach(() => { document.body.innerHTML = '<div id="body"></div>'; activeChanged = []; });

describe('tasks panel', () => {
  // The rename is the DISPLAY name only. The id is in every player's `cs.panel` and
  // `cs.plugin.tasks`, and in `[data-panel="tasks"]` in both suites (ruling C2).
  test('the manifest is the shell tier panel, on by default, renamed to Automation', () => {
    const { manifest } = createTasksPlugin(pluginDeps(null));
    expect(manifest).toMatchObject({ id: 'tasks', name: 'Automation', tier: 'shell', defaultEnabled: true });
    // What each setting declares, and what `settingsFrom` makes of it, is tasks.settings.test.ts.
    expect(Object.keys(manifest.settings ?? {})).toContain('resumeAfterHumanInputMs');
  });

  test('without an api it explains that the game has not started', async () => {
    const { view } = await mount(null);
    expect(view.title).toBe('Automation');
    expect(body().textContent).toMatch(/game/i);
    expect(body().querySelector('[data-task-row]')).toBeNull();
  });

  test('an idle tab hides the run card; a live status shows it', async () => {
    const api = fakeApi();
    await mount(api);
    expect(body().querySelector('[data-run-card]')).toBeNull();
    pushStatus(api)(status('running'));
    expect(body().querySelector('[data-run-card]')).not.toBeNull();
    body().querySelector<HTMLButtonElement>('[data-run-pause]')!.click();
    expect(api.pause).toHaveBeenCalledWith('player');
  });

  test('the fresh card carries the live counters, not the zeros it renders with', async () => {
    const api = fakeApi();
    await mount(api);
    pushStatus(api)(status('running'));
    // `renderRunCard` draws the row at zero and `updateRunCard` fills it, so a card rebuilt by a
    // pause or a new run would read 0 for up to a second without the panel's patch on the way in.
    expect(body().querySelector('[data-run-logs]')?.textContent).toBe('3');
    expect(body().querySelector('[data-run-session-xp]')?.textContent).toBe('1,250');
  });

  test('the snippet box is the design system code textarea at the mock two rows', async () => {
    await mount(fakeApi());
    const box = body().querySelector<HTMLTextAreaElement>('[data-snippet]')!;
    expect(box.className).toBe('textarea code snippet-code');
    expect(box.rows).toBe(2);
  });

  test('my scripts hides library entries that are not installed', async () => {
    const api = fakeApi({ list: vi.fn(async () => [task({}), task({ id: 'net', installed: true }), task({ id: 'u1', source: 'user' })]) });
    await mount(api);
    expect(Array.from(body().querySelectorAll<HTMLElement>('[data-task-row]')).map(r => r.dataset.taskRow)).toEqual(['net', 'u1']);
  });

  test('the script cards are the direct children of one .task-list, which owns the gap', async () => {
    // The list is the single owner of the mock's 7px card gap, so the cards must be its own
    // children and not sit one wrapper down. What that gap is worth is pinned off the stylesheet
    // in tasksViews.rows.test.ts; jsdom has no layout, so the two halves are asserted apart.
    const api = fakeApi({ list: vi.fn(async () => [task({ installed: true }), task({ id: 'u1', source: 'user' })]) });
    await mount(api);
    const list = body().querySelector('.task-list')!;
    expect(list.className).toBe('task-list');
    expect(Array.from(list.children).map(c => c.getAttribute('data-task-row'))).toEqual(['chop-and-drop', 'u1']);
  });

  test('running a script with params shows the form and runs with the typed values', async () => {
    const api = fakeApi({ list: vi.fn(async () => [task({ id: 'u1', source: 'user', params: { untilLevel: { type: 'number', label: 'Stop at level', default: 15, min: 2, max: 99 } } })]) });
    await mount(api);
    body().querySelector<HTMLButtonElement>('[data-task-run="u1"]')!.click();
    const form = body().querySelector<HTMLFormElement>('[data-params-form]')!;
    (form.querySelector('[name="untilLevel"]') as HTMLInputElement).value = '30';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(api.run).toHaveBeenCalledWith('u1', { untilLevel: 30 });
  });

  test('a script with no params runs straight away and a refusal is notified', async () => {
    const notify = vi.fn();
    const api = fakeApi({
      list: vi.fn(async () => [task({ id: 'u1', source: 'user' })]),
      run: vi.fn(async () => { throw new TasksError('requirements', 'Chop and drop needs: Needs a bronze axe'); })
    });
    await mount(api, fakeCtx({ notify }));
    body().querySelector<HTMLButtonElement>('[data-task-run="u1"]')!.click();
    await flush();
    expect(api.run).toHaveBeenCalledWith('u1', {});
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('bronze axe'), 'error');
  });

  test('fork saves the library source under a new id with source fork', async () => {
    const api = fakeApi({ list: vi.fn(async () => [task({ installed: true })]) });
    await mount(api);
    body().querySelector<HTMLButtonElement>('[data-task-fork="chop-and-drop"]')!.click();
    await flush(); await flush();
    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'chop-and-drop-fork', source: 'fork' }));
    const saved = vi.mocked(api.save).mock.calls[0]![0];
    expect(saved.code).toContain("id: 'chop-and-drop-fork'");
  });

  test('a bundled script the shell cannot fork gets no Fork button', async () => {
    // `tutorial-island` is eight modules; `librarySource` answers null for it, so a Fork button
    // over it would only ever raise "That script has no source to fork."
    const api = fakeApi({
      list: vi.fn(async () => [task({ installed: true }), task({ id: 'tutorial-island', name: 'Tutorial Island', source: 'library', installed: true })])
    });
    await mount(api);
    expect(body().querySelector('[data-task-fork="tutorial-island"]')).toBeNull();
    expect(body().querySelector('[data-task-row="tutorial-island"]')).not.toBeNull();
    // The single-module library script beside it still has one, so this gates rather than removes.
    expect(body().querySelector('[data-task-fork="chop-and-drop"]')).not.toBeNull();
  });

  test('edit loads the code and surfaces a compile error instead of closing', async () => {
    const api = fakeApi({
      list: vi.fn(async () => [task({ id: 'u1', source: 'user' })]),
      save: vi.fn(async () => { throw new TasksError('compile_error', 'Unexpected token }'); })
    });
    await mount(api);
    body().querySelector<HTMLButtonElement>('[data-task-edit="u1"]')!.click();
    await flush();
    const editor = body().querySelector<HTMLTextAreaElement>('[data-task-code="u1"]')!;
    expect(editor.value).toContain('defineScript');
    body().querySelector<HTMLButtonElement>('[data-task-save="u1"]')!.click();
    await flush();
    expect(body().querySelector('.alert-error')?.textContent).toContain('Unexpected token');
    expect(body().querySelector('[data-task-code="u1"]')).not.toBeNull();
  });

  test('delete asks first, then removes and re-lists', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const api = fakeApi({ list: vi.fn(async () => [task({ id: 'u1', source: 'user' })]) });
    await mount(api);
    body().querySelector<HTMLButtonElement>('[data-task-delete="u1"]')!.click();
    await flush(); await flush();
    expect(api.remove).toHaveBeenCalledWith('u1');
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  test('the row switch turns a script off through the api and re-reads the rows', async () => {
    let enabled = true;
    const api = fakeApi({
      list: vi.fn(async () => [task({ id: 'u1', name: 'My miner', source: 'user', enabled })]),
      setEnabled: vi.fn(async (_id: string, next: boolean) => { enabled = next; })
    });
    await mount(api);
    expect(body().querySelector<HTMLButtonElement>('[data-task-run="u1"]')!.disabled).toBe(false);
    const box = body().querySelector<HTMLInputElement>('[data-task-enabled="u1"]')!;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    await flush(); await flush();
    expect(api.setEnabled).toHaveBeenCalledWith('u1', false);
    // The re-read is what puts the row into its off state; without it the switch would spring back.
    expect(body().querySelector<HTMLInputElement>('[data-task-enabled="u1"]')!.checked).toBe(false);
    expect(body().querySelector<HTMLButtonElement>('[data-task-run="u1"]')!.disabled).toBe(true);
  });

  test('a refused toggle is notified and the row is left as the api still reports it', async () => {
    const api = fakeApi({
      list: vi.fn(async () => [task({ id: 'u1', name: 'My miner', source: 'user' })]),
      setEnabled: vi.fn(async () => { throw new TasksError('disposed', 'this script runtime was closed with its character tab'); })
    });
    const c = fakeCtx();
    await mount(api, c);
    const box = body().querySelector<HTMLInputElement>('[data-task-enabled="u1"]')!;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    await flush(); await flush();
    expect(c.notify).toHaveBeenCalledWith('this script runtime was closed with its character tab', 'error');
    expect(body().querySelector<HTMLInputElement>('[data-task-enabled="u1"]')!.checked).toBe(true);
  });

  test('the snippet runner is disabled while a run moves and shows the result otherwise', async () => {
    const api = fakeApi();
    await mount(api);
    const btn = body().querySelector<HTMLButtonElement>('[data-snippet-run]')!;
    expect(btn.disabled).toBe(false);
    pushStatus(api)(status('running'));
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe('Pause the run first');
    pushStatus(api)(status('idle'));
    (body().querySelector('[data-snippet]') as HTMLTextAreaElement).value = 'return 42;';
    btn.click();
    await flush();
    expect(api.execute).toHaveBeenCalledWith('return 42;');
    expect(body().querySelector('.alert-ok')?.textContent).toContain('42');
  });

  test('re-opening the panel does not double up the snippet listener', async () => {
    const api = fakeApi();
    const { view } = await mount(api);
    view.unmount!();
    view.mount(body());
    await flush();
    (body().querySelector('[data-snippet]') as HTMLTextAreaElement).value = 'return 1;';
    body().querySelector<HTMLButtonElement>('[data-snippet-run]')!.click();
    await flush();
    expect(api.execute).toHaveBeenCalledTimes(1);
  });

  test('the tick updates the card in place, and a finished run freezes its clock and stops ticking', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let current: RunStatus = { ...status('running'), startedAt: Date.now() - 5_000 };
      const api = fakeApi({ status: vi.fn(() => current) });
      await mount(api);
      const pause = body().querySelector<HTMLButtonElement>('[data-run-pause]')!;
      pause.focus();
      const before = body().querySelector('.run-elapsed')!.textContent;
      await vi.advanceTimersByTimeAsync(2_100);
      // The card is patched, not rebuilt, so the button the player is on keeps focus.
      expect(body().querySelector('[data-run-pause]')).toBe(pause);
      expect(document.activeElement).toBe(pause);
      expect(body().querySelector('.run-elapsed')!.textContent).not.toBe(before);

      // The run ends: the clock stops at what the run summary says it took (65s), not at the wall clock.
      current = { ...status('done'), startedAt: 1_000 };
      pushStatus(api)(current);
      await vi.advanceTimersByTimeAsync(10);
      expect(body().querySelector('.run-elapsed')!.textContent).toBe('01:05');
      const seen = vi.mocked(api.status).mock.calls.length;
      await vi.advanceTimersByTimeAsync(300_000);
      expect(vi.mocked(api.status).mock.calls.length).toBe(seen);
      expect(body().querySelector('.run-elapsed')!.textContent).toBe('01:05');
    } finally {
      vi.useRealTimers();
    }
  });

  test('a run that ended before the panel opened shows the duration from its history row', async () => {
    const api = fakeApi({ status: vi.fn(() => ({ ...status('done'), startedAt: 1_000 })) });
    await mount(api);
    expect(body().querySelector('.run-elapsed')?.textContent).toBe('01:05');
  });

  test('a history row for a run still in flight does not zero the clock', async () => {
    const ended: RunStatus = { ...status('done'), startedAt: Date.now() - 65_000 };
    const api = fakeApi({
      status: vi.fn(() => ended),
      listRuns: vi.fn(async () => [run({ status: 'starting', endedAt: null, durationMs: 0 })])
    });
    await mount(api);
    expect(body().querySelector('.run-elapsed')?.textContent).toBe('01:05');
  });

  test('a live run re-reads history on a poll, and stops when the panel unmounts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const api = fakeApi({ status: vi.fn(() => status('running')) });
      const { view } = await mount(api);
      const before = vi.mocked(api.listRuns).mock.calls.length;

      await vi.advanceTimersByTimeAsync(10_000);
      expect(vi.mocked(api.listRuns).mock.calls.length).toBe(before + 1);

      view.unmount!();
      await vi.advanceTimersByTimeAsync(30_000);
      // Not "no timer remains" - no CALL happens. A cleared interval and a live one that writes
      // into a detached panel look identical to a timer count.
      expect(vi.mocked(api.listRuns).mock.calls.length).toBe(before + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  test('an idle panel does not poll', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const api = fakeApi();
      await mount(api);
      const before = vi.mocked(api.listRuns).mock.calls.length;
      await vi.advanceTimersByTimeAsync(30_000);
      expect(vi.mocked(api.listRuns).mock.calls.length).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
});
