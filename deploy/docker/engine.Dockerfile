# deploy/docker/engine.Dockerfile -- the 274 Lost City engine (LostCityRS/Engine-TS), for the
# Oracle VM compose stack (deploy/docker/docker-compose.yml). UNPUBLISHED service: no host
# ports, reached only by the `server` container over the compose-internal network.
#
# 274 ADAPTATION (this file intentionally diverges from an earlier bun-based draft of this
# Dockerfile): the 274 engine runs on Node 24 + tsx via npm, NOT Bun -- `FROM oven/bun:1.4` and
# `bun run src/app.ts` are stale, 225-era assumptions. There is also no Java dependency for the
# 274 content pack (an earlier draft installed openjdk-17-jre-headless; not needed here).
#
# This stage clones Engine-TS and Content itself, at the shas pinned in scripts/upstream.lock,
# rather than relying on a host-side engine/ checkout -- engine/ is gitignored in this repo
# (and excluded from the docker build context by the root .dockerignore), so on a fresh clone
# of this repo it usually will not exist yet. Passing ENGINE_SHA/CONTENT_SHA as build args also
# means this image is reproducible independent of whatever an operator has locally checked out.

FROM node:24-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt

ARG ENGINE_SHA
ARG CONTENT_SHA
# Must equal the front server's PUBLIC_ORIGIN exactly (protocol + host, no trailing slash) --
# the 274 engine's WebSocket upgrade handler rejects any Origin header that doesn't match
# web.allowedOrigin below. deploy/docker/README.md carries the same constraint for the PC deploy;
# it used to be stated in server/.env.production.example, which was deleted (audit C17, D96).
ARG WEB_ALLOWED_ORIGIN=https://osrs.scotho.com

RUN if [ -z "$ENGINE_SHA" ]; then echo "ENGINE_SHA build arg is required (see scripts/upstream.lock)" >&2; exit 1; fi
RUN if [ -z "$CONTENT_SHA" ]; then echo "CONTENT_SHA build arg is required (see scripts/upstream.lock)" >&2; exit 1; fi

# Branch 274, then pin to the exact recorded sha (mirrors scripts/setup.ps1's clone-then-pin
# sequence, which exists because a shallow/branch clone can drift as upstream moves the branch
# tip -- pinning after clone guarantees the recorded sha, not "whatever 274 pointed to today").
RUN git clone --single-branch -b 274 https://github.com/LostCityRS/Engine-TS engine/server \
 && git -C engine/server checkout -q -f "${ENGINE_SHA}" \
 && git clone --single-branch -b 274 https://github.com/LostCityRS/Content engine/content \
 && git -C engine/content checkout -q -f "${CONTENT_SHA}"

