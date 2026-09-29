import { describe, expect, test } from 'bun:test';
import { createHealth, parsePlayerGauge } from './health';

function fakeFetch(status: number | 'throw'): typeof fetch {
  return (async () => {
    if (status === 'throw') throw new Error('ECONNREFUSED');
    return new Response(null, { status });
  }) as unknown as typeof fetch;
}

describe('health', () => {
  test('starts down, goes up after a successful probe', async () => {
    const h = createHealth({ engineHttp: 'http://engine', engineManagementHttp: 'http://mgmt', engineManagementSecret: '', intervalMs: 60_000, wikiUp: () => true, fetchImpl: fakeFetch(200) });
    expect(h.snapshot().engine).toBe('down');
    await h.probe();
    expect(h.snapshot().engine).toBe('up');
    expect(h.snapshot().engineUptimeMs).toBeGreaterThanOrEqual(0);
  });

  test('goes down when the probe throws and resets uptime', async () => {
    const h = createHealth({ engineHttp: 'http://engine', engineManagementHttp: 'http://mgmt', engineManagementSecret: '', intervalMs: 60_000, wikiUp: () => true, fetchImpl: fakeFetch(200) });
    await h.probe();
    h.setFetch(fakeFetch('throw'));
    await h.probe();
    expect(h.snapshot().engine).toBe('down');
    expect(h.snapshot().engineUptimeMs).toBe(0);
  });

  test('treats non-2xx as down', async () => {
    const h = createHealth({ engineHttp: 'http://engine', engineManagementHttp: 'http://mgmt', engineManagementSecret: '', intervalMs: 60_000, wikiUp: () => true, fetchImpl: fakeFetch(503) });
    await h.probe();
    expect(h.snapshot().engine).toBe('down');
  });

  test('the snapshot carries exactly its documented keys', () => {
    const snap = createHealth({ engineHttp: 'http://engine', engineManagementHttp: 'http://mgmt', engineManagementSecret: '', intervalMs: 60_000, wikiUp: () => true, fetchImpl: fakeFetch(200) }).snapshot();
    expect(Object.keys(snap).sort()).toEqual(['engine', 'engineUptimeMs', 'gateway', 'management', 'players', 'version', 'wiki']);
  });

  test('gateway is not_deployed until sub-project 2 wires it up', () => {
    expect(createHealth({ engineHttp: 'http://engine', engineManagementHttp: 'http://mgmt', engineManagementSecret: '', intervalMs: 60_000, wikiUp: () => true, fetchImpl: fakeFetch(200) }).snapshot().gateway).toBe('not_deployed');
  });

  test('reflects whether the wiki db is open', () => {
    const h = createHealth({ engineHttp: 'http://engine', engineManagementHttp: 'http://mgmt', engineManagementSecret: '', intervalMs: 60_000, wikiUp: () => true, fetchImpl: fakeFetch(200) });
    expect(h.snapshot().wiki).toBe('up');
    expect(createHealth({ engineHttp: 'http://engine', engineManagementHttp: 'http://mgmt', engineManagementSecret: '', intervalMs: 60_000, wikiUp: () => false, fetchImpl: fakeFetch(200) }).snapshot().wiki).toBe('missing');
  });
});

describe('players gauge', () => {
  test('parses the prometheus line', () => {
    expect(parsePlayerGauge('# HELP lostcity_active_players Active player count.\n# TYPE lostcity_active_players gauge\nlostcity_active_players 7\n')).toBe(7);
    expect(parsePlayerGauge('nothing here')).toBeNull();
  });
  test('parses a labelled gauge line from the real engine', () => {
    expect(parsePlayerGauge('lostcity_active_players{nodeId="10"} 7\n')).toBe(7);
  });
  test('parses a float value', () => {
    expect(parsePlayerGauge('lostcity_active_players 3.0\n')).toBe(3);
  });
  test('probe fills players from the management endpoint and nulls it on failure', async () => {
    const h = createHealth({ engineHttp: 'http://engine', engineManagementHttp: 'http://mgmt', engineManagementSecret: '', intervalMs: 60_000, wikiUp: () => true,
      fetchImpl: (async (url: string | URL | Request) => String(url).startsWith('http://mgmt')
        ? new Response('lostcity_active_players 3\n', { status: 200 })
        : new Response('', { status: 200 })) as typeof fetch });
    await h.probe();
    expect(h.snapshot().players).toBe(3);
    h.setFetch((async () => { throw new Error('down'); }) as unknown as typeof fetch);
    await h.probe();
    expect(h.snapshot().players).toBeNull();
  });
});

