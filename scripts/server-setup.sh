#!/usr/bin/env bash
# One-time VPS preparation: Docker, firewall, folder layout.
# Run as root on the VPS: bash server-setup.sh
set -euo pipefail

echo "== Base packages =="
apt-get update -qq && apt-get install -y -qq curl rsync

echo "== Installing Docker =="
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

echo "== Firewall =="
if ! command -v ufw >/dev/null; then
  apt-get update && apt-get install -y ufw
fi
ufw allow OpenSSH
ufw allow 80/tcp          # HTTP (redirects to HTTPS)
ufw allow 443/tcp         # HTTPS
ufw allow 443/udp         # HTTP/3
ufw allow 3478/tcp        # TURN relay
ufw allow 3478/udp        # TURN relay
ufw allow 40000:40003/udp # WebRTC media
ufw allow 40000:40003/tcp # WebRTC media, for networks that block UDP
ufw allow 49160:49189/udp # TURN relay range
ufw --force enable

echo "== Folder layout =="
mkdir -p /opt/fossstudio/releases /opt/fossstudio/data

echo "== Done =="
echo "Next: put the .env file at /opt/fossstudio/.env, then run scripts/deploy.sh from the dev machine."
