# SDD ledger — Idlescape Platform and Shell (SP1)

Plan: docs/superpowers/plans/2026-09-04-idlescape-platform.md ("Idlescape Platform and Shell Implementation Plan", 17 tasks). Note: the source progress file's own header names the plan `docs/superpowers/plans/2026-09-04-idlescape-platform.md` and the spec `...idlescape-platform-design.md` — those slugs do not exist in the repo. The actual files use the `idlescape-` slug (`2026-09-04-idlescape-platform.md`, `2026-09-04-idlescape-platform-design.md`); this ledger cites the real paths.

Spec: docs/superpowers/specs/2026-09-04-idlescape-platform-design.md, later revised in place by SP1b for engine rev 274 (`2026-09-05-sp1b-revision-274-design.md`).

Branch: recorded in the source as `feat/platform-shell`, with a later note that "all work is on `develop` directly (no worktree, no remote — repo is local-only per owner)". Both branches, plus the current `sprint/dragon-slayer`, contain the closing commit, so the lineage is intact either way — flagging the discrepancy rather than resolving it.

Commit range: `1a738f4` (live PoC evidence, pre-SDD) `..426029d` (SP1 close: XSS fix + gameNames rule tightening). 17 tasks, each its own fix-round cycle; final whole-branch review closed with one fix commit.

## Rulings

Pre-flight:
- Local dev ports shift so SDD work never collides with the live PoC on 8888. Why: "the live PoC must stay up on 8888 while we build." Cost if wrong: "a subagent's integration/e2e run collides with the live engine and fails to bind; fix is to re-point one env var." (Later corrected — see below.)
- live/ (the PoC) is frozen and independent of the SDD tree; Task 1 still moves lostcity/ → engine/ + client/. Why: "SDD builds the real product; the PoC is throwaway scaffolding kept only to keep the domain warm." Cost if wrong: none, live/ is git-ignored.
- Deploy tasks (16-17) are authored-only, never run by subagents, per owner directive ("only deploy once everything is complete"). Cost if wrong: none — deploy is reversible and controller-gated.

Task 1 fix: dev engine also needs NODE_PORT=43596 and WEB_MANAGEMENT_PORT=8897 shifted (live holds 43594/8898), on top of the WEB_PORT=8899 already ruled. Why: "the dev engine must run continuously beside the live instance for Tasks 5/8/14; the original port ruling missed the game and management ports." Cost if wrong: "dev engine fails to bind and self-exits; fix is another env line." Fixed in 4b56020, verified.

Port correction (2026-09-05): the original port ruling over-shifted the front server. The live PoC only occupies 8888/43594/8898 (engine); the front server never collided with anything and should use its committed default PORT=8787, not 8788. Corrected stack: front server 8787, dev engine 8899 (web) / 43596 (game) / 8897 (mgmt), emulators 9099/8080. Cost if wrong: none, 8787 was unused by live. This is what Task 14's baseURL fix (below) implements.

Task 3: fix verifyGate to compare actual Buffer byte lengths before timingSafeEqual, not JS string `.length`. Why: "the spec requires the gate to reject bad cookies with 401, not 500; the brief's code is defective and the spec is the binding authority." Cost if wrong: "minimal; it is a strictly safer comparison with a regression test." Bug was reviewer-verified as plan-mandated and attacker-triggerable (a crafted multi-byte cookie could throw RangeError → uncaught 500 on every gated route). Fixed commit c40db03.

Task 5: harden the upstream→browser WebSocket leg now, despite the brief pre-authorizing skipping it — buffer greeting frames arriving before `relayHandlers.open` assigns the live `onmessage`, via an `early: ArrayBuffer[]` drain installed synchronously at construction. Why: "correctness of every login must not depend on an unspecified scheduler behavior." Cost if wrong: "small; strictly safer, plus a regression test." Fixed commit 70628d9.

