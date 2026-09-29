import { describe, expect, test } from 'vitest';
import { ABBREVIATIONS, COUNT_EXEMPT, KEBAB_UNIONS, LINTS, POSITIONAL_GRANDFATHERED, SIGNAL_EXEMPT, STANDARD } from './standard';

describe('the standard, as a module', () => {
  test('is the twelve clauses of section 4, in order, with unique ids', () => {
    expect(STANDARD.map(r => r.id)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12']);
    expect(new Set(STANDARD.map(r => r.title)).size).toBe(12);
  });

  test('every lint names a clause that exists, and the severities are the three spellings both documents use', () => {
    // Nineteen: the studio spec's fourteen plus the plan's five (D136). The count is asserted so
    // the module and the comment beside it cannot drift again, and the two rules the first draft
    // of this module dropped are named, because one of them blocks Run.
    expect(LINTS).toHaveLength(19);
    expect(new Set(LINTS.map(l => l.id)).size).toBe(19);
    expect(LINTS.map(l => l.id)).toContain('no-unbounded-loop');
    expect(LINTS.find(l => l.id === 'no-await-in-when')!.severity).toBe('error');
    const ids = new Set(STANDARD.map(r => r.id));
    for (const l of LINTS) {
      for (const s of Array.isArray(l.standard) ? l.standard : [l.standard]) {
        expect(ids.has(s), `${l.id} cites ${s}`).toBe(true);
      }
      expect(['error', 'warn', 'info']).toContain(l.severity);
    }
    // The middle tier is `warn`, never `warning`: the studio's agreement test compares strings.
    expect(LINTS.map(l => l.id)).toContain('no-fixed-sleep');
    expect(LINTS.find(l => l.id === 'no-fixed-sleep')!.severity).toBe('error');
  });

  test('the five exemption lists are exactly the shipped exceptions, with no spare rows', () => {
    expect([...KEBAB_UNIONS].sort()).toEqual(['DeathBehaviour', 'HealthCondition', 'PauseReason', 'RecoveryOutcome']);
    expect([...POSITIONAL_GRANDFATHERED].sort())
      .toEqual(['log', 'tutorial.clickThrough', 'wait.dialog', 'wait.item', 'wait.message', 'wait.xp']);
    expect(COUNT_EXEMPT.every(c => c.unit.length > 0)).toBe(true);
    // Pinned exactly, not with `toContain`: COUNT_EXEMPT is the api-shape gate's escape list, so a
    // spare row is how Task 16's gate gets silenced on a name that should have gained a suffix.
    expect(COUNT_EXEMPT.map(c => c.name).sort()).toEqual(['attempts', 'delta', 'estimateMinutes',
      'hpBelow', 'id', 'level', 'minDelta', 'opIndex', 'radius', 'tolerance', 'x', 'z']);
    // R4: the six names this entry itself adds have to be here, or the api-shape gate lands red
    // in Task 16 on the surface this same entry shipped.
    for (const n of ['attempts', 'id', 'opIndex', 'x', 'z', 'level']) {
      expect(COUNT_EXEMPT.map(c => c.name), n).toContain(n);
    }
    expect([...ABBREVIATIONS].sort()).toEqual(['cfg', 'dist', 'idx', 'inv', 'len', 'msg', 'num',
      'obj', 'pos', 'qty', 'str', 'val']);
    // `opts` is the parameter name S4 prescribes and the gate matches on, so it is never a row.
    expect(ABBREVIATIONS).not.toContain('opts');
    expect(SIGNAL_EXEMPT).toEqual(['ScreenshotOpts']);
  });
});
