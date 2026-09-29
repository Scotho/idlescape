# SP8c - the game client's bank tabs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the running 274 game client the same bank tabs the web bank already has: a ten-button tab strip in `bank_main`, an item pane that draws only the selected tab with divider lines in "All items", drag-to-tab and right-click "Move to tab N", two deposit-all buttons, and a tab layout that survives the engine's own bank compaction, all reading and writing the nine `banktab_size_*` varps SP8 already persists to the shared owner bank.

**Architecture:** Three layers, in dependency order. (1) The **transport**: the nine tab-size varps are declared but not `transmit=yes`, so they have never reached the client at all; task 1 turns them on, gives them reserved clientcodes and adds a tenth varp `banktab` for the selected tab. (2) The **content overlay**: `content-custom/` gains whole-file replacements of `bank_main.if` (ten `type=model` `buttontype=select` tab buttons, two deposit-all buttons, a re-laid-out item pane) and `bank.rs2` (tab arithmetic procs, tab selection, `if_setobject` icon refresh, deposit-all loops, and a recount pass that keeps the tab sizes aligned with the engine's `reorganize_inv` compaction), plus three newly pinned pack files because interface components and RuneScript triggers each carry a global pack id. (3) Three **numbered client patches** (29, 30, 31) whose entire arithmetic lives in a new pure module `client/src/hooks/bankTabs.ts` so it is unit-tested under `bun test src/hooks`, with `Client.ts` carrying only call sites and each patch anchored by a grep row in `client/PATCHES.md`.

**Tech Stack:** RuneScript and `.if` interface config under `content-custom/` (packed by `engine/server/tools/pack/BuildOverlay.ts`); TypeScript engine overlay under `engine-custom/src/idlescape/` (node:test via `npx tsx --test`); the vendored 274 client fork under `client/` (`bun test`, `bun run typecheck`); Playwright from `web/` against the live stack.

**Spec:** `docs/superpowers/specs/2026-09-05-sp8b-web-bank-design.md`, sections 7 (the feasibility table) and 8 (the module list), read against section 12 (what SP8b actually built). Sprint order and scope: `docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md` entry 8 (`:247-260`), row 8 (`:48`) and section 3 (the shared pack id table, `:519-545`). The data contract this plan writes into is recorded in `engine-custom/PATCHES.md` ("Owner bank semantics", "Management routes", the bank tab varp rulings at `:412-429`).

**Surveys this plan is built on** (read-only, in `.superpowers/sdd/2026-09-07-sp8c-plan/`, not committed): `map-spec.md` (spec versus shipped, row by row), `map-overlay.md` (the content and engine overlay seams at revision 274), `map-client.md` (the client patch seams, with a 45-row anchor index). Every finding they raise is either a ruling below or a task step. Their file-and-line citations are reproduced in the tasks, so this plan stands alone in a fresh clone.

## Global Constraints

- **Strict TypeScript, no new `as any`. Files under 400 lines, test files included**, enforced by `scripts/line-ceiling.ps1` (verify step 1). `client/**` outside `src/hooks/` and `src/plugins/` is exempt (exemption 2), so `Client.ts` may grow, but **`client/src/hooks/bankTabs.ts` and its test are not exempt** and must each stay under 400.
- **`engine/` and `engine/content` are never edited.** Everything content-side lands in `content-custom/`, applied by `powershell -File scripts/content-overlay.ps1`; everything engine-side lands in `engine-custom/`, applied by `scripts/engine-overlay.ps1`. Every file either overlay contributes needs a `manifest.json` entry. `live/` is never read.
- **The client fork is edited only by numbered patches** recorded in `client/PATCHES.md`, each with a grep that proves it is still applied. Numbering is at 28; this entry adds 29, 30 and 31.
- **Conventional commits, no em dashes in new prose** (source comments, docs, RuneScript comments, UI copy). Hyphens or commas.
- **Windows PowerShell 5.1 only** in any `.ps1`: no `&&`, no ternary, no `??`, no here-string continuation. `pwsh` is not installed; the working invocation is `powershell -File scripts/content-overlay.ps1`.
- **Explicit `git add <paths>`, never `git add -A`.** Commit with `git -c core.safecrlf=false commit`. Every commit ends with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577
  ```
- **`localStorage` keys keep the `cs.` prefix and their exact names**; panel ids in `web/src/types.ts` are a persisted data contract. This entry renames none of either and touches no file under `web/src/`.
- **Pack ids are pinned by name in the sprint spec's section 3.** No id already in that table moves. This entry appends new ids to `varp.pack`, `interface.pack` and `script.pack` and adds them to that table by name; see ruling R1.
- **The release stays owner-gated (board gate G5).** Nothing in this plan deploys.
- **The stack, when a task needs it:** Firebase emulators on 9099 (auth) and 8080 (firestore), engine on 8899 with management on 8897, front server on 8787 serving `web/dist-e2e`. Bring it up with `scripts/start-stack.ps1 -Prod` from **PowerShell `Start-Process`**, never from a bash subshell (`docs/OPERATIONS.md`); ready in about two minutes. Playwright runs from `web/` after `npm run build:e2e`, never after a plain `npm run build`.
- **After any content change, applying the overlay is not packing it.** The two commands are, from the repository root:
  ```
  powershell -File scripts/content-overlay.ps1
  cd engine/server
  npx tsx tools/pack/BuildOverlay.ts
  ```
  then restart the engine. `scripts/start-stack.ps1:20-26` applies the overlay and stops there; the engine's own fallback `packAll` in `engine-custom/src/app.ts:18` runs **without** `Environment.build.verify = false` and aborts on the 2004 CRC, so a content change that is applied but not packed leaves a stale cache or a failed boot.

---

## What already shipped, verified in the code

Read this before Task 1. Every task assumes it and none of it is rebuilt.

- **The tab layout is `number[]` SIZES, not boundaries.** `tabs[i]` is the size of tab `i+1`; ranges are derived identically at `engine-custom/src/idlescape/bankLayout.ts:11-19` (`tabRanges`) and `web/src/bank/layout.ts:6-11`. `MAX_TABS = 9` (`engine-custom/src/idlescape/types.ts:29`, `web/src/bank/types.ts:39`).
- **Tab 0 has two meanings and both are shipped.** As a **view** it is "All items": every slot, with a divider above the row holding each tab's first slot (`web/src/bank/grid.ts:175`, `const allItems = tab === 0`; dividers at `:208-215`, `row = Math.floor(range.start / columns)` per tab range). As a **move and sort target** it is the tail `[sum(sizes), used)` (`web/src/bank/layout.ts:19-23`, `rangeOfTab`; the engine's `moveToTab` with `tab: 0` appends at the last used slot, `engine-custom/PATCHES.md:641`). That is SP8b spec ruling 12.3, made after two briefs contradicted each other and a shipped test asserted the wrong half. **This plan inherits it; it is not re-decided.**
- **The invariant.** `tabs.length <= 9`, every size `>= 1`, `sum(sizes) <= lastUsedSlot`, where "used" is the highest occupied index + 1, not a count (`engine-custom/PATCHES.md:575-580`, `bankLayout.ts:33-45`). A zero size in a `setTabs` is `tab_invariant`; a tab that reaches zero by a move is dropped and later tabs shift left (`PATCHES.md:626-629`); interior zeros read off the varps collapse and renumber (`PATCHES.md:421-429`).
- **The nine varps exist and round-trip on the server.** `content-custom/scripts/interface_bank/configs/banktab.varp` declares `banktab_size_1..9`, `scope=perm`, `protect=no`; `content-custom/pack/varp.pack` pins them at ids 359 to 367. `engine-custom/src/idlescape/tabVarps.ts` holds `TAB_VARP_NAMES`, `readTabVarps`, `writeTabVarps` and `changedTabVarps` (a `WeakMap` of what the overlay last wrote, so "differs from what we wrote" is exactly "the player moved it"). Seeding is `engine-custom/src/engine/entity/PlayerLoading.ts:81` (new character) and `:225` (migration tail). The once-per-tick mirror-in plus per-owner push-out is `engine-custom/src/idlescape/install.ts:196-238`.
- **The apply op union is pinned by name and this entry does not extend it.** `BankOp` is `delta | swap | insert | moveToTab | setTabs | sort` (`engine-custom/src/idlescape/types.ts:21-26`), the layout ops are `LAYOUT_OPS` at `:30`, and **`setTabs` carries `sizes`, not `tabs`**: `normaliseOp` is `case 'setTabs': return isIntArray(r.sizes) ? { op: 'setTabs', sizes: [...r.sizes] } : null;` (`engine-custom/src/idlescape/ops.ts:78-79`), mirrored at `web/src/bank/types.ts:16` and asserted at `engine-custom/src/idlescape/management.test.ts:111`. An op with an unknown field name answers `null` and the whole batch is refused (`management.test.ts:103`). Task 11's seeding is the one place this plan writes a contract payload by hand; it writes `sizes`.
- **`engine/content/pack/script.pack` is git-ignored upstream** (`engine/content/.gitignore:4`), because `regenScriptPack` regenerates it. It exists on disk in the clone and nowhere in git, so it has no blob to read a sha from. `pack/interface.pack` and `pack/interface.order` are tracked. Task 2 depends on this.
- **The post-apply version contract.** A successful apply returns the version the bank now holds and that number is immediately reusable as the next `expectedVersion` (`engine-custom/PATCHES.md:686-700`). An in-game change in the same tick as an external apply is folded into that apply's version on purpose.
- **Push-out mode.** For one tick after ANY apply, the store's tab layout is written OUT to every online character instead of read in (`engine-custom/PATCHES.md:320-331`). An in-game tab drag colliding in that tick loses to the web caller, silently. SP8b coalesces to one apply per 1.2 s (`web/src/bank/types.ts:42`, `FLUSH_MS`), which is what makes in-game tabs usable at all.
- **SP8b's twelve web modules under `web/src/bank/`** plus `web/src/plugins/builtin/bank.ts` and `web/src/styles/bank.css`. **This entry touches none of them.**
- **Client patch 28** (`client/PATCHES.md:190`, verification block at `:140-150`): `getObjIcon` / `getObjInfo`, with all the logic in `client/src/hooks/objArt.ts` (148 lines) tested in `objArt.test.ts` (241 lines) against a fake canvas and a fake port, and `Client.ts` carrying only the port and three private methods. **That split is the model this plan copies for patches 29 to 31**, and `PATCHES.md:152-156` states it in prose so a later reader does not go looking for the logic in the vendored file.
- **`^bank_total_slots = 240`** (`engine/content/scripts/interface_bank/configs/bank.constant:1`). Capacity does not move; `BANK_CAPACITY_FALLBACK` (`engine-custom/src/idlescape/types.ts:35`) and every owner-bank JSON assume it.
- **`[debugproc,bank]`** exists (`engine/content/scripts/_test/scripts/cheats/cheat_bank.rs2:1-7`) and `engine/server/data/config/world.json:13` sets `node.debug: true`, so `::~bank` opens the bank interface where the character stands. `web/e2e/harness.ts:18-19` already routes a `::` message through `window.idlescape.tasks.dispatch({ type: 'say' })`, and `leaveTutorial` at `:46-56` already uses `::~death` the same way. **This is what makes Task 11's Playwright spec possible with no new content.**

## What SP8b left for this entry, and what it explicitly did not

SP8b's plan says it plainly: "Spec section 7's *game client* mirror (a `Client.ts` patch drawing only the selected tab's slot range plus divider lines, the `bank_main.if` tab components, the `bank.rs2` tab handlers, drag-to-tab and in-game search) is **SP8c**." Also out of SP8b and **still out of this entry**: capacity beyond 240, market prices for `sort by value` (SP9), any agent access to the bank (SP8 is human-only), and two named SP8b deferrals that stay where the audit put them - **D6** (no focus trap and no `aria-modal` on the web bank dialog; spec 12.6, audit `:160`, candidate C21, shell v2's ground) and **D7** (`web/styleguide.html` over the ceiling; spec 12.6, audit `:161`, already exempted by decision D12 and named in `scripts/line-ceiling.ps1`'s header). Neither is SP8c's; they are named here so this plan declines them explicitly rather than by silence.

---

## Plan rulings

Each is a decision this plan makes because the spec is wrong, silent, or impossible at revision 274. Each says what it costs if it is wrong. R1, R3, R4, R5, R7, R8, R15, R16 and R17 are in `docs/superpowers/decisions.md`, because they cross entries or amend a spec; the planner appended them, and Task 12 Step 5 lists them by id.

### R1. This entry appends to three pack files, and the sprint's section 3 table gains six rows

The entry brief says "no pack appended by this entry". **That is not true as written.** Three separate needs:

- **`varp.pack` id 368, `banktab`.** The selected tab. Spec `:182` says the tab buttons write `%banktab`; no such varp exists anywhere in the tree. `content-custom/pack/varp.pack` ends at `367=banktab_size_9`.
- **`interface.pack` ids 10984 onward.** Every interface **component** carries a global id: `5292=bank_main` and `5293-5395` are its 104 components (`bank_main:inv` is `5382`, `bank_main:com_102` is `8133`); upstream's maximum is `10983`, the same number the sprint quotes at `:544`. **Twenty-one new components need twenty-one lines**, ending at `11004`: ten tab buttons, nine separate tab icons and the two deposit-all buttons. It is twenty-one and not twelve because a tab cannot be one component (ruling R17), which the survey established by reading the draw path rather than by trying it.
- **`script.pack` ids 10940 onward.** Every RuneScript trigger, label and proc carries an id; upstream's maximum is `10939`.

Worse, **`interface.pack`, `interface.order` and `script.pack` are not in `content-custom/pack/` at all** (`content-custom/manifest.json` lists two files, `pack/varp.pack` and `scripts/interface_bank/configs/banktab.varp`). The sprint's section 3 names `obj`, `inv` and `loc` as the packs **entry 3** pins, and entry 3's committed plan confirms it: its Task 1 produces exactly `obj.pack`, `inv.pack`, `loc.pack` and `varp.pack`. `interface.pack` is on neither list. **So this entry pins them itself** (Task 2) rather than waiting on an entry-3 scope change, and adds its six ids to the section 3 table by name.

Why the ids must be written by hand: `validateInterfacePack` (`engine/server/tools/pack/PackFile.ts`) throws `pack/interface.pack is missing ID for component <name>` **regardless of `Environment.build.verify`**, so `BuildOverlay.ts`'s relaxed flag does not save you. And `regenScriptPack` does the opposite: it auto-assigns every unknown trigger at `pack.max++` and **always** calls `pack.save()`, so `BuildOverlay.ts`'s sha256 guard exits 1 naming `script.pack` on the first pack run unless the file is pinned first with the new lines already in it.

**Cost if wrong:** a renumbered `interface.pack` silently reassigns component ids across the whole cache, and `client/src/vendor/rs-sdk/bot/types.ts:24-25` hardcodes `BANK_MAIN_ID = 5292` and `BANK_MAIN_INV_ID = 5382`, so the vendored bot surface breaks with no error. A renumbered `varp.pack` renumbers `banktab_size_*` and every character's saved tab sizes become some other varp's values. Task 2's `bankTabPack.test.ts` is the assertion that neither happened.

### R2. `transmit=yes` on the nine size varps is task 1, and everything else depends on it

`banktab.varp` declares `scope=perm` and `protect=no` and nothing else. `Player.setVar` writes a varp to the socket only `if (varp.transmit)` (`engine/server/src/engine/entity/Player.ts:1776`), and the login and reconnect replays carry the same guard (`:519`, `:549`); the packer emits the opcode only for a `transmit=yes` line (`engine/server/tools/pack/config/VarpConfig.ts:102-106`). **So `this.var[359..367]` in the client is 0 for every player, forever.** SP8's tab work is complete on the server and one hundred percent invisible in game. Upstream's own `bankcert` and `bankinsert` both declare `transmit=yes`.

**Cost if wrong:** zero. Adding the key changes the packed server varp record, not the ids, so `varp.pack` does not move. Not doing it makes every other task in this plan a no-op in game.

### R3. Right-click "Move to tab N" is a client patch, not content, and drag-to-tab is v1 rather than a follow-up

Spec section 7 row 4 and the sprint's entry 8 scope line both name right-click "Move to tab N" as the **content-only v1 move path**. It is **impossible at revision 274**. A `TYPE_INV` component carries at most five interface ops: the client maps `child.iop[0..4]` onto `INV_BUTTON1..5` at `client/src/client/Client.ts:12165-12181`, and `bank_main:inv` already spends all five on Withdraw 1/5/10/All/X (`bank_main.if` `option1..option5`, bound at `bank.rs2:1-5`). There is no sixth slot, and even with all five free, SP8b spec 12.1 ruling 4 makes "Move to tab" flat rather than a submenu, which needs ten entries. Ten into five does not go, and dropping a Withdraw op is an owner-visible regression.

The replacement is patch 31: the client appends its own "Move to tab N" entries in `buildMinimenu`'s inv arm and dispatches them through the **existing** `INV_BUTTOND` wire, and the same computation serves a drop on a tab header. No new packet: `InvButtonDHandler` refuses any `targetSlot` failing `inv.validSlot`, so a sentinel target such as `240 + tab` is dropped before any script runs, but an ordinary `INV_BUTTOND` to a real slot inside the destination tab with `mode = 1` routes into the bank's existing insert path (`bank.rs2:6-11`, reproduced as `~banktab_insert` by Task 5 because `@insert_bank` is a tail jump) and means exactly "move into tab N".

**Cost if wrong:** the move path is the entry's point; without it the tab strip is a viewer. If patch 31 proves harder than Task 9 estimates, the fallback is to ship in-game tabs as view-only and keep the web bank as the only place tabs are edited, which is the state today. Record that as a deferral rather than dropping a Withdraw op.

### R4. In-game search is re-deferred, with its design recorded

Spec section 7 row 6 makes the content-only search prompt conditional on section 7 still holding at 274. **It does not hold: `p_stringentry` does not exist in this engine.** There is no `P_STRINGENTRY` in `engine/server/src/engine/script/ScriptOpcode.ts` and no `stringentry` anywhere in the engine, content or client trees; the only two resume packets are `RESUME_PAUSEBUTTON` (72) and `RESUME_P_COUNTDIALOG` (102) (`engine/server/src/network/game/client/ClientGameProt.ts:77,79`). `p_countdialog` is numeric only.

The buildable route, recorded so a follow-up does not rediscover it: OSRS search is **client-side highlighting**, and the client already owns a free-text field it draws in the chat area (`socialInputOpen` / `socialInput` / `socialInputType` / `socialInputHeader` at `Client.ts:592-595`, opened from `clientButton()` at `:13366` onward, typed into and committed at `:5340-5400`). Types 1 to 5 are taken; **6 onward is free.** A bank search patch opens type 6 from a reserved-clientCode search button, keeps the string client-side, and dims non-matching slots in the same draw loop patch 30 already touches. No packet, no engine change, one extra `bank_main.if` button.

**Ruling: not built here.** Task 10 records it, gives it a decisions row and a sprint board row.
**Cost if wrong:** in-game search stays absent while the web bank has it, which is one more way the two banks disagree. Cheap to add later: the patch is self-contained and its anchor is inside patch 30's neighbourhood.

### R5. Deposit-inventory and deposit-worn buttons are built here, because they do not exist

Spec row 7 (`:188`) calls withdraw-X memory, the item/note toggle and deposit inventory/worn "Already present or content-only". It contradicts the spec's own `:39` ("no deposit-all buttons exist in 274"), and `:39` is right. Verified: the item/note toggle (`com_93`/`com_94`) and the swap/insert toggle (`com_99`/`com_100`) exist and are bound at `bank.rs2:12-15`; per-slot "Deposit All" exists as an inv option on `bank_side:inv` (`bank_side.if:12`, handled at `bank_deposit.rs2:4`); there is **no** Deposit-inventory or Deposit-worn **button** anywhere. Those are two more `interface.pack` ids and two `inv_moveitem` loops over `~bank_deposit_request`, which already exists at `bank.rs2:87`.

**Cost if wrong:** none, they are additive. Not building them leaves the row half done and the audit's next reader re-opens it.

### R6. The selected tab is `scope=temp` and per character, and it is not part of the shared contract

`web/src/bank/view.ts:73` keeps `selectedTab` in memory per window, unpersisted. The web already treats the selection as a view, not as state. The new `banktab` varp is therefore `scope=temp`, `transmit=yes`, `clientcode=10`: the selection resets to "All items" on login, per character, and the owner bank JSON gains no field.

**Cost if wrong:** a player who expects their selection to survive a logout is mildly annoyed. Reversal is one word (`temp` to `perm`) in `banktab.varp` plus a re-pack; the varp id does not move and no stored data changes shape.

### R7. Deferral D5 (placeholders and bank fillers) is re-deferred, and the tab-integrity bug it was hiding is fixed here instead

The sprint folds D5 into this entry because "they are engine-level, they were promised in SP8b's spec at `:189`, and they currently have no home at all" (sprint `:257-259`). The survey found the reason they matter, and it is not cosmetic.

**The bug.** `[label,openbank]` calls `~reorganize_inv(bank)` (`engine/content/scripts/interface_bank/scripts/bank.rs2:18-20`) and `closebank` queues `reorganize_bank`, which calls it again (`:25-35`). The proc slides every item left into the first hole (`engine/content/scripts/general/scripts/misc/inv_procs.rs2:255-275`). **Tabs are stored as sizes**, so a withdrawal that empties a slot in tab 1, followed by a reopen, pulls tab 2's first item into tab 1 without changing a single stored number. The in-game tab model is unstable today, before this entry draws anything, and nothing in spec section 7 mentions `reorganize_inv`.

**Two fixes exist.** (a) Placeholders: no hole ever appears, so compaction is a no-op. OSRS-faithful. (b) Recount: before every `~reorganize_inv` and after every withdraw, recompute each tab's size as the number of occupied slots currently inside that tab's range. That is exactly what compaction does to the layout, expressed as arithmetic, and it is content-only RuneScript.

**Ruling: build (b) here (Task 5), re-defer (a).** (a) is not this entry's, because it is not an `Inventory` change; it is a **cross-package data-format change**, and the survey found the seam the spec's one-line promise missed:

> `readBankFile` (`engine-custom/src/idlescape/ownerBankFile.ts:44`) accepts a slot only when `Number.isInteger(slot.count) && slot.count > 0`; anything else increments `rejected`, which the store treats as a partial loss and answers by **suspending writes for that owner**. `slotsOf` (`:69-79`) writes any non-null item, count 0 included. So the moment a placeholder exists, the next reload of that owner's file suspends their bank.

Placeholders therefore need: the engine `Inventory` change (`engine/server/src/engine/Inventory.ts:180` and `:201`, the two `if (curItem.count == 0 && !stockObj) items[i] = null` sites, today an `anchors` entry in `engine-custom/manifest.json` rather than a replacement); a versioned `OwnerBankFile` format change; matching moves in `engine-custom/src/idlescape/types.ts`'s `BankSlotDto` ("One occupied bank slot. Empty slots are absent"), `ops.ts`'s `lastUsedSlot`, `server/src/types.ts`'s `BankSlot`, and `web/src/bank/`'s idea of an occupied slot; RuneScript to create and consume placeholders; and a client fade patch. That is a sub-project spanning the engine, the front server and the web, not the game client's bank tabs. The `.sav` is **not** the obstacle: `Player.save()` writes `p2(obj.id + 1)` then a count with 255 escaping to `p4`, and `PlayerLoading.load` reads `g2() - 1` and skips only id `-1` (`PlayerLoading.ts:149-158`), so a `{ id, count: 0 }` slot round-trips exactly.

**Cost if wrong:** the in-game bank keeps compacting, which fix (b) makes correct but not OSRS-faithful. A player who withdraws from the middle of tab 1 sees that tab shrink by one slot rather than keep a placeholder. Reversal is additive: (a) can be built on top of (b) without undoing it, and Task 5's recount becomes a no-op once no holes exist.

### R8. The item pane loses one visible row, from six to five, to make room for the tab strip

`bank_main.if` has no vertical space for a tab bar. `com_88`, the window content layer, is `x=36 y=20 width=440 height=299`; the item pane layer `com_92` is `x=37 y=55 width=427 height=229` with `scroll=1145`; the bottom controls sit at y=284 to 327. The inv is `width=8 height=30 margin=15,6`, so a cell is 47 by 38 and the pane shows `229 / 38 = 6.02` rows. A 36 px OSRS tab strip at y=55 pushes `com_92` to `y=91 height=193`, which is `193 / 38 = 5.07` rows. Capacity is unchanged at 240, `scroll` stays 1145 (it is the content height, not the viewport), and only the visible window shrinks.

The alternative, growing the window frame, means moving all 88 of the `tradebacking` graphic components that draw it. Not worth one row.

**Cost if wrong:** a player sees forty slots at a time instead of forty-eight. Reversal is two numbers in `bank_main.if` plus dropping the tab strip.

### R9. The three web parity controls stay per-browser ornaments, and spec section 3 is corrected

`web/src/bank/view.ts:42-44` persists `cs.bank.mode`, `cs.bank.as` and `cs.bank.qty` in `localStorage`. Spec section 3 (`:60`) claims the quantity buttons "set the default for in-game withdraw-X via the same varp the client uses". **They do not, and no such varp exists.** The game's two toggles are `bankcert` (115) and `bankinsert` (304), both already wired, and there is no quantity-default varp at all.

**Ruling:** the three stay per-browser. This entry adds no fourth field to the shared contract and no varp for them. Task 12 corrects spec `:60`.

**The withdraw-X memory half of spec row 7 is re-deferred, not closed.** Row 7 bundles three things and this entry resolves two of them: the item/note toggle already exists and is bound at `bank.rs2:12-15`, and R5 builds the two deposit-all buttons. The third, a withdraw quantity the two banks share, is buildable and is not built here. The route is exactly the one this ruling names, written down so the next reader does not re-derive it: one more `transmit=yes` varp beside the ten this entry declares (clientcode 20, the next free one), one field on the owner bank contract, and `cs.bank.qty` writing through to it instead of only to `localStorage`. **Task 10 Step 2 queues it as a backlog row**, and Task 10 Step 3's row 7 rewrite names it, so row 7 does not read as fully closed.

**Cost if wrong:** a player who sets "Withdraw 10" in the web bank does not get it in game. Cheap to add later along the route above; doing it now would widen the owner-bank JSON for an ornament.

### R10. The two banks stop disagreeing about the title

`bank_main.if`'s `com_90` reads `The Bank of RuneScape`; the web draws `The Bank of Gielinor` (spec `:16`, `:47`). Entry 8's own justification is that "the two banks should stop disagreeing in the same sprint they start disagreeing" (sprint `:254-255`). `bank_main.if` is being replaced anyway. One line.
**Cost if wrong:** none. It is a string.

### R11. `content-custom/**` is named in the line ceiling's exemption header rather than left unenforced

`scripts/line-ceiling.ps1`'s `includeDirs` are `web/`, `server/src/`, `engine-custom/src/`, `engine-custom/tools/`, `client/src/hooks/`, `client/src/plugins/`, `scripts/`, `wiki/gen/`, `firebase/`, `deploy/`, and its `includeExt` is `.ts .js .css .html .ps1 .sh .rules`. `content-custom/` and `.if` are in neither list, so a `bank_main.if` well over the ceiling passes. That is an **absence of enforcement, not an exemption**, and the script's own header says adding one means editing the header and the list together. **No line total is quoted here or in the header text Task 2 Step 6 writes**, in line with entry 3's ruling R7: upstream is 872 lines today, this entry appends to it, and a number baked into an enforcement script's header is a number the next reader trusts.
**Ruling:** extend exemption 3 to name `content-custom/**` whole, with the reason: these files are mirrored upstream config, byte-compatible with a pinned clone, and splitting one would break the overlay's file-for-file mapping.
**Cost if wrong:** none; it makes an existing silence explicit.

### R12. `.gitattributes` pins the content overlay's line endings

Upstream Content declares `*.pack text eol=lf` in `engine/content/.gitattributes`; this repository declares only `* text=auto` and runs with `core.autocrlf=true`. Every `content-custom/` file happens to be LF on this machine right now (`git ls-files --eol content-custom/` shows `i/lf w/lf`), but a fresh Windows clone would check them out CRLF; `PackFile.save()` writes with `\n` (`engine/server/tools/pack/PackFileBase.ts:120-128`), so the first `packAll` rewrites the file LF, its hash moves and `BuildOverlay.ts` exits 1 naming it. Today that risk covers one file; this entry makes it four.
**Cost if wrong:** a fresh Windows clone cannot pack, with an error that points at the wrong thing. Reversal is deleting three lines.

### R13. The content-overlay manifest-tracked check must exist before this entry's content files ship, whoever adds it

`verify.ps1:114-139` walks `engine-custom/manifest.json` and fails on any path `git ls-files` does not know, because the overlay is copied into a throwaway clone, so an un-`git add`ed file still applies and still passes every suite on the machine that wrote it. **There is no equivalent for `content-custom/manifest.json`.** This entry adds six content files that ship in a Docker image built from `git archive` (`deploy/docker/engine.Dockerfile:50-56` mirrors the content copy and skips only `.gitkeep`, `manifest.json` and `README*`), so an un-added one passes every local gate and produces a stock bank in production.
**Entry 3's Task 4 Step 6 generalises the existing check to a loop over both manifests**, which is the same fix. So this entry **verifies** it rather than duplicating it, and only writes it if entry 3 has not landed. Either way it exists before Task 3 adds the first content file that is not a pack.

**Cost if wrong:** exactly that: a green verify and a stock bank on the box.

### R14. SP8b ruling 12.4 (focus ownership) cannot be broken by this entry

12.4 is a web rule: a module that calls `replaceChildren` on nodes it owns restores focus within its own subtree, and the composing window handles only the cross-module case. **No task in this plan touches any file under `web/src/`.** The only web file this entry creates is a Playwright spec under `web/e2e/`, and the only web file it modifies is `web/e2e/harness.ts` (one `export` keyword). Stated so a reviewer does not go looking.

### R15. A cross-tab drag always moves

Stated in full at Task 5 Step 4, where the RuneScript that implements it lives, and listed here so the ruling index is complete. Patch 31 also forces the client's optimistic local move to the shift the server will perform for a cross-tab drop, which is part of the same ruling; see Task 9 Step 3b.

### R16. The in-game pane compacts a tab to the top left; the web pads to the row boundary, and the two therefore differ

`web/src/bank/grid.ts:186-191` renders a non-"All items" tab as `renderStart = Math.floor(realStart / columns) * columns; renderEnd = Math.ceil(realEnd / columns) * columns`. The tab keeps its true column position and the leading cells of its first row are drawn as `bank-slot-filler` cells (SP8b spec 12.7). This plan's `visibleCell` returns `slot - tabStart(tab, sizes)`, which slides the tab to column 0.

So for `tabs = [10, 12]` the web draws tab 2's first item in row 1 column 2, and the game client draws it in row 0 column 0. **The two banks disagree, in the one dimension this entry exists to stop them disagreeing** (R10 changes a title string for that reason), so it is a decision rather than an accident.

**Ruling: the game client compacts.** OSRS's own in-game tabs compact to the top left, the client has no filler cell to draw (a bank slot with no item is background, and `drawInterface`'s inv branch has no third state between "occupied" and "empty"), and a padded view would make a tab's first row look broken for every tab whose start is not a multiple of eight. The web is not changed, because no task in this plan touches `web/src/` (R14).

**Cost if wrong:** the same tab is laid out differently in the two banks, so a player who arranges by eye in one and then looks at the other sees the items in different places. Named in Task 10 Step 3 and in spec section 13.3. Reversal, if the owner would rather they matched: `visibleCell` returns `slot - Math.floor(start / columns) * columns` and a filler marker rather than `-1` for the leading cells of the first row, with `visibleCount` and `scrollHeightFor` following, plus a draw branch for the filler.

### R17. A tab is two components, not one: a `buttontype=select` button and a separate `type=model` icon

The obvious shape, a single `type=model` `buttontype=select` component that `if_setobject` writes an icon into and `if_sethide` hides when empty, **does not work in this client**, in two independent ways the survey found by reading the draw path:

1. **`if_sethide` is a no-op on a non-layer component.** `IF_SETHIDE`'s decode does set `IfType.list[comId].hide` (`Client.ts:8474`), but `hide` is DECODED from the cache only inside the `com.type === ComponentType.TYPE_LAYER` branch (`client/src/config/IfType.ts:163-165`) and is HONOURED only by the two layer-entry guards, `drawInterface` (`:12307`) and `addComponentOptions` (`:12035`). Those three are every occurrence of `.hide` in `Client.ts`. Nothing in the child-draw chain tests `child.hide`, so a hidden `type=model` tab still draws, with whatever `model1Id` the last `if_setobject` left on it: precisely the stale icon the hide was there to avoid.
2. **The SELECTED tab would render nothing.** Every tab is `buttontype=select` with `script1op1=pushvar,banktab` / `script1=eq,N`, so `getIfActive(child)` is true for exactly the selected tab (comparator `eq` is 1, `PackShared.ts:50`; `getIfActive` at `Client.ts:12767` answers true when `value === operand`). For a `type=model` component the active branch is `getTempModel(..., active=true, ...)`, which reads `model2Type` / `model2Id` (`IfType.ts:366-370`). With no `activemodel=` declared the packer writes `client.p1(0)` (`PackShared.ts:551-560`), so `model2Type` is 0, `getModel(0, 0, ...)` matches no branch and returns `null` (`IfType.ts:397-420`), and the selected tab draws **no icon at all**. `IF_SETOBJECT` cannot help: its decode writes only `model1Type = 4` and `model1Id` (`Client.ts:8485-8490`).

**Ruling: split them.**

- **`bank_main:tab_0` .. `tab_9`** are the buttons: `tab_0` is `type=text` and `tab_1..tab_9` are `type=rect`, all `buttontype=select` with `option=`, `script1op1=pushvar,banktab`, `script1=eq,N` and `clientcode=210+N`. Each declares **both** halves of its appearance, `colour=`/`activecolour=` (and `overcolour=`/`activeovercolour=`), because the active branch reads `colour2` (`Client.ts:12453-12461` for rect, `:12489-12495` for text) and `parseInt(undefined)` packs as `NaN`, which is black. Upstream's own select buttons declare the active variant: `bank_main:com_93` carries `graphic=combatboxes,2` and `activegraphic=combatboxes,3`.
- **`bank_main:tabicon_1` .. `tabicon_9`** are the icons: `type=model`, **no `buttontype`**, drawn on top of their button because a layer's children draw in declaration order. Each carries `script1op1=pushvar,banktab_size_N` and `script1=eq,0`, so `getIfActive` is true exactly when that tab is EMPTY, the draw takes the active branch, `model2Type` is 0 and nothing is painted. When the tab has items the comparator is false, the draw takes `model1`, and that is what `if_setobject` writes. **The empty case therefore needs no `if_sethide` and no "clear" form of `if_setobject`, which does not exist.**

This costs nine more `interface.pack` ids than the single-component shape (Task 2 allocates twenty-one, not twelve) and it is why the tab buttons are `type=rect` rather than `type=model`. It also means `~banktab_seticon` only ever sets an icon and never hides one.

**Cost if wrong:** an empty tab shows the last item that was in it, and the selected tab shows nothing. Both are silent: they draw fine and look like a working feature. `bankTabInterface.test.ts` asserts the split and the active keys, which is the only automated check either has.

---

## The dependency this plan executes against

**Sprint entry 3 (overlay, pack and client-fork gates) is expected to have landed `scripts/patches-check.ps1` and wired it into `scripts/verify.ps1` by the time this executes.** That is why the sprint puts entry 8 after entry 3: entry 3 is what makes a numbered patch checkable (sprint `:255-256`). Today nothing runs the greps in `client/PATCHES.md`: `verify.ps1`'s client steps are the typecheck (`:181-186`) and `bun test src/hooks src/plugins src/vendor` (`:189-194`), and `docs/VERIFICATION.md:129` records "run each grep in `client/PATCHES.md` by hand ... `scripts/patches-check.ps1` is audit C24 and does not exist yet".

**Entry 3's plan is committed** (`docs/superpowers/plans/2026-09-07-overlay-pack-and-client-fork-gates.md`, `a4815ba`), so what it delivers is known rather than guessed. Six of its decisions bear on this plan and are folded in below. **Read them before Task 1, and check at the start of each task whether entry 3 has actually landed on the branch yet**, because this entry's tasks are written to work either way.

| Entry 3 delivers | This plan's response |
|---|---|
| `scripts/patches-check.ps1` plus a **typed row grammar** replacing the `sh` grep fences in both `PATCHES.md` files (its ruling R6): a `root: <dir>` directive then one row per assertion, `patch <id>`, mode, count, path and literal, separated by pipes and split on the first four only, with modes `contains`, `startswith` and `after:<n>` | Patches 29, 30 and 31 ship `patches-check` fences in exactly that grammar (Tasks 7, 8, 9). **If entry 3 has not landed**, write the same rows and run each by hand as `grep -c <literal> <path>` from `client/`, comparing against the count column; convert nothing. Its ruling R7 also removes every quoted row total from the prose, so this plan quotes none. |
| `content-custom/manifest.json` gains a `base` field and a `kind` per entry (`"replace"` or `"new"`), and a `replace` entry with no `baseSha256` becomes an error rather than a skip (its Tasks 1 and 4) | Every manifest snippet in Tasks 1 to 4 below is written in the **old** two-field shape. **If entry 3 has landed, add `"kind": "replace"` to each entry that shadows an upstream file and `"kind": "new"` to `banktab.constant`**, and leave `base` alone. Every file this entry adds except `banktab.constant` is a `replace`. |
| `.gitattributes` gains `content-custom/pack/*.pack text eol=lf` (its Task 1) | Task 2 Step 5 adds only what entry 3 does not cover: `*.order` and `content-custom/scripts/**`. If entry 3 has not landed, add its `*.pack` line too. |
| `verify.ps1`'s manifest-tracked check is generalised to a loop over **both** manifests (its Task 4 Step 6), with `$TotalSteps` unchanged at 10 (its ruling R11, decision D108) | Task 2 Step 7 becomes a **verification** rather than a change: confirm `content-custom` is in that loop and that Step 8's deliberate failure still fires. If entry 3 has not landed, make the change as written. Either way `$TotalSteps` stays 10; this entry adds no step. |
| `engine-custom/src/idlescape/packIds.ts` holds the sprint's section 3 table in code, asserted by `packIds.test.ts` (its Task 1) | Tasks 1 and 2 add SP8c's six rows to that array if it exists, instead of only to the sprint document. `bankTabPack.test.ts` stays either way: it asserts what `packIds.ts` cannot, namely `transmit=yes`, the clientcodes, `interface.order`'s grouping (not a `.pack` file, so outside the pack guard) and `script.pack`'s contiguity. |
| `start-stack.ps1` throws instead of warning when the engine never reaches `World ready` (its ruling R10) | Every "grep `logs/engine.log` for `World ready` yourself" caution below becomes unnecessary once that lands. Keep doing it until it has; it costs one grep. |

**Entry 3 does NOT pin `interface.pack`, `interface.order` or `script.pack`.** Its Task 1 produces exactly four files under `content-custom/pack/`: `obj.pack`, `inv.pack`, `loc.pack` and `varp.pack`. That is why ruling R1 has this entry pin the other three itself.

Three rows in the patch fences below are deliberately not simple presence checks: `const cell: number = this.bankVisibleCell(child, slot);` has a count of **2**, `MiniMenuAction.BANK_MOVE_TO_TAB` has a count of **2**, and `this.bankTabDrop` has a count of **3**. The reasons go into `PATCHES.md` beside them, in the same spirit as patch 27's inverted-guard polarity check. See Tasks 8 and 9.

---

## File Structure

**Create**

- `content-custom/scripts/interface_bank/interfaces/bank_main.if` - a whole-file replacement of the upstream interface, plus twenty-one components (ten tab buttons, nine tab icons, two deposit-all buttons; ruling R17) and a moved item pane. Content config, mirrored upstream; the line ceiling does not apply (R11).
- `content-custom/scripts/interface_bank/scripts/bank.rs2` - a whole-file replacement of the upstream script file, plus the tab arithmetic procs, the selection handlers, the icon refresh, the deposit-all loops and the recount pass.
- `content-custom/pack/interface.pack` - a pinned copy of the upstream pack plus twenty-one rows at 10984 onward.
- `content-custom/pack/interface.order` - a pinned copy of upstream's emit order with the twenty-one new ids inserted immediately after `8133`, so `bank_main` stays one archive group.
- `content-custom/pack/script.pack` - a pinned copy of the clone's script pack plus the new trigger and proc rows at 10940 onward. Note that upstream does not track this file (`engine/content/.gitignore:4`); it is regenerated by `regenScriptPack`, which is exactly why it has to be pinned here.
- `engine-custom/src/idlescape/contentFiles.ts` - the repository-root resolver plus small parsers for `.pack`, `.varp` and `.if` files, so the two test files below read the overlay's real content rather than a fixture.
- `engine-custom/src/idlescape/bankTabPack.test.ts` - the pack and varp assertions (Tasks 1 and 2).
- `engine-custom/src/idlescape/bankTabInterface.test.ts` - the `bank_main.if` geometry and component assertions (Task 3).
- `client/src/hooks/bankTabs.ts` - the pure half of patches 29 to 31: varp id resolution by clientcode, tab ranges, the visible-cell mapping, divider rows, the scroll height and the drag-drop target slot. Under 400 lines, no DOM, no `Client` import.
- `client/src/hooks/bankTabs.test.ts` - its unit tests, run by `bun test src/hooks` (verify step 4, no new wiring). Under 400 lines.
- `web/e2e/bank-tabs.pw.test.ts` - the browser coverage against the real client canvas.

**Modify**

- `content-custom/scripts/interface_bank/configs/banktab.varp` - `transmit=yes` and `clientcode` on the nine, plus the new `banktab` block.
- `content-custom/pack/varp.pack` - one appended line, `368=banktab`.
- `content-custom/manifest.json` - from two entries to eight.
- `content-custom/README.md` - the three new pinned packs, the `interface.order` grouping rule, the `powershell` invocation, and the pointer to the client patches that hard-code varp clientcodes.
- `client/src/client/Client.ts` - patches 29, 30 and 31.
- `client/src/client/MiniMenuAction.ts` - one new enum value, part of patch 31.
- `client/PATCHES.md` - three table rows and three verification blocks.
- `.gitattributes` - the content overlay's line endings (R12).
- `scripts/line-ceiling.ps1` - exemption 3's header text (R11).
- `scripts/verify.ps1` - the content-overlay manifest-tracked check (R13).
- `web/e2e/harness.ts` - export `cheat` so the new spec can send `::~bank`.
- `docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md` - section 3's id table and its "Two entries append" opening.
- `docs/superpowers/specs/2026-09-05-sp8b-web-bank-design.md` - section 3's `:60` correction and a new section 13, "What SP8c actually shipped".
- `docs/superpowers/sprint-control.md` - row 8's state, plus the two new backlog rows from Task 10.
- `docs/superpowers/decisions.md` - the cross-entry rulings.
- `docs/VERIFICATION.md` - the content-overlay manifest check moves out of "by hand today".
- `.claude/skills/idlescape-content-overlay/SKILL.md`, `.claude/skills/idlescape-client-patch/SKILL.md` - the new pinned packs, the stale entry numbering, patches 29 to 31.

---
## Task 1: The transport - `transmit=yes`, reserved clientcodes, and the `banktab` varp

Nothing in this entry is visible in game until this task lands (ruling R2). The nine `banktab_size_*` varps are declared, packed, seeded at login and mirrored back once a tick, and **none of it reaches the client**, because `Player.setVar` (`engine/server/src/engine/entity/Player.ts:1776`) writes a varp to the socket only `if (varp.transmit)`.

**Why clientcodes rather than ids.** The client has no varp name map: `client/src/config/VarpType.ts` decodes only `clientcode` (opcode 5 at `:45-46`) and discards the debug name. A patch that reads `this.var[359]` is a silent coupling to `content-custom/pack/varp.pack`, and a renumber breaks it with no error. A clientcode is a **value**, not an id, so it costs no pack row and survives a renumber. The client already branches on clientcodes 1, 3, 4, 5, 6, 8 and 9 in `clientVar(id)` (`Client.ts:13007-13091`; the bank owns 9, `bankArrangeMode`, at `:13088-13089`), and the engine reserves 7 for the run varp (`engine/server/src/cache/config/VarPlayerType.ts:50`). **10 to 19 are free**, and `ClientCode.CC_LOGOUT = 205` / `CC_BANKMODE = 206` are *component* client codes in a different namespace (`client/src/client/ClientCode.ts:17-19`), so there is no collision.

**Files:**
- Modify: `content-custom/scripts/interface_bank/configs/banktab.varp`
- Modify: `content-custom/pack/varp.pack` (append one line)
- Create: `engine-custom/src/idlescape/contentFiles.ts`
- Create: `engine-custom/src/idlescape/bankTabPack.test.ts`
- Modify: `engine-custom/manifest.json` (two new `kind: "new"` entries)

**Interfaces:**
- Consumes: nothing from an earlier task; this is the first.
- Produces, for Tasks 2, 3 and 7:
  ```ts
  // engine-custom/src/idlescape/contentFiles.ts
  export function repoRoot(): string;
  export function overlayText(rel: string): string;                       // rel is under content-custom/
  export function pristineText(rel: string): string;                      // the engine/content GIT BLOB at HEAD
  export function readPack(text: string): Array<{ id: number; name: string }>;
  export interface ConfigBlock { name: string; keys: Map<string, string> }
  export function readBlocks(text: string): ConfigBlock[];
  ```
  Constants pinned by this task and read by every later one: varp id `368 = banktab`; varp clientcodes `10 = banktab`, `11..19 = banktab_size_1..9`.

- [ ] **Step 1: Write the failing test**

Create `engine-custom/src/idlescape/bankTabPack.test.ts`:

```ts
/**
 * What the content overlay DECLARES about the bank tab varps, asserted against the tracked
 * files rather than a fixture. Three things can be wrong here and none of them shows up as a
 * failure anywhere else: a varp that is not transmitted never reaches the client (the whole of
 * SP8's tab work was invisible in game for exactly this reason), a duplicated clientcode makes
 * two varps fight over one client field, and a moved pack id silently rewrites every saved
 * character's tab sizes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { overlayText, readBlocks, readPack } from './contentFiles.js';
import { MAX_TABS } from './types.js';
import { TAB_VARP_NAMES } from './tabVarps.js';

const SELECTED_TAB_VARP = 'banktab';
const SELECTED_TAB_VARP_ID = 368;
const FIRST_SIZE_VARP_ID = 359;
const SELECTED_TAB_CLIENTCODE = 10;
const FIRST_SIZE_CLIENTCODE = 11;

test('banktab.varp declares ten varps, all transmitted, with distinct reserved clientcodes', () => {
    const blocks = readBlocks(overlayText('scripts/interface_bank/configs/banktab.varp'));
    assert.deepEqual(
        blocks.map(b => b.name),
        [...TAB_VARP_NAMES, SELECTED_TAB_VARP],
        'the nine size varps in order, then the selected-tab varp'
    );

    const codes: number[] = [];
    for (const block of blocks) {
        assert.equal(block.keys.get('transmit'), 'yes', `${block.name} must be transmit=yes or the client never sees it`);
        assert.equal(block.keys.get('protect'), 'no', `${block.name} protect`);
        const code = Number(block.keys.get('clientcode'));
        assert.ok(Number.isInteger(code), `${block.name} needs a clientcode`);
        codes.push(code);
    }
    assert.deepEqual(codes, [
        ...Array.from({ length: MAX_TABS }, (_, i) => FIRST_SIZE_CLIENTCODE + i),
        SELECTED_TAB_CLIENTCODE
    ]);
    assert.equal(new Set(codes).size, codes.length, 'clientcodes are distinct');
});

test('the size varps are scope=perm and the selected tab is scope=temp', () => {
    const blocks = readBlocks(overlayText('scripts/interface_bank/configs/banktab.varp'));
    for (const block of blocks) {
        const expected = block.name === SELECTED_TAB_VARP ? 'temp' : 'perm';
        assert.equal(block.keys.get('scope'), expected, `${block.name} scope (plan ruling R6)`);
    }
});

test('varp.pack pins the ten ids by name, contiguously, with nothing above them', () => {
    const rows = readPack(overlayText('pack/varp.pack'));
    const byId = new Map(rows.map(row => [row.id, row.name]));

    for (let i = 0; i < MAX_TABS; i++) {
        assert.equal(byId.get(FIRST_SIZE_VARP_ID + i), TAB_VARP_NAMES[i]);
    }
    assert.equal(byId.get(SELECTED_TAB_VARP_ID), SELECTED_TAB_VARP);

    const max = Math.max(...rows.map(row => row.id));
    assert.equal(max, SELECTED_TAB_VARP_ID, 'nothing has been appended past banktab without a section 3 row');
    assert.equal(new Set(rows.map(row => row.id)).size, rows.length, 'no duplicated varp id');
    assert.equal(new Set(rows.map(row => row.name)).size, rows.length, 'no duplicated varp name');
});
```

- [ ] **Step 2: Run it and watch it fail for the right reason**

```
powershell -File scripts/engine-overlay.ps1
cd engine/server
npx tsx --test --test-force-exit src/idlescape/bankTabPack.test.ts
```

Expected: every test errors at import with `Cannot find module './contentFiles.js'`. That is the correct first failure; the module is Step 3.

- [ ] **Step 3: Write `contentFiles.ts`**

Create `engine-custom/src/idlescape/contentFiles.ts`:

```ts
/**
 * Read-only accessors for the tracked content overlay, for tests that assert what the overlay
 * DECLARES. Everything resolves against the REPOSITORY root, not engine/server: the overlay's
 * sources live in content-custom/ and scripts/content-overlay.ps1 copies them into the pinned
 * clone, so a test that read engine/content/ would be reading its own output and could not fail.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

let cachedRoot: string | null = null;

/** The nearest ancestor of the working directory holding content-custom/manifest.json. */
export function repoRoot(): string {
    if (cachedRoot !== null) {
        return cachedRoot;
    }
    let dir = process.cwd();
    for (;;) {
        if (fs.existsSync(path.join(dir, 'content-custom', 'manifest.json'))) {
            cachedRoot = dir;
            return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            // Deliberately a throw rather than a skip. A skipped assertion is a test that cannot
            // fail, and this suite exists to catch a pack id that moved.
            throw new Error(`no repository root above ${process.cwd()}: content-custom/manifest.json not found`);
        }
        dir = parent;
    }
}

export function overlayText(rel: string): string {
    return fs.readFileSync(path.join(repoRoot(), 'content-custom', rel), 'utf8');
}

/**
 * The PRISTINE upstream file, read out of the engine/content git blob at HEAD rather than off
 * disk. Reading the working tree would read our own output the moment the overlay has been
 * applied, which is a comparison that cannot fail. `-c core.autocrlf=false` keeps the blob's own
 * LF endings, so the text is byte-identical to what upstream committed whatever this clone
 * checked out. Only for files upstream tracks: `pack/script.pack` is git-ignored there
 * (`engine/content/.gitignore:4`) and this throws for it, which is the correct answer.
 */
export function pristineText(rel: string): string {
    return execFileSync('git', ['-C', path.join(repoRoot(), 'engine', 'content'), '-c', 'core.autocrlf=false', 'show', `HEAD:${rel}`], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024
    });
}

