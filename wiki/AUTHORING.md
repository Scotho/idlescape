# Authoring the wiki

## Purpose

`bun run --cwd wiki extract` and `bun run --cwd wiki build` generate every page from the
pinned Content and Engine clones: infobox, lead, and every section the extractor can source.
That gets a page most of the way there, but some sections — a quest walkthrough written for a
player, the length and difficulty of a quest, a monster's strategy notes, trivia — are not in
the data. Those are filled by hand as **overlays**: small markdown files under
`wiki/content/` that the build merges into the generated draft before rendering. This
document is the how-to for writing one, reviewing one, and tracking what is left.

## Where overlays live and how they are named

Overlays live under `wiki/content/<type>s/<slug>.md` (the same `slug` the generator gave the
entity — check `wiki/data/274/<type>s.json` if unsure). Two shapes of front matter:

**Entity overlay** — refines a page the generator already produces. Matched to the generated
draft by `type` and `key` (the entity's symbolic key, not its numeric id or slug — ids churn
between revisions, keys don't):

```yaml
---
type: quest
key: quest_cook
infobox:
  Length: Very short
  Difficulty: Novice
sources:
  Length: period:https://web.archive.org/...
  Difficulty: period:https://web.archive.org/...
disputes: content   # only if an infobox row you set conflicts with the extracted data
---
## Walkthrough
...
```

**Standalone page** — a page the generator has no entity for at all (a mechanic, a guide).
Needs `type`, `slug`, `title`, `lead`, and a `sources.lead` entry:

```yaml
---
type: mechanic
slug: game-tick
title: Game tick
lead: The **Game tick** is the 600 millisecond cycle the server runs on.
sources:
  lead: engine:src/engine/World.ts#TICKRATE
---
## Details
...
```

Every `## Heading` below the front matter is a section body. A heading that matches one of
the type's fixed sections (see `STYLE.md`) **replaces** that section's body and sources
entirely — the section-replacement rule. A heading that doesn't match an existing section is
inserted (before Trivia, if present, else appended). There is no way to append to a generated
section's prose from an overlay; if a sentence needs to survive, put the whole section in the
overlay.

If your infobox row disagrees with the generated data (an id changed between revisions, or
the entity's own numbers look wrong), the build fails with `overlay-dispute` unless the front
matter also carries `disputes: content` and your prose in the page explains why. This is
deliberate friction: silent overrides hide when the underlying data moved.

## Source comments

Every sentence you write carries a `<!-- src: kind:ref -->` HTML comment naming what backs
it. The comment is stripped from the rendered page and its `kind:ref` becomes a numbered
footnote; several sentences citing the same `kind:ref` share one footnote. A section with
prose but no source comment at all fails the build (`section-sources`).

Seven kinds, in the order you should reach for them:

1. `content` — a line in the Content clone: a script label, a config key, a map file.
   `<!-- src: content:scripts/quests/quest_cook/scripts/quest_cook.rs2#cooks_assistant_start -->`
2. `engine` — a line in the Engine-TS server source.
   `<!-- src: engine:src/engine/World.ts#TICKRATE -->`
3. `derived` — a value our own extractor computes from other sources (a formula, a join).
   `<!-- src: derived:npcs.ts:npcCombatLevel -->`
4. `cited` — a URL already attached to the extracted entity as the Content authors' own
   provenance (a quest journal scan, a screenshot credited in a script comment). Never a URL
   you found yourself — see `period` and `modern` for that.
   `<!-- src: cited:https://rsrclan.com/media/quests/F2P/cookasst/9582.png -->`
5. `period` — a contemporaneous (2004-2006) source you located yourself, cited by URL
   (ideally a Wayback Machine snapshot so the date is provable), never copied from.
   `<!-- src: period:https://web.archive.org/web/2005.../http://... -->`
6. `modern` — the current OSRS Wiki or a similar modern reference, used as a labelled modern
   analogue only where the pack and period sources are both silent. Cite the URL, never copy
   its text.
   `<!-- src: modern:https://oldschool.runescape.wiki/w/... -->`
7. `editorial` — your own judgement call, dated so it can be revisited. Last resort.
   `<!-- src: editorial:cs:2026-09-05 -->`

Research order: entity JSON and scripts first (kinds 1-4), period sources second (kind 5),
the OSRS Wiki third (kind 6), editorial last (kind 7). Never paste text from the OSRS Wiki,
LostHQ, RuneHQ or any archive — read it, understand it, then write your own sentence in
STYLE.md voice and cite the source you read.

Links: first mention of another entity in a section is `[[Name]]` (or `[[Name|label]]`);
the build resolves it against the name index (entity names, aliases, and standalone page
titles) or fails with `unresolved-links`.

## The authoring prompt

Paste this into a fresh Claude Code session, filling in the bracketed parts, to draft one
overlay:

```
Write a wiki overlay for [entity name / mechanic name] at
wiki/content/<type>s/<slug>.md.

Read first, in order:
1. wiki/STYLE.md — the voice and page anatomy this must follow.
2. wiki/AUTHORING.md — the overlay format and the source comment syntax.
3. The entity's record in wiki/data/274/<type>s.json (or the mechanic's supporting
   engine/content files if it has no entity record).
4. [list the specific script paths, config paths, or engine source files relevant to this
   page — the ones the overlay should cite].

Cite every sentence with a <!-- src: kind:ref --> comment, in the kind order in
AUTHORING.md's "Source comments" section: content and engine and derived and cited first,
period sources second, the modern OSRS Wiki third, editorial last and dated. Never paste
text from the OSRS Wiki, LostHQ, RuneHQ or any archive of them — cite them, don't quote them.
Output only the overlay file's contents (front matter plus sections), nothing else.
```

## The review prompt

Paste this into a second, independent Claude Code session before committing an overlay:

```
Review the overlay at [path] against the sources it cites. For every sentence:
1. Open the cited kind:ref and confirm the sentence is actually supported by it. Flag any
   sentence whose citation doesn't back it, or that has no citation.
2. Check the prose against wiki/STYLE.md: present tense third person (except Walkthrough
   and Strategy sections, which may use second person), British spelling, digits for
   numbers, no hedging on verified sources.
3. Run `bun run --cwd wiki lint` and confirm every [[link]] in this overlay resolves
   (unresolved-links) and no sentence over 12 words matches the denylist.
Report anything wrong; don't fix it yourself unless asked to.
```

## Phases and coverage

Work proceeds in phases (spec section 12, step 6). A phase is "done" once every entity in
scope has an overlay covering its required sections, at which point the build's coverage
gate (spec section 11) starts failing the build if more than 20% of pages of a type still
render a required section as a stub — so mark a phase done here only when it actually is.

- [ ] **Phase A** — free-to-play quests and mechanics (tick, XP table, combat level,
      coordinates). Exemplar landed: `cooks-assistant.md` and the four mechanics pages.
- [ ] **Phase B** — members quests.
- [ ] **Phase C** — monsters and drop strategy.
- [ ] **Phase D** — skill training tables and areas.

## The content-custom boundary

The corpus is extracted from the **pinned upstream content only**. `wiki/gen/paths.ts` sources
`engine/content` and nothing else, so the overlay in `content-custom/` is never read, and a page
this wiki renders describes upstream's world rather than the one the server actually runs.

That is accurate today only because the overlay carries nothing the extractor would have parsed.
`runExtract` therefore refuses to run the moment that stops being true:
`assertOverlayNotWikiVisible` in `wiki/gen/extract.ts` walks `content-custom/` for the same
extensions `wiki/gen/load.ts` walks (`.obj`, `.npc`, `.loc`, `.inv`, `.varp`, `.param`,
`.dbtable`, `.dbrow`, `.rs2`, `.constant` under `scripts/`, and `.jm2` under `maps/`) and throws
naming the offending files.

One file is on the accepted list and must stay there:
`content-custom/scripts/interface_bank/configs/banktab.varp`, the bank-tab size varp SP8 added. It
is an interface config that no wiki page describes, so it is not noise and it is not a gap; do not
delete it and do not widen the list without saying why the new file is not wiki-visible.
`content-custom/pack/varp.pack` is a packed id table with a `.pack` extension that the extractor
never reads, so it does not match at all.

If the overlay ever does gain content a player can see, the fix is to teach `wiki/gen/paths.ts`
about the overlay, not to silence the guard.

## Before committing

```bash
bun run --cwd wiki lint
bun run --cwd wiki build
```

Both must exit zero. `lint` alone is faster while iterating; `build` also writes
`wiki/build/wiki.db` and `wiki/build/report.md`, the latter listing lint counts and the
first unresolved problems by rule.
