import { describe, expect, test } from 'bun:test';
import { renderArea } from './area';
import { buildContext } from './context';
import { data, goblin } from './fixture';
import type { Area, NpcEntity, Spawn } from '../types';

const lumbridge = data.areas[0]!;

describe('renderArea', () => {
  test('lists attackable NPCs found in the area as monsters', () => {
    // goblin's options include 'Attack', so area.ts classifies it into the "Monsters" section.
    const d = renderArea(lumbridge, buildContext(data));
    const monsters = d.sections.find(s => s.heading === 'Monsters')!;
    expect(monsters.body).toContain('[[npc/goblin|Goblin]]');
  });
  test('skips NPCs with an empty display name instead of emitting a malformed link', () => {
    // Some NPC configs (e.g. invisible effect entities) have no name, which slugifies to ''.
    const unnamed: NpcEntity = { ...goblin, key: 'willothewisp1', slug: '', name: '', options: [] };
    const spawn: Spawn = { kind: 'npc', id: unnamed.id, key: 'willothewisp1', coord: lumbridge.coord, count: 1, area: lumbridge.slug, file: 'maps/m50_50.jm2' };
    const withUnnamed = { ...data, npcs: [...data.npcs, unnamed], spawns: [...data.spawns, spawn] };
    const d = renderArea(lumbridge as Area, buildContext(withUnnamed));
    const npcSection = d.sections.find(s => s.heading === 'NPCs')!;
    expect(npcSection.body).not.toContain('[[npc/|]]');
    expect(npcSection.body).toBe('');
  });
});
