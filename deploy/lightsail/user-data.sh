#!/bin/sh
# deploy/lightsail/user-data.sh -- cloud-init for the idlescape Lightsail box (Ubuntu 24.04).
# Runs once as root on first boot. provision.ps1 passes it via --user-data and waits for
# /opt/idlescape/.bootstrap-done before pushing secrets.
#
# POSIX sh, not bash: Lightsail prepends its own preamble and runs the whole thing with /bin/sh
# (dash on Ubuntu), so bash-only options like `set -o pipefail` abort the script before line 1.
# Verify changes with `sudo sh user-data.sh` on a box, never `bash`.
set -eux
export DEBIAN_FRONTEND=noninteractive

# 4 GB swap: the engine image build packs the game cache, which can spike past the box's 2 GB.
if ! swapon --show --noheadings | grep -q '^/swapfile'; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Docker Engine + compose plugin (official convenience script).
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
usermod -aG docker ubuntu

# Keep container logs bounded on the 60 GB disk.
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }
EOF
systemctl restart docker

mkdir -p /opt/idlescape/secrets /opt/idlescape/src
chown -R ubuntu:ubuntu /opt/idlescape
chmod 700 /opt/idlescape/secrets

touch /opt/idlescape/.bootstrap-done
