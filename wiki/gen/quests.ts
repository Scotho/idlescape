import { parseConfigText } from './parse/configText';
import type { ScriptBlock } from './parse/rs2';
import { slugify } from './slug';
import type { Coord, QuestEntity, QuestReward, QuestStage, Requirement, Source, Spawn } from './types';

export function parseConstants(texts: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of texts) for (const line of t.split(/\r?\n/)) {
    const m = /^\^([a-z0-9_]+)\s*=\s*(-?\d+)/.exec(line.trim());
    if (m) out.set(m[1]!, Number(m[2]));
  }
  return out;
}

function resolve(v: string, constants: Map<string, number>): number | null {
  if (/^-?\d+$/.test(v)) return Number(v);
  if (v.startsWith('^')) return constants.get(v.slice(1)) ?? null;
  return null;
}

const CHAT = /~chatnpc\("(?:<[^>]*>)?([^"]+)"\)/g;
const dedupe = <T,>(a: T[]): T[] => [...new Map(a.map(x => [JSON.stringify(x), x])).values()];

/** NPC configs carry no members flag, and neither do quests: a quest counts as members-only when
 * every spawn of its start NPC sits outside a free-to-play zone (the same rule `extract.ts`
 * applies to NPCs). A quest with no start NPC, or a start NPC with no spawns, stays `false` and
 * is reported in `gaps.md`. */
