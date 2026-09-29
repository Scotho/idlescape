import { describe, expect, test, vi } from 'vitest';
import { createRpcClient } from './rpc';

type Req = { callId: string };

function client() {
  const sent: Req[] = [];
  const rpc = createRpcClient<Req, string>(m => sent.push(m));
  return { rpc, sent };
}

describe('createRpcClient', () => {
  test('call sends a framed request and resolves when it is settled ok', async () => {
    const { rpc, sent } = client();
    const p = rpc.call(callId => ({ callId }));
    expect(sent).toHaveLength(1);
    expect(rpc.size).toBe(1);
    expect(rpc.settle(sent[0].callId, true, 'pong')).toBe(true);
    await expect(p).resolves.toBe('pong');
    expect(rpc.size).toBe(0);
  });

  test('settling with ok:false rejects with the error text', async () => {
    const { rpc, sent } = client();
    const p = rpc.call(callId => ({ callId }));
    rpc.settle(sent[0].callId, false, undefined, 'boom');
    await expect(p).rejects.toThrow('boom');
  });

  test('settling an unknown call id returns false and changes nothing', async () => {
    const { rpc, sent } = client();
    const p = rpc.call(callId => ({ callId }));
    expect(rpc.settle('nope', true, 'x')).toBe(false);
    expect(rpc.size).toBe(1);
    rpc.settle(sent[0].callId, true, 'ok');
    await expect(p).resolves.toBe('ok');
  });

  test('call ids are unique per client', () => {
    const { rpc, sent } = client();
    void rpc.call(callId => ({ callId })).catch(() => {});
    void rpc.call(callId => ({ callId })).catch(() => {});
    expect(sent[0].callId).not.toBe(sent[1].callId);
    rpc.rejectAll('done');
  });

  test('a call that is never settled rejects after its timeout', async () => {
    vi.useFakeTimers();
    try {
      const { rpc } = client();
      const p = rpc.call(callId => ({ callId }), 1000);
      const settled = p.then(() => 'resolved', (e: Error) => e.message);
      await vi.advanceTimersByTimeAsync(999);
      expect(rpc.size).toBe(1);
      await vi.advanceTimersByTimeAsync(2);
      await expect(settled).resolves.toMatch(/timed out/);
      expect(rpc.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test('rejectAll rejects every outstanding call and clears the pending map', async () => {
    const { rpc } = client();
    const a = rpc.call(callId => ({ callId }));
    const b = rpc.call(callId => ({ callId }));
    rpc.rejectAll('worker terminated');
    await expect(a).rejects.toThrow('worker terminated');
    await expect(b).rejects.toThrow('worker terminated');
    expect(rpc.size).toBe(0);
  });
});
