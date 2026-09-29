import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extractNpcs, npcCombatLevel } from './npcs';
import { parsePackIds } from './parse/packIds';

const fx = (f: string) => readFileSync(path.join(import.meta.dir, 'fixtures', f), 'utf8');

describe('npcCombatLevel', () => {
  test('uses the player formula on npc stats (engine Player.getCombatLevel)', () => {
    expect(npcCombatLevel({ hitpoints: 10, attack: 1, strength: 1, defence: 1, ranged: 1, magic: 1 })).toBe(3);
    expect(npcCombatLevel({ hitpoints: 42, attack: 35, strength: 38, defence: 40, ranged: 1, magic: 1 })).toBe(44);
  });
});

describe('extractNpcs', () => {
  const npcs = extractNpcs({ npcTexts: [{ file: 'scripts/h/heroes.npc', text: fx('npcs.npc') }], npcPack: parsePackIds(fx('npc.pack')) });
  test('options in slot order, hidden vislevel, stats and computed level', () => {
    const a = npcs.find(n => n.key === 'achietties')!;
    expect(a.options).toEqual(['Talk-to']);
    expect(a.vislevel).toBeNull();
    expect(a.stats).toEqual({ hitpoints: 42, attack: 35, strength: 38, defence: 40, ranged: 1, magic: 1 });
    expect(a.combatLevel).toBe(44);
    const h = npcs.find(n => n.key === 'helemos')!;
    expect(h.options).toEqual(['Talk-to', 'Trade']);
  });
  test('explicit vislevel wins, respawn and params kept, monsters have size default 1', () => {
    const g = npcs.find(n => n.key === 'fixture_goblin')!;
    expect(g.vislevel).toBe(2);
    expect(g.combatLevel).toBe(2);
    expect(g.respawnTicks).toBe(25);
    expect(g.params['death_drop']).toBe('bones');
    expect(g.category).toBe('barbarian');
    expect(npcs.find(n => n.key === 'achietties')!.category).toBeNull();
    expect(g.size).toBe(1);
    expect(g.sources[0]).toEqual({ kind: 'content', ref: 'content:scripts/h/heroes.npc#fixture_goblin' });
  });
});
