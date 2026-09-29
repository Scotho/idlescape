import type { SkillEntity } from '../types';
import type { RenderContext } from './context';
import { section, type Draft } from './page';
import { wl } from './links';
import { fmtXp } from './infobox';
import { xpForLevel } from '../skills';

/** Method.inputs carries both tool items and interactable locs; the table links items and
 * collapses loc inputs (e.g. the trees a method can be used on) to a single count. */
function inputsCell(inputs: string[], ctx: RenderContext): string {
  const items = inputs.filter(k => ctx.itemByKey.has(k)).map(k => wl('item', ctx.itemByKey.get(k)!.slug, ctx.itemByKey.get(k)!.name));
  const locCount = inputs.filter(k => ctx.locByKey.has(k)).length;
  return [...items, ...(locCount ? [`${locCount} scenery`] : [])].join(', ');
}

export function renderSkill(s: SkillEntity, ctx: RenderContext): Draft {
  const methods = ctx.data.methods.filter(m => m.skill === s.key).sort((a, b) => a.level - b.level || a.xp - b.xp);
  const rows = methods.map(m => `| ${m.level} | ${m.action} | ${fmtXp(m.xp)} | ${inputsCell(m.inputs, ctx)} | ${m.outputs.map(k => ctx.itemByKey.get(k) ? wl('item', ctx.itemByKey.get(k)!.slug, ctx.itemByKey.get(k)!.name) : k).join(', ')} |`);
  const quests = ctx.data.quests.filter(q => q.rewards.some(r => r.kind === 'xp' && r.key === s.key)).map(q => `- ${wl('quest', q.slug, q.name)}: ${fmtXp(q.rewards.find(r => r.kind === 'xp' && r.key === s.key)!.amount)}`);
  const lead = `**${s.name}** is a${s.members ? ' members-only' : ' free-to-play'} skill. Level 99 requires ${xpForLevel(99).toLocaleString('en-GB')} experience.`;
  return { type: 'skill', slug: s.slug, title: s.name, lead,
    infobox: [['Members', s.members ? 'Yes' : 'No'], ['Skill id', String(s.index)], ['Level 99', `${xpForLevel(99).toLocaleString('en-GB')} xp`]],
    sections: [section('Mechanics', '', s.sources), section('Training', rows.length ? ['| Level | Action | Experience | Inputs | Outputs |', '|---|---|---|---|---|', ...rows].join('\n') : '', methods.flatMap(m => m.sources).concat(s.sources), true),
      section('Quests giving experience', quests.join('\n'), s.sources), section('Level-up unlocks', s.unlocks.map(l => `- Level ${l}`).join('\n'), s.sources), section('Trivia', '', s.sources)],
    sources: s.sources };
}
