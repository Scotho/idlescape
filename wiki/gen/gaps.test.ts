import { describe, expect, test } from 'bun:test';
import { gapsReport } from './gaps';

describe('gapsReport', () => {
  test('lists quests without a start npc, monsters without drops, items without examine', () => {
    const md = gapsReport({
      quests: [{ name: 'A', slug: 'a', startNpcKey: null, stages: [{ value: 1 }, { value: 2 }], completeValue: 2, rewards: [] }, { name: 'B', slug: 'b', startNpcKey: 'x', stages: [{ value: 1 }, { value: 5 }], completeValue: 5, rewards: [{ kind: 'xp' }] }],
      npcs: [{ key: 'goblin', name: 'Goblin', stats: { hitpoints: 5 }, slug: 'goblin' }, { key: 'hans', name: 'Hans', stats: null, slug: 'hans' }],
      drops: [],
      items: [{ key: 'worm', name: 'Worm', examine: null, slug: 'worm' }],
      unmatchedCategories: ['_nobody_has_this'],
      membersUnknown: [{ name: 'A', slug: 'a' }]
    });
    expect(md).toContain('## Quests without a start NPC');
    expect(md).toContain('- [[quest/a]]');
    expect(md).not.toContain('- [[quest/b]]');
    expect(md).toContain('## Quests with no rewards extracted');
    expect(md).toContain('## Monsters without a drop table');
    expect(md).toContain('- [[npc/goblin]]');
    expect(md).not.toContain('[[npc/hans]]');
    expect(md).toContain('## Items without an examine');
    expect(md).toContain('- [[item/worm]]');
    expect(md).toContain('## Quests with unknown members status (1)');
    expect(md).toContain('## Category death scripts with no NPC (1)');
    expect(md).toContain('_nobody_has_this');
  });
});
