# idlescape: library catalogue, settings model and task list

Date: 2026-09-07
Status: approved by the orchestrator under D11 and D61 (sprint 3 scope), 2026-09-07; uncommitted
until the next docs commit.
Authority: **this document decides sprint 3 entries 6 (library expansion) and 7 (task list and
script stats)**, over the one-paragraph briefs in
`docs/superpowers/specs/2026-09-07-sprint-legends-quest.md`. Where that sprint document and this
one differ on scope, this one wins; where they differ on *order*, the sprint document wins.
Placement: sprint 3 rows 6 and 7, unmoved. This spec does not renumber anything.
Revised 2026-09-07 after review: thirty-seven findings across three lenses (content truth, owner
fidelity, buildability) were each checked against the pinned content, the shipped code and this
spec's own survey sources (section 1.1), and all were applied, across
the content evidence, the settings model, the seam and dependency tables, and the plan
decomposition. The changes that move a
committed decision (D66, D68, D69, D70, D71, D72) and the one that moves a proposal's owner (P16)
are appended to `docs/superpowers/decisions.md` as a second block; where an amended decision and
this document differ, this document is the later statement. Rulings R20 to R23 and Appendix A are
new in that revision.
Written on `sprint/dragon-slayer` beside the Dragon Slayer work, because entry 6 composes with
doors that Dragon Slayer entries 4, 5 and 7 are building right now.
Amended 2026-09-07 by D91 (`2026-09-07-wiki-window-and-vocabulary-design.md` section 9): the
words change, the substance does not. Read section 12.1's "Lists section" as "the Tasks tab" of
the Automation panel, "My scripts" as "Scripts", "the Marketplace" as "the Library", and the
"History" section as "Runs". Every manifest in Appendix A also declares the closed `category`
and the `skills` subject list D91 adds; the plan assigns them. `TaskList`, `TaskStep` and every
id, key and selector in this document are unchanged.

Sources this document was written from, all read directly: `web/src/tasks/**`, `web/src/agent/**`,
`web/src/plugins/builtin/tasks.ts` and `tasksViews.ts`, `web/src/data/atlas.json`,
`web/src/data/gen/**`, `scripts/gen/atlas.ts`, `firebase/firestore.rules`, the pinned content clone
at `engine/content/**` (`contentSha 367106efad81bd5c`, the sha the committed atlas was generated
from), `docs/superpowers/specs/2026-09-07-script-api-survey-and-standard-design.md` sections 4 and
5, `docs/superpowers/specs/2026-09-07-script-studio-design.md` section 9,
`docs/superpowers/plans/2026-09-06-sp4b-bot-expansion.md` task 14, and
`docs/ideas/2026-09-07-script-recorder-and-block-editor.md`. External catalogue evidence is cited
by URL where it is used.

---

## 1. What this spec is, and what it decides

The owner's instruction, recorded as D61 (sprint 3 scope):

> "In the spec for sprint 3 that adds quest plugins, include a wide range of other plugins such as
> combat and one for all skills. Include settings in these scripts to change what/where/how
> long/etc. Look to other popular osrs bots for guidance on systems and fill in what is possible or
> feasible within our system. In the sprint, also include a task list feature that allows somebody
> to build a set of tasks and have the bot proceed through them autonomously."

Three things follow, and this document specifies all three:

1. **A catalogue.** A script for combat and one for every skill the pinned rev 274 content actually
   supports, each with the methods that content gives it, at the levels that content gives them.
2. **One settings model, shared.** Not seventy fields per script hand-rolled per author, but a
   declared schema every script fills in the same way, covering what, where, how long, restock, and
   the safety thresholds.
3. **A task list.** An ordered set of steps, each a script plus its settings and its stop
   condition, that the bot walks through on its own, with pause, resume, skip, and a report per
   step. Plus the small stats page that reads the same history the steps write.

The line this document holds throughout: **specify only what the pinned content and the shipped
runtime can actually do.** Every method named in section 3 carries the content row that proves it
exists. Every setting in section 4 carries the field type it is stored as and the control that
draws it. Where a method is deferred, section 3.3 says which limit defers it and what lifts it.

### 1.1 What the outside world contributed, and what it did not

The catalogue survey behind section 3 read four sources with live, fetched listings this session
(Microbot Hub at `github.com/chsami/Microbot-Hub`, the `Nezzima/DreamBot` mirror of published
DreamBot scripts, `waspscripts.com/scripts`, and WaspLib's settings forms at
`github.com/WaspScripts/WaspLib`), plus OSBot's script rules post carried over from the API survey.
Three findings shaped this design:

- **The AIO shape wins.** Every skill in every catalogue has a "do the action at the location"
  loop, and the popular free script is almost always the all-in-one variant with a method dropdown
  rather than a script pinned to one method. Microbot's `AutoFishingConfig.fishToCatch` is a typed
  enum, not free text.
- **Stop conditions belong above the script, not inside it.** WaspLib's `goals_form.simba` is one
  shared form (an actions limit, a time limit, and a per-skill level-target sub-form) that any
  script wires in, rather than each author reinventing "stop at level 60". This is the direct prior
  art for section 4.5.
- **A named saved loadout that a script *points at* is validated twice.** WaspLib's
  `gear_form.simba` keeps per-profile named layouts; Microbot's `aiofighter` holds several named
  `InventorySetup`s at once and picks by context. Both back the `Loadout` door (D42) as the right
  composition point, rather than a gear list per script.

And one finding that shaped part B by its absence. A second survey pass asked every system how it
chains *whole scripts*. **No reachable source describes a working cross-script task list.** Microbot
has no plugin scheduler in either repository's current tree (a full recursive search of
`chsami/Microbot` at `main` and `chsami/Microbot-Hub` for `schedul`, `queue`, `task` and `chain`
returns only core RuneLite's periodic-method `Scheduler`, the break handler, and quest-helper step
types). WaspLib's navigation has no Task, Queue or Schedule entry. DreamBot's published API has
`TaskNode`/`accept()` and `TreeScript`, which are the *within-script* layer our own `Task.when`
already occupies. The systems remembered to have a queue (OSBot, TRiBot, RuneMate, PowBot) are
behind logins or gone: `runemate.com` now serves only a shutdown notice dated 2026-08-07,
`tribot.org` returned 503, `powbot.org` does not resolve.

So part B is designed from our own primitives, and says so. That is a reason to be careful, not a
reason to be timid: the primitives are good, and section 10 shows the list falls out of them.

---

## 2. The two entries, and what ships if a sibling slips

Entry 6 depends on two siblings in the same sprint: **entry 1 (Loadouts)** and **entry 4 (route
service)**. The sprint sequence already puts both first, and entry 6's dependency column already
names them, so this spec assumes they have landed. But four skills and every restocking script are
gated on them, so a slip must not block the whole entry. The catalogue is therefore ruled into two
tiers, and **tier 1 is the release** if either sibling is late.

**Entry numbers in this table are qualified**, because two different sprints have an entry 4 and
this spec composes with both. "DS" is `2026-09-07-sprint-dragon-slayer.md`; "S3" is
`2026-09-07-sprint-legends-quest.md`.

| Tier | Gate | What it contains |
|---|---|---|
| **Tier 1a** | **DS entry 4 (shell v2)**, for the four new controls of 4.10, or the fallback rendering that section names. Nothing else. | Woodcutting, mining, fishing, cooking, firemaking, fletching, crafting (leather), prayer, thieving (pickpocketing), magic (utility), herblore, and `travel-to`. Eleven skill scripts plus one utility, at `restock: 'off'`. |
| **Tier 1b** | **P16**, which entry 6 lands itself (4.6). Nothing outside the entry. | Smithing (smelt and anvil), `bank-items`, and `restock: 'bank'` on every tier 1a script. Two more skill scripts and one utility. |
| **Tier 1c** | **P12**, which is DS entry 7's (4.7). | Combat (melee, ranged, magic). One script, the owner's headline request, which is why 8.3 makes it one of the four smoke specs and why 18 gives it its own plan. |
| **Tier 2** | **S3 entry 4, the route service.** | Agility, runecraft, thieving stalls, crafting (spinning), and any method whose location is on another plane or another region. |
| **Tier 2** | **S3 entry 1, Loadouts.** | The `loadout` restock mode on every script that has one. Nothing is *only* in this group: every script in tier 1 works with `restock: 'bank'` and a named item list. |

Tier 1a, 1b and 1c are one release and one entry; the split is a build order, not three shipments.
It is written down because an earlier draft of this table gave tier 1 the gate "nothing" while
sections 4.6, 4.7 and 17 each named a gate on part of it, and a planner reading the table alone
would have scheduled combat, the owner's headline request, into an ungated wave.

The tier boundary is a property of `c.travel`, measured, not a guess. `createTravel`
(`web/src/tasks/travel.ts`) walks in scene-sized legs of at most 52 tiles, at most 24 legs, and
**changes plane only by following a declared route's `interact` waypoint**; `web/src/data/atlas.json`
carries exactly two routes and both are Tutorial Island ladders. So travel cannot climb one mainland
staircase today, and 24 legs is the whole of long-distance movement. That is what defers agility
(the Gnome course spans levels 0, 1 and 2 and the stronghold is far from any landmark), runecraft
(the ruins and the altar are joined by a portal into another region), thieving stalls (every stall
but the Varrock tea stall is in Ardougne) and spinning (most `spinningwheel` placements are on
level 1).

**Entry 7 (the task list) depends on no *runtime* work that is not already shipped.** Its seams are
the tasks API and the run history, both of which landed in SP4a and SP4b, and it is specified so it
can be built before, after, or beside entry 6. Its value goes up with the size of the catalogue,
which is why the sprint orders it second. It does have one presentation gate, and the same
correction applies as above: the Step row control is an addition to the shell v2 component library
(4.10), and the co-pilot bar it composes with is DS entry 4's surface (12.3). Under the fallback
rendering of 4.10 it is ungated; with the new controls it waits on DS entry 4 exactly as entry 6
does.

---

# Part A. The library

## 3. The catalogue for the first release

### 3.1 The rule for what is allowed in

A script may be specified only for a skill the pinned content advances. Measured against
`engine/content/scripts/`, there are `skill_*` directories for **agility, combat, cooking,
crafting, firemaking, fishing, fletching, herblore, magic, mining, prayer, runecraft, smithing,
thieving and woodcutting**: fifteen. `web/src/stats/skills.ts` has 21 `SKILL_NAMES` slots, and the
arithmetic between the two lists is worth doing exactly. Fourteen of the twenty-one names have a
`skill_*` directory; the fifteenth directory, `skill_combat`, is not a skill name at all. The
**seven** names with no directory are Attack, Strength, Defence, Hitpoints and Ranged, which the
combat script trains through `skill_combat`, plus **Slayer and Farming, which have no content at
all**: no `skill_slayer` or `skill_farming` directory under `engine/content/scripts`, and nothing
anywhere in `engine/content` calls `stat_advance(slayer, ...)` or `stat_advance(farming, ...)`.
Magic and Prayer are each both a directory and a skill name, so neither is in that seven. The
independent check is a grep of every `stat_advance(` call site under `engine/content/scripts`,
which yields nineteen distinct skills - agility, attack, cooking, crafting, defence, firemaking,
fishing, fletching, herblore, hitpoints, magic, mining, prayer, ranged, runecraft, smithing,
strength, thieving, woodcutting - and neither slayer nor farming. Those two slots are protocol
slots with nothing behind them.

**Ruling R1: no Slayer script and no Farming script.** They are not deferred, they are absent from
the world. Section 20 records this so no later session tries.

With that, the catalogue covers every skill the world has. Seventeen skill scripts across those
fifteen skills, because two skills take two scripts each: smithing splits into a furnace loop and
an anvil loop, and thieving splits into pickpocketing and stalls, which are different methods in
different places with different stop conditions. Combat is the opposite case, one script covering
three styles. Add the two transition utilities and the catalogue is **nineteen ids.**

### 3.2 The catalogue, with content evidence

"Methods by level" is what the script's `method` select offers, and the levels are the content's
own. Every row's evidence was read out of the pinned clone.

