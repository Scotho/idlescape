# Idlescape - autonomous handoff: SP4b through SP4c

**Written 2026-09-06 at commit `2a9ae81` on `feat/platform-shell`, with `verify.ps1` green.**

This is the instruction sheet for the session that finishes the remaining task list. It is a
companion to `2026-09-05-idlescape-roadmap-and-handoff.md`, not a replacement: that document
still owns the sub-project table, the conventions and the credits policy, and its section 4 is
the authority on what each remaining sub-project delivers and what it depends on. Read it.

This document adds what that one could not know: what is now built, what the last five
sub-projects taught about how this codebase fails, and where your judgement is wanted versus
where you must stop and ask.

---

## 1. How to work

Proceed autonomously. Do not pause between tasks for approval, do not ask "shall I continue",
and do not summarise progress for its own sake. The sequence below is the whole assignment.

**Per sub-project:** run `superpowers:writing-plans` against its spec to produce a plan under
`docs/superpowers/plans/`, then execute that plan with `superpowers:subagent-driven-development`
- a fresh implementer per task, a task review after each, fix rounds until clean, a ledger at
`.superpowers/sdd/<plan-basename>/progress.md`, then a final whole-branch review, one fix wave,
then `npm run verify`. Delete the plan's ledger directory when its final review is clean.

**Rulings, not stalls.** Conflicts between two task briefs, a brief that contradicts the spec, a
plan defect, an ambiguity - decide them and record the ruling in the ledger with what it costs if
wrong. The spec is the binding authority and the plan is its argument; where they disagree, the
spec wins. Both times two briefs contradicted each other in SP8b, the spec settled it cleanly.

**Four things stop you and only these:** an irreversible or destructive operation; a
security-sensitive action; a side effect outside this repo that norms say you ask about first (a
push to a shared branch, a deploy, a publish); and a plan so broken that every path forward is a
guess. Deploy in particular stays owner-gated: nothing touches the live Lightsail host, the
production engine or Firebase cloud resources until the owner asks.

**Model tiers.** Opus is the ceiling; there is no higher tier available. Use it for architecture,
concurrency, lifecycle work, the final whole-branch review and any fix round carrying a Critical.
Use Sonnet for tasks whose plan text already contains the code, for mechanical single-file work,
and for scoped re-reviews of small diffs. Always name the model explicitly when dispatching.

**Branching.** Everything lands on `feat/platform-shell`. Sub-projects do not get their own
long-lived branches, so there is no finishing menu to answer per sub-project - the work is
already integrated when it merges. Per-task worktrees under `.claude/worktrees/` are fine and
useful, with the hard rules in section 4.

---

## 2. Where things stand

**Done and verified:** SP1, SP1b, SP2, SP3, SP4a, SPW, SP6, SP7, SP8, SP8b. The acceptance gate
passes end to end: engine overlay and drift, server 181 tests, web 791 tests across 82 files,
firebase rules, build, and 21 Playwright tests against a stack `verify.ps1` brings up itself.

**The stack is currently down.** `verify.ps1` stops everything it starts. Bring it back with
`npm run dev` (PowerShell, `scripts/start-stack.ps1`); it takes about two minutes. Ports: front
8787, engine 8899, engine management 8897, emulators 9099 and 8080.

**Not started, and not in the sequence below:** SP5 (tier 2 plugins needing scene projection, and
the headless LiteClient runner). It is still in the roadmap's table and still wanted; it is simply
not in the owner's current ordering. Raise it when SP4c is done rather than silently dropping it.

---

## 3. The sequence

Run these in order. Each entry gives the first concrete step, because that is where a fresh
session wastes the most time.

### SP4b - bot expansion and the Tutorial Island script

**Spec:** `docs/superpowers/specs/2026-09-06-sp4b-bot-expansion-design.md`, approved with its
twelve owner decisions. **First step: write the plan.** There is no plan file yet.

Eight work items. The owner's own framing, quoted in the spec, is a real expansion of the bot
system with the Tutorial Island script riding on top of it rather than beside it: camera panning
to find resources, general pathing knowledge of where resource clusters are, state detection and
recovery after failures, better UI showing the current run and past runs, per-script toggles, and
actual testing once it works. Tutorial Island is item 8 and has its own section 4.

