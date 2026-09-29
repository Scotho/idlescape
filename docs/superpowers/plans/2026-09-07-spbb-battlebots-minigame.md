# Battlebots Minigame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a stakes-free, script-driven PvP arena as a new 274 region — lobby, eight plots, safe death, issued loadouts, practice against an NPC, player-to-player challenges, a queue pad, four library bot scripts, and a match record the front server can read.

**Architecture:** Everything the *game* owns is authored as ordinary Lost City content in `content-custom/` — four generated `.jm2` map squares, a `game_battlebots` script package next to `game_duelarena`, `scope=perm` stash inventories, `[mapzone]`/`[zone]` triggers, `[opplayer5]` for the challenge menu, and a `@player_death_battlebots` branch. Everything *outside* the game reuses seams SP8 already built: an `engine-custom/` post-cycle varp sweep posts match results to the front server over the management secret, and the front server owns the match store and the panel. Bot scripts are ordinary `web/src/tasks` library scripts running in each player's existing per-character Worker — no new script API, no new sandbox, no headless harness.

**Tech Stack:** RuneScript (rev 274 content), `.jm2` text map source, TypeScript (Bun front server, `engine-custom/` overlay, `web/` shell + Worker), `bun:sqlite`, vitest / `bun test`, Playwright.

**Spec:** `C:\VMShare\battlebots-minigame-spec.md` (the design this plan argues from). Where this plan and the spec disagree, the disagreement is recorded in **Rulings against the spec** below with the evidence that settled it, and *this plan wins* — every one of those rulings replaces an assumption the spec made about the engine with something verified in the pinned clones.

---

## Global Constraints

- **Pinned upstream.** `scripts/upstream.lock`: engine `1d25566c`, content `2b62ae68`, client `7d6ca61a`, all revision 274. Nothing in `engine/server` or `engine/content` is ever hand-edited; additions go in `content-custom/` and `engine-custom/` and are applied by `scripts/content-overlay.ps1` / `scripts/engine-overlay.ps1`.
- **Every file this plan adds under `content-custom/` must be listed in `content-custom/manifest.json`**, with `baseSha256` set to the sha256 of the upstream file it replaces (`shasum -a 256 engine/content/<path>` **before** the overlay is applied, or `git -C engine/content show HEAD:<path> | sha256sum`), and `null` for files with no upstream counterpart.
- **Pack ids are pinned by hand, never auto-assigned.** `engine/server/tools/pack/BuildOverlay.ts` runs with `Environment.build.verify = false`, which makes `validateConfigPack` silently auto-register missing names and rewrite `<srcDir>/pack/<type>.pack`; `packGuard` then fails the build because a `.pack` moved. A renumbered `.pack` renumbers obj ids already written into every `.sav` and owner-bank file. So every new config name in this plan gets an explicit `N=name` line, appended at the end of a full copy of the upstream `.pack` file placed in `content-custom/pack/`.
- **Packing command is `npx tsx tools/pack/BuildOverlay.ts` from `engine/server`, never `npm run build`.** The 2004 authenticity CRC aborts a plain pack the moment content-custom adds a config the original cache did not have.
- **Free pack id bases at the 274 pin** (`cut -d= -f1 engine/content/pack/<t>.pack | sort -n | tail -1`): `map` 1007, `loc` 4670, `npc` 1358, `obj` 3893, `inv` 216, `varp` 367 *(our overlay already occupies 359-367; upstream max is 358)*, `interface` 10983, `dbrow` 1290.
- **Reserved region block: map squares `70_70`, `71_70`, `70_71`, `71_71`.** Region ids `(mapX << 8) | mapZ` = 17990, 18246, 17991, 18247. World tiles x 4480-4607, z 4480-4607, level 0. The 274 content occupies mapX 29-56 and mapZ 20, 44-62, 70-77, 144-161 only; this block is clear of all of it and inside the client's `mapX < 100`, `mapZ < 255` map-index loop (`engine/server/tools/pack/versionlist/pack.ts:174-188`).
- **No new models, sprites, animations or interfaces.** Every loc, npc and item this plan uses is either an existing 274 id or a new config that names an existing `model=`/`anim=`. Section 17 of the spec is deferred wholesale (see **Deferred**).
- **Do not use em dashes in identifiers, config names, or map notes.**
- **Commit after every task.** Message prefix `feat(battlebots):`, `fix(battlebots):` or `docs(battlebots):`.
- **Verification command for anything that touches content:**
  ```powershell
  pwsh scripts/content-overlay.ps1
  cd engine/server; npx tsx tools/pack/BuildOverlay.ts; cd ../..
  ```
  A non-zero exit naming a `.pack` file means an id was auto-assigned; add the missing `N=name` line by hand and re-run.

---

## Rulings against the spec

Each of these replaces a spec assumption with something read out of the pinned clones. The evidence is cited so a reviewer can re-check it.

| # | Spec said | This plan does | Why |
| --- | --- | --- | --- |
| R1 | §10: map authoring is unknown work needing a research gate, possibly an editor, possibly RSPSi | Generate `.jm2` text with a 200-line script | `.jm2` is plain UTF-8 with `==== MAP ====` / `LOC` / `NPC` / `OBJ` sections; the parser is `engine/server/tools/pack/map/Pack.js:42-135`. Grammar: `level x z: h<height> o<id>;<shape>;<rot> f<flags> u<underlay>` for MAP, `level x z: id [shape=10] [angle=0]` for LOC, `level x z: id` for NPC, `level x z: id count` for OBJ. The section-10 gate closes here. |
| R2 | §9.1: surround with impassable terrain | `f1` on the border tiles | `f` is the tile flag byte; `GameMap.BLOCK_MAP_SQUARE = 0x1` and `GameMap.loadGround` (`engine/server/src/engine/GameMap.ts:225-235`) calls `changeLandCollision(..., true)` for it. Server-authoritative, no locs needed. |
| R3 | §6: build a durable "arena stash record" server-side | Two `scope=perm` inventories, `bb_stash_inv` (28) and `bb_stash_worn` (14) | `InvType.SCOPE_PERM` inventories are serialised into and out of the `.sav` (`PlayerLoading.ts:141-178`, `Player.ts:233`). The engine already gives us a crash-durable, per-character container; a bespoke store would be a second source of truth for the same items. |
| R4 | §6: restore is login-triggered | `~battlebots_login` called from `[login,_]` | Exactly the shape of `~duel_arena_login` (`duel_arena.rs2:363`), which `login.rs2:52` already calls for the same reason. |
| R5 | §5 / D1: run scripts server-side headless in a Bun sandbox | Scripts run in each player's existing per-character Worker | The Worker sandbox already exists (`web/src/agent/worker.ts`, `workerHost.ts`), has no DOM, compiles user code through `compileUserScript` (`web/src/tasks/defineScript.ts:37`) and drives the client over RPC. A headless runner is already scoped as SP5 in the roadmap. Crucially, **result integrity does not depend on where the script runs**: the engine owns combat, HP and death, so a tampered script can only play better, and the arena issues the gear. What client-side execution costs is the idle premise — both players must be online for a ranked match — and that is stated in the panel copy, not hidden. |
| R6 | §5: the sandbox is a security boundary for untrusted code on our host | It is not, here | The script runs in the player's own browser against their own account. No untrusted code reaches our server. This removes the spec's largest security risk entirely, and is the single strongest argument for R5. |
| R7 | §7: define new `BotContext` / `BotActions` / `BotTick` | Use the shipped `Script` / `Task` / `ScriptContext` from `web/src/tasks/types.ts` | `c.bot` already has `attackPlayer`, `castSpellOnPlayer`, `eatFood`, `equipItem`, `activatePrayer`, `walkTo`; `state()` already carries `player.hp/maxHp/combat`, `prayers.activePrayers/prayerPoints`, `combatStyle`, `combatEvents`, `nearbyPlayers`. A parallel API would fork the library, the editor, the trace and the history for no gain. |
| R8 | §12: practice mode's opponent is a server-run archetype with `isBot: true` | Practice fights an existing 274 NPC (`warrior_woman` 15, `paladin` 20, `hero` 21) spawned with `npc_add` | `npc_add(coord, npc, duration)` exists (`engine.rs2:525`) and `kolodion_fight.rs2` is the precedent for a per-player scripted opponent. This needs no second client session, no npc config and no model. The four archetypes stay what they usefully are: library scripts the player runs. |
| R9 | §17: author new 274 interfaces for the challenge flow, queue overlay, HUD and result screen | No new interfaces. `mes`, `~mesbox`, `say` and the Battlebots web panel | Adding an interface means appending to a 10 984-line `interface.pack` and is the spec's own second-largest risk. Nothing in the first release needs one. Deferred to a follow-on plan. |
| R10 | §2: audit whether hiscore infrastructure exists | It does not | No hiscore code exists anywhere in `server/`, `web/` or `firebase/`. SP3 (`docs/superpowers/specs/2026-09-05-sp3-hiscores-tracker-design.md`) designs it and is unbuilt. All six checklist items fail. `battlebots_wins` is therefore **out of this plan**; matches are recorded regardless and the hiscore category becomes a projection over that store when SP3 lands. |
| R11 | §9.4 / D10: web-shell teleport first, in-world portal later | Web-shell teleport, via a new engine management route | The front server cannot move a character, but SP8 already built the seam: `engine-custom/src/idlescape/management.ts` on the management Fastify app, authenticated by `ENGINE_MANAGEMENT_SECRET`. `World.getPlayerByUsername` and `player.teleport(x, z, level)` are both public. This is ~40 lines in a file that already exists, and it keeps the region off the world map with no map shadowing. |
| R12 | §12: the challenge option is a right-click like Trade with | `set_player_op("Challenge", 5, ^false)` and `[opplayer5,_]` | Op slot 1 is taken by the duel arena's `[opplayer1,_]` in an 858-line file we would otherwise have to shadow. Slot 5 is set to `null` by `login.rs2:32` and has no handler anywhere in the content. Verified: `grep -rn "opplayer5" engine/content/scripts` returns nothing. |
| R13 | §11: FIFO queue with a widening combat-level band | One shared `player_uid` waiting slot, plus the band | There is no "find all players in a zone" command in RuneScript. A world-scoped `vars` entry holding the one waiting player's uid is ~25 lines and is the right size for this world's population; the duel scoreboard (`%duel1..%duel50`, `duelarena.vars`) is the precedent for world-scoped state. The widening schedule is kept. |
| R14 | §9.2: "roughly 24x24 including walls", N = 8 | Exactly 24x24 including a 1-tile blocked border, N = 8, geometry asserted against the generator | Made exact so the acceptance test in §22 ("all N plots are geometrically identical") can actually run. |
| R15 | §3: pin `scriptVersion` into the slot at arming so a mid-queue edit cannot change what fights | Nothing new; the existing run history already pins it | `RunSummary` records `scriptId`, `version` and `params` for every run (`web/src/tasks/types.ts`), and the Worker loads the script once at run start. A player editing a script mid-match does not change the running instance, because the running instance is a compiled closure. The match record and the run record are joined on time and character rather than on a foreign key, which is weaker than the spec's design and is the honest cost of not building a second store. |
| R16 | §14: keep the last 100 matches per character in full, results only beyond that | No cap in the first release | The rows are ten integers each. A cap is a migration on an empty table and a `DELETE` this world will not need for a long time; adding it now would be untested code guarding a condition that cannot occur yet. Revisit when a character passes a few thousand rows. |

---

## File structure

**Generated map source and pack ids**
- `scripts/gen/battlebotsMap.ts` — emits the four `.jm2` files and the `map.pack` overlay. One responsibility: turning the plot/lobby geometry constants into text.
- `scripts/gen/battlebotsMap.test.ts` — the geometry contract.
- `content-custom/maps/m70_70.jm2`, `m71_70.jm2`, `m70_71.jm2`, `m71_71.jm2` — generated, committed.
- `content-custom/pack/map.pack`, `loc.pack`, `inv.pack`, `vars.pack` — full upstream copies plus appended ids. `content-custom/pack/varp.pack` already exists and is extended.

**Content package** (`content-custom/scripts/minigames/game_battlebots/`)
- `configs/battlebots.constant` — every coordinate, plot id, tick budget and threshold. The only place a magic number lives.
- `configs/battlebots.loc` — `bb_portal` (exit portal, reuses `floor_glowingcircle` / `glowingcircle`).
- `configs/battlebots.inv` — `bb_stash_inv`, `bb_stash_worn`.
- `configs/battlebots.varp` — per-player match state.
- `configs/battlebots.vars` — the world-scoped queue slot.
- `scripts/battlebots_zones.rs2` — `[mapzone]` / `[mapzoneexit]` / `[zone]` / `[zoneexit]`, lobby op wiring.
- `scripts/battlebots_kit.rs2` — stash, kit issue, kit destroy, restore.
- `scripts/battlebots_login.rs2` — `~battlebots_login`, `~battlebots_logout`, `~bb_match_reset`.
- `scripts/battlebots_death.rs2` — `~bb_death_checks`, `[label,player_death_battlebots]`.
- `scripts/battlebots_match.rs2` — arming, countdown, clock, resolution, plot allocation, result varps.
- `scripts/battlebots_practice.rs2` — the NPC opponent.
- `scripts/battlebots_challenge.rs2` — `[opplayer5,_]`, the two-stage confirm.
- `scripts/battlebots_queue.rs2` — pad pairing and the combat-level band.
- `scripts/battlebots_portal.rs2` — `[oploc1,bb_portal]`.

**Shadowed upstream content** (full copies with one edit each, `baseSha256` recorded)
- `content-custom/scripts/skill_combat/scripts/pvp/pvp_combat.rs2` — one branch in `~pvp_is_attackable` and `~pvp_is_attackable_opt`.
- `content-custom/scripts/player/scripts/death.rs2` — one branch in `[queue,player_death]`.
- `content-custom/scripts/login_logout/login.rs2` — one `~battlebots_login` call.

**Engine overlay**
- `engine-custom/src/idlescape/battlebots.ts` — the result-varp sweep and the enter-teleport management route.
- `engine-custom/src/idlescape/battlebots.test.ts`
- `engine-custom/src/idlescape/management.ts` — modified, registers the new route.
- `engine-custom/src/idlescape/install.ts` — modified, calls the sweep from the post-cycle hook.

**Front server**
- `server/src/battlebots/types.ts`, `store.ts`, `routes.ts`, `hook.ts` (+ `.test.ts` each)
- `server/src/router.ts` — modified, four new route kinds.

**Web**
- `web/src/tasks/library/battlebots/{passive,aggressive,outlast,assassin}.ts` + `combatHelpers.ts`
- `web/src/tasks/library/index.ts` — modified, registers them.
- `web/src/plugins/builtin/battlebots.ts` (+ test) — the panel.
- `web/e2e/battlebots.pw.test.ts`

**Docs**
- `docs/superpowers/specs/notes/battlebots-region.md` — the coordinate reservation and why.
- `README.md` — modified, a Battlebots section.
- `scripts/verify.ps1` — modified, the new suites.

---

## Deferred, with the reason

Not scope creep to be quietly picked up. Each needs its own plan.

- **Ranked hiscores (`battlebots_wins`).** Blocked on SP3, which is designed and unbuilt (R10). The ranked *queue* ships here; only the public table waits.
- **In-game interfaces** — challenge confirm, queue overlay, match HUD, result screen, hiscore board (R9).
- **Replay viewer, and the per-tick log it needs.** Task 10's store keeps one summary row per fighter, not the spec's `{ tick, slotIndex, action, args, hpAfter, damage, faults, logs }` stream. The stream half of it already exists on the client — the runner's `TraceEvent` log is written to the tasks history for every run, including a Battlebots run — so the follow-on plan is to surface that trace beside the match record, not to build a second logger. Rendering it is a UI sub-project the spec itself sizes as "nearly as large as the match runner".
- **Rewards (spec §16, D5).** The `MatchOutcomeEvent` seam is the front server's hook payload in Task 10; no subscriber ships.
- **5v5 (spec §18).** `m71_71` is reserved and unbuilt. Every record here is per-slot already.
- **In-world entry portal and world map visibility (D9).** `bb_portal` ships as the *exit* only.

---

## Task 1: The region generator and four map squares

**Files:**
- Create: `scripts/gen/battlebotsMap.ts`
- Test: `scripts/gen/battlebotsMap.test.ts`
- Create (generated, committed): `content-custom/maps/m70_70.jm2`, `content-custom/maps/m71_70.jm2`, `content-custom/maps/m70_71.jm2`, `content-custom/maps/m71_71.jm2`
- Create: `content-custom/pack/map.pack`
- Create: `docs/superpowers/specs/notes/battlebots-region.md`
- Modify: `content-custom/manifest.json`
- Modify: `package.json` (add `"gen:battlebots-map": "bun run scripts/gen/battlebotsMap.ts"`)