| # | id | Name | Methods, by level | Content evidence | Tier |
|---|---|---|---|---|---|
| 1 | `chop-and-drop` | Woodcutting | tree 1, oak 15, willow 30, maple 45, yew 60, magic 75 | `skill_woodcutting/configs/trees.dbrow`: 250, 375, 675, 1000, 1750, 2500 xp; axes bronze to rune with per-axe success rates | 1a |
| 2 | `net-fish-and-drop` | Fishing | net (shrimp, anchovies at 15), bait rod (sardine 5, herring 10), fly rod (trout 20, salmon 30), cage (lobster 40), harpoon (tuna 35, swordfish 50) | `saltfish.rs2` (net gives shrimp then anchovies at 15; rod plus `fishing_bait` gives sardine at 5, herring at 10), `freshfish.rs2` (fly rod plus feathers gives trout and salmon; rod gives pike), `rarefish` (cage and harpoon) | 1a |
| 3 | `mine-and-drop` | Mining | copper and tin 1, clay 1, iron 15, silver 20, coal 30, gold 40, mithril 55, adamantite 70, runite 85 | `skill_mining/configs/mine.dbrow`: 175, 50, 350, 400, 500, 650, 800, 950, 1250 xp | 1a |
| 4 | `cook-food` | Cooking | cook any raw fish on a range or a fire | `cooking_generic.dbrow`: shrimp and anchovies 1/300 xp, sardine 1/400, trout and salmon above. 65 `range` clusters and 98 `fire` clusters in the atlas | 1a |
| 5 | `burn-logs` | Firemaking | logs 1, oak 15, willow 30, maple 45, yew 60, magic 75 | `firemaking.obj`: 400, 600, 900, 1350, 2025, 3038 xp. Requires a `tinderbox` | 1a |
| 6 | `fletch-bows` | Fletching | shortbow 5, longbow 10, oak short 20 and long 25, willow 35 and 40, maple 50, yew 65, magic 80; then string them | `cut_logs.dbrow` (50, 100, 165, 250, 333, 415 xp and up), `bows.dbrow` for the stringing halves. Requires a `knife`, and `bow_string` to string | 1a |
| 7 | `craft-items` | Crafting | leather gloves 1, boots 7, vambraces 11, body 14, chaps 18; **spinning: flax 10, wool 1** | leather rows 138, 163, 220, 250, 270 xp; `spinning.struct`: flax 10/150, wool 0/25 | leather 1a, spinning 2 |
| 8 | `smelt-bars` | Smithing (furnace) | bronze 1, iron 15, silver 20, steel 30, gold 40, mithril 50, adamantite 70, runite 85 | `smelting.struct`: 62, 125, 137, 175 (iron plus 2 coal), 225, 300 (plus 4 coal), 375, 500 xp. 22 furnace clusters | 1b |
| 9 | `smith-anvil` | Smithing (anvil) | bronze 1, iron 15, steel 30, mithril 50, adamant 70, rune 85 | `smithing.dbrow`, whose rune tier is `[rune_dagger]` at `levelrequired,85` over `runite_bar`. 18 anvil clusters, nearest 12 tiles from the Varrock west landmark. Requires a `hammer` | 1b |
| 10 | `fight-npcs` | Combat | melee, ranged and magic against a named target; targets by combat level from rat 1 and chicken 1 up to guard 21 and skeleton 25 | npc `vislevel` from the configs: rat 1, chicken 1, cow 2, goblin 2, man and woman 2, giantrat 3, goblin_armed 5, giantrat1 6, barbarian 7, al_kharid_warrior 9, scorpion 14, thief1 16, guard1 21, skeleton_armed 22, skeleton_unarmed 25, black_knight 33. Spawn density measured per map square: goblin x24 and rat x12 at Lumbridge (m50_50), cow x7 and chicken x9 north (m50_51), barbarian x13 at Barbarian village (m48_53), al_kharid_warrior x9 (m51_49), man x7 and guard1 x6 at Edgeville (m48_54) | 1c |
| 11 | `cast-spells` | Magic (utility) | low alchemy 21, superheat 43, high alchemy 55. **Bones to bananas 15 and telegrab 33 are in the content and are not shippable**, see 3.3 and 6.1 | `magic_spells.dbrow` carries all five (`magic_spell_bones_to_bananas` 15/250, `magic_spell_telegrab` 33/430, then 310, 530, 650 xp). The SDK carries three: `web/src/vendor/rs-sdk/sdk/spells.ts` is 33 component ids (WIND_STRIKE through FIRE_WAVE, the four teleports, LOW and HIGH_ALCHEMY, SUPERHEAT, ENCHANT_LVL1..5, BIND) with **no `BONES_TO_BANANAS` and no `TELEKINETIC_GRAB`**. The three that ship cast through `sdk.sendSpellOnItem(slot, Spells.LOW_ALCHEMY)` and its siblings | 1a |
| 12 | `bury-bones` | Prayer | bury any bone; offer at an altar | `skill_prayer/configs/bones.obj` carries a `bone_exp` param per bone type. 39 altar clusters, one 21 tiles from the Lumbridge landmark | 1a |
| 13 | `pickpocket` | Thieving (npc) | man and woman 1, farmer 10, warrior 25, rogue 32, guard 40, knight 55 | `pickpocket.dbrow`: 80, 145, 260, 365, 468, 843 xp. Targets are plentiful: man x5 at Lumbridge, x7 at Edgeville | 1a |
| 14 | `steal-stall` | Thieving (stall) | baker 5, tea 5, silk 20, fur 35, silver 50, spice 65, gem 75 | `stealing.dbrow`: 160, 160, 240, 360, 540, 810, 160 xp. Placements measured: `tea_stall` at 3269,3410 in Varrock; every other stall is in Ardougne (`bakers_stall_stealing` at 2655,3311, and five more) | **2** |
| 15 | `mix-potions` | Herblore | identify herbs, then mix unfinished potions | `identify.param` (`identified_herb_level`, `identified_herb_exp`), `brew_potion.struct` | 1a |
| 16 | `craft-runes` | Runecraft | air 1, mind 2, water 5, earth 9, fire 14, body 20 | `runecraft.dbrow`: 50, 55, 60, 65, 70, 75 xp with multiples at 11 and 14; each row carries `altar_coord`, `enter_coord` and `exit_coord` | **2** |
| 17 | `run-agility` | Agility | the Gnome Stronghold course | `gnome_course.rs2` awards 75, 50 or 75 per obstacle and 390 for all seven; the `gnome_course_progress` varp tracks the lap. Obstacles at 2471 to 2485, 3420 to 3440, on levels 0, 1 and 2, each an `oploc1` with a named op | **2** |
| n/a | `travel-to` | Go to a place | no skill; walks to a landmark, a cluster or a tile and stops | section 10.3 | 1a |
| n/a | `bank-items` | Bank | no skill; walks to a bank, deposits, optionally withdraws a list | section 10.3 | 1b |

Numbering note: seventeen rows numbered 1 to 17 are the skill scripts; the two transition
utilities are unnumbered because they train nothing, but they are ordinary library scripts in every
other respect (section 10.3), including the declarations the catalogue gate checks: **Appendix A
carries every script's params, `stops.kinds`, `requires` and `order`, the two utilities included.**
This table decides what exists and proves it against the content; Appendix A is what a per-script
task is written from, and it is the artefact that stops nineteen plans each inventing their own
schema.

### 3.3 What is deliberately excluded, and why

| Excluded | Reason | What would lift it |
|---|---|---|
| Slayer, Farming | **No content.** No `skill_slayer` or `skill_farming` directory; no `stat_advance` call for either anywhere in `engine/content` (R1) | Content that does not exist at rev 274. Nothing in this project lifts it |
| Minigame solvers (Wintertodt, Tempoross, GOTR, Blast Furnace, Pest Control) | Not in rev 274. These are the *efficient* method in live OSRS and the dominant shape in every surveyed catalogue, which is exactly why their absence is worth writing down rather than leaving implied | Content that does not exist at rev 274 |
| Boss and prayer-flicking helpers (`colosseumprayer`, `delveprayerhelper` and their kind) | Two reasons. The content has no such bosses, and a flicking assistant is a reflex-timing aid rather than a task the bot performs | Nothing. Out of scope by intent |
| Grand Exchange scripts, price-gated looting (`minPriceOfItemsToLoot`) | No Grand Exchange at rev 274 and no price feed anywhere in the project | An economy feature no sprint has proposed |
| Agility beyond the Gnome course, runecraft beyond the six basic altars, Ardougne stalls, spinning | `c.travel` reaches neither another plane nor another region (section 2) | Entry 4, the route service. These are tier 2, not excluded |
| Woodcutting and mining "bank the ore" variants at a distant bank | The same travel limit, at a longer range | S3 entry 4. **`disposal: 'bank'`** (4.2, and it is a setting rather than a method) ships now for locations whose bank is inside travel's reach |
| Bones to bananas (magic 15) and telekinetic grab (magic 33) | **The SDK cannot cast them.** The content rows exist (`magic_spell_bones_to_bananas`, `magic_spell_telegrab`), but `web/src/vendor/rs-sdk/sdk/spells.ts` declares no component id for either, and section 20 forbids patching the vendored SDK. Telegrab additionally has its send shape already (`sdk.sendSpellOnGroundItem`) and only wants the id; bones to bananas is a self-cast with **no send primitive at all** (`sendSpellOnNpc`, `sendSpellOnPlayer`, `sendSpellOnTarget`, `sendSpellOnItem`, `sendSpellOnGroundItem` are the five, and none casts on nothing) | A finding under R7 (6.1), whose proposed fix is a `sendSpell(component)` self-cast send plus the two component ids, landing in the SDK the way every other vendored change lands: a logged deviation in `web/src/vendor/PATCHES.md`. Until then `cast-spells` offers three methods |
| A "power-fish and cook on the spot" combined loop | Deliberate YAGNI for the first release. Microbot exposes it (`AutoFishingConfig.cookFish`) and it is a good idea; it is a task-list chain in our model instead, which is the same result with no new mechanism | Nothing. Revisit if the list proves clumsy for it |

### 3.4 Two content facts that constrain how three scripts are written

These are measured, and they are the difference between a script that works on the stack and one
that works only in a test.

1. **Every rock in the scene is named `Rocks` and offers `Mine`.** The scene cannot tell copper
   from coal; only the atlas cluster's own content variant can. A mixed mine therefore yields the
   wrong ore sometimes. This is already recorded in `mineAndDrop.ts` and is not fixable without loc
   ids in the atlas. The mining script's `ore` setting is therefore a *cluster preference*, not a
   guarantee, and its description must say so.
2. **Every fishing spot npc is named `Fishing spot`**; the op is the only discriminator (`Net`,
   `Bait`, `Lure`, `Cage`, `Harpoon`). The fishing script selects by op, and its `method` select
   maps one-to-one onto the op. The same shape covers bait and lure, whose consumables (`fishing_bait`,
   feathers) are the first real use of `HealthPolicy.consumes`.

A third, smaller one: five of the nine atlas kinds (`furnace`, `anvil`, `range`, `fire`, `altar`)
carry no usable op in the content at all, which is why they are used by putting an item on them
rather than clicking a menu entry. `bot.useItemOnLoc` is the verb for all five.

---

## 4. The shared settings model

Every script in section 3 declares its settings through the same model. This section is the model.

### 4.1 The triple

A configured script is **three things, not one**:

```ts
/** What a player configures, what a preset saves, and what one task-list step is. */
export interface ScriptSetting {
  scriptId: string;
  params: ParamValues;      // the declared schema's values: what, where, how
  stop?: StopCondition;     // how long. Absent means the script's own `until`, or forever
}
```

That triple is the unit of everything downstream: a preset is a named one (section 5), a task-list
step is one plus a failure policy (section 9), and `RunSummary` already records the first two
fields of it verbatim. **Design every new surface against the triple, not against `params` alone.**

`params` stays exactly what it is today: `Record<string, boolean | number | string>`, validated
twice on the way in (`validateParams` in `web/src/tasks/params.ts` for `api.run`, which drops
unknown keys, and the stricter one in `web/src/tasks/defineScript.ts` inside the Worker, which
**fails the run on an unknown key**). Any stored settings must satisfy the stricter of the two.
That is a real constraint on the list: a step's saved params are validated against the manifest of
the script version that is current at run time, not the one that was current when it was saved
(section 14.3 says what happens when they disagree).

### 4.2 "What": target, item, method, auto

| Setting | Type | Default | Validation | Rendered as |
|---|---|---|---|---|
| `method` | `select` | the lowest-level method | membership in `options` | a `<select class=p-input>` |
| `target` | `select` with `source: 'variant'` | `auto` | **R2's bound, and only R2's: a string, 1 to 64 chars, no membership check.** 4.3 states it once and this row points at it | the area picker's sibling: a select whose options are generated from the atlas variants for this script's kind |
| `item` | `text` | per script | 1 to 40 chars | `<input type=text class=p-input maxlength=40>` |
| `product` | `select` | per script | membership | select |
| `disposal` | `select` | `drop` | membership in `drop`, `keep`, `bank` | select |

**`disposal` is the survey's best-evidenced skilling setting and it was missing from an earlier
draft of this model.** `survey-catalogue.md` section 2 records bank-versus-drop as "a first-class
boolean toggle, named for the trade-off", evidenced twice and freshly (Microbot's
`AutoFishingConfig.useBank`; DreamBot's `Fisher`, whose `sv.powerFish` is gated so the script will
not start until the choice is made). It is not `restock` under another name: `restock` is how
supplies come **in**, `disposal` is what happens to what the script produces.

| Value | What a gathering or production script does with its yield |
|---|---|
| `drop` | Drops it where it stands and carries on. The power method, and the default for every gathering script |
| `keep` | Keeps it and ends the run `done` with the summary "inventory full" when there is no room left. This is what `chop-and-drop`'s shipped `keepLogs: true` does today |
| `bank` | Walks to `bankAt`, deposits, walks back. **Requires `restock: 'bank'` or `'loadout'`**, because both use the same bank leg and the same P16 helper; `disposal: 'bank'` with `restock: 'off'` is refused by the catalogue gate rather than silently walking twice |

**The three shipped scripts inherit it under R16/D70, and `keepLogs` is retired into it.**
`chopAndDrop.ts`'s `keepLogs` boolean becomes `disposal: 'keep'`; `netFishAndDrop.ts` and
`mineAndDrop.ts`, which always drop today, gain the field at its `drop` default and are unchanged
in behaviour. `keepLogs` is removed from the manifest in the same change, because a param the
manifest no longer declares is dropped by `validateParams` and **fails the run** in the Worker's
stricter validator, so leaving it declared and unread is worse than removing it; the panel's layer-1
last-used store (section 5) reads through the same validator and falls back to the declared
defaults when a stored key no longer validates, which is exactly this case. `librarySource.test.ts`
pins a `keepParam === true` branch in `dropAllTask`; that helper keeps its `keepParam` argument and
is passed `'disposal'` with an equality against `'keep'`, so the seed comparison widens rather than
disappears (8.2).

**`method: 'auto'` is offered by every script and resolves at run start**, to the highest-level
method the character's current level allows *among the methods reachable from where the run is
standing*. It re-resolves only when the run's own `level-up` recovery fires and crosses a
threshold, and the switch is traced and shown on the run banner. It never re-resolves in a way that
would require travel: if a better method exists elsewhere, the run continues on the current one and
the status line says so. Moving is what the task list is for.

This is a deliberate narrowing of what the word "auto" could mean, and it matches the survey. No
config fetched this session lets a script silently climb tiers mid-run; every typed target field
(`AutoFishingConfig.fishToCatch`, `AIOFighterConfig.attackableNpcs`) is a choice made once. The one
exception found is combat, where `AIOFighterConfig.toggleAllowStyleSwitch` and
`toggleBalanceCombatSkills` do rotate the trained style so three stats reach their targets together;
section 4.9 adopts exactly that for `fight-npcs` and nothing wider.

### 4.3 "Where": the area picker

The params model cannot express a place today. A "where" setting is a `select` over hardcoded
strings, or a `text` field the script parses. Two additions close it, both scalar, both additive,
neither touching the storage shape.

**Addition 1: a generated `select`.** `ParamField`'s select member gains an optional `source`, and
`options` becomes optional when `source` is set:

```ts
| { type: 'select'; label: string; default: string;
    options?: { value: string; label: string }[];
    /** Fill `options` at render time from the atlas instead of declaring them. */
    source?: 'landmark' | 'bank' | 'variant' | 'loadout';
    /** Narrows `source: 'variant'` to one resource kind. */
    kind?: ResourceKind }
```

The panel fills the options at render time from `web/src/data/atlas.json` (a runtime `?url` fetch,
`web/src/tasks/atlas.ts`) or, for `loadout`, from the player's saved loadouts (entry 1). The value
stays a scalar string, so `ParamValues`, the Firestore document shape and the `run` message are all
unchanged.

**"At render time" hides an async seam, and this is where it is settled.** `renderParamsForm`,
`paramField` and `readValues` (`web/src/plugins/builtin/tasksViews.ts:221-257`) are fully
synchronous and build every `<option>` from `field.options` in one pass, while
`createAtlasLoader().load()` returns a promise and its own comment says the atlas is "fetched once
per Worker" - so the main-thread panel is a **second consumer** of the same asset. The rule, in one
place, for the run form and the list editor alike:

1. **The panel pre-warms the atlas.** The Tasks panel calls `load()` once when it mounts, not when a
   form opens. `AtlasLoader` already exposes `peek()`, which returns what `load` resolved without
   starting a fetch, and that is the synchronous read `paramField` uses.
2. **A form that opens before the fetch resolves renders the select disabled**, with `nearest` as
   its only option and the label "loading places...", and populates in place when the promise
   settles. Disabled is deliberate: it is the one state that cannot be submitted by a fast click.
3. **`readValues` never returns an empty string for a sourced select.** Today it writes
   `values[key] = el.value` for anything that is not a boolean or a number; for a sourced select it
   falls back to `field.default` when the element's value is empty, which is the same fallback the
   function already applies to a control that is not in the DOM at all.

