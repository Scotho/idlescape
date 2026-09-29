# Spec: Battlebots minigame

Date: 2026-09-06 (vendored into the repository 2026-09-07 from the VMShare copy that was its only
one; content unchanged below this header)
Sprint: Dragon Slayer, entry 11 (`2026-09-07-sprint-dragon-slayer.md`)
Plan: `docs/superpowers/plans/2026-09-07-spbb-battlebots-minigame.md`. **The plan wins.** It records
sixteen rulings against this spec, each replacing an assumption made here about the engine with
something verified in the pinned clones. Read its "Rulings against the spec" table before this file.

Status: approved via its plan, 2026-09-07; the plan `2026-09-07-spbb-battlebots-minigame.md` is this entry's approval record and its sixteen rulings close section 19 (sprint entry 11, decision D34)
Scope: new custom minigame, first purpose-built region, hiscore integration
Depends on: hiscore infrastructure (section 2 gate), map authoring investigation (section 10 gate)

---

## 1. Summary

Battlebots is a stakes-free, script-driven PvP minigame housed in the first region of the
game built from scratch rather than inherited from the 274 cache. A player writes (or
picks) a combat script, declares a gear and inventory loadout, walks onto a queue pad in
the lobby, and gets paired against someone of similar combat level. Two loadouts fight
autonomously until one dies or the match clock expires. Nothing is lost: equipment is
never at risk, and consumables spent during the match are restored on exit.

The region is placed on the world map in a location with no walkable connection to
anything else. Entry is by explicit teleport only. Ship as 1v1. The data model, script
API, and match runner are built for teams from day one so 5v5 is a configuration change
plus a matchmaker change, not a rewrite.

### Goals

- Give the "idle/automated RuneScape" pitch a competitive surface. Scripts fight, not people.
- Zero item risk. A crash, disconnect, or engine bug must never cost a player gear.
- Four shipped archetypes (passive, aggressive, outlast, assassin) that double as worked
  examples of the scripting API and as regression fixtures.
- Three match modes: ranked (queued, tracked), challenge (right-click, untracked),
  practice (vs a default archetype, no opponent needed, untracked).
- Ranked wins feed a public hiscore table. Losses stay private. Nothing else counts.
- Establish a repeatable pattern for building custom regions, since this is the first one.

### Non-goals (this phase)

- Matchmaking rating (MMR). Pairing is combat level band plus FIFO.
- Spectating live matches. Replays only (section 14).
- World map visibility for the new region. Deliberately hidden (section 9).
- Rewards. Hook is specced (section 16), payload is TBD.

---

## 2. Prerequisite gate: hiscore infrastructure

The spec assumes a hiscore system exists with server-authoritative writes and a category
concept that a new "Battlebots wins" section can be added to. That assumption needs
verifying before phase 6.

**Audit checklist** (grep the repo, tick or cross each):

- [ ] A hiscore table/collection exists with a category or skill discriminator
- [ ] Writes are server-side only (`server/`), never issued from `web/` or the client
- [ ] Firestore rules deny client writes to the hiscore path (`firebase/` + rule tests)
- [ ] A read API exists that pages and sorts by score within a category
- [ ] A UI surface exists in `web/` that renders a category table
- [ ] Score updates are idempotent (replayed writes cannot double-count)

**If all six pass:** Battlebots adds one category, `battlebots_wins`, and nothing else.

**If any fail:** split into a separate workflow, `plans/hiscores-foundation.md`, which
lands before phase 6. Battlebots phases 1 to 5 do not depend on it. The minigame writes
match results to its own store regardless (section 14); hiscores are a projection over
that store, so the dependency is one-directional and late.

---

## 3. Domain model

```ts
type MatchId = string;          // ulid
type Ruleset = "1v1" | "5v5";   // teamSize derived, not hardcoded elsewhere
type MatchMode = "ranked" | "challenge" | "practice";

interface Match {
  id: MatchId;
  ruleset: Ruleset;
  mode: MatchMode;
  tracked: boolean;             // ranked only; denormalized so history can badge it
  arenaPlotId: string;
  teams: [Team, Team];
  status: "queued" | "arming" | "running" | "resolving" | "complete" | "aborted";
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  result?: MatchResult;
  seed: string;                 // any RNG the runner owns derives from this
}

interface Team {
  id: string;
  slots: Slot[];                // length 1 for 1v1, up to 5 later
}

interface Slot {
  characterId: string;
  ownerId: string;              // auth uid, null for practice opponents
  isBot: boolean;               // true for the practice-mode opponent
  scriptId: string;
  scriptVersion: number;        // pinned at arming, never "latest"
  loadoutId: string;
  loadoutSnapshot: Loadout;     // denormalized, matches are immutable history
  combatLevel: number;          // captured at queue time, used for banding
}

interface Loadout {
  id: string;
  ownerId: string;
  name: string;
  equipment: Record<EquipSlot, ItemId | null>;
  inventory: Array<{ itemId: ItemId; qty: number } | null>;  // 28 slots
  createdAt: number;
  updatedAt: number;
}

interface MatchResult {
  winnerTeamId: string | null;  // null = draw
  reason: "death" | "timeout" | "forfeit" | "fault";
  perSlot: Array<{
    characterId: string;
    damageDealt: number;
    damageTaken: number;
    hpRemaining: number;
    ticksAlive: number;
    scriptFaults: number;
  }>;
  durationTicks: number;
}
```

