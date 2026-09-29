# Compose stack (engine + front server + tunnel connector)

> **Where this runs now:** the AWS Lightsail box, driven by the scripts and runbook in
> `deploy/lightsail/README.md` (provision / release / preview / cutover). Everything below about
> an "Oracle VM", hand-written `deploy/docker/.env`, and dashboard-token tunnels is historical
> context for how the stack was first authored; the Lightsail scripts generate the compose env
> file and mount the tunnel config + credentials instead. The Dockerfiles and compose file here
> are what actually run.

Three services, no host ports published: `engine` (the 274 engine, unpublished/internal),
`server` (the front server, internal-only), `cloudflared` (the only service that reaches the
internet, outbound, running the `idlescape` tunnel from `deploy/lightsail/cloudflared.yml` plus
a mounted credentials file, behind the compose profile `public`).

Env comes from one compose env file (`--env-file`): `ENGINE_SHA`/`CONTENT_SHA` (from
`scripts/upstream.lock`), the five `VITE_FIREBASE_*` values, `PUBLIC_ORIGIN`, and three absolute
paths -- `SERVER_ENV_FILE`, `FIREBASE_ADMIN_FILE`, `TUNNEL_CREDENTIALS_FILE`. `release.ps1`
writes it on the box; `.env.example` documents the same keys for a manual run.

`SERVER_ENV_FILE` is env_file'd into **both** the `server` and the `engine` service, because
`OWNER_ASSERTION_SECRET` and `ENGINE_MANAGEMENT_SECRET` are one value each shared by the two
halves; `deploy/lightsail/provision.ps1` generates them into that file and neither is ever a
literal in this repo. Everything topological is set in the compose file and overrides that file:
`ENGINE_MANAGEMENT_HTTP` on `server`, and `IDLESCAPE_MANAGEMENT_HOST`, `IDLESCAPE_HOOK_URL` and
`IDLESCAPE_BANK_DIR` on `engine`.

Two networks. `internal` carries `server` and `cloudflared` and is the one another compose
project on the box joins by its full name `idlescape_internal`; `engine` carries `engine` and
`server` only, so the engine's management port (which binds off loopback for the front server to
reach it, and carries routes that can move any account's items) is not exposed to a neighbouring
project. The upstream `/setup` routes on that port are authenticated as of sprint entry 2, so the
split is defence in depth rather than the only thing holding them shut. See
`deploy/lightsail/README.md`.

---

## Historical: Oracle VM notes (superseded)

## Prerequisites on the VM

