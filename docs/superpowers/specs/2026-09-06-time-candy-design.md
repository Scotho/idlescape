# Idlescape — Time candy: a recorded hour of experience

Date: 2026-09-06
Status: owner request 2026-09-06 ("spec up a new item... time candy"); design approved in
brainstorming, spec recorded for review
Depends on: SP1b (content overlay mechanism and the 274 pin), SP8 (owner key, owner bank store
and its server-internal `delta` op)
Sprint: Dragon Slayer, entry 4 (`2026-09-07-sprint-dragon-slayer.md`)
Amends: nothing. This is not a numbered sprint 1 sub-project.

## 1. What this delivers

A pair of custom items that let a player bank an hour of their own training and spend it later,
on any of their characters.

1. **Time candy** (blank) drops from medium and hard clue caskets, stacks, and trades freely.
2. Clicking `Record` on a blank candy starts a **one hour recording** on that character. It
   cannot be cancelled, paused or stopped.
3. Every point of experience that character earns during the hour is **copied** into the
   recording. The player still receives it live, as normal: the candy is bonus experience, not
   diverted experience.
4. When the hour is up the recording seals into a **Time candy (full)**, credited to the owner
   bank.
5. Clicking `Eat` on a full candy grants the recorded experience **again, skill for skill**, to
   whichever character eats it. Full candies are owner-bound: they move between the owner's own
   characters through the shared bank, and cannot be traded or dropped to anyone else.

Not delivered here: any web-client surface for candies (they are visible in the SP8b bank as an
ordinary item and nothing more), a way to inspect a recording in progress from the browser, and
any Contracts or market integration beyond blank candies being ordinarily tradeable.

## 2. Facts this design rests on (verified 2026-09-06 against the 274 pin)

| Fact | Where |
|---|---|
| No purple sweet, candy or equivalent exists in the content tree. 2,629 obj configs, zero matches for `sweet` or `candy`. The requested "same rate as purple candy" has no local anchor, so section 4's rates were chosen instead. | `engine/content/scripts/**/*.obj` |
| Clue tiers are easy, medium and hard only. "Medium or above" is medium plus hard. | `minigames/game_trail/scripts/{easy,medium,hard}/` |
| Medium caskets roll `3 + random(3)` times; each roll is rare at `random(66) = 0`, else common from a 27 entry table. | `trail_clue_medium_reward.rs2:1-16` |
| Hard caskets roll `4 + random(3)` times; each roll is rare at `random(45) = 0`, else common from a 21 entry table. The rare table has 40 entries. | `trail_clue_hard_reward.rs2:1-16` |
| `trail_rewardinv` is size 9 with `stackall=yes`, so a medium casket's worst case (5 rolls plus a candy) fits. | `player/configs/player.inv:12-15` |
| `Player.addXp(stat, xp, allowMulti)` is the single choke point for experience. It applies `Environment.node.xpRate` when `allowMulti`, stores tenths in `this.stats[stat]`, caps at 2,000,000,000 and fires its own level-up handling. | `engine/entity/Player.ts:1819` |
| Its only callers outside that file are `PlayerOps.ts:816` (the RuneScript grant, `allowMulti` defaulted true) and `ClientCheatHandler.ts:483` (`::setlevel`, which passes `allowMulti: false`). | grep `addXp(` |
| Held-item ops dispatch through `ScriptProvider.getByTrigger(OPHELD1 + op - 1, obj.id, obj.category)`; there is no TS-side handler table to register into. | `network/game/client/handler/OpHeldHandler.ts:65-70` |
| Death drops everything in `inv` and `worn` via `inv_dropall`, keeping only what content has already moved into `deathkeep` (size 4, consumed by the 3 priciest items plus Protect Item). The `destroy_death` and `destroy_drop` params delete rather than keep. | `player/scripts/death.rs2:47-102`, and `:103-160` for the PvP twin |
| Obj configs support `recol1s`/`recol1d`, `tradeable=no` and `stackable`. `INV_MOVEITEM` is an available opcode. | `areas/area_canifis/configs/canifis.obj:4`, `ScriptOpcode.ts:350` |
| The owner bank stores `{slot, obj, count}` per slot. There is no per-instance item data anywhere in the engine. | `engine-custom/src/idlescape/types.ts` |
| `BuildOverlay.ts` relaxes the 2004 cache CRC so configs the original cache lacks can be packed, and its guard fails the build if any `pack/*.pack` file is rewritten. Pack ids must therefore be pinned by hand in `content-custom/pack/`. | `engine-custom/PATCHES.md`, "Packing a config the 2004 cache does not have" |
| `obj.pack` ends at id 3893 (3894 lines). `inv.pack` ends at id 216 (217 lines). | `engine/content/pack/` |