Notes:

- `teams: [Team, Team]` is a fixed pair. 5v5 grows `slots`, not team count. If free-for-all
  is ever wanted this is the line that has to change, and that is a deliberate trade.
- `scriptVersion` pinning matters. A player editing a script mid-queue must not change
  what is fighting, and replays must resolve to the exact source that ran.
- `loadoutSnapshot` is denormalized on purpose. Deleting a loadout must not corrupt history.
- `tracked` is derived from `mode` but stored, because hiscore eligibility should be
  decidable from the match record alone, without re-deriving policy at read time.

---

## 4. Match lifecycle

```
queued -> arming -> running -> resolving -> complete
   |         |         |          |
   +---------+---------+----------+------> aborted
```

| State | Owner | What happens |
| --- | --- | --- |
| `queued` | matchmaker | Slot is in the pool (ranked) or awaiting acceptance (challenge). Skipped entirely for practice. |
| `arming` | server | Plot allocated, characters teleported in, real inventory stashed, loadout issued, scripts loaded and compiled, both sides report ready. Hard timeout: 30s. |
| `running` | match runner | Tick loop. Scripts act. Damage and events logged. |
| `resolving` | server | Outcome computed, loadout destroyed, real inventory restored, characters teleported to the lobby, result persisted. |
| `complete` | - | Terminal. Result readable, replay available. |
| `aborted` | server | Any failure in arming or running. Restore path runs unconditionally. |

`aborted` is not a loss for either side and never touches hiscores. A player who
disconnects mid-match does not abort it: their script keeps running (section 5), which
is the entire point of the minigame.

---

## 5. Execution model (primary decision)

**Where do the scripts run?** This is the fork that everything else hangs off.

**Option A: client-side.** Both scripts run in their owners' browsers on the existing
`web/` script runtime, driving `window.idlescape.client`.

- Reuses the runtime and the bridge as-is. Fastest to a playable build.
- Requires both players online at once, which kills the idle premise.
- Tick timing is at the mercy of two browsers. Fairness is a function of the loser's frame rate.
- Trivially tamperable. The runtime is in the page.

**Option B: server-side headless.** The Bun server runs both scripts against server-held
character sessions. Players queue and walk away; matches resolve without them.

- Matches the product pitch: you submit a bot, it fights while you sleep.
- Uniform tick budget for both sides. Fairness is enforceable.
- Server is the only writer of results, so hiscores are trustworthy by construction.
- Practice mode needs a server-driven opponent anyway, so the harness is not optional.
- Needs a headless client harness and a script sandbox in Bun. Real work.

**Recommendation: B.** And more importantly, do not "start with A and migrate." A
client-side script API will accrete DOM and client-object assumptions in week one and
the migration becomes a rewrite of every script anyone has written.

There is public prior art worth reading before building this: `elizaOS/eliza-2004scape`
is a fork of the LostCity engine and client with a bot SDK, a WebSocket gateway routing
between bots and the SDK, and a WASM pathfinder, built specifically to drive agents
against the 2004scape engine headlessly. Whatever its quality, it has already hit the
problems this section is about. Read it before writing the harness.

**Mitigation if A is chosen anyway:** define the script API against the abstract
`BotContext` / `BotActions` in section 7 with two executors behind one interface, a
client executor and a server executor. Scripts must never touch `window`, the client
object, or the DOM. That constraint is enforceable with a lint rule and a sandbox that
simply does not expose those globals.

### Sandbox

Scripts are untrusted user code executing on our server. Requirements:

- No filesystem, network, timer, or process access. No `import`. Frozen globals.
- Hard instruction or wall-clock budget per tick (proposal: 5ms). Overrun is a
  `scriptFault`, the slot takes a no-op that tick, and 20 faults in a match forfeits.
- Memory ceiling per script instance.
- Compile once at `arming`. Compile failure fails arming, aborts, and reports to the
  author. It is never a loss.
- One worker per match, not per script, unless benchmarking says otherwise.

---

## 6. Loadouts and item safety

**Do not snapshot-and-restore the live inventory in the engine.** A crash between wipe
and restore either dupes or deletes real items, and that is the one failure this feature
cannot survive.

The model instead:

1. On `arming`, the server writes an **arena stash record** (durable, server-side) holding
   the character's real equipment and inventory contents.
