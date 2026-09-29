# Operations

The environment facts several skills share, each stated once here and cited from there rather than
restated (decision D21). Written 2026-09-07 at commit `30efd94`.

This file is about the machine and the box. What to run to prove a change is `docs/VERIFICATION.md`.
How the system is put together is `docs/ARCHITECTURE.md`.

---

## 1. The developer machine

Windows 11, Git Bash available for POSIX scripts, **Windows PowerShell 5.1** for everything that
launches a process. `pwsh` is not installed. In 5.1 there is no `&&`, no `||`, no ternary, no `?.`
or `??`, and no here-string continuation. Chain with `A; if ($?) { B }`.

Runtimes: `bun` (at `%USERPROFILE%\.bun\bin\bun.exe` if it is not on PATH), Node with `npx tsx` for
the engine, `npm` for `web/` and `firebase/`.

## 2. Ports

| Port | Process | Notes |
|---|---|---|
| 8787 | Front server (Bun) | The only public port. `PORT` in `server/.env` |
| 8899 | Game engine (274, Node + tsx) | Game WebSocket and cache. `web.port` in `engine/server/data/config/world.json` |
| 8897 | Engine management (Fastify) | Owner-bank routes and metrics. **Loopback only, never exposed** |
| 9099 | Firebase auth emulator | Dev and test only |
| 8080 | Firebase firestore emulator | Dev and test only |
| 5173 | Vite dev server | Dev only; `start-stack.ps1 -Prod` skips it |
| 18787 | `deploy/lightsail/preview.ps1` ssh forward | Look at the box before it is public |
| 8888 | The retired 225 proof-of-concept engine on the PC | **Never point a dev front server at it** (`server/.env.example:2-4`) |

Check them with `netstat` before assuming the stack is down.

## 3. Hosts

- **Public site:** `https://osrs.scotho.com`, served from the Lightsail box through a Cloudflare
  tunnel. Nothing on the box publishes a host port; the connector dials out.
- **Local:** `http://localhost:8787` in `-Prod` mode, `http://localhost:5173` with vite dev in
  front of it.
- **Firebase project:** `idlescape-osrs`, Cloud Firestore `(default)` native database in
  `northamerica-northeast1`. Auth has email+password and anonymous sign-in, with
  `osrs.scotho.com` in the authorized domains.

## 4. Bringing the stack up

```powershell
npm run dev             # scripts/start-stack.ps1: emulators, engine, client build, server, vite
npm run dev -- -Prod    # no emulators, no vite; front server serves the built bundle
```

Order matters and the script enforces it: content overlay, engine overlay, emulators, engine, wait
for `World ready` in `logs/engine.log`, **then** build the client bundle, then the front server,
then vite. The client bundle must be built after the engine is up because the engine's
`BUILD_STARTUP` step regenerates its own `public/client`.

**Timing.** A warm cache reaches `engine: up` on `/api/health` in about two minutes. A cold first
run packs the cache and takes about seven; the script waits up to ten and then **throws**, having
stopped every process it started. It also throws within seconds if the engine exits before
reporting `World ready`, naming `logs/engine.err.log`, which is where the reason is. The full
Playwright suite is about thirty seconds once the stack is up.

**Two launch rules that have each cost a session:**

- Start the Firebase emulators from **PowerShell**, not from a Bash background subshell. Launched
  from bash they die silently and the log shows only the cmd banner:
  `Start-Process cmd.exe "/c npm run emulators"` with `-WorkingDirectory firebase`.
- `start-stack.ps1` routes `npm`/`npx` through `cmd.exe /c` deliberately. `Start-Process` does no
  PATHEXT resolution, so a bare `npm` fails with "is not a valid Win32 application" on any install
  where npm resolves to the `.ps1` shim.

**After a client patch,** `bun run build:dev` in `client/` is enough: the front server serves
`client/out` from disk and needs no restart.

**Logs** are in `logs/`: `engine.log`, `engine.err.log` (the engine's stderr, which is where a
startup crash says why), `server.log`, `web.log`, `emulators.log`, and the `verify-*` logs from the
acceptance gate.