## 3. The items

| | `time_candy` | `time_candy_filled` |
|---|---|---|
| `name` | Time candy | Time candy (full) |
| `desc` | It will remember an hour of your training. | An hour of someone's training, waiting to happen again. |
| `model` | `inv_chocolate` with a purple `recol1s`/`recol1d` | same model, a brighter purple |
| `stackable` | yes | yes |
| `tradeable` | yes | **no** |
| `cost` | 1000 | 1 |
| `iop1` | Record | Eat |
| `iop2` | - | Check |

Both reuse the chocolate bar's model with a recolour, so the change to the client cache is
config only and no new art is authored.

Full candies stack because they are interchangeable bearer tokens: a stack of three means three
rows in the owner's ledger, and which row a given item "is" never matters. `Check` reads the
next row's breakdown without consuming anything.

Pack ids, appended by hand to a full copy of each upstream file:

```
content-custom/pack/obj.pack   3894=time_candy
                               3895=time_candy_filled
content-custom/pack/inv.pack   219=time_candy_keep
```

**217 and 218 are not free.** Entry 5 (battlebots) takes them for `bb_stash_inv` and `bb_stash_worn`,
written into its plan at task 2 as a literal `printf` append. Both entries are in the same sprint and both
append to the same file, so the sprint's section 3 holds the allocation; this entry starts at
219. If the order of the two entries changes, the ids do not: they are pinned by name there, not by
whoever packs first.

## 4. Drop rates

Deliberately asymmetric, per the owner's ruling ("own roll on medium, normal on hard"), so the
tier jump is felt.

**Medium: its own roll.** One independent check appended after the existing roll loop, before
`~trail_complete`:

```
if (random(50) = 0) {
    inv_add(trail_rewardinv, time_candy, 1);
}
```

2.0% per casket, flat. The existing common and rare tables are untouched, and the rate is
tunable on its own. Worst case output rises to 6 items, inside `trail_rewardinv`'s 9 slots.

**Hard: one more case on the common table.** `random(21)` becomes `random(22)` and a
`case 21 : inv_add(trail_rewardinv, time_candy, 1);` is added.

Per roll that is `(44/45) x (1/22) = 4.44%`. Over the 4, 5 or 6 rolls a hard casket makes, the
chance of at least one candy is 16.7%, 20.4% and 23.9% respectively, averaging **20.3% per
casket**; expected yield is 0.22 candies per casket. Every existing common hard reward is
diluted by one part in 22, a 4.5% relative reduction, which is the price of putting the candy on
that table rather than beside it.

## 5. Recording lifecycle

**A recording belongs to a character, not to an owner.** The character that ate the blank candy
is the one being recorded, and only its experience is captured. Per-owner recording was
rejected: an owner running five characters at once would funnel five streams into one candy,
which is a 5x, not the 2x the item is meant to be. Only the sealed candy is owner-scoped.

```
Record (blank)   -> recording = { startedAt, expiresAt = startedAt + 3_600_000, xp: {} }
                    refused if a recording is already live on that character
addXp            -> if live, unexpired, allowMulti and xp > 0: xp[stat] += xp * xpRate
now >= expiresAt -> seal: push into filled[], credit one time_candy_filled to the owner bank
```

Recorded amounts are **post-multiplier**, in the engine's tenths units, matching exactly what
`addXp` added to `stats[stat]`. Grants with `allowMulti: false` are ignored, which excludes
`::setlevel` and any future non-multiplied grant.

**Sealing is lazy.** It is evaluated whenever the state is read: a login, an experience grant, a
bank open, a redeem, a `Check`. Nothing can accrue after `expiresAt`, so a lazy seal produces
exactly the state an eager one would, and no background job or tick sweep is needed.

