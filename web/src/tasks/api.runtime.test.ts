// The other half of `TasksApi`: the trace buffer it keeps for the live run and the history it
// writes, the status it publishes, the settings it holds, and what `dispose` releases. The
// catalogue and run-control surface is api.test.ts; the fakes both files are built on live in
// api.harness.ts.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_BEHAVIOUR } from './behaviour';
import { buildRunReport } from './runReport';
import { createTrace } from './trace';
import { grab, setup as wire, userDoc } from './api.harness';
import type { RunStatus, RunSummary, TraceEvent } from './types';

/** `setup` with this file's spy factory bound in; `vi` cannot reach the harness itself. */
const setup = (opts: Parameters<typeof wire>[1] = {}) => wire(vi.fn, opts);

/** jsdom's `Blob` has no `text()`, so the bytes come back through a `FileReader`. */
const textOf = (b: Blob): Promise<string> => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(r.error ?? new Error('could not read the blob'));
  r.readAsText(b);
});

describe('trace, history and status', () => {
  const ev = (seq: number, kind: 'status' | 'log' = 'status'): TraceEvent =>
    (kind === 'log' ? { seq, at: seq, kind: 'log', level: 'info', text: `line ${seq}` } : { seq, at: seq, kind: 'status', text: `s${seq}` });

  test('run seeds history, flushes every 50 events, and writes the run on run_end', async () => {
    const { api, host, hist, store } = setup({ docs: [userDoc()] });
    await api.run('u1');
    expect(hist.puts[0].summary.runId).toBe('r1');
    for (let i = 1; i <= 50; i++) host.trace(ev(i));
    expect(hist.appends).toHaveLength(1);
    expect(hist.appends[0]).toMatchObject({ runId: 'r1' });
    expect(hist.appends[0].events).toHaveLength(50);
    const summary: RunSummary = { ...hist.puts[0].summary, status: 'done', endedAt: 9, durationMs: 4, summary: 'chopped 12 logs' };
    host.end({ runId: 'r1', outcome: 'done', summary });
    await vi.waitFor(() => expect(hist.puts).toHaveLength(2));
    expect(hist.puts[1].events).toHaveLength(50);
    await vi.waitFor(() => expect(store.lastRuns).toEqual([{ id: 'u1', at: 9 }]));
  });

  // `trace.ts` re-emits a coalesced xp or item row under the seq it already had. Every consumer
  // keys on seq, so the buffer the panel and the export read must replace, not append; a second
  // row would double the delta in the exported file and disagree with the summary.
  test('a re-emitted event replaces the row it corrects rather than adding a second one', async () => {
    const { api, host } = setup({ docs: [userDoc()] });
    await api.run('u1');
    const xp = (seq: number, delta: number): TraceEvent => ({ seq, at: seq, kind: 'xp', skill: 'Woodcutting', delta });
    host.trace(xp(1, 25));
    host.trace(ev(2));
    host.trace(xp(1, 50));                        // the same row, corrected by a coalesce
    const live = await api.getRun();
    expect(live.events.map(e => e.seq)).toEqual([1, 2]);
    expect(live.events[0]).toMatchObject({ kind: 'xp', delta: 50 });
  });

  // The ordinary shape of a coalesce: the row being corrected IS the newest one in the buffer.
  // The append fast path is guarded on a seq strictly above the newest, and this is the case
  // that says why - `>=` here would file the correction as a brand-new row.
  test('a correction to the newest row replaces it rather than doubling it', async () => {
    const { api, host } = setup({ docs: [userDoc()] });
    await api.run('u1');
    const xp = (seq: number, delta: number): TraceEvent => ({ seq, at: seq, kind: 'xp', skill: 'Woodcutting', delta });
    host.trace(xp(1, 25));
    host.trace(xp(1, 50));
    const live = await api.getRun();
    expect(live.events).toHaveLength(1);
    expect(live.events[0]).toMatchObject({ seq: 1, kind: 'xp', delta: 50 });
  });

  // The flush cursor rides on the buffer's length, so a correction to a row already written to
  // IndexedDB has to pull the cursor back or the stored trace keeps the stale delta for ever.
  test('a correction to an already-flushed row pulls the flush cursor back to it', async () => {
    const { api, host, hist } = setup({ docs: [userDoc()] });
    await api.run('u1');
    const xp = (seq: number, delta: number): TraceEvent => ({ seq, at: seq, kind: 'xp', skill: 'Woodcutting', delta });
    host.trace(xp(1, 25));
    for (let i = 2; i <= 50; i++) host.trace(ev(i));
    expect(hist.appends).toHaveLength(1);
    // The very first row, corrected long after it reached IndexedDB, and then one ordinary
    // event: the cursor is back at row one, so the next flush carries the correction with it.
    host.trace(xp(1, 60));
    host.trace(ev(51));
    expect(hist.appends).toHaveLength(2);
    expect(hist.appends[1].events[0]).toMatchObject({ seq: 1, kind: 'xp', delta: 60 });
    expect(hist.appends[1].events.filter(e => e.seq === 1)).toHaveLength(1);
  });

  // The row a player sees while a run is still live, and the row that survives when the Worker
  // dies before it ever reports an end, both come from `seed()` rather than from `endSummary`.
  // The character is what tells two rows apart after a switch, so the seeded name is asserted as
  // the literal the session hands over and not merely as "something".
  test('the seeded history row names the character the run was started on', async () => {
    const { api, hist } = setup({ docs: [userDoc()] });
    await api.run('u1');
    expect(hist.puts[0].summary.characterName).toBe('Zezima');
    expect(hist.puts[0].summary.characterId).toBe('char-1');
    expect(hist.puts[0].summary).toMatchObject({
      status: 'starting', endedAt: null, itemsDelta: {}, tilesTravelled: 0, recoveries: {}
    });
  });

  test('a restart re-seeds with the character name rather than losing it', async () => {
    const installed = userDoc({ id: 'chop-and-drop', source: 'library', libraryId: 'chop-and-drop', code: '' });
    const { api, hist } = setup({ docs: [installed] });
    await api.run('chop-and-drop');
    expect(await api.restart()).toEqual({ runId: 'r2' });
    expect(hist.puts[1].summary.runId).toBe('r2');
    expect(hist.puts[1].summary.characterName).toBe('Zezima');
    expect(hist.puts[1].summary.characterId).toBe('char-1');
  });

  test('a repeated run_end for the same run is written once', async () => {
    const { api, host, hist } = setup({ docs: [userDoc()] });
    await api.run('u1');
    const summary: RunSummary = { ...hist.puts[0].summary, status: 'stopped', endedAt: 9, durationMs: 4, summary: 'stopped' };
    host.end({ runId: 'r1', outcome: 'stopped', summary });
    host.end({ runId: 'r1', outcome: 'stopped', summary: { ...summary, summary: 'the worker was terminated' } });
    await vi.waitFor(() => expect(hist.puts).toHaveLength(2));
    expect(hist.puts[1].summary.summary).toBe('stopped');
  });

  test('getRun with no id reads the live buffer; a known id reads history', async () => {
    const { api, host, hist } = setup({ docs: [userDoc()] });
    await api.run('u1');
    host.trace(ev(1));
    host.trace(ev(2));
    const live = await api.getRun();
    expect(live.events.map(e => e.seq)).toEqual([1, 2]);
    expect(live.summary.runId).toBe('r1');
    expect((await api.getRun(undefined, 1)).events.map(e => e.seq)).toEqual([2]);
    hist.store.set('old', { summary: { ...hist.puts[0].summary, runId: 'old' }, events: [ev(9)] });
    expect((await api.getRun('old')).events.map(e => e.seq)).toEqual([9]);
    expect((await grab(api.getRun('gone'))).code).toBe('not_found');
  });

  test('onEvent relays host traces and onStatus fires on state changes', async () => {
    const { api, host } = setup();
    const events: TraceEvent[] = [];
    const states: string[] = [];
    api.onEvent(e => events.push(e));
    api.onStatus(s => states.push(s.state));
    await api.run('chop-and-drop');
    host.setStatus({ state: 'paused', reason: 'human-input' });
    host.trace(ev(1));
    expect(events).toHaveLength(1);
    expect(states).toEqual(['running', 'paused']);
  });

  // The transitions the api never asks for: the human-input timer auto-resuming, a `stuck` pause,
  // a run ending on its own. Publishing only from the trace handler left the run banner stuck on
  // "You took over" after an auto-resume, which also disabled its Escape panic key.
  test('a Worker-originated status change publishes with no trace event behind it', async () => {
    const { api, host } = setup();
    const seen: { state: string; reason: string | null }[] = [];
    await api.run('chop-and-drop');
    api.onStatus(s => seen.push({ state: s.state, reason: s.reason }));
    host.setStatus({ state: 'paused', reason: 'human-input' });
    host.setStatus({ state: 'running', reason: null });
    host.setStatus({ state: 'paused', reason: 'stuck' });
    // A repeat of the settled status is still de-duped: only real moves reach the banner.
    host.setStatus({ state: 'paused', reason: 'stuck' });
    expect(seen).toEqual([
      { state: 'paused', reason: 'human-input' },
      { state: 'running', reason: null },
      { state: 'paused', reason: 'stuck' }
    ]);
  });

  test('status reports the host status and never claims a tab attachment yet', async () => {
    const { api, host } = setup();
    host.setStatus({ state: 'running', runId: 'r1', resumeAtMs: 7777 });
    expect(api.status()).toMatchObject({ state: 'running', runId: 'r1', resumeAtMs: 7777, attached: false });
  });

  // The file a player keeps, or hands to Claude. It is the same pair `getRun` reports, so an
  // exported run and the report on screen cannot say different things.
  test('exportRun is the run as JSON, read back out of history', async () => {
    const { api, hist } = setup();
    hist.store.set('old', {
      summary: { runId: 'old', scriptName: 'Chop and drop' } as RunSummary,
      events: [{ seq: 1, at: 0, kind: 'status', text: 'chopping' }]
    });
    const blob = await api.exportRun('old');
    expect(blob.type).toBe('application/json');
    expect(JSON.parse(await textOf(blob))).toEqual({
      summary: { runId: 'old', scriptName: 'Chop and drop' },
      events: [{ seq: 1, at: 0, kind: 'status', text: 'chopping' }]
    });
  });

  // End to end for the trace cap, over the real `createTrace` and the real fan-out the Worker
  // forwards: a marker that is spliced into the trace's own list without being emitted reaches
  // no subscriber, so it reaches neither the buffer, nor the export, nor the report. Nothing in
  // production ever calls `trace.events()`, so the fan-out is the only door there is.
  test('the truncation marker travels from a real trace into the exported file', async () => {
    const { api, host } = setup({ docs: [userDoc()] });
    await api.run('u1');
    const trace = createTrace({ cap: 10 });
    trace.onEvent(e => { host.trace(e); });
    for (let i = 0; i < 40; i++) trace.push({ kind: 'status', text: String(i) });
    const exported = JSON.parse(await textOf(await api.exportRun('r1'))) as { events: TraceEvent[] };
    const markers = exported.events.filter(e => e.kind === 'truncated');
    expect(markers).toHaveLength(1);
    // Ten rows survive a cap of ten, one of them the marker: 31 status rows were dropped.
    expect(markers[0]).toMatchObject({ kind: 'truncated', dropped: 31 });
    const live = await api.getRun('r1');
    expect(buildRunReport(live.summary, live.events).droppedEvents).toBe(31);
  });

  test('exporting a run nobody has heard of rejects rather than saving an empty file', async () => {
    const { api } = setup();
    await expect(api.exportRun('nope')).rejects.toMatchObject({ code: 'not_found' });
  });

  test('listRuns, getState and screenshot pass through', async () => {
    const { api, hist, tr } = setup();
    hist.store.set('a', { summary: { runId: 'a' } as RunSummary, events: [] });
    expect((await api.listRuns(5)).map(r => r.runId)).toEqual(['a']);
    expect(api.getState()?.regionId).toBe(12_850);
    expect(await api.screenshot()).toBeInstanceOf(Blob);
    expect(tr.spies.screenshot).toHaveBeenCalled();
  });
});

