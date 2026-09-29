#!/bin/bash
# Unpack /opt/idlescape/release.tgz into a fresh src/ (previous tree kept as src.old until the
# next release). Usage: extract.sh <commit-sha>
set -euo pipefail
ROOT=/opt/idlescape
SHA="${1:?commit sha required}"
rm -rf "$ROOT/src.new"
mkdir -p "$ROOT/src.new"
tar -xzf "$ROOT/release.tgz" -C "$ROOT/src.new"
echo "$SHA" > "$ROOT/src.new/.release-sha"
rm -rf "$ROOT/src.old"
if [ -d "$ROOT/src" ]; then mv "$ROOT/src" "$ROOT/src.old"; fi
mv "$ROOT/src.new" "$ROOT/src"
rm -f "$ROOT/release.tgz"
echo "extracted $SHA to $ROOT/src"
