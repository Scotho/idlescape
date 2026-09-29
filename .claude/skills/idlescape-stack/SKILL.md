---
name: idlescape-stack
description: Use when bringing the local idlescape stack up, tearing it down, or debugging why it will not start - the engine, the front server, the Firebase emulators, the client bundle, or vite dev. Read it before launching a process, not after the first thing dies.
user-invocable: true
---

# Bringing the idlescape stack up

Five processes make a working local stack. `scripts/start-stack.ps1` starts them in an order that
is not negotiable, and most failures are an ordering or a launch-mechanism problem rather than a
code problem.

## Read first

- `docs/OPERATIONS.md` - **the ports, the hosts, the timings, the secret locations and the launch
  rules.** This skill does not restate them; it tells you what to do with them.
- `scripts/start-stack.ps1` - the script itself. Its header explains the ordering.
- `server/.env.example` - every environment key the front server reads, with the reason attached.

## Rules that are not negotiable

- **Windows PowerShell 5.1 only.** No `&&`, no ternary, no `??`, no here-string continuation, and
  `pwsh` is not installed. Chain with `A; if ($?) { B }`.
- **Start the Firebase emulators from PowerShell**, never from a Bash background subshell. Launched
  from bash they die silently and the log shows only the cmd banner:
  `Start-Process cmd.exe "/c npm run emulators"` with `-WorkingDirectory firebase`.
- **Never point a dev front server at port 8888.** That is the retired 225 proof-of-concept on the
  operator's PC. The dev engine is 8899.
- **Never expose the engine management port (8897).** It is loopback only; only the front server
  reaches it.
- **Never print a secret.** Prove one is right by its length and by the HTTP status it earns.
- **The stack is never brought up against the live host.** Releases are owner-gated (board gate G5).

## Working modes

### Bring it up

```powershell
npm run dev             # emulators, engine, client build, front server, vite dev
npm run dev -- -Prod    # no emulators, no vite; the front server serves the built bundle
```

The order the script enforces, and why: **both clone pins checked against `scripts/upstream.lock`**,
content overlay, engine overlay, emulators, engine, **wait for `World ready` in `logs/engine.log`**,
then build the client bundle, then the front server, then vite. The pin check runs first because an
overlay applied into a clone at the wrong revision is drift nothing downstream can see. The client
bundle must be built after the engine is up, because the engine's `BUILD_STARTUP` step regenerates
its own `public/client`; build it first and the front server falls back to the engine's hookless
client and nothing in the shell works.

Expect about two minutes to `engine: up` on a warm cache, about seven on a cold first run while it
packs. **The script throws rather than continuing** if the engine dies or never reports `World
ready`: the poll checks `HasExited` on every pass, so a crash is reported in seconds, and the
ten-minute deadline throws too. Every tracked process is stopped before the throw. The reason is in
`logs/engine.err.log`, the engine's own stderr; `logs/engine.log` has only whatever it managed to
print first.

### Check whether it is already up

```powershell
netstat -ano | Select-String ":8787|:8899|:8897|:9099|:8080"
Invoke-RestMethod http://localhost:8787/api/health
```

`/api/health` reporting `engine: up` is the signal every other step waits on.

### After a change

- **Client patch:** `bun run build:dev` in `client/`. The front server serves `client/out` from
  disk, so no restart.
- **Web change:** vite dev has it already; in `-Prod` mode rebuild the bundle
  (`npm run build:e2e` in `web/` for local play, see `docs/VERIFICATION.md` for which build).
- **Engine overlay change:** re-run `scripts/engine-overlay.ps1` and restart the engine. **Deleting**
  an overlay file counts: the apply reads its `.overlay-manifest` sidecar in the clone root and puts
  the upstream file back, or removes ours where upstream has none. Never hand-delete from the clone.
- **Content overlay change:** re-run `scripts/content-overlay.ps1` and restart the engine, because
  its content watcher wants a consistent tree from the first pack. Same removal path, same sidecar.

### Take it down

`Ctrl+C` in the `start-stack.ps1` window stops the tracked pids through `Stop-Tracked`
(`start-stack.ps1:41`): a plain `taskkill /PID <id> /T` asks first, five seconds of `HasExited`
polling gives a clean close time to happen, and `taskkill /T /F` follows for anything still alive,
which is what gets the node children out from under the `cmd.exe` wrappers. `verify.ps1` stops
everything it starts the same way, in a `finally` block, through its own copy of that shape named
`Stop-ProcessTree` (`verify.ps1:51`): two functions, one contract, so grep for the one in the file
you are reading; after a verify run the stack is down and has to be brought back. Measured on
2026-09-08, **the engine does not take the polite offer**: a windowless console child answers
`/T` with "can only be terminated forcefully", so the owner bank is still flushed only by its own
100-tick timer. Do not read a clean stop into a clean exit.

## When it will not start

Work down this list. Each row has been the answer at least once.

| Symptom | Cause | Fix |
|---|---|---|
| `logs/emulators.log` holds only a cmd banner | Emulators launched from bash | Relaunch with `Start-Process` from PowerShell |
| "is not a valid Win32 application" | `Start-Process` on a bare `npm`/`npx`, which does no PATHEXT resolution | Route through `cmd.exe /c`, as `start-stack.ps1` does |
| `start-stack.ps1` throws: the engine exited before `World ready` | The engine died at boot: a port in use, a Node stack, a tsx resolution failure, or a pack-id violation exiting 1 from `src/app.ts` | Read `logs/engine.err.log` **first**; `logs/engine.log` has only what it printed before dying |
| `start-stack.ps1` throws after ten minutes with a silent engine | Cold cache pack, or the content overlay left the tree inconsistent | Read `logs/engine.log`; re-run the content overlay and restart |
| `start-stack.ps1` throws at the pin check | A clone is not at `scripts/upstream.lock`'s sha, usually a hand-checked-out `engine/` | `npm run setup`, which force-checks both clones out at the pinned shas |
| `Cannot find package` anywhere | A worktree removal followed a `node_modules` junction | Recovery in `docs/VERIFICATION.md`; hazard and unlink procedure in `docs/OPERATIONS.md` |
| Shell loads but sign-in fails | Wrong web bundle: a production build against the emulators | `npm run build:e2e` in `web/`, and set `WEB_DIST=../web/dist-e2e` |
| Bank routes 404 or 401 | `ENGINE_MANAGEMENT_SECRET` absent or mismatched. Absent means the engine never registers those routes | Set it in `server/.env`, 32 characters or more, and restart both halves so they share one value |
| The page reloads forever while screenshotting | The front server's WebSocket proxy at `/` hijacks vite's HMR socket | Build, then `vite preview`; run Playwright from `web/` |
| Everything is up but a route behaves oddly | You are reading a status the router or the principal check emits, not the route's answer | An unknown path answers `404` and a human route with no token `401 {error:'unauthorized'}`, before any handler runs. Assert on the route's own behaviour |

## Verification

The stack is up when **all five ports answer and the engine process has not exited**:

```powershell
netstat -ano | Select-String ":8787|:8899|:8897|:9099|:8080"
Get-Content logs\engine.log -Tail 5      # 'World ready', and no stack trace after it
Invoke-RestMethod http://localhost:8787/api/health   # engine: up
```

Do not report the stack as up on `/api/health` alone: the front server answers that route whether
or not the engine overlay applied, which is exactly the gap that let a deployed stack ship with no
owner bank (project audit C07).
