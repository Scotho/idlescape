# SPW Wiki Corpus, Reader Site and Agent Query API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A wiki of the game as it exists on our server, extracted from the pinned Content and Engine clones into a SQLite corpus, served by the front server as a reader site at `/wiki` (linked from the frame title bar) and as a question-shaped query API at `/api/wiki`, with a source on every fact and an OSRS-Wiki-style voice enforced by a lint.

**Architecture:** A new `wiki/` Bun package holds extractors (text configs, RuneScript, map files), renderers (markdown per page type, overlay merge), a lint, and a db builder that writes `wiki/build/wiki.db` (entity tables plus FTS5). The existing front server gains a `wiki` module that opens the db read-only and serves server-rendered HTML pages and markdown-first JSON API routes. The web shell gains a "Wiki" link opening `/wiki` in a new tab. Hand-authored overlays live in `wiki/content/**.md` and merge by section at build time.

**Tech Stack:** Bun 1.4 (`bun:sqlite` with FTS5, verified working on this machine), TypeScript strict, `marked` for markdown to HTML, `bun test` in `wiki/` and `server/`, Vitest in `web/`, Playwright e2e in `web/e2e/`.

**Spec:** `docs/superpowers/specs/2026-09-05-spw-wiki-corpus-design.md`

## Global Constraints

- Content and Engine under `engine/` are upstream clones pinned in `scripts/upstream.lock`; no file inside them is edited or written by any task. Extractors read them only.
- Plan decision (deviation from spec section 4 last rows, recorded here): extractors parse the **text configs and scripts** in `engine/content` as the primary source, not the packed binaries through the engine's parsers. Reason: the engine parsers import through `#/` path aliases bound to the engine package and pull in `Environment` and logging, and the packed cache drops symbolic keys and the `// https://` provenance comments we need. Field defaults are taken from the `.param` definitions and from the engine's `ObjType`/`NpcType` defaults quoted in the tasks, each with an `engine:` source.
- Revision is `225` until SP1b lands; `manifest.json` records the Content and Engine shas read from `scripts/upstream.lock`.
- Source kinds: `content`, `engine`, `derived`, `cited`, `period`, `modern`, `editorial`. Confidence order: `verified` > `derived` > `period` > `modern` > `editorial`.
- No text or data is copied from the OSRS Wiki, LostHQ, RuneHQ or archives. They may be cited in overlays only.
- Coordinates are absolute `(x, z, level)`; packed `level_mx_mz_lx_lz` converts as `x = mx*64 + lx`, `z = mz*64 + lz`.
- `/wiki/*` requires the gate cookie. `/api/wiki/*` accepts the gate cookie or an agent bearer token through an injected verifier; until Task 13b of the SP1 plan lands, the verifier accepts nothing and the API is cookie-only.
- TypeScript strict everywhere; no new `as any`; files under 400 lines; conventional commits; `types.ts` per package.
- Bun lives at `%USERPROFILE%\.bun\bin\bun.exe` (`~/.bun/bin/bun` in Git Bash). Run `bun` commands from the package directory named in each step.
- Commits carry the trailer lines the session requires (`Co-Authored-By` and `Claude-Session`); commands below omit them for brevity but implementers must include them.
- Item and NPC sprite rendering (spec 8.1 `/wiki/sprites/*`) is **not in this plan**. It needs the client's `ObjType` icon renderer driven headlessly and is a follow-up plan once Task 14's client host is stable. The reader renders without images; the route is reserved.

## File Structure

```
wiki/
  package.json                 bun; scripts: extract, build, lint, test, typecheck
  tsconfig.json
  gen/
    types.ts                   Entity shapes, Source, Confidence, Coord, Page
    paths.ts                   resolves engine/content, engine/server, upstream.lock
    parse/configText.ts        [block] key=value parser with comments and URL citations
    parse/packIds.ts           pack/*.pack "id=key" maps
    parse/rs2.ts               RuneScript block splitter: [trigger,subject] bodies
    parse/dbrows.ts            .dbtable column defs + .dbrow typed rows
    parse/jm2.ts               map file NPC/OBJ/LOC sections to absolute coords
    slug.ts                    slugify, dedupe, aliases
    items.ts                   ItemEntity[] from .obj + params
    npcs.ts                    NpcEntity[] from .npc
    locs.ts                    LocEntity[] from .loc
    maps.ts                    Spawn[] from jm2 files
    areas.ts                   Area[] from labels.txt, free2play.csv; nearestArea
    shops.ts                   ShopEntity[] from .inv + owner NPC resolution
    skills.ts                  SkillEntity[], xp table, Method[] from dbrows
    drops.ts                   Drop[] from ai_queue3 random chains and drop_table rows
    quests.ts                  QuestEntity[] from quest folders
    questNames.ts              folder -> display name table (from quest.enum)
    extract.ts                 orchestrator: writes data/<rev>/*.json, manifest.json, gaps.md
    render/infobox.ts          infobox markdown table builder
    render/item.ts render/npc.ts render/loc.ts render/quest.ts render/skill.ts render/shop.ts render/area.ts
    render/overlay.ts          frontmatter parse + section merge + dispute rule
    render/index.ts            renderAll(data, overlays) -> Page[]
    lint.ts                    style, sources, links, required sections
    db.ts                      schema + insert + FTS
    build.ts                   orchestrator: render -> lint -> db -> report.md
    fixtures/                  copied pack fragments used by tests (small)
    *.test.ts                  bun tests beside each module
  content/                     overlays: quests/, mechanics/, items/, npcs/, areas/, guides/
  data/225/                    committed extractor output (json) + gaps.md + manifest.json
  build/                       git-ignored: wiki.db, report.md
  STYLE.md
  AUTHORING.md
server/src/wiki/
  types.ts                     WikiDeps, query result shapes
  db.ts                        openWikiDb(path) read-only + typed query helpers
  auth.ts                      cookie-or-bearer check with injected verifier
  layout.ts                    HTML shell for reader pages
  reader.ts                    /wiki routes: front, search, page, index, random, 404
  queries.ts                   q/* implementations over db
  format.ts                    markdown and json response builders
  schema.md                    API documentation served at /api/wiki/schema
  routes.ts                    dispatch for 'wiki' and 'wikiApi' route kinds
  *.test.ts
server/src/router.ts           + 'wiki' | 'wikiApi' kinds
server/src/index.ts            + wiki wiring
server/src/health.ts, types.ts + wiki: 'up' | 'missing'
server/src/env.ts              + WIKI_DB
web/src/partials/frame.html    + Wiki link
web/src/partials/signin.html   + Wiki link
web/src/styles/frame.css       + .title-link
web/src/partials.test.ts       asserts links
web/e2e/wiki.pw.test.ts        title bar link opens /wiki; search lands on Bronze axe
package.json (root)            + wiki:extract, wiki:build
.gitignore                     + wiki/build/
README.md, CREDITS.md          sections
```

---

### Task 1: `wiki/` package, types, config text parser, pack id maps

**Files:**
- Create: `wiki/package.json`, `wiki/tsconfig.json`, `wiki/gen/types.ts`, `wiki/gen/paths.ts`, `wiki/gen/parse/configText.ts`, `wiki/gen/parse/packIds.ts`, `wiki/gen/slug.ts`
- Test: `wiki/gen/parse/configText.test.ts`, `wiki/gen/parse/packIds.test.ts`, `wiki/gen/slug.test.ts`
- Modify: `.gitignore` (add `wiki/build/`)

**Interfaces:**
- Produces: `parseConfigText(text, file): ConfigBlock[]` where `ConfigBlock = { key: string; file: string; line: number; fields: Map<string, string[]>; citations: string[] }`; `loadPackIds(packDir, kind): { byKey: Map<string, number>; byId: Map<number, string> }`; `slugify(name): string`; `dedupeSlugs(entities)`; the entity types below used by every later task.

- [ ] **Step 1: Scaffold the package**

`wiki/package.json`:

```json
{
  "name": "@idlescape/wiki",
  "private": true,
  "type": "module",
  "scripts": {
    "extract": "bun run gen/extract.ts",
    "build": "bun run gen/build.ts",
    "lint": "bun run gen/build.ts --lint-only",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "marked": "^15.0.0" },
  "devDependencies": { "@types/bun": "latest", "typescript": "^5.9.0" }
}
```

`wiki/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext", "module": "ESNext", "moduleResolution": "bundler",
    "strict": true, "noUncheckedIndexedAccess": true, "noEmit": true,
    "types": ["bun-types"], "skipLibCheck": true
  },
  "include": ["gen/**/*.ts"]
}
```

Append `wiki/build/` to `.gitignore` under the `# packages` block. Run `cd wiki && ~/.bun/bin/bun install`.

- [ ] **Step 2: Write `wiki/gen/types.ts`**

```ts
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
  stats: NpcStats | null; combatLevel: number | null; respawnTicks: number | null; params: Record<string, string>;
}
export interface LocEntity extends EntityBase {
  type: 'loc'; examine: string | null; options: string[]; width: number; length: number; category: string | null; params: Record<string, string>;
}
export interface Spawn { kind: 'npc' | 'obj' | 'loc'; id: number; key: string; coord: Coord; count: number; area: string | null; file: string }
export interface Area extends EntityBase { type: 'area'; coord: Coord; size: number; multiway: boolean }
export interface ShopStock { itemKey: string; count: number; restockTicks: number | null }
export interface ShopEntity extends EntityBase { type: 'shop'; ownerNpcKeys: string[]; stock: ShopStock[]; buysAll: boolean; restocks: boolean; coords: Coord[] }
export interface Method { skill: string; level: number; xp: number; action: string; inputs: string[]; outputs: string[]; table: string; row: string; sources: Source[] }
export interface Drop { npcKey: string; itemKey: string; min: number; max: number; num: number; den: number; condition: 'members' | null; table: string; sources: Source[] }
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
```

- [ ] **Step 3: Write `wiki/gen/paths.ts`**

```ts
import path from 'node:path';
import { readFileSync } from 'node:fs';

export const ROOT = path.resolve(import.meta.dir, '..', '..');
export const CONTENT = path.join(ROOT, 'engine', 'content');
export const ENGINE = path.join(ROOT, 'engine', 'server');
export const DATA = path.join(ROOT, 'wiki', 'data');
export const BUILD = path.join(ROOT, 'wiki', 'build');
export const OVERLAYS = path.join(ROOT, 'wiki', 'content');

export function upstreamShas(): { contentSha: string; engineSha: string } {
  const lock = readFileSync(path.join(ROOT, 'scripts', 'upstream.lock'), 'utf8');
  const map = new Map(lock.split(/\r?\n/).filter(Boolean).map(l => l.split(' ') as [string, string]));
  return { contentSha: map.get('engine/content') ?? 'unknown', engineSha: map.get('engine/server') ?? 'unknown' };
}
```

- [ ] **Step 4: Write the failing parser test `wiki/gen/parse/configText.test.ts`**

```ts
import { describe, expect, test } from 'bun:test';
import { parseConfigText } from './configText';

const SAMPLE = `[worm]
name=Worm
desc=Ugh! It's wriggling!
cost=0
param=magicattack,10
param=stabdefence,1
weight=3g
// https://example.org/worm
members=yes

[helemos]
name=Helemos
op1=Talk-to // https://youtu.be/abc
op3=Trade
`;

describe('parseConfigText', () => {
  test('splits blocks and keeps multi-valued keys in order', () => {
    const blocks = parseConfigText(SAMPLE, 'x.obj');
    expect(blocks.map(b => b.key)).toEqual(['worm', 'helemos']);
    expect(blocks[0]!.fields.get('name')).toEqual(['Worm']);
    expect(blocks[0]!.fields.get('param')).toEqual(['magicattack,10', 'stabdefence,1']);
    expect(blocks[0]!.line).toBe(1);
  });
  test('keeps a value containing = and apostrophes intact', () => {
    const blocks = parseConfigText('[a]\ndesc=1+1=2 isn\'t it\n', 'y.obj');
    expect(blocks[0]!.fields.get('desc')).toEqual(["1+1=2 isn't it"]);
  });
  test('collects url citations from comment lines and trailing comments', () => {
    const blocks = parseConfigText(SAMPLE, 'x.obj');
    expect(blocks[0]!.citations).toEqual(['https://example.org/worm']);
    expect(blocks[1]!.citations).toEqual(['https://youtu.be/abc']);
    expect(blocks[1]!.fields.get('op1')).toEqual(['Talk-to']);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `cd wiki && ~/.bun/bin/bun test gen/parse/configText.test.ts`
Expected: FAIL, cannot find module `./configText`.

- [ ] **Step 6: Write `wiki/gen/parse/configText.ts`**

```ts
export interface ConfigBlock { key: string; file: string; line: number; fields: Map<string, string[]>; citations: string[] }

const URL_RE = /https?:\/\/[^\s)"']+/g;

export function parseConfigText(text: string, file: string): ConfigBlock[] {
  const blocks: ConfigBlock[] = [];
  let cur: ConfigBlock | null = null;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    const header = /^\[([^\]]+)\]\s*$/.exec(trimmed);
    if (header) {
      cur = { key: header[1]!, file, line: i + 1, fields: new Map(), citations: [] };
      blocks.push(cur);
      continue;
    }
    if (!cur) continue;
    const commentAt = raw.indexOf('//');
    const code = commentAt >= 0 ? raw.slice(0, commentAt) : raw;
    const comment = commentAt >= 0 ? raw.slice(commentAt) : '';
    for (const url of comment.match(URL_RE) ?? []) cur.citations.push(url);
    const eq = code.indexOf('=');
    if (eq <= 0) continue;
    const k = code.slice(0, eq).trim();
    const v = code.slice(eq + 1).trim();
    const list = cur.fields.get(k);
    if (list) list.push(v); else cur.fields.set(k, [v]);
  }
  return blocks;
}

export function first(b: ConfigBlock, key: string): string | null {
  return b.fields.get(key)?.[0] ?? null;
}
export function paramsOf(b: ConfigBlock): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of b.fields.get('param') ?? []) {
    const c = p.indexOf(',');
    if (c > 0) out[p.slice(0, c)] = p.slice(c + 1);
  }
  return out;
}
```

- [ ] **Step 7: Run the parser test to verify it passes**

Run: `cd wiki && ~/.bun/bin/bun test gen/parse/configText.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Write the failing pack id and slug tests**

`wiki/gen/parse/packIds.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { parsePackIds } from './packIds';

describe('parsePackIds', () => {
  test('maps both directions and ignores blank lines', () => {
    const m = parsePackIds('0=hans\n1=man\n\n2=man2\n');
    expect(m.byKey.get('man')).toBe(1);
    expect(m.byId.get(2)).toBe('man2');
    expect(m.byId.size).toBe(3);
  });
});
```

`wiki/gen/slug.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { slugify, dedupeSlugs, aliasesFor } from './slug';

describe('slug', () => {
  test('slugify follows wiki title rules', () => {
    expect(slugify("Cook's Assistant")).toBe('cooks-assistant');
    expect(slugify('Cape of saradomin')).toBe('cape-of-saradomin');
    expect(slugify('Romeo & Juliet')).toBe('romeo-and-juliet');
    expect(slugify('  Gu\'Tanoth ')).toBe('gutanoth');
  });
  test('dedupeSlugs appends -2, -3 in id order', () => {
    const rows = [{ id: 5, name: 'Man', slug: 'man' }, { id: 1, name: 'Man', slug: 'man' }, { id: 7, name: 'Man', slug: 'man' }];
    dedupeSlugs(rows);
    expect(rows.map(r => r.slug)).toEqual(['man-2', 'man', 'man-3']);
  });
  test('aliasesFor includes the symbolic key spaced out', () => {
    expect(aliasesFor('bronze_axe', 'Bronze axe')).toEqual(['bronze axe']);
    expect(aliasesFor('rune_scimitar', 'Rune scimitar')).toEqual(['rune scimitar']);
  });
});
```

- [ ] **Step 9: Run to verify both fail**

Run: `cd wiki && ~/.bun/bin/bun test gen/parse/packIds.test.ts gen/slug.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 10: Write `wiki/gen/parse/packIds.ts` and `wiki/gen/slug.ts`**

```ts
// wiki/gen/parse/packIds.ts
import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface PackIds { byKey: Map<string, number>; byId: Map<number, string> }

export function parsePackIds(text: string): PackIds {
  const byKey = new Map<string, number>();
  const byId = new Map<number, string>();
  for (const line of text.split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const id = Number(line.slice(0, eq));
    const key = line.slice(eq + 1).trim();
    if (!Number.isInteger(id) || !key) continue;
    byKey.set(key, id);
    byId.set(id, key);
  }
  return { byKey, byId };
}

export function loadPackIds(contentDir: string, kind: 'obj' | 'npc' | 'loc' | 'varp' | 'inv' | 'param' | 'seq'): PackIds {
  return parsePackIds(readFileSync(path.join(contentDir, 'pack', `${kind}.pack`), 'utf8'));
}
```

```ts
// wiki/gen/slug.ts
export function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function dedupeSlugs<T extends { id: number; slug: string }>(rows: T[]): void {
  const byId = [...rows].sort((a, b) => a.id - b.id);
  const seen = new Map<string, number>();
  for (const r of byId) {
    const n = (seen.get(r.slug) ?? 0) + 1;
    seen.set(r.slug, n);
    if (n > 1) r.slug = `${r.slug}-${n}`;
  }
}

export function aliasesFor(key: string, name: string): string[] {
  const spaced = key.replace(/_/g, ' ').toLowerCase();
  return spaced === name.toLowerCase() ? [spaced] : [spaced, name.toLowerCase()];
}
```

Note: the third slug test expects `['bronze axe']` for a key that equals the name once spaced; the second alias is added only when they differ.

- [ ] **Step 11: Run all wiki tests and typecheck**

Run: `cd wiki && ~/.bun/bin/bun test && ~/.bun/bin/bun run typecheck`
Expected: PASS; no type errors.

- [ ] **Step 12: Commit**

```bash
git add wiki/package.json wiki/tsconfig.json wiki/bun.lock wiki/gen .gitignore
git commit -m "feat(wiki): package scaffold, entity types, config text parser, pack ids, slugs"
```

---

### Task 2: Items extractor

**Files:**
- Create: `wiki/gen/items.ts`, `wiki/gen/fixtures/items.obj`, `wiki/gen/fixtures/obj.pack`, `wiki/gen/fixtures/params.param`
- Test: `wiki/gen/items.test.ts`

**Interfaces:**
- Consumes: `parseConfigText`, `first`, `paramsOf`, `parsePackIds`, `slugify`, `dedupeSlugs`, `aliasesFor`, `ItemEntity`, `Bonuses`.
- Produces: `extractItems(opts: { objTexts: { file: string; text: string }[]; objPack: PackIds; paramDefaults: Map<string, string> }): ItemEntity[]`; `parseWeight(s): number` (grams); `loadParamDefaults(paramTexts): Map<string, string>`.

- [ ] **Step 1: Create fixtures**

`wiki/gen/fixtures/items.obj` (copied verbatim from `engine/content/scripts/areas/area_gnome/configs/child.obj` block `worm` and `engine/content/scripts/areas/area_mage_arena/configs/mage_arena.obj` block `saradomin_cape`; keep their comment lines). Add a third minimal block for a weapon:

```
[bronze_scimitar_fixture]
name=Bronze scimitar
desc=A vicious, curved sword.
cost=32
weight=1.8kg
wearpos=righthand
iop2=Wield
param=slashattack,7
param=stabattack,1
param=strengthbonus,6
param=attackrate,4
param=levelrequire,1
// https://raw.githubusercontent.com/Joshua-F/osrs-dumps/refs/heads/master/config/dump.obj obj_1321
```

`wiki/gen/fixtures/obj.pack`: `0=worm\n1=saradomin_cape\n2=bronze_scimitar_fixture\n`.

`wiki/gen/fixtures/params.param`:

```
[slashattack]
type=int
default=0
autodisable=yes

[levelrequire]
type=int
default=0

[attackrate]
type=int
default=4
```

- [ ] **Step 2: Write the failing test `wiki/gen/items.test.ts`**

```ts
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extractItems, loadParamDefaults, parseWeight } from './items';
import { parsePackIds } from './parse/packIds';

const fx = (f: string) => readFileSync(path.join(import.meta.dir, 'fixtures', f), 'utf8');

describe('parseWeight', () => {
  test('grams, kilograms, pounds, ounces', () => {
    expect(parseWeight('3g')).toBe(3);
    expect(parseWeight('1.8kg')).toBe(1800);
    expect(parseWeight('1lb')).toBe(453);
    expect(parseWeight('4oz')).toBe(113);
    expect(parseWeight('')).toBe(0);
  });
});

describe('extractItems', () => {
  const items = extractItems({
    objTexts: [{ file: 'scripts/x/items.obj', text: fx('items.obj') }],
    objPack: parsePackIds(fx('obj.pack')),
    paramDefaults: loadParamDefaults([fx('params.param')])
  });
  test('basic fields, members, alch values', () => {
    const worm = items.find(i => i.key === 'worm')!;
    expect(worm.id).toBe(0);
    expect(worm.name).toBe('Worm');
    expect(worm.examine).toBe("Ugh! It's wriggling!");
    expect(worm.members).toBe(true);
    expect(worm.weightG).toBe(3);
    expect(worm.bonuses).toBeNull();
    expect(worm.slug).toBe('worm');
  });
  test('equipable item gets bonuses with param defaults and level requirements', () => {
    const cape = items.find(i => i.key === 'saradomin_cape')!;
    expect(cape.wearpos).toBe('back');
    expect(cape.bonuses).toMatchObject({ magicAttack: 10, stabDefence: 1, crushDefence: 2, magicDefence: 10, slashAttack: 0, attackRate: null });
    expect(cape.tradeable).toBe(false);
    expect(cape.highAlch).toBe(60);
    expect(cape.lowAlch).toBe(40);
    const scim = items.find(i => i.key === 'bronze_scimitar_fixture')!;
    expect(scim.bonuses?.attackRate).toBe(4);
    expect(scim.levelRequire).toEqual([{ skill: 'attack', level: 1 }]);
  });
  test('sources carry the file block and the cited urls', () => {
    const scim = items.find(i => i.key === 'bronze_scimitar_fixture')!;
    expect(scim.sources).toContainEqual({ kind: 'content', ref: 'content:scripts/x/items.obj#bronze_scimitar_fixture' });
    expect(scim.sources.some(s => s.kind === 'cited' && s.ref.includes('osrs-dumps'))).toBe(true);
  });
  test('items missing from the pack are skipped', () => {
    const out = extractItems({ objTexts: [{ file: 'f.obj', text: '[ghost]\nname=Ghost\n' }], objPack: parsePackIds(''), paramDefaults: new Map() });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd wiki && ~/.bun/bin/bun test gen/items.test.ts`
Expected: FAIL, module `./items` not found.

- [ ] **Step 4: Write `wiki/gen/items.ts`**

```ts
import { parseConfigText, first, paramsOf, type ConfigBlock } from './parse/configText';
import type { PackIds } from './parse/packIds';
import { slugify, dedupeSlugs, aliasesFor } from './slug';
import type { Bonuses, ItemEntity, Source } from './types';

const BONUS_PARAMS: [keyof Bonuses, string][] = [
  ['stabAttack', 'stabattack'], ['slashAttack', 'slashattack'], ['crushAttack', 'crushattack'], ['magicAttack', 'magicattack'], ['rangeAttack', 'rangeattack'],
  ['stabDefence', 'stabdefence'], ['slashDefence', 'slashdefence'], ['crushDefence', 'crushdefence'], ['magicDefence', 'magicdefence'], ['rangeDefence', 'rangedefence'],
  ['strength', 'strengthbonus'], ['prayer', 'prayerbonus']
];
const WEAPON_SLOTS = new Set(['righthand', 'lefthand']);
const ENGINE_DEFAULTS: Source = { kind: 'engine', ref: 'engine:src/cache/config/ObjType.ts#defaults', note: 'cost=1, tradeable=true, stackable=false, members=false when absent' };

export function parseWeight(s: string): number {
  const m = /^([0-9]*\.?[0-9]+)\s*(g|kg|lb|oz)$/i.exec(s.trim());
  if (!m) return 0;
  const n = Number(m[1]);
  switch (m[2]!.toLowerCase()) {
    case 'g': return Math.round(n);
    case 'kg': return Math.round(n * 1000);
    case 'lb': return Math.round(n * 453);
    default: return Math.round(n * 28);
  }
}

export function loadParamDefaults(paramTexts: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const text of paramTexts) for (const b of parseConfigText(text, 'param')) {
    const d = first(b, 'default');
    if (d !== null) out.set(b.key, d);
  }
  return out;
}

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bonusesOf(params: Record<string, string>, defaults: Map<string, string>, wearpos: string | null): Bonuses | null {
  if (!wearpos) return null;
  const get = (p: string) => num(params[p] ?? defaults.get(p), 0);
  const b = Object.fromEntries(BONUS_PARAMS.map(([k, p]) => [k, get(p)])) as unknown as Bonuses;
  b.attackRate = WEAPON_SLOTS.has(wearpos) ? num(params['attackrate'] ?? defaults.get('attackrate'), 4) : null;
  return b;
}

function levelRequireOf(params: Record<string, string>, wearpos: string | null): { skill: string; level: number }[] {
  const out: { skill: string; level: number }[] = [];
  const lr = params['levelrequire'];
  if (lr !== undefined && wearpos) {
    // levelrequire is checked against attack for weapons and defence for armour by scripts/levelrequire/scripts/*.rs2
    out.push({ skill: WEAPON_SLOTS.has(wearpos) ? 'attack' : 'defence', level: num(lr, 1) });
  }
  return out;
}

function sourcesOf(b: ConfigBlock): Source[] {
  const s: Source[] = [{ kind: 'content', ref: `content:${b.file}#${b.key}` }, ENGINE_DEFAULTS];
  for (const url of b.citations) s.push({ kind: 'cited', ref: url });
  return s;
}

export function extractItems(opts: { objTexts: { file: string; text: string }[]; objPack: PackIds; paramDefaults: Map<string, string> }): ItemEntity[] {
  const items: ItemEntity[] = [];
  for (const { file, text } of opts.objTexts) {
    for (const b of parseConfigText(text, file)) {
      const id = opts.objPack.byKey.get(b.key);
      if (id === undefined) continue;
      const name = first(b, 'name') ?? b.key;
      const params = paramsOf(b);
      const wearpos = first(b, 'wearpos');
      const cost = num(first(b, 'cost') ?? undefined, 1);
      items.push({
        type: 'item', id, key: b.key, slug: slugify(name), name, members: first(b, 'members') === 'yes',
        aliases: aliasesFor(b.key, name), sources: sourcesOf(b),
        examine: first(b, 'desc'), cost, weightG: parseWeight(first(b, 'weight') ?? ''),
        stackable: first(b, 'stackable') === 'yes', tradeable: first(b, 'tradeable') !== 'no',
        wearpos, category: first(b, 'category'), bonuses: bonusesOf(params, opts.paramDefaults, wearpos),
        levelRequire: levelRequireOf(params, wearpos), highAlch: Math.floor(cost * 0.6), lowAlch: Math.floor(cost * 0.4), params
      });
    }
  }
  dedupeSlugs(items);
  return items;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd wiki && ~/.bun/bin/bun test gen/items.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add wiki/gen/items.ts wiki/gen/items.test.ts wiki/gen/fixtures
git commit -m "feat(wiki): items extractor with bonuses, level requirements, weights and sources"
```

---

### Task 3: NPC and scenery extractors

**Files:**
- Create: `wiki/gen/npcs.ts`, `wiki/gen/locs.ts`, `wiki/gen/fixtures/npcs.npc`, `wiki/gen/fixtures/locs.loc`, `wiki/gen/fixtures/npc.pack`, `wiki/gen/fixtures/loc.pack`
- Test: `wiki/gen/npcs.test.ts`, `wiki/gen/locs.test.ts`

**Interfaces:**
- Produces: `extractNpcs({ npcTexts, npcPack }): NpcEntity[]`; `npcCombatLevel(stats: NpcStats): number`; `extractLocs({ locTexts, locPack }): LocEntity[]`; `optionsOf(block, prefix: 'op'): string[]` exported from `npcs.ts` for reuse.

- [ ] **Step 1: Create fixtures**

`wiki/gen/fixtures/npcs.npc`: copy the `achietties` and `helemos` blocks verbatim from `engine/content/scripts/areas/areas_heroes_guild/configs/heroes_guild.npc` (they include `vislevel=hide`, stats, params and an osrs-dumps citation). Add:

```
[fixture_goblin]
name=Goblin
desc=An ugly green creature.
size=1
vislevel=2
op2=Attack
hitpoints=5
attack=1
strength=1
defence=1
respawnrate=25
param=death_drop,bones
```

`wiki/gen/fixtures/npc.pack`: `0=achietties\n1=helemos\n2=fixture_goblin\n`.

`wiki/gen/fixtures/locs.loc`: copy the `border_gate_toll_left` block from `engine/content/scripts/areas/area_alkharid/configs/border_gate.loc` and add:

```
[fixture_anvil]
name=Anvil
desc=Used for smithing.
op1=Smith
width=1
length=1
```

`wiki/gen/fixtures/loc.pack`: `0=border_gate_toll_left\n1=fixture_anvil\n`.

- [ ] **Step 2: Write the failing tests**

`wiki/gen/npcs.test.ts`:

```ts
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
    expect(g.size).toBe(1);
    expect(g.sources[0]).toEqual({ kind: 'content', ref: 'content:scripts/h/heroes.npc#fixture_goblin' });
  });
});
```

`wiki/gen/locs.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extractLocs } from './locs';
import { parsePackIds } from './parse/packIds';

const fx = (f: string) => readFileSync(path.join(import.meta.dir, 'fixtures', f), 'utf8');

