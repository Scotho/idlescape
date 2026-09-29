# Lightsail deployment (operator runbook)

The public idlescape stack (274 engine + front server + Cloudflare tunnel connector) runs on
one AWS Lightsail instance, built and released from this repo on the operator's PC. This
supersedes the PC deploy (`deploy/windows/`) and the never-run Oracle VM notes in
`deploy/docker/README.md`; the compose stack itself is still `deploy/docker/`.

Naming: the product is idlescape (it had an earlier name until 2026-09-05). In the author's deployment the identifiers created under that name are unchanged on purpose; in this public copy they read idlescape: Firebase project `idlescape-osrs`, Lightsail instance, profile and key pair `idlescape*`, the `/opt/idlescape` box root, the compose project `idlescape` (its volumes hold the engine sqlite), the `idlescape` Cloudflare tunnel and the `idlescape-*` Windows tasks. Renaming any of them is a migration, not a find-and-replace.

## The box

| | |
|---|---|
| Instance | `idlescape`, bundle `small_3_0` (2 vCPU, 2 GB, 60 GB SSD, 3 TB/mo transfer), Ubuntu 24.04 |
| Region / zone | `ca-central-1` / `ca-central-1a` |
| Static IP | `idlescape-ip` (free while attached) |
| Firewall | inbound TCP 22 only; cloudflared dials out |
| Cost | $12/month flat |
| SSH | `ssh -i ~/.ssh/idlescape-lightsail ubuntu@<ip>` |
| App root | `/opt/idlescape/` -- `src/` (current release), `src.old/` (previous), `secrets/` (mode 700; inside it `tunnel-credentials.json` is 644 because the cloudflared image runs as uid 65532, the rest 600) |

## Prerequisites on the PC

- AWS CLI v2 with profile `idlescape` logged in (`aws login --profile idlescape`; 12-hour
  sessions, renewable 90 days).
- `~/.ssh/idlescape-lightsail` (RSA 4096) -- imported to Lightsail as key pair `idlescape-lightsail`.
- `%USERPROFILE%\.cloudflared\00000000-0000-0000-0000-000000000000.json` -- the `idlescape` tunnel credentials.
- `server/secrets/firebase-admin.json` -- Firebase admin SDK key for project `idlescape-osrs`
  (create with `gcloud iam service-accounts keys create ... --iam-account firebase-adminsdk-fbsvc@idlescape-osrs.iam.gserviceaccount.com`).
- `web/.env.production` (tracked) with the real `VITE_FIREBASE_*` values -- public web config for Firebase
  web app `idlescape-web`; release reads it at HEAD. `web/.env.local` is dev/emulator only.

None of these are committed. The scripts fail fast if any is missing.

Firebase project `idlescape-osrs` must also have (all done 2026-09-05): Auth with email+password and
anonymous sign-in and `osrs.scotho.com` in the authorized domains; web app `idlescape-web`
(its public config is `web/.env.production`); the Cloud Firestore API enabled with the `(default)`
native-mode database in `northamerica-northeast1`; and rules/indexes deployed from `firebase/`
(`firebase deploy --only firestore --project idlescape-osrs`). Without the database every
profile/character read hangs and `/api/bridge` returns 500 ("bridge failed" in the shell).

## Scripts

All run from the repo root in PowerShell. `-InstanceName/-Region/-Profile/-KeyFile` share the
defaults above.

| Script | What it does |
|---|---|
| `provision.ps1` | Create the instance (idempotent by name) from `user-data.sh` (Docker + 4 GB swap), attach the static IP, close the firewall to SSH, wait for cloud-init, then push `server.env` (generated: fresh `OWNER_ASSERTION_SECRET` and `ENGINE_MANAGEMENT_SECRET`, Firebase project, `PUBLIC_ORIGIN`), the Firebase key and the tunnel credentials into `secrets/`. `-SecretsOnly` re-pushes just the secrets (rotates both, so every owner assertion in flight stops verifying). |
| `release.ps1` | Ship **HEAD**: refuses on uncommitted tracked changes (`-Force` to override -- HEAD still ships, not the working tree); `-BoxIp <ip>` skips the `aws lightsail get-instance` lookup so an unattended release needs no live `aws login` session (SSH and the health poll use the key file only), and names them again just before the archive is cut, refusing on any dirty file under `deploy/` because the box reads those directly. That second refusal is **not** covered by `-Force`: it takes `-AllowDirtyDeploy`, which is a deliberate choice to let HEAD's copies replace what the box is running. Writes `secrets/compose.env` (engine/content shas from HEAD's `scripts/upstream.lock`, `VITE_*` from HEAD's `web/.env.production`, secrets paths), `git archive` → scp → `box/extract.sh`, then `box/up.sh` (`docker compose build && up -d`) and polls `box/health.sh` until the release gate is met (see "The release gate" below). First build takes several minutes (npm installs + cache pack). Does **not** start the public connector. |
| `preview.ps1` | Look at the not-yet-public stack: starts a socat sidecar on the box and an `ssh -L` forward; open http://localhost:18787. `-Stop` removes the sidecar. |
| `cutover.ps1` (elevated) | Verify box health, start the box's cloudflared connector (compose profile `public`), stop + disable the PC's `idlescape-tunnel` task / `cloudflared` service, then poll `https://osrs.scotho.com/api/health`. One-time, unless the tunnel is ever moved back. |

