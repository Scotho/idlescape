# The SDD convention

How a sub-project keeps its working record, and how that record survives the sub-project. Written
2026-09-07, from decision D19 and project audit section 4.6.

This convention is the fix for the single most expensive failure mode in this repository: **rulings
were being lost.** Eleven of the audit's thirty-four confirmed findings are that one problem. The
old rule said "delete the plan's ledger directory when its final review is clean"; nine ledgers were
deleted, one 423-line handoff exists only to hand-reconstruct one of them, and three still-open
items survive nowhere but in git-ignored scratch. The new rule is **promote, then remove.**

---

## 1. The two places

| | Path | Tracked? | Lifetime | Purpose |
|---|---|---|---|---|
| **Workspace** | `.superpowers/sdd/<plan-basename>/` | No, git-ignored | While the sub-project runs | Scratch: briefs, reports, diffs, the running progress log |
| **Ledger** | `docs/superpowers/ledgers/<plan-basename>.md` | Yes | Forever | The record: rulings, deferrals, traps, measured facts |

A workspace is a workbench. A ledger is what the next session reads. **A committed file must never
cite a workspace path**, because a fresh clone does not have one; cite the ledger instead. The
check that enforces this is in `docs/README.md` section 7.

## 2. Workspace layout

```
.superpowers/sdd/<plan-basename>/
  progress.md                     the running log; the source the ledger is condensed from
  task-<N>-brief.md               what the implementer was told, verbatim
  task-<N>-report.md              what the implementer says it did, and its gate output
  review-<base>..<head>.diff      the exact range each reviewer read
  merge-report.md                 optional: how a merge or rebase was resolved
```

Naming is not decorative. The review diffs are named by their commit range so that a later reader
can reproduce exactly what a reviewer saw, which is what settled two SP8b disputes about whether a
finding was real. The brief and the report are kept as a pair so a bad outcome can be traced to a
bad brief rather than blamed on the implementer.

## 3. `progress.md`, section by section

| Section | What goes in it | Survives promotion? |
|---|---|---|
| **Pre-flight scan** | Task pairs that share a file or an interface; per-task self-consistency notes taken before any dispatch | No, unless a pre-flight ruling turned out to matter |
| **Pre-flight rulings** | Decisions made about the plan before execution started | **Yes** |
| **Progress** | Per task: dispatched, implemented, reviewed, fix rounds, commit sha, gate output | Condensed into the per-task table |
| **Rulings** | Every decision made instead of stalling, with what it costs if wrong | **Yes, in full** |
| **Deferred / parked / carry-forward** | Anything named and not done, with where it should land | **Yes, in full** |
| **Traps recorded** | What this codebase did to the session that the next one should not rediscover | **Yes** |
| **Measured facts** | Counts, timings, gate results that a later document might want to cite | **Yes** |

The rule for the boundary: **anything a future session would have to re-derive survives; anything
that was only about running this plan does not.** A stalled dispatch, a retry, a model choice: no.
A ruling, a deferral, a trap, a number: yes.

## 4. Rulings: recorded, not escalated

This is the convention the project leans on hardest and has never written down. State it plainly.

**When you hit an ambiguity, decide it and keep going.** A conflict between two task briefs, a brief
that contradicts the spec, a plan defect, a missing detail: rule on it, write the ruling in
`progress.md` with the reason and **what it costs if wrong**, and continue. The spec is the binding
authority and the plan is its argument; where they disagree, the spec wins, unless the entry itself
names the plan as the winner (sprint entry 5 does exactly that, with sixteen rulings).

**Four things stop you, and only these:**