describe('extractLocs', () => {
  const locs = extractLocs({ locTexts: [{ file: 'scripts/a/gate.loc', text: fx('locs.loc') }], locPack: parsePackIds(fx('loc.pack')) });
  test('gate keeps options, examine, category and next stage param', () => {
    const g = locs.find(l => l.key === 'border_gate_toll_left')!;
    expect(g.name).toBe('Gate');
    expect(g.options).toEqual(['Open']);
    expect(g.category).toBe('border_gate_toll_left');
    expect(g.params['next_loc_stage']).toBe('loc_1562');
    expect(g.width).toBe(1);
  });
  test('duplicate names get numbered slugs by id', () => {
    const two = extractLocs({ locTexts: [{ file: 'f.loc', text: '[a]\nname=Tree\n[b]\nname=Tree\n' }], locPack: parsePackIds('0=a\n1=b\n') });
    expect(two.map(l => l.slug)).toEqual(['tree', 'tree-2']);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd wiki && ~/.bun/bin/bun test gen/npcs.test.ts gen/locs.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Write `wiki/gen/npcs.ts`**

```ts
import { parseConfigText, first, paramsOf, type ConfigBlock } from './parse/configText';
import type { PackIds } from './parse/packIds';
import { slugify, dedupeSlugs, aliasesFor } from './slug';
import type { NpcEntity, NpcStats, Source } from './types';

export function optionsOf(b: ConfigBlock, prefix: 'op' | 'iop'): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const v = first(b, `${prefix}${i}`);
    if (v) out.push(v);
  }
  return out;
}

/** Same formula as engine/server/src/engine/entity/Player.ts getCombatLevel, applied to NPC stats. */
export function npcCombatLevel(s: NpcStats): number {
  const base = 0.25 * (s.defence + s.hitpoints + 0); // NPC configs carry no prayer stat, so the prayer term is 0
  const melee = 0.325 * (s.attack + s.strength);
  const range = 0.325 * (Math.floor(s.ranged / 2) + s.ranged);
  const magic = 0.325 * (Math.floor(s.magic / 2) + s.magic);
  return Math.floor(base + Math.max(melee, range, magic));
}

function stat(b: ConfigBlock, k: string): number { const v = first(b, k); return v === null ? 1 : Number(v); }

function sourcesOf(b: ConfigBlock): Source[] {
  const s: Source[] = [
    { kind: 'content', ref: `content:${b.file}#${b.key}` },
    { kind: 'engine', ref: 'engine:src/cache/config/NpcType.ts#defaults', note: 'size=1, stats=1, vislevel=-1 when absent' }
  ];
  for (const url of b.citations) s.push({ kind: 'cited', ref: url });
  return s;
}

export function extractNpcs(opts: { npcTexts: { file: string; text: string }[]; npcPack: PackIds }): NpcEntity[] {
  const npcs: NpcEntity[] = [];
  for (const { file, text } of opts.npcTexts) {
    for (const b of parseConfigText(text, file)) {
      const id = opts.npcPack.byKey.get(b.key);
      if (id === undefined) continue;
      const name = first(b, 'name') ?? b.key;
      const hasStats = b.fields.has('hitpoints') || b.fields.has('attack') || b.fields.has('defence');
      const stats: NpcStats | null = hasStats
        ? { hitpoints: stat(b, 'hitpoints'), attack: stat(b, 'attack'), strength: stat(b, 'strength'), defence: stat(b, 'defence'), ranged: stat(b, 'ranged'), magic: stat(b, 'magic') }
        : null;
      const vis = first(b, 'vislevel');
      const vislevel = vis === null || vis === 'hide' ? null : Number(vis);
      const derivedLevel = stats ? npcCombatLevel(stats) : null;
      const sources = sourcesOf(b);
      if (vislevel === null && derivedLevel !== null) sources.push({ kind: 'derived', ref: 'derived:npcs.ts:npcCombatLevel', note: 'combat level computed from config stats' });
      npcs.push({
        type: 'npc', id, key: b.key, slug: slugify(name), name, members: first(b, 'members') === 'yes',
        aliases: aliasesFor(b.key, name), sources,
        examine: first(b, 'desc'), options: optionsOf(b, 'op'), size: Number(first(b, 'size') ?? 1),
        vislevel, stats, combatLevel: vislevel ?? derivedLevel,
        respawnTicks: first(b, 'respawnrate') === null ? null : Number(first(b, 'respawnrate')), params: paramsOf(b)
      });
    }
  }
  dedupeSlugs(npcs);
  return npcs;
}
```

Check the expected value in the test: for `achietties`, base = 0.25 × (40 + 42 + 0) = 20.5; melee = 0.325 × 73 = 23.725; total 44.225 → 44. For the goblin, vislevel 2 wins.

- [ ] **Step 5: Write `wiki/gen/locs.ts`**

```ts
import { parseConfigText, first, paramsOf } from './parse/configText';
import type { PackIds } from './parse/packIds';
import { optionsOf } from './npcs';
import { slugify, dedupeSlugs, aliasesFor } from './slug';
import type { LocEntity, Source } from './types';

export function extractLocs(opts: { locTexts: { file: string; text: string }[]; locPack: PackIds }): LocEntity[] {
  const locs: LocEntity[] = [];
  for (const { file, text } of opts.locTexts) {
    for (const b of parseConfigText(text, file)) {
      const id = opts.locPack.byKey.get(b.key);
      if (id === undefined) continue;
      const name = first(b, 'name') ?? b.key;
      const sources: Source[] = [{ kind: 'content', ref: `content:${b.file}#${b.key}` }, ...b.citations.map(u => ({ kind: 'cited' as const, ref: u }))];
      locs.push({
        type: 'loc', id, key: b.key, slug: slugify(name), name, members: false, aliases: aliasesFor(b.key, name), sources,
        examine: first(b, 'desc'), options: optionsOf(b, 'op'), width: Number(first(b, 'width') ?? 1), length: Number(first(b, 'length') ?? 1),
        category: first(b, 'category'), params: paramsOf(b)
      });
    }
  }
  dedupeSlugs(locs);
  return locs;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd wiki && ~/.bun/bin/bun test gen/npcs.test.ts gen/locs.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add wiki/gen/npcs.ts wiki/gen/locs.ts wiki/gen/npcs.test.ts wiki/gen/locs.test.ts wiki/gen/fixtures
git commit -m "feat(wiki): npc and scenery extractors with derived combat levels"
```

---

### Task 4: Map spawns and areas

**Files:**
- Create: `wiki/gen/parse/jm2.ts`, `wiki/gen/maps.ts`, `wiki/gen/areas.ts`, `wiki/gen/fixtures/m50_50.jm2`, `wiki/gen/fixtures/labels.txt`, `wiki/gen/fixtures/free2play.csv`
- Test: `wiki/gen/parse/jm2.test.ts`, `wiki/gen/areas.test.ts`

**Interfaces:**
- Produces: `parseJm2(text, file): { npcs: RawSpawn[]; objs: RawSpawn[]; locs: RawSpawn[] }` with `RawSpawn = { level: number; x: number; z: number; id: number; count: number }` in absolute coordinates; `extractSpawns({ jm2Files, npcPack, objPack, locPack, areas }): Spawn[]`; `extractAreas({ labelsText, free2playText, multiwayText }): Areas` where `Areas = { areas: Area[]; isFree(coord): boolean; isMultiway(coord): boolean; nearestArea(coord): Area | null }`; `parsePacked(s: string): Coord` for `level_mx_mz_lx_lz`.

- [ ] **Step 1: Create fixtures**

`wiki/gen/fixtures/m50_50.jm2`, a trimmed file with the four section headers and a few lines per section copied from `engine/content/maps/m50_50.jm2`:

```
==== MAP ====
0 0 0: u48
==== LOC ====
0 0 0: 1247 22 3
0 0 7: 1258 22
==== NPC ====
0 0 38: 59
0 2 53: 100
==== OBJ ====
0 5 27: 882 1
2 5 24: 1511 3
```

`wiki/gen/fixtures/labels.txt` (first six lines of `engine/content/maps/labels.txt`):

```
=Lumbridge,3239,3233,1
=Varrock,3211,3450,1
=Kingdom Of/Misthalin,3217,3321,2
=Al Kharid,3297,3150,1
=Duel/Arena,3361,3233,1
=Tutorial Island,3105,3099,1
```

`wiki/gen/fixtures/free2play.csv`:

```
// surface map
0_50_50_0_0
0_50_50_8_0
```

- [ ] **Step 2: Write the failing tests**

`wiki/gen/parse/jm2.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseJm2 } from './jm2';

describe('parseJm2', () => {
  const text = readFileSync(path.join(import.meta.dir, '..', 'fixtures', 'm50_50.jm2'), 'utf8');
  const out = parseJm2(text, 'maps/m50_50.jm2');
  test('npc lines become absolute coordinates from the file name', () => {
    expect(out.npcs[0]).toEqual({ level: 0, x: 3200, z: 3238, id: 59, count: 1 });
  });
  test('obj lines carry counts and levels', () => {
    expect(out.objs[1]).toEqual({ level: 2, x: 3205, z: 3224, id: 1511, count: 3 });
  });
  test('loc lines ignore shape and rotation', () => {
    expect(out.locs).toHaveLength(2);
    expect(out.locs[1]).toEqual({ level: 0, x: 3200, z: 3207, id: 1258, count: 1 });
  });
});
```

`wiki/gen/areas.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extractAreas, parsePacked } from './areas';

const fx = (f: string) => readFileSync(path.join(import.meta.dir, 'fixtures', f), 'utf8');

describe('areas', () => {
  const a = extractAreas({ labelsText: fx('labels.txt'), free2playText: fx('free2play.csv'), multiwayText: '0_50_50_0_0\n' });
  test('labels become areas with slash turned into space and size kept', () => {
    const duel = a.areas.find(x => x.slug === 'duel-arena')!;
    expect(duel.name).toBe('Duel Arena');
    expect(duel.coord).toEqual({ x: 3361, z: 3233, level: 0 });
    expect(duel.size).toBe(1);
  });
  test('packed coordinates convert to absolute', () => {
    expect(parsePacked('0_50_50_8_0')).toEqual({ level: 0, x: 3208, z: 3200 });
  });
  test('free-to-play and multiway tests use the 8x8 zone of the coordinate', () => {
    expect(a.isFree({ x: 3203, z: 3205, level: 0 })).toBe(true);
    expect(a.isFree({ x: 3216, z: 3200, level: 0 })).toBe(false);
    expect(a.isMultiway({ x: 3207, z: 3207, level: 0 })).toBe(true);
  });
  test('nearestArea returns the closest label within reach', () => {
    expect(a.nearestArea({ x: 3222, z: 3218, level: 0 })!.name).toBe('Lumbridge');
    expect(a.nearestArea({ x: 3290, z: 3160, level: 0 })!.name).toBe('Al Kharid');
    expect(a.nearestArea({ x: 2000, z: 2000, level: 0 })).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd wiki && ~/.bun/bin/bun test gen/parse/jm2.test.ts gen/areas.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Write `wiki/gen/parse/jm2.ts`**

```ts
export interface RawSpawn { level: number; x: number; z: number; id: number; count: number }
export interface Jm2 { npcs: RawSpawn[]; objs: RawSpawn[]; locs: RawSpawn[] }

export function parseJm2(text: string, file: string): Jm2 {
  const m = /m(\d+)_(\d+)\.jm2$/.exec(file);
  if (!m) throw new Error(`not a map file: ${file}`);
  const mx = Number(m[1]), mz = Number(m[2]);
  const out: Jm2 = { npcs: [], objs: [], locs: [] };
  let section: keyof Jm2 | null = null;
  for (const line of text.split(/\r?\n/)) {
    const h = /^==== (\w+) ====$/.exec(line.trim());
    if (h) { section = h[1] === 'NPC' ? 'npcs' : h[1] === 'OBJ' ? 'objs' : h[1] === 'LOC' ? 'locs' : null; continue; }
    if (!section) continue;
    const row = /^(\d+) (\d+) (\d+): (\d+)(?: (\d+))?/.exec(line);
    if (!row) continue;
    const level = Number(row[1]), lx = Number(row[2]), lz = Number(row[3]), id = Number(row[4]);
    const count = section === 'objs' && row[5] !== undefined ? Number(row[5]) : 1;
    out[section].push({ level, x: mx * 64 + lx, z: mz * 64 + lz, id, count });
  }
  return out;
}
```

- [ ] **Step 5: Write `wiki/gen/areas.ts`**

```ts
import { slugify, dedupeSlugs } from './slug';
import type { Area, Coord } from './types';

export function parsePacked(s: string): Coord {
  const p = s.trim().split('_').map(Number);
  if (p.length !== 5 || p.some(n => !Number.isInteger(n))) throw new Error(`bad packed coord: ${s}`);
  return { level: p[0]!, x: p[1]! * 64 + p[3]!, z: p[2]! * 64 + p[4]! };
}

function zoneKey(c: Coord): string { return `${c.level}:${c.x >> 3}:${c.z >> 3}`; }

function zoneSet(text: string): Set<string> {
  const s = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('//')) continue;
    s.add(zoneKey(parsePacked(t)));
  }
  return s;
}

export interface Areas { areas: Area[]; isFree(c: Coord): boolean; isMultiway(c: Coord): boolean; nearestArea(c: Coord): Area | null }

// Label size 0 is a point of interest, 1 a town, 2 a region. Reach in tiles grows with size.
const REACH = [40, 120, 400];

export function extractAreas(opts: { labelsText: string; free2playText: string; multiwayText: string }): Areas {
  const areas: Area[] = [];
  let id = 0;
  for (const line of opts.labelsText.split(/\r?\n/)) {
    const m = /^=?([^,]+),(\d+),(\d+),(\d+)\s*$/.exec(line.trim());
    if (!m) continue;
    const name = m[1]!.replace(/\//g, ' ').trim();
    const coord = { x: Number(m[2]), z: Number(m[3]), level: 0 };
    areas.push({ type: 'area', id: id++, key: slugify(name), slug: slugify(name), name, members: false, aliases: [], coord, size: Number(m[4]),
      multiway: false, sources: [{ kind: 'content', ref: `content:maps/labels.txt#${name}` }] });
  }
  dedupeSlugs(areas);
  const free = zoneSet(opts.free2playText);
  const multi = zoneSet(opts.multiwayText);
  const isFree = (c: Coord) => free.has(zoneKey(c));
  const isMultiway = (c: Coord) => multi.has(zoneKey(c));
  for (const a of areas) { a.members = !isFree(a.coord); a.multiway = isMultiway(a.coord); }
  function nearestArea(c: Coord): Area | null {
    let best: Area | null = null; let bestScore = Infinity;
    for (const a of areas) {
      const d = Math.hypot(a.coord.x - c.x, a.coord.z - c.z);
      if (d > (REACH[a.size] ?? 400)) continue;
      const score = d + a.size * 25; // ties go to the more specific label
      if (score < bestScore) { bestScore = score; best = a; }
    }
    return best;
  }
  return { areas, isFree, isMultiway, nearestArea };
}
```

- [ ] **Step 6: Write `wiki/gen/maps.ts`**

```ts
import { parseJm2, type RawSpawn } from './parse/jm2';
import type { PackIds } from './parse/packIds';
import type { Areas } from './areas';
import type { Spawn } from './types';

export function extractSpawns(opts: { jm2Files: { file: string; text: string }[]; npcPack: PackIds; objPack: PackIds; locPack: PackIds; areas: Areas }): Spawn[] {
  const out: Spawn[] = [];
  const push = (kind: Spawn['kind'], rows: RawSpawn[], pack: PackIds, file: string) => {
    for (const r of rows) {
      const key = pack.byId.get(r.id);
      if (!key) continue;
      const coord = { x: r.x, z: r.z, level: r.level };
      out.push({ kind, id: r.id, key, coord, count: r.count, area: opts.areas.nearestArea(coord)?.slug ?? null, file });
    }
  };
  for (const { file, text } of opts.jm2Files) {
    const j = parseJm2(text, file);
    push('npc', j.npcs, opts.npcPack, file);
    push('obj', j.objs, opts.objPack, file);
    push('loc', j.locs, opts.locPack, file);
  }
  return out;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd wiki && ~/.bun/bin/bun test gen/parse/jm2.test.ts gen/areas.test.ts`
Expected: PASS (7 tests). Al Kharid is about 12 tiles from `(3290, 3160)`; Duel Arena about 102. If the assertion fails, check the arithmetic, not the test.

- [ ] **Step 8: Commit**

```bash
git add wiki/gen/parse/jm2.ts wiki/gen/maps.ts wiki/gen/areas.ts wiki/gen/parse/jm2.test.ts wiki/gen/areas.test.ts wiki/gen/fixtures
git commit -m "feat(wiki): map spawn parser, areas from labels, free-to-play and multiway zones"
```

---

### Task 5: RuneScript block splitter and shops extractor

**Files:**
- Create: `wiki/gen/parse/rs2.ts`, `wiki/gen/shops.ts`, `wiki/gen/fixtures/shop.inv`, `wiki/gen/fixtures/shopkeeper.rs2`, `wiki/gen/fixtures/shopkeeper.npc`
- Test: `wiki/gen/parse/rs2.test.ts`, `wiki/gen/shops.test.ts`

**Interfaces:**
- Produces: `parseRs2(text, file): ScriptBlock[]` with `ScriptBlock = { trigger: string; subject: string; params: string; body: string; file: string; line: number; citations: string[] }`; `blocksFor(blocks, subject)`; `extractShops({ invTexts, invPack, npcTexts, npcPack, rs2Blocks, npcSpawns }): ShopEntity[]`.

- [ ] **Step 1: Create fixtures**

`wiki/gen/fixtures/shop.inv`: the `dragonaxeshop` block verbatim from `engine/content/scripts/areas/areas_heroes_guild/configs/heroes_guild.inv` including its three `web.archive.org` comment lines, plus:

```
[fixture_generalshop]
scope=shared
size=40
restock=yes
stackall=yes
allstock=yes
stock1=pot_empty,5,100
stock2=jug_empty,2,100
```

`wiki/gen/fixtures/shopkeeper.rs2`:

```
[opnpc3,helemos]
~chatnpc("<p,happy>Why yes! We DO run an exclusive shop for our members!");
~openshop_activenpc;

[opnpc3,fixture_shopkeeper]
~openshop(fixture_generalshop, 550, 1000, 20, "Fixture General Store");
```

`wiki/gen/fixtures/shopkeeper.npc`:

```
[helemos]
name=Helemos
op1=Talk-to
op3=Trade
param=shop,dragonaxeshop

[fixture_shopkeeper]
name=Shop keeper
op3=Trade
```

- [ ] **Step 2: Write the failing tests**

`wiki/gen/parse/rs2.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { parseRs2 } from './rs2';

const SRC = `[opnpc1,cook]
// https://www.youtube.com/watch?v=mtPhS3n2dAo
if(%cookquest = 0) {
    @cooks_assistant_start;
}

[proc,randomherb]()(namedobj, int)
def_int $random = random(128);
return (unidentified_guam, 1);

[label,cooks_assistant_completion]
%cookquest = ^cook_complete;
`;

describe('parseRs2', () => {
  const blocks = parseRs2(SRC, 'scripts/x.rs2');
  test('splits on headers at column 0 and keeps trigger, subject and params', () => {
    expect(blocks.map(b => [b.trigger, b.subject])).toEqual([['opnpc1', 'cook'], ['proc', 'randomherb'], ['label', 'cooks_assistant_completion']]);
    expect(blocks[1]!.params).toBe('()(namedobj, int)');
    expect(blocks[0]!.line).toBe(1);
  });
  test('bodies exclude the header and citations are harvested', () => {
    expect(blocks[0]!.body).toContain('@cooks_assistant_start;');
    expect(blocks[0]!.citations).toEqual(['https://www.youtube.com/watch?v=mtPhS3n2dAo']);
    expect(blocks[2]!.body.trim()).toBe('%cookquest = ^cook_complete;');
  });
});
```

`wiki/gen/shops.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extractShops } from './shops';
import { parseRs2 } from './parse/rs2';
import { parsePackIds } from './parse/packIds';

const fx = (f: string) => readFileSync(path.join(import.meta.dir, 'fixtures', f), 'utf8');

describe('extractShops', () => {
  const shops = extractShops({
    invTexts: [{ file: 'scripts/h/heroes.inv', text: fx('shop.inv') }],
    invPack: parsePackIds('0=dragonaxeshop\n1=fixture_generalshop\n'),
    npcTexts: [{ file: 'scripts/h/h.npc', text: fx('shopkeeper.npc') }],
    npcPack: parsePackIds('0=helemos\n1=fixture_shopkeeper\n'),
    rs2Blocks: parseRs2(fx('shopkeeper.rs2'), 'scripts/h/keeper.rs2'),
    npcSpawns: [{ kind: 'npc', id: 0, key: 'helemos', coord: { x: 2900, z: 3510, level: 0 }, count: 1, area: 'heroes-guild', file: 'maps/m45_54.jm2' }]
  });
  test('stock rows, flags, owner via npc param, coords from owner spawns', () => {
    const s = shops.find(x => x.key === 'dragonaxeshop')!;
    expect(s.stock).toEqual([{ itemKey: 'dragon_battleaxe', count: 2, restockTicks: 500 }, { itemKey: 'dragon_mace', count: 2, restockTicks: 500 }]);
    expect(s.buysAll).toBe(false);
    expect(s.restocks).toBe(true);
    expect(s.ownerNpcKeys).toEqual(['helemos']);
    expect(s.coords).toEqual([{ x: 2900, z: 3510, level: 0 }]);
    expect(s.sources.some(x => x.kind === 'cited' && x.ref.includes('web.archive.org'))).toBe(true);
  });
  test('owner and title via ~openshop(<inv>) call in an opnpc block', () => {
    const g = shops.find(x => x.key === 'fixture_generalshop')!;
    expect(g.ownerNpcKeys).toEqual(['fixture_shopkeeper']);
    expect(g.buysAll).toBe(true);
    expect(g.name).toBe('Fixture General Store');
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd wiki && ~/.bun/bin/bun test gen/parse/rs2.test.ts gen/shops.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Write `wiki/gen/parse/rs2.ts`**

```ts
export interface ScriptBlock { trigger: string; subject: string; params: string; body: string; file: string; line: number; citations: string[] }

const HEADER = /^\[([a-z_0-9]+),([^\]]+)\](.*)$/;
const URL_RE = /https?:\/\/[^\s)"']+/g;

export function parseRs2(text: string, file: string): ScriptBlock[] {
  const blocks: ScriptBlock[] = [];
  const lines = text.split(/\r?\n/);
  let cur: ScriptBlock | null = null;
  let body: string[] = [];
  const flush = () => { if (cur) { cur.body = body.join('\n'); blocks.push(cur); } body = []; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const h = HEADER.exec(line);
    if (h) {
      flush();
      cur = { trigger: h[1]!, subject: h[2]!.trim(), params: h[3]!.trim(), body: '', file, line: i + 1, citations: [] };
      continue;
    }
    if (!cur) continue;
    body.push(line);
    const c = line.indexOf('//');
    if (c >= 0) for (const url of line.slice(c).match(URL_RE) ?? []) cur.citations.push(url);
  }
  flush();
  return blocks;
}

/** Blocks whose subject is `subject`, including comma-separated multi-subject headers like `[ai_queue3,a,b]`. */
export function blocksFor(blocks: ScriptBlock[], subject: string): ScriptBlock[] {
  return blocks.filter(b => b.subject === subject || b.subject.split(',').map(s => s.trim()).includes(subject));
}
```

- [ ] **Step 5: Write `wiki/gen/shops.ts`**

```ts
import { parseConfigText, first, paramsOf } from './parse/configText';
import type { PackIds } from './parse/packIds';
import type { ScriptBlock } from './parse/rs2';
import { slugify, dedupeSlugs } from './slug';
import type { ShopEntity, ShopStock, Source, Spawn } from './types';

const OPENSHOP = /~openshop\(\s*([a-z0-9_]+)\s*,[^"]*"([^"]*)"/g;

function ownersByParam(npcTexts: { file: string; text: string }[], invKeys: Set<string>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { file, text } of npcTexts) for (const b of parseConfigText(text, file)) {
    for (const v of Object.values(paramsOf(b))) if (invKeys.has(v)) out.set(v, [...(out.get(v) ?? []), b.key]);
  }
  return out;
}

function ownersByScript(blocks: ScriptBlock[]): Map<string, { npcs: string[]; title: string }> {
  const out = new Map<string, { npcs: string[]; title: string }>();
  for (const b of blocks) {
    if (!b.trigger.startsWith('opnpc')) continue;
    for (const m of b.body.matchAll(OPENSHOP)) {
      const e = out.get(m[1]!) ?? { npcs: [], title: m[2]! };
      if (!e.npcs.includes(b.subject)) e.npcs.push(b.subject);
      out.set(m[1]!, e);
    }
  }
  return out;
}

function titleFromKey(key: string): string {
  return key.replace(/shop$/, ' shop').replace(/_/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\w/, c => c.toUpperCase());
}

export function extractShops(opts: { invTexts: { file: string; text: string }[]; invPack: PackIds; npcTexts: { file: string; text: string }[]; npcPack: PackIds; rs2Blocks: ScriptBlock[]; npcSpawns: Spawn[] }): ShopEntity[] {
  const shops: ShopEntity[] = [];
  const invKeys = new Set(opts.invPack.byKey.keys());
  const byParam = ownersByParam(opts.npcTexts, invKeys);
  const byScript = ownersByScript(opts.rs2Blocks);
  for (const { file, text } of opts.invTexts) {
    for (const b of parseConfigText(text, file)) {
      const id = opts.invPack.byKey.get(b.key);
      if (id === undefined) continue;
      const stock: ShopStock[] = [];
      for (let i = 1; i <= 40; i++) {
        const v = first(b, `stock${i}`);
        if (!v) continue;
        const [itemKey, count, restock] = v.split(',').map(s => s.trim());
        stock.push({ itemKey: itemKey!, count: Number(count ?? 0), restockTicks: restock === undefined ? null : Number(restock) });
      }
      if (stock.length === 0 && first(b, 'allstock') !== 'yes') continue; // bank, player and other non-shop inventories
      const owners = [...new Set([...(byParam.get(b.key) ?? []), ...(byScript.get(b.key)?.npcs ?? [])])];
      const name = byScript.get(b.key)?.title ?? titleFromKey(b.key);
      const coords = opts.npcSpawns.filter(s => owners.includes(s.key)).map(s => s.coord);
      const sources: Source[] = [{ kind: 'content', ref: `content:${b.file}#${b.key}` }, ...b.citations.map(u => ({ kind: 'cited' as const, ref: u }))];
      if (owners.length) sources.push({ kind: 'derived', ref: 'derived:shops.ts:owners', note: 'owner resolved from npc params and ~openshop calls' });
      shops.push({ type: 'shop', id, key: b.key, slug: slugify(name), name, members: false, aliases: [b.key.replace(/_/g, ' ')], sources,
        ownerNpcKeys: owners, stock, buysAll: first(b, 'allstock') === 'yes', restocks: first(b, 'restock') === 'yes', coords });
    }
  }
  dedupeSlugs(shops);
  return shops;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd wiki && ~/.bun/bin/bun test gen/parse/rs2.test.ts gen/shops.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add wiki/gen/parse/rs2.ts wiki/gen/shops.ts wiki/gen/parse/rs2.test.ts wiki/gen/shops.test.ts wiki/gen/fixtures
git commit -m "feat(wiki): runescript block splitter and shop extractor with owner resolution"
```

---

### Task 6: Skills, XP table, dbrow parser and training methods

**Files:**
- Create: `wiki/gen/parse/dbrows.ts`, `wiki/gen/skills.ts`, `wiki/gen/fixtures/trees.dbtable`, `wiki/gen/fixtures/trees.dbrow`, `wiki/gen/fixtures/stat.enum`, `wiki/gen/fixtures/levelup_unlocks.enum`
- Test: `wiki/gen/parse/dbrows.test.ts`, `wiki/gen/skills.test.ts`

**Interfaces:**
- Produces: `parseDbTables(texts): Map<string, DbColumn[]>` with `DbColumn = { name: string; types: string[]; list: boolean }`; `parseDbRows(texts, tables): DbRow[]` with `DbRow = { table: string; key: string; file: string; values: Record<string, string[][]>; citations: string[] }`; `xpForLevel(level): number`; `levelForXp(xp): number`; `extractSkills({ statEnumText, unlocksEnumText }): SkillEntity[]`; `extractMethods({ rows, tables }): Method[]`.

- [ ] **Step 1: Create fixtures**

Copy `engine/content/scripts/skill_woodcutting/configs/trees.dbtable` verbatim, and the first row block of `trees.dbrow` (`normal_tree_table` through its last `successchance` line). Copy the `[stats]` and `[stats_free]` blocks of `engine/content/scripts/player/configs/stat.enum` and the `[levelup_unlocks_attack]` block of `engine/content/scripts/levelup/configs/levelup_unlocks.enum`.

- [ ] **Step 2: Write the failing tests**

`wiki/gen/parse/dbrows.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseDbRows, parseDbTables } from './dbrows';

const fx = (f: string) => readFileSync(path.join(import.meta.dir, '..', 'fixtures', f), 'utf8');

describe('dbrows', () => {
  const tables = parseDbTables([{ file: 'trees.dbtable', text: fx('trees.dbtable') }]);
  const rows = parseDbRows([{ file: 'trees.dbrow', text: fx('trees.dbrow') }], tables);
  test('table columns with types and flags', () => {
    expect(tables.get('woodcutting_trees')![0]).toEqual({ name: 'levelrequired', types: ['int'], list: false });
    expect(tables.get('woodcutting_trees')![1]).toMatchObject({ name: 'tree', types: ['loc'], list: true });
    expect(tables.get('woodcutting_trees')![5]).toEqual({ name: 'successchance', types: ['namedobj', 'int', 'int'], list: true });
  });
  test('row values grouped per column, tuples kept, lists accumulate', () => {
    const r = rows[0]!;
    expect(r.table).toBe('woodcutting_trees');
    expect(r.key).toBe('normal_tree_table');
    expect(r.values['levelrequired']).toEqual([['0']]);
    expect(r.values['productexp']).toEqual([['250']]);
    expect(r.values['product']).toEqual([['logs']]);
    expect(r.values['tree']!.length).toBeGreaterThan(10);
    expect(r.values['successchance']![0]).toEqual(['bronze_axe', '64', '200']);
  });
});
```

`wiki/gen/skills.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extractMethods, extractSkills, levelForXp, xpForLevel } from './skills';
import { parseDbRows, parseDbTables } from './parse/dbrows';

const fx = (f: string) => readFileSync(path.join(import.meta.dir, 'fixtures', f), 'utf8');

describe('xp table (engine Player.ts levelExperience)', () => {
  test('known anchors', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(83);
    expect(xpForLevel(10)).toBe(1154);
    expect(xpForLevel(50)).toBe(101333);
    expect(xpForLevel(99)).toBe(13034431);
    expect(levelForXp(13034431)).toBe(99);
    expect(levelForXp(82)).toBe(1);
  });
});

describe('extractSkills', () => {
  const skills = extractSkills({ statEnumText: fx('stat.enum'), unlocksEnumText: fx('levelup_unlocks.enum') });
  test('19 skills in enum order, members from stats_free, unlock levels attached', () => {
    expect(skills).toHaveLength(19);
    expect(skills[0]).toMatchObject({ key: 'attack', name: 'Attack', index: 1, members: false, unlocks: [5, 10, 20, 30, 40, 60] });
    expect(skills.find(s => s.key === 'agility')!.members).toBe(true);
    expect(skills.find(s => s.key === 'runecraft')!.name).toBe('Runecraft');
  });
});

describe('extractMethods', () => {
  const tables = parseDbTables([{ file: 'scripts/skill_woodcutting/configs/trees.dbtable', text: fx('trees.dbtable') }]);
  const rows = parseDbRows([{ file: 'scripts/skill_woodcutting/configs/trees.dbrow', text: fx('trees.dbrow') }], tables);
  test('a row with levelrequired and productexp becomes a method with the skill from the folder', () => {
    const m = extractMethods({ rows, tables })[0]!;
    expect(m).toMatchObject({ skill: 'woodcutting', level: 1, xp: 25, action: 'Chop normal tree', outputs: ['logs'], table: 'woodcutting_trees', row: 'normal_tree_table' });
    expect(m.inputs).toContain('bronze_axe');
    expect(m.sources[0]!.ref).toBe('content:scripts/skill_woodcutting/configs/trees.dbrow#normal_tree_table');
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd wiki && ~/.bun/bin/bun test gen/parse/dbrows.test.ts gen/skills.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Write `wiki/gen/parse/dbrows.ts`**

```ts
import { parseConfigText } from './configText';

export interface DbColumn { name: string; types: string[]; list: boolean }
export interface DbRow { table: string; key: string; file: string; values: Record<string, string[][]>; citations: string[] }

const FLAGS = new Set(['LIST', 'INDEXED', 'REQUIRED', 'CLIENTSIDE']);

export function parseDbTables(texts: { file: string; text: string }[]): Map<string, DbColumn[]> {
  const out = new Map<string, DbColumn[]>();
  for (const { file, text } of texts) for (const b of parseConfigText(text, file)) {
    const cols: DbColumn[] = [];
    for (const c of b.fields.get('column') ?? []) {
      const parts = c.split(',').map(s => s.trim());
      const name = parts.shift()!;
      cols.push({ name, types: parts.filter(p => !FLAGS.has(p)), list: parts.includes('LIST') });
    }
    out.set(b.key, cols);
  }
  return out;
}

export function parseDbRows(texts: { file: string; text: string }[], tables: Map<string, DbColumn[]>): DbRow[] {
  const rows: DbRow[] = [];
  for (const { file, text } of texts) for (const b of parseConfigText(text, file)) {
    const table = b.fields.get('table')?.[0];
    if (!table || !tables.has(table)) continue;
    const values: Record<string, string[][]> = {};
    for (const d of b.fields.get('data') ?? []) {
      const parts = d.split(',').map(s => s.trim());
      const col = parts.shift()!;
      (values[col] ??= []).push(parts);
    }
    rows.push({ table, key: b.key, file, values, citations: b.citations });
  }
  return rows;
}
```

- [ ] **Step 5: Write `wiki/gen/skills.ts`**

```ts
import { parseConfigText } from './parse/configText';
import type { DbColumn, DbRow } from './parse/dbrows';
import { slugify } from './slug';
import type { Method, SkillEntity } from './types';

// engine/server/src/engine/entity/Player.ts lines 77-85. The engine stores xp x10; this table is in whole xp.
const TABLE: number[] = (() => {
  const t = [0];
  let acc = 0;
  for (let level = 1; level < 99; level++) {
    acc += Math.floor(level + Math.pow(2, level / 7) * 300);
    t.push(Math.floor(acc / 4));
  }
  return t;
})();
export function xpForLevel(level: number): number { return TABLE[Math.min(Math.max(level, 1), 99) - 1]!; }
export function levelForXp(xp: number): number {
  for (let l = 99; l >= 2; l--) if (xp >= TABLE[l - 1]!) return l;
  return 1;
}

const DISPLAY: Record<string, string> = { runecraft: 'Runecraft', hitpoints: 'Hitpoints' };

export function extractSkills(opts: { statEnumText: string; unlocksEnumText: string }): SkillEntity[] {
  const blocks = parseConfigText(opts.statEnumText, 'scripts/player/configs/stat.enum');
  const stats = blocks.find(b => b.key === 'stats');
  if (!stats) throw new Error('stat.enum has no [stats] block');
  const free = new Set((blocks.find(b => b.key === 'stats_free')?.fields.get('val') ?? []).map(v => v.split(',')[1]!));
  const unlockBlocks = parseConfigText(opts.unlocksEnumText, 'scripts/levelup/configs/levelup_unlocks.enum');
  const out: SkillEntity[] = [];
  for (const v of stats.fields.get('val') ?? []) {
    const [idx, key] = v.split(',') as [string, string];
    const name = DISPLAY[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
    const unlocks = (unlockBlocks.find(b => b.key === `levelup_unlocks_${key}`)?.fields.get('val') ?? []).map(Number);
    out.push({ type: 'skill', id: Number(idx), key, slug: slugify(name), name, index: Number(idx), members: !free.has(key), aliases: [key], unlocks,
      sources: [{ kind: 'content', ref: 'content:scripts/player/configs/stat.enum#stats' }, { kind: 'content', ref: `content:scripts/levelup/configs/levelup_unlocks.enum#levelup_unlocks_${key}` }] });
  }
  return out;
}

const XP_COLS = ['productexp', 'exp', 'xp', 'experience'];
const LEVEL_COLS = ['levelrequired', 'level'];
const VERB: Record<string, string> = { woodcutting: 'Chop', mining: 'Mine', fishing: 'Fish', cooking: 'Cook', smithing: 'Smith', crafting: 'Craft', fletching: 'Fletch', firemaking: 'Burn', herblore: 'Mix', runecraft: 'Craft' };

function skillOf(file: string): string | null {
  const m = /skill_([a-z]+)\//.exec(file);
  return m ? m[1]! : null;
}

export function extractMethods(opts: { rows: DbRow[]; tables: Map<string, DbColumn[]> }): Method[] {
  const out: Method[] = [];
  for (const r of opts.rows) {
    const skill = skillOf(r.file);
    if (!skill) continue;
    const cols = opts.tables.get(r.table) ?? [];
    const levelCol = LEVEL_COLS.find(c => r.values[c]);
    const xpCol = XP_COLS.find(c => r.values[c]);
    if (!levelCol || !xpCol) continue;
    const outputs = (r.values['product'] ?? []).map(t => t[0]!);
    const inputs = new Set<string>();
    for (const c of cols) {
      if (c.name === 'product' || c.name === levelCol || c.name === xpCol) continue;
      for (const tuple of r.values[c.name] ?? []) c.types.forEach((t, i) => { if ((t === 'namedobj' || t === 'obj' || t === 'loc') && tuple[i]) inputs.add(tuple[i]!); });
    }
    out.push({ skill, level: Math.max(1, Number(r.values[levelCol]![0]![0])), xp: Number(r.values[xpCol]![0]![0]) / 10,
      action: `${VERB[skill] ?? 'Make'} ${r.key.replace(/_table$/, '').replace(/_/g, ' ')}`,
      inputs: [...inputs], outputs, table: r.table, row: r.key,
      sources: [{ kind: 'content', ref: `content:${r.file}#${r.key}` }, ...r.citations.map(u => ({ kind: 'cited' as const, ref: u }))] });
  }
  return out;
}
```

`productexp=250` is 25 xp: the engine's `stat_advance` takes tenths, which is why Cook's Assistant's `stat_advance(cooking, 3000)` is 300 xp.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd wiki && ~/.bun/bin/bun test gen/parse/dbrows.test.ts gen/skills.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add wiki/gen/parse/dbrows.ts wiki/gen/skills.ts wiki/gen/parse/dbrows.test.ts wiki/gen/skills.test.ts wiki/gen/fixtures
git commit -m "feat(wiki): skills, xp table, dbrow parser and training methods"
```

---

### Task 7: Drop tables from death scripts and drop_table rows

**Files:**
- Create: `wiki/gen/drops.ts`, `wiki/gen/fixtures/bandit_drops.rs2`, `wiki/gen/fixtures/shared_droptables.rs2`, `wiki/gen/fixtures/gem_rock_table.dbrow`, `wiki/gen/fixtures/drop_table.dbtable`
- Test: `wiki/gen/drops.test.ts`

**Interfaces:**
- Consumes: `ScriptBlock`, `DbRow`, `DbColumn`.
- Produces: `extractDrops({ rs2Blocks, npcs: { key; params }[], rows, tables }): Drop[]`; `parseRandomChain(body): Branch[]` with `Branch = { lo: number; hi: number; den: number; lines: string[]; members: boolean }`.

- [ ] **Step 1: Create fixtures**

`wiki/gen/fixtures/bandit_drops.rs2`: the `[ai_queue3,brawling_bandit]` block from `engine/content/scripts/drop tables/scripts/bandit.rs2`, from its header through the `coins, 35` branch, followed by a closing `}` so the chain is complete. `wiki/gen/fixtures/shared_droptables.rs2`: the whole `[proc,randomherb]` block from `shared_droptables.rs2`. `drop_table.dbtable` and `gem_rock_table.dbrow`: verbatim copies from `scripts/drop tables/configs/` and `scripts/skill_mining/configs/`.

- [ ] **Step 2: Write the failing test `wiki/gen/drops.test.ts`**

```ts
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extractDrops, parseRandomChain } from './drops';
import { parseRs2 } from './parse/rs2';
import { parseDbRows, parseDbTables } from './parse/dbrows';

const fx = (f: string) => readFileSync(path.join(import.meta.dir, 'fixtures', f), 'utf8');

describe('parseRandomChain', () => {
  test('threshold chain yields contiguous ranges with the roll size and members flag', () => {
    const body = `def_int $random = random(128);
if ($random < 4) {
    obj_add(npc_coord, iron_scimitar, 1, ^lootdrop_duration);
} else if ($random < 6) {
    obj_add(npc_coord, steel_sq_shield, 1, ^lootdrop_duration);
} else if ($random < 20) {
    if (map_members = ^true) {
        obj_add(npc_coord, bloodrune, 2, ^lootdrop_duration);
    }
}`;
    const br = parseRandomChain(body);
    expect(br.map(b => [b.lo, b.hi, b.den])).toEqual([[0, 4, 128], [4, 6, 128], [6, 20, 128]]);
    expect(br[2]!.members).toBe(true);
    expect(br[0]!.members).toBe(false);
  });
});

describe('extractDrops', () => {
  const blocks = [...parseRs2(fx('bandit_drops.rs2'), 'scripts/drop tables/scripts/bandit.rs2'), ...parseRs2(fx('shared_droptables.rs2'), 'scripts/drop tables/scripts/shared_droptables.rs2')];
  const tables = parseDbTables([{ file: 'x.dbtable', text: fx('drop_table.dbtable') }]);
  const rows = parseDbRows([{ file: 'scripts/skill_mining/configs/gem_rock_table.dbrow', text: fx('gem_rock_table.dbrow') }], tables);
  const npcs = [{ key: 'brawling_bandit', params: { death_drop: 'bones' } }];
  const drops = extractDrops({ rs2Blocks: blocks, npcs, rows, tables });
  test('100% drop from the death_drop param', () => {
    expect(drops).toContainEqual(expect.objectContaining({ npcKey: 'brawling_bandit', itemKey: 'bones', num: 1, den: 1, table: 'always' }));
  });
  test('script branches become rates; members branch flagged', () => {
    const scim = drops.find(d => d.npcKey === 'brawling_bandit' && d.itemKey === 'iron_scimitar')!;
    expect(scim).toMatchObject({ min: 1, max: 1, num: 4, den: 128, condition: null });
    const blood = drops.find(d => d.itemKey === 'bloodrune')!;
    expect(blood).toMatchObject({ num: 1, den: 128, condition: 'members' });
  });
  test('~randomherb expands into herb sub-rates multiplied through', () => {
    const guam = drops.find(d => d.npcKey === 'brawling_bandit' && d.itemKey === 'unidentified_guam')!;
    // herb branch is thresholds 22..59 of 128 (37/128); guam is 32/128 of the herb roll
    expect(guam.num).toBe(37 * 32);
    expect(guam.den).toBe(128 * 128);
    expect(guam.table).toBe('randomherb');
  });
  test('drop_table dbrows attach to the row key as a table', () => {
    const opal = drops.find(d => d.npcKey === 'gem_rock_table' && d.itemKey === 'uncut_opal')!;
    expect(opal).toMatchObject({ num: 60, den: 128, table: 'gem_rock_table' });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd wiki && ~/.bun/bin/bun test gen/drops.test.ts`
Expected: FAIL, module `./drops` not found.

- [ ] **Step 4: Write `wiki/gen/drops.ts`**

```ts
import type { DbColumn, DbRow } from './parse/dbrows';
import type { ScriptBlock } from './parse/rs2';
import type { Drop, Source } from './types';

export interface Branch { lo: number; hi: number; den: number; lines: string[]; members: boolean }

const RANDOM_DEF = /\$random\s*=\s*random\((\d+)\)/;
const BRANCH_HEAD = /^\s*(?:\}\s*)?(?:else\s+)?if\s*\(\s*\$random\s*<\s*(\d+)\s*\)\s*\{/;

/** Splits a body into `$random < N` branches. One chain per `$random = random(N)`; nested blocks stay inside the branch's lines. */
export function parseRandomChain(body: string): Branch[] {
  const out: Branch[] = [];
  let den = 0; let lo = 0; let cur: Branch | null = null; let depth = 0;
  for (const line of body.split(/\r?\n/)) {
    const def = RANDOM_DEF.exec(line);
    if (def) { den = Number(def[1]); lo = 0; cur = null; depth = 0; continue; }
    if (!den) continue;
    const head = BRANCH_HEAD.exec(line);
    if (head && depth <= 1) {
      const hi = Number(head[1]);
      cur = { lo, hi, den, lines: [], members: false };
      out.push(cur); lo = hi; depth = 1; continue;
    }
    if (!cur) continue;
    if (/map_members\s*=\s*\^true/.test(line)) cur.members = true;
    cur.lines.push(line);
    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    if (depth <= 0) { cur = null; depth = 0; }
  }
  return out;
}

const OBJ_ADD = /obj_add\(\s*npc_coord\s*,\s*([~a-z0-9_]+)\s*(?:,\s*([^,)]+))?/g; // `obj_add(npc_coord, ~randomherb, ^lootdrop_duration)` carries no count
const RETURN = /return\s*\(\s*([a-z0-9_]+)\s*,\s*([^)]+)\)/;

function countOf(expr: string): { min: number; max: number } {
  const t = expr.trim();
  if (/^\d+$/.test(t)) return { min: Number(t), max: Number(t) };
  let m = /random\((\d+)\)\s*\+\s*(\d+)/.exec(t);
  if (m) return { min: Number(m[2]), max: Number(m[1]) - 1 + Number(m[2]) };
  m = /(\d+)\s*\+\s*random\((\d+)\)/.exec(t);
  if (m) return { min: Number(m[1]), max: Number(m[1]) + Number(m[2]) - 1 };
  return { min: 1, max: 1 };
}

interface SubDrop { item: string; min: number; max: number; num: number; den: number; members: boolean }

/** proc name -> its branches as (item, count, rate) for helpers like ~randomherb. */
function procTables(blocks: ScriptBlock[]): Map<string, SubDrop[]> {
  const out = new Map<string, SubDrop[]>();
  for (const b of blocks) {
    if (b.trigger !== 'proc') continue;
    const rows: SubDrop[] = [];
    for (const br of parseRandomChain(b.body)) {
      const r = RETURN.exec(br.lines.join('\n'));
      if (!r) continue;
      rows.push({ item: r[1]!, ...countOf(r[2]!), num: br.hi - br.lo, den: br.den, members: br.members });
    }
    if (rows.length) out.set(b.subject, rows);
  }
  return out;
}

export function extractDrops(opts: { rs2Blocks: ScriptBlock[]; npcs: { key: string; params: Record<string, string> }[]; rows: DbRow[]; tables: Map<string, DbColumn[]> }): Drop[] {
  const drops: Drop[] = [];
  const procs = procTables(opts.rs2Blocks);
  const src = (b: ScriptBlock, table: string): Source[] => [
    { kind: 'content', ref: `content:${b.file}#${b.trigger},${b.subject}` },
    { kind: 'derived', ref: `derived:drops.ts:${table}`, note: 'rate from random() thresholds' },
    ...b.citations.map(u => ({ kind: 'cited' as const, ref: u }))
  ];
  for (const npc of opts.npcs) {
    const dd = npc.params['death_drop'];
    if (dd) drops.push({ npcKey: npc.key, itemKey: dd, min: 1, max: 1, num: 1, den: 1, condition: null, table: 'always', sources: [{ kind: 'content', ref: `content:npc#${npc.key}:death_drop` }] });
  }
  for (const b of opts.rs2Blocks) {
    if (b.trigger !== 'ai_queue3') continue;
    for (const npcKey of b.subject.split(',').map(s => s.trim())) {
      for (const br of parseRandomChain(b.body)) {
        const num = br.hi - br.lo;
        for (const m of br.lines.join('\n').matchAll(OBJ_ADD)) {
          const item = m[1]!;
          const cond = br.members ? 'members' : null;
          if (item.startsWith('~')) {
            const sub = procs.get(item.slice(1));
            if (!sub) continue;
            for (const s of sub) drops.push({ npcKey, itemKey: s.item, min: s.min, max: s.max, num: num * s.num, den: br.den * s.den, condition: cond ?? (s.members ? 'members' : null), table: item.slice(1), sources: src(b, item.slice(1)) });
          } else {
            drops.push({ npcKey, itemKey: item, ...countOf(m[2] ?? '1'), num, den: br.den, condition: cond, table: 'main', sources: src(b, 'main') });
          }
        }
      }
    }
  }
  for (const r of opts.rows) {
    if (r.table !== 'drop_table') continue;
    const den = Number(r.values['total']?.[0]?.[0] ?? 0);
    for (const [item, count, weight] of r.values['drop'] ?? []) {
      drops.push({ npcKey: r.key, itemKey: item!, min: Number(count), max: Number(count), num: Number(weight), den, condition: null, table: r.key, sources: [{ kind: 'content', ref: `content:${r.file}#${r.key}` }] });
    }
  }
  return drops;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd wiki && ~/.bun/bin/bun test gen/drops.test.ts`
Expected: PASS (5 tests). The herb branch in the fixture runs from `< 22` to `< 59`, so its width is 37.

- [ ] **Step 6: Commit**

```bash
git add wiki/gen/drops.ts wiki/gen/drops.test.ts wiki/gen/fixtures
git commit -m "feat(wiki): drop rates from death-script random chains and drop_table rows"
```

---

### Task 8: Quest extractor

**Files:**
- Create: `wiki/gen/quests.ts`, `wiki/gen/questNames.ts`, `wiki/gen/fixtures/quest_cook/` (full copy of `engine/content/scripts/quests/quest_cook/`), `wiki/gen/fixtures/cook_npc.rs2` (copy of `engine/content/scripts/areas/area_lumbridge/scripts/cook.rs2`), `wiki/gen/fixtures/quest.constant` (copy of `engine/content/scripts/general/configs/quest.constant`)
- Test: `wiki/gen/quests.test.ts`, `wiki/gen/questNames.test.ts`

**Interfaces:**
- Consumes: `ScriptBlock`, `parseConfigText`, `slugify`.
- Produces: `extractQuests({ questFolders: { folder; files: { file; text }[] }[]; allBlocks: ScriptBlock[]; constants: Map<string, number>; questNames: Map<string, string>; npcKeys: Set<string> }): QuestEntity[]`; `parseConstants(texts: string[]): Map<string, number>`; `QUEST_NAMES: Record<string, string | null>`.

- [ ] **Step 1: Write `wiki/gen/questNames.ts`**

Folders come from `ls engine/content/scripts/quests` (53 `quest_*` folders); display names from `engine/content/scripts/general/configs/quest.enum` (`quest_names_enum`). The table below is the join; the implementer verifies each row against the folder's `send_quest_complete(...)` message and `send_quest_progress(questlist:<component>, ...)` component name and corrects any that disagree, recording corrections in the commit message. A folder that turns out to be an empty stub maps to `null` and is skipped.

```ts
/** Quest folder -> display name. Source: content:scripts/general/configs/quest.enum#quest_names_enum joined to folder names (editorial). */
export const QUEST_NAMES: Record<string, string | null> = {
  quest_arena: 'Fight Arena', quest_arthur: "Merlin's Crystal", quest_ball: "Witch's House", quest_barcrawl: 'Alfred Grimhand Barcrawl',
  quest_biohazard: 'Biohazard', quest_blackarmgang: 'Shield of Arrav', quest_blackknight: "Black Knight's Fortress", quest_chompybird: 'Big Chompy Bird Hunting',
  quest_cog: 'Clock Tower', quest_cook: "Cook's Assistant", quest_crest: 'Family Crest', quest_demon: 'Demon Slayer', quest_desertrescue: 'The Tourist Trap',
  quest_doric: "Doric's Quest", quest_dragon: 'Dragon Slayer', quest_druid: 'Druidic Ritual', quest_drunkmonk: "Monk's Friend", quest_elena: 'Plague City',
  quest_fishingcompo: 'Fishing Contest', quest_fluffs: "Gertrude's Cat", quest_gobdip: 'Goblin Diplomacy', quest_grail: 'Holy Grail', quest_grandtree: 'The Grand Tree',
  quest_haunted: 'The Restless Ghost', quest_hazeelcult: 'Hazeel Cult', quest_hero: "Heroes' Quest", quest_hetty: "Witch's Potion", quest_hunt: 'Scorpion Catcher',
  quest_ikov: 'Temple of Ikov', quest_imp: 'Imp Catcher', quest_itexam: 'The Dig Site', quest_itgronigen: 'Observatory Quest', quest_itwatchtower: 'Watchtower',
  quest_junglepotion: 'Jungle Potion', quest_legends: "Legends' Quest", quest_mcannon: 'Dwarf Cannon', quest_murder: 'Murder Mystery', quest_priest: 'Priest in Peril',
  quest_prince: 'Prince Ali Rescue', quest_romeojuliet: 'Romeo & Juliet', quest_runemysteries: 'Rune Mysteries', quest_scorpcatcher: 'Scorpion Catcher',
  quest_seaslug: 'Sea Slug', quest_sheep: 'Sheep Shearer', quest_sheepherder: 'Sheep Herder', quest_squire: "The Knight's Sword", quest_totem: 'Tribal Totem',
  quest_tree: 'Tree Gnome Village', quest_upass: 'Underground Pass', quest_vampire: 'Vampire Slayer', quest_waterfall: 'Waterfall Quest', quest_zanaris: 'Lost City',
  quest_zombiequeen: "Pirate's Treasure"
};
```

`quest_hunt` and `quest_scorpcatcher` cannot both be Scorpion Catcher: the implementer reads both folders' `send_quest_progress` component and names the other from its scripts (Pirate's Treasure is a candidate if `quest_zombiequeen` turns out to be something else), or maps the stub to `null`.

- [ ] **Step 2: Write the failing tests**

`wiki/gen/questNames.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { QUEST_NAMES } from './questNames';
import { CONTENT } from './paths';

describe('QUEST_NAMES', () => {
  test('every quest folder in the content clone has an entry and no two folders share a name', () => {
    const folders = readdirSync(path.join(CONTENT, 'scripts', 'quests'), { withFileTypes: true }).filter(d => d.isDirectory() && d.name.startsWith('quest_')).map(d => d.name);
    expect(folders.filter(f => !(f in QUEST_NAMES))).toEqual([]);
    const names = Object.values(QUEST_NAMES).filter((n): n is string => n !== null);
    expect(new Set(names).size).toBe(names.length);
  });
});
```

`wiki/gen/quests.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { extractQuests, parseConstants } from './quests';
import { parseRs2 } from './parse/rs2';

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
  const [q] = extractQuests({ questFolders: [{ folder: 'quest_cook', files: folder }], allBlocks, constants, questNames: new Map([['quest_cook', "Cook's Assistant"]]), npcKeys: new Set(['cook']) });
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
});
```

The quest point expectation needs `^cook_questpoints` to resolve. Run `grep -rn "cook_questpoints" engine/content/scripts --include=*.constant`; if it lives outside `quest.constant`, copy that file into the fixtures too and pass both texts to `parseConstants`.

- [ ] **Step 3: Run to verify they fail**

Run: `cd wiki && ~/.bun/bin/bun test gen/quests.test.ts gen/questNames.test.ts`
Expected: FAIL (`./quests` missing).

- [ ] **Step 4: Write `wiki/gen/quests.ts`**

```ts
import { parseConfigText } from './parse/configText';
import type { ScriptBlock } from './parse/rs2';
import { slugify } from './slug';
import type { QuestEntity, QuestReward, QuestStage, Requirement, Source } from './types';

export function parseConstants(texts: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of texts) for (const line of t.split(/\r?\n/)) {
    const m = /^\^([a-z0-9_]+)\s*=\s*(-?\d+)/.exec(line.trim());
    if (m) out.set(m[1]!, Number(m[2]));
  }
  return out;
}

