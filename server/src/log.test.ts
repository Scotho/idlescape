import { describe, expect, test } from 'bun:test';
import { requestLine, shouldLog, withAccessLog } from './log';
import { classify } from './router';

// The shape server/src/pair/store.ts mints: PAIR_TOKEN_LEN = 32 characters of the token alphabet.
const PAIR_TOKEN = 'Yq3Kd8vN1sTm0aWpZbXcLrEfGhJi2u4Q';

describe('request log', () => {
  // The kind names below are the members of server/src/router.ts's `Route` union, re-read at HEAD.
  // Inventing one ('proxy' is not a member) makes a test that asserts nothing about this server.
  test('the five kinds a client boot floods are not logged when they succeed', () => {
    expect(shouldLog('static', 200)).toBe(false);   // /assets/*
    expect(shouldLog('index', 200)).toBe(false);    // /
    expect(shouldLog('page', 200)).toBe(false);     // /play.html, /styleguide
    expect(shouldLog('client', 200)).toBe(false);   // /client/client.js and friends
    expect(shouldLog('cache', 200)).toBe(false);    // /crc, /title, /config, ... and every .mid
    expect(shouldLog('static', 304)).toBe(false);
    expect(shouldLog('cache', 304)).toBe(false);
  });

  test('a failing one of those is logged, because that is the incident', () => {
    expect(shouldLog('static', 404)).toBe(true);
    expect(shouldLog('static', 502)).toBe(true);
    expect(shouldLog('client', 404)).toBe(true);
    expect(shouldLog('cache', 502)).toBe(true);
  });

  test('every other route is logged whatever it answers', () => {
    for (const kind of ['health', 'pair', 'bankHook', 'characters', 'bank', 'wiki', 'wikiApi', 'notfound']) {
      expect(shouldLog(kind, 200)).toBe(true);
    }
  });

  test('the line is one line of JSON with no newline inside it', () => {
    const line = requestLine({ method: 'POST', path: '/api/pair', status: 401, ms: 12, kind: 'pair' });
    expect(line.includes('\n')).toBe(false);
    expect(JSON.parse(line)).toEqual({ t: 'req', method: 'POST', path: '/api/pair', status: 401, ms: 12, kind: 'pair' });
  });

  test('a query string never reaches the log', () => {
    // No route this server serves puts a secret in a query string today (the pairing token is a
    // path segment, covered below), but a caller is free to hand requestLine a full URL, so the
    // strip stays: a log is the wrong place to persist a query parameter a later route adds.
    const line = requestLine({ method: 'GET', path: '/api/pair?token=secret-value', status: 200, ms: 1, kind: 'pair' });
    expect(line).not.toContain('secret-value');
    expect(JSON.parse(line).path).toBe('/api/pair');
  });
});

