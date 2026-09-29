import type { QuestEntity } from '../types';
import type { RenderContext } from './context';
import { section, type Draft } from './page';
import { wl } from './links';
import { fmtXp } from './infobox';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function renderQuest(q: QuestEntity, ctx: RenderContext): Draft {
  const start = q.startNpcKey ? ctx.npcByKey.get(q.startNpcKey) : undefined;
  const items = q.itemsChecked.map(k => ctx.itemByKey.get(k)).filter((i): i is NonNullable<typeof i> => !!i);
  const reqs = q.requirements.map(r => r.kind === 'skill' ? `${r.value} ${wl('skill', r.key, cap(r.key))}` : r.kind === 'quest' ? (ctx.data.quests.find(x => x.varp.startsWith(r.key)) ? wl('quest', ctx.data.quests.find(x => x.varp.startsWith(r.key))!.slug, ctx.data.quests.find(x => x.varp.startsWith(r.key))!.name) : r.key) : `${r.value} ${r.kind}`);
  const lead = `**${q.name}** is a${q.members ? ' members' : ' free-to-play'} quest${start ? ` started by talking to ${wl('npc', start.slug, start.name)}` : ''}. It awards ${q.questPoints ?? 'an unknown number of'} quest point${q.questPoints === 1 ? '' : 's'}.`;
  const walkthrough = q.stages.map((s, i) => `${i + 1}. Stage ${s.value}${s.value === q.completeValue ? ' (complete)' : ''} is reached in script label \`${s.label}\`.${s.hints.length ? ` The dialogue includes: "${s.hints.join('" / "')}"` : ''}`).join('\n');
  const rewards = q.rewards.map(r => r.kind === 'xp' ? `- ${fmtXp(r.amount)} ${wl('skill', r.key, cap(r.key))}` : r.kind === 'item' ? `- ${r.amount} × ${ctx.itemByKey.get(r.key) ? wl('item', ctx.itemByKey.get(r.key)!.slug, ctx.itemByKey.get(r.key)!.name) : r.key}` : `- ${r.amount} quest point${r.amount === 1 ? '' : 's'}`).join('\n');
  const requiredFor = ctx.data.quests.filter(o => o.requirements.some(r => r.kind === 'quest' && q.varp.startsWith(r.key))).map(o => `- ${wl('quest', o.slug, o.name)}`).join('\n');
  const derived = [...q.sources, { kind: 'derived' as const, ref: 'derived:quests.ts:progression' }];
  return { type: 'quest', slug: q.slug, title: q.name, lead,
    infobox: [['Members', q.members ? 'Yes' : 'No'], ['Start point', start ? `Talk to ${wl('npc', start.slug, start.name)}` : '—'], ['Requirements', reqs.join(', ') || 'None'], ['Items required', items.map(i => wl('item', i.slug, i.name)).join(', ') || 'None'], ['Quest points', q.questPoints === null ? '—' : String(q.questPoints)], ['Progress varp', q.varp]],
    sections: [section('Walkthrough', walkthrough, derived, true), section('Rewards', rewards, derived, true), section('Required for completing', requiredFor, derived), section('Trivia', '', q.sources)],
    sources: q.sources };
}
