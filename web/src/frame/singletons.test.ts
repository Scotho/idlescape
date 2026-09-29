// web/src/frame/singletons.test.ts -- the frame-lifetime pair, their producers, and the teardown.
import { describe, expect, it } from 'vitest';
import { createFrameSingletons, type FrameSingletonDeps } from './singletons';
import { createPairingStore, type AgentTokenRow } from './pairing';
import { fakeBankStore } from '../bank/store.fake';
import type { HealthSnapshot } from '../types';

const snapshot = (over: Partial<HealthSnapshot> = {}): HealthSnapshot => ({
  engine: 'up', engineUptimeMs: 1, version: '0.1.0', gateway: 'not_deployed',
  players: 0, wiki: 'up', management: 'up', ...over
});

function build(over: Partial<FrameSingletonDeps> = {}) {
  // version -1 is the store's own initial state: no read has landed yet.
  const bank = fakeBankStore({ version: -1, used: 0 });
  const uids: string[] = [];
  const pairingCalls = { subscribe: 0, unsubscribe: 0 };
  let push: ((rows: AgentTokenRow[]) => void) | null = null;
  // The REAL pairing store over a fake listener, not a stand-in for the store: its start/stop
  // bookkeeping is exactly what this file is asserting the singletons drive correctly.
  const pairing = createPairingStore({
    subscribeSessions: (uid, cb) => {
      uids.push(uid);
      pairingCalls.subscribe++;
      push = cb;
      return () => { pairingCalls.unsubscribe++; };
    }
  });
  const singletons = createFrameSingletons({
    info: () => null,
    notify: () => {},
    idToken: async () => 'id-token',
    createBank: () => bank.store,
    createPairing: () => pairing,
    ...over
  });
  return { singletons, bank, pairing, uids, pairingCalls, pushSnapshot: (rows: AgentTokenRow[]) => push?.(rows) };
}

