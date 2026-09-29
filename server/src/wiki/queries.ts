import type { WikiDb } from './db';
import type { Candidate, Coord, Located, ObtainData, QueryResult, SpawnGroup, WikiType } from './types';

type Ok<T> = Extract<QueryResult<T>, { ok: true }>;
const ok = <T,>(data: T, sources: string[], confidence: Ok<T>['confidence'] = 'verified'): QueryResult<T> => ({ ok: true, data, sources: [...new Set(sources)], confidence });
const fail = <T,>(error: 'not_found' | 'ambiguous' | 'bad_query', message: string, candidates?: Candidate[]): QueryResult<T> => ({ ok: false, error, message, candidates });
const cand = (r: { type: string; slug: string; name?: string; title?: string; members?: number | boolean | null }): Candidate => {
  const c: Candidate = { type: r.type as WikiType, slug: r.slug, title: r.title ?? r.name ?? r.slug };
  if (r.members !== undefined && r.members !== null) c.members = r.members === 1 || r.members === true;
  return c;
};
const dist = (a: Coord, b: Coord) => Math.round(Math.hypot(a.x - b.x, a.z - b.z));
const rate = (num: number, den: number) => { const g = (x: number, y: number): number => (y ? g(y, x % y) : x); const d = g(num, den) || 1; return num >= den ? 'Always' : `${num / d}/${den / d}`; };
const SKILLS = new Set(['attack', 'strength', 'ranged', 'magic', 'defence', 'hitpoints', 'prayer', 'agility', 'herblore', 'thieving', 'crafting', 'runecraft', 'mining', 'smithing', 'fishing', 'cooking', 'firemaking', 'woodcutting', 'fletching']);

/** Escapes `\`, `%` and `_` for a `LIKE ... ESCAPE '\'` pattern, so a user-supplied key can be
 * used as a safe prefix search without its own characters being read as wildcards. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, ch => `\\${ch}`);
}

/** Nearest `area` entity to a coordinate, within 120 tiles, or null. Returned as the area's slug
 * to match the convention spawns already use for their `area` column. */
function nearestAreaSlug(db: WikiDb, coord: Coord | null): string | null {
  if (!coord) return null;
  const areas = (db.raw.query("SELECT json FROM entities WHERE type = 'area'").all() as { json: string }[]).map(r => JSON.parse(r.json) as { slug: string; coord: Coord });
  let best: { slug: string; d: number } | null = null;
  for (const a of areas) { const d = dist(coord, a.coord); if (d <= 120 && (!best || d < best.d)) best = { slug: a.slug, d }; }
  return best?.slug ?? null;
}