Without this, a fast click on a form opened during the fetch submits `''`, which R2 then degrades to
`nearest` with a warning on **every** run rather than on the rare stale-list case R2 was written
for. 4.10's area picker row carries the same three rules so a reader who starts at the control finds
them.

**The validator cannot membership-check a sourced select**, because the manifest is a static object
compiled in the Worker while the atlas is a runtime fetch. **Ruling R2: for a sourced select both
validators check `typeof value === 'string'` and a 1-to-64-character bound, not membership, and a
value the script cannot resolve degrades to `nearest` with a traced warning rather than failing the
run.** The panel guarantees membership by construction; the graceful path is for a saved list whose
landmark id has since changed.

`'nearest'` is always the first option and always the default. The atlas has 44 landmarks (9 towns,
**31** derived banks, **4** tutorial route ends: `routeFor` in `web/src/tasks/travel.ts` resolves a
route's `from` through the landmark table as well as its `to`, so both ends of both routes are
landmarks) and **not one of them is a mine, a shoal, a range, a furnace or an anvil**, so for most scripts the honest "where" is "nearest cluster of the kind I
need", with the landmark list serving the bank choice and the town choice.

**Addition 2: a tile, as text.** A tile is a `text` field holding `"x,z,level"`, parsed by one
shared parser. This is the encoding rather than a new field kind because a real `tile` field would
need `ParamValues` to hold a non-scalar, which breaks the `scalar()` guard in `params.ts`, the
Firestore document shape and the `run` message, for one setting that three scripts want.

**Where each script's "where" comes from:**

| Script | Where setting | Source |
|---|---|---|
| all gathering scripts | `at` | `source: 'landmark'`, default `nearest` |
| `cook-food`, `smelt-bars`, `smith-anvil`, `bury-bones` | `at` | `source: 'landmark'` for the town; the range, furnace, anvil or altar is `find.nearest(kind)` from there |
| `fight-npcs` | `at` plus `leash` | `at` is a landmark; `leash` is a number of tiles from where the run started, 0 for off. This is Microbot's `centerLocation` plus `attackRadius` in the two fields our model can express |
| `bank-items`, `travel-to` | `to` | `source: 'bank'` and `source: 'landmark'` respectively |
| `burn-logs` | `at` plus `line` | `line` is a `"x,z,level"` tile the script walks away from, because burning fails on a tile that already holds a fire |

### 4.4 Conditional fields

An AIO script with a method dropdown wants to hide the fields the chosen method does not use.
`ParamField` gains one optional, **data-only** predicate:

```ts
/** Hide this field unless another field currently equals this value. Display only. */
showIf?: { key: string; equals: boolean | number | string };
```