describe('createFrameSingletons', () => {
  it('starts the pairing store and the bank store for one uid', () => {
    const f = build();
    f.singletons.start('uid1');
    expect(f.uids).toEqual(['uid1']);
    expect(f.bank.calls.start).toBe(1);
  });

  it('records the health snapshots the page watcher hands it, rather than polling for its own', () => {
    const f = build();
    f.singletons.start('uid1');
    expect(f.singletons.health()).toBeNull();
    f.singletons.onHealth(snapshot({ players: 3 }));
    expect(f.singletons.health()?.players).toBe(3);
  });

  it('keeps the last snapshot when a poll fails, rather than claiming a change', () => {
    const f = build();
    f.singletons.start('uid1');
    f.singletons.onHealth(snapshot({ gateway: 'up' }));
    f.singletons.onHealth(null);
    expect(f.singletons.health()?.gateway).toBe('up');
  });

  it('stops both stores exactly once, and a second stop is a no-op', () => {
    const f = build();
    f.singletons.start('uid1');
    f.singletons.stop();
    f.singletons.stop();
    expect(f.bank.calls.stop).toBe(1);
    expect(f.pairingCalls.unsubscribe).toBe(1);
  });

  it('says nothing about a gateway that comes up after stop(), or before start()', () => {
    const f = build();
    f.singletons.onHealth(snapshot({ gateway: 'up' }));   // nobody is signed in yet
    f.singletons.start('uid1');
    f.singletons.stop();
    f.singletons.onHealth(snapshot({ gateway: 'up' }));
    // Still recorded, because /health is what the SERVER is doing and does not belong to an
    // account; it simply announces nothing with no producer attached.
    expect(f.singletons.health()?.gateway).toBe('up');
    expect(f.singletons.bus.all()).toEqual([]);
  });

  it('a second account is a stop and a start, never two live listeners', () => {
    const f = build();
    f.singletons.start('uid1');
    f.singletons.start('uid2');
    expect(f.pairingCalls.unsubscribe).toBe(1);
    expect(f.uids).toEqual(['uid1', 'uid2']);
    expect(f.bank.calls.stop).toBe(1);
    expect(f.bank.calls.start).toBe(2);
  });

  it('dispose stops everything and fences the bus', () => {
    const f = build();
    f.singletons.start('uid1');
    const seen: string[] = [];
    f.singletons.bus.subscribe(e => seen.push(e.text));
    f.singletons.dispose();
    f.singletons.bus.emit({ characterId: null, characterName: null, type: 'bank', skill: null, text: 'late', tone: 'default', amount: null });
    expect(seen).toEqual([]);
    expect(f.singletons.bus.all()).toEqual([]);
    expect(f.bank.calls.stop).toBe(1);
  });

  it('does not come back from dispose, which would leave live listeners feeding a dead bus', () => {
    const f = build();
    f.singletons.start('uid1');
    f.singletons.dispose();
    f.singletons.start('uid2');
    expect(f.bank.calls.start).toBe(1);
    expect(f.uids).toEqual(['uid1']);
    expect(f.pairingCalls.subscribe).toBe(1);
  });

  it('attaches the pairing, bank and gateway producers, and takes all three down on stop', () => {
    const f = build();
    f.singletons.start('uid1');
    // The first of the first two is the baseline: the sessions already paired and the first bank
    // READ both say nothing. The gateway is the exception (it fires on the first poll that finds
    // it up, the case below), so this one holds it down and never lets it reach 'up'.
    f.singletons.onHealth(snapshot({ gateway: 'down' }));
    f.pushSnapshot([]);
    f.bank.push({ version: 7, used: 27 });
    expect(f.singletons.bus.all()).toEqual([]);

    f.pushSnapshot([{ id: 't1', label: 'MacBook', createdAt: 1, lastSeenAt: 1, revokedAt: null }]);
    f.bank.push({ version: 8, used: 28 });
    expect(f.singletons.bus.all().map(e => [e.type, e.text])).toEqual([
      ['claude', 'MacBook session paired'],
      ['bank', 'Bank updated — 28 / 240 slots used']
    ]);

    f.singletons.stop();
    f.bank.push({ version: 9, used: 29 });
    f.singletons.onHealth(snapshot({ gateway: 'up' }));
    expect(f.singletons.bus.all().length).toBe(2);
  });

  it('emits the gateway event on the transition into up, once per transition', () => {
    const f = build();
    f.singletons.start('uid1');
    f.singletons.onHealth(snapshot({ gateway: 'down' }));
    expect(f.singletons.bus.all()).toEqual([]);
    f.singletons.onHealth(snapshot({ gateway: 'up' }));
    f.singletons.onHealth(snapshot({ gateway: 'up' }));
    expect(f.singletons.bus.all().map(e => [e.type, e.text])).toEqual([
      ['claude', 'Gateway connected — ws ok']
    ]);
  });

  it('a second account starts the producers over, with a fresh baseline', () => {
    const f = build();
    f.singletons.start('uid1');
    f.pushSnapshot([{ id: 't1', label: 'MacBook', createdAt: 1, lastSeenAt: 1, revokedAt: null }]);
    f.bank.push({ version: 7, used: 27 });
    f.bank.push({ version: 8, used: 28 });
    expect(f.singletons.bus.all().length).toBe(1);         // uid1's bank change

    f.singletons.start('uid2');
    // uid2's first snapshot of each is uid2's baseline, whatever uid1 had seen. The bank store
    // survives the sign-out, so this is the case its stop()-clears-the-version rule exists for:
    // uid2's first read is a LOWER version than uid1's last, and it is still not a change.
    f.pushSnapshot([{ id: 't9', label: 'Desktop', createdAt: 1, lastSeenAt: 1, revokedAt: null }]);
    f.bank.push({ version: 3, used: 4 });
    expect(f.singletons.bus.all().length).toBe(1);
  });

  it('the pairing store it hands out is the one it started', () => {
    const f = build();
    f.singletons.start('uid1');
    f.pushSnapshot([{ id: 't1', label: 'MacBook', createdAt: 1, lastSeenAt: Date.now(), revokedAt: null }]);
    expect(f.singletons.pairing.state()).toBe('paired-live');
  });
});