export function resolveEntity(db: WikiDb, type: WikiType, ref: string): QueryResult<{ type: WikiType; slug: string; name: string; key: string; members: boolean; json: Record<string, unknown> }> {
  const e = db.getEntity(type, ref.trim());
  if (e) return ok({ type: e.type, slug: e.slug, name: e.name, key: e.key, members: e.members === 1, json: JSON.parse(e.json) as Record<string, unknown> }, []);
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
  const dropRows = db.raw.query("SELECT d.*, e.slug, e.name, e.members FROM drops d JOIN entities e ON e.type = ? AND e.key = d.npc_key WHERE d.item_key = ? AND d.subject_kind = 'npc' ORDER BY CAST(d.num AS REAL)/d.den DESC").all('npc', key) as { npc_key: string; slug: string; name: string; members: number; min: number; max: number; num: number; den: number; condition: string | null; sources_json: string }[];
  const drops = dropRows.map(d => { sources.push(...srcs(d.sources_json)); return { npc: cand({ type: 'npc', slug: d.slug, name: d.name, members: d.members }), rate: rate(d.num, d.den), chance: d.num / d.den, quantity: d.min === d.max ? String(d.min) : `${d.min}-${d.max}`, condition: d.condition }; });
  // A shared `drop_table` dbrow (gem_rock_table, ...) is rolled from, not killed: it has no NPC
  // entity to join to, so it gets its own list rather than being silently dropped by that join.
  const tableRows = db.raw.query("SELECT table_name, min, max, num, den, sources_json FROM drops WHERE item_key = ? AND subject_kind = 'table' ORDER BY CAST(num AS REAL)/den DESC").all(key) as { table_name: string; min: number; max: number; num: number; den: number; sources_json: string }[];
  const tables = tableRows.map(t => { sources.push(...srcs(t.sources_json)); return { table: t.table_name, rate: rate(t.num, t.den), chance: t.num / t.den, quantity: t.min === t.max ? String(t.min) : `${t.min}-${t.max}` }; });
  const shopRows = db.raw.query('SELECT json FROM entities WHERE type = ?').all('shop') as { json: string }[];
  const shops = shopRows.map(r => JSON.parse(r.json) as { slug: string; name: string; members: boolean; stock: { itemKey: string; count: number }[]; coords: Coord[] }).filter(s => s.stock.some(st => st.itemKey === key))
    .map(s => { const areaSlug = nearestAreaSlug(db, s.coords[0] ?? null); return { shop: cand({ type: 'shop', slug: s.slug, name: s.name, members: s.members }), stock: s.stock.find(st => st.itemKey === key)!.count, coord: s.coords[0] ?? null, area: db.areaName(areaSlug), areaSlug }; });
  const spawnRows = db.raw.query('SELECT x, z, level, area FROM spawns WHERE kind = ? AND key = ?').all('obj', key) as { x: number; z: number; level: number; area: string | null }[];
  const spawns: Located[] = spawnRows.map(s => ({ name: it.data.name, type: 'item' as const, slug: it.data.slug, coord: { x: s.x, z: s.z, level: s.level }, area: db.areaName(s.area), areaSlug: s.area, distance: near ? dist(near, s) : undefined })).sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  const methodRows = db.raw.query('SELECT m.skill, m.level, m.action, m.xp, m.sources_json FROM methods m, json_each(m.outputs_json) WHERE json_each.value = ?').all(key) as { skill: string; level: number; action: string; xp: number; sources_json: string }[];
  const methods = methodRows.map(m => { sources.push(...srcs(m.sources_json)); return { skill: m.skill, level: m.level, action: m.action, xp: m.xp }; });
  const questRows = db.raw.query("SELECT e.slug, e.name, e.members FROM links l JOIN entities e ON e.type = 'quest' AND e.slug = l.from_slug WHERE l.relation = 'rewards' AND l.to_type = 'item' AND l.to_slug = ?").all(it.data.slug) as { slug: string; name: string; members: number }[];
  return ok({ item: cand(it.data), drops, tables, shops, spawns, methods, quests: questRows.map(q => cand({ type: 'quest', ...q })) }, sources, conf(sources));
}

export function drops(db: WikiDb, npcRef: string): QueryResult<{ npc: Candidate; drops: { item: Candidate; rate: string; chance: number; quantity: string; condition: string | null; table: string }[] }> {
  const n = resolveEntity(db, 'npc', npcRef);
  if (!n.ok) return n as never;
  const rows = db.raw.query("SELECT d.*, e.slug, e.name, e.members FROM drops d JOIN entities e ON e.type = ? AND e.key = d.item_key WHERE d.npc_key = ? AND d.subject_kind = 'npc' ORDER BY CAST(d.num AS REAL)/d.den DESC").all('item', n.data.key) as { slug: string; name: string; members: number; min: number; max: number; num: number; den: number; condition: string | null; table_name: string; sources_json: string }[];
  const sources = rows.flatMap(r => srcs(r.sources_json));
  return ok({ npc: cand(n.data), drops: rows.map(r => ({ item: cand({ type: 'item', slug: r.slug, name: r.name, members: r.members }), rate: rate(r.num, r.den), chance: r.num / r.den, quantity: r.min === r.max ? String(r.min) : `${r.min}-${r.max}`, condition: r.condition, table: r.table_name })) }, sources, conf(sources));
}