**Screenshots.** `vite dev` cannot be used: the front server's WebSocket proxy at `/` hijacks
vite's HMR socket and the page reloads forever. Build, then `vite preview`, and run Playwright
scripts from `web/` so `@playwright/test` resolves.

## 5. Where secrets live, and how they are resolved

**No secret is ever printed, echoed, or pasted into a document, a log, a commit message or a task
report.** Prove one is right by its length and by the HTTP status it earns, which is what
`verify.ps1` does.

| Secret | Lives in | Read by |
|---|---|---|
| `OWNER_ASSERTION_SECRET` | `server/.env` locally; `/opt/idlescape/secrets/server.env` on the box | Front server, **and the engine**: `start-stack.ps1:47-57` exports it into the engine process, and on the box `docker-compose.yml` env_files `server.env` into **both** services, so both halves share one value either way (decision D74) |
| `ENGINE_MANAGEMENT_SECRET` | Same two files | Same two readers. Empty means the engine's owner-bank management routes and `GET /owner/health` are simply not registered, which is safer than unauthenticated, and `registerSetupGuard` refuses every `/setup` request, so such a world has no setup page and `data/config/world.json` is edited directly. Set, it gates `/setup*` behind the `x-idlescape-mgmt` header, which no browser can attach, so that page is reachable only by a scripted request. A production world with an empty `OWNER_ASSERTION_SECRET` refuses to start at all |
| Firebase admin key | `server/secrets/firebase-admin.json` locally; a docker secret on the box | Front server |
| Cloudflare tunnel credentials | `%USERPROFILE%\.cloudflared\<tunnel-id>.json` | Pushed to the box by `provision.ps1`; mounted read-only into the connector |
| Firebase **public** web config | `web/.env.production` (tracked; it is public by design) | The web bundle at build time |

`server/.env` is the single source of truth for both halves of the stack locally, and it is
git-ignored. On the box the same role is played by `/opt/idlescape/secrets/server.env`, which
`provision.ps1` generates (both engine secrets at 48 characters) and which is env_filed into the
`server` and `engine` containers alike; rotating either means restarting both.
`server/.env.example` documents every key and is tracked. `web/.env.local` is emulator-only;
`web/.env.e2e` is tracked and is what `build:e2e` uses.

Both engine secrets have a 32-character floor enforced at boot (`server/src/env.ts:29-40`): a short
shared secret on a route that can move a player's bank is worse than no route at all.

**Rotation** is `deploy/lightsail/provision.ps1 -SecretsOnly` followed by
`docker compose up -d engine server` on the box: both services, because `server.env` feeds the
engine too, and every owner assertion in flight stops verifying. Full runbook:
`deploy/lightsail/README.md`. A box provisioned before the site went public still has
`GATE_ENABLED`, `GATE_PASSWORD` and `GATE_SECRET` in its `server.env`; the front server ignores
them, and the next `-SecretsOnly` run drops them.

## 6. The Lightsail box

Full operator runbook: `deploy/lightsail/README.md`. The facts a session needs before reading it:

| | |
|---|---|
| Instance | `idlescape`, bundle `small_3_0` (2 vCPU, 2 GB, 60 GB SSD), Ubuntu 24.04 |
| Region / zone | `ca-central-1` / `ca-central-1a` |
| Static IP | `203.0.113.10` (`idlescape-ip`) |
| Firewall | inbound TCP 22 only |
| SSH | `ssh -i ~/.ssh/idlescape-lightsail ubuntu@<ip>` |
| App root | `/opt/idlescape/` with `src/`, `src.old/` (the rollback), `secrets/` |
| Compose project | `idlescape`, three services: `engine`, `server`, `cloudflared` (behind the `public` profile) |

**In the author's deployment these identifiers carry the project's earlier name**, kept on purpose because renaming a Firebase project, an instance, a compose project with live volumes or a tunnel is a migration rather than a find-and-replace. In this public copy they read `idlescape`; choose your own. The **`cs.` `localStorage` key prefix in the web shell** is a data contract and stays.

