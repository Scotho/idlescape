import { describe, expect, test } from 'bun:test';
import { renderSkill } from './skill';
import { buildContext } from './context';
import { data } from './fixture';
import type { LocEntity, Method, SkillEntity } from '../types';

const tree: LocEntity = { type: 'loc', id: 10, key: 'tree', slug: 'tree', name: 'Tree', members: false, aliases: [], sources: [{ kind: 'content', ref: 'content:t.loc#tree' }], examine: null, options: ['Chop down'], width: 1, length: 1, category: null, params: {} };
const woodcutting: SkillEntity = { type: 'skill', id: 0, key: 'woodcutting', slug: 'woodcutting', name: 'Woodcutting', members: false, aliases: [], sources: [{ kind: 'content', ref: 'content:s.skill#woodcutting' }], index: 8, unlocks: [] };
const chopNormal: Method = { skill: 'woodcutting', level: 1, xp: 25, action: 'Chop normal tree', inputs: ['bronze_axe', 'tree'], outputs: ['logs'], table: 'woodcutting_trees', row: 'normal_tree_table', sources: [{ kind: 'content', ref: 'content:t.dbrow#normal_tree_table' }] };

describe('renderSkill', () => {
  const d = renderSkill(woodcutting, buildContext({ ...data, skills: [woodcutting], locs: [tree], methods: [chopNormal] }));
  test('training table links item inputs but collapses loc inputs to a count', () => {
    const training = d.sections.find(s => s.heading === 'Training')!;
    expect(training.body).toContain('[[item/bronze-axe|Bronze axe]]');
    expect(training.body).not.toContain('[[loc/tree|Tree]]');
    expect(training.body).toMatch(/\[\[item\/bronze-axe\|Bronze axe\]\], 1 scenery/);
  });
  test('lead states members status and level 99 xp', () => {
    expect(d.lead).toMatch(/^\*\*Woodcutting\*\* is a free-to-play skill\./);
  });
});
