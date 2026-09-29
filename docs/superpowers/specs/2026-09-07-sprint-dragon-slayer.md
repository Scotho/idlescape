# Idlescape — Sprint: Dragon Slayer

Date: 2026-09-07
Status: open. Branch `sprint/dragon-slayer`
Owns: **the whole remaining sequence.** Everything unbuilt, in the order it should be built.
Supersedes: the sequence in `2026-09-05-idlescape-roadmap-and-handoff.md` section 4 and in
`2026-09-06-sprint-handoff.md` section 3. Those documents remain the authority on what each
SP entry *delivers* and what it *depends on*; this one owns the order.

Named for the 2004 capstone quest, which is what this sprint is: the one that ends with the
thing finished.

**Amended 2026-09-07 afternoon.** Six rows were added, everything below entry 1 was renumbered,
and sections 3, 4 and 5 changed. Section 7 lists every amendment with the decision that made it,
so a reader who knew the morning version can see what moved without re-reading the whole file.

**Amended again 2026-09-07 evening.** One row was added on the owner's instruction - entry 9,
Camera, frame and renderer - and old entries 9 to 16 became 10 to 17. Section 7's last row records
it and the decision behind it.

**Amended once more 2026-09-07, late.** One row was added under D39 - entry 14, Battlebots 2:
puppets, queue and replays, immediately after SP3b - and old entries 14 to 17 became 15 to 18.
Section 7's last row records it. Entry numbers cited in the decisions ledger are as of the date of
the decision that cites them; D58 says so and points here.

## 1. What changed

There were two lists: sprint 1's tail (SP4b in flight, then SP8c, SP9, SP10, SP4c, with SP5
wanted but unsequenced) and a sprint 2 of new work (the shell redesign, the time candy, the
battlebots minigame). Two live sequences with overlapping membership is how a plan quietly stops
being followed, so they are now one list.

The merge is not a concatenation. New work is interleaved where it belongs, and one entry moved
deliberately: **the shell redesign is now near the front, ahead of everything except finishing
SP4b and the two audit remediation rows that must not run underneath it.** Reasons in entry 4.

## 2. The sequence

| # | Entry | Kind | Authority | State |
|---|---|---|---|---|
| 1 | SP4b - bot expansion | v1 | `2026-09-06-sp4b-bot-expansion-design.md`, plan `2026-09-06-sp4b-bot-expansion.md`, handoff `2026-09-07-sp4b-handoff.md` | **done** 2026-09-07: tasks 1-15 clean, whole-branch review and fix wave done, spec reconciled, verify.ps1 green at 4440115, ledger promoted; landing deploy changes in (D73 to D75) |
| 2 | Release integrity and account isolation | audit remediation | `2026-09-07-project-audit.md` sections 2.1 and 2.3, plus D15, D16, D30; plan `2026-09-07-release-integrity-and-account-isolation.md` | **done** 2026-09-07: tasks 1-12 clean, whole-branch review and fix wave done, verify.ps1 green at f945e28, ledger promoted; C07, C09, C10, C16, C17 and C18 closed with their residue named, and nothing released (G5) |
| 3 | Overlay, pack and client-fork gates | audit remediation | `2026-09-07-project-audit.md` section 2.6; plan `2026-09-07-overlay-pack-and-client-fork-gates.md` | done 2026-09-08: 10 tasks clean, whole-branch review and fix wave done, `verify.ps1` green at `c391c81`, ledger promoted to `docs/superpowers/ledgers/2026-09-07-overlay-pack-and-client-fork-gates.md` |
| 4 | Shell v2 and the living component library | new | `2026-09-06-idlescape-shell-v2-gaps-design.md` over `docs/design/idlescape-shell-v2/`, with plan `2026-09-07-shell-v2.md` as the authority over both | done 2026-09-09: 21 tasks clean in two blocks, whole-branch review and fix wave done, verify green at `18d7e17`, ledger promoted to `docs/superpowers/ledgers/2026-09-07-shell-v2.md` |
| 5 | Script API reference, and the standard | new | `2026-09-07-script-api-docs-design.md`, with section 4 of `2026-09-07-script-api-survey-and-standard-design.md` as its first task | spec approved under D11 (D23, D25) |
| 6 | Script Studio | new | `2026-09-07-script-studio-design.md` | spec approved under D11 (D23, D25) |
| 7 | Script API v2 surface | new | section 5 (phase-next) of `2026-09-07-script-api-survey-and-standard-design.md` | spec approved under D11 (D23, D25) |
| 8 | SP8c - the game client's bank tabs | v1 | sections 7 and 8 of `2026-09-05-sp8b-web-bank-design.md`; plan `2026-09-07-sp8c-client-bank-tabs.md` | plan written and reviewed (be1069e, 12 tasks, D117 to D119); executes after entry 3 |
| 9 | Camera, frame and renderer | new | `2026-09-07-camera-frame-and-renderer-design.md`, over `docs/ideas/2026-09-07-camera-frame-and-renderer.md` rounds one and two | spec written and approved under D11 and D41 (D56, D57); row placed on the owner's instruction |
| 10 | Time candy | new | `2026-09-06-time-candy-design.md`; plan `2026-09-08-time-candy.md` | plan written and reviewed (018babf, 9 tasks; D8 settled by D120 and D121, D122 to D126); executes after entries 4 to 9 |
| 11 | Battlebots minigame | new | plan `2026-09-07-spbb-battlebots-minigame.md`, over `2026-09-07-battlebots-minigame-design.md` | **plan written and approved; the plan is this entry's approval record** |
| 12 | SP9 - Contracts | v1 | `2026-09-05-idlescape-roadmap-and-handoff.md` section 4 | not specced in detail |
| 13 | SP3b - finishing SP3's hiscores half | new | `2026-09-07-sp3b-hiscores-completion-design.md`, over `2026-09-05-sp3-hiscores-tracker-design.md` | spec written and approved under D11 and D14 |
| 14 | Battlebots 2: puppets, queue and replays | new | `2026-09-07-battlebots2-puppets-queue-replays-design.md`, over entry 11's plan and `docs/ideas/2026-09-07-battlebots-improvements.md` | spec approved under D11 and D39; three plans in order per its section 17 (puppet host; queue, store and resolution; window, feed and panel) |
| 15 | SP10 - wealth hiscores | v1 | roadmap section 4, over entry 13's category registry | unblocked by entry 13; not specced in detail |
| 16 | SP4c - the gateway | v1 | section 468 onward of `2026-09-05-sp4-tasks-scripting-environment-design.md` | not planned |
| 17 | SP5 - tier 2 plugins and the headless runner | v1 | roadmap section 4 | not planned |
| 18 | Reconciliation, skills and the janitorial batch | audit remediation | `2026-09-07-project-audit.md` sections 2.5, 2.10 and 4, plus D18 and D19 | needs a plan |

### 1. SP4b - bot expansion

Finish what is running. Tasks 1 through 11 are implemented and committed; 12 through 15 remain,
ending with reconciling the spec against what actually shipped. Its handoff exists because the SDD
workspace is git-ignored and does not survive closing a worktree; everything a later session needs
is reproduced there.