/** One `<id>=<name>` line of a pack file. */
export interface PackRow {
    id: number;
    name: string;
}

export function readPack(text: string): PackRow[] {
    const rows: PackRow[] = [];
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (line.length === 0) {
            continue;
        }
        const eq = line.indexOf('=');
        if (eq < 1) {
            throw new Error(`pack line is not <id>=<name>: ${line}`);
        }
        const id = Number(line.slice(0, eq));
        if (!Number.isInteger(id) || id < 0) {
            throw new Error(`pack line has a non-integer id: ${line}`);
        }
        rows.push({ id, name: line.slice(eq + 1) });
    }
    return rows;
}

/** One `[name]` block of a .varp or .if config file. */
export interface ConfigBlock {
    name: string;
    keys: Map<string, string>;
}

export function readBlocks(text: string): ConfigBlock[] {
    const blocks: ConfigBlock[] = [];
    for (const raw of text.split('\n')) {
        const line = raw.replace(/\/\/.*$/, '').trim();
        if (line.length === 0) {
            continue;
        }
        if (line.startsWith('[') && line.endsWith(']')) {
            blocks.push({ name: line.slice(1, -1), keys: new Map() });
            continue;
        }
        const eq = line.indexOf('=');
        if (eq < 1 || blocks.length === 0) {
            throw new Error(`config line outside a block, or not key=value: ${line}`);
        }
        blocks[blocks.length - 1].keys.set(line.slice(0, eq), line.slice(eq + 1));
    }
    return blocks;
}
```

- [ ] **Step 4: Run it and watch it fail on the content, not the module**

Same command as Step 2. Expected now: `banktab.varp declares ten varps ...` fails on the block list (nine names, not ten), and `varp.pack pins the ten ids` fails with `expected 368, got 367`. Both are the real assertions.

- [ ] **Step 5: Change the varp declarations**

Rewrite `content-custom/scripts/interface_bank/configs/banktab.varp` so each of the nine existing blocks gains two keys and one block is appended. The first and the last, verbatim; the middle seven follow the same shape with their own number and clientcode:

```
// The bank's tab layout, mirrored to and from the shared owner bank by
// engine-custom/src/idlescape/tabVarps.ts. transmit=yes is load-bearing: without it
// Player.setVar (engine/server/src/engine/entity/Player.ts:1776) never writes these to the
// socket and the game client sees zeros forever. clientcode is how client patch 29 finds them
// without hard-coding a pack id; see client/PATCHES.md, patch 29.
[banktab_size_1]
scope=perm
protect=no
transmit=yes
clientcode=11

[banktab_size_2]
scope=perm
protect=no
transmit=yes
clientcode=12
```

... through `banktab_size_9` / `clientcode=19`, then:

```
// The selected tab, 0 for "All items" and 1 to 9 for a tab. A VIEW, not state: the web bank
// keeps its own selection in memory per window (web/src/bank/view.ts:73), so this is
// scope=temp and per character. Plan ruling R6.
[banktab]
scope=temp
protect=no
transmit=yes
clientcode=10
```

- [ ] **Step 6: Pin the new varp id and record both files in the manifest**

Append one line to `content-custom/pack/varp.pack` (the file currently ends at `367=banktab_size_9`, with no trailing blank line; keep it that way):

```
368=banktab
```

`content-custom/manifest.json` already lists both files, so no manifest change is needed for Step 5 or Step 6. Add the two **engine-custom** entries instead, in the alphabetical position the file already uses, to `engine-custom/manifest.json`'s `files` array:

```json
    { "path": "src/idlescape/bankTabPack.test.ts", "kind": "new", "baseSha256": null },
    { "path": "src/idlescape/contentFiles.ts", "kind": "new", "baseSha256": null },
```

- [ ] **Step 7: Run the test and watch it pass**

```
powershell -File scripts/engine-overlay.ps1
cd engine/server
npx tsx --test --test-force-exit src/idlescape/bankTabPack.test.ts
```
Expected: three tests pass.

- [ ] **Step 8: Prove the pack really builds with the new varp**

From the repository root:
```
powershell -File scripts/content-overlay.ps1
cd engine/server
npx tsx tools/pack/BuildOverlay.ts
```
Expected: it prints `[idlescape] pack ids unchanged (N pack file(s) verified byte-for-byte)`. If it names `varp.pack`, the new line does not match what the packer wanted and the id is wrong; fix the line, never the guard.

- [ ] **Step 9: Fill in the mutation-to-test table**

Run each mutation, confirm the named test fails, then revert it. This table goes in the task's handoff.

| Change I made to break it | The test that must fail | Did it? |
|---|---|---|
| Delete `transmit=yes` from `[banktab_size_5]` | `banktab.varp declares ten varps, all transmitted, ...` | |
| Set `[banktab_size_3]` to `clientcode=11` (a duplicate) | same test, on the `codes` deepEqual and the distinctness assert | |
| Change `368=banktab` to `369=banktab` | `varp.pack pins the ten ids by name, contiguously, ...` | |
| Change `[banktab]` to `scope=perm` | `the size varps are scope=perm and the selected tab is scope=temp` | |

- [ ] **Step 10: Full per-package verification**

```
powershell -File scripts/content-overlay.ps1
powershell -File scripts/content-overlay.ps1 -Check
```
Read the printed output, **never `$LASTEXITCODE`**: `content-overlay.ps1:94` runs `exit 0` unconditionally, so wrapping it in an exit-code check is a check that cannot fail (`docs/VERIFICATION.md`, false green 1). Expect it to report drift on `pack/varp.pack`, which is the known self-reporting replace entry `content-custom/README.md` already documents, and on nothing else.

```
powershell -File scripts/engine-overlay.ps1
powershell -File scripts/engine-overlay.ps1 -Check
cd engine/server
npx tsc --noEmit
npx tsx --test --test-force-exit src/idlescape/bankTabPack.test.ts src/idlescape/install.test.ts src/idlescape/installSweep.test.ts
```
Expected: all green. The two existing suites are here because they drive `readTabVarps` / `writeTabVarps` and would catch a varp rename.

```
powershell -File scripts/line-ceiling.ps1
```
Expected: green. `contentFiles.ts` is about 90 lines and `bankTabPack.test.ts` about 80 at this point.

- [ ] **Step 11: Commit**

```bash
git add content-custom/scripts/interface_bank/configs/banktab.varp content-custom/pack/varp.pack engine-custom/src/idlescape/contentFiles.ts engine-custom/src/idlescape/bankTabPack.test.ts engine-custom/manifest.json
git -c core.safecrlf=false commit -m "feat(content): transmit the bank tab varps and add the selected-tab varp

The nine banktab_size_* varps were declared scope=perm and never transmit=yes, so
Player.setVar never wrote them to the socket and SP8's whole tab layer was invisible in
game. Adds transmit=yes plus reserved clientcodes 11 to 19, and a tenth varp banktab
(id 368, clientcode 10, scope=temp) for the selected tab. contentFiles.ts and
bankTabPack.test.ts assert the declarations against the tracked overlay, so a dropped
transmit or a moved pack id fails a test rather than shipping.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 2: Pin `interface.pack`, `interface.order` and `script.pack`, and amend the sprint id table

Ruling R1. This entry cannot add one interface component or one RuneScript trigger until these three files are pinned copies under `content-custom/pack/`, because `BuildOverlay.ts` fails the build the moment `packAll` rewrites a pinned pack and its instruction is to add the missing id lines by hand, which is impossible for a pack that is not pinned at all.

**Two mechanical facts that decide the shapes below.**

1. **`interface.order` must keep the new ids grouped with `bank_main`.** `packInterface` (`engine/server/tools/pack/interface/PackShared.ts:175-215`) seeds its component record from `pack/interface.order` and throws `Missing component ID <name> in .../pack/interface.order` for anything absent. The emit loop then walks that order and writes a `-1` group marker whenever `com.root` changes (`:251-267`), so ids appended at the **end** of the file would split `bank_main` into two archive groups. The precedent to copy is `bank_main:com_99` to `com_102`, ids 8130 to 8133, which sit at `interface.order` lines 171 to 174 immediately after the rest of the bank run and immediately before `5063`. **The twenty-one new ids go between `8133` and `5063`.**
2. **`interface.order` is invisible to the pack guard.** `hashPacks` (`engine-custom/tools/pack/packGuard.ts:18-32`) hashes only `*.pack` files, so the one file whose ordering can silently reshape the interface archive is unguarded. That is why Task 2's test asserts the ordering itself.

