// web/src/tasks/requirements.ts — can this script run right now?
import type { WorldState } from '../agent/types';
import type { Requirement } from './types';

const has = (s: WorldState, name: string, qty = 1): boolean => {
  const n = name.toLowerCase();
  const count = [...(s.inventory ?? []), ...(s.equipment ?? [])].filter(i => i.name?.toLowerCase() === n).reduce((a, i) => a + (i.count || 1), 0);
  return count >= qty;
};

export function evaluateRequirements(reqs: Requirement[] | undefined, s: WorldState | null): { ok: boolean; missing: string[] } {
  if (!reqs?.length) return { ok: true, missing: [] };
  if (!s) return { ok: false, missing: reqs.map(r => r.text) };
  const missing = reqs.filter(r =>
    r.kind === 'item' ? !has(s, r.name, r.qty)
    : r.kind === 'skill' ? !(s.skills ?? []).some(k => k.name === r.skill && k.baseLevel >= r.level)
    : r.kind === 'area' ? !r.regionIds.includes(s.regionId)
    : !r.test(s)).map(r => r.text);
  return { ok: missing.length === 0, missing };
}
