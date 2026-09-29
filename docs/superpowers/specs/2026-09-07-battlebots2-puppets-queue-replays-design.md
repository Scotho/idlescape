# Idlescape: Battlebots 2, puppets, the queue and replays

Date: 2026-09-07
Status: approved by the orchestrator under D11 and D39, 2026-09-07; committed on
`sprint/dragon-slayer` the same day. The owner ruled the product questions in
`docs/ideas/2026-09-07-battlebots-improvements.md` round two; every design question left after
those rulings is ruled in section 20 and may be reversed there. Revised 2026-09-07 after a
code-truth, owner-fidelity and agentic review round: that round's own file lived in a git-ignored
workspace a fresh clone does not have, so every finding it raised is folded into the text below,
and the four that moved a boundary or bound another entry are recorded as D52 to D55.
Authority: the battlebots **plan** (`docs/superpowers/plans/2026-09-07-spbb-battlebots-minigame.md`)
is the authority for entry 11 and stays so; it overrules its own spec on sixteen points and this
document leaves nine of them alone. **This document is the authority for its own row.** Where
it revisits one of the plan's rulings it says which, in section 2.3, and section 16 says what
entry 11 must leave open so that this row can be built at all. The battlebots **spec**
(`2026-09-07-battlebots-minigame-design.md`) sections 11, 13, 14 and 15 are inherited and are named
where they are used.
Placement: **immediately after SP3b and before SP10**, per decision D39, because it registers the
streak category into SP3b's registry and extends the store SP3b projects over. That row is
**sprint entry 14**, inserted under D58 with SP10 and everything below it moved down one. The
row is cited by name rather than by number throughout, because this sprint has renumbered three
times already (D32, D41, D58) and a number in a spec goes stale silently.
Classification: **architectural.** It adds a character the front server owns, a second headless
client inside the player's tab, a durable queue, six tables and two views on entry 11's database,
eleven new front-server routes with two more extended, five engine management routes, and a window
in the shell v2 family.

Reading state: code read at `1fe96f1` on `sprint/dragon-slayer`
(`fix(tasks): drop the dead tutorial step and the Fork button that cannot fork`); the three
workspace maps this document is built from were read at `5532c70` on the same branch. SP4b (sprint
entry 1) was being implemented and committed on this branch throughout, so every `web/src/` line
number here is a pointer to a symbol; a grep is the authority.

Depends on, in the order the work needs them: **entry 11** (the region, the plots, the kits, the
result hook, the store and the `server-data` volume), **entry 4 / shell v2** (the `Window` family
from its Task 7, the panel dialect, the `.meter` data family), **SP4b** (the run export shape and
the live-stack e2e harness), **entry 13 / SP3b** (the category registry the streak projects into),
and **SP7** (the session manager whose composition root the puppet runtime is a sibling of).
Nothing here depends on SP4c or SP5. SP5 depends on this: section 5.6.

---

## 1. What this entry is

Entry 11 builds an arena in which a player's own character fights, driven by the script already
running in that character's Worker. That is a good minigame and a bad place to stop: a ranked match
takes the player's character away from whatever it was doing for five minutes, the queue is a tile
you stand on, a match leaves ten integers behind, and there is nothing to watch.

This entry changes exactly one thing about how a ranked match runs, then follows the consequences
honestly. The change is that a ranked match is fought by a **puppet**: a character the front server
owns, issued to a player for one match, carrying a **stored setup** frozen when the player queued.
The player's own character never enters the arena and never stops what it was doing. Practice and
challenge stay on the real character exactly as entry 11 builds them.

Six things follow, and they are the whole of this entry:

1. A puppet needs a client. Under D37 it is a headless rs-sdk `LiteClient` in a second Worker in the
   player's own browser tab, and the script Worker above it does not change at all.
2. A puppet needs an identity, a login, stats and a kit, none of which exist today.
3. Queueing stops being a place and becomes a durable server-side list carrying the owner's rules:
   loser dequeued, winner re-queued until it loses or leaves, one ranked match per account, never
   two puppets of the same account.
4. A match nobody watches is worth recording properly: a header written at arming, a tick log
   written by the engine, and each side's run trace in the SP4b export shape.
5. A win streak is persisted and projected into SP3b's registry, with the panel as its reading.
6. Live viewing and replay are the same tick log rendered twice, in one shell v2 window that draws a
   schematic of the plot.

**Not in it:** walk-away play (the owner ruled it is not a must-have; the player must be online to
host the puppet), a 3D or free-camera viewer, cross-account script sharing of any kind, and any
change to practice or challenge. Section 21.

## 2. Where this sits against what exists

### 2.1 What entry 11 leaves behind

From the plan, not assumed: four generated map squares and eight 24x24 plots (R14), a lobby with an
exit portal, a teleport-in management route (R11), three issued kits and the two `scope=perm` stash
inventories (R3), practice against three 274 npcs (R8), challenge on op slot 5 (R12), a RuneScript
match lifecycle with a 500-tick clock, a result published by writing varps and bumping
`%bb_match_seq` last, an `engine-custom` post-cycle sweep that turns that bump into one posted row
per fighter, a `bb_rows` table keyed `(game_name, seq)`, four routes, and a panel with Enter, Bot and
History. The queue pad is deferred out of it by D38, so nothing in entry 11 walks onto a plot for a
ranked match.

### 2.2 What does not exist, anywhere

No character the front server owns. No route that mints a login for one. No route that reads or
writes a character's stats. No path from a panel kit choice to `%bb_kit`: `~bb_kit_issue` is called
only by `~bb_arm`, and `~bb_arm` only by the three RuneScript entry points, one of which D38 just
deferred. No match header row, so nothing exists at arming time for a tick log or a live feed to
hang from. No queue rows. No streak. No spectator anything.

### 2.3 The plan's rulings this document revisits

Nine of the sixteen stand untouched. Seven are touched, and only on the ranked path: four
substantively (R10 reopened, R13 and R15 superseded, R16 reversed) and three restated where a reader
would otherwise think they had moved.

| Plan ruling | What this entry does to it |
|---|---|
| R3, kits and the perm stash | Stands whole for practice and challenge. Vacuous on the ranked path: a puppet owns nothing, so `~bb_stash_store` and `~bb_stash_restore` run over empty inventories, and the kit id arrives from the stored setup through the arm route (section 3.4). |
| R5, scripts run in the player's per-character Worker | Stands as written. The Worker does not change; what changes is the `Transport` beneath it (section 5). Its stated cost, both players online, survives and is still panel copy. |
| R6, the sandbox is not a security boundary | Restated, not widened: the code still runs in the player's own browser, and the account it drives is issued to that player for that match and holds nothing. Section 15.2. |
| R10, hiscores are out of scope | Reopened by SP3b's existence. The streak registers as one more category over the same store (section 10). |
| R13, the shared waiting slot and the widening band | Superseded by D38 and by section 6. The band schedule itself (start 5, +1 every 15 s, ceiling 15) is kept verbatim from spec section 11. |
| R15, nothing new pins `scriptVersion` | Superseded. The setup freezes the source, so the store is the pin and the join on time and character stops being the record (section 4). |
| R16, no retention cap | **Reversed** on the owner's ruling, back to spec section 14: last 100 matches per character in full, results only beyond. Section 8.5, ruling R18. |