// Answers per URL rather than uniformly, because the management probe and the prometheus probe
// share a base URL and have to be told apart. Audit C07, decision D75.
function routedFetch(byPath: Record<string, number | 'throw'>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const key = Object.keys(byPath).find(p => url.includes(p));
    const status = key === undefined ? 404 : byPath[key]!;
    if (status === 'throw') throw new Error('ECONNREFUSED');
    return new Response('lostcity_active_players 3\n', { status });
  }) as unknown as typeof fetch;
}

const opts = (over: Partial<Parameters<typeof createHealth>[0]> = {}): Parameters<typeof createHealth>[0] => ({
  engineHttp: 'http://engine', engineManagementHttp: 'http://mgmt', engineManagementSecret: 'm'.repeat(32),
  intervalMs: 60_000, wikiUp: () => true, ...over
});

describe('management health', () => {
  test('a 200 from the overlay health route is up', async () => {
    const h = createHealth(opts({ fetchImpl: routedFetch({ '/rs2.cgi': 200, '/prometheus': 200, '/owner/health': 200 }) }));
    await h.probe();
    expect(h.snapshot().management).toBe('up');
  });

  test('a 401 means the two halves hold different secrets', async () => {
    const h = createHealth(opts({ fetchImpl: routedFetch({ '/rs2.cgi': 200, '/prometheus': 200, '/owner/health': 401 }) }));
    await h.probe();
    expect(h.snapshot().management).toBe('unauthorized');
  });

  test('a 404 means the engine started without a secret, and reads the same to the gate', async () => {
    const h = createHealth(opts({ fetchImpl: routedFetch({ '/rs2.cgi': 200, '/prometheus': 200, '/owner/health': 404 }) }));
    await h.probe();
    expect(h.snapshot().management).toBe('unauthorized');
  });

  test('an unreachable management port is down, not unauthorized', async () => {
    const h = createHealth(opts({ fetchImpl: routedFetch({ '/rs2.cgi': 200, '/prometheus': 200, '/owner/health': 'throw' }) }));
    await h.probe();
    expect(h.snapshot().management).toBe('down');
  });

  test('no configured secret is unconfigured, and the route is never probed', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: string) => { seen.push(String(input)); return new Response('', { status: 200 }); }) as unknown as typeof fetch;
    const h = createHealth(opts({ engineManagementSecret: '', fetchImpl }));
    await h.probe();
    expect(h.snapshot().management).toBe('unconfigured');
    expect(seen.some(u => u.includes('/owner/health'))).toBe(false);
  });

  // The header is the whole mechanism: without it the real route answers 401, so a probe that
  // forgets it would report `unauthorized` against a perfectly healthy overlay.
  test('the probe sends the configured secret as the x-idlescape-mgmt header', async () => {
    const headers: (string | undefined)[] = [];
    const fetchImpl = (async (input: string, init?: RequestInit) => {
      if (String(input).includes('/owner/health')) {
        headers.push(new Headers(init?.headers).get('x-idlescape-mgmt') ?? undefined);
      }
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;
    const h = createHealth(opts({ engineManagementSecret: 's'.repeat(32), fetchImpl }));
    await h.probe();
    expect(headers).toEqual(['s'.repeat(32)]);
  });

  test('the secret never appears in the snapshot', async () => {
    const secret = 'm'.repeat(32);
    const h = createHealth(opts({ engineManagementSecret: secret, fetchImpl: routedFetch({ '/rs2.cgi': 200, '/prometheus': 200, '/owner/health': 200 }) }));
    await h.probe();
    expect(JSON.stringify(h.snapshot())).not.toContain(secret);
  });
});
