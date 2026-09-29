# client/src/vendor/PATCHES.md — local changes to vendored rs-sdk code

Upstream: https://github.com/MaxBittker/rs-sdk at 56b73e08fc01a1d683d7a86d145a494ae945d071 (MIT).

rs-sdk is itself a fork of [LostCityRS/Client-TS](https://github.com/LostCityRS/Client-TS) 274,
so its `Client.ts` additions map onto ours by member name. `LICENSE` in `rs-sdk/` is the
upstream MIT text, unchanged.

## Client.ts bot surface (client/PATCHES.md patches 17-20)
| Upstream item | Ours | Why |
|---|---|---|
| `// === BOT SDK PUBLIC METHODS ===` block | `// === IDLESCAPE BOT SURFACE ... ===` block, minus packet logging, credentials/login, agent mode | We log through the shell trace; login is hooks patch 3; no agent UI. |
| `this.writePacketOpcode(op)` (logging wrapper) | `this.out.p1Enc(op)` | `writePacketOpcode` only existed to feed the packet log, which is not vendored. |
| `setBotClickVisual` draws a red marker | body emptied (`/* overlay removed */`), params `_`-prefixed | Overlay UI not vendored. |
| `console.log` calls in the block | commented out | Trace owns logging. |
| `static maxMessageLength` set from the constructor's `maxMessageLength` param (server `world.json` via `bot.ejs`) | `static readonly maxMessageLength: number = 80` | We do not change the 274 constructor signature; 80 is the RS wire limit. |
| `debugDialogComponents()` pushes an object literal `as any` (the declared return type omits `clientCode`) | `clientCode?: number` added to the return type, `as any` dropped | Repo convention: no new `as any` outside `vendor/`; `Client.ts` is not under `vendor/`. |
| `import type { WalkResult } from '#/bot/types.js'` | `from '#/vendor/rs-sdk/bot/types.js'` | The `bot/` module is vendored under `src/vendor/rs-sdk/`. |
| `walkTo(worldX, worldZ, running)` / `interactLoc(worldX, worldZ, locId, optionIndex)` | params renamed to `x`, `z` | The SP4a bot-surface contract names them `x`/`z`; positional callers are unaffected. |

Not ported from the rs-sdk `Client.ts` diff (39 hunks total): `LoopCycle` indirection, the custom
XP curve, camera pitch, auto-login/username validation, overlay hooks, idle timer, always-run,
transmog, tick-speed multiplier, `MESSAGE_PUBLIC` changes and debug breadcrumbs.

### 274 member names checked against the copied block
All members the block touches exist on 274 under the same names — no renames were needed:
`chatModalId`, `mainModalId`, `dialogInputOpen`, `resumedPauseButton`, `mapBuildBaseX/Z`,
`keyHeld` (on `GameShell`), `crossX/crossY/crossMode/crossCycle`, `objSelected*`, and
`tryMove(srcX, srcZ, dx, dz, tryNearest, locWidth, locLength, locAngle, locShape, forceapproach, type)`
(11 params, identical on 274 and rs-sdk). `Environment`, `NearbyPlayer` and `WordEnc` appear in
the block only inside comments, so no extra imports were added.

### ANTICHEAT_* opcodes: deliberately not emitted
274's real input paths pair many ops with a client-to-server `ANTICHEAT_OPLOGIC*` /
`ANTICHEAT_CYCLELOGIC*` packet (`src/io/ClientProt.ts`, 18 emit sites in `Client.ts`, all in
mouse/keyboard handlers). The vendored bot surface dispatches ops directly and emits **none** of
them — this is upstream rs-sdk's design (its own `Client.ts` block has zero `ANTICHEAT` hits),
and Lost City's server does not require them. Nothing to port; recorded so a future bump does
not "fix" the omission.

## bot/ module (SP4a Task 2)
Vendored files: `bot/types.ts`, `bot/StateCollector.ts`, `bot/ActionExecutor.ts`,
`bot/ActionQueue.ts`, `bot/reach.ts`, `bot/formatters.ts` and the five tests
(`ActionExecutor`, `ActionQueue`, `StateCollector`, `reach`, `ClientInteraction`), plus
`lite/movement.ts` (test-only, see below). Every file carries the header
`// Vendored from rs-sdk (MIT) 56b73e08; see client/src/vendor/PATCHES.md`; nothing else in the
six production modules was edited — they compile and pass against 274 unchanged.

| File | Change | Why |
|---|---|---|
| all 12 files | one `// Vendored from rs-sdk (MIT) 56b73e08` header line prepended | Provenance at the point of use. |
| `bot/*.ts` (production) | **no other change** | rs-sdk is a fork of Client-TS 274; every member `StateCollector` reads (38 of them, checked by name against `Client.ts` + `GameShell.ts`) and every method `ActionExecutor` calls exists on our tree with the same name and signature. `bunx tsc --noEmit` covers `ActionExecutor` (fully typed against `Client`); the 38 `StateCollector` names were diffed by hand because it reads through `as any`. |
| `bot/ClientInteraction.test.ts` | `import('../client/Client.js')` -> `import('#/client/Client.js')` | rs-sdk keeps the bot module at `src/bot/`, ours is at `src/vendor/rs-sdk/bot/`; the alias is stable under both layouts. |
| `bot/ClientInteraction.test.ts` | the fake client's `writePacketOpcode: fn` moved onto `out: { p1Enc: fn, ... }` (10 fakes) | Follows the port: our block calls `this.out.p1Enc(op)` where upstream called `this.writePacketOpcode(op)` (row 2 above). Bodies are unchanged, so the assertions still check the same opcodes. |
| `lite/movement.ts` | vendored **only** so `bot/reach.test.ts` can run | `reach.test.ts` is a differential test: it fuzzes `ReachProbe` against the router it predicts, and `ReachProbe`'s answer is stamped onto every published npc/loc/ground item as `reachable`. The router it compares against is rs-sdk's `lite/movement.ts` (a standalone port of `Client.tryMove`); our `Client.tryMove` is a method needing a whole `Client`, so the test cannot use it. The file is imported by the test only — the production path routes through `Client.tryMove` as before. |
| `lite/movement.ts` | `import type { LiteClient } from './LiteClient.js'` -> a local `export interface MovementClient` with the eight members `route()` touches (`ensureCollision`, `collision`, `minusedlevel`, `localPlayer.routeX/routeZ`, `out.p1/p2/p1Enc`, `mapBuildBaseX/Z`, `minimapFlagX/Z`) | rs-sdk's headless `LiteClient` is not vendored. Type-only change; the body is byte-identical to upstream. |

### `StateCollector` reads `Client` privates (`messageTick`, `messageSequence`, ...)
`StateCollector.collectState()` opens with `const c = this.client as any; // Access private
members` and reads 38 members that way, including the patch-18 fields `messageTick` and
`messageSequence` (`StateCollector.ts` ~line 1315). Those are `private` on our `Client`, which
is a compile-time-only marker in TypeScript, so the reads work unchanged: no public getters were
added and the collector was not adapted. This is the one `as any` the repo's rule exempts
(`src/vendor/` only) — `Client.ts` itself gained no `as any`. `dialogHistory` is *not* among
them: `collectRecentDialogs()` goes through the public `getDialogHistory()` the block already
exports, which `tsc` type-checks.

### `client.collision` / `ensureCollision()`: nothing to add
`ReachProbe`'s `ReachClientView` wants `collision`, `minusedlevel`, `localPlayer`, and
optionally `ensureCollision?()` and `locSceneInfo?()`. 274 already names the field
`private collision: (CollisionMap | null)[]` (not `levelCollisionMap`) and already has
`private locSceneInfo(...)`; `ensureCollision()` is Lite-only and optional. So the bot surface
block (patch 17) needed **no** `collision` / `ensureCollision` accessors after all.

## How to verify this record

Run `powershell -File scripts/patches-check.ps1` from the repository root; `scripts/verify.ps1`
runs it on every gate, so this block is a gate rather than a checklist. The rows are data, not
shell: `<tag> | <mode> | <expected> | <file> | <literal>`, split on the first four pipes, with
paths relative to `client/src/vendor`. The pin row is `startswith` rather than `contains` because
the row itself carries the sha: a `contains` count would count the row as well as the provenance
line it is asserting, and would have to expect 2.

```patches-check
root: client/src/vendor
rs-sdk pin | startswith | 1 | PATCHES.md | Upstream: https://github.com/MaxBittker/rs-sdk at 56b73e08fc01a1d683d7a86d145a494ae945d071 (MIT).
rs-sdk licence | contains | 1 | rs-sdk/LICENSE | MIT License
rs-sdk no-anticheat | contains | 0 | rs-sdk/bot/ActionExecutor.ts | ANTICHEAT
```

The runner also cross-checks that sha against `scripts/upstream.lock`'s `rs-sdk` row, so the lock
and the two vendor records cannot drift apart: bumping the lock alone fails the cross-check, and
bumping the row's literal alone fails the pin row against the line above.

**What this does not cover.** The eight files `web/src/vendor/PATCHES.md` lists as "provenance
header only" carry no per-file pin, so nothing here proves they are still upstream's bytes.
Closing that wants a sha per file and is not entry 3's work.
