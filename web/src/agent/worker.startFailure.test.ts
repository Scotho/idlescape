// The Worker's run lifecycle has one window where a subscription is open and nothing owns its
// release yet: `createRunHealth` subscribes to the tick and event fan-outs before `current` - what
// `endRun` disposes - exists. Driving that window means making `createRunContext` throw, and a
// module mock needs its own module registry, so it needs its own file.
import { beforeAll, expect, test, vi } from 'vitest';
import { DEFAULT_BEHAVIOUR } from '../tasks/behaviour';
import type { MainToWorker, WorkerToMain, WorldState } from './types';

vi.mock('./runContext', () => ({
  createRunContext: () => { throw new Error('context exploded'); }
}));

const posted: WorkerToMain[] = [];
const WAIT = { timeout: 10_000, interval: 10 };

function send(m: MainToWorker): void {
  const handler = (self as unknown as { onmessage: ((e: MessageEvent) => void) | null }).onmessage;
  if (!handler) throw new Error('worker installed no message handler');
  handler({ data: m } as MessageEvent);
}

const WORLD = { tick: 7, inGame: true, player: { animId: -1 }, skills: [], inventory: [] } as unknown as WorldState;
const DEAD = { tick: 8, inGame: true, player: { animId: -1, worldX: 1, worldZ: 1, isDead: true, lifeId: 1 }, skills: [], inventory: [] } as unknown as WorldState;

const SCRIPT = `
export default defineScript({
  id: 'boom-script', name: 'Boom', version: 1, description: 'never gets a context',
  tasks: [{ name: 'noop', when: () => true, run: async () => ({ success: true, message: 'ok' }) }]
});
`;

beforeAll(async () => {
  vi.stubGlobal('postMessage', (m: WorkerToMain) => { posted.push(m); });
  await import('./worker');
}, 60_000);

test('a run that cannot build its context leaves nothing observing behind it', async () => {
  send({ t: 'state', state: WORLD });
  send({ t: 'run', runId: 'run-boom', scriptRef: { kind: 'user', code: SCRIPT }, params: {}, startedBy: 'player', characterId: null, characterName: null, behaviour: DEFAULT_BEHAVIOUR });
  await vi.waitFor(() => expect(posted.some(m => m.t === 'run_end')).toBe(true), WAIT);
  const end = posted.find(m => m.t === 'run_end');
  expect(end).toMatchObject({ runId: 'run-boom', outcome: 'failed' });
  expect(end?.summary.summary).toMatch(/context exploded/);

  posted.length = 0;
  // A death and a logout after the failed start. The monitor was already subscribed when the
  // context threw, and `current` was never assigned, so nothing but the failure path's own
  // `health.dispose()` can have released it.
  send({ t: 'state', state: DEAD });
  send({ t: 'event', event: { name: 'logout', payload: {} } });
  await Promise.resolve();
  expect(posted.filter(m => m.t === 'trace' && (m.event.kind === 'health' || m.event.kind === 'recovery'))).toEqual([]);
});