Box-side helpers live in `box/` and ship with every release; they are what the PowerShell
scripts call over ssh (`bash /opt/idlescape/src/deploy/lightsail/box/<name>.sh`):
`extract.sh <sha>`, `up.sh`, `health.sh`, `logs.sh [n]`, `public.sh`, `preview.sh [stop]`.

## Day-to-day

```powershell
git commit ...                       # HEAD is what ships
.\deploy\lightsail\release.ps1       # build + up + health gate (~1-2 min after the first time)
```

Once the public connector has been started by `cutover.ps1`, `up.sh` keeps it in the project on
later releases, so a release is a short blip while the `server` container restarts.

Logs: `ssh ... 'bash /opt/idlescape/src/deploy/lightsail/box/logs.sh 200'`.

End-to-end check after a release (headless Chromium, needs `pip install playwright` + browsers):
`python docs/verify_guest_login.py https://osrs.scotho.com 40` opens the home screen,
clicks Login as a guest and reports whether the client reached the world (canvas, game
WebSocket frames, console errors, failed requests) with screenshots in the working directory.

## The `idlescape_internal` network, and neighbouring projects

The author's box also runs other compose projects. Each is reachable through this project's tunnel connector only because it joins this project's network by its full name, **`idlescape_internal`** (compose prefixes `internal` with the project name, and `docker-compose.yml` sets the name), and because the author's own copy of `cloudflared.yml` carries an ingress rule for it. The public template carries this project's rule only.

Three consequences worth knowing before touching either side:

- **Renaming the compose project or the `internal` network breaks a neighbouring project silently.**
  The connector keeps running and the neighbour's hostname starts returning a 502; nothing in
  this repository fails.
- **The `engine` service is deliberately not on that network.** It sits on the project's second
  network with only `server` for company, because its management port binds off loopback and
  carries routes that can move any account's items. Upstream's `/setup` routes on that port were
  the original reason and are authenticated as of sprint entry 2, so the split is now defence in
  depth. A container from a neighbouring project must not be able to reach any of it.
- **A dirty working-tree copy of `cloudflared.yml` is dangerous, not merely stale.**
  `release.ps1` ships `git archive HEAD`, the file is bind-mounted into the connector, and
  `box/up.sh` re-applies the `public` profile whenever a cloudflared container is already
  running, so an unshipped ingress is deleted from the running tunnel rather than just missing.
  That is why `release.ps1` refuses on any dirty file under `deploy/` even when `-Force` was
  passed. `-Force` says "HEAD ships instead of my working tree", which for `deploy/` is a revert
  rather than a missing improvement, so it takes a second switch of its own,
  `-AllowDirtyDeploy`, and both are needed to ship a dirty `deploy/` tree.

## Rollback

The previous release stays at `/opt/idlescape/src.old` until the next release. To roll back:

```bash
ssh -i ~/.ssh/idlescape-lightsail ubuntu@<ip>
cd /opt/idlescape && mv src src.bad && mv src.old src && bash src/deploy/lightsail/box/up.sh
```

Docker's build cache makes the rebuild quick. The sqlite volume is untouched by rollbacks.

## The release gate

`Wait-RemoteHealth` (`common.ps1`), which both `release.ps1` and `cutover.ps1` call, no longer
accepts `"engine":"up"` on its own. That field is a `HEAD /rs2.cgi` probe and nothing more, and it
reported green for months against an engine carrying none of the overlay (audit C07). It now also
requires:

- `"players"` to be a **number**, which happens only when the front server actually reached the
  engine's management port at `ENGINE_MANAGEMENT_HTTP`. That is the seam C07 found pointing at
  loopback inside the server container, and it is also what proves `IDLESCAPE_MANAGEMENT_HOST` is
  set, since the overlay narrows that bind to `127.0.0.1` where upstream 274 binds `0.0.0.0`.
- `"wiki"` to be `"up"`, which needs the wiki database in the server image (audit C09, sprint
  entry 2). The server image now builds it: `server.Dockerfile`'s `wiki-build` stage clones
  `LostCityRS/Content` at `CONTENT_SHA` and writes `/app/wiki/build/wiki.db`, the path
  `server/src/env.ts` already defaults to, so there is no `WIKI_DB` override anywhere. **This is
  the field that kept the gate red**; a release from a commit that predates it still cannot pass.