2. Only after that write commits does the engine clear the character and issue the
   declared loadout as fresh items into the arena.
3. On `resolving` (or `aborted`, or next login after a hard crash), the stash record is
   replayed back onto the character and the record is cleared.
4. Restore is **idempotent and login-triggered**. A stash record that exists at login means
   restore did not complete. Replay it, clear it, log it loudly.

Loadout items are engine-issued copies scoped to the arena and destroyed on exit. Nothing
carried in is at risk because nothing is carried in.

**Open: does a loadout require ownership?** Two models, D2 in section 19.

Constraints regardless of the ownership model:

- Loadout validation runs server-side at arming, not at save time only. Rules change; a
  saved loadout can become illegal.
- Untradeable, quest-locked, and level-gated items respect the character's own stats.
  Combat level and skill levels are the character's real ones; the gear is what is issued.
- Blocked list for anything with out-of-arena side effects (teleports, most notably).

---

## 7. Script API

The contract every script implements. Deliberately narrow, engine-realistic, and free of
any reference to the client or the browser.

```ts
interface CombatantView {
  characterId: string;
  teamId: string;
  hp: number;
  maxHp: number;
  prayer: number;
  position: { x: number; y: number };
  equipment: Record<EquipSlot, ItemId | null>;   // enemies: visible slots only
  activePrayers: PrayerId[];
  attackStyle: AttackStyle;
  isMoving: boolean;
  frozen: boolean;
  // self only:
  inventory?: Array<{ itemId: ItemId; qty: number } | null>;
  specialEnergy?: number;
}

interface BotContext {
  tick: number;               // 0-based, 1 tick = 600ms
  ruleset: Ruleset;
  self: CombatantView;
  allies: CombatantView[];    // empty in 1v1, present in the type from day one
  enemies: CombatantView[];   // length 1 in 1v1
  arena: { minX: number; minY: number; maxX: number; maxY: number };
  memory: Record<string, unknown>;  // per-slot, persists across ticks, cleared at match end
  log(msg: string): void;           // capped, lands in the replay for debugging
}

interface BotActions {
  attack(targetId: string): void;
  move(x: number, y: number): void;
  eat(itemId: ItemId): void;
  drink(itemId: ItemId): void;
  setPrayers(ids: PrayerId[]): void;
  setAttackStyle(style: AttackStyle): void;
  equip(itemId: ItemId): void;
  special(targetId: string): void;
  idle(): void;
}

type BotTick = (ctx: BotContext, act: BotActions) => void;
```

**Action budget per tick:** one primary action (`attack`, `move`, `eat`, `drink`, `equip`,
`special`) plus free actions (`setPrayers`, `setAttackStyle`, `idle`, `log`). Extra primary
actions are dropped, not queued, and count as a fault. This mirrors what a real client can
do and stops a script from out-clicking physics.

**Determinism:** `Math.random` is replaced with a seeded PRNG derived from
`match.seed + slotIndex`. Date and timer access is removed. Engine RNG (hit rolls) is not
deterministic today and does not need to be for gameplay, but see section 14 on what that
costs replay.

**Arena bounds are plot-relative.** `arena` reports the current plot's world coordinates,
not a normalized box. Scripts that hardcode absolute tiles break when the plot pool
allocates differently, so the API should offer relative helpers and the docs should push
people toward them.

---

## 8. Default archetypes

Four shipped scripts. Each is authored against the public API with no privileged access,
so they are honest examples. Each is also a fixture in the bot-vs-bot regression suite and
a selectable opponent in practice mode.

| Name | Intent | Behaviour sketch |
| --- | --- | --- |
| Passive | Defensive baseline, punishes overextension | Protect prayer up, eats at <70%, holds position, attacks only while the opponent is adjacent and committed, never chases |
| Aggressive | Maximum uptime | Attacks every tick it can, closes distance, eats at <35%, no prayer switching, spends spec on cooldown |
| Outlast | Attrition, plays for the clock | Kites to break the opponent's attack cycle, eats at <75%, conserves prayer, targets the timeout tie-break on remaining HP |
| Assassin | Burst windows | Holds special energy and combo items, disengages until the opponent is under the burst threshold, then all-in. Loses badly if the window never opens |

(The brief spells it "assassain". It is "assassin". Noted for posterity and then never
spoken of again.)

Each ships as a rule list, evaluated top-down, first match wins:

```ts
// outlast.ts, abbreviated
export const tick: BotTick = (ctx, act) => {
  const me = ctx.self, foe = ctx.enemies[0];
  if (!foe) return act.idle();

  act.setPrayers(prayerFor(foe.attackStyle, me.prayer));

  if (me.hp / me.maxHp < 0.75 && hasFood(me)) return act.eat(bestFood(me));
  if (distance(me, foe) < 2 && !me.frozen) return act.move(...retreatTile(ctx));
  if (distance(me, foe) <= attackRange(me)) return act.attack(foe.characterId);
  return act.idle();
};
```

