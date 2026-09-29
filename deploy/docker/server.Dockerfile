# deploy/docker/server.Dockerfile -- the front server (server/), the only service in the
# compose stack (deploy/docker/docker-compose.yml) reachable from outside the internal network,
# and even it isn't published on a host port: only the `cloudflared` container reaches it, over
# the compose-internal network, at http://server:8787.
#
# Multi-stage: build the game client (Bun, client/ -> client/out, including the 274
# OnDemandWorker chunk) and the front web app (npm/Vite, web/ -> web/dist) from source in
# separate stages, fetch the engine's public/client fallback companions (deps/soundfont) in a
# third stage, extract and build the wiki reader database in a fourth, then assemble a Bun
# runtime image that only contains the front server's own source plus those four build outputs
# -- no engine source, no client/web devDependencies.

# --- stage: client (Bun -> client/out, incl. ondemandworker.js) -------------------------------
FROM oven/bun:1 AS client-build
WORKDIR /build/client
COPY client/package.json client/bun.lock* ./
RUN bun install
COPY client/ ./
RUN bun run build
# Fails the build (not just at runtime) if the 274 client artifacts are missing, matching
# scripts/build.ps1's post-build check for the same three files.
RUN test -f out/client.js && test -f out/ondemandworker.js && test -f out/tinymidipcm.wasm
# The other half of that mirror. scripts/build.ps1 also asserts that the terser `reserved` list in
# client/bundle.ts survived minification, and build.ps1 never runs on this path: release.ps1 ships
# `git archive HEAD` and the bundle that reaches production is the one this stage just built. A
# name that falls out of that list is mangled, and for an INPUT field name such as optionIndex the
# action then dispatches with the field dropped (client/PATCHES.md, patch 21). So the same two
# assertions run here: first that the artifact really is minified, because the name check proves
# nothing against a dev bundle, then that every reserved hook name is still present. terser emits
# the whole bundle on one unterminated line, which `wc -l` reports as 0, so awk counts it; a dev
# bundle averages about 32 bytes per line and the floor of 200 sits between the two.
RUN lines=$(awk 'END { print NR }' out/client.js); bytes=$(wc -c < out/client.js); \
    if [ "$lines" -eq 0 ] || [ $((bytes / lines)) -lt 200 ]; then \
        echo "out/client.js is a dev (unminified) bundle; this stage must run 'bun run build', not build:dev" >&2; \
        exit 1; \
    fi; \
    for name in optionIndex armLogin loginArmed setRenderSuspended setAttended getObjIcon getObjInfo; do \
        grep -q "$name" out/client.js || { \
            echo "the minified client bundle no longer contains $name; check the terser reserved list in client/bundle.ts" >&2; \
            exit 1; \
        }; \
    done; \
    echo "minified bundle: 7 reserved hook name(s) survived ($((bytes / lines)) bytes/line)"

# --- stage: web (npm/Vite -> web/dist) ---------------------------------------------------------
FROM node:24-slim AS web-build
WORKDIR /build/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
# Vite inlines these at build time (import.meta.env.VITE_*, see web/src/firebase.ts) -- they are
# public client-side config (Firebase web SDK keys), not secrets; VITE_USE_FIREBASE_EMULATORS is
# forced false regardless of the build arg default, since this image only ever ships to
# production (see docker-compose.yml's build args for the values).
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY} \
    VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN} \
    VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID} \
    VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID} \
    VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID} \
    VITE_USE_FIREBASE_EMULATORS=false
RUN npm run build