function resolve(v: string, constants: Map<string, number>): number | null {
  if (/^-?\d+$/.test(v)) return Number(v);
  if (v.startsWith('^')) return constants.get(v.slice(1)) ?? null;
  return null;
}

const CHAT = /~chatnpc\("(?:<[^>]*>)?([^"]+)"\)/g;
const dedupe = <T,>(a: T[]): T[] => [...new Map(a.map(x => [JSON.stringify(x), x])).values()];

export function extractQuests(opts: { questFolders: { folder: string; files: { file: string; text: string }[] }[]; allBlocks: ScriptBlock[]; constants: Map<string, number>; questNames: Map<string, string>; npcKeys: Set<string> }): QuestEntity[] {
  const out: QuestEntity[] = [];
  let id = 0;
  for (const qf of opts.questFolders) {
    const name = opts.questNames.get(qf.folder);
    if (!name) continue;
    const varpFile = qf.files.find(f => f.file.endsWith('.varp'));
    const varp = varpFile ? parseConfigText(varpFile.text, varpFile.file)[0]?.key ?? null : null;
    if (!varp) continue;
    const folderBlocks = opts.allBlocks.filter(b => b.file.includes(`/quests/${qf.folder}/`));
    const related = opts.allBlocks.filter(b => b.body.includes(`%${varp}`) && !folderBlocks.includes(b));
    const blocks = [...folderBlocks, ...related];
    const sources: Source[] = [
      { kind: 'content', ref: `content:scripts/quests/${qf.folder}` },
      { kind: 'derived', ref: 'derived:quests.ts:progression', note: 'stages from varp assignments, rewards from the completion block' }
    ];
    for (const b of blocks) for (const u of b.citations) sources.push({ kind: 'cited', ref: u });

    const stageMap = new Map<number, QuestStage>();
    const assign = new RegExp(`%${varp}\\s*=\\s*(\\^?[a-z0-9_]+)\\s*;`, 'g');
    let completeValue = 0;
    for (const b of blocks) {
      for (const m of b.body.matchAll(assign)) {
        const v = resolve(m[1]!, opts.constants);
        if (v === null || v === 0) continue;
        if (m[1]!.endsWith('_complete')) completeValue = v;
        if (!stageMap.has(v)) stageMap.set(v, { value: v, label: b.subject, hints: [...b.body.matchAll(CHAT)].map(c => c[1]!.replace(/\|/g, ' ')).slice(0, 3) });
      }
    }
    const stages = [...stageMap.values()].sort((a, b) => a.value - b.value);
    if (!completeValue && stages.length) completeValue = stages[stages.length - 1]!.value;

    const requirements: Requirement[] = [];
    const items = new Set<string>();
    for (const b of folderBlocks) {
      for (const m of b.body.matchAll(/stat(?:_base)?\((\w+)\)\s*(?:<|>=)\s*(\d+)/g)) requirements.push({ kind: 'skill', key: m[1]!, value: Number(m[2]) });
      for (const m of b.body.matchAll(/%([a-z0-9_]+)\s*(?:<|>=|=)\s*\^([a-z0-9_]+)_complete/g)) if (m[1] !== varp) requirements.push({ kind: 'quest', key: m[2]!, value: opts.constants.get(`${m[2]}_complete`) ?? 1 });
      for (const m of b.body.matchAll(/inv_total\(inv,\s*([a-z0-9_]+)\)/g)) items.add(m[1]!);
    }

    const rewards: QuestReward[] = [];
    let questPoints: number | null = null;
    const completion = blocks.filter(b => new RegExp(`%${varp}\\s*=\\s*\\^[a-z0-9_]+_complete`).test(b.body));
    for (const b of completion) {
      for (const m of b.body.matchAll(/stat_advance\((\w+),\s*(\d+)\)/g)) rewards.push({ kind: 'xp', key: m[1]!, amount: Number(m[2]) / 10 });
      for (const m of b.body.matchAll(/inv_add\(inv,\s*([a-z0-9_]+),\s*(\d+)\)/g)) rewards.push({ kind: 'item', key: m[1]!, amount: Number(m[2]) });
      const qp = /send_quest_complete\([^;]*?,\s*(\^?[a-z0-9_]+)\s*,\s*"/.exec(b.body);
      if (qp) { const v = resolve(qp[1]!, opts.constants); if (v !== null) { questPoints = v; rewards.push({ kind: 'questpoints', key: 'questpoints', amount: v }); } }
    }

    const start = opts.allBlocks.find(b => b.trigger === 'opnpc1' && opts.npcKeys.has(b.subject) && new RegExp(`%${varp}\\s*=\\s*0`).test(b.body));
    out.push({ type: 'quest', id: id++, key: qf.folder, slug: slugify(name), name, members: false, aliases: [name.toLowerCase().replace(/'/g, '')], sources,
      folder: qf.folder, varp, completeValue, questPoints, startNpcKey: start?.subject ?? null, stages, requirements: dedupe(requirements), itemsChecked: [...items], rewards: dedupe(rewards) });
  }
  return out;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd wiki && ~/.bun/bin/bun test gen/quests.test.ts gen/questNames.test.ts`
Expected: PASS. Stage 1 is set inside label `cooks_assistant_whats_wrong`, whose `~chatnpc` lines include the milk, egg and flour line; the hints assertion joins all three hints so ordering within the label does not matter.

- [ ] **Step 6: Commit**

```bash
git add wiki/gen/quests.ts wiki/gen/questNames.ts wiki/gen/quests.test.ts wiki/gen/questNames.test.ts wiki/gen/fixtures
git commit -m "feat(wiki): quest extractor with stages, requirements, rewards and start npc"
```

---

### Task 9: Extract orchestrator, data output, manifest and gaps report

**Files:**
- Create: `wiki/gen/extract.ts`, `wiki/gen/load.ts`, `wiki/gen/gaps.ts`
- Test: `wiki/gen/gaps.test.ts`, `wiki/gen/extract.test.ts` (smoke against the real clone, skipped when `engine/content` is absent)

**Interfaces:**
- Produces: `loadContent(contentDir): ContentFiles` with `{ obj, npc, loc, inv, varp, param, dbtable, dbrow, rs2, jm2, enums: { stat, unlocks }, constants: string[], labels, free2play, multiway }` each a `{ file, text }[]` (paths relative to the content dir, forward slashes); `runExtract(): Manifest` writing `wiki/data/<rev>/{items,npcs,locs,areas,spawns,shops,skills,methods,drops,quests}.json`, `manifest.json`, `gaps.md`; `gapsReport(data): string`; `readData(rev): ExtractedData` for the build step, where `ExtractedData = { items: ItemEntity[]; npcs: NpcEntity[]; locs: LocEntity[]; areas: Area[]; spawns: Spawn[]; shops: ShopEntity[]; skills: SkillEntity[]; methods: Method[]; drops: Drop[]; quests: QuestEntity[]; manifest: Manifest }` (add `ExtractedData` to `types.ts`).

- [ ] **Step 1: Write `wiki/gen/load.ts`**

```ts
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export interface TextFile { file: string; text: string }
export interface ContentFiles {
  obj: TextFile[]; npc: TextFile[]; loc: TextFile[]; inv: TextFile[]; varp: TextFile[]; param: TextFile[];
  dbtable: TextFile[]; dbrow: TextFile[]; rs2: TextFile[]; jm2: TextFile[];
  statEnum: string; unlocksEnum: string; constants: string[]; labels: string; free2play: string; multiway: string;
}

function walk(root: string, sub: string, ext: RegExp): TextFile[] {
  const out: TextFile[] = [];
  for (const rel of readdirSync(path.join(root, sub), { recursive: true }) as string[]) {
    if (!ext.test(rel)) continue;
    const file = `${sub}/${rel.replace(/\\/g, '/')}`;
    out.push({ file, text: readFileSync(path.join(root, file), 'utf8') });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

export function loadContent(root: string): ContentFiles {
  const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
  return {
    obj: walk(root, 'scripts', /\.obj$/), npc: walk(root, 'scripts', /\.npc$/), loc: walk(root, 'scripts', /\.loc$/), inv: walk(root, 'scripts', /\.inv$/),
    varp: walk(root, 'scripts', /\.varp$/), param: walk(root, 'scripts', /\.param$/), dbtable: walk(root, 'scripts', /\.dbtable$/), dbrow: walk(root, 'scripts', /\.dbrow$/),
    rs2: walk(root, 'scripts', /\.rs2$/), jm2: walk(root, 'maps', /\.jm2$/),
    statEnum: read('scripts/player/configs/stat.enum'), unlocksEnum: read('scripts/levelup/configs/levelup_unlocks.enum'),
    constants: walk(root, 'scripts', /\.constant$/).map(f => f.text),
    labels: read('maps/labels.txt'), free2play: read('maps/free2play.csv'), multiway: read('maps/multiway.csv')
  };
}
```

- [ ] **Step 2: Write the failing gaps test `wiki/gen/gaps.test.ts`**

```ts
import { describe, expect, test } from 'bun:test';
import { gapsReport } from './gaps';

describe('gapsReport', () => {
  test('lists quests without a start npc, monsters without drops, items without examine', () => {
    const md = gapsReport({
      quests: [{ name: 'A', slug: 'a', startNpcKey: null, stages: [{ value: 1 }, { value: 2 }], completeValue: 2, rewards: [] }, { name: 'B', slug: 'b', startNpcKey: 'x', stages: [{ value: 5 }], completeValue: 5, rewards: [{ kind: 'xp' }] }],
      npcs: [{ key: 'goblin', name: 'Goblin', stats: { hitpoints: 5 }, slug: 'goblin' }, { key: 'hans', name: 'Hans', stats: null, slug: 'hans' }],
      drops: [],
      items: [{ key: 'worm', name: 'Worm', examine: null, slug: 'worm' }]
    });
    expect(md).toContain('## Quests without a start NPC');
    expect(md).toContain('- [[quest/a]]');
    expect(md).not.toContain('- [[quest/b]]');
    expect(md).toContain('## Quests with no rewards extracted');
    expect(md).toContain('## Monsters without a drop table');
    expect(md).toContain('- [[npc/goblin]]');
    expect(md).not.toContain('[[npc/hans]]');
    expect(md).toContain('## Items without an examine');
    expect(md).toContain('- [[item/worm]]');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd wiki && ~/.bun/bin/bun test gen/gaps.test.ts`
Expected: FAIL, module `./gaps` not found.

- [ ] **Step 4: Write `wiki/gen/gaps.ts`**

```ts
interface GapInput {
  quests: { name: string; slug: string; startNpcKey: string | null; stages: { value: number }[]; completeValue: number; rewards: unknown[] }[];
  npcs: { key: string; name: string; slug: string; stats: unknown | null }[];
  drops: { npcKey: string }[];
  items: { key: string; name: string; slug: string; examine: string | null }[];
}

function section(title: string, rows: string[]): string {
  return rows.length ? `## ${title} (${rows.length})\n\n${rows.map(r => `- ${r}`).join('\n')}\n\n` : `## ${title} (0)\n\n`;
}

export function gapsReport(d: GapInput): string {
  const withDrops = new Set(d.drops.map(x => x.npcKey));
  return '# Wiki gaps\n\nGenerated by `bun run extract`. Work queue for overlays under `wiki/content/`.\n\n'
    + section('Quests without a start NPC', d.quests.filter(q => !q.startNpcKey).map(q => `[[quest/${q.slug}]] ${q.name}`))
    + section('Quests with no rewards extracted', d.quests.filter(q => q.rewards.length === 0).map(q => `[[quest/${q.slug}]] ${q.name}`))
    + section('Quests with a single stage (walkthrough needs an overlay)', d.quests.filter(q => q.stages.length <= 1).map(q => `[[quest/${q.slug}]] ${q.name}`))
    + section('Monsters without a drop table', d.npcs.filter(n => n.stats && !withDrops.has(n.key)).map(n => `[[npc/${n.slug}]] ${n.name}`))
    + section('Items without an examine', d.items.filter(i => !i.examine).map(i => `[[item/${i.slug}]] ${i.name}`));
}
```

- [ ] **Step 5: Write `wiki/gen/extract.ts`**

```ts
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CONTENT, DATA, upstreamShas } from './paths';
import { loadContent } from './load';
import { loadPackIds } from './parse/packIds';
import { parseRs2 } from './parse/rs2';
import { parseDbRows, parseDbTables } from './parse/dbrows';
import { extractItems, loadParamDefaults } from './items';
import { extractNpcs } from './npcs';
import { extractLocs } from './locs';
import { extractAreas } from './areas';
import { extractSpawns } from './maps';
import { extractShops } from './shops';
import { extractMethods, extractSkills } from './skills';
import { extractDrops } from './drops';
import { extractQuests, parseConstants } from './quests';
import { QUEST_NAMES } from './questNames';
import { gapsReport } from './gaps';
import type { ExtractedData, Manifest } from './types';

export const REVISION = 225;

export function runExtract(contentDir = CONTENT, outRoot = DATA): Manifest {
  const c = loadContent(contentDir);
  const objPack = loadPackIds(contentDir, 'obj'), npcPack = loadPackIds(contentDir, 'npc'), locPack = loadPackIds(contentDir, 'loc'), invPack = loadPackIds(contentDir, 'inv');
  const items = extractItems({ objTexts: c.obj, objPack, paramDefaults: loadParamDefaults(c.param.map(p => p.text)) });
  const npcs = extractNpcs({ npcTexts: c.npc, npcPack });
  const locs = extractLocs({ locTexts: c.loc, locPack });
  const areasApi = extractAreas({ labelsText: c.labels, free2playText: c.free2play, multiwayText: c.multiway });
  const spawns = extractSpawns({ jm2Files: c.jm2, npcPack, objPack, locPack, areas: areasApi });
  const blocks = c.rs2.flatMap(f => parseRs2(f.text, f.file));
  const shops = extractShops({ invTexts: c.inv, invPack, npcTexts: c.npc, npcPack, rs2Blocks: blocks, npcSpawns: spawns.filter(s => s.kind === 'npc') });
  const tables = parseDbTables(c.dbtable);
  const rows = parseDbRows(c.dbrow, tables);
  const skills = extractSkills({ statEnumText: c.statEnum, unlocksEnumText: c.unlocksEnum });
  const methods = extractMethods({ rows, tables });
  const drops = extractDrops({ rs2Blocks: blocks, npcs, rows, tables });
  const questFolders = [...new Set(c.rs2.concat(c.varp).map(f => /scripts\/quests\/(quest_[a-z0-9_]+)\//.exec(f.file)?.[1]).filter((x): x is string => !!x))]
    .map(folder => ({ folder, files: c.rs2.concat(c.varp).filter(f => f.file.includes(`/quests/${folder}/`)) }));
  const questNames = new Map(Object.entries(QUEST_NAMES).filter((e): e is [string, string] => e[1] !== null));
  const quests = extractQuests({ questFolders, allBlocks: blocks, constants: parseConstants(c.constants), questNames, npcKeys: new Set(npcPack.byKey.keys()) });
  // NPC configs carry no members flag: an NPC is members-only when every one of its spawns sits in a members zone. Items keep the config flag.
  const npcSpawns = new Map<string, typeof spawns>();
  for (const s of spawns) if (s.kind === 'npc') (npcSpawns.get(s.key) ?? npcSpawns.set(s.key, []).get(s.key)!).push(s);
  for (const n of npcs) { const sp = npcSpawns.get(n.key) ?? []; n.members = sp.length > 0 && sp.every(s => !areasApi.isFree(s.coord)); }

  const { contentSha, engineSha } = upstreamShas();
  const manifest: Manifest = { revision: REVISION, contentSha, engineSha, generatedAt: new Date().toISOString(),
    counts: { items: items.length, npcs: npcs.length, locs: locs.length, areas: areasApi.areas.length, spawns: spawns.length, shops: shops.length, skills: skills.length, methods: methods.length, drops: drops.length, quests: quests.length } };
  const out = path.join(outRoot, String(REVISION));
  mkdirSync(out, { recursive: true });
  const write = (name: string, v: unknown) => writeFileSync(path.join(out, name), JSON.stringify(v, null, 1) + '\n');
  write('items.json', items); write('npcs.json', npcs); write('locs.json', locs); write('areas.json', areasApi.areas); write('spawns.json', spawns);
  write('shops.json', shops); write('skills.json', skills); write('methods.json', methods); write('drops.json', drops); write('quests.json', quests); write('manifest.json', manifest);
  writeFileSync(path.join(out, 'gaps.md'), gapsReport({ quests, npcs, drops, items }));
  return manifest;
}

export function readData(rev = REVISION, root = DATA): ExtractedData {
  const dir = path.join(root, String(rev));
  const r = <T,>(n: string) => JSON.parse(readFileSync(path.join(dir, n), 'utf8')) as T;
  return { items: r('items.json'), npcs: r('npcs.json'), locs: r('locs.json'), areas: r('areas.json'), spawns: r('spawns.json'), shops: r('shops.json'),
    skills: r('skills.json'), methods: r('methods.json'), drops: r('drops.json'), quests: r('quests.json'), manifest: r('manifest.json') };
}

if (import.meta.main) {
  const m = runExtract();
  console.log(`[wiki] extracted rev ${m.revision} @ ${m.contentSha.slice(0, 8)}:`, m.counts);
}
```

Add to `wiki/gen/types.ts`:

```ts
export interface ExtractedData {
  items: ItemEntity[]; npcs: NpcEntity[]; locs: LocEntity[]; areas: Area[]; spawns: Spawn[]; shops: ShopEntity[];
  skills: SkillEntity[]; methods: Method[]; drops: Drop[]; quests: QuestEntity[]; manifest: Manifest;
}
```

- [ ] **Step 6: Write the smoke test `wiki/gen/extract.test.ts`**

```ts
import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CONTENT } from './paths';
import { runExtract } from './extract';

describe.skipIf(!existsSync(path.join(CONTENT, 'pack', 'obj.pack')))('runExtract against the pinned content clone', () => {
  test('produces every entity type in plausible quantities', () => {
    const m = runExtract(CONTENT, mkdtempSync(path.join(tmpdir(), 'wiki-')));
    expect(m.counts.items).toBeGreaterThan(1500);
    expect(m.counts.npcs).toBeGreaterThan(900);
    expect(m.counts.locs).toBeGreaterThan(3000);
    expect(m.counts.quests).toBeGreaterThan(45);
    expect(m.counts.skills).toBe(19);
    expect(m.counts.spawns).toBeGreaterThan(5000);
    expect(m.counts.shops).toBeGreaterThan(50);
    expect(m.counts.drops).toBeGreaterThan(500);
    expect(m.counts.methods).toBeGreaterThan(20);
  }, 120_000);
});
```

- [ ] **Step 7: Run all wiki tests, then the real extraction**

Run: `cd wiki && ~/.bun/bin/bun test && ~/.bun/bin/bun run extract && head -40 data/225/gaps.md && cat data/225/manifest.json`
Expected: PASS; `data/225/*.json` written; the manifest counts match the smoke thresholds. Skim `gaps.md`; a long "Quests with no rewards extracted" list means the completion regex missed a pattern (for example `%varp = ^x_complete;` split across lines or set in a `queue`). Investigate one before moving on and widen the regex if the fix is general.

- [ ] **Step 8: Commit**

```bash
git add wiki/gen wiki/data/225
git commit -m "feat(wiki): extract orchestrator writes data/225 json, manifest and gaps report"
```

---

### Task 10: Page assembly, STYLE.md, and the item and NPC renderers

**Files:**
- Create: `wiki/STYLE.md`, `wiki/gen/render/page.ts`, `wiki/gen/render/infobox.ts`, `wiki/gen/render/links.ts`, `wiki/gen/render/context.ts`, `wiki/gen/render/item.ts`, `wiki/gen/render/npc.ts`
- Test: `wiki/gen/render/page.test.ts`, `wiki/gen/render/item.test.ts`, `wiki/gen/render/npc.test.ts`

**Interfaces:**
- Produces: `RenderContext` (indexes over `ExtractedData`: `itemByKey`, `npcByKey`, `locByKey`, `areaBySlug`, `spawnsByKey`, `dropsByNpc`, `dropsByItem`, `shopsByItem`, `methodsByOutput`, `methodsByInput`, `questsRewarding`, `nameIndex: Map<string, { type; slug }>` over names and aliases); `Section = { heading: string; body: string; meta: SectionMeta; required?: boolean }`; `Draft = { type; slug; title; lead: string; infobox: [string, string][]; sections: Section[]; sources: Source[] }`; `assemble(draft, manifest): Page`; `wl(type, slug, label)` producing `[[type/slug|label]]`; `renderItem(item, ctx): Draft`; `renderNpc(npc, ctx): Draft`; `confidenceOf(sources): Confidence`; `stub(heading)` producing the required-section stub line.

- [ ] **Step 1: Write `wiki/STYLE.md`**

Copy spec section 6 into `wiki/STYLE.md` under the headings "Voice", "Page anatomy", "Templates by page type", "Linking", and add a "Lint" section listing the rule ids from Task 11 (`lead-bold`, `required-sections`, `unresolved-links`, `section-sources`, `second-person`, `overlay-source`, `overlay-dispute`, `denylist`) with one line each on what fails the build. Add the stub sentence verbatim: "No information is recorded for this section yet."

- [ ] **Step 2: Write `wiki/gen/render/links.ts`, `infobox.ts`, `context.ts`**

```ts
// wiki/gen/render/links.ts
import type { EntityType } from '../types';
export const WIKILINK = /\[\[([a-z]+)\/([a-z0-9-]+)\|([^\]]+)\]\]/g;
export function wl(type: EntityType, slug: string, label: string): string { return `[[${type}/${slug}|${label}]]`; }
/** Resolve `[[Name]]` and `[[Name|label]]` by name or alias into typed links; returns unresolved names. */
export function resolveNamedLinks(md: string, nameIndex: Map<string, { type: EntityType; slug: string }>): { md: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const out = md.replace(/\[\[([^\]|/]+)(?:\|([^\]]+))?\]\]/g, (whole, name: string, label?: string) => {
    const hit = nameIndex.get(name.trim().toLowerCase());
    if (!hit) { unresolved.push(name); return whole; }
    return wl(hit.type, hit.slug, label ?? name);
  });
  return { md: out, unresolved };
}
/** Typed links to markdown links; returns the link list for the db. */
export function finalizeLinks(md: string): { md: string; links: { toType: EntityType; toSlug: string }[] } {
  const links: { toType: EntityType; toSlug: string }[] = [];
  const out = md.replace(WIKILINK, (_, t: string, s: string, label: string) => { links.push({ toType: t as EntityType, toSlug: s }); return `[${label}](/wiki/${t}/${s})`; });
  return { md: out, links };
}
```

```ts
// wiki/gen/render/infobox.ts
export function infobox(rows: [string, string | number | boolean | null | undefined][]): string {
  const kept = rows.filter((r): r is [string, string | number | boolean] => r[1] !== null && r[1] !== undefined && r[1] !== '');
  const cell = (v: string | number | boolean) => typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v).replace(/\|/g, '\\|');
  return ['| | |', '|---|---|', ...kept.map(([k, v]) => `| **${k}** | ${cell(v)} |`)].join('\n');
}
export function fmtCoord(c: { x: number; z: number; level: number }): string { return `(${c.x}, ${c.z}, ${c.level})`; }
export function fmtRate(num: number, den: number): string {
  if (den === 0) return 'unknown';
  if (num >= den) return 'Always';
  const g = gcd(num, den);
  return `${num / g}/${den / g} (${((num / den) * 100).toFixed(num / den < 0.01 ? 2 : 1)}%)`;
}
function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }
export function fmtXp(x: number): string { return `${x % 1 === 0 ? x : x.toFixed(1)} xp`; }
```

```ts
// wiki/gen/render/context.ts
import type { Area, Drop, EntityType, ExtractedData, ItemEntity, LocEntity, Method, NpcEntity, QuestEntity, ShopEntity, Spawn } from '../types';

function group<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) { const k = key(r); (m.get(k) ?? m.set(k, []).get(k)!).push(r); }
  return m;
}

export interface RenderContext {
  data: ExtractedData;
  itemByKey: Map<string, ItemEntity>; npcByKey: Map<string, NpcEntity>; locByKey: Map<string, LocEntity>; areaBySlug: Map<string, Area>;
  spawnsByKey: Map<string, Spawn[]>; dropsByNpc: Map<string, Drop[]>; dropsByItem: Map<string, Drop[]>;
  shopsByItem: Map<string, ShopEntity[]>; methodsByOutput: Map<string, Method[]>; methodsByInput: Map<string, Method[]>;
  questsRewarding: Map<string, QuestEntity[]>; questsChecking: Map<string, QuestEntity[]>;
  nameIndex: Map<string, { type: EntityType; slug: string }>;
  itemName(key: string): string; npcName(key: string): string; locName(key: string): string;
}

export function buildContext(data: ExtractedData): RenderContext {
  const itemByKey = new Map(data.items.map(i => [i.key, i]));
  const npcByKey = new Map(data.npcs.map(n => [n.key, n]));
  const locByKey = new Map(data.locs.map(l => [l.key, l]));
  const nameIndex = new Map<string, { type: EntityType; slug: string }>();
  const all: { type: EntityType; slug: string; name: string; aliases: string[] }[] = [...data.items, ...data.npcs, ...data.locs, ...data.quests, ...data.skills, ...data.shops, ...data.areas];
  for (const e of all) for (const n of [e.name, ...e.aliases]) if (!nameIndex.has(n.toLowerCase())) nameIndex.set(n.toLowerCase(), { type: e.type, slug: e.slug });
  const shopsByItem = new Map<string, ShopEntity[]>();
  for (const s of data.shops) for (const st of s.stock) (shopsByItem.get(st.itemKey) ?? shopsByItem.set(st.itemKey, []).get(st.itemKey)!).push(s);
  const methodsByOutput = new Map<string, Method[]>(); const methodsByInput = new Map<string, Method[]>();
  for (const m of data.methods) { for (const o of m.outputs) (methodsByOutput.get(o) ?? methodsByOutput.set(o, []).get(o)!).push(m); for (const i of m.inputs) (methodsByInput.get(i) ?? methodsByInput.set(i, []).get(i)!).push(m); }
  const questsRewarding = new Map<string, QuestEntity[]>(); const questsChecking = new Map<string, QuestEntity[]>();
  for (const q of data.quests) { for (const r of q.rewards) if (r.kind === 'item') (questsRewarding.get(r.key) ?? questsRewarding.set(r.key, []).get(r.key)!).push(q); for (const k of q.itemsChecked) (questsChecking.get(k) ?? questsChecking.set(k, []).get(k)!).push(q); }
  return {
    data, itemByKey, npcByKey, locByKey, areaBySlug: new Map(data.areas.map(a => [a.slug, a])),
    spawnsByKey: group(data.spawns, s => `${s.kind}:${s.key}`), dropsByNpc: group(data.drops, d => d.npcKey), dropsByItem: group(data.drops, d => d.itemKey),
    shopsByItem, methodsByOutput, methodsByInput, questsRewarding, questsChecking, nameIndex,
    itemName: k => itemByKey.get(k)?.name ?? k, npcName: k => npcByKey.get(k)?.name ?? k, locName: k => locByKey.get(k)?.name ?? k
  };
}
```

- [ ] **Step 3: Write the failing page assembly test `wiki/gen/render/page.test.ts`**

```ts
import { describe, expect, test } from 'bun:test';
import { assemble, confidenceOf, stub, type Draft } from './page';
import { wl } from './links';

const manifest = { revision: 225, contentSha: 'abcdef1234567890', engineSha: 'e1dea19f', generatedAt: '2026-09-05T00:00:00Z', counts: {} };

describe('assemble', () => {
  const draft: Draft = {
    type: 'item', slug: 'worm', title: 'Worm', lead: `The **Worm** is a members item found near the ${wl('area', 'tree-gnome-stronghold', 'Tree Gnome Stronghold')}.`,
    infobox: [['Members', 'Yes'], ['Examine', "Ugh! It's wriggling!"]],
    sections: [
      { heading: 'Uses', body: '', meta: { confidence: 'verified', sources: [{ kind: 'content', ref: 'content:a.obj#worm' }] }, required: true },
      { heading: 'Item sources', body: `Dropped by ${wl('npc', 'goblin', 'Goblin')}.`, meta: { confidence: 'derived', sources: [{ kind: 'content', ref: 'content:a.obj#worm' }, { kind: 'derived', ref: 'derived:drops.ts:main' }] }, required: true }
    ],
    sources: [{ kind: 'content', ref: 'content:a.obj#worm' }]
  };
  const page = assemble(draft, manifest);
  test('title, infobox, lead, sections in order, stub for empty required section', () => {
    expect(page.markdown.startsWith('# Worm\n')).toBe(true);
    expect(page.markdown).toContain('| **Members** | Yes |');
    expect(page.markdown.indexOf('The **Worm**')).toBeLessThan(page.markdown.indexOf('## Uses'));
    expect(page.markdown).toContain(`## Uses\n\n${stub('Uses')}`);
    expect(page.markdown.indexOf('## Uses')).toBeLessThan(page.markdown.indexOf('## Item sources'));
  });
  test('wikilinks become site links and are recorded', () => {
    expect(page.markdown).toContain('[Goblin](/wiki/npc/goblin)');
    expect(page.links).toContainEqual({ toType: 'npc', toSlug: 'goblin', relation: 'mentions' });
    expect(page.html).toContain('href="/wiki/npc/goblin"');
  });
  test('sources footer numbered and grouped by section; build footer present', () => {
    expect(page.markdown).toContain('## Sources');
    expect(page.markdown).toContain('content:a.obj#worm');
    expect(page.markdown).toContain('## Build\n\nRevision 225');
    expect(page.markdown).toContain('abcdef12');
  });
  test('section meta kept and confidence derives from the weakest source', () => {
    expect(page.sections['Item sources']!.confidence).toBe('derived');
    expect(confidenceOf([{ kind: 'content', ref: 'x' }, { kind: 'modern', ref: 'y' }])).toBe('modern');
    expect(confidenceOf([])).toBe('editorial');
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `cd wiki && ~/.bun/bin/bun test gen/render/page.test.ts`
Expected: FAIL, module `./page` not found.

- [ ] **Step 5: Write `wiki/gen/render/page.ts`**

```ts
import { marked } from 'marked';
import { finalizeLinks } from './links';
import type { Confidence, EntityType, Manifest, Page, SectionMeta, Source } from '../types';

export interface Section { heading: string; body: string; meta: SectionMeta; required?: boolean }
export interface Draft { type: EntityType; slug: string; title: string; lead: string; infobox: [string, string][]; sections: Section[]; sources: Source[] }

export const STUB = 'No information is recorded for this section yet.';
export function stub(_heading: string): string { return STUB; }

const RANK: Record<Confidence, number> = { verified: 0, derived: 1, period: 2, modern: 3, editorial: 4 };
const KIND_TO_CONF: Record<Source['kind'], Confidence> = { content: 'verified', engine: 'verified', cited: 'verified', derived: 'derived', period: 'period', modern: 'modern', editorial: 'editorial' };
export function confidenceOf(sources: Source[]): Confidence {
  if (sources.length === 0) return 'editorial';
  return sources.map(s => KIND_TO_CONF[s.kind]).reduce((w, c) => (RANK[c] > RANK[w] ? c : w), 'verified');
}

export function section(heading: string, body: string, sources: Source[], required = false): Section {
  return { heading, body, meta: { confidence: confidenceOf(sources), sources }, required };
}

export function assemble(d: Draft, manifest: Manifest): Page {
  const parts: string[] = [`# ${d.title}`, ''];
  if (d.infobox.length) parts.push(['| | |', '|---|---|', ...d.infobox.map(([k, v]) => `| **${k}** | ${v.replace(/\|/g, '\\|')} |`)].join('\n'), '');
  parts.push(d.lead, '');
  const sections: Record<string, SectionMeta> = {};
  const footnotes: string[] = [];
  const noteIndex = new Map<string, number>();
  const ref = (s: Source) => { const key = `${s.kind}:${s.ref}`; let n = noteIndex.get(key); if (!n) { n = footnotes.length + 1; noteIndex.set(key, n); footnotes.push(`${n}. \`${s.ref}\`${s.note ? ` — ${s.note}` : ''}`); } return n; };
  for (const s of d.sections) {
    if (!s.body.trim() && !s.required) continue;
    sections[s.heading] = s.meta;
    const marks = s.meta.sources.map(ref).map(n => `[^${n}]`).join('');
    const badge = s.meta.confidence === 'verified' ? '' : ` *(${s.meta.confidence})*`;
    parts.push(`## ${s.heading}${badge}`, '', (s.body.trim() || STUB) + (marks ? `\n\n${marks}` : ''), '');
  }
  if (footnotes.length) parts.push('## Sources', '', ...footnotes, '');
  parts.push('## Build', '', `Revision ${manifest.revision} · Content ${manifest.contentSha.slice(0, 8)} · Engine ${manifest.engineSha.slice(0, 8)} · generated ${manifest.generatedAt.slice(0, 10)}`, '');
  const { md, links } = finalizeLinks(parts.join('\n'));
  const html = marked.parse(md, { async: false }) as string;
  return { type: d.type, slug: d.slug, title: d.title, lead: d.lead, markdown: md, html, sections, links: links.map(l => ({ ...l, relation: 'mentions' })) };
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd wiki && ~/.bun/bin/bun test gen/render/page.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Write the failing item and NPC renderer tests**

`wiki/gen/render/item.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { renderItem } from './item';
import { buildContext } from './context';
import { axe, data } from './fixture';
 = { type: 'item', id: 1, key: 'bronze_axe', slug: 'bronze-axe', name: 'Bronze axe', members: false, aliases: ['bronze axe'], sources: [{ kind: 'content', ref: 'content:a.obj#bronze_axe' }],
  examine: 'A woodcutters axe.', cost: 16, weightG: 1000, stackable: false, tradeable: true, wearpos: 'righthand', category: null,
  bonuses: { stabAttack: -2, slashAttack: 4, crushAttack: 2, magicAttack: 0, rangeAttack: 0, stabDefence: 0, slashDefence: 1, crushDefence: 0, magicDefence: 0, rangeDefence: 0, strength: 5, prayer: 0, attackRate: 5 },
  levelRequire: [{ skill: 'attack', level: 1 }], highAlch: 9, lowAlch: 6, params: {} };
const goblin: NpcEntity = { type: 'npc', id: 2, key: 'goblin', slug: 'goblin', name: 'Goblin', members: false, aliases: [], sources: [], examine: null, options: ['Attack'], size: 1, vislevel: 2, stats: { hitpoints: 5, attack: 1, strength: 1, defence: 1, ranged: 1, magic: 1 }, combatLevel: 2, respawnTicks: 25, params: {} };
const data: ExtractedData = { items: [axe], npcs: [goblin], locs: [], areas: [{ type: 'area', id: 0, key: 'lumbridge', slug: 'lumbridge', name: 'Lumbridge', members: false, aliases: [], sources: [], coord: { x: 3222, z: 3218, level: 0 }, size: 1, multiway: false }],
  spawns: [{ kind: 'obj', id: 1, key: 'bronze_axe', coord: { x: 3230, z: 3220, level: 0 }, count: 1, area: 'lumbridge', file: 'maps/m50_50.jm2' }],
  shops: [{ type: 'shop', id: 0, key: 'generalshop', slug: 'lumbridge-general-store', name: 'Lumbridge General Store', members: false, aliases: [], sources: [], ownerNpcKeys: [], stock: [{ itemKey: 'bronze_axe', count: 10, restockTicks: 100 }], buysAll: true, restocks: true, coords: [{ x: 3212, z: 3247, level: 0 }] }],
  skills: [], methods: [{ skill: 'woodcutting', level: 1, xp: 25, action: 'Chop normal tree', inputs: ['bronze_axe'], outputs: ['logs'], table: 'woodcutting_trees', row: 'normal_tree_table', sources: [{ kind: 'content', ref: 'content:t.dbrow#normal_tree_table' }] }],
  drops: [{ npcKey: 'goblin', itemKey: 'bronze_axe', min: 1, max: 1, num: 3, den: 128, condition: null, table: 'main', sources: [{ kind: 'derived', ref: 'derived:drops.ts:main' }] }],
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
  test('bonuses and requirements sections for equipment; uses section names the method', () => {
    expect(d.sections.find(s => s.heading === 'Bonuses')!.body).toContain('| Slash | 4 |');
    expect(d.sections.find(s => s.heading === 'Requirements')!.body).toContain('1 [[skill/attack|Attack]]');
    expect(d.sections.find(s => s.heading === 'Uses')!.body).toContain('Chop normal tree');
  });
});
```

`wiki/gen/render/fixture.ts` is the shared render fixture used by this task, Task 12 and the server tests. Create it first with exactly this content:

```ts
import type { ExtractedData, ItemEntity, NpcEntity } from '../types';

export const manifest = { revision: 225, contentSha: 'c', engineSha: 'e', generatedAt: '2026-09-05', counts: {} };
export const axe: ItemEntity = { type: 'item', id: 1, key: 'bronze_axe', slug: 'bronze-axe', name: 'Bronze axe', members: false, aliases: ['bronze axe'], sources: [{ kind: 'content', ref: 'content:a.obj#bronze_axe' }],
  examine: 'A woodcutters axe.', cost: 16, weightG: 1000, stackable: false, tradeable: true, wearpos: 'righthand', category: null,
  bonuses: { stabAttack: -2, slashAttack: 4, crushAttack: 2, magicAttack: 0, rangeAttack: 0, stabDefence: 0, slashDefence: 1, crushDefence: 0, magicDefence: 0, rangeDefence: 0, strength: 5, prayer: 0, attackRate: 5 },
  levelRequire: [{ skill: 'attack', level: 1 }], highAlch: 9, lowAlch: 6, params: {} };
export const goblin: NpcEntity = { type: 'npc', id: 2, key: 'goblin', slug: 'goblin', name: 'Goblin', members: false, aliases: [], sources: [{ kind: 'content', ref: 'content:g.npc#goblin' }], examine: null, options: ['Attack'], size: 1, vislevel: 2, stats: { hitpoints: 5, attack: 1, strength: 1, defence: 1, ranged: 1, magic: 1 }, combatLevel: 2, respawnTicks: 25, params: {} };
export const data: ExtractedData = { items: [axe], npcs: [goblin], locs: [], areas: [{ type: 'area', id: 0, key: 'lumbridge', slug: 'lumbridge', name: 'Lumbridge', members: false, aliases: [], sources: [{ kind: 'content', ref: 'content:maps/labels.txt#Lumbridge' }], coord: { x: 3222, z: 3218, level: 0 }, size: 1, multiway: false }],
  spawns: [
    { kind: 'obj', id: 1, key: 'bronze_axe', coord: { x: 3230, z: 3220, level: 0 }, count: 1, area: 'lumbridge', file: 'maps/m50_50.jm2' },
    { kind: 'npc', id: 2, key: 'goblin', coord: { x: 3245, z: 3240, level: 0 }, count: 3, area: 'lumbridge', file: 'maps/m50_50.jm2' }
  ],
  shops: [{ type: 'shop', id: 0, key: 'generalshop', slug: 'lumbridge-general-store', name: 'Lumbridge General Store', members: false, aliases: [], sources: [{ kind: 'content', ref: 'content:l.inv#generalshop' }], ownerNpcKeys: [], stock: [{ itemKey: 'bronze_axe', count: 10, restockTicks: 100 }], buysAll: true, restocks: true, coords: [{ x: 3212, z: 3247, level: 0 }] }],
  skills: [], methods: [{ skill: 'woodcutting', level: 1, xp: 25, action: 'Chop normal tree', inputs: ['bronze_axe'], outputs: ['logs'], table: 'woodcutting_trees', row: 'normal_tree_table', sources: [{ kind: 'content', ref: 'content:t.dbrow#normal_tree_table' }] }],
  drops: [{ npcKey: 'goblin', itemKey: 'bronze_axe', min: 1, max: 1, num: 3, den: 128, condition: null, table: 'main', sources: [{ kind: 'derived', ref: 'derived:drops.ts:main' }] }],
  quests: [], manifest };
```

`wiki/gen/render/npc.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { renderNpc } from './npc';
import { buildContext } from './context';
import { data, goblin } from './fixture';

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
});
```

- [ ] **Step 8: Run to verify they fail**

Run: `cd wiki && ~/.bun/bin/bun test gen/render/item.test.ts gen/render/npc.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 9: Write `wiki/gen/render/item.ts`**

```ts
import type { ItemEntity, Source } from '../types';
import type { RenderContext } from './context';
import { section, type Draft } from './page';
import { wl } from './links';
import { fmtCoord, fmtRate, fmtXp } from './infobox';

const SLOT: Record<string, string> = { righthand: 'weapon', lefthand: 'shield', hat: 'head', back: 'cape', front: 'neck', torso: 'body', legs: 'legs', hands: 'hands', feet: 'feet', ring: 'ring', quiver: 'ammunition' };

function weight(g: number): string { return g >= 1000 ? `${(g / 1000).toFixed(g % 1000 === 0 ? 0 : 1)} kg` : `${g} g`; }
function skillLink(key: string): string { return wl('skill', key, key.charAt(0).toUpperCase() + key.slice(1)); }

export function renderItem(it: ItemEntity, ctx: RenderContext): Draft {
  const kind = it.wearpos ? `piece of equipment worn in the ${SLOT[it.wearpos] ?? it.wearpos} slot` : it.stackable ? 'stackable item' : 'item';
  const lead = `The **${it.name}** is a${it.members ? ' members-only' : 'n'} ${kind}${it.examine ? `. Its examine text reads "${it.examine}"` : ''}.`;
  const src: Source[] = it.sources;

  const uses: string[] = [];
  for (const m of ctx.methodsByInput.get(it.key) ?? []) uses.push(`- ${m.action} (${skillLink(m.skill)} ${m.level}, ${fmtXp(m.xp)})`);
  for (const q of ctx.questsChecking.get(it.key) ?? []) uses.push(`- Needed during ${wl('quest', q.slug, q.name)}`);
  if (it.wearpos) uses.push(`- Equipped as ${SLOT[it.wearpos] ?? it.wearpos}`);

  const sources: string[] = [];
  const dropSrc: Source[] = [];
  for (const d of [...(ctx.dropsByItem.get(it.key) ?? [])].sort((a, b) => b.num / b.den - a.num / a.den)) {
    const npc = ctx.npcByKey.get(d.npcKey);
    sources.push(`- Dropped by ${npc ? wl('npc', npc.slug, npc.name) : d.npcKey}: ${fmtRate(d.num, d.den)}${d.min === d.max ? (d.min > 1 ? `, ${d.min}` : '') : `, ${d.min}–${d.max}`}${d.condition ? ` (${d.condition})` : ''}`);
    dropSrc.push(...d.sources);
  }
  for (const s of ctx.shopsByItem.get(it.key) ?? []) {
    const st = s.stock.find(x => x.itemKey === it.key)!;
    sources.push(`- Sold by ${wl('shop', s.slug, s.name)} (stock ${st.count})${s.coords[0] ? ` at ${fmtCoord(s.coords[0])}` : ''}`);
  }
  for (const sp of ctx.spawnsByKey.get(`obj:${it.key}`) ?? []) {
    const area = sp.area ? ctx.areaBySlug.get(sp.area) : null;
    sources.push(`- Spawns at ${fmtCoord(sp.coord)}${area ? ` in ${wl('area', area.slug, area.name)}` : ''}${sp.count > 1 ? ` (${sp.count})` : ''}`);
  }
  for (const m of ctx.methodsByOutput.get(it.key) ?? []) sources.push(`- Made by ${m.action} (${skillLink(m.skill)} ${m.level})`);
  for (const q of ctx.questsRewarding.get(it.key) ?? []) sources.push(`- Reward from ${wl('quest', q.slug, q.name)}`);

  const b = it.bonuses;
  const bonuses = b ? [
    '| Attack | | Defence | | Other | |', '|---|---|---|---|---|---|',
    `| Stab | ${b.stabAttack} | Stab | ${b.stabDefence} | Strength | ${b.strength} |`,
    `| Slash | ${b.slashAttack} | Slash | ${b.slashDefence} | Prayer | ${b.prayer} |`,
    `| Crush | ${b.crushAttack} | Crush | ${b.crushDefence} | Attack speed | ${b.attackRate ?? '—'} |`,
    `| Magic | ${b.magicAttack} | Magic | ${b.magicDefence} | | |`,
    `| Range | ${b.rangeAttack} | Range | ${b.rangeDefence} | | |`
  ].join('\n') : '';

  return {
    type: 'item', slug: it.slug, title: it.name, lead,
    infobox: [
      ['Released', '2004 (build 225)'], ['Members', it.members ? 'Yes' : 'No'], ['Tradeable', it.tradeable ? 'Yes' : 'No'], ['Equipable', it.wearpos ? 'Yes' : 'No'],
      ['Stackable', it.stackable ? 'Yes' : 'No'], ['High alchemy', `${it.highAlch} coins`], ['Low alchemy', `${it.lowAlch} coins`], ['Value', `${it.cost} coins`],
      ['Weight', weight(it.weightG)], ['Examine', it.examine ?? '—'], ['Item id', String(it.id)], ['Key', it.key]
    ],
    sections: [
      section('Uses', uses.join('\n'), src, true),
      section('Item sources', sources.join('\n'), [...src, ...dropSrc], true),
      section('Bonuses', bonuses, src),
      section('Requirements', it.levelRequire.map(r => `- ${r.level} ${skillLink(r.skill)}`).join('\n'), [...src, { kind: 'engine', ref: 'engine:content scripts/levelrequire/scripts/levelrequire.rs2', note: 'weapons check attack, armour checks defence' }]),
      section('Changes', '', src), section('Trivia', '', src)
    ],
    sources: src
  };
}
```

- [ ] **Step 10: Write `wiki/gen/render/npc.ts`**

```ts
import type { NpcEntity, Source } from '../types';
import type { RenderContext } from './context';
import { section, type Draft } from './page';
import { wl } from './links';
import { fmtCoord, fmtRate } from './infobox';

export function renderNpc(n: NpcEntity, ctx: RenderContext): Draft {
  const monster = n.stats !== null && n.options.includes('Attack');
  const spawns = ctx.spawnsByKey.get(`npc:${n.key}`) ?? [];
  const areas = [...new Set(spawns.map(s => s.area).filter((a): a is string => !!a))].map(a => ctx.areaBySlug.get(a)).filter((a): a is NonNullable<typeof a> => !!a);
  const where = areas.length ? ` found in ${areas.slice(0, 3).map(a => wl('area', a.slug, a.name)).join(', ')}` : '';
  const lead = monster
    ? `The **${n.name}** is a level ${n.combatLevel} monster${where}.${n.examine ? ` Its examine text reads "${n.examine}".` : ''}`
    : `**${n.name}** is a non-player character${where}.${n.examine ? ` The examine text reads "${n.examine}".` : ''}`;
  const src: Source[] = n.sources;

  const byArea = new Map<string, typeof spawns>();
  for (const s of spawns) (byArea.get(s.area ?? 'unknown') ?? byArea.set(s.area ?? 'unknown', []).get(s.area ?? 'unknown')!).push(s);
  const location = [...byArea.entries()].map(([slug, rows]) => {
    const a = ctx.areaBySlug.get(slug);
    return `- ${a ? wl('area', a.slug, a.name) : 'Unlabelled area'}: ${rows.length} spawn${rows.length === 1 ? '' : 's'}, e.g. ${fmtCoord(rows[0]!.coord)}`;
  }).join('\n');

  const drops = [...(ctx.dropsByNpc.get(n.key) ?? [])].sort((a, b) => b.num / b.den - a.num / a.den);
  const dropSrc = drops.flatMap(d => d.sources);
  const dropRows = drops.map(d => {
    const it = ctx.itemByKey.get(d.itemKey);
    const qty = d.min === d.max ? String(d.min) : `${d.min}–${d.max}`;
    return `| ${it ? wl('item', it.slug, it.name) : d.itemKey} | ${qty} | ${fmtRate(d.num, d.den)} | ${d.condition ?? ''} |`;
  });
  const dropTable = dropRows.length ? ['| Item | Quantity | Rarity | Notes |', '|---|---|---|---|', ...dropRows].join('\n') : '';

  const shops = ctx.data.shops.filter(s => s.ownerNpcKeys.includes(n.key));
  const quests = ctx.data.quests.filter(q => q.startNpcKey === n.key);

  const infobox: [string, string][] = [
    ['Released', '2004 (build 225)'], ['Members', n.members ? 'Yes' : 'No'], ['Options', n.options.join(', ') || '—'], ['Examine', n.examine ?? '—'], ['NPC id', String(n.id)], ['Key', n.key]
  ];
  if (n.stats) infobox.push(['Combat level', String(n.combatLevel ?? '—')], ['Hitpoints', String(n.stats.hitpoints)], ['Attack', String(n.stats.attack)], ['Strength', String(n.stats.strength)], ['Defence', String(n.stats.defence)],
    ['Respawn', n.respawnTicks === null ? '—' : `${n.respawnTicks} ticks (${(n.respawnTicks * 0.6).toFixed(0)} s)`], ['Size', `${n.size}x${n.size}`]);

  const sections = [
    section('Location', location, [...src, { kind: 'content', ref: 'content:maps/*.jm2#NPC' }], true),
    ...(monster ? [section('Drops', dropTable, dropSrc.length ? dropSrc : src, true)] : []),
    section('Quests involved', quests.map(q => `- Starts ${wl('quest', q.slug, q.name)}`).join('\n'), src),
    section('Shop', shops.map(s => `- Runs ${wl('shop', s.slug, s.name)}`).join('\n'), src),
    ...(monster ? [section('Strategy', '', src)] : []),
    section('Trivia', '', src)
  ];
  return { type: 'npc', slug: n.slug, title: n.name, lead, infobox, sections, sources: src };
}
```

- [ ] **Step 11: Run the renderer tests**

Run: `cd wiki && ~/.bun/bin/bun test gen/render`
Expected: PASS. The item test's first `Item sources` assertion compares against the typed link form `[[npc/goblin|Goblin]]` because drafts hold typed links until `assemble` finalizes them.

- [ ] **Step 12: Commit**

```bash
git add wiki/STYLE.md wiki/gen/render
git commit -m "feat(wiki): page assembly with sources footer, style guide, item and npc renderers"
```

---

### Task 11: Remaining renderers, overlays, lint

**Files:**
- Create: `wiki/gen/render/loc.ts`, `wiki/gen/render/quest.ts`, `wiki/gen/render/skill.ts`, `wiki/gen/render/shop.ts`, `wiki/gen/render/area.ts`, `wiki/gen/render/overlay.ts`, `wiki/gen/render/index.ts`, `wiki/gen/lint.ts`, `wiki/gen/denylist.txt` (empty, one sentence per line)
- Test: `wiki/gen/render/overlay.test.ts`, `wiki/gen/render/quest.test.ts`, `wiki/gen/lint.test.ts`

**Interfaces:**
- Produces: `renderLoc`, `renderQuest`, `renderSkill`, `renderShop`, `renderArea` each `(entity, ctx): Draft`; `parseOverlay(text, file): Overlay` with `Overlay = { file: string; type: EntityType; key: string; infobox: Record<string, string>; sources: Record<string, string>; disputes: string | null; sections: { heading: string; body: string; sources: string[] }[]; standalone?: { slug: string; title: string; lead: string } }`; `applyOverlay(draft, overlay, nameIndex): { draft: Draft; problems: LintProblem[] }`; `renderAll(data, overlays): { pages: Page[]; problems: LintProblem[] }`; `lintPages(pages, drafts, denylist): LintProblem[]` with `LintProblem = { rule: string; page: string; message: string; level: 'error' | 'warn' }`.

- [ ] **Step 1: Write `renderLoc`, `renderShop`, `renderArea`, `renderSkill`**

```ts
// wiki/gen/render/loc.ts
import type { LocEntity } from '../types';
import type { RenderContext } from './context';
import { section, type Draft } from './page';
import { wl } from './links';
import { fmtCoord } from './infobox';

export function renderLoc(l: LocEntity, ctx: RenderContext): Draft {
  const spawns = ctx.spawnsByKey.get(`loc:${l.key}`) ?? [];
  const lead = `The **${l.name}** is a piece of scenery${l.options.length ? ` with the option${l.options.length > 1 ? 's' : ''} ${l.options.map(o => `"${o}"`).join(', ')}` : ''}.${l.examine ? ` Its examine text reads "${l.examine}".` : ''}`;
  const byArea = new Map<string, number>();
  for (const s of spawns) byArea.set(s.area ?? 'unknown', (byArea.get(s.area ?? 'unknown') ?? 0) + 1);
  const locations = [...byArea.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([slug, n]) => { const a = ctx.areaBySlug.get(slug); return `- ${a ? wl('area', a.slug, a.name) : 'Unlabelled area'}: ${n}`; }).join('\n');
  const uses = (ctx.methodsByInput.get(l.key) ?? []).map(m => `- ${m.action} (${wl('skill', m.skill, m.skill)} ${m.level})`).join('\n');
  return { type: 'loc', slug: l.slug, title: l.name, lead,
    infobox: [['Options', l.options.join(', ') || '—'], ['Examine', l.examine ?? '—'], ['Size', `${l.width}x${l.length}`], ['Placements', String(spawns.length)], ['Object id', String(l.id)], ['Key', l.key]],
    sections: [section('Uses', uses, l.sources, true), section('Locations', locations || (spawns[0] ? `- ${fmtCoord(spawns[0].coord)}` : ''), [...l.sources, { kind: 'content', ref: 'content:maps/*.jm2#LOC' }]), section('Trivia', '', l.sources)],
    sources: l.sources };
}
```

```ts
// wiki/gen/render/shop.ts
import type { ShopEntity } from '../types';
import type { RenderContext } from './context';
import { section, type Draft } from './page';
import { wl } from './links';
import { fmtCoord } from './infobox';

export function renderShop(s: ShopEntity, ctx: RenderContext): Draft {
  const owners = s.ownerNpcKeys.map(k => ctx.npcByKey.get(k)).filter((n): n is NonNullable<typeof n> => !!n);
  const area = s.coords[0] ? ctx.data.areas.find(a => Math.hypot(a.coord.x - s.coords[0]!.x, a.coord.z - s.coords[0]!.z) < 120) : undefined;
  const lead = `**${s.name}** is a shop${owners.length ? ` run by ${owners.map(o => wl('npc', o.slug, o.name)).join(' and ')}` : ''}${area ? ` in ${wl('area', area.slug, area.name)}` : ''}. It ${s.buysAll ? 'buys any tradeable item' : 'buys only items it stocks'} and ${s.restocks ? 'restocks over time' : 'does not restock'}.`;
  const rows = s.stock.map(st => { const it = ctx.itemByKey.get(st.itemKey); return `| ${it ? wl('item', it.slug, it.name) : st.itemKey} | ${st.count} | ${it ? `${it.cost} coins` : '—'} |`; });
  return { type: 'shop', slug: s.slug, title: s.name, lead,
    infobox: [['Owner', owners.map(o => o.name).join(', ') || '—'], ['Location', s.coords[0] ? fmtCoord(s.coords[0]) : '—'], ['Buys from players', s.buysAll ? 'Any item' : 'Stocked items'], ['Restocks', s.restocks ? 'Yes' : 'No'], ['Key', s.key]],
    sections: [section('Stock', rows.length ? ['| Item | Base stock | Base value |', '|---|---|---|', ...rows].join('\n') : '', s.sources, true), section('Location', s.coords.map(c => `- ${fmtCoord(c)}`).join('\n'), s.sources)],
    sources: s.sources };
}
```

```ts
// wiki/gen/render/area.ts
import type { Area } from '../types';
import type { RenderContext } from './context';
import { section, type Draft } from './page';
import { wl } from './links';

const FEATURE_KEYS: [string, RegExp][] = [['Banks', /bank/i], ['Anvils', /^anvil/i], ['Furnaces', /furnace/i], ['Ranges', /^range$|stove|cooking range/i], ['Altars', /altar/i], ['Trees', /tree/i], ['Rocks', /rock/i], ['Fishing spots', /fishing/i]];

export function renderArea(a: Area, ctx: RenderContext): Draft {
  const here = ctx.data.spawns.filter(s => s.area === a.slug);
  const lead = `**${a.name}** is a${a.members ? ' members-only' : ' free-to-play'} area of the world map${a.multiway ? ' in a multi-combat zone' : ''}, centred on (${a.coord.x}, ${a.coord.z}).`;
  const features: string[] = [];
  for (const [label, re] of FEATURE_KEYS) {
    const locs = new Map<string, number>();
    for (const s of here) if (s.kind === 'loc') { const l = ctx.locByKey.get(s.key); if (l && re.test(l.name)) locs.set(l.slug, (locs.get(l.slug) ?? 0) + 1); }
    if (locs.size) features.push(`- ${label}: ${[...locs.entries()].map(([slug, n]) => `${wl('loc', slug, ctx.data.locs.find(l => l.slug === slug)!.name)} (${n})`).join(', ')}`);
  }
  const shops = ctx.data.shops.filter(s => s.coords.some(c => Math.hypot(c.x - a.coord.x, c.z - a.coord.z) < 120));
  if (shops.length) features.push(`- Shops: ${shops.map(s => wl('shop', s.slug, s.name)).join(', ')}`);
  const quests = ctx.data.quests.filter(q => q.startNpcKey && here.some(s => s.kind === 'npc' && s.key === q.startNpcKey));
  if (quests.length) features.push(`- Quest starts: ${quests.map(q => wl('quest', q.slug, q.name)).join(', ')}`);
  const npcs = new Map<string, number>(); for (const s of here) if (s.kind === 'npc') npcs.set(s.key, (npcs.get(s.key) ?? 0) + 1);
  const list = (pred: (k: string) => boolean) => [...npcs.entries()].filter(([k]) => pred(k)).map(([k, n]) => { const e = ctx.npcByKey.get(k)!; return `- ${wl('npc', e.slug, e.name)}${n > 1 ? ` (${n})` : ''}`; }).join('\n');
  return { type: 'area', slug: a.slug, title: a.name, lead,
    infobox: [['Members', a.members ? 'Yes' : 'No'], ['Multi-combat', a.multiway ? 'Yes' : 'No'], ['Map label', a.name], ['Coordinates', `(${a.coord.x}, ${a.coord.z}, 0)`]],
    sections: [section('Features', features.join('\n'), [...a.sources, { kind: 'derived', ref: 'derived:areas.ts:nearestArea', note: 'spawns attributed to the nearest label' }], true),
      section('NPCs', list(k => !ctx.npcByKey.get(k)?.options.includes('Attack')), a.sources), section('Monsters', list(k => !!ctx.npcByKey.get(k)?.options.includes('Attack')), a.sources), section('Trivia', '', a.sources)],
    sources: a.sources };
}
```

```ts
// wiki/gen/render/skill.ts
import type { SkillEntity } from '../types';
import type { RenderContext } from './context';
import { section, type Draft } from './page';
import { wl } from './links';
import { fmtXp } from './infobox';
import { xpForLevel } from '../skills';

export function renderSkill(s: SkillEntity, ctx: RenderContext): Draft {
  const methods = ctx.data.methods.filter(m => m.skill === s.key).sort((a, b) => a.level - b.level || a.xp - b.xp);
  const rows = methods.map(m => `| ${m.level} | ${m.action} | ${fmtXp(m.xp)} | ${m.inputs.map(k => ctx.itemByKey.get(k) ? wl('item', ctx.itemByKey.get(k)!.slug, ctx.itemByKey.get(k)!.name) : ctx.locByKey.get(k) ? wl('loc', ctx.locByKey.get(k)!.slug, ctx.locByKey.get(k)!.name) : k).join(', ')} | ${m.outputs.map(k => ctx.itemByKey.get(k) ? wl('item', ctx.itemByKey.get(k)!.slug, ctx.itemByKey.get(k)!.name) : k).join(', ')} |`);
  const quests = ctx.data.quests.filter(q => q.rewards.some(r => r.kind === 'xp' && r.key === s.key)).map(q => `- ${wl('quest', q.slug, q.name)}: ${fmtXp(q.rewards.find(r => r.kind === 'xp' && r.key === s.key)!.amount)}`);
  const lead = `**${s.name}** is a${s.members ? ' members-only' : ' free-to-play'} skill. Level 99 requires ${xpForLevel(99).toLocaleString('en-GB')} experience.`;
  return { type: 'skill', slug: s.slug, title: s.name, lead,
    infobox: [['Members', s.members ? 'Yes' : 'No'], ['Skill id', String(s.index)], ['Level 99', `${xpForLevel(99).toLocaleString('en-GB')} xp`]],
    sections: [section('Mechanics', '', s.sources), section('Training', rows.length ? ['| Level | Action | Experience | Inputs | Outputs |', '|---|---|---|---|---|', ...rows].join('\n') : '', methods.flatMap(m => m.sources).concat(s.sources), true),
      section('Quests giving experience', quests.join('\n'), s.sources), section('Level-up unlocks', s.unlocks.map(l => `- Level ${l}`).join('\n'), s.sources), section('Trivia', '', s.sources)],
    sources: s.sources };
}
```

- [ ] **Step 2: Write the failing quest renderer test `wiki/gen/render/quest.test.ts`**

```ts
import { describe, expect, test } from 'bun:test';
import { renderQuest } from './quest';
import { buildContext } from './context';
import { data } from './fixture';
import type { QuestEntity } from '../types';

const cook: QuestEntity = { type: 'quest', id: 0, key: 'quest_cook', slug: 'cooks-assistant', name: "Cook's Assistant", members: false, aliases: [], sources: [{ kind: 'content', ref: 'content:scripts/quests/quest_cook' }],
  folder: 'quest_cook', varp: 'cookquest', completeValue: 2, questPoints: 1, startNpcKey: 'goblin',
  stages: [{ value: 1, label: 'cooks_assistant_whats_wrong', hints: ['I need milk, an egg and flour.'] }, { value: 2, label: 'cooks_quest_complete', hints: [] }],
  requirements: [], itemsChecked: ['bronze_axe'], rewards: [{ kind: 'xp', key: 'cooking', amount: 300 }, { kind: 'questpoints', key: 'questpoints', amount: 1 }] };

describe('renderQuest', () => {
  const d = renderQuest(cook, buildContext({ ...data, quests: [cook] }));
  test('lead, infobox start point and quest points', () => {
    expect(d.lead).toMatch(/^\*\*Cook's Assistant\*\* is a free-to-play quest/);
    expect(d.infobox).toContainEqual(['Start point', 'Talk to [[npc/goblin|Goblin]]']);
    expect(d.infobox).toContainEqual(['Quest points', '1']);
    expect(d.infobox).toContainEqual(['Items required', '[[item/bronze-axe|Bronze axe]]']);
  });
  test('walkthrough numbered by stage with hints; rewards listed', () => {
    const w = d.sections.find(s => s.heading === 'Walkthrough')!;
    expect(w.body).toContain('1. Stage 1');
    expect(w.body).toContain('I need milk, an egg and flour.');
    expect(w.meta.confidence).toBe('derived');
    expect(d.sections.find(s => s.heading === 'Rewards')!.body).toContain('300 xp');
  });
});
```

- [ ] **Step 3: Run to verify it fails, then write `wiki/gen/render/quest.ts`**

Run: `cd wiki && ~/.bun/bin/bun test gen/render/quest.test.ts` → FAIL.

```ts
import type { QuestEntity } from '../types';
import type { RenderContext } from './context';
import { section, type Draft } from './page';
import { wl } from './links';
import { fmtXp } from './infobox';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function renderQuest(q: QuestEntity, ctx: RenderContext): Draft {
  const start = q.startNpcKey ? ctx.npcByKey.get(q.startNpcKey) : undefined;
  const items = q.itemsChecked.map(k => ctx.itemByKey.get(k)).filter((i): i is NonNullable<typeof i> => !!i);
  const reqs = q.requirements.map(r => r.kind === 'skill' ? `${r.value} ${wl('skill', r.key, cap(r.key))}` : r.kind === 'quest' ? (ctx.data.quests.find(x => x.varp.startsWith(r.key)) ? wl('quest', ctx.data.quests.find(x => x.varp.startsWith(r.key))!.slug, ctx.data.quests.find(x => x.varp.startsWith(r.key))!.name) : r.key) : `${r.value} ${r.kind}`);
  const lead = `**${q.name}** is a${q.members ? ' members' : ' free-to-play'} quest${start ? ` started by talking to ${wl('npc', start.slug, start.name)}` : ''}. It awards ${q.questPoints ?? 'an unknown number of'} quest point${q.questPoints === 1 ? '' : 's'}.`;
  const walkthrough = q.stages.map((s, i) => `${i + 1}. Stage ${s.value}${s.value === q.completeValue ? ' (complete)' : ''} is reached in script label \`${s.label}\`.${s.hints.length ? ` The dialogue includes: "${s.hints.join('" / "')}"` : ''}`).join('\n');
  const rewards = q.rewards.map(r => r.kind === 'xp' ? `- ${fmtXp(r.amount)} ${wl('skill', r.key, cap(r.key))}` : r.kind === 'item' ? `- ${r.amount} × ${ctx.itemByKey.get(r.key) ? wl('item', ctx.itemByKey.get(r.key)!.slug, ctx.itemByKey.get(r.key)!.name) : r.key}` : `- ${r.amount} quest point${r.amount === 1 ? '' : 's'}`).join('\n');
  const requiredFor = ctx.data.quests.filter(o => o.requirements.some(r => r.kind === 'quest' && q.varp.startsWith(r.key))).map(o => `- ${wl('quest', o.slug, o.name)}`).join('\n');
  const derived = [...q.sources, { kind: 'derived' as const, ref: 'derived:quests.ts:progression' }];
  return { type: 'quest', slug: q.slug, title: q.name, lead,
    infobox: [['Members', q.members ? 'Yes' : 'No'], ['Start point', start ? `Talk to ${wl('npc', start.slug, start.name)}` : '—'], ['Requirements', reqs.join(', ') || 'None'], ['Items required', items.map(i => wl('item', i.slug, i.name)).join(', ') || 'None'], ['Quest points', q.questPoints === null ? '—' : String(q.questPoints)], ['Progress varp', q.varp]],
    sections: [section('Walkthrough', walkthrough, derived, true), section('Rewards', rewards, derived, true), section('Required for completing', requiredFor, derived), section('Trivia', '', q.sources)],
    sources: q.sources };
}
```

Run again → PASS.

- [ ] **Step 4: Write the failing overlay test `wiki/gen/render/overlay.test.ts`**

```ts
import { describe, expect, test } from 'bun:test';
import { applyOverlay, parseOverlay } from './overlay';
import type { Draft } from './page';

const OVERLAY = `---
type: quest
key: quest_cook
infobox:
  Length: Very short
  Difficulty: Novice
sources:
  Length: editorial:cs:2026-09-05
---
## Walkthrough

1. Talk to the [[Goblin]] in the castle kitchen. <!-- src: content:scripts/quests/quest_cook -->
2. Bring the three items back.

## Trivia

The quest is the first most players finish. <!-- src: editorial:cs:2026-09-05 -->
`;

const draft: Draft = { type: 'quest', slug: 'cooks-assistant', title: "Cook's Assistant", lead: '**x**', infobox: [['Members', 'No']],
  sections: [{ heading: 'Walkthrough', body: 'generated', meta: { confidence: 'derived', sources: [{ kind: 'derived', ref: 'd' }] }, required: true }, { heading: 'Rewards', body: 'r', meta: { confidence: 'verified', sources: [{ kind: 'content', ref: 'c' }] }, required: true }, { heading: 'Trivia', body: '', meta: { confidence: 'verified', sources: [] } }],
  sources: [] };

describe('overlay', () => {
  const ov = parseOverlay(OVERLAY, 'content/quests/cooks-assistant.md');
  test('frontmatter and sections parse; inline src comments become section sources', () => {
    expect(ov.type).toBe('quest'); expect(ov.key).toBe('quest_cook');
    expect(ov.infobox).toEqual({ Length: 'Very short', Difficulty: 'Novice' });
    expect(ov.sections.map(s => s.heading)).toEqual(['Walkthrough', 'Trivia']);
    expect(ov.sections[0]!.sources).toEqual(['content:scripts/quests/quest_cook']);
  });
  test('sections replace by heading, extras appended, infobox rows added with a source, unsourced row is a problem', () => {
    const { draft: d, problems } = applyOverlay(draft, ov, new Map([['goblin', { type: 'npc', slug: 'goblin' }]]));
    expect(d.sections.find(s => s.heading === 'Walkthrough')!.body).toContain('[[npc/goblin|Goblin]]');
    expect(d.sections.find(s => s.heading === 'Walkthrough')!.meta.sources).toContainEqual({ kind: 'content', ref: 'scripts/quests/quest_cook' });
    expect(d.sections.find(s => s.heading === 'Rewards')!.body).toBe('r');
    expect(d.sections.find(s => s.heading === 'Trivia')!.meta.confidence).toBe('editorial');
    expect(d.infobox).toContainEqual(['Length', 'Very short']);
    expect(problems).toContainEqual(expect.objectContaining({ rule: 'overlay-source', message: expect.stringContaining('Difficulty') }));
  });
  test('an infobox override that disagrees with generated data needs disputes', () => {
    const ov2 = parseOverlay('---\ntype: quest\nkey: quest_cook\ninfobox:\n  Members: Yes\nsources:\n  Members: modern:https://oldschool.runescape.wiki/w/Cook%27s_Assistant\n---\n', 'f.md');
    expect(applyOverlay(draft, ov2, new Map()).problems).toContainEqual(expect.objectContaining({ rule: 'overlay-dispute' }));
    const ov3 = parseOverlay('---\ntype: quest\nkey: quest_cook\ndisputes: content\ninfobox:\n  Members: Yes\nsources:\n  Members: period:https://web.archive.org/x\n---\n', 'f.md');
    expect(applyOverlay(draft, ov3, new Map()).problems.filter(p => p.rule === 'overlay-dispute')).toEqual([]);
  });
});
```

- [ ] **Step 5: Run to verify it fails, then write `wiki/gen/render/overlay.ts`**

```ts
import type { EntityType, Source } from '../types';
import { confidenceOf, type Draft, type Section } from './page';
import { resolveNamedLinks } from './links';

export interface LintProblem { rule: string; page: string; message: string; level: 'error' | 'warn' }
export interface OverlaySection { heading: string; body: string; sources: string[] }
export interface Overlay { file: string; type: EntityType; key: string; infobox: Record<string, string>; sources: Record<string, string>; disputes: string | null; sections: OverlaySection[]; standalone?: { slug: string; title: string; lead: string } }

/** Minimal front matter: `key: value` lines and one level of two-space-indented maps. */
function parseFrontmatter(text: string): Record<string, string | Record<string, string>> {
  const out: Record<string, string | Record<string, string>> = {};
  let map: Record<string, string> | null = null;
  for (const line of text.split(/\r?\n/)) {
    const nested = /^  ([^:]+):\s*(.*)$/.exec(line);
    if (nested && map) { map[nested[1]!.trim()] = nested[2]!.trim(); continue; }
    const top = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (!top) continue;
    if (top[2] === '') { map = {}; out[top[1]!] = map; } else { map = null; out[top[1]!] = top[2]!.trim(); }
  }
  return out;
}

const SRC_COMMENT = /<!--\s*src:\s*([^\s>]+)\s*-->/g;

export function parseOverlay(text: string, file: string): Overlay {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!fm) throw new Error(`${file}: missing front matter`);
  const meta = parseFrontmatter(fm[1]!);
  const str = (k: string) => (typeof meta[k] === 'string' ? (meta[k] as string) : undefined);
  const rec = (k: string) => (typeof meta[k] === 'object' ? (meta[k] as Record<string, string>) : {});
  const sections: OverlaySection[] = [];
  let cur: OverlaySection | null = null;
  for (const line of fm[2]!.split(/\r?\n/)) {
    const h = /^## (.+)$/.exec(line);
    if (h) { cur = { heading: h[1]!.trim(), body: '', sources: [] }; sections.push(cur); continue; }
    if (!cur) continue;
    for (const m of line.matchAll(SRC_COMMENT)) cur.sources.push(m[1]!);
    cur.body += (cur.body ? '\n' : '') + line.replace(SRC_COMMENT, '').replace(/\s+$/, '');
  }
  const standalone = str('slug') && str('title') ? { slug: str('slug')!, title: str('title')!, lead: str('lead') ?? '' } : undefined;
  return { file, type: str('type') as EntityType, key: str('key') ?? str('slug') ?? '', infobox: rec('infobox'), sources: rec('sources'), disputes: str('disputes') ?? null, sections, standalone };
}

export function toSource(ref: string): Source {
  const c = ref.indexOf(':');
  const kind = (c > 0 ? ref.slice(0, c) : 'editorial') as Source['kind'];
  return ['content', 'engine', 'derived', 'cited', 'period', 'modern', 'editorial'].includes(kind) ? { kind, ref: ref.slice(c + 1) } : { kind: 'editorial', ref };
}

export function applyOverlay(draft: Draft, ov: Overlay, nameIndex: Map<string, { type: EntityType; slug: string }>): { draft: Draft; problems: LintProblem[] } {
  const problems: LintProblem[] = [];
  const page = `${draft.type}/${draft.slug}`;
  const infobox = [...draft.infobox];
  for (const [k, v] of Object.entries(ov.infobox)) {
    const srcRef = ov.sources[k];
    if (!srcRef) problems.push({ rule: 'overlay-source', page, message: `infobox row "${k}" has no source in ${ov.file}`, level: 'error' });
    const i = infobox.findIndex(r => r[0] === k);
    if (i >= 0 && infobox[i]![1] !== v && ov.disputes !== 'content') problems.push({ rule: 'overlay-dispute', page, message: `infobox "${k}" is "${infobox[i]![1]}" in data but "${v}" in ${ov.file}; add "disputes: content" with a reason to override`, level: 'error' });
    if (i >= 0) { if (ov.disputes === 'content') infobox[i] = [k, v]; } else infobox.push([k, v]);
  }
  const sections: Section[] = [...draft.sections];
  for (const os of ov.sections) {
    const { md, unresolved } = resolveNamedLinks(os.body.trim(), nameIndex);
    for (const u of unresolved) problems.push({ rule: 'unresolved-links', page, message: `[[${u}]] in ${ov.file} does not match any entity name or alias`, level: 'error' });
    const sources = os.sources.map(toSource);
    const i = sections.findIndex(s => s.heading === os.heading);
    const sec: Section = { heading: os.heading, body: md, meta: { confidence: confidenceOf(sources), sources }, required: i >= 0 ? sections[i]!.required : false };
    if (i >= 0) sections[i] = sec; else sections.splice(Math.max(sections.length - 1, 0), 0, sec); // before Trivia when present
  }
  return { draft: { ...draft, infobox, sections }, problems };
}
```

Run: `cd wiki && ~/.bun/bin/bun test gen/render/overlay.test.ts` → PASS.

- [ ] **Step 6: Write `wiki/gen/render/index.ts`**

```ts
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { ExtractedData, Page } from '../types';
import { buildContext } from './context';
import { assemble, type Draft } from './page';
import { renderItem } from './item'; import { renderNpc } from './npc'; import { renderLoc } from './loc'; import { renderQuest } from './quest';
import { renderSkill } from './skill'; import { renderShop } from './shop'; import { renderArea } from './area';
import { applyOverlay, parseOverlay, toSource, type LintProblem, type Overlay } from './overlay';
import { resolveNamedLinks } from './links';
import { confidenceOf } from './page';

export function loadOverlays(dir: string): Overlay[] {
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true }) as string[]).filter(f => f.endsWith('.md')).sort()
    .map(f => parseOverlay(readFileSync(path.join(dir, f), 'utf8'), `content/${f.replace(/\\/g, '/')}`));
}

export function renderAll(data: ExtractedData, overlays: Overlay[]): { pages: Page[]; drafts: Draft[]; problems: LintProblem[] } {
  const ctx = buildContext(data);
  const problems: LintProblem[] = [];
  const byKey = new Map(overlays.filter(o => !o.standalone).map(o => [`${o.type}:${o.key}`, o]));
  const drafts: Draft[] = [
    ...data.items.map(e => renderItem(e, ctx)), ...data.npcs.map(e => renderNpc(e, ctx)), ...data.locs.map(e => renderLoc(e, ctx)),
    ...data.quests.map(e => renderQuest(e, ctx)), ...data.skills.map(e => renderSkill(e, ctx)), ...data.shops.map(e => renderShop(e, ctx)), ...data.areas.map(e => renderArea(e, ctx))
  ];
  const keyOf = new Map<string, string>();
  for (const list of [data.items, data.npcs, data.locs, data.quests, data.skills, data.shops, data.areas]) for (const e of list) keyOf.set(`${e.type}/${e.slug}`, `${e.type}:${e.key}`);
  const final: Draft[] = drafts.map(d => {
    const ov = byKey.get(keyOf.get(`${d.type}/${d.slug}`) ?? '');
    if (!ov) return d;
    const r = applyOverlay(d, ov, ctx.nameIndex);
    problems.push(...r.problems);
    return r.draft;
  });
  for (const ov of overlays.filter(o => o.standalone)) {
    const { md, unresolved } = resolveNamedLinks(ov.standalone!.lead, ctx.nameIndex);
    for (const u of unresolved) problems.push({ rule: 'unresolved-links', page: `${ov.type}/${ov.standalone!.slug}`, message: `[[${u}]] in ${ov.file}`, level: 'error' });
    const sections = ov.sections.map(s => { const r = resolveNamedLinks(s.body.trim(), ctx.nameIndex); for (const u of r.unresolved) problems.push({ rule: 'unresolved-links', page: `${ov.type}/${ov.standalone!.slug}`, message: `[[${u}]] in ${ov.file}`, level: 'error' }); const sources = s.sources.map(toSource); return { heading: s.heading, body: r.md, meta: { confidence: confidenceOf(sources), sources } }; });
    final.push({ type: ov.type, slug: ov.standalone!.slug, title: ov.standalone!.title, lead: md, infobox: Object.entries(ov.infobox), sections, sources: Object.values(ov.sources).map(toSource) });
  }
  return { pages: final.map(d => assemble(d, data.manifest)), drafts: final, problems };
}
```

- [ ] **Step 7: Write the failing lint test `wiki/gen/lint.test.ts`**

```ts
import { describe, expect, test } from 'bun:test';
import { lintPages } from './lint';
import { assemble, type Draft } from './render/page';

const manifest = { revision: 225, contentSha: 'c', engineSha: 'e', generatedAt: '2026', counts: {} };
const ok: Draft = { type: 'item', slug: 'a', title: 'A', lead: 'The **A** is an item.', infobox: [], sources: [],
  sections: [{ heading: 'Uses', body: 'Used for things.', meta: { confidence: 'verified', sources: [{ kind: 'content', ref: 'x' }] }, required: true }, { heading: 'Item sources', body: 'None known.', meta: { confidence: 'verified', sources: [{ kind: 'content', ref: 'x' }] }, required: true }] };

describe('lintPages', () => {
  test('a well-formed page has no problems', () => {
    expect(lintPages([assemble(ok, manifest)], [ok], [])).toEqual([]);
  });
  test('lead must bold the title', () => {
    const d = { ...ok, lead: 'A is an item.' };
    expect(lintPages([assemble(d, manifest)], [d], []).map(p => p.rule)).toContain('lead-bold');
  });
  test('sections need sources; second person flagged outside guides and walkthroughs', () => {
    const d: Draft = { ...ok, sections: [{ heading: 'Uses', body: 'You can use it.', meta: { confidence: 'editorial', sources: [] }, required: true }, ok.sections[1]!] };
    const rules = lintPages([assemble(d, manifest)], [d], []).map(p => p.rule);
    expect(rules).toContain('section-sources');
    expect(rules).toContain('second-person');
    const g: Draft = { ...d, type: 'guide' };
    expect(lintPages([assemble(g, manifest)], [g], []).map(p => p.rule)).not.toContain('second-person');
  });
  test('unresolved wikilinks and denylist sentences fail', () => {
    const d: Draft = { ...ok, sections: [{ ...ok.sections[0]!, body: 'See [[Nothing Here]] for the copied sentence that must never appear in this corpus at all.' }, ok.sections[1]!] };
    const rules = lintPages([assemble(d, manifest)], [d], ['the copied sentence that must never appear in this corpus at all']).map(p => p.rule);
    expect(rules).toContain('unresolved-links');
    expect(rules).toContain('denylist');
  });
  test('required stubs are warnings, not errors', () => {
    const d: Draft = { ...ok, sections: [{ ...ok.sections[0]!, body: '' }, ok.sections[1]!] };
    const p = lintPages([assemble(d, manifest)], [d], []).find(x => x.rule === 'required-sections')!;
    expect(p.level).toBe('warn');
  });
});
```

- [ ] **Step 8: Run to verify it fails, then write `wiki/gen/lint.ts`**

```ts
import type { Page } from './types';
import type { Draft } from './render/page';
import type { LintProblem } from './render/overlay';

const SECOND_PERSON = /\b(you|your|you're|yourself)\b/i;
const SECOND_PERSON_OK = new Set(['Walkthrough', 'Strategy']);

export function lintPages(pages: Page[], drafts: Draft[], denylist: string[]): LintProblem[] {
  const out: LintProblem[] = [];
  const deny = denylist.map(s => s.trim().toLowerCase()).filter(s => s.split(/\s+/).length >= 12);
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!, d = drafts[i]!;
    const id = `${page.type}/${page.slug}`;
    const push = (rule: string, message: string, level: 'error' | 'warn' = 'error') => out.push({ rule, page: id, message, level });
    if (!page.lead.includes(`**${page.title}**`)) push('lead-bold', 'lead does not bold the page title');
    for (const s of d.sections) {
      if (s.required && !s.body.trim()) push('required-sections', `required section "${s.heading}" is a stub`, 'warn');
      if (s.body.trim() && s.meta.sources.length === 0) push('section-sources', `section "${s.heading}" has no sources`);
      if (d.type !== 'guide' && !SECOND_PERSON_OK.has(s.heading) && SECOND_PERSON.test(s.body)) push('second-person', `section "${s.heading}" addresses the reader`);
    }
    if (d.type !== 'guide' && SECOND_PERSON.test(page.lead)) push('second-person', 'lead addresses the reader');
    const unresolved = page.markdown.match(/\[\[[^\]]+\]\]/g) ?? [];
    for (const u of unresolved) push('unresolved-links', `${u} was not resolved`);
    const lower = page.markdown.toLowerCase();
    for (const s of deny) if (lower.includes(s)) push('denylist', `contains a denylisted sentence: "${s.slice(0, 40)}…"`);
  }
  return out;
}
```

Run: `cd wiki && ~/.bun/bin/bun test gen/lint.test.ts gen/render` → PASS.

- [ ] **Step 9: Commit**

```bash
git add wiki/gen/render wiki/gen/lint.ts wiki/gen/lint.test.ts wiki/gen/denylist.txt
git commit -m "feat(wiki): loc, quest, skill, shop and area renderers, overlay merge, lint rules"
```

---

### Task 12: SQLite corpus build and report

**Files:**
- Create: `wiki/gen/db.ts`, `wiki/gen/build.ts`
- Test: `wiki/gen/db.test.ts`

**Interfaces:**
- Produces: `buildDb(dbPath, data: ExtractedData, pages: Page[]): void` (deletes and recreates); the schema below is the contract the server reads in Task 13; `runBuild({ lintOnly })` orchestrating render, lint, db, `report.md`.

- [ ] **Step 1: Write the failing db test `wiki/gen/db.test.ts`**

```ts
import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildDb } from './db';
import { renderAll } from './render';
import { data } from './render/fixture';

describe('buildDb', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'wikidb-')), 'wiki.db');
  const { pages } = renderAll(data, []);
  buildDb(file, data, pages);
  const db = new Database(file, { readonly: true });
  test('entities, pages and fts are populated', () => {
    expect(db.query('SELECT COUNT(*) n FROM entities').get()).toEqual({ n: 4 }); // item, npc, area, shop
    expect(db.query("SELECT title FROM pages WHERE type='item' AND slug='bronze-axe'").get()).toEqual({ title: 'Bronze axe' });
    const hit = db.query("SELECT slug FROM search WHERE search MATCH 'bronze' ORDER BY bm25(search) LIMIT 1").get() as { slug: string };
    expect(hit.slug).toBe('bronze-axe');
  });
  test('relations: drops, shop stock links, spawns, methods, requirements', () => {
    expect(db.query("SELECT num, den FROM drops WHERE item_key='bronze_axe'").get()).toEqual({ num: 3, den: 128 });
    expect(db.query("SELECT COUNT(*) n FROM links WHERE relation='sells' AND to_slug='bronze-axe'").get()).toEqual({ n: 1 });
    expect(db.query("SELECT x, z, level, area FROM spawns WHERE kind='obj' AND key='bronze_axe'").get()).toEqual({ x: 3230, z: 3220, level: 0, area: 'lumbridge' });
    expect(db.query("SELECT skill, level, xp FROM methods").get()).toEqual({ skill: 'woodcutting', level: 1, xp: 25 });
    expect(db.query("SELECT COUNT(*) n FROM aliases WHERE alias='bronze axe'").get()).toEqual({ n: 1 });
  });
  test('meta table carries the manifest', () => {
    expect(db.query("SELECT value FROM meta WHERE key='revision'").get()).toEqual({ value: '225' });
  });
});
```

- [ ] **Step 2: Run to verify it fails, then write `wiki/gen/db.ts`**

```ts
import { Database } from 'bun:sqlite';
import { existsSync, unlinkSync } from 'node:fs';
import type { ExtractedData, Page } from './types';

