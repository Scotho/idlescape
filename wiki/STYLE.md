# STYLE

`wiki/STYLE.md` is normative for generated templates, overlays and lint.

## Voice

- Present tense, third person, neutral. "The **Bronze axe** is a woodcutting tool." Second
  person ("you", "your") is allowed on `guide` pages, and inside a `Walkthrough` or `Strategy`
  section of any page — those are instructions to a player. Everywhere else, including every
  lead paragraph, `second-person` fails the build.
- British spelling (armour, defence, colour), Jagex capitalisation for proper nouns, lower
  case for skills and item names mid-sentence ("a rune scimitar requires 40 attack").
- Numbers as digits; XP as "250 experience" in prose and "250 xp" in tables; coordinates
  as `(3222, 3218, 0)`; rates as "1/128" with the percentage in parentheses.
- Members content says so in the infobox and in the first sentence when relevant.
- No hedging words where the source is `verified`. Where confidence is lower the sentence
  says what is known: "In Old School RuneScape this drop is 1/128; the 274 script has not been
  matched to a source."
- No copying. The `denylist` lint is the smoke check for it (see Lint below; the deny list is
  empty today, so the rule is inert). The real control is the authoring process in section 7.

## Page anatomy

Every page: title, infobox (right column on desktop, top on narrow), lead paragraph with the
subject in bold and its one-line definition, then sections in the type's fixed order, then
"Sources" (numbered footnotes grouped by section), then "Build" (revision, Content sha,
generated date). Sections with no data are omitted, except the ones marked required, which
render a stub line: "No information is recorded for this section yet." so the gap is visible.

## Templates by page type

This is what the renderers under `wiki/gen/render/` emit today. Overlays add sections and
infobox rows on top; anything an overlay does not supply is simply absent.

Item: infobox (released as "2004 (build 274)", members, tradeable, equipable, stackable, high
and low alchemy derived from `cost`, value, weight, examine, item id, key); sections Uses, Item
sources (drops, shared drop tables, shops, spawns, quest rewards), Creation (if a `method`
outputs it), Products (if a method consumes it), Bonuses (equipable only, the ten stats plus
attack speed), Requirements, Changes, Trivia. Required: Uses, Item sources.

NPC (non-combat): infobox (released, members, options, examine, NPC id, key); sections
Location, Quests involved, Shop, Trivia. Required: Location.

Monster (an NPC with stats and an "Attack" option): the NPC infobox plus combat level,
hitpoints, attack, strength, defence, respawn and size; sections Location (spawns grouped by
area with an example coordinate), Drops (item, quantity, rarity, condition), Quests involved,
Shop, Strategy (overlay only), Trivia. Required: Location, Drops.

Scenery (loc): infobox (options, examine, size, placements, object id, key); sections Uses,
Locations, Trivia. Required: Uses.

Quest: infobox (members, start point, requirements, items required, quest points, progress
varp); sections Walkthrough (numbered by progress stage, derived from the varp progression and
dialogue; overlay refines), Rewards, Required for completing, Trivia. Required: Walkthrough,
Rewards.

Skill: infobox (members, skill id, experience for level 99); sections Mechanics (overlay only),
Training (a table per method from `methods`, by level), Quests giving experience, Level-up
unlocks (from `levelup_unlocks.enum`), Trivia. Required: Training.

Shop: infobox (owner NPC, coordinates, buys from players (`allstock`), restocks, key); sections
Stock (item, base stock, base value), Location. Required: Stock.

Area: infobox (members, multi-combat, map label, coordinates); sections Features (banks,
anvils, furnaces, ranges, altars, trees, rocks, fishing spots, shops, quest starts), NPCs,
Monsters, Trivia. Required: Features.

Mechanic and guide pages are free-form under a lead, with the same sources footer.

## Not yet generated

The extractor does not record these yet, so no renderer emits them and no overlay should
pretend they are extracted (an overlay may still add them with its own source):

- Item: image, quest-item flag.
- Monster: max hit, aggressive, poisonous, attack style.
- Quest: difficulty, length, items recommended, enemies to defeat, transcript.
- Skill: minimum and maximum level, tools.
- Shop: area, currency, price rules.
- Area: music.
- NPC: dialogue topics.

## Linking

First mention of any other entity in a section links to it. Aliases resolve links in
overlays (`[[rune scim]]` becomes the rune scimitar page). Lint fails on unresolved links.
Orphan pages (pages with no inbound links) are not reported yet.

## Lint

- `lead-bold` — fails the build if the lead paragraph does not bold the subject's name.
- `required-sections` — warning only; does not fail the build, but flags a page whose required
  section rendered the stub line so it surfaces in `gaps.md`.
- `unresolved-links` — fails the build if a `[[Name]]` or `[[Name|label]]` link does not
  resolve against the name index (by name or alias).
- `section-sources` — fails the build if a non-stub section has no `sources` entries.
- `second-person` — fails the build if a non-`guide` page uses second person ("you", "your")
  in its lead or in any section other than `Walkthrough` or `Strategy`.
- `overlay-source` — fails the build if an overlay makes a claim without citing content,
  engine, period, modern, or editorial sources in order of preference.
- `overlay-dispute` — fails the build if an overlay's infobox values dispute the extracted
  data without being reconciled (entity vanished or id churn not accounted for).
- `orphan-overlay` — fails the build if a keyed overlay names a `type:key` that matches no
  extracted entity, so its prose and citations would never reach a page.
- `denylist` — fails the build if a sentence longer than 12 words matches verbatim against the
  deny list in `wiki/gen/denylist.txt`. That file is empty, so the rule is inert today; it is
  a smoke check, and the real control is the authoring process in section 7.

The stub line, rendered verbatim for a required section with no data: "No information is
recorded for this section yet."
