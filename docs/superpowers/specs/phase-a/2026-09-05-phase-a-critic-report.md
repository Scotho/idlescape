# Phase A — critic report: verification, contradictions, gaps

Date: 2026-09-05. Read-only adversarial pass over the four Phase A findings files. Every verdict was
re-read in the working tree at HEAD `e376848` (the four files were written against `10838e2`; one
commit landed in between and changes two of their claims). "CONFIRMED" = I read the cited code and it
says what the file says; "REFUTED" = the code or config contradicts it; "UNVERIFIED" = not checkable
by reading.

## Summary

1. The multi-session file's core verdict holds: draw is one separable call, the loop is
   `setTimeout`-driven, canvas and game state are module/static singletons, so iframe-per-character
   with a `mainredraw()` guard is sound. 16 of 19 checked claims are CONFIRMED.
2. Two claims are REFUTED. (a) "A hidden character is logged out ~90 s after backgrounding": our
   `world.json` sets `node.debug: true`, which makes the engine's `IdleTimerHandler` a no-op, so
   nothing logs the character out today (it would in production config). (b) "`ClientState` has no
   position": commit `e376848` added `position`, `activeTab`, `sceneReady` to the hook state.
3. One cross-file contradiction is real: the engine/bank file describes an MCP gateway and a
   `mode` field on `agentTokens` as existing; the agent file (correct) shows neither is built.
4. Bank persistence (`.sav` only) and hiscore writing (only `LoginServer.updateHiscores`, inactive
   in single-world mode) are stated consistently across files and verified.
5. Biggest unflagged gap for handoff decision 13: the login packet's username/password block is
   RSA-encrypted by the client and decrypted inside the engine (`World.ts:2177`), so the
   front-server relay cannot "bind the socket to an owned character by inspecting the login
   packet" as the engine file recommends, without holding the private key or patching the engine.

## 1. Multi-session file — verdict-by-verdict