Nothing else starts until this lands. It is mid-execution, and an interrupted plan is the most
expensive thing in this repository.

**Folded in from the audit:** C01 (trace coalescing dropping xp and item deltas), already fixed at
`a24d176` inside task 11; C05 into task 10, which owns `runBanner.ts`; C04 into task 15, whose
reconcile pass is already on that ground; and C02, C03 and C06 anywhere in the remaining tasks,
since all three are `web/src/agent` and `web/src/tasks`.

**Its landing step carries three deploy changes that are not tasks 12 to 15.** All three are
deferred to that step for the same reason: so that no commit of theirs falls inside an
implementer's base..head range.

1. **Audit C07's fix to the deploy files** (D16, ruled a task here rather than a sprint row by
   D30): the deployed stack applies the engine overlay, receives its idlescape environment, and
   stops pointing the front server's management client at itself.
2. **The `cloudflared.yml` commit** (D15, audit C08): the uncommitted
   `deploy/lightsail/cloudflared.yml` ingress for `other-site.example.com`, another project's
   service on the same box and what the live tunnel actually runs, is committed to this repository
   as a `chore(deploy)` commit rather than reverted.
3. **D15's two riders**: the cross-project dependency on the `idlescape_internal` network is
   recorded in `deploy/lightsail/README.md`, and `release.ps1` gains a warning that lists the dirty
   tracked files under `deploy/` it is about to ship without.

**The release that applies any of this stays owner-gated as G5**, so nothing on the live host is
touched until the owner asks. Entry 2 asserts all three rather than making them.

### 2. Release integrity and account isolation

The audit's five P0s that are true of the live site right now, in one execution entry: the deployed
engine carries no overlay and therefore no owner bank and no management routes (C07); `/wiki` 503s
in production forever because the wiki is never built into the server image and sits outside every
gate (C09); the two engine secrets are unset everywhere in the production pipeline, so the live
engine verifies owner assertions against an empty string (C17); plugin and script state in
`localStorage` is not keyed by uid, so one browser leaks enable flags and notes between accounts
(C10); and `boot()` can reject on a network blip and leave a genuinely blank page (C18).

**One of those five is not this entry's to make.** C07's fix to the deploy files lands in entry 1's
landing step under D30, and the `cloudflared.yml` ingress commit that D15 ruled a commit rather
than a revert (C08) lands in that same step beside it, so that neither falls inside an SP4b
implementer's base..head range. This entry inherits both and **asserts** them: C07's problem is
stated above because it is one of the five things wrong with the live site, and the change that
closes it is listed in entry 1, where the work is (D35).

**Why it sits here.** Every one of these is either live now or would be made worse by anything
built on top of it. The account-isolation half in particular must land before entry 4 touches the
panels, because C10's fix has to be applied identically to `web/src/plugins/settings.ts` and
`web/src/tasks/toggles.ts`, and entry 1 owns the second of those; either fold that half into entry
1's task 9 or land this entry after it commits, but not both. The deploy half touches only
`deploy/`, `server/src`, `engine-custom/`, `wiki/` and `scripts/`,
none of which **entry 1's tasks 12 to 15** touch, which is why the audit was willing to run it in
parallel. Entry 1's landing step does touch `deploy/`, which is exactly why C07 and C08 sit there
and not here. What remains of the deploy half in this entry is C09's wiki build into the server
image and C17's two engine secrets across the production pipeline; **the release that applies any
of it stays owner-gated as G5** (D16), so nothing on the live host is touched until the owner
asks.

The audit's separate "front door and verification document" row is not here, because the
vision-and-architecture run already wrote its documents. What it did not write is the static gate
itself, so **C16's half of that row rides in this entry**: the 400-line ceiling enforced by
something, and typechecking for tests, e2e specs and the client fork.

### 3. Overlay, pack and client-fork gates

The machinery that is supposed to keep the overlays honest, and does not. Three of the four packs
section 3 allocates are not in `content-custom/pack/` at all, and the pack guard compares a pack to
itself and runs after the renumbering it is meant to catch (C22). This entry's C22 paragraph also
said the engine Dockerfile's plain `npm run build` was very likely already failing in production;
that was true when this spec landed (`d4431af`, 14:12:02) and **went false twenty three minutes
later**, when `ca8ef86` (14:35:25) replaced that line with `RUN npx tsx
tools/pack/BuildOverlay.ts` under D73 and D74, as entry 1's deploy escalation. What survives from
it is that the same Dockerfile's advice to set `BUILD_VERIFY=false` cannot work, because
`WorldConfig.ts` returns as soon as `world.json` exists, before any `BUILD_*` variable is read.
The content overlay script exits 0 on drift, hashes the post-overlay working tree rather than the
upstream blob, and is never run by `verify.ps1`; nothing compares either pinned clone to
`scripts/upstream.lock` (C23). And the client fork has no automated check of any kind: 28
numbered patches inside a 14,481-line file rest on grep lines in a shell fence that no script
runs, one of which omits its own proof (C24).

**Why it sits here.** The audit placed this immediately before the time candy entry, on the
grounds that the two content entries are the first to append to `content-custom/pack/*`, and noted
in the same breath that C24 in particular belongs earlier because SP8c adds new numbered patches
to `Client.ts`. Moving the whole row up to third satisfies both, costs nothing, and puts it beside
entry 2, with which it shares a shape and a reviewer: both are audit remediation over `scripts/`,
`deploy/` and the overlays, neither touches `web/src`, and running them back to back means one
execution workflow's worth of context covers both.

### 4. Shell v2 and the living component library

A redesign of the panel UI around the game canvas plus the design system codifying it: a persistent
co-pilot bar in all five run states, a 280px side panel with a pinnable XP tracker and a pop-out
trace window, Automation (renamed from Tasks) with My tasks and Marketplace tabs, a new
cross-character Events panel, Characters merged into Account, a drawn SVG icon set replacing the
emoji strip, and digits moved off the pixel font onto bold mono for legibility.

**Why it moved to the front.** Every panel built before it lands is a panel to rebuild afterwards,
and five entries below this one ship UI: the Script Studio, SP9's Contracts forms, SP4c's gateway
surfaces, battlebots' match panel, and SP3b's two hiscores pages plus its Hiscores panel section.
Build them first and they get built twice. That is the
owner's own reasoning - better early, before more features diverge - and two facts make it
concrete:

- The handoff's icon set ships **exactly eleven glyphs**, which is exactly the strip *after* the
  three structural merges (Characters into Account, Marketplace into a tab, Events added). Today's
  strip has twelve buttons. The merges are therefore not deferrable polish; defer them and the
  icon set does not fit. Entry 13 respects the same count, which is why its Hiscores surface is a
  panel section rather than a twelfth icon.
- The design retires the `.p-*` class dialect outright. Every panel written against it in the
  meantime is written against something already scheduled for deletion.

The two entries now ahead of it are there because they are remediation of things that are already
broken, not new surface, and because both would otherwise have to be done underneath a redesign.

**Design authority** is the vendored bundle, not this document: `README.md` for what each surface
is, `Idlescape Shell v2.dc.html` for every literal value. High fidelity - colours, sizes, spacing
and copy are final. The spec named in the table is a *companion* that closes what the handoff
leaves open, and defers to it wherever they overlap.

