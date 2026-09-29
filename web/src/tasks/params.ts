// Params arrive from a panel form, from Playwright, or (in SP4c) from Claude over the tab
// socket, so they are checked against the script's declared schema before a run starts rather
// than trusted and discovered wrong three tasks in.
import type { ParamField, ParamSchema, ParamValues } from './types';

type Fail = (message: string, detail?: unknown) => Error;

/** A scalar a `ParamValues` can hold; anything else is a caller bug, not a coercion. */
const scalar = (v: unknown): v is boolean | number | string =>
  typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string';

function one(key: string, field: ParamField, given: unknown, fail: Fail): boolean | number | string {
  if (given === undefined || given === null) return field.default;
  switch (field.type) {
    case 'boolean':
      if (typeof given !== 'boolean') throw fail(`"${key}" must be true or false`, { key, given });
      return given;
    case 'number': {
      const n = typeof given === 'number' ? given : Number(given);
      if (typeof given !== 'number' || !Number.isFinite(n)) throw fail(`"${key}" must be a number`, { key, given });
      if (field.min !== undefined && n < field.min) throw fail(`"${key}" must be at least ${field.min}`, { key, given });
      if (field.max !== undefined && n > field.max) throw fail(`"${key}" must be at most ${field.max}`, { key, given });
      return n;
    }
    case 'select': {
      if (typeof given !== 'string' || !field.options.some(o => o.value === given)) {
        throw fail(`"${key}" must be one of ${field.options.map(o => o.value).join(', ')}`, { key, given });
      }
      return given;
    }
    case 'text': {
      if (typeof given !== 'string') throw fail(`"${key}" must be text`, { key, given });
      if (field.maxLength !== undefined && given.length > field.maxLength) {
        throw fail(`"${key}" must be at most ${field.maxLength} characters`, { key, given });
      }
      return given;
    }
  }
}

/**
 * Fills every declared field from `given` or its default. Keys the schema does not declare are
 * passed through when the schema is empty (a user script's params are only known to its own
 * code) and dropped when it is not, so a typo cannot masquerade as a setting.
 */
export function validateParams(schema: ParamSchema, given: Record<string, unknown>, fail: Fail): ParamValues {
  const keys = Object.keys(schema);
  if (keys.length === 0) {
    const out: ParamValues = {};
    for (const [k, v] of Object.entries(given)) {
      if (v === undefined) continue;
      if (!scalar(v)) throw fail(`"${k}" must be a boolean, number or string`, { key: k, given: v });
      out[k] = v;
    }
    return out;
  }
  const out: ParamValues = {};
  for (const key of keys) out[key] = one(key, schema[key], given[key], fail);
  return out;
}
