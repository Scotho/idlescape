import type { DbColumn, DbRow } from './parse/dbrows';
import type { PackIds } from './parse/packIds';
import type { ScriptBlock } from './parse/rs2';
import type { Drop, Source } from './types';

/** The RuneScript `null` object is the "no object" sentinel, not an item; it must never
 * become a drop row (or a method input/output - see `skills.ts`). */
export const NULL_OBJ = 'null';

export interface DropsResult {
  drops: Drop[];
  /** Death scripts written against an NPC category (`[ai_queue3,_barbarian]`) whose category
   * named no NPC config. Reported in `gaps.md` rather than emitted as `_`-keyed drop rows. */
  unmatchedCategories: string[];
}

export interface Branch { lo: number; hi: number; den: number; lines: string[]; members: boolean }

const RANDOM_DEF = /\$random\s*=\s*random\((\d+)\)/;
const BRANCH_HEAD = /^\s*(?:\}\s*)?(?:else\s+)?if\s*\(\s*\$random\s*<\s*(\d+)\s*\)\s*\{/;

/** Splits a body into `$random < N` branches. One chain per `$random = random(N)`; nested blocks stay inside the branch's lines. */
export function parseRandomChain(body: string): Branch[] {
  const out: Branch[] = [];
  let den = 0; let lo = 0; let cur: Branch | null = null; let depth = 0;
  for (const line of body.split(/\r?\n/)) {
    const def = RANDOM_DEF.exec(line);
    if (def) { den = Number(def[1]); lo = 0; cur = null; depth = 0; continue; }
    if (!den) continue;
    const head = BRANCH_HEAD.exec(line);
    if (head && depth <= 1) {
      const hi = Number(head[1]);
      cur = { lo, hi, den, lines: [], members: false };
      out.push(cur); lo = hi; depth = 1; continue;
    }
    if (!cur) continue;
    if (/map_members\s*=\s*\^true/.test(line)) cur.members = true;
    cur.lines.push(line);
    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    if (depth <= 0) { cur = null; depth = 0; }
  }
  return out;
}

const OBJ_ADD = /obj_add\(\s*npc_coord\s*,\s*([~a-z0-9_]+)\s*(?:,\s*(.+?)(?=\s*,\s*\^))?/g; // count up to next argument marked by ^
const RETURN = /return\s*\(\s*([a-z0-9_]+)\s*,\s*([^)]+)\)/;

function countOf(expr: string): { min: number; max: number } {
  let t = expr.trim();
  // Strip leading calc( and trailing )
  if (t.startsWith('calc(') && t.endsWith(')')) {
    t = t.slice(5, -1).trim();
  }
  if (/^\d+$/.test(t)) return { min: Number(t), max: Number(t) };
  let m = /random\((\d+)\)\s*\+\s*(\d+)/.exec(t);
  if (m) return { min: Number(m[2]), max: Number(m[1]) - 1 + Number(m[2]) };
  m = /(\d+)\s*\+\s*random\((\d+)\)/.exec(t);
  if (m) return { min: Number(m[1]), max: Number(m[1]) + Number(m[2]) - 1 };
  return { min: 1, max: 1 };
}

interface SubDrop { item: string; min: number; max: number; num: number; den: number; members: boolean }

/** Check if a body has a pre-roll members gate (map_members = ^false with return before $random). */
function preRollMembersGate(body: string): boolean {
  const randomIdx = body.indexOf('$random');
  if (randomIdx < 0) return false;
  const prefix = body.slice(0, randomIdx);
  return /map_members\s*=\s*\^false/.test(prefix) && /return/.test(prefix);
}

/** proc name -> its branches as (item, count, rate) for helpers like ~randomherb. */
function procTables(blocks: ScriptBlock[]): Map<string, SubDrop[]> {
  const out = new Map<string, SubDrop[]>();
  for (const b of blocks) {
    if (b.trigger !== 'proc') continue;
    const hasPreRollGate = preRollMembersGate(b.body);
    const rows: SubDrop[] = [];
    for (const br of parseRandomChain(b.body)) {
      const r = RETURN.exec(br.lines.join('\n'));
      if (!r) continue;
      rows.push({ item: r[1]!, ...countOf(r[2]!), num: br.hi - br.lo, den: br.den, members: br.members || hasPreRollGate });
    }
    if (rows.length) out.set(b.subject, rows);
  }
  return out;
}

export function extractDrops(opts: { rs2Blocks: ScriptBlock[]; npcs: { key: string; params: Record<string, string>; category: string | null }[]; rows: DbRow[]; tables: Map<string, DbColumn[]>; categoryPack?: PackIds }): DropsResult {
  const drops: Drop[] = [];
  const unmatchedCategories = new Set<string>();
  const procs = procTables(opts.rs2Blocks);
  // A death script's subject can name an NPC *category* rather than an NPC: the header carries a
  // leading underscore (`[ai_queue3,_barbarian]`), and every NPC config whose `category=` is that
  // name dies by that script. `_category_<id>` is the same thing written with the id from
  // `pack/category.pack`; some configs spell the category out as `category_<id>` too.
  const npcsByCategory = new Map<string, string[]>();
  for (const n of opts.npcs) if (n.category) (npcsByCategory.get(n.category) ?? npcsByCategory.set(n.category, []).get(n.category)!).push(n.key);
  const subjectNpcs = (subject: string): string[] => {
    if (!subject.startsWith('_')) return [subject];
    const cat = subject.slice(1);
    const keys = new Set(npcsByCategory.get(cat) ?? []);
    const byId = /^category_(\d+)$/.exec(cat);
    const named = byId ? opts.categoryPack?.byId.get(Number(byId[1])) : undefined;
    if (named) for (const k of npcsByCategory.get(named) ?? []) keys.add(k);
    return [...keys];
  };
  const src = (b: ScriptBlock, table: string): Source[] => [
    { kind: 'content', ref: `content:${b.file}#${b.trigger},${b.subject}` },
    { kind: 'derived', ref: `derived:drops.ts:${table}`, note: 'rate from random() thresholds' },
    ...b.citations.map(u => ({ kind: 'cited' as const, ref: u }))
  ];
  for (const npc of opts.npcs) {
    const dd = npc.params['death_drop'];
    if (dd && dd !== NULL_OBJ) drops.push({ npcKey: npc.key, subjectKind: 'npc', itemKey: dd, min: 1, max: 1, num: 1, den: 1, condition: null, table: 'always', sources: [{ kind: 'content', ref: `content:npc#${npc.key}:death_drop` }] });
  }
  for (const b of opts.rs2Blocks) {
    if (b.trigger !== 'ai_queue3') continue;
    const hasPreRollGate = preRollMembersGate(b.body);
    // The rows a block produces are the same for every subject it names, so build them once and
    // stamp each matched NPC key onto a copy.
    const rows: Omit<Drop, 'npcKey'>[] = [];
    for (const br of parseRandomChain(b.body)) {
      const num = br.hi - br.lo;
      for (const m of br.lines.join('\n').matchAll(OBJ_ADD)) {
        const item = m[1]!;
        const cond = (br.members || hasPreRollGate) ? 'members' : null;
        if (item.startsWith('~')) {
          const sub = procs.get(item.slice(1));
          if (!sub) continue;
          for (const s of sub) rows.push({ subjectKind: 'npc', itemKey: s.item, min: s.min, max: s.max, num: num * s.num, den: br.den * s.den, condition: cond ?? (s.members ? 'members' : null), table: item.slice(1), sources: src(b, item.slice(1)) });
        } else {
          rows.push({ subjectKind: 'npc', itemKey: item, ...countOf(m[2] ?? '1'), num, den: br.den, condition: cond, table: 'main', sources: src(b, 'main') });
        }
      }
    }
    for (const subject of b.subject.split(',').map(s => s.trim())) {
      const targets = subjectNpcs(subject);
      if (!targets.length) { if (subject.startsWith('_')) unmatchedCategories.add(subject); continue; }
      for (const npcKey of targets) for (const r of rows) drops.push({ npcKey, ...r });
    }
  }
  for (const r of opts.rows) {
    if (r.table !== 'drop_table') continue;
    const den = Number(r.values['total']?.[0]?.[0] ?? 0);
    for (const [item, count, weight] of r.values['drop'] ?? []) {
      drops.push({ npcKey: r.key, subjectKind: 'table', itemKey: item!, min: Number(count), max: Number(count), num: Number(weight), den, condition: null, table: r.key, sources: [{ kind: 'content', ref: `content:${r.file}#${r.key}` }] });
    }
  }
  return { drops, unmatchedCategories: [...unmatchedCategories].sort() };
}
