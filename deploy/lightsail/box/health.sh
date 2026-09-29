#!/bin/bash
# Print the front server's /api/health JSON, fetched from inside the server container.
set -euo pipefail
cd /opt/idlescape/src/deploy/docker
exec docker compose --env-file /opt/idlescape/secrets/compose.env exec -T server \
  bun -e 'fetch("http://localhost:8787/api/health").then(r => r.text()).then(t => console.log(t))'
