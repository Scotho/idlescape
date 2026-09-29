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