The match clock (`^bb_match_ticks = 500`, still the battlebots spec's open decision D4) is inherited
as it stands and is the bound on tick-log size.

## 3. The puppet model

### 3.1 What a puppet is

A puppet is an ordinary engine character with an extraordinary owner. The engine cannot tell it from
a player: it logs in over the same websocket with the same 274 handshake, is loaded by the same
`PlayerLoading.load`, occupies a world slot, counts in `map_playercount` and appears in other
scripts' `nearbyPlayers`. Everything that makes it a puppet is outside the engine.

There are sixteen, fixed: `bbp01a`, `bbp01b`, `bbp02a` ... `bbp08b`. Two per plot, allocated with the
plot, so the pool is exactly the concurrency limit and no allocator can outrun it. The names satisfy
`NAME_RE` (`/^[a-z0-9_]{1,12}$/`) in both the front server and the engine overlay, sort by plot, and
are legible as puppets at a glance, which matters because a name that looks like a player's would
eventually be read as one.

**They are not characters in the character store.** No `characters/{id}` document, no
`gameNames/{name}` index entry, no `CHARACTER_LIMITS` slot, no row in the Characters panel, no
session route. They are a constant table in code plus one state table in `battlebots.db`
(`bb_puppets`, section 8.2). Ruling R1.

Two consequences worth stating rather than discovering. First, the `gameNames/{name}` uniqueness
index does not protect these names, so `server/src/gameName.ts` gains a reserved-prefix refusal: no
player may create a character matching `/^bbp\d\d[ab]$/`, and the same refusal covers a rename path
if one is ever built. Second, SP3b's snapshot ingest resolves `characters/{characterId}` and a puppet
has no document, so a puppet cannot be ingested even by accident. That is structural, and section
15.4 keeps it that way.

### 3.2 Admission: the owner assertion is the credential, not the password

This is the piece that looks hardest before the tree is read and turns out not to exist, and the
correction removes the design's worst problem. Stated in full here, because every later section
leans on it.

`engine-custom/src/server/login/LoginThread.ts` compares a password only when
`Environment.login.enabled` is true. The deployed world sets neither `easyStartup` nor
`login.enabled`: `deploy/docker/world.json.template` carries `"login": { "enabled": false }` beside
`"node": { ... "production": true }`, and the dev `engine/server/data/config/world.json` in this
repository says the same with `production` false. (`engine-custom/PATCHES.md`'s
standalone-login-worker note makes the same observation, but about the **dev** world only, so the
template is the artifact cited here, since R2 is a claim about the deployed one.) So the branch that
runs is the
single-world one: it answers reply 0 with the `.sav` when one exists and reply 4 when one does not,
and **never looks at the password**. What admits a socket is the owner assertion.
`idlescapeConfig.requireOwner` is forced true in production
(`engine-custom/src/idlescape/config.ts`), and `PlayerLoading.load` throws `OwnerAssertionError`
(login response 13) unless `verifyOwnerHeader(client.ownerHeader, safeName, ownerSecret)` returns an
entry naming the character the engine decrypted from the login block. That assertion is an HMAC over
`cs1|uid|character|exp` keyed with `ownerSecret`, which exists only on the front server and in the
engine.

So the puppet's credential is a thing the browser cannot forge, and the requirement that a puppet's
credentials never reach the browser is met by construction rather than by rotation. The login block
the tab builds carries a fixed, meaningless password string; holding it buys nothing, because
without an assertion naming that puppet the engine refuses the login.

The login path, end to end:

1. The match arms. The front server writes the header and side rows and mints, per side, a **puppet
   ticket**: an opaque 32-byte random id held server-side against
   `{ matchId, slot, puppetName, uid, characterId, expiresAt }`, single use, 30 s TTL.
2. The tab learns it on its next queue poll:
   `{ state: 'armed', matchId, plot, slot, puppet: { name, wsPath: '/puppet-ws?ticket=...' } }`.
3. The puppet Worker opens `wss://<origin>/puppet-ws?ticket=...`. The front server classifies it as a
   new route kind beside `{ kind: 'ws' }`, redeems the ticket atomically, refuses anything not naming
   a live armed match, mints an owner assertion for `uid = 'bbp-' + puppetName`,
   `character = puppetName`, and sets `X-Idlescape-Owner` on the **upstream** handshake itself.
   `OpenUpstreamOptions.headers` in `server/src/proxy/ws.ts` exists for exactly this, `openUpstream`
   merges them, and it already rewrites `Origin` to `env.publicOrigin` on the same upgrade.
4. The engine sees an ordinary 274 login with an assertion it can verify. Nothing in the engine
   learns what a puppet is.

The `cs_owner` cookie is not read, not written and not sent on this upgrade, and that is the whole
reason for a separate route. `buildOwnerCookie` discards every entry whose uid differs from the one
being minted, and both it and `ownerHeaderFor` cap the list at five, so a puppet sharing the cookie
would either evict the player's own characters or blow the cap the moment a player has four tabs
open. Ruling R3.

**Puppet uids are a reserved namespace.** `bbp-<name>` is a valid `UID_RE` string and can never be a
Firebase uid, but "can never" is not a check, so `buildOwnerCookie` refuses to mint for any real
principal whose uid starts with `bbp-`, and the puppet minter refuses any uid that does not. One uid
per puppet rather than one for the pool, so `setOwnerKey(player, uid)` gives each puppet its own
empty owner bank instead of sixteen puppets sharing one. A puppet never reaches a bank booth in any
case: the arena region has none, and the kit is issued and destroyed by RuneScript. Ruling R4.

**In a dev world** `requireOwner` is false and any socket can log in as anything, which is already
true of every character and is what the gate cookie and the localhost binding are for. The design
does not depend on the difference: the ticket route mints a real assertion either way, so the
behaviour is identical on both settings and the e2e in section 19 exercises the production shape.
This subsection is recorded as **D45**, because it moves an account-isolation boundary.

### 3.3 Stats, and the overwrite at arm

A setup carries a stat snapshot taken at queue time and written onto the puppet at arm. Both halves
are engine management routes: on the management Fastify app only, bound to `managementHost`
(127.0.0.1), authenticated by `x-idlescape-mgmt` compared with `timingSafeEqual` over UTF-8 bytes,
and not registered at all when the secret is empty. That is the existing shape in
`engine-custom/src/idlescape/management.ts`, copied without deviation.

- `GET /characters/:name/stats` returns the 21 base levels and current hitpoints of a logged-in
  character, read off `World.getPlayerByUsername(name)`. Twenty-one, not the client's 25 slots, for
  the reason SP3b's R4 gives. It refuses an offline character, which is not a restriction: the player
  must be online to host the puppet anyway.
- `POST /puppets/:name/stats` overwrites the 21 base levels and heals to full on a puppet, refusing
  any name not in the puppet table and any puppet whose `%bb_state` is not idle.

**The browser never supplies the snapshot.** D24 says a Worker-resident script is the account's own
code, which is a fine thing to say about a script and a wrong thing to say about a claim that sets
the opponent's difficulty: a forged snapshot is a forged puppet. Reading it from the engine also
means the number in the record is the number the world had. Ruling R10.

Nothing needs resetting between matches, which is the owner's ruling and is true for a good reason:
every stat is overwritten at every arm, the kit is destroyed at resolve, and the two stash
inventories are empty because a puppet never carried anything into the plot.

### 3.4 Kit issue, and how a ranked match is armed at all

`~bb_arm($plot, $mode, $kit)` already does the work: it snapshots hitpoints, stops action, closes
interfaces, clears prayers and boosts, calls `~bb_stash_store` then `~bb_kit_issue($kit)`, and queues
`bb_match_start`. What is missing in entry 11 is a ranked caller, and after D38 there is none.

This entry adds `POST /battlebots/arm` on the management app, taking
`{ matchId, plot, slotA: { name, kit }, slotB: { name, kit } }`. It executes nothing itself: it
validates, then **enqueues** the arm onto a module-level list that the existing post-cycle hook
drains inside the world cycle. The overlay already wraps `World.cycle`
(`engine-custom/src/idlescape/install.ts`, Patch 2) and already sweeps every player there for the
bank tabs and for the battlebots result, so draining an arm list is one more call in that block. Each
drained arm resolves both players by name, telejumps them to the plot's start tiles by slot, sets
`%bb_match_id` from the front server's id and `%bb_kit` from the setup, **sets each side's
`%bb_opponent` to the other `Player`'s uid**, and runs `[proc,bb_arm]` through
`ScriptProvider.getByName` and `ScriptRunner.init`, which is how the engine itself runs a proc from
TypeScript (`Player.executeScript`).

`%bb_opponent` is called out because it is the one field a TypeScript arm path will silently omit:
the challenge path sets it in RuneScript on both sides (`%bb_opponent = .uid` and
`.%bb_opponent = uid`) and there is no equivalent here. `[proc,bb_arm]`'s own docstring names it a
precondition ("the caller has already decided the plot, the mode and the opponent") and its body
reads it immediately to seed `%bb_foe_hp_last`; `[timer,bb_match_clock]` accumulates `%bb_dmg_dealt`
through `.finduid(%bb_opponent)` and computes the expiry tie-break the same way; and
`[label,player_death_battlebots]` marks the survivor the winner through it. Left unset, every ranked
match records zero damage dealt, scores both sides a clock win on a tie-break of nothing, and never
marks a winner on a death - three silent failures. The drain sets both sides before it runs either
proc, and section 19 asserts it.

Running the proc inside the cycle rather than from the Fastify handler is the point: an HTTP handler
executing a script re-entrantly against a world that is mid-tick is the kind of bug found six months
later in a corrupted save. Ruling R8.

Two smaller things fall out. `%bb_match_id` now comes from the front server, which allocates match
ids from the store, so `%bb_match_counter` (world-scoped RuneScript state a vars reset restarts)
stops being an id source and its collision hazard disappears. Ruling R9. And the arm route does not
consult `^bb_public` or `staffModLevel`, because ranked play never walks in through
`POST /battlebots/enter/:name`: `^bb_public` stays false and the region stays undiscoverable on foot.
Ruling R24.

### 3.5 Cleanup and orphan recovery

A puppet left standing in a plot keeps `map_playercount` non-zero, and `~bb_free_plot` allocates on
exactly that, so one orphan would remove a plot from the pool permanently. Four defences, in the
order they fire:

1. **The tab.** Every ending in section 7.3 stops the `LiteSession`, and a `beforeunload` handler
   makes a best-effort `session.stop()`. Best effort is the correct expectation and never the
   defence.
2. **The resolution.** At resolve the front server tells both tabs to log their puppets out and marks
   both `bb_puppets` rows **releasing**, not free. A releasing row is not allocatable.
3. **The reaper.** A front-server tick every 60 seconds asks the engine for the puppet roster
   (`GET /puppets/online`, one more management read), logs out through `POST /puppets/:name/kick`
   any puppet in game with no live match row, and frees every `releasing` row the roster no longer
   names. That predicate is the only thing that actually guarantees the pool.

   **A row is freed on a confirmed logout, never on a request for one.** The tab's logout is best
   effort (defence 1) and the reaper is a minute away, so freeing at resolve would let the allocator
   hand the same puppet name to a new match while the previous session is still connected - a second
   login for one character, resolved by the 274 login thread rather than by us. The stat-write guard
   does not catch it: after a normal resolve `%bb_state` is idle, so `POST /puppets/:name/stats`
   would accept the overwrite onto a live session. The cost is that a puppet can still be
   `releasing` when its plot next arms, so the arm path performs the same roster read **on demand**
   and frees what the roster no longer names before it mints a ticket; the wait is a loopback round
   trip, not a reaper cycle. Ruling R31.
4. **The plot allocator.** It allocates from `bb_matches.plot WHERE ended_at IS NULL`, eight rows, not
   from `map_playercount`. An orphan therefore costs a reaper cycle, not a plot.

`~battlebots_login` and `~battlebots_logout` are near no-ops for a puppet and are left exactly as
entry 11 writes them. Puppet `.sav` files do not grow: nothing is banked, the kit is destroyed, and
stats are overwritten. The result sweep's `seen` cursor is keyed by username for the life of the
process, so `%bb_match_seq` on a puppet must keep rising across owners; it does, because the varp
lives in the `.sav` and the sweep only compares upward, but section 19 asserts it because the failure
mode is silent row loss.

## 4. The stored setup, and what frozen means

A setup is written once, at enqueue, and never rewritten. It carries:

- the **script source**, frozen verbatim, plus `scriptId`, `scriptName`, `version` and
  `source: 'library' | 'user'`, and the `ParamValues` the panel held;
- the **kit id**, one of the three the arena issues (plan R3);
- the **stat snapshot**, 21 levels read from the engine at enqueue (section 3.3), with the derived
  combat level denormalised out of it as the band key;
- `queuedAt`, and the owning uid, character id and character name.

Frozen source rather than a reference answers the idea file's question 3, and it is what makes plan
R15 stop applying: R15's argument was that the run history already pins the version because the
Worker compiles a closure at run start. Under puppets the front server hands the tab the code to
run, so the store is the pin. The cost is a few kilobytes per entry, and what it buys is that a
replay a month later can say what actually fought.

**A setup outlives its queue entry**, because a match record must be readable after the entry is
gone. Setups are capped rather than deleted: an account holds at most 200, and beyond that the
oldest have their `script_source` nulled while their metadata stays, exactly as a pruned trace does
(section 8.5).

**The cap excludes any setup a `bb_queue` row still points at, in any state.** A winning re-queue
keeps its setup id (R11) and the source is read at arm and handed to the owning tab (section 7.1),
so without the exclusion a long streak on an account that keeps enqueuing fresh setups can reach an
arm with a null source. One `AND setup_id NOT IN (SELECT setup_id FROM bb_queue)` on the cap query.
Belt and braces above it: an arm that reads a null source refuses and forfeits that side with
`reason='no_source'` rather than arming a puppet with nothing to run, because a silent no-op in a
plot is worse than a recorded loss.

**A winning re-queue keeps the same setup id.** A mid-streak edit to the script does not change the
bot that is fighting, and that is what makes a streak mean one bot's run rather than one player's
session. Ruling R11.

## 5. The host seam: a puppet in the player's tab

D37 rules the host. This section says what it costs and what it must not become.

### 5.1 The seam already exists

`Transport` (`web/src/agent/types.ts`) is the entire boundary between the script runtime and the
game, and `createLocalTransport` is one implementation of it over the canvas client's hooks; its own
header says the next ones are an iframe and a socket. A puppet is a third implementation, over
`LiteClient`. Nothing in `worker.ts`, `workerContext.ts`, `workerHost.ts` or the vendored `BotSDK`
changes, because none of them can tell one `Transport` from another. That is why D37 is one adapter
and not a redesign.

### 5.2 What has to be built

**The vendoring, and the import closure that is easy to miss.** rs-sdk's
`server/webclient/src/lite/` is upstream only: `web/src/vendor/PATCHES.md` vendors the sdk layer,
and `client/src/vendor/PATCHES.md` vendors the bot module plus `lite/movement.ts` alone, with its
`import type { LiteClient }` replaced by a local interface precisely because "rs-sdk's headless
LiteClient is not vendored". Both pin rs-sdk `56b73e08` (MIT).

`lite/` is **not** a self-contained tree, and an earlier draft of this section priced it as though
it were. `LiteClient.ts` at the pinned sha is 1163 lines and opens with twenty-two imports, only
eight of them local: `#/config/{IfType,LocType,NpcType,ObjType,SeqType,SpotType}.js`,
`#/datastruct/{JString,LinkList}.js`,
`#/dash3d/{ClientEntity,ClientNpc,ClientObj,ClientPlayer,CollisionMap,LocAngle,LocShape}.js`,
`#/client/{LoopCycle,Skill,Client}.js`, `#/io/{ClientProt,Packet}.js`, `#/util/Arrays.js` and
`#/bot/{StateCollector,ActionExecutor,types}.js`, then `./net/`, `./interfaces.js`, `./world/`,
`./protocol/`, `./movement.js` and `./actions.js`. The `#/` specifier resolves only inside the
client package: `client/tsconfig.json` maps `#/*` to `client/src/*`, `web/tsconfig.json` declares no
`paths` at all, and nothing under `web/src` imports from `client/` today - `web/src/clientTypes.ts`
re-declares the shapes instead and says so in its header. Our own vendored `lite/movement.ts` is the
proof: it imports `#/dash3d/CollisionMap.js`, `#/dash3d/CollisionFlag.js`, `#/dash3d/LocShape.js`
and `#/io/ClientProt.js`, which is exactly why it lives under `client/` and not under `web/`.

So "drop `lite/` into `web/src/vendor/rs-sdk/lite/`" is not a thing that can be done. Three routes
exist and this document rules on one.

1. **Host the puppet in `client/`**, where the graph already resolves. Rejected: the puppet's owner
   is the shell. The composition root that must call `closeAll()` is in `web/src/frame/`, and the
   `Transport`, the `WorkerHost` and every task type are `web/` code; the client is loaded in a
   per-character iframe a puppet has no business inside, which is R30's reasoning applied one layer
   down.
2. **Import across package roots from `web/`.** Rejected, as before, and now for a larger reason
   than one duplicated `movement.ts`: it would pull the client's whole module graph into the
   shell's bundle through a path mapping no other file uses.
3. **Vendor the closure**, which is what this entry does. `lite/` plus every `#/` module it closes
   over transitively lands under `web/src/vendor/rs-sdk/`, laid out as upstream lays it out:
   `web/src/vendor/rs-sdk/lite/` beside
   `web/src/vendor/rs-sdk/client-src/{config,datastruct,dash3d,client,io,util,bot}/`, with a `#/*`
   mapping in `web/tsconfig.json` and a matching Vite `resolve.alias`, both pointing **only** at
   `web/src/vendor/rs-sdk/client-src/`. The specifiers then stay byte-identical to upstream, which
   is what keeps most `PATCHES.md` rows to a provenance header, and nothing resolves outside `web/`.

**What that costs, said plainly, is a second copy of a large part of the forked 274 client inside
`web/`** - not one duplicated file. `bot/StateCollector.ts` and `bot/ActionExecutor.ts` join
`movement.ts` in existing twice, and `#/client/Client.js` arrives as a type-only import the closure
must either satisfy or sever. **The first task of this entry measures the closure**: the transitive
file list, its line and byte count, and which modules can be a type stub rather than a copy, written
into `PATCHES.md` and `CREDITS.md` before any of it is committed. Vendored files are exempt from the
400-line ceiling by existing convention (the roadmap's section 5, the same paragraph that obliges
the `CREDITS.md` row), and sprint entry 2 ships the static gate that enforces that ceiling, so that
gate must exclude `vendor/`. Ruling R6.

The port from Bun to a Worker is small and known: `Bun.sleep(LOOP_MS)` becomes a `setTimeout`
promise; `cache.ts`'s `Bun.file` and `Bun.write` disk cache is dropped, because the three archives it
needs (`config`, `interface`, `wordenc`, all already in `CACHE_PREFIXES`) total about 290 KB and the
browser caches the HTTP responses anyway; `dom-shim.ts` is re-read against a
`DedicatedWorkerGlobalScope`, which already has `fetch`, `WebSocket` and timers and has no
`document`, `window` or `Image`. Upstream's `bench-browser.ts` says somebody has run this in a
browser already, and it is read first.

**Map data**, the one thing our engine does not serve. `lite/world/LocIndex.ts` fetches
`${origin}/ondemand.zip`; upstream restored `packOnDemandZip` in its own patches after revision 274
dropped it. Our pin has no such route, and `CACHE_PREFIXES` (`server/src/types.ts`) says why: maps
stream over the OnDemand websocket, not over HTTP. The fix is the pattern `scripts/gen/collision.ts`
plus `web/src/tasks/collision.ts` already use: a generator emits a committed binary and the web side
imports it as a Vite `?url` asset, `web/src/data/battlebots-map.bin`, while the vendored `LocIndex`
takes its archive from an injected loader instead of from an origin. That injection is real and
cheap - upstream's `LocIndex.ts` hardcodes an `unzipSync` over an `httpGet` of
`<origin>/ondemand.zip` with no loader seam - and it is one `PATCHES.md` deviation. A puppet that
cannot load Lumbridge cannot be walked to Lumbridge.

**The loader is the cheap half; the encoder is not, and R5's cost line prices the wrong one.**
`scripts/gen/battlebotsMap.ts` as entry 11 writes it produces `.jm2` map **source**
(`mapSource(mapX, mapZ): string`) plus `packLines(baseId)` for the `map.pack` overlay. The packed
map groups and loc groups that `LocIndex` and `CollisionBuilder` consume are produced downstream
from that source by the engine's own pack step. So `battlebots-map.bin` is a **new emitter**, not
another `writeFileSync` in an existing one, and it has two honest shapes: drive the engine's packer
as a generator step and repackage its four squares, or write a four-square encoder against the same
format the packer emits. The first is preferred, because it cannot drift from what the engine
serves; sizing it belongs to the same first task that measures the vendor closure. What R5's cost
line prices - porting `packOnDemandZip` and adding the route, a day plus one `PATCHES.md` row - is
the route this entry is deliberately **not** building, and is what SP5 does when a headless client
needs the whole world. Ruling R5.

**The state adapter.** `LiteClient` publishes `BotWorldState` through rs-sdk's own
`bot/StateCollector`, and so do we - but not through the same copy, and the drift argument has to be
made carefully. Ours is `client/src/vendor/rs-sdk/bot/StateCollector.ts`, a client-package artifact
whose entry point is `collectState()` and whose private-member reads were hand-verified by name
against the forked canvas `Client.ts` and `GameShell.ts` (`client/src/vendor/PATCHES.md`, the
"StateCollector reads `Client` privates" section, 38 names). The copy a puppet actually binds to is
the `bot/` module vendored into `web/` as part of the closure above. What keeps the two published
shapes identical is therefore the shared upstream pin plus a `PATCHES.md` row on each root, not the
fact that one file exists; that duplication is counted in R6's cost. The Worker expects
`WorldState = BotWorldState & WorldExtras`, and `WorldExtras` is the whole gap: `regionId` and `zone`
are load-bearing (`requirements.ts`'s area check and `TaskContext.region`) and are pure arithmetic on
the player tile; `interfaceTexts` is load-bearing for `isLevelUp` and is fillable from LiteClient's
own interface tables; `hint`, `tutorial` and `flashingTab` are Tutorial Island affordances a combat
script never touches and ship inert. `client/src/hooks/worldExtras.ts` is written against a narrow
`ClientExtrasBridge` rather than against a `Client`, which is exactly the right shape - but it lives
in the `client` package, and `web/` cannot import it for the reason the vendoring paragraph above
gives. `collectWorldExtras` is therefore **copied** into `web/src/puppet/extras.ts` behind a
Lite-backed bridge, carrying the same "mirror; keep identical" header `web/src/clientTypes.ts`
already carries for `client/src/hooks/types.ts`, with one unit test running both implementations
over the same crafted bridges. Copying rather than moving leaves the canvas client's path untouched;
the cost is one mirrored file and one test, named here rather than discovered.

**The snapshot key.** `createWorkerHost` de-duplicates on `s.tick`, and its comment is emphatic that
this is deliberately not `revision ?? tick`, because `revision` only advances on the vendored
collector's publish path and keying on it once pinned every snapshot at revision 0. `LiteClient` may
well take that path. Rather than depend on reading that correctly, **the adapter does not emit
`revision` at all** and the host keys on `tick`, which is the same behaviour as the canvas client on
both settings. Getting this wrong is silent: every `wait.*` stops resolving and the run just sits
there. Ruling R7.

**The event derivation.** `createLocalTransport` forwards eight hook events (`login`, `logout`,
`disconnect`, `xp`, `inventory`, `chat`, `tick`, `action`); `LiteClient` publishes none of them, so
they are derived by diffing consecutive snapshots and from `SessionEndReason`. This is the largest
single piece of adapter code and the one place a puppet's behaviour can quietly differ from a
character's, so it is its own module with its own test.

### 5.3 The transport, member by member

`createPuppetTransport(session, opts): PuppetTransport` implements `Transport` and the same
`dispose()` contract as the local one. `getState` and `onState` fan out the merged snapshot;
`dispatch` wraps `executeBotAction` in the same `withTimeout` and the same `waiting` set so `cancel`
and `dispose` can settle in-flight work; `cancel` drains through the vendored `ActionQueue`'s
generation barrier, adding one facade method and one `PATCHES.md` row if `LiteClient` does not
already expose one; `say` goes to `client.say` through `withTimeout`; `relogin` restarts the session
with a fresh ticket and stays refused to scripts exactly as `workerContext.ts` already refuses it;
`logout` is `session.stop()`, fire and forget.

Three members differ deliberately:

- **`echo(text, colour)`** has no chatbox, so it is written into the match trace instead. A script's
  `c.echo` stays readable in the replay rather than vanishing.
- **`screenshot()`** rejects, and the caller is script code rather than a panel. `ScriptContext` has
  no screenshot member of its own, but it carries `sdk: BotSDK` (`web/src/tasks/types.ts`), the
  vendored SDK's `screenshot()` is `return this.transport.screenshot()`
  (`web/src/vendor/rs-sdk/sdk/index.ts`), and `worker.ts` routes that out of the Worker over RPC. So
  what meets this member is a library or user script calling `c.sdk.screenshot()` against a puppet
  that has no canvas. It **throws** an `Error` whose message is exactly
  `screenshot is not available on a puppet` - a stable string, not a resolved failure and not a
  blank blob - so a script written against the canvas transport degrades predictably: it fails at
  the call, with a reason the run report and the match trace can both read.
- **`humanInput(cb)`** returns a no-op unsubscribe and the watcher is never constructed. This one
  matters: `createHumanInputWatcher` pauses a run when a human touches the game canvas, which is
  right when the player and the script share a character and actively wrong here. Under D37 the
  player is off playing their own character, so wiring the watcher would let them pause their own
  ranked match by playing, silently, with a 30-second auto-resume. The same reasoning removes any
  analogue of `stage.ts`'s `forwardEscape`: the panic control for a match is a panel button, because
  the player may be pressing Escape at their own game. Ruling R29.

### 5.4 What is composed, and what is deliberately not

The puppet runtime is `wireTasks` with three wires cut:

| `wireTasks` wire | Puppet runtime |
|---|---|
| `createLocalTransport(hooks, canvas, ...)` | `createPuppetTransport(session, ...)` |
| `createWorkerHost({ transport, spawn, libraryManifests })` | unchanged, one Worker per puppet |
| `createTasksApi(...)` and the toggle store | **not built.** A puppet run is not a player run: it writes no run history, reads no per-account toggles, and never appears on `window.idlescape.tasks`. |
| `createHumanInputWatcher(...)` | **not built.** Section 5.3. |
| `deps.tasks.attach(session.id, api)` | **not called.** The tasks router must never point at a puppet. |

What replaces the api is a thin match controller consuming `host.onTrace`, `host.onStatus` and
`host.onRunEnd`, feeding the trace upload and answering the queue poll.

Ownership sits beside `frame/stage.ts`, not inside it. The stage owns one runtime per character
iframe and keys everything by `characterId`; a puppet has no iframe and no roster entry, so hanging
it off the stage's maps would put a fake character into `renderTabs`, `states()` and the Characters
panel. `web/src/puppet/` holds a `Map<matchId, PuppetRuntime>` owned by the same composition root,
and the root calls its `closeAll()` wherever it calls the stage's. Ruling R30.

### 5.5 What the player's own session keeps doing

Everything. The player's character stays where it was, the script it was running keeps running, its
run history keeps being written, its panels keep working, and the human-input watcher keeps pausing
that run when the player plays. The only cost is that a tab now hosts a second client: upstream
measures a headless client at 13.8 MB and 0.42 % of one core, one per tab here, which is small
beside the canvas client already in the same tab.

### 5.6 The later Bun host is three functions, not a class

SP5 hosts the same puppet in Bun for walk-away play. What it changes: `mintPuppetSession(matchId,
slot)` (the browser gets a ticket because it cannot set headers; Bun gets the `X-Idlescape-Owner`
header directly, because `openUpstream` already sets one), `startPuppetSession(creds)` (Bun keeps
upstream's disk cache and may use `/ondemand.zip`), and nothing else. `createPuppetTransport` is
shared verbatim, `WorkerHostDeps.spawn` is already a dep for substituting the Worker, and nothing
above `Transport` can observe the host.

**What does not carry over is the trust argument.** D24 holds only while script code runs in the
player's own browser. A Bun host runs another account's code on our machine beside our secrets, so
SP5 inherits an explicit isolation precondition on its scope line, in the same way D24 already puts
one on SP4c's. This spec writes that precondition down rather than leaving SP5 to discover it, and
records it in the decisions ledger as **D46**.

## 6. The server-side queue

Ranked only. Practice and challenge never enter it, and nothing in this section touches them.

```
            enqueue                  matcher pairs            both puppets in
  (none) ------------> waiting ------------------> armed --------------------> fighting
                         ^  |                        |                              |
      winner re-queued   |  | leave, or lose         | arm timeout                  | result
                         |  v                        v                              v
                         +--+--> (none)           waiting                  win: waiting
                                                                   loss or draw: (none)
```

Three states, not four: **liveness is a predicate, never a state**. The owner ruled that a stale
entry is skipped and resumes when the tab returns, so staleness never writes `state` and never
deletes a row. It is `now - last_poll_at <= 20_000`, evaluated by the matcher and by nothing else.
Ruling R13.

**Enqueue.** `POST /api/battlebots/queue`, human principal. Refuses 409 `already_queued` when the uid
already holds an entry. In one transaction it reads the character's stats from the engine (section
3.3), writes `bb_setups`, and writes `bb_queue`. The unique index on `bb_queue(uid)` carries two of
the owner's rulings at once: one ranked match per account, and same-account pairing made structurally
unreachable rather than merely checked. The explicit same-uid check in the matcher stays anyway, with
its own test, because the index is one migration away from being dropped and the check is the thing
that records why it mattered.

**Poll.** `POST /api/battlebots/queue/poll`, human, every 5 seconds from the shell while the account
holds an entry. It stamps `last_poll_at` and returns the caller's own view in the same round trip:
`{ state, position, waitingCount, band, matchId?, puppet? }`. One request carries both directions,
which is why this half is not SSE: the liveness signal travels client to server. The write is a
single `UPDATE ... SET last_poll_at` against one indexed row.

**Match.** A matcher on a 1-second interval on the front server, the shape `server/src/health.ts`
already uses. Five preconditions, all of them:

1. a free plot (`bb_matches.plot WHERE ended_at IS NULL`, eight rows);
2. two `waiting` entries that accept each other's level. Each entry's band is
   `5 + floor(waited_seconds / 15)` capped at 15, verbatim from the battlebots spec's section 11,
   but the predicate is **not** verbatim and cannot be: section 11 is `abs(cbA - cbB) <= band`
   against one shared band, which a pad-based queue could have because everybody standing on the
   pad widened together. A durable server-side queue gives every entry its own wait and therefore
   its own band, so the rule has to say which band wins. It is `abs(cbA - cbB) <= max(bandA,
   bandB)`: the generous reading, because letting a long waiter pull in a fresh entry is the whole
   point of widening, where `min` would mean a long wait widens nothing until its partner has also
   waited. Ruling R32;
3. different uids;
4. both entries fresh by the liveness predicate;
5. not the same pairing as either entry's immediately previous opponent, when another candidate
   exists. That is spec section 11's anti-repeat line, and it matters more here than it did there
   because the winner auto-re-queues.

FIFO within band: the oldest waiting entry is taken first, then its best partner.

**The front server owns plot allocation.** With the pad deferred by D38 nothing walks onto a plot,
and `~bb_free_plot` is RuneScript with no HTTP surface. `~bb_free_plot` stays as it is for practice
and challenge, which entry 11 keeps on the real character; ranked allocation is the open-header query
above. The two never contend, because a plot holding a live ranked match has two puppets standing in
it and is not free by `map_playercount` either.

**Leave.** `DELETE /api/battlebots/queue`, human. A `waiting` entry is deleted. An `armed` or
`fighting` entry forfeits (section 7.3), per spec section 13's forfeit rule, rather than vanishing.

**The only prune** is an operator sweep of entries whose `last_poll_at` is older than 24 hours. A tab
that comes back inside a day finds its place.

## 7. Arming, resolving, and the five endings

### 7.1 Arming

On a pair the front server, in one transaction, allocates the match id, writes `bb_matches` (header,
`armed_at`, plot, `schema_ver`) and two `bb_match_sides` (puppet name, owner uid, owner character,
setup id, `streak_before`), claims two `bb_puppets` rows for that plot, moves both entries to
`armed`, and mints a ticket per side. Then, out of band:

1. each tab, on its next poll, learns its puppet, its ticket and **its own side's frozen script
   source and params** (never the opponent's), starts a `LiteSession` over `/puppet-ws`, and posts
   `POST /api/battlebots/puppet/claim` once the puppet is in game;
2. when both sides have claimed, the front server calls `POST /puppets/:name/stats` for each side
   with that side's snapshot, then `POST /battlebots/arm` with the plot, the match id and each side's
   kit;
3. the engine drains the arm inside its next cycle (section 3.4), the RuneScript countdown runs, and
   the match starts. `started_at` is stamped on the first tick frame that arrives, and both entries
   move to `fighting`.

**Arm timeout.** If both claims do not land within 15 seconds, both entries return to `waiting` with
`queued_at` untouched, the header closes as `outcome='abort'`, `reason='arm_timeout'`, both puppets
are released and the plot frees. This is the only abort written without a fight, and it is what makes
a stale tab cost one arming cycle rather than a queue slot.

### 7.2 Resolving

The result path is entry 11's, unchanged: RuneScript publishes by writing varps and bumping
`%bb_match_seq`, and the post-cycle sweep posts one `bb_rows` row per fighter, keyed on the
**puppet's** name. This entry adds the resolution on top, in one transaction keyed on `match_id` so a
re-posted row cannot double-count (the battlebots spec's section 15 rule for wins, applied to
everything):

- resolve each posted row to its side on `(match_id, puppet_name)`, write `outcome` per side and on
  the header, seal the tick log, mark both `bb_puppets` rows `releasing` (R31, freed on a confirmed
  logout);
- **loser:** entry deleted, streak reset to 0, tab told to log its puppet out;
- **winner:** entry returns to `waiting` with `streak + 1`, the **same `setup_id`**, and `queued_at`
  refreshed to now. Refreshing is the fair reading of the spec's own "nobody starves at the edges": a
  winner keeping its original timestamp would hold FIFO priority for ever. Ruling R14;
- **draw:** both entries deleted and both streaks reset. A draw is not a win, and a streak is
  consecutive wins. Ruling R15;
- a win credits the ladder only if the same opponent character has not been beaten more than three
  times in the rolling 24 hours, the battlebots spec's collusion mitigation 3. An uncredited win
  still records and still counts for the streak, and is marked `credited = 0` on the side row.

**The 20-tick floor is not a `credited` flag, and this is the correction that matters.** Entry 11's
`[proc,bb_publish_result]` `return`s **before** the `%bb_match_seq` bump in two cases: any abort
(`if (%bb_outcome = ^bb_outcome_abort)`), and a ranked match shorter than
`^bb_min_recorded_ticks` (20). The overlay sweep only emits a row when that sequence changes, so in
both cases **nothing reaches `POST /internal/battlebots-result`** and the resolution transaction
above never runs: `bb_matches.ended_at` stays NULL, the header keeps its plot allocated by section
6's open-header query, both entries stay `fighting`, and section 3.5's reaper does not fire either,
because it kicks only a puppet with **no** live match row. A sub-20-tick ranked match and every
engine abort would therefore deadlock one plot and two accounts, silently, on paths entry 11 already
ships - `~bb_abort` fires when a fighter leaves the plot during the countdown.

The repair is a **front-server deadline on a live header**, not a change to entry 11's RuneScript,
which is what keeps "the result path is entry 11's, unchanged" true and keeps this out of section
16's list of doors. The matcher tick already runs every second; on the same tick it closes any
header with `ended_at IS NULL` whose `started_at` is set and whose last tick frame is older than 30
seconds, or whose `armed_at` is older than the arm timeout plus the match clock plus a 30-second
grace. It writes `outcome='abort'`, `reason='no_result'`, marks both puppets `releasing`, frees the
plot, and returns both entries to `waiting` at their original `queued_at` with both streaks
untouched - the same treatment section 7.3 gives an engine fault, which is what these are. A ranked
match too short to publish is recorded as an **abort**, not as an uncredited win. And because the
front server cannot read `battlebots.constant`, the floor lives on the server as
`BB_MIN_RECORDED_TICKS = 20` in `server/src/battlebots/resolve.ts`, with a comment naming
`^bb_min_recorded_ticks` as the copy it must equal and a test asserting the two agree. Ruling R33.

The two traces are uploaded by the tabs after the result (section 8.4). Resolution does not wait for
them: a trace that never arrives leaves a match with a result and no trace, which is the correct
degradation.

### 7.3 The five endings, and what each does to both halves

Every ending must reach the `LiteSession` and the script Worker, in that order of care.

| Ending | What runs |
|---|---|
| The match resolves normally | `host.stop('runner')` waiting up to `stopGraceMs` for `run_end`, then `session.stop()`, then `transport.dispose()`, then `host.terminate()`. `dispose()` settles every in-flight `dispatch` with `reason: 'disposed'`, which is what stops the Worker's RPC waiting out its own timeout against a transport that no longer exists; `localTransport.dispose` documents exactly this and the puppet copy keeps it. |
| The player forfeits, or leaves while armed or fighting | The same sequence, initiated from the panel. The side records a loss with `reason='forfeit'`, the opponent a win. |
| The `LiteSession` ends by itself | `onEnd` fires with `stopped`, `logged-out`, `disconnected`, `idle` or `error`; `logged-out` and `disconnected` map onto the synthesised hook events, then the same teardown. The front server sees the claim stop and treats the side as a forfeit unless the engine has already resolved the match. |
| The tab closes, or the player signs out | The composition root's `closeAll()` disposes every puppet runtime, plus a best-effort `beforeunload` `session.stop()`. The server never relies on it: the liveness predicate and the reaper (section 3.5) are the real defences. |
| The script Worker crashes | `workerHost`'s `onerror` path already synthesises a `run_end`, rejects the outstanding calls and terminates; the controller adds `session.stop()`, because a Worker corpse otherwise leaves a puppet standing in the arena doing nothing. The side forfeits with `reason='fault'`. |

`'runner'` rather than a new `Actor` member: `Actor` is `'player' | 'claude' | 'test' | 'runner'`
(`web/src/tasks/types.ts`), the value is persisted onto run records and read by the report, and the
runtime rather than a person ended this run.

Spec section 13's distinction is kept exactly: a script that faults out is a **loss** for that side;
an engine or arm fault is an **abort** with no result, both entries returned to `waiting` at their
original `queued_at`, both streaks untouched, and the match excluded from every projection. **An
abort reaches the store through the deadline in section 7.2 and never through a posted row**,
because `~bb_publish_result` publishes nothing on an abort. That is why the deadline exists and why
it is not optional.

**The idle hazard is named rather than assumed.** `lite/session.ts` ends a session with reason `idle`
after about 60 seconds of socket silence and keeps it alive with a roughly one-second `NO_TIMEOUT`
off a 20 ms loop. A backgrounded browser tab throttles timers, and a Worker is throttled less
aggressively than the main thread but not never. This is measured before the entry ships, beside
`docs/superpowers/measurements/2026-09-05-sp7-sessions.md`, and "puppet went idle" is a first-class
outcome of the poll rather than a surprise.

## 8. The store

Everything is additive on entry 11's `battlebots.db`, at `SCHEMA_VERSION = 2`. `bb_rows` is not
altered and the result hook is not touched.

### 8.1 The migration, first, because entry 11 cannot express one

Entry 11's `store.ts` applies `schema.sql` wholesale when the recorded version is lower, and
`schema.sql` is `CREATE TABLE IF NOT EXISTS` throughout: that path adds tables and cannot add a
column. Before anything else, this entry replaces the single-file apply with an ordered list
(`migrations/001.sql` being entry 11's own schema, `002.sql` this one), applied in order inside one
transaction with the version bumped at the end. Section 16 asks entry 11 to ship the ordered list
instead, which costs it nothing and saves this entry a rewrite of a file it does not own.

### 8.2 The tables

`bb_setups` (section 4): `setup_id` PK, `uid`, `character_id`, `game_name`, `script_id`,
`script_name`, `script_source`, `script_version`, `source_kind`, `params_json`, `kit_id`,
`stats_json`, `combat_level`, `queued_at`.

`bb_queue`: `entry_id` PK, `setup_id` UNIQUE, `uid`, `character_id`, `game_name`, `combat_level`,
`queued_at`, `state`, `streak`, `last_poll_at`, `match_id`, `plot`, `last_opponent`, plus
`CREATE UNIQUE INDEX bb_queue_one_per_account ON bb_queue (uid)`.

`bb_matches`: `match_id` PK, `schema_ver`, `mode`, `plot`, `armed_at`, `started_at`, `ended_at`,
`outcome` (`slot0` | `slot1` | `draw` | `abort`), `reason`, `ticks`, `tick_log` BLOB, `tick_log_kind`,
`retained`.

`bb_match_sides`: `(match_id, slot)` PK, `puppet_name`, `uid`, `character_id`, `game_name`,
`setup_id`, `streak_before`, `outcome`, `credited`, `trace_json` BLOB, with indexes on
`(game_name, match_id DESC)` and on `(puppet_name, match_id)`.

`bb_streaks`: `character_id` PK, `game_name`, `uid`, `current`, `best`, `updated_at`.

`bb_puppets`: `name` PK, `plot`, `slot`, `match_id` (null when free), `claimed_at`.

**`schema_ver` lives on the record, not only on the database.** A replay window opening a year-old
match reads that match's own version and refuses what it cannot draw, instead of guessing from the
database's current version. That is the doors-open line as the owner wrote it.

**`bb_match_sides` is the whole of the puppet indirection.** Every read a player sees resolves through
`bb_match_sides.game_name`; nothing user-facing reads `bb_rows.game_name` for a ranked match. The
result hook stays exactly as entry 11 built it and never learns that puppets exist.

**Practice and challenge have no side row**, because they stay on the real character. The history read
therefore reads the side row when one exists and falls back to `bb_rows.game_name` when it does not.
That fallback is where a puppet-aware history would quietly break the history it inherits, so it gets
its own test.

### 8.3 The tick log

Both fighters' position and hitpoints per tick, packed rather than rowed, because the log has exactly
one reader, is always read whole, and is never queried by field:

```
frame: tick u16 | slot0: x u16, z u16, hp u8, maxHp u8, flags u8
                | slot1: x u16, z u16, hp u8, maxHp u8, flags u8
```

Sixteen bytes a tick, 500 ticks at most, so about 8 KB sealed per match. `flags` carries the two bits
a schematic can honestly draw (in combat, dead) and six spare, which is the room a later viewer needs
(section 11.2).

**`x` and `z` are plot-local, not absolute, and the writer is what makes them so.** The overlay hook
reads absolute tiles off the `Player` object - plot 1 sits around x 4544 in `m71_70` - so the
collector subtracts the plot's south-west origin (the map square's base plus `ox`/`oz` from the
`PLOTS` export) before packing. Every packed value is then 0 to 23, which is what lets the schematic
in section 11.2 render a frame with no knowledge of where the plot sits in the world and lets a
replay survive a later regeneration of the region. The fields stay `u16` rather than shrinking to
`u8`: the frame stays sixteen bytes, and a larger plot needs no `packed-v2`. The pack and unpack
round-trip test asserts the range.

**The writer is the post-cycle overlay hook, not the RuneScript match clock.** The owner's round-two
line named the clock because that is what already samples hitpoints, but RuneScript cannot make an
HTTP request, and the overlay hook that `install.ts` already wraps around `World.cycle` sees every
`Player` object each cycle, so position and hitpoints are reads off the object with no new RuneScript
at all. It posts once per cycle carrying every active match's frame, about 100 requests a minute in
total regardless of plot count, over loopback, to `POST /internal/battlebots-ticks` under the same
defence as the existing result hook (`isTrustedHookSource` plus `timingSafeEqual` on
`x-idlescape-mgmt`, gate-exempt in `index.ts`'s pre-gate switch the way `bankHook` is). This is a
departure from the owner's wording that keeps the owner's intent, and it is ruled as one. Ruling R16.

Rejected: the puppet's own `LiteClient` reporting what it sees. Two browsers would disagree about one
match, and the owner ruled the engine is the only simulator.

**Live and sealed are two stores of the same frames.** While a match runs its frames live in a
per-match in-memory ring (500 entries, preallocated, eight rings at eight plots). At match end the
ring is packed into the BLOB and dropped. A server restart mid-match loses the ring and loses the
match with it, which is correct: both tabs lose their poll at the same moment and the match aborts
anyway.

### 8.4 The traces, and the end-of-run data

One per side, in `bb_match_sides.trace_json`, in the SP4b task 11 export shape verbatim:
`{ summary, events }`, where `summary` is `RunSummary` (which after SP4b carries `failReason`,
`itemsDelta`, `tilesTravelled`, `recoveries` and `characterName`) and `events` is `TraceEvent[]`.
Uploaded by each tab at match end through `POST /api/battlebots/match/:id/trace`, refused unless the
caller owns that side, and idempotent: a second upload for a side that already has one is a 409.

Storing the export shape verbatim is what lets the existing `buildRunReport(summary, events)` and
`renderTraceView` render a match trace with no second renderer, which is the argument entry 11's own
deferred list already makes.

**Why only ranked matches carry a trace here, which is not an oversight.** Practice and challenge
have no side row (section 8.2) and therefore no `trace_json`, and they need none: they run on the
player's own character, so the run writes a run report and a trace into that character's own run
history the way every other run does. A puppet run writes none (section 5.4), so the ranked side row
is the only place its trace can live. The owner's "more player-specific data about runs at run end"
is therefore answered by the side row for ranked matches and by the existing run history for the
other two modes, and no mode is left without one.

Bounds: the route accepts at most 1 MB, and the store keeps at most 128 KB per side, the tab trimming
from the front of the event list (the trace is already coalesced by SP4b) and setting
`summary.trimmed`. A typical five-minute combat run is tens of kilobytes, so the cap is a ceiling and
not a behaviour; section 8.5 says why the stored figure is 128 KB rather than the 512 KB an earlier
draft carried.

### 8.5 Retention

The owner ruled the battlebots spec's section 14 retention back in, reversing plan R16. "In full" is
exactly **two blob columns across three rows** - `bb_matches.tick_log` once per match, beside the
`retained` flag, and `bb_match_sides.trace_json` once per side - so retention is a **nulling pass
and never a delete**:

```sql
UPDATE bb_matches     SET tick_log = NULL, retained = 0 WHERE match_id IN (...);
UPDATE bb_match_sides SET trace_json = NULL             WHERE match_id IN (...);
```

Header and side rows are never deleted, for the reason SP3b's section 6 gives for `hidden = 1` over
deletion: the wins count and the streak are counts over header rows, and deleting them rewrites the
ladder.

**A match has two sides, so its blobs survive while either side still holds it inside its newest
100.** Pruning per character independently strips a match that is still inside its opponent's window,
and that is the thing a naive implementation gets wrong. The selection is a pure function from a list
of `(game_name, match_id, ended_at)` to a list of `match_id` to strip, unit tested with no database,
the shape SP3b's R5 already established for its own compaction.

**The owner's window is the rule; the disk bound is an alarm, not a silent second rule.** An earlier
draft put a 512 MB total blob budget above the window, "oldest stripped first regardless of the
per-character window", which quietly overrode what the owner ruled - and did so at a world size the
same paragraph offered as its justification. The arithmetic: a match is about 8 KB of tick log plus
two traces at the stored cap, so about 1 MB at 512 KB a side, and 512 MB is then roughly five
hundred matches, which is ten characters at a hundred each. "Thirty active characters at a hundred
retained matches each" was several times over its own budget.

So the bound is restated three ways. First, the **stored trace cap drops from 512 KB to 128 KB a
side** (a typical five-minute combat run is tens of kilobytes, so this is still a ceiling and not a
behaviour), which puts a fully retained match at about 264 KB and the ruled window at about 26 MB
per active character. Second, the disk bound rises to **4 GB**, which holds about 150 active
characters at their full ruled window on a Lightsail disk. Third, and this is the half that matters,
**exceeding it strips nothing by itself**: it raises a health warning on the same tick and logs the
ten largest holders; it then strips oldest-first **outside** every ruled window before it touches
anything inside one; and a strip inside a ruled window, if the volume is genuinely near full, is
recorded on the match row, so a player is never told "results only" about a match that should have
been kept in full. Section 14's Retention row carries the resulting bound. Both passes run at boot
and on a six-hour interval, the same tick SP3b's compaction and `VACUUM INTO` backup use, so a later
merge of the two databases' housekeeping is one timer and not two. Ruling R18.

## 9. Routes, and their auth

Existing shapes only: `principalRule` already returns per-`sub` for `pair`, hooks are gate-exempt in
`index.ts`'s pre-gate switch and authenticated by private source plus the management secret, and
public reads take `'none'` behind the gate cookie, which is how SP3b's hiscores routes and the wiki
reader work.

| Route | Principal | Gate | Notes |
|---|---|---|---|
| `POST /internal/battlebots-result` | none | exempt | entry 11, unchanged |
| `POST /internal/battlebots-ticks` | none | exempt | new: one post per engine cycle, every active match |
| `GET /puppet-ws?ticket=` | none | exempt | websocket upgrade; the ticket is the credential (section 3.2) |
| `POST /api/battlebots/queue` | human | yes | enqueue; mints the setup |
| `DELETE /api/battlebots/queue` | human | yes | leave, or forfeit if armed or fighting |
| `POST /api/battlebots/queue/poll` | human | yes | liveness plus own position; the only high-frequency route |
| `GET /api/battlebots/queue/stats` | none | yes | population; no names (section 12) |
| `POST /api/battlebots/puppet/claim` | human | yes | the tab reports its puppet in game for an armed match. Refused unless the caller's uid is `bb_match_sides.uid` for that slot; a second claim for a side already claimed is a no-op, never a re-arm |
| `POST /api/battlebots/match/:id/trace` | human | yes | the caller's own side only |
| `GET /api/battlebots/history` | human | yes | entry 11's, extended to resolve through `bb_match_sides` |
| `GET /api/battlebots/match/:id` | human | yes | header, sides, setup metadata. Script **name** only, never source |
| `GET /api/battlebots/match/:id/ticks` | none, then optional in-handler | yes | the sealed log, or the live ring with `?since=` |
| `GET /api/battlebots/match/:id/live` | none, then optional in-handler | yes | SSE frames |
| `GET /api/battlebots/streak` | human | yes | the caller's own characters, `current` and `best` |

`principalRule` gains one per-`sub` case, in the `pair` shape:

```ts
case 'battlebots':
  return route.sub === 'stats' || route.sub === 'ticks' || route.sub === 'live' ? 'none' : 'human';
```

**`'none'` means "no principal is required", not "no principal is available", and R21 needs the
difference.** `server/src/index.ts` calls `authn.authenticate(req)` only when the rule is not
`'none'`; on a `'none'` route `principal` stays null all the way into the handler, so a handler
given `'none'` structurally cannot compare an owner uid against anything. R21 asks the two viewing
routes to be gated-public for `mode='ranked'` and owner-only otherwise, which needs an identity. So
those two do what the wiki reader and wiki API already do for the same reason (`index.ts`'s pre-gate
switch says it out loud): they resolve an **optional** principal themselves, at the top of the
handler, before deciding. A ranked match is served to any gate holder whether that returns a
principal or not; a challenge or practice match is served only when it returns one whose uid owns a
side, and is a **404** rather than a 403 otherwise, so a match id does not leak the existence of a
private match. `GET /api/battlebots/match/:id` stays `'human'` and needs none of this. Moving both
routes to `'human'` instead was rejected because it would make ranked live viewing require a
sign-in that the gate cookie already stands in for.

**Who may watch.** The battlebots spec's section 14 makes visibility the owner's, with opponent-facing
detail limited to result and script name; the owner's round two wants live viewing, which is by
definition not the owner. One predicate reconciles them: **live and replay are gated-public for
`mode='ranked'` and owner-only for challenge and practice.** Ranked is a public ladder; a challenge is
a private arrangement between two players. A position track and an HP bar are not source, so a ranked
replay does not exceed the section 14 line, and `GET /api/battlebots/match/:id` never returns
`script_source` to anyone. The source is read exactly once, at arm, and handed only to the tab of the
account that wrote it, so that the puppet can run it (section 7.1).
The rejected alternative, owner-only replays with live restricted to the two participants, removes
most of the point of live viewing. Ruling R21.

## 10. The streak, and SP3b's registry

A streak is consecutive ranked wins by one character, maintained in the resolution transaction
(section 7.2) in `bb_streaks`, with `current` and `best`. It is a stored column rather than a
derivation over rows, because SP3b's R8 says the battlebots entry ships nothing further for the
projection: the projection therefore has to be a plain query.

**Two categories, both `subject: 'character'`, both `available()` false when the source is absent:**
`battlebots_wins`, which SP3b already registers, and `battlebots_streak`, new here. The streak ladder
ranks **`best`**; `current` is the panel's and the player page's live reading. A ladder of `current`
churns on every match and reads as "who is fighting right now" rather than as a record. Ruling R19.

**The seam is two views, and it must be settled before SP3b is planned.** SP3b's section 9 says its
category "groups ranked wins out of `BATTLEBOTS_DB` by `gameName`". Under puppets that column holds
the **puppet's** name, so SP3b as written would rank eight puppet accounts on the public ladder, and
SP3b lands one entry earlier. The repair is that this entry ships two views and SP3b's category code
reads views, never tables:

```sql
CREATE VIEW IF NOT EXISTS bb_ranked_wins AS
  SELECT s.game_name AS game_name, COUNT(*) AS wins, MAX(m.ended_at) AS updated_at
    FROM bb_match_sides s JOIN bb_matches m ON m.match_id = s.match_id
   WHERE m.mode = 'ranked' AND s.outcome = 'win' AND s.credited = 1 AND m.outcome <> 'abort'
   GROUP BY s.game_name;

CREATE VIEW IF NOT EXISTS bb_streaks_public AS
  SELECT game_name, current, best, updated_at FROM bb_streaks;
```

SP3b's `page()` then changes source and not shape, and this entry can change its schema underneath
without touching entry 13's code. **Entry 13's plan is not yet written**, so this is a requirement on
that plan and not an amendment to shipped code: the views do not exist until this entry ships, so
SP3b's `available()` must probe for the **view** rather than for the database file, and reports the
category unavailable until then. That guard is one line, and it is the difference between a hidden
category and a 500. Ruling R20, recorded as **D44**.

Privacy is inherited from SP3b's section 6 with nothing added: `uid` never appears in a response body,
`updatedAt` rounds to the minute, and a soft-deleted character leaves the public table on the next
write while its owner keeps its detail routes.

**The panel is the reading**, per the owner, and it is the *only* reading: this entry adds no in-game
surface at all. An earlier draft carried the owner's optional chat line as a single `mes` from
`~bb_resolve` naming the new streak. That cannot work on the ranked path. `[proc,bb_resolve]` runs
on the **fighter** (it is where entry 11's `mes("You won the match.")` already lives), and on a
ranked match the fighter is a puppet: a headless `LiteClient` with no chatbox, whose owner is
playing a different character in a different session, and whose transport deliberately has no chat
surface (section 5.3 routes `echo` into the trace instead). The line would reach nobody, and the
per-account toggle the draft named had no column, no route and no path from the front server into
RuneScript. Both are dropped. Routing the notice to the owner's own shell is possible and cheap
later - the resolution transaction already answers that account's next queue poll, so the poll
payload carries the new streak as data and a shell toast is one reader over an existing field - and
it is deliberately not built here. This is the reading of the owner's "optional" that does not ship
a line into the void.

## 11. Replays, live viewing and the spectator feed

### 11.1 The window

`web/src/frame/matchWindow.ts`, composed exactly as shell v2's Task 16 composes the trace pop-out,
out of the chrome its Task 7 writes into `overlay.css`: `.window`, `.window-head`, `.window-title`,
`.window-sub`, `.window-body`, `.window-foot`, with the studio spec's section 4.2 family defaults
unmodified, because this is not the bank.

```ts
export interface MatchWindow {
  open(matchId: number, opts?: { live?: boolean }): Promise<void>;
  close(): void;
  isOpen(): boolean;
  push(frame: TickFrame): void;   // live append; ignored when another match is shown
  dispose(): void;
}
export function createMatchWindow(host: HTMLElement, deps: MatchWindowDeps): MatchWindow;
```

with a stage-level `#battlebots-host` in `web/src/partials/frame.html` beside `#trace-host` and
`#bank-host`, an `onClose` the panel button consumes to un-press itself, close on the x and on
Escape, and the same assertion Task 16 makes that Escape is never taken away from the panic key.

**The z-lane.** D26 records that shell v2 gives `.window` `--z-overlay + 1` and `.trace-window` `+ 2`
and names no lane for a third stage window. The match window takes the same `+ 2` lane as the trace
pop-out, and the host appends the most recently opened window last, so DOM order decides between two
stage windows rather than a growing ladder of z values. One line, and it belongs in this entry's plan
or in entry 4's reconcile pass while that is still open. Ruling R23, recorded as **D48**.

### 11.2 The schematic, and nothing past it

- **A schematic of the plot, not the game canvas.** A plot is exactly 24x24 including a one-tile
  blocked border (plan R14), so the drawing is one inline `<svg viewBox="0 0 24 24">` scaled by CSS: a
  floor rect, a border ring, a faint grid. No canvas, no tileset, no camera, no assets.
- **Two markers**, `<circle r="0.45">` at `(x + 0.5, 23 - z + 0.5)`, where `x` and `z` come straight
  off the frame and are **already plot-local**, 0 to 23, because the tick writer subtracts the plot
  origin before packing (section 8.3). The renderer therefore needs no `PLOTS` lookup, and a replay
  does not depend on the generator's constants still saying what they said when the match was
  fought. The axis flip is deliberate (RuneScape z increases north, SVG y increases down) and is the
  one piece of arithmetic with its own unit test, which covers the flip and both ends of the range. Slot 0 accent-toned, slot 1 a second tone, each labelled with the
  **owner's** character name from `bb_match_sides`, never the puppet's.
- **Two HP bars**, `.meter` with `.meter-fill.meter-hp` from the shell v2 data family, width
  `hp / maxHp` from the same frame.
- **A transport strip** in `.window-foot`: mono `tick N / 500`, play and pause, and a scrub range for
  a replay. Live mode hides the scrub and shows a live dot.

Everything else is a second release: no pathing, no tweening beyond a CSS transition on the marker
position, no hit splats, no items, no prayer icons, no free camera.

**The window reconstructs the recorded outcome and never re-simulates.** Nothing in it asks the engine
anything, and the same renderer draws a live match and a year-old one because both hand it the same
`TickFrame[]`. That is the battlebots spec's section 14 replay-fidelity line, and it is why the
schematic is a design rather than a compromise: everything a combat script reads is server state that
both clients carry, and the only thing genuinely lost by a headless puppet is a camera.

**What a later 3D viewer would need**, so this record does not foreclose it: the six spare `flags`
bits, plus an animation id and a facing per fighter per tick (four more bytes a frame, a `packed-v2`
kind, and `schema_ver` already on the record to tell the two apart), plus a renderer holding the
client's model and animation caches. That is SP5's problem or a client-patch entry's, not this one's.

### 11.3 The feed

SSE, copying the mechanism `server/src/bank/routes.ts` already runs: a `streams` map, a
`': open\nretry: 3000\n\n'` preamble, a 15-second heartbeat comment, `x-accel-buffering: no`, and a
`release()` that is idempotent because `cancel` and `abort` both fire and not always in the same tick.
Frames are batched into one event per engine cycle, so a viewer gets one event per game tick.

Two differences from the bank stream, which are exactly the things a copy would get wrong:

- **The bank sends a version and the browser fetches the truth; a frame stream sends the payload.** A
  dropped frame is a hole, not a stale number. So every frame carries its tick, the client detects a
  gap, and a gap triggers one `GET /api/battlebots/match/:id/ticks?since=N` against the ring. The
  stream stays an accelerator over a fetchable truth, which is why the polling route exists beside it
  rather than instead of it.
- **The cap is per match, not per owner.** An owner stream has a handful of subscribers; a match
  stream has as many as want to watch. Three caps: 20 per match, 4 per account, 64 global, with 429
  `too_many_streams` as the bank already returns. Ruling R22.

## 12. Queue population, and what is public about it

`GET /api/battlebots/queue/stats`, gate-scoped and principal-free, answers:

```ts
{ waiting: number; fighting: number; freePlots: number;
  bands: Array<{ from: number; to: number; waiting: number }>;   // level buckets of 10
  medianWaitSec: number | null; longestWaitSec: number | null }
```

No names, no character ids, no uids, no per-account anything, cached in memory for 5 seconds. Five
seconds is **this entry's own choice and not SP3b's precedent**: SP3b's section 9 caches its read
routes for 30 seconds, which is right for a ladder page and wrong for a population line a player
reads while deciding whether to queue, on a panel that refreshes every 15 seconds. "The number of people in each queue" is the owner's line and the band buckets are
the honest reading of it: there is one queue, and what a player wants to know before joining is
whether anyone near their level is in it. A signed-in caller additionally gets its own position from
the poll, which is the authenticated route and not this one.

## 13. The panel surfaces

One panel, the `battlebots` panel entry 11 ships, extended. **The panel id does not change**, because
panel ids in `web/src/types.ts` are a persisted data contract. Everything is composed from the shell
v2 living library (`.panel-section`, the button and pill families, `.meter`, the empty-state and
error shapes), with no per-panel selectors, per the library rule entry 4 establishes.

- **Queue.** Script picker (the account's library and user scripts, the same source the Tasks panel
  reads), kit picker (three), and one primary button. While queued it becomes a live section: state,
  position, band, elapsed, and a Leave button that is a forfeit while a match runs. The refusals are
  spelled: `already_queued`, `no_character` (the account must have a character in game to snapshot),
  `script_disabled`, `puppet_pool_empty`.
- **Streak.** The signed-in account's own `current` and `best` per character, from
  `GET /api/battlebots/streak`, with a rank pill when SP3b's category is available. An account sees
  its streak long before it is anywhere near the board, which is the owner's "the panel is the
  reading".
- **Population.** The stats route, rendered as one line plus the band buckets, refreshed on panel
  open and every 15 seconds while it is visible.
- **Matches.** The history list entry 11 ships, now resolving through `bb_match_sides`, each row
  carrying the opponent's owner name, the outcome, the duration, the streak at the time, and two
  buttons: **Replay** (opens the match window) and **Trace** (opens the existing trace view over the
  stored export, no second renderer). A row whose blobs have been pruned shows the result and says
  so, which is what "results only beyond that" looks like to a player.
- **Watch.** While any ranked match is running, a short list of live matches with a Watch button. This
  is the whole of the discoverability of live viewing, and it is why the feed is gated-public rather
  than owner-only.

There is no in-game surface at all: the streak notice an earlier draft put in the chatbox is dropped
for the reason section 10 gives, and the panel is the whole reading. No new interfaces, so plan R9
survives comfortably.

## 14. Limits and throughput

Everything here is the owner's ruling or an arithmetic consequence of it.

| Bound | Value | Why |
|---|---|---|
| Concurrent ranked matches | 8 | One per plot (plan R14). More plots is a regeneration with a higher plot count, not new code. |
| Puppets | 16, two per plot | The pool is the concurrency limit, so no allocator can outrun it. |
| Puppet sessions on the engine | 16 | Trivial for it; they are ordinary players. |
| Ranked matches per account | 1 | The unique index on `bb_queue(uid)`. |
| Same-account pairing | refused | Structurally, by the same index; the matcher's check is belt and braces. |
| Match length | 500 ticks, 5 minutes | `^bb_match_ticks`, inherited. |
| Throughput ceiling | about 100 matches an hour | 8 plots at 5 minutes plus arming. Far above what a private world will want. |
| Queue poll | 5 s; stale at 20 s | Two missed polls skip, a third does not drop. |
| Arm timeout | 15 s | One arming cycle, not a queue slot. |
| Tick posts | 1 per engine cycle, about 100 a minute | One request carries every active match's frame. |
| Sealed tick log | about 8 KB a match | 16 bytes times 500 ticks. |
| Trace | 1 MB accepted, 128 KB stored per side | The traces, not the positions, are what make the record big; section 8.5 sizes the stored cap against the retention window rather than against nothing. |
| Live viewers | 20 per match, 4 per account, 64 global | The bank's per-owner cap, re-scoped. |
| Retention | newest 100 matches per character in full, union across both sides. About 264 KB a fully retained match, so about 26 MB per active character and about 4 GB at 150 of them, which is the disk **alarm** and not a second rule | Spec section 14 is the rule; section 8.5 says why the disk bound warns first, strips outside every ruled window before it touches one, and records the row when it has to. |
| Setups per account | 200, oldest source nulled, excluding any setup a queue row still points at | A setup outlives its entry and must not outlive the disk; the exclusion is what stops a streak arming with a null source (section 4). |

Two costs worth stating plainly rather than discovering. **Both players must be online**, which is
plan R5's stated cost surviving D37 intact, and it is panel copy. **Tick fairness is at the mercy of
two browsers**, which the owner accepted for a private world; the engine is still the only simulator,
so a slow browser makes a bot act late, not act unfairly.

## 15. Security

### 15.1 A puppet is reachable only by its owner's script

Four independent mechanisms, in the order an attacker meets them:

1. **The transport is in-process.** A script Worker only ever receives the transport it was
   constructed with, and the puppet's transport exists only inside the tab that hosts it. There is no
   name, id or handle by which a script could ask for another puppet's transport.
2. **The ticket.** Opaque, 32 bytes of randomness, single use, 30 s TTL, bound at mint to
   `{ matchId, slot, puppetName, uid }`. It is minted only for a side of a live armed match and only
   handed to the poll of the account that owns that side.
3. **The assertion.** The front server, not the browser, mints `X-Idlescape-Owner` and puts it on the
   upstream handshake. It is an HMAC keyed with `ownerSecret`, which never leaves the server, so the
   browser cannot log a puppet in at any other time or for any other reason (section 3.2).
4. **The engine.** `PlayerLoading.load` refuses any socket whose assertion does not name the character
   the login block decrypted to, under `requireOwner`, which production forces on.

Other players' scripts see a puppet only as an entry in `nearbyPlayers`, which is ordinary world
state and is exactly what the arena is for.

### 15.2 D24's trust model is unchanged

D24 rules that a Worker-resident script is trusted as the account's own code, and that the blast
radius is bounded because no cross-account script sharing exists. Neither half moves here. The code
still runs in the player's own browser. The account it drives is not the player's own, which is the
one new sentence, and it is bounded by what a puppet is: issued to that player for that match, owning
nothing, holding an empty owner bank it cannot reach, standing in a walled region with no bank, no
shop, no ground items worth taking and no other players except its opponent. A script that escapes
its sandbox on a puppet gains a character that is deleted from the pool at resolve.

What would move D24 is hosting the Worker on our machine, which is SP5, and this spec writes that
precondition onto SP5's scope line rather than leaving it to be discovered (section 5.6).

### 15.3 The stat claim is not the browser's to make

Section 3.3. The snapshot is read from the engine and written by the engine; the browser never posts
one. This is the one place where "the script is the account's own code" is not a sufficient argument,
because the claim sets the opponent's difficulty rather than the caller's own behaviour.

### 15.4 Puppets are invisible to everything that enumerates players

- **SP3b's ingest** resolves `characters/{characterId}`; a puppet has no document, so an ingest for a
  puppet cannot resolve. Structural, not a filter.
- **The hiscores** read `bb_ranked_wins` and `bb_streaks_public`, which project through
  `bb_match_sides.game_name`, the **owner's** character. A puppet name cannot appear on a ladder.
- **The Characters panel and the session manager** read the character store, which has no puppet rows.
- **`GET /api/battlebots/match/:id`** returns owner character names; puppet names are internal and are
  never rendered anywhere a player can read them.
- **The name reservation** in `server/src/gameName.ts` stops a player taking a puppet name and being
  mistaken for one.
- **The player count** SP6 ships counts what the engine reports, which includes live puppets. That is
  the one enumeration a puppet legitimately joins, and the stats route's `fighting` count is what
  explains it.

### 15.5 The new surfaces, and their defences

The two hook routes are private-source plus `x-idlescape-mgmt` with `timingSafeEqual`, gate-exempt,
exactly as `bankHook` is. The three engine management routes are on the management app only, bound to
127.0.0.1, secret-compared the same way, and not registered when the secret is empty, exactly as the
owner-bank routes are. `/puppet-ws` is the only new unauthenticated public surface and its whole
authentication is the ticket; an invalid, expired, reused or mismatched ticket is a 401 before any
upstream socket is opened, and ticket redemption is rate limited per address.

## 16. What entry 11 must leave open

The owner's round-two list names four doors. Restated here as the minimum each costs entry 11, so
that entry does not over-build and this one does not have to rewrite a file it does not own. These
are requirements on entry 11's brief and are recorded as **D43**.

**One reading is declared rather than smuggled.** The owner's second and third lines are indicative
- "the match record carries ... a tick log", "the store's setup fields" - and this section turns
them into "left possible rather than built". That is a reading of a list headed "Doors to leave
open", not a restatement of it, and it is the reading this entry needs: entry 11 has no puppet, no
setup and no second fighter to log, so building either now would be building against a shape that
does not exist yet. If the owner meant "entry 11 ships them", the cost is entry 11's and this is the
section to say so in.

1. **A schema version, and an ordered migration list.** Entry 11 keeps its `schema_version` table and
   applies `migrations/001.sql` from an ordered list rather than applying `schema.sql` wholesale. It
   is the same SQL; what changes is that a second migration becomes possible. Without it this entry
   rewrites `store.ts`'s boot path.
2. **A tick log, and the two traces, left possible rather than built.** Entry 11 emits neither. What
   it must not do is collapse the post-cycle sweep into a single-purpose function:
   `sweepBattlebots(players)` stays one call among the block's calls, so a second per-cycle poster is
   an addition and not a refactor. The owner's line pairs the tick log with "the two run traces in
   the SP4b export shape", and **that half asks nothing of entry 11**: practice and challenge run on
   the player's real character and therefore already write a run report and a trace into that
   character's own run history (section 8.4), so the only trace entry 11 could store is one it
   already stores elsewhere. The trace store lands here, on the ranked side row, because a puppet
   run writes no run history. D43 is amended by this paragraph, not contradicted by it.
3. **The setup fields, left possible rather than built.** Entry 11 ships no setup table and no setup
   columns. What it must do is not derive identity from `bb_rows`: no `UNIQUE` on `match_id`, no
   assumption that two rows with one `match_id` is the whole of a match, and `mode` kept on the row.
4. **The puppet-to-owner mapping.** Entry 11 ships no side table, and must route every user-facing
   read of a fighter's name through one resolver function rather than reading `bb_rows.game_name` at
   the call site. That is one function in `store.ts` and it is where this entry inserts the side join.
5. **The panel's Queue action is stubbed**, disabled with a "coming with the queue entry" line, so the
   panel's shape does not change under a player when this entry lands.

Two things entry 11 should also know, which are not doors: the owner's retention ruling **reverses**
its R16, so R16 should not be defended in review as though it still stood; and its
`hookContract.test.ts` obligation is inherited by every new hook here, so the tick hook is pinned from
both sides the same way.

## 17. Dependencies, placement, and the name

**Placement** is immediately after SP3b and before SP10, per D39, because it registers a category into
SP3b's registry and extends the store SP3b projects over. It cannot move earlier without either
shipping the streak category twice or shipping puppet names onto the public ladder for one entry's
duration.

**Hard prerequisites:** entry 11 (everything in section 2.1), entry 4's `Window` family and library
(section 11.1), SP4b's run export (section 8.4) and its e2e harness (section 19), SP3b's registry
(section 10).

**How this splits.** This entry is at least as large as entry 11, whose comparable spec needed a
thirteen-task plan, so the split is ruled here rather than left for a plan-writer to invent. **Three
plans, in this order**, with the seam between them named.

1. **The puppet host.** The vendor closure and its measurement, the map bundle emitter, the
   transport, the event derivation, the extras mirror, the runtime and its five endings, the
   `runtimes` map and `closeAll()`. Its seam to the rest is a stub queue client: a hard-coded ticket
   and match id, minted by a test-only route, is enough to run the whole plan. **Its first task is
   the proof of life in section 19**, and nothing downstream is worth planning until that passes.
2. **The queue, the store and the resolution.** The ordered migrations, the six tables and two
   views, the setup freeze and cap, the queue and matcher, the ticket mint and redeem,
   `/puppet-ws`, the five engine management routes and the arm drain, the resolution transaction,
   the deadline, the reaper, retention, and the thirteen routes. Its seam upward is the poll payload
   and the claim, both of which plan 1 has already consumed as stubs; its seam downward is the tick
   ring, which plan 3 reads.
3. **The window, the feed and the panel.** The match window, the schematic, the SSE fan-out and its
   caps, the five panel surfaces, the streak reading, and the two views' handover to SP3b.

**The minimum shippable slice is plans 1 and 2 with the panel's Queue and Matches sections only:**
ranked matches run on puppets, are recorded, and are readable as a result list. Live viewing and the
replay window are what a plan may be cut to if the sprint runs short, and cutting them costs the
store nothing, because the tick log is written either way and the window is only a reader of it.

**The name.** The plan's closing paragraph raises it: "BattleBots" is an active trademark and
`osrs.scotho.com` is public-facing. Entry 11 keeps the region staff-only, so this is the entry that
makes the thing usable by every player, and therefore the entry that owns the rename. The rule is
narrow: **player-facing strings say "Bot Arena"** (the panel title, the window title, the lobby
welcome line, the chat line), and **every identifier stays exactly as it is** - the `battlebots`
panel id (a persisted data contract), every `bb_*` RuneScript name, every pack name, every route path,
every table name, `BATTLEBOTS_DB`, and the file names in this spec. Ruling R25, recorded as **D47**.

## 18. File structure

Nothing over 400 lines except vendored code, which is exempt by existing convention and is said out
loud in section 5.2.

**This entry allocates no pack ids and appends to no `.pack` file.** No obj, inv, loc, npc or varp id
is added; the sprint's section 3 pinned table is untouched and entries 10 and 11 remain the only two
that append. Everything it adds on the engine side is TypeScript overlay
(`engine-custom/src/idlescape/`) over names entry 11 already allocated, plus a proc entry 11 already
wrote. The one RuneScript constant it must know, `^bb_min_recorded_ticks` = 20, is duplicated as
`BB_MIN_RECORDED_TICKS` in `server/src/battlebots/resolve.ts` with a test asserting the two agree
(section 7.2), because the front server cannot read `battlebots.constant`.

New files, with the split that keeps them under the ceiling:

```
web/src/puppet/
  types.ts             puppet-side types: TickFrame, PuppetSession, PuppetRuntime, MatchClaim
  session.ts           mintless start/stop over the vendored LiteSession; ticket to socket
  transport.ts         createPuppetTransport: the Transport members (section 5.3)
  events.ts            the hook-event derivation from consecutive snapshots (its own module, 5.2)
  extras.ts            ClientExtrasBridge over LiteClient; regionId and zone arithmetic
  runtime.ts           one puppet: session + WorkerHost + controller, and the five endings
  runtimes.ts          Map<matchId, PuppetRuntime>, closeAll(), owned by the composition root
  queueClient.ts       the 5 s poll, the claim, the trace upload
web/src/frame/
  matchWindow.ts       the Window composition, open/close/push/dispose
  matchSchematic.ts    the SVG: plot rect, markers, meters, the z flip
web/src/vendor/rs-sdk/lite/        vendored, exempt, with its PATCHES.md rows
web/src/vendor/rs-sdk/client-src/  the `#/` import closure lite/ needs, vendored beside it (5.2),
                                   reached by a `#/*` mapping scoped to this directory alone
web/src/data/battlebots-map.bin    generated by scripts/gen/battlebotsMap.ts

server/src/battlebots/
  types.ts             row, header, side, setup, queue entry, frame, stats
  migrations/002.sql   this entry's tables, indexes and views
  setups.ts            freeze, read, cap
  queue.ts             enqueue, poll, leave, the state transitions
  matcher.ts           the 1 s tick: bands, liveness, plots, pairing
  arm.ts               ticket mint and redeem, the engine arm call, the arm timeout
  resolve.ts           the resolution transaction, streaks, credit rules
  ticks.ts             the ring, the pack and seal, the since-cursor read
  live.ts              the SSE fan-out and its caps
  retention.ts         the pure selection function plus the nulling pass
  puppets.ts           the fixed table, claims, the reaper
  routes.ts            the thirteen routes (split into routes.read.ts if it grows)
  views.sql            bb_ranked_wins, bb_streaks_public
server/src/proxy/puppetWs.ts    the /puppet-ws upgrade: redeem, mint assertion, openUpstream

engine-custom/src/idlescape/
  battlebotsArm.ts     the arm queue, the drain inside the post-cycle hook, [proc,bb_arm]
  battlebotsTicks.ts   the per-cycle frame collector and its post
  puppetStats.ts       the stat read and write routes, the roster and kick routes
```

Modified: `server/src/router.ts` (one route kind, one `principalRule` case), `server/src/index.ts`
(one pre-gate exemption), `server/src/gameName.ts` (the reserved prefix),
`server/src/auth/ownerAssertion.ts` (the `bbp-` refusal), `server/src/battlebots/store.ts` (the
ordered migration list, if entry 11 has not shipped it), `engine-custom/src/idlescape/install.ts`
(two calls in the existing post-cycle block), `engine-custom/src/idlescape/management.ts` (three
registrations), `scripts/gen/battlebotsMap.ts` (emit the bundle), `web/src/frame/` composition root,
the `battlebots` panel, `web/src/partials/frame.html`, `web/src/styles/overlay.css` (the z line),
`web/styleguide.html` (the schematic), `web/tsconfig.json` and `web/vite.config.ts` (the `#/*`
mapping and the matching alias, both scoped to the vendor closure), `CREDITS.md` (a new row for the
vendored `lite/` tree and its closure, and a correction to the line that today says rs-sdk's
headless lite client is **not** vendored), and the three `PATCHES.md` files that gain rows. The
`CREDITS.md` row is an obligation, not a courtesy: it comes from the same roadmap paragraph that
grants vendored code its exemption from the 400-line ceiling. Sprint entry 2 ships the static gate
that enforces that ceiling (C16) before this row lands, so that gate must exclude `vendor/`.

## 19. Testing

**Proof of life, first, and it gates the entry.** Everything here is dead if a headless `LiteClient`
will not run in a `DedicatedWorkerGlobalScope` against our 274 pin. The bet has real weight behind
it - the port off Bun is mechanical, upstream ships a `bench-browser.ts` that says somebody has run
this in a browser, and the seam it plugs into already exists - but it is still a bet, and it sits
under a vendor closure, a map emitter, an event derivation built by diffing snapshots and a timer
throttling question. So **task one of plan 1 (section 17) is a spike with an explicit gate**: a
puppet logs in over `/puppet-ws`, walks one tile, and publishes a snapshot the **existing**
`createWorkerHost` accepts and de-duplicates on `tick`, in a backgrounded tab, with the idle
measurement of section 7.3 taken in the same sitting and written beside
`docs/superpowers/measurements/2026-09-05-sp7-sessions.md`. If it fails, D37's premise fails with
it, and the honest answer is not to work around it in this entry: the puppet host moves to SP5's Bun
half under the isolation precondition D46 already writes, and this entry ships plans 2 and 3 against
that host instead. Naming that here is cheaper than discovering it in task nine.

**Unit, web.** The transport against a fake `LiteSession` (dispatch, timeout, cancel, dispose settling
in-flight calls, `screenshot` rejecting, `humanInput` never firing). The event derivation, per event,
from crafted snapshot pairs, including the two that come from `SessionEndReason`. The extras bridge:
`regionId` and `zone` arithmetic against known tiles, `interfaceTexts` feeding `isLevelUp`. The
schematic's coordinate transform, including the z flip and both plot origins at the extremes. The
match window: open, push, close, `onClose`, Escape reaching the panic key, and a `schema_ver` it
cannot draw refusing legibly. The queue client's poll cadence and its teardown clearing the interval,
which is audit C18's failure shape. `runtime.ts`'s **five endings**, one test each, asserting the
order (`host.stop`, `session.stop`, `transport.dispose`, `host.terminate`) and that `dispose()`
settles every in-flight dispatch; and `runtimes.closeAll()` over two runtimes where the first
throws, because that teardown is what section 3.5's first defence rests on and an unhandled throw
there leaves a puppet standing.

**Unit, server.** The retention selection as a pure function over timestamp lists: the both-sides
union, the exact 100 boundary, an empty list, and a match inside one window and outside the other. The
band schedule at 0, 15, 150 and 1000 seconds. The pack and unpack of a tick frame, round tripped. The
credit rules (20-tick floor, three per opponent per 24 hours). The ticket: single use, expiry,
mismatched match, mismatched uid. The **reaper predicate** as a pure function from a roster, the open
match headers and the `bb_puppets` rows to a list of names to kick and rows to free, including
R31's `releasing` case. The **deadline predicate** the same way: a header whose frames stopped 30
seconds ago, a header armed past its budget, a header that resolved normally and must be left alone,
and a ranked match that ended under 20 ticks and therefore never published a row at all.

**Unit, engine overlay**, in the shape entry 11's Task 9 already uses for `sweepBattlebots`, and for
the same reason: three new `engine-custom` files would otherwise ship with no test of their own.
`battlebotsArm.ts`: an arm posted to the Fastify handler runs on the **next** drain and never inside
the handler; both sides get `%bb_opponent` set to the other's uid before either proc runs; an arm
naming an unknown or offline character is refused whole rather than half-applied; and a drain that
throws on one arm still drains the rest. `battlebotsTicks.ts`: the collector emits one frame per
active match and none for an idle plot, and its coordinates are plot-local (section 8.3).
`puppetStats.ts`: the write refuses a name outside the puppet table and a puppet whose `%bb_state`
is not idle, and the roster read lists exactly the puppets in game.

**Integration, server**, against the emulator, in the shape `server/src/bank/routes.test.ts` uses: the
whole queue lifecycle into a temporary database (enqueue, poll, pair, arm, claim, resolve, winner
re-queued with a fresh `queued_at` and the same setup, loser gone); same-uid pairing refused with the
index dropped and with it present; a stale entry skipped and then matched when it polls again; the
arm timeout returning both entries with `queued_at` untouched; the trace upload refused for a side the
caller does not own and 409 on a second upload; every read route's principal and gate; a ranked
replay readable by a third account and a challenge replay not; the two views returning the owner's
name and never a puppet name. Plus a `hookContract.test.ts` for the tick hook, pinned from both sides,
because that file exists exactly because two halves once passed against their own fakes while
disagreeing with each other.

**Live stack, Playwright**, run from `web/` and never from the repository root, in the shape SP4b's
task 14 established: `web/e2e/harness.ts`'s `seedCharacter` and tick-budgeted `runUntil`, artifacts on
the second failure, `retries: 1`. One spec, `web/e2e/battlebots.pw.test.ts`, with two browser contexts
in one test so both sides are live:

1. two guest accounts sign up, each seeded to a fixed combat level with `::setstat`;
2. both queue with the same library combat script and the same kit;
3. both tabs are asserted to have a puppet in game: each account's `POST /api/battlebots/queue/poll`
   reports `fighting`, and the engine's management roster read `GET /puppets/online` - the same one
   the reaper uses, over the loopback management port `web/playwright.config.ts` already loads
   `ENGINE_MANAGEMENT_SECRET` for - names both puppets. There is no front-server player-count route;
   an earlier draft of this step asserted one that does not exist;
4. `runUntil` on a tick budget until the match resolves, asserting a header row, two side rows, a
   sealed tick log longer than 20 frames, and two traces;
5. the loser's entry is gone and the winner's is `waiting` with `streak = 1`;
6. the match window opens from the panel and draws two markers whose positions move between two
   frames, and the live stream delivered at least one frame during the match;
7. both puppets are logged out within one reaper cycle of the resolution.

**What the e2e has to be given, because the existing Playwright project does not supply it.**
`web/playwright.config.ts` is `timeout: 120_000`, `workers: 1`, `retries: 1`. This test signs up two
accounts, seeds two stat sets, enqueues twice, waits out an arm, fights a match and then waits a
reaper cycle; it does not fit in 120 seconds and must not be left to try. Two things are stated here
so a plan does not have to invent them. It sets its own `test.setTimeout(300_000)`, the one place in
`web/e2e/` that overrides the project default, with a comment saying why. And the match is made
**short by seeding, not by a shortened clock**: both accounts are seeded into the same band but with
hitpoints low enough that the fight ends by death in well under a hundred ticks, so nothing about
`^bb_match_ticks` changes and no engine constant becomes test-only. The 20-tick floor is the lower
bound the seeding has to clear, and step 4 asserts the resolved tick count sits between 20 and 100 -
which is also the assertion that would catch the floor silently swallowing a match. The step 7 wait
is asserted against the reaper's configured interval rather than a hard-coded sixty seconds.

**The stack runs with `-Prod -DevStaff` and `OWNER_REQUIRE_ASSERTION=true`, and the third of those
is not optional.** `-Prod` in `scripts/start-stack.ps1` only skips the emulators and vite dev (the
front server serves the built `web/dist` instead, and `scripts/verify.ps1` already starts the stack
that way); it does not touch the engine's `node.production`, which comes from
`engine/server/data/config/world.json` and is `false` in this repository - only
`deploy/docker/world.json.template` sets it true. And `engine-custom/src/idlescape/config.ts` reads
`production ? true : asBool(env.OWNER_REQUIRE_ASSERTION, asBool(file.requireOwner, false))`, with
`start-stack.ps1` setting that variable nowhere. So under `-Prod -DevStaff` alone `requireOwner` is
**false**, and the most novel claim in this document - that the owner assertion is the whole of a
puppet's admission (R2, D45) - would go untested end to end. Exporting `OWNER_REQUIRE_ASSERTION=true`
for the e2e stack costs one line and is safe, because `node.production` stays false and
`-DevStaff`'s `::setstat` seeding keeps working. An earlier draft asserted a fact about the harness
that was not true; this paragraph is the correction, and the one line is the only thing
`npm run verify` gains.

**Gates.** `npm run verify` gains one environment line and no new command: the e2e stack start
exports `OWNER_REQUIRE_ASSERTION=true` beside its existing `-Prod -DevStaff`. Otherwise the new
specs join the existing Playwright project and the new unit files the existing vitest and
`bun test` projects. A schema test asserts
`migrations/*.sql` apply in order to an empty file and that the final version matches the constant,
and that the two views exist and resolve owner names, which is the thing SP3b's category depends on.

## 20. Rulings, each with what it costs if wrong

| # | Ruling | Cost if wrong |
|---|---|---|
| R1 | Puppet identity is a fixed sixteen-name table owned by the front server, outside the Firestore character store: no character document, no `gameNames` index entry, no `CHARACTER_LIMITS` slot, no Characters panel row. | One migration and a create call, if a puppet ever needs to appear in a roster or hold per-character state the store owns. |
| R2 | The puppet's admission credential is the **owner assertion**, not a password, because this deployment runs with `login.enabled` false and the login thread never compares one. The tab holds a fixed meaningless password string. | If a world ever enables the login server, the puppet needs a real password and the arm route must rotate it: one management route, sized but not built. |
| R3 | A dedicated `/puppet-ws?ticket=` upgrade where the front server exchanges the ticket for the assertion and sets `X-Idlescape-Owner` itself. The `cs_owner` cookie is never involved. | Reverting means widening the cookie's single-uid and five-entry rules, which weakens a boundary for a feature that does not need it. |
| R4 | One reserved uid per puppet, `bbp-<name>`, refused to real principals by `buildOwnerCookie`. | One regex. Getting it wrong shares one owner bank across sixteen puppets, or hands a puppet a handle on a player's real bank. |
| R5 | Map data is a generated four-square bundle served as a Vite asset, with the vendored `LocIndex` taking an injected loader. The **bundle's encoder** is a new emitter, not a line in the existing generator, and is sized in the same first task as the vendor closure (section 5.2). | This row prices only the loader seam. If a puppet ever needs the whole world, port `packOnDemandZip` into the overlay and add the route: a day, and one `PATCHES.md` row deleted. |
| R6 | `lite/` **and its whole `#/` import closure** are vendored under `web/src/vendor/rs-sdk/`, reached by a `#/*` mapping and Vite alias scoped to that directory alone, exempt from the 400-line ceiling as vendored code. | Not one duplicated file: a second copy of a large part of the forked 274 client inside `web/`, with `StateCollector`, `ActionExecutor` and `movement.ts` all existing twice. The closure is measured in this entry's first task and recorded in `PATCHES.md` and `CREDITS.md`. Hosting the puppet in `client/` instead puts the shell's composition root on the wrong side of an iframe; importing across package roots pulls the client's module graph into the shell bundle. |
| R7 | The puppet adapter emits no `revision`; the host keys snapshots on `tick`. | Nothing today. If ordering ever needs `revision`, one line, plus the read of `collectBotState` this ruling avoids depending on. |
| R8 | Ranked matches arm through a management route that **enqueues**, drained inside the existing post-cycle hook, which runs `[proc,bb_arm]` through `ScriptProvider` and `ScriptRunner`. | If running a proc from TypeScript proves unsafe, fall back to a varp the RuneScript polls: one file, and one tick of latency. |
| R9 | The front server allocates match ids; `%bb_match_counter` stops being an id source. | One column and one RuneScript line, and the collision hazard of a world var that a vars reset restarts comes back. |
| R10 | The stat snapshot is read from the engine by a management route and written by another; the browser never supplies one. | One route, if a cheaper authoritative source appears (SP3b's `latest` table is the candidate, at the cost of being up to ten minutes stale). |
| R11 | A setup freezes script **source**, not a reference, and a winning re-queue keeps the same setup id. | A few kilobytes per queue entry. Reversing it makes a streak mean a player's session rather than a bot's run. |
| R12 | The queue is durable SQLite, not memory, with a unique index on `uid`. | One write per poll against one indexed row. In memory it would empty silently on every release, which is the failure SP3b's R9 exists for. |
| R13 | Liveness is a predicate at 20 s over a 5 s poll, never a state and never a delete. | One constant. Too tight and a backgrounded tab loses its place; too loose and a dead tab wastes arming cycles. |
| R14 | A re-queued winner takes a fresh `queued_at`. | One line. The alternative rewards the streak holder with permanent FIFO priority. |
| R15 | A draw dequeues both and breaks both streaks; a one-sided fault is a forfeit (loss and win); a server-side fault is an abort with both entries returned and both streaks untouched. | One branch each. The owner ruled only "loser dequeued, winner re-queued", and the spec's section 13 supplies the forfeit half. |
| R16 | The tick log is written by the post-cycle overlay hook, one post per cycle for every active match, not by the RuneScript match clock the owner's wording named. | Nothing, if the hook can read hitpoints cheaply, which it already does for the result sweep. If not, the clock writes a varp the sweep reads: one file. |
| R17 | Frames are a 16-byte packed record, ringed in memory while live and sealed into one BLOB at the end; a restart loses a running match. | A restart mid-match loses eight matches at worst, which are aborted anyway because both tabs lose their poll at the same moment. |
| R18 | Retention is a nulling pass over **two blob columns across three rows**, keyed on the union of both sides' newest 100. The owner's window is the rule; the disk bound (4 GB, at a 128 KB stored trace cap) warns, then strips outside every ruled window, and records the row if it ever has to strip inside one. **This reverses entry 11's R16.** | Reversing it back means unbounded growth on a Lightsail disk. An earlier draft let a 512 MB budget silently override the owner's ruled window from about ten active characters upward, which is the failure this row now names. |
| R19 | The streak is a stored table maintained in the resolution transaction; the ladder ranks `best`, the panel shows `current`. | One query. A `current` ladder churns every match and reads as "who is fighting now". |
| R20 | SP3b's battlebots categories read the two views, never `bb_rows`, and `available()` probes for the view. | One query in entry 13's code, if it ships first against the table. Doing nothing puts eight puppet accounts on the public ladder. |
| R21 | Live and replay are gated-public for `mode='ranked'` and owner-only for challenge and practice, 404 rather than 403 on refusal. The two viewing routes resolve an **optional principal in their own handlers**, the way the wiki routes do, because a `'none'` rule means the generic path never authenticates and the handler would have no identity to check. | One predicate plus one in-handler auth call. Owner-only removes most of the point of live viewing; wider would exceed the spec's section 14 line; leaving the routes principal-free would ship challenge and practice replays to any gate holder. |
| R22 | SSE for frames with a since-cursor poll as the gap filler; caps 20 per match, 4 per account, 64 global. | One route kept warm. Polling alone is one request per viewer per tick against a table being written. |
| R23 | The match window shares `.trace-window`'s `--z-overlay + 2` lane, with DOM order deciding between stage windows. | One CSS line, if two stage windows ever need a fixed order. |
| R24 | `^bb_public` is **not** flipped: ranked play never walks into the region, so the arena stays staff-only on foot and the entry route is untouched. | One constant and one overlay literal, if walk-in should open at the same time. |
| R25 | Player-facing strings become "Bot Arena"; every identifier, panel id, pack name, route path and table name stays exactly as it is. | A string sweep. Renaming an identifier instead would break a persisted panel id and a pinned pack name. |
| R26 | What is refused, and refused permanently, is running a past opponent's **own script source**: under D37 the puppet runs in the challenger's own tab, so shipping that source there breaks the spec's section 14 visibility line and D24's no-sharing precondition. A **rematch against that opponent's kit and stat snapshot driven by a default script** ships no source at all, so this ruling does not reach it; that shape is deferred with R34 and arrives with default-bot sparring in the same task. | The refusal costs a player the truest form of rematch, the opponent's actual behaviour, and no later work buys it back short of moving script execution off the challenger's machine, which is entry 17's Bun host under D46's isolation precondition. The deferral costs what R34 states, once, because both deferred shapes are the same mechanism. |
| R27 | Puppets are excluded from every player enumeration structurally (no character document, projections through the owner's name), not by filters. | Filters would have to be added in five places and one would be forgotten. |
| R28 | A trace upload is capped at 1 MB accepted and **128 KB stored**, trimmed from the front with `summary.trimmed` set. | A pathological run loses its earliest events. Uncapped, one run can outweigh a thousand matches; at 512 KB the ruled retention window did not fit the disk bound above it (section 8.5). |
| R29 | The human-input watcher is never wired to a puppet, `screenshot()` throws a stable `screenshot is not available on a puppet` at the script that called `c.sdk.screenshot()`, and there is no Escape forwarding. | Wiring the watcher would let a player pause their own ranked match by playing their own character, silently, with a 30-second auto-resume. A vaguer screenshot failure would make a canvas-era script degrade unpredictably rather than fail at the call. |
| R30 | The puppet runtime map lives in `web/src/puppet/`, owned by the composition root, never inside `frame/stage.ts`. | Inside the stage, a puppet becomes a fake character in `renderTabs`, `states()` and the Characters panel. |
| R31 | A `bb_puppets` row is freed on a **confirmed logout** - the reaper's roster read, or the same read taken on demand at arm - never at resolve. Between the two it is `releasing` and not allocatable. | Up to one loopback round trip of arming latency. Freeing at resolve races a still-connected session into a second login for one character, resolved by the 274 login thread rather than by us, and the stat-write guard does not catch it because `%bb_state` is idle by then. |
| R32 | The pairing predicate is `abs(cbA - cbB) <= max(bandA, bandB)`, each entry carrying its own band off its own wait. | One comparison. The battlebots spec's single-band form assumed a pad where everyone widened together; `min` would mean a long wait widens nothing until its partner has also waited. |
| R33 | A front-server deadline closes any live header that never gets a result, because `~bb_publish_result` publishes nothing on an abort or on a ranked match under 20 ticks. It writes `outcome='abort'`, `reason='no_result'`, and returns both entries untouched. The 20-tick floor is duplicated server-side as `BB_MIN_RECORDED_TICKS` with a test pinning the two together. | One predicate on a timer that already runs. Without it, a sub-20-tick ranked match or any engine abort deadlocks one plot and two accounts silently: no row is posted, `ended_at` stays NULL, and the reaper skips a puppet that still has a live match row. |
| R34 | Private, untracked play against a script **we** ship is **one mechanism**: a second puppet hosted in the challenger's own tab running a default or shipped script. It serves both shapes the owner asked for, default-bot sparring and R26's past-opponent rematch over that opponent's kit and stat snapshot, and both are deferred **together** to one plan task after section 17's minimum shippable slice. It is not "entry 11's practice mode". **First-release private play is practice against the 274 npc, and nothing else.** | Stated once, because it is one cost for both shapes: one more arm mode, one enqueue path pairing an account against a stored or shipped setup, a second `LiteSession` and Worker in the same tab, a `mode` the resolution transaction excludes from streaks, credit and every projection, and a panel surface. Dismissing it as already-shipped is the error this ruling exists to correct: entry 11's practice opponent is a 274 npc, and the archetypes are library scripts a player runs on their own character (plan R8). |

**Open owner questions: none blocking.** The owner ruled the product in round two; everything above
is a design consequence, and each row says what reversing it costs. The three a reader might expect
to be gated are R2 (a fact about the deployment, verified in `LoginThread.ts`), R21 (visibility, one
predicate) and R25 (the name). **R25 is flagged to the owner informationally, and D47 says so in its
own consult cell.** The player-facing product name is the one thing in this entry the owner has
never been asked about and did not raise - it comes from the battlebots plan's trademark paragraph
rather than from any of the three idea rounds - and the owner may want to choose the word. Nothing
waits on the answer, because the sweep is a sweep in either direction, which is why it is
informational and not a block. Nothing else here is gated at all.

## 21. What this does not do

- **Walk-away play.** The owner ruled it is not a must-have. Both players must be online, which is
  plan R5's cost surviving unchanged. SP5 removes it by hosting the same seam in Bun, and section 5.6
  says exactly what that costs.
- **A 3D or free-camera viewer.** The owner ruled it a separate, longer-term direction. Section 11.2
  says what the record would need so the choice stays open.
- **Cross-account script sharing, in any form.** No script source ever leaves the account that wrote
  it: not to an opponent, not into a replay, not through the match detail route. This is D24's
  precondition and it is not weakened here.
- **Running a past opponent's own script source.** Ruling R26, and the one thing here that is
  refused rather than deferred: under D37 the puppet runs in the challenger's own browser, so it
  would ship another account's source into that tab, which D24's no-sharing precondition and section
  14's visibility line both forbid. It is the **script** that is refused, not the rematch. A rematch
  driven by a default script is the next bullet.
- **Private, untracked matches against a script we ship.** Both testing shapes the owner asked for
  in round three, **deferred with a cost rather than dismissed, and deferred together**: sparring
  against a default bot we ship, and a rematch against a past opponent's kit and stat snapshot
  driven by a **default** script, which is the recommendation the ideas file put to the orchestrator
  and tests the setup rather than the script. They are **one mechanism, not two**: a second puppet
  hosted in the challenger's own tab running a default or shipped script. Neither ships another
  account's script source, which is why R26's reason does not reach either of them and why they are
  a deferral rather than a refusal. **They arrive in the same plan task**, after section 17's
  minimum shippable slice rather than inside it, and **the cost is stated once because it is one
  cost**: one more arm mode, one enqueue path pairing an account against a stored or shipped setup
  rather than against another queue entry, a second puppet hosted in the same tab as the first (two
  `LiteSession`s and two Workers for one player), a `mode` the resolution transaction excludes from
  streaks, credit and every projection, and a panel surface. **First-release private play is
  practice against the 274 npc, and nothing else.** An earlier draft said "sparring against the
  shipped archetypes is entry 11's practice mode", which this document's own section 2.1
  contradicts: entry 11's practice opponent is an existing 274 npc (`warrior_woman`, `paladin`,
  `hero`), and the plan's R8 keeps the four archetypes as "library scripts the player runs" -
  scripts on the player's own character, never an opponent. No shipped bot has ever been an opponent
  in this design, and what would make one is exactly the mechanism above. Rulings R26 and R34, and
  D59, which corrects D55 to say the same.
- **Any change to practice or challenge.** They stay on the player's real character, with their own
  stash, restore and kit paths exactly as entry 11 builds them. The only thing this entry does to
  them is keep their history readable through the new side-row fallback.
- **Opening the region to walk-in players.** `^bb_public` stays false. Ruling R24.
- **5v5.** The plan reserves `m71_71` for it and this entry does not touch it. The tick frame is
  two-slot by construction and a team version needs a `packed-v2` kind.
- **An in-game hiscore board, a chat notice, or any new interface.** Section 10 says why even the
  owner's optional chat line is not built: on the ranked path the character that would receive it is
  a puppet with no chatbox, and its owner is elsewhere. The panel is the whole reading. Plan R9
  survives.
- **MMR, ratings or anything beyond wins and streaks.** The battlebots spec's section 15 says a bigger
  conversation, and this is not it.
- **Anti-cheat.** The world is gated and the arena is stakes-free. The credit rules in section 7.2 are
  collusion friction, not a system.
- **More plots.** Eight is the concurrency limit until somebody regenerates the region with a higher
  plot count, which is a generator argument and not code.