describe('a secret in the path', () => {
  test('the pairing token classify() reads out of the path never reaches the log', () => {
    // Both pair routes carry the 32-character single-use secret as a path segment, and 'pair' is
    // not a quiet kind, so every one of these requests is logged. pair/store.ts keeps only
    // secretHash, so an unredacted line would be the one place the plaintext survives.
    for (const path of [`/pair/${PAIR_TOKEN}`, `/api/pair/${PAIR_TOKEN}/exchange`]) {
      const route = classify(path, false);
      expect(route.kind === 'pair' && route.token).toBe(PAIR_TOKEN);
      expect(shouldLog(route.kind, 200)).toBe(true);
      expect(requestLine({ method: 'GET', path, status: 200, ms: 3, kind: route.kind })).not.toContain(PAIR_TOKEN);
    }
  });

  test('what lands in the log instead names the route without the secret', () => {
    const fetched = requestLine({ method: 'GET', path: `/pair/${PAIR_TOKEN}`, status: 200, ms: 3, kind: 'pair' });
    expect(JSON.parse(fetched).path).toBe('/pair/<redacted>');
    const exchanged = requestLine({ method: 'POST', path: `/api/pair/${PAIR_TOKEN}/exchange`, status: 200, ms: 9, kind: 'pair' });
    expect(JSON.parse(exchanged).path).toBe('/api/pair/<redacted>/exchange');
  });

  test('a pair URL classify() rejects is redacted too, because the token in it is still live', () => {
    const path = `/pair/${PAIR_TOKEN}/extra`;
    expect(classify(path, false).kind).toBe('notfound');
    const line = requestLine({ method: 'GET', path, status: 404, ms: 1, kind: 'notfound' });
    expect(line).not.toContain(PAIR_TOKEN);
    expect(JSON.parse(line).path).toBe('/pair/<redacted>');
  });

  test('a path with no secret in it is logged verbatim', () => {
    // /api/pair is the mint, which carries no token, and the revoke id is a document id rather than
    // the agent secret. Redacting everything would be as useless as redacting nothing.
    expect(JSON.parse(requestLine({ method: 'POST', path: '/api/pair', status: 200, ms: 4, kind: 'pair' })).path).toBe('/api/pair');
    expect(JSON.parse(requestLine({ method: 'POST', path: '/api/agent-tokens/abc123/revoke', status: 204, ms: 4, kind: 'pair' })).path).toBe('/api/agent-tokens/abc123/revoke');
    expect(JSON.parse(requestLine({ method: 'GET', path: '/api/characters', status: 200, ms: 4, kind: 'characters' })).path).toBe('/api/characters');
  });
});

describe('withAccessLog', () => {
  test('a loud kind emits exactly one line, built from the request and from the answer', async () => {
    const lines: string[] = [];
    const res = await withAccessLog(new Request('http://front/api/health'), 'health', l => lines.push(l), async () => new Response('{}', { status: 200 }));
    expect(res?.status).toBe(200);
    expect(lines.length).toBe(1);
    const { ms, ...rest } = JSON.parse(lines[0] ?? '{}');
    expect(rest).toEqual({ t: 'req', method: 'GET', path: '/api/health', status: 200, kind: 'health' });
    expect(typeof ms).toBe('number');
    expect(ms).toBeGreaterThanOrEqual(0);
  });

  test('the status logged is the one the handler actually answered', async () => {
    const lines: string[] = [];
    await withAccessLog(new Request('http://front/api/pair', { method: 'POST' }), 'pair', l => lines.push(l), async () => new Response(null, { status: 401 }));
    expect(JSON.parse(lines[0] ?? '{}').status).toBe(401);
    expect(JSON.parse(lines[0] ?? '{}').method).toBe('POST');
  });

  test('a quiet success emits nothing at all', async () => {
    const lines: string[] = [];
    const res = await withAccessLog(new Request('http://front/client/client.js'), 'client', l => lines.push(l), async () => new Response('js', { status: 200 }));
    expect(res?.status).toBe(200);
    expect(lines).toEqual([]);
  });

  test('a websocket upgrade returns undefined and is neither timed nor logged', async () => {
    // Bun's fetch handler must return undefined once srv.upgrade has taken the socket; answering
    // with a Response there drops the connection. The wrapper passes it through untouched.
    const lines: string[] = [];
    const res = await withAccessLog(new Request('http://front/'), 'ws', l => lines.push(l), async () => undefined);
    expect(res).toBe(undefined);
    expect(lines).toEqual([]);
  });

  test('the path is taken from the URL, and the token in it is redacted end to end', async () => {
    const lines: string[] = [];
    await withAccessLog(new Request(`http://front/pair/${PAIR_TOKEN}?next=/connect`), 'pair', l => lines.push(l), async () => new Response('ok', { status: 200 }));
    expect(lines.length).toBe(1);
    expect(lines[0]).not.toContain(PAIR_TOKEN);
    expect(JSON.parse(lines[0] ?? '{}').path).toBe('/pair/<redacted>');
  });
});