export function requirements(db: WikiDb, q: { quest?: string; item?: string }): QueryResult<{ subject: Candidate; skills: { skill: string; level: number }[]; quests: Candidate[]; items: Candidate[]; questPoints: number | null }> {
  const type: WikiType = q.quest ? 'quest' : 'item';
  const r = resolveEntity(db, type, q.quest ?? q.item ?? '');
  if (!r.ok) return r as never;
  const rows = db.raw.query('SELECT kind, key, value FROM requirements WHERE subject_type = ? AND subject_key = ?').all(type, r.data.key) as { kind: string; key: string; value: number }[];
  const skills = rows.filter(x => x.kind === 'skill').map(x => ({ skill: x.key, level: x.value }));
  const questByVarp = (varp: string): { type: string; slug: string; name: string; members: number } | null => {
    const exact = db.raw.query("SELECT type, slug, name, members FROM entities WHERE type = 'quest' AND json_extract(json, '$.varp') = ?").get(varp) as { type: string; slug: string; name: string; members: number } | null;
    if (exact) return exact;
    // The requirement key can be a prefix of the target quest's varp (e.g. `cook` vs `cookquest`);
    // escape it before using it as a LIKE pattern so its own `%`/`_` can't be read as wildcards.
    return db.raw.query("SELECT type, slug, name, members FROM entities WHERE type = 'quest' AND json_extract(json, '$.varp') LIKE ? ESCAPE '\\'").get(`${escapeLike(varp)}%`) as { type: string; slug: string; name: string; members: number } | null;
  };
  const quests = rows.filter(x => x.kind === 'quest').map(x => questByVarp(x.key)).filter((x): x is NonNullable<typeof x> => !!x).map(cand);
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
  const results: Located[] = rows.map(r => {
    const k = keys.find(x => x.key === r.key)!;
    const sameLevel = r.level === coord.level;
    return { name: k.name, type: k.type, slug: k.slug, coord: { x: r.x, z: r.z, level: r.level }, area: db.areaName(r.area), areaSlug: r.area, distance: dist(coord, r), sameLevel };
  }).sort((a, b) => (Number(!a.sameLevel) - Number(!b.sameLevel)) || (a.distance! - b.distance!)).slice(0, limit);
  return ok({ results }, ['content:maps/*.jm2', 'derived:areas.ts:nearestArea'], 'derived');
}

export const WHERE_DEFAULT_GROUPS = 200;
export const WHERE_MAX_GROUPS = 500;

/** Every spawn of a subject, grouped by area. Common scenery has tens of thousands of placements
 * (`cavewall_top` alone answered 2.3 MB one row at a time), so the answer is a count and one
 * example coordinate per area, biggest area first, capped at `limit` groups. */
export function where(db: WikiDb, name: string, limit = WHERE_DEFAULT_GROUPS): QueryResult<{ subject: Candidate; total: number; areas: number; results: SpawnGroup[] }> {
  const cap = Math.max(1, Math.min(Math.floor(limit) || WHERE_DEFAULT_GROUPS, WHERE_MAX_GROUPS));
  const tries: WikiType[] = ['npc', 'item', 'loc'];
  for (const t of tries) {
    const r = resolveEntity(db, t, name);
    if (!r.ok) continue;
    const kind = t === 'item' ? 'obj' : t;
    const total = (db.raw.query('SELECT COUNT(*) n FROM spawns WHERE kind = ? AND key = ?').get(kind, r.data.key) as { n: number }).n;
    const groups = db.raw.query('SELECT area, COUNT(*) n FROM spawns WHERE kind = ? AND key = ? GROUP BY area ORDER BY n DESC, area').all(kind, r.data.key) as { area: string | null; n: number }[];
    const exampleQ = db.raw.query('SELECT x, z, level FROM spawns WHERE kind = ? AND key = ? AND area IS ? ORDER BY level, x, z LIMIT 1');
    const results: SpawnGroup[] = groups.slice(0, cap).map(g => ({
      area: db.areaName(g.area), areaSlug: g.area, count: g.n,
      example: exampleQ.get(kind, r.data.key, g.area) as Coord
    }));
    return ok({ subject: cand(r.data), total, areas: groups.length, results }, ['content:maps/*.jm2'], 'derived');
  }
  return fail('not_found', `nothing named "${name}"`);
}

