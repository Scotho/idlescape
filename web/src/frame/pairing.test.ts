// web/src/frame/pairing.test.ts -- the pairing truth, lifted out of the Claude panel (ruling R10).
import { describe, expect, it } from 'vitest';
import { SEEN_RECENTLY_MS, createPairingStore, type AgentTokenRow, type PairingState } from './pairing';

const row = (over: Partial<AgentTokenRow> = {}): AgentTokenRow =>
  ({ id: 't1', label: 'MacBook', createdAt: 1, lastSeenAt: 1, revokedAt: null, ...over });

function fakeDeps(startAt = 1000) {
  let clock = startAt;
  let push: ((rows: AgentTokenRow[]) => void) | null = null;
  const uids: string[] = [];
  const calls = { subscribe: 0, unsubscribe: 0 };
  return {
    uids,
    calls,
    set now(value: number) { clock = value; },
    pushSnapshot: (rows: AgentTokenRow[]): void => { push?.(rows); },
    deps: {
      now: () => clock,
      subscribeSessions: (uid: string, cb: (rows: AgentTokenRow[]) => void): (() => void) => {
        uids.push(uid);
        calls.subscribe++;
        push = cb;
        // The disposer counts and does NOT drop `push`: a fake that stopped delivering would
        // hide the store's own fence, which is the thing the late-snapshot case below proves.
        return () => { calls.unsubscribe++; };
      }
    }
  };
}

describe('createPairingStore', () => {
  it('is unpaired before anything is heard, and reports the uid it was started for', () => {
    const f = fakeDeps();
    const store = createPairingStore(f.deps);
    expect(store.state()).toBe('unpaired');
    store.start('uid1');
    expect(f.uids).toEqual(['uid1']);
    expect(store.state()).toBe('unpaired');
  });

  it('derives paired-live from a token seen inside the window and paired-stale outside it', () => {
    const f = fakeDeps(100_000);
    const store = createPairingStore(f.deps);
    store.start('uid1');
    f.pushSnapshot([row({ lastSeenAt: 100_000 - SEEN_RECENTLY_MS })]);
    expect(store.state()).toBe('paired-live');
    f.pushSnapshot([row({ lastSeenAt: 100_000 - SEEN_RECENTLY_MS - 1 })]);
    expect(store.state()).toBe('paired-stale');
    f.pushSnapshot([row({ lastSeenAt: null })]);
    expect(store.state()).toBe('paired-stale');
  });

  it('re-derives from the clock, so a live token goes stale without a new snapshot', () => {
    const f = fakeDeps(100_000);
    const store = createPairingStore(f.deps);
    store.start('uid1');
    f.pushSnapshot([row({ lastSeenAt: 100_000 })]);
    expect(store.state()).toBe('paired-live');
    f.now = 100_000 + SEEN_RECENTLY_MS + 1;
    expect(store.state()).toBe('paired-stale');
  });

  it('ignores a revoked token, which is what unpaired means', () => {
    const f = fakeDeps();
    const store = createPairingStore(f.deps);
    store.start('uid1');
    f.pushSnapshot([row({ revokedAt: 5 })]);
    expect(store.state()).toBe('unpaired');
    expect(store.sessions().map(r => r.id)).toEqual(['t1']);
  });

  it('publishes every snapshot to its subscribers with the derived state', () => {
    const f = fakeDeps(1000);
    const store = createPairingStore(f.deps);
    store.start('uid1');
    const seen: PairingState[] = [];
    store.subscribe(s => { seen.push(s); });
    f.pushSnapshot([row({ lastSeenAt: 1000 })]);
    f.pushSnapshot([row({ lastSeenAt: 1000, label: 'MacBook Pro' })]);
    expect(seen).toEqual(['paired-live', 'paired-live']);
    expect(store.sessions().map(r => r.label)).toEqual(['MacBook Pro']);
  });

  it('keeps reporting after every consumer unsubscribes, because the bar needs it with the panel shut', () => {
    const f = fakeDeps();
    const store = createPairingStore(f.deps);
    store.start('uid1');
    const off = store.subscribe(() => {});
    off();
    f.pushSnapshot([row({ createdAt: 1, lastSeenAt: 1000 })]);
    expect(store.state()).toBe('paired-live');
    expect(f.calls.unsubscribe).toBe(0);
  });

  it('stops the underlying listener exactly once, on stop()', () => {
    const f = fakeDeps();
    const store = createPairingStore(f.deps);
    store.start('uid1');
    store.stop(); store.stop();
    expect(f.calls.unsubscribe).toBe(1);
  });

  it('forgets its rows on stop, so a sign-out does not leave the bar claiming a pairing', () => {
    const f = fakeDeps();
    const store = createPairingStore(f.deps);
    store.start('uid1');
    f.pushSnapshot([row({ lastSeenAt: 1000 })]);
    store.stop();
    expect(store.state()).toBe('unpaired');
    expect(store.sessions()).toEqual([]);
  });

  it('re-subscribes for a second uid and drops the first listener', () => {
    const f = fakeDeps();
    const store = createPairingStore(f.deps);
    store.start('uid1');
    store.start('uid1');
    expect(f.calls.subscribe).toBe(1);        // the same uid twice is a no-op
    store.start('uid2');
    expect(f.calls.unsubscribe).toBe(1);
    expect(f.uids).toEqual(['uid1', 'uid2']);
  });

  it('fires nothing after stop, and a late snapshot cannot revive it', () => {
    const f = fakeDeps();
    const store = createPairingStore(f.deps);
    store.start('uid1');
    const seen: PairingState[] = [];
    store.subscribe(s => { seen.push(s); });
    store.stop();
    f.pushSnapshot([row({ lastSeenAt: 1000 })]);
    expect(seen).toEqual([]);
    expect(store.state()).toBe('unpaired');
  });
});
