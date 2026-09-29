# idlescape - what it is, and what decides its arguments

Written 2026-09-07 on `sprint/dragon-slayer`, read at commit `30efd94`.

## What idlescape is

idlescape is a private, self-hosted 2004 RuneScape world in which **playing it by hand, scripting
it, and letting Claude play it are all first-class**. None of the three is a bolt-on to the others.

Concretely: a pinned clone of the Lost City TypeScript engine (RuneScape 2 build 274, November
2004) and a forked TypeScript browser client, wrapped in a Vite shell and a Bun front server, with
Firebase for identity, an engine overlay that gives one human owner a bank shared across their
characters, a wiki corpus generated from the game's own content, an agent runtime that runs player
scripts and Claude's actions in a Worker beside the game canvas, and a single Lightsail box that
serves the whole thing at `osrs.scotho.com`.

The word that matters is **private**. This is one owner's world. There is no player base to
protect, no economy to defend against botting, and no anti-cheat story: a script driving a
character is the intended use, not an abuse of it. Every design argument that turns on "but players
would exploit that" is settled by that sentence.

## Who it is for

- **The owner**, who wants to log in and play, and who steers the project by direction rather than
  by writing code (see the operating model below).
- **Agent sessions**, which are the only thing that writes code here. Every document in this
  repository is written to be read cold by a session with no memory of the last one.
- **Scripts**, both the bundled library under `web/src/tasks/library/` and the ones a player writes
  in the shell. They see the same API Claude sees, because there is one runtime.

## The principles that decide arguments

When two reasonable designs disagree, these settle it. They are stated as rules because each has
been paid for at least once.

1. **The pinned clones are never edited.** `engine/`, `engine/content/`, `web/src/vendor/` and
   `client/src/vendor/` are upstream, pinned by sha in `scripts/upstream.lock`, and recreated by
   `scripts/setup.ps1`. An edit to one of them is silently lost on the next checkout.
2. **Overlays and numbered patches instead.** Engine changes live in `engine-custom/` and are
   applied by `scripts/engine-overlay.ps1` against a manifest of upstream blob hashes. Content
   changes live in `content-custom/`, same shape. The forked game client is changed only through
   numbered patches recorded in `client/PATCHES.md`, each with a grep that proves it is still
   applied. The mechanism exists so a revision bump fails loudly instead of quietly reverting work.
3. **Everything verifiable, and the gate must not lie.** A change is done when a command says so,
   and that command has to be capable of failing. This project's characteristic defect is the test
   that cannot fail: a fixture where right and wrong look identical, a fake looser than the real
   store, a harness the environment cannot run. So: mutate, do not read. Break the behaviour and
   watch the test fail. `docs/VERIFICATION.md` owns what to run and what a green means, including
   the greens that are currently too generous.
4. **The sandbox.** Script code never runs on the main thread. It runs in a Worker with a scoped
   transport, and every action it takes crosses `postMessage` as RPC into a transport the host owns
   (`web/src/agent/worker.ts:1-3`, `web/src/agent/workerHost.ts:1-4`). That boundary is what makes
   running someone's code beside a live character ordinary rather than risky, and it is why a
   headless runner and an MCP gateway can be added later without a second execution model.
5. **The design system decides the UI.** Panels compose the existing class families and tokens in
   `web/src/styles/`; a surface that needs something new adds it to the library and to
   `web/styleguide.html` in the same change, never as a per-panel one-off. The `idlescape-design`
   skill is the front door; the vendored bundle under `docs/design/idlescape-shell-v2/` is the
   authority on every literal value.
6. **Files under 400 lines.** Test files included. Split rather than trim the comments: the
   comments in this codebase carry the rulings. `web/styleguide.html` is the one exemption
   (decision D12).
7. **Rulings, not stalls.** An agent that hits an ambiguity decides it, records the decision with
   what it costs if wrong, and keeps going. See the operating model.

## What is deliberately out of scope

- **Anti-detection, anti-ban and evasion.** The server is ours. There is nothing to evade
  (decision D10).
- **A multiplayer world at scale.** The site is open to any visitor, with no password in front of
  it, but characters belong to Firebase accounts, guests get two and registered users three, and
  scaling is not a design input.
- **Jagex art.** No original art is vendored. Item icons are rasterised at runtime by the game
  client and reach the web shell through client patch 28.
- **Upstream's gameplay patches.** rs-sdk's 25x XP, no random events, infinite run and removed
  auto-bans are explicitly not wanted; only its observation and action layers are vendored.
- **React and any component framework.** Production code is Vite plus vanilla TypeScript with
  `h()` and token-driven CSS. The design bundle's `.jsx` files are specifications, not code.
- **A second execution model for scripts.** One runner, two callers. The browser runner is the
  runner; `/mcp` (SP4c) reaches it through a `/tab` socket rather than running code itself.
- **Renaming live infrastructure.** The project had an earlier name until 2026-09-05, and the author's own deployment still answers to it. In this public copy every identifier reads idlescape, except the `cs.` `localStorage` prefix, which is a data contract. Each rename is a migration, not a
  find-and-replace. See `docs/OPERATIONS.md`.

## The operating model

**The project is built entirely by autonomous agent sessions.** That is not a description of how
some of the work happens; it is how all of it happens, and the documents are shaped around it.

**The owner gives direction, guidance and encouragement, and rules only on clear blockers.** In
practice that is three things: a side effect outside this repository (a release, a cloud change, a
push to a shared remote), an irreversible deletion, and a plan so broken that every path forward is
a guess. Everything else the agent decides. The owner's standing authorisation is decision D11:
"you do not need my permission if confident proceeding. Only gated on clear blockers."

**Agents make rulings rather than stalling, and record them.** A ruling that matters only inside
one sub-project goes in that sub-project's SDD ledger and is promoted with it. A ruling that
crosses entries or touches policy goes in `docs/superpowers/decisions.md`, append-only, with who
made it, why, how reversible it is, and whether the owner should be consulted. The rule exists
because rulings were being lost: eleven of the project audit's thirty-four findings are that one
durability problem wearing different clothes.

**How a sub-project runs.** Brainstormed to a spec under `docs/superpowers/specs/`; planned with
`superpowers:writing-plans` into a plan under `docs/superpowers/plans/`; executed with
`superpowers:subagent-driven-development`, a fresh implementer and a fresh reviewer per task with
fix rounds until clean; then a whole-branch review, one fix wave, `npm run verify` green end to
end, and a "what actually shipped" section written back into the spec. That last step is not
paperwork: the next sub-project inherits from the built thing, not the designed one.

**The board and the order.** `docs/superpowers/sprint-control.md` is the live board: running
workflows, the queue with prerequisites, and the gates awaiting the owner. The sprint spec
`docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md` owns the build order. An entry needs an
approved spec before it gets a row; a row without a spec is a wish.

**Where knowledge lives** (decision D21, one fact in one place): procedures in the skills under
`.claude/skills/`; structure in `docs/ARCHITECTURE.md`; the environment facts several skills share
in `docs/OPERATIONS.md`; the SDD convention itself in `docs/superpowers/SDD.md`. Machine-local
memory keeps only session-scoped state, because a fresh clone cannot see it.

Start at `docs/README.md`.
