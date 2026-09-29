// web/src/frame/eventProducers.test.ts -- the six producers that feed the frame's event bus.
//
// Every fake here is as strict as the real thing: fakeTasksApi implements the WHOLE TasksApi
// surface (api.harness.ts), the pairing store is the real one over a fake Firestore listener, and
// the bank store is store.fake.ts, which shares the real store's own clamp helpers.
import { describe, expect, it } from 'vitest';
import { createEventBus } from './events';
import { createPairingStore, type AgentTokenRow } from './pairing';
import {
  bankProducer, gatewayProducer, lootProducer, pairingProducer, runProducer, xpProducer
} from './eventProducers';
import { fakeTasksApi } from '../tasks/api.harness';
import { fakeBankStore } from '../bank/store.fake';
import { EVENT_GATEWAY_OK, EVENT_PAUSED_MOUSE, bankUpdated } from '../ui/copy';

const bus = () => createEventBus({ now: () => 0 });
const shape = (b: ReturnType<typeof bus>): [string, string, string][] =>
  b.all().map(e => [e.type, e.tone, e.text]);

describe('xpProducer', () => {
  it('emits one xp event per hook event, with the skill DISPLAY name', () => {
    const b = bus();
    const on = xpProducer(b, { characterId: 'c1', characterName: 'shoth4019zr', levelOf: () => 34 });
    on({ skill: 0, xp: 4180, level: 34, delta: 25 });   // skill 0 is Attack in SKILL_NAMES
    const [e] = b.all();
    // `amount` is the field the canvas xp drop reads (Task 13 does `e.amount ?? 0`), so it is
    // pinned here rather than left to a regex over `text` later.
    expect(e).toMatchObject({ type: 'xp', characterId: 'c1', skill: 'Attack', text: '+25 Attack xp', amount: 25 });
    expect(e.characterName).toBe('shoth4019zr');
  });

  it('emits a SECOND event, of type level, when the level moved', () => {
    const b = bus();
    let known = 34;
    const on = xpProducer(b, { characterId: 'c1', characterName: 'a', levelOf: () => known });
    on({ skill: 8, xp: 100, level: 35, delta: 25 });
    expect(b.all().map(e => e.type)).toEqual(['xp', 'level']);
    expect(b.all()[1].text).toBe('Level up! Woodcutting 34 → 35');
    // The level number lives in the text; `amount` is the xp-drop's field and a level is not xp.
    expect(b.all()[1].amount).toBeNull();
    // Mutation target: emitting the level event again for the same level must fail this.
    known = 35;
    on({ skill: 8, xp: 125, level: 35, delta: 25 });
    expect(b.all().map(e => e.type)).toEqual(['xp', 'level', 'xp']);
  });

  it('emits nothing for a zero or negative delta', () => {
    const b = bus();
    const on = xpProducer(b, { characterId: 'c1', characterName: 'a', levelOf: () => 1 });
    on({ skill: 0, xp: 0, level: 1, delta: 0 });
    on({ skill: 0, xp: 0, level: 1, delta: -5 });
    expect(b.all()).toEqual([]);
  });

  it('names a skill the table does not know rather than printing undefined', () => {
    const b = bus();
    xpProducer(b, { characterId: 'c1', characterName: 'a', levelOf: () => 1 })({ skill: 99, xp: 1, level: 1, delta: 7 });
    expect(b.all()[0].skill).toBe('Skill 99');
  });
});