# Custom content overlay (content-custom/** over engine/content/), before the pack -- mirrors
# scripts/content-overlay.ps1's copy semantics (every real file under content-custom/<subdir>/
# copied on top of the matching engine/content/<subdir>/ path; manifest.json/.gitkeep/README are
# bookkeeping, not content, and are skipped). It is NOT a no-op: content-custom/manifest.json
# lists pack/varp.pack and scripts/interface_bank/configs/banktab.varp, the nine bank-tab varps
# the original 2004 cache does not have. That is why the pack step at the bottom of this file is
# the overlay's own entry point and not `npm run build` -- see the comment there.
COPY content-custom /tmp/content-custom
RUN find /tmp/content-custom -type f ! -name '.gitkeep' ! -name 'manifest.json' ! -iname 'README*' -print | \
    while IFS= read -r f; do \
      rel=${f#/tmp/content-custom/}; \
      mkdir -p "/opt/engine/content/$(dirname "$rel")"; \
      cp "$f" "/opt/engine/content/$rel"; \
    done \
 && rm -rf /tmp/content-custom

# Custom engine overlay (engine-custom/** over engine/server/), after the checkout so the clone
# is pristine underneath it -- the same order scripts/setup.ps1 uses locally. Copy semantics
# mirror scripts/engine-overlay.ps1 exactly: every real file at depth 2 or deeper under
# engine-custom/ lands on the matching engine/server/ path, root-level bookkeeping files are
# never copied at all, and README.md / PATCHES.md / manifest.json / .gitkeep are skipped at any
# depth. Without this the deployed image is stock Lost City 274 -- no owner bank, no management
# routes, no staff allow-list, and an owner assertion nothing verifies (audit C07).
COPY engine-custom /tmp/engine-custom
RUN find /tmp/engine-custom -mindepth 2 -type f \
      ! -name 'README.md' ! -name 'PATCHES.md' ! -name 'manifest.json' ! -name '.gitkeep' -print | \
    while IFS= read -r f; do \
      rel=${f#/tmp/engine-custom/}; \
      mkdir -p "/opt/engine/server/$(dirname "$rel")"; \
      cp "$f" "/opt/engine/server/$rel"; \
    done

# The image's stand-in for engine-overlay.ps1's manifest check, and it must be capable of
# failing: every path engine-custom/manifest.json claims is asserted present in the clone. A COPY
# that silently lands nothing is precisely the C07 failure, so it fails the build, not the world.
#
# Existence is enough for the 29 `new` paths, which a pristine clone does not have. It proves
# NOTHING for the five `replace` paths, because upstream ships a file at every one of them: an
# image whose replaces did not land would satisfy an existence check with upstream's own copy and
# build green, and the release gate cannot see the difference either (decision D75). So each of
# the five is asserted by CONTENT as well, with the grep engine-custom/PATCHES.md already records
# for it, section "Verifying the patches are still applied":
#
#   src/app.ts                         the import that ROOTS the overlay's module graph
#   src/web.ts                         the owner-bank management routes, the narrowed bind, and
#                                      the guard that puts upstream's /setup* routes behind the
#                                      shared secret (audit C07)
#   src/server/ClientSocket.ts         the owner header carried off the socket
#   src/engine/entity/PlayerLoading.ts the owner-bank migration on login
#   src/server/login/LoginThread.ts    the staff allow-list that replaces staffmodlevel = 4
#
# Keep these in step with PATCHES.md. A grep that stops matching after an upstream bump is a build
# failure with a name on it, which is the point.
RUN node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('/tmp/engine-custom/manifest.json','utf8'));const miss=m.files.map(f=>f.path).filter(p=>!fs.existsSync('/opt/engine/server/'+p));if(miss.length){console.error('engine overlay incomplete, missing: '+miss.join(', '));process.exit(1)}console.log('engine overlay: '+m.files.length+' manifest path(s) present')" \
 && grep -q "import '#/idlescape/install.js';" /opt/engine/server/src/app.ts \
 && grep -qF "registerOwnerBankRoutes(management);" /opt/engine/server/src/web.ts \
 && grep -qF "registerSetupGuard(management);" /opt/engine/server/src/web.ts \
 && grep -qF "host: idlescapeConfig.managementHost" /opt/engine/server/src/web.ts \
 && grep -qF "ownerHeader: string | null = null;" /opt/engine/server/src/server/ClientSocket.ts \
 && grep -qF "banks.migrate(ownerKey, safeName, pendingBank)" /opt/engine/server/src/engine/entity/PlayerLoading.ts \
 && grep -qF "staffLevelFor(username, Environment.node.production" /opt/engine/server/src/server/login/LoginThread.ts \
 && rm -rf /tmp/engine-custom

WORKDIR /opt/engine/server

# 274 is Node/npm (tsx), not Bun -- see scripts/setup.ps1's "engine (Node/tsx, not Bun)" comment
# and engine/server/package.json's "engines": { "node": ">=24" }.
RUN npm install

# data/config/world.json (read by src/util/WorldConfig.ts) is gitignored upstream and absent
# from a fresh clone; WorldConfig.ts falls back to defaults (or a legacy .env migration, which
# we don't want to depend on) when it's missing. Write it directly instead:
#   - web.port 8899 stays internal-only -- this service publishes no host ports, only `server`
#     reaches it, over the compose-internal network at http://engine:8899 / ws://engine:8899.
#   - web.allowedOrigin is the public origin (see WEB_ALLOWED_ORIGIN above).
#   - node.production true, node.debug false.
#   - login/friend/logger servers off -- single-process world, same as the PC deploy
#     (deploy/windows/register-tasks.ps1) and local dev (scripts/setup.ps1).
#   - db.backend sqlite -- db.sqlite is a symlink into the `engine-db` volume at /opt/engine/data
#     (see the CMD at the bottom); src/db/query.ts opens it by the hardcoded relative path.
COPY deploy/docker/world.json.template /tmp/world.json.template
# A world.json carrying a "verify" key is a path from this image to an obj-id renumbering. The
# process it reaches is the CMD at the bottom, `npx tsx src/app.ts`, whose boot-time packAll runs
# with build.verify at its DEFAULT of true: a missing name throws there instead of renumbering,
# and a world.json that flipped verify to false would take that safety away. It is not the RUN
# below; tools/pack/BuildOverlay.ts sets Environment.build.verify itself and never reads this
# file. Both packAll paths now also check the pinned id table (engine-custom/PATCHES.md), so this
# clause is the second lock rather than the only one.
# world.json.template has no build key today; this fails the image build the day one appears.
# `! grep -q` exits 0 when the string is absent, which is what the && chain needs; `grep -c` would
# exit 1 on a count of zero and fail the build in the healthy case.
RUN mkdir -p data/config \
 && sed "s#__WEB_ALLOWED_ORIGIN__#${WEB_ALLOWED_ORIGIN}#" /tmp/world.json.template > data/config/world.json \
 && rm /tmp/world.json.template \
 && cat data/config/world.json \
 && ! grep -q '"verify"' data/config/world.json

# Pack the cache at build time so the first container start doesn't have to; this is the
# several-minutes-on-ARM step the README warns about. app.ts also auto-packs on boot if this is
# somehow skipped/incomplete (see its OnDemand.cache.count check), so a partial build here fails
# safe rather than serving a broken world silently.
#
# This is the OVERLAY's entry point, not upstream's `npm run build` (tools/pack/Build.ts) --
# exactly the substitution scripts/setup.ps1:128 makes locally, and for the same reason:
# content-custom adds varps the original 2004 cache does not have, so upstream's pack aborts
# with ".varp checksum mismatch!" unless build.verify is off, and this world cannot set that
# through BUILD_VERIFY because loadWorldConfig() ignores the environment once data/config/
# world.json exists (written just above). BuildOverlay.ts turns the flag off in-process and
# keeps the pack-ID guard, exiting non-zero if any *.pack file was renumbered. It arrives with
# the engine overlay copied in above; before that copy existed this line was `npm run build`,
# which could only ever pack a cache the shipped client does not match.
RUN npx tsx tools/pack/BuildOverlay.ts

EXPOSE 8899

# sqlite schema lives in migrations (engine/server/prisma/singleworld/migrations/), applied via
# Prisma against the file the code opens directly (src/db/query.ts's `DatabaseSync('db.sqlite')`,
# a relative path resolved against this WORKDIR; the Prisma schema points at the same file as
# `file:../../db.sqlite`). Persistent state lives in the `engine-db` named volume, mounted at
# /opt/engine/data (a DIRECTORY -- Docker cannot mount a named volume at a file path; it would
# create a directory named db.sqlite, which Prisma then rejects as an invalid database). At start
# we make sure the real file exists in the volume, symlink db.sqlite to it, then run
# `migrate deploy` (only applies pending migrations; safe on every boot, including against a
# volume with a real game in it) before the engine.
VOLUME ["/opt/engine/data"]
CMD ["sh", "-c", "mkdir -p /opt/engine/data && touch /opt/engine/data/db.sqlite && ln -sfn /opt/engine/data/db.sqlite db.sqlite && npx prisma migrate deploy --schema prisma/singleworld/schema.prisma && npx tsx src/app.ts"]
