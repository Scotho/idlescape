export type EntityType = 'item' | 'npc' | 'loc' | 'quest' | 'skill' | 'shop' | 'area' | 'method' | 'mechanic' | 'guide';
export type SourceKind = 'content' | 'engine' | 'derived' | 'cited' | 'period' | 'modern' | 'editorial';
export type Confidence = 'verified' | 'derived' | 'period' | 'modern' | 'editorial';
export interface Source { kind: SourceKind; ref: string; note?: string }
export interface Coord { x: number; z: number; level: number }

export interface EntityBase {
  type: EntityType; id: number; key: string; slug: string; name: string;
  members: boolean; aliases: string[]; sources: Source[];
}
export interface Bonuses {
  stabAttack: number; slashAttack: number; crushAttack: number; magicAttack: number; rangeAttack: number;
  stabDefence: number; slashDefence: number; crushDefence: number; magicDefence: number; rangeDefence: number;
  strength: number; prayer: number; attackRate: number | null;
}
export interface ItemEntity extends EntityBase {
  type: 'item'; examine: string | null; cost: number; weightG: number; stackable: boolean; tradeable: boolean;
  wearpos: string | null; category: string | null; bonuses: Bonuses | null;
  levelRequire: { skill: string; level: number }[]; highAlch: number; lowAlch: number; params: Record<string, string>;
}
export interface NpcStats { hitpoints: number; attack: number; strength: number; defence: number; ranged: number; magic: number }
export interface NpcEntity extends EntityBase {
  type: 'npc'; examine: string | null; options: string[]; size: number; vislevel: number | null;
  stats: NpcStats | null; combatLevel: number | null; respawnTicks: number | null; category: string | null; params: Record<string, string>;
}
export interface LocEntity extends EntityBase {
  type: 'loc'; examine: string | null; options: string[]; width: number; length: number; category: string | null; params: Record<string, string>;
}
export interface Spawn { kind: 'npc' | 'obj' | 'loc'; id: number; key: string; coord: Coord; count: number; area: string | null; file: string }
export interface Area extends EntityBase { type: 'area'; coord: Coord; size: number; multiway: boolean }
export interface ShopStock { itemKey: string; count: number; restockTicks: number | null }
export interface ShopEntity extends EntityBase { type: 'shop'; ownerNpcKeys: string[]; stock: ShopStock[]; buysAll: boolean; restocks: boolean; coords: Coord[] }
export interface Method { skill: string; level: number; xp: number; action: string; inputs: string[]; outputs: string[]; table: string; row: string; sources: Source[] }
/** `subjectKind` says what `npcKey` names: an NPC key, or a shared drop-table row (`drop_table`
 * dbrows such as `gem_rock_table`, which are rolled from rather than killed). */
export interface Drop { npcKey: string; subjectKind: 'npc' | 'table'; itemKey: string; min: number; max: number; num: number; den: number; condition: 'members' | null; table: string; sources: Source[] }
export interface Requirement { kind: 'skill' | 'quest' | 'item' | 'questpoints'; key: string; value: number }
export interface QuestStage { value: number; label: string; hints: string[] }
export interface QuestReward { kind: 'xp' | 'item' | 'questpoints'; key: string; amount: number }
export interface QuestEntity extends EntityBase {
  type: 'quest'; folder: string; varp: string; completeValue: number; questPoints: number | null; startNpcKey: string | null;
  stages: QuestStage[]; requirements: Requirement[]; itemsChecked: string[]; rewards: QuestReward[];
}
export interface SkillEntity extends EntityBase { type: 'skill'; index: number; unlocks: number[] }
export type Entity = ItemEntity | NpcEntity | LocEntity | Area | ShopEntity | QuestEntity | SkillEntity;

export interface SectionMeta { confidence: Confidence; sources: Source[] }
export interface Page {
  type: EntityType; slug: string; title: string; lead: string; markdown: string; html: string;
  sections: Record<string, SectionMeta>; links: { toType: EntityType; toSlug: string; relation: string }[];
}
export interface Manifest { revision: number; contentSha: string; engineSha: string; generatedAt: string; counts: Record<string, number> }

export interface ExtractedData {
  items: ItemEntity[]; npcs: NpcEntity[]; locs: LocEntity[]; areas: Area[]; spawns: Spawn[]; shops: ShopEntity[];
  skills: SkillEntity[]; methods: Method[]; drops: Drop[]; quests: QuestEntity[]; manifest: Manifest;
}
