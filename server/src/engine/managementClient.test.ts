import { describe, expect, test } from 'bun:test';
import { createManagementClient } from './managementClient';

function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) => Promise.resolve(handler(String(input), init))) as unknown as typeof fetch;
}

describe('engine management client', () => {
  test('getBank sends the secret header and returns the snapshot', async () => {
    let seen = '';
    const client = createManagementClient({
      baseUrl: 'http://127.0.0.1:8897', secret: 'sec',
      fetchImpl: fakeFetch((url, init) => {
        expect(url).toBe('http://127.0.0.1:8897/owner/uidA/bank');
        seen = new Headers(init?.headers).get('x-idlescape-mgmt') ?? '';
        return Response.json({ ownerKey: 'uidA', version: 3, capacity: 240, tabs: [2], slots: [{ slot: 0, obj: 995, count: 5 }] });
      })
    });
    expect(await client.getBank('uidA')).toEqual({ ownerKey: 'uidA', version: 3, capacity: 240, tabs: [2], slots: [{ slot: 0, obj: 995, count: 5 }] });
    expect(seen).toBe('sec');
  });

  test('getBank returns null when the engine is unreachable or answers badly', async () => {
    const down = createManagementClient({ baseUrl: 'http://x', secret: 's', fetchImpl: fakeFetch(() => { throw new Error('ECONNREFUSED'); }) });
    expect(await down.getBank('uidA')).toBeNull();
    const bad = createManagementClient({ baseUrl: 'http://x', secret: 's', fetchImpl: fakeFetch(() => new Response('nope', { status: 500 })) });
    expect(await bad.getBank('uidA')).toBeNull();
  });

  test('applyBank maps 200, 409, 422 and transport failure onto the result union', async () => {
    const mk = (res: () => Response) => createManagementClient({ baseUrl: 'http://x', secret: 's', fetchImpl: fakeFetch(res) });
    expect(await mk(() => Response.json({ ownerKey: 'u', version: 4 })).applyBank('u', 3, [])).toEqual({ ok: true, version: 4 });
    expect(await mk(() => Response.json({ error: 'version', version: 9 }, { status: 409 })).applyBank('u', 3, [])).toEqual({ ok: false, kind: 'conflict', version: 9 });
    expect(await mk(() => Response.json({ error: 'insufficient' }, { status: 422 })).applyBank('u', 3, [])).toEqual({ ok: false, kind: 'rejected', error: 'insufficient' });
    expect(await mk(() => { throw new Error('down'); }).applyBank('u', 3, [])).toEqual({ ok: false, kind: 'unavailable' });
  });

  test("a suspended owner's 503 is unavailable, exactly like a transport failure (Task 8 ruling)", async () => {
    const client = createManagementClient({
      baseUrl: 'http://x', secret: 's',
      fetchImpl: fakeFetch(() => Response.json({ error: 'unavailable' }, { status: 503 }))
    });
    expect(await client.applyBank('u', 3, [])).toEqual({ ok: false, kind: 'unavailable' });
    expect(await client.getBank('u')).toBeNull();
  });

  test('a 401 from the engine is unavailable, not a rejected op', async () => {
    const client = createManagementClient({
      baseUrl: 'http://x', secret: 's',
      fetchImpl: fakeFetch(() => Response.json({ error: 'unauthorised' }, { status: 401 }))
    });
    expect(await client.applyBank('u', 3, [])).toEqual({ ok: false, kind: 'unavailable' });
  });

  test('applyBank posts expectedVersion and ops verbatim', async () => {
    let body: unknown = null;
    const client = createManagementClient({
      baseUrl: 'http://x', secret: 's',
      fetchImpl: fakeFetch((_url, init) => { body = JSON.parse(String(init?.body)); return Response.json({ ownerKey: 'u', version: 1 }); })
    });
    await client.applyBank('u', null, [{ op: 'swap', a: 1, b: 2 }]);
    expect(body).toEqual({ expectedVersion: null, ops: [{ op: 'swap', a: 1, b: 2 }] });
  });
});
