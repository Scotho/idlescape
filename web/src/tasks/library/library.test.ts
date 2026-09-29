import { describe, expect, test } from 'vitest';
import { LIBRARY, libraryById, libraryManifests } from './index';
import type { WorldState } from '../../agent/types';
import type { HealthCondition, ScriptContext } from '../types';
const st = (o: Partial<WorldState>): WorldState => ({ inventory: [], equipment: [], skills: [{ name: 'Woodcutting', level: 1, baseLevel: 1, experience: 0 }, { name: 'Fishing', level: 1, baseLevel: 1, experience: 0 }, { name: 'Mining', level: 1, baseLevel: 1, experience: 0 }], nearbyLocs: [], nearbyNpcs: [], ...o } as unknown as WorldState);
const ctx = (params: Record<string, unknown>) => ({ params }) as never;
const full = Array.from({ length: 28 }, (_, i) => ({ slot: i, id: 1511, name: 'Logs', count: 1, optionsWithIndex: [] }));
const fullOf = (name: string) => Array.from({ length: 28 }, (_, i) => ({ slot: i, id: 300 + i, name, count: 1, optionsWithIndex: [] }));
/**
 * The three skilling loops. `tutorial-island` (Task 13) is in the same bundle but is not one of
 * them: it has no skilling tag, no fork source, a `health.onDeath` of its own and a last task
 * that is a fallback rather than a discovery walk, so the loop-shaped assertions below say so
 * rather than being loosened until they hold for both kinds.
 */
const LOOPS = LIBRARY.filter(s => s.id !== 'tutorial-island');

