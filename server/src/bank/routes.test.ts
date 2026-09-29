import { describe, expect, test } from 'bun:test';
import { createBankRoutes, isTrustedHookSource } from './routes';
import type { ManagementClient } from '../engine/managementClient';
import type { BankOp } from '../types';

const human = { kind: 'human' as const, uid: 'uidA', isAnonymous: false, authTime: Date.now() };
const agent = { kind: 'agent' as const, uid: 'uidA', tokenId: 't', mode: 'read' as const, characters: 'all' as const, contracts: 'deny' as const };

function stubClient(over: Partial<ManagementClient> = {}): ManagementClient {
  return {
    getBank: async ownerKey => ({ ownerKey, version: 2, capacity: 240, tabs: [], slots: [] }),
    applyBank: async () => ({ ok: true, version: 3 }),
    ...over
  };
}

describe('bank routes', () => {
  test('GET returns the caller\'s own bank, keyed by their uid', async () => {
    let asked = '';
    const routes = createBankRoutes({ client: stubClient({ getBank: async k => { asked = k; return { ownerKey: k, version: 2, capacity: 240, tabs: [], slots: [] }; } }), secret: 's' });
    const res = await routes.handle(new Request('http://x/api/bank'), { kind: 'bank', sub: 'get' }, human);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ownerKey: 'uidA', version: 2, capacity: 240 });
    expect(asked).toBe('uidA');
  });

  test('an agent bearer is refused outright in SP8, read as well as write', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's' });
    const read = await routes.handle(new Request('http://x/api/bank'), { kind: 'bank', sub: 'get' }, agent);
    expect(read.status).toBe(403);
    expect(await read.json()).toEqual({ error: 'human_only' });
    const write = await routes.handle(
      new Request('http://x/api/bank/ops', { method: 'POST', body: JSON.stringify({ expectedVersion: 2, ops: [{ op: 'swap', a: 0, b: 1 }] }) }),
      { kind: 'bank', sub: 'ops' }, agent);
    expect(write.status).toBe(403);
    expect(await write.json()).toEqual({ error: 'human_only' });
  });

  test('layout ops are forwarded with the caller\'s expectedVersion', async () => {
    // A list, not a nullable local: TS narrows a `let x = null` back to `null` at the assert.
    const sent: { key: string; version: number | null; ops: BankOp[] }[] = [];
    const routes = createBankRoutes({ client: stubClient({ applyBank: async (key, version, ops) => { sent.push({ key, version, ops }); return { ok: true, version: 3 }; } }), secret: 's' });
    const res = await routes.handle(
      new Request('http://x/api/bank/ops', { method: 'POST', body: JSON.stringify({ expectedVersion: 2, ops: [{ op: 'insert', from: 0, to: 3 }] }) }),
      { kind: 'bank', sub: 'ops' }, human);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 3 });
    expect(sent).toEqual([{ key: 'uidA', version: 2, ops: [{ op: 'insert', from: 0, to: 3 }] }]);
  });

  test('a delta op is refused: the browser can reorder the bank, never change what is in it', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's' });
    const res = await routes.handle(
      new Request('http://x/api/bank/ops', { method: 'POST', body: JSON.stringify({ expectedVersion: 2, ops: [{ op: 'delta', obj: 995, count: 1_000_000 }] }) }),
      { kind: 'bank', sub: 'ops' }, human);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'layout_only' });
  });

  test('a delta op never reaches the engine, even alongside a legal one', async () => {
    let called = false;
    const routes = createBankRoutes({ client: stubClient({ applyBank: async () => { called = true; return { ok: true, version: 3 }; } }), secret: 's' });
    const res = await routes.handle(
      new Request('http://x/api/bank/ops', { method: 'POST', body: JSON.stringify({ expectedVersion: 2, ops: [{ op: 'swap', a: 0, b: 1 }, { op: 'delta', obj: 995, count: 5 }] }) }),
      { kind: 'bank', sub: 'ops' }, human);
    expect(res.status).toBe(403);
    expect(called).toBe(false);
  });

  test('a malformed body and a missing expectedVersion are 400', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's' });
    for (const body of ['not json', JSON.stringify({ ops: [{ op: 'swap', a: 0, b: 1 }] }), JSON.stringify({ expectedVersion: 2, ops: 'x' }), JSON.stringify({ expectedVersion: 2, ops: [{ op: 'nope' }] })]) {
      const res = await routes.handle(new Request('http://x/api/bank/ops', { method: 'POST', body }), { kind: 'bank', sub: 'ops' }, human);
      expect(res.status).toBe(400);
    }
  });

  test('a 409 from the engine is passed through with the engine\'s version', async () => {
    const routes = createBankRoutes({ client: stubClient({ applyBank: async () => ({ ok: false, kind: 'conflict', version: 11 }) }), secret: 's' });
    const res = await routes.handle(
      new Request('http://x/api/bank/ops', { method: 'POST', body: JSON.stringify({ expectedVersion: 2, ops: [{ op: 'swap', a: 0, b: 1 }] }) }),
      { kind: 'bank', sub: 'ops' }, human);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'version', version: 11 });
  });

  test('an unreachable engine is 503, a rejected op is 422', async () => {
    const down = createBankRoutes({ client: stubClient({ applyBank: async () => ({ ok: false, kind: 'unavailable' }) }), secret: 's' });
    const bad = createBankRoutes({ client: stubClient({ applyBank: async () => ({ ok: false, kind: 'rejected', error: 'tab_invariant' }) }), secret: 's' });
    const body = JSON.stringify({ expectedVersion: 2, ops: [{ op: 'swap', a: 0, b: 1 }] });
    const downRes = await down.handle(new Request('http://x/api/bank/ops', { method: 'POST', body }), { kind: 'bank', sub: 'ops' }, human);
    expect(downRes.status).toBe(503);
    expect(await downRes.json()).toEqual({ error: 'unavailable' });
    expect((await bad.handle(new Request('http://x/api/bank/ops', { method: 'POST', body }), { kind: 'bank', sub: 'ops' }, human)).status).toBe(422);
  });

  test("a bank the engine will not hand over reads as 503 { error: 'unavailable' }", async () => {
    const routes = createBankRoutes({ client: stubClient({ getBank: async () => null }), secret: 's' });
    const res = await routes.handle(new Request('http://x/api/bank'), { kind: 'bank', sub: 'get' }, human);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
  });

  test('the change hook records the version, and refuses a non-loopback caller or a wrong secret', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's' });
    const post = (ip: string, secret: string) => routes.handleHook(
      new Request('http://x/internal/bank-changed', { method: 'POST', headers: { 'x-idlescape-mgmt': secret }, body: JSON.stringify({ ownerKey: 'uidA', version: 7 }) }), ip);

    expect((await post('203.0.113.9', 's')).status).toBe(403);
    expect((await post('127.0.0.1', 'nope')).status).toBe(401);
    expect((await post('127.0.0.1', 's')).status).toBe(204);
    expect(routes.versionOf('uidA')).toBe(7);
    expect(routes.versionOf('uidB')).toBeNull();
  });

  test('an untrusted caller is refused before the body is read, whatever the secret', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's' });
    for (const ip of ['203.0.113.9', '8.8.8.8', '::ffff:203.0.113.9', '2001:db8::1', '']) {
      const req = new Request('http://x/internal/bank-changed', { method: 'POST', headers: { 'x-idlescape-mgmt': 's' }, body: JSON.stringify({ ownerKey: 'uidA', version: 9 }) });
      expect((await routes.handleHook(req, ip)).status).toBe(403);
      expect(req.bodyUsed).toBe(false);
    }
    expect(routes.versionOf('uidA')).toBeNull();
  });

  test('the IPv6 loopback forms are accepted', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's' });
    for (const [i, ip] of ['::1', '::ffff:127.0.0.1'].entries()) {
      const res = await routes.handleHook(
        new Request('http://x/internal/bank-changed', { method: 'POST', headers: { 'x-idlescape-mgmt': 's' }, body: JSON.stringify({ ownerKey: 'uidC', version: i + 1 }) }), ip);
      expect(res.status).toBe(204);
    }
    expect(routes.versionOf('uidC')).toBe(2);
  });

  test('a spoofed cf-connecting-ip header cannot make a public caller look local', async () => {
    // index.ts hands handleHook the socket address, never clientIp()'s header preference;
    // this pins that the hook itself ignores any ip a caller claims in a header.
    const routes = createBankRoutes({ client: stubClient(), secret: 's' });
    const res = await routes.handleHook(
      new Request('http://x/internal/bank-changed', {
        method: 'POST',
        headers: { 'x-idlescape-mgmt': 's', 'cf-connecting-ip': '127.0.0.1', 'x-forwarded-for': '127.0.0.1' },
        body: JSON.stringify({ ownerKey: 'uidE', version: 3 })
      }), '203.0.113.9');
    expect(res.status).toBe(403);
    expect(routes.versionOf('uidE')).toBeNull();
  });

  test('the engine posting from a compose bridge address is accepted', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's' });
    const res = await routes.handleHook(
      new Request('http://x/internal/bank-changed', { method: 'POST', headers: { 'x-idlescape-mgmt': 's' }, body: JSON.stringify({ ownerKey: 'uidD', version: 4 }) }), '172.18.0.3');
    expect(res.status).toBe(204);
    expect(routes.versionOf('uidD')).toBe(4);
  });

  test('a non-ASCII secret header is a 401, not a crash', async () => {
    // 'e-acute' is one JS char but two UTF-8 bytes: the naive length check would have let it
    // through and timingSafeEqual would have thrown on mismatched buffer lengths.
    const routes = createBankRoutes({ client: stubClient(), secret: 's' });
    for (const secret of ['é', 'sé', 'éé']) {
      const res = await routes.handleHook(
        new Request('http://x/internal/bank-changed', { method: 'POST', headers: { 'x-idlescape-mgmt': secret }, body: JSON.stringify({ ownerKey: 'uidA', version: 1 }) }), '127.0.0.1');
      expect(res.status).toBe(401);
    }
  });

  test('an empty configured secret fails closed', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: '' });
    const res = await routes.handleHook(
      new Request('http://x/internal/bank-changed', { method: 'POST', headers: { 'x-idlescape-mgmt': '' }, body: JSON.stringify({ ownerKey: 'uidA', version: 1 }) }), '127.0.0.1');
    expect(res.status).toBe(401);
  });

  test('versionOf follows the last apply as well as the last hook', async () => {
    const routes = createBankRoutes({ client: stubClient({ applyBank: async () => ({ ok: true, version: 12 }) }), secret: 's' });
    await routes.handle(
      new Request('http://x/api/bank/ops', { method: 'POST', body: JSON.stringify({ expectedVersion: 11, ops: [{ op: 'sort', tab: 0, by: 'value' }] }) }),
      { kind: 'bank', sub: 'ops' }, human);
    expect(routes.versionOf('uidA')).toBe(12);
  });
});