describe('settings', () => {
  beforeEach(() => vi.clearAllMocks());

  test('defaults, persistence and echoing logs to chat', async () => {
    const { api, bag, host, tr } = setup();
    expect(api.settings.get()).toEqual({ resumeAfterHumanInputMs: 5000, echoLogsToChat: false, ...DEFAULT_BEHAVIOUR });
    api.settings.set({ echoLogsToChat: true });
    expect(bag.get('tasks.settings')).toBe(JSON.stringify({ resumeAfterHumanInputMs: 5000, echoLogsToChat: true, ...DEFAULT_BEHAVIOUR }));
    host.trace({ seq: 1, at: 1, kind: 'log', level: 'info', text: 'chopping' });
    host.trace({ seq: 2, at: 2, kind: 'status', text: 'ignored' });
    expect(tr.echoes).toEqual(['chopping']);
    api.settings.set({ echoLogsToChat: false });
    host.trace({ seq: 3, at: 3, kind: 'log', level: 'info', text: 'quiet' });
    expect(tr.echoes).toEqual(['chopping']);
  });

  test('the behaviour half rides the run message, because the Worker is where it is consumed', async () => {
    const { api, host } = setup();
    api.settings.set({ onDeath: 'loot-and-logout', onStuck: 'stop', maxRelogins: 0 });
    await api.run('chop-and-drop');
    expect(host.runs[0].behaviour).toEqual({ onDeath: 'loot-and-logout', onStuck: 'stop', maxRelogins: 0 });
  });

  test('changing a setting mid-run does not affect the run in flight', async () => {
    const { api, host } = setup();
    api.settings.set({ onDeath: 'logout' });
    await api.run('chop-and-drop');
    api.settings.set({ onDeath: 'pause', maxRelogins: 5 });
    // The ruling: the settings are read once, at run start. Nothing is re-posted, and what did
    // cross still says what the player had chosen when they pressed Run.
    expect(host.runs).toHaveLength(1);
    expect(host.runs[0].behaviour).toEqual({ onDeath: 'logout', onStuck: 'pause', maxRelogins: 2 });
    // And the new answers are waiting for the next run, which is what makes it a setting.
    expect(api.settings.get()).toMatchObject({ onDeath: 'pause', maxRelogins: 5 });
  });

  test('settings survive a reload through storage', () => {
    const { api, bag } = setup();
    api.settings.set({ resumeAfterHumanInputMs: 0 });
    const bag2 = new Map(bag);
    expect(JSON.parse(bag2.get('tasks.settings')!)).toMatchObject({ resumeAfterHumanInputMs: 0 });
    expect(api.settings.get().resumeAfterHumanInputMs).toBe(0);
  });
});

