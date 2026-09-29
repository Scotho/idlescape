// The host's bridge to the game: the world state and hook events it pushes into the Worker, the
// transport rpc it answers on the Worker's behalf, and what it does with a snapshot the structured
// clone algorithm refuses. Run control and the Worker's life are workerHost.test.ts; the fakes
// both files run against live in workerHost.harness.ts.
import { describe, expect, test, vi } from 'vitest';
import { RUN, host as wire } from './workerHost.harness';
import type { MainToWorker, WorldState } from './types';
import type { TraceEvent } from '../tasks/types';

/** The harness with this file's spy factory bound in; `vi` cannot reach the harness itself. */
const host = () => wire(vi.fn);

describe('createWorkerHost', () => {
  test('a cancel message from the Worker drains the client queue', async () => {
    const { h, self, spies } = host();
    await h.run(RUN);                                   // the worker only exists once a run starts
    self.receive({ t: 'cancel' });
    expect(spies.cancel).toHaveBeenCalledTimes(1);
  });

  test('forwards world state once per tick, hook events and human input', async () => {
    const { h, posted, pushState, emit, human } = host();
    await h.run(RUN);
    pushState({ tick: 4 } as WorldState);
    pushState({ tick: 4 } as WorldState);
    pushState({ tick: 5 } as WorldState);
    emit('xp', { skill: 8, xp: 100, level: 1, delta: 25 });
    human();
    expect(posted.filter(m => m.t === 'state')).toHaveLength(2);
    expect(posted.filter(m => m.t === 'event')).toHaveLength(1);
    expect(posted.filter(m => m.t === 'human_input')).toHaveLength(1);
  });

  // The client collects world state on the vendored collector's non-publishing path, which never
  // advances `revision`: it is 0 for the life of the session while the tick climbs. Keying the
  // de-duplication on `revision` therefore dropped every snapshot after the first, and inside the
  // Worker `wait.*` never resolved, the runner's loop never woke and stuck detection never fired.
  test('posts every tick even when revision never advances', async () => {
    const { h, posted, pushState } = host();
    await h.run(RUN);
    for (const tick of [7, 8, 9, 10]) pushState({ tick, revision: 0 } as WorldState);
    const states = posted.filter(m => m.t === 'state') as Extract<MainToWorker, { t: 'state' }>[];
    expect(states.map(m => m.state.tick)).toEqual([7, 8, 9, 10]);
  });

  // A Worker only ever hears about state from the next tick onwards, so the very first `run`
  // evaluated its custom requirements (and every `wait.*`) against no snapshot at all until the
  // game ticked again. Seeding the fresh Worker with what the transport already holds makes
  // `latest` true on the first run.
  test('a freshly spawned Worker is seeded with the snapshot the transport already holds', async () => {
    const { h, posted, pushState } = host();
    const snapshot = { tick: 7 } as WorldState;
    pushState(snapshot);
    await h.run(RUN);
    expect(posted[0]).toMatchObject({ t: 'state', state: { tick: 7 } });
    expect(posted.findIndex(m => m.t === 'run')).toBeGreaterThan(0);
    // The seed counts as that tick's publication, so the next `onState` for it is still dropped.
    pushState(snapshot);
    expect(posted.filter(m => m.t === 'state')).toHaveLength(1);
  });

  test('answers an rpc dispatch by calling the transport and posting rpc_result', async () => {
    const { h, posted, self, spies } = host();
    await h.run(RUN);
    const action = { type: 'walk', reason: 'test' };
    self.receive({ t: 'rpc', callId: 'c1', target: 'transport', method: 'dispatch', args: [action, 5000] });
    await vi.waitFor(() => expect(posted.some(m => m.t === 'rpc_result')).toBe(true));
    expect(spies.dispatch).toHaveBeenCalledWith(action, 5000);
    expect(posted.find(m => m.t === 'rpc_result')).toEqual({ t: 'rpc_result', callId: 'c1', ok: true, value: { success: true, message: 'dispatched' } });
  });

  test('a synchronous transport method (echo) is answered too', async () => {
    const { h, posted, self, spies } = host();
    await h.run(RUN);
    self.receive({ t: 'rpc', callId: 'c9', target: 'transport', method: 'echo', args: ['hi', 'orange'] });
    await vi.waitFor(() => expect(posted.some(m => m.t === 'rpc_result')).toBe(true));
    expect(spies.echo).toHaveBeenCalledWith('hi', 'orange');
  });

  test('relogin and logout cross as rpc, so a recovery reaches the session the Worker cannot see', async () => {
    const { h, posted, self, spies } = host();
    await h.run(RUN);
    self.receive({ t: 'rpc', callId: 'c8', target: 'transport', method: 'relogin', args: [] });
    await vi.waitFor(() => expect(posted.some(m => m.t === 'rpc_result')).toBe(true));
    expect(spies.relogin).toHaveBeenCalledTimes(1);
    // `logout` answers void, so the proof it crossed is the transport call, not the reply.
    self.receive({ t: 'rpc', callId: 'c9', target: 'transport', method: 'logout', args: [] });
    await vi.waitFor(() => expect(spies.logout).toHaveBeenCalledTimes(1));
    expect(posted.find(m => m.t === 'rpc_result')).toEqual({ t: 'rpc_result', callId: 'c8', ok: true, value: { ok: true } });
  });

  test('a failing transport call is reported as rpc_result ok:false', async () => {
    const { h, posted, self, spies } = host();
    await h.run(RUN);
    spies.dispatch.mockRejectedValueOnce(new Error('no client'));
    self.receive({ t: 'rpc', callId: 'c2', target: 'transport', method: 'dispatch', args: [{ type: 'walk' }] });
    await vi.waitFor(() => expect(posted.some(m => m.t === 'rpc_result')).toBe(true));
    expect(posted.find(m => m.t === 'rpc_result')).toMatchObject({ ok: false, error: 'no client' });
  });

  test('a screenshot Blob crosses as a transferable ArrayBuffer', async () => {
    const { h, posted, self } = host();
    await h.run(RUN);
    self.receive({ t: 'rpc', callId: 'c3', target: 'transport', method: 'screenshot', args: [] });
    await vi.waitFor(() => expect(posted.some(m => m.t === 'rpc_result')).toBe(true));
    const reply = posted.find(m => m.t === 'rpc_result') as Extract<MainToWorker, { t: 'rpc_result' }>;
    const value = reply.value as { __blob: true; type: string; buffer: ArrayBuffer };
    expect(value.__blob).toBe(true);
    expect(value.type).toBe('image/png');
    expect(new Uint8Array(value.buffer)).toEqual(new Uint8Array([1, 2, 3]));
  });

  test('a state structured clone refuses falls back to a JSON copy and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { h, self, posted, pushState } = host();
      const traces: TraceEvent[] = [];
      h.onTrace(e => traces.push(e));
      await h.run(RUN);
      self.throwOn = m => m.t === 'state' && typeof (m.state as unknown as { bad?: unknown }).bad === 'function';
      pushState({ tick: 11, bad: () => {} } as unknown as WorldState);
      pushState({ tick: 12, bad: () => {} } as unknown as WorldState);
      const states = posted.filter(m => m.t === 'state');
      expect(states).toHaveLength(2);
      expect((states[0].state as unknown as { bad?: unknown }).bad).toBeUndefined();
      // Once per worker, to the console and to the trace the panel shows.
      expect(warn).toHaveBeenCalledTimes(1);
      expect(traces.filter(e => e.kind === 'log' && /structured-cloneable/.test(e.text))).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
  });

  test('a state that cannot even be JSON-copied is dropped, not thrown at the client', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { h, self, posted, pushState } = host();
      await h.run(RUN);
      self.throwOn = m => m.t === 'state';
      const circular = { tick: 13 } as unknown as WorldState & { self?: unknown };
      circular.self = circular;
      expect(() => pushState(circular)).not.toThrow();
      expect(posted.filter(m => m.t === 'state')).toHaveLength(0);
    } finally {
      warn.mockRestore();
    }
  });
});
