import { NULL_OBJ } from './drops';
import { parseConfigText } from './parse/configText';
import type { DbColumn, DbRow } from './parse/dbrows';
import { slugify } from './slug';
import type { Method, SkillEntity } from './types';

// engine/server/src/engine/entity/Player.ts lines 77-85. The engine stores xp x10; this table is in whole xp.
const TABLE: number[] = (() => {
  const t = [0];
  let acc = 0;
  for (let level = 1; level < 99; level++) {
    acc += Math.floor(level + Math.pow(2, level / 7) * 300);
    t.push(Math.floor(acc / 4));
  }
  return t;
})();
export function xpForLevel(level: number): number { return TABLE[Math.min(Math.max(level, 1), 99) - 1]!; }
export function levelForXp(xp: number): number {
  for (let l = 99; l >= 2; l--) if (xp >= TABLE[l - 1]!) return l;
  return 1;
}

const DISPLAY: Record<string, string> = { runecraft: 'Runecraft', hitpoints: 'Hitpoints' };

export function extractSkills(opts: { statEnumText: string; unlocksEnumText: string }): SkillEntity[] {
  const blocks = parseConfigText(opts.statEnumText, 'scripts/player/configs/stat.enum');
  const stats = blocks.find(b => b.key === 'stats');
  if (!stats) throw new Error('stat.enum has no [stats] block');
  const free = new Set((blocks.find(b => b.key === 'stats_free')?.fields.get('val') ?? []).map(v => v.split(',')[1]!));
  const unlockBlocks = parseConfigText(opts.unlocksEnumText, 'scripts/levelup/configs/levelup_unlocks.enum');
  const out: SkillEntity[] = [];
  for (const v of stats.fields.get('val') ?? []) {
    const [idx, key] = v.split(',') as [string, string];
    const name = DISPLAY[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
    const unlocks = (unlockBlocks.find(b => b.key === `levelup_unlocks_${key}`)?.fields.get('val') ?? []).map(Number);
    out.push({ type: 'skill', id: Number(idx), key, slug: slugify(name), name, index: Number(idx), members: !free.has(key), aliases: [key], unlocks,
      sources: [{ kind: 'content', ref: 'content:scripts/player/configs/stat.enum#stats' }, { kind: 'content', ref: `content:scripts/levelup/configs/levelup_unlocks.enum#levelup_unlocks_${key}` }] });
  }
  return out;
}

const XP_COLS = ['productexp', 'exp', 'xp', 'experience'];
const LEVEL_COLS = ['levelrequired', 'level'];
const VERB: Record<string, string> = { woodcutting: 'Chop', mining: 'Mine', fishing: 'Fish', cooking: 'Cook', smithing: 'Smith', crafting: 'Craft', fletching: 'Fletch', firemaking: 'Burn', herblore: 'Mix', runecraft: 'Craft' };

function skillOf(file: string): string | null {
  const m = /skill_([a-z]+)\//.exec(file);
  return m ? m[1]! : null;
}

export function extractMethods(opts: { rows: DbRow[]; tables: Map<string, DbColumn[]> }): Method[] {
  const out: Method[] = [];
  for (const r of opts.rows) {
    const skill = skillOf(r.file);
    if (!skill) continue;
    const cols = opts.tables.get(r.table) ?? [];
    const levelCol = LEVEL_COLS.find(c => r.values[c]);
    const xpCol = XP_COLS.find(c => r.values[c]);
    if (!levelCol || !xpCol) continue;
    // `null` is RuneScript's "no object" sentinel (an empty product or ingredient slot), not an item.
    const outputs = (r.values['product'] ?? []).map(t => t[0]!).filter(o => o !== NULL_OBJ);
    const inputs = new Set<string>();
    for (const c of cols) {
      if (c.name === 'product' || c.name === levelCol || c.name === xpCol) continue;
      for (const tuple of r.values[c.name] ?? []) c.types.forEach((t, i) => { if ((t === 'namedobj' || t === 'obj' || t === 'loc') && tuple[i] && tuple[i] !== NULL_OBJ) inputs.add(tuple[i]!); });
    }
    out.push({ skill, level: Math.max(1, Number(r.values[levelCol]![0]![0])), xp: Number(r.values[xpCol]![0]![0]) / 10,
      action: `${VERB[skill] ?? 'Make'} ${r.key.replace(/_table$/, '').replace(/_/g, ' ')}`,
      inputs: [...inputs], outputs, table: r.table, row: r.key,
      sources: [{ kind: 'content', ref: `content:${r.file}#${r.key}` }, ...r.citations.map(u => ({ kind: 'cited' as const, ref: u }))] });
  }
  return out;
}