describe('lootProducer', () => {
  const objName = (id: number): string | null => (id === 5070 ? 'Bird nest' : id === 1511 ? 'Logs' : null);

  it('emits one event per added entry, resolved to the obj name', () => {
    const b = bus();
    const on = lootProducer(b, { characterId: 'c1', characterName: 'shoth4019zr', objName });
    on({ added: [{ id: 5070, count: 1 }, { id: 1511, count: 41 }], removed: [{ id: 995, count: 3 }] });
    expect(shape(b)).toEqual([
      ['loot', 'default', 'Bird nest picked up'],
      ['loot', 'default', '41 Logs picked up']
    ]);
    expect(b.all().map(e => e.amount)).toEqual([1, 41]);
    expect(b.all().every(e => e.skill === null)).toBe(true);
  });

  it('falls back to the id for an obj this pack has never heard of', () => {
    const b = bus();
    lootProducer(b, { characterId: 'c1', characterName: 'a', objName })({ added: [{ id: 4242, count: 1 }], removed: [] });
    expect(b.all()[0].text).toBe('Item 4242 picked up');
  });

  it('ignores a removal-only event, which is a drop and not loot', () => {
    const b = bus();
    lootProducer(b, { characterId: 'c1', characterName: 'a', objName })({ added: [], removed: [{ id: 1511, count: 28 }] });
    expect(b.all()).toEqual([]);
  });

  it('ignores an added entry with no count, which is a slot moving and not a pickup', () => {
    const b = bus();
    const on = lootProducer(b, { characterId: 'c1', characterName: 'a', objName });
    on({ added: [{ id: 1511, count: 0 }, { id: 5070, count: -2 }], removed: [] });
    // "0 Logs picked up" is not a thing that happened. Mutation target for the count guard.
    expect(b.all()).toEqual([]);
    on({ added: [{ id: 1511, count: 0 }, { id: 5070, count: 1 }], removed: [] });
    expect(shape(b)).toEqual([['loot', 'default', 'Bird nest picked up']]);
  });
});

describe('runProducer', () => {
  it('emits on run_started and run_done, and marks a failure with the fail tone', () => {
    const b = bus();
    const api = fakeTasksApi();                 // strict: onEvent and onStatus both return disposers
    runProducer(b, api, { characterId: 'c1', characterName: 'alt_miner' });
    api.pushEvent({ seq: 1, at: 0, kind: 'run_started', runId: 'r1', scriptId: 'mine-and-drop', version: 1, params: {}, startedBy: 'claude' });
    api.pushEvent({ seq: 2, at: 0, kind: 'run_done', status: 'failed', summary: 'needs a bronze pickaxe', durationMs: 1, xpGained: {}, itemsDelta: {}, tasksEntered: [] });
    expect(shape(b)).toEqual([
      ['claude', 'default', 'Claude started mine-and-drop'],
      ['run', 'fail', 'mine-and-drop failed — needs a bronze pickaxe']
    ]);
    expect(b.all().every(e => e.characterId === 'c1' && e.characterName === 'alt_miner')).toBe(true);
  });

  it('emits a run event, not a claude event, when the player started it', () => {
    const b = bus();
    const api = fakeTasksApi();
    runProducer(b, api, { characterId: 'c1', characterName: 'a' });
    api.pushEvent({ seq: 1, at: 0, kind: 'run_started', runId: 'r1', scriptId: 's', version: 1, params: {}, startedBy: 'player' });
    expect(shape(b)).toEqual([['run', 'default', 'Started s']]);
  });

  it('names the finished run from the start event, because run_done carries no scriptId', () => {
    const b = bus();
    const api = fakeTasksApi();
    runProducer(b, api, { characterId: 'c1', characterName: 'a' });
    api.pushEvent({ seq: 1, at: 0, kind: 'run_started', runId: 'r1', scriptId: 'chop-and-drop', version: 1, params: {}, startedBy: 'player' });
    api.pushEvent({ seq: 2, at: 0, kind: 'run_done', status: 'done', summary: '41 logs', durationMs: 1, xpGained: {}, itemsDelta: {}, tasksEntered: [] });
    api.pushEvent({ seq: 3, at: 0, kind: 'run_done', status: 'stopped', summary: '', durationMs: 1, xpGained: {}, itemsDelta: {}, tasksEntered: [] });
    expect(shape(b).slice(1)).toEqual([
      ['run', 'default', 'chop-and-drop finished'],
      // The name does not survive its own run: a second run_done with no start before it is the
      // run this producer never saw begin.
      ['run', 'default', 'the run stopped']
    ]);
  });

  it('drops the reason clause when a failure reports no summary at all', () => {
    const b = bus();
    const api = fakeTasksApi();
    runProducer(b, api, { characterId: 'c1', characterName: 'a' });
    api.pushEvent({ seq: 1, at: 0, kind: 'run_started', runId: 'r1', scriptId: 's', version: 1, params: {}, startedBy: 'player' });
    api.pushEvent({ seq: 2, at: 0, kind: 'run_done', status: 'failed', summary: '  ', durationMs: 1, xpGained: {}, itemsDelta: {}, tasksEntered: [] });
    expect(shape(b)[1]).toEqual(['run', 'fail', 's failed']);
  });

  it('pairs the human-input pause with its resume, and says nothing about any other pause', () => {
    const b = bus();
    const api = fakeTasksApi();
    runProducer(b, api, { characterId: 'c1', characterName: 'a' });
    api.pushEvent({ seq: 1, at: 0, kind: 'paused', reason: 'stuck', by: 'runner' });
    api.pushEvent({ seq: 2, at: 0, kind: 'resumed', by: 'runner' });
    expect(b.all()).toEqual([]);
    api.pushEvent({ seq: 3, at: 0, kind: 'paused', reason: 'human-input', by: 'player' });
    api.pushEvent({ seq: 4, at: 0, kind: 'resumed', by: 'runner' });
    api.pushEvent({ seq: 5, at: 0, kind: 'resumed', by: 'runner' });
    expect(shape(b)).toEqual([
      ['run', 'default', EVENT_PAUSED_MOUSE],
      ['run', 'default', 'Run resumed after you took control']
    ]);
  });

  it('ignores every other arm of the nineteen-arm trace union', () => {
    const b = bus();
    const api = fakeTasksApi();
    runProducer(b, api, { characterId: 'c1', characterName: 'a' });
    api.pushEvent({ seq: 1, at: 0, kind: 'log', level: 'warn', text: 'noisy' });
    api.pushEvent({ seq: 2, at: 0, kind: 'task_enter', task: 'Chop tree' });
    api.pushEvent({ seq: 3, at: 0, kind: 'health', condition: 'no-progress' });
    expect(b.all()).toEqual([]);
  });

  it('fires nothing after its disposer runs', () => {
    const b = bus();
    const api = fakeTasksApi();
    runProducer(b, api, { characterId: 'c1', characterName: 'a' })();
    api.pushEvent({ seq: 1, at: 0, kind: 'run_started', runId: 'r1', scriptId: 's', version: 1, params: {}, startedBy: 'player' });
    expect(b.all()).toEqual([]);
    expect(api.eventSubscribers()).toBe(0);   // the disposer unsubscribed, it did not just gate
  });
});