Two carry-ins from SP4a that this sub-project owns: the collision generator and global A* that
SP4a deferred (SP4a's `walkTo` is local-only, so a script that needs a real path currently refuses
its requirement), and the task-scoped abort for `wait.*` and SDK actions.

### SP8c - the game client's half of the bank tabs

**Spec:** sections 7 and 8 of `2026-09-05-sp8b-web-bank-design.md`. **First step: write the plan.**

Split out of SP8b because SP8b was forbidden from touching `engine-custom/` and `content-custom/`.
A tab-range draw plus divider lines in `Client.ts`, the `bank_main.if` tab components and
`bank.rs2` handlers in `content-custom/`, then drag-to-tab and in-game search. Owner decision 3
keeps the sort helpers in the web UI and out of the client. Client patches continue from 28.

Sequencing judgement: SP8c is small and independent of SP9. Take it whenever it fits; before SP9
is the natural slot, since it closes out the bank while that context is fresh.

### SP9 - Contracts

Economy database, escrow settlement, market queries, web UI, agent tools and policy. Depends on
SP8 and SP4. **Read section 12 of the SP8b spec first** - it is the account of what SP8b actually
built versus what it was designed to build, and SP9 inherits from the built thing.

What SP9 inherits concretely: the menu registry (`createMenuRegistry` / `contractsStubs` in
`web/src/bank/contextMenu.ts`) and the two entry ids `sell` and `buy`, shipped disabled with
"Contracts coming soon", plus the `MenuItemContext` those entries receive. SP9 registers over both
ids and owns tradeability itself, because it owns the escrow. Agent-side item movement goes
through `server/src/engine/managementClient.ts`, never the human-only `/api/bank` routes.

### SP10 - wealth hiscores

Raw coin and estimated wealth on the SP3 tracker. Depends on SP8, SP9 and SP3. The alch-value
arithmetic the bank already uses is `alchValue = max(floor(cost * 6 / 10), 1)` in
`engine-custom/src/idlescape/ops.ts`; a noted item carries its base item's cost through
`ObjType.toCertificate()`, which matters for any wealth estimate that walks a bank.

### SP4c - the gateway

The `/tab` registry, relay, schema, modes and rate limits; `runs.db`; the tutorial run driven
through MCP. Defined in section 468 onward of
`docs/superpowers/specs/2026-09-05-sp4-tasks-scripting-environment-design.md`.

---

## 4. What this codebase does to you

These are not general engineering tips. Each one cost real time in the last two sub-projects, and
several were invisible to a full review until something outside the test harness caught them.

**Tests that cannot fail are this project's characteristic defect.** Nine distinct instances were
found and fixed in SP8b alone. The shapes repeat:

- A fixture that makes right and wrong identical. A focus test that used slot 0 - the one slot
  where the bug was invisible - led a careful reviewer to declare buggy code correct. A keyboard
  test where every fixture made index and slot the same number survived a mutation that would
  break every real tab.
- A dishonest fake. Every composed view test used a fake store that accepted every operation,
  while the real store clamps endpoints and refuses cross-tab inserts. Replacing it with an honest
  fake immediately failed four tests that had been asserting moves the engine would never make.
- A harness the environment cannot run. jsdom has no `document.elementFromPoint` and no
  pointer-events model, so ten composed drag tests never executed at all and a context menu
  shipped completely unclickable with a mouse.
- A redundant second owner. Two mechanisms handling one case, where the second silently corrects
  the first's bugs and the tests that should catch them pass. Removing the duplicate turned two
  decorative tests load-bearing at zero coverage cost.

**So: mutate, do not read.** When a review says a behaviour is covered, break the behaviour and
watch the test fail. Require a mutation-to-test table from fix rounds. When a test asserts only
the absence of something - no timers armed, nothing rendered - it is probably not testing what
its name says.

**Teardown is where this project leaks.** Five lifecycle leaks shipped in SP8b, four invisible to
tests that looked like they covered the case. Two rules, both earned:

1. A test asserting only that no timer remains is not a teardown test. Assert that no callback
   fires and no state is written after disposal.
2. A `dispose()` is not enough when the module also schedules async work. Disposal must fence what
   is already in flight, not merely unsubscribe from what comes next. This took three different
   shapes in three modules: a generation ticket, an epoch counter, and a flag checked inside a
   queued microtask.