describe('isTrustedHookSource', () => {
  test('loopback, in both families and the mapped form', () => {
    for (const ip of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) expect(isTrustedHookSource(ip)).toBe(true);
  });
  test('the private IPv4 ranges the engine container can land on', () => {
    for (const ip of ['10.0.0.4', '10.255.255.254', '172.16.0.1', '172.18.0.3', '172.31.255.254', '192.168.1.10']) {
      expect(isTrustedHookSource(ip)).toBe(true);
    }
  });
  test('the same ranges arriving mapped onto a dual-stack socket', () => {
    for (const ip of ['::ffff:10.0.0.4', '::ffff:172.18.0.3', '::ffff:192.168.1.10']) expect(isTrustedHookSource(ip)).toBe(true);
  });
  test('IPv6 unique local addresses (fc00::/7)', () => {
    for (const ip of ['fc00::1', 'fd12:3456:789a::1', 'FD00::2']) expect(isTrustedHookSource(ip)).toBe(true);
  });
  test('public addresses and the near-misses next to each range are refused', () => {
    for (const ip of ['203.0.113.9', '8.8.8.8', '11.0.0.1', '172.15.0.1', '172.32.0.1', '192.167.1.1', '192.169.1.1',
      '2001:db8::1', 'fe80::1', '::ffff:203.0.113.9', '', 'not-an-ip', '127.0.0.1.evil.com']) {
      expect(isTrustedHookSource(ip)).toBe(false);
    }
  });
});