describe('pairingProducer', () => {
  function pairing() {
    let push: ((rows: AgentTokenRow[]) => void) | null = null;
    const store = createPairingStore({ subscribeSessions: (_uid, cb) => { push = cb; return () => {}; } });
    store.start('uid1');
    return { store, push: (rows: AgentTokenRow[]) => push?.(rows) };
  }
  const row = (over: Partial<AgentTokenRow> = {}): AgentTokenRow =>
    ({ id: 't1', label: 'MacBook', createdAt: 1, lastSeenAt: 1, revokedAt: null, ...over });

  it('says nothing about the sessions that were already paired when it attached', () => {
    const b = bus();
    const p = pairing();
    pairingProducer(b, p.store);
    p.push([row(), row({ id: 't2', label: 'Desktop' })]);
    expect(b.all()).toEqual([]);
  });

  it('emits a claude event for a token that appears, and one for a revoke', () => {
    const b = bus();
    const p = pairing();
    pairingProducer(b, p.store);
    p.push([]);
    p.push([row()]);
    p.push([row({ revokedAt: 99 })]);
    expect(shape(b)).toEqual([
      ['claude', 'default', 'MacBook session paired'],
      ['claude', 'default', 'MacBook session revoked']
    ]);
    // Account-scoped: no character owns a pairing.
    expect(b.all().every(e => e.characterId === null && e.characterName === null)).toBe(true);
  });

  it('says nothing when a snapshot changes something that is not the pairing', () => {
    const b = bus();
    const p = pairing();
    pairingProducer(b, p.store);
    p.push([row()]);
    p.push([row({ lastSeenAt: 99_999 })]);
    expect(b.all()).toEqual([]);
  });

  it('never announces a token that arrives already revoked', () => {
    const b = bus();
    const p = pairing();
    pairingProducer(b, p.store);
    p.push([]);
    p.push([row({ revokedAt: 5 })]);
    expect(b.all()).toEqual([]);
  });

  it('fires nothing after its disposer runs', () => {
    const b = bus();
    const p = pairing();
    pairingProducer(b, p.store)();
    p.push([]);
    p.push([row()]);
    expect(b.all()).toEqual([]);
  });
});