| # | Claim (file section) | Verdict | Evidence |
|---|---|---|---|
| 1 | `run()` sleeps via `setTimeout`, runs `mainloop()` in an inner loop, then one `mainredraw()`; no rAF (F1) | CONFIRMED | `client/src/client/GameShell.ts:183` `await sleep(delta)`, `:185-192` inner `while (count < 256) { await this.mainloop() }`, `:203` `await this.mainredraw()`; `client/src/util/JsUtil.ts:1` `sleep` = `setTimeout`; grep `requestAnimationFrame` in `client/src` = 0 hits |
| 2 | `mainloop`/`mainredraw`/`refresh` split; nothing in draw needed by sim (F1, F4) | CONFIRMED | `Client.ts:1289-1309` `mainloop` (tick emit, `titleScreenLoop`/`gameLoop`, `onDemandLoop`); `:1311-1330` `mainredraw`; `:1332-1334` `refresh` sets `redrawFrame`; `:3979-3999` `gameDraw` repaints chrome from that flag |
| 3 | `start()/stop()` never called from `Client`, so a client is never torn down (F1) | CONFIRMED | `GameShell.ts:262-271`; grep `this.start()\|this.stop()` in `Client.ts` = 0 hits; `alreadyStarted` guard `Client.ts:860-865` |
| 4 | Canvas is a module-level singleton bound at import (F2) | CONFIRMED | `client/src/graphics/Canvas.ts:1-5`; `GameShell.ts:61-70` constructor, `:79-83` `resize`, `:88-105` handlers all use the import |
| 5 | Per-character state in statics (`IfType.list`, `World.groundX/Z`, cyclelogic counters) (F2) | CONFIRMED | `client/src/config/IfType.ts:39` `static list`; `client/src/dash3d/World.ts:113-114`; `Client.ts:11582` reads `IfType.list[INVENTORY_COM_ID]`; `:4928-4933` `Client.cyclelogic5` |
| 6 | "Iframe per character is the only cheap option" (F2) | UNVERIFIED (judgement) | Premises verified (rows 4-5, `window.location` use `Client.ts:1780`); "only" is a design conclusion, not a code fact. Reasonable. |
| 7 | 15 s no-packet -> `lostCon()` (F3) | CONFIRMED, wrong line | Actual site `Client.ts:2271-2274` (`now - this.timeoutTimer > 15_000`); file cites `:2296-2299`, which is `selectedArea` code |
| 8 | `lostCon()` logs out if `logoutTimer > 0`, else paints "Connection lost", emits `disconnect`, reconnects (F3) | CONFIRMED | `Client.ts:2565-2593` |
| 9 | OnDemand worker owns a second socket, lazily opened with 4 s backoff (F3) | CONFIRMED | `client/src/io/OnDemandWorker.ts:593-600`; engine drop at `engine/server/src/web.ts:124` |
| 10 | Client idle: 90 s -> `IDLE_TIMER` + `logoutTimer = 250`; engine `IdleTimerHandler` sets `requestIdleLogout` unless `node.debug`; "a hidden character ... is therefore logged out ~90 s ... This must be patched client-side" (F4) | **REFUTED for the current config** | Client side correct: `Client.ts:2433-2438`. Engine side correct in isolation: `engine/server/src/network/game/client/handler/IdleTimerHandler.ts:8-11`. But `engine/server/data/config/world.json` `node.debug: true` (and the default at `engine/server/src/util/Environment.ts:101` is `debug: true`), so the handler does nothing today and the character stays in. Residual client effect: while `logoutTimer > 0` (250 loop cycles, decremented `Client.ts:2123-2124`) a `lostCon()` becomes a hard `logout()` (`:2566-2568`) instead of a reconnect. The patch D in the file is needed only when `node.debug=false` (production); the file should say so, and the engine file's world.json summary (engine F1) should list `node.debug`. |
| 11 | `ANTICHEAT_CYCLELOGIC5` skipped while suspended is harmless; engine handler is a no-op (F4.2, marked inferred) | CONFIRMED | `engine/server/src/network/game/client/ClientGameProt.ts:26` opcode 100 length 0; `ClientGameProtRepository.ts` binds no anticheat decoder/handler (grep 0 hits); `engine/server/src/engine/entity/NetworkPlayer.ts:135-149` reads the bytes and skips when no decoder |
| 12 | `buildMinimenu()` lives only in the draw path (F4.1) | CONFIRMED with caveat | Draw caller `Client.ts:4949`; a second caller exists in `gameLoop` at `:2324`, but it is the item-drag release path (human pointer input), so the conclusion for hidden/agent-driven frames stands |
| 13 | `TUT_CLICKSIDE` sent from icon-redraw block (F4.3) | CONFIRMED | `Client.ts:4090-4094` |
| 14 | Engine keeps player 30 s after socket close, forces logout at 60 s (F5) | CONFIRMED | `engine/server/src/engine/World.ts:131-132`, `:739-752`; `web.ts:122-130` `NullClientSocket`; `NetworkPlayer.ts:63` `lastConnected`, `:74-75` `lastResponse` |
| 15 | Reconnect accepted only while `account.logged_in === nodeId` (`LoginServer.ts:268-310`) (F5) | CONFIRMED, wrong path for us | `LoginServer.ts:264` is the multiworld branch; `login.enabled=false` so our path is `LoginThread.ts:62-100` (no check at all) plus the in-world swap at `World.ts:825-850`. The "~30 s window" conclusion still holds because it is the in-world player, not the account row, that carries the session |
| 16 | Same account twice -> code 5 by three paths (F5) | CONFIRMED | `World.ts:809-822` (mid-logout), `:852-866` (already in world), `:1857-1861` (multiworld reply 3), `:1922-1927` |
| 17 | No per-IP/per-origin connection cap (F5) | CONFIRMED | `web.ts:87-135` has none; `World.ts:2202-2213` device rate limit is `production`-only |
| 18 | Relay is per-socket and stateless; gate cookie `SameSite=Lax` (F6) | CONFIRMED | `server/src/proxy/ws.ts:101-140` `relayHandlers`; `server/src/index.ts:55-66`; `server/src/gate.ts:74` |
| 19 | `ClientState` lacks position/activity; add `x,z,level` (F7, patch row E, OQ5) | **REFUTED at HEAD** | `e376848` "expose position, activeTab, sceneReady in hook state": `client/src/hooks/types.ts:15-20`, `Client.ts:11600-11606`, `web/src/clientTypes.ts:16-21`. Still missing: animation/target ("activity") |
| 20 | Browser timer throttling of hidden tabs at 1 Hz / 1 wake per minute (F4) | UNVERIFIED | Labelled inferred in the file; not measurable by reading. Keep as the planned measurement |
| 21 | `clientHost.loadClient()` single-flights one client per document (F1) | CONFIRMED | `web/src/clientHost.ts:7-10, 21` |