export const SCHEMA = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE entities (type TEXT NOT NULL, id INTEGER NOT NULL, key TEXT NOT NULL, slug TEXT NOT NULL, name TEXT NOT NULL, members INTEGER NOT NULL, json TEXT NOT NULL, PRIMARY KEY (type, slug));
CREATE INDEX entities_key ON entities(type, key);
CREATE INDEX entities_id ON entities(type, id);
CREATE TABLE pages (type TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, lead TEXT NOT NULL, markdown TEXT NOT NULL, html TEXT NOT NULL, sections_json TEXT NOT NULL, PRIMARY KEY (type, slug));
CREATE TABLE links (from_type TEXT, from_slug TEXT, to_type TEXT, to_slug TEXT, relation TEXT);
CREATE INDEX links_to ON links(to_type, to_slug);
CREATE TABLE spawns (kind TEXT, key TEXT, id INTEGER, x INTEGER, z INTEGER, level INTEGER, count INTEGER, area TEXT);
CREATE INDEX spawns_key ON spawns(kind, key);
CREATE INDEX spawns_xz ON spawns(level, x, z);
CREATE TABLE methods (skill TEXT, level INTEGER, xp REAL, action TEXT, inputs_json TEXT, outputs_json TEXT, table_name TEXT, row_key TEXT, sources_json TEXT);
CREATE INDEX methods_skill ON methods(skill, level);
CREATE TABLE drops (npc_key TEXT, item_key TEXT, min INTEGER, max INTEGER, num INTEGER, den INTEGER, condition TEXT, table_name TEXT, sources_json TEXT);
CREATE INDEX drops_item ON drops(item_key);
CREATE INDEX drops_npc ON drops(npc_key);
CREATE TABLE requirements (subject_type TEXT, subject_key TEXT, kind TEXT, key TEXT, value INTEGER);
CREATE INDEX requirements_subject ON requirements(subject_type, subject_key);
CREATE TABLE aliases (alias TEXT, type TEXT, slug TEXT);
CREATE INDEX aliases_alias ON aliases(alias);
CREATE VIRTUAL TABLE search USING fts5(title, aliases, lead, body, type UNINDEXED, slug UNINDEXED, tokenize='porter unicode61');
`;

export function buildDb(dbPath: string, data: ExtractedData, pages: Page[]): void {
  if (existsSync(dbPath)) unlinkSync(dbPath);
  const db = new Database(dbPath);
  db.exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;');
  db.exec(SCHEMA);
  const tx = db.transaction(() => {
    const meta = db.prepare('INSERT INTO meta VALUES (?, ?)');
    meta.run('revision', String(data.manifest.revision)); meta.run('contentSha', data.manifest.contentSha); meta.run('engineSha', data.manifest.engineSha); meta.run('generatedAt', data.manifest.generatedAt);
    const ent = db.prepare('INSERT INTO entities VALUES (?, ?, ?, ?, ?, ?, ?)');
    const alias = db.prepare('INSERT INTO aliases VALUES (?, ?, ?)');
    const all = [...data.items, ...data.npcs, ...data.locs, ...data.quests, ...data.skills, ...data.shops, ...data.areas];
    for (const e of all) { ent.run(e.type, e.id, e.key, e.slug, e.name, e.members ? 1 : 0, JSON.stringify(e)); for (const a of new Set([e.name.toLowerCase(), ...e.aliases])) alias.run(a, e.type, e.slug); }
    const pg = db.prepare('INSERT INTO pages VALUES (?, ?, ?, ?, ?, ?, ?)');
    const fts = db.prepare('INSERT INTO search VALUES (?, ?, ?, ?, ?, ?)');
    const link = db.prepare('INSERT INTO links VALUES (?, ?, ?, ?, ?)');
    const aliasOf = new Map(all.map(e => [`${e.type}/${e.slug}`, e.aliases.join(' ')]));
    for (const p of pages) {
      pg.run(p.type, p.slug, p.title, p.lead, p.markdown, p.html, JSON.stringify(p.sections));
      fts.run(p.title, aliasOf.get(`${p.type}/${p.slug}`) ?? '', p.lead, p.markdown.replace(/## Sources[\s\S]*$/, ''), p.type, p.slug);
      for (const l of p.links) link.run(p.type, p.slug, l.toType, l.toSlug, l.relation);
    }
    const slugOf = (type: string, key: string) => all.find(e => e.type === type && e.key === key)?.slug;
    for (const s of data.shops) for (const st of s.stock) { const to = slugOf('item', st.itemKey); if (to) link.run('shop', s.slug, 'item', to, 'sells'); }
    for (const d of data.drops) { const from = slugOf('npc', d.npcKey), to = slugOf('item', d.itemKey); if (from && to) link.run('npc', from, 'item', to, 'drops'); }
    for (const q of data.quests) for (const r of q.rewards) if (r.kind === 'item') { const to = slugOf('item', r.key); if (to) link.run('quest', q.slug, 'item', to, 'rewards'); }
    const sp = db.prepare('INSERT INTO spawns VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const s of data.spawns) sp.run(s.kind, s.key, s.id, s.coord.x, s.coord.z, s.coord.level, s.count, s.area);
    const me = db.prepare('INSERT INTO methods VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const m of data.methods) me.run(m.skill, m.level, m.xp, m.action, JSON.stringify(m.inputs), JSON.stringify(m.outputs), m.table, m.row, JSON.stringify(m.sources));
    const dr = db.prepare('INSERT INTO drops VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const d of data.drops) dr.run(d.npcKey, d.itemKey, d.min, d.max, d.num, d.den, d.condition, d.table, JSON.stringify(d.sources));
    const rq = db.prepare('INSERT INTO requirements VALUES (?, ?, ?, ?, ?)');
    for (const q of data.quests) { for (const r of q.requirements) rq.run('quest', q.key, r.kind, r.key, r.value); for (const k of q.itemsChecked) rq.run('quest', q.key, 'item', k, 1); }
    for (const it of data.items) for (const r of it.levelRequire) rq.run('item', it.key, 'skill', r.skill, r.level);
  });
  tx();
  db.close();
}
```