It is data and not a function so it survives `postMessage` if a manifest ever crosses the Worker
boundary (today `libraryManifests()` is read on the main thread and the Worker imports the module
directly, but the studio's compiled-manifest work makes that boundary real). **`showIf` hides a
control; it never changes validation.** A hidden field still submits its default, which is what
`readValues` already does for a control that is not in the DOM.

### 4.5 "How long": the declared stop condition

`until` is code today: `Script.until?(s, c): boolean`, evaluated by `createRunner` before task
selection, and the three shipped scripts each write their own closure over an `untilLevel` number
param. A player-facing "until" selector needs the stop to be **data**.

```ts
export type StopKind = 'forever' | 'level' | 'count' | 'actions' | 'duration' | 'supplies';

export type StopCondition =
  | { kind: 'forever' }
  | { kind: 'level'; skill: string; level: number }        // 1 to 99
  | { kind: 'count'; item: string; n: number }             // gained during this run
  | { kind: 'actions'; n: number }                         // 1 to 100_000 of the script's own action
  | { kind: 'durationMs'; durationMs: number }             // 60_000 to 36_000_000
  | { kind: 'supplies' };                                  // a declared consumable ran out
```

Two of those five need their own paragraph, because both were wrong in an earlier draft.

**`actions`, and why an item count is not enough.** WaspLib's `goals_form.simba`, which 1.1 names as
the direct prior art for this section, exposes `ActionsEdit` ("Stop after [n] actions") **beside**
its time and level limits rather than folding it into them, and dropping it left three scripts with
no expression of the owner's "how long" axis at all: a kill yields varying or no loot, so "kill 50
goblins" is not a `count`; `run-agility` produces no item, so laps cannot be counted; and
`pickpocket` and `steal-stall` attempts, failures included, are the thing a player wants to bound.
An action count costs nothing new to implement, because **the script already knows**: it is the
counter its own loop increments, reported to the runner through the trace event the loop already
emits, and `stopReached` reads the count of that event since the run's baseline. Each script's
Appendix A row names its primary action in one word ("kill", "lap", "pickpocket", "cast", "bury"),
and the until selector renders that word in the control, so "Stop after 50 kills" is what the player
reads.

**`durationMs`, not `minutes`, because S8 is not optional here.** Clause S8 of the standard says
"Timeouts and durations are milliseconds, and the field name always ends in `Ms`", and 4.7 below
spends two paragraphs deprecating `hardStop.hpBelow` for exactly this class of error. A spec whose
6.1 makes the catalogue a test of the standard cannot ship the violation it is testing for. Minutes
are a **presentation** unit and stay one: the until selector draws a minutes number input and
multiplies, the run banner and the report render minutes, and only the stored and transported field
is milliseconds.

The manifest declares which kinds it offers and what they default to:

```ts
interface ScriptManifest {
  // ... existing fields ...
  /** Which stops the panel offers. Omitted means ['forever', 'duration']. */
  stops?: { kinds: StopKind[]; skill?: string; item?: string };
}
```

The chosen value travels **beside** `params`, not inside it, in `api.run`'s existing third
argument: `api.run(scriptId, params, { startedBy, stop })`. That argument already exists and
already carries `startedBy` (`web/src/tasks/api.ts:50` and `:266`), so a literal
`api.run(scriptId, params, { stop })` would drop it; the field is `opts.stop`, added to the object,
never a fourth positional. The runner ORs it into the loop it already runs:

```
stop reached  =  script.until?.(s, c) === true  ||  stopReached(stop, s, c, baseline)
```

`stopReached` is a pure function over the snapshot plus a baseline captured at run start (the
starting level for `level`, the starting item counts for `count`, `now()` for `duration`). A stop
that fires ends the run with `status: 'done'` and a `summary` naming the stop, never with a
`failReason`. **A duration stop is the only clock in the system that is not a failure timer**:
`stuckAfterMs`, `maxAttempts`, `Task.timeoutMs` and `HealthPolicy.noProgressMs` are all failure
timers, and `estimateMinutes` is a display hint nothing reads.

Why declared rather than four shared params plus a helper, which is the other way to get here:

- A task-list step must **carry its stop as data** so the report can say whether the step reached
  it or was cut short. A stop hidden inside an `until` closure is unreadable to anything above the
  script.
- Four shared params pollute every script's schema with four controls that render as four separate
  form rows. One declared stop renders as one composite control (section 4.10).
- The shared-helper route pays the **HELPERS coupling**: the moment a bundled script imports a
  shared helper, its JavaScript twin has to be hand-transcribed into the `HELPERS` string in
  `web/src/tasks/library/index.ts` and pinned by `librarySource.test.ts`, a trap that has cost a
  session and whose test does not cover what its comment claims (audit C25). The declared route
  pays a `types.ts` and `runner.ts` change and no HELPERS cost, which is also what the API
  standard's own note prefers ("prefer a context member over a shared helper module wherever both
  would work").

**The declared stop is five hand-maintained hops, not two, and R3's cost line says so.** An earlier
draft priced it as "a `types.ts` and `runner.ts` change". The real path, every hop of which is
enumerated by hand somewhere and none of which fails loudly when it is missed:

| File | What it must carry |
|---|---|
| `web/src/tasks/types.ts` | `StopCondition`, `StopKind`, `ScriptManifest.stops`, and `RunSummary.stop` (below) |
| `web/src/tasks/runner.ts` | `stopReached`, the baseline captured at run start, and the OR above |
| `web/src/agent/types.ts:85` | the `{ t: 'run'; runId; scriptRef; params; startedBy; characterId; characterName; behaviour }` message gains `stop`, or the condition never crosses `postMessage` |
| `web/src/agent/worker.ts:188` | `startRun` reads it off the message and hands it to `createRunner` |
| `web/src/tasks/library/index.ts:19-27` | `libraryManifests()` **enumerates manifest fields one by one**, so a `stops` field added to `ScriptManifest` never reaches the panel until this projection is edited. Nothing type-errors when it is missed: the panel simply offers no stops, on every script |

The last row is the one that costs a session if it is not written down, and it is why 10.4's seam
table now carries it too.

**`RunSummary` records the stop that was chosen.** The argument for making the stop data at all is
that something above the script can read it back, and the report is only half of that: `restart()`
(`web/src/tasks/api.ts:291-311`) rebuilds a run as `run(cur.docId, cur.summary.params, { startedBy })`,
so without the stop on the summary a "Run again" on a run that stopped at Woodcutting 30 runs
**forever**. `RunSummary` therefore gains `stop?: StopCondition` in the same additive change as
`listId` and `stepIndex` (R19), and `restart()` passes it back. This is an ordinary-run hazard, not
a list one; the analogous list hazard is named separately in 10.2.

**The three shipped scripts retire `untilLevel` in the same change.** `chop-and-drop`,
`net-fish-and-drop` and `mine-and-drop` each declare an `untilLevel` number param and close over it
in `until`. Under R16/D70 their ids survive, so their manifests are edited in place: `untilLevel`
and the `until` closure are both removed, and each script declares
`stops: { kinds: ['forever','duration','level','count','actions'], skill: '<its skill>' }` instead.
It is a removal and not a compatibility shim because the Worker's validator **fails a run on an
unknown key**, so a stored `untilLevel` from the panel's layer-1 last-used store would break the
next run of a widened script; layer 1 validates what it reads and falls back to the declared
defaults, which turns the stale key into a silently ignored one. A player who had set
`untilLevel: 30` sees the until selector default to `forever` once and sets it again, which is the
whole migration.

This is **ruling R3**, and it is cross-entry: see D66 in `docs/superpowers/decisions.md`, as amended
by the decision this revision appends.

### 4.6 Restock

```ts
restock: 'off' | 'bank' | 'loadout'      // select, default 'off'
restockItems: string                     // text, "name x qty, name x qty", used when restock='bank'
loadout: string                          // select, source: 'loadout', used when restock='loadout'
bankAt: string                           // select, source: 'bank', default 'nearest'
```

- **`off`** is bring-your-own. The run ends on `out-of-supplies` when a declared consumable is gone.
- **`bank`** walks to `bankAt`, deposits what the method produces (and what `disposal: 'bank'` asks
  it to, 4.2, on the same leg), and tops up `restockItems`. The top-up is the API standard's
  **P16 `bank.ensure(sel, qty)`**.
- **`loadout`** restores a named `Loadout` (entry 1, the D42 door) and is the only mode that
  restores *worn* gear. It is the mode that lights up when entry 1 lands and is absent from the
  select until then.

**Who owns P16, stated once, because an earlier draft said it three ways.** The standard already
adapts P16 "as a library helper rather than a context member" and phases it **`later`**, explicitly
because "it is worth doing when a bundled script actually banks, and none does today". Dragon Slayer
entry 7 is the standard's section 5, the phase-**next** set, so P16 is not entry 7's and section 17
no longer says it is. **This spec is what makes P16 needed, so entry 6 owns it**: it lands as
`ensure` in `web/src/tasks/library/bankHelpers.ts` (6's helper table), **after** the
generated-`HELPERS` `--check` that R6 puts at the front of the entry. That ordering is what removes
the contradiction: 4.5's preference for a context member over a shared helper is the standard's
general rule, and P16 is the standard's own named exception to it, so R6's bar is met rather than
waived. No hand transcription of `ensure`, `restockOrStop` or `pickMethod` is written at all.

The bank loop is the **highest-risk new mechanism in the whole catalogue**, because no bundled
script banks today and the loop is therefore unproven on the live stack. `smelt-bars` proves it
first (section 8.3), because it is the script whose whole shape is a bank loop and whose furnace is
close to a bank.

### 4.7 Food, prayer and thresholds

`HealthPolicy` gains the API standard's **P12** fields, and this spec is the reason P12 moves from
`next` to inside entry 6:

```ts
interface HealthPolicy {
  // ... existing fields ...
  eatBelowPercent?: number;             // eat when hitpoints fall below this percent. Off when unset
  food?: string[];                      // item names in preference order
  restorePrayerBelowPoints?: number;    // drink a restore below this many prayer points
}
interface ScriptManifest {
  hardStop?: { hpBelowPoints?: number; /** @deprecated Use hpBelowPoints. Removed in api 3. */ hpBelow?: number };
}
```

Two things about this, both from P12 and both load-bearing:

1. **The units must be fixed in the same change.** `hardStop.hpBelow` is absolute hitpoints today
   and the three shipped scripts set `{ hpBelow: 3 }`. Shipping `eatBelowPercent` beside it
   unamended puts a percent and an absolute next to each other with nothing to tell them apart,
   which is the standard's own S8 non-compliant example. `hpBelowPoints` lands, `hpBelow` is
   deprecated per S12, and the three shipped scripts migrate in the same commit.
2. **It is a recovery task, not background behaviour.** `low-hp` is deliberately non-recoverable
   today: `health.ts`'s `evaluate` leaves it out because it is the runner's own `hardStop`, which
   *ends* the run rather than recovering it. Under P12 it becomes recoverable **only when
   `eatBelowPercent` is set**, so today's default is unchanged, it is entered and traced and
   attempt-counted like every other recovery, and `hardStop.hpBelowPoints` still ends the run
   underneath it.

**Without P12 there is no combat script worth shipping.** That is the finding this spec most wants
on the record: combat's blocker was never the actions (`bot.attack` plus the kill loop are proven in
`web/src/tasks/library/tutorialIsland/combat.ts`), it is that a fighter with no food loop ends its
run the first time it drops low. Combat is a settings problem, not an actions problem.

**Prayer is two settings, not one, and an earlier draft collapsed them.** Microbot's
`togglePrayer` / `toggleQuickPray` / `prayerStyle` turn a protection or bonus prayer **on** and keep
it on; `restorePrayerBelowPoints` drinks a restore when points run low. They are different features
with different failure modes, and `survey-catalogue.md` section 5 recommends carrying the first
across by name ("the sprint's combat trainer entry should offer this 'keep prayer on/quick-pray'
shape, not the flicking shape"). Both ship, and 4.9's field table carries both, because a table that
says it is complete and has no prayer field in it produces a combat script with no prayer support at
all.

The verbs exist today: `bot.activatePrayer`, `sdk.sendTogglePrayer` and `state.prayers` are all on
the shipped surface, so keeping a prayer on is a script-level loop over state the script can already
read, and only the restore threshold is a `HealthPolicy` field. Microbot's boss-**flicking** shape,
which toggles a prayer on and off around an attack's timing, stays out of scope: it is a
reflex-timing aid rather than a task the bot performs (3.3), and nothing at these combat levels
rewards it.

### 4.8 Death and stuck policies

Nothing new. `resolvePolicy` in `web/src/tasks/behaviour.ts` already decides these, and its
precedence *is* the feature: **a script's own declared `health.*` beats the player's Tasks-panel
setting, which beats the built-in default**, field by field, with both sides validated because
either can hold junk written by an older build. Every catalogue script therefore declares only the
fields where it genuinely knows better than the player, and leaves the rest alone.

The recommended declarations, per script family:

| Family | Declares | Why |
|---|---|---|
| gathering, production | nothing | The player's own preference is right |
| `fight-npcs` | `onDeath: 'loot'`, `eatBelowPercent: 50`, `hardStop: { hpBelowPoints: 5 }` | The one family where dying is expected and looting back matters |
| `bank-items`, `travel-to` | `onStuck: 'stop'` | A transition that cannot reach its destination should hand back to the list, not pause forever |

What every script gets for nothing, because `recovery.ts` supplies one ordinary `Task` per
condition: death handling, relogin, an anchor walk-back, dialog and modal unsticking, and level-up
dismissal. What it still does not cover: eating (until P12 above), potions, run energy (the
standard's P13), and anything the run has to buy.

### 4.9 The combat script, field by field

`fight-npcs` is the largest settings surface in the catalogue and the one with the most external
prior art (Microbot's `AIOFighterConfig` has over seventy `@ConfigItem` fields). It is **not** a port
of that file. These are the fields our system can honour, and nothing else:

| Field | Type | Default | Notes |
|---|---|---|---|
| `target` | `text` | `Goblin` | A name or a RegExp source, passed to `bot.attack`. There is no npc list in the atlas, so this is typed, not picked |
| `style` | `select` | `melee` | `melee`, `ranged`, `magic`. Sets the combat style through `sdk.sendSetCombatStyle` |
| `spell` | `select`, `showIf: {key:'style', equals:'magic'}` | `Wind strike` | From the `Spells` table |
| `at` | `select`, `source: 'landmark'` | `nearest` | Where to fight |
| `leash` | `number` | 12 | Tiles from the run's start tile. 0 is off. Microbot's `centerLocation` plus `attackRadius`, in one field |
| `loot` | `boolean` | `true` | Pick up what drops, using `bot.pickupItem` |
| `lootItems` | `text`, `showIf: {key:'loot', equals:true}` | empty | Names to pick up; empty means everything the script dropped a kill for |
| `buryBones` | `boolean` | `false` | Fold prayer training in, the way Microbot's `toggleBuryBones` does |
| `eatBelowPercent` | `number` | 50 | Percent, and the name says so, per S8. Writes `health.eatBelowPercent` unchanged |
| `food` | `text` | `Shrimps` | Preference order, comma separated |
| `prayer` | `boolean` | `false` | Keep a prayer on for the whole run. Microbot's `togglePrayer`/`toggleQuickPray` shape (4.7), not the flicking shape |
| `prayerName` | `select`, `showIf: {key:'prayer', equals:true}` | the highest the character's level allows | Which prayer to keep on, from `state.prayers`. Microbot's `prayerStyle` in the one field our model can express |
| `restorePrayerBelowPoints` | `number`, `showIf: {key:'prayer', equals:true}` | 10 | Absolute prayer points, and the name says so, per S8. Writes `health.restorePrayerBelowPoints` |
| `balanceStyles` | `boolean` | `false` | Rotate the trained melee style so attack, strength and defence reach the level stop together. This is the one place a script self-selects method by current stats, adopted from `toggleBalanceCombatSkills`, and it is the only in-run auto-progression in the catalogue |
| `restock`, `loadout`, `bankAt` | section 4.6 | `off` | Runes, arrows and food are the consumables that make restock matter |

Its `stops` declaration is
`{ kinds: ['forever','durationMs','level','count','actions','supplies'], skill: 'Attack' }`, and
`actions` is the one that makes "kill 50 goblins" expressible at all (4.5).
Combat is also the one family where a level stop wants **three** targets rather than one (Microbot
has `attackSkillTarget`, `strengthSkillTarget` and `defenceSkillTarget` separately). Our
`StopCondition` carries one. **Ruling R4: one skill per stop, and three combat targets are three
steps of a task list**, which is the mechanism we have and the one the owner asked for. Cost if
wrong is in section 19.

**Not applicable, and absent by intent.** One row each, in the same form, for every field the survey
listed that this table does not adopt, so that a reader can tell content-absence from oversight:

| Surveyed field | Why not |
|---|---|
| Safe-spotting, projectile dodging | A tile-level tactic our `find` and `travel` layers cannot support, and the content has no projectile attacks worth dodging at these levels |
| Slayer-task-driven targets | No Slayer (R1) |
| `minPriceOfItemsToLoot` and value-gated looting | No price feed anywhere in the project, and no Grand Exchange at rev 274 (3.3) |
| World hopping, anti-ban | Section 7, D10 |
| `useSpecialAttack`, `specWeapon` | No special-attack verb on the shipped SDK and no special-attack energy in `state`. A finding under R7 if a script wants it, not a field we can honour |
| `toggleOnlyLootMyItems` | Loot ownership is not exposed to script code: `bot.pickupItem` sees a ground item, not whose kill dropped it. It matters on a shared server, so it is recorded here rather than dropped, and lifting it is an engine-side field on the ground-item packet |
| `toggleTelegrabUnreachableLoot` | Telegrab is in this catalogue at magic 33 and **cannot be cast**: the SDK declares no `TELEKINETIC_GRAB` component id (3.2 row 11, 3.3). It lifts with that finding and not before |
| `attackReachableNpcs` | A melee-reachability filter over a collision test our `find` layer does not run on npcs; `sdk.findNearbyNpc` sees the scene and answers nothing about reachability. `leash` is the bound we can honour |
| `toggleDisableOnMaxCombat` | A stop condition wearing a toggle's clothes. `stops` with `kind: 'level'` says the same thing and says it the same way as every other script (4.5, R4) |
| `minFreeSlots` as a bank trigger | Our bank leg triggers on a full inventory or an exhausted consumable, both of which the health ladder already detects (`inventory-full`, `out-of-supplies`). A free-slot threshold is a tuning knob on a mechanism that has to work first; revisit after the bank loop is proven on the stack (4.6) |
| `attackStyleChangeDelay` | Debounces a style switch in seconds. `balanceStyles` switches on a level crossing, not on a timer, so there is nothing to debounce |

### 4.10 The form controls the design system needs

The Automation panel renders a schema today through `renderParamsForm` / `paramField` /
`readValues` in `web/src/plugins/builtin/tasksViews.ts`: a checkbox inside
`label.field.field-inline.switch` for boolean, a `<select class=p-input>` for select, and
`<input class=p-input>` for number and text. Four new controls are needed, and **they are additions
to the shell v2 component library and the styleguide, in the same change that uses them**, per the
sprint's own constraint that the design system decides the UI.

| Control | What it is | Used by |
|---|---|---|
| **Area picker** | A select whose options are generated at render time, with `nearest` pinned first, and a "use where I am standing" button that writes the nearest landmark id | every `source`-ed select (section 4.3) |
| **Until selector** | A composite: a kind select plus exactly one dependent control (a skill select and a level number, an item text and a count number, or a minutes number). Renders the manifest's `stops.kinds` and nothing else | every script |
| **Loadout picker** | A select over the player's saved loadouts, with a link to the bank surface that makes one | `restock: 'loadout'` (entry 1) |
| **Step row** | A draggable row carrying an ordinal, a script name, a settings summary line, an until summary line, and a kebab menu | the task list (section 12) |

Two notes that save a later session an argument:

- **No slider is added here.** A threshold like `eatBelowPercent` would read better as a slider, and
  **no slider exists anywhere in the project**: `SettingField` in `web/src/plugins/types.ts:4-9` is
  a closed union of boolean, number, select, color and text with no range member,
  `settingsForm.ts:3`'s `control()` has branches for select, checkbox, number, color and text and no
  range branch, and no stylesheet styles `input[type=range]` - not `web/src/styles/forms.css`, which
  is the shipped one and styles `.input`, `.p-input`, `.select`, `textarea` and
  `input[type="checkbox"]`, and not `docs/design/idlescape-shell-v2/styles.css`, which is the shell
  v2 bundle's. (There is no `form.css`; an earlier draft named one, and the note has to survive a
  grep.) D49 already gives that work an owner (sprint entry 9 adds a real `range()` to the component
  library). Until it lands, thresholds are `number` inputs, and they become sliders for free when it
  does.
- **`showIf` is a panel behaviour, not a new control.** `paramField` gains a data attribute and one
  change listener on the form.
- **The area picker's three async rules are 4.3's**, restated here because a reader who starts at
  the control needs them: the panel pre-warms `load()` on mount and `paramField` reads `peek()`; a
  form opened before the fetch resolves renders the select **disabled** with `nearest` as its only
  option and populates in place; and `readValues` falls back to `field.default` rather than
  returning `''`.

**The fallback rendering, which is what makes tier 1 shippable if DS entry 4 slips.** These four
controls are shell v2 additions and shell v2 is DS entry 4's, so section 2's tier 1a gate names it.
The fallback is not a smaller design, it is the **existing** `paramField` output with no new class
and no new component: the area picker degrades to a plain `<select class=p-input>` whose options
were filled by the same code path, the until selector degrades to a kind `<select>` plus the
dependent `number` and `text` inputs as separate form rows (four rows instead of one composite), the
loadout picker is absent along with `restock: 'loadout'` (it is gated on S3 entry 1 anyway), and the
step row degrades to a non-draggable row with up and down buttons. Every one of those is drawn by
`renderParamsForm` as it stands today. **The fallback is a release valve and not the target**: the
composite controls are what the entry builds when shell v2 is there, and if the fallback ships it
carries a ledger row saying so.

---

## 5. Presets and saved settings, per account

The single largest quality-of-life gap the catalogue exposes is not in the catalogue. It is that
`renderParamsForm` rebuilds from `field.default` on every run, so **a player who wants the same
settings twice types them twice**, and the catalogue multiplies the number of fields there are to
retype. Two layers close it, and they are deliberately not the same layer.

**Layer 1: last-used, per script, locally.** On a successful run start, the panel writes the triple
to `localStorage` under `cs.params.<scriptId>` and seeds the form from it next time, falling back to
the declared defaults when it is absent or fails validation. It is per browser, needs no network, no
rule and no schema, and it is the layer that fixes the everyday case. The key keeps the `cs.` prefix
the constraints require.

**Layer 2: a named preset is a one-step task list.** A named, per-account, cross-device saved
setting is exactly `ScriptSetting` plus a name plus an owner, which is exactly a one-step task list
(section 9). The panel's "Save these settings" action creates one; the run form's preset dropdown
lists the lists that have exactly one step whose `scriptId` matches.

**Ruling R5: presets are not a third storage concept.** One type, two presentations. The cost of
being wrong is that players want a named preset without the word "list" in front of it, which is a
labelling fix in the panel and not a data migration: the panel can call a one-step list a preset in
its copy and nothing underneath changes.

---

## 6. The script template, and the shared helpers

Every catalogue script is written the same way, so that a session adding the sixteenth one has
nothing to invent. The template:

```ts
// web/src/tasks/library/<name>.ts
import { defineScript } from '../defineScript';

export default defineScript({
  id: 'kebab-case-and-stable',
  name: '...', version: 1, order: NN,          // NN, `stops`, `params` and `requires`: Appendix A
  tags: ['skilling', '<skill>'],
  author: 'idlescape',
  description: '...',
  params: { /* section 4, in the order: what, where, how long is NOT here, how */ },
  requires: [ /* tool(...) and skill(...) rather than failing at runtime */ ],
  stops: { kinds: [...], skill: '...', item: '...' },
  health: { /* only the fields this script genuinely knows better than the player */ },
  tasks: [
    /* highest priority first; every `run` checks c.signal.aborted inside every loop */
  ],
});
```

Three shared helpers, and the rule that governs them.

| Helper | Where | What it does |
|---|---|---|
| `pickMethod(c, table)` | `web/src/tasks/library/progression.ts` | Resolves `method: 'auto'` against the character's level and the methods reachable from here (section 4.2). Pure: a level and a table in, a method out |
| `ensure(c, sel, qty)` | `web/src/tasks/library/bankHelpers.ts` | The standard's P16 top-up. Composed from `openBank`, `getBankItems`, `withdrawItem` and a count |
| `restockOrStop(c)` | `web/src/tasks/library/bankHelpers.ts` | Reads `restock`, `restockItems`, `loadout`, `bankAt` and does one of the three things in section 4.6 |

**Every one of these pays the HELPERS transcription.** `web/src/tasks/library/index.ts` holds a
hand-maintained JavaScript twin of the shared helpers, prepended to every fork seed, because
`compileUserScript` strips import lines and runs the rest through `new Function`. Its own comment
overstates what `librarySource.test.ts` covers: that test compares `dropAllTask(...).when` on two
chop-and-drop fixtures and calls `tool`, `invFull` and `levelOf` directly, and never compares
`countMatching`, `dropAllTask.run` (the drop loop, its abort guard, and the half that moves the
game), the `keepParam === true` branch, or the net-fish and mine seeds. **Ruling R6: the generated-`HELPERS` `--check` is entry 6's own first task, and no shared helper in
the table above is written before it lands.** It is audit C25's proposed fix: `HELPERS` is generated
at build time by stripping the types off the helper modules, with a `--check` mode in
`scripts/build.ps1` beside `bun scripts/gen/atlas.ts --check`. Three new shared helpers times
nineteen fork seeds is exactly the scale at which a hand transcription stops being survivable.

**C25 does have an owner elsewhere, and entry 6 still carries the task**, which is the part an
earlier draft left to inference. `2026-09-07-sprint-dragon-slayer.md`'s entry 11 (Battlebots) folds
C25 in by name: "C25 ... lands before the task that adds the four library bot scripts". Sprint 3
opens only when Dragon Slayer closes, so in the expected order the `--check` is already there when
entry 6 starts. **Entry 6's first task is therefore to verify it landed and, if it did not, to land
it**, which is a bounded build-script change either way and is cheap at the front of the entry and
expensive anywhere else. Written this way the ruling has one answer whether or not the sibling
delivered, which is what a plan writer needs; section 17 carries the row. Once the `--check` exists,
the three helpers cost their modules and their tests and nothing else, and 8.2 shrinks to
"`scripts/build.ps1` fails on drift".

**The stop-condition helper the brief asks for is not in this table, on purpose.** Section 4.5 makes
the stop declarative, so there is nothing for a helper to do: the runner evaluates it, no script
imports anything, and the HELPERS cost is zero. That is the second reason R3 chose the declarative
route.

### 6.1 The rule that makes the catalogue a test of the standard

The sprint's own words for entry 6: "Each is also a test of the API: a script the standard cannot
express cleanly is a finding against the standard, recorded in this entry's ledger."

**Ruling R7: that is a hard obligation with a named form.** When a catalogue script has to reach
around the standard, the implementer records a row in the entry's ledger with: the script, the
clause of section 4 of the standard it strained (S1 to S12), what the script had to do instead, and
whether the fix is a new proposal or a change to an existing one. The entry does not close with an
empty findings section and nineteen scripts; either the standard held everywhere, which is a
finding worth stating, or it did not, which is the entry's most valuable output. Four findings are
predicted here already and should be checked off or contradicted: P12 (no combat
without it, 4.7), P16 (no bank loop without it, 4.6), the absence of an npc scan on `FindDeps`
(6.2 below), and **the two uncastable spells** (3.2 row 11 and 3.3): the SDK's `Spells` table
declares no component id for bones to bananas or telekinetic grab, and there is no self-cast send
primitive at all, so the proposed fix is a `sendSpell(component)` send plus the two ids, as a logged
`web/src/vendor/PATCHES.md` deviation rather than a silent edit.

### 6.2 What the catalogue needs from `c.find`, and what it does not get

`c.find` searches in three layers (the scene, then the atlas cluster with a re-scan, then a bounded
sweep) and answers for nine `ResourceKind`s. **It cannot find npcs other than fishing spots**, and
there is no npc scan door on `FindDeps` at all. `fight-npcs` and `pickpocket` therefore reach their
targets through `sdk.findNearbyNpc`, which sees only the current scene: they can fight what is in
front of them and walk to a landmark first, but they cannot walk to a goblin.

The atlas could carry them. `scripts/gen/atlas.ts` already parses `square.npcs` from every `.jm2`
in full and then discards every npc that is not a fishing spot, so adding combat npcs is a
`kinds.ts` change plus a filter, not a new pipeline; and the committed atlas is 179,612 bytes raw
against a 250 KB budget, leaving 76 KB of headroom.

**Ruling R8: entry 6 does not grow the atlas.** Fighting what a landmark puts you next to is
sufficient for every target in section 3.2 (goblin x24 at Lumbridge, barbarian x13 at Barbarian
village, al_kharid_warrior x9 at Al Kharid are all within a landmark's own radius), and a new npc
kind would also need a new scan door on `FindDeps` that nothing else wants yet. The headroom and
the parsing are recorded here so the entry that does want it knows the cost is a filter.

---

## 7. Settings that are not applicable

Recorded once, per D10, because a reader coming from any other bot's settings screen will look for
them and should find this paragraph rather than an omission.

| Setting | Status |
|---|---|
| Anti-ban, anti-detection, "human-like" mouse paths, timing randomisation | **Not applicable** (D10). The server is ours; there is nothing to evade. **No script in this catalogue asks for randomised timing and this spec specifies none**, so the row is a record and not a door: a later session that wants it needs a named script and a named gameplay reason, and this row is not that reason |
| World hopping, world selection, crowded-world detection | **Not applicable.** One world |
| Break and play schedulers framed as evasion (`PlaySchedule`, break handlers) | **Not applicable** in that framing. The useful half of the idea, a pause the running script observes at its own safe points rather than a hard external kill, is adopted in section 14.1 as the shape of the list's pause, and is the same shape as the `c.signal.aborted` check every script already owes |
| Proxy and IP settings, account rotation | **Not applicable** |
| Script marketplace tiering (free versus premium visibility) | **Not applicable.** The library is bundled with the client |

Worth one sentence, because it surprised the survey: **none of `AIOFighterConfig`'s seventy-plus
fields is an evasion setting.** Every one is a gameplay or safety choice. In that ecosystem the
evasion framing lives at the platform and review layer, which is exactly the layer D10 rules out for
us, so excluding it costs the catalogue nothing in feature parity.

---

## 8. Tests for the library

Four layers, and a gate that proves all four exist for every script.

### 8.1 The scripted-sequence harness, per script

`web/src/tasks/library/library.harness.ts` drives a script against a scripted world sequence and
`library.test.ts` holds the cases. **Every catalogue script gets at least three cases**: the happy
lap (the loop advances and the xp arrives), the stop (its declared `stops` kinds each end the run
with `status: 'done'` and a summary naming the stop), and one refusal (a missing requirement, or a
`find` that answers nothing, ends the run with the right `failReason` rather than spinning).

### 8.2 The HELPERS trap

Per the `idlescape-library-script` skill, and widened because nineteen seeds is not two:

- Every new script gets a seed case in `librarySource.test.ts`.
- The comparison is widened beyond `when` to cover `countMatching`, `dropAllTask.run` including its
  `c.signal.aborted` guard, the `keepParam` branch (now `disposal === 'keep'` rather than
  `keepLogs === true`, per 4.2), and every new shared helper, **for every seed**.
- **The mutation table is the acceptance bar, not the green suite.** Change one character inside
  `HELPERS`, run the suite, watch a test fail. If nothing fails, the comparison does not cover what
  it claims to. This is written into the task, not left to judgment.
- R6 above: land the generated-`HELPERS` `--check` first, and this whole section shrinks to
  "`scripts/build.ps1` fails on drift".

### 8.3 The live-stack spec, per script

In the shape SP4b task 14 established, which is the shape that works: Playwright against the local
stack, **budgeted in game ticks rather than wall clock** so a slow machine does not move the pass
criteria, seeded through the engine's own developer commands.

`web/e2e/harness.ts` already exports what these need: `seedCharacter(page, seed)` (which drives
`::setstat`, `::give` and `::tele` through `window.idlescape.tasks.dispatch` and polls until the
teleport has landed), `runUntil(page, predicate, opts)` (which polls the live run on a tick budget
and attaches the last forty trace events on failure), and `saveArtifacts`. The stack must be started
with `-DevStaff` for the cheats to be permitted.

One spec per script, each: seed the character to the level and inventory the method needs, seed it
to the place, start the run with settings, and assert the stop fires inside a tick budget. The
budget is the script's own claim, so a script whose loop is slower than it says fails its spec.

**Ruling R9: the catalogue specs do not run inside `npm run verify`.** Nineteen live scripts on
tick budgets is tens of minutes, and `verify.ps1` is the gate every session runs. They carry a
`@catalogue` tag and run under `npm run e2e:catalogue`; `verify.ps1` keeps a **smoke subset of
four** (`fletch-bows` for the pure inventory loop, `chop-and-drop` for gathering, `smelt-bars` for
the bank loop, `fight-npcs` for combat and the food recovery). `docs/VERIFICATION.md` gains a line
saying plainly what a green verify does not cover here, which is the honest half of that document's
job. This is cross-entry: D72.

**The split is four changes, not one line, and an earlier cost line said one.** Measured:
`web/playwright.config.ts` declares only `testDir: 'e2e'`, `timeout: 120_000`, `workers: 1` and
`retries: 1`, with no `projects` and no `grep` or `grepInvert`; `scripts/verify.ps1:279` runs a bare
`npx playwright test`, which would pick up all nineteen catalogue specs the moment they exist.
Delivering R9 needs all four of:

1. **`grepInvert: /@catalogue/`** on the default project in `web/playwright.config.ts`, so the bare
   invocation verify already runs keeps meaning "everything but the catalogue".
2. **A second tag, `@smoke`**, on the four subset specs, which also carry `@catalogue`. `verify.ps1`
   runs `npx playwright test` (unchanged) and then `npx playwright test --grep @smoke`, which is the
   one line the earlier cost estimate was thinking of. Tagging rather than path-listing keeps the
   subset editable in the spec files themselves.
3. **`"e2e:catalogue": "playwright test --grep @catalogue"`** in `web/package.json`, which today has
   only `test:e2e`.
4. **A per-spec `test.setTimeout`**, because the config's 120 s default is well under a
   tick-budgeted run; `web/e2e/tutorial-island.pw.test.ts:71` already sets 25 minutes for exactly
   this reason and is the precedent to copy.

Two traps these specs inherit, both already paid for once:

- `loginAsGuest` in `web/e2e/helpers.ts` returns on the session's **first** world publication, so a
  spec that drives `bot.*` straight after it must wait for the world it acts on before it acts
  (D87, the e2e wait). Every catalogue spec waits.
- Playwright runs from `web/`. From the repository root it reports "No tests found" and exits 0.

### 8.4 The catalogue gate

One test, and it is the thing that keeps the catalogue honest as it grows:
`web/src/tasks/library/catalogueGate.test.ts` reads `LIBRARY` and asserts, **for every entry**:

1. the manifest carries `id` (matching `/^[a-z][a-z0-9-]{1,40}$/`), `name`, `version`,
   `description`, `tags`, `author`, `order`;
2. it declares `params` with at least a `method` or a documented reason not to, and every field
   validates against its own default. **`travel-to` and `bank-items` carry the documented reason**
   in Appendix A: neither trains anything, so neither has a method table, and their `to` and
   `deposit` fields are their whole surface;
3. it declares `stops.kinds`, and every kind it names is one `stopReached` implements. **Appendix A
   declares them for all nineteen**, including the two utilities (`travel-to` stops on arrival,
   `bank-items` when the bank interface closes, so both declare `['forever']` and end `done` from
   their own task rather than from a stop) and including the three where it is awkward
   (`run-agility` has no item, so it is `actions` over laps; `cast-spells` and `bury-bones` are
   `supplies`, over runes and bones respectively);
4. it is registered in all three places (`LIBRARY`, the `?raw` import, and `SOURCES`), because
   missing the third makes `librarySource(id)` return null and the Fork button silently do nothing;
5. it has a case in `library.test.ts` and a seed case in `librarySource.test.ts`;
6. it has a live spec file at `web/e2e/library/<id>.pw.test.ts`, **or** at
   `web/e2e/<id>.pw.test.ts`, which is where the one that exists today lives.

Items 5 and 6 are filesystem assertions, which is unusual in a unit test and is the point: they are
the two a busy session skips.

**Two corrections to an earlier draft of this gate, both of which it failed against shipped code.**
There is no `web/e2e/library/` directory: `tutorial-island`'s spec is `web/e2e/tutorial-island.pw.test.ts`,
so item 6 accepts either path and new specs go in the subdirectory. And `tutorial-island`'s exception
is **not** item 4 alone. It is a multi-module script with no fork seed, which is why
`SOURCES` omits it by name in `web/src/tasks/library/index.ts` (item 4) and why it has no seed case
(item 5); it declares no `method` (item 2) and no `stops` (item 3) because it is a scripted run of a
fixed sequence with a natural end. The gate therefore carries `tutorial-island` as a named exception
to items 2, 3, 4 and 5, and holds it to items 1 and 6 like everything else.

---

# Part B. The task list

## 9. The model

```ts
export type OnFailure =
  | { kind: 'stop' }                      // the list stops here. Default
  | { kind: 'skip' }                      // advance to the next step
  | { kind: 'retry'; times: number };     // 1 to 5, then the list stops

export interface TaskStep {
  id: string;                             // stable within the list, so reordering is safe
  scriptId: string;
  params: ParamValues;
  stop?: StopCondition;                   // section 4.5
  onFailure: OnFailure;
  enabled: boolean;                       // a step can be muted without deleting it
  note?: string;                          // the player's own label, 0 to 80 chars
}

export interface TaskList {
  id: string;
  name: string;                           // 1 to 60, matching the tasks rule's bound
  description: string;
  steps: TaskStep[];                      // 1 to 20
  loop: boolean;                          // start again at step 1 when the last one finishes
  createdAt: number;
  updatedAt: number;
  version: number;
  lastRun?: { runIds: string[]; at: number; finishedStep: number };
}
```

`TaskStep` is `ScriptSetting` (section 4.1) plus a failure policy plus two bits of presentation.
That is deliberate: **the step is the triple**, so a preset, a step, and a recorded session are the
same shape, and section 10's shape C can consume the list unchanged.

**Transitions are not a field on a step.** A list that chains "woodcut until 30, then fish until 200
shrimp, then bank" - D61's own example - has to bank between steps and walk to the next step's area,
and the obvious design puts both on the step as optional fields. Section 10.3 makes them ordinary
steps instead, so a list that banks between two skilling steps has three steps. (This is the spec's
own statement of the requirement, in its own voice. An earlier draft attributed it to "the brief" as
a quotation, and that string appears in no committed document: not in either D61 row, not in sprint
entry 7's paragraph, not on the sprint control board. R11 is a good ruling and it does not need an
uncitable quote under it.)

The 20-step cap is a judgment, not a limit anything imposes: it keeps the Firestore document small,
keeps the panel a list rather than a scroll, and is well past the chain the owner described. It is
enforced in the rule and in the panel.

---

## 10. Where the list runs

### 10.1 The constraint that shapes every option

**One run per tab, refused in two places.** `api.run` throws `TasksError('busy')` when
`status().state` is in `{starting, running, paused}`, and `worker.ts`'s `startRun` refuses again as
a backstop. A list is therefore never N concurrent runs, and something above the api has to own the
sequencing.

### 10.2 Three shapes, and the ruling

**Shape A: one synthetic `Script` whose tasks are the steps.** Build a `Script` at run time whose
`tasks` are the concatenation of each member script's tasks, each `when` wrapped with a step guard.
`tutorialIsland/index.ts` already does exactly this with eight modules. Cheapest to build. Three
blockers: `c.params` is one flat `ParamValues` for the whole run, so two steps of the same script
with different settings collide (namespacing to `s0.tree` fails the Worker's strict unknown-key
validation unless the synthetic manifest declares them); one `RunSummary` for the whole list, so
neither the report nor the stats page can attribute xp to a step; and the health policy is resolved
once at run start, so a list mixing a combat step with a woodcutting step cannot vary it. Cheapest
to build, worst to read back.

**Shape B: a sequencer above the api.** A module beside `api.ts` owns the list, calls
`api.run(step.scriptId, step.params, { stop: step.stop })`, waits for a terminal state or the
`run_done` event, and starts the next step.

**Shape C: a third `ScriptRef` kind and a supervisor inside the Worker.** `ScriptRef` is
`{kind:'library', id} | {kind:'user', code}` today; a third `{kind:'list', steps}` would let
`resolveScript` build the sequence inside the Worker above `createRunner`. It buys the one thing B
does not have: the game is never let go between steps, one `AbortController` hierarchy, and the
health monitor stays attached across the whole list. It costs the thing that makes B work:
`RunSummary` is minted per `startRun`, so a list is either one summary (losing per-step
attribution, as in A) or `startRun` grows a per-step summary emitter, which means `run_end` fires
more than once per `run` message and every consumer of it changes (`runRecorder`, `api`, the panel).

**Ruling R10: shape B for the first release, with the step designed to lift into C unchanged.**

**R10 supersedes the sprint row's "one autonomous run" phrasing, and this sentence is the override.**
`2026-09-07-sprint-legends-quest.md`'s entry 7 says the player "runs it as one autonomous run with
pause, resume, skip and the run report per step". Under shape B a list is N ordinary runs and N
history rows, which reads as a contradiction until you notice that the same sentence asks for "the
run report per step", and a run report is minted per `RunSummary`, which is minted per `startRun`.
One run and a report per step are not both available: the per-step report is the half that carries
the owner's value, so it wins, and "one autonomous run" survives as what the player *experiences* -
one Run button, one pause, one co-pilot line, no attention between steps (R13, 12.3). This spec's
header claims authority over that document on scope; this is the second place it uses it, after
R11.

What B gets for free, and this is the whole argument: **every step is an ordinary run.** One
`RunSummary` and one history row per step, which is exactly what the per-step report and the stats
page read. Per-step params validated by the existing path. Per-step requirements checked by
`evaluateRequirements` before the step starts. The per-account toggle enforced per step by
`refuseIfDisabled`, so a player who disabled a script does not have it run because it was in a list.
The behaviour settings re-read at each step's start, which is the documented contract. Not one of
those is written by this entry.

What B must own, and these are its whole surface: the "a list is running" state, because the run
banner and the Tasks panel both key off `RunStatus`, which knows about one run; skip; what a failed
step does; and the gap between steps, during which nothing holds the game.

**Named risk: `api.restart()` restarts the last run.** A list's "Run again" must rebuild from the
list document and must not go through `restart()`, or it re-runs the final step alone. This is
written into the task, because it is the kind of thing that looks right in a review and is wrong at
run time.

Shape C is the migration target and is named as such so that nobody rediscovers it: the moment a
list needs to hold the game across a step boundary (a combat step handing off without dropping
aggro, say), C is the answer and the step triple lifts into it with no data migration.

### 10.3 The gap between steps, and why transitions are scripts

Under shape B nothing holds the game between steps. A sequencer that banked or walked by itself
would need its own transport, outside a run, duplicating the runtime and bypassing the trace, the
health ladder and the abort signal. That is the wrong answer.

**Ruling R11: a transition is a step, delivered as two ordinary bundled scripts.**

- **`travel-to`**: one setting (`to`, a `source: 'landmark'` select, or a `"x,z,level"` tile), walks
  there through `c.travel`, ends `done` on arrival and `failed` with `unreachable` otherwise.
- **`bank-items`**: walks to `bankAt`, deposits by a rule (`all`, `all but tools`, a named list),
  optionally withdraws a list, ends when the bank interface closes.

Both are useful standalone, both are testable by section 8's four layers with no special case, both
appear in the Marketplace like any other script, and both get their own history row, trace and
recovery ladder because they are runs. The list model stays one kind of element, and the panel's
"insert a bank step" action is a shortcut that inserts an ordinary step.

Cost if wrong: an extra history row per transition, which clutters the stats page. Mitigated by
tagging both scripts `['utility']` and having the stats page exclude that tag by default
(section 16).

### 10.4 The seams, named

Everything the sequencer touches already exists. This is the complete list, so the plan can be
written against it:

| Seam | Used for |
|---|---|
| `api.run(scriptId, params, opts)` | starting a step. `opts.stop` is the section 4.5 addition |
| `api.status()`, `api.onStatus` | knowing the step reached a terminal state |
| `api.onEvent` (`run_done`) | the step's outcome, with its status, summary, duration, xp and items |
| `api.stop`, `api.pause`, `api.resume` | the list's own stop, pause and resume, applied to the current step |
| `api.listRuns`, `api.getRun` | the per-step report, and the stats page |
| `evaluateRequirements` | already called on the step's behalf inside `api.run` |
| `refuseIfDisabled` | already called on the step's behalf inside `api.run` |
| `web/src/agent/types.ts:85`, `web/src/agent/worker.ts:188` | the Worker `run` message and `startRun`, which carry `opts.stop` across `postMessage` (4.5) |
| `web/src/tasks/library/index.ts:19-27` | `libraryManifests()`, whose hand-enumerated projection is what makes a new `stops` field visible to the panel (4.5) |
| `web/src/tasks/api.ts:291-311` | `restart()`, which must round-trip `summary.stop` (4.5) and which a list must **not** go through at all (below) |

The last three rows are the ones an earlier draft's "complete list" left out, and they are exactly
the hops that fail quietly rather than loudly.

**The file layout, because the 400-line ceiling is a sprint constraint and the panel files are
already at it.** Measured today: `web/src/plugins/builtin/tasks.ts` is **399** lines,
`tasksViews.ts` is 299, `web/src/tasks/types.ts` is 323. Onto those two entries this spec puts a
Lists section and list index, a list editor with reordering, four new form controls, the run-card
list line, the layer-1 last-used persistence and the whole stats section. Naming the boundaries here
means a plan writer inherits a layout instead of discovering the cap mid-task:

| New module | Holds |
|---|---|
| `web/src/tasks/taskList.ts` | the sequencer and its state machine |
| `web/src/tasks/taskListStore.ts` | persistence, import and export (section 11) |
| `web/src/plugins/builtin/tasksLists.ts` | the Lists section: index, editor, step rows, run controls (12.1) |
| `web/src/plugins/builtin/tasksStats.ts` | the stats reducer and its renderer (sections 15 and 16) |
| `web/src/plugins/builtin/paramControls.ts` | the area picker, the until selector and the loadout picker, split out of `tasksViews.ts` (4.10) |
| `web/src/tasks/stops.ts` | `stopReached` and the baseline, kept out of `runner.ts`, which is 9.4 KB already |

`tasks.ts` gains a mount call per new section and nothing else, which is the only change that keeps
it under the ceiling. All six are testable without a browser: the sequencer takes the api as a
dependency the way `library.harness.ts` takes a world sequence, and the stats reducer is a pure
function over `RunSummary[]`.

---

## 11. Persistence, import and export

### 11.1 Where a list lives, and a fact that settles it

The obvious cheap option is a `UserTaskDoc` with a new `source` value, which the studio spec's
storage rulings would otherwise favour (that rule "validates named fields and does not use
`hasOnly`, so an added map field is allowed without a rules change").

**That option does not exist.** `firebase/firestore.rules` gates every write to
`users/{uid}/tasks/{taskId}` on:

```
&& request.resource.data.source in ['user', 'fork', 'library']
```

A document with `source: 'list'` is **denied**. So the "no rules change needed" route is not on the
table: both options cost a rules change, and once they cost the same, the sibling collection is
strictly better. A list has no `code`, so the 64 KB `code` bound and the compile path are dead
weight on it, and overloading `UserTaskDoc` would put a document in the scripts list that is not a
script.

**Ruling R12: task lists live at `users/{uid}/taskLists/{listId}`, with a new rule.** Cross-entry:
D67.

```
match /taskLists/{listId} {
  allow read: if request.auth != null && request.auth.uid == uid;
  allow write: if request.auth != null && request.auth.uid == uid
               && request.resource.data.name is string
               && request.resource.data.name.size() >= 1 && request.resource.data.name.size() <= 60
               && request.resource.data.steps is list
               && request.resource.data.steps.size() >= 1 && request.resource.data.steps.size() <= 20;
  // A delete carries no `request.resource`, so the shape checks above raise a null-value error
  // and deny. Deletes need their own rule, exactly as `tasks/{taskId}` documents.
  allow delete: if request.auth != null && request.auth.uid == uid;
}
```

The `allow delete` line is not optional and its absence is a real, shipped bug elsewhere in this
same file: the `scriptToggles` block has no `allow delete`, so toggle deletes fail silently in
production. The neighbouring `tasks` block already documents the trap. This rule follows `tasks`,
not `scriptToggles`.

Steps are stored as an array of maps, which Firestore allows (arrays may not contain arrays; they
may contain maps, and `ParamValues` is scalars only, so it maps cleanly). The rule cannot deep
validate a step, so `taskListStore.ts` validates on read as well as on write, discarding a
malformed step with a console warning rather than throwing, which is the same defensive posture
`resolvePolicy` already takes toward settings written by an older build.

### 11.2 Import and export

Export is the `TaskList` document as JSON, minus `id`, `createdAt`, `updatedAt` and `lastRun`, with
a `formatVersion: 1` field added. Import validates against the same reader, mints a new id, and
**reports rather than fails** on a step whose `scriptId` is not in the library or whose params no
longer validate: the step is imported disabled, with the reason on the row, so a list from an older
build opens as a list with two broken steps rather than as an error.

**No cross-account sharing (D24).** Import is a file the player chose, not a link, not a code, not a
fetch. A list carries no code, only script ids and scalar params, so an imported list cannot run
anything the importing account's own library does not already contain, and it is bounded by the same
per-account toggles. That is the property that makes JSON import safe here and would not make script
import safe, and the difference is worth stating in the panel's copy.

---

## 12. The UI

### 12.1 In the Automation panel

**`PanelId` in `web/src/types.ts` is a persisted data contract and the shell v2 icon strip is fixed
at exactly eleven glyphs.** A task list is therefore a **section of the Tasks panel, not a panel**,
and this spec adds no panel and no glyph.

The Tasks panel gains a **Lists** section, beside the three it has. **It is a section and not a
tab**, because the panel has no tab control at all: `web/src/plugins/builtin/tasks.ts:62` defines
`section(title, ...children)` as `h('details', { class: 'section', open: true }, h('summary', ...),
...)`, and the panel body at 307-310 is exactly `section('My scripts', ...)`,
`section('Run snippet', ...)` and `section('History', historyHost, reportHost)`; `web/src/styles/tabs.css`
is used by `web/src/ui/strip.ts` and `web/src/plugins/builtin/bank.ts` and by nothing in this panel.
An earlier draft said "tab" here while section 16 said "section" for the stats page four pages
later. If the panel should have a tab strip, that is a shell v2 component and DS entry 4's to own,
and this entry composes with it rather than inventing the first one. The Lists section holds:

- **A list index.** One row per saved list: name, step count, the skills it touches as tags, and a
  Run button. Empty state points at the Marketplace.
- **A list editor**, open on a selected list. Ordered step rows, each a Step row control
  (section 4.10) that expands into the **same `renderParamsForm` the run form uses**, plus the until
  selector and the failure policy. Reordering is drag, with keyboard equivalents, and writes
  `steps[]` order; step ids are stable so a reorder is not a delete and a create.
- **Add a step**: a script picker over the enabled library plus the player's own saved scripts, then
  the settings form, then Save. "Insert a bank step" and "Insert a walk step" are shortcuts that add
  an ordinary `bank-items` or `travel-to` step (R11).
- **Run controls**, on the list rather than on a step: Run, Pause, Resume, Skip step, Stop.

Reusing `renderParamsForm` unchanged is the point of section 4.1's triple. The list editor is
mostly composition, not new form code.

### 12.2 The run card, and progress

While a list runs, the Tasks panel's run card gains one line above what it shows today: the list
name, `step N of M`, the step's own name, and the step's stop rendered as a sentence ("until
Woodcutting 30"). The existing per-run detail below it is unchanged, because the thing running *is*
an ordinary run.

### 12.3 The co-pilot bar

The shell v2 co-pilot bar presents five states: unpaired, standby, running, paused, stuck (D17).

**Ruling R13: a list run is `running`, including between steps.** The bar's line carries the list
name and `step N of M`; the step's own script name is the secondary text. The gap between steps is
`running` and never `standby`, because `standby` reads as "nothing is happening" and something very
much is. A paused list is `paused`; a list stopped by a step's `onFailure: 'stop'` is `stuck` with
the step's fail reason, which is exactly what the bar's stuck state is for.

No new bar state is added. That is a deliberate constraint on this entry: the bar is entry 4's
surface and this entry composes with it rather than growing it.

---

## 13. What the recorder will emit into

`docs/ideas/2026-09-07-script-recorder-and-block-editor.md` describes a recorder with an exact mode
and a smart mode, whose output "shows up alongside the existing ones like woodcutting and fishing",
and whose smart mode "will allow settings like run X times or until Y items are created".

That sentence is `StopCondition` with `kind: 'count'`, and it lands for free under section 4.5.

**Ruling R14: a recorded session emits a `ScriptSetting` triple, and that is the whole contract
between the recorder and this spec.** Concretely:

- A recorded session becomes a **user script** in `users/{uid}/tasks/{taskId}` exactly as the
  recorder idea already plans, plus a triple naming it, its recorded params and its recorded stop.
- **A step's `scriptId` may be a user script id, not only a library id.** The step model already
  allows this because `api.run` already resolves both `ScriptRef` kinds; the panel's step picker
  lists both. A recorded session is therefore a step with no new mechanism.
- A recorder session that spans obviously separable phases (bank, travel, do the thing) may emit a
  **list** rather than one script, and the phases are steps. Nothing in this spec needs to change
  for that; the recorder decides where to cut.

The one thing this spec owes the recorder is that the triple is stable and small, which section 4.1
makes it.

---

## 14. Failure and recovery

### 14.1 Three signals, one mechanism

Pause, skip and stop are the same abort signal at different edges, which is why they cost almost
nothing: every script already owes a `c.signal.aborted` check inside every loop, or it cannot be
stopped, and that is a promise the panel already makes.

| Action | What happens |
|---|---|
| **Pause** | `api.pause()` on the current step. The step's own loop observes it at its next safe point. The list pointer does not move. Resume continues the same step |
| **Skip** | `api.stop()` on the current step, which ends it with `status: 'stopped'`, then the pointer advances. The skipped step's history row records `stopped`, so the report is honest about what did not happen |
| **Stop** | `api.stop()` and the pointer stays. The list is not running; Run again resumes from the pointer, or from step 1 if the player chooses |

This is the useful half of the break-scheduler idea the surveyed systems reach for (PowBot's
`BreakEvent.delay(ms)`/`accept()`, Microbot's `breakhandler`): a pause the running thing observes
and honours at its own safe point, rather than a hard external kill. The evasion framing those
systems put around it is not applicable (section 7); the shape is good and we already have it.

### 14.2 The health ladder, and where the list sits above it

The ladder does not change, and the list deliberately sits **above** it rather than inside it. Order
of resolution, innermost first:

1. **Inside the step.** `HealthCondition` is closed at nine (`no-progress`, `unexpected-interface`,
   `dialog-stuck`, `level-up`, `death`, `logout`, `inventory-full`, `out-of-supplies`, `low-hp`),
   and `recovery.ts` supplies one ordinary `Task` per condition, entered and traced and
   attempt-counted like any other. A script may claim one with `Task.recovers` and answer it itself.
   **The list never sees a recovery**; a step that recovers and carries on is a step that is still
   running.
2. **The step ends.** Either it reached its stop (`done`), or it hit `maxRecoveryAttempts` or a
   `hardStop` or a refusal (`failed`, with one of the **thirteen** `failReason` values: `stuck`,
   `unreachable`, `no_progress`, `died`, `disconnected`, `out_of_supplies`, `inventory_full`,
   `requirements`, `timeout`, `aborted`, `crashed`, `low_hp`, `logged_out`), or the player skipped
   it (`stopped`).
3. **The list decides**, and only here: `done` advances; `stopped` advances (a skip); `failed`
   applies the step's `onFailure`.

`retry` re-runs the step from the beginning with the same settings, up to `times`, and each attempt
is its own run and its own history row. That is honest rather than tidy: three attempts produced
three runs and the stats page should say so.

### 14.3 The four failures the list itself has to answer

These are the ones that are not any step's fault, and each gets a defined answer rather than a
default:

| Failure | Answer |
|---|---|
| The step's script is gone (uninstalled, or a user script deleted) | The step is marked broken and the list applies `onFailure`. The default `stop` means the list halts with a clear reason rather than silently skipping work the player asked for |
| The step's saved params no longer validate against the current manifest (a field was removed, a select option renamed) | `api.run` refuses with `TasksError('params')` before anything moves. The list treats it as a `failed` step, and the panel marks the step with what is wrong so it can be fixed in place. **This is why the stricter Worker validator matters**: it fails on an unknown key, so a stale key is a loud failure, not a silent one |
| The character is logged out between steps | The next `api.run` fails its requirements or its transport. Treated as `failed` on that step. The list's `onFailure` decides; the relogin ladder belongs to a run, and between steps there is no run to own it. **This is the one real cost of shape B**, and it is named here rather than discovered later |
| The tab is closed mid-list | The list does not resume by itself. `lastRun.finishedStep` is persisted after each step, so reopening the panel offers "resume from step N". Nothing runs without the player asking |

### 14.4 Tests for the list

- **The sequencer, unit.** `taskList.test.ts` drives the sequencer against a fake api (the same
  posture `api.harness.ts` already establishes): a three-step list advances; a `failed` step with
  each of the three `onFailure` policies does the right thing; `retry: 2` produces three runs; skip
  advances and records `stopped`; pause and resume do not move the pointer; `loop: true` wraps.
- **The store, unit.** `taskListStore.test.ts` against the backend interface, not Firestore: round
  trip, the 20-step cap, a malformed step discarded on read, import of a list with an unknown
  `scriptId` producing a disabled step.
- **The rule.** The Firestore rules test asserts the write bounds and, specifically, **that a delete
  succeeds**, because that is the assertion whose absence is a live bug in the neighbouring
  `scriptToggles` block.
- **Live, one spec.** `web/e2e/task-list.pw.test.ts`, tagged `@catalogue`: a two-step list
  (`fletch-bows` with a count stop, then `bank-items`) runs end to end on a tick budget and produces
  **two** history rows carrying the same `listId` and `stepIndex` 0 and 1. That last assertion is
  the one that proves shape B actually delivered what it was chosen for.

---

# Part C. Script stats

## 15. What it reads

Every number the page wants is already recorded. `RunSummary` (written by `runRecorder.ts` into
`history.ts`) carries `scriptId`, `scriptName`, `params`, `status`, `startedAt`, `endedAt`,
`durationMs`, `xpGained` per skill, `itemsDelta` by item id, `tilesTravelled`, `failReason`,
`recoveries` per condition, and **`characterName`**, which is kept precisely because history
outlives a rename. Retention is 200 summaries, of which the newest 50 keep their trace.
`renderHistoryRow` already computes an xp-per-hour column from `xpGained` and `durationMs`, which
is the same arithmetic the page needs.

Three optional fields are added, and they are the only change part C makes to the store:

```ts
interface RunSummary {
  // ... existing fields ...
  listId?: string;
  stepIndex?: number;
  /** The stop the run was started with, so `restart()` can start it the same way (4.5). */
  stop?: StopCondition;
}
```

**No `SCHEMA` bump, and this is a correction to an earlier draft.** `SCHEMA` (`history.ts:41`) is
the IndexedDB version passed to `indexedDB.open`, and `withDefaults` (`history.ts:89-97`) exists to
fill fields `RunSummary` declares as **required** on rows written before they existed. All three
fields here are optional: nothing reads them without a presence check, IndexedDB stores the extra
keys with no store change, and `withDefaults` needs no entry for them. Bumping to 3 would fire an
`onupgradeneeded` that creates nothing and would introduce a `blocked` path when a second tab holds
the old version open, which is a real hazard bought for no benefit. The version moves when the
stores change or when a required field is added; neither is true here. Cross-entry: D69, as amended
by the decision this revision appends.

## 16. What it shows

Deliberately small. One section in the Tasks panel, under the existing history:

- **Per script**: name, runs, total time, xp per hour per skill, and the trend across the retained
  window. Sorted by xp per hour, because the question the owner named is "which script is actually
  best".
- **Per character**: the same table filtered, using `characterName` from the summary rather than the
  current roster, so a renamed or deleted character still reports honestly.
- **Per list**: grouped by `listId`, with the steps in order and each step's contribution. This is
  what the two new fields buy.
- **Excluded by default**: scripts tagged `utility` (`travel-to`, `bank-items`), because a walk has
  no xp per hour and would sort first from the bottom. A toggle shows them.

**Ruling R15: the stats page is a pure reducer over `api.listRuns(200)` plus a renderer, and it
adds no store, no aggregation job and no persistence.** 200 runs is a small array and the whole
computation is arithmetic. If a player ever wants a longer window, that is a retention change in
`history.ts`, not a new subsystem here. Cost if wrong: with 200 runs of retention, a heavy player
loses the long trend, and the fix is one constant.

---

## 17. Dependencies

"S3" is `2026-09-07-sprint-legends-quest.md`, "DS" is `2026-09-07-sprint-dragon-slayer.md`. Every
row names the tier of section 2 it gates, so the two tables cannot drift.

| Depends on | For | Gates | If it is late |
|---|---|---|---|
| **S3 entry 1, Loadouts** | the `loadout` restock mode and the loadout picker | the `loadout` mode only | Tier 1 ships with `restock: 'off'` and `'bank'`. The select's third option is absent (section 2) |
| **S3 entry 4, route service** | agility, runecraft, Ardougne stalls, spinning, and any bank across a plane | tier 2 | Tier 1 ships; those four scripts wait (section 2) |
| **DS entry 4, shell v2** | the design system the four new controls are added to (4.10), the run card, and the co-pilot bar's five states | **tier 1a, and entry 7's Step row** | The controls have nowhere to live, so entry 6 and entry 7 both ship on the **fallback rendering** of 4.10, which is the existing `paramField` output and needs nothing new. That fallback is the reason this row no longer reads "entry 6 cannot start before it" |
| **DS entry 5, script API reference and the standard** | two things, and only the first is prose. (a) The twelve clauses of section 4, which 6.1 tests the catalogue against. (b) **`web/src/tasks/standard.ts`**, which R17 requires two new `LINTS` rules in and which **does not exist in the tree today**: no such file, and no `LINTS` symbol anywhere under `web/src`. It is P20 of the survey spec, phase `now`, created in DS entry 5's first task per `2026-09-07-script-studio-design.md`'s own words ("`standard.ts` is created by the survey spec's P20, in entry 3's first task, so it exists before this entry starts") | R17's lint half | The catalogue is still written to the same rules and the findings section has no clause numbers to cite. **R17's same-change obligation becomes unsatisfiable, and its answer is written into R17**: the two `ParamField` members land anyway, the two lints are deferred to the entry that creates `standard.ts` and are carried as a named row in entry 6's ledger. Entry 6 does not create `standard.ts` itself and does not block on it |
| **DS entry 7, script API v2 surface** | **P12 only** (no combat without it, 4.7) | tier 1c | **Combat waits.** This is the hardest dependency in the spec and the one to watch |
| **DS entry 11, Battlebots** | the generated-`HELPERS` `--check`, audit C25, which that entry folds in by name ("lands before the task that adds the four library bot scripts") | R6, and therefore every shared helper of section 6 | Sprint 3 opens only when Dragon Slayer closes, so this should already be there. **Entry 6's first task verifies it and lands it if it is missing** (R6), so this row is a saving rather than a blocker |
| **S3 entry 5, quest helper** | nothing. It is a sibling that composes: a quest is a step | none | n/a |

**Two proposals this spec needs are not dependencies, and an earlier draft filed them as if they
were.** **P16** (`bank.ensure`) is phase **`later`** in the standard, not phase-next, so it is not in
DS entry 7's scope at all; entry 6 owns it, after its own generated-`HELPERS` `--check` (4.6, R6).
**P11** (`c.retry`) is phase **`now`**, so it arrives with DS entry 5 rather than entry 7, and no
script in this catalogue blocks on it. What is left on entry 7 is P12, and it is enough to be worth
watching.

Two siblings compose with this spec rather than gating it, and are worth naming so no one builds
them twice. **The quest helper (entry 5)** produces per-quest step routes and a script that can do
them; that script is a library script and a quest is therefore a task-list step, with no new
mechanism on either side. **The recorder** emits into the triple (section 13).

## 18. Placement

Sprint 3 rows 6 and 7, unmoved, in the order the sprint already has them. Nothing renumbers.

Entry 6 is nineteen scripts times four artefacts each (a script module, a `library.test.ts` case, a
`librarySource.test.ts` seed, a live spec) plus the params-model change, four design-system
controls, P12, P16 and the `HELPERS` work; entry 7 is a sequencer, a store, a Firestore rules change
and deploy, a panel section, a run-card change and a stats reducer. Neither is one plan. **The split
below is the recommendation, and it is concrete so that a plan writer inherits it rather than
deriving it.**

**Entry 6, four plans.**

| Plan | Contents | Why here |
|---|---|---|
| **6A. The model** | The generated-`HELPERS` `--check` **first**: verify DS entry 11 landed it, land it if not (R6). Then `StopCondition`, `stops` on the manifest, `stopReached`, the five hops of 4.5, `ParamField.source` and `showIf`, `disposal`, the four controls or their fallback, and the layer-1 last-used store; then the **three** shipped widenings (`chop-and-drop`, `net-fish-and-drop`, `mine-and-drop`, R16/D70), including retiring `untilLevel` and folding `keepLogs` into `disposal` | It proves the model against three scripts that already work and have tests, before nineteen depend on it. `chop-and-drop` is also one of the four smoke specs |
| **6B. Tier 1a** | The eight remaining gathering and production scripts plus `travel-to`, each with its Appendix A row, its harness cases, its seed and its live spec. `fletch-bows` lands here, because it is a smoke spec | The bulk of the catalogue, and every script in it is the same shape as the three 6A proved |
| **6C. Tier 1b** | P16 as `ensure`, `restockOrStop`, the bank loop, `smelt-bars` and `smith-anvil`, `bank-items`, and `restock: 'bank'` across 6A and 6B's scripts. `smelt-bars` is a smoke spec and proves the loop first (4.6) | The highest-risk new mechanism in the catalogue gets its own plan and its own live proof |
| **6D. Tier 1c, and tier 2 if its gates have landed** | `fight-npcs` once P12 has landed, with food, prayer and looting; then agility, runecraft, Ardougne stalls and spinning if S3 entry 4 has landed | Combat is the owner's headline request and the last smoke spec, so it is not buried inside a plan that also ships eight other scripts |

**The four smoke specs are spread across the four plans on purpose** (`chop-and-drop` in 6A,
`fletch-bows` in 6B, `smelt-bars` in 6C, `fight-npcs` in 6D), because R9 makes `verify` depend on
all four: verify goes green on the subset that exists, and gains a spec per plan rather than four at
the end.

**Entry 7, three plans.**

| Plan | Contents |
|---|---|
| **7A. The sequencer and the store** | `taskList.ts`, `taskListStore.ts`, the `TaskList` and `TaskStep` types, the `taskLists` Firestore rule and its deploy, import and export, and the two unit suites of 14.4 |
| **7B. The panel** | `tasksLists.ts` (index, editor, step rows, run controls), the run-card list line (12.2), the co-pilot bar composition (12.3), and `web/e2e/task-list.pw.test.ts` |
| **7C. The stats** | `RunSummary`'s three optional fields, `restart()` round-tripping the stop, `tasksStats.ts` and its renderer (15, 16) |

Entry 7 can be planned and built in parallel with entry 6's 6B, because its seams are all shipped,
and it gets better as the catalogue grows behind it. 7C is the one piece that wants 6A to have
landed, because `RunSummary.stop` is 4.5's field.

---

## 19. Rulings, with the cost if each is wrong

Twenty-three rulings, made by the spec author under D11 and D61 (sprint 3 scope). Seven of them
crossed entries when the spec was first written and were appended to `docs/superpowers/decisions.md`
as D66 to D72, and each of those seven names its id in the table below. **The review revision of
2026-09-07 changed six of the nineteen and added four, so it appends a second block of decisions
amending D66, D68, D69, D70, D71 and D72 and recording P16's owner.** Where an amended decision and
this document differ, this document is the later statement and wins, exactly as the header says.

| # | Ruling | Cost if wrong |
|---|---|---|
| **R1** | No Slayer and no Farming script. Neither has a `skill_*` directory and nothing in `engine/content` calls `stat_advance` for either | None. The alternative is a script for a skill that cannot gain xp. The only risk is a later session re-litigating it, which section 3.3 prevents |
| **R2** | A sourced select is validated as a bounded string, not by membership; an unresolvable value degrades to `nearest` with a traced warning | A typo in an imported list silently fishes in the wrong place instead of refusing. Bounded: the trace names the fallback and the run banner shows which layer answered. Reversible by adding a panel-side resolve check on import |
| **R3** | `StopCondition` is declared data on the manifest and passed in `api.run`'s existing `opts`, not four shared params plus a helper. Its kinds are `forever`, `level`, `count`, `actions`, `durationMs`, `supplies`; the duration field is milliseconds per S8, minutes are presentation only; and `RunSummary` records the chosen stop so `restart()` can start the run the same way | **Five hand-maintained hops, not two** (4.5's table): `types.ts`, `runner.ts`, the Worker `run` message, `startRun`, and `libraryManifests()`'s field-by-field projection, the last of which fails silently. A helper would have avoided the first two and paid the HELPERS transcription instead. If the declarative shape proves too rigid the fallback is still the helper route, one refactor per script. **Cross-entry: D66, as amended** |
| **R4** | One skill per stop condition. Three combat level targets are three steps of a list | A player training three combat stats to 40 builds a three-step list instead of setting three numbers. If that proves annoying, `StopCondition`'s `level` variant grows an array of skills, which is additive and needs no migration because old values are a one-element case |
| **R5** | A named preset is a one-step task list. There is no third storage concept | Players want the word "preset" without the word "list". That is panel copy, not a migration |
| **R6** | The generated-`HELPERS` `--check` (audit C25) must exist before entry 6 writes its first shared helper. **DS entry 11 owns C25 and folds it in by name, and entry 6's first task is to verify it landed and to land it if it did not.** No shared helper is written before then | A bounded build-script change, done once, at the front of the entry where it is cheapest, and usually already done by a sibling that closes before this sprint opens. If it is skipped, three helpers times nineteen seeds is transcribed by hand and the trap that has already cost a session gets nineteen times bigger |
| **R7** | A script the standard cannot express cleanly is a ledger finding with a named form (script, clause, workaround, proposed fix) | An empty findings section that means "nobody looked" is indistinguishable from one that means "the standard held". The form makes the difference visible |
| **R8** | Entry 6 does not grow the atlas with npc kinds | `fight-npcs` and `pickpocket` cannot walk to a target, only to a landmark near one. Measured spawn density (goblin x24 at Lumbridge, barbarian x13 at Barbarian village) says that is enough. If it is not, the fix is a `kinds.ts` change plus a filter plus an npc scan door on `FindDeps`, with 76 KB of atlas budget spare |
| **R9** | The nineteen live catalogue specs run under an `@catalogue` tag, not inside `npm run verify`; verify keeps a four-script smoke subset, tagged `@smoke` | A catalogue script can regress without verify going red. Mitigated by the smoke subset covering all four mechanisms (inventory loop, gathering, bank loop, combat), by spreading the four across the four plans (18), and by `docs/VERIFICATION.md` saying so plainly. **The cost is four changes, not one line**: `grepInvert` in `web/playwright.config.ts`, a `@smoke` grep line in `verify.ps1`, an `e2e:catalogue` script in `web/package.json`, and a per-spec `test.setTimeout` over the config's 120 s default (8.3). **Cross-entry: D72, as amended** |
| **R10** | Shape B, a sequencer above the api, with the step designed to lift into shape C unchanged | The game is let go between steps, so a logout or a death in the gap ends the list (14.3). If that proves unacceptable, C is the migration and the step triple moves with no data change |
| **R11** | A transition is a step, delivered as `travel-to` and `bank-items`, two ordinary library scripts | An extra history row per transition. Mitigated by the `utility` tag and the stats page excluding it by default |
| **R12** | Task lists live at `users/{uid}/taskLists/{listId}` with a new rule, because `tasks/{taskId}`'s rule gates `source in ['user','fork','library']` and forecloses the cheap option | A rules deploy and a new store module. Reversible by moving documents, but the rules change is unavoidable either way, which is what makes this the strictly better of two equal-cost options. **Cross-entry: D67** |
| **R13** | A list run presents as the co-pilot bar's `running` state, including between steps. No new bar state | Between-step gaps read as running when nothing is moving for a second or two. The alternative, `standby`, reads as "nothing is happening", which is worse and would also need a sixth state on a surface this entry does not own |
| **R14** | A recorded session emits a `ScriptSetting` triple, and a step's `scriptId` may be a user script id | If the recorder wants to emit something richer, the triple is the floor and not the ceiling; a richer artefact still reduces to one for the purposes of a step |
| **R15** | The stats page is a pure reducer over `api.listRuns(200)`, with no new store | A heavy player loses the trend past 200 runs. The fix is one retention constant in `history.ts` |

Eight more. The first four read as bookkeeping and are decisions anyway; R16 to R19 are the
remaining cross-entry set, stated as rulings so that all seven of D66 to D72 trace back to a
numbered ruling rather than to a paragraph. **R20 to R23 are the review revision's own**, made where
the first draft had specified a thing two ways or had left an owner-requested capability with no
field to hold it:

| # | Ruling | Cost if wrong |
|---|---|---|
| **R16** | **The three shipped script ids are kept as their scope widens.** `chop-and-drop`, `net-fish-and-drop` and `mine-and-drop` become the woodcutting, fishing and mining AIO scripts under their existing ids | The ids under-describe what the scripts now do ("and-drop" on a script that can bank). The alternative costs every player's per-script toggle (`cs.script.<id>` and its Firestore mirror), every forked document, and the history grouping, all of which key on the id. Display names carry the truth instead. **Cross-entry: D70** |
| **R17** | `ParamField` gains `source` and `showIf`, both data-only. The studio's `LINTS` in `web/src/tasks/standard.ts` gain matching rules (a sourced select with declared options, a `showIf` naming a key that does not exist) **in the same change, when that file exists; when it does not, the two lints are deferred to the entry that creates it and carried as a named row in entry 6's ledger** | `standard.ts` does not exist in the tree today and entry 6 does not create it: it is P20 of the survey spec, made by DS entry 5 (17). Written as an unconditional same-change obligation, R17 was unsatisfiable and an implementer would either stall or invent the file and collide with entry 5. Deferred, the cost is that a bad schema fails at render time rather than at validate time until entry 5 lands, which is exactly today's behaviour. **Cross-entry: D71, as amended** |
| **R18** | **The catalogue ships in tiers and every tier names its real gate.** Tier 1a (eleven skill scripts plus `travel-to`) is gated only on DS entry 4's controls **or the fallback rendering of 4.10**; tier 1b (smithing, `bank-items`, `restock: 'bank'`) on P16, which entry 6 lands itself; tier 1c (combat) on P12, which is DS entry 7's; tier 2 on S3 entries 4 and 1 | If every gate opens on time the split is bookkeeping that cost a table. The earlier version of this ruling said tier 1's gate was "nothing" while three other sections named gates on parts of it, which would have scheduled combat, the owner's headline request, into an ungated wave and discovered the gap in the plan. **Cross-entry: D68, as amended** |
| **R19** | **`RunSummary` gains three optional fields, `listId`, `stepIndex` and `stop`, with no `SCHEMA` bump**, and `restart()` passes `stop` back | Old rows read back with all three absent, which is correct. `withDefaults` fills fields `RunSummary` declares as **required**; these are optional, IndexedDB stores the extra keys with no store change, and a bump to 3 would fire an `onupgradeneeded` that creates nothing while introducing a `blocked` path when a second tab holds the old version open. Without `stop`, "Run again" on a run that stopped at Woodcutting 30 runs forever (4.5). **Cross-entry: D69, as amended** |
| **R20** | **`disposal` is a first-class setting on every gathering and production script** (`drop`, `keep`, `bank`), distinct from `restock`, and `chop-and-drop`'s shipped `keepLogs` retires into it | The survey's most consistently evidenced skilling setting has a name in our model instead of being implied by `restock` and by a `bank` "method" that section 3.2's method columns never declared. `keepLogs` is removed rather than kept, because the Worker validator fails a run on an unknown key and a param the manifest declares but nothing reads is worse than one that is gone. Cost if wrong: a player's stored `keepLogs: true` is ignored once and they set `disposal: 'keep'` instead |
| **R21** | **The stop model obeys S8 and carries an action count.** `durationMs` not `minutes`, `eatBelowPercent` not `eatBelow`, and a `{ kind: 'actions'; n }` variant over the script's own primary action | A catalogue whose 6.1 makes it a test of the standard cannot ship the standard's own S8 example as its stop type. Without `actions`, "kill 50 goblins", "run 20 laps" and "pickpocket 200 times" are inexpressible, which is the owner's "how long" axis on three scripts. Cost if wrong: one more `StopKind` for `stopReached` to implement, and one more word per Appendix A row |
| **R22** | **Combat ships the surveyed "keep prayer on" shape** (`prayer`, `prayerName`) beside the restore threshold (`restorePrayerBelowPoints`), and not the flicking shape | The verbs exist today (`bot.activatePrayer`, `sdk.sendTogglePrayer`, `state.prayers`), the survey recommends this shape by name, and a "complete" field table with no prayer field in it produces a combat script with no prayer support. Cost if wrong: two fields nobody sets, defaulted off |
| **R23** | **The four new form controls have a named fallback rendering** (plain `paramField` output), so tier 1 and entry 7 are not blocked if DS entry 4 slips | R18's promise of a release path is only real if the controls have somewhere to render. The fallback is the panel as it stands, so it costs nothing to specify and nothing to build. Cost if wrong: the fallback ships and the composite controls arrive later, which is a UI polish task with a ledger row rather than a blocked entry |

## 20. What this spec does not do

- **It does not specify a Slayer or Farming script** (R1), because the content has neither.
- **It does not specify a minigame solver.** Wintertodt, Tempoross, GOTR, Blast Furnace and their
  kind are the efficient method in live OSRS and the dominant shape in every catalogue surveyed;
  none exists at rev 274.
- **It does not add a panel or a twelfth icon.** `PanelId` is a persisted contract and the strip is
  fixed at eleven; the list is a section of the Tasks panel (12.1).
- **It does not add a co-pilot bar state** (R13), a slider (4.10, which is D49's work), an atlas
  kind (R8), or a tab strip to the Tasks panel (12.1, which is DS entry 4's surface if it is wanted).
- **It does not specify `cast-spells` for bones to bananas or telekinetic grab**, though the content
  carries both, because the vendored SDK declares no component id for either and no self-cast send
  primitive exists. That is recorded as an R7 finding with a proposed fix (3.3, 6.1), not worked
  around.
- **It does not create `web/src/tasks/standard.ts`.** R17's two lints are deferred to the entry that
  does (17).
- **It does not change the health ladder's nine conditions**, and it does not make `low-hp`
  recoverable by default: P12 makes it recoverable **only when `eatBelowPercent` is set** (4.7).
- **It does not touch `web/src/vendor/rs-sdk/`.** Every gap in `BotActions` named here is closed by
  composing above it, never by patching it.
- **It does not build cross-account sharing.** A list exports and imports as a file the player
  chose, and carries script ids and scalar params, never code (11.2, D24).
- **It does not specify anti-detection, world hopping, proxies or evasion-framed break scheduling**
  (section 7, D10). The server is ours.
- **It does not decide the quest helper's authoring path.** A quest is a step; how a quest's steps
  are authored is sprint 3 entry 5's spec to write.
- **It does not resume a list across a page reload.** `lastRun.finishedStep` is persisted so the
  panel can offer to resume, but nothing runs without the player asking (14.3).

---

## Appendix A. The nineteen scripts, declared

Section 3.2 decides what exists and proves it against the content. **This table is what a per-script
task is written from**, and it exists because an earlier draft specified the params of one script
out of nineteen (`fight-npcs`, 4.9) and would have had eighteen plans each inventing their own
schema.

**The shared set is on every script and is not repeated below**: `method` (4.2), `at` (4.3),
`disposal` (4.2), and `restock` with `restockItems`, `loadout` and `bankAt` (4.6). The "extra
params" column is what a script declares on top of that. **"Action"** is the script's own primary
action, the one a `{ kind: 'actions' }` stop counts and the word the until selector renders (4.5).
`stops.kinds` omits `forever`, which every script offers. `order` continues the shipped spacing
(`tutorial-island` 5, `chop-and-drop` 10, `net-fish-and-drop` 20, `mine-and-drop` 30), so a later
insertion has room.

| id | Extra params | Action | `stops.kinds` beyond `forever` | `requires` | order |
|---|---|---|---|---|---|
| `chop-and-drop` | none | chop | `durationMs`, `level` (Woodcutting), `count`, `actions` | `tool('Axe')` | 10 |
| `net-fish-and-drop` | none (the `method` select **is** the op: Net, Bait, Lure, Cage, Harpoon, 3.4) | catch | `durationMs`, `level` (Fishing), `count`, `actions`, `supplies` (bait, feathers) | `tool` per method; `fishing_bait` or feathers for bait and lure | 20 |
| `mine-and-drop` | none (`method` is the ore, and it is a **cluster preference and not a guarantee**, 3.4) | mine | `durationMs`, `level` (Mining), `count`, `actions` | `tool('Pickaxe')` | 30 |
| `cook-food` | `product` (which raw fish), `on` (`range` or `fire`, select) | cook | `durationMs`, `level` (Cooking), `count`, `actions`, `supplies` | none; `find.nearest('range')` or `('fire')` | 40 |
| `burn-logs` | `line` (a `"x,z,level"` tile to walk away from, 4.3) | burn | `durationMs`, `level` (Firemaking), `actions`, `supplies` | `tool('Tinderbox')` | 50 |
| `fletch-bows` | `product` (bow type), `phase` (`cut`, `string`, `both`) | fletch | `durationMs`, `level` (Fletching), `count`, `actions`, `supplies` | `tool('Knife')`; `bow_string` when stringing | 60 |
| `craft-items` | `product` (the leather item, or `flax`/`wool` for spinning) | craft | `durationMs`, `level` (Crafting), `count`, `actions`, `supplies` | `tool('Needle')` and thread for leather; a spinning wheel for spinning (tier 2) | 70 |
| `smelt-bars` | `product` (the bar) | smelt | `durationMs`, `level` (Smithing), `count`, `actions`, `supplies` | ore and coal per bar; `find.nearest('furnace')` | 80 |
| `smith-anvil` | `product` (the item) | smith | `durationMs`, `level` (Smithing), `count`, `actions`, `supplies` | `tool('Hammer')`, bars; `find.nearest('anvil')` | 90 |
| `fight-npcs` | the full table of 4.9 (`target`, `style`, `spell`, `leash`, `loot`, `lootItems`, `buryBones`, `eatBelowPercent`, `food`, `prayer`, `prayerName`, `restorePrayerBelowPoints`, `balanceStyles`) | kill | `durationMs`, `level` (Attack by default, R4), `count`, `actions`, `supplies` | none declared; the food and runes are `HealthPolicy.consumes` | 100 |
| `cast-spells` | `spell` (low alchemy, superheat, high alchemy), `item` (what to cast it on) | cast | `durationMs`, `level` (Magic), `count`, `actions`, `supplies` (runes) | the runes each spell needs | 110 |
| `bury-bones` | `product` (which bone), `where` (`bury` or `altar`) | bury | `durationMs`, `level` (Prayer), `actions`, `supplies` (bones) | `find.nearest('altar')` for the altar method | 120 |
| `pickpocket` | `target` (the npc tier) | pickpocket | `durationMs`, `level` (Thieving), `count`, `actions` | none. Failures count as actions, which is the point of the variant | 130 |
| `steal-stall` | `target` (the stall) | steal | `durationMs`, `level` (Thieving), `count`, `actions` | none. **Tier 2** | 140 |
| `mix-potions` | `product` (the potion), `phase` (`identify`, `mix`, `both`) | mix | `durationMs`, `level` (Herblore), `count`, `actions`, `supplies` | vials, herbs, secondaries | 150 |
| `craft-runes` | `product` (the rune) | craft | `durationMs`, `level` (Runecraft), `count`, `actions`, `supplies` (essence) | a talisman per altar. **Tier 2** | 160 |
| `run-agility` | none (one course) | lap | `durationMs`, `level` (Agility), `actions` | none. **Tier 2**, and the script with **no item at all**, which is why `actions` exists | 170 |
| `travel-to` | `to` (a `source: 'landmark'` select, or a `"x,z,level"` tile). **No `method`**, and 8.4 item 2 records the reason: it trains nothing | n/a | none. It ends `done` on arrival and `failed` with `unreachable` otherwise, from its own task | none. Tagged `['utility']` (10.3, 16) | 900 |
| `bank-items` | `deposit` (`all`, `all but tools`, a named list), `withdraw` (a named list). **No `method`**, same reason | n/a | none. It ends `done` when the bank interface closes | `find.nearest('bank')` or `bankAt`. Tagged `['utility']` | 910 |

Three notes the gate of 8.4 checks against this table:

1. **Every row declares `stops.kinds`**, the two utilities included, and every kind named is one
   `stopReached` implements. The utilities declare `['forever']` because their end is an arrival and
   not a threshold; a step in a list that never ends would be a bug, and it is not one here because
   both end from their own task.
2. **`count` is absent from four rows** (`burn-logs`, `bury-bones`, `run-agility`, and the two
   utilities): a script that consumes rather than produces has no item gained during the run to
   count. Those are exactly the rows where `actions` does the work.
3. **`supplies` is on every row whose loop consumes something**, and it is the stop that makes
   `restock: 'off'` a coherent mode rather than a crash (4.6).
