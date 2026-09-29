# Idlescape — SP8b: Web bank (OSRS-style), reordering, Contracts hooks, and bank tabs

Date: 2026-09-05
Status: owner request 2026-09-05 ("spec up a full bank UI in the web client…"); design recorded
for review, not yet approved
Depends on: SP8 (engine overlay with the owner-keyed shared bank store and its management
routes) for data; SP7 (tabs and one client per character) for the frame it lives in; SP9
(Contracts) for the buy/sell forms the context menu opens
Amends: `2026-09-05-multi-character-platform-design.md` section 7 (the owner bank store gains a
tab layout) and section 10 (new SP8b row between SP8 and SP9)

## 1. What this delivers

1. A **Bank** view in the web shell that looks and behaves like the Old School RuneScape bank
   ("2007scape" as shipped by Jagex, 2013 onwards): dark-brown item pane, eight columns, tab bar
   with item-icon tabs, "The Bank of Gielinor" title, capacity counter, swap/insert and
   item/note toggles, quantity buttons, a search box, and OSRS-style right-click menus.
2. The view is **the account's shared bank** (spec section 5): every character of the Firebase
   user sees and edits the same contents, live, from the web or from any logged-in client.
3. **Reordering** from the web: drag to swap or insert, move to a tab, sort helpers; every change
   is applied by the engine on its tick and versioned, never by the browser.
4. **Contracts hooks**: right-click an item for "Sell…" or "Buy more…", which open the SP9 buy
   or sell contract form prefilled with the item, its quantity and the last known price.
5. **Bank tabs** stored at account level and mirrored in both the web view and the game client,
   with a feasibility ruling on how exactly the 274 client can mirror OSRS (section 7).