`slugOf` with `Array.find` is O(n) per call; build a `Map` keyed by `type:key` instead before the loops (the implementer does this in the first pass; the test does not care but the real build has 100k+ lookups).

- [ ] **Step 3: Write `wiki/gen/build.ts`**

```ts
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { BUILD, OVERLAYS } from './paths';
import { readData } from './extract';
import { loadOverlays, renderAll } from './render';
import { lintPages } from './lint';
import { buildDb } from './db';
import type { LintProblem } from './render/overlay';

function report(problems: LintProblem[], counts: Record<string, number>, pages: { type: string; sections: Record<string, { confidence: string }> }[], stubs: Map<string, number>): string {
  const byRule = new Map<string, number>();
  for (const p of problems) byRule.set(`${p.level}:${p.rule}`, (byRule.get(`${p.level}:${p.rule}`) ?? 0) + 1);
  const perType = new Map<string, number>();
  for (const p of pages) perType.set(p.type, (perType.get(p.type) ?? 0) + 1);
  return ['# Wiki build report', '', `Generated ${new Date().toISOString()}`, '', '## Counts', '', ...Object.entries(counts).map(([k, v]) => `- ${k}: ${v}`), '',
    '## Pages per type', '', ...[...perType.entries()].map(([t, n]) => `- ${t}: ${n} (required stubs: ${stubs.get(t) ?? 0})`), '',
    '## Lint', '', ...(byRule.size ? [...byRule.entries()].map(([k, n]) => `- ${k}: ${n}`) : ['- clean']), '',
    '## First 50 problems', '', ...problems.slice(0, 50).map(p => `- ${p.level} ${p.rule} ${p.page}: ${p.message}`), ''].join('\n');
}

export function runBuild(opts: { lintOnly: boolean }): number {
  const data = readData();
  const overlays = loadOverlays(OVERLAYS);
  const { pages, drafts, problems } = renderAll(data, overlays);
  const denyPath = path.join(import.meta.dir, 'denylist.txt');
  const deny = existsSync(denyPath) ? readFileSync(denyPath, 'utf8').split(/\r?\n/).filter(Boolean) : [];
  problems.push(...lintPages(pages, drafts, deny));
  const stubs = new Map<string, number>();
  for (const d of drafts) for (const s of d.sections) if (s.required && !s.body.trim()) stubs.set(d.type, (stubs.get(d.type) ?? 0) + 1);
  mkdirSync(BUILD, { recursive: true });
  writeFileSync(path.join(BUILD, 'report.md'), report(problems, data.manifest.counts, pages, stubs));
  const errors = problems.filter(p => p.level === 'error');
  console.log(`[wiki] ${pages.length} pages, ${errors.length} lint errors, ${problems.length - errors.length} warnings -> build/report.md`);
  if (errors.length) { for (const e of errors.slice(0, 20)) console.error(`  ${e.rule} ${e.page}: ${e.message}`); return 1; }
  if (!opts.lintOnly) { buildDb(path.join(BUILD, 'wiki.db'), data, pages); console.log(`[wiki] wrote build/wiki.db`); }
  return 0;
}

if (import.meta.main) process.exit(runBuild({ lintOnly: process.argv.includes('--lint-only') }));
```