Players fork a default as the starting point for a custom script. Forking copies source,
it does not link, so upstream edits to defaults never change someone's saved script.

---

## 9. The region

This is the first region of the game with real work behind it, so the goal is not just
"an arena exists" but a repeatable pattern for the next one.

### 9.1 World placement

The region sits on the world map in a spot with no walkable connection to anything.
Placement rules:

- Choose map squares that do not exist in the vendored 274 cache, well clear of the
  playable landmass, and clear of the coordinate neighbourhoods upstream is likely to
  ever fill.
- Reserve a **2x2 block of 64x64 map squares** (128x128 tiles). One square holds the
  lobby, the rest tile the arena plots. Reserving the block up front is cheap; discovering
  later that 5v5 plots do not fit is not.
- Record the chosen region ids in `content-custom/` next to the map source, with a comment
  explaining why those coordinates and what would break if they moved. This is exactly the
  kind of magic number that becomes unexplainable in six months.
- Surround the whole block with impassable terrain so no pathfinding edge case walks a
  player out of it.

**World map visibility: hidden for now.** The in-game world map is a separate cache
artifact (`worldmap.jag` in the client repo, with its own `mapSig` step and a decompiled
`mapview` applet for inspection), so a new playable region does not automatically appear
on it. That is convenient here: the region is meant to be inaccessible, so phase 1 skips
world map work entirely. When the region is meant to be discoverable, regenerating the
world map becomes its own task, and D9 covers it.

### 9.2 Layout

**Lobby** (one map square, safe, no PvP flag):

- Arrival tile from the entry teleport
- Queue pad, marked and visually obvious (section 9.3)
- Loadout and script access point (an object or NPC that opens the web shell panel, or its
  in-game equivalent per D11)
- Open floor space for players to stand and challenge each other (section 12). This needs
  to be genuinely open; a cramped lobby makes right-click targeting miserable
- A hiscore board object, cheap flavour, reads `battlebots_wins`

**Queue pad**: a marked tile area inside the lobby. Stepping on it enters the ranked
queue. Stepping off leaves it. No dialogue, no confirmation. Details in 9.3.

**Arena plots**: N identical builds in the remaining squares, walled off from the lobby
and from each other, no walkable path between any plot and anywhere else.

- PvP enabled, no item drop on death, no teleport in or out, no NPC spawns
- Sized for 10 combatants from the start (5v5 forward compat), roughly 24x24 including walls
- Start at N = 8 and measure. N is the concurrency ceiling for simultaneous matches
- Identical geometry across plots, because a script that behaves differently by plot is a
  fairness bug and a debugging nightmare

### 9.3 Queue pad mechanics

Walking onto the pad is a queue toggle, so it needs to be sturdier than it sounds:

- Entering the pad area queues the character. Leaving it dequeues.
- Debounce. A player pathing across the corner of the pad should not queue and instantly
  dequeue, and should certainly not queue twice. Enter/leave events fire on zone
  transition, not per tick.
- Queue state is visible: an overlay or overhead marker showing queued, current combat
  level band, and time waiting.
- When a match is found, the character is removed from the pad and teleported to the plot.
  On return from `resolving` they land in the lobby **off** the pad, not on it, so a match
  never silently re-queues someone who walked away from their keyboard.
- Logging out while on the pad dequeues. If D1 lands on server-side execution, this is a
  policy choice rather than a technical necessity, and "stay queued while offline" is
  arguably the correct behaviour for an idle game. Flagged as part of D1.

### 9.4 Entry

The only way in is an explicit teleport. No walkable route exists by construction.

Phase 1: a button in the web shell that calls a server endpoint, which validates and moves
the character. Simple, and it keeps the region out of sight while it is half-built.

Later: an in-world portal object placed somewhere public, at which point the region stops
being hidden and D9 (world map) comes due. Keep the teleport destination server-side
either way; a client-supplied destination is a free teleport exploit.

---

## 10. Map and content authoring: prior art and investigation

This is the first custom region, so the authoring pipeline is unknown work and gets its
own research gate before phase 1 starts. Output: `docs/superpowers/specs/notes/lostcity-map-authoring.md`.

### 10.1 What is known from public sources

- **Content and engine are separate.** Upstream restructured from a monorepo: `data/src/`
  became the Content repo, the server became Engine-TS, with `Environment.ts` pointing at
  the content path. Content developers run a watch process that repacks scripts and configs
  on change. Whatever the vendored engine in `engine/` looks like, the content pipeline is
  built around edit-then-repack, not hand-editing packed artifacts.
- **RuneScript is the content language**, deliberately recreated with the original's
  limitations. There is a first-party VS Code extension (`LostCityRS/RuneScriptLanguage`)
  providing language support. Worth installing before writing arena content.