Net: the recommendation (iframe per character + `renderSuspended` guard + `refresh()` on resume) is
supported. Patch table rows A-C and E stand; row D (idle suppression) is a production-only need;
row E is half done.

## 2. Cross-file contradictions

| # | Topic | Files | Verified fact |
|---|---|---|---|
| C1 | MCP gateway and `mode` on `agentTokens` | Engine file F8: "`agentTokens/{id} = {uid, label, secretHash, mode}` (`store.ts:112-121`) ... the MCP gateway (`/mcp`) is bearer-agentToken". Agent file F1/F2: no `/mcp`, no `mode`. | Agent file is right. `server/src/pair/store.ts:43-50` `AgentTokenDoc` has no `mode`; `server/src/router.ts:3-13` has no mcp route; `/mcp` falls to `notfound` -> `gate.deny()` (`index.ts:46`, `gate.ts:77-79`); `server/package.json` deps are `firebase-admin`, `ws` only. The engine file read the SP4 spec as built code. |
| C2 | `ClientState.position` | Multi-session F7 and web-shell §3 both say absent. | Present at HEAD (`e376848`, see row 19). Both files were correct at `10838e2`; treat as stale, not wrong. Web-shell's "derive idle from event gaps" suggestion is still needed for *activity*. |
| C3 | Idle logout | Multi-session F4 says the engine logs out a backgrounded character; engine file F1 lists world.json without `node.debug`. | `node.debug: true` in `world.json` disables the engine side (row 10). Neither file noticed. |
| C4 | Bank persistence | Engine F2 (`.sav` only, no SQLite), web-shell §4 (client snapshots cannot see the bank), agent F4 ("bank ... will reach Claude through `get_state`"). | Engine and web-shell agree and are verified (`prisma/singleworld/schema.prisma` has no bank/inventory model; `Player.ts:228-253` writes invs into the sav). Agent F4 is a *future* assumption that contradicts today's `ClientState` (no bank field, `hooks/types.ts:4-20`) and the engine fact that the client only receives bank 95 while the interface is open. Agent F4 should be reworded as "if a server bank feed exists". |
| C5 | Hiscore writers | Engine F6 and web-shell §4 both say only `LoginServer.updateHiscores`. | CONFIRMED: grep `hiscore` in `engine/server/src` hits only `db/types.ts` and `server/login/LoginServer.ts` (`:18`, `:457`). No contradiction. |
| C6 | Character deletion | Agent OQ4 asks whether the engine exposes delete; engine F8 already answers "no". | CONFIRMED: no `unlink`/`rmSync` of `.sav` in `engine/server/src` (only `cache/graphics/Pix.ts:74` for cache metadata). Cross-reference, not a contradiction. |
| C7 | Login-secret binding | Engine file Implications 6.3: "the relay (`server/src/proxy/ws.ts`) ... inspect the login packet". | Not possible as written: the client RSA-encrypts uid/username/password (`Client.ts:1795-1810` `rsaenc(LOGIN_RSAN)`) and only the engine decrypts (`World.ts:2177` `rsadec(priv)`); the relay (`ws.ts:101-140`) forwards opaque bytes. See gap 13. |
| C8 | Line drift | Multi-session cites `Client.ts:2296-2299` for the 15 s check and `LoginServer.ts` for our reconnect path. | See rows 7 and 15. |

## 3. Gaps against handoff section 18 (decisions 1-13) and section 19

Status: **closed** = enough code facts exist across the four files; **open** = a code fact is
still needed; **product** = no code fact can decide it.

1. Hosting model — closed (iframe). One unread coupling: SP2b-2 puts a WebGL canvas over `#canvas`
   "kept in sync with the shell's canvasSize" (`docs/superpowers/specs/2026-09-05-sp2b-gpu-spike-findings.md:96-99`);
   with iframes the shell and the plugin are in different realms. Read that spec §77-100 and
   `web/src/frame/canvasSize.ts` before locking the iframe design.
2. Suspend/resume — closed for the loop; open on two facts: (a) what `-Prod` sets for
   `node.debug`/`node.production` (read `scripts/start-stack.ps1`, `engine/server/.env:18-20`,
   `engine/server/src/util/Environment.ts:95-110`); (b) hidden-tab throttling — a measurement, not a read.
