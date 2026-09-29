// `TasksApi`'s catalogue and run-control surface: what `list`, `get`, `run`, `execute`,
// `dispatch`, the four control verbs, `restart`, `install` and `save` do. The trace buffer, the
// settings and the teardown are the other half of the api and live in api.runtime.test.ts; the
// fakes both files are built on live in api.harness.ts.
import { describe, expect, test, vi } from 'vitest';
import { CHOP, IDLE, grab, setup as wire, userDoc, world } from './api.harness';
import type { TraceEvent } from './types';

/** `setup` with this file's spy factory bound in; `vi` cannot reach the harness itself. */
const setup = (opts: Parameters<typeof wire>[1] = {}) => wire(vi.fn, opts);

describe('list', () => {
  test('merges library manifests and user docs with evaluated requirements', async () => {
    const { api } = setup({ docs: [userDoc()], state: world([]) });
    const all = await api.list();
    const chop = all.find(t => t.id === 'chop-and-drop')!;
    expect(chop).toMatchObject({ source: 'library', version: 3, order: 10, installed: false, estimateMinutes: 20 });
    expect(chop.requirements).toEqual({ ok: false, missing: ['Needs a bronze axe'] });
    expect(all.find(t => t.id === 'mine-and-drop')!.requirements).toEqual({ ok: true, missing: [] });
    const mine = all.find(t => t.id === 'u1')!;
    expect(mine).toMatchObject({ source: 'user', name: 'My miner', version: 2, order: 1000 });
  });

  test('an installed library reference folds into the library row rather than duplicating it', async () => {
    const doc = userDoc({
      id: 'chop-and-drop', source: 'library', libraryId: 'chop-and-drop', pinnedVersion: 3, code: '',
      lastRun: { runId: 'r0', at: 42, status: 'done', summary: 'chopped 12 logs' }
    });
    const { api } = setup({ docs: [doc] });
    const rows = (await api.list()).filter(t => t.id === 'chop-and-drop');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'library', installed: true, libraryId: 'chop-and-drop' });
    expect(rows[0].params).toEqual(CHOP.params);
    expect(rows[0].lastRun).toMatchObject({ runId: 'r0', summary: 'chopped 12 logs' });
  });
});

describe('get', () => {
  test('returns a user doc with its code and a library manifest without one', async () => {
    const { api } = setup({ docs: [userDoc()] });
    expect(await api.get('u1')).toMatchObject({ id: 'u1', code: 'export default defineScript({})', source: 'user' });
    expect(await api.get('chop-and-drop')).toMatchObject({ id: 'chop-and-drop', code: '', source: 'library' });
    expect((await grab(api.get('nope'))).code).toBe('not_found');
  });
});