- **The world map is a separate artifact.** The client repo ships a decompiled `mapview`
  applet run via `gradle mapview:run`, which needs `worldmap.jag` copied in and a `mapSig`
  step first. Confirms 9.1: playable map data and world map data are different things.
- **Collision is generated, not authored.** Upstream uses `@2004scape/rsmod-pathfinder`
  with a `CollisionManager` composed of floor, wall, loc, npc, roof and player colliders.
  New map geometry has to produce correct collision flags through that same path or arena
  pathing breaks in ways that will look like script bugs.
- **Headless bot prior art exists.** `elizaOS/eliza-2004scape` forks the LostCity engine
  and client and adds a bot SDK, a WebSocket gateway, and a WASM pathfinder to run agents
  against the engine. Relevant to D1 more than to map work, but it is the closest public
  precedent for what this project is doing overall.
- **RSPSi** is the well-known RSPS map editor and is open source, but it targets later
  revision and OSRS caches. Whether it round-trips 274 Lost City map data at all is
  unverified and should not be assumed.

Honest limitation: public write-ups on authoring brand-new 274 map squares for Lost City
specifically are thin, and lostcity.rs blocks automated fetching, so the forum and Discord
could not be read directly here. They are the actual knowledge base for this. A single
question asked there ("has anyone added custom map squares to a 274 server, and what did
you use?") is likely worth more than a day of reverse engineering, and should be the first
action of this gate rather than the last.

### 10.2 In-repo investigation checklist

The vendored `engine/` and content are the authoritative source. Timebox this.

- [ ] Locate the map data source format in the vendored content: file naming, per-square
      layout, text or binary, and whether terrain and locs are separate files
- [ ] Find the packer that turns map source into what the server serves, and determine
      whether it tolerates region ids that were never in the original cache
- [ ] Determine how the client requests map data for a region, and what it does when asked
      for a region it has no data for (silent fail, blank tiles, or crash)
- [ ] Confirm collision flags are generated from the same source data via rsmod-pathfinder
- [ ] Find how existing areas declare zone behaviour in RuneScript (wilderness, multi-combat,
      safe zones). The arena's flags should reuse that mechanism, not invent one
- [ ] Check whether upstream or any fork has already landed custom map squares. If yes,
      copy their approach
- [ ] Confirm `scripts/engine-overlay.ps1` can carry *new* files into the engine tree, not
      just patches to existing ones. The overlay was built for patches; adding a region is
      the first time it has to add content wholesale
- [ ] Establish whether the interface system can render new custom interfaces without a
      client cache rebuild (section 17 depends on the answer)

### 10.3 Authoring approach

Decided by the investigation, but the likely shapes, cheapest first:

1. **Hand-authored source** with a small generator script. Arena plots are geometrically
   trivial (rectangles, walls, floor), and N identical plots are a loop, not a design task.
   A generator that emits map source from a plot template is probably less work than
   learning an editor, and it makes plot count a parameter.
2. **Existing editor** if one round-trips 274 data cleanly. Better for the lobby, which
   benefits from looking like a real place.
3. **Hybrid**: generator for the plots, editor for the lobby.

The generator path is the recommendation for phase 1 regardless, because plot geometry
must be identical across plots and generated output guarantees that in a way hand-editing
does not.

---

## 11. Matchmaking (ranked)

- Entered by standing on the queue pad. Leaving the pad leaves the queue.
- Pair on combat level band: `abs(cbA - cbB) <= band`.
- Band starts at **5** and widens by 1 every 15 seconds of wait, to a ceiling of 15, then
  holds. On a small server a strict band is an empty queue; on a busy one it is fair. The
  widening schedule is the knob that trades one for the other (D7).
- Combat level is captured into the slot at queue time. A level-up while queued
  re-evaluates the band rather than being ignored.
- Never pair two slots with the same owner uid (section 15).
- Never pair the same opponent twice consecutively when another candidate exists.
- FIFO within band. Oldest waiting slot has priority, so nobody starves at the edges.
- The band and wait time are shown in the UI, so a long wait is legible rather than
  mysterious.

**Dependency worth naming:** combat level is only a decent fairness proxy if gear is
roughly equal. If D2 lands on "must own the items", then combat level plus wealth is the
real spread and a level band alone under-constrains fairness badly. If D2 lands on a
curated catalogue, combat level is close to the whole story and the band does its job.
D2 and D7 should be decided together.

---

## 12. Challenge matches

Untracked matches arranged directly between two players in the lobby.

**Flow, shaped like a trade:**

1. Right-click a player in the lobby, choose **Challenge**. Same context-menu shape as
   Trade with, and it should only appear inside the lobby zone.
2. Target sees a request message and can accept or ignore.
3. On accept, both open a challenge interface showing each side's character name, combat
   level, script name, and loadout name. Both must accept.
4. Second-stage confirm screen, mirroring the trade confirm, so a last-second swap cannot
   sneak through. Changing script or loadout after accepting invalidates both accepts and
   returns to stage one.
5. On mutual confirm, the pair goes straight to `arming` with a plot from the same pool.

**Rules:**

- No combat level restriction. That is the entire point of challenges.
- `mode: "challenge"`, `tracked: false`. Recorded to both players' local history with an
  explicit untracked badge. Never written to hiscores. Never counted for rewards. Excluded
  from any future rating system.
- Rate limit outgoing requests, and honour ignore state, because the challenge request is a
  spam vector the moment the lobby has more than four people in it.
- A player already queued on the pad cannot accept a challenge without leaving the queue.
  Pick one, explicitly, rather than resolving the race later.

**Practice mode** shares this plumbing: `mode: "practice"`, opponent is a server-run
default archetype with `isBot: true`, no second player involved, never tracked. It exists
because a new minigame has an empty queue on day one and because debugging a script
against a known opponent is how anyone will actually author one. Practice should land
before ranked queue, not after.

---

## 13. Resolution rules

- **Match clock:** 500 ticks (5 minutes). Configurable per ruleset.
- **Win by death:** last team with a living member wins immediately.
- **Timeout tie-break, in order:** total remaining HP as a percentage of team max, then
  total damage dealt, then draw.
- **Draw:** no win recorded for either side. Both sides record it locally as a draw.
- **Forfeit:** a slot that faults out (section 5) or fails arming forfeits that slot. In
  1v1 that is a loss for the forfeiting side and a win for the opponent, *except* when the
  cause is a server-side fault, in which case the match aborts with no result.
- The distinction between "your script crashed" (loss) and "our runner crashed" (abort)
  must be recorded explicitly in `MatchResult.reason`, because players will argue about it
  and the log needs to answer.

---

## 14. Recording and replay

Every match writes a record. Two consumers: the player's private history, and the hiscore
projection.

**Stored per match:** the `Match` object, the `MatchResult`, and a tick log of
`{ tick, slotIndex, action, args, hpAfter, damage, faults, logs }`.

The tick log is the review surface. It is what makes "wins and losses recorded locally for
review" actually useful: a player debugging a script wants to see why the bot ate at 12%
on tick 143, not just that it lost.

**Replay fidelity:** the runner's decisions replay exactly (seeded PRNG, pinned script
version, snapshot loadout). Engine hit rolls do not, so replay reconstructs the recorded
outcome rather than re-simulating it. That is the right call: re-simulation would demand a
deterministic engine, which is not on the table for rev 274.

