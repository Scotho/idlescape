#!/bin/bash
# Build and start the compose stack from the current src/. Keeps the public cloudflared
# connector running if a previous cutover started it (compose profile "public").
set -euo pipefail
cd /opt/idlescape/src/deploy/docker
ENV_FILE=/opt/idlescape/secrets/compose.env
PROFILE=()
if docker ps --format '{{.Names}}' | grep -q '^idlescape-cloudflared'; then PROFILE=(--profile public); fi
docker compose --env-file "$ENV_FILE" "${PROFILE[@]}" build
docker compose --env-file "$ENV_FILE" "${PROFILE[@]}" up -d --remove-orphans
