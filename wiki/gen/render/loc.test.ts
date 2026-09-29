import { describe, expect, test } from 'bun:test';
import { renderLoc } from './loc';
import { buildContext } from './context';
import { data } from './fixture';
import type { LocEntity } from '../types';

const tree: LocEntity = { type: 'loc', id: 10, key: 'tree', slug: 'tree', name: 'Tree', members: false, aliases: [], sources: [{ kind: 'content', ref: 'content:t.loc#tree' }], examine: null, options: ['Chop down'], width: 1, length: 1, category: null, params: {} };

describe('renderLoc', () => {
  test('lead bolds the name and lists options; infobox carries the examine text', () => {
    const d = renderLoc(tree, buildContext(data));
    expect(d.lead).toMatch(/^The \*\*Tree\*\* is a piece of scenery with the option "Chop down"\./);
    expect(d.infobox).toContainEqual(['Examine', '—']);
  });
  test('lead does not quote second-person examine text (game text stays in the infobox only)', () => {
    const secondPerson: LocEntity = { ...tree, examine: "You'll need an axe to chop this down." };
    const d = renderLoc(secondPerson, buildContext(data));
    expect(d.lead).not.toMatch(/\b(you|your)\b/i);
    expect(d.infobox).toContainEqual(['Examine', "You'll need an axe to chop this down."]);
  });
});