describe('run', () => {
  test('refuses when requirements are unmet and names them', async () => {
    const { api, host } = setup({ state: world([]) });
    const err = await grab(api.run('chop-and-drop'));
    expect(err.code).toBe('requirements');
    expect(err.message).toContain('Needs a bronze axe');
    expect(err.detail).toEqual(['Needs a bronze axe']);
    expect(host.host.run).not.toHaveBeenCalled();
  });

  test('refuses while a run is live', async () => {
    const { api, host } = setup();
    host.setStatus({ state: 'paused', runId: 'r0' });
    expect((await grab(api.run('chop-and-drop'))).code).toBe('busy');
  });

  test('forwards a library ref with validated params and defaults', async () => {
    const { api, host } = setup();
    await api.run('chop-and-drop', { untilLevel: 20 }, { startedBy: 'claude' });
    expect(host.runs[0]).toEqual({
      scriptRef: { kind: 'library', id: 'chop-and-drop' },
      params: { untilLevel: 20, keepLogs: false }, startedBy: 'claude', characterId: 'char-1',
      // The name rides across beside the id so the Worker can put it on the summary it writes:
      // a history row read a month later says who ran it, not just which document id did.
      characterName: 'Zezima',
      // The behaviour half of the settings rides along: the policy is consumed inside the
      // Worker, and `api.settings` only exists out here.
      behaviour: { onDeath: 'loot', onStuck: 'pause', maxRelogins: 2 }
    });
  });

  test('rejects params outside the schema range', async () => {
    const { api } = setup();
    expect((await grab(api.run('chop-and-drop', { untilLevel: 200 }))).code).toBe('params');
    expect((await grab(api.run('chop-and-drop', { keepLogs: 'yes' }))).code).toBe('params');
  });

  test('forwards user code for a user doc, and the library ref for an installed one', async () => {
    const installed = userDoc({ id: 'chop-and-drop', source: 'library', libraryId: 'chop-and-drop', code: '' });
    const { api, host } = setup({ docs: [userDoc(), installed] });
    await api.run('u1');
    expect(host.runs[0].scriptRef).toEqual({ kind: 'user', code: 'export default defineScript({})' });
    host.setStatus({ ...IDLE });
    await api.run('chop-and-drop');
    expect(host.runs[1].scriptRef).toEqual({ kind: 'library', id: 'chop-and-drop' });
  });

  test('an installed library run still records lastRun on its doc', async () => {
    const installed = userDoc({ id: 'chop-and-drop', source: 'library', libraryId: 'chop-and-drop', code: '' });
    const { api, host, hist, store } = setup({ docs: [installed] });
    await api.run('chop-and-drop');
    host.end({ runId: 'r1', outcome: 'done', summary: { ...hist.puts[0].summary, status: 'done', endedAt: 12, summary: 'done' } });
    await vi.waitFor(() => expect(store.lastRuns).toEqual([{ id: 'chop-and-drop', at: 12 }]));
  });

  // A user doc carries no manifest, so its declared requirements are only visible once the
  // code is compiled; without this a fork of a library script lost every requirement it kept.
  test('a user script is compiled so its own requirements are enforced', async () => {
    const { api, host } = setup({ docs: [userDoc()], state: world([]) });
    host.compileResult = {
      ok: true,
      manifest: {
        id: 'my-miner', name: 'My miner', version: 1, description: '',
        requires: [{ kind: 'item', name: 'Bronze axe', text: 'Needs a bronze axe' }]
      }
    };
    const err = await grab(api.run('u1'));
    expect(err.code).toBe('requirements');
    expect(err.detail).toEqual(['Needs a bronze axe']);
    expect(host.host.compile).toHaveBeenCalledWith('export default defineScript({})');
    expect(host.host.run).not.toHaveBeenCalled();
  });

  test('a user script whose requirements are met runs', async () => {
    const { api, host } = setup({ docs: [userDoc()] });
    host.compileResult = {
      ok: true,
      manifest: {
        id: 'my-miner', name: 'My miner', version: 1, description: '',
        requires: [{ kind: 'item', name: 'Bronze axe', text: 'Needs a bronze axe' }]
      }
    };
    await api.run('u1');
    expect(host.runs[0].scriptRef).toEqual({ kind: 'user', code: 'export default defineScript({})' });
  });

  // Code that no longer compiles is the Worker's failure to report: it owns the compiler's
  // error message and writes the failed run to history, which a refusal here would skip.
  test('a user script that no longer compiles is left to the Worker to fail', async () => {
    const { api, host } = setup({ docs: [userDoc()] });
    host.compileResult = { ok: false, message: 'Unexpected token' };
    await api.run('u1');
    expect(host.runs).toHaveLength(1);
  });

  test('an unknown id is not_found', async () => {
    const { api } = setup();
    expect((await grab(api.run('nope'))).code).toBe('not_found');
  });
});