- [ ] **Step 4: Run the db test, then a full build**

Run: `cd wiki && ~/.bun/bin/bun test gen/db.test.ts && ~/.bun/bin/bun run build && ls -la build && head -40 build/report.md`
Expected: test PASS; build finishes with zero lint errors (generated pages are designed to pass; any `unresolved-links` from generated text means a renderer emitted a `[[Name]]` form instead of `wl()` and must be fixed in the renderer). `wiki.db` should be in the tens of megabytes.

- [ ] **Step 5: Spot-check three pages in the db**

Run:

```bash
cd wiki && ~/.bun/bin/bun -e "const {Database}=require('bun:sqlite');const db=new Database('build/wiki.db',{readonly:true});for(const [t,s] of [['item','bronze-axe'],['npc','goblin'],['quest','cooks-assistant']]){const r=db.query('SELECT markdown FROM pages WHERE type=? AND slug=?').get(t,s);console.log(r?r.markdown.slice(0,1200):'MISSING '+t+'/'+s);console.log('-----')}"
```

Expected: each page prints with an infobox, a bolded lead and a Sources footer. Fix slugs in the check if the goblin's slug carries a numeric suffix (there are several Goblin NPCs; the first by id is `goblin`).

- [ ] **Step 6: Commit**

```bash
git add wiki/gen/db.ts wiki/gen/db.test.ts wiki/gen/build.ts
git commit -m "feat(wiki): sqlite corpus build with fts5, relations and build report"
```

---

### Task 13: Front server wiki module: db access, auth, router, reader pages

**Files:**
- Create: `server/src/wiki/types.ts`, `server/src/wiki/db.ts`, `server/src/wiki/auth.ts`, `server/src/wiki/layout.ts`, `server/src/wiki/reader.ts`, `server/src/wiki/routes.ts`, `server/src/wiki/testDb.ts`
- Modify: `server/src/router.ts`, `server/src/index.ts`, `server/src/env.ts`, `server/src/types.ts`, `server/src/health.ts`, `server/.env.example`
- Test: `server/src/wiki/db.test.ts`, `server/src/wiki/auth.test.ts`, `server/src/wiki/reader.test.ts`, `server/src/router.test.ts` (extend)

**Interfaces:**
- Consumes: the Task 12 schema; `Gate.isOpen(req)` from `server/src/gate.ts`.
- Produces: `openWikiDb(path): WikiDb | null`; `WikiDb` methods `meta()`, `getPage(type, slug)`, `getEntity(type, ref)`, `search(q, type?, limit)`, `listType(type)`, `randomPage()`, `raw` (the `Database` for Task 15 queries); `createWikiAuth({ gate, verifyBearer? }): { allowed(req, kind: 'wiki' | 'wikiApi'): Promise<boolean> }`; `handleWiki(db, url): Promise<Response>` for reader routes; `Route` gains `{ kind: 'wiki'; path: string } | { kind: 'wikiApi'; path: string }`; `Env.wikiDb`; `HealthSnapshot.wiki: 'up' | 'missing'`.

- [ ] **Step 1: Env, types, health, router**

`server/src/types.ts`: add `wikiDb: string;` to `Env` and `wiki: 'up' | 'missing';` to `HealthSnapshot`. `server/src/env.ts`: add `wikiDb: str(source, 'WIKI_DB', '../wiki/build/wiki.db')`. `server/.env.example`: add `WIKI_DB=../wiki/build/wiki.db`. `server/src/health.ts`: `createHealth` gains `wikiUp: () => boolean` in its options and returns `wiki: opts.wikiUp() ? 'up' : 'missing'` in `snapshot()`; update the existing health test's options with `wikiUp: () => true` and add an assertion `expect(h.snapshot().wiki).toBe('up')`.

`server/src/router.ts`: add the two kinds and, before the `/client/` branch:

```ts
  if (pathname === '/wiki' || pathname.startsWith('/wiki/')) return { kind: 'wiki', path: pathname };
  if (pathname.startsWith('/api/wiki/') || pathname === '/api/wiki') return { kind: 'wikiApi', path: pathname };
```

Extend `server/src/router.test.ts`:

```ts
  test('wiki reader and api', () => {
    expect(classify('/wiki', false)).toEqual({ kind: 'wiki', path: '/wiki' });
    expect(classify('/wiki/item/bronze-axe', false)).toEqual({ kind: 'wiki', path: '/wiki/item/bronze-axe' });
    expect(classify('/api/wiki/search', false)).toEqual({ kind: 'wikiApi', path: '/api/wiki/search' });
    expect(classify('/wikipedia', false)).toEqual({ kind: 'notfound' });
  });
```

Run `cd server && ~/.bun/bin/bun test src/router.test.ts src/health.test.ts` → PASS after the edits.

- [ ] **Step 2: Test db helper and the failing db test**

`server/src/wiki/testDb.ts` (test-only helper; builds a small corpus from the wiki package's render fixture):

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildDb } from '../../../wiki/gen/db';
import { renderAll } from '../../../wiki/gen/render';
import { data } from '../../../wiki/gen/render/fixture';

export function makeTestDb(): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'cs-wiki-')), 'wiki.db');
  buildDb(file, data, renderAll(data, []).pages);
  return file;
}
```

If `bun run typecheck` in `server/` rejects the cross-package import (rootDir), add `"../wiki/gen/**/*.ts"` to `server/tsconfig.json` `include` and `"rootDir": ".."`; the runtime import works regardless.

`server/src/wiki/db.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { openWikiDb } from './db';
import { makeTestDb } from './testDb';

describe('WikiDb', () => {
  const db = openWikiDb(makeTestDb())!;
  test('missing file returns null', () => { expect(openWikiDb('C:/nope/none.db')).toBeNull(); });
  test('meta, page, entity by slug, key and id', () => {
    expect(db.meta().revision).toBe('225');
    expect(db.getPage('item', 'bronze-axe')?.title).toBe('Bronze axe');
    expect(db.getEntity('item', 'bronze-axe')?.key).toBe('bronze_axe');
    expect(db.getEntity('item', 'bronze_axe')?.slug).toBe('bronze-axe');
    expect(db.getEntity('item', '1')?.slug).toBe('bronze-axe');
    expect(db.getEntity('item', 'nothing')).toBeNull();
  });
  test('search ranks title matches first, supports type filter and alias', () => {
    expect(db.search('bronze', undefined, 5)[0]?.slug).toBe('bronze-axe');
    expect(db.search('bronze axe', 'npc', 5)).toEqual([]);
    expect(db.search('goblin', 'npc', 5)[0]?.slug).toBe('goblin');
    expect(Array.isArray(db.search('"; DROP TABLE pages; --', undefined, 5))).toBe(true); // sanitised to prefix tokens, never raw
  });
  test('listType and randomPage', () => {
    expect(db.listType('item').map(r => r.slug)).toEqual(['bronze-axe']);
    expect(['item', 'npc', 'area', 'shop']).toContain(db.randomPage()!.type);
  });
});
```

- [ ] **Step 3: Write `server/src/wiki/types.ts` and `server/src/wiki/db.ts`**

```ts
// server/src/wiki/types.ts
export type WikiType = 'item' | 'npc' | 'loc' | 'quest' | 'skill' | 'shop' | 'area' | 'method' | 'mechanic' | 'guide';
export interface PageRow { type: WikiType; slug: string; title: string; lead: string; markdown: string; html: string; sections_json: string }
export interface EntityRow { type: WikiType; id: number; key: string; slug: string; name: string; members: number; json: string }
export interface SearchHit { type: WikiType; slug: string; title: string; snippet: string; score: number }
export interface WikiMeta { revision: string; contentSha: string; engineSha: string; generatedAt: string }
```

```ts
// server/src/wiki/db.ts
import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import type { EntityRow, PageRow, SearchHit, WikiMeta, WikiType } from './types';

export interface WikiDb {
  raw: Database;
  meta(): WikiMeta;
  getPage(type: string, slug: string): PageRow | null;
  getEntity(type: string, ref: string): EntityRow | null;
  search(q: string, type: string | undefined, limit: number): SearchHit[];
  listType(type: string): { slug: string; title: string; members: number }[];
  randomPage(): { type: WikiType; slug: string } | null;
}

/** Turn free text into a safe FTS5 MATCH expression: quoted prefix tokens joined by AND. */
export function ftsQuery(q: string): string | null {
  const tokens = q.toLowerCase().match(/[a-z0-9']+/g)?.map(t => t.replace(/'/g, '')).filter(Boolean) ?? [];
  if (!tokens.length) return null;
  return tokens.map(t => `"${t}"*`).join(' ');
}

export function openWikiDb(path: string): WikiDb | null {
  if (!existsSync(path)) return null;
  const raw = new Database(path, { readonly: true });
  raw.exec('PRAGMA query_only = 1');
  const metaQ = raw.prepare<{ key: string; value: string }, []>('SELECT key, value FROM meta');
  const pageQ = raw.prepare<PageRow, [string, string]>('SELECT * FROM pages WHERE type = ? AND slug = ?');
  const bySlug = raw.prepare<EntityRow, [string, string]>('SELECT * FROM entities WHERE type = ? AND slug = ?');
  const byKey = raw.prepare<EntityRow, [string, string]>('SELECT * FROM entities WHERE type = ? AND key = ?');
  const byId = raw.prepare<EntityRow, [string, number]>('SELECT * FROM entities WHERE type = ? AND id = ?');
  const byAlias = raw.prepare<EntityRow, [string, string]>('SELECT e.* FROM aliases a JOIN entities e ON e.type = a.type AND e.slug = a.slug WHERE a.type = ? AND a.alias = ? LIMIT 1');
  const searchAll = raw.prepare<SearchHit, [string, number]>("SELECT type, slug, title, snippet(search, 3, '<b>', '</b>', '…', 12) AS snippet, bm25(search, 10.0, 5.0, 2.0, 1.0) AS score FROM search WHERE search MATCH ? ORDER BY score LIMIT ?");
  const searchType = raw.prepare<SearchHit, [string, string, number]>("SELECT type, slug, title, snippet(search, 3, '<b>', '</b>', '…', 12) AS snippet, bm25(search, 10.0, 5.0, 2.0, 1.0) AS score FROM search WHERE search MATCH ? AND type = ? ORDER BY score LIMIT ?");
  const listQ = raw.prepare<{ slug: string; title: string; members: number }, [string]>('SELECT p.slug, p.title, COALESCE(e.members, 0) AS members FROM pages p LEFT JOIN entities e ON e.type = p.type AND e.slug = p.slug WHERE p.type = ? ORDER BY p.title COLLATE NOCASE');
  const randomQ = raw.prepare<{ type: WikiType; slug: string }, []>('SELECT type, slug FROM pages ORDER BY random() LIMIT 1');
  return {
    raw,
    meta() { return Object.fromEntries(metaQ.all().map(r => [r.key, r.value])) as unknown as WikiMeta; },
    getPage(type, slug) { return pageQ.get(type, slug) ?? null; },
    getEntity(type, ref) {
      const n = /^\d+$/.test(ref) ? byId.get(type, Number(ref)) : null;
      return n ?? bySlug.get(type, ref) ?? byKey.get(type, ref) ?? byAlias.get(type, ref.toLowerCase().replace(/-/g, ' ')) ?? null;
    },
    search(q, type, limit) {
      const m = ftsQuery(q);
      if (!m) return [];
      try { return type ? searchType.all(m, type, limit) : searchAll.all(m, limit); } catch { return []; }
    },
    listType(type) { return listQ.all(type); },
    randomPage() { return randomQ.get() ?? null; }
  };
}
```

Run `cd server && ~/.bun/bin/bun test src/wiki/db.test.ts` → PASS.

- [ ] **Step 4: Auth with injected bearer verifier**

`server/src/wiki/auth.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { createWikiAuth } from './auth';

const gate = { isOpen: (req: Request) => req.headers.get('cookie')?.includes('cs_gate=ok') ?? false };