Task 6: cloud-touching steps (Firestore DB creation, service-account key, `firebase deploy`, app registration) are deferred to the deploy phase; Task 6's subagent scope is LOCAL ONLY (rules + emulator tests). Why: "none are needed for local testing... the Firebase project idlescape-osrs already exists and Auth providers... are already enabled." Cost if wrong: none for the build; four steps run at deploy time.

Task 6 fix: fix the reviewer-found Critical with the diff-based Firestore rule idiom — `update` allowed only if `!request.resource.data.diff(resource.data).affectedKeys().hasAny(['gameName','createdAt'])` — forbidding add/change/removal of server-owned fields (a full-document `setDoc` without merge had been able to strip `gameName` silently). Why: "the entire bridge/account model depends on client-immutable gameName... spec is authority." Cost if wrong: none, strictly tighter rules + tests. Folded in a displayName-on-update validation (size 1-20) in the same rule block. Fixed commit 81ce99c.

Task 6 fix: pin the firebase peer-dep mismatch (`@firebase/rules-unit-testing@4` wants `firebase@11`, brief pinned `@12`) via `firebase/.npmrc` (`legacy-peer-deps=true`), keeping the `firebase@^12` pin. Cost if wrong: trivial.

Task 8: fix the same-uid double-request race by making the account-resolution transaction's FIRST read be `tx.get(accountRef)`; if it already exists, return that pair and skip allocation (puts accountRef in the read-set so a concurrent create conflicts and the retry returns the winner's pair instead of overwriting it). Why: "Task 14 login and the whole account model require a stable, valid per-uid {gameName,secret}; the brief's code can hand back a dead secret under a plausible same-uid double-request; spec is authority." Reviewer had traced this as worse than the implementer's own flagged concern — a retried losing transaction would blindly overwrite a returned, already-in-use secret. Cost if wrong: "one extra transactional read on the account-creation path only." Fixed commit 0d9b1fd.

Task 15 fix: close the reviewer's Important finding by adding a distinct server-typecheck gate (`cd server && bun run typecheck`) to verify.ps1, so a server-only type error can't slip past `bun test` alone. Cost if wrong: negligible. Fixed commit 85b9b6c.