**What the companion adds:** a session-scoped cross-character event feed, which the Events panel
assumes and the app does not have; a per-drop XP signal for the canvas overlay, distinct from the
tracker's sampled rate; a per-character session clock for the online timer; the panel-id migration
across 1,092 unit tests and 21 Playwright specs; three contracts to verify before building on them;
a CSS file split against the 400-line ceiling; and the mechanism that keeps the component library
alive rather than merely documented.

**Ongoing maintenance is inside this entry, not after it.** The system is vendored and skill-backed
already; the enforcement half - styleguide coverage as a completeness rule, the five shipped
`.card.html` files as visual regression fixtures, and a check that forbids per-panel one-off
styles - is work items 2 through 4 of the companion spec's section 5.

**Folded in from the audit:** C19 (the plugin runtime seam: a dead `settings.subscribe`, a
`deactivate` that leaks its panel, accumulating listeners, an untested lifecycle) and C21 (the
recorded SP8b gaps, the a11y contract, the mute toggle and the one localStorage accessor) into the
plan's panel tasks and the companion spec's section 6; and C20 scoped to the `PanelId` and
`PluginManifest` consolidation only, because the `.p-*` retirement and the styleguide and CSS drift
gate are already committed in that spec's section 4 G9 and section 5 items 2 and 4.

**Four plan edits it inherits rather than discovers**, all settled before dispatch: D22, D26 and
D29 give the `Window` component family, the `--window` token and the full-height canvas column
their tasks. The four are the token in Task 1 step 3, its use in Task 7, the `frame.css` migration
row in Task 2, and Task 8 step 5. Entry 6 therefore composes them instead of porting the bank and
trace windows itself.

### 5. Script API reference, and the standard

The published, gated reference for the script API: a build-time generator, two committed artefacts,
two server routes, a drift gate in `scripts/build.ps1`, seven pages and nine worked examples.

**Its first task is the standard**, not the pages: section 4 of the survey document (rules S1 to
S12) plus that document's phase-now proposals. Writing the examples first would have gate 4 hold a
superseded idiom in place forever, which is the whole argument of D25.

**Why it sits here.** Three near-adjacent script entries in one order that each unblock the next:
this one's `api-index.json` feeds the studio's completions, the studio's validator enforces this
one's standard, and the v2 surface wants both before it adds eleven members. Immediately after
shell v2 because the reference is the only one of the three that ships no new UI, so it is the
cheapest thing to run while the redesign's dust settles.

The survey document itself is not a row. It is an authority document: its section 4 is this entry's
first task and its section 5 is entry 7.

### 6. Script Studio

A real editor over the stage: CodeMirror 6, completions from entry 5's index, a validator that
enforces the standard, fork and save, and the first large window the shell has had.

**Why it sits here.** It is the last entry that sees today's `ScriptContext` and the first that
could lint tomorrow's, which is exactly why it goes between the reference and the v2 surface. It
depends on entry 4 for the `Window` family, the `--window` token and the full-height canvas column,
all three of which are now owned by named tasks in that entry's plan under D26 and D29 rather than
by a mock this entry would otherwise have had to port.

D24 is a precondition it carries rather than solves: a Worker-resident script is trusted as the
account's own code, the studio's `forbidden_api` scan and `no-transport-escape` lint are guardrails
against accidents rather than a boundary, and what bounds the blast radius is that no cross-account
script sharing exists.

### 7. Script API v2 surface

The survey's phase-next proposals: the eleven members and the shape changes that need both the
standard and the studio in place before they land, because the studio's validator is what stops the
new surface growing a second idiom on its first day.

**Why it sits here.** It is the only one of the three script entries that changes the API rather
than describing or editing against it, so it goes last of the three, and it goes before the two
content entries because a library script written against v1 in entry 11 is a script to rewrite.

### 8. SP8c - the game client's bank tabs

The client half of the bank tabs: a tab-range draw plus divider lines in `Client.ts`, the
`bank_main.if` tab components and `bank.rs2` handlers in `content-custom/`, then drag-to-tab and
in-game search. Split out of SP8b because SP8b was forbidden from touching `engine-custom/` and
`content-custom/`.

Here rather than later because the web bank was restyled by entry 4, and the two banks should stop
disagreeing in the same sprint they start disagreeing. It runs after entry 3 because it adds new
numbered patches to `Client.ts`, and entry 3 is what makes a numbered patch checkable.

**Folded in from the audit:** SP8b's deferred bank placeholders and fillers (deferral D5) join this
entry's scope line. They are engine-level, they were promised in SP8b's spec at `:189`, and they
currently have no home at all.

### 9. Camera, frame and renderer

The RuneLite quality of life the owner asked for, as one batch of numbered client patches and one
settings section: zoom on the mouse wheel over the camera distance the client computes as
`pitch * 3 + 600`, a widened pitch range, WASD camera movement in the RuneLite idiom, a
display-rate draw loop with camera interpolation between the 20 ms game cycles, an fps target where
`GameShell` clamps at 50 today, and a draw-distance slider over the far clip.

**WASD is the setting with rules rather than a value**, and the idea file states them so the spec
does not have to rediscover them. When it is on and the client is not in typing mode, W, A, S and D
act as the four arrow keys the client already rotates and pitches the camera on, and every other
printable key is swallowed before the chat input sees it. Enter switches to typing mode, where the
chatbox behaves exactly as it does today; Enter there sends the line and returns to camera mode, and
Escape clears the line and returns. Typing mode is entered automatically whenever the client opens a
text prompt - the amount prompt on withdraw-X, name entry, the `::` command line - and camera mode
resumes when the prompt closes, which is the rule that stops the setting fighting the bank. The
"Press Enter to chat" hint is drawn by the shell over the canvas rather than by a client patch, so
the patch stays a key-routing change.

**Every one of them is a setting in the `config` panel's Display section, off by default, persisted
per browser under the `cs.` prefix, and never a twelfth strip icon** - entry 4's icon set ships
exactly eleven glyphs and its whole argument rests on that count, so a new panel is not available to
this entry and does not need to be. The slider's maximum is not this entry's to invent: it is the
output of the draw-distance spike D40 queued as a read-only item, which measures the software
rasteriser at two and three times the default clip and finds the real no-pop-in bound under the
engine's current scene-rebuild policy. If that spike has not reported when this entry is planned,
the slider ships with today's distance as its maximum and the spike widens it afterwards.

**Why it sits here.** After entry 8 so that its numbered patches to `Client.ts` land in one batch
with SP8c's rather than in two, and therefore behind entry 3, which is what makes a numbered patch
checkable at all - the same gate, and the same reason, that put entry 8 where it is. After entry 4
because the Display section is composed out of the shell v2 component library and its token layer,
and a settings section written before that library exists is a settings section to write twice. It
touches no engine or content code and appends to no pack, so it is the cheapest row below entry 8
and it does not compete with the two content entries for the overlay.

**What it depends on**, in one line: entry 3 for the client-fork gate, entry 8 for the patch batch it
rides in, entry 4 for the panel dialect and the Display section, and D40's spike for one number.