describe('wiki auth', () => {
  test('reader needs the gate cookie; a bearer does not open it', async () => {
    const a = createWikiAuth({ gate, verifyBearer: async () => true });
    expect(await a.allowed(new Request('http://x/wiki', { headers: { cookie: 'cs_gate=ok' } }), 'wiki')).toBe(true);
    expect(await a.allowed(new Request('http://x/wiki', { headers: { authorization: 'Bearer t' } }), 'wiki')).toBe(false);
  });
  test('api accepts cookie or a verified bearer; default verifier rejects', async () => {
    const a = createWikiAuth({ gate, verifyBearer: async t => t === 'good' });
    expect(await a.allowed(new Request('http://x/api/wiki/search', { headers: { cookie: 'cs_gate=ok' } }), 'wikiApi')).toBe(true);
    expect(await a.allowed(new Request('http://x/api/wiki/search', { headers: { authorization: 'Bearer good' } }), 'wikiApi')).toBe(true);
    expect(await a.allowed(new Request('http://x/api/wiki/search', { headers: { authorization: 'Bearer bad' } }), 'wikiApi')).toBe(false);
    expect(await createWikiAuth({ gate }).allowed(new Request('http://x/api/wiki/search', { headers: { authorization: 'Bearer any' } }), 'wikiApi')).toBe(false);
  });
});
```

`server/src/wiki/auth.ts`:

```ts
export interface WikiAuth { allowed(req: Request, kind: 'wiki' | 'wikiApi'): Promise<boolean> }

/** `verifyBearer` is wired to Task 13b's agentTokens store when it lands; until then the default rejects every token. */
export function createWikiAuth(opts: { gate: { isOpen(req: Request): boolean }; verifyBearer?: (token: string) => Promise<boolean> }): WikiAuth {
  const verify = opts.verifyBearer ?? (async () => false);
  return {
    async allowed(req, kind) {
      if (opts.gate.isOpen(req)) return true;
      if (kind !== 'wikiApi') return false;
      const h = req.headers.get('authorization') ?? '';
      const m = /^Bearer\s+(\S+)$/i.exec(h);
      return m ? verify(m[1]!) : false;
    }
  };
}
```

Run `cd server && ~/.bun/bin/bun test src/wiki/auth.test.ts` → PASS.

- [ ] **Step 5: Layout and reader routes with failing test first**

`server/src/wiki/reader.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { openWikiDb } from './db';
import { makeTestDb } from './testDb';
import { handleWiki } from './reader';

const db = openWikiDb(makeTestDb())!;
const get = (p: string) => handleWiki(db, new URL(`http://x${p}`));

describe('reader', () => {
  test('front page lists types with counts and a search box', async () => {
    const html = await (await get('/wiki')).text();
    expect(html).toContain('<form action="/wiki/search"');
    expect(html).toContain('Items (1)');
  });
  test('page renders infobox, lead, sources and json/markdown links', async () => {
    const res = await get('/wiki/item/bronze-axe');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<h1>Bronze axe</h1>');
    expect(html).toContain('<strong>Bronze axe</strong>');
    expect(html).toContain('href="/api/wiki/page/item/bronze-axe?format=json"');
    expect(html).toContain('Revision 225');
  });
  test('search page groups hits; exact title redirects', async () => {
    expect((await get('/wiki/search?q=bronze+axe')).status).toBe(302);
    const html = await (await get('/wiki/search?q=bronze')).text();
    expect(html).toContain('/wiki/item/bronze-axe');
  });
  test('unknown slug is a 404 page with suggestions; type index lists pages; random redirects', async () => {
    const res = await get('/wiki/item/bronze-axx');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('/wiki/item/bronze-axe');
    expect(await (await get('/wiki/item')).text()).toContain('Bronze axe');
    expect((await get('/wiki/random')).status).toBe(302);
  });
});
```

`server/src/wiki/layout.ts`:

```ts
const TYPES: [string, string][] = [['item', 'Items'], ['npc', 'NPCs and monsters'], ['loc', 'Scenery'], ['quest', 'Quests'], ['skill', 'Skills'], ['shop', 'Shops'], ['area', 'Areas'], ['mechanic', 'Mechanics'], ['guide', 'Guides']];
export const TYPE_LABEL = new Map(TYPES);

export function esc(s: string): string { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!); }

const CSS = `
:root{--win:#1b1b1b;--darker:#1e1e1e;--panel:#282828;--border:#151515;--muted:#808080;--text:#a0a0a0;--strong:#e0e0e0;--orange:#ff981f}
*{box-sizing:border-box}body{margin:0;background:var(--win);color:var(--text);font:14px/1.5 system-ui,Segoe UI,sans-serif}
a{color:var(--orange);text-decoration:none}a:hover{text-decoration:underline}
.top{display:flex;gap:16px;align-items:center;padding:8px 16px;background:var(--darker);border-bottom:1px solid var(--border)}
.top .brand{color:var(--orange);font-weight:700;letter-spacing:.04em}.top form{margin-left:auto}.top input{background:var(--panel);border:1px solid var(--border);color:var(--strong);padding:6px 8px;width:280px}
.wrap{display:grid;grid-template-columns:200px minmax(0,760px) 300px;gap:24px;max-width:1320px;margin:0 auto;padding:16px}
.rail{font-size:13px}.rail a{display:block;padding:2px 0;color:var(--text)}.rail a:hover{color:var(--orange)}
article h1{color:var(--strong);margin:0 0 8px;font-size:26px}article h2{color:var(--strong);font-size:18px;border-bottom:1px solid var(--border);margin-top:24px}
article table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}article td,article th{border:1px solid var(--border);padding:4px 8px;background:var(--panel);text-align:left}
article table:first-of-type{float:right;width:300px;margin:0 0 12px 16px}article em{color:var(--muted)}article code{background:var(--panel);padding:1px 4px}
article > p:first-of-type strong{color:var(--strong)}.foot{clear:both;font-size:12px;color:var(--muted);margin-top:32px}
.badge{display:inline-block;background:var(--panel);color:var(--muted);font-size:11px;padding:1px 6px;border-radius:3px;margin-left:6px}
@media (max-width:900px){.wrap{grid-template-columns:1fr}.rail{display:flex;flex-wrap:wrap;gap:12px}article table:first-of-type{float:none;width:100%;margin:0 0 12px}}
@media print{.top,.rail{display:none}.wrap{display:block}}
`;

export function layout(opts: { title: string; body: string; counts?: Map<string, number>; meta?: { revision: string; contentSha: string } }): string {
  const nav = TYPES.map(([t, label]) => `<a href="/wiki/${t}">${label}${opts.counts?.has(t) ? ` (${opts.counts.get(t)})` : ''}</a>`).join('');
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.title)} · idlescape wiki</title><style>${CSS}</style></head>
<body><header class="top"><a class="brand" href="/wiki">idlescape wiki</a><a href="/" title="Back to the game">game</a><a href="/wiki/random">random</a>
<form action="/wiki/search" method="get"><input type="search" name="q" placeholder="Search the wiki" aria-label="Search"></form></header>
<div class="wrap"><nav class="rail">${nav}</nav><main><article>${opts.body}</article>
<p class="foot">Game text and data are © Jagex Ltd, preserved by the Lost City project. Editorial text and code are MIT. ${opts.meta ? `Revision ${esc(opts.meta.revision)} · Content ${esc(opts.meta.contentSha.slice(0, 8))}` : ''}</p></main><aside></aside></div></body></html>`;
}
```

`server/src/wiki/reader.ts`:

```ts
import type { WikiDb } from './db';
import { esc, layout, TYPE_LABEL } from './layout';

const html = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });

function counts(db: WikiDb): Map<string, number> {
  return new Map((db.raw.query('SELECT type, COUNT(*) n FROM pages GROUP BY type').all() as { type: string; n: number }[]).map(r => [r.type, r.n]));
}

export async function handleWiki(db: WikiDb, url: URL): Promise<Response> {
  const meta = db.meta();
  const parts = url.pathname.split('/').filter(Boolean); // ['wiki', type?, slug?]
  if (parts.length === 1) {
    const c = counts(db);
    const tiles = [...TYPE_LABEL.entries()].filter(([t]) => c.has(t)).map(([t, l]) => `<li><a href="/wiki/${t}">${l} (${c.get(t)})</a></li>`).join('');
    return html(layout({ title: 'Home', counts: c, meta, body: `<h1>idlescape wiki</h1><p>The game as it runs on this server: revision ${esc(meta.revision)}, generated from the Lost City content pack with a source on every fact.</p><ul>${tiles}</ul><p><a href="/api/wiki/schema">API for agents</a></p>` }));
  }
  if (parts[1] === 'search') {
    const q = url.searchParams.get('q')?.trim() ?? '';
    const hits = q ? db.search(q, url.searchParams.get('type') ?? undefined, 40) : [];
    const exact = hits.find(h => h.title.toLowerCase() === q.toLowerCase());
    if (exact) return redirect(`/wiki/${exact.type}/${exact.slug}`);
    const groups = new Map<string, typeof hits>();
    for (const h of hits) (groups.get(h.type) ?? groups.set(h.type, []).get(h.type)!).push(h);
    const body = `<h1>Search: ${esc(q)}</h1>` + (hits.length ? [...groups.entries()].map(([t, hs]) => `<h2>${TYPE_LABEL.get(t) ?? t}</h2><ul>${hs.map(h => `<li><a href="/wiki/${h.type}/${h.slug}">${esc(h.title)}</a> — ${h.snippet}</li>`).join('')}</ul>`).join('') : '<p>No pages match.</p>');
    return html(layout({ title: `Search: ${q}`, meta, body }));
  }
  if (parts[1] === 'random') { const r = db.randomPage(); return r ? redirect(`/wiki/${r.type}/${r.slug}`) : html(layout({ title: 'Empty', meta, body: '<p>No pages yet.</p>' }), 404); }
  const type = parts[1]!, slug = parts[2];
  if (!TYPE_LABEL.has(type)) return html(layout({ title: 'Not found', meta, body: '<h1>Not found</h1>' }), 404);
  if (!slug) {
    const rows = db.listType(type);
    let letter = '';
    const items = rows.map(r => { const l = r.title.charAt(0).toUpperCase(); const head = l !== letter ? `</ul><h2 id="${l}">${l}</h2><ul>` : ''; letter = l; return `${head}<li><a href="/wiki/${type}/${r.slug}">${esc(r.title)}</a>${r.members ? '<span class="badge">members</span>' : ''}</li>`; }).join('');
    return html(layout({ title: TYPE_LABEL.get(type)!, meta, body: `<h1>${TYPE_LABEL.get(type)}</h1><ul>${items}</ul>` }));
  }
  const page = db.getPage(type, slug);
  if (!page) {
    const sugg = db.search(slug.replace(/-/g, ' '), type, 10);
    return html(layout({ title: 'Not found', meta, body: `<h1>No page "${esc(slug)}"</h1>${sugg.length ? `<p>Did you mean:</p><ul>${sugg.map(h => `<li><a href="/wiki/${h.type}/${h.slug}">${esc(h.title)}</a></li>`).join('')}</ul>` : ''}` }), 404);
  }
  const tools = `<p class="foot"><a href="/api/wiki/page/${type}/${slug}?format=json">View as JSON</a> · <a href="/api/wiki/page/${type}/${slug}">View as Markdown</a></p>`;
  return html(layout({ title: page.title, meta, body: page.html + tools }));
}
```

The page HTML already contains `<h1>` from the markdown; `layout` does not add another. Run `cd server && ~/.bun/bin/bun test src/wiki/reader.test.ts` → PASS.

- [ ] **Step 6: Wire `server/src/wiki/routes.ts` and `index.ts`**

```ts
// server/src/wiki/routes.ts
import type { WikiDb } from './db';
import type { WikiAuth } from './auth';
import { handleWiki } from './reader';
import { handleWikiApi } from './api'; // Task 15; until then export a stub from api.ts returning 501

export function createWikiRoutes(deps: { db: () => WikiDb | null; auth: WikiAuth }) {
  return {
    async handle(kind: 'wiki' | 'wikiApi', req: Request, url: URL): Promise<Response> {
      if (!(await deps.auth.allowed(req, kind))) return kind === 'wiki' ? new Response(null, { status: 302, headers: { location: '/' } }) : Response.json({ error: 'unauthorized' }, { status: 401 });
      const db = deps.db();
      if (!db) return kind === 'wiki' ? new Response('wiki not built: run bun run --cwd wiki build', { status: 503 }) : Response.json({ error: 'wiki_missing' }, { status: 503 });
      return kind === 'wiki' ? handleWiki(db, url) : handleWikiApi(db, url, req);
    }
  };
}
```

Create `server/src/wiki/api.ts` now with `export async function handleWikiApi(_db: WikiDb, _url: URL, _req: Request): Promise<Response> { return Response.json({ error: 'not_implemented' }, { status: 501 }); }`; Task 15 replaces it.

`server/src/index.ts`: after `bridge`, add

```ts
import { openWikiDb } from './wiki/db';
import { createWikiAuth } from './wiki/auth';
import { createWikiRoutes } from './wiki/routes';
// ...
let wikiDb = openWikiDb(env.wikiDb);
setInterval(() => { if (!wikiDb) wikiDb = openWikiDb(env.wikiDb); }, 30_000); // picks up a build that lands after boot
const wiki = createWikiRoutes({ db: () => wikiDb, auth: createWikiAuth({ gate }) });
```

Pass `wikiUp: () => wikiDb !== null` into `createHealth`. In the first `switch` (before the gate check) add:

```ts
      case 'wiki':
      case 'wikiApi':
        return wiki.handle(route.kind, req, url);
```

The wiki routes do their own auth, so they sit before the generic gate check (the API accepts a bearer without a cookie).

- [ ] **Step 7: Run all server tests and typecheck, then start the stack and click through**

Run: `cd server && ~/.bun/bin/bun test && ~/.bun/bin/bun run typecheck`, then `npm run dev` from the repo root, open `http://localhost:8787/wiki` after entering the gate password, search "bronze axe", open the page, open the JSON link (expect 501 until Task 15).

- [ ] **Step 8: Commit**

```bash
git add server/src server/.env.example
git commit -m "feat(server): wiki reader routes, read-only corpus access, cookie-or-bearer auth, health field"
```

---

### Task 14: Wiki link in the frame title bar and entry card, e2e

**Files:**
- Modify: `web/src/partials/frame.html`, `web/src/partials/signin.html`, `web/src/styles/frame.css`, `web/src/styles/auth.css`
- Create: `web/src/partials.test.ts`, `web/e2e/wiki.pw.test.ts`

- [ ] **Step 1: Write the failing partial test `web/src/partials.test.ts`**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const partial = (f: string) => readFileSync(resolve(__dirname, 'partials', f), 'utf8');

describe('wiki links', () => {
  test('title bar links to /wiki in a new tab with rel=noopener', () => {
    document.body.innerHTML = partial('frame.html');
    const a = document.querySelector<HTMLAnchorElement>('.frame-title a.title-link')!;
    expect(a).not.toBeNull();
    expect(a.getAttribute('href')).toBe('/wiki');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener');
    expect(a.textContent?.trim()).toBe('Wiki');
    // grouped with the brand in .title-left so the centre text stays centred
    expect(a.parentElement?.classList.contains('title-left')).toBe(true);
    expect(a.previousElementSibling?.classList.contains('brand')).toBe(true);
  });
  test('entry card links to /wiki under the buttons', () => {
    document.body.innerHTML = partial('signin.html');
    const a = document.querySelector<HTMLAnchorElement>('#screen-signin a.wiki-link')!;
    expect(a.getAttribute('href')).toBe('/wiki');
    expect(a.getAttribute('target')).toBe('_blank');
  });
});
```

Run: `cd web && npm test -- partials` → FAIL (no anchors).

- [ ] **Step 2: Add the links and styles**

`web/src/partials/frame.html`: replace `<span class="brand">idlescape</span>` with `<span class="title-left"><span class="brand">idlescape</span><a class="title-link" href="/wiki" target="_blank" rel="noopener" title="Open the wiki in a new tab">Wiki</a></span>` so the header keeps three flex children and the centre text stays centred.

`web/src/partials/signin.html`: after `<p id="signin-notice" ...></p>` insert `<a class="link wiki-link" href="/wiki" target="_blank" rel="noopener">Browse the wiki</a>`.

`web/src/styles/frame.css`: after the `.brand` rule add
`.title-left { display: inline-flex; align-items: baseline; } .title-link { margin-left: 10px; color: rgb(var(--rl-muted)); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; } .title-link:hover { color: rgb(var(--rl-orange)); text-decoration: none; }`.

`web/src/styles/auth.css`: `.wiki-link { display: block; text-align: center; margin-top: 12px; }`.

Run: `cd web && npm test -- partials && npm run lint && npm run typecheck` → PASS.

- [ ] **Step 3: E2E `web/e2e/wiki.pw.test.ts`**

```ts
import { expect, test } from '@playwright/test';

// Requires the front server with a built wiki db. See scripts/verify.ps1.
test('title bar Wiki link opens the reader in a new tab and search finds the bronze axe', async ({ page, context }) => {
  await page.goto('/');
  await page.locator('#gate-password').fill('fiddlesticks');
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(page.locator('#screen-signin a.wiki-link')).toHaveAttribute('href', '/wiki');
  const [wiki] = await Promise.all([context.waitForEvent('page'), page.locator('#screen-signin a.wiki-link').click()]);
  await wiki.waitForLoadState();
  expect(new URL(wiki.url()).pathname).toBe('/wiki');
  await wiki.getByLabel('Search').fill('bronze axe');
  await wiki.getByLabel('Search').press('Enter');
  await expect(wiki).toHaveURL(/\/wiki\/item\/bronze-axe$/);
  await expect(wiki.locator('article h1')).toHaveText('Bronze axe');
  await expect(wiki.locator('article h2', { hasText: 'Sources' })).toBeVisible();
  const json = await wiki.request.get('/api/wiki/page/item/bronze-axe?format=json');
  expect([200, 501]).toContain(json.status()); // 200 once Task 15 lands
});
```

The in-game title-bar link is covered by the partial test; the e2e clicks the entry-card link because reaching the frame needs the engine, which `gate-to-game.pw.test.ts` already exercises. Add to that test, after the Account panel assertion: `await expect(page.locator('.frame-title a.title-link')).toHaveAttribute('href', '/wiki');`.

Run: `cd web && npx playwright test e2e/wiki.pw.test.ts` with the front server up and the wiki built → PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/partials web/src/styles web/src/partials.test.ts web/e2e
git commit -m "feat(web): wiki link in the title bar and entry card, opens in a new tab"
```

---

### Task 15: Agent query API

**Files:**
- Create: `server/src/wiki/queries.ts`, `server/src/wiki/format.ts`, `server/src/wiki/schema.md`
- Modify: `server/src/wiki/api.ts` (replace the stub), `server/src/wiki/types.ts`
- Test: `server/src/wiki/queries.test.ts`, `server/src/wiki/api.test.ts`

**Interfaces:**
- Produces: `handleWikiApi(db, url, req): Promise<Response>`; query functions in `queries.ts`: `obtain(db, itemRef, near?)`, `drops(db, npcRef)`, `requirements(db, { quest?, item? })`, `unlocks(db, skill, level)`, `methods(db, skill, level, members?)`, `nearest(db, kind, name?, coord, limit)`, `where(db, name)`, `shops(db, { item?, area? })`, `questOrder(db, done[], members?)`, `planContext(db, goal, budget)`; each returns `{ ok: true; data: T; sources: string[]; confidence: string } | { ok: false; error: 'not_found' | 'ambiguous' | 'bad_query'; candidates?: { type; slug; title }[] }`; `toMarkdown(kind, result)` and `toJson(result, meta)` in `format.ts`.

- [ ] **Step 1: Add response types to `server/src/wiki/types.ts`**

```ts
export interface Candidate { type: WikiType; slug: string; title: string }
export type QueryResult<T> = { ok: true; data: T; sources: string[]; confidence: 'verified' | 'derived' | 'period' | 'modern' | 'editorial' } | { ok: false; error: 'not_found' | 'ambiguous' | 'bad_query'; message: string; candidates?: Candidate[] };
export interface Coord { x: number; z: number; level: number }
export interface Located { name: string; type: WikiType; slug: string; coord: Coord; area: string | null; distance?: number }
export interface ObtainData { item: Candidate; drops: { npc: Candidate; rate: string; chance: number; quantity: string; condition: string | null }[]; shops: { shop: Candidate; stock: number; coord: Coord | null }[]; spawns: Located[]; methods: { skill: string; level: number; action: string; xp: number }[]; quests: Candidate[] }
```

- [ ] **Step 2: Write the failing query tests `server/src/wiki/queries.test.ts`**

```ts
import { describe, expect, test } from 'bun:test';
import { openWikiDb } from './db';
import { makeTestDb } from './testDb';
import { drops, methods, nearest, obtain, planContext, questOrder, requirements, resolveEntity, shops, unlocks, where } from './queries';

const db = openWikiDb(makeTestDb())!;

describe('resolveEntity', () => {
  test('exact slug, key, alias, then fuzzy with candidates', () => {
    expect(resolveEntity(db, 'item', 'bronze-axe')).toMatchObject({ ok: true });
    expect(resolveEntity(db, 'item', 'bronze_axe')).toMatchObject({ ok: true });
    expect(resolveEntity(db, 'item', 'Bronze Axe')).toMatchObject({ ok: true });
    const r = resolveEntity(db, 'item', 'bronz');
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error).toBe('ambiguous'); expect(r.candidates?.[0]?.slug).toBe('bronze-axe'); }
    expect(resolveEntity(db, 'item', 'zzzz')).toMatchObject({ ok: false, error: 'not_found' });
  });
});

describe('question routes', () => {
  test('obtain lists drops with chance, shops with coords, spawns nearest first', () => {
    const r = obtain(db, 'bronze axe', { x: 3200, z: 3200, level: 0 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.drops[0]).toMatchObject({ npc: { slug: 'goblin' }, rate: '3/128', condition: null });
      expect(r.data.shops[0]).toMatchObject({ shop: { slug: 'lumbridge-general-store' }, stock: 10 });
      expect(r.data.spawns[0]).toMatchObject({ coord: { x: 3230, z: 3220, level: 0 }, area: 'lumbridge', distance: 36 });
      expect(r.data.methods).toEqual([]);
      expect(r.confidence).toBe('derived');
    }
  });
  test('drops for an npc', () => {
    const r = drops(db, 'goblin');
    expect(r.ok && r.data.drops[0]?.item.slug).toBe('bronze-axe');
  });
  test('requirements for an item', () => {
    const r = requirements(db, { item: 'bronze axe' });
    expect(r.ok && r.data.skills).toEqual([{ skill: 'attack', level: 1 }]);
  });
  test('methods and unlocks by skill and level', () => {
    expect(methods(db, 'woodcutting', 5, false)).toMatchObject({ ok: true, data: { methods: [{ action: 'Chop normal tree', xp: 25 }] } });
    expect(unlocks(db, 'woodcutting', 1)).toMatchObject({ ok: true, data: { methods: [{ action: 'Chop normal tree' }], next: null } });
    expect(methods(db, 'nonsense', 1, false)).toMatchObject({ ok: false, error: 'bad_query' });
  });
  test('nearest by kind and by name; where by name', () => {
    const n = nearest(db, 'npc', 'goblin', { x: 3200, z: 3200, level: 0 }, 5);
    expect(n.ok && n.data.results[0]).toMatchObject({ slug: 'goblin', distance: expect.any(Number) });
    const w = where(db, 'bronze axe');
    expect(w.ok && w.data.results[0]?.area).toBe('lumbridge');
    expect(nearest(db, 'bank', undefined, { x: 3200, z: 3200, level: 0 }, 5)).toMatchObject({ ok: true, data: { results: [] } });
  });
  test('shops by item and by area', () => {
    expect(shops(db, { item: 'bronze axe' })).toMatchObject({ ok: true, data: { shops: [{ shop: { slug: 'lumbridge-general-store' } }] } });
    expect(shops(db, { area: 'lumbridge' })).toMatchObject({ ok: true, data: { shops: [{ shop: { slug: 'lumbridge-general-store' } }] } });
  });
  test('questOrder with nothing done returns quests with no quest prerequisites', () => {
    expect(questOrder(db, [], false)).toMatchObject({ ok: true });
  });
  test('planContext bundles the best page and trims to budget', () => {
    const r = planContext(db, 'get a bronze axe', 400);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.data.page.slug).toBe('bronze-axe'); expect(r.data.markdown.length).toBeLessThanOrEqual(400 * 4); }
  });
});
```

The goblin NPC spawn that `nearest` relies on is already in `wiki/gen/render/fixture.ts` (Task 10).

- [ ] **Step 3: Write `server/src/wiki/queries.ts`**

```ts
import type { WikiDb } from './db';
import type { Candidate, Coord, Located, ObtainData, QueryResult, WikiType } from './types';

type Ok<T> = Extract<QueryResult<T>, { ok: true }>;
const ok = <T,>(data: T, sources: string[], confidence: Ok<T>['confidence'] = 'verified'): QueryResult<T> => ({ ok: true, data, sources: [...new Set(sources)], confidence });
const fail = <T,>(error: 'not_found' | 'ambiguous' | 'bad_query', message: string, candidates?: Candidate[]): QueryResult<T> => ({ ok: false, error, message, candidates });
const cand = (r: { type: string; slug: string; name?: string; title?: string }): Candidate => ({ type: r.type as WikiType, slug: r.slug, title: r.title ?? r.name ?? r.slug });
const dist = (a: Coord, b: Coord) => Math.round(Math.hypot(a.x - b.x, a.z - b.z));
const rate = (num: number, den: number) => { const g = (x: number, y: number): number => (y ? g(y, x % y) : x); const d = g(num, den) || 1; return num >= den ? 'Always' : `${num / d}/${den / d}`; };
const SKILLS = new Set(['attack', 'strength', 'ranged', 'magic', 'defence', 'hitpoints', 'prayer', 'agility', 'herblore', 'thieving', 'crafting', 'runecraft', 'mining', 'smithing', 'fishing', 'cooking', 'firemaking', 'woodcutting', 'fletching']);

export function resolveEntity(db: WikiDb, type: WikiType, ref: string): QueryResult<{ type: WikiType; slug: string; name: string; key: string; json: Record<string, unknown> }> {
  const e = db.getEntity(type, ref.trim());
  if (e) return ok({ type: e.type, slug: e.slug, name: e.name, key: e.key, json: JSON.parse(e.json) as Record<string, unknown> }, []);
  const hits = db.search(ref, type, 5);
  if (!hits.length) return fail('not_found', `no ${type} matches "${ref}"`);
  return fail('ambiguous', `no exact ${type} named "${ref}"; candidates listed`, hits.map(cand));
}

const srcs = (json: string) => (JSON.parse(json) as { kind: string; ref: string }[]).map(s => `${s.kind}:${s.ref}`);
const conf = (sources: string[]): Ok<unknown>['confidence'] => sources.some(s => s.startsWith('editorial')) ? 'editorial' : sources.some(s => s.startsWith('modern')) ? 'modern' : sources.some(s => s.startsWith('period')) ? 'period' : sources.some(s => s.startsWith('derived')) ? 'derived' : 'verified';

export function obtain(db: WikiDb, itemRef: string, near?: Coord): QueryResult<ObtainData> {
  const it = resolveEntity(db, 'item', itemRef);
  if (!it.ok) return it as QueryResult<ObtainData>;
  const key = it.data.key;
  const sources: string[] = [`content:item#${key}`];
  const dropRows = db.raw.query('SELECT d.*, e.slug, e.name FROM drops d JOIN entities e ON e.type = ? AND e.key = d.npc_key WHERE d.item_key = ? ORDER BY CAST(d.num AS REAL)/d.den DESC').all('npc', key) as { npc_key: string; slug: string; name: string; min: number; max: number; num: number; den: number; condition: string | null; sources_json: string }[];
  const drops = dropRows.map(d => { sources.push(...srcs(d.sources_json)); return { npc: cand({ type: 'npc', slug: d.slug, name: d.name }), rate: rate(d.num, d.den), chance: d.num / d.den, quantity: d.min === d.max ? String(d.min) : `${d.min}-${d.max}`, condition: d.condition }; });
  const shopRows = db.raw.query('SELECT json FROM entities WHERE type = ?').all('shop') as { json: string }[];
  const shops = shopRows.map(r => JSON.parse(r.json) as { slug: string; name: string; stock: { itemKey: string; count: number }[]; coords: Coord[] }).filter(s => s.stock.some(st => st.itemKey === key))
    .map(s => ({ shop: cand({ type: 'shop', slug: s.slug, name: s.name }), stock: s.stock.find(st => st.itemKey === key)!.count, coord: s.coords[0] ?? null }));
  const spawnRows = db.raw.query('SELECT x, z, level, area FROM spawns WHERE kind = ? AND key = ?').all('obj', key) as { x: number; z: number; level: number; area: string | null }[];
  const spawns: Located[] = spawnRows.map(s => ({ name: it.data.name, type: 'item', slug: it.data.slug, coord: { x: s.x, z: s.z, level: s.level }, area: s.area, distance: near ? dist(near, s) : undefined })).sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  const methodRows = db.raw.query("SELECT skill, level, action, xp, sources_json FROM methods WHERE outputs_json LIKE ?").all(`%"${key}"%`) as { skill: string; level: number; action: string; xp: number; sources_json: string }[];
  const methods = methodRows.map(m => { sources.push(...srcs(m.sources_json)); return { skill: m.skill, level: m.level, action: m.action, xp: m.xp }; });
  const questRows = db.raw.query("SELECT e.slug, e.name FROM links l JOIN entities e ON e.type = 'quest' AND e.slug = l.from_slug WHERE l.relation = 'rewards' AND l.to_type = 'item' AND l.to_slug = ?").all(it.data.slug) as { slug: string; name: string }[];
  return ok({ item: cand(it.data), drops, shops, spawns, methods, quests: questRows.map(q => cand({ type: 'quest', ...q })) }, sources, conf(sources));
}

export function drops(db: WikiDb, npcRef: string): QueryResult<{ npc: Candidate; drops: { item: Candidate; rate: string; chance: number; quantity: string; condition: string | null; table: string }[] }> {
  const n = resolveEntity(db, 'npc', npcRef);
  if (!n.ok) return n as never;
  const rows = db.raw.query('SELECT d.*, e.slug, e.name FROM drops d JOIN entities e ON e.type = ? AND e.key = d.item_key WHERE d.npc_key = ? ORDER BY CAST(d.num AS REAL)/d.den DESC').all('item', n.data.key) as { slug: string; name: string; min: number; max: number; num: number; den: number; condition: string | null; table_name: string; sources_json: string }[];
  const sources = rows.flatMap(r => srcs(r.sources_json));
  return ok({ npc: cand(n.data), drops: rows.map(r => ({ item: cand({ type: 'item', slug: r.slug, name: r.name }), rate: rate(r.num, r.den), chance: r.num / r.den, quantity: r.min === r.max ? String(r.min) : `${r.min}-${r.max}`, condition: r.condition, table: r.table_name })) }, sources, conf(sources));
}

export function requirements(db: WikiDb, q: { quest?: string; item?: string }): QueryResult<{ subject: Candidate; skills: { skill: string; level: number }[]; quests: Candidate[]; items: Candidate[]; questPoints: number | null }> {
  const type: WikiType = q.quest ? 'quest' : 'item';
  const r = resolveEntity(db, type, q.quest ?? q.item ?? '');
  if (!r.ok) return r as never;
  const rows = db.raw.query('SELECT kind, key, value FROM requirements WHERE subject_type = ? AND subject_key = ?').all(type, r.data.key) as { kind: string; key: string; value: number }[];
  const skills = rows.filter(x => x.kind === 'skill').map(x => ({ skill: x.key, level: x.value }));
  const quests = rows.filter(x => x.kind === 'quest').map(x => db.raw.query("SELECT type, slug, name FROM entities WHERE type = 'quest' AND json LIKE ?").get(`%"varp":"${x.key}%`) as { type: string; slug: string; name: string } | null).filter((x): x is NonNullable<typeof x> => !!x).map(cand);
  const items = rows.filter(x => x.kind === 'item').map(x => db.getEntity('item', x.key)).filter((x): x is NonNullable<typeof x> => !!x).map(cand);
  const qp = rows.find(x => x.kind === 'questpoints')?.value ?? null;
  return ok({ subject: cand(r.data), skills, quests, items, questPoints: qp }, [`content:${type}#${r.data.key}`, 'derived:quests.ts:progression'], 'derived');
}

