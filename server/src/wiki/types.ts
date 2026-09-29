export type WikiType = 'item' | 'npc' | 'loc' | 'quest' | 'skill' | 'shop' | 'area' | 'method' | 'mechanic' | 'guide';
export interface PageRow { type: WikiType; slug: string; title: string; lead: string; markdown: string; html: string; sections_json: string }
export interface EntityRow { type: WikiType; id: number; key: string; slug: string; name: string; members: number; json: string }
export interface SearchHit { type: WikiType; slug: string; title: string; snippet: string; score: number }
export interface WikiMeta { revision: string; contentSha: string; engineSha: string; generatedAt: string }

export interface Candidate { type: WikiType; slug: string; title: string; members?: boolean }
export type QueryResult<T> =
  | { ok: true; data: T; sources: string[]; confidence: 'verified' | 'derived' | 'period' | 'modern' | 'editorial' }
  | { ok: false; error: 'not_found' | 'ambiguous' | 'bad_query'; message: string; candidates?: Candidate[] };
export interface Coord { x: number; z: number; level: number }
/** `area` is the area's display name ("Lumbridge"); `areaSlug` is the key the spawn row carries. */
export interface Located { name: string; type: WikiType; slug: string; coord: Coord; area: string | null; areaSlug: string | null; distance?: number; sameLevel?: boolean }
/** One row of `where`: how many spawns sit in an area, and one of them as an example. */
export interface SpawnGroup { area: string | null; areaSlug: string | null; count: number; example: Coord }
export interface ObtainData {
  item: Candidate;
  drops: { npc: Candidate; rate: string; chance: number; quantity: string; condition: string | null }[];
  /** Shared `drop_table` dbrows the item is rolled from. These are tables, not NPCs, so they are
   * never joined into `drops`. */
  tables: { table: string; rate: string; chance: number; quantity: string }[];
  shops: { shop: Candidate; stock: number; coord: Coord | null; area: string | null; areaSlug: string | null }[];
  spawns: Located[];
  methods: { skill: string; level: number; action: string; xp: number }[];
  quests: Candidate[];
}