describe('per-script toggles', () => {
  test('a disabled script refuses to run, with a code the panels can branch on', async () => {
    const { api, host } = setup({ off: ['chop-and-drop'] });
    expect((await grab(api.run('chop-and-drop'))).code).toBe('disabled');
    expect(host.host.run).not.toHaveBeenCalled();
    // The refusal is per script, not a blanket one.
    await api.run('mine-and-drop');
    expect(host.host.run).toHaveBeenCalledTimes(1);
  });

  test('the toggle is checked before the requirements, so a turned-off script says so', async () => {
    const { api } = setup({ off: ['chop-and-drop'], state: world([]) });
    expect((await grab(api.run('chop-and-drop'))).code).toBe('disabled');
  });

  test('a run already in flight is not stopped by disabling its script', async () => {
    const { api, host } = setup();
    await api.run('chop-and-drop');
    await api.setEnabled('chop-and-drop', false);
    expect(host.host.stop).not.toHaveBeenCalled();
    expect(api.status().state).toBe('running');
    // ...but starting it again is refused.
    host.setStatus({ ...IDLE });
    expect((await grab(api.run('chop-and-drop'))).code).toBe('disabled');
  });

  test('setEnabled reaches the store and a re-enabled script runs again', async () => {
    const { api, toggles, host } = setup({ off: ['chop-and-drop'] });
    await api.setEnabled('chop-and-drop', true);
    expect(toggles.toggles.setEnabled).toHaveBeenCalledWith('chop-and-drop', true);
    await api.run('chop-and-drop');
    expect(host.host.run).toHaveBeenCalledTimes(1);
  });

  test('list reports the toggle so the row can render it', async () => {
    const { api } = setup({ off: ['mine-and-drop'], docs: [userDoc()] });
    const rows = await api.list();
    expect(rows.find(r => r.id === 'mine-and-drop')!.enabled).toBe(false);
    expect(rows.find(r => r.id === 'chop-and-drop')!.enabled).toBe(true);
    expect(rows.find(r => r.id === 'u1')!.enabled).toBe(true);
  });

  test('a user script carries its own toggle, and get reports it too', async () => {
    const { api } = setup({ off: ['u1'], docs: [userDoc()] });
    expect((await api.list()).find(r => r.id === 'u1')!.enabled).toBe(false);
    expect((await api.get('u1')).enabled).toBe(false);
    expect((await grab(api.run('u1'))).code).toBe('disabled');
  });

  test('setEnabled on a disposed runtime is refused rather than reaching the store', async () => {
    const { api, toggles } = setup();
    api.dispose();
    expect((await grab(api.setEnabled('chop-and-drop', false))).code).toBe('disposed');
    expect(toggles.toggles.setEnabled).not.toHaveBeenCalled();
  });

  test('setEnabled refuses an id no catalogue row has, so nothing is stored for it', async () => {
    const { api, toggles } = setup();
    expect((await grab(api.setEnabled('not-a-script', false))).code).toBe('not_found');
    expect(toggles.toggles.setEnabled).not.toHaveBeenCalled();
  });

  // Both restart paths are the same enforcement point as `run`: the run card's "Run again" and
  // `window.idlescape.tasks.restart()` must not start a script the account has turned off, and
  // the library branch reaches `host.restart` without ever passing through `run`.
  test('restarting a library run refused after its script was turned off', async () => {
    const { api, host } = setup();
    await api.run('chop-and-drop');
    await api.setEnabled('chop-and-drop', false);
    host.setStatus({ state: 'done' });
    expect((await grab(api.restart())).code).toBe('disabled');
    expect(host.host.restart).not.toHaveBeenCalled();
  });

  test('restarting a user run is refused before the running one is stopped', async () => {
    const { api, host } = setup({ docs: [userDoc()] });
    await api.run('u1');
    await api.setEnabled('u1', false);
    expect((await grab(api.restart())).code).toBe('disabled');
    expect(host.host.run).toHaveBeenCalledTimes(1);
    expect(host.host.stop).not.toHaveBeenCalled();
  });
});

describe('execute and dispatch', () => {
  test('refuse while running and work while paused', async () => {
    const { api, host } = setup();
    host.setStatus({ state: 'running' });
    expect((await grab(api.execute('return 1'))).code).toBe('run_active');
    expect((await grab(api.dispatch({ type: 'say', message: 'hi', reason: 'test' }))).code).toBe('run_active');
    host.setStatus({ state: 'paused' });
    expect(await api.execute('return 1')).toMatchObject({ ok: true, value: 42 });
    expect(await api.dispatch({ type: 'say', message: 'hi', reason: 'test' })).toMatchObject({ success: true });
  });
});

describe('pause, resume, stop, restart', () => {
  test('pause uses the actor as the reason and resume maps a refusal to a TasksError', async () => {
    const { api, host } = setup();
    await api.pause('player');
    expect(host.host.pause).toHaveBeenCalledWith('player', 'player');
    host.resumeResult = { ok: false, reason: 'paused_by_player' };
    expect((await grab(api.resume('claude'))).code).toBe('paused_by_player');
    host.resumeResult = { ok: false, reason: 'not_paused' };
    expect((await grab(api.resume('player'))).code).toBe('not_paused');
    host.resumeResult = { ok: true };
    await api.resume('player');
    expect(host.host.resume).toHaveBeenLastCalledWith('player');
    await api.stop('player');
    expect(host.host.stop).toHaveBeenCalledWith('player');
  });

  test('every deliberate control action cancels the human-input countdown', async () => {
    const { api, cancelHumanInput } = setup({ docs: [userDoc()] });
    await api.pause('player');
    await api.resume('player');
    await api.stop('player');
    expect(cancelHumanInput).toHaveBeenCalledTimes(3);
    await api.run('u1');
    await api.restart();
    expect(cancelHumanInput).toHaveBeenCalledTimes(4);
  });
});