**An hour that recorded nothing still seals** into a 0 XP candy. Eating it says so and consumes
it. Keeping the item-to-ledger invariant free of special cases is worth more than avoiding one
piece of junk, and it makes the wall clock's harshness visible rather than silent.

**The sealed candy always goes to the owner bank**, never to an inventory. The character will
often be offline when its hour ends, and the credit path has to be the same in both cases. It
goes in through the server-internal `delta` op that `types.ts` already reserves for callers of
this kind.

## 6. Storage

`engine/server/data/candies/<ownerKey>.json`, beside `data/banks/`, following
`ownerBankFile.ts`'s atomic write and versioning:

```json
{
  "version": 1,
  "recordings": {
    "zezima": { "startedAt": 1757160000000, "expiresAt": 1757163600000, "xp": { "10": 582000 } }
  },
  "filled": [
    { "sealedAt": 1757163600000, "character": "zezima", "xp": { "10": 582000, "7": 41000 } }
  ],
  "pendingDelivery": 0
}
```

`recordings` is keyed by character because recordings are per-character and an owner may have
several characters online at once. `filled` is oldest first; `Eat` pops index 0.
`pendingDelivery` counts sealed rows whose bank credit has not landed because the bank was full;
the credit is retried on the next read of the file.

**The invariant:**

```
filled.length == (full candies in the owner bank)
               + (full candies in every one of that owner's character inventories)
               + pendingDelivery
```

It is defended by closing every unauthorised exit from an inventory:

- `tradeable=no` blocks trade.
- `OpHeldHandler` refuses op 5 (Drop) for `time_candy_filled` outright, with a message. Refused,
  not destroyed: the `destroy_drop` param would delete the item and orphan its ledger row, and
  since op 5 is also the route to the Destroy confirmation, refusing it closes both at once.
- `OpHeldUHandler` refuses the item as the target of a spell, which is how High and Low Alchemy
  reach a held item.
- Death keeps it: see section 7.

`Eat` is therefore the only way a full candy can leave an inventory, and it is the only path that
pops a ledger row. A candy that recorded nothing is disposed of by eating it.

There is **no self-healing reconciliation pass**. Trimming `filled` to an observed item count
would require counting offline characters' inventories, which nothing can do; a pass that ran
anyway would delete a candy sitting safely in an offline character's pack. Instead the invariant
is checked and logged wherever it is genuinely checkable (an owner with no characters online,
whose candies must therefore all be in the bank), and a mismatch is an alert, not an automatic
correction. This is an accepted, monitored risk rather than a solved problem.

## 7. Death

`player_death_lose_items` and `pvp_death_lose_items` both end by dropping the whole of `inv` and
`worn`. `deathkeep` cannot be borrowed for candies: it is size 4 and already spoken for by the
three priciest items plus Protect Item.

A new single slot inventory, `time_candy_keep` (`scope=temp`, `size=1`, `stackall=yes`), carries
them across. In each of the two procs, above the point where the inventory starts being dropped
(`inv_dropall(inv, ...)` in `player_death_lose_items`, the `both_dropslot` loop in
`pvp_death_lose_items`):

```
inv_moveitem(inv, time_candy_keep, time_candy_filled, inv_total(inv, time_candy_filled));
```

and after the `~moveallinv(deathkeep, inv)` that ends both procs:

```
~moveallinv(time_candy_keep, inv);
inv_clear(time_candy_keep);
```

One slot suffices because the item stacks. A staff death (`staffmodlevel > 1 & map_live = true`)
returns before any of this and is unaffected.

## 8. Redemption

`Eat` on `time_candy_filled`:

1. Seal any expired recording first, so a candy that sealed moments ago is already present.
2. Refuse with a message if `filled` is empty for this owner, which can only happen if the
   invariant has been broken.
3. Remove one item, pop `filled[0]`, and persist. The write happens before the grant so a crash
   mid-grant cannot duplicate the row.
4. For each recorded stat, `player.addXp(stat, amount, false)`. `allowMulti: false` because the
   stored amount is already multiplied; passing true would apply the world's rate a second time.
5. One summary line: `You relive 64,200 experience.` `addXp` emits its own level-up messages and
   enforces the 200m cap.

`Check` prints the same breakdown for `filled[0]` without consuming it, one line per skill.

## 9. Where the code goes

