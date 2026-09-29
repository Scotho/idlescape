# Ideas

Owner ideas that are recorded and lightly considered, but are not specs and not sprint rows.
This is deliberately separate from `docs/superpowers/specs/` (approved designs) and from the sprint
document (the build order). A row in the sprint needs an approved spec; an idea here needs nothing
but a date and the owner's words.

## What an idea file holds

1. **The idea, in the owner's words.** Lightly structured, never rewritten into something else.
2. **First consideration.** How it maps onto what exists, what it depends on, what it would cost,
   and the questions a brainstorm would have to settle. A page at most. Written by whichever
   session records it, and revised by anyone who learns something.
3. **Status.** One of: `recorded`, `considered`, `brainstorming`, `spec written` (with the spec
   path), `superseded` (with what replaced it), `archived` (kept for the record, not planned; revive by adopting it), `dropped` (with why).

## How an idea graduates

An idea becomes work through the sprint document's section 6: a brainstorm (`superpowers:brainstorming`)
that produces a spec under `docs/superpowers/specs/`, a commit, and a row inserted where it should
be built. When that happens the idea file's status points at the spec and stays here as the
record of where the thought came from.

Ongoing work should glance at this directory when it touches the same ground: a sub-project that
builds a seam an idea will need (a match store, a recorder hook, a block format) can leave the door
open at no cost, and the consideration section says which doors those are.

## Index

| Idea | Recorded | Status | Touches |
|---|---|---|---|
| [Battlebots improvements](2026-09-07-battlebots-improvements.md) | 2026-09-07 | spec written: [`2026-09-07-battlebots2-puppets-queue-replays-design.md`](../superpowers/specs/2026-09-07-battlebots2-puppets-queue-replays-design.md), sprint entry 14 | sprint entry 11 (battlebots), entry 13 (SP3b hiscores), entry 17 (SP5 headless runner) |
| [Script recorder and block editor](2026-09-07-script-recorder-and-block-editor.md) | 2026-09-07 | brainstorming | entries 5, 6, 7 (API standard, Script Studio, API v2), the client hooks |
| [Camera, frame rate and draw distance now, a modern renderer later](2026-09-07-camera-frame-and-renderer.md) | 2026-09-07 | spec written: [`2026-09-07-camera-frame-and-renderer-design.md`](../superpowers/specs/2026-09-07-camera-frame-and-renderer-design.md), sprint entry 9 | its own sprint row 9 (D41); entries 3, 4 (the `config` panel), 8 (client patches), 16 (SP5); D18; the GPU spike findings |
| [Feature candidates, ranked](2026-09-07-feature-candidates.md) | 2026-09-07 | superseded and archived | session suggestions, 39 ranked by desirability and feasibility; not owner ideas until adopted |
