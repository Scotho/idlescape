#!/bin/bash
# Start the public cloudflared connector (compose profile "public"). Called by cutover.ps1.
set -euo pipefail
cd /opt/idlescape/src/deploy/docker
exec docker compose --env-file /opt/idlescape/secrets/compose.env --profile public up -d cloudflared
