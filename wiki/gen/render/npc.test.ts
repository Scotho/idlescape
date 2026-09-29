import { describe, expect, test } from 'bun:test';
import { renderNpc } from './npc';
import { buildContext } from './context';
import { data, goblin } from './fixture';
import type { NpcEntity } from '../types';

describe('renderNpc', () => {
  const d = renderNpc(goblin, buildContext(data));
  test('monster lead and infobox', () => {
    expect(d.lead).toMatch(/^The \*\*Goblin\*\* is a level 2 monster/);
    expect(d.infobox).toContainEqual(['Combat level', '2']);
    expect(d.infobox).toContainEqual(['Hitpoints', '5']);
  });
  test('drops table with rate and quantity, location section from spawns', () => {
    const drops = d.sections.find(s => s.heading === 'Drops')!;
    expect(drops.body).toContain('| [[item/bronze-axe|Bronze axe]] | 1 | 3/128');
    expect(d.sections.find(s => s.heading === 'Location')!.required).toBe(true);
  });
  test('lead does not quote second-person examine text (game text stays in the infobox only)', () => {
    const secondPerson: NpcEntity = { ...goblin, examine: 'You get a sense of dread from this goblin.' };
    const rd = renderNpc(secondPerson, buildContext(data));
    expect(rd.lead).not.toMatch(/\b(you|your)\b/i);
    expect(rd.infobox).toContainEqual(['Examine', 'You get a sense of dread from this goblin.']);
  });
});
