import type { ItemEntity, Source } from '../types';
import type { RenderContext } from './context';
import { section, type Draft } from './page';
import { wl } from './links';
import { fmtCoord, fmtRate, fmtXp } from './infobox';

const SLOT: Record<string, string> = { righthand: 'weapon', lefthand: 'shield', hat: 'head', back: 'cape', front: 'neck', torso: 'body', legs: 'legs', hands: 'hands', feet: 'feet', ring: 'ring', quiver: 'ammunition' };

function weight(g: number): string { return g >= 1000 ? `${(g / 1000).toFixed(g % 1000 === 0 ? 0 : 1)} kg` : `${g} g`; }
/** `gem_rock_table` reads as "the gem rock table" in prose. */
function tableName(key: string): string { return key.replace(/_table$/, '').replace(/_/g, ' '); }
/** Indefinite article for the phrase that follows: "a piece", "a stackable item", "an item". */
function article(next: string): string { return /^[aeiou]/i.test(next.trim()) ? 'an' : 'a'; }
function skillLink(key: string): string { return wl('skill', key, key.charAt(0).toUpperCase() + key.slice(1)); }

export function renderItem(it: ItemEntity, ctx: RenderContext): Draft {
  const kind = it.wearpos ? `piece of equipment worn in the ${SLOT[it.wearpos] ?? it.wearpos} slot` : it.stackable ? 'stackable item' : 'item';
  // Examine text is quoted verbatim from the game and is already shown in the infobox's "Examine" row;
  // in-game examine text is frequently written in the second person ("you", "your"), so quoting it into
  // the lead here would trip the wiki's no-second-person voice rule for prose that isn't a quotation.
  const rest = it.members ? `members-only ${kind}` : kind;
  const lead = `The **${it.name}** is ${article(rest)} ${rest}.`;
  const src: Source[] = it.sources;

  const uses: string[] = [];
  for (const q of ctx.questsChecking.get(it.key) ?? []) uses.push(`- Needed during ${wl('quest', q.slug, q.name)}`);
  if (it.wearpos) uses.push(`- Equipped as ${SLOT[it.wearpos] ?? it.wearpos}`);

  const sources: string[] = [];
  const dropSrc: Source[] = [];
  for (const d of [...(ctx.dropsByItem.get(it.key) ?? [])].sort((a, b) => b.num / b.den - a.num / a.den)) {
    const qty = d.min === d.max ? (d.min > 1 ? `, ${d.min}` : '') : `, ${d.min}–${d.max}`;
    if (d.subjectKind === 'table') {
      // A shared `drop_table` dbrow is rolled from by whatever script references it, not killed,
      // so it is never named as a dropping NPC.
      sources.push(`- Rolled from the ${tableName(d.table)} table: ${fmtRate(d.num, d.den)}${qty}`);
    } else {
      const npc = ctx.npcByKey.get(d.npcKey);
      sources.push(`- Dropped by ${npc ? wl('npc', npc.slug, npc.name) : d.npcKey}: ${fmtRate(d.num, d.den)}${qty}${d.condition ? ` (${d.condition})` : ''}`);
    }
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
  for (const q of ctx.questsRewarding.get(it.key) ?? []) sources.push(`- Reward from ${wl('quest', q.slug, q.name)}`);

  const creation: string[] = [];
  const creationSrc: Source[] = [];
  for (const m of ctx.methodsByOutput.get(it.key) ?? []) { creation.push(`- Made by ${m.action} (${skillLink(m.skill)} ${m.level})`); creationSrc.push(...m.sources); }

  const products: string[] = [];
  const productsSrc: Source[] = [];
  for (const m of ctx.methodsByInput.get(it.key) ?? []) { products.push(`- ${m.action} (${skillLink(m.skill)} ${m.level}, ${fmtXp(m.xp)})`); productsSrc.push(...m.sources); }

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
      ['Released', '2004 (build 274)'], ['Members', it.members ? 'Yes' : 'No'], ['Tradeable', it.tradeable ? 'Yes' : 'No'], ['Equipable', it.wearpos ? 'Yes' : 'No'],
      ['Stackable', it.stackable ? 'Yes' : 'No'], ['High alchemy', `${it.highAlch} coins`], ['Low alchemy', `${it.lowAlch} coins`], ['Value', `${it.cost} coins`],
      ['Weight', weight(it.weightG)], ['Examine', it.examine ?? '—'], ['Item id', String(it.id)], ['Key', it.key]
    ],
    sections: [
      section('Uses', uses.join('\n'), src, true),
      section('Item sources', sources.join('\n'), [...src, ...dropSrc], true),
      section('Creation', creation.join('\n'), [...src, ...creationSrc]),
      section('Products', products.join('\n'), [...src, ...productsSrc]),
      section('Bonuses', bonuses, src),
      section('Requirements', it.levelRequire.map(r => `- ${r.level} ${skillLink(r.skill)}`).join('\n'), [...src, { kind: 'engine', ref: 'engine:content scripts/levelrequire/scripts/levelrequire.rs2', note: 'weapons check attack, armour checks defence' }]),
      section('Changes', '', src), section('Trivia', '', src)
    ],
    sources: src
  };
}