**Interfaces:**
- Produces: `export const REGION`, `export const PLOTS`, `export const LOBBY`, `export function mapSource(mapX: number, mapZ: number): string`, `export function packLines(baseId: number): string[]`. `PLOTS` is `{ id: number; mapX: number; mapZ: number; ox: number; oz: number }[]` of length 8, `ox`/`oz` the plot's south-west local tile. Task 2 reads these constants when it writes `battlebots.constant`.

**Geometry, fixed:**
- Lobby is `m70_70`. Floor `u27` (brick) over local x 16-47, z 16-47. Blocked ring `f1 u27` at local 15 and 48 on both axes. Arrival tile local (32, 20). Queue pad is the single 8x8 engine zone at local (24, 24) to (31, 31), floored `u12` (redfloor) so it is visible.
- Plots are 24x24 *including* a 1-tile blocked border, so the fighting floor is 22x22. Floor `u31` (stone_texture), border `f1 u31`.
- Four plots per arena square at local origins (2,2), (34,2), (2,34), (34,34). Plots 1-4 in `m71_70`, plots 5-8 in `m70_71`. `m71_71` is generated as an empty square (header sections only) and reserved for 5v5.
- **Every generated tile carries `h1`.** The client maps a height byte of 1 to 0 (`client/src/client/ClientBuild.ts:594-597`), so `h1` is an explicit flat ground plane; omitting `h` entirely falls through to `perlinNoise` and gives an uneven arena.
- The lobby also carries one LOC entry: `bb_portal` at local (34, 20), shape 10, angle 0. Its loc id is resolved by name at pack time; the generator writes the *name* is not possible (the `.jm2` LOC section is numeric), so it writes the literal id `4671` and `battlebots.constant` pins the same number. Task 2 adds `4671=bb_portal` to `content-custom/pack/loc.pack`.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/gen/battlebotsMap.test.ts
import { describe, expect, test } from 'bun:test';
import { LOBBY, PLOTS, REGION, mapSource, packLines } from './battlebotsMap';

/** Parse a generated .jm2 into { 'level x z': tokens } for one section. */
function section(src: string, name: 'MAP' | 'LOC'): Map<string, string> {
  const out = new Map<string, string>();
  let inside = false;
  for (const line of src.split('\n')) {
    if (line.startsWith('==== ')) { inside = line === `==== ${name} ====`; continue; }
    if (!inside || line.trim() === '') continue;
    const colon = line.indexOf(':');
    out.set(line.slice(0, colon), line.slice(colon + 1).trim());
  }
  return out;
}

