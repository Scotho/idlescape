# Time candy - a recorded hour of experience, sealed into a bearer token

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two custom items and the owner-scoped ledger behind them: a blank **time candy** that drops from medium and hard clue caskets and records the next wall-clock hour of one character's experience, and a **time candy (full)** that seals out of that hour into the owner bank and, when eaten on any of the owner's characters, replays the hour skill for skill through the engine's own `Player.addXp`.

**Architecture:** Three layers, in dependency order. (1) **Content**, in `content-custom/`: two obj configs and one single-slot inv, three hand-appended pack id lines, and four RuneScript replacements (the two clue reward tables, `death.rs2` and `alchemy.rs2`). (2) **The ledger**, in `engine-custom/src/idlescape/`: a pure arithmetic module, an atomic per-owner JSON store beside the owner bank, and a store class that seals lazily and credits the sealed candy to the owner bank through the server-internal `delta` op. (3) **The engine seams**: one whole-file replacement of `OpHeldHandler.ts` whose diff from upstream is a single intercept call, a `Player.prototype.addXp` wrapper installed alongside the overlay's three existing prototype patches, and one read-only management route so a Playwright spec and an operator can see a ledger without popping a row from it.

**Tech Stack:** RuneScript, `.obj` and `.inv` config under `content-custom/`, packed by `engine-custom/tools/pack/BuildOverlay.ts`; TypeScript engine overlay under `engine-custom/src/idlescape/`, tested with `npx tsx --test --test-force-exit` from `engine/server`; Fastify for the one management route; Playwright from `web/` against the live stack.

**Spec:** `docs/superpowers/specs/2026-09-06-time-candy-design.md` in full (11 sections). Sprint order and scope: `docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md` entry 10 and section 3 (the shared pack id table). Decision `D8` in `docs/superpowers/decisions.md` hands this plan two author's calls to rule; rulings R1 and R2 below rule them, and the planner appended them to `decisions.md` as D120 and D121 along with R3, R5, R7, R14 and R15.

