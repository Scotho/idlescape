#!/bin/bash
# Tail the compose stack's logs (all services, including the public connector if running).
set -euo pipefail
cd /opt/idlescape/src/deploy/docker
exec docker compose --env-file /opt/idlescape/secrets/compose.env --profile public logs --tail "${1:-60}"