describe('library', () => {
  test('is ordered and ids are unique', () => {
    expect(LIBRARY.map(s => s.id)).toEqual(['tutorial-island', 'chop-and-drop', 'net-fish-and-drop', 'mine-and-drop']);
    expect(new Set(LIBRARY.map(s => s.id)).size).toBe(LIBRARY.length);
  });
  test('chop-and-drop drops when full, chops otherwise, stops at the level', () => {
    const s = libraryById('chop-and-drop')!;
    const c = ctx({ tree: 'Tree', untilLevel: 15, keepLogs: false });
    expect(s.tasks.find(t => t.when(st({ inventory: full }), c))?.name).toBe('drop-logs-when-full');
    expect(s.tasks.find(t => t.when(st({}), c))?.name).toBe('chop-nearest');
    expect(s.until!(st({ skills: [{ name: 'Woodcutting', level: 15, baseLevel: 15, experience: 2411 }] as never }), c)).toBe(true);   // until(state, ctx)
  });
  test('requirements name the tool', () => {
    expect(libraryById('mine-and-drop')!.requires![0].text).toMatch(/pickaxe/i);
    expect(libraryById('net-fish-and-drop')!.requires![0].text).toMatch(/net/i);
  });

  test('keepLogs stops the run when the inventory fills instead of dropping', () => {
    const s = libraryById('chop-and-drop')!;
    const c = ctx({ tree: 'Tree', untilLevel: 15, keepLogs: true });
    expect(s.until!(st({ inventory: full }), c)).toBe(true);
    expect(s.tasks.find(t => t.when(st({ inventory: full }), c))?.name).toBe('chop-nearest');
  });

  test('net-fish-and-drop drops the catch when full, fishes otherwise, stops at the level', () => {
    const s = libraryById('net-fish-and-drop')!;
    const c = ctx({ untilLevel: 20 });
    expect(s.tasks.find(t => t.when(st({ inventory: fullOf('Raw shrimps') }), c))?.name).toBe('drop-fish-when-full');
    expect(s.tasks.find(t => t.when(st({}), c))?.name).toBe('net-nearest-spot');
    expect(s.until!(st({ skills: [{ name: 'Fishing', level: 20, baseLevel: 20, experience: 4470 }] as never }), c)).toBe(true);
    expect(s.until!(st({}), c)).toBe(false);
  });

  test('mine-and-drop drops the ore when full, mines otherwise, stops at the level', () => {
    const s = libraryById('mine-and-drop')!;
    const c = ctx({ ore: 'Copper', untilLevel: 15 });
    expect(s.tasks.find(t => t.when(st({ inventory: fullOf('Copper ore') }), c))?.name).toBe('drop-ore-when-full');
    expect(s.tasks.find(t => t.when(st({}), c))?.name).toBe('mine-nearest-rock');
    expect(s.until!(st({ skills: [{ name: 'Mining', level: 15, baseLevel: 15, experience: 2411 }] as never }), c)).toBe(true);
    expect(s.until!(st({}), c)).toBe(false);
  });

  test('every script declares params with defaults, a hard stop and an estimate', () => {
    for (const s of LIBRARY) {
      expect(Object.keys(s.params ?? {}).length).toBeGreaterThan(0);
      for (const [key, field] of Object.entries(s.params!)) expect(field.default, key).toBeDefined();
      // S12: the shipped corpus never demonstrates a deprecated idiom, so every bundled
      // script names the floor in points and none of them still sets `hpBelow`.
      expect(s.hardStop?.hpBelowPoints).toBeGreaterThan(0);
      expect(s.hardStop?.hpBelow).toBeUndefined();
      expect(s.estimateMinutes).toBeGreaterThan(0);
    }
    for (const s of LOOPS) expect(s.tags, s.id).toContain('skilling');
    expect(libraryById('tutorial-island')!.tags).toEqual(['tutorial', 'questing']);
  });

  test('libraryManifests drops the executable half', () => {
    const manifests = libraryManifests();
    expect(manifests.map(m => m.id)).toEqual(LIBRARY.map(s => s.id));
    for (const m of manifests) {
      expect(m).not.toHaveProperty('tasks');
      expect(m).not.toHaveProperty('until');
    }
    expect(manifests.find(m => m.id === 'chop-and-drop')).toMatchObject({ name: 'Chop and drop', version: 1, order: 10, author: 'idlescape' });
    expect(manifests.find(m => m.id === 'tutorial-island')).toMatchObject({ name: 'Tutorial Island', version: 1, order: 5, author: 'idlescape' });
  });

  test('libraryManifests carries the health policy and the anchor to the api', () => {
    const manifests = libraryManifests();
    for (const id of LOOPS.map(s => s.id)) expect(manifests.find(m => m.id === id)!.health).toEqual({ noProgressMs: 90_000 });
    expect(manifests.find(m => m.id === 'tutorial-island')!.health).toEqual({
      onDeath: 'fail', noProgressMs: 120_000, expectInterfaces: [3559], maxRecoveryAttempts: 3
    });
    // Declared by no bundled script yet, but the key has to travel.
    for (const m of manifests) expect(Object.keys(m)).toContain('anchor');
  });

  test('the discovery task allows more time than travel budgets for one trip', () => {
    // 120_000 is `DEFAULT_TIMEOUT_MS` in travel.ts, written here as a literal on purpose: a
    // task timeout at or below it aborts a walk `travel.to` is still willing to make, and the
    // runner reports `timeout` for it. Three of those in a row trip maxAttempts and end the run.
    for (const s of LOOPS) {
      const discovery = s.tasks[s.tasks.length - 1];
      expect(discovery.timeoutMs, `${s.id}/${discovery.name}`).toBeGreaterThan(120_000);
    }
    // Tutorial Island's two travelling tasks are the ladders, and they carry the same bound.
    for (const name of ['enter-mine', 'climb-ladder-to-bank']) {
      const task = libraryById('tutorial-island')!.tasks.find(t => t.name === name)!;
      expect(task.timeoutMs, name).toBeGreaterThan(120_000);
    }
  });

  test('no bundled script overrides the player on death or on being stuck', () => {
    // `resolvePolicy` gives a script's own value precedence over the player's setting, so a
    // library loop that declared one would quietly disable the setting for the three scripts
    // that ship. Only the ones a skilling loop genuinely owns are declared.
    for (const s of LOOPS) {
      expect(s.health?.onDeath, s.id).toBeUndefined();
      expect(s.health?.onStuck, s.id).toBeUndefined();
    }
    // Tutorial Island is the one deliberate exception, and only on death: nothing on the
    // island should kill anyone, so a death there is not something walking home fixes. It
    // still leaves `onStuck` to the player.
    const tutorial = libraryById('tutorial-island')!;
    expect(tutorial.health?.onDeath).toBe('fail');
    expect(tutorial.health?.onStuck).toBeUndefined();
  });

  test('libraryById is undefined for an unknown id', () => {
    expect(libraryById('nope')).toBeUndefined();
  });
});

