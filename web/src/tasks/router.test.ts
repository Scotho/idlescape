// web/src/tasks/router.test.ts -- the parent-document `window.idlescape.tasks` over one api per character.
import { describe, expect, test, vi } from 'vitest';
import { createTasksRouter } from './router';
import { IDLE_STATUS, type TasksApi } from './api';
import { DEFAULT_SETTINGS } from './settings';
import type { RunStatus, TraceEvent } from './types';

const trace = (seq: number): TraceEvent => ({ seq, at: 0, kind: 'log', level: 'info', text: `e${seq}` });

/**
 * Every member of `TasksApi`, so the router can be checked against the real surface rather than
 * the five methods the first three tests happen to touch. `emitStatus`/`emitEvent` play the part
 * of the Worker pushing something up from one session while another tab is in front.
 */
function fakeApi(tag: string) {
  const statusSubs = new Set<(s: RunStatus) => void>();
  const eventSubs = new Set<(e: TraceEvent) => void>();
  const api = {
    tag,
    statusSubs,
    eventSubs,
    emitStatus: (s: RunStatus): void => { for (const cb of [...statusSubs]) cb(s); },
    emitEvent: (e: TraceEvent): void => { for (const cb of [...eventSubs]) cb(e); },
    list: vi.fn(async () => [{ id: tag }]),
    get: vi.fn(async (id: string) => ({ id, tag })),
    save: vi.fn(async () => ({ id: tag, version: 1 })),
    remove: vi.fn(async () => {}),
    install: vi.fn(async (id: string) => ({ id })),
    run: vi.fn(async () => ({ runId: `${tag}-run` })),
    execute: vi.fn(async () => ({ ok: true, logs: [] })),
    dispatch: vi.fn(async () => ({ ok: true })),
    pause: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    restart: vi.fn(async () => ({ runId: `${tag}-restart` })),
    setEnabled: vi.fn(async () => {}),
    getRun: vi.fn(async (id: string) => ({ id, tag })),
    exportRun: vi.fn(async (id: string) => new Blob([`${tag}:${id}`])),
    listRuns: vi.fn(async () => [{ runId: `${tag}-run` }]),
    status: vi.fn(() => ({ ...IDLE_STATUS, statusLine: tag })),
    getState: vi.fn(() => ({ regionId: 1, tag })),
    screenshot: vi.fn(async () => new Blob([tag])),
    settings: { get: vi.fn(() => ({ ...DEFAULT_SETTINGS, echoLogsToChat: true })), set: vi.fn() },
    onEvent: vi.fn((cb: (e: TraceEvent) => void) => { eventSubs.add(cb); return () => { eventSubs.delete(cb); }; }),
    onStatus: vi.fn((cb: (s: RunStatus) => void) => { statusSubs.add(cb); return () => { statusSubs.delete(cb); }; }),
    dispose: vi.fn()
  };
  return api as unknown as TasksApi & typeof api;
}

/** jsdom's `Blob` has no `text()`, so the bytes come back through a `FileReader`. */
const textOf = (b: Blob): Promise<string> => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(r.error ?? new Error('could not read the blob'));
  r.readAsText(b);
});