**Files:**
- Create: `content-custom/pack/interface.pack`
- Create: `content-custom/pack/interface.order`
- Create: `content-custom/pack/script.pack`
- Modify: `content-custom/manifest.json`
- Modify: `content-custom/README.md`
- Modify: `.gitattributes`
- Modify: `scripts/line-ceiling.ps1` (exemption 3's header text only)
- Modify: `scripts/verify.ps1`
- Modify: `engine-custom/src/idlescape/bankTabPack.test.ts`
- Modify: `docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md`

**Interfaces:**
- Consumes: `overlayText`, `pristineText`, `readPack` from Task 1's `contentFiles.ts`.
- Produces, pinned by name and read by Tasks 3, 4 and 5:

  | Pack | Id | Name |
  |---|---|---|
  | `interface` | 10984 to 10993 | `bank_main:tab_0` to `bank_main:tab_9` (the buttons) |
  | `interface` | 10994 to 11002 | `bank_main:tabicon_1` to `bank_main:tabicon_9` (the icons; ruling R17) |
  | `interface` | 11003 | `bank_main:deposit_inv` |
  | `interface` | 11004 | `bank_main:deposit_worn` |
  | `script` | 10940 onward | the new `bank.rs2` triggers and procs, in the order Task 4 and Task 5 declare them |

  Component names use `tab_0` rather than `com_103` on purpose: the upstream `com_N` run is dense and a later upstream bump that adds a component would collide, while a named component cannot. **Twenty-one components, not twelve**: ruling R17 splits every tab into a `buttontype=select` button and a separate `type=model` icon, because `if_sethide` is a no-op on a non-layer component and a `type=model` select button renders nothing while it is the selected one.

- [ ] **Step 1: Copy the three upstream packs into the overlay, unmodified**

From the repository root, in Git Bash:
```bash
cp engine/content/pack/interface.pack  content-custom/pack/interface.pack
cp engine/content/pack/interface.order content-custom/pack/interface.order
cp engine/content/pack/script.pack     content-custom/pack/script.pack
sha256sum engine/content/pack/interface.pack engine/content/pack/interface.order engine/content/pack/script.pack
```
Keep the three shas; they are the `baseSha256` values in Step 4. Copy from the **clone**, which the overlay has already been applied to and which the overlay does not yet touch for these three files, so it still holds the pristine copy.

**Take the sha off the file ON DISK, not out of the git blob**, and this is not a preference. `content-overlay.ps1 -Check` compares `(Get-FileHash -LiteralPath $basePath -Algorithm SHA256).Hash` of the file **as it sits in `engine/content`** against the manifest's `baseSha256` (`scripts/content-overlay.ps1:76`). Upstream Content's own `.gitattributes` pins only `*.pack text eol=lf`; everything else is `text=auto`, and with `core.autocrlf=true` here `git -C engine/content ls-files --eol` reports **`i/lf w/crlf`** for `pack/interface.order`, `scripts/interface_bank/interfaces/bank_main.if` and `scripts/interface_bank/scripts/bank.rs2`. Measured: the blob sha of `bank_main.if` is `2c11037eac0331c67c6e45d3ce8f72cad3055afcab6d712d37e64ea65d229d9a` and its on-disk sha is `1b7ff7eff0d0c4a6f75f0f6b6ada3aef987ffe9dc5d96a62acf336f22d61a7a2`. A blob sha in the manifest makes those entries report "base file changed upstream since the override was recorded" on **every** `-Check` run forever, which destroys the one signal Step 10 and the executor notes tell you to read. The existing `pack/varp.pack` entry works only because `*.pack` is `eol=lf` there, so blob and disk agree for it. Take every `baseSha256` in this plan off disk and the class of file stops mattering. Case does not: PowerShell's `-ne` on strings is case-insensitive, so `sha256sum`'s lowercase hex compares equal to `Get-FileHash`'s uppercase.

`pack/script.pack` has **no git blob at all**: upstream ignores it (`engine/content/.gitignore:4`) because `regenScriptPack` regenerates it. On disk is the only place it exists, which is a second reason Step 1 reads disk and a third reason R1 pins it here.

- [ ] **Step 2: Write the failing test**

Append to `engine-custom/src/idlescape/bankTabPack.test.ts`:

```ts
const NEW_INTERFACE: Array<[number, string]> = [
    [10984, 'bank_main:tab_0'], [10985, 'bank_main:tab_1'], [10986, 'bank_main:tab_2'],
    [10987, 'bank_main:tab_3'], [10988, 'bank_main:tab_4'], [10989, 'bank_main:tab_5'],
    [10990, 'bank_main:tab_6'], [10991, 'bank_main:tab_7'], [10992, 'bank_main:tab_8'],
    [10993, 'bank_main:tab_9'],
    [10994, 'bank_main:tabicon_1'], [10995, 'bank_main:tabicon_2'], [10996, 'bank_main:tabicon_3'],
    [10997, 'bank_main:tabicon_4'], [10998, 'bank_main:tabicon_5'], [10999, 'bank_main:tabicon_6'],
    [11000, 'bank_main:tabicon_7'], [11001, 'bank_main:tabicon_8'], [11002, 'bank_main:tabicon_9'],
    [11003, 'bank_main:deposit_inv'], [11004, 'bank_main:deposit_worn']
];

test('interface.pack keeps every upstream row exactly where it was and appends only ours', () => {
    const ours = readPack(overlayText('pack/interface.pack'));
    // The comparison has to be against the GIT BLOB, not against engine/content on disk:
    // engine/content is the pinned clone the overlay is copied INTO, so once this file ships it
    // is our own copy and a disk comparison could not fail. pristineText shells
    // `git -C engine/content show HEAD:<rel>`, which is what BuildOverlay's guard effectively
    // compares to as well.
    const pristine = readPack(pristineText('pack/interface.pack'));
    assert.ok(pristine.length > 10_000, 'the pristine pack was read, not an empty string');

    // Row for row, in order, with ours appended and nothing else touched. This is the assertion
    // the title promises and the one R1 needs: a renumber anywhere in 10,984 rows fails here.
    assert.deepEqual(
        ours,
        [...pristine, ...NEW_INTERFACE.map(([id, name]) => ({ id, name }))],
        'every upstream row is unmoved and only the SP8c rows are appended'
    );

    const byId = new Map(ours.map(row => [row.id, row.name]));
    // Spelled out as well as covered by the deepEqual, because these three are the ones a
    // reader needs to see named: client/src/vendor/rs-sdk/bot/types.ts:24-25 hard-codes the
    // first two, and the third is where interface.order's bank_main run ends.
    assert.equal(byId.get(5292), 'bank_main');
    assert.equal(byId.get(5382), 'bank_main:inv');
    assert.equal(byId.get(8133), 'bank_main:com_102');
    assert.equal(byId.get(10983), 'music:competition', 'upstream maximum is unchanged');

    assert.equal(Math.max(...ours.map(row => row.id)), 11004);
    assert.equal(new Set(ours.map(row => row.id)).size, ours.length, 'no duplicated interface id');
    assert.equal(new Set(ours.map(row => row.name)).size, ours.length, 'no duplicated component name');
});

test('interface.order lists every new id in one run, immediately after bank_main:com_102', () => {
    const order = overlayText('pack/interface.order')
        .split('\n').map(line => line.trim()).filter(line => line.length > 0).map(Number);
    const at = order.indexOf(8133);
    assert.ok(at > 0, 'bank_main:com_102 is in the order file');
    assert.deepEqual(
        order.slice(at + 1, at + 1 + NEW_INTERFACE.length),
        NEW_INTERFACE.map(([id]) => id),
        'the new ids sit in the bank_main run, or packInterface splits the archive into two groups'
    );
    assert.equal(new Set(order).size, order.length, 'no id listed twice');
});

test('script.pack keeps the clone maximum and holds no duplicate id or name', () => {
    // There is no pristine blob to diff against: engine/content ignores pack/script.pack
    // (engine/content/.gitignore:4) because regenScriptPack rewrites it. The anchor at 10939 and
    // the two distinctness checks are what CAN be asserted about the copy. Task 4 adds the
    // separate test that pins each new trigger by name and asserts contiguity from 10940, once
    // there are names to pin.
    const ours = readPack(overlayText('pack/script.pack'));
    const byId = new Map(ours.map(row => [row.id, row.name]));
    assert.equal(byId.get(10939), '[debugproc,zone]', 'the clone maximum is unchanged');
    assert.equal(new Set(ours.map(row => row.id)).size, ours.length, 'no duplicated script id');
    assert.equal(new Set(ours.map(row => row.name)).size, ours.length, 'no duplicated script name');
});
```

Add `pristineText` to the file's import from `./contentFiles.js`; Task 1 wrote `overlayText, readBlocks, readPack`.

- [ ] **Step 3: Run it and watch it fail**

```
powershell -File scripts/engine-overlay.ps1
cd engine/server
npx tsx --test --test-force-exit src/idlescape/bankTabPack.test.ts
```
Expected: the interface test fails on the `deepEqual` (ours is the pristine list with nothing appended) and the order test fails on the slice (it holds `5063, 5064, 201 ...`). The `script.pack` test passes already, which is correct: at this step the copy really is unmodified, and the assertions it carries are about what must never change.

- [ ] **Step 4: Append the ids by hand and register the three files**

Append twenty-one lines to the end of `content-custom/pack/interface.pack` (ruling R17: ten buttons, nine icons, two deposit-all buttons):
```
10984=bank_main:tab_0
10985=bank_main:tab_1
10986=bank_main:tab_2
10987=bank_main:tab_3
10988=bank_main:tab_4
10989=bank_main:tab_5
10990=bank_main:tab_6
10991=bank_main:tab_7
10992=bank_main:tab_8
10993=bank_main:tab_9
10994=bank_main:tabicon_1
10995=bank_main:tabicon_2
10996=bank_main:tabicon_3
10997=bank_main:tabicon_4
10998=bank_main:tabicon_5
10999=bank_main:tabicon_6
11000=bank_main:tabicon_7
11001=bank_main:tabicon_8
11002=bank_main:tabicon_9
11003=bank_main:deposit_inv
11004=bank_main:deposit_worn
```

Insert the same twenty-one numbers into `content-custom/pack/interface.order` **immediately after the line reading `8133`** (upstream line 174), not at the end.

Leave `content-custom/pack/script.pack` at its unmodified copy. Task 4 and Task 5 append its rows, because only they know the trigger names, and **Task 4 Step 2 ADDS a second test** (`script.pack pins every new trigger by name, contiguously from 10940`) rather than moving anything out of here. Nothing in this task is left red.

Add three entries to `content-custom/manifest.json` (five in total), using the shas from Step 1:

```json
{
  "files": [
    { "path": "pack/varp.pack", "baseSha256": "BE5D9B325D1E26C06C2643A63D796A922ACC1F4DDE38F1090C0653EE833517D8" },
    { "path": "pack/interface.pack", "baseSha256": "<sha from step 1>" },
    { "path": "pack/interface.order", "baseSha256": "<sha from step 1>" },
    { "path": "pack/script.pack", "baseSha256": "<sha from step 1>" },
    { "path": "scripts/interface_bank/configs/banktab.varp", "baseSha256": null }
  ]
}
```
(`bank_main.if` and `bank.rs2` join it in Tasks 3 and 4.)

- [ ] **Step 5: Pin the line endings (ruling R12)**

**If entry 3 has landed**, `.gitattributes` already carries `content-custom/pack/*.pack text eol=lf`; append only the two lines this entry adds beyond it (`*.order` and `content-custom/scripts/**`) and keep the comment. **If it has not**, append all three. Read the file first rather than assuming.

Append to `.gitattributes`:

```
# The content overlay mirrors upstream Content, whose own .gitattributes declares `*.pack text
# eol=lf`. This repository declares only `* text=auto` with core.autocrlf=true, so a fresh
# Windows clone would check these out CRLF; PackFile.save() writes with \n
# (engine/server/tools/pack/PackFileBase.ts:120-128), the first packAll would rewrite them LF,
# and BuildOverlay.ts would exit 1 naming a file nobody edited.
content-custom/pack/*.pack text eol=lf
content-custom/pack/*.order text eol=lf
content-custom/scripts/** text eol=lf
```

Then **renormalise before checking**, because the three files just copied in came out of the clone with CRLF working-tree endings (`git -C engine/content ls-files --eol` reports `i/lf w/crlf` for `pack/interface.order`, and Task 3's and Task 4's `.if` and `.rs2` copies are the same). Adding the attribute normalises the INDEX on `git add`, but the working-tree copy stays CRLF until it is checked out again, so a bare `ls-files --eol` here would read `i/lf w/crlf` for the new files and R12's "every content-custom file is `i/lf w/lf`" would stop being the right expectation:

```bash
git add --renormalize content-custom
git ls-files --eol content-custom/
```
Expected after the renormalise: every text row reads `i/lf` and `w/lf`, the `.gitkeep` files read `i/none w/none`, and `content-custom/pack/interface.pack` and `pack/script.pack` show `attr/text eol=lf`. If any row still reads `w/crlf`, the renormalise did not run or the pattern in `.gitattributes` does not match that path; fix the pattern, and re-take that file's `baseSha256` if the file's own bytes changed (they should not: the overlay copies are LF in the index either way, and `baseSha256` is the sha of the UPSTREAM file in `engine/content`, not of our copy).

- [ ] **Step 6: Name `content-custom/**` in the line ceiling's exemption header (ruling R11)**

In `scripts/line-ceiling.ps1`, exemption 3 currently reads "Generated output -- wiki/data/**, web/src/data/**, content-custom/pack/**". Widen it to the whole directory and say why:

```
#   3. Generated and mirrored content -- wiki/data/**, web/src/data/**, and content-custom/**
#      whole. Extension filtering and the include list remove all of it: content-custom/ is not
#      in includeDirs and .if/.rs2/.varp/.pack/.order are not in includeExt. This is named here
#      rather than left to that silence because SP8c added a bank_main.if far over the ceiling:
#      these files are byte-for-byte mirrors of a pinned upstream clone, applied file-for-file by
#      scripts/content-overlay.ps1, so splitting one would break the overlay's mapping and its
#      manifest entry. The one generated SOURCE file inside the include list is
#      web/src/tasks/library/tutorialIsland/steps.ts (82 lines today), named below so a future
#      regeneration that crosses 400 is a known exemption rather than a surprise.
```

**No line total goes into that comment** (ruling R11, and entry 3's ruling R7): a quoted count in an enforcement script's header is a number the next reader trusts and nobody re-measures.
Nothing in the script's logic changes; this edits comment text only.

- [ ] **Step 7: Make sure `verify.ps1` checks the CONTENT manifest too (ruling R13)**

**If entry 3 has landed**, its Task 4 Step 6 already replaced the single-manifest block with a loop over both. Confirm it by reading `verify.ps1` around the `overlay manifest paths are git-tracked` sub-step, check that `content-custom` is in the loop, and go straight to Step 8, which is the part that proves it. Change nothing.

**If entry 3 has not landed**, make the change here. `verify.ps1:114-139` holds the engine-overlay version inline. Extract it into a function and call it twice, so the file grows by about a dozen lines rather than thirty. Add near the other helpers (after `Write-SubStep`):

```powershell
# Every manifest path must be a tracked file. Both overlays are copied into engine/, a pristine
# throwaway clone that scripts/setup.ps1 recreates, so an overlay file that was never `git add`ed
# still applies and still passes every suite on THIS machine while being absent from the
# repository. deploy/docker/engine.Dockerfile builds its content copy from `git archive`, so an
# untracked content file ships a stock bank to production with a green verify behind it.
function Assert-ManifestTracked {
    param([string] $Root, [string] $Overlay)
    $manifestPath = Join-Path $Root "$Overlay\manifest.json"
    $manifestPaths = @((Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json).files | ForEach-Object { $_.path })
    if ($manifestPaths.Count -eq 0) { throw "$Overlay/manifest.json lists no files" }
    $untracked = New-Object System.Collections.Generic.List[string]
    foreach ($p in $manifestPaths) {
        $tracked = "$Overlay/$($p -replace '\\', '/')"
        # `--error-unmatch` writes to stderr for a path git does not know, and under
        # $ErrorActionPreference = 'Stop' a native command's stderr becomes a terminating error,
        # so the `if ($LASTEXITCODE ...)` below would never run and the listing under it would be
        # dead code: the script would die on the FIRST offender instead of naming all of them.
        try {
            $ErrorActionPreference = 'Continue'
            & git -C $Root ls-files --error-unmatch -- $tracked *> $null
        } finally {
            $ErrorActionPreference = 'Stop'
        }
        if ($LASTEXITCODE -ne 0) { $untracked.Add($tracked) }
    }
    if ($untracked.Count -gt 0) {
        foreach ($p in $untracked) { Write-Host "    untracked: $p" }
        throw "$Overlay/manifest.json names $($untracked.Count) file(s) that git does not track; 'git add' them"
    }
    Write-Host "  $($manifestPaths.Count) $Overlay manifest path(s) tracked."
}
```

Replace the inline block at `verify.ps1:114-139` with:
```powershell
Write-SubStep '(cont.) engine overlay manifest paths are git-tracked'
Assert-ManifestTracked -Root $root -Overlay 'engine-custom'

Write-SubStep '(cont.) content overlay manifest paths are git-tracked'
Assert-ManifestTracked -Root $root -Overlay 'content-custom'
```

**Rename the step, in the same edit.** `verify.ps1:103` reads `Write-Step 'engine overlay (apply + drift check)'` and this sub-step is no longer only about the engine overlay. Change it to:
```powershell
Write-Step 'overlays (apply + drift check)'
```
`$TotalSteps` stays 10; this adds sub-steps, never a step.

- [ ] **Step 7b: Give the content half a gate at all, by folding the packer into the same step**

This is the finding the whole task exists to answer, and it is bigger than the manifest check. **Nothing in `scripts/verify.ps1` or `scripts/build.ps1` applies the content overlay or runs the packer.** Step 2 runs `engine-overlay.ps1` and `engine-overlay.ps1 -Check` only (`verify.ps1:103-107`); `content-overlay.ps1` appears only in `start-stack.ps1:20`, which applies and does not pack. So `bank_main.if` and `bank.rs2`, the bulk of this entry, would have **no automated gate**: `bankTabPack.test.ts` and `bankTabInterface.test.ts` parse them as text and never compile them, and this plan calls the packer their compiler in four places ("Pack, which is this task's compiler", Task 4 Step 7; "for RuneScript, the packer is the type checker", Task 4 Step 10).

Add two more sub-steps to verify step 2, immediately after the two `Assert-ManifestTracked` calls:

```powershell
Write-SubStep '(cont.) content overlay apply'
& (Join-Path $PSScriptRoot 'content-overlay.ps1')
Invoke-Native 'content overlay apply'

# The packer IS the type checker for RuneScript and for .if config: it resolves every command,
# component reference, constant and pack id, and BuildOverlay sha256s every *.pack before and
# after and exits 1 naming any that moved. Without this sub-step nothing in `npm run verify`
# compiles content-custom/**, and a typo in bank.rs2 would ship behind a green.
Write-SubStep '(cont.) content pack (BuildOverlay.ts)'
Push-Location (Join-Path $root 'engine\server')
try {
    npx tsx tools/pack/BuildOverlay.ts; Invoke-Native 'content pack'
} finally { Pop-Location }
```

`content-overlay.ps1 -Check` is deliberately NOT called here: it `exit 0`s unconditionally (`content-overlay.ps1:94`) and, once this entry lands, reports expected drift on six entries every run. Its output is for a human to read, not for a gate. The gate is the apply plus the pack.

**If entry 3 has landed** and has already added either sub-step, confirm it and change nothing.

- [ ] **Step 8: Prove the check can fail, whoever wrote it**

```powershell
git rm --cached content-custom/pack/interface.order
powershell -File scripts/verify.ps1
```
Expected: step 2 fails with `content-custom/manifest.json names 1 file(s) that git does not track` and prints `untracked: content-custom/pack/interface.order`. Then put it back:
```powershell
git add content-custom/pack/interface.order
```
A check that has never been seen to fail is not a check. Record the output in the handoff.

- [ ] **Step 9: Amend the sprint spec's section 3**

In `docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md`, change the section 3 opening from "Two entries append to `content-custom/pack/*`" to "Three entries append to `content-custom/pack/*`", and add six rows to the id table, keeping its column order:

```
| `varp` | 368 | `banktab` | 8, SP8c |
| `interface` | 10984-10993 | `bank_main:tab_0` .. `bank_main:tab_9` | 8, SP8c |
| `interface` | 10994-11002 | `bank_main:tabicon_1` .. `bank_main:tabicon_9` | 8, SP8c |
| `interface` | 11003 | `bank_main:deposit_inv` | 8, SP8c |
| `interface` | 11004 | `bank_main:deposit_worn` | 8, SP8c |
| `script` | 10940+ | the `bank.rs2` triggers and procs SP8c adds | 8, SP8c |
```

Add one paragraph under the table:

```
Entry 8 also pins `interface.pack`, `interface.order` and `script.pack` into
`content-custom/pack/` itself, because entry 3's scope names only `obj`, `inv` and `loc` and an
interface component cannot be added without its pack file. `interface.order` is outside the pack
guard (`packGuard.hashPacks` hashes only `*.pack`), and it is the one file whose ordering can
silently reshape the interface archive: new component ids must sit in their root's contiguous
run or `packInterface` writes a second `-1` group marker. `engine-custom/src/idlescape/bankTabPack.test.ts`
asserts both, and asserts that `5292=bank_main` and `5382=bank_main:inv` have not moved, because
`client/src/vendor/rs-sdk/bot/types.ts:24-25` hard-codes them.
```

- [ ] **Step 10: Update `content-custom/README.md`**

Three edits, all small:
- In the "Packing" section, change `pwsh scripts/content-overlay.ps1` to `powershell -File scripts/content-overlay.ps1` (`pwsh` is not installed on this machine).
- In the `manifest.json` section, after the sentence about `pack/varp.pack` self-reporting drift, replace "There is one today" with "There are four today, `pack/varp.pack`, `pack/interface.pack`, `pack/interface.order` and `pack/script.pack`, plus the two `scripts/interface_bank/` replacements".
- Add a new short section:

```markdown
## The pinned packs

`pack/*.pack` and `pack/interface.order` are pinned copies of the upstream files with our ids
appended by hand. They are pinned rather than generated because `BuildOverlay.ts` sha256s every
`*.pack` before and after `packAll` and exits 1 naming any that moved, and because a renumbered
pack silently turns one item, component or varp into another in every `.sav` and every
owner-bank JSON. The allocation lives in the sprint spec's section 3, by name.

Two traps. `interface.pack` ids are **not** auto-assigned: `validateInterfacePack` throws for a
missing component regardless of `Environment.build.verify`, so write the line by hand.
`script.pack` ids **are** auto-assigned by `regenScriptPack`, which always calls `pack.save()`,
so the first pack run after adding a trigger fails the guard unless the id is already in the
pinned file.

`interface.order` is not a `.pack` file, so `packGuard.hashPacks` does not see it. New component
ids must be inserted inside their root's contiguous run (for `bank_main`, immediately after
`8133`), or `packInterface`'s emit loop writes a `-1` group marker and splits the interface into
two archive groups.

`client/src/client/Client.ts` patches 29 to 31 read the bank tab varps by **clientcode**
(10 for `banktab`, 11 to 19 for `banktab_size_1..9`), not by pack id, precisely so a renumber
here cannot break them silently. Those clientcodes are declared in
`scripts/interface_bank/configs/banktab.varp` and are as load-bearing as the ids.
```

- [ ] **Step 11: Verify**

```
powershell -File scripts/content-overlay.ps1
powershell -File scripts/content-overlay.ps1 -Check
cd engine/server
npx tsx tools/pack/BuildOverlay.ts
```
Expected: `BuildOverlay.ts` prints `pack ids unchanged` and names no file. The twenty-one interface ids are declared but no component uses them yet, which is legal: `validateInterfacePack` throws for a component with no id, not for an id with no component.

```
cd engine/server
npx tsx --test --test-force-exit src/idlescape/bankTabPack.test.ts
```
Expected: six tests pass, the three varp tests from Task 1 plus the two interface tests and the one `script.pack` test this task added.

```
powershell -File scripts/line-ceiling.ps1
powershell -File scripts/verify.ps1
```
Expected: both green, and verify step 2 now prints two `manifest path(s) tracked` lines.

- [ ] **Step 12: Mutation-to-test table**

| Change I made to break it | The test that must fail | Did it? |
|---|---|---|
| Move the new `interface.order` ids to the end of the file | `interface.order lists every new id in one run, ...` | |
| Change `10984=bank_main:tab_0` to `10984=bank_main:tab_1` | `interface.pack keeps every upstream row ...` (duplicate name, and the deepEqual) | |
| Edit `5382=bank_main:inv` to `5382=bank_main:inv2` | same test, on the `deepEqual` and on the rs-sdk assertion | |
| Swap two adjacent upstream rows anywhere in `interface.pack`, e.g. `2000` and `2001` | same test, on the `deepEqual`. **Run this one deliberately**: it is the mutation the old spot-check version of this test could not see, and the whole reason R1 quotes the rs-sdk hard-coding | |
| `git rm --cached content-custom/pack/script.pack` | `verify.ps1` step 2, content overlay manifest paths | |
| Break a component reference in `bank_main.if` (Task 3 onward) | `verify.ps1` step 2, `content pack (BuildOverlay.ts)` | |

- [ ] **Step 13: Commit**

```bash
git add content-custom/pack/interface.pack content-custom/pack/interface.order content-custom/pack/script.pack content-custom/manifest.json content-custom/README.md .gitattributes scripts/line-ceiling.ps1 scripts/verify.ps1 engine-custom/src/idlescape/bankTabPack.test.ts docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md
git -c core.safecrlf=false commit -m "build(content): pin interface.pack, interface.order and script.pack

SP8c cannot add an interface component or a RuneScript trigger without them: interface ids
throw when missing regardless of build.verify, and script ids auto-assign and rewrite the
pack, which BuildOverlay's guard then fails. Allocates interface 10984-11004 by name in the
sprint spec's section 3, asserts the ordering (interface.order is outside the pack guard) and
the two ids rs-sdk hard-codes, pins the overlay's line endings, and gives verify.ps1 the
content-overlay manifest-tracked check it had only for engine-custom.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---
## Task 3: `bank_main.if` - the tab strip, the deposit-all buttons and the pane geometry

**Why a tab is two components, and why every button must carry `option=`.** Ruling R17 has the whole argument; the three mechanical facts it rests on, so this task stands alone:

- `IF_SETOBJECT`'s client decode (`client/src/client/Client.ts:8480-8494`) writes `model1Type = 4`, `model1Id`, `modelXAn`, `modelYAn`, `modelZoom`, and only a `type=model` component renders that (`nameToType` maps `model` to 6 in `engine/server/tools/pack/interface/PackShared.ts:20`). A `type=graphic` component ignores it entirely. The precedent is `tanner:com_92` (`engine/content/scripts/interfaces/tanner.if:751-758`), a `type=model` with `zoom` and `xan`, whose model is set at runtime by `if_setobject(tanner:com_92, leather, 250)`.
- **The icon cannot also be the select button.** A `buttontype=select` component with `script1=eq,N` on `banktab` is ACTIVE while it is the selected tab, and the active branch of the model draw reads `model2Type`/`model2Id` (`IfType.ts:366-370`), which `IF_SETOBJECT` never writes and which the packer leaves at 0 without an `activemodel=` key (`PackShared.ts:551-560`). `getModel(0, 0, ...)` returns `null` (`IfType.ts:397-420`), so the selected tab would show no icon at all. And `if_sethide` cannot hide an empty tab either: `hide` is decoded only for `TYPE_LAYER` (`IfType.ts:163-165`) and read only by the two layer guards at `Client.ts:12035` and `:12307`, which with `:8474` are every `.hide` in the file. So the icon is its own non-button `type=model` component whose own comparator on `banktab_size_N` decides whether anything is drawn.
- `buildMinimenu` emits an entry for a select button only when `child.buttonText` is non-empty (`Client.ts:12234`), and `buttonText` is the `.if` file's `option=` key (`PackShared.ts:634`, written for button types 1, 4, 5 and 6). The precedent is `[khaki]` in `engine/content/scripts/areas/area_varrock/interfaces/player_kit_tailor_legs_man.if:738-749`: `type=rect`, `buttontype=select`, `script1op1=pushvar,if3`, `script1=eq,2`, `option=Khaki`; that file carries ten of them. `bank_main`'s own Item/Note and Swap/Insert toggles do NOT set `option=`, which is why those four appear unclickable in this fork today. **Every tab button must carry `option=` or the tab bar draws perfectly and does nothing.**

**Why `buttontype=select` and not `if_button` alone.** `Client.ts:11577-11589` handles `SELECT_BUTTON` by reading `com.scripts[0]` for `pushvar` (op 5), setting `this.var[varp] = com.scriptOperand[0]` **locally and immediately**, calling `clientVar(varp)` and then sending `IF_BUTTON`. So a select tab writes `banktab` with no 600 ms round trip, the draw patch reacts on the next frame, and the server still receives its `[if_button,...]` so the icon refresh can run. `bank_main` is a main modal and `Client.ts:7238` redraws it unconditionally every frame while open, so no redraw flag is needed.

**Geometry, all of it (ruling R8).** Upstream: `com_88` (window content layer) `x=36 y=20 width=440 height=299`; `com_90` (title) `y=30 height=14`; `com_92` (pane layer) `x=37 y=55 width=427 height=229 scroll=1145`; `[inv]` `layer=com_92 x=38 y=3 width=8 height=30 margin=15,6`, so a cell is 47 by 38; bottom controls y=284 to 327. After this task: the tab strip occupies `y=55` to `y=87`, `com_92` moves to `y=91 height=193` (bottom unchanged at 284), and `scroll` stays `1145` because it is the scrollable content height, not the viewport.

**Files:**
- Create: `content-custom/scripts/interface_bank/interfaces/bank_main.if`
- Create: `content-custom/scripts/interface_bank/configs/banktab.constant`
- Modify: `content-custom/manifest.json`
- Create: `engine-custom/src/idlescape/bankTabInterface.test.ts`
- Modify: `engine-custom/manifest.json`

**Interfaces:**
- Consumes: `overlayText`, `readBlocks` from Task 1; the twenty-one interface ids pinned in Task 2.
- Produces, for Tasks 4, 5, 8 and 9:
  - component names `bank_main:tab_0` .. `bank_main:tab_9` (buttons), `bank_main:tabicon_1` .. `bank_main:tabicon_9` (icons), `bank_main:deposit_inv`, `bank_main:deposit_worn`
  - component clientcodes `210 + N` on `tab_N`, the only thing client patch 31 uses to recognise a tab. **The icons carry no clientcode**, so a drop resolves to the button under the cursor and never to the icon drawn on top of it.
  - `^banktab_max = 9` and `^banktab_icon_zoom = 200` in `banktab.constant`
  - the pane geometry the client patches assume: eight columns, 47 by 38 cells, `com_92` viewport 193 px tall, and the inv's declared `y=3` inside it (which becomes `BANK_INV_TOP_PAD` in Task 6, because `child.y` is 0 at runtime).

- [ ] **Step 1: Write the failing test**

Create `engine-custom/src/idlescape/bankTabInterface.test.ts`:

```ts
/**
 * The bank interface's geometry and its tab components, asserted against the overlay's own
 * bank_main.if. Three classes of mistake live here and none is visible until a human opens the
 * bank in game: a tab strip that overlaps the item pane, a select button with no option= (which
 * draws perfectly and produces no menu entry at all, Client.ts:12234), and a tab whose
 * script1=eq,N does not match its own index, which silently selects the wrong tab.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { overlayText, readBlocks, type ConfigBlock } from './contentFiles.js';
import { MAX_TABS } from './types.js';

const TAB_X0 = 37;
const TAB_PITCH = 42;
const TAB_Y = 55;
const TAB_W = 40;
const TAB_H = 32;
const PANE_Y = 91;
const PANE_H = 193;

function blocks(): Map<string, ConfigBlock> {
    const list = readBlocks(overlayText('scripts/interface_bank/interfaces/bank_main.if'));
    return new Map(list.map(block => [block.name, block]));
}

test('ten tab buttons, each selectable, labelled, and bound to its own index', () => {
    const all = blocks();
    for (let tab = 0; tab <= MAX_TABS; tab++) {
        const com = all.get(`tab_${tab}`);
        assert.ok(com, `bank_main:tab_${tab} is declared`);
        assert.equal(com.keys.get('buttontype'), 'select', `tab_${tab} buttontype`);
        assert.ok((com.keys.get('option') ?? '').length > 0,
            `tab_${tab} needs option=; without it buildMinimenu emits no entry and the tab is dead`);
        assert.equal(com.keys.get('script1op1'), 'pushvar,banktab', `tab_${tab} script1op1`);
        assert.equal(com.keys.get('script1'), `eq,${tab}`, `tab_${tab} must select tab ${tab}, not another`);
        assert.equal(Number(com.keys.get('x')), TAB_X0 + tab * TAB_PITCH, `tab_${tab} x`);
        assert.equal(Number(com.keys.get('y')), TAB_Y, `tab_${tab} y`);
        assert.equal(Number(com.keys.get('width')), TAB_W, `tab_${tab} width`);
        assert.equal(Number(com.keys.get('height')), TAB_H, `tab_${tab} height`);
        assert.equal(Number(com.keys.get('clientcode')), 210 + tab,
            `tab_${tab} clientcode; client patch 31 finds a drop target by this and by nothing else`);
    }
});

test('every tab button declares its ACTIVE appearance, or the selected tab paints black', () => {
    // A buttontype=select component with script1=eq,N is ACTIVE exactly while it is the selected
    // tab, and the active branch of both draws reads colour2 (Client.ts:12453-12461 for rect,
    // :12489-12495 for text), which is the .if file's activecolour=. The packer writes
    // p4(parseInt(src.activecolour)) unconditionally for comTypes 3 and 4
    // (PackShared.ts:527-532), so a missing key is NaN, which packs as 0, which is black on a
    // dark frame. Upstream's own select buttons always declare it: bank_main:com_93 carries
    // graphic=combatboxes,2 with activegraphic=combatboxes,3.
    const all = blocks();
    for (let tab = 0; tab <= MAX_TABS; tab++) {
        const com = all.get(`tab_${tab}`);
        assert.ok(com);
        for (const key of ['colour', 'activecolour', 'overcolour', 'activeovercolour']) {
            assert.match(com.keys.get(key) ?? '', /^0x[0-9A-Fa-f]{6}$/, `tab_${tab} ${key}`);
        }
        assert.notEqual(com.keys.get('colour'), com.keys.get('activecolour'),
            `tab_${tab} selected and unselected must look different, or the strip has no selection`);
    }
});

test('the tab clientcodes are the only ones in their band, read out of the file', () => {
    // clientComponent (Client.ts:13093) branches on 1-100, 101-200, 201-203, 401-500, 503,
    // 701-900; clientButton (:13366) on 205, 206 and 300-327. 210 to 219 is free. What this
    // asserts is not that arithmetic, which cannot fail: it is that exactly the ten tab BUTTONS
    // hold a value in that band and no other component in bank_main.if has strayed into it,
    // the icons included. A collision would be rewritten or dispatched as a friends list entry
    // the moment the bank drew.
    const inBand = readBlocks(overlayText('scripts/interface_bank/interfaces/bank_main.if'))
        .filter(block => {
            const code = Number(block.keys.get('clientcode'));
            return Number.isInteger(code) && code >= 210 && code <= 219;
        })
        .map(block => block.name)
        .sort();
    assert.deepEqual(inBand, Array.from({ length: MAX_TABS + 1 }, (_, tab) => `tab_${tab}`).sort());
});

test('a tab is a button plus a separate icon, and the icon hides itself when the tab is empty', () => {
    // Plan ruling R17. The icon cannot be the button: the ACTIVE branch of a type=model draw
    // reads model2Type, which IF_SETOBJECT never writes, so a selected type=model select button
    // shows nothing. And if_sethide cannot hide it, because `hide` is decoded only for
    // TYPE_LAYER (IfType.ts:163-165) and read only by the two layer guards (Client.ts:12035,
    // :12307). So the icon is its own non-button component whose comparator on its OWN size
    // varp is true exactly when the tab is empty, which sends the draw down the model2 branch,
    // where model2Type is 0 and getModel returns null. That is the hide.
    const all = blocks();
    assert.equal(all.get('tab_0')?.keys.get('type'), 'text', 'tab_0 is the All items label');
    for (let tab = 1; tab <= MAX_TABS; tab++) {
        assert.equal(all.get(`tab_${tab}`)?.keys.get('type'), 'rect', `tab_${tab} is the button`);

        const icon = all.get(`tabicon_${tab}`);
        assert.ok(icon, `bank_main:tabicon_${tab} is declared`);
        assert.equal(icon.keys.get('type'), 'model',
            `tabicon_${tab} must be type=model; IF_SETOBJECT writes model1Type/model1Id and nothing else renders it`);
        assert.equal(icon.keys.get('buttontype'), undefined,
            `tabicon_${tab} must not be a button, or it would take the ACTIVE draw branch and vanish when selected`);
        assert.equal(icon.keys.get('clientcode'), undefined,
            `tabicon_${tab} must carry no clientcode, or patch 31 could resolve a drop to the icon`);
        assert.equal(icon.keys.get('script1op1'), `pushvar,banktab_size_${tab}`, `tabicon_${tab} script1op1`);
        assert.equal(icon.keys.get('script1'), 'eq,0',
            `tabicon_${tab} is ACTIVE only when its tab is empty, which is what draws nothing`);
        assert.equal(icon.keys.get('activemodel'), undefined,
            `tabicon_${tab} must declare no activemodel; the empty case relies on model2Type being 0`);
    }
});

test('the tab strip does not overlap the item pane, and the pane keeps its bottom edge', () => {
    const all = blocks();
    const pane = all.get('com_92');
    assert.ok(pane);
    assert.equal(Number(pane.keys.get('y')), PANE_Y);
    assert.equal(Number(pane.keys.get('height')), PANE_H);
    assert.equal(Number(pane.keys.get('scroll')), 1145, 'the scrollable content height covers all 240 slots');
    assert.ok(TAB_Y + TAB_H <= PANE_Y, 'strip bottom is above the pane top');
    assert.equal(PANE_Y + PANE_H, 284, 'the pane still ends where the bottom controls begin');

    const title = all.get('com_90');
    assert.ok(Number(title?.keys.get('y')) + Number(title?.keys.get('height')) <= TAB_Y, 'the title clears the strip');
});

test('the inv is unchanged: eight columns, 240 slots, clientcode 206, five withdraw options', () => {
    const inv = blocks().get('inv');
    assert.ok(inv);
    assert.equal(Number(inv.keys.get('width')), 8);
    assert.equal(Number(inv.keys.get('height')), 30);
    assert.equal(inv.keys.get('margin'), '15,6');
    assert.equal(inv.keys.get('layer'), 'com_92');
    assert.equal(Number(inv.keys.get('clientcode')), 206, 'CC_BANKMODE; the client patches find the pane by this');
    assert.equal(inv.keys.get('draggable'), 'yes');
    for (let op = 1; op <= 5; op++) {
        assert.ok((inv.keys.get(`option${op}`) ?? '').startsWith('Withdraw'),
            `option${op} stays a Withdraw; all five iop slots are spent, which is why move-to-tab is a client patch (R3)`);
    }
});

test('the two deposit-all buttons exist and are labelled', () => {
    const all = blocks();
    for (const name of ['deposit_inv', 'deposit_worn']) {
        const com = all.get(name);
        assert.ok(com, `bank_main:${name} is declared`);
        assert.equal(com.keys.get('buttontype'), 'normal');
        assert.ok((com.keys.get('option') ?? '').length > 0, `${name} needs option=`);
    }
});

test('the window title matches the web bank', () => {
    assert.equal(blocks().get('com_90')?.keys.get('text'), 'The Bank of Gielinor');
});
```

- [ ] **Step 2: Run it and watch it fail**

```
powershell -File scripts/engine-overlay.ps1
cd engine/server
npx tsx --test --test-force-exit src/idlescape/bankTabInterface.test.ts
```
Expected: every test errors at `overlayText`, with `ENOENT ... content-custom/scripts/interface_bank/interfaces/bank_main.if`. The file is Step 3.

- [ ] **Step 3: Copy the upstream interface into the overlay**

```bash
mkdir -p content-custom/scripts/interface_bank/interfaces
cp engine/content/scripts/interface_bank/interfaces/bank_main.if content-custom/scripts/interface_bank/interfaces/bank_main.if
sha256sum engine/content/scripts/interface_bank/interfaces/bank_main.if
```
Keep the sha for Step 6, and take it **off disk, not out of the git blob**: `bank_main.if` checks out CRLF here (`i/lf w/crlf`) and `content-overlay.ps1 -Check` hashes the working-tree file. Task 2 Step 1 has the measurement and the reason. Re-run Step 2's command: the tests now fail on content (`bank_main:tab_0 is declared`, `com_92 y expected 91 got 55`, and the title), which is the right failure.

- [ ] **Step 4: Edit the three existing blocks**

In `content-custom/scripts/interface_bank/interfaces/bank_main.if`:

`[com_90]`, change one line (ruling R10):
```
text=The Bank of Gielinor
```

`[com_92]`, change two lines (ruling R8):
```
[com_92]
type=layer
x=37
y=91
width=427
height=193
scroll=1145
```

`[inv]` is left exactly as it is. All five `option1..option5` stay Withdraw; see ruling R3.

- [ ] **Step 5: Append the twenty-one new components**

At the end of the file, after `[com_102]`:

```
// SP8c bank tabs. Ten selectable tabs at y=55, above the item pane that moved to y=91.
//
// buttontype=select plus script1op1=pushvar,banktab makes the client write %banktab locally
// and immediately (Client.ts:11577-11589), so the tab-range redraw has no server round trip;
// the IF_BUTTON still reaches [if_button,bank_main:tab_N] in bank.rs2, which is what refreshes
// the icons. option= is mandatory: buildMinimenu (Client.ts:12234) emits no menu entry for a
// select button with an empty buttonText, so a tab without it draws and does nothing. The
// precedent for a select button with an option is [khaki] in
// scripts/areas/area_varrock/interfaces/player_kit_tailor_legs_man.if.
//
// A TAB IS TWO COMPONENTS (SP8c plan ruling R17). The button below is a rect (a text label for
// tab_0), and the item icon is a separate tabicon_N further down. It cannot be one component:
// a select button is ACTIVE while it is the selected tab, and the active branch of a model
// draw reads model2Type/model2Id (IfType.ts:366-370), which IF_SETOBJECT never writes, so the
// selected tab would show nothing. Every button therefore also declares activecolour and
// activeovercolour, because the active branch reads colour2 and a missing key packs as NaN,
// which is black (PackShared.ts:527-532).
//
// clientcode 210 + N is how client patch 31 recognises a tab under the cursor at drag
// release. It is a value, not an id, so a pack renumber cannot break it, and 210 to 219 is
// outside every band clientComponent (Client.ts:13093) and clientButton (:13366) branch on.
// The ICONS carry no clientcode, so a drop always resolves to the button, never to the icon
// drawn on top of it.
[tab_0]
type=text
x=37
y=55
buttontype=select
option=View all items
script1op1=pushvar,banktab
script1=eq,0
clientcode=210
width=40
height=32
font=p12_full
center=yes
shadowed=yes
text=All
activetext=All
colour=0xFF981F
activecolour=0xFFFFFF
overcolour=0xFFFFFF
activeovercolour=0xFFFFFF

[tab_1]
type=rect
x=79
y=55
buttontype=select
option=View tab 1
script1op1=pushvar,banktab
script1=eq,1
clientcode=211
width=40
height=32
fill=yes
colour=0x2E2925
activecolour=0x6A5A44
overcolour=0x4A4038
activeovercolour=0x6A5A44
```

`tab_2` through `tab_9` repeat `[tab_1]` verbatim with `x` at `121, 163, 205, 247, 289, 331, 373, 415`, `option=View tab N`, `script1=eq,N` and `clientcode=210+N`. Then the nine icons, which must come AFTER their buttons in the file so they draw on top (a layer's children draw in declaration order, `Client.ts:12316-12345`):

```
// The tab icons. Not buttons: a non-button component never takes the ACTIVE model branch for
// being selected, so if_setobject's model1 is what draws. Its OWN comparator is on its own
// size varp, `eq,0`, so the component is active exactly when the tab is EMPTY; the active
// branch then reads model2Type, which is 0 because no activemodel= is declared, getModel
// answers null (IfType.ts:397-420) and nothing is painted. That is how an empty tab clears its
// icon, and it is not if_sethide, which is a no-op on anything but a layer (IfType.ts:163-165,
// Client.ts:12035 and :12307 are the only readers of `hide`).
[tabicon_1]
type=model
x=83
y=57
width=32
height=28
script1op1=pushvar,banktab_size_1
script1=eq,0
zoom=200
xan=0
yan=0
```

`tabicon_2` through `tabicon_9` repeat it with `x` at `125, 167, 209, 251, 293, 335, 377, 419` (four pixels inside each button) and `script1op1=pushvar,banktab_size_N`. Then:

```
// The two deposit-all buttons the 274 bank does not have (plan ruling R5; the SP8b spec's
// row 7 calls them "already present", and its own line 39 says the opposite and is right).
// Text buttons rather than sprites, so no art is vendored.
[deposit_inv]
type=text
x=225
y=291
buttontype=normal
option=Deposit inventory
width=62
height=14
font=p12_full
shadowed=yes
text=Deposit inv
colour=0xFF981F
overcolour=0xFFFFFF

[deposit_worn]
type=text
x=225
y=307
buttontype=normal
option=Deposit worn items
width=62
height=14
font=p12_full
shadowed=yes
text=Deposit worn
colour=0xFF981F
overcolour=0xFFFFFF
```

- [ ] **Step 6: Add the constants and the manifest entries**

Create `content-custom/scripts/interface_bank/configs/banktab.constant`:

```
// SP8c bank tabs. RuneScript has no arrays, so every one of these is reached through a
// switch_int in bank.rs2 and the count has to be a constant both halves agree on. It is the
// same nine as MAX_TABS in engine-custom/src/idlescape/types.ts and web/src/bank/types.ts.
^banktab_max = 9
// if_setobject's third argument, and it works the OPPOSITE way round to what the name suggests.
// IF_SETOBJECT computes modelZoom = (type.zoom2d * 100) / zoom (Client.ts:8490) and the model
// draw uses modelZoom as a camera DISTANCE (Client.ts:12606-12607), so a LARGER third argument
// makes a SMALLER modelZoom and therefore a LARGER drawn model. Every upstream call site sits at
// 250 to 300 against components of 64x96 and larger (tanner.if:751-758 with
// if_setobject(tanner:com_92, leather, 250)), so 200 is the starting point for a 32x28 icon:
// slightly smaller than upstream's smallest. Tuned on the live stack at Task 4 step 9.
^banktab_icon_zoom = 200
```

Add two entries to `content-custom/manifest.json`, bringing it to seven:
```json
    { "path": "scripts/interface_bank/interfaces/bank_main.if", "baseSha256": "<sha from step 3>" },
    { "path": "scripts/interface_bank/configs/banktab.constant", "baseSha256": null },
```
(the eighth, `scripts/interface_bank/scripts/bank.rs2`, lands in Task 4.)

Add one entry to `engine-custom/manifest.json`'s `files`:
```json
    { "path": "src/idlescape/bankTabInterface.test.ts", "kind": "new", "baseSha256": null },
```

- [ ] **Step 7: Run the test and watch it pass**

```
powershell -File scripts/engine-overlay.ps1
cd engine/server
npx tsx --test --test-force-exit src/idlescape/bankTabInterface.test.ts
```
Expected: eight tests pass.

- [ ] **Step 8: Prove it packs**

```
powershell -File scripts/content-overlay.ps1
cd engine/server
npx tsx tools/pack/BuildOverlay.ts
```
Expected: `pack ids unchanged (N pack file(s) verified byte-for-byte)`. If it throws `pack/interface.pack is missing ID for component bank_main:tab_0`, a name in Task 2's pack file and a block name here disagree; fix the name, never the pack.

- [ ] **Step 9: See it on the live stack**

The tabs do nothing yet (Task 4 binds them) but they must draw and they must not overlap. From PowerShell:
```powershell
powershell -File scripts/start-stack.ps1 -Prod
```
Wait for `World ready` in `logs/engine.log` (grep for it yourself; `start-stack.ps1:74-76` prints a warning and continues when it never appears, so a "started" stack can have no engine behind it). Then open `http://localhost:8787`, log in, and type `::~bank` in the chat. Confirm by eye: ten tab buttons in a row above the pane, five rows of slots visible, the bottom controls unmoved, the title reading "The Bank of Gielinor", and right-clicking a tab offering "View tab N". Click each tab in turn and confirm the clicked one changes colour: that is the `activecolour` half of ruling R17, and it is the only visual proof the active branch was declared. No icons yet; they need Task 4's `if_setobject`. Adjust `^banktab_icon_zoom` in Task 4 if they then render too large or too small.

- [ ] **Step 10: Mutation-to-test table**

| Change I made to break it | The test that must fail | Did it? |
|---|---|---|
| Delete `option=View tab 3` from `[tab_3]` | `ten tab buttons, each selectable, labelled, ...` | |
| Change `[tab_5]`'s `script1=eq,5` to `eq,4` | same test, on the script1 assertion | |
| Set `[com_92]` back to `y=55` | `the tab strip does not overlap the item pane, ...` | |
| Delete `activecolour` from `[tab_2]` | `every tab button declares its ACTIVE appearance, ...` | |
| Give `[tabicon_4]` `buttontype=select` | `a tab is a button plus a separate icon, ...` | |
| Give `[tabicon_4]` `clientcode=214` | `the tab clientcodes are the only ones in their band, ...` (two names in the band) and the icon test | |
| Change `[tabicon_6]`'s `script1op1` to `pushvar,banktab_size_5` | `a tab is a button plus a separate icon, ...` | |
| Change `[inv]`'s `option3` to `Move to tab` | `the inv is unchanged: eight columns, ...` | |

- [ ] **Step 11: Verify and commit**

```
powershell -File scripts/content-overlay.ps1
powershell -File scripts/content-overlay.ps1 -Check
powershell -File scripts/engine-overlay.ps1 -Check
cd engine/server
npx tsc --noEmit
npx tsx --test --test-force-exit src/idlescape/bankTabPack.test.ts src/idlescape/bankTabInterface.test.ts src/idlescape/install.test.ts src/idlescape/installSweep.test.ts src/idlescape/ops.test.ts src/idlescape/ownerBank.test.ts
```
then, from the root, `powershell -File scripts/line-ceiling.ps1` and `powershell -File scripts/verify.ps1`.

```bash
git add content-custom/scripts/interface_bank/interfaces/bank_main.if content-custom/scripts/interface_bank/configs/banktab.constant content-custom/manifest.json engine-custom/src/idlescape/bankTabInterface.test.ts engine-custom/manifest.json
git -c core.safecrlf=false commit -m "feat(content): give bank_main a tab strip and two deposit-all buttons

Ten buttontype=select tabs at y=55 writing %banktab, each with a separate type=model icon
beside it: a select button is active while it is selected, and the active model branch reads
model2Type, which if_setobject never writes, so a one-component tab would show nothing
exactly when it was chosen. The icon's own comparator on its size varp draws nothing for an
empty tab, because if_sethide is a no-op on anything but a layer. Every button carries
option=, without which buildMinimenu emits no entry at all and the strip is dead, and both
halves of its colour, because the active branch reads colour2. The item pane moves to y=91
height=193 and loses one visible row, six to five; capacity and scroll height are unchanged.
Adds the Deposit inventory and Deposit worn buttons 274 has never had, and settles the title
on The Bank of Gielinor.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 4: `bank.rs2` - tab arithmetic, selection and icon refresh

The first half of the script work. RuneScript has no arrays, so every access to the nine size varps goes through a `switch_int`; those switches are written once, in procs, and everything else is arithmetic over them.

**Files:**
- Create: `content-custom/scripts/interface_bank/scripts/bank.rs2`
- Modify: `content-custom/pack/script.pack`
- Modify: `content-custom/manifest.json`
- Modify: `engine-custom/src/idlescape/bankTabPack.test.ts`

**Interfaces:**
- Consumes: `bank_main:tab_0..tab_9` and `^banktab_max`, `^banktab_icon_zoom` from Task 3; the `banktab` varp from Task 1.
- Produces, for Task 5:
  ```
  [proc,banktab_size](int $tab)(int)
  [proc,banktab_setsize](int $tab, int $size)
  [proc,banktab_start](int $tab)(int)
  [proc,banktab_of_slot](int $slot)(int)
  [proc,banktab_first_obj](int $tab)(obj)
  [proc,banktab_seticon](int $tab, obj $item)
  [proc,banktab_refresh]
  ```

  **Everything this entry adds is a `proc`, never a `label`, and that is not a style choice.** In
  RuneScript `@name` is a tail JUMP that never returns and `~name` is a call that does. Upstream's
  own `[label,insert_bank]` is only ever reached as the last statement of a block
  (`bank.rs2:6-11`), which is why it can be a label. Task 5 needs to run code after the insert, so
  it declares its own `[proc,banktab_insert]` beside upstream's label rather than trying to resume
  from one. A `@` in the middle of a block silently drops every statement under it.

- [ ] **Step 1: Copy the upstream script file**

```bash
mkdir -p content-custom/scripts/interface_bank/scripts
cp engine/content/scripts/interface_bank/scripts/bank.rs2 content-custom/scripts/interface_bank/scripts/bank.rs2
sha256sum engine/content/scripts/interface_bank/scripts/bank.rs2
```
Keep the sha, taken **off disk** for the reason in Task 2 Step 1 (`bank.rs2` checks out CRLF, and `-Check` hashes the working-tree file). Add the manifest entry now, the eighth, so the file cannot be forgotten:
```json
    { "path": "scripts/interface_bank/scripts/bank.rs2", "baseSha256": "<sha>" },
```

- [ ] **Step 2: ADD the by-name `script.pack` test and watch it fail**

Task 2 left `script.pack keeps the clone maximum and holds no duplicate id or name` in `bankTabPack.test.ts` and it stays exactly as it is. This step **adds a second, separate test** beside it, now that there are trigger names to pin. Nothing moves and no assertion is deleted:

```ts
const NEW_SCRIPTS: string[] = [
    '[if_button,bank_main:tab_0]', '[if_button,bank_main:tab_1]', '[if_button,bank_main:tab_2]',
    '[if_button,bank_main:tab_3]', '[if_button,bank_main:tab_4]', '[if_button,bank_main:tab_5]',
    '[if_button,bank_main:tab_6]', '[if_button,bank_main:tab_7]', '[if_button,bank_main:tab_8]',
    '[if_button,bank_main:tab_9]',
    '[proc,banktab_size]', '[proc,banktab_setsize]', '[proc,banktab_start]',
    '[proc,banktab_of_slot]', '[proc,banktab_first_obj]', '[proc,banktab_seticon]',
    '[proc,banktab_refresh]'
];

test('script.pack pins every new trigger by name, contiguously from 10940', () => {
    // The id/name distinctness and the 10939 anchor live in the Task 2 test beside this one.
    // What is asserted here is what only this task knows: that every trigger it declares has a
    // pinned id, and that the ids run without a gap, because regenScriptPack auto-assigns at
    // pack.max++ and a gap means one was hand-edited into a number the packer will not choose.
    const ours = readPack(overlayText('pack/script.pack'));
    const added = ours.filter(row => row.id > 10939).sort((a, b) => a.id - b.id);
    assert.ok(added.length > 0, 'SP8c adds RuneScript triggers');
    added.forEach((row, i) => {
        assert.equal(row.id, 10940 + i, 'ids are contiguous from 10940');
        assert.ok(row.name.startsWith('[') && row.name.endsWith(']'), `script name shape: ${row.name}`);
    });
    for (const name of NEW_SCRIPTS) {
        assert.ok(added.some(row => row.name === name), `script.pack is missing ${name}`);
    }
});
```
Run it: expected to fail on `SP8c adds RuneScript triggers`, because Task 2 left the copy unmodified.

- [ ] **Step 3: Write the tab arithmetic procs**

Append to `content-custom/scripts/interface_bank/scripts/bank.rs2`. The upstream 145 lines are left exactly as they are for now; Task 5 edits three of them.

```
// ---------------------------------------------------------------------------------------
// SP8c bank tabs.
//
// The layout is nine SIZES, not boundaries: %banktab_size_N is how many slots tab N holds,
// and everything after the sum of them is tab 0. That is the same shape the web bank and the
// owner store use (engine-custom/src/idlescape/bankLayout.ts, web/src/bank/layout.ts), and
// engine-custom/src/idlescape/tabVarps.ts mirrors these nine varps to and from the shared
// owner bank once a tick. RuneScript has no arrays, so the nine are reached through the two
// switches below and nowhere else.
// ---------------------------------------------------------------------------------------

[proc,banktab_size](int $tab)(int)
switch_int ($tab) {
    case 1 : return(%banktab_size_1);
    case 2 : return(%banktab_size_2);
    case 3 : return(%banktab_size_3);
    case 4 : return(%banktab_size_4);
    case 5 : return(%banktab_size_5);
    case 6 : return(%banktab_size_6);
    case 7 : return(%banktab_size_7);
    case 8 : return(%banktab_size_8);
    case 9 : return(%banktab_size_9);
    case default : return(0);
}

[proc,banktab_setsize](int $tab, int $size)
if ($size < 0) {
    $size = 0;
}
switch_int ($tab) {
    case 1 : %banktab_size_1 = $size;
    case 2 : %banktab_size_2 = $size;
    case 3 : %banktab_size_3 = $size;
    case 4 : %banktab_size_4 = $size;
    case 5 : %banktab_size_5 = $size;
    case 6 : %banktab_size_6 = $size;
    case 7 : %banktab_size_7 = $size;
    case 8 : %banktab_size_8 = $size;
    case 9 : %banktab_size_9 = $size;
}

// The first slot of tab $tab, which is the sum of every earlier tab's size. Tab 0's start is
// the sum of all nine: it is the tail, not a view. See SP8b spec ruling 12.3.
[proc,banktab_start](int $tab)(int)
def_int $start = 0;
def_int $i = 1;
if ($tab = 0) {
    $tab = add(^banktab_max, 1);
}
while ($i < $tab) {
    $start = add($start, ~banktab_size($i));
    $i = add($i, 1);
}
return($start);

// Which tab a slot belongs to: 1 to 9 for a real tab, 0 for everything past them.
[proc,banktab_of_slot](int $slot)(int)
def_int $start = 0;
def_int $i = 1;
while ($i <= ^banktab_max) {
    def_int $size = ~banktab_size($i);
    if ($size > 0 & $slot >= $start & $slot < add($start, $size)) {
        return($i);
    }
    $start = add($start, $size);
    $i = add($i, 1);
}
return(0);

// The obj a tab's icon shows: the first occupied slot in the tab, or null for an empty tab.
// Owner decision 4 (SP8b spec section 11 item 4) makes it the FIRST item, never a chosen one,
// which is what web/src/bank/layout.ts:35-39 does too.
[proc,banktab_first_obj](int $tab)(obj)
def_int $slot = ~banktab_start($tab);
def_int $end = add($slot, ~banktab_size($tab));
while ($slot < $end) {
    def_obj $item = inv_getobj(bank, $slot);
    if ($item ! null) {
        return($item);
    }
    $slot = add($slot, 1);
}
return(null);
```

- [ ] **Step 4: Write the icon refresh**

```
// One switch, because a component cannot be indexed.
//
// THERE IS NO HIDE HERE, AND THAT IS DELIBERATE (plan ruling R17). if_sethide is a no-op on
// anything but a layer in this client: `hide` is decoded only inside the TYPE_LAYER branch
// (client/src/config/IfType.ts:163-165) and read only by the two layer-entry guards
// (Client.ts:12035 and :12307), so hiding a type=model component sets a field nothing looks
// at and the stale icon keeps drawing. The empty case is handled in bank_main.if instead:
// tabicon_N carries script1op1=pushvar,banktab_size_N and script1=eq,0, so an empty tab makes
// the component ACTIVE, the draw takes the model2 branch, model2Type is 0 because no
// activemodel= is declared, getModel returns null and nothing is painted. So this proc only
// ever SETS an icon, and an empty tab needs no call at all. if_setobject has no clear form in
// any case: ObjTypeValid rejects null.
[proc,banktab_seticon](int $tab, obj $item)
if ($item = null) {
    return;
}
switch_int ($tab) {
    case 1 : if_setobject(bank_main:tabicon_1, $item, ^banktab_icon_zoom);
    case 2 : if_setobject(bank_main:tabicon_2, $item, ^banktab_icon_zoom);
    case 3 : if_setobject(bank_main:tabicon_3, $item, ^banktab_icon_zoom);
    case 4 : if_setobject(bank_main:tabicon_4, $item, ^banktab_icon_zoom);
    case 5 : if_setobject(bank_main:tabicon_5, $item, ^banktab_icon_zoom);
    case 6 : if_setobject(bank_main:tabicon_6, $item, ^banktab_icon_zoom);
    case 7 : if_setobject(bank_main:tabicon_7, $item, ^banktab_icon_zoom);
    case 8 : if_setobject(bank_main:tabicon_8, $item, ^banktab_icon_zoom);
    case 9 : if_setobject(bank_main:tabicon_9, $item, ^banktab_icon_zoom);
}

// Every tab icon, from the current contents. Called on open and after every move, because a
// tab's icon is its first item and any move can change which item that is. A proc and not a
// label: `@name` is a tail JUMP that never returns, and every caller below has statements
// after it.
[proc,banktab_refresh]
def_int $tab = 1;
while ($tab <= ^banktab_max) {
    ~banktab_seticon($tab, ~banktab_first_obj($tab));
    $tab = add($tab, 1);
}
```

**One contingency to check at Step 7.** `~banktab_first_obj` answers `null` for an empty tab, and
`~banktab_seticon` compares its argument to `null`. Comparing an `obj` to `null` is upstream's own
idiom (`engine/content/scripts/general_use/scripts/web.rs2:4`, `if ($item = null)`), but
**returning** `null` from an `obj`-typed proc may not be. If the packer rejects `return(null)`,
change the signature to `[proc,banktab_first_obj](int $tab)(obj, boolean)` returning
`(coins, false)` for the empty case, and give `~banktab_seticon` a third `boolean $found`
parameter. **Do not silence it by returning a real obj id for "empty"**: that puts a wrong icon on
every empty tab and looks like a working feature.

- [ ] **Step 5: Bind the ten tab buttons**

```
// The client has already written %banktab locally by the time this arrives
// (Client.ts:11577-11589 handles SELECT_BUTTON), so this trigger is not what selects the tab.
// It exists to keep the server's copy in step, which is what makes the icon refresh below
// correct after a move, and to give the tab a server-side hook a later entry can use.
[if_button,bank_main:tab_0] %banktab = 0; ~banktab_refresh;
[if_button,bank_main:tab_1] %banktab = 1; ~banktab_refresh;
[if_button,bank_main:tab_2] %banktab = 2; ~banktab_refresh;
[if_button,bank_main:tab_3] %banktab = 3; ~banktab_refresh;
[if_button,bank_main:tab_4] %banktab = 4; ~banktab_refresh;
[if_button,bank_main:tab_5] %banktab = 5; ~banktab_refresh;
[if_button,bank_main:tab_6] %banktab = 6; ~banktab_refresh;
[if_button,bank_main:tab_7] %banktab = 7; ~banktab_refresh;
[if_button,bank_main:tab_8] %banktab = 8; ~banktab_refresh;
[if_button,bank_main:tab_9] %banktab = 9; ~banktab_refresh;
```

Then extend `[label,openbank]` so the icons are set the moment the window opens, and reset the selection to "All items" every time (ruling R6: the selection is a view, not state):

```
[label,openbank]
%bankcert = 0;
%banktab = 0;
~reorganize_inv(bank);
inv_transmit(inv, bank_side:inv);
inv_transmit(bank, bank_main:inv);
if_openmain_side(bank_main, bank_side);
~banktab_refresh;
```
(`~banktab_refresh` goes **after** `if_openmain_side`, because `if_setobject` writes to a component of an interface that has to be open first.)

- [ ] **Step 6: Pin the seventeen new script ids**

Append to `content-custom/pack/script.pack`, in exactly this order, so Task 2's contiguity assertion holds:

```
10940=[proc,banktab_size]
10941=[proc,banktab_setsize]
10942=[proc,banktab_start]
10943=[proc,banktab_of_slot]
10944=[proc,banktab_first_obj]
10945=[proc,banktab_seticon]
10946=[proc,banktab_refresh]
10947=[if_button,bank_main:tab_0]
10948=[if_button,bank_main:tab_1]
10949=[if_button,bank_main:tab_2]
10950=[if_button,bank_main:tab_3]
10951=[if_button,bank_main:tab_4]
10952=[if_button,bank_main:tab_5]
10953=[if_button,bank_main:tab_6]
10954=[if_button,bank_main:tab_7]
10955=[if_button,bank_main:tab_8]
10956=[if_button,bank_main:tab_9]
```
Task 5 continues from 10957.

- [ ] **Step 7: Pack, which is this task's compiler**

```
powershell -File scripts/content-overlay.ps1
cd engine/server
npx tsx tools/pack/BuildOverlay.ts
```
This is the real gate for RuneScript: the packer parses every script, resolves every command, every component reference and every constant, and fails on a typo, an unknown command, a wrong argument count or a missing pack id. Expected: `pack ids unchanged (N pack file(s) verified byte-for-byte)`. **If it names `script.pack`, an id in Step 6 does not match what `regenScriptPack` wanted**; read the diff (`git diff content-custom/pack/script.pack`), fix the pinned line to match, and re-run. Do not delete the pin.

- [ ] **Step 8: Run the pack test**

```
cd engine/server
npx tsx --test --test-force-exit src/idlescape/bankTabPack.test.ts src/idlescape/bankTabInterface.test.ts
```
Expected: green.

- [ ] **Step 9: See it work on the live stack**

Restart the stack (a content change needs the engine restarted after the pack), open the bank with `::~bank`, and confirm by eye:
- with an empty bank, all ten tab buttons draw and **none of the nine shows an icon**, because every `banktab_size_N` is 0 and each `tabicon_N` is therefore active and paints nothing. This is the empty case; it is not `if_sethide`, which does not work here (ruling R17).
- fill the bank with **`::~bank_f2p`**, not `::~bank_preset`. `[debugproc,bank_preset]` (`engine/content/scripts/_test/scripts/cheats/cheat_bank.rs2:9-16`) runs `~p_choice2_header("Yes.", 1, "No.", 2, "This clears your bank. Continue?")` before anything else and **adds nothing at all until it is answered**, so a step that fires it and looks at the bank is looking at an empty bank, and the `::~bank` after it aborts the suspended script. `[debugproc,bank_f2p]` (`:206-278`) has no dialogue: `if_close`, the uid check, `inv_clear` and about sixty-five `inv_add` calls. **This holds for every by-hand step in this plan and for Task 11's spec.** (`magicbank`, `fmbank`, `foodbank`, `fletchbank` and `wptest` carry the same modal; `clearbank` does not.)
- then seed `::setvar banktab_size_1 10`, close and reopen. Tabs with items show an item model at a readable size. **Tune `^banktab_icon_zoom` here** and re-pack if 200 is wrong, remembering that a LARGER number draws a LARGER model (`Client.ts:8490` divides by it, and `:12606-12607` uses the result as a camera distance). Record the final number in the task handoff.
- clicking a tab changes which button is highlighted but does not yet change the pane, because the draw patch is Task 8. Confirm also that right-clicking a tab offers "View tab N", which proves `option=` reached the client.

- [ ] **Step 10: Mutation-to-test table**

| Change I made to break it | The test that must fail | Did it? |
|---|---|---|
| Delete `10946=[proc,banktab_refresh]` from `script.pack` | `script.pack pins every new trigger by name, ...` | |
| Renumber `10947` to `10958` (a gap) | same test, on the contiguity assertion | |
| Rename `~banktab_size` to `~banktabSize` in one call site | `BuildOverlay.ts` fails to pack, naming the unknown proc | |
| Change `if_setobject(bank_main:tabicon_3, ...)` to `bank_main:tabicon_33` | `BuildOverlay.ts` fails, naming the unknown component | |

The last two rows are why Step 7 is a verification step and not a formality: for RuneScript, the packer is the type checker.

- [ ] **Step 11: Commit**

```bash
git add content-custom/scripts/interface_bank/scripts/bank.rs2 content-custom/pack/script.pack content-custom/manifest.json engine-custom/src/idlescape/bankTabPack.test.ts
git -c core.safecrlf=false commit -m "feat(content): bank tab arithmetic, selection and icon refresh

Seven procs over the nine size varps, all of them going through one switch each because
RuneScript has no arrays, and no labels: @name is a tail jump and every caller here has
statements after it. The ten if_button triggers keep the server's %banktab in step with the
copy the client already wrote itself, and openbank now resets the selection to All items and
sets every tab icon to that tab's first item, which is owner decision 4. An empty tab draws
no icon through its own comparator on its size varp rather than through if_sethide, which is
a no-op on anything but a layer in this client.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 5: `bank.rs2` - the recount that survives compaction, deposit-all, and cross-tab moves

This task carries ruling R7's fix (b), and it is the reason the entry works at all rather than a nicety.

**The bug it fixes.** `[label,openbank]` calls `~reorganize_inv(bank)` and `[label,closebank]` queues `reorganize_bank`, which calls it again. The proc (`engine/content/scripts/general/scripts/misc/inv_procs.rs2:255-275`) slides every item left into the first hole. Tabs are stored as **sizes**, so a withdrawal that empties a slot inside tab 1, followed by a reopen, pulls tab 2's first item into tab 1 with every stored number unchanged. Nothing in the SP8b spec mentions `reorganize_inv`, and the in-game tab model is unstable today, before this entry draws anything.

**The fix.** `~banktab_recount` recomputes each tab's size as the number of **occupied** slots currently inside that tab's range, in one left-to-right pass over the 240 slots. That is exactly what compaction does to the layout, expressed as arithmetic. It runs before every `~reorganize_inv` and after every withdraw, it is idempotent, and it becomes a no-op the day placeholders land (deferral D5, Task 10).

**Files:**
- Modify: `content-custom/scripts/interface_bank/scripts/bank.rs2`
- Modify: `content-custom/pack/script.pack`
- Modify: `engine-custom/src/idlescape/bankTabPack.test.ts` (the `NEW_SCRIPTS` list)

**Interfaces:**
- Consumes: every proc Task 4 produced.
- Produces, for Tasks 9 and 11:
  ```
  [proc,banktab_recount]
  [proc,banktab_insert](int $start_slot, int $target_slot)
  [proc,banktab_move](int $from, int $to)
  [proc,banktab_deposit_all](inv $source)
  [if_button,bank_main:deposit_inv]
  [if_button,bank_main:deposit_worn]
  ```
  Six, and Step 6 pins six ids (10957 to 10962). `[proc,banktab_deposit_all]` is one of them.
  and the behaviour Task 11's Playwright spec asserts: after a withdraw that empties a slot, that slot's tab is one smaller and no item has crossed a tab boundary.

- [ ] **Step 1: Extend the pack test's trigger list and watch it fail**

Add to `NEW_SCRIPTS` in `bankTabPack.test.ts`:
```ts
    '[proc,banktab_recount]', '[proc,banktab_insert]', '[proc,banktab_move]',
    '[proc,banktab_deposit_all]',
    '[if_button,bank_main:deposit_inv]', '[if_button,bank_main:deposit_worn]'
```
Run `npx tsx --test --test-force-exit src/idlescape/bankTabPack.test.ts` from `engine/server`. Expected: `script.pack is missing [proc,banktab_recount]`.

- [ ] **Step 2: Write the recount**

Append to `content-custom/scripts/interface_bank/scripts/bank.rs2`:

```
// The tab sizes, recomputed from what the bank actually holds.
//
// ~reorganize_inv slides every item left into the first hole, and it runs on every open and
// every close (see [label,openbank] and [queue,reorganize_bank] below). Tabs are stored as
// sizes, so a hole inside tab 1 lets compaction pull tab 2's first item into tab 1 without
// changing a single number. This pass counts the occupied slots inside each tab's current
// range and rewrites the sizes to match, which is the same layout compaction is about to
// produce. It is idempotent, it costs one pass over 240 slots, and it becomes a no-op once
// placeholders exist (SP8b deferral D5, re-deferred by SP8c plan ruling R7).
//
// A tab that ends up empty is set to 0 and the tabs after it keep their own counts, which is
// the same "an interior zero collapses and later tabs renumber" rule the owner store applies
// when it reads these varps back (engine-custom/PATCHES.md:421-429).
[proc,banktab_recount]
def_int $tab = 1;
def_int $slot = 0;
while ($tab <= ^banktab_max) {
    def_int $size = ~banktab_size($tab);
    def_int $end = add($slot, $size);
    def_int $kept = 0;
    while ($slot < $end) {
        if (inv_getobj(bank, $slot) ! null) {
            $kept = add($kept, 1);
        }
        $slot = add($slot, 1);
    }
    ~banktab_setsize($tab, $kept);
    $tab = add($tab, 1);
}
```

- [ ] **Step 3: Call it from the three places compaction happens**

Edit the three upstream blocks in the overlay's copy:

```
[label,openbank]
%bankcert = 0;
%banktab = 0;
~banktab_recount;
~reorganize_inv(bank);
inv_transmit(inv, bank_side:inv);
inv_transmit(bank, bank_main:inv);
if_openmain_side(bank_main, bank_side);
~banktab_refresh;
```

```
[queue,reorganize_bank]
~banktab_recount;
~reorganize_inv(bank);
```

and, at the end of `[label,bank_withdraw]`, after the existing `~bank_withdraw_request(...)` call:

```
// A withdraw can empty a slot in the middle of a tab. Recount AND COMPACT, in that order, the
// same pair the two call sites above use, then refresh the icons because a tab's icon is its
// first item.
~banktab_recount;
~reorganize_inv(bank);
~banktab_refresh;
```

**The `~reorganize_inv(bank)` on this third call site is load-bearing and is the one difference from upstream's withdraw path.** `~banktab_recount` alone rewrites the SIZES from what the tab currently holds while leaving the hole where it is. Withdraw the whole of slot 4 out of a ten-slot tab 1 and the varps then say tab 1 is `[0, 9)` while tab 1's tenth item still sits at slot 9, which the varps now call tab 2's first slot. Patch 30 draws from those varps, so the pane is wrong until the bank is closed and reopened, and `install.ts:196-238`'s once-per-tick mirror-in pushes the wrong sizes into the shared owner store inside that window, where the web bank reads them and can persist them. Compacting immediately closes the window: the sizes and the slots agree in the same tick.

It does change what a player sees relative to upstream, and the change is small and already familiar: items to the right of a fully withdrawn stack slide left immediately instead of waiting for the next open. Today they slide anyway, one open later. Step 9 checks this **without** a close and reopen, because a check that closes first cannot see the divergence at all.

- [ ] **Step 4: Write the cross-tab move and wire it into `inv_buttond`**

```
// Upstream's [label,insert_bank] does exactly this shift, and this is a copy of its body
// rather than a call, because `@name` is a tail JUMP: ~banktab_move has to run code after the
// shift, and `@insert_bank(...)` in the middle of a block silently drops every statement under
// it. Upstream's label is left where it is, unused by us, so the overlay's diff against the
// pinned file stays legible.
[proc,banktab_insert](int $start_slot, int $target_slot)
def_int $src = $start_slot;
def_int $dst = $target_slot;
while ($src ! $dst) {
    if ($src > $dst) {
        inv_movetoslot(bank, bank, sub($src, 1), $src);
        $src = sub($src, 1);
    } else if ($src < $dst) {
        inv_movetoslot(bank, bank, add($src, 1), $src);
        $src = add($src, 1);
    }
}

// Moving one slot to another with the two tab sizes adjusted, which is what a drag onto a tab
// header and the client's "Move to tab N" menu entry both come down to. The client sends an
// ordinary INV_BUTTOND with mode=1 to a real slot inside the destination tab (client patch 31;
// InvButtonDHandler refuses any targetSlot outside inv.validSlot, so there is no sentinel to
// send), so the item shift is the same one an ordinary insert does. All this adds is the
// boundary move: the source tab loses one slot and the destination gains one, which shifts
// every boundary between them by exactly the one place the items shifted.
[proc,banktab_move](int $from, int $to)
// The two tab reads have to happen BEFORE the shift, or they read the post-move boundaries
// and name the wrong tabs.
def_int $src_tab = ~banktab_of_slot($from);
def_int $dst_tab = ~banktab_of_slot($to);
~banktab_insert($from, $to);
if ($src_tab = $dst_tab) {
    return;
}
if ($src_tab ! 0) {
    ~banktab_setsize($src_tab, sub(~banktab_size($src_tab), 1));
}
if ($dst_tab ! 0) {
    ~banktab_setsize($dst_tab, add(~banktab_size($dst_tab), 1));
}
```

and replace the upstream `[inv_buttond,bank_main:inv]` body with (ruling R15, stated in full below):

```
[inv_buttond,bank_main:inv]
if (~banktab_of_slot(last_slot) ! ~banktab_of_slot(last_targetslot)) {
    // A drag that crosses a tab boundary always MOVES, whatever Swap/Insert says. There is no
    // room in INV_BUTTOND for the client to say which it meant (the packet is com, slot,
    // targetslot, mode, and the mode byte does not reach RuneScript), and a cross-tab swap
    // would put a random item from the destination tab into the source tab, which is nobody's
    // idea of "drop it on tab 3". This is also what OSRS does.
    ~banktab_move(last_slot, last_targetslot);
} else if (%bankinsert = 1) {
    ~banktab_insert(last_slot, last_targetslot);
} else {
    inv_movetoslot(bank, bank, last_slot, last_targetslot);
}
~banktab_refresh;
```

**Ruling R15, recorded here because this is where it lives.** A cross-tab drag always inserts; within one tab the player's Swap/Insert setting is honoured exactly as it is today. The alternative was to offer move-to-tab only while `bankArrangeMode === 1` client-side, which would make the feature silently absent for every player in swap mode.

**The client half of R15 is Task 9 step 3b, and it is not optional.** The mode byte does not reach RuneScript, so this branch is the only thing that decides, but the CLIENT still performs an optimistic local move before the packet leaves (`Client.ts:4609-4641`), and left alone it would swap for a Swap-mode player and for any drop onto an empty target slot while the server shifts. Two layouts for a tick. Step 3b forces the local branch to `mode = 1` for a resolved tab drop.

**Cost if wrong:** a player who wanted to swap two items in different tabs gets a move instead and has to drag the second one back; and, if step 3b is dropped, a visible flicker into a wrong layout that corrects itself on the next inv update, which reads like a client bug rather than a ruling. Reversal is deleting the first branch here and the `bankTabDrop` flag there. This ruling goes to `docs/superpowers/decisions.md` in Task 12.

- [ ] **Step 5: Write the two deposit-all loops**

```
// Deposit inventory and Deposit worn items. 274 has neither button (SP8b spec :39 is right and
// its row 7 is wrong; plan ruling R5). ~bank_deposit_request already exists above and carries
// the full-stack, no-space, unbankable and members checks, so this is a loop and nothing else.
// It walks the source inventory from the back, because a successful deposit compacts it.
[proc,banktab_deposit_all](inv $source)
def_int $slot = sub(inv_size($source), 1);
while ($slot >= 0) {
    def_obj $item = inv_getobj($source, $slot);
    if ($item ! null) {
        if (~bank_check_allowed($item, ^false) = true) {
            ~bank_deposit_request($source, $item, inv_total($source, $item), $slot, ^false);
        }
    }
    $slot = sub($slot, 1);
}
~banktab_recount;
~banktab_refresh;

[if_button,bank_main:deposit_inv] ~banktab_deposit_all(inv);
[if_button,bank_main:deposit_worn] ~banktab_deposit_all(worn);
```
`$mes = ^false` on both calls: a deposit-all over a full bank would otherwise print the same "You don't have enough space in your bank account" line once per stack. `~bank_check_allowed` with `^false` is what keeps an unbankable item silent rather than spamming the same message.

- [ ] **Step 6: Pin the new script ids**

Append to `content-custom/pack/script.pack`, continuing from 10956:

```
10957=[proc,banktab_recount]
10958=[proc,banktab_insert]
10959=[proc,banktab_move]
10960=[proc,banktab_deposit_all]
10961=[if_button,bank_main:deposit_inv]
10962=[if_button,bank_main:deposit_worn]
```
All six names above went into `NEW_SCRIPTS` at Step 1; nothing more to add here.

- [ ] **Step 7: Pack, and read the failure carefully if there is one**

```
powershell -File scripts/content-overlay.ps1
cd engine/server
npx tsx tools/pack/BuildOverlay.ts
```
Expected: `pack ids unchanged`. Two failures are likely and both are informative: `inv_size(worn)` or `inv_getobj(worn, ...)` rejected means `worn` is not addressable as an inv in this position (check how `~unequip_effect` is reached from `~bank_deposit_request`, which already special-cases `if ($inv = worn)`); and a `script.pack` rewrite means an id in Step 6 disagrees with the order the packer assigned, which `git diff content-custom/pack/script.pack` names exactly.

- [ ] **Step 8: Run the tests**

```
cd engine/server
npx tsx --test --test-force-exit src/idlescape/bankTabPack.test.ts src/idlescape/bankTabInterface.test.ts src/idlescape/install.test.ts src/idlescape/installSweep.test.ts
```
Expected: green. `install.test.ts` and `installSweep.test.ts` are in the list because they drive `readTabVarps`, `writeTabVarps` and the two-characters-one-owner case, and a tab size this task writes has to survive the mirror-in.

- [ ] **Step 9: Prove the recount on the live stack, by hand, in game**

This is the task's real correctness argument until Task 11 automates it. Restart the stack, then:

1. `::~bank_f2p` to fill the bank, **never `::~bank_preset`**, which suspends on a Yes/No chat modal and adds nothing until it is answered (Task 4 step 9 has the detail). Then `::~bank` to open it.
2. `::setvar banktab_size_1 10` and `::setvar banktab_size_2 10`, then close and reopen the bank.
3. Note the tenth and eleventh items (the last of tab 1 and the first of tab 2).
4. Withdraw the fifth item **fully** (right-click, Withdraw All).
5. **Without closing anything**, read the sizes through the management port: `GET http://127.0.0.1:8897/owner/<key>/bank` returns `tabs`. **Expected immediately: `[9, 10]`, and the pane already shows tab 1's ten items compacted into nine slots with tab 2's first item unmoved.** This is the step that proves the `~reorganize_inv(bank)` on the withdraw path is there: with the recount alone, the sizes read `[9, 10]` while the items have not moved, so tab 1's old tenth item is sitting in what the varps now call tab 2's first slot, and the store has already been told so.
6. Now close and reopen the bank.
7. **Expected:** unchanged from step 5. Tab 1 holds nine slots, its last item is the one that was ninth, and the item that was eleventh is still the first of tab 2. Confirm with `::getvar banktab_size_1` reading 9.
8. **The failure this proves is absent:** without the recount at all, `banktab_size_1` stays 10, compaction pulls the old eleventh item into tab 1, and tab 2 has lost its first item to tab 1.

Record the observed varp values from step 5 and step 7 separately in the handoff; they must be the same. If `::getvar` does not exist in this fork, the management port reading is the only one needed.

- [ ] **Step 10: Prove the round trip to the web bank still works**

With the stack up and a character logged in, open the web bank panel and confirm the tab count matches what step 9 left behind, within about a tick and a half. Then move a tab in the web bank and confirm the game client's next `::~bank` shows it. This exercises `install.ts:196-238`'s mirror-in and push-out and the 1.2 s apply coalesce, and it is the first time in this entry that both ends are live at once. If the in-game change does not reach the web, check `logs/server.log` for the `/internal/bank-changed` hook; the hook is fire and forget with a 2 s timeout and no retry, and the web polls every 10 s behind it, so wait the full ten seconds before calling it a failure.

- [ ] **Step 11: Mutation-to-test table**

RuneScript has no unit suite; these mutations are proven against the packer and against the live stack, and the table says which.

| Change I made to break it | What must fail | Did it? |
|---|---|---|
| Remove `'[proc,banktab_recount]'` from `script.pack` | `script.pack pins every new trigger by name, ...` | |
| Change `~banktab_setsize($tab, $kept)` to `($tab, $size)` | Step 9 in game: `banktab_size_1` stays 10 and an item crosses the boundary | |
| Drop `~banktab_recount;` from `[queue,reorganize_bank]` | Step 9 in game, on the close-and-reopen | |
| Drop `~reorganize_inv(bank);` from `[label,bank_withdraw]`, keeping the recount | **Step 9 item 5 only**, before any close: the sizes read `[9, 10]` while the items have not moved. Step 9 item 7 still passes, which is exactly why item 5 exists | |
| Swap `$src_tab` and `$dst_tab` in `[proc,banktab_move]` | Task 11's `dragging into tab 2 moves one slot` spec, and Step 9's manual drag | |
| Call `~banktab_insert` before reading the two tabs instead of after | Step 9: `~banktab_of_slot` reads the post-move boundaries and names the wrong tabs | |

- [ ] **Step 12: Commit**

```bash
git add content-custom/scripts/interface_bank/scripts/bank.rs2 content-custom/pack/script.pack engine-custom/src/idlescape/bankTabPack.test.ts
git -c core.safecrlf=false commit -m "fix(content): keep the bank tab sizes aligned with reorganize_inv

reorganize_inv compacts the bank on every open and every close, and tabs are stored as
sizes, so a hole inside tab 1 let compaction pull tab 2's first item into tab 1 with every
stored number unchanged. banktab_recount recomputes each size from the occupied slots in
its own range before every compaction and after every withdraw, which is the same layout
compaction produces. Adds the cross-tab move the client patches dispatch through
INV_BUTTOND, and the two deposit-all loops behind the new buttons.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---
## Task 6: `client/src/hooks/bankTabs.ts` - the pure half of every client patch

**Why a hook module and not `Client.ts`.** Patch 28 is the model (`client/PATCHES.md:152-156`): all the logic in `client/src/hooks/objArt.ts`, unit-tested against fakes, with `Client.ts` carrying only the port. Three reasons it matters more here. `client/src/hooks/` is ours and survives an upstream bump untouched. `bun test src/hooks` is already `verify.ps1` step 4, so this needs no new wiring. And **neither of `Client.ts`'s two inv loops is reachable from a headless test**, so arithmetic left inline there is arithmetic no gate can measure.

**The one structural fact that makes this task load-bearing.** The bank pane's cell geometry is written **twice** in `Client.ts`: `drawInterface`'s `TYPE_INV` branch at `:12349-12443` paints, and `addComponentOptions`'s at `:12062-12199` decides what a click, a right-click and a drag start refer to (drag start reads `menuParamB` at `:10758-10759`). The two compute the same `slotX`/`slotY` at `:12358-12359` and `:12068-12073`. **A tab-range compaction applied to only one of them compiles, passes every `bun test`, and silently withdraws the wrong item.** One helper, called from both, is the only shape that cannot drift.

**Files:**
- Create: `client/src/hooks/bankTabs.ts` (under 400 lines)
- Create: `client/src/hooks/bankTabs.test.ts` (under 400 lines)

**Interfaces:**
- Consumes: nothing. No `Client` import, no DOM, no `IfType`.
- Produces, for Tasks 7, 8 and 9:
  ```ts
  export const BANK_TAB_MAX: 9;
  export const BANK_TAB_CLIENTCODE: 10;          // the `banktab` varp
  export const BANK_SIZE_CLIENTCODE_BASE: 11;    // banktab_size_1..9 are 11..19
  export const BANK_TAB_COM_CLIENTCODE_BASE: 210; // bank_main:tab_0..tab_9 are 210..219
  export const BANK_DIVIDER_RGB: number;
  export const BANK_SCROLL_PAD: 2;
  export const BANK_INV_TOP_PAD: 3;              // bank_main:inv's DECLARED y inside com_92

  export interface BankTabVarps { selected: number; sizes: number[] }
  export interface ClientCodeCarrier { clientcode: number }

  export function resolveBankTabVarps(list: readonly (ClientCodeCarrier | null | undefined)[]): BankTabVarps;
  export function readTabSizes(varps: BankTabVarps, read: (id: number) => number): number[];
  export function readSelectedTab(varps: BankTabVarps, read: (id: number) => number, sizes: readonly number[]): number;
  export function tabStart(tab: number, sizes: readonly number[]): number;
  export function tabOfSlot(slot: number, sizes: readonly number[]): number;
  export function visibleCell(slot: number, tab: number, sizes: readonly number[]): number;
  export function visibleCount(tab: number, sizes: readonly number[], capacity: number): number;
  export function dividerRows(sizes: readonly number[], columns: number): number[];
  export function scrollHeightFor(cells: number, columns: number, rowPitch: number, topPad: number): number;
  export function lastOccupied(linkObjType: ArrayLike<number>, capacity: number): number;
  export function dropSlotForTab(srcSlot: number, tab: number, sizes: readonly number[], used: number): number;
  export function tabOfComponentClientCode(clientCode: number): number;
  ```

- [ ] **Step 1: Write the failing tests**

Create `client/src/hooks/bankTabs.test.ts`. This is the file that carries the correctness argument for the whole client half, so it is written first and in full.

```ts
// client/src/hooks/bankTabs.test.ts
import { describe, expect, test } from 'bun:test';
import {
  BANK_INV_TOP_PAD,
  BANK_SCROLL_PAD,
  BANK_SIZE_CLIENTCODE_BASE,
  BANK_TAB_CLIENTCODE,
  BANK_TAB_COM_CLIENTCODE_BASE,
  BANK_TAB_MAX,
  dividerRows,
  dropSlotForTab,
  lastOccupied,
  readSelectedTab,
  readTabSizes,
  resolveBankTabVarps,
  scrollHeightFor,
  tabOfComponentClientCode,
  tabOfSlot,
  tabStart,
  visibleCell,
  visibleCount,
  type BankTabVarps
} from './bankTabs';

/** A VarpType.list stand-in: the client's real list is dense and holds only `clientcode`. */
function varpList(codes: Record<number, number>): Array<{ clientcode: number }> {
  const list: Array<{ clientcode: number }> = [];
  for (let id = 0; id < 400; id++) list.push({ clientcode: codes[id] ?? 0 });
  return list;
}

const REAL_VARPS: BankTabVarps = { selected: 368, sizes: [359, 360, 361, 362, 363, 364, 365, 366, 367] };

describe('resolveBankTabVarps', () => {
  test('finds the ten varps by clientcode, not by id', () => {
    const codes: Record<number, number> = { 368: BANK_TAB_CLIENTCODE };
    for (let i = 0; i < BANK_TAB_MAX; i++) codes[359 + i] = BANK_SIZE_CLIENTCODE_BASE + i;
    expect(resolveBankTabVarps(varpList(codes))).toEqual(REAL_VARPS);
  });

  test('a renumbered pack changes nothing, which is the whole point of using clientcodes', () => {
    const codes: Record<number, number> = { 12: BANK_TAB_CLIENTCODE };
    for (let i = 0; i < BANK_TAB_MAX; i++) codes[200 + i] = BANK_SIZE_CLIENTCODE_BASE + i;
    expect(resolveBankTabVarps(varpList(codes))).toEqual({
      selected: 12,
      sizes: [200, 201, 202, 203, 204, 205, 206, 207, 208]
    });
  });

  test('a missing varp is -1 rather than 0, so a read cannot silently mean slot zero', () => {
    const resolved = resolveBankTabVarps(varpList({}));
    expect(resolved.selected).toBe(-1);
    expect(resolved.sizes).toEqual([-1, -1, -1, -1, -1, -1, -1, -1, -1]);
  });

  test('null holes in the list are skipped, not thrown on', () => {
    const list: Array<{ clientcode: number } | null> = varpList({ 5: BANK_TAB_CLIENTCODE });
    list[3] = null;
    expect(resolveBankTabVarps(list).selected).toBe(5);
  });
});

describe('readTabSizes', () => {
  const read = (values: Record<number, number>) => (id: number): number => values[id] ?? 0;

  test('reads the nine in order and trims trailing zeros, matching the engine readTabVarps', () => {
    expect(readTabSizes(REAL_VARPS, read({ 359: 10, 360: 6, 361: 0 }))).toEqual([10, 6]);
  });

  test('an interior zero is kept, because the engine collapses and renumbers it, not the client', () => {
    expect(readTabSizes(REAL_VARPS, read({ 359: 10, 360: 0, 361: 4 }))).toEqual([10, 0, 4]);
  });

  test('a negative value clamps to zero rather than shifting every later boundary left', () => {
    expect(readTabSizes(REAL_VARPS, read({ 359: -5, 360: 3 }))).toEqual([0, 3]);
  });

  test('unresolved varps read as an empty layout, not as nine zeros', () => {
    expect(readTabSizes({ selected: -1, sizes: new Array(9).fill(-1) }, read({}))).toEqual([]);
  });
});

describe('readSelectedTab', () => {
  test('clamps a selection past the last declared tab back to All items', () => {
    expect(readSelectedTab(REAL_VARPS, () => 7, [10, 6])).toBe(0);
  });
  test('keeps a selection inside the declared tabs', () => {
    expect(readSelectedTab(REAL_VARPS, () => 2, [10, 6])).toBe(2);
  });
  test('an unresolved varp is All items', () => {
    expect(readSelectedTab({ selected: -1, sizes: [] }, () => 3, [10, 6])).toBe(0);
  });
  test('a negative value is All items', () => {
    expect(readSelectedTab(REAL_VARPS, () => -1, [10, 6])).toBe(0);
  });
});

describe('tabStart and tabOfSlot', () => {
  const sizes = [10, 6, 4];
  test('tab starts are the running sum', () => {
    expect([1, 2, 3].map(t => tabStart(t, sizes))).toEqual([0, 10, 16]);
  });
  test('tab 0 starts after every declared tab, which is SP8b ruling 12.3', () => {
    expect(tabStart(0, sizes)).toBe(20);
  });
  test('tabOfSlot names the tab, and 0 for the tail', () => {
    expect([0, 9, 10, 15, 16, 19, 20, 239].map(s => tabOfSlot(s, sizes))).toEqual([1, 1, 2, 2, 3, 3, 0, 0]);
  });
  test('an interior zero-size tab owns no slot', () => {
    expect(tabOfSlot(0, [0, 5])).toBe(2);
  });
});

describe('visibleCell', () => {
  const sizes = [10, 6];
  test('All items shows every slot at its own index', () => {
    expect([0, 10, 16, 239].map(s => visibleCell(s, 0, sizes))).toEqual([0, 10, 16, 239]);
  });
  test('a tab compacts its own range to the top left, which the web bank does NOT do (R16)', () => {
    expect(visibleCell(10, 2, sizes)).toBe(0);
    expect(visibleCell(15, 2, sizes)).toBe(5);
  });
  test('everything outside the tab is hidden', () => {
    expect([9, 16, 239].map(s => visibleCell(s, 2, sizes))).toEqual([-1, -1, -1]);
  });
  test('the first and last slot of the first tab are on the boundary, not past it', () => {
    expect(visibleCell(0, 1, sizes)).toBe(0);
    expect(visibleCell(9, 1, sizes)).toBe(9);
    expect(visibleCell(10, 1, sizes)).toBe(-1);
  });
  test('a tab that does not exist shows nothing rather than everything', () => {
    expect(visibleCell(0, 5, sizes)).toBe(-1);
  });
});

describe('visibleCount', () => {
  test('All items is the whole capacity', () => {
    expect(visibleCount(0, [10, 6], 240)).toBe(240);
  });
  test('a tab is its own size', () => {
    expect(visibleCount(2, [10, 6], 240)).toBe(6);
  });
  test('a tab past the end is empty', () => {
    expect(visibleCount(9, [10, 6], 240)).toBe(0);
  });
});

describe('dividerRows', () => {
  test('one row per tab start, matching web/src/bank/grid.ts:208-215 exactly', () => {
    expect(dividerRows([10, 6], 8)).toEqual([0, 1]);
    expect(dividerRows([16, 8], 8)).toEqual([0, 2]);
  });
  test('two tabs starting in the same row collapse to one line', () => {
    expect(dividerRows([4, 4], 8)).toEqual([0]);
  });
  test('no tabs means no dividers', () => {
    expect(dividerRows([], 8)).toEqual([]);
  });
  test('rows come back ascending, so the draw loop can walk them in order', () => {
    expect(dividerRows([8, 8, 8], 8)).toEqual([0, 1, 2]);
  });
});

describe('scrollHeightFor', () => {
  // BANK_INV_TOP_PAD, not a literal 3 and not `child.y`: the call site in patch 30 passes the
  // constant because IfType.y is 0 at runtime (only IF_SETPOSITION ever writes it), so a test
  // that hard-coded 3 would assert 1145 about a call site that produces 1142.
  test('the full 240-slot view reproduces the interface file own scroll=1145', () => {
    expect(scrollHeightFor(240, 8, 38, BANK_INV_TOP_PAD)).toBe(1145);
  });
  test('a compacted tab is shorter, so the pane cannot scroll past its end', () => {
    expect(scrollHeightFor(10, 8, 38, BANK_INV_TOP_PAD)).toBe(BANK_INV_TOP_PAD + 2 * 38 + BANK_SCROLL_PAD);
  });
  test('an empty tab still has a non-negative height', () => {
    expect(scrollHeightFor(0, 8, 38, BANK_INV_TOP_PAD)).toBe(BANK_INV_TOP_PAD + BANK_SCROLL_PAD);
  });
});

describe('lastOccupied', () => {
  test('is the highest occupied index plus one, not a count', () => {
    const link = new Array(240).fill(0);
    link[0] = 5;
    link[17] = 9;
    expect(lastOccupied(link, 240)).toBe(18);
  });
  test('an empty bank is zero', () => {
    expect(lastOccupied(new Array(240).fill(0), 240)).toBe(0);
  });
  test('linkObjType stores id + 1, so a stored 0 is empty and a stored 1 is obj 0', () => {
    const link = new Array(4).fill(0);
    link[2] = 1;
    expect(lastOccupied(link, 4)).toBe(3);
  });
});

describe('dropSlotForTab', () => {
  const sizes = [10, 6, 4]; // tab 1 = [0,10), tab 2 = [10,16), tab 3 = [16,20), tab 0 = [20, used)
  const used = 25;

  test('moving forward inserts at the destination tab last slot', () => {
    expect(dropSlotForTab(3, 3, sizes, used)).toBe(19);
  });
  test('moving backward inserts at the destination tab first slot', () => {
    expect(dropSlotForTab(18, 1, sizes, used)).toBe(0);
  });
  test('dropping on the tab it already lives in is refused', () => {
    expect(dropSlotForTab(3, 1, sizes, used)).toBe(-1);
  });
  test('dropping on All items sends it to the last used slot', () => {
    expect(dropSlotForTab(3, 0, sizes, used)).toBe(24);
  });
  test('an empty destination tab is refused, because the client cannot create a tab', () => {
    expect(dropSlotForTab(3, 4, sizes, used)).toBe(-1);
  });
  // The last two reach the FINAL guard, `target < 0 || target === srcSlot`. The obvious cases
  // for it (a slot in the tail dropped on tab 0, an empty bank dropped on tab 0) do not: both
  // have tabOfSlot(srcSlot) === 0 === tab and return at the FIRST line, so the guard would be
  // dead and deleting it would pass. These two do not take the early return.
  test('a drop that resolves to the source slot itself is refused', () => {
    // sum(sizes) === used: slot 19 is the last slot of tab 3, and tab 0's target is used - 1,
    // which is 19 as well. A legal state under the invariant (sum(sizes) <= lastUsedSlot).
    expect(dropSlotForTab(19, 0, sizes, 20)).toBe(-1);
  });
  test('a bank with no used slot refuses a drop rather than sending slot -1', () => {
    // used is 0, so tab 0's target is -1. srcSlot 5 is inside tab 1, so the first line does not
    // fire and the target guard is the only thing standing between this and INV_BUTTOND(-1).
    expect(dropSlotForTab(5, 0, [10], 0)).toBe(-1);
  });
});

describe('tabOfComponentClientCode', () => {
  test('maps the reserved band onto the ten tabs', () => {
    expect(tabOfComponentClientCode(BANK_TAB_COM_CLIENTCODE_BASE)).toBe(0);
    expect(tabOfComponentClientCode(BANK_TAB_COM_CLIENTCODE_BASE + 9)).toBe(9);
  });
  test('anything outside the band is not a tab', () => {
    expect([0, 206, 209, 220, 300].map(tabOfComponentClientCode)).toEqual([-1, -1, -1, -1, -1]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```
cd client
~/.bun/bin/bun test src/hooks/bankTabs.test.ts
```
Expected: `Cannot find module './bankTabs'`.

- [ ] **Step 3: Write the module**

Create `client/src/hooks/bankTabs.ts`:

```ts
// The pure half of client patches 29, 30 and 31 (SP8c bank tabs). Everything here is ours and
// survives an upstream bump untouched; Client.ts keeps only the call sites and the ObjType /
// Pix2D / packet calls. Nothing in this file imports Client, IfType or the DOM.
//
// The layout is nine SIZES, not boundaries: sizes[i] is how many slots tab i+1 holds and
// everything after their sum is tab 0. Same shape as engine-custom/src/idlescape/bankLayout.ts
// and web/src/bank/layout.ts, and the three are meant to be read side by side.

export const BANK_TAB_MAX = 9;

/** Varp clientcodes. Values, not ids, so a varp.pack renumber cannot break the patches. */
export const BANK_TAB_CLIENTCODE = 10;
export const BANK_SIZE_CLIENTCODE_BASE = 11;

/** Component clientcodes for bank_main:tab_0 .. tab_9. */
export const BANK_TAB_COM_CLIENTCODE_BASE = 210;

/** The divider line drawn between tabs in the All items view. */
export const BANK_DIVIDER_RGB = 0x5d5447;

/** The two pixels bank_main:com_92's own scroll=1145 carries over 30 rows of 38 at y=3. */
export const BANK_SCROLL_PAD = 2;

/**
 * bank_main:inv's DECLARED y inside com_92. It is a constant here and not `child.y` at the call
 * site, because `IfType.x` and `IfType.y` are 0 at runtime: they default to 0 (IfType.ts:54-55)
 * and the only place in the client that ever assigns them is the IF_SETPOSITION handler
 * (Client.ts:8568-8570). The .if file's own x/y reach the client as the PARENT's childX/childY
 * arrays (PackShared.ts:466-470, IfType.ts:170-175), which drawInterface adds separately. So
 * reading `child.y` for the top pad would silently pass 0 and make the full view 1142 rather
 * than the 1145 com_92 declares.
 */
export const BANK_INV_TOP_PAD = 3;

export interface BankTabVarps {
  /** Varp id of `banktab`, or -1 when the cache does not declare it. */
  selected: number;
  /** Varp ids of banktab_size_1..9, -1 for any the cache does not declare. */
  sizes: number[];
}

export interface ClientCodeCarrier {
  clientcode: number;
}

/**
 * Resolve the ten varp ids once, from the config the client just unpacked. Resolving by
 * clientcode rather than by id is the point: VarpType decodes only `clientcode` and discards
 * the debug name, so an id in the patch would be a silent coupling to
 * content-custom/pack/varp.pack that a renumber would break with no error.
 */
export function resolveBankTabVarps(list: readonly (ClientCodeCarrier | null | undefined)[]): BankTabVarps {
  const varps: BankTabVarps = { selected: -1, sizes: new Array<number>(BANK_TAB_MAX).fill(-1) };
  for (let id = 0; id < list.length; id++) {
    const code = list[id]?.clientcode ?? 0;
    if (code === BANK_TAB_CLIENTCODE) {
      varps.selected = id;
    } else if (code >= BANK_SIZE_CLIENTCODE_BASE && code < BANK_SIZE_CLIENTCODE_BASE + BANK_TAB_MAX) {
      varps.sizes[code - BANK_SIZE_CLIENTCODE_BASE] = id;
    }
  }
  return varps;
}

/**
 * The tab sizes, trailing zeros trimmed. The trim matches readTabVarps in
 * engine-custom/src/idlescape/tabVarps.ts, which is what the owner store persists, so the two
 * ends agree on how many tabs exist. An INTERIOR zero is kept: collapsing and renumbering it
 * is the engine's job (engine-custom/PATCHES.md:421-429), and a client that did it too would
 * draw a layout the server does not have.
 */
export function readTabSizes(varps: BankTabVarps, read: (id: number) => number): number[] {
  const sizes: number[] = [];
  for (const id of varps.sizes) {
    sizes.push(id === -1 ? 0 : Math.max(0, read(id)));
  }
  while (sizes.length > 0 && sizes[sizes.length - 1] === 0) {
    sizes.pop();
  }
  return sizes;
}

/** The selected tab, clamped into 0..sizes.length. 0 is "All items". */
export function readSelectedTab(varps: BankTabVarps, read: (id: number) => number, sizes: readonly number[]): number {
  if (varps.selected === -1) {
    return 0;
  }
  const tab = read(varps.selected);
  if (!Number.isInteger(tab) || tab < 1 || tab > sizes.length) {
    return 0;
  }
  return tab;
}

/** The first slot of a tab. Tab 0 starts after every declared tab (SP8b spec ruling 12.3). */
export function tabStart(tab: number, sizes: readonly number[]): number {
  const upTo = tab === 0 ? sizes.length : tab - 1;
  let start = 0;
  for (let i = 0; i < upTo && i < sizes.length; i++) {
    start += sizes[i];
  }
  return start;
}

/** Which tab owns a slot: 1..9, or 0 for everything past the declared tabs. */
export function tabOfSlot(slot: number, sizes: readonly number[]): number {
  let start = 0;
  for (let i = 0; i < sizes.length; i++) {
    const end = start + sizes[i];
    if (sizes[i] > 0 && slot >= start && slot < end) {
      return i + 1;
    }
    start = end;
  }
  return 0;
}

/**
 * Where a slot is drawn, and what a click at that cell refers to: the cell index inside the
 * current view, or -1 when the slot is not in it. THIS IS CALLED FROM BOTH of Client.ts's inv
 * loops. A patch that changed only the draw loop would compile, pass every test here, and
 * withdraw the wrong item.
 *
 * A tab is COMPACTED to the top left, `slot - tabStart(tab)`. The web bank does not: it pads to
 * the row boundary, `renderStart = Math.floor(realStart / columns) * columns`, and draws the
 * leading cells of the first row as fillers (web/src/bank/grid.ts:186-191). So for tabs
 * [10, 12] the web puts tab 2's first item in row 1 column 2 and the game client puts it in row
 * 0 column 0. That divergence is deliberate and is SP8c plan ruling R16, which carries the cost
 * and the reversal; it is not a bug to be quietly matched up by a later reader.
 */
export function visibleCell(slot: number, tab: number, sizes: readonly number[]): number {
  if (tab === 0) {
    return slot;
  }
  if (tab < 1 || tab > sizes.length) {
    return -1;
  }
  const start = tabStart(tab, sizes);
  return slot >= start && slot < start + sizes[tab - 1] ? slot - start : -1;
}

/** How many cells the current view holds, for the scroll height. */
export function visibleCount(tab: number, sizes: readonly number[], capacity: number): number {
  if (tab === 0) {
    return capacity;
  }
  return tab >= 1 && tab <= sizes.length ? sizes[tab - 1] : 0;
}

/**
 * The rows a divider line is drawn above, in the All items view only. One per tab start,
 * deduplicated and ascending, which is exactly web/src/bank/grid.ts:208-215: two tabs whose
 * starts land in the same physical row share one line rather than one hiding the other.
 */
export function dividerRows(sizes: readonly number[], columns: number): number[] {
  const rows: number[] = [];
  let start = 0;
  for (const size of sizes) {
    const row = Math.floor(start / columns);
    if (!rows.includes(row)) {
      rows.push(row);
    }
    start += size;
  }
  return rows.sort((a, b) => a - b);
}

/** The scrollable content height of a view holding `cells` cells. */
export function scrollHeightFor(cells: number, columns: number, rowPitch: number, topPad: number): number {
  const rows = Math.ceil(Math.max(0, cells) / columns);
  return topPad + rows * rowPitch + BANK_SCROLL_PAD;
}

/**
 * The highest occupied slot plus one, which is what "used" means everywhere in this project
 * (engine-custom/PATCHES.md:575-580). `linkObjType` stores `id + 1`, so 0 is an empty slot.
 */
export function lastOccupied(linkObjType: ArrayLike<number>, capacity: number): number {
  for (let slot = Math.min(capacity, linkObjType.length) - 1; slot >= 0; slot--) {
    if (linkObjType[slot] > 0) {
      return slot + 1;
    }
  }
  return 0;
}

/**
 * The slot an INV_BUTTOND must name so that "move slot `srcSlot` into tab `tab`" happens.
 *
 * The bank's insert shifts every slot between the two ends by one, and bank.rs2 then moves the two
 * tab boundaries by one to match. So the target is the destination tab's LAST slot when moving
 * forward and its FIRST slot when moving backward; either way the item lands inside the tab and
 * every boundary between source and destination moves exactly as far as the items did.
 *
 * -1 means "no move": the same tab, an empty destination tab (the client cannot create one,
 * that is web-only in v1), or a target that resolves to the source slot itself.
 */
export function dropSlotForTab(srcSlot: number, tab: number, sizes: readonly number[], used: number): number {
  if (tabOfSlot(srcSlot, sizes) === tab) {
    return -1;
  }
  let target: number;
  if (tab === 0) {
    target = used - 1;
  } else {
    if (tab < 1 || tab > sizes.length || sizes[tab - 1] <= 0) {
      return -1;
    }
    const start = tabStart(tab, sizes);
    const end = start + sizes[tab - 1];
    target = srcSlot >= end ? start : end - 1;
  }
  return target < 0 || target === srcSlot ? -1 : target;
}

/** The tab a bank tab component's clientcode names, or -1 for any other component. */
export function tabOfComponentClientCode(clientCode: number): number {
  const tab = clientCode - BANK_TAB_COM_CLIENTCODE_BASE;
  return tab >= 0 && tab <= BANK_TAB_MAX ? tab : -1;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

```
cd client
~/.bun/bin/bun test src/hooks/bankTabs.test.ts
```
Expected: all pass. Then the whole hook suite and the typecheck:
```
~/.bun/bin/bun test src/hooks
~/.bun/bin/bun run typecheck
```

- [ ] **Step 5: Mutation-to-test table**

| Change I made to break it | The test that must fail | Did it? |
|---|---|---|
| `visibleCell` returns `slot - start` without the `< start + sizes[tab-1]` bound | `everything outside the tab is hidden` | |
| `visibleCell`'s bound uses `<=` instead of `<` | `the first and last slot of the first tab are on the boundary, not past it` | |
| `dividerRows` uses `Math.ceil` instead of `Math.floor` | `one row per tab start, matching web/src/bank/grid.ts:208-215 exactly` | |
| `dropSlotForTab` returns `end` instead of `end - 1` | `moving forward inserts at the destination tab last slot` | |
| `dropSlotForTab` drops the `srcSlot >= end` test and always returns `start` | `moving forward inserts at the destination tab last slot` | |
| `lastOccupied` returns `slot` instead of `slot + 1` | `is the highest occupied index plus one, not a count` | |
| `scrollHeightFor` drops `BANK_SCROLL_PAD` | `the full 240-slot view reproduces the interface file own scroll=1145` | |
| `readTabSizes` trims interior zeros too | `an interior zero is kept, ...` | |
| `resolveBankTabVarps` returns 0 for a missing varp | `a missing varp is -1 rather than 0, ...` | |
| Delete `dropSlotForTab`'s final `target < 0 \|\| target === srcSlot` guard, returning `target` | `a drop that resolves to the source slot itself is refused` and `a bank with no used slot refuses a drop ...` | |
| `scrollHeightFor` uses a literal `3` and the call site passes `child.y` | nothing in this suite; the failure is Task 8 step 6 item 2 in game, which is why `BANK_INV_TOP_PAD` is a constant both ends import | |

Every row here is an off-by-one or a polarity flip that would look correct in review. That is the point of the table.

- [ ] **Step 6: Commit**

```bash
git add client/src/hooks/bankTabs.ts client/src/hooks/bankTabs.test.ts
git -c core.safecrlf=false commit -m "feat(client): bank tab arithmetic as a testable hook module

The pure half of client patches 29 to 31: varp resolution by clientcode, tab ranges, the
visible-cell mapping both of Client.ts's inv loops will share, divider rows matching the web
bank's, the scroll height for a compacted view and the INV_BUTTOND drop slot. Nothing here
imports Client or the DOM, so bun test src/hooks reaches all of it; neither inv loop in the
vendored file is reachable headlessly, which is why the arithmetic cannot live there.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 7: Client patch 29 - the varp intake

The smallest of the three patches: resolve the ten ids once, then read `this.var[id]` live. **Live reads rather than cached fields** on purpose. The alternative, mirroring `bankArrangeMode` (`Client.ts:562`, filled from `clientVar`'s clientcode-9 branch at `:13088-13089`), needs a reset site in the `login()` `response === 2` block (`:4200-4215`) that a future reader can forget, and would go stale on a `VARP_SYNC`. Live reads honour `VARP_SMALL` (`:9367`), `VARP_LARGE` (`:9388`) and `VARP_SYNC` (`:9409`) for free, because all three write `this.var` directly.

**Files:**
- Modify: `client/src/client/Client.ts`
- Modify: `client/PATCHES.md`

**Interfaces:**
- Consumes: `resolveBankTabVarps`, `readTabSizes`, `readSelectedTab`, `BankTabVarps` from Task 6.
- Produces, for Tasks 8 and 9:
  ```ts
  private bankTabVarps: BankTabVarps;      // resolved once after VarpType.init
  private bankTabSizes(): number[];
  private bankSelectedTab(): number;
  ```

- [ ] **Step 1: Add the import**

At the top of `client/src/client/Client.ts`, beside patch 28's import (`Client.ts:79`, `from '#/hooks/objArt.js'`):

```ts
import {
    BANK_DIVIDER_RGB,
    BANK_INV_TOP_PAD,
    dividerRows,
    dropSlotForTab,
    lastOccupied,
    readSelectedTab,
    readTabSizes,
    resolveBankTabVarps,
    scrollHeightFor,
    tabOfComponentClientCode,
    visibleCell,
    visibleCount,
    type BankTabVarps
} from '#/hooks/bankTabs.js';
```
The list covers all three patches so the import is written once; Tasks 8 and 9 use the rest, and every name in it has a call site. `type`-mark `BankTabVarps` for `verbatimModuleSyntax`, exactly as patch 1 does. **`BANK_SCROLL_PAD` is deliberately not imported**: `scrollHeightFor` adds it itself, so `Client.ts` never names it, and patch 29's fence asserts this import line appears exactly once precisely to keep the list honest.

- [ ] **Step 2: Add the field**

In the private-field block patch 2 owns, beside `bankArrangeMode` (`Client.ts:562`):

```ts
    // idlescape patch 29: the bank tab varps, resolved once by CLIENTCODE after VarpType.init.
    // Ids would be a silent coupling to content-custom/pack/varp.pack; VarpType decodes only
    // the clientcode and discards the debug name, so there is nothing else to resolve by.
    private bankTabVarps: BankTabVarps = { selected: -1, sizes: [] };
```

- [ ] **Step 3: Resolve after the config unpack**

At `Client.ts:3427`, immediately after `VarpType.init(config);` inside the "Unpacking config" block:

```ts
            VarpType.init(config);
            // idlescape patch 29
            this.bankTabVarps = resolveBankTabVarps(VarpType.list);
```

- [ ] **Step 4: Add the two accessors**

Beside patch 28's private methods (`Client.ts:14006` onward, next to `emitInventoryDiff`):

```ts
    // idlescape patch 29: read the tab layout live rather than caching it. VARP_SMALL,
    // VARP_LARGE and VARP_SYNC all write this.var directly, so a live read is correct after a
    // relog and after the engine's ResetClientVarCache with no reset site of our own.
    private bankTabSizes(): number[] {
        return readTabSizes(this.bankTabVarps, id => this.var[id] ?? 0);
    }

    private bankSelectedTab(): number {
        return readSelectedTab(this.bankTabVarps, id => this.var[id] ?? 0, this.bankTabSizes());
    }
```

- [ ] **Step 5: Typecheck**

```
cd client
~/.bun/bin/bun run typecheck
```
Expected: clean. This is the only gate that reads the whole of `Client.ts`; `bun test` type-checks only what it imports, and nothing imports the vendored file.

Both accessors are unused until Task 8, which `tsc --noEmit` does not object to for a private method (`noUnusedLocals` is not set in the fork's pristine `tsconfig.json`). If it does object on this tree, land Steps 1 to 4 together with Task 8 rather than weakening the config.

- [ ] **Step 6: Record the patch**

Add to `client/PATCHES.md`, a verification block above "The patches" table:

````markdown
## Patch 29 verification

Run it with `powershell -File scripts/patches-check.ps1` from the repository root.

```patches-check
root: client
patch 29 | contains | 1 | src/client/Client.ts | private bankTabVarps: BankTabVarps = { selected: -1, sizes: [] };
patch 29 | contains | 1 | src/client/Client.ts | from '#/hooks/bankTabs.js';
patch 29 | contains | 1 | src/client/Client.ts | this.bankTabVarps = resolveBankTabVarps(VarpType.list);
patch 29 | contains | 1 | src/client/Client.ts | private bankTabSizes(): number[] {
patch 29 | contains | 1 | src/client/Client.ts | private bankSelectedTab(): number {
```

The import count of **1** matters: it is what proves the arithmetic did not get inlined into
`Client.ts`, where neither of the two inv loops is reachable by any headless test. All of it
lives in `src/hooks/bankTabs.ts` and is tested in `src/hooks/bankTabs.test.ts`, the same split
patch 28 uses.
````

and a row at the end of the patches table:

```
| 29 | private fields (patch 2 block), `VarpType.init(config)` in the config-unpack block, and two new private methods beside `emitInventoryDiff()` | **SP8c bank tab intake.** Resolves the ten bank tab varps once by CLIENTCODE (10 for `banktab`, 11 to 19 for `banktab_size_1..9`) into `bankTabVarps`, then reads them live through `bankTabSizes()` / `bankSelectedTab()`. Clientcodes rather than pack ids, because `VarpType` decodes only the clientcode and a pack renumber would otherwise break the draw with no error; live reads rather than cached fields, because `VARP_SMALL`, `VARP_LARGE` and `VARP_SYNC` all write `this.var` directly and a cache would need a login reset site. The clientcodes are declared in `content-custom/scripts/interface_bank/configs/banktab.varp` and are as load-bearing as the ids. | `private bankTabVarps: BankTabVarps` |
```

- [ ] **Step 7: Run the greps**

```
cd client
```
then each line of the patch 29 block, comparing to the stated count. If `scripts/patches-check.ps1` exists (entry 3), run `powershell -File scripts/patches-check.ps1` instead and paste its output. Record which route was taken.

- [ ] **Step 8: Commit**

```bash
git add client/src/client/Client.ts client/PATCHES.md
git -c core.safecrlf=false commit -m "feat(client): patch 29, resolve the bank tab varps by clientcode

Resolves the ten bank tab varps once after VarpType.init and reads them live. By clientcode
rather than by pack id, because VarpType decodes only the clientcode and discards the debug
name, so an id here would be a silent coupling to content-custom/pack/varp.pack. Live reads
rather than cached fields, so VARP_SYNC and a relog are honoured with no reset site.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 8: Client patch 30 - the tab-range draw, the dividers and the scroll height

**The two loops.** Both must change or the bank withdraws the wrong item:

- `drawInterface(com, x, y, scrollY)` at `Client.ts:12306`; `TYPE_INV` branch opens at `:12349` with `let slot: number = 0;` at `:12350`, row/column loops at `:12352-12353`, the cell origin at `:12358-12359`, the first-twenty-slots nudge at `:12361-12364`, the occupied guard at `:12366`, the clip and drag visibility test at `:12371`, the empty-slot else at `:12438-12441` and `slot++` at `:12443`.
- `addComponentOptions(com, mouseX, mouseY, x, y, scrollPosition)` at `Client.ts:12034`; its inv branch (written as `child.type === 2`) opens at `:12062` with `let slot: number = 0;` at `:12063`, the same row/column loops at `:12065-12066`, the same cell origin at **`:12067-12073`** (`let slotX` is `:12067`, `let slotY` is `:12068` and the first-twenty nudge is `:12070-12073`, one line earlier than the draw loop's, which has a null guard above it), and the `this.hoveredSlot = slot;` / `this.hoveredSlotComId = child.id;` write at `:12080-12081`.

`slot` keeps walking 0 to 239 in both. What changes is **where that slot is painted, and what a click at that point refers to**, and both come from the same helper.

**Identifying the bank pane.** By `child.clientCode === ClientCode.CC_BANKMODE` (`ClientCode.ts:19`, value 206), which `bank_main:inv` already carries (`bank_main.if`, the `[inv]` block) and which the drag-release path already uses the same way at `Client.ts:4611`. No interface id, so a pack renumber cannot break it.

**Files:**
- Modify: `client/src/client/Client.ts`
- Modify: `client/PATCHES.md`

**Interfaces:**
- Consumes: `bankTabSizes`, `bankSelectedTab` from Task 7; `visibleCell`, `visibleCount`, `dividerRows`, `scrollHeightFor`, `BANK_DIVIDER_RGB`, `BANK_INV_TOP_PAD` from Task 6. Not `BANK_SCROLL_PAD`: `scrollHeightFor` adds it itself.
- Produces: nothing another task consumes. `bankVisibleCell` and `drawBankTabDividers` are both private to this patch; Task 9 uses `bankTabSizes` from Task 7 and the pure helpers from Task 6, and calls neither of them.

- [ ] **Step 1: Add the shared helper**

Beside patch 29's accessors:

```ts
    // idlescape patch 30: where a bank slot is drawn, and what a click there refers to.
    // Called from BOTH inv loops (drawInterface and addComponentOptions). For any component
    // that is not the bank pane it answers `slot`, so every other inventory is untouched.
    private bankVisibleCell(child: IfType, slot: number): number {
        if (child.clientCode !== ClientCode.CC_BANKMODE) {
            return slot;
        }
        return visibleCell(slot, this.bankSelectedTab(), this.bankTabSizes());
    }
```

- [ ] **Step 2: Patch the draw loop**

In `drawInterface`'s inv branch, replace `Client.ts:12358-12364` (the two `slotX`/`slotY` declarations and the first-twenty nudge) with:

```ts
                        // idlescape patch 30
                        const cell: number = this.bankVisibleCell(child, slot);
                        if (cell < 0) {
                            slot++;
                            continue;
                        }

                        let slotX: number = childX + (cell % child.width) * (child.marginX + 32);
                        let slotY: number = childY + Math.trunc(cell / child.width) * (child.marginY + 32);

                        if (cell < 20) {
                            slotX += child.invBackgroundX[cell];
                            slotY += child.invBackgroundY[cell];
                        }
```

The nudge indexes by `cell` rather than by `slot` for the same reason the position does: it is an offset for the first twenty **cells of the pane**, not for the first twenty items of the bank. For any non-bank inv, `cell === slot`, so nothing changes.

- [ ] **Step 3: Patch the hit-test loop identically**

In `addComponentOptions`'s inv branch, replace `Client.ts:12067-12073` with the block below. **The range starts at 12067, not 12068**: `let slotX` is `:12067` and `let slotY` is `:12068`, so replacing from 12068 leaves the original `let slotX` in place and the replacement re-declares it, which is either a duplicate-identifier error or, if it is patched around, an un-patched `slotX` and exactly the half-applied hit test the count-of-2 grep exists to catch.

```ts
                        // idlescape patch 30: the same mapping as the draw loop, and it MUST
                        // be the same. A compaction applied to only one of these two loops
                        // compiles, passes every bun test (neither loop is reachable
                        // headlessly) and withdraws the wrong item.
                        const cell: number = this.bankVisibleCell(child, slot);
                        if (cell < 0) {
                            slot++;
                            continue;
                        }

                        let slotX: number = childX + (cell % child.width) * (child.marginX + 32);
                        let slotY: number = childY + Math.trunc(cell / child.width) * (child.marginY + 32);

                        if (cell < 20 && child.invBackgroundX && child.invBackgroundY) {
                            slotX += child.invBackgroundX[cell];
                            slotY += child.invBackgroundY[cell];
                        }
```

- [ ] **Step 4: Add the dividers and the scroll height**

Immediately after the two nested loops in `drawInterface`'s inv branch close (after `:12443`'s closing braces, before `} else if (child.type === ComponentType.TYPE_RECT) {`):

```ts
                // idlescape patch 30
                this.drawBankTabDividers(com, child, childX, childY);
```

and the method itself, beside `bankVisibleCell`:

```ts
    // idlescape patch 30: the divider lines the All items view draws between tabs, and the
    // scroll height a compacted view needs. `com` is the layer holding the inv (bank_main's
    // com_92, scroll=1145 for all 240 slots), so a five-row tab would otherwise scroll far
    // past its own end; the clamp reading scrollHeight is at Client.ts:12336-12342. This runs
    // inside the setClipping established at :12316, so the lines clip to the pane for free.
    private drawBankTabDividers(com: IfType, child: IfType, childX: number, childY: number): void {
        if (child.clientCode !== ClientCode.CC_BANKMODE) {
            return;
        }
        const sizes: number[] = this.bankTabSizes();
        const tab: number = this.bankSelectedTab();
        const rowPitch: number = child.marginY + 32;
        const cells: number = visibleCount(tab, sizes, child.width * child.height);
        com.scrollHeight = scrollHeightFor(cells, child.width, rowPitch, BANK_INV_TOP_PAD);
        if (tab !== 0) {
            return;
        }
        const lineWidth: number = child.width * (child.marginX + 32) - child.marginX;
        for (const row of dividerRows(sizes, child.width)) {
            Pix2D.fillRect(childX, childY + row * rowPitch - 2, lineWidth, 1, BANK_DIVIDER_RGB);
        }
    }
```

**The top pad is `BANK_INV_TOP_PAD`, not `child.y`, and the difference is three pixels that would make Task 6's headline assertion a lie about this call site.** `IfType.x` and `IfType.y` default to 0 (`client/src/config/IfType.ts:54-55`) and the only place in the whole client that ever assigns them is the `IF_SETPOSITION` handler (`Client.ts:8568-8570`). The `.if` file's `y=3` on `bank_main:inv` never reaches `child.y`: the packer emits a child's x and y inside the PARENT layer's children list (`PackShared.ts:466-470`), the client reads them into `com.childY[i]` (`IfType.ts:170-175`), and `drawInterface` adds them separately at `:12325-12329`. So `child.y` here is 0, the All-items view would get `0 + 30*38 + 2 = 1142`, and Task 6's `scrollHeightFor(240, 8, 38, BANK_INV_TOP_PAD) === 1145` would be true of the function and false of its only caller. Drawn cell positions are unaffected either way, because they come from `com.childY[i]`.

`scrollHeightFor` adds `BANK_SCROLL_PAD` itself, so the pad passed here is the top pad alone and not the top pad plus the scroll pad, which would double it. That is what makes the full view come back as `1145`, the number `bank_main:com_92` declares.

- [ ] **Step 5: Typecheck and run the hook suite**

```
cd client
~/.bun/bin/bun run typecheck
~/.bun/bin/bun test src/hooks
~/.bun/bin/bun run build:dev
```
Expected: all clean. `build:dev` is here because a bundle that does not build is a bundle Task 11 cannot drive.

- [ ] **Step 6: See it on the live stack, which is where this patch is first reachable**

Rebuild the client and restart nothing else (a client rebuild needs no stack restart). Open `http://localhost:8787`, log in, `::~bank_f2p` (**not** `::~bank_preset`, which stalls on a chat modal and leaves the bank empty; Task 4 step 9), then `::~bank`. Then, with tab sizes seeded (`::setvar banktab_size_1 10`, `::setvar banktab_size_2 12`, close and reopen):

1. **All items** shows every item, with a horizontal line above row 0 and above the row holding slot 10.
2. **Click tab 1**: exactly ten items, compacted to the top left, no gaps, and the scrollbar either absent or matching two rows.
3. **Click tab 2**: the next twelve, starting at the top left. **Note that the web bank draws this tab differently on purpose** (its first item sits in row 1 column 2, because the web pads to the row boundary): that is ruling R16, not a bug in either half.
4. **Right-click the fourth item while tab 2 is selected**: the menu names the item that is drawn there, not the fourth item of the bank. **This is the check that proves both loops were patched.** Withdraw it and confirm the right stack left the bank.
5. **Click tab 9** (declared size 0): the pane is empty and the client does not throw.

Record steps 1 to 5 as pass or fail in the handoff. Step 4 is the one that matters.

- [ ] **Step 7: Record the patch, with the polarity check spelled out**

Add to `client/PATCHES.md`:

````markdown
## Patch 30 verification

```patches-check
root: client
patch 30 | contains | 1 | src/client/Client.ts | private bankVisibleCell(child: IfType, slot: number): number {
patch 30 | contains | 2 | src/client/Client.ts | const cell: number = this.bankVisibleCell(child, slot);
patch 30 | contains | 1 | src/client/Client.ts | private drawBankTabDividers(com: IfType, child: IfType, childX: number, childY: number): void {
patch 30 | contains | 1 | src/client/Client.ts | this.drawBankTabDividers(com, child, childX, childY);
```

The count of **2** on `const cell: number = this.bankVisibleCell(child, slot);` is the polarity check for this patch,
in the same spirit as patch 27's `if (this.attended)` count of 0. The bank pane's cell geometry
is written twice in this file: `drawInterface`'s inv branch paints, and
`addComponentOptions`'s decides which slot a click, a right-click menu entry and a drag start
refer to. A patch applied to the draw loop alone still compiles, still passes every
`bun test src/hooks` (neither loop is reachable without a browser), and puts every bank click on
the wrong item, which withdraws the wrong stack. If this count is 1, the patch is half applied
and the bank is silently destructive.
````

and a table row:

```
| 30 | `drawInterface()`'s `TYPE_INV` branch, `addComponentOptions()`'s `child.type === 2` branch, and two new private methods beside patch 29's | **SP8c tab-range draw.** Both inv loops map `slot` through `bankVisibleCell()` before computing the cell origin, so the bank pane paints and hit-tests only the selected tab's range, compacted to the top left; every other inventory is untouched because the helper answers `slot` for any component whose `clientCode` is not `CC_BANKMODE` (206). `drawBankTabDividers()` writes the parent layer's `scrollHeight` from the visible cell count, so a five-row tab cannot scroll past its own end against `bank_main:com_92`'s `scroll=1145`, and draws one line per tab start in the All items view, matching `web/src/bank/grid.ts:208-215`. All the arithmetic is in `src/hooks/bankTabs.ts`. | `this.bankVisibleCell(child, slot)` (two hits, see above) |
```

- [ ] **Step 8: Mutation-to-test table**

| Change I made to break it | What must fail | Did it? |
|---|---|---|
| Revert the hit-test loop to the upstream `slotX`/`slotY` | Step 6 item 4 in game; Task 11's `a right-click with a tab selected names the item that is drawn` spec; and `grep -c "this.bankVisibleCell(child, slot)"` reads 1 | |
| Index the nudge by `slot` instead of `cell` | Step 6 item 2: the first twenty cells of a compacted tab sit a few pixels off | |
| Drop the `com.scrollHeight = ...` line | Step 6 item 2: tab 1 scrolls through 28 empty rows | |
| Pass `child.y` instead of `BANK_INV_TOP_PAD` | Step 6 item 1: the All items view can scroll three pixels short of its last row. Nothing in `bun test` sees it, which is the whole reason the pad is a shared constant | |
| Draw dividers for `tab !== 0` too | Step 6 item 3: lines appear inside a single-tab view | |
| `dividerRows(sizes, child.height)` instead of `child.width` | Step 6 item 1: the second line lands in the wrong row | |

The first row is the one to run deliberately, because it is the failure this patch is most likely to ship with.

- [ ] **Step 9: Run the greps and commit**

Run the patch 29 and patch 30 blocks (or `scripts/patches-check.ps1`), then:

```bash
git add client/src/client/Client.ts client/PATCHES.md
git -c core.safecrlf=false commit -m "feat(client): patch 30, draw and hit-test only the selected bank tab

Both of Client.ts's inv loops now map slot through bankVisibleCell before computing the cell
origin. Both, not one: drawInterface paints and addComponentOptions decides what a click
refers to, and a patch applied to the first alone compiles, passes every headless test and
withdraws the wrong item. PATCHES.md carries a grep with an expected count of 2 and the
reason. Dividers in the All items view match the web bank's rows, and the parent layer's
scrollHeight follows the visible cell count so a compacted tab cannot scroll past its end.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 9: Client patch 31 - drag onto a tab, and "Move to tab N"

Ruling R3: this is the whole move path, because the content-only right-click is impossible at 274. It is cheaper than the SP8b spec assumed, for one subtle reason.

**Why the drop hit-test is free.** The drag-release block is `Client.ts:4586-4655`. On `mouseButton === 0` (`:4593`) it clears `this.objDragArea = 0` at `:4601`, then at `:4604-4605` sets `this.hoveredSlotComId = -1;` and calls `this.buildMinimenu();`. `buildMinimenu()` (`:4892`) bails immediately when `objDragArea !== 0` (`:4893`), which is exactly why the clear precedes it. **So at the moment of release, the full mini-menu for whatever sits under the cursor has already been built**, including `SELECT_BUTTON` entries carrying the component id in `menuParamC` (added at `:12233-12237`). The hit test is a scan of the menu array. No draw-time screen-rect capture, no geometry.

**Why no new packet.** `INV_BUTTOND` is single-component by construction: the client sends `(comId, srcSlot, dstSlot, mode)` at `:4643-4647` and `InvButtonDHandler` reads exactly those and refuses any `targetSlot` failing `inv.validSlot`, so a sentinel such as `240 + tab` is dropped before any script runs. But once the tab sizes are client-side the drop target reduces to a **slot**, and `dropSlotForTab` computes it. The patch sets `hoveredSlot` and `hoveredSlotComId` and the existing send fires unchanged. `bank.rs2`'s `[inv_buttond,bank_main:inv]` (Task 5) sees a cross-tab move and routes it into `~banktab_move`.

**The one thing that does NOT fire unchanged is the optimistic local move**, and Step 3b is why. The release path at `:4609-4615` computes `let mode = 0; if (this.bankArrangeMode == 1 && com.clientCode == ClientCode.CC_BANKMODE) { mode = 1; } if (com.linkObjType && com.linkObjType[this.hoveredSlot] <= 0) { mode = 0; }` and then moves the client's own copy: `mode == 1` shifts the run (`:4626-4640`), anything else calls `com.swapSlots(...)` (`:4641`). Ruling R15 makes the SERVER treat every cross-tab drag as an insert whatever `%bankinsert` says, and the mode byte never reaches RuneScript. So a player in Swap mode who drops on a tab header would see the client swap two items while the server shifts a run, and the same happens in Insert mode whenever the resolved target slot is empty, because that forces `mode = 0`. Two different layouts for a tick, until the server's `inv` update corrects it. Step 3b forces the local branch to the shift the server will perform.

**Files:**
- Modify: `client/src/client/Client.ts`
- Modify: `client/src/client/MiniMenuAction.ts`
- Modify: `client/PATCHES.md`

**Interfaces:**
- Consumes: `bankTabSizes` from Task 7; `dropSlotForTab`, `lastOccupied`, `tabOfComponentClientCode` from Task 6. Nothing from Task 8.
- Produces: the behaviour Task 11 asserts, and nothing another task consumes.

- [ ] **Step 1: Add the menu action**

In `client/src/client/MiniMenuAction.ts`, at the end of the enum:

```ts
    // idlescape patch 31: "Move to tab N" in the bank. Not an upstream opcode; the value is
    // chosen above every existing one so it cannot collide with a real action id.
    BANK_MOVE_TO_TAB = 1900,
```

- [ ] **Step 2: Add the two helpers**

Beside patch 30's methods:

```ts
    // idlescape patch 31: the tab under the cursor at drag release, or -1. buildMinimenu()
    // has just run with the drag cleared, so the full menu for whatever is under the pointer
    // exists and a tab header is in it as a SELECT_BUTTON carrying its component id in
    // menuParamC. Scanning that is the whole hit test.
    private bankTabUnderMenu(): number {
        for (let i: number = 0; i < this.menuNumEntries; i++) {
            if (this.menuAction[i] !== MiniMenuAction.SELECT_BUTTON) {
                continue;
            }
            const com: IfType = IfType.list[this.menuParamC[i]];
            const tab: number = tabOfComponentClientCode(com ? com.clientCode : 0);
            if (tab >= 0) {
                return tab;
            }
        }
        return -1;
    }

    // idlescape patch 31: the real slot an INV_BUTTOND must name for "move srcSlot into tab".
    // -1 for no move: the same tab, an empty destination tab (the client cannot create one,
    // that stays web-only in v1) or a target that is the source slot itself.
    private bankTabDropSlot(child: IfType, srcSlot: number, tab: number): number {
        if (!child.linkObjType) {
            return -1;
        }
        const used: number = lastOccupied(child.linkObjType, child.width * child.height);
        return dropSlotForTab(srcSlot, tab, this.bankTabSizes(), used);
    }
```

- [ ] **Step 3: Patch the drag release**

At `Client.ts:4605`, immediately after `this.buildMinimenu();` and before the `if (this.hoveredSlotComId === this.objDragComId && ...)` test at `:4607`:

```ts
            // idlescape patch 31: a drop on a bank tab header. Resolving it to a real slot is
            // what lets the existing INV_BUTTOND send below carry it; InvButtonDHandler refuses
            // any targetSlot outside inv.validSlot, so there is no sentinel to send.
            const dropTab: number = this.bankTabUnderMenu();
            this.bankTabDrop = false;
            if (dropTab >= 0 && this.objDragComId !== -1) {
                const dragged: IfType = IfType.list[this.objDragComId];
                if (dragged && dragged.clientCode === ClientCode.CC_BANKMODE) {
                    const target: number = this.bankTabDropSlot(dragged, this.objDragSlot, dropTab);
                    if (target >= 0) {
                        this.hoveredSlot = target;
                        this.hoveredSlotComId = this.objDragComId;
                        this.bankTabDrop = true;
                    }
                }
            }
```

with the flag declared beside patch 29's field:

```ts
    // idlescape patch 31: set for exactly one drag release, when that release resolved to a
    // bank tab header. Read by the mode computation immediately below it; see step 3b.
    private bankTabDrop: boolean = false;
```

- [ ] **Step 3b: Make the optimistic local move agree with what the server will do**

`mode` is computed at `Client.ts:4609-4615` and decides whether the client shifts a run or swaps two slots before the packet even leaves. For a cross-tab drop the server always shifts (ruling R15), and the mode byte never reaches RuneScript, so the client must not be allowed to choose swap. Two cases would: a player in Swap mode (`bankArrangeMode !== 1`), and any drop whose resolved target slot happens to be empty, which forces `mode = 0` on the line after.

Immediately after the existing `if (com.linkObjType && com.linkObjType[this.hoveredSlot] <= 0) { mode = 0; }` at `:4612-4614`, add:

```ts
                        // idlescape patch 31: a drop on a tab header is always an insert. The
                        // mode byte does not reach RuneScript, so bank.rs2 decides on whether
                        // the two slots cross a tab boundary and will SHIFT (SP8c ruling R15).
                        // Without this the client would swap locally while the server shifted,
                        // and the pane would show a different layout until the next inv update.
                        if (this.bankTabDrop) {
                            mode = 1;
                        }
```

`mode` is declared with `let` at `:4609`, so this is an assignment and not a redeclaration. The flag is cleared at the top of every release (step 3), so it can never leak into an ordinary within-pane drag. Record the divergence and this fix in `client/PATCHES.md` beside patch 31, and in R15's cost line.

- [ ] **Step 4: Add the "Move to tab N" menu entries**

In `addComponentOptions`'s inv branch, after the five-`iop` loop closes (`Client.ts:12165-12188`) and before the `Examine` entry at `:12190`:

```ts
                            // idlescape patch 31: "Move to tab N". The bank's five interface
                            // op slots are all Withdraws and there is no sixth, so this cannot
                            // be a content option; SP8b spec section 7's content-only move path
                            // does not exist at revision 274 (SP8c plan ruling R3). The entry
                            // dispatches through the existing INV_BUTTOND wire in doAction().
                            if (child.clientCode === ClientCode.CC_BANKMODE) {
                                const sizes: number[] = this.bankTabSizes();
                                for (let tab: number = sizes.length; tab >= 0; tab--) {
                                    if (this.bankTabDropSlot(child, slot, tab) < 0) {
                                        continue;
                                    }
                                    this.menuOption[this.menuNumEntries] = (tab === 0 ? 'Move to main tab' : 'Move to tab ' + tab) + ' @lre@' + obj.name;
                                    this.menuAction[this.menuNumEntries] = MiniMenuAction.BANK_MOVE_TO_TAB;
                                    this.menuParamA[this.menuNumEntries] = tab;
                                    this.menuParamB[this.menuNumEntries] = slot;
                                    this.menuParamC[this.menuNumEntries] = child.id;
                                    this.menuNumEntries++;
                                }
                            }
```

"Move to main tab" rather than "Move to tab 0" because tab 0 is the tail, not a numbered tab; the web bank calls it "All items" as a view and the engine calls it the main tab as a target (`engine-custom/PATCHES.md:641`). The loop counts **down** so the flat menu reads tab 1 first, matching the five `iop` entries directly above it, which are also built in reverse.

- [ ] **Step 5: Dispatch it**

In `doAction(optionId)` (`Client.ts:10954`, with `action`, `a`, `b`, `c` bound at `:10964-10967`), beside the `SELECT_BUTTON` branch at `:11577`:

```ts
        if (action === MiniMenuAction.BANK_MOVE_TO_TAB) {
            // idlescape patch 31. a = destination tab, b = source slot, c = component id.
            const child: IfType = IfType.list[c];
            const target: number = child ? this.bankTabDropSlot(child, b, a) : -1;
            if (target >= 0) {
                this.out.p1Enc(ClientProt.INV_BUTTOND);
                this.out.p2(c);
                this.out.p2(b);
                this.out.p2(target);
                this.out.p1(1);
            }
        }
```

The target is recomputed here rather than carried in the menu, because the menu can be a frame old and `menuParamA/B/C` are the only three slots available. `mode` is `1`, matching the existing send at `:4646`; `bank.rs2` branches on whether the two slots cross a tab boundary rather than on the mode byte, which never reaches RuneScript (ruling R15).

- [ ] **Step 6: Typecheck and build**

```
cd client
~/.bun/bin/bun run typecheck
~/.bun/bin/bun test src/hooks
~/.bun/bin/bun run build:dev
```

- [ ] **Step 7: Drive it by hand on the live stack**

Rebuild the client, reload the page, `::~bank_f2p` (not `::~bank_preset`; Task 4 step 9), seed `banktab_size_1 = 10` and `banktab_size_2 = 12`, `::~bank`.

1. **Right-click an item in tab 1**: the menu carries the five Withdraws, then "Move to tab 2", then "Move to main tab", then Examine. It does **not** carry "Move to tab 1".
2. **Choose "Move to tab 2"**: the item leaves tab 1 and appears at the end of tab 2. Confirm the sizes with the management port (`GET http://127.0.0.1:8897/owner/<key>/bank`): tab 1 is 9, tab 2 is 13.
3. **Drag an item onto the tab 3 header, once in Insert mode and once in Swap mode**: the same result into tab 3 both times, and in Swap mode **watch the pane at the moment of release**. Nothing should flicker into a swapped layout and then correct itself; that flicker is step 3b missing. If tab 3's size is 0, nothing happens and no packet is sent, which is the empty-tab refusal.
4. **Drag an item within a tab, immediately after item 3**: unchanged behaviour, honouring Swap/Insert. Doing it straight after the tab drop is the check that `bankTabDrop` was cleared.
5. **Open the web bank**: the new layout is there within a tick and a half, and the tab icons match.
6. **Drag an item in a NON-bank inventory** (the player inventory, the side panel): unchanged. This is the regression check for `bankTabUnderMenu` firing where it should not.

- [ ] **Step 8: Record the patch**

````markdown
## Patch 31 verification

```patches-check
root: client
patch 31 | contains | 1 | src/client/Client.ts | private bankTabUnderMenu(): number {
patch 31 | contains | 1 | src/client/Client.ts | private bankTabDropSlot(child: IfType, srcSlot: number, tab: number): number {
patch 31 | contains | 2 | src/client/Client.ts | MiniMenuAction.BANK_MOVE_TO_TAB
patch 31 | contains | 1 | src/client/MiniMenuAction.ts | BANK_MOVE_TO_TAB = 1900,
patch 31 | contains | 1 | src/client/Client.ts | const dropTab: number = this.bankTabUnderMenu();
patch 31 | contains | 3 | src/client/Client.ts | this.bankTabDrop
```

The count of **2** on `MiniMenuAction.BANK_MOVE_TO_TAB` is this patch's polarity check: one is
the menu entry in `addComponentOptions`, one is the dispatch in `doAction`. Either alone is a
menu entry that does nothing, or a dead branch, and both compile.

The count of **3** on `this.bankTabDrop` is the second one, and it is about a divergence rather
than a dead branch. The three are the clear at the top of the drag release, the set when a drop
resolves to a tab header, and the read in the mode computation. Drop the read and the client
still sends the right packet, so every automated check passes, but a player in Swap mode sees
the client SWAP two items while the server SHIFTS a run, because the mode byte never reaches
RuneScript and `bank.rs2` decides on the tab boundary instead (SP8c ruling R15). The wrong
layout stands until the server's next inv update overwrites it, which reads as a client bug.
Drop the clear and the flag leaks into the next ordinary within-pane drag, forcing an insert on
a player who chose swap.
````

and a table row:

```
| 31 | `MiniMenuAction` (one new value), the drag-release block in `mousePressed` handling including its `mode` computation, `addComponentOptions()`'s inv branch, `doAction()`, one new private field and two new private methods beside patch 30's | **SP8c move-to-tab.** A drop on a bank tab header and a right-click "Move to tab N" both resolve to a real slot inside the destination tab and go out on the existing `INV_BUTTOND` wire: no new packet, because `InvButtonDHandler` refuses any `targetSlot` outside `inv.validSlot`, so a sentinel is dead on arrival. The drop hit test is a scan of the mini-menu, which `Client.ts:4601-4605` has already rebuilt with the drag cleared, so no draw-time geometry is captured. Content-only right-click is impossible at 274 (a `TYPE_INV` component carries five interface ops and `bank_main:inv` spends all five on Withdraw), which is why this is a patch and not RuneScript; see the SP8c plan, ruling R3. | `private bankTabUnderMenu(): number` |
```

- [ ] **Step 9: Mutation-to-test table**

| Change I made to break it | What must fail | Did it? |
|---|---|---|
| Remove the `dragged.clientCode === ClientCode.CC_BANKMODE` guard | Step 7 item 6: dragging in the player inventory starts behaving oddly near an open bank | |
| Send `mode` `0` instead of `1` in `doAction` | Nothing visible, because `bank.rs2` ignores the mode byte. **Documented, not tested**: this is why ruling R15 puts the decision in RuneScript and not in the packet | |
| Drop step 3b's `if (this.bankTabDrop) { mode = 1; }` | Step 7 item 3 **with Swap mode selected**: the pane briefly shows the two items swapped instead of shifted, then corrects itself when the server's inv update lands. Run this one with the bottom bar on Swap, or it cannot fail | |
| Drop the `this.bankTabDrop = false;` clear | Step 7 item 4 in Swap mode, on the drag immediately after a tab drop: it inserts instead of swapping | |
| Drop the `doAction` branch | Step 7 item 2: the menu entry appears and does nothing; `grep -c MiniMenuAction.BANK_MOVE_TO_TAB` reads 1 | |
| Count the menu loop up instead of down | Step 7 item 1: the entries read tab 9 first | |
| Return `slot` from `bankTabDropSlot` when the tab is empty | Step 7 item 3: an item vanishes into an undeclared tab | |

- [ ] **Step 10: Run the greps and commit**

```bash
git add client/src/client/Client.ts client/src/client/MiniMenuAction.ts client/PATCHES.md
git -c core.safecrlf=false commit -m "feat(client): patch 31, drag onto a bank tab and Move to tab N

Content-only right-click move does not exist at 274: a TYPE_INV component carries five
interface ops and bank_main:inv spends all five on Withdraw, so the move path has to be a
client patch. Both the drop and the menu entry resolve to a real slot inside the destination
tab and go out on the existing INV_BUTTOND wire, because InvButtonDHandler refuses any
targetSlot outside inv.validSlot. The drop hit test is a scan of the mini-menu the release
path has already rebuilt with the drag cleared, so no draw-time geometry is captured.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---
## Task 10: The deferrals, with reasons and rows

Four things this entry deliberately does not build. Each gets a row so it is a backlog item rather than a silence, which is what produced eleven of the audit's thirty-four findings.

**Files:**
- Modify: `docs/superpowers/sprint-control.md`
- Modify: `docs/superpowers/specs/2026-09-05-sp8b-web-bank-design.md`
- Modify: `engine-custom/PATCHES.md`

**Interfaces:** none. This task ships prose and rows.

- [ ] **Step 1: Write the D5 record into `engine-custom/PATCHES.md`**

D5 is re-deferred (ruling R7), and the reason is a seam the SP8b spec's one-line promise missed. It goes in `engine-custom/PATCHES.md` beside the owner bank semantics, because that is where the next person to attempt placeholders will look. Add a new section after "Owner bank semantics":

```markdown
## Placeholders: why they are not an Inventory change alone

SP8b's spec deferred bank placeholders (D5) as "an `Inventory` change in the engine (a
zero-count slot that keeps its id), i.e. an engine overlay patch, plus RuneScript". SP8c
surveyed it and re-deferred it (SP8c plan ruling R7). There are four seams, not one.

1. **The engine `Inventory`.** `engine/server/src/engine/Inventory.ts` nulls a slot in two
   places, the main loop and the skipped-indices loop, both
   `if (curItem.count == 0 && !stockObj) { this.items[i] = null; }`. A placeholder keeps
   `{ id, count: 0 }` there. The file is 246 lines and is an `anchors` entry in
   `engine-custom/manifest.json` today; at that size it fits under the ceiling as a whole-file
   `replace`, which is cleaner than a runtime prototype patch over a sixty-line method.
2. **The owner bank store, which treats a zero count as corruption.** `readBankFile`
   (`src/idlescape/ownerBankFile.ts`) accepts a slot only when
   `Number.isInteger(slot.count) && slot.count > 0`; anything else increments `rejected`, and
   the store answers a rejection by SUSPENDING WRITES for that owner. `slotsOf` writes any
   non-null item, count 0 included. So the first placeholder written suspends that owner's
   bank on the next reload. Placeholders are an `OwnerBankFile` FORMAT change, versioned, not
   a validation tweak.
3. **Everything downstream of `BankSlotDto`.** Its comment ("One occupied bank slot. Empty
   slots are absent"), `ops.ts`'s `lastUsedSlot` (which counts any non-null item),
   `server/src/types.ts`'s `BankSlot`, and `web/src/bank/`'s idea of an occupied slot all move
   with the format.
4. **The wire and the draw.** `UpdateInvPartialEncoder` already sends `p2(id + 1)` and `p1(0)`
   for a count-0 item and the client draws any slot whose `linkObjType[slot] > 0`, so a
   placeholder renders as a normal icon for free. Drawing it faded, as OSRS does, is a further
   client patch.

**The `.sav` is not the obstacle.** `Player.save()` writes `p2(obj.id + 1)` then a count with
255 escaping to `p4`, and `PlayerLoading.load` reads `g2() - 1` and skips only id `-1`. A
`{ id, count: 0 }` slot round-trips exactly.

**What SP8c did instead.** `~banktab_recount` in `content-custom/scripts/interface_bank/scripts/bank.rs2`
recomputes each tab's size from the occupied slots in its own range before every
`~reorganize_inv` and after every withdraw. That is the same layout compaction produces, so
tabs stay aligned without placeholders. It becomes a no-op the day placeholders land.
```

- [ ] **Step 2: Add four backlog rows to `docs/superpowers/sprint-control.md`**

Under "Queue, in order, with prerequisites", or in whatever backlog table that section carries at execution time, add:

```
| Bank placeholders and fillers (SP8b D5) | Not entry 8. It is a versioned `OwnerBankFile` format change spanning the engine `Inventory`, the owner store, `server/src/types.ts` and `web/src/bank/`, plus RuneScript and a client fade patch, not the game client's bank tabs. The four seams are written up in `engine-custom/PATCHES.md`, "Placeholders: why they are not an Inventory change alone". Entry 8 shipped `~banktab_recount` instead, which keeps the tab sizes correct without them. | after entry 8; a sub-project of its own |
| In-game bank search | Not entry 8. `p_stringentry` does not exist at revision 274 (there is no `P_STRINGENTRY` opcode and the only resume packets are `RESUME_PAUSEBUTTON` and `RESUME_P_COUNTDIALOG`), so SP8b spec section 7's content-only prompt is not buildable. The route that works is client-side highlighting: the client already owns a free-text field (`socialInputOpen` / `socialInput` / `socialInputType` at `Client.ts:592-595`, types 1 to 5 taken, 6 onward free), and the dimming goes in the same draw loop patch 30 already touches. No packet, no engine change, one extra `bank_main.if` button. | after entry 8; one numbered client patch |
| Creating a bank tab in game | Not entry 8. The client can move an item between EXISTING tabs, because the move rides `INV_BUTTOND` to a real slot and `InvButtonDHandler` refuses any `targetSlot` outside `inv.validSlot`; there is no real slot inside a tab that does not exist yet. Creating a tab stays web-only in v1 (the web bank's "+" tab, `web/src/bank/view.ts:166-172`). The cheapest fix is a tenth-plus-one `bank_main.if` component whose `if_button` handler calls `~banktab_setsize` on the first undeclared tab. | after entry 8; small, content plus one menu entry |
| A shared withdraw-quantity default (SP8b spec section 7 row 7, the withdraw-X half) | Not entry 8. Row 7 bundles three things: the item/note toggle already exists and is bound at `bank.rs2:12-15`, entry 8 built `bank_main:deposit_inv` and `bank_main:deposit_worn`, and this third one is left. **There is no quantity-default varp at all in 274**; the game's two bank toggles are `bankcert` (115) and `bankinsert` (304). The web's "1 5 10 X All" buttons are per-browser today (`cs.bank.qty`, `web/src/bank/view.ts:42-44`) and SP8c ruling R9 leaves them there. The route, if the owner wants the two banks to agree: one more `transmit=yes` varp beside SP8c's ten (clientcode 20 is the next free one), one field on the owner bank contract, and `cs.bank.qty` writing through to it. | after entry 8; small, one varp plus one contract field |
```

Set row 8's state in the entry table to whatever the landing task (Task 12) leaves; this step only adds the backlog.

- [ ] **Step 3: Correct the two spec rows the survey found wrong**

In `docs/superpowers/specs/2026-09-05-sp8b-web-bank-design.md`, edit section 7's table in place, marking each edit as an SP8c correction so the original claim is still legible:

- Row 4 (drag onto a tab header): replace "right-click Move to tab N, content-only" with a note that a `TYPE_INV` component carries five interface ops and `bank_main:inv` spends all five on Withdraw, so the move path is client patch 31. Cite `Client.ts:12165-12181`.
- Row 6 (search): replace the `p_stringentry` claim with "no such command exists at 274", and point at the backlog row from Step 2.
- Row 7: the row bundles three things and the rewrite must answer all three, because a half-answered row is what the deferral rows exist to prevent. Replace "Already present or content-only" with: the item/note toggle **is** already present and bound at `bank.rs2:12-15`; deposit inventory and deposit worn did **not** exist and SP8c added `bank_main:deposit_inv` and `bank_main:deposit_worn` (note that this row contradicted the spec's own line 39, which was right); and the withdraw-X memory is **neither**, because no quantity-default varp exists at 274 - it is re-deferred, with SP8c ruling R9 and the fourth backlog row from Step 2 naming the route.
- Row 8 (placeholders): point at `engine-custom/PATCHES.md`'s new section and the backlog row.
- Row 2 (per-tab item pane): add that the game client compacts a tab to the top left while the web bank pads to the row boundary, so the same tab is laid out differently in the two banks on purpose. Cite SP8c ruling R16.

Also correct section 3 line 60 (ruling R9): the quantity buttons do **not** set the in-game withdraw-X default, there is no varp for it, and the three `cs.bank.*` keys are per-browser parity controls.

- [ ] **Step 4: Verify and commit**

No code changed, so verification is a read-back: confirm each of the five section 7 rows now says what the code says, that no element of row 7 is left unanswered, and that the four backlog rows carry a reason a stranger can act on. Then:

```bash
git add engine-custom/PATCHES.md docs/superpowers/sprint-control.md docs/superpowers/specs/2026-09-05-sp8b-web-bank-design.md
git -c core.safecrlf=false commit -m "docs(sp8c): record the four deferrals with their reasons and rows

Placeholders (SP8b D5) are re-deferred with the seam the one-line promise missed: the owner
bank store rejects a zero count and answers a rejection by suspending writes for that owner,
so placeholders are a versioned OwnerBankFile format change across four packages, not an
Inventory change. In-game search is re-deferred because p_stringentry does not exist at 274,
with the client-side highlight route recorded so nobody rediscovers it. Creating a tab in
game stays web-only, and the withdraw-X half of row 7 gets its own row rather than being left
half answered. Corrects the five section 7 rows the survey found wrong.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 11: Playwright - the tabs, in the real client, against the real stack

The unit tests carry the arithmetic. This spec carries the three claims no unit test can reach: **the varps arrive**, **the draw follows them**, and **an in-game change reaches the owner store**.

**What the harness already gives us.** `web/e2e/helpers.ts:173-176` (`canvasClick`, native 789x532 coordinates through the same-origin `/play.html` iframe located at `:164`, right-click supported), `:183-193` (`canvasPixels`, real pixel sampling off the canvas 2D context), `:42-44` (`clientState`), `:234-262` (`managementContext`, `MANAGEMENT`, `MANAGEMENT_SECRET`, `idTokenFor`), `:277-283` (`readBank`), `:284-295` (`signUpAndPlay`). `web/e2e/harness.ts:18-19` holds a module-private `cheat(page, message)` that routes a `::` message through `window.idlescape.tasks.dispatch({ type: 'say' })`, and `:46-56` (`leaveTutorial`) already uses `::~death` the same way.

**The obstacle, and how it is solved.** Nothing in the harness could open the in-game bank: seeding over the management port fills the container without opening `bank_main`, and the e2e characters spawn nowhere near a booth. `[debugproc,bank]` (`engine/content/scripts/_test/scripts/cheats/cheat_bank.rs2:1-7`) opens it where the character stands, `world.json:13` has `node.debug: true`, and the debugproc prefix is `~`. **So `::~bank` is the opener and no new content is needed.** `::~bank` starts with `if_close;`, so calling it twice closes and reopens, which is exactly what the recount test needs.

**The filler is `::~bank_f2p`, and it is NOT `::~bank_preset`.** This matters enough to be a rule for every by-hand step in this plan as well as for the spec. `[debugproc,bank_preset]` (`cheat_bank.rs2:9-16`) is:

```
[debugproc,bank_preset]
if_close;
if (p_finduid(uid) = true) {
    def_int $choice = ~p_choice2_header("Yes.", 1, "No.", 2, "This clears your bank. Continue?");
    if ($choice = 2) { return; }
    inv_clear(bank);
    inv_add(bank, coins, ^max_32bit_int);
    ...
```

It **suspends on a two-option chat modal and adds nothing at all** until someone answers it with a `RESUME_PAUSEBUTTON`. A spec that fires it and asserts immediately is asserting about an empty bank, and the `::~bank` that follows aborts the suspended script with its own `if_close`. The same trap catches `magicbank`, `fmbank`, `foodbank`, `fletchbank` and `wptest`.

`[debugproc,bank_f2p]` (`cheat_bank.rs2:206-278`) has **no dialogue**: `if_close`, the uid check, `inv_clear(bank)` and then about sixty-five `inv_add` calls in a fixed order, so it fills deterministically and synchronously. `[debugproc,clearbank]` is likewise dialogue-free, for a test that wants an empty bank. **The tab LAYOUT is still seeded through the management port**, with a `setTabs` op, because that is the web bank's own path and the one this entry has to prove reaches the client.

**The op is `{ op: 'setTabs', sizes: [...] }`.** `normaliseOp` is `isIntArray(r.sizes) ? { op: 'setTabs', sizes: [...r.sizes] } : null` (`engine-custom/src/idlescape/ops.ts:78-79`) and the type is `{ op: 'setTabs'; sizes: number[] }` (`types.ts:26`). A field named `tabs` answers `null` and the whole batch is refused.

**Files:**
- Create: `web/e2e/bank-tabs.pw.test.ts`
- Modify: `web/e2e/harness.ts` (export `cheat`)

**Interfaces:**
- Consumes: everything the content and client tasks built.
- Produces: nothing another task consumes.

- [ ] **Step 1: Export `cheat`**

In `web/e2e/harness.ts`, change:
```ts
const cheat = (page: Page, message: string): Promise<unknown> =>
```
to:
```ts
export const cheat = (page: Page, message: string): Promise<unknown> =>
```
Nothing else moves; `leaveTutorial` and `seedCharacter` keep using it.

- [ ] **Step 2: Measure the bank window's canvas rectangle, once, and write it down**

`Client.ts:7238` draws the main modal with `this.drawInterface(IfType.list[this.mainModalId], 0, 0, 0)`, so `bank_main`'s components carry their own coordinates, but the viewport those land in is blitted into the 789x532 canvas at an offset this plan does not assert from memory. **Measure it.**

Bring up the stack, log in, `::~bank_f2p`, `::~bank`, and from `web/`:
```
npx playwright test bank-tabs --headed --debug
```
or simply take a screenshot inside a scratch spec (`await page.screenshot({ path: 'bank.png' })`) and read the pixel coordinates of the item pane's top-left corner and of the first tab button out of the image. **Take a second screenshot with a right-click menu open over a bank slot** and read `MENU.dx`, `MENU.dy` and `MENU.pitch` off it in the same pass. Write the numbers into the spec as:

```ts
/**
 * The canvas offset of bank_main's own coordinate space, measured on 2026-09-XX against the
 * 789x532 canvas by screenshotting an open bank and reading the pane's corner. Client.ts:7238
 * draws the main modal at (0, 0) of the interface's own space; this constant is the blit
 * offset of the game viewport inside the canvas. If the client's viewport layout ever changes,
 * this is the one number in the spec that has to move, and the failure is a pixel assertion
 * that reads background where it expected an item.
 */
const BANK_ORIGIN = { x: <measured>, y: <measured> } as const;
const MENU = { dx: <measured>, dy: <measured>, pitch: <measured> } as const;
```
**Do not guess these.** A guessed offset produces a spec that samples background forever and passes every assertion phrased as "something changed"; Step 5's `BANK_ORIGIN` mutation row is what proves the measured ones are right.

- [ ] **Step 3: Write the spec**

Create `web/e2e/bank-tabs.pw.test.ts`:

```ts
// SP8c: the game client's bank tabs, against the live stack. Four claims live here and nowhere
// else: the nine banktab_size varps actually reach the client (they did not before SP8c task 1,
// and no unit test can see it), the draw follows the selected-tab varp, BOTH inv loops were
// patched so a right-click with a tab selected names the item that is drawn, and a layout put
// into the shared owner store reaches a character at LOGIN.
//
// SEEDING IS ::~bank_f2p, NEVER ::~bank_preset. bank_preset (cheat_bank.rs2:9-16) opens a
// two-option chat modal and adds nothing until it is answered, so a spec that fires it and
// asserts is asserting about an empty bank, and the ::~bank after it aborts the suspended
// script. bank_f2p (:206-278) has no dialogue: if_close, the uid check, inv_clear and about
// sixty-five inv_add calls in a fixed order.
//
// THE TAB LAYOUT IS SEEDED THROUGH THE MANAGEMENT PORT, with { op: 'setTabs', sizes: [...] }.
// The field is `sizes`; `tabs` is not a field any op carries and normaliseOp answers null for
// it (engine-custom/src/idlescape/ops.ts:78-79), which refuses the whole batch. The URL is
// absolute: managementContext() carries the secret and no baseURL (helpers.ts:250-253), so a
// relative path does not resolve to the management port.
import { expect, test, type Page } from '@playwright/test';
import {
  MANAGEMENT,
  MANAGEMENT_SECRET,
  canvasClick,
  canvasPixels,
  clientState,
  createCharacterFromPanel,
  idTokenFor,
  managementContext,
  pressTitleLogin,
  readBank,
  sessionStates,
  signUpAndPlay,
  uniqueName
} from './helpers';
import { cheat, leaveTutorial } from './harness';

const BANK_ORIGIN = { x: 0, y: 0 } as const; // replaced by Step 2's measurement

/** Eight columns, 47 px pitch; the pane at 38 px rows, from the inv's y=3 inside com_92. */
const PANE = { x: BANK_ORIGIN.x + 37 + 38, y: BANK_ORIGIN.y + 91 + 3, dx: 47, dy: 38 } as const;

/**
 * The client draws its mini-menu on the canvas, not in the DOM, so an entry is chosen by
 * position. `dx` and `dy` are the offset from the click point to the centre of the FIRST entry
 * and `pitch` is the row height, all measured the same way as BANK_ORIGIN in step 2. The five
 * Withdraws are built in reverse, so "Withdraw All" is the fourth of them, index 3.
 */
const MENU = { dx: 0, dy: 0, pitch: 0 } as const; // replaced by Step 2's measurement

function cellPoints(count: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let cell = 0; cell < count; cell++) {
    points.push({
      x: PANE.x + (cell % 8) * PANE.dx + 16,
      y: PANE.y + Math.trunc(cell / 8) * PANE.dy + 16
    });
  }
  return points;
}

/** The strip of cells every readiness poll and every assertion samples. */
const PROBE = 24;

/**
 * Opens the bank and waits until the pane has actually been painted.
 *
 * It polls for the sampled strip to CHANGE, not for it to stop being black. Before the bank
 * opens these points show the 3D world viewport, which is never pure black, so a poll phrased
 * as `not.toBe('0,0,0')` is satisfied on its first sample whether or not bank_main ever opened,
 * and every assertion after it races the interface open. Comparing against what was there
 * immediately before the cheat cannot pass early.
 */
async function openBank(page: Page): Promise<void> {
  const before = (await canvasPixels(page, cellPoints(PROBE))).join('|');
  await cheat(page, '::~bank');
  await expect
    .poll(() => canvasPixels(page, cellPoints(PROBE)).then(p => p.join('|')), {
      timeout: 20_000,
      message: 'the bank interface paints over the world viewport'
    })
    .not.toBe(before);
}

/**
 * Waits for the in-game fill to have reached the shared store and settled.
 *
 * ::~bank_f2p writes the bank in game, and the overlay's once-per-tick sweep carries that into
 * the owner store and bumps the version. An apply issued against a version read while that is
 * still moving is refused with a 409, so every setTabs below waits for the version to hold
 * still across two reads a tick and a half apart before it takes one.
 */
async function settledBank(page: Page, token: string): Promise<{ ownerKey: string; version: number }> {
  let last = -1;
  await expect
    .poll(
      async () => {
        const bank = await readBank(page, token);
        const stable = bank.slots.length > 0 && bank.version === last;
        last = bank.version;
        return stable;
      },
      { timeout: 30_000, intervals: [1_500], message: 'the in-game fill reaches the owner store and stops moving' }
    )
    .toBe(true);
  const bank = await readBank(page, token);
  return { ownerKey: bank.ownerKey, version: bank.version };
}

/** Puts a tab layout into the shared owner store, the way the web bank does. */
async function setTabs(page: Page, token: string, sizes: number[]): Promise<void> {
  const { ownerKey, version } = await settledBank(page, token);
  const mgmt = await managementContext();
  try {
    const res = await mgmt.post(`${MANAGEMENT}/owner/${ownerKey}/bank/apply`, {
      data: { expectedVersion: version, ops: [{ op: 'setTabs', sizes }] }
    });
    // A 409 here means the version moved between the settle and the post, which the retry
    // takes at the version the engine handed back. A 400 means the op shape is wrong, and the
    // body says which field; that is not something to retry.
    if (res.status() === 409) {
      const conflict = (await res.json()) as { version: number };
      const retry = await mgmt.post(`${MANAGEMENT}/owner/${ownerKey}/bank/apply`, {
        data: { expectedVersion: conflict.version, ops: [{ op: 'setTabs', sizes }] }
      });
      expect(retry.status(), await retry.text()).toBe(200);
    } else {
      expect(res.status(), await res.text()).toBe(200);
    }
  } finally {
    await mgmt.dispose();
  }
  await expect.poll(async () => (await readBank(page, token)).tabs, { timeout: 20_000 }).toEqual(sizes);
}

test.describe('SP8c bank tabs', () => {
  test.skip(MANAGEMENT_SECRET === '', 'ENGINE_MANAGEMENT_SECRET is not configured for this stack');

  test('the selected-tab varp changes what the bank pane draws', async ({ page }) => {
    await signUpAndPlay(page, uniqueName('sp8c_'), uniqueName('c'));
    await leaveTutorial(page);
    await cheat(page, '::~bank_f2p');
    await cheat(page, '::setvar banktab_size_1 10');
    await cheat(page, '::setvar banktab_size_2 12');
    await openBank(page);

    const allItems = await canvasPixels(page, cellPoints(PROBE));
    expect(new Set(allItems).size).toBeGreaterThan(1); // the pane is not uniformly background

    await cheat(page, '::setvar banktab 1');
    await expect.poll(() => canvasPixels(page, cellPoints(PROBE)).then(p => p.join('|')), { timeout: 10_000 })
      .not.toBe(allItems.join('|'));

    const tabOne = await canvasPixels(page, cellPoints(PROBE));
    // Tab 1 holds ten slots, so cells 10 to 23 are empty-slot background and cells 0 to 9 are not.
    expect(new Set(tabOne.slice(10)).size).toBe(1);
    expect(new Set(tabOne.slice(0, 10)).size).toBeGreaterThan(1);
  });

  test('an empty tab draws nothing and does not throw', async ({ page }) => {
    await signUpAndPlay(page, uniqueName('sp8c_'), uniqueName('c'));
    await leaveTutorial(page);
    await cheat(page, '::~bank_f2p');
    await cheat(page, '::setvar banktab_size_1 10');
    await openBank(page);

    await cheat(page, '::setvar banktab 9');
    await expect.poll(() => canvasPixels(page, cellPoints(16)).then(p => new Set(p).size), { timeout: 10_000 })
      .toBe(1);
    expect((await clientState(page)).loggedIn).toBe(true);
  });

  test('a right-click with a tab selected names the item that is DRAWN there', async ({ page }) => {
    // This is the spec for patch 30's second half. drawInterface paints and addComponentOptions
    // decides what a click refers to, and a patch applied to the draw loop alone compiles,
    // passes every bun test and withdraws the wrong stack. The failure is only reachable with a
    // NON-ZERO tab selected: with tab 0 selected, bankVisibleCell is the identity and reverting
    // the hit-test loop changes nothing any assertion can see.
    const email = await signUpAndPlay(page, uniqueName('sp8c_'), uniqueName('c'));
    await leaveTutorial(page);
    await cheat(page, '::~bank_f2p');
    const token = await idTokenFor(email);
    await setTabs(page, token, [10, 12]);
    await openBank(page);

    const seeded = await readBank(page, token);
    // Tab 2 is slots 10 to 21, drawn compacted, so its third item is at CELL 2 and at SLOT 12.
    const drawn = seeded.slots.find(s => s.slot === 12);
    const decoy = seeded.slots.find(s => s.slot === 2);
    expect(drawn, 'the f2p preset filled at least thirteen slots').toBeTruthy();
    expect(decoy).toBeTruthy();
    expect(drawn!.obj).not.toBe(decoy!.obj);

    await cheat(page, '::setvar banktab 2');
    await expect.poll(() => canvasPixels(page, cellPoints(PROBE)).then(p => new Set(p.slice(12)).size), { timeout: 10_000 })
      .toBe(1);

    // Withdraw the whole of cell 2's stack, then check WHICH slot left.
    const cell = cellPoints(3)[2];
    await canvasClick(page, cell.x, cell.y, 'right');
    await canvasClick(page, cell.x + MENU.dx, cell.y + MENU.dy + MENU.pitch * 3, 'left');

    await expect
      .poll(async () => (await readBank(page, token)).slots.some(s => s.obj === drawn!.obj), { timeout: 30_000 })
      .toBe(false);
    // The item at slot 2, which an unpatched hit test would have withdrawn instead, is untouched.
    expect((await readBank(page, token)).slots.some(s => s.obj === decoy!.obj)).toBe(true);
  });

  test('a withdraw that empties a slot shrinks its own tab, and the owner store agrees', async ({ page }) => {
    const email = await signUpAndPlay(page, uniqueName('sp8c_'), uniqueName('c'));
    await leaveTutorial(page);
    await cheat(page, '::~bank_f2p');
    const token = await idTokenFor(email);
    await setTabs(page, token, [10, 12]);
    await openBank(page);

    // Withdraw the whole of the fifth slot's stack: right-click, "Withdraw All".
    // Slot 4 sits at cell 4 while All items is selected.
    await cheat(page, '::setvar banktab 0');
    const cell = cellPoints(5)[4];
    await canvasClick(page, cell.x, cell.y, 'right');
    await canvasClick(page, cell.x + MENU.dx, cell.y + MENU.dy + MENU.pitch * 3, 'left');

    // Task 5 recounts AND compacts on the withdraw itself, so the store is right with no close
    // and reopen. Asserting it here rather than only after a reopen is deliberate: a reopen
    // would hide a missing ~reorganize_inv on the withdraw path.
    await expect.poll(async () => (await readBank(page, token)).tabs, { timeout: 30_000 }).toEqual([9, 12]);

    // ...and it survives the compaction a close and reopen runs twice more.
    await cheat(page, '::~bank');
    await openBank(page);
    await expect.poll(async () => (await readBank(page, token)).tabs, { timeout: 30_000 }).toEqual([9, 12]);
  });

  test('a layout in the owner store reaches a character at LOGIN, which is what transmit=yes buys', async ({ page }) => {
    // Spec section 7 row 5, "nine scope=perm varps seeded from the owner store AT LOGIN", is the
    // one row this entry inherits rather than builds, and transmit=yes is what makes it
    // observable: Player.ts:519 and :549 carry the same varp.transmit guard on the login and
    // reconnect replays that :1776 carries on setVar. Applying a layout and then looking at the
    // character that was already online would exercise SP8's PUSH-OUT path instead, which is a
    // different mechanism. So the layout is applied first and a SECOND character of the same
    // account is created and logged in fresh: the bank is per account, and that login is the
    // replay. The second-character flow is the one web/e2e/bank.pw.test.ts already uses.
    const first = uniqueName('sp8c1_');
    const email = await signUpAndPlay(page, first, first);
    await leaveTutorial(page);
    await cheat(page, '::~bank_f2p');
    const token = await idTokenFor(email);
    await setTabs(page, token, [8, 8]);

    const second = uniqueName('sp8c2_');
    await createCharacterFromPanel(page, second);
    await page.locator(`[data-char-row]:has-text("${second}") [data-char-open]`).click();
    await expect.poll(async () => (await sessionStates(page)).length, { timeout: 60_000 }).toBe(2);
    await expect.poll(async () => (await clientState(page)).loggedIn, { timeout: 30_000 }).toBe(false);
    await pressTitleLogin(page);
    // Polled on the SESSION's loggedIn, not on the facade's gameName, which is set when a login
    // is ARMED rather than when it succeeds (helpers.ts:101-113, and the race
    // characters.pw.test.ts used to lose one run in three).
    await expect.poll(async () => (await sessionStates(page)).filter(s => s.loggedIn).length, { timeout: 90_000 }).toBe(2);
    await leaveTutorial(page);

    await openBank(page);
    await cheat(page, '::setvar banktab 2');
    // Tab 2 is slots 8 to 15, so exactly eight cells are occupied and the ninth is background.
    await expect.poll(() => canvasPixels(page, cellPoints(16)).then(p => new Set(p.slice(8)).size), { timeout: 20_000 })
      .toBe(1);
  });
});
```

Three notes on the shape, each of which was wrong in an earlier draft and each of which would have shipped a spec that could not fail:

- **`canvasClick`, not `canvasClickAt`.** `helpers.ts:173` exports `canvasClick(page, x, y, button)` and there is no `canvasClickAt` anywhere in the harness. The signature already matches every call above; write the file exactly as it stands.
- **`${MANAGEMENT}/owner/...`, not `/owner/...`.** `managementContext()` (`helpers.ts:250-253`) is `newContext({ extraHTTPHeaders: { 'x-idlescape-mgmt': MANAGEMENT_SECRET } })` and sets no `baseURL`, which is why every shipped spec prefixes `MANAGEMENT` (`helpers.ts:234`, `http://127.0.0.1:8897`).
- **`MENU` is measured in Step 2, beside `BANK_ORIGIN`.** If the mini-menu proves too fragile to click reliably, replace both withdraw halves with the bot surface's `bankWithdraw` (`client/src/vendor/rs-sdk/bot/types.ts:511-512`, which assumes the interface is already open, and it is) and say so in the spec's header comment. **Do not** replace them with a management-port op: an apply does not go through the hit-test loop, which is the whole subject of the third spec.

- [ ] **Step 4: Run it**

```
powershell -File scripts/start-stack.ps1 -Prod
```
Confirm `World ready` is in `logs/engine.log` and that `http://localhost:8787/api/health` reports `engine: up` before trusting anything (`start-stack.ps1:74-76` continues with a warning when the engine never came up). Then:
```
cd web
npm run build:e2e
npx playwright test bank-tabs
```
**From `web/`, never from the repository root** (Playwright reports "No tests found" and exits 0 there), and after `build:e2e`, never after `npm run build` (the front server serves `web/dist-e2e`).

- [ ] **Step 5: Prove each test can fail**

| Change I made to break it | The test that must fail | Did it? |
|---|---|---|
| Remove `transmit=yes` from the nine varps and re-pack | `the selected-tab varp changes what the bank pane draws` (the pane never changes) | |
| Revert patch 30's hit-test loop only, leaving the draw loop patched | `a right-click with a tab selected names the item that is DRAWN there`: the click resolves to slot 2 instead of slot 12, so the `drawn` poll never goes false and the `decoy` assertion fails | |
| Remove `~banktab_recount` from `[queue,reorganize_bank]` | `a withdraw that empties a slot shrinks its own tab, ...`, on the SECOND `[9, 12]` poll, after the close and reopen | |
| Remove `~reorganize_inv(bank)` from `[label,bank_withdraw]`, keeping the recount | the same test, on the FIRST `[9, 12]` poll | |
| Point `BANK_ORIGIN` one full cell pitch off (47 px in x, 38 px in y) | `the selected-tab varp changes what the bank pane draws`, on the `tabOne.slice(10)` uniformity assertion: cell 10 now samples what cell 11 held | |
| Send `{ op: 'setTabs', tabs: [10, 12] }` instead of `sizes` | `setTabs`'s own `expect(res.status()).toBe(200)`, with the route's `bad_op` body in the message | |
| Swap `::~bank_f2p` back to `::~bank_preset` | every spec, at `openBank`'s change poll or at the first pixel assertion, because the bank is never filled | |

**Why `BANK_ORIGIN` moves a whole cell pitch and not five pixels.** A five-pixel shift inside a 47 by 38 cell still lands on item sprites, so `new Set(allItems).size > 1` stays true and the mutation passes: it proves nothing. A full pitch moves every sample onto its neighbour, which the per-cell uniformity assertions can see. Run this row deliberately; it is the one that proves the spec is measuring the bank and not a corner of the sky.

**Row 2 is the reason the third spec exists.** The earlier draft pointed this mutation at the withdraw spec, which selects tab 0 before right-clicking, and with tab 0 selected `visibleCell` is the identity, so reverting the hit-test loop changed nothing that spec observed. The mutation passed. A patch this plan calls "silently destructive" needs a spec that selects a non-zero tab, and that is the third one.

- [ ] **Step 6: Commit**

```bash
git add web/e2e/bank-tabs.pw.test.ts web/e2e/harness.ts
git -c core.safecrlf=false commit -m "test(e2e): drive the in-game bank tabs against the live stack

Five specs covering the claims no unit test reaches: the nine banktab_size varps actually
arrive in the client, the draw follows the selected-tab varp, an empty tab draws nothing
without throwing, a right-click with a non-zero tab selected names the item that is DRAWN
there (which is the only automated check that both inv loops were patched), a withdraw that
empties a slot shrinks its own tab in the shared owner bank, and a layout applied to the
owner store reaches a freshly logged-in character.

The bank is opened with ::~bank and filled with ::~bank_f2p, both debugprocs that already
exist, so no e2e-only content was added. Not ::~bank_preset: that one opens a two-option
chat modal and adds nothing until it is answered, so a spec built on it asserts about an
empty bank. Exports harness.ts's cheat helper.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 12: Landing - verify end to end, reconcile the spec, update the skills

**Files:**
- Modify: `docs/superpowers/specs/2026-09-05-sp8b-web-bank-design.md` (new section 13)
- Modify: `docs/VERIFICATION.md`
- Modify: `docs/superpowers/sprint-control.md` (row 8)
- Modify: `docs/superpowers/decisions.md`
- Modify: `.claude/skills/idlescape-content-overlay/SKILL.md`
- Modify: `.claude/skills/idlescape-client-patch/SKILL.md`
- Modify: `.claude/skills/idlescape-verify/SKILL.md` if it lists verify's steps

**Interfaces:** none.

- [ ] **Step 1: `npm run verify`, all ten steps, from the repository root**

```powershell
npm run verify
```
Expected: ten of ten green, `$TotalSteps` unchanged. Watch for the three this entry moves:
- **Step 1, the line ceiling.** `client/src/hooks/bankTabs.ts` and `bankTabs.test.ts` are the two new files inside the include list. `content-custom/**` is outside it by design (ruling R11).
- **Step 2, now titled `overlays (apply + drift check)`.** Four things this entry put there: two `manifest path(s) tracked` lines, engine-custom and content-custom (ruling R13); a `content overlay apply` sub-step; and a `content pack (BuildOverlay.ts)` sub-step. **That last one is the only automated gate the content half of this entry has**, and before Task 2 Step 7b nothing in `verify.ps1` or `build.ps1` applied the content overlay or ran the packer at all. `bankTabPack.test.ts` and `bankTabInterface.test.ts` read `bank_main.if` and `bank.rs2` as text; the packer is what compiles them.
- **Step 10, the e2e.** Task 11 adds five specs. Record the before and after counts you actually observe rather than a number quoted here: the suite's size moves between entries and a stale total in a plan is a number the next reader trusts.

If step 9 (`scripts/build.ps1`) fails on the wiki `contentSha`, that is a content bump nobody re-extracted and is **not** this entry: `content-custom/` changes do not move `scripts/upstream.lock`. Read the message before assuming.

- [ ] **Step 2: Run every `client/PATCHES.md` grep**

```powershell
powershell -File scripts/patches-check.ps1
```
if entry 3 has landed it. Otherwise, from `client/`, run each fenced block by hand: the patch 27 block, the patch 28 block, and the three new blocks for 29, 30 and 31. **Record in the handoff which route was taken and paste the counts**, especially the three that are not presence checks: `this.bankVisibleCell(child, slot)` reading 2, `MiniMenuAction.BANK_MOVE_TO_TAB` reading 2 and `this.bankTabDrop` reading 3. Note in `docs/VERIFICATION.md` whether the runner now exists.

- [ ] **Step 3: A live-stack pass over the whole feature, by hand**

Stack up, `npm run build:e2e`, browser open. Walk the list and record pass or fail for each:

1. `::~bank_f2p` (never `::~bank_preset`, which stalls on a chat modal), `::~bank`. Ten tab buttons above the pane, five rows of slots, the bottom controls unmoved, the title "The Bank of Gielinor".
2. Tab icons: each non-empty tab shows its first item at a readable size; **an empty tab shows its button with no icon**, which is the comparator on its size varp doing the work, not `if_sethide` (ruling R17).
3. The selected tab is visibly the selected one: `activecolour` on the button, `activetext` plus `activecolour` on "All". A tab that looks identical selected and unselected means the active keys were dropped.
4. Click through tabs 0 to 9. Each shows its own range, compacted to the top left. Tab 0 shows everything with a divider above each tab's first row.
5. Right-click an item in tab 1: five Withdraws, "Move to tab 2" onward, "Move to main tab", Examine. No "Move to tab 1".
6. "Move to tab 2": the item lands at the end of tab 2 and both sizes move by one.
7. Drag an item onto a tab header, **once in Insert mode and once in Swap mode**: same result both times, and no flicker into a swapped layout at the moment of release in Swap mode (patch 31 step 3b).
8. Drag onto an empty tab: nothing happens, no packet.
9. Drag within a tab, in Swap mode and in Insert mode, immediately after item 7: unchanged behaviour.
10. "Deposit inv" and "Deposit worn": the inventory and the worn gear go into the bank, no message spam.
11. Withdraw an item from the middle of tab 1. **Before closing anything**, the pane already shows tab 1 one slot smaller with no item across a boundary, and the management port agrees. Then close and reopen: unchanged.
12. Open the web bank beside it: the same tabs, the same icons, within about a tick and a half. Move a tab in the web bank: the game client's next open shows it. **Expect the two to lay a tab out differently** when its start is not a multiple of eight: the client compacts, the web pads to the row boundary. That is ruling R16, and it is the one place the two banks are meant to disagree.
13. Log out and back in: the tab sizes are still there; the selection is back to All items (ruling R6).
14. Open a NON-bank inventory and drag inside it: unchanged.

Item 12 is the entry's whole point, item 13 is the one thing only a human can check here (Task 11's login spec covers a fresh character rather than the same one returning), and item 14 is the regression check.

- [ ] **Step 4: Write spec section 13**

Append to `docs/superpowers/specs/2026-09-05-sp8b-web-bank-design.md`, in the spec's own voice, modelled on section 12. It must say what was built, what was ruled, and what a green does not cover:

```markdown
## 13. What SP8c actually shipped

SP8c shipped in three layers. The **transport**: `transmit=yes` and reserved clientcodes 11 to
19 on the nine `banktab_size_*` varps, plus a tenth varp `banktab` (id 368, clientcode 10,
`scope=temp`) for the selected tab. The **content overlay**: whole-file replacements of
`bank_main.if` (ten `buttontype=select` tab buttons each with its own separate `type=model`
icon, two deposit-all buttons, the item pane moved to `y=91 height=193`) and `bank.rs2` (the tab
arithmetic procs, the selection handlers, the `if_setobject` icon refresh, `~banktab_recount`,
the cross-tab move and the deposit-all loops), with `interface.pack`, `interface.order` and
`script.pack` newly pinned into `content-custom/pack/`. Three **numbered client patches**, 29
(varp intake by clientcode), 30 (the tab-range draw, the dividers and the scroll height, in BOTH
inv loops) and 31 (drag onto a tab header and "Move to tab N", both on the existing
`INV_BUTTOND` wire), with every piece of arithmetic in `client/src/hooks/bankTabs.ts` and
unit-tested there.

### 13.1 Rulings section 7 got wrong at revision 274

- **`p_stringentry` does not exist.** No `P_STRINGENTRY` opcode; the only resume packets are
  `RESUME_PAUSEBUTTON` and `RESUME_P_COUNTDIALOG`. Search is re-deferred with a row.
- **Content-only right-click move is impossible.** A `TYPE_INV` component carries five
  interface ops and `bank_main:inv` spends all five on Withdraw. Move-to-tab is client patch 31.
- **A tab cannot be one component.** `IF_SETOBJECT` writes `model1Type`/`model1Id`, but a
  `buttontype=select` component is ACTIVE while it is the selected tab and the active model
  branch reads `model2Type`, which nothing writes, so a single-component tab shows nothing
  exactly when it is chosen. And `if_sethide` cannot clear an empty tab's icon: `hide` is
  decoded only for `TYPE_LAYER` and read only by the two layer-entry guards. SP8c ships a
  `buttontype=select` button plus a separate non-button `type=model` icon whose own comparator
  on its size varp draws nothing when the tab is empty.
- **Every `buttontype=select` component must carry `option=`** or `buildMinimenu` emits no entry
  at all, and must declare `activecolour` (or `activegraphic`) or the selected state paints
  black.
- **The nine tab varps were never transmitted**, so SP8's entire tab layer was invisible in
  game. `transmit=yes` plus reserved clientcodes was task 1.
- **Deposit inventory and deposit worn did not exist.** Row 7 contradicted line 39, and line 39
  was right. Row 7's third element, the withdraw-X memory, is re-deferred with a row: there is
  no quantity-default varp at 274.
- **Section 3 line 60 was wrong**: the web's quantity buttons do not set the in-game
  withdraw-X default, and no such varp exists.

### 13.2 The bug section 7 did not know about

`~reorganize_inv` compacts the bank on every open and every close, and tabs are stored as
sizes, so a hole inside a tab let compaction pull the next tab's first item across with every
stored number unchanged. `~banktab_recount` fixes it; placeholders (D5) are the OSRS-faithful
fix and are re-deferred with their four seams written up in `engine-custom/PATCHES.md`.

### 13.3 What this entry costs

The in-game item pane shows five rows instead of six; capacity is unchanged at 240. Creating a
tab stays web-only. A cross-tab drag always moves, whatever Swap/Insert says. A withdraw that
empties a slot now compacts the bank immediately rather than at the next open, so items to the
right of it slide left while the player is looking; that is what keeps the tab sizes and the
slots in agreement in the same tick, including in the shared owner store.

And the two banks lay the same tab out differently on purpose (SP8c ruling R16): **the game
client compacts a tab to the top left, the web bank pads it to the row boundary and draws the
leading cells of its first row as fillers.** For tabs `[10, 12]`, tab 2's first item is at row 0
column 0 in game and at row 1 column 2 in the browser. Matching them up would mean either a
filler state the client's inv draw does not have, or changing the web, which this entry does not
touch.

### 13.4 What a green does not cover

The e2e drives five specs against one account. The mini-menu coordinates in the two withdraw
specs are measured, not derived, so a client viewport layout change breaks them. The RuneScript
and the `.if` config have no unit suite: `bankTabPack.test.ts` and `bankTabInterface.test.ts`
read them as text, and the only thing that COMPILES them is
`engine/server/tools/pack/BuildOverlay.ts`, which SP8c added to `verify.ps1`'s step 2 alongside
the content-overlay apply, because until then nothing in `verify.ps1` or `build.ps1` applied the
content overlay or packed at all. Icon zoom, tab colours and the pane geometry are judged by eye
in Task 12's by-hand pass and by nothing else. The login replay of the tab varps is covered for
a freshly created character; the same character logging out and back in is by hand (item 13).
```

- [ ] **Step 5: Append any rulings execution added to `docs/superpowers/decisions.md`**

**The planner already appended this entry's cross-entry rulings.** The first six went in with the plan: D109 (the three packs this entry pins and the six section 3 rows), D110 (move-to-tab is a client patch, contradicting the sprint's own entry 8 scope line), D111 (search re-deferred, `p_stringentry` does not exist), D112 (D5 re-deferred with its four seams, `~banktab_recount` shipped instead), D113 (a cross-tab drag always moves) and D114 (five visible rows, and tab creation stays web-only). Three more went in with the plan review: **D117** (D109's id allocation corrected to twenty-one components ending at 11004, because a tab is two components), **D118** (ruling R17, the button-plus-icon shape and why `if_sethide` and a single `type=model` select button both fail silently) and **D119** (ruling R16, the client compacts a tab while the web pads to the row boundary). Cite all nine by id in the ledger and in spec section 13 rather than restating them.

**Read the ledger before citing these ids.** Entry 3's planner was appending to the same file on the same day, and D115 and D116 are its rows, not this entry's.

Append here **only** rulings execution itself had to make: a changed pack id, a changed clientcode band, a task that had to be split or dropped, or a fallback that was taken (in-game tabs shipped view-only, `~banktab_first_obj` changed to return a found flag, the Playwright withdraw spec moved to the bot surface). **Re-read the file immediately before appending**, take the next free id after the last row, and keep the seven-column shape. If execution added none, say so in the handoff rather than appending an empty row.

- [ ] **Step 6: Update the skills that changed**

- `.claude/skills/idlescape-content-overlay/SKILL.md`: its pack table labels the entries "4, time candy" and "5, battlebots" against the sprint's current numbering of 10 and 11; fix that in passing. Add the three newly pinned packs, the `interface.order` grouping rule and the fact that it is outside the pack guard, the `interface.pack` throws-regardless-of-verify rule, the `script.pack` auto-assign rule, and the `powershell -File` invocation (the skill and `content-custom/README.md` both still say `pwsh`, which is not installed).
- `.claude/skills/idlescape-client-patch/SKILL.md`: numbering is now at 31, not 28. Add the two new polarity checks as worked examples, because they are the second and third instances of the pattern the skill already teaches from patch 27.
- `.claude/skills/idlescape-verify/SKILL.md` and `docs/VERIFICATION.md`: verify step 2 now checks both manifests. If `scripts/patches-check.ps1` exists, the `client/PATCHES.md` row moves out of tier 3's "by hand today"; if it does not, leave the row and add a line saying entry 8 shipped three more patches whose greps are written in the runner's shape.

- [ ] **Step 7: Set the board row**

In `docs/superpowers/sprint-control.md`, set row 8's state to the shape row 1 and row 2 use: tasks 1 to 12 clean, whole-branch review and fix wave done, `verify.ps1` green at `<sha>`, ledger promoted, with the three deferrals and their rows named. Move the run from "Running" to "Completed".

- [ ] **Step 8: Final verification and commit**

```powershell
npm run verify
```
one more time, at the tree the commit will contain, and record the sha.

```bash
git add docs/superpowers/specs/2026-09-05-sp8b-web-bank-design.md docs/VERIFICATION.md docs/superpowers/sprint-control.md docs/superpowers/decisions.md .claude/skills/idlescape-content-overlay/SKILL.md .claude/skills/idlescape-client-patch/SKILL.md .claude/skills/idlescape-verify/SKILL.md
git -c core.safecrlf=false commit -m "docs(sp8c): reconcile the spec, the board and the skills

Spec section 13 records what shipped, the six things section 7 got wrong at revision 274, the
reorganize_inv bug section 7 did not know about, and what a green does not cover. The
client-patch skill moves from 28 to 31 with the two new polarity checks; the content-overlay
skill gains the three newly pinned packs, the interface.order grouping rule and the fact that
it is outside the pack guard, and loses its stale entry numbering and its pwsh invocation.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Executor notes

**Dependency order is strict and the tasks are numbered in it.**

```
1 (transport)
  -> 2 (packs pinned)            2 must precede 3, 4 and 5; nothing packs without it
       -> 3 (bank_main.if)
            -> 4 (bank.rs2: arithmetic, selection, icons)
                 -> 5 (bank.rs2: recount, deposit-all, cross-tab move)
  -> 6 (client/src/hooks/bankTabs.ts)     depends only on 1's clientcode allocation
       -> 7 (patch 29)
            -> 8 (patch 30)
                 -> 9 (patch 31)          9 also needs 3's component clientcodes
10 (deferrals)   depends on 5 having shipped ~banktab_recount
11 (e2e)         depends on everything from 1 to 9
12 (landing)     last
```

**Can anything run in parallel? Almost nothing.** There is one tree, one `Client.ts` and one `bank.rs2`, and every task commits. The one genuine fork is **Task 6 against Tasks 3 to 5**: Task 6 touches only `client/src/hooks/` and needs nothing from the content half beyond the clientcode numbers Task 1 fixed. If two agents are available, run Task 6 beside Task 3. Everything else is sequential, and Tasks 4 and 5 in particular must not be split across agents because they edit the same file in overlapping regions.

**This entry executes after sprint entry 3**, whose plan is committed at `a4815ba`. The six overlaps are tabulated in "The dependency this plan executes against" above and every task is written to work whether or not entry 3 has landed. **Check `git log --oneline docs/superpowers/plans/2026-09-07-overlay-pack-and-client-fork-gates.md` and the state of `scripts/patches-check.ps1`, `content-custom/manifest.json`'s shape and `.gitattributes` at the start of Task 1**, and record the answer in the handoff so every later task uses the same branch. The two that matter most: patches 29 to 31 ship `patches-check` fences, run by hand as greps if the runner is absent; and `interface.pack`, `interface.order` and `script.pack` are this entry's to pin either way, because entry 3 pins only `obj`, `inv`, `loc` and `varp`.

**The two commands after every content change**, in every content task's verification and easy to forget because `start-stack.ps1` does the first and not the second:
```
powershell -File scripts/content-overlay.ps1
cd engine/server
npx tsx tools/pack/BuildOverlay.ts
```
then restart the engine. A client rebuild (`bun run build:dev` in `client/`) needs no restart.

**Read `content-overlay.ps1 -Check`'s printed output, never its exit code.** `content-overlay.ps1:94` runs `exit 0` unconditionally, unlike its engine-overlay sibling which exits 1 on drift. Wrapping it in `if ($LASTEXITCODE -ne 0)` is a check that can only pass. After this entry, six manifest entries self-report drift on every run (the four pinned packs and the two `scripts/interface_bank/` replacements), because `-Check` hashes the file as it sits in `engine/content`, which for a replace entry is our own copy once the overlay has been applied. That noise is expected; `content-custom/README.md` documents it and Task 2 widens the sentence.

**Do not read `live/`.** It is a separate running instance with its own copy of the engine clones, git-ignored and never tracked, edited or read into.

**Never `git add -A`.** Every commit block above lists explicit paths, and the `.gitignore` anchoring makes this load-bearing: `.gitignore:8` is `/engine/`, not `engine/`, precisely so it does not also match `engine-custom/src/engine/`, where the tracked `PlayerLoading.ts` replacement lives. Do not tidy that line.

**Doors this entry is asked to keep open**, from `docs/superpowers/sprint-control.md`'s "Ideas to keep doors open for":
- *"The next client hooks patch keeps menu resolution in one place so an input tap can be added later"* and *"the input tap is a client patch at `Client.doAction` and lands with entry 8's patch batch"*. Patch 31 adds exactly one branch to `doAction` and resolves its target inside one helper, so a later tap wraps `doAction` once. **The tap itself is not built here** (it is entry 7's recorder work); say so in the handoff so the door is not assumed shut.
- *"Entry 8's client patches keep scene drawing behind one call so a WebGL backend can replace it later"*. This entry's patches touch **interface** drawing (`drawInterface`, `addComponentOptions`) and never the scene, so nothing here narrows that door. Say so rather than leaving it unanswered.

**Tuning numbers this plan names and expects to be measured.** Two, both flagged at the step that measures them: `^banktab_icon_zoom` (800, tuned on the live stack in Task 4 step 9) and `BANK_ORIGIN` plus the mini-menu offsets in the Playwright spec (measured in Task 11 step 2). Neither is a placeholder: each has a real starting value, a named method for checking it, and a named failure when it is wrong.

**The three traps this project's own record says will be met again**, from SP8b spec 12.7 and `docs/VERIFICATION.md`: Playwright runs from `web/` (from the root it reports "No tests found" and exits 0); `build:e2e` is not `build`; and `start-stack.ps1` continues with a warning when the engine never came up, so grep `logs/engine.log` for `World ready` or assert `/api/health` reports `engine: up` before trusting any browser check.

**Fix rounds and reviews** follow the project's sub-project shape: fresh implementer and fresh reviewer per task, fix rounds, a whole-branch review, one fix wave, `npm run verify`, then Task 12's spec section. Rulings that stay inside this entry go in the ledger at `docs/superpowers/ledgers/2026-09-07-sp8c-client-bank-tabs.md`, promoted at the landing step, never deleted; the six that cross entries go to `docs/superpowers/decisions.md` in Task 12 step 5.