**Retention:** last 100 matches per character in full, results only beyond that. Tick logs
are the bulk of the storage; cap them.

**Visibility:** wins, losses and draws are all visible to the character's owner, across all
three modes, with tracked/untracked badging. Only the owner. Opponent-facing detail is
limited to the result and the opponent's script name, never source.

---

## 15. Hiscores

- New category: `battlebots_wins`. Score = count of qualifying wins. Wins only, as specced.
- **Only `mode: "ranked"` matches qualify.** Challenge and practice results never count.
- Written by the server during `resolving`, in the same transaction as the match result,
  keyed on `MatchId` so a retry cannot double-count.
- Losses, draws, and aborts are never written.

**Collusion is the obvious attack on a wins-only ladder.** Two accounts, one feeds the
other, the ladder is meaningless by week two. Mitigations, cheapest first:

1. Ranked queue only. Challenge matches are untracked by design, which removes the easiest
   possible farm: two friends standing in the lobby trading wins.
2. The matchmaker never pairs slots sharing an owner uid.
3. Cap credited wins against the same opponent character to 3 per rolling 24h.
4. Minimum account age or combat level to enter the ranked queue.
5. Minimum match duration (say 20 ticks) so instant-forfeit farming does not credit.

Note that the combat level band (section 11) helps here as a side effect: a feeder account
has to be levelled into the victim's band before it can feed at all.

That is enough for launch. If it is still being gamed, the answer is MMR-gated wins, which
is a bigger conversation and not this spec.

---

## 16. Rewards hook (payload TBD)

Rewards are unspecified but the seam is not. `resolving` emits a single event:

```ts
interface MatchOutcomeEvent {
  matchId: MatchId;
  mode: MatchMode;
  tracked: boolean;
  ruleset: Ruleset;
  outcomePerSlot: Array<{
    characterId: string;
    ownerId: string;
    outcome: "win" | "loss" | "draw" | "abort";
    stats: MatchResult["perSlot"][number];
  }>;
}
```

A reward module subscribes. Match code never grants anything directly. Adding rewards later
touches one subscriber and zero match logic.

Design constraints for whatever the reward ends up being:

- It must not undermine the no-stakes premise by making losses feel costly.
- Untracked modes must not pay out, or challenge matches become the farm that section 15
  just closed.
