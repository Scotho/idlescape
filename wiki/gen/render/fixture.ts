import type { ExtractedData, ItemEntity, NpcEntity } from '../types';

export const manifest = { revision: 274, contentSha: 'c', engineSha: 'e', generatedAt: '2026-09-05', counts: {} };
export const axe: ItemEntity = { type: 'item', id: 1, key: 'bronze_axe', slug: 'bronze-axe', name: 'Bronze axe', members: false, aliases: ['bronze axe'], sources: [{ kind: 'content', ref: 'content:a.obj#bronze_axe' }],
  examine: 'A woodcutters axe.', cost: 16, weightG: 1000, stackable: false, tradeable: true, wearpos: 'righthand', category: null,
  bonuses: { stabAttack: -2, slashAttack: 4, crushAttack: 2, magicAttack: 0, rangeAttack: 0, stabDefence: 0, slashDefence: 1, crushDefence: 0, magicDefence: 0, rangeDefence: 0, strength: 5, prayer: 0, attackRate: 5 },
  levelRequire: [{ skill: 'attack', level: 1 }], highAlch: 9, lowAlch: 6, params: {} };
export const goblin: NpcEntity = { type: 'npc', id: 2, key: 'goblin', slug: 'goblin', name: 'Goblin', members: false, aliases: [], sources: [{ kind: 'content', ref: 'content:g.npc#goblin' }], examine: null, options: ['Attack'], size: 1, vislevel: 2, stats: { hitpoints: 5, attack: 1, strength: 1, defence: 1, ranged: 1, magic: 1 }, combatLevel: 2, respawnTicks: 25, category: null, params: {} };
export const data: ExtractedData = { items: [axe], npcs: [goblin], locs: [], areas: [{ type: 'area', id: 0, key: 'lumbridge', slug: 'lumbridge', name: 'Lumbridge', members: false, aliases: [], sources: [{ kind: 'content', ref: 'content:maps/labels.txt#Lumbridge' }], coord: { x: 3222, z: 3218, level: 0 }, size: 1, multiway: false }],
  spawns: [
    { kind: 'obj', id: 1, key: 'bronze_axe', coord: { x: 3230, z: 3220, level: 0 }, count: 1, area: 'lumbridge', file: 'maps/m50_50.jm2' },
    { kind: 'npc', id: 2, key: 'goblin', coord: { x: 3245, z: 3240, level: 0 }, count: 3, area: 'lumbridge', file: 'maps/m50_50.jm2' }
  ],
  shops: [{ type: 'shop', id: 0, key: 'generalshop', slug: 'lumbridge-general-store', name: 'Lumbridge General Store', members: false, aliases: [], sources: [{ kind: 'content', ref: 'content:l.inv#generalshop' }], ownerNpcKeys: [], stock: [{ itemKey: 'bronze_axe', count: 10, restockTicks: 100 }], buysAll: true, restocks: true, coords: [{ x: 3212, z: 3247, level: 0 }] }],
  skills: [], methods: [{ skill: 'woodcutting', level: 1, xp: 25, action: 'Chop normal tree', inputs: ['bronze_axe'], outputs: ['logs'], table: 'woodcutting_trees', row: 'normal_tree_table', sources: [{ kind: 'content', ref: 'content:t.dbrow#normal_tree_table' }] }],
  drops: [
    { npcKey: 'goblin', subjectKind: 'npc', itemKey: 'bronze_axe', min: 1, max: 1, num: 3, den: 128, condition: null, table: 'main', sources: [{ kind: 'derived', ref: 'derived:drops.ts:main' }] },
    { npcKey: 'gem_rock_table', subjectKind: 'table', itemKey: 'bronze_axe', min: 1, max: 1, num: 2, den: 128, condition: null, table: 'gem_rock_table', sources: [{ kind: 'content', ref: 'content:g.dbrow#gem_rock_table' }] }
  ],
  quests: [], manifest };
