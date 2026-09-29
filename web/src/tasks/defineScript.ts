// web/src/tasks/defineScript.ts — script declaration, param validation, user-script compiler.
import type { ParamSchema, ParamValues, Script } from './types';

const ID_RE = /^[a-z][a-z0-9-]{1,40}$/;

export function defineScript(s: Script): Script {
  if (!ID_RE.test(s.id)) throw new Error(`script id must match ${ID_RE}`);
  if (!Array.isArray(s.tasks) || s.tasks.length === 0) throw new Error('script tasks must be a non-empty array');
  const names = new Set<string>();
  for (const t of s.tasks) {
    if (!t.name || typeof t.when !== 'function' || typeof t.run !== 'function') throw new Error(`task ${t.name ?? '?'} needs name, when and run`);
    if (names.has(t.name)) throw new Error(`duplicate task name ${t.name}`);
    names.add(t.name);
  }
  return s;
}

export function validateParams(schema: ParamSchema | undefined, input: Record<string, unknown>): { ok: true; values: ParamValues } | { ok: false; errors: string[] } {
  const errors: string[] = []; const values: ParamValues = {};
  for (const [key, f] of Object.entries(schema ?? {})) {
    const raw = input[key];
    if (raw === undefined) { values[key] = f.default; continue; }
    if (f.type === 'boolean') { if (typeof raw !== 'boolean') errors.push(`${key} must be true or false`); else values[key] = raw; }
    else if (f.type === 'number') {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) errors.push(`${key} must be a number`);
      else if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) errors.push(`${key} must be between ${f.min ?? '-inf'} and ${f.max ?? 'inf'}`);
      else values[key] = n;
    }
    else if (f.type === 'select') { if (!f.options.some(o => o.value === raw)) errors.push(`${key} must be one of ${f.options.map(o => o.value).join(', ')}`); else values[key] = String(raw); }
    else { const text = String(raw); if (f.maxLength && text.length > f.maxLength) errors.push(`${key} is too long`); else values[key] = text; }
  }
  for (const key of Object.keys(input)) if (!(key in (schema ?? {}))) errors.push(`unknown param ${key}`);
  return errors.length ? { ok: false, errors } : { ok: true, values };
}

/** User scripts are `export default defineScript({...})` module text; we turn the export into a return. */
export function compileUserScript(code: string): { ok: true; script: Script } | { ok: false; message: string; line?: number } {
  if (code.length > 65_536) return { ok: false, message: 'script is larger than 64 KB' };
  const body = code.replace(/^\s*import[^;]*;?\s*$/gm, '').replace(/export\s+default\s+/, 'return ');
  try {
    const factory = new Function('defineScript', `"use strict";\n${body}`) as (d: typeof defineScript) => unknown;
    const out = factory(defineScript);
    if (!out || typeof out !== 'object' || !Array.isArray((out as Script).tasks)) return { ok: false, message: 'script must export default defineScript({...})' };
    return { ok: true, script: out as Script };
  } catch (e) {
    const err = e as Error & { lineNumber?: number };
    return { ok: false, message: err.message, line: err.lineNumber };
  }
}