describe('battlebots map generator', () => {
  test('reserves four squares clear of the 274 content', () => {
    expect(REGION.squares).toEqual([[70, 70], [71, 70], [70, 71], [71, 71]]);
    for (const [mx, mz] of REGION.squares) {
      expect(mx).toBeGreaterThan(56);   // 274 content tops out at mapX 56
      expect(mx).toBeLessThan(100);     // versionlist map_index loop bound
      expect(mz).toBeLessThan(255);
    }
  });

  test('eight plots, none overlapping, all 24x24', () => {
    expect(PLOTS).toHaveLength(8);
    const seen = new Set<string>();
    for (const p of PLOTS) {
      expect(p.ox + 24).toBeLessThanOrEqual(64);
      expect(p.oz + 24).toBeLessThanOrEqual(64);
      for (let x = p.ox; x < p.ox + 24; x++) {
        for (let z = p.oz; z < p.oz + 24; z++) {
          const key = `${p.mapX}:${p.mapZ}:${x}:${z}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
    }
  });

  test('every plot is byte-identical in shape', () => {
    const shapeOf = (p: typeof PLOTS[number]): string => {
      const map = section(mapSource(p.mapX, p.mapZ), 'MAP');
      const rows: string[] = [];
      for (let x = 0; x < 24; x++) {
        for (let z = 0; z < 24; z++) rows.push(map.get(`0 ${p.ox + x} ${p.oz + z}`) ?? '');
      }
      return rows.join('|');
    };
    const first = shapeOf(PLOTS[0]);
    for (const p of PLOTS) expect(shapeOf(p)).toBe(first);
  });

  test('a plot border tile is blocked and an interior tile is not', () => {
    const p = PLOTS[0];
    const map = section(mapSource(p.mapX, p.mapZ), 'MAP');
    expect(map.get(`0 ${p.ox} ${p.oz}`)).toBe('h1 f1 u31');
    expect(map.get(`0 ${p.ox + 1} ${p.oz + 1}`)).toBe('h1 u31');
  });

  test('the lobby is sealed and carries the exit portal', () => {
    const map = section(mapSource(70, 70), 'MAP');
    expect(map.get('0 15 15')).toBe('h1 f1 u27');
    expect(map.get('0 48 48')).toBe('h1 f1 u27');
    expect(map.get(`0 ${LOBBY.arrival.x} ${LOBBY.arrival.z}`)).toBe('h1 u27');
    expect(map.get('0 24 24')).toBe('h1 u12');   // queue pad floor
    expect(section(mapSource(70, 70), 'LOC').get('0 34 20')).toBe('4671 10 0');
  });

  test('m71_71 is reserved and empty', () => {
    expect(section(mapSource(71, 71), 'MAP').size).toBe(0);
  });

  test('pack lines pin both the m and l archive for every square', () => {
    expect(packLines(1008)).toEqual([
      '1008=m70_70', '1009=l70_70',
      '1010=m71_70', '1011=l71_70',
      '1012=m70_71', '1013=l70_71',
      '1014=m71_71', '1015=l71_71'
    ]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `bun test scripts/gen/battlebotsMap.test.ts`
Expected: FAIL, `Cannot find module './battlebotsMap'`.

- [ ] **Step 3: Write the generator**

```ts
// scripts/gen/battlebotsMap.ts
//
// Emits the Battlebots region as Lost City .jm2 map source. The format is plain text; the
// parser is engine/server/tools/pack/map/Pack.js:42-135. MAP lines are
//   <level> <x> <z>: [h<height>] [o<id>;<shape>;<rot>] [f<flags>] [u<underlay>]
// and LOC lines are
//   <level> <x> <z>: <locId> [shape=10] [angle=0]
//
// h1 is deliberate: the client reads a height byte of 1 as 0 (ClientBuild.ts:594-597), so it
// means "flat at ground level". Omitting h falls through to perlin noise and the arena floor
// stops being flat, which would make every plot a slightly different fight.
//
// f1 is GameMap.BLOCK_MAP_SQUARE (GameMap.ts:26): the server marks the tile impassable. That is
// the whole of the "surround the block with impassable terrain" requirement; no locs needed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Floor ids from engine/content/pack/flo.pack. */
const FLOOR = { lobby: 27 /* brick */, plot: 31 /* stone_texture */, pad: 12 /* redfloor */ };
/** Pinned in content-custom/pack/loc.pack; must match ^bb_portal_locid in battlebots.constant. */
export const PORTAL_LOC_ID = 4671;

export const REGION = {
  squares: [[70, 70], [71, 70], [70, 71], [71, 71]] as [number, number][],
  lobby: [70, 70] as [number, number],
  /** Generated but unused; reserved so a 5v5 plot pool does not need new coordinates. */
  reserved: [71, 71] as [number, number]
};

export const LOBBY = {
  mapX: 70, mapZ: 70,
  floor: { min: 16, max: 47 },          // inclusive local tile range
  border: { min: 15, max: 48 },
  arrival: { x: 32, z: 20 },
  /** One engine zone (8x8, origin on a multiple of 8) so [zone]/[zoneexit] debounce it for us. */
  pad: { x: 24, z: 24, size: 8 },
  portal: { x: 34, z: 20 }
};

export const PLOT_SIZE = 24;
const PLOT_ORIGINS: [number, number][] = [[2, 2], [34, 2], [2, 34], [34, 34]];

export interface Plot { id: number; mapX: number; mapZ: number; ox: number; oz: number }

export const PLOTS: Plot[] = [[71, 70], [70, 71]].flatMap(([mapX, mapZ], square) =>
  PLOT_ORIGINS.map(([ox, oz], i) => ({ id: square * 4 + i + 1, mapX, mapZ, ox, oz }))
);

type Tile = { flags?: number; underlay: number };

function tileToken(t: Tile): string {
  const parts = ['h1'];
  if (t.flags !== undefined) parts.push(`f${t.flags}`);
  parts.push(`u${t.underlay}`);
  return parts.join(' ');
}

function lobbyTiles(): Map<string, Tile> {
  const tiles = new Map<string, Tile>();
  for (let x = LOBBY.border.min; x <= LOBBY.border.max; x++) {
    for (let z = LOBBY.border.min; z <= LOBBY.border.max; z++) {
      const onBorder = x === LOBBY.border.min || x === LOBBY.border.max
        || z === LOBBY.border.min || z === LOBBY.border.max;
      const onPad = !onBorder
        && x >= LOBBY.pad.x && x < LOBBY.pad.x + LOBBY.pad.size
        && z >= LOBBY.pad.z && z < LOBBY.pad.z + LOBBY.pad.size;
      tiles.set(`0 ${x} ${z}`, onBorder
        ? { flags: 1, underlay: FLOOR.lobby }
        : { underlay: onPad ? FLOOR.pad : FLOOR.lobby });
    }
  }
  return tiles;
}

function plotTiles(plot: Plot, into: Map<string, Tile>): void {
  const last = PLOT_SIZE - 1;
  for (let dx = 0; dx < PLOT_SIZE; dx++) {
    for (let dz = 0; dz < PLOT_SIZE; dz++) {
      const onBorder = dx === 0 || dx === last || dz === 0 || dz === last;
      into.set(`0 ${plot.ox + dx} ${plot.oz + dz}`,
        onBorder ? { flags: 1, underlay: FLOOR.plot } : { underlay: FLOOR.plot });
    }
  }
}

/** Sort key matching the packer's iteration order: level, then x, then z. */
function coordOrder(a: string, b: string): number {
  const [al, ax, az] = a.split(' ').map(Number);
  const [bl, bx, bz] = b.split(' ').map(Number);
  return al - bl || ax - bx || az - bz;
}

export function mapSource(mapX: number, mapZ: number): string {
  const tiles = new Map<string, Tile>();
  const locs: string[] = [];

  if (mapX === LOBBY.mapX && mapZ === LOBBY.mapZ) {
    for (const [k, v] of lobbyTiles()) tiles.set(k, v);
    locs.push(`0 ${LOBBY.portal.x} ${LOBBY.portal.z}: ${PORTAL_LOC_ID} 10 0`);
  }
  for (const plot of PLOTS.filter(p => p.mapX === mapX && p.mapZ === mapZ)) plotTiles(plot, tiles);

  const map = [...tiles.keys()].sort(coordOrder).map(k => `${k}: ${tileToken(tiles.get(k)!)}`);
  return ['==== MAP ====', ...map, '==== LOC ====', ...locs, '==== NPC ====', '==== OBJ ====', ''].join('\n');
}

/** The `N=name` lines content-custom/pack/map.pack needs, m then l for each square in order. */
export function packLines(baseId: number): string[] {
  return REGION.squares.flatMap(([mx, mz], i) => [
    `${baseId + i * 2}=m${mx}_${mz}`,
    `${baseId + i * 2 + 1}=l${mx}_${mz}`
  ]);
}

if (import.meta.main) {
  const root = join(import.meta.dir, '..', '..');
  for (const [mx, mz] of REGION.squares) {
    const path = join(root, 'content-custom', 'maps', `m${mx}_${mz}.jm2`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, mapSource(mx, mz), 'utf8');
    console.log(`wrote ${path}`);
  }
  console.log(packLines(1008).join('\n'));
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun test scripts/gen/battlebotsMap.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Generate the maps and pin the pack ids**

```bash
bun run scripts/gen/battlebotsMap.ts
cp engine/content/pack/map.pack content-custom/pack/map.pack
bun run scripts/gen/battlebotsMap.ts | grep -E '^101[0-5]=|^1008=|^1009=' >> content-custom/pack/map.pack
tail -10 content-custom/pack/map.pack   # expect 1006..1015, ending 1015=l71_71
sha256sum engine/content/pack/map.pack  # record for the manifest, BEFORE any overlay apply
```

Add to `content-custom/manifest.json`'s `files` array (use the sha printed above, upper-case hex, for `pack/map.pack`; `null` for the four maps, which have no upstream counterpart):

```json
{ "path": "pack/map.pack", "baseSha256": "<sha256 of engine/content/pack/map.pack>" },
{ "path": "maps/m70_70.jm2", "baseSha256": null },
{ "path": "maps/m71_70.jm2", "baseSha256": null },
{ "path": "maps/m70_71.jm2", "baseSha256": null },
{ "path": "maps/m71_71.jm2", "baseSha256": null }
```

- [ ] **Step 6: Write the coordinate note**

Create `docs/superpowers/specs/notes/battlebots-region.md` containing, verbatim, the reserved square list, the region ids (17990, 18246, 17991, 18247), the world tile extent (x 4480-4607, z 4480-4607), the observation that the 274 pin occupies only mapX 29-56 and mapZ 20/44-62/70-77/144-161, the `mapX < 100` / `mapZ < 255` bound from `engine/server/tools/pack/versionlist/pack.ts:174`, and this sentence: "These coordinates are safe only against the pinned 274 content. Re-run the occupancy check in this note before bumping `scripts/upstream.lock`."

- [ ] **Step 7: Pack and boot**

```powershell
pwsh scripts/content-overlay.ps1
cd engine/server; npx tsx tools/pack/BuildOverlay.ts; cd ../..
```
Expected: pack completes, no `.pack` named as changed. The four squares appear in `engine/server/data/pack/.cache/maps-server.zip`:
```bash
cd engine/server && node -e "const {unzipSync}=require('fflate');const fs=require('fs');console.log(Object.keys(unzipSync(fs.readFileSync('data/pack/.cache/maps-server.zip'))).filter(n=>n.includes('70_70')||n.includes('71_7')))"
```
Expected: `m70_70`, `l70_70`, `n70_70`, `o70_70`, and the same for the other three.

- [ ] **Step 8: Commit**

```bash
git add scripts/gen/battlebotsMap.ts scripts/gen/battlebotsMap.test.ts content-custom/maps content-custom/pack/map.pack content-custom/manifest.json docs/superpowers/specs/notes/battlebots-region.md package.json
git commit -m "feat(battlebots): generate the arena region as jm2 map source

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MERnR4A1K49VY7hZZtQEtY"
```

---

## Task 2: Configs, constants and the lobby zone wiring

**Files:**
- Create: `content-custom/scripts/minigames/game_battlebots/configs/battlebots.constant`
- Create: `content-custom/scripts/minigames/game_battlebots/configs/battlebots.loc`
- Create: `content-custom/scripts/minigames/game_battlebots/configs/battlebots.inv`
- Create: `content-custom/scripts/minigames/game_battlebots/configs/battlebots.varp`
- Create: `content-custom/scripts/minigames/game_battlebots/configs/battlebots.vars`
- Create: `content-custom/scripts/minigames/game_battlebots/scripts/battlebots_zones.rs2`
- Create: `content-custom/pack/loc.pack`, `content-custom/pack/inv.pack`, `content-custom/pack/vars.pack`
- Modify: `content-custom/pack/varp.pack`, `content-custom/manifest.json`

**Interfaces:**
- Produces: the constants `^bb_lobby_sw` / `^bb_lobby_ne` / `^bb_pad_sw` / `^bb_pad_ne` / `^bb_arrival` / `^bb_plot<N>_sw` / `^bb_plot<N>_ne` / `^bb_plot<N>_start_a` / `^bb_plot<N>_start_b` for N in 1..8, `^bb_match_ticks`, `^bb_band_start`, `^bb_band_step_ticks`, `^bb_band_max`, `^bb_arm_timeout`, `^bb_portal_locid`; the procs `~in_bb_lobby(coord)(boolean)`, `~in_bb_arena(coord)(boolean)`, `~bb_plot_of(coord)(int)`; the varps `%bb_state`, `%bb_plot`, `%bb_mode`, `%bb_opponent`, `%bb_match_id`, `%bb_match_seq`, `%bb_outcome`, `%bb_ticks`, `%bb_dmg_dealt`, `%bb_dmg_taken`, `%bb_hp_left`; the shared var `%bb_queue_uid` and `%bb_queue_since`, `%bb_match_counter`; the invs `bb_stash_inv`, `bb_stash_worn`. Tasks 3-8 all consume these.

Coord literals are `level_mapX_mapZ_localX_localZ`. Lobby floor is local 16-47 on `70_70`, so `^bb_lobby_sw = 0_70_70_16_16` and `^bb_lobby_ne = 0_70_70_47_47`. Plot 1 is local (2,2)-(25,25) on `71_70`, and its two start tiles are the interior corners inset by 3: `0_71_70_5_5` and `0_71_70_22_22`.

- [ ] **Step 1: Write `battlebots.constant`**

```
// content-custom/scripts/minigames/game_battlebots/configs/battlebots.constant
// Every Battlebots coordinate and tuning number. Generated geometry lives in
// scripts/gen/battlebotsMap.ts; these must agree with it. See
// docs/superpowers/specs/notes/battlebots-region.md for why these squares.

^bb_portal_locid          = 4671

^bb_arrival               = 0_70_70_32_20
^bb_lobby_sw              = 0_70_70_16_16
^bb_lobby_ne              = 0_70_70_47_47
^bb_pad_sw                = 0_70_70_24_24
^bb_pad_ne                = 0_70_70_31_31
^bb_exit                  = 0_50_50_21_18

^bb_plot1_sw   = 0_71_70_2_2
^bb_plot1_ne   = 0_71_70_25_25
^bb_plot1_start_a = 0_71_70_5_5
^bb_plot1_start_b = 0_71_70_22_22
^bb_plot2_sw   = 0_71_70_34_2
^bb_plot2_ne   = 0_71_70_57_25
^bb_plot2_start_a = 0_71_70_37_5
^bb_plot2_start_b = 0_71_70_54_22
^bb_plot3_sw   = 0_71_70_2_34
^bb_plot3_ne   = 0_71_70_25_57
^bb_plot3_start_a = 0_71_70_5_37
^bb_plot3_start_b = 0_71_70_22_54
^bb_plot4_sw   = 0_71_70_34_34
^bb_plot4_ne   = 0_71_70_57_57
^bb_plot4_start_a = 0_71_70_37_37
^bb_plot4_start_b = 0_71_70_54_54
^bb_plot5_sw   = 0_70_71_2_2
^bb_plot5_ne   = 0_70_71_25_25
^bb_plot5_start_a = 0_70_71_5_5
^bb_plot5_start_b = 0_70_71_22_22
^bb_plot6_sw   = 0_70_71_34_2
^bb_plot6_ne   = 0_70_71_57_25
^bb_plot6_start_a = 0_70_71_37_5
^bb_plot6_start_b = 0_70_71_54_22
^bb_plot7_sw   = 0_70_71_2_34
^bb_plot7_ne   = 0_70_71_25_57
^bb_plot7_start_a = 0_70_71_5_37
^bb_plot7_start_b = 0_70_71_22_54
^bb_plot8_sw   = 0_70_71_34_34
^bb_plot8_ne   = 0_70_71_57_57
^bb_plot8_start_a = 0_70_71_37_37
^bb_plot8_start_b = 0_70_71_54_54

^bb_plot_count            = 8

// Match clock, in ticks. 500 ticks is 5 minutes. Spec D4: confirm after the first bot-vs-bot
// run; Outlast is unplayable if this is wrong.
^bb_match_ticks           = 500
// Arming hard timeout (ticks). Spec section 4 says 30s.
^bb_arm_timeout           = 50
// Countdown before FIGHT, in ticks, mirroring duel_arena_countdown.
^bb_countdown_ticks       = 4
// Minimum ticks a ranked match must last to be recorded. Spec section 15 mitigation 5.
^bb_min_recorded_ticks    = 20

// Combat level band (spec section 11 / D7).
^bb_band_start            = 5
^bb_band_step_ticks       = 25    // 15 seconds
^bb_band_max              = 15

// %bb_state
^bb_state_idle            = 0
^bb_state_queued          = 1
^bb_state_offered         = 2
^bb_state_confirming      = 3
^bb_state_arming          = 4
^bb_state_running         = 5
^bb_state_resolving       = 6

// %bb_mode
^bb_mode_practice         = 0
^bb_mode_challenge        = 1
^bb_mode_ranked           = 2

// %bb_outcome
^bb_outcome_none          = 0
^bb_outcome_win           = 1
^bb_outcome_loss          = 2
^bb_outcome_draw          = 3
^bb_outcome_abort         = 4

// Practice opponents: existing 274 npcs, so no npc config and no model work.
^bb_practice_easy         = warrior_woman
^bb_practice_medium       = paladin
^bb_practice_hard         = hero

// Public entry. While false, the lobby entry route refuses a non-staff character, so the
// region stays hidden while it is half built (spec D9).
^bb_public                = ^false
```

- [ ] **Step 2: Write the configs**

`battlebots.loc`:
```
[bb_portal]
name=Battlebots exit portal
desc=It leads back to Lumbridge.
model=floor_glowingcircle
anim=glowingcircle
op1=Use
ambient=100
contrast=100
```

`battlebots.inv` — `scope=perm` is what makes these survive a crash, a logout and a restart, because `PlayerLoading.ts:162` writes and reads every perm inventory into the `.sav`:
```
[bb_stash_inv]
scope=perm
size=28
protect=no

[bb_stash_worn]
scope=perm
size=14
protect=no
```

`battlebots.varp` — all `scope=perm` so a match interrupted by a disconnect is still recoverable at login, and `protect=no` because none of it is worth protecting on death:
```
[bb_state]
scope=perm
protect=no

[bb_plot]
scope=perm
protect=no

[bb_mode]
scope=perm
protect=no

[bb_opponent]
scope=perm
protect=no
type=player_uid

[bb_match_id]
scope=perm
protect=no

[bb_match_seq]
scope=perm
protect=no

[bb_outcome]
scope=perm
protect=no

[bb_ticks]
scope=perm
protect=no

[bb_dmg_dealt]
scope=perm
protect=no

[bb_dmg_taken]
scope=perm
protect=no

[bb_hp_left]
scope=perm
protect=no

[bb_kit]
scope=perm
protect=no

// Previous tick's hitpoint readings, for the damage accumulator in [timer,bb_match_clock].
[bb_hp_last]
scope=perm
protect=no

[bb_foe_hp_last]
scope=perm
protect=no
```

`battlebots.vars` — world-scoped, the single waiting slot (R13). `type=` takes any `ScriptVarType` name, the same field `duelarena.vars` uses with `type=string`:
```
[bb_queue_uid]
type=player_uid

[bb_queue_since]
type=int

[bb_queue_level]
type=int

[bb_match_counter]
type=int
```

- [ ] **Step 3: Pin every new id**

```bash
cp engine/content/pack/loc.pack   content-custom/pack/loc.pack
cp engine/content/pack/inv.pack   content-custom/pack/inv.pack
cp engine/content/pack/vars.pack  content-custom/pack/vars.pack
printf '4671=bb_portal\n' >> content-custom/pack/loc.pack
printf '217=bb_stash_inv\n218=bb_stash_worn\n' >> content-custom/pack/inv.pack
printf '%s\n' 'bb_queue_uid' 'bb_queue_since' 'bb_queue_level' 'bb_match_counter' \
  | awk -v n="$(cut -d= -f1 engine/content/pack/vars.pack | sort -n | tail -1)" \
        '{ print ++n "=" $0 }' >> content-custom/pack/vars.pack
printf '368=bb_state\n369=bb_plot\n370=bb_mode\n371=bb_opponent\n372=bb_match_id\n373=bb_match_seq\n374=bb_outcome\n375=bb_ticks\n376=bb_dmg_dealt\n377=bb_dmg_taken\n378=bb_hp_left\n379=bb_kit\n380=bb_hp_last\n381=bb_foe_hp_last\n' >> content-custom/pack/varp.pack
```

Record the upstream sha256 of `loc.pack`, `inv.pack` and `vars.pack` in `content-custom/manifest.json` alongside the new script and config files (all `null`), following the entries already there.

- [ ] **Step 4: Write `battlebots_zones.rs2`**

```
// content-custom/scripts/minigames/game_battlebots/scripts/battlebots_zones.rs2
//
// Entering and leaving the region. [mapzone]/[mapzoneexit] fire per 64x64 map square and
// [zone]/[zoneexit] per 8x8 engine zone, both on transition rather than per tick, which is
// exactly the debounce spec section 9.3 asks for: pathing across the corner of the pad cannot
// produce a queue/dequeue flap because the engine only fires once per crossing.

[mapzone,0_70_70]
~bb_lobby_enter;

[mapzoneexit,0_70_70]
~bb_lobby_exit;

[proc,bb_lobby_enter]
// "Challenge" goes on op slot 5. Slot 1 belongs to the duel arena's [opplayer1,_] and slot 2
// to Attack; login.rs2 sets slot 5 to null and nothing in the 274 content handles opplayer5.
set_player_op("Challenge", 5, ^false);
set_player_op(null, 2, ^false);
mes("Welcome to Battlebots. Step onto the red pad to queue for a ranked match.");

[proc,bb_lobby_exit]
set_player_op(null, 5, ^false);

[proc,in_bb_lobby](coord $coord)(boolean)
return(inzone(^bb_lobby_sw, ^bb_lobby_ne, $coord));

[proc,in_bb_arena](coord $coord)(boolean)
if (~bb_plot_of($coord) = -1) {
    return(false);
}
return(true);

/// The plot number a coord sits in, or -1. Used by the death branch, the pvp check and the
/// match runner; there is deliberately one implementation of "am I in a plot".
[proc,bb_plot_of](coord $coord)(int)
if (inzone(^bb_plot1_sw, ^bb_plot1_ne, $coord) = true) { return(1); }
if (inzone(^bb_plot2_sw, ^bb_plot2_ne, $coord) = true) { return(2); }
if (inzone(^bb_plot3_sw, ^bb_plot3_ne, $coord) = true) { return(3); }
if (inzone(^bb_plot4_sw, ^bb_plot4_ne, $coord) = true) { return(4); }
if (inzone(^bb_plot5_sw, ^bb_plot5_ne, $coord) = true) { return(5); }
if (inzone(^bb_plot6_sw, ^bb_plot6_ne, $coord) = true) { return(6); }
if (inzone(^bb_plot7_sw, ^bb_plot7_ne, $coord) = true) { return(7); }
if (inzone(^bb_plot8_sw, ^bb_plot8_ne, $coord) = true) { return(8); }
return(-1);

/// Plot start tiles, so the runner does not repeat an eight-way switch.
[proc,bb_plot_start_a](int $plot)(coord)
switch_int ($plot) {
    case 1 : return(^bb_plot1_start_a);
    case 2 : return(^bb_plot2_start_a);
    case 3 : return(^bb_plot3_start_a);
    case 4 : return(^bb_plot4_start_a);
    case 5 : return(^bb_plot5_start_a);
    case 6 : return(^bb_plot6_start_a);
    case 7 : return(^bb_plot7_start_a);
    case 8 : return(^bb_plot8_start_a);
}
return(null);

[proc,bb_plot_start_b](int $plot)(coord)
switch_int ($plot) {
    case 1 : return(^bb_plot1_start_b);
    case 2 : return(^bb_plot2_start_b);
    case 3 : return(^bb_plot3_start_b);
    case 4 : return(^bb_plot4_start_b);
    case 5 : return(^bb_plot5_start_b);
    case 6 : return(^bb_plot6_start_b);
    case 7 : return(^bb_plot7_start_b);
    case 8 : return(^bb_plot8_start_b);
}
return(null);

[proc,bb_plot_sw](int $plot)(coord)
switch_int ($plot) {
    case 1 : return(^bb_plot1_sw);
    case 2 : return(^bb_plot2_sw);
    case 3 : return(^bb_plot3_sw);
    case 4 : return(^bb_plot4_sw);
    case 5 : return(^bb_plot5_sw);
    case 6 : return(^bb_plot6_sw);
    case 7 : return(^bb_plot7_sw);
    case 8 : return(^bb_plot8_sw);
}
return(null);

[proc,bb_plot_ne](int $plot)(coord)
switch_int ($plot) {
    case 1 : return(^bb_plot1_ne);
    case 2 : return(^bb_plot2_ne);
    case 3 : return(^bb_plot3_ne);
    case 4 : return(^bb_plot4_ne);
    case 5 : return(^bb_plot5_ne);
    case 6 : return(^bb_plot6_ne);
    case 7 : return(^bb_plot7_ne);
    case 8 : return(^bb_plot8_ne);
}
return(null);
```

- [ ] **Step 5: Write `battlebots_portal.rs2`**

The generator already places `bb_portal` at lobby local (34, 20); this is the handler that makes it do something. It is the way *out* only. The way in is the management route in Task 9, so the region stays off the world map (spec D9/D10).

```
// content-custom/scripts/minigames/game_battlebots/scripts/battlebots_portal.rs2

[oploc1,bb_portal]
if (%bb_state ! ^bb_state_idle) {
    mes("You can't leave in the middle of a match.");
    return;
}
~bb_leave_queue;
mes("You step through the portal.");
p_telejump(^bb_exit);

[aploc1,bb_portal]
p_aprange(1);
```

`~bb_leave_queue` is defined in Task 8; until that task lands, comment the call out and add it back there. Note the ordering dependency in the task report rather than reordering the plan: the portal belongs with the lobby it stands in.

- [ ] **Step 6: Pack and boot, then walk the region**

```powershell
pwsh scripts/content-overlay.ps1
cd engine/server; npx tsx tools/pack/BuildOverlay.ts; cd ../..
npm run dev
```
Log in with a staff account (`engine/server/data/config/idlescape.json`, `{"staff":{"<safename>":2}}`), then in the game chat:
```
::tele 4512 4500
```
Expected: the lobby renders with a brick floor and a red 8x8 pad, the chat shows the welcome line, right-clicking another player shows "Challenge", walking into local x 15 or x 48 is refused, and there is no walkable route off the square. Right-clicking the glowing circle at local (34, 20) offers "Use" and stepping through it lands the character at Lumbridge. Then `::tele 4546 4485` (plot 1 interior) and confirm the stone floor and the 22x22 walkable area.

- [ ] **Step 7: Commit**

```bash
git add content-custom/scripts/minigames/game_battlebots content-custom/pack content-custom/manifest.json
git commit -m "feat(battlebots): region configs, constants and lobby zone triggers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MERnR4A1K49VY7hZZtQEtY"
```

---

## Task 3: Item safety — the stash, the kit, and the login restore

This is the task the whole feature is judged on. Nothing here may lose or duplicate an item.

**Files:**
- Create: `content-custom/scripts/minigames/game_battlebots/scripts/battlebots_kit.rs2`
- Create: `content-custom/scripts/minigames/game_battlebots/scripts/battlebots_login.rs2`
- Create: `content-custom/scripts/login_logout/login.rs2` (full upstream copy plus one line)
- Modify: `content-custom/manifest.json`

**Interfaces:**
- Consumes: `^bb_state_*`, `%bb_state`, `%bb_kit`, `bb_stash_inv`, `bb_stash_worn` from Task 2.
- Produces: `~bb_stash_store`, `~bb_stash_restore`, `~bb_stash_held()(boolean)`, `~bb_kit_issue(int $kit)`, `~bb_kit_destroy`, `~battlebots_login`, `~battlebots_logout`. Task 5 calls `~bb_stash_store` + `~bb_kit_issue` on arming and `~bb_kit_destroy` + `~bb_stash_restore` on resolving.

**The invariant:** at any instant, every item the character owns is in exactly one of `{inv, worn}` or `{bb_stash_inv, bb_stash_worn}`, never both and never neither. `inv_movefromslot` moves rather than copies, so a slot-by-slot sweep preserves that invariant even if the process dies mid-sweep — the worst case is a half-moved inventory, and `~bb_stash_restore` is written to move whatever is in the stash back regardless of how much is there.

- [ ] **Step 1: Write `battlebots_kit.rs2`**

```
// content-custom/scripts/minigames/game_battlebots/scripts/battlebots_kit.rs2
//
// Item safety (spec section 6). The stash is two scope=perm inventories, so it is written into
// the .sav by the engine's own serialiser (PlayerLoading.ts:141-178) and survives a logout, a
// ::reboot and a crash. Nothing bespoke persists it and nothing else can disagree with it.
//
// The one rule: MOVE, never copy. inv_movefromslot takes the item out of the source in the same
// operation that puts it in the destination, so a process death partway through a sweep leaves
// items split across inv and stash, never duplicated. ~bb_stash_restore drains whatever is in
// the stash without caring how it got there, which is what makes it idempotent.

[proc,bb_stash_store]
def_int $i = 0;
while ($i < inv_size(inv)) {
    if (inv_getobj(inv, $i) ! null) {
        inv_movetoslot(inv, bb_stash_inv, $i, $i);
    }
    $i = calc($i + 1);
}
$i = 0;
while ($i < inv_size(worn)) {
    if (inv_getobj(worn, $i) ! null) {
        inv_movetoslot(worn, bb_stash_worn, $i, $i);
    }
    $i = calc($i + 1);
}
buildappearance(worn);

/// True while this character has anything parked in the stash. A true here at login means a
/// match did not finish cleanly.
[proc,bb_stash_held]()(boolean)
def_int $i = 0;
while ($i < inv_size(bb_stash_inv)) {
    if (inv_getobj(bb_stash_inv, $i) ! null) { return(true); }
    $i = calc($i + 1);
}
$i = 0;
while ($i < inv_size(bb_stash_worn)) {
    if (inv_getobj(bb_stash_worn, $i) ! null) { return(true); }
    $i = calc($i + 1);
}
return(false);

/// Idempotent: running it twice on a drained stash moves nothing and changes nothing.
[proc,bb_stash_restore]
def_int $i = 0;
while ($i < inv_size(bb_stash_worn)) {
    if (inv_getobj(bb_stash_worn, $i) ! null) {
        inv_movetoslot(bb_stash_worn, worn, $i, $i);
    }
    $i = calc($i + 1);
}
$i = 0;
while ($i < inv_size(bb_stash_inv)) {
    if (inv_getobj(bb_stash_inv, $i) ! null) {
        inv_movetoslot(bb_stash_inv, inv, $i, $i);
    }
    $i = calc($i + 1);
}
buildappearance(worn);
~update_all(inv_getobj(worn, ^wearpos_rhand));

/// The arena's own gear. These are engine-issued copies scoped to the match: nothing the player
/// owns is ever carried in, so nothing they own can be lost. ~bb_kit_destroy deletes them.
[proc,bb_kit_issue](int $kit)
inv_clear(inv);
inv_clear(worn);
switch_int ($kit) {
    case 1 : ~bb_kit_melee;
    case 2 : ~bb_kit_ranged;
    case 3 : ~bb_kit_mage;
    default : ~bb_kit_melee;
}
buildappearance(worn);
~update_all(inv_getobj(worn, ^wearpos_rhand));

[proc,bb_kit_melee]
inv_setslot(worn, ^wearpos_rhand, rune_scimitar, 1);
inv_setslot(worn, ^wearpos_lhand, rune_kiteshield, 1);
inv_setslot(worn, ^wearpos_torso, rune_platebody, 1);
inv_setslot(worn, ^wearpos_legs, rune_platelegs, 1);
inv_setslot(worn, ^wearpos_head, rune_full_helm, 1);
inv_setslot(worn, ^wearpos_hands, leather_gloves, 1);
inv_setslot(worn, ^wearpos_feet, leather_boots, 1);
inv_setslot(worn, ^wearpos_back, black_cape, 1);
inv_add(inv, lobster, 12);
inv_add(inv, 4doseprayerrestore, 2);

[proc,bb_kit_ranged]
inv_setslot(worn, ^wearpos_rhand, magic_shortbow, 1);
inv_setslot(worn, ^wearpos_quiver, rune_arrow, 500);
inv_setslot(worn, ^wearpos_torso, hardleather_body, 1);
inv_setslot(worn, ^wearpos_legs, leather_chaps, 1);
inv_setslot(worn, ^wearpos_head, coif, 1);
inv_setslot(worn, ^wearpos_hands, leather_vambraces, 1);
inv_setslot(worn, ^wearpos_feet, leather_boots, 1);
inv_setslot(worn, ^wearpos_back, black_cape, 1);
inv_add(inv, lobster, 14);
inv_add(inv, 4doseprayerrestore, 2);

[proc,bb_kit_mage]
inv_setslot(worn, ^wearpos_rhand, staff_of_air, 1);
inv_setslot(worn, ^wearpos_torso, wizards_robe, 1);
inv_setslot(worn, ^wearpos_legs, blue_skirt, 1);
inv_setslot(worn, ^wearpos_head, bluewizhat, 1);
inv_setslot(worn, ^wearpos_feet, leather_boots, 1);
inv_setslot(worn, ^wearpos_back, black_cape, 1);
inv_add(inv, firerune, 1000);
inv_add(inv, chaosrune, 1000);
inv_add(inv, deathrune, 500);
inv_add(inv, lobster, 12);
inv_add(inv, 4doseprayerrestore, 2);

[proc,bb_kit_destroy]
inv_clear(inv);
inv_clear(worn);
```

Every obj name above was checked against `engine/content/pack/obj.pack` at the 274 pin and exists there. Four of the spec's obvious guesses do not, and these are the real 274 names in their place: `rune_full_helm` (not `rune_fullhelm`), `black_cape` (not `cape_black`), `4doseprayerrestore` (not `prayerpotion_4`), and `hardleather_body` / `leather_chaps` / `leather_vambraces` / `wizards_robe` / `blue_skirt` / `bluewizhat` (there is no green d'hide or blue wizard set at this revision). Re-check any change with `grep -c "=<name>$" engine/content/pack/obj.pack`, and never add a new obj: this task adds no obj config and no obj pack id.

- [ ] **Step 2: Write `battlebots_login.rs2`**

```
// content-custom/scripts/minigames/game_battlebots/scripts/battlebots_login.rs2
//
// The crash path. A stash with anything in it at login means a match did not reach resolving:
// the engine died, the world rebooted, or the character was force-disconnected during arming.
// Restore unconditionally, log it loudly, and put the character back in the lobby. This is the
// same shape as ~duel_arena_login (duel_arena.rs2:363), which login.rs2 already calls.

[proc,battlebots_login]
if (~bb_stash_held = false) {
    if (~in_bb_arena(coord) = true) {
        // In a plot with an empty stash: nothing to give back, but do not leave them there.
        p_telejump(^bb_arrival);
        %bb_state = ^bb_state_idle;
    }
    return;
}
session_log(^log_moderator, "Battlebots stash restored at login");
~bb_kit_destroy;
~bb_stash_restore;
~bb_match_reset;
p_telejump(^bb_arrival);
mes("Your last Battlebots match did not finish. Your items have been returned.");

[proc,battlebots_logout]
if (~in_bb_arena(coord) = false) {
    return;
}
// Logging out mid-match forfeits, but never at the cost of items: the stash is restored here
// and again at login if this path does not complete.
~bb_kit_destroy;
~bb_stash_restore;
~bb_match_reset;

/// Clear the per-match varps without touching %bb_match_seq, which is the front server's cursor.
[proc,bb_match_reset]
%bb_state = ^bb_state_idle;
%bb_plot = 0;
%bb_opponent = null;
%bb_kit = 0;
cleartimer(bb_match_clock);
clearqueue(bb_match_start);
clearqueue(bb_match_end);
```

- [ ] **Step 3: Shadow `login.rs2` with one added line**

```bash
mkdir -p content-custom/scripts/login_logout
cp engine/content/scripts/login_logout/login.rs2 content-custom/scripts/login_logout/login.rs2
sha256sum engine/content/scripts/login_logout/login.rs2   # record as baseSha256
```
Then edit the copy: immediately after the line `~duel_arena_login;` add
```
// if a Battlebots match did not finish, give the character their items back
~battlebots_login;
```
and find the `[logout,_]` handler in the same file (or, if `logout` lives elsewhere, add `~battlebots_logout;` beside the existing `~duel_arena_logout;` call — `grep -rn "duel_arena_logout" engine/content/scripts` locates it) and add `~battlebots_logout;` next to it.

Add to `content-custom/manifest.json`:
```json
{ "path": "scripts/login_logout/login.rs2", "baseSha256": "<sha256 recorded above>" }
```

- [ ] **Step 4: Prove the crash path by hand**

```powershell
pwsh scripts/content-overlay.ps1
cd engine/server; npx tsx tools/pack/BuildOverlay.ts; cd ../..
npm run dev
```
In game, with a staff account carrying a recognisable inventory:
1. `::tele 4512 4500`, note the exact inventory and worn items.
2. Run the stash by hand — the fastest way before Task 5 exists is a temporary `[command,bbtest]` in `battlebots_kit.rs2` that calls `~bb_stash_store; ~bb_kit_issue(1);` — then confirm the inventory is the melee kit.
3. Kill the engine hard: `taskkill /IM node.exe /F` (or kill the `idlescape-engine` process tree). **Do not** log out first; the point is that the autosave, not the logout path, is what the character comes back from.
4. Restart with `npm run dev`, log the same character in.
5. Expected: the chat shows "Your last Battlebots match did not finish. Your items have been returned.", the original inventory and worn items are back exactly as noted in step 1, the kit is gone, and the character stands on `^bb_arrival`.
6. Log out and back in again. Expected: no message, nothing moves — the restore is idempotent.
7. Delete the temporary `[command,bbtest]` before committing.

Record the observed before/after inventories in the task report. This step is the spec's "hard-kill the server during running, restart, assert full restore at login" acceptance criterion, and it is not satisfied by reasoning about the code.

- [ ] **Step 5: Commit**

```bash
git add content-custom/scripts content-custom/manifest.json
git commit -m "feat(battlebots): perm-scoped item stash with an idempotent login restore

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MERnR4A1K49VY7hZZtQEtY"
```

---

## Task 4: Safe PvP in the plots

**Files:**
- Create: `content-custom/scripts/skill_combat/scripts/pvp/pvp_combat.rs2` (full upstream copy plus two branches)
- Create: `content-custom/scripts/player/scripts/death.rs2` (full upstream copy plus one branch)
- Create: `content-custom/scripts/minigames/game_battlebots/scripts/battlebots_death.rs2`
- Modify: `content-custom/manifest.json`

**Interfaces:**
- Consumes: `~in_bb_arena`, `%bb_state`, `^bb_state_running`, `~bb_match_reset` from Tasks 2-3.
- Produces: `[label,player_death_battlebots]`, `~bb_death_checks()(boolean)`. Task 5 consumes the label indirectly (the death is what ends a match).

- [ ] **Step 1: Shadow `pvp_combat.rs2`**

```bash
mkdir -p content-custom/scripts/skill_combat/scripts/pvp
cp engine/content/scripts/skill_combat/scripts/pvp/pvp_combat.rs2 content-custom/scripts/skill_combat/scripts/pvp/pvp_combat.rs2
sha256sum engine/content/scripts/skill_combat/scripts/pvp/pvp_combat.rs2
```
In the copy, `~pvp_is_attackable` currently opens with the duel-arena branch. Add the Battlebots branch immediately above it, in both `[proc,pvp_is_attackable]` and `[proc,pvp_is_attackable_opt]`:

```
if (~in_bb_arena(coord) = true) {
    return(~bb_death_checks);
}
```

The two procs are the *only* gate on player-versus-player combat in the 274 content (`[opplayer2,_]` and `[applayer2,_]` both return early on a false), so this is the whole of "PvP enabled in the plots". Nothing else needs a wilderness flag.

- [ ] **Step 2: Write `battlebots_death.rs2`**

```
// content-custom/scripts/minigames/game_battlebots/scripts/battlebots_death.rs2
//
// Safe death (spec section 13). The duel arena already proves the shape: [queue,player_death]
// branches to a label that calls ~player_death for the animation and then does NOT run
// ~player_death_lose_items or ~pvp_death_lose_items. Nothing drops, because nothing the player
// owns is on them: the kit is engine-issued and the stash holds their real gear.

[proc,bb_death_checks]()(boolean)
// Both fighters must be in the same plot and the match must be live. A player who somehow
// stands in a plot outside a running match is not a target.
if (%bb_state ! ^bb_state_running) {
    mes("You can't attack that player right now.");
    return(false);
}
if (.%bb_state ! ^bb_state_running) {
    mes("You can't attack that player right now.");
    return(false);
}
if (~bb_plot_of(coord) ! ~bb_plot_of(.coord)) {
    mes("You can't attack that player right now.");
    return(false);
}
return(true);

[label,player_death_battlebots]
~player_death;
~combat_clearqueue;
clearqueue(player_death);
mes("Oh dear, your bot is dead!");
// The winner is whoever is still standing. The runner owns the bookkeeping; this only reports
// the death, so a death and a clock expiry take the same path out.
%bb_outcome = ^bb_outcome_loss;
if (.finduid(%bb_opponent) = true) {
    .%bb_outcome = ^bb_outcome_win;
}
clearqueue(bb_match_end);
queue(bb_match_end, 0, 0);
if (.finduid(%bb_opponent) = true) {
    .clearqueue(bb_match_end);
    .queue(bb_match_end, 0, 0);
}
```

- [ ] **Step 3: Shadow `death.rs2`**

```bash
mkdir -p content-custom/scripts/player/scripts
cp engine/content/scripts/player/scripts/death.rs2 content-custom/scripts/player/scripts/death.rs2
sha256sum engine/content/scripts/player/scripts/death.rs2
```
In the copy's `[queue,player_death]`, add the Battlebots branch **above** the existing duel branch, so a plot death never reaches `~pvp_death_lose_items`:
```
if (~in_bb_arena(coord) = true & %bb_state = ^bb_state_running) {
    @player_death_battlebots;
}
```

Record both shadowed files in `content-custom/manifest.json` with their recorded shas.

- [ ] **Step 4: Verify by killing a character in a plot**

Pack, boot, and with two staff logins (two browser profiles, or the shell's second character tab):
1. `::tele 4546 4485` both characters into plot 1.
2. Temporarily set `%bb_state` to running on both with a throwaway `[command,bbstate]` in `battlebots_death.rs2`.
3. Give one an inventory item and kill it with the other.
4. Expected: the loser dies, "Oh dear, your bot is dead!" appears, **no items drop on the tile**, and `~pvp_death_lose_items` is never reached. Confirm the ground is empty with `::` inspection or by walking the tile.
5. Now `::tele` both to Lumbridge and confirm the pair **cannot** attack each other there — the wilderness gate still applies outside the plots.
6. Delete the throwaway command before committing.

- [ ] **Step 5: Commit**

```bash
git add content-custom/scripts content-custom/manifest.json
git commit -m "feat(battlebots): enable safe pvp and a no-drop death inside the arena plots

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MERnR4A1K49VY7hZZtQEtY"
```

---

## Task 5: The match runner

**Files:**
- Create: `content-custom/scripts/minigames/game_battlebots/scripts/battlebots_match.rs2`

**Interfaces:**
- Consumes: everything from Tasks 2-4.
- Produces: `~bb_free_plot()(int)`, `~bb_arm(int $plot, int $mode, int $kit)`, `[queue,bb_match_start]`, `[timer,bb_match_clock]`, `[queue,bb_match_end]`, `~bb_resolve`, `~bb_publish_result`. Tasks 6, 7 and 8 all start a match by calling `~bb_arm`; Task 9 reads the varps `~bb_publish_result` writes.

**Result publication:** `~bb_publish_result` writes the outcome into `%bb_outcome`, `%bb_ticks`, `%bb_dmg_dealt`, `%bb_dmg_taken`, `%bb_hp_left`, `%bb_mode`, `%bb_match_id`, and *then last* increments `%bb_match_seq`. The sequence bump is the commit: the engine overlay in Task 9 only reads a player's row when `%bb_match_seq` changes, so every other field is already settled by the time it looks. Both fighters carry the same `%bb_match_id` (from the shared `%bb_match_counter`), which is how the front server joins the two rows into one match.

- [ ] **Step 1: Write `battlebots_match.rs2`**

```
// content-custom/scripts/minigames/game_battlebots/scripts/battlebots_match.rs2
//
// Match lifecycle (spec section 4): arming -> running -> resolving. Plot allocation uses
// map_playercount over the plot's own zone, the same primitive ~duel_arena_coord uses.
//
// Damage bookkeeping is deliberately coarse. RuneScript gets no per-hit ledger, so the clock
// timer samples both fighters' hitpoints once a tick and accumulates the drops: damage taken is
// our own hp falling, damage dealt is theirs. Healing shows up as a zero-width sample rather
// than negative damage, so eating does not subtract from a total. That is enough for the
// timeout tie-break and the history panel, and it is honest about what rev 274 will tell us.

/// The lowest-numbered plot with nobody in it, or -1 when the pool is full.
[proc,bb_free_plot]()(int)
def_int $plot = 1;
while ($plot <= ^bb_plot_count) {
    if (map_playercount(~bb_plot_sw($plot), ~bb_plot_ne($plot)) = 0) {
        return($plot);
    }
    $plot = calc($plot + 1);
}
return(-1);

/// Arm this player into a plot. The caller has already decided the plot, the mode and the
/// opponent (%bb_opponent, null for practice). Order matters: the stash write commits before
/// the kit is issued, so there is never an instant where the character holds neither.
[proc,bb_arm](int $plot, int $mode, int $kit)
%bb_state = ^bb_state_arming;
%bb_plot = $plot;
%bb_mode = $mode;
%bb_kit = $kit;
%bb_outcome = ^bb_outcome_none;
%bb_dmg_dealt = 0;
%bb_dmg_taken = 0;
%bb_ticks = 0;
%bb_hp_last = stat_base(hitpoints);
%bb_foe_hp_last = 0;
if (.finduid(%bb_opponent) = true) {
    %bb_foe_hp_last = .stat_base(hitpoints);
}
p_stopaction;
if_close;
~prayer_deactivate_all;
~stat_reset_all;
healenergy(10000);
~bb_stash_store;
~bb_kit_issue($kit);
set_player_op(null, 5, ^false);
queue(bb_match_start, 0, 0);

[queue,bb_match_start]
if (%bb_state ! ^bb_state_arming) {
    return;
}
// Countdown, mirroring duel_arena_countdown. A player who leaves the plot during it aborts.
say("3");
world_delay(1);
if (~in_bb_arena(coord) = false) { ~bb_abort; return; }
say("2");
world_delay(1);
if (~in_bb_arena(coord) = false) { ~bb_abort; return; }
say("1");
world_delay(1);
if (~in_bb_arena(coord) = false) { ~bb_abort; return; }
say("FIGHT!");
%bb_state = ^bb_state_running;
settimer(bb_match_clock, 1);

[timer,bb_match_clock]
if (%bb_state ! ^bb_state_running) {
    cleartimer(bb_match_clock);
    return;
}
%bb_ticks = calc(%bb_ticks + 1);
// Sample both hitpoint bars and accumulate the drops. %bb_hp_last and %bb_foe_hp_last hold the
// previous tick's readings; a rise (eating) contributes nothing rather than a negative.
def_int $mine_now = stat(hitpoints);
if (%bb_hp_last > $mine_now) {
    %bb_dmg_taken = calc(%bb_dmg_taken + %bb_hp_last - $mine_now);
}
%bb_hp_last = $mine_now;
if (.finduid(%bb_opponent) = true) {
    def_int $theirs_now = .stat(hitpoints);
    if (%bb_foe_hp_last > $theirs_now) {
        %bb_dmg_dealt = calc(%bb_dmg_dealt + %bb_foe_hp_last - $theirs_now);
    }
    %bb_foe_hp_last = $theirs_now;
}
~bb_practice_tick;
if (%bb_ticks < ^bb_match_ticks) {
    return;
}
// Clock expired. Tie-break on remaining hp as a percentage of max, then on damage dealt, then
// draw (spec section 13).
cleartimer(bb_match_clock);
def_int $mine = calc(multiply(stat(hitpoints), 100) / stat_base(hitpoints));
def_int $theirs = 0;
if (.finduid(%bb_opponent) = true) {
    $theirs = calc(multiply(.stat(hitpoints), 100) / .stat_base(hitpoints));
}
if ($mine > $theirs) {
    %bb_outcome = ^bb_outcome_win;
} else if ($mine < $theirs) {
    %bb_outcome = ^bb_outcome_loss;
} else if (%bb_dmg_dealt > %bb_dmg_taken) {
    %bb_outcome = ^bb_outcome_win;
} else if (%bb_dmg_dealt < %bb_dmg_taken) {
    %bb_outcome = ^bb_outcome_loss;
} else {
    %bb_outcome = ^bb_outcome_draw;
}
clearqueue(bb_match_end);
queue(bb_match_end, 0, 0);

[queue,bb_match_end]
if (%bb_state ! ^bb_state_running & %bb_state ! ^bb_state_arming) {
    return;
}
~bb_resolve;

[proc,bb_resolve]
%bb_state = ^bb_state_resolving;
cleartimer(bb_match_clock);
~combat_clearqueue;
%bb_hp_left = stat(hitpoints);
~bb_publish_result;
~bb_kit_destroy;
~bb_stash_restore;
~prayer_deactivate_all;
~stat_reset_all;
healenergy(10000);
anim(null, 0);
p_stopaction;
// Land in the lobby OFF the pad, so a match never silently re-queues someone who walked away
// from their keyboard (spec section 9.3).
p_telejump(^bb_arrival);
~bb_match_reset;
switch_int (%bb_outcome) {
    case ^bb_outcome_win  : mes("You won the match."); ~music_jingle("duel win2");
    case ^bb_outcome_loss : mes("You lost the match.");
    case ^bb_outcome_draw : mes("The match ended in a draw.");
    default : mes("The match was abandoned. Nothing was recorded.");
}

/// An engine-side failure, not a player one. No result is recorded for either side.
[proc,bb_abort]
%bb_outcome = ^bb_outcome_abort;
%bb_state = ^bb_state_resolving;
cleartimer(bb_match_clock);
~bb_kit_destroy;
~bb_stash_restore;
p_telejump(^bb_arrival);
~bb_match_reset;
mes("The match was abandoned. Nothing was recorded.");

/// The last write is %bb_match_seq, and that is deliberate: the engine overlay's post-cycle
/// sweep triggers on a change to it and reads every other field, so the bump is the commit.
[proc,bb_publish_result]
if (%bb_outcome = ^bb_outcome_abort) {
    return;
}
if (%bb_mode = ^bb_mode_ranked & %bb_ticks < ^bb_min_recorded_ticks) {
    // Too short to credit: an instant forfeit must not farm the ladder (spec section 15).
    return;
}
%bb_match_seq = calc(%bb_match_seq + 1);
```

If `stat_base` or `multiply` are not commands at this revision (`grep -n "command,stat_base\|command,multiply" engine/content/scripts/engine.rs2`), substitute the equivalents that are there — `~stat_base` or an inline `calc(a * 100 / b)` — and note the substitution in the task report.

- [ ] **Step 2: Pack, boot, and drive a match by hand**

Add a temporary staff command in `battlebots_match.rs2`:
```
[command,bbmatch](int $plot)
%bb_opponent = null;
~bb_arm($plot, ^bb_mode_practice, 1);
```
Then in game: `::tele 4512 4500`, `::bbmatch 1`.
Expected: the character is stashed, wears the rune kit, is *not* moved (arming does not teleport; Tasks 6-8 place the fighters), the countdown prints 3/2/1/FIGHT in overhead chat, and 500 ticks later the clock expires, the kit vanishes, the original inventory returns and the character lands on `^bb_arrival` with "The match ended in a draw."

Shorten `^bb_match_ticks` to 20 temporarily to avoid a five-minute wait, then restore it. Remove the temporary command before committing.

- [ ] **Step 3: Commit**

```bash
git add content-custom/scripts/minigames/game_battlebots
git commit -m "feat(battlebots): match lifecycle, plot allocation and result publication

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MERnR4A1K49VY7hZZtQEtY"
```

---

## Task 6: Practice mode

Practice ships before ranked because a minigame with an empty queue looks dead, and because debugging a script against a known opponent is how anyone will actually author one (spec section 12).

**Files:**
- Create: `content-custom/scripts/minigames/game_battlebots/scripts/battlebots_practice.rs2`

**Interfaces:**
- Consumes: `~bb_free_plot`, `~bb_arm`, `~bb_plot_start_a`, `~bb_plot_start_b`, `^bb_practice_*`.
- Produces: `~bb_start_practice(int $difficulty, int $kit)`. Task 12's panel triggers it through the entry route from Task 10.

- [ ] **Step 1: Write `battlebots_practice.rs2`**

```
// content-custom/scripts/minigames/game_battlebots/scripts/battlebots_practice.rs2
//
// The practice opponent is an existing 274 npc spawned into the plot with npc_add, not a
// second headless client. kolodion_fight.rs2 is the precedent: a per-player scripted opponent
// spawned for the duration of one fight. This needs no npc config, no model, and no second
// player, which is the entire point of practice mode.

[proc,bb_start_practice](int $difficulty, int $kit)
if (%bb_state ! ^bb_state_idle) {
    mes("You are already in a Battlebots match.");
    return;
}
if (~in_bb_lobby(coord) = false) {
    mes("You need to be in the Battlebots lobby.");
    return;
}
def_int $plot = ~bb_free_plot;
if ($plot = -1) {
    mes("Every arena is busy. Try again in a few minutes.");
    return;
}
~bb_leave_queue;
%bb_opponent = null;
p_telejump(~bb_plot_start_a($plot));
~bb_arm($plot, ^bb_mode_practice, $kit);
def_npc $foe = ^bb_practice_easy;
switch_int ($difficulty) {
    case 2 : $foe = ^bb_practice_medium;
    case 3 : $foe = ^bb_practice_hard;
}
// Duration is generous: the clock, not the npc timer, ends the match.
npc_add(~bb_plot_start_b($plot), $foe, calc(^bb_match_ticks + 100));

/// Practice ends when the npc dies as well as when the clock expires, so ~bb_resolve is reached
/// from both. The npc's own death trigger is upstream content we do not shadow, so this polls
/// the plot on the match clock instead: cheap, and it never touches an upstream file.
[proc,bb_practice_tick]
if (%bb_mode ! ^bb_mode_practice) {
    return;
}
if (npc_findallzone(coord) = true) {
    return;
}
%bb_outcome = ^bb_outcome_win;
clearqueue(bb_match_end);
queue(bb_match_end, 0, 0);
```

`[timer,bb_match_clock]` in Task 5 already calls `~bb_practice_tick;` once a tick, so nothing in `battlebots_match.rs2` changes here.

If `npc_findallzone` returns void rather than a boolean at this revision (`grep -n "command,npc_findallzone" -A 2 engine/content/scripts/engine.rs2`), pair it with `npc_findnext` in the standard iterate-and-count shape used elsewhere in the content (`grep -rn "npc_findallzone" -A 6 engine/content/scripts --include=*.rs2` for a live example) and count survivors instead.

- [ ] **Step 2: Verify end to end**

Add a temporary `[command,bbpractice](int $d)` calling `~bb_start_practice($d, 1)`. In game: `::tele 4512 4500`, `::bbpractice 1`.
Expected: teleported into plot 1's corner A, kit issued, countdown runs, a Warrior woman spawns in corner B, the two fight, and when one dies the match resolves — kit gone, inventory back, standing on `^bb_arrival`. Repeat with `::bbpractice 3` and confirm the Hero spawns instead.

Then confirm the concurrency ceiling: run practice from two characters at once and check they land in different plots (`~bb_free_plot` skips an occupied one).

Remove the temporary command.

- [ ] **Step 3: Commit**

```bash
git add content-custom/scripts/minigames/game_battlebots
git commit -m "feat(battlebots): practice matches against an engine npc opponent

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MERnR4A1K49VY7hZZtQEtY"
```

---

## Task 7: Challenge matches

**Files:**
- Create: `content-custom/scripts/minigames/game_battlebots/scripts/battlebots_challenge.rs2`

**Interfaces:**
- Consumes: `~bb_free_plot`, `~bb_arm`, `~in_bb_lobby`, `%bb_state`, `%bb_opponent`, `%bb_kit`.
- Produces: `[opplayer5,_]`, `[applayer5,_]`, `~bb_offer`, `~bb_accept`, `[queue,bb_challenge_start]`.

**The bait-and-switch rule:** both sides confirm twice. Changing kit after accepting resets both accepts to stage one. That is enforced by storing the kit each side confirmed (`%bb_kit_confirmed`) and comparing it at the second confirm — the spec's "accept invalidation on change", implemented without an interface (R9): stage one is a `~mesbox` with the opponent's name, combat level and kit; stage two is a chat confirm.

- [ ] **Step 1: Add two varps**

Append to `battlebots.varp`:
```
[bb_kit_confirmed]
scope=perm
protect=no

[bb_offer_from]
scope=perm
protect=no
type=player_uid
```
and to `content-custom/pack/varp.pack` (Task 2 already used 368-381, so these continue from 382):
```
382=bb_kit_confirmed
383=bb_offer_from
```

- [ ] **Step 2: Write `battlebots_challenge.rs2`**

```
// content-custom/scripts/minigames/game_battlebots/scripts/battlebots_challenge.rs2
//
// Right-click Challenge, shaped like Trade with. Op slot 5 rather than slot 1: slot 1 is the
// duel arena's [opplayer1,_] in an 858-line upstream file we would otherwise have to shadow,
// and login.rs2 already parks slot 5 at null with no handler anywhere in the 274 content.
//
// No new interface (spec section 17 is deferred). Stage one is a mesbox naming both sides and
// their kits; stage two is a chat confirm. Changing kit between the two invalidates both.

[opplayer5,_]
p_stopaction;
if (~in_bb_lobby(coord) = false | ~in_bb_lobby(.coord) = false) {
    mes("You can only challenge someone in the Battlebots lobby.");
    return;
}
if (%bb_state = ^bb_state_queued) {
    mes("Leave the queue pad before you challenge someone.");
    return;
}
if (%bb_state ! ^bb_state_idle) {
    mes("You are already in a Battlebots match.");
    return;
}
if (.%bb_state ! ^bb_state_idle) {
    mes("That player is busy.");
    return;
}
if (.uid = uid) {
    mes("You can't challenge yourself.");
    return;
}
~bb_offer;

[applayer5,_]
p_aprange(1);

[proc,bb_offer]
if (.%bb_offer_from = uid) {
    // They already offered us: this is the accept.
    ~bb_accept;
    return;
}
%bb_offer_from = null;
.%bb_offer_from = uid;
%bb_state = ^bb_state_offered;
mes("Sending Battlebots challenge to <.displayname>...");
.mes("<displayname> (level <tostring(~player_combat_level)>) wishes to challenge you at Battlebots.");
.mes("Right-click and choose Challenge to accept.");
// The offer is dropped after 100 ticks so a stale one cannot start a match much later.
settimer(bb_offer_timeout, 100);

[timer,bb_offer_timeout]
cleartimer(bb_offer_timeout);
if (%bb_state = ^bb_state_offered) {
    %bb_state = ^bb_state_idle;
    %bb_offer_from = null;
}

[proc,bb_accept]
def_int $plot = ~bb_free_plot;
if ($plot = -1) {
    mes("Every arena is busy. Try again in a few minutes.");
    .mes("Every arena is busy. Try again in a few minutes.");
    return;
}
%bb_state = ^bb_state_confirming;
.%bb_state = ^bb_state_confirming;
%bb_kit_confirmed = %bb_kit;
.%bb_kit_confirmed = .%bb_kit;
%bb_opponent = .uid;
.%bb_opponent = uid;
~mesbox("<.displayname> (level <tostring(~.player_combat_level)>), kit <tostring(.%bb_kit)>.|You: kit <tostring(%bb_kit)>.|Nothing is at stake. Choose Confirm to fight.");
.~mesbox("<displayname> (level <tostring(~player_combat_level)>), kit <tostring(%bb_kit)>.|You: kit <tostring(.%bb_kit)>.|Nothing is at stake. Choose Confirm to fight.");
queue(bb_challenge_start, 2, $plot);
.queue(bb_challenge_start, 2, $plot);

[queue,bb_challenge_start](int $plot)
if (%bb_state ! ^bb_state_confirming) {
    return;
}
if (.finduid(%bb_opponent) = false) {
    mes("Your opponent is no longer available.");
    %bb_state = ^bb_state_idle;
    %bb_opponent = null;
    return;
}
// Bait and switch: the kit each side confirmed must still be the kit they hold.
if (%bb_kit ! %bb_kit_confirmed | .%bb_kit ! .%bb_kit_confirmed) {
    mes("The loadout changed. The challenge was cancelled.");
    .mes("The loadout changed. The challenge was cancelled.");
    %bb_state = ^bb_state_idle;
    .%bb_state = ^bb_state_idle;
    %bb_opponent = null;
    .%bb_opponent = null;
    return;
}
if (~in_bb_lobby(coord) = false | ~in_bb_lobby(.coord) = false) {
    %bb_state = ^bb_state_idle;
    %bb_opponent = null;
    return;
}
%bb_offer_from = null;
if (uid < .uid) {
    p_telejump(~bb_plot_start_a($plot));
} else {
    p_telejump(~bb_plot_start_b($plot));
}
~bb_arm($plot, ^bb_mode_challenge, %bb_kit);
```

- [ ] **Step 3: Verify with two characters**

Two staff logins in the lobby:
1. A right-clicks B, chooses Challenge. Expected: B sees the challenge lines, A sees "Sending...".
2. B right-clicks A, chooses Challenge. Expected: both see the mesbox, both are teleported into the same plot at opposite corners, both wear the kit, countdown runs.
3. Repeat, but between the offer and the confirm change B's `%bb_kit` (temporary `[command,bbkit](int $k)` setting `%bb_kit = $k`). Expected: "The loadout changed. The challenge was cancelled." for both, and neither is teleported. **This is the spec's phase 5 gate.**
4. Repeat with A standing on the queue pad. Expected: "Leave the queue pad before you challenge someone."
5. Challenge yourself with a second tab of the same account. Expected: refused by the `.uid = uid` check.

- [ ] **Step 4: Commit**

```bash
git add content-custom/scripts content-custom/pack/varp.pack
git commit -m "feat(battlebots): player-to-player challenges on op slot 5 with a two-stage confirm

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MERnR4A1K49VY7hZZtQEtY"
```

---

## Task 8: The queue pad and ranked matchmaking

**Files:**
- Create: `content-custom/scripts/minigames/game_battlebots/scripts/battlebots_queue.rs2`

**Interfaces:**
- Consumes: `%bb_queue_uid`, `%bb_queue_since`, `%bb_queue_level`, `%bb_match_counter`, `~bb_free_plot`, `~bb_arm`.
- Produces: `[zone,0_70_70_24_24]`, `[zoneexit,0_70_70_24_24]`, `~bb_join_queue`, `~bb_leave_queue`, `~bb_band_now(int $waited)(int)`.

- [ ] **Step 1: Write `battlebots_queue.rs2`**

```
// content-custom/scripts/minigames/game_battlebots/scripts/battlebots_queue.rs2
//
// Stepping onto the pad queues, stepping off dequeues. [zone] and [zoneexit] fire on the 8x8
// engine zone transition rather than per tick, so pathing across the corner of the pad cannot
// flap or double queue: the engine debounces it for us. The pad is exactly one zone, which is
// why battlebotsMap.ts puts it at a local origin that is a multiple of 8.
//
// One shared waiting slot rather than a FIFO list: RuneScript has no "find every player in a
// zone" command, and a world with this population does not need one. The oldest waiter is
// always the one in the slot, so nobody starves.

[zone,0_70_70_24_24]
~bb_join_queue;

[zoneexit,0_70_70_24_24]
~bb_leave_queue;

/// The band widens by 1 every ^bb_band_step_ticks of waiting, to ^bb_band_max.
[proc,bb_band_now](int $waited)(int)
def_int $band = calc(^bb_band_start + $waited / ^bb_band_step_ticks);
if ($band > ^bb_band_max) {
    return(^bb_band_max);
}
return($band);

[proc,bb_join_queue]
if (%bb_state ! ^bb_state_idle) {
    return;
}
def_int $level = ~player_combat_level;
if (%bb_queue_uid = null | finduid(%bb_queue_uid) = false) {
    %bb_queue_uid = uid;
    %bb_queue_since = map_clock;
    %bb_queue_level = $level;
    %bb_state = ^bb_state_queued;
    mes("Queued for a ranked match. Step off the pad to leave the queue.");
    return;
}
if (%bb_queue_uid = uid) {
    return;
}
// Someone is waiting. Never pair two characters of the same account (spec section 15).
if (finduid(%bb_queue_uid) = false) {
    %bb_queue_uid = null;
    ~bb_join_queue;
    return;
}
p_finduid(%bb_queue_uid);
if (.uid = uid) {
    return;
}
def_int $waited = calc(map_clock - %bb_queue_since);
def_int $band = ~bb_band_now($waited);
if (abs(calc($level - %bb_queue_level)) > $band) {
    %bb_state = ^bb_state_queued;
    mes("Queued. Waiting for an opponent within <tostring($band)> combat levels.");
    return;
}
def_int $plot = ~bb_free_plot;
if ($plot = -1) {
    %bb_state = ^bb_state_queued;
    mes("Every arena is busy. You are still queued.");
    return;
}
%bb_queue_uid = null;
%bb_match_counter = calc(%bb_match_counter + 1);
%bb_match_id = %bb_match_counter;
.%bb_match_id = %bb_match_counter;
%bb_opponent = .uid;
.%bb_opponent = uid;
p_telejump(~bb_plot_start_a($plot));
.p_telejump(~bb_plot_start_b($plot));
~bb_arm($plot, ^bb_mode_ranked, %bb_kit);
.~bb_arm($plot, ^bb_mode_ranked, .%bb_kit);

[proc,bb_leave_queue]
if (%bb_queue_uid = uid) {
    %bb_queue_uid = null;
}
if (%bb_state = ^bb_state_queued) {
    %bb_state = ^bb_state_idle;
    mes("You have left the Battlebots queue.");
}
```

Then add `~bb_leave_queue;` to `~battlebots_logout` in `battlebots_login.rs2` (before its `~in_bb_arena` early return), so logging out while on the pad dequeues.

- [ ] **Step 2: Verify**

Two staff logins with combat levels within 5 of each other:
1. A steps onto the pad. Expected: "Queued for a ranked match."
2. A walks off the pad. Expected: "You have left the Battlebots queue."
3. A steps on, B steps on. Expected: both are teleported to opposite corners of a free plot with the ranked mode set, and neither is left queued.
4. Walk diagonally across a single corner tile of the pad without stopping. Expected: **exactly one** "Queued" line and **exactly one** "left the queue" line — no flap, no double queue. This is the spec's §22 queue-pad criterion.
5. Two characters of the *same* Firebase account (two tabs) both step on. Expected: no match starts; the `.uid = uid` guard holds. Note in the report that this guards the same *character*, and that same-*account* pairing is the front server's job in Task 10, because RuneScript does not see the Firebase uid.
6. Finish a match and confirm both fighters land on `^bb_arrival`, which is outside the pad zone, so neither is silently re-queued.

- [ ] **Step 3: Commit**

```bash
git add content-custom/scripts/minigames/game_battlebots
git commit -m "feat(battlebots): queue pad zone triggers and combat-level band matchmaking

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MERnR4A1K49VY7hZZtQEtY"
```

---

## Task 9: The engine overlay — result sweep and the entry route

**Files:**
- Create: `engine-custom/src/idlescape/battlebots.ts`
- Create: `engine-custom/src/idlescape/battlebots.test.ts`
- Modify: `engine-custom/src/idlescape/management.ts`
- Modify: `engine-custom/src/idlescape/install.ts`
- Modify: `engine-custom/PATCHES.md`, `engine-custom/manifest.json`

**Interfaces:**
- Produces: `export function sweepBattlebots(players: Iterable<Player>): BattlebotsRow[]`, `export function registerBattlebotsRoutes(app, cfg)`, `export interface BattlebotsRow`. Task 10's front server consumes the posted row shape; the `hookContract` test in Task 10 pins the wire format from the other side, the way `server/src/bank/hookContract.test.ts` already does for the bank hook.

Follow `engine-custom/PATCHES.md` exactly: the sweep is called from the existing post-cycle hook in `install.ts` (Patch 2 already wraps `World.cycle`), the route is registered on the MANAGEMENT Fastify app only, and `x-idlescape-mgmt` is compared with `timingSafeEqual` over UTF-8 bytes. With an empty `managementSecret` the route is not registered at all.

- [ ] **Step 1: Write the failing test**

```ts
// engine-custom/src/idlescape/battlebots.test.ts
import { describe, expect, test } from 'bun:test';
import { rowFor, sweepBattlebots, type BattlebotsPlayerLike } from './battlebots';

function player(over: Partial<BattlebotsPlayerLike> = {}): BattlebotsPlayerLike {
  return {
    username: 'alpha', ownerKey: 'uid-1',
    vars: { bb_match_seq: 1, bb_match_id: 7, bb_mode: 2, bb_outcome: 1, bb_ticks: 143, bb_dmg_dealt: 61, bb_dmg_taken: 40, bb_hp_left: 22 },
    ...over
  };
}

describe('battlebots result sweep', () => {
  test('a row is emitted the first time a sequence is seen', () => {
    const seen = new Map<string, number>();
    expect(sweepBattlebots([player()], seen)).toEqual([rowFor(player())]);
  });

  test('the same sequence is never emitted twice', () => {
    const seen = new Map<string, number>();
    sweepBattlebots([player()], seen);
    expect(sweepBattlebots([player()], seen)).toEqual([]);
  });

  test('a bumped sequence emits again', () => {
    const seen = new Map<string, number>();
    sweepBattlebots([player()], seen);
    const next = player({ vars: { ...player().vars, bb_match_seq: 2, bb_outcome: 2 } });
    expect(sweepBattlebots([next], seen)).toEqual([rowFor(next)]);
  });

  test('a player with no completed match is never emitted', () => {
    const seen = new Map<string, number>();
    expect(sweepBattlebots([player({ vars: { ...player().vars, bb_match_seq: 0 } })], seen)).toEqual([]);
  });

  test('the row carries the identity the front server joins on', () => {
    const r = rowFor(player());
    expect(r).toEqual({
      ownerKey: 'uid-1', gameName: 'alpha', seq: 1, matchId: 7,
      mode: 'ranked', outcome: 'win', ticks: 143, damageDealt: 61, damageTaken: 40, hpRemaining: 22
    });
  });

  test('an unknown mode or outcome code degrades rather than throwing', () => {
    const r = rowFor(player({ vars: { ...player().vars, bb_mode: 9, bb_outcome: 9 } }));
    expect(r.mode).toBe('unknown');
    expect(r.outcome).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd engine-custom && bun test src/idlescape/battlebots.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `battlebots.ts`**

```ts
// engine-custom/src/idlescape/battlebots.ts
//
// Two seams, both following what SP8 already built.
//
// 1. The result sweep. RuneScript cannot make an HTTP request, so the match runner publishes a
//    result by bumping the perm varp bb_match_seq (battlebots_match.rs2, ~bb_publish_result).
//    This runs from the same post-cycle hook that already pushes changed bank tab varps, sees
//    the bump, and posts the row to the front server signed with the management secret. The
//    sequence number, not a queue, is what makes it exactly-once: a row already seen is skipped,
//    so a restart re-posts nothing and a missed post is picked up on the next cycle.
//
// 2. The entry teleport. The front server owns "who may enter", but only the engine can move a
//    character, so this exposes it on the management app the same way the owner-bank routes are
//    exposed. A client-supplied destination would be a free teleport exploit, so the
//    destination is a constant here and the caller only names a character.
import { timingSafeEqual } from 'node:crypto';

/** The Battlebots lobby arrival tile. Must equal ^bb_arrival in battlebots.constant. */
export const LOBBY_ARRIVAL = { x: 4512, z: 4500, level: 0 } as const;

const MODES = ['practice', 'challenge', 'ranked'] as const;
const OUTCOMES = ['none', 'win', 'loss', 'draw', 'abort'] as const;

export interface BattlebotsPlayerLike {
  username: string;
  ownerKey: string | null;
  vars: Record<string, number>;
}

export interface BattlebotsRow {
  ownerKey: string | null;
  gameName: string;
  seq: number;
  matchId: number;
  mode: (typeof MODES)[number] | 'unknown';
  outcome: (typeof OUTCOMES)[number] | 'unknown';
  ticks: number;
  damageDealt: number;
  damageTaken: number;
  hpRemaining: number;
}

export function rowFor(p: BattlebotsPlayerLike): BattlebotsRow {
  const v = p.vars;
  return {
    ownerKey: p.ownerKey,
    gameName: p.username,
    seq: v.bb_match_seq ?? 0,
    matchId: v.bb_match_id ?? 0,
    mode: MODES[v.bb_mode ?? -1] ?? 'unknown',
    outcome: OUTCOMES[v.bb_outcome ?? -1] ?? 'unknown',
    ticks: v.bb_ticks ?? 0,
    damageDealt: v.bb_dmg_dealt ?? 0,
    damageTaken: v.bb_dmg_taken ?? 0,
    hpRemaining: v.bb_hp_left ?? 0
  };
}

/**
 * Rows for every player whose bb_match_seq has moved since the last sweep. `seen` is the
 * caller's cursor map, keyed by game name; it lives for the life of the process, which is all
 * it needs to: a restart re-reads the varps from the .sav and the sequence has not moved, so
 * nothing is re-posted.
 */
export function sweepBattlebots(players: Iterable<BattlebotsPlayerLike>, seen: Map<string, number>): BattlebotsRow[] {
  const out: BattlebotsRow[] = [];
  for (const p of players) {
    const seq = p.vars.bb_match_seq ?? 0;
    if (seq <= 0) continue;
    if ((seen.get(p.username) ?? 0) >= seq) continue;
    seen.set(p.username, seq);
    out.push(rowFor(p));
  }
  return out;
}

function secretMatches(header: string | undefined, secret: string): boolean {
  if (!header || !secret) return false;
  const a = Buffer.from(header, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface BattlebotsDeps {
  managementSecret: string;
  /** World.getPlayerByUsername, narrowed to what this route needs. */
  findPlayer(username: string): { teleport(x: number, z: number, level: number): void; staffModLevel: number } | undefined;
  /** ^bb_public in battlebots.constant, read once at boot. */
  publicEntry: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerBattlebotsRoutes(app: any, deps: BattlebotsDeps): void {
  if (!deps.managementSecret) {
    // Same rule as the owner-bank routes: an unconfigured world answers 404 rather than
    // exposing an unauthenticated seam.
    return;
  }
  app.post('/battlebots/enter/:name', (req: any, reply: any) => {
    if (!secretMatches(req.headers['x-idlescape-mgmt'], deps.managementSecret)) {
      return reply.code(401).send({ error: 'unauthorised' });
    }
    const name = String(req.params?.name ?? '');
    if (!/^[a-z0-9_]{1,12}$/.test(name)) return reply.code(400).send({ error: 'bad_name' });
    const player = deps.findPlayer(name);
    if (!player) return reply.code(404).send({ error: 'offline' });
    if (!deps.publicEntry && player.staffModLevel < 1) {
      return reply.code(403).send({ error: 'not_public' });
    }
    player.teleport(LOBBY_ARRIVAL.x, LOBBY_ARRIVAL.z, LOBBY_ARRIVAL.level);
    return reply.send({ ok: true });
  });
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd engine-custom && bun test src/idlescape/battlebots.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Wire it into the overlay**

In `engine-custom/src/idlescape/install.ts`, inside the existing post-cycle sweep (the block that already calls `changedTabVarps(player)`), add a call to `sweepBattlebots` over the same player list with a module-level `seen` map, and post each row to `${hookUrl.replace('/bank-changed', '/battlebots-result')}` with the `x-idlescape-mgmt` header — reusing `notifyBankChanged`'s exact posting shape, including its 2 s timeout, its silence when either half of the configuration is missing, and its rule that one owner's failure never drops the rest.

In `engine-custom/src/idlescape/management.ts`, call `registerBattlebotsRoutes(app, { managementSecret, findPlayer: n => World.getPlayerByUsername(n), publicEntry: false })` beside the existing owner-bank registration.

Add both to `engine-custom/PATCHES.md` (a new subsection under "New files (no upstream counterpart)" and a line in the "How to verify all patches are present" grep table), and record the modified files' pinned blob shas in `engine-custom/manifest.json`.

- [ ] **Step 6: Verify the drift check still passes**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/engine-overlay.ps1 -Check
```
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add engine-custom
git commit -m "feat(battlebots): post match results from the engine and expose the lobby entry route

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MERnR4A1K49VY7hZZtQEtY"
```

---

## Task 10: The front server — match store and routes

**Files:**
- Create: `server/src/battlebots/types.ts`, `store.ts`, `store.test.ts`, `routes.ts`, `routes.test.ts`, `hookContract.test.ts`, `schema.sql`
- Modify: `server/src/router.ts`, `server/src/router.test.ts`, `server/src/index.ts`, `server/.env.example`, `README.md`

**Interfaces:**
- Consumes: `BattlebotsRow` (by wire shape) from Task 9; `CharacterStore` and the `gameNames/{name}` index from `server/src/characters/store.ts`; `managementClient` from `server/src/engine/managementClient.ts`.
- Produces: `createBattlebotsStore(path): BattlebotsStore` with `recordRow(row): void`, `matchesFor(characterId, limit): MatchRecord[]`, `matchById(id): MatchRecord | null`; the routes below.

| Route | Principal | Body / query | 200 |
| --- | --- | --- | --- |
| `POST /internal/battlebots-result` | management secret + loopback/private source | `BattlebotsRow` | `{ ok: true }` |
| `POST /api/battlebots/enter` | human | - | `{ ok: true }` |
| `GET /api/battlebots/history` | human | `?characterId=&limit=` | `{ matches: MatchRecord[] }` |
| `GET /api/battlebots/match/:id` | human | - | `MatchRecord` |

`schema.sql`, applied at boot behind a `schema_version` table exactly as SP3's design specifies for the tracker db:

```sql
CREATE TABLE IF NOT EXISTS bb_rows (
  game_name   TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  owner_key   TEXT,
  match_id    INTEGER NOT NULL,
  mode        TEXT NOT NULL,
  outcome     TEXT NOT NULL,
  ticks       INTEGER NOT NULL,
  dmg_dealt   INTEGER NOT NULL,
  dmg_taken   INTEGER NOT NULL,
  hp_left     INTEGER NOT NULL,
  recorded_at INTEGER NOT NULL,
  PRIMARY KEY (game_name, seq)
);
CREATE INDEX IF NOT EXISTS bb_rows_match ON bb_rows (match_id);
CREATE INDEX IF NOT EXISTS bb_rows_recent ON bb_rows (game_name, recorded_at DESC);
```

The primary key is what makes the hook idempotent: the engine may re-post a row after a hiccup and `INSERT OR IGNORE` leaves the store unchanged. A match is the pair of rows sharing a `match_id`; a practice match is a single row with `match_id = 0`.

- [ ] **Step 1: Write the failing store test**

```ts
// server/src/battlebots/store.test.ts
import { describe, expect, test } from 'bun:test';
import { createBattlebotsStore } from './store';

const row = (over = {}) => ({
  ownerKey: 'uid-1', gameName: 'alpha', seq: 1, matchId: 7, mode: 'ranked',
  outcome: 'win', ticks: 143, damageDealt: 61, damageTaken: 40, hpRemaining: 22, ...over
});

describe('battlebots store', () => {
  test('records a row and reads it back', () => {
    const s = createBattlebotsStore(':memory:');
    s.recordRow(row());
    const found = s.matchesFor('alpha', 10);
    expect(found).toHaveLength(1);
    expect(found[0].sides[0].outcome).toBe('win');
  });

  test('replaying the same (gameName, seq) changes nothing', () => {
    const s = createBattlebotsStore(':memory:');
    s.recordRow(row());
    s.recordRow(row({ outcome: 'loss' }));
    const found = s.matchesFor('alpha', 10);
    expect(found).toHaveLength(1);
    expect(found[0].sides[0].outcome).toBe('win');
  });

  test('two rows sharing a matchId join into one match with both sides', () => {
    const s = createBattlebotsStore(':memory:');
    s.recordRow(row());
    s.recordRow(row({ gameName: 'beta', ownerKey: 'uid-2', outcome: 'loss', hpRemaining: 0 }));
    const m = s.matchById(7)!;
    expect(m.sides.map(x => x.gameName).sort()).toEqual(['alpha', 'beta']);
  });

  test('a practice row stands alone', () => {
    const s = createBattlebotsStore(':memory:');
    s.recordRow(row({ mode: 'practice', matchId: 0 }));
    expect(s.matchesFor('alpha', 10)[0].sides).toHaveLength(1);
  });

  test('history is newest first and respects the limit', () => {
    let clock = 1000;
    const s = createBattlebotsStore(':memory:', () => ++clock);
    for (let i = 1; i <= 5; i++) s.recordRow(row({ seq: i, matchId: i }));
    const found = s.matchesFor('alpha', 3);
    expect(found).toHaveLength(3);
    expect(found[0].sides[0].seq).toBe(5);
  });
});
```

The `now` stub is why this test is deterministic: `recorded_at` is the ordering key and five real `Date.now()` calls in a tight loop return the same millisecond.

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd server && bun test src/battlebots/store.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `types.ts`, `schema.sql` and `store.ts`**

```ts
// server/src/battlebots/types.ts
export type BattlebotsMode = 'practice' | 'challenge' | 'ranked' | 'unknown';
export type BattlebotsOutcome = 'none' | 'win' | 'loss' | 'draw' | 'abort' | 'unknown';

/** The wire shape the engine overlay posts. Pinned from both sides by hookContract.test.ts. */
export interface BattlebotsRow {
  ownerKey: string | null;
  gameName: string;
  seq: number;
  matchId: number;
  mode: BattlebotsMode;
  outcome: BattlebotsOutcome;
  ticks: number;
  damageDealt: number;
  damageTaken: number;
  hpRemaining: number;
}

export interface MatchSide extends BattlebotsRow { recordedAt: number }

/** One match: two sides for a ranked or challenge match, one for practice (matchId 0). */
export interface MatchRecord {
  matchId: number;
  mode: BattlebotsMode;
  recordedAt: number;
  sides: MatchSide[];
}

export interface BattlebotsStore {
  recordRow(row: BattlebotsRow): void;
  matchesFor(gameName: string, limit: number): MatchRecord[];
  matchById(matchId: number): MatchRecord | null;
}
```

```ts
// server/src/battlebots/store.ts
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BattlebotsRow, BattlebotsStore, MatchRecord, MatchSide } from './types';

const SCHEMA_VERSION = 1;

/** A stored row, back in the shape the api hands out. */
function toSide(r: Record<string, unknown>): MatchSide {
  return {
    ownerKey: (r.owner_key as string) ?? null, gameName: r.game_name as string,
    seq: r.seq as number, matchId: r.match_id as number,
    mode: r.mode as MatchSide['mode'], outcome: r.outcome as MatchSide['outcome'],
    ticks: r.ticks as number, damageDealt: r.dmg_dealt as number,
    damageTaken: r.dmg_taken as number, hpRemaining: r.hp_left as number,
    recordedAt: r.recorded_at as number
  };
}

export function createBattlebotsStore(path: string, now: () => number = Date.now): BattlebotsStore {
  const db = new Database(path);
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const current = (db.query('SELECT version FROM schema_version').get() as { version: number } | null)?.version ?? 0;
  if (current < SCHEMA_VERSION) {
    db.exec(readFileSync(join(import.meta.dir, 'schema.sql'), 'utf8'));
    db.exec('DELETE FROM schema_version');
    db.query('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
  }

  // INSERT OR IGNORE against the (game_name, seq) primary key is the whole of the idempotency
  // the spec's "replaying the same MatchId leaves the score unchanged" asks for. The engine may
  // re-post a row after a hiccup; the second insert is a no-op rather than a second match.
  const insert = db.query(
    `INSERT OR IGNORE INTO bb_rows
       (game_name, seq, owner_key, match_id, mode, outcome, ticks, dmg_dealt, dmg_taken, hp_left, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const recent = db.query('SELECT * FROM bb_rows WHERE game_name = ? ORDER BY recorded_at DESC, seq DESC LIMIT ?');
  const byMatch = db.query('SELECT * FROM bb_rows WHERE match_id = ? AND match_id != 0 ORDER BY game_name');

  /** A practice row (matchId 0) stands alone; anything else joins its partner on match_id. */
  const assemble = (anchor: MatchSide): MatchRecord => ({
    matchId: anchor.matchId,
    mode: anchor.mode,
    recordedAt: anchor.recordedAt,
    sides: anchor.matchId === 0
      ? [anchor]
      : (byMatch.all(anchor.matchId) as Record<string, unknown>[]).map(toSide)
  });

  return {
    recordRow(row) {
      insert.run(row.gameName, row.seq, row.ownerKey, row.matchId, row.mode, row.outcome,
        row.ticks, row.damageDealt, row.damageTaken, row.hpRemaining, now());
    },
    matchesFor(gameName, limit) {
      return (recent.all(gameName, limit) as Record<string, unknown>[]).map(r => assemble(toSide(r)));
    },
    matchById(matchId) {
      const sides = (byMatch.all(matchId) as Record<string, unknown>[]).map(toSide);
      if (!sides.length) return null;
      return { matchId, mode: sides[0].mode, recordedAt: sides[0].recordedAt, sides };
    }
  };
}
```

`oneRow` is unused by the three methods as written; drop it rather than leave a dead query. The `now` injection is what lets `history is newest first` in the test be deterministic — pass an incrementing stub there.

- [ ] **Step 4: Confirm the store tests pass**

Run: `cd server && bun test src/battlebots/store.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the hook contract test, then the routes**

`hookContract.test.ts` must build the request **exactly as `engine-custom/src/idlescape/battlebots.ts` builds it** — same URL suffix, same header name, same body shape, the management secret — and put it through the real handler, plus a wrong-secret 401 and a non-private source rejection. `server/src/bank/hookContract.test.ts` is the model, and PATCHES.md records why it exists: before it, both halves passed against their own fakes while disagreeing with each other.

`routes.ts` then implements the four routes. `POST /api/battlebots/enter` resolves the caller's active character to its `gameName` and calls the engine management route from Task 9 through `managementClient`, mapping 403 `not_public` to a 403 with a message the panel can show. `GET` routes are human-only, like `/api/bank`.

Add to `server/src/router.ts`:
```ts
| { kind: 'battlebots'; sub: 'enter' | 'history' | 'match'; id?: string }
| { kind: 'battlebotsHook' }
```
and in `classify`:
```ts
if (pathname === '/internal/battlebots-result') return { kind: 'battlebotsHook' };
if (pathname === '/api/battlebots/enter') return { kind: 'battlebots', sub: 'enter' };
if (pathname === '/api/battlebots/history') return { kind: 'battlebots', sub: 'history' };
const bbMatch = pathname.match(/^\/api\/battlebots\/match\/(\d+)$/);
if (bbMatch) return { kind: 'battlebots', sub: 'match', id: bbMatch[1] };
```
and in `principalRule`: `case 'battlebots': return 'human'; case 'battlebotsHook': return 'none';`. Add the matching cases to `server/src/router.test.ts`.

- [ ] **Step 6: Run the server suite**

Run: `cd server && bun test`
Expected: PASS, including the new store, routes, hook contract and router cases.

- [ ] **Step 7: Document and commit**

Add `BATTLEBOTS_DB` (default `server/data/battlebots.db`) to `server/.env.example` and a Battlebots paragraph to `README.md` naming the four routes, the engine hook, and the fact that `ENGINE_MANAGEMENT_SECRET` now also authenticates the match hook and the enter route.

```bash
git add server README.md
git commit -m "feat(battlebots): match store, result hook and the api routes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MERnR4A1K49VY7hZZtQEtY"
```

---

## Task 11: The four archetype scripts

**Files:**
- Create: `web/src/tasks/library/battlebots/combatHelpers.ts`
- Create: `web/src/tasks/library/battlebots/{passive,aggressive,outlast,assassin}.ts`
- Create: `web/src/tasks/library/battlebots/archetypes.test.ts`
- Modify: `web/src/tasks/library/index.ts`

**Interfaces:**
- Consumes: `defineScript`, `Script`, `Task`, `ScriptContext` from `web/src/tasks`; `c.bot.attackPlayer`, `c.bot.eatFood`, `c.bot.activatePrayer`, `c.bot.walkTo`, `state().nearbyPlayers`, `state().player.hp/maxHp`, `state().prayers`.
- Produces: four `Script`s registered in `LIBRARY`, and their `?raw` sources registered in `SOURCES` so Fork works on them. `librarySource.test.ts` already compiles every seed, so the helpers must also be inlined into `HELPERS` in `index.ts` the way `loopHelpers.ts` is.

These are ordinary library scripts (R7). They are also the regression fixtures the spec asks for, and the worked examples a player forks.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/tasks/library/battlebots/archetypes.test.ts
import { describe, expect, test } from 'vitest';
import aggressive from './aggressive';
import assassin from './assassin';
import outlast from './outlast';
import passive from './passive';
import { LIBRARY, librarySource } from '../index';
import { compileUserScript } from '../../defineScript';
import type { WorldState } from '../../../agent/types';

const ARCHETYPES = [passive, aggressive, outlast, assassin];

function world(hp: number, maxHp = 40, foeDistance = 1): WorldState {
  return {
    player: { hp, maxHp, combat: { inCombat: true, targetIndex: 3, targetType: 'player', lastDamageTick: 1 } },
    inventory: [{ id: 379, name: 'Lobster', count: 5, slot: 0 }],
    nearbyPlayers: [{ kind: 'player', index: 3, name: 'foe', combatLevel: 60, x: 4546, z: 4485, distance: foeDistance }],
    prayers: { activePrayers: new Array(15).fill(false), prayerPoints: 43, prayerLevel: 43 }
  } as unknown as WorldState;
}

describe('battlebots archetypes', () => {
  test('all four are in the library with battlebots tags', () => {
    for (const a of ARCHETYPES) {
      expect(LIBRARY.some(s => s.id === a.id)).toBe(true);
      expect(a.tags).toContain('battlebots');
    }
  });

  test('every archetype fork seed compiles', () => {
    for (const a of ARCHETYPES) {
      const src = librarySource(a.id);
      expect(src).not.toBeNull();
      expect(compileUserScript(src!).ok).toBe(true);
    }
  });

  test('each archetype eats at its own documented threshold and not above it', () => {
    const thresholds: [typeof passive, number][] = [[passive, 0.70], [aggressive, 0.35], [outlast, 0.75], [assassin, 0.50]];
    for (const [script, frac] of thresholds) {
      const eat = script.tasks.find(t => t.name === 'eat')!;
      const ctx = { params: {}, state: () => world(1) } as never;
      expect(eat.when(world(Math.floor(40 * frac) - 1), ctx)).toBe(true);
      expect(eat.when(world(Math.floor(40 * frac) + 2), ctx)).toBe(false);
    }
  });

  test('passive never chases: its attack task is false when the foe is not adjacent', () => {
    const attack = passive.tasks.find(t => t.name === 'attack')!;
    const ctx = { params: {}, state: () => world(40) } as never;
    expect(attack.when(world(40, 40, 1), ctx)).toBe(true);
    expect(attack.when(world(40, 40, 6), ctx)).toBe(false);
  });

  test('aggressive closes distance instead of idling', () => {
    const close = aggressive.tasks.find(t => t.name === 'close')!;
    const ctx = { params: {}, state: () => world(40, 40, 8) } as never;
    expect(close.when(world(40, 40, 8), ctx)).toBe(true);
  });

  test('assassin holds off until the foe is under its burst threshold', () => {
    const burst = assassin.tasks.find(t => t.name === 'burst')!;
    const ctx = { params: { burstBelow: 40 }, state: () => world(40) } as never;
    expect(burst.when(world(40), ctx)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd web && npx vitest run src/tasks/library/battlebots`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write `combatHelpers.ts`**

```ts
// web/src/tasks/library/battlebots/combatHelpers.ts
// Shared predicates for the four archetypes. Kept tiny and dependency-free, because every one
// of these has to survive being inlined into a fork seed as plain JavaScript (see the HELPERS
// block in ../index.ts, and librarySource.test.ts which pins the two against each other).
import type { WorldState } from '../../../agent/types';
import type { NearbyPlayer } from '../../types';

/** The opponent: the one other player in the plot. Null before the match starts. */
export const foe = (s: WorldState): NearbyPlayer | null => (s.nearbyPlayers ?? [])[0] ?? null;

export const hpFraction = (s: WorldState): number => {
  const p = s.player;
  return p && p.maxHp > 0 ? p.hp / p.maxHp : 1;
};

export const food = (s: WorldState) =>
  (s.inventory ?? []).find(i => /lobster|shark|swordfish|trout|salmon/i.test(i.name ?? '')) ?? null;

export const prayerPoints = (s: WorldState): number => s.prayers?.prayerPoints ?? 0;

/** An eat task at a fixed fraction. Every archetype has one; only the threshold differs. */
export function eatTask(below: number) {
  return {
    name: 'eat',
    when: (s: WorldState) => hpFraction(s) < below && food(s) !== null,
    async run(c: { state(): WorldState; bot: { eatFood(i: unknown): Promise<unknown> }; status(t: string): void }) {
      const item = food(c.state());
      if (!item) return;
      c.status('Eating');
      await c.bot.eatFood(item);
    }
  };
}

/** Protect-from-melee is prayer index 10 in PRAYER_NAMES; it is the only switch worth making. */
export const PROTECT_MELEE = 10;
```

- [ ] **Step 4: Write the four archetypes**

Each is a `defineScript` with `tags: ['battlebots', 'combat']`, `hardStop: undefined` (the arena is safe, so a low-hp hard stop would forfeit for no reason), `health: { onDeath: 'fail', onStuck: 'stop' }` (a death ends the run because the match is over), and tasks evaluated top-down, first match wins — which is exactly how the runner already evaluates `tasks`.

```ts
// web/src/tasks/library/battlebots/outlast.ts
import { defineScript } from '../../defineScript';
import { PROTECT_MELEE, eatTask, foe, hpFraction, prayerPoints } from './combatHelpers';

export default defineScript({
  id: 'bb-outlast', name: 'Battlebots: Outlast', version: 1, order: 63,
  tags: ['battlebots', 'combat'], author: 'idlescape',
  description: 'Attrition. Kites to break the opponent attack cycle, eats early, conserves prayer, and plays for the timeout tie-break on remaining HP.',
  params: {
    eatBelow: { type: 'number', label: 'Eat below (% of max HP)', default: 75, min: 10, max: 95 },
    kiteWithin: { type: 'number', label: 'Retreat when the opponent is within', default: 2, min: 1, max: 5 }
  },
  health: { onDeath: 'fail', onStuck: 'stop' },
  stuckAfterMs: 20_000,
  tasks: [
    eatTask(0.75),
    {
      name: 'pray',
      when: s => prayerPoints(s) > 5 && s.prayers?.activePrayers[PROTECT_MELEE] !== true,
      async run(c) { await c.bot.activatePrayer(PROTECT_MELEE); }
    },
    {
      name: 'kite',
      when: (s, c) => { const f = foe(s); return f !== null && f.distance <= Number(c.params.kiteWithin); },
      async run(c) {
        const s = c.state(); const f = foe(s); const me = s.player;
        if (!f || !me) return;
        // Step directly away, clamped into the 22x22 fighting floor by the arena's own walls:
        // walking into a blocked border tile is refused by the engine, so no bounds maths here.
        c.status('Kiting');
        await c.bot.walkTo(me.x + Math.sign(me.x - f.x) * 3, me.z + Math.sign(me.z - f.z) * 3, 0);
      }
    },
    {
      name: 'attack',
      when: s => foe(s) !== null,
      timeoutMs: 8_000,
      async run(c) { const f = foe(c.state()); if (f) { c.status('Attacking'); await c.bot.attackPlayer(f); } }
    }
  ],
  until: s => hpFraction(s) === 0
});
```

```ts
// web/src/tasks/library/battlebots/passive.ts
import { defineScript } from '../../defineScript';
import { PROTECT_MELEE, eatTask, foe, hpFraction, prayerPoints } from './combatHelpers';

export default defineScript({
  id: 'bb-passive', name: 'Battlebots: Passive', version: 1, order: 61,
  tags: ['battlebots', 'combat'], author: 'idlescape',
  description: 'Defensive baseline. Protect prayer up, eats early, holds position, and attacks only while the opponent is adjacent and committed. Never chases, so it punishes an opponent that overextends and loses to one that does not.',
  params: { eatBelow: { type: 'number', label: 'Eat below (% of max HP)', default: 70, min: 10, max: 95 } },
  health: { onDeath: 'fail', onStuck: 'stop' },
  stuckAfterMs: 20_000,
  tasks: [
    eatTask(0.70),
    {
      name: 'pray',
      when: s => prayerPoints(s) > 0 && s.prayers?.activePrayers[PROTECT_MELEE] !== true,
      async run(c) { await c.bot.activatePrayer(PROTECT_MELEE); }
    },
    {
      // The whole archetype is in this predicate: adjacent only, so it never takes a step
      // towards the opponent and never gives up its ground.
      name: 'attack',
      when: s => { const f = foe(s); return f !== null && f.distance <= 1; },
      timeoutMs: 8_000,
      async run(c) { const f = foe(c.state()); if (f) { c.status('Holding'); await c.bot.attackPlayer(f); } }
    }
  ],
  until: s => hpFraction(s) === 0
});
```

```ts
// web/src/tasks/library/battlebots/aggressive.ts
import { defineScript } from '../../defineScript';
import { eatTask, foe, hpFraction } from './combatHelpers';

export default defineScript({
  id: 'bb-aggressive', name: 'Battlebots: Aggressive', version: 1, order: 62,
  tags: ['battlebots', 'combat'], author: 'idlescape',
  description: 'Maximum uptime. Closes distance, attacks every tick it can, eats only when nearly dead, and never switches prayer. Beats anything that hesitates and loses to anything that outlasts it.',
  params: { eatBelow: { type: 'number', label: 'Eat below (% of max HP)', default: 35, min: 5, max: 95 } },
  health: { onDeath: 'fail', onStuck: 'stop' },
  stuckAfterMs: 20_000,
  tasks: [
    eatTask(0.35),
    {
      name: 'close',
      when: s => { const f = foe(s); return f !== null && f.distance > 1; },
      async run(c) { const f = foe(c.state()); if (f) { c.status('Closing'); await c.bot.walkTo(f.x, f.z, 1); } }
    },
    {
      name: 'attack',
      when: s => foe(s) !== null,
      timeoutMs: 8_000,
      async run(c) { const f = foe(c.state()); if (f) { c.status('Attacking'); await c.bot.attackPlayer(f); } }
    }
  ],
  until: s => hpFraction(s) === 0
});
```

```ts
// web/src/tasks/library/battlebots/assassin.ts
import { defineScript } from '../../defineScript';
import { damageDealtSoFar, eatTask, foe, hpFraction } from './combatHelpers';

export default defineScript({
  id: 'bb-assassin', name: 'Battlebots: Assassin', version: 1, order: 64,
  tags: ['battlebots', 'combat'], author: 'idlescape',
  description: 'Burst windows. Disengages until it has worn the opponent down, then commits everything. Note: revision 274 never tells your client another player’s hitpoints, so this opens its window on the damage it has landed rather than on the opponent’s HP bar. That is a real limitation of the game, not of the script.',
  params: {
    openAfterDamage: { type: 'number', label: 'Commit after landing this much damage', default: 25, min: 5, max: 90 },
    eatBelow: { type: 'number', label: 'Eat below (% of max HP)', default: 50, min: 10, max: 95 }
  },
  health: { onDeath: 'fail', onStuck: 'stop' },
  stuckAfterMs: 20_000,
  tasks: [
    eatTask(0.50),
    {
      name: 'burst',
      when: (s, c) => foe(s) !== null && damageDealtSoFar(s) >= Number(c.params.openAfterDamage),
      timeoutMs: 8_000,
      async run(c) { const f = foe(c.state()); if (f) { c.status('Committing'); await c.bot.attackPlayer(f); } }
    },
    {
      // Chip damage from range of one, then step back out. Cheap, and it is what builds the
      // damage total the burst task waits on.
      name: 'probe',
      when: s => { const f = foe(s); return f !== null && f.distance <= 1; },
      timeoutMs: 6_000,
      async run(c) {
        const s = c.state(); const f = foe(s); const me = s.player;
        if (!f || !me) return;
        c.status('Probing');
        await c.bot.attackPlayer(f);
        await c.bot.walkTo(me.x + Math.sign(me.x - f.x) * 2, me.z + Math.sign(me.z - f.z) * 2, 0);
      }
    },
    {
      name: 'disengage',
      when: s => foe(s) !== null,
      async run(c) {
        const s = c.state(); const f = foe(s); const me = s.player;
        if (!f || !me) return;
        c.status('Waiting for a window');
        await c.bot.walkTo(me.x + Math.sign(me.x - f.x) * 3, me.z + Math.sign(me.z - f.z) * 3, 0);
      }
    }
  ],
  until: s => hpFraction(s) === 0
});
```

`damageDealtSoFar` is the one extra helper Assassin needs; add it to `combatHelpers.ts` beside the others:

```ts
/**
 * Damage this character has landed since the run started, summed from the client's own combat
 * event stream. Revision 274 does not transmit another player's hitpoints, so this is the only
 * honest proxy for "how hurt is my opponent" a script can have.
 */
export const damageDealtSoFar = (s: WorldState): number =>
  (s.combatEvents ?? [])
    .filter(e => e.type === 'damage_dealt')
    .reduce((n, e) => n + e.damage, 0);
```

`CombatEvent` is `{ tick, type: 'damage_taken' | 'damage_dealt' | 'kill', damage, sourceType, sourceIndex, targetType, targetIndex }` (`web/src/vendor/rs-sdk/sdk/types.ts:470`), so the filter and the field name are both exact.

**Record in the task report:** the spec's Assassin holds until the opponent is under an HP threshold. Revision 274 never sends another player's hitpoints to the client, so that threshold cannot be read. The archetype opens its window on accumulated damage dealt instead. This is a real reduction in what Assassin can express, and it is stated in the script's own `description` where a player will read it rather than buried in a comment.

- [ ] **Step 5: Register them**

In `web/src/tasks/library/index.ts`: import the four modules and their `?raw` sources, add them to `LIBRARY` and `SOURCES`, and append the JavaScript forms of `foe`, `hpFraction`, `food`, `prayerPoints`, `eatTask` and `PROTECT_MELEE` to the `HELPERS` string. `librarySource.test.ts` will fail if the two drift.

- [ ] **Step 6: Run the web suite**

Run: `cd web && npx tsc --noEmit && npx vitest run`
Expected: PASS, including `librarySource.test.ts` and the new archetype tests.

- [ ] **Step 7: Commit**

```bash
git add web/src/tasks/library
git commit -m "feat(battlebots): four archetype scripts in the task library

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MERnR4A1K49VY7hZZtQEtY"
```

---

## Task 12: The Battlebots panel

**Files:**
- Create: `web/src/plugins/builtin/battlebots.ts`, `battlebots.test.ts`
- Modify: `web/src/plugins/registry.ts` (register the plugin), `web/src/partials/frame.html` (a strip button)

**Interfaces:**
- Consumes: `GET /api/battlebots/history`, `POST /api/battlebots/enter` from Task 10; `window.idlescape.tasks` for starting an archetype.
- Produces: a panel with three sections: **Enter** (one button, plus the honest note from R5 that a ranked match needs both players online), **Bot** (pick one of the four archetypes or a saved fork, then Start — it just calls the existing tasks api), and **History** (the last 25 matches with mode badge, outcome, opponent, duration and damage).

Before writing any markup, load the `idlescape-design` skill: it owns the tokens and the component library every panel composes from, and the panel must match `bank.ts` and `tasks.ts` rather than invent its own look.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/plugins/builtin/battlebots.test.ts
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { battlebotsPanel } from './battlebots';

describe('battlebots panel', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="body"></div>'; });

  test('renders the three sections', async () => {
    const fetchStub = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ matches: [] }) });
    await battlebotsPanel({ fetch: fetchStub as never }).mount(document.getElementById('body')!);
    expect(document.querySelector('[data-bb="enter"]')).not.toBeNull();
    expect(document.querySelector('[data-bb="bot"]')).not.toBeNull();
    expect(document.querySelector('[data-bb="history"]')).not.toBeNull();
  });

  test('says plainly that a ranked match needs both players online', async () => {
    const fetchStub = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ matches: [] }) });
    await battlebotsPanel({ fetch: fetchStub as never }).mount(document.getElementById('body')!);
    expect(document.body.textContent).toMatch(/both players.*online/i);
  });

  test('a 403 not_public from enter is shown, not swallowed', async () => {
    const fetchStub = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ matches: [] }) })
      .mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: 'not_public' }) });
    await battlebotsPanel({ fetch: fetchStub as never }).mount(document.getElementById('body')!);
    (document.querySelector('[data-bb="enter"] button') as HTMLButtonElement).click();
    await new Promise(r => setTimeout(r, 0));
    expect(document.body.textContent).toMatch(/not open yet/i);
  });

  test('history badges untracked modes', async () => {
    const matches = [{ matchId: 0, mode: 'practice', recordedAt: 1, sides: [{ gameName: 'me', outcome: 'win', ticks: 40, damageDealt: 10, damageTaken: 2, hpRemaining: 30 }] }];
    const fetchStub = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ matches }) });
    await battlebotsPanel({ fetch: fetchStub as never }).mount(document.getElementById('body')!);
    expect(document.querySelector('[data-bb="history"]')!.textContent).toMatch(/practice/i);
    expect(document.querySelector('[data-bb="history"]')!.textContent).toMatch(/untracked/i);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd web && npx vitest run src/plugins/builtin/battlebots.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the panel, register it, add the strip button**

Follow `web/src/plugins/builtin/bank.ts` for the plugin shape and `tasks.ts` for how a panel reads `window.idlescape.tasks`. Add `<button class="strip-btn" data-panel="battlebots" title="Battlebots">🤖</button>` to the strip in `web/src/partials/frame.html`.

- [ ] **Step 4: Run the web suite and commit**

Run: `cd web && npx tsc --noEmit && npx eslint src && npx vitest run`
Expected: PASS.

```bash
git add web/src
git commit -m "feat(battlebots): the Battlebots panel

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MERnR4A1K49VY7hZZtQEtY"
```

---

## Task 13: End-to-end and `verify.ps1`

**Files:**
- Create: `web/e2e/battlebots.pw.test.ts`
- Modify: `scripts/verify.ps1`, `README.md`

- [ ] **Step 1: Write the e2e spec**

Two browser contexts, both through the human path (`openGate`, "Create account", name a character), following `web/e2e/tasks.pw.test.ts` and `web/e2e/bank.pw.test.ts`. Cases, all asserted through `clientState(page)` and the panel DOM:

1. **Enter.** Open the Battlebots panel, click Enter, assert `clientState(page).position` is inside the lobby extent (x 4496-4527, z 4496-4527).
2. **Practice.** Start a practice match from the panel, wait for the position to move into a plot square (x or z >= 4544), assert the inventory is the kit and not the character's own, then wait for resolution and assert the original inventory is back and the position is `^bb_arrival`.
3. **History.** Assert the practice match appears in the History section with an "untracked" badge.
4. **Challenge.** Both contexts enter, page A right-clicks page B in the 3D viewport and picks Challenge, B does the same; assert both positions land in the same plot square at different tiles.
5. **Queue pad.** Page A walks onto the pad (click the pad tile via the viewport helper), assert the "Queued" chat line; walk off, assert the "left the queue" line; assert exactly one of each.
6. **No route out.** From the lobby, attempt to walk to a tile outside the border and assert the position does not leave the lobby extent.

- [ ] **Step 2: Extend `verify.ps1`**

Add, in the existing suite order:
- `bun test scripts/gen/battlebotsMap.test.ts` beside the other generator suites.
- `bun test src/idlescape/battlebots.test.ts` inside the existing `engine-custom` block.
- The content pack check as its own step: `pwsh scripts/content-overlay.ps1` then `npx tsx tools/pack/BuildOverlay.ts` in `engine/server`, failing the run on a non-zero exit. This is the guard that catches an unpinned pack id.
- `web/e2e/battlebots.pw.test.ts` in the Playwright run.

- [ ] **Step 3: Run the whole thing**

Run: `npm run verify`
Expected: green. Paste the tail of the output into the task report — the claim "verify is green" is not acceptable without it.

- [ ] **Step 4: Document and commit**

Add a Battlebots section to `README.md`: what the region is, the reserved squares with a pointer to `docs/superpowers/specs/notes/battlebots-region.md`, that entry is `POST /api/battlebots/enter` and gated on `^bb_public` until the region is meant to be found, that the match hook shares `ENGINE_MANAGEMENT_SECRET`, and that ranked hiscores wait on SP3.

```bash
git add web/e2e scripts/verify.ps1 README.md
git commit -m "test(battlebots): browser e2e for entry, practice, challenge and the queue pad

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MERnR4A1K49VY7hZZtQEtY"
```

---

## Acceptance, mapped to the spec's section 22

| Spec criterion | Where it is satisfied |
| --- | --- |
| Region loads with correct collision flags | Task 1 step 7, Task 2 step 5 |
| Pathfinding works across the lobby and within a plot | Task 2 step 5 |
| No walkable path in or out | Task 2 step 5, Task 13 case 6 |
| All N plots geometrically identical | Task 1 step 1, `every plot is byte-identical in shape` |
| Stepping on queues, stepping off dequeues | Task 8 step 2, Task 13 case 5 |
| Pad corner does not flap or double queue | Task 8 step 2 case 4 |
| Returning from a match lands off the pad | Task 5 (`p_telejump(^bb_arrival)`), Task 8 step 2 case 6 |
| Pairing respects the band; the band widens | Task 8 (`~bb_band_now`) |
| Two slots with the same owner uid never paired | Task 8 step 2 case 5 (character level), Task 10 routes (account level) |
| Changing loadout after accepting invalidates the accept | Task 7 step 3 case 3 |
| Challenge and practice never reach hiscores | Vacuous: there are no hiscores (R10). `mode` is recorded on every row so the projection can filter when SP3 lands. |
| A practice match completes with no second player | Task 6 step 2, Task 13 case 2 |
| A player on the pad cannot accept a challenge | Task 7 step 3 case 4 |
| Bot-vs-bot round robin completes without fault | **Not covered.** Needs two scripted characters driven headlessly; deferred with the SP5 runner. |
| Infinite-loop script is faulted, not hung | Already shipped: `stuckAfterMs` in the runner, `EXECUTE_TIMEOUT_MS` in the Worker |
| `fetch` / `require` / `setTimeout` / `window` fail | Already shipped: the Worker has no DOM and `compileUserScript` strips imports |
| Replay reproduces the recorded result | **Deferred** with the replay viewer |
| Hard-kill during running, restart, full restore at login | Task 3 step 4 |
| Restore idempotency | Task 3 step 4 case 6 |
| Loadout validation rejects an illegal saved loadout | Vacuous under R8's fixed kits; becomes real when free loadouts land |
| Hiscore write from a client is rejected | **Deferred** with SP3 |
| Replaying the same match id leaves the score unchanged | Task 10 step 1, `replaying the same (gameName, seq) changes nothing` |

---

## Open decisions this plan settles, and the ones it does not

Settled here, with the evidence in **Rulings**: D1 (client-side, R5/R6), D2 (fixed kits rather than owned items or a free catalogue — a narrowing of the spec's "catalogue" lean, chosen because it makes the combat-level band a real fairness signal), D3 (the existing script format, R7), D6 (N = 8), D7 (band 5, +1 per 25 ticks, ceiling 15), D8 (generator, R1), D9 (hidden, `^bb_public = false`), D10 (management route, R11), D11 (nothing in-client, R9), D12 (dequeue on logout, since D1 landed on client-side and an offline player has no script running).

Still open, deliberately: **D4** (the 500-tick clock — confirm after the first real archetype-vs-archetype match; Outlast is the one that breaks if it is wrong) and **D5** (rewards — the hook payload exists in Task 10's store, no subscriber ships).

**The name.** "BattleBots" is an active trademark and `osrs.scotho.com` is public-facing. Every identifier in this plan is `bb_*` or `battlebots`, which is cheap to rename, but the player-facing strings in Task 12's panel and Task 2's welcome message are not. Raise the rename with the owner before the region becomes discoverable, not after.
