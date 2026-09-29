import { describe, expect, it } from 'vitest';
import { createRunContext, makeAnchor } from './runContext';
import { createTrace, type Trace } from '../tasks/trace';
import { createAttachments, type Attachments } from '../tasks/attachments';
import type { Transport, WorldState } from './types';
import type { TileLike } from '../tasks/types';

/** A transport that records every dispatch and answers success, so a refusal is visible. */
function recordingTransport(): {
  transport: Transport; dispatched: { type: string }[];
  stateSubs: Set<(s: WorldState) => void>; push(s: WorldState): void;
} {
  const dispatched: { type: string }[] = [];
  // A real subscribe and a real unsubscribe. `onState: () => () => {}` cannot tell a teardown
  // that released its subscriptions from one that quietly dropped them.
  const stateSubs = new Set<(s: WorldState) => void>();
  const transport = {
    getState: () => null,
    onState: (cb: (s: WorldState) => void) => { stateSubs.add(cb); return () => { stateSubs.delete(cb); }; },
    onEvent: () => () => {},
    humanInput: () => () => {},
    dispatch: (action: { type: string }) => { dispatched.push(action); return Promise.resolve({ success: true, message: 'ok' }); },
    say: () => Promise.resolve({ success: true, message: 'ok' }),
    echo: () => {},
    screenshot: () => Promise.resolve(new Blob()),
    cancel: () => {},
    relogin: () => Promise.resolve({ ok: true }),
    logout: () => {}
  } as unknown as Transport;
  return { transport, dispatched, stateSubs, push: s => { for (const cb of [...stateSubs]) cb(s); } };
}

function context(signal: () => AbortSignal, state: WorldState | null = null): {
  ctx: ReturnType<typeof createRunContext>['ctx']; dispatched: { type: string }[];
} {
  const { transport, dispatched } = recordingTransport();
  const built = createRunContext({
    transport, trace: createTrace(), params: {}, signal,
    onTick: () => () => {}, state: () => state
  });
  return { ctx: built.ctx, dispatched };
}

describe('the run context transport', () => {
  it('dispatches while the signal is live', async () => {
    const c = context(() => new AbortController().signal);
    const r = await c.ctx.sdk.sendWalk(3222, 3218);
    expect(r.success).toBe(true);
    expect(c.dispatched.map(a => a.type)).toEqual(['walkTo']);
  });

  it('refuses to dispatch once the signal it runs under has fired, and sends nothing', async () => {
    const abort = new AbortController();
    const c = context(() => abort.signal);
    abort.abort();
    const r = await c.ctx.sdk.sendWalk(3222, 3218);
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/aborted/);
    // Sending nothing is the point: a fresh RPC issued after a stop is what nothing cancels,
    // and it kept the Worker working past the host's two second stop grace.
    expect(c.dispatched).toEqual([]);
  });

  it('reads the signal at dispatch time, not at build time', async () => {
    // The runner installs a new signal per task through `setSignal`, so a context that froze
    // the first one would go on dispatching for a task that had already been aborted, which is
    // the bug this guards.
    const abort = new AbortController();
    let current = new AbortController().signal;
    const c = context(() => current);
    await c.ctx.sdk.sendWalk(3222, 3218);
    current = abort.signal;
    abort.abort();
    const second = await c.ctx.sdk.sendWalk(3200, 3200);
    expect(second.success).toBe(false);
    expect(c.dispatched).toHaveLength(1);
  });
});

