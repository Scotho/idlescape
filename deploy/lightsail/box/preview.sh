#!/bin/bash
# Expose the front server on the box's loopback:18787 via a socat sidecar on the compose network,
# for an ssh -L port-forward from the operator's PC. Usage: preview.sh [stop]
set -euo pipefail
docker rm -f idlescape-preview >/dev/null 2>&1 || true
if [ "${1:-}" = "stop" ]; then echo "preview stopped"; exit 0; fi
docker run -d --rm --name idlescape-preview --network idlescape_internal \
  -p 127.0.0.1:18787:18787 alpine/socat TCP-LISTEN:18787,fork,reuseaddr TCP:server:8787 >/dev/null
echo "preview listening on 127.0.0.1:18787 (box)"
