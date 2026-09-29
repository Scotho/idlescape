import { describe, expect, test } from 'bun:test';
import { renderItem } from './item';
import { buildContext } from './context';
import { axe, data } from './fixture';
import type { ItemEntity } from '../types';

describe('renderItem', () => {
  const d = renderItem(axe, buildContext(data));
  test('lead bolds the name and states equipability; infobox rows', () => {
    expect(d.lead).toMatch(/^The \*\*Bronze axe\*\* is /);
    expect(d.infobox).toContainEqual(['Members', 'No']);
    expect(d.infobox).toContainEqual(['High alchemy', '9 coins']);
    expect(d.infobox).toContainEqual(['Weight', '1 kg']);
  });
  test('item sources section lists drops with rates, shops, spawns with coordinates and area', () => {
    const src = d.sections.find(s => s.heading === 'Item sources')!;
    expect(src.body).toContain('[[npc/goblin|Goblin]]');
    expect(src.body).toContain('3/128');
    expect(src.body).toContain('[[shop/lumbridge-general-store|Lumbridge General Store]]');
    expect(src.body).toContain('(3230, 3220, 0)');
    expect(src.body).toContain('[[area/lumbridge|Lumbridge]]');
    expect(src.meta.confidence).toBe('derived');
  });
  test('a shared drop table is rolled from, never named as a dropping npc', () => {
    const src = d.sections.find(s => s.heading === 'Item sources')!;
    expect(src.body).toContain('- Rolled from the gem rock table: 1/64');
    expect(src.body).not.toContain('Dropped by gem_rock_table');
  });
  test('bonuses and requirements sections for equipment; products section names the method', () => {
    expect(d.sections.find(s => s.heading === 'Bonuses')!.body).toContain('| Slash | 4 |');
    expect(d.sections.find(s => s.heading === 'Requirements')!.body).toContain('1 [[skill/attack|Attack]]');
    expect(d.sections.find(s => s.heading === 'Products')!.body).toContain('Chop normal tree');
  });
  test('lead picks the article from the word that follows it', () => {
    expect(renderItem(axe, buildContext(data)).lead).toContain('is a piece of equipment');
    const stackable: ItemEntity = { ...axe, wearpos: null, stackable: true };
    expect(renderItem(stackable, buildContext(data)).lead).toContain('is a stackable item');
    const plain: ItemEntity = { ...axe, wearpos: null, stackable: false };
    expect(renderItem(plain, buildContext(data)).lead).toContain('is an item');
    const members: ItemEntity = { ...axe, wearpos: null, stackable: false, members: true };
    expect(renderItem(members, buildContext(data)).lead).toContain('is a members-only item');
  });
  test('lead does not quote second-person examine text (game text stays in the infobox only)', () => {
    const secondPerson: ItemEntity = { ...axe, examine: "You swear you had more than three slices before." };
    const rd = renderItem(secondPerson, buildContext(data));
    expect(rd.lead).not.toMatch(/\b(you|your)\b/i);
    expect(rd.infobox).toContainEqual(['Examine', "You swear you had more than three slices before."]);
  });
});