Batch-2 reconciliation (2026-09-05, roadmap-and-handoff docs landed mid-SDD from a parallel session, 5 docs-only commits, no source overlap): sequencing ruling — finish in-flight Task 14 on rev 225 first (it is the integration proof + SP1b's acceptance baseline), THEN entry-screen retrofit (Tasks 11/12/13 rework + new Task 13b pairing), THEN SP1b (rev 274 migration), THEN re-run Task 14 e2e on 274, THEN Tasks 15-17 on 274, THEN SP2-SP5 each with its own plan+ledger. Why: "honors roadmap sequencing while accounting for the already-committed/in-flight reality." Cost if wrong: re-sequencing only, no code lost.

Advanced-controls plugin (owner request) scoped into SP2's plugin backlog: WASD = camera rotation (clarified, not movement) = straightforward remap of existing arrow-key camera-rotate inputs; press-Enter-to-chat = straightforward client input-mode plugin; mousewheel zoom = partial, better after the GPU renderer (SP2) or as an experimental tweak. Cost if wrong: only the zoom part may need the GPU renderer to land well.

SP1 final review, fixes applied directly by the controller (fix commit 426029d):
- [SEC, Important] account.ts displayName rendered via unescaped innerHTML = stored XSS (users/{uid} is world-readable to authed users). FIX APPLIED: `escapeHtml(displayName)`, plus a regression test.
- [SEC, Minor] firestore.rules gameNames collection allowed `read: if true` (name→uid enumeration). FIX APPLIED: `read: if false`; rules.test.ts updated.
- [SEC, Minor] firestore.rules agentTokens: owner can read their own `secretHash`. DEFERRED. Why: "risk negligible (sha256 of 40-char high-entropy token); hiding one field from a doc read requires restructuring the store... not a one-liner." Carried to SP4 — see Deferred/follow-up below.
- [doc, Minor] pair/skill.md says /mcp returns 503 "gateway not deployed" but no /mcp route exists yet (401s via the gate instead). DEFERRED to when SP4's /mcp gateway lands.

Verification ruling on Fix 2 above: the Firestore emulator (java) could not stay up for the rules-test rerun (killed 3x by low memory on a machine running 6+ other projects' processes, none of which were this session's to kill). Ruling: accept Fix 2 by inspection rather than block. Justification given: the change is strictly more restrictive (`if true` → `if false`), syntactically identical to the adjacent known-valid `gameAccounts` deny-all rule, on a collection no client code reads (bridge.ts uses the admin SDK, which bypasses rules), and rules.test.ts was updated to assert the new deny. Cost if wrong: "the emulator test would fail on the assertFails line, caught before any deploy" — i.e. deploy is controller-gated so it cannot ship unverified.

Post-close: not deleting the `.superpowers/sdd/2026-09-04-idlescape-platform/` workspace (SDD convention would). Why: git-ignored scratch, free to keep; holds the deferred-followup rulings SP4 must pick up; serves as a cross-compaction recovery map for the ongoing multi-SP project. Cost if wrong: none, a stale dir in git-ignored scratch.

## Deferred / parked / carry-forward

Carried forward and resolved within SP1 itself:
- Task 9 → Tasks 10 & 14: `HookEvents` is a TYPE alias (not interface), exact 7-key shape; any mirror must match. Confirmed identical in Task 13's clientTypes.ts (reviewer-verified byte-identical mirror) and consumed correctly through Task 14.

Explicitly carried to SP4 (from the SP1 final review, not yet actioned as of this ledger):
- [SEC hardening] Move `agentTokens.secretHash` out of the client-readable doc (separate collection/subdoc) so firestore.rules can deny the owner reading the hash. Touches pair/store.ts, pair/routes.ts, firestore.rules, rules.test.ts.
- [doc] pair/skill.md /mcp 503-vs-401 wording — align once the SP4 /mcp gateway route exists.

Per-task minors deferred to "final-review triage" whose disposition is not recorded anywhere in the source after that triage (status: still open, no resolution found):
- Task 1: no .gitattributes to pin LF/CRLF durably.
- Task 3: unbounded `cooldownUntil` map (no eviction); `clientIp` trusts `cf-connecting-ip` verbatim (trusted-proxy assumption) — both noted as spec-intended.
- Task 4: static.ts has no dedicated unit test (exercised later by Task 14's e2e instead); closed gate masking notfound as deny page is a brief-specified UX quirk, not a defect.
- Task 5: front→upstream "pending" branch is unreachable dead code (brief-verbatim, left alone); `ws.send(bytes, true)` second arg is compress, not is-binary (harmless, brief-verbatim); the ordering regression test is a shape guard, not a strong guard against a type-correct reintroduction of the race.
- Task 6: users doc allows arbitrary extra top-level fields (tighten only if server ever trusts them).
- Task 8: unparseable request body silently falls back to no desiredName (brief-specified); no test for a well-formed-but-invalid token → 401 (brief-verbatim).
- Task 10: `objId 0` indistinguishable from empty in hook diffs (inherited from Task 9, unlikely to matter); no guard against overlapping `login()` calls (Task 14's harness avoids this by awaiting a single call rather than retrying concurrently); two cosmetic imports from hooks/types.
- Task 12: `as PanelId` casts (no behavioral impact); `restore()` brief self-inconsistency (benign).
- Task 13: hide-overlays checkbox has no initial state; xp table has no 'maxed' label; connect panel's `_deps` arity parameter is unused.
- Task 14: `getByLabel` would be more idiomatic than `#gate-password`; `loadClient`'s cached promise is not reset on rejection (brief-verbatim, latent); `echoChat` emits an `'undefined'` sender prefix on empty sender (pre-existing Client.ts behavior, not introduced here).
- Task 15: "bun is exempt from the cmd.exe shim workaround" comment; e2e runs `build:dev` rather than the prod `build.ps1` bytes (pre-existing, needed post-pack); `RedirectStandardError` used inconsistently across start-stack.ps1.
- Task 16: assumes Node is on the SYSTEM PATH; prod/dev both default to port 8899, a possible collision if both run at once — documented for the operator, not auto-fixed.
- Task 17: authored-only, nothing built or run (no docker on this machine) — single named volume for db.sqlite may miss WAL/journal sidecars across container recreate; `oven/bun:1` base tag unpinned; a stale "Not yet committed" line survives in the implementer's own report (harmless); container-internal node port 43596 is harmless by construction. No fix round was opened; reviewer rated all of these Minor/expected for an authored-only task.

Task 11 minors resolved by later work rather than left open: `.env.example` VITE_USE_FIREBASE_EMULATORS=true (deploy sets it false — expected, not a defect); the frame screen being empty was a safe no-op until Task 12 filled it in (it did).

## Measured facts

- Live PoC (pre-SDD): lostcity/ copied to live/engine + live/content, WEB_PORT 8888, tunnel id 00000000-0000-0000-0000-000000000000, DNS osrs.scotho.com → tunnel → localhost:8888. Validated with two concurrent browsers logged in through the public URL on Tutorial Island, no page errors.
- Final local/e2e port map (post-correction): front server 8787, dev engine 8899 (web) / 43596 (game) / 8897 (mgmt), Firestore/Auth emulators 8080/9099. Live PoC stays on 8888/43594/8898 throughout, untouched at every check.
- SP1b (mid-project) migrated the engine from Bun to Node24/tsx/Fastify at rev 274, config from .env to data/config/world.json, cache routes gained a CRC suffix + /versionlist, and models/anims/maps/music now stream over a second WebSocket (OnDemandWorker) on the same `/` upgrade — this drove revisions to the router/proxy, the ws relay (two concurrent upstream sockets per page), and a client-fork rebase (14 hunks re-applied, tracked in client/PATCHES.md).
- Task 14 (rev 274 rerun) e2e: GREEN, 231 ws frames, gameName `guest_apgygp`, xp.length 21.
- Task 15 verify.ps1, full green: client 6/6, server 84/84, web 39/39 + typecheck/lint, rules 13/13, build clean, e2e 3/3.
- Task 6 Firestore rules: 8/8 (post-fix), covering the diff-based gameName/createdAt immutability.
- Task 8 bridge: 7/7 (post-fix), suite 48/48 at close of that task.
- SP1 final review scope: whole-branch integration + security coherence (not a full 57-commit line diff — every task already had its own review), run at opus (most-capable-model tier for a final review). Verdict: SHIP-WITH-FOLLOWUPS. Trust-boundary check: gate exemptions correct, state-changing endpoints Firebase-Bearer-authed (CSRF-safe by construction), bridge/pair transactions race-safe, agent tokens hashed, rules 13/13.
- Final fix verification: web `tsc --noEmit` exit 0; full web vitest suite exit 0 (includes the new account.test.ts stored-XSS regression). Firestore rules-test rerun for the gameNames deny could not be run live (emulator killed by low memory 3x) — accepted by inspection per the ruling above, not by a green run.
- SP1 = all 17 tasks + entry-screen retrofit + SP1b (rev 274) + final whole-branch review, closing at commit 426029d.

## Traps recorded

- Windows: `Start-Process npm`/`npx` hits the .ps1-shim bug; Task 15's fix wraps it via `cmd.exe /c` and uses PID-scoped `taskkill` for cleanup.
- The brief's own suggested cleanup pattern (`Get-Process bun,java | path-match | kill`) is a landmine: it would have killed the live PoC's 8888 engine. Task 15's implementer rejected it in favor of strictly PID-scoped cleanup — reviewer confirmed this as a real catch, not a stylistic choice.
- `verify.ps1` must fail loudly: `$LASTEXITCODE` + `throw` through a `finally` block, not a silent continue.
- Client bundle must be built AFTER the dev engine is up — the engine's BUILD_STARTUP regenerates its own public/client, and if client/out is absent the front server silently falls back to the engine's hookless client. Script ordering: emulators → engine → build client → build web → front server.
- A PowerShell 5.1 bug in the original brief's setup.ps1: a stderr redirect is fatal under `ErrorActionPreference = Stop`. Fixed at Task 1.
- Windows file lock can leave an empty, untracked, git-ignored directory undeleted after a move (lostcity/engine remnant) — benign, noted and left for a reboot to clear.
- Machine resource contention (multiple unrelated projects' dev servers + other agent processes) starved the Firestore/Java emulator repeatedly during verification; this is an environment constraint on this box, not a code defect, and it forced an inspection-based acceptance once (see the gameNames rule ruling above).

## Per-task table

| Task | Built | Commit range | Fix rounds |
|---|---|---|---|
| 1 | lostcity/ → engine/ + client/ split; local dev port shifts; setup.ps1 PS5.1 fix | 1a738f4..e7268fa | 1 |
| 2 | Front server package (server/): env, health | e7268fa..ead58d1 | 0 |
| 3 | Gate cookie + middleware + POST /api/gate | ead58d1..c40db03 | 1 (Important: timing-safe byte-length bug) |
| 4 | Router classify, static serving, engine cache proxy | c40db03..15d8f4c | 0 |
| 5 | WebSocket relay to engine | 15d8f4c..70628d9 | 1 (Important: greeting-frame race hardening) |
| 6 | Firestore rules (local/emulator only; cloud steps deferred) | 70628d9..81ce99c | 1 (Critical: gameName immutability bypass) |
| 7 | Admin SDK init (emulator-aware) + game name rules | 81ce99c..9f70ec1 | 0 |
| 8 | Account bridge POST /api/bridge (transactional create-or-return) | 9f70ec1..0d9b1fd | 1 (Important: same-uid retry overwrite race) |
| 9 | Client hooks module (types, emitter, diff, install) | 0d9b1fd..36bd2cd | 0 |
| 10 | Client fork: programmatic login, headless title, xp/inventory/chat/tick hooks | 36bd2cd..a849640 | 0 |
| 11 | web/ scaffold, app state machine, Firebase auth, api client (later retrofit to entry state) | a849640..1a20e70 | 0 |
| 12 | RuneLite-style frame: panels, canvasSize, overlays (later retrofit: PluginRegistry+manifest) | 1a20e70..895ed57 | 0 |
| 13 | Six panels + stats + web/src/clientTypes.ts mirror (later retrofit: Claude Connection panel) | 895ed57..3edbf6c | 0 |
| 13b | Server pairing (pair/*, router, Firestore rules, guide) — added by Batch-2 retrofit | (within retrofit work) | — |
| 14 | Integration keystone: clientHost.ts, main.ts playing-state wiring, e2e gate→game; run once on rev 225, rerun on rev 274 post-SP1b | 3edbf6c..4937aa8 (225); rerun green post-274 | 1 (baseURL 8788→8787) |
| 15 | build/verify/start-stack scripts + README, 274-aware | a421f2f..85b9b6c | 1 (Important: missing server typecheck gate) |
| 16 | Windows deploy files (authored-only): scheduled tasks, tunnel install, prod env example | 85b9b6c..b581e2f | 0 |
| 17 | Docker/compose for an Oracle VM (authored-only, unverified — no docker on this machine) | b581e2f..9c21cf0 | 0 |
| Final review | Whole-branch trust-boundary review (opus); 2 fixes applied, 2 deferred to SP4 | 9c21cf0..426029d | 1 |