describe('bankProducer', () => {
  it('emits on a version bump, with the real slot numbers', () => {
    const b = bus();
    const bank = fakeBankStore({ version: -1, used: 0 });
    bankProducer(b, bank.store);
    bank.push({ version: 7, used: 27, capacity: 240 });     // the first read is the load
    bank.push({ version: 8, used: 28, capacity: 240 });
    expect(shape(b)).toEqual([['bank', 'default', bankUpdated(28, 240)]]);
    expect(b.all()[0].text).toBe('Bank updated — 28 / 240 slots used');
    expect(b.all()[0].characterId).toBeNull();
  });

  it('says nothing when a state change leaves the version alone', () => {
    const b = bus();
    const bank = fakeBankStore({ version: 7 });
    bankProducer(b, bank.store);
    bank.push({ version: 7, live: false });
    bank.push({ version: 7, error: 'Something went wrong.' });
    expect(b.all()).toEqual([]);
  });

  it('does not take a notification that carries no read yet as its baseline', () => {
    const b = bus();
    // Exactly what a page load looks like: the store's version is -1, and start() races the SSE
    // stream against the first GET. The stream's `emit({ live })` (store.ts onHealth) or a failed
    // first read's `emit({ loading: false, error })` can land first, and neither is a bank.
    const bank = fakeBankStore({ version: -1, used: 0 });
    bankProducer(b, bank.store);
    bank.push({ live: true });
    bank.push({ error: 'The bank is not reachable right now. Try again in a moment.' });
    bank.push({ version: 7, used: 27 });          // the first READ is the baseline
    expect(b.all()).toEqual([]);
    bank.push({ version: 8, used: 28 });
    expect(shape(b)).toEqual([['bank', 'default', bankUpdated(28, 240)]]);
  });

  it('takes a fresh baseline after the store is stopped, for the next account on the page', () => {
    const b = bus();
    const bank = fakeBankStore({ version: -1, used: 0 });
    bankProducer(b, bank.store);
    bank.push({ version: 7, used: 27 });
    // Sign-out. The real store puts its version back to -1 here (store.ts stop()), so the next
    // account's first read cannot be compared against this account's last one.
    bank.store.stop();
    bank.push({ version: 3, used: 4 });
    expect(b.all()).toEqual([]);
  });

  it('takes the first snapshot as its baseline, whatever the store had already read', () => {
    const b = bus();
    // A store mid-session, as it would be for the SECOND account signed in on one page: the
    // producer is attached before start() and the read that follows is a load, not a change.
    const bank = fakeBankStore({ version: 7, used: 27 });
    bankProducer(b, bank.store);
    bank.push({ version: 8, used: 30 });
    expect(b.all()).toEqual([]);
    bank.push({ version: 9, used: 31 });
    expect(shape(b)).toEqual([['bank', 'default', bankUpdated(31, 240)]]);
  });

  it('fires nothing after its disposer runs', () => {
    const b = bus();
    const bank = fakeBankStore({ version: 7 });
    bankProducer(b, bank.store)();
    bank.push({ version: 8 });
    expect(b.all()).toEqual([]);
    expect(bank.listenerCount()).toBe(0);
  });
});

describe('gatewayProducer', () => {
  it('emits once on the transition into up, and not on every poll', () => {
    const b = bus();
    const on = gatewayProducer(b);
    // The FIRST poll counts, unlike the pairing and bank baselines: this producer enters at
    // "down" rather than at "whatever it found", because a shell that came up with the gateway
    // already running has still just connected to it and the co-pilot bar says so.
    on('up');
    on('not_deployed');
    on('up');
    on('up');
    on('down');
    on('up');
    expect(shape(b)).toEqual([
      ['claude', 'default', EVENT_GATEWAY_OK],
      ['claude', 'default', EVENT_GATEWAY_OK],
      ['claude', 'default', EVENT_GATEWAY_OK]
    ]);
    expect(b.all()[0].text).toBe('Gateway connected — ws ok');
  });
});