**The doors it leaves open.** This is stage one of the four its idea file stages, and stages three
and four - a WebGL scene backend behind the client's draw seam, then fog, filtering and distance on
top of it - are what actually remove the frame-rate and draw-distance ceilings. Nothing here may
close them: the draw loop is written so a backend can drive it at any rate rather than at a
hardcoded target, scene drawing stays behind one call so a backend can replace it, and the Display
section is laid out so fog and filtering arrive as further rows in it rather than as a new surface.
The renderer itself has no row and no spec in this sprint; it stays a candidate, with osrs.world's
renderer - same author as upstream's never-merged `225-gpu` branch - named in the idea file as the
reference. **One correction the idea file opens with belongs in this entry's spec too:** this
repository never shipped a GPU renderer that was later disabled, so the renderer question is port or
rewrite, not re-enable.

### 10. Time candy

A clue-scroll reward that records the next hour of a character's experience and seals it into a
second, owner-bound item. Eating that item replays the hour skill for skill onto whichever of the
owner's characters wants it, so an hour of training becomes 2x, deferred and relocatable.

The engineering interest is that objs carry no per-instance data and neither does the owner bank,
so the payload lives in an owner-scoped ledger and the full candy is an interchangeable bearer token
against it. Section 6 of its spec states the invariant that keeps item and ledger married, and how
every exit from an inventory other than eating it is closed to defend it.

First of the two content entries because it is the small one, and it exercises exactly the
machinery entry 11 leans on hardest: the content overlay, `BuildOverlay.ts`, and hand-pinned pack
ids. Prove that path on two obj configs before proving it on a region. Entry 3 is what makes those
pack ids enforceable rather than aspirational.

**Still open, and ruled at plan time under D8:** the 1/50 medium drop rate is invented rather than
derived, because the purple sweets the original request referenced do not exist in the 2004 content
tree. The per-character recording rule and the decision that a 0 XP hour still seals into a candy
were both author's calls rather than requests (rulings 4 and 7 of that spec).

### 11. Battlebots minigame

A stakes-free, script-driven PvP arena in the first region of this world built from scratch rather
than inherited from the 274 cache: a lobby, eight identical plots, safe death, issued loadouts,
practice against an existing NPC, player-to-player challenges, a queue pad, four library bot
scripts, and a match record the front server can read. Entry is by explicit teleport; the region has
no walkable connection to anything.