export function extractQuests(opts: { questFolders: { folder: string; files: { file: string; text: string }[] }[]; allBlocks: ScriptBlock[]; constants: Map<string, number>; questNames: Map<string, string>; npcKeys: Set<string>; npcSpawns: Map<string, Spawn[]>; isFree: (c: Coord) => boolean }): QuestEntity[] {
  const out: QuestEntity[] = [];
  let id = 0;
  for (const qf of opts.questFolders) {
    const name = opts.questNames.get(qf.folder);
    if (!name) continue;
    const varpFile = qf.files.find(f => f.file.endsWith('.varp'));
    const varp = varpFile ? parseConfigText(varpFile.text, varpFile.file)[0]?.key ?? null : null;
    if (!varp) continue;
    const folderBlocks = opts.allBlocks.filter(b => b.file.includes(`/quests/${qf.folder}/`));
    const related = opts.allBlocks.filter(b => b.body.includes(`%${varp}`) && !folderBlocks.includes(b));
    const blocks = [...folderBlocks, ...related];
    const sources: Source[] = [
      { kind: 'content', ref: `content:scripts/quests/${qf.folder}` },
      { kind: 'derived', ref: 'derived:quests.ts:progression', note: 'stages from varp assignments, rewards from the completion block' }
    ];
    for (const b of blocks) for (const u of b.citations) sources.push({ kind: 'cited', ref: u });

    const stageMap = new Map<number, QuestStage>();
    const assign = new RegExp(`%${varp}\\s*=\\s*(\\^?[a-z0-9_]+)\\s*;`, 'g');
    let completeValue = 0;
    for (const b of blocks) {
      for (const m of b.body.matchAll(assign)) {
        const v = resolve(m[1]!, opts.constants);
        if (v === null || v === 0) continue;
        if (m[1]!.endsWith('_complete')) completeValue = v;
        if (!stageMap.has(v)) stageMap.set(v, { value: v, label: b.subject, hints: [...b.body.matchAll(CHAT)].map(c => c[1]!.replace(/\|/g, ' ')).slice(0, 3) });
      }
    }
    const stages = [...stageMap.values()].sort((a, b) => a.value - b.value);
    if (!completeValue && stages.length) completeValue = stages[stages.length - 1]!.value;

    const requirements: Requirement[] = [];
    const items = new Set<string>();
    for (const b of folderBlocks) {
      for (const m of b.body.matchAll(/stat(?:_base)?\((\w+)\)\s*(?:<|>=)\s*(\d+)/g)) requirements.push({ kind: 'skill', key: m[1]!, value: Number(m[2]) });
      for (const m of b.body.matchAll(/%([a-z0-9_]+)\s*(?:<|>=|=)\s*\^([a-z0-9_]+)_complete/g)) if (m[1] !== varp) requirements.push({ kind: 'quest', key: m[2]!, value: opts.constants.get(`${m[2]}_complete`) ?? 1 });
      for (const m of b.body.matchAll(/inv_total\(inv,\s*([a-z0-9_]+)\)/g)) items.add(m[1]!);
      // Quest-point gates compare the quest-point varp (`%qp`) against a literal or a
      // `^<quest>_required_questpoints` constant, e.g. `if (%qp < 32)` in Dragon Slayer's journal
      // and `if (%qp >= ^legends_required_questpoints)` in the Legends' Quest guard.
      for (const m of b.body.matchAll(/%(?:qp|questpoints)\s*(?:<|>=)\s*(\^?[a-z0-9_]+)/g)) {
        const v = resolve(m[1]!, opts.constants);
        if (v !== null) requirements.push({ kind: 'questpoints', key: 'questpoints', value: v });
      }
    }

    const rewards: QuestReward[] = [];
    let questPoints: number | null = null;
    const completion = blocks.filter(b => new RegExp(`%${varp}\\s*=\\s*\\^[a-z0-9_]+_complete`).test(b.body));
    for (const b of completion) {
      for (const m of b.body.matchAll(/stat_advance\((\w+),\s*(\d+)\)/g)) rewards.push({ kind: 'xp', key: m[1]!, amount: Number(m[2]) / 10 });
      for (const m of b.body.matchAll(/inv_add\(inv,\s*([a-z0-9_]+),\s*(\d+)\)/g)) rewards.push({ kind: 'item', key: m[1]!, amount: Number(m[2]) });
      const qp = /send_quest_complete\([^;]*?,\s*(\^?[a-z0-9_]+)\s*,\s*"/.exec(b.body);
      if (qp) { const v = resolve(qp[1]!, opts.constants); if (v !== null) { questPoints = v; rewards.push({ kind: 'questpoints', key: 'questpoints', amount: v }); } }
    }

    // Quest-start checks are usually written against the named "not started" constant (e.g. `%foo = ^foo_not_started`)
    // rather than a literal 0, so resolve the right-hand side instead of text-matching "0".
    const assignsTo = (body: string) => [...body.matchAll(new RegExp(`%${varp}\\s*=\\s*(\\^?[a-z0-9_]+)`, 'g'))];
    const testsZero = (body: string) => assignsTo(body).some(m => resolve(m[1]!, opts.constants) === 0);
    const npcBlocks = opts.allBlocks.filter(b => b.trigger === 'opnpc1' && opts.npcKeys.has(b.subject));
    let start = npcBlocks.find(b => testsZero(b.body));
    if (!start) {
      // One level of call-graph: dialogue is often factored into a label/proc the opnpc1 block calls
      // (`@name` / `~name`), and the real varp check lives there instead of inline.
      const called = (b: ScriptBlock) => {
        const names = new Set([...b.body.matchAll(/[@~]([a-z0-9_]+)/g)].map(m => m[1]!));
        return opts.allBlocks.filter(cb => (cb.trigger === 'label' || cb.trigger === 'proc') && names.has(cb.subject));
      };
      start = npcBlocks.find(b => { const cbs = called(b); return cbs.some(cb => testsZero(cb.body)) || cbs.some(cb => assignsTo(cb.body).length > 0); });
    }
    const startNpcKey = start?.subject ?? null;
    const startSpawns = startNpcKey ? opts.npcSpawns.get(startNpcKey) ?? [] : [];
    const members = startSpawns.length > 0 && startSpawns.every(sp => !opts.isFree(sp.coord));
    out.push({ type: 'quest', id: id++, key: qf.folder, slug: slugify(name), name, members, aliases: [name.toLowerCase().replace(/'/g, '')], sources,
      folder: qf.folder, varp, completeValue, questPoints, startNpcKey, stages, requirements: dedupe(requirements), itemsChecked: [...items], rewards: dedupe(rewards) });
  }
  return out;
}
