# idlescape project

idlescape is a private, self-hosted 2004 RuneScape world (pinned Lost City engine at revision
274, forked TypeScript client, Vite shell, Bun front server, Firebase identity) in which playing,
scripting and letting Claude play are all first-class.
It is built entirely by autonomous agent sessions.

## Read this first

`docs/README.md` is the index: the one authority for every subject, in one hop. Then
`docs/VISION.md`, the sprint spec, the board, and the skill for whatever you are touching.

## Constraints that do not move

- Strict TypeScript, no new `as any`. **Files under 400 lines**, test files included; split rather
  than trim comments. `types.ts` per package, `.env.example` per process.
- Conventional commits. No em dashes in new prose; hyphens or commas. The product is **idlescape**,
  lowercase in UI strings; the infrastructure identifiers listed in
  `docs/OPERATIONS.md` are kept on purpose and are not yours to rename.
- `localStorage` keys keep the `cs.` prefix and their exact names. Panel ids in
  `web/src/types.ts` are a persisted data contract.
- Pack ids are pinned **by name** in the sprint spec's section 3. A renumbered `.pack` silently
  turns one item into another in every `.sav` and owner-bank JSON.
- Windows PowerShell 5.1 only: no `&&`, no ternary, no `??`, no here-string continuation. `pwsh` is
  not installed.
- `scripts/line-ceiling.ps1` enforces the 400-line ceiling, first thing in `npm run verify`, and
  `web/eslint.config.js` carries the same number so your editor says it first. The six exemptions
  are listed in that script's header.

## Never edited

| Path | Change it instead by |
|---|---|
| `engine/server`, `engine/content` | `engine-custom/` and `content-custom/` overlays, with a `manifest.json` entry and a `PATCHES.md` grep. The ignore is **anchored** (`.gitignore:8` is `/engine/`, not `engine/`), so it does not also match `engine-custom/src/engine/`, which is where the overlay's `PlayerLoading.ts` replacement lives and which is tracked |
| `client/src/vendor/`, `web/src/vendor/` | A logged deviation in that directory's `PATCHES.md`, license kept |
| `client/src/client/Client.ts` | A **numbered patch** recorded in `client/PATCHES.md`; numbering is at 28 |
| `live/` | Nothing. It is a separate running instance with its own copy of the engine clones, git-ignored at `.gitignore:28` and **never tracked, edited, or read into** |

## Verifying

`npm run verify` from the repository root is the acceptance gate, ten steps.
`docs/VERIFICATION.md` is the authority, including what a green does **not** cover. Four traps that
have each cost a session:

- Playwright runs from `web/`. From the root it reports "No tests found" and exits 0.
- `bun scripts/gen/atlas.ts --check` and `collision.ts --check` run from the **repository root**;
  `npx tsc -p ../scripts/gen/tsconfig.json` runs from `web/`.
- `npm run build` in `web/` builds against real Firebase and is correct only for what ships. For
  local play and Playwright use `npm run build:e2e`.
- Start the Firebase emulators from PowerShell `Start-Process`, never from a bash subshell; from
  bash they die silently.

Worktrees: `git worktree remove` follows `node_modules` junctions and wipes the main tree's
installs. Unlink from PowerShell and verify before removing, and copy `web/.env.local` and
`server/.env` into a new worktree. Procedure and recovery: `docs/OPERATIONS.md`.

## Committing

- Explicit `git add <paths>`, never `git add -A`.
- `git -c core.safecrlf=false commit`.
- Trailer: take it from the **current session's** attribution, not from an old plan's commit block.
  This session's is `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` plus
  `Claude-Session: <session id>`.

## How this project is run

1. The owner gives direction and rules only on clear blockers: a side effect outside this
   repository, an irreversible deletion, or a plan so broken every path is a guess.
2. Everything else you decide. Make rulings, do not stall, and record what each costs if wrong.
3. A sub-project is spec, plan, fresh implementer and fresh reviewer per task, fix rounds, a
   whole-branch review, one fix wave, `npm run verify`, and a "what actually shipped" section.
4. The ledger is **promoted** to `docs/superpowers/ledgers/<plan-basename>.md`, never deleted.
5. Order lives in `docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md`; live state in
   `docs/superpowers/sprint-control.md`.

Decisions are recorded in the sub-project's ledger when they are local, and in
`docs/superpowers/decisions.md` (append-only) when they cross entries or touch policy.