**The plan is the authority, not the spec, and the plan is also this entry's approval record.** It
records sixteen rulings against the spec, each replacing an assumption about the engine with
something read out of the pinned clones - among them that `.jm2` map source can simply be generated
(closing the spec's own research gate), that bot scripts run in the player's existing per-character
Worker rather than a new server-side sandbox, and that no new interfaces are needed at all. Read
that table before the spec. The spec's own header still says "draft, pending decisions in section
19"; ten of those twelve decisions are settled in the plan, and section 5 of this document now
names this entry as the precedent for an entry whose approval lives in its plan.

It is the only entry in this sprint whose plan was written before its row, so it is the most
shovel-ready thing on the list. It is placed eleventh anyway, because it is also the largest -
thirteen tasks, a generated region, a front-server match store, four bot scripts - and it should
not start while entry 1 is still running, before entry 4 has settled the UI it will add a panel to,
or before entry 7 has settled the script API its four library bots are written against.

**Folded in from the audit:** C25 (the HELPERS string gate covers four helpers and one branch of
one of them) lands before the task that adds the four library bot scripts.

Its match store is also what entry 13 projects `battlebots_wins` over, and its `BATTLEBOTS_DB` is
the first durable file the front server has ever wanted.

**That volume is this entry's work, not entry 13's, and it joins this entry's scope line.** D33's
ruling R9 gives it to whichever of the two lands first, and this one lands two entries earlier.
Verified at `a24d176`: `deploy/docker/docker-compose.yml` declares exactly one named volume,
`engine-db`, and the `server` service mounts none, so `battlebots.db` would be deleted by every
release with no error anywhere. So this entry **adds a named `server-data` volume, mounts it on the
`server` service, and puts `BATTLEBOTS_DB` inside it**; entry 13 then asserts that volume and puts
`tracker.db` beside it. The approved plan does not carry this work, which is why it is named here
rather than left to the plan (D36).

### 12. SP9 - Contracts

Economy database, escrow settlement, market queries, web UI, agent tools and policy. Its buy and
sell forms are already stubbed as registered menu entries in the SP8b bank, disabled with
"Contracts coming soon", and the `MenuItemContext` those entries receive is the seam it inherits.

Its web UI is the largest single beneficiary of entry 4 landing first.

**Folded in from the audit:** C26 (one rate limiter, keyed on something the caller cannot set) and
C27 (an auth matrix with one authority the server does not implement, a comment that says the
opposite of the code, and no composition test) go into SP9's spec when it is written. SP9 adds the
first economically interesting write routes and is the first consumer of the agent principal rule.

### 13. SP3b - finishing SP3's hiscores half

Snapshot capture in the shell's session layer, the ingest route, the tracker database and its
retention, the hiscores and player pages, and a Hiscores section in the XP Tracker panel. Five
layers, not one module: the audit confirmed independently that SP3's server half and its client
half are both absent, and section 4 of this document records the ruling that finishes it rather
than dropping it.

**Why it sits here.** It is placed above SP10 because SP10 is the only entry that cannot proceed
without it - entry 14 now sits between the two - and as late as that constraint allows, because it
is the entry that benefits most from everything above it: it is written in entry 4's panel dialect
and token layer, against entry 11's match store for one category, and against the account and
character model SP6 and SP7 already shipped. Building it earlier would mean writing its panel twice
and its category registry against a store that does not exist yet.

It ships a category registry rather than a table, which is what makes entry 15 small: SP10 writes
two category providers and registers them, and writes no route, no page and no schema. Entry 14's
win streak registers into the same registry, and D44 is the requirement on this entry's unwritten
plan that its two battlebots categories read the SQL views Battlebots 2 ships rather than `bb_rows`,
whose `game_name` holds a puppet's name once puppets fight the ranked matches.

### 14. Battlebots 2: puppets, queue and replays

Ranked battlebots matches stop being fought by the player's own character. A **puppet** fights
instead - a character the front server owns, issued to a player for one match, carrying a **stored
setup** frozen when that player queued - and under D37 it is hosted as a headless `LiteClient` in a
second Worker in the player's own browser tab, with the script Worker above it unchanged. Queueing
stops being a place and becomes a durable server-side list carrying the owner's rules: the loser is
dequeued, the winner is re-queued until it loses or leaves, one ranked match per account, and never
two puppets of the same account. A match then leaves something worth reading behind - a header
written at arming, a tick log, and each side's run trace in the SP4b export shape - which is what
makes the rest possible: a persisted **win streak** registered as a category into entry 13's
registry, live viewing and replay as the same tick log rendered twice in a stage window that draws
the plot as a schematic first, and a principal-free queue population line beside the end-of-run data
the panel reads. Practice and challenge are untouched and stay on the player's real character.

**Why it sits here.** Immediately after entry 13, because the streak is a category in that entry's
registry and cannot move earlier without either shipping the category twice or putting puppet names
on the public ladder for an entry's duration. And after entry 11, because it is built entirely on
that entry's ground - the region, the plots, the kits, the result hook, the match store and the
`server-data` volume - and on the doors that entry is asked to leave open in it.

**What it depends on**, in one line: entry 11 with D43's four doors-open requirements honoured (an
ordered `migrations/00N.sql` list rather than a wholesale `schema.sql` apply,
`sweepBattlebots(players)` kept as one call among the post-cycle block's calls, no identity derived
from `bb_rows`, and every user-facing read of a fighter's name routed through one resolver in
`store.ts`, plus the panel's stubbed Queue action); entry 13's category registry; and entry 4's
`Window` family, panel dialect and `.meter` data family. SP4b's run export shape and its live-stack
e2e harness are the two further things it reads. D43 also carries the owner's reversal of entry 11's
R16: the retention cap returns, in the shape D54 corrects it to.

**It opens with a gate rather than a task.** Its section 19 makes task one of its first plan a spike
with an explicit pass mark - a puppet logs in over `/puppet-ws`, walks one tile, and publishes a
snapshot the existing `createWorkerHost` accepts and de-duplicates, in a backgrounded tab - because
everything below it is dead if a headless `LiteClient` will not run in a Worker against our 274 pin.
If it fails, the ruled answer is not to work around it here: the puppet host moves to entry 17's Bun
half under the isolation precondition D46 writes onto that entry's scope line, and this entry ships
its other two plans against that host instead.

**What it defers.** Walk-away play, which the owner ruled is not a must-have: both players stay
online to host their puppets, and entry 17 is what removes that. And the owner's two private,
untracked testing shapes, sparring against default bots we ship and a rematch against a past
opponent's kit and stat snapshot with a default script, which D59 (correcting D55) defers
**together, as one mechanism and one plan task** rather than dismissing as already built: one more arm mode, an enqueue path pairing an
account against a shipped setup, a second puppet hosted in the same tab as the first, a `mode` the
resolution excludes from streaks and credit, and a panel surface. It lands after that spec's
section 17 minimum shippable slice, which is its first two plans with the panel's Queue and Matches
sections only.

### 15. SP10 - wealth hiscores

Raw coin and estimated wealth hiscores, as two `subject: 'account'` categories registered into
entry 13's registry. **No longer blocked**: section 4 records the ruling and entry 13 is the
completion entry it was waiting for.

The one thing its spec must not assume: the owner bank is per account, not per character, so a
wealth row cannot be keyed by a character the way every skill row is. Entry 13's registry carries a
subject kind for exactly this reason.

### 16. SP4c - the gateway

The `/tab` registry, relay, schema, modes and rate limits; `runs.db`; the tutorial run driven
through MCP. Defined in section 468 onward of the SP4 tasks scripting environment design.

**Folded in from the audit:** C28 (every agent-facing surface currently lies about its own state),
C29 (the Firestore rules' deferred `secretHash` hardening plus four untested paths) and C30 into
this entry's scope line. C30 is settled as a decision rather than code by D24, and it lands here as
an explicit precondition: **any relay or sharing of another account's script code inherits the
trust model D24 states.** C28's `/api/wiki` half is two lines and can land immediately, without
waiting for this entry.

Its co-pilot surfaces are also where the Goals store, the three-mode selector and autopilot would
attach if they are ever given a row; D17 marks that orphan spec as superseded on the co-pilot bar
by entry 4 and leaves the rest a candidate.

### 17. SP5 - tier 2 plugins and the headless runner

Tile markers, highlights, idle notifier, shortest path, menu swapper and the world map - the plugins
that need scene projection - plus the headless LiteClient runner. The roadmap has always wanted it
and never sequenced it. It is sequenced now, last of the feature work, which is a decision rather
than an oversight.

Under D18 it plans against the scene and menu halves only. The client plugin tier is dormant for
this sprint, so nothing here waits on the GPU renderer.

### 18. Reconciliation, skills and the janitorial batch

The durability work, gathered rather than scattered: the "what SPn actually built" sections that
the convention requires and that have been written once in eleven opportunities (C31); the client
plugin tier's disposition, which D18 already rules dormant and which needs its one sentence in the
SP2 spec, its stub note in `client/PATCHES.md` and its terser-mangling check carried into the build
(C32); whatever of the eight project skills the vision-and-architecture run did not already write
(C33); and the fourteen small defects the audit found and batched into one pass (C35).

**One more thing it owns, created by D32's renumber.** Three authority specs still name the entry
number they held before the sixteen-entry sequence, and each of those numbers is now a live row
belonging to a different entry: `2026-09-07-script-api-docs-design.md` says "sprint entry 3" and is
entry 5; `2026-09-07-script-studio-design.md` says "sprint entry 4 ... and before SP8c" and is
entry 6, with SP8c now entry 8; and `2026-09-07-script-api-survey-and-standard-design.md` says its
phase-next half becomes "sprint entry 5" and it is entry 7. A colliding number
is worse than an obviously stale one, and this is the same shape of contradicting status document
that C14 was raised for. **This entry corrects all three Placement lines against section 2 as it
then stands**, and strikes the battlebots header's superseded "draft, pending decisions in section
19" line at the same time (D36). The fourth of that set,
`2026-09-07-battlebots-minigame-design.md:5`, said "entry 5"; D41's insertion corrected it to entry
11 as it passed, so only its header line is left here.

**Why it sits last.** Three of its original four candidates, and the placement lines above, are
reconciliation of what the sprint itself changed, so running it earlier means running it twice. The vision run already landed most of C33
and the documents C31 depends on, which is why this is a real row with a shrinking scope rather
than the backlog note it would otherwise be, and a backlog with no row is what produced eleven of
the audit's thirty-four findings. D19's promotion rule is what keeps its output alive after the
sprint closes.

## 3. Shared pack ids

Two entries append to `content-custom/pack/*`. Pack ids are pinned by hand because
`BuildOverlay.ts` runs with `Environment.build.verify = false`, which makes a missing name
auto-register and rewrite the `.pack` file - and a renumbered `.pack` renumbers obj ids already
written into every `.sav` and every owner-bank JSON, silently turning one item into another. So the
allocation lives here once, rather than falling to whoever packs first.

| Pack | Id | Name | Entry |
|---|---|---|---|
| `obj` | 3894 | `time_candy` | 10, time candy |
| `obj` | 3895 | `time_candy_filled` | 10, time candy |
| `inv` | 217 | `bb_stash_inv` | 11, battlebots |
| `inv` | 218 | `bb_stash_worn` | 11, battlebots |
| `inv` | 219 | `time_candy_keep` | 10, time candy |
| `loc` | 4671 | `bb_portal` | 11, battlebots |

The battlebots entry also appends to `map.pack` and `vars.pack` and extends `varp.pack`; task 2 of
its plan holds those, and nothing else in this sprint touches them.

**This table settled a real collision.** Both entries were written independently against upstream's
`inv.pack` maximum of 216 and both claimed 217. Battlebots keeps 217 and 218, which its plan already
appends with a literal `printf`; time candy moves to 219, a one-line change to a spec with no plan
yet. The ids are pinned by name, so reordering the entries does not move them, and the Entry column
above is a pointer rather than part of the allocation.

Upstream maxima at the 274 pin: `obj` 3893, `inv` 216, `loc` 4670, `map` 1007, `interface` 10983,
`dbrow` 1290, and `varp` 358 with our own overlay already holding 359 to 367.

**The allocation was unenforceable, and entry 3 fixed it** on 2026-09-08 (audit C22). Until then
only `varp.pack` was in `content-custom/pack/`, so `obj.pack`, `inv.pack` and `loc.pack` had nothing
for a hand-pinned id line to be added to, and `BuildOverlay.ts`'s instruction to add the missing
line by hand was impossible for three of the six rows above; the guard beside it compared each pack
to itself across one `packAll` call, so it could detect a rewrite but never that an id fails to
match this table, and it ran after the renumbering it was meant to catch. Entry 3 pinned the three
upstream packs into `content-custom/pack/` with manifest entries the way `varp.pack` has, gave
`.gitattributes` a `*.pack text eol=lf` rule so a `.pack` is canonical LF on `git add` and on every
checkout, put this table into code at `engine-custom/src/idlescape/packIds.ts`, and added
`engine-custom/src/idlescape/packIds.test.ts` plus a `checkPack` call before and after **both**
`packAll` paths, **before entries 10 and 11 append**. The six allocated ids are asserted
conditionally until those entries land: if the id line exists its name must match, and if the name
appears its id must match. One fact rides with it: the Dockerfile's advice to set
`BUILD_VERIFY=false` cannot work, because `WorldConfig.ts` returns as soon as `world.json`
exists, before any `BUILD_*` variable is read. The sentence that used to stand here, that the
engine Dockerfile's `npm run build` step was very likely already failing in production, was false
from `ca8ef86` onward, twenty three minutes after this document landed; entry 3 asserted the
replacement rather than redoing it.

## 4. The hiscores discrepancy, and how it was ruled

`2026-09-06-sprint-handoff.md` section 2 lists **SP3 as done and verified**. The battlebots plan's
ruling R10 says no hiscore code exists anywhere and that SP3 is unbuilt. They cannot both be right,
and R10 is the one with evidence: `server/src` has no hiscores, tracker or snapshot module,
`web/src` has no match for "hiscore" at all, and `web/src/stats/` is three helper files for the XP
and loot trackers.

The project audit reached the same conclusion independently, from the code, and added three facts:

1. **The server half does not exist**, confirmed without reference to R10.
2. **The client half does not exist either.** SP2 reserved the seam SP3's snapshot ingest was meant
   to use (`ctx.snapshots.push(reason)`, SP2 design `:163-164`) and `web/src/plugins/types.ts` has
   no `snapshots` member on `PluginContext`. So the completion entry is not "add a server module":
   it is a capture path, an ingest endpoint, a tracker store, the pages and the panel surface.
3. **Three documents tell a fresh reader that SP3 is done**: the sprint handoff's "done and
   verified" list, the roadmap's unqualified SP3 row, and a `CREDITS.md` attribution for a
   `hiscores` plugin with zero code references. Audit C14 fixes all three, and it is part of this
   decision rather than a follow-up.

**The ruling, made under D14 and no longer open:** SP3's hiscores half is finished as a new entry,
**SP3b, entry 13**, placed above SP10, and **SP10 stays**. Its spec is
`2026-09-07-sp3b-hiscores-completion-design.md`, written from the SP3 design and this document, and
it says plainly which of SP3's sentences it supersedes. Battlebots is unaffected, as R10 already
ruled `battlebots_wins` out of its first release and made the category a projection over its own
match store; entry 13 registers that projection.

One correction the completion spec makes to the sentence above, worth carrying here: the trackers a
reader mistakes for SP3's are **SP2's** Tier 1 plugins, not SP3's. SP3 delivered nothing. The
`hiscores` plugin is likewise one of SP2's four Tier 1 plugins that never shipped, so entry 13
closes it, and entry 18's SP2 reconciliation section should say so.

## 5. Conventions

Inherited from `2026-09-06-sprint-handoff.md` section 1 and unchanged: `superpowers:writing-plans`
against an entry's spec produces a plan under `docs/superpowers/plans/`, executed with
`superpowers:subagent-driven-development` - a fresh implementer per task, a review after each, fix
rounds until clean, then a final whole-branch review and `npm run verify`. Rulings get recorded
rather than escalated. Opus for architecture and final reviews, Sonnet for mechanical work.

Changed for this sprint:

- **Work lands on `sprint/dragon-slayer`**, not `feat/platform-shell`, and merges to `develop` when
  the sprint closes. Entry 1 is the exception: it finishes wherever it is already running.
- Entries are numbered by build order, not by when they were thought of. Renumbering on a reorder is
  fine; the pack id table in section 3 is pinned by name and does not move with them.
- **An entry needs an approved authority before it gets a row.** A row without one is a wish.
  There are exactly three shapes that authority can take, and the entry's State cell says which:
  - **An approved spec.** The ordinary case, and the one every feature row uses.
  - **An approved plan**, where the plan settles its spec's open decisions. The plan is named as
    the approval record in the State cell, and the entry's paragraph says so. Entry 11 is the
    precedent: its plan's sixteen rulings closed ten of its spec's twelve decisions, and the spec's
    own header still reads "draft" (D32).
  - **Named sections of the project audit, adopted by this document**, for an audit remediation
    row. Entries 2, 3 and 18 are the three that stand on this, and they are the only three (D34).
    The audit's own header reads "Owns: nothing. This document proposes; the sprint document
    decides", which is not in tension with this: the audit proposes findings, the row here is the
    decision that adopts them, and the finding ids the entry's paragraph names are the checklist
    its plan is written from. Such a row's State reads "needs a plan" and it **cannot be dispatched
    until it has one**; that plan is written against the audit sections in the Authority cell and
    reviewed to clean, and it is the plan, not the audit section, that gates the work.
  - Two inherited rows, 12 and 15, stand on roadmap section 4 and are marked "not specced in
    detail". They are grandfathered rather than a fourth shape, and each needs a spec of its own
    before it is dispatched.
- Where an entry's plan overrules its spec, the entry says so and names the plan. A plan written
  against the pinned clones beats a spec written against an assumption about them; entry 11 is the
  case in point, with sixteen such rulings.
- **The ledger is promoted, not deleted** (D19). At final-review-clean, `progress.md` is condensed
  under 400 lines into `docs/superpowers/ledgers/<plan-basename>.md` and committed with the closing
  commit. The older wording in the sprint handoff and in the SP4b plan, "delete the plan's ledger
  directory", is superseded: eleven of the audit's thirty-four findings were rulings lost that way.
  The convention itself is written down in `docs/superpowers/SDD.md`.
- **A spec that arrives from outside the repository gets vendored into `specs/` unchanged**, and
  the repository has **two shapes for recording where it came from**, both valid: an inline header
  under the title, which the battlebots spec uses and which suits a single file; and a separate
  `PROVENANCE.md` beside the vendored tree, which the shell v2 bundle uses and which is the better
  artefact when what arrives is a directory rather than a document. Use the header for one file and
  the provenance file for a bundle. Entries 4 and 11 are the two cases.
- **`web/styleguide.html` is exempt from the 400-line ceiling** as a single static page (D12). The
  Global Constraints in the sprint handoff carry the same exemption when that document is next
  edited.
- **The verification a change needs is listed in `docs/VERIFICATION.md`, once it lands** (it is
  written and uncommitted as of this amendment, from the vision-and-architecture run). Until it is
  committed, `scripts/verify.ps1` plus the audit's list of what that script does not cover is the
  honest answer, and entry 2 is what closes the gap.
- **"Never a plain `npm run build` in `web/`" is about the e2e run, not about building.**
  `scripts/build.ps1` runs exactly that, from `web/`, and is correct to: it produces the shipped
  `dist/`. What must never use it is the e2e path, which needs `build:e2e` and its
  `dist-e2e` output because Playwright runs against the emulator-mode bundle. State the case, not
  the prohibition (audit C12).

## 6. Adding an entry

1. Brainstorm it to a design (`superpowers:brainstorming`), which classifies it and produces the
   spec.
2. Commit the spec under `docs/superpowers/specs/`.
3. Insert it in section 2 at the position it should be built, say why it sits there, and renumber.
4. If its approval lives in a plan rather than a spec header, say so in its State cell and in its
   paragraph, per section 5.
5. An audit remediation row skips steps 1 and 2, and instead names in its Authority cell the audit
   sections this document adopts as its authority, per section 5's third shape. It still gets its
   own paragraph saying why it sits where it does, it still renumbers what follows, and it still
   needs a reviewed plan before dispatch. Nothing other than an audit remediation row may skip the
   spec.

## 7. Changes since 2026-09-07 morning

Everything that moved in this document since the version committed at `fb48af8`, with the decision
that authorised it. Rows 1 to 18 are the morning-to-afternoon amendment; rows 19 to 27 are the
review pass over that amendment; row 28 is the evening insertion of entry 9 under D41, row 29
the later insertion of entry 14 under D39, each with the renumber that came with it, row 30 that
entry 9's spec has since been written and approved, row 31 that entry 2 has run and closed, and
rows 32 and 33 the two corrections entry 3's implementation forced on this document's own text, and
row 34 that entry 3 has run and closed, row 35 that entry 4's first execution block has run and its
gate is green, and row 36 that entry 4 has now run and closed in full.
Nothing anywhere in the document changed except as listed.

| # | Change | Decision |
|---|---|---|
| 1 | Section 2 gains **entry 2, Release integrity and account isolation** (audit C07, C09, C17, C08, C10, C18, plus C16's static gate), after entry 1. | D15, D16, D30, audit 3.1 |
| 2 | Section 2 gains **entry 3, Overlay, pack and client-fork gates** (C22, C23, C24), moved up from the audit's proposed position before the time candy entry so that it also covers SP8c's new `Client.ts` patches. | audit 3.1 and 2.6, D32 |
| 3 | Section 2 gains **entries 5, 6 and 7** for the three script specs (reference with the standard as its first task; studio; v2 surface), inserted after shell v2 in the order those specs' own Placement lines argue for. | D23, D25 |
| 4 | Section 2 gains **entry 13, SP3b**, immediately before SP10, with `2026-09-07-sp3b-hiscores-completion-design.md` as its authority. | D14, D11 |
| 5 | Section 2 gains **entry 18, Reconciliation, skills and the janitorial batch** (C31, C32, C33, C35), placed last. | D18, D19, audit 3.1 |
| 6 | Everything below entry 1 is **renumbered**: shell v2 2 to 4, SP8c 3 to 8, time candy 4 to 9, battlebots 5 to 10, SP9 6 to 11, SP10 7 to 13, SP4c 8 to 14, SP5 9 to 15. Every paragraph that cited a number was updated. Row 28's insertion then moved every row below SP8c down by one again, so the numbers those eight rows hold after it are time candy 10, battlebots 11, SP9 12, SP3b 13, SP10 14, SP4c 15, SP5 16 and reconciliation 17. Row 29's insertion then moved every row below SP3b down by one more, so the numbers they hold today are time candy 10, battlebots 11, SP9 12, SP3b 13, SP10 15, SP4c 16, SP5 17 and reconciliation 18. | D32, then D41, then D39 |
| 7 | The audit's **fold-ins** are added as one sentence inside each entry: C01, C05, C04, C02, C03, C06 into entry 1; C19, C21, C20 into entry 4; SP8b deferral D5 into entry 8; C25 into entry 11; C26, C27 into entry 12; C28, C29, C30 into entry 16. | audit 3.2 |
| 8 | The **State column is corrected**: entry 1 is at tasks 1-11 committed with 12-15 remaining; entry 4's plan is written; entries 5, 6 and 7's specs are approved; entry 11's plan is written and is its approval record; entry 13's spec is written. | this amendment |
| 9 | Entry 11's **State cell no longer contradicts its spec header**: the plan is named as the approval record, the entry's paragraph says the header's "draft" line is superseded, and section 5 gains the plan-approved-entry rule with entry 11 as its precedent. | audit 3.3, C14, D32 |
| 10 | Section 3 gains the note that **three of the four allocated packs are not in `content-custom/pack/`**, that the guard compares a pack to itself, that the production build is likely already failing, and that entry 3 pins them with a `packIds.test.ts` before entries 10 and 11 append. The Entry column now names entries rather than bare numbers. **No id changed.** | audit 3.3, C22 |
| 11 | Section 4 is rewritten from an open question into **the ruling as made**, carrying the audit's three added facts and naming SP3b as the completion entry, plus the correction that the session trackers belong to SP2. | D14 |
| 12 | Section 5 gains the **styleguide exemption**. | D12 |
| 13 | Section 5 gains a pointer to **`docs/VERIFICATION.md` once it lands**, with what to do until then. | audit 3.3, C12 |
| 14 | Section 5 restates **"never a plain `npm run build` in `web/`"** as the e2e case it actually is, since `scripts/build.ps1` does exactly that and is right to. | audit 3.3, C12 |
| 15 | Section 5 states **both vendoring shapes** (inline header for a file, `PROVENANCE.md` for a bundle) instead of one. | audit 3.3, C33 |
| 16 | Section 5 replaces **"delete the ledger"** with the promotion rule. | D19 |
| 17 | Section 6 gains a fourth step for a plan-approved entry. | D32 |
| 18 | This section. | D32 |
| 19 | The **header gains a paragraph under Supersedes** recording the amendment, the six new rows and the renumber, and pointing at this section. | D32 |
| 20 | **Section 1's closing sentence** is rewritten from "the shell redesign is now second, ahead of everything except finishing SP4b. Reasons in entry 2." to name the two remediation rows now ahead of it and point at entry 4. | D32 |
| 21 | **Entry 1 gains its landing step**, spelled out as three deploy changes: C07's fix to the deploy files, the `cloudflared.yml` commit, and D15's two riders. **Entry 2 stops claiming C07 and C08 as its own** and says it asserts them. | D15, D30, D35 |
| 22 | **Entry 4's UI count** corrected from four entries to five, with entry 13's pages and panel section added to the list its own next bullet already named. | this review pass |
| 23 | **Entry 4's inherited plan edits** corrected from two to four, naming the `--window` token and the four tasks that carry them. | D29 |
| 24 | **Entry 11 gains the `server-data` volume** as named scope, since D33's R9 gives it to whichever of entries 11 and 13 lands first and entry 11 is that entry. | D33, D36 |
| 25 | **Entry 18 gains the authority specs whose Placement lines still name pre-renumber entry numbers** that now collide with other live rows. Four when the row was written; three today, since row 28 corrected the battlebots spec's header as it renumbered. | D32, D36 |
| 26 | **Section 5's authority rule is restated as three shapes** (spec, plan, adopted audit sections) so entries 2, 3 and 18 have a named authority rather than an unstated exception, with rows 12 and 15 marked grandfathered; **section 6 gains a fifth step** for the audit remediation shape. | D34 |
| 27 | This preamble and rows 19 to 27. | D34 |
| 28 | Section 2 gains **entry 9, Camera, frame and renderer**, inserted after entry 8 on the owner's instruction, and **old entries 9 to 16 become 10 to 17**. Its paragraph, and every cross-reference in this document, are written against the new numbering; the pack-id table in section 3 is pinned by name and its ids are untouched. Entry 17's stale-Placement list drops the battlebots spec, whose header was corrected to entry 11 by this change. The same renumber was applied to `sprint-control.md`, the four files under `docs/ideas/`, `docs/README.md` and `2026-09-07-battlebots-minigame-design.md`. | D41, amending D40 |
| 29 | Section 2 gains **entry 14, Battlebots 2: puppets, queue and replays**, inserted immediately after entry 13 (SP3b) because it registers the win-streak category into that entry's registry, and **old entries 14 to 17 become 15 to 18**. Its paragraph, and every cross-reference in this document, are written against the new numbering; the pack-id table in section 3 is pinned by name, its ids are untouched, and this entry allocates none. Entry 13's paragraph gains D44's requirement on its unwritten plan. The same renumber was applied to `sprint-control.md`, `2026-09-07-sprint-legends-quest.md`, the files under `docs/ideas/`, `docs/README.md` and the Battlebots 2 spec's own Placement line. Entry numbers cited in D1 to D57 are as of their date, D58 records that, and this section is the map. | D39, with D43 to D55 |
| 30 | **Entry 9's Authority and State cells are corrected now that its spec exists**: the Authority cell names `2026-09-07-camera-frame-and-renderer-design.md` as the authority over the idea file rather than reading "(being written)", and the State reads "spec written and approved under D11 and D41" rather than "spec in progress", with its two cross-entry rulings recorded as D56 and D57. No row moved and nothing renumbered. | D41 |
| 31 | **Entry 2's row is closed.** Its State cell reads done at 2026-09-07 with tasks 1-12 clean, the whole-branch review and its fix wave done, `verify.ps1` green at `f945e28` and the ledger promoted to `docs/superpowers/ledgers/2026-09-07-release-integrity-and-account-isolation.md`; its Authority cell gains the plan the entry actually ran from, matching entry 1's shape. Audit rows C07, C09, C10, C16, C17 and C18 are closed, each with what it left open recorded in the ledger rather than implied, and the audit itself is not rewritten: its new Remediation status block points at the ledger instead. No row moved and nothing renumbered. | D92, under D11 |
| 32 | **Two sentences this document wrote about entry 3's own ground are corrected.** Entry 3's paragraph and section 3 both said the engine Dockerfile's plain `npm run build` is very likely already failing in production. It was replaced by `RUN npx tsx tools/pack/BuildOverlay.ts` in `ca8ef86` under D73 and D74, twenty three minutes after this document landed (`d4431af` 14:12:02, `ca8ef86` 14:35:25), so the claim was true when written and false by the time anybody read it. Both are rewritten to say so and to keep the adjacent `BUILD_VERIFY=false` sentence, which is still true because `WorldConfig.ts` returns before any `BUILD_*` variable is read. Per D97 the audit itself is not rewritten. | D97, audit C22 |
| 33 | **Section 3's "three of the four allocated packs are not in `content-custom/pack/`" is now past tense.** Entry 3 pinned `obj.pack`, `inv.pack` and `loc.pack` on 2026-09-08 with manifest entries, added `*.pack text eol=lf` to `.gitattributes`, put the table into code at `engine-custom/src/idlescape/packIds.ts`, and gated it with `packIds.test.ts` and a `checkPack` call on both `packAll` paths. **No id changed.** The six allocated ids stay asserted conditionally until entries 10 and 11 append. | D97, audit C22 |
| 34 | **Entry 3's row is closed.** Its State cell reads done at 2026-09-08 with ten tasks clean, the whole-branch review and its fix wave done, `scripts/verify.ps1` green at `c391c81` and the ledger promoted to `docs/superpowers/ledgers/2026-09-07-overlay-pack-and-client-fork-gates.md`. Audit rows C22, C23 and C24 are closed **with residue**, the residue listed in that ledger's "What this entry does not close" section rather than implied, and the audit itself is not rewritten: its Remediation status block points at the ledger. `map.pack` stays unpinned per D116, and the same sentence's `vars.pack` does not exist at the 274 pin; both are entry 11's to resolve. No row moved and nothing renumbered. | D115, D116, under D11 |
| 35 | **Entry 4's row records the end of block A, not the end of the entry.** Its State cell reads block A (tasks 1-10) done 2026-09-08 at `31c63d4` with `scripts/verify.ps1` green, and block B (tasks 11-21) next. The entry stays open: the fable whole-branch review, the fix wave and the ledger promotion all belong after task 21, so no ledger is promoted here, no audit row moves, and C19, C20 and C21 stay open. The block boundary is the one the plan's own executor notes name, under the heading "Should this be two plans?": "the split is the orchestrator's call. If it is made, the boundary is after Task 10 and Task 21 belongs to the second plan." Block A shipped the token layer, the seventeen-file stylesheet layer with the rule that keeps it split, the retirement of the `.p-*` dialect, the five component families and their builders, the frame chrome, the drawn icon set with the manifest narrowed to it (G7), and the three structural migrations (G6, G5, G4). No row moved and nothing renumbered. | the plan's executor notes, under D11 |
| 36 | **Entry 4's row is closed.** Its State cell reads done at 2026-09-09 with 21 tasks clean in two blocks, the whole-branch review and its fix wave done, `scripts/verify.ps1` green at `18d7e17` and the ledger promoted to `docs/superpowers/ledgers/2026-09-07-shell-v2.md`; its Authority cell now names the plan, which the entry ran from and which the spec's own row 6 of section 7 made the winner over the companion spec. Row 35's block A cell is superseded rather than kept beside it. Audit rows C19, C20 and C21 are **left open** with what this entry did close named in that ledger's close-out, and the audit itself is not rewritten: its Remediation status block points at the ledger, which is the shape entries 2 and 3 set. The companion spec gains its "what actually shipped" section. No row moved and nothing renumbered. | the plan's executor notes, under D11 |
