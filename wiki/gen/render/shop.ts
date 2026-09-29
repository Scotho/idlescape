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