All behaviour lives in TypeScript. The ledger is TS-side, and reaching it from RuneScript would
mean registering a custom opcode; the obj configs exist only to make the items and their menu
options.

**New, `engine-custom/src/idlescape/`:**

- `candyLedger.ts` - pure: seal timing, FIFO pop, `pendingDelivery` accounting. No engine imports,
  testable the way `ops.ts` is.
- `candyLedgerFile.ts` - the `data/candies/<ownerKey>.json` store, mirroring `ownerBankFile.ts`.
- `candy.ts` - the engine-facing glue: start, accrue, seal and credit, redeem, check.
- `candyLedger.test.ts`, `candyLedgerFile.test.ts`, `candy.test.ts`.

**Replacements:**

- `src/idlescape/install.ts` - the `addXp` patch and the login-time seal, alongside the existing
  `Player.prototype` patches.
- `src/network/game/client/handler/OpHeldHandler.ts` - intercept `time_candy` and
  `time_candy_filled` ahead of the `ScriptProvider.getByTrigger` lookup, and refuse op 5 on the
  full candy.
- `src/network/game/client/handler/OpHeldUHandler.ts` - refuse the full candy as a spell target,
  which closes the alchemy route.

**Content, `content-custom/`:**

- `scripts/idlescape_time_candy/configs/time_candy.obj` (new)
- `scripts/idlescape_time_candy/configs/time_candy.inv` (new, `time_candy_keep`)
- `scripts/minigames/game_trail/scripts/medium/trail_clue_medium_reward.rs2` (replacement)
- `scripts/minigames/game_trail/scripts/hard/trail_clue_hard_reward.rs2` (replacement)
- `scripts/player/scripts/death.rs2` (replacement)
- `pack/obj.pack`, `pack/inv.pack` (replacements, appended ids)
- `manifest.json` - a `baseSha256` for every replacement, null for the two new files

`engine-custom/PATCHES.md` gains a section per replacement with a grep anchor, as every other
patch has, and `engine-custom/manifest.json` its entries. Every new file stays under the
project's 400 line ceiling.

Pack after any content change, through the overlay's own entry point:

```sh
pwsh scripts/content-overlay.ps1
cd engine/server && npx tsx tools/pack/BuildOverlay.ts
```

A run that reports moved pack ids is a failure, not a pack to ship.

## 10. Testing

**Pure units** (`candyLedger.test.ts`): a recording that has not expired accrues; one that has
expired accrues nothing regardless of when it is read; sealing is idempotent; `Eat` pops oldest
first; a full bank increments `pendingDelivery` and the next read drains it; a 0 XP hour still
produces a row.

**The `addXp` patch** (`candy.test.ts`): captures the post-multiplier amount under a non-1
`xpRate`; ignores `allowMulti: false`; ignores `xp = 0`; ignores a character with no live
recording; records against the eating character only, with two of the owner's characters online.

**Pack guard** (the existing `packGuard.test.ts`, plus a `BuildOverlay` run): obj and inv ids
unchanged byte for byte.

**Integration**, in the `shared.test.ts` style that stands up real `Player`s over one owner key:
eat a blank on character A, accrue across several skills, push the clock past `expiresAt`, read
the state and assert both the seal and the bank credit, then eat the full candy on character B of
the same owner and assert an exact per-skill replay made with `allowMulti: false`.

**Content**, by inspection plus one live casket run each: medium output stays within
`trail_rewardinv`'s 9 slots, and the hard common table has 22 reachable cases.

## 11. Rulings, for the record

1. Recording **duplicates** experience. The player keeps what they earn live; the candy grants a
   second copy. An hour of play becomes 2x, deferred.
2. Redemption is an **exact per-skill replay**. No pooling and no choice of skill, so a candy
   cannot launder easy experience into a slow skill.
3. The hour is **wall clock** from activation, running whether or not the character is online.
   Cherry-picking by logging out through a low-value stretch is impossible; a disconnect costs
   you the remainder. That is the point of "no way to stop it".
4. A recording is **per character**; a sealed candy is **per owner**.
5. Blank candies are **tradeable**; full candies are **owner-bound**. Candies are a commodity,
   experience is not.
6. Medium is **1/50 as its own roll**; hard is **one case on the common table**.
7. A 0 XP hour still seals into a candy.
8. Sealed candies are credited to the **owner bank**, never to an inventory.