describe('makeAnchor', () => {
  it('seeds from the player on first read, not when it is built', () => {
    let state: WorldState | null = null;
    const anchor = makeAnchor(() => state);
    state = { player: { worldX: 3222, worldZ: 3218, level: 1 } } as unknown as WorldState;
    expect(anchor()).toEqual({ x: 3222, z: 3218, level: 1 });
  });

  it('is a Tile, and both call shapes reach it', () => {
    const anchor = makeAnchor(() => ({ player: { worldX: 3222, worldZ: 3218, level: 1 } } as unknown as WorldState));
    expect(anchor()).toEqual({ x: 3222, z: 3218, level: 1 });
    expect(anchor({ x: 10, z: 20 })).toEqual({ x: 10, z: 20, level: 1 });   // omitted: the player's plane
    expect(anchor({ x: 10, z: 20, level: 2 })).toEqual({ x: 10, z: 20, level: 2 });
    expect(anchor(30, 40)).toEqual({ x: 30, z: 40, level: 1 });             // the deprecated arm still works
  });

  it('resolves an omitted level to the plane the player is on, not to the ground floor', () => {
    // The same rule `travel.to` applies to a level-less `TileLike` (`target.level ?? playerLevel`,
    // travel.ts:62). Before the anchor carried a level at all, travel filled the player's plane in
    // and the walk home was always attempted; an anchor set upstairs and handed back as level 0
    // would instead answer `needs_route` (travel.ts:106) at recovery.ts:134 and runHealth.ts:104,
    // which is a saved script's recovery quietly ceasing to walk anywhere.
    const upstairs = makeAnchor(() => ({ player: { worldX: 3222, worldZ: 3218, level: 1 } } as unknown as WorldState));
    expect(upstairs({ x: 10, z: 20 }).level).toBe(1);
    const positional = makeAnchor(() => ({ player: { worldX: 3222, worldZ: 3218, level: 1 } } as unknown as WorldState));
    expect(positional(30, 40).level).toBe(1);
    const ground = makeAnchor(() => ({ player: { worldX: 3222, worldZ: 3218, level: 0 } } as unknown as WorldState));
    expect(ground({ x: 10, z: 20 }).level).toBe(0);
  });

  it('falls through to the seed for a null or non-numeric first argument', () => {
    // Both arms are reached by string from saved script text that nothing typechecks.
    // `typeof null === 'object'`, so an unguarded object arm reads `.x` off null and throws
    // inside the player's run; a string first argument on the positional arm would store a
    // string `x` that every later distance check turns into NaN.
    const state = { player: { worldX: 3222, worldZ: 3218, level: 0 } } as unknown as WorldState;
    expect(makeAnchor(() => state)(null as unknown as TileLike)).toEqual({ x: 3222, z: 3218, level: 0 });
    expect(makeAnchor(() => state)('30' as unknown as number, 40)).toEqual({ x: 3222, z: 3218, level: 0 });
  });

  it('takes an explicit tile over the player, and keeps it', () => {
    const state = { player: { worldX: 3222, worldZ: 3218, level: 0 } } as unknown as WorldState;
    const anchor = makeAnchor(() => state);
    expect(anchor({ x: 3200, z: 3200 })).toEqual({ x: 3200, z: 3200, level: 0 });
    expect(anchor()).toEqual({ x: 3200, z: 3200, level: 0 });
  });

  it('hands back a copy, so a caller cannot move the anchor by writing to it', () => {
    const anchor = makeAnchor(() => null);
    const first = anchor({ x: 10, z: 20 });
    first.x = 999;
    expect(anchor()).toEqual({ x: 10, z: 20, level: 0 });
  });
});

describe('the run context deprecation notice', () => {
  it('warns once per run through the trace, and again after the context is disposed', () => {
    // The wiring, not the mechanism: `createDeprecations` is unit-tested on its own. What this
    // pins is that a run's context has one, that it writes to that run's trace at `warn`, and
    // that disposing it clears the set so the next run's player is told too.
    const { transport } = recordingTransport();
    const trace = createTrace();
    const built = createRunContext({
      transport, trace, params: {}, signal: () => new AbortController().signal,
      onTick: () => () => {}, state: () => null
    });
    built.ctx.anchor(10, 20);
    built.ctx.anchor(30, 40);
    expect(warnings(trace)).toEqual(['c.anchor(x, z) is deprecated. Use c.anchor({ x, z }). Removed in api 3.']);
    built.dispose();
    built.ctx.anchor(50, 60);
    expect(warnings(trace)).toHaveLength(2);
  });

  it('says nothing at all for the compliant call shape', () => {
    const { transport } = recordingTransport();
    const trace = createTrace();
    const built = createRunContext({
      transport, trace, params: {}, signal: () => new AbortController().signal,
      onTick: () => () => {}, state: () => null
    });
    expect(built.ctx.anchor({ x: 10, z: 20 })).toEqual({ x: 10, z: 20, level: 0 });
    expect(warnings(trace)).toEqual([]);
  });
});

