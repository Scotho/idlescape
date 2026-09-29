import { describe, expect, test } from 'vitest';
import type { ParamSchema } from './types';
import { compileUserScript, defineScript, validateParams } from './defineScript';

describe('defineScript', () => {
  test('rejects a script with no tasks or a bad id', () => {
    expect(() => defineScript({ id: 'Bad Id', name: 'x', version: 1, description: '', tasks: [] })).toThrow(/id/);
    expect(() => defineScript({ id: 'ok', name: 'x', version: 1, description: '', tasks: [] })).toThrow(/tasks/);
  });
  test('rejects duplicate task names', () => {
    const t = { name: 'a', when: () => true, run: async () => {} };
    expect(() => defineScript({ id: 'ok', name: 'x', version: 1, description: '', tasks: [t, t] })).toThrow(/duplicate/);
  });
});

describe('validateParams', () => {
  const schema = { level: { type: 'number', label: 'Level', default: 15, min: 2, max: 99 }, tree: { type: 'select', label: 'Tree', default: 'Tree', options: [{ value: 'Tree', label: 'Tree' }, { value: 'Oak', label: 'Oak' }] } } satisfies ParamSchema;
  test('applies defaults', () => { expect(validateParams(schema, {})).toEqual({ ok: true, values: { level: 15, tree: 'Tree' } }); });
  test('rejects out of range and unknown keys', () => {
    const r = validateParams(schema, { level: 120, tree: 'Willow', extra: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toEqual(['level must be between 2 and 99', 'tree must be one of Tree, Oak', 'unknown param extra']);
  });
});

describe('compileUserScript', () => {
  test('compiles an export-default defineScript module string', () => {
    const r = compileUserScript(`export default defineScript({ id: 'user-one', name: 'One', version: 1, description: 'd', tasks: [{ name: 'go', when: () => true, run: async () => {} }] });`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.script.id).toBe('user-one');
  });
  test('reports syntax errors with a message', () => {
    const r = compileUserScript('export default defineScript({');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/Unexpected|expected/i);
  });
  test('refuses code that does not produce a script', () => {
    expect(compileUserScript('export default 42;')).toMatchObject({ ok: false });
  });
});