**Surveys this plan is built on** (read-only, in `.superpowers/sdd/2026-09-08-time-candy-plan/`, not committed): `map-spec.md` (the design's section 2 facts re-checked one row each against the 274 pin, plus nine corrections), `map-overlay.md` (the content and pack seams, and what entry 3 lands underneath), `map-store.md` (the owner bank as the model store, the flush cadence, the redemption path). Every finding they raise is either a ruling below or a task step, and their file-and-line citations are reproduced inside the tasks, so this plan stands alone in a fresh clone.

## Global Constraints

- **This plan executes after sprint entry 3 has landed**, and after entries 4 to 9 in sprint order. Entry 3 (`docs/superpowers/plans/2026-09-07-overlay-pack-and-client-fork-gates.md`) is what makes the pack ids enforceable rather than aspirational: its Task 1 pins `content-custom/pack/{obj,inv,loc}.pack`, its Task 2 adds `engine-custom/src/idlescape/packIds.ts`, its Task 3 puts the id check on both `packAll` paths, its Task 4 rewrites `scripts/content-overlay.ps1 -Check` and runs it from the gate, and its Tasks 7 and 8 replace the `sh` grep fences in both `PATCHES.md` files with a typed row grammar run by `scripts/patches-check.ps1`. This plan cites entry 3's **plan by task**, never a line number inside a file entry 3 is rewriting.
- **Strict TypeScript, no new `as any`. Files under 400 lines, test files included**, enforced by `scripts/line-ceiling.ps1` (verify step 1). `engine-custom/src/idlescape/install.ts` is **302 lines** and `ownerBank.ts` is **394**: neither may absorb this entry's logic. `content-custom/**` is outside the ceiling's include list, so the content half is unbounded.
- **`engine/server` and `engine/content` are never edited.** Everything content-side lands in `content-custom/`, applied by `powershell -File scripts/content-overlay.ps1`; everything engine-side lands in `engine-custom/`, applied by `powershell -File scripts/engine-overlay.ps1`. Every file either overlay contributes needs a `manifest.json` entry, and entry 3 makes a manifest path that git does not track a gate failure in **both** manifests. `live/` is never read, edited or referenced.
- **Pack ids are pinned by name in the sprint spec's section 3.** This entry appends exactly three lines: `obj` 3894 `time_candy`, `obj` 3895 `time_candy_filled`, `inv` 219 `time_candy_keep`. No id already in that table moves, and `inv` 217 and 218 belong to entry 11 and are left as a gap (ruling R4).
- **No client patch is expected and none is added.** `client/PATCHES.md` numbering stays at 28. The two objs reuse `inv_chocolate` with a recolour, so the client sees a config-only cache change; `BuildOverlay.ts` records that the client validates against the CRC table the server advertises rather than the 2004 one. Entry 3's patch runner asserts coverage over that table, so this is stated rather than left to silence.
- **Conventional commits, no em dashes in new prose** (source comments, docs, RuneScript comments, in-game copy). Hyphens or commas.
- **Windows PowerShell 5.1 only** in any `.ps1`: no `&&`, no ternary, no `??`, no here-string continuation. `pwsh` is not installed; the working invocation is `powershell -File scripts/content-overlay.ps1`.
- **Explicit `git add <paths>`, never `git add -A`.** Commit with `git -c core.safecrlf=false commit`. Every commit ends with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577
  ```
- **`localStorage` keys keep the `cs.` prefix and their exact names**; panel ids in `web/src/types.ts` are a persisted data contract. This entry renames none of either and adds no web panel.
- **The release stays owner-gated (board gate G5).** Nothing in this plan deploys. Task 9 records the one compose line the deployment will need and does not touch a running box.
- **The stack, when a task needs it:** Firebase emulators on 9099 (auth) and 8080 (firestore), engine on 8899 with management on 8897, front server on 8787 serving `web/dist-e2e`. Bring it up with `scripts/start-stack.ps1 -Prod` from **PowerShell `Start-Process`**, never from a bash subshell (`docs/OPERATIONS.md`); ready in about two minutes. Playwright runs from `web/` after `npm run build:e2e`, never after a plain `npm run build`.
- **Engine suites run from `engine/server`, with relative paths**, because an absolute path makes node evaluate the engine's circular module graph twice and every suite that imports `install.js` dies at load (`scripts/verify.ps1` explains it in place). `install.js` must be the first import of any suite that touches `World` or `Player`, out of alphabetical order.
- **After any content change, applying the overlay is not packing it.** From the repository root:
  ```
  powershell -File scripts/content-overlay.ps1
  cd engine\server
  npx tsx tools/pack/BuildOverlay.ts
  ```
  then restart the engine. **`npm run verify` never packs**: only `scripts/setup.ps1` runs `BuildOverlay.ts`, and `engine-custom/src/app.ts` packs only on a cold cache. A green gate proves the tracked `.pack` files match the pin and the clone matches the tracked files; it proves nothing about whether the append packs. Every task below that names an obj by name repacks first. The first pack after a content change takes about seven minutes.

---

## What already shipped, verified in the code at HEAD

Read this before Task 1. Every task assumes it and none of it is rebuilt.

- **`Player.addXp(stat, xp, allowMulti = true)` is the single choke point for experience**, at `engine/server/src/engine/entity/Player.ts:1819`. It throws on a negative `xp` (`:1820-1823`), returns silently on `xp == 0` (`:1825-1827`), computes `const multi = allowMulti ? Environment.node.xpRate : 1` and does `this.stats[stat] += xp * multi` (`:1830-1831`), clamps to `2_000_000_000` (`:1834-1836`), then does its own level-up handling and session logging (`:1838` onward). Its only callers outside the file are `PlayerOps.ts:816` (the RuneScript `STAT_ADVANCE`, `allowMulti` defaulted true) and `ClientCheatHandler.ts:483`, which is **`::advancestat`** and passes `allowMulti: false`.
- **Only one cheat reaches `addXp`, and it is the one the accrual patch is designed to ignore.** `::advancestat <skill> <level>` is `ClientCheatHandler.ts:466-483`: it zeroes the stat and calls `player.addXp(stat, getExpByLevel(...), false)`. There is no `::setlevel`; the level-setting cheat is `::setstat` (`:455-466`), which calls `player.setLevel` and never touches `addXp` at all. The cheat that DOES record is a content debugproc: `[debugproc,addxp](stat $stat, int $amount)` at `engine/content/scripts/_test/scripts/cheats/cheat_other.rs2:54-61` ends in `stat_advance($stat, calc($amount * 10))`, which is `PlayerOps.ts:816` with `allowMulti` defaulted true. So a test or a spec that wants an experience grant recorded types `::~addxp woodcutting 500`, never `::advancestat`. `[debugproc,maxme]` (`cheat_maxme.rs2`) is a list of `stat_advance` calls and reaches the same place.
- **`Player.stats` is an `Int32Array`** (`Player.ts:297`), so `stats[stat] += xp * multi` truncates on store, and at the 200m cap it absorbs part of the grant. This is why ruling R6 records the observed before-and-after delta rather than recomputing `xp * xpRate`.
- **`PlayerStatNameMap` and `PlayerStatEnabled` live in `engine/server/src/engine/entity/PlayerStat.ts`** (`:49` and `:53`). `PlayerStatEnabled` has **21 entries**, which is the stat count this entry validates against.
- **Held-item ops dispatch through `ScriptProvider.getByTrigger(OPHELD1 + op - 1, obj.id, obj.category)`**, the last thing `OpHeldHandler.handle` does (`engine/server/src/network/game/client/handler/OpHeldHandler.ts:65-70`, 75 lines total). Everything before it is validation: `player.delayed` (`:16`), the component is operable and visible (`:21-28`), the inventory is transmitted (`:30-35`), `inv.validSlot(slot)` and `inv.hasAt(slot, objId)` (`:37-43`), and `obj.iop[message.op - 1] === null` (`:45-49`).
- **Op 5 (Drop) really does reach that dispatch.** `ObjType`'s `iop` default is `[null, null, null, null, 'Drop']` (`engine/server/src/cache/config/ObjType.ts:150`), so the `iop` refusal at `OpHeldHandler.ts:46` does **not** already cover op 5, and `player/scripts/drop.rs2:1`'s `[opheld5,_]` calls `~dropslot`. The refusal in Task 5 is necessary, not belt and braces.
- **A members obj on an f2p world loses its `iop` array, its `tradeable` and its `category`.** `ObjType.ts:59-68` is `if (!Environment.node.members && config.members)`, and it forces `config.tradeable = false`, rewrites `config.iop` back to Drop-only (which would erase `Eat` and `Check`), and sets `config.category = -1`. Neither candy obj sets `members=`, and `ObjType.ts:148` defaults `members = false`, so both are safe today. It is recorded here and in the obj config's comment because adding `members=yes` later would silently invert Task 5's `tradeable` case and take the whole Eat and Check path with it.
- **Alchemy is `opheldt`, not `opheldu`.** `engine/content/scripts/skill_magic/scripts/spells/alchemy.rs2:1-2` registers `[opheldt,magic:highlvl_alchemy]` and `[opheldt,magic:lowlvl_alchemy]`, dispatched by `OpHeldTHandler.ts:61`. `OpHeldU` is item-on-item and refuses a cast outright when `comId !== useComId` (`OpHeldUHandler.ts:21-24`). See ruling R3.
- **`~is_alchable` already refuses items by name.** `alchemy.rs2:71-96` is a `switch_obj($item)` with `case thanainabarrel`, `case coins` and `case macro_cube` arms that print a message and `return(false)`. Both alchemy spells funnel through it, and the other six `opheldt` triggers in the tree (`enchant_lvl1` to `enchant_lvl5`, `superheat_item`) test the item before touching it.
- **`tradeable=no` closes five exits for one config line.** `oc_tradeable` gates trade (`interface_trade/scripts/trade.rs2:338`), duel staking (`game_duelarena/scripts/duel_arena.rs2:313`), the party room chest (`game_partyroom/scripts/partyroom_chest.rs2:51`), shop selling (`shop/scripts/shop.rs2:28`) and putting an item on a table (`general_use/scripts/tables.rs2:2`). Example in the tree: `areas/area_mage_arena/configs/mage_arena.obj:34`.
- **Three more exits are closed by absence.** There is no generic `[opheldu,_]` in the content tree, so item-on-item cannot reach an obj with no trigger; the obj has no `certlink`, so `oc_cert` has nothing to note it into; and `engine/server/src/engine/zone/Zone.ts:333-334` keeps an untradeable ground obj private to the dropper even if one ever reached the ground.
- **There is no Destroy confirmation anywhere in this content tree.** Grepping `*.rs2` for `destroy` finds only the `destroy_drop` and `destroy_death` params and unrelated prose; items carrying those params override `[opheld5,_]` with their own script (`area_mage_arena/scripts/god_gear.rs2:26-35`). The design's sentence "op 5 is also the route to the Destroy confirmation" is half wrong; refusing op 5 still closes drop, which is the exit that matters.
- **`death.rs2` is 203 lines and matches the design.** `[proc,player_death_lose_items]` is `:47-101` with the staff return at `:48`, `inv_clear(deathkeep)` at `:54`, the four `~move_priciest_item_on_hero_to_death` calls at `:59-64`, the two `destroy_drop`/`destroy_death` delete sweeps at `:67-95`, `inv_dropall(inv, ...)` at `:97` and `worn` at `:98`, then `~moveallinv(deathkeep, inv)` at `:100` and `inv_clear(deathkeep)` at `:101`. `[proc,pvp_death_lose_items]` is `:103-158` with the same staff return at `:105` and `both_dropslot` at `:134` and `:151`. The design's `:47-102` and `:103-160` are off by one and two.
- **`~moveallinv(inv $src, inv $dest)` is `interface_trade/scripts/trade.rs2:1-10`**, a `while` loop calling `inv_moveitem($src, $dest, $obj, inv_total($src, $obj))`.
- **`inv_moveitem` throws when the count is 0.** `InvOps.ts:496-516` runs `check(count, ObjStackValid)` at `:502`, `ObjStackValid` is `new ScriptInputRangeValidator(1, Inventory.STACK_LIMIT, 'ObjStack')` (`ScriptValidators.ts:122`), and `check` calls `validator.validate(input)` (`:142-144`), which throws out of range. The `completed == 0` early return at `:513-516` is **after** that check. An unguarded `inv_moveitem(inv, time_candy_keep, time_candy_filled, inv_total(inv, time_candy_filled))` therefore throws on every death by a player holding no candy, which is nearly every death in the world's history. See ruling R9.
- **The owner bank is the model store.** `engine-custom/src/idlescape/types.ts:14-19` is `OwnerBankFile`; `ownerBankFile.ts` holds `readBankFile` (`:34`, re-validating every field), `quarantinePath` (`:59`), `slotsOf` (`:69`) and `writeBankFile` (`:86`, `<target>.tmp` then `fs.renameSync`, with `fs` used through the module namespace so a test can mock it); `ownerBank.ts` holds the store, with `apply` at `:198` and `ApplyOutcome` at `:38`. `OWNER_KEY_RE` is `/^[A-Za-z0-9_-]{1,64}$/` (`ownerBank.ts:23`, `owner.ts:10`) and `assertKey` (`:90`) runs before any path is built, because the key becomes a filename.
- **`apply(ownerKey, expectedVersion, ops)` with `expectedVersion: null` skips the concurrency check**, and a `{ op: 'delta', obj, count: 1 }` is exactly the server-internal credit this entry needs. It writes the file inline (`ownerBank.ts:225`) and sets `appliedExternally` so the next sweep does not bump the same change twice. Its three relevant outcomes are `{ ok: true, version }`, `{ ok: false, reason: 'full' }` (the scratch `Inventory.add` did not fit) and `{ ok: false, reason: 'unavailable' }` (the owner's file could not be quarantined, so writes are suspended for the life of the process).
- **The flush cadence has three call sites, and only two of them go through `flushBanks()`.** `flushBanks()` is `install.ts:150-156`. It is called from the shutdown flush inside `beforeCycle` (`:166-170`, because `World.processShutdown()` calls `process.exit(0)` from inside `cycle()` and never reaches `afterCycle`) and from `process.on('exit', flushBanks)` (`:297`). The third, the 100-tick sweep, is **`banks.flush();` at `install.ts:241`** and calls the store directly. Task 4 Step 9 routes that site through `flushBanks()` as well; without that edit the periodic flush would never touch the candy store and ruling R8's "at most sixty seconds" would be "at most a whole hour". **`flushBanks` is removed from the `exit` listeners by name** in `shared.test.ts:51` and `installSweep.test.ts:44`, so a second unnamed exit handler would re-create a scratch directory on the way out. Ruling R8 widens the existing function rather than adding one.
- **`afterCycle` already walks every online player once per tick and builds `online: Map<ownerKey, Player[]>`** (`install.ts:196-219`), and it already has a `World.currentTick % 100` branch (`:240-242`) and a `World.currentTick % 1500` branch (`:244-246`) whose `banks.evict(key => online.has(key))` is the offline set. `OwnerBankStore.loaded(): string[]` (`ownerBank.ts:373`) answers the loaded owner keys. Ruling R14 hangs the seal sweep and the invariant audit on those two existing branches rather than adding a walk.
- **`install.ts` already patches three prototypes** and is the module that must root the engine's circular graph (its own header, `:1-18`): Patch 1 wraps `Player.prototype.getInventory` (`:265-273`), Patch 2 wraps `World.cycle` (`:280-290`), Patch 3 registers the exit handler (`:297`).
- **`idlescapeConfig` reads env first, then `data/config/idlescape.json`, then defaults** (`config.ts`), and `config.test.ts:84` asserts by regex that `engine-custom/.env.example` documents **every** `env.NAME` `config.ts` reads. A new variable is three edits: `config.ts`, `.env.example`, and the compose file.
- **`registerOwnerBankRoutes` is the management surface** (`management.ts:90-154`): a constant-time `authorised()` check on `x-idlescape-mgmt` (`:38`), an `OWNER_KEY_RE` guard before the store is touched, and `GET /owner/health` (`:148-153`) as the shape to copy for a route that must not cache an entry.
- **`content-custom/manifest.json` already carries entry 3's shape**: a top-level `base` sha of the content clone plus `files` rows of `{ path, kind, baseSha256 }`, with `pack/obj.pack`, `pack/inv.pack`, `pack/loc.pack` and `pack/varp.pack` as `replace` rows and `scripts/interface_bank/configs/banktab.varp` as a `new` row.
- **`inv_chocolate` is a single-colour model.** Decoding `engine/content/models/inv/inv_chocolate.ob2` (47 points, 80 faces, no textures) gives exactly one face colour for all 80 faces: HSL16 **3738** (H=3, S=5, L=26, a dark brown). Obj `recol` values are written in **RGB555** and converted by the packer (`engine/server/tools/pack/config/ObjConfig.ts:449-455` calls `ColorConversion.rgb15toHsl16` when either half is `>= 100`), and exactly one RGB555 value maps to 3738: **11426**. That is the only correct `recol1s` for this model. Task 1 uses two destinations already in the tree: `13325` (the muted purple of `[wolfenboots_purple]`, `areas/area_canifis/configs/canifis.obj:433`) for the blank, and `19487` (the purple partyhat's brighter purple, `general_use/configs/holiday.obj:114`) for the full candy.
- **`trail_rewardinv` is `scope=temp`, `size=9`, `stackall=yes`** (`player/configs/player.inv:12-15`), and `deathkeep` at `:21-22` is `size=4` and fully spoken for by the three priciest items plus Protect Item.
- **Playwright already has every seam but two.** `web/e2e/helpers.ts:234` is the management base url, `:237` the secret, `:250` `managementContext()`, `:277` `readBank(page, idToken)` through `/api/bank`; `web/e2e/harness.ts:18` dispatches `::` cheats through `window.idlescape.tasks.dispatch({ type: 'say' })` and `leaveTutorial` at `:29-56` explains why a fresh character must be taken off Tutorial Island before `::give` is visible at all. The two missing seams are a read of the ledger and a way not to wait an hour; rulings R7 and R11 add both.

## What this entry does not build

Named so a reader does not go looking. **No web surface for candies**: they appear in the SP8b bank as an ordinary item and nothing more, and there is no browser view of a recording in progress beyond the management route in Task 8, which is loopback-only and not proxied by the front server. **No Contracts or market integration** beyond blank candies being ordinarily tradeable. **No self-healing reconciliation**: the invariant is checked and logged where it is genuinely checkable and never corrected, for the reason the design gives (trimming `filled` to an observed count would delete a candy sitting safely in an offline character's pack). **No new `category=` or `param=` name** on either obj, and **no new RuneScript trigger name**, because `category.pack`, `param.pack` and `script.pack` are not pinned in `content-custom/pack/` and `BuildOverlay.ts` runs with `Environment.build.verify = false`, so an unknown name auto-registers at `pack.max++`, rewrites the clone's pack and makes the guard exit 1 naming a file nobody has a tracked copy of. That is why every behaviour is TypeScript-side.

---

## Plan rulings

Each is a decision this plan makes because the spec is wrong, silent, or impossible at revision 274. Each says what it costs if it is wrong. **R1, R2, R3, R5, R7, R14 and R15 are in `docs/superpowers/decisions.md`** as D120 to D124 and D125 to D126, because they settle D8, amend an approved spec, or change a shared gate script; the planner appended them, and Task 9 Step 8 lists them by id.

### R1. The medium drop rate stays 1/50, and it is a measurement, not a guess (D8a, decisions D120)

The design's 1/50 is invented, because no purple sweet or candy exists anywhere in the 274 content tree and the owner's "same rate as purple candy" has no local anchor. The arithmetic on both sides, checked:

- **Hard** is `(44/45) x (1/22) = 4.4444%` per roll. Over the 4, 5 and 6 rolls a hard casket makes, at least one candy is 16.63%, 20.34% and 23.87%; averaged over the uniform roll count that is **20.28% per casket**, expected yield **0.2222**. Both of the design's numbers reproduce exactly.
- **Medium** at 1/50 is 2.00% flat, expected yield 0.02. Stated as caskets that is **50 medium caskets per candy against 4.5 hard**, an 11.1x tier jump rather than the "felt" one the design describes.
- **In kills**, at this world's own clue rates: `~trail_mediumcluedrop($rarity, ...)` and `~trail_hardcluedrop($rarity, ...)` (`minigames/game_trail/scripts/trail_clue_drop.rs2:43` and `:58`) are called with `$rarity = 128` at eight of ten medium sources and eight of nine hard ones (129 on `jogre`, 138 on `tribesman`, and **64 on `hellhound`**). So one medium candy costs roughly **6,400 kills** plus 50 full medium trails, against about **630 kills** plus 4.5 hard trails.

**Ruling: ship 1/50 and measure.** Three reasons. It is the only lever this entry has that is tunable alone, without touching either existing reward table. A candy is a permanent 2x on an hour of play and blanks are tradeable, so the sink for blanks is the market and a generous medium rate floods it. And the cost of being wrong is the smallest cost in this plan: one integer in one `if (random(50) = 0)` block in one overlay file, plus a repack. It changes no id, no save data and no ledger row.

**Cost if wrong:** medium clue players see a candy roughly never, and the item reads as hard-clue-only. The correction is a one-line content edit and a seven-minute repack, and the number to correct it to is recorded here: 1/12 gives 0.083 per casket and a 2.7x gap to hard rather than 11x. Two multipliers make the live number worse than the arithmetic and should be watched before retuning: `trail_clue_drop.rs2` returns early when `map_members = ^false`, so f2p ground never drops clues, and it returns early when `~trail_hasclue_all = true`, which (`trail_clue_helper.rs2:1-9`) checks `inv` **and `bank`** - and `bank` is inv 95, which SP8 diverted to the shared owner container, so one clue scroll or casket anywhere in an account blocks clue drops for every one of that owner's characters at once.

### R2. A 0 XP hour still seals into a candy (D8b, decisions D121)

**Ruling: keep it, exactly as the design says.** The evidence is one-sided. What it costs is one junk item per empty hour, one bank slot until it is eaten, and one `filled` row; the eat path already handles it, because `addXp` returns silently on `xp == 0` (`Player.ts:1825-1827`), so a 0 XP candy grants nothing and prints its summary. What it protects is every assertion in the invariant: without it, `filled.length` and the item count diverge for exactly the recordings that produced nothing, and the conservation assertion gains a branch nobody exercises deliberately. The alternative also punches a hole in the design's own ruling 3: if an empty hour left no trace, logging out through the hour would cost you nothing, and "the hour cannot be cancelled" would have an exception.

**Cost if wrong:** a player who let an hour run empty holds a worthless stacking item they must eat to be rid of. Reversing it means adding a suppress-and-do-not-credit branch to `sealExpired` plus a second exit path out of `filled` that no `Eat` covers, so it is the more expensive direction. That asymmetry is the ruling.

### R3. The alchemy exit is `~is_alchable` in content, and `OpHeldUHandler.ts` comes off the replacement list (decisions D122)

The design's section 6 and section 9 both name `src/network/game/client/handler/OpHeldUHandler.ts` as the alchemy exit, "which is how High and Low Alchemy reach a held item". **It is not.** `OpHeldU` is item-on-item; the spell-on-item path is `OpHeldT`, and `alchemy.rs2:1-2` registers both alchemy spells there. Patching `OpHeldU` as specified would leave the alch route wide open, which is a direct hole in the ledger invariant: alching a full candy would destroy the item and orphan its row.

**Ruling: close it in content, with one `case` in `~is_alchable`,** following that proc's own precedent (`thanainabarrel`, `coins`, `macro_cube` are already refused there by name). It covers both alchemy spells, which are the only two of the eight `opheldt` triggers that accept an arbitrary item. `OpHeldUHandler.ts` is not replaced, and `OpHeldTHandler.ts` is not replaced either: replacing a handler would add a whole upstream file to re-merge at every revision bump in exchange for closing a route no content op can reach.

**Cost if wrong:** if a future content entry adds a generic `[opheldu,_]` or an `opheldt` trigger that consumes an arbitrary item, the candy is reachable again. The mitigation is written into Task 5's test: a case asserts that the tree contains no generic `[opheldu,_]`, so the day one appears the suite goes red rather than the ledger going quiet. This ruling amends an approved spec, which is why it is in `decisions.md`.

### R4. The 217 and 218 gap in `inv.pack` is left open, not filled

If this entry lands before entry 11, `inv.pack` runs `...216`, then `219`. Checked three ways. `PackFile.load` reads into a `Map<number, string>` and never requires density; `refreshNames` sets `max = Math.max(keys) + 1`. `packInvConfigs` (`engine/server/tools/pack/config/InvConfig.ts:94-193`) loops `id` from 0 to `InvPack.max`, looks up `InvPack.getById(id)` (which answers `''` for a hole), skips the config body, and calls `client.next(); server.next();` **unconditionally outside** the `if (config)`, so a hole emits an empty record and shifts nothing. And entry 3's `checkPack` asserts density only over the upstream prefix `0..UPSTREAM_TAIL.id`, which for `inv` is `0..216`.

**Ruling: append `219=time_candy_keep` and leave 217 and 218 empty.** Writing them to keep the file dense would be taking entry 11's ids, which the sprint's section 3 forbids by name.

**Cost if wrong:** none identified. If a later pack tool is added that does require density, the fix is entry 11 landing, which fills the gap.

### R5. `OpHeldHandler.ts` is replaced whole; nothing else in the engine is (decisions D123)

The intercept has to sit **after** the handler's validation (`delayed`, component operable and visible, the inventory is transmitted, `validSlot`, `hasAt`, `iop`) and **before** the `getByTrigger` dispatch, because op 5 has a catch-all `[opheld5,_]` trigger that would drop the candy. A `Player.prototype`-style wrapper can only run before or after the whole method, so it would have to either skip the validation (a spoofed slot or obj would then reach the ledger) or let the drop happen first. Neither is acceptable.

**Ruling: replace `src/network/game/client/handler/OpHeldHandler.ts`** (75 lines, upstream blob `3dfc3d38f59524b9891681e0165782a0b96a0c1f63f4e6054e43c4857975f3fb`) with a copy whose only change from upstream is a four-line intercept inserted between `:63` and `:65`. Every candy behaviour lives in `engine-custom/src/idlescape/candyOps.ts`, so the replacement's diff stays a call site and re-merging it at the next revision bump is a two-minute job. The `addXp` capture stays a runtime prototype patch, because `Player.ts` is an **anchor** in the engine manifest and has never been replaced.

**Cost if wrong:** one more upstream file to re-merge at the next revision bump, on top of the five already replaced. The alternative cost, a validation gap in the one packet that pops ledger rows, is not comparable.

### R6. The accrual records the observed `stats[stat]` delta, not `xp * xpRate` (decisions: none, it corrects a pseudocode line)

The design's section 5 pseudocode is `xp[stat] += xp * xpRate`, and its prose promises the recorded amounts "match exactly what `addXp` added to `stats[stat]`". Those two are not the same thing. `Player.stats` is an `Int32Array`, so `this.stats[stat] += xp * multi` truncates on store; at the 200m cap the stat absorbs only part of the grant; and `xpRate` can be fractional in practice. That last one is true for a subtler reason than "the file is returned verbatim", and the reason is worth writing down because the obvious reading says the opposite: `loadWorldConfig` (`WorldConfig.ts:293-306`) returns `normalizeWorldConfig(parsed)`, which runs `mergeConfig` (`:151-176`), which puts every numeric key through `tryParseInt`. But `tryParseInt` (`util/TryParse.ts:11-14`) returns a value that is **already** `typeof 'number'` unchanged, despite its name, so a JSON `1.5` reaches `Environment.node.xpRate` as `1.5`.

**Ruling: read `player.stats[stat]` before and after delegating to the original `addXp`, and record the difference.** It is correct under truncation, correct at the cap, correct under a fractional rate, and it stays correct if upstream changes `addXp` again.

**Cost if wrong:** at the cap a player would be credited experience the engine refused to give them, and the replay would then refuse it a second time, which is harmless but makes the `Check` breakdown a lie. The delta reading costs two array reads per grant.

### R7. `candyHourMs` and `candyDir` are ordinary configuration, not a debug flag (decisions D124)

The hour is wall clock and deliberately uncancellable (design ruling 3). Nothing in the design makes 3,600,000 ms configurable, and no Playwright spec can wait an hour, so as the design stands the entry ships with **no browser-level proof at all** and its own section 10 "integration" testing is engine-suite-only.

**Ruling: `IdlescapeConfig` gains `candyDir` (`IDLESCAPE_CANDY_DIR`, default `data/candies`) and `candyHourMs` (`IDLESCAPE_CANDY_HOUR_MS`, default `3_600_000`), read exactly the way `bankDir` is.** `candyHourMs` is clamped to a floor of 1000 ms and the resolved value is printed at install time, following the house style at `config.ts:99-101`, which refuses a bad production value loudly rather than silently guarding on `Environment.node.production`. Both variables get a `.env.example` row, which `config.test.ts:84` requires.

**Cost if wrong:** an operator can shorten the hour on a live world, which devalues the item. The mitigation is that the resolved value is printed on every start, so a wrong value is visible in the first ten lines of the engine log rather than discovered from player behaviour. The alternative, a hardcoded hour, costs the entry its only end-to-end proof.

### R8. The candy store rides the bank's flush, inside `flushBanks`, and writes synchronously at the invariant's two boundaries

The bank flushes every 100 ticks, about 60 seconds. Decision D115 records that both stop paths went straight to `taskkill /T /F`, so the flush never ran on a stop, and entry 3's ruling R16 fixes the escalation. A crash or a `/F` still costs the window, and for a candy that window is experience the player earned and cannot re-earn, where a lost bank write is usually re-derivable from the `.sav`.

**Ruling:** accrual is in-memory with a dirty flag, flushed from the same three call sites by widening `flushBanks()` to flush both stores (rather than registering a fourth exit handler, which `shared.test.ts:51` and `installSweep.test.ts:44` would fail to remove by name); and **a seal and a redeem each write the ledger file synchronously**, before the bank credit and before the XP grant respectively. The accepted residue is recorded: a hard kill loses at most the accrual since the last 100-tick flush.

**One of those three sites is not wired to `flushBanks()` today and must be.** `install.ts:241` is `banks.flush();`, the store called directly, so widening `flushBanks()` alone would reach only the shutdown flush and the `exit` handler. Accrual would then hit disk on a seal, a `Record`, a redeem or a clean stop and on nothing else, and decision D115 records that both stop paths went straight to `taskkill /T /F`. The residue would be the whole recording, not sixty seconds of it, which is the exact loss this ruling opens by calling worse than a bank loss. Task 4 Step 9 therefore changes that line to `flushBanks()` (idempotent: the bank flush is what it already does), and Task 8's integration suite asserts the accrual reaches disk on a tick divisible by 100 with no explicit `flushBanks()` call.

**Cost if wrong:** up to 60 seconds of one character's accrual on a hard kill. Making accrual synchronous instead would put an `fs.writeFileSync` inside `addXp`, which fires several times a second per player.

### R9. The death insertion is guarded, because an unguarded one throws on nearly every death

`inv_moveitem`'s handler runs `check(count, ObjStackValid)` **before** its `completed == 0` early return, and `ObjStackValid` is a 1-to-`STACK_LIMIT` range validator that throws out of range. The design's `inv_moveitem(inv, time_candy_keep, time_candy_filled, inv_total(inv, time_candy_filled))` passes 0 whenever the dying player holds no candy, which is nearly every death.

**Ruling: wrap both insertions in `if (inv_total(inv, time_candy_filled) > 0)`,** and wrap the restore in `if (inv_total(time_candy_keep, time_candy_filled) > 0)` for the same reason.

**Cost if wrong:** every death in the world throws out of `player_death_lose_items`, which is the most visible possible regression. Task 5's content test asserts the guard's presence by grep and its behaviour by a live death with an empty inventory.

### R10. `Record` consumes the blank candy, and is refused with the item kept if a recording is already live

The design says Record "starts a one hour recording on that character" and does not say what happens to the blank. Leaving it in the inventory would make the item infinite.

**Ruling: `Record` removes exactly one `time_candy` from the slot the packet named, and only after the ledger write succeeds.** If a recording is already live on that character, or the ledger cannot be written, the item is not removed and the player is told. The order matters and is the same order redemption uses: persist, then mutate the inventory.

**Cost if wrong:** the reversed order (remove then persist) loses a blank candy to a failed write. The chosen order can at worst leave a recording with no blank consumed if the `invDel` fails after the write, which cannot happen for an item the handler has already proven is at that slot.

### R11. A read-only `GET /owner/:key/candies` exists, and it never creates a ledger for an unknown key

Nothing outside the engine can observe `filled.length`, so the design's own alert ("a mismatch is an alert, not an automatic correction") and its integration test have nothing to read. `snapshot()`'s comment in `management.ts:146-147` warns that touching the store caches an entry for any key it is given, which is safe for a bank and an odd thing to lean on from a polled route.

**Ruling: one route, `GET /owner/:key/candies`, registered beside the three existing ones, behind the same `authorised()` check and the same `OWNER_KEY_RE` guard, returning the recordings and the sealed rows.** It seals expired recordings for an owner whose file exists (that is a read, and sealing is defined as happening on every read), and for a key with no file it answers the empty shape **without creating or caching an entry**. No route may pop a row: `Eat` is the invariant's only exit.

**Cost if wrong:** a route that cached an entry per polled key would grow the store's map without bound. The empty-shape answer means a caller cannot distinguish "no such owner" from "an owner with nothing", which is the right trade for a loopback diagnostic and is stated in the route's comment.

### R12. The summary line shows player-facing experience, not engine tenths

The stored amounts are the engine's tenths. The design's example, `You relive 64,200 experience.` for a recording of `{ "10": 582000 }`, mixes the two: 582,000 tenths is 58,200 experience.

**Ruling: divide by 10 and floor, and print the number a player would read on the skill guide.** `Check` prints the same unit, one line per skill, oldest sealed row only.

**Cost if wrong:** a cosmetic factor of ten in one message. One line, no data change.

### R13. `pendingDelivery` absorbs `unavailable` as well as `full`, and the two are logged differently

The design says `pendingDelivery` "counts sealed rows whose bank credit has not landed because the bank was full". `apply` has a second failure: `unavailable`, meaning the owner's bank file could not be quarantined and writes are suspended for the life of the process. Treating that as anything other than a pending credit would destroy a candy because of an unrelated bank fault.

**Ruling: both increment `pendingDelivery`.** They are not symmetrical and are not logged the same: `full` clears when the player banks something and is logged at info level once per owner; `unavailable` clears only when an operator fixes a file and is logged at error level once per owner, through the same `warnOnce` shape `ownerBank.ts:97-102` uses.

**Cost if wrong:** silently retrying an `unavailable` forever is exactly the failure D115 and audit C07 exist to prevent, so the distinct log is the whole point.

### R14. Lazy sealing needs a reader, so `afterCycle` seals for every online owner and audits every offline one (decisions D125)

The design says sealing "is evaluated whenever the state is read: a login, an experience grant, a bank open, a redeem, a `Check`", and that "no background job or tick sweep is needed". Its section 9 puts "the `addXp` patch and the login-time seal" in `install.ts`. Read literally against what this plan builds, that leaves **no reader at all** for the case the design cares most about. `accrue()` deliberately does not seal (an expired recording accrues nothing, and sealing inside `addXp` would put an `fs.writeFileSync` in a path that fires several times a second per player). `startRecording`, `peek`, `redeem` and `snapshot` all seal, and every one of them needs an item the player has not been given yet: `Record` needs another blank, `Eat` and `Check` need the full candy that has not been credited. So an hour would end, and nothing would ever notice until an operator curled the management route. That contradicts section 5's own "the sealed candy always goes to the owner bank... the character will often be offline when its hour ends, and the credit path has to be the same in both cases".

There is no login hook to hang it on either: `install.ts` patches `getInventory`, `World.cycle` and the `exit` handler, and nothing in the overlay wraps a login.

**Ruling: seal from the walk `afterCycle` already makes.** On a tick divisible by 100, for each owner key in the `online` map the walk has just built, call `candyStore().seal(ownerKey)`. That is a read for every owner with a character in the world, once a minute, on the branch that already flushes. An owner with nobody online seals on their next tick online, which is the first moment the credit could matter to them, and the redeem path seals again before it pops. **And on the tick divisible by 1500, audit the offline set** (`banks.loaded()` minus the keys in `online`), which is the only form of the invariant that is always checkable, and log the alert `audit()` returns. Without this, `audit()` ships with no caller at all and the design's "a mismatch is an alert" is dead code.

**Cost if wrong:** a seal costs one `sealExpired` over one owner's recordings plus, when something actually seals, one ledger write and one bank apply. At 100 ticks that is once a minute per online owner, on the same branch as the bank flush. The alternative, the plan as reviewed, is an item that never arrives. If the sweep ever shows up in a tick-time measurement the correction is to move it to the 1500-tick branch beside the audit, which costs a fifteen-minute worst case on the credit.

### R15. `npm run verify` runs the browser spec against a SHORT candy hour, and the gate carries the value (decisions D126)

Ruling R7 makes the hour configurable so a Playwright spec can exist. It does not by itself make the spec runnable, and the plan as reviewed had it failing twice over. `scripts/start-stack.ps1` reads `server/.env` for exactly two keys, `OWNER_ASSERTION_SECRET` and `ENGINE_MANAGEMENT_SECRET`, and sets only those into the engine's environment, so `IDLESCAPE_CANDY_HOUR_MS=8000` in that file reaches nothing. And `web/playwright.config.ts` has `testDir: 'e2e'` with no grep, while `verify.ps1`'s e2e step runs a bare `npx playwright test`, so `candy.pw.test.ts` is in the gate whether or not the hour was shortened for it.

**Ruling, two halves.** `scripts/start-stack.ps1` gains `IDLESCAPE_CANDY_HOUR_MS` in the list of keys it lifts out of `server/.env`, beside the two secrets, so the documented way to shorten the hour for a local run is the same one-file way every other engine secret is set. And `scripts/verify.ps1` sets `$env:IDLESCAPE_CANDY_HOUR_MS = '8000'` beside its existing `$env:WEB_DIST`, before it starts the stack and restored in the same `finally`, so **the gate deliberately runs the e2e world on an eight second hour**. A `Start-Process` child inherits the parent's environment, which is how `WEB_DIST` already reaches the front server, so no other wiring is needed.

The alternative, skipping the spec by default, was rejected: a skip reads as green, and `verify.ps1` already carries a paragraph explaining why it refuses to let the bank spec skip itself for exactly that reason.

**Cost if wrong:** nothing in `npm run verify` then exercises the shipping 3,600,000 default. That default is covered instead by `config.test.ts`, which asserts it three ways (default, file, env) and asserts the floor. The e2e world is not a shipping world: it also runs with `-DevStaff` and a dev Firebase project. If a later entry needs the gate to run a real hour, the answer is a second spec, not a longer one.

---

## File structure

```
content-custom/
  scripts/idlescape_time_candy/configs/time_candy.obj      NEW   both objs
  scripts/idlescape_time_candy/configs/time_candy.inv      NEW   time_candy_keep
  scripts/minigames/game_trail/scripts/medium/trail_clue_medium_reward.rs2   REPLACE
  scripts/minigames/game_trail/scripts/hard/trail_clue_hard_reward.rs2       REPLACE
  scripts/player/scripts/death.rs2                         REPLACE
  scripts/skill_magic/scripts/spells/alchemy.rs2           REPLACE
  pack/obj.pack                                            +2 lines (entry 3's file)
  pack/inv.pack                                            +1 line  (entry 3's file)
  manifest.json                                            +6 rows

engine-custom/
  src/idlescape/types.ts               MODIFY  CandyRecording, CandyFilled, CandyLedgerFile, constants
  src/idlescape/candyLedger.ts         NEW     pure: seal timing, FIFO, pendingDelivery, validation
  src/idlescape/candyLedger.test.ts    NEW
  src/idlescape/candyLedgerFile.ts     NEW     data/candies/<ownerKey>.json, atomic write, quarantine
  src/idlescape/candyLedgerFile.test.ts NEW
  src/idlescape/candy.ts               NEW     CandyStore: entries, seal, credit, redeem, flush, audit
  src/idlescape/candy.test.ts          NEW
  src/idlescape/candyOps.ts            NEW     held-op glue and the addXp patch installer
  src/idlescape/candyOps.test.ts       NEW
  src/idlescape/config.ts              MODIFY  candyDir, candyHourMs
  src/idlescape/config.test.ts         MODIFY  two cases
  src/idlescape/install.ts             MODIFY  install the accrual patch, widen flushBanks
  src/idlescape/management.ts          MODIFY  GET /owner/:key/candies
  src/idlescape/management.test.ts     MODIFY  four cases
  src/idlescape/packIds.ts             MODIFY  three rows move ALLOCATED_IDS -> SHIPPED_IDS
  src/idlescape/candyIntegration.test.ts NEW   the shared.test.ts style loop, end to end in-process
  src/network/game/client/handler/OpHeldHandler.ts  NEW as a replacement (upstream + 4 lines)
  .env.example                         MODIFY  two rows
  manifest.json                        MODIFY  +11 rows, and the Player.ts anchor's why
  PATCHES.md                           MODIFY  two sections and the typed rows

web/e2e/
  candy.pw.test.ts                     NEW     the browser proof of record, seal, credit, redeem
  helpers.ts                           MODIFY  readCandies()

scripts/
  start-stack.ps1                      MODIFY  IDLESCAPE_CANDY_HOUR_MS in the server/.env key list
  verify.ps1                           MODIFY  the e2e stack gets a short candy hour (ruling R15)

docs/superpowers/ledgers/
  2026-09-08-time-candy.md             NEW     the promoted ledger, written and staged in Task 9
```

`scripts/start-stack.ps1` and `scripts/verify.ps1` are two of the files sprint entry 3 rewrites. Both edits below are described by their anchor (the loop that lifts keys out of `server/.env`; the block that sets `$env:WEB_DIST` before the stack starts) and never by line number, because entry 3's rewrite moves every line in both files.

**Why four engine modules and not the design's three.** `candyLedger.ts` is pure and has no engine imports, so it is unit-testable the way `ops.ts` is. `candyLedgerFile.ts` is `fs` only. `candy.ts` is the store, which needs `ObjType` and the owner bank. `candyOps.ts` is the only module that touches `Player` and message shapes, which keeps the replaced `OpHeldHandler.ts` importing one function from one place, and keeps every file well under the ceiling with the house comment density. `install.ts` at 302 lines gains two lines of call site and nothing else.

---

## Task 1: The two objs, the keep inventory, and three pack ids that cannot be renumbered

The items land first, through entry 3's pack path, because nothing else in this plan can be tested until `time_candy` and `time_candy_filled` exist in the packed cache. Nothing in this task has behaviour: no trigger, no drop, no ledger.

**Files:**
- Create: `content-custom/scripts/idlescape_time_candy/configs/time_candy.obj`
- Create: `content-custom/scripts/idlescape_time_candy/configs/time_candy.inv`
- Modify: `content-custom/pack/obj.pack` (append two lines after `3893=wearable_stool_white`)
- Modify: `content-custom/pack/inv.pack` (append one line after `216=boardgames_sideinv`)
- Modify: `content-custom/manifest.json` (two `new` rows)
- Modify: `engine-custom/src/idlescape/packIds.ts` (three rows move from `ALLOCATED_IDS` to `SHIPPED_IDS`, and the doc comment above `ALLOCATED_IDS`)
- Modify: `engine-custom/src/idlescape/packIds.test.ts` (two of entry 3's cases repaired in place, then two new negative cases)
- Modify: `engine-custom/PATCHES.md` (a `## Time candy` section under the content notes, and three typed rows)
- Test: `engine-custom/src/idlescape/packIds.test.ts`

**Interfaces:**
- Consumes: entry 3's `content-custom/pack/{obj,inv}.pack` (its Task 1), and `engine-custom/src/idlescape/packIds.ts` with `UPSTREAM_TAIL`, `SHIPPED_IDS`, `ALLOCATED_IDS`, `parsePack(text): Map<number, string>` and `checkPack(pack, text): string[]` (its Task 2).
- Produces, for every later task: obj `time_candy` at id **3894**, obj `time_candy_filled` at id **3895**, inv `time_candy_keep` at id **219**, resolvable at runtime with `ObjType.getId('time_candy')` and `InvType.getId('time_candy_keep')` once `data/pack` has been rebuilt.

- [ ] **Step 1: Confirm entry 3 has landed, and that the tree is green before anything is added**

```powershell
Test-Path engine-custom\src\idlescape\packIds.ts
Test-Path scripts\patches-check.ps1
Test-Path content-custom\pack\obj.pack
Select-String -Path .gitattributes -SimpleMatch "*.pack text eol=lf"
git -C . status --short content-custom engine-custom
```

Expected: the first three all answer `True`, the `Select-String` prints `*.pack text eol=lf`, and `git status` is clean for both overlay directories. The attribute is `text eol=lf` and **not** `-text`: `.gitattributes` says in its own comment that `-text` would close only the checkout half, and `eol=lf` is what makes a hand-appended `.pack` line canonical LF in the blob as well as on disk. Do not search for `-text`; it is not there and never was. **If `packIds.ts` does not exist, stop.** This plan's Step 5 edits a file entry 3 creates, and its whole pack story depends on entry 3's guard. Report the blocker rather than writing the file yourself.

- [ ] **Step 2: Write the two obj configs**

`content-custom/scripts/idlescape_time_candy/configs/time_candy.obj`. The directory is new and needs no registration anywhere: the pack tool discovers configs by walking the tree (`readDirTree` and `findFiles` in `engine/server/tools/pack/config/PackShared.ts`). It must sit under a directory named `configs` or a child of one, because `BuildOverlay.ts` relaxes `Environment.build.verify` and **not** `verifyFolder`, which stays on (`PackFile.ts:227` and `:384`).

```
// Sprint entry 10, time candy. Both objs reuse inv_chocolate with a recolour, so this is a
// config-only cache change and the forked client needs no patch.
//
// recol1s=11426 is not a taste decision. inv_chocolate is a single-colour model: all 80 of its
// faces carry HSL16 3738. Obj recol values are written in RGB555 and converted by the packer
// (tools/pack/config/ObjConfig.ts calls ColorConversion.rgb15toHsl16 when either half is >= 100),
// and exactly one RGB555 value maps to 3738, which is 11426. Any other source colour recolours
// nothing at all, silently.
//
// The two destinations are already in this content tree: 13325 is [wolfenboots_purple]'s muted
// purple (areas/area_canifis/configs/canifis.obj) and 19487 is [purple_partyhat]'s brighter one
// (general_use/configs/holiday.obj).
//
// The 2d* values are copied from [chocolate_bar] (skill_cooking/.../cakes/cakes.obj), which is
// the obj this model was authored for, so the inventory icon is framed the way it already is.
//
// Neither obj sets members=, and that is load-bearing rather than an omission. ObjType.ts's
// members block (:59-68) fires whenever a members obj is read on a non-members world and it
// forces tradeable=false, rewrites iop back to Drop-only and sets category=-1. On this world
// that would silently erase Eat and Check from the full candy and flip the blank's tradeable,
// and nothing in the suite outside Task 5's two config cases would notice.

[time_candy]
name=Time candy
desc=It will remember an hour of your training.
model=inv_chocolate
recol1s=11426
recol1d=13325
2dxof=1
2dyof=41
2dzoom=950
2dyan=208
2dxan=276
stackable=yes
tradeable=yes
cost=1000
weight=10g
iop1=Record

// cost=1 is load-bearing, not flavour. death.rs2's ~move_priciest_item_on_hero_to_death picks by
// oc_cost, so a cheap full candy can never be pulled into deathkeep and steal one of the four
// slots the three priciest items plus Protect Item already spend.
//
// tradeable=no closes five exits with one line: trade, duel staking, the party room chest, shop
// selling and putting an item on a table. See engine-custom/PATCHES.md, "Time candy".
[time_candy_filled]
name=Time candy (full)
desc=An hour of someone's training, waiting to happen again.
model=inv_chocolate
recol1s=11426
recol1d=19487
2dxof=1
2dyof=41
2dzoom=950
2dyan=208
2dxan=276
stackable=yes
tradeable=no
cost=1
weight=10g
iop1=Eat
iop2=Check
```

Deliberately absent: any `category=` and any `param=`. `category.pack` and `param.pack` are **not** pinned in `content-custom/pack/`, so a new name in either is exactly the auto-registration `Environment.build.verify = false` allows: `packAll` rewrites the clone's copy and the surviving hash-delta guard exits 1 naming a file nobody has a tracked copy of.

- [ ] **Step 3: Write the keep inventory**

`content-custom/scripts/idlescape_time_candy/configs/time_candy.inv`. This is a **new file**, not a replacement of `player.inv`: `player.inv` stays upstream and out of the manifest. The grammar is copied from `engine/content/scripts/player/configs/player.inv`, where `trail_rewardinv` is the `scope=temp` / `stackall=yes` example.

```
// Sprint entry 10. One slot is enough because the full candy stacks. death.rs2 moves the whole
// stack in here before inv_dropall runs and moves it back after ~moveallinv(deathkeep, inv),
// which is how a full candy survives a death without borrowing one of deathkeep's four slots.
[time_candy_keep]
scope=temp
size=1
stackall=yes
```

- [ ] **Step 4: Append the three pack ids by hand, as literal text, with LF endings**

Never let the builder allocate an id. From the repository root, in Git Bash (which writes LF and no BOM):

```bash
printf '3894=time_candy\n3895=time_candy_filled\n' >> content-custom/pack/obj.pack
printf '219=time_candy_keep\n' >> content-custom/pack/inv.pack
tail -3 content-custom/pack/obj.pack
tail -2 content-custom/pack/inv.pack
file content-custom/pack/obj.pack content-custom/pack/inv.pack
```

Expected: `obj.pack` ends `3893=wearable_stool_white`, `3894=time_candy`, `3895=time_candy_filled` and is 3896 lines; `inv.pack` ends `216=boardgames_sideinv`, `219=time_candy_keep` and is 218 lines. `file` reports "ASCII text", not "with CRLF line terminators". **217 and 218 are left empty on purpose** (ruling R4); they are entry 11's.

- [ ] **Step 5: Move the three rows from `ALLOCATED_IDS` to `SHIPPED_IDS`**

This is a move, not an addition. Entry 3 already ships all six of this sprint's allocated ids inside `ALLOCATED_IDS`, which is asserted **conditionally and both ways**: if the id line exists its name must match, and if the name appears anywhere its id must match. Neither half asserts presence. `SHIPPED_IDS` is asserted **positively**. Until the rows move, the gate would still pass if somebody reverted the `.pack` append.

In `engine-custom/src/idlescape/packIds.ts`, add three entries to the end of `SHIPPED_IDS`:

```ts
    { pack: 'varp', id: 367, name: 'banktab_size_9' },
    // Sprint entry 10, time candy. Appended to content-custom/pack/ by hand; see PATCHES.md.
    { pack: 'obj', id: 3894, name: 'time_candy' },
    { pack: 'obj', id: 3895, name: 'time_candy_filled' },
    { pack: 'inv', id: 219, name: 'time_candy_keep' }
];
```

and delete the same three from `ALLOCATED_IDS`, leaving entry 11's three, with the doc comment above it corrected:

```ts
/**
 * Ids the sprint allocates that no entry has appended yet: sprint entry 11 (battlebots) owns
 * bb_stash_inv, bb_stash_worn and bb_portal. Entry 10's three moved to SHIPPED_IDS when time
 * candy landed. Absence is NOT a violation until entry 11 lands; a mismatch is, in both
 * directions. See checkPack.
 *
 * inv 217 and 218 are entry 11's and inv.pack therefore has a hole above 216 until it lands.
 * That is safe: PackFile.load reads into a Map and never requires density, packInvConfigs calls
 * client.next()/server.next() unconditionally so a hole emits an empty record and shifts nothing,
 * and checkPack asserts density only over the upstream prefix.
 */
export const ALLOCATED_IDS: ReadonlyArray<PinnedId> = [
    { pack: 'inv', id: 217, name: 'bb_stash_inv' },
    { pack: 'inv', id: 218, name: 'bb_stash_worn' },
    { pack: 'loc', id: 4671, name: 'bb_portal' }
];
```

- [ ] **Step 6: Repair the two cases in `packIds.test.ts` that the move breaks**

Do this **before** adding anything. Entry 3 wrote both of these on the assumption that `SHIPPED_IDS` holds only varp rows and that the three candy names are allocated, so Step 5's move turns them red, in a file this entry did not write, at the moment the plan says the gate should be green.

**The varp case iterates all of `SHIPPED_IDS` against `varp.pack`.** At HEAD it reads:

```ts
    it('the nine shipped bank-tab varps are on their exact ids', () => {
        const byId = parsePack(readPack('varp'));
        for (const pin of SHIPPED_IDS) {
            assert.strictEqual(byId.get(pin.id), pin.name);
        }
    });
```

After the move it looks obj id 3894 and inv id 219 up inside `varp.pack` and fails. Rename it and read each pin's own pack, which is what it meant all along:

```ts
    it('every shipped id is on its exact id, in its own pack', () => {
        for (const pin of SHIPPED_IDS) {
            assert.strictEqual(parsePack(readPack(pin.pack)).get(pin.id), pin.name, `${pin.pack}.pack id ${pin.id}`);
        }
    });
```

**The both-directions case is written on `time_candy`,** and both of its expected sentences come out of `checkPack`'s `ALLOCATED_IDS` branch, which no longer has that name in it. Worse, its second half appends `3894=time_candy_typo` to a file that now already has a 3894 line, and `parsePack` **throws** on a duplicate id rather than reporting one. Re-point the whole case at a name still in `ALLOCATED_IDS`. `bb_stash_inv` on inv 217 is the one to use: entry 11 has not landed, so `inv.pack` has no 217 line and neither mutation can collide.

```ts
    it('an allocated name on the wrong id fails, in both directions', () => {
        // Entry 11's bb_stash_inv, not entry 10's time_candy: time_candy is SHIPPED now, so its
        // failures come out of checkPack's shipped branch with different sentences, and appending
        // a second 3894 line would make parsePack throw on the duplicate id instead.
        const wrongId = `${readPack('inv').trimEnd()}\n3999=bb_stash_inv\n`;
        const byName = checkPack('inv', wrongId);
        assert.ok(byName.some(p => p.includes('"bb_stash_inv" is allocated id 217')), byName.join('\n'));

        const wrongName = `${readPack('inv').trimEnd()}\n217=bb_stash_typo\n`;
        const byIdProblems = checkPack('inv', wrongName);
        assert.ok(byIdProblems.some(p => p.includes('id 217 is allocated to "bb_stash_inv"')), byIdProblems.join('\n'));
    });
```

- [ ] **Step 7: Write the failing test for a renumbered candy**

Append two cases **inside the existing `describe('packIds', ...)` block** in `engine-custom/src/idlescape/packIds.test.ts`. This is the mutation-proof half: it proves the gate would catch a renumbering rather than merely passing today.

That file imports `{ describe, it }` from `node:test` and **not `test`**, declares `const PACK_DIR = path.resolve('..', '..', 'content-custom', 'pack')`, and reads packs through a `readPack(pack)` helper. Written as top-level `test(...)` calls against a `packDir`, these two would throw `ReferenceError: test is not defined` at module load and take the whole suite with them. Use the file's own shapes:

```ts
    it('a missing time_candy line is a violation, not a silent pass', () => {
        // Sprint entry 10. A .pack append is one line of literal text with no compiler behind it,
        // so the only thing standing between "3894=time_candy" and "3894=something_else" is this.
        const text = readPack('obj');
        assert.deepStrictEqual(checkPack('obj', text), [], 'the tracked obj.pack is clean before it is mutated');

        const without = text.split(/\r?\n/).filter(line => line !== '3894=time_candy').join('\n');
        const violations = checkPack('obj', without);
        assert.strictEqual(violations.length, 1, `expected exactly one violation, got ${JSON.stringify(violations)}`);
        assert.ok(violations[0].includes('3894') && violations[0].includes('time_candy'), violations[0]);
    });

    it('a renumbered time_candy_filled is a violation', () => {
        const text = readPack('obj');
        const renumbered = text.replace('3895=time_candy_filled', '3895=wearable_stool_white');
        assert.notStrictEqual(renumbered, text, 'the fixture line must exist for this mutation to mean anything');
        assert.notDeepStrictEqual(checkPack('obj', renumbered), []);
    });
```

Exactly one violation is the right count for the first case, and it is worth knowing why rather than trusting it: deleting `3894=time_candy` leaves the SHIPPED loop reporting `id 3894 must be "time_candy", found no line`, and produces **no** density problem, because `UPSTREAM_TAIL` for `obj` is 3893 and `checkPack` asserts density only over `0..3893`.

- [ ] **Step 8: Run the test and watch it pass, then watch the real gate fail on a real mutation**

```powershell
powershell -File scripts/engine-overlay.ps1
cd engine\server
npx tsx --test --test-force-exit src/idlescape/packIds.test.ts
```

Expected: every case passes, including the two new ones and the two repaired in Step 6. Then prove the gate is real rather than the test being real, by mutating the tracked file itself and watching the whole suite go red:

```powershell
cd ..\..
(Get-Content content-custom\pack\obj.pack) -replace '3894=time_candy$', '3894=time_candy_x' | Set-Content content-custom\pack\obj.pack
powershell -File scripts/engine-overlay.ps1
cd engine\server
npx tsx --test --test-force-exit src/idlescape/packIds.test.ts
```

Expected: **FAIL**, naming id 3894. Restore it with `git checkout -- content-custom/pack/obj.pack` and re-run Step 4's `printf` lines, then re-run the suite and confirm green. Do not skip this: entry 3's plan watched a renumbering of `367=banktab_size_9` fail through the real gate path for the same reason.

- [ ] **Step 9: Add the manifest rows**

`content-custom/manifest.json` gains two `new` rows inside `files`. The four `pack/*.pack` rows entry 3 wrote are **not touched**: their `baseSha256` is the hash of the **upstream** file, and appending to our copy does not change upstream. Re-recording one against our appended copy would make `-Check` compare a hash against the file it was taken from, which can only ever agree, and the one signal the check exists to give would be destroyed silently.

```json
    { "path": "scripts/idlescape_time_candy/configs/time_candy.obj", "kind": "new", "baseSha256": null },
    { "path": "scripts/idlescape_time_candy/configs/time_candy.inv", "kind": "new", "baseSha256": null }
```

- [ ] **Step 10: Add the `PATCHES.md` section and its typed rows**

`engine-custom/PATCHES.md` gains a prose section. Write it in the file's existing voice, beside the other content notes:

```markdown
## Time candy (sprint entry 10)

Two objs and one inv, added by the content overlay and pinned by hand in `content-custom/pack/`:
`obj` 3894 `time_candy`, `obj` 3895 `time_candy_filled`, `inv` 219 `time_candy_keep`. The ids come
from the sprint spec's section 3 by name, never from the builder: `BuildOverlay.ts` runs with
`Environment.build.verify = false`, so an unknown name auto-registers at `pack.max++` and rewrites
the clone's `.pack`, and a renumbered `obj.pack` renumbers obj ids already written into every `.sav`
bank and every owner-bank JSON, turning one item into another with no error anywhere.

`inv` 217 and 218 are sprint entry 11's, so `inv.pack` has a hole above 216 until that entry lands.
`packInvConfigs` emits an empty record for a hole and shifts nothing, and `checkPack` asserts
density only over the upstream prefix, so the hole is safe and must not be filled.

Both objs reuse `inv_chocolate` with a recolour. `recol1s=11426` is the only RGB555 value that
converts to the model's single face colour (HSL16 3738); any other source recolours nothing and
says nothing. No client patch: `client/PATCHES.md` numbering stays at 28.
```

Then three rows in the `patches-check` fence entry 3's Task 8 created (`root: engine`, so the paths are relative to `engine/server` and the content ones use the `../content/...` form the fence already uses):

```
candy | contains | 1 | ../content/pack/obj.pack | 3894=time_candy
candy | contains | 1 | ../content/pack/inv.pack | 219=time_candy_keep
candy | contains | 1 | ../content/scripts/idlescape_time_candy/configs/time_candy.obj | [time_candy_filled]
```

These read the **clone**, so they prove what the overlay put there. `packIds.test.ts` reads the tracked source. Both are worth having and they are not the same check.

- [ ] **Step 11: Apply, apply again, then pack**

```powershell
powershell -File scripts/content-overlay.ps1
powershell -File scripts/content-overlay.ps1
powershell -File scripts/content-overlay.ps1 -Check
```

Expected: the first run copies the new files, the **second run reports 0 copied**, and `-Check` exits 0. What the second run proves is that the copy landed and that nothing rewrote the destination between the two: `scripts/content-overlay.ps1` compares `Get-FileHash` of source and destination and then copies byte for byte, so after the first copy the two agree whatever their line endings are. Line endings are not the hazard here that they are for a `.pack` file. `.gitattributes` is `* text=auto` with `*.pack text eol=lf`, so a `.obj`, `.inv` or `.rs2` overlay file is CRLF in the working tree on this machine and lands in the clone CRLF, which the compiler does not care about; the file that gets rewritten behind your back is `pack/*.pack`, by `PackFileBase.save()` joining with `'\n'`, which is exactly what the `eol=lf` pin exists for.

Then pack. This is the step `npm run verify` never performs:

```powershell
cd engine\server
npx tsx tools/pack/BuildOverlay.ts
```

Expected: the run ends with the pack-id check reporting the pinned ids unchanged and every pinned pack file verified byte for byte, and exits 0. **A run that names a moved pack file is a data-corruption event, not a pack to ship.** The recovery is `git -C engine/content checkout -- pack/`, correct the id line in `content-custom/pack/<type>.pack`, re-apply and pack again. Never run the engine's own `npm run build` instead: it checks each packed client config against a hard-coded CRC of the 2004 cache and aborts on anything the overlay adds. Allow about seven minutes for the first pack after a content change.

- [ ] **Step 12: Prove the objs exist in the rebuilt cache**

```powershell
cd engine\server
npx tsx -e "import ObjType from '#/cache/config/ObjType.js'; import InvType from '#/cache/config/InvType.js'; ObjType.load('data/pack'); InvType.load('data/pack'); console.log(ObjType.getId('time_candy'), ObjType.getId('time_candy_filled'), InvType.getId('time_candy_keep')); const o = ObjType.get(ObjType.getId('time_candy_filled')); console.log(o.name, o.tradeable, o.stackable, o.cost, o.iop);"
```

Expected: `3894 3895 219`, then `Time candy (full) false true 1` and an `iop` array whose first two entries are `Eat` and `Check`. If any id comes back `-1`, the cache was not rebuilt; go back to Step 11.

- [ ] **Step 13: Verify**

```powershell
powershell -File scripts/line-ceiling.ps1
powershell -File scripts/content-overlay.ps1 -Check
powershell -File scripts/engine-overlay.ps1
powershell -File scripts/engine-overlay.ps1 -Check
powershell -File scripts/patches-check.ps1
cd engine\server
npx tsc --noEmit
npx tsx --test --test-force-exit (Get-ChildItem 'src\idlescape\*.test.ts' | ForEach-Object { "src/idlescape/$($_.Name)" })
```

Expected: the ceiling passes, both overlays apply and report no drift and exit 0, the patch runner reports every row matched including the three new ones, the engine typechecks with no output, and **every** engine suite passes, not only `packIds.test.ts`.

- [ ] **Step 14: Commit**

```bash
git add content-custom/scripts/idlescape_time_candy/configs/time_candy.obj \
        content-custom/scripts/idlescape_time_candy/configs/time_candy.inv \
        content-custom/pack/obj.pack content-custom/pack/inv.pack \
        content-custom/manifest.json \
        engine-custom/src/idlescape/packIds.ts \
        engine-custom/src/idlescape/packIds.test.ts \
        engine-custom/PATCHES.md
git -c core.safecrlf=false commit -m "feat(content): add the two time candy objs and the keep inventory

obj 3894 time_candy, obj 3895 time_candy_filled and inv 219 time_candy_keep, from the
sprint spec's section 3 by name. The three pack lines are appended by hand as literal
LF text; inv 217 and 218 stay empty because they are entry 11's, and the hole is safe.

The three ids move from packIds.ts's ALLOCATED_IDS to SHIPPED_IDS, which turns \"if the
line is there it is right\" into \"it must be there and it must be right\". A deleted
3894 line and a renumbered 3895 were both watched to fail through the real gate path.
Two of entry 3's own cases are repaired by the same move: the shipped-id case now reads
each pin's own pack rather than varp.pack, and the both-directions case moves onto entry
11's bb_stash_inv, which is still allocated and has no line to collide with.

recol1s=11426 is the only RGB555 value that converts to inv_chocolate's single face
colour, so it is the only source that recolours anything. No behaviour, no trigger, no
drop yet, and no client patch: numbering stays at 28.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 2: The ledger record shape, and the pure arithmetic behind the invariant

No engine, no `fs`, no `Player`. This is the module the section 6 invariant is actually written in, and it is the one place the conservation assertions can be driven exhaustively.

**Files:**
- Modify: `engine-custom/src/idlescape/types.ts` (44 lines at HEAD; add four types and three constants)
- Create: `engine-custom/src/idlescape/candyLedger.ts`
- Create: `engine-custom/src/idlescape/candyLedger.test.ts`
- Test: `engine-custom/src/idlescape/candyLedger.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, from `#/idlescape/types.js`:
  - `interface CandyRecording { startedAt: number; expiresAt: number; xp: Record<string, number> }`
  - `interface CandyFilled { sealedAt: number; character: string; xp: Record<string, number> }`
  - `interface CandyLedgerFile { version: number; recordings: Record<string, CandyRecording>; filled: CandyFilled[]; pendingDelivery: number }`
  - `const CANDY_FILE_VERSION = 1`, `const CANDY_STAT_COUNT = 21`, `const CANDY_HOUR_MS_FLOOR = 1000`
- Produces, from `#/idlescape/candyLedger.js`:
  - `function emptyLedger(): CandyLedgerFile`
  - `function startRecording(file: CandyLedgerFile, character: string, now: number, hourMs: number): 'started' | 'already'`
  - `function accrue(file: CandyLedgerFile, character: string, stat: number, tenths: number, now: number): boolean`
  - `function sealExpired(file: CandyLedgerFile, now: number): CandyFilled[]`
  - `function popFilled(file: CandyLedgerFile): CandyFilled | null`
  - `function totalTenths(row: CandyFilled): number`
  - `function validateLedger(parsed: unknown): { file: CandyLedgerFile; rejected: number }`

- [ ] **Step 1: Add the types**

Append to `engine-custom/src/idlescape/types.ts`, keeping the file free of engine imports so the front server could mirror it later:

```ts
/**
 * One live recording. Keyed by CHARACTER name in the file, because a recording belongs to a
 * character and an owner may have several online at once (design ruling 4: per-owner recording
 * would let an owner running five characters funnel five streams into one candy, which is a 5x
 * rather than the 2x the item is meant to be).
 *
 * `xp` maps a stat index to POST-multiplier tenths, which is the unit Player.stats holds. The key
 * is a string because JSON.stringify turns a numeric key into one; typing it Record<number, number>
 * would be a quiet lie about what round-trips.
 */
export interface CandyRecording {
    startedAt: number;
    expiresAt: number;
    xp: Record<string, number>;
}

/** One sealed candy. FIFO: `filled[0]` is the row the next Eat pops. */
export interface CandyFilled {
    sealedAt: number;
    character: string;
    xp: Record<string, number>;
}

/**
 * `engine/server/data/candies/<ownerKey>.json`, beside data/banks/.
 *
 * `version` here is a SCHEMA version, not the owner bank's optimistic-concurrency counter. The
 * bank's version is handed to the browser as an expectedVersion and 409s on a mismatch
 * (management.ts); nothing outside the engine writes a candy ledger, so it needs no concurrency
 * token. The word is the same and the meaning is not, which is why it is said here.
 */
export interface CandyLedgerFile {
    version: number;
    recordings: Record<string, CandyRecording>;
    filled: CandyFilled[];
    pendingDelivery: number;
}

export const CANDY_FILE_VERSION = 1;
/** PlayerStatEnabled has 21 entries (engine/entity/PlayerStat.ts), so stat indices are 0..20. */
export const CANDY_STAT_COUNT = 21;
/** The shortest hour an operator may configure. See idlescapeConfig.candyHourMs. */
export const CANDY_HOUR_MS_FLOOR = 1000;
```

- [ ] **Step 2: Write the failing tests**

`engine-custom/src/idlescape/candyLedger.test.ts`. Pure module, so no `install.js` import and no cache load.

```ts
// The section 6 invariant, at the level the arithmetic decides it. Nothing here touches fs, the
// engine, or a Player: candyLedger.ts is pure the way ops.ts is, and this file is where the
// conservation rules are driven exhaustively rather than through a running world.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { accrue, emptyLedger, popFilled, sealExpired, startRecording, totalTenths, validateLedger } from './candyLedger.js';
import { CANDY_FILE_VERSION } from './types.js';

const HOUR = 3_600_000;
const T0 = 1_757_160_000_000;

test('a fresh ledger is empty and carries the current schema version', () => {
    const file = emptyLedger();
    assert.equal(file.version, CANDY_FILE_VERSION);
    assert.deepEqual(file.recordings, {});
    assert.deepEqual(file.filled, []);
    assert.equal(file.pendingDelivery, 0);
});

test('starting a recording stamps the hour from now, and a second start on the same character is refused', () => {
    const file = emptyLedger();
    assert.equal(startRecording(file, 'zezima', T0, HOUR), 'started');
    assert.deepEqual(file.recordings.zezima, { startedAt: T0, expiresAt: T0 + HOUR, xp: {} });

    assert.equal(startRecording(file, 'zezima', T0 + 1, HOUR), 'already');
    assert.equal(file.recordings.zezima.startedAt, T0, 'the refused start must not move the clock');

    // A different character of the same owner is a different recording, per design ruling 4.
    assert.equal(startRecording(file, 'alice', T0 + 1, HOUR), 'started');
    assert.equal(Object.keys(file.recordings).length, 2);
});

test('a live recording accrues, an expired one accrues nothing however it is read', () => {
    const file = emptyLedger();
    startRecording(file, 'zezima', T0, HOUR);

    assert.equal(accrue(file, 'zezima', 10, 582_000, T0 + 60_000), true);
    assert.equal(accrue(file, 'zezima', 10, 18_000, T0 + 120_000), true);
    assert.equal(accrue(file, 'zezima', 7, 41_000, T0 + 120_000), true);
    assert.deepEqual(file.recordings.zezima.xp, { '10': 600_000, '7': 41_000 });

    // At expiresAt exactly, and after it, and long after it.
    assert.equal(accrue(file, 'zezima', 10, 5, T0 + HOUR), false);
    assert.equal(accrue(file, 'zezima', 10, 5, T0 + HOUR + 1), false);
    assert.equal(accrue(file, 'zezima', 10, 5, T0 + HOUR * 99), false);
    assert.deepEqual(file.recordings.zezima.xp, { '10': 600_000, '7': 41_000 }, 'nothing accrues after expiry');

    // A character with no recording, and a zero or negative amount, are all no-ops.
    assert.equal(accrue(file, 'nobody', 10, 100, T0 + 1), false);
    assert.equal(accrue(file, 'zezima', 10, 0, T0 + 1), false);
    assert.equal(accrue(file, 'zezima', 10, -5, T0 + 1), false);
});

test('sealing moves an expired recording into filled exactly once, and is idempotent', () => {
    const file = emptyLedger();
    startRecording(file, 'zezima', T0, HOUR);
    accrue(file, 'zezima', 10, 582_000, T0 + 60_000);

    assert.deepEqual(sealExpired(file, T0 + HOUR - 1), [], 'nothing seals before expiresAt');
    assert.equal(file.filled.length, 0);

    const sealed = sealExpired(file, T0 + HOUR);
    assert.equal(sealed.length, 1);
    assert.deepEqual(sealed[0], { sealedAt: T0 + HOUR, character: 'zezima', xp: { '10': 582_000 } });
    assert.equal(file.filled.length, 1);
    assert.equal(Object.keys(file.recordings).length, 0, 'the recording is gone, not merely marked');

    // Idempotent: reading again seals nothing more. A ledger entry without its candy is exactly
    // what a double seal would produce, and it is the failure this case exists to catch.
    assert.deepEqual(sealExpired(file, T0 + HOUR * 5), []);
    assert.equal(file.filled.length, 1);
});

test('a 0 XP hour still seals into a candy (plan ruling R2)', () => {
    const file = emptyLedger();
    startRecording(file, 'zezima', T0, HOUR);
    const sealed = sealExpired(file, T0 + HOUR);
    assert.equal(sealed.length, 1);
    assert.deepEqual(sealed[0].xp, {});
    assert.equal(totalTenths(sealed[0]), 0);
    assert.equal(file.filled.length, 1, 'the item and the row are created together or not at all');
});

test('several expired recordings seal oldest first, and Eat pops oldest first', () => {
    const file = emptyLedger();
    startRecording(file, 'alice', T0, HOUR);
    startRecording(file, 'bob', T0 + 10_000, HOUR);
    accrue(file, 'alice', 1, 100, T0 + 5);
    accrue(file, 'bob', 2, 200, T0 + 10_005);

    const sealed = sealExpired(file, T0 + HOUR + 20_000);
    assert.deepEqual(sealed.map(r => r.character), ['alice', 'bob'], 'sealed in expiry order');
    assert.deepEqual(file.filled.map(r => r.character), ['alice', 'bob']);

    assert.equal(popFilled(file)?.character, 'alice');
    assert.equal(popFilled(file)?.character, 'bob');
    assert.equal(popFilled(file), null, 'an empty filled list answers null rather than throwing');
    assert.equal(file.filled.length, 0);
});

test('totalTenths sums every recorded stat', () => {
    assert.equal(totalTenths({ sealedAt: T0, character: 'z', xp: { '10': 582_000, '7': 41_000 } }), 623_000);
    assert.equal(totalTenths({ sealedAt: T0, character: 'z', xp: {} }), 0);
});

test('validateLedger keeps what it can read and counts what it refused', () => {
    const ok = validateLedger({
        version: 1,
        recordings: { zezima: { startedAt: T0, expiresAt: T0 + HOUR, xp: { '10': 5 } } },
        filled: [{ sealedAt: T0, character: 'zezima', xp: { '3': 7 } }],
        pendingDelivery: 2
    });
    assert.equal(ok.rejected, 0);
    assert.equal(ok.file.pendingDelivery, 2);
    assert.equal(ok.file.filled.length, 1);

    // Every refusal is COUNTED, never silently dropped: the file is the only record of what the
    // owner earned, so the store turns a non-zero count into a suspended write, not a shrug.
    const bad = validateLedger({
        version: 1,
        recordings: {
            good: { startedAt: T0, expiresAt: T0 + HOUR, xp: { '10': 5 } },
            noExpiry: { startedAt: T0, xp: {} },
            badStat: { startedAt: T0, expiresAt: T0 + HOUR, xp: { '21': 5 } },
            badAmount: { startedAt: T0, expiresAt: T0 + HOUR, xp: { '10': -1 } },
            floatClock: { startedAt: T0 + 0.5, expiresAt: T0 + HOUR, xp: {} }
        },
        filled: [{ sealedAt: T0, character: 'zezima', xp: { '3': 7 } }, { sealedAt: T0, xp: {} }, 'nonsense'],
        pendingDelivery: -1
    });
    // THREE recordings survive, not one, and the count is the point of the case. `noExpiry` and
    // `floatClock` fail the timestamp guard and are dropped whole; `badStat` and `badAmount` have
    // legal clocks, so the recording is kept with an emptied xp map and the refusal is counted.
    // That asymmetry is deliberate: dropping a recording because one xp entry was unreadable
    // would end a player's live hour, and the store has already suspended writes for this owner
    // on the non-zero count, so nothing can overwrite the file while an operator looks at it.
    assert.equal(Object.keys(bad.file.recordings).length, 3);
    assert.deepEqual(bad.file.recordings.badStat.xp, {}, 'a refused xp entry empties the map, it does not delete the recording');
    assert.deepEqual(bad.file.recordings.badAmount.xp, {});
    assert.equal(bad.file.filled.length, 1);
    assert.equal(bad.file.pendingDelivery, 0, 'a negative pendingDelivery is refused, not carried');
    // 2 recordings + 2 xp entries + 1 filled row with no character + 1 non-object filled + 1
    // negative pendingDelivery.
    assert.equal(bad.rejected, 7);
});

test('validateLedger refuses a schema version it does not know rather than guessing', () => {
    assert.throws(() => validateLedger({ version: 2, recordings: {}, filled: [], pendingDelivery: 0 }), /version/);
    assert.throws(() => validateLedger(null), /ledger/);
    assert.throws(() => validateLedger([]), /ledger/);
});
```

- [ ] **Step 3: Run the tests and watch them fail**

```powershell
powershell -File scripts/engine-overlay.ps1
cd engine\server
npx tsx --test --test-force-exit src/idlescape/candyLedger.test.ts
```

Expected: FAIL, `Cannot find module ... candyLedger.js`.

- [ ] **Step 4: Write the module**

`engine-custom/src/idlescape/candyLedger.ts`:

```ts
/**
 * The candy ledger's arithmetic, with nothing else in it.
 *
 * This module is pure on purpose, the way ops.ts is: no fs, no engine imports, no clock of its
 * own. Every function that cares what time it is takes `now`, which is what makes the whole
 * lifecycle drivable from a unit test without a running world, and what makes the section 6
 * invariant checkable exhaustively rather than by observation.
 *
 * The invariant this module's half of:
 *
 *     filled.length == (full candies in the owner bank)
 *                    + (full candies in every one of that owner's character inventories)
 *                    + pendingDelivery
 *
 * Three conservation rules follow, and each has a test:
 *   - A seal moves exactly one recording into exactly one filled row, and never twice.
 *   - A pop removes exactly one filled row and hands it back, or answers null.
 *   - Nothing accrues at or after expiresAt, however late the read happens, so a lazy seal
 *     produces exactly the state an eager one would.
 */
import { CANDY_FILE_VERSION, CANDY_STAT_COUNT, type CandyFilled, type CandyLedgerFile, type CandyRecording } from './types.js';

export function emptyLedger(): CandyLedgerFile {
    return { version: CANDY_FILE_VERSION, recordings: {}, filled: [], pendingDelivery: 0 };
}

/**
 * Starts an hour on one character. `'already'` means a recording is live on that character and
 * the caller must NOT consume the blank candy (plan ruling R10). An expired-but-unsealed
 * recording is not "live": callers seal before they start, and this function does not seal for
 * them, so that the caller decides what to do with the row that comes out.
 */
export function startRecording(file: CandyLedgerFile, character: string, now: number, hourMs: number): 'started' | 'already' {
    if (Object.prototype.hasOwnProperty.call(file.recordings, character)) {
        return 'already';
    }
    file.recordings[character] = { startedAt: now, expiresAt: now + hourMs, xp: {} };
    return 'started';
}

/**
 * Adds one grant to a character's live recording. Answers whether anything was recorded, so the
 * caller can mark the file dirty only when it changed.
 *
 * `tenths` is the amount the engine ACTUALLY added to stats[stat], measured as a before-and-after
 * delta by the addXp wrapper (plan ruling R6). A non-positive amount is a no-op: addXp returns
 * early on 0, and a negative can only mean the wrapper measured something it should not have.
 */
export function accrue(file: CandyLedgerFile, character: string, stat: number, tenths: number, now: number): boolean {
    const recording = file.recordings[character];
    if (!recording || now >= recording.expiresAt || tenths <= 0 || !Number.isSafeInteger(tenths)) {
        return false;
    }
    const key = String(stat);
    recording.xp[key] = (recording.xp[key] ?? 0) + tenths;
    return true;
}

/**
 * Seals every recording whose hour is up, oldest expiry first, and returns the rows it created so
 * the caller can credit one candy to the owner bank per row.
 *
 * Sealing is LAZY and this is the only thing that makes it correct: nothing accrues after
 * expiresAt, so evaluating on every read produces exactly the state a tick sweep would have. The
 * seam for a sweep exists (install.ts's afterCycle already walks every online player once per
 * tick), and it is unnecessary rather than unavailable.
 *
 * An hour that recorded nothing still seals, into a row with an empty xp map (plan ruling R2).
 */
export function sealExpired(file: CandyLedgerFile, now: number): CandyFilled[] {
    const due: Array<[string, CandyRecording]> = Object.entries(file.recordings)
        .filter(([, recording]) => now >= recording.expiresAt)
        .sort((a, b) => a[1].expiresAt - b[1].expiresAt);

    const sealed: CandyFilled[] = [];
    for (const [character, recording] of due) {
        const row: CandyFilled = { sealedAt: now, character, xp: recording.xp };
        delete file.recordings[character];
        file.filled.push(row);
        sealed.push(row);
    }
    return sealed;
}

/** Oldest first. `Eat` pops index 0, and it is the only path that removes a row. */
export function popFilled(file: CandyLedgerFile): CandyFilled | null {
    return file.filled.shift() ?? null;
}

/** The sum of a row's recorded tenths. Divide by 10 for the number a player reads (ruling R12). */
export function totalTenths(row: CandyFilled): number {
    let total = 0;
    for (const amount of Object.values(row.xp)) {
        total += amount;
    }
    return total;
}

function validXp(value: unknown): { xp: Record<string, number>; rejected: number } {
    const xp: Record<string, number> = {};
    let rejected = 0;
    if (typeof value !== 'object' || value === null) {
        return { xp, rejected: 1 };
    }
    for (const [key, amount] of Object.entries(value as Record<string, unknown>)) {
        const stat = Number(key);
        if (Number.isInteger(stat) && stat >= 0 && stat < CANDY_STAT_COUNT && typeof amount === 'number' && Number.isSafeInteger(amount) && amount > 0) {
            xp[String(stat)] = amount;
        } else {
            rejected++;
        }
    }
    return { xp, rejected };
}

/**
 * Re-validates every field of a parsed ledger, the way readBankFile does, and REPORTS what it had
 * to drop rather than dropping it silently. The store turns a non-zero `rejected` into a suspended
 * write for that owner, because a partially readable ledger is a partial loss of experience the
 * player earned and cannot earn again.
 *
 * TWO GRAINS, on purpose. A row whose CLOCK is unreadable is dropped whole: without startedAt and
 * expiresAt there is no hour to run and no way to seal it. A row whose clock is fine but whose xp
 * map lost an entry is KEPT, with the surviving entries, and the loss is counted. Dropping it
 * instead would end a live recording the player cannot restart, and since a non-zero count has
 * already suspended writes for this owner, nothing overwrites the file while an operator looks at
 * it. `filled` rows follow the same rule for the same reason.
 *
 * A schema version this build does not know THROWS. The bank clamps an unusable version to 0
 * because a bank's version is a counter and 0 is a safe restart; a schema version is a statement
 * about the shape of the file, and guessing at a shape written by a newer build is how a ledger
 * gets rewritten into a lossier form.
 */
export function validateLedger(parsed: unknown): { file: CandyLedgerFile; rejected: number } {
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('candy ledger is not an object');
    }
    const raw = parsed as Partial<CandyLedgerFile>;
    if (raw.version !== CANDY_FILE_VERSION) {
        throw new Error(`candy ledger version ${String(raw.version)} is not ${CANDY_FILE_VERSION}`);
    }

    const file = emptyLedger();
    let rejected = 0;

    const recordings = typeof raw.recordings === 'object' && raw.recordings !== null ? raw.recordings : {};
    for (const [character, value] of Object.entries(recordings)) {
        const row = value as Partial<CandyRecording> | null;
        if (!row || !Number.isSafeInteger(row.startedAt) || !Number.isSafeInteger(row.expiresAt)) {
            rejected++;
            continue;
        }
        const { xp, rejected: bad } = validXp(row.xp);
        rejected += bad;
        file.recordings[character] = { startedAt: row.startedAt!, expiresAt: row.expiresAt!, xp };
    }

    for (const value of Array.isArray(raw.filled) ? raw.filled : []) {
        const row = value as Partial<CandyFilled> | null;
        if (!row || typeof row !== 'object' || !Number.isSafeInteger(row.sealedAt) || typeof row.character !== 'string') {
            rejected++;
            continue;
        }
        const { xp, rejected: bad } = validXp(row.xp);
        rejected += bad;
        file.filled.push({ sealedAt: row.sealedAt!, character: row.character, xp });
    }

    if (Number.isSafeInteger(raw.pendingDelivery) && raw.pendingDelivery! >= 0) {
        file.pendingDelivery = raw.pendingDelivery!;
    } else if (raw.pendingDelivery !== undefined) {
        rejected++;
    }

    return { file, rejected };
}
```

- [ ] **Step 5: Run the tests and watch them pass**

```powershell
powershell -File scripts/engine-overlay.ps1
cd engine\server
npx tsx --test --test-force-exit src/idlescape/candyLedger.test.ts
```

Expected: PASS, nine cases.

- [ ] **Step 6: Verify**

```powershell
powershell -File scripts/line-ceiling.ps1
powershell -File scripts/engine-overlay.ps1
powershell -File scripts/engine-overlay.ps1 -Check
cd engine\server
npx tsc --noEmit
npx tsx --test --test-force-exit (Get-ChildItem 'src\idlescape\*.test.ts' | ForEach-Object { "src/idlescape/$($_.Name)" })
```

Expected: the ceiling passes (`candyLedger.ts` is about 200 lines and its suite about 150), the overlay applies with no drift, the engine typechecks with no output, and every engine suite passes.

- [ ] **Step 7: Add the manifest rows and commit**

`engine-custom/manifest.json` gains two `kind: "new"` rows with `baseSha256: null`, in the alphabetical block beside the other `src/idlescape/*` entries:

```json
    { "path": "src/idlescape/candyLedger.ts", "kind": "new", "baseSha256": null },
    { "path": "src/idlescape/candyLedger.test.ts", "kind": "new", "baseSha256": null }
```

`verify.ps1` fails on any manifest path git does not track, so the manifest edit and the `git add` are one commit, never two.

```bash
git add engine-custom/src/idlescape/types.ts \
        engine-custom/src/idlescape/candyLedger.ts \
        engine-custom/src/idlescape/candyLedger.test.ts \
        engine-custom/manifest.json
git -c core.safecrlf=false commit -m "feat(engine): the time candy ledger's pure arithmetic

candyLedger.ts holds seal timing, the FIFO pop and the validation, with no fs, no
engine imports and no clock of its own: every function that cares about time takes now.
That is what makes the section 6 invariant drivable exhaustively rather than by
observation.

Three conservation rules, each with a case that fails if it breaks: a seal moves one
recording into one row and never twice, nothing accrues at or after expiresAt however
late the read is, and a 0 XP hour still seals (plan ruling R2, decision D121).

validateLedger counts every field it refused instead of dropping it, and throws on a
schema version it does not know rather than guessing at the shape.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 3: The store file, and the two configuration values

The ledger's disk half, mirroring `ownerBankFile.ts` exactly: read with re-validation, quarantine what cannot be read, write `<target>.tmp` then rename. Plus the two config values ruling R7 requires, because the store needs a directory and the seal needs an hour.

**Files:**
- Create: `engine-custom/src/idlescape/candyLedgerFile.ts`
- Create: `engine-custom/src/idlescape/candyLedgerFile.test.ts`
- Modify: `engine-custom/src/idlescape/config.ts` (`IdlescapeConfig`, `FileShape`, the returned object)
- Modify: `engine-custom/src/idlescape/config.test.ts` (two cases)
- Modify: `engine-custom/.env.example` (two rows)
- Modify: `engine-custom/manifest.json` (two `new` rows)
- Test: `engine-custom/src/idlescape/candyLedgerFile.test.ts`, `engine-custom/src/idlescape/config.test.ts`

**Interfaces:**
- Consumes: Task 2's `validateLedger`, `emptyLedger`, `CandyLedgerFile`.
- Produces, from `#/idlescape/candyLedgerFile.js`:
  - `interface CandyFileRead { file: CandyLedgerFile; rejected: number }`
  - `function readLedgerFile(path: string): CandyFileRead` (throws on JSON the parser cannot read at all)
  - `function quarantineLedgerPath(path: string): string`
  - `function writeLedgerFile(dir: string, target: string, payload: CandyLedgerFile): void`
- Produces, on `IdlescapeConfig`: `candyDir: string` and `candyHourMs: number`.

- [ ] **Step 1: Write the failing tests for the file half**

`engine-custom/src/idlescape/candyLedgerFile.test.ts`:

```ts
// fs only. The store class that uses this module is Task 4; this file proves the three
// properties the owner bank's file half already has, because a candy ledger loses experience a
// player cannot earn again and a bank write is usually re-derivable from the .sav.
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { emptyLedger } from './candyLedger.js';
import { quarantineLedgerPath, readLedgerFile, writeLedgerFile } from './candyLedgerFile.js';

let scratch = '';
before(() => { scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'idlescape-candy-file-')); });
after(() => { fs.rmSync(scratch, { recursive: true, force: true }); });

test('a written ledger reads back identically, and the directory is created on demand', () => {
    const dir = path.join(scratch, 'nested', 'candies');
    const target = path.join(dir, 'ownerA.json');
    const file = emptyLedger();
    file.recordings.zezima = { startedAt: 1, expiresAt: 2, xp: { '10': 5 } };
    file.filled.push({ sealedAt: 3, character: 'zezima', xp: { '7': 9 } });
    file.pendingDelivery = 1;

    writeLedgerFile(dir, target, file);
    const read = readLedgerFile(target);
    assert.equal(read.rejected, 0);
    assert.deepEqual(read.file, file);
});

test('the write leaves no .tmp behind and never a half-written file', () => {
    const target = path.join(scratch, 'ownerB.json');
    writeLedgerFile(scratch, target, emptyLedger());
    assert.equal(fs.existsSync(`${target}.tmp`), false);
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(target, 'utf8')));
});

test('a partially unreadable ledger keeps what it can and counts what it refused', () => {
    const target = path.join(scratch, 'ownerC.json');
    fs.writeFileSync(target, JSON.stringify({
        version: 1,
        recordings: { good: { startedAt: 1, expiresAt: 2, xp: {} }, bad: { startedAt: 'nope', expiresAt: 2, xp: {} } },
        filled: [],
        pendingDelivery: 0
    }));
    const read = readLedgerFile(target);
    assert.equal(read.rejected, 1);
    assert.equal(Object.keys(read.file.recordings).length, 1);
});

test('a ledger the parser cannot read at all throws, so the store can quarantine it', () => {
    const target = path.join(scratch, 'ownerD.json');
    fs.writeFileSync(target, '{ not json');
    assert.throws(() => readLedgerFile(target));
});

test('a quarantine name is unique, and carries no colon Windows would refuse', () => {
    const target = path.join(scratch, 'ownerE.json');
    fs.writeFileSync(target, '{ not json');
    const first = quarantineLedgerPath(target);
    assert.match(path.basename(first), /^ownerE\.json\..*\.corrupt$/);
    assert.equal(path.basename(first).includes(':'), false);

    fs.renameSync(target, first);
    fs.writeFileSync(target, '{ still not json');
    const second = quarantineLedgerPath(target);
    assert.notEqual(second, first, 'a second corruption must not overwrite the first quarantine');
});
```

- [ ] **Step 2: Run them and watch them fail**

```powershell
powershell -File scripts/engine-overlay.ps1
cd engine\server
npx tsx --test --test-force-exit src/idlescape/candyLedgerFile.test.ts
```

Expected: FAIL, `Cannot find module ... candyLedgerFile.js`.

- [ ] **Step 3: Write the module**

`engine-custom/src/idlescape/candyLedgerFile.ts`:

```ts
/**
 * The on-disk half of the candy ledger: `<candyDir>/<ownerKey>.json`, beside `data/banks/`.
 *
 * A deliberate mirror of ownerBankFile.ts, and a separate FILE rather than a key inside the bank
 * file. The bank file's schema is a data contract the front server mirrors (server/src/types.ts
 * carries BankSlotDto), and putting candy state inside it would put a recording behind the bank's
 * version number and behind its noWrite suspension, so a quarantined bank would freeze an
 * unrelated hour of training. The cost of the split is two files per owner and two writes on a
 * seal; the order of those two writes is the invariant, and candy.ts states it.
 *
 * `fs` is used through the module namespace on purpose, so a test can mock writeFileSync and
 * renameSync and still see these calls.
 */
import fs from 'node:fs';

import { validateLedger } from './candyLedger.js';
import type { CandyLedgerFile } from './types.js';

/** What readLedgerFile recovered, plus how many fields it REFUSED. A non-zero count is a loss. */
export interface CandyFileRead {
    file: CandyLedgerFile;
    rejected: number;
}

/**
 * Reads one owner's ledger, re-validating every field. Throws on JSON the parser cannot read at
 * all and on a schema version this build does not know: the store answers both with the
 * quarantine, which is the only response that keeps the operator's copy of what the owner earned.
 */
export function readLedgerFile(file: string): CandyFileRead {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return validateLedger(parsed);
}

/**
 * `<file>.<ISO timestamp>.corrupt`, with the colons replaced (Windows forbids them in a path).
 * A fixed name would let a second corruption overwrite the first quarantine, which is the very
 * copy the owner would be restored from; the counter suffix covers two inside one millisecond.
 */
export function quarantineLedgerPath(file: string): string {
    const stamp = new Date().toISOString().replace(/:/g, '-');
    let candidate = `${file}.${stamp}.corrupt`;
    for (let n = 1; fs.existsSync(candidate); n++) {
        candidate = `${file}.${stamp}-${n}.corrupt`;
    }
    return candidate;
}

/** Atomic: `<target>.tmp` then a rename over `<target>`, so a crash leaves no half-written ledger. */
export function writeLedgerFile(dir: string, target: string, payload: CandyLedgerFile): void {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
    fs.renameSync(tmp, target); // atomic replace
}
```

- [ ] **Step 4: Add the two config values**

In `engine-custom/src/idlescape/config.ts`, add to `IdlescapeConfig` (after `bankDir`):

```ts
    candyDir: string;
    candyHourMs: number;
```

to `FileShape`:

```ts
    candyDir?: unknown;
    candyHourMs?: unknown;
```

a reader beside the existing `asString` and `asBool` helpers:

```ts
/**
 * A positive integer with a floor. Anything unreadable or below the floor answers the fallback,
 * which follows the house rule at the production check below: refuse a bad value loudly rather
 * than quietly running with it. The resolved value is printed at install time.
 */
function asMillis(value: unknown, fallback: number, floor: number): number {
    const n = typeof value === 'string' ? Number.parseInt(value, 10) : value;
    if (typeof n === 'number' && Number.isSafeInteger(n) && n >= floor) {
        return n;
    }
    return fallback;
}
```

and to the returned object, after `bankDir`:

```ts
        // Beside the banks, never inside them: see candyLedgerFile.ts's header. The default
        // resolves INSIDE the container image, so the deployed stack must point it at the same
        // volume the banks live on (decision D74's reasoning, applied a second time).
        candyDir: asString(env.IDLESCAPE_CANDY_DIR, asString(file.candyDir, 'data/candies')),
        // The recorded hour, in milliseconds. Configurable because the hour is wall clock and
        // deliberately uncancellable, so with a hardcoded 3,600,000 no browser-level test of a
        // seal or a redemption can exist at all (plan ruling R7). Floored at CANDY_HOUR_MS_FLOOR
        // and printed at install time, so a wrong value is visible in the engine's first log
        // lines rather than discovered from player behaviour.
        candyHourMs: asMillis(env.IDLESCAPE_CANDY_HOUR_MS, asMillis(file.candyHourMs, 3_600_000, CANDY_HOUR_MS_FLOOR), CANDY_HOUR_MS_FLOOR),
```

with `import { CANDY_HOUR_MS_FLOOR } from './types.js';` added to the imports.

- [ ] **Step 5: Write the config cases**

Append to `engine-custom/src/idlescape/config.test.ts`:

```ts
test('the candy directory and hour default, and the env wins over the file', () => {
    const d = loadIdlescapeConfig({}, null, false);
    assert.equal(d.candyDir, 'data/candies');
    assert.equal(d.candyHourMs, 3_600_000);

    const f = loadIdlescapeConfig({}, JSON.stringify({ candyDir: '/srv/candies', candyHourMs: 5000 }), false);
    assert.equal(f.candyDir, '/srv/candies');
    assert.equal(f.candyHourMs, 5000);

    const e = loadIdlescapeConfig({ IDLESCAPE_CANDY_DIR: '/env/candies', IDLESCAPE_CANDY_HOUR_MS: '2000' }, JSON.stringify({ candyDir: '/srv/candies', candyHourMs: 5000 }), false);
    assert.equal(e.candyDir, '/env/candies');
    assert.equal(e.candyHourMs, 2000);
});

test('an hour below the floor, or unreadable, falls back rather than running with it', () => {
    // Zero would make every recording seal on the tick it started, which is a silent way to
    // destroy the item. The floor is what stops a typo doing that.
    assert.equal(loadIdlescapeConfig({ IDLESCAPE_CANDY_HOUR_MS: '0' }, null, false).candyHourMs, 3_600_000);
    assert.equal(loadIdlescapeConfig({ IDLESCAPE_CANDY_HOUR_MS: '-1' }, null, false).candyHourMs, 3_600_000);
    assert.equal(loadIdlescapeConfig({ IDLESCAPE_CANDY_HOUR_MS: 'soon' }, null, false).candyHourMs, 3_600_000);
    assert.equal(loadIdlescapeConfig({ IDLESCAPE_CANDY_HOUR_MS: '1000' }, null, false).candyHourMs, 1000);
});
```

- [ ] **Step 6: Add the `.env.example` rows**

`config.test.ts:84` asserts by regex that `.env.example` documents every `env.NAME` `config.ts` reads, so this is not optional and the suite will say so. Append to `engine-custom/.env.example`:

```
# Where time candy ledgers live, one JSON file per owner key, beside the owner banks. The default
# resolves INSIDE the container image, so the deployed stack sets /opt/engine/data/candies onto the
# same volume the banks use: without it a container replace discards every recorded hour, which is
# experience a player earned and cannot earn again.
IDLESCAPE_CANDY_DIR=data/candies

# The length of a time candy recording, in milliseconds. Default 3600000, floor 1000. Exists so a
# Playwright spec can prove a seal and a redemption without waiting an hour; shortening it on a
# live world devalues the item, so the resolved value is printed on every engine start.
IDLESCAPE_CANDY_HOUR_MS=3600000
```

- [ ] **Step 7: Run both suites and watch them pass**

```powershell
powershell -File scripts/engine-overlay.ps1
cd engine\server
npx tsx --test --test-force-exit src/idlescape/candyLedgerFile.test.ts src/idlescape/config.test.ts
```

Expected: PASS. If the `.env.example` case fails, it will name the variable that is undocumented; add its row rather than relaxing the case.

- [ ] **Step 8: Add the manifest rows**

`engine-custom/manifest.json` gains two `kind: "new"` rows with `baseSha256: null`, in the alphabetical block beside the other `src/idlescape/*` entries:

```json
    { "path": "src/idlescape/candyLedgerFile.ts", "kind": "new", "baseSha256": null },
    { "path": "src/idlescape/candyLedgerFile.test.ts", "kind": "new", "baseSha256": null }
```

`config.ts`, `config.test.ts` and `.env.example` are already listed and their rows do not change. This is a step of its own because `scripts/engine-overlay.ps1` copies every real file under the overlay's subdirectories whether or not the manifest names it, printing only a note for the unlisted, so nothing goes red at apply time; what goes red is `verify.ps1`, later, and only for the reverse case. An overlay file with no manifest row is exactly the silent omission this plan's own Global Constraint forbids.

- [ ] **Step 9: Verify and commit**

```powershell
powershell -File scripts/line-ceiling.ps1
powershell -File scripts/engine-overlay.ps1
powershell -File scripts/engine-overlay.ps1 -Check
cd engine\server
npx tsc --noEmit
npx tsx --test --test-force-exit (Get-ChildItem 'src\idlescape\*.test.ts' | ForEach-Object { "src/idlescape/$($_.Name)" })
```

Expected: the ceiling passes (`config.ts` gains about 20 lines against a 400 ceiling; check its total in the ceiling output), no drift, a clean typecheck, every suite green.

```bash
git add engine-custom/src/idlescape/candyLedgerFile.ts \
        engine-custom/src/idlescape/candyLedgerFile.test.ts \
        engine-custom/src/idlescape/config.ts \
        engine-custom/src/idlescape/config.test.ts \
        engine-custom/.env.example \
        engine-custom/manifest.json
git -c core.safecrlf=false commit -m "feat(engine): the candy ledger's file half and its two config values

data/candies/<ownerKey>.json, beside data/banks/ and never inside it: the bank file is a
contract the front server mirrors, and a candy row inside it would sit behind the bank's
version number and its noWrite suspension, so a quarantined bank would freeze an
unrelated recording.

Atomic tmp-then-rename, a unique quarantine name per corruption, and a read that counts
every field it refused rather than dropping it. A schema version this build does not
know throws instead of guessing at the shape.

IDLESCAPE_CANDY_DIR and IDLESCAPE_CANDY_HOUR_MS, read the way bankDir is, with the hour
floored at 1000 ms so a typo cannot seal every recording on the tick it starts. The hour
is configurable because it is wall clock and uncancellable, so a hardcoded one leaves the
entry with no browser-level proof at all (plan ruling R7, decision D124).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 4: The recording lifecycle: Record, the hour, the capture, the seal, the bank credit

The whole loop except redemption and the closed exits. At the end of this task a character can eat a blank candy, train for the configured hour, and find a full candy in the owner bank, and the ledger can be read back off disk after a restart.

**Files:**
- Create: `engine-custom/src/idlescape/candy.ts` (the store)
- Create: `engine-custom/src/idlescape/candy.test.ts`
- Create: `engine-custom/src/idlescape/candyOps.ts` (the held-op glue and the `addXp` patch installer)
- Create: `engine-custom/src/idlescape/candyOps.test.ts`
- Create: `engine-custom/src/network/game/client/handler/OpHeldHandler.ts` (a whole-file replacement, upstream plus four lines)
- Modify: `engine-custom/src/idlescape/install.ts` (five call sites: `flushCandies` inside `flushBanks`, the 100-tick branch routed through `flushBanks`, the seal sweep, the offline audit, and Patch 4; the file is 302 lines and must stay well under 400)
- Modify: `engine-custom/manifest.json` (four `new` rows, one `replace` row, and the `Player.ts` anchor's `why`)
- Modify: `engine-custom/PATCHES.md` (a runtime-patch section, a replacement section, five typed rows)
- Test: `engine-custom/src/idlescape/candy.test.ts`, `engine-custom/src/idlescape/candyOps.test.ts`

**Interfaces:**
- Consumes: Task 2's `candyLedger.js` exports; Task 3's `candyLedgerFile.js` exports and `idlescapeConfig.candyDir` / `idlescapeConfig.candyHourMs`; `ownerBanks()` and `notifyBankChanged()` from `./install.js`; `getOwnerKey()` from `./owner.js`; `OWNER_KEY_RE` from `./ownerBank.js`.
- Produces, from `#/idlescape/candy.js`:
  - `class CandyStore` with `constructor(dir: string, hourMs: number)`, and methods `seal(ownerKey: string, now?: number): number`, `startRecording(ownerKey: string, character: string, now?: number): 'started' | 'already' | 'unavailable'`, `accrue(ownerKey: string, character: string, stat: number, tenths: number, now?: number): void`, `peek(ownerKey: string, now?: number): CandyFilled | null`, `redeem(ownerKey: string, now?: number): CandyFilled | null`, `snapshot(ownerKey: string, now?: number): CandySnapshotDto`, `flush(): void`, `audit(ownerKey: string, bankCount: number): string | null`
  - **Every method that takes `now` defaults it to `Date.now()` and every one of them seals first**, `snapshot` included. A suite whose fixtures are stamped at a fixed `T0` must therefore pass a clock to the read as well as to the write, or the read seals the recording it was about to assert on. `audit` is the one exception: it reads what is there and seals nothing, which is why it takes no clock.
  - `interface CandySnapshotDto { ownerKey: string; recordings: Array<CandyRecording & { character: string }>; filled: CandyFilled[]; pendingDelivery: number }`
  - `function candyStore(): CandyStore` (the memoised singleton, created on first use so the packed cache is loaded first)
  - `function candyObjIds(): { blank: number; full: number }` (memoised, answers `-1` until `ObjType` is loaded)
- Produces, from `#/idlescape/candyOps.js`:
  - `function installCandyAccrual(): void` (Patch 4: the `Player.prototype.addXp` wrapper)
  - `function handleCandyHeldOp(player: Player, objId: number, slot: number, op: number): boolean` (answers `true` when the op was ours and the caller must not dispatch a trigger)
  - `function flushCandies(): void`

- [ ] **Step 1: Write the failing tests for the store**

`engine-custom/src/idlescape/candy.test.ts`. This suite touches the owner bank, so `install.js` is imported first and out of alphabetical order, exactly as `shared.test.ts` does it.

```ts
// install.js FIRST and out of group order: it is the module that opens the engine's circular
// module graph at World.js, and reaching World.js by any other route runs the overlay's install
// body while World's default export is still in its temporal dead zone. See install.ts's header.
import { flushBanks, installIdlescape, ownerBanks } from './install.js';

import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import InvType from '#/cache/config/InvType.js';
import ObjType from '#/cache/config/ObjType.js';

import { CandyStore, candyObjIds } from './candy.js';

const HOUR = 3_600_000;
const T0 = 1_757_160_000_000;

let scratch = '';
let bankScratch = '';

before(() => {
    // One directory for the whole file: the owner bank store is a module singleton created on the
    // first ownerBanks() call, so a per-test directory would only ever be read once anyway. Every
    // test below uses its own owner key instead. The candy store is constructed per test, which is
    // what lets a fresh one prove the file round-trips.
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'idlescape-candy-'));
    bankScratch = fs.mkdtempSync(path.join(os.tmpdir(), 'idlescape-candy-bank-'));
    process.env.IDLESCAPE_BANK_DIR = bankScratch;
    InvType.load('data/pack');
    ObjType.load('data/pack');
    installIdlescape();
});

after(() => {
    process.removeListener('exit', flushBanks);
    fs.rmSync(scratch, { recursive: true, force: true });
    fs.rmSync(bankScratch, { recursive: true, force: true });
});

function store(): CandyStore {
    return new CandyStore(scratch, HOUR);
}

test('the two candy objs resolve out of the packed cache', () => {
    // If this fails the cache was not rebuilt from the content overlay. Repack before reading
    // anything else in this file: powershell -File scripts/content-overlay.ps1, then
    // npx tsx tools/pack/BuildOverlay.ts from engine/server.
    const ids = candyObjIds();
    assert.equal(ids.blank, 3894);
    assert.equal(ids.full, 3895);
});

test('a recording starts, accrues, seals, and credits exactly one candy to the owner bank', () => {
    const s = store();
    const key = 'candyA';
    assert.equal(s.startRecording(key, 'zezima', T0), 'started');
    s.accrue(key, 'zezima', 10, 582_000, T0 + 60_000);
    s.accrue(key, 'zezima', 7, 41_000, T0 + 120_000);

    assert.equal(ownerBanks().get(key).getItemCount(candyObjIds().full), 0, 'nothing is credited before the hour is up');
    assert.equal(s.seal(key, T0 + HOUR - 1), 0);

    assert.equal(s.seal(key, T0 + HOUR), 1);
    assert.equal(ownerBanks().get(key).getItemCount(candyObjIds().full), 1);

    const snap = s.snapshot(key);
    assert.equal(snap.filled.length, 1);
    assert.deepEqual(snap.filled[0].xp, { '10': 582_000, '7': 41_000 });
    assert.equal(snap.pendingDelivery, 0);
    assert.equal(snap.recordings.length, 0);
});

test('a ledger entry without its candy fails the audit, and the audit corrects nothing', () => {
    const s = store();
    const key = 'candyB';
    s.startRecording(key, 'zezima', T0);
    s.seal(key, T0 + HOUR);
    assert.equal(s.audit(key, 1), null, 'one row, one candy in the bank, no complaint');

    // The mutation: the candy leaves the bank without an Eat. This is exactly the state the
    // invariant exists to notice, and noticing it must not be the same as fixing it.
    ownerBanks().get(key).remove(candyObjIds().full, 1);
    const alert = s.audit(key, 0);
    assert.notEqual(alert, null);
    assert.match(alert!, /candyB/);
    assert.equal(s.snapshot(key).filled.length, 1, 'the audit logs and never trims filled');
});

test('a candy without its ledger entry fails the audit too', () => {
    const s = store();
    const key = 'candyC';
    // A candy conjured straight into the bank, which is what a restored backup or a hand-edited
    // file looks like. The count is higher than the ledger, and that is an alert as well.
    ownerBanks().apply(key, null, [{ op: 'delta', obj: candyObjIds().full, count: 1 }]);
    const alert = s.audit(key, 1);
    assert.notEqual(alert, null);
    assert.match(alert!, /candyC/);
});

test('a full bank does not destroy the candy, it becomes a pending delivery that later drains', () => {
    const s = store();
    const key = 'candyD';
    // Fill every slot with a distinct obj so no stack absorbs the credit.
    const bank = ownerBanks().get(key);
    for (let slot = 0; slot < bank.capacity; slot++) {
        bank.set(slot, { id: 1000 + slot, count: 1 });
    }

    s.startRecording(key, 'zezima', T0);
    assert.equal(s.seal(key, T0 + HOUR), 1);
    let snap = s.snapshot(key);
    assert.equal(snap.filled.length, 1, 'the row exists even though the credit did not land');
    assert.equal(snap.pendingDelivery, 1);

    // The drain is the next read. Free a slot and read again.
    bank.delete(bank.capacity - 1);
    s.seal(key, T0 + HOUR + 1);
    snap = s.snapshot(key);
    assert.equal(snap.pendingDelivery, 0);
    assert.equal(bank.getItemCount(candyObjIds().full), 1);
    assert.equal(snap.filled.length, 1, 'draining moves a unit from pendingDelivery to the bank, and never touches filled');
});

test('sealing twice does not credit twice', () => {
    const s = store();
    const key = 'candyE';
    s.startRecording(key, 'zezima', T0);
    assert.equal(s.seal(key, T0 + HOUR), 1);
    assert.equal(s.seal(key, T0 + HOUR), 0);
    assert.equal(s.seal(key, T0 + HOUR * 10), 0);
    assert.equal(ownerBanks().get(key).getItemCount(candyObjIds().full), 1);
    assert.equal(s.snapshot(key).filled.length, 1);
});

test('a second Record on the same character is refused, and on another character is allowed', () => {
    const s = store();
    const key = 'candyF';
    assert.equal(s.startRecording(key, 'alice', T0), 'started');
    assert.equal(s.startRecording(key, 'alice', T0 + 5), 'already');
    assert.equal(s.startRecording(key, 'bob', T0 + 5), 'started');
    // The clock is passed to the READ as well. snapshot() seals before it reports, and T0 is a
    // fixed timestamp in the past, so a defaulted Date.now() here would seal both recordings and
    // report zero of them, having quietly credited two candies to the bank on the way.
    assert.equal(s.snapshot(key, T0 + 5).recordings.length, 2);
});

test('the ledger survives a flush and a fresh store, and an unknown key is not created by a read', () => {
    const key = 'candyG';
    const first = store();
    first.startRecording(key, 'zezima', T0);
    first.accrue(key, 'zezima', 3, 77, T0 + 1);
    first.flush();

    const second = store();
    const snap = second.snapshot(key, T0 + 2);
    assert.equal(snap.recordings.length, 1);
    assert.deepEqual(snap.recordings[0].xp, { '3': 77 });

    // A snapshot of a key with no file answers the empty shape and writes nothing (ruling R11).
    const unknown = second.snapshot('candyNobody');
    assert.deepEqual(unknown.filled, []);
    assert.equal(unknown.pendingDelivery, 0);
    assert.equal(fs.existsSync(path.join(scratch, 'candyNobody.json')), false);
});

test('an owner key that could become a path is refused before a filename is built', () => {
    const s = store();
    assert.throws(() => s.snapshot('../escape'), /owner key/);
    assert.throws(() => s.startRecording('a/b', 'zezima', T0), /owner key/);
});
```

- [ ] **Step 2: Run it and watch it fail**

```powershell
powershell -File scripts/engine-overlay.ps1
cd engine\server
npx tsx --test --test-force-exit src/idlescape/candy.test.ts
```

Expected: FAIL, `Cannot find module ... candy.js`. If instead it fails on `candyObjIds()` answering `-1`, the packed cache is stale: re-run Task 1 Step 11's pack.

- [ ] **Step 3: Write the store**

`engine-custom/src/idlescape/candy.ts`:

```ts
/**
 * The time candy ledger store: one file per owner, sealed lazily, credited to the owner bank.
 *
 * WHY A BEARER TOKEN AND A LEDGER AT ALL. Objs carry no per-instance data in this engine
 * (engine/Inventory.ts's Item is `{ id, count }`), and neither does the owner bank
 * (types.ts's BankSlotDto is `{ slot, obj, count }`). There is no third field to hang an hour of
 * experience on. So the payload lives here, keyed by owner, and a `time_candy_filled` item is an
 * interchangeable claim against the next row: which row a given item "is" never matters, which is
 * also why the item stacks.
 *
 * THE INVARIANT (design section 6):
 *
 *     filled.length == (full candies in the owner bank)
 *                    + (full candies in every one of that owner's character inventories)
 *                    + pendingDelivery
 *
 * `audit()` checks the always-checkable half of it: for an owner with no characters online, every
 * candy they hold must be in the bank, so `filled.length == bankCount + pendingDelivery`. A
 * mismatch is an ALERT and nothing is corrected. Trimming `filled` to an observed item count would
 * require counting offline characters' inventories, which nothing here can do, and a pass that ran
 * anyway would delete a candy sitting safely in an offline character's pack.
 *
 * ORDERING, which is the whole of the durability story. A seal writes the ledger row and THEN
 * credits the bank, so a crash between them leaves a row with no candy, which `audit` reports and
 * `pendingDelivery` retries. A redeem writes the ledger row's removal BEFORE granting the XP
 * (candyOps.ts), so a crash between them loses the grant and never duplicates it. Both directions
 * fail towards "the player is owed something", never towards "the item was duplicated".
 */
import fs from 'node:fs';
import path from 'node:path';

import ObjType from '#/cache/config/ObjType.js';

// Aliased on import: this class has methods of the same names, and an unaliased `startRecording`
// inside the class body would read as a recursive call to a reader skimming it.
import { accrue as accrueLedger, emptyLedger, popFilled, sealExpired, startRecording as startLedgerRecording } from './candyLedger.js';
import { quarantineLedgerPath, readLedgerFile, writeLedgerFile } from './candyLedgerFile.js';
import { idlescapeConfig } from './config.js';
import { notifyBankChanged, ownerBanks } from './install.js';
import { OWNER_KEY_RE } from './ownerBank.js';
import type { CandyFilled, CandyLedgerFile, CandyRecording } from './types.js';

export interface CandySnapshotDto {
    ownerKey: string;
    recordings: Array<CandyRecording & { character: string }>;
    filled: CandyFilled[];
    pendingDelivery: number;
}

interface Entry {
    file: CandyLedgerFile;
    dirty: boolean;
    /** Set when the ledger could not be read AND could not be quarantined. No write may follow. */
    noWrite: boolean;
}

let objIds: { blank: number; full: number } | null = null;

/**
 * The two obj ids, memoised. ObjType.getId answers -1 until the cache is loaded, and a -1 is never
 * cached: it is re-asked until the cache can answer. An engine started against a data/pack that
 * was not rebuilt from the content overlay would otherwise cache -1 for the life of the process
 * and quietly credit nothing.
 */
export function candyObjIds(): { blank: number; full: number } {
    if (!objIds || objIds.blank === -1 || objIds.full === -1) {
        objIds = { blank: ObjType.getId('time_candy'), full: ObjType.getId('time_candy_filled') };
    }
    return objIds;
}

export class CandyStore {
    private readonly entries = new Map<string, Entry>();
    /** One line per owner per failure kind, so a broken owner does not write a line per read. */
    private readonly warned = new Set<string>();

    constructor(
        private readonly dir: string,
        private readonly hourMs: number
    ) {}

    /** Refused before any path is built: the key becomes a filename. Same rule as the bank's. */
    private assertKey(ownerKey: string): void {
        if (!OWNER_KEY_RE.test(ownerKey)) {
            throw new Error(`bad owner key: ${JSON.stringify(ownerKey)}`);
        }
    }

    private fileFor(ownerKey: string): string {
        return path.join(this.dir, `${ownerKey}.json`);
    }

    private warnOnce(key: string, message: string): void {
        if (!this.warned.has(key)) {
            this.warned.add(key);
            console.error(message);
        }
    }

    /**
     * The one live ledger for an owner. A file that cannot be read is quarantined and the owner
     * starts empty; a quarantine that itself fails suspends writes for the life of the process,
     * because overwriting an unreadable ledger destroys the operator's only copy of what the
     * owner earned. A partially rejected read does the same: the count is a loss, not a shrug.
     */
    private entry(ownerKey: string): Entry {
        this.assertKey(ownerKey);
        const existing = this.entries.get(ownerKey);
        if (existing) {
            return existing;
        }

        const entry: Entry = { file: emptyLedger(), dirty: false, noWrite: false };
        const file = this.fileFor(ownerKey);
        if (fs.existsSync(file)) {
            try {
                const read = readLedgerFile(file);
                entry.file = read.file;
                if (read.rejected > 0) {
                    entry.noWrite = true;
                    this.warnOnce(`${ownerKey}:rejected`, `[idlescape] candy ledger for ${ownerKey} lost ${read.rejected} field(s) on read; writes are suspended for this owner until an operator looks at ${file}`);
                }
            } catch (err) {
                try {
                    const parked = quarantineLedgerPath(file);
                    fs.renameSync(file, parked);
                    this.warnOnce(`${ownerKey}:quarantine`, `[idlescape] candy ledger for ${ownerKey} was unreadable and is parked at ${parked}; starting empty:`);
                } catch (renameErr) {
                    entry.noWrite = true;
                    this.warnOnce(`${ownerKey}:noquarantine`, `[idlescape] candy ledger for ${ownerKey} is unreadable and could not be parked, so writes are suspended for this owner: ${String(renameErr)} (read error: ${String(err)})`);
                }
            }
        }
        this.entries.set(ownerKey, entry);
        return entry;
    }

    private persist(ownerKey: string, entry: Entry): void {
        if (entry.noWrite) {
            return;
        }
        try {
            writeLedgerFile(this.dir, this.fileFor(ownerKey), entry.file);
            entry.dirty = false;
        } catch (err) {
            this.warnOnce(`${ownerKey}:write`, `[idlescape] writing the candy ledger for ${ownerKey} failed; it will be retried on the next flush: ${String(err)}`);
        }
    }

    /**
     * Seals every expired recording, credits one full candy per sealed row to the owner bank, and
     * drains any credit that failed earlier. Returns how many rows sealed on THIS call, which is
     * zero on every read after the first: sealing is idempotent.
     *
     * The ledger is written BEFORE the bank credit is attempted, so a crash between them leaves a
     * row with no candy rather than a candy with no row. The first is visible to `audit` and is
     * retried by `pendingDelivery`; the second is a duplicated item.
     */
    seal(ownerKey: string, now: number = Date.now()): number {
        const entry = this.entry(ownerKey);
        const sealed = sealExpired(entry.file, now);
        const owed = sealed.length + entry.file.pendingDelivery;
        if (sealed.length > 0) {
            entry.file.pendingDelivery += sealed.length;
            this.persist(ownerKey, entry);
        }
        if (owed > 0) {
            this.deliver(ownerKey, entry);
        }
        return sealed.length;
    }

    /**
     * Credits pending candies to the owner bank, one at a time, and stops at the first refusal.
     *
     * `full` clears when the player banks something; `unavailable` clears only when an operator
     * fixes a bank file. Both stay pending rather than destroying the candy (plan ruling R13), and
     * they are logged differently on purpose: silently retrying an unavailable forever is the
     * failure mode audit C07 and decision D115 exist to prevent.
     */
    private deliver(ownerKey: string, entry: Entry): void {
        const full = candyObjIds().full;
        if (full === -1) {
            this.warnOnce(`${ownerKey}:noobj`, '[idlescape] time_candy_filled is not in this pack, so no candy can be credited. The cache was not rebuilt from the content overlay.');
            return;
        }
        while (entry.file.pendingDelivery > 0) {
            const outcome = ownerBanks().apply(ownerKey, null, [{ op: 'delta', obj: full, count: 1 }]);
            if (!outcome.ok) {
                if (outcome.reason === 'unavailable') {
                    this.warnOnce(`${ownerKey}:bankdown`, `[idlescape] ${ownerKey} has ${entry.file.pendingDelivery} sealed candy(s) that cannot be banked: the owner bank has suspended writes. This clears only when an operator repairs that bank file.`);
                } else {
                    this.warnOnce(`${ownerKey}:bankfull`, `[idlescape] ${ownerKey} has ${entry.file.pendingDelivery} sealed candy(s) waiting for bank space (${outcome.reason}). This clears by itself when a slot frees up.`);
                }
                return;
            }
            entry.file.pendingDelivery -= 1;
            this.persist(ownerKey, entry);
            notifyBankChanged(ownerKey, outcome.version);
        }
    }

    /** Seals first, so an hour that ended while the character was away is already banked. */
    startRecording(ownerKey: string, character: string, now: number = Date.now()): 'started' | 'already' | 'unavailable' {
        this.seal(ownerKey, now);
        const entry = this.entry(ownerKey);
        if (entry.noWrite) {
            return 'unavailable';
        }
        const outcome = startLedgerRecording(entry.file, character, now, this.hourMs);
        if (outcome === 'started') {
            this.persist(ownerKey, entry);
        }
        return outcome;
    }

    /**
     * One experience grant. In memory with a dirty flag: this runs several times a second per
     * online player, so a write per grant is not affordable. The residue is recorded in
     * PATCHES.md: a hard kill loses at most the accrual since the last 100-tick flush.
     */
    accrue(ownerKey: string, character: string, stat: number, tenths: number, now: number = Date.now()): void {
        const entry = this.entry(ownerKey);
        if (accrueLedger(entry.file, character, stat, tenths, now)) {
            entry.dirty = true;
        }
    }

    /** The oldest sealed row, without consuming it. `Check` reads this. */
    peek(ownerKey: string, now: number = Date.now()): CandyFilled | null {
        this.seal(ownerKey, now);
        return this.entry(ownerKey).file.filled[0] ?? null;
    }

    /**
     * Pops the oldest sealed row and PERSISTS before returning, so the caller can grant the XP
     * knowing the row is gone from disk. A crash after this and before the grant costs the player
     * the hour; a crash the other way round would let them eat it twice.
     */
    redeem(ownerKey: string, now: number = Date.now()): CandyFilled | null {
        this.seal(ownerKey, now);
        const entry = this.entry(ownerKey);
        if (entry.noWrite || entry.file.filled.length === 0) {
            return null;
        }
        const row = popFilled(entry.file);
        this.persist(ownerKey, entry);
        return row;
    }

    /**
     * A read-only view for the management route and the suites. A key with no file answers the
     * empty shape and does NOT create or cache an entry, so a polled route cannot grow the map
     * without bound (plan ruling R11). The caller cannot distinguish "no such owner" from "an
     * owner with nothing", which is the right trade for a loopback diagnostic.
     */
    snapshot(ownerKey: string, now: number = Date.now()): CandySnapshotDto {
        this.assertKey(ownerKey);
        if (!this.entries.has(ownerKey) && !fs.existsSync(this.fileFor(ownerKey))) {
            return { ownerKey, recordings: [], filled: [], pendingDelivery: 0 };
        }
        this.seal(ownerKey, now);
        const file = this.entry(ownerKey).file;
        return {
            ownerKey,
            recordings: Object.entries(file.recordings).map(([character, r]) => ({ character, ...r })),
            filled: file.filled,
            pendingDelivery: file.pendingDelivery
        };
    }

    /**
     * The always-checkable half of the invariant, for an owner with NO characters online: every
     * candy they hold must be in the bank. Answers an alert sentence, or null when it holds.
     * Never corrects anything: see the header. Seals nothing either, so it takes no clock.
     *
     * install.ts calls this over the offline set once every 1500 ticks (ruling R14), so it must
     * not create an entry for a key it is merely asked about: the same no-create guard snapshot()
     * uses. An owner with a candy in the bank and no ledger at all still alerts, because the
     * empty ledger's zero rows against a non-zero bank count is exactly the mismatch to report.
     */
    audit(ownerKey: string, bankCount: number): string | null {
        this.assertKey(ownerKey);
        const known = this.entries.has(ownerKey) || fs.existsSync(this.fileFor(ownerKey));
        const file = known ? this.entry(ownerKey).file : emptyLedger();
        const expected = bankCount + file.pendingDelivery;
        if (file.filled.length === expected) {
            return null;
        }
        return `[idlescape] candy invariant broken for ${ownerKey}: ${file.filled.length} sealed row(s) against ${bankCount} banked candy(s) plus ${file.pendingDelivery} pending. Nothing has been corrected; this is an alert.`;
    }

    /** Writes every dirty ledger. Synchronous fs throughout, so it is legal in an exit handler. */
    flush(): void {
        for (const [ownerKey, entry] of this.entries) {
            if (entry.dirty) {
                this.persist(ownerKey, entry);
            }
        }
    }
}

let store: CandyStore | null = null;

/** The one candy store; created lazily so the packed cache is loaded before it resolves obj ids. */
export function candyStore(): CandyStore {
    if (!store) {
        const hour = Number(process.env.IDLESCAPE_CANDY_HOUR_MS);
        store = new CandyStore(
            process.env.IDLESCAPE_CANDY_DIR ?? idlescapeConfig.candyDir,
            Number.isSafeInteger(hour) && hour >= CANDY_HOUR_MS_FLOOR ? hour : idlescapeConfig.candyHourMs
        );
    }
    return store;
}
```

with `CANDY_HOUR_MS_FLOOR` added to the `./types.js` import.

Two things about this module that are easy to get wrong.

**Both env reads in `candyStore()` are deliberate, and they re-read what `idlescapeConfig` already read.** `install.ts:77` reads `IDLESCAPE_BANK_DIR` a second time for exactly the same reason: `idlescapeConfig` is built at module load, the store is a module singleton created on the first call, and a suite's `before` hook runs after both, so a second read here is the only way to point either at a fixture. The hour keeps the same floor the config applies, so this is not a second policy, only a second read.

**`candy.ts` imports from `install.js`, which imports `candyOps.js`, which imports `candy.js`.** That cycle is fine and it is fine for one specific reason: `ownerBanks` and `notifyBankChanged` are hoisted **function declarations**, and `candy.ts` calls them only from inside methods, never at module evaluation time. Do not turn either into a `const` arrow, and do not add a top-level statement to `candy.ts` that calls one, or this module reaches them inside their temporal dead zone and the engine dies at load with the `ReferenceError` `install.ts`'s header describes. The probe is `npx tsx -e "import '#/idlescape/candy.js'"` from `engine/server` with the overlay applied.

- [ ] **Step 4: Run the store suite and watch it pass**

```powershell
cd engine\server
npx tsx --test --test-force-exit src/idlescape/candy.test.ts
```

Expected: PASS, nine cases.

- [ ] **Step 5: Write the failing tests for the accrual patch and the Record op**

`engine-custom/src/idlescape/candyOps.test.ts`:

```ts
// install.js first, for the module-graph reason in its header. This suite drives the real
// Player.addXp through the real patch, because the patch's whole job is to observe what addXp
// actually did rather than to recompute it.
import { flushBanks, installIdlescape } from './install.js';

import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import InvType from '#/cache/config/InvType.js';
import ObjType from '#/cache/config/ObjType.js';
import Player from '#/engine/entity/Player.js';
import Environment from '#/util/Environment.js';
import { toBase37 } from '#/util/JString.js';

import { candyObjIds, candyStore } from './candy.js';
import { handleCandyHeldOp } from './candyOps.js';
import { setOwnerKey } from './owner.js';

let scratch = '';
let bankScratch = '';

before(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'idlescape-candyops-'));
    bankScratch = fs.mkdtempSync(path.join(os.tmpdir(), 'idlescape-candyops-bank-'));
    process.env.IDLESCAPE_BANK_DIR = bankScratch;
    process.env.IDLESCAPE_CANDY_DIR = scratch;
    InvType.load('data/pack');
    ObjType.load('data/pack');
    installIdlescape();
});

after(() => {
    process.removeListener('exit', flushBanks);
    delete process.env.IDLESCAPE_CANDY_DIR;
    fs.rmSync(scratch, { recursive: true, force: true });
    fs.rmSync(bankScratch, { recursive: true, force: true });
});

function stamped(name: string, ownerKey: string): Player {
    const n37 = toBase37(name);
    const player = new Player(name, n37, n37);
    setOwnerKey(player, ownerKey);
    return player;
}

test('Record consumes one blank candy and starts an hour on that character', () => {
    const player = stamped('recorder', 'opsA');
    player.invAdd(InvType.getId('inv'), candyObjIds().blank, 2);

    const handled = handleCandyHeldOp(player, candyObjIds().blank, 0, 1);
    assert.equal(handled, true, 'the handler must claim the op so no trigger is dispatched');
    assert.equal(player.getInventory(InvType.getId('inv'))!.getItemCount(candyObjIds().blank), 1, 'exactly one blank is consumed');
    assert.equal(candyStore().snapshot('opsA').recordings.length, 1);
});

test('a second Record is refused and the blank candy is KEPT', () => {
    const player = stamped('recorder2', 'opsB');
    const inv = InvType.getId('inv');
    player.invAdd(inv, candyObjIds().blank, 2);
    handleCandyHeldOp(player, candyObjIds().blank, 0, 1);
    assert.equal(player.getInventory(inv)!.getItemCount(candyObjIds().blank), 1);

    handleCandyHeldOp(player, candyObjIds().blank, 0, 1);
    assert.equal(player.getInventory(inv)!.getItemCount(candyObjIds().blank), 1, 'a refused Record must not eat the candy');
    assert.equal(candyStore().snapshot('opsB').recordings.length, 1);
});

test('the addXp patch records exactly what addXp added, and the player still receives it live', () => {
    const player = stamped('trainer', 'opsC');
    player.invAdd(InvType.getId('inv'), candyObjIds().blank, 1);
    handleCandyHeldOp(player, candyObjIds().blank, 0, 1);

    const before = player.stats[10];
    player.addXp(10, 500);
    const delta = player.stats[10] - before;
    assert.ok(delta > 0, 'the grant still lands live: recording duplicates experience, it does not divert it');

    const xp = candyStore().snapshot('opsC').recordings[0].xp;
    assert.equal(xp['10'], delta, 'the recorded amount is the observed stats delta, not a recomputed xp * xpRate');
});

test('the recorded amount tracks a non-1 xpRate through the real multiplier', () => {
    const rate = Environment.node.xpRate;
    try {
        (Environment.node as { xpRate: number }).xpRate = 5;
        const player = stamped('trainer2', 'opsD');
        player.invAdd(InvType.getId('inv'), candyObjIds().blank, 1);
        handleCandyHeldOp(player, candyObjIds().blank, 0, 1);

        const before = player.stats[10];
        player.addXp(10, 100);
        const delta = player.stats[10] - before;
        assert.equal(delta, 500);
        assert.equal(candyStore().snapshot('opsD').recordings[0].xp['10'], 500);
    } finally {
        (Environment.node as { xpRate: number }).xpRate = rate;
    }
});

test('allowMulti false, xp zero, and a character with no recording all record nothing', () => {
    const player = stamped('trainer3', 'opsE');
    player.invAdd(InvType.getId('inv'), candyObjIds().blank, 1);

    // No recording yet.
    player.addXp(10, 100);
    assert.deepEqual(candyStore().snapshot('opsE').recordings, []);

    handleCandyHeldOp(player, candyObjIds().blank, 0, 1);
    // allowMulti false is ::advancestat (ClientCheatHandler.ts:483, the ONLY cheat that reaches
    // addXp at all) and the redemption replay. ::setstat sets the level directly and never gets
    // here; the cheat that DOES record is the content debugproc ::~addxp, which goes through
    // stat_advance and therefore PlayerOps.ts:816 with allowMulti defaulted true.
    player.addXp(10, 100, false);
    player.addXp(10, 0);
    assert.deepEqual(candyStore().snapshot('opsE').recordings[0].xp, {}, 'an unmultiplied or zero grant is not the player training');
});

test('an unstamped player accrues nothing rather than throwing', () => {
    // A player with no owner key is a dev world with requireOwner off. There is no ledger to
    // write to and that must be silent, not an exception inside addXp.
    const n37 = toBase37('nokey');
    const player = new Player('nokey', n37, n37);
    assert.doesNotThrow(() => player.addXp(10, 100));
});

test('the recording belongs to the character, not the owner (design ruling 4)', () => {
    const alice = stamped('alice', 'opsF');
    const bob = stamped('bob', 'opsF');
    alice.invAdd(InvType.getId('inv'), candyObjIds().blank, 1);
    handleCandyHeldOp(alice, candyObjIds().blank, 0, 1);

    alice.addXp(10, 100);
    bob.addXp(10, 100);

    const snap = candyStore().snapshot('opsF');
    assert.equal(snap.recordings.length, 1);
    assert.equal(snap.recordings[0].character, 'alice');
    assert.ok(snap.recordings[0].xp['10'] > 0);
    // If this ever fails, an owner running five characters funnels five streams into one candy,
    // which is a 5x rather than the 2x the item is meant to be.
});
```

- [ ] **Step 6: Run it and watch it fail**

```powershell
cd engine\server
npx tsx --test --test-force-exit src/idlescape/candyOps.test.ts
```

Expected: FAIL, `Cannot find module ... candyOps.js`.

- [ ] **Step 7: Write the ops module**

`engine-custom/src/idlescape/candyOps.ts`. At this task it handles op 1 on the blank candy only; Task 5 adds the drop refusal and Task 6 adds `Eat` and `Check`. Write the `switch` with those cases returning `false` for now, and a comment naming the task that fills each in, so the shape does not change twice.

```ts
/**
 * Everything the engine calls into for time candy: the accrual patch, and the held-op intercept
 * the replaced OpHeldHandler delegates to.
 *
 * This module exists so install.ts does not grow. install.ts is the module that must root the
 * engine's circular module graph (its own header) and it is 302 lines against a hard 400, so it
 * carries call sites and nothing else.
 */
import ObjType from '#/cache/config/ObjType.js';
import Player from '#/engine/entity/Player.js';
import InvType from '#/cache/config/InvType.js';

import { candyObjIds, candyStore } from './candy.js';
import { getOwnerKey } from './owner.js';

let installed = false;

/**
 * Patch 4: wrap Player.prototype.addXp, the single choke point for experience.
 *
 * WHY A DELTA AND NOT `xp * xpRate`. The design's pseudocode recomputes the amount, and its prose
 * promises the recorded number matches what addXp added to stats[stat]. Those are not the same:
 * Player.stats is an Int32Array so the store truncates; at the 200,000,000 cap the stat absorbs
 * only part of the grant; and xpRate can be fractional, because normalizeWorldConfig's mergeConfig
 * puts every numeric key through tryParseInt, which returns a value that is already a number
 * unchanged, so a JSON 1.5 reaches Environment.node.xpRate as 1.5. Reading stats[stat] before and
 * after the original call is correct under all three, and stays correct if upstream changes addXp.
 *
 * WHAT IS DELIBERATELY NOT RECORDED. `allowMulti: false` grants are skipped. That covers the
 * redemption replay itself, which is the one that matters: eating a candy must not record into the
 * recording that is running. It also covers ::advancestat, the only cheat that reaches addXp
 * (ClientCheatHandler.ts:483), which is why a test or an e2e spec that wants a grant RECORDED uses
 * the content debugproc ::~addxp instead: that one goes through stat_advance and PlayerOps.ts:816
 * with allowMulti defaulted true, exactly as ordinary training does.
 */
export function installCandyAccrual(): void {
    if (installed) {
        return;
    }
    installed = true;

    const upstreamAddXp = Player.prototype.addXp;
    Player.prototype.addXp = function (this: Player, stat: number, xp: number, allowMulti: boolean = true): void {
        // Read before, delegate, read after. The original throws on a negative xp and returns
        // early on zero, and both of those must keep happening exactly as they do upstream.
        const before = this.stats[stat];
        upstreamAddXp.call(this, stat, xp, allowMulti);
        if (!allowMulti) {
            return;
        }
        const delta = this.stats[stat] - before;
        if (delta <= 0) {
            return;
        }
        const ownerKey = getOwnerKey(this);
        if (ownerKey === null) {
            return;
        }
        try {
            candyStore().accrue(ownerKey, this.username, stat, delta);
        } catch (err) {
            // Never let a ledger fault break an experience grant: the player earned it and the
            // engine has already given it to them by the time this runs.
            console.error(`[idlescape] candy accrual failed for ${ownerKey}:`, err);
        }
    };
}

/** Flushes every dirty ledger, never throwing. Called from install.ts's flushBanks. */
export function flushCandies(): void {
    try {
        candyStore().flush();
    } catch (err) {
        console.error('[idlescape] flushing the candy ledgers on the way out failed:', err);
    }
}

/**
 * The held-op intercept, called by the replaced OpHeldHandler AFTER every one of its validation
 * checks and BEFORE it dispatches a script trigger. Answers true when the op was ours, in which
 * case the caller must not dispatch: op 5 has a catch-all [opheld5,_] trigger that would drop the
 * candy, which is the exit the ledger cannot survive.
 *
 * `slot` is already proven to hold `objId` by the caller (`inv.hasAt`), so nothing here re-checks
 * it, and `player.getInventory(inv)` is the character's own inventory, never the owner bank.
 */
export function handleCandyHeldOp(player: Player, objId: number, slot: number, op: number): boolean {
    const ids = candyObjIds();
    if (objId !== ids.blank && objId !== ids.full) {
        return false;
    }
    const ownerKey = getOwnerKey(player);
    if (ownerKey === null) {
        // A world with owner assertion off has no ledger to write to. Refuse rather than pretend:
        // consuming the candy with nowhere to record would destroy it.
        player.messageGame('Time candies only work on a world with accounts.');
        return true;
    }

    if (objId === ids.blank && op === 1) {
        return record(player, ownerKey, ids.blank);
    }
    // Task 5 fills in op 5 on the full candy (the Drop refusal).
    // Task 6 fills in op 1 (Eat) and op 2 (Check) on the full candy.
    return false;
}

/**
 * Record. Persist FIRST, consume the blank only after the ledger write succeeded (plan ruling
 * R10): the reverse order loses a candy to a failed write, and this order can at worst leave a
 * recording with no blank consumed, which cannot happen for an item the caller has already proven
 * is at that slot.
 */
function record(player: Player, ownerKey: string, blank: number): boolean {
    const outcome = candyStore().startRecording(ownerKey, player.username);
    if (outcome === 'already') {
        player.messageGame('You are already recording an hour. It cannot be stopped.');
        return true;
    }
    if (outcome === 'unavailable') {
        player.messageGame('Something is wrong with your time candy ledger. Nothing has been taken.');
        return true;
    }

    // invDel, NOT invDelSlot. `Player.invDelSlot(inv, slot)` takes two arguments and deletes the
    // WHOLE slot, which for a stack of blanks would destroy every one of them. invDel removes a
    // count, and `slot` is only used above to prove which item the packet meant.
    player.invDel(InvType.getId('inv'), blank, 1);
    player.messageGame('The candy starts remembering. Everything you learn for the next hour will be recorded.');
    player.addSessionLog(LoggerEventType.MODERATOR, `Record ${ObjType.get(blank).debugname}`);
    return true;
}
```

Add `import { LoggerEventType } from '#/server/logger/LoggerEventType.js';` to the imports. `slot` reaches `handleCandyHeldOp` and stops there. It is deliberately carried and never read: the caller has already proven with `inv.hasAt(slot, objId)` which item the packet meant, and every mutation below works on the obj and a count, so the parameter documents the packet's shape and leaves room for a future per-slot op. Do not thread it into the helpers, and do not go looking for a compiler complaint about it: `engine/server/tsconfig.json` sets `strict: true` and neither `noUnusedParameters` nor `noUnusedLocals`, so `npx tsc --noEmit` says nothing either way. Deleting it to tidy up only means re-adding it to the replaced `OpHeldHandler.ts` call site.

- [ ] **Step 8: Replace `OpHeldHandler.ts`**

Copy `engine/server/src/network/game/client/handler/OpHeldHandler.ts` to `engine-custom/src/network/game/client/handler/OpHeldHandler.ts` verbatim, then make exactly two edits: one import, and a four-line intercept placed between the session log (upstream `:61-63`) and the trigger lookup (upstream `:65`).

```ts
import { handleCandyHeldOp } from '#/idlescape/candyOps.js';
```

and, immediately before `const trigger: ServerTriggerType = ...`:

```ts
        // idlescape: time candy. Placed HERE and not in a prototype wrapper on purpose. It must
        // run after every validation above (delayed, the component is operable and visible, the
        // inventory is transmitted, validSlot, hasAt, iop) and before the dispatch below, because
        // op 5 has a catch-all [opheld5,_] trigger that would drop the candy and orphan its
        // ledger row. A wrapper can only run before or after the whole method, so it would have
        // to either skip the validation or let the drop happen. See engine-custom/PATCHES.md.
        if (handleCandyHeldOp(player, obj.id, slot, message.op)) {
            return true;
        }
```

- [ ] **Step 9: Install the patch, widen the flush, and give the lazy seal a reader, in `install.ts`**

Five edits, all of them call sites: the file is 302 lines against a hard 400 and every line of behaviour belongs in `candyOps.ts` or `candy.ts`. In `flushBanks()`, after the existing `ownerBanks().flush()` try/catch:

```ts
export function flushBanks(): void {
    try {
        ownerBanks().flush();
    } catch (err) {
        console.error('[idlescape] flushing the owner banks on the way out failed:', err);
    }
    // The candy ledgers ride the same three call sites rather than registering a fourth exit
    // handler, because shared.test.ts and installSweep.test.ts remove THIS function from the exit
    // listeners by name, and a second unnamed handler would re-create their scratch directories
    // on the way out. The name stays flushBanks for the same reason.
    flushCandies();
}
```

Then, in `afterCycle()`, **change the 100-tick branch from `banks.flush();` to `flushBanks();`**. This is the edit the widening above is worthless without: that branch is the only periodic flush in the process, it calls the store directly today, and leaving it would mean the candy ledgers reached disk on a seal, a `Record`, a redeem, a clean shutdown and nothing else. Decision D115 records that both stop paths went straight to `taskkill /T /F`, so the residue ruling R8 accepts would be the whole recording rather than sixty seconds of it. `flushBanks()` is idempotent and its first act is the bank flush this line already performed:

```ts
    if (World.currentTick % 100 === 0) {
        // flushBanks() and not banks.flush(): it is the same bank flush plus the candy ledgers,
        // and this is the ONLY periodic write in the process. See engine-custom/PATCHES.md,
        // "Patch 4", for the residue this bounds.
        flushBanks();
        for (const ownerKey of online.keys()) {
            // Ruling R14: sealing is lazy and every other reader of a ledger needs an item the
            // player has not been given yet, so without this an hour ends and nothing notices.
            // One read per online owner per minute, on the branch that was already writing.
            try {
                candyStore().seal(ownerKey);
            } catch (err) {
                console.error(`[idlescape] the candy seal sweep failed for ${ownerKey}:`, err);
            }
        }
    }
```

and, in the 1500-tick branch, audit the offline set **before** the eviction that discards it:

```ts
    if (World.currentTick % 1500 === 0) {
        // The design asks for an alert on the invariant and rules out a correction. This is the
        // only form of it that is always checkable: an owner with nobody online holds every candy
        // they own in the bank, so filled.length must equal the bank count plus pendingDelivery.
        // audit() creates no entry for a key it is merely asked about, and corrects nothing.
        const full = candyObjIds().full;
        for (const ownerKey of banks.loaded()) {
            if (online.has(ownerKey) || full === -1) {
                continue;
            }
            const alert = candyStore().audit(ownerKey, banks.get(ownerKey).getItemCount(full));
            if (alert !== null) {
                warnCandyInvariant(ownerKey, alert);
            }
        }
        banks.evict(key => online.has(key));
    }
```

with one more `logHookFailure`-shaped helper beside the others in `install.ts`, so a permanently broken owner writes one line rather than one every fifteen minutes:

```ts
/** One line per owner per process. A broken invariant is a standing condition, not an event. */
const candyInvariantWarned = new Set<string>();
function warnCandyInvariant(ownerKey: string, alert: string): void {
    if (!candyInvariantWarned.has(ownerKey)) {
        candyInvariantWarned.add(ownerKey);
        console.error(alert);
    }
}
```

`candyStore` and `candyObjIds` come from `./candy.js`. Both are called from inside functions and never at module evaluation time, which is the rule `candy.ts`'s own note states and the reason the import cycle is safe.

and in `installIdlescape()`, after Patch 3:

```ts
    // --- Patch 4: record experience into a live time candy -------------------
    // Player.prototype.addXp is the single choke point for experience, and Player.ts is an ANCHOR
    // in the manifest rather than a replacement, so this is a runtime patch like Patch 1. All of
    // its body is in candyOps.ts; this is the call site.
    installCandyAccrual();
```

with `import { flushCandies, installCandyAccrual } from './candyOps.js';` and `import { candyObjIds, candyStore } from './candy.js';` added, and the final `printInfo` extended:

```ts
    printInfo(`[idlescape] overlay active (requireOwner=${idlescapeConfig.requireOwner}, banks=${idlescapeConfig.bankDir}, candies=${idlescapeConfig.candyDir}, candyHour=${idlescapeConfig.candyHourMs}ms)`);
```

That last line is ruling R7's visibility promise: a shortened hour is in the engine's first log lines rather than discovered from player behaviour.

- [ ] **Step 10: Run both new suites and watch them pass**

```powershell
powershell -File scripts/engine-overlay.ps1
cd engine\server
npx tsx --test --test-force-exit src/idlescape/candy.test.ts src/idlescape/candyOps.test.ts
```

Expected: PASS. If `Record` reports the item was not consumed, check that `handleCandyHeldOp` is reached at all: `OpHeldHandler.ts` must be in `engine-custom/src/network/game/client/handler/` and listed in the manifest, or the overlay copied nothing.

- [ ] **Step 11: Add the manifest rows and the PATCHES sections**

`engine-custom/manifest.json`: four `kind: "new"` rows (`src/idlescape/candy.ts`, `candy.test.ts`, `candyOps.ts`, `candyOps.test.ts`), one `kind: "replace"` row:

```json
    { "path": "src/network/game/client/handler/OpHeldHandler.ts", "kind": "replace", "baseSha256": "3dfc3d38f59524b9891681e0165782a0b96a0c1f63f4e6054e43c4857975f3fb" }
```

and the existing `src/engine/entity/Player.ts` **anchor** row's `why` extended to name `addXp` alongside `getInventory`. Do not add a second anchor for the same file.

Take that hash the way the engine manifest has always been taken, and confirm it before writing it:

```bash
cd engine/server && git -c core.autocrlf=false show HEAD:src/network/game/client/handler/OpHeldHandler.ts | sha256sum
```

Expected: `3dfc3d38f59524b9891681e0165782a0b96a0c1f63f4e6054e43c4857975f3fb`. If it differs, the clone is not at the pinned revision; run `powershell -File scripts/start-stack.ps1` far enough to hit its clone-pin assertion, or re-run `scripts/setup.ps1`, rather than recording the number you got.

`engine-custom/PATCHES.md` gains two sections, in the file's existing voice, under the headings it already uses:

```markdown
### Patch 4: time candy accrual (`Player.prototype.addXp`)

`installCandyAccrual()` in `src/idlescape/candyOps.ts` wraps the engine's single experience choke
point. It reads `stats[stat]` before and after delegating and records the DIFFERENCE, not
`xp * xpRate`: `Player.stats` is an `Int32Array` so the store truncates, at the 200,000,000 cap the
stat absorbs only part of the grant, and `xpRate` can be fractional because `normalizeWorldConfig`'s
`mergeConfig` puts every numeric key through `tryParseInt`, which hands back a value that is already
a number unchanged. Grants with `allowMulti: false` are skipped, which excludes `::advancestat` (the
only cheat that reaches `addXp` at all) and the redemption replay itself.

Accrual is in memory with a dirty flag and rides the owner bank's three flush sites, because this
runs several times a second per online player. The 100-tick site was `banks.flush()` and now calls
`flushBanks()`, which is what makes "three sites" true for the candy store as well as the bank.
**The accepted residue:** a hard kill loses at most the accrual since the last 100-tick flush, about
sixty seconds. A seal and a redeem each write synchronously, because those two are the invariant's
boundary.

**Sealing has a reader.** The same 100-tick branch calls `candyStore().seal()` for every owner with
a character online, and the 1500-tick branch audits the offline set against the bank before it
evicts. Sealing is lazy and correct lazily, but every other reader of a ledger needs an item the
player has not been given yet, so without the sweep an hour would end and nothing in the process
would notice until an operator read the management route.

### Replacement: `src/network/game/client/handler/OpHeldHandler.ts`

Upstream plus one import and a four-line intercept, placed after every validation the handler does
and before its `ScriptProvider.getByTrigger` dispatch. It is a replacement rather than a prototype
wrapper because a wrapper can only run before or after the whole method: before, and a spoofed slot
or obj reaches the ledger unvalidated; after, and op 5's catch-all `[opheld5,_]` trigger has already
dropped the candy. All of the behaviour is in `src/idlescape/candyOps.ts`, so re-merging this file
at the next revision bump is a two-minute job.
```

and five rows in the `patches-check` fence:

```
candy | contains | 1 | src/idlescape/candyOps.ts | Player.prototype.addXp = function
candy | contains | 1 | src/idlescape/candyOps.ts | const delta = this.stats[stat] - before;
candy | contains | 1 | src/idlescape/candyLedgerFile.ts | fs.renameSync(tmp, target)
candy | contains | 1 | src/idlescape/install.ts | candyStore().seal(ownerKey);
candy | contains | 1 | src/network/game/client/handler/OpHeldHandler.ts | if (handleCandyHeldOp(player, obj.id, slot, message.op)) {
```

The `install.ts` row is there because the seal sweep is one line inside a branch that reads as a flush, and it is the line a later tidy-up is most likely to drop. Losing it does not break a single unit suite: it breaks the item.

- [ ] **Step 12: Verify**

```powershell
powershell -File scripts/line-ceiling.ps1
powershell -File scripts/content-overlay.ps1 -Check
powershell -File scripts/engine-overlay.ps1
powershell -File scripts/engine-overlay.ps1 -Check
powershell -File scripts/patches-check.ps1
cd engine\server
npx tsc --noEmit
npx tsx --test --test-force-exit (Get-ChildItem 'src\idlescape\*.test.ts' | ForEach-Object { "src/idlescape/$($_.Name)" })
```

Expected: the ceiling passes (`candy.ts` is about 340 lines, `candyOps.ts` about 140, `install.ts` about 345; if any is over 400, split rather than trimming comments), both overlays report no drift, the patch runner matches all eight candy rows, a clean typecheck, and **every** engine suite green including `install.test.ts`, `shared.test.ts` and `installSweep.test.ts`, which now run with a fourth prototype patch installed and with a seal sweep and an audit on the two tick branches they already drive.

- [ ] **Step 13: Commit**

```bash
git add engine-custom/src/idlescape/candy.ts \
        engine-custom/src/idlescape/candy.test.ts \
        engine-custom/src/idlescape/candyOps.ts \
        engine-custom/src/idlescape/candyOps.test.ts \
        engine-custom/src/network/game/client/handler/OpHeldHandler.ts \
        engine-custom/src/idlescape/install.ts \
        engine-custom/manifest.json \
        engine-custom/PATCHES.md
git -c core.safecrlf=false commit -m "feat(engine): record an hour of experience and seal it into the owner bank

Record consumes one blank candy and starts a wall-clock hour on that character; every
allowMulti grant that character earns is copied into the recording; when the hour is up
the next read seals it into a filled row and credits one time_candy_filled to the owner
bank through the server-internal delta op.

afterCycle is that read. Sealing is lazy and correct lazily, but every other reader needs
an item the player has not been given yet, so the 100-tick branch seals for every owner
with a character online and the 1500-tick branch audits the offline set before evicting
it (plan ruling R14). That same 100-tick branch now calls flushBanks() rather than
banks.flush(), which is what puts the candy ledgers on the only periodic write in the
process and bounds the hard-kill residue at sixty seconds instead of a whole hour.

The accrual records the OBSERVED stats delta, not a recomputed xp * xpRate: stats is an
Int32Array, xpRate can be fractional, and the 200m cap absorbs part of a grant (plan
ruling R6). The ledger row is written before the bank credit is attempted, so a crash
between them leaves a row with no candy, which the audit reports and pendingDelivery
retries, rather than a candy with no row.

A full bank and a suspended bank both become pendingDelivery and drain on the next read,
logged differently because one clears by itself and one needs an operator (ruling R13).
The audit checks the always-checkable half of the invariant and corrects nothing.

OpHeldHandler.ts is replaced rather than prototype-wrapped: the intercept must sit after
the handler's validation and before its trigger dispatch, and a wrapper can be neither
(ruling R5, decision D123).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 5: Every exit closed, each with a test that proves it is closed

`Eat` must be the only way a full candy leaves an inventory. **Eight exits** and one route that is not an exit, each with a named mechanism, and every one of them with an automated case that fails if the mechanism goes away. Two of those cases are proofs of absence, which are worth having precisely because absence is what stops being true when somebody adds content.

Two of the eight are closed in RuneScript rather than TypeScript, and a `patches-check` row that greps the clone for a line is the weakest kind of evidence there is: it proves a line exists in a file, never that it is in the right place or that it works. Both therefore get a **browser** case in Task 9's spec on top of the grep and the by-hand run in Step 8 here. **Alchemy**: cast High Alchemy on a seeded full candy and assert it survives. **Death**: `::~death` twice, once holding a candy and once holding none, and assert the candy survives and the empty death is clean. The death one is the more important of the two, because ruling R9 establishes that getting it wrong throws out of the most-executed proc in the game, and because a later edit that removes the restore half or reorders the insertion past `inv_dropall` keeps the grep green while destroying a candy on every death.

**Files:**
- Create: `content-custom/scripts/player/scripts/death.rs2` (replacement, upstream 203 lines)
- Create: `content-custom/scripts/skill_magic/scripts/spells/alchemy.rs2` (replacement)
- Modify: `engine-custom/src/idlescape/candyOps.ts` (the op 5 refusal)
- Modify: `engine-custom/src/idlescape/candyOps.test.ts` (six cases)
- Modify: `content-custom/manifest.json` (two `replace` rows)
- Modify: `engine-custom/PATCHES.md` (the "Time candy" section gains an exits table, plus two typed rows)
- Test: `engine-custom/src/idlescape/candyOps.test.ts`, plus a by-hand death on the live stack in Step 8

**Interfaces:**
- Consumes: Task 4's `handleCandyHeldOp`, `candyObjIds`, `candyStore`.
- Produces: nothing new. `handleCandyHeldOp` gains the op 5 branch, with the same signature.

- [ ] **Step 1: Record the upstream hashes before anything is copied**

`baseSha256` is taken with whichever pipeline the rewritten `scripts/content-overlay.ps1` uses at the time this task runs. Entry 3's Task 4 replaces the old `Get-FileHash` of the file in `engine/content` with `git -c core.autocrlf=false show <HEAD>:<path>`, which is how `engine-overlay.ps1` always worked. **Take the hashes now, and check them against both answers**, because the two differ for every content text file: this repository's `.gitattributes` is `* text=auto` with `*.pack text eol=lf`, `core.autocrlf` is true here, and the clone's own attributes pin nothing for `.rs2`, so an `.rs2` blob is LF and its working copy is CRLF.

```bash
cd engine/content
for f in scripts/player/scripts/death.rs2 scripts/skill_magic/scripts/spells/alchemy.rs2; do
  echo -n "$f blob="; git -c core.autocrlf=false show HEAD:$f | sha256sum | cut -c1-64
  echo -n "   disk="; sha256sum "$f" | cut -c1-64
done
```

Measured on 2026-09-08 at content sha `2b62ae68`:

| Path | blob | disk |
|---|---|---|
| `scripts/player/scripts/death.rs2` | `3dbcb076cf0934639f62d4f717316ac7854a4bc795c6ad635097fee6873ed4d5` | `182759371316153546e0ef35d7048bf902338834df05a4e42373f4f87db9ea1b` |
| `scripts/skill_magic/scripts/spells/alchemy.rs2` | `cba4ef78bb6cb58b0b19f7daf303a08dde78334d91dfcd56762869d7865c100a` | `06b32a3f8424d1c579ef50d44c586a8f3308107d37f36f95c133d33a7949d478` |

**Write the blob column**, unless `scripts/content-overlay.ps1` at execution time still hashes the file on disk, in which case write the disk column and say so in the commit message. Do not copy either number out of an older plan: the SP8c plan says in bold to take every `baseSha256` off the file on disk, and entry 3 inverts that. Case does not matter; PowerShell string comparison is case-insensitive.

- [ ] **Step 2: Write the failing tests for the engine-side exits**

Append to `engine-custom/src/idlescape/candyOps.test.ts`:

```ts
test('Drop is refused for a full candy, and the item stays in the inventory', () => {
    // Op 5 really does reach the handler: ObjType's iop default is [null,null,null,null,'Drop'],
    // so the handler's own `obj.iop[op - 1] === null` refusal does not already cover it, and
    // player/scripts/drop.rs2's [opheld5,_] would call ~dropslot. Refusing rather than destroying
    // is deliberate: the destroy_drop param deletes the item and would orphan its ledger row.
    const player = stamped('dropper', 'exitA');
    const inv = InvType.getId('inv');
    player.invAdd(inv, candyObjIds().full, 1);

    const handled = handleCandyHeldOp(player, candyObjIds().full, 0, 5);
    assert.equal(handled, true, 'claiming the op is what stops [opheld5,_] running');
    assert.equal(player.getInventory(inv)!.getItemCount(candyObjIds().full), 1, 'a refused drop must not destroy the candy');
});

test('Drop is NOT refused for a blank candy', () => {
    // Blanks are an ordinary tradeable commodity with no ledger row behind them. Refusing their
    // drop would be a bug that looks like caution.
    const player = stamped('dropper2', 'exitB');
    player.invAdd(InvType.getId('inv'), candyObjIds().blank, 1);
    assert.equal(handleCandyHeldOp(player, candyObjIds().blank, 0, 5), false, 'the engine must dispatch [opheld5,_] for a blank');
});

test('the full candy is untradeable and the blank is not', () => {
    // One config line closes five exits: trade, duel staking, the party room chest, shop selling
    // and putting an item on a table all read oc_tradeable. If this ever flips, every one of them
    // opens at once and nothing else in this suite would notice.
    assert.equal(ObjType.get(candyObjIds().full).tradeable, false);
    assert.equal(ObjType.get(candyObjIds().blank).tradeable, true);
});

test('the full candy has no cert link, so it cannot be noted into a tradeable form', () => {
    // -1 is the NO-CERT sentinel, not 0. ObjType declares `certlink = -1` and only opcode 97
    // overwrites it, and the packer emits 97 only when a `cert_<debugname>` obj exists
    // (tools/pack/config/ObjConfig.ts looks it up by name). time_candy_filled has no cert twin,
    // so this reads -1 on a correctly built cache. Do not "fix" it to 0.
    assert.equal(ObjType.get(candyObjIds().full).certlink, -1, 'no cert link, so oc_cert has nothing to note it into');
});

test('no generic [opheldu,_] exists in the content tree', () => {
    // A proof of ABSENCE, and it is here because absence is what stops being true. Item-on-item
    // cannot reach an obj with no trigger of its own today; the day a catch-all appears, this
    // goes red and the alchemy-style content refusal has to be extended to cover it.
    const scripts = path.resolve(import.meta.dirname, '..', '..', '..', 'content', 'scripts');
    const hits: string[] = [];
    const walk = (dir: string): void => {
        for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, item.name);
            if (item.isDirectory()) {
                walk(full);
            } else if (item.name.endsWith('.rs2') && /\[opheldu\s*,\s*_\s*\]/.test(fs.readFileSync(full, 'utf8'))) {
                hits.push(full);
            }
        }
    };
    walk(scripts);
    assert.deepEqual(hits, [], 'a catch-all opheldu would let any spell target reach the candy');
});

test('the hour keeps running while the character is logged out', () => {
    // Design ruling 3: the hour is wall clock from activation and a disconnect costs you the
    // remainder. A fresh store standing in for a restarted engine must find the same expiry.
    const key = 'exitC';
    const first = new CandyStore(scratch, HOUR);
    first.startRecording(key, 'zezima', T0);
    first.accrue(key, 'zezima', 10, 100, T0 + 1);
    first.flush();

    const second = new CandyStore(scratch, HOUR);
    assert.equal(second.seal(key, T0 + HOUR - 1), 0, 'the hour is not over yet');
    assert.equal(second.seal(key, T0 + HOUR), 1, 'and it ends on time whether or not anybody was online');
    assert.deepEqual(second.snapshot(key).filled[0].xp, { '10': 100 });
});
```

Add `CandyStore`, `HOUR` and `T0` to this file's imports and constants if they are not already there (Task 4's suite defines them; if the two suites diverge, define them locally rather than exporting a fixture from a source module).

- [ ] **Step 3: Run them and watch the drop cases fail**

```powershell
cd engine\server
npx tsx --test --test-force-exit src/idlescape/candyOps.test.ts
```

Expected: the two `Drop` cases FAIL (`handleCandyHeldOp` answers `false` for op 5 on the full candy), the `tradeable`, `certlink` and `opheldu` cases PASS, the logout case PASSES.

- [ ] **Step 4: Add the op 5 refusal**

In `engine-custom/src/idlescape/candyOps.ts`, replace the Task 5 placeholder comment in `handleCandyHeldOp`:

```ts
    if (objId === ids.full && op === 5) {
        // Refused, not destroyed. There is no Destroy confirmation anywhere in this content tree
        // (grep *.rs2 for destroy: only the destroy_drop and destroy_death params), so op 5 is one
        // exit rather than two, and it is the only one that reaches a full candy without Eat.
        player.messageGame('You would lose the hour inside it. Eat it instead.');
        return true;
    }
```

- [ ] **Step 5: Write the death replacement**

Copy `engine/content/scripts/player/scripts/death.rs2` to `content-custom/scripts/player/scripts/death.rs2` verbatim, then make four edits: two per proc.

In `[proc,player_death_lose_items]`, immediately **before** `inv_dropall(inv, coord, ^lootdrop_duration);`:

```
// idlescape, sprint entry 10: carry full time candies across the death. deathkeep cannot be
// borrowed for them, it is size 4 and already spoken for by the three priciest items plus
// Protect Item, so time_candy_keep is a separate single slot inv. One slot is enough because
// the item stacks.
//
// The guard is REQUIRED, not caution. inv_moveitem's handler runs check(count, ObjStackValid)
// before its completed == 0 early return, and ObjStackValid is a 1-to-STACK_LIMIT range that
// THROWS out of range. inv_total answers 0 for the overwhelmingly common death, so an
// unguarded call would throw out of this proc on nearly every death in the world.
if (inv_total(inv, time_candy_filled) > 0) {
    inv_moveitem(inv, time_candy_keep, time_candy_filled, inv_total(inv, time_candy_filled));
}
```

and immediately **after** the `~moveallinv(deathkeep, inv);` / `inv_clear(deathkeep);` pair that ends the proc:

```
if (inv_total(time_candy_keep, time_candy_filled) > 0) {
    ~moveallinv(time_candy_keep, inv);
}
inv_clear(time_candy_keep);
```

Make the identical pair of edits in `[proc,pvp_death_lose_items]`: the first before its `while` loop over `inv` (the one that calls `both_dropslot`), the second after its own `~moveallinv(deathkeep, inv); inv_clear(deathkeep);`. Nothing else in the file changes, including the staff early return at the top of each proc, which is why a staff death is unaffected.

- [ ] **Step 6: Write the alchemy replacement**

Copy `engine/content/scripts/skill_magic/scripts/spells/alchemy.rs2` to `content-custom/scripts/skill_magic/scripts/spells/alchemy.rs2` verbatim, then add one `case` inside `[proc,is_alchable]`'s `switch_obj($item)`, beside the `thanainabarrel`, `coins` and `macro_cube` arms that are already there:

```
    case time_candy_filled :
        // idlescape, sprint entry 10. Alchemy is the one route that reaches an arbitrary held
        // item and destroys it, and destroying a full candy orphans its ledger row.
        //
        // This is CONTENT and not an engine replacement because both alchemy spells funnel
        // through this proc, and they are the only two of the eight opheldt triggers that accept
        // an arbitrary item: the other six are enchant_lvl1 to enchant_lvl5 and superheat_item,
        // all of which test the item before touching it. The design named OpHeldUHandler for
        // this, which is the wrong handler entirely (OpHeldU is item-on-item; alchemy registers
        // [opheldt,...]). See plan ruling R3 and decision D122.
        mes("The hour inside it is worth more than the gold.");
        return(false);
```

The blank candy is deliberately alchable: it is an ordinary tradeable item with no ledger row behind it.

- [ ] **Step 7: Add the manifest rows, apply, and pack**

`content-custom/manifest.json` gains two `replace` rows with the hashes from Step 1:

```json
    { "path": "scripts/player/scripts/death.rs2", "kind": "replace", "baseSha256": "3dbcb076cf0934639f62d4f717316ac7854a4bc795c6ad635097fee6873ed4d5" },
    { "path": "scripts/skill_magic/scripts/spells/alchemy.rs2", "kind": "replace", "baseSha256": "cba4ef78bb6cb58b0b19f7daf303a08dde78334d91dfcd56762869d7865c100a" }
```

Then:

```powershell
powershell -File scripts/content-overlay.ps1
powershell -File scripts/content-overlay.ps1
powershell -File scripts/content-overlay.ps1 -Check
cd engine\server
npx tsx tools/pack/BuildOverlay.ts
```

Expected: the second apply reports **0 copied**, `-Check` exits 0, and the pack reports the pinned ids unchanged and every pinned pack file verified byte for byte. The second apply proves the copy landed and that nothing rewrote the destination in between: the overlay hashes source and destination and then copies byte for byte, so a CRLF `.rs2` is harmless, and after the first copy the two agree whatever their line endings are. A second apply that copies something means a tool is rewriting the clone's copy under you, and the tool that does that is the packer, on `pack/*.pack`.

**A compile error out of `BuildOverlay.ts` naming `time_candy_keep` or `time_candy_filled` means the objs and the inv are not in the cache** at the point the scripts compile, which means Task 1's pack did not happen or was reverted. Re-run Task 1 Step 11 before touching the RuneScript.

- [ ] **Step 8: Prove the two content exits on the live stack**

This is the one part of this task a unit test cannot reach: `death.rs2` runs inside the engine's script VM, and a `check()` that throws does so at runtime.

Bring the stack up from PowerShell `Start-Process`, never from a bash subshell. **`-DevStaff` is not optional here**: every command below is a developer cheat, and `staff.ts` grants staffmodlevel 4 only from `IDLESCAPE_DEV_STAFF`, which `start-stack.ps1` sets when the run is not `-Prod` **or** when `-DevStaff` is passed. Without it `::give` and `::~death` are silently refused and the whole step reads as a content bug:

```powershell
Start-Process powershell -ArgumentList '-NoExit', '-File', 'scripts/start-stack.ps1', '-Prod', '-DevStaff'
```

Wait for `World ready` (about two minutes). In the browser at `http://127.0.0.1:8787`, sign up, make a character, then in the game chat:

1. `::setvar tutorial 1000` then `::~death` (this is what binds the inventory to its interface; `web/e2e/harness.ts:29-56` explains why `::give` is invisible before it).
2. **Death with no candy, which is the case the guard exists for.** `::~death` again. Expected: the character respawns in Lumbridge with no error in the engine console. An unguarded `inv_moveitem` would print a script error naming `ObjStack` here, on a completely ordinary death.
3. **Death holding a candy.** `::give time_candy_filled 3`, then `::~death`. Expected: the stack of 3 is still in the inventory after the respawn, and the rest of the inventory dropped as usual.
4. **Alchemy.** `::give time_candy_filled 1`, `::setstat magic 99`, `::give firerune 100`, `::give naturerune 100`, cast High Alchemy on the candy. Expected: `The hour inside it is worth more than the gold.` and the candy is still there.
5. **Drop.** Right-click the candy, Drop. Expected: `You would lose the hour inside it. Eat it instead.` and the candy is still there.
6. **Trade and shop.** Expected: the trade window refuses it and a general store will not buy it, both from `tradeable=no`.

Record each observed message in the task's ledger entry. Stop the stack from the window that started it.

- [ ] **Step 9: Extend the `PATCHES.md` section**

Add an exits table to the `## Time candy` section, because this is the list a later reader needs and it is not derivable from any one file:

```markdown
**Every exit from an inventory other than Eat, and what closes it.** The ledger is the payload and
a `time_candy_filled` is a bearer token against it, so an item that leaves without popping a row
orphans an hour of somebody's experience.

| Exit | Closed by |
|---|---|
| Trade, duel stake, party room chest, shop sale, table | `tradeable=no` on the obj, read by `oc_tradeable` in five separate scripts |
| Drop (op 5) | `handleCandyHeldOp` refuses it in `src/idlescape/candyOps.ts`, ahead of `[opheld5,_]` |
| High and Low Alchemy | a `case time_candy_filled` in `~is_alchable` (`skill_magic/.../alchemy.rs2`), which both spells funnel through |
| Death, ordinary and PvP | `time_candy_keep` (inv 219) in both procs of `player/scripts/death.rs2`, guarded by `inv_total > 0` because `inv_moveitem` throws on a count of 0 |
| Bank deposit | **not an exit**: inv 95 is the shared owner container, so a banked candy is still the owner's and still counted by the invariant |
| Item on item | no generic `[opheldu,_]` exists in the tree. Asserted by a case in `candyOps.test.ts`, because absence is what stops being true |
| Noting | the obj has no `certlink`, so `oc_cert` has nothing to turn it into. Asserted the same way |
| Pickup by a stranger | closed twice over: a full candy never reaches the ground, and `Zone.ts` keeps an untradeable ground obj private to the dropper |
| The web bank | `server/src/bank/routes.ts` refuses a `delta` from a browser; the browser can only rearrange |
```

and two typed rows:

```
candy | contains | 1 | ../content/scripts/player/scripts/death.rs2 | if (inv_total(inv, time_candy_filled) > 0) {
candy | contains | 1 | ../content/scripts/skill_magic/scripts/spells/alchemy.rs2 | case time_candy_filled :
```

- [ ] **Step 10: Verify**

```powershell
powershell -File scripts/line-ceiling.ps1
powershell -File scripts/content-overlay.ps1 -Check
powershell -File scripts/engine-overlay.ps1
powershell -File scripts/engine-overlay.ps1 -Check
powershell -File scripts/patches-check.ps1
cd engine\server
npx tsc --noEmit
npx tsx --test --test-force-exit (Get-ChildItem 'src\idlescape\*.test.ts' | ForEach-Object { "src/idlescape/$($_.Name)" })
```

Expected: everything green, the patch runner matching all ten candy rows.

- [ ] **Step 11: Commit**

```bash
git add content-custom/scripts/player/scripts/death.rs2 \
        content-custom/scripts/skill_magic/scripts/spells/alchemy.rs2 \
        content-custom/manifest.json \
        engine-custom/src/idlescape/candyOps.ts \
        engine-custom/src/idlescape/candyOps.test.ts \
        engine-custom/PATCHES.md
git -c core.safecrlf=false commit -m "feat(content): close every exit a full time candy could take but Eat

Eight exits, each with a named mechanism and a case that fails if the mechanism goes away.
tradeable=no closes five at once. Op 5 is refused rather than destroyed, because
destroy_drop deletes the item and would orphan its ledger row, and op 5 does reach the
handler: ObjType's iop default is [null,null,null,null,'Drop'].

Alchemy is closed in content with one case in ~is_alchable rather than by replacing a
handler. The design named OpHeldUHandler, which is the wrong handler entirely: OpHeldU is
item-on-item and alchemy registers [opheldt,...] (plan ruling R3, decision D122).

Both death procs move the stack into time_candy_keep and back, GUARDED by inv_total > 0.
The guard is required, not caution: inv_moveitem runs check(count, ObjStackValid) before
its completed == 0 early return, and that validator throws on 0, which is the count on
nearly every death in the world.

Two proofs of absence are asserted rather than assumed: no generic [opheldu,_] and no
cert link. Both were watched on the live stack along with the two deaths, the alch and
the drop.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 6: Redemption, and the idempotency that makes a bearer token safe

`Eat` on a full candy pops the oldest ledger row and replays it through the engine's own `Player.addXp`, one call per recorded stat. `Check` prints the same breakdown without consuming anything.

**Files:**
- Modify: `engine-custom/src/idlescape/candyOps.ts` (the `Eat` and `Check` branches, and a `redeem` helper)
- Modify: `engine-custom/src/idlescape/candyOps.test.ts` (seven cases)
- Modify: `engine-custom/PATCHES.md` (the "Time candy" section gains a redemption paragraph, plus one typed row)
- Test: `engine-custom/src/idlescape/candyOps.test.ts`

**Interfaces:**
- Consumes: Task 4's `candyStore().redeem()` and `peek()`, and `totalTenths` from `#/idlescape/candyLedger.js`.
- Produces: nothing new outside the module.

- [ ] **Step 1: Write the failing tests**

Append to `engine-custom/src/idlescape/candyOps.test.ts`:

```ts
test('Eat consumes one item, pops one row, and replays every recorded skill exactly once', () => {
    const key = 'redeemA';
    const inv = InvType.getId('inv');
    const source = stamped('sourcechar', key);
    source.invAdd(inv, candyObjIds().blank, 1);
    handleCandyHeldOp(source, candyObjIds().blank, 0, 1);
    source.addXp(10, 1000);
    source.addXp(7, 500);
    const recorded = { ...candyStore().snapshot(key).recordings[0].xp };
    candyStore().seal(key, Date.now() + 4_000_000);

    // A DIFFERENT character of the same owner eats it, which is the whole point of the item.
    const eater = stamped('eaterchar', key);
    eater.invAdd(inv, candyObjIds().full, 1);
    const before10 = eater.stats[10];
    const before7 = eater.stats[7];

    assert.equal(handleCandyHeldOp(eater, candyObjIds().full, 0, 1), true);

    assert.equal(eater.getInventory(inv)!.getItemCount(candyObjIds().full), 0, 'the item is consumed');
    assert.equal(candyStore().snapshot(key).filled.length, 0, 'the row is consumed');
    assert.equal(eater.stats[10] - before10, recorded['10'], 'exact per-skill replay, in tenths');
    assert.equal(eater.stats[7] - before7, recorded['7']);
});

test('a replay that granted twice fails this test', () => {
    // The mutation this case is built to catch: a redeem loop that calls addXp with allowMulti
    // defaulted true would apply the world rate a second time, because the stored amount is
    // already multiplied. At xpRate 5 that is a 5x on top of a 2x.
    const rate = Environment.node.xpRate;
    try {
        (Environment.node as { xpRate: number }).xpRate = 5;
        const key = 'redeemB';
        const inv = InvType.getId('inv');
        const source = stamped('sourceb', key);
        source.invAdd(inv, candyObjIds().blank, 1);
        handleCandyHeldOp(source, candyObjIds().blank, 0, 1);
        source.addXp(10, 100); // 500 tenths recorded
        candyStore().seal(key, Date.now() + 4_000_000);

        const eater = stamped('eaterb', key);
        eater.invAdd(inv, candyObjIds().full, 1);
        const before = eater.stats[10];
        handleCandyHeldOp(eater, candyObjIds().full, 0, 1);
        assert.equal(eater.stats[10] - before, 500, 'exactly what was recorded, never the rate applied twice');
    } finally {
        (Environment.node as { xpRate: number }).xpRate = rate;
    }
});

test('eating twice grants once: the second Eat finds no row and refuses', () => {
    const key = 'redeemC';
    const inv = InvType.getId('inv');
    const source = stamped('sourcec', key);
    source.invAdd(inv, candyObjIds().blank, 1);
    handleCandyHeldOp(source, candyObjIds().blank, 0, 1);
    source.addXp(10, 1000);
    candyStore().seal(key, Date.now() + 4_000_000);

    const eater = stamped('eaterc', key);
    eater.invAdd(inv, candyObjIds().full, 2); // one more item than there are rows
    const before = eater.stats[10];
    handleCandyHeldOp(eater, candyObjIds().full, 0, 1);
    const afterFirst = eater.stats[10];
    assert.ok(afterFirst > before);

    handleCandyHeldOp(eater, candyObjIds().full, 0, 1);
    assert.equal(eater.stats[10], afterFirst, 'a candy with no row grants nothing');
    assert.equal(eater.getInventory(inv)!.getItemCount(candyObjIds().full), 1, 'and it is not consumed either');
});

test('a 0 XP candy is eaten, says so, and grants nothing', () => {
    const key = 'redeemD';
    const inv = InvType.getId('inv');
    const source = stamped('sourced', key);
    source.invAdd(inv, candyObjIds().blank, 1);
    handleCandyHeldOp(source, candyObjIds().blank, 0, 1);
    candyStore().seal(key, Date.now() + 4_000_000);

    const eater = stamped('eaterd', key);
    eater.invAdd(inv, candyObjIds().full, 1);
    const before = eater.stats.slice();
    handleCandyHeldOp(eater, candyObjIds().full, 0, 1);
    assert.deepEqual(Array.from(eater.stats), Array.from(before));
    assert.equal(eater.getInventory(inv)!.getItemCount(candyObjIds().full), 0, 'an empty candy is still disposed of by eating it');
    assert.equal(candyStore().snapshot(key).filled.length, 0);
});

test('the replay does not feed the eater own live recording', () => {
    // The eater is mid-hour themselves. The replay goes through addXp with allowMulti false, and
    // the accrual patch skips unmultiplied grants, so an eaten candy cannot be recorded into the
    // next one. Without that, an owner could compound a candy indefinitely.
    const key = 'redeemE';
    const inv = InvType.getId('inv');
    const source = stamped('sourcee', key);
    source.invAdd(inv, candyObjIds().blank, 1);
    handleCandyHeldOp(source, candyObjIds().blank, 0, 1);
    source.addXp(10, 1000);
    candyStore().seal(key, Date.now() + 4_000_000);

    const eater = stamped('eatere', key);
    eater.invAdd(inv, candyObjIds().blank, 1);
    handleCandyHeldOp(eater, candyObjIds().blank, 0, 1); // the eater starts their own hour
    eater.invAdd(inv, candyObjIds().full, 1);
    handleCandyHeldOp(eater, candyObjIds().full, 1, 1);

    const own = candyStore().snapshot(key).recordings.find(r => r.character === 'eatere');
    assert.deepEqual(own?.xp, {}, 'a replayed hour must not be recorded into the hour being recorded');
});

test('Check reads the oldest row without consuming it', () => {
    const key = 'redeemF';
    const inv = InvType.getId('inv');
    const source = stamped('sourcef', key);
    source.invAdd(inv, candyObjIds().blank, 1);
    handleCandyHeldOp(source, candyObjIds().blank, 0, 1);
    source.addXp(10, 1000);
    candyStore().seal(key, Date.now() + 4_000_000);

    const eater = stamped('eaterf', key);
    eater.invAdd(inv, candyObjIds().full, 1);
    const before = eater.stats[10];

    assert.equal(handleCandyHeldOp(eater, candyObjIds().full, 0, 2), true);
    assert.equal(eater.stats[10], before, 'Check grants nothing');
    assert.equal(eater.getInventory(inv)!.getItemCount(candyObjIds().full), 1, 'Check consumes nothing');
    assert.equal(candyStore().snapshot(key).filled.length, 1, 'and pops no row');
});

test('Check on a candy with no row says so rather than throwing', () => {
    const eater = stamped('eaterg', 'redeemG');
    eater.invAdd(InvType.getId('inv'), candyObjIds().full, 1);
    assert.doesNotThrow(() => handleCandyHeldOp(eater, candyObjIds().full, 0, 2));
    assert.equal(eater.getInventory(InvType.getId('inv'))!.getItemCount(candyObjIds().full), 1);
});
```

- [ ] **Step 2: Run them and watch them fail**

```powershell
cd engine\server
npx tsx --test --test-force-exit src/idlescape/candyOps.test.ts
```

Expected: the seven new cases FAIL (`handleCandyHeldOp` answers `false` for ops 1 and 2 on the full candy).

- [ ] **Step 3: Write the redemption branches**

In `engine-custom/src/idlescape/candyOps.ts`, replace the Task 6 placeholder comment:

```ts
    if (objId === ids.full && op === 1) {
        return eat(player, ownerKey, ids.full);
    }
    if (objId === ids.full && op === 2) {
        return check(player, ownerKey);
    }
```

and add the two helpers, with `import { totalTenths } from './candyLedger.js';` and `import { PlayerStatNameMap } from '#/engine/entity/PlayerStat.js';`:

```ts
/**
 * Eat. The order is: seal, pop and PERSIST, remove the item, then grant.
 *
 * The ledger write happens before the grant so a crash between them costs the player the hour and
 * can never duplicate the row: `redeem()` has already written the shortened `filled` to disk when
 * it returns. The item is removed before the grant for the same reason in the other direction, so
 * there is no window in which the item and the row both exist.
 *
 * `allowMulti: false` on every grant, for two reasons that happen to coincide. The stored amount
 * is already post-multiplier, so passing true would apply the world's rate a second time; and the
 * accrual patch skips unmultiplied grants, so a replay cannot be recorded into a recording the
 * eater has running. Going through addXp rather than writing stats[] directly is what makes the
 * level-up messages, the 200,000,000 cap, the session log and every downstream reader of `.sav`
 * see this exactly as they see live experience, so nothing has to be taught about candies.
 */
function eat(player: Player, ownerKey: string, full: number): boolean {
    const row = candyStore().redeem(ownerKey);
    if (row === null) {
        // Only reachable if the invariant is broken: an item with no row behind it.
        player.messageGame('This candy has nothing in it. Something has gone wrong; tell an administrator.');
        return true;
    }

    // invDel and not invDelSlot, for the reason record() gives: invDelSlot takes two arguments and
    // deletes the whole slot, and a stack of three full candies must lose exactly one.
    player.invDel(InvType.getId('inv'), full, 1);

    let granted = 0;
    for (const [key, amount] of Object.entries(row.xp)) {
        const stat = Number(key);
        if (!Number.isInteger(stat) || amount <= 0) {
            continue;
        }
        player.addXp(stat, amount, false);
        granted += amount;
    }

    // Tenths are the engine's unit; players read the number the skill guide shows (ruling R12).
    player.messageGame(`You relive ${Math.floor(granted / 10).toLocaleString('en-GB')} experience.`);
    if (granted === 0) {
        player.messageGame('That hour was spent doing nothing at all.');
    }
    player.addSessionLog(LoggerEventType.MODERATOR, `Eat time_candy_filled (${granted} tenths from ${row.character})`);
    return true;
}

/** Check. Reads filled[0] and consumes nothing: Eat is the only path that pops a row. */
function check(player: Player, ownerKey: string): boolean {
    const row = candyStore().peek(ownerKey);
    if (row === null) {
        player.messageGame('You have no recorded hours waiting.');
        return true;
    }
    player.messageGame(`The oldest hour you have banked was ${row.character}'s:`);
    for (const [key, amount] of Object.entries(row.xp)) {
        const name = PlayerStatNameMap.get(Number(key)) ?? `stat ${key}`;
        player.messageGame(`  ${name.toLowerCase()}: ${Math.floor(amount / 10).toLocaleString('en-GB')}`);
    }
    if (totalTenths(row) === 0) {
        player.messageGame('  nothing at all.');
    }
    return true;
}
```

- [ ] **Step 4: Run the suite and watch it pass**

```powershell
cd engine\server
npx tsx --test --test-force-exit src/idlescape/candyOps.test.ts
```

Expected: PASS, every case.

- [ ] **Step 5: Watch the double-grant mutation fail**

Prove the idempotency case is real rather than merely green. Temporarily change `player.addXp(stat, amount, false)` to `player.addXp(stat, amount)` and re-run:

```powershell
cd engine\server
npx tsx --test --test-force-exit src/idlescape/candyOps.test.ts
```

Expected: **FAIL** in `a replay that granted twice fails this test`, reporting 2500 against 500. Then temporarily move `candyStore().redeem(...)` to after the grant loop and re-run: expected FAIL in `eating twice grants once`. Restore both, re-run, confirm green. Record both observed failures in the ledger entry.

- [ ] **Step 6: Extend `PATCHES.md` and add the row**

Add to the `## Time candy` section:

```markdown
**Redemption ordering.** `Eat` seals, pops `filled[0]`, writes the ledger, removes the item, then
grants. The write is before the grant so a crash between them costs the player the hour and can
never duplicate the row; the item is removed before the grant so the item and the row never both
exist. Every grant is `addXp(stat, amount, false)`: the stored amount is already post-multiplier,
and `allowMulti: false` is also what stops the accrual patch recording a replay into a recording
the eater has running.
```

and one typed row:

```
candy | contains | 1 | src/idlescape/candyOps.ts | player.addXp(stat, amount, false);
```

- [ ] **Step 7: Verify and commit**

```powershell
powershell -File scripts/line-ceiling.ps1
powershell -File scripts/engine-overlay.ps1
powershell -File scripts/engine-overlay.ps1 -Check
powershell -File scripts/patches-check.ps1
cd engine\server
npx tsc --noEmit
npx tsx --test --test-force-exit (Get-ChildItem 'src\idlescape\*.test.ts' | ForEach-Object { "src/idlescape/$($_.Name)" })
```

Expected: everything green, the patch runner matching all eleven candy rows. `candyOps.ts` is now about 260 lines and its suite about 380: if the suite is over 400, split it into `candyOps.test.ts` (record and accrual) and `candyRedeem.test.ts` (Eat, Check, the exits), which `verify.ps1` picks up automatically because it enumerates `src\idlescape\*.test.ts`.

```bash
git add engine-custom/src/idlescape/candyOps.ts \
        engine-custom/src/idlescape/candyOps.test.ts \
        engine-custom/PATCHES.md
git -c core.safecrlf=false commit -m "feat(engine): eat a full time candy and replay the hour skill for skill

Eat seals, pops filled[0], writes the ledger, removes the item, then grants. The write is
before the grant so a crash costs the hour and never duplicates the row; the item goes
before the grant so the item and the row never both exist.

Every grant is addXp(stat, amount, false). The stored amount is already post-multiplier,
and allowMulti false is also what stops the accrual patch recording a replay into the
eater's own live recording, which would let an owner compound a candy indefinitely.

Both mutations were watched to fail through the real suite: a defaulted allowMulti
reported 2500 against 500, and moving the redeem after the grant let a second Eat grant a
second time. Check reads filled[0] and consumes nothing.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 7: The drop, on both clue tiers, at the rate ruled under D8

Two content replacements and one live check. Deliberately asymmetric, per the owner's ruling in the design's section 4: medium gets its own roll, hard gets one more case on its common table.

**Files:**
- Create: `content-custom/scripts/minigames/game_trail/scripts/medium/trail_clue_medium_reward.rs2` (replacement, upstream 77 lines)
- Create: `content-custom/scripts/minigames/game_trail/scripts/hard/trail_clue_hard_reward.rs2` (replacement, upstream 113 lines)
- Modify: `content-custom/manifest.json` (two `replace` rows)
- Modify: `engine-custom/PATCHES.md` (a drop-rate paragraph in the "Time candy" section, two typed rows)
- Test: the live casket run in Step 5, plus the two typed rows

**Interfaces:**
- Consumes: Task 1's `time_candy` obj.
- Produces: nothing in code. The blank candy becomes obtainable.

- [ ] **Step 1: Record the upstream hashes**

```bash
cd engine/content
for f in scripts/minigames/game_trail/scripts/medium/trail_clue_medium_reward.rs2 scripts/minigames/game_trail/scripts/hard/trail_clue_hard_reward.rs2; do
  echo -n "$f blob="; git -c core.autocrlf=false show HEAD:$f | sha256sum | cut -c1-64
  echo -n "   disk="; sha256sum "$f" | cut -c1-64
done
```

Measured on 2026-09-08 at content sha `2b62ae68`:

| Path | blob | disk |
|---|---|---|
| `.../medium/trail_clue_medium_reward.rs2` | `6c2b16fcb46ae830107af5a8b2e98c016b4f07788f273dd62fbb8c394691fcd0` | `9a2419d62f54906fce10c51c34721a59a494d4de667804dc92fced616d8a9ce9` |
| `.../hard/trail_clue_hard_reward.rs2` | `5731d30dbc11fb57082fcb1261ba23ffd4607632d9dcc7bf78b3c370a5604b1c` | `9d45be04d0652a5fc12270bb6e3d9d92597a025420b8664bc3a120bcbced6c9a` |

Take the same column Task 5 Step 1 took, by whichever rule `scripts/content-overlay.ps1` uses at execution time.

- [ ] **Step 2: Write the medium replacement**

Copy `engine/content/scripts/minigames/game_trail/scripts/medium/trail_clue_medium_reward.rs2` verbatim to `content-custom/scripts/minigames/game_trail/scripts/medium/trail_clue_medium_reward.rs2`, then insert one block into `[proc,trail_clue_medium_reward]`, after the `if ($rare > 0) { ... } else { ... }` session log and **before** `~trail_complete;`:

```
// idlescape, sprint entry 10: time candy, medium tier. Its OWN roll rather than a case on the
// common table, so neither existing table is diluted and the rate is tunable on its own.
//
// 1/50 is 2.0% per casket against hard's 20.3%, which is 50 medium caskets per candy against 4.5
// hard. That gap is deliberate and it is the entry's one tunable number: plan ruling R1 and
// decision D120 record the arithmetic, the alternative (1/12, a 2.7x gap rather than 11x), and
// the fact that changing it is one integer here plus a repack, with no id and no save data moved.
//
// Worst case output rises to 6 items, inside trail_rewardinv's 9 slots.
if (random(50) = 0) {
    inv_add(trail_rewardinv, time_candy, 1);
}
```

- [ ] **Step 3: Write the hard replacement**

Copy `engine/content/scripts/minigames/game_trail/scripts/hard/trail_clue_hard_reward.rs2` verbatim, then make two edits inside `[proc,trail_clue_hard_normal]`, and only there. The rare table (`[proc,trail_clue_hard_rare]`, `random(31)`) and the ultrarare table (`[proc,trail_clue_hard_ultrarare]`, 9 more cases) are untouched; the design's section 2 attributes 40 entries to "the rare table", which is 31 plus 9 across two procs.

Change `def_int $random = random(21);` to:

```
// idlescape, sprint entry 10: 21 becomes 22 for the time candy case below. Every existing common
// hard reward is diluted by one part in 22, a 4.5% relative reduction, which is the price of
// putting the candy on this table rather than beside it (design section 4).
def_int $random = random(22);
```

and add, after `case 20 : inv_add(trail_rewardinv, ~trail_reward_godpage);`:

```
    case 21 : inv_add(trail_rewardinv, time_candy, 1);
```

Per roll that is `(44/45) x (1/22) = 4.4444%`. Over the 4, 5 and 6 rolls a hard casket makes, at least one candy is 16.63%, 20.34% and 23.87%, averaging 20.28% per casket, expected yield 0.2222.

- [ ] **Step 4: Add the manifest rows, apply, and pack**

```json
    { "path": "scripts/minigames/game_trail/scripts/medium/trail_clue_medium_reward.rs2", "kind": "replace", "baseSha256": "6c2b16fcb46ae830107af5a8b2e98c016b4f07788f273dd62fbb8c394691fcd0" },
    { "path": "scripts/minigames/game_trail/scripts/hard/trail_clue_hard_reward.rs2", "kind": "replace", "baseSha256": "5731d30dbc11fb57082fcb1261ba23ffd4607632d9dcc7bf78b3c370a5604b1c" }
```

```powershell
powershell -File scripts/content-overlay.ps1
powershell -File scripts/content-overlay.ps1
powershell -File scripts/content-overlay.ps1 -Check
cd engine\server
npx tsx tools/pack/BuildOverlay.ts
```

Expected: the second apply reports 0 copied, `-Check` exits 0, the pack reports the pinned ids unchanged and exits 0. A compile error naming `time_candy` means Task 1's pack was reverted.

- [ ] **Step 5: The live casket run, on both tiers**

Neither drop is reachable from a unit test: both live inside the script VM behind a completed trail. There is a cheap seed, and it needs no new content and no new script name.

`~trail_clue_progress` writes the step count into bits 0 to 3 of `%trail_status`, `^trail_medium_maxsteps` is 5 and `^trail_hard_maxsteps` is 6 (`minigames/game_trail/configs/trail.constant:2-3`), and `[opheld1,_trail_casket_medium]` calls `~progress_clue_medium`, which progresses, then rewards when the tier is complete. So setting the varp to the tier maximum and opening one casket runs the reward proc directly.

Bring the stack up from PowerShell `Start-Process`, with `-Prod -DevStaff` for the reason Task 5 Step 8 gives (every command here is a cheat and `-Prod` alone leaves staffmodlevel at 0), take the character off Tutorial Island (`::setvar tutorial 1000` then `::~death`), then:

**Hard, the observable one.**

```
::setvar trail_status 6
::give trail_clue_hard_sextant001_casket 20
```

Open all twenty, one at a time. Expected: a time candy in roughly four of the twenty reward boxes (20.3% per casket, so four is the mode and anything from one to eight is unremarkable). **Zero out of twenty is a 1.2% event and should be treated as a failure**: re-read the overlay copy of `[proc,trail_clue_hard_normal]` and confirm both edits are in the file the overlay copied, then confirm the pack ran after the edit. `::setvar trail_status 6` again between opens if the reward stops firing.

**Medium, the sanity one.** At 1/50 a live frequency check is not practical, so prove the block is reachable rather than its rate. Temporarily change the overlay copy's `random(50)` to `random(1)`, re-apply, re-pack, then:

```
::setvar trail_status 5
::give trail_clue_medium_map001_casket 3
```

Expected: a time candy in every one of the three reward boxes, and the rest of the casket's normal output beside it, all inside `trail_rewardinv`'s 9 slots with nothing lost. **Then restore `random(50)`, re-apply, re-pack, and confirm the file on disk says 50 before committing.** A shipped `random(1)` is a permanent medium candy on every casket.

Record the observed counts in the ledger entry: they are the only evidence either rate exists at all.

- [ ] **Step 6: Extend `PATCHES.md` and add the rows**

```markdown
**Drop rates.** Medium gets its own roll, `if (random(50) = 0)`, appended after the roll loop in
`trail_clue_medium_reward.rs2` and before `~trail_complete`, so neither existing table is diluted
and the rate is tunable on its own. Hard gets one more case on its common table: `random(21)`
becomes `random(22)` and `case 21` is added in `[proc,trail_clue_hard_normal]`, which dilutes every
existing common hard reward by one part in 22. That is 2.0% per medium casket against 20.3% per
hard casket, an asymmetry the owner asked for and plan ruling R1 (decision D120) argues with the
arithmetic. The rare and ultrarare hard tables are untouched.
```

```
candy | contains | 1 | ../content/scripts/minigames/game_trail/scripts/medium/trail_clue_medium_reward.rs2 | if (random(50) = 0) {
candy | contains | 1 | ../content/scripts/minigames/game_trail/scripts/hard/trail_clue_hard_reward.rs2 | case 21 : inv_add(trail_rewardinv, time_candy, 1);
```

- [ ] **Step 7: Verify and commit**

```powershell
powershell -File scripts/line-ceiling.ps1
powershell -File scripts/content-overlay.ps1 -Check
powershell -File scripts/engine-overlay.ps1 -Check
powershell -File scripts/patches-check.ps1
cd engine\server
npx tsc --noEmit
npx tsx --test --test-force-exit (Get-ChildItem 'src\idlescape\*.test.ts' | ForEach-Object { "src/idlescape/$($_.Name)" })
```

Expected: everything green, the patch runner matching all **thirteen** candy rows: 3 from Task 1, 5 from Task 4, 2 from Task 5, 1 from Task 6 and 2 here. The fourteenth is Task 8's management route, which is added after this verify.

```bash
git add content-custom/scripts/minigames/game_trail/scripts/medium/trail_clue_medium_reward.rs2 \
        content-custom/scripts/minigames/game_trail/scripts/hard/trail_clue_hard_reward.rs2 \
        content-custom/manifest.json \
        engine-custom/PATCHES.md
git -c core.safecrlf=false commit -m "feat(content): drop time candy from medium and hard clue caskets

Medium gets its own roll at 1/50, appended after the roll loop, so neither existing table
is diluted and the rate is tunable on its own. Hard gets one more case on its common
table, random(21) to random(22) plus case 21, which dilutes every existing common hard
reward by one part in 22.

2.0% per medium casket against 20.3% per hard casket. The asymmetry is the owner's
ruling; the 1/50 was invented, because no purple sweet or candy exists anywhere in the
274 tree, and plan ruling R1 (decision D120) settles it with the arithmetic and records
what it costs to change: one integer and a repack, no id and no save data moved.

Both tiers were opened on the live stack: twenty hard caskets, and three medium ones with
the rate temporarily forced, restored before this commit.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 8: A read-only ledger route, and the in-process integration proof

Two things that only exist together: a way to read a ledger from outside the engine process, and a suite that stands up real `Player`s over one owner key and drives the whole loop.

**Files:**
- Modify: `engine-custom/src/idlescape/management.ts` (185 lines at HEAD; one route)
- Modify: `engine-custom/src/idlescape/management.test.ts` (four cases)
- Create: `engine-custom/src/idlescape/candyIntegration.test.ts`
- Modify: `engine-custom/manifest.json` (one `new` row)
- Modify: `engine-custom/PATCHES.md` (a route paragraph under "Management routes", one typed row)
- Test: `engine-custom/src/idlescape/management.test.ts`, `engine-custom/src/idlescape/candyIntegration.test.ts`

**Interfaces:**
- Consumes: Task 4's `candyStore()` and `CandySnapshotDto`.
- Produces: `GET /owner/:key/candies` on the management port (8897 locally), answering `CandySnapshotDto` as JSON, 401 without the secret, 400 on a key that fails `OWNER_KEY_RE`.

- [ ] **Step 1: Write the failing route cases**

Append to `engine-custom/src/idlescape/management.test.ts`, following the shape the three existing route suites use:

```ts
test('GET /owner/:key/candies needs the secret and a legal key', async () => {
    const f = app();
    try {
        const unsigned = await f.inject({ method: 'GET', url: '/owner/mgmtCandyA/candies' });
        assert.equal(unsigned.statusCode, 401);

        const badKey = await f.inject({ method: 'GET', url: '/owner/..%2Fescape/candies', headers: { 'x-idlescape-mgmt': SECRET } });
        assert.equal(badKey.statusCode, 400);
    } finally {
        await f.close();
    }
});

test('an owner with no ledger answers the empty shape and creates no file', async () => {
    const f = app();
    try {
        const res = await f.inject({ method: 'GET', url: '/owner/mgmtCandyNobody/candies', headers: { 'x-idlescape-mgmt': SECRET } });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { recordings: unknown[]; filled: unknown[]; pendingDelivery: number };
        assert.deepEqual(body.recordings, []);
        assert.deepEqual(body.filled, []);
        assert.equal(body.pendingDelivery, 0);
        // Ruling R11: a polled route must not grow the store's map, or its file count, per key.
        assert.equal(fs.existsSync(path.join(process.env.IDLESCAPE_CANDY_DIR!, 'mgmtCandyNobody.json')), false);
    } finally {
        await f.close();
    }
});

test('the route reports a live recording and a sealed row, and pops nothing', async () => {
    const key = 'mgmtCandyB';
    candyStore().startRecording(key, 'zezima');
    candyStore().accrue(key, 'zezima', 10, 4200);

    const f = app();
    try {
        let body = (await f.inject({ method: 'GET', url: `/owner/${key}/candies`, headers: { 'x-idlescape-mgmt': SECRET } })).json() as CandySnapshotDto;
        assert.equal(body.recordings.length, 1);
        assert.equal(body.recordings[0].character, 'zezima');
        assert.equal(body.recordings[0].xp['10'], 4200);
        assert.equal(body.filled.length, 0);

        candyStore().seal(key, Date.now() + 4_000_000);
        body = (await f.inject({ method: 'GET', url: `/owner/${key}/candies`, headers: { 'x-idlescape-mgmt': SECRET } })).json() as CandySnapshotDto;
        assert.equal(body.recordings.length, 0);
        assert.equal(body.filled.length, 1);

        // Twice, because a route that popped a row would be a second exit from the invariant and
        // Eat is meant to be the only one.
        body = (await f.inject({ method: 'GET', url: `/owner/${key}/candies`, headers: { 'x-idlescape-mgmt': SECRET } })).json() as CandySnapshotDto;
        assert.equal(body.filled.length, 1);
    } finally {
        await f.close();
    }
});

test('there is no route that writes the candy ledger', async () => {
    // A proof of absence, and the reason it is worth a case: the bank has an apply route, so the
    // obvious next step for a later session is to add one here. Eat is the only exit.
    const f = app();
    try {
        for (const method of ['POST', 'PUT', 'DELETE'] as const) {
            const res = await f.inject({ method, url: '/owner/mgmtCandyB/candies', headers: { 'x-idlescape-mgmt': SECRET } });
            assert.equal(res.statusCode, 404, `${method} /owner/:key/candies must not exist`);
        }
    } finally {
        await f.close();
    }
});
```

`app()` (`management.test.ts:28`, which is `Fastify()` plus `registerOwnerBankRoutes(f, SECRET)`) and `SECRET` (`:19`, `'s'.repeat(32)`) are the names already in that file; reuse them rather than adding a second factory, and note that `app()` is synchronous, so the `await` in the cases above is only on `inject`. Add `process.env.IDLESCAPE_CANDY_DIR = CANDY_DIR;` beside the existing `IDLESCAPE_BANK_DIR` line in its `before` hook, with `CANDY_DIR` a scratch directory declared beside `BANK_DIR` in the same `fs.mkdtempSync` style, and remove that directory in an `after` hook.

Two things about that file's imports, in both directions. It imports `{ test, before }` from `node:test` and **not `after`**, so the hook the scratch directory needs does not exist yet: widen that one import to `{ test, before, after }`. And it **already** imports `fs`, `os` and `path` at `:3-5`; adding them again is a duplicate-identifier error. The only genuinely new import is `import { candyStore, type CandySnapshotDto } from './candy.js';`.

- [ ] **Step 2: Run and watch them fail**

```powershell
cd engine\server
npx tsx --test --test-force-exit src/idlescape/management.test.ts
```

Expected: the first three FAIL with 404; the fourth passes trivially and will keep passing.

- [ ] **Step 3: Add the route**

In `engine-custom/src/idlescape/management.ts`, inside `registerOwnerBankRoutes`, after the bank routes and before `/owner/health`:

```ts
    /**
     * Read-only. The time candy ledger is the payload behind a bearer-token item, and nothing
     * outside this process can otherwise see it: the bank snapshot shows the item and not the
     * hour inside it. This exists so the invariant is observable (design section 6 asks for an
     * alert, and an alert needs something to compare against) and so a Playwright spec can prove
     * a seal and a redemption.
     *
     * There is deliberately NO write route. Eat is the only path that pops a row, and adding a
     * second one here is the obvious mistake for a later session to make; management.test.ts
     * asserts that POST, PUT and DELETE all 404.
     *
     * A key with no ledger answers the empty shape WITHOUT creating an entry, so polling this
     * cannot grow the store's map. That means a caller cannot tell "no such owner" from "an owner
     * with nothing", which is the right trade for a loopback diagnostic.
     */
    app.get<{ Params: { key: string } }>('/owner/:key/candies', async (req, reply) => {
        if (!authorised(req.headers['x-idlescape-mgmt'], secret)) {
            return reply.status(401).send({ error: 'unauthorised' });
        }
        if (!OWNER_KEY_RE.test(req.params.key)) {
            return reply.status(400).send({ error: 'bad_key' });
        }
        return candyStore().snapshot(req.params.key);
    });
```

with `import { candyStore } from './candy.js';` added to `management.ts`, and the two import edits Step 1 names made in `management.test.ts`.

- [ ] **Step 4: Run and watch them pass**

```powershell
cd engine\server
npx tsx --test --test-force-exit src/idlescape/management.test.ts
```

Expected: PASS, every case.

- [ ] **Step 5: Write the integration suite**

`engine-custom/src/idlescape/candyIntegration.test.ts`, in the `shared.test.ts` style that stands up real `Player`s over one owner key. This is the design's section 10 "integration" test, and it is the one that would catch a seam breaking between two modules that each pass their own suite.

```ts
// install.js first, for the module-graph reason in its header. The whole loop, in process, with
// real Players over one owner key: eat a blank on character A, train across several skills, push
// the clock past the hour, assert the seal AND the bank credit, then eat the full candy on
// character B of the same owner and assert an exact per-skill replay.
import { afterCycle, flushBanks, installIdlescape, ownerBanks } from './install.js';

import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import InvType from '#/cache/config/InvType.js';
import ObjType from '#/cache/config/ObjType.js';
import VarPlayerType from '#/cache/config/VarPlayerType.js';
import Player from '#/engine/entity/Player.js';
import World from '#/engine/World.js';
import { toBase37 } from '#/util/JString.js';

import { candyObjIds, candyStore } from './candy.js';
import { handleCandyHeldOp } from './candyOps.js';
import { setOwnerKey } from './owner.js';

const KEY = 'integrationOwner';
let scratch = '';
let bankScratch = '';

before(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'idlescape-candy-int-'));
    bankScratch = fs.mkdtempSync(path.join(os.tmpdir(), 'idlescape-candy-int-bank-'));
    process.env.IDLESCAPE_BANK_DIR = bankScratch;
    process.env.IDLESCAPE_CANDY_DIR = scratch;
    InvType.load('data/pack');
    ObjType.load('data/pack');
    // VarPlayerType too, which shared.test.ts and installSweep.test.ts both load and which this
    // file cannot skip: afterCycle() below is the whole point of the suite, and without the varp
    // configs tabVarps.ts's varpIds() answers -1 for every name and refuses to memoise, so
    // changedTabVarps and writeTabVarps quietly no-op. Nothing throws; the tick just runs
    // two-thirds of itself and a tab-mirroring regression walks straight through.
    VarPlayerType.load('data/pack');
    installIdlescape();
});

after(() => {
    process.removeListener('exit', flushBanks);
    delete process.env.IDLESCAPE_CANDY_DIR;
    fs.rmSync(scratch, { recursive: true, force: true });
    fs.rmSync(bankScratch, { recursive: true, force: true });
});

function stamped(name: string): Player {
    const n37 = toBase37(name);
    const player = new Player(name, n37, n37);
    setOwnerKey(player, KEY);
    return player;
}

/** Puts characters in World.playerLoop for the duration of the call, then unlinks them. */
function withOnline(players: Player[], fn: () => void): void {
    let uid = 2130706433n;
    for (const player of players) {
        World.playerLoop.add(uid++, player);
    }
    try {
        fn();
    } finally {
        for (const player of players) {
            player.unlink();
        }
    }
}

test('the whole loop: record on A, seal to the bank, eat on B, exact replay', () => {
    const inv = InvType.getId('inv');
    const ids = candyObjIds();
    const alice = stamped('intalice');
    const bob = stamped('intbob');

    withOnline([alice, bob], () => {
        alice.invAdd(inv, ids.blank, 1);
        assert.equal(handleCandyHeldOp(alice, ids.blank, 0, 1), true);

        // Several skills, and Bob training beside her, which is the case design ruling 4 is about.
        alice.addXp(10, 1000);
        alice.addXp(7, 400);
        alice.addXp(3, 250);
        bob.addXp(10, 9999);

        // A whole tick, so the bump sweep, the version bump and the change hook all run for real.
        // Tick 1 and not 0 on purpose: 0 is divisible by 100, which would run the periodic flush
        // and the seal sweep as well and blur what this case is asserting. The tick branches get
        // their own case below.
        World.currentTick = 1;
        afterCycle();

        const recorded = { ...candyStore().snapshot(KEY).recordings[0].xp };
        assert.equal(Object.keys(recorded).length, 3, 'three skills, and none of Bob 9999');

        // The hour ends while nobody is doing anything about it. This is the lazy seal.
        assert.equal(candyStore().seal(KEY, Date.now() + 4_000_000), 1);
        assert.equal(ownerBanks().get(KEY).getItemCount(ids.full), 1, 'the sealed candy is in the SHARED bank, not an inventory');
        assert.equal(candyStore().audit(KEY, 1), null, 'the invariant holds with one row and one banked candy');

        // Bob withdraws it. Inv 95 is the shared owner container, so this is one bank for both.
        ownerBanks().get(KEY).remove(ids.full, 1);
        bob.invAdd(inv, ids.full, 1);
        // audit() is NOT called here, and that is the design's point rather than an omission. It
        // checks the equation only in the form that is always checkable, for an owner with nobody
        // online, where every candy they hold must be in the bank. With Bob holding one, the
        // left-hand side needs a count of an inventory, and nothing can count an offline
        // character's. Its caller owns that precondition, which is why it takes a bank count
        // rather than looking one up, and it is why there is no reconciliation pass at all.
        assert.notEqual(candyStore().audit(KEY, 0), null, 'and the offline-form audit correctly refuses to hold while a character carries one');

        const before = [bob.stats[10], bob.stats[7], bob.stats[3]];
        assert.equal(handleCandyHeldOp(bob, ids.full, 0, 1), true);

        assert.equal(bob.stats[10] - before[0], recorded['10']);
        assert.equal(bob.stats[7] - before[1], recorded['7']);
        assert.equal(bob.stats[3] - before[2], recorded['3']);
        assert.equal(bob.getInventory(inv)!.getItemCount(ids.full), 0);
        assert.equal(candyStore().snapshot(KEY).filled.length, 0);
    });
});

test('the ledger survives a flush and reads back with the same rows', () => {
    const key2 = 'integrationOwner2';
    const alice = stamped('intalice2');
    setOwnerKey(alice, key2);
    withOnline([alice], () => {
        alice.invAdd(InvType.getId('inv'), candyObjIds().blank, 1);
        handleCandyHeldOp(alice, candyObjIds().blank, 0, 1);
        alice.addXp(10, 1000);
    });

    flushBanks(); // widened in Task 4 to flush both stores
    const onDisk = JSON.parse(fs.readFileSync(path.join(scratch, `${key2}.json`), 'utf8')) as { recordings: Record<string, { xp: Record<string, number> }> };
    assert.ok(onDisk.recordings.intalice2.xp['10'] > 0, 'accrual reaches disk on a flush, not only on a seal');
});

test('a tick divisible by 100 both seals the hour and writes the accrual, with nothing else touching either', async () => {
    // The two things Task 4 Step 9 wired into afterCycle, driven the way the engine drives them.
    // Neither is reachable from any other suite: every other seal in this plan happens because a
    // test asked for one, and this is the case that would go red if the sweep or the widened
    // flush were quietly dropped, which is exactly what a later tidy-up of that branch would do.
    const key3 = 'integrationOwner3';
    const carol = stamped('intcarol');
    setOwnerKey(carol, key3);
    const ids = candyObjIds();

    withOnline([carol], () => {
        carol.invAdd(InvType.getId('inv'), ids.blank, 1);
        assert.equal(handleCandyHeldOp(carol, ids.blank, 0, 1), true);
        carol.addXp(10, 1000);
    });

    // The accrual is in memory only at this point: nothing has flushed and nothing has sealed.
    assert.equal(fs.existsSync(path.join(scratch, `${key3}.json`)), true, 'Record itself persisted the recording');
    const beforeSweep = JSON.parse(fs.readFileSync(path.join(scratch, `${key3}.json`), 'utf8')) as CandyDisk;
    assert.deepEqual(beforeSweep.recordings.intcarol.xp, {}, 'the xp is in memory with a dirty flag, not on disk yet');

    // The hour is 1000 ms in this suite (see the before hook). Wait it out, then run ONE tick on
    // a multiple of 100, and touch nothing else: no snapshot(), no seal(), no candy op.
    await new Promise(resolve => setTimeout(resolve, 1200));
    World.currentTick = 100;
    withOnline([carol], afterCycle);

    const after = JSON.parse(fs.readFileSync(path.join(scratch, `${key3}.json`), 'utf8')) as CandyDisk;
    assert.equal(Object.keys(after.recordings).length, 0, 'the sweep sealed the expired recording');
    assert.equal(after.filled.length, 1);
    assert.ok(after.filled[0].xp['10'] > 0, 'and the accrual reached disk, which only the widened 100-tick flush does');
    assert.equal(ownerBanks().get(key3).getItemCount(ids.full), 1, 'the credit landed with nobody asking for it');
});

test('a broken invariant is alerted once, on the 1500-tick sweep, and nothing is corrected', () => {
    // The design's one mitigation for its one accepted risk is an alert, and an alert with no
    // caller is dead code. This is that caller. The owner has a sealed row and no candy in the
    // bank, which is the state a lost withdrawal or a hand-edited file produces, and nobody of
    // theirs is online, which is the only form of the invariant that is checkable at all.
    const key4 = 'integrationOwner4';
    const dave = stamped('intdave');
    setOwnerKey(dave, key4);
    const ids = candyObjIds();

    withOnline([dave], () => {
        dave.invAdd(InvType.getId('inv'), ids.blank, 1);
        handleCandyHeldOp(dave, ids.blank, 0, 1);
    });
    candyStore().seal(key4, Date.now() + 4_000_000);
    assert.equal(ownerBanks().get(key4).getItemCount(ids.full), 1);
    ownerBanks().get(key4).remove(ids.full, 1); // the mutation: the candy leaves without an Eat

    const lines: string[] = [];
    const realError = console.error;
    console.error = (...args: unknown[]): void => { lines.push(args.map(String).join(' ')); };
    try {
        World.currentTick = 1500;
        // Nobody online at all, so key4 is in the offline set the sweep audits.
        withOnline([], afterCycle);
        World.currentTick = 3000;
        withOnline([], afterCycle);
    } finally {
        console.error = realError;
    }

    const mine = lines.filter(l => l.includes(key4));
    assert.equal(mine.length, 1, `one line per owner per process, got ${JSON.stringify(mine)}`);
    assert.ok(mine[0].includes('candy invariant broken'), mine[0]);
    assert.equal(candyStore().snapshot(key4).filled.length, 1, 'the alert corrected nothing');
});
```

`withOnline([], afterCycle)` is the empty case of the same helper and needs no change to it: the loop over `players` simply does nothing, which is exactly the "no characters online" precondition `audit` documents.

`CandyDisk` is a local shape for the parsed file, declared once beside `KEY` rather than importing the engine type into an assertion:

```ts
interface CandyDisk {
    recordings: Record<string, { xp: Record<string, number> }>;
    filled: { xp: Record<string, number> }[];
}
```

and the `before` hook gains one line, above `installIdlescape()`:

```ts
    // A one second hour. idlescapeConfig captured 3,600,000 at module load, which is why
    // candyStore() re-reads this variable on first use, the same way install.ts re-reads
    // IDLESCAPE_BANK_DIR: a module singleton that only ever reads a config once cannot be
    // pointed at a test fixture any other way. 1000 is CANDY_HOUR_MS_FLOOR, the shortest legal.
    process.env.IDLESCAPE_CANDY_HOUR_MS = '1000';
```

with the matching `delete process.env.IDLESCAPE_CANDY_HOUR_MS;` in `after`.

- [ ] **Step 6: Run it**

```powershell
cd engine\server
npx tsx --test --test-force-exit src/idlescape/candyIntegration.test.ts
```

Expected: PASS, four cases. `World.currentTick` is a plain mutable field on the world singleton (`engine/World.ts:164`, incremented at `:503`) and assigning it is how `installSweep.test.ts` drives the same branches (`:141` does the equivalent for `shutdownTick`); `World.shutdown` is a getter over `shutdownTick`, which stays `-1`, so setting the tick to 100 or 1500 cannot start a shutdown. The fourth case replaces `console.error` for the length of one sweep and restores it in a `finally`; if it reports two lines rather than one, the `warnCandyInvariant` set in `install.ts` was not consulted, and if it reports none, the audit is not being called at all, which is the regression the case exists for. Do not remove the `afterCycle()` calls, they are what make this an integration test rather than a third unit test. The third case takes about 1.2 seconds because it waits out a real one second hour: that is the shortest `CANDY_HOUR_MS_FLOOR` allows, and shortening the wait instead of the hour makes it flaky.

- [ ] **Step 7: Extend `PATCHES.md`, add the manifest row and the typed row, and commit**

Under the existing "Management routes" section:

```markdown
`GET /owner/:key/candies` answers the time candy ledger for one owner: the live recordings, the
sealed rows and `pendingDelivery`. Read-only, and there is deliberately no write route, because
`Eat` is the only path that may pop a row. A key with no ledger answers the empty shape without
creating an entry, so polling it cannot grow the store's map.
```

```
candy | contains | 1 | src/idlescape/management.ts | app.get<{ Params: { key: string } }>('/owner/:key/candies'
```

This is the fourteenth and last candy row, so the verify below expects fourteen.

```powershell
powershell -File scripts/line-ceiling.ps1
powershell -File scripts/engine-overlay.ps1
powershell -File scripts/engine-overlay.ps1 -Check
powershell -File scripts/patches-check.ps1
cd engine\server
npx tsc --noEmit
npx tsx --test --test-force-exit (Get-ChildItem 'src\idlescape\*.test.ts' | ForEach-Object { "src/idlescape/$($_.Name)" })
```

Expected: everything green, the patch runner matching all fourteen candy rows. `management.ts` grows to about 210 lines.

```bash
git add engine-custom/src/idlescape/management.ts \
        engine-custom/src/idlescape/management.test.ts \
        engine-custom/src/idlescape/candyIntegration.test.ts \
        engine-custom/manifest.json \
        engine-custom/PATCHES.md
git -c core.safecrlf=false commit -m "feat(engine): a read-only candy ledger route, and the in-process loop test

GET /owner/:key/candies answers one owner's recordings, sealed rows and pendingDelivery.
Nothing outside the engine could otherwise see filled.length, so the invariant the design
asks to be alerted on had nothing to compare against, and no browser test of a seal was
possible at all.

Read-only on purpose: POST, PUT and DELETE all 404, asserted, because the bank has an
apply route and a second exit from filled is the obvious mistake for a later session. A
key with no ledger answers the empty shape without creating an entry (ruling R11).

candyIntegration.test.ts drives the whole loop over one owner key with two real Players
and a real afterCycle: record on A while B trains beside her, seal to the shared bank,
withdraw to B, eat, and assert an exact three-skill replay. A third case runs one tick on
a multiple of 100 against a one second hour and touches nothing else, which is the only
place the seal sweep and the widened periodic flush are proved: every other seal in the
suite happens because a test asked for one. A fourth breaks the invariant and drives the
1500-tick sweep, asserting exactly one alert line and that nothing was corrected.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 9: The browser proof, the full gate, and the reconciliation

The last task. A Playwright spec that drives the real client through the whole loop against the real stack, `npm run verify` end to end, the design reconciled with a "what actually shipped" section, and the two documents this entry falsifies.

**Files:**
- Create: `web/e2e/candy.pw.test.ts`
- Modify: `web/e2e/helpers.ts` (`readCandies`)
- Modify: `scripts/start-stack.ps1` (`IDLESCAPE_CANDY_HOUR_MS` in the `server/.env` key list)
- Modify: `scripts/verify.ps1` (a short candy hour for the e2e stack, ruling R15)
- Create: `docs/superpowers/ledgers/2026-09-08-time-candy.md` (the promoted ledger)
- Modify: `docs/superpowers/specs/2026-09-06-time-candy-design.md` (the header's entry number, and a new section 12)
- Modify: `.claude/skills/idlescape-content-overlay/SKILL.md` (the pack table's stale entry numbers, plus the three ids now shipped)
- Modify: `.claude/skills/idlescape-engine-overlay/SKILL.md` (the candy store and the fourth prototype patch)
- Modify: `docs/README.md` (the time candy row's status, and the plans table)
- Modify: `docs/superpowers/sprint-control.md` (row 10)
- Modify: `deploy/docker/docker-compose.yml` (one env line; recorded, not released)
- Test: `web/e2e/candy.pw.test.ts`, and `npm run verify`

**Interfaces:**
- Consumes: everything above, plus `IDLESCAPE_CANDY_HOUR_MS`.
- Produces: nothing new in code.

- [ ] **Step 1: Add the helper**

In `web/e2e/helpers.ts`, beside `readBank`:

```ts
export interface CandySnapshot {
  ownerKey: string;
  recordings: { character: string; startedAt: number; expiresAt: number; xp: Record<string, number> }[];
  filled: { sealedAt: number; character: string; xp: Record<string, number> }[];
  pendingDelivery: number;
}

/**
 * The candy ledger, read through the loopback management port. There is no front server route for
 * this: the ledger is engine-internal and the browser never sees it, so the spec talks to the
 * management port directly the way bank.pw.test.ts already does for seeding.
 */
export async function readCandies(ownerKey: string): Promise<CandySnapshot> {
  const api = await managementContext();
  try {
    const res = await api.get(`${MANAGEMENT}/owner/${ownerKey}/candies`);
    expect(res.status(), await res.text()).toBe(200);
    return (await res.json()) as CandySnapshot;
  } finally {
    await api.dispose();
  }
}
```

- [ ] **Step 2: Wire the short hour into the two scripts that decide the engine's environment**

Ruling R15. Without this the spec below cannot pass and cannot be run in the gate, and the failure looks like a bug in the spec rather than a missing wire.

`scripts/start-stack.ps1` reads `server/.env` for exactly two keys and sets only those into the engine's process environment. Find that loop by its anchor, not by line number, because sprint entry 3 rewrites this file: it is the `foreach` over `@('OWNER_ASSERTION_SECRET', 'ENGINE_MANAGEMENT_SECRET')` under the comment about `server/.env` being the single source of truth for both. Add the third key:

```powershell
  foreach ($key in @('OWNER_ASSERTION_SECRET', 'ENGINE_MANAGEMENT_SECRET', 'IDLESCAPE_CANDY_HOUR_MS')) {
```

and extend that comment block by two sentences, in its voice:

```powershell
# IDLESCAPE_CANDY_HOUR_MS is optional and lifted the same way: it shortens a time candy
# recording so web/e2e/candy.pw.test.ts can prove a seal and a redemption without waiting an
# hour. An absent line leaves the engine on its 3,600,000 default, and the engine prints the
# resolved value in its overlay-active line either way.
```

`scripts/verify.ps1`, in the e2e block that sets `$env:WEB_DIST = '../web/dist-e2e'` immediately before it starts the stack (again by anchor, entry 3 rewrites this file too), set the hour beside it and restore it in the same `finally` that restores `WEB_DIST`:

```powershell
    # The candy spec (web/e2e/candy.pw.test.ts) records an hour and waits for it to seal, and
    # playwright.config.ts has no grep, so this spec is in the gate whatever we do. Eight seconds
    # is what makes it a test rather than an hour of waiting. A Start-Process child inherits this
    # process's environment, which is how WEB_DIST already reaches the front server. The shipping
    # 3,600,000 default is covered by engine-custom/src/idlescape/config.test.ts, three ways plus
    # its floor; the e2e world is not a shipping world (it also runs -DevStaff).
    $priorCandyHour = $env:IDLESCAPE_CANDY_HOUR_MS
    $env:IDLESCAPE_CANDY_HOUR_MS = '8000'
```

with `$env:IDLESCAPE_CANDY_HOUR_MS = $priorCandyHour` beside `$env:WEB_DIST = $priorWebDist` in the `finally`.

- [ ] **Step 3: Write the spec**

`web/e2e/candy.pw.test.ts`. It needs the short hour Step 2 wired, which is ruling R7's whole reason for existing.

```ts
/**
 * The time candy loop, in the real client against the real stack.
 *
 * REQUIRES a short hour: IDLESCAPE_CANDY_HOUR_MS, which scripts/verify.ps1 sets to 8000 for its
 * e2e stack and scripts/start-stack.ps1 lifts out of server/.env for a hand-started one. Set it
 * in server/.env for a local run. With the default 3600000 this spec times out, which is not a
 * bug in it; if it times out with the variable set, check that the ENGINE received it (the
 * engine prints the resolved value in its overlay-active line on start).
 *
 * The ledger is read through the loopback management port, because it is engine-internal and the
 * browser never sees it. The bank is read through /api/bank, which is where the CREDIT half of a
 * seal is observable with no new code at all.
 */
import { expect, test, type Page } from '@playwright/test';

import { createCharacterFromPanel, idTokenFor, managementContext, MANAGEMENT, openCharacterTab, readBank, readCandies, signUpAndPlay } from './helpers';
import { leaveTutorial, seedCharacter } from './harness';

const CANDY_BLANK = 3894;
const CANDY_FULL = 3895;
/** `magic:highlvl_alchemy` is interface component 1178 (engine/content/pack/interface.pack). */
const HIGH_ALCHEMY = 1178;

/** The slot holding `id`, or -1. The observed state's inventory is InventoryItem[] with .slot/.id. */
async function slotOf(page: Page, id: number): Promise<number> {
  return page.evaluate(objId => window.idlescape!.tasks!.getState()?.inventory.find(i => i.id === objId)?.slot ?? -1, id);
}

/** A skill's experience off the observed state. SkillState carries name/level/baseLevel/experience. */
async function xpOf(page: Page, skill: string): Promise<number> {
  return page.evaluate(name => window.idlescape!.tasks!.getState()?.skills.find(s => s.name.toLowerCase() === name)?.experience ?? 0, skill);
}

/**
 * Moves one full candy out of the shared owner bank and into the current character's inventory.
 *
 * Two halves on purpose, and the pair keeps the invariant intact: the management `delta` takes it
 * out of the bank, and `::give` puts it in hand, so the owner still holds exactly one candy and
 * `filled.length` still matches. Driving the bank interface instead would be testing SP8c's tabs,
 * which have their own spec; what this spec is proving is that a DIFFERENT character can eat it.
 */
async function withdrawFull(page: Page, ownerKey: string): Promise<void> {
  const api = await managementContext();
  try {
    const res = await api.post(`${MANAGEMENT}/owner/${ownerKey}/bank/apply`, { data: { expectedVersion: null, ops: [{ obj: CANDY_FULL, delta: -1 }] } });
    expect(res.status(), await res.text()).toBe(200);
  } finally {
    await api.dispose();
  }
  await page.evaluate(() => window.idlescape!.tasks!.dispatch({ type: 'say', message: '::give time_candy_filled 1', reason: 'e2e' }));
  await expect.poll(() => slotOf(page, CANDY_FULL), { timeout: 15_000 }).toBeGreaterThanOrEqual(0);
}

test('an hour recorded on one character is banked and replayed on another', async ({ page }) => {
  const account = `candy${Date.now()}`;
  const email = await signUpAndPlay(page, account, 'candyone');
  await seedCharacter(page, { inventory: [['time_candy', 1]] });

  // The owner key is on the bank snapshot the front server already serves; there is no need for a
  // new field on the observed state to get it.
  const idToken = await idTokenFor(email);
  const ownerKey = (await readBank(page, idToken)).ownerKey;
  expect(ownerKey, 'the character is stamped with an owner key').not.toBe('');

  // Record: use the blank candy's first inventory option.
  const blankSlot = await slotOf(page, CANDY_BLANK);
  await page.evaluate(s => window.idlescape!.tasks!.dispatch({ type: 'useInventoryItem', slot: s, optionIndex: 0, reason: 'e2e' }), blankSlot);

  await expect.poll(async () => (await readCandies(ownerKey)).recordings.length, { timeout: 15_000 }).toBe(1);

  // Train. ::~addxp is the content debugproc (cheat_other.rs2), which ends in stat_advance and so
  // reaches PlayerOps.ts:816's addXp with allowMulti DEFAULTED TRUE, exactly as ordinary training
  // does. Do not reach for ::advancestat here: it is the one cheat that calls addXp directly and
  // it passes allowMulti false, which the accrual patch skips by design, so it would record
  // nothing and every assertion below would time out on an empty xp map.
  await page.evaluate(() => window.idlescape!.tasks!.dispatch({ type: 'say', message: '::~addxp woodcutting 500', reason: 'e2e' }));
  await expect.poll(async () => Object.keys((await readCandies(ownerKey)).recordings[0]?.xp ?? {}).length, { timeout: 15_000 }).toBeGreaterThan(0);
  const recorded = (await readCandies(ownerKey)).recordings[0].xp;

  // The hour ends. Sealing is lazy, so something has to read: the route is a read.
  await expect.poll(async () => (await readCandies(ownerKey)).filled.length, { timeout: 30_000 }).toBe(1);
  expect((await readCandies(ownerKey)).filled[0].xp).toEqual(recorded);

  // The credit half, through the browser's own bank route.
  await expect.poll(async () => (await readBank(page, idToken)).slots.filter(s => s.obj === CANDY_FULL).length, { timeout: 30_000 }).toBe(1);

  // A second character of the SAME account eats it. This is the point of the item.
  //
  // Through the in-game Characters panel, not the characters gate: #char-name and
  // #btn-char-create belong to #screen-characters, which is where a registered account with NO
  // character has to name one. This account already has candyone, so boot resumes straight into
  // #screen-frame and that gate never renders. openCharacterTab waits on the new session's own
  // loggedIn/hidden rather than on the facade's gameName, which is the race helpers.ts records as
  // having lost about one run in three.
  await createCharacterFromPanel(page, 'candytwo');
  await openCharacterTab(page, 'candytwo');
  await leaveTutorial(page);

  await withdrawFull(page, ownerKey);
  const fullSlot = await slotOf(page, CANDY_FULL);
  const before = await xpOf(page, 'woodcutting');
  await page.evaluate(s => window.idlescape!.tasks!.dispatch({ type: 'useInventoryItem', slot: s, optionIndex: 0, reason: 'e2e' }), fullSlot);

  await expect.poll(() => xpOf(page, 'woodcutting'), { timeout: 15_000 }).toBeGreaterThan(before);
  expect((await readCandies(ownerKey)).filled).toHaveLength(0);
  expect(await slotOf(page, CANDY_FULL), 'the item is consumed with the row').toBe(-1);
});

test('a full candy cannot be dropped', async ({ page }) => {
  const account = `candydrop${Date.now()}`;
  await signUpAndPlay(page, account, 'candydrop');
  await seedCharacter(page, { inventory: [['time_candy_filled', 1]] });

  const slot = await slotOf(page, CANDY_FULL);
  await page.evaluate(s => window.idlescape!.tasks!.dispatch({ type: 'dropItem', slot: s, reason: 'e2e' }), slot);

  // Still there after enough ticks for a drop to have happened.
  await page.waitForTimeout(3000);
  expect(await slotOf(page, CANDY_FULL)).toBe(slot);
});

test('a full candy cannot be alched', async ({ page }) => {
  // The alchemy exit is closed in RuneScript (a `case time_candy_filled` in ~is_alchable), and a
  // patches-check row can only prove that line exists in the file. This proves it WORKS. Both
  // alchemy spells funnel through that proc, and they are the only two of the eight opheldt
  // triggers that accept an arbitrary item.
  const account = `candyalch${Date.now()}`;
  await signUpAndPlay(page, account, 'candyalch');
  // ~check_spell_requirements runs BEFORE ~is_alchable, so the cast has to be legal first: level
  // 55 magic and the two runes, or the refusal under test is never reached and the case passes
  // for the wrong reason.
  await seedCharacter(page, {
    skills: [['magic', 99]],
    inventory: [['time_candy_filled', 1], ['firerune', 100], ['naturerune', 100]]
  });

  const slot = await slotOf(page, CANDY_FULL);
  await page.evaluate(
    ([s, spell]) => window.idlescape!.tasks!.dispatch({ type: 'spellOnItem', slot: s, spellComponent: spell, reason: 'e2e' }),
    [slot, HIGH_ALCHEMY] as const
  );

  await page.waitForTimeout(3000);
  expect(await slotOf(page, CANDY_FULL), 'the candy survives High Alchemy').toBe(slot);
});

test('a full candy survives a death, and a death holding none is clean', async ({ page }) => {
  // The death exit is the one that matters most, for two reasons. A later edit that drops the
  // restore half or moves the insertion past inv_dropall keeps the patches-check row green and
  // destroys a candy on every death; and ruling R9's guard, if it ever came off, would throw out
  // of player_death_lose_items on nearly every death in the world. Both halves are asserted here.
  const account = `candydeath${Date.now()}`;
  await signUpAndPlay(page, account, 'candydeath');
  await seedCharacter(page, { inventory: [['time_candy_filled', 2], ['bronze_axe', 1]] });

  await page.evaluate(() => window.idlescape!.tasks!.dispatch({ type: 'say', message: '::~death', reason: 'e2e' }));
  await expect.poll(() => countOf(page, CANDY_FULL), { timeout: 30_000 }).toBe(2);
  expect(await holdsNamed(page, 'axe'), 'the rest of the inventory dropped as usual').toBe(false);

  // And again with nothing to carry, which is the case the inv_total > 0 guard exists for:
  // inv_moveitem runs check(count, ObjStackValid) before its completed == 0 early return, and
  // that validator throws on 0. An unguarded death would leave the character where it died.
  await page.evaluate(() => window.idlescape!.tasks!.dispatch({ type: 'say', message: '::~death', reason: 'e2e' }));
  await expect.poll(() => countOf(page, CANDY_FULL), { timeout: 30_000 }).toBe(2);
});
```

`countOf` and `holdsNamed` are two more readers beside `slotOf`, both at the top of the file with the others. There is no id constant for the axe and none is added: reading it by name is enough to prove the ordinary inventory dropped.

```ts
/** How many of `id` the character holds, summed across slots. */
async function countOf(page: Page, id: number): Promise<number> {
  return page.evaluate(
    objId => (window.idlescape!.tasks!.getState()?.inventory ?? []).filter(i => i.id === objId).reduce((n, i) => n + i.count, 0),
    id
  );
}

/** Whether the character holds an item with this debug-ish display name. Used to prove a death dropped. */
async function holdsNamed(page: Page, name: string): Promise<boolean> {
  return page.evaluate(n => (window.idlescape!.tasks!.getState()?.inventory ?? []).some(i => i.name.toLowerCase().includes(n)), name);
}
```

The action names come from the SDK's own union (`web/src/vendor/rs-sdk/sdk/types.ts:611-630`): `useInventoryItem { slot, optionIndex }` is an OPHELD and covers both Record and Eat, `dropItem { slot }` is op 5, and `spellOnItem { slot, spellComponent }` is the OPHELDT the alchemy case uses. The observed state's shapes are `InventoryItem { slot, id, name, count, optionsWithIndex }` (`:66-72`) and `SkillState { name, level, baseLevel, experience }` (`:54-59`).

Four specs in one file rather than two, and all four are cheap: three of them never wait for an hour, only for a few ticks.

- [ ] **Step 4: Build and run the spec**

Add `IDLESCAPE_CANDY_HOUR_MS=8000` to `server/.env`, which Step 2 taught `start-stack.ps1` to lift. `-DevStaff` is required for the same reason it is in Tasks 5 and 7: `seedCharacter` and `leaveTutorial` are cheats, and `-Prod` alone leaves staffmodlevel at 0.

```powershell
cd web
npm run build:e2e
cd ..
Start-Process powershell -ArgumentList '-NoExit', '-File', 'scripts/start-stack.ps1', '-Prod', '-DevStaff'
```

Wait for `World ready`, then confirm the engine actually received the hour before blaming the spec: `logs/engine.log` ends its overlay-active line with `candyHour=8000ms`. Then:

```powershell
cd web
npx playwright test e2e/candy.pw.test.ts
```

Expected: all four specs pass. **Playwright runs from `web/`**: from the repository root it reports "No tests found" and exits 0, which reads as green.

- [ ] **Step 5: The full gate**

Stop the stack from the window that started it. **Leave `IDLESCAPE_CANDY_HOUR_MS` alone**: `verify.ps1` sets its own value for its own stack (Step 2, ruling R15), and the gate deliberately runs the candy spec on an eight second hour because `playwright.config.ts` has no grep and the spec is in the run whatever `server/.env` says. Restoring 3,600,000 first would put the shipping hour in front of a spec that waits thirty seconds for a seal, and step 10 would go red on the spec this task just wrote. Then, from the repository root:

```powershell
npm run verify
```

Expected: all ten steps green. What a green here does and does not prove is worth restating, because this entry's riskiest artefact is outside it: verify **never packs**, so it proves the tracked `.pack` files match the pin (`packIds.test.ts`), that the clone matches the tracked files (the content overlay apply and drift check), and that a stack starts and the browser suite passes. It does not prove the append packs. That was proven by hand in Task 1 Step 11 and again in Tasks 5 and 7, and it must be re-proven by hand after any later content edit. It also does not prove the 3,600,000 default, deliberately: that is `config.test.ts`'s job, three ways plus the floor.

- [ ] **Step 6: Reconcile the design with what shipped**

Two edits to `docs/superpowers/specs/2026-09-06-time-candy-design.md`.

First the header: it says `Sprint: Dragon Slayer, entry 4`. Decision D25 and then D32 renumbered it; it is **entry 10**. Fix the line and nothing else in the header.

Then append a section 12, in the shape SP8b's spec section 12 set for this project. It is the account a later entry inherits from, so it says what changed and why, not what was hard:

```markdown
## 12. What actually shipped

Written when the entry landed, on `sprint/dragon-slayer`. Where this section and sections 1 to 11
disagree, this section is what is in the code.

**Delivered as designed.** Both objs at the pinned ids, the blank tradeable and the full one not;
the medium 1/50 roll and the hard `case 21`; the per-character recording with a wall-clock hour;
lazy sealing; the sealed candy credited to the owner bank through the server-internal `delta`;
`Eat` as an exact per-skill replay with `allowMulti: false`; `Check`; `time_candy_keep` across both
death procs; and no web surface.

**Changed, with the reason.**

1. **The alchemy exit is content, not `OpHeldUHandler.ts`** (plan ruling R3, decision D122).
   Sections 6 and 9 name that handler on the grounds that it is how alchemy reaches a held item.
   It is not: `OpHeldU` is item-on-item, and `alchemy.rs2` registers `[opheldt,...]`. The exit is
   one `case time_candy_filled` in `~is_alchable`, which both spells funnel through.
   `OpHeldUHandler.ts` is not replaced and neither is `OpHeldTHandler.ts`.
2. **`OpHeldHandler.ts` is a whole-file replacement rather than a prototype patch** (ruling R5,
   decision D123), because the intercept must sit after the handler's validation and before its
   trigger dispatch, and a wrapper can be neither.
3. **The accrual records the observed `stats[stat]` delta, not `xp * xpRate`** (ruling R6).
   Section 5's pseudocode and its "matches exactly what addXp added" sentence disagree with each
   other: `Player.stats` is an `Int32Array`, `xpRate` can be fractional, and the 200,000,000 cap
   absorbs part of a grant. The delta satisfies the sentence.
4. **Both death insertions are guarded by `inv_total(...) > 0`** (ruling R9). `inv_moveitem` runs
   `check(count, ObjStackValid)` before its `completed == 0` early return, and that validator
   throws on 0, which is the count on nearly every death in the world.
5. **`pendingDelivery` absorbs a suspended bank as well as a full one** (ruling R13). Section 6
   names only "the bank was full"; an `unavailable` outcome would otherwise destroy the candy
   because of an unrelated bank fault. The two are logged differently.
6. **The hour is configurable** (`IDLESCAPE_CANDY_HOUR_MS`, ruling R7, decision D124), because a
   hardcoded 3,600,000 leaves the entry with no browser-level proof of a seal or a redemption at
   all. Floored at 1000 ms and printed at every engine start.
7. **`Record` consumes the blank and a refused Record keeps it** (ruling R10). The design does not
   say what happens to the blank; leaving it would make the item infinite.
8. **The summary line shows player-facing experience, not tenths** (ruling R12). Section 8's
   example mixes the two: `{ "10": 582000 }` is 58,200 experience, not 64,200.
9. **Sealing is still lazy, but `afterCycle` is what reads** (ruling R14, decision D125). Section 5
   says "no background job or tick sweep is needed" and section 9 puts a login-time seal in
   `install.ts`. Neither survives contact with the rest of the design: there is no login hook in
   the overlay to hang one on, an experience grant deliberately does not seal (that would put an
   `fs` write in a path that fires several times a second per player), and every remaining reader
   needs an item the player has not been credited yet. So the 100-tick branch that already flushes
   seals for every owner with a character online, and the 1500-tick branch audits the offline set.
   Sealing is unchanged in meaning: nothing accrues after `expiresAt`, so the sweep produces the
   state a lazy read would have.
10. **The invariant's alert has a caller** (also R14). Section 6 asks that the invariant be
    "checked and logged wherever it is genuinely checkable... and a mismatch is an alert, not an
    automatic correction". `audit()` is that check and the 1500-tick sweep is what calls it, once
    per owner per process. Without a caller the design's one mitigation for its one accepted risk
    would have shipped as dead code.
11. **The recorded hour is short inside `npm run verify`** (ruling R15, decision D126).
    `scripts/start-stack.ps1` lifts `IDLESCAPE_CANDY_HOUR_MS` out of `server/.env` beside the two
    secrets, and `scripts/verify.ps1` sets eight seconds for the stack it starts. The alternative
    was skipping the browser spec by default, and a skip reads as green.

**Added.** `GET /owner/:key/candies` on the management port, read-only, because nothing outside the
engine could otherwise observe `filled.length` and section 6 asks for an alert (ruling R11).

**Corrections to section 2's facts.** One obj description contains the word `sweet`
(`gnome_cooking.obj:33`), so "zero matches" wanted the word "item". The 40 hard rare entries are 31
in `trail_clue_hard_rare` plus 9 in a separate `trail_clue_hard_ultrarare`. Section 7's line ranges
are `death.rs2:47-101` and `:103-158`, not `:47-102` and `:103-160`. And there is no Destroy
confirmation anywhere in this content tree, so refusing op 5 closes one exit rather than two; the
refusal is still necessary, because `ObjType`'s `iop` default puts `Drop` at index 4.

**Still not built, and named so nobody looks for it.** No web surface for candies, no way to
inspect a recording from the browser, no Contracts or market integration, and no self-healing
reconciliation: the invariant is checked where it is checkable, logged once per owner per process,
and never corrected. One consequence is worth stating plainly rather than leaving to be discovered:
an owner with no character online anywhere seals nothing, so a candy whose hour ended while every
one of that owner's characters was offline arrives in the bank on the next tick one of them is in
the world. That is the first moment the credit could matter to them, and the redeem path seals
again before it pops, so nothing is lost; it is not the eager credit a reader of section 5 might
picture.
```

- [ ] **Step 7: Update the two skills and the three documents**

`.claude/skills/idlescape-content-overlay/SKILL.md`: its pinned pack table still labels the six sprint ids "sprint entry 4" and "entry 5"; D32 renumbered them to 10 and 11. Fix the labels, and mark `obj` 3894, `obj` 3895 and `inv` 219 as **shipped** rather than allocated. Add the recol fact, because it cost a measurement and will cost the next person the same one: obj `recol` values are RGB555 and the packer converts them, so a source colour must be the RGB555 that maps to the model's face colour, and `inv_chocolate`'s is `11426`.

`.claude/skills/idlescape-engine-overlay/SKILL.md`: add the candy store beside the owner bank in whatever list that skill keeps of what the overlay owns, name `Patch 4` alongside the three prototype patches, and name `OpHeldHandler.ts` in the replacement list.

`docs/README.md`: the time candy spec's status row becomes `delivered; section 12 is what actually shipped`, and the plans table gains `2026-09-08-time-candy.md | Sprint entry 10 | executed`.

`docs/superpowers/sprint-control.md`: move row 10 to done with the closing commit.

`deploy/docker/docker-compose.yml`: one line beside the existing `IDLESCAPE_BANK_DIR`, recorded and **not released** (board gate G5):

```yaml
      IDLESCAPE_CANDY_DIR: /opt/engine/data/candies
```

The named volume `engine-db` is already mounted at `/opt/engine/data` as a directory for exactly this reason, so no new volume is needed. Without this line a container replace discards every recorded hour, which is decision D74's failure repeated on a second store.

- [ ] **Step 8: List the decisions this entry recorded**

Confirm the seven rows the planner appended are in `docs/superpowers/decisions.md` and that nothing else in this plan wanted one: **D120** (the medium rate stays 1/50, settling D8a), **D121** (a 0 XP hour still seals, settling D8b), **D122** (the alchemy exit is `~is_alchable` and `OpHeldUHandler.ts` comes off the design's replacement list), **D123** (`OpHeldHandler.ts` is replaced whole rather than prototype-patched), **D124** (`candyHourMs` is ordinary configuration), **D125** (`afterCycle` seals for online owners and audits offline ones, which amends the design's "no tick sweep is needed"), **D126** (`npm run verify` runs the browser spec on a short hour, and `start-stack.ps1` and `verify.ps1` carry the value). If an executor makes a further ruling that crosses entries or amends a spec, it gets its own row at the next free id, appended after re-reading the file.

- [ ] **Step 9: Write the promoted ledger**

`docs/superpowers/ledgers/2026-09-08-time-candy.md`, in the shape `docs/superpowers/SDD.md` sets and decision D19 requires: the rulings as executed, the fix rounds, and the deferred minors, under 400 lines. The live workspace at `.superpowers/sdd/2026-09-08-time-candy-plan/` is git-ignored scratch and is not the record; a committed file may not cite a path under it.

Five observations belong in it and exist nowhere else once the tree is clean. Copy them from the task steps that made them rather than reconstructing them:

- the casket counts from Task 7 Step 5, both tiers, which are the only evidence either drop rate exists at all;
- the messages observed in Task 5 Step 8, one line per item, including the two deaths;
- both watched mutation failures from Task 6 Step 5 (the defaulted `allowMulti` reporting 2500 against 500, and the redeem moved after the grant letting a second `Eat` grant);
- which hashing rule Task 5 Step 1 used, blob or disk, and what `scripts/content-overlay.ps1` did at that moment;
- anything an executor ruled beyond R1 to R15, with its decisions.md id if it took one.

- [ ] **Step 10: Final verify and commit**

```powershell
npm run verify
```

Expected: ten steps green, from a clean tree.

```bash
git add web/e2e/candy.pw.test.ts web/e2e/helpers.ts \
        scripts/start-stack.ps1 scripts/verify.ps1 \
        docs/superpowers/specs/2026-09-06-time-candy-design.md \
        docs/superpowers/ledgers/2026-09-08-time-candy.md \
        docs/README.md docs/superpowers/sprint-control.md \
        .claude/skills/idlescape-content-overlay/SKILL.md \
        .claude/skills/idlescape-engine-overlay/SKILL.md \
        deploy/docker/docker-compose.yml
git -c core.safecrlf=false commit -m "feat(time-candy): prove the loop in the browser and reconcile the spec

candy.pw.test.ts drives the real client through record, seal, bank credit, withdraw on a
second character, and eat, reading the ledger through the management port and the credit
through /api/bank. Three more specs close the exits a grep cannot: the drop refusal, High
Alchemy on a full candy, and two deaths, one holding candies and one holding none.

It needs IDLESCAPE_CANDY_HOUR_MS set short, which is what plan ruling R7 exists for: with
a hardcoded hour this entry would ship with no browser proof at all. start-stack.ps1 now
lifts that variable out of server/.env beside the two secrets, and verify.ps1 sets eight
seconds for its own stack, because playwright.config.ts has no grep and the spec is in
the gate whatever server/.env says (ruling R15, decision D126).

The design gains a section 12: eight changes with their reasons, one addition, four
corrections to its section 2 facts, and what was deliberately not built. Its header said
entry 4; D32 renumbered it to 10.

The content overlay skill's pack table said entry 4 and entry 5 for the six sprint ids
and is corrected, with the three time candy ids marked shipped and the RGB555 recol fact
recorded so the next session does not re-measure it.

The compose file gains IDLESCAPE_CANDY_DIR on the existing engine-db volume. Recorded,
not released: the release stays owner-gated.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Executor notes

**Dependency order, and it is strictly sequential.** 1 to 9, in order. Task 1 must land before anything else can resolve an obj id, and every engine task from 4 onward reads the packed cache. Tasks 5, 6 and 7 all edit files Task 4 created or content the pack compiles together, and Task 8's integration suite exercises Tasks 4 to 6 together. **No task in this plan can run in parallel with another**: there is one working tree, one packed cache, one engine port and one `data/pack`, and two agents packing at once corrupt each other's output. Decision D5 already rules that execution workflows run sequentially in the main tree with no per-task worktrees, and the junction hazard behind that ruling has cost two dependency wipes.

**This plan executes after entry 3 lands, and after entries 4 to 9 in sprint order.** Task 1 Step 1 asserts the entry 3 half and stops if it is missing. Nothing here depends on entries 4 to 9, but the sprint order is the order, and taking entry 10 early would put a content pack in front of the shell v2 and script entries that were sequenced first for their own reasons.

**Reconcile against HEAD before dispatching Tasks 4 to 8.** Every line number this plan quotes inside `engine-custom/src/idlescape/*` was measured on 2026-09-08 at HEAD `d8244f0`. Entries 4 to 9 land between then and this plan's execution, and SP8c in particular edits the engine overlay. Before each of those tasks, re-read the file the step modifies and confirm the anchor still reads as quoted; the quoted line numbers in `engine/server` and `engine/content` are pinned by revision and will not move.

**The three things most likely to go wrong, in the order they will happen.**

1. **A green gate that proved nothing about the pack.** `npm run verify` never runs `BuildOverlay.ts`. After every content edit, apply twice and pack by hand, and read the pack's own last line. About seven minutes.
2. **A `baseSha256` taken by the wrong rule.** Entry 3 inverts the SP8c plan's bolded instruction: the content manifest moves from hashing the file on disk to hashing the upstream git blob. Both columns are recorded in Tasks 5 and 7 so the executor can write either without re-measuring, but the executor must check which rule `scripts/content-overlay.ps1` uses at the time and say so in the commit.
3. **A pack file rewritten under you.** `.gitattributes` is `* text=auto` with `*.pack text eol=lf`, and its own comment explains why `-text` would not do: `PackFileBase.save()` joins with `'\n'` while `FsCache.writeFileIfChanged` compares exact text, so a CRLF `.pack` is rewritten by the first pack run, which `packGuard.ts` then reports as a moved id and `BuildOverlay.ts` turns into an exit 1 accusing you of corrupting bank data. The four replaced `.rs2` files are a different and much smaller story: nothing pins them, they are CRLF in the working tree here, and `scripts/content-overlay.ps1` hashes source against destination and then copies byte for byte, so the endings do not matter and the second apply reports 0 copied either way. Run the second apply anyway, in every content task: what it proves is that the copy landed and that nothing rewrote the destination in between.

**What to do if the medium rate turns out wrong.** It is one integer in one overlay file plus a repack, and it moves no id and no save data. That is ruling R1's whole argument, and the alternative it names is 1/12. Do not change it without re-reading D120 and recording the observed evidence: the two multipliers that make the live rate worse than the arithmetic (f2p ground drops no clues, and one clue anywhere in an account blocks clue drops for every character of that owner because `~trail_hasclue_all` checks the shared bank) are properties of this world's SP8 shared bank, not of the rate.

**What to do if a suite is over 400 lines.** Split it, never trim the comments. `verify.ps1` enumerates `src\idlescape\*.test.ts`, so a new file is picked up with no list to edit. `candyOps.test.ts` is the one most likely to cross: Task 6 Step 7 names the split.

**Stopping conditions.** Stop and report rather than working around: entry 3's `packIds.ts` or `patches-check.ps1` missing (Task 1 Step 1); a `BuildOverlay.ts` run that names a moved pack file (that is a data-corruption event, and the recovery is in Task 1 Step 11); an upstream blob sha that does not match the one recorded here (the clone is off the pin); and any change that would need a new `category=`, `param=` or RuneScript trigger **name**, because those three packs are not pinned and the guard cannot protect them.

**Ledger.** The live workspace is `.superpowers/sdd/2026-09-08-time-candy-plan/`, which is git-ignored scratch. The record is the promoted ledger at `docs/superpowers/ledgers/2026-09-08-time-candy.md`, written at close and committed with the closing commit, per `docs/superpowers/SDD.md` and decision D19. **Task 9 Step 9 writes it and Task 9 Step 10 stages it by name**, because this plan's own rule is explicit `git add <paths>` and a file nobody names is a file left untracked in a tree everyone believes is clean. Record in it: the observed casket counts from Task 7 Step 5, the observed messages from Task 5 Step 8, both watched mutation failures from Task 6 Step 5, and which hashing rule Task 5 Step 1 used.