**Releasing is owner-gated** (board gate G5). `deploy/lightsail/release.ps1` ships HEAD, not the
working tree, and refuses on uncommitted tracked changes. The state on the box that matters is the
engine's sqlite volume `idlescape_engine-db` and `secrets/`; a snapshot of those two makes the
account expiry a non-event.

## 7. The worktree junction hazard

**`git worktree remove` follows `node_modules` junctions and deletes the main tree's installs.**
Plain `remove`, not just `--force`. It has happened twice: 2026-09-05 and 2026-09-06, the second
time wiping four packages at once. A related incident deleted the real `engine/content` clone
(about 100 MB) through a junction created so a worktree could reach it.

The safe procedure, **from PowerShell**, never by building a Windows path inside bash (the
2026-09-06 loss came from `tr '/' '\\'` mangling a path so `rmdir` no-opped without erroring):

```powershell
# 1. Unlink every reparse point inside the worktree.
Get-ChildItem "<worktree>" -Recurse -Force -Directory -Attributes ReparsePoint |
  ForEach-Object { cmd /c rmdir "$($_.FullName)" }

# 2. VERIFY. Re-run the same command and require it to print nothing.
Get-ChildItem "<worktree>" -Recurse -Force -Directory -Attributes ReparsePoint

# 3. Only then, and one worktree at a time:
git worktree remove "<worktree>"
```

Recovery if it happens anyway is in `docs/VERIFICATION.md`, "When the install is broken".

Two more worktree facts:

- **Copy the git-ignored env files into a new worktree**: `web/.env.local` and `server/.env`.
  Without `web/.env.local` the web vitest suite fails at collection with firebase
  `self is not defined` in the home and panels tests, which looks like a regression and is not.
- The Workflow tool's `isolation: 'worktree'` refuses to work here because of a `C:\projects`
  versus `C:/Projects` path-case mismatch. Create worktrees by hand, or work sequentially in the
  main tree, which is what this sprint does (decision D5).

Point a tool at the real clones through configuration (an environment variable or a path option
such as `CONTENT_DIR=C:\Projects\idlescape\engine\content`), never through a link inside a
worktree.

## 8. Machine-local memory

