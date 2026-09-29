import { describe, expect, test } from 'bun:test';
import { renderQuest } from './quest';
import { buildContext } from './context';
import { assemble } from './page';
import { data, manifest } from './fixture';
import { lintPages } from '../lint';
import type { QuestEntity } from '../types';

const cook: QuestEntity = { type: 'quest', id: 0, key: 'quest_cook', slug: 'cooks-assistant', name: "Cook's Assistant", members: false, aliases: [], sources: [{ kind: 'content', ref: 'content:scripts/quests/quest_cook' }],
  folder: 'quest_cook', varp: 'cookquest', completeValue: 2, questPoints: 1, startNpcKey: 'goblin',
  stages: [{ value: 1, label: 'cooks_assistant_whats_wrong', hints: ['I need milk, an egg and flour.'] }, { value: 2, label: 'cooks_quest_complete', hints: [] }],
  requirements: [], itemsChecked: ['bronze_axe'], rewards: [{ kind: 'xp', key: 'cooking', amount: 300 }, { kind: 'questpoints', key: 'questpoints', amount: 1 }] };

describe('renderQuest', () => {
  const d = renderQuest(cook, buildContext({ ...data, quests: [cook] }));
  test('lead, infobox start point and quest points', () => {
    expect(d.lead).toMatch(/^\*\*Cook's Assistant\*\* is a free-to-play quest/);
    expect(d.infobox).toContainEqual(['Start point', 'Talk to [[npc/goblin|Goblin]]']);
    expect(d.infobox).toContainEqual(['Quest points', '1']);
    expect(d.infobox).toContainEqual(['Items required', '[[item/bronze-axe|Bronze axe]]']);
  });
  test('walkthrough numbered by stage with hints; rewards listed', () => {
    const w = d.sections.find(s => s.heading === 'Walkthrough')!;
    expect(w.body).toContain('1. Stage 1');
    expect(w.body).toContain('I need milk, an egg and flour.');
    expect(w.meta.confidence).toBe('derived');
    expect(d.sections.find(s => s.heading === 'Rewards')!.body).toContain('300 xp');
  });
  test('infobox wikilinks survive assembly intact, not backslash-escaped', () => {
    const page = assemble(d, manifest);
    expect(page.markdown).toContain('| **Start point** | Talk to [Goblin](/wiki/npc/goblin) |');
    const itemsRow = page.markdown.split('\n').find(l => l.includes('Items required'))!;
    expect(itemsRow).toContain('[Bronze axe](/wiki/item/bronze-axe)');
    expect(lintPages([page], [d], []).map(p => p.rule)).not.toContain('unresolved-links');
  });
});