describe('restart', () => {
  const ev = (seq: number): TraceEvent => ({ seq, at: seq, kind: 'status', text: `s${seq}` });

  test('refuses when nothing has run in this tab', async () => {
    const { api } = setup();
    expect((await grab(api.restart())).code).toBe('not_found');
  });

  test('a library run replays through the host and books the new runId in history', async () => {
    const installed = userDoc({ id: 'chop-and-drop', source: 'library', libraryId: 'chop-and-drop', code: '' });
    const { api, host, hist, store } = setup({ docs: [installed] });
    await api.run('chop-and-drop');
    host.trace(ev(1));
    expect(await api.restart()).toEqual({ runId: 'r2' });
    expect(host.host.restart).toHaveBeenCalled();
    expect(hist.puts[1].summary).toMatchObject({ runId: 'r2', scriptId: 'chop-and-drop', status: 'starting' });
    expect((await api.getRun()).summary.runId).toBe('r2');
    host.trace(ev(2));
    host.end({ runId: 'r2', outcome: 'done', summary: { ...hist.puts[1].summary, status: 'done', endedAt: 20, summary: 'ok' } });
    await vi.waitFor(() => expect(store.lastRuns).toEqual([{ id: 'chop-and-drop', at: 20 }]));
    // The restarted run's trace belongs to it alone; the first run's record is untouched.
    expect(hist.store.get('r2')!.events.map(e => e.seq)).toEqual([2]);
    expect(hist.store.get('r1')!.events).toEqual([]);
  });

  test('a user script is re-read from the store, so an edit between runs takes effect', async () => {
    const { api, host, store } = setup({ docs: [userDoc()] });
    await api.run('u1');
    store.docs.set('u1', userDoc({ code: 'export default defineScript({ edited: true })' }));
    expect(await api.restart()).toEqual({ runId: 'r2' });
    expect(host.host.restart).not.toHaveBeenCalled();
    expect(host.host.stop).toHaveBeenCalledWith('player');
    expect(host.runs[1].scriptRef).toEqual({ kind: 'user', code: 'export default defineScript({ edited: true })' });
    expect(host.runs[1].startedBy).toBe('player');
  });
});

describe('install and save', () => {
  test('install saves a library reference pinned to the current version', async () => {
    const { api, store } = setup();
    expect(await api.install('chop-and-drop')).toEqual({ id: 'chop-and-drop' });
    expect(store.saved[0]).toMatchObject({
      id: 'chop-and-drop', name: 'Chop and drop', source: 'library', libraryId: 'chop-and-drop', pinnedVersion: 3, code: ''
    });
    expect((await grab(api.install('nope'))).code).toBe('not_found');
  });

  test('save compiles first and reports compile errors', async () => {
    const { api, host, store } = setup();
    host.compileResult = { ok: false, message: 'Unexpected token', line: 4 };
    const err = await grab(api.save({ name: 'x', description: '', tags: [], params: {}, code: 'oops(', source: 'user' }));
    expect(err.code).toBe('compile_error');
    expect(err.detail).toMatchObject({ message: 'Unexpected token', line: 4 });
    expect(store.store.save).not.toHaveBeenCalled();
    host.compileResult = { ok: true, manifest: { id: 'my-script', name: 'Mine', version: 1, description: '' } };
    expect(await api.save({ name: 'x', description: '', tags: [], params: {}, code: 'ok', source: 'user' })).toEqual({ id: 'gen-1', version: 1 });
    expect(host.host.compile).toHaveBeenCalledWith('ok');
  });

  test('the store mints ids: the compiled manifest id never becomes the document id', async () => {
    const { api, store } = setup();
    const a = await api.save({ name: 'a', description: '', tags: [], params: {}, code: 'ok', source: 'user' });
    const b = await api.save({ name: 'b', description: '', tags: [], params: {}, code: 'ok', source: 'user' });
    // Both compile to the same `defineScript` id; neither may overwrite the other.
    expect(a.id).not.toBe(b.id);
    expect(store.docs.size).toBe(2);
    expect(store.saved.every(x => x.id === undefined)).toBe(true);
  });

  test('an explicit id overwrites that document and bumps its version', async () => {
    const { api, store } = setup();
    await api.save({ id: 'u9', name: 'a', description: '', tags: [], params: {}, code: 'ok', source: 'user' });
    expect(await api.save({ id: 'u9', name: 'a2', description: '', tags: [], params: {}, code: 'ok', source: 'user' })).toEqual({ id: 'u9', version: 2 });
    expect(store.docs.size).toBe(1);
  });

  test('save and remove without a signed-in user are not_signed_in', async () => {
    const { api, store } = setup();
    store.signOut();
    expect((await grab(api.save({ name: 'x', description: '', tags: [], params: {}, code: 'ok', source: 'user' }))).code).toBe('not_signed_in');
    expect((await grab(api.remove('u1'))).code).toBe('not_signed_in');
  });
});
