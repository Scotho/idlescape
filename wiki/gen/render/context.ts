import type { Area, Drop, EntityType, ExtractedData, ItemEntity, LocEntity, Method, NpcEntity, QuestEntity, ShopEntity, Spawn } from '../types';

function group<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) { const k = key(r); (m.get(k) ?? m.set(k, []).get(k)!).push(r); }
  return m;
}

export interface RenderContext {
  data: ExtractedData;
  itemByKey: Map<string, ItemEntity>; npcByKey: Map<string, NpcEntity>; locByKey: Map<string, LocEntity>; areaBySlug: Map<string, Area>;
  spawnsByKey: Map<string, Spawn[]>; dropsByNpc: Map<string, Drop[]>; dropsByItem: Map<string, Drop[]>;
  shopsByItem: Map<string, ShopEntity[]>; methodsByOutput: Map<string, Method[]>; methodsByInput: Map<string, Method[]>;
  questsRewarding: Map<string, QuestEntity[]>; questsChecking: Map<string, QuestEntity[]>;
  nameIndex: Map<string, { type: EntityType; slug: string }>;
  itemName(key: string): string; npcName(key: string): string; locName(key: string): string;
}

export function buildContext(data: ExtractedData): RenderContext {
  const itemByKey = new Map(data.items.map(i => [i.key, i]));
  const npcByKey = new Map(data.npcs.map(n => [n.key, n]));
  const locByKey = new Map(data.locs.map(l => [l.key, l]));
  const nameIndex = new Map<string, { type: EntityType; slug: string }>();
  const all: { type: EntityType; slug: string; name: string; aliases: string[] }[] = [...data.items, ...data.npcs, ...data.locs, ...data.quests, ...data.skills, ...data.shops, ...data.areas];
  for (const e of all) for (const n of [e.name, ...e.aliases]) if (!nameIndex.has(n.toLowerCase())) nameIndex.set(n.toLowerCase(), { type: e.type, slug: e.slug });
  const shopsByItem = new Map<string, ShopEntity[]>();
  for (const s of data.shops) for (const st of s.stock) (shopsByItem.get(st.itemKey) ?? shopsByItem.set(st.itemKey, []).get(st.itemKey)!).push(s);
  const methodsByOutput = new Map<string, Method[]>(); const methodsByInput = new Map<string, Method[]>();
  for (const m of data.methods) { for (const o of m.outputs) (methodsByOutput.get(o) ?? methodsByOutput.set(o, []).get(o)!).push(m); for (const i of m.inputs) (methodsByInput.get(i) ?? methodsByInput.set(i, []).get(i)!).push(m); }
  const questsRewarding = new Map<string, QuestEntity[]>(); const questsChecking = new Map<string, QuestEntity[]>();
  for (const q of data.quests) { for (const r of q.rewards) if (r.kind === 'item') (questsRewarding.get(r.key) ?? questsRewarding.set(r.key, []).get(r.key)!).push(q); for (const k of q.itemsChecked) (questsChecking.get(k) ?? questsChecking.set(k, []).get(k)!).push(q); }
  return {
    data, itemByKey, npcByKey, locByKey, areaBySlug: new Map(data.areas.map(a => [a.slug, a])),
    spawnsByKey: group(data.spawns, s => `${s.kind}:${s.key}`), dropsByNpc: group(data.drops, d => d.npcKey), dropsByItem: group(data.drops, d => d.itemKey),
    shopsByItem, methodsByOutput, methodsByInput, questsRewarding, questsChecking, nameIndex,
    itemName: k => itemByKey.get(k)?.name ?? k, npcName: k => npcByKey.get(k)?.name ?? k, locName: k => locByKey.get(k)?.name ?? k
  };
}