3. AI session mapping — closed by the agent file's hybrid; no code consumes agent tokens yet
   (`store.ts:43-50`), so nothing else to read.
4. "One active accepted contract" scope — product; no contracts code exists.
5. Settlement — open. The engine file's option (a) needs: `engine/server/src/cache/config/InvType.ts`
   (scope constants and how `scope=shared` is parsed), `engine/server/src/engine/entity/PlayerLoading.ts:120-140`
   (inventory load order vs `[login]` script), `engine/server/src/engine/World.ts:795-802,1236-1243`
   (autosave/logout race window for any external `.sav` writer), and the transmit path
   `Player.ts:1491+` (`inv_transmit` listeners) for the two-characters-banking case.
6. Partial fills — product.
7. Matching — product.
8. Canonical price — open: no file looked at engine shop pricing, which is the only in-game price
   signal. Read `engine/content/scripts/shop/` (buy/sell price scripts) and the shop ops in
   `engine/server/src/engine/script/handlers/InvOps.ts`; `ObjType.cost` and the alch formula are verified.
9. Manipulation safeguards — product.
10. Account vs character data — mostly closed: varps/inventories are per character in `.sav`
    (`Player.ts:190-262`), plugin settings per uid (`web/src/plugins/settings.ts:19`), goals per uid
    (spec). Open: which `scope=perm` varps (quests, unlocks) the product wants shared; enumerate from
    `engine/content/scripts/**/*.varp` with `scope=perm`.
11. Agent autonomy on exchange — product; the agent file's `contracts: deny|confirm|auto` shape is
    adequate and consumes no existing code.
12. Switcher status — half closed: `position`, `activeTab`, `sceneReady` exist (`hooks/types.ts:15-20`).
    Open: activity/target. Read `client/src/dash3d/entity/PathingEntity.ts` (`primarySeqId`,
    `targetId`) and `Client.ts` interaction fields (`objInteract*`, `this.localPlayer.seqId`) to pick
    the fields; decide update cadence from the existing 600 ms `status-hud` poll
    (`web/src/plugins/builtin/statusHud.ts:50-55`).
13. Secure handshake — open and under-specified by all four files. Facts now known: engine ignores
    the password (`LoginThread.ts:62-100`); the username block is RSA-encrypted end-to-end
    (`Client.ts:1795-1810`, `World.ts:2177`); the relay only checks the gate cookie (`index.ts:46-66`).
    So the three viable bindings are: (i) give the front server the engine's RSA private key and
    decrypt in the relay; (ii) patch the engine login to accept a signed owner assertion (fits the
    engine file's `ownerKey` patch); (iii) accept name-only login behind the gate for now. Read
    `engine/server/src/engine/World.ts:2160-2260` (full login decode), the key source for `priv`
    (grep `LOGIN_RSAD`/`priv` in `World.ts` and `engine/server/.env`), and `client/.env*` for
    `LOGIN_RSAN` provisioning before deciding.

Section 19 items still lacking facts: "reconnect behavior" for single-world mode (row 15: what
happens when opcode 18 arrives after the 60 s eviction — read `World.ts:825-870` fall-through and
`Client.ts:2005-2012` response 15 vs 2 handling); "iframe assumptions" of SP2b-2 (gap 1); economy
"bank mutation APIs" for offline characters (gap 5); "High Alchemy values" and "item IDs" are
closed; "wiki MCP/query implementation" is closed (worktree, `501` stub).

## 4. Recommendation

- Accept the multi-session recommendation. Amend its F4: the idle-logout patch (row D) is a
  production-config requirement, not a current blocker; cite `world.json` `node.debug`. Fix the two
  line references (rows 7, 15) and mark row E half-done after `e376848`.
- Correct the engine file's F8 (no MCP gateway, no `mode`) and its 6.3 relay-inspection idea (C7);
  add `node.debug` to its world.json summary.
- Reword agent file F4's "bank reaches Claude through `get_state`" as conditional on the server bank
  feed the engine file proposes.
- Before Phase B, close gaps 5, 8 and 13 by reading the named files; they are the only decisions
  where a missing code fact (not a product choice) still blocks the domain model.
- Treat the tree as moving: a commit landed mid-audit. Re-run `git log --since` against `10838e2`
  before the Phase B specs cite line numbers.