/**
 * The drop task is the one run half with no discovery in it, so it stays here beside the
 * `when`/`until` tests. Everything the three loops now do through `c.find` and `c.travel` is in
 * `libraryFind.test.ts`, against the real layers.
 */
interface Recorder { dropped: string[]; recovered: HealthCondition[] }

/** A Task 4-shaped snapshot: `regionId` only, none of the arrays the library reads. */
const t4st = (o: Record<string, unknown> = {}): WorldState => ({ regionId: 12336, ...o } as unknown as WorldState);

function dropCtx(state: WorldState, params: Record<string, unknown>, rec: Recorder): ScriptContext {
  return {
    state: () => state,
    params,
    status: () => undefined,
    log: () => undefined,
    memory: new Map<string, unknown>(),
    signal: new AbortController().signal,
    bot: { dropItem: async (item: { name?: string }) => { rec.dropped.push(item.name ?? '<unnamed>'); return { success: true, message: 'ok' }; } },
    // The real context always carries `health`; a fake without it hid the fact that the drop
    // task has to answer the condition it claims.
    health: { is: () => false, last: () => null, recovered: (c: HealthCondition) => { rec.recovered.push(c); } }
  } as unknown as ScriptContext;
}

const taskOf = (scriptId: string, taskName: string) => libraryById(scriptId)!.tasks.find(t => t.name === taskName)!;

test('the drop task tolerates a snapshot with no inventory and skips unnamed items', async () => {
  const empty: Recorder = { dropped: [], recovered: [] };
  await taskOf('chop-and-drop', 'drop-logs-when-full').run(dropCtx(t4st(), { keepLogs: false }, empty));
  expect(empty.dropped).toEqual([]);
  const some: Recorder = { dropped: [], recovered: [] };
  const mixed = t4st({ inventory: [{ slot: 0, id: 1511, name: 'Logs' }, { slot: 1, id: 995 }, { slot: 2, id: 1521, name: 'Oak logs' }] });
  await taskOf('chop-and-drop', 'drop-logs-when-full').run(dropCtx(mixed, { keepLogs: false }, some));
  expect(some.dropped).toEqual(['Logs', 'Oak logs']);
});

test('every drop task claims inventory-full and answers it once it has emptied the bag', async () => {
  // Measured on the live stack (SP4b Task 14): without the claim, the monitor raised
  // `inventory-full` on the same snapshot the bag filled, no task owned it, the default
  // recovery logged "this script declares no way to empty it" and failed, and a `chop-and-drop`
  // run paused `stuck` with 28 logs and its own drop task never selected.
  for (const script of LOOPS) {
    const drop = script.tasks.find(t => t.name.startsWith('drop-'));
    expect(drop?.recovers, script.id).toEqual(['inventory-full']);
    const rec: Recorder = { dropped: [], recovered: [] };
    await drop!.run(dropCtx(t4st({ inventory: [{ slot: 0, id: 1511, name: 'Logs' }] }), {}, rec));
    // An unanswered claim is worse than no claim: the monitor holds the condition `active` and
    // stays silent about it for the rest of the run.
    expect(rec.recovered, script.id).toEqual(['inventory-full']);
  }
});