describe('createTasksRouter', () => {
  test('delegates to the api of the active session', async () => {
    let active: string | null = 'a';
    const router = createTasksRouter({ activeId: () => active });
    const a = fakeApi('a');
    const b = fakeApi('b');
    router.attach('a', a);
    router.attach('b', b);
    await router.api.list();
    expect(a.list).toHaveBeenCalledTimes(1);
    active = 'b';
    await router.api.list();
    expect(b.list).toHaveBeenCalledTimes(1);
    expect(a.list).toHaveBeenCalledTimes(1);
  });

  test('a run keeps belonging to the character it started on', async () => {
    let active: string | null = 'a';
    const router = createTasksRouter({ activeId: () => active });
    const a = fakeApi('a');
    const b = fakeApi('b');
    router.attach('a', a);
    router.attach('b', b);
    const { runId } = await router.api.run('chop-and-drop');
    active = 'b';
    await router.api.getRun(runId);
    expect(a.getRun).toHaveBeenCalledWith(runId);
    expect(b.getRun).not.toHaveBeenCalled();
    // SP4a's `stop` takes the actor, not a run id; the cast keeps the brief's case honest about
    // what it is checking — a run-addressed call lands on the api that owns the run.
    // Exporting a row from the history list is asking for THAT run, which may belong to a tab
    // that is no longer in front.
    expect(await textOf(await router.api.exportRun(runId))).toBe(`a:${runId}`);
    expect(b.exportRun).not.toHaveBeenCalled();
    await router.api.stop(runId as 'player');
    expect(a.stop).toHaveBeenCalled();
  });

  test('with no session open every call throws not_signed_in rather than crashing', async () => {
    const router = createTasksRouter({ activeId: () => null });
    await expect(router.api.list()).rejects.toMatchObject({ code: 'not_signed_in' });
  });

  test('detach drops the api and forgets its runs', async () => {
    const router = createTasksRouter({ activeId: () => 'a' });
    const a = fakeApi('a');
    router.attach('a', a);
    const { runId } = await router.api.run('x');
    router.detach('a');
    expect(router.current()).toBeNull();
    expect(router.owner(runId)).toBeNull();
  });

  test('every other method forwards to the active session', async () => {
    const router = createTasksRouter({ activeId: () => 'a' });
    const a = fakeApi('a');
    router.attach('a', a);
    await router.api.get('t');
    expect(a.get).toHaveBeenCalledWith('t');
    await router.api.save({ name: 'n', description: '', tags: [], params: {}, code: '', source: 'user' });
    expect(a.save).toHaveBeenCalled();
    await router.api.remove('t');
    expect(a.remove).toHaveBeenCalledWith('t');
    await router.api.install('lib');
    expect(a.install).toHaveBeenCalledWith('lib');
    await router.api.execute('code', { p: 1 });
    expect(a.execute).toHaveBeenCalledWith('code', { p: 1 });
    await router.api.dispatch({ type: 'wait', ticks: 1, reason: 't' } as never);
    expect(a.dispatch).toHaveBeenCalled();
    await router.api.pause('player');
    expect(a.pause).toHaveBeenCalledWith('player');
    await router.api.resume('player');
    expect(a.resume).toHaveBeenCalledWith('player');
    await router.api.restart();
    expect(a.restart).toHaveBeenCalled();
    await router.api.listRuns(5);
    expect(a.listRuns).toHaveBeenCalledWith(5);
    await router.api.screenshot();
    expect(a.screenshot).toHaveBeenCalled();
    expect(router.api.status().statusLine).toBe('a');
    expect(router.api.getState()).toEqual({ regionId: 1, tag: 'a' });
    expect(router.api.settings.get().echoLogsToChat).toBe(true);
    router.api.settings.set({ echoLogsToChat: false });
    expect(a.settings.set).toHaveBeenCalledWith({ echoLogsToChat: false });
  });

  test('a run-less getRun and the totals answer without a session instead of throwing', async () => {
    const router = createTasksRouter({ activeId: () => null });
    expect(router.api.status()).toEqual(IDLE_STATUS);
    expect(router.api.getState()).toBeNull();
    expect(router.api.settings.get()).toEqual(DEFAULT_SETTINGS);
    expect(() => router.api.settings.set({ echoLogsToChat: true })).not.toThrow();
    expect(() => router.api.dispose()).not.toThrow();
    await expect(router.api.getRun()).rejects.toMatchObject({ code: 'not_signed_in' });
    await expect(router.api.execute('x')).rejects.toMatchObject({ code: 'not_signed_in' });
    await expect(router.api.screenshot()).rejects.toMatchObject({ code: 'not_signed_in' });
  });

  test('only the active session\'s status and trace reach the router\'s subscribers', () => {
    let active: string | null = 'a';
    const router = createTasksRouter({ activeId: () => active });
    const a = fakeApi('a');
    const b = fakeApi('b');
    router.attach('a', a);
    router.attach('b', b);
    const statuses: RunStatus[] = [];
    const events: TraceEvent[] = [];
    router.api.onStatus(s => statuses.push(s));
    router.api.onEvent(e => events.push(e));

    a.emitStatus({ ...IDLE_STATUS, state: 'running', statusLine: 'a' });
    b.emitStatus({ ...IDLE_STATUS, state: 'running', statusLine: 'b' });
    a.emitEvent(trace(1));
    b.emitEvent(trace(2));
    expect(statuses.map(s => s.statusLine)).toEqual(['a']);
    expect(events.map(e => e.seq)).toEqual([1]);

    // Switching tabs re-publishes the newly active runtime's status, so the banner follows.
    active = 'b';
    router.notifyActiveChanged();
    expect(statuses.at(-1)!.statusLine).toBe('b');
    b.emitEvent(trace(3));
    expect(events.map(e => e.seq)).toEqual([1, 3]);

    // With every tab closed the banner is told the runtime is idle rather than left mid-run.
    active = null;
    router.notifyActiveChanged();
    expect(statuses.at(-1)).toEqual(IDLE_STATUS);
  });

  test('a tab change tells the panels to re-read, and unsubscribing stops it', () => {
    let active: string | null = 'a';
    const router = createTasksRouter({ activeId: () => active });
    router.attach('a', fakeApi('a'));
    router.attach('b', fakeApi('b'));
    let changes = 0;
    const off = router.onActiveChanged(() => { changes++; });
    active = 'b';
    router.notifyActiveChanged();
    expect(changes).toBe(1);
    off();
    router.notifyActiveChanged();
    expect(changes).toBe(1);
  });

  // The stage calls this on every session-manager emit, including a background login or
  // disconnect; only a real tab change may make an open Tasks panel drop what it is showing.
  test('only a real change of the active tab wakes the subscribers', () => {
    let active: string | null = 'a';
    const router = createTasksRouter({ activeId: () => active });
    const a = fakeApi('a');
    router.attach('a', a);
    const statuses: RunStatus[] = [];
    let changes = 0;
    router.api.onStatus(s => statuses.push(s));
    router.onActiveChanged(() => { changes++; });
    router.notifyActiveChanged();
    router.notifyActiveChanged();
    router.notifyActiveChanged();
    expect(changes).toBe(1);
    expect(statuses).toHaveLength(1);
    active = 'b';
    router.notifyActiveChanged();
    expect(changes).toBe(2);
    expect(statuses).toHaveLength(2);
  });

  test('attaching the same character twice does not subscribe twice, and detach unsubscribes', () => {
    const router = createTasksRouter({ activeId: () => 'a' });
    const a = fakeApi('a');
    router.attach('a', a);
    router.attach('a', a);
    expect(a.statusSubs.size).toBe(1);
    expect(a.eventSubs.size).toBe(1);
    router.detach('a');
    expect(a.statusSubs.size).toBe(0);
    expect(a.eventSubs.size).toBe(0);
  });

  test('a subscriber that throws costs neither the others their event nor the caller', () => {
    const router = createTasksRouter({ activeId: () => 'a' });
    const a = fakeApi('a');
    router.attach('a', a);
    const seen: string[] = [];
    router.api.onStatus(() => { throw new Error('boom'); });
    router.api.onStatus(s => seen.push(s.statusLine));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => a.emitStatus({ ...IDLE_STATUS, statusLine: 'a' })).not.toThrow();
    expect(seen).toEqual(['a']);
    spy.mockRestore();
  });

  test('the router owns no runtime: dispose() leaves every session api alive', () => {
    const router = createTasksRouter({ activeId: () => 'a' });
    const a = fakeApi('a');
    router.attach('a', a);
    router.api.dispose();
    expect(a.dispose).not.toHaveBeenCalled();
    expect(router.current()).toBe(a);
  });

  // Settings are per account, not per character: every attached session's runtime reads the same
  // value, so a write from one tab must reach all of them, not only the one in front.
  test('a settings change reaches every attached session, not only the active one', () => {
    const a = fakeApi('a');
    const b = fakeApi('b');
    const router = createTasksRouter({ activeId: () => 'a' });
    router.attach('a', a);
    router.attach('b', b);

    router.api.settings.set({ echoLogsToChat: true });

    expect(a.settings.set).toHaveBeenCalledWith({ echoLogsToChat: true });
    expect(b.settings.set).toHaveBeenCalledWith({ echoLogsToChat: true });
  });

  test('a settings change with no session attached is a no-op, not a throw', () => {
    const router = createTasksRouter({ activeId: () => null });
    expect(() => router.api.settings.set({ echoLogsToChat: true })).not.toThrow();
  });

  test('a toggle reaches every attached session, not only the active one', async () => {
    const router = createTasksRouter({ activeId: () => 'a' });
    const a = fakeApi('a');
    const b = fakeApi('b');
    router.attach('a', a);
    router.attach('b', b);
    await router.api.setEnabled('chop-and-drop', false);
    expect(a.setEnabled).toHaveBeenCalledWith('chop-and-drop', false);
    expect(b.setEnabled).toHaveBeenCalledWith('chop-and-drop', false);
  });

  test('a session that rejects a toggle costs neither the other session nor the caller', async () => {
    const router = createTasksRouter({ activeId: () => 'a' });
    const a = fakeApi('a');
    const b = fakeApi('b');
    a.setEnabled.mockRejectedValue(new Error('boom'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    router.attach('a', a);
    router.attach('b', b);
    await expect(router.api.setEnabled('chop-and-drop', false)).resolves.toBeUndefined();
    expect(b.setEnabled).toHaveBeenCalledWith('chop-and-drop', false);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  test('a session that throws a toggle synchronously still leaves the others written', async () => {
    const router = createTasksRouter({ activeId: () => 'a' });
    const a = fakeApi('a');
    const b = fakeApi('b');
    a.setEnabled.mockImplementation(() => { throw new Error('boom'); });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    router.attach('a', a);
    router.attach('b', b);
    await expect(router.api.setEnabled('chop-and-drop', false)).resolves.toBeUndefined();
    expect(b.setEnabled).toHaveBeenCalledWith('chop-and-drop', false);
    errors.mockRestore();
  });

  test('a toggle with no session attached resolves rather than throwing', async () => {
    const router = createTasksRouter({ activeId: () => null });
    await expect(router.api.setEnabled('chop-and-drop', false)).resolves.toBeUndefined();
  });

  test('a session that throws on a fan-out write costs neither the other session nor the caller', () => {
    const a = fakeApi('a');
    const b = fakeApi('b');
    a.settings.set.mockImplementation(() => { throw new Error('boom'); });
    const router = createTasksRouter({ activeId: () => 'a' });
    router.attach('a', a);
    router.attach('b', b);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => router.api.settings.set({ echoLogsToChat: true })).not.toThrow();

    expect(b.settings.set).toHaveBeenCalledWith({ echoLogsToChat: true });
    spy.mockRestore();
  });
});