export function shops(db: WikiDb, q: { item?: string; area?: string }): QueryResult<{ shops: { shop: Candidate; coord: Coord | null; area: string | null; areaSlug: string | null; stock: { itemKey: string; count: number }[] }[] }> {
  const all = (db.raw.query("SELECT json FROM entities WHERE type = 'shop'").all() as { json: string }[]).map(r => JSON.parse(r.json) as { slug: string; name: string; key: string; members: boolean; stock: { itemKey: string; count: number }[]; coords: Coord[] });
  let list = all;
  if (q.item) { const it = resolveEntity(db, 'item', q.item); if (!it.ok) return it as never; list = all.filter(s => s.stock.some(st => st.itemKey === it.data.key)).map(s => ({ ...s, stock: s.stock.filter(st => st.itemKey === it.data.key) })); }
  if (q.area) { const a = resolveEntity(db, 'area', q.area); if (!a.ok) return a as never; const c = a.data.json['coord'] as Coord; list = list.filter(s => s.coords.some(x => dist(x, c) < 120)); }
  return ok({ shops: list.map(s => { const areaSlug = nearestAreaSlug(db, s.coords[0] ?? null); return { shop: cand({ type: 'shop', slug: s.slug, name: s.name, members: s.members }), coord: s.coords[0] ?? null, area: db.areaName(areaSlug), areaSlug, stock: s.stock }; }) }, list.map(s => `content:inv#${s.key}`), 'derived');
}

export function questOrder(db: WikiDb, done: string[], members: boolean | undefined): QueryResult<{ available: { quest: Candidate; questPoints: number | null; skills: { skill: string; level: number }[] }[]; note: string }> {
  const quests = (db.raw.query("SELECT json FROM entities WHERE type = 'quest'").all() as { json: string }[]).map(r => JSON.parse(r.json) as { slug: string; name: string; key: string; varp: string; members: boolean; questPoints: number | null; requirements: { kind: string; key: string; value: number }[] });
  const doneVarps = new Set(quests.filter(q => done.includes(q.slug)).map(q => q.varp));
  const available = quests.filter(q => !done.includes(q.slug) && (members !== false || !q.members) && q.requirements.filter(r => r.kind === 'quest').every(r => [...doneVarps].some(v => v.startsWith(r.key))))
    .sort((a, b) => (b.questPoints ?? 0) - (a.questPoints ?? 0) || a.name.localeCompare(b.name))
    .map(q => ({ quest: cand({ type: 'quest', slug: q.slug, name: q.name, members: q.members }), questPoints: q.questPoints, skills: q.requirements.filter(r => r.kind === 'skill').map(r => ({ skill: r.key, level: r.value })) }));
  return ok({ available, note: 'Skill requirements are listed, not checked: pass the player\'s levels through get_state to filter.' }, ['derived:quests.ts:progression'], 'derived');
}

export function planContext(db: WikiDb, goal: string, budgetTokens: number): QueryResult<{ page: Candidate; markdown: string; requirements: unknown; obtain: unknown[] }> {
  const hit = db.search(goal, undefined, 1)[0];
  if (!hit) return fail('not_found', `nothing matches "${goal}"`);
  const page = db.getPage(hit.type, hit.slug)!;
  const cap = Math.max(50, budgetTokens) * 4;
  let md = `# ${page.title}\n\n${page.lead}\n\n`;
  const body = page.markdown.split('\n## ').slice(1).filter(s => !s.startsWith('Sources') && !s.startsWith('Build') && !s.startsWith('Trivia')).map(s => `## ${s}`).join('\n');
  md += body;
  const req = hit.type === 'quest' ? requirements(db, { quest: hit.slug }) : hit.type === 'item' ? requirements(db, { item: hit.slug }) : null;
  const obtainRows: unknown[] = [];
  if (req?.ok) for (const it of req.data.items.slice(0, 5)) { const o = obtain(db, it.slug); if (o.ok) obtainRows.push({ item: it, drops: o.data.drops.slice(0, 3), shops: o.data.shops.slice(0, 3), spawns: o.data.spawns.slice(0, 3) }); }
  if (md.length > cap) md = md.slice(0, cap - 20) + '\n\n[truncated]';
  return ok({ page: cand(hit), markdown: md, requirements: req?.ok ? req.data : null, obtain: obtainRows }, [`page:${hit.type}/${hit.slug}`], 'derived');
}
