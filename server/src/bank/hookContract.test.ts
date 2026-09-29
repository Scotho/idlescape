/**
 * The change-hook CONTRACT between the engine overlay and this server.
 *
 * `routes.test.ts` exercises `handleHook` against requests this suite invents; the engine's
 * `notifyBankChanged` (engine-custom/src/idlescape/install.ts) is exercised in the engine's own
 * suite against a fake `fetch`. Both halves have always passed while disagreeing with each
 * other, and that is exactly where the Task 10 bug lived: the hook was signed with the OWNER
 * assertion secret, every post was refused with a 401, and nothing on either side said so.
 *
 * This is the one place that builds the request the way the engine builds it - same header name,
 * same body shape, the MANAGEMENT secret - and puts it through the real handler. The engine
 * cannot be imported here (different package, and the overlay is copied into a pinned upstream
 * clone), so the request construction is mirrored, in one function, next to the source it
 * mirrors. Change either side of the wire format and this fails in seconds instead of failing
 * every bank update.
 */
import { describe, expect, test } from 'bun:test';
import { createBankRoutes } from './routes';
import type { ManagementClient } from '../engine/managementClient';

/** At least 32 characters, the floor server/src/env.ts holds ENGINE_MANAGEMENT_SECRET to. */
const MANAGEMENT_SECRET = 'management-secret-at-least-32-chars';

const HOOK_URL = 'http://127.0.0.1:8787/internal/bank-changed';

/**
 * A byte-for-byte mirror of the engine's post:
 *
 *     void fetch(url, {
 *         method: 'POST',
 *         headers: { 'content-type': 'application/json', 'x-idlescape-mgmt': idlescapeConfig.managementSecret },
 *         body: JSON.stringify({ ownerKey, version }),
 *         signal: AbortSignal.timeout(2000)
 *     })
 *
 * (`notifyBankChanged`, engine-custom/src/idlescape/install.ts). The AbortSignal is the only
 * part left out: it is a client-side timeout and never reaches the server.
 */
function engineHookRequest(secret: string, ownerKey: string, version: number): Request {
  return new Request(HOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-idlescape-mgmt': secret },
    body: JSON.stringify({ ownerKey, version })
  });
}

function stubClient(): ManagementClient {
  return {
    getBank: async ownerKey => ({ ownerKey, version: 0, capacity: 240, tabs: [], slots: [] }),
    applyBank: async () => ({ ok: true, version: 1 })
  };
}

describe('engine change-hook contract', () => {
  test('the request the engine actually sends is accepted, and the version is recorded', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: MANAGEMENT_SECRET });

    const res = await routes.handleHook(engineHookRequest(MANAGEMENT_SECRET, 'uidEngine', 7), '127.0.0.1');

    expect(res.status).toBe(204);
    expect(routes.versionOf('uidEngine')).toBe(7);
  });

  test('a later post moves the recorded version, as the engine posts one per bumped tick', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: MANAGEMENT_SECRET });
    for (const version of [1, 2, 5]) {
      expect((await routes.handleHook(engineHookRequest(MANAGEMENT_SECRET, 'uidEngine', version), '127.0.0.1')).status).toBe(204);
    }
    expect(routes.versionOf('uidEngine')).toBe(5);
  });

  test('the same request signed with any other secret is a 401 and records nothing', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: MANAGEMENT_SECRET });

    // What Task 10 shipped: the hook signed with the OWNER assertion secret. Both secrets are
    // held to 32+ characters and are different values, so this is a silent 401 on every post
    // until someone looks at the engine's log.
    const ownerSecret = 'owner-assertion-secret-32-chars-aa';
    const res = await routes.handleHook(engineHookRequest(ownerSecret, 'uidEngine', 7), '127.0.0.1');

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(routes.versionOf('uidEngine')).toBeNull();
  });
});
