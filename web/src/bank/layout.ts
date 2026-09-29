// web/src/bank/layout.ts -- pure tab and slot arithmetic for the web bank. No DOM, no fetch.
// The web counterpart of engine-custom/src/idlescape/bankLayout.ts: the two are meant to be
// read side by side, and every ruling below is that module's ruling.
import type { BankItems, BankSnapshot, BankSortKey, ObjInfo } from './types';

export function tabRanges(tabs: number[]): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let start = 0;
  for (const size of tabs) { out.push({ start, end: start + size }); start += size; }
  return out;
}

export function tabOfSlot(tabs: number[], slot: number): number {
  const ranges = tabRanges(tabs);
  for (let i = 0; i < ranges.length; i++) if (slot >= ranges[i].start && slot < ranges[i].end) return i + 1;
  return 0;
}

export function rangeOfTab(tabs: number[], tab: number, used: number): { start: number; end: number } {
  if (tab === 0) { const start = tabs.reduce((t, s) => t + s, 0); return { start, end: Math.max(start, used) }; }
  const range = tabRanges(tabs)[tab - 1];
  return range ?? { start: used, end: used };
}

export function usedOf(items: BankItems): number {
  for (let slot = items.length - 1; slot >= 0; slot--) if (items[slot]) return slot + 1;
  return 0;
}

export function expandSlots(snapshot: BankSnapshot): BankItems {
  const out: BankItems = new Array(snapshot.capacity).fill(null);
  for (const slot of snapshot.slots) if (slot.slot >= 0 && slot.slot < out.length) out[slot.slot] = { ...slot };
  return out;
}

export function tabIconObj(items: BankItems, tabs: number[], tab: number, used: number): number | null {
  const { start, end } = rangeOfTab(tabs, tab, used);
  for (let slot = start; slot < end; slot++) { const item = items[slot]; if (item) return item.obj; }
  return null;
}

export function tabItemCount(items: BankItems, tabs: number[], tab: number, used: number): number {
  const { start, end } = rangeOfTab(tabs, tab, used);
  let count = 0;
  for (let slot = start; slot < end; slot++) if (items[slot]) count++;
  return count;
}

/** Rewrites every `slot` field so a moved item's own record matches where it now sits. */
function renumber(items: BankItems): BankItems {
  return items.map((item, slot) => (item ? { ...item, slot } : null));
}

export function localSwap(items: BankItems, a: number, b: number): BankItems {
  const next = [...items];
  const tmp = next[a];
  next[a] = next[b];
  next[b] = tmp;
  return renumber(next);
}

export function localInsert(items: BankItems, from: number, to: number): BankItems {
  const next = [...items];
  const moving = next[from];
  if (from < to) for (let slot = from; slot < to; slot++) next[slot] = next[slot + 1];
  else for (let slot = from; slot > to; slot--) next[slot] = next[slot - 1];
  next[to] = moving;
  return renumber(next);
}

export function insertCrossesTab(tabs: number[], from: number, to: number): boolean {
  return tabOfSlot(tabs, from) !== tabOfSlot(tabs, to);
}

export function alchValue(cost: number): number {
  return Math.max(Math.floor((cost * 6) / 10), 1);
}

export function formatCount(count: number): { text: string; tone: 'yellow' | 'white' | 'green' } | null {
  if (count < 2) return null;
  if (count >= 10_000_000) return { text: `${Math.floor(count / 1_000_000)}M`, tone: 'green' };
  if (count >= 100_000) return { text: `${Math.floor(count / 1_000)}K`, tone: 'white' };
  return { text: String(count), tone: 'yellow' };
}

export function localSort(items: BankItems, tabs: number[], tab: number, used: number, by: BankSortKey, info: (obj: number) => ObjInfo | null): BankItems {
  const { start, end } = rangeOfTab(tabs, tab, used);
  const held = items.slice(start, end).filter((item): item is NonNullable<BankItems[number]> => item !== null);
  held.sort((a, b) => {
    if (by === 'id') return a.obj - b.obj;
    // 'en', not the host locale: the engine pins its collation the same way.
    if (by === 'name') return (info(a.obj)?.name ?? '').localeCompare(info(b.obj)?.name ?? '', 'en');
    return alchValue(info(b.obj)?.cost ?? 0) - alchValue(info(a.obj)?.cost ?? 0);
  });
  const next = [...items];
  for (let slot = start; slot < end; slot++) next[slot] = held[slot - start] ?? null;
  return renumber(next);
}
