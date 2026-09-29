export interface LootEntry { id: number; count: number; firstSeen: number }

export function createLootLog() {
  const entries = new Map<number, LootEntry>();
  return {
    onInventory(ev: { added: { id: number; count: number }[] }, now: number) {
      for (const a of ev.added) {
        const e = entries.get(a.id);
        if (e) e.count += a.count; else entries.set(a.id, { id: a.id, count: a.count, firstSeen: now });
      }
    },
    entries: () => Array.from(entries.values()),
    reset() { entries.clear(); }
  };
}