# --- stage: engine's public/client companions (deps.js, soundfont) -----------------------------
# engine/ is gitignored in this repo and excluded from the build context (root .dockerignore),
# so these can't come from a COPY of a host checkout -- clone just enough of Engine-TS at the
# same pinned sha the engine service uses to grab its shipped public/client directory. static.ts
# falls back to this directory for anything client/out doesn't produce (e.g. the sf2 soundfont).
FROM node:24-slim AS engine-public
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ARG ENGINE_SHA
RUN if [ -z "$ENGINE_SHA" ]; then echo "ENGINE_SHA build arg is required (see scripts/upstream.lock)" >&2; exit 1; fi
WORKDIR /opt
RUN git clone --single-branch -b 274 https://github.com/LostCityRS/Engine-TS engine-src \
 && git -C engine-src checkout -q -f "${ENGINE_SHA}"

# --- stage: wiki (Bun -> wiki/build/wiki.db) ---------------------------------------------------
# The wiki corpus is extracted from engine/content, which is gitignored, excluded from the build
# context, and absent from the `git archive HEAD` tree the box builds from. wiki/data/*/loc-spawns.json
# (113 MB) and wiki/build/wiki.db (138 MB) are gitignored too, so neither the inputs nor the output
# can be COPYed: this stage clones Content at the same pinned sha the engine image uses and runs the
# extract itself. WORKDIR is /build and not /build/wiki because wiki/gen/paths.ts resolves ROOT two
# directories above wiki/gen, and assertContentPinned compares the clone's HEAD against
# scripts/upstream.lock, so both must sit under one root. The clone carries only the packs upstream
# tracks; the packer-generated ones (category.pack among them) are absent, and extract.ts treats
# category.pack as optional for exactly this stage.
#
# content-custom/ is deliberately not copied in, so extract.ts's assertOverlayNotWikiVisible check
# short-circuits here: the guard that a wiki-visible overlay file fails the build lives in
# scripts/build.ps1's step 1c, not in this stage.
FROM oven/bun:1 AS wiki-build
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ARG CONTENT_SHA
RUN if [ -z "$CONTENT_SHA" ]; then echo "CONTENT_SHA build arg is required (see scripts/upstream.lock)" >&2; exit 1; fi
WORKDIR /build
# --depth 1 is not available: the checkout is a pinned sha, not the branch tip.
RUN git clone --single-branch -b 274 https://github.com/LostCityRS/Content engine/content \
 && git -C engine/content checkout -q -f "${CONTENT_SHA}"
COPY scripts/upstream.lock ./scripts/upstream.lock
COPY wiki/package.json wiki/bun.lock* ./wiki/
RUN cd wiki && bun install
COPY wiki/ ./wiki/
RUN cd wiki && bun run extract && bun run build
# The same floor scripts/build.ps1 asserts: a truncated or killed build leaves a file that exists
# and answers nothing, and server/src/wiki/db.ts would open it and 503 forever without saying why.
RUN test -s /build/wiki/build/wiki.db \
 && [ "$(stat -c%s /build/wiki/build/wiki.db)" -gt 33554432 ]

# --- stage: runtime (Bun) -----------------------------------------------------------------------
FROM oven/bun:1 AS runtime
WORKDIR /app/server

COPY server/package.json server/bun.lock* ./
RUN bun install --production

COPY server/src ./src

# Directory layout under /app mirrors the repo's own layout (server/, web/, client/,
# engine/server/) on purpose: server/src/env.ts's WEB_DIST/CLIENT_OUT/ENGINE_PUBLIC defaults
# (../web/dist, ../client/out, ../engine/server/public) are relative to this WORKDIR, so no env
# overrides are needed for them in docker-compose.yml.
COPY --from=client-build /build/client/out /app/client/out
COPY --from=web-build /build/web/dist /app/web/dist
COPY --from=engine-public /opt/engine-src/public/client /app/engine/server/public/client
# server/src/env.ts defaults WIKI_DB to ../wiki/build/wiki.db against this WORKDIR, so the path is
# /app/wiki/build/wiki.db and NO compose override exists. Adding one would be a second statement of
# the same fact that can drift from the first.
COPY --from=wiki-build /build/wiki/build/wiki.db /app/wiki/build/wiki.db

ENV NODE_ENV=production
EXPOSE 8787

CMD ["bun", "run", "src/index.ts"]