- Anything tradeable is an economy faucet and inherits the collusion problem with a much
  stronger incentive attached. Prefer untradeable cosmetics, arena-scoped currency, or
  unlockable loadout slots.
- Participation rewards farm themselves. Win rewards farm via collusion. Whatever is
  chosen, model the farm before shipping it.

---

## 17. UI

Two surfaces, and the split between them is D11. The default position: the minimum lives
in the client because it has to be there, and everything rich lives in the web shell where
building it is not an exercise in 2004 interface archaeology.

### 17.1 In-game (client interfaces)

Needed because the lobby is a real place players stand in:

- **Player context menu**: `Challenge` option on other players, lobby zone only
- **Challenge request**: incoming request notification, accept or ignore
- **Challenge confirm**: two-stage, trade-shaped, showing both sides' script name, loadout
  name and combat level, with accept invalidation on change (section 12)
- **Queue status overlay**: queued state, current band, time waiting, and a plain
  instruction that stepping off the pad leaves the queue
- **Match HUD**: tick counter, both HP bars, match clock remaining
- **Post-match result**: winner, damage dealt and taken, duration, and a pointer to the
  replay in the web panel
- **Hiscore board**: a lobby object that reads `battlebots_wins`. Optional, cheap, and the
  kind of thing that makes a region feel finished

**This is the least-known work in the spec.** Authoring new 274-style interfaces is
unfamiliar territory, and whether the client fork can render new ones without a cache
rebuild is an open question in the section 10 checklist. Do not let "create all the UI"
hide a week of interface-format spelunking inside a phase estimate. If the answer turns out
to be expensive, the fallback is to shrink the in-game set to the challenge flow and queue
status only, and push everything else into the web shell.

### 17.2 Web shell (`web/`)

A Battlebots panel in the existing side panel system, tabbed:

- **Loadouts**: equipment doll, 28-slot inventory grid, drag and drop from the catalogue or
  bank, inline validation errors, save / duplicate / rename
- **Scripts**: code editor (Monaco or CodeMirror) with the `BotContext` and `BotActions`
  types loaded for autocomplete, compile-on-save with inline errors, fork-a-default button,
  version list with the ability to see which version a past match ran
- **Queue**: current state, band, elapsed time, cancel. Mirrors the in-game overlay rather
  than replacing it
- **Practice**: pick a default archetype, pick a loadout, run. The fastest possible edit,
  run, inspect loop
- **History**: match list with W/L/D, mode badge (ranked / challenge / practice), opponent,
  script version used, filters
- **Replay viewer**: tick scrubber, both combatants' HP, prayer and position over time, the
  per-tick action log, and script `log()` output inline
- **Hiscores**: the `battlebots_wins` table with the character's own rank highlighted

**The replay viewer and the script editor are each nearly as large as the match runner.**
They are also the two things that determine whether anyone writes a second script. The
minimum viable authoring loop is editor plus compile errors plus practice mode; that
combination should ship before ranked queue, because without it nobody has a script worth
queueing.

---

## 18. Forward compatibility with 5v5

Built in from phase 1:

- `Team.slots` is an array. 1v1 is `teamSize: 1`, enforced by ruleset config only.
- `BotContext.allies` exists and is populated (empty in 1v1). Scripts written today compile
  unchanged against 5v5.
- `MatchResult.perSlot` is per-slot, not per-player.
- Arena plots sized for 10 combatants even while 1v1 runs.
- The region block reserves enough map squares for a larger plot pool.

Deferred, and honestly so: team matchmaking (the combat level band becomes a team average
or a spread constraint, and both are worse than they sound), premades, ally-aware targeting
helpers, role declarations, and per-team shared script memory. `memory` is per-slot now;
team coordination will want a shared channel, and that is a real design problem, not a field.

---

## 19. Open decisions

| # | Decision | Options | Lean |
| --- | --- | --- | --- |
| D1 | Script execution location | Client (A) vs server headless (B), section 5 | B |
| D2 | Loadout ownership | Must own the items vs free access to a curated catalogue | Catalogue. Owning-gear gates the minigame behind wealth, which is the opposite of a script-skill contest, and it makes the combat level band (D7) a much weaker fairness signal |
| D3 | Script language | Constrained JS in a sandbox vs a rule-list DSL with a builder UI | JS, with the DSL rule list as the authoring default since the four archetypes are already rule lists |
| D4 | Match clock | 500 ticks | Confirm after the first bot-vs-bot runs; outlast is unplayable if this is wrong |
| D5 | Rewards | TBD | Defer, but pick before phase 7 so the subscriber is not vestigial |
| D6 | Plot pool size | 8 | Measure |
| D7 | Combat level band and widening | 5, +1 per 15s, ceiling 15 | Decide with D2 |
| D8 | Map authoring toolchain | Generator vs editor vs hybrid, section 10.3 | Generator for plots regardless; lobby depends on the investigation |
| D9 | World map visibility | Hidden vs published | Hidden for phase 1. Revisit when the in-world portal lands |
| D10 | Lobby entry | Web shell teleport vs in-world portal object | Web shell first, portal when the region is meant to be found |
| D11 | In-game vs web shell UI split | Minimum in-client vs full in-client | Minimum in-client, pending the interface-authoring answer from section 10 |
| D12 | Queued while offline | Dequeue on logout vs stay queued | Depends on D1. If B, staying queued is arguably the correct idle-game behaviour |

