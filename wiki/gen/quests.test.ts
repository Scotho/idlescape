import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { extractQuests, parseConstants } from './quests';
import { parseRs2 } from './parse/rs2';
import type { Coord, Spawn } from './types';

const FX = path.join(import.meta.dir, 'fixtures');
const read = (p: string) => readFileSync(path.join(FX, p), 'utf8');
function folderFiles(folder: string) {
  const files: { file: string; text: string }[] = [];
  for (const f of readdirSync(path.join(FX, folder), { recursive: true }) as string[]) {
    if (/\.(rs2|varp)$/.test(f)) files.push({ file: `scripts/quests/${folder}/${f.replace(/\\/g, '/')}`, text: read(path.join(folder, f)) });
  }
  return files;
}

describe('quests', () => {
  const constants = parseConstants([read('quest.constant')]);
  const folder = folderFiles('quest_cook');
  const allBlocks = [...folder.flatMap(f => f.file.endsWith('.rs2') ? parseRs2(f.text, f.file) : []), ...parseRs2(read('cook_npc.rs2'), 'scripts/areas/area_lumbridge/scripts/cook.rs2')];
  const at = (x: number, z: number) => ({ kind: 'npc' as const, id: 1, key: 'cook', coord: { x, z, level: 0 }, count: 1, area: null, file: 'maps/m50_50.jm2' });
  const freeSpawns = new Map([['cook', [at(3209, 3215), at(3210, 3215)]]]);
  const [q] = extractQuests({ questFolders: [{ folder: 'quest_cook', files: folder }], allBlocks, constants, questNames: new Map([['quest_cook', "Cook's Assistant"]]), npcKeys: new Set(['cook']), npcSpawns: freeSpawns, isFree: () => true });
  test('constants parse', () => { expect(constants.get('cook_complete')).toBe(2); });
  test('identity, varp, completion value and start npc', () => {
    expect(q!.name).toBe("Cook's Assistant");
    expect(q!.slug).toBe('cooks-assistant');
    expect(q!.varp).toBe('cookquest');
    expect(q!.completeValue).toBe(2);
    expect(q!.startNpcKey).toBe('cook');
  });
  test('stages in numeric order with the label that sets them and dialogue hints', () => {
    expect(q!.stages.map(s => s.value)).toEqual([1, 2]);
    expect(q!.stages[0]!.label).toBe('cooks_assistant_whats_wrong');
    expect(q!.stages[0]!.hints.join(' ')).toContain('I need milk, an egg and flour.');
  });
  test('items checked, rewards from the completion block', () => {
    expect([...q!.itemsChecked].sort()).toEqual(['bucket_milk', 'egg', 'pot_flour']);
    expect(q!.rewards).toContainEqual({ kind: 'xp', key: 'cooking', amount: 300 });
    expect(q!.rewards).toContainEqual({ kind: 'questpoints', key: 'questpoints', amount: 1 });
    expect(q!.questPoints).toBe(1);
  });

  test('members follows the start npc: free while any spawn is in a free zone, members when none is', () => {
    expect(q!.members).toBe(false);
    const run = (isFree: (c: Coord) => boolean, npcSpawns: Map<string, Spawn[]>) =>
      extractQuests({ questFolders: [{ folder: 'quest_cook', files: folder }], allBlocks, constants, questNames: new Map([['quest_cook', "Cook's Assistant"]]), npcKeys: new Set(['cook']), npcSpawns, isFree })[0]!;
    expect(run(() => false, freeSpawns).members).toBe(true);
    expect(run(c => c.x === 3209, freeSpawns).members).toBe(false);
    // No spawns for the start npc: nothing to derive from, so it stays free and lands in gaps.md.
    expect(run(() => false, new Map()).members).toBe(false);
  });

  test('a quest-point gate in the folder becomes a questpoints requirement', () => {
    const gate = { file: 'scripts/quests/quest_cook/scripts/gate.rs2', text: '[opnpc1,guildmaster]\nif (%qp < 32) {\n    ~chatnpc("<p,neutral>Come back with 32 quest points.");\n}\n' };
    const withGate = [...folder, gate];
    const blocks = [...allBlocks, ...parseRs2(gate.text, gate.file)];
    const [gq] = extractQuests({ questFolders: [{ folder: 'quest_cook', files: withGate }], allBlocks: blocks, constants, questNames: new Map([['quest_cook', "Cook's Assistant"]]), npcKeys: new Set(['cook']), npcSpawns: freeSpawns, isFree: () => true });
    expect(gq!.requirements).toContainEqual({ kind: 'questpoints', key: 'questpoints', value: 32 });
  });

  test('start-npc fallback: one level of call-graph through a label the opnpc1 block calls', () => {
    // No opnpc1 block tests `%cookquest = 0` directly - it only calls a label that does.
    const fixtureText = '[opnpc1,fixture_npc]\n@fixture_start;\n\n[label,fixture_start]\nif (%cookquest = 0) {\n    ~chatnpc("<p,neutral>Hello.");\n}\n';
    const fixtureBlocks = parseRs2(fixtureText, 'scripts/areas/area_fixture/scripts/fixture_npc.rs2');
    const allBlocks = [...folder.flatMap(f => f.file.endsWith('.rs2') ? parseRs2(f.text, f.file) : []), ...fixtureBlocks];
    const [fq] = extractQuests({ questFolders: [{ folder: 'quest_cook', files: folder }], allBlocks, constants, questNames: new Map([['quest_cook', "Cook's Assistant"]]), npcKeys: new Set(['fixture_npc']), npcSpawns: new Map(), isFree: () => true });
    expect(fq!.startNpcKey).toBe('fixture_npc');
  });
});
