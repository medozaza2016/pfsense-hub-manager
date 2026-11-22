#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

PROJECT_DIR=/opt/pfsense-hub
cd "$PROJECT_DIR"

if [[ $EUID -ne 0 ]]; then
  echo "Run this installer with sudo: sudo bash scripts/install-linux.sh" >&2
  exit 1
fi
if [[ "$(git branch --show-current)" != "feature/multi-site-onboarding" ]]; then
  echo "Unexpected Git branch. Check out feature/multi-site-onboarding first." >&2
  exit 1
fi
if [[ -e .env || -e secrets/pfsense_api_key || -e secrets/runtime/app_encryption_key ]]; then
  echo "Existing configuration or secret files detected. Refusing to overwrite them." >&2
  exit 1
fi
command -v docker >/dev/null
docker compose version >/dev/null

mkdir -p secrets/runtime certs
chmod 700 secrets secrets/runtime
DB_PASSWORD=$(openssl rand -hex 32)
APP_KEY=$(openssl rand -hex 32)

: > secrets/pfsense_api_key
printf '%s\n' "$APP_KEY" > secrets/runtime/app_encryption_key

chown 1000:1000 secrets/pfsense_api_key secrets/runtime/app_encryption_key
chmod 400 secrets/pfsense_api_key secrets/runtime/app_encryption_key

cat > .env <<EOF
POSTGRES_DB=pfsense_hub
POSTGRES_USER=pfsense_hub
POSTGRES_PASSWORD=$DB_PASSWORD
PFSENSE_DEVICE_ID=
PFSENSE_DEVICE_NAME=
PFSENSE_DEVICE_LOCATION=
PFSENSE_EDITION=unknown
PFSENSE_API_BASE_URL=
PFSENSE_API_TIMEOUT_MS=10000
HUB_AGENT_API_PORT=3001
HUB_DEPLOYMENT_AGENT_TOKEN=
HUB_DEPLOYMENT_AGENT_SOCKET=
HUB_AGENT_GID=2000
HUB_ACCESS_DEPLOYMENT_ENABLED=false
HUB_BIND_ADDRESS=127.0.0.1
WEB_PORT=8080
PFSENSE_CA_FILE=
EOF
unset DB_PASSWORD
chmod 600 .env
chown root:root .env

echo
echo "APPLICATION ENCRYPTION RECOVERY KEY, SAVE THIS IN YOUR PASSWORD MANAGER:"
echo "$APP_KEY"
unset APP_KEY
echo
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=40 api web

echo
echo "Deployment started. The Hub UI is bound to 127.0.0.1:8080."
echo "Create the first administrator account in the GUI, then register firewalls using Administration > Add Site."
