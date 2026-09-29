// web/src/sessions/wire.test.ts
import { describe, expect, test } from 'vitest';
import { wireSession } from './wire';
import type { CharacterSession } from './types';
import { createXpTracker } from '../stats/xp';
import { createLootLog } from '../stats/loot';
import { siteLabel } from '../frame/siteLabel';
import type { ClientHooks, HookEvents } from '../clientTypes';

function sessionFor(id: string, gameName: string) {
  const handlers = new Map<string, Set<(p: unknown) => void>>();
  const hooks = {
    on: (event: string, handler: (p: unknown) => void) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler);
      handlers.set(event, set);
      return () => set.delete(handler);
    }
  } as unknown as ClientHooks;
  const session = { id, character: { id, gameName, createdAt: 1, lastLoginAt: null }, hooks } as unknown as CharacterSession;
  const emit = <E extends keyof HookEvents>(event: E, payload: HookEvents[E]): void => {
    for (const h of handlers.get(event) ?? []) h(payload);
  };
  return { session, emit };
}

describe('wireSession', () => {
  function build(activeId: string) {
    const xp = new Map<string, ReturnType<typeof createXpTracker>>();
    const loot = new Map<string, ReturnType<typeof createLootLog>>();
    const calls = { xpLine: [] as (string | null)[], status: [] as string[], title: [] as string[] };
    const deps = {
      xpFor: (id: string) => { const t = xp.get(id) ?? createXpTracker(); xp.set(id, t); return t; },
      lootFor: (id: string) => { const l = loot.get(id) ?? createLootLog(); loot.set(id, l); return l; },
      isActive: (id: string) => id === activeId,
      setXpLine: (t: string | null) => { calls.xpLine.push(t); },
      setStatus: (t: string) => { calls.status.push(t); },
      setTitle: (t: string) => { calls.title.push(t); }
    };
    return { deps, xp, loot, calls };
  }

  test('xp and loot land in the tracker for that character', () => {
    const { deps, xp, loot } = build('a');
    const a = sessionFor('a', 'alpha');
    const b = sessionFor('b', 'beta');
    wireSession(a.session, deps);
    wireSession(b.session, deps);
    a.emit('xp', { skill: 0, xp: 100, level: 2, delta: 100 });
    a.emit('xp', { skill: 0, xp: 300, level: 3, delta: 200 });
    b.emit('xp', { skill: 0, xp: 50, level: 1, delta: 50 });
    expect(xp.get('a')!.rows(Date.now())[0].gained).toBe(200);
    expect(xp.get('b')!.rows(Date.now())).toEqual([]);
    a.emit('inventory', { added: [{ id: 995, count: 5 }], removed: [] });
    expect([...loot.get('a')!.entries()]).toHaveLength(1);
    expect([...loot.get('b')!.entries()]).toHaveLength(0);
  });

  test('only the active session writes the overlays and the title bar', () => {
    const { deps, calls } = build('a');
    const a = sessionFor('a', 'alpha');
    const b = sessionFor('b', 'beta');
    wireSession(a.session, deps);
    wireSession(b.session, deps);
    b.emit('login', { gameName: 'beta' });
    b.emit('disconnect', { code: 0 });
    expect(calls.status).toEqual([]);
    expect(calls.title).toEqual([]);
    a.emit('login', { gameName: 'alpha' });
    // The whole label, not just the name: this is the second of the two call sites that had
    // `osrs.scotho.com` compiled into it (audit C17), and the audit named only the other one.
    expect(calls.title.at(-1)).toBe(siteLabel('alpha'));
    a.emit('disconnect', { code: 0 });
    expect(calls.status.at(-1)).toBe('reconnecting…');
  });

  // A login used to write `'● not paired'` onto the canvas status pill, which is a claim about
  // whether Claude is paired that this module cannot make: it has hooks, not an agent-token
  // listener. The pairing pill reads the pairing store instead (plan ruling R6). The write itself
  // stays, as a CLEAR: it is what retires main.ts's `connecting...` line when the character
  // reaches the game, and frame/stage.ts's syncChrome only runs on a tab switch or a close, so
  // deleting it outright left `connecting...` over the canvas for the whole session.
  test('a login clears the status line and says nothing at all about pairing', () => {
    const { deps, calls } = build('a');
    const a = sessionFor('a', 'alpha');
    wireSession(a.session, deps);
    a.emit('login', { gameName: 'alpha' });
    expect(calls.title).toEqual([siteLabel('alpha')]);
    expect(calls.status).toEqual(['']);
  });

  test('the event producers are called, and the xp one BEFORE the tracker is updated', () => {
    const { deps, xp } = build('a');
    const a = sessionFor('a', 'alpha');
    const levelsSeen: (number | null)[] = [];
    const loots: number[] = [];
    wireSession(a.session, {
      ...deps,
      // The level-up producer reads the level the tracker last saw. Called after onXp, that is
      // always the level in the event itself and no level-up could ever be detected.
      onXp: () => { levelsSeen.push(xp.get('a')!.levelOf(8)); },
      onLoot: ev => { for (const add of ev.added) loots.push(add.id); }
    });
    a.emit('xp', { skill: 8, xp: 100, level: 34, delta: 25 });
    a.emit('xp', { skill: 8, xp: 125, level: 35, delta: 25 });
    expect(levelsSeen).toEqual([null, 34]);
    a.emit('inventory', { added: [{ id: 1511, count: 2 }], removed: [] });
    expect(loots).toEqual([1511]);
  });

  test('a session wired without producers still tracks xp and loot', () => {
    const { deps, xp, loot } = build('a');
    const a = sessionFor('a', 'alpha');
    wireSession(a.session, deps);
    a.emit('xp', { skill: 0, xp: 100, level: 2, delta: 100 });
    a.emit('xp', { skill: 0, xp: 300, level: 3, delta: 200 });
    a.emit('inventory', { added: [{ id: 995, count: 5 }], removed: [] });
    expect(xp.get('a')!.rows(Date.now())[0].gained).toBe(200);
    expect(loot.get('a')!.entries()).toHaveLength(1);
  });

  test('the returned disposer detaches every handler', () => {
    const { deps, xp } = build('a');
    const a = sessionFor('a', 'alpha');
    const off = wireSession(a.session, deps);
    off();
    a.emit('xp', { skill: 0, xp: 100, level: 2, delta: 100 });
    a.emit('xp', { skill: 0, xp: 300, level: 3, delta: 200 });
    expect(xp.get('a')!.rows(Date.now())).toEqual([]);
  });
});
