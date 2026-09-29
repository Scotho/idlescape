import { parseConfigText, first, paramsOf, type ConfigBlock } from './parse/configText';
import type { PackIds } from './parse/packIds';
import { slugify, dedupeSlugs, aliasesFor } from './slug';
import type { NpcEntity, NpcStats, Source } from './types';

export function optionsOf(b: ConfigBlock, prefix: 'op' | 'iop'): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const v = first(b, `${prefix}${i}`);
    if (v) out.push(v);
  }
  return out;
}

/** Same formula as engine/server/src/engine/entity/Player.ts getCombatLevel, applied to NPC stats. */
export function npcCombatLevel(s: NpcStats): number {
  const base = 0.25 * (s.defence + s.hitpoints + 0); // NPC configs carry no prayer stat, so the prayer term is 0
  const melee = 0.325 * (s.attack + s.strength);
  const range = 0.325 * (Math.floor(s.ranged / 2) + s.ranged);
  const magic = 0.325 * (Math.floor(s.magic / 2) + s.magic);
  return Math.floor(base + Math.max(melee, range, magic));
}

function stat(b: ConfigBlock, k: string): number { const v = first(b, k); return v === null ? 1 : Number(v); }

function sourcesOf(b: ConfigBlock): Source[] {
  const s: Source[] = [
    { kind: 'content', ref: `content:${b.file}#${b.key}` },
    { kind: 'engine', ref: 'engine:src/cache/config/NpcType.ts#defaults', note: 'size=1, stats=1, vislevel=-1 when absent' }
  ];
  for (const url of b.citations) s.push({ kind: 'cited', ref: url });
  return s;
}

export function extractNpcs(opts: { npcTexts: { file: string; text: string }[]; npcPack: PackIds }): NpcEntity[] {
  const npcs: NpcEntity[] = [];
  for (const { file, text } of opts.npcTexts) {
    for (const b of parseConfigText(text, file)) {
      const id = opts.npcPack.byKey.get(b.key);
      if (id === undefined) continue;
      const name = first(b, 'name') ?? b.key;
      const hasStats = b.fields.has('hitpoints') || b.fields.has('attack') || b.fields.has('defence');
      const stats: NpcStats | null = hasStats
        ? { hitpoints: stat(b, 'hitpoints'), attack: stat(b, 'attack'), strength: stat(b, 'strength'), defence: stat(b, 'defence'), ranged: stat(b, 'ranged'), magic: stat(b, 'magic') }
        : null;
      const vis = first(b, 'vislevel');
      const vislevel = vis === null || vis === 'hide' ? null : Number(vis);
      const derivedLevel = stats ? npcCombatLevel(stats) : null;
      const sources = sourcesOf(b);
      if (vislevel === null && derivedLevel !== null) sources.push({ kind: 'derived', ref: 'derived:npcs.ts:npcCombatLevel', note: 'combat level computed from config stats' });
      npcs.push({
        type: 'npc', id, key: b.key, slug: slugify(name), name, members: first(b, 'members') === 'yes',
        aliases: aliasesFor(b.key, name), sources,
        examine: first(b, 'desc'), options: optionsOf(b, 'op'), size: Number(first(b, 'size') ?? 1),
        vislevel, stats, combatLevel: vislevel ?? derivedLevel, category: first(b, 'category'),
        respawnTicks: first(b, 'respawnrate') === null ? null : Number(first(b, 'respawnrate')), params: paramsOf(b)
      });
    }
  }
  dedupeSlugs(npcs);
  return npcs;
}