`%USERPROFILE%\.claude\projects\C--projects-osrs-test\memory\` holds the operator's own
session memory. **Its role is session-scoped state only** (decision D21): what is running, where a
session left off, current usage. It is invisible to a fresh clone and to every other machine, so
anything durable belongs in the repository instead: procedures in `.claude/skills/`, structure in
`docs/ARCHITECTURE.md`, environment facts here, rulings in `docs/superpowers/decisions.md` or a
promoted ledger under `docs/superpowers/ledgers/`.

Where that rule was broken it is being repaired: SPW's ruling ledger survived only as a 20 KB
memory file until it was promoted to `docs/superpowers/ledgers/2026-09-05-spw-wiki-corpus.md`.

## 9. Sprint orchestration

The live board is `docs/superpowers/sprint-control.md`: what is running, the queue with
prerequisites, the gates awaiting the owner, and the handoff section a session writes before it
stops. Cross-entry rulings are appended to `docs/superpowers/decisions.md`.

Model tiers for dispatches: opus for implementers, architecture and first reviews; sonnet for
scoped re-reviews and mechanical work; fable at most once per sub-project, for the final
whole-branch review. Always name the model explicitly.

**Commit trailer.** Take it from the current session, not from an old plan's commit block, which is
stale. Use `git -c core.safecrlf=false commit` and explicit `git add <paths>`, never `git add -A`.

## 10. Bumping a pinned revision

Five revisions are pinned and `scripts/upstream.lock` records all five: `engine/server` and
`engine/content` (upstream Lost City, branch 274), `client` (the fork's upstream tip),
`client-import` (the commit that imported the fork into this repository, the base
`scripts/patches-check.ps1` measures the pristine claim against) and `rs-sdk` (the vendored bot
surface, a fork of Client-TS 274 that does not move with the client).

The engine and content clones are the easy half: edit their rows, run `scripts/setup.ps1`, then
`powershell -File scripts/engine-overlay.ps1 -Check` and `powershell -File
scripts/content-overlay.ps1 -Check`. Both exit 1 naming every recorded hash that moved, and each
one is a patch to re-apply per `engine-custom/PATCHES.md`. The client fork is the long half:

1. Get the upstream history, which a fresh clone does not have. `client/.upstream-git/` is
   git-ignored (`.gitignore:29`) and no script creates it:
   ```bash
   git clone --bare https://github.com/LostCityRS/Client-TS client/.upstream-git
   git --git-dir=client/.upstream-git fetch origin '+refs/heads/*:refs/heads/*'
   ```
2. Pick the new revision and export its tree over `client/`. The three excludes preserve
   `src/hooks/`, `src/plugins/` and `src/vendor/`, which are ours; `tsconfig.check.json` survives
   without an exclude because it is ours entirely and the upstream tree has no such path to write
   over it. Every other file in `client/` is overwritten, `package.json` and `bundle.ts` included,
   and those two are upstream files carrying a block of ours, so step 4 puts both back:
   ```bash
   git --git-dir=client/.upstream-git archive <new-sha> | tar -x -C client/ --exclude 'src/hooks/*' --exclude 'src/plugins/*' --exclude 'src/vendor/*'
   ```
3. Re-apply the numbered patches **in order**, locating each anchor by surrounding code and never
   by line number. Numbering is at 28 and the table carries 29 rows, because `21b` is a real patch
   with a non-numeric id; re-apply all 29. Order matters inside two methods: patches 8, 9 and 24
   all live in `titleScreenDraw()`, and 7 and 25 both live in `titleScreenLoop()`.
4. Put back the two edits step 2 overwrote, both in upstream files that carry something of ours
   (`scripts/patches-check.ps1` lists both among the six modified paths its pristine-274 claim
   allows):
   - `client/package.json`'s `typecheck` script,
     `"typecheck": "tsc --noEmit -p tsconfig.check.json"`. That one line is the whole delta
     against the `client-import` commit, and steps 7 and 10 below both run it, so a bump that
     skips it dies on a missing script.
   - `bundle.ts`'s terser `reserved` block (`client/bundle.ts:82` to `:184`), which is under the
     same numbered-patch regime as `Client.ts`. `scripts/build.ps1` asserts that seven of those
     names survive minification, and asserts first that the artifact really is the minified one;
     `deploy/docker/server.Dockerfile`'s client-build stage asserts the same two things about the
     bundle that actually ships, since a release builds on the box and never runs `build.ps1`.
5. Re-check the vendored rs-sdk deltas against the `rs-sdk` sha. `client/src/vendor/PATCHES.md`
   lists eight `Client.ts` row deviations and six file rows, including the deliberate ANTICHEAT
   omission and the one `as any` the repository's rule exempts. A client bump does not move rs-sdk;
   bump it separately or not at all.
6. Re-check the 274 anchors no assertion covers: `client/PATCHES.md`'s "Patch 21's 274 anchors
   (`extras`)" section and its "Revision-274 verification notes" section (the inventory `+1`
   offset, the chat type numbers, the login response codes). These are the claims a revision bump
   is most likely to falsify.
7. From `client/`: `bun run typecheck`, `bun test src/hooks src/plugins src/vendor`,
   `bun run build`.
8. `powershell -File scripts/patches-check.ps1`. Every failure names the row, the expected count,
   the actual count and the file. A row that is genuinely stale is updated **and** its patch table
   row is updated in the same commit.
9. Update `scripts/upstream.lock` (`client` to the new upstream sha, `client-import` to the commit
   that lands this bump, `rs-sdk` only if it moved), `client/PATCHES.md:3-5`, and
   `.claude/skills/idlescape-client-patch/SKILL.md:9-10`, which carries the pinned client sha.
   `scripts/patches-check.ps1` compares the lock's `rs-sdk` row to both vendor records, so a
   partial rs-sdk bump fails there. Step 8 will fail on the old `client-import` until this is done,
   which is the intended order: fix the record last.
10. `npm run verify` from the repository root.