Not delivered here: withdrawing or depositing from the web (items only move to and from a
character's inventory in the game client), placeholders and bank fillers (section 7.4), the
Contracts forms themselves (SP9).

## 2. What the 274 bank is today (verified)

| Fact | Where |
|---|---|
| The bank is inventory 95, 240 slots, `stackall`, one per character `.sav`; SP8 moves it to an owner-keyed store. | `engine/content/scripts/interface_bank/configs/bank.inv`, `bank.constant` (`^bank_total_slots = 240`) |
| The interface is content data: `bank_main.if` (a single `inv` component `bank_main:inv` plus graphic/button components), `bank_side.if`. Interfaces are packed from `.if` files; no client code describes the layout. | `engine/content/scripts/interface_bank/interfaces/` |
| Behaviour is RuneScript: withdraw 1/5/10/All/X (`inv_button1..5`), `%bankinsert` (swap vs insert), `%bankcert` (item vs note), `insert_bank` implemented as repeated `inv_movetoslot`. | `interface_bank/scripts/bank.rs2:1-15, 133-146` |
| The client renders any `inv` component from `IfType` fields (`linkObjType/linkObjNumber`, `width×height` slots, `marginX/Y`, `objSwap/objReplace`) and only supports dragging between `inv` components (`objDragComId`, `INV_BUTTOND`). | `client/src/config/IfType.ts:59-72,184-193`, `Client.ts` drag handling |
| No tabs, no search, no placeholders, no deposit-all buttons exist in 274. | same files |
| Item icons are rasterised by the client from the cache (`ObjType.getSprite`); the web has no sprites. | `client/src/config/ObjType.ts` |

## 3. Appearance (OSRS reference, adapted)

The web bank is a centred window over the game stage (not a side panel; eight columns need
about 420 px). Layout, top to bottom, matching OSRS's `bank_main`:

1. **Title bar**: "The Bank of Gielinor" centred in the OSRS gold title font colour on the
   stone-textured header; close (×) at the right; capacity "used / 240" at the left, with the
   used count in yellow.
2. **Tab bar**: leftmost "All items" tab (infinity glyph), then one tab per bank tab showing the
   tab's first item icon, then a "+" tab while fewer than nine tabs exist. The selected tab is
   raised; hovering shows a tooltip "Tab N · k items".
3. **Item pane**: eight columns of 36 px slots on a 48 × 36 px pitch (OSRS's grid), dark brown
   interior (`#3e3529`), scrollable, with tab dividers (a thin line and the tab icon at the left)
   when "All items" is selected. Item counts follow OSRS: yellow for < 100 000, white "K" from
   100 000, green "M" from 10 000 000; single items show no count. Notes draw the note icon
   behind the item.
4. **Bottom bar**: "Rearrange mode: Swap | Insert", "Withdraw as: Item | Note" (kept for
   parity; it only affects what the game client does next), quantity buttons "1 5 10 X All"
   (they set the default for in-game withdraw-X via the same varp the client uses), search
   (magnifier toggles an inline filter box; matches highlight, others dim, OSRS-style),
   "Deposit inventory" and "Deposit worn items" rendered disabled with the tooltip
   "Deposit from a character in game" (the web has no inventory to deposit).
5. **Right-click menu**: OSRS style, black background, yellow entries, red-ish "Cancel" at the
   bottom. Entries per item: "Sell…", "Buy more…", one flat row per other tab ("Move to tab 1",
   "Move to tab 2", …) plus "Move to new tab" while fewer than nine tabs exist, "Examine <name>".
   Built flat rather than as a submenu (section 12): at most nine tabs exist, and a right-click
   menu is easier to drive with one keyboard model than two. Left click selects; a second click
   on another slot swaps or inserts according to the rearrange mode (drag does the same).

Styling lives in `web/src/styles/bank.css` on top of the design-system tokens; sprites for the
frame are drawn with CSS (borders, gradients) rather than copied from the OSRS cache, so nothing
Jagex-owned is vendored. Fonts: the shell's pixel font for counts, the design-system UI font
elsewhere.

### 3.1 Item icons

Icons come from the running game client, which already rasterises them from the cache. There is
no `ObjType.getIcon` or `PixMap` in this fork (section 12 explains why the design's assumption
was wrong); the shipped hooks are:

- Client patch 28 hooks `getObjIcon(id: number, count?: number): string | null`, built on
  `ObjType.getSprite(id, count, 0)` (a 32×32 `Pix32`, 0 = transparent), plus
  `getObjInfo(id): ObjInfo | null` for name, examine, cost, stackable and noted. Both live in
  `client/src/hooks/objArt.ts`, anchored in `client/PATCHES.md`, and are memoised in the client
  itself on `${id}:${count}`, non-null results only, capped at 2048 entries (a flush, not an
  LRU, once the cap is hit).
- `web/src/bank/icons.ts` caches data URLs in IndexedDB (`idlescape-icons`) so icons survive
  reloads and can be shown before any client is open; the first miss asks the active session's
  client. The cache key is the obj id **alone**, and every request asks for count 1: a noted
  item is its own obj id in 274, so noted-ness is already in the key, and the bank prints the
  stack size as text beside the icon, so a stack-art variant would only make the cache
  unbounded for nothing it draws. With no client open and no cache, slots show the item name
  abbreviated on a plain tile.
- Feasibility note: a build-time icon sheet from a headless client run (`scripts/gen/item-icons.ts`)
  is possible later and would remove the runtime dependency; not required for v1.

## 4. Data and sync

- **Source of truth**: the SP8 owner bank store in the engine (`World.ownerBanks`, persisted
  as `engine/server/data/banks/<ownerKey>.json` with a monotonically increasing `version`).
  SP8 adds `tabs: number[]` (up to nine sizes, sum ≤ used slots) to that store and the
  management routes `GET /owner/:key/bank` and `POST /owner/:key/bank/apply` (spec section 7).
- **Front server**: `server/src/bank/routes.ts` (human or agent principal for reads, human only
  for writes):
  - `GET /api/bank` → `{ version, capacity: 240, slots: [{ slot, obj, count }], tabs: number[] }`.
    `BankSlot` carries no `noted` field end to end (section 12): a note is its own obj id in
    274, so noted-ness is read off `ObjInfo.noted` for the id already on the slot, not stored
    again.
  - `POST /api/bank/ops` body `{ expectedVersion, ops: BankOp[] }` → `{ version }` or 409
    `{ error: 'version', version }`. `BankOp = { op: 'swap', a, b } | { op: 'insert', from, to } |
    { op: 'moveToTab', slot, tab } | { op: 'setTabs', sizes: number[] } | { op: 'sort', tab, by: 'value' | 'name' | 'id' }`.
    The route validates shapes and slot ranges, then forwards to the engine's `apply` with
    the same `expectedVersion`; the engine applies on the world tick with `inv_movetoslot`
    semantics so an in-game bank interface open at the same time sees the result on its next
    transmit. Drags are coalesced client-side to at most one `swap`/`insert` apply per 1.2 s
    (section 12); `moveToTab` and `setTabs` are sent immediately.
  - `GET /api/bank/events` (Server-Sent Events) streams `{ version }` whenever the engine
    reports a change (the engine overlay posts to the front server's loopback hook on every
    owner-bank mutation tick). Read through `fetch` and a `ReadableStream` reader, not
    `EventSource`: `EventSource` cannot send an `Authorization` header and this route is
    human-only behind a Firebase bearer (section 12). `GET /api/bank` is also polled every 10 s
    **unconditionally** while the bank view is open, because the change hook is fire and forget
    with a 2 s timeout, no retry and no ordering guarantee, and is silent altogether in a
    deployment with no `IDLESCAPE_HOOK_URL`; the stream is an accelerator over that poll, not a
    replacement for it.
- **Web**: `web/src/bank/store.ts` holds the last `{ version, slots, tabs }`, applies optimistic
  local reordering for the ops it can compute exactly (`swap`, `insert`), and reconciles on the
  next version. `moveToTab`, `setTabs` and `sort` re-read the snapshot after the engine applies
  them instead of previewing, because the engine's own arithmetic (creating, growing, shrinking
  and dropping tabs; compacting holes before clamping tab sizes down onto what is left) is not
  reproduced client-side. On 409 it refetches and replays nothing (the user sees the server
  state; a toast says "Bank changed elsewhere"). A batch still queued when the window closes is
  silently abandoned rather than retried on reopen (section 12).
- **Concurrency rules** (spec section 7): all mutations are serialised on the engine tick; the
  web never edits counts; withdraw/deposit stay in-game. A character with the bank interface
  open sees web reorders on its next `inv_transmit` diff (the same staleness SP8 accepts for
  two characters banking at once). `swap` and `insert` have no client-side pre-check against
  the engine's tab invariant (`sum(tabs) <= used`), unlike `sort`, which the engine itself
  clamps: a move that lowers `used` below a tab boundary is rejected by the engine and the
  client re-reads the current snapshot rather than predicting the refusal. This is not normally
  reachable, because a real bank has no gaps inside its used region (section 12).
- **Agents**: `get_state` (SP4) may include the bank summary; `/api/bank` reads are allowed
  with an agent bearer; writes are human-only in v1.

## 5. Contracts hooks (SP9 integration)

- "Sell…" opens the SP9 sell-contract form with `obj`, `quantity` (defaults to the stack count,
  capped by the form's validation), and `pricePer` prefilled with the day's stored market price
  or the High Alchemy value; the form's escrow moves the items out of the bank on submit, and
  the bank view sees the new version through the event stream.
- "Buy more…" opens the buy-contract form with `obj` prefilled and `quantity` empty.
- Until SP9 ships, both entries render disabled with "Contracts coming soon", with no per-item
  tradeable check: the 274 client cache has no `tradeable` flag (only the engine's `ObjType`
  does, and it is never packed for the client) and this repo has no `scripts/gen` item table
  (section 12). The menu is built by `web/src/bank/contextMenu.ts` from a list of
  `MenuEntry { label, enabled, hint?, run }` so SP9 registers its two entries, `sell` and `buy`,
  without touching the bank module, and owns tradeability itself once it does, which it must
  anyway because it owns the escrow.

## 6. Tabs

OSRS semantics, mirrored exactly where the 274 data model allows:

- A tab is a contiguous range of slots; `tabs[i]` is the size of tab i+1; slots after the sum
  belong to the main tab (tab 0, "All items" also shows the tab dividers). Tab 0 is a real sort
  target, not merely a view: it is the only route to the items that are in no declared tab, the
  engine's `sort` op takes a tab number and accepts 0, and the "All items" tab's own right-click
  menu opens a sort menu exactly like any other tab's (section 12).
- Dragging an item onto a tab header moves it to the end of that tab (`moveToTab`); dropping
  on "+" creates a new tab with that item; a tab that becomes empty is removed and later tabs
  shift left; insert mode across tab boundaries updates the sizes so items never cross tabs
  by accident (the engine's `apply` keeps the invariant and rejects an `insert` that would).
- Sort helpers (per tab): by value (using the market price then High Alchemy), by name, by id.
  OSRS has no sort button; this is an addition and lives in the tab's right-click menu in the web UI only (owner decision: no sort in the game client).
- Storage: `tabs` in the owner bank store, so tabs are account-level like the bank itself.

## 7. Feasibility: tabs in the game client (274) and the web

| Piece | Web | Game client (274) | Verdict |
|---|---|---|---|
| Tab bar with item-icon tabs | Plain DOM. | Content-only: add nine `graphic`/`button` components to `bank_main.if`, set each tab's icon with `if_setobject(component, obj, zoom)` from RuneScript on open and after every move, select with `if_button` handlers writing `%banktab`. | Feasible without a client patch. |
| Per-tab item pane | Filter the slot list. | The engine transmits the whole 240-slot inventory (`inv_transmit`); showing one tab means either (a) a second, tab-sized `inv` component fed by a scratch inventory copied per tab (RuneScript `inv_moveitem` into a `bank_view` inv on tab change, actions mapped back by slot offset), or (b) a small client patch that scrolls the existing pane to the tab's range and hides the rest. (a) is content-only but doubles the bookkeeping; (b) is ~40 lines in `Client.ts` anchored at the `inv` draw site. | (b) recommended: a client patch that draws the selected tab's range and the divider lines, mirroring OSRS. |
| Divider lines in "All items" | CSS. | Same patch as above draws dividers at tab boundaries from `%banktab_size_1..9` varps. | Feasible with the same patch. |
| Drag onto a tab header | Native drag. | The client only drags between `inv` components; dropping on a tab header needs a client patch in the drag-release code (`objDragArea`, `INV_BUTTOND`) to send a new `IF_BUTTOND`-style target, plus a RuneScript handler. Interim: right-click "Move to tab N" on the item (content-only, `inv` ops menu). | v1 content-only via right-click; drag-to-tab as a follow-up client patch. |
| Tab sizes persistence | In the owner store. | Nine `scope=perm` varps seeded from the owner store at login by the SP8 overlay and written back on change, so the in-game tabs match the web. | Feasible; part of SP8's owner assertion/login path. |
| Search | Inline filter. | OSRS search is client-side highlighting of a typed string; 274 has `chatback` text prompts (`p_stringentry`), so a content-only version prompts for text and the engine re-transmits a filtered scratch inventory; a client patch could add live highlighting. | Content-only prompt in v1; live highlight later. |
| Withdraw-X memory, item/note toggle, deposit inventory/worn | Parity controls only. | Already present or content-only (`inv_moveitem` loops for deposit-all). | Feasible now. |
| Placeholders, bank fillers | Not shown. | Need an `Inventory` change in the engine (a zero-count slot that keeps its id), i.e. an engine overlay patch, plus RuneScript. | Deferred; engine-level, SP8 follow-up. |
| Capacity 800+ | Shows 240. | `^bank_total_slots` is content; raising it is one constant but changes the `.sav`/owner store size and the interface's scroll height. | Keep 240 in v1. |

Conclusion: the web side mirrors OSRS fully. The game client mirrors the tab bar, selection,
dividers and tab persistence with one small anchored client patch and content-overlay
RuneScript; drag-to-tab and live search are follow-up client patches; placeholders need an
engine overlay change and are out of v1.

## 8. Modules

```
web/src/bank/types.ts         BankSnapshot, BankSlot, BankOp, MenuEntry
web/src/bank/layout.ts        pure: tabs[] <-> slot ranges, insert/swap arithmetic, count formatting (K/M), sort comparators
web/src/bank/store.ts         fetch, SSE subscription, optimistic ops, version reconcile
web/src/bank/icons.ts         IndexedDB icon cache + client hook fallback
web/src/bank/view.ts          DOM rendering (title, tabs, pane, bottom bar), drag and keyboard handling
web/src/bank/contextMenu.ts   OSRS-style menu with registrable entries
web/src/plugins/builtin/bank.ts   shell plugin 'bank' (icon 🏦, alwaysOn: false, defaultEnabled: true) opening the window
web/src/styles/bank.css
server/src/bank/routes.ts + test  GET /api/bank, POST /api/bank/ops, GET /api/bank/events
server/src/bank/engine.ts         client for the SP8 management routes
engine-custom/...                 SP8 overlay: tabs in the owner store, change hook, varp seeding (this spec's requirement on SP8)
content-custom/scripts/interface_bank/...  bank_main.if tab components, bank.rs2 tab handlers, deposit-all, move-to-tab
client/src/client/Client.ts       patch: tab-range draw + dividers; hook getObjIcon
```

`web/src/bank/` shipped as twelve small modules rather than the six above, to stay under the
400-line ceiling (section 12 has the full list); `content-custom/scripts/interface_bank/...` and
the `Client.ts` tab-range/divider patch are SP8c, not this spec's SP8b (section 12). Client patch
28 (`getObjIcon`/`getObjInfo`, section 3.1) is SP8b's only client-side change.

## 9. Testing

- Unit (vitest): `layout.ts` exhaustively (ranges from sizes, insert across boundaries keeps
  sizes consistent, empty-tab removal, K/M formatting at the thresholds, sort stability);
  `store.ts` with a fake fetch and fake SSE (optimistic swap then 409 → refetch and toast);
  `view.ts` with jsdom (eight columns, divider placement, selection and swap/insert clicks,
  menu entries and disabled states, search dimming).
- Server (bun, emulator + a fake engine client): op validation (slot bounds, tab bounds, size
  invariant), 409 pass-through, human-only writes, agent reads.
- Engine overlay: `apply` with `moveToTab`/`setTabs` keeps `sum(tabs) ≤ used` and rejects an
  insert that crosses a tab boundary without a size update.
- Browser (Playwright): open the bank from the strip, see the items a character deposited in
  game (deposit via the gameplay helpers on Tutorial Island's given items), drag to reorder and
  see the order in the game client's bank on next open, create a tab from the "+" tab, right-click
  → "Sell…" opens the Contracts sell form prefilled (once SP9), search dims non-matches.

## 10. Sequence

SP8 (engine overlay, owner bank store + tabs + change hook) → **SP8b (this)** → SP9
(Contracts; registers the two menu entries) → SP10 (wealth). The in-game tab client patch and
content overlay can ship inside SP8b or as SP8c if SP8b's web work should land first.

## 11. Owner decisions (2026-09-05)

1. No remote "deposit all": the web bank is view and reorder only; items enter and leave the
   bank only through the game client, or through Contracts escrow and settlement.
2. Buying and selling go through Contracts only; the bank exposes no other trade path.
3. Sort helpers stay in the web UI and are not added to the game client.
4. Tab icons are always the first item in the tab (no digit option).

## 12. Built as (SP8b implementation, 2026-09-06)

The plan is `docs/superpowers/plans/2026-09-06-sp8b-web-bank.md`. SP8b's SDD workspace was deleted
at close under the old convention, before `docs/superpowers/SDD.md` replaced deletion with
promotion, so **this section is the surviving record** of its rulings and findings. The
sections above have been corrected in place wherever the code disagreed with the design; this
section is the single place to read what changed and why, including things that have no one
sentence to fix.

### 12.1 Six things the code said differently

Corrected in place above, gathered here for one lookup:

1. **Item icons** (section 3.1): no `ObjType.getIcon`/`PixMap` in this fork; client patch 28's
   `getObjIcon`/`getObjInfo` on `ObjType.getSprite(id, count, 0)`, the icon cache keyed on obj id
   alone at count 1.
2. **`noted` is not on a slot** (section 4): `BankSlot` is `{ slot, obj, count }`; noted-ness
   comes from `ObjInfo.noted`.
3. **Untradeable items are not greyed out** (section 5): no `tradeable` flag exists to check in
   this fork's client cache or in this repo, so both Contracts entries ship disabled; SP9 owns
   tradeability when it registers over them.
4. **"Move to tab" is flat, not a submenu** (sections 3 and 6): one keyboard model for at most
   nine tabs.
5. **The live transport is fetch, not `EventSource`** (section 4): `EventSource` cannot carry the
   bearer this route requires; `GET /api/bank` is polled every 10 s unconditionally regardless of
   stream health.
6. **Ops are coalesced to at most one apply per 1.2 s** (section 4): two world ticks, so a drag
   burst becomes one batch instead of holding the owner in push-out mode continuously.

### 12.2 Interface changes the plan did not have

The plan froze `BankGrid`, `BankTabs` and `GridInput` with no disposal or cancellation path.
Each gap turned out to leak or wedge something real, found only once the modules were composed
or driven by hand in a real browser:

- **`BankGrid.dispose()` and `BankTabs.dispose()`.** `IconCache` is a cross-window singleton;
  both modules subscribe to its `onChange` to repaint when an icon streams in, and neither had a
  way to release that subscription. `BankWindow.destroy()` exists precisely to tear a window
  down and rebuild it, so every open/close cycle leaked a listener retaining a closed-over
  `lastState`, its render function and its detached `el`, still firing `replaceChildren` against
  a dead subtree for the rest of the session. Both are idempotent (safe to call twice), and both
  had a second round: a repaint already coalesced onto a microtask before `dispose()` ran would
  otherwise still land on the dead tree, so the `disposed` flag is checked at the top of every
  path that can schedule or perform a repaint, not only at the subscription callback.
- **`GridInput.cancel()`.** No pointer capture and no `ev.buttons` check meant a drag whose
  `pointerup` never arrived (release outside the window, alt-tab mid-drag) stayed live forever;
  the next ordinary click then committed it as a real bank op, and outside the pane a click on a
  tab header fired an unrequested `moveToTab`. `cancel()` routes through the same internal
  `abandon()` used for a buttonless move, a window `blur`, and a keydown-triggered cancel, and
  lets Escape drop a live drag without closing the window (a second Escape closes it).
- **`stream.ts` gained `STABLE_MS = 30_000`.** The reconnect backoff ladder must reset only on a
  connection that has *survived*, not on the first byte received; resetting on first byte gave a
  flapping proxy one request per second forever. `STABLE_MS` sits under the 40 s watchdog, so a
  peer that accepts and then goes silent is still bounded to roughly one request every 41 s
  rather than escalating the ladder as a flapping connection should.

### 12.3 The tab-0 ruling

Two task briefs contradicted each other on whether the "All items" tab opens a sort menu: one
assumed it does, a shipped and reviewed test on the tab bar asserted it never does. The design
above settles it and was read literally to do so: slots after the declared tabs belong to the
main tab (tab 0), sort helpers are per tab, and the engine's `sort` op takes a tab number,
including 0, and tab 0 is the only route to sort the items that are in no declared tab. The tab
bar's guard was widened to accept tab 0 as a real sort target, and the contradicting test was
rewritten (Task 10, corrected in Task 12) rather than left standing.

### 12.4 The focus-ownership rule

Three separate bugs, in three different modules, converged on one rule: **a module that calls
`replaceChildren` on nodes it owns restores focus within its own subtree; the composing window
(`view.ts`) handles only the cross-module case** (a tab selection changing what the pane shows,
which genuinely originates outside the tab strip).

- `grid.ts` restores **the slot the player was on**, re-resolved by slot number at the moment of
  repaint (never a cached node, since an icon can stream in mid-drag and force a rebuild).
- `tabsBar.ts` restores **the roving tab stop**, not the previously focused node. This is a
  deliberate asymmetry, not an inconsistency: a grid has focus independent of selection, while a
  tablist with automatic activation does not, and pinning the strip to "whatever was focused
  before" would fight its own roving-tabindex contract on every arrow-key move.

Both are pinned by mutation, in both directions, so a future "make this consistent" edit fails
loudly: switching `tabsBar.ts` to prior-node restore breaks tests, and switching `grid.ts` to the
roving-tab default breaks others. A third candidate restore, once carried in `view.ts` for the
tab strip as well, was proven **redundant rather than merely extra** once `tabsBar.ts` owned its
own restore: keeping it did not just waste code, it *masked* a real defect in the strip's own
restore logic, because the window-level restore silently corrected a wrong target and the two
composed tests that should have caught it both stayed green. It was deleted once the discriminating
test showed the removal cost no coverage.

### 12.5 Behaviour that is knowingly as-specified, not ideal

- **Vertical keyboard clamping slides the player sideways off a partial bottom row.** `ArrowDown`
  from a slot in the last full row lands on the last visible slot even when that changes the
  column, because the clamp is `min(index + BANK_COLUMNS, last)`. This is what the brief
  prescribes; it is pinned by a test so the behaviour is deliberate rather than incidental.
- **A batch fenced by `stop()` (the window closing) is silently abandoned**, not retried on
  reopen. The window is gone, the reopened store reads a fresh snapshot, and a toast over a
  closed window would be worse than saying nothing.
- **The tab-invariant pre-check for `swap`/`insert` is absent** (section 4): unlike `sort`,
  which the engine clamps down onto the items itself, a `swap`/`insert` that lowers `used` below
  a tab boundary is refused by the engine with no client-side prediction, and the client re-reads
  the current snapshot on the resulting error. Accepted because a real bank has no gaps inside
  its used region, so the triggering state is not normally reachable through the UI.
- **`NO_ROOM` is unreachable through the UI but the guard was kept.** The plus tab and "Move to
  new tab" both disappear at nine tabs, and `render()` assigns `lastState` and calls
  `tabs.render()` synchronously with `gridInput` dispatching `onDropOnTab` inside one synchronous
  `pointerup`, so there is no async window in which the DOM and `lastState` can disagree. The
  two-line guard stays as a backstop rather than being removed.

### 12.6 Known gaps

- **No focus trap and no `aria-modal` on the bank dialog** (`role="dialog"` only). Adding
  `aria-modal` without a real trap would be a lie about the dialog's behaviour; both are out of
  scope for this sub-project and recorded here rather than silently absent.
- **`BankPluginDeps.closePanel` is constructed and passed but never called.** The real close path
  runs through `BankWindow`'s own `onClose` in `main.ts`. This matches the brief's own reference
  snippet, so it is not a deviation, but it is dead surface that could mislead a future reader
  into thinking it is load-bearing.
- **`web/styleguide.html` exceeds the 400-line constraint** (490 lines). It was already over
  (436 lines) before this sub-project touched it; restructuring it was out of scope. Inherited,
  not caused.

### 12.7 Operational hazards for future contributors

- **`.bank-slot` no longer means a real, addressable cell.** Filler cells in a filtered tab view
  carry the `bank-slot` class for layout purposes alongside `bank-slot-filler`, but only real
  cells carry `[data-bank-slot]`. Any selector meaning "a real slot" must use the attribute, not
  the class.
- **Anything interactive mounted into a pointer-transparent host must set `pointer-events:
  auto`, or its clicks fall through to whatever is behind it.** `.bank-host` is `pointer-events:
  none` so the game canvas underneath stays interactive while the window is closed; `.bank-window`
  opts back in, but the context menu, appended to the host as a sibling of the window so it can
  paint above it, did not, for most of this sub-project. Every click on it fell through to the
  slot underneath, and the menu's own outside-pointerdown handler then closed it, so the menu was
  **completely unusable with a real mouse** through a full review and two fix rounds, invisible
  throughout because jsdom has no pointer-events model at all and the unit tests drive rows
  through `HTMLElement.click()`. Only a real-browser Playwright run surfaced it. An audit of the
  shell's other pointer-transparent hosts (`.overlays`, `.plugin-overlays`, `.toast-host`) found
  this was the only offender, but the trap is generic: it will catch the next interactive thing
  mounted into `.plugin-overlays`.
- **Any hand-dispatched pointer event must set `buttons`.** Synthetic `PointerEvent`/`MouseEvent`
  test doubles default `buttons` to 0, and the grid input layer correctly bails on a buttonless
  move (it is exactly the guard that closes the stuck-drag bug above). A synthetic drag that
  omits `buttons: 1` is silently rejected rather than exercising the code it means to test.
- **A non-cancelable `KeyboardEvent` swallows `preventDefault()` silently.** A test that
  dispatches Escape (or any key) without `{ cancelable: true }` asserts the opposite of real
  browser behaviour with no error raised; the call site in the shipped test suite is commented
  as a known trap rather than fixed, since it happens to be harmless there.
- **The shared DOM setup (`setupDom.ts`) runs once per file, not once per test.** A test file
  that mounts into `document.body` must clear it itself (`document.body.innerHTML = ''`) at the
  start of `mount()`/`beforeEach`, or every test after the first asserts against the previous
  test's leftover DOM.

### 12.8 Proving a server is current

While verifying the SSE fan-out end to end, `GET /api/bank/events` and `GET /api/bank` both
answered `401` from a front server that was, in fact, running code 46 minutes stale: the SSE
route had not been loaded yet, and an unauthenticated request to *any* nonsense path (`/api/zzz`)
returned the identical `401`, because that status is emitted by an auth layer before routing, not
by the route itself. Every browser run in this sub-project before the restart, including an
earlier green full-suite run, had exercised the polling path only; the live-update assertion this
task added failed for a real reason the moment the server was actually current. The lesson: to
prove a server is serving current code, assert on a route's own behaviour, never on a status code
an auth layer can emit before the route is reached.

### 12.9 Amended by sprint entry 4, shell v2 (2026-09-09)

Entry 4 re-drew the bank on the v2 window family, so three things this section describes are no
longer what ships. Its plan is `docs/superpowers/plans/2026-09-07-shell-v2.md`, and the ledger
promoted from it at close is the later record wherever the two disagree.

1. **The window title is `Bank of Gielinor`**, the mock's string, exported as `BANK_TITLE` from
   `web/src/bank/view.ts` and used for both the visible title and the dialog's `aria-label`.
   Decision **D131** records it, because sprint entry 8 plans the *client* bank's title and has to
   land on the same words.
2. **The footer is the mock's, not the OSRS parity strip.** Swap / Insert, the quantities 1 / 5 /
   All, the search box and a caption. The withdraw form (Item / Note), the 10 and X quantities and
   the two disabled deposit buttons are gone: none of them ever reached the wire, because
   `POST /api/bank/ops` answers `403 layout_only` to anything that is not a re-order. Owner
   decision 1 still holds and has moved to the Bank panel's info alert.
3. **The window chrome is shared.** `window window-warm window-centred` (decision D22), so the
   ground, the header gradient, the shadow and the placement are the overlay family's and not the
   bank's; what is still the bank's is the width, the tab rail, the grid and the footer.