- Ubuntu 24.04 aarch64 (Oracle's Ampere A1 shape).
- Docker Engine + the Compose plugin:
  ```bash
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"   # log out/in (or `newgrp docker`) to pick this up
  docker compose version            # confirm the plugin is present
  ```
- This repo cloned to the VM (`git clone <repo-url>`), on the `274`-targeting branch/commit.

## One-time setup on the VM

1. **Front server env.** `deploy/lightsail/provision.ps1` generates the box's `secrets/server.env`,
   including both 48-character engine secrets, and that is the supported path. To provision a box
   by hand instead, copy `server/.env.example` to `server/.env` and fill `OWNER_ASSERTION_SECRET`
   and `ENGINE_MANAGEMENT_SECRET` (32 characters minimum, and the same values the engine service
   reads). There is no
   separate production template on purpose: it drifted from the generator within one release (audit
   C17, decision D96). `docker-compose.yml` loads this via `env_file` for `OWNER_ASSERTION_SECRET`,
   `ENGINE_MANAGEMENT_SECRET` and `FIREBASE_PROJECT_ID`; it overrides `ENGINE_HTTP`/`ENGINE_WS`/`GOOGLE_APPLICATION_CREDENTIALS`/
   `FIREBASE_EMULATORS`/`PUBLIC_ORIGIN` itself regardless of what's in this file, so its
   container-topology values (127.0.0.1 ports, emulators) don't matter here -- only the three
   above are actually consumed.

2. **Firebase admin key.** Place the service account JSON at `server/secrets/firebase-admin.json`
   (git-ignored; never commit it). `docker-compose.yml` mounts it into the `server` container as
   a Docker secret at `/run/secrets/firebase-admin.json`, never bakes it into an image layer.

3. **Compose env file.** Copy `deploy/docker/.env.example` to `deploy/docker/.env` and fill in:
   - `ENGINE_SHA`, `CONTENT_SHA` -- copy verbatim from `scripts/upstream.lock` (the `engine/server`
     and `engine/content` lines).
   - The five `VITE_FIREBASE_*` values -- same values as `web/.env.example`.
   - `PUBLIC_ORIGIN` -- defaults to `https://osrs.scotho.com`; only change if the domain moves.
   - `CLOUDFLARE_TUNNEL_TOKEN` -- from the Cloudflare Zero Trust dashboard: **Networks > Tunnels
     > idlescape > Configure**, the token shown for a token-based connector. This is the same
     `idlescape` tunnel the PC deploy uses (id `00000000-0000-0000-0000-000000000000`), just run
     here as a second, dashboard-managed connector instead of the PC's locally-managed
     `config.yml` + credentials-file connector.
   - **Dashboard-side ingress**, set once in the same dashboard screen (or under the tunnel's
     Public Hostname tab): route `osrs.scotho.com` to `http://server:8787` -- that hostname
     inside the compose network resolves to the `server` container, not `localhost`. This is
     what actually decides where traffic goes for a token-based tunnel; nothing in
     `docker-compose.yml` configures ingress.

   `deploy/docker/.env` is git-ignored (covered by the root `.gitignore`'s `.env` pattern) --
   never commit it.

4. **Cutover ordering**, same caution as `deploy/windows/install-tunnel.ps1`: the `idlescape`
   tunnel can run more than one connector concurrently, but every connector should agree on
   ingress. Before pointing this VM's connector at `osrs.scotho.com`, stop the PC's
   `idlescape-tunnel` scheduled task (or update its ingress to match) so the two connectors
   don't disagree about where `osrs.scotho.com` traffic goes.

## Build and run

```bash
cd deploy/docker

# 1. Syntax/interpolation check -- catches a missing/misspelled .env value before any build
#    (every ${VAR:?...} in docker-compose.yml fails this step loudly if unset). No build, no
#    containers. This is the check called out in the task brief; run it first.
docker compose config

# 2. Build. The engine image clones Engine-TS + Content at the pinned shas and packs the cache
#    at build time (tools/pack/Build.ts) -- this is the slow step, several minutes on ARM (aarch64
#    Ampere). The server image builds the client (Bun) and web (npm/Vite) from source and also
#    clones a slice of Engine-TS for its public/client fallback companions.
docker compose build

# 3. Run, detached.
docker compose up -d

# 4. Confirm end-to-end through the tunnel (not localhost -- no host ports are published):
curl https://osrs.scotho.com/api/health
```

`docker compose logs -f engine` while waiting on step 2/3 is useful the first time: the engine
prints `World ready` once the pack + startup sequence finishes (mirrors what
`scripts/start-stack.ps1` polls for in local dev).

## What each file does

- **`engine.Dockerfile`** -- Node 24 + tsx (`npm install`, `npx tsx src/app.ts`), NOT Bun. Clones
  `LostCityRS/Engine-TS` and `LostCityRS/Content` at branch `274`, pinned to `ENGINE_SHA`/
  `CONTENT_SHA` (build args, from `scripts/upstream.lock`). Writes
  `data/config/world.json` from `world.json.template` (web.port `8899` internal-only,
  `allowedOrigin` = `PUBLIC_ORIGIN`, `node.production` true, login/friend/logger off, sqlite
  backend), packs the cache at build time, and at container start runs
  `npx prisma migrate deploy --schema prisma/singleworld/schema.prisma` before
  `npx tsx src/app.ts` (idempotent -- safe against both a fresh `db.sqlite` and one restored from
  the `engine-db` volume with real player data in it). No Java: the 274 content pack doesn't
  need it (an earlier bun-based draft of this file installed `openjdk-17-jre-headless`; dropped).

- **`server.Dockerfile`** -- multi-stage. Builds the game client fork (Bun, `client/` ->
  `client/out`, verified to include `client.js`, `ondemandworker.js` -- the 274 OnDemandWorker
  chunk -- and `tinymidipcm.wasm`) and the front web app (npm/Vite, `web/` -> `web/dist`, with the
  five `VITE_FIREBASE_*` build args and `VITE_USE_FIREBASE_EMULATORS` forced `false`) in separate
  stages, plus a third stage that clones the pinned Engine-TS sha just far enough to grab its
  `public/client/` fallback companions (`static.ts` falls back to these for anything
  `client/out` doesn't produce, e.g. the sf2 soundfont), plus a fourth (`wiki-build`) that clones
  `LostCityRS/Content` at `CONTENT_SHA` and runs `bun run extract && bun run build` in `wiki/` to
  produce `wiki/build/wiki.db`. The runtime stage is Bun, running
  `server/src/index.ts`, with those four build outputs copied into a layout
  (`/app/server`, `/app/web/dist`, `/app/client/out`, `/app/engine/server/public/client`,
  `/app/wiki/build/wiki.db`) that
  matches `server/src/env.ts`'s relative-path defaults, so no `WEB_DIST`/`CLIENT_OUT`/
  `ENGINE_PUBLIC`/`WIKI_DB` overrides are needed in compose.

- **`docker-compose.yml`** -- `engine` (built, unpublished), `server` (built, internal, talks to
  the engine over `http://engine:8899` / `ws://engine:8899`), `cloudflared` (token-based tunnel
  run). No `ports:` on any service -- only `cloudflared` reaches the internet, outbound. The
  Firebase admin key is a Docker secret (`/run/secrets/firebase-admin.json`), never baked into an
  image layer; `OWNER_ASSERTION_SECRET`/`ENGINE_MANAGEMENT_SECRET`/`FIREBASE_PROJECT_ID` come from `server/.env` via
  `env_file`. `engine-db` is a named volume over `/opt/engine/server/db.sqlite` (the sqlite file
  the engine opens by a hardcoded relative path) so game state survives `docker compose down`/
  `up` and image rebuilds.

- **`world.json.template`** -- the engine's `data/config/world.json`, with the public origin
  templated in (`__WEB_ALLOWED_ORIGIN__`, substituted by `engine.Dockerfile` via `sed` at build
  time from the `WEB_ALLOWED_ORIGIN` build arg, which compose sets from `PUBLIC_ORIGIN`). Kept as
  its own file rather than inlined in the Dockerfile via a heredoc, since Dockerfile `RUN`
  instructions don't reliably support multi-line heredocs without opting into BuildKit-specific
  syntax, and an unknown Docker version on a not-yet-provisioned VM is exactly the kind of thing
  not to gamble on here.

- **`.env.example`** -- template for `deploy/docker/.env` (compose variable interpolation: build
  args, `PUBLIC_ORIGIN`, the tunnel token). Distinct from `server/.env` (runtime env for the front
  server process) -- the VM needs both.

## Notes

- **This supersedes the PC deploy.** Once this stack is confirmed healthy on the VM and the
  tunnel cutover (step 4 above) is done, `deploy/windows/`'s scheduled tasks and locally-managed
  tunnel config are no longer the live path for `osrs.scotho.com`.
- **Secrets are never baked into an image.** The Firebase admin key is a Docker secret (a
  bind-mounted file at container start); `OWNER_ASSERTION_SECRET`/`ENGINE_MANAGEMENT_SECRET`/`CLOUDFLARE_TUNNEL_TOKEN`
  are environment values from `server/.env` / `deploy/docker/.env`, both git-ignored and created
  by the operator on the VM, not committed anywhere in this repo.
- **`docker compose config` will fail if `deploy/docker/.env` is incomplete** -- every build arg
  and the tunnel token use `${VAR:?message}` interpolation, which is a hard error (not a silent
  empty string) when the variable is unset. That's intentional: it turns the "syntax check" step
  into a completeness check for the one file most likely to have a typo'd or missing value.
- **The server image carries the wiki.** It now ships the wiki reader database, about 132 MiB of
  layer. That is deliberate (audit C09): before it, `/wiki` returned 503 in production forever and
  the release gate's `wiki` field could never go green. The stage also clones
  `LostCityRS/Content` a second time per image build, since the engine image clones it too; the
  cost is build time and bandwidth on the box rather than image size, and `--filter=blob:none` is
  the mitigation if it starts to hurt (`--depth 1` is not, because the checkout is a pinned sha
  and not the branch tip). The box is a `small_3_0` Lightsail bundle, so check free disk before a
  release that also keeps an old image around, and note that memory rather than disk is the likelier
  way a build on the box dies: `deploy/lightsail/README.md`'s **Memory** note carries the measured
  peaks and what to do about them.
- **Engine build time.** Packing the cache (`npx tsx tools/pack/BuildOverlay.ts` inside
  `engine.Dockerfile`, the engine overlay's own entry point rather than upstream's
  `npm run build`, for the reason `scripts/setup.ps1` gives) is the slow step -- budget several minutes on the VM's ARM (aarch64 Ampere) cores, same order of
  magnitude as the "~7 min" first-pack cost `scripts/setup.ps1` calls out for local dev.
