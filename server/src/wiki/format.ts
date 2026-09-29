import { SNIPPET_CLOSE, SNIPPET_OPEN } from './db';
import type { Candidate, Coord, Located, QueryResult, SpawnGroup } from './types';

export function wantsJson(url: URL, req: Request): boolean {
  return url.searchParams.get('format') === 'json' || (req.headers.get('accept') ?? '').includes('application/json');
}

/** Strips the private-use FTS snippet sentinels (U+E000/U+E001) so raw snippet text is safe to
 * hand an agent as markdown or JSON - neither form should carry the internal highlight markers. */
export function plainSnippet(s: string): string {
  return s.split(SNIPPET_OPEN).join('').split(SNIPPET_CLOSE).join('');
}

const fmtCoord = (c: Coord) => `(${c.x}, ${c.z}, ${c.level})`;
const locLine = (r: Located) => `${fmtCoord(r.coord)}${r.area ? ` in ${r.area}` : ''}${r.distance !== undefined ? `, ${r.distance} tiles away` : ''}`;

/** Compact markdown for Claude. One line per fact; sources at the end. */
export function toMarkdown(kind: string, r: QueryResult<unknown>): string {
  if (!r.ok) return `error: ${r.error}\n${r.message}\n${r.candidates?.length ? `candidates:\n${r.candidates.map(c => `- ${c.type}/${c.slug} — ${c.title}`).join('\n')}\n` : ''}`;
  const d = r.data as Record<string, unknown>;
  const lines: string[] = [];
  const list = (title: string, rows: string[]) => { if (rows.length) lines.push(`## ${title}`, ...rows, ''); };
  switch (kind) {
    case 'search':
      list('Results', (d['hits'] as { type: string; slug: string; title: string; snippet: string }[]).map(h => `- ${h.type}/${h.slug} — ${h.title}: ${plainSnippet(h.snippet)}`));
      break;
    case 'obtain': {
      const o = d as { item: Candidate; drops: { npc: Candidate; rate: string; quantity: string; condition: string | null }[]; tables: { table: string; rate: string; quantity: string }[]; shops: { shop: Candidate; stock: number; coord: Coord | null; area: string | null }[]; spawns: Located[]; methods: { skill: string; level: number; action: string; xp: number }[]; quests: Candidate[] };
      lines.push(`# How to obtain ${o.item.title}`, '');
      list('Drops', o.drops.map(x => `- ${x.npc.title} (npc/${x.npc.slug}): ${x.rate}, ${x.quantity}${x.condition ? `, ${x.condition}` : ''}`));
      list('Tables', o.tables.map(x => `- rolled from ${x.table}: ${x.rate}, ${x.quantity}`));
      list('Shops', o.shops.map(x => `- ${x.shop.title}: stock ${x.stock}${x.coord ? ` at ${fmtCoord(x.coord)}${x.area ? ` in ${x.area}` : ''}` : ''}`));
      list('Spawns', o.spawns.map(x => `- ${locLine(x)}`));
      list('Made by', o.methods.map(x => `- ${x.action} (${x.skill} ${x.level}, ${x.xp} xp)`));
      list('Quest rewards', o.quests.map(x => `- ${x.title}`));
      break;
    }
    case 'drops': {
      const x = d as { npc: Candidate; drops: { item: Candidate; rate: string; quantity: string; condition: string | null; table: string }[] };
      lines.push(`# Drops from ${x.npc.title}`, '');
      list('Drops', x.drops.map(r2 => `- ${r2.item.title} (item/${r2.item.slug}): ${r2.rate}, ${r2.quantity}${r2.condition ? `, ${r2.condition}` : ''} [${r2.table}]`));
      break;
    }
    case 'requirements': {
      const x = d as { subject: Candidate; skills: { skill: string; level: number }[]; quests: Candidate[]; items: Candidate[]; questPoints: number | null };
      lines.push(`# Requirements for ${x.subject.title}`, '');
      list('Skills', x.skills.map(s => `- ${s.skill} ${s.level}`));
      list('Quests', x.quests.map(q => `- ${q.title}`));
      list('Items', x.items.map(i => `- ${i.title}`));
      if (x.questPoints !== null) lines.push(`Quest points required: ${x.questPoints}`, '');
      break;
    }
    case 'methods': {
      const x = d as { skill: string; level: number; methods: { level: number; action: string; xp: number; inputs: string[]; outputs: string[] }[] };
      lines.push(`# ${x.skill} methods up to level ${x.level}`, '');
      list('Methods', x.methods.map(m => `- ${m.action} (level ${m.level}, ${m.xp} xp)${m.inputs.length ? `, needs ${m.inputs.join(', ')}` : ''}${m.outputs.length ? `, gives ${m.outputs.join(', ')}` : ''}`));
      break;
    }
    case 'unlocks': {
      const x = d as { skill: string; level: number; methods: { action: string; xp: number }[]; items: Candidate[]; next: number | null };
      lines.push(`# ${x.skill} level ${x.level}`, '');
      list('Methods', x.methods.map(m => `- ${m.action} (${m.xp} xp)`));
      list('Items', x.items.map(i => `- ${i.title}`));
      lines.push(`Next unlock level: ${x.next ?? 'none'}`, '');
      break;
    }
    case 'nearest': {
      const x = d as { results: Located[] };
      lines.push('# Nearest', '');
      list('Results', x.results.map(r2 => `- ${r2.name} (${r2.type}/${r2.slug}) at ${locLine(r2)}`));
      break;
    }
    case 'where': {
      const x = d as { subject: Candidate; total: number; areas: number; results: SpawnGroup[] };
      lines.push(`# Where to find ${x.subject.title}`, '', `${x.total} spawn${x.total === 1 ? '' : 's'} across ${x.areas} area${x.areas === 1 ? '' : 's'}${x.areas > x.results.length ? `; showing the ${x.results.length} largest` : ''}.`, '');
      list('Locations', x.results.map(g => `- ${g.area ?? 'Unlabelled area'}: ${g.count} spawn${g.count === 1 ? '' : 's'}, e.g. ${fmtCoord(g.example)}`));
      break;
    }
    case 'shops': {
      const x = d as { shops: { shop: Candidate; coord: Coord | null; area: string | null; stock: { itemKey: string; count: number }[] }[] };
      lines.push('# Shops', '');
      list('Shops', x.shops.map(s => `- ${s.shop.title}${s.coord ? ` at ${fmtCoord(s.coord)}${s.area ? ` in ${s.area}` : ''}` : ''}: ${s.stock.map(st => `${st.itemKey} x${st.count}`).join(', ')}`));
      break;
    }
    case 'quest-order': {
      const x = d as { available: { quest: Candidate; questPoints: number | null; skills: { skill: string; level: number }[] }[]; note: string };
      lines.push('# Quest order', '');
      const rows = x.available.map(a => `- ${a.quest.title}${a.questPoints !== null ? ` (${a.questPoints} qp)` : ''}${a.skills.length ? `, needs ${a.skills.map(s => `${s.skill} ${s.level}`).join(', ')}` : ''}`);
      lines.push('## Available', ...(rows.length ? rows : ['(none)']), '');
      lines.push(x.note, '');
      break;
    }
    case 'plan-context': {
      const x = d as { page: Candidate; markdown: string; requirements: { skills: { skill: string; level: number }[]; quests: Candidate[]; items: Candidate[]; questPoints: number | null } | null; obtain: { item: Candidate }[] };
      lines.push(x.markdown, '');
      if (x.requirements) {
        const rows = [
          ...x.requirements.skills.map(s => `- ${s.skill} level ${s.level}`),
          ...x.requirements.quests.map(q => `- quest: ${q.title}`),
          ...x.requirements.items.map(i => `- item: ${i.title}`),
          ...(x.requirements.questPoints !== null ? [`- ${x.requirements.questPoints} quest points`] : [])
        ];
        list('Requirements', rows);
      }
      list('How to obtain needed items', x.obtain.map(o => `- ${o.item.title}`));
      break;
    }
    case 'entity': {
      lines.push(`# ${String(d['name'] ?? d['slug'] ?? 'Entity')}`, '');
      const rows = Object.entries(d).filter(([k, v]) => v !== null && typeof v !== 'object' && k !== 'sources').map(([k, v]) => `- ${k}: ${String(v)}`);
      list('Fields', rows);
      break;
    }
    default: lines.push('```json', JSON.stringify(d, null, 1), '```');
  }
  lines.push(`confidence: ${r.confidence}`, `sources: ${r.sources.slice(0, 12).join('; ')}`);
  return lines.join('\n') + '\n';
}
