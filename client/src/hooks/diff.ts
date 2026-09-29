import type { InventoryEvent, XpEvent } from './types';

export function diffXp(prev: number[], next: number[], levels: number[]): XpEvent[] {
  if (prev.length === 0) return [];
  const out: XpEvent[] = [];
  for (let i = 0; i < next.length; i++) {
    const before = prev[i] ?? 0;
    if (next[i] !== before) out.push({ skill: i, xp: next[i], level: levels[i] ?? 1, delta: next[i] - before });
  }
  return out;
}

function tally(ids: number[], counts: number[]): Map<number, number> {
  const m = new Map<number, number>();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (id > 0 && counts[i] > 0) m.set(id, (m.get(id) ?? 0) + counts[i]);
  }
  return m;
}

export function diffInventory(prevIds: number[], prevCounts: number[], nextIds: number[], nextCounts: number[]): InventoryEvent {
  const before = tally(prevIds, prevCounts);
  const after = tally(nextIds, nextCounts);
  const added: InventoryEvent['added'] = [];
  const removed: InventoryEvent['removed'] = [];
  for (const [id, count] of after) {
    const b = before.get(id) ?? 0;
    if (count > b) added.push({ id, count: count - b });
  }
  for (const [id, count] of before) {
    const a = after.get(id) ?? 0;
    if (a < count) removed.push({ id, count: count - a });
  }
  return { added, removed };
}
