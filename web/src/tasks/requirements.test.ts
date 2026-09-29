import { describe, expect, test } from 'vitest';
import type { WorldState } from '../agent/types';
import type { Requirement } from './types';
import { inventoryItem, worldState } from '../agent/world.harness';
import { evaluateRequirements } from './requirements';

// The whole `WorldState` from the shared harness, patched with the four members
// `evaluateRequirements` reads. The fixture used to name only those four and lean on the compiler
// never seeing the file, so it was not a `WorldState` at all. Audit C16.
const state = (over: Partial<WorldState> = {}): WorldState => worldState({
  inventory: [inventoryItem(0, 1351, 'Bronze axe')],
  equipment: [],
  skills: [{ name: 'Woodcutting', level: 12, baseLevel: 12, experience: 0 }],
  regionId: 12336,
  ...over
});

describe('evaluateRequirements', () => {
  test('no requirements is always ok', () => {
    expect(evaluateRequirements(undefined, state())).toEqual({ ok: true, missing: [] });
    expect(evaluateRequirements([], state())).toEqual({ ok: true, missing: [] });
  });

  test('a null state misses every requirement', () => {
    const reqs: Requirement[] = [{ kind: 'area', regionIds: [12336], text: 'Be on Tutorial Island' }];
    expect(evaluateRequirements(reqs, null)).toEqual({ ok: false, missing: ['Be on Tutorial Island'] });
  });

  test('item: present in the inventory passes, missing lists its text', () => {
    const axe: Requirement = { kind: 'item', name: 'Bronze axe', text: 'A bronze axe' };
    expect(evaluateRequirements([axe], state())).toEqual({ ok: true, missing: [] });
    expect(evaluateRequirements([axe], state({ inventory: [] }))).toEqual({ ok: false, missing: ['A bronze axe'] });
  });

  test('item: worn equipment counts, and qty sums stacks', () => {
    const worn = state({ inventory: [], equipment: [inventoryItem(3, 1351, 'Bronze axe')] });
    expect(evaluateRequirements([{ kind: 'item', name: 'bronze AXE', text: 'A bronze axe' }], worn)).toEqual({ ok: true, missing: [] });
    const logs = state({ inventory: [inventoryItem(0, 1511, 'Logs', 3), inventoryItem(1, 1511, 'Logs', 4)] });
    expect(evaluateRequirements([{ kind: 'item', name: 'Logs', qty: 7, text: '7 logs' }], logs).ok).toBe(true);
    expect(evaluateRequirements([{ kind: 'item', name: 'Logs', qty: 8, text: '8 logs' }], logs)).toEqual({ ok: false, missing: ['8 logs'] });
  });

  test('skill: base level 12 fails a level 15 requirement', () => {
    const req: Requirement = { kind: 'skill', skill: 'Woodcutting', level: 15, text: 'Woodcutting 15' };
    expect(evaluateRequirements([req], state())).toEqual({ ok: false, missing: ['Woodcutting 15'] });
    expect(evaluateRequirements([{ ...req, level: 12 }], state()).ok).toBe(true);
  });

  test('skill: a boosted level does not satisfy the requirement', () => {
    const boosted = state({ skills: [{ name: 'Woodcutting', level: 17, baseLevel: 12, experience: 0 }] });
    expect(evaluateRequirements([{ kind: 'skill', skill: 'Woodcutting', level: 15, text: 'Woodcutting 15' }], boosted).ok).toBe(false);
  });

  test('area: ok when regionIds includes the current region', () => {
    expect(evaluateRequirements([{ kind: 'area', regionIds: [12336, 12337], text: 'Lumbridge' }], state()).ok).toBe(true);
    expect(evaluateRequirements([{ kind: 'area', regionIds: [12337], text: 'Lumbridge' }], state())).toEqual({ ok: false, missing: ['Lumbridge'] });
  });

  test('custom: uses its own test predicate', () => {
    const req: Requirement = { kind: 'custom', test: s => (s.inventory ?? []).length < 28, text: 'Free inventory space' };
    expect(evaluateRequirements([req], state()).ok).toBe(true);
    expect(evaluateRequirements([{ ...req, test: () => false }], state())).toEqual({ ok: false, missing: ['Free inventory space'] });
  });

  test('reports every missing requirement in order', () => {
    const reqs: Requirement[] = [
      { kind: 'item', name: 'Tinderbox', text: 'A tinderbox' },
      { kind: 'skill', skill: 'Woodcutting', level: 15, text: 'Woodcutting 15' },
      { kind: 'area', regionIds: [12336], text: 'Lumbridge' },
    ];
    expect(evaluateRequirements(reqs, state())).toEqual({ ok: false, missing: ['A tinderbox', 'Woodcutting 15'] });
  });
});