---

## 20. Risks

- **Item loss.** The one unforgivable bug. Section 6 exists to make it structurally
  impossible rather than merely unlikely. Test it by killing the server mid-match.
- **Custom map squares are unknown work.** Everything in section 9 assumes the engine will
  serve a region that was never in the 274 cache. If it will not, that is discovered in the
  section 10 gate and the whole shape changes. Do not start phase 1 before the gate closes.
- **274 interface authoring.** The second unknown. Easy to underestimate, and it sits
  directly under "create all corresponding UI".
- **Sandbox escape.** Untrusted code on the host that also serves auth and the shared bank.
  If D1 lands on server-side, the sandbox is a security boundary, not a convenience.
- **Cold start.** A new minigame with three players online has an empty queue and looks
  dead. Practice mode is the mitigation and is why it ships early.
- **Ladder collusion.** Section 15. Assume it will be attempted on day one.
- **Engine PvP correctness.** Rev 274 PvP is wilderness-shaped. The arena overrides may
  surface assumptions that only hold in the wilderness. Budget for surprises.
- **Region coordinate collision.** Chosen coordinates are only safe against the pinned 274
  content. If the engine pin ever moves forward, re-verify them.
- **Concurrency.** N plots, one worker per match, one Bun process. Load-test before
  announcing it.
- **Name.** "BattleBots" is an active trademark. Fine for a private server, worth a rename
  before anything public-facing gets loud. `osrs.scotho.com` is public-facing.

---

## 21. Phases

Each phase gets its own `docs/superpowers/plans/` doc written after this spec is approved.

| Phase | Deliverable | Gate |
| --- | --- | --- |
| 0 | Research: map authoring investigation (section 10) and hiscore audit (section 2). Ask upstream first | Both checklists answered, written up |
| 1 | Region build: map squares, lobby, queue pad zone, plot pool, zone flags, entry teleport | Region loads, pathing works, no route in or out |
| 2 | Item safety: stash record, loadout issue and destroy, idempotent login restore | Mid-match server kill leaves no lost or duped items |
| 3 | Match runner, tick loop, sandbox, `BotContext`/`BotActions`, four defaults, practice mode | A practice match completes end to end and produces a `MatchResult` |
| 4 | Web shell UI: loadout builder, script editor, practice runner, history, replay viewer | Someone who is not you can author a working script |
| 5 | In-game UI: challenge context menu, request and confirm flow, queue overlay, result screen | Challenge bait-switch is rejected |
| 6 | Ranked queue, combat level band, anti-collusion rules, `battlebots_wins` category | Collusion rules provably block the self-feed case |
| 7 | Rewards (D5) | - |
| 8 | 5v5 | - |

Phase 4 before phase 5 is deliberate. The authoring loop is what makes the feature real;
the in-game challenge flow is what makes it social. Neither is useful without scripts
worth running, and the web shell is where scripts get written.

---

## 22. Acceptance additions to `verify.ps1`

**Region**

- Region loads client-side with no console errors and correct collision flags
- Pathfinding works across the lobby and within a plot
- No walkable path from the lobby to outside the region, or from the main world in
- All N plots are geometrically identical (assert against the generator output)

**Queue pad**

- Stepping on queues, stepping off dequeues
- Pathing across the pad corner does not produce a queue/dequeue flap or a double queue
- Returning from a match lands the character off the pad

**Matchmaking**

- Pairing respects the combat level band; band widens on the configured schedule
- Two slots with the same owner uid are never paired
- A level-up while queued re-evaluates the band

**Challenge and practice**

- Changing loadout or script after accepting invalidates the accept
- Challenge and practice results never appear in hiscores
- A practice match completes with no second player present
- A player on the queue pad cannot simultaneously accept a challenge

**Match runner**

- Bot-vs-bot headless match, all four archetypes round-robin, completes without fault
- Tick budget: a script with an infinite loop is faulted, not hung
- Sandbox: a script attempting `fetch`, `require`, `setTimeout`, or `window` fails compile
- Replay of a completed match reproduces the recorded result exactly

**Item safety**

- Hard-kill the server during `running`, restart, assert full restore at login
- Restore idempotency: replay the stash restore twice, assert no dupe
- Loadout validation rejects a saved loadout that has become illegal

**Hiscores**

- A hiscore write from a client context is rejected by Firestore rules
- Replaying the same `MatchId` result leaves the score unchanged