describe('the run context teardown', () => {
  it('delegates to the context it wraps, so every state subscription is released', () => {
    // `createRunContext` wraps `createWorkerContext`'s `dispose` so it can also reset the
    // deprecation set, which makes teardown a seam of this module's own. Nothing else pins the
    // delegation: a wrapper that only reset the set would leave every subscription
    // `workerContext`'s `offs` holds live for the life of the Worker, including the one BotSDK
    // opens in its constructor, and every other test in the web suite would still pass.
    const { transport, stateSubs, push } = recordingTransport();
    const built = createRunContext({
      transport, trace: createTrace(), params: {}, signal: () => new AbortController().signal,
      onTick: () => () => {}, state: () => null
    });
    expect(stateSubs.size).toBe(1); // the SDK's own, opened in its constructor
    const seen: WorldState[] = [];
    void built.ctx.wait.until(s => { seen.push(s); return false; }, { timeoutMs: 60_000 });
    expect(stateSubs.size).toBe(2);
    const before = seen.length; // `wait.until` tests the current snapshot once before it waits
    built.dispose();
    expect(stateSubs.size).toBe(0);
    push({ tick: 7 } as unknown as WorldState);
    expect(seen).toHaveLength(before);
  });

  it('releases the images the run filed, so the store does not outlive it', async () => {
    // R8's store is Worker-scoped and keyed by context, which only works if a finished context
    // gives its key back: without this call the outer map grows one entry per run, holding up
    // to eight images each, for the life of the tab. Nothing else in the suite would notice.
    const { transport } = recordingTransport();
    const store = createAttachments();
    const trace = createTrace();
    const built = createRunContext({
      transport, trace, params: {}, signal: () => new AbortController().signal,
      onTick: () => () => {}, state: () => null, attachments: store
    });
    await built.ctx.screenshot({ label: 'before the walk home' });
    const row = trace.events().find(e => e.kind === 'attachment');
    expect(row).toMatchObject({ kind: 'attachment', label: 'before the walk home' });
    const id = (row as { attachmentId: string }).attachmentId;
    expect(store.get(id)).toBeInstanceOf(Blob);
    built.dispose();
    expect(store.get(id)).toBeNull();
  });

  it('keys each context separately, so one disposal leaves the other run its images', async () => {
    // The key is `ctx-${++contexts}`, and everything above rests on it being per context: one
    // store is shared by every run in the Worker, so a shared key would put two runs under one
    // cap of eight and let either disposal delete the other's images. Nothing else pins it.
    const store = createAttachments();
    const first = filing(store);
    const second = filing(store);
    await first.ctx.screenshot({ label: 'first run' });
    await second.ctx.screenshot({ label: 'second run' });
    const idOne = attachmentId(first.trace);
    const idTwo = attachmentId(second.trace);
    expect(idOne).not.toBe(idTwo);
    first.dispose();
    expect(store.get(idOne)).toBeNull();
    expect(store.get(idTwo)).toBeInstanceOf(Blob);
    second.dispose();
    expect(store.get(idTwo)).toBeNull();
  });
});

/** A run context over a store the test owns, so it can read back what a disposal released. */
function filing(store: Attachments): ReturnType<typeof createRunContext> & { trace: Trace } {
  const { transport } = recordingTransport();
  const trace = createTrace();
  return {
    ...createRunContext({
      transport, trace, params: {}, signal: () => new AbortController().signal,
      onTick: () => () => {}, state: () => null, attachments: store
    }),
    trace
  };
}

/** The id the one attachment row carries, which is all that crosses postMessage (R8). */
function attachmentId(trace: Trace): string {
  const row = trace.events().find(e => e.kind === 'attachment');
  expect(row).toBeTruthy();
  return (row as { attachmentId: string }).attachmentId;
}

/** Every `warn` line a trace holds, which is the shape a deprecation notice arrives in. */
function warnings(trace: Trace): string[] {
  return trace.events().flatMap(e => (e.kind === 'log' && e.level === 'warn' ? [e.text] : []));
}
