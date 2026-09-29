// P7's `c.screenshot`, on its own, for the same reason `workerContext.tutorial.test.ts` is on
// its own: the case needs a harness the main file's cannot be, one whose canvas capture a case
// can swap for a rejection, and `workerContext.test.ts` is at the 400-line ceiling.
//
// What is pinned here is the whole of P7. The capability was already reachable as
// `c.sdk.screenshot()`; the two things this member adds are that it resolves null instead of
// rejecting, and that the image is filed somewhere a reader can name, with only its id in the
// trace.
import { describe, expect, test } from 'vitest';
import { createWorkerContext } from './workerContext';
import { createTrace } from '../tasks/trace';
import { createDeprecations } from '../tasks/deprecate';
import { createAttachments } from '../tasks/attachments';
import type { Transport } from './types';
import type { Atlas } from '../tasks/types';

const EMPTY_ATLAS = {
  version: 1, source: { contentSha: 'x' }, kinds: {}, clusters: [], landmarks: [], routes: []
} as unknown as Atlas;

const RUN = 'run-1';

/** The one dependency a case here swaps: what the client's canvas capture does. */
type Capture = () => Promise<Blob>;

function harness(screenshot: Capture) {
  const attachments = createAttachments();
  const trace = createTrace();
  const abort = new AbortController();
  const transport = {
    getState: () => null,
    onState: () => () => {},
    onEvent: () => () => {},
    humanInput: () => () => {},
    dispatch: async () => ({ success: true, message: 'ok' }),
    say: async () => ({ success: true, message: 'ok' }),
    echo: () => {},
    screenshot,
    cancel: () => {},
    relogin: async () => ({ ok: true }),
    logout: () => {}
  } as unknown as Transport;
  const { ctx } = createWorkerContext({
    transport, trace, params: {}, signal: () => abort.signal,
    onTick: () => () => {},
    atlas: { load: async () => EMPTY_ATLAS, peek: () => EMPTY_ATLAS, nearestCluster: () => null, landmark: () => null },
    collision: { load: async () => true, ready: () => true },
    anchor: () => ({ x: 0, z: 0, level: 0 }),
    deprecations: createDeprecations(() => {}),
    attachments,
    runId: RUN,
    health: { is: () => false, last: () => null, recovered: () => {} }
  });
  return { ctx, trace, attachments };
}

/** The client with no canvas up, which is what `localTransport.ts:127` rejects on. */
const noCanvas: Capture = async () => { throw new Error('no canvas'); };
const png: Capture = async () => new Blob(['png']);

describe('c.screenshot', () => {
  test('returns null rather than rejecting when there is no canvas, and files the image', async () => {
    const h = harness(noCanvas);
    await expect(h.ctx.screenshot()).resolves.toBeNull();

    const ok = harness(png);
    const shot = await ok.ctx.screenshot({ label: 'stuck' });
    expect(shot).toBeInstanceOf(Blob);
    const row = ok.trace.events().find(e => e.kind === 'attachment') as { attachmentId: string; label: string };
    expect(row.label).toBe('stuck');
    expect(row).not.toHaveProperty('blob');        // R8: an id crosses postMessage, never a Blob
    expect(ok.attachments.get(row.attachmentId)).toBeInstanceOf(Blob);
  });

  test('a failed capture says so at warn and files nothing', async () => {
    const h = harness(noCanvas);
    await h.ctx.screenshot({ label: 'stuck' });
    expect(h.attachments.list(RUN)).toEqual([]);
    expect(h.trace.events().flatMap(e => (e.kind === 'log' && e.level === 'warn' ? [e.text] : [])))
      .toEqual([expect.stringContaining('no canvas')]);
  });

  // `attach: false` is for a script that wants the bytes and nothing else: a report builder that
  // is about to hand the image somewhere itself should not also spend a slot of the run's eight.
  test('attach false hands back the blob and files nothing', async () => {
    const h = harness(png);
    await expect(h.ctx.screenshot({ attach: false })).resolves.toBeInstanceOf(Blob);
    expect(h.attachments.list(RUN)).toEqual([]);
    expect(h.trace.events()).toEqual([]);
  });

  test('an unlabelled shot still files under a label a reader can see', async () => {
    const h = harness(png);
    await h.ctx.screenshot();
    expect(h.attachments.list(RUN)).toEqual([{ id: expect.any(String), label: 'screenshot' }]);
  });

  // The cap belongs to the store, but the run has to be the thing that spends it: a loop that
  // shoots every tick must leave the tab with eight images, not one per tick.
  test('a run keeps its last eight images and no more', async () => {
    const h = harness(png);
    for (let i = 0; i < 10; i++) await h.ctx.screenshot({ label: `shot ${i}` });
    expect(h.attachments.list(RUN).map(a => a.label)).toEqual([
      'shot 2', 'shot 3', 'shot 4', 'shot 5', 'shot 6', 'shot 7', 'shot 8', 'shot 9'
    ]);
    // Every shot still has its trace row: the trace is the record of what happened, and the
    // store is only where the bytes are. A reader of an id the cap has dropped gets nothing.
    const rows = h.trace.events().filter(e => e.kind === 'attachment');
    expect(rows).toHaveLength(10);
    expect(h.attachments.get((rows[0] as { attachmentId: string }).attachmentId)).toBeNull();
  });
});