export function methods(db: WikiDb, skill: string, level: number, members: boolean | undefined): QueryResult<{ skill: string; level: number; methods: { level: number; action: string; xp: number; inputs: string[]; outputs: string[] }[] }> {
  if (!SKILLS.has(skill)) return fail('bad_query', `unknown skill "${skill}"`);
  const rows = db.raw.query('SELECT level, action, xp, inputs_json, outputs_json, sources_json FROM methods WHERE skill = ? AND level <= ? ORDER BY xp DESC, level DESC').all(skill, level) as { level: number; action: string; xp: number; inputs_json: string; outputs_json: string; sources_json: string }[];
  void members; // members filtering needs per-method member flags; recorded as a gap in schema.md
  return ok({ skill, level, methods: rows.map(r => ({ level: r.level, action: r.action, xp: r.xp, inputs: JSON.parse(r.inputs_json) as string[], outputs: JSON.parse(r.outputs_json) as string[] })) }, rows.flatMap(r => srcs(r.sources_json)));
}

export function unlocks(db: WikiDb, skill: string, level: number): QueryResult<{ skill: string; level: number; methods: { action: string; xp: number }[]; items: Candidate[]; next: number | null }> {
  if (!SKILLS.has(skill)) return fail('bad_query', `unknown skill "${skill}"`);
  const m = db.raw.query('SELECT action, xp FROM methods WHERE skill = ? AND level = ?').all(skill, level) as { action: string; xp: number }[];
  const items = (db.raw.query("SELECT e.type, e.slug, e.name FROM requirements r JOIN entities e ON e.type = 'item' AND e.key = r.subject_key WHERE r.subject_type = 'item' AND r.kind = 'skill' AND r.key = ? AND r.value = ?").all(skill, level) as { type: string; slug: string; name: string }[]).map(cand);
  const next = (db.raw.query("SELECT MIN(l) AS l FROM (SELECT level AS l FROM methods WHERE skill = ? AND level > ? UNION SELECT value FROM requirements WHERE kind = 'skill' AND key = ? AND value > ?)").get(skill, level, skill, level) as { l: number | null }).l;
  return ok({ skill, level, methods: m, items, next }, ['content:methods', 'content:items#levelrequire']);
}

const KIND_PATTERNS: Record<string, string[]> = { bank: ['bank booth', 'bank chest', 'bank'], anvil: ['anvil'], furnace: ['furnace'], range: ['range', 'stove', 'cooking range'], altar: ['altar'] };

export function nearest(db: WikiDb, kind: string, name: string | undefined, coord: Coord, limit: number): QueryResult<{ results: Located[] }> {
  let keys: { type: WikiType; key: string; slug: string; name: string }[] = [];
  if (kind === 'npc' || kind === 'loc') {
    if (!name) return fail('bad_query', 'name is required for kind npc or loc');
    const r = resolveEntity(db, kind, name);
    if (!r.ok) return r as never;
    keys = [{ type: kind, key: r.data.key, slug: r.data.slug, name: r.data.name }];
  } else {
    const pats = KIND_PATTERNS[kind];
    if (!pats) return fail('bad_query', `kind must be one of ${[...Object.keys(KIND_PATTERNS), 'npc', 'loc'].join(', ')}`);
    keys = pats.flatMap(p => (db.raw.query("SELECT type, key, slug, name FROM entities WHERE type = 'loc' AND lower(name) = ?").all(p) as typeof keys));
    if (!keys.length) return ok({ results: [] }, ['content:maps/*.jm2#LOC']);
  }
  const placeholders = keys.map(() => '?').join(',');
  const rows = db.raw.query(`SELECT kind, key, x, z, level, area FROM spawns WHERE kind = ? AND key IN (${placeholders})`).all(keys[0]!.type === 'npc' ? 'npc' : 'loc', ...keys.map(k => k.key)) as { key: string; x: number; z: number; level: number; area: string | null }[];
  const results = rows.map(r => { const k = keys.find(x => x.key === r.key)!; return { name: k.name, type: k.type, slug: k.slug, coord: { x: r.x, z: r.z, level: r.level }, area: r.area, distance: dist(coord, r) + (r.level === coord.level ? 0 : 1000) }; })
    .sort((a, b) => a.distance! - b.distance!).slice(0, limit).map(r => ({ ...r, distance: r.distance! % 1000 }));
  return ok({ results }, ['content:maps/*.jm2', 'derived:areas.ts:nearestArea'], 'derived');
}

export function where(db: WikiDb, name: string): QueryResult<{ subject: Candidate; results: Located[] }> {
  const tries: WikiType[] = ['npc', 'item', 'loc'];
  for (const t of tries) {
    const r = resolveEntity(db, t, name);
    if (!r.ok) continue;
    const rows = db.raw.query('SELECT x, z, level, area FROM spawns WHERE kind = ? AND key = ?').all(t === 'item' ? 'obj' : t, r.data.key) as { x: number; z: number; level: number; area: string | null }[];
    return ok({ subject: cand(r.data), results: rows.map(s => ({ name: r.data.name, type: t, slug: r.data.slug, coord: { x: s.x, z: s.z, level: s.level }, area: s.area })) }, ['content:maps/*.jm2'], 'derived');
  }
  return fail('not_found', `nothing named "${name}"`);
}

export function shops(db: WikiDb, q: { item?: string; area?: string }): QueryResult<{ shops: { shop: Candidate; coord: Coord | null; stock: { itemKey: string; count: number }[] }[] }> {
  const all = (db.raw.query("SELECT json FROM entities WHERE type = 'shop'").all() as { json: string }[]).map(r => JSON.parse(r.json) as { slug: string; name: string; key: string; stock: { itemKey: string; count: number }[]; coords: Coord[] });
  let list = all;
  if (q.item) { const it = resolveEntity(db, 'item', q.item); if (!it.ok) return it as never; list = all.filter(s => s.stock.some(st => st.itemKey === it.data.key)).map(s => ({ ...s, stock: s.stock.filter(st => st.itemKey === it.data.key) })); }
  if (q.area) { const a = resolveEntity(db, 'area', q.area); if (!a.ok) return a as never; const c = a.data.json['coord'] as Coord; list = list.filter(s => s.coords.some(x => dist(x, c) < 120)); }
  return ok({ shops: list.map(s => ({ shop: cand({ type: 'shop', slug: s.slug, name: s.name }), coord: s.coords[0] ?? null, stock: s.stock })) }, list.map(s => `content:inv#${s.key}`), 'derived');
}

export function questOrder(db: WikiDb, done: string[], members: boolean | undefined): QueryResult<{ available: { quest: Candidate; questPoints: number | null; skills: { skill: string; level: number }[] }[]; note: string }> {
  const quests = (db.raw.query("SELECT json FROM entities WHERE type = 'quest'").all() as { json: string }[]).map(r => JSON.parse(r.json) as { slug: string; name: string; key: string; varp: string; members: boolean; questPoints: number | null; requirements: { kind: string; key: string; value: number }[] });
  const doneVarps = new Set(quests.filter(q => done.includes(q.slug)).map(q => q.varp));
  const available = quests.filter(q => !done.includes(q.slug) && (members !== false || !q.members) && q.requirements.filter(r => r.kind === 'quest').every(r => [...doneVarps].some(v => v.startsWith(r.key))))
    .sort((a, b) => (b.questPoints ?? 0) - (a.questPoints ?? 0) || a.name.localeCompare(b.name))
    .map(q => ({ quest: cand({ type: 'quest', slug: q.slug, name: q.name }), questPoints: q.questPoints, skills: q.requirements.filter(r => r.kind === 'skill').map(r => ({ skill: r.key, level: r.value })) }));
  return ok({ available, note: 'Skill requirements are listed, not checked: pass the player\'s levels through get_state to filter.' }, ['derived:quests.ts:progression'], 'derived');
}

export function planContext(db: WikiDb, goal: string, budgetTokens: number): QueryResult<{ page: Candidate; markdown: string; requirements: unknown; obtain: unknown[] }> {
  const hit = db.search(goal, undefined, 1)[0];
  if (!hit) return fail('not_found', `nothing matches "${goal}"`);
  const page = db.getPage(hit.type, hit.slug)!;
  const cap = budgetTokens * 4;
  let md = `# ${page.title}\n\n${page.lead}\n\n`;
  const body = page.markdown.split('\n## ').slice(1).filter(s => !s.startsWith('Sources') && !s.startsWith('Build') && !s.startsWith('Trivia')).map(s => `## ${s}`).join('\n');
  md += body;
  const req = hit.type === 'quest' ? requirements(db, { quest: hit.slug }) : hit.type === 'item' ? requirements(db, { item: hit.slug }) : null;
  const obtainRows: unknown[] = [];
  if (req?.ok) for (const it of req.data.items.slice(0, 5)) { const o = obtain(db, it.slug); if (o.ok) obtainRows.push({ item: it, drops: o.data.drops.slice(0, 3), shops: o.data.shops.slice(0, 3), spawns: o.data.spawns.slice(0, 3) }); }
  if (md.length > cap) md = md.slice(0, cap - 20) + '\n\n[truncated]';
  return ok({ page: cand(hit), markdown: md, requirements: req?.ok ? req.data : null, obtain: obtainRows }, [`page:${hit.type}/${hit.slug}`], 'derived');
}
```

Run `cd server && ~/.bun/bin/bun test src/wiki/queries.test.ts` → PASS. The `distance: 36` expectation is `round(hypot(30, 20)) = 36`.

- [ ] **Step 4: Format and API dispatcher, failing test first**

`server/src/wiki/api.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { openWikiDb } from './db';
import { makeTestDb } from './testDb';
import { handleWikiApi } from './api';

const db = openWikiDb(makeTestDb())!;
const call = (p: string, accept = '*/*') => handleWikiApi(db, new URL(`http://x${p}`), new Request(`http://x${p}`, { headers: { accept } }));

describe('wiki api', () => {
  test('markdown by default with revision headers; json on request', async () => {
    const md = await call('/api/wiki/search?q=bronze');
    expect(md.headers.get('content-type')).toContain('text/markdown');
    expect(md.headers.get('x-wiki-revision')).toBe('225');
    expect(await md.text()).toContain('- item/bronze-axe — Bronze axe');
    const js = await call('/api/wiki/search?q=bronze&format=json');
    expect((await js.json() as { hits: { slug: string }[] }).hits[0]!.slug).toBe('bronze-axe');
    const js2 = await call('/api/wiki/search?q=bronze', 'application/json');
    expect(js2.headers.get('content-type')).toContain('application/json');
  });
  test('page with section filter; entity; schema', async () => {
    const t = await (await call('/api/wiki/page/item/bronze-axe?sections=Item%20sources')).text();
    expect(t).toContain('## Item sources');
    expect(t).not.toContain('## Bonuses');
    expect(((await (await call('/api/wiki/entity/item/1?format=json')).json()) as { key: string }).key).toBe('bronze_axe');
    expect(await (await call('/api/wiki/schema')).text()).toContain('# idlescape wiki API');
  });
  test('q routes and errors', async () => {
    expect((await call('/api/wiki/q/obtain?item=bronze+axe')).status).toBe(200);
    const amb = await call('/api/wiki/q/obtain?item=bronz&format=json');
    expect(amb.status).toBe(404);
    expect(((await amb.json()) as { error: string; candidates: unknown[] }).candidates.length).toBeGreaterThan(0);
    expect((await call('/api/wiki/q/nearest?kind=bank&x=3200&z=3200&level=0')).status).toBe(200);
    expect((await call('/api/wiki/q/nearest?kind=bank&x=abc')).status).toBe(400);
    expect((await call('/api/wiki/q/nope')).status).toBe(404);
    expect((await call('/api/wiki/q/plan-context?goal=bronze+axe&budget=200')).status).toBe(200);
  });
});
```

`server/src/wiki/format.ts`:

```ts
import type { QueryResult } from './types';

export function wantsJson(url: URL, req: Request): boolean {
  return url.searchParams.get('format') === 'json' || (req.headers.get('accept') ?? '').includes('application/json');
}

const fmtCoord = (c: { x: number; z: number; level: number }) => `(${c.x}, ${c.z}, ${c.level})`;

/** Compact markdown for Claude. One line per fact; sources at the end. */
export function toMarkdown(kind: string, r: QueryResult<unknown>): string {
  if (!r.ok) return `error: ${r.error}\n${r.message}\n${r.candidates?.length ? `candidates:\n${r.candidates.map(c => `- ${c.type}/${c.slug} — ${c.title}`).join('\n')}\n` : ''}`;
  const d = r.data as Record<string, unknown>;
  const lines: string[] = [];
  const list = (title: string, rows: string[]) => { if (rows.length) lines.push(`## ${title}`, ...rows, ''); };
  switch (kind) {
    case 'search': list('Results', (d['hits'] as { type: string; slug: string; title: string; snippet: string }[]).map(h => `- ${h.type}/${h.slug} — ${h.title}: ${h.snippet.replace(/<\/?b>/g, '')}`)); break;
    case 'obtain': {
      const o = d as { item: { title: string }; drops: { npc: { title: string; slug: string }; rate: string; quantity: string; condition: string | null }[]; shops: { shop: { title: string }; stock: number; coord: { x: number; z: number; level: number } | null }[]; spawns: { coord: { x: number; z: number; level: number }; area: string | null; distance?: number }[]; methods: { skill: string; level: number; action: string; xp: number }[]; quests: { title: string }[] };
      lines.push(`# How to obtain ${o.item.title}`, '');
      list('Drops', o.drops.map(x => `- ${x.npc.title} (npc/${x.npc.slug}): ${x.rate}, ${x.quantity}${x.condition ? `, ${x.condition}` : ''}`));
      list('Shops', o.shops.map(x => `- ${x.shop.title}: stock ${x.stock}${x.coord ? ` at ${fmtCoord(x.coord)}` : ''}`));
      list('Spawns', o.spawns.map(x => `- ${fmtCoord(x.coord)}${x.area ? ` in ${x.area}` : ''}${x.distance !== undefined ? `, ${x.distance} tiles away` : ''}`));
      list('Made by', o.methods.map(x => `- ${x.action} (${x.skill} ${x.level}, ${x.xp} xp)`));
      list('Quest rewards', o.quests.map(x => `- ${x.title}`));
      break;
    }
    default: lines.push('```json', JSON.stringify(d, null, 1), '```');
  }
  lines.push(`confidence: ${r.confidence}`, `sources: ${r.sources.slice(0, 12).join('; ')}`);
  return lines.join('\n') + '\n';
}
```

The `default` branch is the fallback for every other kind so nothing is unrepresentable; the implementer adds compact list formats for `drops`, `requirements`, `methods`, `unlocks`, `nearest`, `where`, `shops`, `quest-order` and `plan-context` in the same style as `obtain` (one line per row, coordinates via `fmtCoord`, rates as given), each with a one-line assertion in `api.test.ts` that the markdown contains its `##` heading.

`server/src/wiki/api.ts`:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { WikiDb } from './db';
import { toMarkdown, wantsJson } from './format';
import * as Q from './queries';
import type { QueryResult, WikiType } from './types';

const SCHEMA = readFileSync(path.join(import.meta.dir, 'schema.md'), 'utf8');
const TYPES = new Set<WikiType>(['item', 'npc', 'loc', 'quest', 'skill', 'shop', 'area', 'method', 'mechanic', 'guide']);

function respond(db: WikiDb, url: URL, req: Request, kind: string, r: QueryResult<unknown>): Response {
  const m = db.meta();
  const status = r.ok ? 200 : r.error === 'bad_query' ? 400 : 404;
  const headers: Record<string, string> = { 'x-wiki-revision': m.revision, 'x-wiki-build': m.contentSha, 'cache-control': 'no-cache' };
  if (wantsJson(url, req)) return Response.json(r.ok ? { ...(r.data as object), sources: r.sources, confidence: r.confidence, revision: m.revision } : { error: r.error, message: r.message, candidates: r.candidates ?? [] }, { status, headers });
  return new Response(toMarkdown(kind, r), { status, headers: { ...headers, 'content-type': 'text/markdown; charset=utf-8' } });
}

const num = (v: string | null, name: string): number => { if (v === null || v === '' || !Number.isFinite(Number(v))) throw new Error(`${name} must be a number`); return Number(v); };
const coordOf = (p: URLSearchParams) => ({ x: num(p.get('x'), 'x'), z: num(p.get('z'), 'z'), level: p.get('level') ? num(p.get('level'), 'level') : 0 });

export async function handleWikiApi(db: WikiDb, url: URL, req: Request): Promise<Response> {
  const p = url.searchParams;
  const seg = url.pathname.split('/').filter(Boolean).slice(2); // after api/wiki
  try {
    if (seg[0] === 'schema') return new Response(SCHEMA, { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
    if (seg[0] === 'search') {
      const q = p.get('q') ?? '';
      if (!q.trim()) return respond(db, url, req, 'search', { ok: false, error: 'bad_query', message: 'q is required' });
      const type = p.get('type') ?? undefined;
      const hits = db.search(q, type && TYPES.has(type as WikiType) ? type : undefined, Math.min(Number(p.get('limit') ?? 10) || 10, 50));
      return respond(db, url, req, 'search', { ok: true, data: { hits }, sources: [], confidence: 'verified' });
    }
    if (seg[0] === 'page' && seg[1] && seg[2]) {
      const page = db.getPage(seg[1], seg[2]);
      if (!page) return respond(db, url, req, 'page', { ok: false, error: 'not_found', message: `no page ${seg[1]}/${seg[2]}`, candidates: db.search(seg[2].replace(/-/g, ' '), seg[1], 5) });
      const want = p.get('sections')?.split(',').map(s => s.trim().toLowerCase());
      let md = page.markdown;
      if (want) { const head = md.split('\n## ')[0]!; const secs = md.split('\n## ').slice(1).filter(s => want.includes(s.split('\n')[0]!.replace(/\s*\*\(.*\)\*$/, '').trim().toLowerCase())); md = [head, ...secs.map(s => `## ${s}`)].join('\n'); }
      if (wantsJson(url, req)) return respond(db, url, req, 'page', { ok: true, data: { type: page.type, slug: page.slug, title: page.title, lead: page.lead, markdown: md, sections: JSON.parse(page.sections_json) as unknown, entity: JSON.parse(db.getEntity(page.type, page.slug)?.json ?? 'null') as unknown }, sources: [], confidence: 'verified' });
      return new Response(md, { headers: { 'content-type': 'text/markdown; charset=utf-8', 'x-wiki-revision': db.meta().revision } });
    }
    if (seg[0] === 'entity' && seg[1] && seg[2]) {
      const e = db.getEntity(seg[1], decodeURIComponent(seg[2]));
      return respond(db, url, req, 'entity', e ? { ok: true, data: JSON.parse(e.json) as unknown, sources: [`content:${e.type}#${e.key}`], confidence: 'verified' } : { ok: false, error: 'not_found', message: `no ${seg[1]} ${seg[2]}`, candidates: db.search(seg[2], seg[1], 5) });
    }
    if (seg[0] === 'q' && seg[1]) {
      const kind = seg[1];
      const near = p.has('near') ? (() => { const [x, z, l] = p.get('near')!.split(',').map(Number); return { x: x!, z: z!, level: l ?? 0 }; })() : undefined;
      const r: QueryResult<unknown> | null =
        kind === 'obtain' ? Q.obtain(db, p.get('item') ?? '', near)
        : kind === 'drops' ? Q.drops(db, p.get('npc') ?? '')
        : kind === 'requirements' ? Q.requirements(db, { quest: p.get('quest') ?? undefined, item: p.get('item') ?? undefined })
        : kind === 'unlocks' ? Q.unlocks(db, p.get('skill') ?? '', num(p.get('level'), 'level'))
        : kind === 'methods' ? Q.methods(db, p.get('skill') ?? '', num(p.get('level'), 'level'), p.get('members') === null ? undefined : p.get('members') === 'true')
        : kind === 'nearest' ? Q.nearest(db, p.get('kind') ?? '', p.get('name') ?? undefined, coordOf(p), Math.min(Number(p.get('limit') ?? 5) || 5, 25))
        : kind === 'where' ? Q.where(db, p.get('name') ?? '')
        : kind === 'shops' ? Q.shops(db, { item: p.get('item') ?? undefined, area: p.get('area') ?? undefined })
        : kind === 'quest-order' ? Q.questOrder(db, (p.get('done') ?? '').split(',').filter(Boolean), p.get('members') === null ? undefined : p.get('members') === 'true')
        : kind === 'plan-context' ? Q.planContext(db, p.get('goal') ?? '', Math.min(Number(p.get('budget') ?? 3000) || 3000, 12000))
        : null;
      if (!r) return Response.json({ error: 'not_found', message: `unknown query kind "${kind}"` }, { status: 404 });
      return respond(db, url, req, kind, r);
    }
    return Response.json({ error: 'not_found', message: 'see /api/wiki/schema' }, { status: 404 });
  } catch (err) {
    return respond(db, url, req, seg[1] ?? seg[0] ?? 'api', { ok: false, error: 'bad_query', message: err instanceof Error ? err.message : String(err) });
  }
}
```

Rate limiting (120 per minute per token or cookie) reuses the per-IP cooldown helper pattern from `gate.ts`: add a `Map<string, number[]>` keyed by the bearer token hash or `cs_gate` cookie value in `routes.ts`, prune timestamps older than 60 s, return 429 `{ error: 'rate_limited' }` past 120. Test it in `api.test.ts` by calling 121 times with the same header.

- [ ] **Step 5: Write `server/src/wiki/schema.md`**

Document every route with one example request line each in fenced blocks starting with `GET `, the response shape (markdown and JSON), the error object, the header names, the rate limit, and the note that skill requirements in `quest-order` are listed not checked. Start the file with `# idlescape wiki API`. Add a contract test at the bottom of `api.test.ts`:

```ts
  test('every GET example in schema.md answers 200', async () => {
    const schema = await (await call('/api/wiki/schema')).text();
    const examples = [...schema.matchAll(/^GET (\/api\/wiki\/\S+)/gm)].map(m => m[1]!);
    expect(examples.length).toBeGreaterThan(12);
    for (const ex of examples) expect((await call(ex)).status, ex).toBe(200);
  });
```

Examples must use entities that exist in the test fixture (`bronze axe`, `goblin`, `woodcutting`, `lumbridge`).

- [ ] **Step 6: Run the server suite, typecheck, and try it live**

Run: `cd server && ~/.bun/bin/bun test && ~/.bun/bin/bun run typecheck`. With the stack up and the gate cookie in the browser, open `/api/wiki/q/obtain?item=bronze+axe` and `/api/wiki/q/nearest?kind=bank&x=3222&z=3218` and read the markdown. From a terminal without a cookie, `curl -i http://localhost:8787/api/wiki/search?q=axe` must return 401.

- [ ] **Step 7: Commit**

```bash
git add server/src/wiki
git commit -m "feat(server): wiki query api with question-shaped routes, markdown-first responses, schema contract test"
```

---

### Task 16: Root wiring, docs, credits, authoring guide, first overlays and mechanics pages

**Files:**
- Modify: `package.json` (root), `README.md`, `CREDITS.md`, `wiki/gen/render/index.ts` (register standalone titles in the name index), `docs/superpowers/specs/2026-09-05-spw-wiki-corpus-design.md` (status line)
- Create: `wiki/AUTHORING.md`, `wiki/content/quests/cooks-assistant.md`, `wiki/content/mechanics/game-tick.md`, `wiki/content/mechanics/experience-table.md`, `wiki/content/mechanics/combat-level.md`, `wiki/content/mechanics/coordinates.md`
- Test: `wiki/gen/render/standalone.test.ts`

- [ ] **Step 1: Root scripts and ignore**

Root `package.json` scripts: add `"wiki:extract": "bun run --cwd wiki extract"`, `"wiki:build": "bun run --cwd wiki build"`, `"wiki:test": "bun run --cwd wiki test"`. When `scripts/build.ps1` and `scripts/verify.ps1` exist (SP1 Tasks 15 to 17), add `& $bun run --cwd wiki build` to build and `& $bun run --cwd wiki test` to verify; until then the root scripts are the entry points and README says so.

- [ ] **Step 2: Standalone pages resolve by title, with a failing test**

`wiki/gen/render/standalone.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { renderAll } from './index';
import { parseOverlay } from './overlay';
import { data } from './fixture';

const tick = parseOverlay(`---
type: mechanic
slug: game-tick
title: Game tick
lead: The **Game tick** is the 600 millisecond cycle the server runs on.
sources:
  lead: engine:src/engine/World.ts#tick
---
## Details

Every action resolves on a tick boundary. <!-- src: engine:src/engine/World.ts#tick -->
`, 'content/mechanics/game-tick.md');
const quest = parseOverlay(`---
type: item
key: bronze_axe
---
## Trivia

Chopping takes several [[Game tick]]s per swing. <!-- src: engine:src/engine/World.ts#tick -->
`, 'content/items/bronze-axe.md');

describe('standalone pages', () => {
  test('render as pages and are linkable by title from other overlays', () => {
    const { pages, problems } = renderAll(data, [tick, quest]);
    expect(problems.filter(p => p.level === 'error')).toEqual([]);
    expect(pages.find(p => p.type === 'mechanic' && p.slug === 'game-tick')!.markdown).toContain('# Game tick');
    expect(pages.find(p => p.slug === 'bronze-axe')!.markdown).toContain('[Game tick](/wiki/mechanic/game-tick)');
  });
});
```

In `renderAll`, before rendering, register standalone overlays in the name index:

```ts
  for (const ov of overlays) if (ov.standalone) ctx.nameIndex.set(ov.standalone.title.toLowerCase(), { type: ov.type, slug: ov.standalone.slug });
```

Run `cd wiki && ~/.bun/bin/bun test gen/render/standalone.test.ts` → PASS.

- [ ] **Step 3: Write `wiki/AUTHORING.md`**

Sections: purpose; where overlays live and how they are named (`content/<type>s/<slug>.md`, front matter `type` and `key` for entity overlays, `type`, `slug`, `title`, `lead` for standalone pages); the section-replacement rule and the `disputes: content` rule; the source comment syntax `<!-- src: kind:ref -->` and the seven kinds with examples; the research order (entity JSON and scripts first, period sources second, OSRS Wiki third, editorial last); the authoring prompt to paste into a Claude Code session (give it verbatim: the STYLE.md path, the entity JSON path under `wiki/data/225/`, the script paths, the citation list, the instruction to cite every sentence, to never paste from other wikis, and to output only the overlay file); the review prompt for a second session (check every claim against the cited source, check voice against STYLE.md, check links resolve); the phase table (A: free-to-play quests and mechanics; B: members quests; C: monsters and strategy; D: skills and areas) with a checkbox per phase and the coverage gate percentage from spec section 11; and the command sequence `bun run --cwd wiki lint` then `build`.

- [ ] **Step 4: Write the mechanics pages**

Each is a standalone overlay with `type: mechanic`. Every sentence carries a source comment.

`wiki/content/mechanics/game-tick.md`: lead states the 600 ms server cycle (source `engine:src/engine/World.ts` where the tick interval is defined; the implementer greps `600` in `World.ts` and cites the line). Sections: Details (actions, movement of one or two tiles per tick when walking or running, respawn timers expressed in ticks as seen in `respawnrate`), Conversions (a table of ticks to seconds for 1, 5, 10, 25, 50, 100).

`wiki/content/mechanics/experience-table.md`: lead states the formula; Details section gives the formula in words and the table of level, xp and xp difference for levels 1 to 99 generated by running `xpForLevel` (paste the output; source `engine:src/engine/entity/Player.ts#levelExperience`).

`wiki/content/mechanics/combat-level.md`: lead and the formula from `engine:src/engine/entity/Player.ts#getCombatLevel`, worked example for a fresh account (level 3), and the note that NPC levels on this wiki use `vislevel` when set and the same formula otherwise (`derived:npcs.ts:npcCombatLevel`).

`wiki/content/mechanics/coordinates.md`: lead on absolute `(x, z, level)`; Details on the packed `level_mx_mz_lx_lz` form used in scripts and maps and the conversion (`engine:src/engine/CoordGrid.ts`, `content:maps/*.jm2`), zones of 8 by 8 tiles and map squares of 64 by 64, and the area labels in `maps/labels.txt`.

- [ ] **Step 5: Write the exemplar quest overlay `wiki/content/quests/cooks-assistant.md`**

Front matter `type: quest`, `key: quest_cook`, infobox `Length: Very short` and `Difficulty: Novice` with `sources` for both as `period:` Wayback URLs of a 2004 or 2005 quest guide the implementer locates (tip.it or RuneHQ; if none can be found, use `editorial:cs:<date>` and say so in the row). Sections: Walkthrough rewritten as numbered player steps in second person (allowed there), each step citing `content:scripts/quests/quest_cook/scripts/quest_cook.rs2#<label>` or the Lumbridge cook script; item locations for the bucket of milk, egg and pot of flour cited from the item pages' spawn data (`content:maps/*.jm2#OBJ`) and, for the flour, from the mill scripts (`content:scripts/...` found by grepping `pot_flour` in `engine/content/scripts`); Rewards left to the generated section; Trivia with one line about the cake examine text cited from the obj config.

Run `cd wiki && ~/.bun/bin/bun run lint && ~/.bun/bin/bun run build` → zero errors. Open `/wiki/quest/cooks-assistant` and `/wiki/mechanic/experience-table` in the browser.

- [ ] **Step 6: README, CREDITS, spec status**

`README.md`: add a "Wiki" section after "Run": what it is, `npm run wiki:extract` then `npm run wiki:build`, where the reader lives (`/wiki`, linked from the title bar), the API entry point (`/api/wiki/schema`), and where overlays go (`wiki/AUTHORING.md`).

`CREDITS.md` Inspiration table: add `| [Old School RuneScape Wiki](https://oldschool.runescape.wiki) | CC BY-NC-SA 3.0 | Page anatomy, section order and editorial voice for our wiki. No text or data copied; cited as a modern analogue where our pack cannot answer. |` and `| [LostHQ](https://2004.losthq.rs) | not stated | Scope of a Lost City reference site. No data copied. |`. Add a short "Sources" paragraph under the tables explaining the citation kinds in wiki pages and that `cited` URLs are the Content authors' own provenance.

Spec `2026-09-05-spw-wiki-corpus-design.md`: change `Status: draft for owner review` to `Status: approved 2026-09-05 by the project owner ("agreed"); plan at docs/superpowers/plans/2026-09-05-spw-wiki-corpus.md`.

- [ ] **Step 7: Full verification**

Run, from the repo root: `npm run wiki:test`, `cd server && ~/.bun/bin/bun test && ~/.bun/bin/bun run typecheck`, `cd web && npm test && npm run lint && npm run typecheck`, then with the stack up, `cd web && npx playwright test`. All green.

- [ ] **Step 8: Commit**

```bash
git add package.json README.md CREDITS.md wiki/AUTHORING.md wiki/content wiki/gen/render docs/superpowers/specs/2026-09-05-spw-wiki-corpus-design.md
git commit -m "docs(wiki): authoring guide, mechanics pages, cooks assistant overlay, credits and readme"
```

---

## After this plan

- **Authoring backlog** (spec section 7 and 12 step 6): phases A to D are worked in separate sessions using `wiki/AUTHORING.md`; each phase ends by ticking its box in that file, which the coverage gate in `wiki/gen/build.ts` reads (implement the gate when phase A is declared done: parse the checked boxes and fail the build if required stubs exceed 20% for that phase's page types).
- **SP4 MCP tools** `wiki_search`, `wiki_page`, `wiki_query` and resource `idlescape://wiki-schema` call `handleWikiApi` in-process; add them to the SP4 plan as one task that also wires `createWikiAuth({ verifyBearer })` to the agent token store.
- **Sprites**: follow-up plan driving the client's `ObjType` icon renderer headlessly to fill `/wiki/sprites/<type>/<id>.png`.
- **Revision 274**: after SP1b, run `npm run wiki:extract` with `REVISION = 274`, commit `wiki/data/274/`, and generate the "Changes" section by diffing entity JSON across `data/225` and `data/274`.