**Focus ownership.** Settled rule, arrived at after three bugs: a module that calls
`replaceChildren` on nodes it owns restores focus within its own subtree, and the composing view
handles only the cross-module case. The grid restores the slot the player was on; the tab strip
restores the roving tab. That asymmetry is deliberate - a grid's focus is independent of
selection, a tablist with automatic activation is not - and both directions are pinned by
mutation, so an edit that "makes them consistent" fails loudly.

**Proving a server is current.** Assert on a route's own behaviour, never on a status code an auth
layer can emit before routing. `/api/zzz` returns 401 exactly like a real route does. That
mistake hid a genuinely broken SSE fan-out for hours and made every browser run exercise only the
polling fallback.

**Worktrees will eat your dependencies.** `git worktree remove` follows `node_modules` junctions
and empties the main tree's installs - plain `remove`, not just `--force`. Unlink from PowerShell,
verify nothing remains, then remove one worktree at a time. Recovery is `npm ci` in `web/` **and
`firebase/`** plus `bun install` in `server/` and `client/`. Do not forget `firebase/`: nothing
exercises it until `verify.ps1` step 5, so a partial recovery looks complete for hours.

**Branch worktrees from trunk, not from a sibling task.** Twice in SP8b an implementer patched a
stale copy of an already-merged file because its worktree was cut from another task's branch.
Both cost a round. And when a ruling quotes a line number or a function name, quote it from the
branch the implementer is actually on.

**Smaller traps, each of which passed review once:**

- `tsconfig` excludes `src/**/*.test.ts` but not `*.harness.ts`. A vitest import in a harness
  pulls its ambient types into the shipped program and breaks unrelated files.
- Any hand-dispatched pointer event must set `buttons`, or the input layer's abandoned-drag guard
  ends the gesture before it starts and the test passes vacuously.
- A non-cancelable `KeyboardEvent` swallows `preventDefault()` silently, so a test written that
  way asserts the opposite of browser behaviour.
- `setupDom.ts` runs once per file, not per test. Any test that mounts into `document.body` needs
  an explicit reset or it asserts against its predecessor's DOM.
- Anything interactive inside a `pointer-events: none` host must opt back in, or its clicks fall
  through to whatever is behind it.
- Run Playwright from `web/`, never the repo root, where it reports "No tests found".
- `pwsh` is not installed. Windows PowerShell 5.1 only: no `&&`, no ternary, no `?.` or `??`.
- Never a plain `npm run build` in `web/`; `build:e2e` is the allowed one.

---

## 5. Constraints that do not move

From the roadmap's section 5, still binding: strict TypeScript, no new `as any`, files under 400
lines (test files included; split rather than trim comments), `types.ts` per package,
`.env.example` per process, conventional commits, upstream clones never edited and pinned in
`scripts/upstream.lock`, vendored code under `vendor/` with its license and a `PATCHES.md`.

Additions from SP8:

- `engine/` and `engine/content` are pinned clones and are never edited. Changes go in
  `engine-custom/` and `content-custom/` as overlays, applied by `scripts/engine-overlay.ps1`,
  with every patch documented in `engine-custom/PATCHES.md` behind an anchored grep.
- The vendored client fork is edited only through numbered patches recorded in
  `client/PATCHES.md`, each with a grep that proves it is still applied. Numbering is at 28.
- No Jagex art is vendored. Item icons are rasterised at runtime by the game client and reach the
  web through the hooks added by client patch 28.
- Commit trailers: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` and
  `Claude-Session: <this session's URL>`. Use `git -c core.safecrlf=false commit` and explicit
  `git add <paths>`, never `git add -A`.

---

## 6. Done means

For each sub-project: its plan's tasks all implemented and reviewed, the final whole-branch review
returning ship, one fix wave, `npm run verify` green end to end, the plan's ledger directory
deleted, and the spec reconciled with what actually shipped. That last step is not paperwork -
SP8b's spec section 12 is what SP9 inherits from, and a spec that still describes the design
rather than the build will mislead the next sub-project.

Record deviations where a reader of the spec will find them, in the spec's own voice. Where a
deviation makes an existing sentence wrong, fix that sentence rather than leaving a correction
standing next to a contradiction.

When SP4c is done, the remaining known work is SP5, the SPW authoring backlog (authoring phases,
bearer auth, sprites and dialogue), and whatever the owner adds. Say so rather than stopping
silently.
