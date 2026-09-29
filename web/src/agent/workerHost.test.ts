// Run control and the Worker's own life: starting, restarting, stopping, terminating, the status
// and trace fan-out, and what a crashed Worker leaves behind. The bridge to the game - world
// state, hook events and transport rpc - is workerHost.bridge.test.ts; the fakes both files run
// against live in workerHost.harness.ts.
import { describe, expect, test, vi } from 'vitest';
import { BEHAVIOUR, RUN, host as wire, hostWithDefaultGrace, summary } from './workerHost.harness';
import type { MainToWorker, WorkerStatus } from './types';
import type { TraceEvent } from '../tasks/types';
import type { RunEnd } from './workerHost';

/** The harness with this file's spy factory bound in; `vi` cannot reach the harness itself. */
const host = () => wire(vi.fn);

describe('createWorkerHost', () => {
  test('run posts a run message with a generated runId and seeds the status', async () => {
    const { h, posted } = host();
    const { runId } = await h.run(RUN);
    expect(runId).toMatch(/\S/);
    const msg = posted.find(m => m.t === 'run');
    // `behaviour` rides the run message: the policy is consumed inside the Worker, and
    // `api.settings` only exists on this side of it.
    expect(msg).toMatchObject({ t: 'run', runId, scriptRef: RUN.scriptRef, params: { drop: true }, startedBy: 'player', characterId: 'char-1', characterName: 'Zezima', behaviour: BEHAVIOUR });
    expect(h.status()).toMatchObject({ state: 'starting', runId, scriptId: 'chop-and-drop', scriptName: 'Chop and drop' });
  });

  test('onStatus fires for a Worker-originated status change and for a run end', async () => {
    const { h, self } = host();
    const seen: string[] = [];
    h.onStatus(s => seen.push(`${s.state}:${s.reason ?? '-'}`));
    const { runId } = await h.run(RUN);
    // No trace event behind either of these: the auto-resume and the end come from the Worker.
    const from = (state: 'paused' | 'running', reason: 'human-input' | null): WorkerStatus => ({
      state, reason, task: 'chop', attempts: 1, runId, scriptId: 'chop-and-drop',
      scriptName: 'Chop and drop', statusLine: 'chopping oaks', target: null, health: null, xpPerHour: {}
    });
    self.receive({ t: 'status', status: from('paused', 'human-input') });
    self.receive({ t: 'status', status: from('running', null) });
    self.receive({ t: 'run_end', runId, outcome: 'done', summary: summary(runId) });
    expect(seen).toEqual(['starting:-', 'paused:human-input', 'running:-', 'done:-']);
    expect(h.status()).toMatchObject({ state: 'done' });
  });

  test('trace messages reach onTrace subscribers', async () => {
    const { h, self } = host();
    const seen: TraceEvent[] = [];
    h.onTrace(e => seen.push(e));
    await h.run(RUN);
    const event: TraceEvent = { seq: 1, at: 10, kind: 'log', level: 'info', text: 'hello' };
    self.receive({ t: 'trace', event });
    expect(seen).toEqual([event]);
  });

  test('status reflects the last status message plus the human-input resume time', async () => {
    const { h, self } = host();
    const { runId } = await h.run(RUN);
    self.receive({
      t: 'status',
      status: {
        state: 'running', reason: null, task: 'chop', attempts: 1, runId, scriptId: 'chop-and-drop',
        scriptName: 'Chop and drop', statusLine: 'chopping oaks',
        target: { via: 'scene', kind: 'tree', name: 'Oak', distance: 4 }, health: null, xpPerHour: { Woodcutting: 12_000 }
      }
    });
    expect(h.status()).toMatchObject({ state: 'running', task: 'chop', statusLine: 'chopping oaks', attempts: 1, attached: false, resumeAtMs: null });
    // The three live fields are the Worker's alone: the host carries them across untouched, and
    // the idle status it started from must not be left showing through.
    expect(h.status().target).toEqual({ via: 'scene', kind: 'tree', name: 'Oak', distance: 4 });
    expect(h.status().xpPerHour).toEqual({ Woodcutting: 12_000 });
    h.setResumeAt(1234);
    expect(h.status().resumeAtMs).toBe(1234);
  });

  test('execute and compile resolve from their result messages', async () => {
    const { h, posted, self } = host();
    const exec = h.execute('return 1', {});
    const call = posted.find(m => m.t === 'execute') as Extract<MainToWorker, { t: 'execute' }>;
    self.receive({ t: 'execute_result', callId: call.callId, ok: true, value: 1, logs: ['ran'] });
    await expect(exec).resolves.toEqual({ ok: true, value: 1, logs: ['ran'] });

    const compiled = h.compile('export default defineScript({})');
    const cc = posted.find(m => m.t === 'compile') as Extract<MainToWorker, { t: 'compile' }>;
    self.receive({ t: 'compile_result', callId: cc.callId, ok: false, message: 'nope', line: 3 });
    await expect(compiled).resolves.toEqual({ ok: false, message: 'nope', line: 3 });
  });

  test('pause and resume post control messages; resume resolves from resume_result', async () => {
    const { h, posted, self } = host();
    await h.run(RUN);
    h.pause('human-input', 'player');
    expect(posted.find(m => m.t === 'pause')).toMatchObject({ reason: 'human-input', by: 'player' });
    const resumed = h.resume('claude');
    expect(posted.find(m => m.t === 'resume')).toMatchObject({ by: 'claude' });
    self.receive({ t: 'resume_result', ok: false, reason: 'paused_by_player' });
    await expect(resumed).resolves.toEqual({ ok: false, reason: 'paused_by_player' });
  });

  test('stop posts stop and settles when the worker reports run_end', async () => {
    const { h, posted, self } = host();
    const { runId } = await h.run(RUN);
    const ends: string[] = [];
    h.onRunEnd(e => ends.push(`${e.runId}:${e.outcome}`));
    const stopped = h.stop('player');
    expect(posted.find(m => m.t === 'stop')).toMatchObject({ by: 'player' });
    self.receive({ t: 'run_end', runId, outcome: 'stopped', summary: summary(runId) });
    await stopped;
    expect(ends).toEqual([`${runId}:stopped`]);
    expect(h.status().state).toBe('stopped');
  });

  test('a restart re-reads the behaviour settings rather than replaying the ones the run started with', async () => {
    const { h, posted } = host();
    await h.run(RUN);
    await h.restart({ onDeath: 'logout', onStuck: 'stop', maxRelogins: 0 });
    const runs = posted.filter(m => m.t === 'run');
    // A restart is a run starting, so a setting the player changed between the two takes effect.
    expect(runs[0]).toMatchObject({ behaviour: BEHAVIOUR });
    expect(runs[1]).toMatchObject({ behaviour: { onDeath: 'logout', onStuck: 'stop', maxRelogins: 0 } });
  });

  test('restart stops the run and replaces the worker so edited library code is reloaded', async () => {
    const { h, posted, self } = host();
    const first = await h.run(RUN);
    const again = h.restart(BEHAVIOUR);
    self.receive({ t: 'run_end', runId: first.runId, outcome: 'stopped', summary: summary(first.runId) });
    const second = await again;
    expect(second.runId).not.toBe(first.runId);
    // A module the worker already imported never re-imports; only a new worker reloads it.
    expect(self.terminate).toHaveBeenCalledTimes(1);
    const runs = posted.filter(m => m.t === 'run');
    expect(runs).toHaveLength(2);
    expect(runs[1]).toMatchObject({ scriptRef: RUN.scriptRef, params: RUN.params });
  });

  test('a worker that never answers stop is killed and the run is still reported ended', async () => {
    const { h, self } = host();                       // stopGraceMs: 50
    const { runId } = await h.run(RUN);
    const ends: RunEnd[] = [];
    h.onRunEnd(e => ends.push(e));
    await h.stop('player');                           // the fake worker answers nothing
    expect(self.terminate).toHaveBeenCalled();
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({
      runId, outcome: 'stopped',
      summary: { runId, scriptId: 'chop-and-drop', scriptName: 'Chop and drop', version: 3, status: 'stopped', startedBy: 'player', characterId: 'char-1' }
    });
    expect(h.status().state).toBe('idle');
  });

  test('the stop grace defaults to five seconds when the shell injects none', async () => {
    // Measured on the live stack: a chop run stopped inside an SDK action took about 1.7 s to
    // unwind and report, and the 2 s this used to allow killed the Worker instead, so every
    // stopped library run wrote a summary with no xp, no items and no tiles. A literal, not the
    // module's own constant: an assertion against the constant passes for any value of it.
    vi.useFakeTimers();
    try {
      const { h, self } = hostWithDefaultGrace(vi.fn);
      await h.run(RUN);
      const stopped = h.stop('player');               // the fake worker answers nothing
      await vi.advanceTimersByTimeAsync(4_999);
      expect(self.terminate).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(self.terminate).toHaveBeenCalled();
      await stopped;
    } finally {
      vi.useRealTimers();
    }
  });

  test('terminating with no live run reports nothing', () => {
    const { h } = host();
    const ends: RunEnd[] = [];
    h.onRunEnd(e => ends.push(e));
    h.terminate();
    expect(ends).toHaveLength(0);
  });

  test('terminate kills the worker and returns the status to idle', async () => {
    const { h, self } = host();
    await h.run(RUN);
    h.terminate();
    expect(self.terminate).toHaveBeenCalled();
    expect(h.status()).toMatchObject({ state: 'idle', runId: null, task: null });
  });

  // `state: 'failed'` alone left the host holding a Worker that answers nothing: it is not a
  // live state, so the api's `busy` guard let the next run post into the corpse.
  test('a crashed worker is torn down, reported once, and replaced by the next run', async () => {
    const { h, self, spawns } = host();
    const { runId } = await h.run(RUN);
    const ends: RunEnd[] = [];
    h.onRunEnd(e => ends.push(e));
    expect(spawns()).toBe(1);

    self.crash();
    expect(self.terminate).toHaveBeenCalledTimes(1);
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({ runId, outcome: 'stopped' });
    expect(h.status()).toMatchObject({ state: 'failed', statusLine: 'worker crashed' });

    await h.run(RUN);
    expect(spawns()).toBe(2);
    expect(ends).toHaveLength(1);
  });

  test('an execute call outstanding when the worker crashes rejects', async () => {
    const { h, self } = host();
    const exec = h.execute('return 1', {});
    self.crash();
    await expect(exec).rejects.toThrow(/crashed/);
  });

  // Mirrors the client's hook emitter: these subscribers are panels, and one of them throwing
  // must not cost the others their status, trace or run end.
  test('a throwing subscriber does not stop the fan-out to the next one', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { h, self } = host();
      const states: string[] = [];
      const kinds: string[] = [];
      const ends: string[] = [];
      h.onStatus(() => { throw new Error('bad status subscriber'); });
      h.onStatus(s => states.push(s.state));
      h.onTrace(() => { throw new Error('bad trace subscriber'); });
      h.onTrace(e => kinds.push(e.kind));
      h.onRunEnd(() => { throw new Error('bad end subscriber'); });
      h.onRunEnd(e => ends.push(e.outcome));

      const { runId } = await h.run(RUN);
      self.receive({ t: 'trace', event: { seq: 1, at: 1, kind: 'log', level: 'info', text: 'hello' } });
      self.receive({ t: 'run_end', runId, outcome: 'done', summary: summary(runId) });

      expect(states).toEqual(['starting', 'done']);
      expect(kinds).toEqual(['log']);
      expect(ends).toEqual(['done']);
      expect(error).toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  test('an execute call outstanding when the worker is terminated rejects', async () => {
    const { h } = host();
    const exec = h.execute('return 1', {});
    h.terminate();
    await expect(exec).rejects.toThrow(/terminated/);
  });
});