1. An irreversible or destructive operation (deleting player data, `.sav` files, owner-bank JSON, or
   a ledger before its sub-project's final review is clean).
2. A security-sensitive action with no precedent in the repository.
3. A side effect outside this repository: a release, a cloud change, a push to a shared remote.
4. A plan so broken that every path forward is a guess.

**Where the ruling goes.** Inside one sub-project: `progress.md`, promoted with the ledger. Crossing
entries, changing a constraint, or making a product call the owner might want back: also
`docs/superpowers/decisions.md`, append-only, with who made it, why, how reversible it is, and
whether it wants consultation. When in doubt, both places; a duplicated ruling is cheap and a lost
one is not.

## 5. The mutation-to-test table

Every fix round produces one, and a review that claims a behaviour is covered is not finished
without one. Three columns:

| Change I made to break it | The test that must fail | Did it? |
|---|---|---|

Mutate, do not read. If nothing fails, the finding is the test rather than the code. The catalogue
of shapes this catches is in `docs/VERIFICATION.md`.

## 6. Close-out

In this order. The workspace is removed **last**, and only after the ledger is committed.

1. Every task implemented, reviewed by a fresh reviewer, and fixed to clean.
2. Whole-branch review returns ship. One fix wave.
3. `npm run verify` green end to end (`docs/VERIFICATION.md` tier 2).
4. The spec gains its **"what actually shipped"** section, in the spec's own voice. Where a
   deviation makes an existing sentence wrong, fix that sentence rather than leaving a correction
   standing beside a contradiction. This is not paperwork: the next sub-project inherits from the
   built thing, and `2026-09-05-sp8b-web-bank-design.md` section 12 is the model.
5. **Promote:** condense `progress.md` into `docs/superpowers/ledgers/<plan-basename>.md`, **under
   400 lines**, using the section order in the template below.
6. Commit the ledger with the closing commit.
7. Update `docs/README.md` if the sub-project changed which file is the authority for a subject.
8. Only now, remove the workspace directory.

## 7. Ledger naming

**The ledger is named after the plan, exactly.** `docs/superpowers/plans/2026-09-05-spw-wiki-corpus.md`
promotes to `docs/superpowers/ledgers/2026-09-05-spw-wiki-corpus.md`. No date drift, no
re-slugging, no adding or dropping an `sp` prefix.

The rule has a scar behind it. The plan `2026-09-04-idlescape-platform.md` ran in a workspace called
`2026-09-04-idlescape-platform/`, a leftover of the product rename, and that one mismatch produced
three broken citations, including one in production code (`server/src/firebaseAdmin.ts:21`) and one
in `scripts/verify.ps1:15`. **The product is idlescape.** New paths, new filenames and new prose use
that name; only the live infrastructure identifiers listed in `docs/OPERATIONS.md` section 6 keep
the old one.

## 8. Ledger template

```markdown
# <sub-project> - <one line>

Plan: `docs/superpowers/plans/<plan-basename>.md`
Spec: `docs/superpowers/specs/<spec>.md` (which slice of it, if the plan is a slice)
Branch: <branch it ran on>
Commit range: <plan commit>..<final fix wave>, task commits listed
Source: `.superpowers/sdd/<plan-basename>/progress.md`, read in full

## Rulings
## Deferred / parked / carry-forward
## Traps recorded
## Measured facts
## Per-task table
```

Under 400 lines. The existing ledgers run 39 to 210 lines, so the ceiling is not tight; if a
sub-project is pressing it, the ledger is carrying per-task narrative that belongs in the removed
workspace.

## 9. Measurements

A measurement a spec **gated on** is not a ledger entry. It goes in
`docs/superpowers/measurements/<date>-<subject>.md` and is linked from `docs/README.md` section 5,
because a later entry will want to cite it and a ledger is not where anyone looks.

The one that exists is `2026-09-05-sp7-sessions.md`, the throttling and memory numbers behind the
iframe session design. It is cited by the SP7 spec and by `docs/ARCHITECTURE.md`.

## 10. Vendoring

A spec, a design bundle or any artefact that arrives from outside the repository is vendored
**unchanged** except for what the provenance record names. Two shapes are in use and both are
correct; pick by size.

**Shape A, an inline header,** for a single file. The header sits above the original content, which
is otherwise untouched. `docs/superpowers/specs/2026-09-07-battlebots-minigame-design.md` is the
example: it records the date, that it was vendored from the copy that was its only one, that the
content below is unchanged, which sprint entry owns it, and that its plan overrules it.

**Shape B, a separate `PROVENANCE.md`,** for a directory or a bundle. This is the better artefact
when there is more than one file or when anything was changed on the way in.
`docs/design/idlescape-shell-v2/PROVENANCE.md` is the example, and it is the model to copy: where
it came from, that this copy is the only one, **exactly what changed on the way in and why** (there,
a product rename with case preserved and two placeholder hostnames), what was deliberately left out
and where it went instead, and what the bundle is and is not.

Both shapes must state: the source, the date, that the content is otherwise unchanged, and who the
authority is when the vendored artefact and a repository document disagree. Vendored **code** also
keeps its upstream license file and gets a `PATCHES.md` recording every local modification, per the
roadmap's section 5.

## 11. What this convention changed, and where the old wording still stands

- `docs/superpowers/specs/2026-09-06-sprint-handoff.md:25` and `:228-230` still say "delete the
  plan's ledger directory". They are superseded by this document and by decision D19.
- `docs/superpowers/plans/2026-09-06-sp4b-bot-expansion.md:6097` says the same for SP4b. SP4b's
  ledger is promoted at its landing step, not deleted.
- The eight ledgers already in `docs/superpowers/ledgers/` were promoted on 2026-09-07 from the
  surviving workspaces and, for SPW, out of machine-local memory where its rulings had been living
  as a 20 KB file on one developer's disk.
