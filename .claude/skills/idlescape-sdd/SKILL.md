---
name: idlescape-sdd
description: Use when opening, keeping or closing a plan ledger - starting a sub-project's SDD workspace, recording a ruling instead of stalling, writing a task brief or report, or promoting a finished ledger into docs/superpowers/ledgers/. Use it before the first dispatch, not at close-out.
user-invocable: true
---

# Keeping an SDD ledger

Every sub-project runs the same loop: a plan, a fresh implementer per task, a fresh reviewer after
each, fix rounds until clean, a whole-branch review, one fix wave, `npm run verify`, and a record
that survives. This skill is about the record.

The failure mode it exists to prevent: **rulings were being lost.** Eleven of the project audit's
thirty-four findings are that one problem. Nine ledgers were deleted under the old "delete at close"
rule, one 423-line handoff exists only to hand-reconstruct one of them, and three still-open items
survive nowhere but in git-ignored scratch.

## Read first

- `docs/superpowers/SDD.md` - **the authority.** Directory layout, `progress.md` sections and which
  survive promotion, when a ruling is recorded rather than escalated, the close-out sequence, the
  ledger naming rule, the vendoring rule, and the ledger template.
- `docs/superpowers/specs/2026-09-06-sprint-handoff.md` sections 1, 4, 5 and 6 - how to work, what
  this codebase does to you, the constraints that do not move, and what "done" means. **Its `:25`
  and `:228-230` still say "delete the ledger"; that wording is superseded by decision D19.**
- `docs/superpowers/decisions.md` - where a cross-entry ruling goes, and the shape of an entry.
- An existing promoted ledger as the model: `docs/superpowers/ledgers/2026-09-05-sp2a-plugin-framework-core.md`.

## Rules that are not negotiable

- **The workspace is `.superpowers/sdd/<plan-basename>/` and it is git-ignored scratch.** The record
  is `docs/superpowers/ledgers/<plan-basename>.md` and it is tracked.
- **A committed file never cites a workspace path.** A fresh clone does not have one. Cite the
  ledger. Five in-repo citations to deleted or misnamed workspaces were found on 2026-09-07,
  including one in production code.
- **The ledger is named after the plan, exactly.** No re-slugging. The mismatch between plan
  `2026-09-04-idlescape-platform.md` and a workspace slugged under the project's earlier name produced three
  broken citations on its own.
- **Promote, then remove.** The workspace is deleted only after the ledger is committed. Deleting a
  ledger before its sub-project's final review is clean is an owner-gated action (board gate G6).
- **The promoted ledger is under 400 lines.** The existing eight run 39 to 210.
- **Rulings, not stalls.** Decide, record what it costs if wrong, continue. Four things stop you and
  only these: an irreversible or destructive operation; a security-sensitive action with no
  precedent; a side effect outside this repository; a plan so broken that every path is a guess.
- **The spec is the binding authority and the plan is its argument.** Where they disagree the spec
  wins, unless the sprint entry names the plan as the winner. Sprint entry 5 does exactly that, with
  sixteen rulings.
- **Every fix round produces a mutation-to-test table.** Change X, this test must fail, did it.

## Working modes

### Opening a workspace

```
.superpowers/sdd/<plan-basename>/
  progress.md
```

Start `progress.md` with the pre-flight scan: which task pairs share a file or an interface, and any
per-task self-consistency problem you can see before the first dispatch. Record the pre-flight
rulings that come out of it. Both cost minutes and have saved rounds.

### Running a task

Write `task-<N>-brief.md` before dispatching and keep it verbatim. When the implementer returns,
write `task-<N>-report.md` with what it says it did and its gate output. Save each reviewer's range
as `review-<base>..<head>.diff`, named by the commit range, so a later reader can reproduce exactly
what the reviewer saw. Append the outcome to `progress.md`'s Progress section: dispatched,
implemented, reviewed, fix rounds, commit sha, gate output.

When a worktree is involved, read the junction hazard in `docs/OPERATIONS.md` first, and branch a
worktree from trunk rather than from a sibling task's branch: twice in SP8b an implementer patched a
stale copy of an already-merged file for exactly that reason.

### Recording a ruling

In `progress.md`, under Rulings, with three parts: the decision, why, and **what it costs if wrong**.
If it crosses sprint entries, changes a constraint, or is a product call the owner might want back,
append it to `docs/superpowers/decisions.md` as well, with who made it, reversibility, and whether
it wants consultation. When in doubt, both places.

### Closing out

In this order, from `docs/superpowers/SDD.md` section 6:

1. All tasks implemented, reviewed, fixed to clean.
2. Whole-branch review returns ship; one fix wave.
3. `npm run verify` green end to end.
4. The spec gains its **"what actually shipped"** section, in the spec's own voice, fixing any
   sentence the build made wrong rather than leaving a correction beside a contradiction.
   `2026-09-05-sp8b-web-bank-design.md` section 12 is the model.
5. Condense `progress.md` into `docs/superpowers/ledgers/<plan-basename>.md`, under 400 lines,
   using the template's section order: Rulings, Deferred, Traps recorded, Measured facts, Per-task
   table.
6. Commit the ledger **with the closing commit**.
7. Update `docs/README.md` if the authority for a subject moved.
8. Only now, remove the workspace.

A measurement a spec gated on is not a ledger entry: it goes in `docs/superpowers/measurements/`
and is linked from the index.

## Verification

The ledger is correctly closed when all of these are true:

```powershell
Test-Path docs\superpowers\ledgers\<plan-basename>.md          # exists
(Get-Content docs\superpowers\ledgers\<plan-basename>.md).Count # under 400
git log -1 --name-only                                          # the ledger is in the closing commit
git grep -n "\.superpowers/sdd/<plan-basename>" -- ':!.superpowers'   # returns nothing
Test-Path .superpowers\sdd\<plan-basename>                      # False, removed last
```

And the spec carries its "what actually shipped" section. That last one is the check that keeps
getting skipped: the convention is honoured once in eleven opportunities across this repository's
history, and the practical cost is measurable today in `docs/README.md` section 3.