- `"management"` to be `"up"`, which happens only when the engine answers **its own** secret-gated
  route, `GET /owner/health` on the management port, a route only `engine-custom` registers and only
  when a secret is set (audit C07's runtime half, decision D75). One green field proves three things
  at once: the running image carries the engine overlay, `ENGINE_MANAGEMENT_HTTP` reaches the engine,
  and both halves hold the same `ENGINE_MANAGEMENT_SECRET`. `"unauthorized"` is a 401 (different
  secrets) or a 404 (an engine started without one); `"unconfigured"` means the **front server** has
  no secret, which is a healthy local stack and never a passing release; `"down"` means the port did
  not answer. `/api/health` is public, because `cutover.ps1` polls it through the public hostname,
  so the field carries a status word and never the secret.

**Disk.** That database is about 132 MiB of image layer, and the wiki stage clones Content a
second time per server-image build on top of the engine image's own clone. The box is a
`small_3_0` bundle (60 GB SSD), and `release.ps1` keeps the previous release in `src.old/` while
Docker keeps the previous image, so check free disk (`df -h`, `docker system df`) before a release
rather than after one fails halfway. `--filter=blob:none` on the two clones is the mitigation if
build time or bandwidth starts to hurt.

**Memory.** The cost likelier to kill the first build after this lands. `box/up.sh` runs
`docker compose build` on the box itself, and BuildKit runs the server image's four independent
stages (`client-build`, `web-build`, `engine-public`, `wiki-build`) concurrently; the wiki stage is
the hungriest of them. Measured on a developer machine: the extract peaks near 750 MiB resident and
the wiki build near 1.0 GiB. The box has 2 GB of RAM plus the 4 GB swapfile `user-data.sh`
provisions for the engine cache build, so it fits, but it fits by swapping. A build that dies with
no error text is the OOM killer, not a bug in the stage: read `dmesg | tail`, then build one
service at a time (`docker compose build engine`, then `docker compose build server`) instead of
letting both run together.

The engine overlay is asserted a second time, earlier, at build time: `engine.Dockerfile` checks
that every path in `engine-custom/manifest.json` exists in the clone after the copy, so a missing
overlay file fails the build rather than waiting for `"management"` to read `unauthorized` at the
gate.

### What the release gate still cannot see

Even with all four health fields green, the release gate does not see:

- Whether the engine image carries the CONTENT overlay. There is still **no health field** for it,
  so a running image is never asked the question. The check itself is no longer the problem:
  `scripts/content-overlay.ps1 -Check` reads the clone's pinned blob and exits 1 on drift, and
  `npm run verify` runs it and reads the code (audit C23, closed 2026-09-08). That answers about
  the build machine's tree.
- Whether either pinned clone matches `scripts/upstream.lock` **in the image**. `engine.Dockerfile`
  and the wiki stage take shas as build args and fail without them, but nothing compares a running
  image's shas to the lock. The build machine is covered: `Assert-ClonePins` compares both clones
  to the lock inside `npm run verify` and inside `start-stack.ps1` (audit C23). The image half
  stays open.
- Whether the client fork's numbered patches are present **in the image**. They are no longer
  hand-run greps: `scripts/patches-check.ps1` runs all four patch records inside `npm run verify`
  and diffs `client/` against the `client-import` commit the lock pins (audit C24, closed
  2026-09-08). Nothing ties that answer to the bundle a release ships, which is the bullet below.
- Whether the deployed bundle is the bundle that was verified. `release.ps1` ships HEAD and warns
  about dirty tracked files under `deploy/`, but nothing ties an image to a verified commit.

## The two secrets the engine and the front server share

`OWNER_ASSERTION_SECRET` and `ENGINE_MANAGEMENT_SECRET` are one value each, read by both halves:
the front server signs owner assertions and calls the owner-bank management routes, the engine
verifies and serves them. `provision.ps1` generates both into `secrets/server.env`, and
`deploy/docker/docker-compose.yml` env_files that same file into **both** services, so the two
can never disagree and neither value is ever a literal in this repository. Rotating one means
restarting both containers together. The engine also refuses to start in production with an empty
`OWNER_ASSERTION_SECRET` rather than refusing every player at login
(`engine-custom/src/idlescape/config.ts`).

## Rotating secrets

- The two shared engine secrets:
  `.\deploy\lightsail\provision.ps1 -SecretsOnly` then
  `ssh ... 'cd /opt/idlescape/src/deploy/docker && docker compose --env-file /opt/idlescape/secrets/compose.env up -d engine server'`
  -- both services, not just `server`: `server.env` feeds the engine too.
- Firebase key or tunnel credentials: replace the local file, same `-SecretsOnly` run, then
  restart the affected service (`server` or `cloudflared`).

## After cutover: retiring the PC PoC

`cutover.ps1` stops the PC's tunnel connector but leaves the `idlescape-live-engine` task
(the old 225 engine on port 8888) running. Once osrs.scotho.com is confirmed healthy from the
box, stop and unregister it from an elevated PowerShell:

```powershell
Stop-ScheduledTask idlescape-live-engine; Unregister-ScheduledTask idlescape-live-engine -Confirm:$false
Unregister-ScheduledTask idlescape-tunnel -Confirm:$false
```
