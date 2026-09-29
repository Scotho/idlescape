import { describe, expect, test } from 'vitest';
import { validateParams } from './params';
import type { ParamSchema } from './types';

const fail = (message: string, detail?: unknown): Error => Object.assign(new Error(message), { detail });
const run = (schema: ParamSchema, given: Record<string, unknown>) => validateParams(schema, given, fail);

const SCHEMA: ParamSchema = {
  untilLevel: { type: 'number', label: 'Stop at level', default: 15, min: 2, max: 99 },
  keepLogs: { type: 'boolean', label: 'Keep logs', default: false },
  tree: { type: 'select', label: 'Tree', default: 'normal', options: [{ value: 'normal', label: 'Tree' }, { value: 'oak', label: 'Oak' }] },
  note: { type: 'text', label: 'Note', default: '', maxLength: 5 }
};

describe('validateParams', () => {
  test('fills every declared field from its default when nothing is given', () => {
    expect(run(SCHEMA, {})).toEqual({ untilLevel: 15, keepLogs: false, tree: 'normal', note: '' });
  });

  test('accepts values of the declared type and keeps them', () => {
    expect(run(SCHEMA, { untilLevel: 40, keepLogs: true, tree: 'oak', note: 'hi' }))
      .toEqual({ untilLevel: 40, keepLogs: true, tree: 'oak', note: 'hi' });
  });

  test('null and undefined fall back to the default rather than through', () => {
    expect(run(SCHEMA, { untilLevel: undefined, keepLogs: null })).toMatchObject({ untilLevel: 15, keepLogs: false });
  });

  test('numbers must be numbers and inside min/max', () => {
    expect(() => run(SCHEMA, { untilLevel: '40' })).toThrow(/must be a number/);
    expect(() => run(SCHEMA, { untilLevel: Number.NaN })).toThrow(/must be a number/);
    expect(() => run(SCHEMA, { untilLevel: 1 })).toThrow(/at least 2/);
    expect(() => run(SCHEMA, { untilLevel: 100 })).toThrow(/at most 99/);
    expect(run(SCHEMA, { untilLevel: 2 }).untilLevel).toBe(2);
    expect(run(SCHEMA, { untilLevel: 99 }).untilLevel).toBe(99);
  });

  test('booleans reject truthy stand-ins', () => {
    expect(() => run(SCHEMA, { keepLogs: 'yes' })).toThrow(/true or false/);
    expect(() => run(SCHEMA, { keepLogs: 1 })).toThrow(/true or false/);
  });

  test('selects must name one of their options', () => {
    expect(() => run(SCHEMA, { tree: 'willow' })).toThrow(/one of normal, oak/);
    expect(() => run(SCHEMA, { tree: 3 })).toThrow(/one of normal, oak/);
  });

  test('text must be a string within maxLength', () => {
    expect(() => run(SCHEMA, { note: 7 })).toThrow(/must be text/);
    expect(() => run(SCHEMA, { note: 'far too long' })).toThrow(/at most 5 characters/);
    expect(run(SCHEMA, { note: 'exact' }).note).toBe('exact');
  });

  test('a failure carries the offending key and value as detail', () => {
    try {
      run(SCHEMA, { untilLevel: 100 });
      throw new Error('expected a throw');
    } catch (e) {
      expect((e as { detail?: unknown }).detail).toEqual({ key: 'untilLevel', given: 100 });
    }
  });

  test('keys the schema does not declare are dropped, not passed on', () => {
    expect(run(SCHEMA, { untilLevel: 20, sneaky: 'nope' })).toEqual({ untilLevel: 20, keepLogs: false, tree: 'normal', note: '' });
  });

  test('an empty schema passes scalars through and rejects anything else', () => {
    expect(run({}, { a: 1, b: 'two', c: true, d: undefined })).toEqual({ a: 1, b: 'two', c: true });
    expect(() => run({}, { obj: { nested: 1 } })).toThrow(/boolean, number or string/);
    expect(run({}, {})).toEqual({});
  });
});
