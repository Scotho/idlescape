import { parseConfigText, first, paramsOf, type ConfigBlock } from './parse/configText';
import type { PackIds } from './parse/packIds';
import { slugify, dedupeSlugs, aliasesFor } from './slug';
import type { Bonuses, ItemEntity, Source } from './types';

const BONUS_PARAMS: [keyof Bonuses, string][] = [
  ['stabAttack', 'stabattack'], ['slashAttack', 'slashattack'], ['crushAttack', 'crushattack'], ['magicAttack', 'magicattack'], ['rangeAttack', 'rangeattack'],
  ['stabDefence', 'stabdefence'], ['slashDefence', 'slashdefence'], ['crushDefence', 'crushdefence'], ['magicDefence', 'magicdefence'], ['rangeDefence', 'rangedefence'],
  ['strength', 'strengthbonus'], ['prayer', 'prayerbonus']
];
const WEAPON_SLOTS = new Set(['righthand', 'lefthand']);
const ENGINE_DEFAULTS: Source = { kind: 'engine', ref: 'engine:src/cache/config/ObjType.ts#defaults', note: 'cost=1, tradeable=true, stackable=false, members=false when absent' };

export function parseWeight(s: string): number {
  const m = /^([0-9]*\.?[0-9]+)\s*(g|kg|lb|oz)$/i.exec(s.trim());
  if (!m) return 0;
  const n = Number(m[1]);
  switch (m[2]!.toLowerCase()) {
    case 'g': return Math.round(n);
    case 'kg': return Math.round(n * 1000);
    case 'lb': return Math.round(n * 453);
    default: return Math.round(n * 28.35);
  }
}

export function loadParamDefaults(paramTexts: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const text of paramTexts) for (const b of parseConfigText(text, 'param')) {
    const d = first(b, 'default');
    if (d !== null) out.set(b.key, d);
  }
  return out;
}

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bonusesOf(params: Record<string, string>, defaults: Map<string, string>, wearpos: string | null): Bonuses | null {
  if (!wearpos) return null;
  const get = (p: string) => num(params[p] ?? defaults.get(p), 0);
  const b = Object.fromEntries(BONUS_PARAMS.map(([k, p]) => [k, get(p)])) as unknown as Bonuses;
  b.attackRate = WEAPON_SLOTS.has(wearpos) ? num(params['attackrate'] ?? defaults.get('attackrate'), 4) : null;
  return b;
}

function levelRequireOf(params: Record<string, string>, wearpos: string | null): { skill: string; level: number }[] {
  const out: { skill: string; level: number }[] = [];
  const lr = params['levelrequire'];
  if (lr !== undefined && wearpos) {
    // levelrequire is checked against attack for weapons and defence for armour by scripts/levelrequire/scripts/*.rs2
    out.push({ skill: WEAPON_SLOTS.has(wearpos) ? 'attack' : 'defence', level: num(lr, 1) });
  }
  return out;
}

function sourcesOf(b: ConfigBlock): Source[] {
  const s: Source[] = [{ kind: 'content', ref: `content:${b.file}#${b.key}` }, ENGINE_DEFAULTS];
  for (const url of b.citations) s.push({ kind: 'cited', ref: url });
  return s;
}

export function extractItems(opts: { objTexts: { file: string; text: string }[]; objPack: PackIds; paramDefaults: Map<string, string> }): ItemEntity[] {
  const items: ItemEntity[] = [];
  for (const { file, text } of opts.objTexts) {
    for (const b of parseConfigText(text, file)) {
      const id = opts.objPack.byKey.get(b.key);
      if (id === undefined) continue;
      const name = first(b, 'name') ?? b.key;
      const params = paramsOf(b);
      const wearpos = first(b, 'wearpos');
      const cost = num(first(b, 'cost') ?? undefined, 1);
      items.push({
        type: 'item', id, key: b.key, slug: slugify(name), name, members: first(b, 'members') === 'yes',
        aliases: aliasesFor(b.key, name), sources: sourcesOf(b),
        examine: first(b, 'desc'), cost, weightG: parseWeight(first(b, 'weight') ?? ''),
        stackable: first(b, 'stackable') === 'yes', tradeable: first(b, 'tradeable') !== 'no',
        wearpos, category: first(b, 'category'), bonuses: bonusesOf(params, opts.paramDefaults, wearpos),
        levelRequire: levelRequireOf(params, wearpos), highAlch: Math.floor(cost * 0.6), lowAlch: Math.floor(cost * 0.4), params
      });
    }
  }
  dedupeSlugs(items);
  return items;
}
