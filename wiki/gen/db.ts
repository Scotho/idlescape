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
CREATE TABLE drops (npc_key TEXT, subject_kind TEXT NOT NULL, item_key TEXT, min INTEGER, max INTEGER, num INTEGER, den INTEGER, condition TEXT, table_name TEXT, sources_json TEXT);
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
    meta.run('revision', String(data.manifest.revision));
    meta.run('contentSha', data.manifest.contentSha);
    meta.run('engineSha', data.manifest.engineSha);
    meta.run('generatedAt', data.manifest.generatedAt);
    const ent = db.prepare('INSERT INTO entities VALUES (?, ?, ?, ?, ?, ?, ?)');
    const alias = db.prepare('INSERT INTO aliases VALUES (?, ?, ?)');
    const all = [...data.items, ...data.npcs, ...data.locs, ...data.quests, ...data.skills, ...data.shops, ...data.areas];
    // Built once up front so relation loops below are O(1) lookups, not O(n) Array.find scans over ~100k rows.
    const slugByTypeKey = new Map(all.map(e => [`${e.type}:${e.key}`, e.slug]));
    const slugOf = (type: string, key: string) => slugByTypeKey.get(`${type}:${key}`);
    for (const e of all) {
      ent.run(e.type, e.id, e.key, e.slug, e.name, e.members ? 1 : 0, JSON.stringify(e));
      for (const a of new Set([e.name.toLowerCase(), ...e.aliases])) alias.run(a, e.type, e.slug);
    }
    const pg = db.prepare('INSERT INTO pages VALUES (?, ?, ?, ?, ?, ?, ?)');
    const fts = db.prepare('INSERT INTO search VALUES (?, ?, ?, ?, ?, ?)');
    const link = db.prepare('INSERT INTO links VALUES (?, ?, ?, ?, ?)');
    const aliasOf = new Map(all.map(e => [`${e.type}/${e.slug}`, e.aliases.join(' ')]));
    for (const p of pages) {
      pg.run(p.type, p.slug, p.title, p.lead, p.markdown, p.html, JSON.stringify(p.sections));
      fts.run(p.title, aliasOf.get(`${p.type}/${p.slug}`) ?? '', p.lead, p.markdown.replace(/## Sources[\s\S]*$/, ''), p.type, p.slug);
      for (const l of p.links) link.run(p.type, p.slug, l.toType, l.toSlug, l.relation);
    }
    for (const s of data.shops) for (const st of s.stock) { const to = slugOf('item', st.itemKey); if (to) link.run('shop', s.slug, 'item', to, 'sells'); }
    for (const d of data.drops) { if (d.subjectKind !== 'npc') continue; const from = slugOf('npc', d.npcKey), to = slugOf('item', d.itemKey); if (from && to) link.run('npc', from, 'item', to, 'drops'); }
    for (const q of data.quests) for (const r of q.rewards) if (r.kind === 'item') { const to = slugOf('item', r.key); if (to) link.run('quest', q.slug, 'item', to, 'rewards'); }
    const sp = db.prepare('INSERT INTO spawns VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const s of data.spawns) sp.run(s.kind, s.key, s.id, s.coord.x, s.coord.z, s.coord.level, s.count, s.area);
    const me = db.prepare('INSERT INTO methods VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const m of data.methods) me.run(m.skill, m.level, m.xp, m.action, JSON.stringify(m.inputs), JSON.stringify(m.outputs), m.table, m.row, JSON.stringify(m.sources));
    const dr = db.prepare('INSERT INTO drops VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const d of data.drops) dr.run(d.npcKey, d.subjectKind, d.itemKey, d.min, d.max, d.num, d.den, d.condition, d.table, JSON.stringify(d.sources));
    const rq = db.prepare('INSERT INTO requirements VALUES (?, ?, ?, ?, ?)');
    for (const q of data.quests) {
      for (const r of q.requirements) rq.run('quest', q.key, r.kind, r.key, r.value);
      for (const k of q.itemsChecked) rq.run('quest', q.key, 'item', k, 1);
    }
    for (const it of data.items) for (const r of it.levelRequire) rq.run('item', it.key, 'skill', r.skill, r.level);
  });
  tx();
  db.close();
}
