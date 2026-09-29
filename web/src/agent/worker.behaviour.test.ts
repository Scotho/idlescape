// The player's bot-behaviour settings, end to end inside the Worker: they cross on the `run`
// message, `resolvePolicy` puts the script's own `health` over them, and the ladder ends the run
// with the reason the player asked for. Its own file because importing `./worker` installs one
// message handler per module registry, and worker.test.ts is already at the 400-line ceiling.
import { beforeAll, expect, test, vi } from 'vitest';
import { DEFAULT_BEHAVIOUR } from '../tasks/behaviour';
import type { MainToWorker, WorkerToMain, WorldState } from './types';

const posted: WorkerToMain[] = [];
const WAIT = { timeout: 10_000, interval: 10 };

function send(m: MainToWorker): void {
  const handler = (self as unknown as { onmessage: ((e: MessageEvent) => void) | null }).onmessage;
  if (!handler) throw new Error('worker installed no message handler');
  handler({ data: m } as MessageEvent);
}

const found = <T extends WorkerToMain['t']>(t: T): Extract<WorkerToMain, { t: T }> | undefined =>
  posted.find(m => m.t === t) as Extract<WorkerToMain, { t: T }> | undefined;
const logged = (): string[] =>
  posted.flatMap(m => (m.t === 'trace' && m.event.kind === 'log' ? [m.event.text] : []));

const WORLD = { tick: 7, inGame: true, player: { animId: -1 }, skills: [], inventory: [] } as unknown as WorldState;
const DEAD = { tick: 8, inGame: true, player: { animId: -1, worldX: 1, worldZ: 1, isDead: true, lifeId: 1 }, skills: [], inventory: [] } as unknown as WorldState;
/** The server bringing the character back: every behaviour but `fail` waits this out first. */
const RESPAWNED = { ...DEAD, tick: 9, player: { ...DEAD.player, isDead: false } } as unknown as WorldState;

/** Parks on a long wait, and declares no health policy of its own, so it follows the player. */
const SILENT_SCRIPT = `
export default defineScript({
  id: 'silent-death', name: 'Silent', version: 1, description: 'parks, and says nothing about deaths',
  tasks: [{
    name: 'park', when: () => true, timeoutMs: 60000,
    run: async c => { await c.wait.until(() => false, { timeoutMs: 60000 }); return { success: true, message: 'unparked' }; }
  }]
});
`;

/** The same script, but declaring `fail`: a statement about itself that outranks the player. */
const OPINIONATED_SCRIPT = SILENT_SCRIPT
  .replace("id: 'silent-death'", "id: 'opinionated-death'")
  .replace('description:', "health: { onDeath: 'fail' }, description:");

beforeAll(async () => {
  vi.stubGlobal('postMessage', (m: WorkerToMain) => { posted.push(m); });
  await import('./worker');
}, 60_000);

/** Runs `code` against `behaviour`, kills the character, and waits for the run to end. */
async function die(runId: string, code: string, behaviour: Partial<typeof DEFAULT_BEHAVIOUR>): Promise<void> {
  posted.length = 0;
  send({ t: 'state', state: WORLD });
  send({
    t: 'run', runId, scriptRef: { kind: 'user', code }, params: {}, startedBy: 'player',
    characterId: null, characterName: null, behaviour: { ...DEFAULT_BEHAVIOUR, ...behaviour }
  });
  await vi.waitFor(() => expect(posted.some(m => m.t === 'trace' && m.event.kind === 'task_enter')).toBe(true), WAIT);
  send({ t: 'state', state: DEAD });
  send({ t: 'state', state: RESPAWNED });
  await vi.waitFor(() => expect(found('run_end')).toBeTruthy(), WAIT);
}

test('a script that declares no policy follows the setting the run message carried', async () => {
  await die('run-player-logout', SILENT_SCRIPT, { onDeath: 'logout' });
  // The whole chain in one run: the setting crossed on the message, `resolvePolicy` put it over
  // the script's silence, and the ladder ended the run with the player's reason, not with `died`.
  expect(logged()).toContain('run failed: logged_out');
  expect(found('run_end')).toMatchObject({ runId: 'run-player-logout', outcome: 'failed' });
  // The logout itself is a transport call, and the transport lives on the other side of the rpc.
  expect(posted.some(m => m.t === 'rpc' && m.method === 'logout')).toBe(true);
});

test('a script that declares one keeps it, whatever the player asked for', async () => {
  await die('run-script-fail', OPINIONATED_SCRIPT, { onDeath: 'logout' });
  // `fail` is the script making a statement about itself, so it outranks the setting - and it is
  // the one behaviour that never waits for a respawn, which is why `died` and not `logged_out`.
  expect(logged()).toContain('run failed: died');
  expect(posted.some(m => m.t === 'rpc' && m.method === 'logout')).toBe(false);
});