// SP7 gives every character iframe a runtime of its own, so tearing one down has to be a
// single call that leaves no Worker, no canvas listener and no hook subscription behind.
describe('dispose', () => {
  test('terminates the worker, releases the wiring, and is safe to call twice', () => {
    const { api, host, onDispose } = setup();
    api.dispose();
    api.dispose();
    expect(host.host.terminate).toHaveBeenCalledTimes(1);
    expect(onDispose).toHaveBeenCalledTimes(1);
  });

  test('a disposed api stops fanning status out to its subscribers', async () => {
    const { api, host } = setup();
    const seen: RunStatus[] = [];
    api.onStatus(s => seen.push(s));
    api.dispose();
    host.setStatus({ state: 'running', runId: 'r9' });
    expect(seen).toHaveLength(0);
  });

  // Both entry points post into the Worker, and the host respawns one on any post: a disposed
  // runtime that still answered them would bring a closed character's Worker back to life.
  test('the calls that post into the Worker are refused after dispose rather than respawning it', async () => {
    const { api, host } = setup();
    api.dispose();
    await expect(api.run('chop-and-drop')).rejects.toMatchObject({ code: 'disposed' });
    await expect(api.execute('return 1')).rejects.toMatchObject({ code: 'disposed' });
    await expect(api.restart()).rejects.toMatchObject({ code: 'disposed' });
    await expect(api.pause('player')).rejects.toMatchObject({ code: 'disposed' });
    await expect(api.resume('player')).rejects.toMatchObject({ code: 'disposed' });
    // `save` reaches the Worker through `host.compile`, and `install` reaches it through `save`.
    await expect(api.save({ name: 'n', description: '', tags: [], params: {}, code: 'x', source: 'user' })).rejects.toMatchObject({ code: 'disposed' });
    await expect(api.install('chop-and-drop')).rejects.toMatchObject({ code: 'disposed' });
    expect(host.host.compile).not.toHaveBeenCalled();
    expect(host.host.run).not.toHaveBeenCalled();
    expect(host.host.execute).not.toHaveBeenCalled();
    expect(host.host.pause).not.toHaveBeenCalled();
  });
});

describe('status fan-out', () => {
  test('a subscriber that throws costs neither the others their status nor the caller', () => {
    const { api, host } = setup();
    const seen: RunStatus[] = [];
    api.onStatus(() => { throw new Error('boom'); });
    api.onStatus(s => seen.push(s));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => host.setStatus({ state: 'running', runId: 'r9' })).not.toThrow();
    expect(seen).toHaveLength(1);
    spy.mockRestore();
  });
});
